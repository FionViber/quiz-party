/* Deterministic results statistics, recalculated from committed, nonvoided history. */
(function(root){
'use strict';
function build(game){
  if(!game||!Array.isArray(game.players)||!Array.isArray(game.history)) throw new Error('Invalid game for statistics');
  const players=game.players.map((name,index)=>({index,name,choice:0,open:0,correct:0,score:0}));
  const totals=players.map(()=>0);
  const timeline=[{question:0,scores:[...totals]}];
  for(const entry of game.history){
    if(entry.voided)continue;
    if(!Array.isArray(entry.deltas)||entry.deltas.length!==players.length)continue;
    for(let i=0;i<players.length;i++){
      totals[i]+=entry.deltas[i];
      if(entry.judgments?.[i]===true){
        const type=entry.type==='open'?'open':'choice';
        players[i][type]++;
        players[i].correct++;
      }
    }
    timeline.push({question:timeline.length,scores:[...totals]});
  }
  for(const p of players)p.score=totals[p.index];
  return {players,timeline,answered:timeline.length-1};
}
const api={build};root.NeoStats=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
