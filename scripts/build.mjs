import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { isAozoraUrl, validateEntry } from './lib.mjs';

const execFileAsync = promisify(execFile);

const root = new URL('../', import.meta.url);
const entriesDir = new URL('../entries/', import.meta.url);
const checksPath = new URL('../data/checks.json', import.meta.url);
const siteDir = new URL('../_site/', import.meta.url);
const repoDir = fileURLToPath(root);

async function readAddedAtByFile() {
  try {
    const { stdout } = await execFileAsync('git', [
      'log',
      '--diff-filter=A',
      '--format=@@%cI',
      '--name-only',
      '--',
      'entries'
    ], { cwd: repoDir });
    const addedAt = new Map();
    let stamp = '';
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('@@')) {
        stamp = line.slice(2);
        continue;
      }
      if (stamp && line.startsWith('entries/') && line.endsWith('.json')) {
        const name = line.slice('entries/'.length);
        if (!addedAt.has(name)) addedAt.set(name, stamp);
      }
    }
    return addedAt;
  } catch (error) {
    console.log(`::warning::追加時刻をGit履歴から取得できませんでした: ${error.message}`);
    return new Map();
  }
}

async function readJson(url, fallback) {
  try { return JSON.parse(await readFile(url, 'utf8')); }
  catch { return fallback; }
}

function citationWithCheck(citation, key, checks) {
  const saved = checks[key];
  const fallbackStatus = isAozoraUrl(citation.url) ? 'error' : 'skip';
  const check = saved?.quote === citation.quote
    ? { status: saved.status, ...(saved.fragment ? { fragment: saved.fragment } : {}) }
    : { status: fallbackStatus };
  return { ...citation, check };
}

function hydrateChecks(entry, checks) {
  return {
    ...entry,
    citations: (entry.citations || []).map((citation, index) => citationWithCheck(citation, `${entry.id}#c${index}`, checks)),
    siblings: (entry.siblings || []).map((sibling, index) => sibling.citation
      ? { ...sibling, citation: citationWithCheck(sibling.citation, `${entry.id}#s${index}`, checks) }
      : sibling)
  };
}

async function main() {
  const checks = await readJson(checksPath, {});
  const addedAtByFile = await readAddedAtByFile();
  const names = (await readdir(entriesDir)).filter((name) => name.endsWith('.json')).sort();
  const entries = [];
  const invalid = [];
  const seenWords = new Map();

  for (const name of names) {
    let entry;
    try {
      entry = JSON.parse(await readFile(join(entriesDir.pathname, name), 'utf8'));
    } catch (error) {
      const reason = `JSONを読めません: ${error.message}`;
      invalid.push({ file: name, reason });
      console.log(`::warning file=entries/${name}::${reason}`);
      continue;
    }

    const result = validateEntry(entry, name);
    for (const warning of result.warnings) console.log(`::warning file=entries/${name}::${warning}`);
    if (!result.valid) {
      const reason = result.errors.join(' / ');
      invalid.push({ file: name, reason });
      console.log(`::warning file=entries/${name}::${reason}`);
      continue;
    }

    if (seenWords.has(entry.word)) {
      console.log(`::warning file=entries/${name}::見出し語「${entry.word}」は ${seenWords.get(entry.word)} と重複しています`);
    } else seenWords.set(entry.word, name);

    entries.push({
      ...hydrateChecks(entry, checks),
      addedAt: addedAtByFile.get(name) || `${entry.date}T00:00:00+09:00`
    });
  }

  entries.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const words = [];
  for (const entry of entries) {
    words.push({ word: entry.word, reading: entry.reading, id: entry.id, date: entry.date, role: 'main', functionTag: entry.functionTag });
    for (const sibling of entry.siblings || []) words.push({ word: sibling.word, reading: sibling.reading, id: entry.id, date: entry.date, role: 'sibling' });
  }

  await rm(siteDir, { recursive: true, force: true });
  await mkdir(new URL('./data/', siteDir), { recursive: true });
  await mkdir(new URL('./assets/', siteDir), { recursive: true });
  await mkdir(new URL('./scripts/', siteDir), { recursive: true });

  await writeFile(new URL('./data/index.json', siteDir), `${JSON.stringify({ generatedAt: new Date().toISOString(), entries, invalid }, null, 2)}\n`);
  await writeFile(new URL('./data/words.json', siteDir), `${JSON.stringify(words, null, 2)}\n`);

  for (const file of ['index.html', 'manifest.webmanifest']) await cp(new URL(`../${file}`, import.meta.url), new URL(`./${file}`, siteDir));
  await cp(new URL('../assets/', import.meta.url), new URL('./assets/', siteDir), { recursive: true });
  await cp(new URL('./lib.mjs', import.meta.url), new URL('./scripts/lib.mjs', siteDir));

  console.log(`公開対象: ${entries.length}件 / 不備: ${invalid.length}件`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
