import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,cloneDefault} from '../src/engine.js';
import {CASE_2_END_WALL} from '../src/longitudinalWind.js';
import {reportHtml} from '../src/report.js';
const close=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const project=()=>{const p=cloneDefault();Object.assign(p.wind,{longitudinalSource:'asce-28.3.7',speed:100,kz:1,kzt:1,ke:1,kd:.85});return p;};
test('Case 2 coefficients match supplied surfaces 5, 5E, 6, 6E',()=>{
  assert.deepEqual(CASE_2_END_WALL,{windward:.40,windwardE:.61,leeward:-.29,leewardE:-.43});
});
test('open-end hand calculation derives geometry, shielding, pressure and full-AE force',()=>{
  const r=analyze(project()),c=r.longitudinal;
  // 20 x 10 rectangle + 20 x (10/6) / 2 triangle = 650/3 sf.
  close(c.rise,5/3);close(c.Ae,650/3);close(c.As,0);close(c.phi,0);
  close(c.centroidX,10);close(c.centroidZ,635/117);
  assert.equal(c.actualFrames,3);assert.equal(c.n,3);close(c.kb,1.6);close(c.ks,.6);
  close(c.qh,25.6);close(c.delta,1.04);close(c.pressure,21.725184);
  close(c.force,4707.1232);close(r.basic['WY+'].totalLoad[1],4707.1232);
  assert.ok(c.force>0,'A fully open end wall still uses AE, not As, in Eq. 28.3-4');
});
test('exact entered-area averages interpolate the two surface values independently',()=>{
  const p=project();Object.assign(p.wind,{longitudinalCoefficientMode:'area-weighted',windwardEndEdgeArea:65,leewardEndEdgeArea:130});
  const c=analyze(p).longitudinal;
  close(c.windward,.526);close(c.leeward,-.332);close(c.delta,.858);assert.equal(c.averaging.reversed,true);
  p.wind.windwardEndEdgeArea=130;p.wind.leewardEndEdgeArea=65;const same=analyze(p).longitudinal;close(same.force,c.force);assert.equal(same.averaging.reversed,false);
  for(const fraction of [0,.2,.7,1]){
    p.wind.windwardEndEdgeArea=c.Ae*fraction;p.wind.leewardEndEdgeArea=c.Ae*fraction;
    const other=analyze(p).longitudinal;
    assert.ok(other.delta<=1.04+1e-12);assert.ok(other.delta>=.69-1e-12);
  }
});
test('manual override is explicit, signed, and does not silently populate missing values',()=>{
  const p=project();p.wind.longitudinalCoefficientMode='manual';assert.throws(()=>analyze(p),/area-averaged/);
  Object.assign(p.wind,{longitudinalGcWindward:.5,longitudinalGcLeeward:-.3});
  close(analyze(p).longitudinal.delta,.8);
  p.wind.longitudinalGcLeeward=.6;assert.throws(()=>analyze(p),/difference must be positive/);
});
test('frame count minimum, solidity exponent, and KB breakpoint follow supplied equations',()=>{
  const p=project();p.yPosts='0, 24';let c=analyze(p).longitudinal;assert.equal(c.actualFrames,2);assert.equal(c.n,3);close(c.ks,.6);
  p.yPosts='0, 4, 8, 12, 18, 24';p.wind.endSolidArea=c.Ae/2;c=analyze(p).longitudinal;assert.equal(c.n,6);close(c.ks,.6+.073*3+1.25*.5**1.8);
  p.wind.endSolidArea=c.Ae;c=analyze(p).longitudinal;close(c.ks,.6+.073*3+1.25);
  p.wind.endSolidArea=0;p.width=100;p.length=120;p.xPosts='0, 50, 100';p.yPosts='0, 60, 120';close(analyze(p).longitudinal.kb,.8);
  p.width=99;p.xPosts='0, 49.5, 99';close(analyze(p).longitudinal.kb,.81);
  p.width=101;p.xPosts='0, 50.5, 101';close(analyze(p).longitudinal.kb,.8);
});
test('load path gives half force to each outer wall and conserves F with nonuniform frame spacing',()=>{
  const p=project();p.xPosts='0, 3, 14, 20';p.yPosts='0, 7, 24';p.distribution='equal';const r=analyze(p),F=r.longitudinal.force,details=r.basic['WY+'].details.posts;
  close(details.reduce((s,v)=>s+v.share,0),1);
  for(const x of [0,20]){
    const wall=r.model.posts.map((post,i)=>({post,d:details[i]})).filter(v=>v.post.pos[0]===x);
    close(wall.reduce((s,v)=>s+v.d.horizontal,0),F/2);
    close(wall[0].d.horizontal,F/2*3.5/24);close(wall[1].d.horizontal,F/2*12/24);close(wall[2].d.horizontal,F/2*8.5/24);
  }
  r.model.posts.forEach((post,i)=>{if(post.pos[0]!==0&&post.pos[0]!==20)close(details[i].horizontal,0);});
});
test('Y force replaces old reference force, keeps roof loads, and leaves X and seismic unchanged',()=>{
  const p=project(),r=analyze(p);p.wind.longitudinalSource='manual';const old=analyze(p);
  assert.deepEqual(r.basic['WX+'].reactions,old.basic['WX+'].reactions);assert.deepEqual(r.basic['EX+'],old.basic['EX+']);assert.deepEqual(r.basic['EY+'],old.basic['EY+']);
  assert.deepEqual(r.cc,old.cc);
  for(const suffix of ['+','+↓','−','−↓']){
    const name=`WY${suffix}`,sign=suffix.startsWith('+')?1:-1;
    close(r.basic[name].totalLoad[1],sign*r.longitudinal.force);
    close(r.basic[name].totalLoad[2],old.basic[name].totalLoad[2]);
    r.basic[name].reactions.forEach((v,i)=>{close(v[0],old.basic[name].reactions[i][0]);close(v[3],-v[1]*r.model.posts[i].pos[2]);});
  }
  p.wind.longitudinalSource='asce-28.3.7';p.wind.cfY=900;p.wind.areaY=800;assert.deepEqual(analyze(p).basic['WY+'],r.basic['WY+']);
});
test('Kd enters exactly once and C&C gust factor does not scale the longitudinal force',()=>{
  const p=project(),r=analyze(p);p.wind.kd=.425;close(analyze(p).longitudinal.force,r.longitudinal.force/2);
  p.wind.kd=.85;p.wind.ccGust=2;close(analyze(p).longitudinal.force,r.longitudinal.force);
});
test('base moment envelope uses the centroid when above eave and superposes signed combinations',()=>{
  const p=project();Object.assign(p,{width:100,length:120,height:5,slope:9,xPosts:'0, 50, 100',yPosts:'0, 60, 120'});
  const r=analyze(p),c=r.longitudinal;assert.ok(c.centroidZ>p.height);
  for(const name of ['WY+','WY−','WY+↓','WY−↓'])r.basic[name].reactions.forEach((v,i)=>{
    const post=r.model.posts[i];close(v[3],-v[1]*Math.max(post.pos[2],c.centroidZ));close(v[4],v[0]*post.pos[2]);
  });
  for(const family of ['Service','ASD','LRFD'])for(const combo of r.cases.filter(c=>c.family===family&&Object.keys(c.factors).some(k=>k.startsWith('WY'))))combo.reactions.forEach((v,i)=>v.forEach((value,j)=>{
    close(value,Object.entries(combo.factors).reduce((sum,[key,factor])=>sum+factor*r.basic[key].reactions[i][j],0));
  }));
});
test('scope checks reject unsupported roofs, angles, editions, heights and solid/edge areas',()=>{
  for(const roof of ['flat','mono']){const p=project();p.roof=roof;assert.throws(()=>analyze(p),/requires a gable/);}
  for(const slope of [0,12]){const p=project();p.slope=slope;assert.throws(()=>analyze(p),/0° < θ < 45°/);}
  const edition=project();edition.code='2022 CBC / ASCE 7-16';assert.throws(()=>analyze(edition),/ASCE 7-22 excerpt/);
  const high=project();high.height=61;assert.throws(()=>analyze(high),/h ≤ 60/);
  high.height=21;assert.throws(()=>analyze(high),/least horizontal dimension/);
  const p=project();p.wind.endSolidArea=1000;assert.throws(()=>analyze(p),/cannot exceed/);
  p.wind.endSolidArea=-1;assert.throws(()=>analyze(p),/nonnegative/);
  p.wind.endSolidArea=0;p.wind.longitudinalCoefficientMode='area-weighted';assert.throws(()=>analyze(p),/5E area/);
  p.wind.windwardEndEdgeArea=300;p.wind.leewardEndEdgeArea=0;assert.throws(()=>analyze(p),/5E area cannot exceed/);
  p.wind.windwardEndEdgeArea=0;p.wind.leewardEndEdgeArea=-1;assert.throws(()=>analyze(p),/6E area must be nonnegative/);
});
test('legacy projects remain manual and longitudinal reports include source, arithmetic and load path',()=>{
  const p=cloneDefault(),old=analyze(p);delete p.wind.longitudinalSource;assert.deepEqual(analyze(p).basic,old.basic);
  const a=project();a.wind.longitudinalCoefficientReference='<script>source</script>';const r=analyze(a),html=reportHtml(a,r);
  for(const text of ['(28.3-3)','(28.3-4)','surface','Conservative whole-end-wall','21.725','4.707','max(hpost,zAE)','Σ assigned Y shears'])assert.ok(html.includes(text),text);
  assert.ok(html.includes('&lt;script&gt;source&lt;/script&gt;'));assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('Y horizontal reference'));
});
