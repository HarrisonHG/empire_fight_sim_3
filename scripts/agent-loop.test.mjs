import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, copyFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { parseArgs, parseTask, validateReview, runLoop, launch, snapshot, commitAccepted, dumpUsage, contextKey, codexArgs, sessionFromLog, nextCorrectionId, windowsSandboxArgs, checkSandboxReadAccess, accountTokens, usageFromLog, recoverHandoff, acquireLock, atomic, quotaAllowance } from './agent-loop.mjs';
import { summarizeUsage, readAccountUsage } from './agent-loop-usage.mjs';

const scope = { milestone: '8', plan: 'docs/plans/active.md' };
// Most state-machine tests isolate account access; quota tests opt in explicitly.
const config = extra => ({ ...parseArgs([]), accountQuota: false, ...extra });
const task = (id = '8G-1', kind = 'implementation', human = false) => `---\ntask_id: ${id}\nmilestone: 8\nplan: ${scope.plan}\nslice: ${id.match(/^8[A-Z]+/u)?.[0] ?? '8G'}\nkind: ${kind}\nhuman_review_required: ${human}\n---\n# Task\n## Allowed scope\nfile.txt\n## Checks\nFocused checks\n`;
const decision = (value, id, next = null) => ({ decision: value, task_id: id, summary: 'Evidence checked', findings: [], next_task: next, human_review: value === 'human_review' ? 'Inspect named routes after automated gates.' : null });
const report = id => ({ task_id: id, result: 'complete', report: 'Focused checks passed.' });
function fixture(t) {
  const testRoot = resolve('.agent-loop/test-tmp');
  mkdirSync(testRoot, { recursive: true });
  const repo = mkdtempSync(join(testRoot, 'agent-loop-test-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  mkdirSync(join(repo, 'docs/agent-loop'), { recursive: true });
  mkdirSync(join(repo, 'docs/plans'), { recursive: true });
  writeFileSync(join(repo, scope.plan), 'Accepted test plan');
  writeFileSync(join(repo, '.gitignore'), '.agent-loop/\n');
  writeFileSync(join(repo, 'docs/agent-loop/CONFIG.json'), JSON.stringify(scope));
  for (const name of ['WORKFLOW.md', 'planner-prompt.md', 'implementer-prompt.md', 'reviewer-prompt.md']) copyFileSync(resolve('docs/agent-loop', name), join(repo, 'docs/agent-loop', name));
  writeFileSync(join(repo, 'file.txt'), 'pre-existing user WIP\n');
  const git = spawnSync('git', ['init', '--quiet'], { cwd: repo });
  assert.equal(git.status, 0, git.stderr?.toString() || git.error?.message);
  gitRun(repo, ['config', 'user.name', 'Loop Test']);
  gitRun(repo, ['config', 'user.email', 'loop-test@example.invalid']);
  gitRun(repo, ['config', 'commit.gpgsign', 'false']);
  gitRun(repo, ['add', '.']);
  gitRun(repo, ['commit', '-qm', 'Test baseline']);
  return repo;
}
function gitRun(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
const state = repo => JSON.parse(readFileSync(join(repo, '.agent-loop/state.json'), 'utf8'));
function sequence(items, calls) {
  return request => {
    calls.push(request.role);
    const item = items.shift();
    assert.ok(item, `Unexpected call ${request.role}`);
    assert.equal(request.role, item[0]);
    return typeof item[1] === 'function' ? item[1](request) : item[1];
  };
}

const roleIds = {
  implementer: '11111111-1111-1111-1111-111111111111',
  reviewer: '22222222-2222-2222-2222-222222222222',
  acceptance: '33333333-3333-3333-3333-333333333333',
};

test('atomic recovery writes retry transient Windows locks while retaining the previous valid state on permanent failure', t => {
  const repo = fixture(t), path = join(repo, 'state.json');
  writeFileSync(path, 'old state');
  let attempts = 0;
  const waits = [];
  atomic(path, 'new state', (from, to) => {
    if (++attempts < 3) throw Object.assign(new Error('file busy'), { code: 'EPERM' });
    renameSync(from, to);
  }, delay => waits.push(delay));
  assert.equal(readFileSync(path, 'utf8'), 'new state\n');
  assert.deepEqual(waits, [10, 20]);
  assert.throws(() => atomic(path, 'unwritten state', () => {
    throw Object.assign(new Error('permanent failure'), { code: 'EPERM' });
  }, () => {}), /permanent failure/);
  assert.equal(readFileSync(path, 'utf8'), 'new state\n');
});

test('token accounting uses resumed-session deltas and never sums cached or cumulative totals twice', () => {
  const meter = { total: 0, sessions: {} };
  const first = { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 100 };
  assert.equal(accountTokens(meter, roleIds.implementer, first), 300);
  assert.equal(accountTokens(meter, roleIds.implementer, first), 0);
  assert.equal(accountTokens(meter, roleIds.implementer, { input_tokens: 2000, cached_input_tokens: 1700, output_tokens: 150 }), 150);
  assert.equal(meter.total, 450);
  assert.equal(usageFromLog('partial\n' + JSON.stringify({ type: 'turn.completed', usage: first })).input_tokens, 1000);
  assert.equal(usageFromLog('{partial'), null);
  assert.equal(parseArgs(['--token-budget', '2000', '--max-no-progress', '2']).tokenBudget, 2000);
  for (const value of ['0', '-1', 'NaN']) assert.throws(() => parseArgs(['--token-budget', value]));
});

test('a claimed milestone acceptance cannot retain known failures', () => {
  assert.throws(() => validateReview({ ...decision('accept', '8H'), remaining_failures: ['main:routing'] },
    scope, parseTask(task('8H', 'integration'), scope)), /retains failures/);
});

test('different remaining failures do not consume the same-issue stagnation allowance', t => {
  const repo = fixture(t);
  assert.equal(runLoop(repo, config({ maxIterations: 3, maxCorrections: 1 }), sequence([
    ['planner', decision('advance', 'PLANNING', task())],
    ['implementer', report('8G-1')],
    ['reviewer', { ...decision('correct', '8G-1', task('8G-1-C1', 'correction')), remaining_failures: ['a', 'b'] }],
    ['implementer', report('8G-1-C1')],
    ['reviewer', { ...decision('correct', '8G-1-C1', task('8G-1-C2', 'correction')), remaining_failures: ['b'] }],
    ['implementer', report('8G-1-C2')],
    ['reviewer', decision('human_review', '8G-1-C2')],
  ], [])), 2);
  assert.equal(state(repo).context.stalls, 0);
});

test('budget stop after implementation resumes review without rerunning successful work', t => {
  const repo = fixture(t), calls = [];
  assert.equal(runLoop(repo, config({ tokenBudget: 100 }), sequence([
    ['planner', decision('advance', 'PLANNING', task())],
    ['implementer', request => {
      request.recordSession(roleIds.implementer);
      request.recordUsage({ input_tokens: 150, cached_input_tokens: 20, output_tokens: 10 });
      return report('8G-1');
    }],
  ], calls)), 4);
  assert.equal(state(repo).phase, 'reviewing');
  assert.equal(state(repo).stopReason, 'token_budget');
  assert.equal(runLoop(repo, config(), sequence([
    ['reviewer', decision('human_review', '8G-1')],
  ], calls)), 2);
  assert.deepEqual(calls, ['planner', 'implementer', 'reviewer']);
});

test('completed local fix checkpoints while parent gate remains red and a distinct issue starts fresh', t => {
  const repo = fixture(t), calls = [];
  const fix = task('8H-bug-a', 'correction');
  assert.equal(runLoop(repo, config({ maxIterations: 1 }), sequence([
    ['planner', decision('advance', 'PLANNING', fix)],
    ['implementer', request => { request.recordSession(roleIds.implementer); writeFileSync(join(repo, 'file.txt'), 'fixed a'); return report('8H-bug-a'); }],
    ['reviewer', { ...decision('advance', '8H-bug-a', task('8H-bug-b', 'correction')), remaining_failures: ['parent:bug-b'] }],
  ], calls)), 4);
  assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '2');
  assert.equal(runLoop(repo, config(), sequence([
    ['implementer', request => { assert.equal(request.sessionId, null); return report('8H-bug-b'); }],
    ['reviewer', decision('human_review', '8H-bug-b')],
  ], calls)), 2);
  assert.equal(state(repo).context.corrections, 0);
});

test('mixed user baseline receives a reviewed content bundle without staging or blocking next work', t => {
  const repo = fixture(t);
  writeFileSync(join(repo, 'file.txt'), 'user-owned baseline');
  assert.equal(runLoop(repo, config({ maxIterations: 1 }), sequence([
    ['planner', decision('advance', 'PLANNING', task())],
    ['implementer', () => { writeFileSync(join(repo, 'file.txt'), 'reviewed repair plus baseline'); return report('8G-1'); }],
    ['reviewer', decision('advance', '8G-1', task('8G-2'))],
  ], [])), 4);
  assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '1');
  assert.equal(gitRun(repo, ['diff', '--cached', '--name-only']), '');
  const runDir = join(repo, '.agent-loop/runs', state(repo).session, '1');
  const receipt = JSON.parse(readFileSync(join(runDir, 'verification.json')));
  const bundle = JSON.parse(readFileSync(join(runDir, receipt.archive)));
  assert.equal(Buffer.from(bundle.files['file.txt'].after, 'base64').toString(), 'reviewed repair plus baseline');
  assert.equal(receipt.archive_sha256, createHash('sha256').update(readFileSync(join(runDir, receipt.archive))).digest('hex'));
});

test('stale lock recovery never removes a live owner lock', t => {
  const repo = fixture(t), path = join(repo, '.agent-loop/lock');
  mkdirSync(join(repo, '.agent-loop'));
  const ended = spawnSync(process.execPath, ['-e', '']);
  assert.equal(ended.status, 0);
  writeFileSync(path, String(ended.pid));
  acquireLock(path);
  assert.equal(readFileSync(path, 'utf8').trim(), String(process.pid));
  assert.throws(() => acquireLock(path), /Another loop/);
  assert.equal(readFileSync(path, 'utf8').trim(), String(process.pid));
});

test('handoff journal repairs interruption before/after task or state writes without losing its baseline', t => {
  for (const cut of ['before-task', 'after-task', 'after-state']) {
    const repo = fixture(t), runtime = join(repo, '.agent-loop');
    mkdirSync(runtime);
    const oldTask = task(), nextTask = task('8G-1-C1', 'correction');
    const old = { ...scope, session: 'handoff-test', cycle: 1, phase: 'committing', taskHash: createHash('sha256').update(oldTask).digest('hex') };
    const next = { ...old, cycle: 2, phase: 'implementing', taskHash: createHash('sha256').update(nextTask).digest('hex') };
    const baseline = JSON.stringify(snapshot(repo));
    writeFileSync(join(repo, 'docs/agent-loop/CURRENT_TASK.md'), cut === 'before-task' ? oldTask : nextTask);
    writeFileSync(join(runtime, 'state.json'), JSON.stringify(cut === 'after-state' ? next : old));
    writeFileSync(join(runtime, 'pending-handoff.json'), JSON.stringify({ from: old, nextState: next, nextTask, baseline, baseHead: gitRun(repo, ['rev-parse', 'HEAD']) }));
    assert.equal(recoverHandoff(repo), true);
    assert.equal(recoverHandoff(repo), false);
    assert.equal(state(repo).taskHash, next.taskHash);
    assert.equal(readFileSync(join(runtime, 'runs/handoff-test/2/baseline.json'), 'utf8').trim(), baseline);
  }
});

test('legacy interrupted per-letter session is adopted without rerunning planning or losing its CLI UUID', t => {
  const repo = fixture(t), runtime = join(repo, '.agent-loop');
  mkdirSync(runtime);
  const current = task('8H-8-C3', 'correction');
  writeFileSync(join(repo, 'docs/agent-loop/CURRENT_TASK.md'), current);
  writeFileSync(join(runtime, 'state.json'), JSON.stringify({ ...scope, status: 'running', session: 'legacy', cycle: 5, phase: 'implementing', taskHash: createHash('sha256').update(current).digest('hex'), context: { key: '8:8H', corrections: 3, sessions: { implementer: roleIds.implementer } } }));
  assert.equal(runLoop(repo, config(), sequence([
    ['implementer', request => { assert.equal(request.sessionId, roleIds.implementer); return report('8H-8-C3'); }],
    ['reviewer', decision('human_review', '8H-8-C3')],
  ], [])), 2);
  assert.equal(state(repo).context.key, '8:8H-8');
});

test('correction IDs increment one suffix and migrate legacy repeated suffixes', () => {
  for (const [currentId, expected] of [
    ['8H-6', '8H-6-C1'], ['8H-6-C1', '8H-6-C2'], ['8H-6-C2', '8H-6-C3'],
    ['8H-6-C9', '8H-6-C10'], ['8H-6-C1-C1-C1', '8H-6-C4'],
    ['8H-6-C2-C1', '8H-6-C4'],
    ['8H-6-C99999999999999999999', '8H-6-C100000000000000000000'],
  ]) {
    assert.equal(nextCorrectionId(currentId), expected);
    const current = parseTask(task(currentId, 'correction'), scope);
    validateReview(decision('correct', currentId, task(expected, 'correction')), scope, current);
  }
  const current = parseTask(task('8H-6-C1', 'correction'), scope);
  for (const invalid of ['8H-6-C1', '8H-6-C3', '8H-6-C1-C1', '8H-7-C2']) {
    assert.throws(() => validateReview(decision('correct', current.task_id, task(invalid, 'correction')), scope, current), /next numbered/);
  }
});

test('a reconciled planning state supplies the brief once per fresh role and resumes with compact evidence', t => {
  const repo = fixture(t), calls = [];
  writeFileSync(join(repo, 'docs/agent-loop/RESTART_BRIEF.md'), 'Current handoff; history is on demand.');
  mkdirSync(join(repo, '.agent-loop'));
  writeFileSync(join(repo, '.agent-loop/checkpoint.json'), '{}');
  writeFileSync(join(repo, '.agent-loop/state.json'), JSON.stringify({ ...scope,
    status: 'paused', phase: 'planning', cycle: 0, session: 'reconciliation-test',
    handoffCheckpoint: '.agent-loop/checkpoint.json',
  }));
  const fresh = request => {
    assert.match(request.prompt, /Read docs\/agent-loop\/RESTART_BRIEF.md for/);
    assert.match(request.prompt, /Do not crawl historical evidence/);
    assert.match(request.prompt, /Concise recovery\/handoff checkpoint/);
    assert.equal(request.sessionId, null);
  };
  assert.equal(runLoop(repo, config({ resume: true, maxIterations: 1 }), sequence([
    ['planner', request => { fresh(request); return decision('advance', 'PLANNING', task()); }],
    ['implementer', request => { fresh(request); request.recordSession(roleIds.implementer); return report('8G-1'); }],
    ['reviewer', request => { fresh(request); request.recordSession(roleIds.reviewer); return decision('correct', '8G-1', task('8G-1-C1', 'correction')); }],
  ], calls)), 4);
  assert.equal(runLoop(repo, config({ resume: true }), sequence([
    ['implementer', request => {
      assert.equal(request.sessionId, roleIds.implementer);
      assert.doesNotMatch(request.prompt, /Read docs\/agent-loop\/RESTART_BRIEF.md for/);
      assert.match(request.prompt, /Concise recovery\/handoff checkpoint/);
      return report('8G-1-C1');
    }],
    ['reviewer', request => {
      assert.equal(request.sessionId, roleIds.reviewer);
      assert.doesNotMatch(request.prompt, /Read docs\/agent-loop\/RESTART_BRIEF.md for/);
      return decision('blocked', '8G-1-C1');
    }],
  ], calls)), 3);
});

test('implementer cannot rewrite the reconciled restart brief', t => {
  const repo = fixture(t);
  writeFileSync(join(repo, 'docs/agent-loop/RESTART_BRIEF.md'), 'Protected handoff.');
  assert.throws(() => runLoop(repo, config(), sequence([
    ['planner', decision('advance', 'PLANNING', task())],
    ['implementer', () => {
      writeFileSync(join(repo, 'docs/agent-loop/RESTART_BRIEF.md'), 'False acceptance.');
      return report('8G-1');
    }],
  ], [])), /modified loop controls/);
});

test('session events and resume arguments require explicit ids and preserve role permissions', () => {
  const id = roleIds.implementer;
  assert.equal(sessionFromLog(`diagnostic\n${JSON.stringify({ type: 'thread.started', thread_id: id })}\n`), id);
  assert.equal(sessionFromLog(`session id: ${id}\n`), id);
  assert.equal(sessionFromLog('unrelated output'), null);
  assert.throws(() => sessionFromLog('{"type":"thread.started","thread_id":"--last"}'), /Invalid/);
  assert.throws(() => sessionFromLog(`session id: ${id}\nsession id: ${roleIds.reviewer}`), /Conflicting/);
  for (const role of ['implementer', 'reviewer', 'acceptance']) {
    const args = codexArgs(role, 'medium', 'schema.json', 'out.json', id);
    assert.deepEqual(args.slice(-3), ['resume', id, '-']);
    assert.equal(args[args.indexOf('--sandbox') + 1], role === 'implementer' ? 'workspace-write' : 'read-only');
    assert.ok(args.indexOf('--sandbox') < args.indexOf('resume'));
    assert.ok(args.includes('--json')); assert.ok(!args.includes('--last'));
  }
  assert.throws(() => codexArgs('reviewer', 'high', 's', 'o', '--last'), /Invalid/);
  assert.equal(contextKey(parseTask(task('8G-2'), scope)), '8:8G-2');
  assert.equal(contextKey(parseTask(task('8G-2-C1', 'correction'), scope)), '8:8G-2');
});

test('Windows native sandbox preference preserves every fresh and resumed role boundary', () => {
  assert.deepEqual(windowsSandboxArgs('linux'), []);
  for (const platform of ['win32', 'linux']) {
    for (const role of ['planner', 'implementer', 'reviewer', 'acceptance']) {
      for (const id of [null, roleIds.implementer]) {
        const args = codexArgs(role, 'high', 'schema', 'output', id, platform);
        assert.equal(args.includes('features.prefer_mxc=true'), platform === 'win32');
        assert.equal(args[args.indexOf('-a') + 1], 'never');
        assert.equal(args[args.indexOf('--sandbox') + 1], role === 'implementer' ? 'workspace-write' : 'read-only');
        assert.ok(!args.includes('danger-full-access'));
        if (id) assert.ok(args.indexOf('features.prefer_mxc=true') < args.indexOf('resume'));
      }
    }
  }
});

test('sandbox preflight executes required reads and fails before model work on setup or read failure', t => {
  const repo = fixture(t);
  const invoke = (_command, args, options) => {
    assert.ok(args.includes('features.prefer_mxc=true'));
    assert.equal(args[args.indexOf('--permission-profile') + 1], ':read-only');
    assert.ok(args.includes('--include-managed-config'));
    const separator = args.indexOf('--');
    return spawnSync(args[separator + 1], args.slice(separator + 2), options);
  };
  assert.doesNotThrow(() => checkSandboxReadAccess('fake', repo, ['file.txt'], invoke, 'win32'));
  assert.throws(() => checkSandboxReadAccess('fake', repo, ['missing-evidence.md'], invoke, 'win32'), /no model turn started/);
  assert.throws(() => checkSandboxReadAccess('fake', repo, ['file.txt'], () => ({ status: 1, stderr: 'setup refresh had errors' }), 'win32'), /setup refresh had errors/);
  assert.throws(() => checkSandboxReadAccess('fake', repo, ['file.txt'], () => ({ status: 0, stdout: 'no sentinel' }), 'win32'), /Read probe failed|no sentinel/);
  checkSandboxReadAccess('fake', repo, [], () => assert.fail('Windows-only probe'), 'linux');
});

test('role sessions survive corrections and invocation budgets, then reset at a letter boundary', t => {
  const repo = fixture(t), requests = [];
  const invoke = request => {
    requests.push({ role: request.role, sessionId: request.sessionId });
    if (request.role === 'planner') return decision('advance', 'PLANNING', task());
    const id = readFileSync(join(repo, 'docs/agent-loop/CURRENT_TASK.md'), 'utf8').match(/task_id: (.+)/u)[1];
    if (request.role === 'implementer' || request.role === 'reviewer') {
      const expected = id === '8G-1-C1' ? roleIds[request.role] : null;
      assert.equal(request.sessionId ?? null, expected);
      request.recordSession(id === '8H' ? roleIds[request.role].replaceAll('1', '4').replaceAll('2', '5') : roleIds[request.role]);
    }
    if (request.role === 'implementer') return { ...report(id), checkpoint: { facts: ['Known fact'], rejected_hypotheses: ['Ruled out'], open_questions: ['Next question'], checks: ['focused: passed'], evidence_paths: ['saved.log'] } };
    if (request.role === 'acceptance') {
      assert.equal(request.sessionId, null);
      assert.match(request.prompt, /FRESH ACCEPTANCE REVIEW/);
      return decision('advance', id, task('8H', 'integration'));
    }
    if (id === '8G-1') return decision('correct', id, task('8G-1-C1', 'correction'));
    if (id === '8G-1-C1') {
      assert.match(request.prompt, /delta.diff/);
      assert.ok(existsSync(join(request.runDir, 'delta.diff')));
      return decision('advance', id, task('8G-2'));
    }
    if (id === '8G-2') return decision('advance', id, task('8H', 'integration'));
    assert.match(request.prompt, /Concise recovery\/handoff checkpoint/);
    return decision('human_review', id);
  };
  assert.equal(runLoop(repo, config({ maxIterations: 1 }), invoke), 4);
  const saved = state(repo);
  assert.deepEqual(saved.context.sessions, { implementer: roleIds.implementer, reviewer: roleIds.reviewer });
  const cp = JSON.parse(readFileSync(join(repo, saved.context.checkpoint)));
  assert.deepEqual(cp.knowledge.rejected_hypotheses, ['Ruled out']);
  assert.match(cp.source_hash, /^[0-9a-f]{64}$/u);
  assert.equal(runLoop(repo, config({ resume: true }), invoke), 2);
  assert.equal(requests.filter(item => item.role === 'acceptance').length, 1);
  assert.equal(state(repo).context.key, '8:8H');
  assert.equal(state(repo).context.corrections, 0);
});

test('fresh acceptance may veto a transition and interrupted acceptance resumes without repeating prior roles', t => {
  const repo = fixture(t), calls = [];
  assert.throws(() => runLoop(repo, config({ autoAdvance: false }), sequence([
    ['planner', decision('advance', 'PLANNING', task())],
    ['implementer', report('8G-1')], ['reviewer', decision('accept', '8G-1')],
    ['acceptance', () => { throw Error('Acceptance interrupted'); }],
  ], calls)), /Acceptance interrupted/);
  assert.equal(state(repo).phase, 'acceptance');
  assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '1');
  assert.equal(runLoop(repo, config({ resume: true, autoAdvance: false, maxIterations: 1 }), sequence([
    ['acceptance', decision('correct', '8G-1', task('8G-1-C1', 'correction'))],
  ], calls)), 4);
  assert.deepEqual(calls, ['planner', 'implementer', 'reviewer', 'acceptance', 'acceptance']);
  assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '1');
});

