import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneDefault,analyze} from '../src/engine.js';
import {MPBZ_MODELS,MPBZ_CONCRETE,mpbzCapacities} from '../src/mpbzCatalog.js';
import {mpbzCheck} from '../src/mpbz.js';
import {reportHtml} from '../src/report.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const project=()=>{const p=cloneDefault();p.mpbz={model:'MPB66Z',reinforcement:'unreinforced',concrete:'cracked',fc:2500};p.seismic.sdc='D';return p;};
const fake=(cases)=>({model:{posts:[{name:'P01'}]},cases});
const load=(name,kind,reactions)=>({name,family:'ASD',factors:kind==='wind'?{D:1,'WX+':.6}:kind==='seismic'?{D:1.1,'EX+':.7}: {D:1},reactions:[reactions]});
test('all concrete table rows match the supplied sheet in original lb / ft-lb units',()=>{
 const expected=[
  ['unreinforced','AB','MPB44Z',[4900,3820,1750,1225,1350,945]],
  ['unreinforced','AB','MPB66Z',[5815,5815,3435,2405,2680,1875]],
  ['unreinforced','AB','MPB88Z',[11860,9315,7200,6560,4160,2910]],
  ['unreinforced','CF','MPB44Z',[4785,3350,1535,1075,1180,830]],
  ['unreinforced','CF','MPB66Z',[5815,5815,3015,2110,2055,1645]],
  ['unreinforced','CF','MPB88Z',[10155,8165,6965,4875,3470,2550]],
  ['reinforced','AB','MPB44Z',[4900,3820,1750,1225,1520,1520]],
  ['reinforced','AB','MPB66Z',[5815,5815,3435,2405,3730,3190]],
  ['reinforced','AB','MPB88Z',[11860,9315,7200,6560,4560,4560]],
  ['reinforced','CF','MPB44Z',[4785,3350,1535,1075,1520,1520]],
  ['reinforced','CF','MPB66Z',[5815,5815,3015,2110,3350,2795]],
  ['reinforced','CF','MPB88Z',[10155,8165,6965,4875,4560,4560]],
 ];
 for(const [reinforcement,group,model,tuple] of expected)assert.deepEqual(MPBZ_CONCRETE[reinforcement][group][model],tuple);
});
test('wood capacities and rotational stiffness match all three DF/SP model rows',()=>{
 for(const [model,d100,d160,m160,k] of [['MPB44Z',6240,6410,1520,1245000],['MPB66Z',9360,10855,3730,3405000],['MPB88Z',15120,17690,4560,5515000]]){
  assert.deepEqual(MPBZ_MODELS[model].wood,{download100:d100,download160:d160,moment160:m160});assert.equal(MPBZ_MODELS[model].stiffness,k);
 }
});
test('wind uses the A/B row while seismic reads A–F live from the seismic inputs',()=>{
 const p=project();p.mpbz.sdc='A';
 for(const sdc of ['A','B','C','D','E','F']){p.seismic.sdc=sdc;const seismic=mpbzCapacities(p,'seismic');assert.equal(seismic.group,'AB'.includes(sdc)?'AB':'CF');assert.equal(mpbzCapacities(p,'wind').group,'AB');assert.equal(mpbzCapacities(p,'gravity').group,'AB');}
 p.seismic.sdc=' d ';close(mpbzCapacities(p,'seismic').moment,1645);
});
test('reinforcement and concrete cracking select their exact source capacities',()=>{
 const p=project();close(mpbzCapacities(p,'seismic').moment,1645);close(mpbzCapacities(p,'wind').moment,1875);
 p.mpbz.reinforcement='reinforced';close(mpbzCapacities(p,'seismic').moment,2795);close(mpbzCapacities(p,'wind').moment,3190);
 p.mpbz.concrete='uncracked';close(mpbzCapacities(p,'seismic').moment,3350);close(mpbzCapacities(p,'seismic').lateral,3015);
});
test('note 8 picks the lesser wood/concrete moment and uses conservative gravity wood values',()=>{
 const p=project();p.mpbz.model='MPB88Z';const gravity=mpbzCapacities(p,'gravity');close(gravity.woodMoment,4560/1.6);close(gravity.concreteMoment,2910);close(gravity.moment,2850);assert.equal(gravity.momentControls,'Wood assembly');
 p.mpbz.reinforcement='reinforced';p.mpbz.model='MPB44Z';close(mpbzCapacities(p,'gravity').moment,950);close(mpbzCapacities(p,'wind').moment,1520);
 close(mpbzCapacities(p,'gravity').download,6240);close(mpbzCapacities(p,'wind').download,6410);close(mpbzCapacities(p,'seismic').download,6410);
});
test('SDC C dwelling exception is explicit and never applies to D, E or F',()=>{
 const p=project();p.seismic.sdc='C';assert.equal(mpbzCapacities(p,'seismic').group,'CF');p.mpbz.dwellingException=true;assert.equal(mpbzCapacities(p,'seismic').group,'AB');assert.equal(mpbzCapacities(p,'seismic').exception,true);
 for(const sdc of ['D','E','F']){p.seismic.sdc=sdc;assert.equal(mpbzCapacities(p,'seismic').group,'CF');assert.equal(mpbzCapacities(p,'seismic').exception,false);}
});
test('note 9 hand arithmetic uses concurrent ASD axial OR uplift plus both orthogonal actions',()=>{
 const p=project(),r=fake([load('W','wind',[200,-300,-1000,400,-600,0])]),c=mpbzCheck(p,r);
 close(c.ratio,1000/10855+1000/1875+500/2405);assert.equal(c.governing.axialBranch,'Download');assert.equal(c.passed,true);
 close(c.governing.demand.shearResultant,Math.hypot(200,300));close(c.governing.demand.lateral,500);
 r.cases[0].reactions[0][2]=1000;const uplift=mpbzCheck(p,r);close(uplift.ratio,1000/5815+1000/1875+500/2405);assert.equal(uplift.governing.axialBranch,'Uplift');
 r.cases[0].factors={D:1,'EX+':.7};close(mpbzCheck(p,r).ratio,1000/5815+1000/1645+500/2110);
});
test('governing interaction is checked per concurrent case rather than adding separate extrema',()=>{
 const p=project();p.mpbz.reinforcement='reinforced';
 const r=fake([load('M dominates','wind',[100,0,0,1000,0,0]),load('V dominates','wind',[1000,0,-500,0,0,0]),{family:'LRFD',name:'Ignore LRFD',factors:{'EX+':1},reactions:[[1e9,0,0,1e9,0,0]]}]);
 const c=mpbzCheck(p,r);assert.equal(c.governing.case,'V dominates');close(c.ratio,500/10855+1000/2405);assert.ok(c.ratio<1000/3190+500/10855+1000/2405);
 assert.equal(c.records.length,2);assert.deepEqual(c.governing.reactions,r.cases[1].reactions[0]);
});
test('limit acceptance, tied cases and unrated torsion are handled without a false complete pass',()=>{
 const p=project(),c1=load('exact','wind',[2405,0,0,0,0,0]),r=fake([c1,load('tie','wind',[-2405,0,0,0,0,0])]);let c=mpbzCheck(p,r);close(c.ratio,1);assert.equal(c.passed,true);assert.equal(c.ties.length,2);
 c1.reactions[0][0]=2405.01;c=mpbzCheck(p,r);assert.equal(c.status,'exceeds');assert.equal(c.passed,false);
 const t=mpbzCheck(p,fake([load('torsion','wind',[100,0,0,0,0,100])]));assert.equal(t.status,'torsion-check-required');assert.equal(t.passed,null);assert.ok(t.torsionPending);
});
test('catalog eligibility does not extrapolate concrete strength, unknown categories or unsupported models',()=>{
 const p=project();p.mpbz.fc=2499;assert.match(mpbzCapacities(p,'wind').issue,/2,500/);p.mpbz.fc=5000;close(mpbzCapacities(p,'wind').lateral,2405);
 p.seismic.sdc='unknown';assert.match(mpbzCapacities(p,'seismic').issue,/A–F/);p.seismic.sdc='D';p.mpbz.model='MPBZ invented';assert.match(mpbzCapacities(p,'wind').issue,/Select MPB44Z/);
});
test('actual canopy reactions, reports and all selected capacity profiles remain traceable',()=>{
 const p=project(),r=analyze(p),c=mpbzCheck(p,r);assert.equal(c.records.length,42*9);assert.equal(c.postResults.length,9);
 for(const a of c.records)assert.ok(a.ratio<=c.ratio+1e-9);assert.ok(c.ratio>1);
 const html=reportHtml(p,r);for(const text of ['GOVERNING DCR =','Catalog note 9','SDC D','MPB66Z','1.645','1.875','1.044 Vx','M(160)/1.6'])assert.ok(html.includes(text),text);
});
