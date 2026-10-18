import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmSync, openSync, closeSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(path, 'utf8');
const hash = data => createHash('sha256').update(data).digest('hex');
function assert(condition, message) { if (!condition) throw new Error(message); }
export function atomic(path, content, replace = renameSync, pause = milliseconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${content.trimEnd()}\n`);
  // Windows file watchers/OneDrive can briefly hold a replace target. Retain
  // atomic replacement and the previous valid state rather than truncating it.
  for (let attempt = 0; ; attempt++) {
    try { replace(`${path}.tmp`, path); return; }
    catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 5) throw error;
      pause(10 * 2 ** attempt);
    }
  }
}
const json = (path, value) => atomic(path, JSON.stringify(value, null, 2));

export function parseArgs(args) {
  const config = { maxIterations: 50, maxCorrections: 3, tokenBudget: null, accountQuota: true, quotaReservePercent: 5, reviewerEffort: 'high', implementerEffort: 'medium', autoAdvance: true };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--quota-reserve-percent') {
      const value = Number(args[++i]);
      assert(Number.isFinite(value) && value >= 0 && value < 100, 'Quota reserve must be between 0 and less than 100 percent.');
      config.quotaReservePercent = value;
    } else if (arg === '--no-account-quota') config.accountQuota = false;
    else if (arg === '--token-budget') {
      const value = Number(args[++i]);
      assert(Number.isSafeInteger(value) && value > 0, 'Token budget must be a positive integer.');
      config.tokenBudget = value;
    } else if (arg === '--max-iterations' || arg === '--max-corrections' || arg === '--max-no-progress') {
      const value = Number(args[++i]);
      assert(Number.isInteger(value) && value >= 1 && value <= 50, 'Iterations must be 1–50.');
      config[arg === '--max-iterations' ? 'maxIterations' : 'maxCorrections'] = value;
    } else if (arg === '--reviewer-effort' || arg === '--implementer-effort') {
      const value = args[++i];
      assert(['low', 'medium', 'high', 'xhigh'].includes(value), 'Unsupported reasoning effort.');
      config[arg === '--reviewer-effort' ? 'reviewerEffort' : 'implementerEffort'] = value;
    } else if (arg === '--no-auto-advance') config.autoAdvance = false;
    else if (['--resume', '--restart', '--check', '--help', '-h'].includes(arg)) config[arg === '-h' ? 'help' : arg.slice(2)] = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  assert(!(config.resume && config.restart), 'Choose --resume or --restart.');
  return config;
}

export function parseTask(markdown, scope) {
  const header = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  assert(header, 'Task requires front matter.');
  const fields = {};
  for (const line of header[1].split(/\r?\n/u)) {
    const match = line.match(/^([a-z_]+):\s*(\S.*?)\s*$/u);
    assert(match && !(match[1] in fields), 'Invalid or duplicate task metadata.');
    fields[match[1]] = match[2];
  }
  assert(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(fields.task_id ?? ''), 'Invalid task id.');
  assert(fields.plan === scope.plan && fields.milestone === scope.milestone, 'Task crosses authorised milestone/plan.');
  assert(['implementation', 'correction', 'integration', 'performance', 'human'].includes(fields.kind), 'Invalid task kind.');
  assert(['true', 'false'].includes(fields.human_review_required), 'Missing human review flag.');
  if (fields.kind === 'human') assert(fields.human_review_required === 'true', 'Human task must retain human review flag.');
  assert(fields.slice?.length > 0, 'Missing exact plan slice.');
  assert(markdown.includes('## Checks') && markdown.includes('## Allowed scope'), 'Task lacks scope/checks.');
  return fields;
}

export function nextCorrectionId(taskId) {
  const suffix = taskId.match(/(?:-C[1-9]\d*)+$/u)?.[0] ?? '';
  const number = [...suffix.matchAll(/-C(\d+)/gu)].reduce((sum, match) => sum + BigInt(match[1]), 0n);
  return `${suffix ? taskId.slice(0, -suffix.length) : taskId}-C${number + 1n}`;
}

export function validateReview(review, scope, current, planning = false, autoAdvance = true, implementationResult = null) {
  assert(review && ['accept', 'correct', 'advance', 'human_review', 'blocked'].includes(review.decision), 'Invalid review decision.');
  assert(typeof review.summary === 'string' && review.summary.trim() && Array.isArray(review.findings) && review.findings.every(item => typeof item === 'string'), 'Invalid review summary/findings.');
  if (review.remaining_failures !== undefined) assert(Array.isArray(review.remaining_failures) && review.remaining_failures.every(item => typeof item === 'string'), 'Invalid remaining failure inventory.');
  assert(review.task_id === (planning ? 'PLANNING' : current.task_id), 'Stale or mismatched review task id.');
  if (!planning && implementationResult === 'blocked') assert(['correct', 'blocked', 'human_review'].includes(review.decision), 'Blocked implementation requires correction or reviewer stop; acceptance refused.');
  if (!planning && autoAdvance && review.decision === 'accept') assert(!review.remaining_failures?.length, 'Milestone acceptance retains failures; select the next repair.');
  const next = ['correct', 'advance'].includes(review.decision);
  assert(next ? typeof review.next_task === 'string' && review.next_task.trim() : review.next_task === null, 'Invalid next_task for decision.');
  assert(review.decision === 'human_review' ? typeof review.human_review === 'string' && review.human_review.trim() : review.human_review === null, 'Invalid human_review for decision.');
  if (planning) assert(['advance', 'blocked', 'human_review'].includes(review.decision), 'Planning must select a task or stop.');
  if (next) {
    const task = parseTask(review.next_task, scope);
    if (!planning) {
      if (review.decision === 'correct') assert(task.kind === 'correction' && task.slice === current.slice && task.task_id === nextCorrectionId(current.task_id), 'Correction must retain slice and use the next numbered correction id.');
      else assert(autoAdvance && task.task_id !== current.task_id, 'Advancement disabled or repeated task id.');
      if (current.human_review_required === 'true') assert(task.human_review_required === 'true', 'Correction cannot clear human review flag.');
    }
  }
  if (!planning && current.human_review_required === 'true') assert(['correct', 'human_review', 'blocked'].includes(review.decision), 'Human gate cannot be bypassed.');
  return review;
}

export const reviewSchema = {
  type: 'object', additionalProperties: false,
  required: ['decision', 'task_id', 'summary', 'findings', 'next_task', 'human_review', 'remaining_failures'],
  properties: {
    decision: { type: 'string', enum: ['accept', 'correct', 'advance', 'human_review', 'blocked'] },
    task_id: { type: 'string' }, summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
    remaining_failures: { type: 'array', items: { type: 'string' } },
    next_task: { type: ['string', 'null'] }, human_review: { type: ['string', 'null'] },
  },
};
const reportSchema = {
  type: 'object', additionalProperties: false, required: ['task_id', 'result', 'report', 'checkpoint'],
  properties: { task_id: { type: 'string' }, result: { type: 'string', enum: ['complete', 'blocked'] }, report: { type: 'string' },
    checkpoint: { type: 'object', additionalProperties: false,
      required: ['facts', 'rejected_hypotheses', 'open_questions', 'checks', 'evidence_paths'],
      properties: Object.fromEntries(['facts', 'rejected_hypotheses', 'open_questions', 'checks', 'evidence_paths']
        .map(key => [key, { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 300 } }])),
    },
  },
};

export function contextKey(task) {
  return `${task.milestone}:${task.issue ?? task.task_id.replace(/(?:-C[1-9]\d*)+$/u, '')}`;
}

function stageKey(task) { return task.slice.match(/^(\d+[A-Za-z]+)(?=$|[-\s])/u)?.[1] ?? task.slice; }

export function usageFromLog(log) {
  let usage = null;
  for (const line of log.split(/\r?\n/u)) {
    try { const event = JSON.parse(line); if (event.type === 'turn.completed' && event.usage) usage = event.usage; } catch { /* Partial/diagnostic line. */ }
  }
  return usage;
}

export function accountTokens(meter, sessionId, usage) {
  if (!sessionId || !usage) return 0;
  const next = { input: usage.input_tokens ?? 0, cached: usage.cached_input_tokens ?? 0, output: usage.output_tokens ?? 0 };
  const previous = meter.sessions[sessionId] ?? { input: 0, cached: 0, output: 0 };
  assert(Object.values(next).every(value => Number.isSafeInteger(value) && value >= 0), 'Invalid CLI token usage.');
  // CLI usage is cumulative across resumed turns. Charge only the new delta.
  const delta = Math.max(0, next.input - next.cached - (previous.input - previous.cached)) + Math.max(0, next.output - previous.output);
  meter.sessions[sessionId] = next;
  meter.total += delta;
  return delta;
}

const sessionPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
export function sessionFromLog(log) {
  let session = null;
  for (const line of log.split(/\r?\n/u)) {
    let id;
    try { const event = JSON.parse(line); if (event.type === 'thread.started') id = event.thread_id; } catch { /* CLI diagnostics are not JSON. */ }
    // Upgrade recovery for an interrupted run made by the previous runner.
    id ??= line.match(/^session id: ([0-9a-f-]+)$/iu)?.[1];
    if (id) {
      assert(sessionPattern.test(id), 'Invalid CLI session id.');
      assert(!session || session === id, 'Conflicting CLI session ids.');
      session = id;
    }
  }
  return session;
}

export function windowsSandboxArgs(platform = process.platform) {
  // Prefer the supported native sandbox; retain managed policy and legacy
  // selection on hosts where MXC is unavailable. Never disable confinement.
  return platform === 'win32' ? ['-c', 'features.prefer_mxc=true'] : [];
}

export function checkSandboxReadAccess(command, repo, files, invoke = launch, platform = process.platform) {
  if (platform !== 'win32') return;
  const script = `for (const file of ${JSON.stringify(files)}) require('node:fs').readFileSync(file); process.stdout.write('AGENT_LOOP_READ_OK');`;
  const result = invoke(command, [...windowsSandboxArgs(platform), 'sandbox', '--include-managed-config',
    '--permission-profile', ':read-only', '--', process.execPath, '-e', script],
  { cwd: repo, encoding: 'utf8', timeout: 30000 });
  assert(!result.error && result.status === 0 && result.stdout?.includes('AGENT_LOOP_READ_OK'),
    `Codex sandbox cannot read required repository evidence; no model turn started. ${result.stderr || result.stdout || result.error?.message || 'Read probe failed.'}`);
}

export function codexArgs(role, effort, schemaPath, output, sessionId = null, platform = process.platform) {
  assert(!sessionId || sessionPattern.test(sessionId), 'Invalid saved CLI session id.');
  return [...windowsSandboxArgs(platform), '-a', 'never', 'exec', '--sandbox', role === 'implementer' ? 'workspace-write' : 'read-only',
    '-c', `model_reasoning_effort="${effort}"`, '--color', 'never',
    '--output-schema', schemaPath, '--output-last-message', output, '--json',
    ...(sessionId ? ['resume', sessionId] : []), '-'];
}

export function needsAcceptance(review, task, scope) {
  return review.decision === 'accept' ||
    (review.decision === 'advance' && stageKey(parseTask(review.next_task, scope)) !== stageKey(task));
}

function git(repo, args, options = {}) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options,
    env: { ...process.env, GIT_LITERAL_PATHSPECS: '1', ...options.env } });
  assert(!result.error && result.status === 0, `Git failed: ${result.stderr || result.error?.message}`);
  return result.stdout;
}
// Include pre-existing WIP and untracked files without staging/resetting user work.
export function snapshot(repo) {
  const files = git(repo, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0');
  const result = {};
  for (const file of new Set(files)) {
    if (!file || file.startsWith('.agent-loop/')) continue;
    if (existsSync(join(repo, file))) result[file] = readFileSync(join(repo, file)).toString('base64');
  }
  return result;
}
export function changedFiles(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]).sort();
}
const handoffFiles = new Set(['CURRENT_TASK.md', 'LAST_REPORT.md', 'LAST_REVIEW.json', 'HUMAN_REVIEW.md'].map(name => `docs/agent-loop/${name}`));
const sourceChanges = (before, after) => changedFiles(before, after).filter(file => !handoffFiles.has(file));

function logDirectory(repo, runDir) {
  const path = relative(join(repo, '.agent-loop'), runDir);
  assert(path && !path.startsWith('..') && !isAbsolute(path), 'Logs must belong to the loop runtime.');
  return join(repo, '.agent-loop', 'logs', path);
}

export function recoverHandoff(repo) {
  const runtime = join(repo, '.agent-loop'), path = join(runtime, 'pending-handoff.json');
  if (!existsSync(path)) return false;
  const pending = JSON.parse(read(path));
  const current = JSON.parse(read(join(runtime, 'state.json')));
  const next = pending.nextState;
  assert(current.session === next.session && [pending.from.cycle, next.cycle].includes(current.cycle), 'Pending handoff conflicts with saved run.');
  const taskPath = join(repo, 'docs/agent-loop/CURRENT_TASK.md');
  assert([pending.from.taskHash, hash(pending.nextTask)].includes(hash(read(taskPath))), 'Task changed during interrupted handoff.');
  const target = resolve(runtime, 'runs', next.session, String(next.cycle));
  assert(relative(runtime, target) && !relative(runtime, target).startsWith('..'), 'Invalid handoff evidence path.');
  if (pending.baseline !== null) {
    for (const [name, value] of [['baseline.json', pending.baseline], ['base-head.txt', pending.baseHead]]) {
      const file = join(target, name);
      if (existsSync(file)) assert(read(file).trimEnd() === value.trimEnd(), 'Pending handoff baseline changed.');
      else atomic(file, value);
    }
  }
  atomic(taskPath, pending.nextTask);
  json(join(runtime, 'state.json'), next);
  rmSync(path);
  return true;
}

export function acquireLock(path) {
  if (existsSync(path)) {
    const owner = read(path).trim();
    assert(/^\d+$/u.test(owner) && Number(owner) > 0, 'Loop lock exists with an invalid owner; inspect it manually.');
    let alive = true;
    try { process.kill(Number(owner), 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
    assert(!alive, 'Loop lock exists. Another loop may be running.');
    assert(read(path).trim() === owner, 'Loop lock owner changed.');
    rmSync(path);
  }
  const descriptor = openSync(path, 'wx');
  writeFileSync(descriptor, `${process.pid}\n`); closeSync(descriptor);
}

function finishReviewed(repo, runDir, task) {
  let commit;
  try { commit = commitAccepted(repo, runDir, task); }
  catch (error) {
    // Never stage somebody's mixed baseline. A verified snapshot is still a
    // durable checkpoint; this does not prevent the next independent repair.
    if (!/Pre-existing changes|Pre-existing untracked|pre-existing staged/iu.test(error.message)) throw error;
    const reviewed = JSON.parse(read(join(runDir, 'reviewed.json')));
    json(join(runDir, 'commit.json'), { task_id: task.task_id, commit: null, checkpoint: 'reviewed.json',
      source_hash: hash(JSON.stringify(reviewed)), reason: error.message });
    console.log(`Checkpointed ${task.task_id}; mixed pre-existing work preserved without staging.`);
    commit = null;
  }
  const receipt = JSON.parse(read(join(runDir, 'commit.json')));
  const before = JSON.parse(read(join(runDir, 'baseline.json')));
  const reviewed = JSON.parse(read(join(runDir, 'reviewed.json')));
  const bundle = Object.fromEntries(sourceChanges(before, reviewed).map(file => [file,
    { before: before[file] ?? null, after: reviewed[file] ?? null }]));
  json(join(runDir, 'changes.json'), { encoding: 'base64', files: bundle });
  json(join(runDir, 'verification.json'), { task_id: task.task_id, commit, checkpoint: receipt.checkpoint ?? null,
    files: Object.fromEntries(sourceChanges(before, reviewed).map(file => [file, file in reviewed ? hash(Buffer.from(reviewed[file], 'base64')) : null])),
    archive: 'changes.json', archive_sha256: hash(readFileSync(join(runDir, 'changes.json'))),
    review: 'review.json', snapshot: 'reviewed.json', caution: 'Local task accepted; parent milestone gates retain their own status.' });
}

// The reviewer authorises this transaction. A private index preserves unrelated
// staged work; only accepted paths are refreshed in the user's index afterwards.
export function commitAccepted(repo, runDir, task) {
  const receiptPath = join(runDir, 'commit.json');
  const reviewed = JSON.parse(read(join(runDir, 'reviewed.json')));
  assert(sourceChanges(reviewed, snapshot(repo)).length === 0, 'Repository changed after acceptance; commit refused.');
  const before = JSON.parse(read(join(runDir, 'baseline.json')));
  const files = sourceChanges(before, reviewed);
  const parent = read(join(runDir, 'base-head.txt')).trim();
  const requestPath = join(runDir, 'commit-request.json');
  const indexPath = join(runDir, 'commit.index');
  const env = { GIT_INDEX_FILE: indexPath };
  let request = existsSync(requestPath) ? JSON.parse(read(requestPath)) : null;
  const head = git(repo, ['rev-parse', 'HEAD']).trim();
  if (!request) {
    assert(head === parent, 'HEAD changed during slice; commit refused.');
    if (!files.length) { json(receiptPath, { task_id: task.task_id, commit: null, reason: 'No source/plan changes.' }); return null; }
    for (const file of files) {
      const entry = git(repo, ['ls-tree', parent, '--', file]).trim();
      const oid = entry ? entry.split(/\s+/u)[2] : null;
      assert(!entry.startsWith('120000') && !entry.startsWith('160000'), `Unsupported symlink/submodule commit path: ${file}`);
      if (oid) {
        const baselineOid = file in before ? git(repo, ['hash-object', `--path=${file}`, '--stdin'], { input: Buffer.from(before[file], 'base64') }).trim() : null;
        assert(baselineOid === oid, `Pre-existing changes in accepted path ${file}; checkpoint them separately before restarting.`);
      } else assert(!(file in before), `Pre-existing untracked content in ${file}; refusing to include it in a slice commit.`);
    }
    assert(!git(repo, ['diff', '--cached', '--name-only', parent, '--', ...files]).trim(), 'Accepted paths have pre-existing staged changes.');
    rmSync(indexPath, { force: true });
    git(repo, ['read-tree', parent], { env });
    git(repo, ['add', '-A', '--', ...files], { env });
    const tree = git(repo, ['write-tree'], { env }).trim();
    if (tree === git(repo, ['rev-parse', `${parent}^{tree}`]).trim()) {
      json(receiptPath, { task_id: task.task_id, commit: null, reason: 'No Git content changes.' }); return null;
    }
    request = { parent, tree, files, message: `Accept slice ${task.task_id}\n\nAgent-loop checkpoint: ${relative(repo, runDir).replaceAll('\\', '/')}` };
    json(requestPath, request);
  }
  let commit = head;
  if (head === request.parent) {
    assert(git(repo, ['write-tree'], { env }).trim() === request.tree, 'Pending commit index changed.');
    atomic(join(runDir, 'commit-message.txt'), request.message);
    // Normal commit hooks/signing apply. A failure leaves the pending transaction
    // available for --resume, without rerunning implementation or review.
    const output = git(repo, ['commit', '--file', join(runDir, 'commit-message.txt')], { env });
    atomic(join(logDirectory(repo, runDir), 'commit.log'), output);
    commit = git(repo, ['rev-parse', 'HEAD']).trim();
  }
  assert(git(repo, ['rev-parse', `${commit}^`]).trim() === request.parent &&
    git(repo, ['rev-parse', `${commit}^{tree}`]).trim() === request.tree &&
    git(repo, ['log', '-1', '--format=%B']).trim() === request.message, 'HEAD does not match accepted checkpoint; manual inspection required.');
  assert(sourceChanges(reviewed, snapshot(repo)).length === 0, 'Commit hooks changed reviewed files; manual inspection required.');
  // Allow recovery both before and after this path-specific index refresh.
  const againstParent = git(repo, ['diff', '--cached', '--name-only', request.parent, '--', ...request.files]).trim();
  const againstCommit = git(repo, ['diff', '--cached', '--name-only', commit, '--', ...request.files]).trim();
  assert(!againstParent || !againstCommit, 'User index changed on accepted paths; refusing to overwrite it.');
  git(repo, ['reset', '-q', commit, '--', ...request.files]);
  json(receiptPath, { task_id: task.task_id, commit, files: request.files });
  console.log(`Reviewer accepted ${task.task_id}; committed ${commit.slice(0, 12)}.`);
  return commit;
}
function evidence(repo, runDir, before, label = 'slice') {
  const after = snapshot(repo), files = changedFiles(before, after);
  let diff = '';
  for (let i = 0; i < files.length; i++) {
    const file = files[i], left = join(runDir, `${label}-diff-files`, `${i}.before`), right = join(runDir, `${label}-diff-files`, `${i}.after`);
    mkdirSync(dirname(left), { recursive: true });
    writeFileSync(left, Buffer.from(before[file] ?? '', 'base64'));
    writeFileSync(right, Buffer.from(after[file] ?? '', 'base64'));
    const result = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--', left, right], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    assert(!result.error && [0, 1].includes(result.status), 'Could not generate slice diff.');
    diff += `\nFILE: ${file} (${file in before ? file in after ? 'modified' : 'deleted' : 'added'})\n${result.stdout}`;
  }
  atomic(join(runDir, `${label}.diff`), diff || 'No file changes.');
  json(join(runDir, label === 'slice' ? 'changed-files.json' : `${label}-changed-files.json`), files);
}

export function cliCommand() {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  if (process.platform !== 'win32') return 'codex';
  const found = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-Command codex -ErrorAction Stop).Source'], { encoding: 'utf8' });
  assert(found.status === 0, 'Codex CLI not on PATH. Install/sign in first.');
  return found.stdout.trim();
}
export function launchSpec(command, args, env = process.env) {
  if (process.platform === 'win32' && /\.(cmd|ps1)$/iu.test(command)) {
    const script = '$cliArgs = ConvertFrom-Json $env:AGENT_LOOP_CLI_ARGS; & $env:AGENT_LOOP_CLI_BIN @cliArgs; exit $LASTEXITCODE';
    return { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      env: { ...env, AGENT_LOOP_CLI_BIN: command, AGENT_LOOP_CLI_ARGS: JSON.stringify(args) } };
  }
  return { command, args, env };
}
export function launch(command, args, options) {
  const spec = launchSpec(command, args, { ...process.env, ...options.env });
  return spawnSync(spec.command, spec.args, { ...options, env: spec.env });
}

// Subscription windows expose percentages, not a fixed token entitlement. Never
// infer a token budget or treat a missing/reset-expired window as free capacity.
export function quotaAllowance(usage, reservePercent = 5, now = Date.now() / 1000) {
  const unavailable = reason => ({ allowed: false, stopReason: 'account_quota_unavailable', reason, reservePercent });
  if (usage?.status !== 'available') return unavailable(usage?.reason ?? 'Account quota unavailable.');
  const buckets = usage.buckets ?? [];
  const bucket = buckets.find(item => item.limitId === 'codex') ?? (buckets.length === 1 ? buckets[0] : null);
  if (!bucket) return unavailable('Cannot identify the applicable Codex quota bucket.');
  const windows = [bucket.primary, bucket.secondary].filter(Boolean);
  const required = [300, 10080].map(minutes => windows.find(window => window.windowDurationMins === minutes));
  if (required.some(window => !window || !Number.isFinite(window.remainingPercent) || window.remainingPercent < 0 || window.remainingPercent > 100))
    return unavailable('Both five-hour and weekly quota windows must be readable.');
  if (required.some(window => !Number.isFinite(window.resetsAt) || window.resetsAt <= now))
    return unavailable('Quota reset data is missing or stale; refresh before spending.');
  const limitingWindow = required.reduce((least, window) => window.remainingPercent < least.remainingPercent ? window : least);
  const raw = usage.raw?.rateLimitsByLimitId?.[bucket.limitId] ?? usage.raw?.rateLimits;
  const reached = Boolean(raw?.rateLimitReachedType || raw?.spendControlReached);
  const allowed = !reached && limitingWindow.remainingPercent > reservePercent;
  return { allowed, stopReason: allowed ? null : 'account_quota', reservePercent,
    limitId: bucket.limitId, windows: required, limitingWindow,
    reason: reached ? 'The account reports a reached usage/spending limit.' :
      `${limitingWindow.windowDurationMins === 300 ? 'Five-hour' : 'Weekly'} quota has ${limitingWindow.remainingPercent}% remaining; reserve is ${reservePercent}%.` };
}

class QuotaPause extends Error {
  constructor(allowance) { super(allowance.reason); this.allowance = allowance; }
}

export function dumpUsage(repo, runDir, taskId, command, usageOverride, recordName = 'usage') {
  let usage;
  try {
    if (usageOverride) usage = usageOverride();
    else {
      const result = spawnSync(process.execPath, [join(root, 'scripts', 'agent-loop-usage.mjs'), command], {
        cwd: repo, encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024,
      });
      assert(!result.error && result.status === 0, 'Usage helper failed or timed out.');
      usage = JSON.parse(result.stdout);
    }
    assert(usage && ['available', 'unavailable'].includes(usage.status), 'Invalid usage response.');
  } catch (error) { usage = { status: 'unavailable', reason: error.message }; }
  const record = { task_id: taskId, checkedAt: new Date().toISOString(), ...usage };
  json(join(runDir, `${recordName}.json`), record);
  json(join(repo, '.agent-loop', 'usage-latest.json'), record);
  if (usage.status === 'available') {
    for (const bucket of usage.buckets) for (const name of ['primary', 'secondary']) {
      const window = bucket[name];
      if (!window) continue;
      const minutes = window.windowDurationMins;
      const duration = minutes === null ? name : minutes % 1440 === 0 ? `${minutes / 1440}d` : minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
      const resets = window.resetsAt === null ? 'unknown' : `${new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'short', timeStyle: 'short' }).format(new Date(window.resetsAt * 1000))} Europe/London`;
      const remaining = window.remainingPercent === null ? 'remaining quota unknown' : `${window.remainingPercent}% remaining`;
      console.log(`Usage after ${taskId}: ${bucket.limitName ?? bucket.limitId} ${duration}: ${remaining}; resets ${resets}.`);
    }
  } else console.log(`Usage after ${taskId}: unavailable (${usage.reason ?? 'No account limits returned'}).`);
  return record;
}

export function runLoop(repo, config, invokeOverride, usageOverride = invokeOverride ? () => ({ status: 'unavailable', reason: 'Fake-agent test; account query skipped.' }) : undefined) {
  const dir = join(repo, 'docs', 'agent-loop'), runtime = join(repo, '.agent-loop');
  const scope = JSON.parse(read(join(dir, 'CONFIG.json')));
  assert(typeof scope.plan === 'string' && typeof scope.milestone === 'string', 'Invalid loop configuration.');
  const plan = resolve(repo, scope.plan);
  assert(!isAbsolute(scope.plan) && !relative(repo, plan).startsWith('..') && existsSync(plan), 'Authorised plan missing/outside repository.');
  for (const name of ['WORKFLOW.md', 'planner-prompt.md', 'implementer-prompt.md', 'reviewer-prompt.md']) read(join(dir, name));
  git(repo, ['rev-parse', '--show-toplevel']);
  const command = invokeOverride ? null : cliCommand();
  if (!invokeOverride) for (const args of [['--version'], ['login', 'status']]) {
    const result = launch(command, args, { cwd: repo, encoding: 'utf8' });
    assert(!result.error && result.status === 0, `Codex preflight failed: ${result.stderr || result.error?.message}`);
  }
  if (!invokeOverride) {
    const help = launch(command, ['exec', '--help'], { cwd: repo, encoding: 'utf8' });
    assert(!help.error && help.status === 0 && ['--sandbox', '--output-schema', '--output-last-message', '--json', 'resume'].every(flag => help.stdout.includes(flag)), 'Installed Codex lacks required exec/resume flags. Update CLI before running.');
    const resumeHelp = launch(command, ['exec', 'resume', '--help'], { cwd: repo, encoding: 'utf8' });
    assert(!resumeHelp.error && resumeHelp.status === 0 && resumeHelp.stdout.includes('SESSION_ID'), 'Installed Codex lacks session resume. Update CLI before running.');
    const requiredReads = ['AGENTS.md', 'docs/codex/work-slicing.md', 'docs/codex/task-planning.md',
      scope.plan, ...['WORKFLOW.md', 'CURRENT_TASK.md', 'RESTART_BRIEF.md'].map(name => `docs/agent-loop/${name}`)];
    const priorStatePath = join(runtime, 'state.json');
    const priorState = existsSync(priorStatePath) ? JSON.parse(read(priorStatePath)) : null;
    const priorCheckpoint = priorState?.context?.checkpoint ?? priorState?.handoffCheckpoint;
    if (priorCheckpoint) requiredReads.push(priorCheckpoint);
    // Optional startup handoffs may not exist on a new repository. Required
    // doctrine/plan files must still be readable; the model validates contracts.
    checkSandboxReadAccess(command, repo, requiredReads.filter(file =>
      !['docs/agent-loop/CURRENT_TASK.md', 'docs/agent-loop/RESTART_BRIEF.md'].includes(file) || existsSync(join(repo, file))));
  }
  if (config.check) { console.log(`Preflight passed. Milestone ${scope.milestone}: ${scope.plan}`); return 0; }
  mkdirSync(runtime, { recursive: true });
  const lock = join(runtime, 'lock');
  acquireLock(lock);
  const statePath = join(runtime, 'state.json');
  let state, started = false;
  const save = () => json(statePath, state);
  try {
    recoverHandoff(repo);
    state = existsSync(statePath) ? JSON.parse(read(statePath)) : null;
    const handoffCheckpoint = state?.context?.checkpoint ?? state?.handoffCheckpoint ?? null;
    if (config.restart) state = null;
    if (state) {
      assert(state.plan === scope.plan && state.milestone === scope.milestone, 'Configuration changed; run npm run agent-loop:restart after human assessment.');
      assert(!['human_review', 'blocked', 'accepted'].includes(state.status), `Persisted stop: ${state.status}. Resolve handoff, then run npm run agent-loop:restart to replan.`);
      // Ordinary launch also resumes an interrupted/budget-limited run.
    } else {
      assert(!config.resume, 'No saved run to resume.');
      state = { ...scope, status: 'running', phase: 'planning', cycle: 0, session: `${Date.now()}-${process.pid}`, handoffCheckpoint };
    }
    state.status = 'running'; delete state.error; delete state.stopReason; started = true;
    state.tokens ??= { total: 0, sessions: {} };
    if (state.context && state.context.version !== 2 && state.context.checkpoint) {
      const previousDir = dirname(join(repo, state.context.checkpoint));
      for (const role of ['implementer', 'reviewer']) {
        const metadata = join(previousDir, `${role}-invocation.json`);
        if (!existsSync(metadata)) continue;
        const prior = JSON.parse(read(metadata));
        const priorLog = join(previousDir, prior.log);
        if (!prior.sessionId || !existsSync(priorLog) || state.tokens.sessions[prior.sessionId]) continue;
        const usage = usageFromLog(read(priorLog));
        if (usage) state.tokens.sessions[prior.sessionId] = {
          input: usage.input_tokens ?? 0, cached: usage.cached_input_tokens ?? 0, output: usage.output_tokens ?? 0,
        };
      }
    }
    const allocationStart = state.tokens.total;
    save();
    const checkpoint = (runDir, task, report, review) => {
      const path = join(runDir, 'checkpoint.json');
      const previous = existsSync(path) ? JSON.parse(read(path)) : {};
      const current = snapshot(repo);
      json(path, { ...previous, context: state.context.key, task_id: task.task_id,
        head: git(repo, ['rev-parse', 'HEAD']).trim(),
        source_hash: hash(JSON.stringify(Object.entries(current).filter(([file]) => !handoffFiles.has(file)).sort(([a], [b]) => a.localeCompare(b)))),
        ...(report ? { result: report.result, report: report.report.slice(0, 1800), knowledge: report.checkpoint ?? null } : {}),
        ...(review ? { decision: review.decision, summary: review.summary,
          remaining_failures: review.remaining_failures ?? previous.remaining_failures ?? [],
          findings: review.findings.slice(0, 6).map(item => item.slice(0, 300)) } : {}),
        evidence: relative(repo, runDir).replaceAll('\\', '/'),
        caution: 'Check results apply to the recorded source hash, not subsequent edits. Task/plan remain authoritative.',
      });
      state.context.checkpoint = relative(repo, path).replaceAll('\\', '/'); save();
    };
    const invoke = (role, prompt, runDir, schema) => {
      mkdirSync(runDir, { recursive: true });
      if (config.accountQuota) {
        const usage = dumpUsage(repo, runDir, role === 'planner' ? 'PLANNING' : parseTask(read(join(dir, 'CURRENT_TASK.md')), scope).task_id,
          command, usageOverride, `${role}-quota`);
        const allowance = quotaAllowance(usage, config.quotaReservePercent);
        state.quota = { ...allowance, checkedAt: usage.checkedAt, nextRole: role }; save();
        if (!allowance.allowed) throw new QuotaPause(allowance);
      }
      const metadataPath = join(runDir, `${role}-invocation.json`);
      const prior = existsSync(metadataPath) ? JSON.parse(read(metadataPath)) : null;
      // Recover even after a hard interruption, before overwriting any evidence.
      const priorLog = prior ? join(runDir, prior.log) : join(runDir, `${role}.log`);
      const recovered = existsSync(priorLog) ? sessionFromLog(read(priorLog)) : null;
      let sessionId = (role === 'acceptance' ? null : state.context?.sessions[role]) ?? prior?.sessionId ?? recovered;
      const recordSession = id => {
        assert(sessionPattern.test(id) && (!sessionId || sessionId === id), 'CLI resumed a different session.');
        sessionId = id;
        if (role === 'acceptance') assert(!Object.values(state.context.sessions).includes(id), 'Fresh acceptance cannot reuse an ongoing role session.');
        if (state.context && ['implementer', 'reviewer'].includes(role)) {
          const other = role === 'implementer' ? 'reviewer' : 'implementer';
          assert(state.context.sessions[other] !== id, 'Implementer and reviewer cannot share a session.');
          if (state.context.sessions[role] !== id) { state.context.sessions[role] = id; save(); }
        }
      };
      const recordUsage = usage => { if (usage) { accountTokens(state.tokens, sessionId, usage); save(); } };
      if (sessionId) recordSession(sessionId);
      if (recovered) recordSession(recovered);
      if (sessionId) prompt = `Continue your existing ${role} role for the current issue.\nRead CURRENT_TASK.md and the new evidence below. Prior findings are context, not authority.\nReuse established context; reread doctrine/code only where changed or needed to verify this task.\nDo not repeat completed diagnosis without a concrete reason. Recheck results invalidated by edits.\n` + prompt;
      const checkpointPath = state.context?.checkpoint ?? state.handoffCheckpoint;
      if (!sessionId && existsSync(join(dir, 'RESTART_BRIEF.md'))) prompt =
        'Read docs/agent-loop/RESTART_BRIEF.md for the reconciled starting evidence and bounded next task.\n' +
        'Use the current task/plan and newer checkpoints if they supersede that brief. Do not crawl historical evidence.\n' + prompt;
      if (checkpointPath) prompt += `\nConcise recovery/handoff checkpoint: ${checkpointPath}.\n`;
      atomic(join(runDir, `${role}-prompt.txt`), prompt); json(join(runDir, `${role}-schema.json`), schema);
      if (invokeOverride) return invokeOverride({ role, prompt, runDir, schema, sessionId, recordSession, recordUsage });
      const output = join(runDir, `${role}-output.json`); rmSync(output, { force: true });
      const logDir = logDirectory(repo, runDir);
      mkdirSync(logDir, { recursive: true });
      let logName = `${role}.log`, attempt = 1;
      while (existsSync(join(logDir, logName))) logName = `${role}-attempt-${++attempt}.log`;
      const logFile = join(logDir, logName);
      const logPath = relative(runDir, logFile).replaceAll('\\', '/');
      json(metadataPath, { sessionId: sessionId ?? null, log: logPath });
      const log = openSync(logFile, 'wx');
      let result;
      try {
        result = launch(command, codexArgs(role, role === 'implementer' ? config.implementerEffort : config.reviewerEffort,
          join(runDir, `${role}-schema.json`), output, sessionId),
        { cwd: repo, input: prompt, encoding: 'utf8', stdio: ['pipe', log, log] });
      } finally {
        closeSync(log);
        const id = sessionFromLog(read(logFile));
        if (id) recordSession(id);
        recordUsage(usageFromLog(read(logFile)));
        json(metadataPath, { sessionId: sessionId ?? null, log: logPath });
      }
      assert(!result.error && result.status === 0, `Codex ${role} failed (${result.status ?? result.error?.message}). Log: ${logFile}.`);
      assert(sessionId, 'CLI returned no session id; cannot safely retain context.');
      assert(existsSync(output), `Missing ${role} output.`);
      return JSON.parse(read(output));
    };
    const stop = (decision, text) => {
      state.status = decision; save();
      if (['human_review', 'blocked'].includes(decision)) atomic(join(dir, 'HUMAN_REVIEW.md'), text);
      console.log(`${decision}: ${text.slice(0, 300)}`);
      return decision === 'human_review' ? 2 : decision === 'blocked' ? 3 : 0;
    };
    let iterations = 0;
    while (true) {
      if (config.tokenBudget && state.tokens.total - allocationStart >= config.tokenBudget) {
        state.status = 'paused'; state.stopReason = 'token_budget'; save();
        console.log('Token allocation reached; next action saved. Run agent-loop again to resume.'); return 4;
      }
      if (iterations >= config.maxIterations && state.phase !== 'planning') { state.status = 'paused'; state.stopReason = 'iteration_budget'; save(); console.log('Iteration budget reached. Use npm run agent-loop:resume.'); return 4; }
      const planning = state.phase === 'planning';
      const taskText = planning ? null : read(join(dir, 'CURRENT_TASK.md'));
      const task = planning ? null : parseTask(taskText, scope);
      if (task) assert(hash(taskText) === state.taskHash, 'CURRENT_TASK changed since handoff; run npm run agent-loop:restart to replan.');
      // Adopt legacy per-letter sessions for their interrupted issue once. Do
      // not throw away the exact UUID needed to resume existing partial work.
      if (task && state.context && state.context.version !== 2 && state.context.key === `${task.milestone}:${stageKey(task)}`) {
        state.context.version = 2; state.context.key = contextKey(task); state.context.stalls = 0; save();
      }
      if (task && state.context?.key !== contextKey(task)) {
        state.context = { key: contextKey(task), sessions: {}, corrections: 0, checkpoint: state.context?.checkpoint ?? state.handoffCheckpoint ?? null }; save();
      }
      if (task) state.context.version = 2;
      const runDir = join(runtime, 'runs', state.session, String(state.cycle)); mkdirSync(runDir, { recursive: true });
      if (!planning && state.phase === 'implementing') {
        if (task.kind === 'human') return stop('human_review', taskText);
        const baselinePath = join(runDir, 'baseline.json');
        if (!existsSync(baselinePath)) json(baselinePath, snapshot(repo));
        if (!existsSync(join(runDir, 'base-head.txt'))) atomic(join(runDir, 'base-head.txt'), git(repo, ['rev-parse', 'HEAD']));
        const controls = ['AGENTS.md', 'scripts/agent-loop.mjs', 'scripts/agent-loop-usage.mjs',
          ...['work-slicing.md', 'review.md', 'task-planning.md'].map(name => `docs/codex/${name}`),
          ...['CONFIG.json', 'CURRENT_TASK.md', 'RESTART_BRIEF.md', 'WORKFLOW.md', 'planner-prompt.md', 'implementer-prompt.md', 'reviewer-prompt.md'].map(name => `docs/agent-loop/${name}`)];
        const controlHashes = controls.map(file => existsSync(join(repo, file)) ? hash(readFileSync(join(repo, file))) : null);
        console.log(`Implementing ${task.task_id}. Logs: ${runDir}`);
        const report = invoke('implementer', read(join(dir, 'implementer-prompt.md')), runDir, reportSchema);
        assert(report.task_id === task.task_id && ['complete', 'blocked'].includes(report.result) && typeof report.report === 'string' && report.report.trim(), 'Malformed/stale implementation report.');
        assert(read(join(dir, 'CURRENT_TASK.md')) === taskText, 'Implementer modified its task contract.');
        assert(controls.every((file, index) => (existsSync(join(repo, file)) ? hash(readFileSync(join(repo, file))) : null) === controlHashes[index]), 'Implementer modified loop controls.');
        json(join(runDir, 'report.json'), report);
        atomic(join(dir, 'LAST_REPORT.md'), `Task: ${report.task_id}\nResult: ${report.result}\n\n${report.report}`);
        checkpoint(runDir, task, report);
        state.phase = 'reviewing'; save();
        if (config.tokenBudget && state.tokens.total - allocationStart >= config.tokenBudget) continue;
      }
      let review;
      if (state.phase === 'committing') {
        review = JSON.parse(read(join(runDir, 'review.json')));
        validateReview(review, scope, task, false, config.autoAdvance, JSON.parse(read(join(runDir, 'report.json'))).result);
      } else {
        if (!planning && state.phase !== 'acceptance') {
          evidence(repo, runDir, JSON.parse(read(join(runDir, 'baseline.json'))));
          if (state.context.lastReviewed) evidence(repo, runDir, JSON.parse(read(join(repo, state.context.lastReviewed))), 'delta');
        }
        console.log(planning ? 'Planning first authorised slice...' : `Reviewing ${task.task_id}...`);
        const prompt = read(join(dir, planning ? 'planner-prompt.md' : 'reviewer-prompt.md')) +
          `\n\nORCHESTRATOR CONTRACT:\nAuthorised scope: ${JSON.stringify(scope)}\nAutomatic advancement: ${config.autoAdvance}.\n` +
          (planning ? 'Return task_id PLANNING. Ignore superseded reports/reviews; select from the current plan and reconciled brief. Validate CURRENT_TASK as a proposed handoff, not proof of acceptance.\n' :
            `Next correction task_id (if needed): ${nextCorrectionId(task.task_id)}.\nEvidence directory: ${relative(repo, runDir).replaceAll('\\', '/')}/.\nReview slice.diff and changed-files.json against the slice baseline, which includes pre-existing WIP.\n${state.context.lastReviewed ? 'Start with delta.diff and delta-changed-files.json since your previous review; use the cumulative diff to verify the complete slice.\n' : ''}`);
        const beforeReview = snapshot(repo);
        if (state.phase !== 'acceptance') {
          review = invoke(planning ? 'planner' : 'reviewer', prompt, runDir, reviewSchema);
          assert(changedFiles(beforeReview, snapshot(repo)).length === 0, 'Read-only agent mutated repository.');
          validateReview(review, scope, task, planning, config.autoAdvance, planning ? null : JSON.parse(read(join(runDir, 'report.json'))).result);
          if (!planning && needsAcceptance(review, task, scope)) {
            json(join(runDir, 'candidate-review.json'), review);
            json(join(runDir, 'candidate-snapshot.json'), beforeReview);
            state.phase = 'acceptance'; save();
          }
        }
        if (state.phase === 'acceptance' && config.tokenBudget && state.tokens.total - allocationStart >= config.tokenBudget) continue;
        if (state.phase === 'acceptance') {
          const candidate = JSON.parse(read(join(runDir, 'candidate-review.json')));
          assert(sourceChanges(JSON.parse(read(join(runDir, 'candidate-snapshot.json'))), beforeReview).length === 0, 'Repository changed before fresh acceptance review; restart/replan.');
          review = invoke('acceptance', prompt +
            '\nFRESH ACCEPTANCE REVIEW: independently verify the current letter/task and required gate evidence.\n' +
            'Do not trust previous conclusions as proof. Do not reread raw history unless needed.\n' +
            'Confirm the exact candidate decision and next_task, or return correct/blocked/human_review.\n' +
            `Candidate transition: ${JSON.stringify(candidate)}\n`, runDir, reviewSchema);
          if (['accept', 'advance'].includes(review.decision)) assert(review.decision === candidate.decision && review.next_task === candidate.next_task, 'Fresh acceptance changed the proposed transition.');
          json(join(runDir, 'acceptance-review.json'), review);
        }
        assert(changedFiles(beforeReview, snapshot(repo)).length === 0, 'Read-only agent mutated repository.');
        validateReview(review, scope, task, planning, config.autoAdvance, planning ? null : JSON.parse(read(join(runDir, 'report.json'))).result);
        json(join(runDir, 'review.json'), review); json(join(dir, 'LAST_REVIEW.json'), review);
        if (!planning) {
          json(join(runDir, 'last-reviewed.json'), beforeReview);
          state.context.lastReviewed = relative(repo, join(runDir, 'last-reviewed.json')).replaceAll('\\', '/');
          checkpoint(runDir, task, null, review);
        }
        if (!planning && ['accept', 'advance'].includes(review.decision)) {
          json(join(runDir, 'reviewed.json'), beforeReview);
          state.phase = 'committing'; save();
        }
      }
      if (!planning && ['accept', 'advance'].includes(review.decision)) finishReviewed(repo, runDir, task);
      if (!planning) dumpUsage(repo, runDir, task.task_id, command, usageOverride);
      if (['blocked', 'human_review'].includes(review.decision)) return stop(review.decision, review.human_review ?? review.summary);
      if (review.decision === 'accept') {
        if (config.autoAdvance) return stop('human_review', `Human milestone assessment required.\n\n${review.summary}\n\nReview ${scope.plan}, integration/performance evidence and named visual routes before accepting the milestone.`);
        return stop('accepted', review.summary);
      }
      let stalled = false;
      if (!planning && review.decision === 'correct') {
        state.context.corrections++;
        const fingerprint = review.remaining_failures?.length
          ? hash(JSON.stringify([...new Set(review.remaining_failures)].sort()))
          : hash(JSON.stringify(Object.entries(snapshot(repo)).filter(([file]) => !handoffFiles.has(file))));
        state.context.stalls = state.context.failureFingerprint === fingerprint ? (state.context.stalls ?? 0) + 1 : 0;
        state.context.failureFingerprint = fingerprint;
        stalled = state.context.stalls >= config.maxCorrections;
      }
      // Corrections retain the original baseline for cumulative review.
      const baseline = !planning && review.decision === 'correct' ? read(join(runDir, 'baseline.json')) : null;
      const nextTaskText = stalled ? `${review.next_task.trimEnd()}\n\n## Approach reassessment\nThe same failure inventory has persisted across reviews. Use the checkpoint to choose a different repair strategy, not repeat completed discovery. Diagnose, fix and verify the issue within the existing scope.\n` : review.next_task;
      const nextState = { ...state, cycle: state.cycle + 1, phase: 'implementing', taskHash: hash(nextTaskText),
        ...(stalled ? { context: { ...state.context, sessions: {}, stalls: 0,
          reassessments: (state.context.reassessments ?? 0) + 1 } } : {}) };
      json(join(runtime, 'pending-handoff.json'), { from: { cycle: state.cycle,
        taskHash: existsSync(join(dir, 'CURRENT_TASK.md')) ? hash(read(join(dir, 'CURRENT_TASK.md'))) : hash(nextTaskText) },
        nextState, nextTask: nextTaskText, baseline, baseHead: baseline ? read(join(runDir, 'base-head.txt')) : null });
      // Planning may be starting with no previous task at all.
      if (!existsSync(join(dir, 'CURRENT_TASK.md'))) atomic(join(dir, 'CURRENT_TASK.md'), nextTaskText);
      recoverHandoff(repo); state = JSON.parse(read(statePath));
      if (stalled) console.log('Same issue is not improving; reassessing the repair strategy with a concise checkpoint.');
      if (!planning) iterations++;
    }
  } catch (error) {
    if (error instanceof QuotaPause) {
      state.status = 'paused'; state.stopReason = error.allowance.stopReason; save();
      console.log(`Quota pause: ${error.message} Next action saved; run agent-loop again after capacity returns.`);
      return 4;
    }
    if (started) { state.status = 'failed'; state.error = error.message; save(); }
    throw error;
  } finally { rmSync(lock, { force: true }); }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const config = parseArgs(process.argv.slice(2));
    if (config.help) console.log('Usage: node scripts/agent-loop.mjs [--check | --resume | --restart] [--token-budget N] [--quota-reserve-percent 5] [--no-account-quota] [--max-iterations 1..50] [--max-no-progress 1..50] [--no-auto-advance] [--reviewer-effort high] [--implementer-effort medium]\nOrdinary launch resumes interrupted work. By default both account windows are refreshed before every model turn; either window at/below the 5% reserve, or unavailable limits, pauses safely. No fixed token conversion is inferred. API-key users may explicitly disable account quota checks. An optional token budget counts uncached input plus output. Stops occur between turns; a turn may consume more than the reserve/budget. Context resumes within an issue; completed issues start fresh. Milestone completion stops for human assessment.');
    else process.exitCode = runLoop(root, config);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
