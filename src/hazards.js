// The PDF is data only: extract known numeric report fields, never execute document content.
export function parseHazardAddress(text){
  const lines=text.replace(/\u00a0/g,' ').split(/\r?\n/),start=lines.findIndex(line=>/\bAddress\s*:/i.test(line));
  if(start<0)return undefined;
  const pieces=[];
  for(let i=start;i<Math.min(start+9,lines.length);i++){
    let line=lines[i];
    if(i===start)line=line.replace(/^.*?\bAddress\s*:/i,'');
    if(i>start&&/^\s*(Wind|Seismic|Results|Data Source)\b/i.test(line))break;
    line=line.split(/\b(?:Standard|Risk Category|Soil Class|Latitude|Longitude|Elevation)\s*:/i)[0].trim();
    if(!line||/^(?:ASCE|\(NAVD|N\/?A\b|Not available|No address|Address not)/i.test(line))continue;
    pieces.push(line.replace(/\s+/g,' '));
  }
  const address=pieces.join(', ').replace(/,\s*(\d{5}(?:-\d{4})?)(?=,|$)/, ' $1');
  return address.length>4&&address.length<=250&&/[A-Za-z]/.test(address)?address:undefined;
}
// Limit extraction to the address column so neighboring coordinates/class labels are excluded.
export function addressFromPdfItems(items){
  const label=items.find(item=>typeof item.str==='string'&&/^\s*Address\s*:\s*$/i.test(item.str));
  if(!label?.transform)return undefined;
  const x=label.transform[4],y=label.transform[5];
  const nextColumn=items.filter(item=>item.transform&&item.transform[4]>x+25&&/^(?:Standard|Risk Category|Soil Class|Latitude)\s*:/i.test(item.str)).map(item=>item.transform[4]);
  const end=nextColumn.length?Math.min(...nextColumn):x+180;
  const rows=[];
  for(const item of items.filter(item=>item.str?.trim()&&item.transform&&item.transform[4]>=x-2&&item.transform[4]<end-2&&item.transform[5]<=y+2&&item.transform[5]>y-85).sort((a,b)=>b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4])){
    const row=rows.find(row=>Math.abs(row.y-item.transform[5])<2);
    if(row)row.items.push(item);else rows.push({y:item.transform[5],items:[item]});
  }
  return parseHazardAddress(rows.map(row=>row.items.sort((a,b)=>a.transform[4]-b.transform[4]).map(item=>item.str).join(' ')).join('\n'));
}
export function parseHazardText(text) {
  const clean=text.replace(/\u00a0/g,' ').replace(/\s+/g,' ');
  const get=(pattern)=>{const m=clean.match(pattern);return m?Number(m[1]):undefined;};
  const values={speed:get(/Wind Speed\s+(\d+(?:\.\d+)?)\s*(?:V?mph|V?\s*mph)/i),
    sds:get(/S\s*D\s*S\s*:\s*(\d+(?:\.\d+)?)/i),sd1:get(/S\s*D\s*1\s*:\s*(\d+(?:\.\d+)?)/i),
    ss:get(/S\s*S\s*:\s*(\d+(?:\.\d+)?)/i),s1:get(/S\s*1\s*:\s*(\d+(?:\.\d+)?)/i),tl:get(/T\s*L\s*:\s*(\d+(?:\.\d+)?)/i)};
  const edition=clean.match(/ASCE\s*\/\s*SEI\s*7\s*[-–]\s*(16|22)/i)?.[1];
  const sdc=clean.match(/Seismic Design Category\s*:\s*([A-F])/i)?.[1];
  const site=clean.match(/(?:Site Soil Class|Soil Class)\s*:\s*(Default|[A-F](?:\s*[-/]\s*[A-F])?)/i)?.[1];
  const risk=clean.match(/Risk Category\s*:\s*(IV|III|II|I)\b/i)?.[1];
  const latitude=get(/Latitude\s*:\s*(-?\d+(?:\.\d+)?)/i),longitude=get(/Longitude\s*:\s*(-?\d+(?:\.\d+)?)/i);
  if(!Number.isFinite(values.speed)&&!Number.isFinite(values.sds))throw new Error('No recognizable ASCE wind speed or seismic SDS was found. Enter the report values manually.');
  return {values,edition,sdc,site,risk,latitude,longitude,address:parseHazardAddress(text)};
}
export async function readHazardPdf(file) {
  if(file.size>15*1024*1024)throw new Error('Choose a hazard PDF smaller than 15 MB.');
  const pdfjs=await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).href;
  const loadingTask=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});
  let text='',address;
  try {
    const document=await loadingTask.promise;
    if(document.numPages>30)throw new Error('Choose an ASCE hazard report of 30 pages or fewer.');
    for(let i=1;i<=document.numPages;i++){const page=await document.getPage(i),content=await page.getTextContent();if(i===1)address=addressFromPdfItems(content.items);text+=content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join(' ')+'\n';}
  }
  finally {await loadingTask.destroy();}
  const parsed=parseHazardText(text);if(address)parsed.address=address;return parsed;
}
export function applyHazards(project,parsed,name) {
  const p=structuredClone(project), fields=[];
  for(const [k,v] of Object.entries(parsed.values))if(Number.isFinite(v)){(k==='speed'?p.wind:p.seismic)[k]=v;fields.push(k);}
  if(parsed.address){p.address=parsed.address;fields.push('address');}
  if(parsed.sdc)p.seismic.sdc=parsed.sdc;if(parsed.site)p.seismic.site=parsed.site;if(parsed.risk)p.risk=parsed.risk;
  p.wind.reviewed=false;p.wind.ccPressureReviewed=false;p.seismic.reviewed=false;
  p.hazard={name,source:`Imported ASCE/SEI 7-${parsed.edition||'unknown'} PDF`,latitude:parsed.latitude,longitude:parsed.longitude,address:parsed.address,importedAt:new Date().toISOString()};
  // Sa(T), R, Cs, vertical seismic factor, and wind coefficients are intentionally not inferred.
  return {project:p,fields};
}
