// --- グローバルステート ---
let allTasks = [];           // CSV 全データ
let sequenceTasks = [];      // 選択中タスク名のステップ一覧
let sequenceIndex = 0;       // 現在のステップインデックス
let remainingSeconds = 0;    
let timerId = null;          // メインタイマー用 ID
let preId = null;            // 事前カウントダウン用 ID
let taskStartTime = null;    // タスク開始時刻
let results = [];            // 実行結果ログ
let totalSeconds = 0;        // タスクの合計秒数（プログレスバー計算用）
let isCompletionHandled = false; // 終了処理が実行済みかのフラグ
let summaryResults = [];     // 過去のサマリー結果を保持する配列
let pausedRemainingSeconds = 0; // 一時停止時の残り時間（超過時はマイナスも保持）
let pausedStartTime = null;  // 一時停止時の開始時刻
let isPaused = false;        // 一時停止中かどうかのフラグ
let sortableInstance = null; // SortableJSインスタンス
let isStepCompleted = false; // ステップが規定時間を過ぎて完了しているか（超過計測中）のフラグ

// --- LocalStorage キー定義 ---
const STORAGE_KEYS = {
  ALL_TASKS: 'lifelisten_timer_all_tasks',
  RESULTS: 'lifelisten_timer_results',
  SUMMARY_RESULTS: 'lifelisten_timer_summary_results',
  LAST_CSV: 'lifelisten_timer_last_csv'
};


// --- DOM取得 ---
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
const sequenceTitle      = document.getElementById('sequenceTitle');
const sequenceList       = document.getElementById('sequenceList');
const resultsTableBody   = document.querySelector('#resultsTable tbody');
const progressRingCircle = document.querySelector('.progress-ring-circle');
const clearResultsButton = document.getElementById('clearResultsButton');
const copyResultsButton = document.getElementById('copyResultsButton');

// 新規タスク追加関連のDOM要素
const addTaskHeader      = document.getElementById('addTaskHeader');
const addTaskContent     = document.getElementById('addTaskContent');
const newTaskName        = document.getElementById('newTaskName');
const newTaskIcon        = document.getElementById('newTaskIcon');
const addTaskButton      = document.getElementById('addTaskButton');

// 新規ステップ追加関連のDOM要素
const addStepSection     = document.getElementById('addStepSection');
const newStepName        = document.getElementById('newStepName');
const newStepText        = document.getElementById('newStepText');
const newStepSeconds     = document.getElementById('newStepSeconds');
const addStepButton      = document.getElementById('addStepButton');

// プログレスリングの円周を計算
const progressRingRadius = parseInt(progressRingCircle.getAttribute('r'));
const progressRingCircumference = 2 * Math.PI * progressRingRadius;
progressRingCircle.style.strokeDasharray = `${progressRingCircumference} ${progressRingCircumference}`;

// プログレスリングの更新関数
function updateProgressRing(percent) {
  const offset = progressRingCircumference - (percent / 100 * progressRingCircumference);
  progressRingCircle.style.strokeDashoffset = offset;
}

// タスク種類に応じたアイコンを取得する関数
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
    // デフォルトアイコン
    'default': 'fa-solid fa-headphones'
  };
  
  return taskIcons[taskName] || taskIcons['default'];
}

// 休憩かどうかを判定する関数
function isRestPeriod(taskText) {
  return taskText.includes('休憩') || parseInt(taskText.match(/\d+/)?.[0] || 0) > 30;
}

// --- 無音ループを再生してAudioContextを起動し、バックグラウンドでも音声が止まらないように試みる
function enableBackgroundAudioHack() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  osc.frequency.value = 0;      // 無音
  osc.connect(ctx.destination);
  osc.start();
}

// --- DOMContentLoaded の外でもOK ---
// 最初の「タップ」イベントを拾って一度だけ呼び出す
document.addEventListener('click', function initBgAudio() {
  enableBackgroundAudioHack();
  document.removeEventListener('click', initBgAudio);
});

// --- 音声読み上げ関数 ---
function speak(text) {
  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  
  // デバッグ用
  console.log('読み上げ:', text);
  
  return new Promise((resolve) => {
    u.onend = () => resolve();
    // 万が一onendが発火しない場合のフォールバック
    setTimeout(resolve, text.length * 200);
  });
}

// --- LocalStorageにデータを保存する関数 ---
function saveToLocalStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error(`LocalStorageへの保存に失敗しました: ${error.message}`);
    return false;
  }
}

// --- LocalStorageからデータを読み込む関数 ---
function loadFromLocalStorage(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error(`LocalStorageからの読み込みに失敗しました: ${error.message}`);
    return null;
  }
}

