// The PDF is data only: extract known numeric report fields, never execute document content.
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
  return {values,edition,sdc,site,risk,latitude,longitude};
}
export async function readHazardPdf(file) {
  if(file.size>15*1024*1024)throw new Error('Choose a hazard PDF smaller than 15 MB.');
  const pdfjs=await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).href;
  const loadingTask=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});
  const document=await loadingTask.promise;
  if(document.numPages>30){await loadingTask.destroy();throw new Error('Choose an ASCE hazard report of 30 pages or fewer.');}
  let text='';
  try {for(let i=1;i<=document.numPages;i++){const page=await document.getPage(i),content=await page.getTextContent();text+=content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join(' ')+'\n';}}
  finally {await loadingTask.destroy();}
  return parseHazardText(text);
}
export function applyHazards(project,parsed,name) {
  const p=structuredClone(project), fields=[];
  for(const [k,v] of Object.entries(parsed.values))if(Number.isFinite(v)){(k==='speed'?p.wind:p.seismic)[k]=v;fields.push(k);}
  if(parsed.sdc)p.seismic.sdc=parsed.sdc;if(parsed.site)p.seismic.site=parsed.site;if(parsed.risk)p.risk=parsed.risk;
  p.wind.reviewed=false;p.seismic.reviewed=false;
  p.hazard={name,source:`Imported ASCE/SEI 7-${parsed.edition||'unknown'} PDF`,latitude:parsed.latitude,longitude:parsed.longitude,verified:true,importedAt:new Date().toISOString()};
  // Sa(T), R, Cs, vertical seismic factor, and wind coefficients are intentionally not inferred.
  return {project:p,fields};
}
