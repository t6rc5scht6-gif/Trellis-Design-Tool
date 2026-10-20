import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupFreeRoofCc,deriveCc,windMeanHeight,roofAngle} from '../src/windTables.js';
import {cloneDefault,analyze,velocityPressure} from '../src/engine.js';
import {reportHtml} from '../src/report.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const lookup=(args={})=>lookupFreeRoofCc({roof:'mono',theta:0,h:10,width:20,length:24,effectiveArea:1,blockage:0,...args});
const automatic=()=>{const p=cloneDefault();p.wind.ccSource='asce-30.5';return p;};
test('Figure 30.5-1 Zone 3 small-area anchors match both supplied flow tables',()=>{
  // Independently read from the five printed Zone 3 small-area rows in Figure 30.5-1.
  const angles=[0,7.5,15,30,45],clear=[[2.4,-3.3],[3.2,-4.2],[3.6,-3.8],[5.2,-5],[5.2,-4.6]],obstructed=[[1,-3.6],[1.6,-5.1],[2.4,-4.2],[3.2,-4.6],[4.2,-3.8]];
  for(let i=0;i<angles.length;i++)for(const [blockage,expected] of [[0,clear[i]],[51,obstructed[i]]]){const z=lookup({theta:angles[i],blockage}).zones[2];close(z.cnToward,expected[0]);close(z.cnAway,expected[1]);}
});
test('Figure 30.5-2 Zone 3 small-area anchors match both supplied flow tables',()=>{
  const angles=[0,7.5,15,30,45],clear=[[2.4,-3.3],[2.2,-3.6],[2.2,-2.2],[2.6,-1.8],[2.2,-1.6]],obstructed=[[1,-3.6],[1,-5.1],[1,-3.2],[1,-2.4],[1,-2.4]];
  for(let i=0;i<angles.length;i++)for(const [blockage,expected] of [[0,clear[i]],[51,obstructed[i]]]){const z=lookup({roof:'gable',theta:angles[i],blockage}).zones[2];close(z.cnToward,expected[0]);close(z.cnAway,expected[1]);}
});
test('Zone 1 and Zone 2 preserve their own printed coefficients',()=>{
  const m=lookup({theta:45}),g=lookup({roof:'gable',theta:30}),o=lookup({roof:'gable',theta:15,blockage:80});
  close(m.zones[0].cnToward,2.6);close(m.zones[0].cnAway,-2.3);close(m.zones[1].cnToward,3.9);close(m.zones[1].cnAway,-3.5);
  close(g.zones[0].cnToward,1.3);close(g.zones[0].cnAway,-.9);close(g.zones[1].cnToward,2);close(g.zones[1].cnAway,-1.4);
  close(o.zones[0].cnToward,.5);close(o.zones[0].cnAway,-1.6);close(o.zones[1].cnToward,.8);close(o.zones[1].cnAway,-2.4);
});
test('effective-area boundaries are inclusive as printed, without area interpolation',()=>{
  const small=lookup({theta:15,effectiveArea:9}),middle=lookup({theta:15,effectiveArea:9.000001}),middleEnd=lookup({theta:15,effectiveArea:36}),large=lookup({theta:15,effectiveArea:36.000001});
  close(small.a,3);assert.equal(small.band,0);assert.equal(middle.band,1);assert.equal(middleEnd.band,1);assert.equal(large.band,2);
  close(small.zones[2].cnToward,3.6);close(middle.zones[2].cnToward,2.7);close(middleEnd.zones[2].cnAway,-2.9);
  for(const z of large.zones){close(z.cnToward,1.8);close(z.cnAway,-1.9);}
});
test('middle-area Zone 3 uses its middle row and large-area rows equal Zone 1',()=>{
  for(const roof of ['mono','gable'])for(const blockage of [0,75])for(const theta of [0,7.5,15,30,45]){
    const a=lookup({roof,blockage,theta,effectiveArea:1}),b=lookup({roof,blockage,theta,effectiveArea:20}),c=lookup({roof,blockage,theta,effectiveArea:100});
    close(b.zones[2].cnToward,a.zones[1].cnToward);close(b.zones[2].cnAway,a.zones[1].cnAway);
    for(const z of c.zones){close(z.cnToward,a.zones[0].cnToward);close(z.cnAway,a.zones[0].cnAway);}
  }
});
test('angle interpolation uses the permitted linear arithmetic for both signs',()=>{
  const m=lookup({theta:11.25}),g=lookup({roof:'gable',theta:11.25}),o=lookup({roof:'gable',theta:22.5,blockage:75});
  close(m.fraction,.5);close(m.zones[2].cnToward,3.4);close(m.zones[2].cnAway,-4);
  close(g.zones[2].cnToward,2.2);close(g.zones[2].cnAway,-2.9);close(o.zones[2].cnToward,1);close(o.zones[2].cnAway,-2.8);
});
test('exact 50 percent blockage is clear and any larger blockage is obstructed',()=>{
  assert.equal(lookup({blockage:50}).flow,'clear');assert.equal(lookup({blockage:50.000001}).flow,'obstructed');
  close(lookup({blockage:50}).zones[2].cnAway,-3.3);close(lookup({blockage:50.000001}).zones[2].cnAway,-3.6);
});
test('zone dimension a follows the least horizontal dimension and 3 ft lower bound',()=>{
  close(lookup().a,3);close(lookup({width:80,length:100,h:30}).a,8);
});
test('mean roof height uses eave at low angle, average above 10 degrees, and explicit overrides',()=>{
  const p=automatic();p.roof='mono';p.slope=12*Math.tan(10*Math.PI/180);close(windMeanHeight(p).value,10);
  p.slope=3;close(roofAngle(p),Math.atan(.25)*180/Math.PI);close(windMeanHeight(p).value,12.5);
  p.roof='gable';close(windMeanHeight(p).value,11.25);p.wind.ccMeanHeight=13;close(windMeanHeight(p).value,13);assert.equal(windMeanHeight(p).overridden,true);
});
test('applicability checks both along-wind h/L ratios and permits exact boundaries',()=>{
  assert.doesNotThrow(()=>lookup({width:40,length:40,h:10}));assert.doesNotThrow(()=>lookup({width:10,length:10,h:10}));
  assert.throws(()=>lookup({width:40.001,length:40,h:10}),/h\/L limits for X/);assert.throws(()=>lookup({width:20,length:41,h:10}),/h\/L limits for Y/);
  assert.throws(()=>lookup({width:9.99,length:20,h:10}),/h\/L limits/);
  assert.throws(()=>lookup({theta:45.001}),/No extrapolation/);assert.throws(()=>lookup({theta:-.1}),/No extrapolation/);
});
test('invalid inputs and unsupported editions never silently clamp or use example values',()=>{
  for(const args of [{blockage:101},{blockage:-1},{effectiveArea:0},{theta:NaN},{h:0},{width:Infinity}])assert.throws(()=>lookup(args));
  const p=automatic();p.code='2022 CBC / ASCE 7-16';assert.throws(()=>analyze(p),/supplied ASCE 7-22 figures/);
  p.code='2025 CBC / ASCE 7-22';p.wind.ccGust=0;assert.throws(()=>analyze(p),/gust multiplier/);
});
test('Eq 30.5-1 applies Kd and G exactly once and converts figure signs to uplift convention',()=>{
  const p=automatic();Object.assign(p.wind,{speed:100,kz:1,kzt:1,kd:.5,ke:1,ccGust:.85,ccMinimumPressure:0,ccEffectiveArea:1});p.roof='flat';
  const r=analyze(p),z=r.cc[2];close(r.q,25.6);close(z.cnToward,2.4);close(z.cnAway,-3.3);
  close(z.upPressure,25.6*.5*.85*3.3);close(z.downPressure,-25.6*.5*.85*2.4);
  close(z.upForce,z.upPressure*10);close(z.downForce,z.downPressure*10);assert.ok(z.upPressure>0&&z.downPressure<0);
});
test('entered pressure floor acts independently in both signs and is reported as governing',()=>{
  const p=automatic();p.wind.ccMinimumPressure=100;const r=analyze(p);
  for(const z of r.cc){close(z.upPressure,100);close(z.downPressure,-100);assert.equal(z.upFloorGoverns,true);assert.equal(z.downFloorGoverns,true);}
  assert.equal(r.ccResult.pressureReviewed,false);
});
test('automatic C&C never replaces or adds to MWFRS post actions',()=>{
  const p=cloneDefault(),manual=analyze(p);p.wind.ccSource='asce-30.5';p.wind.ccGust=1.2;p.wind.ccMinimumPressure=50;const automatic=analyze(p);
  assert.deepEqual(automatic.basic,manual.basic);assert.deepEqual(automatic.cases,manual.cases);
});
test('legacy manual projects retain net coefficients and do not receive another gust multiplier',()=>{
  const p=cloneDefault();delete p.wind.ccSource;delete p.wind.ccGust;const r=analyze(p);
  close(r.cc[0].upPressure,15.9971904*.9);close(r.cc[0].downPressure,-15.9971904*.6);assert.equal(r.ccResult.mode,'manual');
  p.code='2022 CBC / ASCE 7-16';const older=analyze(p);close(older.q,15.9971904);close(older.cc[0].upPressure,r.cc[0].upPressure);
});
test('qh and Kd decomposition preserves existing MWFRS values while correcting the printed qh',()=>{
  const p=cloneDefault(),r=analyze(p);close(r.q,18.820224);close(r.windPressure,15.9971904);
  close(r.basic['WX+'].details.referenceForce,15.9971904*1.3*60);close(r.basic['WX+'].totalLoad[2],15.9971904*.9*480);
  close(velocityPressure(p.wind,'ASCE 7-16'),15.9971904);
});
test('automatic report includes source figure, interpolation, pressure equation, and signed coefficients',()=>{
  const p=automatic(),r=analyze(p),html=reportHtml(p,r);assert.ok(html.includes('ASCE Figure 30.5-2'));assert.ok(html.includes('p = qh Kd G CN'));assert.ok(html.includes('CN = CN,low + f'));assert.ok(html.includes('CN+ toward'));assert.ok(html.includes('project input, not obtained from the figures'));
});
test('automatic table selection does not read hidden manual coefficient values',()=>{
  const p=automatic();p.wind.cc[0].up='';p.wind.cc[0].down=5;
  assert.doesNotThrow(()=>analyze(p));p.wind.ccSource='manual';assert.throws(()=>analyze(p),/C&C coefficients/);
});
