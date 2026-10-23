import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneDefault,analyze} from '../src/engine.js';
import {MPBZ_MODELS,MPBZ_CONCRETE,mpbzCapacities} from '../src/mpbzCatalog.js';
import {mpbzCheck,mpbzDemand} from '../src/mpbz.js';
import {reportHtml} from '../src/report.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const project=()=>{const p=cloneDefault();p.mpbz={model:'MPB66Z',reinforcement:'unreinforced',concrete:'cracked',fc:2500};p.seismic.sdc='D';return p;};
const fake=(cases,height=10)=>({model:{posts:[{name:'P01',pos:[0,0,height]}]},cases});
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
test('note 9 uses concurrent ASD axial OR uplift plus resultant shear and shear times height',()=>{
 const p=project(),r=fake([load('W','wind',[30,40,-1000,-400,300,0])]),c=mpbzCheck(p,r);
 close(c.ratio,1000/10855+500/1875+50/2405);assert.equal(c.governing.axialBranch,'Download');assert.equal(c.passed,true);
 close(c.governing.demand.lateral,50);close(c.governing.demand.moment,500);
 r.cases[0].reactions[0][2]=1000;const uplift=mpbzCheck(p,r);close(uplift.ratio,1000/5815+500/1875+50/2405);assert.equal(uplift.governing.axialBranch,'Uplift');
 r.cases[0].factors={D:1,'EX+':.7};close(mpbzCheck(p,r).ratio,1000/5815+500/1645+50/2110);
});
test('100/30 moment demand is the exact resultant of already factored shear times post height',()=>{
 const h=11.75,v=123.456789,row=[v,.3*v,0,-.3*v*h,v*h,0];
 const c=mpbzCheck(project(),fake([load('100/30','seismic',row)],h)),d=c.governing.demand;
 close(d.lateral,v*Math.sqrt(1.09));close(d.moment,v*Math.sqrt(1.09)*h);
 close(c.governing.lateralRatio,d.lateral/2110);close(c.governing.momentRatio,d.lateral*h/1645);
 assert.notEqual(d.moment,1.3*v*h);assert.equal(c.additionalMomentPending,false);
});
test('each post uses its own actual height, rather than the project eave height',()=>{
 const p=project();p.height=2;const r=fake([load('different heights','wind',[30,40,0,-400,300,0])]);
 r.model.posts.push({name:'P02',pos:[5,0,15]});r.cases[0].reactions.push([30,40,0,-600,450,0]);
 const c=mpbzCheck(p,r);close(c.records[0].demand.moment,500);close(c.records[1].demand.moment,750);assert.equal(c.governing.post,'P02');assert.equal(c.additionalMomentPending,false);
});
test('extra base moments stay separate from requested Vh demand and prevent a complete pass',()=>{
 const p=project(),row=[30,40,0,-450,380,0],r=fake([load('overhang','wind',row)]),c=mpbzCheck(p,r);
 close(c.governing.demand.moment,500);close(c.governing.demand.additionalMoment,Math.hypot(-50,80));close(c.governing.demand.momentResultant,Math.hypot(-450,380));
 assert.equal(c.status,'additional-moment-check-required');assert.equal(c.passed,null);assert.deepEqual(r.cases[0].reactions[0],row);
 const gravity=mpbzCheck(p,fake([load('gravity overhang','gravity',[0,0,-1000,200,300,0])]));
 close(gravity.governing.demand.moment,0);assert.ok(gravity.additionalMomentPending);assert.equal(gravity.passed,null);
 const otherLever=mpbzCheck(p,fake([load('elevated horizontal load','wind',[0,40,0,-600,0,0])]));close(otherLever.governing.demand.moment,400);close(otherLever.additionalMoment.demand.additionalMoment,200);
});
test('demand requires a positive finite actual post height',()=>{
 for(const h of [0,-1,NaN,Infinity,undefined])assert.throws(()=>mpbzDemand([0,0,0,0,0,0],h),/actual post height/);
});
test('governing interaction is checked per concurrent case rather than adding separate extrema',()=>{
 const p=project();p.mpbz.reinforcement='reinforced';
 const r=fake([load('axial dominates','wind',[0,0,-5000,0,0,0]),load('lateral dominates','wind',[150,0,0,0,1500,0]),{family:'LRFD',name:'Ignore LRFD',factors:{'EX+':1},reactions:[[1e9,0,0,1e9,0,0]]}]);
 const c=mpbzCheck(p,r);assert.equal(c.governing.case,'lateral dominates');close(c.ratio,1500/3190+150/2405);assert.ok(c.ratio<5000/10855+1500/3190+150/2405);
 assert.equal(c.records.length,2);assert.deepEqual(c.governing.reactions,r.cases[1].reactions[0]);
});
test('limit acceptance, tied cases and unrated torsion are handled without a false complete pass',()=>{
 const p=project(),v=1/(10/1875+1/2405),c1=load('exact','wind',[v,0,0,0,v*10,0]),r=fake([c1,load('tie','wind',[-v,0,0,0,-v*10,0])]);let c=mpbzCheck(p,r);close(c.ratio,1);assert.equal(c.passed,true);assert.equal(c.ties.length,2);
 c1.reactions[0][0]=v+.01;c1.reactions[0][4]=(v+.01)*10;c=mpbzCheck(p,r);assert.equal(c.status,'exceeds');assert.equal(c.passed,false);
 const t=mpbzCheck(p,fake([load('torsion','wind',[100,0,0,0,1000,100])]));assert.equal(t.status,'torsion-check-required');assert.equal(t.passed,null);assert.ok(t.torsionPending);
});
test('catalog eligibility does not extrapolate concrete strength, unknown categories or unsupported models',()=>{
 const p=project();p.mpbz.fc=2499;assert.match(mpbzCapacities(p,'wind').issue,/2,500/);p.mpbz.fc=5000;close(mpbzCapacities(p,'wind').lateral,2405);
 p.seismic.sdc='unknown';assert.match(mpbzCapacities(p,'seismic').issue,/A–F/);p.seismic.sdc='D';p.mpbz.model='MPBZ invented';assert.match(mpbzCapacities(p,'wind').issue,/Select MPB44Z/);
});
test('actual canopy reactions, reports and all selected capacity profiles remain traceable',()=>{
 const p=project(),r=analyze(p),c=mpbzCheck(p,r);assert.equal(c.records.length,42*9);assert.equal(c.postResults.length,9);
 for(const a of c.records){assert.ok(a.ratio<=c.ratio+1e-9);close(a.demand.moment,a.demand.lateral*r.model.posts[a.postIndex].pos[2]);close(a.demand.moment,a.demand.momentResultant);}assert.ok(c.ratio>1);assert.equal(c.additionalMomentPending,false);
 const html=reportHtml(p,r);for(const text of ['GOVERNING DCR =','Catalog note 9','SDC D','MPB66Z','1.645','1.875','1.044 Vx','M = Vresultant × h','M(160)/1.6'])assert.ok(html.includes(text),text);
});
