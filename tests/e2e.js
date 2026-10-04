const B='http://localhost:3999'; let ck='';
const f=async(p,o={})=>{const r=await fetch(B+p,{...o,headers:{'content-type':'application/json',cookie:ck,...(o.headers||{})},redirect:'manual'});const sc=r.headers.get('set-cookie');if(sc&&sc.startsWith('jp_session'))ck=sc.split(';')[0];const t=await r.text();try{return {s:r.status,j:JSON.parse(t),h:r.headers}}catch{return {s:r.status,t,h:r.headers}}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const ms=()=>fetch('http://localhost:4000/__state').then(r=>r.json());
(async()=>{
 let r=await f('/api/signup',{method:'POST',body:JSON.stringify({country:'GB',email:'e@x.com',password:'password1'})}); console.log('signup',r.s,r.j);
 r=await f('/api/bots',{method:'POST',body:JSON.stringify({token:'7712045533:AAHk3vZq_testtokenxxxxxxxxxxxxxxxxx'})}); console.log('bot',r.s,r.j);
 const st=await ms(); const secret=st.webhook.secret_token, hook=new URL(st.webhook.url).pathname; console.log('webhook',hook,st.webhook.allowed_updates);
 const H={'x-telegram-bot-api-secret-token':secret};
 r=await f(hook,{method:'POST',headers:H,body:JSON.stringify({update_id:1,my_chat_member:{chat:{id:-1001,title:'VIP Room',type:'channel'},from:{id:9},date:1,old_chat_member:{status:'left',user:{id:7712045533}},new_chat_member:{status:'administrator',can_invite_users:true,user:{id:7712045533}}}})}); console.log('my_chat_member',r.s);
 r=await f(hook,{method:'POST',headers:{'x-telegram-bot-api-secret-token':'bad'},body:'{}'}); console.log('bad secret ->',r.s);
 await sleep(1200);
 r=await f('/api/channels'); const ch=r.j.channels[0]; console.log('channel',ch.title,ch.status,'pool',ch.pool,'fallback',ch.has_fallback);
 r=await f('/api/channels/'+ch.id,{method:'PATCH',body:JSON.stringify({pixel_id:'884210395527140',capi_token:'EAAtest',event_name:'Lead'})}); console.log('pixel',r.s);
 r=await f('/api/channels/'+ch.id+'/test',{method:'POST'}); console.log('test event',r.s,r.j);
 r=await f('/api/channels/'+ch.id,{method:'PATCH',body:JSON.stringify({platform:'tiktok',tt_pixel:'CQ7B9E3C77U5JHG0',tt_token:'tttok',tt_event:'Subscribe'})}); console.log('tiktok save',r.s,r.j);
 r=await f('/api/channels/'+ch.id+'/test?platform=tiktok',{method:'POST'}); console.log('tiktok test',r.s,r.j);
 r=await f('/api/referrals'); console.log('referrals',r.j.link,r.j.invited);
 const rr=await fetch(B+new URL(r.j.link).pathname,{redirect:'manual'}); const refck=rr.headers.get('set-cookie').split(';')[0]; console.log('ref redirect',rr.status,refck);
 const su=await fetch(B+'/api/signup',{method:'POST',headers:{'content-type':'application/json',cookie:refck},body:JSON.stringify({country:'GB',email:'friend@x.com',password:'password1'})}); console.log('friend signup',su.status);
 const slug=new URL(ch.tracking_url).pathname;
 r=await f(slug); console.log('click page',r.s,(r.t||'').includes('fbq'));
 const go=await fetch(B+slug+'/go',{method:'POST',headers:{'content-type':'application/json','user-agent':'Mozilla/5.0 (iPhone) FBAN','x-forwarded-for':'102.89.1.2','cf-ipcountry':'NG'},body:JSON.stringify({fbp:'fb.1.1700000000000.12345',url:'https://x.com'+slug+'?fbclid=IwAR123&ttclid=TT999&utm_campaign=Test1&utm_content=AdA'})});
 const gj=await go.json(); const cookie=go.headers.get('set-cookie'); console.log('go ->',gj.url, !!cookie);
 const again=await fetch(B+slug+'/go',{method:'POST',headers:{'content-type':'application/json',cookie:cookie.split(';')[0]},body:'{}'}).then(r=>r.json()); console.log('reload same link?',again.url===gj.url);
 // join with that link
 r=await f(hook,{method:'POST',headers:H,body:JSON.stringify({update_id:2,chat_member:{chat:{id:-1001,title:'VIP Room',type:'channel'},from:{id:555},date:Math.floor(Date.now()/1000),old_chat_member:{status:'left',user:{id:555}},new_chat_member:{status:'member',user:{id:555,first_name:'Noah',last_name:'A',username:'tunde',language_code:'en'}},invite_link:{invite_link:gj.url,creator:{id:7712045533},member_limit:1}}})}); console.log('join',r.s);
 // organic join + leave
 await f(hook,{method:'POST',headers:H,body:JSON.stringify({update_id:3,chat_member:{chat:{id:-1001,type:'channel'},from:{id:556},date:Math.floor(Date.now()/1000),old_chat_member:{status:'left',user:{id:556}},new_chat_member:{status:'member',user:{id:556,first_name:'Ada'}}}})});
 await f(hook,{method:'POST',headers:H,body:JSON.stringify({update_id:4,chat_member:{chat:{id:-1001,type:'channel'},from:{id:556},date:Math.floor(Date.now()/1000),old_chat_member:{status:'member',user:{id:556}},new_chat_member:{status:'left',user:{id:556,first_name:'Ada'}}}})});
 await sleep(2600);
 const s2=await ms(); console.log('tiktok events',(s2.tt||[]).length,JSON.stringify((s2.tt||[]).slice(-1)[0]),'hdr',s2.ttHdr); console.log('meta events',s2.events.length, JSON.stringify(s2.events[s2.events.length-1]).slice(0,400));
 const tz=new Date().getTimezoneOffset(); const d=new Date().toISOString().slice(0,10);
 r=await f(`/api/stats?from=${d}&to=${d}&tz=0`); console.log('stats',JSON.stringify(r.j.totals),JSON.stringify(r.j.counts),r.j.series);
 r=await f(`/api/joins?from=${d}&to=${d}&tz=0`); console.log('joins',r.j.total, r.j.rows.map(x=>[x.first_name,x.click_id?'ad':'org',x.capi_status,x.tt_status,x.country,x.params.utm_campaign,x.left_at?'left':'']));
 r=await f(`/api/joins.csv?from=${d}&to=${d}&tz=0`); console.log(r.t);
 r=await f('/'); console.log('home',r.s,(r.t||'').length); r=await f('/demo'); console.log('demo',r.s,(r.t||'').includes('JP_DEMO'));
})();

setTimeout(async()=>{ const r=await f('/api/referrals'); console.log('after friend: invited',r.j.invited,'active',r.j.active); },6000);
