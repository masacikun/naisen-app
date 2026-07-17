# naisen 電話帳同期フィード 契約 v1（FreePBX puller 向け）

naisen-app（番頭さん）が公開する **pull 型フィード**。FreePBX 側が定期取得し、
Contact Manager（contacts）／Blacklist（blacklist）へ反映する。
**方向は naisen → FreePBX の一方向**。フィードは着信ごとの問い合わせを行わない（naisen 停止時も着信に影響させない）。
例外は lookup（CID逆引き・2026-07-18 追加）のみ: 着信ごとに 1 GET するが、失敗時は空文字/タイムアウトで
名前なしのまま着信を通す fail-open 設計（着信は止めない）。

## エンドポイント

| フィード | URL | 反映先（FreePBX側の担当） |
|---------|-----|--------------------------|
| contacts | `GET https://banto.hakata-yamato.co.jp/n/api/sync/contacts` | Contact Manager（blocked=false のみ配信） |
| blacklist | `GET https://banto.hakata-yamato.co.jp/n/api/sync/blacklist` | Blacklist（番号単位・正規化済み数字列） |
| lookup | `GET https://banto.hakata-yamato.co.jp/n/api/sync/lookup?number=<着信CID>` | CID Lookup Source（着信時の CALLERID(name)） |

## 認証・接続元制限（3層）

1. **HTTPS 必須**（HTTP は 301）
2. **接続元 IP 制限**: `162.43.89.64`（TelPro FreePBX）のみ許可。他は nginx が 403
3. **Bearer トークン**: `Authorization: Bearer <token>`。無し/不一致は 401
   - **lookup のみ Basic も可**（`user:pass@` URL 埋め込み。FreePBX cidlookup モジュールが
     カスタムヘッダーを渡せないため。password 部をトークンとして照合・username は不問）

- トークンは smile-mgmt VPS `/var/www/naisen-app/.env.local` の `SYNC_FEED_TOKENS`（カンマ区切りで複数可＝ローテーション併記用）。
- **トークン値をチャット・ログ・コミットに書かない**。FreePBX 側は root 限定の設定ファイルに保管すること。

## レスポンス形式（JSON・バージョン付き）

`version` が変わらない限り後方互換（フィールド追加はあり得るが、削除・改名はしない）。

### contacts

```json
{
  "version": 1,
  "generated_at": "2026-07-14T12:00:00.000Z",
  "count": 679,
  "items": [
    {
      "id": 123,
      "name": "○○商店",
      "name_kana": null,
      "group_name": "仕入先",
      "numbers": [
        { "normalized": "0921234567", "raw": "092-123-4567", "label": "代表" }
      ]
    }
  ]
}
```

- `id`: naisen 側の連絡先ID（安定キー。再取得時の対応付けに使える）
- `numbers[].normalized`: 数字のみ（全角/ハイフン等を除去済み・先頭0保持）。**CID照合はこちらを使う**
- `numbers[].normalized` が `null` の要素（内線番号等）は raw のみ有効。**不要なら puller 側で捨ててよい**
- 番号0件の連絡先も含まれる

### blacklist

```json
{
  "version": 1,
  "generated_at": "2026-07-14T12:00:00.000Z",
  "count": 300,
  "items": [
    { "number": "0801234567", "label": "迷惑営業（メモ内容）" }
  ]
}
```

- 1要素 = 1番号（連絡先単位ではない）。`number` は正規化済み数字列・重複除去済み
- `label` = 連絡先名（メモがあれば「名前（メモ）」）。Blacklist の説明欄向け

### lookup（CID逆引き・2026-07-18 追加）

- リクエスト: `?number=<着信CID>`。国内表記（`090…`）・`+81`・素の `81`（+なし国際表記）いずれも可。
  内線（3〜4桁）・anonymous 等は突合せず空を返す
- レスポンス: **`text/plain; charset=utf-8` で表示名 1 件のみ**（改行・引用符なし）。
  未登録・blocked・エラー時は**空文字 200**（FreePBX 側はそのまま CALLERID(name) に入る想定）
- `?format=json` で `{"name":"…"}`（デバッグ用）
- 名前解決は naisen 履歴画面と同一（電話帳 → 名刺 → 取引先 → 従業員 の優先順位）。
  電話帳ヒットはヒット番号の kind により「内線)◯◯」「社内)◯◯」プレフィックス付き
- **FreePBX 側の義務**: タイムアウトを短くし（cidlookup モジュール既定 7 秒）、失敗時は名前なしで着信を継続すること

## 取得方式（推奨）

- **全量取得 → 洗い替え**。数分〜1時間間隔の cron pull を推奨
- 200 以外（401/403/5xx）・タイムアウト時は**反映せず前回取得分を使い続ける**（着信を止めない）
- 反映前に `count` と `items` の長さの一致を検証する
- `Cache-Control: no-store`（キャッシュ不可）。GET 以外は 405

## 変更管理

- 契約変更（フィールド削除・意味変更）時は `version` を上げ、naisen 側 `docs/freepbx-sync.md` を正として双方チャットで合意してから実施
