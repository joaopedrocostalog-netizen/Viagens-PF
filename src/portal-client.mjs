import {renderComparison} from './intelligence-ui.mjs';
const fields=['preferenceStorage','view','from','to','legalEntity','customer','vehicle','serviceType','status','rvStage','search','filter','sortKey','sortDir','page','detailPage','timelinePage','routeSelected','driverSelected','reportSelected','reportMulti','hiddenColumns','reportColumnOrder','reportTemplates','templateSelected','reportFormat','presets','metricLayout','showMetricOptions','tableSort','alertPriority','alertKind','alertStatus','alertOwner','alertScope','alertDue','alertGrouping','alertGroup','tripFocus','dayDate','dayProgramsOpen','programPage','filtersOpen','technicalOpen','drilldown','selected','compareCurrentFrom','compareCurrentTo','comparePreviousFrom','comparePreviousTo'];
const prefFields=['metricLayout','hiddenColumns','presets','reportTemplates','tableSort','reportColumnOrder','reportFormat'];
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createPortalClient(state,render){
 let view=null,viewKey='',pendingKey='',seq=0,controller,detail=null,detailKey='',detailPending='',detailController,jobId='',syncGeneration=0,syncToken='',syncCompany='';
 let prefGeneration=0,prefRevision=0,prefReady=false,prefJSON='',prefTimer,prefWriting=false,prefBlocked=false,prefPromise=null;
 let comparison=null;
 const queryState=()=>Object.fromEntries(fields.filter(k=>state[k]!==undefined).map(k=>[k,state[k]]));
 const identity=()=>state.token+'|'+state.company;
 const key=()=>JSON.stringify({snapshot:state.remoteSnapshot,company:state.company,state:queryState(),comparison});
 const active=()=>state.serverMode&&!!state.token;
 async function request(path,{body,method='POST',signal,token=state.token,company=state.company}={}){
  const response=await fetch(state.apiUrl.replace(/\/$/,'')+path+(path.includes('?')?'&':'?')+'company='+company,{method,credentials:'omit',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)});
  const value=await response.json();if(!response.ok)throw Object.assign(Error(response.status===401?'Sessão expirada. Entre novamente no portal.':value.error||'Não foi possível consultar.'),{status:response.status});return value;
 }
 const inRange=()=>state.loadedRange&&state.from>=state.loadedRange.from&&state.to<=state.loadedRange.to;
 function observe(){
  if(!active())return;
  savePreferencesSoon();
  if((!state.remoteSnapshot||!inRange())&&!(state.view==='comparativos'&&comparison))return;
  if(state.pendingRecord){state.selected=state.pendingRecord;state.pendingRecord='';}
  const k=key();
  if(viewKey!==k&&pendingKey!==k){
   controller?.abort();controller=new AbortController();const signal=controller.signal,id=++seq;pendingKey=k;state.remoteError='';
   Promise.resolve().then(async()=>{
    try{
     const cmp=state.view==='comparativos'&&comparison&&comparison.currentRange.from===state.compareCurrentFrom&&comparison.currentRange.to===state.compareCurrentTo&&comparison.previousRange.from===state.comparePreviousFrom&&comparison.previousRange.to===state.comparePreviousTo;
     const body={snapshot:state.remoteSnapshot||comparison?.current,state:queryState(),...(cmp?{currentSnapshot:comparison.current,previousSnapshot:comparison.previous}:{})};
     const result=await request('/api/portal/'+(state.view==='painel'?'metrics':cmp?'compare':'view'),{body,signal});
     if(id!==seq||signal.aborted||k!==key())return;
     view=result;if(result.page)state.page=result.page;if(result.detailPage)state.detailPage=result.detailPage;if(result.programPage)state.programPage=result.programPage;
     state.visibleAlerts=result.visibleAlerts||[];state.remoteColumns=result.reportColumns||[];viewKey=key();
    }catch(error){if(id===seq&&!signal.aborted){state.remoteError=error.message;view=null;viewKey=k;}}
    finally{if(id===seq){pendingKey='';if(!state.taskSelected)render();}}
   });
  }
  if(state.selected){
   const dk=JSON.stringify([state.remoteSnapshot,state.company,state.from,state.to,state.legalEntity,state.selected,state.timelinePage]);
   if(detailKey!==dk&&detailPending!==dk){
    detailController?.abort();detailController=new AbortController();const signal=detailController.signal;detailPending=dk;detail=null;
    Promise.resolve().then(async()=>{try{const result=await request('/api/portal/detail',{body:{snapshot:state.remoteSnapshot,state:queryState()},signal});if(!signal.aborted&&detailPending===dk){detail=result.html;detailKey=dk;}}catch(error){if(!signal.aborted){detail='<div class="overlay"><aside class="drawer"><p role="alert">'+h(error.message)+'</p><button class="btn" data-action="close">Fechar</button></aside></div>';detailKey=dk;}}finally{if(!signal.aborted){detailPending='';if(!state.taskSelected)render();}}});
   }
  }else{detailController?.abort();detail=null;detailKey='';detailPending='';}
 }
 function contents(){
  if(state.remoteError)return '<p class="ins-inline-error" role="alert">'+h(state.remoteError)+'</p><button class="btn" data-action="retry-page">Tentar novamente</button>';
  if(state.view==='comparativos'&&!state.remoteSnapshot&&!comparison)return renderComparison({viagens:[],pedidos:[],ctes:[],mdfes:[],sources:{}},state);
  if((!state.remoteSnapshot||!inRange())&&!(state.view==='comparativos'&&comparison))return '<div class="info-strip">Atualize os dados da DSS para consultar este período.</div>';
  if(viewKey!==key())return '<div class="info-strip" role="status">Carregando a página solicitada…</div><button class="btn btn-sm" data-action="cancel-page">Cancelar consulta</button>';
  return view?.html||'';
 }
 function progress(){
  const j=state.syncProgress;if(!state.loading&&!state.comparisonLoading)return '';
  const labels={pending:'Aguardando',running:'Consultando',done:'Concluído',reused:'Reutilizado',unavailable:'Indisponível',disabled:'Não configurado',skipped:'Não consultado'};
  return '<div class="sync-progress" role="status"><div><strong>'+h(state.loadingProgress||'Preparando consulta…')+'</strong><button class="btn btn-sm" data-action="cancel-query">Cancelar consulta</button></div>'+(j?'<progress value="'+j.completed+'" max="'+Math.max(1,j.total)+'" aria-label="Etapas concluídas"></progress><ul>'+j.steps.map(s=>'<li><span>'+h(s.label)+(s.period?' · '+h(s.period):'')+'</span><b>'+h(labels[s.status]||s.status)+'</b></li>').join('')+'</ul>':'')+'</div>';
 }
 function paintProgress(){const target=document.getElementById('syncProgress');if(target)target.innerHTML=progress();}
 async function runJob(range,{cached=false,generation=syncGeneration,token=state.token,company=state.company}={}){
  const current=()=>generation===syncGeneration&&state.token===token;
  const job=await request('/api/portal/sync',{body:{...range,refresh:cached?'cached':'recent'},token,company});
  if(!current()){await request('/api/portal/sync',{method:'PATCH',body:{id:job.id},token,company}).catch(()=>{});throw new DOMException('Cancelado','AbortError');}
  jobId=job.id;syncToken=token;syncCompany=company;
  const started=Date.now();let value=job;
  while(current()&&value.status==='running'){
   state.syncProgress=value;state.loadingProgress='Consulta: '+value.completed+' de '+value.total+' etapas concluídas';paintProgress();
   await new Promise(resolve=>setTimeout(resolve,1000));
   if(!current())throw new DOMException('Cancelado','AbortError');
   value=await request('/api/portal/sync?id='+encodeURIComponent(job.id),{method:'GET',token,company});
   if(Date.now()-started>12*60000){await request('/api/portal/sync',{method:'PATCH',body:{id:job.id},token,company});throw Error('A consulta excedeu o tempo limite e foi cancelada.');}
  }
  jobId='';if(!current()||value.status==='cancelled')throw new DOMException('Cancelado','AbortError');
  if(value.status!=='complete')throw Error(value.error||'Consulta incompleta.');return value.snapshot;
 }
 async function synchronize(){
  const generation=++syncGeneration,token=state.token,company=state.company,range={from:state.from,to:state.to};
  state.loading=true;state.loadingProgress='Preparando consulta…';state.error='';state.queryNotice='';render();
  try{const snapshot=await runJob(range,{generation,token,company});if(generation!==syncGeneration||token!==state.token)return;state.remoteSnapshot=snapshot;state.loadedRange=range;state.lastSync=new Date().toISOString();state.page=1;state.selected=null;state.dataset={viagens:[],pedidos:[],ctes:[],mdfes:[],ocorrencias:[],sources:{}};viewKey='';comparison=null;}
  catch(error){if(generation===syncGeneration){state.error=error.name==='AbortError'?'':error.message;state.queryNotice=error.name==='AbortError'?'Consulta cancelada. A última consulta completa foi mantida.':'';}}
  finally{if(generation===syncGeneration){state.loading=false;state.loadingProgress='';state.syncProgress=null;render();}}
 }
 async function compare(){
  const generation=++syncGeneration,token=state.token,company=state.company;
  const ranges={current:{from:state.compareCurrentFrom,to:state.compareCurrentTo},previous:{from:state.comparePreviousFrom,to:state.comparePreviousTo}};
  state.comparisonLoading=true;state.comparisonError='';render();
  try{
   const get=range=>state.loadedRange&&range.from>=state.loadedRange.from&&range.to<=state.loadedRange.to?Promise.resolve(state.remoteSnapshot):runJob(range,{cached:true,generation,token,company});
   const a=await get(ranges.current),b=await get(ranges.previous);
   if(generation!==syncGeneration||token!==state.token||company!==state.company)return;
   comparison={current:a,previous:b,currentRange:ranges.current,previousRange:ranges.previous};viewKey='';
  }catch(error){if(generation===syncGeneration){state.comparisonError=error.message;state.queryNotice=error.name==='AbortError'?'Consulta cancelada.':error.message;}}
  finally{if(generation===syncGeneration){state.comparisonLoading=false;state.loadingProgress='';state.syncProgress=null;render();}}
 }
 function cancel(){const id=jobId,token=syncToken,company=syncCompany;++syncGeneration;jobId='';if(id)request('/api/portal/sync',{method:'PATCH',body:{id},token,company}).catch(()=>{});state.loading=false;state.comparisonLoading=false;state.loadingProgress='';state.syncProgress=null;state.queryNotice='Consulta cancelada. A última consulta completa foi mantida.';render();}
 async function loadPreferences(){
  const generation=++prefGeneration,id=identity();state.preferenceStorage='';prefReady=false;prefBlocked=false;clearTimeout(prefTimer);state.preferencesError='';
  Object.assign(state,{metricLayout:null,hiddenColumns:{},presets:{},reportTemplates:{},tableSort:{},reportColumnOrder:{},reportFormat:'xlsx'});
  try{
   const saved=await request('/api/preferences',{method:'GET'});if(generation!==prefGeneration||id!==identity())return;
   state.preferenceStorage=saved.storage==='browser'?'browser':'server';
   const values=state.preferenceStorage==='browser'?JSON.parse(localStorage.getItem(browserPreferencesKey())||'{}'):saved.values;
   if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Preferências inválidas.');
   Object.assign(state,Object.fromEntries(prefFields.filter(key=>Object.hasOwn(values,key)).map(key=>[key,values[key]])));
   prefRevision=saved.revision;prefReady=true;prefJSON=JSON.stringify(preferences());
  }
  catch(error){if(generation===prefGeneration&&id===identity())state.preferencesError='Preferências da conta indisponíveis: '+error.message;}
  finally{if(generation===prefGeneration&&id===identity())render();}
 }
 const browserPreferencesKey=()=>['viagens_pf_preferences_v2',encodeURIComponent(state.apiUrl),state.company,encodeURIComponent(state.user?.username||'')].join(':');
 const preferences=()=>Object.fromEntries(prefFields.map(k=>[k,state[k]??(k==='reportFormat'?'xlsx':k==='metricLayout'?null:{})]));
 async function flushPreferences(){
  clearTimeout(prefTimer);
  if(prefWriting){await prefPromise;return flushPreferences();}
  if(!prefReady||!active())return true;
  if(prefBlocked)return false;
  const values=preferences(),sent=JSON.stringify(values);if(sent===prefJSON)return true;
  if(state.preferenceStorage==='browser'){
   try{localStorage.setItem(browserPreferencesKey(),sent);prefJSON=sent;state.preferencesError='';return true;}
   catch{prefBlocked=true;state.preferencesError='Preferências não salvas: o navegador recusou o armazenamento local.';render();return false;}
  }
  const generation=prefGeneration,id=identity(),token=state.token,company=state.company;prefWriting=true;
  prefPromise=(async()=>{
   try{const result=await request('/api/preferences',{method:'PATCH',body:{revision:prefRevision,values},token,company,signal:AbortSignal.timeout(15000)});if(generation!==prefGeneration||id!==identity())return true;prefRevision=result.revision;prefJSON=sent;state.preferencesError='';return true;}
   catch(error){if(generation===prefGeneration&&id===identity()){prefBlocked=true;state.preferencesError='Preferências não salvas: '+error.message;render();}return false;}
   finally{prefWriting=false;}
  })();
  return prefPromise;
 }
 function savePreferencesSoon(){
  if(!prefReady||prefBlocked||prefWriting||!active()||JSON.stringify(preferences())===prefJSON)return;
  clearTimeout(prefTimer);prefTimer=setTimeout(()=>flushPreferences().then(ok=>{if(ok)savePreferencesSoon();}),600);
 }

 return {active,observe,contents,progress,synchronize,compare,cancel,loadPreferences,flushPreferences,
  response:()=>viewKey===key()?view:null,drawer:()=>detail||'<div class="overlay"><aside class="drawer"><p>Carregando registro…</p><button class="btn" data-action="close">Fechar</button></aside></div>',
  invalidate(){viewKey='';pendingKey='';controller?.abort();seq++;},
  cancelPage(){controller?.abort();seq++;pendingKey='';viewKey=key();view={html:'<p class="help">Consulta da página cancelada.</p><button class="btn" data-action="retry-page">Carregar página</button>'};render();},
  reset(){controller?.abort();detailController?.abort();seq++;++prefGeneration;prefReady=false;prefBlocked=false;clearTimeout(prefTimer);view=null;viewKey='';pendingKey='';detail=null;detailKey='';comparison=null;const id=jobId,token=syncToken,company=syncCompany;++syncGeneration;jobId='';if(id)request('/api/portal/sync',{method:'PATCH',body:{id},token,company}).catch(()=>{});},
  async importMdfes(rows){const result=await request('/api/portal/import',{body:{snapshot:state.remoteSnapshot,rows,state:queryState()}});viewKey='';render();return result.count;},
  async export(type,multi=false){return (await request('/api/portal/export',{body:{snapshot:state.remoteSnapshot,type,multi,state:queryState()}})).models;}
 };
}
