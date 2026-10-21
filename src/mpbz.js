// No manufacturer capacities or interaction equations have been supplied yet.
// An entered allowable capacity can support an individual ASD component ratio;
// it does not establish the MPBZ combined-load acceptance required by the catalog.
export const MPBZ_ACTIONS=[
  {key:'compression',label:'Compression',unit:'kip',demand:r=>Math.max(0,-r[2])},
  {key:'uplift',label:'Uplift',unit:'kip',demand:r=>Math.max(0,r[2])},
  {key:'vx',label:'Shear X',unit:'kip',demand:r=>Math.abs(r[0])},
  {key:'vy',label:'Shear Y',unit:'kip',demand:r=>Math.abs(r[1])},
  {key:'mx',label:'Moment X',unit:'kip-ft',demand:r=>Math.abs(r[3])},
  {key:'my',label:'Moment Y',unit:'kip-ft',demand:r=>Math.abs(r[4])},
  {key:'mz',label:'Torsion',unit:'kip-ft',demand:r=>Math.abs(r[5])},
];
export function mpbzCheck(p,result){
  const inputs=p.mpbz??{},cases=result.cases.filter(c=>c.family==='ASD');
  const rows=MPBZ_ACTIONS.map(action=>{
    let winner;for(const c of cases)c.reactions.forEach((r,i)=>{const demand=action.demand(r);if(!winner||demand>winner.demand)winner={demand,case:c.name,post:result.model.posts[i].name,reactions:r};});
    const value=inputs[action.key],hasCapacity=Number.isFinite(value)&&value>0,capacity=hasCapacity?1000*value:null;
    return {...action,...winner,capacity,ratio:hasCapacity?winner.demand/capacity:null};
  });
  return {status:'catalog-pending',model:inputs.model??'',source:inputs.source??'',rows,maximumComponentRatio:Math.max(0,...rows.filter(r=>r.ratio!==null).map(r=>r.ratio)),hasRatios:rows.some(r=>r.ratio!==null),missing:rows.filter(r=>r.capacity===null&&r.demand>1e-7).map(r=>r.label),limitations:'Awaiting the Simpson catalog sheet, exact MPBZ model, applicable allowable loads, installation/species/fastener conditions, biaxial and combined-load equations. Individual ratios are component screening only; no overall catalog DCR or approval is established. ASD reactions are compared with ASD allowables; LRFD demands are not mixed with allowable loads.'};
}
