(function (root) {
  'use strict';
  function create({
    t,
    escape: e,
    button: b,
    name,
    controls,
    getRoom,
    getLanguage,
    getDraft,
    pageControls
  }) {
    const languages = ['en', 'zh-Hans', 'zh-Hant'];
    const languageNames = { en: 'English', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文' };
    const local = (value, language) =>
      typeof value === 'string' ? value : value?.[language] || value?.en || '';
    const timer = (deadline) =>
      deadline ? '<strong class="qp-timer" data-deadline="' + deadline + '"></strong>' : '';
    function languagePanels(values) {
      return (
        '<div class="qp-prompt-languages">' +
        languages
          .map(
            (l) =>
              '<section lang="' +
              l +
              '"><small>' +
              languageNames[l] +
              '</small>' +
              values(l) +
              '</section>'
          )
          .join('') +
        '</div>'
      );
    }
    function standardAnswer() {
      const answer = getRoom().current?.standardAnswer;
      if (!answer) return '';
      return (
        '<article class="qp-question qp-standard"><h2>' +
        e(t('reveal')) +
        '</h2>' +
        languagePanels((l) => {
          const value = answer[l] || answer.en || {},
            text = typeof value === 'string' ? value : value.answer || '';
          const accepted = Array.isArray(value.acceptedAnswers)
            ? value.acceptedAnswers.filter((x) => x !== text)
            : [];
          return (
            '<p class="qp-question-prompt">' +
            e(text) +
            '</p>' +
            (accepted.length ? '<p class="qp-accepted">' + e(accepted.join(' / ')) + '</p>' : '')
          );
        }) +
        '</article>'
      );
    }
    function prompt() {
      const room = getRoom(),
        c = room.current;
      return (
        '<article class="qp-question" data-type="' +
        c.type +
        '"><div class="qp-question-meta"><span>' +
        e(t(c.type === 'choice' ? 'choiceType' : 'openType')) +
        '</span><span>' +
        e(t(room.settings.openResponse === 'oral' ? 'turnParticipation' : 'everyone')) +
        '</span><strong>' +
        c.points +
        ' ' +
        e(t('points')) +
        '</strong></div>' +
        languagePanels((l) => '<p class="qp-question-prompt">' + e(local(c.prompt, l)) + '</p>') +
        '</article>'
      );
    }
    function briefing() {
      const room = getRoom(),
        c = room.current,
        turn = room.settings.openResponse === 'oral';
      const offline = room.players.filter((p) => !p.online);
      return (
        '<section class="qp-card"><p class="qp-muted">' +
        e(t('questionNumber', { n: c.number })) +
        '</p><h1>' +
        e(t('readyToRead')) +
        '</h1><p>' +
        e(
          t(turn ? 'turnBriefing' : 'independentBriefing', {
            name: name(room.turnPlayerId),
            seconds: room.settings.answerSeconds
          })
        ) +
        '</p><div class="qp-question-meta"><span>' +
        e(t(c.type === 'choice' ? 'choiceType' : 'openType')) +
        '</span><strong>' +
        c.points +
        ' ' +
        e(t('points')) +
        '</strong></div>' +
        (offline.length
          ? '<p class="qp-alert">' +
            e(t('offlineBeforeQuestion', { names: offline.map((p) => p.name).join('、') })) +
            '</p>'
          : '') +
        '<p>' +
        e(t('briefingNoLeak')) +
        '</p><div class="qp-btn-row">' +
        controls() +
        '</div>' +
        (!room.viewer.isHost ? '<p class="qp-muted">' + e(t('waitingHostStart')) + '</p>' : '') +
        '</section>'
      );
    }
    function answering() {
      const room = getRoom(),
        c = room.current,
        me = room.viewer,
        draft = getDraft();
      const participants = c.participantIds || room.players.map((p) => p.id);
      const canAnswer = me.isPlayer && participants.includes(me.id);
      const oral = room.settings.openResponse === 'oral' && c.type === 'open';
      const editable = canAnswer && !me.submitted && !draft.busy;
      let response = '';
      if (oral) {
        response =
          '<article class="qp-card"><h2>' +
          e(t('speakerNow', { name: name(c.oralPlayerId || room.turnPlayerId) })) +
          '</h2><p>' +
          e(t('oralSingleHint')) +
          '</p>';
        if ((editable || me.isHost) && !c.submittedCount)
          response +=
            '<div class="qp-btn-row">' +
            b('oral-mark', t('oralFinalAnswer'), {}, 'primary') +
            b('pass', t('passQuestion')) +
            '</div>';
        response += '</article>';
      } else if (canAnswer) {
        if (c.type === 'choice') {
          response =
            '<div class="qp-options">' +
            c.options
              .map(
                (o, i) =>
                  '<button type="button" class="qp-option ' +
                  ((draft.selectedOption || c.mySubmission?.optionId) === o.id ? 'selected' : '') +
                  '" data-qpa="option" data-option="' +
                  e(o.id) +
                  '" data-option-index="' +
                  (i + 1) +
                  '" data-focus-key="option:' +
                  e(o.id) +
                  '"' +
                  (!editable ? ' disabled' : '') +
                  ' aria-pressed="' +
                  ((draft.selectedOption || c.mySubmission?.optionId) === o.id) +
                  '"><strong>' +
                  (i + 1) +
                  '.</strong> ' +
                  e(local(o.labels, getLanguage())) +
                  '</button>'
              )
              .join('') +
            '</div>';
        } else {
          response =
            '<label class="qp-label" for="qp-answer">' +
            e(t('yourAnswer')) +
            '</label><textarea class="qp-field qp-answer-input" id="qp-answer" rows="4" maxlength="1000"' +
            (!editable ? ' disabled' : '') +
            '>' +
            e(c.mySubmission?.text ?? draft.answerDraft) +
            '</textarea><p class="qp-muted">' +
            e(t('answerLimit')) +
            ' <span data-answer-count>' +
            [...draft.answerDraft.normalize('NFC').trim()].length +
            '/500</span></p>';
        }
        response +=
          '<div class="qp-btn-row">' +
          (editable
            ? b(
                'submit',
                t('submit'),
                {
                  disabled:
                    c.type === 'choice'
                      ? !draft.selectedOption
                      : !draft.answerDraft.trim() ||
                        [...draft.answerDraft.normalize('NFC').trim()].length > 500
                },
                'primary'
              ) + b('pass', t('passQuestion'))
            : '<strong>' +
              e(t(c.mySubmission?.status === 'passed' ? 'passedLocked' : 'lockedAnswer')) +
              '</strong>') +
          '</div>';
      } else {
        response =
          '<p class="qp-alert">' +
          e(
            t(room.settings.openResponse === 'oral' ? 'watchTurn' : 'hostWaitAnswers', {
              name: name(room.turnPlayerId)
            })
          ) +
          '</p>';
      }
      return (
        '<section class="qp-stage"><div class="qp-stage-top"><h1>' +
        e(t('questionNumber', { n: c.number })) +
        '</h1>' +
        timer(c.deadlineAt) +
        '<span>' +
        c.submittedCount +
        ' / ' +
        participants.length +
        ' ' +
        e(t('submitted')) +
        '</span></div>' +
        prompt() +
        response +
        '<p class="qp-muted">' +
        e(t(c.type === 'choice' ? 'choiceScoringHint' : 'openScoringHint')) +
        '</p><div class="qp-btn-row qp-bottom-actions">' +
        controls() +
        '</div></section>'
      );
    }
    function statusLabel(a) {
      return t(
        a.status === 'passed'
          ? 'passed'
          : a.status === 'timeout'
            ? 'timedOut'
            : a.status === 'notTurn'
              ? 'notThisTurn'
              : a.unanswered
                ? 'unanswered'
                : a.correct === true
                  ? 'correct'
                  : a.correct === false
                    ? 'incorrect'
                    : 'notGraded'
      );
    }
    function recordedAnswer(a) {
      const c = getRoom().current;
      if (a.unanswered) return '';
      if (c.type === 'choice') {
        const choice = c.options?.find((o) => o.id === a.optionId);
        return choice ? local(choice.labels, getLanguage()) : t('notGraded');
      }
      return a.text || t('oralRecorded');
    }
    function grading(page) {
      const room = getRoom(),
        c = room.current,
        me = room.viewer,
        draft = getDraft();
      const voting = room.settings.grading === 'vote' && room.phase === 'grading';
      const assignments = new Set(me.reviewAnswerIds || []);
      const eligible = voting && !me.gradeSubmitted && !c.gradingClosed && assignments.size > 0;
      const visibleAnswers = voting
        ? (c.answers || []).filter(a => assignments.has(a.id))
        : room.phase === 'review'
          ? (c.answers || []).filter(a => !a.unanswered && a.correct === null && (me.isHost || a.reviewerId === me.id || a.playerId === me.id))
          : (c.answers || []).filter(a => a.status !== 'notTurn');
      const total = Math.max(1, Math.ceil(visibleAnswers.length / 8));
      const currentPage = Math.max(0, Math.min(page, total - 1));
      const cards = visibleAnswers
        .slice(currentPage * 8, currentPage * 8 + 8)
        .map((a, i) => {
          const own = a.playerId === me.id,
            decided = typeof a.correct === 'boolean';
          let actions = '';
          if (!a.unanswered && !decided) {
            if (room.phase === 'review' && a.reviewerId === me.id) {
              actions =
                b('review', t('correct'), { answer: a.id, correct: true }, 'small') +
                b('review', t('incorrect'), { answer: a.id, correct: false }, 'small');
            } else if (
              room.phase === 'grading' &&
              room.settings.grading === 'host' &&
              me.isHost &&
              !own
            ) {
              actions =
                b('judge', t('correct'), { answer: a.id, correct: true }, 'small') +
                b('judge', t('incorrect'), { answer: a.id, correct: false }, 'small');
            } else if (eligible && assignments.has(a.id)) {
              actions =
                b(
                  'ballot',
                  t('correct'),
                  { answer: a.id, correct: true, 'aria-pressed': draft.ballot.get(a.id) === true },
                  draft.ballot.get(a.id) === true ? 'small primary' : 'small'
                ) +
                b(
                  'ballot',
                  t('incorrect'),
                  {
                    answer: a.id,
                    correct: false,
                    'aria-pressed': draft.ballot.get(a.id) === false
                  },
                  draft.ballot.get(a.id) === false ? 'small primary' : 'small'
                );
            }
          }
          const label = voting
            ? t('anonymousAnswer', { n: currentPage * 8 + i + 1 })
            : name(a.playerId);
          const status =
            a.reviewerId && !decided ? t('reviewBy', { name: name(a.reviewerId) }) : statusLabel(a);
          return (
            '<article class="qp-answer"><div class="qp-answer-head"><strong>' +
            e(label) +
            '</strong><span>' +
            e(status) +
            '</span></div><p class="qp-answer-text">' +
            e(recordedAnswer(a)) +
            '</p><div class="qp-btn-row">' +
            actions +
            '</div></article>'
          );
        })
        .join('');
      return (
        '<section class="qp-stage"><div class="qp-stage-top"><h1>' +
        e(t(room.phase === 'review' ? 'review' : 'grading')) +
        '</h1>' +
        timer(c.gradingDeadlineAt) +
        (voting
          ? '<span>' +
            c.gradingSubmittedCount +
            ' / ' +
            (c.eligibleReviewerCount || 0) +
            ' ' +
            e(t('votesSubmitted')) +
            '</span>'
          : '') +
        '</div>' +
        standardAnswer() +
        '<p>' +
        e(t(voting ? 'assignedGradeHint' : 'hostGradeHint')) +
        '</p>' +
        (room.phase === 'review' &&
        c.answers.some((a) => !a.unanswered && a.correct === null && !a.reviewerId)
          ? '<p class="qp-alert">' + e(t('noIndependentReviewer')) + '</p>'
          : '') +
        ((voting && !assignments.size) || (room.phase === 'review' && !visibleAnswers.length)
          ? '<p class="qp-alert">' + e(t(me.isHost ? 'hostVotingMonitor' : 'noReviewAssignment')) + '</p>'
          : '') +
        '<div class="qp-answer-list">' +
        cards +
        '</div>' +
        pageControls(currentPage, total, 'grade-page') +
        '<div class="qp-btn-row">' +
        (eligible
          ? b('all-correct', t('allCorrect')) +
            b('all-wrong', t('allWrong')) +
            b('submit-votes', t('submitVotes'), {}, 'primary')
          : '') +
        (me.gradeSubmitted && voting ? '<strong>' + e(t('votesLocked')) + '</strong>' : '') +
        controls() +
        '</div></section>'
      );
    }
    function roundResults(page = 0) {
      const room = getRoom(),
        c = room.current,
        pending = room.phase === 'scoreReview';
      const answers = (c.answers || []).filter((a) => a.status !== 'notTurn');
      const total = Math.max(1, Math.ceil(answers.length / 8));
      const currentPage = Math.max(0, Math.min(page, total - 1));
      return (
        '<section class="qp-stage"><div class="qp-stage-top"><h1>' +
        e(t(pending ? 'scoreReview' : 'roundResults')) +
        '</h1><span>' +
        e(t('scoredCount', { n: room.history.length, total: room.settings.questionCount })) +
        '</span></div>' +
        standardAnswer() +
        '<p>' +
        e(t(pending ? 'scoreReviewHint' : 'roundConfirmedHint')) +
        '</p><div class="qp-round-verdicts">' +
        answers
          .slice(currentPage * 8, currentPage * 8 + 8)
          .map(
            (a) =>
              '<article class="qp-answer"><strong>' +
              e(name(a.playerId)) +
              '</strong><p class="qp-answer-text">' +
              e(recordedAnswer(a)) +
              '</p><span>' +
              e(statusLabel(a)) +
              ' ' +
              (a.delta > 0 ? '+' : '') +
              (a.delta ?? 0) +
              '</span>' +
              (a.votesFor !== null && a.votesFor !== undefined ? '<small>' + e(t('voteTally', { yes: a.votesFor, no: a.votesAgainst })) + '</small>' : '') +
              (a.reviewerId ? '<small>' + e(t('reviewBy', { name: name(a.reviewerId) })) + '</small>' : '') +
              (room.viewer.isHost && c.type === 'open' && !a.unanswered
                ? '<div class="qp-btn-row">' +
                  b('host-review-answer', t('reviewThisAnswer'), { answer: a.id }, 'small') +
                  '</div>'
                : '') +
              '</article>'
          )
          .join('') +
        '</div>' +
        pageControls(currentPage, total, 'grade-page') +
        '<div class="qp-card"><h2>' +
        e(t('currentScores')) +
        '</h2><div class="qp-score-list">' +
        room.players
          .map((p) => '<span><strong>' + e(p.name) + '</strong> ' + p.score + '</span>')
          .join('') +
        '</div></div><div class="qp-btn-row qp-bottom-actions">' +
        controls() +
        '</div>' +
        (!room.viewer.isHost
          ? '<p class="qp-muted">' + e(t(pending ? 'waitingHostScore' : 'waitingHostNext')) + '</p>'
          : '') +
        '</section>'
      );
    }
    return { briefing, answering, grading, roundResults, standardAnswer };
  }
  root.QuizRoundViews = Object.freeze({ create });
})(window);
