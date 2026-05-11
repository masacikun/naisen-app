'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
type Hourly={hour:number;line_name:string;call_count:number;answered:number}
type Monthly={month:string;line_name:string;call_count:number;total_sec:number;status:string}
const LINE_COLORS: Record<string,string>={'gates':'#3b82f6','SmileFood':'#10b981','CoSmile':'#f59e0b','SmileEstate':'#8b5cf6','GACHA':'#ef4444','tenjin':'#06b6d4','1_gates':'#84cc16','水炊き・もつ鍋':'#f97316','クリマバイト':'#ec4899','Central':'#6366f1'}
export default function StatsClient({hourly,monthly}:{hourly:Hourly[];monthly:Monthly[]}) {
  const hourlyTotal=Array.from({length:24},(_,h)=>{const rows=hourly.filter(r=>r.hour===h);return{hour:`${h}時`,total:rows.reduce((s,r)=>s+r.call_count,0),answered:rows.reduce((s,r)=>s+r.answered,0)}})
  const answeredMonthly=monthly.filter(r=>r.status==='ANSWERED')
  const months=Array.from(new Set(answeredMonthly.map(r=>r.month.slice(0,7)))).sort()
  const lines=Array.from(new Set(answeredMonthly.map(r=>r.line_name)))
  const trendData=months.slice(-12).map(m=>{const row:Record<string,string|number>={month:m};lines.forEach(l=>{const f=answeredMonthly.find(r=>r.month.slice(0,7)===m&&r.line_name===l);row[l]=f?.call_count||0});return row})
  const rateMap:Record<string,{total:number;answered:number}>={}
  monthly.forEach(r=>{if(!rateMap[r.line_name])rateMap[r.line_name]={total:0,answered:0};rateMap[r.line_name].total+=r.call_count;if(r.status==='ANSWERED')rateMap[r.line_name].answered+=r.call_count})
  const rateData=Object.entries(rateMap).map(([name,v])=>({name,rate:Math.round(v.answered/v.total*100),total:v.total})).sort((a,b)=>b.total-a.total).slice(0,10)
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-slate-800">分析</h1>
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-sm font-bold text-slate-700 mb-3">時間帯別着信数（全期間）</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={hourlyTotal}>
            <XAxis dataKey="hour" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip/>
            <Bar dataKey="answered" fill="#3b82f6" name="応答"/>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-sm font-bold text-slate-700 mb-3">月別応答数推移（直近12ヶ月・回線別）</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trendData}>
            <XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip/><Legend/>
            {lines.map(l=><Line key={l} type="monotone" dataKey={l} stroke={LINE_COLORS[l]||'#94a3b8'} dot={false} strokeWidth={2}/>)}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-sm font-bold text-slate-700 mb-3">回線別応答率（全期間）</h2>
        <div className="space-y-2">
          {rateData.map(r=>(
            <div key={r.name} className="flex items-center gap-3">
              <div className="w-28 text-sm text-right text-slate-600">{r.name}</div>
              <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                <div className={`h-full rounded-full flex items-center justify-end pr-2 text-xs font-semibold text-white ${r.rate>=80?'bg-green-500':r.rate>=50?'bg-yellow-400':'bg-red-400'}`} style={{width:`${r.rate}%`}}>{r.rate}%</div>
              </div>
              <div className="text-xs text-slate-400 w-16">{r.total.toLocaleString()}件</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