// --- タスクデータを保存する関数 ---
function saveTasksData() {
  saveToLocalStorage(STORAGE_KEYS.ALL_TASKS, allTasks);
}

// --- 結果データを保存する関数 ---
function saveResultsData() {
  saveToLocalStorage(STORAGE_KEYS.RESULTS, results);
  saveToLocalStorage(STORAGE_KEYS.SUMMARY_RESULTS, summaryResults);
}

// --- CSV テキストをパースして UI をセットアップ ---
function parseAndSetupCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    alert('CSVに有効なデータがありません');
    return;
  }
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
  
  // CSVテキストを保存
  saveToLocalStorage(STORAGE_KEYS.LAST_CSV, csvText);
  
  // タスクデータを保存
  saveTasksData();
  
  setupTaskButtons();
}

// --- デフォルトCSV自動ロード ---
window.addEventListener('DOMContentLoaded', () => {
  // LocalStorageからデータを復元
  restoreDataFromLocalStorage();
  
  // LocalStorageにデータがない場合はデフォルトCSVを読み込む
  if (allTasks.length === 0) {
    fetch('firstdata.csv')
      .then(res => res.text())
      .then(text => {
        parseAndSetupCSV(text);
      })
      .catch(() => console.warn('firstdata.csv の読み込みに失敗'));
  }
  
  // 初期状態でプログレスリングを非表示
  updateProgressRing(100);
  
  // 新規タスク追加セクションの折りたたみ/展開イベント設定
  addTaskHeader.addEventListener('click', () => {
    addTaskContent.classList.toggle('hidden');
    addTaskHeader.classList.toggle('active');
  });
  
  // 新規タスク追加ボタンのイベント設定
  addTaskButton.addEventListener('click', addNewTask);
  
  // 新規ステップ追加ボタンのイベント設定
  addStepButton.addEventListener('click', addNewStep);
});

// --- LocalStorageからデータを復元する関数 ---
function restoreDataFromLocalStorage() {
  // タスクデータの復元
  const savedTasks = loadFromLocalStorage(STORAGE_KEYS.ALL_TASKS);
  if (savedTasks && savedTasks.length > 0) {
    allTasks = savedTasks;
    setupTaskButtons();
  }
  
  // 結果データの復元
  const savedResults = loadFromLocalStorage(STORAGE_KEYS.RESULTS);
  if (savedResults) {
    results = savedResults;
  }
  
  // サマリーデータの復元
  const savedSummary = loadFromLocalStorage(STORAGE_KEYS.SUMMARY_RESULTS);
  if (savedSummary) {
    summaryResults = savedSummary;
    updateResultsTable();
  }
}

// --- 「読み込む」ボタンでユーザーCSVを読み込む ---
loadCsvButton.addEventListener('click', () => {
  const file = importCsvInput.files[0];
  if (!file) return alert('CSVファイルを選択してください');
  const reader = new FileReader();
  reader.onload = e => parseAndSetupCSV(e.target.result);
  reader.readAsText(file, 'UTF-8');
});

// --- タスク名ボタン生成 ---
function setupTaskButtons() {
  taskButtons.innerHTML = '';
  currentTaskDisplay.textContent = 'タスクを選択してください';
  currentTaskDisplay.innerHTML = '<i class="fas fa-info-circle"></i> タスクを選択してください';
  timerDisplay.textContent = '--:--';
  timerDisplay.className = 'timer'; // クラスをリセット
  timerControls.classList.add('hidden');
  timerSettings.classList.add('hidden');
  sequenceList.innerHTML = '';
  sequenceTitle.innerHTML = '<i class="fas fa-list-ol"></i> 実行予定のタスク';
  
  // 結果テーブルをクリアするが、過去のサマリーは保持
  results = [];
  updateResultsTable();
  
  // プログレスリングをリセット
  updateProgressRing(100);
  
  // ステップ追加セクションを非表示
  addStepSection.classList.add('hidden');

  // ボタン表示を元に戻す
  document.getElementById('prevButton').style.display = '';
  document.getElementById('nextButton').style.display = '';
  document.getElementById('endButton').style.display = '';

  const names = [...new Set(allTasks.map(t=>t['タスク名']))];
  names.forEach(name => {
    const btn = document.createElement('button');
    const icon = getTaskIcon(name);
    btn.innerHTML = `<i class="${icon}"></i> ${name}`;
    btn.classList.add('task-btn');
    btn.addEventListener('click', ()=> startSequenceFor(name));
    taskButtons.appendChild(btn);
  });
}

