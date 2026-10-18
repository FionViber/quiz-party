/* Limit new player names by visible characters, including emoji sequences. */
(function (root) {
  'use strict';
  const LIMIT = 12;
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, {granularity:'grapheme'}) : null;
  function normalize(value, trim = false) {
    const text = String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').normalize('NFC');
    const parts = segmenter ? Array.from(segmenter.segment(text), item => item.segment) : Array.from(text);
    // Also bound pathological combining sequences while keeping ordinary names intact.
    let result = '';
    for (const part of parts.slice(0, LIMIT)) {
      if (result.length + part.length > 120) break;
      result += part;
    }
    return trim ? result.trim() : result;
  }
  const api = {LIMIT, normalize};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NeoPlayerNames = api;
})(typeof window === 'object' ? window : globalThis);