test('fresh acceptance rejects mutation and changed or stale transitions', t => {
  for (const variant of ['mutation', 'transition', 'stale']) {
    const repo = fixture(t);
    assert.throws(() => runLoop(repo, config({ autoAdvance: false }), sequence([
      ['planner', decision('advance', 'PLANNING', task())], ['implementer', report('8G-1')],
      ['reviewer', decision('accept', '8G-1')],
      ['acceptance', () => {
        if (variant === 'mutation') writeFileSync(join(repo, 'file.txt'), 'illegal edit');
        if (variant === 'transition') return decision('advance', '8G-1', task('8H'));
        return decision('accept', variant === 'stale' ? 'old-task' : '8G-1');
      }],
    ], [])), /mutated|transition|Stale/);
    assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '1');
  }
});

test('no-progress reassessment preserves the next correction and avoids a human-policy stop', t => {
  const repo = fixture(t);
  assert.equal(runLoop(repo, config({ maxIterations: 1, maxCorrections: 2 }), sequence([
    ['planner', decision('advance', 'PLANNING', task())], ['implementer', report('8G-1')],
    ['reviewer', decision('correct', '8G-1', task('8G-1-C1', 'correction'))],
  ], [])), 4);
  assert.equal(state(repo).context.corrections, 1);
  assert.equal(runLoop(repo, config({ resume: true, maxIterations: 1, maxCorrections: 1 }), sequence([
    ['implementer', report('8G-1-C1')],
    ['reviewer', request => {
      assert.match(request.prompt, /Next correction task_id \(if needed\): 8G-1-C2/);
      return decision('correct', '8G-1-C1', task('8G-1-C2', 'correction'));
    }],
  ], [])), 4);
  assert.equal(state(repo).context.corrections, 2);
  assert.equal(state(repo).stopReason, 'iteration_budget');
  assert.equal(state(repo).context.reassessments, 1);
  assert.match(readFileSync(join(repo, 'docs/agent-loop/CURRENT_TASK.md'), 'utf8'), /Approach reassessment/);
  assert.match(readFileSync(join(repo, 'docs/agent-loop/CURRENT_TASK.md'), 'utf8'), /8G-1-C2/);
  assert.match(readFileSync(join(repo, 'docs/agent-loop/LAST_REVIEW.json'), 'utf8'), /8G-1-C2/);
  assert.equal(runLoop(repo, config(), sequence([
    ['implementer', report('8G-1-C2')], ['reviewer', decision('human_review', '8G-1-C2')],
  ], [])), 2);
});

