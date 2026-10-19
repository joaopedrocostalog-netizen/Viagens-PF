import test from 'node:test';import assert from 'node:assert/strict';
import {monthWindows,mergeDssRows} from '../api/dss-periods.mjs';
test('divide dois meses em janelas completas sem lacunas',()=>{
 assert.deepEqual(monthWindows('2026-09-15','2026-10-19'),[{from:'2026-09-15',to:'2026-09-30'},{from:'2026-10-01',to:'2026-10-19'}]);
 assert.deepEqual(monthWindows('2026-10-01','2026-10-31'),[{from:'2026-10-01',to:'2026-10-31'}]);
 assert.deepEqual(monthWindows('2024-02-12','2024-03-05'),[{from:'2024-02-12',to:'2024-02-29'},{from:'2024-03-01',to:'2024-03-05'}]);
});
test('consolidação só remove duplicatas com identificador confiável',()=>{
 const rows=mergeDssRows([[{rv_id:1,nro_rv:'a'},{rv_id:2}],[{rv_id:1},{rv_id:3},{nro_rv:'x'},{nro_rv:'x'}]],'viagens');
 assert.equal(rows.length,4);
 assert.equal(mergeDssRows([[{a:1}],[{a:1}]],'viagens').length,2);
});
