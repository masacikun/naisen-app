'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'

const APP_LINKS = [
  { href: '/',       label: 'ダッシュボード' },
  { href: '/calls',  label: '通話履歴' },
  { href: '/missed', label: '不在着信' },
  { href: '/stats',  label: '分析' },
  { href: '/report', label: 'レポート' },
  { href: '/upload', label: 'アップロード' },
]

const PORTAL_LINKS = [
  { href: 'https://smile-mgmt.xvps.jp/dashboard', label: '予実管理' },
  { href: 'https://smile-mgmt.xvps.jp/n',         label: '電話履歴' },
  { href: 'https://smile-mgmt.xvps.jp/u',         label: 'ユビレジ' },
  { href: 'https://smile-mgmt.xvps.jp/m',         label: 'MF会計' },
]

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="w-9 h-9" />
  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded text-gray-300 dark:text-gray-400 hover:text-white hover:bg-slate-700 transition-colors text-sm"
      title={theme === 'dark' ? 'ライトモード' : 'ダークモード'}
    >
      {theme === 'dark' ? '☀' : '☽'}
    </button>
  )
}

export default function NavBar() {
  const pathname = usePathname()
  const [navigating, setNavigating] = useState(false)
  useEffect(() => { setNavigating(false) }, [pathname])

  return (
    <header className="relative bg-slate-900 text-white shadow-lg">
      {navigating && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-400 animate-pulse z-50" />
      )}
      <div className="w-full px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-2 shrink-0">
          <a href="https://smile-mgmt.xvps.jp/" className="font-bold text-sm text-sky-300 hover:text-sky-200 transition-colors">
            🏢 Smile 管理
          </a>
          <span className="text-gray-600 dark:text-gray-300 text-xs">›</span>
          <Link href="/" className="font-bold text-base text-white hover:text-slate-200 transition-colors">
            電話履歴
          </Link>
        </div>
        <nav className="flex items-center gap-0.5">
          {APP_LINKS.map(link => (
            <Link key={link.href} href={link.href}
              onClick={() => pathname !== link.href && setNavigating(true)}
              className={`px-2.5 py-2 rounded text-sm font-semibold whitespace-nowrap transition-colors ${
                pathname === link.href ? 'bg-indigo-600 text-white' : 'text-slate-200 hover:bg-slate-700 hover:text-white'
              }`}>
              {link.label}
            </Link>
          ))}
          <div className="ml-2 flex items-center gap-1 border-l border-slate-600 pl-2 shrink-0">
            {PORTAL_LINKS.map(({ href, label }) => (
              <a key={href} href={href}
                className="px-2.5 py-1.5 rounded text-xs font-semibold text-sky-300 border border-sky-700 hover:bg-sky-700 hover:text-white transition-colors whitespace-nowrap">
                {label}
              </a>
            ))}
            <ThemeToggle />
          </div>
        </nav>
      </div>
    </header>
  )
}
