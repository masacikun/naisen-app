# 電話帳配信システム（端末別配信・区分・ふりがな）

作成: 2026-07-16 / 対象: naisen-app + DP750 / Acrobits Groundwire + FreePBX(telpro)

## 全体像（2階建て）

- **① 着信名の表示**: FreePBX 側で着信番号を逆引きし `CALLERID(name)` を書き換え（端末非依存・別作業 `/lookup`）。表示名プレフィックスは `src/lib/display-name.ts` を共用（着信番号の kind で 内線)／外線)／携帯)／AP)／なし。2026-07-18 から配信 displayName / vCard FN にもエントリ優先 kind で同プレフィックスを付与＝まさし指示。§「displayName 区分プレフィックス非推奨」の記述は**区分名**プレフィックスの話であり別物）。
- **② 電話帳の配信**: 番頭さん（マスタ）→各端末へ連絡先リストを同期。割り当ては「内線番号（=SIPユーザー名）」をキーにサーバー側で解決。DP750 も Groundwire も同じ定義を参照。

## データモデル

| テーブル | 役割 |
|---------|------|
| `phonebook_categories` | 区分マスタ（可変・`unclassified` は is_system=true で削除不可）。区分削除→連絡先は FK `on delete set default` で未分類へ |
| `phonebook_books` | 電話帳マスタ＝配信の束（seed: honsha/本社, tenpo/店舗, all/共通） |
| `phonebook_entries` | 連絡先。拡張列: `furigana`（ひらがな）/`furigana_verified`/`category_key`/`active`（人事連動・退職=false） |
| `phonebook_entry_books` | 連絡先→掲載電話帳（多対多）。**掲載0件＝非掲載**。電話帳削除で cascade |
| `phonebook_numbers.kind` | `extension`(内線)/`internal`(社内外線・携帯)/`external`(取引先など・既定) |
| `phonebook_identity_books` | 内線（SIPユーザー名）→購読電話帳。**購読0件＝配信時 `all` フォールバック** |
| `phonebook_feed_state` | 配信の Last-Modified 単一ソース。関連6テーブルの statement トリガで自動更新（304 判定用） |

## 配信エンドポイント（Basic 認証 = PHONEBOOK_USER / PHONEBOOK_PASS）

- `GET /n/api/phonebook/acrobits?user=<内線>` … Acrobits JSON（fnamePhonetic=ふりがな・contactId=entry PK・checksum=updated_at）
- `GET /n/api/phonebook/grandstream?user=<内線>` … Grandstream AddressBook XML（従来の全件配信は `?user=` 無しで互換維持）
- 共通仕様: `?groups=`（旧形式・group_name 絞り＝テスト用オーバーライド・user と両方来たら groups 優先）／退職・blocked 除外／`If-Modified-Since`→304（`Last-Modified`=feed_state）／番号はダイヤル可能形（先頭0国内表記・内線は数字そのまま）
- 端末は動的IPのため **IP制限不可＝Basic over https**。IP固定許可は `/lookup`（PBX）のみ。

## CardDAV 配信（2026-07-17 時点の正式経路 → **2026-07-18 改訂で予備経路へ降格**。最新は文末「改訂（2026-07-18）」参照）

**retail（App Store版）Groundwire は provlinkbs:// スキーム未登録**でプロビジョニング起動不可と実機確定
（「Groundwireで開く」ボタン・Appleメモのリンクとも発火せず）。そのため **CardDAV を主経路**とする。
wsContacts 版（下記プロビジョニング雛形）は将来のビジネス版/別端末用に温存。

- 実体: `carddav/server.mjs`（**pm2: naisen-carddav・port 3012・別プロセス**。Next.js App Router が
  PROPFIND/REPORT を受けられないためサイドカー。純ロジック=carddav/lib.mjs・vitest対象）
