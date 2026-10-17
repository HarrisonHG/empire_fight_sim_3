import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmSync, openSync, closeSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(path, 'utf8');
const hash = data => createHash('sha256').update(data).digest('hex');
function assert(condition, message) { if (!condition) throw new Error(message); }
function atomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${content.trimEnd()}\n`);
  renameSync(`${path}.tmp`, path);
}
const json = (path, value) => atomic(path, JSON.stringify(value, null, 2));

export function parseArgs(args) {
  const config = { maxIterations: 12, maxCorrections: 6, reviewerEffort: 'high', implementerEffort: 'medium', autoAdvance: true };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--max-iterations' || arg === '--max-corrections') {
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
  assert(review.task_id === (planning ? 'PLANNING' : current.task_id), 'Stale or mismatched review task id.');
  if (!planning && implementationResult === 'blocked') assert(['correct', 'blocked', 'human_review'].includes(review.decision), 'Blocked implementation requires correction or reviewer stop; acceptance refused.');
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
  required: ['decision', 'task_id', 'summary', 'findings', 'next_task', 'human_review'],
  properties: {
    decision: { type: 'string', enum: ['accept', 'correct', 'advance', 'human_review', 'blocked'] },
    task_id: { type: 'string' }, summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
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
  return `${task.milestone}:${task.slice.match(/^(\d+[A-Za-z]+)(?=$|[-\s])/u)?.[1] ?? task.slice}`;
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

export function codexArgs(role, effort, schemaPath, output, sessionId = null) {
  assert(!sessionId || sessionPattern.test(sessionId), 'Invalid saved CLI session id.');
  return ['-a', 'never', 'exec', '--sandbox', role === 'implementer' ? 'workspace-write' : 'read-only',
    '-c', `model_reasoning_effort="${effort}"`, '--color', 'never',
    '--output-schema', schemaPath, '--output-last-message', output, '--json',
    ...(sessionId ? ['resume', sessionId] : []), '-'];
}

export function needsAcceptance(review, task, scope) {
  return review.decision === 'accept' ||
    (review.decision === 'advance' && contextKey(parseTask(review.next_task, scope)) !== contextKey(task));
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

export function dumpUsage(repo, runDir, taskId, command, usageOverride) {
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
  json(join(runDir, 'usage.json'), record);
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
  }
  if (config.check) { console.log(`Preflight passed. Milestone ${scope.milestone}: ${scope.plan}`); return 0; }
  mkdirSync(runtime, { recursive: true });
  const lock = join(runtime, 'lock');
  let descriptor;
  try { descriptor = openSync(lock, 'wx'); }
  catch { throw new Error('Loop lock exists. Check for a running loop; remove .agent-loop/lock only if its process has stopped.'); }
  writeFileSync(descriptor, `${process.pid}\n`); closeSync(descriptor);
  const statePath = join(runtime, 'state.json');
  let state, started = false;
  const save = () => json(statePath, state);
  try {
    state = existsSync(statePath) ? JSON.parse(read(statePath)) : null;
    const handoffCheckpoint = state?.context?.checkpoint ?? state?.handoffCheckpoint ?? null;
    if (config.restart) state = null;
    if (state) {
      assert(state.plan === scope.plan && state.milestone === scope.milestone, 'Configuration changed; run npm run agent-loop:restart after human assessment.');
      assert(!['human_review', 'blocked', 'accepted'].includes(state.status), `Persisted stop: ${state.status}. Resolve handoff, then run npm run agent-loop:restart to replan.`);
      assert(config.resume, 'Run exists. Use npm run agent-loop:resume for interrupted/budget-limited work.');
    } else {
      assert(!config.resume, 'No saved run to resume.');
      state = { ...scope, status: 'running', phase: 'planning', cycle: 0, session: `${Date.now()}-${process.pid}`, handoffCheckpoint };
    }
    state.status = 'running'; delete state.error; started = true; save();
    const checkpoint = (runDir, task, report, review) => {
      const path = join(runDir, 'checkpoint.json');
      const previous = existsSync(path) ? JSON.parse(read(path)) : {};
      const current = snapshot(repo);
      json(path, { ...previous, context: state.context.key, task_id: task.task_id,
        head: git(repo, ['rev-parse', 'HEAD']).trim(),
        source_hash: hash(JSON.stringify(Object.entries(current).filter(([file]) => !handoffFiles.has(file)).sort(([a], [b]) => a.localeCompare(b)))),
        ...(report ? { result: report.result, report: report.report.slice(0, 1800), knowledge: report.checkpoint ?? null } : {}),
        ...(review ? { decision: review.decision, summary: review.summary, findings: review.findings.slice(0, 6).map(item => item.slice(0, 300)) } : {}),
        evidence: relative(repo, runDir).replaceAll('\\', '/'),
        caution: 'Check results apply to the recorded source hash, not subsequent edits. Task/plan remain authoritative.',
      });
      state.context.checkpoint = relative(repo, path).replaceAll('\\', '/'); save();
    };
    const invoke = (role, prompt, runDir, schema) => {
      mkdirSync(runDir, { recursive: true });
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
          state.context.sessions[role] = id; save();
        }
      };
      if (sessionId) recordSession(sessionId);
      if (recovered) recordSession(recovered);
      if (sessionId) prompt = `Continue your existing ${role} role for the current letter.\nRead CURRENT_TASK.md and the new evidence below. Prior findings are context, not authority.\nReuse established context; reread doctrine/code only where changed or needed to verify this task.\nDo not repeat completed diagnosis without a concrete reason. Recheck results invalidated by edits.\n` + prompt;
      const checkpointPath = state.context?.checkpoint ?? state.handoffCheckpoint;
      if (!sessionId && existsSync(join(dir, 'RESTART_BRIEF.md'))) prompt =
        'Read docs/agent-loop/RESTART_BRIEF.md for the reconciled starting evidence and bounded next task.\n' +
        'Use the current task/plan and newer checkpoints if they supersede that brief. Do not crawl historical evidence.\n' + prompt;
      if (checkpointPath) prompt += `\nConcise recovery/handoff checkpoint: ${checkpointPath}.\n`;
      atomic(join(runDir, `${role}-prompt.txt`), prompt); json(join(runDir, `${role}-schema.json`), schema);
      if (invokeOverride) return invokeOverride({ role, prompt, runDir, schema, sessionId, recordSession });
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
      if (iterations >= config.maxIterations && state.phase !== 'planning') { state.status = 'paused'; save(); console.log('Iteration budget reached. Use npm run agent-loop:resume.'); return 4; }
      const planning = state.phase === 'planning';
      const taskText = planning ? null : read(join(dir, 'CURRENT_TASK.md'));
      const task = planning ? null : parseTask(taskText, scope);
      if (task) assert(hash(taskText) === state.taskHash, 'CURRENT_TASK changed since handoff; run npm run agent-loop:restart to replan.');
      if (task && state.context?.key !== contextKey(task)) {
        state.context = { key: contextKey(task), sessions: {}, corrections: 0, checkpoint: state.context?.checkpoint ?? state.handoffCheckpoint ?? null }; save();
      }
      const runDir = join(runtime, 'runs', state.session, String(state.cycle)); mkdirSync(runDir, { recursive: true });
      if (!planning && state.phase === 'implementing') {
        if (task.kind === 'human') return stop('human_review', taskText);
        const baselinePath = join(runDir, 'baseline.json');
        if (!existsSync(baselinePath)) json(baselinePath, snapshot(repo));
        if (!existsSync(join(runDir, 'base-head.txt'))) atomic(join(runDir, 'base-head.txt'), git(repo, ['rev-parse', 'HEAD']));
        const controls = ['scripts/agent-loop.mjs', 'scripts/agent-loop-usage.mjs', ...['CONFIG.json', 'CURRENT_TASK.md', 'RESTART_BRIEF.md', 'WORKFLOW.md', 'planner-prompt.md', 'implementer-prompt.md', 'reviewer-prompt.md'].map(name => `docs/agent-loop/${name}`)];
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
      if (!planning && ['accept', 'advance'].includes(review.decision)) commitAccepted(repo, runDir, task);
      if (!planning) dumpUsage(repo, runDir, task.task_id, command, usageOverride);
      if (['blocked', 'human_review'].includes(review.decision)) return stop(review.decision, review.human_review ?? review.summary);
      if (review.decision === 'accept') {
        if (config.autoAdvance) return stop('human_review', `Human milestone assessment required.\n\n${review.summary}\n\nReview ${scope.plan}, integration/performance evidence and named visual routes before accepting the milestone.`);
        return stop('accepted', review.summary);
      }
      if (!planning && review.decision === 'correct') {
        state.context.corrections++;
        if (state.context.corrections >= config.maxCorrections) return stop('human_review',
          `Correction limit (${config.maxCorrections}) reached for ${state.context.key}.\n` +
          'No acceptance or advancement. Review the checkpoint and candidate correction before explicitly restarting/replanning.\n' +
          `Checkpoint: ${state.context.checkpoint}\nProposed correction: ${relative(repo, runDir).replaceAll('\\', '/')}/review.json\n`);
      }
      atomic(join(dir, 'CURRENT_TASK.md'), review.next_task);
      // Corrections retain the original baseline for cumulative review.
      const baseline = !planning && review.decision === 'correct' ? read(join(runDir, 'baseline.json')) : null;
      state.cycle++; state.phase = 'implementing'; state.taskHash = hash(read(join(dir, 'CURRENT_TASK.md'))); save();
      if (baseline) atomic(join(runtime, 'runs', state.session, String(state.cycle), 'baseline.json'), baseline);
      if (baseline) atomic(join(runtime, 'runs', state.session, String(state.cycle), 'base-head.txt'), read(join(runDir, 'base-head.txt')));
      if (!planning) iterations++;
    }
  } catch (error) {
    if (started) { state.status = 'failed'; state.error = error.message; save(); }
    throw error;
  } finally { rmSync(lock, { force: true }); }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const config = parseArgs(process.argv.slice(2));
    if (config.help) console.log('Usage: node scripts/agent-loop.mjs [--check | --resume | --restart] [--max-iterations 1..50] [--max-corrections 1..50] [--no-auto-advance] [--reviewer-effort high] [--implementer-effort medium]\nShortcuts: npm run agent-loop, npm run agent-loop:restart, npm run agent-loop:resume.\nDefault: retain separate role sessions within each letter; fresh acceptance at letter transitions; stop for human assessment.');
    else process.exitCode = runLoop(root, config);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
