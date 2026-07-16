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
