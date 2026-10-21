import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,cloneDefault} from '../src/engine.js';
import {monoCoefficients} from '../src/chapter27.js';
import {reportHtml} from '../src/report.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const project=()=>{const p=cloneDefault();Object.assign(p,{roof:'mono',slope:12*Math.tan(7.5*Math.PI/180),xPosts:'0, 20',yPosts:'0, 24'});Object.assign(p.wind,{mwfrsSource:'asce-27',speed:62.5,kz:1,kzt:1,ke:1,kd:1,mwfrsGust:1,mwfrsBlockage:0,additionalX:0,additionalY:0});return p;};
test('Figure 27.3-4 anchors preserve angle, flow, case, direction, and both half-roof CN',()=>{
 for(const [angle,flow,gamma,loadCase,expected] of [
  [0,'clear',0,'A',[1.2,.3]],[7.49,'obstructed',180,'B',[-1.1,-.6]],
  [7.5,'clear',0,'A',[-.6,-1]],[7.5,'clear',180,'A',[.9,1.5]],
  [15,'obstructed',0,'B',[-2.1,-.6]],[22.5,'obstructed',180,'B',[1.3,0]],
  [30,'clear',180,'B',[2.6,1]],[37.5,'obstructed',180,'B',[1.9,.3]],
  [45,'clear',0,'A',[-1.6,-1.8]],[45,'obstructed',180,'B',[2.1,.4]],
 ])assert.deepEqual(monoCoefficients(angle,flow,gamma,loadCase).values,expected);
});
test('angle interpolation is allowed only 7.5–45 degrees, with the printed low-angle row',()=>{
 const a=monoCoefficients(11.25,'clear',180,'A');close(a.values[0],1.1);close(a.values[1],1.55);close(a.fraction,.5);
 assert.deepEqual(monoCoefficients(7.499,'clear',180,'A').values,[1.2,.3]);
 assert.deepEqual(monoCoefficients(7.5,'clear',180,'A').values,[.9,1.5]);
 assert.throws(()=>monoCoefficients(46,'clear',0,'A'),/45/);assert.throws(()=>monoCoefficients(15,'invented',0,'A'),/Unsupported/);
});
test('7.5 degree hand check maps the high/low edges and converts code pressure signs once',()=>{
 const r=analyze(project()),s=Math.tan(7.5*Math.PI/180);close(r.q,10);close(r.chapter27.pressureBase,10);
 const low=r.basic['W27X A γ180'],high=r.basic['W27X A γ0'];
 close(low.totalLoad[2],-5760);close(low.totalLoad[0],5760*s);
 close(low.reactions[0][2],-1080);close(low.reactions[1][2],-1800);
 close(high.totalLoad[2],3840);close(high.totalLoad[0],-3840*s);
 close(high.reactions[0][2],1200);close(high.reactions[1][2],720);
});
test('Figure 27.3-7 integrates actual h-distance bands, including the obstructed mixed B case',()=>{
 const p=project(),r=analyze(p);
 close(r.basic['W27Y A γ90'].totalLoad[2],3040);close(r.basic['W27Y B γ90'].totalLoad[2],-2840);
 close(r.basic['W27Y A γ90'].reactions[0][2],920);close(r.basic['W27Y A γ90'].reactions[2][2],600);
 close(r.basic['W27Y A γ270'].reactions[0][2],600);close(r.basic['W27Y A γ270'].reactions[2][2],920);
 p.wind.mwfrsBlockage=51;const o=analyze(p);close(o.basic['W27Y B γ90'].totalLoad[2],-240);
 assert.ok(o.basic['W27Y B γ90'].details.posts[0].roof.halves.some(a=>a.pressure>0));
 assert.ok(o.basic['W27Y B γ90'].details.posts[2].roof.halves.some(a=>a.pressure<0));
});
test('flow threshold is 50 percent and pressure contains Kd and G exactly once',()=>{
 const p=project();p.wind.mwfrsBlockage=50;assert.equal(analyze(p).chapter27.flow,'clear');
 p.wind.mwfrsBlockage=50.001;assert.equal(analyze(p).chapter27.flow,'obstructed');
 p.wind.mwfrsBlockage=0;p.wind.kd=.5;p.wind.mwfrsGust=.8;close(analyze(p).basic['W27X A γ180'].totalLoad[2],-5760*.5*.8);
});
test('roof normal lateral loads replace manual roof/reference inputs and retain separate exposed-surface loads',()=>{
 const p=project(),r=analyze(p);Object.assign(p.wind,{cfX:100,areaX:900,cfY:100,areaY:800,roofX1:100,roofY1:100,uniformRoof:false});
 assert.deepEqual(analyze(p).basic,r.basic);
 p.wind.additionalX=1000;p.wind.additionalY=800;const a=analyze(p);
 close(a.basic['W27X A γ180'].totalLoad[0],r.basic['W27X A γ180'].totalLoad[0]+1000);
 close(a.basic['W27X A γ0'].totalLoad[0],r.basic['W27X A γ0'].totalLoad[0]-1000);
 close(a.basic['W27Y A γ90'].totalLoad[1],800);close(a.basic['W27Y A γ270'].totalLoad[1],-800);
});
test('overhangs and wind-distance regions conserve total roof load and transfer moments through combinations',()=>{
 const p=project();p.overhangs={xStart:1,xEnd:2,yStart:3,yEnd:4};const r=analyze(p);
 for(const pattern of r.chapter27.patterns){
  const roof=r.basic[pattern.name].details.posts.map(v=>v.roof);
  close(roof.reduce((s,a)=>s+a.halves.reduce((b,v)=>b+v.area,0),0),713);
  for(const post of r.basic[pattern.name].reactions)assert.ok(post.every(Number.isFinite));
 }
 assert.equal(r.cases.length,123);assert.equal(Object.keys(r.windForces).length,8);
 assert.ok(r.cases.some(c=>c.name==='0.9D + W27X A γ180'));
 const c=r.cases.find(c=>c.name==='D + 0.6W27X A γ180');c.reactions.forEach((row,i)=>row.forEach((v,j)=>close(v,r.basic.D.reactions[i][j]+.6*r.basic['W27X A γ180'].reactions[i][j])));
});
test('inapplicable gable, edition, h/L and input conditions stop automatic lookup',()=>{
 const p=project();p.roof='gable';assert.throws(()=>analyze(p),/Figure 27.3-5/);p.roof='mono';p.height=2;assert.throws(()=>analyze(p),/0.25 ≤ h\/LX/);
 p.height=10;p.code='2022 CBC / ASCE 7-16';assert.throws(()=>analyze(p),/ASCE 7-22/);p.code='2025 CBC / ASCE 7-22';p.wind.mwfrsGust=0;assert.throws(()=>analyze(p),/gust factor/);
 p.wind.mwfrsGust=1;p.wind.additionalX='';assert.throws(()=>analyze(p),/additional horizontal X/);
});
test('legacy projects can opt in without new additional-force properties, and C&C remains separate',()=>{
 const p=project();delete p.wind.additionalX;delete p.wind.additionalY;const r=analyze(p);assert.equal(r.chapter27.mode,'asce-27');
 p.wind.cc[0].up=80;assert.deepEqual(analyze(p).basic,r.basic);
 const html=reportHtml(p,r);assert.ok(html.includes('Eq. (27.3-2)'));assert.ok(html.includes('Gable Figure 27.3-5'));assert.ok(html.includes('Source coefficients and pressure regions'));assert.ok(!html.includes('X horizontal reference'));
});
