import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliCommand, launchSpec } from './agent-loop.mjs';

const finite = value => typeof value === 'number' && Number.isFinite(value);
function windowSummary(window) {
  if (!window || typeof window !== 'object') return null;
  const used = finite(window.usedPercent) ? window.usedPercent : null;
  return {
    usedPercent: used,
    remainingPercent: used === null ? null : Math.max(0, Math.min(100, 100 - used)),
    windowDurationMins: finite(window.windowDurationMins) && window.windowDurationMins > 0 ? window.windowDurationMins : null,
    resetsAt: finite(window.resetsAt) && window.resetsAt >= 0 && window.resetsAt <= 8640000000000 ? window.resetsAt : null,
  };
}

export function summarizeUsage(raw) {
  const entries = raw?.rateLimitsByLimitId && Object.keys(raw.rateLimitsByLimitId).length
    ? Object.entries(raw.rateLimitsByLimitId)
    : raw?.rateLimits ? [[raw.rateLimits.limitId ?? 'codex', raw.rateLimits]] : [];
  const buckets = entries.filter(([, value]) => value && typeof value === 'object').map(([id, value]) => ({
    limitId: value.limitId ?? id,
    limitName: value.limitName ?? null,
    primary: windowSummary(value.primary), secondary: windowSummary(value.secondary),
  }));
  const available = buckets.some(bucket => [bucket.primary, bucket.secondary].some(window => window?.remainingPercent !== null && window?.remainingPercent !== undefined));
  return { status: available ? 'available' : 'unavailable', ...(available ? {} : { reason: 'Account quota windows were not returned.' }), buckets,
    raw: { rateLimits: raw?.rateLimits ?? null, rateLimitsByLimitId: raw?.rateLimitsByLimitId ?? null } };
}

// JSONL stdio handshake only: never start a thread/turn or consume a reset credit.
export async function readAccountUsage(command, { cwd = process.cwd(), timeoutMs = 10000, spawnProcess = spawn } = {}) {
  const spec = launchSpec(command, ['app-server', '--stdio']);
  const child = spawnProcess(spec.command, spec.args, { cwd, env: spec.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  return await new Promise((resolveResult, reject) => {
    let done = false, buffer = '', bytes = 0;
    const finish = (error, result) => {
      if (done) return;
      done = true; clearTimeout(timer);
      child.stdin.destroy(); child.kill();
      if (error) reject(error); else resolveResult(result);
    };
    const timer = setTimeout(() => finish(new Error('Account usage query timed out.')), timeoutMs);
    const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);
    child.on('error', () => finish(new Error('Could not launch Codex app-server.')));
    child.on('exit', code => finish(new Error(`Codex app-server exited before usage response (${code}).`)));
    child.stdin.on('error', () => finish(new Error('Codex app-server input closed.')));
    // Drain diagnostics without persisting authentication/startup details.
    child.stderr.resume();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (done) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > 1024 * 1024) return finish(new Error('Account usage response exceeded size limit.'));
      buffer += chunk;
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n'), line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
        if (!line) continue;
        let response;
        try { response = JSON.parse(line); }
        catch { return finish(new Error('Invalid JSON from Codex app-server.')); }
        if (![1, 2].includes(response.id)) continue;
        if (response.error) return finish(new Error(`Account usage request failed: ${response.error.message ?? 'unknown error'}`));
        if (response.id === 1) {
          send({ method: 'initialized', params: {} });
          send({ id: 2, method: 'account/rateLimits/read', params: {} });
        } else {
          if (!response.result || typeof response.result !== 'object') return finish(new Error('Missing account usage result.'));
          return finish(null, summarizeUsage(response.result));
        }
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'empire_agent_loop_usage', title: 'Empire agent loop usage', version: '1.0.0' } } });
  });
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  let result;
  try { result = await readAccountUsage(process.argv[2] ?? cliCommand()); }
  catch (error) { result = { status: 'unavailable', reason: error.message }; }
  console.log(JSON.stringify(result, null, 2));
}
