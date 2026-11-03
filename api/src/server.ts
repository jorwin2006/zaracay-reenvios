import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { SignJWT, jwtVerify } from 'jose';
import argon2 from 'argon2';
import ipaddr from 'ipaddr.js';
import { randomUUID, createHash } from 'node:crypto';

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET)<32) throw Error('Configurar DATABASE_URL y JWT_SECRET >= 32 bytes');
const pool = new Pool({connectionString: process.env.DATABASE_URL});
const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const app = express(); app.disable('x-powered-by'); app.set('trust proxy',false); app.use(express.json({limit:'64kb'}));
const asyncRoute=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{Promise.resolve(fn(req,res)).catch(next)};
const fail=(status:number,message:string)=>Object.assign(new Error(message),{status});
const parse=<T extends z.ZodTypeAny>(schema:T,input:unknown):z.infer<T>=>schema.parse(input);
const UUID=z.string().uuid();
const guideFields=z.object({issuer:z.string().trim().min(1).max(100),series:z.string().trim().max(40).default(''),guideNumber:z.string().trim().min(1).max(80),origin:z.string().trim().min(1).max(100),finalDestination:z.string().trim().min(1).max(100),parcels:z.number().int().positive().max(10000),recipient:z.string().max(200).nullable().optional(),note:z.string().max(500).nullable().optional()}).strict();
const nowIso=()=>new Date().toISOString();
type Principal={id:string;role:'ADMIN'|'OPERADOR';sessionId:string};
declare global { namespace Express { interface Request { principal?:Principal } } }