test('hard-interruption recovery reads the current role log without guessing historical sessions', t => {
  for (const legacy of [false, true]) {
    const repo = fixture(t);
    assert.throws(() => runLoop(repo, config(), sequence([
      ['planner', decision('advance', 'PLANNING', task())],
      ['implementer', request => {
        writeFileSync(join(request.runDir, 'implementer.log'), legacy ? `session id: ${roleIds.implementer}\n` : JSON.stringify({ type: 'thread.started', thread_id: roleIds.implementer }) + '\n');
        throw Error('Hard interruption before recording session');
      }],
    ], [])), /Hard interruption/);
    assert.equal(state(repo).context.sessions.implementer, undefined);
    assert.equal(runLoop(repo, config({ resume: true }), sequence([
      ['implementer', request => { assert.equal(request.sessionId, roleIds.implementer); return report('8G-1'); }],
      ['reviewer', request => { assert.equal(request.sessionId, null); return decision('human_review', '8G-1'); }],
    ], [])), 2);
  }
});

test('role separation refuses shared implementer, reviewer and acceptance session ids', t => {
  for (const role of ['reviewer', 'acceptance']) {
    const repo = fixture(t);
    const items = [
      ['planner', decision('advance', 'PLANNING', task())],
      ['implementer', request => { request.recordSession(roleIds.implementer); return report('8G-1'); }],
    ];
    if (role === 'acceptance') items.push(['reviewer', decision('accept', '8G-1')]);
    items.push([role, request => { request.recordSession(roleIds.implementer); return decision('accept', '8G-1'); }]);
    assert.throws(() => runLoop(repo, config({ autoAdvance: false }), sequence(items, [])), /share a session|cannot reuse/);
    assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '1');
  }
});

