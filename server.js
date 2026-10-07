import 'dotenv/config';
import express from 'express';
import webpush from 'web-push';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA = path.join(__dirname, 'data.json');
const UP = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UP, {recursive:true});

const initial = {users:[], contacts:[], alarms:[], messages:[], inbox:[], acks:[], reads:[], alarmstate:[], settings:{name:'Friends Team',logo:'',notif:true,memberSend:true}, pushes:[]};
let db = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA,'utf8')) : initial;
for (const k of Object.keys(initial)) if (db[k]===undefined) db[k]=initial[k];
function persist(){ fs.writeFileSync(DATA, JSON.stringify(db,null,2)); }
const id=()=>crypto.randomBytes(8).toString('hex');
const token=()=>crypto.randomBytes(24).toString('hex');
function userFrom(req){ const t=(req.headers.authorization||'').replace(/^Bearer\s+/,''); return db.users.find(u=>u.token===t); }
function admin(req){ const u=userFrom(req); return u?.role==='admin'; }
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));
app.use('/uploads', express.static(UP));

app.post('/api/login', (req,res)=>{
  const {mode,key,name}=req.body||{};
  if(mode==='admin'){
    if(!process.env.ADMIN_KEY || key!==process.env.ADMIN_KEY) return res.status(401).json({error:'Invalid admin key'});
    let u=db.users.find(x=>x.role==='admin'); if(!u){u={id:id(),name:'Admin',role:'admin',token:token()};db.users.push(u);} else u.token=token(); persist(); return res.json({token:u.token,id:u.id,name:u.name,role:u.role});
  }
  const c=db.contacts.find(c=>c.active!==false && c.name.toLowerCase()===(name||'').trim().toLowerCase());
  if(!c) return res.status(401).json({error:'Contact not found'});
  let u=db.users.find(x=>x.contactId===c.id); if(!u){u={id:id(),name:c.name,role:'member',contactId:c.id,token:token()};db.users.push(u);} else u.token=token(); persist(); res.json({token:u.token,id:u.id,name:u.name,role:u.role,contactId:c.id});
});
app.get('/api/me',(req,res)=>{const u=userFrom(req); if(!u)return res.status(401).end(); res.json({id:u.id,name:u.name,role:u.role,contactId:u.contactId||''});});

