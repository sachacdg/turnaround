const express = require('express');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const PDFDocument = require('pdfkit');
const { createHash } = require('node:crypto');
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
// ===== Shared Techlog =====

function cleanRegistration(value) {
 return typeof value === 'string'
  ? value.trim().toUpperCase()
  : '';
}

// Retrieve defects for one aircraft.
// Closed defects remain visible for 7 days.
app.get('/api/techlog',auth,asyncRoute(async(req,res)=>{
 const reg=cleanRegistration(req.query.reg);

 if(!/^[A-Z0-9-]{2,12}$/.test(reg))
  return res.status(400).json({error:'invalid_registration'});

 const result=await pool.query(`
  SELECT
   id,
   category AS ata,
   description AS d,
   status AS st,
   created_by AS b,
   created_at AS op,
   closed_at AS "closedAt",
   closed_by AS "closedBy"
  FROM techlog_defects
  WHERE registration=$1
    AND (status <> 'CLOSED' OR closed_at >= NOW() - INTERVAL '7 days')
  ORDER BY created_at DESC
 `,[reg]);

 return res.json({defects:result.rows});
}));

// Create a new shared defect.
app.post('/api/techlog',auth,asyncRoute(async(req,res)=>{
 const reg=cleanRegistration(req.body?.registration);
 const category=typeof req.body?.category==='string'
  ? req.body.category.trim()
  : '';
 const description=typeof req.body?.description==='string'
  ? req.body.description.trim()
  : '';

 if(!/^[A-Z0-9-]{2,12}$/.test(reg))
  return res.status(400).json({error:'invalid_registration'});

 if(!category||category.length>100)
  return res.status(400).json({error:'invalid_category'});

 if(!description||description.length>3000)
  return res.status(400).json({error:'invalid_description'});

 const result=await pool.query(`
  INSERT INTO techlog_defects
   (registration,category,description,created_by)
  VALUES ($1,$2,$3,$4)
  RETURNING
   id,
   category AS ata,
   description AS d,
   status AS st,
   created_by AS b,
   created_at AS op,
   closed_at AS "closedAt",
   closed_by AS "closedBy"
 `,[reg,category,description,req.user.username]);

 return res.status(201).json({defect:result.rows[0]});
}));

// Close a defect without deleting its record.
app.post('/api/techlog/:id/close',auth,asyncRoute(async(req,res)=>{
 const id=Number(req.params.id);

 if(!Number.isSafeInteger(id)||id<=0)
  return res.status(400).json({error:'invalid_defect_id'});

 const result=await pool.query(`
  UPDATE techlog_defects
  SET
   status='CLOSED',
   closed_at=NOW(),
   closed_by=$2
  WHERE id=$1
    AND status IN ('OPEN','DEFERRED')
  RETURNING
   id,
   category AS ata,
   description AS d,
   status AS st,
   created_by AS b,
   created_at AS op,
   closed_at AS "closedAt",
   closed_by AS "closedBy"
 `,[id,req.user.username]);

 if(!result.rowCount)
  return res.status(404).json({error:'defect_not_found_or_already_closed'});

 return res.json({defect:result.rows[0]});
}));
// ===== Shared Aircraft Flight History =====

