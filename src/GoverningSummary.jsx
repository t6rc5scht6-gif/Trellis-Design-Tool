import {compactCaseName} from './presentation.js';
import React from 'react';
import { Flag } from 'lucide-react';
import { DEMAND_LABELS, governingBases } from './engine.js';
export function GoverningBadge({metrics=[]}){
  if(!metrics.length)return null;
  return <span className="governing-badge"><Flag size={10}/><span>Governs {metrics.map(key=>DEMAND_LABELS[key].toLowerCase()).join(' · ')}</span></span>;
}
export default function GoverningSummary({result,family,onPick,detailed=false}){
  return <section className="governing-summary" aria-label={`${family} governing combinations`}>
    <div className="governing-summary-title"><Flag size={15}/><strong>Governing combinations</strong><span>{family} · maxima across all posts</span></div>
    <div className="governing-summary-grid">{governingBases(result,family).map(g=>
      <button key={g.key} className={g.active?'':'inactive'} disabled={!g.active} onClick={()=>onPick(g)} aria-label={`Inspect governing ${g.key}`}>
        <span>{DEMAND_LABELS[g.key]}</span><strong>{(g[g.key]/1000).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3})}<small>{['moment','torsion'].includes(g.key)?'kip-ft':'kip'}</small></strong>
        <b>{g.active?(detailed?g.case:compactCaseName(g.case)):`No ${g.key} demand`}</b><small>{g.active?`${g.post} · ${g.ties.length} tied post/case set${g.ties.length===1?'':'s'}`:'Not marked as governing'}</small>
      </button>
    )}</div>
    <p>Highlighted cases govern demand magnitudes, including ties. Extrema are not concurrent; check all load sets for capacity and interaction.</p>
  </section>;
}
