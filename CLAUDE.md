# naisen-app 開発ガイド

## システム概要
smile-mgmt の電話履歴管理アプリ。Next.js 16 App Router + PostgREST。
VPS: `/var/www/naisen-app` (PM2: `naisen-app`, port 3002, basePath: `/n`)

## 参照ドキュメント
- システム全体の構成・DB: /var/www/smile-mgmt/SYSTEM.md

## 作業完了後に必ず実行すること
1. /var/www/smile-mgmt/SYSTEM.md の更新履歴に追記
2. `git push origin main` → GitHub Actions が自動デプロイ
3. `cd /var/www/smile-mgmt && git add -A && git commit -m "..." && git push origin main`

## 技術スタック
- Next.js 16 (App Router, basePath: `/n`)
- TypeScript 5, Tailwind CSS v4
- @supabase/supabase-js, iconv-lite, recharts

## DBテーブル
- naisen_calls: 電話履歴
- caller_memo: 発信者メモ

## ページルーティング
| URL | 概要 |
|-----|------|
| `/n` | ダッシュボード（当日統計・着信サマリー） |
| `/n/calls` | 通話履歴 |
| `/n/missed` | 不在着信 |
| `/n/stats` | 分析（時間帯・内線別） |
| `/n/report` | 月次レポート |
| `/n/upload` | CDRファイルアップロード |

## デプロイ
```bash
git push origin main  # GitHub Actions が自動ビルド・pm2 restart
```
