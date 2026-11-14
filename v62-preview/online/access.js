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
  const MAX_ENCODED_PAYLOAD = Math.ceil((64 * 1024 * 1024) / 3) * 4;
  const timerSet = root.setTimeout || (typeof setTimeout === 'function' ? setTimeout : null);
  const timerClear = root.clearTimeout || (typeof clearTimeout === 'function' ? clearTimeout : null);
  const abortError = () => Object.assign(new Error('Unlock cancelled'), { name: 'AbortError' });
  const checkSignal = (signal) => {
    if (signal?.aborted) throw abortError();
  };
  const report = (callback, phase, detail = {}) => {
    try { callback?.(phase, detail); } catch (_) {}
  };
  const codedError = (message, code) => Object.assign(new Error(message), { code });
  const ensureCrypto = () => {
    if (!root.crypto?.subtle?.importKey || !root.crypto?.subtle?.decrypt)
      throw codedError('Administrator cryptography is unavailable. Use a modern secure browser.', 'ADMIN_CRYPTO_UNSUPPORTED');
  };
  const validateEnvelope = (candidate) => {
    if (!candidate || candidate.format !== 'quizparty-admin-v1' || !Number.isInteger(candidate.iterations) || candidate.iterations < 2_000_000 || candidate.iterations > 20_000_000 || typeof candidate.payload !== 'string' || !/^[A-Za-z0-9_-]+$/.test(candidate.payload) || candidate.payload.length < 100 || candidate.payload.length > MAX_ENCODED_PAYLOAD || (candidate.compression !== undefined && candidate.compression !== 'gzip'))
      throw codedError('Invalid administrator envelope', 'ADMIN_LOAD_FAILED');
    return candidate;
  };

  const bytes = async (value, signal) => {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
    const chunkSize = 1024 * 1024 - ((1024 * 1024) % 4), chunks = [];
    let total = 0;
    for (let offset = 0; offset < normalized.length; offset += chunkSize) {
      checkSignal(signal);
      const part = atob(normalized.slice(offset, Math.min(normalized.length, offset + chunkSize)));
      const chunk = new Uint8Array(part.length);
      for (let i = 0; i < part.length; i++) chunk[i] = part.charCodeAt(i);
      chunks.push(chunk);
      total += chunk.length;
      if (offset + chunkSize < normalized.length && timerSet)
        await new Promise((resolve) => timerSet(resolve, 0));
    }
    const result = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) { result.set(chunk, at); at += chunk.length; }
    return result;
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

  function abortable(promise, signal) {
    if (!signal) return promise;
    checkSignal(signal);
    return new Promise((resolve, reject) => {
      const cancel = () => reject(abortError());
      signal.addEventListener('abort', cancel, { once: true });
      promise.then(resolve, reject).then(
        () => signal.removeEventListener('abort', cancel),
        () => signal.removeEventListener('abort', cancel)
      );
    });
  }

  async function decodeClear(clear, compression, signal, onProgress) {
    checkSignal(signal);
    if (compression === 'gzip') {
      if (typeof DecompressionStream !== 'function')
        throw Object.assign(new Error('Administrator compression is unsupported in this browser'), { code: 'ADMIN_COMPRESSION_UNSUPPORTED' });
      report(onProgress, 'decompress');
      const stream = new Blob([clear]).stream().pipeThrough(new DecompressionStream('gzip'));
      const buffer = await abortable(new Response(stream).arrayBuffer(), signal);
      checkSignal(signal);
      return new Uint8Array(buffer);
    }
    if (compression !== undefined && compression !== null)
      throw Object.assign(new Error('Unsupported administrator compression'), { code: 'ADMIN_COMPRESSION_UNSUPPORTED' });
    return new Uint8Array(clear);
  }

  async function decrypt(password, source, signal, onProgress) {
    checkSignal(signal);
    if (!source || source.format !== 'quizparty-admin-v1')
      throw new Error('Invalid administrator envelope');
    report(onProgress, 'load');
    const all = await bytes(source.payload, signal);
    if (all.length <= 64) throw new Error('Invalid administrator payload');
    report(onProgress, 'derive');
    const key = await abortable(derive(password, all.slice(0, 32), source.iterations, ['decrypt']), signal);
    report(onProgress, 'decrypt');
    const clear = await abortable(crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: all.slice(32, 48) },
      key,
      all.slice(48)
    ), signal);
    const plain = await decodeClear(clear, source.compression, signal, onProgress);
    checkSignal(signal);
    return { clear: JSON.parse(decoder.decode(plain)), key };
  }

  async function loadEnvelope(signal, onProgress) {
    if (envelope) return envelope;
    if (envelopePromise) return envelopePromise;
    const asset = root.QuizConfig?.adminAsset || 'admin.enc.js';
    const protocol = root.location?.protocol || (typeof location !== 'undefined' ? location.protocol : '');
    if (protocol !== 'file:' && typeof fetch === 'function') {
      const pending = loadEnvelopeHttp(asset, signal, onProgress);
      envelopePromise = pending;
      pending.then(() => { if (envelopePromise === pending && !envelope) envelopePromise = null; }, () => { if (envelopePromise === pending) envelopePromise = null; });
      return pending;
    }
    const pending = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.async = true;
      script.src = root.QuizConfig?.adminAsset || 'admin.enc.js';
      report(onProgress, 'load-start');
      let settled = false;
      const timeoutMs = Number(root.QuizConfig?.adminLoadTimeoutMs) || 30000;
      const timer = timerSet ? timerSet(() => fail(codedError('Administrator module load timed out', 'ADMIN_LOAD_TIMEOUT')), timeoutMs) : null;
      const cleanup = () => {
        if (timerClear && timer !== null) timerClear(timer);
        signal?.removeEventListener('abort', cancel);
        script.remove();
      };
      const fail = (error) => {
        if (settled) return;
        settled = true; cleanup(); if (envelopePromise === pending) envelopePromise = null; reject(error);
      };
      const cancel = () => fail(abortError());
      signal?.addEventListener('abort', cancel, { once: true });
      script.onload = () => {
        if (settled) return;
        const candidate = root.QuizEncryptedAdmin;
        try {
          validateEnvelope(candidate); checkSignal(signal);
          envelope = candidate;
          settled = true; cleanup(); if (envelopePromise === pending) envelopePromise = null;
          resolve(candidate);
        } catch (error) {
          fail(error);
        } finally {
          try {
            delete root.QuizEncryptedAdmin;
          } catch (_) {}
        }
      };
      script.onerror = () => fail(codedError('Administrator module is unavailable', 'ADMIN_LOAD_FAILED'));
      (document.head || document.body).append(script);
    });
    envelopePromise = pending;
    return pending;
  }

  async function loadEnvelopeHttp(asset, signal, onProgress) {
    if (typeof fetch !== 'function') throw codedError('Administrator module could not be downloaded.', 'ADMIN_LOAD_FAILED');
    const controller = new AbortController();
    let totalTimer, stallTimer, abort;
    const touch = () => {
      if (timerClear && stallTimer) timerClear(stallTimer);
      if (timerSet) stallTimer = timerSet(() => controller.abort(), 30000);
    };
    const clear = () => {
      if (timerClear) { if (totalTimer) timerClear(totalTimer); if (stallTimer) timerClear(stallTimer); }
      signal?.removeEventListener('abort', abort);
    };
    try {
      abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      checkSignal(signal);
      report(onProgress, 'load-start');
      if (timerSet) totalTimer = timerSet(() => controller.abort(), 120000);
      touch();
      const response = await fetch(new URL(asset, document.baseURI || root.location?.href).href, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw codedError('Administrator module is unavailable', 'ADMIN_LOAD_FAILED');
      const total = Number(response.headers?.get?.('Content-Length')) || 0;
      if (total > MAX_ENCODED_PAYLOAD + 1024) throw codedError('Administrator module is too large', 'ADMIN_LOAD_FAILED');
      const reader = response.body?.getReader?.();
      if (!reader) throw codedError('Administrator module could not be streamed.', 'ADMIN_LOAD_FAILED');
      let loaded = 0, text = '', decoderStream = new TextDecoder();
      touch();
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        checkSignal(signal); loaded += part.value.byteLength;
        if (loaded > MAX_ENCODED_PAYLOAD + 1024) { controller.abort(); throw codedError('Administrator module is too large', 'ADMIN_LOAD_FAILED'); }
        text += decoderStream.decode(part.value, { stream: true });
        report(onProgress, 'load-progress', { loaded, total }); touch();
      }
      text += decoderStream.decode();
      const match = text.match(/^\s*window\.QuizEncryptedAdmin\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
      if (!match) throw codedError('Invalid administrator envelope', 'ADMIN_LOAD_FAILED');
      const candidate = validateEnvelope(JSON.parse(match[1])); checkSignal(signal);
      envelope = candidate; return candidate;
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (error?.name === 'AbortError') throw codedError('Administrator module load timed out', 'ADMIN_LOAD_TIMEOUT');
      throw error;
    } finally { clear(); }
  }

  function executeAdmin(clear) {
    if (!clear || typeof clear.adminScript !== 'string')
      throw new Error('Administrator module is incomplete');
    const run = new Function('window', clear.adminScript);
    run(root);
    if (!root.QuizAdmin) throw new Error('Administrator module did not register');
  }

  async function unlock(password, { signal, onProgress } = {}) {
    checkSignal(signal);
    ensureCrypto();
    const source = await loadEnvelope(signal, onProgress);
    const result = await decrypt(password, source, signal, onProgress);
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
    report(onProgress, 'ready');
    executeAdmin(payload);
    return { unlocked: true, hasOffline: typeof payload.offlineHtml === 'string' };
  }

  async function restore({ signal, onProgress } = {}) {
    checkSignal(signal);
    ensureCrypto();
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) return false;
    const source = await loadEnvelope(signal, onProgress);
    checkSignal(signal);
    const record = JSON.parse(saved);
    if (!record.key) return false;
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(source.payload));
    if (record.envelopeDigest !== b64(digest)) return false;
    const key = await crypto.subtle.importKey('jwk', record.key, { name: 'AES-GCM' }, false, [
      'decrypt'
    ]);
    report(onProgress, 'load');
    const all = await bytes(source.payload, signal);
    report(onProgress, 'decrypt');
    const clear = await abortable(crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: all.slice(32, 48) },
      key,
      all.slice(48)
    ), signal);
    checkSignal(signal);
    const plain = await decodeClear(clear, source.compression, signal, onProgress);
    payload = JSON.parse(decoder.decode(plain));
    checkSignal(signal);
    report(onProgress, 'ready');
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
      '<script>Object.assign(window,' +
        JSON.stringify(initialSettings) +
        ');window.NeoDownload=function(blob,name){return parent.QuizApp.download(blob,name);};</script></head>'
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
