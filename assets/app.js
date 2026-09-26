import {
  DIST_LABELS,
  addDays,
  findDraftSpots,
  mergeRecords,
  mondayOf,
  parseDate,
  pickReunion,
  searchWords,
  weekRange
} from '../scripts/lib.mjs';

const KEY = 'ichirinzashi:v1';
const KANJI_NUM = ['〇', '一', '二', '三', '四', '五', '六', '七'];
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const DEFAULT_STORE = { used: {}, swapped: {}, hintSeen: false };

let data = { entries: [], invalid: [] };
let entries = [];
let store = loadStore();
let draft = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const usedDates = (id) => Array.isArray(store.used?.[id]) ? store.used[id] : [];
const isUsed = (id) => usedDates(id).length > 0;
const byId = (id) => entries.find((entry) => entry.id === id);
const addedAtMs = (entry) => {
  const value = Date.parse(entry?.addedAt || `${entry?.date || '1970-01-01'}T00:00:00+09:00`);
  return Number.isFinite(value) ? value : 0;
};
const compareAddedDesc = (a, b) => addedAtMs(b) - addedAtMs(a)
  || String(b?.date || '').localeCompare(String(a?.date || ''))
  || String(b?.id || '').localeCompare(String(a?.id || ''));

function loadStore() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY));
    if (value && typeof value === 'object') return mergeRecords(DEFAULT_STORE, value);
  } catch {}
  return structuredClone(DEFAULT_STORE);
}

function saveStore() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {}
}

function localToday() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function today() {
  const params = new URLSearchParams(location.search);
  const candidate = params.get('today');
  if (candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate;
  return localToday();
}

function visibleEntries() {
  const t = today();
  return entries.filter((entry) => entry.date <= t);
}

function latest() { return [...visibleEntries()].sort(compareAddedDesc)[0] ?? null; }
function md(date) { const d = parseDate(date); return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`; }
function mdDot(date) { const d = parseDate(date); return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`; }
function dow(date) { return DOW[parseDate(date).getUTCDay()]; }
function isWeekend(date) { return [0, 6].includes(parseDate(date).getUTCDay()); }
function hl(text, word) { const i = text.indexOf(word); return i < 0 ? esc(text) : `${esc(text.slice(0, i))}<em>${esc(word)}</em>${esc(text.slice(i + word.length))}`; }

function route() {
  const raw = location.hash || '#/';
  const hash = raw.startsWith('#') ? raw.slice(1) : raw;
  const [path, query = ''] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return { name: 'home' };
  if (parts[0] === 'w' && parts[1]) return { name: 'word', id: decodeURIComponent(parts.slice(1).join('/')) };
  if (parts[0] === 'week') return { name: 'week' };
  if (parts[0] === 'hiku') return { name: 'hiku', query: new URLSearchParams(query).get('q') || '' };
  if (parts[0] === 'tana') return { name: 'tana' };
  return { name: 'home' };
}

function setNav(name) {
  const current = name === 'home' ? (isWeekend(today()) ? 'week' : '') : name;
  document.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.dataset.nav === current) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
}

function render() {
  const r = route();
  let html = '';
  if (!entries.length && !data.invalid.length) html = '<p class="empty">まだ一輪も届いていません。最初の一輪は、毎朝6時半ごろに届きます。</p>';
  else if (r.name === 'home') html = isWeekend(today()) ? weekHTML({ newestFirst: true }) : morningHTML();
  else if (r.name === 'word') html = byId(r.id) ? entryHTML(byId(r.id), 'word') : '<p class="empty">その一輪は見つかりませんでした。</p>';
  else if (r.name === 'week') html = weekHTML();
  else if (r.name === 'hiku') html = hikuHTML(r.query);
  else if (r.name === 'tana') html = tanaHTML();
  document.getElementById('main').innerHTML = html;
  setNav(r.name);
  bindRouteInputs(r);
  updateFooter();
}

function bindRouteInputs(r) {
  if (r.name === 'hiku') {
    const q = document.getElementById('q');
    if (!q) return;
    q.addEventListener('input', () => updateResults(q.value));
    if (q.value.trim()) updateResults(q.value);
  }
}

function morningHTML() {
  const entry = latest();
  if (!entry) return '<p class="empty">まだ一輪も届いていません。最初の一輪は、毎朝6時半ごろに届きます。</p>';
  return entryHTML(entry, 'morning');
}

