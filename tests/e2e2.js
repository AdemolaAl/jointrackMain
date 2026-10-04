const B='http://localhost:3999'; let ck='';
const f=async(p,o={})=>{const r=await fetch(B+p,{...o,headers:{'content-type':'application/json',cookie:ck,...(o.headers||{})},redirect:'manual'});const sc=r.headers.get('set-cookie');if(sc&&sc.startsWith('jp_session'))ck=sc.split(';')[0];const t=await r.text();try{return {s:r.status,j:JSON.parse(t)}}catch{return {s:r.status,t}}};
(async()=>{
 await f('/api/signup',{method:'POST',body:JSON.stringify({country:'GB',email:'boss@x.com',password:'password1'})});
 let r=await f('/api/billing'); console.log('billing',r.s,r.j.balance_cents,r.j.methods);
 r=await f('/api/billing/deposit',{method:'POST',body:JSON.stringify({provider:'crypto',amount:50,tx:'abc'})}); console.log('bad tx',r.s,r.j.error);
 r=await f('/api/billing/deposit',{method:'POST',body:JSON.stringify({provider:'crypto',amount:50,tx:'a'.repeat(64)})}); console.log('crypto',r.s,r.j);
 r=await f('/api/billing/deposit',{method:'POST',body:JSON.stringify({provider:'paystack',amount:50})}); console.log('paystack (no key)',r.s,r.j.error);
 r=await f('/api/referrals'); console.log('referrals',r.j.tier,r.j.rate,r.j.balance_cents,r.j.next_tier);
 r=await f('/api/referrals/withdraw',{method:'POST',body:JSON.stringify({method:'usdt',details:'Txx'})}); console.log('withdraw low',r.s,r.j.error);
 r=await f('/api/billing'); console.log('deposits',JSON.stringify(r.j.deposits));
 const wh=await fetch(B+'/webhooks/paystack',{method:'POST',body:'{}',headers:{'x-paystack-signature':'x'}}); console.log('webhook unsigned',wh.status);
 r=await f('/'); console.log('home',r.s,(r.t||'').includes('Pingzzo'),(r.t||'').includes('Zedapex'));
})();