// --- 新規タスク追加機能 ---
function addNewTask() {
  const taskName = newTaskName.value.trim();
  const iconClass = newTaskIcon.value;
  
  removeErrorMessages();
  
  if (!taskName) {
    showErrorMessage(newTaskName, 'タスク名を入力してください');
    return;
  }
  
  const existingTaskNames = [...new Set(allTasks.map(t => t['タスク名']))];
  if (existingTaskNames.includes(taskName)) {
    showErrorMessage(newTaskName, 'このタスク名は既に存在します');
    return;
  }
  
  const newTask = {
    'タスク名': taskName,
    '項目名': '1回目',
    '読み上げテキスト': '1回目。いいぞ、その調子！',
    '秒数': 7,
    '順番': 1
  };
  
  allTasks.push(newTask);
  saveTasksData();
  setupTaskButtons();
  newTaskName.value = '';
  showSuccessMessage(addTaskContent, `タスク「${taskName}」を追加しました`);
  updateCSVData();
}

// --- CSVデータの更新関数 ---
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

// --- エラーメッセージ表示 ---
function showErrorMessage(element, message) {
  element.classList.add('error');
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  element.parentNode.appendChild(errorDiv);
}

// --- エラーメッセージ削除 ---
function removeErrorMessages() {
  document.querySelectorAll('.error-message').forEach(el => el.remove());
  document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
}

// --- 成功メッセージ表示 ---
function showSuccessMessage(container, message) {
  container.querySelectorAll('.success-message').forEach(el => el.remove());
  const successDiv = document.createElement('div');
  successDiv.className = 'success-message';
  successDiv.textContent = message;
  container.appendChild(successDiv);
  setTimeout(() => {
    successDiv.remove();
  }, 3000);
}

// --- タスク開始 ---
function startSequenceFor(name) {
  isCompletionHandled = false;
  isPaused = false;
  pausedRemainingSeconds = 0;
  pausedStartTime = null;
  isStepCompleted = false;
  
  pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i> 一時停止';
  timerDisplay.className = 'timer'; // スタイルリセット
  
  sequenceTasks = allTasks
    .filter(t=>t['タスク名']===name)
    .sort((a,b)=>(a['順番']||0)-(b['順番']||0));
  sequenceIndex = 0;
  
  totalSeconds = sequenceTasks.reduce((sum, task) => sum + (task['秒数'] || 0), 0);
  
  renderSequenceList(name);
  addStepSection.classList.remove('hidden');
  
  taskStartTime = new Date();
  
  runNextStep();
}

// --- ドラッグ&ドロップによる並び替え処理 ---
function handleDragEnd(evt) {
  const oldIndex = evt.oldIndex;
  const newIndex = evt.newIndex;
  
  if (oldIndex === newIndex) return;
  
  const actualOldIndex = sequenceIndex + oldIndex;
  const actualNewIndex = sequenceIndex + newIndex;
  
  if (actualOldIndex === sequenceIndex || actualNewIndex === sequenceIndex) {
    renderSequenceList(sequenceTasks[0]['タスク名']);
    return;
  }
  
  const movedTask = sequenceTasks.splice(actualOldIndex, 1)[0];
  sequenceTasks.splice(actualNewIndex, 0, movedTask);
  
  sequenceTasks.forEach((task, i) => {
    task['順番'] = i + 1;
  });
  
  sequenceTasks.forEach(task => {
    const taskIndex = allTasks.findIndex(t => 
      t['タスク名'] === task['タスク名'] && 
      t['読み上げテキスト'] === task['読み上げテキスト'] &&
      t['秒数'] === task['秒数']
    );
    if (taskIndex !== -1) {
      allTasks[taskIndex]['順番'] = task['順番'];
    }
  });
  
  saveTasksData();
  updateCSVData();
  renderSequenceList(sequenceTasks[0]['タスク名']);
}

// --- SortableJSの初期化 ---
function initSortable() {
  if (sortableInstance) {
    sortableInstance.destroy();
    sortableInstance = null;
  }
  
  if (typeof Sortable === 'undefined') {
    console.warn('SortableJS is not loaded');
    return;
  }
  
  sortableInstance = new Sortable(sequenceList, {
    animation: 150,
    handle: '.drag-handle',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    filter: '.active',
    preventOnFilter: true,
    onEnd: handleDragEnd,
    delay: 100,
    delayOnTouchOnly: true,
    touchStartThreshold: 3
  });
}

