# naisen-app

番頭さん（総合管理システム）の電話履歴管理アプリ。Next.js 16 App Router + PostgREST。

## 取引先の追加電話番号との連携（partner_phone_numbers・2026-07-22）

master-app に新設された `partner_phone_numbers`（取引先の追加電話番号・番号相違や複数拠点用）に対応。

- 通話履歴の名前解決（`resolveCallerNames`/`buildNameMap`）が、取引先の会社代表電話（`partners.phone`）に加えて `partner_phone_numbers` も見るようになり、追加登録した番号からの着信も取引先名で表示される
- 電話帳の連絡先を取引先にリンク（新規作成・編集どちらも）すると、その連絡先の電話番号が取引先側にまだ登録されていなければ自動で `partner_phone_numbers` へ追加（`source=phonebook_link`・ラベルは「電話帳連携: (連絡先名)」・fail-soft＝失敗してもリンク自体は成立）
- 実装: `src/lib/phonebook.ts` の `syncPartnerPhoneFromEntry`・`src/lib/phonebook-match.ts`（`PartnerExtraPhoneRow`）

## 通話履歴のクイック登録にカテゴリ選択を追加＋反映遅延の修正（2026-07-22）

- `/calls` のクイック電話帳登録（✏️）に、`/phonebook` と同じ管理済みカテゴリ（`phonebook_categories`）のプルダウンを追加。`buildNameMap`（`lib/phonebook-match.ts`）が返す `ResolvedName.categoryKey` を新設し、編集フォーム・突合バッジ（未分類は非表示）の両方に反映。API側（`/api/phonebook` POST/PUT）は元々 `category_key` 対応済みだったため変更不要。
- **通話履歴の反映遅延バグ修正**: 電話帳へ登録した直後、`/calls` へ移動しても反映されずリロードすると出てくる問題があった。原因はNavBarの `<Link>`（ソフト遷移）経由だと、ページ自体は `force-dynamic` でもNext.jsのクライアント側Router Cacheが古いRSCペイロードを再利用していたこと。`next.config.ts` に `experimental.staleTimes: { dynamic: 0 }` を追加して解消。
- 検証: tsc 0・vitest 163green（既存テストの期待値に `categoryKey` 追加が必要だった1件を修正）・build成功・デプロイ後200/302・実機でカテゴリ一覧が正しく渡っていることを確認。

## 電話帳 UI改善＋SmileEstate区分整理（2026-07-19）

- **電話帳（掲載先）フィルタ新設**: 一覧の区分フィルタの隣に「電話帳: すべて／各電話帳／非掲載（登録のみ）」プルダウン。「非掲載」は phonebook_entry_books 0件のエントリ。
- **編集フォームのインライン化**: 行の「編集」でその行の直下に編集フォームを表示（従来は上部固定でスクロールが必要だった）。「編集」再押下 or キャンセルで閉じる。新規追加フォームは従来どおり一覧上部。実装は editForm を変数化し 新規=上部/既存=行直下 の2箇所で描画。
- **データ整理（まさし指示・SQL直実行）**: 区分「管理会社」（cat_mrqibo2y）を新設し、SmileEstate電話帳掲載×区分=取引先の448件を「管理会社」へ変更。SmileEstate掲載×区分=ホテルの15件は掲載電話帳を全解除（＝非掲載・登録のみ）。配信フィードはトリガで自動更新。

## FAX受信管理（2026-07-18）

FreePBX の FAX 受信 PDF を番頭さん側に取り込み、一覧・仕分け・対応管理する（案A: PDF実体を番頭さん側 DB に base64 保存。二重化期間中は FreePBX 側の Drive 保存も並行）。

