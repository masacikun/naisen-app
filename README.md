# naisen-app

番頭さん（総合管理システム）の電話履歴管理アプリ。Next.js 16 App Router + PostgREST。

## 電話帳（Phase 1 / Slice 1・2026-07-13、Slice 2・2026-07-14）

naisen-app をマスタとする電話帳。閲覧は全認証ユーザー・追加/編集/削除は admin のみ（fail-closed）。

- **着信拒否の統合（Slice 2）**: 別テーブルにせず `phonebook_entries.blocked BOOLEAN NOT NULL DEFAULT false` の1リスト＋フラグ方式。`/n/phonebook` はビュー切替（電話帳=既定/着信拒否/すべて）＋着信拒否バッジ。フォームに着信拒否トグル（adminのみ）。突合表示は blocked も含めて名前解決し赤バッジ表示（FreePBXへの拒否反映は Slice 4）
- **最終着信＋履歴オンデマンド（Slice 3・2026-07-14）**: 一覧（電話帳/着信拒否/すべて 全ビュー）に「最終着信」列。エントリの正規化番号×`naisen_calls.caller` 完全一致（着信のみ・発信は対象外）をチャンク `.in()` 1往復で集約（N+1回避・既存 caller 索引利用・DDLなし）。「履歴」ボタンで `GET /n/api/phonebook/[id]/calls?page=N`（50件/頁・started_at降順・回線/status/通話時間/録音ファイル名表示）をオンデマンド取得。純ロジック `src/lib/call-history.ts`＋サーバ `call-history-server.ts`。旧データの先頭0欠落分は紐づかない（既決どおり）。go-live 後は CDR cron で自動最新化
- **取引先との二重登録対策（2026-07-16 まさし決定・案A＋B）**:
  - **運用ルール（案A）**: 会社の代表番号は**取引先マスタにだけ**入れる（着信名の表示は取引先からも自動解決される）。電話帳は「個人の携帯・呼び名を変えたい相手・着信拒否」専用。
  - **リンク提案（案B）**: 電話帳フォームで入力番号が取引先の番号と一致すると「取引先『◯◯』が同じ番号です［リンクする］」を提示（partner_id セット・自動マージはしない）。通話履歴の✏️クイック登録は、その番号が取引先解決済みなら**保存時に partner_id を自動リンク**（フォームに予告表示）。リンク済みは履歴で「電話帳名（取引先: ◯◯）」表示。
- **旧電話帳CSV取込（Slice 2・実施済み）**: `scripts/import_addressbook.ts`（一回限り・`phonebook_entries` 非空なら中断する二重取込ガード付き）。2026-07-14 に958連絡先/1224番号（うち着信拒否279）を取込済み。同一番号の複数連絡先は許容（UNIQUEなし）・突合の多重ヒットは最小 entry_id を決定的に採用
- テーブル: `phonebook_entries`（連絡先: name/name_kana/group_name/memo/partner_id→partners.partner_no）＋ `phonebook_numbers`（番号複数: phone_raw 原表記＋phone_normalized 突合キー・INDEXあり・UNIQUEなし=Slice 2で決定）。DDL: `supabase/phonebook.sql`
- ページ: `/n/phonebook`（一覧・検索・admin は追加/編集/削除。複数番号・種別ラベル対応）
- API: `GET/POST /n/api/phonebook`・`PUT/DELETE /n/api/phonebook/[id]`。編集系は nginx が転送する `X-Auth-Role: admin` 必須（欠落は 403）
- 着信相手名の突合: 通話履歴/不在着信/CSV出力で `caller` を正規化し **電話帳（主）→ 取引先 partners.phone → 従業員 employees.phone_landline（フォールバック）** の順に完全一致で表示名を解決（出所ラベル付き）。実装 `src/lib/phonebook.ts`（DB）＋ `src/lib/phonebook-match.ts`（純ロジック・テスト対象）
- 通話履歴の ✏️（admin のみ表示）は電話帳への登録/更新に変更。旧 `caller_memo` テーブルは未使用化（温存・DROPしない）
- nginx: `location /n` に `X-Auth-User/Email/Role` 転送を追加（master-app ブロックと同形）

