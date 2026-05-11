import { supabase } from '@/lib/supabase'
import CallsClient from './CallsClient'
export default async function CallsPage({searchParams}:{searchParams:Promise<{page?:string;line?:string;status?:string;q?:string}>}) {
  const sp=await searchParams
  const page=parseInt(sp.page||'1'), limit=50, offset=(page-1)*limit
  let query=supabase.from('naisen_calls').select('*',{count:'exact'}).order('started_at',{ascending:false}).range(offset,offset+limit-1)
  if(sp.line)   query=query.eq('line_name',sp.line)
  if(sp.status) query=query.eq('status',sp.status)
  if(sp.q)      query=query.ilike('caller',`%${sp.q}%`)
  const {data,count}=await query
  const {data:lines}=await supabase.from('naisen_calls').select('line_name').not('line_name','is',null)
  const lineSet=Array.from(new Set((lines||[]).map((l:any)=>l.line_name))).sort() as string[]
  return <CallsClient calls={data||[]} total={count||0} page={page} lines={lineSet} filters={sp}/>
}
