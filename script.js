// --- グローバルステート ---
let allTasks = [];           // CSV 全データ
let sequenceTasks = [];      // 選択中タスク名のステップ一覧
let sequenceIndex = 0;       // 現在のステップインデックス
let remainingSeconds = 0;    // タイマーの残り秒数（マイナスの場合は超過時間）
let timerId = null;          // メインタイマー用 ID
let preId = null;            // 事前カウントダウン用 ID
let taskStartTime = null;    // タスク全体の開始時刻
let results = [];            // 実行結果ログ（セッション全体）
let isCompletionHandled = false; // 終了処理が実行済みかのフラグ
let summaryResults = [];     // 過去のサマリー結果を保持する配列
let pausedRemainingSeconds = 0; // 一時停止時の残り時間保持用
let pausedStartTime = null;  // 一時停止時の開始時刻
let isPaused = false;        // 一時停止中かどうかのフラグ
let sortableInstance = null; // SortableJSインスタンス
let isStepCompleted = false; // ステップ規定時間を過ぎて待機中かどうかのフラグ
let currentRunStartIndex = 0; // 今回の実行結果がresults配列のどこから始まるかを記録

// --- LocalStorage キー定義 ---
const STORAGE_KEYS = {
  ALL_TASKS: 'lifelisten_timer_all_tasks',
  RESULTS: 'lifelisten_timer_results',
  SUMMARY_RESULTS: 'lifelisten_timer_summary_results',
  LAST_CSV: 'lifelisten_timer_last_csv'
};


// --- DOM要素の取得 ---
const importCsvInput     = document.getElementById('importCsvInput');
const loadCsvButton      = document.getElementById('loadCsvButton');
const exportCsvButton    = document.getElementById('exportCsvButton');
const taskButtons        = document.getElementById('taskButtons');
const currentTaskDisplay = document.getElementById('currentTaskDisplay');
const timerDisplay       = document.getElementById('timerDisplay');
const timerControls      = document.getElementById('timerControls');
const timerSettings      = document.getElementById('timerSettings');
const autoAdvanceToggle  = document.getElementById('autoAdvanceToggle');
const pauseResumeButton  = document.getElementById('pauseResumeButton');
const endButton          = document.getElementById('endButton');
const prevButton         = document.getElementById('prevButton');
const nextButton         = document.getElementById('nextButton');
const sequenceTitle      = document.getElementById('sequenceTitle');
const sequenceList       = document.getElementById('sequenceList');
const resultsTableBody   = document.querySelector('#resultsTable tbody');
const progressRingCircle = document.querySelector('.progress-ring-circle');
const clearResultsButton = document.getElementById('clearResultsButton');
const copyResultsButton  = document.getElementById('copyResultsButton');

// 新規追加セクション系
const addTaskHeader      = document.getElementById('addTaskHeader');
const addTaskContent     = document.getElementById('addTaskContent');
const newTaskName        = document.getElementById('newTaskName');
const newTaskIcon        = document.getElementById('newTaskIcon');
const addTaskButton      = document.getElementById('addTaskButton');
const addStepSection     = document.getElementById('addStepSection');
const newStepName        = document.getElementById('newStepName');
const newStepText        = document.getElementById('newStepText');
const newStepSeconds     = document.getElementById('newStepSeconds');
const addStepButton      = document.getElementById('addStepButton');

// --- プログレスリング設定 ---
const progressRingRadius = parseInt(progressRingCircle.getAttribute('r'));
const progressRingCircumference = 2 * Math.PI * progressRingRadius;
progressRingCircle.style.strokeDasharray = `${progressRingCircumference} ${progressRingCircumference}`;

function updateProgressRing(percent) {
  const offset = progressRingCircumference - (percent / 100 * progressRingCircumference);
  progressRingCircle.style.strokeDashoffset = offset;
}

