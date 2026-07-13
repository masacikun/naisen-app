# naisen-app

番頭さん（総合管理システム）の電話履歴管理アプリ。Next.js 16 App Router + PostgREST。

## 電話帳（Phase 1 / Slice 1・2026-07-13）

naisen-app をマスタとする電話帳。閲覧は全認証ユーザー・追加/編集/削除は admin のみ（fail-closed）。

- テーブル: `phonebook_entries`（連絡先: name/name_kana/group_name/memo/partner_id→partners.partner_no）＋ `phonebook_numbers`（番号複数: phone_raw 原表記＋phone_normalized 突合キー・INDEXあり・UNIQUEなし=Slice 2で決定）。DDL: `supabase/phonebook.sql`
- ページ: `/n/phonebook`（一覧・検索・admin は追加/編集/削除。複数番号・種別ラベル対応）
- API: `GET/POST /n/api/phonebook`・`PUT/DELETE /n/api/phonebook/[id]`。編集系は nginx が転送する `X-Auth-Role: admin` 必須（欠落は 403）
- 着信相手名の突合: 通話履歴/不在着信/CSV出力で `caller` を正規化し **電話帳（主）→ 取引先 partners.phone → 従業員 employees.phone_landline（フォールバック）** の順に完全一致で表示名を解決（出所ラベル付き）。実装 `src/lib/phonebook.ts`（DB）＋ `src/lib/phonebook-match.ts`（純ロジック・テスト対象）
- 通話履歴の ✏️（admin のみ表示）は電話帳への登録/更新に変更。旧 `caller_memo` テーブルは未使用化（温存・DROPしない）
- nginx: `location /n` に `X-Auth-User/Email/Role` 転送を追加（master-app ブロックと同形）

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
