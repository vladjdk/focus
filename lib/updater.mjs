// Self-update: compare the running version with the latest GitHub release and,
// when asked, fast-forward this checkout to that release, rebuild and restart.
import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const CHECK_EVERY_MS = 30 * 60_000;

export const parseVersion = v => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
  return m ? m.slice(1).map(Number) : null;
};
export function isNewer(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}
/** "https://github.com/o/r.git" or "git@github.com:o/r.git" -> "o/r" */
export function repoSlug(remote) {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(String(remote).trim());
  return m ? `${m[1]}/${m[2]}` : null;
}
/** Release notes are a short bullet list; keep the bullets, drop the markdown. */
export function changelogItems(body, max = 8) {
  return String(body ?? '')
    .split(/\r?\n/)
    .map(l => /^\s*[-*]\s+(.*)$/.exec(l)?.[1])
    .filter(Boolean)
    .map(l => l.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '').trim())
    .slice(0, max);
}

export function createUpdater({ root, dev, restart }) {
  const current = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const isCheckout = existsSync(join(root, '.git'));
  // launchd starts us with a bare PATH; make sure git, node and npm resolve.
  const nodeBin = dirname(process.execPath);
  const env = { ...process.env, PATH: [nodeBin, process.env.PATH, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].filter(Boolean).join(':'), GIT_TERMINAL_PROMPT: '0' };
  const run = (cmd, args, timeout = 120_000) => exec(cmd, args, { cwd: root, env, timeout, maxBuffer: 8 * 1024 * 1024 });

  let cache = null, checkedAt = 0, busy = false;

  async function check(force = false) {
    const none = { current, latest: current, available: false, notes: [], url: '' };
    if (dev || !isCheckout) return none;
    if (!force && cache && Date.now() - checkedAt < CHECK_EVERY_MS) return cache;
    try {
      const slug = repoSlug((await run('git', ['remote', 'get-url', 'origin'], 10_000)).stdout);
      if (!slug) return none;
      const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'focus' };
      if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      const r = await fetch(`https://api.github.com/repos/${slug}/releases/latest`, { headers, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw Error(`GitHub answered ${r.status}`);
      const rel = await r.json();
      const latest = String(rel.tag_name ?? '').replace(/^v/, '');
      cache = {
        current,
        latest: parseVersion(latest) ? latest : current,
        available: isNewer(latest, current),
        notes: changelogItems(rel.body),
        url: rel.html_url ?? `https://github.com/${slug}/releases`,
        tag: rel.tag_name,
      };
    } catch (e) {
      // Offline, rate-limited, or no releases yet: stay quiet and try again later.
      cache = { ...none, error: e.message };
    }
    checkedAt = Date.now();
    return cache;
  }

  async function apply() {
    if (busy) throw Object.assign(Error('An update is already running.'), { status: 409 });
    busy = true;
    try {
      const info = await check(true);
      if (!info.available) throw Object.assign(Error('Already up to date.'), { status: 409 });
      await run('git', ['fetch', '--quiet', '--tags', 'origin']);
      try {
        await run('git', ['merge', '--ff-only', info.tag]);
      } catch {
        throw Object.assign(Error('This copy has local changes that the release does not include. Update it by hand with git.'), { status: 409 });
      }
      const npm = join(nodeBin, 'npm');
      await run(existsSync(npm) ? npm : 'npm', ['ci', '--no-audit', '--no-fund'], 300_000);
      await run(existsSync(npm) ? npm : 'npm', ['run', 'build'], 300_000);
      console.log(`Updated ${current} -> ${info.latest}; restarting.`);
      setTimeout(restart, 400);
      return { ok: true, version: info.latest };
    } finally {
      busy = false;
    }
  }

  return { current, check, apply };
}

/** launchd restarts us when we exit; a hand-started server re-launches itself. */
export function restartProcess(server) {
  const managed = process.ppid === 1 && process.env.XPC_SERVICE_NAME && process.env.XPC_SERVICE_NAME !== '0';
  if (managed) return process.exit(0);
  server.close();
  server.closeAllConnections?.();
  spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: 'inherit', env: process.env }).unref();
  setTimeout(() => process.exit(0), 200);
}
