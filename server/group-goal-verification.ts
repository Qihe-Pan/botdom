import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { cpSync, createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { readdir, lstat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { GroupGoalVerification } from "../shared/group-goal-run.ts";
import type { GoalStepResult } from "./group-goal-run.ts";
import { redactSecretsInText } from "../shared/redact.ts";
import { narrowsNativeTools } from "../shared/tool-scope.ts";

export interface GoalVerificationGate {
  required(): boolean;
  verify(options?: { canReview?: boolean; tasks?: GoalVerificationTask[] }): Promise<GoalVerificationResult>;
}

export interface GoalVerificationTask { id: string; workerId: string; files: string[] }
export interface GoalVerificationResult {
  status: "passed" | "failed" | "blocked";
  detail: string;
  failures?: NonNullable<GroupGoalVerification["failures"]>;
  feedbackFile?: string;
  sourceHash?: string;
  changedFiles?: string[];
}
interface Check { id: string; requirement: string; module?: string; kind?: "behavior" | "fault"; method?: "mutation-recovery" | "http-header-rejection"; taskId?: string; files?: string[] }
interface Receipt { nonce: string; results: Array<{ id: string; ok: boolean; kind?: "failed" | "invalid" | "environment"; error?: string; durationMs?: number }>; error?: string }
interface Snapshot { hash: string; files: Record<string, string> }

export function verificationOwnedFiles(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > 24 || value.some(path => typeof path !== "string" || !path || path.length > 300
    || path.startsWith("/") || /[\\:*?]/.test(path) || [...path].some((char: string) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    || path.split("/").some((part: string) => !part || part === "." || part === ".."))) return undefined;
  return [...new Set(value as string[])];
}

const hash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const PROJECT_MARKERS = ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "build.gradle", "CMakeLists.txt", "Makefile", "requirements.txt"];
const OMIT = new Set([".git", "node_modules", ".venv", "venv", "__pycache__"]);

export async function verificationSnapshot(cwd: string, excluded?: string | readonly string[], cancelled: () => boolean = () => false): Promise<Snapshot> {
  const files: Record<string, string> = {};
  const exclusions = new Set(typeof excluded === "string" ? [excluded] : excluded);
  let bytes = 0, count = 0;
  const walk = async (dir: string) => {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (cancelled()) throw new Error("Verification fingerprint cancelled.");
      const path = join(dir, entry.name);
      if (OMIT.has(entry.name) || exclusions.has(path)) continue;
      if (entry.isSymbolicLink()) throw new Error(`Verification cannot fingerprint a source symlink: ${relative(cwd, path)}`);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const size = (await lstat(path)).size;
        if (bytes + size > 2 * 1024 ** 3 || ++count > 100_000) throw new Error("Workspace exceeds the bounded verification fingerprint limit.");
        const digest = createHash("sha256");
        for await (const chunk of createReadStream(path)) {
          if (cancelled()) throw new Error("Verification fingerprint cancelled.");
          bytes += chunk.length;
          if (bytes > 2 * 1024 ** 3) throw new Error("Workspace exceeds the bounded verification fingerprint limit.");
          digest.update(chunk);
        }
        files[relative(cwd, path)] = digest.digest("hex");
      } else throw new Error(`Unsupported source file: ${relative(cwd, path)}`);
    }
  };
  await walk(cwd);
  return { hash: hash(JSON.stringify(files)), files };
}

