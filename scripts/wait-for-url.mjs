import http from 'node:http';
import https from 'node:https';

const target = process.argv[2];
const timeoutMs = Number(process.env.WAIT_FOR_URL_TIMEOUT_MS || 30_000);
const intervalMs = Number(process.env.WAIT_FOR_URL_INTERVAL_MS || 500);
const startedAt = Date.now();

if (!target) {
  console.error('Usage: node scripts/wait-for-url.mjs <url>');
  process.exit(1);
}

function probe(url) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(parsed, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 500);
    });
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

while (Date.now() - startedAt < timeoutMs) {
  if (await probe(target)) process.exit(0);
  await new Promise(resolve => setTimeout(resolve, intervalMs));
}

console.error(`Timed out waiting for ${target}`);
process.exit(1);
