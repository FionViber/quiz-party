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
