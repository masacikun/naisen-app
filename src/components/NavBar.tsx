'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

const links = [
  { href: '/',       label: 'ダッシュボード' },
  { href: '/calls',  label: '通話履歴' },
  { href: '/missed', label: '不在着信' },
  { href: '/stats',  label: '分析' },
  { href: '/report', label: 'レポート' },
  { href: '/upload', label: 'アップロード' },
]

const externalLinks = [
  { href: '/',            label: '予実管理' },
  { href: '/u',           label: 'ユビレジ' },
  { href: '/m/dashboard', label: 'MF会計' },
  { href: '/a',            label: '分析'    },
]

export default function NavBar() {
  const pathname = usePathname()
  const [navigating, setNavigating] = useState(false)

  useEffect(() => { setNavigating(false) }, [pathname])

  return (
    <header className="relative bg-slate-900 text-white shadow-lg">
      {navigating && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-400 animate-pulse z-50" />
      )}
      <div className="w-full px-4 flex items-center justify-between h-14">
        <Link href="/" className="font-bold text-base tracking-wide text-white hover:text-slate-200 transition-colors">
          電話履歴管理
        </Link>
        <nav className="flex items-center gap-0.5">
          {links.map(link => (
            <Link key={link.href} href={link.href}
              onClick={() => pathname !== link.href && setNavigating(true)}
              className={`px-3 py-2 rounded text-sm font-semibold transition-colors ${
                pathname === link.href ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-slate-700 hover:text-white'
              }`}>
              {link.label}
            </Link>
          ))}
          <div className="ml-2 flex items-center gap-1.5 border-l border-slate-600 pl-3">
            {externalLinks.map(link => (
              <a key={link.href} href={link.href}
                className="px-3 py-1.5 rounded text-xs font-semibold text-sky-300 border border-sky-700 hover:bg-sky-700 hover:text-white transition-colors">
                {link.label}
              </a>
            ))}
          </div>
        </nav>
      </div>
    </header>
  )
}
