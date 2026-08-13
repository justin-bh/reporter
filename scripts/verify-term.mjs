// Verify the reporter-term recording + upload path without an interactive TTY:
// record a real command through node-pty into asciicast v2, then upload it as
// terminal-recording evidence via @reporter/api-client.
//
//   REPORTER_URL=... REPORTER_ACCESS_KEY=... REPORTER_SECRET_KEY=... node scripts/verify-term.mjs
import { performance } from 'node:perf_hooks';
import ptyPkg from 'node-pty';
import { ReporterClient } from '@reporter/api-client';

const baseUrl = process.env.REPORTER_URL ?? 'http://localhost:8080';
const accessKey = process.env.REPORTER_ACCESS_KEY;
const secretKey = process.env.REPORTER_SECRET_KEY;
if (!accessKey || !secretKey) {
  console.error('Set REPORTER_ACCESS_KEY and REPORTER_SECRET_KEY (see seed output).');
  process.exit(2);
}

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// --- Record a command through a PTY into asciicast v2 ---
const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
const args = process.platform === 'win32'
  ? ['-Command', 'echo "hello from reporter-term"']
  : ['-lc', 'echo "hello from reporter-term"; id | head -1'];

const p = ptyPkg.spawn(shell, args, {
  name: 'xterm-256color',
  cols: 80,
  rows: 24,
  cwd: process.cwd(),
  env: process.env,
});

const start = performance.now();
const lines = [
  JSON.stringify({ version: 2, width: 80, height: 24, timestamp: Math.floor(Date.now() / 1000) }),
];
p.onData((d) => lines.push(JSON.stringify([(performance.now() - start) / 1000, 'o', d])));

await new Promise((resolve) => p.onExit(() => resolve()));
const cast = lines.join('\n') + '\n';

check('pty produced output events', lines.length > 1, `${lines.length - 1} event(s)`);
const header = JSON.parse(lines[0]);
check('asciicast v2 header', header.version === 2 && header.width === 80);
check('recording captured the command output', cast.includes('hello from reporter-term'));

// --- Upload as terminal-recording evidence ---
const client = new ReporterClient({ baseUrl, accessKey, secretKey });
try {
  const ops = await client.listOperations();
  const slug = ops.find((o) => o.slug === 'acme-assessment')?.slug ?? ops[0]?.slug;
  const ev = await client.createEvidence(
    slug,
    { contentType: 'terminal-recording', description: 'verify-term recording', tagIds: [] },
    { filename: 'session.cast', contentType: 'application/x-asciicast', data: Buffer.from(cast) },
  );
  check('uploaded as terminal-recording', ev.contentType === 'terminal-recording', ev.uuid);
  check('evidence has content', ev.hasContent === true);
} catch (err) {
  check('upload recording', false, String(err));
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
