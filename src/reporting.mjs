/* COSTALOG - relatórios Excel reais sem bibliotecas/CDNs externos. */
const TE=new TextEncoder();
const xml=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function u16(n){return [n&255,(n>>8)&255];}
function u32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];}
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=(c&1)?0xEDB88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(b){let c=0xffffffff;for(const n of b)c=crcTable[(c^n)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function zipStore(files){
 const chunks=[],dir=[];let offset=0;
 for(const [name,content] of files){
  const filename=TE.encode(name),data=TE.encode(content),crc=crc32(data);
  const header=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(filename.length),...u16(0)]);
  chunks.push(header,filename,data);
  dir.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(filename.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]),filename);
  offset+=header.length+filename.length+data.length;
 }
 const dirSize=dir.reduce((n,x)=>n+x.length,0);
 const end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(dirSize),...u32(offset),...u16(0)]);
 const total=offset+dirSize+end.length;const out=new Uint8Array(total);let i=0;
 for(const c of [...chunks,...dir,end]){out.set(c,i);i+=c.length;}return out;
}
function colName(n){let result='';for(let x=n+1;x>0;x=Math.floor((x-1)/26))result=String.fromCharCode(65+(x-1)%26)+result;return result;}
function valXml(v,r,c,style){
 const ref=colName(c)+r;
 if(typeof v==='number'&&Number.isFinite(v))return '<c r="'+ref+'" s="'+(style||0)+'"><v>'+v+'</v></c>';
 if(typeof v==='boolean')return '<c r="'+ref+'" t="b"><v>'+(v?1:0)+'</v></c>';
 return '<c r="'+ref+'" t="inlineStr" s="'+(style||0)+'"><is><t xml:space="preserve">'+xml(v===null||v===undefined?'':v)+'</t></is></c>';
}
function tableXml(report,meta,tabName){
 const cols=report.columns||[],data=report.rows||[];
 const header=[(meta.company||'costalog').toUpperCase()+' · '+report.title],context=['Período: '+String(meta.from||'—')+' a '+String(meta.to||'—')+' · Origem: '+(meta.mode==='live'?'DSS':'DEMONSTRAÇÃO')];
 const rows=[header,context,[],cols.map(c=>c[1]),...data.map(item=>cols.map(c=>item[c[0]]??''))];
 const sheetRows=rows.map((arr,i)=>'<row r="'+(i+1)+'"'+(i===0?' ht="30" customHeight="1"':'')+'>'+arr.map((v,j)=>valXml(v,i+1,j,i===0?1:i===3?2:((typeof v==='number'&&Number.isFinite(v))?3:0))).join('')+'</row>').join('');
 const maxcol=colName(Math.max(cols.length-1,0)),maxrow=Math.max(4,rows.length);
 const widths=cols.map(([key,title])=>Math.min(43,Math.max(13,title.length+4,key==='cliente'||key==='name'||key==='detail'?32:13)));
 const colsXml='<cols>'+cols.map((_,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+widths[i]+'" customWidth="1"/>').join('')+'</cols>';
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
 '<sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+
 colsXml+'<sheetData>'+sheetRows+'</sheetData>'+
 '<autoFilter ref="A4:'+maxcol+maxrow+'"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>'+
 '</worksheet>';
}
export function buildXlsx(reports,meta={}){
 const items=Array.isArray(reports)?reports:[reports];
 if(items.length<1||items.length>20)throw Error('Quantidade inválida de abas');
 const names=items.map((r,i)=>String(r.title||'Relatório '+(i+1)).replace(/[:\\/?*\[\]]/g,'').slice(0,29)||'Relatorio');
 const files=[
 ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+items.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'],
 ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
 ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+names.map((n,i)=>'<sheet name="'+xml(n)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'],
 ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+items.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(items.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
 ['xl/styles.xml','<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="17"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF171719"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE00016"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
 ...items.map((r,i)=>['xl/worksheets/sheet'+(i+1)+'.xml',tableXml(r,meta,names[i])])
 ];
 return zipStore(files);
}
export function downloadFile(bytes,filename,type){
 const blob=new Blob([bytes],{type});const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
export function downloadXlsx(reports,meta={},filename='costalog-relatorio.xlsx'){
 const xlsx=buildXlsx(reports,meta);downloadFile(xlsx,filename,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
export function printReport(reports,meta={}){
 const rs=Array.isArray(reports)?reports:[reports];
 const w=window.open('','_blank');
 if(!w)throw Error('O navegador bloqueou a janela de impressão. Habilite pop-ups para este portal.');
 const sections=rs.map(r=>'<section><h2>'+xml(r.title)+'</h2><table><thead><tr>'+r.columns.map(c=>'<th>'+xml(c[1])+'</th>').join('')+'</tr></thead><tbody>'+r.rows.map(row=>'<tr>'+r.columns.map(c=>'<td>'+xml(row[c[0]]===null||row[c[0]]===undefined?'—':row[c[0]])+'</td>').join('')+'</tr>').join('')+'</tbody></table></section>').join('');
 w.document.open();w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>COSTALOG - Relatório</title><style>body{font:11px Arial;color:#151515;margin:25px}header{border-bottom:3px solid #de0016;padding-bottom:15px;margin-bottom:20px}h1{margin:0;font-size:24px}h2{font-size:16px;margin:26px 0 10px}.meta{color:#555;margin-top:8px}table{border-collapse:collapse;width:100%;font-size:9px;word-break:break-word}th{background:#222;color:white;text-align:left}td,th{border:1px solid #bbb;padding:5px}tr:nth-child(even){background:#f4f4f4}section{break-before:page}section:first-of-type{break-before:auto}@page{size:A4 landscape;margin:14mm}small{color:#666}</style></head><body><header><h1>'+xml((meta.company||'costalog').toUpperCase())+' · Relatórios operacionais</h1><div class="meta">Período: '+xml(meta.from||'—')+' a '+xml(meta.to||'—')+' · Origem: '+(meta.mode==='live'?'DSS':'DEMONSTRAÇÃO')+'</div><small>Consulta operacional de viagens, RVs e pedidos de frete.</small></header>'+sections+'</body></html>');w.document.close();w.focus();setTimeout(()=>w.print(),500);
}