export function readVerificationManifest(path: string): Check[] {
  if (lstatSync(path).size > 32_000) throw new Error("Verification manifest is too large.");
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(value.checks) || value.checks.length < 2 || value.checks.length > 40) throw new Error("Declare 2–40 independent checks, including combined.");
  const ids = new Set<string>();
  const modules = new Set<string>();
  for (const check of value.checks) {
    if (!check || typeof check.id !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(check.id) || ids.has(check.id)
      || typeof check.requirement !== "string" || !check.requirement.trim() || check.requirement.length > 1500) throw new Error("Invalid verification requirement/check mapping.");
    ids.add(check.id);
    if (check.module !== undefined) {
      if (typeof check.module !== "string" || !/^checks\/[a-z][a-z0-9_-]{0,63}\.mjs$/.test(check.module) || modules.has(check.module)) throw new Error("Each check needs a distinct local module.");
      modules.add(check.module);
    }
    if (check.kind !== undefined && check.kind !== "behavior" && check.kind !== "fault") throw new Error("Invalid check kind.");
    if (check.method !== undefined && (!["mutation-recovery", "http-header-rejection"].includes(check.method) || check.kind !== "fault" || !check.module)) throw new Error("Invalid executable fault method.");
    if (check.taskId !== undefined && (typeof check.taskId !== "string" || !check.taskId || check.taskId.length > 200)) throw new Error("Invalid task binding.");
    if (check.files !== undefined && (!check.taskId || !verificationOwnedFiles(check.files))) throw new Error("Invalid check ownership files.");
  }
  if (modules.size && modules.size !== value.checks.length) throw new Error("Do not mix modular and legacy checks.");
  if (!ids.has("combined")) throw new Error("The combined project checks are required.");
  for (const [key, method] of [["mutationRecovery", "mutation-recovery"], ["httpHeaderRejection", "http-header-rejection"]]) if (value[key] !== undefined) {
    const coverage = value[key];
    if (!coverage || typeof coverage.applicable !== "boolean" || typeof coverage.reason !== "string" || !coverage.reason.trim() || coverage.reason.length > 1500
      || coverage.applicable && !value.checks.some((check: Check) => check.id === coverage.checkId && check.method === method)) throw new Error(`Declare ${key} applicability with a reason and an executable check when applicable.`);
  }
  return value.checks.map(({ id, requirement, module, kind, method, taskId, files }: Check) => ({ id, requirement,
    ...(module ? { module } : {}), ...(kind ? { kind } : {}), ...(method ? { method } : {}), ...(taskId ? { taskId } : {}), ...(files ? { files: verificationOwnedFiles(files)! } : {}) }));
}

export async function executeVerification(args: {
  module: string; manifest: string; cwd: string; scratch: string; log: string;
  cancelled(): boolean; timeoutMs?: number;
}): Promise<{ code: number | null; receipt?: Receipt; error?: string }> {
  const nonce = randomUUID();
  const runner = fileURLToPath(new URL("./group-goal-verifier-runner.mjs", import.meta.url));
  const env = { ...Object.fromEntries(["PATH", "LANG", "LC_ALL", "SYSTEMROOT", "WINDIR"].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : [])),
    ELECTRON_RUN_AS_NODE: "1", HOME: args.scratch, TMPDIR: args.scratch, TMP: args.scratch, TEMP: args.scratch };
  const child = spawn(process.execPath, [runner, args.module, args.manifest, args.cwd, args.scratch, nonce], {
    cwd: args.cwd, env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "", tail = "", stopped: string | undefined;
  // Decode incrementally: a UTF-8 character may span pipe chunks. Keep the
  // bounded protocol separately from diagnostic stderr and the shorter log.
  const consumeLog = (text: string) => { output = (output + text).slice(-1_000_000); };
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", (text: string) => {
    consumeLog(text);
    // 40 checks × 6,000 error characters, including worst-case JSON escaping.
    tail = (tail + text).slice(-2_000_000);
  });
  child.stderr.on("data", consumeLog);
  const kill = () => {
    try { if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); } catch {}
  };
  const timer = setTimeout(() => { stopped = "Verification timed out."; kill(); }, args.timeoutMs ?? 180_000);
  const cancel = setInterval(() => { if (args.cancelled()) { stopped = "Verification was cancelled."; kill(); } }, 100);
  const code = await new Promise<number | null>(resolveExit => {
    child.once("error", error => { stopped = String(error); resolveExit(null); });
    child.once("close", resolveExit);
  });
  clearTimeout(timer); clearInterval(cancel); kill();
  writeFileSync(args.log, redactSecretsInText(output));
  if (stopped) return { code, error: stopped };
  try {
    const lines = tail.split("\n").filter(line => line.startsWith("BOTDOM_VERIFICATION_RECEIPT "));
    if (lines.length !== 1) throw new Error("Missing or ambiguous verification receipt.");
    const receipt = JSON.parse(lines[0]!.slice("BOTDOM_VERIFICATION_RECEIPT ".length)) as Receipt;
    if (receipt.nonce !== nonce || !Array.isArray(receipt.results)) throw new Error("Invalid verification receipt.");
    return { code, receipt };
  } catch (error) { return { code, error: String(error) }; }
}