function entryHTML(entry, mode) {
  const persistedOpen = Boolean(store.swapped[entry.id]);
  const eyebrow = mode === 'morning' && entry.date === today()
    ? `${md(entry.date)}(${dow(entry.date)})<b>今朝の一輪</b>`
    : `${md(entry.date)}(${dow(entry.date)})の一輪`;
  const late = mode === 'morning' && entry.date !== today()
    ? '<p class="late">今朝の一輪は、まだ届いていません。毎朝6時半ごろに届きます。</p>' : '';
  return `<article class="entry" data-id="${esc(entry.id)}">
    ${mode === 'word' ? '<a class="back" href="#/">← 戻る</a>' : ''}
    <p class="eyebrow">${eyebrow}</p>${late}
    <div class="entry-grid">
      <div class="tanzaku-wrap">
        <figure class="tanzaku">
          <figcaption class="kotobagaki">${esc(entry.function)}</figcaption>
          <p class="ichibun">${esc(entry.swap.before)}<span class="slot" role="button" tabindex="0" aria-pressed="${persistedOpen}">${esc(persistedOpen ? entry.word : entry.swap.plain)}</span>${esc(entry.swap.after)}</p>
        </figure>
        <p class="note" aria-live="polite">${persistedOpen ? esc(entry.swap.note) : ''}</p>
        ${!store.hintSeen && !persistedOpen ? '<p class="hint">点線の言葉に触れると、一輪挿せます</p>' : ''}
      </div>
      <div class="side">
        <p class="veil"${persistedOpen ? ' hidden' : ''}>蕾に触れると、言葉と実例がひらきます。</p>
        <div class="reveal"${persistedOpen ? '' : ' hidden'}>${revealHTML(entry)}</div>
        ${mode === 'morning' ? reunionHTML() : ''}
      </div>
    </div>
  </article>`;
}

function revealHTML(entry) {
  const hasKanji = /[一-龯]/.test(entry.word);
  const headword = hasKanji ? `<ruby>${esc(entry.word)}<rt>${esc(entry.reading)}</rt></ruby>` : esc(entry.word);
  const first = entry.citations?.[0];
  const blocks = [
    `<div class="hw-block"><h1 class="hw">${headword}</h1><p class="hw-meta">${entry.notation && entry.notation !== entry.word ? `<span>${esc(entry.notation)}</span>` : ''}<span>時代距離 ${entry.distance}・${esc(DIST_LABELS[entry.distance])}</span></p><p class="gist">${esc(entry.gist)}</p></div>`,
    entryRulerHTML(entry),
    first ? citeHTML(first) : '',
    `<div class="oneline"><p class="label">今日から使うなら</p><p class="line">${hl(entry.oneLine, entry.word)}</p><button type="button" class="btn-ghost copy" data-copy="${esc(entry.oneLine)}">写す</button></div>`,
    useHTML(entry),
    moreHTML(entry)
  ].filter(Boolean);
  return blocks.map((block, index) => block.replace(/^<(\w+)/, `<$1 style="--i:${index}"`)).join('');
}

function rulerShell(title, cols, extra = '') {
  const axis = [1,2,3,4,5].map((distance) => `<span><b>${distance}</b>${esc(DIST_LABELS[distance])}</span>`).join('');
  return `<div class="ruler" role="group" aria-label="${esc(title)}（時代距離の物差し）"><p class="label">${esc(title)}<span>今 → 昔</span></p><div class="ruler-cols">${cols}</div><div class="axis" aria-hidden="true">${axis}</div>${extra}</div>`;
}

function entryRulerHTML(entry) {
  const items = [{ word: entry.word, distance: entry.distance, main: true }, ...(entry.siblings || []).map((sibling, index) => ({ ...sibling, index }))];
  const cols = [1,2,3,4,5].map((distance) => `<div class="col">${items.filter((item) => item.distance === distance).map((item) => item.main
    ? `<span class="stem main">${esc(item.word)}</span>`
    : `<span class="stem" role="button" tabindex="0" aria-expanded="false" data-sib="${item.index}">${esc(item.word)}</span>`).join('')}</div>`).join('');
  return rulerShell('同じ働きの言葉', cols, '<p class="sib-note" aria-live="polite"></p>');
}

function citationStatus(citation) {
  const status = citation.check?.status || 'error';
  if (status === 'ok') return { label: '実例', badge: '原文照合済み', klass: '' };
  if (status === 'word') return { label: '出典候補', badge: '語のみ確認', klass: ' warn' };
  if (status === 'missing') return { label: '出典候補', badge: '原文未確認', klass: ' warn' };
  return { label: '出典候補', badge: '未照合', klass: ' warn' };
}

