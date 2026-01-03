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
let pausedRemainingSeconds = 0; // 一時停止時の残り時間
let pausedStartTime = null;  // 一時停止時の開始時刻
let isPaused = false;        // 一時停止中かどうかのフラグ
let sortableInstance = null; // SortableJSインスタンス
let isStepCompleted = false; // 【修正箇所】ステップが完了しているか（手動待ち状態）のフラグ

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
const timerSettings      = document.getElementById('timerSettings'); // 【修正箇所】設定エリア
const autoAdvanceToggle  = document.getElementById('autoAdvanceToggle'); // 【修正箇所】自動進行スイッチ
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
  // （必要に応じて osc.stop() で停止できます）
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
  timerControls.classList.add('hidden');
  timerSettings.classList.add('hidden'); // 【修正箇所】設定エリアも初期は隠す
  sequenceList.innerHTML = '';
  sequenceTitle.innerHTML = '<i class="fas fa-list-ol"></i> 実行予定のタスク';
  
  // 結果テーブルをクリアするが、過去のサマリーは保持
  results = [];
  updateResultsTable();
  
  // プログレスリングをリセット
  updateProgressRing(100);
  
  // ステップ追加セクションを非表示
  addStepSection.classList.add('hidden');

  // ボタン表示を元に戻す（バグ修正）
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
  // 入力値の取得と検証
  const taskName = newTaskName.value.trim();
  const iconClass = newTaskIcon.value;
  
  // エラーメッセージの削除
  removeErrorMessages();
  
  // バリデーション
  if (!taskName) {
    showErrorMessage(newTaskName, 'タスク名を入力してください');
    return;
  }
  
  // 既存タスク名との重複チェック
  const existingTaskNames = [...new Set(allTasks.map(t => t['タスク名']))];
  if (existingTaskNames.includes(taskName)) {
    showErrorMessage(newTaskName, 'このタスク名は既に存在します');
    return;
  }
  
  // 新しいタスクを作成（最初のステップ）
  const newTask = {
    'タスク名': taskName,
    '項目名': '1回目',
    '読み上げテキスト': '1回目。いいぞ、その調子！',
    '秒数': 7,
    '順番': 1
  };
  
  // タスクをallTasksに追加
  allTasks.push(newTask);
  
  // LocalStorageに保存
  saveTasksData();
  
  // タスクボタンを再生成
  setupTaskButtons();
  
  // 入力フィールドをクリア
  newTaskName.value = '';
  
  // 成功メッセージの表示
  showSuccessMessage(addTaskContent, `タスク「${taskName}」を追加しました`);
  
  // CSVの更新
  updateCSVData();
}