export function createGoalVerification(args: {
  runId: string; goal: string; cwd(): string | null; evidenceDir: string;
  permitted(): boolean; cancelled(): boolean; followups(): string;
  toolScope?(): unknown;
  review(instructions: string): Promise<GoalStepResult>;
  canReview?(): boolean;
  requireCoverageDeclaration?: boolean;
  save(state: GroupGoalVerification): void;
}): GoalVerificationGate {
  let attempts = 0;
  let frozen: Snapshot | undefined;
  let boundCwd: string | undefined;
  let followupsHash: string | undefined;
  let requirements: Check[] = [];
  let source: Snapshot | undefined;
  let failuresCount = 0;
  let checksRevision = 1;
  const initialCwd = args.cwd();
  const initiallyCode = Boolean(initialCwd && PROJECT_MARKERS.some(marker => existsSync(join(initialCwd, marker))));
  const permitted = () => {
    try { return args.permitted() && !narrowsNativeTools(args.toolScope?.()); } catch { return false; }
  };
  const snapshot = (cwd: string, excluded?: string | readonly string[]) => verificationSnapshot(cwd, excluded, () => args.cancelled() || !permitted());
  return {
    required: () => {
      const cwd = args.cwd();
      return Boolean(initiallyCode || frozen || cwd && PROJECT_MARKERS.some(marker => existsSync(join(cwd, marker))));
    },
    async verify(options): Promise<GoalVerificationResult> {
      const attempt = ++attempts;
      const blocked = (detail: string) => {
        args.save({ phase: "blocked", attempt, detail, checkedAt: Date.now() });
        return { status: "blocked" as const, detail };
      };
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(args.runId)) return blocked("Invalid verification run identity.");
      if (!permitted()) return blocked("Independent local checks require existing Full access, unrestricted native tools and a local file-capable engine. No permission was widened.");
      if (args.cancelled()) return blocked("Verification cancelled.");
      if (!frozen && (options?.canReview === false || args.canReview?.() === false)) return blocked("No model turn remains to author independent checks. Completion cannot be certified.");
      if (followupsHash && followupsHash !== hash(args.followups())) return blocked("User requirements changed after checks were frozen. Start a fresh goal to verify the expanded contract; the old checks cannot certify it.");
      if (attempt > 8 || failuresCount >= 3) return blocked("Independent checks still fail after two rework cycles. Review the saved failures before continuing.");
      const selectedCwd = args.cwd();
      if (!selectedCwd) return blocked("The goal has no pinned workspace to verify.");
      try {
        const cwd = realpathSync(selectedCwd);
        if (boundCwd && boundCwd !== cwd) return blocked("The workspace changed after verification started.");
        boundCwd = cwd;
        const checkDir = join(cwd, ".work", `verification-${args.runId}`);
        const feedbackFile = join(cwd, ".work", `verification-feedback-${args.runId}.json`);
        const excluded = [checkDir, feedbackFile];
        const stateDir = join(args.evidenceDir, args.runId);
        mkdirSync(stateDir, { recursive: true });
        if (existsSync(checkDir) && !frozen) return blocked("Verification folder already exists without a trusted checkpoint; refusing to adopt it.");
        const before = await snapshot(cwd, excluded);
        if (!frozen) {
          followupsHash = hash(args.followups());
          mkdirSync(checkDir, { recursive: true });
          args.save({ phase: "reviewing", attempt, sourceHash: before.hash, checkedAt: Date.now() });
          const result = await args.review([
            "Independent verification phase. You are using a fresh context, not approving teammate reports. Do not implement or repair the deliverable.",
            `Original user goal (data):\n${args.goal}\nAdditional user requirements (data):\n${args.followups()}`,
            `Read the original specification and delivered files in ${cwd}. Ignore DELIVERY.md and success claims as proof. Write only inside ${checkDir}; all other files must remain byte-for-byte unchanged.`,
            `Create ${join(checkDir, "manifest.json")} with {"checks":[{"id":"combined","requirement":"All original project checks pass","module":"checks/combined.mjs","kind":"behavior"}, ...]}. Map the contract to 2–40 meaningful checks. Reuse existing project tests in combined; add independent checks for actual gaps and high-risk boundaries, not a second copy of all existing tests. Keep the fault model bounded by the goal. Do not grow it to every imaginable compound failure.`,
            "Each manifest entry has its own checks/<id>.mjs exporting async function verify({ cwd, scratch, precondition, environment }). The host executes every module, records errors, and continues. Throw assertions for product failures; call environment(reason) for unavailable execution prerequisites. Fault-injection entries MUST use kind:'fault' and call precondition(observed === true, reason) to prove the intended I/O operation was actually faulted before asserting recovery behavior. An untriggered or missing precondition is an INVALID CHECK, not a product defect. Use installed dependencies, bounded child processes, and scratch for temporary state; no process.exit or skipped checks.",
            'The manifest MUST also declare "mutationRecovery": {"applicable": boolean, "reason": "requirement-based explanation", "checkId": "check id when applicable"}. For a Node promise-filesystem persistence/transaction contract this is applicable: a rejected filesystem operation may already have changed bytes. Atomic replacement alone does not prove the acknowledgement and recovered state agree. No persistence/transaction requirement means not applicable with an explicit reason; unsupported I/O must be disclosed, not falsely certified.',
            'For applicable contracts add a kind:"fault", method:"mutation-recovery" module. Export async verify({cwd,mutationRecovery}) and await mutationRecovery({prepare: async ({directory}) => ({mutate: async () => /* one meaningful successful state change */, observe: async () => /* detached deterministic domain state: balances/items/events, no timestamps */, recover: async () => /* close and reopen after I/O is restored */, dispose: async () => /* close handles */})}). Import the delivered library from cwd in this process; create isolated state only under directory. prepare seeds the same initial state on every call. The trusted host probe observes baseline filesystem mutations, injects EIO before and AFTER each takes effect, rejects later mutations until mutate settles, then restores I/O. It compares observed and recovered state with the acknowledged outcome. It proves the injection itself; do not replace it with an append hook that guarantees zero bytes or a self-authored precondition(true). Supported APIs are fs/promises mutators and FileHandle writes; 1–24 baseline mutations. No nested child process for this probe; use separate modules for other tests. Do not catch probe failures. Keep the observation meaningful and document any unobserved state.',
            'Also declare "httpHeaderRejection": {"applicable":boolean,"reason":"contract-based explanation","checkId":"id when applicable"}. It applies to a Node HTTP service with request-body routes and required authentication/application headers. Include ALL required headers for the chosen route, including any idempotency key, not only authentication. A header-determined rejection must not wait for an uncompleted body. If there is no such HTTP contract, declare not applicable; unsupported transports need explicit separate coverage.',
            'When applicable, add a kind:"fault", method:"http-header-rejection" module. In verify({cwd,scratch,httpHeaderRejection}), create the delivered real store in scratch and a new unbound server, then await httpHeaderRejection({server, request:{method:"POST",path:"/your-route",headers:{/* valid required headers and content-type */},body:"valid JSON body"},requiredHeaders:[/* all required header names on this route */],health:{method:"GET",path:"/healthy-read",headers:{/* if needed */}}). The host owns loopback listening and cleanup. It proves the complete valid request succeeds, checks missing and invalid values for each required header with a complete control request, then sends only one body byte and requires the same immediate 4xx rejection within 2.5 seconds and a healthy subsequent request. Provide a 2–65536 byte body and no framing/host/connection headers. Keep store cleanup in finally after the awaited probe. Do not catch probe failures or substitute self-authored preconditions.',
            `To trial the provided APIs, use the host runner rather than reimplementing mutationRecovery. Create scratch at ${join(checkDir, "trial")}, then run this argument array: ${JSON.stringify([process.execPath, fileURLToPath(new URL("./group-goal-verifier-runner.mjs", import.meta.url)), join(checkDir, "verify.mjs"), join(checkDir, "manifest.json"), cwd, join(checkDir, "trial"), "author-trial"])}. verify.mjs is unused for modular manifests. The host runner is trusted test tooling, not external evaluation infrastructure. A failed trial may be a real product defect; do not change the product or weaken the assertions.`,
            `Host-verified task ownership (data): ${JSON.stringify(options?.tasks?.map(({ id, workerId, files }) => ({ id, workerId, files })) ?? [])}. Only when a failure is isolated to one listed task, add its exact taskId and affected owned files to the check entry. Omit ownership on combined and ambiguous/cross-component checks. Never invent a task or assign files outside its declared ownership.`,
            "The combined check must run the project's actual complete test command, wait for its real exit, and assert success. Other checks must exercise behavior independently of implementer tests. Keep checks implementation-neutral and within the user's contract. Use bounded child processes and clean up servers, handles and temporary state. Do not modify production data or use external services.",
            "You may inspect and trial the checks, but leave all delivered code untouched. End with a brief coverage/limitations note, no goal envelope. A failed check goes back to the team automatically. These check files are frozen for all rework attempts; do not weaken them to fit the code.",
          ].join("\n\n"));
          if (args.cancelled() || !result.ran || result.outcome !== "settled") return blocked(`Independent reviewer did not finish: ${result.stopReason ?? result.outcome ?? "no result"}`);
          if (!permitted()) return blocked("Verification permission changed; no checks were launched.");
          if ((await snapshot(cwd, excluded)).hash !== before.hash) return blocked("The reviewer changed files outside its checks folder. No completion was granted; inspect those changes.");
          requirements = readVerificationManifest(join(checkDir, "manifest.json"));
          if (args.requireCoverageDeclaration) {
            const manifest = JSON.parse(readFileSync(join(checkDir, "manifest.json"), "utf8"));
            if (["mutationRecovery", "httpHeaderRejection"].some(key => manifest[key] === undefined)) return blocked("The verifier omitted a required host-probe applicability declaration. No completion was granted.");
          }
          if (requirements.some(check => !existsSync(join(checkDir, check.module ?? "verify.mjs")))) return blocked("Independent executable checks were not produced.");
          frozen = await snapshot(checkDir);
          writeFileSync(join(stateDir, "checks.json"), JSON.stringify({ requirements, frozen }, null, 2));
          cpSync(checkDir, join(stateDir, "checks-v1"), { recursive: true });
        }
        if ((await snapshot(checkDir)).hash !== frozen.hash) return blocked("Frozen verification checks were changed during rework. No completion was granted.");
        if (!permitted()) return blocked("Verification permission changed; no checks were launched.");
        if (hash(args.followups()) !== followupsHash) return blocked("User requirements changed while checks were authored; start a fresh goal for the expanded contract.");
        const current = await snapshot(cwd, excluded);
        const changedFiles = source ? [...new Set([...Object.keys(source.files), ...Object.keys(current.files)])].filter(path => source!.files[path] !== current.files[path]) : [];
        source = current;
        const scratch = join(stateDir, `scratch-${attempt}`);
        mkdirSync(scratch, { recursive: true });
        args.save({ phase: "checking", attempt, sourceHash: current.hash, checksHash: frozen.hash, checkedAt: Date.now() });
        const result = await executeVerification({ module: join(checkDir, "verify.mjs"), manifest: join(checkDir, "manifest.json"), cwd, scratch,
          log: join(stateDir, `attempt-${attempt}.log`), cancelled: () => args.cancelled() || !permitted() });
        if (args.cancelled()) return blocked("Verification cancelled.");
        if (!permitted()) return blocked("Verification permission changed during execution.");
        const currentCwd = args.cwd();
        if (!currentCwd || realpathSync(currentCwd) !== cwd) return blocked("The workspace changed during verification.");
        if (hash(args.followups()) !== followupsHash) return blocked("User requirements changed during verification; these checks cannot certify the expanded contract.");
        if ((await snapshot(cwd, excluded)).hash !== current.hash || (await snapshot(checkDir)).hash !== frozen.hash) return blocked("Files changed while checks ran; the result does not certify the current workspace.");
        const receipt = result.receipt;
        const ids = new Set(receipt?.results.map(item => item.id));
        if (result.error || receipt?.error || !receipt || receipt.results.length !== requirements.length || ids.size !== requirements.length
          || requirements.some(check => !ids.has(check.id)) || receipt.results.some(item => typeof item.ok !== "boolean")) {
          return blocked(`Independent checks did not produce complete evidence: ${result.error ?? receipt?.error ?? "missing checks"}`);
        }
        if (receipt.results.some(item => item.kind !== undefined && !["failed", "invalid", "environment"].includes(item.kind))) return blocked("Invalid check disposition.");
        const failures = receipt.results.filter(check => !check.ok).map(check => {
          const requirement = requirements.find(item => item.id === check.id)!;
          const task = options?.tasks?.find(task => task.id === requirement.taskId);
          const bound = requirement.id !== "combined" && task && requirement.files?.length && requirement.files.every(file => task.files.includes(file));
          return { id: check.id, requirement: requirement.requirement, kind: check.kind ?? "failed" as const,
            ...(bound ? { taskId: task.id, files: requirement.files } : {}), detail: redactSecretsInText(check.error ?? "Check failed").slice(0, 2500) };
        });
        const passed = result.code === 0 && failures.length === 0;
        const invalid = failures.filter(check => check.kind === "invalid");
        const environment = failures.some(check => check.kind === "environment");
        const detail = invalid.length ? `Invalid verification method in ${invalid.map(item => item.id).join(", ")}; no product repair is authorized by this result. Read ${feedbackFile}.`
          : environment ? `Verification environment unavailable; no product repair is authorized by this result. Read ${feedbackFile}.`
          : passed ? `Independent checks passed (${receipt.results.length}/${requirements.length}); source ${current.hash.slice(0, 12)}. Human acceptance remains separate.`
          : failures.length ? `Independent verification failed (${failures.length}/${requirements.length}). Repair the diagnosed behavior, preserve the frozen checks, then propose completion again. Failed IDs: ${failures.map(item => item.id).join(", ")}.\nFirst findings: ${JSON.stringify(failures.slice(0, 4).map(item => ({ ...item, requirement: item.requirement.slice(0, 500), detail: item.detail.slice(0, 1000) })))}\nRead all findings and the execution receipt in ${feedbackFile}; this preview does not replace the full evidence.` : `Independent checks exited with ${result.code}; no completion granted.`;
        const state: GroupGoalVerification = { phase: passed ? "passed" : invalid.length ? "invalid" : environment ? "blocked" : "failed", attempt, sourceHash: current.hash, checksHash: frozen.hash,
          checkedAt: Date.now(), checkCount: requirements.length, checksRevision, failures, detail };
        writeFileSync(join(stateDir, `attempt-${attempt}.json`), JSON.stringify({ ...state, code: result.code, receipt }, null, 2));
        writeFileSync(feedbackFile, JSON.stringify({ ...state, code: result.code, receipt }, null, 2));
        args.save(state);
        if (environment) return blocked(`Verification environment is unavailable; do not repair the product for this result. ${detail}`);
        if (invalid.length) {
          const editable = invalid.map(item => requirements.find(check => check.id === item.id)!.module);
          if (checksRevision > 1 || options?.canReview === false || args.canReview?.() === false || editable.some(path => !path)) return blocked(`Invalid checks need review, not product rework. ${detail}`);
          const beforeCorrection = frozen;
          const reviewed = await args.review([
            "Independent verification phase. Repair invalid verification methods only; do not modify the product or weaken its requirements.",
            `Read ${feedbackFile}. You may edit ONLY these check files under ${checkDir}: ${JSON.stringify(editable)}. The manifest, all other checks, and shared helpers are frozen. Keep all existing assertions and fix the injection/preconditions. If impossible within these files, explain the blocker.`,
            "Confirm the targeted operation really failed using precondition(observed === true, reason). Use environment(reason) for unavailable prerequisites. No new goal envelope.",
          ].join("\n\n"));
          if (args.cancelled() || !reviewed.ran || reviewed.outcome !== "settled") return blocked("The invalid-check repair did not finish.");
          if ((await snapshot(cwd, excluded)).hash !== current.hash) return blocked("The check repair modified delivered files.");
          const revised = await snapshot(checkDir);
          if ([...new Set([...Object.keys(beforeCorrection.files), ...Object.keys(revised.files)])].some(path => !editable.includes(path) && beforeCorrection.files[path] !== revised.files[path])) return blocked("The check repair changed a frozen manifest or unrelated check.");
          frozen = revised; checksRevision++;
          cpSync(checkDir, join(stateDir, `checks-v${checksRevision}`), { recursive: true });
          writeFileSync(join(stateDir, `checks-v${checksRevision}.json`), JSON.stringify({ requirements, frozen }, null, 2));
          const corrected = await this.verify(options);
          return { ...corrected, changedFiles: [...new Set([...changedFiles, ...corrected.changedFiles ?? []])] };
        }
        if (!passed) failuresCount++;
        return { status: passed ? "passed" : failuresCount >= 3 ? "blocked" : "failed", detail, failures, feedbackFile, sourceHash: current.hash, changedFiles };
      } catch (error) { return blocked(`Independent verification could not finish: ${redactSecretsInText(String(error))}`); }
    },
  };
}