// --- アイコン取得ヘルパー ---
function getTaskIcon(taskName) {
  const taskIcons = {
    'ラットプルダウン': 'fa-solid fa-arrow-down-wide-short',
    'スクワット': 'fa-solid fa-person-walking',
    'シーテッドロー': 'fa-solid fa-arrows-left-right',
    '机を上にする': 'fa-solid fa-table',
    '歯を磨く': 'fa-solid fa-tooth',
    '着替える': 'fa-solid fa-shirt',
    '請求書を作成する': 'fa-solid fa-file-invoice',
    '読書': 'fa-solid fa-book',
    '休憩': 'fa-solid fa-mug-hot',
    '食事': 'fa-solid fa-utensils',
    '書く': 'fa-solid fa-pen',
    'default': 'fa-solid fa-headphones'
  };
  return taskIcons[taskName] || taskIcons['default'];
}

function isRestPeriod(taskText) {
  return taskText.includes('休憩') || parseInt(taskText.match(/\d+/)?.[0] || 0) > 30;
}

// --- 音声関連ハック ---
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
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  return new Promise((resolve) => {
    u.onend = () => resolve();
    setTimeout(resolve, text.length * 200);
  });
}

// --- データ保存・読み込み ---
function saveToLocalStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

function loadFromLocalStorage(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

function saveTasksData() { saveToLocalStorage(STORAGE_KEYS.ALL_TASKS, allTasks); }
function saveResultsData() {
  saveToLocalStorage(STORAGE_KEYS.RESULTS, results);
  saveToLocalStorage(STORAGE_KEYS.SUMMARY_RESULTS, summaryResults);
}

// --- CSV処理 ---
function parseAndSetupCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return alert('CSVに有効なデータがありません');
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
  saveToLocalStorage(STORAGE_KEYS.LAST_CSV, csvText);
  saveTasksData();
  setupTaskButtons();
}