// --- 実行予定リスト表示 ---
function renderSequenceList(name) {
  sequenceTitle.innerHTML = `<i class="fas fa-list-ol"></i> ${name} のタスク`;
  sequenceList.innerHTML = '';
  
  sequenceTasks.forEach((task, i) => {
    if (i < sequenceIndex) return;
    
    let className = 'sequence-item';
    if (i === sequenceIndex) {
      className += ' active';
      if (isStepCompleted) {
        className += ' waiting-next';
      }
    }
    
    const item = document.createElement('div');
    item.className = className;
    item.dataset.index = i;
    
    const isRest = isRestPeriod(task['読み上げテキスト']);
    const icon = isRest ? 'fa-solid fa-mug-hot' : 'fa-solid fa-person-running';
    
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle' + (i === sequenceIndex ? ' disabled' : '');
    dragHandle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
    dragHandle.title = i === sequenceIndex ? '実行中は移動不可' : 'ドラッグして並び替え';
    
    const labelContainer = document.createElement('div');
    labelContainer.className = 'label-container';
    labelContainer.innerHTML = `<i class="${icon}"></i>`;
    
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = task['項目名'] || '';
    nameInput.className = 'seq-name-input';
    nameInput.dataset.index = i;
    nameInput.placeholder = '項目名を入力';
    nameInput.title = task['項目名'] || '';
    nameInput.addEventListener('change', e => {
      const idx = +e.target.dataset.index;
      const newName = e.target.value;
      
      sequenceTasks[idx]['項目名'] = newName;
      
      const taskIndex = allTasks.findIndex(t => 
        t['タスク名'] === sequenceTasks[idx]['タスク名'] && 
        t['順番'] === sequenceTasks[idx]['順番']
      );
      
      if (taskIndex !== -1) {
        allTasks[taskIndex]['項目名'] = newName;
        saveTasksData();
        
        nameInput.classList.add('saved');
        setTimeout(() => {
          nameInput.classList.remove('saved');
        }, 500);
        
        if (idx === sequenceIndex) {
          updateCurrentTaskDisplay();
        }
        nameInput.title = newName;
      }
    });
    
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = task['読み上げテキスト'] || '';
    textInput.className = 'seq-text-input';
    textInput.dataset.index = i;
    textInput.placeholder = '読み上げテキストを入力';
    textInput.title = task['読み上げテキスト'] || '';
    textInput.addEventListener('change', e => {
      const idx = +e.target.dataset.index;
      const newText = e.target.value;
      
      sequenceTasks[idx]['読み上げテキスト'] = newText;
      
      const taskIndex = allTasks.findIndex(t => 
        t['タスク名'] === sequenceTasks[idx]['タスク名'] && 
        t['順番'] === sequenceTasks[idx]['順番']
      );
      
      if (taskIndex !== -1) {
        allTasks[taskIndex]['読み上げテキスト'] = newText;
        saveTasksData();
        
        textInput.classList.add('saved');
        setTimeout(() => {
          textInput.classList.remove('saved');
        }, 500);
        
        textInput.title = newText;
      }
    });
    
    const secondsInput = document.createElement('input');
    secondsInput.type = 'number';
    secondsInput.value = task['秒数'] || 0;
    secondsInput.className = 'seq-seconds-input';
    secondsInput.dataset.index = i;
    secondsInput.min = '1';
    secondsInput.max = '3600';
    secondsInput.addEventListener('change', e => {
      const idx = +e.target.dataset.index;
      const newSeconds = Math.max(1, Math.min(3600, +e.target.value || 1));
      
      sequenceTasks[idx]['秒数'] = newSeconds;
      
      const taskIndex = allTasks.findIndex(t => 
        t['タスク名'] === sequenceTasks[idx]['タスク名'] && 
        t['順番'] === sequenceTasks[idx]['順番']
      );
      
      if (taskIndex !== -1) {
        allTasks[taskIndex]['秒数'] = newSeconds;
        saveTasksData();
        
        secondsInput.classList.add('saved');
        setTimeout(() => {
          secondsInput.classList.remove('saved');
        }, 500);
      }
      e.target.value = newSeconds;
    });
    
    const deleteButton = document.createElement('button');
    deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
    deleteButton.className = 'delete-btn';
    deleteButton.title = 'ステップを削除';
    deleteButton.disabled = i === sequenceIndex;
    deleteButton.addEventListener('click', () => deleteSequenceTask(i));
    
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'button-container';
    buttonContainer.appendChild(deleteButton);
    item.appendChild(dragHandle);
    item.appendChild(labelContainer);
    item.appendChild(nameInput);
    item.appendChild(textInput);
    item.appendChild(secondsInput);
    item.appendChild(buttonContainer);
    
    sequenceList.appendChild(item);
  });
  
  initSortable();
}

