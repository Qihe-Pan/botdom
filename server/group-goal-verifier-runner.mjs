import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mutationRecoveryProbe, InvalidMutationProbe } from './group-goal-mutation-probe.mjs';
import { httpHeaderRejectionProbe, InvalidHttpProbe } from './group-goal-http-probe.mjs';

const [modulePath, manifestPath, cwd, scratch, nonce] = process.argv.slice(2);
const results = [];
const checks = JSON.parse(readFileSync(manifestPath, 'utf8')).checks;
const expected = checks.map(check => check.id);
const pending = new Set();
let closed = false;
let protocolError;
try {
  const check = (id, action) => {
    if (closed || !expected.includes(id) || results.some(result => result.id === id) || pending.has(id) || typeof action !== 'function') {
      protocolError = `Invalid, duplicate or late check: ${id}`;
      return Promise.reject(new Error(protocolError));
    }
    pending.add(id);
    return (async () => {
      const startedAt = Date.now();
      let observed = false;
      let disposition;
      let mutationProof;
      let httpProof;
      let probeError;
      let pendingProbe = false;
      const entry = checks.find(item => item.id === id);
      const fail = (kind, message) => { disposition = { kind, message: String(message) }; throw Error(String(message)); };
      try {
        await action({ precondition(value, message = 'The required injection did not occur.') {
          if (value !== true) fail('invalid', message);
          observed = true;
        }, invalid(message) { fail('invalid', message); }, environment(message) { fail('environment', message); },
        async httpHeaderRejection(spec) {
          if (httpProof || pendingProbe) fail('invalid', 'Use one awaited HTTP probe per check.');
          pendingProbe = true;
          try {
            await httpHeaderRejectionProbe(spec, proof => {
              httpProof = proof;
              if (proof.cases.some(item => item.triggered)) observed = true;
            });
          } catch (error) {
            probeError = error;
            if (error instanceof InvalidHttpProbe) fail('invalid', error.message);
            throw error;
          } finally { pendingProbe = false; }
        },
        async mutationRecovery(spec) {
          if (mutationProof || pendingProbe) fail('invalid', 'Use one serial mutationRecovery probe per check.');
          pendingProbe = true;
          try {
            await mutationRecoveryProbe({ scratch, prepare: spec?.prepare }, proof => {
              mutationProof = { baselineMutations: proof.baselineMutations, cases: proof.cases.map(({ index, mode, triggered, acknowledged, passed, errorCode }) => ({ index, mode, triggered, acknowledged, passed, errorCode })) };
              if (proof.cases.some(item => item.triggered)) observed = true;
            });
          } catch (error) {
            probeError = error;
            if (error instanceof InvalidMutationProbe) fail('invalid', error.message);
            throw error;
          } finally { pendingProbe = false; }
        } });
        if (disposition) throw Error(disposition.message);
        if (pendingProbe) fail('invalid', 'Await mutationRecovery before returning.');
        if (probeError) throw probeError;
        if (entry.method === 'mutation-recovery' && (!mutationProof?.baselineMutations.length || !mutationProof.cases.some(item => item.mode === 'after-effect' && item.triggered && item.passed))) fail('invalid', 'This declared mutation-recovery check did not execute the host fault probe.');
        if (entry.method === 'http-header-rejection' && (!httpProof?.cases.length || !httpProof.cases.every(item => item.triggered && item.passed))) fail('invalid', 'This declared HTTP check did not execute the host transport probe.');
        if (checks.find(item => item.id === id).kind === 'fault' && !observed) fail('invalid', 'Fault checks must confirm that the intended operation was actually faulted.');
        results.push({ id, ok: true, durationMs: Date.now() - startedAt, ...(mutationProof ? { mutationRecovery: mutationProof } : {}), ...(httpProof ? { httpHeaderRejection: httpProof } : {}) });
      }
      catch (error) {
        const kind = disposition?.kind ?? (checks.find(item => item.id === id).kind === 'fault' && !observed ? 'invalid' : 'failed');
        results.push({ id, ok: false, kind, durationMs: Date.now() - startedAt, error: String(error?.stack ?? error).slice(0, 6000), ...(mutationProof ? { mutationRecovery: mutationProof } : {}), ...(httpProof ? { httpHeaderRejection: httpProof } : {}) });
      }
      finally { pending.delete(id); }
    })();
  };
  if (checks.every(item => item.module)) {
    for (const entry of checks) await check(entry.id, async context => {
      let module;
      try { module = await import(pathToFileURL(join(dirname(manifestPath), entry.module)).href); }
      catch (error) { return context.invalid(`Cannot load the check module: ${String(error)}`); }
      if (typeof module.verify !== 'function') return context.invalid('A check module must export verify.');
      await module.verify({ cwd, scratch, ...context });
    });
  } else {
    const module = await import(pathToFileURL(modulePath).href);
    if (typeof module.verify !== 'function') throw new Error('Export async function verify({ check, cwd, scratch }).');
    await module.verify({ cwd, scratch, check });
  }
  closed = true;
  if (protocolError || pending.size || results.length !== expected.length) throw new Error(protocolError ?? 'Every declared check must be awaited exactly once.');
} catch (error) {
  closed = true;
  protocolError = String(error?.stack ?? error).slice(0, 6000);
}
const receipt = { nonce, results, ...(protocolError ? { error: protocolError } : {}) };
process.stdout.write(`\nBOTDOM_VERIFICATION_RECEIPT ${JSON.stringify(receipt)}\n`);
process.exitCode = protocolError || results.some(result => !result.ok) ? 1 : 0;
