import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';

export class InvalidMutationProbe extends Error {}
let active = false;
const ioError = () => Object.assign(new Error('Injected mutation-window EIO'), { code: 'EIO' });

/** Trusted fault mechanism; the check supplies only a domain fixture and observable state. */
export async function mutationRecoveryProbe({ scratch, prepare }, record = () => {}) {
  if (active || typeof prepare !== 'function') throw new InvalidMutationProbe('Provide prepare({directory}); mutation probes must run serially.');
  active = true;
  const proof = { baselineMutations: [], cases: [] };
  let root;
  try {
    root = await fs.mkdtemp(join(scratch, 'mutation-probe-'));
    const handle = await fs.open(join(root, 'prototype'), 'w');
    const prototype = Object.getPrototypeOf(handle);
    await handle.close();
    const run = async (index, mode) => {
      const directory = await fs.mkdtemp(join(root, 'case-'));
      const fixture = await prepare({ directory });
      if (!fixture || ['mutate', 'observe', 'recover', 'dispose'].some(key => typeof fixture[key] !== 'function')) {
        throw new InvalidMutationProbe('prepare must return mutate(), observe(), recover(), dispose().');
      }
      const entry = { index, mode, triggered: false, mutations: [] };
      proof.cases.push(entry);
      const restore = [];
      try {
        const before = structuredClone(await fixture.observe());
        let ordinal = 0;
        const patch = (object, key, label, mutating = () => true) => {
          const original = object[key];
          if (typeof original !== 'function') return;
          object[key] = async function (...args) {
            if (!mutating(args)) return original.apply(this, args);
            if (entry.triggered) throw ioError();
            const at = ++ordinal;
            entry.mutations.push(label);
            if (index === at && mode === 'before-effect') {
              entry.triggered = true; record(proof); throw ioError();
            }
            const value = await original.apply(this, args);
            if (index === at && mode === 'after-effect') {
              entry.triggered = true; record(proof);
              // An opened handle must not leak when the injected rejection hides it.
              if (key === 'open') await value.close();
              throw ioError();
            }
            return value;
          };
          restore.push(() => { object[key] = original; });
        };
        for (const key of ['writeFile', 'appendFile', 'rename', 'truncate', 'unlink', 'rm', 'copyFile', 'cp']) patch(fs, key, `fs.${key}`);
        patch(fs, 'open', 'fs.open', args => typeof args[1] === 'string' ? /[wa+]/.test(args[1]) : true);
        for (const key of ['write', 'writeFile', 'appendFile', 'writev', 'truncate']) patch(prototype, key, `handle.${key}`);
        syncBuiltinESMExports();
        try { await fixture.mutate(); entry.acknowledged = true; }
        catch (error) { entry.acknowledged = false; entry.errorCode = String(error?.code ?? error?.name ?? 'Error'); }
        finally { for (const undo of restore.splice(0).reverse()) undo(); syncBuiltinESMExports(); }
        if (!index) {
          if (!entry.acknowledged || !entry.mutations.length || entry.mutations.length > 24) {
            throw new InvalidMutationProbe('Baseline must succeed with 1–24 observable promise filesystem mutations. Unsupported I/O cannot be certified by this probe.');
          }
          proof.baselineMutations = [...entry.mutations];
        } else if (!entry.triggered) throw new InvalidMutationProbe('The selected mutation was not reached; fault coverage is invalid.');
        const after = structuredClone(await fixture.observe());
        if (!index) {
          assert.notDeepEqual(after, before, 'Choose an operation and observable projection that actually change state.');
          entry.expected = after;
        }
        const expected = entry.acknowledged ? proof.cases[0].expected : before;
        entry.beforeRecovery = after;
        record(proof);
        assert.deepEqual(after, expected, 'Visible state disagrees with the operation acknowledgement.');
        await fixture.recover();
        entry.afterRecovery = structuredClone(await fixture.observe());
        record(proof);
        assert.deepEqual(entry.afterRecovery, expected, 'Recovered state disagrees with the operation acknowledgement.');
        entry.passed = true;
        record(proof);
      } finally {
        for (const undo of restore.reverse()) undo();
        syncBuiltinESMExports();
        await fixture.dispose();
      }
    };
    await run(0, 'baseline');
    for (let index = 1; index <= proof.baselineMutations.length; index++) {
      await run(index, 'before-effect');
      await run(index, 'after-effect');
    }
    return proof;
  } finally {
    active = false;
    if (root) await fs.rm(root, { recursive: true, force: true });
  }
}
