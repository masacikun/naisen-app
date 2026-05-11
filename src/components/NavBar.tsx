'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
const BUDGET_APP_URL  = process.env.NEXT_PUBLIC_BUDGET_APP_URL  || 'http://localhost:3000'
const UBIREGI_APP_URL = process.env.NEXT_PUBLIC_UBIREGI_APP_URL || 'http://localhost:3001'
const links = [
  { href: '/',      label: 'ダッシュボード' },
  { href: '/calls', label: '通話履歴' },
  { href: '/stats', label: '分析' },
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
          <a href={UBIREGI_APP_URL} className="ml-2 px-3 py-2 rounded text-sm font-semibold text-green-300 hover:bg-slate-700 transition-colors">ユビレジ</a>
          <a href={BUDGET_APP_URL}  className="ml-1 px-3 py-2 rounded text-sm font-semibold text-amber-300 border border-amber-500 hover:bg-amber-500 hover:text-white transition-colors">← 予算実績</a>
        </nav>
      </div>
    </header>
  )
}
