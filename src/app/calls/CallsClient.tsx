'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
type Call={id:number;started_at:string;duration_sec:number;caller:string;caller_name:string;line_name:string;status:string;ivr_route:string}
const STATUS_STYLE:Record<string,string>={'ANSWERED':'bg-green-100 text-green-700','NO ANSWER':'bg-red-100 text-red-600','BUSY':'bg-yellow-100 text-yellow-700','FAILED':'bg-slate-100 text-slate-500'}
function fmtDate(s:string){const d=new Date(s);return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function fmtSec(s:number){if(!s)return '-';const m=Math.floor(s/60);return `${m}分${s%60}秒`}
export default function CallsClient({calls,total,page,lines,filters}:{calls:Call[];total:number;page:number;lines:string[];filters:{line?:string;status?:string;q?:string}}) {
  const router=useRouter(), pathname=usePathname()
  const [q,setQ]=useState(filters.q||'')
  function nav(params:Record<string,string>){const sp=new URLSearchParams({...filters,...params} as Record<string,string>);router.push(`${pathname}?${sp.toString()}`)}
  const totalPages=Math.ceil(total/50)
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">通話履歴</h1>
        <span className="text-sm text-slate-500">全 {total.toLocaleString()} 件</span>
      </div>
      <div className="bg-white rounded-xl shadow p-3 flex flex-wrap gap-2">
        <input type="text" placeholder="電話番号で検索..." value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&nav({q,page:'1'})} className="border rounded px-3 py-1.5 text-sm flex-1 min-w-40"/>
        <select value={filters.line||''} onChange={e=>nav({line:e.target.value,page:'1'})} className="border rounded px-3 py-1.5 text-sm">
          <option value="">全回線</option>{lines.map(l=><option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filters.status||''} onChange={e=>nav({status:e.target.value,page:'1'})} className="border rounded px-3 py-1.5 text-sm">
          <option value="">全ステータス</option><option value="ANSWERED">応答</option><option value="NO ANSWER">不在</option><option value="BUSY">話中</option>
        </select>
        <button onClick={()=>router.push(pathname)} className="border rounded px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50">リセット</button>
      </div>
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-slate-500 border-b bg-slate-50">
            <th className="text-left px-4 py-2">日時</th><th className="text-left px-4 py-2">発信元</th><th className="text-left px-4 py-2">回線</th><th className="text-left px-4 py-2">IVR</th><th className="text-center px-4 py-2">通話時間</th><th className="text-center px-4 py-2">ステータス</th>
          </tr></thead>
          <tbody>{calls.map(c=>(
            <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
              <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{fmtDate(c.started_at)}</td>
              <td className="px-4 py-2 font-mono text-xs">{c.caller_name&&<div className="text-slate-700 font-sans font-medium">{c.caller_name}</div>}{c.caller}</td>
              <td className="px-4 py-2 font-medium text-slate-700">{c.line_name||'-'}</td>
              <td className="px-4 py-2 text-xs text-slate-500 max-w-48 truncate">{c.ivr_route||'-'}</td>
              <td className="px-4 py-2 text-center text-slate-600">{fmtSec(c.duration_sec)}</td>
              <td className="px-4 py-2 text-center"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLE[c.status]||''}`}>{c.status==='ANSWERED'?'応答':c.status==='NO ANSWER'?'不在':c.status==='BUSY'?'話中':c.status}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {totalPages>1&&<div className="flex justify-center gap-2">
        <button disabled={page<=1} onClick={()=>nav({page:String(page-1)})} className="px-3 py-1.5 rounded border text-sm disabled:opacity-40">◀</button>
        <span className="px-3 py-1.5 text-sm text-slate-600">{page} / {totalPages}</span>
        <button disabled={page>=totalPages} onClick={()=>nav({page:String(page+1)})} className="px-3 py-1.5 rounded border text-sm disabled:opacity-40">▶</button>
      </div>}
    </div>
  )
}
