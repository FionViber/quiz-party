(function (root) {
  'use strict';
  const namespace = root.QuizConfig?.storageNamespace || '';
  const DB_NAME = 'quizparty.history.v6' + (namespace ? '.' + namespace : ''),
    ERROR_CODE = 'HISTORY_STORAGE_FAILED';
  const History =
    root.QuizHistory || (typeof require === 'function' ? require('./history.js') : null);
  const failure = (cause) =>
    Object.assign(new Error('History storage failed'), { code: ERROR_CODE, cause });
  function create(indexedDB = root.indexedDB) {
    function open() {
      return new Promise((resolve, reject) => {
        let settled = false,
          request;
        const fail = (cause) => {
          if (!settled) {
            settled = true;
            reject(failure(cause));
          }
        };
        try {
          if (!indexedDB?.open) throw new Error('IndexedDB unavailable');
          request = indexedDB.open(DB_NAME, 1);
        } catch (error) {
          fail(error);
          return;
        }
        request.onupgradeneeded = () => {
          try {
            const db = request.result;
            if (!db.objectStoreNames.contains('records'))
              db.createObjectStore('records', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
          } catch (error) {
            try {
              request.transaction.abort();
            } catch {}
            fail(error);
          }
        };
        request.onerror = () => fail(request.error);
        request.onblocked = () => fail(new Error('Database blocked'));
        request.onsuccess = () => {
          if (settled) request.result.close();
          else {
            settled = true;
            resolve(request.result);
          }
        };
      });
    }
    async function operation(mode, work) {
      const db = await open();
      try {
        return await new Promise((resolve, reject) => {
          let transaction,
            result,
            settled = false;
          const fail = (error) => {
            if (settled) return;
            settled = true;
            try {
              transaction?.abort();
            } catch {}
            reject(failure(error));
          };
          const guard =
            (fn) =>
            (...args) => {
              try {
                fn(...args);
              } catch (error) {
                fail(error);
              }
            };
          try {
            transaction = db.transaction(['records', 'meta'], mode);
            transaction.oncomplete = () => {
              if (!settled) {
                settled = true;
                resolve(result);
              }
            };
            transaction.onerror = () => fail(transaction.error);
            transaction.onabort = () => fail(transaction.error);
            work(
              transaction.objectStore('records'),
              transaction.objectStore('meta'),
              (value) => {
                result = value;
              },
              guard
            );
          } catch (error) {
            fail(error);
          }
        });
      } finally {
        db.close();
      }
    }
    async function read() {
      const values = await operation('readonly', (records, _meta, result, guard) => {
        const request = records.getAll();
        request.onsuccess = guard(() => result(request.result || []));
      });
      return History.normalize(values, { strict: false });
    }
    function validate(records, strict) {
      try {
        return History.normalize(records, { strict });
      } catch (error) {
        throw failure(error);
      }
    }
    async function merge(records) {
      const clean = validate(records, true);
      await operation('readwrite', (store) => {
        for (const record of clean) store.put(record);
      });
      return read();
    }
    async function migrate(records) {
      const clean = validate(records, false);
      await operation('readwrite', (store, meta, _result, guard) => {
        const request = meta.get('migrated');
        request.onsuccess = guard(() => {
          if (request.result === true) return;
          for (const record of clean) {
            const existing = store.get(record.id);
            existing.onsuccess = guard(() => {
              if (existing.result === undefined) store.put(record);
            });
          }
          meta.put(true, 'migrated');
        });
      });
      return read();
    }
    return Object.freeze({ read, merge, migrate, dbName: DB_NAME, errorCode: ERROR_CODE });
  }
  if (typeof module === 'object' && module.exports)
    module.exports = { create, DB_NAME, ERROR_CODE };
  else root.QuizHistoryStore = create();
})(typeof window === 'object' ? window : globalThis);
