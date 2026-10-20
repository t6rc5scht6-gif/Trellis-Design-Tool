import { roofAngle } from './windTables.js';
export const isEnvelopeLongitudinal=p=>p.wind.longitudinalSource==='asce-28.3.7';
const finite=(value,label,allowZero=false)=>{if(!Number.isFinite(value)||(allowZero?value<0:value<=0))throw new Error(`${label} must be ${allowZero?'nonnegative':'positive'} and finite.`);};
export const CASE_2_END_WALL={windward:0.40,windwardE:0.61,leeward:-0.29,leewardE:-0.43};
export function endWallAverages(p,Ae){
  const mode=p.wind.longitudinalCoefficientMode??'edge-envelope';
  if(mode==='manual'){
    const windward=p.wind.longitudinalGcWindward,leeward=p.wind.longitudinalGcLeeward;
    if(!Number.isFinite(windward)||!Number.isFinite(leeward))throw new Error('Enter area-averaged windward and leeward GCpf for the manual coefficient override.');
    return {mode,label:'Engineer-entered averaged GCpf override',windward,leeward};
  }
  if(!['edge-envelope','area-weighted'].includes(mode))throw new Error('Choose a supported longitudinal coefficient averaging method.');
  let windwardEdgeArea=mode==='edge-envelope'?Ae:p.wind.windwardEndEdgeArea;
  let leewardEdgeArea=mode==='edge-envelope'?Ae:p.wind.leewardEndEdgeArea;
  for(const [area,label] of [[windwardEdgeArea,'Windward 5E area'],[leewardEdgeArea,'Leeward 6E area']]){finite(area,label,true);if(area>Ae)throw new Error(`${label} cannot exceed AE.`);}
  const enteredWindwardEdgeArea=windwardEdgeArea,enteredLeewardEdgeArea=leewardEdgeArea;
  // Envelope both longitudinal directions if the entered end-zone areas differ.
  // Swapping ends changes which E area receives the larger windward increment.
  const reversed=mode==='area-weighted'&&leewardEdgeArea>windwardEdgeArea;
  if(reversed)[windwardEdgeArea,leewardEdgeArea]=[leewardEdgeArea,windwardEdgeArea];
  const windwardFraction=windwardEdgeArea/Ae,leewardFraction=leewardEdgeArea/Ae;
  return {mode,enteredWindwardEdgeArea,enteredLeewardEdgeArea,reversed,label:mode==='edge-envelope'?'Conservative whole-end-wall E-coefficient envelope':'Area-weighted Case 2 surface averages',windward:CASE_2_END_WALL.windward+(CASE_2_END_WALL.windwardE-CASE_2_END_WALL.windward)*windwardFraction,leeward:CASE_2_END_WALL.leeward+(CASE_2_END_WALL.leewardE-CASE_2_END_WALL.leeward)*leewardFraction,windwardEdgeArea,leewardEdgeArea,windwardFraction,leewardFraction};
}
export function deriveLongitudinalWind(p,qh,actualFrames){
  if(!isEnvelopeLongitudinal(p))return null;
  if(!p.code.includes('7-22'))throw new Error('The §28.3.7 implementation uses the supplied ASCE 7-22 excerpt. Select that edition or use the manual longitudinal method.');
  const theta=roofAngle(p);
  if(p.roof!=='gable'||theta<=0||theta>=45)throw new Error('This §28.3.7 implementation requires a gable/pitched roof with 0° < θ < 45° and transverse frames. Other roof configurations require an applicable manual procedure.');
  finite(p.width,'Frame width B');finite(p.height,'Eave height');
  if(!Number.isInteger(actualFrames)||actualFrames<2)throw new Error('At least two transverse frame lines are required.');
  const B=p.width,rise=B*p.slope/24,rectangle=B*p.height,triangle=0.5*B*rise,Ae=rectangle+triangle;
  const centroidZ=(rectangle*p.height/2+triangle*(p.height+rise/3))/Ae;
  const As=p.wind.endSolidArea??0;finite(As,'Effective solid end-wall area As',true);
  if(As>Ae)throw new Error('Effective solid end-wall area As cannot exceed the equivalent fully enclosed end-wall area AE.');
  const h=theta<=10?p.height:p.height+rise/2;
  if(h>60+1e-8)throw new Error('The supplied Figure 28.3-1 is limited to h ≤ 60 ft. Use another applicable procedure for this height.');
  if(h>Math.min(p.width,p.length)+1e-8)throw new Error('The envelope method requires a low-rise building: mean roof height cannot exceed the least horizontal dimension. Verify Chapter 28 applicability.');
  const averaging=endWallAverages(p,Ae),{windward,leeward}=averaging;
  const delta=windward-leeward;
  if(delta<=0)throw new Error('The windward-minus-leeward GCpf difference must be positive for this signed ±Y force implementation. Verify the Figure 28.3-1 averages and signs.');
  const phi=As/Ae,n=Math.max(3,actualFrames),kb=B<100?1.8-0.01*B:0.8,ks=0.60+0.073*(n-3)+1.25*phi**1.8;
  finite(qh,'Velocity pressure qh');finite(p.wind.kd,'Directionality factor Kd');
  const pressure=qh*p.wind.kd*delta*kb*ks,force=pressure*Ae;
  if(p.wind.longitudinalReviewed!==undefined&&typeof p.wind.longitudinalReviewed!=='boolean')throw new Error('The longitudinal review flag must be boolean.');
  return {averaging,case2:CASE_2_END_WALL,h,source:'ASCE 7-22 §28.3.7 / Eqs. (28.3-3), (28.3-4)',theta,B,rise,rectangle,triangle,Ae,As,phi,actualFrames,n,kb,ks,windward,leeward,delta,qh,kd:p.wind.kd,pressure,force,centroidX:B/2,centroidZ,sidewallFraction:0.5,reviewed:!!p.wind.longitudinalReviewed,coefficientReference:p.wind.longitudinalCoefficientReference||'ASCE Figure 28.3-1 Load Case 2: surfaces 5 = 0.40, 5E = 0.61, 6 = −0.29, 6E = −0.43',scope:'Longitudinal ±Y only; ridge along Y. Roof pressure and transverse wind use separate project inputs.'};
}
export function longitudinalPostShare(p,post){
  const onSidewall=Math.abs(post.pos[0])<1e-8||Math.abs(post.pos[0]-p.width)<1e-8;
  return onSidewall?0.5*post.ty/p.length:0;
}
