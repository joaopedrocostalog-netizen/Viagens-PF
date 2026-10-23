const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Strict calendar validation. Keep ISO at every API/storage boundary. */
export function parseEditableDate(value){
 const s=String(value??'').trim();if(!s)return '';
 let m=s.match(/^(\d{2})\/?(\d{2})\/?(\d{4})$/),iso=m?`${m[3]}-${m[2]}-${m[1]}`:s;
 if(!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(iso))return null;
 const date=new Date(iso+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:null;
}
export const dateText=iso=>/^\d{4}-\d{2}-\d{2}$/.test(iso||'')?iso.slice(8)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4):'';
const edits=new Map();
export function resetDateControls(ids){if(ids)for(const id of ids)edits.delete(id);else edits.clear();}
export const hasDateErrors=ids=>ids.some(id=>edits.get(id)?.error);
export function renderDateControl(id,value,{label='Data',max='',optional=false}={}){
 const edit=edits.get(id),text=edit?.text??dateText(value),error=edit?.error||'';
 return '<div class="date-control"><input id="'+h(id)+'" class="control date-text" type="text" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="dd/mm/aaaa" data-edit-date="'+h(id)+'" '+(optional?'data-date-optional="true"':'')+(max?' data-date-max="'+h(max)+'"':'')+' value="'+h(text)+'" aria-label="'+h(label)+'" aria-describedby="'+h(id)+'Error" aria-invalid="'+!!error+'">'+
 '<button type="button" class="date-calendar-button" data-open-calendar="'+h(id)+'" aria-label="Abrir calendário: '+h(label)+'" title="Abrir calendário"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/></svg></button>'+
 '<input id="'+h(id)+'Calendar" class="date-picker-native" type="date" data-date-picker="'+h(id)+'" value="'+h(value)+'" '+(max?'max="'+h(max)+'"':'')+' tabindex="-1" aria-hidden="true"><span id="'+h(id)+'Error" class="date-error" role="alert" '+(!error?'hidden':'')+'>'+h(error)+'</span></div>';
}
/** Incomplete typing is retained across unrelated renders; it never changes the selected period. */
export function editDateControl(input,{max='',optional=false,showError=true}={}){
 const iso=parseEditableDate(input.value),empty=iso==='';
 const error=iso===null||empty&&!optional?'Informe uma data válida em dd/mm/aaaa.':max&&iso>max?'A data não pode ser posterior a '+dateText(max)+'.':'';
 const text=!error?dateText(iso):String(input.value??'');
 edits.set(input.id,{text,error});
 input.setCustomValidity?.(error);input.setAttribute?.('aria-invalid',String(!!error));
 const notice=globalThis.document?.getElementById(input.id+'Error');if(notice){notice.textContent=showError?error:'';notice.hidden=!showError||!error;}
 if(!error)input.value=text;
 return {valid:!error,iso:!error?iso:null,error};
}
export function openDateCalendar(id){
 const picker=globalThis.document?.getElementById(id+'Calendar');if(!picker)return;
 try{if(typeof picker.showPicker==='function'){picker.showPicker();return;}}catch{}
 // Older browsers can still operate the native control with keyboard or pointer.
 picker.classList?.add('date-picker-fallback');picker.removeAttribute?.('aria-hidden');picker.tabIndex=0;picker.focus?.();picker.click?.();
}
