(function (root) {
  'use strict';
  const namespace = root.QuizConfig?.storageNamespace || '',
    suffix = namespace ? '.' + namespace : '';
  const SESSION = 'quizparty.online.session.v6' + suffix,
    LAST_SESSION = 'quizparty.online.last-session.v6' + suffix,
    HISTORY = 'quizparty.online.history.v6' + suffix,
    PREFS = 'quizparty.online.preferences.v6' + suffix;
  const shell = document.getElementById('quiz-online');
  const localFile = !/^https?:$/.test(location.protocol);
  const landing = new URLSearchParams(location.search);
  const restoreController = new AbortController();
  let ui,
    connection,
    session = null,
    state = null,
    categories = [],
    adminToken = null,
    adminExpires = 0,
    authPending = null,
    authEpoch = 0,
    exporting = false,
    createAttempt = null,
    autoResume = false,
    historyCache = [];
  const pendingHistory = new Map(),
    persistedHistory = new Map();
  const prefs = { sfx: true, music: false, reduced: false, lang: 'zh-Hans' };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS) || '{}');
    prefs.sfx = saved.sfx !== false;
    prefs.music = saved.music === true;
    const selected =
      saved.lang || JSON.parse(localStorage.getItem('quizparty.release.v58' + suffix) || '{}').lang;
    if (['en', 'zh-Hans', 'zh-Hant'].includes(selected)) prefs.lang = selected;
  } catch {}
  function usableSession(saved) {
    return (
      saved &&
      typeof saved.token === 'string' &&
      saved.token.length < 4096 &&
      typeof saved.roomId === 'string' &&
      saved.service === root.QuizConfig.apiBase
    );
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION) || 'null');
    if (usableSession(saved)) {
      session = saved;
      autoResume = saved.resumeOnLoad !== false;
    }
  } catch {}
  if (!session)
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_SESSION) || 'null');
      if (usableSession(saved)) session = saved;
    } catch {}
  root.NeoAudio.configure(prefs);
  const escape = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const language = () => ui?.getLanguage() || 'zh-Hans';
  const t = (key, params) => root.QuizI18n.make(language())(key, params);
  function setLanguage(value) {
    if (!['en', 'zh-Hans', 'zh-Hant'].includes(value)) return;
    prefs.lang = value;
    try {
      localStorage.setItem(PREFS, JSON.stringify(prefs));
    } catch {}
  }
  const say = (en, zh, tw) => ({ en, 'zh-Hans': zh, 'zh-Hant': tw })[language()];
  function showError(error) {
    ui?.setAlert(root.QuizI18n.error(language(), error?.code), true);
  }
  function dialog(title, content) {
    const previous = document.querySelector('.qp-dialog');
    if (previous) {
      previous.close();
      previous.remove();
    }
    const box = document.createElement('dialog');
    box.className = 'qp-dialog';
    box.innerHTML =
      '<form method="dialog" class="qp-dialog-head"><h2>' +
      escape(title) +
      '</h2><button class="qp-btn small" data-qpa="close-dialog" aria-label="' +
      escape(t('close')) +
      '">×</button></form>' +
      content;
    document.body.append(box);
    box.showModal();
    root.QuizKeys.refresh({ root: box, context: 'dialog:' + title });
    box.addEventListener(
      'close',
      () => {
        box.remove();
        ui?.render();
      },
      { once: true }
    );
    return box;
  }
  function confirm(title, description) {
    const box = dialog(
      title,
      '<p>' +
        escape(description) +
        '</p><div class="qp-btn-row qp-bottom-actions"><button class="qp-btn" data-choice="cancel" data-qpa="cancel-dialog">' +
        escape(t('cancel')) +
        '</button><button class="qp-btn primary" data-choice="accept" data-qpa="confirm-dialog">' +
        escape(t('confirm')) +
        '</button></div>'
    );
    box
      .querySelector('[data-choice="cancel"]')
      .addEventListener('click', () => box.close('cancel'));
    box
      .querySelector('[data-choice="accept"]')
      .addEventListener('click', () => box.close('accept'));
    return new Promise((resolve) =>
      box.addEventListener('close', () => resolve(box.returnValue === 'accept'), { once: true })
    );
  }
  async function requestUnlock() {
    restoreController.abort();
    if (root.QuizAdmin) {
      if (session?.isHost) {
        disconnect({ forget: false });
        ui.setState(null);
      }
      authEpoch++;
      adminToken = null;
      adminExpires = 0;
      root.QuizAccess.lock();
      ui.render();
      return false;
    }
    const box = dialog(
      t('unlock'),
      '<form class="qp-unlock-form"><label class="qp-label" for="qp-master">' +
        escape(t('password')) +
        '</label><input id="qp-master" class="qp-field" type="password" autocomplete="current-password" required><p class="qp-dialog-message" role="status"></p><button class="qp-btn primary" type="submit" data-qpa="unlock-submit">' +
        escape(t('unlock')) +
        '</button></form>'
    );
    const form = box.querySelector('.qp-unlock-form'),
      abort = new AbortController();
    form.querySelector('input').focus();
    box.addEventListener('close', () => abort.abort(), { once: true });
    return new Promise((resolve) => {
      box.addEventListener('close', () => resolve(false), { once: true });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (form.dataset.busy) return;
        form.dataset.busy = 'true';
        const button = form.querySelector('button'),
          message = form.querySelector('[role="status"]');
        button.disabled = true;
        message.textContent = say('Unlocking…', '正在解锁…', '正在解鎖…');
        try {
          await root.QuizAccess.unlock(form.querySelector('input').value, {
            signal: abort.signal,
            onProgress(phase, detail = {}) {
              if (!box.open) return;
              if (phase === 'load-progress') {
                const loaded = (Number(detail.loaded || 0) / 1048576).toFixed(1);
                const total = detail.total > 0 ? ' / ' + (detail.total / 1048576).toFixed(1) : '';
                message.textContent = say('Downloading administrator content', '正在下载管理员内容', '正在下載管理員內容') + ' ' + loaded + total + ' MB';
              } else {
                const key = { 'load-start': 'unlockDownload', load: 'unlockDecode', derive: 'unlockVerify', decrypt: 'unlockDecrypt', decompress: 'unlockPrepare', ready: 'unlockPrepare' }[phase];
                if (key) message.textContent = t(key);
              }
            }
          });
          if (!box.open) return;
          resolve(true);
          box.close();
          ui.render();
        } catch (error) {
          if (!box.open) return;
          message.textContent = error.name === 'OperationError' ? t('wrongPassword')
            : root.QuizI18n.error(language(), error.code || 'ADMIN_LOAD_FAILED');
          button.disabled = false;
          delete form.dataset.busy;
        }
      });
    });
  }
  async function getAdminToken() {
    if (!root.QuizAdmin)
      throw Object.assign(new Error('ADMIN_REQUIRED'), { code: 'ADMIN_REQUIRED' });
    if (adminToken && Date.now() < adminExpires) return adminToken;
    if (authPending) return authPending;
    const epoch = authEpoch;
    authPending = (async () => {
      const challenge = await root.QuizTransport.api('/api/admin/challenge'),
        signature = await root.QuizAccess.adminProof(challenge);
      const result = await root.QuizTransport.api('/api/admin/session', {
        method: 'POST',
        body: JSON.stringify({ nonce: challenge.nonce, signature })
      });
      if (epoch !== authEpoch || !root.QuizAdmin)
        throw Object.assign(new Error('ADMIN_REQUIRED'), { code: 'ADMIN_REQUIRED' });
      adminToken = result.adminToken;
      adminExpires = Date.now() + 7 * 3600000;
      return adminToken;
    })();
    try {
      return await authPending;
    } finally {
      authPending = null;
    }
  }
  async function api(path, options = {}) {
    const headers = { ...options.headers };
    if (path === '/api/rooms') headers.Authorization = 'Bearer ' + (await getAdminToken());
    return root.QuizTransport.api(path, { ...options, headers });
  }
  let catalogPending = null, serviceFailed = false;
  async function ensureCatalog({ refresh = false } = {}) {
    if (categories.length && !refresh) return categories;
    if (catalogPending) return catalogPending;
    if (!connection) ui.status('serviceChecking');
    catalogPending = (async () => {
      const meta = await api('/api/meta');
      if (meta.protocol !== 2)
        throw Object.assign(new Error('CLIENT_UPDATE_REQUIRED'), { code: 'CLIENT_UPDATE_REQUIRED' });
      if (!meta.configured)
        throw Object.assign(new Error('SERVICE_NOT_CONFIGURED'), { code: 'SERVICE_NOT_CONFIGURED' });
      if (!Array.isArray(meta.categories) || !meta.categories.length)
        throw Object.assign(new Error('BANK_NOT_READY'), { code: 'BANK_NOT_READY' });
      categories = meta.categories;
      serviceFailed = false;
      ui.setServiceError?.(null);
      if (!connection) ui.status('serviceReady');
      ui.render();
      return categories;
    })();
    try {
      return await catalogPending;
    } catch (error) {
      serviceFailed = true;
      ui.setServiceError?.(error.code || 'SERVICE_UNAVAILABLE');
      if (!connection) ui.status('serviceUnavailable', true);
      throw error;
    } finally {
      catalogPending = null;
    }
  }
  function setSession(value) {
    const previous = session;
    session = value ? { ...value, service: root.QuizConfig.apiBase } : null;
    try {
      if (session) {
        const encoded = JSON.stringify(session);
        sessionStorage.setItem(SESSION, encoded);
        localStorage.setItem(LAST_SESSION, encoded);
      } else {
        sessionStorage.removeItem(SESSION);
        const last = JSON.parse(localStorage.getItem(LAST_SESSION) || 'null');
        if (previous && last?.token === previous.token) localStorage.removeItem(LAST_SESSION);
      }
    } catch {}
  }
  function connect(value) {
    if (!value) return;
    connection?.close();
    setSession({ ...value, resumeOnLoad: true });
    connection = root.QuizTransport.connect(value, {
      adminToken: getAdminToken,
      onState(next) {
        state = next;
        if (session?.phase !== next.phase) setSession({ ...session, phase: next.phase });
        ui.setState(next);
      },
      onStatus(status) {
        ui.status(status, status !== 'connected');
      },
      onError(code) {
        if (
          [
            'ROOM_EXPIRED',
            'ROOM_NOT_FOUND',
            'REMOVED_FROM_ROOM',
            'ROOM_VERSION_UNSUPPORTED'
          ].includes(code)
        ) {
          setSession(null);
          if (state?.phase !== 'finished') {
            state = null;
            ui.setState(null);
          }
        }
        showError({ code });
      }
    });
  }
  function disconnect({ forget = false } = {}) {
    connection?.close();
    connection = null;
    state = null;
    if (forget) setSession(null);
    else if (session) setSession({ ...session, resumeOnLoad: false });
    ui?.status('idle');
  }
  async function send(type, payload = {}, expected) {
    if (!connection) throw Object.assign(new Error('DISCONNECTED'), { code: 'DISCONNECTED' });
    if (expected?.roomId && expected.roomId !== state?.id)
      throw Object.assign(new Error('staleRoom'), { code: 'staleRoom' });
    return connection.send(type, payload,
      expected && Object.hasOwn(expected, 'roundId') ? expected.roundId : state?.current?.id,
      expected && Object.hasOwn(expected, 'selectionId') ? expected.selectionId : state?.selectionId);
  }
  async function adminCreate(draft) {
    const body = {
      name: draft.name,
      hostPlays: draft.hostPlays === true,
      settings: {
        selection: draft.selection,
        answerSeconds: draft.answerSeconds,
        questionCount: draft.questionCount,
        categoryIds: draft.categories,
        openResponse: draft.openResponse,
        grading: draft.grading
      }
    };
    const signature = JSON.stringify(body);
    if (createAttempt?.signature !== signature)
      createAttempt = { signature, id: crypto.randomUUID() };
    try {
      const value = await api('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ ...body, requestId: createAttempt.id })
      });
      createAttempt = null;
      connect(value);
      return value;
    } catch (error) {
      if (error.code === 'ROOM_EXPIRED') createAttempt = null;
      throw error;
    }
  }
  function history() {
    return historyCache;
  }
  function cacheHistory(records) {
    historyCache = records
      .slice()
      .sort((a, b) => a.finishedAt - b.finishedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    persistedHistory.clear();
    for (const record of historyCache) persistedHistory.set(record.id, JSON.stringify(record));
    ui?.refreshHistory?.();
  }
  async function refreshHistory() {
    try {
      cacheHistory(await root.QuizHistoryStore.read());
    } catch {}
  }
  async function initializeHistory() {
    let legacy = [];
    try {
      legacy = root.QuizHistory.normalize(JSON.parse(localStorage.getItem(HISTORY) || '[]'), {
        strict: false
      });
    } catch {}
    try {
      cacheHistory(await root.QuizHistoryStore.migrate(legacy));
      try {
        localStorage.removeItem(HISTORY);
      } catch {}
    } catch {
      historyCache = legacy;
    }
  }
  let historyChannel;
  try {
    if (typeof BroadcastChannel === 'function') {
      historyChannel = new BroadcastChannel('quizparty.history.v6' + suffix);
      historyChannel.onmessage = refreshHistory;
    }
  } catch {}
  async function saveOnlineHistory(room) {
    if (room.phase !== 'finished') return;
    try {
      const record = root.QuizHistory.snapshot(room),
        signature = JSON.stringify(record);
      await historyReady;
      if (persistedHistory.get(record.id) === signature || pendingHistory.has(record.id)) return;
      pendingHistory.set(record.id, record);
      try {
        const records = await root.QuizHistoryStore.merge([record]);
        cacheHistory(records);
        historyChannel?.postMessage('changed');
      } finally {
        pendingHistory.delete(room.id);
      }
    } catch (error) {
      console.warn('Result history was not saved:', error.code || error.name);
      ui?.setAlert(
        say(
          'History could not be saved on this device. Download the results before leaving.',
          '此设备未能保存历史记录，请离开前下载结果。',
          '此裝置未能儲存歷史紀錄，請離開前下載結果。'
        ),
        true
      );
    }
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob),
      anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function exportHistory() {
    await historyReady;
    await refreshHistory();
    download(
      new Blob([JSON.stringify(root.QuizHistory.exportArchive(history()), null, 2)], {
        type: 'application/json'
      }),
      'quiz-party-history.json'
    );
  }
  function importHistory() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    document.body.append(input);
    const startingView = ui.getView();
    input.addEventListener(
      'change',
      async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return;
        try {
          if (file.size > 32 * 1024 * 1024) throw new Error('tooLarge');
          const incoming = root.QuizHistory.importArchive(JSON.parse(await file.text()));
          if (ui.getView() !== startingView) return;
          await historyReady;
          cacheHistory(await root.QuizHistoryStore.merge(incoming));
          historyChannel?.postMessage('changed');
          if (ui.getView() === startingView)
            ui.setAlert(say('History imported.', '历史记录已导入。', '歷史紀錄已匯入。'), false);
        } catch (error) {
          if (ui.getView() !== startingView) return;
          const message =
            error.code === 'HISTORY_STORAGE_FAILED'
              ? say(
                  'The browser could not save the imported history.',
                  '浏览器未能保存导入的记录。',
                  '瀏覽器未能儲存匯入的紀錄。'
                )
              : say(
                  'This history archive could not be imported. Check its format and size.',
                  '无法导入这份历史存档，请检查文件格式和大小。',
                  '無法匯入這份歷史存檔，請檢查檔案格式與大小。'
                );
          ui.setAlert(message, true);
        }
      },
      { once: true }
    );
    input.addEventListener('cancel', () => input.remove(), { once: true });
    input.click();
  }
  async function exportResults(element) {
    if (exporting) return;
    exporting = true;
    let copy;
    try {
      if (!element) throw new Error('EXPORT_FAILED');
      await document.fonts.ready;
      copy = element.cloneNode(true);
      copy.style.cssText =
        'position:absolute;left:-15000px;top:0;width:1200px;max-width:none;padding:30px;background:#f5f0e6;';
      for (const node of copy.querySelectorAll('[data-export-hide]')) node.remove();
      document.body.append(copy);
      const canvas = copy.querySelector('[data-score-chart]');
      if (canvas) root.QuizResults.draw(canvas, ui.getExportState(), { language: language() });
      const picture = await root.html2canvas(copy, {
        scale: 1.5,
        backgroundColor: '#f5f0e6',
        scrollX: 0,
        scrollY: 0,
        windowWidth: 1280,
        logging: false
      });
      const blob = await new Promise((resolve, reject) =>
        picture.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('EXPORT_FAILED'))),
          'image/png'
        )
      );
      download(blob, 'quiz-party-results-' + Date.now() + '.png');
    } finally {
      copy?.remove();
      exporting = false;
    }
  }
  function requestSettings() {
    const box = dialog(
      t('appSettings'),
      '<div class="qp-settings">' +
        [
          ['sfx', say('Sound effects', '交互音效', '互動音效')],
          ['music', say('Background music', '背景音乐', '背景音樂')]
        ]
          .map(
            ([key, label]) =>
              '<label class="qp-player"><span>' +
              escape(label) +
              '</span><input type="checkbox" data-pref="' +
              key +
              '"' +
              (prefs[key] ? ' checked' : '') +
              '></label>'
          )
          .join('') +
        '<a class="qp-btn" href="README.html#' +
        language().toLowerCase() +
        '" target="_blank" rel="noopener">' +
        escape(say('About', '关于', '關於')) +
        '</a></div>'
    );
    box.addEventListener('change', (event) => {
      const key = event.target.dataset.pref;
      if (!['sfx', 'music'].includes(key)) return;
      prefs[key] = event.target.checked;
      root.NeoAudio.configure(prefs);
      try {
        localStorage.setItem(PREFS, JSON.stringify(prefs));
      } catch {}
    });
  }
  const app = {
    isAdmin: () => !!root.QuizAdmin,
    requestUnlock,
    requestSettings,
    confirm,
    api,
    setSession,
    connect,
    disconnect,
    send,
    getLanguage: language,
    setLanguage,
    isLocalFile: () => localFile,
    openOnline: () => {
      const url = new URL('https://fionviber.github.io/quiz-party/');
      url.searchParams.set('online', '1');
      url.searchParams.set('lang', language());
      location.assign(url.href);
    },
    getCategories: () => categories,
    ensureCatalog,
    retryService: () => ensureCatalog({ refresh: true }).catch(() => {}),
    getSession: () => session,
    getState: () => state,
    download,
    openOffline: async () => {
      if (!root.QuizAdmin && !(await requestUnlock())) return;
      root.NeoAudio.configure({ sfx: false, music: false });
      try {
        root.QuizKeys.clearPressed?.();
        root.QuizAccess.openOffline({ language: language() });
      } catch (error) {
        root.NeoAudio.configure(prefs);
        throw error;
      }
    },
    onOfflineClose: (value) => {
      root.NeoAudio.configure(prefs);
      root.QuizKeys.clearPressed?.();
      if (['en', 'zh-Hans', 'zh-Hant'].includes(value)) {
        setLanguage(value);
        ui.setLanguage(value);
      } else ui.render();
      root.scrollTo?.({ top: 0, left: 0, behavior: 'instant' });
    },
    onOfflineLanguage: setLanguage,
    fullscreen: async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
        ui.render();
      } catch {
        ui.setAlert(t('fullscreenUnavailable'), true);
      }
    },
    getAdminCreateView: (args) => root.QuizAdmin?.createView({ ...args, categories }) || '',
    getAdminHostControls: (args) => root.QuizAdmin?.hostControls(args) || '',
    handleAdminAction: (action, element, expected) => root.QuizAdmin?.handleAction(action, element, app, expected),
    adminCreate,
    saveOnlineHistory,
    exportResults,
    getOnlineHistory: history,
    exportHistory,
    importHistory,
    render: () => ui.render(),
    setAdmin: () => ui.render()
  };
  root.QuizApp = app;
  ui = root.QuizOnlineUI.create(shell, app);
  ui.setLanguage?.(prefs.lang);
  const requestedLanguage = landing.get('lang');
  if (['en', 'zh-Hans', 'zh-Hant'].includes(requestedLanguage)) {
    setLanguage(requestedLanguage);
    ui.setLanguage(requestedLanguage);
  }
  if (!localFile && landing.get('online') === '1') ui.setView('online');
  const historyReady = initializeHistory();
  root.addEventListener('focus', refreshHistory);
  document.addEventListener('click', (event) => {
    root.NeoAudio.unlock();
    if (event.target.closest('button')) root.NeoAudio.play('click');
  });
  document.addEventListener('keydown', () => root.NeoAudio.unlock());
  (async () => {
    try {
      await root.QuizAccess.restore({ signal: restoreController.signal });
    } catch (error) {
      if (error.name !== 'AbortError' && !root.QuizAdmin)
        try {
          root.QuizAccess.lock();
        } catch {}
    }
    ui.render();
    if (
      !localFile &&
      landing.get('online') !== '1' &&
      autoResume &&
      session &&
      (!session.isHost || root.QuizAdmin)
    )
      connect(session);
  })();
  if (localFile) ui.status('localService');
  else ensureCatalog().catch(() => {});
  root.addEventListener('online', () => {
    if (!localFile && serviceFailed && !connection) app.retryService();
  });
  document.addEventListener('fullscreenchange', () => ui.render());
})(window);
