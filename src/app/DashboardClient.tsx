'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
type Call = { status: string; duration_sec?: number; line_name?: string }
type Monthly = { month: string; line_name: string; call_count: number }
const LINE_COLORS: Record<string,string> = {
  'gates':'#3b82f6','SmileFood':'#10b981','CoSmile':'#f59e0b','SmileEstate':'#8b5cf6',
  'GACHA':'#ef4444','tenjin':'#06b6d4','1_gates':'#84cc16','水炊き・もつ鍋':'#f97316',
  'クリマバイト':'#ec4899','Central':'#6366f1',
}
function kpi(calls: Call[]) {
  const total=calls.length, answered=calls.filter(c=>c.status==='ANSWERED').length
  return { total, answered, missed: calls.filter(c=>c.status==='NO ANSWER').length, rate: total?Math.round(answered/total*100):0 }
}
function diff(cur:number,prv:number) {
  if(!prv) return null
  const d=cur-prv
  return <span className={d>=0?'text-green-500':'text-red-500'}>{d>=0?'▲':'▼'}{Math.abs(d)}</span>
}
export default function DashboardClient({thisMonth,lastMonth,monthly,byLine}:{thisMonth:Call[];lastMonth:Call[];monthly:Monthly[];byLine:Call[]}) {
  const cur=kpi(thisMonth), prv=kpi(lastMonth)
  const monthlyData=monthly.reduce((acc:Record<string,Record<string,number|string>>,r)=>{
    const m=r.month.slice(0,7); if(!acc[m])acc[m]={month:m}; acc[m][r.line_name]=(acc[m][r.line_name]as number||0)+r.call_count; return acc
  },{})
  const chartData=Object.values(monthlyData).slice(-12)
  const topLines=Array.from(new Set(monthly.map(r=>r.line_name))).slice(0,6)
  const lineData=byLine.reduce((acc:Record<string,{total:number;answered:number}>,r)=>{
    if(!r.line_name)return acc; if(!acc[r.line_name])acc[r.line_name]={total:0,answered:0}
    acc[r.line_name].total++; if(r.status==='ANSWERED')acc[r.line_name].answered++; return acc
  },{})
  const lineArr=Object.entries(lineData).map(([name,v])=>({name,...v,rate:Math.round(v.answered/v.total*100)})).sort((a,b)=>b.total-a.total)
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-slate-800">ダッシュボード</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{label:'総着信',value:cur.total,prev:prv.total,unit:'件'},{label:'応答',value:cur.answered,prev:prv.answered,unit:'件'},{label:'不在',value:cur.missed,prev:prv.missed,unit:'件'},{label:'応答率',value:cur.rate,prev:prv.rate,unit:'%'}].map(k=>(
          <div key={k.label} className="bg-white rounded-xl shadow p-4">
            <div className="text-xs text-slate-500 mb-1">{k.label}（今月）</div>
            <div className="text-2xl font-bold text-slate-800">{k.value}<span className="text-sm font-normal ml-1">{k.unit}</span></div>
            <div className="text-xs text-slate-400 mt-1">先月比 {diff(k.value,k.prev)}</div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-sm font-bold text-slate-700 mb-3">月別着信数（回線別）</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <XAxis dataKey="month" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip/>
            {topLines.map(line=><Bar key={line} dataKey={line} stackId="a" fill={LINE_COLORS[line]||'#94a3b8'} name={line}/>)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-sm font-bold text-slate-700 mb-3">回線別サマリー（今月）</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-slate-500 border-b">
            <th className="text-left py-2 pr-4">回線</th><th className="text-right py-2 pr-4">総着信</th><th className="text-right py-2 pr-4">応答</th><th className="text-right py-2 pr-4">不在</th><th className="text-right py-2">応答率</th>
          </tr></thead>
          <tbody>{lineArr.map(l=>(
            <tr key={l.name} className="border-b last:border-0 hover:bg-slate-50">
              <td className="py-2 pr-4 font-medium"><span className="inline-block w-2 h-2 rounded-full mr-2" style={{background:LINE_COLORS[l.name]||'#94a3b8'}}/>{l.name}</td>
              <td className="text-right py-2 pr-4">{l.total}</td>
              <td className="text-right py-2 pr-4 text-green-600">{l.answered}</td>
              <td className="text-right py-2 pr-4 text-red-500">{l.total-l.answered}</td>
              <td className="text-right py-2"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${l.rate>=80?'bg-green-100 text-green-700':l.rate>=50?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>{l.rate}%</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}
