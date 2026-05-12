'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/',        label: 'ダッシュボード' },
  { href: '/calls',   label: '通話履歴' },
  { href: '/missed',  label: '不在着信' },
  { href: '/stats',   label: '分析' },
  { href: '/report',  label: 'レポート' },
  { href: '/upload',  label: 'アップロード' },
]

const externalLinks = [
  { href: 'https://naisen-app-drab.vercel.app/',              label: '電話履歴' },
  { href: 'https://mf-accounting-sync.vercel.app/dashboard',  label: 'MF会計データ' },
]

export default function NavBar() {
  const pathname = usePathname()
  return (
    <header className="bg-slate-900 text-white shadow-lg">
      <div className="w-full px-4 flex items-center justify-between h-14">
        <span className="font-bold text-base tracking-wide">📞 電話履歴管理</span>
        <nav className="flex items-center gap-0.5">
          {links.map(link => (
            <Link key={link.href} href={link.href}
              className={`px-4 py-2 rounded text-sm font-semibold transition-colors ${
                pathname === link.href ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-slate-700'
              }`}>
              {link.label}
            </Link>
          ))}
          <div className="ml-3 flex items-center gap-1 border-l border-slate-600 pl-3">
            {externalLinks.map(link => (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded text-xs font-semibold text-amber-300 border border-amber-600 hover:bg-amber-600 hover:text-white transition-colors">
                {link.label} ↗
              </a>
            ))}
            <span className="px-3 py-1.5 rounded text-xs font-semibold text-slate-500 border border-slate-700 cursor-not-allowed select-none">
              ユビレジ（準備中）
            </span>
          </div>
        </nav>
      </div>
    </header>
  )
}
