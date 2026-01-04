// --- グローバルステート ---
let allTasks = [];           
let sequenceTasks = [];      
let sequenceIndex = 0;       
let remainingSeconds = 0;    
let timerId = null;          
let preId = null;            
let taskStartTime = null;    
let results = [];            
let isCompletionHandled = false; 
let summaryResults = [];     
let pausedRemainingSeconds = 0; 
let pausedStartTime = null;  
let isPaused = false;        
let sortableInstance = null; 
let isStepCompleted = false; 
let currentRunStartIndex = 0; 
let currentLogView = 'detail'; 

// --- LocalStorage ---
const STORAGE_KEYS = {
  ALL_TASKS: 'lifelisten_timer_all_tasks',
  RESULTS: 'lifelisten_timer_results',
  SUMMARY_RESULTS: 'lifelisten_timer_summary_results',
  LAST_CSV: 'lifelisten_timer_last_csv'
};

// --- アイコンプリセット ---
const PRESET_ICONS = [
  'fa-solid fa-bath', 'fa-solid fa-toilet', 'fa-solid fa-bed', 'fa-solid fa-utensils',
  'fa-solid fa-fire-burner', 'fa-solid fa-broom', 'fa-solid fa-briefcase', 'fa-solid fa-droplet',
  'fa-solid fa-face-smile', 'fa-solid fa-sun', 'fa-solid fa-person-running', 'fa-solid fa-person-walking',
  'fa-solid fa-bicycle', 'fa-solid fa-train', 'fa-solid fa-shirt', 'fa-solid fa-tooth',
  'fa-solid fa-book', 'fa-solid fa-laptop', 'fa-solid fa-mobile-screen', 'fa-solid fa-cart-shopping',
  'fa-solid fa-yen-sign', 'fa-solid fa-mug-hot', 'fa-solid fa-wine-glass', 'fa-solid fa-music',
  'fa-solid fa-trash-can', 'fa-solid fa-pills', 'fa-solid fa-hospital', 'fa-solid fa-heart',
  'fa-solid fa-star', 'fa-solid fa-headphones'
];

// --- DOM要素 ---
const importCsvInput = document.getElementById('importCsvInput');
const loadCsvButton = document.getElementById('loadCsvButton');
const exportCsvButton = document.getElementById('exportCsvButton');
const taskButtons = document.getElementById('taskButtons');
const currentTaskInfo = document.getElementById('currentTaskInfo');
const timerDisplay = document.getElementById('timerDisplay');
const timerControls = document.getElementById('timerControls');
const timerSettings = document.getElementById('timerSettings');
const autoAdvanceToggle = document.getElementById('autoAdvanceToggle');
const pauseResumeButton = document.getElementById('pauseResumeButton');
const endButton = document.getElementById('endButton');
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
const sequenceTitle = document.getElementById('sequenceTitle');
const sequenceList = document.getElementById('sequenceList');
const resultsTableBody = document.querySelector('#resultsTable tbody');
const progressRingCircle = document.querySelector('.progress-ring-circle');
const clearResultsButton = document.getElementById('clearResultsButton');
const copyResultsButton = document.getElementById('copyResultsButton');

// 追加セクション
const addTaskHeader = document.getElementById('addTaskHeader');
const addTaskContent = document.getElementById('addTaskContent');
const newTaskName = document.getElementById('newTaskName');
const newTaskIconButton = document.getElementById('newTaskIconButton');
const newTaskIconValue = document.getElementById('newTaskIconValue');
const addTaskButton = document.getElementById('addTaskButton');
const addStepSection = document.getElementById('addStepSection');
const newStepName = document.getElementById('newStepName');
const newStepText = document.getElementById('newStepText');
const newStepMemo = document.getElementById('newStepMemo');
const newStepSeconds = document.getElementById('newStepSeconds');
const addStepButton = document.getElementById('addStepButton');

// モーダル
const iconModal = document.getElementById('iconModal');
const closeModalBtn = document.querySelector('.close-modal');
const presetIconGrid = document.getElementById('presetIconGrid');
const logTabBtns = document.querySelectorAll('.log-tab-btn');

