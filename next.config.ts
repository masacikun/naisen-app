import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  basePath: '/n',
  // kuroshiro/kuromoji は fs で辞書を読むためバンドルしない（/api/furigana）
  serverExternalPackages: ['kuroshiro', 'kuroshiro-analyzer-kuromoji', 'kuromoji'],
}
export default nextConfig
