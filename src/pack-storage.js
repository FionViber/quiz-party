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
