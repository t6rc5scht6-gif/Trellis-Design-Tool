import { roofPlan, geometricWindHeight, roofHeightAt, patchMoment } from './roofGeometry.js';
import { roofAngle } from './windTables.js';
export const isChapter27=p=>p.wind.mwfrsSource==='asce-27';
// User-supplied Fig. 27.3-4. Each row = [gamma0 clear, gamma0 obstructed,
// gamma180 clear, gamma180 obstructed]; each pair is [CNw,CNl].
export const MONO_ROWS=[
  {theta:0,A:[[1.2,.3],[-.5,-1.2],[1.2,.3],[-.5,-1.2]],B:[[-1.1,-.1],[-1.1,-.6],[-1.1,-.1],[-1.1,-.6]]},
  {theta:7.5,A:[[-.6,-1],[-1,-1.5],[.9,1.5],[-.2,-1.2]],B:[[-1.4,0],[-1.7,-.8],[1.6,.3],[.8,-.3]]},
  {theta:15,A:[[-.9,-1.3],[-1.1,-1.5],[1.3,1.6],[.4,-1.1]],B:[[-1.9,0],[-2.1,-.6],[1.8,.6],[1.2,-.3]]},
  {theta:22.5,A:[[-1.5,-1.6],[-1.5,-1.7],[1.7,1.8],[.5,-1]],B:[[-2.4,-.3],[-2.3,-.9],[2.2,.7],[1.3,0]]},
  {theta:30,A:[[-1.8,-1.8],[-1.5,-1.8],[2.1,2.1],[.6,-1]],B:[[-2.5,-.5],[-2.3,-1.1],[2.6,1],[1.6,.1]]},
  {theta:37.5,A:[[-1.8,-1.8],[-1.5,-1.8],[2.1,2.2],[.7,-.9]],B:[[-2.4,-.6],[-2.2,-1.1],[2.7,1.1],[1.9,.3]]},
  {theta:45,A:[[-1.6,-1.8],[-1.3,-1.8],[2.2,2.5],[.8,-.9]],B:[[-2.3,-.7],[-1.9,-1.2],[2.6,1.4],[2.1,.4]]},
];
export function monoCoefficients(theta,flow,gamma,loadCase){
  if(!Number.isFinite(theta)||theta<0||theta>45+1e-10)throw new Error('Figure 27.3-4 requires 0° ≤ θ ≤ 45°.');
  if(!['clear','obstructed'].includes(flow)||![0,180].includes(gamma)||!['A','B'].includes(loadCase))throw new Error('Unsupported Figure 27.3-4 lookup.');
  const col=(gamma===180?2:0)+(flow==='obstructed'?1:0);
  if(theta<7.5-1e-10)return {values:MONO_ROWS[0][loadCase][col],lower:0,upper:7.5,fraction:0,rule:'Printed θ < 7.5° row; no interpolation to 7.5°'};
  const hi=MONO_ROWS.findIndex(row=>row.theta>=theta-1e-10),lo=Math.abs(MONO_ROWS[hi].theta-theta)<1e-10?hi:hi-1;
  const lower=MONO_ROWS[lo].theta,upper=MONO_ROWS[hi].theta,fraction=lower===upper?0:(theta-lower)/(upper-lower);
  return {values:MONO_ROWS[lo][loadCase][col].map((v,i)=>v+fraction*(MONO_ROWS[hi][loadCase][col][i]-v)),lower,upper,fraction,rule:lower===upper?'Exact angle row':'Linear angle interpolation (7.5°–45°)'};
}
export function deriveChapter27(p,qh){
  if(!isChapter27(p))return null;
  if(!p.code.includes('7-22'))throw new Error('Chapter 27 automatic lookup uses the supplied ASCE 7-22 figures.');
  if(!['flat','mono'].includes(p.roof))throw new Error('Automatic Chapter 27 currently supports flat/monoslope roofs from Figure 27.3-4. Supply Figure 27.3-5 for gable lookup, or use manual MWFRS inputs.');
  const plan=roofPlan(p),h=geometricWindHeight(p),theta=roofAngle(p),ratio=h/plan.width;
  if(ratio<.25-1e-10||ratio>1+1e-10)throw new Error('Figure 27.3-4 requires 0.25 ≤ h/LX ≤ 1.00. The alternate low h/L procedure is not inferred.');
  const blockage=p.wind.mwfrsBlockage??0,gust=p.wind.mwfrsGust??.85;
  if(!Number.isFinite(blockage)||blockage<0||blockage>100)throw new Error('MWFRS blockage must be 0–100 percent.');
  if(!Number.isFinite(gust)||gust<=0)throw new Error('MWFRS gust factor G must be positive.');
  for(const axis of ['X','Y'])if(!Number.isFinite(p.wind[`additional${axis}`]??0)||(p.wind[`additional${axis}`]??0)<0)throw new Error(`Enter the separate additional horizontal ${axis} force in pounds (zero only if justified).`);
  const flow=blockage<=50?'clear':'obstructed',pressureBase=qh*p.wind.kd*gust;
  const patterns=[];
  for(const gamma of [0,180])for(const loadCase of ['A','B']){
    const lookup=monoCoefficients(theta,flow,gamma,loadCase),[cnw,cnl]=lookup.values;
    // In the figure gamma=0 is wind from the high edge. This app's monoslope rises in +X.
    const sign=gamma===0?-1:1,mid=(plan.xMin+plan.xMax)/2;
    const regions=[[plan.xMin,mid],[mid,plan.xMax]].map(([x0,x1],i)=>({x0,x1,y0:plan.yMin,y1:plan.yMax,cn:(sign>0?i===0:i===1)?cnw:cnl,name:(sign>0?i===0:i===1)?'Windward half':'Leeward half'}));
    patterns.push({name:`W27X ${loadCase} γ${gamma}`,axis:'X',sign,gamma,loadCase,figure:'27.3-4',lookup,regions});
  }
  for(const sign of [1,-1])for(const loadCase of ['A','B']){
    const coeff=loadCase==='A'?(flow==='clear'?[-.8,-.6,-.3]:[-1.2,-.9,-.6]):(flow==='clear'?[.8,.5,.3]:[-.5,.5,.3]);
    const regions=[[0,h],[h,2*h],[2*h,plan.length]].filter(([a,b])=>a<plan.length&&b>a).map(([a,b],i)=>{
      const low=Math.min(a,plan.length),high=Math.min(b,plan.length);
      return {x0:plan.xMin,x1:plan.xMax,y0:sign>0?plan.yMin+low:plan.yMax-high,y1:sign>0?plan.yMin+high:plan.yMax-low,cn:coeff[i],name:['d ≤ h','h < d ≤ 2h','d > 2h'][i]};
    });
    patterns.push({name:`W27Y ${loadCase} γ${sign>0?90:270}`,axis:'Y',sign,gamma:sign>0?90:270,loadCase,figure:'27.3-7',regions});
  }
  return {mode:'asce-27',qh,kd:p.wind.kd,gust,pressureBase,plan,h,theta,ratio,blockage,flow,patterns,reviewed:!!p.wind.mwfrsReviewed,source:'User-supplied ASCE 7-22 §27.3.2, Eq. (27.3-2), Figures 27.3-4 and 27.3-7'};
}
// Integrate each printed load case without replacing mixed CN signs by a uniform value.
export function chapter27RoofForce(p,post,pattern,chapter){
  const force=[0,0,0],overhangMoments=[0,0,0],patches=[];
  const split=(a,b,lines)=>[a,...lines.filter(v=>v>a&&v<b),b];
  for(const region of pattern.regions){
    const left=Math.max(region.x0,post.xBounds[0]),right=Math.min(region.x1,post.xBounds[1]),front=Math.max(region.y0,post.yBounds[0]),back=Math.min(region.y1,post.yBounds[1]);
    if(right<=left||back<=front)continue;
    const xs=split(left,right,[0,p.width/2,p.width]),ys=split(front,back,[0,p.length]);
    for(let i=1;i<xs.length;i++)for(let j=1;j<ys.length;j++){
      const x=(xs[i]+xs[i-1])/2,y=(ys[j]+ys[j-1])/2,area=(xs[i]-xs[i-1])*(ys[j]-ys[j-1]),slope=p.roof==='flat'?0:p.slope/12;
      const pressure=-chapter.pressureBase*region.cn,f=[-pressure*slope*area,0,pressure*area];f.forEach((v,k)=>force[k]+=v);
      const rootX=Math.max(0,Math.min(p.width,x)),rootY=Math.max(0,Math.min(p.length,y));
      const patch={area,rx:x-rootX,ry:y-rootY,rz:roofHeightAt(p,x)-roofHeightAt(p,rootX)};
      const moment=patchMoment(patch,f);moment.forEach((v,k)=>overhangMoments[k]+=v);
      patches.push({...patch,region:region.name,cn:region.cn,gc:-chapter.gust*region.cn,pressure,slope,force:f,moment});
    }
  }
  return {force,overhangMoments,overhangPatches:patches.filter(a=>a.rx||a.ry),halves:patches.map((a,i)=>({...a,half:i+1}))};
}