test('CLI arguments and strict task/review validation', () => {
  assert.equal(parseArgs(['--reviewer-effort', 'xhigh', '--implementer-effort', 'low']).reviewerEffort, 'xhigh');
  for (const args of [['--max-iterations', '0'], ['--resume', '--restart'], ['--wat'], ['--reviewer-effort']]) assert.throws(() => parseArgs(args));
  const current = parseTask(task(), scope);
  assert.throws(() => parseTask(task().replace('milestone: 8', 'milestone: 9'), scope));
  assert.throws(() => parseTask(task().replace('kind: implementation', 'kind: unknown'), scope));
  assert.throws(() => validateReview(decision('accept', 'stale'), scope, current));
  assert.throws(() => validateReview(decision('advance', current.task_id), scope, current));
  assert.throws(() => validateReview(decision('advance', current.task_id, task('8G-2')), scope, current, false, false));
  assert.throws(() => validateReview(decision('correct', current.task_id, task('wrong', 'correction')), scope, current));
  const human = parseTask(task('8G-1', 'integration', true), scope);
  assert.throws(() => validateReview(decision('accept', human.task_id), scope, human));
  validateReview(decision('correct', human.task_id, task('8G-1-C1', 'correction', true)), scope, human);
  assert.throws(() => validateReview(decision('correct', human.task_id, task('8G-1-C1', 'correction', false)), scope, human));
});

test('npm recovery shortcuts deliver flags through the installed shell and restart a blocked run', t => {
  const repo = fixture(t), calls = [];
  const scripts = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).scripts;
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ private: true, scripts }));
  mkdirSync(join(repo, 'scripts'));
  // Probe the actual shipped package commands without launching Codex or the loop.
  writeFileSync(join(repo, 'scripts/agent-loop.mjs'), 'console.log(JSON.stringify(process.argv.slice(2)));\n');
  const invokeShortcut = name => {
    const result = process.platform === 'win32'
      ? spawnSync('powershell.exe', ['-NoProfile', '-Command', `npm run ${name}`], { cwd: repo, encoding: 'utf8', timeout: 30000 })
      : spawnSync('npm', ['run', name], { cwd: repo, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));
  };
  const restartArgs = invokeShortcut('agent-loop:restart');
  assert.deepEqual(restartArgs, ['--restart']);
  assert.deepEqual(invokeShortcut('agent-loop:resume'), ['--resume']);
  assert.equal(runLoop(repo, config(), sequence([['planner', decision('blocked', 'PLANNING')]], calls)), 3);
  const originalSession = state(repo).session;
  assert.equal(runLoop(repo, { ...parseArgs(restartArgs), accountQuota: false }, sequence([['planner', decision('human_review', 'PLANNING')]], calls)), 2);
  assert.deepEqual(calls, ['planner', 'planner']);
  assert.notEqual(state(repo).session, originalSession);
  assert.equal(state(repo).status, 'human_review');
});