// --- CSVデータの更新関数 ---
function updateCSVData() {
  // CSVヘッダー
  const headers = ['タスク名', '項目名', '読み上げテキスト', '秒数', '順番'];
  
  // CSVデータの作成
  let csvContent = headers.join(',') + '\n';
  
  allTasks.forEach(task => {
    const row = headers.map(header => {
      let value = task[header] || '';
      // カンマやダブルクォートを含む場合はダブルクォートで囲む
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvContent += row.join(',') + '\n';
  });
  
  // LocalStorageに保存
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
  // 既存のメッセージを削除
  container.querySelectorAll('.success-message').forEach(el => el.remove());
  
  const successDiv = document.createElement('div');
  successDiv.className = 'success-message';
  successDiv.textContent = message;
  container.appendChild(successDiv);
  
  // 3秒後に自動削除
  setTimeout(() => {
    successDiv.remove();
  }, 3000);
}

// --- タスク開始 ---
function startSequenceFor(name) {
  // 終了処理フラグをリセット
  isCompletionHandled = false;
  
  // 一時停止状態をリセット
  isPaused = false;
  pausedRemainingSeconds = 0;
  pausedStartTime = null;
  
  // 完了待機フラグをリセット
  isStepCompleted = false; // 【修正箇所】
  
  // 一時停止ボタンの表示をリセット
  pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i> 一時停止';
  
  sequenceTasks = allTasks
    .filter(t=>t['タスク名']===name)
    .sort((a,b)=>(a['順番']||0)-(b['順番']||0));
  sequenceIndex = 0;
  
  // 合計秒数を計算
  totalSeconds = sequenceTasks.reduce((sum, task) => sum + (task['秒数'] || 0), 0);
  
  // 実行予定リストを表示
  renderSequenceList(name);
  
  // ステップ追加セクションを表示
  addStepSection.classList.remove('hidden');
  
  // タスク開始時刻を記録
  taskStartTime = new Date();
  
  runNextStep();
}

// --- ドラッグ&ドロップによる並び替え処理 ---
function handleDragEnd(evt) {
  const oldIndex = evt.oldIndex;
  const newIndex = evt.newIndex;
  
  if (oldIndex === newIndex) return;
  
  // 実際のsequenceTasksのインデックスを計算（sequenceIndex以降のアイテムのみ表示しているため）
  const actualOldIndex = sequenceIndex + oldIndex;
  const actualNewIndex = sequenceIndex + newIndex;
  
  // 現在実行中のタスク（sequenceIndex）は移動不可
  if (actualOldIndex === sequenceIndex || actualNewIndex === sequenceIndex) {
    // リストを再描画して元に戻す
    renderSequenceList(sequenceTasks[0]['タスク名']);
    return;
  }
  
  // sequenceTasksの並び替え
  const movedTask = sequenceTasks.splice(actualOldIndex, 1)[0];
  sequenceTasks.splice(actualNewIndex, 0, movedTask);
  
  // 順番を更新
  sequenceTasks.forEach((task, i) => {
    task['順番'] = i + 1;
  });
  
  // allTasksの対応するタスクも更新
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
  
  // LocalStorageに保存
  saveTasksData();
  
  // CSVの更新
  updateCSVData();
  
  // リストを再描画
  renderSequenceList(sequenceTasks[0]['タスク名']);
}

// --- SortableJSの初期化 ---
function initSortable() {
  // 既存のインスタンスを破棄
  if (sortableInstance) {
    sortableInstance.destroy();
    sortableInstance = null;
  }
  
  // SortableJSが読み込まれているか確認
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
    filter: '.active', // 現在実行中のアイテムはドラッグ不可
    preventOnFilter: true,
    onEnd: handleDragEnd,
    // タッチデバイス対応
    delay: 100,
    delayOnTouchOnly: true,
    touchStartThreshold: 3
  });
}

