/* Pure question-tag grouping and filtering for round setup. */
(function (root) {
  'use strict';

  const LANGUAGES = Object.freeze(['en', 'zh-Hans', 'zh-Hant']);
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const clean = value => text(value) ? value.trim() : '';
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  // FNV-1a keeps an ID short while remaining stable across browsers and
  // independent of question order. Labels stay in the group object for UI.
  function hash(value, seed = 2166136261) {
    let result = seed >>> 0;
    for (let i = 0; i < value.length; i++) {
      result ^= value.charCodeAt(i);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16).padStart(8, '0');
  }

  function categoryFor(pack, question) {
    return (Array.isArray(pack?.categories) ? pack.categories : [])
      .find(item => item && item.id === question?.categoryId) || null;
  }

  function rawTag(question) {
    if (text(question?.tag)) return question.tag.trim();
    if (object(question?.tag)) return question.tag;
    if (Array.isArray(question?.tags)) {
      const first = question.tags.find(text);
      if (first) return first.trim();
    }
    return '';
  }

  function firstStringTag(question) {
    return Array.isArray(question?.tags)
      ? clean(question.tags.find(text))
      : '';
  }

  function labelsFor(pack, question) {
    const category = categoryFor(pack, question);
    const categoryName = category?.name;
    const tag = rawTag(question);
    const labels = {};
    const stringTag = typeof tag === 'string' ? clean(tag) : '';
    const arrayTag = firstStringTag(question);
    const fallback = stringTag || arrayTag || clean(question?.categoryId) || 'Uncategorised';
    for (const language of LANGUAGES) {
      const tagValue = stringTag || (object(tag) ? clean(tag[language]) : '') || arrayTag;
      const categoryValue = object(categoryName) ? clean(categoryName[language]) : '';
      labels[language] = tagValue || categoryValue || fallback;
    }
    return labels;
  }

  function groupId(labels) {
    const signature = LANGUAGES.map(language => labels[language]).join('\u001f');
    return `tag-${hash(signature)}-${hash(signature, 2654435761)}`;
  }

  const groupCache = new WeakMap();
  function listGroups(pack) {
    if (pack && typeof pack === 'object') {
      const cached = groupCache.get(pack);
      if (cached) return cached;
    }
    const groups = new Map();
    const questions = Array.isArray(pack?.questions) ? pack.questions : [];
    questions.forEach(question => {
      const labels = labelsFor(pack, question);
      const id = groupId(labels);
      let group = groups.get(id);
      if (!group) {
        group = { id, labels: Object.freeze({ ...labels }), count: 0, questionIds: [] };
        groups.set(id, group);
      }
      group.count += 1;
      if (question?.id !== undefined && question?.id !== null) group.questionIds.push(String(question.id));
    });
    const result = Object.freeze(Array.from(groups.values()).map(group => Object.freeze({
      ...group,
      questionIds: Object.freeze(group.questionIds.slice())
    })));
    if (pack && typeof pack === 'object') groupCache.set(pack, result);
    return result;
  }

  function normalizeSelection(pack, selection) {
    const all = listGroups(pack).map(group => group.id);
    // Missing state means a new setup: every tag is enabled. [] deliberately
    // means no tags, so an accidental truthiness check cannot select all.
    if (selection === undefined || selection === null) return all;
    const candidate = Array.isArray(selection)
      ? selection
      : (Array.isArray(selection.selectedIds) ? selection.selectedIds : []);
    const known = new Set(all);
    return Array.from(new Set(candidate.map(String))).filter(id => known.has(id));
  }

  function selectedGroupIds(pack, selection) {
    return new Set(normalizeSelection(pack, selection));
  }

  function groupForQuestion(pack, question) {
    const labels = labelsFor(pack, question);
    return Object.freeze({ id: groupId(labels), labels });
  }

  function matches(pack, question, selection) {
    return selectedGroupIds(pack, selection).has(groupForQuestion(pack, question).id);
  }

  function filterQuestions(pack, selection, questions) {
    const source = Array.isArray(questions) ? questions : (Array.isArray(pack?.questions) ? pack.questions : []);
    const selected = selectedGroupIds(pack, selection);
    return source.filter(question => selected.has(groupForQuestion(pack, question).id));
  }

  const api = Object.freeze({
    LANGUAGES,
    labelsFor,
    listGroups,
    normalizeSelection,
    selectedGroupIds,
    groupForQuestion,
    matches,
    filterQuestions
  });
  root.NeoCategoryFilter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