test('planning, cumulative corrections, advancement and final human stop', t => {
  const repo = fixture(t), calls = [];
  const invoke = sequence([
    ['planner', decision('advance', 'PLANNING', task())],
    ['implementer', () => { writeFileSync(join(repo, 'file.txt'), 'first change\n'); return report('8G-1'); }],
    ['reviewer', decision('correct', '8G-1', task('8G-1-C1', 'correction'))],
    ['implementer', () => { writeFileSync(join(repo, 'file.txt'), 'corrected change\n'); return report('8G-1-C1'); }],
    ['reviewer', request => {
      const diff = readFileSync(join(request.runDir, 'slice.diff'), 'utf8');
      assert.match(diff, /pre-existing user WIP/); assert.match(diff, /corrected change/);
      return decision('advance', '8G-1-C1', task('8H', 'integration'));
    }],
    ['acceptance', decision('advance', '8G-1-C1', task('8H', 'integration'))],
    ['implementer', report('8H')],
    ['reviewer', decision('human_review', '8H')],
  ], calls);
  assert.equal(runLoop(repo, config(), invoke), 2);
  assert.equal(state(repo).status, 'human_review');
  assert.equal(calls.length, 8);
  assert.throws(() => runLoop(repo, config({ resume: true }), invoke), /Persisted stop/);
  assert.equal(state(repo).status, 'human_review');
  assert.ok(existsSync(join(repo, 'docs/agent-loop/HUMAN_REVIEW.md')));
  assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '2');
  assert.equal(gitRun(repo, ['show', '--format=', '--name-only', 'HEAD']), 'file.txt');
  assert.equal(gitRun(repo, ['log', '-1', '--format=%s']), 'Accept slice 8G-1-C1');
});

test('missing audit blocks at planning, survives restart attempts and no implementation runs', t => {
  const repo = fixture(t), calls = [];
  assert.equal(runLoop(repo, config(), sequence([['planner', decision('blocked', 'PLANNING')]], calls)), 3);
  assert.deepEqual(calls, ['planner']);
  assert.throws(() => runLoop(repo, config(), () => assert.fail()), /Persisted stop/);
  assert.equal(state(repo).status, 'blocked');
  assert.equal(runLoop(repo, config({ restart: true }), sequence([['planner', decision('blocked', 'PLANNING')]], calls)), 3);
});

test('review failure resumes review without repeating implementation', t => {
  const repo = fixture(t), calls = [];
  assert.throws(() => runLoop(repo, config(), sequence([
    ['planner', decision('advance', 'PLANNING', task())], ['implementer', report('8G-1')],
    ['reviewer', () => { throw new Error('CLI failed'); }],
  ], calls)), /CLI failed/);
  assert.equal(state(repo).phase, 'reviewing');
  assert.equal(runLoop(repo, config({ resume: true }), sequence([['reviewer', decision('human_review', '8G-1')]], calls)), 2);
  assert.deepEqual(calls, ['planner', 'implementer', 'reviewer', 'reviewer']);
});

test('iteration limit persists pending task and resume continues it', t => {
  const repo = fixture(t), calls = [];
  assert.equal(runLoop(repo, config({ maxIterations: 1 }), sequence([
    ['planner', decision('advance', 'PLANNING', task())], ['implementer', report('8G-1')],
    ['reviewer', decision('advance', '8G-1', task('8G-2'))],
  ], calls)), 4);
  assert.equal(state(repo).status, 'paused');
  assert.equal(runLoop(repo, config({ resume: true, autoAdvance: false }), sequence([
    ['implementer', report('8G-2')], ['reviewer', decision('accept', '8G-2')],
    ['acceptance', decision('accept', '8G-2')],
  ], calls)), 0);
  assert.equal(state(repo).status, 'accepted');
});

test('malformed output, scope escape, task mutation and read-only mutations stop', t => {
  for (const variant of ['malformed', 'scope', 'mutation', 'task']) {
    const repo = fixture(t);
    const invoke = request => {
      if (request.role === 'planner') {
        if (variant === 'malformed') return {};
        if (variant === 'scope') return decision('advance', 'PLANNING', task().replace('milestone: 8', 'milestone: 9'));
        if (variant === 'mutation') writeFileSync(join(repo, 'file.txt'), 'unauthorised reviewer edit');
        return decision('advance', 'PLANNING', task());
      }
      writeFileSync(join(repo, 'docs/agent-loop/CURRENT_TASK.md'), 'changed contract');
      return report('8G-1');
    };
    assert.throws(() => runLoop(repo, config(), invoke));
    assert.equal(state(repo).status, 'failed');
    assert.equal(existsSync(join(repo, '.agent-loop/lock')), false);
  }
});

test('human task never launches implementer; blocked implementation goes to reviewer before stop', t => {
  for (const human of [true, false]) {
    const repo = fixture(t), calls = [];
    const items = [['planner', decision('advance', 'PLANNING', task('8J', human ? 'human' : 'implementation', human))]];
    if (!human) items.push(['implementer', { task_id: '8J', result: 'blocked', report: 'Required evidence missing.' }], ['reviewer', decision('blocked', '8J')]);
    assert.equal(runLoop(repo, config(), sequence(items, calls)), human ? 2 : 3);
    assert.deepEqual(calls, human ? ['planner'] : ['planner', 'implementer', 'reviewer']);
  }
});

test('blocked checks receive correction, retain the baseline, then commit only after passing review', t => {
  const repo = fixture(t), calls = [];
  assert.equal(runLoop(repo, config({ autoAdvance: false }), sequence([
    ['planner', decision('advance', 'PLANNING', task())],
    ['implementer', () => { writeFileSync(join(repo, 'file.txt'), 'failing change\n'); return { task_id: '8G-1', result: 'blocked', report: 'Focused regression failed; saved evidence.' }; }],
    ['reviewer', request => {
      assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '1');
      assert.match(readFileSync(join(request.runDir, 'slice.diff'), 'utf8'), /failing change/);
      return decision('correct', '8G-1', task('8G-1-C1', 'correction'));
    }],
    ['implementer', () => { writeFileSync(join(repo, 'file.txt'), 'corrected change\n'); return report('8G-1-C1'); }],
    ['reviewer', request => {
      assert.match(readFileSync(join(request.runDir, 'slice.diff'), 'utf8'), /pre-existing user WIP/);
      return decision('accept', '8G-1-C1');
    }],
    ['acceptance', decision('accept', '8G-1-C1')],
  ], calls)), 0);
  assert.deepEqual(calls, ['planner', 'implementer', 'reviewer', 'implementer', 'reviewer', 'acceptance']);
  assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '2');
  assert.equal(gitRun(repo, ['log', '-1', '--format=%s']), 'Accept slice 8G-1-C1');
});

test('blocked implementation cannot be accepted or advanced; failed review resumes without implementation', t => {
  for (const value of ['accept', 'advance', 'failure']) {
    const repo = fixture(t), calls = [];
    assert.throws(() => runLoop(repo, config(), sequence([
      ['planner', decision('advance', 'PLANNING', task())],
      ['implementer', { task_id: '8G-1', result: 'blocked', report: 'Required checks failed.' }],
      ['reviewer', () => { if (value === 'failure') throw Error('Reviewer unavailable'); return decision(value, '8G-1', value === 'advance' ? task('8G-2') : null); }],
    ], calls)), /acceptance refused|Reviewer unavailable/);
    assert.equal(state(repo).phase, 'reviewing');
    assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '1');
    assert.equal(runLoop(repo, config({ resume: true }), sequence([['reviewer', decision('blocked', '8G-1')]], calls)), 3);
    assert.deepEqual(calls, ['planner', 'implementer', 'reviewer', 'reviewer']);
  }
});

test('lock excludes concurrent loops and --check never calls an agent', t => {
  const repo = fixture(t);
  assert.equal(runLoop(repo, config({ check: true }), () => assert.fail()), 0);
  mkdirSync(join(repo, '.agent-loop')); writeFileSync(join(repo, '.agent-loop/lock'), 'other process');
  assert.throws(() => runLoop(repo, config(), () => assert.fail()), /lock exists/);
});