function citationHref(citation) {
  if (citation.check?.status === 'ok' && citation.check.fragment) return `${citation.url}#:~:text=${citation.check.fragment}`;
  return citation.url;
}

function citeHTML(citation) {
  const state = citationStatus(citation);
  const linkLabel = citation.check?.status === 'ok' && citation.check.fragment ? '原文で光らせる' : '原文を開く';
  return `<figure class="cite"><p class="label">${state.label}<span class="chk${state.klass}">${state.badge}</span></p><blockquote>「${esc(citation.quote)}」</blockquote><figcaption>${esc(citation.author)}『${esc(citation.work)}』${citation.year ? ` ${citation.year}` : ''}</figcaption>${citation.context ? `<p class="ctx">${esc(citation.context)}</p>` : ''}<a class="hikaru" href="${esc(citationHref(citation))}" target="_blank" rel="noopener">${linkLabel}<span aria-hidden="true"> ↗</span></a></figure>`;
}

function useHTML(entry, stampLast = false) {
  const dates = usedDates(entry.id);
  const todayUsed = dates.includes(today());
  const shown = dates.slice(-5);
  const seals = shown.map((date, index) => `<span class="seal${stampLast && index === shown.length - 1 ? ' stamp' : ''}"><b aria-hidden="true">使</b><small>${mdDot(date)}</small></span>`).join('');
  return `<div class="use"><button type="button" class="use-btn" data-use="${esc(entry.id)}" aria-pressed="${todayUsed}">${todayUsed ? '今日、使った' : '使った'}</button><div class="seals" role="img" aria-label="使った日: ${dates.length ? dates.map(mdDot).join('、') : 'まだなし'}">${seals}${dates.length > 5 ? `<span class="more-count">ほか${dates.length - 5}回</span>` : ''}</div>${dates.length ? '' : '<p class="use-hint">実生活で使った日に押すと、朱の印が残ります。同じ日にもう一度押すと取り消せます。</p>'}</div>`;
}

function moreHTML(entry) {
  const others = (entry.citations || []).slice(1).map(citeHTML).join('');
  const refs = (entry.refs || []).map((ref) => `<a href="${esc(ref.url)}" target="_blank" rel="noopener">${esc(ref.label)}</a>`).join('、');
  return `<details class="more"><summary>使い方をもう少し</summary><div class="more-body"><dl class="ex"><div><dt>親しい人へ</dt><dd>${hl(entry.examples.close, entry.word)}</dd></div><div><dt>少し丁寧なメッセージ</dt><dd>${hl(entry.examples.polite, entry.word)}</dd></div><div><dt>エッセイ・SNS・日記</dt><dd>${hl(entry.examples.essay, entry.word)}</dd></div></dl><p class="kv"><b>普通に言うなら</b>${entry.plain.map(esc).join('、')}</p><p class="kv"><b>それでも使う意味</b>${esc(entry.why)}</p><p class="kv"><b>気をつけること</b>${esc(entry.caution)}</p>${others}${refs ? `<p class="kv"><b>辞書</b>${refs}</p>` : ''}</div></details>`;
}

function reunionHTML() {
  const entry = pickReunion(visibleEntries(), store.used, today());
  if (!entry) return '';
  const days = Math.round((parseDate(today()) - parseDate(entry.date)) / 86400000);
  return `<aside class="reunion" aria-label="再会"><p class="label">再会</p><p class="r-head"><span>${days}日前の一輪</span><a class="r-word" href="#/w/${encodeURIComponent(entry.id)}">${esc(entry.word)}</a><span>まだ出番なし</span></p><p class="r-swap">${esc(entry.swap.before)}<em>${esc(entry.word)}</em>${esc(entry.swap.after)}</p><div class="r-actions">${reunionActions(entry.id)}</div></aside>`;
}

function reunionActions(id) {
  const done = usedDates(id).includes(today());
  return done ? `<span class="seal stamp"><b aria-hidden="true">使</b><small>${mdDot(today())}</small></span><span class="r-help">印を押しました。</span><button type="button" class="linkbtn" data-use="${esc(id)}" data-where="reunion">取り消す</button>` : `<button type="button" class="use-btn small" data-use="${esc(id)}" data-where="reunion" aria-pressed="false">使った</button><span class="r-help">使っていたら、ここで印を押せます</span>`;
}

