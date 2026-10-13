import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { parseArgs, parseTask, validateReview, runLoop, launch, snapshot, commitAccepted, dumpUsage } from './agent-loop.mjs';
import { summarizeUsage, readAccountUsage } from './agent-loop-usage.mjs';

const scope = { milestone: '8', plan: 'docs/plans/active.md' };
const config = extra => ({ ...parseArgs([]), ...extra });
const task = (id = '8G-1', kind = 'implementation', human = false) => `---\ntask_id: ${id}\nmilestone: 8\nplan: ${scope.plan}\nslice: 8G\nkind: ${kind}\nhuman_review_required: ${human}\n---\n# Task\n## Allowed scope\nfile.txt\n## Checks\nFocused checks\n`;
const decision = (value, id, next = null) => ({ decision: value, task_id: id, summary: 'Evidence checked', findings: [], next_task: next, human_review: value === 'human_review' ? 'Inspect named routes after automated gates.' : null });
const report = id => ({ task_id: id, result: 'complete', report: 'Focused checks passed.' });
function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(), 'agent-loop-test-'));
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
  assert.equal(runLoop(repo, parseArgs(restartArgs), sequence([['planner', decision('human_review', 'PLANNING')]], calls)), 2);
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
    ['implementer', report('8H')],
    ['reviewer', decision('human_review', '8H')],
  ], calls);
  assert.equal(runLoop(repo, config(), invoke), 2);
  assert.equal(state(repo).status, 'human_review');
  assert.equal(calls.length, 7);
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

test('human task never launches implementer; blocked implementation stops', t => {
  for (const human of [true, false]) {
    const repo = fixture(t), calls = [];
    const items = [['planner', decision('advance', 'PLANNING', task('8J', human ? 'human' : 'implementation', human))]];
    if (!human) items.push(['implementer', { task_id: '8J', result: 'blocked', report: 'Required evidence missing.' }]);
    assert.equal(runLoop(repo, config(), sequence(items, calls)), human ? 2 : 3);
    assert.deepEqual(calls, human ? ['planner'] : ['planner', 'implementer']);
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
if ($args -contains '--help') { Write-Output '--sandbox --output-schema --output-last-message'; exit 0 }
if ($args -notcontains 'exec') { Write-Output 'fake CLI preflight'; exit 0 }
if ('${mode}' -eq 'failure') { exit 7 }
if (($args -join ' ') -notmatch 'read-only') { exit 8 }
$outputIndex = [Array]::IndexOf($args, '--output-last-message')
if ($outputIndex -lt 0) { exit 9 }
$prompt = [Console]::In.ReadToEnd()
if (!$prompt.Contains('PLANNING')) { exit 10 }
[IO.File]::WriteAllText($args[$outputIndex + 1], '${output}')
Write-Output 'stdout chatter must not be parsed as final JSON'
exit 0
`);
    process.env.CODEX_BIN = shim;
    if (mode === 'blocked') assert.equal(runLoop(repo, config()), 3);
    else assert.throws(() => runLoop(repo, config()), mode === 'failure' ? /failed \(7\)/ : /JSON/);
    assert.equal(state(repo).status, mode === 'blocked' ? 'blocked' : 'failed');
  }
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
  ], calls);
  assert.throws(() => runLoop(repo, config({ autoAdvance: false }), invoke), /Git failed/);
  assert.equal(state(repo).phase, 'committing');
  assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '1');
  writeFileSync(hook, '#!/bin/sh\nexit 0\n');
  assert.equal(runLoop(repo, config({ resume: true, autoAdvance: false }), () => assert.fail('Agent must not rerun')), 0);
  assert.equal(gitRun(repo, ['rev-list', '--count', 'HEAD']), '2');
  assert.deepEqual(calls, ['planner', 'implementer', 'reviewer']);
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
