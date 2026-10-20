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

;
/* Interface copy: English, Simplified Chinese, Traditional Chinese. */
window.NeoI18n = {
  "brand": [
    "Quiz Party",
    "问答派对",
    "問答派對"
  ],
  "library": [
    "Question library",
    "题库",
    "題庫"
  ],
  "rules": [
    "How to play",
    "玩法",
    "玩法"
  ],
  "settings": [
    "Settings",
    "设置",
    "設定"
  ],
  "sound": [
    "Sound effects",
    "音效",
    "音效"
  ],
  "full": [
    "Full screen",
    "全屏",
    "全螢幕"
  ],
  "exitFull": [
    "Exit full screen",
    "退出全屏",
    "退出全螢幕"
  ],
  "uiLanguage": [
    "Interface language",
    "界面语言",
    "介面語言"
  ],
  "home": [
    "Home",
    "主界面",
    "主畫面"
  ],
  "back": [
    "Back",
    "返回",
    "返回"
  ],
  "close": [
    "Close",
    "关闭",
    "關閉"
  ],
  "cancel": [
    "Cancel",
    "取消",
    "取消"
  ],
  "confirm": [
    "Confirm",
    "确认",
    "確認"
  ],
  "heroKicker": [
    "Quiz time with friends",
    "和朋友一起答题",
    "和朋友一起答題"
  ],
  "hero": [
    "Everyone here?",
    "都到齐了？",
    "都到齊了？"
  ],
  "heroSub": [
    "Gather your friends for a game of trivia.",
    "叫上朋友，来一局问答。",
    "叫上朋友，來一局問答。"
  ],
  "playerUnit": [
    "players",
    "位玩家",
    "位玩家"
  ],
  "noPhones": [
    "Play together on one screen.",
    "共用一块屏幕，一起玩。",
    "共用一個螢幕，一起玩。"
  ],
  "together": [
    "All together",
    "一起回答",
    "一起回答"
  ],
  "buzz": [
    "Buzz together",
    "一起抢答",
    "一起搶答"
  ],
  "turns": [
    "Take turns",
    "轮流回答",
    "輪流回答"
  ],
  "primary": [
    "THE MAIN EVENT",
    "主力模式",
    "主力模式"
  ],
  "togetherDesc": [
    "Choose privately, then share your choices at the same time.",
    "各自选好答案，再一起公布。",
    "各自選好答案，再一起公布。"
  ],
  "togetherNote": [
    "Multiple-choice questions are answered by everyone together with no penalty for a wrong answer. Short-answer questions are answered by one player first, and a wrong answer loses half the question value.",
    "选择题一起回答，答错不扣分。简答题一人抢答，答错扣该题分值的一半。",
    "選擇題一起回答，答錯不扣分。簡答題一人搶答，答錯扣該題分值的一半。"
  ],
  "buzzDesc": [
    "One player answers each question. A right answer adds points. A wrong answer loses half the question value.",
    "每题由一人抢答，答对加分，答错扣该题分值的一半。",
    "每題由一人搶答，答對加分，答錯扣該題分值的一半。"
  ],
  "turnsDesc": [
    "Take turns on every question, including short-answer questions.",
    "选择题和简答题，都按玩家顺序轮流回答。",
    "選擇題和簡答題，都按玩家順序輪流回答。"
  ],
  "play": [
    "Choose this mode",
    "选择此模式",
    "選擇此模式"
  ],
  "setupKicker": [
    "Game setup",
    "对局设置",
    "對局設定"
  ],
  "setupTitle": [
    "Who's in this game?",
    "这一局都有谁？",
    "這一局都有誰？"
  ],
  "setupSub": [
    "Add 2–8 players. Choose one person to operate the game.",
    "设置2至8位玩家，由一人负责游戏操作。",
    "設定2至8位玩家，由一人負責遊戲操作。"
  ],
  "playerCount": [
    "Number of players",
    "玩家人数",
    "玩家人數"
  ],
  "names": [
    "Player names",
    "玩家名字",
    "玩家名字"
  ],
  "player": [
    "Player {n}",
    "玩家{n}",
    "玩家{n}"
  ],
  "pack": [
    "Question pack",
    "题包",
    "題包"
  ],
  "start": [
    "Start game",
    "开始游戏",
    "開始遊戲"
  ],
  "rulesTogether": [
    "Multiple choice (100, 200, 300, 400 points): choose privately, then share your choices together. The operator reveals the answer and marks each player right or wrong. Right adds the question value. Wrong costs nothing. Short answer (200, 400, 600, 800 points): agree who signaled first, then select that player. After the answer, reveal the answer and judge it. Right adds the question value. Wrong costs half. Confirm the scores to continue.",
    "选择题（100、200、300、400分）：各自选好答案，再同时公布。操作者显示答案并标记每位玩家的对错。答对加该题分值，答错不扣分。简答题（200、400、600、800分）：现场确认谁先示意作答，再选择该玩家。玩家回答后显示答案并判定对错。答对加该题分值，答错扣一半。确认积分后继续。",
    "選擇題（100、200、300、400分）：各自選好答案，再同時公布。操作者顯示答案並標記每位玩家的對錯。答對加該題分值，答錯不扣分。簡答題（200、400、600、800分）：現場確認誰先示意作答，再選擇該玩家。玩家回答後顯示答案並判定對錯。答對加該題分值，答錯扣一半。確認積分後繼續。"
  ],
  "rulesBuzz": [
    "For every question, agree who signaled first, then select that player. Multiple choice (100, 200, 300, 400 points) uses the player’s selected option. Short answer (200, 400, 600, 800 points) is answered aloud. Reveal the answer, check the result, then confirm the score. A right answer adds the question value. A wrong answer loses half the value.",
    "每题先在现场确认谁先示意作答，再选择该玩家。选择题（100、200、300、400分）选中玩家的答案，简答题（200、400、600、800分）由玩家回答。随后显示答案、核对结果并确认积分。答对加该题分值，答错扣该题分值的一半。",
    "每題先在現場確認誰先示意作答，再選擇該玩家。選擇題（100、200、300、400分）選取玩家的答案，簡答題（200、400、600、800分）由玩家回答。隨後顯示答案、核對結果並確認積分。答對加該題分值，答錯扣該題分值的一半。"
  ],
  "rulesTurns": [
    "Players take turns in the order listed on every question. Multiple choice (100, 200, 300, 400 points) uses the current player’s option and reveals the answer. The game checks it. Short answer (200, 400, 600, 800 points) is answered aloud, then revealed and marked right or wrong. A right answer adds the question value. A wrong answer costs nothing on multiple choice and half the value on short-answer questions. Confirm the score, then continue to the next player.",
    "所有题目都按玩家顺序轮流回答。选择题（100、200、300、400分）选中当前玩家的答案，显示答案后自动判定对错。简答题（200、400、600、800分）由当前玩家回答，再显示答案并标记对错。答对加该题分值，选择题答错不扣分，简答题答错扣一半。确认积分后进入下一题，轮到下一位玩家。",
    "所有題目都依玩家順序輪流回答。選擇題（100、200、300、400分）選取目前玩家的答案，顯示答案後自動判定對錯。簡答題（200、400、600、800分）由目前玩家回答，再顯示答案並標記對錯。答對加該題分值，選擇題答錯不扣分，簡答題答錯扣一半。確認積分後進入下一題，輪到下一位玩家。"
  ],
  "boardTitle": [
    "Which one this time?",
    "这次选哪道？",
    "這次選哪道？"
  ],
  "choice": [
    "Multiple choice",
    "选择题",
    "選擇題"
  ],
  "open": [
    "Short answer",
    "简答题",
    "簡答題"
  ],
  "participationAll": [
    "All",
    "全体",
    "全體"
  ],
  "participationBuzz": [
    "Buzz-in",
    "抢答",
    "搶答"
  ],
  "participationTurns": [
    "Turns",
    "轮流",
    "輪流"
  ],
  "completed": [
    "Questions scored: {n}",
    "已计分{n}题",
    "已計分{n}題"
  ],
  "available": [
    "Available questions: {n}",
    "{n}题可用",
    "{n}題可用"
  ],
  "selectQ": [
    "Choose a {p}-point question",
    "选择{p}分题",
    "選擇{p}分題"
  ],
  "finish": [
    "Finish game",
    "结束本局",
    "結束本局"
  ],
  "finishTitle": [
    "Finish this game?",
    "结束本局？",
    "結束本局？"
  ],
  "finishDesc": [
    "End the game now and show the final scores. Only confirmed scores count.",
    "现在结束本局并查看最终成绩，只计入已经确认的分数。",
    "現在結束本局並查看最終成績，只計入已經確認的分數。"
  ],
  "nextTurn": [
    "Your turn: {name}",
    "轮到：{name}",
    "輪到：{name}"
  ],
  "google": [
    "Search Google",
    "用 Google 搜索",
    "用 Google 搜尋"
  ],
  "remove": [
    "Hide question",
    "隐藏这道题",
    "隱藏這道題"
  ],
  "deleteTitle": [
    "Hide this question?",
    "隐藏这道题？",
    "隱藏這道題？"
  ],
  "deleteDesc": [
    "This question, in every format, will be unavailable in this and future games until you restore it in Hidden questions. If it is currently being answered and has not been scored, it is skipped without changing scores or advancing the turn. Confirmed scores are kept.",
    "隐藏后，本局和之后的对局都不能再选到此题的任何题型，可在“已隐藏题目”中恢复。若正在作答且尚未计分，将跳过本题，不扣分、不占轮次。已经确认的分数保留。",
    "隱藏後，本局和之後的對局都不能再選到此題的任何題型，可在「已隱藏題目」中復原。若正在作答且尚未計分，將跳過本題，不扣分、不占輪次。已經確認的分數保留。"
  ],
  "deleteConfirm": [
    "Hide this question",
    "隐藏这道题",
    "隱藏這道題"
  ],
  "deletedToast": [
    "Question hidden. You can restore it in Hidden questions.",
    "题目已隐藏，可在“已隐藏题目”中恢复。",
    "題目已隱藏，可在「已隱藏題目」中復原。"
  ],
  "collectiveHint": [
    "Choose privately, then share your choices at the same time. After that, reveal the answer.",
    "各自选好答案，再同时公布选择，最后显示答案。",
    "各自選好答案，再同時公布選擇，最後顯示答案。"
  ],
  "racePenalty": [
    "Right +{p} / Wrong −{h}",
    "答对 +{p} / 答错 −{h}",
    "答對 +{p} / 答錯 −{h}"
  ],
  "noPenalty": [
    "Right +{p} / Wrong 0",
    "答对 +{p} / 答错 0",
    "答對 +{p} / 答錯 0"
  ],
  "whoBuzzed": [
    "Who signaled first?",
    "谁先示意作答？",
    "誰先示意作答？"
  ],
  "answerer": [
    "Answering: {name}",
    "作答者：{name}",
    "作答者：{name}"
  ],
  "oralHint": [
    "Answer aloud, then reveal the answer.",
    "先口头回答，再显示答案。",
    "先口頭回答，再顯示答案。"
  ],
  "reveal": [
    "Reveal answer",
    "显示答案",
    "顯示答案"
  ],
  "cardsReady": [
    "Reveal answer",
    "显示答案",
    "顯示答案"
  ],
  "pickFirst": [
    "Select the answering player first.",
    "请先选择作答者。",
    "請先選擇作答者。"
  ],
  "optionFirst": [
    "Choose an option first.",
    "请先选择一个选项。",
    "請先選擇一個選項。"
  ],
  "answer": [
    "Answer",
    "答案",
    "答案"
  ],
  "explanation": [
    "THE STORY BEHIND IT",
    "为什么是这个答案",
    "為什麼是這個答案"
  ],
  "judging": [
    "Who got it right?",
    "谁答对了？",
    "誰答對了？"
  ],
  "judgeSub": [
    "Check each answerer’s result, then confirm the scores.",
    "确认每位作答者的对错，再确认计分。",
    "確認每位作答者的對錯，再確認計分。"
  ],
  "correct": [
    "Correct",
    "答对",
    "答對"
  ],
  "wrong": [
    "Incorrect",
    "答错",
    "答錯"
  ],
  "pending": [
    "Not judged",
    "待判定",
    "待判定"
  ],
  "judgedCount": [
    "{n} / {total} judged",
    "已判定 {n} / {total}",
    "已判定 {n} / {total}"
  ],
  "commit": [
    "Confirm scores",
    "确认计分",
    "確認計分"
  ],
  "scored": [
    "Scores updated!",
    "分数已更新！",
    "分數已更新！"
  ],
  "editJudgment": [
    "Edit result",
    "更正结果",
    "更正結果"
  ],
  "next": [
    "Continue",
    "继续",
    "繼續"
  ],
  "discard": [
    "Skip this question?",
    "跳过这道题？",
    "跳過這道題？"
  ],
  "discardDesc": [
    "This question can’t be chosen again this game. No points are recorded. In Take turns, the turn does not advance.",
    "本题在本局中不能再次选择，不计分。在轮流回答模式中，也不会推进轮次。",
    "本題在本局中不能再次選擇，不計分。在輪流回答模式中，也不會推進輪次。"
  ],
  "discardEdit": [
    "Discard these changes?",
    "放弃这次更正？",
    "放棄這次更正？"
  ],
  "discardEditDesc": [
    "The previously confirmed scores for this question will be kept.",
    "本题此前确认的分数将保留。",
    "本題先前確認的分數將保留。"
  ],
  "homeConfirm": [
    "Return to Home?",
    "返回主界面？",
    "返回主畫面？"
  ],
  "homeDesc": [
    "You can resume this game from the home screen.",
    "返回主界面后，可以继续本局。",
    "返回主畫面後，可以繼續本局。"
  ],
  "resume": [
    "Resume game",
    "继续本局",
    "繼續本局"
  ],
  "newGameWarn": [
    "Start a new game?",
    "开始新的一局？",
    "開始新的一局？"
  ],
  "newGameDesc": [
    "The current game and its scores will be replaced when you start the new game.",
    "新的一局开始时将替换当前对局的题板及分数。",
    "新的一局開始時將取代目前對局的題板及分數。"
  ],
  "resultsKicker": [
    "Game over",
    "本局结束",
    "本局結束"
  ],
  "winner": [
    "Top score",
    "本局最高分",
    "本局最高分"
  ],
  "tied": [
    "Tied for top score",
    "并列最高分",
    "並列最高分"
  ],
  "replay": [
    "Play again",
    "再来一局",
    "再來一局"
  ],
  "resultsExport": [
    "Export results image",
    "导出成绩图片",
    "匯出成績圖片"
  ],
  "points": [
    "PTS",
    "分",
    "分"
  ],
  "importPack": [
    "Import question pack",
    "导入题包",
    "匯入題包"
  ],
  "exportPack": [
    "Export full pack",
    "导出完整题包",
    "匯出完整題包"
  ],
  "active": [
    "Available questions",
    "可用题目",
    "可用題目"
  ],
  "filter": [
    "Search questions",
    "搜索题目",
    "搜尋題目"
  ],
  "inspect": [
    "View question",
    "查看题目",
    "查看題目"
  ],
  "restore": [
    "Restore question",
    "恢复题目",
    "復原題目"
  ],
  "restored": [
    "No longer hidden. Questions already shown can’t be chosen again this game.",
    "已取消隐藏。本局已展示过的题目不能再次选择。",
    "已取消隱藏。本局已顯示過的題目不能再次選擇。"
  ],
  "noMatches": [
    "No questions to show",
    "没有可显示的题目",
    "沒有可顯示的題目"
  ],
  "page": [
    "Page {n} / {total}",
    "第 {n} 页 / 共 {total} 页",
    "第 {n} 頁 / 共 {total} 頁"
  ],
  "prev": [
    "Previous",
    "上一页",
    "上一頁"
  ],
  "nextPage": [
    "Next",
    "下一页",
    "下一頁"
  ],
  "exportDeletes": [
    "Export hidden list",
    "导出隐藏记录",
    "匯出隱藏紀錄"
  ],
  "importDeletes": [
    "Import hidden list",
    "导入隐藏记录",
    "匯入隱藏紀錄"
  ],
  "importOk": [
    "Question packs imported: {n}.",
    "已导入 {n} 个题包。",
    "已匯入 {n} 個題包。"
  ],
  "importFail": [
    "Cannot import this file",
    "无法导入此文件",
    "無法匯入此檔案"
  ],
  "importFailDesc": [
    "Check the details below, then try importing again.",
    "请按以下提示处理后重新导入。",
    "請依下方提示處理後重新匯入。"
  ],
  "cacheFail": [
    "Local saving failed. Before closing, export what you need to keep: game saves from Home, and question packs or hidden lists from the library.",
    "本地保存失败。关闭游戏前，请导出需要保留的数据：存档在主界面导出，题包和隐藏记录在题库导出。",
    "本機儲存失敗。關閉遊戲前，請匯出需要保留的資料：存檔在主畫面匯出，題包和隱藏紀錄在題庫匯出。"
  ],
  "replacePack": [
    "Replace existing packs?",
    "替换已有题包？",
    "取代現有題包？"
  ],
  "replaceDesc": [
    "Question packs with matching IDs will be replaced. The current game keeps its original questions. Keep a copy of the old packs to load saves made with them.",
    "相同 ID 的题包将被替换，当前对局仍使用原来的题目。如需载入使用旧题包的存档，请保留旧题包。",
    "相同 ID 的題包將被取代，目前對局仍使用原本的題目。如需載入使用舊題包的存檔，請保留舊題包。"
  ],
  "errorObject": [
    "Use a JSON object.",
    "请使用 JSON 对象。",
    "請使用 JSON 物件。"
  ],
  "errorText": [
    "Use text of up to 12,000 characters. Required fields cannot be blank.",
    "请使用不超过 12,000 个字符的文本；必填字段不能为空。",
    "請使用不超過 12,000 個字元的文字；必填欄位不能留白。"
  ],
  "errorVersion": [
    "Use schemaVersion 3 for current-format question packs; legacy packs can use 1 or 2.",
    "当前格式题包的 schemaVersion 应为 3；旧格式题包可为 1 或 2。",
    "目前格式題包的 schemaVersion 應為 3；舊格式題包可為 1 或 2。"
  ],
  "errorId": [
    "Use an ID of 1–120 characters: A–Z, a–z, 0–9, dots, hyphens, or underscores.",
    "ID 长度须为 1 至 120 个字符，只可使用英文字母、数字、点、连字符和下划线。",
    "ID 長度須為 1 至 120 個字元，只能使用英文字母、數字、點、連字號和底線。"
  ],
  "errorLanguages": [
    "Set locales to exactly en, zh-Hans, and zh-Hant.",
    "locales 必须且只能包含 en、zh-Hans、zh-Hant。",
    "locales 必須且只能包含 en、zh-Hans、zh-Hant。"
  ],
  "errorArray": [
    "Use an array. categories needs at least one item; questions allows up to 50,000 items.",
    "请使用数组。categories 至少需要 1 项；questions 最多允许 50,000 项。",
    "請使用陣列。categories 至少需要 1 項；questions 最多允許 50,000 項。"
  ],
  "errorDuplicate": [
    "Use unique IDs of 1–120 characters: A–Z, a–z, 0–9, dots, hyphens, or underscores.",
    "请使用不重复的 ID，长度为 1 至 120 个字符，只可使用英文字母、数字、点、连字符和下划线。",
    "請使用不重複的 ID，長度為 1 至 120 個字元，只能使用英文字母、數字、點、連字號和底線。"
  ],
  "errorCategory": [
    "Set categoryId to an ID listed in categories.",
    "请将 categoryId 设为 categories 中已有的 ID。",
    "請將 categoryId 設為 categories 中已有的 ID。"
  ],
  "errorType": [
    "Set type to choice or open.",
    "请将 type 设为 choice 或 open。",
    "請將 type 設為 choice 或 open。"
  ],
  "errorPoints": [
    "For choice, use 100, 200, 300, or 400 points. For open, use 200, 400, 600, or 800.",
    "choice 的 points 只能为 100、200、300、400，open 只能为 200、400、600、800。",
    "choice 的 points 只能為 100、200、300、400，open 只能為 200、400、600、800。"
  ],
  "errorOptions": [
    "Provide 3–6 option IDs in options.",
    "请在 options 中填写 3 至 6 个选项 ID。",
    "請在 options 中填入 3 至 6 個選項 ID。"
  ],
  "errorAnswer": [
    "Set correctOptionId to one of the IDs in options.",
    "请将 correctOptionId 设为 options 中的一个 ID。",
    "請將 correctOptionId 設為 options 中的一個 ID。"
  ],
  "errorOpenOptions": [
    "For short-answer-only questions, remove options and correctOptionId.",
    "仅含简答题的题目须移除 options 和 correctOptionId。",
    "僅含簡答題的題目須移除 options 和 correctOptionId。"
  ],
  "errorExplanation": [
    "Provide explanation in all three languages, or leave it out of all three.",
    "请补齐 explanation 的三种语言文本，或在三种语言中都省略该字段。",
    "請補齊 explanation 的三種語言文字，或在三種語言中都省略該欄位。"
  ],
  "settingsTitle": [
    "Settings",
    "设置",
    "設定"
  ],
  "effects": [
    "Sound effects",
    "音效",
    "音效"
  ],
  "music": [
    "Background music",
    "背景音乐",
    "背景音樂"
  ],
  "motion": [
    "Reduce motion",
    "减少动效",
    "減少動效"
  ],
  "enabled": [
    "On",
    "开启",
    "開啟"
  ],
  "disabled": [
    "Off",
    "关闭",
    "關閉"
  ],
  "importedDeletion": [
    "Hidden list imported.",
    "隐藏记录已导入。",
    "隱藏紀錄已匯入。"
  ],
  "fileLarge": [
    "This file is too large. The limit is 20 MiB.",
    "文件过大，单个文件不得超过 20 MiB。",
    "檔案過大，單一檔案不得超過 20 MiB。"
  ],
  "noFullscreen": [
    "Couldn’t switch full-screen mode.",
    "无法切换全屏。",
    "無法切換全螢幕。"
  ],
  "keyboard": [
    "Tab to navigate · Enter to activate · Esc to close",
    "Tab切换控件 · Enter确认 · Esc关闭弹窗",
    "Tab切換控制項 · Enter確認 · Esc關閉彈窗"
  ],
  "level": [
    "LEVEL {n}",
    "第{n}级",
    "第{n}級"
  ],
  "errorDifficulty": [
    "Set difficulty to a whole number from 1 to 4.",
    "请将 difficulty 设为 1 至 4 的整数。",
    "請將 difficulty 設為 1 至 4 的整數。"
  ],
  "errorDerived": [
    "If schemaVersion is 2 or 3, remove the type, points, and level fields.",
    "schemaVersion 为 2 或 3 时，请删除 type、points 和 level 字段。",
    "schemaVersion 為 2 或 3 時，請刪除 type、points 和 level 欄位。"
  ],
  "errorFormats": [
    "Set formats to [\"choice\"], [\"open\"], or [\"choice\", \"open\"].",
    "请将 formats 设为 [\"choice\"]、[\"open\"] 或 [\"choice\", \"open\"]。",
    "請將 formats 設為 [\"choice\"]、[\"open\"] 或 [\"choice\", \"open\"]。"
  ],
  "errorLegacyPair": [
    "Old-format questions sharing a baseId must use the same categoryId and matching difficulty. Keep at most one choice entry and one short-answer entry; the short-answer entry must be worth 400 points more.",
    "旧格式题目共用 baseId 时，categoryId 和基础难度须一致。选择题与简答题各最多一条，简答题须比选择题高 400 分。",
    "舊格式題目共用 baseId 時，categoryId 和基礎難度須一致。選擇題與簡答題各最多一筆，簡答題須比選擇題高 400 分。"
  ],
  "skip": [
    "Skip to content",
    "跳到主要内容",
    "跳到主要內容"
  ],
  "builtin": [
    "Built-in question bank",
    "内置题库",
    "內置題庫"
  ],
  "choosePack": [
    "Choose a question pack",
    "选择题包",
    "選擇題包"
  ],
  "allPacks": [
    "All question packs",
    "全部题包",
    "全部題包"
  ],
  "pickOption": [
    "Choose option {n}",
    "选择选项 {n}",
    "選擇選項 {n}"
  ],
  "viewOptions": [
    "View options",
    "查看选项",
    "查看選項"
  ],
  "hiddenTitle": [
    "Hidden questions",
    "已隐藏题目",
    "已隱藏題目"
  ],
  "hiddenAt": [
    "Hidden",
    "隐藏于",
    "隱藏於"
  ],
  "hiddenCount": [
    "Hidden questions: {n}",
    "已隐藏 {n} 道题",
    "已隱藏 {n} 道題"
  ],
  "unavailableQuestion": [
    "Import the original question pack to view this question.",
    "导入原题包后即可查看这道题。",
    "匯入原題包後即可查看這道題。"
  ],
  "invalidHidden": [
    "This file is not a valid hidden-question list. Choose a list exported from the game.",
    "这不是有效的隐藏记录文件。请选择从游戏导出的隐藏记录。",
    "這不是有效的隱藏紀錄檔案。請選擇從遊戲匯出的隱藏紀錄。"
  ],
  "resultsHistory": [
    "Game history",
    "历史记录",
    "歷史紀錄"
  ],
  "resultsHistoryCount": [
    "Game history ({n})",
    "历史记录（{n}）",
    "歷史紀錄（{n}）"
  ],
  "historyEmpty": [
    "No games saved yet. Finished games appear here automatically and are included when you export a save.",
    "还没有历史记录。对局结束后会自动保存在这里，导出存档时也会一并保存。",
    "還沒有歷史紀錄。對局結束後會自動儲存在這裡，匯出存檔時也會一併儲存。"
  ],
  "resultsExportFailed": [
    "Couldn’t export the results image. Please try again.",
    "成绩图片导出失败，请重试。",
    "成績圖片匯出失敗，請重試。"
  ],
  "turnOpenReady": [
    "Let {n} answer aloud, then select “Reveal answer”.",
    "由 {n} 口头回答，再点击“显示答案”。",
    "由 {n} 口頭回答，再點選「顯示答案」。"
  ],
  "turnCorrect": [
    "Correct",
    "回答正确",
    "回答正確"
  ],
  "turnWrong": [
    "Incorrect",
    "回答错误",
    "回答錯誤"
  ],
  "turnJudge": [
    "Was the answer correct?",
    "这次回答对了吗？",
    "這次回答對了嗎？"
  ],
  "turnJudgeHint": [
    "Compare the answer with the answer shown. Mark it correct or incorrect, then select “Confirm scores”.",
    "对照显示的答案，判定口头回答对错，再点击“确认计分”。",
    "對照顯示的答案，判定口頭回答對錯，再點選「確認計分」。"
  ],
  "turnConfirmHint": [
    "Select “Confirm scores” to update the total. To answer again, select “Undo answer”.",
    "点击“确认计分”后更新总分。需要重新回答，可选择“撤回作答”。",
    "點選「確認計分」後更新總分。需要重新回答，可選擇「撤回作答」。"
  ],
  "selectedAnswer": [
    "Selected: {option}",
    "已选：{option}",
    "已選：{option}"
  ],
  "retryAnswer": [
    "Undo answer",
    "撤回作答",
    "撤回作答"
  ],
  "undoScore": [
    "Undo score and retry",
    "撤销计分并重答",
    "撤銷計分並重答"
  ],
  "boardKeys": [
    "↑ ↓ ← → Select · Enter Open",
    "↑ ↓ ← → 选题 · Enter 进入",
    "↑ ↓ ← → 選題 · Enter 進入"
  ],
  "boardKeysEmpty": [
    "No available questions on this page",
    "本页没有可选题目",
    "本頁沒有可選題目"
  ],
  "balanceTitle": [
    "Question values",
    "本局题目分值",
    "本局題目分值"
  ],
  "balanceRatio": [
    "Multiple choice: {percent}%",
    "选择题占比：{percent}%",
    "選擇題佔比：{percent}%"
  ],
  "balanceUnavailable": [
    "Can’t start with this mix of question formats. Multiple-choice questions must make up 62.5%–75% of the game. Try fewer questions, restore hidden questions, or choose another question pack.",
    "当前题型组合无法开局：选择题须占本局题数的 62.5%–75%。可尝试减少题数、恢复隐藏题目或更换题包。",
    "目前題型組合無法開局：選擇題須佔本局題數的 62.5%–75%。可嘗試減少題數、復原隱藏題目或更換題包。"
  ],
  "viewRestore": [
    "View and restore",
    "查看与恢复",
    "查看與復原"
  ],
  "pickedQuestion": [
    "Already picked",
    "已选过",
    "已選過"
  ],
  "viewResults": [
    "View results",
    "查看成绩",
    "查看成績"
  ],
  "importSave": [
    "Import save",
    "导入存档",
    "匯入存檔"
  ],
  "exportSave": [
    "Export save",
    "导出存档",
    "匯出存檔"
  ],
  "noGameSave": [
    "Start a game before exporting a save.",
    "请先开始一局再导出存档。",
    "請先開始一局再匯出存檔。"
  ],
  "saveImported": [
    "Save loaded.",
    "存档已载入。",
    "存檔已載入。"
  ],
  "loadSaveConfirm": [
    "Load this save?",
    "载入这个存档？",
    "載入這份存檔？"
  ],
  "loadSaveDesc": [
    "Loading replaces the current game, hidden-question list, interface language and other settings with those in this save. Game history is merged; for duplicate games, the imported record replaces the current one.",
    "将用存档中的对局、隐藏记录、界面语言及其他设置替换当前内容。历史成绩会合并；同一局重复时，采用导入的记录。",
    "將以存檔中的對局、隱藏紀錄、介面語言及其他設定取代目前內容。歷史成績會合併；同一局重複時，採用匯入的紀錄。"
  ],
  "searchTotal": [
    "Questions: {n}",
    "{n} 道题",
    "{n} 道題"
  ],
  "roundQuestionCount": [
    "Questions per game",
    "本局题数",
    "本局題數"
  ],
  "roundQuestionUnit": [
    "questions",
    "道题",
    "道題"
  ],
  "roundStepHint": [
    "In steps of 12 · current maximum: {max}",
    "每次增减 12 题 · 当前上限 {max} 题",
    "每次增減 12 題 · 目前上限 {max} 題"
  ],
  "roundLess": [
    "12 fewer questions",
    "减少 12 道题",
    "減少 12 道題"
  ],
  "roundMore": [
    "12 more questions",
    "增加 12 道题",
    "增加 12 道題"
  ],
  "needTwelve": [
    "You need at least 12 available questions to start. Restore hidden questions or choose another question pack.",
    "至少需要 12 道可用题目才能开局。请恢复隐藏题目或更换题包。",
    "至少需要 12 道可用題目才能開局。請復原隱藏題目或更換題包。"
  ],
  "roundProgress": [
    "Questions scored: {n} / {total}",
    "已计分 {n} / {total} 题",
    "已計分 {n} / {total} 題"
  ],
  "tileChoice": [
    "Choice",
    "选择题",
    "選擇題"
  ],
  "tileOpen": [
    "Short answer",
    "简答题",
    "簡答題"
  ],
  "turnChoiceNext": [
    "Choose an option using its number key or a click, then select “Reveal answer”.",
    "按选项的数字键或点击选项，再点击“显示答案”。",
    "按選項的數字鍵或點選選項，再點選「顯示答案」。"
  ],
  "turnChoiceReady": [
    "Selected: {option}. Select “Reveal answer” to continue.",
    "已选 {option}。点击“显示答案”继续。",
    "已選 {option}。點選「顯示答案」繼續。"
  ],
  "raceChoiceFirst": [
    "Select the first player, then choose their answer using its number key or a click.",
    "先选出最先示意作答的玩家，再按数字键或点击选项记录答案。",
    "先選出最先示意作答的玩家，再按數字鍵或點選選項記錄答案。"
  ],
  "raceChoiceNext": [
    "{n} is answering. Choose their answer using its number key or a click.",
    "由 {n} 回答。按数字键或点击对应选项记录答案。",
    "由 {n} 回答。按數字鍵或點選對應選項記錄答案。"
  ],
  "raceChoiceReady": [
    "{n} chose {option}. Select “Reveal answer” to continue.",
    "{n} 选择了 {option}。点击“显示答案”继续。",
    "{n} 選擇了 {option}。點選「顯示答案」繼續。"
  ],
  "raceOpenFirst": [
    "Select the first player. After they answer aloud, select “Reveal answer”.",
    "先选出最先示意作答的玩家。口头回答后，点击“显示答案”。",
    "先選出最先示意作答的玩家。口頭回答後，點選「顯示答案」。"
  ],
  "raceOpenReady": [
    "Let {n} answer aloud, then select “Reveal answer”.",
    "由 {n} 口头回答，再点击“显示答案”。",
    "由 {n} 口頭回答，再點選「顯示答案」。"
  ],
  "statsTitle": [
    "How did this game go?",
    "这一局，答得如何？",
    "這一局，答得如何？"
  ],
  "statsTabCharts": [
    "Statistics",
    "统计图表",
    "統計圖表"
  ],
  "statsTabRanking": [
    "Final rankings",
    "最终排名",
    "最終排名"
  ],
  "statsLineTitle": [
    "Score progression",
    "分数走势",
    "分數走勢"
  ],
  "statsLineDesc": [
    "Each player’s total after every scored question",
    "每题计分后，各玩家的累计分数",
    "每題計分後，各玩家的累計分數"
  ],
  "statsQuestionAxis": [
    "Questions scored",
    "已计分题数",
    "已計分題數"
  ],
  "statsBarTitle": [
    "Correct answers",
    "答对题数",
    "答對題數"
  ],
  "statsBarDesc": [
    "Multiple choice and short-answer questions",
    "选择题与简答题分别统计",
    "選擇題與簡答題分別統計"
  ],
  "statsAnswered": [
    "Questions scored: {n}",
    "本局已计分 {n} 题",
    "本局已計分 {n} 題"
  ],
  "acceptedAnswers": [
    "Accepted answers",
    "可接受答案",
    "可接受答案"
  ],
  "gradingNotes": [
    "",
    "",
    ""
  ],
  "nameLimit": [
    "Up to 12 characters per name",
    "每个名字最多 12 个字符",
    "每個名字最多 12 個字元"
  ],
  "questionNumber": [
    "Question {n}",
    "第 {n} 号题",
    "第 {n} 號題"
  ],
  "judgingSingle": [
    "Was the answer correct?",
    "答对了吗？",
    "答對了嗎？"
  ],
  "judgeSingleSub": [
    "Check the answerer’s result, then confirm the score.",
    "确认答题者的对错，再确认积分。",
    "確認答題者的對錯，再確認積分。"
  ],
  "saveFileLarge": [
    "This save file is too large. The limit is 32 MiB.",
    "存档文件过大，不得超过 32 MiB。",
    "存檔檔案過大，不得超過 32 MiB。"
  ],
  "confirmSkipQuestion": [
    "Skip question",
    "跳过本题",
    "跳過本題"
  ],
  "confirmDiscardChanges": [
    "Discard changes",
    "放弃更正",
    "放棄更正"
  ],
  "confirmReturnHome": [
    "Return to Home",
    "返回主界面",
    "返回主畫面"
  ],
  "confirmNewGameSetup": [
    "Start",
    "开始",
    "開始"
  ],
  "confirmReplacePacks": [
    "Replace packs",
    "替换题包",
    "取代題包"
  ],
  "confirmFinishGame": [
    "Finish game",
    "结束本局",
    "結束本局"
  ],
  "confirmLoadSave": [
    "Load save",
    "载入存档",
    "載入存檔"
  ],
  "headerNavigation": [
    "Game controls",
    "游戏操作",
    "遊戲操作"
  ],
  "saveNotRecognized": [
    "This file isn't a Quiz Party save. Choose a save file exported by the game.",
    "这不是问答派对的存档文件。请选择从游戏中导出的存档。",
    "這不是問答派對的存檔。請選擇從遊戲中匯出的存檔。"
  ],
  "saveFormatInvalid": [
    "The save's format information is invalid. Choose another save, or export it again from the original game.",
    "存档的格式信息无效。请选择其他存档，或从原来的游戏中重新导出。",
    "存檔的格式資訊無效。請選擇其他存檔，或從原來的遊戲中重新匯出。"
  ],
  "saveRequiresUpdate": [
    "This save needs a newer version of the game. Open it in the version that created it or a compatible newer version.",
    "此存档需要更新版本的游戏。请使用创建它的游戏版本，或兼容的更新版本打开。",
    "此存檔需要更新版本的遊戲。請使用建立它的遊戲版本，或相容的更新版本開啟。"
  ],
  "saveIncomplete": [
    "This save is missing required data. Choose another save, or export it again from the original game.",
    "此存档缺少必要数据。请选择其他存档，或从原来的游戏中重新导出。",
    "此存檔缺少必要資料。請選擇其他存檔，或從原來的遊戲中重新匯出。"
  ],
  "savePackMissing": [
    "Question pack “{packId}” is missing. Import the exact pack used for this save, then try again.",
    "缺少题包“{packId}”。请先导入创建此存档时使用的同一份题包，再重试。",
    "缺少題包「{packId}」。請先匯入建立此存檔時使用的同一份題包，再重試。"
  ],
  "savePackVersionMismatch": [
    "Question pack “{packId}” has a different version. This save needs {expectedVersion}; {installedVersion} is installed. Import the exact pack used for this save, then try again.",
    "题包“{packId}”的版本不符。存档需要 {expectedVersion}，当前安装的是 {installedVersion}。请导入创建此存档时使用的同一份题包，再重试。",
    "題包「{packId}」的版本不符。存檔需要 {expectedVersion}，目前安裝的是 {installedVersion}。請匯入建立此存檔時使用的同一份題包，再重試。"
  ],
  "savePackSchemaMismatch": [
    "Question pack “{packId}” uses a different data format. Import the exact pack used for this save, then try again.",
    "题包“{packId}”的数据格式与此存档不符。请导入创建此存档时使用的同一份题包，再重试。",
    "題包「{packId}」的資料格式與此存檔不符。請匯入建立此存檔時使用的同一份題包，再重試。"
  ],
  "savePackContentMismatch": [
    "Question pack “{packId}” has the right version, but its contents differ from the pack used for this save. Import the original pack, then try again.",
    "题包“{packId}”的版本相同，但内容与创建此存档时使用的题包不同。请导入原来的题包，再重试。",
    "題包「{packId}」的版本相同，但內容與建立此存檔時使用的題包不同。請匯入原來的題包，再重試。"
  ],
  "saveRoundCountInvalid": [
    "The question count in this save is invalid. Choose another save, or export this round again from the original game.",
    "存档中的本局题数无效。请选择其他存档，或从原来的游戏中重新导出本局存档。",
    "存檔中的本局題數無效。請選擇其他存檔，或從原來的遊戲中重新匯出本局存檔。"
  ],
  "saveRoundStateInvalid": [
    "The round data in this save is invalid. Choose another save, or export this round again from the original game.",
    "存档中的本局数据无效。请选择其他存档，或从原来的游戏中重新导出本局存档。",
    "存檔中的本局資料無效。請選擇其他存檔，或從原來的遊戲中重新匯出本局存檔。"
  ],
  "saveScoringHistoryInvalid": [
    "The scoring history in this save is invalid. Choose another save, or export this round again from the original game.",
    "存档中的计分记录无效。请选择其他存档，或从原来的游戏中重新导出本局存档。",
    "存檔中的計分紀錄無效。請選擇其他存檔，或從原來的遊戲中重新匯出本局存檔。"
  ],
  "saveTurnOrderInvalid": [
    "The saved turn order doesn't match the scoring history. Choose another save, or export this round again from the original game.",
    "存档中的轮流顺序与计分记录不符。请选择其他存档，或从原来的游戏中重新导出本局存档。",
    "存檔中的輪流順序與計分紀錄不符。請選擇其他存檔，或從原來的遊戲中重新匯出本局存檔。"
  ],
  "saveJudgmentsInvalid": [
    "The answer judgments in this save are invalid. Choose another save, or export this round again from the original game.",
    "存档中的答案判定记录无效。请选择其他存档，或从原来的游戏中重新导出本局存档。",
    "存檔中的答案判定紀錄無效。請選擇其他存檔，或從原來的遊戲中重新匯出本局存檔。"
  ],
  "saveScoreIncomplete": [
    "A score record in this save is incomplete or invalid. Choose another save, or export this round again from the original game.",
    "存档中有计分记录不完整或无效。请选择其他存档，或从原来的游戏中重新导出本局存档。",
    "存檔中有計分紀錄不完整或無效。請選擇其他存檔，或從原來的遊戲中重新匯出本局存檔。"
  ],
  "saveScoreMismatch": [
    "The saved scores don't match the recorded answer judgments. Choose another save, or export this round again from the original game.",
    "存档中的分数与答案判定记录不符。请选择其他存档，或从原来的游戏中重新导出本局存档。",
    "存檔中的分數與答案判定紀錄不符。請選擇其他存檔，或從原來的遊戲中重新匯出本局存檔。"
  ],
  "saveActiveQuestionInvalid": [
    "The current question's progress in this save is invalid. Choose another save, or export this round again from the original game.",
    "存档中当前题目的作答进度无效。请选择其他存档，或从原来的游戏中重新导出本局存档。",
    "存檔中目前題目的作答進度無效。請選擇其他存檔，或從原來的遊戲中重新匯出本局存檔。"
  ],
  "saveCommittedScoreMissing": [
    "The current question is marked as scored, but its score record is missing. Choose another save, or export this round again from the original game.",
    "存档中当前题目已标为计分，但缺少对应的计分记录。请选择其他存档，或从原来的游戏中重新导出本局存档。",
    "存檔中目前題目已標為計分，但缺少對應的計分紀錄。請選擇其他存檔，或從原來的遊戲中重新匯出本局存檔。"
  ],
  "saveActiveScoreMismatch": [
    "The current question's answer judgments don't match its score record. Choose another save, or export this round again from the original game.",
    "存档中当前题目的答案判定与计分记录不符。请选择其他存档，或从原来的游戏中重新导出本局存档。",
    "存檔中目前題目的答案判定與計分紀錄不符。請選擇其他存檔，或從原來的遊戲中重新匯出本局存檔。"
  ],
  "saveHiddenRecordsInvalid": [
    "The hidden-question records in this save are invalid. Choose another save, or export it again from the original game.",
    "存档中的隐藏记录无效。请选择其他存档，或从原来的游戏中重新导出。",
    "存檔中的隱藏紀錄無效。請選擇其他存檔，或從原來的遊戲中重新匯出。"
  ],
  "saveResultsHistoryInvalid": [
    "The past results in this save are invalid. Choose another save, or export it again from the original game.",
    "存档中的历史对局记录无效。请选择其他存档，或从原来的游戏中重新导出。",
    "存檔中的歷史對局紀錄無效。請選擇其他存檔，或從原來的遊戲中重新匯出。"
  ],
  "importJsonInvalid": [
    "This file isn't valid JSON. Choose another copy, or check its JSON format before importing it again.",
    "此文件不是有效的 JSON。请选择其他副本，或检查 JSON 格式后重新导入。",
    "此檔案不是有效的 JSON。請選擇其他副本，或檢查 JSON 格式後重新匯入。"
  ],
  "importFileReadFailed": [
    "Couldn't read this file. Select it again, or try another copy.",
    "无法读取此文件。请重新选择文件，或尝试其他副本。",
    "無法讀取此檔案。請重新選擇檔案，或嘗試其他副本。"
  ],
  "importUnexpectedError": [
    "Couldn't import this file. Try another copy.",
    "无法导入此文件。请尝试其他副本。",
    "無法匯入此檔案。請嘗試其他副本。"
  ],
  "packStorageFailed": [
    "The question bank could not be stored in this browser. The current bank is unchanged. Check browser storage permission and free space, then try again.",
    "题库无法保存到当前浏览器，当前题库未改变。请检查浏览器存储权限和可用空间后重试。",
    "題庫無法儲存到目前瀏覽器，目前題庫未變更。請檢查瀏覽器儲存權限和可用空間後重試。"
  ],
  "actionFailed": [
    "Couldn’t complete that action.",
    "未能完成此操作。",
    "未能完成此操作。"
  ],
  "errorAnswers": [
    "acceptedAnswers must be an array of strings.",
    "acceptedAnswers 必须是字符串数组。",
    "acceptedAnswers 必須是字串陣列。"
  ],
  "errorOpenPoints": [
    "For schemaVersion 3, openPoints must equal difficulty × 200; schemaVersion 2 cannot include openPoints.",
    "schemaVersion 3 的 openPoints 必须等于 difficulty × 200；schemaVersion 2 不可包含 openPoints。",
    "schemaVersion 3 的 openPoints 必須等於 difficulty × 200；schemaVersion 2 不可包含 openPoints。"
  ],
  "about": [
    "About",
    "关于",
    "關於"
  ],
  "allCorrect": [
    "All correct",
    "全对",
    "全對"
  ],
  "allWrong": [
    "All wrong",
    "全错",
    "全錯"
  ],
  "categoryFilter": [
    "Question categories",
    "题目分类",
    "題目分類"
  ],
  "categorySelection": [
    "Include questions from selected categories",
    "只包含已选分类的题目",
    "只包含已選分類的題目"
  ],
  "includeAll": [
    "Select all",
    "全部选中",
    "全部選取"
  ],
  "clearAll": [
    "Clear all",
    "全部取消",
    "全部取消"
  ],
  "selectedCategories": [
    "{n} of {total} selected",
    "已选 {n} / {total}",
    "已選 {n} / {total}"
  ],
  "noCategories": [
    "Select at least one category",
    "请至少选择一个分类",
    "請至少選擇一個分類"
  ],
  "categoryCount": [
    "{n} categories",
    "{n} 个分类",
    "{n} 個分類"
  ],
  "durationLabel": [
    "Game duration",
    "对局时长",
    "對局時長"
  ],
  "gameDuration": [
    "Game duration",
    "对局时长",
    "對局時長"
  ],
  "durationUnknown": [
    "Not available",
    "暂无记录",
    "暫無記錄"
  ],
  "resultsSinglePage": [
    "Game results",
    "本局结果",
    "本局結果"
  ],
  "contentPages": [
    "Content pages",
    "内容翻页",
    "內容翻頁"
  ]
};