---

## CDR取込（本番稼働中・2026-07-16 go-live 完了）

FreePBX `asteriskcdrdb.cdr` → `naisen_calls` の pull 取込。**FreePBX は読取専用**（`naisen_ro`・GRANT SELECT のみ）。

- 方式: SSHトンネル都度張り（専用鍵 `~/.ssh/cdrpull_ed25519`・authorized_keys 制限行で 127.0.0.1:3306 転送のみ許可）→ 48h窓＋`CDR_CUTOFF_AT` 以降を SELECT → **linkedid 集約**（代表レグ=sequence最小・IVRのみ応答は NO ANSWER・duration=応答billsec最大・方向判定 inbound/outbound/internal）→ **81形式アダプタ**（先頭81・12桁以上→0付替え。`src/lib/cdr-transform.ts`・phone.ts 不変更）→ `call_id(=linkedid)` で **UPSERT（冪等）**
- 実装: `src/lib/cdr-transform.ts`（純関数・テスト12件）＋ `scripts/pull_cdr.ts`（ジョブ・mysql2）＋ `scripts/pull_cdr.sh`（cronラッパー・多重起動flock・**MF sync window 4:00-4:45 JST はスキップ**）
- DDL: `naisen_calls.recording_file text` 追加（録音はファイル名のみ保持・音声はFreePBX側）
- 回線名: `CDR_LINE_NAMES`（旧15回線＋新トランク 05053711017=大和A/018=大和B/019=大和C。81形式DIDはアダプタで0形式に寄せて引く）
- cron（**2026-07-16 登録済み・稼働中／同日 毎分化**・まさし「かなりリアルタイムに見る」）: `* * * * * /var/www/naisen-app/scripts/pull_cdr.sh >> /var/www/naisen-app/logs/cdr-pull.log 2>&1`（flock 多重防止・1回約1秒）
- **go-live 実施記録（2026-07-16）**: `CDR_CUTOFF_AT=2026-07-15 18:00:00`（=トランクTelPro切替時刻。旧CSV最終行00:05との間隙・重複なしを実測——旧CSV側18:00以降は内線系5件のみ）→ cron 登録 → 初回pull 15通話取込（source_file=freepbx-cdr）＋2回目0行=**冪等実測済み**
- FreePBX側（テスト環境・構築済み）: `cdrpull` ユーザー（nologin・authorized_keys 制限行 `restrict,port-forwarding,permitopen=127.0.0.1:3306`・sshd AllowUsers に追記）／`naisen_ro@localhost`（GRANT SELECT ON asteriskcdrdb.cdr のみ）／`cdr_general_custom.conf` に `unanswered=yes`（Log unanswered calls=Yes）
- `CDR_CUTOFF_AT=2026-07-15 18:00:00`（これ以前の試験通話は台帳に入らない）。実cdr26列は実物照合済み（想定との差異は23列目 dst_cnam のみ・未使用）
- 必要 env（`.env.local`・値は非コミット）: `CDR_DB_PASSWORD`／`CDR_CUTOFF_AT`（'YYYY-MM-DD HH:MM:SS' JST）／任意で `CDR_SSH_HOST/PORT/USER/KEY・CDR_LOCAL_PORT・CDR_DB_USER/NAME`（既定値あり）

---

## 通話履歴 /n/calls（2026-07-16 電話帳連携強化）