- URL: `https://banto.hakata-yamato.co.jp/n/carddav/<内線番号 or all>/` … このパスが addressbook コレクション。
  `?user=` クエリではなく**パスで内線を指定**（CardDAV クライアントはクエリを保持しない場合があるため）。
  購読解決・退職/blocked除外・内線番号配信は acrobits フィードを localhost 経由で再利用（ロジック単一）。
  `all` は購読なしフォールバックで all 電話帳（約184件）。
- 認証: 同じ Basic（PHONEBOOK_USER/PASS）・https のみ。nginx `location ^~ /n/carddav/` → 127.0.0.1:3012
  （auth_request バイパス・X-Auth-* 空化・IP制限なし=端末動的IP）。
- vCard 3.0: FN/N・TEL（内線含む全番号・X-LABEL=区分）・UID=bantosan-<id>・REV=updated_at。
  **ふりがなは X-PHONETIC-FIRST-NAME / X-PHONETIC-LAST-NAME / SORT-STRING の3キーに載せる**
  （iOS/Groundwire がどれを解釈するかは実機確認で絞る予定）。
- 対応メソッド: OPTIONS / PROPFIND(depth 0/1) / REPORT(addressbook-query=全量・addressbook-multiget=指定href) /
  GET(単品 .vcf とコレクション一括 .vcf)。書き込み系は 403（番頭さんが正・読み取り専用）。
  全リクエストを pm2 ログに記録（実機の要求採取用: `pm2 logs naisen-carddav`）。
- 運用: Actions デプロイは naisen-carddav も restart（workflow に追加済み）。手動時は `pm2 restart naisen-carddav`。
- 端末手順（利用者向け）: smile-mgmt `manual/naisen.html`「スマホに会社電話帳を入れる」参照。
  Groundwire アプリ内の連絡先ソースとして繋ぐため **iPhone 本体連絡先には同期されない**。

## Acrobits プロビジョニング雛形（グローバル prefKey・全端末同一でよい）

```
wsContactsUrl              = https://banto.hakata-yamato.co.jp/n/api/phonebook/acrobits?user=%account[username]%
wsContactsAuthUsername     = <feed-user>   # 1Password「番頭さん 電話帳配信（Grandstream電話機用）」と共通
wsContactsAuthPassword     = <feed-pass>   # https のみ送信
wsContactsRefreshInterval  = 300
```

- retail Groundwire は GUI に入力欄が無いため**プロビジョニングXML（account.html 準拠）で配布**。
- `%account[username]%` が SIP ユーザー名（=内線番号）を自動送信 → サーバーが購読電話帳を解決。

## DP750（GDMS）

- Phonebook XML URL: `banto.hakata-yamato.co.jp/n/api/phonebook/grandstream?user=<拠点内線>`（例 `8001`）＋ Basic 認証。スキームは GDMS の「Enabled, use HTTPS」に任せ URL に `https://` を書かない（2026-07-16 の教訓）。
- ベース＝拠点＝固定内線なので静的直書きでよい。

## nginx（承認後に適用・sync/grandstream と同形）

```nginx
    # Acrobits JSON電話帳配信（Groundwire定期DL用・Basic認証はアプリ側・端末が動的IPのためIP制限なし）
    location = /n/api/phonebook/acrobits {
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # この経路では認証ヘッダーを常に空にする（クライアント付与のなりすまし防止）
        proxy_set_header X-Auth-User "";
        proxy_set_header X-Auth-Email "";
        proxy_set_header X-Auth-Role "";
        proxy_pass http://naisen_app;
    }
```

- `/n/api/furigana` は認証必須の内部利用のため **nginx 追加不要**（既存 `location /n` の auth_request 配下で動く）。
- 着信逆引き `/n/api/phonebook/lookup`（別依頼）は PBX 固定IPのみ: `allow 162.43.89.64; deny all;`

## ふりがな

- `GET /n/api/furigana?name=◯◯` → `{ furigana }`（kuroshiro+kuromoji・ひらがな・初回のみ辞書読込のシングルトン）
- 一括バックフィル: `cd /var/www/naisen-app && node --env-file=.env.local scripts/backfill-furigana.mjs`（`--dry-run` あり・既存ふりがな温存・verified=false）
- 自動生成は下書き。人が確認して `furigana_verified=true`（人名の読みは自動だと外しやすい）。

