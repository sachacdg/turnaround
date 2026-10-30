const express = require('express');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const { pool } = require('./db');
const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set to a random secret of at least 32 characters.');
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb', strict: true }));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const cleanUsername = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
function validUsername(s) { return /^[a-z0-9_.-]{3,32}$/.test(s); }
function issueToken(user) { return jwt.sign({ sub: String(user.id), username: user.username }, JWT_SECRET, { expiresIn: '12h', issuer: 'turnaround' }); }
function auth(req,res,next) {
 const raw=String(req.headers.authorization||''); const match=raw.match(/^Bearer\s+(.+)$/i);
 if(!match)return res.status(401).json({error:'auth_required'});
 try { const p=jwt.verify(match[1],JWT_SECRET,{issuer:'turnaround'}); req.user={id:Number(p.sub),username:p.username}; if(!Number.isSafeInteger(req.user.id)||req.user.id<=0)throw Error('invalid subject'); next(); }
 catch(_){return res.status(401).json({error:'invalid_or_expired_token'});}
}
app.get('/api/ping',(_req,res)=>res.json({ok:true}));
app.post('/api/register',asyncRoute(async(req,res)=>{
 const id=cleanUsername(req.body&&req.body.id),pw=req.body&&req.body.pw;
 if(!validUsername(id))return res.status(400).json({error:'username_format'});
 if(typeof pw!=='string'||pw.length<12||pw.length>200)return res.status(400).json({error:'password_length_min_12'});
 const hash=await bcrypt.hash(pw,12);
 try {const result=await pool.query('INSERT INTO users(username,password_hash) VALUES($1,$2) RETURNING id, username',[id,hash]); await pool.query('INSERT INTO user_data(user_id,data) VALUES($1,$2::jsonb)',[result.rows[0].id,'{}']); return res.status(201).json({ok:true});}
 catch(err){if(err.code==='23505')return res.status(409).json({error:'exists'});throw err;}
}));
app.post('/api/login',asyncRoute(async(req,res)=>{
 const id=cleanUsername(req.body&&req.body.id),pw=req.body&&req.body.pw;
 if(!validUsername(id)||typeof pw!=='string')return res.status(401).json({error:'bad'});
 const result=await pool.query('SELECT id, username, password_hash FROM users WHERE username=$1',[id]);const user=result.rows[0];
 if(!user||!(await bcrypt.compare(pw,user.password_hash)))return res.status(401).json({error:'bad'});
 return res.json({token:issueToken(user),expiresIn:43200});
}));
app.get('/api/data',auth,asyncRoute(async(req,res)=>{const r=await pool.query('SELECT data FROM user_data WHERE user_id=$1',[req.user.id]);return res.json({data:r.rows[0]?.data||{}});}));
app.put('/api/data',auth,asyncRoute(async(req,res)=>{
 if(!req.body||!Object.prototype.hasOwnProperty.call(req.body,'data')||typeof req.body.data!=='object'||req.body.data===null||Array.isArray(req.body.data))return res.status(400).json({error:'data_must_be_object'});
 const data=JSON.stringify(req.body.data);if(Buffer.byteLength(data,'utf8')>1500000)return res.status(413).json({error:'data_too_large'});
 await pool.query(`INSERT INTO user_data(user_id,data,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(user_id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()`,[req.user.id,data]);
 await pool.query('UPDATE users SET updated_at=NOW() WHERE id=$1',[req.user.id]);return res.json({ok:true});
}));
function viffHeaders(){const key=process.env.VIFF_API_KEY;if(!key)throw Object.assign(new Error('vIFF server key is not configured'),{status:503,code:'viff_not_configured'});const h={Accept:'application/json'};const hn=process.env.VIFF_API_KEY_HEADER||'X-API-Key';if(!/^[A-Za-z0-9-]{1,64}$/.test(hn))throw Object.assign(new Error('Invalid VIFF_API_KEY_HEADER'),{status:500});h[hn]=key;if(process.env.VIFF_AUTH_SCHEME)h.Authorization=`${process.env.VIFF_AUTH_SCHEME} ${key}`;return h;}
async function upstream(url,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const r=await fetch(url,{...options,signal:controller.signal,redirect:'error'});const body=await r.text();if(!r.ok)throw Object.assign(new Error(`vIFF returned HTTP ${r.status}`),{status:502,code:'viff_upstream_error',upstreamStatus:r.status});try{return body?JSON.parse(body):{};}catch(_){throw Object.assign(new Error('vIFF response was not JSON'),{status:502,code:'viff_invalid_response'});}}catch(e){if(e.name==='AbortError')throw Object.assign(new Error('vIFF request timed out'),{status:504,code:'viff_timeout'});throw e;}finally{clearTimeout(timer);}}
function viffUrl(envName,requiredPath){const raw=process.env[envName];if(!raw)throw Object.assign(new Error(`${envName} is not configured`),{status:503,code:'viff_not_configured'});const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!=='api.viffsys.com'||u.pathname!==requiredPath)throw Object.assign(new Error(`Invalid ${envName}`),{status:500,code:'invalid_viff_url'});return u;}
async function getFlight(callsign){const u=viffUrl('VIFF_FLIGHT_LOOKUP_URL','/ifps/callsign');u.searchParams.set('callsign',callsign);return upstream(u.toString(),{headers:viffHeaders()});}
app.get('/api/viff',auth,asyncRoute(async(req,res)=>{const callsign=String(req.query.callsign||'').trim().toUpperCase();if(!/^[A-Z0-9-]{2,12}$/.test(callsign))return res.status(400).json({error:'invalid_callsign'});return res.json(await getFlight(callsign));}));
/*
 * Pilot TOBT request. Provider documentation supplied by the project owner says:
 * POST /ifps/dpi, for the callsign, command REQTOBT/<HHMM>/PILOT.
 * This implementation puts callsign in the query string and command in JSON.
 * Confirm these two transport details against the provider's full API example.
 */