- **電話帳連携は双方向**: 相手名は**電話帳（主）→名刺（business_cards・会社+氏名表示・tel/mobile 突合・2026-07-16追加）→取引先→従業員**の順で解決・表示。✏️（admin のみ）の「名前・メモ」は電話帳 API（`/n/api/phonebook`）へ保存＝電話帳と同一データ。電話帳由来の名前はクリックで `/n/phonebook?q=<番号>` に遷移（電話帳側は ?q= を初期検索・「すべて」ビューで開く）
- **フィルタ基盤 `naisen_calls_ex`**（DB ビュー・2026-07-16 追加）: `naisen_calls` ＋ `in_phonebook`／`is_blocked`（電話帳突合・EXISTS）。従来の「電話帳あり」は電話帳全番号を `.in()` で渡していたため 500 番号超で URL 長超過 → **502 → 検索結果0件になるバグ**があった（1,217番号で顕在化）。ビュー化で全番号対応・`/n/api/calls-export` も同一意味論
- **着信/発信切替**（2026-07-16）: フィルタ行の「着信/発信」トグル（`?dir=out`）。発信=内線発・外線宛（`outbound_line` 有効な行・caller が外線番号の654行は転送系として着信側に残す）。発信ビューは相手＝`destination` で名前解決・✏️登録・🔍・CSV出力まで同一動作（列は 発信先/発信内線 に切替）。ブランド/内線除外/電話帳あり/着信拒否は着信専用のため発信では非表示
- **✏️に取引先セレクト**（2026-07-16）: クイック登録フォームで取引先を選んでリンク可（名前未入力なら取引先名を自動プリフィル・既存電話帳エントリのリンク変更も可）。番号が取引先解決済みなら未選択でも自動リンク
- **ネット検索アシスト**（2026-07-16）: 未登録の外線番号に 🔍（Google をその場で開く・通話履歴/不在着信）。✏️ フォームには Google・jpnumber・電話帳ナビ の検索リンク＝調べて確認→そのまま電話帳登録のフロー。判定は外部リンクを開くだけ（自動取得はしない・最終判断は人間）
- **着信拒否フィルタ**: ステータス行に「着信拒否」チェック（`?blocked=1`）＝電話帳で blocked のエントリの番号からの通話のみ表示
- **回線名 = TelPro 着信名称**（`CDR_LINE_NAMES`・設定一覧 2026-07-16 全25番号割当に準拠）: 水炊き大和(4451)／GACHA(1034)／水炊き・もつ鍋(1025)／スタッフ中洲(8217)／西新餃子スタンド大和(1026)／SmileFood(4450)／SmileEstate(1020)／CoSmile(4449)／通販_問い合わせ(8220)／HYD_求人(8216)／博多大和ダイニング(1035)／FAX(1021)／小林・楠原・武富・主計・鴨川・田原 直通(1023/1024/1027-1030)／予備(1016・1031・1032・8218)。1017-1019 は発信（楽天発信）ラベルのため大和A/B/C を維持。ブランド検索ボタンは**新旧回線名の両対応**（過去データも同じボタンでヒット）

## CSVアップロード取込（旧経路・役目終了 2026-07-16）

旧電話サービスの CDR CSV を `/n/upload` から取込む経路（`api/upload-cdr`・`call_id` UPSERT）。**`cdr20260716.csv` を最終取込とし、以後 CSV アップロードは行わない**（PBX が自社 TelPro に切替のため。今後のデータ源は上記 CDR pull 取込のみ）。UI・API は温存。

- 旧サービスはエクスポートごとに通話ID（`epoch.連番`）の連番部を振り直すため、期間の重なる CSV 間で**同一通話が別 call_id で重複**していた（`call_id` UPSERT をすり抜け）。2026-07-16 に (started_at, caller, duration_sec) 同一かつ source_file が異なる **1,037組・1,041行を削除**（残す側=最新ファイルの行。削除側は `nan` 文字列・`202.0` float 汚れの旧行のみ・実メモ消失なし）。41,551→40,510 行
- 削除行バックアップ: VPS `/var/backups/bantosan/naisen_calls_dupes_deleted_20260716.csv`
- 同一ファイル内の同秒・同番号 BUSY 3組（計7行）は連続リダイヤル等の別着信の可能性が高く温存

---

## FreePBX 同期フィード（Phase 1 / Slice 4・2026-07-14）

FreePBX（TelPro 162.43.89.64）が pull する一方向フィード。契約は **`docs/freepbx-sync.md`（v1）が正**。