## 運用メモ

- 購読の変更・掲載の変更は即 `phonebook_feed_state` が進む → 端末の次回ポーリング（既定180〜300秒）で反映。
- 人事連動（在職/退職）は暫定 `entries.active` 手動。employees テーブルとの自動連動は内線⇔社員の紐付けキー決定後（§要確認）。
- pm2 の `--max-memory-restart` は kuromoji 辞書分を見込み 512M（deploy.yml）。

---

## 配布実装（2026-07-17・provlinkbs 方式・1台テスト先行）

### エンドポイント
`GET /n/api/phonebook/provisioning/groundwire?token=<PROVISIONING_TOKEN>`

- **アプリUA**（`acrobits|groundwire|cloudsoftphone`）→ mergeable `<account>` XML を `application/xml` で返す。
- **ブラウザ/カメラUA** → `provlinkbs://<host>/…?token=…` へ 302。iOS が Groundwire を起動し、アプリが同 URL を再取得して適用。
- `token` は `.env.local` の `PROVISIONING_TOKEN`（未設定/不一致=404）。フィードの Basic 認証情報を含むため必須。**token 値は git に入れない**（README/docs は placeholder）。
- 返す prefKey（`priority=5 source=provisioning` の mergeable ＝ 既存 SIP アカウント温存）:
  - `wsContactsUrl` = `https://banto.hakata-yamato.co.jp/n/api/phonebook/acrobits?user=%account[username]%`
  - `wsContactsAuthUsername` / `wsContactsAuthPassword` = `PHONEBOOK_USER` / `PHONEBOOK_PASS`
  - `wsContactsRefresh` と `wsContactsRefreshInterval` = 300（キー名の版差ヘッジで両方。テスト後に有効な方へ整理＝要確認）
- **個人連絡先**: 連絡先ソース `ab`（本体）には触れない → 本体連絡先は ON のまま。会社（`ws`）は別ソースとして追加され、Groundwire 上で会社/個人を切替表示。iPhone「連絡先」アプリには書き込まない（`ws` は端末内の別ストア）。

### provlink スキーム（Acrobits 4種）
| scheme | 転送 | モード |
|---|---|---|
| provlink | http | 置換 |
| provlinks | https | 置換 |
| provlinkb | http | マージ（既存温存） |
| **provlinkbs** | **https** | **マージ（既存温存）** ← 採用 |

### iOS 読み込み手順（retail Groundwire・実機基準）
前提: 対象 iPhone に Groundwire インストール済み・SIP アカウント登録済み。

1. 配布リンクを対象 iPhone で開く／QR をカメラで読む。
   - 主動線: **https リンク**を Safari で開く → サーバーが `provlinkbs://` へ 302 →「"Groundwire" で開きますか?」→ 開く → 取り込み。
   - フォールバック: `provlinkbs://…` を直接タップ（メモ/メール等から）。
2. Groundwire がプロビジョニング適用の確認を出したら承認。マージ方式のため既存アカウントは消えない。
3. Groundwire → 連絡先 → ソース切替に「Web（会社電話帳）」が増える。初回同期で会社電話帳が入る。
   - ※retail Groundwire はプロビジョニング UI が版により異なる。取り込めない場合は実機の挙動/詰まりポイントを要報告。

### 配布リンク/QR（1台テスト用・token 値は別途 1Password / チャット）
- https（QR 推奨）: `https://banto.hakata-yamato.co.jp/n/api/phonebook/provisioning/groundwire?token=<PROVISIONING_TOKEN>`
- 直リンク: `provlinkbs://banto.hakata-yamato.co.jp/n/api/phonebook/provisioning/groundwire?token=<PROVISIONING_TOKEN>`
- 本番配布時は端末ごとに使い捨て token を推奨。

