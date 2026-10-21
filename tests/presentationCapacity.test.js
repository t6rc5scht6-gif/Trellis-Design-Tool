import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,cloneDefault} from '../src/engine.js';
import {compactCaseName,compactCases,demandScore,postSeismicResultants} from '../src/presentation.js';
import {mpbzCheck} from '../src/mpbz.js';
import {reportHtml} from '../src/report.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);
test('post seismic check squares 0.30 times the force and yields sqrt(1.09) Vpost',()=>{
 const r=analyze(cloneDefault()),s=postSeismicResultants(r,4),v=r.baseShear*.25;
 close(s.vx,v);close(s.vy,v);close(s.governing,Math.sqrt(v*v+(.3*v)**2));close(s.governing,v*Math.sqrt(1.09));
 assert.notEqual(s.governing,Math.sqrt(v*v+.3*v*v));
 const different={basic:{'EX+':{reactions:[[100,0]]},'EY+':{reactions:[[0,200]]}}};const a=postSeismicResultants(different,0);close(a.xPrimary,Math.sqrt(10000+3600));close(a.yPrimary,Math.sqrt(900+40000));
});
test('compact cases keep the true concurrent governing direction for every criterion and combination group',()=>{
 const p=cloneDefault();p.overhangs={xStart:1,xEnd:3,yStart:2,yEnd:4};const r=analyze(p);
 for(const family of ['Basic','Service','ASD','LRFD'])for(const criterion of ['compression','uplift','shear','moment','torsion']){
  const compact=compactCases(r,family,0,criterion);assert.ok(compact.length<r.cases.filter(c=>c.family===family).length);
  for(const c of compact){assert.ok(r.cases.includes(c));for(const other of r.cases.filter(v=>v.family===family&&compactCaseName(v.name)===compactCaseName(c.name)))assert.ok(demandScore(c.reactions[0],criterion)>=demandScore(other.reactions[0],criterion)-1e-8);}
 }
 assert.equal(compactCaseName('0.9D + W27X B γ180'),'0.9D + WX');assert.equal(compactCaseName('EX− + 0.3EY+'),'EX + 0.3EY');
});
test('component capacities use ASD only, retain axes, and never assert an overall catalog pass',()=>{
 const p={mpbz:{model:'User model',source:'Pending test source',compression:1,uplift:2,vx:1,vy:1,mx:2,my:2}},r={model:{posts:[{name:'P01'}]},cases:[
  {family:'ASD',name:'case A',reactions:[[100,-200,300,400,-500,10]]},
  {family:'ASD',name:'case B',reactions:[[-50,100,-600,-200,250,-20]]},
  {family:'LRFD',name:'factored',reactions:[[1e9,1e9,-1e9,1e9,1e9,1e9]]},
 ]},c=mpbzCheck(p,r),rows=Object.fromEntries(c.rows.map(v=>[v.key,v]));
 close(rows.compression.ratio,.6);close(rows.uplift.ratio,.15);close(rows.vx.ratio,.1);close(rows.vy.ratio,.2);close(rows.mx.ratio,.2);close(rows.my.ratio,.25);
 assert.equal(rows.mz.ratio,null);assert.equal(c.status,'catalog-pending');assert.ok(c.missing.includes('Torsion'));assert.equal(rows.compression.case,'case B');assert.equal(c.passed,undefined);
});
test('MPBZ missing/zero capacities remain pending, not zero utilization or unbounded approval',()=>{
 const p=cloneDefault(),r=analyze(p),missing=mpbzCheck(p,r);assert.ok(missing.rows.every(v=>v.ratio===null));assert.equal(missing.hasRatios,false);
 p.mpbz={vx:0};assert.equal(mpbzCheck(p,r).rows.find(v=>v.key==='vx').ratio,null);
 p.mpbz={vx:-1};assert.throws(()=>analyze(p),/MPBZ allowable/);p.mpbz=null;assert.throws(()=>analyze(p),/MPBZ capacity inputs/);
});
test('compact reports contain direct resultant arithmetic, hidden detailed checks, and pending MPBZ provenance',()=>{
 const p=cloneDefault();p.mpbz={model:'<script>bad</script>',source:'User source',vx:5};const html=reportHtml(p,analyze(p));
 assert.ok(html.includes('√[Vx² + (0.30 Vx)²]'));assert.ok(html.includes('1.044 Vx'));assert.ok(html.includes('<details><summary>Detailed signed load cases'));assert.ok(html.includes('Overall MPBZ catalog DCR: pending.'));assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));assert.ok(!html.includes('<script>'));
});
