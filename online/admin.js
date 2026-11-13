(function (root) {
  'use strict';
  const escape = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const button = (action, label, disabled = false, style = '') =>
    '<button type="button" class="qp-btn ' +
    style +
    '" data-qpa="' +
    action +
    '"' +
    (disabled ? ' disabled' : '') +
    '>' +
    escape(label) +
    '</button>';
  function select(id, label, values, current) {
    return (
      '<label class="qp-label" for="' +
      id +
      '">' +
      escape(label) +
      '</label><select class="qp-field" id="' +
      id +
      '">' +
      values
        .map(
          ([value, text]) =>
            '<option value="' +
            value +
            '"' +
            (String(current) === String(value) ? ' selected' : '') +
            '>' +
            escape(text) +
            '</option>'
        )
        .join('') +
      '</select>'
    );
  }
  function createView({ t, lang, draft, categories }) {
    const d = draft;
    return (
      '<section class="qp-card"><h1>' +
      escape(t('create')) +
      '</h1><form data-qpf="admin-create" class="qp-create-form">' +
      '<label class="qp-label" for="qp-host-name">' +
      escape(t('nickname')) +
      '</label><input class="qp-field" id="qp-host-name" maxlength="120" value="' +
      escape(d.name) +
      '" required>' +
      '<label class="qp-player qp-host-choice"><span>' +
      escape(t('hostPlays')) +
      '</span><input type="checkbox" id="qp-host-plays"' +
      (d.hostPlays ? ' checked' : '') +
      '></label>' +
      '<div class="qp-grid three"><div>' +
      select(
        'qp-selection',
        t('selection'),
        [
          ['host', t('hostSelect')],
          ['vote', t('voteSelect')]
        ],
        d.selection
      ) +
      '</div>' +
      '<div>' +
      select(
        'qp-seconds',
        t('answerTime'),
        [30, 60, 120].map((n) => [n, n + ' ' + t('seconds')]),
        d.answerSeconds
      ) +
      '</div>' +
      '<div>' +
      select(
        'qp-count',
        t('questionCount'),
        [12, 24, 36, 48, 60, 72, 84, 96].map((n) => [n, n]),
        d.questionCount
      ) +
      '</div></div>' +
      '<div class="qp-grid two"><div>' +
      select(
        'qp-open',
        t('openResponse'),
        [
          ['text', t('text')],
          ['oral', t('oral')]
        ],
        d.openResponse
      ) +
      '</div>' +
      '<div>' +
      select(
        'qp-grading',
        t('grading'),
        [
          ['host', t('hostGrading')],
          ['vote', t('voteGrading')]
        ],
        d.grading
      ) +
      '</div></div>' +
      '<fieldset class="qp-category-fieldset"><legend>' +
      escape(t('categories')) +
      '</legend><div class="qp-btn-row">' +
      button('all-categories', t('all')) +
      button('clear-categories', t('clear')) +
      '</div>' +
      '<div class="qp-category-list">' +
      categories
        .map(
          (c) =>
            '<label class="qp-category"><input type="checkbox" data-qpc="' +
            escape(c.id) +
            '"' +
            (d.categories === undefined || d.categories.includes(c.id) ? ' checked' : '') +
            '><span>' +
            escape(c.labels?.[lang] || c.name?.[lang] || c.id) +
            '</span></label>'
        )
        .join('') +
      '</div></fieldset>' +
      '<div class="qp-btn-row">' +
      button('back', t('cancel')) +
      button('admin-create-submit', t('create'), false, 'primary') +
      '</div></form></section>'
    );
  }
  function hostControls({ state, t }) {
    if (!state.viewer?.isHost) return '';
    const phase = state.phase;
    if (phase === 'lobby')
      return button(
        'host-start',
        t('start'),
        state.players.length < 2 || state.players.some((p) => !p.ready || !p.online),
        'primary'
      );
    if (phase === 'finished') return '';
    let result = '';
    if (phase === 'selecting' && state.settings.selection === 'vote')
      result += button('host-close-selection', t('closeSelection'), false, 'primary');
    if (phase === 'grading' && state.settings.grading === 'host')
      result +=
        button('host-all-correct', t('allCorrect')) + button('host-all-wrong', t('allWrong'));
    if (phase === 'grading')
      result += button('host-close-grading', t('closeGrading'), false, 'primary');
    if (phase === 'results') {
      result += button('host-next', t('next'), false, 'primary');
      if (state.current?.type === 'open') result += button('host-reopen', t('reopenGrading'));
    }
    return result + button('host-finish', t('finish'), false, 'danger');
  }
  function handleAction(action, element, app) {
    if (action === 'host-all-correct' || action === 'host-all-wrong')
      return app.send('judgeAll', { correct: action === 'host-all-correct' });
    const commands = {
      'host-start': 'start',
      'host-close-selection': 'closeSelection',
      'host-close-grading': 'closeGrading',
      'host-next': 'next',
      'host-finish': 'finish',
      'host-reopen': 'reopenGrading'
    };
    if (commands[action]) return app.send(commands[action]);
  }
  root.QuizAdmin = Object.freeze({ createView, hostControls, handleAction });
})(window);