### nginx（本エンドポイント用バイパス・2026-07-17 適用・token がアプリ層の門）
```nginx
    # Groundwire プロビジョニング配布（token 保護・UA判定で provlinkbs 誘導・IP制限なし）
    location = /n/api/phonebook/provisioning/groundwire {
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Auth-User "";
        proxy_set_header X-Auth-Email "";
        proxy_set_header X-Auth-Role "";
        proxy_pass http://naisen_app;
    }
```

### 検証観点（まさし携帯1台）
1. Groundwire の連絡先に会社電話帳が出る（購読なし=all=約184件）。
2. iPhone「連絡先」アプリに会社データが**書かれていない**（本体が汚れない・重複しない）。
3. ふりがな順（あいうえお）で並ぶ（`fnamePhonetic`）。
4. Groundwire 上で1件消しても次の同期で復活（サーバー正）。

---

## 改訂（2026-07-17・その2）: リンク方式NG（実機）→ タップ式ランディングへ

**実機結果**: 配布ページの `https://…` と `provlinkbs://…` を Safari/Chrome の**アドレスバー/302リダイレクト/QR→アドレス**で開くと「アドレスは無効です」。カメラ QR も無反応。

**原因**: iOS は**カスタムスキームを「リンクとしてタップ」した時のみ**起動する（アドレスバー入力・リダイレクトでは発火しない）。前実装の 302 誘導が誤り。スキーム `provlinkbs://` 自体は正しい（Acrobits 公式例 `provlinkbs://tester:testing@dist.acrobits.net/test/ppprovlink.xml`）。

**対応（実装）**: エンドポイントのブラウザ経路を **302 → タップ可能ボタンの HTML ランディング**に変更。
- `GET …/groundwire?token=…`（ブラウザ）→「Groundwire で開く」ボタン `<a href="provlinkbs://…?token=…&fmt=xml">` を含む HTML を返す。
- ボタン tap → `provlinkbs://` 発火 → Groundwire が `https://…?token=…&fmt=xml` を取得。
- `fmt=xml` は UA 非依存で XML を返すトリガ（Groundwire の fetch UA 不確実性を排除）。アプリ UA でも XML。

**retail Groundwire iOS の正規経路（調査結論）**:
- アプリ内に**任意 XML の URL インポート欄は無い**。`Restore configuration`（Keypad → 設定 → Preferences → Restore configuration）は **Groundwire 自身が作る暗号化バックアップ（パスワード付）専用**で、任意プロビジョニング XML の取込には使えない。
- wsContacts は公式に「Cloud Softphone ポータル or Acrobits SDK の prefKey 直接」＝ **retail に wsContacts 手入力 GUI は無い**。手入力フォールバックは不可。
- よって retail の唯一の経路は **provlinkbs リンクを「タップ」で発火**させるプロビジョニング。

**まさし1台テスト手順（改訂・これが最新）**:
1. 配布ページ（QR / https リンク）を対象 iPhone の Safari で開く →「**Groundwire で開く**」ボタンを**タップ**。
2. 「"Groundwire" で開きますか?」→ **開く** → プロビジョニング適用を承認（マージ＝既存アカウント温存）。
3. Groundwire → 連絡先 → ソースに「Web（会社電話帳）」。初回同期で約 184 件。
4. **開かない場合**: ページ内の `provlinkbs://…` リンクを長押しコピー → Apple「メモ」に貼付（リンク化される）→ **メモ上でタップ**。
   - それでも不可なら、この retail 版が `provlinkbs` スキーム未登録の可能性 → 要報告（次善策: CardDAV 連絡先ソース〔Groundwire GUI で手入力可〕をサーバーに追加する案。ただし wsContacts とは別実装）。

**旧「iOS 読み込み手順」節（302 前提）は本改訂で置換**。サーバーの配布 XML（mergeable・wsContacts）は不変。

---

## 改訂（2026-07-18）: retail Groundwire は Web Services 手入力で wsContacts 設定可 → これを正式経路に

