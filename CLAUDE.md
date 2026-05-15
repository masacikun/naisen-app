@AGENTS.md

# naisen-app 開発ガイド

## システム概要

smile-mgmt の電話履歴管理アプリ。Next.js 16 App Router + Supabase。  
VPS: `/var/www/naisen-app` (PM2: `naisen-app`, port 3002, basePath: `/n`)

## 作業完了後に必ず実行すること

1. **README.md を更新する** — 変更内容に合わせてこのリポジトリの README.md を修正する
2. **VPS の SYSTEM.md を更新する** — `ssh smileadmin@smile-mgmt.xvps.jp` で `/var/www/smile-mgmt/SYSTEM.md` を編集し、変更内容を更新履歴に追記する
3. **GitHub に push する** — main ブランチに push して GitHub Actions で VPS へデプロイする

## 作業ルール
- 作業完了後は必ず git add . && git commit && git push を実行すること
- コミットメッセージは変更内容を日本語で簡潔に書くこと

## 技術スタック

- Next.js 16.2.6 (App Router, basePath: `/n`)
- React 19.2.4, TypeScript 5, Tailwind CSS v4, Geist フォント
- @supabase/supabase-js ^2.105.4, iconv-lite ^0.7.2, recharts ^3.8.1

## ページルーティング

| URL | 概要 |
|-----|------|
| `/n` | ダッシュボード (当日統計・着信サマリー) |
| `/n/calls` | 通話履歴 |
| `/n/missed` | 不在着信 |
| `/n/stats` | 分析 (時間帯・内線別) |
| `/n/report` | 月次レポート |
| `/n/upload` | CDRファイルアップロード |

## デプロイ

```bash
git push origin main  # GitHub Actions が自動ビルド・pm2 restart
```

VPS 手動:
```bash
ssh smileadmin@smile-mgmt.xvps.jp
cd /var/www/naisen-app && npm ci && npm run build && pm2 restart naisen-app
```

## 作業ディレクトリ
- 作業開始時に必ずpwdで現在のパスを確認すること
- Googleドライブの共有ドライブ内のsmile-mgmtフォルダで作業すること
- MacによってユーザーIDが異なる場合があるが、pwdで自動判断すること
