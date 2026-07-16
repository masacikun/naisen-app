# 電話帳配信システム（端末別配信・区分・ふりがな）

作成: 2026-07-16 / 対象: naisen-app + DP750 / Acrobits Groundwire + FreePBX(telpro)

## 全体像（2階建て）

- **① 着信名の表示**: FreePBX 側で着信番号を逆引きし `CALLERID(name)` を書き換え（端末非依存・別作業 `/lookup`）。表示名プレフィックスは `src/lib/display-name.ts` を共用（着信番号の kind で 内線)／社内)／なし）。
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