function weekHTML({ newestFirst = false } = {}) {
  const { start, end } = weekRange(today());
  const list = entries
    .filter((entry) => entry.date >= start && entry.date <= today())
    .sort(newestFirst ? compareAddedDesc : (a, b) => a.date.localeCompare(b.date));
  if (!list.length) return '<p class="empty">今週の一輪は、まだありません。</p>';
  const idle = list.filter((entry) => !isUsed(entry.id));
  const rows = list.map((entry, index) => {
    const fresh = entry.date === today() && !store.swapped[entry.id];
    const sentence = fresh ? `${esc(entry.swap.before)}<span class="bud-word">${esc(entry.swap.plain)}</span>${esc(entry.swap.after)}` : `${esc(entry.swap.before)}<em>${esc(entry.word)}</em>${esc(entry.swap.after)}`;
    const mark = isUsed(entry.id) ? '<span class="seal mini"><b aria-hidden="true">使</b></span><span class="sr">使った</span>' : entry.date === today() ? '<span class="tag">今朝</span>' : '<span class="tag mute">まだ出番なし</span>';
    return `<li style="--i:${index}"><a class="wrow" href="#/w/${encodeURIComponent(entry.id)}"><span class="dow">${dow(entry.date)}</span><span class="wsent">${sentence}</span><span class="wmark">${mark}</span></a></li>`;
  }).join('');
  const cols = [1,2,3,4,5].map((distance) => `<div class="col">${list.filter((entry) => entry.distance === distance).map((entry) => `<a class="stem${entry.date === today() ? ' main' : ''}${isUsed(entry.id) ? ' used' : ''}" href="#/w/${encodeURIComponent(entry.id)}">${esc(entry.word)}</a>`).join('')}</div>`).join('');
  const latestEntry = latest();
  return `<section class="week"><div class="week-head"><h1 class="week-title">今週の${KANJI_NUM[list.length] || list.length}語</h1><span class="week-range">${mdDot(start)} — ${mdDot(end)}</span></div><p class="week-sum">使った語 ${list.length - idle.length}・まだ出番なし ${idle.length}</p><ol class="week-list">${rows}</ol>${idle.length ? `<div class="idle"><p class="label">今週まだ出番のない語</p>${idle.map((entry) => `<a class="chip" href="#/w/${encodeURIComponent(entry.id)}">${esc(entry.word)}</a>`).join('')}</div>` : ''}${rulerShell('今週の物差し', cols)}${latestEntry ? `<p><a class="linkbtn" href="#/w/${encodeURIComponent(latestEntry.id)}">今朝の一輪だけ見る →</a></p>` : ''}</section>`;
}

function hikuHTML(query = '') {
  return `<section class="hiku"><label class="label" for="q">言い換えたい言葉、または下書き</label><textarea id="q" rows="3" placeholder="例：仕方なく">${esc(query)}</textarea><p class="hiku-note">短い語なら棚を引き、30字以上・句点・改行を含む文章なら、挿せる場所を一か所だけ探します。</p><div id="results" aria-live="polite"></div></section>`;
}

function updateResults(value) {
  const box = document.getElementById('results');
  const query = value.trim();
  if (!box) return;
  if (!query) { box.innerHTML = ''; draft = null; return; }
  if (query.length >= 30 || /[。\n]/.test(query)) {
    draft = { text: query, spots: findDraftSpots(entries, query, store.used), index: 0, done: false };
    box.innerHTML = draftHTML();
    return;
  }
  const results = searchWords(entries, query);
  box.innerHTML = results.length ? `<ul class="res-list">${results.map(resultHTML).join('')}</ul>` : `<p class="empty">「${esc(query)}」に当たる言葉は、まだ棚にありません。</p>`;
}

function resultHTML({ entry, sibling }) {
  if (sibling) return `<li class="res"><div class="res-top"><a class="res-word" href="#/w/${encodeURIComponent(entry.id)}">${esc(sibling.word)}</a><span class="res-meta">時代距離 ${sibling.distance}・「${esc(entry.word)}」の日の候補</span></div><p class="res-gist">${esc(sibling.gist)}。${esc(sibling.note)}</p></li>`;
  return `<li class="res"><div class="res-top"><a class="res-word" href="#/w/${encodeURIComponent(entry.id)}">${esc(entry.word)}</a><span class="res-meta">時代距離 ${entry.distance}・${esc(entry.functionTag)}</span></div><p class="res-gist">${esc(entry.gist)}</p><p class="res-swap">${esc(entry.swap.before)}<s>${esc(entry.swap.plain)}</s> <em>${esc(entry.word)}</em>${esc(entry.swap.after)}</p></li>`;
}