- `GET /n/api/sync/contacts`（blocked=false・679連絡先/730番号）／`GET /n/api/sync/blacklist`（blocked=true を番号単位に展開・normalized null除外・dedup）
- 認証3層: HTTPS＋nginx IP許可（162.43.89.64のみ・他403）＋Bearerトークン（`.env.local` の `SYNC_FEED_TOKENS`・カンマ区切りで無停止ローテーション可・env未設定は401=fail-closed・timingSafeEqual）
- nginx `location /n/api/sync/` は auth_request をバイパス（X-Auth-* はこの経路では常に空化）。既存 `/n` の Cookie 認証は不変
- 実装: `src/lib/sync-auth.ts`（トークン検証）＋ `src/lib/sync-feed.ts`（整形・純関数）＋ `src/app/api/sync/*/route.ts`
- FreePBX 側 puller（Contact Manager / Blacklist への反映）は別管理（TelPro 側）

---

## Grandstream XML 電話帳配信（2026-07-15）

Grandstream 電話機（DP750/WP810）が定期ダウンロードする AddressBook XML を配信する。

- `GET /n/api/phonebook/grandstream` → `Content-Type: text/xml; charset=utf-8`・`Cache-Control: no-store`
- データ源: `phonebook_entries`（blocked=false・limit 5000）＋ `phonebook_numbers`。番号は `phone_normalized`（数字のみ・0始まり）を出力し、null（内線・数字なし）は除外。番号0件の連絡先は出力しない。複数番号は同一 `<Contact>` 内に `<Phone type="Work">` を複数並べる
- 表示名→`<FirstName>`（XML特殊文字 `& < > " '` はエスケープ）・`<LastName>` は空・`<accountindex>0</accountindex>`
- 認証: HTTP Basic（`.env.local` の `PHONEBOOK_USER` / `PHONEBOOK_PASS`・timingSafeEqual・両方未設定時のみ素通し＝片方設定なら fail-closed）。401 時は `WWW-Authenticate: Basic realm="phonebook"`
- 実装: `src/lib/grandstream-phonebook.ts`（XML整形＋Basic照合・純関数）＋ `src/app/api/phonebook/grandstream/route.ts`
- 公開経路: nginx に `location = /n/api/phonebook/grandstream` の auth_request バイパス（X-Auth-* 空化・IP制限なし＝Basic認証が門）を追加済み（設定はサーバー側・このリポ外。**2026-07-16 適用済み・まさし承認**。公開URL実測: 認証なし401 / 正認証200・679件 / 誤認証401）。残りは GDMS テンプレ（DP750/WP810）への URL＋Basic 認証設定と 1Password への資格情報保存（まさし対応）

---

## 番号正規化 共通部品（src/lib/phone.ts）

電話帳・ブラックリスト・CDR照合で共通利用する電話番号正規化の純関数群（2026-07-13 Phase A・DB/UI非結線）。

- `normalizePhone(raw)` — 全角→半角（NFKC）・ハイフン/括弧/空白/`TEL`等を除去し数字のみへ。`+81`→`0` 変換（他の国番号は変換なし）。内線（数字3〜4桁）・非数字（anonymous 等）は `null`。桁数非標準（先頭0欠落の旧データ等）は破棄も復元もせずそのまま返す
- `splitPhones(raw)` — 複数番号を `/ 、 , ; 改行`（全角含む）で分割し `{ raw, normalized }` の配列を返す。スペースでは分割しない
- `isExtension(raw)` — 内線判定（数字抽出後 3〜4桁）
- `isCanonicalJp(normalized)` — 0始まり10〜11桁かの表示制御用ヘルパー（復元はしない）
- 突合キーは**正規化後の数字列の完全一致**。原表記は呼び出し側で別に保持する
- 単体テスト: `npm test`（vitest / `src/lib/phone.test.ts`・21ケース）

---


This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## マニュアル
利用者向けマニュアル: https://banto.hakata-yamato.co.jp/manual/naisen.html （NavBarの📖からも開ける。実体は smile-mgmt/manual/）