**実機結果（まさし端末・2026-07-18）**: retail Groundwire の **Settings → Web Services** から wsContacts の
URL・Basic 認証を**手入力**で設定でき、会社電話帳の表示に成功。**provlink プロビジョニングも CardDAV も不要**だった。

- **正式経路 = Groundwire アプリ内 Settings → Web Services の手入力**（実装済みの `/n/api/phonebook/acrobits` をそのまま利用）。
- **CardDAV（naisen-carddav・port 3012）は予備経路へ降格**（稼働は継続。iPhone 本体連絡先に入れたい場合や
  wsContacts 非対応クライアント用に温存）。
- provlink 系（タップ式ランディング含む）は retail で `provlinkbs://` が発火しないため**終了**（コードは温存・ビジネス版用）。

### 推奨URL（配布・手順書はこの1本に統一）

```
https://banto.hakata-yamato.co.jp/n/api/phonebook/acrobits?user=%account[username]%
```

- `%account[username]%` は Groundwire が SIP アカウントのユーザー名（=内線番号）に**端末側で自動置換**して送信
  → サーバーが `phonebook_identity_books` で購読電話帳を解決。全端末に同一 URL を配布すればよい。
- Basic 認証 = `PHONEBOOK_USER` / `PHONEBOOK_PASS`（1Password「番頭さん 電話帳配信（Grandstream電話機用）」）。
- ※まさし端末は検証時に `?user=8000` 直書きで設定済み → 上記 `%account[username]%` 形式へ手動で貼り替え予定。

### 設定手順（利用者向け詳細は manual/naisen.html）

1. Groundwire → Settings → **Web Services**（wsContacts / Web Contacts 相当の項目）を開く。
2. URL に上記推奨URLを入力。認証ユーザー名/パスワードに Basic 認証情報を入力。
3. 連絡先タブのソースに Web 電話帳が追加され、初回取得で会社電話帳が表示される（以後 定期ポーリングで自動更新・既定180秒）。

### グループ（区分）表示の調査結論（2026-07-18）

**公式 schema（doc.acrobits.net/api/client/web_contacts/）にグループ／カテゴリ項目は存在しない。**
Contact dictionary の全キーは以下のみで、畳み表示・セクション分け用のフィールドは無い:

```
contactId, displayName, checksum, fname, mname, lname,
fnamePhonetic, mnamePhonetic, lnamePhonetic, nick, namePrefix, nameSuffix,
company, departmentName, jobTitle, birthday, notes, contactEntries, contactAddresses
```

→ **wsContacts JSON では区分ごとの畳み表示は不可**（Groundwire の一覧はソース内フラット・ふりがな順）。

**実施した実装（最近縁キーへの搭載）**: 番頭さんの区分名（取引先/社内/店舗/ホテル/アルバイト/その他/未分類）を
`company` フィールドに載せて配信（`phonebook_entries.category_key` → `phonebook_categories.name`）。
CardDAV 側も同値を vCard `ORG:` に搭載。

- 期待できる効果: 連絡先**詳細画面に区分が表示**される・検索で「店舗」等の区分名がヒットする見込み（company が検索対象かは実機確認対象）。
- 期待できない効果: 一覧の畳み表示・セクションヘッダ（schema 上のフィールドが無く、Groundwire UI にもグループ表示機能が無い）。

**代替案の所見**（畳み表示がどうしても必要になった場合）:
1. **displayName 区分プレフィックス**（例「【店舗】博多大和」）: ふりがな順ソートのため**プレフィックスでは並びがまとまらない**
   （並びは fnamePhonetic 基準）。まとめるにはふりがな側にも接頭辞が必要になり、着信画面・履歴の表示名も汚れる。**非推奨**。
2. **区分ごとに電話帳（books）を分けて購読制御**: 既存機構で「見える範囲」は制御できるが、一覧内の畳みではない。
3. 現実解は **company 搭載（実施済み）＋検索運用**。