function draftHTML() {
  if (!draft?.spots.length) return '<p class="empty">この下書きには、挿せる場所が見つかりませんでした。</p>';
  const spot = draft.spots[draft.index];
  const before = draft.text.slice(0, spot.index);
  const after = draft.text.slice(spot.index + spot.plain.length);
  const body = draft.done ? `${esc(before)}<em>${esc(spot.entry.word)}</em>${esc(after)}` : `${esc(before)}<mark>${esc(spot.plain)}</mark>${esc(after)}`;
  const actions = draft.done
    ? `<div class="spot-card"><span>一輪、挿しました。</span><button type="button" class="btn-ghost copy" data-copy="${esc(before + spot.entry.word + after)}">写す</button><button type="button" class="linkbtn" data-spot="undo">戻す</button></div>`
    : `<div class="spot-card"><span class="spot-label">ここに一輪</span><span class="spot-swap"><s>${esc(spot.plain)}</s> → <em>${esc(spot.entry.word)}</em></span><button type="button" class="use-btn small" data-spot="insert">挿す</button>${draft.spots.length > 1 ? `<button type="button" class="linkbtn" data-spot="next">ほかの場所 (${draft.index + 1}/${draft.spots.length})</button>` : ''}</div>`;
  return `<p class="draft-text">${body}</p>${actions}<p class="draft-why">${esc(spot.entry.word)}：${esc(spot.entry.swap.note)}</p>`;
}

function tanaHTML() {
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.functionTag)) groups.set(entry.functionTag, []);
    groups.get(entry.functionTag).push(entry);
  }
  const shelves = [...groups.entries()].sort((a,b) => b[1].length - a[1].length || b[1][0].date.localeCompare(a[1][0].date));
  const usedN = entries.filter((entry) => isUsed(entry.id)).length;
  return `<section class="tana"><div class="tana-sum"><p><b>${entries.length}</b>ためた語</p><p class="used"><b>${usedN}</b>使った語</p></div><div class="shelves">${shelves.map(([tag, list]) => {
    const siblings = list.flatMap((entry) => (entry.siblings || []).map((sibling) => ({ ...sibling, parent: entry.id })));
    const stems = [...list.map((entry) => ({ word: entry.word, distance: entry.distance, id: entry.id, used: isUsed(entry.id), main: true })), ...siblings.map((sibling) => ({ word: sibling.word, distance: sibling.distance, id: sibling.parent }))].sort((a,b) => a.distance - b.distance || a.word.localeCompare(b.word, 'ja'));
    return `<div class="shelf"><h2>${esc(tag)}<span>${list.length}語${siblings.length ? `・候補${siblings.length}` : ''}</span></h2><div class="shelf-row">${stems.map((stem) => `<a class="stem${stem.main ? '' : ' sib'}${stem.used ? ' used' : ''}" href="#/w/${encodeURIComponent(stem.id)}" title="時代距離 ${stem.distance}">${esc(stem.word)}</a>`).join('')}</div></div>`;
  }).join('')}</div></section>`;
}
function toggleSwap(slot) {
  const article = slot.closest('.entry');
  const entry = byId(article.dataset.id);
  const toInserted = slot.getAttribute('aria-pressed') !== 'true';
  const first = !store.swapped[entry.id];
  if (toInserted) store.swapped[entry.id] = true;
  store.hintSeen = true;
  saveStore();
  const apply = () => {
    slot.textContent = toInserted ? entry.word : entry.swap.plain;
    slot.setAttribute('aria-pressed', String(toInserted));
    article.querySelector('.note').textContent = toInserted ? entry.swap.note : '';
    article.querySelector('.hint')?.remove();
    if (first && toInserted) {
      article.querySelector('.veil').hidden = true;
      article.querySelector('.reveal').hidden = false;
    }
    if (toInserted && !reduced()) { slot.classList.remove('bloom'); void slot.offsetWidth; slot.classList.add('bloom'); }
  };
  if (reduced()) return apply();
  slot.classList.add('wilt');
  setTimeout(() => { slot.classList.remove('wilt'); apply(); }, 160);
}

