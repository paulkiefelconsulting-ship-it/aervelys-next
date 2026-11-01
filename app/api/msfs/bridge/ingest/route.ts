import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
const fail=(message:string,status:number)=>NextResponse.json({error:message},{status,headers});
export async function POST(req:NextRequest){
 const authorization=req.headers.get('authorization')||'';
 if(!/^Bearer [a-f0-9]{64}$/.test(authorization))return fail('Device authorization required',401);
 let sample:unknown;
 try{
  const raw=await req.text();
  if(raw.length>2500)return fail('Telemetry too large',413);
  sample=JSON.parse(raw);
  if(!sample||typeof sample!=='object'||Array.isArray(sample))return fail('Invalid telemetry',400);
 }catch{return fail('Invalid telemetry',400);}
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)return fail('Bridge unavailable',503);
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.rpc('aervelys_msfs_bridge_ingest',
  {p_token:authorization.slice(7),p_sample:sample});
 if(error){
  if(error.code==='28000')return fail('Device token revoked or invalid',401);
  if(['22023','22P02','22007'].includes(error.code))return fail('Telemetry rejected',400);
  return fail('Bridge storage unavailable',503);
 }
 return NextResponse.json(data,{headers});
}
