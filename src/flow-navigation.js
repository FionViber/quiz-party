/* Shared pagination for multilingual flowing text.  This file has no app
 * state of its own; the host supplies the existing WeakMap and painter. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NeoFlowNavigation = Object.freeze(api);
})(typeof window === 'undefined' ? globalThis : window, function () {
  const LANG_SUFFIX = /-(?:en|zh-Hans|zh-Hant)$/;

  function groupKey(el) {
    const shared=el.closest?.('[data-flow-group-root]');
    if(shared?.dataset?.flowGroupRoot)return shared.dataset.flowGroupRoot;
    const id = String(el.dataset.flowId || '');
    // Prompt, answer and option flows are rendered once per UI language. The
    // search dialog deliberately keeps one independent flow per language.
    if (/^(prompt|answer|option)-/.test(id)) {
      return id.replace(LANG_SUFFIX, '');
    }
    return id;
  }

  function navFor(el) { return el.querySelector('.flow-nav'); }
  function visible(el) { return !!(el && el.getClientRects && el.getClientRects().length); }

  function refresh(root, options) {
    if (!root || !options) return [];
    const { flowData, flowPages, paintFlow } = options;
    if (!flowData || !flowPages || typeof paintFlow !== 'function') return [];
    const groups = new Map();
    [...root.querySelectorAll('.flow')].filter(visible).forEach(el => {
      const entry = flowData.get(el);
      if (!entry || !Array.isArray(entry.pages) || !entry.pages.length) return;
      const key = groupKey(el);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ el, entry });
    });

    for (const [key, members] of groups) {
      const maxPages = Math.max(...members.map(m => m.entry.pages.length));
      const saved = Number.isInteger(flowPages[key]) ? flowPages[key] : 0;
      const index = Math.max(0, Math.min(saved, maxPages - 1));
      flowPages[key] = index;
      const owner = members.find(m => m.entry.pages.length === maxPages) || members[0];
      const container=owner.el.closest?.('[data-flow-group-root]');
      const sharedNav=container?.querySelector?.(':scope > .flow-nav');
      members.forEach(member => {
        member.el.dataset.flowGroup = key;
        member.el.dataset.flowNavOwner = member.el === owner.el ? 'true' : 'false';
        member.entry.index = Math.min(index, member.entry.pages.length - 1);
        paintFlow(member.el);
        const nav = navFor(member.el);
        if (!nav) return;
        nav.hidden = !!sharedNav || member.el !== owner.el || maxPages <= 1;
        nav.dataset.flowGroup = key;
        if (member.el === owner.el) {
          const buttons = nav.querySelectorAll('button');
          if (buttons.length >= 2) {
            buttons[0].disabled = index <= 0;
            buttons[1].disabled = index >= maxPages - 1;
          }
          const count = nav.querySelector('span');
          if (count) count.textContent = `${index + 1} / ${maxPages}`;
        }
      });
      if(sharedNav){
        sharedNav.hidden=maxPages<=1;
        sharedNav.dataset.flowGroup=key;
        const buttons=sharedNav.querySelectorAll('button');
        buttons[0].disabled=index<=0;buttons[1].disabled=index>=maxPages-1;
        sharedNav.querySelector('span').textContent=`${index+1} / ${maxPages}`;
      }
    }
    return [...groups.keys()];
  }

  function step(el, delta, options) {
    if (!el || !options) return false;
    const { flowData, flowPages, paintFlow } = options;
    if (!flowData || !flowPages || typeof paintFlow !== 'function') return false;
    const key = el.dataset.flowGroupRoot || el.dataset.flowGroup || groupKey(el);
    const root = el.closest('main, [role="dialog"], .modal, body') || document;
    const members = [...root.querySelectorAll(`.flow[data-flow-group="${CSS.escape(key)}"]`)]
      .map(node => ({ el: node, entry: flowData.get(node) }))
      .filter(item => item.entry && Array.isArray(item.entry.pages));
    if (!members.length) return false;
    const maxPages = Math.max(...members.map(item => item.entry.pages.length));
    const current = Number.isInteger(flowPages[key]) ? flowPages[key] : 0;
    const next = Math.max(0, Math.min(maxPages - 1, current + Number(delta || 0)));
    flowPages[key] = next;
    members.forEach(item => {
      item.entry.index = Math.min(next, item.entry.pages.length - 1);
      paintFlow(item.el);
    });
    refresh(root, options);
    return true;
  }

  return { refresh, step, groupKey };
});