const ipAllowed = async (ip: string) => {
  try {
    const addr = ipaddr.process(ip);

    const { rows } = await pool.query(
      'SELECT cidr::text FROM authorized_networks WHERE active=true'
    );

    return rows.some((r) => {
      const cidr = ipaddr.parseCIDR(r.cidr);
      return addr.kind() === cidr[0].kind() && addr.match(cidr);
    });
  } catch {
    return false;
  }
};
const auth=(req:Request,res:Response,next:NextFunction)=>{
 Promise.resolve((async()=>{const bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!bearer)throw fail(401,'Falta token');let payload;try{payload=(await jwtVerify(bearer,secret)).payload;}catch{throw fail(401,'Token inválido');} const sessionId=String(payload.sid||'');const {rows}=await pool.query(`SELECT u.id,u.role,u.active,s.expires_at,s.revoked_at FROM operator_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.token_hash=$2`,[sessionId,createHash('sha256').update(bearer).digest('hex')]);if(!rows.length||!rows[0].active||rows[0].revoked_at||new Date(rows[0].expires_at)<=new Date())throw fail(401,'Sesión caducada');if(rows[0].role!=='ADMIN' && !(await ipAllowed(req.ip||'')))throw fail(403,'Red no autorizada');req.principal={id:rows[0].id,role:rows[0].role,sessionId};await pool.query('UPDATE operator_sessions SET last_seen_at=now() WHERE id=$1',[sessionId]);})()).then(()=>next(),next);
};
const admin=(req:Request,_res:Response,next:NextFunction)=>req.principal?.role==='ADMIN'?next():next(fail(403,'Requiere administrador'));
const withTx=async<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>=>{const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
app.get('/health',(_req,res)=>res.json({ok:true,time:nowIso()}));
app.post('/api/auth/login',asyncRoute(async(req,res)=>{const input=parse(z.object({username:z.string(),password:z.string()}).strict(),req.body);const {rows}=await pool.query('SELECT * FROM users WHERE username=$1 AND active=true',[input.username]);if(!rows.length||!(await argon2.verify(rows[0].password_hash,input.password)))throw fail(401,'Credenciales inválidas');const user=rows[0];const ip=req.ip||'';if(user.role!=='ADMIN' && !(await ipAllowed(ip)))throw fail(403,'Red no autorizada');const sessionId=randomUUID();const expires=new Date(Date.now()+8*3600*1000);const token=await new SignJWT({sid:sessionId,role:user.role}).setProtectedHeader({alg:'HS256'}).setSubject(user.id).setIssuedAt().setExpirationTime(Math.floor(expires.getTime()/1000)).sign(secret);
await withTx(async c=>{if(user.role==='OPERADOR'){await c.query('SELECT pg_advisory_xact_lock(4201)');await c.query('DELETE FROM operator_sessions WHERE expires_at<=now() OR revoked_at IS NOT NULL');const count=await c.query(`SELECT count(*)::int AS n FROM operator_sessions s JOIN users u ON u.id=s.user_id WHERE u.role='OPERADOR' AND s.revoked_at IS NULL AND s.expires_at>now()`);if(count.rows[0].n>=2)throw fail(409,'Dos sesiones operativas activas');}await c.query('INSERT INTO operator_sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',[sessionId,user.id,createHash('sha256').update(token).digest('hex'),expires]);});res.json({token,expiresAt:expires.toISOString(),role:user.role});}));
// Verificación física: 0..parcels. 0=pendiente, parcial=en revisión, totalidad=visto.
app.patch('/api/guias/:id/verificacion',auth,asyncRoute(async(req,res)=>{
 const id=parse(UUID,req.params.id);
 const input=parse(z.object({verifiedParcels:z.number().int().min(0).max(10000)}).strict(),req.body);
 const updated=await withTx(async c=>{
   const current=await c.query(`SELECT g.id,g.parcels,g.verified_parcels,g.verified_by,g.verified_at,t.status
     FROM guides g JOIN assignments a ON a.guide_id=g.id AND a.removed_at IS NULL
     JOIN trips t ON t.id=a.trip_id WHERE g.id=$1 FOR UPDATE OF g,t`,[id]);
   if(!current.rowCount)throw fail(404,'Guía no encontrada o sin viaje activo');
   const before=current.rows[0];
   if(before.status!=='ABIERTO')throw fail(409,'El viaje está cerrado');
   if(input.verifiedParcels>before.parcels)throw fail(422,'Cantidad verificada superior a los bultos');
   if(input.verifiedParcels===before.verified_parcels)return before;
   const after=await c.query(`UPDATE guides SET verified_parcels=$2,verified_by=$3,
     verified_at=CASE WHEN $2=0 THEN NULL ELSE now() END
     WHERE id=$1 RETURNING id,parcels,verified_parcels,verified_by,verified_at`,
     [id,input.verifiedParcels,req.principal!.id]);
   await c.query(`INSERT INTO audit_log(actor_id,event,entity,entity_id,before_data,after_data)
     VALUES($1,'GUIDE_VERIFICATION','guide',$2,$3::jsonb,$4::jsonb)`,
     [req.principal!.id,id,JSON.stringify({verifiedParcels:before.verified_parcels}),JSON.stringify({verifiedParcels:input.verifiedParcels})]);
   return after.rows[0];
 });
 res.json(updated);
}));
// OCR asistido: no crea ni modifica guias, viajes o verificaciones.
// Recibe bytes JPEG/PNG autenticados y los transmite al motor Python local.
const ocrImage = express.raw({type:['image/jpeg','image/png'],limit:'12mb'});
const ocrFields = z.object({
  numero_guia:z.string().nullable(),
  origen:z.string().nullable(),
  destino_facturado:z.string().nullable(),
  destino_final:z.string().nullable(),
  destino_final_es_excepcion:z.boolean(),
  tipo_bulto:z.enum(['SOBRE','PAQUETE','CARTON','BULTO']).nullable(),
  cantidad_bultos:z.number().int().positive().nullable(),
  requiere_revision:z.boolean(),
  alertas:z.array(z.string())
});
app.post('/api/ocr/leer-guia',auth,ocrImage,asyncRoute(async(req,res)=>{
  const bytes=req.body;
  if(!Buffer.isBuffer(bytes)||bytes.length===0)throw fail(400,'Enviar una imagen JPEG o PNG en el cuerpo de la peticion');
  const jpeg=bytes.length>=3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff;
  const png=bytes.length>=8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(!(jpeg||png))throw fail(415,'Solo se aceptan imagenes JPEG o PNG validas');
  const data=new FormData();
  data.append('archivo',new Blob([Uint8Array.from(bytes)],{type:jpeg?'image/jpeg':'image/png'}),jpeg?'guia.jpg':'guia.png');
  let upstream:globalThis.Response;
  try {
    upstream=await fetch('http://127.0.0.1:8001/leer-guia',{
      method:'POST',body:data,signal:AbortSignal.timeout(180000)
    });
  } catch(err) {
    console.error('OCR no disponible:',err);
    throw fail(502,'El motor OCR local no esta disponible o excedio el tiempo de espera');
  }
  if(!upstream.ok){
    console.error('Respuesta OCR:',upstream.status);
    throw fail(502,'El motor OCR no pudo analizar la imagen');
  }
  let result:unknown;
  try { result=await upstream.json(); }
  catch { throw fail(502,'Respuesta no valida del motor OCR'); }
  const parsed=z.object({campos:ocrFields,procesamiento:z.string()}).safeParse(result);
  if(!parsed.success)throw fail(502,'Formato de respuesta OCR inesperado');
  // No exponer el texto completo (puede contener nombres y telefonos).
  res.json({campos:parsed.data.campos,procesamiento:parsed.data.procesamiento});
}));
app.post('/api/auth/logout',auth,asyncRoute(async(req,res)=>{await pool.query('UPDATE operator_sessions SET revoked_at=now() WHERE id=$1',[req.principal!.sessionId]);res.status(204).end();}));
// Administrador: la API aplica autorización en cada petición (no solo en la interfaz).
const networkInput=z.object({description:z.string().trim().min(2).max(120),cidr:z.string().trim().min(3).max(60)}).strict();
function canonicalNetwork(raw:string){
  try {const pair=raw.includes('/')?ipaddr.parseCIDR(raw):[ipaddr.parse(raw),raw.includes(':')?128:32] as [ipaddr.IPv4|ipaddr.IPv6,number];
    return `${pair[0].toString()}/${pair[1]}`;
  }catch{throw fail(422,'Dirección IP o rango CIDR inválido');}
}
app.get('/api/admin/redes',auth,admin,asyncRoute(async(_req,res)=>{
 const {rows}=await pool.query('SELECT id,description,cidr::text AS cidr,active FROM authorized_networks ORDER BY description,id');res.json(rows);
}));
app.post('/api/admin/redes',auth,admin,asyncRoute(async(req,res)=>{
 const p=parse(networkInput,req.body);const cidr=canonicalNetwork(p.cidr);
 const result=await withTx(async c=>{const q=await c.query('INSERT INTO authorized_networks(description,cidr) VALUES($1,$2::cidr) RETURNING id,description,cidr::text AS cidr,active',[p.description,cidr]);
 await c.query("INSERT INTO audit_log(actor_id,event,entity,entity_id,after_data) VALUES($1,'NETWORK_CREATED','authorized_network',$2,$3)",[req.principal!.id,q.rows[0].id,JSON.stringify(q.rows[0])]);return q.rows[0];});res.status(201).json(result);
}));
app.patch('/api/admin/redes/:id',auth,admin,asyncRoute(async(req,res)=>{
 const id=parse(UUID,req.params.id);const p=parse(z.object({active:z.boolean()}).strict(),req.body);
 const result=await withTx(async c=>{const before=await c.query('SELECT id,description,cidr::text AS cidr,active FROM authorized_networks WHERE id=$1 FOR UPDATE',[id]);if(!before.rowCount)throw fail(404,'Red no encontrada');
 const after=await c.query('UPDATE authorized_networks SET active=$2 WHERE id=$1 RETURNING id,description,cidr::text AS cidr,active',[id,p.active]);
 await c.query("INSERT INTO audit_log(actor_id,event,entity,entity_id,before_data,after_data) VALUES($1,'NETWORK_CHANGED','authorized_network',$2,$3,$4)",[req.principal!.id,id,JSON.stringify(before.rows[0]),JSON.stringify(after.rows[0])]);return after.rows[0];});res.json(result);
}));
app.get('/api/destinos',auth,asyncRoute(async(_req,res)=>{const {rows}=await pool.query(`SELECT id,name FROM destinations WHERE active=true ORDER BY name`);res.json(rows);}));
// Sin catálogo de frecuencias: el operador elige destino, fecha y hora directamente.
app.post('/api/viajes',auth,asyncRoute(async(req,res)=>{
 const p=parse(z.object({destinationId:UUID,departureAt:z.string().datetime({offset:true})}).strict(),req.body);
 const dest=await pool.query('SELECT id FROM destinations WHERE id=$1 AND active=true',[p.destinationId]);
 if(!dest.rowCount)throw fail(404,'Destino no autorizado');
 const dt=new Date(p.departureAt);if(Number.isNaN(dt.getTime()))throw fail(422,'Fecha inválida');
 const data=await pool.query(`INSERT INTO trips(destination_id,departure_at,created_by) VALUES($1,$2::timestamptz,$3) RETURNING *`,[p.destinationId,p.departureAt,req.principal!.id]);
 res.status(201).json(data.rows[0]);
}));
app.get('/api/viajes',auth,asyncRoute(async(req,res)=>{const estado=req.query.estado===undefined?'ABIERTO':parse(z.enum(['ABIERTO','CERRADO']),req.query.estado);const {rows}=await pool.query(`SELECT t.*, d.name AS destination FROM trips t JOIN destinations d ON d.id=t.destination_id WHERE t.status=$1 ORDER BY t.departure_at,t.created_at`,[estado]);res.json(rows);}));
app.get('/api/viajes/:id',auth,asyncRoute(async(req,res)=>{const id=parse(UUID,req.params.id);const {rows}=await pool.query(`SELECT t.*, d.name AS destination FROM trips t JOIN destinations d ON d.id=t.destination_id WHERE t.id=$1`,[id]);if(!rows.length)throw fail(404,'Viaje inexistente');const guides=await pool.query(`SELECT g.*, a.mismatch_confirmed,a.mismatch_note FROM assignments a JOIN guides g ON g.id=a.guide_id WHERE a.trip_id=$1 AND a.removed_at IS NULL ORDER BY a.assigned_at`,[id]);res.json({trip:rows[0],guides:guides.rows});}));
app.post('/api/guias',auth,asyncRoute(async(req,res)=>{const p=parse(guideFields.extend({tripId:UUID,mismatchConfirmed:z.boolean().default(false),mismatchNote:z.string().max(500).nullable().optional()}).strict(),req.body);const result=await withTx(async c=>{const tr=await c.query(`SELECT t.status,d.name AS destination FROM trips t JOIN destinations d ON d.id=t.destination_id WHERE t.id=$1 FOR UPDATE OF t`,[p.tripId]);if(!tr.rowCount)throw fail(404,'Viaje inexistente');if(tr.rows[0].status!=='ABIERTO')throw fail(409,'Viaje cerrado');if(p.finalDestination.trim().toUpperCase()==='SANTO DOMINGO')throw fail(422,'El MVP excluye entrega local');const mismatch=tr.rows[0].destination.trim().toUpperCase()!==p.finalDestination.trim().toUpperCase();if(mismatch && !p.mismatchConfirmed)throw fail(422,'Debe confirmar diferencia entre destino final y viaje');const existing=await c.query('SELECT id FROM guides WHERE issuer=$1 AND series=$2 AND guide_number=$3',[p.issuer,p.series,p.guideNumber]);if(existing.rowCount)throw fail(409,'Guía existente: consultar y editar desde web o Android');const g=await c.query(`INSERT INTO guides(issuer,series,guide_number,origin,final_destination,parcels,recipient,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[p.issuer,p.series,p.guideNumber,p.origin,p.finalDestination,p.parcels,p.recipient??null,p.note??null,req.principal!.id]);await c.query(`INSERT INTO assignments(guide_id,trip_id,mismatch_confirmed,mismatch_note,assigned_by) VALUES($1,$2,$3,$4,$5)`,[g.rows[0].id,p.tripId,mismatch&&p.mismatchConfirmed,p.mismatchNote??null,req.principal!.id]);await c.query(`INSERT INTO audit_log(actor_id,event,entity,entity_id,after_data) VALUES($1,'GUIDE_CREATED','guide',$2,$3)`,[req.principal!.id,g.rows[0].id,JSON.stringify(g.rows[0])]);return g.rows[0];});res.status(201).json(result);}));
app.get('/api/guias/:id',auth,asyncRoute(async(req,res)=>{const id=parse(UUID,req.params.id);const {rows}=await pool.query('SELECT * FROM guides WHERE id=$1',[id]);if(!rows.length)throw fail(404,'Guía inexistente');res.json(rows[0]);}));
app.patch('/api/guias/:id',auth,asyncRoute(async(req,res)=>{const id=parse(UUID,req.params.id);const patch=parse(guideFields.partial().strict(),req.body);if(!Object.keys(patch).length)throw fail(422,'Sin cambios');const updated=await withTx(async c=>{const a=await c.query(`SELECT t.id,t.status FROM assignments a JOIN trips t ON t.id=a.trip_id WHERE a.guide_id=$1 AND a.removed_at IS NULL FOR UPDATE OF t`,[id]);if(!a.rowCount)throw fail(409,'La guía no tiene asignación activa');if(a.rows[0].status!=='ABIERTO')throw fail(409,'No se edita una guía de viaje cerrado');const before=await c.query('SELECT * FROM guides WHERE id=$1 FOR UPDATE',[id]);if(!before.rowCount)throw fail(404,'Guía inexistente');const map:Record<string,string>={issuer:'issuer',series:'series',guideNumber:'guide_number',origin:'origin',finalDestination:'final_destination',parcels:'parcels',recipient:'recipient',note:'note'};const keys=Object.keys(patch);const sets=keys.map((k,i)=>`${map[k]}=$${i+2}`).join(', ');const values=keys.map(k=>(patch as Record<string,unknown>)[k]);if(patch.parcels!==undefined && patch.parcels<before.rows[0].verified_parcels)throw fail(422,'Desmarque bultos verificados antes de reducir la cantidad');const dest=(patch.finalDestination??before.rows[0].final_destination).trim().toUpperCase();if(dest==='SANTO DOMINGO')throw fail(422,'El MVP excluye entrega local');const destination=await c.query(`SELECT d.name FROM trips t JOIN destinations d ON d.id=t.destination_id WHERE t.id=$1`,[a.rows[0].id]);if(patch.finalDestination && dest!==destination.rows[0].name.trim().toUpperCase())throw fail(422,'Cambiar destino con discrepancia requiere flujo de reconfirmación (pendiente de implementar)');const after=await c.query(`UPDATE guides SET ${sets},updated_by=$${keys.length+2},updated_at=now() WHERE id=$1 RETURNING *`,[id,...values,req.principal!.id]);await c.query(`INSERT INTO audit_log(actor_id,event,entity,entity_id,before_data,after_data) VALUES($1,'GUIDE_UPDATED','guide',$2,$3,$4)`,[req.principal!.id,id,JSON.stringify(before.rows[0]),JSON.stringify(after.rows[0])]);return after.rows[0];});res.json(updated);}));
app.post('/api/viajes/:id/cerrar',auth,asyncRoute(async(req,res)=>{const id=parse(UUID,req.params.id);const result=await withTx(async c=>{const q=await c.query(`UPDATE trips SET status='CERRADO',closed_by=$2,closed_at=now() WHERE id=$1 AND status='ABIERTO' RETURNING *`,[id,req.principal!.id]);if(!q.rowCount)throw fail(409,'Viaje inexistente o cerrado');const remaining=await c.query(`SELECT count(*)::int AS pending FROM assignments a JOIN guides g ON g.id=a.guide_id WHERE a.trip_id=$1 AND a.removed_at IS NULL AND g.verified_parcels<g.parcels`,[id]);if(remaining.rows[0].pending>0)throw fail(409,`Existen ${remaining.rows[0].pending} guías sin verificación completa. No puede cerrar el viaje.`);await c.query(`INSERT INTO audit_log(actor_id,event,entity,entity_id,after_data) VALUES($1,'TRIP_CLOSED','trip',$2,$3)`,[req.principal!.id,id,JSON.stringify(q.rows[0])]);return q.rows[0];});res.json(result);}));
app.use((err:any,_req:Request,res:Response,_next:NextFunction)=>{if(err instanceof z.ZodError)return res.status(422).json({error:'Validación incorrecta',details:err.flatten()});if(err?.code==='23505')return res.status(409).json({error:'Registro duplicado'});if(err?.code==='23514')return res.status(422).json({error:'La cantidad verificada no puede superar los bultos'});if(err?.code==='23503')return res.status(422).json({error:'Referencia inexistente'});const status=Number.isInteger(err.status)?err.status:500;if(status===500)console.error(err);res.status(status).json({error:status===500?'Error interno':err.message});});
app.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('API en localhost; publicar solo mediante proxy TLS/VPN seguro'));
