import assert from 'node:assert/strict';
import net from 'node:net';

export class InvalidHttpProbe extends Error {}
const forbidden = new Set(['host', 'connection', 'content-length', 'transfer-encoding']);
const rejectStatus = status => status >= 400 && status < 500 && status !== 408 && status !== 429;

function requestSpec(value, bodyRequired = false) {
  if (!value || !/^[A-Z]+$/.test(value.method ?? '') || typeof value.path !== 'string' || !value.path.startsWith('/') || /[\r\n ]/.test(value.path) || value.body !== undefined && typeof value.body !== 'string') throw new InvalidHttpProbe('Provide a local method/path request and a string body.');
  const headers = Object.create(null);
  for (const [key, item] of Object.entries(value.headers ?? {})) {
    const name = key.toLowerCase();
    if (!/^[a-z0-9-]+$/.test(name) || forbidden.has(name) || typeof item !== 'string' || /[\r\n]/.test(item) || Object.hasOwn(headers, name)) throw new InvalidHttpProbe('Use unique safe headers; the host owns request framing.');
    headers[name] = item;
  }
  const body = Buffer.from(value.body ?? '', 'utf8');
  if (body.length > 65536 || bodyRequired && body.length < 2) throw new InvalidHttpProbe('Provide a small, valid request body of 2–65536 bytes.');
  return { method: value.method, path: value.path, headers, body };
}

function exchange(port, spec, incomplete, sent) {
  return new Promise((resolve, reject) => {
    let settled = false, response = '';
    const finish = (error, status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error); else resolve(status);
    };
    const socket = net.connect(port, '127.0.0.1', () => {
      const headers = { ...spec.headers, host: '127.0.0.1', connection: 'close', 'content-length': String(spec.body.length) };
      socket.write(`${spec.method} ${spec.path} HTTP/1.1\r\n${Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`);
      socket.write(incomplete ? spec.body.subarray(0, 1) : spec.body);
      sent();
    });
    const timer = setTimeout(() => finish(new Error('No response to a deterministically invalid header while the body is incomplete.')), 2500);
    socket.on('data', chunk => {
      response += chunk.toString('latin1');
      if (response.length > 65536) return finish(new Error('HTTP response headers exceeded the probe limit.'));
      if (!response.includes('\r\n\r\n')) return;
      const match = /^HTTP\/1\.[01] (\d{3})\b/.exec(response);
      finish(match ? undefined : new Error('Invalid HTTP response.'), match ? Number(match[1]) : undefined);
    });
    socket.on('error', error => finish(error));
    socket.on('end', () => { if (!settled) finish(new Error('Server closed without a response.')); });
  });
}

/** Real loopback transport; the check supplies a valid request and required header names. */
export async function httpHeaderRejectionProbe({ server, request, requiredHeaders, health }, record = () => {}) {
  const valid = requestSpec(request, true), healthy = requestSpec(health);
  if (!server || server.listening || typeof server.listen !== 'function' || typeof server.closeAllConnections !== 'function') throw new InvalidHttpProbe('Provide a new unbound Node HTTP server; the host owns its loopback listener.');
  const names = Array.isArray(requiredHeaders) ? requiredHeaders.map(name => String(name).toLowerCase()) : [];
  if (!names.length || names.length > 8 || new Set(names).size !== names.length || names.some(name => forbidden.has(name) || !Object.hasOwn(valid.headers, name))) throw new InvalidHttpProbe('List 1–8 required headers present on the valid request.');
  const proof = { requiredHeaders: names, baselineStatus: undefined, baselineHealthStatus: undefined, cases: [] };
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
    const port = server.address().port;
    proof.baselineStatus = await exchange(port, valid, false, () => {});
    if (proof.baselineStatus < 200 || proof.baselineStatus >= 300) throw new InvalidHttpProbe('The complete valid request must succeed before testing invalid headers.');
    proof.baselineHealthStatus = await exchange(port, healthy, false, () => {});
    if (proof.baselineHealthStatus < 200 || proof.baselineHealthStatus >= 300) throw new InvalidHttpProbe('The health control request must succeed before testing invalid headers.');
    record(proof);
    for (const name of names) for (const mutation of ['missing', 'invalid']) {
      const headers = { ...valid.headers };
      if (mutation === 'missing') delete headers[name]; else headers[name] = '../invalid';
      const spec = { ...valid, headers };
      const entry = { header: name, mutation, triggered: false };
      proof.cases.push(entry);
      entry.completeStatus = await exchange(port, spec, false, () => {});
      if (!rejectStatus(entry.completeStatus)) throw new InvalidHttpProbe(`Header ${name} is not proven required/invalid by the complete-request control.`);
      entry.incompleteStatus = await exchange(port, spec, true, () => { entry.triggered = true; record(proof); });
      assert.equal(entry.incompleteStatus, entry.completeStatus, 'Header rejection must not depend on completing the request body.');
      entry.healthStatus = await exchange(port, healthy, false, () => {});
      assert.ok(entry.healthStatus >= 200 && entry.healthStatus < 300, 'The server must remain usable after the interrupted invalid request.');
      entry.passed = true;
      record(proof);
    }
    return proof;
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
}