// --- 実行予定リスト表示 (実行済み除外&ハイライト)&秒数編集 ---
function renderSequenceList(name) {
  sequenceTitle.innerHTML = `<i class="fas fa-list-ol"></i> ${name} のタスク`;
  sequenceList.innerHTML = '';
  
  sequenceTasks.forEach((task, i) => {
    if (i < sequenceIndex) return; // 実行済みを除外
    
    // 【修正箇所】完了待機中は専用クラスを付与
    let className = 'sequence-item';
    if (i === sequenceIndex) {
      className += ' active';
      if (isStepCompleted) {
        className += ' waiting-next'; // 待機中クラス
      }
    }
    
    const item = document.createElement('div');
    item.className = className;
    item.dataset.index = i;
    
    // タスク内容に応じたアイコンを追加
    const isRest = isRestPeriod(task['読み上げテキスト']);
    const icon = isRest ? 'fa-solid fa-mug-hot' : 'fa-solid fa-person-running';
    
    // ドラッグハンドル（現在実行中以外に表示）
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle' + (i === sequenceIndex ? ' disabled' : '');
    dragHandle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
    dragHandle.title = i === sequenceIndex ? '実行中は移動不可' : 'ドラッグして並び替え';
    
    // アイコンを含むラベル部分
    const labelContainer = document.createElement('div');
    labelContainer.className = 'label-container';
    labelContainer.innerHTML = `<i class="${icon}"></i>`;
    
    // 項目名入力フィールド
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = task['項目名'] || '';
    nameInput.className = 'seq-name-input';
    nameInput.dataset.index = i;
    nameInput.placeholder = '項目名を入力';
    nameInput.title = task['項目名'] || ''; // ツールチップでフルテキスト表示
    nameInput.addEventListener('change', e => {
      const idx = +e.target.dataset.index;
      const newName = e.target.value;
      
      // sequenceTasksの更新
      sequenceTasks[idx]['項目名'] = newName;
      
      // allTasksの対応するタスクを見つけて更新
      const taskIndex = allTasks.findIndex(t => 
        t['タスク名'] === sequenceTasks[idx]['タスク名'] && 
        t['順番'] === sequenceTasks[idx]['順番']
      );
      
      if (taskIndex !== -1) {
        allTasks[taskIndex]['項目名'] = newName;
        saveTasksData(); // LocalStorageに保存
        
        // 編集成功の視覚的フィードバック
        nameInput.classList.add('saved');
        setTimeout(() => {
          nameInput.classList.remove('saved');
        }, 500);
        
        // 現在実行中のタスクの場合は表示も更新
        if (idx === sequenceIndex) {
          updateCurrentTaskDisplay();
        }
        
        // ツールチップも更新
        nameInput.title = newName;
      }
    });
    
    // 読み上げテキスト入力フィールド
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = task['読み上げテキスト'] || '';
    textInput.className = 'seq-text-input';
    textInput.dataset.index = i;
    textInput.placeholder = '読み上げテキストを入力';
    textInput.title = task['読み上げテキスト'] || ''; // ツールチップでフルテキスト表示
    textInput.addEventListener('change', e => {
      const idx = +e.target.dataset.index;
      const newText = e.target.value;
      
      // sequenceTasksの更新
      sequenceTasks[idx]['読み上げテキスト'] = newText;
      
      // allTasksの対応するタスクを見つけて更新
      const taskIndex = allTasks.findIndex(t => 
        t['タスク名'] === sequenceTasks[idx]['タスク名'] && 
        t['順番'] === sequenceTasks[idx]['順番']
      );
      
      if (taskIndex !== -1) {
        allTasks[taskIndex]['読み上げテキスト'] = newText;
        saveTasksData(); // LocalStorageに保存
        
        // 編集成功の視覚的フィードバック
        textInput.classList.add('saved');
        setTimeout(() => {
          textInput.classList.remove('saved');
        }, 500);
        
        // ツールチップも更新
        textInput.title = newText;
      }
    });
    
    // 秒数入力フィールド
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
      
      // sequenceTasksの更新
      sequenceTasks[idx]['秒数'] = newSeconds;
      
      // allTasksの対応するタスクを見つけて更新
      const taskIndex = allTasks.findIndex(t => 
        t['タスク名'] === sequenceTasks[idx]['タスク名'] && 
        t['順番'] === sequenceTasks[idx]['順番']
      );
      
      if (taskIndex !== -1) {
        allTasks[taskIndex]['秒数'] = newSeconds;
        saveTasksData(); // LocalStorageに保存
        
        // 編集成功の視覚的フィードバック
        secondsInput.classList.add('saved');
        setTimeout(() => {
          secondsInput.classList.remove('saved');
        }, 500);
      }
      
      // 入力値を正規化
      e.target.value = newSeconds;
    });
    
    // 削除ボタン
    const deleteButton = document.createElement('button');
    deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
    deleteButton.className = 'delete-btn';
    deleteButton.title = 'ステップを削除';
    deleteButton.disabled = i === sequenceIndex; // 現在実行中は削除不可
    deleteButton.addEventListener('click', () => deleteSequenceTask(i));
    
    // 要素を組み立て
    item.appendChild(dragHandle);
    item.appendChild(labelContainer);
    item.appendChild(nameInput);
    item.appendChild(textInput);
    item.appendChild(secondsInput);
    
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'button-container';
    buttonContainer.appendChild(deleteButton);
    item.appendChild(buttonContainer);
    
    sequenceList.appendChild(item);
  });
  
  // SortableJSを初期化
  initSortable();
}

