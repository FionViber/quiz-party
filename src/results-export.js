/* Offline PNG export for the results page. html2canvas is bundled locally. */
(function(root){
'use strict';
function n(v,f=0){const x=Number.parseFloat(v);return Number.isFinite(x)?x:f;}
function attr(el,name,f=0){return n(el.getAttribute(name),f);}
function chartCanvas(svg,doc){
  const vb=(svg.getAttribute('viewBox')||`0 0 ${svg.clientWidth||640} ${svg.clientHeight||320}`).trim().split(/\s+/).map(Number),vw=vb[2]||640,vh=vb[3]||320;
  const width=Math.max(1,Math.round(svg.clientWidth||vw)),height=Math.max(1,Math.round(svg.clientHeight||vh)),scale=width/vw,canvas=doc.createElement('canvas');canvas.width=Math.round(width*2);canvas.height=Math.round(height*2);
  const ctx=canvas.getContext('2d'),fit=Math.min(width/vw,height/vh),offsetX=(width-vw*fit)/2,offsetY=(height-vh*fit)/2;ctx.fillStyle=getComputedStyle(svg).backgroundColor||'transparent';if(ctx.fillStyle!=='transparent')ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(2,2);ctx.translate(offsetX,offsetY);ctx.scale(fit,fit);
  const lineStyle=(el)=>{const cs=getComputedStyle(el);ctx.strokeStyle=el.getAttribute('stroke')||cs.stroke||'#000';ctx.fillStyle=el.getAttribute('fill')||cs.fill||'none';ctx.lineWidth=n(el.getAttribute('stroke-width'),n(cs.strokeWidth,1));};
  const walk=(el)=>{for(const child of Array.from(el.children||[])){const tag=child.localName;lineStyle(child);if(tag==='line'){ctx.beginPath();ctx.moveTo(attr(child,'x1'),attr(child,'y1'));ctx.lineTo(attr(child,'x2'),attr(child,'y2'));ctx.stroke();}else if(tag==='rect'){ctx.fillRect(attr(child,'x'),attr(child,'y'),attr(child,'width'),attr(child,'height'));if(child.getAttribute('stroke'))ctx.strokeRect(attr(child,'x'),attr(child,'y'),attr(child,'width'),attr(child,'height'));}else if(tag==='circle'){ctx.beginPath();ctx.arc(attr(child,'cx'),attr(child,'cy'),attr(child,'r'),0,Math.PI*2);ctx.fill();if(child.getAttribute('stroke'))ctx.stroke();}else if(tag==='polyline'||tag==='polygon'){const points=(child.getAttribute('points')||'').trim().split(/[ ,]+/).map(Number);if(points.length>=4){ctx.beginPath();ctx.moveTo(points[0],points[1]);for(let i=2;i+1<points.length;i+=2)ctx.lineTo(points[i],points[i+1]);if(tag==='polygon')ctx.closePath();ctx.stroke();if(tag==='polygon')ctx.fill();}}else if(tag==='text'){const cs=getComputedStyle(child);ctx.fillStyle=child.getAttribute('fill')||cs.fill||'#000';ctx.font=`${cs.fontWeight||400} ${n(cs.fontSize,12)}px ${cs.fontFamily||'sans-serif'}`;ctx.textAlign=child.getAttribute('text-anchor')==='middle'?'center':child.getAttribute('text-anchor')==='end'?'right':'left';ctx.textBaseline='alphabetic';ctx.fillText(child.textContent||'',attr(child,'x'),attr(child,'y'));}walk(child);}};
  walk(svg);return canvas;
}
async function renderElementToPng(element,{scale=1,background='#fff'}={}) {
  if(!element||typeof element.cloneNode!=='function')throw new Error('A results element is required');
  if(!root.html2canvas)throw new Error('The bundled PNG renderer is unavailable');
  if(element.ownerDocument?.fonts?.ready)await element.ownerDocument.fonts.ready;
  const transitions=(element.getAnimations?.({subtree:true})||[]).filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity);
  await Promise.all(transitions.map(a=>a.finished.catch(()=>{})));
  const doc=element.ownerDocument||document,charts=Array.from(element.querySelectorAll?.('.results-graphic')||[]).map(svg=>chartCanvas(svg,doc));
  const canvas=await root.html2canvas(element,{backgroundColor:background,scale:Math.max(1,Math.min(4,Number(scale)||1)),windowWidth:1920,windowHeight:1080,scrollX:0,scrollY:0,useCORS:false,allowTaint:true,onclone:(clonedDoc,clonedElement)=>{
    for(const node of Array.from(clonedDoc.querySelectorAll('#modal-layer,#toast,#curtain,.skip-link,input[type="file"],noscript')))node.remove();
    const stage=clonedElement?.matches?.('#game-stage')?clonedElement:clonedDoc.getElementById('game-stage');
    const viewport=clonedDoc.getElementById('viewport');
    if(viewport){viewport.style.overflow='visible';viewport.style.width='1920px';viewport.style.height='1080px';viewport.style.transform='none';}
    if(stage){stage.style.transform='none';stage.style.position='relative';stage.style.left='0';stage.style.top='0';stage.style.margin='0';stage.style.width='1920px';stage.style.height='1080px';stage.style.overflow='visible';}
    Array.from((clonedElement||clonedDoc).querySelectorAll?.('.results-graphic')||[]).forEach((svg,i)=>{
      const source=charts[i];if(!source)return;
      // Keep the chart as a bitmap canvas in the html2canvas clone. An <img>
      // backed by a data URI is asynchronous; html2canvas may start parsing
      // the clone before that image has decoded, which produced blank charts
      // on local-file launches. Canvas pixels are already present at clone time.
      const bitmap=clonedDoc.createElement('canvas');bitmap.className=svg.getAttribute('class')||'results-graphic';
      bitmap.width=source.width;bitmap.height=source.height;bitmap.setAttribute('role','img');bitmap.setAttribute('aria-label',svg.getAttribute('aria-label')||'');
      bitmap.style.width=`${svg.clientWidth||640}px`;bitmap.style.height=`${svg.clientHeight||320}px`;
      const target=bitmap.getContext('2d');if(target)target.drawImage(source,0,0);
      svg.replaceWith(bitmap);
    });
  }});
  return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not encode PNG')),'image/png'));
}
async function downloadElementPng(element,filename='partyquiz-results.png',options={}) {const blob=await renderElementToPng(element,options),doc=element.ownerDocument||document,url=URL.createObjectURL(blob),anchor=doc.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),30000);return blob;}
const api={renderElementToPng,downloadElementPng};root.NeoResultsExport=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
