(function (root) {
  'use strict';
  const strings = {
    localService: ['Local mode', '本地运行', '本機執行'],
    serviceReady: ['Online service ready', '联机服务就绪', '連線服務就緒'],
    serviceUnavailable: ['Online service unavailable', '联机服务暂不可用', '連線服務暫不可用'],
    chooseMode: ['How are we playing?', '今天怎么玩？', '今天怎麼玩？'],
    chooseModeNote: [
      'Share one screen, or join from your own device.',
      '共用一块屏幕，或各自加入同一个房间。',
      '共用一個螢幕，或各自加入同一個房間。'
    ],
    offlineNote: [
      'Play together on one screen.',
      '共用屏幕，沿用原来的三种玩法。',
      '共用螢幕，沿用原本的三種玩法。'
    ],
    unlockAndPlay: ['Unlock and play', '解锁并进入', '解鎖並進入'],
    adminNeeded: ['Administrator access required', '需要管理员解锁', '需要管理員解鎖'],
    brand: ['Quiz Party', '问答派对', '問答派對'],
    offline: ['Offline mode', '单机模式', '單機模式'],
    online: ['Online mode', '联机模式', '連線模式'],
    unlock: ['Administrator unlock', '管理员解锁', '管理員解鎖'],
    lock: ['Lock administrator mode', '锁定管理员模式', '鎖定管理員模式'],
    back: ['Back', '返回', '返回'],
    joinOrCreate: [
      'Join a room or create one with administrator access.',
      '加入房间，或解锁管理员模式后创建房间。',
      '加入房間，或解鎖管理員模式後建立房間。'
    ],
    hostPlays: ['Host also plays', '主持人参加答题', '主持人參加答題'],
    openResponse: ['Short-answer response', '简答题作答方式', '簡答題作答方式'],
    text: ['Text', '文字', '文字'],
    hostGrading: ['Host grades', '主持人判分', '主持人判分'],
    voteGrading: ['Players vote', '玩家投票判分', '玩家投票判分'],
    submitVotes: ['Submit votes', '提交判分', '提交判分'],
    timeoutAnswer: [
      'No answer was submitted before the deadline.',
      '截止前没有提交答案。',
      '截止前沒有提交答案。'
    ],
    skip: ['Skip', '未回答', '未回答'],
    duration: ['Duration', '时长', '時長'],
    scoreChart: ['Score chart', '分数图表', '分數圖表'],
    rankings: ['Final ranking', '最终排名', '最終排名'],
    exportImage: ['Export results image', '导出结果图片', '匯出結果圖片'],
    history: ['History', '历史记录', '歷史記錄'],
    choiceType: ['Choice', '选择题', '選擇題'],
    openType: ['Short answer', '简答题', '簡答題'],
    locked: [
      'Enter the administrator password to unlock offline play and room creation.',
      '输入管理员密码后才能使用单机模式或创建房间。',
      '輸入管理員密碼後才能使用單機模式或建立房間。'
    ],
    join: ['Join a room', '加入房间', '加入房間'],
    create: ['Create a room', '创建房间', '建立房間'],
    password: ['Administrator password', '管理员密码', '管理員密碼'],
    continue: ['Continue', '继续', '繼續'],
    cancel: ['Cancel', '取消', '取消'],
    close: ['Close', '关闭', '關閉'],
    wrongPassword: ['That password was not accepted.', '密码不正确。', '密碼不正確。'],
    roomCode: ['Room code', '房间码', '房間碼'],
    nickname: ['Your name', '你的名字', '你的名字'],
    enter: ['Enter', '进入', '進入'],
    lobby: ['Lobby', '等待大厅', '等待大廳'],
    ready: ['Ready', '准备好了', '準備好了'],
    notReady: ['Not ready', '未准备', '未準備'],
    host: ['Host', '主持人', '主持人'],
    players: ['Players', '玩家', '玩家'],
    start: ['Start game', '开始游戏', '開始遊戲'],
    settings: ['Room settings', '房间设置', '房間設定'],
    appSettings: ['Settings', '设置', '設定'],
    selection: ['Question selection', '选题方式', '選題方式'],
    hostSelect: ['Host selects', '主持人选题', '主持人選題'],
    voteSelect: ['Players vote', '玩家投票选题', '玩家投票選題'],
    answerTime: ['Answer time', '答题时间', '答題時間'],
    seconds: ['seconds', '秒', '秒'],
    questionCount: ['Questions', '题数', '題數'],
    categories: ['Categories', '分类', '分類'],
    all: ['All', '全部', '全部'],
    clear: ['Clear', '清空', '清空'],
    submit: ['Submit answer', '提交答案', '提交答案'],
    lockedAnswer: ['Answer locked', '答案已锁定', '答案已鎖定'],
    oral: ['Oral answer', '口头回答', '口頭回答'],
    markAnswered: ['Mark answered', '标记已回答', '標記已回答'],
    waiting: ['Waiting for the host', '等待主持人', '等待主持人'],
    reveal: ['Answer', '答案', '答案'],
    grading: ['Grading', '判分', '判分'],
    correct: ['Correct', '答对', '答對'],
    incorrect: ['Incorrect', '答错', '答錯'],
    review: ['Review required', '需要复核', '需要複核'],
    next: ['Next question', '下一题', '下一題'],
    finish: ['Finish game', '结束游戏', '結束遊戲'],
    results: ['Results', '结果', '結果'],
    score: ['Score', '分数', '分數'],
    vote: ['Vote', '投票', '投票'],
    votes: ['votes', '票', '票'],
    reconnecting: ['Reconnecting…', '正在重连…', '正在重新連線…'],
    connected: ['Connected', '已连接', '已連線'],
    disconnected: ['Disconnected', '已断开', '已斷線'],
    codeRequired: ['Enter a room code.', '请输入房间码。', '請輸入房間碼。'],
    nameRequired: ['Enter a name.', '请输入名字。', '請輸入名字。'],
    error: ['Something went wrong.', '发生错误。', '發生錯誤。'],
    noRoom: [
      'Room not found or closed.',
      '找不到房间，或房间已关闭。',
      '找不到房間，或房間已關閉。'
    ],
    roomNotFound: [
      'Room not found or closed.',
      '找不到房间，或房间已关闭。',
      '找不到房間，或房間已關閉。'
    ],
    roomFull: ['This room is full.', '房间已满。', '房間已滿。'],
    invalidName: ['That name is not available.', '这个名字不可用。', '這個名字不可用。'],
    alreadyStarted: ['This room has already started.', '房间已经开始。', '房間已經開始。'],
    notHost: [
      'Only the host can do that.',
      '只有主持人可以执行此操作。',
      '只有主持人可以執行此操作。'
    ],
    notPlayer: [
      'Only players can do that.',
      '只有玩家可以执行此操作。',
      '只有玩家可以執行此操作。'
    ],
    expired: ['That action has expired.', '这个操作已经过期。', '這個操作已經過期。'],
    duplicateCommand: [
      'This action was already received.',
      '这个操作已经收到。',
      '這個操作已經收到。'
    ],
    invalidPhase: [
      'That action is not available now.',
      '当前阶段不能执行这个操作。',
      '目前階段不能執行這個操作。'
    ],
    adminRequired: ['Administrator access is required.', '需要管理员权限。', '需要管理員權限。'],
    hostOffline: [
      'The host is offline. The current question will finish, then the room will wait.',
      '主持人已断开。当前题会继续到截止，之后房间会等待主持人重连。',
      '主持人已斷線。目前題目會繼續至截止，之後房間會等待主持人重新連線。'
    ],
    page: ['Page {n} / {total}', '第 {n} / {total} 页', '第 {n} / {total} 頁']
  };
  Object.assign(strings, {
    points: ['points', '分', '分'],
    everyone: ['Everyone', '全体', '全體'],
    used: ['Played', '已选过', '已選過'],
    questions: ['questions', '题', '題'],
    previous: ['Previous', '上一页', '上一頁'],
    nextPage: ['Next', '下一页', '下一頁'],
    returnHome: ['Mode selection', '模式选择', '模式選擇'],
    resumeRoom: ['Resume room {code}', '返回房间 {code}', '返回房間 {code}'],
    openOnlineSite: ['Open online play', '打开联机网站', '開啟連線網站'],
    joinHint: [
      'Enter the six-digit code shared by the host.',
      '输入主持人分享的六位房间码。',
      '輸入主持人分享的六位房間碼。'
    ],
    createHint: [
      'Choose the questions, timing and scoring for this room.',
      '设置这一局的题目、答题时间和判分方式。',
      '設定這一局的題目、答題時間和判分方式。'
    ],
    nameLimit: ['Up to 12 characters per name.', '名字最多 12 个字符。', '名字最多 12 個字元。'],
    readyHint: [
      'At least two players must be online and ready before starting.',
      '至少两位玩家加入，所有玩家在线并准备好后即可开始。',
      '至少兩位玩家加入，所有玩家在線並準備好後即可開始。'
    ],
    cancelReady: ['Cancel ready', '取消准备', '取消準備'],
    roomSettings: ['Room settings', '本局设置', '本局設定'],
    copyCode: ['Copy room code', '复制房间码', '複製房間碼'],
    copied: ['Room code copied.', '房间码已复制。', '房間碼已複製。'],
    removePlayer: ['Remove', '移出', '移出'],
    removePlayerConfirm: [
      'Remove {name} from this lobby?',
      '将 {name} 移出这个房间？',
      '將 {name} 移出這個房間？'
    ],
    voteQuestion: ['Which question shall we play?', '这一题，大家来选', '這一題，大家來選'],
    chooseQuestion: ['Choose a question', '这次选哪道？', '這次選哪道？'],
    voteQuestionHint: [
      'One vote each. Change your vote before voting closes.',
      '每人一票，截止前可以改选。',
      '每人一票，截止前可以改選。'
    ],
    hostQuestionHint: [
      'The host chooses the next question.',
      '由主持人选择下一道题。',
      '由主持人選擇下一道題。'
    ],
    boardKeys: [
      'Arrow keys select a tile. Enter confirms.',
      '↑ ↓ ← → 选题，Enter 确认。',
      '↑ ↓ ← → 選題，Enter 確認。'
    ],
    questionNumber: ['Question #{n}', '第 {n} 号题', '第 {n} 號題'],
    submitted: ['submitted', '已提交', '已提交'],
    yourAnswer: ['Your answer', '你的答案', '你的答案'],
    answerLimit: [
      'Up to 500 characters. Submitting locks your answer.',
      '最多 500 个字符。提交后答案锁定。',
      '最多 500 個字元。提交後答案鎖定。'
    ],
    waitingAnswers: ['Waiting for the players to answer.', '等待玩家作答。', '等待玩家作答。'],
    thinking: ['Thinking time', '思考时间', '思考時間'],
    oralThinkHint: [
      'Think about your answer. After the countdown, answer in the displayed order using your voice call.',
      '先独立思考，倒计时结束后按名单顺序在语音聊天中回答。',
      '先獨立思考，倒數結束後按名單順序在語音聊天中回答。'
    ],
    oralOrderHint: [
      'This player answers now. The host records whether they answered.',
      '现在请这位玩家回答，主持人确认是否作答。',
      '現在請這位玩家回答，主持人確認是否作答。'
    ],
    oralRecorded: ['Answered aloud.', '已口头回答。', '已口頭回答。'],
    unanswered: ['Not answered · incorrect', '未作答 · 按答错处理', '未作答 · 按答錯處理'],
    ownAnswer: ['Your answer', '你的答案', '你的答案'],
    notGraded: ['Awaiting judgment', '等待判分', '等待判分'],
    reviewBy: ['Reviewer: {name}', '由 {name} 复核', '由 {name} 複核'],
    votesSubmitted: ['ballots submitted', '人已提交判分', '人已提交判分'],
    voteGradeHint: [
      'Judge the other answers against the standard answer. Unmarked answers are abstentions.',
      '对照标准答案给其他玩家判分，未选择的答案按弃权处理。',
      '對照標準答案為其他玩家判分，未選擇的答案按棄權處理。'
    ],
    hostGradeHint: [
      'The host judges each answer. Another player reviews the host’s own answer.',
      '主持人逐一判定对错，主持人自己的答案由其他玩家复核。',
      '主持人逐一判定對錯，主持人自己的答案由其他玩家複核。'
    ],
    votesLocked: ['Your ballot is submitted.', '判分已提交。', '判分已提交。'],
    voteTally: [
      '{yes} correct / {no} incorrect votes',
      '{yes} 票答对 / {no} 票答错',
      '{yes} 票答對 / {no} 票答錯'
    ],
    finalResults: ['How did everyone do?', '这一局，答得如何？', '這一局，答得如何？'],
    roundResults: ['Scores updated!', '分数已更新！', '分數已更新！'],
    scoreTrend: ['Score progression', '分数走势', '分數走勢'],
    correctCount: ['Correct answers', '答对题数', '答對題數'],
    builtin: ['Built-in question bank', '内置题库', '內建題庫'],
    scoredCount: [
      '{n} of {total} questions scored',
      '已计分 {n} / {total} 题',
      '已計分 {n} / {total} 題'
    ],
    exportArchive: ['Export archive', '导出存档', '匯出存檔'],
    importArchive: ['Import archive', '导入存档', '匯入存檔'],
    historyEmpty: [
      'Finished games will appear here.',
      '结束后的对局会保存在这里。',
      '結束後的對局會儲存在這裡。'
    ],
    leaveTitle: ['Return to mode selection?', '返回模式选择？', '返回模式選擇？'],
    leaveDescription: [
      'Your seat will be kept. Use Resume room to come back.',
      '会保留你的身份，可通过“返回房间”继续。',
      '會保留你的身分，可透過「返回房間」繼續。'
    ],
    replaceRoomTitle: ['Switch to a different room?', '切换到另一个房间？', '切換到另一個房間？'],
    replaceRoomDescription: [
      'This will replace the saved return link for room {code} on this tab.',
      '这会替换当前页面保存的房间 {code} 身份，之后无法通过这里返回原房间。',
      '這會取代目前頁面儲存的房間 {code} 身分，之後無法透過這裡返回原房間。'
    ],
    currentRank: ['Current ranking', '当前排名', '目前排名'],
    finishConfirm: [
      'Finish now using the scores already confirmed?',
      '现在结束本局？只计入已确认的分数。',
      '現在結束本局？只計入已確認的分數。'
    ],
    closeSelection: ['Finish voting', '结束选题投票', '結束選題投票'],
    closeGrading: ['Finish grading', '结束判分', '結束判分'],
    reopenGrading: ['Review this score again', '重新判分', '重新判分'],
    reopenConfirm: [
      'Undo this question’s scores and judge its answers again?',
      '撤销本题分数，并重新判定各个答案？',
      '撤銷本題分數，並重新判定各個答案？'
    ],
    votesClosed: [
      'Voting closed. The host will choose or confirm the next question.',
      '投票已结束，等待主持人选择或确认下一题。',
      '投票已結束，等待主持人選擇或確認下一題。'
    ],
    connecting: ['Connecting…', '正在连接…', '正在連線…'],
    idle: ['Not in a room', '未加入房间', '未加入房間'],
    confirm: ['Confirm', '确认', '確認'],
    allCorrect: ['All correct', '全对', '全對'],
    allWrong: ['All incorrect', '全错', '全錯'],
    fullscreen: ['Fullscreen', '全屏', '全螢幕'],
    exitFullscreen: ['Exit fullscreen', '退出全屏', '退出全螢幕'],
    fullscreenUnavailable: [
      'Fullscreen is unavailable in this browser.',
      '当前浏览器不支持全屏。',
      '目前瀏覽器不支援全螢幕。'
    ],
    UNAUTHORIZED: [
      'Your session expired. Rejoin the room or unlock administrator mode.',
      '会话已过期，请重新加入房间或解锁管理员模式。',
      '工作階段已過期，請重新加入房間或解鎖管理員模式。'
    ],
    ADMIN_REQUIRED: [
      'Unlock administrator mode first.',
      '请先解锁管理员模式。',
      '請先解鎖管理員模式。'
    ],
    RATE_LIMITED: [
      'Too many attempts. Please wait a moment.',
      '操作过于频繁，请稍后重试。',
      '操作過於頻繁，請稍後重試。'
    ],
    SERVICE_UNAVAILABLE: [
      'The online service is temporarily unavailable. Try again shortly.',
      '联机服务暂时不可用，请稍后重试。',
      '連線服務暫時無法使用，請稍後重試。'
    ],
    SERVICE_NOT_CONFIGURED: [
      'The online service is not ready yet.',
      '联机服务尚未就绪。',
      '連線服務尚未就緒。'
    ],
    INVALID_CATEGORIES: [
      'Select at least one category.',
      '请至少选择一个分类。',
      '請至少選擇一個分類。'
    ],
    INSUFFICIENT_QUESTIONS: [
      'These categories cannot supply a balanced board of this size. Choose more categories or fewer questions.',
      '这些分类不足以组成指定题量的均衡题板，请增加分类或减少题数。',
      '這些分類不足以組成指定題量的均衡題板，請增加分類或減少題數。'
    ],
    ROOM_EXPIRED: [
      'This room has expired. Join a new room.',
      '房间已过期，请加入新房间。',
      '房間已過期，請加入新房間。'
    ],
    REMOVED_FROM_ROOM: [
      'The host removed you from the lobby.',
      '主持人已将你移出房间。',
      '主持人已將你移出房間。'
    ],
    CONNECTED_ELSEWHERE: [
      'Your seat was opened in another tab.',
      '你的身份已在另一个页面连接。',
      '你的身分已在另一個頁面連線。'
    ],
    DISCONNECTED: [
      'Reconnect before sending an answer.',
      '请等待重连后再提交。',
      '請等待重新連線後再提交。'
    ],
    WAIT_FOR_SERVER: [
      'Waiting for confirmation from the room.',
      '正在等待房间确认。',
      '正在等待房間確認。'
    ],
    COMMAND_UNCONFIRMED: [
      'Confirmation was lost. The room will synchronize the result when the connection returns.',
      '尚未收到确认，恢复连接后会同步实际结果。',
      '尚未收到確認，恢復連線後會同步實際結果。'
    ],
    CLIENT_UPDATE_REQUIRED: [
      'The game has been updated. Refresh this page to continue.',
      '游戏已更新，请刷新页面后继续。',
      '遊戲已更新，請重新整理頁面後繼續。'
    ],
    invalidOption: ['Select an answer first.', '请先选择答案。', '請先選擇答案。'],
    invalidText: [
      'Enter an answer of up to 500 characters.',
      '请输入不超过 500 个字符的答案。',
      '請輸入不超過 500 個字元的答案。'
    ],
    alreadySubmitted: ['Your answer has already been submitted.', '答案已提交。', '答案已提交。'],
    alreadyVoted: ['Your ballot has already been submitted.', '判分票已提交。', '判分票已提交。'],
    needTwoPlayers: [
      'At least two players are needed.',
      '至少需要两位玩家。',
      '至少需要兩位玩家。'
    ],
    playersNotReady: [
      'Wait until all players are online and ready.',
      '请等待所有玩家在线并准备好。',
      '請等待所有玩家在線並準備好。'
    ],
    staleRound: ['This question has ended.', '这道题已经结束。', '這道題已經結束。'],
    staleSelection: [
      'This vote belongs to a previous question board.',
      '这次选题投票已经结束。',
      '這次選題投票已經結束。'
    ],
    deadlinePassed: ['The deadline has passed.', '答题时间已到。', '答題時間已到。'],
    invalidVote: [
      'This ballot contains an answer you cannot judge.',
      '这张判分票包含不能由你判定的答案。',
      '這張判分票包含不能由你判定的答案。'
    ]
  });
  const aliases = {
    ROOM_NOT_FOUND: 'noRoom',
    gameStarted: 'alreadyStarted',
    forbidden: 'notHost',
    playerRequired: 'notPlayer',
    wrongPhase: 'invalidPhase',
    offline: 'DISCONNECTED',
    STALE_COMMAND: 'staleRound',
    CHALLENGE_EXPIRED: 'UNAUTHORIZED',
    BANK_NOT_READY: 'SERVICE_UNAVAILABLE',
    INVALID_REQUEST: 'error',
    MESSAGE_TOO_LARGE: 'error',
    ORIGIN_NOT_ALLOWED: 'error',
    selectionClosed: 'votesClosed',
    voteSelectionRequired: 'votesClosed'
  };
  function make(lang) {
    const index = ['en', 'zh-Hans', 'zh-Hant'].indexOf(lang);
    const i = index < 0 ? 1 : index;
    return function t(key, params) {
      let value = (strings[key] || strings[aliases[key]] || strings.error)[i];
      Object.entries(params || {}).forEach(([k, v]) => {
        value = value.replaceAll('{' + k + '}', String(v));
      });
      return value;
    };
  }
  function error(language, code) {
    return make(language)(aliases[code] || code || 'error');
  }
  root.QuizI18n = Object.freeze({ strings, make, error });
})(typeof window === 'undefined' ? globalThis : window);
