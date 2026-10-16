/** Índices operacionais DSS; somente registros normalizados, sem consultas diretas nem valores inventados. */
const str=v=>String(v??'').trim();
const norm=v=>str(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
const known=v=>typeof v==='number'&&Number.isFinite(v);
const sum=(rows,field)=>rows.reduce((t,r)=>t+(known(r[field])?r[field]:0),0);
const distinct=xs=>new Set(xs.filter(Boolean)).size;
const order=(a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pt-BR');
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(str(s))&&!Number.isNaN(Date.parse(s+'T12:00:00Z'));
export const SEARCH_GROUPS=Object.freeze(['viagens','pedidos','mdfes','clientes']);
export function unifiedSearch(data,term,{financial=false,limit=40}={}){
 const q=norm(term);
 if(q.length<2)return [];
 const groups=[
  ['viagens',data.viagens||[],v=>[v.numero,v.rvId,v.id,v.cliente,v.placa,v.container,v.nroMdf,v.origem,v.destino,v.status,v.motoristaId],v=>'RV '+str(v.numero)+' · '+str(v.cliente),v=>[v.placa,v.origem+' → '+v.destino].filter(Boolean).join(' · ')],
  ['pedidos',data.pedidos||[],v=>[v.pedidoNumero,v.cteNumero,v.numero,v.id,v.cliente,v.placa,v.container,v.rvReferencia,v.nroMdf,v.motoristaNome],v=>'PF '+str(v.pedidoNumero||v.id)+(v.cteNumero?' · CT-e '+v.cteNumero:''),v=>[v.cliente,v.placa].filter(Boolean).join(' · ')],
  ['mdfes',data.mdfes||[],v=>[v.numero,v.id,v.placa],v=>'Referência MDF-e '+str(v.numero),v=>str(v.placa||'Referência documental (situação fiscal não validada)')]
 ];
 const results=[];
 for(const [group,rows,keys,title,subtitle] of groups){
  for(const row of rows){
   if(keys(row).some(v=>norm(v).includes(q))){
    results.push({group,id:str(row.id),title:title(row),subtitle:subtitle(row),date:str(row.data)});
    if(results.length>=limit)return results;
   }
  }
 }
 // Clientes: somente quando o perfil possui autorização para consultar esta área.
 if(financial){
  const clients=new Map();
  for(const row of [...(data.viagens||[]),...(data.pedidos||[])]){
   const name=str(row.cliente);if(name&&norm(name).includes(q))clients.set(norm(name),name);
  }
  for(const name of clients.values())results.push({group:'clientes',id:name,title:'Cliente · '+name,subtitle:'Abrir perfil e histórico',date:''});
 }
 return results.slice(0,limit);
}
export function customerProfiles(data,{financial=false}={}){
 const map=new Map();
 const target=name=>{
  const display=str(name)||'Não informado',key=norm(display);
  if(!map.has(key))map.set(key,{id:display,name:display,viagens:[],pedidos:[],fretesConhecidos:0,fretesValor:null});
  return map.get(key);
 };
 for(const v of data.viagens||[])target(v.cliente).viagens.push(v);
 for(const p of data.pedidos||[])target(p.cliente).pedidos.push(p);
 return [...map.values()].map(c=>{
  const numeric=c.pedidos.filter(p=>known(p.valor));
  const monthly=new Map();
  for(const v of c.viagens){
   if(validDate(v.data)){const key=v.data.slice(0,7),m=monthly.get(key)||{month:key,viagens:0,pedidos:0,fretes:0,fretesKnown:0};m.viagens++;monthly.set(key,m);}
  }
  for(const p of c.pedidos){
   if(validDate(p.data)){
    const key=p.data.slice(0,7),m=monthly.get(key)||{month:key,viagens:0,pedidos:0,fretes:0,fretesKnown:0};
    m.pedidos++;if(financial&&known(p.valor)){m.fretes+=p.valor;m.fretesKnown++;}monthly.set(key,m);
   }
  }
  const total=financial&&numeric.length?numeric.reduce((s,p)=>s+p.valor,0):null;
  return {...c,tripCount:c.viagens.length,orderCount:c.pedidos.length,cteCount:c.pedidos.filter(p=>p.isCte).length,
   routes:routeStats(c.viagens),monthly:[...monthly.values()].sort((a,b)=>a.month.localeCompare(b.month)),
   fretesConhecidos:financial?numeric.length:0,fretesValor:total,
   ticket:financial&&numeric.length?total/numeric.length:null,
   vehicleCount:distinct(c.viagens.map(v=>v.placa)),lastDate:[...c.viagens,...c.pedidos].map(x=>x.data).filter(Boolean).sort().at(-1)||''};
 }).sort((a,b)=>b.tripCount+b.orderCount-a.tripCount-a.orderCount);
}
export function routeStats(trips,orders=[]){
 const map=new Map();
 for(const v of trips||[]){
  const from=str(v.origem)||'Origem não informada',to=str(v.destino)||'Destino não informado',name=from+' → '+to;
  const k=norm(name),r=map.get(k)||{name,count:0,kmKnown:0,km:0,vehicleIds:new Set(),driverIds:new Set()};
  r.count++;
  if(known(v.kmRodados)){r.kmKnown++;r.km+=v.kmRodados;}
  if(v.placa)r.vehicleIds.add(v.placa);
  if(v.motoristaId)r.driverIds.add(str(v.motoristaId));
  map.set(k,r);
 }
 return [...map.values()].map(r=>({name:r.name,count:r.count,km:r.kmKnown?r.km:null,kmKnown:r.kmKnown,vehicles:r.vehicleIds.size,drivers:r.driverIds.size,kmPerTrip:r.kmKnown?r.km/r.kmKnown:null})).sort(order);
}
export function driverStats(trips,orders){
 const drivers=new Map();
 const get=(id,name)=>{
  const key=str(id)||('nome:'+norm(name||'Não informado'));
  if(!drivers.has(key))drivers.set(key,{id:key,name:str(name)||('Motorista ID '+str(id||'não informado')),trips:[],orders:[],kmKnown:0,km:0});
  const d=drivers.get(key);if(str(name))d.name=str(name);return d;
 };
 // Use os IDs do DSS para evitar unir motoristas homônimos.
 for(const p of orders||[])if(p.motoristaId||p.motoristaNome)get(p.motoristaId,p.motoristaNome).orders.push(p);
 for(const v of trips||[])if(v.motoristaId){
  const d=get(v.motoristaId,'');d.trips.push(v);
  if(known(v.kmRodados)){d.kmKnown++;d.km+=v.kmRodados;}
 }
 return [...drivers.values()].map(d=>({id:d.id,name:d.name,trips:d.trips.length,orders:d.orders.length,ctes:d.orders.filter(p=>p.isCte).length,
  km:d.kmKnown?d.km:null,kmKnown:d.kmKnown,kmPerTrip:d.kmKnown?d.km/d.kmKnown:null,routes:distinct(d.trips.map(v=>str(v.origem)+' → '+str(v.destino)))}))
 .sort((a,b)=>b.trips-a.trips||b.orders-a.orders||a.name.localeCompare(b.name,'pt-BR'));
}
const utc=s=>new Date(s+'T12:00:00Z');
const iso=d=>d.toISOString().slice(0,10);
const shift=(d,days)=>{const out=new Date(d.getTime());out.setUTCDate(out.getUTCDate()+days);return out;};
export function comparisonWindows(anchor,interval='mensal'){
 if(!validDate(anchor))throw Error('Data de referência inválida.');
 const now=utc(anchor);let start,end,previousFrom,previousTo;
 if(interval==='diario'){
  start=now;end=now;previousFrom=shift(now,-1);previousTo=previousFrom;
 }else if(interval==='semanal'){
  const monday=shift(now,-((now.getUTCDay()+6)%7));
  start=monday;end=shift(monday,6);previousFrom=shift(monday,-7);previousTo=shift(monday,-1);
 }else if(interval==='mensal'){
  start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1,12));
  end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,0,12));
  previousFrom=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1,12));
  previousTo=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),0,12));
 }else throw Error('Periodicidade inválida.');
 return {interval,current:{from:iso(start),to:iso(end)},previous:{from:iso(previousFrom),to:iso(previousTo)}};
}
export function subsetPeriod(data,range){
 const between=v=>str(v.data)>=range.from&&str(v.data)<=range.to;
 const v=(data?.viagens||[]).filter(between),p=(data?.pedidos||[]).filter(between);
 return {viagens:v,pedidos:p,ctes:p.filter(x=>x.isCte),mdfes:(data?.mdfes||[]).filter(between),allViagens:data?.allViagens||data?.viagens||[],sources:data?.sources||{}};
}
function metric(rows,field){
 const knownRows=rows.filter(x=>known(x[field]));return {value:knownRows.length?sum(knownRows,field):null,coverage:knownRows.length,total:rows.length};
}
export function periodMetrics(data,{financial=false}={}){
 const v=data.viagens||[],p=data.pedidos||[];
 const a=[{key:'viagens',label:'Viagens',value:v.length,unit:'count'},{key:'pedidos',label:'Pedidos de frete',value:p.length,unit:'count'},
 {key:'ctes',label:'CT-e numerados',value:p.filter(x=>x.isCte).length,unit:'count'}];
 const kms=metric(v,'kmRodados');
 a.push({key:'km',label:'KM informados',value:kms.value,coverage:kms.coverage,total:kms.total,unit:'km'});
 if(financial){
  const value=metric(p,'valor');a.push({key:'fretes',label:'Fretes informados',value:value.value,coverage:value.coverage,total:value.total,unit:'money'});
 }
 return a;
}
export function comparePeriodMetrics(current,previous,{financial=false}={}){
 const c=periodMetrics(current,{financial}),p=periodMetrics(previous,{financial});
 return c.map((x,i)=>{
  const old=p[i].value,delta=x.value!==null&&old!==null?x.value-old:null;
  return {...x,previous:old,delta,pct:delta!==null&&old!==0?100*delta/old:null,previousCoverage:p[i].coverage??null};
 });
}
export const DASH_METRICS=Object.freeze([
 {id:'viagens',label:'Viagens',financial:false},
 {id:'andamento',label:'Em andamento',financial:false},
 {id:'concluidas',label:'Concluídas',financial:false},
 {id:'pedidos',label:'Pedidos de frete',financial:false},
 {id:'ctes',label:'CT-e numerados',financial:false},
 {id:'sem_cte',label:'Pedidos sem CT-e',financial:false},
 {id:'sem_rv',label:'CT-e sem RV encontrada',financial:false},
 {id:'entregas',label:'Entregas sem comprovante',financial:false},
 {id:'km',label:'KM realizados',financial:false},
 {id:'fretes',label:'Total de fretes informados',financial:true},
 {id:'abastecimento',label:'Abastecimento informado',financial:true},
 {id:'fatura',label:'Liberados sem número da fatura',financial:true}
]);
export function dashboardMetrics(data,{financial=false}={}){
 const trips=data.viagens||[],orders=data.pedidos||[];
 const count=(fn)=>trips.filter(fn).length;
 const statuses=x=>norm(x.status);
 const completed=count(v=>/encerr|conclu|finaliz|entreg/.test(statuses(v)));
 const ongoing=count(v=>/andamento|inici|transito|rodando|em rota/.test(statuses(v))&&!/encerr|conclu|finaliz/.test(statuses(v)));
 const km=metric(trips,'kmRodados'),freight=metric(orders,'valor'),fuel=metric(trips,'abastecimento');
 const map={
 viagens:trips.length,andamento:ongoing,concluidas:completed,pedidos:orders.length,ctes:orders.filter(p=>p.isCte).length,
 sem_cte:orders.filter(p=>!p.isCte).length,sem_rv:orders.filter(p=>p.isCte&&!p.viagemId).length,
 entregas:orders.filter(p=>p.entregaConcluida===true&&p.comprovanteEntrega===false).length,km:km.value,
 fretes:freight.value,abastecimento:fuel.value,
 fatura:orders.filter(p=>p.liberadoFaturamento===true&&!p.numeroFatura).length
 };
 return DASH_METRICS.filter(m=>financial||!m.financial).map(m=>({...m,value:map[m.id],
  coverage:({km,fretes:freight,abastecimento:fuel})[m.id]?.coverage??null}));
}
export const DEFAULT_METRICS=['viagens','andamento','concluidas','pedidos','ctes','sem_rv','entregas','km'];
export function normalizedLayout(saved,{financial=false}={}){
 const allowed=new Set(DASH_METRICS.filter(m=>financial||!m.financial).map(m=>m.id));
 if(Array.isArray(saved))return [...new Set(saved.filter(x=>allowed.has(x)))];
 return DEFAULT_METRICS.filter(x=>allowed.has(x));
}
export function reorderMetric(layout,id,direction,{financial=false}={}){
 const arr=normalizedLayout(layout,{financial}),i=arr.indexOf(id),j=i+direction;
 if(i<0||j<0||j>=arr.length)return arr;
 [arr[i],arr[j]]=[arr[j],arr[i]];return arr;
}
export function alertsForRole(alerts,financial){
 return (alerts||[]).filter(a=>financial||a.type!=='sem_fatura');
}