test('Windows PowerShell shim preserves literal arguments and stdin', { skip: process.platform !== 'win32' }, t => {
  const repo = fixture(t), shim = join(repo, 'test cli.ps1');
  writeFileSync(shim, 'Write-Output (ConvertTo-Json -InputObject @($args | ForEach-Object { [string]$_ }) -Compress); Write-Output ([Console]::In.ReadToEnd()); exit 0');
  const args = ['space value', 'quote"value', '$([bad])', 'line\nvalue'];
  const result = launch(shim, args, { cwd: repo, input: 'literal prompt $value', encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split(/\r?\n/u);
  assert.deepEqual(JSON.parse(lines[0]), args); assert.equal(lines[1], 'literal prompt $value');
});

test('real subprocess adapter uses output file and stops on malformed JSON or CLI failure', { skip: process.platform !== 'win32' }, t => {
  const oldBin = process.env.CODEX_BIN;
  t.after(() => { if (oldBin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = oldBin; });
  for (const mode of ['blocked', 'malformed', 'failure']) {
    const repo = fixture(t), shim = join(repo, 'fake codex.ps1');
    const output = mode === 'malformed' ? '{invalid' : JSON.stringify(decision('blocked', 'PLANNING'));
    writeFileSync(shim, `
if ($args -contains '--help') { Write-Output '--sandbox --output-schema --output-last-message --json resume SESSION_ID'; exit 0 }
if ($args -contains 'sandbox') { Write-Output 'AGENT_LOOP_READ_OK'; exit 0 }
if ($args -notcontains 'exec') { Write-Output 'fake CLI preflight'; exit 0 }
if ('${mode}' -eq 'failure') { exit 7 }
if (($args -join ' ') -notmatch 'read-only') { exit 8 }
$outputIndex = [Array]::IndexOf($args, '--output-last-message')
if ($outputIndex -lt 0) { exit 9 }
$prompt = [Console]::In.ReadToEnd()
if (!$prompt.Contains('PLANNING')) { exit 10 }
[IO.File]::WriteAllText($args[$outputIndex + 1], '${output}')
Write-Output 'stdout chatter must not be parsed as final JSON'
Write-Output '{"type":"thread.started","thread_id":"11111111-1111-1111-1111-111111111111"}'
exit 0
`);
    process.env.CODEX_BIN = shim;
    if (mode === 'blocked') assert.equal(runLoop(repo, config()), 3);
    else assert.throws(() => runLoop(repo, config()), mode === 'failure' ? /failed \(7\)/ : /JSON/);
    assert.equal(state(repo).status, mode === 'blocked' ? 'blocked' : 'failed');
  }
});

test('CLI subprocess resumes explicit role UUIDs after failure and corrections, preserving attempt evidence', { skip: process.platform !== 'win32' }, t => {
  const repo = fixture(t), runtime = join(repo, '.agent-loop'), oldBin = process.env.CODEX_BIN;
  mkdirSync(runtime);
  const shim = join(runtime, 'fake context cli.ps1');
  t.after(() => { if (oldBin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = oldBin; });
  writeFileSync(shim, `
if ($args -contains '--help') { Write-Output '--sandbox --output-schema --output-last-message --json resume SESSION_ID'; exit 0 }
if ($args -contains 'sandbox') { Write-Output 'AGENT_LOOP_READ_OK'; exit 0 }
if ($args -notcontains 'exec') { Write-Output 'fake preflight'; exit 0 }
$outputIndex = [Array]::IndexOf($args, '--output-last-message')
$output = $args[$outputIndex + 1]
$role = (Split-Path -Leaf $output) -replace '-output.json$', ''
$ids = ConvertFrom-Json '${JSON.stringify({ ...roleIds, planner: '44444444-4444-4444-4444-444444444444' })}'
$id = $ids.$role
$resumeIndex = [Array]::IndexOf($args, 'resume')
if ($resumeIndex -ge 0 -and $args[$resumeIndex + 1] -ne $id) { exit 11 }
if ($role -eq 'acceptance' -and $resumeIndex -ge 0) { exit 12 }
$sandboxIndex = [Array]::IndexOf($args, '--sandbox')
$expectedSandbox = if ($role -eq 'implementer') { 'workspace-write' } else { 'read-only' }
if ($args[$sandboxIndex + 1] -ne $expectedSandbox -or $args -contains '--last') { exit 13 }
$prompt = [Console]::In.ReadToEnd()
[IO.File]::AppendAllText((Join-Path (Get-Location) '.agent-loop/cli-calls.jsonl'), (ConvertTo-Json -InputObject @{role=$role; arguments=@($args); prompt=$prompt} -Compress) + [Environment]::NewLine)
Write-Output (ConvertTo-Json -InputObject @{type='thread.started'; thread_id=$id} -Compress)
if ($role -eq 'implementer' -and !(Test-Path '.agent-loop/failed-once')) {
  [IO.File]::WriteAllText((Join-Path (Get-Location) '.agent-loop/failed-once'), 'yes')
  exit 7
}
$task = if (Test-Path 'docs/agent-loop/CURRENT_TASK.md') { [IO.File]::ReadAllText((Join-Path (Get-Location) 'docs/agent-loop/CURRENT_TASK.md')) } else { '' }
$taskId = if ($task -match 'task_id: ([^\\r\\n]+)') { $Matches[1] } else { '' }
if ($role -eq 'planner') { $result = '${JSON.stringify(decision('advance', 'PLANNING', task()))}' }
elseif ($role -eq 'implementer') { $result = ConvertTo-Json -InputObject @{task_id=$taskId; result='complete'; report='Focused checks passed.'; checkpoint=@{facts=@(); rejected_hypotheses=@(); open_questions=@(); checks=@('focused: passed'); evidence_paths=@()}} -Depth 4 -Compress }
elseif ($role -eq 'reviewer' -and $taskId -eq '8G-1') { $result = '${JSON.stringify(decision('correct', '8G-1', task('8G-1-C1', 'correction')))}' }
else { $result = '${JSON.stringify(decision('accept', '8G-1-C1'))}' }
[IO.File]::WriteAllText($output, $result)
exit 0
`);
  process.env.CODEX_BIN = shim;
  const usage = () => ({ status: 'unavailable', reason: 'Test; no account query.' });
  assert.throws(() => runLoop(repo, config({ autoAdvance: false }), undefined, usage), /implementer failed \(7\)/);
  assert.equal(state(repo).context.sessions.implementer, roleIds.implementer);
  assert.equal(runLoop(repo, config({ resume: true, autoAdvance: false }), undefined, usage), 0);
  const calls = readFileSync(join(runtime, 'cli-calls.jsonl'), 'utf8').trim().split(/\r?\n/u).map(line => JSON.parse(line));
  assert.deepEqual(calls.map(item => item.role), ['planner', 'implementer', 'implementer', 'reviewer', 'implementer', 'reviewer', 'acceptance']);
  for (const index of [2, 4, 5]) {
    const { role, arguments: args } = calls[index];
    assert.equal(args[args.indexOf('resume') + 1], roleIds[role]);
    assert.match(calls[index].prompt, /Continue your existing/);
  }
  assert.ok(!calls.at(-1).arguments.includes('resume'));
  const run = join(runtime, 'runs', state(repo).session, '1');
  const logs = join(runtime, 'logs', 'runs', state(repo).session, '1');
  assert.ok(existsSync(join(logs, 'implementer.log')));
  assert.ok(existsSync(join(logs, 'implementer-attempt-2.log')));
  assert.equal(existsSync(join(run, 'implementer.log')), false);
  const invocation = JSON.parse(readFileSync(join(run, 'implementer-invocation.json')));
  assert.equal(invocation.sessionId, roleIds.implementer);
  assert.equal(resolve(run, invocation.log), join(logs, 'implementer-attempt-2.log'));
});

function acceptedFixture(repo) {
  const runDir = join(repo, '.agent-loop/accepted');
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'baseline.json'), JSON.stringify(snapshot(repo)));
  writeFileSync(join(runDir, 'base-head.txt'), gitRun(repo, ['rev-parse', 'HEAD']));
  return {
    runDir,
    accept() { writeFileSync(join(runDir, 'reviewed.json'), JSON.stringify(snapshot(repo))); return commitAccepted(repo, runDir, { task_id: '8G-1' }); },
  };
}

function quotaUsage(fiveHour = 80, weekly = 60) {
  return summarizeUsage({ rateLimits: { limitId: 'codex',
    primary: { usedPercent: 100 - fiveHour, windowDurationMins: 300, resetsAt: 4000000000 },
    secondary: { usedPercent: 100 - weekly, windowDurationMins: 10080, resetsAt: 4000500000 },
  } });
}

test('account guard defaults on and evaluates both windows without a token conversion', () => {
  assert.equal(parseArgs([]).accountQuota, true);
  assert.equal(parseArgs([]).quotaReservePercent, 5);
  assert.equal(parseArgs(['--no-account-quota']).accountQuota, false);
  assert.equal(parseArgs(['--quota-reserve-percent', '8']).quotaReservePercent, 8);
  for (const value of ['-1', '100', 'NaN']) assert.throws(() => parseArgs(['--quota-reserve-percent', value]), /Quota reserve/);
  assert.equal(quotaAllowance(quotaUsage()).limitingWindow.windowDurationMins, 10080);
  assert.equal(quotaAllowance(quotaUsage()).allowed, true);
  assert.equal(quotaAllowance(quotaUsage(5, 70)).allowed, false);
  assert.equal(quotaAllowance(quotaUsage(70, 5)).allowed, false);
  assert.equal(quotaAllowance(quotaUsage(6, 70)).allowed, true);
  assert.equal(quotaAllowance(quotaUsage(6, 70), 8).allowed, false);
  assert.equal(quotaAllowance(quotaUsage(0, 70), 0).allowed, false);
  const usage = quotaUsage();
  usage.buckets.push({ limitId: 'code-review', primary: { remainingPercent: 0 } });
  assert.equal(quotaAllowance(usage).allowed, true, 'Unrelated GitHub review quota is not the Codex bucket.');
  usage.raw.rateLimits.spendControlReached = true;
  assert.equal(quotaAllowance(usage).allowed, false);
});

test('account guard pauses on unreadable, incomplete, ambiguous or stale windows', () => {
  for (const usage of [{}, { status: 'unavailable', reason: 'network' }, { status: 'available', buckets: [] }])
    assert.equal(quotaAllowance(usage).stopReason, 'account_quota_unavailable');
  for (const mutate of [
    usage => { usage.buckets[0].secondary = null; },
    usage => { usage.buckets[0].secondary.remainingPercent = null; },
    usage => { usage.buckets[0].primary.resetsAt = 1; },
    usage => { usage.buckets[0].primary.resetsAt = null; },
    usage => { usage.buckets[0].primary.windowDurationMins = 15; },
    usage => { usage.buckets[0].limitId = 'unknown'; usage.buckets.push({ limitId: 'other' }); },
  ]) {
    const usage = quotaUsage(); mutate(usage);
    assert.equal(quotaAllowance(usage).stopReason, 'account_quota_unavailable');
  }
});

test('low account quota stops before planning without launching a model', t => {
  const repo = fixture(t), calls = [];
  assert.equal(runLoop(repo, config({ accountQuota: true }), sequence([], calls), () => quotaUsage(80, 4)), 4);
  assert.deepEqual(calls, []);
  assert.equal(state(repo).phase, 'planning');
  assert.equal(state(repo).stopReason, 'account_quota');
  assert.equal(state(repo).quota.limitingWindow.windowDurationMins, 10080);
});

test('quota refresh between implementation and review preserves phase and resumes after reset', t => {
  const repo = fixture(t), calls = [];
  const samples = [quotaUsage(), quotaUsage(), quotaUsage(4, 60)];
  assert.equal(runLoop(repo, config({ accountQuota: true }), sequence([
    ['planner', decision('advance', 'PLANNING', task())],
    ['implementer', request => { request.recordSession(roleIds.implementer); return report('8G-1'); }],
  ], calls), () => samples.shift()), 4);
  assert.equal(samples.length, 0);
  assert.equal(state(repo).phase, 'reviewing');
  assert.equal(state(repo).context.sessions.implementer, roleIds.implementer);
  assert.equal(runLoop(repo, config({ accountQuota: true }), sequence([
    ['reviewer', decision('human_review', '8G-1')],
  ], calls), () => quotaUsage()), 2);
  assert.deepEqual(calls, ['planner', 'implementer', 'reviewer']);
});

test('unavailable quota is a resumable pause and never a human blocker', t => {
  const repo = fixture(t);
  assert.equal(runLoop(repo, config({ accountQuota: true }), sequence([], []), () => { throw new Error('Service unavailable'); }), 4);
  assert.equal(state(repo).status, 'paused');
  assert.equal(state(repo).stopReason, 'account_quota_unavailable');
  assert.equal(existsSync(join(repo, 'docs/agent-loop/HUMAN_REVIEW.md')), false);
});

test('quota pause before fresh acceptance resumes acceptance without repeating review', t => {
  const repo = fixture(t), calls = [];
  let reads = 0;
  assert.equal(runLoop(repo, config({ accountQuota: true, autoAdvance: false }), sequence([
    ['planner', decision('advance', 'PLANNING', task())],
    ['implementer', report('8G-1')], ['reviewer', decision('accept', '8G-1')],
  ], calls), () => ++reads === 4 ? quotaUsage(60, 5) : quotaUsage()), 4);
  assert.equal(state(repo).phase, 'acceptance');
  assert.equal(runLoop(repo, config({ accountQuota: true, autoAdvance: false }), sequence([
    ['acceptance', decision('accept', '8G-1')],
  ], calls), () => quotaUsage()), 0);
  assert.deepEqual(calls, ['planner', 'implementer', 'reviewer', 'acceptance']);
});

test('quota summaries prefer multiple buckets, clamp percentages and preserve unavailable data', () => {
  const data = { accountId: 'do-not-log', rateLimits: { limitId: 'legacy', primary: { usedPercent: 99 } }, rateLimitsByLimitId: {
    codex: { primary: { usedPercent: 11, windowDurationMins: 300, resetsAt: 1791931219 }, secondary: { usedPercent: 2, windowDurationMins: 10080 } },
    other: { primary: { usedPercent: 120 }, secondary: { usedPercent: -5 } },
    unknown: { primary: { usedPercent: null, resetsAt: null }, secondary: null },
  } };
  const summary = summarizeUsage(data);
  assert.equal(summary.status, 'available');
  assert.equal(summary.buckets[0].primary.remainingPercent, 89);
  assert.equal(summary.buckets[0].secondary.remainingPercent, 98);
  assert.equal(summary.buckets[1].primary.remainingPercent, 0);
  assert.equal(summary.buckets[1].secondary.remainingPercent, 100);
  assert.equal(summary.buckets[2].primary.remainingPercent, null);
  assert.equal(summary.raw.accountId, undefined);
  assert.equal(summarizeUsage({ rateLimits: data.rateLimits }).buckets[0].limitId, 'legacy');
  assert.equal(summarizeUsage({}).status, 'unavailable');
});

function fakeAppServer(mode, frames, killed) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { killed.value = true; };
    child.stdin = new Writable({ write(chunk, encoding, callback) {
      const message = JSON.parse(chunk.toString()); frames.push(message);
      callback();
      queueMicrotask(() => {
        if (mode === 'exit') return child.emit('exit', 1);
        if (mode === 'timeout') return;
        if (message.id === 1) {
          child.stdout.write('{"id":1,"result":'); child.stdout.write('{} }\n');
        } else if (message.id === 2) {
          if (mode === 'malformed') return child.stdout.write('not JSON\n');
          if (mode === 'error') return child.stdout.write('{"id":2,"error":{"message":"Not authenticated"}}\n');
          child.stdout.write('{"method":"unrelated/notification","params":{}}\n');
          child.stdout.write(JSON.stringify({ id: 2, result: { rateLimits: { limitId: 'codex', primary: { usedPercent: 11 } } } }) + '\n');
        }
      });
    } });
    return child;
  };
}