;
/* Local audio: synthesized interaction sounds plus the supplied local BGM. */
window.NeoAudio = (function () {
  'use strict';
  const BGM_URL = 'assets/audio/BGM01.mp3';
  const BGM_GAP_MS = 15000;
  let context, bus, lastHover = 0, unlocked = false;
  let music, musicTimer, musicGeneration = 0, playPending = null;
  let gapDueAt = 0, gapRemaining = 0;
  let options = {sfx: true, music: false};
  function unlock() {
    try {
      unlocked = true;
      if (!context) {
        const Constructor = window.AudioContext || window.webkitAudioContext;
        if (Constructor) {
          context = new Constructor(); bus = context.createGain(); bus.gain.value = .12; bus.connect(context.destination);
        }
      }
      const resume = context && context.state === 'suspended' ? context.resume() : null;
      if (resume && typeof resume.then === 'function') resume.then(() => syncMusic()).catch(() => {});
      ensureMusic();
      syncMusic();
    } catch (_) { /* Audio is optional. The game remains usable without it. */ }
  }
  function ensureMusic() {
    if (music || typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    music = document.createElement('audio'); music.id = 'neo-bgm'; music.preload = 'metadata'; music.src = BGM_URL;
    music.setAttribute('aria-hidden', 'true'); music.addEventListener('ended', scheduleMusic);
    music.addEventListener('error', () => clearMusicTimer());
    if (document.body && typeof document.body.appendChild === 'function') document.body.appendChild(music);
  }
  function clearMusicTimer() { if (musicTimer !== undefined) clearTimeout(musicTimer); musicTimer = undefined; gapDueAt = 0; }
  function stopMusic(resetGap = true) {
    musicGeneration++; playPending = null; clearMusicTimer(); if (resetGap) gapRemaining = 0;
    if (!music) return;
    try { music.pause(); } catch (_) {}
    if (resetGap) { try { music.currentTime = 0; } catch (_) {} }
  }
  function musicEnabled() { return !!options.music; }
  function canPlayMusic() { return unlocked && musicEnabled() && !document.hidden && (!context || context.state === 'running'); }
  function startMusic() {
    if (!canPlayMusic() || !music || playPending) return;
    const generation = musicGeneration; let result;
    try { result = music.play(); } catch (_) { return; }
    if (result && typeof result.then === 'function') {
      playPending = result;
      result.then(() => { if (playPending === result) playPending = null; }, () => { if (playPending === result) playPending = null; });
    }
  }
  function scheduleMusic() {
    clearMusicTimer(); if (!canPlayMusic() || !music) return;
    gapRemaining = BGM_GAP_MS; gapDueAt = Date.now() + gapRemaining; const generation = musicGeneration;
    musicTimer = setTimeout(() => { musicTimer = undefined; gapDueAt = 0; gapRemaining = 0; if (generation === musicGeneration) startMusic(); }, gapRemaining);
  }
  function tone(frequency, delay = 0, duration = .12, volume = .4, type = 'sine') {
    if (!context || context.state !== 'running') return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(volume, start + .009);
    gain.gain.exponentialRampToValueAtTime(.001, start + duration);
    oscillator.connect(gain); gain.connect(bus); oscillator.start(start); oscillator.stop(start + duration + .025);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  function play(name) {
    if (!options.sfx || !context) return;
    if (name === 'hover') { if (performance.now() - lastHover < 100) return; lastHover = performance.now(); tone(650, 0, .045, .055); }
    if (name === 'click') { tone(380, 0, .06, .16, 'triangle'); tone(570, .026, .075, .09); }
    if (name === 'reveal') [440, 554.37, 659.25].forEach((f, i) => tone(f, i * .045, .25, .22));
    if (name === 'correct') [523.25, 659.25, 783.99].forEach((f, i) => tone(f, i * .05, .2, .2));
    if (name === 'wrong') { tone(240, 0, .12, .14, 'triangle'); tone(170, .08, .18, .12); }
    if (name === 'finish') [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * .11, .4, .2));
  }
  function syncMusic() {
    ensureMusic();
    if (!musicEnabled()) { stopMusic(true); return; }
    if (document.hidden) { pauseForHidden(); return; }
    if (!music || (context && context.state !== 'running')) { try { music?.pause(); } catch (_) {} return; }
    if (gapDueAt) { gapRemaining = Math.max(0, gapDueAt - Date.now()); return; }
    if (music.paused && music.ended) scheduleMusic(); else if (music.paused) startMusic();
  }
  function pauseForHidden() {
    if (gapDueAt) gapRemaining = Math.max(0, gapDueAt - Date.now());
    if (musicTimer !== undefined) clearTimeout(musicTimer);
    musicTimer = undefined; gapDueAt = 0; musicGeneration++;
    try { music?.pause(); } catch (_) {}
  }
  function configure(v) { const wasMusic = options.music; options = {...options, ...v}; if (wasMusic && !options.music) stopMusic(true); syncMusic(); }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pauseForHidden(); }
    else if (gapRemaining && musicTimer === undefined) { gapDueAt = Date.now() + gapRemaining; const generation = musicGeneration; musicTimer = setTimeout(() => { musicTimer = undefined; gapDueAt = 0; gapRemaining = 0; if (generation === musicGeneration) startMusic(); }, gapRemaining); }
    else syncMusic();
  });
  return {unlock, configure, play};
})();