function updateCSVData() {
  const headers = ['タスク名', '項目名', '読み上げテキスト', '秒数', '順番'];
  let csvContent = headers.join(',') + '\n';
  allTasks.forEach(task => {
    const row = headers.map(header => {
      let value = task[header] || '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvContent += row.join(',') + '\n';
  });
  saveToLocalStorage(STORAGE_KEYS.LAST_CSV, csvContent);
}

// --- 初期化 ---
window.addEventListener('DOMContentLoaded', () => {
  restoreDataFromLocalStorage();
  if (allTasks.length === 0) {
    fetch('firstdata.csv').then(res => res.text()).then(parseAndSetupCSV).catch(console.warn);
  }
  updateProgressRing(100);
  addTaskHeader.addEventListener('click', () => {
    addTaskContent.classList.toggle('hidden');
    addTaskHeader.classList.toggle('active');
  });
  addTaskButton.addEventListener('click', addNewTask);
  addStepButton.addEventListener('click', addNewStep);
});

function restoreDataFromLocalStorage() {
  const savedTasks = loadFromLocalStorage(STORAGE_KEYS.ALL_TASKS);
  if (savedTasks && savedTasks.length > 0) {
    allTasks = savedTasks;
    setupTaskButtons();
  }
  const savedResults = loadFromLocalStorage(STORAGE_KEYS.RESULTS);
  if (savedResults) results = savedResults;
  const savedSummary = loadFromLocalStorage(STORAGE_KEYS.SUMMARY_RESULTS);
  if (savedSummary) {
    summaryResults = savedSummary;
    updateResultsTable();
  }
}

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
  currentTaskDisplay.innerHTML = '<i class="fas fa-info-circle"></i> タスクを選択してください';
  timerDisplay.textContent = '--:--';
  timerDisplay.className = 'timer'; // クラスリセット
  timerControls.classList.add('hidden');
  timerSettings.classList.add('hidden');
  sequenceList.innerHTML = '';
  sequenceTitle.innerHTML = '<i class="fas fa-list-ol"></i> 実行予定のタスク';
  
  results = [];
  updateResultsTable();
  updateProgressRing(100);
  addStepSection.classList.add('hidden');

  // ボタンの表示を確実にリセット
  prevButton.style.display = '';
  nextButton.style.display = '';
  endButton.style.display = '';

  const names = [...new Set(allTasks.map(t=>t['タスク名']))];
  names.forEach(name => {
    const btn = document.createElement('button');
    btn.innerHTML = `<i class="${getTaskIcon(name)}"></i> ${name}`;
    btn.classList.add('task-btn');
    btn.addEventListener('click', ()=> startSequenceFor(name));
    taskButtons.appendChild(btn);
  });
}

// --- タスク/ステップ追加 ---
function addNewTask() {
  const taskName = newTaskName.value.trim();
  if (!taskName) return showErrorMessage(newTaskName, 'タスク名を入力してください');
  
  if (allTasks.some(t => t['タスク名'] === taskName)) {
    return showErrorMessage(newTaskName, 'このタスク名は既に存在します');
  }
  
  const newTask = {
    'タスク名': taskName, '項目名': '1回目', '読み上げテキスト': '1回目', '秒数': 7, '順番': 1
  };
  allTasks.push(newTask);
  saveTasksData();
  setupTaskButtons();
  newTaskName.value = '';
  showSuccessMessage(addTaskContent, `タスク「${taskName}」を追加しました`);
  updateCSVData();
}

function addNewStep() {
  const stepName = newStepName.value.trim();
  const stepText = newStepText.value.trim();
  const stepSeconds = parseInt(newStepSeconds.value) || 7;
  
  if (!stepName || !stepText || stepSeconds < 1) return alert('入力を確認してください');
  
  const currentTaskName = sequenceTasks.length > 0 ? sequenceTasks[0]['タスク名'] : '';
  if (!currentTaskName) return alert('タスクを選択してください');
  
  const maxOrder = Math.max(...sequenceTasks.map(t => t['順番'] || 0), 0);
  const newStep = {
    'タスク名': currentTaskName, '項目名': stepName, '読み上げテキスト': stepText, '秒数': stepSeconds, '順番': maxOrder + 1
  };
  allTasks.push(newStep);
  sequenceTasks.push(newStep);
  saveTasksData();
  renderSequenceList(currentTaskName);
  newStepName.value = ''; newStepText.value = '';
  showSuccessMessage(addStepSection.querySelector('.section-content'), `新しいステップを追加しました`);
  updateCSVData();
}

// --- メッセージ表示 ---
function showErrorMessage(el, msg) {
  el.classList.add('error');
  // 簡易実装
  alert(msg); 
  setTimeout(()=>el.classList.remove('error'), 2000);
}

function showSuccessMessage(container, message) {
  container.querySelectorAll('.success-message').forEach(el => el.remove());
  const successDiv = document.createElement('div');
  successDiv.className = 'success-message';
  successDiv.textContent = message;
  container.appendChild(successDiv);
  setTimeout(() => { successDiv.remove(); }, 3000);
}

// --- メイン処理開始 ---
function startSequenceFor(name) {
  isCompletionHandled = false;
  isPaused = false;
  pausedRemainingSeconds = 0;
  pausedStartTime = null;
  isStepCompleted = false;
  
  // 今回の実行結果が配列のどこから始まるかを記録
  currentRunStartIndex = results.length;
  
  // コントロールボタンの非表示を解除
  prevButton.style.display = '';
  nextButton.style.display = '';
  endButton.style.display = '';
  
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

// --- ステップ実行 ---
async function runNextStep() {
  isStepCompleted = false; // フラグリセット
  timerDisplay.classList.remove('overtime');

  if (sequenceIndex >= sequenceTasks.length) {
    handleCompletion();
    return;
  }
  
  const task = sequenceTasks[sequenceIndex];
  const icon = getTaskIcon(task['タスク名']);
  
  timerControls.classList.remove('hidden');
  timerSettings.classList.remove('hidden');
  
  if (sequenceIndex === 0) {
    speak(`${task['タスク名']}を開始します`);
    let preCount = 5;
    currentTaskDisplay.innerHTML = `<i class="${icon}"></i> ${task['タスク名']}を開始します... ${preCount}`;
    let localPaused = false;
    await new Promise(resolve => {
      preId = setInterval(() => {
        if (isPaused) { localPaused = true; return; }
        if (localPaused) localPaused = false;
        preCount--;
        if (preCount > 0) {
          currentTaskDisplay.innerHTML = `<i class="${icon}"></i> ${task['タスク名']}を開始します... ${preCount}`;
        } else {
          clearInterval(preId); preId = null; resolve();
        }
      }, 1000);
    });
  }
  
  updateCurrentTaskDisplay();
  
  // 【修正箇所】項目名と読み上げテキストを結合して読み上げ
  const textToSpeak = task['項目名'] 
    ? `${task['項目名']}。${task['読み上げテキスト']}` 
    : task['読み上げテキスト'];
  speak(textToSpeak);
  
  // 残り時間設定
  if (pausedRemainingSeconds !== 0) {
    remainingSeconds = pausedRemainingSeconds;
    pausedRemainingSeconds = 0;
  } else {
    remainingSeconds = task['秒数'] || 0;
  }
  
  updateTimerDisplay();
  renderSequenceList(task['タスク名']);
  startTimer();
}

// --- タイマー表示更新 ---
function updateTimerDisplay() {
  const absSeconds = Math.abs(remainingSeconds);
  const m = Math.floor(absSeconds / 60);
  const s = absSeconds % 60;
  const timeString = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  
  if (remainingSeconds < 0) {
    // 超過表示 (+00:05 等)
    timerDisplay.textContent = `+${timeString}`;
    timerDisplay.classList.add('overtime');
  } else {
    timerDisplay.textContent = timeString;
    timerDisplay.classList.remove('overtime');
  }
  
  // プログレスリング
  const currentTask = sequenceTasks[sequenceIndex];
  if (currentTask) {
    const taskSeconds = currentTask['秒数'] || 0;
    let percent = 0;
    if (remainingSeconds > 0 && taskSeconds > 0) {
      percent = (remainingSeconds / taskSeconds) * 100;
    }
    updateProgressRing(percent);
  }
}

// --- 現在の結果を記録するヘルパー ---
function recordCurrentTaskResult(isSkipped = false) {
  if (sequenceIndex >= sequenceTasks.length) return;

  const task = sequenceTasks[sequenceIndex];
  const now = new Date();
  
  const elapsedSeconds = (task['秒数'] || 0) - remainingSeconds;
  
  let contentSuffix = '';
  if (remainingSeconds > 0 && isSkipped) {
    contentSuffix = ' (スキップ)';
  }

  results.push({
    date: `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`,
    seconds: elapsedSeconds,
    content: `${task['タスク名']}：${task['項目名']}：${task['読み上げテキスト']}${contentSuffix}`
  });
  
  updateResultsTable();
}

// --- タイマー動作 ---
function startTimer() {
  if (timerId) clearInterval(timerId);
  
  timerId = setInterval(() => {
    if (isPaused) return;
    
    // カウントダウン（0を過ぎてもマイナスへ進む）
    remainingSeconds--;
    updateTimerDisplay();
    
    // 0になった瞬間の処理
    if (remainingSeconds === 0) {
      if (autoAdvanceToggle.checked) {
        // 自動進行ON
        recordCurrentTaskResult(); // ログ記録
        sequenceIndex++;
        if (timerId) clearInterval(timerId); timerId = null;
        runNextStep();
      } else {
        // 自動進行OFF（手動待ち）
        isStepCompleted = true;
        speak('完了');
        updateCurrentTaskDisplay();
        renderSequenceList(sequenceTasks[sequenceIndex]['タスク名']);
        // タイマーは止めない（超過計測継続）
      }
    }
  }, 1000);
}

// --- ボタンイベント ---
pauseResumeButton.addEventListener('click', () => {
  if (isPaused) {
    isPaused = false;
    pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i> 一時停止';
    if (pausedStartTime) {
      const pausedDuration = new Date() - pausedStartTime;
      taskStartTime = new Date(taskStartTime.getTime() + pausedDuration);
    }
  } else {
    isPaused = true;
    pausedStartTime = new Date();
    pauseResumeButton.innerHTML = '<i class="fas fa-play"></i> 再開';
  }
});

nextButton.addEventListener('click', () => {
  if (sequenceIndex < sequenceTasks.length) {
    if (timerId) { clearInterval(timerId); timerId = null; }
    if (preId) { clearInterval(preId); preId = null; }
    
    isPaused = false;
    pausedRemainingSeconds = 0;
    pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i> 一時停止';
    
    // 現在の結果を記録（スキップフラグは残り時間があるかどうかで判定）
    recordCurrentTaskResult(remainingSeconds > 0);
    
    sequenceIndex++;
    runNextStep();
  }
});

prevButton.addEventListener('click', () => {
  if (sequenceIndex > 0) {
    if (timerId) { clearInterval(timerId); timerId = null; }
    if (preId) { clearInterval(preId); preId = null; }
    isPaused = false;
    pausedRemainingSeconds = 0;
    
    sequenceIndex--;
    runNextStep();
  }
});

endButton.addEventListener('click', () => {
  if (confirm('タスクを終了しますか？')) {
    if (timerId) { clearInterval(timerId); timerId = null; }
    if (preId) { clearInterval(preId); preId = null; }
    
    // 途中終了でも現在の進行状況を記録する
    if (sequenceIndex < sequenceTasks.length) {
        recordCurrentTaskResult(remainingSeconds > 0);
    }
    
    handleCompletion();
  }
});

// --- 完了処理 ---
function handleCompletion() {
  if (isCompletionHandled) return;
  isCompletionHandled = true;
  
  const taskName = sequenceTasks.length > 0 ? sequenceTasks[0]['タスク名'] : 'タスク';
  currentTaskDisplay.innerHTML = `<i class="fas fa-check-circle" style="color: #27ae60;"></i> ${taskName}が完了しました！`;
  currentTaskDisplay.classList.add('completion-message');
  
  playCompletionEffect();
  speak(`${taskName}が完了しました。お疲れ様でした！`);
  
  timerDisplay.textContent = '00:00';
  timerDisplay.classList.remove('overtime');
  updateProgressRing(0);
  timerControls.classList.add('hidden');
  timerSettings.classList.add('hidden');
  
  // 今回の実行分(currentRunStartIndex以降)だけを集計する
  const currentRunResults = results.slice(currentRunStartIndex);
  const totalExecutedSeconds = currentRunResults.reduce((sum, r) => sum + r.seconds, 0);
  
  const endTime = new Date();
  const endTimeString = `${endTime.getFullYear()}/${endTime.getMonth()+1}/${endTime.getDate()} ${endTime.getHours().toString().padStart(2,'0')}:${endTime.getMinutes().toString().padStart(2,'0')}:${endTime.getSeconds().toString().padStart(2,'0')}`;
  const startTimeString = taskStartTime ? 
    `${taskStartTime.getFullYear()}/${taskStartTime.getMonth()+1}/${taskStartTime.getDate()} ${taskStartTime.getHours().toString().padStart(2,'0')}:${taskStartTime.getMinutes().toString().padStart(2,'0')}:${taskStartTime.getSeconds().toString().padStart(2,'0')}` : 
    endTimeString;
  
  summaryResults.push({
    date: endTimeString,
    startTime: startTimeString,
    endTime: endTimeString,
    seconds: totalExecutedSeconds,
    content: `${taskName} (${currentRunResults.length}ステップ完了)`
  });
  saveResultsData();
  updateResultsTable();
  
  // 完了後はボタンを隠す（次にスタートする時に startSequenceFor で再表示される）
  prevButton.style.display = 'none';
  nextButton.style.display = 'none';
  endButton.style.display = 'none';
}

// --- リスト表示関連 ---
function updateCurrentTaskDisplay() {
  if (sequenceIndex >= sequenceTasks.length) return;
  const task = sequenceTasks[sequenceIndex];
  const icon = getTaskIcon(task['タスク名']);
  let html = `<i class="${icon}"></i> ${task['タスク名']}：${task['項目名']}：${task['読み上げテキスト']}`;
  if (isStepCompleted) {
    html += ' <span style="color: #27ae60; font-weight: bold;">(完了 - 超過計測中)</span>';
  }
  currentTaskDisplay.innerHTML = html;
}

function renderSequenceList(name) {
  sequenceTitle.innerHTML = `<i class="fas fa-list-ol"></i> ${name} のタスク`;
  sequenceList.innerHTML = '';
  
  sequenceTasks.forEach((task, i) => {
    if (i < sequenceIndex) return;
    
    let className = 'sequence-item';
    if (i === sequenceIndex) {
      className += ' active';
      if (isStepCompleted) className += ' waiting-next';
    }
    
    const item = document.createElement('div');
    item.className = className;
    
    const icon = getTaskIcon(task['タスク名']);
    item.innerHTML = `
      <div class="drag-handle ${i===sequenceIndex?'disabled':''}"><i class="fas fa-grip-vertical"></i></div>
      <div class="label-container"><i class="${icon}"></i></div>
    `;
    
    const nameInput = document.createElement('input');
    nameInput.type='text'; nameInput.value=task['項目名']||''; nameInput.className='seq-name-input';
    nameInput.onchange = (e) => {
        task['項目名'] = e.target.value;
        const orgIdx = allTasks.findIndex(t => t===task);
        if(orgIdx!==-1) { allTasks[orgIdx]['項目名']=e.target.value; saveTasksData(); }
    };
    
    const textInput = document.createElement('input');
    textInput.type='text'; textInput.value=task['読み上げテキスト']||''; textInput.className='seq-text-input';
    textInput.onchange = (e) => {
        task['読み上げテキスト'] = e.target.value;
        const orgIdx = allTasks.findIndex(t => t===task);
        if(orgIdx!==-1) { allTasks[orgIdx]['読み上げテキスト']=e.target.value; saveTasksData(); }
    };
    
    const secInput = document.createElement('input');
    secInput.type='number'; secInput.value=task['秒数']||7; secInput.className='seq-seconds-input';
    secInput.onchange = (e) => {
        task['秒数'] = parseInt(e.target.value);
        const orgIdx = allTasks.findIndex(t => t===task);
        if(orgIdx!==-1) { allTasks[orgIdx]['秒数']=task['秒数']; saveTasksData(); }
    };

    const delBtn = document.createElement('button');
    delBtn.innerHTML = '<i class="fas fa-trash"></i>';
    delBtn.className = 'delete-btn';
    delBtn.disabled = i === sequenceIndex;
    delBtn.onclick = () => deleteSequenceTask(i);

    item.appendChild(nameInput);
    item.appendChild(textInput);
    item.appendChild(secInput);
    item.appendChild(delBtn);
    sequenceList.appendChild(item);
  });
  
  initSortable();
}

// --- その他のヘルパー (削除、Sortable、演出など) ---
function deleteSequenceTask(index) {
  if (index === sequenceIndex) return alert('実行中は削除できません');
  if (!confirm('削除しますか？')) return;
  
  const task = sequenceTasks[index];
  const allIdx = allTasks.indexOf(task);
  if (allIdx !== -1) allTasks.splice(allIdx, 1);
  sequenceTasks.splice(index, 1);
  saveTasksData();
  renderSequenceList(sequenceTasks[0]?.['タスク名'] || '');
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
      renderSequenceList(sequenceTasks[0]['タスク名']);
    }
  });
}