// --- 新規ステップ追加機能 ---
function addNewStep() {
  const stepName = newStepName.value.trim();
  const stepText = newStepText.value.trim();
  const stepSeconds = parseInt(newStepSeconds.value) || 7;
  
  removeErrorMessages();
  
  if (!stepName) {
    showErrorMessage(newStepName, 'ステップ名を入力してください');
    return;
  }
  
  if (!stepText) {
    showErrorMessage(newStepText, '読み上げテキストを入力してください');
    return;
  }
  
  if (stepSeconds < 1 || stepSeconds > 3600) {
    showErrorMessage(newStepSeconds, '秒数は1〜3600の範囲で入力してください');
    return;
  }
  
  const currentTaskName = sequenceTasks.length > 0 ? sequenceTasks[0]['タスク名'] : '';
  if (!currentTaskName) {
    alert('タスクが選択されていません');
    return;
  }
  
  const maxOrder = Math.max(...sequenceTasks.map(t => t['順番'] || 0), 0);
  const newOrder = maxOrder + 1;
  
  const newStep = {
    'タスク名': currentTaskName,
    '項目名': stepName,
    '読み上げテキスト': stepText,
    '秒数': stepSeconds,
    '順番': newOrder
  };
  
  allTasks.push(newStep);
  sequenceTasks.push(newStep);
  saveTasksData();
  renderSequenceList(currentTaskName);
  newStepName.value = '';
  newStepText.value = '';
  newStepSeconds.value = '7';
  showSuccessMessage(addStepSection.querySelector('.section-content'), `新しいステップを追加しました`);
  updateCSVData();
}

