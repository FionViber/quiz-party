/* Canonical multilingual questions, per-game allocation, and pure scoring. */
(function (root) {
  'use strict';
  const LANGUAGES = Object.freeze(['en', 'zh-Hans', 'zh-Hant']);
  const POINTS = Object.freeze([100, 200, 300, 400, 500, 600, 700, 800]);
  const CHOICE_POINTS = Object.freeze([100, 200, 300, 400]);
  const OPEN_POINTS = Object.freeze([200, 400, 600, 800]);
  const LEGACY_OPEN_POINTS = Object.freeze([500, 600, 700, 800]);
  const MODES = Object.freeze(['together', 'buzz', 'turns']);
  const ID = /^[A-Za-z0-9._-]{1,120}$/;
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const text = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 12000;
  const validId = v => typeof v === 'string' && ID.test(v);
  const copy = v => JSON.parse(JSON.stringify(v));
  function forms(q) { return Array.isArray(q.formats) ? q.formats : ['choice', 'open']; }
  function levels(q) { return forms(q).map(f => q.difficulty + (f === 'open' ? 4 : 0)).sort((a,b)=>a-b); }
  function validatePack(pack) {
    const errors = [], add = (path, code) => errors.push({path, code});
    const triple = (v, path) => LANGUAGES.forEach(l => { if (!object(v) || !text(v[l])) add(path + '.' + l, 'text'); });
    if (!object(pack)) return [{path:'pack',code:'object'}];
    const legacy = pack.schemaVersion === 1;
    const canonical = pack.schemaVersion === 3;
    if (!legacy && ![2,3].includes(pack.schemaVersion)) add('schemaVersion','version');
    if (!validId(pack.id)) add('id','id');
    if (!text(pack.version)) add('version','text');
    triple(pack.title,'title');
    if (pack.description !== undefined) triple(pack.description,'description');
    if (!Array.isArray(pack.locales) || pack.locales.length !== 3 || LANGUAGES.some(l=>!pack.locales.includes(l))) add('locales','languages');
    const categories = new Set();
    if (!Array.isArray(pack.categories) || !pack.categories.length) add('categories','array');
    (Array.isArray(pack.categories)?pack.categories:[]).forEach((c,i)=>{
      const p=`categories[${i}]`;
      if (!object(c)) {add(p,'object');return;}
      if (!validId(c.id)) add(p+'.id','id');
      if (categories.has(c.id)) add(p+'.id','duplicate');
      categories.add(c.id);triple(c.name,p+'.name');
    });
    if (!Array.isArray(pack.questions) || pack.questions.length>50000) add('questions','array');
    const ids=new Set();
    (Array.isArray(pack.questions)?pack.questions:[]).forEach((q,i)=>{
      const p=`questions[${i}]`;
      if (!object(q)) {add(p,'object');return;}
      if (!validId(q.id)) add(p+'.id','id');
      if (ids.has(q.id)) add(p+'.id','duplicate');
      ids.add(q.id);
      if (!categories.has(q.categoryId)) add(p+'.categoryId','category');
      let fs;
      if (legacy) {
        fs=[q.type];
        if (!['choice','open'].includes(q.type)) add(p+'.type','type');
        if (!(q.type==='choice'?[100,200,300,400]:[500,600,700,800]).includes(q.points)) add(p+'.points','points');
        if (q.baseId!==undefined && !validId(q.baseId)) add(p+'.baseId','id');
      } else {
        fs=forms(q);
        if (!Number.isInteger(q.difficulty) || q.difficulty<1 || q.difficulty>4) add(p+'.difficulty','difficulty');
        if ('level' in q || 'points' in q || 'type' in q) add(p,'derived');
        if (q.formats!==undefined && (!Array.isArray(q.formats)||!q.formats.length||q.formats.length>2||q.formats.some(f=>!['choice','open'].includes(f))||new Set(q.formats).size!==q.formats.length)) add(p+'.formats','formats');
        if (canonical && fs.includes('open') && (!Number.isInteger(q.openPoints) || q.openPoints !== q.difficulty * 200)) add(p+'.openPoints','openPoints');
        if (q.openPoints !== undefined && (!canonical || !Number.isInteger(q.openPoints) || !OPEN_POINTS.includes(q.openPoints))) add(p+'.openPoints','openPoints');
      }
      if (q.tag !== undefined) {
        if (typeof q.tag==='string') {if(!text(q.tag))add(p+'.tag','text');}
        else if(object(q.tag)){LANGUAGES.forEach(l=>{if(!text(q.tag[l]))add(p+'.tag.'+l,'text');});}
        else add(p+'.tag','text');
      }
      const choice=fs.includes('choice'), open=fs.includes('open');
      const options=Array.isArray(q.options)?q.options:[];
      if (choice) {
        if (options.length<3||options.length>6) add(p+'.options','options');
        if (options.some(v=>!validId(v))||new Set(options).size!==options.length) add(p+'.options','duplicate');
        if (!options.includes(q.correctOptionId)) add(p+'.correctOptionId','answer');
      } else if ('options' in q || 'correctOptionId' in q) add(p+'.options','openOptions');
      const anyExplanation=LANGUAGES.some(l=>text(q.locales?.[l]?.explanation));
      const anyOpenPrompt=LANGUAGES.some(l=>q.locales?.[l]?.openPrompt!==undefined);
      const anyAnswer=LANGUAGES.some(l=>q.locales?.[l]?.answer!==undefined);
      LANGUAGES.forEach(l=>{
        const tr=q.locales?.[l], lp=`${p}.locales.${l}`;
        if (!object(tr)||!text(tr.prompt)) add(lp+'.prompt','text');
        if (choice) options.forEach(o=>{if (!object(tr?.optionLabels)||!text(tr.optionLabels[o])) add(lp+'.optionLabels.'+o,'text');});
        if (((open&&!choice)||anyAnswer) && !text(tr?.answer)) add(lp+'.answer','text');
        if (anyOpenPrompt && !text(tr?.openPrompt)) add(lp+'.openPrompt','text');
        if (anyExplanation && !text(tr?.explanation)) add(lp+'.explanation','explanation');
        if (tr?.explanation!==undefined && (typeof tr.explanation!=='string'||tr.explanation.length>12000)) add(lp+'.explanation','text');
        if (tr?.acceptedAnswers!==undefined && (!Array.isArray(tr.acceptedAnswers)||!tr.acceptedAnswers.length||tr.acceptedAnswers.some(a=>!text(a)))) add(lp+'.acceptedAnswers','answers');
        if (tr?.rubric!==undefined && !text(tr.rubric)) add(lp+'.rubric','text');
      });
    });
    if (legacy && !errors.length) {
      try { if(validatePack(normalizePack(pack)).length) add('questions','legacyPair'); } catch (_) {add('questions','legacyPair');}
    }
    return errors;
  }
  /* Legacy packs remain importable. A supplied baseId merges explicit pairs. */
  function normalizePack(pack) {
    if (pack.schemaVersion===2 || pack.schemaVersion===3) return copy(pack);
    if (pack.schemaVersion!==1) throw new Error('Unsupported schemaVersion');
    const out=copy(pack);out.schemaVersion=2;
    const groups=new Map();
    for (const q of out.questions) {
      const id=q.baseId||q.id, difficulty=q.points/100-(q.type==='open'?4:0);
      let target=groups.get(id);
      const current={...q,id,difficulty};
      delete current.type;delete current.points;delete current.level;delete current.baseId;
      if (!target) {
        if(q.type==='open') current.formats=['open'];
        groups.set(id,current);continue;
      }
      if(target.categoryId!==q.categoryId||target.difficulty!==difficulty) throw new Error('Inconsistent legacy baseId');
      const targetChoice=Array.isArray(target.options);
      if (targetChoice===(q.type==='choice')) throw new Error('Duplicate legacy variant');
      if(q.type==='choice') {
        LANGUAGES.forEach(l=>{current.locales[l].openPrompt=target.locales[l].prompt;current.locales[l].answer=target.locales[l].answer;});
        groups.set(id,current);
      } else {
        LANGUAGES.forEach(l=>{target.locales[l].openPrompt=q.locales[l].prompt;target.locales[l].answer=q.locales[l].answer;});
      }
    }
    out.questions=[...groups.values()];
    return out;
  }
  function variant(q,level) {
    if (!levels(q).includes(level)) throw new Error('Unavailable question level');
    const open=level>4;
    const points=open?(Number.isInteger(q.openPoints)?q.openPoints:level*100):level*100;
    const v={...q,level,points,type:open?'open':'choice',locales:{}};
    LANGUAGES.forEach(l=>{
      const tr=q.locales[l];
      v.locales[l]={...tr,prompt:open?(tr.openPrompt||tr.prompt):tr.prompt};
      if (open) {v.locales[l].answer=tr.answer||tr.optionLabels?.[q.correctOptionId];delete v.locales[l].optionLabels;}
    });
    if (open) {delete v.options;delete v.correctOptionId;}
    return v;
  }
  /* Allocate every base question to one level only, then freeze this allocation.
     Balance the two presentations within each category/difficulty group. */
  function allocateBoard(pack, excluded=[], random=Math.random) {
    const blocked=new Set(excluded), groups=new Map(), allocation=[];
    for (const q of pack.questions) {
      if (blocked.has(q.id)) continue;
      const k=q.categoryId+'::'+q.difficulty;
      if(!groups.has(k)) groups.set(k,[]);
      groups.get(k).push(q);
    }
    const unit=()=>{const n=random();if(!Number.isFinite(n)||n<0||n>=1)throw new Error('Invalid RNG');return n;};
    for (const questions of groups.values()) {
      const shuffled=[...questions];
      for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(unit()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
      let counts={choice:0,open:0};
      // Reserve restricted-format questions first, so scarce alternatives remain usable.
      shuffled.sort((a,b)=>forms(a).length-forms(b).length);
      for(const q of shuffled) {
        const fs=forms(q);
        const f=fs.length===1?fs[0]:counts.choice===counts.open?(unit()<.5?'choice':'open'):counts.choice<counts.open?'choice':'open';
        counts[f]++;
        allocation.push({qid:q.id,level:q.difficulty+(f==='open'?4:0)});
      }
    }
    return allocation;
  }
  function rngUnit(random) {
    const r=random();if(!Number.isFinite(r)||r<0||r>=1)throw new Error('Invalid RNG');
    return r;
  }
  function shuffleInPlace(a,random) {
    for(let i=a.length-1;i>0;i--){const j=Math.floor(rngUnit(random)*(i+1));[a[i],a[j]]=[a[j],a[i]];}
    return a;
  }
  /* Constant-size convex min-cost flow: each successive unit through a score
     level costs 1,3,5,..., minimizing squared level counts under capacities. */
  function balancedAssignment(candidates, lowCount, highTarget, random) {
    const pools = Array.from({length: 12}, () => []);
    for (const q of candidates) {
      const fs = forms(q), difficulty = q.difficulty - 1;
      const kind = fs.length === 1 ? (fs[0] === 'choice' ? 0 : 1) : 2;
      pools[difficulty * 3 + kind].push(q);
    }
    const S = 0, P0 = 1, L0 = 13, LG = 21, HG = 22, T = 23, N = 24;
    const edges = Array.from({length: N}, () => []);
    function edge(from, to, capacity, cost = 0, convex = false) {
      const forward = {from, to, cap: capacity, cost, convex, flow: 0, rev: 0, forward: true};
      const reverse = {from: to, to: from, cap: 0, cost: 0, convex: false, flow: 0, rev: 0, forward: false, ref: forward};
      forward.rev = edges[to].length;
      reverse.rev = edges[from].length;
      edges[from].push(forward);
      edges[to].push(reverse);
      return forward;
    }
    const levelRoutes=[];
    for (let i = 0; i < 12; i++) {
      const difficulty = Math.floor(i / 3), kind = i % 3, capacity = pools[i].length, poolNode = P0 + i;
      edge(S, poolNode, capacity);
      if (kind !== 1) levelRoutes.push({pool: i, level: difficulty + 1, edge: edge(poolNode, L0 + difficulty, capacity)});
      if (kind !== 0) levelRoutes.push({pool: i, level: difficulty + 5, edge: edge(poolNode, L0 + 4 + difficulty, capacity)});
    }
    for (let level = 1; level <= 8; level++) {
      const group = level <= 4 ? LG : HG;
      const capacity = level <= 4 ? lowCount : highTarget;
      edge(L0 + level - 1, group, capacity, 1, true);
    }
    edge(LG, T, lowCount);
    edge(HG, T, highTarget);
    let flow = 0;
    while (flow < lowCount + highTarget) {
      const distance = Array(N).fill(Infinity), previous = Array(N), queue = [S], inQueue = Array(N).fill(false);
      distance[S] = 0;
      inQueue[S] = true;
      for (let head = 0; head < queue.length; head++) {
        const node = queue[head];
        inQueue[node] = false;
        for (const candidate of edges[node]) {
          if (!candidate.cap) continue;
          const cost = candidate.forward && candidate.convex ? 2 * candidate.flow + 1 : candidate.forward ? candidate.cost : candidate.ref.convex ? -(2 * candidate.ref.flow - 1) : -candidate.ref.cost;
          if (distance[candidate.to] > distance[node] + cost) {
            distance[candidate.to] = distance[node] + cost;
            previous[candidate.to] = candidate;
            if (!inQueue[candidate.to]) { inQueue[candidate.to] = true; queue.push(candidate.to); }
          }
        }
      }
      if (!previous[T]) return null;
      for (let node = T; node !== S;) {
        const candidate = previous[node];
        candidate.cap--;
        edges[candidate.to][candidate.rev].cap++;
        if (candidate.forward) candidate.flow++; else candidate.ref.flow--;
        node = candidate.from;
      }
      flow++;
    }
    const selected = Array.from({length: 12}, () => ({low: 0, high: 0}));
    for (const route of levelRoutes) {
      const used = route.edge.flow;
      if (used > 0) selected[route.pool][route.level <= 4 ? 'low' : 'high'] += used;
    }
    const out=[];
    for (let i = 0; i < 12; i++) {
      const questions = shuffleInPlace(pools[i].slice(), random), take = selected[i], difficulty = Math.floor(i / 3);
      let index = 0;
      for (let j = 0; j < take.low; j++) out.push({qid: questions[index++].id, level: difficulty + 1});
      for (let j = 0; j < take.high; j++) out.push({qid: questions[index++].id, level: difficulty + 5});
    }
    return shuffleInPlace(out,random);
  }
  function planBoard(pack, excluded=[], count, random=Math.random) {
    if (!Number.isInteger(count) || count < 12 || count % 12 !== 0) return {feasible: false, reason: 'Round count must be a multiple of 12'};
    const blocked = new Set(excluded), candidates = [];
    for (const q of pack.questions || []) if (!blocked.has(q.id) && levels(q).length) candidates.push(q);
    if (count > candidates.length) return {feasible: false, reason: 'Not enough eligible questions for this round'};
    shuffleInPlace(candidates, random);
    const lowMin = Math.ceil(5 * count / 8), lowMax = Math.floor(6 * count / 8), preferred = Math.round(2 * count / 3);
    const choiceAvailable = candidates.reduce((n, q) => n + (forms(q).includes('choice') ? 1 : 0), 0);
    const openAvailable = candidates.reduce((n, q) => n + (forms(q).includes('open') ? 1 : 0), 0);
    const lowLo = Math.max(lowMin, count - openAvailable), lowHi = Math.min(lowMax, choiceAvailable);
    if (lowLo > lowHi) return {feasible: false, reason: 'Unable to satisfy the balanced 100–400 / 500–800 distribution with the available formats', choiceCount: 0, openCount: 0, adjusted: false};
    const low = Math.max(lowLo, Math.min(lowHi, preferred));
    const board = balancedAssignment(candidates, low, count - low, random);
    if (!board) return {feasible: false, reason: 'Unable to satisfy the balanced 100–400 / 500–800 distribution with the available formats', choiceCount: 0, openCount: 0, adjusted: false};
    const counts = Array(8).fill(0);
    board.forEach(slot => counts[slot.level - 1]++);
    const ideal = counts.slice(0, 4).every(x => x >= Math.floor(low / 4) && x <= Math.ceil(low / 4)) && counts.slice(4).every(x => x >= Math.floor((count - low) / 4) && x <= Math.ceil((count - low) / 4));
    return {feasible: true, board, counts, choiceCount: counts.slice(0, 4).reduce((a, b) => a + b, 0), openCount: counts.slice(4).reduce((a, b) => a + b, 0), adjusted: low !== preferred || !ideal};
  }
  function drawBoard(pack,excluded,count,random=Math.random) {
    const plan=planBoard(pack,excluded,count,random);if(!plan.feasible)throw new Error(plan.reason);return shuffleInPlace(plan.board.slice(),random);
  }
  function validBoard(game) {
    if(!Array.isArray(game.board)||!Array.isArray(game.seen))return false;
    const qs=new Map(game.pack.questions.map(q=>[q.id,q])), ids=new Set();
    for(const s of game.board) {
      if(!s||!qs.has(s.qid)||ids.has(s.qid)||!levels(qs.get(s.qid)).includes(s.level)) return false;
      ids.add(s.qid);
    }
    if(new Set(game.seen).size!==game.seen.length||game.seen.some(id=>!ids.has(id)))return false;
    if(game.current&&!game.board.some(s=>s.qid===game.current.qid&&s.level===game.current.level))return false;
    if(game.current&&!game.seen.includes(game.current.qid))return false;
    return true;
  }
  function remaining(game, excluded=[]) {
    const used=new Set([...game.seen,...excluded]), qs=new Map(game.pack.questions.map(q=>[q.id,q]));
    return game.board.filter(s=>!used.has(s.qid)).map(s=>variant(qs.get(s.qid),s.level));
  }
  function key(packId,questionId){return `${packId}::${questionId}`;}
  const RULES_VERSION=4;
  const LEGACY_RULES_VERSIONS=Object.freeze([2,3]);
  const SUPPORTED_RULES_VERSIONS=Object.freeze([2,3,4]);
  /* Rules V2 treated every open question as a race. New games (V3) make
     turns mode strictly sequential: the active player answers both forms.
     Passing rulesVersion 2 explicitly retains the old race semantics for
     frozen V2 rounds and compatibility tooling. */
  function isRace(mode,q,rulesVersion){
    const version=rulesVersionOrThrow(rulesVersion);
    return mode==='buzz'||(q.type==='open'&&!(mode==='turns'&&version>=3));
  }
  function isCollective(mode,q){return mode==='together'&&q.type==='choice';}
  function rulesVersionOrThrow(rulesVersion){
    const version=rulesVersion===undefined?RULES_VERSION:rulesVersion;
    if(!SUPPORTED_RULES_VERSIONS.includes(version)) throw new Error('Unsupported rules version');
    return version;
  }
  function wrongCost(mode,q,rulesVersion) {
    const version=rulesVersionOrThrow(rulesVersion);
    if(q.type==='open') return q.points/2;
    return mode==='buzz'?(version>=4?q.points/2:q.points):0;
  }
  function scoreQuestion(mode,q,judgments,answerer,count,rulesVersion) {
    const version=rulesVersionOrThrow(rulesVersion);
    if(!MODES.includes(mode))throw new Error('Invalid mode');
    if(!Number.isInteger(count)||count<2||count>8)throw new Error('Invalid player count');
    const validPoints=q.type==='choice'?CHOICE_POINTS.includes(q.points):[...OPEN_POINTS,...LEGACY_OPEN_POINTS].includes(q.points);
    if(!['choice','open'].includes(q.type)||!validPoints)throw new Error('Invalid points or type');
    const targets=isCollective(mode,q)?Array.from({length:count},(_,i)=>i):[answerer];
    const deltas=Array(count).fill(0);
    targets.forEach(i=>{
      if(!Number.isInteger(i)||i<0||i>=count||typeof judgments[i]!=='boolean')throw new Error('Incomplete judgments');
      deltas[i]=judgments[i]?q.points:-wrongCost(mode,q,version);
      if(Object.is(deltas[i],-0))deltas[i]=0;
    });
    return deltas;
  }
  function scores(game){const totals=Array(game.players.length).fill(0);game.history.filter(h=>!h.voided).forEach(h=>h.deltas.forEach((v,i)=>{totals[i]+=v;}));return totals;}
  function currentPlayer(game){return game.history.filter(h=>!h.voided).length%game.players.length;}
  function googleURL(q,language='en'){
    const l=LANGUAGES.includes(language)?language:'en', prompt=typeof q==='string'?q:q.locales[l].prompt;
    const u=new URL('https://www.google.com/search');u.searchParams.set('q',prompt);u.searchParams.set('hl',{en:'en','zh-Hans':'zh-CN','zh-Hant':'zh-TW'}[l]);return u.href;
  }
  function rank(game){const totals=scores(game),rows=game.players.map((name,index)=>({name,index,score:totals[index]})).sort((a,b)=>b.score-a.score||a.index-b.index);rows.forEach((r,i)=>{r.rank=i&&rows[i-1].score===r.score?rows[i-1].rank:i+1;});return rows;}
  const api={LANGUAGES,POINTS,CHOICE_POINTS,OPEN_POINTS,LEGACY_OPEN_POINTS,MODES,RULES_VERSION,LEGACY_RULES_VERSIONS,SUPPORTED_RULES_VERSIONS,forms,levels,validatePack,normalizePack,variant,allocateBoard,planBoard,drawBoard,validBoard,remaining,key,isRace,isCollective,wrongCost,scoreQuestion,scores,currentPlayer,googleURL,rank};
  root.NeoCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