// --- 新規ステップ追加機能 ---
function addNewStep() {
  // 入力値の取得と検証
  const stepName = newStepName.value.trim();
  const stepText = newStepText.value.trim();
  const stepSeconds = parseInt(newStepSeconds.value) || 7;
  
  // エラーメッセージの削除
  removeErrorMessages();
  
  // バリデーション
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
  
  // 現在のタスク名を取得
  const currentTaskName = sequenceTasks.length > 0 ? sequenceTasks[0]['タスク名'] : '';
  if (!currentTaskName) {
    alert('タスクが選択されていません');
    return;
  }
  
  // 新しい順番を計算（最後に追加）
  const maxOrder = Math.max(...sequenceTasks.map(t => t['順番'] || 0), 0);
  const newOrder = maxOrder + 1;
  
  // 新しいステップを作成
  const newStep = {
    'タスク名': currentTaskName,
    '項目名': stepName,
    '読み上げテキスト': stepText,
    '秒数': stepSeconds,
    '順番': newOrder
  };
  
  // allTasksに追加
  allTasks.push(newStep);
  
  // sequenceTasksに追加
  sequenceTasks.push(newStep);
  
  // LocalStorageに保存
  saveTasksData();
  
  // 実行予定リストを再描画
  renderSequenceList(currentTaskName);
  
  // 入力フィールドをクリア
  newStepName.value = '';
  newStepText.value = '';
  newStepSeconds.value = '7';
  
  // 成功メッセージの表示
  showSuccessMessage(addStepSection.querySelector('.section-content'), `新しいステップを追加しました`);
  
  // CSVの更新
  updateCSVData();
}