- テーブル: `naisen_fax_messages`（PDF は `pdf_data` に base64・冪等キー `pbx_uniqueid` UNIQUE・status/category/memo・`linked_type/linked_id` は将来の実体接続用に温存）
- 受け口 API: `POST /n/api/fax/inbound`（FreePBX fax-postprocess が叩く。nginx `location = /n/api/fax/inbound` で **TelPro FreePBX の IP のみ allow・auth_request バイパス・client_max_body_size 30m**、アプリ側で **Bearer（`SYNC_FEED_TOKENS` 共用）** 検証の二重防御。JSON 推奨・multipart も可。同一 `uniqueid` の再 POST は 200＋既存 id で冪等）
- Slack 通知: 登録成功後に `SLACK_FAX_WEBHOOK`（Incoming Webhook・PBX 側 `/etc/telpro-fax.env` と同値）へ「新着FAX＋画面リンク」を送信。通知失敗でも登録は成立（ログのみ）
- 画面: `/n/fax`（一覧・期間/ステータス/区分絞り込み・**🗑 削除済み（ゴミ箱）ビュー切替**・行内でステータス/仕分け変更・削除/復元）＋ `/n/fax/[id]`（単票: PDF プレビュー iframe・ステータス/仕分けボタン・メモ・削除。削除済みは警告バナー＋復元ボタン。Slack 通知のリンク先）
- PDF 配信: `GET /n/api/fax/[id]/pdf`（inline・`?dl=1` で attachment。X-Auth-User 必須＝録音再生と同方針）
- ステータス: `untriaged`=未仕分け／`open`=未対応／`done`=対応済み（**`dm` は 2026-07-18 廃止→削除に一本化**）。仕分け区分: `invoice`=請求書／`payment`=支払明細／`other`=その他（パターンB: 区分のみで受け、外部には出さない）。仕分けすると untriaged は自動で open へ
- 編集ロール: admin / shain（camera-app と同方針・`X-Auth-Role` をアプリ側で再チェック）。閲覧は全ログインユーザー
- **削除（ゴミ箱・2026-07-18）**: 「削除」で `deleted_at` をセット（ソフトデリート・admin/shain のみ・`POST /n/api/fax/[id]/delete`）。一覧/詳細から消え「🗑 削除済み」ビューでのみ表示・**復元**可（`POST /n/api/fax/[id]/restore`）。**削除日から30日経過で `scripts/purge-fax.mjs`（cron 毎日4:50・flock）が PDF ごと物理削除**（復元不可）。再削除は削除日を上書きしない（30日時計を守る・冪等）。DDL: `supabase/fax_delete.sql`
- 実装: `src/lib/fax.ts`（区分/ステータス定義・ロール判定）・`src/lib/slack.ts`（Webhook 通知）・`src/app/api/fax/*`・`src/app/fax/*`・`scripts/purge-fax.mjs`（完全削除バッチ・supabase-js は単体 Node20 で WS 要求のため PostgREST 直 fetch）

---

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

## ダークモード ホバー修正 全画面（2026-07-16）

- dark:hover: 指定漏れでホバー時に白背景になる問題を全画面で修正: 連絡先（電話帳）・不在着信・レポート・ダッシュボード・統計の行ホバー、ブランド/期間フィルタチップ、トグルボタン、応答率の赤/黄行（dark常時明色も修正）、アップロードのドロップゾーン。

