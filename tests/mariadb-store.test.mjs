import test from 'node:test';
import assert from 'node:assert/strict';
import {createMariaDbPeriodStore} from '../api/mariadb-store.mjs';

const env={MARIADB_ENABLED:'true',MARIADB_DATABASE:'empresa',MARIADB_USER:'usuario-teste',MARIADB_PASSWORD:'senha-simulada'};
test('MariaDB é opt-in e não abre conexão sem ser habilitado',async()=>{
 let called=0;
 const store=createMariaDbPeriodStore({env:{},connect:()=>{called++;}});
 assert.equal(store.enabled,false);assert.equal(await store.read('2026-10-01','2026-10-19'),null);
 assert.equal(await store.write('2026-10-01','2026-10-19',{viagens:[],pedidos:[]}),false);
 assert.equal(called,0);
});
test('MariaDB acessa somente tabela com prefixo do portal e usa parâmetros',async()=>{
 const sql=[],connection={execute:async(q,values)=>{sql.push({q,values});return q.startsWith('SELECT')?[[{payload_json:JSON.stringify({viagens:[{rv_id:1}],pedidos:[]}),expires_at:new Date(Date.now()+60000)}]]:[{affectedRows:1}];}};
 const store=createMariaDbPeriodStore({env,connect:async()=>connection});
 assert.deepEqual(await store.read('2026-10-01','2026-10-19'),{viagens:[{rv_id:1}],pedidos:[]});
 assert.equal(await store.write('2026-10-01','2026-10-19',{viagens:[],pedidos:[]}),true);
 assert.equal(sql.length,2);
 for(const x of sql){assert.match(x.q,/viagens_pf_period_cache/);assert(!/DROP|ALTER|DELETE/i.test(x.q));}
 assert.deepEqual(sql[0].values,['2026-10-01','2026-10-19']);
});
test('MariaDB falha sem interromper consultas DSS',async()=>{
 const store=createMariaDbPeriodStore({env,connect:async()=>{throw Object.assign(Error('offline'),{code:'ECONNREFUSED'});}});
 assert.equal(await store.read('2026-10-01','2026-10-19'),null);
 assert.equal(await store.write('2026-10-01','2026-10-19',{viagens:[],pedidos:[]}),false);
});
