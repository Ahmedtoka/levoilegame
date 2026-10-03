#!/usr/bin/env node
// Downloads every product image (and the brand logo) to public/.
//
//   node scripts/fetch-assets.mjs            validate + download
//   node scripts/fetch-assets.mjs --check    validate URLs only
//
// Remote URLs are read from src/data/products.remote.json when it exists
// (products.json is rewritten to local paths after the first run), otherwise
// from src/data/products.json.
//
// Output: public/products/<productId>/<n>.jpg   (n is 1-based)
//         public/brand/logo.png
//         scripts/fetch-report.json              (broken URLs + failures)

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'src/data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const LOGO_URL = 'https://levoilestores.com/cdn/shop/files/le_voile_logo-01_1.png';

const CHECK_ONLY = process.argv.includes('--check');
const RETRIES = 3;
const CONCURRENCY = 6;
const TIMEOUT_MS = 30_000;
// Ask for JPEG explicitly: Shopify's CDN negotiates WebP/AVIF from Accept.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (LevoileVirtualStore asset fetcher)',
  Accept: 'image/jpeg,image/png;q=0.9,*/*;q=0.5',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, init = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // 4xx (other than 429) won't get better on retry.
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (attempt < RETRIES) await sleep(500 * 2 ** (attempt - 1));
  }
  throw lastErr;
}

/** HEAD first; fall back to a ranged GET for servers that reject HEAD. */
async function validate(url) {
  try {
    let res = await fetchWithRetry(url, { method: 'HEAD' });
    if (res.status === 405 || res.status === 403) {
      res = await fetchWithRetry(url, { method: 'GET', headers: { ...HEADERS, Range: 'bytes=0-0' } });
      await res.body?.cancel();
    }
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    if (!type.startsWith('image/')) return { ok: false, reason: `not an image (${type || 'no content-type'})` };
    return { ok: true, type };
  } catch (err) {
    return { ok: false, reason: err.message ?? String(err) };
  }
}

function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return 'unknown';
}

async function download(url, dest) {
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`suspiciously small (${buf.length} bytes)`);
  const fmt = sniff(buf);
  if (fmt === 'unknown') throw new Error('response is not a recognised image');
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, dest);
  return { bytes: buf.length, fmt };
}

async function pool(items, worker) {
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const item = items[i++];
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, run));
}

async function main() {
  const remoteFile = path.join(DATA_DIR, 'products.remote.json');
  const srcFile = existsSync(remoteFile) ? remoteFile : path.join(DATA_DIR, 'products.json');
  const data = JSON.parse(await fs.readFile(srcFile, 'utf8'));
  console.log(`Source: ${path.relative(ROOT, srcFile)} — ${data.products.length} products`);

  const jobs = [];
  for (const p of data.products) {
    p.images.forEach((url, idx) => {
      if (!/^https?:\/\//.test(url)) return; // already local
      jobs.push({ id: p.id, n: idx + 1, url, dest: path.join(PUBLIC_DIR, 'products', p.id, `${idx + 1}.jpg`) });
    });
  }
  jobs.push({ id: 'brand', n: 'logo', url: LOGO_URL, dest: path.join(PUBLIC_DIR, 'brand', 'logo.png') });

  // 1. Validate
  console.log(`Validating ${jobs.length} URLs…`);
  const broken = [];
  await pool(jobs, async (job) => {
    const v = await validate(job.url);
    job.valid = v.ok;
    if (!v.ok) {
      broken.push({ id: job.id, n: job.n, url: job.url, reason: v.reason });
      console.warn(`  BROKEN ${job.id}#${job.n}: ${v.reason}`);
    }
  });
  console.log(`  ${jobs.length - broken.length} ok, ${broken.length} broken`);

  // 2. Download
  const stats = { downloaded: 0, skipped: 0, failed: 0, nonJpeg: [] };
  const failures = [];
  if (!CHECK_ONLY) {
    console.log('Downloading…');
    await pool(jobs, async (job) => {
      if (existsSync(job.dest)) {
        stats.skipped++;
        return;
      }
      try {
        const { bytes, fmt } = await download(job.url, job.dest);
        stats.downloaded++;
        const expected = job.dest.endsWith('.png') ? 'png' : 'jpeg';
        if (fmt !== expected) stats.nonJpeg.push(`${job.id}#${job.n} (${fmt})`);
        console.log(`  ✓ ${path.relative(PUBLIC_DIR, job.dest)} (${(bytes / 1024).toFixed(0)} KB)`);
      } catch (err) {
        stats.failed++;
        failures.push({ id: job.id, n: job.n, url: job.url, reason: err.message ?? String(err) });
        console.error(`  ✗ ${job.id}#${job.n}: ${err.message ?? err}`);
      }
    });
  }

  const report = { at: new Date().toISOString(), total: jobs.length, broken, failures, ...stats };
  await fs.writeFile(path.join(ROOT, 'scripts', 'fetch-report.json'), JSON.stringify(report, null, 2));

  console.log('\nSummary');
  console.log(`  URLs:        ${jobs.length}`);
  console.log(`  Broken:      ${broken.length}`);
  if (!CHECK_ONLY) {
    console.log(`  Downloaded:  ${stats.downloaded}`);
    console.log(`  Skipped:     ${stats.skipped} (already on disk)`);
    console.log(`  Failed:      ${stats.failed}`);
    if (stats.nonJpeg.length) console.log(`  Wrong format: ${stats.nonJpeg.join(', ')}`);
  }
  console.log('  Report:      scripts/fetch-report.json');
  process.exitCode = broken.length || failures.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
