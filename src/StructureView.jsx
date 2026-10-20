import React from 'react';
const project=([x,y,z])=>[x*12-y*9,x*4.8+y*5.6-z*15];
export default function StructureView({model,p,selected,onSelect,loadName}) {
  const points=[...model.nodes.map(n=>n.pos),...model.posts.map(n=>[n.pos[0],n.pos[1],0])].map(project);
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const minX=Math.min(...xs)-70,maxX=Math.max(...xs)+80,minY=Math.min(...ys)-75,maxY=Math.max(...ys)+60;
  const pt=v=>project(v).join(',');
  const arrow=(pos,axis,key)=>{const tip=project(pos),tail=[tip[0]+(axis==='x'?-34:axis==='y'?27:0),tip[1]+(axis==='z'?-40:-15)];return <g key={key} className="load-arrow"><path d={`M${tail} L${tip}`} markerEnd="url(#arrow)"/></g>;};
  return <svg className="structure-svg" viewBox={`${minX} ${minY} ${maxX-minX} ${maxY-minY}`} role="img" aria-label="Canopy geometry sketch with independent fixed-base cantilever posts">
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#c87543"/></marker></defs>
    <polygon points={[[-3,-3,0],[p.width+3,-3,0],[p.width+3,p.length+3,0],[-3,p.length+3,0]].map(pt).join(' ')} fill="#e7ebe1"/>
    {Array.from({length:9},(_,i)=>{const x=p.width*i/8,y=p.length*i/8;return <g key={i} stroke="#d7dfd1" strokeWidth="0.8"><line x1={project([x,0,0])[0]} y1={project([x,0,0])[1]} x2={project([x,p.length,0])[0]} y2={project([x,p.length,0])[1]}/><line x1={project([0,y,0])[0]} y1={project([0,y,0])[1]} x2={project([p.width,y,0])[0]} y2={project([p.width,y,0])[1]}/></g>;})}
    {model.posts.map(post=>{const b=[post.pos[0],post.pos[1],0],a=project(b),t=project(post.pos),active=selected===post.name;return <g key={post.name}>
      <polygon points={[[b[0]-0.65,b[1]-0.65,0],[b[0]+0.65,b[1]-0.65,0],[b[0]+0.65,b[1]+0.65,0],[b[0]-0.65,b[1]+0.65,0]].map(pt).join(' ')} fill={active?'#c87543':'#a8b8a0'} stroke={active?'#99512e':'#71876b'} strokeWidth="1"/>
      <line x1={a[0]+2} y1={a[1]} x2={t[0]+2} y2={t[1]} stroke="#c3cabb" strokeWidth="7"/>
      <line x1={a[0]} y1={a[1]} x2={t[0]} y2={t[1]} stroke={active?'#c87543':'#4e6d57'} strokeWidth="5"/>
      <circle cx={t[0]} cy={t[1]} r="4" fill="#f2f5ed" stroke="#4e6d57"/>
    </g>;})}
    {model.cells.map((c,i)=><polygon key={i} points={c.ids.map(id=>pt(model.nodes[id].pos)).join(' ')} fill={c.slope<0?'#b6c8a5':'#d4dfbc'} fillOpacity="0.82" stroke="#7f9671" strokeWidth="0.8"/>)}
    {model.members.filter(m=>m.type==='beam').map((m,i)=>{const a=project(model.nodes[m.a].pos),b=project(model.nodes[m.b].pos);return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#557353" strokeWidth="2"/>;})}
    {model.nodes.filter((_,i)=>i%2===0).map((node,i)=>arrow(node.pos,/X/.test(loadName)?'x':/Y/.test(loadName)?'y':'z',i))}
    {model.posts.map(post=>{const a=project([post.pos[0],post.pos[1],0]),active=selected===post.name;return <g key={`label-${post.name}`} className="post-label" role="button" tabIndex="0" aria-label={`Select post ${post.name}`} onClick={()=>onSelect(post.name)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(post.name);}}}><rect x={a[0]-17} y={a[1]+8} width="34" height="19" rx="5" fill={active?'#183f34':'#fffef8'} stroke={active?'#183f34':'#cbd3c5'}/><text x={a[0]} y={a[1]+21} textAnchor="middle" fontSize="9" fill={active?'#fff':'#51624d'}>{post.name}</text></g>;})}
    <g stroke="#7e8e77" strokeWidth="0.8" fill="#60715a" fontSize="10"><path d={`M${pt([0,-2,0])} L${pt([p.width,-2,0])}`} fill="none"/><text x={project([p.width/2,-2,0])[0]} y={project([p.width/2,-2,0])[1]-8} textAnchor="middle" stroke="none">{p.width}' WIDTH · X</text><path d={`M${pt([p.width+2,0,0])} L${pt([p.width+2,p.length,0])}`} fill="none"/><text x={project([p.width+2,p.length/2,0])[0]+24} y={project([p.width+2,p.length/2,0])[1]} textAnchor="middle" stroke="none" transform={`rotate(-32 ${project([p.width+2,p.length/2,0])[0]+24} ${project([p.width+2,p.length/2,0])[1]})`}>{p.length}' LENGTH · Y</text></g>
  </svg>;
}
