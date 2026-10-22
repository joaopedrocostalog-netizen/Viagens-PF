import test from 'node:test';
import assert from 'node:assert/strict';
import {taskBelongsToUser,assignmentForOwner,operationalToday,taskDueBucket,updateTask,alertKey} from '../src/workflow.mjs';
import {createAlertPager} from '../src/operational.mjs';
import {buildTripChecklist,renderTripChecklist} from '../src/rv-checklist.mjs';
import {filterOperationalData} from '../src/filtering.mjs';
import {buildOperationalReport} from '../src/access-ui.mjs';
import {renderMyTasksSummary,renderAlertsHub} from '../src/intelligence-ui.mjs';
const user={username:'joao.pedro',displayName:'João Pedro'};

test('Responsável é comparado por conta; nomes antigos exigem correspondência completa',()=>{
 assert(taskBelongsToUser({owner:' JOAO   PEDRO '},user));
 assert(taskBelongsToUser({owner:'joao.pedro'},user));
 assert(!taskBelongsToUser({owner:'João'},user));
 assert(!taskBelongsToUser({owner:'João Pedro Silva'},user));
 assert(!taskBelongsToUser({owner:'João Pedro',ownerUsername:'outro.usuario'},user));
 assert(taskBelongsToUser({owner:'Nome alterado',ownerUsername:'joao.pedro'},user));
 assert(!taskBelongsToUser({owner:'visitante'},null));
 assert.equal(assignmentForOwner('João Pedro',user),user.username);
 const old={owner:'Outra Pessoa',ownerUsername:'outra.pessoa'};
 assert.equal(assignmentForOwner('Outra Pessoa',user,old),'outra.pessoa');
 assert.equal(assignmentForOwner('Novo Responsável',user,old),'');
 assert.equal(assignmentForOwner('João Pedro',user,{owner:'João Pedro',ownerUsername:'outro.usuario'}),'outro.usuario','Salvar sem trocar o responsável não deve tomar uma pendência de um homônimo');
 assert.equal(assignmentForOwner('João Pedro',user,{owner:'João Pedro',ownerUsername:'outro.usuario'},true),user.username);
});
test('Associação da conta é persistida e permanece ao salvar com cliente anterior',()=>{
 const input={owner:'João Pedro',ownerUsername:user.username,due:'2026-10-22',status:'aberta',priority:'high',comment:'',revision:0};
 const first=updateTask(null,input,'supervisor');
 assert.equal(first.ownerUsername,user.username);
 const {ownerUsername,...legacy}=input;
 const updated=updateTask(first,{...legacy,revision:1,status:'tratamento'},'operador');
 assert.equal(updated.ownerUsername,user.username);
 const reassigned=updateTask(updated,{...legacy,owner:'Outra Pessoa',revision:2},'operador');
 assert.equal(reassigned.ownerUsername,'');
 assert.throws(()=>updateTask(null,{...input,ownerUsername:'../conta'},'operador'),/Conta responsável inválida/);
});
test('Prazos usam São Paulo; resolvidas não são classificadas como vencidas',()=>{
 assert.equal(operationalToday(new Date('2026-10-23T02:59:59Z')),'2026-10-22');
 assert.equal(operationalToday(new Date('2026-10-23T03:00:00Z')),'2026-10-23');
 for(const [due,bucket] of [['2026-10-21','vencidas'],['2026-10-22','hoje'],['2026-10-23','proximas'],['','sem_prazo']])assert.equal(taskDueBucket({due,status:'aberta'},'2026-10-22'),bucket);
 assert.equal(taskDueBucket({due:'2026-10-21',status:'resolvida'},'2026-10-22'),'resolvidas');
});
test('Minhas pendências filtra responsável e prazos, pagina e só materializa a página aberta',()=>{
 const reads=[],data={viagens:[],pedidos:Array.from({length:70},(_,i)=>({id:'crc~'+i,pedidoNumero:'PF-'+i,data:'2026-10-01',get cliente(){reads.push(i);return 'Cliente '+i;}}))};
 const tasks=Object.fromEntries(data.pedidos.map((p,i)=>['cte_pendente:ctes:'+p.id,{owner:'João Pedro',ownerUsername:i<60?user.username:'outro.usuario',due:i%4===0?'2026-10-21':i%4===1?'2026-10-22':i%4===2?'2026-10-23':'',status:i<5?'resolvida':'aberta',priority:'high'}]));
 const pager=createAlertPager(data,{asOf:'2026-10-22'}),options={tasks,user,scope:'mine',status:'ativas'};
 const stats=pager.getPage({...options,includeRows:false});
 assert.equal(stats.total,55);assert.equal(stats.mineTotal,55);assert.equal(Object.values(stats.dueCounts).reduce((a,b)=>a+b,0),55);assert.deepEqual(reads,[]);
 const first=pager.getPage(options);assert.equal(first.rows.length,25);assert.deepEqual(reads,Array.from({length:25},(_,i)=>i+5));
 reads.length=0;const last=pager.getPage({...options,page:3});assert.equal(last.rows.length,5);assert.deepEqual(reads,[55,56,57,58,59]);
 const due=pager.getPage({...options,due:'hoje'});assert(due.rows.every(row=>row.due==='2026-10-22'));assert.equal(due.total,stats.dueCounts.hoje);
 const state={role:'operacional',company:'costalog',permissions:{financeiro:false},tasks,user,taskIndexLoaded:true,mode:'demo',alertScope:'mine',alertStatus:'ativas',alertDue:'todos'};
 const report=buildOperationalReport('pendencias',data,state);assert.equal(report.rows.length,stats.total);assert(report.rows.every(row=>Number(row.recordId.split('~')[1])>=5&&Number(row.recordId.split('~')[1])<60));
 const changed={...tasks,[alertKey(first.rows[0])]:{...tasks[alertKey(first.rows[0])],status:'resolvida'}};
 assert.equal(pager.getPage({...options,tasks:changed,includeRows:false}).total,54);
});
test('Resumo pessoal não gera descrições de outras páginas nem apresenta falha como zero pendências',()=>{
 const data={viagens:[],pedidos:[{id:'p1',data:'2026-10-01',get cliente(){throw Error('Resumo não deve materializar o cartão');}}]};
 const state={user,role:'operacional',mode:'demo',permissions:{financeiro:false},taskIndexLoaded:true,tasks:{'cte_pendente:ctes:p1':{ownerUsername:user.username,owner:'João Pedro',status:'aberta',due:'',priority:'high'}}};
 assert(renderMyTasksSummary(data,state).includes('data-mine-due="sem_prazo"'));
 assert.equal(renderMyTasksSummary(data,{...state,user:null}),'');
 const failed=renderMyTasksSummary(data,{...state,taskIndexLoaded:false,taskIndexError:'Serviço indisponível'});
 assert(failed.includes('Serviço indisponível'));assert(!failed.includes('<strong>0</strong>'));
 const hub=renderAlertsHub(data,{...state,taskIndexLoaded:false,alertScope:'mine',taskIndexError:'Serviço indisponível'});
 assert(hub.includes('Serviço indisponível'));assert(!hub.includes('Nenhuma pendência'));
});
const trip={id:'crc~1',rvId:'1',numero:'100',empresa:'CRC'};
const orders=[{id:'crc~p1',viagemId:trip.id,pedidoNumero:'PF1',cteNumero:'1000',entregaConcluida:true,comprovanteEntrega:true},{id:'crc~p2',viagemId:trip.id,pedidoNumero:'PF2',cteNumero:'0',entregaConcluida:false,comprovanteEntrega:null}];
test('Checklist diferencia registros pendentes, campos ausentes e confirmação completa',()=>{
 const data={viagens:[trip],pedidos:orders,ctes:[],sources:{pedidos:true}};
 const result=buildTripChecklist(trip,data);
 assert.deepEqual(result.items.map(item=>item.state),['done','pending','pending','unknown']);
 assert.equal(result.done,1);assert.equal(result.pending,2);assert.equal(result.unknown,1);
 const missing=buildTripChecklist(trip,{...data,sources:{pedidos:false}});assert(missing.items.every(item=>item.state==='unknown'));
 const empty=buildTripChecklist(trip,{...data,pedidos:[]});assert.deepEqual(empty.items.map(item=>item.state),['pending','unknown','unknown','unknown']);
 const done=buildTripChecklist(trip,{...data,pedidos:orders.map(p=>({...p,cteNumero:'123',entregaConcluida:true,comprovanteEntrega:true}))});assert.equal(done.done,4);
 const html=renderTripChecklist(trip,data);assert(html.includes('Checklist de encerramento da RV'));assert(html.includes('data-checklist-open="entregas:crc~1"'));assert(!html.includes('data-action="encerrar'));
});
test('Checklist não lê dados de PF de outra RV e não confunde número de PF com número de CT-e',()=>{
 const foreign={id:'comex~p1',viagemId:'comex~1',get comprovanteEntrega(){throw Error('PF de outra RV');}};
 const source={pedidos:[{...orders[0],cteNumero:''},foreign],ctes:[{id:orders[0].id,viagemId:trip.id,numero:'999',isCte:false}],sources:{pedidos:true}};
 assert.equal(buildTripChecklist(trip,source).items.find(item=>item.id==='ctes').state,'pending');
 assert.equal(buildTripChecklist(trip,{...source,ctes:[{...source.ctes[0],isCte:true}]}).items.find(item=>item.id==='ctes').state,'done');
});
test('Atalhos do checklist restringem documentos e exportação por ID completo da RV',()=>{
 const source={viagens:[trip,{...trip,id:'comex~1',empresa:'Comex'}],pedidos:[...orders,{id:'comex~p1',viagemId:'comex~1',pedidoNumero:'OUTRO PF'}],ctes:[],mdfes:[{id:'m1',viagemId:trip.id},{id:'m2',viagemId:'comex~1'}],ocorrencias:[{id:'o1',empresa:'CRC',rv_id:1},{id:'o2',empresa:'Comex',rv_id:1},{id:'o3',rv_id:1}]};
 const filtered=filterOperationalData(source,{tripFocus:trip.id,view:'ctes'});
 assert.deepEqual(filtered.pedidos.map(p=>p.id),orders.map(p=>p.id));assert.deepEqual(filtered.viagens.map(p=>p.id),[trip.id]);assert.deepEqual(filtered.mdfes.map(p=>p.id),['m1']);assert.deepEqual(filtered.ocorrencias.map(p=>p.id),['o1']);
 const exported=buildOperationalReport('pedidos',filtered,{role:'operacional'});assert(!JSON.stringify(exported).includes('OUTRO PF'));
 assert.equal(filterOperationalData(source,{tripFocus:'não-existe'}).pedidos.length,0);
});
