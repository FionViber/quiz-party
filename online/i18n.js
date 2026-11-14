(function (root) {
  'use strict';
  const strings = {
    turnQuestionCount: ['{total} questions · {each} per player', '{total} 题 · 每人 {each} 题', '{total} 題 · 每人 {each} 題'],
    staleRoom: ['That action belonged to a different room.', '这个操作属于之前的房间。', '這個操作屬於之前的房間。'],
    hostVotingMonitor: ['Players are reviewing their assigned answers. You can monitor submissions and handle any unresolved answers afterwards.', '玩家正在评审分配到的答案。可以先查看提交进度，投票结束后再处理需要复核的答案。', '玩家正在評審分配到的答案。可以先查看提交進度，投票結束後再處理需要複核的答案。'],
    inactivityResult: ['The room was inactive for two hours, so the game ended automatically. These are the scores already confirmed.', '房间连续两小时没有活动，本局已自动结算。这里只计入已经确认的成绩。', '房間連續兩小時沒有活動，本局已自動結算。這裡只計入已經確認的成績。'],
    showScores: ['View confirmed scores', '查看已确认成绩', '查看已確認成績'],
    backToRoom: ['Back to the game', '返回对局', '返回對局'],
    liveScoresHint: [
      'These scores are already confirmed. You can save an image even if the host is offline. The room keeps running and takes you back to the game when the stage changes.',
      '这里只显示已经确认的成绩，主持人离线时也能保存图片。房间仍在进行，进入下一阶段会自动返回对局。',
      '這裡只顯示已經確認的成績，主持人離線時也能儲存圖片。房間仍在進行，進入下一階段會自動返回對局。'
    ],
    newIdentityTitle: ['Join as a new player?', '以新玩家加入？', '以新玩家加入？'],
    newIdentityDescription: [
      'This page will use the new identity. To return to your existing player or host identity, cancel and use Resume room on the home screen.',
      '此页面会改用新身份。已经加入过的玩家或主持人，请取消并在主界面使用“返回房间”恢复原身份。',
      '此頁面會改用新身分。已加入過的玩家或主持人，請取消並在主界面使用「返回房間」恢復原身分。'
    ],
    speakerOffline: [
      'The current player is offline. Wait for them or record a pass for this turn.',
      '当轮玩家尚未连接，请等待回来，或将本次机会记为弃答。',
      '當輪玩家尚未連線，請等待回來，或將本次機會記為棄答。'
    ],
    noIndependentReviewer: [
      'Another player needs to review this answer. Wait for someone to return, replace this question, or finish the game.',
      '这份答案需要另一位在线玩家复核。可以等对方回来，也可以作废换题或结束本局。',
      '這份答案需要另一位連線玩家複核。可以等對方回來，也可以作廢換題或結束本局。'
    ],
    participationSummary: ['Participation', '作答情况', '作答情況'],
    opportunities: ['Opportunities', '作答机会', '作答機會'],
    answeredCount: ['Answered', '已作答', '已作答'],
    passedCount: ['Passed', '弃答', '棄答'],
    missedCount: ['Not submitted in time', '未及时提交', '未及時提交'],
    reviewThisAnswer: ['Review this answer', '复核此答案', '複核此答案'],
    reviewAnswerConfirm: [
      'Review this answer without answering again? Other judgments are kept. This question’s scores will need confirmation again.',
      '重新复核这一份答案？已锁定的作答不会改变，其他人的判定保留。本题积分需要再次确认。',
      '重新複核這一份答案？已鎖定的作答不會改變，其他人的判定保留。本題積分需要再次確認。'
    ],
    notYourTurn: ['It is another player’s turn.', '本题轮到其他玩家。', '本題輪到其他玩家。'],
    alreadyConfirmed: [
      'This question has already been scored.',
      '本题积分已经确认。',
      '本題積分已經確認。'
    ],
    turnParticipation: ['In turn', '轮流', '輪流'],
    turnSelect: ['The current player chooses', '当轮玩家选题', '當輪玩家選題'],
    turnQuestionHint: [
      '{name} chooses this question. The host can help select it.',
      '轮到 {name} 选题，主持人也可以代为操作。',
      '輪到 {name} 選題，主持人也可以代為操作。'
    ],
    oralSetupHint: [
      'Each question belongs to one player. Short answers are spoken over your voice call. With 2–8 players, the final question count is rounded down to complete equal turns.',
      '每题只由当轮玩家回答，简答题通过现有语音聊天口述。限 2–8 人，开局时按最终人数调整为完整轮次，每人机会相同。',
      '每題只由當輪玩家回答，簡答題透過既有語音聊天口述。限 2–8 人，開局時按最終人數調整為完整輪次，每人機會相同。'
    ],
    textSetupHint: [
      'Everyone submits their own answer privately. Short answers are typed. Supports 2–32 players.',
      '每个人独立提交自己的答案，简答题输入文字。支持 2–32 人。',
      '每個人獨立提交自己的答案，簡答題輸入文字。支援 2–32 人。'
    ],
    readyToRead: ['Ready for the question?', '准备看题', '準備看題'],
    independentBriefing: [
      'Everyone has {seconds} seconds once the host starts. Get your device ready.',
      '主持人开始后，每人有 {seconds} 秒作答。请先准备好设备。',
      '主持人開始後，每人有 {seconds} 秒作答。請先準備好裝置。'
    ],
    turnBriefing: [
      '{name} answers this question, with {seconds} seconds after the host starts.',
      '本题由 {name} 回答，主持人开始后有 {seconds} 秒。',
      '本題由 {name} 回答，主持人開始後有 {seconds} 秒。'
    ],
    offlineBeforeQuestion: [
      'Offline: {names}. Wait for them, or continue with no score for a missed answer.',
      '暂未连接：{names}。可以等他们回来，未提交答案则本题记 0 分。',
      '暫未連線：{names}。可以等他們回來，未提交答案則本題記 0 分。'
    ],
    briefingNoLeak: [
      'The question is still hidden. Take a break here if needed.',
      '题目尚未显示，需要休息可以停在这里。',
      '題目尚未顯示，需要休息可以停在這裡。'
    ],
    waitingHostStart: [
      'Waiting for the host to start.',
      '等待主持人开始作答。',
      '等待主持人開始作答。'
    ],
    beginQuestion: ['Show question and start timer', '发题并开始计时', '出題並開始計時'],
    chooseAgain: ['Choose another tile', '重新选题', '重新選題'],
    speakerNow: ['{name} answers now', '请 {name} 作答', '請 {name} 作答'],
    oralSingleHint: [
      'Only this player answers. Everyone else keeps quiet. After the final answer is spoken, lock it to reveal the standard answer.',
      '只有当轮玩家回答，其他人不要提示。明确说出最终答案后，再确认并揭晓。',
      '只有當輪玩家回答，其他人不要提示。明確說出最終答案後，再確認並揭曉。'
    ],
    oralFinalAnswer: [
      'Final answer spoken · reveal',
      '已说出最终答案，揭晓',
      '已說出最終答案，揭曉'
    ],
    watchTurn: [
      'This is {name}’s turn. Watch quietly until the answer is locked.',
      '本题轮到 {name}，请等对方锁定答案后再讨论。',
      '本題輪到 {name}，請等對方鎖定答案後再討論。'
    ],
    hostWaitAnswers: [
      'Players are answering privately. Wait for their submissions.',
      '玩家正在独立作答，请等待提交。',
      '玩家正在獨立作答，請等待提交。'
    ],
    passQuestion: ['Pass · 0 points', '本题不答 · 0 分', '本題不答 · 0 分'],
    passAbsentTurn: [
      'Pass for the absent player · 0 points',
      '本位缺席，弃答记 0 分',
      '本位缺席，棄答記 0 分'
    ],
    passConfirm: [
      'Lock this question as a pass? You cannot submit an answer afterwards. A turn still counts as used.',
      '确定本题不作答？确认后不能再提交答案，轮流模式会消耗本次机会。',
      '確定本題不作答？確認後不能再提交答案，輪流模式會消耗本次機會。'
    ],
    passedLocked: ['Pass recorded', '已确认弃答', '已確認棄答'],
    passed: ['Passed', '弃答', '棄答'],
    timedOut: ['Not submitted in time', '未及时提交', '未及時提交'],
    notThisTurn: ['Not this player’s turn', '本题未轮到', '本題未輪到'],
    choiceScoringHint: [
      'A correct answer earns the question value. Wrong answers, passes and missed submissions score 0.',
      '答对加该题分值，答错、弃答或超时未提交均为 0 分。',
      '答對加該題分值，答錯、棄答或逾時未提交均為 0 分。'
    ],
    openScoringHint: [
      'A correct submitted answer earns full points. A wrong submitted answer loses half. Passing or missing the deadline scores 0.',
      '提交答案后，答对加分，答错扣该题一半分值。主动弃答或超时未提交记 0 分。',
      '提交答案後，答對加分，答錯扣該題一半分值。主動棄答或逾時未提交記 0 分。'
    ],
    assignedGradeHint: [
      'Review only the assigned answers. Each answer has up to three reviewers, never its author. Unmarked answers are abstentions. Ties go to an independent review.',
      '只评系统分配的答案，每份答案最多由 3 位其他玩家评审。未选择表示弃权，平票或无票会进入复核。',
      '只評系統分配的答案，每份答案最多由 3 位其他玩家評審。未選擇表示棄權，平票或無票會進入複核。'
    ],
    anonymousAnswer: ['Answer {n}', '答案 {n}', '答案 {n}'],
    noReviewAssignment: [
      'You have no assigned answers this round. Please wait for the review.',
      '本题没有分配给你的评审任务，请等待判分。',
      '本題沒有分配給你的評審任務，請等待判分。'
    ],
    closeGradingConfirm: [
      '{n} reviewers have not submitted. Close now and treat their missing votes as abstentions?',
      '还有 {n} 位评审没有提交。现在结束，他们未提交的票将按弃权处理。',
      '還有 {n} 位評審沒有提交。現在結束，他們未提交的票將按棄權處理。'
    ],
    closeSelectionConfirm: [
      'Close voting now? Only votes already received will count. With no votes, the host chooses.',
      '现在结束选题投票？只统计已收到的票，无人投票时由主持人选题。',
      '現在結束選題投票？只統計已收到的票，無人投票時由主持人選題。'
    ],
    scoreReview: ['Check this question’s scores', '核对本题积分', '核對本題積分'],
    scoreReviewHint: [
      'Scores below are pending. Resolve any disagreement now. The host confirms them before moving on.',
      '下方是本题待确认的分数变化。请现在核对或提出异议，主持人确认后才计入总分。',
      '下方是本題待確認的分數變化。請現在核對或提出異議，主持人確認後才計入總分。'
    ],
    roundConfirmedHint: [
      'This question is scored. Check the result before continuing. A flawed question can be voided and replaced.',
      '本题分数已计入，核对后再进入下一题。题目有误可以作废换题。',
      '本題分數已計入，核對後再進入下一題。題目有誤可以作廢換題。'
    ],
    confirmScore: ['Confirm scores', '确认积分', '確認積分'],
    confirmFinalScore: ['Confirm scores and finish', '确认积分并结算', '確認積分並結算'],
    currentScores: ['Confirmed totals', '已确认总分', '已確認總分'],
    waitingHostScore: [
      'Waiting for the host to confirm the scores.',
      '等待主持人确认积分。',
      '等待主持人確認積分。'
    ],
    waitingHostNext: [
      'Waiting for the host to start the next selection.',
      '等待主持人进入下一轮选题。',
      '等待主持人進入下一輪選題。'
    ],
    voidQuestion: ['Void and replace this question', '本题作废并换题', '本題作廢並換題'],
    voidQuestionConfirm: [
      'Use this for a flawed question or an interrupted fair attempt. Its scores are removed and it is replaced with the same question type and point value. The current player keeps their turn.',
      '用于题目有误或作答被意外打断。本题分数全部取消，补入同类型、同分值的新题。轮流模式仍由当前玩家作答。',
      '用於題目有誤或作答被意外打斷。本題分數全部取消，補入同類型、同分值的新題。輪流模式仍由目前玩家作答。'
    ],
    nameTaken: [
      'That name is already in the room. Choose a distinct name.',
      '房间里已有同名玩家，请换一个便于区分的名字。',
      '房間裡已有同名玩家，請換一個便於區分的名字。'
    ],
    needTwoOnline: [
      'At least two players must be connected before a question starts.',
      '至少两位参赛玩家在线后才能开始答题。',
      '至少兩位參賽玩家連線後才能開始答題。'
    ],
    replacementUnavailable: [
      'No unused question with the same type and value remains in these categories. You can end this game without counting the current question.',
      '所选分类已没有同类型、同分值的新题。可以结束本局，不计入尚未确认的本题。',
      '所選分類已沒有同類型、同分值的新題。可以結束本局，不計入尚未確認的本題。'
    ],
    ROOM_VERSION_UNSUPPORTED: [
      'This room uses an earlier rules version. Keep its saved results and create a new room.',
      '这个房间使用旧版规则。已有历史记录会保留，请新建房间。',
      '這個房間使用舊版規則。已有歷史紀錄會保留，請新建房間。'
    ],
    localService: ['Local mode', '本地运行', '本機執行'],
    unlockDownload: ['Downloading administrator content…', '正在下载管理员内容…', '正在下載管理員內容…'],
    unlockDecode: ['Reading encrypted content…', '正在读取加密内容…', '正在讀取加密內容…'],
    unlockVerify: ['Verifying password…', '正在验证密码…', '正在驗證密碼…'],
    unlockDecrypt: ['Decrypting administrator content…', '正在解密管理员内容…', '正在解密管理員內容…'],
    unlockPrepare: ['Preparing the game…', '正在准备游戏…', '正在準備遊戲…'],
    serviceChecking: ['Checking online service…', '正在连接联机服务…', '正在連接連線服務…'],
    retryService: ['Retry connection', '重新连接', '重新連接'],
    offlineAvailable: ['Offline mode can still be unlocked and played. Online play needs a connection to the room service.', '单机模式仍可解锁游玩。联机模式需要连接房间服务。', '單機模式仍可解鎖遊玩。連線模式需要連接房間服務。'],
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
      '适合电脑或电视，大家共用一块屏幕。',
      '適合電腦或電視，大家共用一個螢幕。'
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
    openResponse: ['How players answer', '作答方式', '作答方式'],
    text: ['Everyone answers privately · 2–32 players', '独立作答 · 2–32 人', '獨立作答 · 2–32 人'],
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
    oral: [
      'Take turns, with spoken short answers · 2–8 players',
      '轮流作答，简答题口述 · 2–8 人',
      '輪流作答，簡答題口述 · 2–8 人'
    ],
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
    alreadyStarted: [
      'This game has started. Join the next game. Returning players should use Resume room in the same browser.',
      '本局已开始，请参加下一局。已经加入过的玩家，请用原浏览器的“返回房间”。',
      '本局已開始，請參加下一局。已加入過的玩家，請用原瀏覽器的「返回房間」。'
    ],
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
      'The host is offline. Finish your current answer or review. Scores and the next question wait for the host. Confirmed scores can still be saved as an image.',
      '主持人暂未连接。请完成当前作答或评审，积分确认和下一题会等待主持人回来。已有成绩仍可查看并保存图片。',
      '主持人暫未連線。請完成目前作答或評審，積分確認與下一題會等待主持人回來。已有成績仍可查看並儲存圖片。'
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
    oralRecorded: ['Answered aloud.', '已口头回答。', '已口頭回答。'],
    unanswered: ['No answer', '未作答', '未作答'],
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
      'Nobody voted. The host can now choose a question.',
      '无人投票，请主持人选择一道题。',
      '無人投票，請主持人選擇一道題。'
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
      'This device could not reach the room service. Check your connection and retry.',
      '此设备未能连接房间服务，请检查网络后重新连接。',
      '此裝置未能連接房間服務，請檢查網絡後重新連接。'
    ],
    SERVICE_TIMEOUT: ['The room service took too long to respond. Retry the connection.', '房间服务响应超时，请重新连接。', '房間服務回應逾時，請重新連接。'],
    NETWORK_OFFLINE: ['This device is offline. Reconnect to the internet and try again.', '此设备当前没有网络连接，请联网后重试。', '此裝置目前沒有網絡連線，請連網後重試。'],
    REQUEST_CANCELLED: ['Request cancelled.', '已取消请求。', '已取消請求。'],
    ADMIN_LOAD_TIMEOUT: ['The administrator download timed out. Check your connection and try again.', '管理员内容下载超时，请检查网络后重试。', '管理員內容下載逾時，請檢查網絡後重試。'],
    ADMIN_LOAD_FAILED: ['Administrator content could not be loaded. Retry, or reopen index.html from the fully extracted release package.', '未能加载管理员内容。请重试，或完整解压成品包后重新打开 index.html。', '未能載入管理員內容。請重試，或完整解壓成品包後重新開啟 index.html。'],
    ADMIN_CRYPTO_UNSUPPORTED: ['Open the HTTPS website in an up-to-date browser to unlock administrator mode.', '请使用新版浏览器打开 HTTPS 网站后解锁管理员模式。', '請使用新版瀏覽器開啟 HTTPS 網站後解鎖管理員模式。'],
    ADMIN_COMPRESSION_UNSUPPORTED: ['This browser cannot open the game package. Update your browser and try again.', '此浏览器无法打开游戏内容，请更新浏览器后重试。', '此瀏覽器無法開啟遊戲內容，請更新瀏覽器後重試。'],
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
    selectionClosed: 'staleSelection',
    voteSelectionRequired: 'voteQuestionHint',
    invalidReplacement: 'replacementUnavailable',
    replacementRequired: 'replacementUnavailable'
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
