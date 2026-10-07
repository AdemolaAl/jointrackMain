// Fake Telegram Bot API + Meta Graph API for testing
const http=require('http'); const state={webhook:null,links:0,events:[]};
http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{
  const j=b?JSON.parse(b):{}; const u=req.url; res.setHeader('content-type','application/json');
  if(u.startsWith('/file/bot')){res.setHeader('content-type','image/png');return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64'));} // round 20: Telegram file download
  let m=/^\/bot(\d+):[^/]+\/(\w+)/.exec(u);
  if(m){const id=+m[1],meth=m[2];
    if(meth==='getFile') return res.end(JSON.stringify({ok:true,result:{file_id:j.file_id,file_size:70,file_path:'photos/file_'+j.file_id+'.png'}}));
    if(meth==='getMe') return res.end(JSON.stringify({ok:true,result:{id,is_bot:true,username:'test_track_bot'}}));
    if(meth==='setWebhook'){state.webhook=j;return res.end(JSON.stringify({ok:true,result:true}));}
    if(meth==='sendMessage'){state.msgs=(state.msgs||[]).concat([j]);return res.end(JSON.stringify({ok:true,result:{}}));}
    if(meth==='getWebhookInfo') return res.end(JSON.stringify({ok:true,result:{url:state.foreign||(state.webhook&&state.webhook.url)||'',pending_update_count:0,has_custom_certificate:false}}));
    if(meth==='getChat') return res.end(JSON.stringify({ok:true,result:{id:-100555,type:'channel',title:'Mock Channel'}}));
    if(meth==='deleteWebhook') return res.end(JSON.stringify({ok:true,result:true}));
    if(meth==='getChatMember'&&state.gcm&&state.gcm[String(j.chat_id)]) return res.end(JSON.stringify(state.gcm[String(j.chat_id)])); // round 17: per-chat answers (else 'unknown' as before)
    if(meth==='createChatInviteLink'&&state.inviteFail&&state.inviteFail[String(j.chat_id)]) return res.end(JSON.stringify(state.inviteFail[String(j.chat_id)])); // round 17: a lost channel
    if(meth==='createChatInviteLink'){state.links++;if(j.creates_join_request){state.reqLinks=(state.reqLinks||0)+1;if(j.member_limit)return res.end(JSON.stringify({ok:false,error_code:400,description:"Bad Request: can't combine member_limit with creates_join_request"}));}
      return res.end(JSON.stringify({ok:true,result:{invite_link:'https://t.me/+L'+state.links+'x'+Math.random().toString(36).slice(2,8),creator:{id},member_limit:j.member_limit,creates_join_request:!!j.creates_join_request,name:j.name}}));}
    if(meth==='editChatInviteLink'){state.edits=(state.edits||[]).concat([j]);if(state.editFail)return res.end(JSON.stringify({ok:false,error_code:429,description:'Too Many Requests: retry after 5',parameters:{retry_after:5}}));return res.end(JSON.stringify({ok:true,result:{invite_link:j.invite_link,name:j.name,member_limit:j.member_limit,creates_join_request:!!j.creates_join_request}}));}
    if(meth==='approveChatJoinRequest'){state.approvals=(state.approvals||[]).concat([j]);return res.end(JSON.stringify({ok:true,result:true}));}
    if(meth==='declineChatJoinRequest'){return res.end(JSON.stringify({ok:true,result:true}));}
    return res.end(JSON.stringify({ok:false,error_code:400,description:'unknown'}));}
  if(u.startsWith('/v3/')){state.snap=(state.snap||[]).concat(j.data);state.snapUrl=u;return res.end(JSON.stringify({status:'VALID',reason:'Events have been processed successfully.'}));}
  if(u.startsWith('/__set')){Object.assign(state,j);return res.end('{}');}
  if(u.startsWith('/__state')) return res.end(JSON.stringify(state));
  if(u.startsWith('/open_api/v1.3/event/track')){state.tt=(state.tt||[]).concat(j.data);state.ttHdr=req.headers['access-token'];return res.end(JSON.stringify({code:0,message:'OK'}));}
  if(/\/events$/.test(u)){state.events.push(...j.data);return res.end(JSON.stringify({events_received:j.data.length,fbtrace_id:'x'}));}
  res.statusCode=404;res.end('{}');});}).listen(4000,()=>console.log('mock up'));
