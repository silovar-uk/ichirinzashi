import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  checkCitationAgainstText,
  isAozoraUrl,
  parseAozoraMainText,
  validateEntry
} from './lib.mjs';

const ROOT = new URL('../', import.meta.url);
const entriesDir = new URL('../entries/', import.meta.url);
const checksPath = new URL('../data/checks.json', import.meta.url);
const USER_AGENT = 'ichirinzashi (+https://github.com/silovar-uk/ichirinzashi)';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function jstDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function readJson(url, fallback) {
  try { return JSON.parse(await readFile(url, 'utf8')); }
  catch { return fallback; }
}

let lastFetchAt = 0;
const pageCache = new Map();
async function fetchAozora(url) {
  if (pageCache.has(url)) return pageCache.get(url);
  const promise = (async () => {
    const wait = 1000 - (Date.now() - lastFetchAt);
    if (lastFetchAt && wait > 0) await sleep(wait);
    lastFetchAt = Date.now();
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return new TextDecoder('shift_jis').decode(bytes);
  })();
  pageCache.set(url, promise);
  return promise;
}

function citationsFor(entry) {
  const items = [];
  (entry.citations || []).forEach((citation, index) => items.push({ key: `${entry.id}#c${index}`, citation }));
  (entry.siblings || []).forEach((sibling, index) => {
    if (sibling.citation) items.push({ key: `${entry.id}#s${index}`, citation: sibling.citation });
  });
  return items;
}

async function main() {
  const checks = await readJson(checksPath, {});
  const names = (await readdir(entriesDir)).filter((name) => name.endsWith('.json')).sort();
  const checkedAt = jstDate();

  for (const name of names) {
    let entry;
    try { entry = JSON.parse(await readFile(join(entriesDir.pathname, name), 'utf8')); }
    catch (error) {
      console.log(`::warning file=entries/${name}::JSONを読めません: ${error.message}`);
      continue;
    }
    const validation = validateEntry(entry, name);
    if (!validation.valid) continue;

    for (const { key, citation } of citationsFor(entry)) {
      const old = checks[key];
      if (old?.quote === citation.quote && ['ok', 'word', 'missing', 'skip'].includes(old.status)) continue;

      if (!isAozoraUrl(citation.url)) {
        checks[key] = { quote: citation.quote, status: 'skip', checkedAt };
        continue;
      }

      try {
        const html = await fetchAozora(citation.url);
        const parsed = parseAozoraMainText(html);
        const result = checkCitationAgainstText(entry, citation, parsed);
        checks[key] = {
          quote: citation.quote,
          status: result.status,
          ...(result.fragment ? { fragment: result.fragment } : {}),
          checkedAt
        };
        console.log(`${key}: ${result.status}`);
      } catch (error) {
        if (old?.quote !== citation.quote) delete checks[key];
        console.log(`::warning file=entries/${name}::${key} の原文照合に失敗しました: ${error.message}`);
      }
    }
  }

  const sorted = Object.fromEntries(Object.entries(checks).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(checksPath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