function showSibling(stem) {
  const article = stem.closest('.entry');
  const entry = byId(article.dataset.id);
  const sibling = entry.siblings?.[Number(stem.dataset.sib)];
  if (!sibling) return;
  const note = article.querySelector('.sib-note');
  const was = stem.getAttribute('aria-expanded') === 'true';
  article.querySelectorAll('[data-sib]').forEach((node) => node.setAttribute('aria-expanded', 'false'));
  if (was) { note.innerHTML = ''; return; }
  stem.setAttribute('aria-expanded', 'true');
  const cite = sibling.citation ? ` <a href="${esc(citationHref(sibling.citation))}" target="_blank" rel="noopener">${esc(sibling.citation.author)}『${esc(sibling.citation.work)}』を開く ↗</a>` : '';
  note.innerHTML = `<b>${esc(sibling.word)}</b><span class="yomi">${esc(sibling.reading)}</span>${esc(sibling.gist)}。${esc(sibling.note)}。${cite}`;
}

function toggleUse(button) {
  const id = button.dataset.use;
  const dates = [...usedDates(id)];
  const index = dates.indexOf(today());
  const adding = index < 0;
  if (adding) dates.push(today()); else dates.splice(index, 1);
  dates.sort();
  if (dates.length) store.used[id] = dates; else delete store.used[id];
  saveStore();
  if (button.dataset.where === 'reunion') {
    button.closest('.r-actions').innerHTML = reunionActions(id);
    return;
  }
  const use = button.closest('.use');
  if (use) use.outerHTML = useHTML(byId(id), adding);
}

async function copyText(button) {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    button.textContent = '写しました';
  } catch {
    const target = button.closest('.oneline, #results')?.querySelector('.line, .draft-text');
    if (target) {
      const range = document.createRange(); range.selectNodeContents(target);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    }
    button.textContent = '選択しました。コピーしてください';
  }
  setTimeout(() => { button.textContent = original; }, 1800);
}

function draftAction(action) {
  if (!draft?.spots.length) return;
  if (action === 'insert') draft.done = true;
  if (action === 'undo') draft.done = false;
  if (action === 'next') { draft.index = (draft.index + 1) % draft.spots.length; draft.done = false; }
  document.getElementById('results').innerHTML = draftHTML();
}

function exportRecords() {
  const payload = JSON.stringify({ app: 'ichirinzashi', version: 1, exportedAt: new Date().toISOString(), used: store.used, swapped: store.swapped, hintSeen: store.hintSeen }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ichirinzashi-records-${today().replaceAll('-', '')}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function importRecords(file) {
  const io = document.getElementById('io');
  try {
    const incoming = JSON.parse(await file.text());
    if (!incoming || typeof incoming !== 'object' || typeof incoming.used !== 'object') throw new Error('shape');
    store = mergeRecords(store, incoming);
    saveStore();
    render();
    document.getElementById('io').textContent = '記録を読み込み、今の記録と合わせました。';
  } catch {
    io.textContent = '読み込めませんでした。「記録を書き出す」で作ったJSONファイルを選んでください。';
  }
}

function updateFooter() {
  const footer = document.getElementById('footer');
  footer.hidden = false;
  const count = data.invalid?.length || 0;
  document.getElementById('invalid-note').textContent = count ? `不備のある便りが${count}件あります（棚には入れていません）` : '';
}

function showLoadError() {
  document.getElementById('main').innerHTML = '<div class="error-state"><p>言葉を読み込めませんでした。通信を確かめて、もう一度開いてください。</p><button type="button" class="btn-ghost" id="reload">再読み込み</button></div>';
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button, [role="button"]');
  if (!target) return;
  if (target.id === 'reload') { location.reload(); return; }
  if (target.classList.contains('slot')) { toggleSwap(target); return; }
  if (target.dataset.sib !== undefined) { showSibling(target); return; }
  if (target.dataset.use) { toggleUse(target); return; }
  if (target.classList.contains('copy')) { copyText(target); return; }
  if (target.dataset.spot) { draftAction(target.dataset.spot); return; }
  if (target.id === 'export-records') { exportRecords(); return; }
  if (target.id === 'import-records') { document.getElementById('import-file').click(); }
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.getAttribute('role') !== 'button' || target.tagName === 'BUTTON') return;
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); target.click(); }
});

document.getElementById('import-file').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) importRecords(file);
  event.target.value = '';
});
window.addEventListener('hashchange', () => { draft = null; render(); window.scrollTo(0, 0); });

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get('today') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('today'))) document.getElementById('today-override').hidden = false;
  try {
    const response = await fetch('data/index.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    entries = Array.isArray(data.entries) ? data.entries : [];
    render();
  } catch (error) {
    console.error(error);
    showLoadError();
  }
}

boot();