function playCompletionEffect() {
  const overlay = document.getElementById('completionEffect');
  const starburst = overlay.querySelector('.starburst');
  overlay.style.visibility = 'visible';
  requestAnimationFrame(() => { overlay.classList.add('active'); starburst.classList.add('active'); });
  playCompletionSound();
  setTimeout(() => {
    overlay.classList.remove('active'); starburst.classList.remove('active'); overlay.style.visibility = 'hidden';
  }, 1000);
}

function playCompletionSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.3, ctx.currentTime + i*0.15);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (i+1)*0.15);
      osc.start(ctx.currentTime + i*0.15); osc.stop(ctx.currentTime + (i+1)*0.15);
    });
  } catch(e){}
}

function updateResultsTable() {
  resultsTableBody.innerHTML = '';
  results.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.date}</td><td>${r.seconds}</td><td>${r.content}</td>`;
    resultsTableBody.appendChild(tr);
  });
  summaryResults.forEach(r => {
    const tr = document.createElement('tr'); tr.className = 'summary-row';
    const m = Math.floor(r.seconds/60), s = r.seconds%60;
    tr.innerHTML = `<td>**合計: ${r.content}**<br>${m}分${s}秒<br>${r.startTime}〜${r.endTime}</td><td>${r.seconds}</td><td>${r.content}</td>`;
    resultsTableBody.appendChild(tr);
  });
}

clearResultsButton.onclick = () => {
  if(confirm('ログ消去？')) { results=[]; summaryResults=[]; saveResultsData(); updateResultsTable(); }
};

copyResultsButton.onclick = () => {
  if (results.length===0 && summaryResults.length===0) return alert('ログなし');
  let text = results.map(r=>`${r.date}\t${r.seconds}\t${r.content}`).join('\n');
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