// --- プログレスリング設定 ---
const progressRingRadius = parseInt(progressRingCircle.getAttribute('r'));
const progressRingCircumference = 2 * Math.PI * progressRingRadius;
progressRingCircle.style.strokeDasharray = `${progressRingCircumference} ${progressRingCircumference}`;

function updateProgressRing(percent) {
  const offset = progressRingCircumference - (percent / 100 * progressRingCircumference);
  progressRingCircle.style.strokeDashoffset = offset;
}

// --- ヘルパー関数 ---
function formatDuration(seconds) {
  const absSeconds = Math.abs(seconds);
  const h = Math.floor(absSeconds / 3600);
  const m = Math.floor((absSeconds % 3600) / 60);
  const s = absSeconds % 60;
  let result = '';
  if (h > 0) result += `${h}時間`;
  if (m > 0) result += `${m}分`;
  result += `${s}秒`;
  return result;
}

function formatDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const formatDatePart = (d) => `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
  const formatTimePart = (d) => `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
  const startStr = `${formatDatePart(start)} ${formatTimePart(start)}`;
  if (start.toDateString() === end.toDateString()) {
    return `${startStr} 〜 ${formatTimePart(end)}`;
  } else {
    return `${startStr} 〜 ${formatDatePart(end)} ${formatTimePart(end)}`;
  }
}

function getDefaultIconForName(taskName) {
  return 'fa-solid fa-headphones';
}

function getTaskIconClass(task) {
  if (task && task['アイコン'] && task['アイコン'].trim() !== '') {
    return task['アイコン'];
  }
  return 'fa-solid fa-headphones';
}

// --- 音声関連 ---
function enableBackgroundAudioHack() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  osc.frequency.value = 0;
  osc.connect(ctx.destination);
  osc.start();
}
document.addEventListener('click', function initBgAudio() {
  enableBackgroundAudioHack();
  document.removeEventListener('click', initBgAudio);
});

function speak(text) {
  if (!window.speechSynthesis) return;
  // 読み上げキャンセル（重複防止）
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  speechSynthesis.speak(u);
  return new Promise((resolve) => {
    u.onend = () => resolve();
    setTimeout(resolve, text.length * 200);
  });
}

// --- 報酬系SE再生（復活） ---
function playCompletionSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // ドーパミンが出るような上昇音 (C5, E5, G5, C6)
    const notes = [523.25, 659.25, 783.99, 1046.50]; 
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator(); 
      const g = ctx.createGain();
      osc.connect(g); 
      g.connect(ctx.destination);
      osc.frequency.value = f;
      // 音の立ち上がりと減衰
      const now = ctx.currentTime + i * 0.15;
      g.gain.setValueAtTime(0.3, now);
      g.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now); 
      osc.stop(now + 0.3);
    });
  } catch(e) {
    console.warn('Audio play failed', e);
  }
}

function playCompletionEffect() {
  const overlay = document.getElementById('completionEffect');
  const starburst = overlay.querySelector('.starburst');
  
  // アニメーションリセット
  overlay.classList.remove('active');
  starburst.classList.remove('active');
  
  // DOMリフロー強制
  void overlay.offsetWidth; 
  
  overlay.style.visibility = 'visible';
  requestAnimationFrame(() => { 
    overlay.classList.add('active'); 
    starburst.classList.add('active'); 
  });
  
  // 音声を再生
  playCompletionSound();
  
  setTimeout(() => {
    overlay.classList.remove('active'); 
    starburst.classList.remove('active'); 
    overlay.style.visibility = 'hidden';
  }, 1000);
}

// --- データ保存・読み込み ---
function saveToLocalStorage(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch (e) { return false; }
}
function loadFromLocalStorage(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}
function saveTasksData() { saveToLocalStorage(STORAGE_KEYS.ALL_TASKS, allTasks); }
function saveResultsData() {
  saveToLocalStorage(STORAGE_KEYS.RESULTS, results);
  saveToLocalStorage(STORAGE_KEYS.SUMMARY_RESULTS, summaryResults);
}

function parseAndSetupCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return console.warn('CSV無効');
  const headers = lines[0].split(',').map(h => h.trim());
  allTasks = lines.slice(1).map(line => {
    const cols = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
    return headers.reduce((obj, h, i) => {
      let v = (cols[i]||'').replace(/^"|"$/g,'').trim();
      if (h==='秒数'||h==='順番') v = Number(v);
      obj[h] = v;
      return obj;
    }, {});
  });
  migrateData();
  saveToLocalStorage(STORAGE_KEYS.LAST_CSV, csvText);
  saveTasksData();
  setupTaskButtons();
}

function migrateData() {
  if (!allTasks || !Array.isArray(allTasks)) { allTasks = []; return; }
  allTasks.forEach(task => {
    if (!task.hasOwnProperty('アイコン')) task['アイコン'] = 'fa-solid fa-headphones';
    if (!task.hasOwnProperty('メモ')) task['メモ'] = '';
    if (typeof task['秒数'] !== 'number') task['秒数'] = parseInt(task['秒数']) || 30;
    if (typeof task['順番'] !== 'number') task['順番'] = 1;
  });
}

function updateCSVData() {
  const headers = ['タスク名', '項目名', '読み上げテキスト', '秒数', '順番', 'アイコン', 'メモ'];
  let csvContent = headers.join(',') + '\n';
  allTasks.forEach(task => {
    const row = headers.map(header => {
      let value = task[header] || '';
      if (typeof value === 'string') value = `"${value.replace(/"/g, '""')}"`;
      return value;
    });
    csvContent += row.join(',') + '\n';
  });
  saveToLocalStorage(STORAGE_KEYS.LAST_CSV, csvContent);
}

function initApp() {
  const savedTasks = loadFromLocalStorage(STORAGE_KEYS.ALL_TASKS);
  if (savedTasks && Array.isArray(savedTasks) && savedTasks.length > 0) {
    allTasks = savedTasks;
    migrateData();
    setupTaskButtons();
  } else {
    fetch('firstdata.csv').then(res => res.ok ? res.text() : null)
      .then(text => { if(text) parseAndSetupCSV(text); });
  }
  const savedResults = loadFromLocalStorage(STORAGE_KEYS.RESULTS);
  if (savedResults) results = savedResults;
  const savedSummary = loadFromLocalStorage(STORAGE_KEYS.SUMMARY_RESULTS);
  if (savedSummary) { summaryResults = savedSummary; updateResultsTable(); }
}

window.addEventListener('DOMContentLoaded', () => {
  initApp();
  updateProgressRing(100);
  addTaskHeader.addEventListener('click', () => {
    addTaskContent.classList.toggle('hidden');
    addTaskHeader.classList.toggle('active');
  });
  addTaskButton.addEventListener('click', addNewTask);
  addStepButton.addEventListener('click', addNewStep);
  logTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      logTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentLogView = btn.dataset.view;
      updateResultsTable();
    });
  });
  initIconModal();
});

window.addEventListener('pageshow', () => initApp());

loadCsvButton.addEventListener('click', () => {
  const file = importCsvInput.files[0];
  if (!file) return alert('CSVファイルを選択してください');
  const reader = new FileReader();
  reader.onload = e => parseAndSetupCSV(e.target.result);
  reader.readAsText(file, 'UTF-8');
});

