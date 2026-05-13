/* ━━━━━━━━━ STATE ━━━━━━━━━ */
  let vocabData  = [];          // { word, collocations, phonetics, definition, synonyms, antonyms, context }
  let fcIndex    = 0;
  let fcOrder    = [];
  let quizQuestions = [];
  let quizIdx    = 0;
  let quizScore  = { correct: 0, wrong: 0 };
  let quizAnswered = false;
  let quizMode   = 'mc';       // 'mc' | 'typein' | 'cloze' | 'listening' | 'reverse' | 'synonym'
  let quizReport = [];          // { word, correct, userAnswer, correctAnswer, mode, mistakeInfo }
  let storyQuizAnswers = [];    // answers for story fill-in-blank quiz
  let activeStoryWords = [];     // highlighted words for current story [{word, start, end}]

  /* ── Smart Session state ── */
  let smartSessionActive = false;
  let smartSessionEndTime = null;
  let _smartTimerRAF = null;

  /* ── Auto-play state ── */
  let autoPlayOn     = false;
  let autoFlipTimer  = null;   // idle → flip card
  let autoNextTimer  = null;   // after flip → next card
  let AUTO_FLIP_MS   = 120000; // 2 minutes (configurable)
  let AUTO_NEXT_MS   = 20000;  // 20 seconds (configurable)

  const LS_KEY   = 'vocabLearnerData';
  const SRS_KEY  = 'vocabLearnerSRS';
  const SETTINGS_KEY = 'vocabLearnerSettings';
  const SKIP_KEY = 'vocabLearnerSkipped';
  const WRONG_KEY = 'vocabLearnerWrongWords';
  const FILES_KEY = 'vocabLearnerFiles';
  const REPORT_KEY = 'vocabLearnerReports';
  const STORY_KEY  = 'vocabLearnerStories';
  const GOAL_KEY   = 'vocabLearnerDailyGoal';
  const STATS_KEY  = 'vocabLearnerWordStats';
  let srsLevels  = {};          // { "word_lowercase": 0‑5 }
  let skippedWords = new Set();  // words marked as known/skip
  let wrongWords = new Set();    // words answered incorrectly
  let wordStats  = {};          // { "word_lowercase": { seen, correct, wrong, streak, lastSeen } }
  let showLeechOnly = false;    // vocab list leech filter

  /* ━━━━━━━━━ DOM SHORTCUT ━━━━━━━━━ */
  const $ = id => document.getElementById(id);

  /* ━━━━━━━━━ SRS — Spaced Repetition ━━━━━━━━━ */
  function loadSRS() {
    try {
      const d = localStorage.getItem(SRS_KEY);
      if (d) srsLevels = JSON.parse(d);
    } catch (_) { srsLevels = {}; }
  }
  function saveSRS() { localStorage.setItem(SRS_KEY, JSON.stringify(srsLevels)); }

  function getSRSLevel(word) {
    return srsLevels[word.toLowerCase().trim()] || 0;
  }
  function updateSRS(word, correct) {
    const k = word.toLowerCase().trim();
    srsLevels[k] = correct ? Math.min((srsLevels[k] || 0) + 1, 5) : 0;
    saveSRS();
    updateStats(word, correct);
  }
  function srsLabel(level) {
    return ['New','Learning','Familiar','Good','Strong','Mastered'][level] || 'New';
  }

  /* ━━━━━━━━━ PER-WORD STATS ━━━━━━━━━ */
  function loadStats() {
    try {
      const d = localStorage.getItem(STATS_KEY);
      if (d) wordStats = JSON.parse(d);
    } catch (_) { wordStats = {}; }
  }
  function saveStats() { localStorage.setItem(STATS_KEY, JSON.stringify(wordStats)); }

  function getStats(word) {
    return wordStats[word.toLowerCase().trim()] || null;
  }
  function updateStats(word, correct) {
    const k = word.toLowerCase().trim();
    const s = wordStats[k] || { seen: 0, correct: 0, wrong: 0, streak: 0, lastSeen: null };
    s.seen += 1;
    if (correct) { s.correct += 1; s.streak = (s.streak || 0) + 1; }
    else         { s.wrong += 1; s.streak = 0; }
    s.lastSeen = new Date().toISOString();
    wordStats[k] = s;
    saveStats();
  }
  function getAccuracy(word) {
    const s = getStats(word);
    if (!s || s.seen === 0) return null;
    return s.correct / s.seen;
  }
  // Leech: seen ≥ 4 and accuracy < 40%
  function isLeech(word) {
    const s = getStats(word);
    if (!s || s.seen < 4) return false;
    return (s.correct / s.seen) < 0.4;
  }
  function countLeeches() {
    if (!Array.isArray(vocabData) || !vocabData.length) return 0;
    let n = 0;
    for (const v of vocabData) if (isLeech(v.word)) n++;
    return n;
  }

  /* ━━━━━━━━━ SKIPPED / KNOWN WORDS ━━━━━━━━━ */
  function loadSkipped() {
    try {
      const d = localStorage.getItem(SKIP_KEY);
      if (d) skippedWords = new Set(JSON.parse(d));
    } catch (_) { skippedWords = new Set(); }
  }
  function saveSkipped() {
    localStorage.setItem(SKIP_KEY, JSON.stringify([...skippedWords]));
  }
  function isSkipped(word) { return skippedWords.has(word.toLowerCase().trim()); }

  /* ━━━━━━━━━ WRONG WORDS TRACKING ━━━━━━━━━ */
  function loadWrongWords() {
    try {
      const d = localStorage.getItem(WRONG_KEY);
      if (d) wrongWords = new Set(JSON.parse(d));
    } catch (_) { wrongWords = new Set(); }
  }
  function saveWrongWords() {
    localStorage.setItem(WRONG_KEY, JSON.stringify([...wrongWords]));
    updateWrongWordsBadge();
  }
  function addWrongWord(word) {
    wrongWords.add(word.toLowerCase().trim());
    saveWrongWords();
  }
  function removeWrongWord(word) {
    wrongWords.delete(word.toLowerCase().trim());
    saveWrongWords();
  }
  function updateWrongWordsBadge() {
    const btn = $('reviewWrongBtn');
    const count = $('wrongWordCount');
    if (!btn || !count) return;
    if (wrongWords.size > 0) {
      btn.classList.remove('hidden');
      count.textContent = wrongWords.size;
    } else {
      btn.classList.add('hidden');
    }
  }

  let _lastSkipped = null; // for undo

  /* ━━━━━━━━━ FILE IMPORT HISTORY ━━━━━━━━━ */
  function loadFileHistory() {
    try {
      const d = localStorage.getItem(FILES_KEY);
      return d ? JSON.parse(d) : [];
    } catch (_) { return []; }
  }
  function saveFileToHistory(name, data) {
    const history = loadFileHistory();
    // Remove duplicate by name
    const filtered = history.filter(f => f.name !== name);
    filtered.unshift({ name, wordCount: data.length, date: new Date().toISOString(), data });
    // Keep max 20 files
    if (filtered.length > 20) filtered.length = 20;
    localStorage.setItem(FILES_KEY, JSON.stringify(filtered));
    renderFileHistory();
  }
  function renderFileHistory() {
    const container = $('fileHistoryList');
    if (!container) return;
    const history = loadFileHistory();
    const wrapper = $('fileHistorySection');
    if (!history.length) {
      if (wrapper) wrapper.classList.add('hidden');
      return;
    }
    if (wrapper) wrapper.classList.remove('hidden');
    container.innerHTML = history.map((f, i) => {
      const date = new Date(f.date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
      return `<div class="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-surface-50 transition group">
        <button onclick="loadFromHistory(${i})" class="flex-1 flex items-start gap-3 text-left">
          <i class="fa-solid fa-file-excel text-green-500 mt-0.5"></i>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-gray-700 truncate">${esc(f.name)}</p>
            <p class="text-xs text-gray-400">${f.wordCount} words · ${date}</p>
          </div>
        </button>
        <button onclick="removeFromHistory(${i})" class="text-gray-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100 ml-2 p-1" title="Remove">
          <i class="fa-solid fa-trash-can text-xs"></i>
        </button>
      </div>`;
    }).join('');
  }
  window.loadFromHistory = function(idx) {
    const history = loadFileHistory();
    if (!history[idx]) return;
    const f = history[idx];
    loadData(f.data);
    localStorage.setItem(LS_KEY, JSON.stringify(f.data));
    toast('Loaded "' + f.name + '" (' + f.wordCount + ' words)', 'success');
  };
  window.removeFromHistory = function(idx) {
    const history = loadFileHistory();
    if (!history[idx]) return;
    const name = history[idx].name;
    history.splice(idx, 1);
    localStorage.setItem(FILES_KEY, JSON.stringify(history));
    renderFileHistory();
    toast('"' + name + '" removed from history.', 'info');
  };

  /* ━━━━━━━━━ QUIZ REPORT ━━━━━━━━━ */
  function loadReports() {
    try {
      const d = localStorage.getItem(REPORT_KEY);
      return d ? JSON.parse(d) : [];
    } catch (_) { return []; }
  }
  function saveReport(report) {
    const reports = loadReports();
    reports.unshift(report);
    if (reports.length > 50) reports.length = 50;
    localStorage.setItem(REPORT_KEY, JSON.stringify(reports));
  }
  function generateReport() {
    return {
      date: new Date().toISOString(),
      mode: quizMode,
      totalQuestions: quizQuestions.length,
      correct: quizScore.correct,
      wrong: quizScore.wrong,
      pct: quizQuestions.length ? Math.round(quizScore.correct / quizQuestions.length * 100) : 0,
      details: quizReport.map(r => ({ ...r }))
    };
  }
  window.showReportModal = function() {
    const reports = loadReports();
    const modal = $('reportModal');
    const list = $('reportList');
    if (!modal || !list) return;

    if (!reports.length) {
      list.innerHTML = '<p class="text-center text-gray-400 py-8"><i class="fa-solid fa-chart-bar text-xl mb-2 block"></i>No quiz reports yet. Complete a quiz first!</p>';
    } else {
      list.innerHTML = reports.map((r, i) => {
        const date = new Date(r.date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' });
        const modes = { mc:'MC', typein:'Type-in', cloze:'Cloze', listening:'Listening', reverse:'Reverse', synonym:'Synonym', speaking:'Speaking', dictation:'Dictation', smart:'⚡ Smart' };
        const pctColor = r.pct >= 80 ? 'text-green-600' : r.pct >= 50 ? 'text-amber-600' : 'text-red-600';
        return `<div class="border border-surface-200 rounded-xl p-4 space-y-2 hover:bg-surface-50 transition">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="mode-badge">${modes[r.mode] || r.mode}</span>
              <span class="text-xs text-gray-400">${date}</span>
            </div>
            <span class="text-lg font-extrabold ${pctColor}">${r.pct}%</span>
          </div>
          <div class="flex items-center gap-4 text-xs">
            <span class="text-green-600 font-semibold"><i class="fa-solid fa-check mr-1"></i>${r.correct} correct</span>
            <span class="text-red-500 font-semibold"><i class="fa-solid fa-xmark mr-1"></i>${r.wrong} wrong</span>
            <span class="text-gray-400">${r.totalQuestions} questions</span>
          </div>
          ${r.details && r.details.length ? `<details class="text-xs"><summary class="cursor-pointer text-brand-600 font-semibold hover:underline">Show details</summary>
            <div class="mt-2 space-y-1 max-h-40 overflow-y-auto">${r.details.map(d => {
              const icon = d.correct ? '<i class="fa-solid fa-check text-green-500"></i>' : '<i class="fa-solid fa-xmark text-red-500"></i>';
              const mi = d.mistakeInfo;
              const badge = (!d.correct && mi) ? '<span class="mistake-badge mistake-' + mi.color + '" style="font-size:0.6rem"><i class="fa-solid ' + mi.icon + '"></i> ' + mi.label + '</span>' : '';
              return `<div class="flex items-center gap-2 py-0.5 flex-wrap">
                ${icon}
                <span class="font-semibold text-gray-700">${esc(d.word)}</span>
                ${!d.correct ? `<span class="text-gray-400">→ you: "${esc(d.userAnswer || '—')}"</span>` : ''}
                ${badge}
              </div>`;
            }).join('')}</div></details>` : ''}
        </div>`;
      }).join('');
    }
    modal.classList.remove('hidden');
  };
  window.closeReportModal = function() {
    $('reportModal').classList.add('hidden');
  };
  window.clearAllReports = function() {
    localStorage.removeItem(REPORT_KEY);
    showReportModal();
    toast('All reports cleared.', 'info');
  };


  window.markKnown = function() {
    const item = vocabData[fcOrder[fcIndex]];
    if (!item) return;
    const key = item.word.toLowerCase().trim();
    skippedWords.add(key);
    _lastSkipped = { key, fcIndex };
    saveSkipped();
    rebuildFcOrder();
    toast('"' + item.word + '" marked as known. <button onclick="undoSkip()" class="underline font-bold ml-1">Undo</button>', 'success');
  };

  window.undoSkip = function() {
    if (!_lastSkipped) return;
    skippedWords.delete(_lastSkipped.key);
    saveSkipped();
    rebuildFcOrder();
    _lastSkipped = null;
    toast('Undo successful!', 'info');
  };

  window.showSkippedModal = function() {
    const list = $('skippedList');
    if (!skippedWords.size) {
      list.innerHTML = '<p class="text-center text-gray-400 py-6"><i class="fa-solid fa-circle-check text-xl mb-2 block"></i>No skipped words yet.</p>';
    } else {
      const words = [...skippedWords].sort();
      list.innerHTML = words.map(w => {
        const orig = vocabData.find(v => v.word.toLowerCase().trim() === w);
        const display = orig ? orig.word : w;
        return `<div class="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-surface-50 transition">
          <span class="text-sm font-medium text-gray-700">${esc(display)}</span>
          <button onclick="revertSkipped('${escAttr(w)}')" class="text-xs text-red-500 hover:text-red-700 font-semibold transition" title="Restore">
            <i class="fa-solid fa-rotate-left mr-1"></i>Restore
          </button>
        </div>`;
      }).join('');
    }
    $('skippedCount').textContent = skippedWords.size;
    $('skippedModal').classList.remove('hidden');
  };

  window.closeSkippedModal = function() {
    $('skippedModal').classList.add('hidden');
  };

  window.revertSkipped = function(key) {
    skippedWords.delete(key);
    saveSkipped();
    rebuildFcOrder();
    showSkippedModal(); // refresh list
    toast('Word restored!', 'info');
  };

  window.revertAllSkipped = function() {
    if (!skippedWords.size) return;
    skippedWords.clear();
    saveSkipped();
    rebuildFcOrder();
    showSkippedModal();
    toast('All words restored!', 'info');
  };

  function rebuildFcOrder() {
    // Keep current order but remove skipped indices
    const activeIndices = [];
    for (let i = 0; i < vocabData.length; i++) {
      if (!isSkipped(vocabData[i].word)) activeIndices.push(i);
    }
    fcOrder = activeIndices;
    if (fcIndex >= fcOrder.length) fcIndex = 0;
    if (fcOrder.length === 0) fcIndex = 0;
    updateFcInfo();
    if (fcOrder.length) renderFlashcard();
    else {
      $('fcWord').textContent = '🎉';
      $('fcCollocations').textContent = '';
      $('fcPhonetics').textContent = 'All words learned!';
      $('fcCurrent').textContent = '0';
      $('fcTotal').textContent = '0';
    }
    renderTable();
  }

  function updateFcInfo() {
    const total = fcOrder.length;
    const skipped = skippedWords.size;
    $('fcTotal').textContent = total;
    const badge = $('fcSkipBadge');
    if (badge) {
      if (skipped > 0) {
        badge.classList.remove('hidden');
        badge.textContent = skipped + ' known';
      } else {
        badge.classList.add('hidden');
      }
    }
  }

  