// --- 「CSV エクスポート」ボタン ---
exportCsvButton.addEventListener('click', () => {
  updateCSVData();
  const csvContent = loadFromLocalStorage(STORAGE_KEYS.LAST_CSV);
  if (!csvContent) {
    alert('エクスポートするデータがありません');
    return;
  }
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', 'lifelisten_timer_data.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// --- 現在のタスク表示を更新する関数 ---
function updateCurrentTaskDisplay() {
  if (sequenceIndex >= sequenceTasks.length) return;
  
  const task = sequenceTasks[sequenceIndex];
  const isRest = isRestPeriod(task['読み上げテキスト']);
  const icon = isRest ? 'fa-solid fa-mug-hot' : 'fa-solid fa-person-running';
  
  const stepName = task['項目名'] || '';
  const readText = task['読み上げテキスト'] || '';
  
  let displayHTML = `<i class="${icon}"></i> ${task['タスク名']}：${stepName}：${readText}`;
  if (isStepCompleted) {
    // 待機中のメッセージ表示
    displayHTML += ' <span style="color: #27ae60; font-weight: bold;">(完了 - 超過計測中)</span>';
  }
  currentTaskDisplay.innerHTML = displayHTML;
}

// --- 次のステップを実行 ---
async function runNextStep() {
  isStepCompleted = false; // ステップ開始時にリセット
  timerDisplay.classList.remove('overtime'); // 超過スタイル解除

  if (sequenceIndex >= sequenceTasks.length) {
    handleCompletion();
    return;
  }
  
  const task = sequenceTasks[sequenceIndex];
  const isRest = isRestPeriod(task['読み上げテキスト']);
  const icon = isRest ? 'fa-solid fa-mug-hot' : 'fa-solid fa-person-running';
  
  timerControls.classList.remove('hidden');
  timerSettings.classList.remove('hidden');
  
  if (sequenceIndex === 0) {
    speak(`${task['タスク名']}を開始します`);
    let preCount = 5;
    currentTaskDisplay.innerHTML = `<i class="${icon}"></i> ${task['タスク名']}を開始します... ${preCount}`;
    let localPaused = false;
    await new Promise(resolve => {
      preId = setInterval(() => {
        if (isPaused) {
          localPaused = true;
          return;
        }
        if (localPaused) {
          localPaused = false;
        }
        preCount--;
        if (preCount > 0) {
          currentTaskDisplay.innerHTML = `<i class="${icon}"></i> ${task['タスク名']}を開始します... ${preCount}`;
        } else {
          clearInterval(preId);
          preId = null;
          resolve();
        }
      }, 1000);
    });
  }
  
  updateCurrentTaskDisplay();
  speak(task['読み上げテキスト']);
  
  // 一時停止（または超過）からの復帰か、新規開始か
  if (pausedRemainingSeconds !== 0) {
    // 一時停止中、または超過計測中に戻った場合など
    remainingSeconds = pausedRemainingSeconds;
    pausedRemainingSeconds = 0;
  } else {
    remainingSeconds = task['秒数'] || 0;
  }
  
  updateTimerDisplay();
  renderSequenceList(task['タスク名']);
  startTimer();
}

// --- タイマー表示の更新 ---
function updateTimerDisplay() {
  // マイナス（超過）対応
  const absSeconds = Math.abs(remainingSeconds);
  const m = Math.floor(absSeconds / 60);
  const s = absSeconds % 60;
  const timeString = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  
  if (remainingSeconds < 0) {
    // 超過表示
    timerDisplay.textContent = `+${timeString}`;
    timerDisplay.classList.add('overtime');
  } else {
    // 通常表示
    timerDisplay.textContent = timeString;
    timerDisplay.classList.remove('overtime');
  }
  
  // プログレスリングの更新
  const currentTask = sequenceTasks[sequenceIndex];
  if (currentTask) {
    const taskSeconds = currentTask['秒数'] || 0;
    // 超過時はリングをフルのまま、あるいは0にするなど。ここでは0にしておく
    let percent = 0;
    if (remainingSeconds > 0) {
      percent = taskSeconds > 0 ? (remainingSeconds / taskSeconds) * 100 : 0;
    }
    updateProgressRing(percent);
  }
}

// --- タイマー開始 ---
function startTimer() {
  if (timerId) {
    clearInterval(timerId);
  }
  
  timerId = setInterval(() => {
    if (isPaused) return;
    
    // 【修正】ここでは計測を止めない。remainingSecondsを減らし続ける
    remainingSeconds--;
    updateTimerDisplay();
    
    // 残り0秒になった瞬間の処理
    if (remainingSeconds === 0) {
      // 0になった瞬間
      if (autoAdvanceToggle.checked) {
        // 自動進行ON: ログ保存して次へ
        clearInterval(timerId);
        timerId = null;
        
        const task = sequenceTasks[sequenceIndex];
        const now = new Date();
        results.push({
          date: `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`,
          seconds: task['秒数'] || 0,
          content: `${task['タスク名']}：${task['項目名']}：${task['読み上げテキスト']}`
        });
        updateResultsTable();
        sequenceIndex++;
        runNextStep();
      } else {
        // 自動進行OFF: 状態を完了（待機）にするがタイマーは止めない
        isStepCompleted = true;
        speak('完了');
        updateCurrentTaskDisplay();
        renderSequenceList(sequenceTasks[sequenceIndex]['タスク名']);
      }
    } else if (remainingSeconds < 0) {
      // 0未満（超過計測中）
      if (autoAdvanceToggle.checked) {
         // 念のためここにもガードを入れるが、通常0で分岐するのでここには来ないはず
         // 万が一スキップなどで変な状態になった場合用
         clearInterval(timerId);
         timerId = null;
         sequenceIndex++;
         runNextStep();
      }
      // 自動進行OFFなら何もしない（ループ継続でマイナスが増える）
    }
  }, 1000);
}

// --- 一時停止/再開ボタン ---
pauseResumeButton.addEventListener('click', () => {
  if (isPaused) {
    isPaused = false;
    pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i> 一時停止';
    if (pausedStartTime) {
      const pausedDuration = new Date() - pausedStartTime;
      taskStartTime = new Date(taskStartTime.getTime() + pausedDuration);
      pausedStartTime = null;
    }
  } else {
    isPaused = true;
    pausedStartTime = new Date();
    pauseResumeButton.innerHTML = '<i class="fas fa-play"></i> 再開';
  }
});

// --- 前へボタン ---
document.getElementById('prevButton').addEventListener('click', () => {
  if (sequenceIndex > 0) {
    if (timerId) { clearInterval(timerId); timerId = null; }
    if (preId) { clearInterval(preId); preId = null; }
    
    isPaused = false;
    isStepCompleted = false;
    pausedRemainingSeconds = 0;
    pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i> 一時停止';
    
    sequenceIndex--;
    runNextStep();
  }
});

// --- 次へボタン ---
document.getElementById('nextButton').addEventListener('click', () => {
  if (sequenceIndex < sequenceTasks.length - 1) {
    if (timerId) { clearInterval(timerId); timerId = null; }
    if (preId) { clearInterval(preId); preId = null; }
    
    isPaused = false;
    pausedRemainingSeconds = 0;
    pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i> 一時停止';
    
    const task = sequenceTasks[sequenceIndex];
    const now = new Date();
    
    // 【修正】超過計測中か、未完了（スキップ）かで記録時間を変える
    let elapsedSeconds;
    let contentSuffix = '';
    
    if (isStepCompleted) {
      // 完了済み（超過計測中）の場合：設定秒数 + 超過秒数(絶対値)
      // remainingSecondsはマイナスになっている
      elapsedSeconds = (task['秒数'] || 0) + Math.abs(remainingSeconds);
      // 通常完了扱い
    } else {
      // 未完了（スキップ）の場合：設定秒数 - 残り秒数
      elapsedSeconds = (task['秒数'] || 0) - remainingSeconds;
      contentSuffix = ' (スキップ)';
    }

    results.push({
      date: `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`,
      seconds: elapsedSeconds,
      content: `${task['タスク名']}：${task['項目名']}：${task['読み上げテキスト']}${contentSuffix}`
    });
    
    isStepCompleted = false; // フラグリセット
    sequenceIndex++;
    runNextStep();
  } else if (isStepCompleted && sequenceIndex === sequenceTasks.length - 1) {
    // 最後のステップで完了待ちの場合に「次へ」を押すと終了
    // ログ保存が必要
    const task = sequenceTasks[sequenceIndex];
    const now = new Date();
    const elapsedSeconds = (task['秒数'] || 0) + Math.abs(remainingSeconds);
    
    results.push({
      date: `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`,
      seconds: elapsedSeconds,
      content: `${task['タスク名']}：${task['項目名']}：${task['読み上げテキスト']}`
    });

    handleCompletion();
  }
});

// --- 終了ボタン ---
endButton.addEventListener('click', () => {
  if (confirm('タスクを終了しますか？')) {
    if (timerId) { clearInterval(timerId); timerId = null; }
    if (preId) { clearInterval(preId); preId = null; }
    handleCompletion();
  }
});

// --- シーケンスタスクの削除 ---
function deleteSequenceTask(index) {
  if (index === sequenceIndex) {
    alert('現在実行中のステップは削除できません');
    return;
  }
  if (!confirm('このステップを削除しますか？')) {
    return;
  }
  const taskToDelete = sequenceTasks[index];
  const allTaskIndex = allTasks.findIndex(t => 
    t['タスク名'] === taskToDelete['タスク名'] && 
    t['順番'] === taskToDelete['順番']
  );
  if (allTaskIndex !== -1) {
    allTasks.splice(allTaskIndex, 1);
  }
  sequenceTasks.splice(index, 1);
  sequenceTasks.forEach((task, i) => {
    task['順番'] = i + 1;
    const idx = allTasks.findIndex(t => 
      t['タスク名'] === task['タスク名'] && 
      t['読み上げテキスト'] === task['読み上げテキスト']
    );
    if (idx !== -1) {
      allTasks[idx]['順番'] = task['順番'];
    }
  });
  if (index < sequenceIndex) {
    sequenceIndex--;
  }
  saveTasksData();
  if (sequenceTasks.length > 0) {
    renderSequenceList(sequenceTasks[0]['タスク名']);
  } else {
    sequenceList.innerHTML = '';
  }
  updateCSVData();
}

// --- 完了処理 ---
function handleCompletion() {
  if (isCompletionHandled) return;
  isCompletionHandled = true;
  
  if (timerId) { clearInterval(timerId); timerId = null; }
  if (preId) { clearInterval(preId); preId = null; }
  
  const taskName = sequenceTasks.length > 0 ? sequenceTasks[0]['タスク名'] : 'タスク';
  currentTaskDisplay.innerHTML = `<i class="fas fa-check-circle" style="color: #27ae60;"></i> ${taskName}が完了しました！`;
  currentTaskDisplay.classList.add('completion-message');
  
  playCompletionEffect();
  speak(`${taskName}が完了しました。お疲れ様でした！`);
  
  timerDisplay.textContent = '00:00';
  timerDisplay.classList.remove('overtime'); // スタイル解除
  updateProgressRing(0);
  
  timerControls.classList.add('hidden');
  timerSettings.classList.add('hidden');
  sequenceList.innerHTML = '';
  addStepSection.classList.add('hidden');
  
  const totalExecutedSeconds = results.reduce((sum, r) => sum + r.seconds, 0);
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
    content: `${taskName} (${results.length}ステップ完了)`
  });
  
  saveResultsData();
  updateResultsTable();
  
  document.getElementById('prevButton').style.display = 'none';
  document.getElementById('nextButton').style.display = 'none';
  document.getElementById('endButton').style.display = 'none';
}

