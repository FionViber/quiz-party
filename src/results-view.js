/* Complete game report. SVG primitives also support the offline PNG exporter. */
(function(root){
'use strict';
const COLORS=['#1769e0','#d85b8a','#16835b','#e09b20','#7a55c7','#0793a6','#c45331','#4d5b6b'];
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString();
function translate(t,key,fallback,args){const value=t?.(key,args);return value&&value!==key?value:fallback;}
function parts(value){try{return [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(String(value))].map(x=>x.segment);}catch(_){return Array.from(String(value));}}
function axis(min,max,integer=false){
  if(max<=min)max=min+1;
  const raw=(max-min)/4,power=10**Math.floor(Math.log10(raw));
  let step=([1,2,5,10].find(n=>n*power>=raw)||10)*power;
  if(integer)step=Math.max(1,Math.ceil(step));
  const low=Math.floor(min/step)*step,high=Math.ceil(max/step)*step,ticks=[];
  for(let n=low;n<=high+step/100;n+=step)ticks.push(Number(n.toFixed(6)));
  return {min:low,max:high,ticks};
}
function lineChart(stat,e=escape,labels={}){
  const W=900,H=510,L=82,R=28,T=36,B=64,pw=W-L-R,ph=H-T-B;
  const rows=stat.timeline.length?stat.timeline:[{question:0,scores:stat.players.map(()=>0)}];
  let low=0,high=0;for(const row of rows)for(const score of row.scores){low=Math.min(low,score);high=Math.max(high,score);}
  const scale=axis(low,high===low?high+100:high),count=rows.length-1;
  const x=n=>L+(count?n/count*pw:0),y=n=>T+ph-(n-scale.min)/(scale.max-scale.min)*ph;
  const grid=scale.ticks.map(n=>'<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(n)+'" y2="'+y(n)+'" stroke="'+(n===0?'#000':'#d5d0c6')+'" stroke-width="'+(n===0?3:2)+'"/><text x="'+(L-12)+'" y="'+(y(n)+6)+'" text-anchor="end" class="chart-tick">'+fmt(n)+'</text>').join('');
  const lines=stat.players.map((p,i)=>'<polyline points="'+rows.map((row,n)=>x(n).toFixed(2)+','+y(row.scores[i]).toFixed(2)).join(' ')+'" fill="none" stroke="'+COLORS[i]+'" stroke-width="4"/><circle cx="'+x(count)+'" cy="'+y(rows[count].scores[i])+'" r="5" fill="'+COLORS[i]+'" stroke="black" stroke-width="2"/>').join('');
  const ticks=[...new Set([0,Math.round(count/4),Math.round(count/2),Math.round(count*3/4),count])].map(n=>'<text x="'+x(n)+'" y="'+(H-29)+'" text-anchor="middle" class="chart-tick">'+n+'</text>').join('');
  return '<svg class="results-graphic results-line-chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+e(labels.line||'Score progression')+'"><line x1="'+L+'" x2="'+L+'" y1="'+T+'" y2="'+(T+ph)+'" stroke="black" stroke-width="3"/>'+grid+lines+ticks+'<text x="'+(W-R)+'" y="'+(H-3)+'" text-anchor="end" class="chart-axis-title">'+e(labels.axis||'Questions scored')+'</text></svg>';
}
function barChart(stat,e=escape,labels={}){
  const W=900,H=510,L=60,R=22,T=36,B=92,pw=W-L-R,ph=H-T-B;
  const max=Math.max(1,...stat.players.map(p=>p.correct)),scale=axis(0,max,true),gap=pw/stat.players.length,bw=Math.min(70,gap*.68),y=n=>T+ph-n/scale.max*ph;
  const grid=scale.ticks.map(n=>'<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(n)+'" y2="'+y(n)+'" stroke="'+(n===0?'#000':'#d5d0c6')+'" stroke-width="'+(n===0?3:2)+'"/><text x="'+(L-12)+'" y="'+(y(n)+6)+'" text-anchor="end" class="chart-tick">'+n+'</text>').join('');
  const bars=stat.players.map((p,i)=>{
    const x=L+gap*(i+.5)-bw/2,total=p.choice+p.open,hChoice=y(0)-y(p.choice),hOpen=y(p.choice)-y(total);
    const glyphs=parts(p.name),limit=Math.max(4,Math.floor(gap/20)),names=[];
    for(let at=0;at<glyphs.length;at+=limit)names.push(glyphs.slice(at,at+limit).join(''));
    const nameText=names.slice(0,3).map((name,n)=>'<text x="'+(x+bw/2)+'" y="'+(H-55+n*20)+'" text-anchor="middle" class="chart-player-name">'+e(name)+'</text>').join('');
    return '<g><title>'+e(p.name)+': '+total+'</title>'+(p.choice?'<rect x="'+x+'" y="'+y(p.choice)+'" width="'+bw+'" height="'+hChoice+'" fill="#2196f3" stroke="black" stroke-width="2"/>':'')+(p.open?'<rect x="'+x+'" y="'+y(total)+'" width="'+bw+'" height="'+hOpen+'" fill="#ff5d91" stroke="black" stroke-width="2"/>':'')+'<text x="'+(x+bw/2)+'" y="'+Math.max(23,y(total)-10)+'" text-anchor="middle" class="bar-total">'+total+'</text>'+nameText+'</g>';
  }).join('');
  return '<svg class="results-graphic results-bar-chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+e(labels.bar||'Correct answers')+'">'+grid+bars+'</svg>';
}
function durationText(game,language,clock){const ms=clock?.duration?.(game);return ms===null||ms===undefined?'':clock.format(ms,language);}
function render({game,t,e=escape,packTitle,Stats,C,clock,language='en'}={}){
  if(!game)throw new Error('A game is required');
  const stat=Stats.build(game),ranked=C.rank(game),dur=durationText(game,language,clock);
  const labels={line:translate(t,'statsLineTitle','Score progression'),bar:translate(t,'statsBarTitle','Correct answers'),axis:translate(t,'statsQuestionAxis','Questions scored')};
  const scores=ranked.map(r=>'<div class="results-score-row" data-rank="'+r.rank+'"><span class="rank-num">'+String(r.rank).padStart(2,'0')+'</span><span class="rank-name">'+e(r.name)+'</span><strong><i style="background:'+COLORS[r.index]+'"></i>'+fmt(r.score)+'</strong></div>').join('');
  const legend=stat.players.map((p,i)=>'<span class="results-legend-item"><i style="background:'+COLORS[i]+'"></i><span>'+e(p.name)+'</span></span>').join('');
  return '<div class="results-report" data-results-report style="--result-players:'+game.players.length+'"><header class="results-report-header"><div><h1>'+e(translate(t,'statsTitle','Game results'))+'</h1><p class="results-meta">'+e(t(game.mode))+' · '+e(translate(t,'statsAnswered','Questions scored: '+stat.answered,{n:stat.answered}))+'</p></div><div class="results-duration"><small>'+e(translate(t,'gameDuration','Duration'))+'</small><strong>'+e(dur||translate(t,'durationUnknown','Not recorded'))+'</strong></div></header><section class="results-score-summary"><h2>'+e(translate(t,'statsTabRanking','Final scores'))+'</h2><div class="results-score-grid">'+scores+'</div></section><section class="results-chart-panel"><div class="chart-card-head"><h2>'+e(labels.line)+'</h2></div>'+lineChart(stat,e,labels)+'</section><section class="results-chart-panel"><div class="chart-card-head"><h2>'+e(labels.bar)+'</h2><div class="bar-legend"><span><i class="choice-swatch"></i>'+e(t('tileChoice'))+'</span><span><i class="open-swatch"></i>'+e(t('tileOpen'))+'</span></div></div>'+barChart(stat,e,labels)+'</section><div class="score-legend">'+legend+'</div></div>';
}
const api={render,lineChart,barChart,durationText,axis,colors:COLORS};root.NeoResultsView=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
