import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  basePath: '/n',
  // kuroshiro/kuromoji は fs で辞書を読むためバンドルしない（/api/furigana）
  serverExternalPackages: ['kuroshiro', 'kuroshiro-analyzer-kuromoji', 'kuromoji'],
  // 2026-07-22 まさし指摘: 電話帳に登録したのに通話履歴側では画面遷移直後は反映されず、
  // リロードすると出てくる不具合。ナビゲーションはNavBarの<Link>（ソフト遷移）経由のため、
  // force-dynamicなページでもクライアント側Router Cacheが古いRSCペイロードを再利用していた。
  // dynamic=0でこのキャッシュを無効化（公式に案内されている対処）。
  experimental: {
    staleTimes: { dynamic: 0, static: 180 },
  },
}
export default nextConfig
