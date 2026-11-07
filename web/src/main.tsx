import React, {useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BusFront,Plus,Search,ArrowLeft,LogOut,RefreshCw,MapPin,Package,Clock,CheckCircle2,AlertTriangle,LockKeyhole,PenLine,ChevronRight,Printer,CalendarDays,Eye,ShieldCheck,LayoutDashboard,Save,X,Info,Wifi} from 'lucide-react';
import './style.css';
import cuadroS45 from './turnos_S45.json';
type Status='ABIERTO'|'CERRADO';
type Destination={id:string;name:string};
type Trip={id:string;destination_id:string;departure_at:string;status:Status;destination:string;created_at?:string;closed_at?:string;scheduled_shift_id?:string|null;shift_source?:string|null;bus_number?:number|null;dispatch_time?:string|null;return_time?:string|null};
type Guide={id:string;issuer:string;series:string;guide_number:string;origin:string;final_destination:string;parcels:number;recipient:string|null;note:string|null;verified_parcels?:number;verified_by?:string|null;verified_at?:string|null;mismatch_confirmed?:boolean;mismatch_note?:string|null};
type Detail={trip:Trip;guides:Guide[]};
type AuthorizedNetwork={id:string;description:string;cidr:string;active:boolean};
const API=(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '') + '/api';
type Shift={id:string;destino:string;hora:string;unidades:(number|null)[];retorno:string|null;despacho:string|null;revision?:string};
const SHIFTS=cuadroS45.turnos as Shift[];
const isScheduleDate=(date:string)=>date >= cuadroS45.desde && date <= cuadroS45.hasta;
// Los discos del cuadro se conservan solo como referencia; la unidad se asigna manualmente.