## 通話履歴 F2 改修（2026-07-18・5点）
- **録音の再生/ダウンロード（2-1）**: 各行に ▶再生（インライン `<audio>`）と ⬇DL。`GET /n/api/calls/recording?id=<naisen_calls.id>`（`&dl=1` で添付DL・`?vm=<file>` は留守電アーカイブ用）。実体は PBX `/var/spool/asterisk/monitor/YYYY/MM/DD/`（日付はファイル名から導出）。取得は PBX の **recfetch ユーザー（forced-command SSH・読み取り専用・鍵 `~smileadmin/.ssh/recfetch_ed25519`）**。認証は nginx auth_request 通過＋`X-Auth-User` 必須・クライアントからファイル名は受けない（IDのみ）。env: `REC_SSH_*`（未設定時は既定値）。
- **IVR経路の人間可読化（2-2・まさし承認方式=CDR取込拡張のみ・PBX無変更）**: pull SELECT に `lastdata` を追加し、後続レグから「大和B→キャンセル」「SmileFood→経理」「HYD(IVR途中切断)」「大和B→留守電」「TableCheck転送」「◯◯→担当者不在案内」を判別（`cdr-transform.ts` の IVR_NAMES / GROUP_ROUTES / ANNOUNCEMENT_LABELS・FreePBX 実体照合 2026-07-18）。48h窓の再取込で直近分は自動で新表記に置換・それ以前の旧 `ivr-N` は表示時に名称へ読替（CallsClient LEGACY_IVR_NAMES）。
- **拒否ステータス（2-3）**: ブラックリスト着信（`dcontext=app-blackhole` 終端）を `status=REJECTED`（表示「拒否」）に分離。
- **留守電ステータス**: `lastapp=VoiceMail` 完了を `status=VOICEMAIL`（表示「留守電」）に分離（従来はすべて不在）。v_naisen_daily 等の no_answer 集計から留守電/拒否分が除かれる点に注意。
- **81形式の表示正規化（2-4）**: `to0Form` を cid-lookup と同一の `^81[1-9]\d{8,9}$` に統一（0120 フリーダイヤル等 11桁が旧条件「12桁以上」から漏れていた実例 `81120426288` を修正）。取込時に 0 形式で保存＋旧データは表示時 `fmt81` で読替。
- **内線通話の発着表示（2-5）**: 内線同士は回線列に「内線→ <着信内線> <名前>」、発信ビューの発信内線にも名前を表示。名前は電話帳 kind=extension（在職のみ）から解決し、内線発 caller の名前も電話帳列に補完。

## 通話履歴 /n/calls 改善（2026-07-16 第2弾）

- **電話帳列を新設**（発信元の右）: 相手名・出所チップ・グループ・着信拒否チップ・取引先・メモをこの列に集約し、行を1行に（縦長解消）。発信元列は番号のみ。
- **インライン編集の強化**: ✏️編集/＋登録フォームに「グループ」「着信拒否 ☑」を追加（blocked は FreePBX blacklist フィードに反映）。「電話帳で詳細 ↗」で /n/phonebook を新しいタブで開ける。
- **CNAM プレフィックス除去**: PBX の電話機表示プレフィックス（例「他|水炊き大和|090xxx」）を `cleanCnam()`（src/lib/phone.ts・単体テストあり）で除去。取込時（cdr-transform）＋表示時（過去データ）の両方に適用。
- **🔄 更新ボタン**: ヘッダーに追加（router.refresh でリロード不要の最新取得）。
- **ダークモード修正**: 行ホバー・リセットボタンが白背景になる class 指定漏れ（dark:hover: 欠落）を修正。

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
- **CID逆引き `GET /n/api/sync/lookup?number=<着信CID>`（2026-07-18）**: 着信番号→表示名 1 件を text/plain で返す（`?format=json` 可）。名前解決は履歴画面と同一の `resolveCallerNames`（電話帳→名刺→取引先→従業員）＋電話帳ヒットはヒット番号 kind で `display-name.ts` の 内線)/外線)/携帯)/AP) プレフィックス。未登録・blocked・エラーは空文字 200（fail-open・着信を止めない）。着信CIDの `+81`/素の `81` 変形は `src/lib/cid-lookup.ts` の `normalizeCidNumber` で吸収（共通 `phone.ts` は不変）。認証は Bearer に加え Basic 可（FreePBX cidlookup モジュール対応・`isValidSyncAuth`）。nginx は既存 `location /n/api/sync/`（IP許可）配下のため**追加設定不要**

---

## 電話帳配信システム（2026-07-16・区分/電話帳マスタ/端末別配信/ふりがな）

番頭さんをマスタに、DP750（Grandstream XML）と Acrobits Groundwire（JSON）へ端末別の連絡先リストを配信する。設計詳細は **docs/phonebook-distribution.md** を参照。

