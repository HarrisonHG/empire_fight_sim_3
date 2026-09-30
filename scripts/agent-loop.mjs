import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const loopDir = join(repoRoot, 'docs', 'agent-loop');

const paths = {
  currentTask: join(loopDir, 'CURRENT_TASK.md'),
  lastReport: join(loopDir, 'LAST_REPORT.md'),
  lastReview: join(loopDir, 'LAST_REVIEW.json'),
  humanReview: join(loopDir, 'HUMAN_REVIEW.md'),
  implementerPrompt: join(loopDir, 'implementer-prompt.md'),
  reviewerPrompt: join(loopDir, 'reviewer-prompt.md'),
};

function fail(message, exitCode = 1) {
  console.error(message);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const config = {
    maxIterations: 6,
    reviewerEffort: 'high',
    implementerEffort: 'medium',
    autoAdvance: true,
  };

  const efforts = new Set(['low', 'medium', 'high', 'xhigh']);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--max-iterations': {
        const value = Number(argv[++i]);
        if (!Number.isInteger(value) || value < 1 || value > 50) {
          fail('--max-iterations must be an integer from 1 to 50.');
        }
        config.maxIterations = value;
        break;
      }
      case '--reviewer-effort': {
        const value = argv[++i];
        if (!efforts.has(value)) fail(`Unsupported reviewer effort: ${value}`);
        config.reviewerEffort = value;
        break;
      }
      case '--implementer-effort': {
        const value = argv[++i];
        if (!efforts.has(value)) fail(`Unsupported implementer effort: ${value}`);
        config.implementerEffort = value;
        break;
      }
      case '--no-auto-advance':
        config.autoAdvance = false;
        break;
      case '--help':
      case '-h':
        console.log(`Usage: node scripts/agent-loop.mjs [options]\n\n` +
          `  --max-iterations N        Maximum implementation/review cycles (default 6)\n` +
          `  --reviewer-effort LEVEL   low|medium|high|xhigh (default high)\n` +
          `  --implementer-effort LEVEL low|medium|high|xhigh (default medium)\n` +
          `  --no-auto-advance         Allow corrections but stop after current-task acceptance\n`);
        process.exit(0);
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  return config;
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function writeAtomic(path, content) {
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, `${content.replace(/\s+$/u, '')}\n`, 'utf8');
  renameSync(tempPath, path);
}

function assertFilesExist() {
  for (const path of [
    paths.currentTask,
    paths.lastReport,
    paths.lastReview,
    paths.implementerPrompt,
    paths.reviewerPrompt,
  ]) {
    if (!existsSync(path)) fail(`Required workflow file is missing: ${path}`);
  }
}

function taskId() {
  const match = read(paths.currentTask).match(/^task_id:\s*(.+?)\s*$/mu);
  return match?.[1]?.trim() ?? 'UNKNOWN';
}

function taskRequestsHumanReview() {
  return /^human_review_required:\s*true\s*$/imu.test(read(paths.currentTask));
}

function invokeCodex({ prompt, effort, allowWrites }) {
  const args = ['exec'];
  if (allowWrites) args.push('--full-auto');
  args.push('-c', `model_reasoning_effort="${effort}"`, prompt);

  const result = spawnSync('codex', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error) {
    fail(`Failed to launch Codex: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`Codex exited with code ${result.status}. Automation stopped.`);
  }

  const output = result.stdout?.trim();
  if (!output) fail('Codex returned no final output. Automation stopped.');
  return output;
}

function parseReview(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    writeAtomic(paths.lastReview, raw);
    fail(`Reviewer output was not valid JSON. Raw output saved to ${paths.lastReview}.\n${error.message}`);
  }
}

function validateReview(review) {
  const allowed = new Set(['accept', 'correct', 'advance', 'human_review', 'blocked']);
  if (!review || typeof review !== 'object' || !allowed.has(review.decision)) {
    fail('Reviewer JSON is missing a valid decision. Automation stopped.');
  }

  if ((review.decision === 'correct' || review.decision === 'advance') &&
      (typeof review.next_task !== 'string' || review.next_task.trim() === '')) {
    fail(`Reviewer chose ${review.decision} without a non-empty next_task. Automation stopped.`);
  }

  if (review.decision === 'human_review' &&
      (typeof review.human_review !== 'string' || review.human_review.trim() === '')) {
    fail('Reviewer chose human_review without a non-empty human_review checklist. Automation stopped.');
  }
}

const config = parseArgs(process.argv.slice(2));
assertFilesExist();

const codexCheck = spawnSync('codex', ['--version'], { cwd: repoRoot, encoding: 'utf8' });
if (codexCheck.error || codexCheck.status !== 0) {
  fail('The `codex` CLI is not available on PATH.');
}

rmSync(paths.humanReview, { force: true });

for (let iteration = 1; iteration <= config.maxIterations; iteration += 1) {
  const currentTaskId = taskId();
  console.log(`[${iteration}/${config.maxIterations}] Implementing ${currentTaskId} (${config.implementerEffort})...`);

  const implementerResult = invokeCodex({
    prompt: read(paths.implementerPrompt),
    effort: config.implementerEffort,
    allowWrites: true,
  });
  writeAtomic(paths.lastReport, implementerResult);

  console.log(`[${iteration}/${config.maxIterations}] Reviewing ${currentTaskId} (${config.reviewerEffort})...`);
  let reviewerPrompt = read(paths.reviewerPrompt);

  if (!config.autoAdvance) {
    reviewerPrompt += `\n\nORCHESTRATOR OVERRIDE:\nAutomatic advancement is disabled for this run. If the implementation is acceptable and no human review is needed, return "accept", not "advance".\n`;
  }

  if (taskRequestsHumanReview()) {
    reviewerPrompt += `\n\nORCHESTRATOR GATE:\nThe current task explicitly sets human_review_required: true. After reviewing the implementation you MUST return "human_review" unless "blocked" is more accurate. Do not return "accept", "correct", or "advance".\n`;
  }

  const reviewerResult = invokeCodex({
    prompt: reviewerPrompt,
    effort: config.reviewerEffort,
    allowWrites: false,
  });

  const review = parseReview(reviewerResult);
  validateReview(review);
  writeAtomic(paths.lastReview, JSON.stringify(review, null, 2));

  switch (review.decision) {
    case 'correct':
      console.log('Reviewer requested an automated correction.');
      writeAtomic(paths.currentTask, review.next_task);
      break;

    case 'advance':
      if (!config.autoAdvance) {
        fail('Reviewer returned advance despite --no-auto-advance. Automation stopped.');
      }
      console.log('Current task accepted; advancing to the next authorised slice.');
      writeAtomic(paths.currentTask, review.next_task);
      break;

    case 'accept':
      console.log('Current task accepted. No further automated task was issued.');
      process.exit(0);
      break;

    case 'human_review':
      writeAtomic(paths.humanReview, review.human_review);
      console.log(`Human review required. Automation stopped. See ${paths.humanReview}`);
      process.exit(2);
      break;

    case 'blocked':
      console.log('Reviewer reported a blocker requiring human attention. Automation stopped.');
      console.log(review.summary ?? 'No blocker summary supplied.');
      process.exit(3);
      break;

    default:
      fail(`Unexpected decision: ${review.decision}`);
  }
}

fail(`Maximum iteration count (${config.maxIterations}) reached. Automation stopped before another implementation pass.`);