function collection(name){
  const allowed=['contacts','alarms','messages','inbox','acks','reads','alarmstate'];
  if(!allowed.includes(name)) throw Error('bad collection');
  return db[name];
}
app.get('/api/col/:name',(req,res)=>{try{const u=userFrom(req);if(!u)return res.status(401).end();res.json(collection(req.params.name));}catch(e){res.status(404).json({error:'Not found'});}});
app.put('/api/col/:name/:item', (req,res)=>{try{if(!admin(req))return res.status(403).json({error:'Admin only'});const a=collection(req.params.name),i=req.params.item;const v={id:i,...req.body};const n=a.findIndex(x=>x.id===i);if(n>=0)a[n]=v;else a.push(v);persist();res.json(v);}catch(e){res.status(400).json({error:e.message});}});
app.delete('/api/col/:name/:item',(req,res)=>{try{if(!admin(req))return res.status(403).json({error:'Admin only'});const a=collection(req.params.name);db[req.params.name]=a.filter(x=>x.id!==req.params.item);persist();res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/member/:action',(req,res)=>{const u=userFrom(req);if(!u||u.role!=='member')return res.status(403).end();const action=req.params.action;if(action==='profile'){const x=db.users.find(x=>x.id===u.id);x.contactId=req.body.id||'';persist();return res.json({ok:true});} if(action==='message'){if(!db.settings.memberSend)return res.status(403).json({error:'Messaging disabled'});const m={id:id(),...req.body,from:u.id,fromName:u.name,ts:Date.now(),to:['admin']};db.inbox.push(m);persist();return res.json(m);} if(action==='ack'){const a={id:id(),...req.body,uid:u.id,name:u.name,ts:Date.now()};db.acks.push(a);persist();return res.json(a);} if(action==='state'){const n=db.alarmstate.findIndex(x=>x.id===req.body.id&&x.uid===u.id);const v={...req.body,uid:u.id,id:req.body.id};if(n>=0)db.alarmstate[n]=v;else db.alarmstate.push(v);persist();return res.json(v);}res.status(404).end();});


function pathParts(p){ return String(p).split('/').filter(Boolean); }
function docGet(p,u){
  const q=pathParts(p); const c=q[0]; const i=q[1];
  if(c==='settings'&&i==='main') return {exists:true,data:db.settings};
  if(c==='data'&&q[2]==='profile'&&q[3]==='me'){ const x=db.users.find(x=>x.id===q[1]); return {exists:!!x,data:{id:x?.contactId||''}}; }
  if(c==='data'&&q[2]==='alarmstate'){ const x=db.alarmstate.find(x=>x.uid===q[1]&&x.id===q[3]); return {exists:!!x,data:x}; }
  const arr=db[c]; if(!Array.isArray(arr)) return {exists:false,data:null}; const x=arr.find(x=>x.id===i); return {exists:!!x,data:x};
}
function docAllowed(p,u,method){
  const q=pathParts(p), c=q[0];
  if(['settings','contacts','alarms'].includes(c)) return u.role==='admin';
  if(c==='messages') return u.role==='admin';
  if(c==='inbox') return u.role==='admin' || (u.role==='member' && method==='PUT');
  if(c==='reads'||c==='acks') return u.role==='admin' || u.role==='member';
  if(c==='data'&&q[2]==='profile') return u.id===q[1];
  if(c==='data'&&q[2]==='alarmstate') return u.id===q[1];
  return false;
}
app.get('/api/doc',(req,res)=>{const u=userFrom(req);if(!u)return res.status(401).end();res.json(docGet(req.query.path,u));});
app.put('/api/doc',(req,res)=>{const u=userFrom(req), p=req.query.path; if(!u||!docAllowed(p,u,'PUT'))return res.status(403).json({error:'Not allowed'});const q=pathParts(p),c=q[0],i=q[1],v=req.body;
  if(c==='settings'){db.settings={...db.settings,...v};persist();return res.json({ok:true});}
  if(c==='data'&&q[2]==='profile'){const x=db.users.find(x=>x.id===u.id);x.contactId=v.id||'';persist();return res.json({ok:true});}
  if(c==='data'&&q[2]==='alarmstate'){const n=db.alarmstate.findIndex(x=>x.uid===u.id&&x.id===q[3]);const z={...v,id:q[3],uid:u.id};if(n>=0)db.alarmstate[n]=z;else db.alarmstate.push(z);persist();return res.json({ok:true});}
  const arr=db[c];if(!Array.isArray(arr))return res.status(400).json({error:'Bad path'});const z={id:i,...v};const n=arr.findIndex(x=>x.id===i);if(n>=0)arr[n]=z;else arr.push(z);persist();res.json({ok:true});
});
app.delete('/api/doc',(req,res)=>{const u=userFrom(req),p=req.query.path;if(!u||!docAllowed(p,u,'DELETE'))return res.status(403).end();const q=pathParts(p),c=q[0],i=q[1];if(!Array.isArray(db[c]))return res.status(400).end();db[c]=db[c].filter(x=>x.id!==i);persist();res.json({ok:true});});

app.get('/api/settings',(req,res)=>{if(!userFrom(req))return res.status(401).end();res.json(db.settings)});
app.put('/api/settings',(req,res)=>{if(!admin(req))return res.status(403).end();db.settings={...db.settings,...req.body};persist();res.json(db.settings)});
app.post('/api/upload',(req,res)=>res.status(501).json({error:'Use multipart upload endpoint or configure an object store for production.'}));

function configurePush(){
  if(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY){webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:admin@example.com',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);return true} return false;
}
app.get('/api/push/public-key',(req,res)=>{if(!userFrom(req))return res.status(401).end();res.json({publicKey:process.env.VAPID_PUBLIC_KEY||''});});
app.post('/api/push/subscribe',(req,res)=>{const u=userFrom(req);if(!u)return res.status(401).end();const old=db.pushes.find(p=>p.userId===u.id&&p.sub?.endpoint===req.body.endpoint);if(old)old.sub=req.body;else db.pushes.push({id:id(),userId:u.id,sub:req.body});persist();res.json({ok:true});});
app.post('/api/push/test',async(req,res)=>{const u=userFrom(req);if(!u)return res.status(401).end();if(!configurePush())return res.status(503).json({error:'VAPID keys are not configured'});const targets=db.pushes.filter(p=>p.userId===u.id);for(const p of targets){try{await webpush.sendNotification(p.sub,JSON.stringify({title:'🔔 Friends Team Alarm',body:'Test alarm',url:'/'}));}catch(e){if(e.statusCode===404||e.statusCode===410)db.pushes=db.pushes.filter(x=>x.id!==p.id);}}persist();res.json({ok:true});});

let fired=new Set();
async function scheduler(){
  if(!configurePush())return;
  const now=Date.now();
  for(const a of db.alarms){if(a.status==='cancelled')continue;const start=new Date(a.at).getTime();if(!start)continue;let occ=start;const step=a.repeat==='daily'?864e5:a.repeat==='weekly'?6048e5:a.repeat==='custom'?Math.max(1,Number(a.every)||1)*864e5:0;if(step){if(now<start)continue;occ=start+Math.floor((now-start)/step)*step;}if(now<occ||now-occ>90000)continue;const key=a.id+'@'+occ;if(fired.has(key))continue;fired.add(key);const recipients=a.rec?.includes('all')?db.users.filter(u=>u.role==='member'):db.users.filter(u=>u.role==='member'&&a.rec?.includes(u.contactId));for(const u of recipients){for(const p of db.pushes.filter(x=>x.userId===u.id)){try{await webpush.sendNotification(p.sub,JSON.stringify({title:'🔔 '+a.title,body:a.msg||a.title,tag:'alarm-'+a.id,url:'/'}));}catch(e){if(e.statusCode===404||e.statusCode===410)db.pushes=db.pushes.filter(x=>x.id!==p.id);}}}}persist();}
setInterval(scheduler,15000);

app.get('/sw.js',(req,res)=>res.sendFile(path.join(__dirname,'public','sw.js')));
app.use(express.static(path.join(__dirname,'public')));
app.listen(PORT,()=>console.log(`Friends Team Alarm running on http://localhost:${PORT}`));
