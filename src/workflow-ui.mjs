import {renderDateControl} from './date-controls.mjs';
import {TASK_STATUSES,TASK_PRIORITIES} from './workflow.mjs';
const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dt=value=>value?new Date(value).toLocaleString('pt-BR'):'—';
export function renderTaskDrawer(state){
 const item=state.taskSelected;if(!item)return '';
 const task=state.taskDetail||{owner:'',due:'',priority:item.level,status:'aberta',comments:[],history:[]};
 const options=(values,selected)=>Object.entries(values).map(([key,label])=>'<option value="'+key+'" '+(key===selected?'selected':'')+'>'+h(label)+'</option>').join('');
 return '<div class="overlay"><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="taskTitle"><div class="drawer-top"><h2 id="taskTitle">Tratar pendência</h2><button class="btn btn-sm" data-action="close-task">Fechar</button></div>'+
 '<h3>'+h(item.title)+'</h3><p class="help">'+h(item.detail)+'</p><p class="help">Este acompanhamento pertence ao portal. A situação oficial da DSS permanece disponível no registro.</p>'+
 (state.workflowStorage?.durable===false?'<p class="help" role="status">Os tratamentos ficam em armazenamento temporário neste ambiente e podem ser perdidos em reinícios ou publicações.</p>':'')+
 (state.taskLoading?'<p role="status">Carregando tratamento…</p>':'')+
 (state.taskError?'<p class="ins-inline-error" role="alert">'+h(state.taskError)+'</p>':'')+
 '<form id="taskForm"><label class="filter">Responsável<input id="taskOwner" class="control" maxlength="100" value="'+h(task.owner)+'" autocomplete="off"></label><small id="taskOwnerAccount" class="help">'+h(task.ownerUsername?'Conta: '+task.ownerUsername:'Responsável informado por nome; nenhuma conta vinculada.')+'</small>'+(state.user?.username?'<button class="btn btn-sm" type="button" data-action="assign-task-to-me" '+(state.taskLoading||state.taskSaving||state.taskUnavailable?'disabled':'')+'>Atribuir a mim</button>':'')+
 '<div class="filter"><label for="taskDue">Prazo</label>'+renderDateControl('taskDue',task.due,{label:'Prazo',optional:true})+'</div>'+
 '<label class="filter">Prioridade<select id="taskPriority" class="control">'+options(TASK_PRIORITIES,task.priority)+'</select></label>'+
 '<label class="filter">Situação<select id="taskStatus" class="control">'+options(TASK_STATUSES,task.status)+'</select></label>'+
 '<label class="filter">Adicionar comentário<textarea id="taskComment" class="control" rows="3" maxlength="2000" placeholder="Descreva a providência tomada"></textarea></label>'+
 '<button class="btn btn-red" type="submit" '+(state.taskLoading||state.taskSaving||state.taskUnavailable?'disabled':'')+'>'+(state.taskSaving?'Salvando…':'Salvar tratamento')+'</button></form>'+
 '<h3 class="drawer-section">Comentários</h3>'+(task.comments?.length?task.comments.slice(-25).reverse().map(c=>'<article class="task-comment"><small>'+h(c.author)+' · '+h(dt(c.at))+'</small><p>'+h(c.text)+'</p></article>').join(''):'<p class="help">Nenhum comentário registrado.</p>')+
 (task.comments?.length>25?'<p class="help">Exibindo os 25 comentários mais recentes. O histórico completo é preservado no servidor.</p>':'')+
 '<h3 class="drawer-section">Últimas alterações</h3>'+(task.history||[]).slice(-10).reverse().map(entry=>'<p class="help">'+h(dt(entry.at))+' · '+h(entry.author)+' · '+h(Object.keys(entry.changes||{}).map(key=>({owner:'responsável',due:'prazo',priority:'prioridade',status:'situação',ownerUsername:'conta responsável'}[key]||key)).join(', ')||'comentário')+'</p>').join('')+'</aside></div>';
}