// --- UI構築 ---
function setupTaskButtons() {
  taskButtons.innerHTML = '';
  // 【修正】リセット時の表示を確実に
  resetActiveTaskDisplay();
  
  const names = [...new Set(allTasks.map(t=>t['タスク名']))];
  if (names.length === 0) {
    taskButtons.innerHTML = '<p>タスクがありません。</p>';
    return;
  }
  names.forEach(name => {
    const firstTaskData = allTasks.find(t => t['タスク名'] === name);
    const iconClass = getTaskIconClass(firstTaskData);
    
    const btn = document.createElement('button');
    btn.innerHTML = `<i class="${iconClass}"></i> ${name}`;
    btn.classList.add('task-btn');
    
    // 【修正】タスクボタンクリック時の処理：実行中なら停止して次へ
    btn.addEventListener('click', () => {
      // 既にタイマーが動いていれば強制停止
      if (timerId || preId) {
        forceStopTask();
      }
      // 新しいタスクを開始
      startSequenceFor(name);
    });
    
    taskButtons.appendChild(btn);
  });
}

function resetActiveTaskDisplay() {
  currentTaskInfo.innerHTML = '<div class="task-status-message"><i class="fas fa-info-circle"></i> タスクを選択してください</div>';
  timerDisplay.textContent = '--:--';
  timerDisplay.className = 'timer';
  updateProgressRing(100);
  timerControls.classList.add('hidden');
  timerSettings.classList.add('hidden');
  addStepSection.classList.add('hidden');
  sequenceList.innerHTML = '';
  sequenceTitle.innerHTML = '<i class="fas fa-list-ol"></i> 実行予定のタスク';
  
  // ボタン表示リセット
  prevButton.style.display = '';
  nextButton.style.display = '';
  endButton.style.display = '';
}

// --- 強制停止処理 ---
function forceStopTask() {
  if (timerId) clearInterval(timerId);
  if (preId) clearInterval(preId);
  timerId = null;
  preId = null;
  isPaused = false;
  // ここではログ保存等はせず、クリーンにリセットする
  // もし途中経過を保存したい場合は recordCurrentTaskResult() を呼ぶ
}

// --- アイコンモーダル ---
let currentIconSelectCallback = null;
function initIconModal() {
  presetIconGrid.innerHTML = '';
  PRESET_ICONS.forEach(iconClass => {
    const div = document.createElement('div');
    div.className = 'icon-item';
    div.innerHTML = `<i class="${iconClass}"></i>`;
    div.onclick = () => selectIcon(iconClass);
    presetIconGrid.appendChild(div);
  });
  closeModalBtn.onclick = () => iconModal.classList.add('hidden');
  window.onclick = (e) => { if (e.target === iconModal) iconModal.classList.add('hidden'); };
  newTaskIconButton.onclick = () => {
    openIconModal((selectedIcon) => {
      newTaskIconValue.value = selectedIcon;
      newTaskIconButton.innerHTML = `<i class="${selectedIcon}"></i> <span>変更</span>`;
    });
  };
}
function openIconModal(callback) {
  currentIconSelectCallback = callback;
  iconModal.classList.remove('hidden');
}
function selectIcon(iconClass) {
  if (currentIconSelectCallback) currentIconSelectCallback(iconClass);
  iconModal.classList.add('hidden');
}

// --- タスク/ステップ追加 ---
function addNewTask() {
  const taskName = newTaskName.value.trim();
  const iconValue = newTaskIconValue.value;
  if (!taskName) return alert('タスク名を入力');
  if (allTasks.some(t => t['タスク名'] === taskName)) return alert('既存の名前です');
  allTasks.push({
    'タスク名': taskName, '項目名': '1回目', '読み上げテキスト': '1回目', '秒数': 30, '順番': 1, 'アイコン': iconValue, 'メモ': ''
  });
  saveTasksData(); setupTaskButtons(); updateCSVData();
  newTaskName.value = '';
}

