import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  checkCitationAgainstText,
  findDraftSpots,
  makeTextFragment,
  normalizeQuote,
  parseAozoraMainText,
  pickReunion,
  validateEntry,
  weekRange
} from '../scripts/lib.mjs';

const example = (name) => readFile(new URL(`../docs/examples/${name}`, import.meta.url), 'utf8').then(JSON.parse);
const dec = (fragment) => decodeURIComponent(fragment.replace(/%2D/gi, '-'));

test('初期データ2件は検証を通る', async () => {
  for (const name of ['2026-09-25-kazunaranu.json', '2026-09-26-yondokoronaku.json']) {
    const entry = await example(name);
    const result = validateEntry(entry, name);
    assert.equal(result.valid, true, result.errors.join('\n'));
  }
});

test('必須キー欠落・distance 6・idとdate不一致は落ちる', async () => {
  const base = await example('2026-09-26-yondokoronaku.json');
  const missing = structuredClone(base); delete missing.word;
  assert.equal(validateEntry(missing, `${missing.id}.json`).valid, false);
  const far = structuredClone(base); far.distance = 6;
  assert.equal(validateEntry(far, `${far.id}.json`).valid, false);
  const mismatch = structuredClone(base); mismatch.date = '2026-09-25';
  assert.equal(validateEntry(mismatch, `${mismatch.id}.json`).valid, false);
});

test('青空文庫HTMLからルビ読みを除き、ルビ位置を残す', () => {
  const html = '<div class="main_text">そこで、<ruby><rb>拠</rb><rp>（</rp><rt>よんどころ</rt><rp>）</rp></ruby>なく、<ruby><rb>吊</rb><rt>つる</rt></ruby>して</div>';
  const parsed = parseAozoraMainText(html);
  assert.equal(parsed.text, 'そこで、拠なく、吊して');
  assert.equal(parsed.rubyFlags[4], true);
  assert.equal(parsed.rubyFlags.at(-3), true);
});

test('引用の括弧内読みを除く', () => {
  assert.equal(normalizeQuote('拠（よんどころ）なく'), '拠なく');
  assert.equal(normalizeQuote('拠(よんどころ)なく'), '拠なく');
});

test('ルビをまたぐテキストフラグメントが期待形になる', () => {
  const html1 = '<div class="main_text">れぬ。そこで、<ruby><rb>拠</rb><rt>よんどころ</rt></ruby>なく毎日々々弁当を<ruby><rb>吊</rb><rt>つる</rt></ruby>して終る。</div>';
  const p1 = parseAozoraMainText(html1);
  assert.equal(dec(makeTextFragment(p1, 'そこで、拠なく毎日々々弁当を吊して')), 'れぬ。-,そこで、,して');

  const html2 = '<div class="main_text">ては、今更に<ruby><rb>詮方</rb><rt>せんかた</rt></ruby>もなく暮した。</div>';
  const p2 = parseAozoraMainText(html2);
  assert.equal(dec(makeTextFragment(p2, '今更に詮方もなく')), 'ては、-,今更に,もなく');
});

test('引用一致はok、語だけならword、どちらもなければmissing', async () => {
  const entry = await example('2026-09-26-yondokoronaku.json');
  const parsed = parseAozoraMainText('<div class="main_text">そこで、<ruby><rb>拠</rb><rt>よんどころ</rt></ruby>なく帰った。別の箇所にはよんどころなくともある。</div>');
  assert.equal(checkCitationAgainstText(entry, { quote: 'そこで、拠なく帰った。' }, parsed).status, 'ok');
  assert.equal(checkCitationAgainstText(entry, { quote: '別の文章' }, parsed).status, 'word');
  assert.equal(checkCitationAgainstText({ ...entry, word: '不存在', notation: '不存在' }, { quote: '別の文章' }, parsed).status, 'missing');
});

test('再会は3日前の未使用語を選び、使用済みなら選ばない', async () => {
  const entry = await example('2026-09-25-kazunaranu.json');
  assert.equal(pickReunion([entry], {}, '2026-09-28')?.id, entry.id);
  assert.equal(pickReunion([entry], { [entry.id]: ['2026-09-27'] }, '2026-09-28'), null);
});

test('下書き候補は未使用・距離3・新しさ・前方の順で、2字plainを無視する', async () => {
  const a = await example('2026-09-26-yondokoronaku.json');
  const b = { ...structuredClone(a), id: '2026-09-27-test', date: '2026-09-27', word: '別語', distance: 2, plain: ['仕方なく', '雨'] };
  const text = '仕方なく進んだ。やむを得ず帰った。';
  const spots = findDraftSpots([a, b], text, { [a.id]: ['2026-09-27'] });
  assert.equal(spots[0].entry.id, b.id);
  assert.equal(spots.some((spot) => spot.plain === '雨'), false);
});

test('2026-09-26(土)の週は9.21〜9.27', () => {
  assert.deepEqual(weekRange('2026-09-26'), { start: '2026-09-21', end: '2026-09-27' });
});
