(function (root) {
  'use strict';
  const namespace = root.QuizConfig?.storageNamespace || '';
  const SESSION_KEY = 'quizparty.admin.v1' + (namespace ? '.' + namespace : '');
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let payload = null;
  let envelope = null;
  let envelopePromise = null;
  let offlineFrame = null;
  const abortError = () => Object.assign(new Error('Unlock cancelled'), { name: 'AbortError' });
  const checkSignal = (signal) => {
    if (signal?.aborted) throw abortError();
  };

  const bytes = (value) => {
    const normalized =
      value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
    return Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
  };
  const b64 = (value) => {
    let text = '';
    new Uint8Array(value).forEach((byte) => {
      text += String.fromCharCode(byte);
    });
    return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  async function derive(password, salt, iterations, usages) {
    const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
      'deriveKey'
    ]);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      true,
      usages
    );
  }

  async function decrypt(password, source, signal) {
    checkSignal(signal);
    if (!source || source.format !== 'quizparty-admin-v1')
      throw new Error('Invalid administrator envelope');
    const all = bytes(source.payload);
    if (all.length <= 64) throw new Error('Invalid administrator payload');
    const key = await derive(password, all.slice(0, 32), source.iterations, ['decrypt']);
    const clear = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: all.slice(32, 48) },
      key,
      all.slice(48)
    );
    checkSignal(signal);
    return { clear: JSON.parse(decoder.decode(clear)), key };
  }

  async function loadEnvelope() {
    if (envelope) return envelope;
    if (envelopePromise) return envelopePromise;
    envelopePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.async = true;
      script.src = root.QuizConfig?.adminAsset || 'admin.enc.js';
      script.onload = () => {
        const candidate = root.QuizEncryptedAdmin;
        try {
          if (
            !candidate ||
            candidate.format !== 'quizparty-admin-v1' ||
            !Number.isInteger(candidate.iterations) ||
            candidate.iterations < 2_000_000 ||
            candidate.iterations > 20_000_000 ||
            typeof candidate.payload !== 'string' ||
            !/^[A-Za-z0-9_-]+$/.test(candidate.payload) ||
            candidate.payload.length < 100
          ) {
            throw new Error('Invalid administrator envelope');
          }
          envelope = candidate;
          resolve(candidate);
        } catch (error) {
          reject(error);
        } finally {
          try {
            delete root.QuizEncryptedAdmin;
          } catch (_) {}
          script.remove();
          envelopePromise = null;
        }
      };
      script.onerror = () => {
        envelopePromise = null;
        script.remove();
        reject(new Error('Administrator module is unavailable'));
      };
      (document.head || document.body).append(script);
    });
    return envelopePromise;
  }

  function executeAdmin(clear) {
    if (!clear || typeof clear.adminScript !== 'string')
      throw new Error('Administrator module is incomplete');
    const run = new Function('window', clear.adminScript);
    run(root);
    if (!root.QuizAdmin) throw new Error('Administrator module did not register');
  }

  async function unlock(password, { signal } = {}) {
    checkSignal(signal);
    const source = await loadEnvelope();
    const result = await decrypt(password, source, signal);
    checkSignal(signal);
    payload = result.clear;
    try {
      const digest = await crypto.subtle.digest('SHA-256', encoder.encode(source.payload));
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          envelopeDigest: b64(digest),
          key: await crypto.subtle.exportKey('jwk', result.key)
        })
      );
    } catch (_) {
      /* Quota or private browsing may disable refresh restore. */
    }
    checkSignal(signal);
    executeAdmin(payload);
    return { unlocked: true, hasOffline: typeof payload.offlineHtml === 'string' };
  }

  async function restore({ signal } = {}) {
    checkSignal(signal);
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) return false;
    const source = await loadEnvelope();
    checkSignal(signal);
    const record = JSON.parse(saved);
    if (!record.key) return false;
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(source.payload));
    if (record.envelopeDigest !== b64(digest)) return false;
    const key = await crypto.subtle.importKey('jwk', record.key, { name: 'AES-GCM' }, false, [
      'decrypt'
    ]);
    const all = bytes(source.payload);
    const clear = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: all.slice(32, 48) },
      key,
      all.slice(48)
    );
    checkSignal(signal);
    payload = JSON.parse(decoder.decode(clear));
    checkSignal(signal);
    executeAdmin(payload);
    return true;
  }

  function lock() {
    payload = null;
    if (offlineFrame?.closeOffline) offlineFrame.closeOffline();
    offlineFrame = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (_) {}
    delete root.QuizAdmin;
  }

  function openOffline({ language: initialLanguage } = {}) {
    if (!payload || typeof payload.offlineHtml !== 'string')
      throw new Error('Administrator mode is locked');
    if (offlineFrame) return offlineFrame;
    const container = document.createElement('div');
    container.className = 'quiz-offline-container';
    container.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;background:#f5f0e6;display:flex;flex-direction:column;';
    const bar = document.createElement('div');
    bar.className = 'quiz-offline-bar';
    bar.style.cssText =
      'height:54px;min-height:54px;display:flex;align-items:center;justify-content:flex-end;padding:8px 16px;background:#f5f0e6;border-bottom:3px solid #000;';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'quiz-offline-close';
    const language = root.QuizApp?.getLanguage?.() || document.documentElement?.lang || 'zh-Hans';
    close.textContent =
      { en: 'Back to mode selection [ ` ]', 'zh-Hant': '返回模式選擇 [ ` ]' }[language] ||
      '返回模式选择 [ ` ]';
    close.style.cssText =
      'padding:7px 14px;background:#fff;border:3px solid #000;box-shadow:4px 4px #000;cursor:pointer;';
    const frame = document.createElement('iframe');
    frame.allowFullscreen = true;
    frame.className = 'quiz-offline-frame';
    frame.title = 'Quiz Party offline mode';
    frame.style.cssText = 'display:block;width:100%;height:calc(100% - 54px);border:0;flex:1;';
    const initialSettings = { NeoStorageNamespace: namespace };
    if (['en', 'zh-Hans', 'zh-Hant'].includes(initialLanguage))
      initialSettings.NeoInitialLanguage = initialLanguage;
    frame.srcdoc = payload.offlineHtml.replace(
      '</head>',
      '<script>Object.assign(window,' + JSON.stringify(initialSettings) + ');</script></head>'
    );
    const closeOffline = () => {
      if (offlineFrame !== frame) return;
      const doc = frame.contentDocument;
      const finalLanguage = doc?.getElementById?.('main')?.childElementCount
        ? doc.documentElement.lang
        : initialLanguage;
      container.remove();
      offlineFrame = null;
      if (application) application.inert = previousInert;
      if (root.QuizApp?.onOfflineClose) root.QuizApp.onOfflineClose(finalLanguage);
      else root.QuizApp?.render?.();
    };
    close.addEventListener('click', closeOffline);
    bar.append(close);
    container.append(bar, frame);
    const application = document.getElementById?.('quiz-online');
    const previousInert = application?.inert || false;
    if (application) application.inert = true;
    document.body.append(container);
    container.addEventListener('keydown', (event) => {
      if (
        event.code === 'Backquote' &&
        !event.repeat &&
        !event.target?.matches?.('input,textarea,select,[contenteditable="true"]')
      ) {
        event.preventDefault();
        closeOffline();
      }
    });
    const attachedDocuments = new WeakSet();
    const attachShortcut = () => {
      const doc = frame.contentDocument;
      if (!doc || attachedDocuments.has(doc)) return;
      attachedDocuments.add(doc);
      doc.addEventListener('keydown', (event) => {
        if (event.code !== 'Backquote' || event.repeat) return;
        const target = event.target;
        if (target?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
        event.preventDefault();
        closeOffline();
      });
      doc.addEventListener('click', (event) => {
        const anchor = event.target.closest?.('a[href^="#"]');
        if (!anchor) return;
        const id = anchor.getAttribute('href').slice(1),
          target = doc.getElementById(id);
        if (!target) return;
        event.preventDefault();
        target.focus({ preventScroll: true });
      });
      let reportedLanguage;
      const reportLanguage = () => {
        if (!doc.getElementById?.('main')?.childElementCount) return;
        const value = doc.documentElement.lang;
        if (!['en', 'zh-Hans', 'zh-Hant'].includes(value) || reportedLanguage === value) return;
        reportedLanguage = value;
        root.QuizApp?.onOfflineLanguage?.(value);
        const label = {
          en: 'Back to mode selection',
          'zh-Hans': '返回模式选择',
          'zh-Hant': '返回模式選擇'
        }[value];
        close.textContent = label + ' [ ' + String.fromCharCode(96) + ' ]';
      };
      if (root.MutationObserver) {
        const observer = new root.MutationObserver(reportLanguage);
        observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['lang'] });
      }
      reportLanguage();
    };
    frame.addEventListener('load', attachShortcut);
    attachShortcut();
    frame.closeOffline = closeOffline;
    offlineFrame = frame;
    return frame;
  }

  async function adminProof(challenge) {
    if (!payload?.adminPrivateKeyJwk) throw new Error('Administrator mode is locked');
    const message = typeof challenge === 'string' ? challenge : challenge?.message;
    if (typeof message !== 'string' || !message) throw new Error('Invalid challenge');
    const key = await crypto.subtle.importKey(
      'jwk',
      payload.adminPrivateKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      encoder.encode(message)
    );
    return b64(signature);
  }

  root.QuizAccess = Object.freeze({ unlock, restore, lock, openOffline, adminProof });
})(window);
