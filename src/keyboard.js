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