- **スキーマ**: phonebook_categories（区分・可変・未分類 is_system は削除不可・削除→FK on delete set default で未分類へ）/ phonebook_books（配信の束・seed: 本社/店舗/共通）/ phonebook_entry_books（掲載・多対多・0件=非掲載）/ phonebook_identity_books（内線→購読・0件=all フォールバック）/ phonebook_feed_state（Last-Modified 単一ソース・関連6テーブルの statement トリガで更新）。entries に furigana / furigana_verified / category_key / active（退職=false・暫定手動）、numbers に kind（**2026-07-18 5種化**: extension=内線)/company_050=外線)/mobile=携帯)/ap=AP)/external=なし。旧 internal は company_050 に読替え）。entries に employee_no（FK→employees・任意・ON DELETE SET NULL）で社員と紐づけ（master-app 社員一覧が参照表示・人事連動の土台）
- **配信API（Basic 認証共通・If-Modified-Since→304 対応）**:
  - `GET /n/api/phonebook/acrobits?user=<内線>` … Groundwire Web Service Contacts JSON（contactId=entry PK・fnamePhonetic=ふりがな・checksum=updated_at・**company=区分名 2026-07-18**）。**配布推奨URLは `?user=%account[username]%`（端末が内線を自動送信・全端末同一URL）**
  - `GET /n/api/phonebook/grandstream?user=<内線>` … AddressBook XML（?user= 無しは従来どおり全件＝既存 GDMS 設定互換）
  - 絞り込み共通: `?groups=`（旧形式・group_name・テスト用オーバーライド・groups 優先）/ 退職・blocked 除外 / 番号はダイヤル可能形（先頭0国内表記・内線は数字そのまま）
  - 実装: `src/lib/phonebook-feed.ts`（純関数）＋ `phonebook-feed-server.ts`（DB）＋ `display-name.ts`（内線)/外線)/携帯)/AP) プレフィックス。配信 displayName/vCard FN（エントリ内番号の優先 kind extension>company_050>mobile>ap で付与）と /api/sync/lookup で共用 2026-07-18）
