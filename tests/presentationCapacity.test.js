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
test('legacy manual capacities do not override the supplied catalog selection',()=>{
 const p=cloneDefault();p.mpbz={model:'Old manual model',vx:5000};const r=analyze(p),check=mpbzCheck(p,r);
 assert.equal(check.status,'selection-required');assert.equal(check.passed,null);assert.equal(check.records.length,0);
 p.mpbz.model='MPB66Z';const catalog=mpbzCheck(p,r);assert.ok(catalog.governing);assert.equal(catalog.profiles.wind.lateral,2405);
});
test('invalid MPBZ input types are rejected without silently selecting a different capacity',()=>{
 const p=cloneDefault();p.mpbz={vx:-1};assert.throws(()=>analyze(p),/MPBZ allowable/);p.mpbz=null;assert.throws(()=>analyze(p),/MPBZ capacity inputs/);
 p.mpbz={reinforcement:'anything'};assert.throws(()=>analyze(p),/reinforced or unreinforced/);
});
test('compact reports include resultant arithmetic, catalog ratios and escaped input provenance',()=>{
 const p=cloneDefault();p.mpbz={model:'MPB66Z',source:'<script>bad</script>'};const html=reportHtml(p,analyze(p));
 assert.ok(html.includes('√[Vx² + (0.30 Vx)²]'));assert.ok(html.includes('1.044 Vx'));assert.ok(html.includes('<details><summary>Detailed signed load cases'));assert.ok(html.includes('GOVERNING DCR ='));assert.ok(html.includes('Catalog note 9'));assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));assert.ok(!html.includes('<script>'));
});
