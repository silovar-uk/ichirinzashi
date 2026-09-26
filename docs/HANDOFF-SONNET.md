# 一輪挿し 実装依頼書(Sonnet向け)

作成: 2026-09-26。計画の意図は[PLAN-SHUHARI.md](PLAN-SHUHARI.md)、見た目と動きの基準は[mock/index.html](mock/index.html)にあります(同じものを非公開Artifactとしても公開: https://claude.ai/artifact/17vtxKw6YV4MDaYgWTpza9)。

モックにある「平日の朝/週末」の切り替えバー、「記録を最初に戻す」、仮データ4語(いささか・あながち・よしなに・ひとしお)は本番に入れません。

## 0. 読む順番

1. 本書
2. [PLAN-SHUHARI.md](PLAN-SHUHARI.md): 守破離と画面の意図
3. [examples/](examples/): GPTが毎朝書くJSONの実物(初期データとしてそのまま使う)
4. [mock/index.html](mock/index.html): 見た目と動きの基準。コードは参考にしてよいが、構成は本書に従う
5. [PROMPT-DAILY.md](PROMPT-DAILY.md): GPT側との約束。JSONの形を変えるときは、ここも同時に直す

## 1. 目的と完了条件

目的は、近代文章語を毎朝1語ためる静的サイトを、GitHub Pagesに公開することです。追加はChatGPTの定期タスクが`entries/`へJSONを書き、GitHub Actionsが照合・索引・公開を行います。

次の状態になったら完了です。

- `silovar-uk/ichirinzashi`(Public)があり、mainへのpushでActionsが照合・索引・公開まで行う。
- https://silovar-uk.github.io/ichirinzashi/ で初期データ2件が表示され、10章の検証がすべて通る。
- `docs/PROMPT-DAILY.md`とREADMEの設定手順が本番リポジトリにある。
- 12章の形で報告を出す。ChatGPTの定期タスクは本人が設定するため、その結果は待たずに終えてよい。

## 2. 操作の範囲

起動文で「最後まで」と指示された場合の範囲です。

- 確認なしで行ってよい: `C:\Users\vediv\repos\ichirinzashi`での`git init`とコミット、`silovar-uk/ichirinzashi`(Public)の作成、mainへのpush、Pagesの有効化(Source: GitHub Actions)、Actionsの再実行、本番の到達確認。
- 確認が必要: リポジトリ名や公開範囲の変更、Secretsの追加、npm依存の追加、有料機能の利用、他リポジトリへの変更、force push、履歴の書き換え。
- 行わない: ChatGPT側の設定(本人の作業)。

## 3. 確認済みの前提

| 事項 | 根拠 |
|---|---|
| `C:\Users\vediv\repos\ichirinzashi`には`docs/`だけがあり、git未初期化。GitHubに同名リポジトリはない | 2026-09-26に`ls`と`gh repo view`で確認 |
| ChatGPTは本人のGitHubアカウントとして、1ファイル1コミットで直接書き込む運用実績がある | `silovar-uk/myessays`の直近コミット(committer=silovar-uk、署名なし、1コミット1ファイル)。GPTの書き込みはpushイベントなので、Actionsが起動する |
| 青空文庫の作品本文(`/cards/*/files/*.html`)はShift_JIS。図書カード(`card*.html`)はUTF-8 | 2026-09-26に取得して確認 |
| ルビは`<ruby><rb>拠</rb><rp>（</rp><rt>よんどころ</rt><rp>）</rp></ruby>`の形。本文は`<div class="main_text">`の中 | 同上 |
| テキストフラグメントは、開始語と終了語にルビ付きの字を含めなければ、ルビをまたぐ範囲も光る | 本物の青空文庫で確認。`2677_6506.html#:~:text=れぬ。-,そこで、,弁当を`と`369_18841.html#:~:text=今更に,もなく`(どちらもエンコード前の表記) |
| `docs/examples/`の引用5件(漱石、谷崎、野村胡堂、太宰、福田英子)は、ルビを除いた本文と一致する | 2026-09-26に本文を取得して確認 |
| 本人のPC表示域は1366×633 | ユーザーの既知の環境 |

## 4. リポジトリ構成

```
index.html
assets/app.js            ES module。依存なし
assets/style.css
assets/icon.svg          一輪挿しのマーク(favicon兼用。モックのSVGを使う)
manifest.webmanifest     ホーム画面に追加する用。Service Workerは入れない
entries/*.json           GPTが書く。1語1ファイル
data/checks.json         Actionsが書く。原文照合の結果
scripts/lib.mjs          検証・照合・索引・再会・下書きの純粋関数(ページとNodeの両方から使う)
scripts/verify.mjs       未照合の引用を青空文庫で照合し、data/checks.json を更新する
scripts/build.mjs        entries を検証して _site/ を作る
tests/lib.test.mjs       node --test
.github/workflows/pages.yml
docs/                    計画一式(既存のまま)
README.md
```

- npmの依存は入れません。Node 22の標準機能(`fetch`、`TextDecoder('shift_jis')`、`node:test`、`node:fs`)で書きます。
- `scripts/lib.mjs`はページからも`import`します。DOMやNode固有のAPIに触れる処理は入れません。
- `entries/`には`docs/examples/`の2件をそのままコピーします。

## 5. データの約束(`entries/*.json`)

実物は`docs/examples/2026-09-26-yondokoronaku.json`です。

| キー | 必須 | 型と制約 |
|---|---|---|
| `id` | ○ | ファイル名から`.json`を除いた文字列。`YYYY-MM-DD-ローマ字`で、先頭の日付が`date`と一致 |
| `date` | ○ | `YYYY-MM-DD`(日本時間) |
| `functionTag` | ○ | 棚の名前。下記14語のどれか。それ以外は警告を出して受け入れる |
| `function` | ○ | 今日の機能の一文(詞書として縦に出す。40字以内) |
| `word` | ○ | 見出し語 |
| `notation` | | 漢字表記。`word`と同じなら省略可 |
| `reading` | ○ | ひらがな |
| `gist` | ○ | 一言の意味(30字以内) |
| `distance` | ○ | 時代距離。1〜5の整数 |
| `plain` | ○ | 普通の言い方。1〜6個。下書き照合には3字以上のものだけ使う |
| `swap` | ○ | `before`・`plain`・`after`・`note`。`before + plain + after`が普通の文、`before + word + after`が挿した文。`before`と`after`は空文字可。`note`は25字以内 |
| `why` | ○ | それでも使う意味(1〜2文) |
| `citations` | ○ | 1〜3件。各`quote`(80字以内)・`author`・`work`・`url`(https)は必須、`year`・`context`は任意 |
| `examples` | ○ | `close`・`polite`・`essay`の3文 |
| `oneLine` | ○ | 今日から使うなら、この一文 |
| `caution` | ○ | 注意点 |
| `siblings` | | 0〜6件。各`word`・`reading`・`distance`・`gist`・`note`は必須、`citation`は任意(形は`citations`の1件と同じ) |
| `refs` | | `label`と`url`の組 |

`functionTag`の14語: へりくだる、恐縮する、感謝する、人を立てる、頼む、名残を惜しむ、断る、仕方なさ、少し批判する、控えめに喜ぶ、言い切らない、理由をぼかす、親愛を示す、引いて語る。

検証で落ちたファイルは索引に入れず、`invalid`に理由を残します。同じ`word`が2件あっても両方載せ、警告だけ出します。

## 6. 原文照合(`scripts/verify.mjs`)

- 対象: `citations`と`siblings[].citation`のうち、`url`が`https://www.aozora.gr.jp/cards/<数字>/files/<名前>.html`のもの。照合結果のキーは`<id>#c<番号>`(本体)と`<id>#s<番号>`(候補)です。
- 照合済みで`quote`が変わっていないものは取りに行きません。同じURLは1回の実行で1度だけ取得し、取得の間は1秒空けます。User-Agentは`ichirinzashi (+https://github.com/silovar-uk/ichirinzashi)`にします。
- 本文の整え方:
  1. `TextDecoder('shift_jis')`で読み、`<div class="main_text">`の中だけを使う。
  2. `<rp>…</rp>`と`<rt>…</rt>`を消す。`<rb>`の文字には「ルビ付き」の印を付ける。
  3. 残りのタグを消し、実体参照(`&amp;`、`&#12345;`など)を戻し、空白・全角空白・改行を消す。
- 引用の整え方: 全角・半角の括弧内がかなだけなら括弧ごと消します(`拠（よんどころ）なく`→`拠なく`)。空白も消します。
- 判定:

| status | 条件 | ページでの表示 |
|---|---|---|
| `ok` | 整えた本文に、整えた引用が含まれる | 「原文照合済み」と原文リンク |
| `word` | 引用は見つからないが、`word`か`notation`が本文にある | 「語のみ確認」 |
| `missing` | どちらも見つからない | 「原文未確認」。実例として断定しない |
| `skip` | 青空文庫以外のURL | 「未照合」 |
| `error` | 取得に失敗 | 「未照合」。結果を保存せず、次回また試す |

- テキストフラグメント(`ok`のときだけ作る):
  - 一致した範囲にルビがなければ、引用全体を1語として使う。
  - ルビがあれば、開始語は範囲の先頭から続くルビなしの文字列(最大8字)、終了語は末尾から遡るルビなしの文字列(最大8字)にする。終了語が2字未満なら付けない。
  - 範囲の直前にルビなしの文字が3字あれば、`prefix-`として付ける。
  - 各部分を`encodeURIComponent`し、`-`を`%2D`に置き換える。形は`#:~:text=[prefix-,]start[,end]`。
  - 期待値(エンコード前)。1件目は、この形のまま本物の青空文庫で光ることを確認済みです。2件目は`今更に,もなく`(prefixなし)で確認済みで、prefix付きは未確認です。実装後に本番で1度開いて確かめてください。

| 引用 | 期待するフラグメント |
|---|---|
| そこで、拠なく毎日々々弁当を吊して | `れぬ。-,そこで、,して` |
| 今更に詮方もなく | `ては、-,今更に,もなく` |
| そのために、数ならぬ私共まで、心を痛めて居るような次第 | `です、-,そのために、数ならぬ私共まで、心を痛めて居るような次第` |
- `data/checks.json`の形: `{ "<key>": { "quote": "…", "status": "ok", "fragment": "…", "checkedAt": "2026-09-26" } }`。キーは辞書順に並べて書き、差分を小さくします。
- 照合できなくても終了コードは0です。スクリプト自体の誤りだけ1で終えます。

## 7. 索引と公開(`scripts/build.mjs`)

- `entries/*.json`を読み、5章の検証を通し、`data/checks.json`の結果を各引用へ`check: { status, fragment }`として合わせます。
- `_site/data/index.json`を書きます。形は`{ "generatedAt": "…", "entries": [新しい順], "invalid": [{ "file": "…", "reason": "…" }] }`です。
- `_site/data/words.json`を書きます。GPTが重複を避けるための一覧で、形は`[{ "word", "reading", "id", "date", "role": "main" | "sibling", "functionTag" }]`です(`functionTag`は`main`だけ)。
- `index.html`、`assets/`、`manifest.webmanifest`を`_site/`へコピーします。
- 不備のあるファイルごとに`::warning file=entries/…::理由`を出します。不備があっても終了コードは0にし、ほかの語の公開を止めません。

## 8. ワークフロー(`.github/workflows/pages.yml`)

```yaml
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions: { contents: write, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: false }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - checkout → setup-node(22)
      - run: node --test
      - run: node scripts/verify.mjs
      - data/checks.json に差分があれば、github-actions[bot]として
        「原文照合の結果を更新」でコミットし、git pull --rebase してから push
      - run: node scripts/build.mjs
      - configure-pages → upload-pages-artifact(path: _site)
  deploy:
    needs: build
    environment: github-pages
    steps: deploy-pages
```

- 各actionは、実装時点の最新メジャー版を確かめて使います。
- `GITHUB_TOKEN`によるpushは次のワークフローを起動しないため、照合結果のコミットと公開は同じ実行の中で行います。
- Pagesは`gh api -X POST repos/silovar-uk/ichirinzashi/pages -f build_type=workflow`で有効にします。

## 9. 画面の仕様

見た目と動きは`docs/mock/index.html`に合わせます。以下は、モックだけでは決まらない約束です。

### 9.1 経路と日付

- ハッシュで切り替えます。`#/`(ホーム)、`#/w/<id>`(語のページ)、`#/week`(今週)、`#/hiku`(引く。`#/hiku?q=…`で語を渡せる)、`#/tana`(棚)。
- 「今日」は端末のローカル日付です。`?today=YYYY-MM-DD`で差し替えられるようにし、差し替え中は画面の隅に「日付を差し替え中」と出します(検証用)。
- ホームは、土日なら今週の紙面、平日なら今朝の一輪を出します。
- 索引は`fetch('data/index.json', { cache: 'no-cache' })`で読みます。GitHub Pagesのキャッシュ(10分)で、朝に前日の索引が出るのを防ぐためです。

### 9.2 今朝の一輪(平日のホーム)

上から次の順に並べます。

1. 日付と見出し: 当日の語があれば「9月26日(土) 今朝の一輪」。なければ最新の語を「9月25日の一輪」とし、「今朝の一輪は、まだ届いていません。毎朝6時半ごろに届きます。」を添える。
2. 縦書きの一文(`writing-mode: vertical-rl`)。右端に`function`を詞書として小さく添える。差し替える言葉は`<span role="button" tabindex="0" aria-pressed>`にする(縦書きの`<button>`はブラウザによって横倒しになるため)。EnterとSpaceでも押せるようにする。
3. 挿したあとに`swap.note`を`aria-live="polite"`で出す。初めての訪問だけ「点線の言葉に触れると、一輪挿せます」を出す。
   - 挿す前は4〜7と9を伏せ、「蕾に触れると、言葉と実例がひらきます。」だけを出す。一度挿した語は、元の言葉へ戻しても伏せ直さない。
4. 見出し語(漢字を含む場合は`reading`をルビ)、`notation`、`gist`、物差し。
5. 実例: 引用、作者・作品・年、照合の表示、「原文で光らせる」(`url + '#:~:text=' + fragment`、新しいタブ)。
6. 「今日から使うなら」: `oneLine`と「写す」ボタン(`navigator.clipboard.writeText`。失敗したら文を選択状態にする)。
7. 「使った」ボタンと印。
8. 再会の札(9.6の規則で1語だけ)。札にも「使った」を置く。
9. 折りたたみ「使い方をもう少し」: 使用例3つ、`why`、`caution`、候補の物差し、`refs`。

幅880px以上は2列にし、右に縦書きの一文、左に4〜9を置きます。幅1180px以上では左をさらに2列に分け、右から「一文」「語と物差し」「実例・今日の一文・使った」の順に並べます(モックの`grid-template-areas`を参照)。1366×633で1〜7が1画面に収まることを確かめます。

### 9.3 今週の紙面(土日のホームと`#/week`)

- 見出しは「今週の」+ 漢数字の語数 +「語」(例: 今週の六語)と、期間「9.21 — 9.27」。
- 月曜から今日までの語を、日付の古い順に1行ずつ並べます。各行は曜日、挿した状態の一文(語は桔梗色の傍線)、使った印です。当日の語をまだ挿していなければ、その行だけ普通の言葉と蕾で出します。
- 行に触れると語のページへ移ります。表示時に60ms間隔で順に現れます。
- 下に「今週まだ出番のない語」と、今週の語を並べた物差しを置きます。
- 最下部に「今朝の一輪だけ見る」を置きます。

### 9.4 引く(`#/hiku`)

- 入力欄は1つです(`textarea`、ラベル「言い換えたい言葉、または下書き」)。
- 30字以上、または「。」か改行を含めば下書きの扱い、それ以外は語の扱いにします。
- 語の扱い: `plain`・`word`・`reading`・`notation`・`function`・`functionTag`・候補の`word`と`reading`を部分一致で探します。結果は語、時代距離、`gist`、差し替え文(普通の言葉に取り消し線、挿す言葉を桔梗色)です。本体が当たったら、その日の候補も続けて並べます。候補は、親の語のページへつなぎます。
- 下書きの扱いは9.7の規則に従います。下書きの文章は保存しません。

### 9.5 棚(`#/tana`)

- 最上段に「ためた語 N・使った語 M」(Mは印が1つ以上ある語の数)。
- `functionTag`ごとに、語を時代距離の順に並べます。語が多い棚から並べます。

### 9.6 記録と再会

- `localStorage`のキーは`ichirinzashi:v1`です。形は`{ "used": { "<id>": ["2026-09-28"] }, "swapped": { "<id>": true }, "hintSeen": true }`。読み書きはすべて`try/catch`で包み、使えないときも画面は正しく出します。
- 「使った」: 押すとその日の日付を追加します。同じ日に押し直すと、その日の分を取り消します。印は新しい5つまで出し、残りは「ほか3回」とまとめます。
- 再会: 印が1つもない語のうち、`date`から今日までの日数が3・7・14・30・60・120日のものを候補にし、日数が最も少ない1語を出します。文言は「3日前の一輪 よしなに まだ出番なし」。
- 書き出し: 記録をJSONファイルとして保存します(`ichirinzashi-records-YYYYMMDD.json`)。読み込み: ファイルを選ぶと、日付の和集合で統合します。

### 9.7 下書きに一輪

- 全語の`plain`のうち3字以上のものを、下書きの中から探します。
- 候補の順位: (1)印のない語、(2)時代距離が3に近い、(3)`date`が新しい、(4)下書きの前のほう。
- 最上位の1か所だけを桔梗色の傍線で光らせ、「ここに一輪: 仕方なく → よんどころなく」と「挿す」「ほかの場所」を出します。「挿す」で置き換えた文と「写す」を出します。
- 見つからなければ「この下書きには、挿せる場所が見つかりませんでした。」と出します。

### 9.8 状態の文言

| 状態 | 文言 |
|---|---|
| 読み込み中 | 本文の位置に罫線だけの紙を出す(文言なし) |
| 通信失敗 | 「言葉を読み込めませんでした。通信を確かめて、もう一度開いてください。」と「再読み込み」 |
| 語が0件 | 「まだ一輪も届いていません。最初の一輪は、毎朝6時半ごろに届きます。」 |
| 不備のある便り | ページ下部に「不備のある便りが1件あります(棚には入れていません)」 |

### 9.9 見た目と動き

- 色・書体・動きはPLAN-SHUHARI.mdの「見た目の決まりごと」に従います。トークンは`:root`に置き、ダークは`@media (prefers-color-scheme: dark)`で上書きします。
- 挿す: 普通の言葉を0.16秒で薄くし、挿す言葉を`filter: blur(6px)`から0へ、`opacity`を0から1へ、`letter-spacing`を0.2emから0.02emへ、0.42秒で変えます。傍線は中央から伸ばします。
- 印: 0.24秒で`scale(1.35) rotate(-12deg)`から`scale(1) rotate(-6deg)`へ。
- `prefers-reduced-motion: reduce`では、すべて即時に切り替えます。
- `<html lang="ja">`、`<meta name="robots" content="noindex">`、フォーカスの見える枠(桔梗色)を入れます。

## 10. 検証

テスト(`node --test`)で次を確かめます。

- 検証: `docs/examples/`の2件が通る。必須キー欠落、`distance: 6`、`id`と`date`の不一致が落ちる。
- 本文の整え方: ルビ入りの小さなHTML片から、読みを除いた本文とルビの印が得られる。
- 照合: `拠（よんどころ）なく`が`拠なく`に整う。6章の期待値どおりのフラグメントになる。
- 再会: `?today=2026-09-28`相当で、印のない`2026-09-25-kazunaranu`が選ばれる。印があれば選ばれない。
- 下書き: 「仕方なく」と「やむを得ず」を含む下書きで1か所だけ返り、順位の規則が効く。2字の`plain`は使わない。
- 週: 2026-09-26(土)の週が9.21〜9.27になる。

ブラウザで次を確かめます(Claude Browserペインで可)。

- 1366×633と375×812で、ライト・ダーク両方。横スクロールがないこと(`scrollWidth <= innerWidth`)。9.2の1〜7が1画面に収まること(`getBoundingClientRect`で測る)。
- 差し替えをクリックとキーボードで行い、`aria-pressed`が切り替わること。reduced-motionで動きが止まること。
- 原文リンクの`href`に`#:~:text=`が入り、開くと該当箇所が光ること(スクリーンショット1枚)。
- 「使った」→再読み込みで印が残ること。書き出し→`localStorage`を消す→読み込みで戻ること。
- `?today=2026-09-27`で週末の紙面、`?today=2026-09-28`で再会の札(数ならぬ)が出ること。
- 手元で`entries/`に壊れたJSONを1件置いて`build.mjs`を実行し、ほかの語が出て不備の知らせが出ること(確認後にファイルを消す)。
- 本番: Actionsが緑。`https://silovar-uk.github.io/ichirinzashi/data/index.json`に2件あり、引用5件の照合が`ok`。

## 11. 未確認事項

- ChatGPTの定期タスクが、無人の実行でGitHubへ書き込めるか(本人が確かめる)。
- 青空文庫がGitHub Actionsからの取得を拒むか。拒まれた場合は`error`のまま公開を続け、報告に書きます。
- iOS Safariでのテキストフラグメントの挙動(実機未確認)。

## 12. 報告の形

- 本番URL、リポジトリURL、Actionsの実行結果。
- 検証の結果。テストの成功、ブラウザでの実操作、本番への到達を分けて書く。
- 本人が行う3手順(PLAN-SHUHARI.mdの「本人が行う作業」)。
- 未確認のまま残ったこと。

## 起動文

```
C:\Users\vediv\repos\ichirinzashi\docs\HANDOFF-SONNET.md を読んで、最後まで(リポジトリ作成・push・Pages公開・本番確認まで)実装して。
```
