# 一輪挿し

「一文に、一輪」。明治〜昭和前期の文章語を、毎朝ひとつだけ現代文へ挿して試す静的サイトです。

- 本番: https://silovar-uk.github.io/ichirinzashi/
- 1語1JSON: `entries/*.json`
- 原文照合: `scripts/verify.mjs`
- 索引・公開物生成: `scripts/build.mjs`
- UI: 依存ライブラリなしのHTML/CSS/ES Modules
- 記録: `localStorage`（`ichirinzashi:v1`）

## 開発

Node.js 22だけを使います。npm依存はありません。

```bash
node --test
node scripts/verify.mjs
node scripts/build.mjs
```

`verify.mjs`は青空文庫の本文を取得して引用を照合し、`data/checks.json`を更新します。通信に失敗しても公開自体は止めず、次回に再照合します。

`build.mjs`は有効な`entries/*.json`だけを`_site/data/index.json`へ載せ、重複回避用の`_site/data/words.json`も生成します。不備のある便りは`invalid`へ残し、ほかの語の公開を止めません。

## GitHub Pages

`main`へのpushで`.github/workflows/pages.yml`が次を実行します。

1. `node --test`
2. 青空文庫の原文照合
3. `data/checks.json`に差分があればbotでコミット
4. `_site/`を生成
5. GitHub Pagesへ公開

PagesのSourceは **GitHub Actions** を使います。

### 初回公開だけ

新規リポジトリでは、最初の1回だけ GitHub の **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にしてください。設定後は、この workflow を再実行するか、main に push すれば公開されます。

## 毎朝の追加

設定用の完成プロンプトは[`docs/PROMPT-DAILY.md`](docs/PROMPT-DAILY.md)にあります。

本人が行う作業は3つです。

1. ChatGPTのGitHub連携に`silovar-uk/ichirinzashi`への書き込みを許可する。
2. ChatGPTで毎日6:30（日本時間）の定期タスクを作り、`docs/PROMPT-DAILY.md`の「本文」を貼る。
3. 翌朝、https://silovar-uk.github.io/ichirinzashi/ に新しい一輪が届いたか確かめる。

定期タスクは`entries/<date>-<romaji>.json`だけを1ファイル1コミットで追加します。JSONの形を変える場合は、`docs/HANDOFF-SONNET.md`の5章、`scripts/lib.mjs`の検証、`docs/PROMPT-DAILY.md`を同時に直してください。

## 日付を動かす

ブラウザ確認用に`?today=YYYY-MM-DD`を付けられます。

- `?today=2026-09-27` → 日曜なので週末の紙面
- `?today=2026-09-28` → `数ならぬ`が未使用なら3日後の再会

差し替え中は画面右下に「日付を差し替え中」と表示します。

## 設計資料

- [`docs/HANDOFF-SONNET.md`](docs/HANDOFF-SONNET.md): 実装仕様
- [`docs/PLAN-SHUHARI.md`](docs/PLAN-SHUHARI.md): 守破離とUIの意図
- [`docs/mock/index.html`](docs/mock/index.html): 見た目と動きの基準
- [`docs/PROMPT-DAILY.md`](docs/PROMPT-DAILY.md): 毎朝のChatGPT定期タスク
