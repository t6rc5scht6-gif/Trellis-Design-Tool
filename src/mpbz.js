import {catalogSettings,mpbzCapacities,MPBZ_SOURCE,MPBZ_CONDITIONS} from './mpbzCatalog.js';
export const mpbzLoadKind=c=>Object.entries(c.factors??{}).some(([k,v])=>v&&k.startsWith('E'))?'seismic':Object.entries(c.factors??{}).some(([k,v])=>v&&k.startsWith('W'))?'wind':'gravity';
const tie=(a,b)=>Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b));
export function mpbzDemand(row){
  return {compression:Math.max(0,-row[2]),uplift:Math.max(0,row[2]),lateral:Math.abs(row[0])+Math.abs(row[1]),moment:Math.abs(row[3])+Math.abs(row[4]),shearResultant:Math.hypot(row[0],row[1]),momentResultant:Math.hypot(row[3],row[4]),torsion:Math.abs(row[5])};
}
export function mpbzCheck(p,result){
  const settings=catalogSettings(p),profiles=Object.fromEntries(['gravity','wind','seismic'].map(kind=>[kind,mpbzCapacities(p,kind)]));
  const issue=Object.values(profiles).find(v=>v.issue)?.issue;
  const common={...settings,source:MPBZ_SOURCE,conditions:MPBZ_CONDITIONS,profiles,issue};
  if(issue)return {...common,status:'selection-required',records:[],rows:[],passed:null};
  const records=[];
  for(const c of result.cases.filter(c=>c.family==='ASD')){
    const kind=mpbzLoadKind(c),capacity=profiles[kind];
    c.reactions.forEach((reactions,i)=>{
      const demand=mpbzDemand(reactions),axialDemand=demand.uplift>0?demand.uplift:demand.compression,axialCapacity=demand.uplift>0?capacity.uplift:capacity.download;
      const axialRatio=axialDemand/axialCapacity,momentRatio=demand.moment/capacity.moment,lateralRatio=demand.lateral/capacity.lateral;
      records.push({post:result.model.posts[i].name,postIndex:i,case:c.name,kind,capacity,reactions,demand,axialBranch:demand.uplift>0?'Uplift':'Download',axialDemand,axialCapacity,axialRatio,momentRatio,lateralRatio,ratio:axialRatio+momentRatio+lateralRatio});
    });
  }
  if(!records.length)return {...common,status:'no-asd-cases',records,rows:[],passed:null,issue:'No ASD combinations are available.'};
  const governing=records.reduce((a,b)=>b.ratio>a.ratio?b:a),ties=records.filter(v=>tie(v.ratio,governing.ratio));
  const torsion=records.reduce((a,b)=>b.demand.torsion>a.demand.torsion?b:a),torsionPending=torsion.demand.torsion>1e-7;
  const passed=governing.ratio>1+1e-10?false:torsionPending?null:true;
  const status=governing.ratio>1+1e-10?'exceeds':torsionPending?'torsion-check-required':'within';
  const rows=[
    {key:'compression',label:'Download',unit:'kip',demand:v=>v.demand.compression,allowable:v=>v.capacity.download},
    {key:'uplift',label:'Uplift',unit:'kip',demand:v=>v.demand.uplift,allowable:v=>v.capacity.uplift},
    {key:'lateral',label:'Lateral · |Vx| + |Vy|',unit:'kip',demand:v=>v.demand.lateral,allowable:v=>v.capacity.lateral},
    {key:'moment',label:'Bending · |Mx| + |My|',unit:'kip-ft',demand:v=>v.demand.moment,allowable:v=>v.capacity.moment},
  ].map(action=>{
    const winner=records.reduce((a,b)=>action.demand(b)/action.allowable(b)>action.demand(a)/action.allowable(a)?b:a);
    return {key:action.key,label:action.label,unit:action.unit,demand:action.demand(winner),capacity:action.allowable(winner),ratio:action.demand(winner)/action.allowable(winner),post:winner.post,case:winner.case,kind:winner.kind};
  });
  const postResults=result.model.posts.map(post=>records.filter(v=>v.post===post.name).reduce((a,b)=>b.ratio>a.ratio?b:a));
  return {...common,status,passed,records,rows,governing,ties,postResults,torsion,torsionPending,ratio:governing.ratio};
}
