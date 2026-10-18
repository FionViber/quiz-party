/* Compact local cache encoding for an in-memory game round. */
(function (root) {
  'use strict';

  const fingerprintCache = new WeakMap();
  const isObject = value => value !== null && typeof value === 'object';

  function copy(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function packList(builtins) {
    if (Array.isArray(builtins)) return builtins;
    if (builtins && Array.isArray(builtins.packs)) return builtins.packs;
    if (builtins && isObject(builtins)) return Object.values(builtins).filter(p => isObject(p) && Array.isArray(p.questions));
    return [];
  }

  function packIdentity(pack, Archive) {
    if (!isObject(pack) || typeof pack.id !== 'string') throw new Error('Invalid question pack');
    if (!Archive || typeof Archive.fingerprint !== 'function') throw new Error('Archive fingerprinting is unavailable');
    let byArchive = fingerprintCache.get(pack);
    if (!byArchive) { byArchive = new WeakMap(); fingerprintCache.set(pack, byArchive); }
    let fp = byArchive.get(Archive);
    if (!fp) { fp = Archive.fingerprint(pack); byArchive.set(Archive, fp); }
    return { id: pack.id, version: pack.version, schemaVersion: pack.schemaVersion, fingerprint: fp };
  }

  function sameIdentity(a, b) {
    return !!a && !!b && a.id === b.id && a.version === b.version && a.schemaVersion === b.schemaVersion && a.fingerprint === b.fingerprint;
  }

  function encodeGame(game, builtins, Archive) {
    if (!isObject(game) || !isObject(game.pack)) throw new Error('No current game');
    const identity = packIdentity(game.pack, Archive);
    const installed = packList(builtins).find(pack => {
      if (pack === game.pack) return true;
      try { return sameIdentity(packIdentity(pack, Archive), identity); } catch (_) { return false; }
    });
    // Exclude the pack before cloning. Cloning the 6 MB builtin on every
    // localStorage write would defeat the compact-cache purpose.
    const { pack: _pack, ...state } = game;
    const round = copy(state);
    if (installed) {
      round.packRef = identity;
    } else {
      round.pack = copy(game.pack);
    }
    return round;
  }

  function decodeGame(raw, builtins, Archive) {
    if (!isObject(raw)) throw new Error('Invalid cached game');
    const round = copy(raw);
    if (round.packRef !== undefined) {
      if (round.pack !== undefined) throw new Error('Invalid cached game: both pack reference and full pack are present');
      const ref = round.packRef;
      if (!isObject(ref) || typeof ref.id !== 'string' || typeof ref.fingerprint !== 'string') throw new Error('Invalid cached question pack reference');
      const installed = packList(builtins).find(pack => {
        try { return sameIdentity(packIdentity(pack, Archive), ref); } catch (_) { return false; }
      });
      if (!installed) throw new Error('Cached question pack is missing or has changed: ' + ref.id);
      delete round.packRef;
      round.pack = installed;
      return round;
    }
    if (!isObject(round.pack)) throw new Error('Cached game has no question pack');
    return round;
  }

  const api = Object.freeze({ encodeGame, decodeGame, packIdentity });
  root.NeoCache = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