function addNewStep() {
  const stepName = newStepName.value.trim();
  const stepText = newStepText.value.trim();
  const stepMemoVal = newStepMemo.value.trim();
  const stepSeconds = parseInt(newStepSeconds.value) || 30;
  if (!stepName || !stepText) return alert('入力不備');
  if (sequenceTasks.length === 0) return alert('タスク未選択');
  
  const currentTaskName = sequenceTasks[0]['タスク名'];
  const parentTask = allTasks.find(t => t['タスク名'] === currentTaskName);
  const currentMaxOrder = sequenceTasks.length > 0 ? Math.max(...sequenceTasks.map(t => t['順番'] || 0)) : 0;
  
  const newStep = {
    'タスク名': currentTaskName, '項目名': stepName, '読み上げテキスト': stepText, '秒数': stepSeconds, 
    '順番': currentMaxOrder + 1, 'アイコン': parentTask ? parentTask['アイコン'] : '', 'メモ': stepMemoVal
  };
  allTasks.push(newStep);
  if (currentTaskName === sequenceTasks[0]['タスク名']) {
      sequenceTasks.push(newStep); renderSequenceList(currentTaskName);
  }
  saveTasksData(); updateCSVData();
  newStepName.value = ''; newStepText.value = ''; newStepMemo.value = '';
}

// --- 実行ロジック ---
function startSequenceFor(name) {
  // 状態リセット
  isCompletionHandled = false;
  isPaused = false;
  pausedRemainingSeconds = 0;
  pausedStartTime = null;
  isStepCompleted = false;
  currentRunStartIndex = results.length;
  
  prevButton.style.display = '';
  nextButton.style.display = '';
  endButton.style.display = ''; // 終了ボタンも表示
  
  pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i> 一時停止';
  timerDisplay.className = 'timer';
  updateProgressRing(100);
  
  sequenceTasks = allTasks.filter(t=>t['タスク名']===name).sort((a,b)=>(a['順番']||0)-(b['順番']||0));
  sequenceIndex = 0;
  
  renderSequenceList(name);
  addStepSection.classList.remove('hidden');
  taskStartTime = new Date();
  
  runNextStep();
}

async function runNextStep() {
  isStepCompleted = false;
  timerDisplay.classList.remove('overtime');

  if (sequenceIndex >= sequenceTasks.length) {
    handleCompletion();
    return;
  }
  
  const task = sequenceTasks[sequenceIndex];
  
  // マジックコマンド
  const text = task['読み上げテキスト'] || '';
  if (text.startsWith('GO:')) {
    const nextTaskName = text.replace('GO:', '').trim();
    if (allTasks.some(t => t['タスク名'] === nextTaskName)) {
      results.push({
        date: new Date().toLocaleString(), seconds: 0, content: `${task['タスク名']} から ${nextTaskName} へ移動`
      });
      updateResultsTable();
      startSequenceFor(nextTaskName);
      return;
    }
  }
  
  timerControls.classList.remove('hidden');
  timerSettings.classList.remove('hidden');
  
  if (sequenceIndex === 0) {
    speak(`${task['タスク名']}、はじめるよ！`);
    let preCount = 5;
    updateCurrentTaskDisplay(true, preCount);
    let localPaused = false;
    await new Promise(resolve => {
      preId = setInterval(() => {
        if (isPaused) { localPaused = true; return; }
        if (localPaused) localPaused = false;
        preCount--;
        if (preCount > 0) updateCurrentTaskDisplay(true, preCount);
        else { clearInterval(preId); preId = null; resolve(); }
      }, 1000);
    });
  }
  
  updateCurrentTaskDisplay();
  const textToSpeak = task['項目名'] ? `${task['項目名']}。${task['読み上げテキスト']}` : task['読み上げテキスト'];
  speak(textToSpeak);
  
  remainingSeconds = (pausedRemainingSeconds !== 0) ? pausedRemainingSeconds : (task['秒数'] || 30);
  pausedRemainingSeconds = 0;
  
  updateTimerDisplay();
  renderSequenceList(task['タスク名']);
  startTimer();
}

function updateTimerDisplay() {
  const absSeconds = Math.abs(remainingSeconds);
  const m = Math.floor(absSeconds / 60);
  const s = absSeconds % 60;
  const timeString = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  timerDisplay.textContent = remainingSeconds < 0 ? `+${timeString}` : timeString;
  if (remainingSeconds < 0) timerDisplay.classList.add('overtime'); else timerDisplay.classList.remove('overtime');
  
  const currentTask = sequenceTasks[sequenceIndex];
  if (currentTask) {
    const percent = (remainingSeconds > 0 && currentTask['秒数'] > 0) ? (remainingSeconds / currentTask['秒数']) * 100 : 0;
    updateProgressRing(percent);
  }
}