app.post('/api/viff-tobt',auth,asyncRoute(async(req,res)=>{
 const callsign=String(req.body?.callsign||'').trim().toUpperCase();
 const raw=String(req.body?.tobt||req.body?.command||req.body?.request||'').trim();
 const match=raw.match(/^(?:REQTOBT\/)?([0-2][0-9][0-5][0-9])(?:\/PILOT)?$/);
 if(!/^[A-Z0-9-]{2,12}$/.test(callsign)||!match||Number(match[1].slice(0,2))>23)return res.status(400).json({error:'invalid_tobt_payload'});
 const hhmm=match[1],command=`REQTOBT/${hhmm}/PILOT`;
 const before=await getFlight(callsign);
 const dpi=viffUrl('VIFF_TOBT_SUBMIT_URL','/ifps/dpi');
dpi.searchParams.set('callsign',callsign);
dpi.searchParams.set('value',command);

const submitted=await upstream(dpi.toString(),{
  method:'POST',
  headers:viffHeaders()
});
 const after=await getFlight(callsign);
 return res.json({ok:true,callsign,command,before,submitted,after,confirmedState:after});
}));
app.get('/api/simbrief',asyncRoute(async(req,res)=>{
 const username=String(req.query.username||'').trim(),json=String(req.query.json||'1');if(!/^[A-Za-z0-9_-]{1,32}$/.test(username)||!['1','v2'].includes(json))return res.status(400).json({error:'invalid_simbrief_request'});
 const base=process.env.SIMBRIEF_BASE_URL||'https://www.simbrief.com/api/xml.fetcher.php',url=new URL(base);if(url.protocol!=='https:'||!['www.simbrief.com','simbrief.com'].includes(url.hostname))return res.status(500).json({error:'invalid_simbrief_base_url'});url.searchParams.set('username',username);url.searchParams.set('json',json==='v2'?'v2':'1');const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000),redirect:'error'});if(!response.ok)return res.status(502).json({error:`simbrief_http_${response.status}`});return res.json(await response.json());
}));
app.get('/api/pdf',asyncRoute(async(req,res)=>{const raw=String(req.query.u||'');let url;try{url=new URL(raw);}catch(_){return res.status(400).json({error:'invalid_url'});}if(url.protocol!=='https:'||!['simbrief.com','www.simbrief.com'].includes(url.hostname))return res.status(400).json({error:'pdf_host_not_allowed'});const response=await fetch(url,{signal:AbortSignal.timeout(12000),redirect:'error'});if(!response.ok)return res.status(502).json({error:`pdf_http_${response.status}`});const type=response.headers.get('content-type')||'application/pdf';if(!type.includes('pdf')&&!type.includes('octet-stream'))return res.status(415).json({error:'not_pdf'});const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>20*1024*1024)return res.status(413).json({error:'pdf_too_large'});res.setHeader('Content-Type','application/pdf');res.setHeader('Cache-Control','private, max-age=300');return res.send(bytes);}));
app.use((req,res)=>res.status(404).json({error:'not_found'}));
app.use((err,_req,res,_next)=>{const status=Number(err.status)||500;if(status>=500)console.error('Request failed:',err.code||'server_error',err.message);res.status(status).json({error:status<500?(err.message||'bad_request'):(err.code||'server_error')});});
const server=app.listen(PORT,()=>console.log(`Turnaround listening on ${PORT}`));
async function shutdown(){server.close(async()=>{try{await pool.end();}finally{process.exit(0);}});setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