test('usage RPC completes handshake without a model turn and cleans up its process', async () => {
  const frames = [], killed = {};
  const result = await readAccountUsage('fake', { spawnProcess: fakeAppServer('success', frames, killed) });
  assert.equal(result.buckets[0].primary.remainingPercent, 89);
  assert.deepEqual(frames.map(frame => frame.method), ['initialize', 'initialized', 'account/rateLimits/read']);
  assert.equal(killed.value, true);
});

test('usage RPC rejects malformed replies, account errors, exit and bounded timeout', async () => {
  for (const mode of ['malformed', 'error', 'exit', 'timeout']) {
    const killed = {};
    await assert.rejects(readAccountUsage('fake', { timeoutMs: 20, spawnProcess: fakeAppServer(mode, [], killed) }));
    assert.equal(killed.value, true);
  }
});

test('usage dump saves latest and per-slice records; unavailable query is nonfatal', t => {
  const repo = fixture(t), runDir = join(repo, '.agent-loop/usage-test');
  const available = summarizeUsage({ rateLimits: { limitId: 'codex', primary: { usedPercent: 11, windowDurationMins: 300, resetsAt: 1791931219 } } });
  const result = dumpUsage(repo, runDir, '8G-1', null, () => available);
  assert.equal(result.buckets[0].primary.remainingPercent, 89);
  assert.equal(JSON.parse(readFileSync(join(runDir, 'usage.json'))).task_id, '8G-1');
  assert.equal(JSON.parse(readFileSync(join(repo, '.agent-loop/usage-latest.json'))).task_id, '8G-1');
  const failed = dumpUsage(repo, runDir, '8G-1-C1', null, () => { throw new Error('Service unavailable'); });
  assert.equal(failed.status, 'unavailable'); assert.equal(failed.reason, 'Service unavailable');
});