;
/* Limit new player names by visible characters, including emoji sequences. */
(function (root) {
  'use strict';
  const LIMIT = 12;
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, {granularity:'grapheme'}) : null;
  function normalize(value, trim = false) {
    const text = String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').normalize('NFC');
    const parts = segmenter ? Array.from(segmenter.segment(text), item => item.segment) : Array.from(text);
    // Also bound pathological combining sequences while keeping ordinary names intact.
    let result = '';
    for (const part of parts.slice(0, LIMIT)) {
      if (result.length + part.length > 120) break;
      result += part;
    }
    return trim ? result.trim() : result;
  }
  const api = {LIMIT, normalize};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NeoPlayerNames = api;
})(typeof window === 'object' ? window : globalThis);

;
/* Game duration helpers. A finished legacy game without an end timestamp has no fabricated duration. */
(function(root){
'use strict';
function time(value){const n=typeof value==='number'?value:Date.parse(value);return Number.isFinite(n)?n:null;}
function duration(game,now=Date.now()){
 if(!game||typeof game!=='object')return null;
 const start=time(game.startedAt);if(start===null)return null;
 const end=game.finished?time(game.finishedAt):time(now);
 if(end===null||end<start)return null;
 return Math.max(0,Math.round(end-start));
}
function finish(game,now=new Date()){
 if(!game||typeof game!=='object')throw new TypeError('A game is required');
 if(game.finished)return game;
 const start=time(game.startedAt),requested=now instanceof Date?now.getTime():time(now);
 if(requested===null||!Number.isFinite(requested))throw new TypeError('Invalid finish time');
 if(start!==null){const end=Math.max(start,requested);game.finishedAt=new Date(end).toISOString();game.durationMs=end-start;}
 game.finished=true;
 return game;
}
function validate(game,{strict=false}={}){
 if(!game||typeof game!=='object')return false;
 if(game.finishedAt===undefined&&game.durationMs===undefined)return !strict;
 const start=time(game.startedAt),end=time(game.finishedAt),ms=game.durationMs;
 return game.finished===true&&typeof game.startedAt==='string'&&typeof game.finishedAt==='string'&&start!==null&&end!==null&&end>=start&&Number.isSafeInteger(ms)&&ms>=0&&ms===end-start;
}
function format(ms,language='en'){
 if(!Number.isFinite(ms)||ms<0)return '';
 const sec=Math.floor(ms/1000),h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;
 if(language==='zh-Hans')return h?h+'小时 '+m+'分 '+s+'秒':m?m+'分 '+s+'秒':s+'秒';
 if(language==='zh-Hant')return h?h+'小時 '+m+'分 '+s+'秒':m?m+'分 '+s+'秒':s+'秒';
 return h?h+'h '+m+'m '+s+'s':m?m+'m '+s+'s':s+'s';
}
const api={time,duration,finish,validate,format};root.NeoGameClock=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);

;
/* Pure question-tag grouping and filtering for round setup. */
(function (root) {
  'use strict';

  const LANGUAGES = Object.freeze(['en', 'zh-Hans', 'zh-Hant']);
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const clean = value => text(value) ? value.trim() : '';
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  // FNV-1a keeps an ID short while remaining stable across browsers and
  // independent of question order. Labels stay in the group object for UI.
  function hash(value, seed = 2166136261) {
    let result = seed >>> 0;
    for (let i = 0; i < value.length; i++) {
      result ^= value.charCodeAt(i);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16).padStart(8, '0');
  }

  function categoryFor(pack, question) {
    return (Array.isArray(pack?.categories) ? pack.categories : [])
      .find(item => item && item.id === question?.categoryId) || null;
  }

  function rawTag(question) {
    if (text(question?.tag)) return question.tag.trim();
    if (object(question?.tag)) return question.tag;
    if (Array.isArray(question?.tags)) {
      const first = question.tags.find(text);
      if (first) return first.trim();
    }
    return '';
  }

  function firstStringTag(question) {
    return Array.isArray(question?.tags)
      ? clean(question.tags.find(text))
      : '';
  }

  function labelsFor(pack, question) {
    const category = categoryFor(pack, question);
    const categoryName = category?.name;
    const tag = rawTag(question);
    const labels = {};
    const stringTag = typeof tag === 'string' ? clean(tag) : '';
    const arrayTag = firstStringTag(question);
    const fallback = stringTag || arrayTag || clean(question?.categoryId) || 'Uncategorised';
    for (const language of LANGUAGES) {
      const tagValue = stringTag || (object(tag) ? clean(tag[language]) : '') || arrayTag;
      const categoryValue = object(categoryName) ? clean(categoryName[language]) : '';
      labels[language] = tagValue || categoryValue || fallback;
    }
    return labels;
  }

  function groupId(labels) {
    const signature = LANGUAGES.map(language => labels[language]).join('\u001f');
    return `tag-${hash(signature)}-${hash(signature, 2654435761)}`;
  }

  const groupCache = new WeakMap();
  function listGroups(pack) {
    if (pack && typeof pack === 'object') {
      const cached = groupCache.get(pack);
      if (cached) return cached;
    }
    const groups = new Map();
    const questions = Array.isArray(pack?.questions) ? pack.questions : [];
    questions.forEach(question => {
      const labels = labelsFor(pack, question);
      const id = groupId(labels);
      let group = groups.get(id);
      if (!group) {
        group = { id, labels: Object.freeze({ ...labels }), count: 0, questionIds: [] };
        groups.set(id, group);
      }
      group.count += 1;
      if (question?.id !== undefined && question?.id !== null) group.questionIds.push(String(question.id));
    });
    const result = Object.freeze(Array.from(groups.values()).map(group => Object.freeze({
      ...group,
      questionIds: Object.freeze(group.questionIds.slice())
    })));
    if (pack && typeof pack === 'object') groupCache.set(pack, result);
    return result;
  }

  function normalizeSelection(pack, selection) {
    const all = listGroups(pack).map(group => group.id);
    // Missing state means a new setup: every tag is enabled. [] deliberately
    // means no tags, so an accidental truthiness check cannot select all.
    if (selection === undefined || selection === null) return all;
    const candidate = Array.isArray(selection)
      ? selection
      : (Array.isArray(selection.selectedIds) ? selection.selectedIds : []);
    const known = new Set(all);
    return Array.from(new Set(candidate.map(String))).filter(id => known.has(id));
  }

  function selectedGroupIds(pack, selection) {
    return new Set(normalizeSelection(pack, selection));
  }

  function groupForQuestion(pack, question) {
    const labels = labelsFor(pack, question);
    return Object.freeze({ id: groupId(labels), labels });
  }

  function matches(pack, question, selection) {
    return selectedGroupIds(pack, selection).has(groupForQuestion(pack, question).id);
  }

  function filterQuestions(pack, selection, questions) {
    const source = Array.isArray(questions) ? questions : (Array.isArray(pack?.questions) ? pack.questions : []);
    const selected = selectedGroupIds(pack, selection);
    return source.filter(question => selected.has(groupForQuestion(pack, question).id));
  }

  const api = Object.freeze({
    LANGUAGES,
    labelsFor,
    listGroups,
    normalizeSelection,
    selectedGroupIds,
    groupForQuestion,
    matches,
    filterQuestions
  });
  root.NeoCategoryFilter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);

;
/* Compact, self-contained finished-game snapshots that travel with saves. */
(function(root){
'use strict';
const SCHEMA_VERSION=1, MAX_JSON=4*1024*1024;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const clone=v=>JSON.parse(JSON.stringify(v));
const core=()=>root.NeoCore||(typeof module!=='undefined'&&module.exports?require('./core.js'):null);
const PlayerNames=(typeof module!=='undefined'&&module.exports)?require('./player-names.js'):root.NeoPlayerNames;
const Clock=(typeof module!=='undefined'&&module.exports)?require('./game-clock.js'):root.NeoGameClock;
function historyError(message){const err=new Error(message);err.code='saveResultsHistoryInvalid';err.params=Object.freeze({});return err;}
function validPlayerName(name,rulesVersion){
  if(typeof name!=='string'||!name.length) return false;
  if(rulesVersion>=4) return PlayerNames ? PlayerNames.normalize(name,true)===name : name.trim()===name&&name.length<=120;
  return name.length<=40;
}
function cleanHistory(list){return list.map(raw=>{const h=clone(raw);if(h&&h.voided){if(h.answerer===undefined)h.answerer=null;if(h.selected===undefined)h.selected=null;}return h;});}
function expectedPoints(pack,q){
  if(q.type==='choice')return q.level*100;
  return pack?.schemaVersion>=3?(q.level-4)*200:q.level*100;
}
function validTimes(game){
  if(game.startedAt!==undefined&&(typeof game.startedAt!=='string'||!Number.isFinite(Date.parse(game.startedAt))))return false;
  if(game.finishedAt!==undefined&&(typeof game.finishedAt!=='string'||!Number.isFinite(Date.parse(game.finishedAt))))return false;
  if(game.durationMs!==undefined&&(!Number.isFinite(game.durationMs)||game.durationMs<0))return false;
  if(Clock&&(game.finishedAt!==undefined||game.durationMs!==undefined)&&!Clock.validate(game,{strict:true}))return false;
  return true;
}
function snapshot(game,recordedAt=new Date().toISOString()) {
  const C=core();
  if(!isObject(game)||game.finished!==true||typeof game.id!=='string'||!game.id||!isObject(game.pack)||!Array.isArray(game.players)||game.players.length<2||game.players.length>8||!Array.isArray(game.history))throw historyError('A finished game is required');
  const variants=[];
  for(const slot of (game.board||[])){
    const base=game.pack.questions?.find(q=>q.id===slot.qid);if(!base)throw historyError('Finished game has an unknown question');
    const q=C.variant(base,slot.level);
    variants.push({id:q.id,level:q.level,type:q.type,points:q.points,...(q.type==='choice'?{options:[...q.options],correctOptionId:q.correctOptionId}:{})});
  }
  if(!validTimes(game))throw historyError('Invalid game duration');
  const compact={rulesVersion:game.rulesVersion,id:game.id,startedAt:game.startedAt,finishedAt:game.finishedAt,durationMs:game.durationMs,finished:true,mode:game.mode,players:[...game.players],questionTarget:game.questionTarget||game.board?.length||0,history:cleanHistory(game.history),current:null,pack:{id:game.pack.id,version:game.pack.version,schemaVersion:game.pack.schemaVersion,title:clone(game.pack.title)},questionVariants:variants};
  const out={schemaVersion:SCHEMA_VERSION,id:game.id,recordedAt,game:compact};
  if(JSON.stringify(out).length>MAX_JSON)throw historyError('Results history record is too large');
  validateRecord(out);return out;
}
function validateRecord(raw){
  if(!isObject(raw)||raw.schemaVersion!==SCHEMA_VERSION||typeof raw.id!=='string'||raw.id.length<1||raw.id.length>160||typeof raw.recordedAt!=='string'||!Number.isFinite(Date.parse(raw.recordedAt))||!isObject(raw.game)||raw.game.finished!==true||typeof raw.game.id!=='string'||raw.game.id!==raw.id||!['together','buzz','turns'].includes(raw.game.mode)||!isObject(raw.game.pack)||typeof raw.game.pack.id!=='string'||typeof raw.game.pack.version!=='string'||!isObject(raw.game.pack.title)||['en','zh-Hans','zh-Hant'].some(l=>typeof raw.game.pack.title[l]!=='string'||!raw.game.pack.title[l].trim())||!Number.isInteger(raw.game.questionTarget)||raw.game.questionTarget<1||!Array.isArray(raw.game.players)||raw.game.players.length<2||raw.game.players.length>8||!Array.isArray(raw.game.questionVariants)||!Array.isArray(raw.game.history)||raw.game.current!==null||JSON.stringify(raw).length>MAX_JSON)throw historyError('Invalid results history');
  if(!validTimes(raw.game))throw historyError('Invalid results history');
  const C=core(), variants=new Map();
  if(!C.SUPPORTED_RULES_VERSIONS.includes(raw.game.rulesVersion)) throw historyError('Invalid results history');
  if(raw.game.players.some(n=>!validPlayerName(n,raw.game.rulesVersion))) throw historyError('Invalid results history');
  for(const q of raw.game.questionVariants){
    if(!isObject(q)||typeof q.id!=='string'||!Number.isInteger(q.level)||q.level<1||q.level>8||!['choice','open'].includes(q.type)||q.points!==expectedPoints(raw.game.pack,q)||variants.has(q.id))throw historyError('Invalid results history');
    if(q.type==='choice'&&(!Array.isArray(q.options)||!q.options.length||typeof q.correctOptionId!=='string'||!q.options.includes(q.correctOptionId)))throw historyError('Invalid results history');
    variants.set(q.id,q);
  }
  const ids=new Set();
  for(const h of raw.game.history){
    if(!isObject(h)||typeof h.qid!=='string'||ids.has(h.qid)||!variants.has(h.qid)||typeof h.level!=='number'||typeof h.type!=='string'||typeof h.points!=='number'||typeof h.voided!=='boolean'||!Array.isArray(h.deltas)||h.deltas.length!==raw.game.players.length||!h.deltas.every(Number.isFinite)||!Array.isArray(h.judgments)||h.judgments.length!==raw.game.players.length||h.judgments.some(v=>v!==null&&typeof v!=='boolean'))throw historyError('Invalid results history');
    const q=variants.get(h.qid);if(h.level!==q.level||h.type!==q.type||h.points!==q.points)throw historyError('Invalid results history');
    if(h.answerer!==null&&!Number.isInteger(h.answerer))throw historyError('Invalid results history');
    if(h.selected!==null&&typeof h.selected!=='string')throw historyError('Invalid results history');
    if(q.type==='choice'&&h.selected!==null&&!q.options.includes(h.selected))throw historyError('Invalid results history');
    if(q.type==='open'&&h.selected!==null)throw historyError('Invalid results history');
    if(!h.voided){let expected;try{expected=C.scoreQuestion(raw.game.mode,q,h.judgments,h.answerer,raw.game.players.length,raw.game.rulesVersion);}catch(_){throw historyError('Invalid results history');}if(expected.some((v,i)=>v!==h.deltas[i]))throw historyError('Invalid results history');}
    ids.add(h.qid);
  }
  return raw;
}
function normalize(value,{strict=true}={}) {if(value===undefined||value===null)return [];if(!Array.isArray(value))throw historyError('Invalid results history');const ids=new Set();return value.map(item=>{let copy;try{copy=clone(item);}catch(_){throw historyError('Invalid results history');}if(ids.has(copy?.id))throw historyError('Invalid results history');ids.add(copy?.id);if(copy?.game?.history)copy.game.history=cleanHistory(copy.game.history);validateRecord(copy);return copy;});}
function upsert(list,game,recordedAt=new Date().toISOString()) {const out=normalize(list),item=snapshot(game,recordedAt),index=out.findIndex(x=>x.id===item.id);if(index>=0)out[index]=item;else out.push(item);return out;}
function find(list,id){return normalize(list).find(x=>x.id===id)||null;}
const api={SCHEMA_VERSION,MAX_JSON,snapshot,normalize,upsert,find,validateRecord};root.NeoResultsHistory=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);

;
/* Portable and versioned saves. No filesystem permissions or server APIs. */
(function (root) {
'use strict';
const SAVE_VERSION=2, READER_VERSION=6, APP_VERSION='5.9.0';
const ResultsHistory=(typeof module!=='undefined'&&module.exports)?require('./results-history.js'):root.NeoResultsHistory;
const PlayerNames=(typeof module!=='undefined'&&module.exports)?require('./player-names.js'):root.NeoPlayerNames;
const Clock=(typeof module!=='undefined'&&module.exports)?require('./game-clock.js'):root.NeoGameClock;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const HIDDEN_ID=/^[A-Za-z0-9._-]{1,120}$/;
const HIDDEN_LANGUAGES=['en','zh-Hans','zh-Hant'];
function archiveError(code,message,params={}) {
 const err=new Error(message);err.code=code;err.params=Object.freeze({...params});return err;
}
function ordered(v) {
  if (Array.isArray(v)) return '['+v.map(ordered).join(',')+']';
  if (isObject(v)) return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+ordered(v[k])).join(',')+'}';
  return JSON.stringify(v);
}
/* Fast stable 64-bit (two distinct 32-bit FNV passes), not a security signature. */
function fingerprint(pack) {
  const s=ordered(pack);let a=2166136261,b=0x811c9dc7;
  for(let i=0;i<s.length;i++) {const n=s.charCodeAt(i);a=Math.imul((a^n),16777619);b=Math.imul((b^n),2246822519);}
  return [a,b].map(n=>(n>>>0).toString(16).padStart(8,'0')).join('')+'-'+s.length;
}
function validPlayerName(name,rulesVersion) {
 if(typeof name!=='string'||!name.length) return false;
 if(rulesVersion>=4) return PlayerNames ? PlayerNames.normalize(name,true)===name : name.trim()===name&&name.length<=120;
 return name.length<=40;
}
function exportSave({game,lang,prefs,hidden,activePack,setup,resultsHistory=[]}) {
 if(!game||!isObject(game.pack)) throw archiveError('saveIncomplete','No current game');
 const {pack,...round}=game;
 // Preserve legacy V1 rounds whose frozen board predates the V2 12-question step.
 const legacyRound=Number.isInteger(round.questionTarget)&&round.questionTarget>0&&round.questionTarget===round.board?.length&&round.questionTarget%12!==0;
 const history=ResultsHistory?ResultsHistory.normalize(resultsHistory,{strict:true}):[];
 const historyNeedsV6=history.some(item=>item?.game?.rulesVersion>=4);
 const minReaderVersion=Math.max(pack.schemaVersion>=3?5:(history.length?4:(legacyRound?1:(round.rulesVersion>=3?3:2))),round.rulesVersion>=4||historyNeedsV6?6:0);
 return {kind:'partyquiz-save',saveSchemaVersion:legacyRound?1:SAVE_VERSION,minReaderVersion,writerAppVersion:APP_VERSION,exportedAt:new Date().toISOString(),questionPack:{id:pack.id,version:pack.version,schemaVersion:pack.schemaVersion,fingerprint:fingerprint(pack)},state:{lang,prefs,hidden,activePack,setup,game:round,resultsHistory:history}};
}
function normalizeHidden(value, strict=false) {
 const fail=()=>{throw archiveError(strict?'saveHiddenRecordsInvalid':'invalidHidden','Invalid hidden question records');};
 if(!isObject(value)) {if(strict)fail();return {};}
 const out=Object.create(null), now=()=>new Date().toISOString();
 const dictionary=(raw,name)=>{
   if(raw===undefined)return undefined;
   if(!isObject(raw)) {if(strict)fail();return undefined;}
   const clean=Object.create(null);
   for(const [language,text] of Object.entries(raw)) {
     if(!HIDDEN_LANGUAGES.includes(language)||typeof text!=='string'||text.length>12000) {if(strict)fail();continue;}
     clean[language]=text;
   }
   return clean;
 };
 for(const [key,raw] of Object.entries(value)) {
   if(!isObject(raw)||typeof raw.packId!=='string'||typeof raw.questionId!=='string'||!HIDDEN_ID.test(raw.packId)||!HIDDEN_ID.test(raw.questionId)||key!==`${raw.packId}::${raw.questionId}`) {if(strict)fail();continue;}
   const record={packId:raw.packId,questionId:raw.questionId};
   for(const name of ['hiddenAt','deletedAt']) {
     if(raw[name]===undefined)continue;
     if(typeof raw[name]!=='string'||raw[name].length>80) {if(strict)fail();continue;}
     record[name]=raw[name];
   }
   record.hiddenAt=record.hiddenAt||record.deletedAt||now();
   const packTitle=dictionary(raw.packTitle,'packTitle'),prompts=dictionary(raw.prompts,'prompts');
   if(packTitle!==undefined)record.packTitle=packTitle;
   if(prompts!==undefined)record.prompts=prompts;
   out[key]=record;
 }
 return out;
}
function inspectSave(doc,packs,core) {
 if(!isObject(doc)||doc.kind!=='partyquiz-save') throw archiveError('saveNotRecognized','Not a PARTY QUIZ save JSON');
 if(!Number.isInteger(doc.saveSchemaVersion)||doc.saveSchemaVersion<1) throw archiveError('saveFormatInvalid','Invalid save format');
 const minReader=doc.minReaderVersion===undefined?1:doc.minReaderVersion;
 if(!Number.isInteger(minReader)||minReader<1) throw archiveError('saveFormatInvalid','Invalid save format');
 if(doc.saveSchemaVersion>SAVE_VERSION||minReader>READER_VERSION) throw archiveError('saveRequiresUpdate','Save requires a newer game version');
 // Future schema versions must explicitly migrate older saves here.
 if(![1,2].includes(doc.saveSchemaVersion)) throw archiveError('saveRequiresUpdate','No compatible save migrator');
 if(!isObject(doc.questionPack)||!isObject(doc.state)||!isObject(doc.state.game))throw archiveError('saveIncomplete','Incomplete save');
 const identity=doc.questionPack;
 if(!Object.prototype.hasOwnProperty.call(identity,'id')||!Object.prototype.hasOwnProperty.call(identity,'version')||!Object.prototype.hasOwnProperty.call(identity,'schemaVersion')||!Object.prototype.hasOwnProperty.call(identity,'fingerprint')||identity.id==null||identity.version==null||identity.schemaVersion==null||identity.fingerprint==null)throw archiveError('saveIncomplete','Incomplete save');
 if(typeof identity.id!=='string'||!identity.id.trim()||typeof identity.version!=='string'||!identity.version.trim()||!Number.isInteger(identity.schemaVersion)||identity.schemaVersion<1||typeof identity.fingerprint!=='string'||!/^[0-9a-f]{16}-\d+$/.test(identity.fingerprint))throw archiveError('saveFormatInvalid','Invalid save format');
 const pack=packs.find(p=>p.id===identity.id);
 if(!pack) throw archiveError('savePackMissing','Required question pack is not installed: '+identity.id,{packId:identity.id});
 if(pack.version!==identity.version)throw archiveError('savePackVersionMismatch','Question pack version does not match. Save expects '+identity.version+', installed '+String(pack.version),{packId:identity.id,expectedVersion:identity.version,installedVersion:pack.version});
 if(pack.schemaVersion!==identity.schemaVersion)throw archiveError('savePackSchemaMismatch','Question pack schema does not match',{packId:identity.id});
 if(fingerprint(pack)!==identity.fingerprint)throw archiveError('savePackContentMismatch','Question pack content differs from this save, even though the version string matches',{packId:identity.id});
 const g=JSON.parse(JSON.stringify(doc.state.game));g.pack=JSON.parse(JSON.stringify(pack));
 if(Clock&&!Clock.validate(g))throw archiveError('saveRoundStateInvalid','Invalid game timestamps');
 // Migrate v1 saves that used the whole allocated board without a round target.
 if(doc.saveSchemaVersion===1 && g.questionTarget===undefined)g.questionTarget=g.board?.length;
 if(doc.saveSchemaVersion===2 && (!Number.isInteger(g.questionTarget)||g.questionTarget<12||g.questionTarget%12!==0||g.questionTarget!==g.board?.length))throw archiveError('saveRoundCountInvalid','Invalid round question count');
 if(!core.SUPPORTED_RULES_VERSIONS.includes(g.rulesVersion)||!core.MODES.includes(g.mode)||!Array.isArray(g.players)||g.players.length<2||g.players.length>8||g.players.some(n=>!validPlayerName(n,g.rulesVersion))||!Array.isArray(g.history)||typeof g.finished!=='boolean'||(g.current!==null&&!isObject(g.current))||!core.validBoard(g))throw archiveError('saveRoundStateInvalid','Invalid round state');
 const variants=new Map(g.board.map(s=>[s.qid,core.variant(g.pack.questions.find(q=>q.id===s.qid),s.level)]));
 const historyIds=new Set(),committedHistoryIds=new Set();
 for(const h of g.history){
   if(!isObject(h)) throw archiveError('saveScoringHistoryInvalid','Invalid scoring history');
   const q=variants.get(h?.qid);
   if(!q||historyIds.has(h.qid)||h.level!==q.level||h.type!==q.type||h.points!==q.points||typeof h.voided!=='boolean'||h.key!==core.key(pack.id,q.id)||!Array.isArray(h.deltas)||h.deltas.length!==g.players.length||!h.deltas.every(Number.isFinite)||!g.seen.includes(q.id))throw archiveError('saveScoringHistoryInvalid','Invalid scoring history');
   const collective=core.isCollective(g.mode,q), legacyVoidedAnswerer=(h.voided&&h.answerer===undefined), legacyVoidedSelection=(h.voided&&h.selected===undefined);
   const answererValid=legacyVoidedAnswerer||(h.answerer===null||(Number.isInteger(h.answerer)&&h.answerer>=0&&h.answerer<g.players.length));
   const selectedValid=legacyVoidedSelection||(h.selected===null||(q.type==='choice'&&typeof h.selected==='string'&&q.options.includes(h.selected)));
   if(!answererValid||(!legacyVoidedAnswerer&&!collective&&h.answerer===null)||(!legacyVoidedAnswerer&&collective&&h.answerer!==null)||!selectedValid||(!legacyVoidedSelection&&q.type==='open'&&h.selected!==null))throw archiveError('saveScoringHistoryInvalid','Invalid scoring history');
   if(g.rulesVersion>=3&&g.mode==='turns'&&!h.voided&&h.answerer!==committedHistoryIds.size%g.players.length)throw archiveError('saveTurnOrderInvalid','Invalid turn order');
   historyIds.add(h.qid);
   if(!Array.isArray(h.judgments)||h.judgments.length!==g.players.length||h.judgments.some(v=>v!==null&&typeof v!=='boolean'))throw archiveError('saveJudgmentsInvalid','Invalid adjudication record');
   if(!h.voided){
      committedHistoryIds.add(h.qid);
      let expected;
      try{expected=core.scoreQuestion(g.mode,q,h.judgments,h.answerer,g.players.length,g.rulesVersion)}catch(_){throw archiveError('saveScoreIncomplete','Incomplete score record');}
      if(expected.some((x,i)=>x!==h.deltas[i]))throw archiveError('saveScoreMismatch','Score verification failed');
   }
 }
 if(g.current){
   const c=g.current,q=variants.get(c.qid);
   const collective=q&&core.isCollective(g.mode,q),choice=q?.type==='choice';
   const answererValid=c.answerer===null||(Number.isInteger(c.answerer)&&c.answerer>=0&&c.answerer<g.players.length);
   const selectedValid=c.selected===null||(choice&&typeof c.selected==='string'&&q.options.includes(c.selected));
   const turnAnswerer=g.rulesVersion>=3&&g.mode==='turns'&&c.phase!=='scored' ? core.currentPlayer(g) : null;
   if(!q||!g.seen.includes(c.qid)||c.level!==q.level||!['answer','judge','scored'].includes(c.phase)||!Array.isArray(c.judgments)||c.judgments.length!==g.players.length||c.judgments.some(v=>v!==null&&typeof v!=='boolean')||!answererValid||!selectedValid||(!collective&&c.phase!=='answer'&&c.answerer===null)||(collective&&c.answerer!==null)||(collective&&c.selected!==null)||(q.type==='open'&&c.selected!==null)||(!collective&&choice&&c.phase!=='answer'&&c.selected===null)||(turnAnswerer!==null&&c.answerer!==turnAnswerer))throw archiveError('saveActiveQuestionInvalid','Invalid active question');
   if(c.phase==='scored'){
     if(!committedHistoryIds.has(c.qid))throw archiveError('saveCommittedScoreMissing','Missing committed score');
     const committed=g.history.find(h=>h.qid===c.qid&&!h.voided);
     if(!committed||committed.judgments.some((v,i)=>v!==c.judgments[i]))throw archiveError('saveActiveScoreMismatch','Active score does not match history');
   }
 }
 let hidden;try{hidden=normalizeHidden(doc.state.hidden,true);}catch(err){if(err.code==='saveHiddenRecordsInvalid')throw err;throw archiveError('saveHiddenRecordsInvalid',err.message);}
 const resultsHistory=ResultsHistory?ResultsHistory.normalize(doc.state.resultsHistory,{strict:true}):[];
 return {game:g,lang:core.LANGUAGES.includes(doc.state.lang)?doc.state.lang:'zh-Hans',prefs:isObject(doc.state.prefs)?doc.state.prefs:{},hidden,activePack:pack.id,setup:isObject(doc.state.setup)?doc.state.setup:null,resultsHistory};
}
const api={SAVE_VERSION,READER_VERSION,APP_VERSION,fingerprint,exportSave,normalizeHidden,inspectSave};
root.NeoArchive=api;
if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window==='undefined'?globalThis:window);

;
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

;
/* Explicit-refresh keyboard controller. Bindings are single, physical US-keyboard keys. */
(function (root) {
  'use strict';

  // This row is deliberately physical QWERTY order and stays stable in every view.
  const HEADER_KEYS = Object.freeze({
    home: 'KeyQ', 'lang:en': 'KeyW', 'lang:zh-Hans': 'KeyE', 'lang:zh-Hant': 'KeyR',
    library: 'KeyT', rules: 'KeyY', settings: 'KeyU', fullscreen: 'KeyO'
  });
  const RESERVED = new Set(Object.values(HEADER_KEYS));
  const RESERVED_CODES = new Set([
    ...RESERVED, 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
    'Enter', 'Escape', 'Tab', 'Space'
  ]);
  const US = Object.freeze([
    ...Array.from({ length: 10 }, (_, i) => `Digit${(i + 1) % 10}`),
    ...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`),
    'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon',
    'Quote', 'Comma', 'Period', 'Slash', 'Backquote'
  ]);
  const PUNCT = Object.freeze({
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`'
  });
  const PRIMARY = new Set(['reveal', 'commit', 'next', 'start', 'modal-confirm', 'confirm', 'categories-done']);
  const ESCAPE = new Set(['close', 'close-modal', 'cancel', 'back', 'question-back', 'library-back', 'home']);
  const DESTRUCTIVE = new Set(['finish', 'reset', 'delete', 'remove', 'clear', 'restore']);
  const BOARD_CARD_ACTIONS = new Set(['pick', 'board-card', 'question-card']);
  const state = {
    listener: null, last: null, byKey: new Map(), sticky: new Map(),
    tabNavigation: false, pressed: new Set()
  };

  const action = el => el?.dataset?.action || '';
  const keyId = code => code;

  function keyLabel(code) {
    if (code === 'Enter') return 'Enter';
    if (code === 'Escape') return 'Esc';
    if (code === 'Space') return 'Space';
    if (code === 'ArrowLeft') return '←';
    if (code === 'ArrowRight') return '→';
    if (code === 'ArrowUp') return '↑';
    if (code === 'ArrowDown') return '↓';
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Key')) return code.slice(3);
    return PUNCT[code] || code;
  }

  function preferred(el) {
    const value = el?.dataset?.keyPreferred;
    if (!value) return null;
    const parts = String(value).split('+');
    // Chords are unsupported. Legacy Shift+ values are therefore ignored.
    if (parts.length !== 1 || !parts[0] || RESERVED_CODES.has(parts[0]) || /^F(?:[1-9]|1[0-2])$/.test(parts[0])) return null;
    return { code: parts[0], shift: false };
  }

  function semantic(el, occurrence = 0) {
    const d = el.dataset || {}, a = action(el);
    let id;
    if (/^(answerer|judge)$/.test(a)) id = `${d.player || ''}:${d.result || ''}`;
    else id = d.qid || d.option || d.lang || d.tab || d.setting || d.mode || d.pack || d.step || '';
    const base = `${a}:${id}:${d.level || ''}:${d.delta || ''}`;
    return `${base}${occurrence ? `#${occurrence}` : ''}`;
  }

  function clipFor(el, scope) {
    const win = el.ownerDocument?.defaultView;
    const clip = { left: 0, top: 0, right: win?.innerWidth || 1e9, bottom: win?.innerHeight || 1e9 };
    const scopeRect = scope?.getBoundingClientRect?.();
    if (scopeRect) {
      clip.left = Math.max(clip.left, scopeRect.left); clip.top = Math.max(clip.top, scopeRect.top);
      clip.right = Math.min(clip.right, scopeRect.right); clip.bottom = Math.min(clip.bottom, scopeRect.bottom);
    }
    let parent = el.parentElement;
    while (parent && parent !== scope) {
      const css = win?.getComputedStyle?.(parent);
      const overflow = `${css?.overflow || ''} ${css?.overflowX || ''} ${css?.overflowY || ''}`;
      if (/auto|scroll|hidden|clip/.test(overflow)) {
        const rect = parent.getBoundingClientRect?.();
        if (rect) {
          clip.left = Math.max(clip.left, rect.left); clip.top = Math.max(clip.top, rect.top);
          clip.right = Math.min(clip.right, rect.right); clip.bottom = Math.min(clip.bottom, rect.bottom);
        }
      }
      parent = parent.parentElement;
    }
    return clip;
  }

  function visible(el, scope) {
    if (!el || el.hidden || el.closest?.('[hidden],[inert],[aria-hidden="true"]')) return false;
    const css = el.ownerDocument?.defaultView?.getComputedStyle?.(el);
    if (css && (css.display === 'none' || css.visibility === 'hidden')) return false;
    const rect = el.getBoundingClientRect?.(), clip = clipFor(el, scope);
    return !!rect && rect.width > 0 && rect.height > 0 && rect.right > clip.left && rect.left < clip.right && rect.bottom > clip.top && rect.top < clip.bottom;
  }

  function candidates(scope) {
    return Array.from(scope?.querySelectorAll?.('button,a[href],[role="button"]') || [])
      .filter(el => visible(el, scope));
  }

  function addHint(el, label, code) {
    const old = el.querySelector?.(':scope > .key-hint[data-key-hint="true"]');
    if (old) old.remove();
    const hint = el.ownerDocument.createElement('kbd');
    hint.className = 'key-hint'; hint.dataset.keyHint = 'true'; hint.textContent = label;
    hint.setAttribute('aria-hidden', 'true'); el.appendChild(hint); el.dataset.keyBound = 'true';
    const ariaKey = code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : (PUNCT[code] || code);
    el.setAttribute('aria-keyshortcuts', ariaKey);
  }

  function clearBindings(doc) {
    for (const el of Array.from(doc.querySelectorAll?.('button,a[href],[role="button"]') || [])) {
      const hint = el.querySelector?.(':scope > .key-hint[data-key-hint="true"]');
      if (hint) hint.remove();
      if (el.dataset?.keyBound === 'true') { el.removeAttribute('aria-keyshortcuts'); delete el.dataset.keyBound; }
    }
  }

  function freeBinding(used) {
    for (const code of US) {
      if (RESERVED_CODES.has(code) || /^F(?:[1-9]|1[0-2])$/.test(code)) continue;
      if (!used.has(keyId(code))) return { code, shift: false };
    }
    return null;
  }

  function descriptorPlan(descriptors, context = 'default', policy = {}) {
    // Some controls are revealed only after the first action (for example the
    // answer choices). Reserve their key space from the first refresh so a
    // newly visible control can never steal a key from an older control.
    const reserved = new Set(Array.isArray(policy?.reservedCodes) || policy?.reservedCodes instanceof Set
      ? policy.reservedCodes : []);
    const used = new Set([...RESERVED_CODES, ...reserved]), claimed = new Set(), result = [], unassigned = [];
    const sticky = state.sticky.get(context) || new Map(); state.sticky.set(context, sticky);
    const descriptorsWithIds = descriptors.map((d, i) => ({ ...d, _order: i, _semantic: d.semantic || semantic(d.el || d) }));
    // Preclaim bindings which already existed on this screen. This is the key
    // stability rule: later refreshes may allocate only from keys that were
    // not already in use by the same context.
    const preclaimed = new Map();
    for (const d of descriptorsWithIds) {
      const old = sticky.get(d._semantic);
      const binding = d.key || (d.fixed ? null : preferred(d.el || d)) || old || null;
      if (!binding || binding.shift || !binding.code || RESERVED_CODES.has(binding.code) || /^F(?:[1-9]|1[0-2])$/.test(binding.code)) continue;
      if (!preclaimed.has(binding.code)) {
        preclaimed.set(binding.code, d._semantic);
        used.add(binding.code);
      }
    }
    const priority = d => {
      const a = action(d.el || d);
      if (a === 'option') return 0;
      if (/^(answerer|judge)$/.test(a)) return 1;
      return (d.key || preferred(d.el || d)) ? 2 : 3;
    };
    const ordered = descriptorsWithIds.sort((a, b) => priority(a) - priority(b) || a._order - b._order);
    for (const d of ordered) {
      const el = d.el || d, id = d._semantic, old = sticky.get(id);
      let binding = d.key || (d.fixed ? null : preferred(el)) || old || null;
      if (d.fixed && !binding) { unassigned.push({ ...d, semantic: id }); continue; }
      const explicitFlowKey = binding && (binding.code === 'Enter' || binding.code === 'Escape');
      const isChoice = action(el) === 'option';
      const isExisting = old && binding.code === old.code && !binding.shift;
      const isPreclaimedBySelf = preclaimed.get(binding?.code) === id;
      // Reserved optional slots are available to their intended controls (the
      // six answer digits), while generic controls can never consume them.
      // A screen may reserve a key for a named control that appears later in
      // the flow (the question tools keep 7/8 stable for Google search and
      // hiding). An explicit preferred key is that control's claim, so let it
      // through while still keeping the reserved key out of the generic pool.
      const explicitPreferred = !d.key && !!preferred(el);
      const blockedByReservation = !isChoice && reserved.has(binding?.code) && !isExisting && !explicitPreferred;
      const reservedChoiceSlot = isChoice && reserved.has(binding?.code) && !preclaimed.has(binding?.code);
      if (binding && !d.fixed && (binding.shift || (explicitFlowKey ? claimed.has(binding.code) : RESERVED_CODES.has(binding.code)) || /^F(?:[1-9]|1[0-2])$/.test(binding.code) || (!explicitFlowKey && used.has(keyId(binding.code)) && !isPreclaimedBySelf && !reservedChoiceSlot) || blockedByReservation)) binding = null;
      if (!binding) binding = freeBinding(used);
      if (!binding) { unassigned.push({ ...d, semantic: id }); continue; }
      used.add(keyId(binding.code));
      claimed.add(binding.code);
      const assignment = { ...d, ...binding, label: keyLabel(binding.code), semantic: id };
      result.push(assignment); sticky.set(id, { code: binding.code, shift: false, label: assignment.label });
    }
    return { assignments: result, unassigned };
  }

  function install(doc) {
    if (state.listener || !doc) return;
    const markKeyboard = () => {
      const html = doc.documentElement;
      if (html?.dataset) html.dataset.input = 'keyboard';
    };
    const down = event => {
      if (event.code === 'Tab') {
        markKeyboard(); state.tabNavigation = true;
        return;
      }
      const target = event.target;
      const isText = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.isComposing || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      if (isText) {
        if (event.code === 'Escape' && typeof state.last?.optsContext?.onEscapeEditing === 'function') {
          state.last.optsContext.onEscapeEditing(); event.preventDefault?.(); event.stopPropagation?.();
        }
        return;
      }
      const boardKey = !state.last?.dialog && typeof state.last?.optsContext?.onBoardKey === 'function' &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(event.code);
      const nativeActivation = ['Enter', 'Space'].includes(event.code) &&
        target?.matches?.('button,a[href],[role="button"]');
      const tracked = state.byKey.has(event.code) || boardKey || nativeActivation || event.code === 'Space';
      // A physical key produces one action until its keyup. Browsers normally
      // expose repeats through event.repeat, but a fast refresh can otherwise
      // deliver a second non-repeat keydown against the new screen.
      if (tracked && state.pressed.has(event.code)) {
        event.preventDefault?.(); event.stopPropagation?.(); return;
      }
      if (tracked) state.pressed.add(event.code);
      if (event.repeat) {
        if (tracked || /^Arrow/.test(event.code)) {
          event.preventDefault?.(); event.stopPropagation?.();
        }
        return;
      }
      if (state.last?.busy?.()) {
        if (tracked || /^Arrow/.test(event.code)) {
          event.preventDefault?.(); event.stopPropagation?.();
        }
        return;
      }
      // Keep native keyboard access for a focused control, but route it
      // through one explicit click so the browser cannot add a second click
      // on keyup. This also makes Tab followed by Enter deterministic after a
      // view refresh.
      if (nativeActivation && event.code === 'Space') {
        markKeyboard(); event.preventDefault?.(); event.stopPropagation?.();
        if (!target.disabled) target.click?.();
        return;
      }
      if (boardKey) {
        if (state.last.optsContext.onBoardKey(event) === true) {
          markKeyboard();
          state.tabNavigation = false;
          event.preventDefault?.(); event.stopPropagation?.(); return;
        }
      }
      const mapped = state.byKey.get(event.code);
      if (event.code === 'Enter' && state.tabNavigation && nativeActivation) {
        markKeyboard(); state.tabNavigation = false;
        event.preventDefault?.(); event.stopPropagation?.();
        if (!target.disabled) target.click?.();
        return;
      }
      if (!mapped) {
        // Space has no game binding. Suppress the browser's delayed button
        // activation so it cannot fire after a screen transition.
        if (nativeActivation || event.code === 'Space') {
          event.preventDefault?.(); event.stopPropagation?.();
        }
        return;
      }
      state.tabNavigation = false;
      markKeyboard();
      event.preventDefault?.(); event.stopPropagation?.();
      if (!mapped.el.disabled) mapped.el.click();
    };
    const up = event => {
      const held = state.pressed.has(event.code);
      state.pressed.delete(event.code);
      const target = event.target;
      const nativeActivation = ['Enter', 'Space'].includes(event.code) &&
        target?.matches?.('button,a[href],[role="button"]');
      if (held && (nativeActivation || ['Enter', 'Space'].includes(event.code))) {
        event.preventDefault?.(); event.stopPropagation?.();
      }
    };
    const pointer = () => {
      state.tabNavigation = false;
      const html = doc.documentElement;
      if (html?.dataset) html.dataset.input = 'pointer';
    };
    const blur = event => {
      // Listen for the window losing focus only. A captured element blur is a
      // normal focus move and must not release a physical key held by the user.
      if (event?.target && event.target !== doc.defaultView) return;
      state.pressed.clear(); state.tabNavigation = false;
    };
    state.listener = { down, up, pointer, blur };
    doc.addEventListener('keydown', down, true); doc.addEventListener('keyup', up, true);
    doc.addEventListener('pointerdown', pointer, true); doc.defaultView?.addEventListener?.('blur', blur);
  }

  function refresh(opts = {}) {
    const doc = opts.document || root.document; if (!doc) return { count: 0, assignments: [], unassigned: [] };
    clearBindings(doc);
    const main = opts.root || doc.querySelector?.('#main') || doc.body, dialog = opts.dialog || null;
    const scope = dialog || main, header = dialog ? null : (opts.header || doc.querySelector?.('#header'));
    const headerEls = candidates(header), scopeEls = candidates(scope), elements = [...headerEls, ...scopeEls.filter(el => !headerEls.includes(el))];
    const primaryEl = scopeEls.find(el => PRIMARY.has(action(el)) && !DESTRUCTIVE.has(action(el)));
    const escapeEl = scopeEls.find(el => ESCAPE.has(action(el)) && !DESTRUCTIVE.has(action(el)));
    const left = scopeEls.find(el => action(el) === 'board-prev' || action(el) === 'modal-prev' || ((action(el) === 'flow-page' || action(el) === 'page') && el.dataset.step === '-1'));
    const right = scopeEls.find(el => action(el) === 'board-next' || action(el) === 'modal-next' || ((action(el) === 'flow-page' || action(el) === 'page') && el.dataset.step === '1'));
    const seen = new Map(), descriptors = [];
    for (const el of elements) {
      const a = action(el);
      // Board cards are navigated by arrows and Enter through app.js' callback.
      if (!dialog && BOARD_CARD_ACTIONS.has(a)) continue;
      const base = semantic(el), occurrence = seen.get(base) || 0; seen.set(base, occurrence + 1);
      const fixed = headerEls.includes(el); let key = null;
      if (fixed) {
        const value = a === 'lang' ? HEADER_KEYS[`lang:${el.dataset.lang || ''}`] : HEADER_KEYS[a];
        if (value) key = { code: value, shift: false };
      }
      if (!fixed && el === primaryEl) key = { code: 'Enter', shift: false };
      else if (!fixed && el === escapeEl) key = { code: 'Escape', shift: false };
      // Board paging uses the two printable bracket keys. PageUp/PageDown are
      // deliberately not assigned: they are awkward on many laptops and are
      // reserved by browsers and assistive software more often than users
      // expect. Arrow keys remain dedicated to moving within the board.
      else if (!fixed && (a === 'board-prev' || a === 'board-next')) key = { code: a === 'board-prev' ? 'BracketLeft' : 'BracketRight', shift: false };
      else if (!fixed && el === left) key = { code: 'ArrowLeft', shift: false };
      else if (!fixed && el === right) key = { code: 'ArrowRight', shift: false };
      descriptors.push({ el, fixed, key, semantic: `${base}${occurrence ? `#${occurrence}` : ''}` });
    }
    const reservedCodes = opts.reservedCodes || opts.contextObj?.reservedCodes || [];
    const nextContext = opts.context || 'default';
    const contextChanged = state.last && (state.last.context !== nextContext || state.last.dialog !== dialog || state.last.root !== main);
    if (contextChanged) state.tabNavigation = false;
    const plan = descriptorPlan(descriptors, nextContext, { reservedCodes }); state.byKey.clear();
    for (const assignment of plan.assignments) { addHint(assignment.el, assignment.label, assignment.code); state.byKey.set(keyId(assignment.code), assignment); }
    state.last = { root: main, dialog, context: nextContext, busy: opts.busy, optsContext: opts.contextObj || {} }; install(doc);
    return { count: plan.assignments.length, assignments: plan.assignments, unassigned: plan.unassigned };
  }

  function destroy(doc = root.document) {
    if (state.listener && doc) {
      doc.removeEventListener('keydown', state.listener.down, true); doc.removeEventListener('keyup', state.listener.up, true);
      doc.removeEventListener('pointerdown', state.listener.pointer, true); doc.defaultView?.removeEventListener?.('blur', state.listener.blur);
    }
    state.listener = null; state.last = null; state.byKey.clear(); state.sticky.clear(); state.pressed.clear(); state.tabNavigation = false;
  }

  const api = Object.freeze({
    refresh, destroy, keyLabel, buildAssignments: (descriptors, context) => descriptorPlan(descriptors, context).assignments,
    planAssignments: (descriptors, context, policy) => descriptorPlan(descriptors, context, policy),
    normalEvent: event => !(event?.isComposing || event?.repeat || event?.shiftKey || event?.ctrlKey || event?.altKey || event?.metaKey || event?.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event?.target?.tagName || '')),
    HEADER_KEYS, US, RESERVED
  });
  root.NeoKeyboard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

;
/* Pure spatial navigation. Hidden questions are removed by the caller; used
 * questions stay in the grid as disabled slots. No game state is mutated. */
(function(root) {
  'use strict';
  const playable = slot => !!slot && !slot.disabled;

  function select(slots, currentId, page = 0, pageSize = 48) {
    const start = Math.max(0, page) * pageSize;
    const end = Math.min(slots.length, start + pageSize);
    const current = slots.findIndex(slot => slot.qid === currentId);
    if (current >= start && current < end && playable(slots[current])) return current;
    // After returning from a question, continue forward from that slot first.
    if (current >= start && current < end) {
      for (let i = current + 1; i < end; i++) if (playable(slots[i])) return i;
    }
    for (let i = start; i < end; i++) if (playable(slots[i])) return i;
    return -1;
  }

  function move(slots, currentId, direction, page = 0, columns = 8, pageSize = 48) {
    const step = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-1, ArrowDown:1}[direction];
    if (!step) return select(slots, currentId, page, pageSize);
    let current = select(slots, currentId, page, pageSize);
    if (current < 0) {
      // A completely answered page remains inspectable. An arrow can move to
      // the next/previous page that still contains a playable question.
      const start = step > 0 ? (page + 1) * pageSize : page * pageSize - 1;
      for (let i = start; i >= 0 && i < slots.length; i += step) {
        if (playable(slots[i])) return i;
      }
      return -1;
    }
    if (direction === 'ArrowLeft' || direction === 'ArrowRight') {
      for (let i = current + step; i >= 0 && i < slots.length; i += step) {
        if (playable(slots[i])) return i;
      }
      return current;
    }
    const column = current % columns;
    for (let row = Math.floor(current / columns) + step;
      row >= 0 && row * columns < slots.length; row += step) {
      const candidates = [];
      for (let i = row * columns; i < Math.min(slots.length, (row + 1) * columns); i++) {
        if (playable(slots[i])) candidates.push(i);
      }
      candidates.sort((a,b) => Math.abs(a % columns - column) - Math.abs(b % columns - column) || a-b);
      if (candidates.length) return candidates[0];
    }
    return current;
  }
  const api = Object.freeze({select,move});
  root.NeoBoardNavigation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);

;
/* Shared pagination for multilingual flowing text.  This file has no app
 * state of its own; the host supplies the existing WeakMap and painter. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NeoFlowNavigation = Object.freeze(api);
})(typeof window === 'undefined' ? globalThis : window, function () {
  const LANG_SUFFIX = /-(?:en|zh-Hans|zh-Hant)$/;

  function groupKey(el) {
    const shared=el.closest?.('[data-flow-group-root]');
    if(shared?.dataset?.flowGroupRoot)return shared.dataset.flowGroupRoot;
    const id = String(el.dataset.flowId || '');
    // Prompt, answer and option flows are rendered once per UI language. The
    // search dialog deliberately keeps one independent flow per language.
    if (/^(prompt|answer|option)-/.test(id)) {
      return id.replace(LANG_SUFFIX, '');
    }
    return id;
  }

  function navFor(el) { return el.querySelector('.flow-nav'); }
  function visible(el) { return !!(el && el.getClientRects && el.getClientRects().length); }

  function refresh(root, options) {
    if (!root || !options) return [];
    const { flowData, flowPages, paintFlow } = options;
    if (!flowData || !flowPages || typeof paintFlow !== 'function') return [];
    const groups = new Map();
    [...root.querySelectorAll('.flow')].filter(visible).forEach(el => {
      const entry = flowData.get(el);
      if (!entry || !Array.isArray(entry.pages) || !entry.pages.length) return;
      const key = groupKey(el);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ el, entry });
    });

    for (const [key, members] of groups) {
      const maxPages = Math.max(...members.map(m => m.entry.pages.length));
      const saved = Number.isInteger(flowPages[key]) ? flowPages[key] : 0;
      const index = Math.max(0, Math.min(saved, maxPages - 1));
      flowPages[key] = index;
      const owner = members.find(m => m.entry.pages.length === maxPages) || members[0];
      const container=owner.el.closest?.('[data-flow-group-root]');
      const sharedNav=container?.querySelector?.(':scope > .flow-nav');
      members.forEach(member => {
        member.el.dataset.flowGroup = key;
        member.el.dataset.flowNavOwner = member.el === owner.el ? 'true' : 'false';
        member.entry.index = Math.min(index, member.entry.pages.length - 1);
        paintFlow(member.el);
        const nav = navFor(member.el);
        if (!nav) return;
        nav.hidden = !!sharedNav || member.el !== owner.el || maxPages <= 1;
        nav.dataset.flowGroup = key;
        if (member.el === owner.el) {
          const buttons = nav.querySelectorAll('button');
          if (buttons.length >= 2) {
            buttons[0].disabled = index <= 0;
            buttons[1].disabled = index >= maxPages - 1;
          }
          const count = nav.querySelector('span');
          if (count) count.textContent = `${index + 1} / ${maxPages}`;
        }
      });
      if(sharedNav){
        sharedNav.hidden=maxPages<=1;
        sharedNav.dataset.flowGroup=key;
        const buttons=sharedNav.querySelectorAll('button');
        buttons[0].disabled=index<=0;buttons[1].disabled=index>=maxPages-1;
        sharedNav.querySelector('span').textContent=`${index+1} / ${maxPages}`;
      }
    }
    return [...groups.keys()];
  }

  function step(el, delta, options) {
    if (!el || !options) return false;
    const { flowData, flowPages, paintFlow } = options;
    if (!flowData || !flowPages || typeof paintFlow !== 'function') return false;
    const key = el.dataset.flowGroupRoot || el.dataset.flowGroup || groupKey(el);
    const root = el.closest('main, [role="dialog"], .modal, body') || document;
    const members = [...root.querySelectorAll(`.flow[data-flow-group="${CSS.escape(key)}"]`)]
      .map(node => ({ el: node, entry: flowData.get(node) }))
      .filter(item => item.entry && Array.isArray(item.entry.pages));
    if (!members.length) return false;
    const maxPages = Math.max(...members.map(item => item.entry.pages.length));
    const current = Number.isInteger(flowPages[key]) ? flowPages[key] : 0;
    const next = Math.max(0, Math.min(maxPages - 1, current + Number(delta || 0)));
    flowPages[key] = next;
    members.forEach(item => {
      item.entry.index = Math.min(next, item.entry.pages.length - 1);
      paintFlow(item.el);
    });
    refresh(root, options);
    return true;
  }

  return { refresh, step, groupKey };
});

;
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
async function downloadElementPng(element,filename='partyquiz-results.png',options={}) {const blob=await renderElementToPng(element,options),doc=element.ownerDocument||document,url=URL.createObjectURL(blob),anchor=doc.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),0);return blob;}
const api={renderElementToPng,downloadElementPng};root.NeoResultsExport=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);

;
/* Compact local cache encoding for an in-memory game round. */
(function (root) {
  'use strict';

  const fingerprintCache = new WeakMap();
  const isObject = value => value !== null && typeof value === 'object';

  function copy(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function packList(builtins) {
    if (Array.isArray(builtins)) return builtins;
    if (builtins && Array.isArray(builtins.packs)) return builtins.packs;
    if (builtins && isObject(builtins)) return Object.values(builtins).filter(p => isObject(p) && Array.isArray(p.questions));
    return [];
  }

  function packIdentity(pack, Archive) {
    if (!isObject(pack) || typeof pack.id !== 'string') throw new Error('Invalid question pack');
    if (!Archive || typeof Archive.fingerprint !== 'function') throw new Error('Archive fingerprinting is unavailable');
    let byArchive = fingerprintCache.get(pack);
    if (!byArchive) { byArchive = new WeakMap(); fingerprintCache.set(pack, byArchive); }
    let fp = byArchive.get(Archive);
    if (!fp) { fp = Archive.fingerprint(pack); byArchive.set(Archive, fp); }
    return { id: pack.id, version: pack.version, schemaVersion: pack.schemaVersion, fingerprint: fp };
  }

  function sameIdentity(a, b) {
    return !!a && !!b && a.id === b.id && a.version === b.version && a.schemaVersion === b.schemaVersion && a.fingerprint === b.fingerprint;
  }

  function encodeGame(game, builtins, Archive) {
    if (!isObject(game) || !isObject(game.pack)) throw new Error('No current game');
    const identity = packIdentity(game.pack, Archive);
    const installed = packList(builtins).find(pack => {
      if (pack === game.pack) return true;
      try { return sameIdentity(packIdentity(pack, Archive), identity); } catch (_) { return false; }
    });
    // Exclude the pack before cloning. Cloning the 6 MB builtin on every
    // localStorage write would defeat the compact-cache purpose.
    const { pack: _pack, ...state } = game;
    const round = copy(state);
    if (installed) {
      round.packRef = identity;
    } else {
      round.pack = copy(game.pack);
    }
    return round;
  }

  function decodeGame(raw, builtins, Archive) {
    if (!isObject(raw)) throw new Error('Invalid cached game');
    const round = copy(raw);
    if (round.packRef !== undefined) {
      if (round.pack !== undefined) throw new Error('Invalid cached game: both pack reference and full pack are present');
      const ref = round.packRef;
      if (!isObject(ref) || typeof ref.id !== 'string' || typeof ref.fingerprint !== 'string') throw new Error('Invalid cached question pack reference');
      const installed = packList(builtins).find(pack => {
        try { return sameIdentity(packIdentity(pack, Archive), ref); } catch (_) { return false; }
      });
      if (!installed) throw new Error('Cached question pack is missing or has changed: ' + ref.id);
      delete round.packRef;
      round.pack = installed;
      return round;
    }
    if (!isObject(round.pack)) throw new Error('Cached game has no question pack');
    return round;
  }

  const api = Object.freeze({ encodeGame, decodeGame, packIdentity });
  root.NeoCache = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);

;
/* Stable, localized error boundaries for user-selected JSON files. */
(function(root){
'use strict';
const KNOWN=new Set([
 'saveNotRecognized','saveFormatInvalid','saveRequiresUpdate','saveIncomplete','savePackMissing',
 'savePackVersionMismatch','savePackSchemaMismatch','savePackContentMismatch','saveRoundCountInvalid',
 'saveRoundStateInvalid','saveScoringHistoryInvalid','saveTurnOrderInvalid','saveJudgmentsInvalid',
 'saveScoreIncomplete','saveScoreMismatch','saveActiveQuestionInvalid','saveCommittedScoreMissing',
 'saveActiveScoreMismatch','saveHiddenRecordsInvalid','saveResultsHistoryInvalid','invalidHidden',
 'packStorageFailed','importJsonInvalid','importFileReadFailed','fileLarge','saveFileLarge','importUnexpectedError'
]);
const contextOf=context=>typeof context==='string'?context:(context?.kind||context?.type||'');
function makeError(code,message,params={}){const err=new Error(message||code);err.code=code;err.params=Object.freeze({...params});return err;}
async function readJsonFile(file){
 let text;
 try{text=await file.text();}catch(cause){const err=makeError('importFileReadFailed','File text could not be read');err.cause=cause;throw err;}
 try{return JSON.parse(String(text).replace(/^\uFEFF/,''));}
 catch(cause){const err=makeError('importJsonInvalid','Invalid JSON');err.cause=cause;throw err;}
}
function resolveImportError(error,context){
 const kind=contextOf(context), raw=error&&typeof error.code==='string'?error.code:'';
 let key=KNOWN.has(raw)?raw:'importUnexpectedError';
 if(key==='saveHiddenRecordsInvalid'&&kind!=='save')key='invalidHidden';
 if(key==='invalidHidden'&&kind==='save')key='saveHiddenRecordsInvalid';
 if(key==='fileLarge'&&kind==='save')key='saveFileLarge';
 if(key==='saveFileLarge'&&kind!=='save')key='fileLarge';
 const params=error&&error.params&&typeof error.params==='object'?{...error.params}:{};
 return {key,params};
}
const api={KNOWN,makeError,readJsonFile,resolveImportError};
root.NeoImportErrors=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);

;
/* Persistent storage for user question packs.
 *
 * Imported packs are too large for the localStorage snapshot used for the
 * game session. IndexedDB keeps them under their own versioned database and
 * lets the caller commit the complete imported-pack list in one transaction.
 * Every operation opens and closes its connection, so a failed or abandoned
 * request cannot leave a connection holding the database open indefinitely.
 */
(function (root) {
  'use strict';

  const DB_NAME = 'quizparty.packs.v58';
  const STORE_NAME = 'state';
  const RECORD_KEY = 'imports';
  const GAME_PACK_KEY = 'game-pack';
  const DB_VERSION = 1;
  const ERROR_CODE = 'packStorageFailed';

  function storageError(message, cause) {
    const error = new Error(message || 'Question-pack storage failed');
    error.code = ERROR_CODE;
    if (cause) error.cause = cause;
    return error;
  }

  function clone(value) {
    // Structured cloning is the right representation for IndexedDB values.
    // JSON is the fallback used by the small Node test harness and by older
    // browsers that do not expose structuredClone.
    if (typeof root.structuredClone === 'function') return root.structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function indexedDBFor(value) {
    const idb = value || root.indexedDB;
    if (!idb || typeof idb.open !== 'function') {
      throw storageError('IndexedDB is unavailable in this browser');
    }
    return idb;
  }

  function openDatabase(idb) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let request;
      const fail = (message, cause) => { if (!settled) { settled = true; reject(storageError(message, cause)); } };
      try { request = idb.open(DB_NAME, DB_VERSION); }
      catch (cause) { fail('Could not open question-pack storage', cause); return; }
      request.onupgradeneeded = () => {
        try {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        } catch (cause) { fail('Could not initialize question-pack storage', cause); }
      };
      request.onsuccess = () => {
        if (settled) { try { request.result?.close?.(); } catch (_) {} return; }
        settled = true; resolve(request.result);
      };
      request.onerror = () => fail('Could not open question-pack storage', request.error);
      request.onblocked = () => fail('Question-pack storage is blocked by another tab');
    });
  }

  function transaction(db, mode, operation) {
    return new Promise((resolve, reject) => {
      let tx, request;
      try {
        tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        request = operation(store);
      } catch (cause) {
        reject(storageError('Could not access question-pack storage', cause));
        return;
      }
      let value;
      if (request) {
        request.onsuccess = () => { value = request.result; };
        request.onerror = () => reject(storageError('Could not access question-pack storage', request.error));
      }
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(storageError('Question-pack storage transaction failed', tx.error));
      tx.onabort = () => reject(storageError('Question-pack storage transaction was aborted', tx.error));
    });
  }

  function close(db) {
    try { db?.close?.(); } catch (_) { /* close is best effort after the result */ }
  }

  function create(indexedDB) {
    async function read() {
      const idb = indexedDBFor(indexedDB);
      const db = await openDatabase(idb);
      try {
        const value = await transaction(db, 'readonly', store => store.get(RECORD_KEY));
        if (value === undefined) return [];
        if (!Array.isArray(value)) throw storageError('Stored question packs are invalid');
        return clone(value);
      } finally { close(db); }
    }
    async function write(packs) {
      if (!Array.isArray(packs)) throw storageError('Question packs must be an array');
      const copy = clone(packs);
      const idb = indexedDBFor(indexedDB);
      const db = await openDatabase(idb);
      try {
        await transaction(db, 'readwrite', store => store.put(copy, RECORD_KEY));
      } finally { close(db); }
      return true;
    }
    async function readGamePack() {
      const idb = indexedDBFor(indexedDB);
      const db = await openDatabase(idb);
      try {
        const value = await transaction(db, 'readonly', store => store.get(GAME_PACK_KEY));
        return value === undefined ? null : clone(value);
      } finally { close(db); }
    }
    async function writeGamePack(pack) {
      if (pack !== null && (typeof pack !== 'object' || Array.isArray(pack))) {
        throw storageError('Stored game question pack must be an object or null');
      }
      const idb = indexedDBFor(indexedDB);
      const db = await openDatabase(idb);
      try {
        await transaction(db, 'readwrite', store => pack === null
          ? store.delete(GAME_PACK_KEY)
          : store.put(clone(pack), GAME_PACK_KEY));
      } finally { close(db); }
      return true;
    }
    async function clear() {
      const idb = indexedDBFor(indexedDB);
      const db = await openDatabase(idb);
      try { await transaction(db, 'readwrite', store => store.delete(RECORD_KEY)); }
      finally { close(db); }
      return true;
    }
    return Object.freeze({ read, write, readGamePack, writeGamePack, clear, dbName: DB_NAME, errorCode: ERROR_CODE });
  }

  const api = { create, DB_NAME, STORE_NAME, RECORD_KEY, GAME_PACK_KEY, DB_VERSION, ERROR_CODE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NeoPackStorage = create();
})(typeof window === 'undefined' ? globalThis : window);

;
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
    return '<g><title>'+e(p.name)+': '+total+'</title>'+(p.choice?'<rect x="'+x+'" y="'+y(p.choice)+'" width="'+bw+'" height="'+hChoice+'" class="chart-choice-segment" stroke="black" stroke-width="2"/>':'')+(p.open?'<rect x="'+x+'" y="'+y(total)+'" width="'+bw+'" height="'+hOpen+'" class="chart-open-segment" stroke="black" stroke-width="2"/>':'')+'<text x="'+(x+bw/2)+'" y="'+Math.max(23,y(total)-10)+'" text-anchor="middle" class="bar-total">'+total+'</text>'+nameText+'</g>';
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

;
/* Quiz Party: shared-screen game flow and rendering. */
(async function () {
  'use strict';
  const C = window.NeoCore, DICT = window.NeoI18n, audio = window.NeoAudio, Archive = window.NeoArchive, Stats = window.NeoStats, ResultsHistory = window.NeoResultsHistory, Cache = window.NeoCache, ImportErrors = window.NeoImportErrors;
  const Names = window.NeoPlayerNames, Categories=window.NeoCategoryFilter, Clock=window.NeoGameClock;
  const STORAGE = 'quizparty.release.v58';
  const HIDDEN_STORAGE = 'quizparty.hidden.v58';
  const LANG_NAMES = {en: 'English', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文'};
  const SHORT_NAMES = {en: 'EN', 'zh-Hans': '简中', 'zh-Hant': '繁中'};
  const icons = {
    arrow: '<path d="M4 12h16M13 5l7 7-7 7"/>', back: '<path d="M20 12H4m7-7-7 7 7 7"/>',
    book: '<path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.01"/>',
    settings: '<path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 3v6m8 0v6M8 15v6"/>',
    fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    check: '<path d="m4 12 5 5L20 6"/>', cross: '<path d="m5 5 14 14M19 5 5 19"/>',
    users: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 4v3"/>',
    bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8z"/>',
    refresh: '<path d="M20 4v6h-6M4 20v-6h6M4 9a8 8 0 0 1 13-5l3 6M4 14l3 6a8 8 0 0 0 13-5"/>',
    trophy: '<path d="M7 3h10v7a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 15v6m-5 0h10"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
    download: '<path d="M12 3v13m-5-5 5 5 5-5M4 15v6h16v-6"/>',
    card: '<rect x="4" y="3" width="16" height="18"/><path d="M8 8h8M8 12h5"/>',
    flag: '<path d="M4 22V3h16l-3 5 3 5H4"/>',
    eye: '<path d="M2 12c5-8 15-8 20 0-5 8-15 8-20 0z"/><circle cx="12" cy="12" r="3"/>'
  };
  function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">${icons[name] || icons.arrow}</svg>`; }
  function e(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch (_) { saved = {}; }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  let storedImports=[], cachedGamePack=null;
  try {
    [storedImports,cachedGamePack]=await Promise.all([window.NeoPackStorage.read(),window.NeoPackStorage.readGamePack()]);
  } catch (_) { /* Built-in play remains available when browser storage is disabled. */ }
  const builtins = (window.NEO_BUILTIN || []).map(C.normalizePack);
  if(cachedGamePack){try{cachedGamePack=C.validatePack(cachedGamePack).length?null:C.normalizePack(cachedGamePack);}catch(_){cachedGamePack=null;}}
  const imported = storedImports.filter(p => C.validatePack(p).length === 0).map(C.normalizePack);
  let packs = [...builtins.filter(p => !imported.some(a => a.id === p.id)), ...imported];
  const state = {
    lang: C.LANGUAGES.includes(saved.lang) ? saved.lang : 'zh-Hans',
    prefs: {sfx: saved.prefs?.sfx !== false, music: saved.prefs?.music === true, reduced: saved.prefs?.reduced === true},
    activePack: packs.some(p => p.id === saved.activePack) ? saved.activePack : packs[0]?.id,
    hidden: saved.hidden && typeof saved.hidden === 'object' && !Array.isArray(saved.hidden) ? saved.hidden : (saved.deleted && typeof saved.deleted === 'object' && !Array.isArray(saved.deleted) ? saved.deleted : {}),
    game: null, view: 'home', boardPage: 0, libraryScroll: 0, setup: {mode: C.MODES.includes(saved.setup?.mode)?saved.setup.mode:'together', count: Number.isInteger(saved.setup?.count)&&saved.setup.count>=2&&saved.setup.count<=8?saved.setup.count:4, names: Array.from({length:8},(_,i)=>Names.normalize(saved.setup?.names?.[i]||'')), tagFilter:saved.setup?.tagFilter, questionCount: Number.isInteger(saved.setup?.questionCount)&&saved.setup.questionCount>=12&&saved.setup.questionCount%12===0?saved.setup.questionCount:24},
    library: {filter:'active', query:'', from:'home', scope:'all'}, modal: null, flowPages: {}
  };
  state.boardCursor = null;
  try { state.resultsHistory = ResultsHistory.normalize(saved.resultsHistory); }
  catch (_) { state.resultsHistory = []; }
  state.resultHistoryId = null;
  let exportingResults = false, storingPack = false;
  try {
    const storedHidden = JSON.parse(localStorage.getItem(HIDDEN_STORAGE) || 'null');
    if (storedHidden && typeof storedHidden === 'object' && !Array.isArray(storedHidden)) state.hidden = storedHidden;
  } catch (_) { /* The main save also retains the hidden list. */ }
  // Cache and portable saves share one validator. Keep a running round's frozen
  // pack even when a newer pack has since been installed in the library.
  state.hidden = Archive.normalizeHidden(state.hidden);
  try {
    if (saved.game) {
      const game = Cache.decodeGame(saved.game,[...packs,...(cachedGamePack?[cachedGamePack]:[])],Archive);
      if(C.validatePack(game.pack).length)throw new Error('Invalid cached pack');
      if (!Number.isInteger(game.questionTarget)) game.questionTarget = game.board?.length;
      const portable = Archive.exportSave({...state, game});
      state.game = Archive.inspectSave(portable, [game.pack], C).game;
      state.game.pack=game.pack;
      if (state.game.current && Object.hasOwn(state.hidden,C.key(game.pack.id,game.current.qid))) state.game.current = null;
    }
  } catch (_) { /* A damaged cache must not prevent starting or importing a game. */ }
  const $ = s => document.querySelector(s);
  const main = $('#main'), dialog = $('#dialog'), modalLayer = $('#modal-layer');
  let moving = false, toastTimer, cacheWarning = false, lastFocus, setupPlanCache;
  const flowData = new WeakMap(), flowCache = new Map();
  const BOARD_PAGE_SIZE = 48; // Eight columns × six rows: no board scrolling.
  let libraryRows = [];
  function t(key, params = {}) {
    let value = DICT[key]?.[C.LANGUAGES.indexOf(state.lang)] || key;
    Object.entries(params).forEach(([k, v]) => { value = value.replaceAll('{' + k + '}', String(v)); });
    return value;
  }
  function B(action, label, cls = '', extra = '', symbol = '') { return `<button type="button" class="btn ${cls}" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ''}${e(label)}</button>`; }
  function L(action, label, symbol = '', extra = '') { return `<button type="button" class="utility" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ''}<span class="optional-label">${e(label)}</span></button>`; }
  function getPack() { return packs.find(p => p.id === state.activePack) || packs[0]; }
  function currentQ() { const g=state.game, q=g?.pack.questions.find(q=>q.id===g.current?.qid); return q ? C.variant(q,g.current.level) : null; }
  function isHidden(packId, qid) { return Object.hasOwn(state.hidden, C.key(packId, qid)); }
  function available(pack) { return pack.questions.filter(q => !isHidden(pack.id, q.id)); }
  function remaining(game) { return C.remaining(game,game.pack.questions.filter(q=>isHidden(game.pack.id,q.id)).map(q=>q.id)); }
  function activeHistory(game) { return game.history.filter(h => !h.voided); }
  function persist() {
    try { localStorage.setItem(HIDDEN_STORAGE, JSON.stringify(state.hidden)); }
    catch (_) { if (!cacheWarning) { cacheWarning = true; setTimeout(() => toast(t('cacheFail'), 9000), 100); } }
    try {
      localStorage.setItem(STORAGE, JSON.stringify({lang:state.lang,prefs:state.prefs,activePack:state.activePack,hidden:state.hidden,game:state.game?Cache.encodeGame(state.game,[...packs,...(cachedGamePack?[cachedGamePack]:[])],Archive):null,setup:state.setup,resultsHistory:state.resultsHistory}));
    } catch (_) { if (!cacheWarning) { cacheWarning = true; setTimeout(() => toast(t('cacheFail'), 9000), 100); } }
  }

  function reduced() { return state.prefs.reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function toast(message, duration = 4500) {
    const element = $('#toast'); clearTimeout(toastTimer); element.textContent = message; element.hidden = false;
    if (!reduced()) element.animate([{transform:'translate(-50%, 18px)'},{transform:'translate(-50%, 0)'}], {duration:180,easing:'ease-out'});
    toastTimer = setTimeout(() => { element.hidden = true; }, duration);
  }
  function header() {
    $('#header').innerHTML = `<div class="topbar-inner">
      <button class="brand" data-action="home" aria-label="${e(t('home'))}"><span class="brand-mark" aria-hidden="true">?</span><strong>${e(t('brand'))}</strong></button>
      <nav class="header-actions" aria-label="${e(t('headerNavigation'))}">
        <div class="locale-switch" aria-label="${e(t('uiLanguage'))}">${C.LANGUAGES.map(l=>`<button data-action="lang" data-lang="${l}" lang="${l}" aria-pressed="${state.lang===l}" aria-label="${e(LANG_NAMES[l])}">${SHORT_NAMES[l]}</button>`).join('')}</div>
        ${L('library',t('library'),'book')}${L('rules',t('rules'),'help')}
        <button class="utility icon-only" data-action="settings" aria-label="${e(t('settings'))}" data-tooltip="${e(t('settings'))}">${icon('settings')}</button>
        <button class="utility icon-only" data-action="fullscreen" aria-label="${e(t(document.fullscreenElement?'exitFull':'full'))}" data-tooltip="${e(t(document.fullscreenElement?'exitFull':'full'))}">${icon('fullscreen')}</button>
      </nav></div>`;
    document.documentElement.lang = state.lang;
    document.documentElement.dataset.reduced = String(state.prefs.reduced);
    document.title = t('brand');
    $('.skip-link').textContent = t('skip');
  }

  function render(animate = false) {
    header();
    const views = {home:homeView,setup:setupView,board:boardView,question:questionView,library:libraryView,results:resultsView};
    main.innerHTML = (views[state.view] || homeView)();
    main.className = 'view-' + state.view;
    audio.configure(state.prefs);
    if (state.modal) renderDialog();
    layoutFlows(main);
    initNeoScrollers(main);
    syncKeyboard();
  }

  function syncKeyboard() {
    window.NeoKeyboard.refresh({
      root:main, header:$('#header'), dialog:state.modal?dialog:null,
      context:state.modal?'modal-'+state.modal.type:state.view+'-'+(state.game?.current?.phase||''),
      busy:()=>moving||exportingResults||storingPack||(!state.modal&&!modalLayer.hidden),
      contextObj:{
        reservedCodes:state.view==='question'&&state.game?.current?.phase==='answer'&&!state.modal?Array.from({length:6},(_,i)=>'Digit'+(i+1)):[],
        onEscapeEditing:()=>{document.activeElement?.blur();(state.modal?dialog:main).focus({preventScroll:true});},
        onBoardKey:handleBoardKey
      }
    });
    paintBoardSelection();
  }

  function boardSlots() {
    const g=state.game;if(!g)return [];
    const seen=new Set(g.seen);
    return g.board.filter(slot=>!isHidden(g.pack.id,slot.qid)).map(slot=>({...slot,disabled:seen.has(slot.qid)}));
  }
  function paintBoardSelection(focus=false) {
    if(state.view!=='board')return;
    for(const tile of main.querySelectorAll('.board-question-tile')){
      const selected=!tile.disabled&&tile.dataset.qid===state.boardCursor;
      tile.classList.toggle('board-selected',selected);
      tile.setAttribute('aria-pressed',String(selected));
      tile.tabIndex=selected?0:-1;
      let cue=tile.querySelector('.board-focus-cue');
      if(selected){
        tile.setAttribute('aria-keyshortcuts','Enter');
        if(!cue){cue=document.createElement('span');cue.className='board-focus-cue';cue.setAttribute('aria-hidden','true');cue.textContent='Enter';tile.querySelector('.board-tile-meta').append(cue);}
        if(focus)tile.focus({preventScroll:true});
      }else{
        tile.removeAttribute('aria-keyshortcuts');
        cue?.remove();
      }
    }
  }
  function handleBoardKey(event) {
    if(state.view!=='board'||state.modal||!state.game)return false;
    const slots=boardSlots();
    if(event.code==='Enter'){
      // Tab/Space retain normal button access to the header and page controls.
      const control=event.target?.closest?.('button,a[href]');
      if(control&&control.dataset.action!=='pick')return false;
      const slot=slots.find(s=>s.qid===state.boardCursor&&!s.disabled);
      if(slot){audio.unlock();audio.play('click');pick(slot.qid,slot.level);}
      return true;
    }
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))return false;
    const index=window.NeoBoardNavigation.move(slots,state.boardCursor,event.code,state.boardPage);
    if(index<0)return true;
    state.boardCursor=slots[index].qid;
    const page=Math.floor(index/BOARD_PAGE_SIZE);
    if(page!==state.boardPage){state.boardPage=page;render();}
    paintBoardSelection(true);
    return true;
  }

  async function go(view, change) {
    if (moving) return;
    if (state.modal) closeModal(true);
    moving = true;
    const curtain = $('#curtain');
    const commit = () => { if (change) change(); if(view==='library'&&state.view!=='library')state.libraryScroll=0; state.view = view; render(); window.scrollTo(0,0); main.focus({preventScroll:true}); persist(); };
    try {
      if (reduced() || !curtain.animate) { commit(); return; }
      curtain.hidden = false;
      const into = curtain.animate([{transform:'translateY(100%)'},{transform:'translateY(0)'}], {duration:110,fill:'forwards',easing:'ease-in'});
      await into.finished; commit();
      const out = curtain.animate([{transform:'translateY(0)'},{transform:'translateY(-105%)'}], {duration:170,fill:'forwards',easing:'ease-out'});
      await out.finished; into.cancel(); out.cancel();
    } finally { curtain.hidden = true; moving = false; }
  }
  function modeStartButton(mode) {
    return `<button type="button" class="mode-start" data-action="mode" data-mode="${e(mode)}" data-key-preferred="Digit${C.MODES.indexOf(mode)+1}"><span>${e(t('play'))}</span>${icon('arrow')}</button>`;
  }
  function homeView() {
    const g=state.game;
    return `<section class="home-hero"><div><div class="kicker">${e(t('heroKicker'))}</div><h1 class="display home-title">${e(t('hero')).replace('\n',state.lang==='en'?' ':'')}</h1><p>${e(t('heroSub'))}</p></div><aside class="hero-aside"><div class="people-line"><strong class="big-range">2–8</strong><div><strong>${e(t('playerUnit'))}</strong><p>${e(t('noPhones'))}</p></div></div></aside></section>
    <section class="mode-grid" aria-label="${e(t('play'))}">
      <article class="mode-card main-mode"><h2>${e(t('together'))}</h2><p>${e(t('togetherDesc'))}</p>${modeStartButton('together')}<span class="mode-note">${e(t('togetherNote'))}</span><span class="playing-cards" aria-hidden="true"><span class="playing-card">1</span><span class="playing-card">2</span><span class="playing-card">3</span></span></article>
      <article class="mode-card buzz-mode"><h2>${e(t('buzz'))}</h2><p>${e(t('buzzDesc'))}</p>${modeStartButton('buzz')}<span class="mode-arrow buzz-symbol" aria-hidden="true">${icon('bolt')}</span></article>
      <article class="mode-card turns-mode"><h2>${e(t('turns'))}</h2><p>${e(t('turnsDesc'))}</p>${modeStartButton('turns')}<span class="mode-arrow turns-symbol" aria-hidden="true">${icon('refresh')}</span></article>
    </section>
    <div class="home-actions"><div class="row">${B('import-save',t('importSave'),'small','','upload')}${B('export-save',t('exportSave'),'small',g?'':'disabled','download')}${B('results-history',t('resultsHistoryCount',{n:state.resultsHistory.length}),'small','','trophy')}</div>${g&&!g.finished?`<div class="resume-inline"><span>${e(t(g.mode))} · ${e(t('completed',{n:activeHistory(g).length}))}</span>${B('resume',t('resume'),'primary small','','arrow')}</div>`:g?.finished?`<div class="resume-inline">${B('resume',t('viewResults'),'small','','trophy')}</div>`:''}</div>`;
  }
  function packTitle(pack) { return builtins.some(p=>p.id===pack.id)?t('builtin'):(pack.title?.[state.lang]||pack.id); }
  function participationKey(mode,q) {
    if(mode==='turns')return 'participationTurns';
    return C.isCollective(mode,q)?'participationAll':'participationBuzz';
  }
  function questionBadges(q,mode,compact=false) {
    const type=compact?(q.type==='choice'?'tileChoice':'tileOpen'):q.type;
    return `<span class="${compact?'board-tile-tags':'question-tags'}"><span class="${compact?'board-tile-type':'tag black'}" data-label="question-type">${e(t(type))}</span><span class="${compact?'board-tile-participation':'tag'}" data-label="participation">${e(t(participationKey(mode,q)))}</span></span>`;
  }
  function tierPoints(pack,level){return level<=4?level*100:pack.schemaVersion===3?(level-4)*200:level*100;}
  function packPickerButton(context) {
    const all=context==='library'&&state.library.filter==='hidden'&&state.library.scope==='all';
    return `<button class="pack-picker" data-action="pack-picker" data-context="${context}" aria-haspopup="dialog"><span>${icon('book')}<span class="pack-name">${e(all?t('allPacks'):packTitle(getPack()))}</span></span></button>`;
  }

  function selectedCategories(pack=getPack()) {
    const choice=state.setup.tagFilter;
    return Categories.normalizeSelection(pack,choice?.packId===pack.id?choice.selectedIds:undefined);
  }
  function setupQuestions(pack=getPack()) { return Categories.filterQuestions(pack,selectedCategories(pack),available(pack)); }
  function setCategories(ids) {
    const pack=getPack();state.setup.tagFilter={packId:pack.id,selectedIds:Categories.normalizeSelection(pack,ids)};
    setupPlanCache=null;state.setup.questionCount=normalizeRoundChoice(pack);
  }
  function maxRoundQuestions(pack=getPack()) {
    return Math.floor(setupQuestions(pack).length/12)*12;
  }
  function normalizeRoundChoice(pack=getPack(),n=state.setup.questionCount) {
    const max=maxRoundQuestions(pack);
    if(max<12)return 0;
    return Math.max(12,Math.min(max,Math.floor((Number(n)||24)/12)*12));
  }
  function roundPlan(pack,count) {
    const allowed=new Set(setupQuestions(pack).map(q=>q.id));
    const excluded=pack.questions.filter(q=>!allowed.has(q.id)).map(q=>q.id), key=excluded.join('|');
    if(!setupPlanCache||setupPlanCache.pack!==pack||setupPlanCache.count!==count||setupPlanCache.key!==key) {
      setupPlanCache={pack,count,key,plan:C.planBoard(pack,excluded,count)};
    }
    return setupPlanCache.plan;
  }
  function balancePreview(plan,count) {
    const content=plan.feasible?
      `<div class="balance-levels">${plan.counts.map((n,i)=>`<div class="balance-level" data-level="${i+1}" data-count="${n}"><small>${e(t(i<4?'tileChoice':'tileOpen'))}</small><strong>${tierPoints(getPack(),i+1)}</strong><span>× ${n}</span></div>`).join('')}</div><p>${e(t('balanceRatio',{percent:Math.round(plan.choiceCount/count*1000)/10}))}</p>`:
      `<p class="balance-warning" role="status">${e(t(!selectedCategories().length?'noCategories':count<12?'needTwelve':'balanceUnavailable'))}</p>`;
    return `<section class="setup-balance" aria-label="${e(t('balanceTitle'))}"><h2>${e(t('balanceTitle'))}</h2>${content}</section>`;
  }
  function setupView() {
    const s=state.setup;
    const maxRounds=maxRoundQuestions(), step=normalizeRoundChoice(getPack(),s.questionCount);
    const plan=roundPlan(getPack(),step);
    return `<div class="back-line">${B('home',t('back'),'small','','back')}</div><section class="setup-layout"><div class="setup-left"><div class="kicker">${e(t('setupKicker'))}</div><h1 class="display">${e(t('setupTitle'))}</h1><p>${e(t('setupSub'))}</p><div class="rule-ticket"><strong>${e(t(s.mode))}</strong><p>${e(t('rules'+({together:'Together',buzz:'Buzz',turns:'Turns'}[s.mode])))}</p></div>${balancePreview(plan,step)}</div>
      <div class="panel setup-panel"><div class="field-label">${e(t('playerCount'))}</div><div class="count-switch" aria-label="${e(t('playerCount'))}">${[2,3,4,5,6,7,8].map(n=>`<button data-action="count" data-count="${n}" data-key-preferred="Digit${n}" aria-pressed="${s.count===n}">${n}</button>`).join('')}</div>
      <div class="round-picker"><div class="round-picker-heading"><span class="field-label">${e(t('roundQuestionCount'))}</span><span class="round-picker-help">${e(t('roundStepHint',{max:maxRounds}))}</span></div>
      <div class="round-stepper" aria-label="${e(t('roundQuestionCount'))}"><button type="button" data-action="question-count" data-delta="-12" data-key-preferred="Minus" ${step<=12?'disabled':''} aria-label="${e(t('roundLess'))}">−12</button><output>${step||'—'} <small>${e(t('roundQuestionUnit'))}</small></output><button type="button" data-action="question-count" data-delta="12" data-key-preferred="Equal" ${step>=maxRounds?'disabled':''} aria-label="${e(t('roundMore'))}">+12</button></div></div>
      <div class="names-heading"><span class="field-label">${e(t('names'))}</span><span id="name-limit" class="hint">${e(t('nameLimit'))}</span></div><div class="name-grid">${Array.from({length:s.count},(_,i)=>`<label class="name-field"><span aria-hidden="true">${i+1}</span><input data-name="${i}" autocomplete="off" aria-describedby="name-limit" value="${e(s.names[i])}" aria-label="${e(t('player',{n:i+1}))}" placeholder="${e(t('player',{n:i+1}))}"></label>`).join('')}</div>
      <div class="setup-pack-row"><span class="field-label">${e(t('pack'))}</span>${packPickerButton('setup')}</div>
      <div class="setup-filter-row"><span class="field-label">${e(t('categoryFilter'))}</span>${B('categories',t('selectedCategories',{n:selectedCategories().length,total:Categories.listGroups(getPack()).length}),'small','aria-haspopup="dialog"','settings')}</div>
      ${B('start',t('start'),'primary btn-wide',!plan.feasible?'disabled':'','arrow')}</div></section>`;
  }

  function scoresStrip() {
    const g = state.game, totals = C.scores(g), active = g.current ? g.current.answerer : (g.mode === 'turns' ? C.currentPlayer(g) : null);
    return `<div class="scores-strip" style="--players:${g.players.length}">${g.players.map((name,i)=>`<div class="score-card ${active===i?'active-player':''}"><div class="score-name" title="${e(name)}"><span class="player-index">${String(i+1).padStart(2,'0')}</span>${e(name)}</div><strong class="score-number" data-score="${i}">${totals[i]}</strong></div>`).join('')}</div>`;
  }
  function questionTag(q,pack,language=state.lang) { return Categories.labelsFor(pack,q)[language]; }
  function libraryScrollFrame(inner) {
    return `<section class="neo-scroll-frame library-scroll" data-scroll-kind="library"><div class="neo-scroll-viewport" tabindex="0" role="region" aria-label="${e(t('library'))}"><div class="neo-scroll-content">${inner}</div></div><div class="neo-scroll-rail" aria-hidden="true"><div class="neo-scroll-thumb"></div></div></section>`;
  }
  function boardView() {
    const g=state.game;if(!g){state.view='home';return homeView();}
    if(!remaining(g).length){Clock.finish(g);g.current=null;state.view='results';state.resultHistoryId=null;return resultsView();}
    const qmap=new Map(g.pack.questions.map(q=>[q.id,q]));
    const seen=new Set(g.seen);
    const visible=g.board.map((b,i)=>({...b,number:i+1})).filter(b=>!isHidden(g.pack.id,b.qid));
    const pages=Math.max(1,Math.ceil(visible.length/BOARD_PAGE_SIZE));
    state.boardPage=Math.max(0,Math.min(state.boardPage,pages-1));
    const begin=state.boardPage*BOARD_PAGE_SIZE;
    const selected=window.NeoBoardNavigation.select(boardSlots(),state.boardCursor,state.boardPage);
    state.boardCursor=selected<0?null:visible[selected].qid;
    const cards=visible.slice(begin,begin+BOARD_PAGE_SIZE).map(b=>{
      const base=qmap.get(b.qid),variant=C.variant(base,b.level),points=variant.points,used=seen.has(b.qid),label=questionTag(base,g.pack);
      return `<button type="button" class="board-question-tile ${used?'taken':''}" data-action="pick" data-qid="${e(b.qid)}" data-level="${b.level}" data-points="${points}" data-type="${variant.type}" data-number="${b.number}" ${used?'disabled':''} aria-label="${e(t('questionNumber',{n:b.number})+' · '+t('selectQ',{p:points})+' · '+t(variant.type)+' · '+t(participationKey(g.mode,variant))+' · '+label)}"><span class="board-tile-row"><strong>${points} <small>${e(t('points'))}</small></strong>${questionBadges(variant,g.mode,true)}</span><span class="board-tile-tag" title="${e(label)}">${e(label)}</span><span class="board-tile-meta"><span class="board-tile-number">#${String(b.number).padStart(2,'0')}</span>${used?`<span class="board-tile-chosen">${e(t('pickedQuestion'))}</span>`:''}</span></button>`;
    }).join('');
    const pager=pages>1?`<nav class="board-pagination" aria-label="${e(t('boardTitle'))}">${B('board-prev',t('prev'),'small',state.boardPage===0?'disabled':'','back')}<span class="board-page-count" aria-live="polite">${state.boardPage+1} / ${pages}</span>${B('board-next',t('nextPage'),'small',state.boardPage===pages-1?'disabled':'','arrow')}</nav>`:'';
    return `<div class="page-top"><div><h1>${e(t('boardTitle'))}</h1></div><div class="row"><span class="tag yellow">${e(t(g.mode))}</span>${B('finish',t('finish'),'small','','flag')}</div></div>${scoresStrip()}
      <div class="board-toolbar"><div class="row"><span class="tag black">${e(g.mode==='turns'?t('nextTurn',{name:g.players[C.currentPlayer(g)]}):t(g.mode))}</span></div><span class="kicker">${state.lang==='en'?'100 / 200 / 300 / 400':'100、200、300、400'} ${e(t('points'))} · ${e(t('tileChoice'))} / ${(g.pack.schemaVersion===3?[200,400,600,800]:[500,600,700,800]).join(state.lang==='en'?' / ':'、')} ${e(t('points'))} · ${e(t('tileOpen'))}</span></div>
      <section class="board-fixed-grid" role="group" aria-label="${e(t('boardTitle'))}">${cards||`<div class="board-empty">${e(t('noMatches'))}</div>`}</section>
      <div class="board-footer"><span>${e(packTitle(g.pack))}</span>${pager||`<span class="board-keyboard-help">${e(t(state.boardCursor?'boardKeys':'boardKeysEmpty'))}</span>`}<span>${e(t('roundProgress',{n:activeHistory(g).length,total:g.questionTarget||g.board.length}))}</span></div>`;
  }

  function flow(text,id,size=30) {
    return `<div class="flow" data-flow-id="${e(id)}" data-flow-text="${e(text)}" data-font-size="${size}"><div class="flow-text">${e(text)}</div></div>`;
  }
  function flowPager(group) {
    return `<nav class="flow-nav" data-flow-group="${e(group)}" aria-label="${e(t('contentPages'))}" hidden><button type="button" data-action="flow-page" data-step="-1" aria-label="${e(t('prev'))}">${icon('back')}</button><span aria-live="polite"></span><button type="button" data-action="flow-page" data-step="1" aria-label="${e(t('nextPage'))}">${icon('arrow')}</button></nav>`;
  }
  function layoutFlows(root) {
    const flows=[...root.querySelectorAll('.flow')];
    root.querySelectorAll('[data-flow-group-root] > .flow-nav').forEach(nav=>nav.hidden=true);
    const measure=()=>flows.forEach(el=>{
      const content=el.querySelector('.flow-text'),text=el.dataset.flowText,size=Number(el.dataset.fontSize);
      if(!el.clientHeight||!el.clientWidth)return;
      content.style.fontSize=size+'px';
      const key=JSON.stringify([text,content.clientWidth,content.clientHeight,size,document.fonts?.status]);
      let pages=flowCache.get(key);
      if(!pages){
        content.textContent=text;
        const fits=()=>content.scrollHeight<=content.clientHeight+1&&content.scrollWidth<=content.clientWidth+1;
        pages=[text];
        if(!fits()){
          pages=[];const chars=Array.from(text);let at=0;
          while(at<chars.length){
            let lo=1,hi=chars.length-at,best=1;
            while(lo<=hi){const mid=(lo+hi)>>1;content.textContent=chars.slice(at,at+mid).join('');if(fits()){best=mid;lo=mid+1;}else hi=mid-1;}
            let cut=best;
            if(at+cut<chars.length){const part=chars.slice(at,at+cut).join(''),space=part.lastIndexOf(' ');if(space>part.length*.7)cut=Array.from(part.slice(0,space+1)).length;}
            const page=chars.slice(at,at+cut).join('').trim();if(page)pages.push(page);at+=cut;
          }
        }
        if(!pages.length)pages=[''];
        if(flowCache.size>512)flowCache.clear();flowCache.set(key,pages);
      }
      flowData.set(el,{pages,index:0});paintFlow(el);
    });
    measure();
    window.NeoFlowNavigation.refresh(root,{flowData,flowPages:state.flowPages,paintFlow});
    // Shared page controls consume their own row, outside the language cells.
    if(root.querySelector('.flow-nav:not([hidden])')){
      measure();window.NeoFlowNavigation.refresh(root,{flowData,flowPages:state.flowPages,paintFlow});
    }
  }
  function paintFlow(el) {
    const entry=flowData.get(el);if(entry)el.querySelector('.flow-text').textContent=entry.pages[entry.index];
  }
  /* The browser handles clipping, but the visible rail, thumb, wheel/key and drag
     behavior are authored in this game, not native browser chrome. */
  function initNeoScrollers(root) {
    root.querySelectorAll('[data-scroll-kind]').forEach(frame=>{
      const viewport=frame.querySelector('.neo-scroll-viewport'),content=frame.querySelector('.neo-scroll-content'),rail=frame.querySelector('.neo-scroll-rail'),thumb=frame.querySelector('.neo-scroll-thumb');
      if(libraryRows.length) {
        const space=content.querySelector('.library-virtual-space');
        let start=-1;
        const draw=()=>{
          const first=Math.max(0,Math.floor(viewport.scrollTop/116)-2);
          const end=Math.min(libraryRows.length,first+Math.ceil(viewport.clientHeight/116)+6);
          if(first===start&&space.children.length===end-first)return;start=first;
          space.innerHTML=libraryRows.slice(first,end).map((entry,i)=>libraryRow(entry,first+i)).join('');
        };
        viewport.addEventListener('scroll',draw,{passive:true});
        draw();
      }
      const update=()=>{
        const full=viewport.scrollHeight,visible=viewport.clientHeight,canScroll=full>visible+2;
        rail.hidden=!canScroll;
        if(!canScroll)return;
        const track=rail.clientHeight,thumbH=Math.max(56,track*visible/full),available=track-thumbH;
        thumb.style.height=thumbH+'px';thumb.style.transform=`translateY(${available*viewport.scrollTop/(full-visible)}px)`;
      };
      viewport.addEventListener('scroll',()=>{state.libraryScroll=viewport.scrollTop;update();syncKeyboard();},{passive:true});
      rail.addEventListener('pointerdown',ev=>{
        ev.preventDefault();const rect=rail.getBoundingClientRect(),h=thumb.getBoundingClientRect().height;
        const scrollToPointer=y=>{let fraction=(y-rect.top-h/2)/(rect.height-h);fraction=Math.max(0,Math.min(1,fraction));viewport.scrollTop=fraction*(viewport.scrollHeight-viewport.clientHeight);};
        rail.setPointerCapture(ev.pointerId);scrollToPointer(ev.clientY);
        const move=x=>scrollToPointer(x.clientY);
        const release=()=>{rail.removeEventListener('pointermove',move);rail.removeEventListener('pointerup',release);rail.removeEventListener('pointercancel',release);};
        rail.addEventListener('pointermove',move);rail.addEventListener('pointerup',release);rail.addEventListener('pointercancel',release);
      });
      viewport.addEventListener('keydown',ev=>{
        if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){ev.preventDefault();viewport.scrollBy({top:ev.key==='ArrowDown'?116:-116,behavior:reduced()?'instant':'smooth'});}
        if(ev.key==='Home'||ev.key==='End'){ev.preventDefault();viewport.scrollTop=ev.key==='Home'?0:viewport.scrollHeight;}
      });
      viewport.scrollTop=state.libraryScroll;
      viewport.dispatchEvent(new Event('scroll'));
      requestAnimationFrame(update);
    });
  }
  function triplePrompt(q, compact=false) {
    const group='prompt-'+q.id+'-'+(q.type||'base');
    return `<div class="flow-group prompt-group" data-flow-group-root="${e(group)}"><div class="triple-grid prompt-grid">${C.LANGUAGES.map(l=>`<section class="lang-cell prompt-cell" lang="${l}"><span class="language-label">${LANG_NAMES[l]}</span>${flow(q.locales[l].prompt,group+'-'+l,32)}</section>`).join('')}</div>${flowPager(group)}</div>`;
  }
  function answerText(q,language){
    const tr=q.locales[language];if(q.type==='choice')return tr.optionLabels[q.correctOptionId];
    return [tr.answer,...(Array.isArray(tr.acceptedAnswers)?tr.acceptedAnswers:[])].filter((value,index,list)=>value&&list.indexOf(value)===index).join(' / ');
  }
  function tripleAnswer(q) {
    const group='answer-'+q.id;
    return `<section class="answer-panel"><h2 class="section-title">${icon('check')}${e(t('answer'))}${q.type==='choice'?` · ${String.fromCharCode(65+q.options.indexOf(q.correctOptionId))}`:''}</h2><div class="flow-group answer-group" data-flow-group-root="${e(group)}"><div class="triple-grid answer-grid">${C.LANGUAGES.map(l=>`<div class="lang-cell" lang="${l}"><span class="language-label">${LANG_NAMES[l]}</span>${flow(answerText(q,l),group+'-'+l,30)}</div>`).join('')}</div>${flowPager(group)}</div></section>`;
  }
  function optionsView(q,cur,interactive,revealed) {
    if(q.type!=='choice')return '';
    const group='options-'+q.id;
    return `<div class="flow-group options-area" data-flow-group-root="${e(group)}"><div class="options-list" style="--options:${q.options.length}" role="group" aria-label="${e(t('choice'))}">${q.options.map((id,i)=>{
      const correct=revealed&&id===q.correctOptionId,wrong=revealed&&cur?.selected===id&&!correct,letter=String.fromCharCode(65+i);
      return `<div class="option-row ${interactive?'option-clickable':''} ${cur?.selected===id?'selected':''} ${correct?'correct-answer':''} ${wrong?'wrong-answer':''}" ${interactive?`data-action="option" data-option="${e(id)}"`:''}>${interactive?`<button type="button" class="option-index" data-action="option" data-option="${e(id)}" data-key-preferred="Digit${i+1}" aria-pressed="${cur?.selected===id}" aria-label="${e(t('pickOption',{n:letter}))}">${letter}</button>`:`<span class="option-index">${letter}${correct?icon('check'):wrong?icon('cross'):''}</span>`}${C.LANGUAGES.map(l=>`<div class="option-text" lang="${l}">${flow(q.locales[l].optionLabels[id],'option-'+q.id+'-'+id+'-'+l,27)}</div>`).join('')}</div>`;
    }).join('')}</div>${flowPager(group)}</div>`;
  }

  function googleLink(q, fixedKey=false) {
    return `<a class="btn small" ${fixedKey?'data-key-preferred="Digit7"':''} href="${e(C.googleURL(q,state.lang))}" target="_blank" rel="noopener noreferrer">${icon('search')}${e(t('google'))}</a>`;
  }
  function tools(q,packId) {
    const attrs=`data-qid="${e(q.id)}" data-pack="${e(packId)}"`;
    return `<div class="question-tools">${googleLink(q,true)}${B('hide',t('remove'),'small',attrs+' data-key-preferred="Digit8"','eye')}</div>`;
  }

  function questionView() {
    const g=state.game,q=currentQ(),cur=g?.current;
    if(!q||isHidden(g.pack.id,q.id)){if(g)g.current=null;state.view=g?'board':'home';return g?boardView():homeView();}
    // A V2 save can be paused before choosing a spoken-answer contestant.
    // Keep recorded answerers, but assign an unanswered turn to the current player.
    if(g.mode==='turns'&&cur.answerer===null)cur.answerer=C.currentPlayer(g);
    const race=C.isRace(g.mode,q),all=C.isCollective(g.mode,q),reveal=cur.phase!=='answer';
    const selectable=cur.phase==='answer'&&!all&&Number.isInteger(cur.answerer);
    const category=g.pack.categories.find(c=>c.id===q.categoryId);
    const instruction=all?t('collectiveHint'):(race&&q.type==='choice' ?
      (cur.answerer===null?t('raceChoiceFirst'):cur.selected?t('raceChoiceReady',{n:g.players[cur.answerer],option:String.fromCharCode(65+q.options.indexOf(cur.selected))}):t('raceChoiceNext',{n:g.players[cur.answerer]})):
      race&&q.type==='open'?(cur.answerer===null?t('raceOpenFirst'):t('raceOpenReady',{n:g.players[cur.answerer]})):
      q.type==='open'?t('turnOpenReady',{n:g.players[cur.answerer]}):
      (cur.selected?t('turnChoiceReady',{option:String.fromCharCode(65+q.options.indexOf(cur.selected))}):t('turnChoiceNext')));
    return `<div class="question-top"><div class="row">${B('question-back',t('back'),'small','','back')}<span class="tag question-type-marker" data-question-type="${q.type}">${e(t(g.mode))}</span></div>${tools(q,g.pack.id)}</div>
      ${scoresStrip()}<div style="--prompt-height:${q.type==='choice'&&q.options.length>4?228:280}px" class="question-content ${reveal?'revealed':'answering'} ${q.type==='open'?'is-open':''} ${race?'is-race':''}">
      <section class="question-panel" data-question-type="${q.type}"><div class="question-band"><div class="row"><strong>${e(questionTag(g.pack.questions.find(x=>x.id===q.id),g.pack))}</strong>${questionBadges(q,g.mode)}</div><span class="question-value">${q.points}<small>${e(t('points'))}</small></span></div>${triplePrompt(q)}</section>
      ${!reveal?`<div class="question-instruction">${icon(race?'bolt':all?'users':'card')}<span>${e(instruction)}</span>${!all&&!race?`<strong>${e(t('answerer',{name:g.players[cur.answerer]}))}</strong>`:''}</div>`:''}
      ${!reveal&&race?`<section class="answerer-panel"><strong>${e(t('whoBuzzed'))}</strong><div class="answerer-buttons">${g.players.map((n,i)=>B('answerer',n,'small',`data-player="${i}" data-key-preferred="${'Key'+'ASDFGHJK'[i]}" aria-pressed="${cur.answerer===i}"`)).join('')}</div></section>`:''}
      ${!reveal?optionsView(q,cur,selectable,false):''}
      ${reveal?tripleAnswer(q):''}
      ${cur.phase==='judge'?judgmentView(q,cur):''}${cur.phase==='scored'?scoredView(q,cur):''}</div>
      <div class="question-bottom"><span class="hint">${e(t(C.wrongCost(g.mode,q,g.rulesVersion)>0?'racePenalty':'noPenalty',{p:q.points,h:C.wrongCost(g.mode,q,g.rulesVersion)}))}</span><div class="row">${reveal&&q.type==='choice'?B('inspect',t('viewOptions'),'small',`data-qid="${e(q.id)}" data-pack="${e(g.pack.id)}"`,'card'):''}${g.mode==='turns'&&cur.phase==='judge'?B('retry-answer',t('retryAnswer'),'small','data-key-preferred="KeyZ"','refresh'):''}${cur.phase==='answer'?B('reveal',t(all?'cardsReady':'reveal'),'primary',(!all&&(cur.answerer===null||(q.type==='choice'&&!cur.selected)))?'disabled':'','eye'):cur.phase==='judge'?B('commit',t('commit'),'primary',canCommit()?'':'disabled','check'):`${g.mode==='turns'?B('undo-score',t('undoScore'),'small','data-key-preferred="KeyZ"','refresh'):B('edit',t('editJudgment'),'small','','refresh')}${B('next',t('next'),'primary','','arrow')}`}</div></div>`;
  }

  function targets() {
    const g=state.game, q=currentQ();
    return C.isCollective(g.mode,q) ? g.players.map((_,i)=>i) : [g.current.answerer];
  }
  function canCommit() { return targets().every(i=>Number.isInteger(i)&&typeof state.game.current.judgments[i]==='boolean'); }
  function judgmentView(q,cur) {
    const g=state.game, ids=targets(), n=ids.filter(i=>typeof cur.judgments[i]==='boolean').length;
    if(g.mode==='turns')return turnReview(q,cur);
    return `<section class="judging-section"><div class="judge-heading"><div><h2>${e(t(ids.length===1?'judgingSingle':'judging'))}</h2><p>${e(t(ids.length===1?'judgeSingleSub':'judgeSub'))}</p></div><div class="row judge-bulk">${ids.length>1?B('judge-all',t('allCorrect'),'small','data-result="true" data-key-preferred="KeyC"','check')+B('judge-all',t('allWrong'),'small','data-result="false" data-key-preferred="KeyV"','cross'):''}<span class="tag yellow">${e(t('judgedCount',{n,total:ids.length}))}</span></div></div><div class="judge-grid ${ids.length===1?'single':''}">${ids.map(i=>{
      const v=cur.judgments[i];return `<div class="judge-card" data-result="${v===true?'correct':v===false?'wrong':'pending'}"><div class="judge-name"><strong>${e(g.players[i])}</strong><span>${e(t(typeof v==='boolean'?(v?'correct':'wrong'):'pending'))}</span></div><div class="judge-actions"><button data-action="judge" data-player="${i}" data-result="true" data-key-preferred="${ids.length===1?'KeyC':'Digit'+[1,2,3,4,5,6,9,0][i]}" aria-pressed="${v===true}" aria-label="${e(g.players[i]+' '+t('correct'))}">${icon('check')}${e(t('correct'))}</button><button data-action="judge" data-player="${i}" data-result="false" data-key-preferred="${ids.length===1?'KeyV':'Key'+'ASDFGHJK'[i]}" aria-pressed="${v===false}" aria-label="${e(g.players[i]+' '+t('wrong'))}">${icon('cross')}${e(t('wrong'))}</button></div></div>`;
    }).join('')}</div></section>`;
  }
  function turnReview(q,cur) {
    const name=state.game.players[cur.answerer], judgment=cur.judgments[cur.answerer], ready=typeof judgment==='boolean';
    const delta=ready?(judgment?q.points:-C.wrongCost('turns',q,state.game.rulesVersion)):null;
    const outcome=ready?t(judgment?'turnCorrect':'turnWrong'):t('turnJudge');
    const controls=q.type==='open'?`<div class="turn-judge-actions">${B('judge',t('correct'),'small',`data-player="${cur.answerer}" data-result="true" data-key-preferred="KeyC" aria-pressed="${judgment===true}"`,'check')}${B('judge',t('wrong'),'small',`data-player="${cur.answerer}" data-result="false" data-key-preferred="KeyV" aria-pressed="${judgment===false}"`,'cross')}</div>`:'';
    return `<section class="turn-review" data-result="${ready?(judgment?'correct':'wrong'):'pending'}" aria-live="polite"><div><p class="turn-review-player">${e(t('answerer',{name}))}${q.type==='choice'?` · ${e(t('selectedAnswer',{option:String.fromCharCode(65+q.options.indexOf(cur.selected))}))}`:''}</p><h2>${e(outcome)}</h2><p>${e(t(ready?'turnConfirmHint':'turnJudgeHint'))}</p>${controls}</div><strong class="turn-review-delta">${delta===null?'—':delta>0?'+'+delta:delta}</strong></section>`;
  }
  function scoredView(q,cur) {
    const h=state.game.history.find(h=>h.key===C.key(state.game.pack.id,q.id)&&!h.voided);
    if(state.game.mode==='turns'){
      const delta=h?.deltas[cur.answerer]||0;
      return `<section class="score-result turn-scored"><h2>${e(t('scored'))}</h2><div class="delta"><span>${e(state.game.players[cur.answerer])}</span><strong class="score-pop">${delta>0?'+':''}${delta}</strong></div></section>`;
    }
    return `<section class="score-result"><h2>${e(t('scored'))}</h2><div class="score-deltas">${(h?.deltas||[]).map((d,i)=>`<span class="delta"><span>${e(state.game.players[i])}</span><strong class="score-pop">${d>0?'+':''}${d}</strong></span>`).join('')}</div></section>`;
  }
  const librarySearchIndex=new WeakMap();
  function searchableQuestion(pack,q){
    let index=librarySearchIndex.get(pack);if(!index){index=new Map(pack.questions.map(item=>[item.id,(item.id+' '+JSON.stringify(item.locales)+' '+JSON.stringify(item.tag||item.tags||'')).toLocaleLowerCase()]));librarySearchIndex.set(pack,index);}
    return index.get(q.id)||'';
  }
  function allLibraryEntries() {
    const pack=getPack(),lib=state.library,hidden=lib.filter==='hidden',query=lib.query.trim().toLocaleLowerCase();
    let entries;
    if(hidden)entries=Object.values(state.hidden).filter(r=>r&&r.packId&&r.questionId).filter(r=>lib.scope==='all'||r.packId===state.activePack).map(r=>({p:packs.find(p=>p.id===r.packId),r,q:packs.find(p=>p.id===r.packId)?.questions.find(q=>q.id===r.questionId)})).sort((a,b)=>(b.r.hiddenAt||'').localeCompare(a.r.hiddenAt||''));
    else entries=available(pack).map(q=>({p:pack,q,r:null}));
    return entries.filter(({p,q,r})=>!query||(q?searchableQuestion(p,q).includes(query):((r?.questionId||'')+' '+JSON.stringify(r?.prompts||{})).toLocaleLowerCase().includes(query)));
  }
  function libraryRow({p,q,r},index) {
    const pid=p?.id||r.packId,id=q?.id||r.questionId,attrs=`data-pack="${e(pid)}" data-qid="${e(id)}"`;
    const base=q?.locales||Object.fromEntries(C.LANGUAGES.map(l=>[l,{prompt:r.prompts?.[l]||t('unavailableQuestion')}]));
    const tag=q?questionTag(q,p):'';
    return `<article class="library-compact-row" data-virtual-index="${index}" style="top:${index*116}px"><div class="library-mini-meta"><span class="tag ${r?'pink':'yellow'}">${e(tag||t('hiddenTitle'))}</span><span class="lib-question-id" title="${e(id)}">${e(id)}</span></div><div class="library-preview-columns">${C.LANGUAGES.map(l=>`<div class="library-preview-text" lang="${l}" title="${e(base[l]?.prompt||'')}">${e(base[l]?.prompt||'')}</div>`).join('')}</div><div class="library-mini-actions">${q?B('inspect',t('inspect'),'small',attrs,'eye'):''}${r?B('restore',t('restore'),'small primary',attrs,'refresh'):B('hide',t('remove'),'small',attrs,'eye')}</div></article>`;
  }
  function libraryView() {
    const pack=getPack(),lib=state.library,hidden=lib.filter==='hidden';
    libraryRows=allLibraryEntries();
    return `<div class="page-top"><div class="row">${B('library-back',t('back'),'small','','back')}<div><h1>${e(t(hidden?'hiddenTitle':'library'))}</h1></div></div><div class="row">${B('import',t('importPack'),'primary small','','upload')}${B('export-pack',t('exportPack'),'small','','download')}</div></div>
      <div class="library-bar">${packPickerButton('library')}<div class="library-tabs"><button data-action="lib-filter" data-filter="active" aria-pressed="${!hidden}">${e(t('active'))}</button><button data-action="lib-filter" data-filter="hidden" aria-pressed="${hidden}">${e(t('hiddenTitle'))}</button></div><input id="library-search" type="search" value="${e(lib.query)}" placeholder="${e(t('filter'))}" aria-label="${e(t('filter'))}" autocomplete="off"></div>
      ${libraryScrollFrame(libraryRows.length?`<div class="library-virtual-space" style="height:${libraryRows.length*116}px"></div>`:`<div class="empty-state library-empty-state"><h2>${e(t('noMatches'))}</h2></div>`)}
      <div class="library-toolbar"><div class="row"><strong>${e(t('searchTotal',{n:libraryRows.length}))}</strong></div><div class="row">${B('export-deletions',t('exportDeletes'),'small','','download')}${B('import-deletions',t('importDeletes'),'small','','upload')}</div></div>`;
  }
  function resultGame(){return state.resultHistoryId?state.resultsHistory.find(item=>item.id===state.resultHistoryId)?.game:state.game;}
  function rememberFinishedGame(){
    const g=state.game;if(!g?.finished||g.current)return;
    if(state.resultsHistory.some(item=>item.id===g.id))return;
    state.resultsHistory=ResultsHistory.upsert(state.resultsHistory,g);persist();
  }
  function resultsView() {
    rememberFinishedGame();const g=resultGame();if(!g){state.view='home';return homeView();}
    const report=window.NeoResultsView.render({game:g,t,e,packTitle,Stats,C,clock:Clock,language:state.lang});
    return report+`<div class="results-controls"><span>${e(packTitle(g.pack))} · ${e(t('roundProgress',{n:activeHistory(g).length,total:g.questionTarget||g.board?.length||0}))}</span><div class="row">${B('home',t('home'),'small','','back')}${B('results-history',t('resultsHistory'),'small','','trophy')}${B('export-results',t('resultsExport'),'small','','download')}${B('replay',t('replay'),'primary small','','refresh')}</div></div>`;
  }
  function findQuestionSource(packId,qid) {
    const gameQ=state.game?.pack.id===packId?state.game.pack.questions.find(q=>q.id===qid):null;
    const catalogQ=packs.find(p=>p.id===packId)?.questions.find(q=>q.id===qid);
    return state.view==='question' ? (gameQ||catalogQ) : (catalogQ||gameQ);
  }
  function findQuestion(packId,qid) {
    const source=findQuestionSource(packId,qid);
    if(!source)return null;
    const level=state.view==='question'&&state.game?.current?.qid===qid ? state.game.current.level : C.levels(source)[0];
    return C.variant(source,level);
  }
  function openModal(model) {
    if(!state.modal)lastFocus=document.activeElement;
    state.modal=model;modalLayer.hidden=false;$('#header').inert=true;main.inert=true;
    renderDialog();
    dialog.querySelector('button,a,input')?.focus({preventScroll:true});
    if(!reduced())dialog.animate([{transform:'translateY(22px)'},{transform:'translateY(0)'}],{duration:180,easing:'ease-out'});
  }

  function closeModal(immediate=false) {
    state.modal=null;const previousFocus=lastFocus;
    const finish=()=>{if(!state.modal){modalLayer.hidden=true;$('#header').inert=false;main.inert=false;if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});syncKeyboard();}};
    if(!immediate&&!reduced()&&!modalLayer.hidden)return dialog.animate([{transform:'translateY(0)'},{transform:'translateY(16px)'}],{duration:110,easing:'ease-in'}).finished.then(finish).catch(finish);
    finish();
  }

  function confirmModal(title,desc,callback,danger=false,confirmLabel='confirm') { openModal({type:'confirm',title,desc,callback,danger,confirmLabel}); }
  function renderDialog() {
    const m=state.modal;if(!m)return;
    let title='',body='',actions='',wide=false;
    if(m.type==='rules') {
      title=t('rules');body=['together','buzz','turns'].map((mode,i)=>`<section class="rules-item" style="background:var(--${['yellow','blue','pink'][i]})"><h3>${e(t(mode))}</h3><p>${e(t('rules'+({together:'Together',buzz:'Buzz',turns:'Turns'}[mode])))}</p></section>`).join('');
    }
    if(m.type==='categories') {
      title=t('categorySelection');const pack=getPack(),groups=Categories.listGroups(pack),selected=new Set(selectedCategories(pack));
      const total=Math.max(1,Math.ceil(groups.length/15));m.page=Math.min(m.page||0,total-1);
      body=`<div class="category-selection-tools">${B('categories-all',t('includeAll'),'small','data-key-preferred="KeyA"','check')}${B('categories-none',t('clearAll'),'small','data-key-preferred="KeyS"','cross')}<strong>${e(t('selectedCategories',{n:selected.size,total:groups.length}))}</strong></div><div class="category-grid">${groups.slice(m.page*15,m.page*15+15).map(group=>`<button type="button" class="category-choice" data-action="category-toggle" data-category="${e(group.id)}" role="checkbox" aria-checked="${selected.has(group.id)}"><span class="category-checkbox" aria-hidden="true">${selected.has(group.id)?icon('check'):''}</span><span>${e(group.labels[state.lang])}<small>${e(t('available',{n:group.questionIds.filter(id=>!isHidden(pack.id,id)).length}))}</small></span></button>`).join('')}</div>`;
      actions=(total>1?modalPages(m,total):'')+B('categories-done',t('confirm'),'primary');
    }
    if(m.type==='history') {
      title=t('resultsHistory');const list=[...state.resultsHistory].reverse();const total=Math.max(1,Math.ceil(list.length/5));m.page=Math.min(m.page||0,total-1);
      body=list.length?`<div class="results-history-list">${list.slice(m.page*5,m.page*5+5).map(item=>`<button class="history-choice" data-action="view-history" data-record="${e(item.id)}"><span><strong>${e(t(item.game.mode))} · ${e(item.game.players.join(' / '))}</strong><small>${e(new Date(item.recordedAt).toLocaleString(state.lang))} · ${e(packTitle(item.game.pack))} · ${e(t('completed',{n:activeHistory(item.game).length}))}</small></span>${icon('arrow')}</button>`).join('')}</div>`:`<p>${e(t('historyEmpty'))}</p>`;
      if(total>1)actions=modalPages(m,total);
    }
    if(m.type==='settings') {
      title=t('settingsTitle');actions=`<a class="btn small" href="README.html#${state.lang.toLowerCase()}" target="_blank" rel="noopener">${icon('help')}${e(t('about'))}</a>`;body=`${[['sfx','effects'],['music','music'],['reduced','motion']].map(([key,label])=>`<div class="setting-row"><strong>${e(t(label))}</strong><button class="toggle" data-action="setting" data-setting="${key}" role="switch" aria-checked="${state.prefs[key]}" aria-label="${e(t(label))}">${e(t(state.prefs[key]?'enabled':'disabled'))}</button></div>`).join('')}<div class="setting-row"><strong>${e(t('hiddenTitle'))}</strong>${B('hidden-library',t('viewRestore'),'small','','eye')}</div>`;
    }
    if(m.type==='hide') {
      const q=findQuestion(m.packId,m.qid);title=t('deleteTitle');body=`<p>${e(t('deleteDesc'))}</p><div class="dialog-question-preview">${q?triplePrompt(q,true):''}</div>`;
      actions=B('close-modal',t('cancel'),'')+B('confirm-hide',t('deleteConfirm'),'danger','','eye');
    }
    if(m.type==='inspect') {
      const source=findQuestionSource(m.packId,m.qid);
      if(!source){closeModal(true);return;}
      const level=C.levels(source).includes(m.level)?m.level:C.levels(source)[0],q=C.variant(source,level);
      wide=true;title=`${q.points} ${t('points')} · ${t(q.type)}`;
      body=`<div class="inspect-formats">${C.levels(source).map(n=>B('inspect-format',`${t(n>4?'open':'choice')} · ${C.variant(source,n).points}`,n===level?'small primary':'small',`data-level="${n}" data-question-type="${n>4?'open':'choice'}" aria-pressed="${n===level}"`)).join('')}</div><section class="question-panel">${triplePrompt(q)}</section>${optionsView(q,null,false,true)}${q.type==='open'?tripleAnswer(q):''}`;
      actions=googleLink(q)+(isHidden(m.packId,m.qid)?B('restore',t('restore'),'primary small',`data-pack="${e(m.packId)}" data-qid="${e(m.qid)}"`,'refresh'):B('hide',t('remove'),'small',`data-pack="${e(m.packId)}" data-qid="${e(m.qid)}"`,'eye'));
    }
    if(m.type==='confirm') {
      title=t(m.title);body=`<p>${e(t(m.desc))}</p>`;actions=B('close-modal',t('cancel'))+B('modal-confirm',t(m.confirmLabel||'confirm'),m.danger?'danger':'primary');
    }
    if(m.type==='error') {
      title=t('importFail');body=`<p>${e(t('importFailDesc'))}</p><div class="error-list">${m.errors.slice((m.page||0)*5,(m.page||0)*5+5).map(error=>`<p><code>${e(error.path)}</code><br>${e(error.key?t(error.key,error.params||{}):(error.message||t('error'+error.code.charAt(0).toUpperCase()+error.code.slice(1))))}</p>`).join('')}</div>`;
    }
    if(m.type==='error'&&m.errors.length>5)actions=modalPages(m,Math.ceil(m.errors.length/5));
    if(m.type==='packs') {
      title=t('choosePack');
      const list=(m.context==='library'&&state.library.filter==='hidden'?[{id:'*',all:true},...packs]:packs);
      const total=Math.max(1,Math.ceil(list.length/6));m.page=Math.min(m.page||0,total-1);
      body=`<div class="pack-choices">${list.slice(m.page*6,m.page*6+6).map(p=>`<button class="pack-choice" data-action="select-pack" data-pack="${e(p.id)}" aria-pressed="${p.all?state.library.scope==='all':p.id===state.activePack&&!(m.context==='library'&&state.library.filter==='hidden'&&state.library.scope==='all')}">${icon('book')}<span><strong>${e(p.all?t('allPacks'):packTitle(p))}</strong><small>${e(p.all?t('hiddenCount',{n:Object.keys(state.hidden).length}):t('available',{n:available(p).length}))}</small></span>${icon('check')}</button>`).join('')}</div>`;
      actions=modalPages(m,total)+B('import',t('importPack'),'small','','upload');
    }
    dialog.className = (wide?'wide ':'')+'modal-'+m.type;
    dialog.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${e(title)}</h2>${B('close-modal','','small icon',`aria-label="${e(t('close'))}"`,'cross')}</div><div class="dialog-body">${body}</div>${actions?`<div class="dialog-actions">${actions}</div>`:''}`;
    layoutFlows(dialog);
    syncKeyboard();
  }
  function modalPages(m,total) {
    return `<div class="row">${B('modal-prev',t('prev'),'small',!(m.page||0)?'disabled':'','back')}<span>${e(t('page',{n:(m.page||0)+1,total}))}</span>${B('modal-next',t('nextPage'),'small',(m.page||0)>=total-1?'disabled':'','arrow')}</div>`;
  }
  function refresh(focusSelector) {
    render();
    if(focusSelector){const el=(state.modal?dialog:document).querySelector(focusSelector);el?.focus({preventScroll:true});}
    if(!reduced()){
      const focusNode=focusSelector?document.querySelector(focusSelector):null;
      const region=focusNode?.closest('.judge-card,.option-row,.answerer-panel,.count-switch') || main;
      region.animate([{transform:'translateY(5px)'},{transform:'translateY(0)'}],{duration:150,easing:'ease-out'});
    }
    persist();
  }
  function setupMode(mode) {
    const commit=()=>go('setup',()=>{state.setup.mode=mode;});
    if(state.game&&!state.game.finished)confirmModal('newGameWarn','newGameDesc',commit,false,'confirmNewGameSetup');else commit();
  }
  async function startGame() {
    const pack=getPack(),count=normalizeRoundChoice(pack,state.setup.questionCount);
    if(count<12){toast(t('needTwelve'));return;}
    const plan=roundPlan(pack,count);
    if(!plan.feasible){toast(t('balanceUnavailable'),7000);return;}
    const players=state.setup.names.slice(0,state.setup.count).map((n,i)=>Names.normalize(n,true)||t('player',{n:i+1}));
    const board=plan.board.map(slot=>({...slot}));
    if(!await retainGamePack(pack))return;
    return go('board',()=>{state.game={rulesVersion:4,id:'game-'+Date.now(),startedAt:new Date().toISOString(),mode:state.setup.mode,players,pack,questionTarget:count,board,seen:[],history:[],current:null,finished:false};setupPlanCache=null;state.resultHistoryId=null;state.boardPage=0;state.boardCursor=null;});
  }
  function pick(qid,level) {
    const g=state.game;
    const tile=g.board.find(x=>x.qid===qid&&x.level===level);
    if(!tile||g.seen.includes(qid)||isHidden(g.pack.id,qid))return;
    const q=C.variant(g.pack.questions.find(x=>x.id===qid),level);
    go('question',()=>{state.boardCursor=qid;state.flowPages={};g.seen.push(q.id);g.current={qid:q.id,level:q.level,phase:'answer',selected:null,answerer:g.mode==='turns'?C.currentPlayer(g):null,judgments:Array(g.players.length).fill(null)};});
  }
  function revealAnswer() {
    const g=state.game,q=currentQ(),cur=g.current;
    if(cur.phase!=='answer')return;
    if(!C.isCollective(g.mode,q)) {
      if(!Number.isInteger(cur.answerer)){toast(t('pickFirst'));return;}
      if(q.type==='choice'&&!cur.selected){toast(t('optionFirst'));return;}
      if(q.type==='choice')cur.judgments[cur.answerer]=cur.selected===q.correctOptionId;
    }
    cur.phase='judge';audio.play('reveal');refresh();

  }
  function commitScore() {
    const g=state.game,cur=g.current,q=currentQ();if(cur.phase!=='judge'||!canCommit())return;
    const deltas=C.scoreQuestion(g.mode,q,cur.judgments,cur.answerer,g.players.length,g.rulesVersion);
    const key=C.key(g.pack.id,q.id),existing=g.history.find(h=>h.key===key);
    const entry={key,qid:q.id,level:q.level,type:q.type,points:q.points,deltas,judgments:clone(cur.judgments),answerer:cur.answerer,selected:cur.selected,scoredAt:new Date().toISOString(),voided:false};
    if(existing)Object.assign(existing,entry);else g.history.push(entry);
    cur.phase='scored';audio.play(deltas.some(n=>n>0)?'correct':'wrong');refresh();

  }
  function retryTurnAnswer(undo=false) {
    const g=state.game,cur=g?.current;
    if(g?.mode!=='turns'||!cur||cur.phase!==(undo?'scored':'judge'))return;
    const entry=g.history.find(h=>h.qid===cur.qid&&!h.voided);
    if(undo&&entry)entry.voided=true;
    // Retain the question and player. A retry must neither advance the turn nor
    // put an already displayed question back on the board.
    cur.phase='answer';cur.selected=null;cur.judgments.fill(null);
    refresh();
  }
  function returnToBoard() {
    const g=state.game;
    if (!g) return go('home');
    state.resultHistoryId=null;const finished=remaining(g).length===0;
    return go(finished?'results':'board',()=>{
      g.current=null;
      if(finished){Clock.finish(g);audio.play('finish');}
    });
  }
  function hideQuestion(packId,qid) {
    const gamePack=state.game?.pack.id===packId?state.game.pack:null, catalogPack=packs.find(p=>p.id===packId);
    const source=state.view==='question'?(gamePack||catalogPack):(catalogPack||gamePack);
    const q=findQuestionSource(packId,qid);
    state.hidden[C.key(packId,qid)]={packId,questionId:qid,hiddenAt:new Date().toISOString(),packTitle:source?.title,prompts:q?Object.fromEntries(C.LANGUAGES.map(l=>[l,q.locales[l].prompt])):undefined};
    const g=state.game;closeModal(true);
    // Hiding affects availability, not scores that were already confirmed.
    if(g&&g.pack.id===packId&&g.current?.qid===qid){g.current=null;if(state.view==='question')returnToBoard();else refresh();}
    else refresh();
    persist();toast(t('deletedToast'));
  }

  function restoreQuestion(packId,qid) {
    delete state.hidden[C.key(packId,qid)];closeModal(true);refresh();toast(t('restored'));
  }
  function downloadJSON(data,name) {
    const blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function retainGamePack(pack) {
    const builtin=builtins.find(p=>p.id===pack.id&&Archive.fingerprint(p)===Archive.fingerprint(pack));
    if(builtin){cachedGamePack=null;return true;}
    storingPack=true;
    try {await window.NeoPackStorage.writeGamePack(pack);cachedGamePack=pack;return true;}
    catch(error){openModal({type:'error',errors:[{path:packTitle(pack),...ImportErrors.resolveImportError(error,'pack')}]});return false;}
    finally{storingPack=false;}
  }
  async function importFiles(files) {
    if(!files.length)return;
    const incoming=[],errors=[];
    for(const f of files) {
      if(f.size>20*1024*1024){errors.push({path:f.name,message:t('fileLarge')});continue;}
      try {
        const p=await ImportErrors.readJsonFile(f);
        const problems=C.validatePack(p);problems.forEach(err=>errors.push({...err,path:`${f.name} / ${err.path}`}));
        if(!problems.length)incoming.push(C.normalizePack(p));
      } catch(err) {console.error(err);errors.push({path:f.name,...ImportErrors.resolveImportError(err,'pack')});}
    }
    const seen=new Set();incoming.forEach(p=>{if(seen.has(p.id))errors.push({path:p.id,code:'duplicate'});seen.add(p.id);});
    if(errors.length){openModal({type:'error',errors});return;}
    const apply=async()=>{
      const candidate=[...imported];
      for(const p of incoming){const i=candidate.findIndex(x=>x.id===p.id),builtin=builtins.find(b=>b.id===p.id);if(builtin&&Archive.fingerprint(builtin)===Archive.fingerprint(p)){if(i>=0)candidate.splice(i,1);continue;}if(i>=0)candidate[i]=p;else candidate.push(p);}
      storingPack=true;
      try{await window.NeoPackStorage.write(candidate);}
      catch(error){openModal({type:'error',errors:[{path:incoming.map(p=>p.id).join(', '),...ImportErrors.resolveImportError(error,'pack')}]});return;}
      finally{storingPack=false;}
      imported.splice(0,imported.length,...candidate);
      packs=[...builtins.filter(p=>!imported.some(x=>x.id===p.id)),...imported];
      state.activePack=incoming[0].id;state.setup.questionCount=normalizeRoundChoice(getPack());refresh();toast(t('importOk',{n:incoming.length}));
    };
    if(incoming.some(p=>packs.some(x=>x.id===p.id)))confirmModal('replacePack','replaceDesc',apply,false,'confirmReplacePacks');else apply();
  }
  async function importDeletions(file) {
    if(!file)return;
    try {
      if(file.size>20*1024*1024)throw ImportErrors.makeError('fileLarge');
      const data=await ImportErrors.readJsonFile(file);
      const records=data.kind==='partyquiz-hidden'?data.hidden:data.kind==='partyquiz-deletions'?data.deleted:null;
      const pattern=/^[A-Za-z0-9._-]{1,120}$/;
      if(data.schemaVersion!==1||!Array.isArray(records)||!records.every(v=>v&&typeof v.packId==='string'&&typeof v.questionId==='string'&&pattern.test(v.packId)&&pattern.test(v.questionId)))throw ImportErrors.makeError('invalidHidden');
      const incoming=Archive.normalizeHidden(Object.fromEntries(records.map(r=>[C.key(r.packId,r.questionId),r])),true);
      state.hidden=Object.assign(Object.create(null),state.hidden,incoming);
      if(state.game?.current&&isHidden(state.game.pack.id,state.game.current.qid))state.game.current=null;
      refresh();toast(t('importedDeletion'));
    }catch(err){console.error(err);openModal({type:'error',errors:[{path:file.name,...ImportErrors.resolveImportError(err,'hidden')}]});}
  }

  async function action(target) {
    if(moving||exportingResults||storingPack)return;
    const a=target.dataset.action,g=state.view==='results'?resultGame():state.game,cur=state.game?.current,q=currentQ();
    if(a==='results-history')return openModal({type:'history',page:0});
    if(a==='view-history'){if(!state.resultsHistory.some(item=>item.id===target.dataset.record))return;state.resultHistoryId=target.dataset.record;closeModal(true);return go('results');}
    if(a==='flow-page'){
      const el=target.closest('[data-flow-group-root]')||target.closest('.flow');
      window.NeoFlowNavigation.step(el,Number(target.dataset.step),{flowData,flowPages:state.flowPages,paintFlow});
      syncKeyboard();return;
    }
    if(a==='categories')return openModal({type:'categories',page:0});
    if(a==='categories-all'||a==='categories-none'){setCategories(a==='categories-all'?undefined:[]);return refresh(`[data-action="${a}"]`);}
    if(a==='category-toggle'){const selected=new Set(selectedCategories());const id=target.dataset.category;selected.has(id)?selected.delete(id):selected.add(id);setCategories([...selected]);return refresh(`[data-category="${id}"]`);}
    if(a==='categories-done')return closeModal();
    if(a==='pack-picker')return openModal({type:'packs',context:target.dataset.context,page:0});
    if(a==='modal-prev'||a==='modal-next'){state.modal.page=(state.modal.page||0)+(a==='modal-prev'?-1:1);return renderDialog();}
    if(a==='select-pack'){
      const m=state.modal;
      if(target.dataset.pack==='*')state.library.scope='all';else{state.activePack=target.dataset.pack;state.library.scope=target.dataset.pack;}
      state.libraryScroll=0;closeModal(true);return refresh();
    }
    if(a==='hidden-library'){
      if(state.view!=='library')state.library.from=state.view;
      state.library.filter='hidden';state.library.scope='all';state.library.query='';state.libraryScroll=0;return go('library');
    }
    if(a==='lang'){state.lang=target.dataset.lang;refresh(`[data-action="lang"][data-lang="${state.lang}"]`);return;}
    if(a==='mode')return setupMode(target.dataset.mode);
    if(a==='count'){state.setup.count=Number(target.dataset.count);return refresh(`[data-action="count"][data-count="${state.setup.count}"]`);}
    if(a==='question-count'){state.setup.questionCount=normalizeRoundChoice(getPack(),normalizeRoundChoice(getPack(),state.setup.questionCount)+Number(target.dataset.delta));return refresh();}
    if(a==='start')return startGame();
    if(a==='rules'||a==='settings')return openModal({type:a});
    if(a==='setting'){const key=target.dataset.setting;state.prefs[key]=!state.prefs[key];audio.configure(state.prefs);return refresh();}
    if(a==='fullscreen') {try {if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast(t('noFullscreen'));}catch(_){toast(t('noFullscreen'));}return;}
    if(a==='home') {if(g&&!g.finished&&['board','question'].includes(state.view))return confirmModal('homeConfirm','homeDesc',()=>go('home'),false,'confirmReturnHome');return go('home');}
    if(a==='resume'){state.resultHistoryId=null;return go(g?.finished?'results':g?.current?'question':'board');}
    if(a==='replay'){const pack=packs.find(p=>p.id===g.pack.id);if(pack)state.activePack=pack.id;state.setup.mode=g.mode;state.setup.count=g.players.length;state.setup.names=[...g.players,...Array(8-g.players.length).fill('')];state.setup.questionCount=normalizeRoundChoice(getPack(),g.questionTarget||g.board.length);return go('setup');}
    if(a==='library'){if(state.view==='library')return;state.library.from=state.view;state.library.filter='active';state.library.query='';state.libraryScroll=0;return go('library');}
    if(a==='library-back'){
      if(g&&(state.library.from==='board'||(state.library.from==='question'&&!g.current)))return returnToBoard();
      return go(state.library.from);
    }
    if(a==='lib-filter'){state.library.filter=target.dataset.filter;state.library.scope='all';state.libraryScroll=0;return refresh();}
    
    
    if(a==='board-prev'||a==='board-next') {
      const pages=Math.max(1,Math.ceil(g.board.filter(b=>!isHidden(g.pack.id,b.qid)).length/BOARD_PAGE_SIZE));
      state.boardPage=Math.max(0,Math.min(pages-1,state.boardPage+(a==='board-next'?1:-1)));state.boardCursor=null;
      refresh(`[data-action=\"${a}\"]`);return;
    }
    if(a==='pick')return pick(target.dataset.qid,Number(target.dataset.level));
    if(a==='question-back') {if(cur?.phase==='scored')return returnToBoard();const recorded=g.history.some(h=>h.qid===cur?.qid&&!h.voided);return confirmModal(recorded?'discardEdit':'discard',recorded?'discardEditDesc':'discardDesc',()=>returnToBoard(),false,recorded?'confirmDiscardChanges':'confirmSkipQuestion');}
    if(a==='answerer'&&cur?.phase==='answer'&&C.isRace(g.mode,q)){if(cur.answerer===Number(target.dataset.player))return;cur.answerer=Number(target.dataset.player);cur.selected=null;cur.judgments.fill(null);return refresh(`[data-action="answerer"][data-player="${cur.answerer}"]`);}
    if(a==='option'&&cur?.phase==='answer'&&!C.isCollective(g.mode,q)&&Number.isInteger(cur.answerer)&&q.options.includes(target.dataset.option)){cur.selected=target.dataset.option;return refresh(`.option-index[data-option="${cur.selected}"]`);}
    if(a==='reveal')return revealAnswer();
    if(a==='judge-all'&&cur?.phase==='judge'&&C.isCollective(g.mode,q)){for(const i of targets())cur.judgments[i]=target.dataset.result==='true';return refresh(`[data-action="judge-all"][data-result="${target.dataset.result}"]`);}
    if(a==='judge'&&cur?.phase==='judge'){const i=Number(target.dataset.player);if(!targets().includes(i))return;cur.judgments[i]=target.dataset.result==='true';return refresh(`[data-action="judge"][data-player="${i}"][data-result="${target.dataset.result}"]`);}
    if(a==='commit')return commitScore();
    if(a==='retry-answer')return retryTurnAnswer();
    if(a==='undo-score')return retryTurnAnswer(true);
    if(a==='edit'&&cur?.phase==='scored'){cur.phase='judge';refresh();return;}
    if(a==='next')return returnToBoard();
    if(a==='finish')return confirmModal('finishTitle','finishDesc',()=>go('results',()=>{Clock.finish(g);g.current=null;state.resultHistoryId=null;audio.play('finish');}),false,'confirmFinishGame');
    if(a==='hide'||a==='inspect')return openModal({type:a,packId:target.dataset.pack,qid:target.dataset.qid});
    if(a==='inspect-format'&&state.modal?.type==='inspect'){state.modal.level=Number(target.dataset.level);return renderDialog();}
    if(a==='confirm-hide'){const m=state.modal;return hideQuestion(m.packId,m.qid);}
    if(a==='restore')return restoreQuestion(target.dataset.pack,target.dataset.qid);
    if(a==='close-modal')return closeModal();
    if(a==='modal-confirm'){const cb=state.modal.callback;closeModal(true);return cb();}
    if(a==='import'){$('#pack-input').click();return;}
    if(a==='export-pack'){const p=clone(getPack());return downloadJSON(p,builtins.some(b=>b.id===p.id)?'question-bank.json':p.id+'.json');}
    if(a==='export-deletions')return downloadJSON({schemaVersion:1,kind:'partyquiz-hidden',exportedAt:new Date().toISOString(),hidden:Object.values(state.hidden)},'question-hidden.json');
    if(a==='import-deletions'){$('#deletions-input').click();return;}
    if(a==='export-save'){
      if(!state.game){toast(t('noGameSave'));return;}
      return downloadJSON(Archive.exportSave({game:state.game,lang:state.lang,prefs:state.prefs,hidden:state.hidden,activePack:state.activePack,setup:state.setup,resultsHistory:state.resultsHistory}),`quiz-party-save-${Date.now()}.json`);
    }
    if(a==='import-save'){$('#save-input').click();return;}
    if(a==='export-results'){
      exportingResults=true;
      try{await window.NeoResultsExport.downloadElementPng($('#game-stage'),`quiz-party-results-${Date.now()}.png`);}
      catch(err){console.error(err);toast(t('resultsExportFailed'),6000);}
      finally{exportingResults=false;}return;
    }
  }
  async function importSaveFile(file) {
    if(!file)return;
    try {
      if(file.size>32*1024*1024)throw ImportErrors.makeError('saveFileLarge');
      const saved=await ImportErrors.readJsonFile(file);
      const checked=Archive.inspectSave(saved,packs,C);
      const apply=async()=>{
        if(!await retainGamePack(checked.game.pack))return;
        state.game=checked.game;
        state.game.pack=packs.find(p=>p.id===checked.game.pack.id)||checked.game.pack;state.lang=checked.lang;state.resultHistoryId=null;
        const merged=new Map(state.resultsHistory.map(item=>[item.id,item]));for(const item of checked.resultsHistory)merged.set(item.id,item);state.resultsHistory=[...merged.values()];
        state.prefs={sfx:checked.prefs.sfx!==false,music:checked.prefs.music===true,reduced:checked.prefs.reduced===true};
        state.hidden=checked.hidden;state.activePack=checked.activePack;
        if(checked.setup){state.setup={mode:C.MODES.includes(checked.setup.mode)?checked.setup.mode:checked.game.mode,count:checked.game.players.length,names:checked.game.players.concat(Array(8).fill('')).slice(0,8).map(n=>Names.normalize(n)),tagFilter:checked.setup.tagFilter};}
        state.setup.questionCount=normalizeRoundChoice(getPack(),checked.setup?.questionCount||checked.game.questionTarget||checked.game.board.length);
        state.boardPage=0;state.boardCursor=null;state.libraryScroll=0;state.flowPages={};
        closeModal(true);go(state.game.finished?'results':state.game.current?'question':'board');persist();toast(t('saveImported'));
      };
      confirmModal('loadSaveConfirm','loadSaveDesc',apply,false,'confirmLoadSave');
    } catch(err) {console.error(err);openModal({type:'error',errors:[{path:file.name,...ImportErrors.resolveImportError(err,'save')}]});}
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-action]');
    audio.unlock();
    if(!target||target.disabled)return;
    if(target.dataset.action==='option'&&event.detail!==0&&!window.getSelection()?.isCollapsed)return;
    event.preventDefault();audio.play('click');
    Promise.resolve(action(target)).catch(err=>{console.error(err);toast(t('actionFailed'),6000);});
  });
  document.addEventListener('pointerover',event=>{
    const target=event.target.closest('button:not(:disabled),a.btn');
    if(target&&!target.contains(event.relatedTarget))audio.play('hover');
    updateBoardPointer(event);
  });
  function updateBoardPointer(event){
    if(state.view!=='board'||state.modal||moving)return;
    const tile=event.target.closest?.('.board-question-tile');
    if(tile&&!tile.disabled&&tile.dataset.qid!==state.boardCursor){state.boardCursor=tile.dataset.qid;paintBoardSelection();}
  }
  document.addEventListener('focusin',updateBoardPointer);
  document.addEventListener('input',event=>{
    const target=event.target;
    if(target.dataset.name!==undefined&&!event.isComposing)updatePlayerName(target);
    if(target.id==='library-search'){
      state.library.query=target.value;state.libraryScroll=0;
      const caret=target.selectionStart;refresh('#library-search');const input=$('#library-search');try{input.setSelectionRange(caret,caret);}catch(_){}
    }
  });
  function updatePlayerName(input) {
    const value=Names.normalize(input.value);
    if(input.value!==value)input.value=value;
    state.setup.names[Number(input.dataset.name)]=value;
  }
  document.addEventListener('compositionend',event=>{
    if(event.target.dataset.name!==undefined)updatePlayerName(event.target);
  });
  $('#save-input').addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';importSaveFile(file);});
  $('#pack-input').addEventListener('change',event=>{const files=[...event.target.files];event.target.value='';importFiles(files);});
  $('#deletions-input').addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';importDeletions(file);});
  document.addEventListener('keydown',event=>{
    if(event.key==='Tab'&&state.modal){
      const nodes=[...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
      const first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last?.focus();}
      if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first?.focus();}
    }
  });
  function resizeStage() {
    const w=window.innerWidth,h=window.innerHeight,scale=Math.min(w/1920,h/1080);
    const stage=$('#game-stage');stage.style.transform=`translate(-50%, -50%) scale(${scale})`;
    stage.dataset.scale=String(scale);
    syncKeyboard();
  }
  window.addEventListener('resize',resizeStage);
  window.addEventListener('storage',event=>{
    if(event.key!==HIDDEN_STORAGE)return;
    try{
      const value=JSON.parse(event.newValue||'{}');if(!value||Array.isArray(value)||typeof value!=='object')return;
      state.hidden=Archive.normalizeHidden(value);
      if(state.game?.current&&isHidden(state.game.pack.id,state.game.current.qid))state.game.current=null;
      render();
    }catch(_){}
  });
  document.fonts.addEventListener('loadingdone',()=>{flowCache.clear();layoutFlows(main);if(state.modal)layoutFlows(dialog);syncKeyboard();});
  resizeStage();
  window.addEventListener('pagehide',persist);
  document.addEventListener('fullscreenchange',()=>{header();syncKeyboard();});
  rememberFinishedGame();
  render();
})();
