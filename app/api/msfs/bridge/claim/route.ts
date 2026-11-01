import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
const fail=(message:string,status:number)=>NextResponse.json({error:message},{status,headers});
export async function POST(req:NextRequest){
 try{
  const raw=await req.text();
  if(raw.length>1024)return fail('Request too large',413);
  const body=JSON.parse(raw) as {code?:unknown;device_name?:unknown};
  if(typeof body.code!=='string'||!/^[a-f0-9]{32}$/.test(body.code)||
     typeof body.device_name!=='string'||!body.device_name.trim()||body.device_name.length>64)
   return fail('Invalid pairing request',400);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)return fail('Bridge unavailable',503);
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.rpc('aervelys_msfs_bridge_pair_claim',
   {p_code:body.code,p_device_name:body.device_name.trim()});
  if(error)return fail('Pairing code expired or invalid',403);
  return NextResponse.json(data,{headers});
 }catch{return fail('Invalid pairing request',400);}
}