test('completed slice review triggers one usage dump before stopping', t => {
  const repo = fixture(t), calls = [];
  let reads = 0;
  assert.equal(runLoop(repo, config({ autoAdvance: false }), sequence([
    ['planner', decision('advance', 'PLANNING', task())],
    ['implementer', report('8G-1')], ['reviewer', decision('accept', '8G-1')],
    ['acceptance', decision('accept', '8G-1')],
  ], calls), () => { reads++; return summarizeUsage({ rateLimits: { limitId: 'codex', primary: { usedPercent: 11 } } }); }), 0);
  assert.equal(reads, 1);
  assert.equal(JSON.parse(readFileSync(join(repo, '.agent-loop/usage-latest.json'))).task_id, '8G-1');
});

test('accepted commit preserves unrelated staged/unstaged work and handles additions/deletions', t => {
  const repo = fixture(t);
  writeFileSync(join(repo, 'unrelated.txt'), 'user staging'); gitRun(repo, ['add', 'unrelated.txt']);
  writeFileSync(join(repo, scope.plan), 'unrelated user WIP');
  const checkpoint = acceptedFixture(repo);
  rmSync(join(repo, 'file.txt'));
  writeFileSync(join(repo, 'added.txt'), 'accepted addition');
  const commit = checkpoint.accept();
  assert.ok(existsSync(join(repo, '.agent-loop/logs/accepted/commit.log')));
  assert.equal(existsSync(join(checkpoint.runDir, 'commit.log')), false);
  assert.equal(gitRun(repo, ['show', '--format=', '--name-only', commit]), 'added.txt\nfile.txt');
  assert.equal(gitRun(repo, ['diff', '--cached', '--name-only']), 'unrelated.txt');
  assert.equal(gitRun(repo, ['diff', '--name-only']), scope.plan);
  assert.equal(gitRun(repo, ['show', `${commit}:${scope.plan}`]), 'Accepted test plan');
  // Simulate interrupted post-commit index refresh and prove recovery creates no duplicate.
  gitRun(repo, ['reset', '-q', `${commit}^`, '--', 'added.txt', 'file.txt']);
  assert.equal(commitAccepted(repo, checkpoint.runDir, { task_id: '8G-1' }), commit);
  assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '2');
  assert.equal(gitRun(repo, ['diff', '--cached', '--name-only']), 'unrelated.txt');
});

test('dirty touched baseline and edits after review refuse commit', t => {
  for (const variant of ['dirty', 'untracked', 'after-review', 'staged']) {
    const repo = fixture(t);
    if (variant === 'dirty') writeFileSync(join(repo, 'file.txt'), 'user existing WIP');
    if (variant === 'untracked') writeFileSync(join(repo, 'new.txt'), 'user existing untracked WIP');
    if (variant === 'staged') { writeFileSync(join(repo, 'file.txt'), 'user staged work'); gitRun(repo, ['add', 'file.txt']); writeFileSync(join(repo, 'file.txt'), 'pre-existing user WIP\n'); }
    const checkpoint = acceptedFixture(repo);
    writeFileSync(join(repo, variant === 'untracked' ? 'new.txt' : 'file.txt'), 'slice change');
    if (variant === 'after-review') {
      writeFileSync(join(checkpoint.runDir, 'reviewed.json'), JSON.stringify(snapshot(repo)));
      writeFileSync(join(repo, 'file.txt'), 'unreviewed edit');
      assert.throws(() => commitAccepted(repo, checkpoint.runDir, { task_id: '8G-1' }), /changed after acceptance/);
    } else assert.throws(() => checkpoint.accept(), /Pre-existing|pre-existing/);
    assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '1');
  }
});

test('commit hook failure stops advancement and resumes commit without rerunning agents', t => {
  const repo = fixture(t), calls = [], hook = join(repo, '.git/hooks/pre-commit');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const invoke = sequence([
    ['planner', decision('advance', 'PLANNING', task())],
    ['implementer', () => { writeFileSync(join(repo, 'file.txt'), 'accepted change'); return report('8G-1'); }],
    ['reviewer', decision('accept', '8G-1')],
    ['acceptance', decision('accept', '8G-1')],
  ], calls);
  assert.throws(() => runLoop(repo, config({ autoAdvance: false }), invoke), /Git failed/);
  assert.equal(state(repo).phase, 'committing');
  assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '1');
  writeFileSync(hook, '#!/bin/sh\nexit 0\n');
  assert.equal(runLoop(repo, config({ resume: true, autoAdvance: false }), () => assert.fail('Agent must not rerun')), 0);
  assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '2');
  assert.deepEqual(calls, ['planner', 'implementer', 'reviewer', 'acceptance']);
});

test('correction, blocked and human review decisions never commit', t => {
  for (const result of ['correct', 'blocked', 'human_review']) {
    const repo = fixture(t), calls = [];
    const next = result === 'correct' ? task('8G-1-C1', 'correction') : null;
    assert.equal(runLoop(repo, config({ maxIterations: 1 }), sequence([
      ['planner', decision('advance', 'PLANNING', task())],
      ['implementer', () => { writeFileSync(join(repo, 'file.txt'), 'not accepted'); return report('8G-1'); }],
      ['reviewer', decision(result, '8G-1', next)],
    ], calls)), result === 'correct' ? 4 : result === 'blocked' ? 3 : 2);
    assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '1');
  }
});
