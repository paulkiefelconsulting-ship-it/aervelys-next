import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {decodeLatestSimbrief} from '../../../lib/simbrief';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function err(message:string,status:number){
 return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
}
export async function GET(request:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)return err('AERVELYS Auth-Daten fehlen.',503);
 const authorization=request.headers.get('authorization')||'';
 const token=/^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(authorization)?.[1];
 if(!token)return err('Anmeldung erforderlich.',401);
 const username=request.nextUrl.searchParams.get('username')?.trim()||'';
 const pilotId=request.nextUrl.searchParams.get('userid')?.trim()||'';
 if((username&&pilotId)||(!username&&!pilotId)||
  (username&&!/^[a-zA-Z0-9_.-]{2,64}$/.test(username))||
  (pilotId&&!/^[0-9]{1,7}$/.test(pilotId))){
  return err('SimBrief-Benutzername oder Pilot-ID ungültig.',400);
 }
 const supabase=createClient(url,key,{
  auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{Authorization:'Bearer '+token}}
 });
 const user=await supabase.auth.getUser(token);
 if(user.error||!user.data.user)return err('Anmeldung nicht bestätigt.',401);
 const roleCheck=await supabase.rpc('aervelys_simbrief_ofp_overview');
 if(roleCheck.error||roleCheck.data?.simulation_only!==true)
  return err('CEO-/OPS-Zugriff erforderlich.',403);
 const upstream=new URL('https://www.simbrief.com/api/xml.fetcher.php');
 upstream.searchParams.set(username?'username':'userid',username||pilotId);
 upstream.searchParams.set('json','v2');
 upstream.searchParams.set('client','aervelys-next-1.0');
 try{
  const response=await fetch(upstream.toString(),{
   cache:'no-store',redirect:'error',signal:AbortSignal.timeout(9000),
   headers:{Accept:'application/json'}
  });
  if(!response.ok)return err('SimBrief hat keinen abrufbaren aktuellen Flugplan geliefert.',502);
  if(Number(response.headers.get('content-length')||0)>2_000_000)
   return err('SimBrief-OFP übersteigt die erlaubte Größe.',413);
  const body=await response.text();
  if(body.length>2_000_000)return err('SimBrief-OFP übersteigt die erlaubte Größe.',413);
  let decoded:unknown;
  try{decoded=JSON.parse(body);}catch{return err('SimBrief lieferte kein gültiges JSON v2.',502);}
  const ofp=decodeLatestSimbrief(decoded,new Date().toISOString());
  return NextResponse.json(ofp,{headers:{'Cache-Control':'no-store, private',
   'X-Content-Type-Options':'nosniff'}});
 }catch(e){
  // Never include flight plan, access token or upstream URL in errors.
  return err(e instanceof Error&&e.message.startsWith('Der letzte SimBrief')?
   e.message:'SimBrief-Daten konnten nicht sicher gelesen werden.',502);
 }
}
