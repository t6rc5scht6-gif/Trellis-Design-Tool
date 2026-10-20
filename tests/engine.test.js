import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,cloneDefault,coordinates,geometry,seismicCoefficient,velocityPressure,envelope,validate,governingBases,governingCaseMap,governingPostMetrics,orthogonalSeismicPatterns} from '../src/engine.js';
import {parseHazardText,applyHazards,parseHazardAddress,addressFromPdfItems} from '../src/hazards.js';
import {reactionCsv,reportHtml} from '../src/report.js';
const close=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const sum=(a,j)=>a.reduce((s,x)=>s+x[j],0);
const flat=()=>{const p=cloneDefault();p.roof='flat';p.xPosts='0, 20';p.yPosts='0, 24';return p;};
test('velocity pressure uses ultimate speed and all four factors',()=>{
  close(velocityPressure({speed:100,kz:1,kzt:1,kd:1,ke:1}),25.6);close(analyze(cloneDefault()).q,15.9971904);
});
test('four-post hand check: shear = V/4 and moment = shear times height',()=>{
  const p=flat(),r=analyze(p),c=r.basic['EX+'],V=0.81/1.5*12*20*24;
  close(r.baseShear,V);close(r.cs,.54);
  c.reactions.forEach(a=>{close(a[0],V/4);close(a[1],0);close(a[2],0);close(a[3],0);close(a[4],V*10/4);close(a[5],0);});
});
test('tributary widths and lengths give corner, edge, and interior areas by hand',()=>{
  const r=analyze(cloneDefault());
  close(r.postCalcs[0].tx,5);close(r.postCalcs[0].ty,6);close(r.postCalcs[0].area,30);
  close(r.postCalcs[1].area,60);close(r.postCalcs[4].area,120);close(r.postCalcs[4].share,.25);
  close(r.postCalcs.reduce((s,p)=>s+p.area,0),480);
});
test('gravity is exactly pressure times tributary area, without stiffness redistribution',()=>{
  const p=cloneDefault(),r=analyze(p);
  r.model.posts.forEach((post,i)=>{close(r.basic.D.reactions[i][2],-p.dead*post.area);close(r.basic.Lr.reactions[i][2],-p.live*post.area);close(r.basic.D.reactions[i][4],0);});
  close(r.basic.D.reactions[4][2],-1440);close(r.basic.Lr.reactions[4][2],-2400);
});
test('nonuniform grids use halfway boundaries and conserve total tributary area',()=>{
  const p=flat();p.xPosts='0, 3, 14, 20';p.yPosts='0, 7, 24';const r=analyze(p);
  close(r.postCalcs[0].tx,1.5);close(r.postCalcs[1].tx,7);close(r.postCalcs[2].tx,8.5);close(r.postCalcs[3].tx,3);
  close(r.postCalcs[0].ty,3.5);close(r.postCalcs[4].ty,12);close(r.postCalcs.at(-1).ty,8.5);
  close(r.postCalcs.reduce((s,p)=>s+p.area,0),480);close(sum(r.basic['EX+'].reactions,0),r.baseShear);
});
test('gable ridge adds roof geometry without adding posts or changing tributary area',()=>{
  const p=flat();p.roof='gable';p.slope=3;const m=geometry(p);
  assert.equal(m.posts.length,4);assert.equal(m.nodes.length,6);close(m.roofArea,480*Math.sqrt(1+.25**2));close(Math.max(...m.nodes.map(n=>n.pos[2])),12.5);
});
test('normal pressure resolves to p At vertically and minus p slope At horizontally',()=>{
  const p=flat();p.roof='mono';p.slope=3;p.wind.cfX=0;p.wind.roofX1=1;p.wind.roofX2=1;
  const r=analyze(p),w=r.basic['WX+'];close(w.totalLoad[2],r.q*480);close(w.totalLoad[0],-.25*r.q*480);
  w.reactions.forEach((v,i)=>{close(v[0],-.25*r.q*120);close(v[4],v[0]*r.model.posts[i].pos[2]);});
});
test('uniform governing pressure envelopes both halves for every roof shape',()=>{
  for(const roof of ['flat','mono','gable']){const p=flat();p.roof=roof;p.wind.roofX1=.3;p.wind.roofX2=1.5;p.wind.roofX1Down=-.2;p.wind.roofX2Down=-.8;
    const r=analyze(p);close(r.basic['WX+'].totalLoad[2],r.q*1.5*480);close(r.basic['WX+↓'].totalLoad[2],-r.q*.8*480);}
});
test('explicit half-roof pressures integrate separately and reverse X mirrors the pattern',()=>{
  const p=flat();p.wind.uniformRoof=false;p.wind.roofX1=.2;p.wind.roofX2=1.6;p.roof='gable';const r=analyze(p);
  close(r.basic['WX+'].totalLoad[2],r.q*.9*480);close(r.basic['WX−'].totalLoad[2],r.q*.9*480);
  close(r.basic['WX+'].reactions[0][2],r.q*.2*120);close(r.basic['WX−'].reactions[0][2],r.q*1.6*120);
});
test('equal lateral distribution is explicit and does not alter roof gravity or normal pressures',()=>{
  const p=cloneDefault(),t=analyze(p);p.distribution='equal';const r=analyze(p);
  r.basic['EX+'].reactions.forEach(v=>close(v[0],r.baseShear/9));
  assert.deepEqual(r.basic.D.reactions,t.basic.D.reactions);
  r.basic['WX+'].reactions.forEach((v,i)=>close(v[2],t.basic['WX+'].reactions[i][2]));
});
test('simple post equilibrium holds for every basic and combined case',()=>{
  const p=cloneDefault();p.xPosts='0, 3, 14, 20';p.yPosts='0, 7, 24';p.roof='mono';const r=analyze(p);
  for(const c of [...Object.values(r.basic),...r.cases]) c.reactions.forEach((v,i)=>{close(v[3],-v[1]*r.model.posts[i].pos[2]);close(v[4],v[0]*r.model.posts[i].pos[2]);close(v[5],0);});
  assert.ok(r.forceAccountingError<1e-8);
});
test('LRFD and ASD reaction arithmetic includes wind factors, seismic Ev, and uplift',()=>{
  const p=flat();p.wind.roofX1=2;p.wind.roofX2=2;const r=analyze(p),c=r.cases.find(c=>c.family==='LRFD'&&c.name==='0.9D + WX+');
  c.reactions.forEach((a,i)=>a.forEach((v,j)=>close(v,.9*r.basic.D.reactions[i][j]+r.basic['WX+'].reactions[i][j])));assert.ok(c.reactions.every(v=>v[2]>0));
  const a=r.cases.find(c=>c.family==='ASD'&&c.name==='D + 0.6WX+');close(sum(a.reactions,0),.6*r.basic['WX+'].totalLoad[0]);
  const e=r.cases.find(c=>c.family==='LRFD'&&c.name==='0.9D − Ev + ρ(EX+ + 0.3EY+)');close(sum(e.reactions,2),-(.9-p.seismic.verticalFactor)*p.dead*480);
});
test('both uplift and downward wind actions appear in required wind combinations',()=>{
  const r=analyze(flat());assert.equal(Object.keys(r.windForces).length,8);assert.equal(r.cases.length,123);
  assert.ok(r.cases.some(c=>c.family==='LRFD'&&c.name==='1.2D + WX+↓ + 0.5Lr'));
});
test('ELF coefficient applies minima and R always stays 1.5',()=>{
  const s=cloneDefault().seismic;s.sa=.001;close(seismicCoefficient(s).cs,.044*.81);s.s1=.8;close(seismicCoefficient(s).cs,.5*.8/1.5);
  s.sds=.01;s.s1=.1;close(seismicCoefficient(s).cs,.01);const p=flat();p.seismic.r=3;assert.throws(()=>analyze(p),/R = 1.5/);
});
test('engineer-entered Chapter 15 Cs is used without silently changing it',()=>{
  const p=flat();p.seismic.method='manual';p.seismic.cs=.125;p.seismic.liveFraction=.25;const r=analyze(p);close(r.weight,(12+.25*20)*480);close(r.baseShear,.125*r.weight);
});
test('C&C pressures and forces are separate from MWFRS post actions',()=>{
  const p=flat(),r=analyze(p);p.wind.ccArea=33;p.wind.cc[0].up=7;const other=analyze(p);close(other.cc[0].upForce,r.q*7*33);close(other.cc[0].downPressure,r.q*p.wind.cc[0].down);assert.deepEqual(other.basic['WX+'].reactions,r.basic['WX+'].reactions);
});
test('post envelopes preserve governing cases and component extrema',()=>{
  const r=analyze(flat()),rows=envelope(r,'LRFD');for(let i=0;i<rows.length;i++)for(let j=0;j<6;j++){
    const v=rows[i].components[j],cases=r.cases.filter(c=>c.family==='LRFD');close(v.min.value,Math.min(...cases.map(c=>c.reactions[i][j])));close(v.max.value,Math.max(...cases.map(c=>c.reactions[i][j])));
    assert.ok(cases.some(c=>c.name===v.max.case&&c.reactions[i][j]===v.max.value));}
});
test('common base demands select worst posts and retain simultaneous load sets',()=>{
  const r=analyze(cloneDefault()),g=governingBases(r,'LRFD');
  for(const item of g){const i=r.model.posts.findIndex(p=>p.name===item.post),c=r.cases.find(c=>c.family==='LRFD'&&c.name===item.case);assert.deepEqual(item.reactions,c.reactions[i]);
    for(const c of r.cases.filter(c=>c.family==='LRFD'))for(const v of c.reactions){const value=item.key==='moment'?Math.hypot(v[3],v[4]):item.key==='shear'?Math.hypot(v[0],v[1]):item.key==='uplift'?Math.max(0,v[2]):Math.max(0,-v[2]);assert.ok(value<=item[item.key]+1e-8);}}
  assert.equal(g.find(g=>g.key==='moment').post,'P05');
});
test('validation rejects invalid arithmetic, bad metadata, duplicate coordinates, and unsupported methods',()=>{
  const p=flat();p.dead=NaN;assert.throws(()=>analyze(p),/dead/);assert.throws(()=>coordinates('0, 10, 10, 20',20,'X'),/increase/);assert.throws(()=>coordinates('0, , 20',20,'X'),/comma-separated/);
  assert.throws(()=>coordinates('0, 1, 2, 3, 4, 5, 20',20,'X'),/2–6/);assert.throws(()=>coordinates('0, 19',20,'X'),/end at/);
  const q=flat();q.seismic.method='invented';assert.throws(()=>validate(q),/supported seismic/);q.seismic.method='elf';q.hazard.source={};assert.throws(()=>validate(q),/metadata/);
});
test('ASCE fields parse despite subscript spacing without inventing Sa(T)',()=>{
  const text='ASCE/SEI 7-22 Risk Category: II Soil Class: Default Latitude: 38.529437 Longitude: -121.692689 Wind Speed 93 Vmph S DS : 0.81 S D1 : 0.51 T L : 8 S S : 0.88 S1 : 0.29 Seismic Design Category: D';
  const data=parseHazardText(text);assert.deepEqual(data.values,{speed:93,sds:.81,sd1:.51,ss:.88,s1:.29,tl:8});assert.equal(data.site,'Default');assert.equal(data.edition,'22');
  const p=flat();p.wind.reviewed=true;p.seismic.reviewed=true;p.seismic.sa=.67;const n=applyHazards(p,data,'site.pdf').project;
  assert.equal(n.seismic.sa,.67);assert.equal(n.seismic.r,1.5);assert.equal(n.wind.reviewed,false);assert.equal(n.seismic.reviewed,false);assert.throws(()=>parseHazardText('unrelated document'),/No recognizable/);
});
test('hand-calculation exports include substituted arithmetic, code references, and escaped text',()=>{
  const p=flat();p.name='<script>alert(1)</script>';const r=analyze(p),csv=reactionCsv(r),report=reportHtml(p,r);
  assert.equal(csv.split('\r\n').length,1+r.cases.length*r.model.posts.length);assert.ok(csv.includes('Fz_lb_uplift_positive'));assert.ok(report.includes('&lt;script&gt;'));assert.ok(!report.includes('<script>'));
  assert.ok(report.includes('R = 1.5'));assert.ok(report.includes('Numerical factors:'));assert.ok(report.includes('§26.10'));assert.ok(report.includes('My,W = Vx × h'));assert.ok(report.includes('Cs,raw = Sa(T) Ie / R'));
});
test('largest grid retains tributary area and load accounting',()=>{
  const p=flat();p.xPosts='0, 4, 8, 12, 16, 20';p.yPosts='0, 4, 8, 12, 18, 24';const r=analyze(p);assert.equal(r.model.posts.length,36);assert.ok(r.forceAccountingError<1e-8);
});

