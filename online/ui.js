(function (root) {
  'use strict';
  const languages = ['en', 'zh-Hans', 'zh-Hant'],
    languageNames = { en: 'English', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文' };
  const escape = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const localized = (value, language) =>
    typeof value === 'string' ? value : value?.[language] || value?.en || '';
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function create(shell, app) {
    const main = shell.querySelector('[data-qp-root]') || shell;
    let language = 'zh-Hans',
      room = null,
      view = 'entry',
      connectionStatus = { code: 'idle', error: false },
      notice = null,
      busy = false,
      composing = false,
      renderedScreen = null;
    let answerDraft = '',
      selectedOption = null,
      ballot = new Map(),
      gradePage = 0,
      historyPage = 0,
      archiveRoom = null;
    let timer = null,
      clockSync = { server: 0, client: 0 },
      joinDraft = { code: '', name: '' },
      joinAttempt = null;
    const setup = {
      name: '',
      hostPlays: false,
      selection: 'host',
      answerSeconds: 60,
      questionCount: 24,
      openResponse: 'text',
      grading: 'host',
      categories: undefined
    };
    const t = (key, params) => root.QuizI18n.make(language)(key, params);
    const name = (id) =>
      room?.players.find((p) => p.id === id)?.name || room?.hostName || t('host');
    const q = (selector) => shell.querySelector(selector);
    function button(action, label, data = {}, style = '') {
      const focusData = Object.fromEntries(
        Object.entries(data).filter(([key]) => key !== 'disabled' && !key.startsWith('aria-'))
      );
      const attrs = Object.entries(data)
        .map(([key, value]) => {
          if (key === 'disabled') return value ? ' disabled' : '';
          if (key.startsWith('aria-')) return ' ' + key + '="' + escape(value) + '"';
          return (
            ' data-' +
            key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) +
            '="' +
            escape(value) +
            '"'
          );
        })
        .join('');
      return (
        '<button type="button" class="qp-btn ' +
        style +
        '" data-qpa="' +
        action +
        '" data-focus-key="' +
        escape(action + ':' + JSON.stringify(focusData)) +
        '"' +
        attrs +
        '>' +
        escape(label) +
        '</button>'
      );
    }
    function controls() {
      return room?.viewer?.isHost
        ? app.getAdminHostControls?.({ state: room, t, lang: language }) || ''
        : '';
    }
    function pageControls(page, total, action) {
      if (total <= 1) return '';
      return (
        '<div class="qp-pager">' +
        button(action, t('previous'), { step: -1, disabled: page === 0 }, 'small') +
        '<span>' +
        escape(t('page', { n: page + 1, total })) +
        '</span>' +
        button(action, t('nextPage'), { step: 1, disabled: page >= total - 1 }, 'small') +
        '</div>'
      );
    }
    function entry() {
      const unlocked = app.isAdmin(),
        session = app.isLocalFile?.() ? null : app.getSession?.();
      return (
        '<section class="qp-card"><p class="qp-muted">' +
        escape(t('brand')) +
        '</p><h1>' +
        escape(t('chooseMode')) +
        '</h1><p>' +
        escape(t('chooseModeNote')) +
        '</p>' +
        '<div class="qp-grid two qp-modes"><article class="qp-card qp-mode-card offline"><h2>' +
        escape(t('offline')) +
        '</h2><p>' +
        escape(t('offlineNote')) +
        (unlocked
          ? ''
          : '<br><strong class="qp-lock-note">🔒 ' + escape(t('adminNeeded')) + '</strong>') +
        '</p>' +
        button('offline', t(unlocked ? 'continue' : 'unlockAndPlay')) +
        '</article><article class="qp-card qp-mode-card online"><h2>' +
        escape(t('online')) +
        '</h2><p>' +
        escape(t('joinOrCreate')) +
        '</p>' +
        button('online', t(app.isLocalFile?.() ? 'openOnlineSite' : 'enter')) +
        '</article></div><div class="qp-btn-row qp-bottom-actions">' +
        (session ? button('resume', t('resumeRoom', { code: session.code }), {}, 'primary') : '') +
        button('history', t('history')) +
        '</div></section>'
      );
    }
    function onlineEntry() {
      return (
        '<section class="qp-card"><h1>' +
        escape(t('online')) +
        '</h1><p>' +
        escape(t('joinOrCreate')) +
        '</p><div class="qp-grid two qp-modes">' +
        '<article class="qp-card qp-mode-card join"><h2>' +
        escape(t('join')) +
        '</h2><p>' +
        escape(t('joinHint')) +
        '</p>' +
        button('join', t('enter')) +
        '</article>' +
        '<article class="qp-card qp-mode-card online"><h2>' +
        escape(t('create')) +
        '</h2><p>' +
        escape(t(app.isAdmin() ? 'createHint' : 'adminNeeded')) +
        '</p>' +
        button('create', t(app.isAdmin() ? 'create' : 'unlock')) +
        '</article></div>' +
        '<div class="qp-bottom-actions">' +
        button('back', t('back')) +
        '</div></section>'
      );
    }
    function joinView() {
      return (
        '<section class="qp-card qp-form-card"><h1>' +
        escape(t('join')) +
        '</h1><form data-qpf="join">' +
        '<label class="qp-label" for="qp-join-code">' +
        escape(t('roomCode')) +
        '</label><input class="qp-field code" id="qp-join-code" inputmode="numeric" maxlength="6" autocomplete="off" value="' +
        escape(joinDraft.code) +
        '" required>' +
        '<label class="qp-label" for="qp-join-name">' +
        escape(t('nickname')) +
        '</label><input class="qp-field" id="qp-join-name" maxlength="120" autocomplete="nickname" value="' +
        escape(joinDraft.name) +
        '" required>' +
        '<p class="qp-muted">' +
        escape(t('nameLimit')) +
        '</p><div class="qp-btn-row">' +
        button('back', t('cancel')) +
        button('join-submit', t('enter'), { disabled: busy }, 'primary') +
        '</div></form></section>'
      );
    }
    function lobby() {
      const me = room.players.find((p) => p.id === room.viewer.id);
      const count = room.players.length;
      const planned = room.settings.openResponse === 'oral' && count >= 2
        ? Math.floor(room.settings.questionCount / count) * count : room.settings.questionCount;
      return (
        '<section class="qp-stage"><div class="qp-stage-top"><div><p class="qp-muted">' +
        escape(t('lobby')) +
        '</p><h1>' +
        escape(room.code) +
        '</h1></div>' +
        '<div class="qp-btn-row">' +
        button('copy-code', t('copyCode')) +
        button('home', t('returnHome')) +
        '</div></div>' +
        '<div class="qp-grid two"><article class="qp-card"><h2>' +
        escape(t('roomSettings')) +
        '</h2><dl class="qp-setting-summary">' +
        [
          ['host', room.hostName || t('host')],
          [
            'selection',
            t(
              room.settings.selection === 'turn'
                ? 'turnSelect'
                : room.settings.selection === 'vote'
                  ? 'voteSelect'
                  : 'hostSelect'
            )
          ],
          ['answerTime', room.settings.answerSeconds + ' ' + t('seconds')],
          ['questionCount', room.settings.openResponse === 'oral' && count >= 2 ? t('turnQuestionCount', { total: planned, each: planned / count }) : planned],
          ['openResponse', t(room.settings.openResponse === 'oral' ? 'oral' : 'text')],
          ['grading', t(room.settings.grading === 'vote' ? 'voteGrading' : 'hostGrading')]
        ]
          .map(
            ([label, value]) => '<dt>' + escape(t(label)) + '</dt><dd>' + escape(value) + '</dd>'
          )
          .join('') +
        '</dl>' +
        '<p>' +
        escape(t('readyHint')) +
        '</p><div class="qp-btn-row">' +
        (me
          ? button('ready', t(me.ready ? 'cancelReady' : 'ready'), {}, me.ready ? '' : 'primary')
          : '') +
        controls() +
        '</div></article>' +
        '<article class="qp-card"><h2>' +
        escape(t('players')) +
        ' <small>' +
        room.players.length +
        '/' +
        (room.playerLimit || (room.settings.openResponse === 'oral' ? 8 : 32)) +
        '</small></h2><ul class="qp-player-list">' +
        room.players
          .map(
            (p) =>
              '<li class="qp-player ' +
              (p.id === room.viewer.id ? 'me' : '') +
              '"><span><strong>' +
              escape(p.name) +
              '</strong><small>' +
              escape(t(!p.online ? 'disconnected' : p.ready ? 'ready' : 'notReady')) +
              '</small></span>' +
              (room.viewer.isHost && p.id !== room.hostId
                ? button('kick', t('removePlayer'), { player: p.id }, 'small')
                : '') +
              '</li>'
          )
          .join('') +
        '</ul></article></div></section>'
      );
    }
    function board() {
      const voting = room.settings.selection === 'vote',
        hasVotes = room.board.some((tile) => tile.votes > 0);
      const canVote = voting && !room.selectionClosed && room.viewer.isPlayer;
      const canSelect =
        (room.viewer.isHost ||
          (room.settings.selection === 'turn' && room.viewer.id === room.turnPlayerId)) &&
        (!voting || (room.selectionClosed && !hasVotes));
      return (
        '<section class="qp-stage"><div class="qp-stage-top"><div><h1>' +
        escape(t(voting ? 'voteQuestion' : 'chooseQuestion')) +
        '</h1><p>' +
        escape(
          t(
            voting
              ? room.selectionClosed
                ? 'votesClosed'
                : 'voteQuestionHint'
              : room.settings.selection === 'turn'
                ? 'turnQuestionHint'
                : 'hostQuestionHint',
            { name: name(room.turnPlayerId) }
          )
        ) +
        '</p></div>' +
        (room.selectionDeadlineAt
          ? '<strong class="qp-timer" data-deadline="' + room.selectionDeadlineAt + '"></strong>'
          : '') +
        '<div class="qp-btn-row">' +
        controls() +
        '</div></div>' +
        '<div class="qp-board">' +
        room.board
          .map(
            (tile) =>
              '<button type="button" class="qp-tile ' +
              (tile.used ? 'used' : '') +
              '" data-qpa="tile" data-type="' +
              tile.type +
              '" data-tile="' +
              tile.id +
              '"' +
              (tile.used || !(canVote || canSelect) ? ' disabled' : '') +
              '>' +
              '<strong class="qp-tile-title">' +
              tile.points +
              ' <small>' +
              escape(t('points')) +
              '</small></strong><span class="qp-tile-tags"><span>' +
              escape(t(tile.type === 'choice' ? 'choiceType' : 'openType')) +
              '</span><span>' +
              escape(t(room.settings.openResponse === 'oral' ? 'turnParticipation' : 'everyone')) +
              '</span></span>' +
              '<span class="qp-tile-category">' +
              escape(localized(tile.tag, language)) +
              '</span><span class="qp-tile-bottom"><b>#' +
              String(tile.number).padStart(2, '0') +
              '</b><span>' +
              (voting
                ? tile.votes +
                  ' ' +
                  escape(t('votes')) +
                  (room.viewer.voteTileId === tile.id ? ' ✓' : '')
                : tile.used
                  ? escape(t('used'))
                  : '') +
              '</span></span></button>'
          )
          .join('') +
        '</div>' +
        '<p class="qp-muted">' +
        escape(t('boardKeys')) +
        '</p></section>'
      );
    }
    const roundViews = root.QuizRoundViews.create({
      t,
      escape,
      button,
      name,
      controls,
      pageControls,
      getRoom: () => room,
      getLanguage: () => language,
      getDraft: () => ({ answerDraft, selectedOption, ballot, busy })
    });
    function results(source = room, live = false) {
      const display = live && source.startedAt ? { ...source, durationMs: Math.max(0, clockSync.server + performance.now() - source.startedAt) } : source;
      const summary = root.QuizResults.summary(display, { language }),
        final = source.phase === 'finished',
        readonly = source === archiveRoom;
      return (
        '<section class="qp-stage qp-results" data-results><div class="qp-stage-top"><div><p class="qp-muted">' +
        escape(t('brand')) +
        ' · ' +
        escape(t('builtin')) +
        '</p><h1>' +
        escape(t(final ? 'finalResults' : 'currentScores')) +
        '</h1></div><strong>' +
        escape(t('duration')) +
        ' ' +
        escape(summary.durationText) +
        '</strong></div>' +
        (final && source.endedByInactivity ? '<p class="qp-alert">' + escape(t('inactivityResult')) + '</p>' : '') +
        (live
          ? '<p class="qp-alert">' +
            escape(t('liveScoresHint')) +
            '</p><div class="qp-btn-row">' +
            button('back-to-room', t('backToRoom')) +
            '</div>'
          : '') +
        '<article class="qp-card"><h2>' +
        escape(t(final ? 'rankings' : 'currentRank')) +
        '</h2><div class="qp-rank-grid">' +
        summary.totals
          .map(
            (p) =>
              '<div class="qp-rank" data-rank="' +
              p.rank +
              '"><b>' +
              String(p.rank).padStart(2, '0') +
              '</b><strong>' +
              escape(p.name) +
              '</strong><span>' +
              p.score +
              '</span></div>'
          )
          .join('') +
        '</div></article>' +
        '<article class="qp-card"><h2>' +
        escape(t('scoreTrend')) +
        '</h2><canvas class="qp-score-canvas" data-score-chart role="img" aria-label="' +
        escape(t('scoreTrend')) +
        '"></canvas>' +
        '<div class="qp-chart-legend">' +
        summary.series
          .map(
            (p) => '<span><i style="background:' + p.color + '"></i>' + escape(p.name) + '</span>'
          )
          .join('') +
        '</div></article>' +
        '<article class="qp-card"><h2>' +
        escape(t('correctCount')) +
        '</h2><p class="qp-type-legend"><span class="choice">' +
        escape(t('choiceType')) +
        '</span><span class="open">' +
        escape(t('openType')) +
        '</span></p><div class="qp-correct-chart">' +
        summary.correctCounts
          .map((p) => {
            const max = Math.max(1, ...summary.correctCounts.map((x) => x.total));
            return (
              '<div class="qp-correct-row"><strong>' +
              escape(source.players.find((x) => x.id === p.id)?.name) +
              '</strong><div class="qp-correct-bar"><span class="choice" style="width:' +
              (p.choice / max) * 100 +
              '%">' +
              (p.choice || '') +
              '</span><span class="open" style="width:' +
              (p.open / max) * 100 +
              '%">' +
              (p.open || '') +
              '</span></div><b>' +
              p.total +
              '</b></div>'
            );
          })
          .join('') +
        '</div></article>' +
        (source.rulesVersion >= 2
          ? '<article class="qp-card"><h2>' +
            escape(t('participationSummary')) +
            '</h2><div class="qp-participation-grid">' +
            summary.participation
              .map(
                (p) =>
                  '<section class="qp-participation"><strong>' +
                  escape(source.players.find((player) => player.id === p.id)?.name) +
                  '</strong><dl>' +
                  [
                    ['opportunities', p.turnOpportunities],
                    ['answeredCount', p.answered],
                    ['passedCount', p.passed],
                    ['missedCount', p.missed]
                  ]
                    .map(
                      ([key, value]) =>
                        '<div><dt>' + escape(t(key)) + '</dt><dd>' + value + '</dd></div>'
                    )
                    .join('') +
                  '</dl></section>'
              )
              .join('') +
            '</div></article>'
          : '') +
        '<p>' +
        escape(
          t('scoredCount', { n: source.history.length, total: source.settings.questionCount })
        ) +
        '</p>' +
        '<div class="qp-btn-row" data-export-hide>' +
        button('export-results', t('exportImage'), {}, 'primary') +
        (live ? '' : readonly ? button('history', t('back')) : controls()) +
        (live ? '' : button('home', t('returnHome'))) +
        '</div></section>'
      );
    }
    function historyView() {
      const records = app.getOnlineHistory?.() || [],
        total = Math.max(1, Math.ceil(records.length / 8));
      historyPage = Math.min(historyPage, total - 1);
      return (
        '<section class="qp-card"><h1>' +
        escape(t('history')) +
        '</h1><div class="qp-btn-row">' +
        button('back', t('back')) +
        button('export-history', t('exportArchive')) +
        button('import-history', t('importArchive')) +
        '</div>' +
        (records.length
          ? '<div class="qp-history-list">' +
            records
              .slice()
              .reverse()
              .slice(historyPage * 8, historyPage * 8 + 8)
              .map((record) =>
                button(
                  'view-history',
                  new Date(record.finishedAt).toLocaleString(language) +
                    ' · ' +
                    record.players.length +
                    ' ' +
                    t('players') +
                    ' · ' +
                    record.history.length +
                    ' ' +
                    t('questions'),
                  { record: record.id }
                )
              )
              .join('') +
            '</div>'
          : '<p>' + escape(t('historyEmpty')) + '</p>') +
        pageControls(historyPage, total, 'history-page') +
        '</section>'
      );
    }
    function header() {
      shell.setAttribute('lang', language);
      document.documentElement.lang = language;
      document.title = t('brand');
      q('[data-qpi="brand"]').textContent = t('brand');
      q('[data-qpi="language"]').textContent =
        language === 'en' ? 'EN' : language === 'zh-Hant' ? '繁中' : '简中';
      q('[data-qpa="settings"]').textContent = t('appSettings');
      q('[data-qpa="unlock"]').textContent = t(app.isAdmin() ? 'lock' : 'unlock');
      q('[data-qpa="fullscreen"]').textContent = t(
        document.fullscreenElement ? 'exitFullscreen' : 'fullscreen'
      );
      renderStatus();
    }
    function renderStatus() {
      const { code, error } = connectionStatus;
      const message = root.QuizI18n.strings[code] ? t(code) : root.QuizI18n.error(language, code);
      q('[data-qpi="connection"]').innerHTML =
        '<span class="qp-dot ' + (error ? 'offline' : '') + '"></span>' + escape(message);
    }
    function captureFocus() {
      const element = document.activeElement;
      if (!main.contains(element)) return null;
      return {
        id: element.id,
        key: element.dataset.focusKey,
        category: element.dataset.qpc,
        start: element.selectionStart,
        end: element.selectionEnd
      };
    }
    function restoreFocus(focus) {
      if (!focus) return;
      let element = focus.id ? document.getElementById(focus.id) : null;
      if (!element && focus.key)
        element = [...main.querySelectorAll('[data-focus-key]')].find(
          (x) => x.dataset.focusKey === focus.key
        );
      if (!element && focus.category)
        element = [...main.querySelectorAll('[data-qpc]')].find(
          (x) => x.dataset.qpc === focus.category
        );
      if (element && !element.disabled) {
        element.focus({ preventScroll: true });
        if (typeof focus.start === 'number')
          try {
            element.setSelectionRange(focus.start, focus.end);
          } catch {}
      }
    }
    function render() {
      if (composing) return;
      const screen = JSON.stringify([
        view,
        room?.phase,
        room?.current?.id,
        archiveRoom?.id,
        view === 'history' ? historyPage : null,
        view === 'room' && ['grading', 'review', 'scoreReview', 'results'].includes(room?.phase)
          ? gradePage
          : null
      ]);
      const screenChanged = screen !== renderedScreen;
      renderedScreen = screen;
      const focus = captureFocus();
      header();
      let content = '';
      if (view === 'entry') content = entry();
      else if (view === 'online') content = onlineEntry();
      else if (view === 'join') content = joinView();
      else if (view === 'admin')
        content = app.getAdminCreateView({
          t,
          lang: language,
          draft: setup,
          categories: app.getCategories()
        });
      else if (view === 'connecting')
        content =
          '<section class="qp-card"><h1>' +
          escape(t('connecting')) +
          '</h1>' +
          button('home', t('returnHome')) +
          '</section>';
      else if (view === 'history') content = historyView();
      else if (view === 'archive') content = results(archiveRoom);
      else if (view === 'standings') content = results(room, true);
      else if (room) {
        if (room.phase === 'lobby') content = lobby();
        else if (room.phase === 'selecting') content = board();
        else if (room.phase === 'briefing') content = roundViews.briefing();
        else if (room.phase === 'answering') content = roundViews.answering();
        else if (['grading', 'review'].includes(room.phase))
          content = roundViews.grading(gradePage);
        else if (['scoreReview', 'results'].includes(room.phase))
          content = roundViews.roundResults(gradePage);
        else content = results();
      }
      const offline =
        room && view === 'room' && room.phase !== 'finished' && !room.hostOnline
          ? '<div class="qp-alert">' + escape(t('hostOffline')) + '</div>'
          : '';
      if (
        view === 'room' &&
        room?.phase !== 'finished' &&
        room?.history?.length &&
        (['selecting', 'briefing', 'results'].includes(room.phase) || !room.hostOnline)
      )
        content +=
          '<div class="qp-btn-row qp-bottom-actions">' +
          button('show-scores', t('showScores')) +
          '</div>';
      main.innerHTML =
        (notice
          ? '<div class="qp-alert ' +
            (notice.error ? 'error' : '') +
            '" role="status">' +
            escape(notice.message) +
            '</div>'
          : '') +
        offline +
        content;
      if (busy) for (const node of main.querySelectorAll('button')) node.disabled = true;
      if (!document.querySelector('dialog[open]'))
        root.QuizKeys?.refresh({
          root: shell,
          context: view + ':' + (room?.phase || ''),
          board: view === 'room' && room?.phase === 'selecting',
          reserveAnswers: view === 'room' && !!room?.current
        });
      restoreFocus(focus);
      if (screenChanged) root.scrollTo?.({ top: 0, left: 0, behavior: 'instant' });
      updateClock();
      clearInterval(timer);
      if (q('[data-deadline]')) timer = setInterval(updateClock, 250);
      const canvas = q('[data-score-chart]'),
        source = view === 'archive' ? archiveRoom : room;
      if (canvas && source) {
        root.QuizResults.draw(canvas, source, { language });
        document.fonts?.ready.then(() => {
          if (canvas.isConnected) root.QuizResults.draw(canvas, source, { language });
        });
      }
    }
    function updateClock() {
      const node = q('[data-deadline]');
      if (!node) return;
      const serverNow = clockSync.server + performance.now() - clockSync.client;
      const seconds = Math.max(0, Math.ceil((Number(node.dataset.deadline) - serverNow) / 1000));
      node.textContent = seconds + ' ' + t('seconds');
      node.classList.toggle('expired', seconds === 0);
    }
    async function work(operation) {
      if (busy) return;
      const focus = captureFocus();
      busy = true;
      notice = null;
      render();
      try {
        return await operation();
      } catch (error) {
        notice = { message: root.QuizI18n.error(language, error.code), error: true };
      } finally {
        busy = false;
        render();
        restoreFocus(focus);
      }
    }
    async function home() {
      if (
        room &&
        room.phase !== 'finished' &&
        !(await app.confirm(t('leaveTitle'), t('leaveDescription')))
      )
        return;
      app.disconnect({ forget: false });
      room = null;
      archiveRoom = null;
      view = 'entry';
      notice = null;
      render();
    }
    async function createRoom() {
      if (!setup.name.trim()) {
        notice = { message: t('nameRequired'), error: true };
        render();
        return;
      }
      if (Array.isArray(setup.categories) && !setup.categories.length) {
        notice = { message: t('INVALID_CATEGORIES'), error: true };
        render();
        return;
      }
      const previous = app.getSession?.();
      if (
        previous &&
        previous.phase !== 'finished' &&
        !(await app.confirm(
          t('replaceRoomTitle'),
          t('replaceRoomDescription', { code: previous.code })
        ))
      )
        return;
      return work(async () => {
        const created = await app.adminCreate(setup);
        if (created && !room) view = 'connecting';
      });
    }
    async function joinRoom() {
      if (!/^\d{6}$/.test(joinDraft.code)) {
        notice = { message: t('codeRequired'), error: true };
        render();
        return;
      }
      const normalized = root.NeoPlayerNames.normalize(joinDraft.name, true);
      if (!normalized) {
        notice = { message: t('nameRequired'), error: true };
        render();
        return;
      }
      const previous = app.getSession?.();
      const sameRoom = previous?.code === joinDraft.code;
      if (
        previous &&
        previous.phase !== 'finished' &&
        !(await app.confirm(
          t(sameRoom ? 'newIdentityTitle' : 'replaceRoomTitle'),
          t(sameRoom ? 'newIdentityDescription' : 'replaceRoomDescription', { code: previous.code })
        ))
      )
        return;
      return work(async () => {
        const signature = joinDraft.code + ':' + normalized;
        if (joinAttempt?.signature !== signature)
          joinAttempt = { signature, id: crypto.randomUUID() };
        const session = await app.api('/api/rooms/' + joinDraft.code + '/join', {
          method: 'POST',
          body: JSON.stringify({ name: normalized, requestId: joinAttempt.id })
        });
        joinAttempt = null;
        view = 'connecting';
        app.connect(session);
      });
    }
    async function handle(action, element) {
      const expected = { roomId: room?.id, roundId: room?.current?.id, selectionId: room?.selectionId };
      if (action === 'show-scores' && room?.history.length) {
        view = 'standings';
        render();
        return;
      }
      if (action === 'back-to-room') {
        view = 'room';
        render();
        return;
      }
      if (action === 'home' || action === 'leave') return home();
      if (action === 'language') {
        language = languages[(languages.indexOf(language) + 1) % languages.length];
        app.setLanguage?.(language);
        render();
        return;
      }
      if (action === 'settings') return app.requestSettings();
      if (action === 'fullscreen') return app.fullscreen();
      if (action === 'unlock') return app.requestUnlock();
      if (action === 'offline') return app.openOffline();
      if (action === 'online') {
        if (app.isLocalFile?.()) {
          app.openOnline();
          return;
        }
        view = 'online';
        notice = null;
        render();
        return;
      }
      if (action === 'back') {
        view = 'entry';
        notice = null;
        render();
        return;
      }
      if (action === 'resume') {
        if (app.getSession()?.isHost && !app.isAdmin() && !(await app.requestUnlock())) return;
        view = 'connecting';
        render();
        app.connect(app.getSession());
        return;
      }
      if (action === 'join') {
        view = 'join';
        notice = null;
        render();
        return;
      }
      if (action === 'create') {
        if (!app.isAdmin() && !(await app.requestUnlock())) return;
        return work(async () => {
          await app.ensureCatalog?.();
          view = 'admin';
        });
      }
      if (action === 'join-submit') return joinRoom();
      if (action === 'admin-create-submit') return createRoom();
      if (action === 'all-categories' || action === 'clear-categories') {
        setup.categories = action === 'all-categories' ? undefined : [];
        render();
        return;
      }
      if (action === 'copy-code') {
        await navigator.clipboard.writeText(room.code);
        notice = { message: t('copied') };
        render();
        return;
      }
      if (action === 'history') {
        if (room && view === 'room' && room.phase !== 'finished') return;
        app.disconnect({ forget: false });
        room = null;
        view = 'history';
        notice = null;
        render();
        return;
      }
      if (action === 'history-page') {
        historyPage += Number(element.dataset.step);
        render();
        return;
      }
      if (action === 'view-history') {
        archiveRoom = app.getOnlineHistory().find((x) => x.id === element.dataset.record);
        if (archiveRoom) {
          view = 'archive';
          render();
        }
        return;
      }
      if (action === 'export-history') return app.exportHistory();
      if (action === 'import-history') return app.importHistory();
      if (action === 'grade-page') {
        gradePage += Number(element.dataset.step);
        render();
        return;
      }
      if (action === 'export-results') return work(() => app.exportResults(q('[data-results]')));
      if (action === 'option') {
        selectedOption = element.dataset.option;
        render();
        return;
      }
      if (action === 'ballot') {
        ballot.set(element.dataset.answer, element.dataset.correct === 'true');
        render();
        return;
      }
      if (action === 'all-correct' || action === 'all-wrong') {
        if (
          room?.phase !== 'grading' ||
          room.settings.grading !== 'vote' ||
          room.viewer.gradeSubmitted ||
          room.current.gradingClosed
        )
          return;
        const assigned = new Set(room.viewer.reviewAnswerIds || []);
        for (const answer of room.current.answers)
          if (assigned.has(answer.id) && !answer.unanswered && answer.correct === null)
            ballot.set(answer.id, action === 'all-correct');
        render();
        return;
      }
      if (
        action === 'kick' &&
        !(await app.confirm(
          t('removePlayer'),
          t('removePlayerConfirm', { name: name(element.dataset.player) })
        ))
      )
        return;
      if (action === 'host-finish' && !(await app.confirm(t('finish'), t('finishConfirm')))) return;
      if (
        action === 'host-review-answer' &&
        !(await app.confirm(t('reviewThisAnswer'), t('reviewAnswerConfirm')))
      )
        return;
      if (
        action === 'host-void' &&
        !(await app.confirm(t('voidQuestion'), t('voidQuestionConfirm')))
      )
        return;
      if (action === 'pass' && !(await app.confirm(t('passQuestion'), t('passConfirm')))) return;
      if (
        action === 'host-close-grading' &&
        !(await app.confirm(
          t('closeGrading'),
          t('closeGradingConfirm', {
            n: Math.max(
              0,
              (room.current.eligibleReviewerCount || 0) - room.current.gradingSubmittedCount
            )
          })
        ))
      )
        return;
      if (
        action === 'host-close-selection' &&
        !(await app.confirm(t('closeSelection'), t('closeSelectionConfirm')))
      )
        return;
      const messages = {
        ready: () => [
          'ready',
          { ready: !room.players.find((p) => p.id === room.viewer.id)?.ready }
        ],
        tile: () => [
          room.settings.selection === 'vote' && !room.selectionClosed && room.viewer.isPlayer
            ? 'vote'
            : 'select',
          { tileId: element.dataset.tile }
        ],
        submit: () => [
          'submit',
          room.current.type === 'choice' ? { optionId: selectedOption } : { text: answerDraft }
        ],
        'oral-mark': () => ['oralMark', { playerId: room.current.oralPlayerId, answered: true }],
        pass: () => [
          'pass',
          { playerId: room.settings.openResponse === 'oral' ? room.turnPlayerId : room.viewer.id }
        ],
        judge: () => [
          'judge',
          { answerId: element.dataset.answer, correct: element.dataset.correct === 'true' }
        ],
        review: () => [
          'review',
          { answerId: element.dataset.answer, correct: element.dataset.correct === 'true' }
        ],
        'submit-votes': () => [
          'gradeVote',
          { votes: [...ballot].map(([answerId, correct]) => ({ answerId, correct })) }
        ],
        kick: () => ['kick', { playerId: element.dataset.player }]
      };
      if (messages[action]) return work(() => app.send(...messages[action](), expected));
      if (action.startsWith('host-')) return work(() => app.handleAdminAction(action, element, expected));
    }
    shell.addEventListener('click', (event) => {
      const element = event.target.closest('[data-qpa]');
      if (!element || !shell.contains(element) || element.disabled || event.detail > 1) return;
      event.preventDefault();
      if (busy) return;
      Promise.resolve(handle(element.dataset.qpa, element)).catch((error) => {
        notice = { message: root.QuizI18n.error(language, error.code), error: true };
        render();
      });
    });
    shell.addEventListener('submit', (event) => {
      event.preventDefault();
      if (event.target.dataset.qpf === 'join') joinRoom();
      else if (event.target.dataset.qpf === 'admin-create') createRoom();
    });
    shell.addEventListener('compositionstart', () => {
      composing = true;
    });
    shell.addEventListener('compositionend', (event) => {
      composing = false;
      readInput(event.target);
      render();
    });
    function readInput(input) {
      if (input.id === 'qp-answer') answerDraft = input.value;
      if (input.id === 'qp-host-name') setup.name = root.NeoPlayerNames.normalize(input.value);
      if (input.id === 'qp-join-name') joinDraft.name = root.NeoPlayerNames.normalize(input.value);
      if (input.id === 'qp-join-code') joinDraft.code = input.value.replace(/\D/g, '').slice(0, 6);
      if (['qp-host-name', 'qp-join-name', 'qp-join-code'].includes(input.id)) {
        const value =
          input.id === 'qp-host-name'
            ? setup.name
            : input.id === 'qp-join-name'
              ? joinDraft.name
              : joinDraft.code;
        if (input.value !== value) input.value = value;
      }
      const count = [...answerDraft.normalize('NFC').trim()].length,
        counter = q('[data-answer-count]');
      if (counter) counter.textContent = count + '/500';
      const submit = q('[data-qpa="submit"]');
      if (submit && room?.current?.type === 'open')
        submit.disabled = busy || !answerDraft.trim() || count > 500;
    }
    shell.addEventListener('input', (event) => {
      if (!event.isComposing) readInput(event.target);
    });
    shell.addEventListener('change', (event) => {
      const input = event.target;
      const fields = {
        'qp-selection': 'selection',
        'qp-seconds': 'answerSeconds',
        'qp-count': 'questionCount',
        'qp-open': 'openResponse',
        'qp-grading': 'grading'
      };
      if (input.id === 'qp-host-plays') setup.hostPlays = input.checked;
      if (fields[input.id])
        setup[fields[input.id]] = ['qp-seconds', 'qp-count'].includes(input.id)
          ? Number(input.value)
          : input.value;
      if (input.hasAttribute('data-qpc'))
        setup.categories = [...main.querySelectorAll('[data-qpc]:checked')].map(
          (x) => x.dataset.qpc
        );
      if (input.id === 'qp-open') render();
    });
    const api = {
      setState(next) {
        const previousRound = room?.current?.id;
        const previousPhase = room?.phase;
        const keepStandings =
          view === 'standings' &&
          next?.id === room?.id &&
          next?.phase === room?.phase &&
          (room?.hostOnline || !next?.hostOnline);
        room = next ? clone(next) : null;
        view = room ? (keepStandings ? 'standings' : 'room') : 'entry';
        notice = null;
        if (room) {
          clockSync = { server: room.serverNow, client: performance.now() };
          if (room.current?.id !== previousRound) {
            answerDraft = '';
            selectedOption = null;
            ballot.clear();
            gradePage = 0;
          }
          if (room.current?.mySubmission) {
            selectedOption = room.current.mySubmission.optionId;
            answerDraft = room.current.mySubmission.text || '';
          }
          if (room.phase === 'scoreReview' && !room.viewer.isHost && (previousPhase !== 'scoreReview' || previousRound !== room.current?.id)) {
            const ownIndex = (room.current?.answers || []).filter(a => a.status !== 'notTurn').findIndex(a => a.playerId === room.viewer.id);
            gradePage = Math.max(0, Math.floor(ownIndex / 8));
          }
          if (room.phase === 'finished') app.saveOnlineHistory(room);
        }
        render();
      },
      setView(next) {
        view = next;
        render();
      },
      setAlert(message, error = true) {
        notice = { message, error };
        render();
      },
      render,
      getState: () => room,
      getLanguage: () => language,
      getView: () => view,
      getExportState: () => (view === 'archive' ? archiveRoom : room),
      refreshHistory() {
        if (view === 'history' || view === 'archive') {
          if (archiveRoom)
            archiveRoom =
              app.getOnlineHistory().find((x) => x.id === archiveRoom.id) || archiveRoom;
          render();
        }
      },
      setLanguage(value) {
        if (languages.includes(value)) {
          language = value;
          render();
        }
      },
      status(code, error = false) {
        connectionStatus = { code, error };
        renderStatus();
      },
      destroy() {
        clearInterval(timer);
      }
    };
    const headerObserver =
      typeof root.ResizeObserver === 'function'
        ? new root.ResizeObserver(() => {
            const height = shell.querySelector('header').getBoundingClientRect().height;
            document.documentElement.style.setProperty('--header-height', height + 20 + 'px');
          })
        : null;
    headerObserver?.observe(shell.querySelector('header'));
    const destroy = api.destroy;
    api.destroy = () => {
      headerObserver?.disconnect();
      destroy();
    };
    render();
    return api;
  }
  root.QuizOnlineUI = Object.freeze({ create });
})(typeof window === 'undefined' ? globalThis : window);
