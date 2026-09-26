export const FUNCTION_TAGS = [
  'へりくだる', '恐縮する', '感謝する', '人を立てる', '頼む', '名残を惜しむ', '断る',
  '仕方なさ', '少し批判する', '控えめに喜ぶ', '言い切らない', '理由をぼかす', '親愛を示す', '引いて語る'
];

export const DIST_LABELS = ['', '今の言葉', '文章語', '古風で自然', '文学的', '歴史的'];
export const REUNION_DAYS = [3, 7, 14, 30, 60, 120];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AOZORA_RE = /^https:\/\/www\.aozora\.gr\.jp\/cards\/\d+\/files\/[^/?#]+\.html$/;
const RUBY_ON = '\uE000';
const RUBY_OFF = '\uE001';

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.length > 0;
const textLength = (value) => [...String(value ?? '')].length;

function validateCitation(citation, path, errors) {
  if (!isObject(citation)) {
    errors.push(`${path} はオブジェクトである必要があります`);
    return;
  }
  for (const key of ['quote', 'author', 'work', 'url']) {
    if (!isText(citation[key])) errors.push(`${path}.${key} は必須です`);
  }
  if (isText(citation.quote) && textLength(citation.quote) > 80) errors.push(`${path}.quote は80字以内です`);
  if (isText(citation.url) && !/^https:\/\//.test(citation.url)) errors.push(`${path}.url は https:// で始めてください`);
  if (citation.year !== undefined && (!Number.isInteger(citation.year) || citation.year < 1)) errors.push(`${path}.year は正の整数です`);
}

export function validateEntry(entry, filename = '') {
  const errors = [];
  const warnings = [];
  if (!isObject(entry)) return { valid: false, errors: ['JSONのルートはオブジェクトである必要があります'], warnings };

  for (const key of ['id', 'date', 'functionTag', 'function', 'word', 'reading', 'gist', 'plain', 'swap', 'why', 'citations', 'examples', 'oneLine', 'caution']) {
    if (entry[key] === undefined || entry[key] === null || entry[key] === '') errors.push(`${key} は必須です`);
  }
  if (isText(entry.id) && !ID_RE.test(entry.id)) errors.push('id は YYYY-MM-DD-ローマ字 の形にしてください');
  if (isText(entry.date) && !DATE_RE.test(entry.date)) errors.push('date は YYYY-MM-DD の形にしてください');
  if (isText(entry.id) && isText(entry.date) && !entry.id.startsWith(`${entry.date}-`)) errors.push('id の先頭日付と date が一致していません');
  if (filename && isText(entry.id) && filename.replace(/\.json$/, '') !== entry.id) errors.push('id とファイル名が一致していません');

  if (isText(entry.functionTag) && !FUNCTION_TAGS.includes(entry.functionTag)) warnings.push(`functionTag「${entry.functionTag}」は既定14語にありません`);
  if (isText(entry.function) && textLength(entry.function) > 40) errors.push('function は40字以内です');
  if (isText(entry.gist) && textLength(entry.gist) > 30) errors.push('gist は30字以内です');
  if (!Number.isInteger(entry.distance) || entry.distance < 1 || entry.distance > 5) errors.push('distance は1〜5の整数です');

  if (!Array.isArray(entry.plain) || entry.plain.length < 1 || entry.plain.length > 6 || entry.plain.some((v) => !isText(v))) {
    errors.push('plain は1〜6個の文字列です');
  }

  if (!isObject(entry.swap)) {
    errors.push('swap はオブジェクトです');
  } else {
    for (const key of ['before', 'plain', 'after', 'note']) {
      if (typeof entry.swap[key] !== 'string') errors.push(`swap.${key} は文字列です`);
    }
    if (typeof entry.swap.note === 'string' && textLength(entry.swap.note) > 25) errors.push('swap.note は25字以内です');
    if (typeof entry.swap.plain === 'string' && Array.isArray(entry.plain) && !entry.plain.includes(entry.swap.plain)) warnings.push('swap.plain が plain 配列に含まれていません');
  }

  if (!Array.isArray(entry.citations) || entry.citations.length < 1 || entry.citations.length > 3) {
    errors.push('citations は1〜3件です');
  } else {
    entry.citations.forEach((c, index) => validateCitation(c, `citations[${index}]`, errors));
  }

  if (!isObject(entry.examples)) {
    errors.push('examples はオブジェクトです');
  } else {
    for (const key of ['close', 'polite', 'essay']) if (!isText(entry.examples[key])) errors.push(`examples.${key} は必須です`);
  }

  if (entry.siblings !== undefined) {
    if (!Array.isArray(entry.siblings) || entry.siblings.length > 6) {
      errors.push('siblings は0〜6件です');
    } else {
      entry.siblings.forEach((s, index) => {
        const path = `siblings[${index}]`;
        if (!isObject(s)) {
          errors.push(`${path} はオブジェクトです`);
          return;
        }
        for (const key of ['word', 'reading', 'distance', 'gist', 'note']) if (s[key] === undefined || s[key] === '') errors.push(`${path}.${key} は必須です`);
        if (!Number.isInteger(s.distance) || s.distance < 1 || s.distance > 5) errors.push(`${path}.distance は1〜5の整数です`);
        if (s.citation !== undefined) validateCitation(s.citation, `${path}.citation`, errors);
      });
    }
  }

  if (entry.refs !== undefined) {
    if (!Array.isArray(entry.refs)) errors.push('refs は配列です');
    else entry.refs.forEach((ref, index) => {
      if (!isObject(ref) || !isText(ref.label) || !isText(ref.url) || !/^https:\/\//.test(ref.url)) errors.push(`refs[${index}] は label と https URL が必要です`);
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function isAozoraUrl(url) {
  return typeof url === 'string' && AOZORA_RE.test(url);
}

export function decodeHtmlEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const hex = body[1]?.toLowerCase() === 'x';
      const raw = hex ? body.slice(2) : body.slice(1);
      const cp = Number.parseInt(raw, hex ? 16 : 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : whole;
    }
    return named[body.toLowerCase()] ?? whole;
  });
}

export function normalizeQuote(text) {
  return decodeHtmlEntities(String(text ?? ''))
    .replace(/[（(][ぁ-ゖァ-ヺー・ゝゞヽヾ\s]+[）)]/g, '')
    .replace(/[\s\u3000]+/g, '');
}

export function parseAozoraMainText(html) {
  const source = String(html ?? '');
  const startMatch = /<div\b[^>]*class=["'][^"']*\bmain_text\b[^"']*["'][^>]*>/i.exec(source);
  if (!startMatch) throw new Error('main_text が見つかりません');
  const start = startMatch.index + startMatch[0].length;
  const end = source.indexOf('</div>', start);
  if (end < 0) throw new Error('main_text の終端が見つかりません');
  let body = source.slice(start, end);
  body = body.replace(/<rp\b[^>]*>[\s\S]*?<\/rp>/gi, '');
  body = body.replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, '');
  body = body.replace(/<rb\b[^>]*>([\s\S]*?)<\/rb>/gi, `${RUBY_ON}$1${RUBY_OFF}`);
  body = body.replace(/<br\s*\/?\s*>/gi, ' ');
  body = body.replace(/<[^>]+>/g, '');
  body = decodeHtmlEntities(body);

  let ruby = false;
  let text = '';
  const rubyFlags = [];
  for (const ch of body) {
    if (ch === RUBY_ON) { ruby = true; continue; }
    if (ch === RUBY_OFF) { ruby = false; continue; }
    if (/\s|\u3000/.test(ch)) continue;
    text += ch;
    rubyFlags.push(ruby);
  }
  return { text, rubyFlags };
}

const encodeFragmentPart = (value) => encodeURIComponent(value).replace(/-/g, '%2D');

export function makeTextFragment(parsed, quote) {
  const needle = normalizeQuote(quote);
  const index = parsed.text.indexOf(needle);
  if (index < 0 || !needle) return null;
  const endIndex = index + [...needle].length;
  const flags = parsed.rubyFlags.slice(index, endIndex);
  const hasRuby = flags.some(Boolean);

  if (!hasRuby) return encodeFragmentPart(needle);

  const chars = [...parsed.text];
  let start = '';
  for (let i = index; i < endIndex && start.length < 8 && !parsed.rubyFlags[i]; i += 1) start += chars[i];
  if (!start) return null;

  let end = '';
  for (let i = endIndex - 1; i >= index && end.length < 8 && !parsed.rubyFlags[i]; i -= 1) end = chars[i] + end;
  if (end.length < 2) end = '';

  let prefix = '';
  if (index >= 3) {
    const candidateFlags = parsed.rubyFlags.slice(index - 3, index);
    if (candidateFlags.length === 3 && candidateFlags.every((v) => !v)) prefix = chars.slice(index - 3, index).join('');
  }

  return `${prefix ? `${encodeFragmentPart(prefix)}-,` : ''}${encodeFragmentPart(start)}${end ? `,${encodeFragmentPart(end)}` : ''}`;
}

export function checkCitationAgainstText(entry, citation, parsed) {
  const quote = normalizeQuote(citation.quote);
  const quoteIndex = parsed.text.indexOf(quote);
  if (quote && quoteIndex >= 0) return { status: 'ok', fragment: makeTextFragment(parsed, citation.quote) };
  const candidates = [entry.word, entry.notation].filter(Boolean).map(normalizeQuote);
  if (candidates.some((word) => word && parsed.text.includes(word))) return { status: 'word' };
  return { status: 'missing' };
}

export function parseDate(date) {
  if (!DATE_RE.test(String(date))) throw new Error(`invalid date: ${date}`);
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(date, days) {
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / 86400000);
}

export function mondayOf(date) {
  const day = parseDate(date).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export function weekRange(date) {
  const start = mondayOf(date);
  return { start, end: addDays(start, 6) };
}

export function pickReunion(entries, used, today) {
  return [...entries]
    .filter((entry) => entry.date <= today)
    .filter((entry) => !(used?.[entry.id]?.length))
    .map((entry) => ({ entry, days: daysBetween(entry.date, today) }))
    .filter(({ days }) => REUNION_DAYS.includes(days))
    .sort((a, b) => a.days - b.days || b.entry.date.localeCompare(a.entry.date))[0]?.entry ?? null;
}

export function searchWords(entries, rawQuery) {
  const query = String(rawQuery ?? '').trim();
  if (!query) return [];
  const results = [];
  for (const entry of entries) {
    const haystack = [entry.word, entry.reading, entry.notation, entry.function, entry.functionTag, ...(entry.plain || [])].filter(Boolean);
    const mainHit = haystack.some((value) => value.includes(query) || (value.length >= 2 && query.includes(value)));
    if (mainHit) {
      results.push({ entry, sibling: null });
      for (const sibling of entry.siblings || []) results.push({ entry, sibling });
      continue;
    }
    for (const sibling of entry.siblings || []) {
      if ([sibling.word, sibling.reading].some((value) => value.includes(query) || query.includes(value))) results.push({ entry, sibling });
    }
  }
  return results;
}

export function findDraftSpots(entries, text, used = {}) {
  const spots = [];
  for (const entry of entries) {
    for (const plain of entry.plain || []) {
      if ([...plain].length < 3) continue;
      for (let index = text.indexOf(plain); index >= 0; index = text.indexOf(plain, index + plain.length)) {
        spots.push({ entry, plain, index });
      }
    }
  }
  return spots.sort((a, b) => {
    const aUsed = used?.[a.entry.id]?.length ? 1 : 0;
    const bUsed = used?.[b.entry.id]?.length ? 1 : 0;
    return aUsed - bUsed
      || Math.abs(a.entry.distance - 3) - Math.abs(b.entry.distance - 3)
      || b.entry.date.localeCompare(a.entry.date)
      || a.index - b.index;
  });
}

export function mergeRecords(current, incoming) {
  const base = {
    used: isObject(current?.used) ? structuredClone(current.used) : {},
    swapped: isObject(current?.swapped) ? structuredClone(current.swapped) : {},
    hintSeen: Boolean(current?.hintSeen)
  };
  if (!isObject(incoming)) return base;
  if (isObject(incoming.used)) {
    for (const [id, dates] of Object.entries(incoming.used)) {
      if (!Array.isArray(dates)) continue;
      const validDates = dates.filter((date) => DATE_RE.test(String(date)));
      base.used[id] = [...new Set([...(base.used[id] || []), ...validDates])].sort();
      if (!base.used[id].length) delete base.used[id];
    }
  }
  if (isObject(incoming.swapped)) for (const [id, value] of Object.entries(incoming.swapped)) if (value) base.swapped[id] = true;
  base.hintSeen = base.hintSeen || Boolean(incoming.hintSeen);
  return base;
}
