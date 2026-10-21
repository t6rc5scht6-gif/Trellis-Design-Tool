export const compactCaseName=name=>name.replace(/W27([XY]) [AB] γ\d+/g,'W$1').replace(/([WE][XY])[+−]/g,'$1');
export const demandScore=(r,key)=>key==='compression'?Math.max(0,-r[2]):key==='uplift'?Math.max(0,r[2]):key==='shear'?Math.hypot(r[0],r[1]):key==='torsion'?Math.abs(r[5]):Math.hypot(r[3],r[4]);
// One governing direction/pattern per combination group, criterion and post.
// Return its actual concurrent set, not a synthetic combination of maxima.
export function compactCases(result,family,postIndex,criterion='moment'){
  const groups=new Map();
  for(const c of result.cases.filter(c=>c.family===family)){
    const key=compactCaseName(c.name),score=postIndex===undefined?Math.max(...c.reactions.map(r=>demandScore(r,criterion))):demandScore(c.reactions[postIndex],criterion),old=groups.get(key);
    if(!old||score>old.score)groups.set(key,{c,score});
  }
  return [...groups.values()].map(v=>v.c);
}
export function postSeismicResultants(result,index){
  const vx=Math.abs(result.basic['EX+'].reactions[index][0]),vy=Math.abs(result.basic['EY+'].reactions[index][1]);
  const xPrimary=Math.hypot(vx,.3*vy),yPrimary=Math.hypot(.3*vx,vy);
  return {vx,vy,xPrimary,yPrimary,governing:Math.max(xPrimary,yPrimary)};
}
