// Karvon — Ipak yoʻli poygasi. Node 18+, tashqi kutubxonalar kerak emas.
// Ishga tushirish:  ADMIN_PASSWORD="parolingiz" node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,FILE=process.env.DATA_FILE||path.join(__dirname,'data.json');
// Parol: Render'da ADMIN_PASSWORD muhit oʻzgaruvchisi berilsa, oʻsha ishlaydi; berilmasa — admin01
const PASS=process.env.ADMIN_PASSWORD||'admin01';
let D={sets:[],tokens:[]};
try{Object.assign(D,JSON.parse(fs.readFileSync(FILE,'utf8')))}catch(e){}
const save=()=>fs.writeFile(FILE,JSON.stringify(D),()=>{});
const M={};let fails=[];
const sh=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
const eq=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const adm=t=>!!t&&D.tokens.includes(t);
const str=(v,n)=>String(v==null?'':v).trim().slice(0,n);
function cleanSets(a){
  if(!Array.isArray(a))throw 'Notoʻgʻri maʼlumot';
  return a.slice(0,100).map(s=>({id:str(s.id,40)||crypto.randomBytes(4).toString('hex'),name:str(s.name,100)||'Nomsiz mavzu',
    qs:(Array.isArray(s.qs)?s.qs:[]).slice(0,500).filter(q=>q&&Array.isArray(q.o)&&q.o.length===4&&q.a>=0&&q.a<4)
      .map(q=>({q:str(q.q,300),o:q.o.map(x=>str(x,200)),a:q.a|0})).filter(q=>q.q&&q.o.every(Boolean))}));
}
const board=m=>Object.entries(m.p).filter(([,p])=>p.n).map(([id,p])=>({id,n:p.n,s:p.s,g:p.g})).sort((a,b)=>b.s-a.s);
function view(m,pid,isA){
  const b=board(m),v={code:m.code,name:m.name,state:m.state,qi:m.qi,total:m.qs.length,lim:m.lim,count:b.length,
    top:b.slice(0,5).map(({n,s,g})=>({n,s,g}))};
  if(m.state==='question'){const q=m.qs[m.qi];v.q=q.q;v.o=q.o;v.left=Math.max(0,m.end-Date.now());v.ans=b.filter(x=>m.p[x.id].a[m.qi]).length}
  if(m.state==='reveal'){const q=m.qs[m.qi];v.q=q.q;v.o=q.o;v.c=q.a}
  if(isA)v.names=b.map(x=>x.n);
  const p=m.p[pid];
  if(p){const r=b.findIndex(x=>x.id===pid),a=p.a[m.qi];v.me={n:p.n,s:p.s,g:p.g,rank:r+1,c:a?a.c:null}}
  return v;
}
function broadcast(m){for(const c of m.cl)c.res.write('data: '+JSON.stringify(view(m,c.pid,c.adm))+'\n\n')}
function reveal(m){
  if(m.state!=='question')return;
  clearTimeout(m.tm);m.state='reveal';
  for(const p of Object.values(m.p)){const a=p.a[m.qi];p.g=a?a.pts:0;p.s+=p.g}
  broadcast(m);
}
function next(m){
  if(m.state!=='lobby'&&m.state!=='reveal')return;
  if(m.qi+1>=m.qs.length){m.state='final';setTimeout(()=>delete M[m.code],6*3600e3)}
  else{m.qi++;m.state='question';m.end=Date.now()+m.lim;m.tm=setTimeout(()=>reveal(m),m.lim+400)}
  broadcast(m);
}
const srv=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x'),pn=u.pathname;
  const out=(c,o)=>{res.writeHead(c,{'content-type':'application/json'});res.end(JSON.stringify(o))};
  try{
    if(req.method==='GET'&&(pn==='/'||pn==='/karvon-sahifa.html')){
      res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(fs.readFileSync(path.join(__dirname,'karvon-sahifa.html')));
    }
    if(pn==='/api/stream'){
      const m=M[u.searchParams.get('code')];if(!m)return out(404,{e:'Poyga topilmadi'});
      const pid=u.searchParams.get('pid'),isA=adm(u.searchParams.get('t'));
      res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache',connection:'keep-alive','x-accel-buffering':'no'});
      const c={res,pid,adm:isA};m.cl.push(c);
      res.write('data: '+JSON.stringify(view(m,pid,isA))+'\n\n');
      const hb=setInterval(()=>res.write(': hb\n\n'),20000);
      req.on('close',()=>{clearInterval(hb);m.cl=m.cl.filter(x=>x!==c)});return;
    }
    let b={};
    if(req.method!=='GET'){let s='';for await(const ch of req){s+=ch;if(s.length>2e6)throw 'Juda katta'}b=s?JSON.parse(s):{}}
    const t=req.headers['x-token'];
    if(pn==='/api/login'){
      const now=Date.now();fails=fails.filter(x=>now-x<6e4);
      if(fails.length>=8)return out(429,{e:'Koʻp urinish. 1 daqiqadan keyin urining'});
      if(!eq(b.password,PASS)){fails.push(now);return out(401,{e:'Parol notoʻgʻri'})}
      const tk=crypto.randomBytes(24).toString('hex');D.tokens=D.tokens.slice(-19).concat(tk);save();return out(200,{token:tk});
    }
    if(pn==='/api/join'){
      const m=M[str(b.code,8)];if(!m||m.state==='final')throw 'Bunday faol poyga yoʻq';
      if(Object.keys(m.p).length>=300)throw 'Poyga toʻlgan';
      const pid=crypto.randomBytes(6).toString('hex');m.p[pid]={n:null,s:0,g:0,a:{}};return out(200,{pid});
    }
    if(pn==='/api/name'||pn==='/api/answer'){
      const m=M[str(b.code,8)],p=m&&m.p[b.pid];if(!p)throw 'Poyga topilmadi';
      if(pn==='/api/name'){
        const n=str(b.name,20).replace(/\s+/g,' ');
        if(n.length<2)throw 'Ism kamida 2 ta belgi boʻlsin';
        if(board(m).some(x=>x.n.toLowerCase()===n.toLowerCase()))throw 'Bu ism band, boshqasini yozing';
        p.n=n;broadcast(m);return out(200,{ok:1});
      }
      if(!p.n)throw 'Avval ismingizni yozing';
      const c=b.c|0,now=Date.now();
      if(m.state!=='question'||now>m.end+800||p.a[m.qi]||c<0||c>3)throw 'Javob qabul qilinmadi';
      const ms=Math.min(m.lim,Math.max(0,m.lim-(m.end-now))),ok=c===m.qs[m.qi].a;
      p.a[m.qi]={c,pts:ok?100+Math.round(900*(1-ms/m.lim)):0};
      if(board(m).every(x=>m.p[x.id].a[m.qi]))reveal(m);else broadcast(m);
      return out(200,{ok:1});
    }
    if(!adm(t))return out(401,{e:'Kirish talab qilinadi'});
    if(pn==='/api/sets'){
      if(req.method==='PUT'){D.sets=cleanSets(b.sets);save()}
      return out(200,{sets:D.sets});
    }
    if(pn==='/api/match'){
      const s=D.sets.find(x=>x.id===b.setId);if(!s||!s.qs.length)throw 'Mavzuda savol yoʻq';
      let code;do{code=String(crypto.randomInt(1000,10000))}while(M[code]);
      const qs=sh(s.qs).map(q=>{const i=sh([0,1,2,3]);return{q:q.q,o:i.map(k=>q.o[k]),a:i.indexOf(q.a)}});
      M[code]={code,name:s.name,lim:Math.min(60,Math.max(8,(b.lim|0)||20))*1000,qs,state:'lobby',qi:-1,p:{},cl:[]};
      return out(200,{code});
    }
    if(pn==='/api/host'){
      const m=M[str(b.code,8)];if(!m)throw 'Poyga topilmadi';
      if(b.action==='next')next(m);
      else if(b.action==='reveal')reveal(m);
      else if(b.action==='end'){reveal(m);m.state='final';broadcast(m)}
      return out(200,{ok:1});
    }
    out(404,{e:'Topilmadi'});
  }catch(e){out(400,{e:typeof e==='string'?e:'Xatolik yuz berdi'})}
});
srv.listen(PORT,()=>console.log('Karvon: http://localhost:'+PORT+'  (admin: /#admin)'));
