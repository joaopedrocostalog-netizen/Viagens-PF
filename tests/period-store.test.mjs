import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPeriodStore} from '../api/period-store.mjs';

test('cache opcional não depende de disco',async()=>{
 const store=createPeriodStore();assert.equal(store.enabled,false);
 assert.equal(await store.read('2026-09-01','2026-09-30'),null);
 assert.equal(await store.write('2026-09-01','2026-09-30',{}),false);
});
test('persiste mês completo e não aceita payload sem viagens ou pedidos',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'costalog-month-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const a=createPeriodStore({dir,ttlMs:60000}),b=createPeriodStore({dir,ttlMs:60000});
 const data={viagens:[{rv_id:1}],pedidos:[{pf_id:2}]};
 assert.equal(await a.write('2026-09-01','2026-09-30',data),true);
 assert.deepEqual(await b.read('2026-09-01','2026-09-30'),data);
 assert.equal(await b.read('2026-08-01','2026-08-31'),null);
 assert.equal(await b.write('2026-10-01','2026-10-19',{viagens:[]}),true);
 assert.equal(await b.read('2026-10-01','2026-10-19'),null);
});
