/* Pure spatial navigation. Hidden questions are removed by the caller; used
 * questions stay in the grid as disabled slots. No game state is mutated. */
(function(root) {
  'use strict';
  const playable = slot => !!slot && !slot.disabled;

  function select(slots, currentId, page = 0, pageSize = 48) {
    const start = Math.max(0, page) * pageSize;
    const end = Math.min(slots.length, start + pageSize);
    const current = slots.findIndex(slot => slot.qid === currentId);
    if (current >= start && current < end && playable(slots[current])) return current;
    // After returning from a question, continue forward from that slot first.
    if (current >= start && current < end) {
      for (let i = current + 1; i < end; i++) if (playable(slots[i])) return i;
    }
    for (let i = start; i < end; i++) if (playable(slots[i])) return i;
    return -1;
  }

  function move(slots, currentId, direction, page = 0, columns = 8, pageSize = 48) {
    const step = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-1, ArrowDown:1}[direction];
    if (!step) return select(slots, currentId, page, pageSize);
    let current = select(slots, currentId, page, pageSize);
    if (current < 0) {
      // A completely answered page remains inspectable. An arrow can move to
      // the next/previous page that still contains a playable question.
      const start = step > 0 ? (page + 1) * pageSize : page * pageSize - 1;
      for (let i = start; i >= 0 && i < slots.length; i += step) {
        if (playable(slots[i])) return i;
      }
      return -1;
    }
    if (direction === 'ArrowLeft' || direction === 'ArrowRight') {
      for (let i = current + step; i >= 0 && i < slots.length; i += step) {
        if (playable(slots[i])) return i;
      }
      return current;
    }
    const column = current % columns;
    for (let row = Math.floor(current / columns) + step;
      row >= 0 && row * columns < slots.length; row += step) {
      const candidates = [];
      for (let i = row * columns; i < Math.min(slots.length, (row + 1) * columns); i++) {
        if (playable(slots[i])) candidates.push(i);
      }
      candidates.sort((a,b) => Math.abs(a % columns - column) - Math.abs(b % columns - column) || a-b);
      if (candidates.length) return candidates[0];
    }
    return current;
  }
  const api = Object.freeze({select,move});
  root.NeoBoardNavigation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
