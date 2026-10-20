import { deriveLongitudinalWind, isEnvelopeLongitudinal, longitudinalPostShare } from './longitudinalWind.js';
import { deriveCc, isAutomaticCc } from './windTables.js';
// Direct hand calculations for independent fixed-base cantilever columns.
// Units: feet, pounds, pound-feet. No stiffness matrix or FEA.
export const DEFAULT_PROJECT = {
  version: 1, name: 'Davis canopy', address: '28193 Mace Blvd, Davis, CA 95618',
  code: '2025 CBC / ASCE 7-22', risk: 'II', roof: 'gable', width: 20, length: 24, height: 10, slope: 2,
  xPosts: '0, 10, 20', yPosts: '0, 12, 24', dead: 12, live: 20, distribution: 'tributary',
  wind: { speed: 93, kz: 0.85, kzt: 1, kd: 0.85, ke: 1, exposure: 'C',
    cfX: 1.3, cfY: 1.3, areaX: 60, areaY: 50,
    longitudinalSource: 'manual', longitudinalCoefficientMode: 'edge-envelope', windwardEndEdgeArea: '', leewardEndEdgeArea: '', endSolidArea: 0, longitudinalGcWindward: '', longitudinalGcLeeward: '', longitudinalCoefficientReference: '', longitudinalReviewed: false, roofX1: 0.9, roofX2: 0.9, roofY1: 0.7, roofY2: 0.7,
    roofX1Down: -0.6, roofX2Down: -0.6, roofY1Down: -0.5, roofY2Down: -0.5,
    uniformRoof: true, ccArea: 10, ccEffectiveArea: 10,
    ccSource: 'manual', ccBlockage: 0, ccGust: 0.85, ccMinimumPressure: 16, ccMeanHeight: '', ccPressureReviewed: false,
    cc: [{name:'Interior',up:0.9,down:-0.6},{name:'Edge',up:1.4,down:-0.8},{name:'Corner',up:1.8,down:-1.0}],
    reviewed: false, reference: 'Illustrative coefficients. Select net coefficients for the applicable free-roof procedure and effective wind area.' },
  seismic: { sds: 0.81, sd1: 0.51, s1: 0.29, ss: 0.88, tl: 8, sdc: 'D', site: 'Default',
    method: 'elf', cs: 0.54, sa: 0.81, period: 0.2, r: 1.5, ie: 1, rho: 1, liveFraction: 0,
    verticalFactor: 0.162, reviewed: false,
    reference: 'Cantilever columns, R = 1.5 (user instruction). Confirm Chapter 15 structure-similar-to-buildings classification and supply Sa(T) at the selected period. The starting Sa(T) is illustrative.' },
  hazard: { name: 'ASCEDesignHazardsReport (12).pdf', date: '2026-10-19', latitude: 38.529437, longitude: -121.692689, source: 'User-provided ASCE Hazards Report · ASCE/SEI 7-22' }
};
export const cloneDefault = () => structuredClone(DEFAULT_PROJECT);
const fail = message => { throw new Error(message); };
const positive = (v, label, zero = false) => { if (!Number.isFinite(v) || (zero ? v < 0 : v <= 0)) fail(`${label} must be ${zero ? 'nonnegative' : 'positive'} and finite.`); };
export function coordinates(text, span, name) {
  const parts = String(text).split(',').map(x => x.trim());
  if (parts.some(x => x === '')) fail(`${name}: enter comma-separated post coordinates.`);
  const a = parts.map(Number);
  if (a.length < 2 || a.length > 6 || a.some(x => !Number.isFinite(x))) fail(`${name}: enter 2–6 finite coordinates.`);
  if (Math.abs(a[0]) > 1e-8 || Math.abs(a.at(-1) - span) > 1e-8) fail(`${name} must start at 0 and end at ${span} ft.`);
  if (a.some((x,i) => i && x - a[i-1] < 0.1)) fail(`${name} must increase by at least 0.1 ft.`);
  return a;
}
export function validate(p) {
  if (!p || p.version !== 1) fail('Unsupported project format. Import a version 1 Trellis project.');
  if (typeof p.name !== 'string' || typeof p.address !== 'string') fail('Project name and address must be text.');
  if (!['2025 CBC / ASCE 7-22','2022 CBC / ASCE 7-16'].includes(p.code)) fail('Choose a supported code edition.');
  if (!['I','II','III','IV'].includes(p.risk)) fail('Choose a valid risk category.');
  if (!['tributary','equal'].includes(p.distribution)) fail('Choose tributary or equal lateral load distribution.');
  if (p.hazard) {
    for (const key of ['name','source']) if (typeof p.hazard[key] !== 'string') fail('Hazard source metadata must be text.');
    for (const key of ['latitude','longitude']) if (p.hazard[key] !== undefined && !Number.isFinite(p.hazard[key])) fail('Hazard coordinates must be finite.');
  }
  if (!['flat','mono','gable'].includes(p.roof)) fail('Choose a supported roof shape.');
  for (const key of ['width','length','height']) { positive(p[key],key); if (p[key] > 300) fail(`${key} exceeds this model’s 300 ft input limit.`); }
  positive(p.slope,'Roof rise',true); if (p.slope > 12) fail('Roof slope must be between 0:12 and 12:12.');
  for (const k of ['dead','live']) positive(p[k],k,true);
  coordinates(p.xPosts,p.width,'X post coordinates'); coordinates(p.yPosts,p.length,'Y post coordinates');
  const w = p.wind, s = p.seismic;
  if (!w || !s) fail('Wind and seismic inputs are required.');
  if (typeof w.reviewed !== 'boolean' || typeof s.reviewed !== 'boolean' || typeof w.uniformRoof !== 'boolean') fail('Review and roof-pattern flags must be boolean.');
  for (const [value,label] of [[w.reference,'Wind reference'],[s.reference,'Seismic reference'],[s.site,'Soil class'],[s.sdc,'Seismic category']]) if (typeof value !== 'string') fail(`${label} must be text.`);
  if (!['B','C','D'].includes(w.exposure)) fail('Choose a valid exposure.');
  for (const k of ['speed','kz','kzt','kd','ke','ccArea','ccEffectiveArea']) positive(w[k],`Wind ${k}`);
  if (!['manual','asce-28.3.7'].includes(w.longitudinalSource??'manual')) fail('Choose a supported longitudinal wind source.');
  for (const k of (isEnvelopeLongitudinal(p)?['cfX','areaX']:['cfX','cfY','areaX','areaY'])) positive(w[k],`Wind ${k}`,true);
  for (const k of ['roofX1','roofX2','roofY1','roofY2']) { positive(w[k],`Uplift ${k}`,true); if(!Number.isFinite(w[k+'Down'])||w[k+'Down']>0)fail(`Downward ${k} must be finite and nonpositive.`); }
  if (!['manual','asce-30.5'].includes(w.ccSource??'manual')) fail('Choose a supported C&C coefficient source.');
  if (!Array.isArray(w.cc) || w.cc.length !== 3) fail('Three C&C regions are required.');
  for (const zone of w.cc) {
    if (typeof zone.name !== 'string') fail('C&C region names must be text.');
    if (!isAutomaticCc(p) && (!Number.isFinite(zone.up) || zone.up < 0 || !Number.isFinite(zone.down) || zone.down > 0)) fail('C&C coefficients require nonnegative uplift and nonpositive downward values.');
  }
  for (const k of ['sds','sd1','s1','ss','sa','cs','verticalFactor','liveFraction']) positive(s[k],`Seismic ${k}`,true);
  for (const k of ['tl','r','ie','rho','period']) positive(s[k],`Seismic ${k}`);
  if (!['elf','manual'].includes(s.method)) fail('Choose a supported seismic method.');
  if (s.r !== 1.5) fail('This application uses R = 1.5 for the user-specified cantilever-column system.');
  if (s.liveFraction > 1) fail('Seismic live-load fraction must be 0–1.');
}
export function geometry(p) {
  const xp=coordinates(p.xPosts,p.width,'X post coordinates'), yp=coordinates(p.yPosts,p.length,'Y post coordinates');
  const xs=[...xp];if(!xs.some(x=>Math.abs(x-p.width/2)<1e-8))xs.push(p.width/2);xs.sort((a,b)=>a-b);
  const rise=p.roof==='flat'?0:p.slope/12;
  const z=x=>p.height+(p.roof==='gable'?Math.min(x,p.width-x):x)*rise;
  const nodes=[],posts=[],members=[],cells=[];
  const edges=(values,i,span)=>[i? (values[i-1]+values[i])/2:0,i<values.length-1?(values[i]+values[i+1])/2:span];
  for(let j=0;j<yp.length;j++)for(let i=0;i<xs.length;i++){
    const id=nodes.length,pos=[xs[i],yp[j],z(xs[i])],xi=xp.findIndex(x=>Math.abs(x-xs[i])<1e-8);
    nodes.push({id,pos});
    if(xi>=0){const xb=edges(xp,xi,p.width),yb=edges(yp,j,p.length),tx=xb[1]-xb[0],ty=yb[1]-yb[0];
      const name=`P${String(posts.length+1).padStart(2,'0')}`;
      posts.push({name,node:id,pos,tx,ty,area:tx*ty,xBounds:xb,yBounds:yb});members.push({a:null,b:id,base:[xs[i],yp[j],0],type:'column'});
    }
    if(i)members.push({a:id-1,b:id,type:'beam'});if(j)members.push({a:id-xs.length,b:id,type:'beam'});
    if(i&&j){const ids=[id-xs.length-1,id-xs.length,id,id-1],area=(xs[i]-xs[i-1])*(yp[j]-yp[j-1]);
      const slope=(z(xs[i])-z(xs[i-1]))/(xs[i]-xs[i-1]);cells.push({ids,area,slope,half:(xs[i]+xs[i-1])/2<=p.width/2?1:2});}
  }
  return {nodes,posts,members,cells,xs,ys:yp,area:p.width*p.length,roofArea:cells.reduce((s,c)=>s+c.area*Math.sqrt(1+c.slope*c.slope),0)};
}
export const directionalityInQ=p=>p.code.includes('7-16');
export function velocityPressure(w,code='ASCE 7-22'){return 0.00256*w.kz*w.kzt*w.ke*w.speed**2*(code.includes('7-16')?w.kd:1);}
export const velocityPressureFormula=p=>directionalityInQ(p)?'qh = 0.00256 Kz Kzt Kd Ke Vult²':'qh = 0.00256 Kz Kzt Ke Vult²';
export function seismicCoefficient(s) {
  if(s.method==='manual')return {cs:s.cs,raw:s.cs,minimum:0,governing:'Engineer-entered Cs; confirm Chapter 15 minimum and spectrum requirements separately'};
  const raw=s.sa*s.ie/1.5,minimum=Math.max(0.044*s.sds*s.ie,0.01,s.s1>=0.6?0.5*s.s1*s.ie/1.5:0);
  return {cs:Math.max(raw,minimum),raw,minimum,governing:raw>=minimum?'Sa(T) Ie / R':'Chapter 12 ELF minimum'};
}
export const WIND_CASES=['WX+','WX+↓','WX−','WX−↓','WY+','WY+↓','WY−','WY−↓'];
export const DEMAND_LABELS={compression:'Compression',uplift:'Uplift',shear:'Shear',moment:'Moment'};
export const directionalReference=p=>p.code.includes('7-22')?'ASCE 7-22 §12.5.1.2(a)':'100/30 project assumption · verify ASCE 7-16 applicability';
export function orthogonalSeismicPatterns(){
  const patterns=[];
  for(const primary of ['X','Y'])for(const sx of ['+','−'])for(const sy of ['+','−']){
    const x=primary==='X'?1:0.3,y=primary==='Y'?1:0.3;
    const name=primary==='X'?`EX${sx} + 0.3EY${sy}`:`0.3EX${sx} + EY${sy}`;
    patterns.push({name,factors:{[`EX${sx}`]:x,[`EY${sy}`]:y},primary,signX:sx,signY:sy});
  }
  return patterns;
}
export function combinations(p) {
  const a=[{name:'D',family:'Basic',factors:{D:1}},{name:'Lr',family:'Basic',factors:{Lr:1}}];
  const winds=WIND_CASES,axes=['EX+','EX−','EY+','EY−'],patterns=orthogonalSeismicPatterns();
  for(const w of winds)a.push({name:w,family:'Basic',factors:{[w]:1}});
  // Keep single-axis cases as basic references. Design E cases use all eight 100/30 patterns.
  for(const e of axes)a.push({name:e,family:'Basic',factors:{[e]:1}});
  const add=(family,name,factors,pattern)=>a.push({family,name,factors,...(pattern?{directional:pattern}: {})});
  const seismicFactors=(pattern,factor)=>Object.fromEntries(Object.entries(pattern.factors).map(([key,value])=>[key,value*factor]));
  for(const pattern of patterns)add('Basic',pattern.name,{...pattern.factors},pattern);
  add('Service','D + Lr',{D:1,Lr:1});
  winds.forEach(w=>add('Service',`D + ${w}`,{D:1,[w]:1}));
  for(const pattern of patterns)add('Service',`D + (${pattern.name})`,{D:1,...pattern.factors},pattern);
  add('LRFD','1.4D',{D:1.4});add('LRFD','1.2D + 1.6Lr',{D:1.2,Lr:1.6});
  for(const w of winds){add('LRFD',`1.2D + 1.6Lr + 0.5${w}`,{D:1.2,Lr:1.6,[w]:0.5});add('LRFD',`1.2D + ${w} + 0.5Lr`,{D:1.2,Lr:.5,[w]:1});add('LRFD',`0.9D + ${w}`,{D:.9,[w]:1});}
  const ev=p.seismic.verticalFactor,rho=p.seismic.rho;
  for(const pattern of patterns){
    add('LRFD',`1.2D + Ev + ρ(${pattern.name})`,{D:1.2+ev,...seismicFactors(pattern,rho)},pattern);
    add('LRFD',`0.9D − Ev + ρ(${pattern.name})`,{D:.9-ev,...seismicFactors(pattern,rho)},pattern);
  }
  add('ASD','D',{D:1});add('ASD','D + Lr',{D:1,Lr:1});
  for(const w of winds){add('ASD',`D + 0.6${w}`,{D:1,[w]:.6});add('ASD',`D + 0.75Lr + 0.45${w}`,{D:1,Lr:.75,[w]:.45});add('ASD',`0.6D + 0.6${w}`,{D:.6,[w]:.6});}
  for(const pattern of patterns){
    add('ASD',`D + 0.7Ev + 0.7ρ(${pattern.name})`,{D:1+.7*ev,...seismicFactors(pattern,.7*rho)},pattern);
    add('ASD',`0.6D − 0.7Ev + 0.7ρ(${pattern.name})`,{D:.6-.7*ev,...seismicFactors(pattern,.7*rho)},pattern);
  }
  return a;
}
// Sum net pressure over the two halves of a post's tributary rectangle.
export function roofForce(p,post,axis,sign,down,q){
  const f=[0,0,0],mid=p.width/2,halfAreas=[];
  const coeff=half=>p.wind[`roof${axis}${axis==='X'&&sign<0?3-half:half}${down?'Down':''}`];
  const governing=down?Math.min(coeff(1),coeff(2)):Math.max(coeff(1),coeff(2));
  for(const half of [1,2]){
    const left=Math.max(post.xBounds[0],half===1?0:mid),right=Math.min(post.xBounds[1],half===1?mid:p.width);
    const area=Math.max(0,right-left)*post.ty;
    const slope=p.roof==='flat'?0:(p.slope/12)*(p.roof==='gable'&&half===2?-1:1);
    const gc=p.wind.uniformRoof?governing:coeff(half),pressure=q*gc;
    f[0]+=-pressure*slope*area;f[2]+=pressure*area;halfAreas.push({half,area,slope,gc,pressure});
  }
  return {force:f,halves:halfAreas};
}
export function analyze(p){
  validate(p);const model=geometry(p),q=velocityPressure(p.wind,p.code),windPressure=q*(directionalityInQ(p)?1:p.wind.kd),weight=(p.dead+p.live*p.seismic.liveFraction)*model.area;
  const seismicResult=seismicCoefficient(p.seismic),cs=seismicResult.cs,baseShear=cs*weight;
  const longitudinal=deriveLongitudinalWind(p,q,model.ys.length);
  const basic={},windForces={},postCalcs=model.posts.map(post=>({...post,share:p.distribution==='equal'?1/model.posts.length:post.area/model.area,dead:p.dead*post.area,live:p.live*post.area}));
  const makeCase=(name,forces,details={})=>{
    const reactions=forces.map(([fx,fy,fz],i)=>[fx,fy,fz,-fy*(details.longitudinal?details.posts[i].horizontalHeight:model.posts[i].pos[2]),fx*model.posts[i].pos[2],0]);
    const totalLoad=[0,1,2].map(j=>forces.reduce((sum,f)=>sum+f[j],0));
    basic[name]={reactions,totalLoad,support:reactions.map(row=>row.map(v=>-v)),details};
  };
  makeCase('D',postCalcs.map(post=>[0,0,-post.dead]));makeCase('Lr',postCalcs.map(post=>[0,0,-post.live]));
  for(const axis of ['X','Y'])for(const sign of [1,-1])for(const down of [false,true]){
    const name=`W${axis}${sign>0?'+':'−'}${down?'↓':''}`,H=axis==='Y'&&longitudinal?longitudinal.force:windPressure*p.wind[`cf${axis}`]*p.wind[`area${axis}`],details=[];
    const forces=postCalcs.map(post=>{
      const roof=roofForce(p,post,axis,sign,down,windPressure),f=[...roof.force],share=axis==='Y'&&longitudinal?longitudinalPostShare(p,post):post.share,horizontal=sign*H*share;
      const horizontalHeight=axis==='Y'&&longitudinal?Math.max(post.pos[2],longitudinal.centroidZ):post.pos[2];
      f[axis==='X'?0:1]+=horizontal;details.push({horizontal,roof,share,horizontalHeight});return f;
    });
    makeCase(name,forces,{posts:details,referenceForce:H,down,longitudinal:axis==='Y'&&!!longitudinal});windForces[name]=basic[name].totalLoad;
  }
  for(const axis of ['X','Y'])for(const sign of [1,-1])makeCase(`E${axis}${sign>0?'+':'−'}`,postCalcs.map(post=>axis==='X'?[sign*baseShear*post.share,0,0]:[0,sign*baseShear*post.share,0]));
  const cases=combinations(p).map(c=>({...c,reactions:model.posts.map((_,i)=>Array.from({length:6},(_,j)=>Object.entries(c.factors).reduce((s,[key,factor])=>s+basic[key].reactions[i][j]*factor,0))),totalLoad:[0,1,2].map(j=>Object.entries(c.factors).reduce((s,[key,factor])=>s+basic[key].totalLoad[j]*factor,0))}));
  const ccResult=deriveCc(p,q),cc=ccResult.zones;
  const forceAccountingError=Math.max(Math.abs(postCalcs.reduce((s,v)=>s+v.area,0)-model.area),Math.abs(basic['EX+'].totalLoad[0]-baseShear));
  return {model,basic,cases,q,windPressure,weight,cs,baseShear,seismicResult,cc,ccResult,longitudinal,windForces,postCalcs,forceAccountingError};
}
export function envelope(result,family) {
  const cases=result.cases.filter(c=>c.family===family);
  return result.model.posts.map((post,i)=>({post,components:Array.from({length:6},(_,j)=>{
    let min={value:Infinity,case:''},max={value:-Infinity,case:''};
    for(const c of cases){const value=c.reactions[i][j];if(value<min.value)min={value,case:c.name};if(value>max.value)max={value,case:c.name};}return {min,max};
  })}));
}
const demandValues=row=>({compression:Math.max(0,-row[2]),uplift:Math.max(0,row[2]),shear:Math.hypot(row[0],row[1]),moment:Math.hypot(row[3],row[4])});
// Use unrounded values for ties. The tolerance is in lb or lb-ft, not displayed kip precision.
const demandTie=(value,max)=>Math.abs(value-max)<=1e-7+1e-9*Math.abs(max);
export function governingBases(result,family){
  const all=result.cases.filter(c=>c.family===family).flatMap(c=>c.reactions.map((row,i)=>({post:result.model.posts[i].name,case:c.name,reactions:row,...demandValues(row)})));
  if(!all.length)return [];
  return Object.keys(DEMAND_LABELS).map(key=>{
    const winner=all.reduce((a,b)=>b[key]>a[key]?b:a),active=winner[key]>1e-7;
    return {key,...winner,active,ties:active?all.filter(row=>demandTie(row[key],winner[key])):[]};
  });
}
export function governingCaseMap(result,family){
  const map={};
  for(const criterion of governingBases(result,family))for(const tie of criterion.ties){
    const entry=map[tie.case]||={metrics:[],posts:{}};
    if(!entry.metrics.includes(criterion.key))entry.metrics.push(criterion.key);
    (entry.posts[criterion.key]||=[]).push(tie.post);
  }
  return map;
}
export function governingPostMetrics(caseInfo,post){
  return caseInfo?caseInfo.metrics.filter(key=>caseInfo.posts[key].includes(post)):[];
}
export function warnings(p){return [
  ...(!p.wind.reviewed?[isEnvelopeLongitudinal(p)?'Transverse and roof MWFRS wind coefficients/reference areas remain manual and require project-specific code selection.':isAutomaticCc(p)?'MWFRS wind coefficients and reference areas remain manual and require project-specific code selection.':'Wind coefficients and reference areas are illustrative and require project-specific code selection.']:[]),
  ...(isEnvelopeLongitudinal(p)?['§28.3.7 supplies longitudinal ±Y force only. Verify Chapter 28 eligibility, Figure 28.3-1 Load Case 2 area-averaged coefficients, transverse-frame configuration, and the longitudinal sidewall load path. The referenced Chapter 27 roof pressures and transverse wind remain separate project inputs. Figure 28.3-1 supplies the Case 2 end-wall coefficients; the chosen averaging/envelope assumption is reported.']:[]),
  ...(isEnvelopeLongitudinal(p)&&!p.wind.longitudinalReviewed?['Longitudinal envelope inputs/load path are not marked reviewed. The hand model splits F equally to the two outer sidewalls and assigns it along each sidewall by tributary length. Base design moments conservatively use max(post-top height, end-wall centroid height).']:[]),
  ...(isAutomaticCc(p)&&!p.wind.ccPressureReviewed?['C&C CN values are derived from the supplied figures. Pressure uses ASCE 7-22 Eq. (30.5-1), p = qh Kd G CN. Confirm the entered G and minimum-pressure floor; the 16 psf starting floor is a project input, not derived from these figures.']:[]),
  ...(isAutomaticCc(p)?['C&C zones are the numbered regions in the selected figure. Confirm component location from the figure, including the gable layout change at 10°; automatic component-location/zone assignment is not performed.']:[]),
  ...(!p.seismic.reviewed?['Confirm the Chapter 15 classification, design spectrum ordinate Sa(T), period, Cs, and vertical seismic factor. R is fixed at 1.5 by project instruction.']:[]),
  ...(p.seismic.site==='Default'?['The hazard report uses Default soil class. Confirm site class and the applicable spectrum procedure.']:[]),
  ...(p.code.includes('7-16')&&p.hazard?.source?.includes('7-22')?['The ASCE 7-22 hazard report does not match the selected ASCE 7-16 edition.']:[]),
  `Independent cantilever posts; roof gravity and roof-normal wind loads use geometric tributary areas. ${isEnvelopeLongitudinal(p)?'Transverse wind and seismic use':'Horizontal reference wind and seismic use'} ${p.distribution==='equal'?'equal load per post':'tributary area fractions'}${isEnvelopeLongitudinal(p)?'; §28.3.7 longitudinal wind uses the two outer sidewalls and their tributary lengths':''}. This is an assigned load path, not a stiffness redistribution or a universal conservative bound.`,
  ...(p.wind.uniformRoof?['For each direction and sign, apply the governing net roof coefficient uniformly. This envelopes the entered local pressures but does not replace checking all required code wind patterns.']:[]),
  'Roof-load eccentric moments, diaphragm torsion, accidental torsion, P–Δ, overstrength/anchorage, and member/connection/foundation capacity are outside this hand-calculation scope.',
  'Seismic design combinations include all eight signed 100%/30% orthogonal patterns. This implements directional force effects; member/foundation strength and drift acceptance checks remain outside the app.',
  'Only D, unreduced roof live Lr, W, and E are combined. Check snow, rain/ponding, ice, thermal, and other applicable loads separately.'
];}
