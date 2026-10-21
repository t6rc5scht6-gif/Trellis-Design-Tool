import React from 'react';
import {mpbzCheck} from './mpbz.js';
import {compactCaseName} from './presentation.js';
const f=(v,d=3)=>Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
export default function MpbzCheck({p,r}){
 const c=mpbzCheck(p,r);
 return <div className="mpbz-check">
  <div className="cc-source-banner"><span>SIMPSON STRONG-TIE · MPBZ</span><strong>Catalog capacity check · awaiting source sheet</strong><small>The exact model, catalog allowable loads, footnotes, and combined-load interaction equation are needed before an overall design capacity ratio can be established.</small></div>
  <div className="cc-basis-text"><p><b>Model:</b> {c.model||'Not selected from catalog'}. <b>Capacity source:</b> {c.source||'Catalog sheet not yet supplied'}.</p><p><b>Method:</b> ASD demand / applicable catalog ASD allowable capacity. Each row searches every post and concurrent ASD combination. Wind ASD factors are already included in demand; no extra 0.6 or 1.6 adjustment is applied here.</p></div>
  <div className="table-scroll"><table className="mpbz-ratios"><thead><tr><th>ACTION</th><th>ASD DEMAND</th><th>ENTERED ALLOWABLE</th><th>COMPONENT RATIO</th><th>GOVERNING POST / COMBINATION</th></tr></thead><tbody>{c.rows.map(v=><tr key={v.key} className={v.ratio!==null&&v.ratio>1?'capacity-exceeded':''}><td>{v.label}</td><td>{f(v.demand/1000)} {v.unit}</td><td>{v.capacity===null?'Not supplied':`${f(v.capacity/1000)} ${v.unit}`}</td><td>{v.ratio===null?'Pending':f(v.ratio)}</td><td>{v.post}<small>{compactCaseName(v.case)}</small></td></tr>)}</tbody></table></div>
  <div className="cc-review-status"><span><b>Overall MPBZ catalog DCR: pending.</b> {c.hasRatios?'The entered-capacity ratios above are individual component screening checks. Passing those checks does not establish combined-load, biaxial, or installation compliance.':'No capacity values have been invented or prefilled.'} The catalog must establish how to check shear, moment, axial load and any torsion together.</span></div>
 </div>;
}
