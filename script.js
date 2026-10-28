(()=>{'use strict';
// Solo la chiave PUBBLICABILE (sb_publishable_...). Non inserire mai sb_secret_ qui.
const SUPABASE_URL='https://mmfxfgxaqbergrxrvqjf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_Pv9OAEUm8E6QhMdM72CuzQ_ji7WzVX5';
const SESSION_KEY='esfo_supabase_session_v1';
const $=id=>document.getElementById(id);
let session=null;
let loadSerial=0;
const configReady=()=>SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_');
const apiHeaders=(token)=>({apikey:SUPABASE_PUBLISHABLE_KEY,...(token?{Authorization:'Bearer '+token}:{})});
const isExpired=(data)=>!data?.access_token || !data?.refresh_token || !data?.expires_at || data.expires_at <= Math.floor(Date.now()/1000)+30;
function saveSession(data){session=data;sessionStorage.setItem(SESSION_KEY,JSON.stringify(data));}
function clearSession(){session=null;sessionStorage.removeItem(SESSION_KEY);}
function loginMessage(message){$('loginError').textContent=message;$('loginError').classList.toggle('hidden',!message);}
function showLogin(message=''){$('appShell').hidden=true;$('authScreen').hidden=false;rows=[];loadSerial++;loginMessage(message);$('loginPassword').value='';}
function showApp(){$('authScreen').hidden=true;$('appShell').hidden=false;loginMessage('');}
async function authRequest(grant,body){const res=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type='+grant,{method:'POST',headers:{...apiHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});const result=await res.json().catch(()=>({}));if(!res.ok)throw new Error(result.error_description||result.msg||result.message||'Credenziali non valide');return result;}
async function token(){if(!session)throw new Error('Sessione non disponibile');if(!isExpired(session))return session.access_token;try{const result=await authRequest('refresh_token',{refresh_token:session.refresh_token});saveSession({...result,expires_at:Math.floor(Date.now()/1000)+(result.expires_in||3600)});return session.access_token;}catch(e){clearSession();showLogin('Sessione scaduta. Accedi nuovamente.');throw new Error('Sessione scaduta');}}
async function startSession(authData){saveSession({...authData,expires_at:Math.floor(Date.now()/1000)+(authData.expires_in||3600)});showApp();await load();}
$('loginForm').addEventListener('submit',async event=>{event.preventDefault();loginMessage('');if(!configReady()){loginMessage('Configurazione mancante: inserire la Publishable Key nel file index.html.');return;}const btn=$('loginButton');btn.disabled=true;btn.textContent='Accesso in corso…';try{const auth=await authRequest('password',{email:$('loginEmail').value.trim(),password:$('loginPassword').value});await startSession(auth);}catch(e){if(!$('authScreen').hidden)loginMessage('Accesso non riuscito: '+e.message);}finally{btn.disabled=false;btn.textContent='Accedi agli orari';}});
$('logout').addEventListener('click',async()=>{const old=session?.access_token;clearSession();showLogin();if(old){try{await fetch(SUPABASE_URL+'/auth/v1/logout',{method:'POST',headers:apiHeaders(old)});}catch(_){/* sessione locale già revocata */}}});
const fmtDate=new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'});
const fmtMonth=new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric',timeZone:'UTC'});
const days=['Lun','Mar','Mer','Gio','Ven','Sab'];
let rows=[],lastReport=[],lastHeaders=[];
const clean=v=>String(v??'').trim();
const coll=new Intl.Collator('it',{numeric:true,sensitivity:'base'});
const sorted=arr=>Array.from(new Set(arr.filter(Boolean))).sort(coll.compare);
const opt=(select,values,allLabel,preferred)=>{let old=preferred??select.value;select.replaceChildren();if(allLabel!==null)select.add(new Option(allLabel,''));values.forEach(v=>select.add(new Option(pretty(select.dataset.field,v),v)));select.value=[...select.options].some(o=>o.value===old)?old:(allLabel!==null?'':(values[0]||''));};
// Abbreviazioni solo di presentazione: i dati originali del JSON restano invariati.
function siteLabel(value){
  const parts=clean(value).split(',').map(x=>x.trim()).filter(Boolean);
  if(!parts.length)return clean(value);
  // Mantiene via e civico, elimina CAP, comune e provincia.
  let street=parts[0].replace(/^VIA\s+/i,'V. ').replace(/^VIALE\s+/i,'V.le ').replace(/^PIAZZA\s+/i,'P.zza ').replace(/^PIAZZALE\s+/i,'P.le ').replace(/^CORSO\s+/i,'C.so ').replace(/^CONTRADA\s+/i,'C.da ');
  const civic=parts[1] && !/\b\d{5}\b/.test(parts[1]) ? ', '+parts[1] : '';
  return street+civic;
}
function moduleLabel(value){return clean(value).replace(/\bLABORATORIO\b/gi,'LAB.').replace(/ALTERNANZA\s+SIMULATA\s*[-–—]\s*/gi,'A.S./');}
function pretty(field,value){return field==='site'?siteLabel(value):field==='module'?moduleLabel(value):value;}
const html=s=>clean(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dkey=d=>d.toISOString().slice(0,10);
function parseDate(s){const m=clean(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!m)return null;const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));return d.getUTCFullYear()===+m[3]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[1]?d:null;}
function weekStart(d){const n=(d.getUTCDay()+6)%7;const x=new Date(d);x.setUTCDate(x.getUTCDate()-n);return dkey(x);}
function addDays(d,n){let x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x;}
function minutes(s){let m=clean(s).match(/^(\d{1,2}):(\d{2})/);return m?+m[1]*60+(+m[2]):NaN;}
function displayHours(n){return (Math.round(n*100)/100).toLocaleString('it-IT',{maximumFractionDigits:2});}
function labelWeek(k){return fmtDate.format(addDays(k,0))+' — '+fmtDate.format(addDays(k,6));}
function has(r,id,key){return !$(id).value||r[key]===$(id).value;}
function parseRow(raw){const o={};Object.entries(raw).forEach(([key,val])=>{o[key.trim().toUpperCase()]=clean(val)});const date=parseDate(o.DATAOR);if(!date)return null;const start=minutes(o.INIZIO||o.ORARIO.split('-')[0]);const end=minutes(o.FINE||o.ORARIO.split('-')[1]);const hours=Number.isFinite(start)&&Number.isFinite(end)&&end>start?(end-start)/60:0;
return {site:o.SEDE||'Sede non specificata',class:o.CLASSE_SEZIONE||[o.CLASSE,o.IDCORSO].filter(Boolean).join(' ')||'Classe non specificata',module:o.MODULO||'Modulo non specificato',teacher:o.FORMATORE||'Formatore non specificato',sub:o.SUPPLITO||'',date:dkey(date),week:weekStart(date),month:dkey(date).slice(0,7),start,end,slot:o.ORARIO||(o.INIZIO+' - '+o.FINE),hours};}
async function load(){
  const current=++loadSerial;
  try{
    $('status').textContent='Caricamento dati…';$('error').classList.add('hidden');
    const jwt=await token();
    // L'autorizzazione viene verificata in Supabase tramite RLS sulla tabella orari.
    const res=await fetch(SUPABASE_URL+'/rest/v1/orari?id=eq.1&select=dati',{
      headers:{...apiHeaders(jwt),Accept:'application/json'},cache:'no-store'
    });
    if(current!==loadSerial)return;
    if(res.status===401){clearSession();showLogin('Sessione non valida. Accedi nuovamente.');return;}
    if(!res.ok)throw new Error('Lettura Supabase non riuscita (HTTP '+res.status+')');
    const records=await res.json();
    if(!Array.isArray(records)||!records.length)throw new Error('Accesso agli orari non autorizzato o archivio vuoto. Controlla il profilo attivo e la policy RLS.');
    const data=records[0].dati;
    if(!Array.isArray(data))throw new Error('Il campo dati non contiene un array JSON');
    const valid=data.map(parseRow).filter(Boolean);
    if(!valid.length)throw new Error('Nessuna riga con DATAOR valida');
    rows=valid;initialize();$('status').textContent=rows.length.toLocaleString('it-IT')+' fasce caricate';
  }catch(e){
    if(current!==loadSerial || $('appShell').hidden)return;
    $('status').textContent='Errore caricamento';
    $('error').textContent=e.message+' · Verifica account, permessi e connessione.';
    $('error').classList.remove('hidden');
  }
}
function initialize(){const weeks=sorted(rows.map(r=>r.week));const months=sorted(rows.map(r=>r.month));const today=new Date(),current=weekStart(new Date(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate())));let nearest=weeks.filter(w=>w<=current).at(-1)||weeks[0];opt($('week'),weeks.map(x=>x),null,$('week').value||nearest);[...$('week').options].forEach(o=>o.textContent=labelWeek(o.value));let monthNow=String(today.getFullYear())+'-'+String(today.getMonth()+1).padStart(2,'0');opt($('month'),months,null,$('month').value||(months.includes(monthNow)?monthNow:months.at(-1)));[...$('month').options].forEach(o=>o.textContent=fmtMonth.format(new Date(o.value+'-01T00:00:00Z')));populateWeekFilters();populateMonthFilters();renderWeek();renderMonth();}
$('wsite').dataset.field='site';$('msite').dataset.field='site';$('mmodule').dataset.field='module';
function populateWeekFilters(){const w=$('week').value;const wd=rows.filter(r=>r.week===w);opt($('wsite'),sorted(wd.map(r=>r.site)),'Tutte le sedi');const base=wd.filter(r=>has(r,'wsite','site'));opt($('wclass'),sorted(base.map(r=>r.class)),'Tutte le classi');}
function populateMonthFilters(){const m=$('month').value;const ids=[['msite','site','Tutte le sedi'],['mclass','class','Tutte le classi'],['mmodule','module','Tutti i moduli'],['mteacher','teacher','Tutti i formatori']];for(const [id,key,label] of ids){const others=rows.filter(r=>r.month===m&&ids.every(([otherId,otherKey])=>otherId===id||has(r,otherId,otherKey)));opt($(id),sorted(others.map(r=>r[key])),label);}}
const iconModule='<svg class="detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>';
const iconTeacher='<svg class="detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
function renderWeek(){const selected=rows.filter(r=>r.week===$('week').value&&has(r,'wsite','site')&&has(r,'wclass','class'));const dateKey=$('week').value;if(!dateKey)return;const dates=Array.from({length:6},(_,i)=>dkey(addDays(dateKey,i)));const slots=sorted(selected.map(r=>Number.isFinite(r.start)?r.start+'|'+r.end:r.slot));$('weekTitle').textContent='Settimana '+labelWeek(dateKey);$('weekSummary').textContent=selected.length+' fasce · '+displayHours(selected.reduce((a,r)=>a+r.hours,0))+' ore';if(!slots.length){$('weekGrid').innerHTML='<div class="empty">Nessuna lezione per i filtri selezionati.</div>';return;}
let out='<table class="timetable"><thead><tr><th>Orario</th>'+dates.map((d,i)=>'<th>'+days[i]+'<br>'+html(fmtDate.format(new Date(d+'T00:00:00Z')))+'</th>').join('')+'</tr></thead><tbody>';
for(const slot of slots){const inSlot=selected.filter(r=>(Number.isFinite(r.start)?r.start+'|'+r.end:r.slot)===slot);const first=inSlot[0];out+='<tr><td class="time">'+html(first.slot)+'</td>';for(const d of dates){let hits=inSlot.filter(r=>r.date===d).sort((a,b)=>coll.compare(a.class,b.class));out+='<td>'+(!hits.length?'<div class="empty">—</div>':hits.map(r=>'<div class="event"><div class="mod">'+iconModule+html(moduleLabel(r.module))+'</div><div class="teacher">'+iconTeacher+html(r.teacher)+'</div>'+(r.sub?'<div class="extra">Supplito: '+html(r.sub)+'</div>':'')+($('wclass').value?'':'<div class="site">'+html(r.class)+'</div>')+($('wsite').value?'':'<div class="site">'+html(siteLabel(r.site))+'</div>')+'</div>').join(''))+'</td>';}out+='</tr>';}out+='</tbody></table>';$('weekGrid').innerHTML=out;}
function monthLength(month){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate();}
function rangeDays(month){const len=monthLength(month);return Array.from({length:len},(_,i)=>String(i+1));}
function dayNum(dateKey){return String(Number(dateKey.slice(8,10)));}
function timeLabel(r){return clean(r.slot||((Number.isFinite(r.start)?String(Math.floor(r.start/60)).padStart(2,'0')+':'+String(r.start%60).padStart(2,'0'):'')+' - '+(Number.isFinite(r.end)?String(Math.floor(r.end/60)).padStart(2,'0')+':'+String(r.end%60).padStart(2,'0'):'')));}
function renderMonth(){const selected=rows.filter(r=>r.month===$('month').value&&has(r,'msite','site')&&has(r,'mclass','class')&&has(r,'mmodule','module')&&has(r,'mteacher','teacher'));const month=$('month').value;$('monthTitle').textContent='Griglia mensile · '+(month?fmtMonth.format(new Date(month+'-01T00:00:00Z')):'');$('statHours').textContent=displayHours(selected.reduce((a,r)=>a+r.hours,0));$('statClasses').textContent=new Set(selected.map(r=>r.site+'|'+r.class)).size;$('statModules').textContent=new Set(selected.map(r=>r.module)).size;$('statTeachers').textContent=new Set(selected.map(r=>r.teacher)).size;
if(!month){$('monthGrid').innerHTML='<div class="empty">Nessun mese disponibile.</div>';return;}
const daysInMonth=rangeDays(month);
const groups=new Map();
for(const r of selected){const values=[r.site,r.class,r.teacher,r.module];const k=JSON.stringify(values);if(!groups.has(k))groups.set(k,{values,days:new Map(),hours:0,fasce:0});const g=groups.get(k);const d=dayNum(r.date);if(!g.days.has(d))g.days.set(d,[]);g.days.get(d).push(r);g.hours+=r.hours;g.fasce++;}
const report=[...groups.values()].sort((a,b)=>{for(let i=0;i<a.values.length;i++){const c=coll.compare(a.values[i],b.values[i]);if(c)return c;}return 0;});
lastHeaders=['Sede','Classe / corso','Formatore','Modulo',...daysInMonth];
lastReport=report.map(g=>{const row=[siteLabel(g.values[0]),g.values[1],g.values[2],moduleLabel(g.values[3])];for(const d of daysInMonth){const items=(g.days.get(d)||[]).sort((a,b)=>a.start-b.start);row.push(items.length?items.map(x=>timeLabel(x)).join(' | '):'');}return row;});
$('rowCount').textContent=report.length+' righe · '+selected.length+' lezioni';
if(!report.length){$('monthGrid').innerHTML='<div class="empty">Nessun dato per i filtri selezionati.</div>';return;}
let out='<div class="legend"><span><i class="marker on">•</i> giornata con lezione</span><span><i class="marker off">•</i> nessuna lezione</span></div><table class="matrix"><thead><tr>'+
'<th class="stick head-stick col-site">Sede</th><th class="stick head-stick s2 col-class">Classe / corso</th><th class="stick head-stick s3 col-teacher">Formatore</th><th class="stick head-stick s4 col-module">Modulo</th>'+
daysInMonth.map(d=>'<th class="day"><span class="daynum">'+d+'</span></th>').join('')+'</tr></thead><tbody>';
for(const g of report){out+='<tr>'+'<td class="stick sticky-wrap site-cell col-site">'+html(siteLabel(g.values[0]))+'</td>'+'<td class="stick sticky-wrap s2 class-cell col-class">'+html(g.values[1])+'</td>'+'<td class="stick sticky-wrap s3 teacher-cell col-teacher">'+html(g.values[2])+'</td>'+'<td class="stick sticky-wrap s4 module-cell col-module">'+html(moduleLabel(g.values[3]))+'</td>';
for(const d of daysInMonth){const items=(g.days.get(d)||[]).sort((a,b)=>a.start-b.start);if(items.length){const tip=items.map(x=>fmtDate.format(new Date(x.date+'T00:00:00Z'))+' · '+timeLabel(x)+(x.sub?' · Supplito: '+x.sub:'')) .join('\n');out+='<td class="day" title="'+html(tip)+'"><span class="marker on">•</span></td>';}else{out+='<td class="day"><span class="marker off">&nbsp;</span></td>';}}
out+='</tr>';}
out+='</tbody></table>';$('monthGrid').innerHTML=out;}
function changeTab(tab){const isWeek=tab==='week';$('viewWeek').classList.toggle('hidden',!isWeek);$('viewMonth').classList.toggle('hidden',isWeek);$('tabWeek').setAttribute('aria-selected',String(isWeek));$('tabMonth').setAttribute('aria-selected',String(!isWeek));}
$('tabWeek').addEventListener('click',()=>changeTab('week'));$('tabMonth').addEventListener('click',()=>changeTab('month'));
$('week').addEventListener('change',()=>{populateWeekFilters();renderWeek()});$('wsite').addEventListener('change',()=>{populateWeekFilters();renderWeek()});$('wclass').addEventListener('change',renderWeek);
for(const id of ['month','msite','mclass','mmodule','mteacher'])$(id).addEventListener('change',()=>{populateMonthFilters();renderMonth()});
function moveWeek(delta){const w=$('week');const i=w.selectedIndex+delta;if(i>=0&&i<w.options.length){w.selectedIndex=i;populateWeekFilters();renderWeek();}}
$('prevWeek').addEventListener('click',()=>moveWeek(-1));$('nextWeek').addEventListener('click',()=>moveWeek(1));$('reset').addEventListener('click',()=>{for(const id of ['msite','mclass','mmodule','mteacher'])$(id).value='';populateMonthFilters();renderMonth()});$('weekPrint').addEventListener('click',()=>print());$('monthPrint').addEventListener('click',()=>print());$('reloadW').addEventListener('click',load);$('reloadM').addEventListener('click',load);
$('csv').addEventListener('click',()=>{const escape=v=>'\"'+String(v).replaceAll('\"','\"\"')+'\"';const csv='\uFEFF'+[lastHeaders,...lastReport].map(r=>r.map(escape).join(';')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='griglia_orari_'+$('month').value+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)});
(async()=>{
  if(!configReady()){showLogin('Prima di pubblicare: configura SUPABASE_PUBLISHABLE_KEY in index.html.');return;}
  try{const old=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');if(old?.refresh_token){session=old;await token();showApp();await load();}else{showLogin();}}
  catch(_){clearSession();showLogin();}
})();
})();