// --- 「CSV エクスポート」ボタンでCSVファイルをダウンロード ---
exportCsvButton.addEventListener('click', () => {
  // CSVデータを更新
  updateCSVData();
  
  // LocalStorageから最新のCSVデータを取得
  const csvContent = loadFromLocalStorage(STORAGE_KEYS.LAST_CSV);
  if (!csvContent) {
    alert('エクスポートするデータがありません');
    return;
  }
  
  // CSVファイルをダウンロード
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

// --- シーケンスタスクの並べ替え（ボタン版 - 互換性のため残す） ---
function moveSequenceTask(index, direction) {
  if (direction === 'up' && index > sequenceIndex + 1) {
    // 上に移動
    const temp = sequenceTasks[index];
    sequenceTasks[index] = sequenceTasks[index - 1];
    sequenceTasks[index - 1] = temp;
    
    // 順番を更新
    const tempOrder = sequenceTasks[index]['順番'];
    sequenceTasks[index]['順番'] = sequenceTasks[index - 1]['順番'];
    sequenceTasks[index - 1]['順番'] = tempOrder;
    
  } else if (direction === 'down' && index < sequenceTasks.length - 1) {
    // 下に移動
    const temp = sequenceTasks[index];
    sequenceTasks[index] = sequenceTasks[index + 1];
    sequenceTasks[index + 1] = temp;
    
    // 順番を更新
    const tempOrder = sequenceTasks[index]['順番'];
    sequenceTasks[index]['順番'] = sequenceTasks[index + 1]['順番'];
    sequenceTasks[index + 1]['順番'] = tempOrder;
  }
  
  // allTasksの対応するタスクも更新
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
  
  // LocalStorageに保存
  saveTasksData();
  
  // 実行予定リストを再描画
  renderSequenceList(sequenceTasks[0]['タスク名']);
  
  // CSVの更新
  updateCSVData();
}

// --- 現在のタスク表示を更新する関数 ---
function updateCurrentTaskDisplay() {
  if (sequenceIndex >= sequenceTasks.length) return;
  
  const task = sequenceTasks[sequenceIndex];
  const isRest = isRestPeriod(task['読み上げテキスト']);
  const icon = isRest ? 'fa-solid fa-mug-hot' : 'fa-solid fa-person-running';
  
  // 項目名と読み上げテキストを表示
  const stepName = task['項目名'] || '';
  const readText = task['読み上げテキスト'] || '';
  
  // 【修正箇所】待機中の場合はメッセージを付与
  let displayHTML = `<i class="${icon}"></i> ${task['タスク名']}：${stepName}：${readText}`;
  if (isStepCompleted) {
    displayHTML += ' <span style="color: #27ae60; font-weight: bold;">(完了 - 次へ進んでください)</span>';
  }
  currentTaskDisplay.innerHTML = displayHTML;
}

// --- 次のステップを実行 ---
async function runNextStep() {
  // 【修正箇所】ステップ開始時に完了フラグをリセット
  isStepCompleted = false;

  if (sequenceIndex >= sequenceTasks.length) {
    handleCompletion();
    return;
  }
  
  const task = sequenceTasks[sequenceIndex];
  const isRest = isRestPeriod(task['読み上げテキスト']);
  const icon = isRest ? 'fa-solid fa-mug-hot' : 'fa-solid fa-person-running';
  
  // タイマーコントロールを表示
  timerControls.classList.remove('hidden');
  timerSettings.classList.remove('hidden'); // 【修正箇所】設定エリアを表示
  
  // 初回のみ5秒カウントダウンと開始アナウンス
  if (sequenceIndex === 0) {
    // 「タスク名を開始します」の読み上げ
    speak(`${task['タスク名']}を開始します`);
    
    let preCount = 5;
    currentTaskDisplay.innerHTML = `<i class="${icon}"></i> ${task['タスク名']}を開始します... ${preCount}`;
    
    // 一時停止状態を監視するための変数
    let localPaused = false;
    
    await new Promise(resolve => {
      preId = setInterval(() => {
        // 一時停止中は何もしない
        if (isPaused) {
          localPaused = true;
          return;
        }
        
        // 一時停止から復帰した場合
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
  
  // 現在のタスク表示を更新
  updateCurrentTaskDisplay();
  
  // 読み上げテキストを読み上げ
  speak(task['読み上げテキスト']);
  
  // 残り秒数の設定（一時停止からの復帰の場合は保存された値を使用）
  if (pausedRemainingSeconds > 0) {
    remainingSeconds = pausedRemainingSeconds;
    pausedRemainingSeconds = 0;
  } else {
    remainingSeconds = task['秒数'] || 0;
  }
  
  // タイマー表示の更新
  updateTimerDisplay();
  
  // 実行予定リストを更新（ハイライト）
  renderSequenceList(task['タスク名']);
  
  // タイマー開始
  startTimer();
}

// --- タイマー表示の更新 ---
function updateTimerDisplay() {
  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  timerDisplay.textContent = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  
  // プログレスリングの更新
  const currentTask = sequenceTasks[sequenceIndex];
  if (currentTask) {
    const taskSeconds = currentTask['秒数'] || 0;
    const percent = taskSeconds > 0 ? (remainingSeconds / taskSeconds) * 100 : 0;
    updateProgressRing(percent);
  }
}

// --- タイマー開始 ---
function startTimer() {
  if (timerId) {
    clearInterval(timerId);
  }
  
  timerId = setInterval(() => {
    // 一時停止中は何もしない
    if (isPaused) return;
    
    // 待機中は何もしない（念のため）
    if (isStepCompleted) return;

    remainingSeconds--;
    updateTimerDisplay();
    
    if (remainingSeconds <= 0) {
      clearInterval(timerId);
      timerId = null;
      
      // 結果を記録
      const task = sequenceTasks[sequenceIndex];
      const now = new Date();
      results.push({
        date: `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`,
        seconds: task['秒数'] || 0,
        content: `${task['タスク名']}：${task['項目名']}：${task['読み上げテキスト']}`
      });
      
      // 結果テーブルを更新
      updateResultsTable();
      
      // 【修正箇所】自動進行判定
      if (autoAdvanceToggle.checked) {
        // 自動進行ONの場合はそのまま進む
        sequenceIndex++;
        runNextStep();
      } else {
        // 自動進行OFFの場合は待機状態にする
        isStepCompleted = true;
        // 完了通知音（任意）
        speak('完了'); 
        // 表示更新（「完了」ステータス表示用）
        updateCurrentTaskDisplay();
        // リスト更新（待機中アニメーション用）
        renderSequenceList(task['タスク名']);
      }
    }
  }, 1000);
}

// --- 一時停止/再開ボタン ---
pauseResumeButton.addEventListener('click', () => {
  if (isPaused) {
    // 再開
    isPaused = false;
    pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i> 一時停止';
    
    // 一時停止していた時間を記録から除外するため、開始時刻を調整
    if (pausedStartTime) {
      const pausedDuration = new Date() - pausedStartTime;
      taskStartTime = new Date(taskStartTime.getTime() + pausedDuration);
      pausedStartTime = null;
    }
  } else {
    // 一時停止
    isPaused = true;
    pausedStartTime = new Date();
    pauseResumeButton.innerHTML = '<i class="fas fa-play"></i> 再開';
  }
});

// --- 前へボタン ---
document.getElementById('prevButton').addEventListener('click', () => {
  if (sequenceIndex > 0) {
    // タイマーを停止
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    if (preId) {
      clearInterval(preId);
      preId = null;
    }
    
    // 一時停止・待機状態をリセット
    isPaused = false;
    isStepCompleted = false; // 【修正箇所】
    pausedRemainingSeconds = 0;
    pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i> 一時停止';
    
    sequenceIndex--;
    runNextStep();
  }
});

// --- 次へボタン ---
document.getElementById('nextButton').addEventListener('click', () => {
  if (sequenceIndex < sequenceTasks.length - 1) {
    // タイマーを停止
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    if (preId) {
      clearInterval(preId);
      preId = null;
    }
    
    // 一時停止状態をリセット
    isPaused = false;
    pausedRemainingSeconds = 0;
    pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i> 一時停止';
    
    // 【修正箇所】まだ完了していない（スキップの場合）のみログ保存
    if (!isStepCompleted) {
      // 現在のタスクの結果を記録（スキップとして）
      const task = sequenceTasks[sequenceIndex];
      const now = new Date();
      const elapsedSeconds = (task['秒数'] || 0) - remainingSeconds;
      results.push({
        date: `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`,
        seconds: elapsedSeconds,
        content: `${task['タスク名']}：${task['項目名']}：${task['読み上げテキスト']} (スキップ)`
      });
    } else {
      // 待機中から進む場合はフラグを下ろす（runNextStepでも行っているが念のため）
      isStepCompleted = false;
    }
    
    sequenceIndex++;
    runNextStep();
  } else if (isStepCompleted && sequenceIndex === sequenceTasks.length - 1) {
    // 【修正箇所】最後のステップ完了待ち状態で「次へ」を押した場合は終了処理へ
    handleCompletion();
  }
});

// --- 終了ボタン ---
endButton.addEventListener('click', () => {
  if (confirm('タスクを終了しますか？')) {
    // タイマーを停止
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    if (preId) {
      clearInterval(preId);
      preId = null;
    }
    
    // 完了処理
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
  
  // allTasksから削除
  const allTaskIndex = allTasks.findIndex(t => 
    t['タスク名'] === taskToDelete['タスク名'] && 
    t['順番'] === taskToDelete['順番']
  );
  
  if (allTaskIndex !== -1) {
    allTasks.splice(allTaskIndex, 1);
  }
  
  // sequenceTasksから削除
  sequenceTasks.splice(index, 1);
  
  // 順番を再計算
  sequenceTasks.forEach((task, i) => {
    task['順番'] = i + 1;
    
    // allTasksも更新
    const idx = allTasks.findIndex(t => 
      t['タスク名'] === task['タスク名'] && 
      t['読み上げテキスト'] === task['読み上げテキスト']
    );
    if (idx !== -1) {
      allTasks[idx]['順番'] = task['順番'];
    }
  });
  
  // インデックスの調整
  if (index < sequenceIndex) {
    sequenceIndex--;
  }
  
  // LocalStorageに保存
  saveTasksData();
  
  // 実行予定リストを再描画
  if (sequenceTasks.length > 0) {
    renderSequenceList(sequenceTasks[0]['タスク名']);
  } else {
    sequenceList.innerHTML = '';
  }
  
  // CSVの更新
  updateCSVData();
}

// --- 完了処理 ---
function handleCompletion() {
  // 既に完了処理が実行済みの場合は何もしない
  if (isCompletionHandled) return;
  isCompletionHandled = true;
  
  // タイマーを停止
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  if (preId) {
    clearInterval(preId);
    preId = null;
  }
  
  // 完了メッセージ
  const taskName = sequenceTasks.length > 0 ? sequenceTasks[0]['タスク名'] : 'タスク';
  currentTaskDisplay.innerHTML = `<i class="fas fa-check-circle" style="color: #27ae60;"></i> ${taskName}が完了しました！`;
  currentTaskDisplay.classList.add('completion-message');
  
  // 完了演出
  playCompletionEffect();
  
  // 完了音声
  speak(`${taskName}が完了しました。お疲れ様でした！`);
  
  // タイマー表示をリセット
  timerDisplay.textContent = '00:00';
  updateProgressRing(0);
  
  // コントロールを非表示
  timerControls.classList.add('hidden');
  timerSettings.classList.add('hidden'); // 【修正箇所】設定エリアも隠す
  
  // 実行予定リストをクリア
  sequenceList.innerHTML = '';
  
  // ステップ追加セクションを非表示
  addStepSection.classList.add('hidden');
  
  // 合計実行時間を計算
  const totalExecutedSeconds = results.reduce((sum, r) => sum + r.seconds, 0);
  
  // 終了時刻を記録
  const endTime = new Date();
  const endTimeString = `${endTime.getFullYear()}/${endTime.getMonth()+1}/${endTime.getDate()} ${endTime.getHours().toString().padStart(2,'0')}:${endTime.getMinutes().toString().padStart(2,'0')}:${endTime.getSeconds().toString().padStart(2,'0')}`;
  
  // 開始時刻の文字列
  const startTimeString = taskStartTime ? 
    `${taskStartTime.getFullYear()}/${taskStartTime.getMonth()+1}/${taskStartTime.getDate()} ${taskStartTime.getHours().toString().padStart(2,'0')}:${taskStartTime.getMinutes().toString().padStart(2,'0')}:${taskStartTime.getSeconds().toString().padStart(2,'0')}` : 
    endTimeString;
  
  // サマリー結果を追加
  summaryResults.push({
    date: endTimeString,
    startTime: startTimeString,
    endTime: endTimeString,
    seconds: totalExecutedSeconds,
    content: `${taskName} (${results.length}ステップ完了)`
  });
  
  // 結果データを保存
  saveResultsData();
  
  // 結果テーブルを更新
  updateResultsTable();
  
  // ボタンを非表示にする（バグ修正）
  document.getElementById('prevButton').style.display = 'none';
  document.getElementById('nextButton').style.display = 'none';
  document.getElementById('endButton').style.display = 'none';
}

// --- 完了演出 ---
function playCompletionEffect() {
  const overlay = document.getElementById('completionEffect');
  const starburst = overlay.querySelector('.starburst');
  
  // アニメーションをリセット
  overlay.classList.remove('active');
  starburst.classList.remove('active');
  overlay.style.visibility = 'visible';
  
  // アニメーション開始
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    starburst.classList.add('active');
  });
  
  // 完了音を再生
  playCompletionSound();
  
  // アニメーション終了後に非表示
  setTimeout(() => {
    overlay.classList.remove('active');
    starburst.classList.remove('active');
    overlay.style.visibility = 'hidden';
  }, 1000);
}

// --- 完了音を再生 ---
function playCompletionSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // メロディーを作成（ドーパミンが出そうな上昇音）
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
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
  
  // 今回の結果を表示
  results.forEach(result => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${result.date}</td>
      <td>${result.seconds}</td>
      <td>${result.content}</td>
    `;
    resultsTableBody.appendChild(row);
  });
  
  // 過去のサマリー結果を表示（新しい形式で）
  summaryResults.forEach(result => {
    const row = document.createElement('tr');
    row.className = 'summary-row';
    
    // タスク名を抽出
    const taskNameMatch = result.content.match(/^(.+?)\s*\(/);
    const taskName = taskNameMatch ? taskNameMatch[1] : result.content;
    
    // 時間を分と秒に変換
    const minutes = Math.floor(result.seconds / 60);
    const seconds = result.seconds % 60;
    const timeString = `${minutes}分${seconds}秒`;
    
    // 開始時刻と終了時刻を使用（保存されている場合）
    let startTimeString, endTimeString;
    if (result.startTime && result.endTime) {
      startTimeString = result.startTime;
      endTimeString = result.endTime;
    } else {
      // 古いデータの場合は従来通り計算
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
  
  // 今回の結果をコピー
  if (results.length > 0) {
    copyText += '=== 今回の実行結果 ===\n';
    results.forEach(result => {
      copyText += `${result.date}\t${result.seconds}秒\t${result.content}\n`;
    });
    copyText += '\n';
  }
  
  // 過去のサマリー結果をコピー
  if (summaryResults.length > 0) {
    copyText += '=== 過去の実行履歴 ===\n';
    summaryResults.forEach(result => {
      // タスク名を抽出
      const taskNameMatch = result.content.match(/^(.+?)\s*\(/);
      const taskName = taskNameMatch ? taskNameMatch[1] : result.content;
      
      // 時間を分と秒に変換
      const minutes = Math.floor(result.seconds / 60);
      const seconds = result.seconds % 60;
      const timeString = `${minutes}分${seconds}秒`;
      
      // 開始時刻と終了時刻を使用（保存されている場合）
      let startTimeString, endTimeString;
      if (result.startTime && result.endTime) {
        startTimeString = result.startTime;
        endTimeString = result.endTime;
      } else {
        // 古いデータの場合は従来通り計算
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
  
  // クリップボードにコピー
  navigator.clipboard.writeText(copyText).then(() => {
    // 成功時の視覚的フィードバック
    const originalText = copyResultsButton.innerHTML;
    copyResultsButton.innerHTML = '<i class="fas fa-check"></i> コピー完了';
    copyResultsButton.style.backgroundColor = '#28a745';
    
    setTimeout(() => {
      copyResultsButton.innerHTML = originalText;
      copyResultsButton.style.backgroundColor = '';
    }, 1500);
  }).catch(() => {
    // フォールバック: テキストエリアを使用
    const textArea = document.createElement('textarea');
    textArea.value = copyText;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    
    // 成功時の視覚的フィードバック
    const originalText = copyResultsButton.innerHTML;
    copyResultsButton.innerHTML = '<i class="fas fa-check"></i> コピー完了';
    copyResultsButton.style.backgroundColor = '#28a745';
    
    setTimeout(() => {
      copyResultsButton.innerHTML = originalText;
      copyResultsButton.style.backgroundColor = '';
    }, 1500);
  });
});