- **拠点内線の略称表示（2026-07-18）**: 拠点（共有）内線の配信 displayName はエントリ名でなく「内線)<拠点略称>」（8000=内線)本社・8001=内線)中洲・8002=内線)西新・8003=内線)CK・8004=内線)イベント・8900=内線)本社FAX。個人内線は従来どおり 内線)<名前>・2026-07-18 全拠点化）。実装 `display-name.ts` の `siteExtensionLabel`＋`feedDisplayName`（Groundwire JSON／Grandstream XML／CardDAV FN の3経路はこの1点を共用）。FreePBX/SIP 設定・外線 cidlookup は無変更
- **ふりがな**: `GET /n/api/furigana?name=◯◯` →ひらがな（kuroshiro+kuromoji・辞書はシングルトン初回読込・カタカナは kataToHira で後段変換）。一括バックフィル `scripts/backfill-furigana.mjs`（2026-07-16 実行済み・958件生成・既存1件温存・verified=false）。フォームは名前 blur/paste で自動入力→人が「確認済」チェック
- **UI**: /n/phonebook「連絡先」（区分フィルタ・在職者のみ・ふりがな未確認のみ・掲載電話帳チップ・区分/電話帳管理パネル〔削除は確認付き・区分削除→未分類/電話帳削除→掲載と割当から自動除去・all は削除不可〕）＋ /n/phonebook/devices「端末電話帳」（内線ごとに配る電話帳を on/off・未設定=共通）
- **管理API**: `/n/api/phonebook/categories`・`books`（GET/POST/DELETE）・`identity-books`（GET/PUT/DELETE）。変更は admin のみ（fail-closed）
- **ブラックリスト相互移動（2026-07-16）**: 一覧ビューは 連絡先（blocked=false のみ）/ ブラックリスト（blocked=true のみ）/ すべて。操作列の「BLへ」「解除」で行単位の相互移動（blocked のみ送信＝区分・掲載・番号は現状維持。純関数 `src/lib/phonebook-view.ts`）。旧「拒否」グループ276件は 2026-07-16 に blocked=true へ統一（うち1件 #229 が未ブロックだった不整合を解消・配信 680→679件）
- **nginx**: `location = /n/api/phonebook/acrobits` バイパス **2026-07-16 適用済み（まさし承認）**。公開URL実測=認証なし401 / user=8000 で680件（拒否BL化後679件）/ 304
- **Groundwire プロビジョニング配布（2026-07-17・provlinkbs 方式）**: `GET /n/api/phonebook/provisioning/groundwire?token=<PROVISIONING_TOKEN>` を新設。アプリUA(`acrobits|groundwire|cloudsoftphone`)には wsContacts 系 prefKey だけの mergeable `<account>` XML(priority=5)を返し既存SIPアカウントを温存、ブラウザ/カメラには「Groundwire で開く」ボタン付きHTMLランディングを返す（iOSはカスタムスキームを**タップ時のみ**発火＝302リダイレクトは不可の実機知見 2026-07-17。ボタン href=`provlinkbs://…?fmt=xml`）。token(=`.env.local` PROVISIONING_TOKEN・未設定/不一致404)でフィード認証情報を保護。個人連絡先ソース(ab)は不変=本体連絡先ON・iPhone連絡先には非書込。nginx `location = /n/api/phonebook/provisioning/groundwire` バイパス 2026-07-17 適用。実装 `src/app/api/phonebook/provisioning/groundwire/route.ts`。手順/QR/検証観点は docs。**まさし1台テスト待ち**
- **一括更新（2026-07-17）**: 旧「その他_SmileEstate」29件を物理削除（numbers/entry_books は FK cascade）。管理会社_SmileEstate 448＋ホテル 15＝463件を電話帳「SmileEstate」（book_mrnjlno5・UI作成）に掲載し「共通(all)」から除去 → all 配信は184件・SmileEstate 購読は463件（実測）。事前バックアップ /var/backups/bantosan/phonebook_pre_bulk_20260717.sql
- **ふりがな verified の UI 撤去（2026-07-17）**: 一覧の「未確認」バッジ・「未確認のみ」フィルタ・フォームの「確認済」チェックを削除（furigana_verified 列とデータ・自動入力 /api/furigana は温存＝UI表出のみ撤去）
- **retail Groundwire 正式経路確定（2026-07-18）**: Settings → Web Services の**手入力**で wsContacts 設定可と実機確定（まさし端末・provlink/CardDAV 不要）。配布URLは `https://banto.hakata-yamato.co.jp/n/api/phonebook/acrobits?user=%account[username]%` に統一。CardDAV（naisen-carddav:3012）は予備経路として稼働継続。provlink 系はコード温存のみ
- **区分の配信（2026-07-18）**: Acrobits 公式 schema にグループ／カテゴリ項目は**無い**（畳み表示は不可）→ 最近縁の `company` に区分名（phonebook_categories.name）を搭載。CardDAV は vCard `ORG:` に同値。詳細と代替所見は docs/phonebook-distribution.md「改訂（2026-07-18）」
- **残作業**: 人事（employees）との active 自動連動（内線⇔社員の紐付けキー決定待ち）／まさし端末の wsContacts URL を `?user=8000` 直書き → `%account[username]%` 形式へ貼り替え
- pm2 は kuromoji 辞書分を見込み `--max-memory-restart 512M`（deploy.yml）

---

## Grandstream XML 電話帳配信（2026-07-15・07-16に ?user=/304 拡張）

Grandstream 電話機（DP750/WP810）が定期ダウンロードする AddressBook XML を配信する。

- `GET /n/api/phonebook/grandstream` → `Content-Type: text/xml; charset=utf-8`・`Cache-Control: no-cache`（Last-Modified/304 対応）
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

- **CardDAV 配信（2026-07-17・retail Groundwire 正式経路）**: `carddav/server.mjs`（pm2: naisen-carddav・port 3012・サイドカー）。URL=`/n/carddav/<内線 or all>/`・Basic同認証・vCardふりがな付き。詳細は docs/phonebook-distribution.md。