type ManualGuideForm={issuer:string;series:string;guideNumber:string;origin:string;finalDestination:string;parcels:string;recipient:string;note:string};
// Campos internos requeridos por la API; no se solicitan al operador.
const emptyManualGuide=():ManualGuideForm=>({issuer:'REENVIO',series:'',guideNumber:'',origin:'',finalDestination:'',parcels:'1',recipient:'',note:''});
const initialGuide=(g:Guide)=>({issuer:g.issuer,series:g.series,guideNumber:g.guide_number,origin:g.origin,finalDestination:g.final_destination,parcels:String(g.parcels),recipient:g.recipient??'',note:g.note??''});
const fromLocal=(s:string)=>new Date(s).toLocaleString('es-EC',{timeZone:'America/Guayaquil',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
const nowEcuador=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()).reduce((o,p)=>({...o,[p.type]:p.value}),{} as Record<string,string>);
const sampleDestinations:Destination[]=[{id:'d1',name:'GUAYAQUIL'},{id:'d2',name:'QUEVEDO'},{id:'d3',name:'MANTA'}];
const sampleTrips:Trip[]=[{id:'t1',destination_id:'d1',destination:'GUAYAQUIL',status:'ABIERTO',departure_at:new Date().toISOString()},{id:'t2',destination_id:'d2',destination:'QUEVEDO',status:'ABIERTO',departure_at:new Date().toISOString()},{id:'t3',destination_id:'d3',destination:'MANTA',status:'CERRADO',departure_at:new Date().toISOString()}];
const sampleGuides:Guide[]=[{id:'g1',issuer:'ZARACAY',series:'003-005',guide_number:'0007483',origin:'QUITUMBE',final_destination:'SANTA ELENA',parcels:2,recipient:null,note:'Reenvío vía Guayaquil',mismatch_confirmed:true,mismatch_note:'Transbordo confirmado'},{id:'g2',issuer:'ZARACAY',series:'003-005',guide_number:'0007484',origin:'ESMERALDAS',final_destination:'GUAYAQUIL',parcels:1,recipient:null,note:null,mismatch_confirmed:false}];
const demoInitial:Record<string,Guide[]>={t1:sampleGuides,t2:[{...sampleGuides[1],id:'g3',guide_number:'0007490',origin:'QUITO',final_destination:'QUEVEDO'}],t3:[]};
// Catálogo inicial editable: se complementa con los destinos registrados en PostgreSQL.
const CITY_CATALOG = [
  'AMBATO','ATACAMES','BABAHOYO','BAHÍA DE CARÁQUEZ','BALZAR','BAÑOS',
  'BUENA FE','CALCETA','CARMEN','CHONE','COCA','CUENCA','DAULE','DURÁN',
  'EL CARMEN','EL EMPALME','EL GUABO','ESMERALDAS','GUARANDA','GUAYAQUIL',
  'HUAQUILLAS','IBARRA','JIPIJAPA','LA CONCORDIA','LA LIBERTAD','LAGO AGRIO',
  'LATACUNGA','LOJA','MACHALA','MANTA','MILAGRO','MONTECRISTI','NARANJAL',
  'OTAVALO','PAJÁN','PEDERNALES','PORTOVIEJO','PUYO','QUEVEDO','QUININDÉ',
  'QUITO','QUITUMBE','RIOBAMBA','SALINAS','SAN VICENTE','SANTA ELENA',
  'SANTO DOMINGO','SHUSHUFINDI','TENA','TULCÁN','VENTANAS','ZAMORA'
];
const normalizeCity=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
function CityPicker({label,value,onChange,options,required=false}:{label:string;value:string;onChange:(v:string)=>void;options:string[];required?:boolean}){
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(0);
  const [showAll,setShowAll]=useState(false);
  const cities=useMemo(()=>Array.from(new Set([...CITY_CATALOG,...options].map(v=>v.trim().toUpperCase()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'es')),[options]);
  const matches=useMemo(()=>cities.filter(c=>showAll||!value.trim()||normalizeCity(c).startsWith(normalizeCity(value))).slice(0,30),[cities,value,showAll]);
  const choose=(city:string)=>{onChange(city);setOpen(false);setActive(0)};
  return <div className="cityPicker"><label className="cityPickerLabel">{label}
    <span className="cityPickerInput"><input required={required} autoComplete="off" maxLength={100} value={value} placeholder="Escriba inicial (ej.: G)" onFocus={()=>{setOpen(true);setShowAll(false);setActive(0)}} onBlur={()=>setOpen(false)} onChange={e=>{onChange(e.target.value.toUpperCase());setOpen(true);setShowAll(false);setActive(0)}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(i=>Math.min(i+1,matches.length-1))}else if(e.key==='ArrowUp'){e.preventDefault();setActive(i=>Math.max(0,i-1))}else if(e.key==='Enter'&&open&&matches.length){e.preventDefault();choose(matches[active]||matches[0])}else if(e.key==='Escape'){setOpen(false)}}}/><button type="button" tabIndex={-1} title="Mostrar ciudades" aria-label="Mostrar ciudades" onMouseDown={e=>e.preventDefault()} onClick={()=>{setShowAll(true);setOpen(o=>!o);setActive(0)}}>▾</button></span>
  </label>{open&&<div className="cityPickerMenu" role="listbox">{matches.length?matches.map((city,i)=><button type="button" role="option" aria-selected={i===active} key={city} className={i===active?'cityActive':''} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(city)}>{city}</button>):<div className="cityPickerHint">Sin coincidencias. Puede escribir un lugar nuevo.</div>}</div>}</div>;
}
function App(){const [demo,setDemo]=useState(false),[token,setToken]=useState(sessionStorage.getItem('zaracay_token')||''),[role,setRole]=useState(sessionStorage.getItem('zaracay_role')||''),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[page,setPage]=useState<'dashboard'|'create'|'detail'|'networks'>('dashboard'),[filter,setFilter]=useState<'ABIERTO'|'CERRADO'>('ABIERTO'),[query,setQuery]=useState(''),[trips,setTrips]=useState<Trip[]>([]),[destinations,setDestinations]=useState<Destination[]>([]),[detail,setDetail]=useState<Detail|null>(null),[chosen,setChosen]=useState(''),[tripDate,setTripDate]=useState(()=>{const t=nowEcuador();return `${t.year}-${t.month}-${t.day}`}),[tripTime,setTripTime]=useState('03:00'),[edit,setEdit]=useState<Guide|null>(null),[form,setForm]=useState<ReturnType<typeof initialGuide>|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[confirmClose,setConfirmClose]=useState(false),[demoGuides,setDemoGuides]=useState(demoInitial),[demoTrips,setDemoTrips]=useState(sampleTrips);
const [networks,setNetworks]=useState<AuthorizedNetwork[]>([]);
 const [shiftId,setShiftId]=useState('');
 const [confirmAmbiguous,setConfirmAmbiguous]=useState(false);
 const [unitNumber,setUnitNumber]=useState('');
 const [unitEdit,setUnitEdit]=useState('');
 const [editingUnit,setEditingUnit]=useState(false);
const [movingGuide,setMovingGuide]=useState<Guide|null>(null);
const [availableTrips,setAvailableTrips]=useState<Trip[]>([]);
const [moveDestinationTrip,setMoveDestinationTrip]=useState('');
const [moveConfirmed,setMoveConfirmed]=useState(false);
const [moveReason,setMoveReason]=useState('');


const [manualOpen,setManualOpen]=useState(false);
const [manualForm,setManualForm]=useState<ManualGuideForm>(emptyManualGuide());
const [queuedGuides,setQueuedGuides]=useState<{form:ManualGuideForm;confirmMismatch:boolean;mismatchReason:string}[]>([]);
const [confirmMismatch,setConfirmMismatch]=useState(false);
const [mismatchReason,setMismatchReason]=useState('');
const [verifying,setVerifying]=useState<string|null>(null);
const loggedIn=demo||!!token;
async function loadNetworks(){setError('');try{if(demo){setNetworks([{id:'demo1',description:'Wi-Fi oficina (ejemplo)',cidr:'192.0.2.10/32',active:true}]);return;}setNetworks(await request<AuthorizedNetwork[]>('/admin/redes'));}catch(e){setError((e as Error).message)}}
async function addNetwork(e:React.FormEvent<HTMLFormElement>){
e.preventDefault();
const formElement=e.currentTarget;
const data=new FormData(formElement);
const description=String(data.get('networkDescription')||'').trim();
const cidr=String(data.get('networkCidr')||'').trim();
if(!description||!cidr){setError('Complete la descripción y la IP de la red.');return;}
setBusy(true);setError('');setNotice('');
try{
 if(demo){setNetworks(n=>[...n,{id:'demo-'+Date.now(),description,cidr,active:true}]);}
 else {await request('/admin/redes',{method:'POST',body:JSON.stringify({description,cidr})});await loadNetworks();}
 formElement.reset();
 setNotice('Red autorizada y registrada correctamente');
}catch(e){setError('No se pudo autorizar la red: '+(e as Error).message)}finally{setBusy(false)}
}
async function toggleNetwork(n:AuthorizedNetwork){setBusy(true);setError('');try{if(demo)setNetworks(p=>p.map(x=>x.id===n.id?{...x,active:!x.active}:x));else{await request('/admin/redes/'+n.id,{method:'PATCH',body:JSON.stringify({active:!n.active})});await loadNetworks();}setNotice(n.active?'Red revocada':'Red activada')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
useEffect(()=>{if(page==='networks'&&(demo||role==='ADMIN'))void loadNetworks()},[page,demo,role]);
async function request<T>(url:string,init:RequestInit={}):Promise<T>{const res=await fetch(API+url,{...init,headers:{...(init.body?{'Content-Type':'application/json'}:{}),Authorization:`Bearer ${token}`,...init.headers}});if(res.status===401){sessionStorage.removeItem('zaracay_token');setToken('');throw Error('Sesión caducada. Ingrese nuevamente.')}const body=await res.json().catch(()=>null);if(!res.ok)throw Error(body?.error||`Error HTTP ${res.status}`);return body as T;}
async function load(){if(!loggedIn)return;setError('');try{if(demo){setTrips([...demoTrips]);setDestinations(sampleDestinations);return;}const [a,b]=await Promise.all([request<Trip[]>('/viajes?estado='+filter),request<Destination[]>('/destinos')]);setTrips(a);setDestinations(b);}catch(e){setError((e as Error).message)}}
useEffect(()=>{void load()},[token,demo,filter,demoTrips]);
useEffect(()=>{if(!loggedIn||page!=='dashboard')return;const id=setInterval(()=>{void load()},20000);return()=>clearInterval(id)},[token,demo,page,filter,demoTrips]);
useEffect(()=>{
 if(page!=='detail'||!detail||!loggedIn||demo)return;
 const tripId=detail.trip.id;
 const timer=setInterval(()=>{if(!manualOpen&&!edit&&!movingGuide&&!busy&&!verifying){
   void request<Detail>('/viajes/'+tripId).then(d=>setDetail(current=>current?.trip.id===tripId?d:current)).catch(()=>{});
 }},5000);
 return()=>clearInterval(timer);
},[page,detail?.trip.id,loggedIn,demo,manualOpen,edit,movingGuide,busy,verifying,token]);
async function openTrip(t:Trip){setBusy(true);setError('');setNotice('');try{const d=demo?{trip:t,guides:demoGuides[t.id]||[]}:await request<Detail>('/viajes/'+t.id);setDetail(d);setPage('detail');setEdit(null)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
async function openMoveGuide(g:Guide){
 if(!detail||detail.trip.status!=='ABIERTO')return;
 setError('');setMoveDestinationTrip('');setMoveConfirmed(false);setMoveReason('');
 setMovingGuide(g);
 try {
   const all=demo?demoTrips:await Promise.all([
      request<Trip[]>('/viajes?estado=ABIERTO'),request<Trip[]>('/viajes?estado=CERRADO')
   ]).then(([a,b])=>[...a,...b]);
   setAvailableTrips([...all].sort((a,b)=>new Date(a.departure_at).getTime()-new Date(b.departure_at).getTime()));
 }catch(e){setError('No se pudieron cargar los viajes: '+(e as Error).message)}
}
async function moveGuideToTrip(){
 if(!movingGuide||!detail||!moveDestinationTrip||busy)return;
 const target=availableTrips.find(t=>t.id===moveDestinationTrip);
 if(!target||target.status!=='ABIERTO'||target.id===detail.trip.id){setError('Seleccione otro viaje abierto.');return;}
 const mismatch=normalizeCity(target.destination)!==normalizeCity(movingGuide.final_destination);
 if(mismatch&&!moveConfirmed){setError('Debe confirmar el transbordo a otro destino.');return;}
 setBusy(true);setError('');
 try {
   if(demo){
     setDemoGuides(p=>({...p,[detail.trip.id]:(p[detail.trip.id]||[]).filter(g=>g.id!==movingGuide.id),[target.id]:[...(p[target.id]||[]),{...movingGuide,verified_parcels:0,mismatch_confirmed:mismatch,mismatch_note:moveReason||null}]}));
     setDetail(d=>d?{...d,guides:d.guides.filter(g=>g.id!==movingGuide.id)}:d);
   }else{
     await request('/guias/'+movingGuide.id+'/cambiar-viaje',{method:'PATCH',body:JSON.stringify({targetTripId:target.id,confirmMismatch:moveConfirmed,reason:moveReason})});
     setDetail(await request<Detail>('/viajes/'+detail.trip.id));
   }
   setMovingGuide(null);setNotice('Encomienda trasladada al viaje '+target.destination+'. Los vistos deben verificarse nuevamente.');
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}
}
async function login(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await fetch(API+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo iniciar sesión');sessionStorage.setItem('zaracay_token',data.token);sessionStorage.setItem('zaracay_role',data.role);setToken(data.token);setRole(data.role);setPassword('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
function logout(){if(!demo&&token)void request('/auth/logout',{method:'POST'}).catch(()=>{});sessionStorage.removeItem('zaracay_token');sessionStorage.removeItem('zaracay_role');setToken('');setRole('');setDemo(false);setPage('dashboard');setDetail(null)}
async function createTrip(){const d=destinations.find(x=>x.id===chosen);if(!d)return;setBusy(true);setError('');try{if(!/^\d{4}-\d{2}-\d{2}$/.test(tripDate)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(tripTime))throw Error('Seleccione fecha y hora válidas');const departureAt=`${tripDate}T${tripTime}:00-05:00`;if(unitNumber.trim()&&!/^\d{1,3}$/.test(unitNumber.trim()))throw Error('Unidad: ingrese un número de disco entre 1 y 999.');if(unitNumber.trim()&&Number(unitNumber)<1)throw Error('Número de unidad inválido.');if(selectedShift){
   if(!isScheduleDate(tripDate))throw Error('El cuadro S45-2026 solo es válido del 02 al 08 de noviembre de 2026. Utilice viaje extraordinario fuera de esa semana.');
   if(selectedShift.destino!==d.name||selectedShift.hora!==tripTime)throw Error('Destino u hora distintos del turno. Seleccione viaje extraordinario para modificarlos.');
   if(selectedShift.revision&&!confirmAmbiguous)throw Error('Debe confirmar el horario 04:00/04:30 de Esmeraldas.');
 }
 const metadata={scheduledShiftId:selectedShift?.id??null,shiftSource:selectedShift?cuadroS45.semana:null,
   busNumber:unitNumber.trim()?Number(unitNumber):null,
  dispatchTime:selectedShift?.despacho??null,returnTime:selectedShift?.retorno??null};
 if(demo){if(demoTrips.some(t=>t.destination_id===d.id&&new Date(t.departure_at).getTime()===new Date(departureAt).getTime()))throw Error('Ya existe un viaje para ese destino y horario');setDemoTrips(s=>[{id:'demo-'+Date.now(),destination_id:d.id,destination:d.name,departure_at:departureAt,status:'ABIERTO',scheduled_shift_id:metadata.scheduledShiftId,shift_source:metadata.shiftSource,bus_number:metadata.busNumber,dispatch_time:metadata.dispatchTime,return_time:metadata.returnTime},...s]);}else await request('/viajes',{method:'POST',body:JSON.stringify({destinationId:d.id,departureAt,...metadata})});setNotice('Viaje creado correctamente');setPage('dashboard');setFilter('ABIERTO');setChosen('');setShiftId('');setUnitNumber('');setConfirmAmbiguous(false);await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
async function closeTrip(){if(!detail)return;setBusy(true);setError('');try{if(demo){setDemoTrips(p=>p.map(t=>t.id===detail.trip.id?{...t,status:'CERRADO'}:t));setDetail({...detail,trip:{...detail.trip,status:'CERRADO'}})}else{await request('/viajes/'+detail.trip.id+'/cerrar',{method:'POST'});const d=await request<Detail>('/viajes/'+detail.trip.id);setDetail(d)}setConfirmClose(false);setNotice('Viaje cerrado. No se admitirán nuevas guías.');await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
function openManualGuide(){
 if(!detail||detail.trip.status!=='ABIERTO')return;
 setManualForm({...emptyManualGuide(),finalDestination:detail.trip.destination});
 setQueuedGuides([]);setConfirmMismatch(false);setMismatchReason('');setManualOpen(true);setError('');setNotice('');
}
type PendingGuide={form:ManualGuideForm;confirmMismatch:boolean;mismatchReason:string};
function validatePendingGuide(item:PendingGuide,tripDestination:string){
 const f=item.form;
 const parcels=Number(f.parcels);
 if(!f.guideNumber.trim()||!f.origin.trim()||!f.finalDestination.trim()||!Number.isInteger(parcels)||parcels<1||parcels>10000)throw Error('Complete número de guía, origen, destino y cantidad de bultos (1 a 10000).');
 if(f.finalDestination.trim().toUpperCase()==='SANTO DOMINGO')throw Error('No se admiten encomiendas locales para Santo Domingo.');
 const mismatch=normalizeCity(f.finalDestination)!==normalizeCity(tripDestination);
 if(mismatch&&!item.confirmMismatch)throw Error('Confirme el transbordo para la guía '+f.guideNumber+'.');
 return {issuer:f.issuer.trim(),series:f.series.trim(),guideNumber:f.guideNumber.trim(),origin:f.origin.trim().toUpperCase(),finalDestination:f.finalDestination.trim().toUpperCase(),parcels,recipient:f.recipient.trim()||null,note:f.note.trim()||null,mismatchConfirmed:mismatch&&item.confirmMismatch,mismatchNote:mismatch?(item.mismatchReason.trim()||'Transbordo confirmado por el operador'):null};
}
function enqueueGuide(){
 if(!detail)return;
 try {
   validatePendingGuide({form:manualForm,confirmMismatch,mismatchReason},detail.trip.destination);
   if(queuedGuides.some(g=>g.form.issuer.trim()===manualForm.issuer.trim()&&g.form.series.trim()===manualForm.series.trim()&&g.form.guideNumber.trim()===manualForm.guideNumber.trim()))throw Error('Esta guía ya está en el lote.');
   if(queuedGuides.length>=29)throw Error('Máximo 30 guías por operación.');
   setQueuedGuides(q=>[...q,{form:{...manualForm},confirmMismatch,mismatchReason}]);
   setManualForm({...emptyManualGuide(),finalDestination:detail.trip.destination});
   setConfirmMismatch(false);setMismatchReason('');setError('');
 }catch(e){setError((e as Error).message)}
}
async function saveManualGuide(e:React.FormEvent<HTMLFormElement>){
 e.preventDefault();
 if(!detail||detail.trip.status!=='ABIERTO'||busy)return;
 setError('');setNotice('');
 try {
  const includeCurrent=Boolean(manualForm.guideNumber.trim()||manualForm.origin.trim()||manualForm.recipient.trim()||manualForm.note.trim());
  const entries=[...queuedGuides,...(includeCurrent?[{form:manualForm,confirmMismatch,mismatchReason}]:[])];
  if(!entries.length)throw Error('Ingrese al menos una guía.');
  const payloads=entries.map(entry=>validatePendingGuide(entry,detail.trip.destination));
  const keys=payloads.map(x=>[x.issuer,x.series,x.guideNumber].join('|').toUpperCase());
  if(new Set(keys).size!==keys.length)throw Error('Hay números de guía duplicados dentro del lote.');
  setBusy(true);
  if(demo){
    const old=demoGuides[detail.trip.id]||[];
    if(payloads.some(x=>old.some(g=>g.issuer===x.issuer&&g.series===x.series&&g.guide_number===x.guideNumber)))throw Error('Una de las guías ya existe en el viaje.');
    const added:Guide[]=payloads.map((x,i)=>({id:'manual-'+Date.now()+'-'+i,issuer:x.issuer,series:x.series,guide_number:x.guideNumber,origin:x.origin,final_destination:x.finalDestination,parcels:x.parcels,recipient:x.recipient,note:x.note,mismatch_confirmed:x.mismatchConfirmed,mismatch_note:x.mismatchNote}));
    setDemoGuides(prev=>({...prev,[detail.trip.id]:[...(prev[detail.trip.id]||[]),...added]}));
    setDetail(prev=>prev?{...prev,guides:[...prev.guides,...added]}:prev);
  }else{
    await request('/guias/lote',{method:'POST',body:JSON.stringify({tripId:detail.trip.id,guides:payloads})});
    setDetail(await request<Detail>('/viajes/'+detail.trip.id));
  }
  setManualOpen(false);setQueuedGuides([]);setManualForm(emptyManualGuide());setConfirmMismatch(false);setMismatchReason('');
  setNotice(`${payloads.length} guía(s) registradas y asignadas al viaje correctamente.`);
 }catch(err){setError((err as Error).message)}finally{setBusy(false)}
}
async function assignUnit(){
 if(!detail||detail.trip.status!=='ABIERTO'||busy)return;
 if(unitEdit.trim()&&!/^\d{1,3}$/.test(unitEdit.trim())){setError('Unidad inválida: utilice un número del 1 al 999.');return;}
 if(unitEdit.trim()&&Number(unitEdit)<1){setError('La unidad debe ser mayor que cero.');return;}
 setBusy(true);setError('');
 try{
  const busNumber=unitEdit.trim()?Number(unitEdit):null;
  if(demo){setDetail(p=>p?{...p,trip:{...p.trip,bus_number:busNumber}}:p);setDemoTrips(p=>p.map(t=>t.id===detail.trip.id?{...t,bus_number:busNumber}:t));}
  else {const updated=await request<Trip>('/viajes/'+detail.trip.id+'/unidad',{method:'PATCH',body:JSON.stringify({busNumber})});setDetail(p=>p?{...p,trip:{...p.trip,bus_number:updated.bus_number}}:p);}
  setEditingUnit(false);setNotice('Unidad del viaje actualizada.');
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}
}
// Un solo endpoint permite visto completo o conteo individual; se sincroniza con Android.
async function setVerified(g:Guide,amount:number){
 if(!detail||detail.trip.status!=='ABIERTO'||verifying)return;
 setVerifying(g.id);setError('');
 try{
  if(demo){setDetail(d=>d?{...d,guides:d.guides.map(x=>x.id===g.id?{...x,verified_parcels:amount}:x)}:d)}
  else {await request('/guias/'+g.id+'/verificacion',{method:'PATCH',body:JSON.stringify({verifiedParcels:amount})});
    setDetail(await request<Detail>('/viajes/'+detail.trip.id));}
 }catch(e){setError((e as Error).message)}finally{setVerifying(null)}
}
async function saveGuide(){if(!form||!edit||!detail)return;setBusy(true);setError('');try{if(!form.guideNumber.trim()||!form.origin.trim()||!form.finalDestination.trim()||!Number.isInteger(Number(form.parcels))||Number(form.parcels)<1)throw Error('Complete los campos obligatorios y una cantidad válida de bultos');if(form.finalDestination.trim().toUpperCase()==='SANTO DOMINGO')throw Error('El MVP no admite entregas locales a Santo Domingo');const mismatch=form.finalDestination.trim().toUpperCase()!==detail.trip.destination.trim().toUpperCase();if(mismatch&&form.finalDestination!==edit.final_destination)throw Error('El backend requiere un flujo adicional de reconfirmación para modificar el destino final de una guía con discrepancia. No se guardará hasta implementar ese flujo.');const payload={issuer:form.issuer.trim(),series:form.series.trim(),guideNumber:form.guideNumber.trim(),origin:form.origin.trim(),finalDestination:form.finalDestination.trim(),parcels:Number(form.parcels),recipient:form.recipient||null,note:form.note||null};if(demo){setDemoGuides(p=>({...p,[detail.trip.id]:p[detail.trip.id].map(g=>g.id===edit.id?{...g,issuer:payload.issuer,series:payload.series,guide_number:payload.guideNumber,origin:payload.origin,final_destination:payload.finalDestination,parcels:payload.parcels,recipient:payload.recipient,note:payload.note}:g)}));setDetail(p=>p?{...p,guides:p.guides.map(g=>g.id===edit.id?{...g,issuer:payload.issuer,series:payload.series,guide_number:payload.guideNumber,origin:payload.origin,final_destination:payload.finalDestination,parcels:payload.parcels,recipient:payload.recipient,note:payload.note}:g)}:p)}else{await request('/guias/'+edit.id,{method:'PATCH',body:JSON.stringify(payload)});setDetail(await request<Detail>('/viajes/'+detail.trip.id))}setEdit(null);setForm(null);setNotice('Guía actualizada; se conserva el historial de cambios en el servidor.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
const shown=useMemo(()=>trips.filter(t=>t.status===filter&&t.destination.toLowerCase().includes(query.toLowerCase())),[trips,filter,query]);
const selectedDestination=destinations.find(x=>x.id===chosen);
 const selectedShift=SHIFTS.find(s=>s.id===shiftId);
 const shiftsForDestination=SHIFTS.filter(s=>!selectedDestination||s.destino===selectedDestination.name).sort((a,b)=>a.destino.localeCompare(b.destino,'es')||a.hora.localeCompare(b.hora));
 function chooseShift(id:string){
  setShiftId(id);setConfirmAmbiguous(false);
  const shift=SHIFTS.find(t=>t.id===id);
  if(shift){const d=destinations.find(x=>x.name===shift.destino);if(d)setChosen(d.id);setTripTime(shift.hora);}
 }

function printTrip(){if(!detail)return;window.print()}
if(!loggedIn)return <div className="loginPage"><div className="loginShell"><div className="brandMark">Z</div><p className="eyebrow">COOPERATIVA DE TRANSPORTES ZARACAY</p><h1>Control de Reenvíos</h1><p className="subtle">Gestión de viajes, guías y despachos.</p><form onSubmit={login} className="loginForm"><label>Usuario<input value={username} onChange={e=>setUsername(e.target.value)} required autoComplete="username"/></label><label>Contraseña<input value={password} type="password" onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label><button className="primary" disabled={busy}>Iniciar sesión</button></form>{error&&<div className="alert error"><AlertTriangle size={16}/>{error}</div>}</div></div>;
return <div className="app"><aside className="sidebar"><div className="logoRow"><div className="logo">Z</div><div><strong>ZARACAY</strong><span>Control de Reenvíos</span></div></div><div className="sideLabel">OPERACIÓN</div><button className={'nav '+(page==='dashboard'?'active':'')} onClick={()=>{setPage('dashboard');setDetail(null);setNotice('');setError('')}}><LayoutDashboard size={19}/> Panel de viajes</button><button className={'nav '+(page==='create'?'active':'')} onClick={()=>{setPage('create');setNotice('');setError('')}}><Plus size={19}/> Crear viaje</button>{(role==='ADMIN'||demo)&&<button className={'nav '+(page==='networks'?'active':'')} onClick={()=>{setPage('networks');setError('');setNotice('')}}><Wifi size={19}/> Redes autorizadas</button>}<div className="sidebarBottom"><div className="sideIdentity"><ShieldCheck size={19}/><span>{demo?'MODO DEMOSTRACIÓN':role==='ADMIN'?'Administrador':'Operador'}</span></div><button className="nav" onClick={logout}><LogOut size={18}/> Salir</button></div></aside><main className="main"><header className="topbar"><div><span className="topUnit">OPERACIONES / SANTO DOMINGO</span><span className="topDescription">Sistema complementario a DERPACIF</span></div><div className="topRight"><span className="online"><span className="dot"/>{demo?'Datos de prueba':'Sesión activa'}</span><span className="avatar">{demo?'D':role==='ADMIN'?'A':'O'}</span></div></header><div className="content">{error&&<div className="alert error"><AlertTriangle size={18}/><span>{error}</span><button title="Cerrar" onClick={()=>setError('')}><X size={16}/></button></div>}{notice&&<div className="alert success"><CheckCircle2 size={18}/><span>{notice}</span><button title="Cerrar" onClick={()=>setNotice('')}><X size={16}/></button></div>}
{page==='networks'&&(role==='ADMIN'||demo)&&<section><div className="heading"><div><p className="eyebrow">ADMINISTRACIÓN / SEGURIDAD</p><h1>Redes autorizadas</h1><p className="subtle">Solo el administrador puede permitir o revocar redes de acceso para operadores.</p></div></div>
<div className="networkPanel"><h3>Agregar red o equipo</h3><p className="subtle">Indique la IP pública de salida o un rango CIDR autorizado. Ejemplo de formato: 203.0.113.25/32 (IP ilustrativa, no autoriza una red real).</p><form className="networkInputs" onSubmit={addNetwork}><label>Descripción<input name="networkDescription" required placeholder="Oficina Santo Domingo" autoComplete="off"/></label><label>IP o rango CIDR<input name="networkCidr" required placeholder="203.0.113.25/32" autoComplete="off"/></label><button type="submit" className="primary" disabled={busy}><Plus size={16}/> {busy?'Guardando...':'Autorizar red'}</button></form></div>
<div className="networkPanel"><div className="networkTitle"><h3>Redes registradas</h3><button onClick={()=>void loadNetworks()}><RefreshCw size={16}/> Actualizar</button></div><div className="networkList">{networks.map(n=><div className="networkEntry" key={n.id}><div><strong>{n.description}</strong><div className="subtle">{n.cidr}</div></div><span className={n.active?'networkOn':'networkOff'}>{n.active?'Autorizada':'Revocada'}</span><button disabled={busy} onClick={()=>void toggleNetwork(n)}>{n.active?'Revocar':'Activar'}</button></div>)}{networks.length===0&&<p className="subtle">No hay redes registradas.</p>}</div></div><p className="subtle">La cuenta de administrador tiene autorización separada; los operadores necesitan una sesión válida y una red autorizada. Las reglas se verifican en la API.</p></section>}
{page==='dashboard'&&<><div className="heading"><div><p className="eyebrow">GESTIÓN DE DESPACHOS</p><h1>Panel de viajes</h1><p className="subtle">Consulte los viajes creados y controle sus reenvíos.</p></div><button className="primary" onClick={()=>setPage('create')}><Plus size={18}/> Crear viaje</button></div><div className="stats"><div className="stat"><BusFront/><span>Viajes en listado</span><strong>{shown.length}</strong></div><div className="stat"><Clock/><span>Estado seleccionado</span><strong>{filter==='ABIERTO'?'Abiertos':'Cerrados'}</strong></div><div className="stat"><Package/><span>Guías</span><strong>Por viaje</strong></div></div><div className="panel"><div className="panelTop"><div className="tabs"><button className={filter==='ABIERTO'?'selected':''} onClick={()=>setFilter('ABIERTO')}>Viajes abiertos</button><button className={filter==='CERRADO'?'selected':''} onClick={()=>setFilter('CERRADO')}>Historial cerrado</button></div><div className="tools"><div className="search"><Search size={17}/><input placeholder="Buscar destino" value={query} onChange={e=>setQuery(e.target.value)}/></div><button className="iconButton" title="Actualizar" onClick={()=>void load()}><RefreshCw size={17}/></button></div></div><div className="tableScroll"><table><thead><tr><th>DESTINO</th><th>SALIDA PROGRAMADA</th><th>ESTADO</th><th></th></tr></thead><tbody>{shown.map(t=><tr key={t.id}><td><strong>{t.destination}</strong>{t.bus_number!=null&&<div className="shiftMeta">Disco {t.bus_number} · {t.shift_source||'Programado'}</div>}</td><td>{fromLocal(t.departure_at)}</td><td><span className={'status '+(t.status==='ABIERTO'?'open':'closed')}>{t.status==='ABIERTO'?'Abierto':'Cerrado'}</span></td><td><button className="smallButton" onClick={()=>void openTrip(t)}>Ver detalle <ChevronRight size={15}/></button></td></tr>)}</tbody></table>{shown.length===0&&<div className="empty"><BusFront size={28}/><strong>Sin viajes en este listado</strong><span>Pruebe otro filtro o cree un nuevo viaje.</span></div>}</div></div></>}
{page==='create'&&<><button className="back" onClick={()=>setPage('dashboard')}><ArrowLeft size={16}/> Volver al panel</button><div className="heading"><div><p className="eyebrow">PROGRAMACIÓN / S45-2026</p><h1>Crear viaje</h1><p className="subtle">Seleccione el turno del cuadro semanal o registre un viaje extraordinario.</p></div></div><div className="twoColumns"><div className="panel formPanel"><h2>Datos del viaje</h2>
<label>Fecha del viaje<input type="date" value={tripDate} onChange={e=>{setTripDate(e.target.value);setShiftId('');setConfirmAmbiguous(false)}}/></label>
<div className="scheduleBanner"><strong>Cuadro S45-2026 · 02 al 08 de noviembre</strong><small>Los horarios se consultan por fecha. La unidad se asigna manualmente.</small>{!isScheduleDate(tripDate)&&<span className="scheduleWarning">Fuera de la semana S45. Solo puede crear un viaje extraordinario.</span>}</div>
<label>Destino<select value={chosen} onChange={e=>{setChosen(e.target.value);setShiftId('');setConfirmAmbiguous(false)}}><option value="">Seleccione un destino</option>{destinations.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
<label>Turno programado<select value={shiftId} disabled={!isScheduleDate(tripDate)} onChange={e=>chooseShift(e.target.value)}><option value="">Viaje extraordinario / hora manual</option>{shiftsForDestination.map(s=><option key={s.id} value={s.id}>{s.destino} · {s.hora} {s.revision?' (VERIFICAR)':''}</option>)}</select></label>
<label>Hora de salida<input type="time" value={tripTime} disabled={!!selectedShift} onChange={e=>setTripTime(e.target.value)}/></label>
<label>Asignar unidad (opcional)<input type="number" min="1" max="999" step="1" placeholder="Número de disco" value={unitNumber} onChange={e=>setUnitNumber(e.target.value)}/></label>
{selectedShift&&<div className="scheduleDetails"><strong>Turno del cuadro oficial</strong><span>Destino: {selectedShift.destino} · Salida: {selectedShift.hora}</span><span>Despacho: {selectedShift.despacho??'No indicado'} · RET.: {selectedShift.retorno??'No indicado'}</span>{selectedShift.revision&&<><span className="scheduleWarning">{selectedShift.revision}</span><label className="scheduleConfirm"><input type="checkbox" checked={confirmAmbiguous} onChange={e=>setConfirmAmbiguous(e.target.checked)}/> Confirmé el horario correcto en el cuadro.</label></>}</div>}
{selectedDestination&&<div className="schedule"><div><CalendarDays size={19}/><span>Salida programada</span></div><strong>{selectedDestination.name} · {tripDate} {tripTime}</strong><small>Hora local de Ecuador continental (UTC−05:00)</small></div>}
<button className="primary wide" disabled={!chosen||!tripDate||!tripTime||busy||!!selectedShift&&!!selectedShift.revision&&!confirmAmbiguous} onClick={()=>void createTrip()}><Plus size={18}/> Crear viaje</button></div><div className="panel notePanel"><div className="noteIcon"><Info/></div><h2>Control de turnos</h2><p>Seleccione la fecha, luego el destino y el turno; se cargará la hora. Usted asignará el número de unidad manualmente, ahora o después.</p><p>El cuadro S45 es válido del 02 al 08 de noviembre de 2026. Para semanas posteriores deberá cargarse el nuevo cuadro.</p><p>El viaje extraordinario permite seleccionar destino, fecha y hora manualmente.</p><p>Un viaje permanece abierto hasta que se cierra manualmente. No se admite duplicar destino, fecha y hora.</p></div></div></>}
{page==='detail'&&detail&&<><button className="back" onClick={()=>{setPage('dashboard');setDetail(null);setEdit(null);setConfirmClose(false)}}><ArrowLeft size={16}/> Volver al panel</button><div className="heading"><div><p className="eyebrow">DETALLE DE VIAJE</p><h1>{detail.trip.destination}</h1><p className="subtle">Salida: {fromLocal(detail.trip.departure_at)}{detail.trip.bus_number!=null?' · Disco '+detail.trip.bus_number:' · Unidad sin asignar'}</p></div><div className="headingActions"><span className={'status '+(detail.trip.status==='ABIERTO'?'open':'closed')}>{detail.trip.status==='ABIERTO'?'Abierto':'Cerrado'}</span>{detail.trip.status==='ABIERTO'&&<button className="secondary" onClick={()=>{setUnitEdit(detail.trip.bus_number?.toString()||'');setEditingUnit(true)}}><BusFront size={16}/> Asignar unidad</button>}{detail.trip.status==='ABIERTO'&&<button className="primary" onClick={openManualGuide}><Plus size={18}/> Agregar guía manualmente</button>}<button className="secondary" onClick={printTrip}><Printer size={18}/> Imprimir</button>{detail.trip.status==='ABIERTO'&&<button className="dangerButton" onClick={()=>setConfirmClose(true)}><LockKeyhole size={17}/> Cerrar viaje</button>}</div></div><div className="stats"><div className="stat"><Package/><span>Guías de reenvío</span><strong>{detail.guides.length}</strong></div><div className="stat"><BusFront/><span>Total de bultos</span><strong>{detail.guides.reduce((n,g)=>n+g.parcels,0)}</strong></div><div className="stat"><CheckCircle2/><span>Guías verificadas</span><strong>{detail.guides.filter(g=>(g.verified_parcels??0)===g.parcels).length}/{detail.guides.length}</strong></div><div className="stat"><MapPin/><span>Destino del viaje</span><strong>{detail.trip.destination}</strong></div></div><div className="panel"><div className="panelTop"><div><h2>Guías asignadas</h2><p className="subtle">Puede modificar los datos de guías en viajes abiertos.</p></div><button className="iconButton" title="Actualizar detalle" onClick={()=>void openTrip(detail.trip)}><RefreshCw size={17}/></button></div><div className="tableScroll"><table><thead><tr><th>NÚMERO DE GUÍA</th><th>ORIGEN</th><th>DESTINO FINAL</th><th>BULTOS</th><th>TRANSBORDO</th><th>VISTO / BULTOS</th><th></th></tr></thead><tbody>{detail.guides.map(g=><tr key={g.id}><td><strong>{g.series?g.series+'-':''}{g.guide_number}</strong></td><td>{g.origin}</td><td>{g.final_destination}</td><td>{g.parcels}</td><td>{g.mismatch_confirmed?<span className="warningTag"><AlertTriangle size={13}/> Confirmado</span>:<span className="subtle">No</span>}</td><td><div className="verifyCell"><label title="Confirmar guía completa"><input type="checkbox" checked={(g.verified_parcels??0)===g.parcels} disabled={detail.trip.status==='CERRADO'||!!verifying} onChange={e=>void setVerified(g,e.target.checked?g.parcels:0)}/> Guía vista</label><div className="verifyCount"><button type="button" disabled={detail.trip.status==='CERRADO'||!!verifying||(g.verified_parcels??0)===0} onClick={()=>void setVerified(g,(g.verified_parcels??0)-1)} aria-label="Restar un bulto">−</button><strong>{g.verified_parcels??0}/{g.parcels}</strong><button type="button" disabled={detail.trip.status==='CERRADO'||!!verifying||(g.verified_parcels??0)>=g.parcels} onClick={()=>void setVerified(g,(g.verified_parcels??0)+1)} aria-label="Sumar un bulto">+</button></div></div></td><td><button className="smallButton" disabled={detail.trip.status==='CERRADO'} onClick={()=>{setEdit(g);setForm(initialGuide(g));setError('')}}><PenLine size={15}/> Editar</button> <button className="smallButton" disabled={detail.trip.status==='CERRADO'||busy} onClick={()=>void openMoveGuide(g)}><BusFront size={15}/> Cambiar encomienda</button></td></tr>)}</tbody></table>{detail.guides.length===0&&<div className="empty"><Package size={28}/><strong>Este viaje todavía no tiene guías.</strong><span>Agregue una guía manualmente desde la web o escanéela desde Android cuando esté disponible.</span></div>}</div></div></>}
</div></main>{movingGuide&&detail?.trip.status==='ABIERTO'&&<div className="overlay"><div className="dialog moveGuideDialog" role="dialog" aria-modal="true" aria-label="Cambiar encomienda de viaje">
<h2>Cambiar encomienda de viaje</h2>
<p><strong>Guía:</strong> {movingGuide.series?movingGuide.series+'-':''}{movingGuide.guide_number}</p>
<p><strong>Viaje actual:</strong> {detail.trip.destination} · {fromLocal(detail.trip.departure_at)}</p>
<label className="moveGuideLabel">Seleccione un viaje ya creado
<select value={moveDestinationTrip} onChange={e=>{setMoveDestinationTrip(e.target.value);setMoveConfirmed(false)}} disabled={busy}>
<option value="">Seleccione el nuevo viaje</option>
{availableTrips.filter(t=>t.id!==detail.trip.id).map(t=><option key={t.id} value={t.id} disabled={t.status!=='ABIERTO'}>{t.destination} · {fromLocal(t.departure_at)}{t.bus_number!=null?' · Disco '+t.bus_number:''}{t.status==='CERRADO'?' (CERRADO)':''}</option>)}
</select></label>
{availableTrips.filter(t=>t.id!==detail.trip.id&&t.status==='ABIERTO').length===0&&<p>No existen otros viajes abiertos. Cree primero el viaje de destino.</p>}
{(()=>{const t=availableTrips.find(x=>x.id===moveDestinationTrip);const different=t&&normalizeCity(t.destination)!==normalizeCity(movingGuide.final_destination);return different?<label className="moveGuideCheck"><input type="checkbox" checked={moveConfirmed} onChange={e=>setMoveConfirmed(e.target.checked)}/> Confirmo transbordo: la guía dice {movingGuide.final_destination} y el viaje seleccionado va a {t?.destination}.</label>:null})()}
<label className="moveGuideLabel">Motivo (opcional)<input maxLength={500} value={moveReason} onChange={e=>setMoveReason(e.target.value)} placeholder="Ej.: cambio de unidad / despacho"/></label>
<p className="moveGuideWarning">Al trasladar, los bultos vistos quedarán pendientes de verificar en el nuevo viaje. La operación queda registrada en auditoría.</p>
{error&&<div className="alert error"><AlertTriangle size={16}/>{error}</div>}
<div className="modalActions"><button className="secondary" disabled={busy} onClick={()=>{setMovingGuide(null);setError('')}}>Cancelar</button><button className="primary" disabled={busy||!moveDestinationTrip||!!(availableTrips.find(t=>t.id===moveDestinationTrip&&normalizeCity(t.destination)!==normalizeCity(movingGuide.final_destination))&&!moveConfirmed)} onClick={()=>void moveGuideToTrip()}>Confirmar cambio de viaje</button></div>
</div></div>}{editingUnit&&detail?.trip.status==='ABIERTO'&&<div className="overlay"><div className="dialog"><h2>Asignar unidad — {detail.trip.destination}</h2><p>Ingrese el número de disco. Puede cambiarlo mientras el viaje permanezca abierto.</p><label>Unidad <input type="number" min="1" max="999" step="1" value={unitEdit} onChange={e=>setUnitEdit(e.target.value)} placeholder="Sin asignar"/></label><div className="modalActions"><button className="secondary" disabled={busy} onClick={()=>setEditingUnit(false)}>Cancelar</button><button className="primary" disabled={busy} onClick={()=>void assignUnit()}>Guardar unidad</button></div></div></div>}{manualOpen&&detail?.trip.status==='ABIERTO'&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setManualOpen(false)}}><div className="modal" role="dialog" aria-modal="true" aria-label="Agregar guía manualmente"><div className="modalHead"><div><p className="eyebrow">REGISTRO MANUAL DE REENVÍO</p><h2>Agregar guía — {detail.trip.destination}</h2><p className="subtle">Salida: {fromLocal(detail.trip.departure_at)}</p></div><button type="button" className="iconButton" disabled={busy} onClick={()=>{setManualOpen(false);setError('')}}><X size={20}/></button></div><form onSubmit={e=>void saveManualGuide(e)}><div className="modalBody">{error&&<div className="alert error"><AlertTriangle size={16}/>{error}</div>}
{queuedGuides.length>0&&<div className="batchQueue"><strong>{queuedGuides.length} guía(s) preparadas para guardar</strong>{queuedGuides.map((g,i)=><div className="batchRow" key={i}><span><b>{i+1}.</b> {g.form.guideNumber} · {g.form.finalDestination} · {g.form.parcels} bulto(s)</span><span><button type="button" disabled={busy} onClick={()=>{setManualForm({...g.form});setConfirmMismatch(g.confirmMismatch);setMismatchReason(g.mismatchReason);setQueuedGuides(p=>p.filter((_,j)=>j!==i))}}>Editar</button><button type="button" disabled={busy} onClick={()=>setQueuedGuides(p=>p.filter((_,j)=>j!==i))}>Quitar</button></span></div>)}</div>}
<div className="alert info"><Info size={17}/> Destino predeterminado: <strong>{detail.trip.destination}</strong>. Puede modificarlo únicamente si hay transbordo.</div><div className="formGrid"><label>Número de guía *<input required={queuedGuides.length===0||!!manualForm.guideNumber.trim()} maxLength={80} value={manualForm.guideNumber} onChange={e=>setManualForm({...manualForm,guideNumber:e.target.value})}/></label><label>Bultos *<input type="number" min="1" max="10000" step="1" required value={manualForm.parcels} onChange={e=>setManualForm({...manualForm,parcels:e.target.value})}/></label><CityPicker label="Origen *" required={queuedGuides.length===0||!!manualForm.guideNumber.trim()} value={manualForm.origin} options={destinations.map(d=>d.name)} onChange={v=>setManualForm(p=>({...p,origin:v}))}/><CityPicker label="Destino final *" required value={manualForm.finalDestination} options={destinations.map(d=>d.name)} onChange={v=>{setManualForm(p=>({...p,finalDestination:v}));setConfirmMismatch(false)}}/></div><label>Destinatario (opcional)<input maxLength={200} value={manualForm.recipient} onChange={e=>setManualForm({...manualForm,recipient:e.target.value})}/></label><label>Observaciones (opcional)<textarea maxLength={500} value={manualForm.note} onChange={e=>setManualForm({...manualForm,note:e.target.value})}/></label>{manualForm.finalDestination.trim()&&manualForm.finalDestination.trim().toUpperCase()!==detail.trip.destination.trim().toUpperCase()&&<div className="manualWarning"><div className="alert warning"><AlertTriangle size={18}/> El destino final no coincide con el viaje {detail.trip.destination}. Confirme que se enviará como transbordo.</div><label className="manualCheck"><input type="checkbox" checked={confirmMismatch} onChange={e=>setConfirmMismatch(e.target.checked)}/> Confirmo que la guía debe enviarse en este viaje.</label><label>Motivo de transbordo (opcional)<input maxLength={500} placeholder="Ej.: Vía Guayaquil hacia Santa Elena" value={mismatchReason} onChange={e=>setMismatchReason(e.target.value)}/></label></div>}</div><div className="modalActions"><button type="button" className="secondary" disabled={busy} onClick={()=>{setManualOpen(false);setError('')}}>Cancelar</button><button type="button" className="secondary" disabled={busy} onClick={enqueueGuide}><Plus size={16}/> Agregar otra guía</button><button type="submit" className="primary" disabled={busy}><Save size={16}/>{busy?'Guardando...':`Guardar todas (${queuedGuides.length+(manualForm.guideNumber.trim()?1:0)})`}</button></div></form></div></div>}{edit&&form&&detail?.trip.status==='ABIERTO'&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget){setEdit(null);setForm(null)}}}><div className="modal"><div className="modalHead"><div><p className="eyebrow">CORRECCIÓN DE REGISTRO</p><h2>Editar guía</h2></div><button className="iconButton" onClick={()=>{setEdit(null);setForm(null)}}><X size={20}/></button></div><div className="modalBody"><div className="alert info"><Eye size={17}/> Los cambios reales quedan registrados en la auditoría del servidor.</div><div className="formGrid"><label>Número de guía<input value={form.guideNumber} onChange={e=>setForm({...form,guideNumber:e.target.value})}/></label><label>Cantidad de bultos<input type="number" min="1" value={form.parcels} onChange={e=>setForm({...form,parcels:e.target.value})}/></label><CityPicker label="Origen" value={form.origin} options={destinations.map(d=>d.name)} onChange={v=>setForm(p=>p?({...p,origin:v}):p)}/><CityPicker label="Destino final" value={form.finalDestination} options={destinations.map(d=>d.name)} onChange={v=>setForm(p=>p?({...p,finalDestination:v}):p)}/></div><label>Destinatario (opcional)<input value={form.recipient} onChange={e=>setForm({...form,recipient:e.target.value})}/></label><label>Observaciones<textarea value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>{form.finalDestination.trim().toUpperCase()!==detail.trip.destination.trim().toUpperCase()&&<div className="alert warning"><AlertTriangle size={18}/> El destino final difiere del destino del viaje. La modificación del destino original requiere reconfirmación en el backend.</div>}</div><div className="modalActions"><button className="secondary" onClick={()=>{setEdit(null);setForm(null)}}>Cancelar</button><button className="primary" disabled={busy} onClick={()=>void saveGuide()}><Save size={16}/> Guardar cambios</button></div></div></div>}{confirmClose&&detail&&<div className="overlay"><div className="dialog"><div className="noteIcon dangerous"><LockKeyhole/></div><h2>¿Cerrar este viaje?</h2><p>Una vez cerrado, no podrá recibir nuevas guías ni permitir ediciones ordinarias. Esta acción no se ejecuta automáticamente al imprimir.</p><p><strong>Verificación:</strong> {detail.guides.filter(g=>(g.verified_parcels??0)<g.parcels).length} guías pendientes. Para cerrar, todas deben tener sus bultos confirmados.</p><div className="modalActions"><button className="secondary" onClick={()=>setConfirmClose(false)}>Cancelar</button><button className="dangerButton" disabled={busy||detail.guides.some(g=>(g.verified_parcels??0)<g.parcels)} onClick={()=>void closeTrip()}>Confirmar cierre</button></div></div></div>}{detail&&page==='detail'&&<div className="printOnly"><h1>COOPERATIVA DE TRANSPORTES ZARACAY</h1><h2>DESPACHO DE REENVÍOS</h2><p>Destino del bus: {detail.trip.destination}</p><p>Salida: {fromLocal(detail.trip.departure_at)}{detail.trip.bus_number!=null?' | Disco '+detail.trip.bus_number:''}</p><p>Estado: {detail.trip.status}</p><hr/><table><thead><tr><th>GUÍA</th><th>ORIGEN</th><th>DESTINO FINAL</th><th>BULTOS</th><th>VISTO</th></tr></thead><tbody>{detail.guides.map(g=><tr key={g.id}><td>{g.guide_number}</td><td>{g.origin}</td><td>{g.final_destination}</td><td>{g.parcels}</td><td>{g.verified_parcels??0}/{g.parcels}</td></tr>)}</tbody></table><hr/><p>Total guías: {detail.guides.length} | Total bultos: {detail.guides.reduce((n,g)=>n+g.parcels,0)}</p><br/><p>Entrega: _____________________</p><p>Recibe: _____________________</p><small>Reporte complementario de reenvíos, independiente de DERPACIF.</small></div>}</div>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
