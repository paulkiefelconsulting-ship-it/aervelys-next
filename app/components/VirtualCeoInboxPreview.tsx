'use client';
import {useEffect,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {Inbox,Users} from 'lucide-react';
type Message={id:number;sender:string;subject:string;status:string;created_at:string};
export default function VirtualCeoInboxPreview({onOpen}:{onOpen:()=>void}){
 const [messages,setMessages]=useState<Message[]>([]);
 useEffect(()=>{
  const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!u||!k)return;
  let mounted=true;
  void createBrowserClient(u,k).rpc('aervelys_virtual_agents_overview').then(({data,error})=>{
   if(!mounted||error||!Array.isArray(data?.ceo_messages))return;
   setMessages((data.ceo_messages as Message[]).filter(m=>m.status==='unread').slice(0,4));
  });
  return()=>{mounted=false;};
 },[]);
 return <section className="panel virtual-ceo-preview">
  <div className="panelhead virtual-ceo-preview-head"><div><div className="eyebrow">INTERNAL STAFF MESSAGES</div>
   <h2><Users size={19}/> Virtuelles Mitarbeiterpostfach</h2><p className="lead">Mitarbeiter können eigenständig Schulungs- und Type-Rating-Wünsche melden.</p></div>
   <button type="button" className="ops-refresh" onClick={onOpen}><Inbox size={14}/> Zum Mitarbeiterpostfach</button></div>
  {messages.length===0?<p className="virtual-ceo-preview-empty">Keine ungelesenen virtuellen Mitarbeiteranfragen.</p>:
   <div className="virtual-ceo-preview-messages">{messages.map(m=><button key={m.id} type="button" onClick={onOpen}>
    <strong>{m.sender}</strong><span>{m.subject}</span></button>)}</div>}
 </section>;
}