app.post('/api/aircraft-history', auth, asyncRoute(async(req,res)=>{
 const reg=cleanRegistration(req.body?.registration);
 const flightNumber=String(req.body?.flightNumber||'').trim().toUpperCase();
 const origin=String(req.body?.origin||'').trim().toUpperCase();
 const destination=String(req.body?.destination||'').trim().toUpperCase();
 const offBlocksMs=Number(req.body?.offBlocksMs);
 const onBlocksMs=Number(req.body?.onBlocksMs);
 const pax=Number(req.body?.pax ?? 0);

 if(!/^[A-Z0-9-]{2,12}$/.test(reg))
  return res.status(400).json({error:'invalid_registration'});

 if(!flightNumber||flightNumber.length>20)
  return res.status(400).json({error:'invalid_flight_number'});

 if(!/^[A-Z]{4}$/.test(origin)||!/^[A-Z]{4}$/.test(destination))
  return res.status(400).json({error:'invalid_airports'});

 if(!Number.isSafeInteger(offBlocksMs)||offBlocksMs<=0||
    !Number.isSafeInteger(onBlocksMs)||onBlocksMs<offBlocksMs)
  return res.status(400).json({error:'invalid_block_times'});

 if(!Number.isInteger(pax)||pax<0||pax>999)
  return res.status(400).json({error:'invalid_pax'});

 const client=await pool.connect();

 try{
  await client.query('BEGIN');

  // Serialize updates for this registration.
  await client.query(
   'SELECT pg_advisory_xact_lock(hashtext($1))',
   [reg]
  );

  const old=await client.query(`
   SELECT
    registration,
    flight_number AS "flightNumber",
    origin,
    destination,
    off_blocks_ms AS "offBlocksMs",
    on_blocks_ms AS "onBlocksMs",
    pax
   FROM aircraft_flight_history
   WHERE registration=$1
   FOR UPDATE
  `,[reg]);

  const existing=old.rows[0]||null;
  const previous=existing&&
   Number(existing.offBlocksMs)<offBlocksMs
   ?existing:null;

  const saved=await client.query(`
   INSERT INTO aircraft_flight_history (
    registration,
    flight_number,
    origin,
    destination,
    off_blocks_ms,
    on_blocks_ms,
    pax,
    updated_by
   )
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
   ON CONFLICT (registration) DO UPDATE SET
    flight_number=EXCLUDED.flight_number,
    origin=EXCLUDED.origin,
    destination=EXCLUDED.destination,
    off_blocks_ms=EXCLUDED.off_blocks_ms,
    on_blocks_ms=EXCLUDED.on_blocks_ms,
    pax=EXCLUDED.pax,
    updated_by=EXCLUDED.updated_by,
    updated_at=NOW()
   WHERE aircraft_flight_history.off_blocks_ms
         <= EXCLUDED.off_blocks_ms
   RETURNING registration
  `,[
   reg,flightNumber,origin,destination,
   offBlocksMs,onBlocksMs,pax,req.user.username
  ]);

  await client.query('COMMIT');

  return res.json({
   ok:true,
   stored:saved.rowCount>0,
   previous
  });

 }catch(err){
  await client.query('ROLLBACK');
  throw err;
 }finally{
  client.release();
 }
}));