function startTimer() {
  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => {
    if (isPaused) return;
    remainingSeconds--;
    updateTimerDisplay();
    if (remainingSeconds === 0) {
      if (autoAdvanceToggle.checked) {
        recordCurrentTaskResult();
        sequenceIndex++;
        if (timerId) clearInterval(timerId); timerId = null;
        runNextStep();
      } else {
        isStepCompleted = true;
        speak('完了');
        updateCurrentTaskDisplay();
        renderSequenceList(sequenceTasks[sequenceIndex]['タスク名']);
      }
    }
  }, 1000);
}

function recordCurrentTaskResult(isSkipped = false) {
  if (sequenceIndex >= sequenceTasks.length) return;
  const task = sequenceTasks[sequenceIndex];
  const now = new Date();
  const elapsedSeconds = (task['秒数'] || 0) - remainingSeconds;
  results.push({
    date: now.toLocaleString(), seconds: elapsedSeconds,
    content: `${task['タスク名']}：${task['項目名']}：${task['読み上げテキスト']}${isSkipped && remainingSeconds > 0 ? ' (スキップ)' : ''}`
  });
  updateResultsTable();
}

// --- ボタンイベント ---
pauseResumeButton.addEventListener('click', () => {
  if (isPaused) {
    isPaused = false; pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i> 一時停止';
    if (pausedStartTime) {
      taskStartTime = new Date(taskStartTime.getTime() + (new Date() - pausedStartTime));
    }
  } else {
    isPaused = true; pausedStartTime = new Date();
    pauseResumeButton.innerHTML = '<i class="fas fa-play"></i> 再開';
  }
});

nextButton.addEventListener('click', () => {
  if (sequenceIndex < sequenceTasks.length) {
    if (timerId) clearInterval(timerId); if (preId) clearInterval(preId);
    isPaused = false; pausedRemainingSeconds = 0;
    pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i> 一時停止';
    recordCurrentTaskResult(remainingSeconds > 0);
    sequenceIndex++;
    runNextStep();
  }
});

prevButton.addEventListener('click', () => {
  if (sequenceIndex > 0) {
    if (timerId) clearInterval(timerId); if (preId) clearInterval(preId);
    isPaused = false; pausedRemainingSeconds = 0;
    sequenceIndex--;
    runNextStep();
  }
});

// 【修正】終了ボタンの挙動：即時停止・リセット
endButton.addEventListener('click', () => {
  if (isCompletionHandled) return; // 既に終了処理中なら無視
  
  // タイマー停止
  if (timerId) clearInterval(timerId); timerId = null;
  if (preId) clearInterval(preId); preId = null;
  
  // ログ記録（現在のステップまでの分）
  if (sequenceIndex < sequenceTasks.length) {
      recordCurrentTaskResult(remainingSeconds > 0);
  }
  
  // 完了処理へ
  handleCompletion();
});

function handleCompletion() {
  if (isCompletionHandled) return;
  isCompletionHandled = true;
  
  const taskName = sequenceTasks.length > 0 ? sequenceTasks[0]['タスク名'] : 'タスク';
  
  // 画面リセット
  currentTaskInfo.innerHTML = `
    <div class="task-status-message completion-message">
      <i class="fas fa-check-circle" style="color: #27ae60; font-size: 3em; margin-bottom: 10px; display:block;"></i>
      <div style="font-size: 1.5em; font-weight: bold; color: #2c3e50;">${taskName}</div>
      <div style="margin-top: 10px;">完了！おつかれさま！</div>
    </div>
  `;
  
  // コントロール非表示
  timerControls.classList.add('hidden');
  timerSettings.classList.add('hidden');
  timerDisplay.textContent = '00:00';
  timerDisplay.classList.remove('overtime');
  updateProgressRing(0);
  
  // 音声・演出
  playCompletionEffect();
  speak(`${taskName}、完了！おつかれさま！`);
  
  // サマリー記録
  const currentRun = results.slice(currentRunStartIndex);
  const totalSec = currentRun.reduce((sum, r) => sum + r.seconds, 0);
  summaryResults.push({
    date: new Date().toLocaleString(), startTime: taskStartTime?.toLocaleString(), endTime: new Date().toLocaleString(),
    seconds: totalSec, content: `${taskName} (${currentRun.length}ステップ完了)`
  });
  saveResultsData();
  updateResultsTable();
  
  // ボタンを隠す
  prevButton.style.display = 'none';
  nextButton.style.display = 'none';
  endButton.style.display = 'none';
}

