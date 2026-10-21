// Width/length and post coordinates describe the support grid. Overhangs are
// horizontal projections beyond its four outer post lines; omitted = legacy zero.
export const OVERHANG_KEYS=['xStart','xEnd','yStart','yEnd'];
export const overhangs=p=>Object.fromEntries(OVERHANG_KEYS.map(k=>[k,p.overhangs?.[k]??0]));
export const roofHeightAt=(p,x)=>p.height+(p.roof==='flat'?0:(p.roof==='gable'?Math.min(x,p.width-x):x)*p.slope/12);
export function roofPlan(p){
  const o=overhangs(p),xMin=-o.xStart,xMax=p.width+o.xEnd,yMin=-o.yStart,yMax=p.length+o.yEnd;
  const width=xMax-xMin,length=yMax-yMin,area=width*length;
  const leftEave=roofHeightAt(p,xMin),rightEave=roofHeightAt(p,xMax),highest=p.roof==='gable'?roofHeightAt(p,p.width/2):Math.max(leftEave,rightEave);
  // For an unequal gable, the higher eave provides a conservative h basis.
  const eave=p.roof==='mono'?Math.min(leftEave,rightEave):Math.max(leftEave,rightEave);
  return {overhangs:o,xMin,xMax,yMin,yMax,width,length,area,gridArea:p.width*p.length,overhangArea:area-p.width*p.length,leftEave,rightEave,highest,eave,hasOverhang:Object.values(o).some(v=>v>0)};
}
export function geometricWindHeight(p){
  const r=roofPlan(p),theta=p.roof==='flat'?0:Math.atan(p.slope/12)*180/Math.PI;
  return theta<=10+1e-10?r.eave:(r.eave+r.highest)/2;
}
// Split only outboard tributary roof into rectangles at the support lines/ridge.
// The cantilever lever is measured from its adjacent outer post line. Inboard
// roof transfer eccentricities retain the original tributary-load assumption.
export function overhangPatches(p,post){
  const cuts=(bounds,lines)=>[bounds[0],...lines.filter(x=>x>bounds[0]&&x<bounds[1]),bounds[1]];
  const xs=cuts(post.xBounds,[0,p.width/2,p.width]),ys=cuts(post.yBounds,[0,p.length]),patches=[];
  for(let i=1;i<xs.length;i++)for(let j=1;j<ys.length;j++){
    const x=(xs[i]+xs[i-1])/2,y=(ys[j]+ys[j-1])/2;
    const rootX=Math.max(0,Math.min(p.width,x)),rootY=Math.max(0,Math.min(p.length,y));
    if(x===rootX&&y===rootY)continue;
    const area=(xs[i]-xs[i-1])*(ys[j]-ys[j-1]),rx=x-rootX,ry=y-rootY,rz=roofHeightAt(p,x)-roofHeightAt(p,rootX);
    const slope=p.roof==='flat'?0:p.slope/12*(p.roof==='gable'&&x>p.width/2?-1:1);
    patches.push({area,x,y,rx,ry,rz,slope,half:x<=p.width/2?1:2});
  }
  return patches;
}
export function patchMoment(patch,force){
  const {rx,ry,rz}=patch,[fx,fy,fz]=force;
  return [ry*fz-rz*fy,rz*fx-rx*fz,rx*fy-ry*fx];
}
export function gravityOverhangMoment(post,pressure){
  return post.overhangPatches.reduce((sum,patch)=>{
    const m=patchMoment(patch,[0,0,-pressure*patch.area]);return sum.map((v,j)=>v+m[j]);
  },[0,0,0]);
}
