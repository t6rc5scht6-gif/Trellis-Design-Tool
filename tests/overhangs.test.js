import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,cloneDefault,governingBases} from '../src/engine.js';
import {roofPlan,roofHeightAt} from '../src/roofGeometry.js';
import {windMeanHeight} from '../src/windTables.js';
import {reactionCsv,reportHtml} from '../src/report.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const project=()=>{const p=cloneDefault();Object.assign(p,{roof:'flat',xPosts:'0, 20',yPosts:'0, 24',overhangs:{xStart:1,xEnd:2,yStart:3,yEnd:4}});return p;};
test('four unequal overhangs expand the roof and tributaries without changing the post grid',()=>{
  const p=project(),r=analyze(p);close(r.model.area,713);close(r.model.roofArea,713);close(r.model.plan.overhangArea,233);
  assert.deepEqual(r.model.posts.map(p=>p.pos),[[0,0,10],[20,0,10],[0,24,10],[20,24,10]]);
  assert.deepEqual(r.postCalcs.map(p=>p.area),[165,180,176,192]);
  close(r.postCalcs.reduce((s,p)=>s+p.overhangArea,0),233);close(r.model.cells.reduce((s,c)=>s+c.area,0),713);
  close(r.model.cells.filter(c=>c.overhang).reduce((s,c)=>s+c.area,0),233);
  r.postCalcs.forEach(post=>close(post.overhangPatches.reduce((s,a)=>s+a.area,0),post.overhangArea));
});
test('gravity cantilever moments match q bt e²/2 including corner area once',()=>{
  const r=analyze(project()),D=r.basic.D.reactions,L=r.basic.Lr.reactions;
  // P01: tx = 11, ty = 15, eX = 1, eY = 3; gravity at negative sides.
  close(D[0][2],-1980);close(D[0][3],594);close(D[0][4],-90);
  close(D[1][2],-2160);close(D[1][3],648);close(D[1][4],360);
  close(D[2][2],-2112);close(D[2][3],-1056);close(D[2][4],-96);
  close(D[3][2],-2304);close(D[3][3],-1152);close(D[3][4],384);
  close(D.reduce((s,v)=>s+v[2],0),-12*713);
  D.forEach((v,i)=>{close(v[5],0);close(L[i][3],v[3]*20/12);close(L[i][4],v[4]*20/12);});
});
test('single flat overhang has no unrequested axis moment and wind reverses the vertical couple',()=>{
  const p=project();p.overhangs={xStart:2,xEnd:0,yStart:0,yEnd:0};p.wind.cfX=0;p.wind.roofX1=1;p.wind.roofX2=1;p.wind.roofX1Down=-1;p.wind.roofX2Down=-1;
  const r=analyze(p);close(r.model.area,528);
  for(const i of [0,2]){close(r.basic.D.reactions[i][4],-12*12*2);close(r.basic.D.reactions[i][3],0);close(r.basic['WX+'].reactions[i][4],r.windPressure*12*2);close(r.basic['WX+↓'].reactions[i][4],-r.windPressure*12*2);}
  for(const i of [1,3])close(r.basic.D.reactions[i][4],0);
});
test('roof planes extend through overhangs with actual surface area and unchanged support heights',()=>{
  for(const roof of ['mono','gable']){
    const p=project();p.roof=roof;p.slope=3;const r=analyze(p);
    close(r.model.roofArea,713*Math.sqrt(1+.25**2));close(roofHeightAt(p,-1),9.75);
    close(roofHeightAt(p,22),roof==='gable'?9.5:15.5);
    assert.deepEqual(r.model.posts.map(post=>post.pos[2]),roof==='gable'?[10,10,10,10]:[10,15,10,15]);
    close(r.basic['WX+'].totalLoad[2],r.windPressure*.9*713);
    if(roof==='mono')close(r.basic['WX+'].totalLoad[0],r.windPressure*(1.3*60-.9*.25*713));
  }
});
test('sloping roof wind transfers a signed three-component overhang moment by r cross F',()=>{
  const p=project();p.roof='mono';p.slope=3;p.wind.cfX=0;p.wind.roofX1=1;p.wind.roofX2=1;
  const r=analyze(p),v=r.basic['WX+'].reactions[0],q=r.windPressure;
  // P01: eX=1 at -X, eY=3 at -Y; tx=11, ty=15.
  // Vertical My = 15*q/2; slope correction = .25² * 15*q/2.
  // Vertical Mx = -q*11*3²/2; torsion = .25*Mx.
  close(v[3],-q*49.5);close(v[5],-q*12.375);
  close(v[4],(-q*.25*165)*10+q*7.5*(1+.25**2));
  const down=r.basic['WX+↓'].reactions[0],ratio=-.6;close(down[3],v[3]*ratio);close(down[5],v[5]*ratio);
});
test('full roof weight sets seismic shear and tributary shares while core interior posts keep their area',()=>{
  const p=project();p.xPosts='0, 10, 20';p.yPosts='0, 12, 24';p.seismic.liveFraction=.25;const r=analyze(p);
  close(r.weight,17*713);close(r.baseShear,.54*17*713);close(r.postCalcs[4].area,120);close(r.postCalcs[4].overhangArea,0);
  close(r.basic['EX+'].reactions[4][0],.54*17*120);
  close(r.postCalcs.reduce((s,v)=>s+v.share,0),1);close(r.forceAccountingError,0);
});
test('all combinations carry gravity and wind moments and vertical seismic factors exactly once',()=>{
  const p=project();p.roof='mono';p.slope=3;p.seismic.verticalFactor=.2;const r=analyze(p);
  for(const c of r.cases) c.reactions.forEach((v,i)=>v.forEach((value,j)=>close(value,Object.entries(c.factors).reduce((s,[k,f])=>s+f*r.basic[k].reactions[i][j],0))));
  const c=r.cases.find(c=>c.name==='0.9D − Ev + ρ(EX+ + 0.3EY+)');close(c.reactions[0][3],.7*r.basic.D.reactions[0][3]+r.basic['EX+'].reactions[0][3]+.3*r.basic['EY+'].reactions[0][3]);
  for(const item of governingBases(r,'LRFD'))assert.ok(item.reactions.every(Number.isFinite));
  const torsion=governingBases(r,'LRFD').find(g=>g.key==='torsion');assert.ok(torsion.active);
  close(torsion.torsion,Math.max(...r.cases.filter(c=>c.family==='LRFD').flatMap(c=>c.reactions.map(v=>Math.abs(v[5])))));
  assert.ok(reportHtml(p,r).includes('GOVERNS TORSION'));
});
test('longitudinal wall force and frame count use core footprint while roof loads include overhangs',()=>{
  const p=project();p.roof='gable';p.wind.longitudinalSource='asce-28.3.7';const r=analyze(p),F=r.longitudinal.force;
  close(r.longitudinal.Ae,650/3);assert.equal(r.longitudinal.actualFrames,2);assert.equal(r.longitudinal.n,3);
  close(r.basic['WY+'].totalLoad[1],F);r.basic['WY+'].details.posts.forEach(v=>close(v.share,.25));
  close(r.basic['WY+'].totalLoad[2],r.windPressure*.7*713);
});
test('automatic C&C uses roof dimensions and edge elevations, including its applicability checks',()=>{
  const p=project();p.wind.ccSource='asce-30.5';const r=analyze(p);
  close(r.ccResult.ratios.X,10/23);close(r.ccResult.ratios.Y,10/31);close(r.ccResult.least,23);
  p.roof='mono';p.slope=3;close(windMeanHeight(p).value,(9.75+15.5)/2);
  p.roof='gable';close(windMeanHeight(p).value,(9.75+12.5)/2);
  p.roof='flat';p.overhangs.yEnd=20;assert.throws(()=>analyze(p),/h\/L limits for Y/);
});
test('legacy projects default to zero overhangs; malformed, negative, oversized and underground roofs fail',()=>{
  const p=cloneDefault(),r=analyze(p);delete p.overhangs;assert.deepEqual(analyze(p).basic,r.basic);assert.deepEqual(roofPlan(p).overhangs,{xStart:0,xEnd:0,yStart:0,yEnd:0});
  for(const overhangs of [null,[],2,{xStart:-1},{xStart:''},{xStart:Infinity},{xStart:NaN},{yEnd:300}]){const q=cloneDefault();q.overhangs=overhangs;assert.throws(()=>analyze(q),/overhang|Overall roof/);}
  const low=project();low.roof='gable';low.slope=12;low.overhangs.xStart=10;assert.throws(()=>analyze(low),/below ground/);
});
test('exports show overall dimensions, substituted overhang statics, source assumptions and all moments',()=>{
  const p=project(),r=analyze(p),html=reportHtml(p,r),csv=reactionCsv(r);
  for(const text of ['Roof overhangs — applied cantilever moments','23.000 ft','31.000 ft','233.000 ft²','Mx,D = Σ','q bt e²/2','0.594 kip-ft','My,W = Vx × h + My,overhang'])assert.ok(html.includes(text),text);
  assert.ok(csv.includes('Post_overhang_area_sf'));assert.ok(csv.includes('Mz_lb_ft'));
  assert.ok(html.includes('&quot;xStart&quot;: 1'));assert.ok(!html.includes('Column tops are moment-free'));
});
