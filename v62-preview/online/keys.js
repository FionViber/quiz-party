(function (root) {
  'use strict';
  const fixed = {
    home: 'KeyQ',
    language: 'KeyW',
    settings: 'KeyE',
    unlock: 'KeyR',
    fullscreen: 'KeyT'
  };
  const preferred = {
    home: 'Escape',
    offline: 'Digit1',
    online: 'Digit2',
    join: 'Digit1',
    create: 'Digit2',
    back: 'Escape',
    ready: 'KeyY',
    'host-start': 'KeyS',
    'host-begin': 'KeyS',
    'host-cancel-selection': 'Escape',
    'host-confirm-score': 'Enter',
    'host-void': 'KeyD',
    pass: 'KeyP',
    'show-scores': 'KeyG',
    'back-to-room': 'Escape',
    'host-finish': 'KeyX',
    'host-next': 'KeyN',
    'host-review-answer': 'KeyZ',
    'host-all-correct': 'KeyA',
    'host-all-wrong': 'KeyS',
    'all-correct': 'KeyA',
    'all-wrong': 'KeyS',
    submit: 'Enter',
    'submit-votes': 'KeyV',
    'host-close-grading': 'KeyC',
    'host-close-selection': 'KeyC',
    leave: 'KeyL',
    'oral-mark': 'KeyA',
    'oral-skip': 'KeyK',
    'export-results': 'KeyD',
    'admin-create-submit': 'Enter',
    'join-submit': 'Enter',
    'all-categories': 'KeyA',
    'clear-categories': 'KeyS',
    'close-dialog': 'Escape',
    'cancel-dialog': 'Escape',
    'confirm-dialog': 'Enter',
    'unlock-submit': 'Enter'
  };
  const symbols = {
    BracketLeft: '[',
    BracketRight: ']',
    Minus: '-',
    Equal: '=',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    Backslash: '\\',
    Backquote: '`',
    Escape: 'Esc'
  };
  const pool = [
    ...Array.from({ length: 10 }, (_, i) => 'Digit' + ((i + 1) % 10)),
    ...Array.from({ length: 26 }, (_, i) => 'Key' + String.fromCharCode(65 + i)),
    ...Object.keys(symbols).filter((k) => k !== 'Escape')
  ];
  const label = (code) => symbols[code] || code.replace(/^Key|^Digit/, '');
  const memory = new Map(),
    pressed = new Set();
  let current = null,
    byKey = new Map(),
    selectedTile = null,
    pointerPosition = null;
  function modality(value) {
    if (document.documentElement) document.documentElement.dataset.input = value;
  }
  function identity(el, index) {
    const d = el.dataset;
    return (
      [
        d.qpa || el.id || 'field',
        d.answer || d.player || d.option || d.qpc || d.record || d.tile || '',
        d.correct ?? d.step ?? d.page ?? ''
      ].join(':') + (d.qpa || el.id || d.qpc ? '' : ':' + index)
    );
  }
  function visible(el) {
    return !el.hidden && !el.closest('[hidden],[inert]') && el.getClientRects().length > 0;
  }
  function hint(el, code) {
    const kbd = document.createElement('kbd');
    kbd.dataset.qpKeyHint = 'true';
    kbd.textContent = label(code);
    kbd.setAttribute('aria-hidden', 'true');
    if (el.matches('input[type="checkbox"]') && el.closest('label')) {
      kbd.className = 'qp-field-key';
      el.closest('label').append(kbd);
    } else if (el.matches('input,select')) {
      kbd.className = 'qp-field-key';
      el.insertAdjacentElement('afterend', kbd);
    } else el.append(kbd);
    el.dataset.qpKey = code;
    el.setAttribute('aria-keyshortcuts', label(code));
  }
  function paintBoard() {
    if (!current) return;
    const tiles = [...current.root.querySelectorAll('.qp-tile:not(:disabled)')];
    if (!tiles.some((t) => t.dataset.tile === selectedTile))
      selectedTile = tiles[0]?.dataset.tile || null;
    for (const tile of current.root.querySelectorAll('.qp-tile')) {
      const selected = !tile.disabled && tile.dataset.tile === selectedTile;
      tile.classList.toggle('qp-key-selected', selected);
      tile.setAttribute('aria-pressed', String(selected));
      tile.tabIndex = selected ? 0 : -1;
      if (selected) tile.setAttribute('aria-keyshortcuts', 'Enter');
      else tile.removeAttribute('aria-keyshortcuts');
    }
  }
  function refresh(options) {
    current = options;
    byKey = new Map();
    const scope = options.root;
    for (const node of scope.querySelectorAll('kbd')) node.remove();
    const buttons = [
      ...scope.querySelectorAll('button,a[href],input[type="checkbox"],select')
    ].filter(visible);
    const used = new Set(Object.values(fixed)),
      reserved = new Set(
        options.reserveAnswers ? Array.from({ length: 6 }, (_, i) => 'Digit' + (i + 1)) : []
      );
    const sticky = memory.get(options.context) || new Map();
    memory.set(options.context, sticky);
    if (memory.size > 20) memory.delete(memory.keys().next().value);
    const bind = (el, code) => {
      used.add(code);
      byKey.set(code, el);
      hint(el, code);
    };
    const fixedSeen = new Set();
    const descriptors = buttons.map((el, index) => {
      const action = el.dataset.qpa,
        semantic = identity(el, index);
      const fixedCode = fixed[action] && !fixedSeen.has(action) ? fixed[action] : null;
      if (fixedCode) fixedSeen.add(action);
      const n = Number(el.dataset.optionIndex);
      const optionCode = action === 'option' && n >= 1 && n <= 6 ? 'Digit' + n : null;
      return { el, action, semantic, fixedCode, optionCode };
    });
    const held = new Map();
    for (const d of descriptors) {
      const code = d.optionCode || (!d.fixedCode ? sticky.get(d.semantic) : null);
      if (code && !used.has(code) && (!reserved.has(code) || d.optionCode) && !held.has(code))
        held.set(code, d.semantic);
    }
    const available = (code, semantic) =>
      code &&
      !used.has(code) &&
      !reserved.has(code) &&
      (!held.has(code) || held.get(code) === semantic);
    descriptors.forEach(({ el, action, semantic, fixedCode, optionCode }) => {
      if (el.matches('.qp-tile')) return;
      if (fixedCode) {
        bind(el, fixedCode);
        return;
      }
      if (optionCode && !byKey.has(optionCode)) {
        bind(el, optionCode);
        return;
      }
      const proposed = sticky.get(semantic) || preferred[action];
      const code = available(proposed, semantic)
        ? proposed
        : pool.find((k) => available(k, semantic));
      if (code) {
        sticky.set(semantic, code);
        bind(el, code);
      }
    });
    paintBoard();
  }
  function boardKey(event) {
    if (
      !current?.board ||
      !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(event.code)
    )
      return false;
    const tiles = [...current.root.querySelectorAll('.qp-tile:not(:disabled)')];
    if (!tiles.length) return false;
    if (
      event.code === 'Enter' &&
      event.target.closest('button,a') &&
      !event.target.matches('.qp-tile')
    )
      return false;
    const tile = tiles.find((t) => t.dataset.tile === selectedTile) || tiles[0];
    event.preventDefault();
    if (event.code === 'Enter') {
      tile.click();
      return true;
    }
    const rect = tile.getBoundingClientRect(),
      x = rect.x + rect.width / 2,
      y = rect.y + rect.height / 2;
    const horizontal = event.code === 'ArrowLeft' || event.code === 'ArrowRight',
      sign = ['ArrowLeft', 'ArrowUp'].includes(event.code) ? -1 : 1;
    const matches = tiles
      .filter((t) => t !== tile)
      .map((t) => {
        const r = t.getBoundingClientRect(),
          dx = r.x + r.width / 2 - x,
          dy = r.y + r.height / 2 - y;
        return {
          t,
          forward: (horizontal ? dx : dy) * sign,
          across: Math.abs(horizontal ? dy : dx)
        };
      })
      .filter((v) => v.forward > 5);
    matches.sort((a, b) => a.across - b.across || a.forward - b.forward);
    if (matches.length) {
      selectedTile = matches[0].t.dataset.tile;
      paintBoard();
      matches[0].t.focus({ preventScroll: true });
      matches[0].t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    return true;
  }
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Tab') modality('keyboard');
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing)
      return;
    if (event.repeat || pressed.has(event.code)) {
      if (byKey.has(event.code) || event.code.startsWith('Arrow')) event.preventDefault();
      return;
    }
    pressed.add(event.code);
    if (
      !current ||
      !current.root.isConnected ||
      (document.querySelector('dialog[open]') && !current.root.matches('dialog'))
    )
      return;
    if (
      event.target.matches('input:not([type="checkbox"]),textarea,select,[contenteditable="true"]')
    ) {
      if (event.code === 'Escape' && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        event.target.blur();
        modality('keyboard');
      }
      return;
    }
    modality('keyboard');
    if (boardKey(event)) return;
    const target = byKey.get(event.code);
    if (!target || target.disabled || !visible(target)) return;
    event.preventDefault();
    if (target.matches('select')) target.focus();
    else target.click();
  });
  document.addEventListener('keyup', (event) => pressed.delete(event.code));
  root.addEventListener('blur', () => pressed.clear());
  document.addEventListener('pointermove', (event) => {
    if (
      pointerPosition &&
      pointerPosition.x === event.clientX &&
      pointerPosition.y === event.clientY
    )
      return;
    pointerPosition = { x: event.clientX, y: event.clientY };
    modality('pointer');
    const tile = event.target.closest('.qp-tile:not(:disabled)');
    if (tile && current?.root.contains(tile) && selectedTile !== tile.dataset.tile) {
      selectedTile = tile.dataset.tile;
      paintBoard();
    }
  });
  root.QuizKeys = Object.freeze({ refresh, clearPressed: () => pressed.clear() });
})(window);