function updateCurrentTaskDisplay(isPreCount = false, preCount = 0) {
  if (sequenceIndex >= sequenceTasks.length) return;
  const task = sequenceTasks[sequenceIndex];
  const waitingMsg = isStepCompleted ? '<span style="color: #e67e22; font-weight:bold;">(完了 - 待機中)</span>' : '';
  const mainText = isPreCount ? `<span style="color:#e67e22; font-weight:bold; font-size:1.2em;">開始まであと ${preCount} 秒...</span>` : (task['読み上げテキスト'] || '');
  
  currentTaskInfo.innerHTML = `
    <div class="task-badges">
      <div class="task-name-badge"><i class="${getTaskIconClass(task)}"></i> ${task['タスク名']}</div>
      <div class="step-name-badge">${task['項目名']}</div>
      ${waitingMsg}
    </div>
    <div class="reading-text-box">${mainText}</div>
    ${task['メモ'] ? `<div class="memo-box"><i class="fas fa-sticky-note"></i> ${task['メモ']}</div>` : ''}
  `;
}

function renderSequenceList(name) {
  sequenceTitle.innerHTML = `<i class="fas fa-list-ol"></i> ${name} のタスク`;
  sequenceList.innerHTML = '';
  
  sequenceTasks.forEach((task, i) => {
    if (i < sequenceIndex) return;
    
    const item = document.createElement('div');
    item.className = 'sequence-item' + (i === sequenceIndex ? ' active' : '') + (isStepCompleted && i === sequenceIndex ? ' waiting-next' : '');
    
    item.innerHTML = `
      <div class="drag-handle ${i===sequenceIndex?'disabled':''}"><i class="fas fa-grip-vertical"></i></div>
      <div class="label-container"><i class="${getTaskIconClass(task)}"></i></div>
      <div class="seq-inputs">
        <input type="text" class="seq-name-input" value="${task['項目名']||''}" placeholder="項目名" data-idx="${i}" onchange="updateTaskField(this, '項目名')">
        <input type="text" class="seq-text-input" value="${task['読み上げテキスト']||''}" placeholder="読み上げ" data-idx="${i}" onchange="updateTaskField(this, '読み上げテキスト')">
        <input type="text" class="seq-memo-input" value="${task['メモ']||''}" placeholder="メモ" data-idx="${i}" onchange="updateTaskField(this, 'メモ')">
        <div class="seq-time-wrapper">
            <input type="number" class="seq-seconds-input" value="${task['秒数']||30}" min="1" data-idx="${i}" onchange="updateTaskField(this, '秒数')">
            <button class="mini-qt-btn" onclick="setQuickTime(${i}, 30)">30</button>
            <button class="mini-qt-btn" onclick="setQuickTime(${i}, 60)">60</button>
        </div>
      </div>
      <button class="delete-btn" onclick="deleteSequenceTask(${i})" ${i===sequenceIndex?'disabled':''}><i class="fas fa-trash"></i></button>
    `;
    sequenceList.appendChild(item);
  });
  initSortable();
}

window.updateTaskField = function(input, field) {
  const idx = parseInt(input.getAttribute('data-idx'));
  const task = sequenceTasks[idx];
  let val = input.value;
  if(field === '秒数') val = parseInt(val);
  task[field] = val;
  saveTasksData();
  if(idx === sequenceIndex) updateCurrentTaskDisplay();
};

