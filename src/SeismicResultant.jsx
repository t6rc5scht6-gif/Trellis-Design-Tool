import React from 'react';
import {postSeismicResultants} from './presentation.js';
const f=(v,d=3)=>Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
export default function SeismicResultant({p,r,index}){
  const s=postSeismicResultants(r,index),equal=Math.abs(s.vx-s.vy)<=1e-9*Math.max(1,s.vx,s.vy);
  return <div className="seismic-resultant">
    <p className="calc-footnote">{r.model.posts[index].name}: apply the post shear in one direction with 30% in the orthogonal direction. Combine the two perpendicular components by the square root of the sum of squares.</p>
    <div className="calc-row"><span className="calc-label">{equal?'Combined post shear':'100% X + 30% Y'}</span><div><div className="calc-formula">{equal?'Vcombined = √[Vx² + (0.30 Vx)²] = 1.044 Vx':'Vcombined,X = √[VX,post² + (0.30 VY,post)²]'}</div><div className="calc-arithmetic">= √[{f(s.vx/1000)}² + (0.30 × {f(s.vy/1000)})²]</div></div><strong className="calc-answer">{f(s.xPrimary/1000)} kip</strong></div>
    {!equal&&<div className="calc-row"><span className="calc-label">100% Y + 30% X</span><div><div className="calc-formula">Vcombined,Y = √[(0.30 VX,post)² + VY,post²]</div><div className="calc-arithmetic">= √[(0.30 × {f(s.vx/1000)})² + {f(s.vy/1000)}²]</div></div><strong className="calc-answer">{f(s.yPrimary/1000)} kip</strong></div>}
    <div className="formula-strip"><span>GOVERNING COMBINED POST SHEAR</span><strong>{f(s.governing/1000)} <small>kip</small></strong></div>
    <p className="calc-footnote">For equal directional post shears: √(Vpost² + 0.30² Vpost²) = 1.044 Vpost. ASD horizontal demand = 0.7ρ × this result = {f(.7*p.seismic.rho*s.governing/1000)} kip; LRFD = ρ × this result = {f(p.seismic.rho*s.governing/1000)} kip. Ev enters each load combination once. Directional components are retained for biaxial base checks. Governing results include directions that add to the overhang moments; repeated signed cases are hidden in the compact view.</p>
  </div>;
}