// --- 完了演出 ---
function playCompletionEffect() {
  const overlay = document.getElementById('completionEffect');
  const starburst = overlay.querySelector('.starburst');
  overlay.classList.remove('active');
  starburst.classList.remove('active');
  overlay.style.visibility = 'visible';
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    starburst.classList.add('active');
  });
  playCompletionSound();
  setTimeout(() => {
    overlay.classList.remove('active');
    starburst.classList.remove('active');
    overlay.style.visibility = 'hidden';
  }, 1000);
}

// --- 完了音 ---
function playCompletionSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const duration = 0.15;
    notes.forEach((freq, i) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = freq;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + i * duration);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + (i + 1) * duration);
      oscillator.start(audioContext.currentTime + i * duration);
      oscillator.stop(audioContext.currentTime + (i + 1) * duration);
    });
  } catch (e) {
    console.warn('完了音の再生に失敗しました:', e);
  }
}

// --- 結果テーブルの更新 ---
function updateResultsTable() {
  resultsTableBody.innerHTML = '';
  results.forEach(result => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${result.date}</td>
      <td>${result.seconds}</td>
      <td>${result.content}</td>
    `;
    resultsTableBody.appendChild(row);
  });
  summaryResults.forEach(result => {
    const row = document.createElement('tr');
    row.className = 'summary-row';
    const taskNameMatch = result.content.match(/^(.+?)\s*\(/);
    const taskName = taskNameMatch ? taskNameMatch[1] : result.content;
    const minutes = Math.floor(result.seconds / 60);
    const seconds = result.seconds % 60;
    const timeString = `${minutes}分${seconds}秒`;
    let startTimeString, endTimeString;
    if (result.startTime && result.endTime) {
      startTimeString = result.startTime;
      endTimeString = result.endTime;
    } else {
      const endDate = new Date(result.date);
      const startDate = new Date(endDate.getTime() - (result.seconds * 1000));
      startTimeString = `${startDate.getFullYear()}/${startDate.getMonth() + 1}/${startDate.getDate()} ${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}:${startDate.getSeconds().toString().padStart(2, '0')}`;
      endTimeString = `${endDate.getFullYear()}/${endDate.getMonth() + 1}/${endDate.getDate()} ${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}:${endDate.getSeconds().toString().padStart(2, '0')}`;
    }
    row.innerHTML = `
      <td>**${taskName}の合計実行時間**<br>${timeString}<br>**開始: ${startTimeString} 〜 終了: ${endTimeString}**</td>
      <td>${result.seconds}</td>
      <td>${result.content}</td>
    `;
    resultsTableBody.appendChild(row);
  });
}

// --- ログ消去ボタン ---
clearResultsButton.addEventListener('click', () => {
  if (confirm('実行結果ログを消去しますか？')) {
    results = [];
    summaryResults = [];
    saveResultsData();
    updateResultsTable();
  }
});

// --- ログ一括コピーボタン ---
copyResultsButton.addEventListener('click', () => {
  let copyText = '';
  if (results.length > 0) {
    copyText += '=== 今回の実行結果 ===\n';
    results.forEach(result => {
      copyText += `${result.date}\t${result.seconds}秒\t${result.content}\n`;
    });
    copyText += '\n';
  }
  if (summaryResults.length > 0) {
    copyText += '=== 過去の実行履歴 ===\n';
    summaryResults.forEach(result => {
      const taskNameMatch = result.content.match(/^(.+?)\s*\(/);
      const taskName = taskNameMatch ? taskNameMatch[1] : result.content;
      const minutes = Math.floor(result.seconds / 60);
      const seconds = result.seconds % 60;
      const timeString = `${minutes}分${seconds}秒`;
      let startTimeString, endTimeString;
      if (result.startTime && result.endTime) {
        startTimeString = result.startTime;
        endTimeString = result.endTime;
      } else {
        const endDate = new Date(result.date);
        const startDate = new Date(endDate.getTime() - (result.seconds * 1000));
        startTimeString = `${startDate.getFullYear()}/${startDate.getMonth() + 1}/${startDate.getDate()} ${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}:${startDate.getSeconds().toString().padStart(2, '0')}`;
        endTimeString = `${endDate.getFullYear()}/${endDate.getMonth() + 1}/${endDate.getDate()} ${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}:${endDate.getSeconds().toString().padStart(2, '0')}`;
      }
      copyText += `**${taskName}の合計実行時間**\n`;
      copyText += `${timeString}\n`;
      copyText += `**開始: ${startTimeString} 〜 終了: ${endTimeString}**\n\n`;
    });
  }
  if (copyText === '') {
    alert('コピーするログがありません');
    return;
  }
  navigator.clipboard.writeText(copyText).then(() => {
    const originalText = copyResultsButton.innerHTML;
    copyResultsButton.innerHTML = '<i class="fas fa-check"></i> コピー完了';
    copyResultsButton.style.backgroundColor = '#28a745';
    setTimeout(() => {
      copyResultsButton.innerHTML = originalText;
      copyResultsButton.style.backgroundColor = '';
    }, 1500);
  }).catch(() => {
    const textArea = document.createElement('textarea');
    textArea.value = copyText;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    const originalText = copyResultsButton.innerHTML;
    copyResultsButton.innerHTML = '<i class="fas fa-check"></i> コピー完了';
    copyResultsButton.style.backgroundColor = '#28a745';
    setTimeout(() => {
      copyResultsButton.innerHTML = originalText;
      copyResultsButton.style.backgroundColor = '';
    }, 1500);
  });
});