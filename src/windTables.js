import { roofPlan, geometricWindHeight } from './roofGeometry.js';
// Source: the user's complete ASCE Figure 30.5-1 and 30.5-2 excerpts.
// Each row lists [Zone 3, Zone 2, Zone 1] pairs [toward(+), away(-)] at A <= a².
// In both supplied tables, the middle-area Zone 3 uses the Zone 2 pair;
// at A > 4a² all zones use the Zone 1 pair. No interpolation in effective area.
const ANGLES = [0, 7.5, 15, 30, 45];
const TABLES = {
  mono: {
    clear: [
      [[2.4,-3.3],[1.8,-1.7],[1.2,-1.1]],
      [[3.2,-4.2],[2.4,-2.1],[1.6,-1.4]],
      [[3.6,-3.8],[2.7,-2.9],[1.8,-1.9]],
      [[5.2,-5.0],[3.9,-3.8],[2.6,-2.5]],
      [[5.2,-4.6],[3.9,-3.5],[2.6,-2.3]],
    ],
    obstructed: [
      [[1.0,-3.6],[0.8,-1.8],[0.5,-1.2]],
      [[1.6,-5.1],[1.2,-2.6],[0.8,-1.7]],
      [[2.4,-4.2],[1.8,-3.2],[1.2,-2.1]],
      [[3.2,-4.6],[2.4,-3.5],[1.6,-2.3]],
      [[4.2,-3.8],[3.2,-2.9],[2.1,-1.9]],
    ],
  },
  gable: {
    clear: [
      [[2.4,-3.3],[1.8,-1.7],[1.2,-1.1]],
      [[2.2,-3.6],[1.7,-1.8],[1.1,-1.2]],
      [[2.2,-2.2],[1.7,-1.7],[1.1,-1.1]],
      [[2.6,-1.8],[2.0,-1.4],[1.3,-0.9]],
      [[2.2,-1.6],[1.7,-1.2],[1.1,-0.8]],
    ],
    obstructed: [
      [[1.0,-3.6],[0.8,-1.8],[0.5,-1.2]],
      [[1.0,-5.1],[0.8,-2.6],[0.5,-1.7]],
      [[1.0,-3.2],[0.8,-2.4],[0.5,-1.6]],
      [[1.0,-2.4],[0.8,-1.8],[0.5,-1.2]],
      [[1.0,-2.4],[0.8,-1.8],[0.5,-1.2]],
    ],
  },
};
const requireNumber=(value,label,allowZero=false)=>{
  if(!Number.isFinite(value)||(allowZero?value<0:value<=0))throw new Error(`${label} must be ${allowZero?'nonnegative':'positive'} and finite.`);
};
export const isAutomaticCc = p => p.wind.ccSource === 'asce-30.5';
export function roofAngle(p){return p.roof==='flat'?0:Math.atan(p.slope/12)*180/Math.PI;}
export function windMeanHeight(p){
  const theta=roofAngle(p);
  const computed=geometricWindHeight(p),plan=roofPlan(p);
  const override=p.wind.ccMeanHeight;
  const overridden=override!==undefined&&override!==null&&override!=='';
  if(overridden)requireNumber(override,'C&C mean roof height');
  return {value:overridden?override:computed,overridden,computed,rule:overridden?'Engineer-entered h override':plan.hasOverhang?'Actual roof-edge eave height (higher gable eave if unequal); average with highest point above 10°':theta<=10+1e-10?'Eave height for roof angle ≤ 10° (mean-height definition)':'Average of eave and highest roof elevation'};
}
export function lookupFreeRoofCc({roof,theta,h,width,length,effectiveArea,blockage}){
  if(!['flat','mono','gable'].includes(roof))throw new Error('C&C tables support flat/mono-slope or gable free roofs only.');
  for(const [v,label] of [[h,'Mean roof height'],[width,'Width'],[length,'Length'],[effectiveArea,'Effective wind area']])requireNumber(v,label);
  if(!Number.isFinite(theta)||theta<0||theta>45+1e-10)throw new Error('Figures 30.5-1/2 require 0° ≤ roof angle ≤ 45°. No extrapolation is permitted.');
  if(!Number.isFinite(blockage)||blockage<0||blockage>100)throw new Error('C&C blockage must be between 0 and 100 percent.');
  // The app evaluates both X and Y wind; L is the along-wind horizontal span.
  const ratios={X:h/width,Y:h/length};
  for(const [axis,ratio] of Object.entries(ratios))if(ratio<0.25-1e-10||ratio>1+1e-10)throw new Error(`C&C figure is outside its h/L limits for ${axis} wind: ${ratio.toFixed(3)}. Required: 0.25 ≤ h/L ≤ 1.00. Select manual coefficients from an applicable procedure; no table extrapolation is used.`);
  const least=Math.min(width,length),a=Math.max(Math.min(0.1*least,0.4*h),0.04*least,3),a2=a*a;
  const band=effectiveArea<=a2?0:effectiveArea<=4*a2?1:2;
  const flow=blockage<=50?'clear':'obstructed',shape=roof==='gable'?'gable':'mono';
  const upperIndex=ANGLES.findIndex(angle=>angle>=theta-1e-10);
  const exact=Math.abs(ANGLES[upperIndex]-theta)<1e-10,lowerIndex=exact?upperIndex:upperIndex-1;
  const lower=ANGLES[lowerIndex],upper=ANGLES[upperIndex],fraction=lower===upper?0:(theta-lower)/(upper-lower);
  const zones=[1,2,3].map(zone=>{
    const col=band===2?2:zone===1?2:zone===2?1:band===1?1:0;
    const lo=TABLES[shape][flow][lowerIndex][col],hi=TABLES[shape][flow][upperIndex][col];
    const cnToward=lo[0]+fraction*(hi[0]-lo[0]),cnAway=lo[1]+fraction*(hi[1]-lo[1]);
    return {name:`Zone ${zone}`,zone,cnToward,cnAway,lowerToward:lo[0],lowerAway:lo[1],upperToward:hi[0],upperAway:hi[1]};
  });
  return {figure:shape==='gable'?'30.5-2':'30.5-1',theta,h,ratios,least,a,a2,band,bandLabel:['Ae ≤ a²','a² < Ae ≤ 4a²','Ae > 4a²'][band],effectiveArea,blockage,flow,lower,upper,fraction,zones};
}
export function deriveCc(p,q){
  const directionality=p.code.includes('7-16')?1:p.wind.kd,pressureBase=q*directionality;
  if(!isAutomaticCc(p))return {mode:'manual',directionality,pressureBase,zones:p.wind.cc.map(z=>({...z,upPressure:pressureBase*z.up,downPressure:pressureBase*z.down,rawUpPressure:pressureBase*z.up,rawDownPressure:pressureBase*z.down,upForce:pressureBase*z.up*p.wind.ccArea,downForce:pressureBase*z.down*p.wind.ccArea}))};
  if(!p.code.includes('7-22'))throw new Error('Automatic C&C uses the supplied ASCE 7-22 figures. Select ASCE 7-22 or use manual coefficients for the selected edition.');
  const meanHeight=windMeanHeight(p),plan=roofPlan(p),lookup=lookupFreeRoofCc({roof:p.roof,theta:roofAngle(p),h:meanHeight.value,width:plan.width,length:plan.length,effectiveArea:p.wind.ccEffectiveArea,blockage:p.wind.ccBlockage??0});
  const gust=p.wind.ccGust??0.85,minimum=p.wind.ccMinimumPressure??16;
  requireNumber(gust,'C&C gust multiplier G');requireNumber(minimum,'C&C entered pressure floor',true);
  if(p.wind.ccPressureReviewed!==undefined&&typeof p.wind.ccPressureReviewed!=='boolean')throw new Error('C&C pressure review flag must be boolean.');
  const zones=lookup.zones.map(z=>{
    // Figure signs: positive toward roof (down); negative away (up).
    // Existing reaction convention: positive roof pressure is uplift.
    const up=-gust*z.cnAway,down=-gust*z.cnToward,rawUpPressure=pressureBase*up,rawDownPressure=pressureBase*down;
    const upPressure=Math.max(rawUpPressure,minimum),downPressure=-Math.max(-rawDownPressure,minimum);
    return {...z,up,down,rawUpPressure,rawDownPressure,upPressure,downPressure,upForce:upPressure*p.wind.ccArea,downForce:downPressure*p.wind.ccArea,upFloorGoverns:minimum>rawUpPressure,downFloorGoverns:minimum>-rawDownPressure};
  });
  return {mode:'asce-30.5',...lookup,meanHeight,gust,minimum,directionality,pressureBase,equation:'ASCE 7-22 Eq. (30.5-1): p = qh Kd G CN',pressureReviewed:!!p.wind.ccPressureReviewed,zones};
}