// ===== End Shared Aircraft Flight History =====
// ===== End Shared Techlog =====
function viffHeaders(){const key=process.env.VIFF_API_KEY;if(!key)throw Object.assign(new Error('vIFF server key is not configured'),{status:503,code:'viff_not_configured'});const h={Accept:'application/json'};const hn=process.env.VIFF_API_KEY_HEADER||'X-API-Key';if(!/^[A-Za-z0-9-]{1,64}$/.test(hn))throw Object.assign(new Error('Invalid VIFF_API_KEY_HEADER'),{status:500});h[hn]=key;if(process.env.VIFF_AUTH_SCHEME)h.Authorization=`${process.env.VIFF_AUTH_SCHEME} ${key}`;return h;}
async function upstream(url,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const r=await fetch(url,{...options,signal:controller.signal,redirect:'error'});const body=await r.text();if(!r.ok)throw Object.assign(new Error(`vIFF returned HTTP ${r.status}`),{status:502,code:'viff_upstream_error',upstreamStatus:r.status});try{return body?JSON.parse(body):{};}catch(_){throw Object.assign(new Error('vIFF response was not JSON'),{status:502,code:'viff_invalid_response'});}}catch(e){if(e.name==='AbortError')throw Object.assign(new Error('vIFF request timed out'),{status:504,code:'viff_timeout'});throw e;}finally{clearTimeout(timer);}}
function viffUrl(envName,requiredPath){const raw=process.env[envName];if(!raw)throw Object.assign(new Error(`${envName} is not configured`),{status:503,code:'viff_not_configured'});const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!=='api.viffsys.com'||u.pathname!==requiredPath)throw Object.assign(new Error(`Invalid ${envName}`),{status:500,code:'invalid_viff_url'});return u;}
async function getFlight(callsign){const u=viffUrl('VIFF_FLIGHT_LOOKUP_URL','/ifps/callsign');u.searchParams.set('callsign',callsign);return upstream(u.toString(),{headers:viffHeaders()});}
function reportText(value,max=500){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max)}
function buildFlightReportPdf(report){
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',margin:42,info:{Title:'Turnaround Flight Report',Author:'Turnaround'}}),chunks=[];
  doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
  const navy='#12243A',teal='#148C83',muted='#627286',line='#D8E1EA',blue='#1677D2';
  const flight=report.flight||{},name=reportText(flight.callsign||flight.number||'Flight report',80),route=`${reportText(flight.departure||'----',8)} - ${reportText(flight.destination||'----',8)}`;
  const section=title=>{doc.moveDown(.35);doc.fillColor(teal).font('Helvetica-Bold').fontSize(9).text(title.toUpperCase());doc.moveDown(.25)};
  const row=(label,value)=>{const y=doc.y;doc.font('Helvetica-Bold').fontSize(8).fillColor(navy).text(reportText(label,80),doc.page.margins.left,y,{width:145});const text=reportText(value||'--',1100);doc.font('Helvetica').fontSize(8).fillColor(navy).text(text,doc.page.margins.left+150,y,{width:doc.page.width-doc.page.margins.left-doc.page.margins.right-150});doc.y=Math.max(doc.y,y+14);doc.strokeColor(line).lineWidth(.35).moveTo(doc.page.margins.left,doc.y).lineTo(doc.page.width-doc.page.margins.right,doc.y).stroke();doc.moveDown(.2)};
  const columns=(left,right)=>{const x=doc.page.margins.left,w=(doc.page.width-doc.page.margins.left-doc.page.margins.right-18)/2,y=doc.y;for(const [i,item] of [left,right].entries()){const xx=x+i*(w+18);doc.fillColor(navy).font('Helvetica-Bold').fontSize(8).text(reportText(item[0],90),xx,y,{width:w});doc.fillColor(muted).font('Helvetica').fontSize(8).text(reportText(item[1]||'--',420),xx,y+12,{width:w});}doc.y=y+Math.max(44,Math.max(doc.heightOfString(reportText(left[1]||'--',420),{width:w,font:'Helvetica',fontSize:8}),doc.heightOfString(reportText(right[1]||'--',420),{width:w,font:'Helvetica',fontSize:8}))+24);};
  doc.rect(0,0,doc.page.width,8).fill(navy);doc.fillColor(teal).font('Helvetica-Bold').fontSize(8).text('TURNAROUND / RAPPORT DE VOL',42,28);
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(22).text('Flight report',42,43);
  doc.fillColor(muted).font('Helvetica').fontSize(9).text(`${name}  |  ${route}  |  ${reportText(flight.date||'',30)}`,42,70);
  doc.moveDown(2);
  doc.rect(42,98,doc.page.width-84,48).fill('#F1F5F9');
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(13).text(name,52,108);
  doc.font('Helvetica').fontSize(8).fillColor(muted).text(`${reportText(flight.aircraftType||'',100)}  |  ${reportText(flight.registration||'',30)}  |  ${reportText(flight.departure||'----',8)} to ${reportText(flight.destination||'----',8)}`,52,128);
  doc.y=158;
  section('Bilan horaire UTC');
  row('Départ programmé (STD)',flight.stdUtc);row('CTOT / ATOT',`${flight.ctotUtc||'--'} / ${flight.atotUtc||'--'}`);row('Arrivée programmée bloc',flight.scheduledArrivalUtc);row('Arrivée estimée bloc',`${flight.estimatedBlockArrivalUtc||'--'}${Number.isFinite(flight.deltaMinutes)?`  (${flight.deltaMinutes>0?'+':''}${flight.deltaMinutes} min)` : ''}`);row('Départ / arrivée réels',`${flight.actualDepartureUtc||'--'} / ${flight.actualBlockArrivalUtc||'--'}`);
  section('Opérations au sol');
  columns(['Départ',`Terminal ${report.departureStand?.t||'--'} | Parking ${report.departureStand?.p||'--'} | Porte ${report.departureStand?.g||'--'} | Taxi-out ${flight.taxiOut||'--'}`],['Arrivée',`Terminal ${report.arrivalStand?.t||'--'} | Parking ${report.arrivalStand?.p||'--'} | Porte ${report.arrivalStand?.g||'--'} | Taxi-in ${flight.taxiIn||'--'}`]);
  section('Carburant et passagers');
  columns(['Carburant',`Block prévu ${report.fuel?.plannedBlock??'--'} kg | Taxi ${report.fuel?.taxi??'--'} kg | Trip ${report.fuel?.trip??'--'} kg | Loadsheet ${report.fuel?.loadsheetBlock??'--'} kg`],['Passagers',`Prévus ${report.pax?.planned??'--'} | Embarqués ${report.pax?.boarded??'--'} | Mode ${report.pax?.source||'Turnaround'}`]);
  section('Météo OFP');
  row('Départ',report.weather?.departure||'Non disponible');row('Destination',report.weather?.destination||'Non disponible');row('Dégagement',report.weather?.alternate||'Non disponible');
  doc.addPage();
  doc.rect(0,0,doc.page.width,8).fill(navy);doc.fillColor(teal).font('Helvetica-Bold').fontSize(8).text('TURNAROUND / DÉTAILS',42,28);doc.fillColor(navy).font('Helvetica-Bold').fontSize(20).text('Journal et validations',42,43);doc.fillColor(muted).font('Helvetica').fontSize(9).text(`${name}  |  ${route}`,42,70);doc.y=94;
  section('Journal de vol');
  const log=Array.isArray(report.log)?report.log:[];
  if(!log.length)row('Journal','Aucun point de route enregistré');
  log.slice(0,70).forEach(e=>row(`${e.actualUtc||e.estimatedUtc||'--'} UTC`,`${e.waypoint||'Point'}${e.flightLevel?` - FL${e.flightLevel}`:''}${e.fuelRemaining?` - fuel ${e.fuelRemaining}`:''}`));
  section('MEL / CDL');
  const mel=Array.isArray(report.mel)?report.mel:[];
  if(!mel.length)row('État','Aucun défaut ouvert ou différé');
  mel.slice(0,30).forEach(e=>row(`${e.ata||e.id||'MEL'} - ${e.status||'--'}`,`${e.description||e.defect||''}${e.mel?` (${e.mel})`:''}${e.due?` - échéance ${e.due}`:''}`));
  section('Notes de vol');
  const notes=Array.isArray(report.notes)?report.notes:[];
  if(!notes.length)row('Notes','Aucune note saisie');
  notes.slice(0,30).forEach(n=>row(`${n.date||''} ${n.time||''} UTC`,n.text||'Note manuscrite jointe'));
  section('Signatures');
  const sigs=[['Release OFP',report.signatures?.ofp],['Loadsheet',report.signatures?.loadsheet]],left=42,w=(doc.page.width-84-12)/2,y=doc.y;
  for(let i=0;i<sigs.length;i++){const x=left+i*(w+12);doc.roundedRect(x,y,w,86,4).strokeColor(line).lineWidth(.7).stroke();doc.fillColor(navy).font('Helvetica-Bold').fontSize(8).text(sigs[i][0],x+8,y+8);const sig=sigs[i][1];if(sig&&typeof sig.img==='string'&&/^data:image\/(png|jpeg);base64,/.test(sig.img)){try{doc.image(Buffer.from(sig.img.slice(sig.img.indexOf(',')+1),'base64'),x+8,y+23,{fit:[w-16,38]})}catch(_){doc.fillColor(muted).font('Helvetica').fontSize(8).text('Signature image non lisible',x+8,y+34)}}else doc.fillColor(muted).font('Helvetica').fontSize(8).text('Signature non disponible',x+8,y+34);doc.fillColor(muted).font('Helvetica').fontSize(7).text(`Signé ${reportText(sig?.t||'',10)} UTC`,x+8,y+69)}
  doc.end();
 });
}
app.post('/api/flight-report',auth,asyncRoute(async(req,res)=>{
 const to=String(req.body?.to||'').trim(),report=req.body?.report;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||to.length>254)return res.status(400).json({error:'invalid_report_email'});
 if(!report||typeof report!=='object'||!report.flight||typeof report.flight!=='object'||!report.flight.callsign||!report.flight.date)return res.status(400).json({error:'invalid_report'});
 if(Buffer.byteLength(JSON.stringify(report),'utf8')>1500000)return res.status(413).json({error:'report_too_large'});
 const apiKey=process.env.RESEND_API_KEY,from=process.env.REPORT_FROM_EMAIL;
 if(!apiKey||!from)return res.status(503).json({error:'report_mail_not_configured'});
 const pdf=await buildFlightReportPdf(report),call=reportText(report.flight.callsign,16),flightDate=reportText(report.flight.date,20),route=`${reportText(report.flight.departure||'----',8)}-${reportText(report.flight.destination||'----',8)}`;
 const idempotency=createHash('sha256').update(`${req.user.id}:${call}:${flightDate}:final-report`).digest('hex');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':idempotency},body:JSON.stringify({from,to:[to],subject:`Flight report ${call} ${route} ${flightDate}`,text:`Bonjour,\n\nVeuillez trouver en pièce jointe le rapport de vol ${call} (${route}).\n\nTurnaround`,attachments:[{filename:`flight-report-${call}-${flightDate}.pdf`,content:pdf.toString('base64')}] }),signal:AbortSignal.timeout(20000),redirect:'error'});
 const result=await response.json().catch(()=>({}));
 if(!response.ok){console.error('Flight report email provider error:',response.status,result.name||result.error||'unknown');return res.status(502).json({error:'report_mail_send_failed'});}
 return res.json({ok:true,emailId:result.id||null,from});
}));
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