window.setQuickTime = function(idx, seconds) {
  sequenceTasks[idx]['秒数'] = seconds;
  saveTasksData();
  renderSequenceList(sequenceTasks[0]['タスク名']);
  if(idx === sequenceIndex) updateTimerDisplay();
};

function deleteSequenceTask(index) {
  if (index === sequenceIndex) return alert('実行中は削除できません');
  if (!confirm('削除しますか？')) return;
  const task = sequenceTasks[index];
  const allIdx = allTasks.indexOf(task);
  if (allIdx !== -1) allTasks.splice(allIdx, 1);
  sequenceTasks.splice(index, 1);
  sequenceTasks.forEach((t, i) => t['順番'] = i + 1);
  saveTasksData();
  renderSequenceList(sequenceTasks[0]['タスク名']);
  updateCSVData();
}

function initSortable() {
  if (sortableInstance) sortableInstance.destroy();
  if (typeof Sortable === 'undefined') return;
  sortableInstance = new Sortable(sequenceList, {
    handle: '.drag-handle', animation: 150, filter: '.active', preventOnFilter: true,
    onEnd: (evt) => {
      if (evt.oldIndex === evt.newIndex) return;
      const moved = sequenceTasks.splice(sequenceIndex + evt.oldIndex, 1)[0];
      sequenceTasks.splice(sequenceIndex + evt.newIndex, 0, moved);
      sequenceTasks.forEach((t, i) => t['順番'] = i + 1);
      saveTasksData();
      updateCSVData();
      renderSequenceList(sequenceTasks[0]['タスク名']);
    }
  });
}

function updateResultsTable() {
  resultsTableBody.innerHTML = '';
  if (currentLogView === 'detail') {
    results.forEach(r => {
      const tr = document.createElement('tr');
      const endDate = new Date(r.date);
      const startDate = new Date(endDate.getTime() - (r.seconds * 1000));
      tr.innerHTML = `<td>${formatDateRange(startDate, endDate)}</td><td>${formatDuration(r.seconds)}</td><td>${r.content}</td>`;
      resultsTableBody.appendChild(tr);
    });
  } else {
    summaryResults.forEach(r => {
      const tr = document.createElement('tr');
      const taskName = r.content.replace(/\s*\(.*/, '');
      tr.innerHTML = `<td>${r.date}</td><td>${formatDuration(r.seconds)}</td><td>${taskName}</td>`;
      resultsTableBody.appendChild(tr);
    });
  }
}

clearResultsButton.onclick = () => {
  if(confirm('ログ消去？')) { results=[]; summaryResults=[]; saveResultsData(); updateResultsTable(); }
};

copyResultsButton.onclick = () => {
  if (results.length===0 && summaryResults.length===0) return alert('ログなし');
  let text = '';
  if (currentLogView === 'detail') {
    text = results.map(r => {
      const endDate = new Date(r.date);
      const startDate = new Date(endDate.getTime() - (r.seconds * 1000));
      return `${formatDateRange(startDate, endDate)}\t${formatDuration(r.seconds)}\t${r.content}`;
    }).join('\n');
  } else {
    text = summaryResults.map(r => {
      const taskNameMatch = r.content.match(/^(.+?)\s*\(/);
      const taskName = taskNameMatch ? taskNameMatch[1] : r.content;
      let dateRangeStr = r.startTime && r.endTime ? formatDateRange(r.startTime, r.endTime) : r.date;
      return `${dateRangeStr}\t${formatDuration(r.seconds)}\t${taskName}`;
    }).join('\n');
  }
  navigator.clipboard.writeText(text).then(()=>alert('コピー完了'));
};

exportCsvButton.addEventListener('click', () => {
  updateCSVData();
  const csvContent = loadFromLocalStorage(STORAGE_KEYS.LAST_CSV);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'lifelisten_data.csv';
  link.click();
});