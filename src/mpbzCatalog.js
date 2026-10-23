// Transcribed from the user's Simpson Strong-Tie MPBZ catalog image.
// Edition/page are not visible. Loads in lb, moments in ft-lb, K in in-lb/rad.
// Concrete tuple: [uplift uncracked, uplift cracked, F1 uncracked, F1 cracked,
//                  M uncracked, M cracked]. No load-duration increase applied.
export const MPBZ_SOURCE='User-supplied Simpson Strong-Tie MPBZ catalog excerpt; table and footnotes 1–12 (edition/page not shown)';
export const MPBZ_MODELS={
  MPB44Z:{post:'4×4',width:3.5625,depth:7.25,height:7.25,screws:'(16) ¼″ × 2½″ Strong-Drive SDS',wood:{download100:6240,download160:6410,moment160:1520},stiffness:1245000},
  MPB66Z:{post:'6×6',width:5.5625,depth:7.25,height:7.25,screws:'(24) ¼″ × 2½″ Strong-Drive SDS',wood:{download100:9360,download160:10855,moment160:3730},stiffness:3405000},
  MPB88Z:{post:'8×8',width:7.5625,depth:7.25,height:7.25,screws:'(36) ¼″ × 3″ Strong-Drive SDS',wood:{download100:15120,download160:17690,moment160:4560},stiffness:5515000},
};
export const MPBZ_CONCRETE={
  unreinforced:{
    AB:{MPB44Z:[4900,3820,1750,1225,1350,945],MPB66Z:[5815,5815,3435,2405,2680,1875],MPB88Z:[11860,9315,7200,6560,4160,2910]},
    CF:{MPB44Z:[4785,3350,1535,1075,1180,830],MPB66Z:[5815,5815,3015,2110,2055,1645],MPB88Z:[10155,8165,6965,4875,3470,2550]},
  },
  reinforced:{
    AB:{MPB44Z:[4900,3820,1750,1225,1520,1520],MPB66Z:[5815,5815,3435,2405,3730,3190],MPB88Z:[11860,9315,7200,6560,4560,4560]},
    CF:{MPB44Z:[4785,3350,1535,1075,1520,1520],MPB66Z:[5815,5815,3015,2110,3350,2795],MPB88Z:[10155,8165,6965,4875,4560,4560]},
  },
};
export const MPBZ_CONDITIONS=[
  'DF/SP wood assembly, model-matched nominal post and specified SDS screws. Check wood-post bending separately (note 5).',
  'Concrete f′c ≥ 2,500 psi. Footing dimensions, reinforcement, anchorage, and installation are by the designer (notes 3 and 7). Reinforced selection requires the applicable reinforcement detail.',
  'Use cracked concrete unless uncracked conditions are established. Loads are not increased for load duration (note 1). The explicitly tabulated wood (100)/(160) columns are used without further increases.',
  'The displayed download is the tabulated ungrouted assembly value. Enhanced grouted download requires separate wood/concrete design and is not taken (note 2).',
  'For overlapping wood/concrete moment limits use the lesser capacity (note 8). Gravity-only wood moment uses M(160)/1.6 as a conservative app assumption; the sheet does not tabulate M(100).',
  'Note 9 interaction is evaluated for each concurrent ASD post/case; separate demand maxima are not added. Biaxial shear and bending use sums of absolute X/Y components as a conservative app assumption; RSS resultants are also shown.',
  'The excerpt provides no torsion allowable. Nonzero Mz requires a separate check and prevents an overall covered-actions pass.',
  'Catalog rotational stiffness includes connector/fastener/post effects. Note 10 calls for a 0.75 multiplier at 3% shrinkage, with linear interpolation below 3%; stiffness is displayed only and is not used for capacity or drift.',
  'Rough-sawn/larger posts require full-width notching on all four sides and centroid alignment per note 11; verify all source-sheet installation conditions.',
];
export function catalogSettings(p){
  const input=p.mpbz??{};
  return {model:input.model??'',reinforcement:input.reinforcement??'unreinforced',concrete:input.concrete??'cracked',fc:input.fc??2500,sdc:String(p.seismic?.sdc??'').trim().toUpperCase(),dwellingException:input.dwellingException===true};
}
export function mpbzCapacities(p,kind='gravity'){
  const s=catalogSettings(p),model=MPBZ_MODELS[s.model];
  if(!model)return {issue:'Select MPB44Z, MPB66Z, or MPB88Z from the supplied catalog.'};
  if(!['unreinforced','reinforced'].includes(s.reinforcement))return {issue:'Select reinforced or unreinforced concrete.'};
  if(!['cracked','uncracked'].includes(s.concrete))return {issue:'Select cracked or uncracked concrete.'};
  if(!/^[A-F]$/.test(s.sdc))return {issue:'Enter seismic design category A–F in the Seismic section; no category is inferred for the MPBZ check.'};
  if(!Number.isFinite(s.fc)||s.fc<2500)return {issue:'The supplied MPBZ table requires concrete f′c ≥ 2,500 psi. No lower-strength extrapolation is used.'};
  const exception=kind==='seismic'&&s.sdc==='C'&&s.dwellingException;
  const group=kind==='seismic'&&!'AB'.includes(s.sdc)&&!exception?'CF':'AB';
  const tuple=MPBZ_CONCRETE[s.reinforcement][group][s.model],offset=s.concrete==='cracked'?1:0;
  const concreteMoment=tuple[4+offset],woodMoment=kind==='gravity'?model.wood.moment160/1.6:model.wood.moment160;
  return {...s,kind,group,exception,modelData:model,source:MPBZ_SOURCE,uplift:tuple[offset],lateral:tuple[2+offset],concreteMoment,woodMoment,moment:Math.min(concreteMoment,woodMoment),momentControls:concreteMoment<woodMoment?'Concrete':woodMoment<concreteMoment?'Wood assembly':'Wood / concrete tie',download:kind==='gravity'?model.wood.download100:model.wood.download160,downloadColumn:kind==='gravity'?'(100)':'(160)',woodMomentRule:kind==='gravity'?'M(160) / 1.6 · conservative gravity assumption':'Tabulated M(160)',stiffness:model.stiffness};
}