test('100/30 patterns include both primary axes and every independent sign pair',()=>{
  const patterns=orthogonalSeismicPatterns();assert.equal(patterns.length,8);
  const r=analyze(flat());
  for(const primary of ['X','Y']){
    const selected=patterns.filter(p=>p.primary===primary);assert.equal(selected.length,4);
    assert.equal(new Set(selected.map(p=>p.signX+p.signY)).size,4);
    for(const p of selected){
      const c=r.cases.find(c=>c.family==='Basic'&&c.name===p.name),v=c.reactions[0],F=r.baseShear/4;
      close(v[0],(p.signX==='+'?1:-1)*(primary==='X'?1:.3)*F);
      close(v[1],(p.signY==='+'?1:-1)*(primary==='Y'?1:.3)*F);
      close(v[3],-v[1]*10);close(v[4],v[0]*10);close(v[2],0);
    }
  }
  for(const family of ['ASD','LRFD'])assert.equal(r.cases.filter(c=>c.family===family&&c.directional).length,16);
  assert.equal(r.cases.filter(c=>c.family==='Service'&&c.directional).length,8);
});
test('orthogonal LRFD/ASD apply rho to both horizontal terms and Ev only once',()=>{
  const p=flat();p.seismic.rho=1.3;p.seismic.verticalFactor=.17;const r=analyze(p),F=r.baseShear/4,D=12*120;
  for(const family of ['LRFD','ASD'])for(const c of r.cases.filter(c=>c.family===family&&c.directional)){
    const scale=family==='LRFD'?1:.7,primary=c.directional.primary,sx=c.directional.signX==='+'?1:-1,sy=c.directional.signY==='+'?1:-1;
    const low=c.name.startsWith(family==='LRFD'?'0.9D':'0.6D');
    const dFactor=family==='LRFD'?(low?.9-.17:1.2+.17):(low?.6-.7*.17:1+.7*.17);
    close(c.reactions[0][0],sx*F*(primary==='X'?1:.3)*1.3*scale);
    close(c.reactions[0][1],sy*F*(primary==='Y'?1:.3)*1.3*scale);
    close(c.reactions[0][2],-D*dFactor);
    close(c.factors.D,dFactor);
  }
});
test('orthogonal loading produces biaxial demand and increases symmetric resultant by sqrt(1.09)',()=>{
  const r=analyze(flat()),c=r.cases.find(c=>c.family==='Basic'&&c.name==='EX+ + 0.3EY+');
  const v=c.reactions[0];close(Math.hypot(v[0],v[1]),r.baseShear/4*Math.sqrt(1.09));close(Math.hypot(v[3],v[4]),r.baseShear/4*10*Math.sqrt(1.09));
  assert.ok(v[3]<0&&v[4]>0);
});
test('all numerical governing ties are marked with their actual posts and criteria',()=>{
  const r=analyze(cloneDefault()),map=governingCaseMap(r,'LRFD'),g=governingBases(r,'LRFD');
  const moment=g.find(g=>g.key==='moment');assert.equal(moment.ties.length,16);
  for(const tie of moment.ties){assert.ok(map[tie.case].metrics.includes('moment'));assert.ok(governingPostMetrics(map[tie.case],tie.post).includes('moment'));}
  assert.deepEqual(governingPostMetrics(map[moment.case],'P01'),[]);
  assert.equal(map['1.4D'],undefined);
});
test('zero demand is not governing and display rounding does not create false ties',()=>{
  const result={model:{posts:[{name:'P01'}]},cases:[{family:'LRFD',name:'zero',reactions:[[0,0,0,0,0,0]]}]};
  assert.deepEqual(governingCaseMap(result,'LRFD'),{});
  result.cases.push({family:'LRFD',name:'max',reactions:[[1000,0,0,0,0,0]]},{family:'LRFD',name:'near',reactions:[[999.9,0,0,0,0,0]]});
  const map=governingCaseMap(result,'LRFD');assert.deepEqual(map.max.metrics,['shear']);assert.equal(map.near,undefined);assert.equal(map.zero,undefined);
});
test('text address extraction excludes adjacent report columns and combines city/ZIP',()=>{
  const text='ASCE Hazards Report\nAddress:    Standard: ASCE/SEI 7-22     Latitude: 38.5\n28193 Mace Blvd    Risk Category: II Longitude: -121.6\nDavis, California\n95618\n    Soil Class: Default   Elevation: 36 ft\nWind\nResults:';
  assert.equal(parseHazardAddress(text),'28193 Mace Blvd, Davis, California 95618');
  assert.equal(parseHazardAddress('Address:\nNo address available\nStandard: ASCE/SEI 7-22'),undefined);
  assert.equal(parseHazardAddress('Wind Speed 93 Vmph'),undefined);
});
test('PDF address extraction selects the address column using item coordinates',()=>{
  const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y]});
  const items=[item('Address:',50,700),item('28193 Mace Blvd',50,688),item('Davis, California',50,676),item('95618',50,664),item('Standard:',190,700),item('ASCE/SEI 7-22',270,700),item('Risk Category:',190,688),item('II',270,688),item('Wind',50,560)];
  assert.equal(addressFromPdfItems(items),'28193 Mace Blvd, Davis, California 95618');
});
test('hazard import updates a recognized address and preserves it when absent',()=>{
  const p=cloneDefault();p.address='Existing manual address';
  const parsed=parseHazardText('Wind Speed 93 Vmph');
  assert.equal(applyHazards(p,parsed,'without.pdf').project.address,'Existing manual address');
  parsed.address='123 Main St, Davis, CA 95618';const imported=applyHazards(p,parsed,'with.pdf');
  assert.equal(imported.project.address,parsed.address);assert.ok(imported.fields.includes('address'));assert.equal(imported.project.hazard.address,parsed.address);
});
test('reports and CSV retain orthogonal factors and governing annotations',()=>{
  const p=flat(),r=analyze(p),csv=reactionCsv(r),html=reportHtml(p,r);
  assert.ok(csv.includes('Governing_demand_criteria'));assert.ok(csv.includes('shear; moment'));
  assert.ok(html.includes('ASCE 7-22 §12.5.1.2(a)'));assert.ok(html.includes('GOVERNS SHEAR / MOMENT'));assert.ok(html.includes('class="governing-row"'));assert.ok(html.includes('EX+ + 0.3EY+'));
});
