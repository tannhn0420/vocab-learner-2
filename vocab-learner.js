/* ═══════════════════════════════════════════════════════════
   VOCAB LEARNER — Application Logic
   ═══════════════════════════════════════════════════════════ */
(() => {
  'use strict';

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
  let srsLevels  = {};          // { "word_lowercase": 0‑5 }
  let skippedWords = new Set();  // words marked as known/skip
  let wrongWords = new Set();    // words answered incorrectly

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
  }
  function srsLabel(level) {
    return ['New','Learning','Familiar','Good','Strong','Mastered'][level] || 'New';
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
        const modes = { mc:'MC', typein:'Type-in', cloze:'Cloze', listening:'Listening', reverse:'Reverse', synonym:'Synonym', smart:'⚡ Smart' };
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

  /* ━━━━━━━━━ SETTINGS ━━━━━━━━━ */
  function loadSettings() {
    try {
      const s = localStorage.getItem(SETTINGS_KEY);
      if (s) {
        const settings = JSON.parse(s);
        AUTO_FLIP_MS = settings.autoFlipMs || 120000;
        AUTO_NEXT_MS = settings.autoNextMs || 20000;
      }
    } catch (_) {}
  }
  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      autoFlipMs: AUTO_FLIP_MS,
      autoNextMs: AUTO_NEXT_MS
    }));
  }

  window.openSettings = function() {
    $('settingsModal').classList.remove('hidden');
    $('settingsFlipMin').value = Math.floor(AUTO_FLIP_MS / 60000);
    $('settingsFlipSec').value = Math.floor((AUTO_FLIP_MS % 60000) / 1000);
    $('settingsNextSec').value = Math.floor(AUTO_NEXT_MS / 1000);
  };

  window.closeSettings = function() {
    $('settingsModal').classList.add('hidden');
  };

  window.saveSettingsForm = function() {
    const flipMin = parseInt($('settingsFlipMin').value) || 0;
    const flipSec = parseInt($('settingsFlipSec').value) || 0;
    const nextSec = parseInt($('settingsNextSec').value) || 10;

    AUTO_FLIP_MS = (flipMin * 60 + flipSec) * 1000;
    AUTO_NEXT_MS = nextSec * 1000;

    if (AUTO_FLIP_MS < 5000) AUTO_FLIP_MS = 5000;   // min 5s
    if (AUTO_NEXT_MS < 5000) AUTO_NEXT_MS = 5000;   // min 5s

    saveSettings();
    closeSettings();
    toast('Settings saved!', 'success');

    // restart timers with new values
    if (autoPlayOn) {
      const card = $('flashcard');
      if (card && card.classList.contains('flipped')) startAutoNextTimer();
      else startAutoFlipTimer();
    }
  };

  /* ━━━━━━━━━ SPEECH SYNTHESIS ━━━━━━━━━ */
  let _speakBtn = null;

  window.speakWord = function(word, btn) {
    if (!window.speechSynthesis) { toast('Speech not supported.', 'error'); return; }
    window.speechSynthesis.cancel();
    if (_speakBtn) _speakBtn.classList.remove('speaking');

    const utt = new SpeechSynthesisUtterance(word);
    utt.lang  = 'en-US';
    utt.rate  = 0.85;
    utt.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.lang === 'en-US') ||
              voices.find(v => v.lang.startsWith('en'));
    if (v) utt.voice = v;

    if (btn) {
      _speakBtn = btn;
      btn.classList.add('speaking');
      utt.onend  = () => btn.classList.remove('speaking');
      utt.onerror = () => btn.classList.remove('speaking');
    }
    window.speechSynthesis.speak(utt);
  };

  // pre-load voice list
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {};
    window.speechSynthesis.getVoices();
  }

  /* ━━━━━━━━━ INIT ━━━━━━━━━ */
  function init() {
    loadSRS();
    loadSettings();
    loadSkipped();
    loadWrongWords();

    const fileInput  = $('fileInput');
    const dropZone   = $('dropZone');
    const cacheHint  = $('cacheHint');
    const restoreBtn = $('restoreBtn');
    const appContent = $('appContent');

    // Render file history
    renderFileHistory();

    // Cached session?
    const cached = localStorage.getItem(LS_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length) {
          cacheHint.classList.remove('hidden');
          cacheHint.classList.add('flex');
        }
      } catch (_) { localStorage.removeItem(LS_KEY); }
    }

    // File input
    fileInput.addEventListener('change', e => {
      if (e.target.files.length) handleFile(e.target.files[0]);
    });

    // Drag & drop
    ['dragenter','dragover'].forEach(ev =>
      dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('dragover'); })
    );
    ['dragleave','drop'].forEach(ev =>
      dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('dragover'); })
    );
    dropZone.addEventListener('drop', e => {
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    // Restore
    restoreBtn.addEventListener('click', () => {
      const parsed = JSON.parse(localStorage.getItem(LS_KEY));
      loadData(parsed);
      toast('Restored ' + parsed.length + ' words!', 'info');
    });

    // Keyboard
    document.addEventListener('keydown', e => {
      if (appContent.classList.contains('hidden')) return;
      const active = document.querySelector('.tab-content:not(.hidden)');
      if (!active) return;

      if (active.id === 'tab-flashcards') {
        if (e.key === 'ArrowLeft')  fcNav(-1);
        if (e.key === 'ArrowRight') fcNav(1);
        if (e.key === 'Enter') { e.preventDefault(); flipCard(); }
      }

      if (active.id === 'tab-quiz') {
        const quizPlayVisible = !$('quizPlay').classList.contains('hidden');
        if (!quizPlayVisible) return;

        const inp = $('quizTextInput');
        const nextBtn = $('quizNextBtn');

        // If answered and Next button is visible → Space/Enter goes to next
        if (quizAnswered && nextBtn && !nextBtn.classList.contains('hidden')) {
          if (e.key === 'Enter' ) {
            e.preventDefault();
            nextQuestion();
            return;
          }
        }

        // Submit typed answer with Enter or Space (when input not focused, Space submits)
        const _curQType = (quizMode === 'mixed' || quizMode === 'smart') ? (quizQuestions[quizIdx]?.type) : quizMode;
        if (!quizAnswered && (_curQType === 'typein' || _curQType === 'cloze' || _curQType === 'listening' || _curQType === 'reverse')) {
          if (inp && document.activeElement === inp && (e.key === 'Enter' )) {
            // Space inside input: only submit if it looks like a single-word answer
            if (inp.value.trim().indexOf(' ') === -1 && inp.value.trim().length > 0) {
              e.preventDefault();
              submitTextAnswer();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              submitTextAnswer();
            }
          }
        }
      }
    });
  }

  /* ━━━━━━━━━ FILE PARSING ━━━━━━━━━ */
  function handleFile(file) {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv'
    ];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!validTypes.includes(file.type) && !['xlsx','xls','csv'].includes(ext)) {
      toast('Please upload a valid .xlsx, .xls, or .csv file.', 'error');
      return;
    }

    /* CSV files: read as text and parse manually */
    if (ext === 'csv' || file.type === 'text/csv' || file.type === 'application/csv') {
      const textReader = new FileReader();
      textReader.onload = ev => {
        try {
          const json = parseCSV(ev.target.result);
          if (!json.length) { toast('CSV file is empty.', 'error'); return; }
          processImportedJSON(json, file.name);
        } catch (err) {
          console.error(err);
          toast('Error parsing CSV file.', 'error');
        }
      };
      textReader.readAsText(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb   = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json  = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (!json.length) { toast('Spreadsheet is empty.', 'error'); return; }
        processImportedJSON(json, file.name);
      } catch (err) {
        console.error(err);
        toast('Error parsing file.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /* ━━━━━━━━━ CSV PARSER ━━━━━━━━━ */
  function parseCSV(text) {
    const lines = [];
    let cur = '', inQuote = false, row = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuote) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; }   // escaped quote
          else inQuote = false;
        } else { cur += ch; }
      } else {
        if (ch === '"') { inQuote = true; }
        else if (ch === ',') { row.push(cur); cur = ''; }
        else if (ch === '\n' || ch === '\r') {
          if (ch === '\r' && text[i + 1] === '\n') i++;   // CRLF
          row.push(cur); cur = '';
          if (row.length > 1 || row[0] !== '') lines.push(row);
          row = [];
        } else { cur += ch; }
      }
    }
    row.push(cur);
    if (row.length > 1 || row[0] !== '') lines.push(row);

    if (lines.length < 2) return [];   // need header + at least 1 data row
    const headers = lines[0].map(h => h.trim());
    return lines.slice(1).map(cols => {
      const obj = {};
      headers.forEach((h, j) => { obj[h] = (cols[j] || '').trim(); });
      return obj;
    });
  }

  /* Shared column-mapping + loading logic for both Excel and CSV */
  function processImportedJSON(json, fileName) {
    const norm = s => String(s).trim().toLowerCase();
    const cm = {};
    for (const key of Object.keys(json[0])) {
      const n = norm(key);
      if (n === 'word')          cm.word = key;
      else if (n === 'collocations' || n === 'collocation' || n === 'vietnamese' || n === 'tiếng việt' || n === 'tieng viet') cm.collocations = key;
      else if (n === 'phonetics' || n === 'phonetic' || n === 'pronunciation') cm.phonetics = key;
      else if (n === 'definition') cm.definition = key;
      else if (n === 'synonyms')   cm.synonyms = key;
      else if (n === 'antonyms')   cm.antonyms = key;
      else if (n.includes('context') || n.includes('example')) cm.context = key;
    }
    if (!cm.word || !cm.definition) {
      toast('Missing required columns: "Word" and "Definition".', 'error');
      return;
    }
    const parsed = json.map(r => ({
      word:        String(r[cm.word]        || '').trim(),
      collocations:String(r[cm.collocations]|| '').trim(),
      phonetics:   String(r[cm.phonetics]   || '').trim(),
      definition:  String(r[cm.definition]  || '').trim(),
      synonyms:    String(r[cm.synonyms]    || '').trim(),
      antonyms:    String(r[cm.antonyms]    || '').trim(),
      context:     String(r[cm.context]     || '').trim(),
    })).filter(r => r.word && r.definition);

    if (!parsed.length) { toast('No valid rows found.', 'error'); return; }
    loadData(parsed);
    localStorage.setItem(LS_KEY, JSON.stringify(parsed));
    saveFileToHistory(fileName, parsed);
    toast('Loaded ' + parsed.length + ' words!', 'success');
  }

  /* ━━━━━━━━━ LOAD DATA ━━━━━━━━━ */
  function loadData(data) {
    vocabData = data;
    fcIndex   = 0;
    rebuildFcOrder();

    $('uploadSection').classList.add('hidden');
    $('appContent').classList.remove('hidden');
    $('wordCountBadge').classList.remove('hidden');
    $('wordCountBadge').classList.add('flex');
    $('wordCountText').textContent = vocabData.length + ' words';

    // Show nav action buttons
    const addBtn = $('addWordNavBtn');
    const expBtn = $('exportNavBtn');
    if (addBtn) addBtn.classList.remove('hidden');
    if (expBtn) expBtn.classList.remove('hidden');

    // set quiz range defaults
    const qFrom = $('quizRangeFrom');
    const qTo   = $('quizRangeTo');
    if (qFrom) { qFrom.max = vocabData.length; qFrom.placeholder = '1'; }
    if (qTo)   { qTo.max = vocabData.length; qTo.placeholder = vocabData.length; }

    renderFlashcard();
    renderTable();
    updateWrongWordsBadge();
    localStorage.setItem(LS_KEY, JSON.stringify(vocabData));

    // Prompt daily goal if not set today
    maybeShowDailyGoalOnLoad();
  }

  /* ━━━━━━━━━ TAB SWITCHING ━━━━━━━━━ */
  window.switchTab = function(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.classList.toggle('text-brand-700', on);
      b.classList.toggle('bg-brand-50', on);
      b.classList.toggle('text-gray-500', !on);
      b.classList.toggle('bg-transparent', !on);
    });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    $('tab-' + tab).classList.remove('hidden');

    // auto-play only runs on flashcards tab
    if (tab === 'flashcards' && autoPlayOn) startAutoFlipTimer();
    else clearAutoTimers();

    // init reader tab when switching to it
    if (tab === 'reader') initReaderTab();
    // init story tab when switching to it
    if (tab === 'story') initStoryTab();
  };

  /* ━━━━━━━━━ FLASHCARDS ━━━━━━━━━ */
  function renderFlashcard() {
    $('flashcard').classList.remove('flipped');
    const item = vocabData[fcOrder[fcIndex]];
    if (!item) return;

    const lv = getSRSLevel(item.word);

    $('fcWord').textContent      = item.word;
    $('fcCollocations').textContent = item.collocations || '';
    $('fcPhonetics').textContent = item.phonetics || '';
    $('fcDef').textContent       = item.definition;
    $('fcSyn').textContent       = item.synonyms || '—';
    $('fcAnt').textContent       = item.antonyms || '—';
    $('fcCtx').textContent       = item.context  || '—';
    $('fcCurrent').textContent   = fcIndex + 1;
    updateFcInfo();

    const badge = $('fcSrsBadge');
    if (badge) {
      badge.className = 'srs-badge srs-' + lv;
      badge.innerHTML = '<i class="fa-solid fa-signal" style="font-size:8px"></i> ' + srsLabel(lv);
    }

    // restart auto-play idle timer for new card
    if (autoPlayOn) startAutoFlipTimer();

    // auto-speak the word when a new card appears
    setTimeout(() => speakWord(item.word), 150);
  }

  window.flipCard = function() {
    $('flashcard').classList.toggle('flipped');

    // speak the word again when flipped
    const item = vocabData[fcOrder[fcIndex]];
    if (item) setTimeout(() => speakWord(item.word), 150);

    // user flipped → if auto-play, start the 20s-to-next timer
    if (autoPlayOn) {
      if ($('flashcard').classList.contains('flipped')) startAutoNextTimer();
      else startAutoFlipTimer();
    }
  };

  window.fcNav = function(dir) {
    if (!fcOrder.length) return;
    fcIndex = (fcIndex + dir + fcOrder.length) % fcOrder.length;
    renderFlashcard();
    resetAutoPlay();
    bumpDailyGoal('flashcards', 1);
  };

  window.shuffleCards = function() {
    for (let i = fcOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fcOrder[i], fcOrder[j]] = [fcOrder[j], fcOrder[i]];
    }
    fcIndex = 0;
    renderFlashcard();
    resetAutoPlay();
    toast('Cards shuffled!', 'info');
  };

  /* ━━━━━━━━━ AUTO-PLAY (idle auto-advance) ━━━━━━━━━ */
  function clearAutoTimers() {
    if (autoFlipTimer) { clearTimeout(autoFlipTimer); autoFlipTimer = null; }
    if (autoNextTimer) { clearTimeout(autoNextTimer); autoNextTimer = null; }
    updateCountdown(null);
  }

  function startAutoFlipTimer() {
    clearAutoTimers();
    if (!autoPlayOn || !fcOrder.length) return;
    const isFlashTab = !$('tab-flashcards').classList.contains('hidden');
    if (!isFlashTab) return;

    const start = Date.now();
    updateCountdown({ target: AUTO_FLIP_MS, start, label: 'flip' });

    autoFlipTimer = setTimeout(() => {
      autoFlipTimer = null;
      // auto-flip to show definition
      const card = $('flashcard');
      if (!card.classList.contains('flipped')) card.classList.add('flipped');
      startAutoNextTimer();
    }, AUTO_FLIP_MS);
  }

  function startAutoNextTimer() {
    if (autoNextTimer) { clearTimeout(autoNextTimer); autoNextTimer = null; }
    if (!autoPlayOn || !fcOrder.length) return;

    const start = Date.now();
    updateCountdown({ target: AUTO_NEXT_MS, start, label: 'next' });

    autoNextTimer = setTimeout(() => {
      autoNextTimer = null;
      if (!fcOrder.length) return;
      fcIndex = (fcIndex + 1) % fcOrder.length;
      renderFlashcard();
      startAutoFlipTimer();
      bumpDailyGoal('flashcards', 1);
    }, AUTO_NEXT_MS);
  }

  /* Countdown display helper */
  let _countdownRAF = null;
  function updateCountdown(cfg) {
    if (_countdownRAF) { cancelAnimationFrame(_countdownRAF); _countdownRAF = null; }
    const el = $('autoCountdown');
    if (!el) return;
    if (!cfg) { el.textContent = ''; return; }

    (function tick() {
      const left = Math.max(0, cfg.target - (Date.now() - cfg.start));
      const sec  = Math.ceil(left / 1000);
      if (cfg.label === 'flip') {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        el.textContent = 'Auto-flip in ' + m + ':' + String(s).padStart(2, '0');
      } else {
        el.textContent = 'Next card in ' + sec + 's';
      }
      if (left > 0 && autoPlayOn) _countdownRAF = requestAnimationFrame(tick);
      else el.textContent = '';
    })();
  }

  function resetAutoPlay() {
    if (!autoPlayOn) return;
    // Any interaction resets to the 2-min idle timer
    // but if card is already flipped, restart the 20s timer instead
    const card = $('flashcard');
    if (card && card.classList.contains('flipped')) {
      startAutoNextTimer();
    } else {
      startAutoFlipTimer();
    }
  }

  window.toggleAutoPlay = function() {
    autoPlayOn = !autoPlayOn;
    const btn = $('autoPlayBtn');
    const dot = $('autoPlayDot');
    if (autoPlayOn) {
      btn.classList.add('auto-play-active');
      if (dot) dot.classList.replace('bg-gray-400','bg-green-500');
      startAutoFlipTimer();
      toast('Auto-play ON – card flips after 2 min idle, advances after 20 s.', 'info');
    } else {
      btn.classList.remove('auto-play-active');
      if (dot) dot.classList.replace('bg-green-500','bg-gray-400');
      clearAutoTimers();
      toast('Auto-play OFF.', 'info');
    }
  };

  /* ━━━━━━━━━ VOCABULARY LIST ━━━━━━━━━ */
  window.renderTable = function() {
    const q = ($('searchInput').value || '').toLowerCase().trim();
    const filtered = vocabData.filter(v =>
      v.word.toLowerCase().includes(q) || v.definition.toLowerCase().includes(q)
    );
    const tbody = $('vocabTableBody');
    $('listCount').textContent = filtered.length + ' of ' + vocabData.length;

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center py-12 text-gray-400">' +
        '<i class="fa-solid fa-inbox text-2xl mb-2 block"></i>No words found.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map((v, i) => {
      const lv = getSRSLevel(v.word);
      const origIdx = vocabData.indexOf(v) + 1;
      const known = isSkipped(v.word);
      return `
      <tr class="border-t border-surface-100 hover:bg-surface-50 transition ${known ? 'opacity-50' : ''}">
        <td class="px-4 py-3 text-gray-400 text-xs font-mono">${origIdx}</td>
        <td class="px-4 py-3 font-semibold text-brand-700 whitespace-nowrap">
          ${esc(v.word)} ${known ? '<span class="text-[10px] text-green-500 font-bold ml-1">✓ KNOWN</span>' : ''}
          <button onclick="event.stopPropagation();speakWord(this.dataset.word,this)"
            data-word="${escAttr(v.word)}"
            class="speaker-btn speaker-btn-sm ml-1 align-middle" title="Listen">
            <i class="fa-solid fa-volume-high"></i>
          </button>
        </td>
        <td class="px-4 py-3 text-emerald-600 text-sm hidden sm:table-cell">${esc(v.collocations) || '<span class="text-gray-300">—</span>'}</td>
        <td class="px-4 py-3 text-brand-500 hidden sm:table-cell">${esc(v.phonetics) || '<span class="text-gray-300">—</span>'}</td>
        <td class="px-4 py-3 text-gray-600 hidden md:table-cell">${esc(v.definition)}</td>
        <td class="px-4 py-3 text-gray-500 hidden md:table-cell">${esc(v.synonyms) || '<span class="text-gray-300">—</span>'}</td>
        <td class="px-4 py-3 text-gray-500 hidden lg:table-cell">${esc(v.antonyms) || '<span class="text-gray-300">—</span>'}</td>
        <td class="px-4 py-3 text-gray-500 italic hidden lg:table-cell">${esc(v.context) || '<span class="text-gray-300">—</span>'}</td>
        <td class="px-4 py-3 hidden sm:table-cell"><span class="srs-badge srs-${lv}">${srsLabel(lv)}</span></td>
      </tr>`;
    }).join('');
  };

  /* ━━━━━━━━━ MISTAKE ANALYSIS & EXPLAIN ANSWER ━━━━━━━━━ */
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({length: m + 1}, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[m][n];
  }

  function analyzeMistake(q, userAnswer) {
    const ua = (userAnswer || '').toLowerCase().trim();
    const ca = (q.answer || '').toLowerCase().trim();

    if (!ua) return { type: 'no_answer', label: 'No Answer', icon: 'fa-circle-question', color: 'gray' };

    // Check if user picked a synonym of the correct word
    const wordData = vocabData[q.idx];
    if (wordData && wordData.synonyms) {
      const syns = wordData.synonyms.split(/[,;]/).map(s => s.trim().toLowerCase()).filter(Boolean);
      if (syns.some(s => s === ua || ua.includes(s) || s.includes(ua))) {
        return { type: 'synonym_confusion', label: 'Synonym Confusion', icon: 'fa-equals', color: 'purple' };
      }
    }

    // Check spelling similarity (Levenshtein ≤ 2) for text input modes
    if (q.type === 'typein' || q.type === 'cloze' || q.type === 'listening') {
      const dist = levenshtein(ua, ca);
      if (dist > 0 && dist <= 2 && ca.length > 2) {
        return { type: 'spelling', label: 'Spelling Error', icon: 'fa-spell-check', color: 'blue' };
      }
    }

    // Listening mode — hearing confusion
    if (q.type === 'listening') {
      return { type: 'hearing', label: 'Hearing Confusion', icon: 'fa-ear-listen', color: 'indigo' };
    }

    // Check if user answer matches another vocab word (word confusion)
    const isOtherWord = vocabData.some(v => v.word.toLowerCase().trim() === ua && v.word.toLowerCase().trim() !== ca);
    if (isOtherWord) {
      return { type: 'word_confusion', label: 'Word Mix-up', icon: 'fa-shuffle', color: 'orange' };
    }

    // Reverse mode — definition recall issue
    if (q.type === 'reverse') {
      return { type: 'definition_recall', label: 'Definition Recall', icon: 'fa-brain', color: 'pink' };
    }

    // Default — general recall
    return { type: 'recall', label: 'Needs Review', icon: 'fa-book-open', color: 'amber' };
  }

  function getExplanationHTML(q, mistakeInfo) {
    const item = vocabData[q.idx];
    if (!item) return '';

    const tips = {
      'synonym_confusion': 'You confused this with a synonym. Pay attention to the subtle differences.',
      'spelling': 'Almost there! Watch out for the exact spelling.',
      'hearing': 'The pronunciation tricked you. Focus on the phonetics below.',
      'word_confusion': 'You mixed this up with another word. Compare their definitions.',
      'definition_recall': 'You need to strengthen recall of this definition. Read the example context.',
      'recall': 'This word needs more practice. Review the details below.',
      'no_answer': 'Take your time to recall. Review the word info below.'
    };
    const tip = tips[mistakeInfo.type] || tips['recall'];

    let html = '<div class="explain-panel">';
    html += '<div class="explain-header">';
    html += '<i class="fa-solid fa-lightbulb text-amber-500"></i>';
    html += '<span class="font-bold text-gray-700">Why was this wrong?</span>';
    html += '<span class="mistake-badge mistake-' + mistakeInfo.color + '"><i class="fa-solid ' + mistakeInfo.icon + '"></i> ' + mistakeInfo.label + '</span>';
    html += '</div>';
    html += '<p class="text-sm text-gray-500 mb-3 italic">' + esc(tip) + '</p>';
    html += '<div class="explain-body">';
    html += '<div class="explain-word">' + esc(item.word);
    if (item.phonetics) html += ' <span class="explain-phonetics">' + esc(item.phonetics) + '</span>';
    html += '</div>';
    html += '<div class="explain-field"><span class="explain-label"><i class="fa-solid fa-book mr-1"></i>Definition</span><span>' + esc(item.definition) + '</span></div>';
    if (item.synonyms && item.synonyms !== '—') {
      html += '<div class="explain-field"><span class="explain-label"><i class="fa-solid fa-equals mr-1"></i>Synonyms</span><span>' + esc(item.synonyms) + '</span></div>';
    }
    if (item.antonyms && item.antonyms !== '—') {
      html += '<div class="explain-field"><span class="explain-label"><i class="fa-solid fa-not-equal mr-1"></i>Antonyms</span><span>' + esc(item.antonyms) + '</span></div>';
    }
    if (item.collocations) {
      html += '<div class="explain-field"><span class="explain-label"><i class="fa-solid fa-link mr-1"></i>Collocations</span><span>' + esc(item.collocations) + '</span></div>';
    }
    if (item.context) {
      html += '<div class="explain-field"><span class="explain-label"><i class="fa-solid fa-quote-left mr-1"></i>Example</span><span class="italic">' + esc(item.context) + '</span></div>';
    }
    html += '</div></div>';
    return html;
  }

  /* compact explanation for summary list */
  function getSummaryExplainHTML(reportItem) {
    const q = quizQuestions.find(qq => qq.idx === reportItem._qIdx) || quizQuestions[reportItem._qOrder];
    if (!q) return '';
    const item = vocabData[q.idx];
    if (!item) return '';
    const mi = reportItem.mistakeInfo;
    let html = '<div class="summary-explain-detail">';
    if (mi) html += '<span class="mistake-badge mistake-' + mi.color + ' mb-2"><i class="fa-solid ' + mi.icon + '"></i> ' + mi.label + '</span> ';
    html += '<div class="explain-field"><span class="explain-label">Definition</span><span>' + esc(item.definition) + '</span></div>';
    if (item.synonyms && item.synonyms !== '—') html += '<div class="explain-field"><span class="explain-label">Synonyms</span><span>' + esc(item.synonyms) + '</span></div>';
    if (item.context) html += '<div class="explain-field"><span class="explain-label">Example</span><span class="italic">' + esc(item.context) + '</span></div>';
    html += '</div>';
    return html;
  }

  /* ━━━━━━━━━ QUIZ — WEIGHTED SELECTION (SRS) ━━━━━━━━━ */
  function selectWeighted(pool, count) {
    if (pool.length <= count) return shuffle([...pool]);
    const wts  = pool.map(i => Math.max(1, 6 - getSRSLevel(vocabData[i].word)));
    const avail = [...pool];
    const aw   = [...wts];
    const out  = [];
    for (let k = 0; k < count && avail.length; k++) {
      const total = aw.reduce((a, b) => a + b, 0);
      let r = Math.random() * total, pos = 0;
      for (let j = 0; j < avail.length; j++) { r -= aw[j]; if (r <= 0) { pos = j; break; } }
      out.push(avail[pos]);
      avail.splice(pos, 1);
      aw.splice(pos, 1);
    }
    return out;
  }

  /* ━━━━━━━━━ QUIZ — MODE CHIP CONTROLS ━━━━━━━━━ */
  function getSelectedQuizModes() {
    const chips = document.querySelectorAll('#quizModeChips .quiz-mode-chip.active');
    return Array.from(chips).map(c => c.dataset.mode);
  }

  window.toggleQuizMode = function(btn) {
    btn.classList.toggle('active');
    // Ensure at least one mode stays selected
    if (getSelectedQuizModes().length === 0) {
      btn.classList.add('active');
      toast('Keep at least one mode selected.', 'info');
    }
  };

  window.selectAllQuizModes = function() {
    document.querySelectorAll('#quizModeChips .quiz-mode-chip').forEach(c => c.classList.add('active'));
  };

  window.selectRecallModes = function() {
    const recall = ['typein', 'listening', 'reverse'];
    document.querySelectorAll('#quizModeChips .quiz-mode-chip').forEach(c => {
      c.classList.toggle('active', recall.includes(c.dataset.mode));
    });
  };

  /* ━━━━━━━━━ QUIZ — START ━━━━━━━━━ */
  window.startQuiz = function() {
    if (vocabData.length < 4) { toast('Need ≥ 4 words for a quiz.', 'error'); return; }
    setDictEnabled(false);

    const selectedModes = getSelectedQuizModes();
    if (selectedModes.length === 0) { toast('Select at least one quiz mode.', 'error'); return; }
    quizMode = selectedModes.length === 1 ? selectedModes[0] : 'mixed';

    const total = Math.min(parseInt($('quizLength').value) || 10, vocabData.length);

    /* Parse range */
    const fromVal = parseInt($('quizRangeFrom').value) || 1;
    const toVal   = parseInt($('quizRangeTo').value)   || vocabData.length;
    const rangeFrom = Math.max(1, Math.min(fromVal, vocabData.length)) - 1;  // 0-based
    const rangeTo   = Math.max(1, Math.min(toVal, vocabData.length));        // exclusive

    if (rangeTo <= rangeFrom) {
      toast('Invalid range. "From" must be less than "To".', 'error');
      return;
    }

    /* Build pool within range */
    let pool;
    const rangeIndices = [];
    for (let i = rangeFrom; i < rangeTo; i++) rangeIndices.push(i);

    if (quizMode === 'cloze') {
      pool = [];
      rangeIndices.forEach(i => {
        const v = vocabData[i];
        if (!v.context) return;
        if (new RegExp('\\b' + escRx(v.word) + '\\b', 'i').test(v.context)) pool.push(i);
      });
      if (pool.length < 2) { toast('Not enough context data for Cloze in this range. Try another mode.', 'error'); return; }
    } else if (quizMode === 'synonym') {
      pool = [];
      rangeIndices.forEach(i => {
        if (vocabData[i].synonyms && vocabData[i].synonyms.trim() && vocabData[i].synonyms.trim() !== '—') pool.push(i);
      });
      if (pool.length < 4) { toast('Not enough synonym data. Need ≥ 4 words with synonyms.', 'error'); return; }
    } else {
      pool = rangeIndices;
    }

    if (pool.length < 4 && quizMode === 'mc') {
      toast('Need ≥ 4 words in the selected range for Multiple Choice.', 'error');
      return;
    }

    const picked = selectWeighted(pool, Math.min(total, pool.length));

    if (quizMode === 'mixed') {
      /* Pick a random eligible mode from user-selected modes for each question */
      quizQuestions = picked.map(idx => {
        const v = vocabData[idx];
        const eligible = selectedModes.filter(m => {
          if (m === 'cloze') return v.context && new RegExp('\\b' + escRx(v.word) + '\\b', 'i').test(v.context);
          if (m === 'synonym') return v.synonyms && v.synonyms.trim() && v.synonyms.trim() !== '—';
          if (m === 'mc') return pool.length >= 4;
          return true;
        });
        if (eligible.length === 0) return buildQuizQuestion(idx, selectedModes.includes('typein') ? 'typein' : 'mc');
        /* Avoid same mode twice in a row */
        const prev = quizQuestions[quizQuestions.length - 1]?.type;
        const filtered = eligible.length > 1 ? eligible.filter(m => m !== prev) : eligible;
        const mode = filtered[Math.floor(Math.random() * filtered.length)];
        return buildQuizQuestion(idx, mode);
      });
    } else {
      quizQuestions = picked.map(idx => buildQuizQuestion(idx, quizMode));
    }
    quizIdx   = 0;
    quizScore = { correct:0, wrong:0 };
    quizReport = [];
    quizAnswered = false;

    $('quizStart').classList.add('hidden');
    $('quizSummary').classList.add('hidden');
    $('quizPlay').classList.remove('hidden');
    renderQuizQ();
  };

  /* ━━━━━━━━━ SMART SESSION (5-min Quick Study) ━━━━━━━━━ */
  window.startSmartSession = function() {
    if (vocabData.length < 4) { toast('Need ≥ 4 words to start.', 'error'); return; }
    setDictEnabled(false);

    /* Collect words from 3 priority categories */
    const wrongIndices = [];
    const newIndices = [];      // SRS 0
    const atRiskIndices = [];   // SRS 1-2

    vocabData.forEach((v, i) => {
      if (isSkipped(v.word)) return;
      const key = v.word.toLowerCase().trim();
      const srs = getSRSLevel(v.word);
      if (wrongWords.has(key)) wrongIndices.push(i);
      else if (srs === 0) newIndices.push(i);
      else if (srs <= 2) atRiskIndices.push(i);
    });

    /* Mix: up to 5 wrong + 5 new + 5 at-risk */
    shuffle(wrongIndices);
    shuffle(newIndices);
    shuffle(atRiskIndices);

    const selected = [];
    selected.push(...wrongIndices.slice(0, 5));
    selected.push(...newIndices.slice(0, 5));
    selected.push(...atRiskIndices.slice(0, 5));

    /* If too few, pad from remaining pool */
    if (selected.length < 5) {
      const used = new Set(selected);
      const remaining = [];
      vocabData.forEach((v, i) => {
        if (!used.has(i) && !isSkipped(v.word)) remaining.push(i);
      });
      shuffle(remaining);
      for (const idx of remaining) {
        if (selected.length >= 10) break;
        selected.push(idx);
      }
    }

    if (selected.length < 2) { toast('Not enough words for a session.', 'error'); return; }
    shuffle(selected);

    /* Build questions with varied modes per SRS level */
    quizQuestions = selected.map(idx => {
      const v = vocabData[idx];
      const srs = getSRSLevel(v.word);
      let mode;

      if (srs <= 1) {
        mode = Math.random() < 0.7 ? 'mc' : 'typein';
      } else {
        const r = Math.random();
        if (r < 0.3) mode = 'mc';
        else if (r < 0.6) mode = 'typein';
        else if (v.context && new RegExp('\\b' + escRx(v.word) + '\\b', 'i').test(v.context)) mode = 'cloze';
        else mode = 'listening';
      }

      const q = buildQuizQuestion(idx, mode);
      if (mode === 'cloze' && !q.clozeText) return buildQuizQuestion(idx, 'typein');
      return q;
    });

    quizMode = 'smart';
    quizIdx = 0;
    quizScore = { correct: 0, wrong: 0 };
    quizReport = [];
    quizAnswered = false;

    /* Start 5-minute timer */
    smartSessionActive = true;
    smartSessionEndTime = Date.now() + 5 * 60 * 1000;

    $('quizStart').classList.add('hidden');
    $('quizSummary').classList.add('hidden');
    $('quizPlay').classList.remove('hidden');

    startSmartTimer();
    renderQuizQ();
    toast('⚡ Smart Session started! 5 minutes of focused review.', 'info');
  };

  function startSmartTimer() {
    const timerEl = $('smartTimer');
    const textEl = $('smartTimerText');
    if (!timerEl || !textEl) return;
    timerEl.classList.remove('hidden');
    timerEl.classList.remove('timer-warning');

    function tick() {
      if (!smartSessionActive) { timerEl.classList.add('hidden'); return; }
      const left = Math.max(0, smartSessionEndTime - Date.now());
      const min = Math.floor(left / 60000);
      const sec = Math.floor((left % 60000) / 1000);
      textEl.textContent = min + ':' + String(sec).padStart(2, '0');

      if (left < 30000) timerEl.classList.add('timer-warning');
      else timerEl.classList.remove('timer-warning');

      if (left <= 0) {
        smartSessionActive = false;
        timerEl.classList.add('hidden');
        toast('⏱️ Time\'s up! Great session!', 'info');
        showSummary();
        return;
      }
      _smartTimerRAF = requestAnimationFrame(tick);
    }
    tick();
  }

  function stopSmartTimer() {
    smartSessionActive = false;
    if (_smartTimerRAF) { cancelAnimationFrame(_smartTimerRAF); _smartTimerRAF = null; }
    const timerEl = $('smartTimer');
    if (timerEl) { timerEl.classList.add('hidden'); timerEl.classList.remove('timer-warning'); }
  }

  /* Build a single quiz question for any mode */
  function buildQuizQuestion(idx, mode) {
    const c = vocabData[idx];
    if (mode === 'mc') {
      const others = vocabData.filter((_, j) => j !== idx);
      shuffle(others);
      const opts = shuffle([c.word, ...others.slice(0, 3).map(d => d.word)]);
      return { type:'mc', definition:c.definition, answer:c.word, options:opts, idx };
    }
    if (mode === 'typein') {
      return { type:'typein', definition:c.definition, answer:c.word, idx };
    }
    if (mode === 'listening') {
      return { type:'listening', answer:c.word, definition:c.definition, phonetics:c.phonetics, idx };
    }
    if (mode === 'reverse') {
      // Given the word, type the definition keyword
      return { type:'reverse', word:c.word, definition:c.definition, answer:c.definition, idx };
    }
    if (mode === 'synonym') {
      // Given a word, pick the correct synonym from options
      const mySynonyms = c.synonyms.split(/[,;]/).map(s => s.trim()).filter(Boolean);
      const correctSyn = mySynonyms[Math.floor(Math.random() * mySynonyms.length)];
      // Build wrong options from other words' synonyms or random words
      const otherSyns = [];
      vocabData.forEach((v, j) => {
        if (j === idx) return;
        if (v.synonyms) v.synonyms.split(/[,;]/).forEach(s => { const t = s.trim(); if (t && t !== '—') otherSyns.push(t); });
      });
      shuffle(otherSyns);
      const wrongOpts = otherSyns.filter(s => !mySynonyms.includes(s)).slice(0, 3);
      // If not enough wrong opts, pad with random words
      while (wrongOpts.length < 3) {
        const rw = vocabData[Math.floor(Math.random() * vocabData.length)].word;
        if (rw !== c.word && !wrongOpts.includes(rw) && !mySynonyms.includes(rw)) wrongOpts.push(rw);
      }
      const opts = shuffle([correctSyn, ...wrongOpts]);
      return { type:'synonym', word:c.word, answer:correctSyn, allCorrect:mySynonyms, options:opts, idx };
    }
    /* cloze */
    const rx = new RegExp('\\b' + escRx(c.word) + '\\b', 'i');
    return { type:'cloze', clozeText:c.context.replace(rx, '_____'),
             definition:c.definition, answer:c.word, idx };
  }

  /* ━━━━━━━━━ QUIZ — RENDER QUESTION ━━━━━━━━━ */
  function renderQuizQ() {
    const q = quizQuestions[quizIdx];
    quizAnswered = false;

    $('qNum').textContent     = quizIdx + 1;
    $('qTotal').textContent   = quizQuestions.length;
    $('qCorrect').textContent = quizScore.correct;
    $('qWrong').textContent   = quizScore.wrong;
    $('quizProgress').style.width = (quizIdx / quizQuestions.length * 100) + '%';
    $('quizNextBtn').classList.add('hidden');

    /* hide all answer areas */
    $('quizOptions').classList.add('hidden');
    $('quizOptions').innerHTML = '';
    $('quizInputArea').classList.add('hidden');
    $('quizTextFeedback').classList.add('hidden');
    $('quizSpeakerReveal').classList.add('hidden');
    $('quizContextCard').classList.add('hidden');
    $('quizExplain').classList.add('hidden');

    const inp = $('quizTextInput');
    inp.value = '';
    inp.disabled = false;
    inp.className = 'quiz-text-input';
    $('quizSubmitBtn').classList.remove('hidden');

    /* mode badge */
    const labels = { mc:'Multiple Choice', typein:'Type-in', cloze:'Cloze Test', listening:'Listening', reverse:'Reverse', synonym:'Synonym Match', smart:'⚡ Smart' };
    const badgeLabel = (labels[q.type] || '');
    $('quizModeBadge').textContent = quizMode === 'mixed' ? '🎲 ' + badgeLabel : badgeLabel;

    if (q.type === 'mc') {
      $('quizPrompt').textContent = 'Which word matches this definition?';
      $('quizQuestion').textContent = q.definition;
      $('quizOptions').classList.remove('hidden');
      $('quizOptions').innerHTML = q.options.map((opt, i) => `
        <button data-word="${escAttr(opt)}" data-answer="${escAttr(q.answer)}"
          onclick="pickAnswer(this)"
          class="answer-btn bg-white border-2 border-surface-200 rounded-xl px-5 py-4 text-left font-semibold text-gray-700 hover:border-brand-400 transition">
          <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-surface-100 text-xs font-bold text-gray-500 mr-2">${String.fromCharCode(65+i)}</span>
          ${esc(opt)}
        </button>`).join('');

    } else if (q.type === 'typein') {
      $('quizPrompt').textContent = 'Type the word that matches this definition:';
      $('quizQuestion').textContent = q.definition;
      $('quizInputArea').classList.remove('hidden');
      inp.placeholder = 'Type the word…';
      setTimeout(() => inp.focus(), 50);

    } else if (q.type === 'listening') {
      $('quizPrompt').innerHTML = '<i class="fa-solid fa-headphones mr-1"></i> Listen and type the word you hear:';
      $('quizQuestion').innerHTML = '<button onclick=\"speakWord(\'' + escAttr(q.answer) + '\', this)\" class=\"speaker-btn mx-auto\" style=\"width:4rem;height:4rem;font-size:1.5rem\" title=\"Play again\"><i class=\"fa-solid fa-volume-high\"></i></button><br><span class=\"text-xs text-gray-400 mt-2\">Click to play again</span>';
      $('quizInputArea').classList.remove('hidden');
      inp.placeholder = 'Type what you hear…';
      setTimeout(() => { speakWord(q.answer); inp.focus(); }, 300);

    } else if (q.type === 'reverse') {
      $('quizPrompt').textContent = 'What does this word mean? Type a key part of the definition:';
      $('quizQuestion').innerHTML = '<span class=\"text-3xl font-extrabold text-brand-700\">' + esc(q.word) + '</span>';
      $('quizInputArea').classList.remove('hidden');
      inp.placeholder = 'Type part of the definition…';
      setTimeout(() => inp.focus(), 50);

    } else if (q.type === 'synonym') {
      $('quizPrompt').textContent = 'Which is a synonym of this word?';
      $('quizQuestion').innerHTML = '<span class=\"text-3xl font-extrabold text-brand-700\">' + esc(q.word) + '</span>';
      $('quizOptions').classList.remove('hidden');
      $('quizOptions').innerHTML = q.options.map((opt, i) => `
        <button data-word="${escAttr(opt)}" data-answer="${escAttr(q.answer)}" data-all-correct='${JSON.stringify(q.allCorrect)}'
          onclick="pickSynonymAnswer(this)"
          class="answer-btn bg-white border-2 border-surface-200 rounded-xl px-5 py-4 text-left font-semibold text-gray-700 hover:border-brand-400 transition">
          <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-surface-100 text-xs font-bold text-gray-500 mr-2">${String.fromCharCode(65+i)}</span>
          ${esc(opt)}
        </button>`).join('');

    } else {
      // cloze
      $('quizPrompt').textContent = 'Fill in the blank:';
      $('quizQuestion').innerHTML = esc(q.clozeText).replace('_____',
        '<span class="cloze-blank">_____</span>');
      $('quizInputArea').classList.remove('hidden');
      inp.placeholder = 'Fill in the missing word…';
      setTimeout(() => inp.focus(), 50);
    }
  }

  /* ━━━━━━━━━ QUIZ — MULTIPLE CHOICE ANSWER ━━━━━━━━━ */
  window.pickAnswer = function(btn) {
    if (quizAnswered) return;
    quizAnswered = true;

    const picked = btn.dataset.word;
    const answer = btn.dataset.answer;
    const btns   = $('quizOptions').querySelectorAll('.answer-btn');
    const ok     = picked === answer;

    if (ok) { quizScore.correct++; btn.classList.add('correct'); }
    else {
      quizScore.wrong++;
      btn.classList.add('wrong');
      btns.forEach(b => { if (b.dataset.word === answer) b.classList.add('reveal-correct','correct'); });
    }
    btns.forEach(b => b.classList.add('disabled'));

    updateSRS(answer, ok);
    if (!ok) addWrongWord(answer);
    else removeWrongWord(answer);
    const mistakeInfo = ok ? null : analyzeMistake(quizQuestions[quizIdx], picked);
    quizReport.push({ word: answer, correct: ok, userAnswer: picked, correctAnswer: answer, mode: 'mc', mistakeInfo, _qIdx: quizQuestions[quizIdx].idx, _qOrder: quizIdx });
    afterAnswer(answer, ok);
  };

  /* ━━━━━━━━━ QUIZ — SYNONYM MATCH ANSWER ━━━━━━━━━ */
  window.pickSynonymAnswer = function(btn) {
    if (quizAnswered) return;
    quizAnswered = true;

    const picked = btn.dataset.word;
    const q = quizQuestions[quizIdx];
    let allCorrect;
    try { allCorrect = JSON.parse(btn.dataset.allCorrect); } catch(_) { allCorrect = [q.answer]; }
    const ok = allCorrect.some(s => s.toLowerCase() === picked.toLowerCase());
    const btns = $('quizOptions').querySelectorAll('.answer-btn');
    const wordKey = vocabData[q.idx] ? vocabData[q.idx].word : q.word;

    if (ok) { quizScore.correct++; btn.classList.add('correct'); }
    else {
      quizScore.wrong++;
      btn.classList.add('wrong');
      btns.forEach(b => { if (b.dataset.word === q.answer) b.classList.add('reveal-correct','correct'); });
    }
    btns.forEach(b => b.classList.add('disabled'));

    updateSRS(wordKey, ok);
    if (!ok) addWrongWord(wordKey);
    else removeWrongWord(wordKey);
    const mistakeInfo = ok ? null : analyzeMistake(quizQuestions[quizIdx], picked);
    quizReport.push({ word: wordKey, correct: ok, userAnswer: picked, correctAnswer: q.answer, mode: 'synonym', mistakeInfo, _qIdx: q.idx, _qOrder: quizIdx });
    afterAnswer(wordKey, ok);
  };

  /* ━━━━━━━━━ QUIZ — TEXT ANSWER (TYPE-IN / CLOZE) ━━━━━━━━━ */
  window.submitTextAnswer = function() {
    if (quizAnswered) return;
    const inp = $('quizTextInput');
    const val = inp.value.trim();
    if (!val) { toast('Please type an answer.', 'info'); return; }

    quizAnswered = true;
    const q  = quizQuestions[quizIdx];

    let ok;
    let displayAnswer;

    if (q.type === 'reverse') {
      // For reverse mode: check if user's answer contains key words from the definition
      // Accept if ≥ 60% word overlap or contains a significant substring
      const defWords = q.answer.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const userWords = val.toLowerCase().split(/\s+/);
      const matchCount = defWords.filter(dw => userWords.some(uw => dw.includes(uw) || uw.includes(dw))).length;
      ok = defWords.length > 0 && (matchCount / defWords.length >= 0.4);
      // Also accept if user typed a big chunk that appears in the definition
      if (!ok && q.answer.toLowerCase().includes(val.toLowerCase()) && val.length >= 4) ok = true;
      displayAnswer = q.answer;
    } else if (q.type === 'listening') {
      ok = val.toLowerCase() === q.answer.toLowerCase();
      displayAnswer = q.answer;
    } else {
      ok = val.toLowerCase() === q.answer.toLowerCase();
      displayAnswer = q.answer;
    }

    const fb = $('quizTextFeedback');
    fb.classList.remove('hidden','correct-feedback','wrong-feedback');

    const wordKey = q.answer || q.word || displayAnswer;

    if (ok) {
      quizScore.correct++;
      inp.classList.add('correct-input');
      fb.classList.add('correct-feedback');
      if (q.type === 'reverse') {
        fb.innerHTML = '<i class="fa-solid fa-circle-check mr-1"></i> Correct! Full definition: "' + esc(displayAnswer) + '"';
      } else {
        fb.innerHTML = '<i class="fa-solid fa-circle-check mr-1"></i> Correct! "' + esc(displayAnswer) + '"';
      }
    } else {
      quizScore.wrong++;
      inp.classList.add('wrong-input');
      fb.classList.add('wrong-feedback');
      if (q.type === 'reverse') {
        fb.innerHTML = '<i class="fa-solid fa-circle-xmark mr-1"></i> Not quite. The definition is: "<strong>' + esc(displayAnswer) + '</strong>"';
      } else {
        fb.innerHTML = '<i class="fa-solid fa-circle-xmark mr-1"></i> Wrong! The answer is "<strong>' + esc(displayAnswer) + '</strong>"';
      }
    }
    inp.disabled = true;
    $('quizSubmitBtn').classList.add('hidden');

    const srsWord = q.type === 'reverse' ? q.word : (q.answer || q.word);
    updateSRS(srsWord, ok);
    if (!ok) addWrongWord(srsWord);
    else removeWrongWord(srsWord);
    const mistakeInfo = ok ? null : analyzeMistake(q, val);
    quizReport.push({ word: srsWord, correct: ok, userAnswer: val, correctAnswer: displayAnswer, mode: q.type, mistakeInfo, _qIdx: q.idx, _qOrder: quizIdx });
    afterAnswer(srsWord, ok);
  };

  /* ━━━━━━━━━ QUIZ — AFTER ANSWER (common) ━━━━━━━━━ */
  function afterAnswer(word, ok) {
    $('qCorrect').textContent = quizScore.correct;
    $('qWrong').textContent   = quizScore.wrong;
    if (ok) bumpDailyGoal('quiz', 1);

    /* speaker reveal */
    const sr = $('quizSpeakerReveal');
    sr.classList.remove('hidden');
    sr.innerHTML = `
      <button onclick="speakWord(this.dataset.word,this)" data-word="${escAttr(word)}"
        class="speaker-btn mx-auto" title="Listen">
        <i class="fa-solid fa-volume-high"></i>
      </button>
      <span class="text-xs text-gray-400 mt-1">Listen to pronunciation</span>`;

    /* Explain Answer for wrong answers */
    const explainEl = $('quizExplain');
    if (explainEl) {
      const lastReport = quizReport[quizReport.length - 1];
      if (lastReport && !lastReport.correct) {
        const q = quizQuestions[quizIdx];
        const mistakeInfo = lastReport.mistakeInfo || { type: 'recall', label: 'Needs Review', icon: 'fa-book-open', color: 'amber' };
        explainEl.innerHTML = getExplanationHTML(q, mistakeInfo);
        explainEl.classList.remove('hidden');
      } else {
        explainEl.classList.add('hidden');
      }
    }

    /* Context reinforcement for correct answers */
    const ctxCard = $('quizContextCard');
    if (ctxCard) {
      const lastRep = quizReport[quizReport.length - 1];
      if (lastRep && lastRep.correct) {
        const item = vocabData[quizQuestions[quizIdx].idx];
        if (item) {
          let html = '<div class="context-reinforce">';
          html += '<p class="text-xs uppercase tracking-widest text-green-500 font-semibold mb-2"><i class="fa-solid fa-brain mr-1"></i> Reinforce Memory</p>';
          if (item.collocations && item.collocations.trim()) html += '<div class="ctx-field"><span class="ctx-label"><i class="fa-solid fa-link mr-1"></i>Collocations</span><span>' + esc(item.collocations) + '</span></div>';
          if (item.synonyms && item.synonyms.trim() && item.synonyms.trim() !== '—') html += '<div class="ctx-field"><span class="ctx-label"><i class="fa-solid fa-equals mr-1"></i>Synonyms</span><span>' + esc(item.synonyms) + '</span></div>';
          if (item.antonyms && item.antonyms.trim() && item.antonyms.trim() !== '—') html += '<div class="ctx-field"><span class="ctx-label"><i class="fa-solid fa-not-equal mr-1"></i>Antonyms</span><span>' + esc(item.antonyms) + '</span></div>';
          if (item.context && item.context.trim()) html += '<div class="ctx-field"><span class="ctx-label"><i class="fa-solid fa-quote-left mr-1"></i>Example</span><span class="italic">' + esc(item.context) + '</span></div>';
          html += '</div>';
          // Only show if there's at least one field
          if (html.includes('ctx-field')) {
            ctxCard.innerHTML = html;
            ctxCard.classList.remove('hidden');
          } else {
            ctxCard.classList.add('hidden');
          }
        } else {
          ctxCard.classList.add('hidden');
        }
      } else {
        ctxCard.classList.add('hidden');
      }
    }

    if (quizIdx + 1 < quizQuestions.length) {
      // Delay showing Next button so the Enter keyup from submitting doesn't
      // immediately trigger a click on the now-focused Next button.
      setTimeout(() => {
        $('quizNextBtn').classList.remove('hidden');
        $('quizNextBtn').focus();
      }, 150);
    } else {
      setTimeout(showSummary, 800);
    }
  }

  /* ━━━━━━━━━ QUIZ — NEXT / SUMMARY ━━━━━━━━━ */
  window.nextQuestion = function() { quizIdx++; renderQuizQ(); };

  window.backToQuizStart = function() {
    stopSmartTimer();
    $('quizPlay').classList.add('hidden');
    $('quizSummary').classList.add('hidden');
    $('quizStart').classList.remove('hidden');
    updateWrongWordsBadge();
    setDictEnabled(true);
  };

  window.stopQuiz = function() {
    stopSmartTimer();
    if (quizScore.correct + quizScore.wrong > 0) showSummary();
    else backToQuizStart();
  };

  window.startWrongWordsQuiz = function() {
    if (vocabData.length < 4) { toast('Need ≥ 4 words for a quiz.', 'error'); return; }
    setDictEnabled(false);
    // Find indices of wrong words that still exist in vocabData
    const wrongIndices = [];
    vocabData.forEach((v, i) => {
      if (wrongWords.has(v.word.toLowerCase().trim())) wrongIndices.push(i);
    });
    if (wrongIndices.length === 0) { toast('No wrong words to review! 🎉', 'info'); return; }

    const selectedModes = getSelectedQuizModes();
    quizMode = selectedModes.length === 1 ? selectedModes[0] : (selectedModes.length > 1 ? 'mixed' : 'mc');

    if (wrongIndices.length < 4 && (quizMode === 'mc' || quizMode === 'synonym')) {
      quizMode = 'typein';
      toast('Using Type-in mode (not enough wrong words for this quiz type).', 'info');
    }

    const picked = shuffle([...wrongIndices]);

    if (quizMode === 'mixed') {
      quizQuestions = picked.map(idx => {
        const v = vocabData[idx];
        const eligible = selectedModes.filter(m => {
          if (m === 'cloze') return v.context && new RegExp('\\b' + escRx(v.word) + '\\b', 'i').test(v.context);
          if (m === 'synonym') return v.synonyms && v.synonyms.trim() && v.synonyms.trim() !== '—';
          if (m === 'mc') return wrongIndices.length >= 4;
          return true;
        });
        if (eligible.length === 0) return buildQuizQuestion(idx, 'typein');
        const prev = quizQuestions[quizQuestions.length - 1]?.type;
        const filtered = eligible.length > 1 ? eligible.filter(m => m !== prev) : eligible;
        const mode = filtered[Math.floor(Math.random() * filtered.length)];
        return buildQuizQuestion(idx, mode);
      });
    } else {
      quizQuestions = picked.map(idx => {
        const q = buildQuizQuestion(idx, quizMode);
        if (quizMode === 'cloze' && !q.clozeText) return buildQuizQuestion(idx, 'typein');
        return q;
      });
    }

    quizIdx   = 0;
    quizScore = { correct:0, wrong:0 };
    quizReport = [];
    quizAnswered = false;

    $('quizStart').classList.add('hidden');
    $('quizSummary').classList.add('hidden');
    $('quizPlay').classList.remove('hidden');
    renderQuizQ();
  };

  function showSummary() {
    setDictEnabled(true);
    stopSmartTimer();
    $('quizPlay').classList.add('hidden');
    $('quizSummary').classList.remove('hidden');

    const total = quizQuestions.length;
    const corr  = quizScore.correct;
    const pct   = Math.round(corr / total * 100);

    // Save report
    const report = generateReport();
    saveReport(report);

    $('sumCorrect').textContent     = corr;
    $('sumWrong').textContent       = quizScore.wrong;
    $('summaryPercent').textContent  = pct + '%';

    const circ = 2 * Math.PI * 52;
    const off  = circ - (pct / 100 * circ);
    const ring = $('summaryRing');
    ring.style.strokeDasharray  = circ;
    ring.style.strokeDashoffset = circ;
    setTimeout(() => { ring.style.strokeDashoffset = off; }, 100);
    ring.style.stroke = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';

    if (pct >= 80)      { $('summaryTitle').textContent = '🎉 Outstanding!';
                          $('summarySubtext').textContent = `You nailed ${corr} of ${total}. Keep it up!`; }
    else if (pct >= 50) { $('summaryTitle').textContent = '👍 Good Effort!';
                          $('summarySubtext').textContent = `You got ${corr} of ${total}. Review the tricky ones!`; }
    else                { $('summaryTitle').textContent = '💪 Keep Practicing!';
                          $('summarySubtext').textContent = `You got ${corr} of ${total}. Try the flashcards first!`; }

    /* ── Mistake Insights ── */
    const wrongReports = quizReport.filter(r => !r.correct);
    const insightsEl = $('summaryInsights');
    const insightGrid = $('insightGrid');
    if (wrongReports.length > 0 && insightsEl && insightGrid) {
      // Count mistakes by type
      const typeCounts = {};
      wrongReports.forEach(r => {
        const mi = r.mistakeInfo || { type: 'recall', label: 'Needs Review', icon: 'fa-book-open', color: 'amber' };
        if (!typeCounts[mi.type]) typeCounts[mi.type] = { ...mi, count: 0 };
        typeCounts[mi.type].count++;
      });
      const sorted = Object.values(typeCounts).sort((a, b) => b.count - a.count);
      insightGrid.innerHTML = sorted.map(t =>
        `<div class="insight-card">
          <div class="insight-count" style="color: var(--tw-text-opacity, 1)">
            <i class="fa-solid ${t.icon} text-sm mr-1"></i>${t.count}
          </div>
          <div class="insight-label">${t.label}</div>
        </div>`
      ).join('');
      insightsEl.classList.remove('hidden');
    } else {
      if (insightsEl) insightsEl.classList.add('hidden');
    }

    /* ── Wrong words list with expandable explanations ── */
    const wrongListEl = $('summaryWrongList');
    const wrongWordsEl = $('summaryWrongWords');
    const reviewBtn = $('summaryReviewBtn');
    if (wrongReports.length > 0 && wrongListEl && wrongWordsEl) {
      wrongListEl.classList.remove('hidden');
      wrongWordsEl.innerHTML = wrongReports.map((r, ri) => {
        const mi = r.mistakeInfo || { type: 'recall', label: 'Needs Review', icon: 'fa-book-open', color: 'amber' };
        const item = vocabData.find(v => v.word.toLowerCase().trim() === (r.word || '').toLowerCase().trim());
        const def = item ? item.definition : '';
        let explainContent = '';
        if (item) {
          explainContent += '<div class="summary-explain-detail">';
          explainContent += '<span class="mistake-badge mistake-' + mi.color + ' mb-2"><i class="fa-solid ' + mi.icon + '"></i> ' + mi.label + '</span>';
          explainContent += '<div class="explain-field"><span class="explain-label">Definition</span><span>' + esc(item.definition) + '</span></div>';
          if (item.synonyms && item.synonyms !== '—') explainContent += '<div class="explain-field"><span class="explain-label">Synonyms</span><span>' + esc(item.synonyms) + '</span></div>';
          if (item.context) explainContent += '<div class="explain-field"><span class="explain-label">Example</span><span class="italic">' + esc(item.context) + '</span></div>';
          if (r.userAnswer) explainContent += '<div class="explain-field"><span class="explain-label">Your answer</span><span class="text-red-500">' + esc(r.userAnswer) + '</span></div>';
          explainContent += '</div>';
        }
        return `<details class="rounded-lg border border-surface-200 bg-white overflow-hidden">
          <summary class="flex items-center gap-2 py-2 px-3 cursor-pointer hover:bg-surface-50 transition">
            <i class="fa-solid fa-circle-xmark text-red-400 text-xs"></i>
            <span class="text-sm font-semibold text-red-600 flex-1">${esc(r.word || '')}</span>
            <span class="mistake-badge mistake-${mi.color}"><i class="fa-solid ${mi.icon}"></i> ${mi.label}</span>
          </summary>
          <div class="px-3 pb-3">${explainContent}</div>
        </details>`;
      }).join('');
      if (reviewBtn) reviewBtn.classList.remove('hidden');
    } else {
      if (wrongListEl) wrongListEl.classList.add('hidden');
      if (insightsEl) insightsEl.classList.add('hidden');
      if (reviewBtn) reviewBtn.classList.add('hidden');
    }

    updateWrongWordsBadge();
    renderTable();   // refresh SRS levels in list
  }

  /* ━━━━━━━━━ TRUYỆN CHÊM (STORY MODE) ━━━━━━━━━ */
  function loadStories() {
    try { return JSON.parse(localStorage.getItem(STORY_KEY)) || []; } catch(e) { return []; }
  }
  function saveStories(list) { localStorage.setItem(STORY_KEY, JSON.stringify(list)); }

  function initStoryTab() {
    renderStoryWordBank();
    refreshStorySavedDropdown();
    updateStoryWordCount();
  }

  window.switchStoryMode = function(mode) {
    ['Edit','Read','Quiz'].forEach(t => {
      $('storyTab' + t).classList.toggle('story-tab-active', t.toLowerCase() === mode);
    });
    $('storyEditPanel').classList.toggle('hidden', mode !== 'edit');
    $('storyReadPanel').classList.toggle('hidden', mode !== 'read');
    $('storyQuizPanel').classList.toggle('hidden', mode !== 'quiz');
    hideStoryTooltip();

    const text = $('storyTextInput').value.trim();
    if (!text && mode !== 'edit') {
      toast('Write or paste a story first.', 'info');
      switchStoryMode('edit');
      return;
    }
    // Resolve which words to highlight
    const words = getActiveStoryMarkedWords(text);
    if (mode === 'read') {
      $('storyRendered').innerHTML = renderStoryHighlighted(text, words);
      // Count as read only when user scrolls to the bottom
      watchReadScrollEnd('storyRendered', 'reading');
    } else if (mode === 'quiz') {
      const result = renderStoryQuizHTML(text, words);
      $('storyQuizContent').innerHTML = result.html;
      storyQuizAnswers = result.answers;
      $('storyQuizScore').textContent = storyQuizAnswers.length + ' blanks to fill';
    } else if (mode === 'edit') {
      renderStoryWordBank();
    }
  };

  window.toggleStoryWordBank = function() { $('storyWordBank').classList.toggle('hidden'); };

  /* ── Get marked words for current story ── */
  // Returns array of {word, start, end} from saved knhl data, or falls back to vocabData detection
  function getActiveStoryMarkedWords(text) {
    if (!text) return [];
    // Check if a saved story is loaded that has knhl-marked words
    if (activeStoryWords.length > 0) {
      // Re-locate the stored words in the current text (positions may have shifted if user edited)
      return relocateMarkedWords(text, activeStoryWords.map(w => w.word));
    }
    // Fallback: use vocabData detection
    return detectVocabInText(text);
  }

  // Given a text and a list of known highlight words, find their positions
  function relocateMarkedWords(text, wordList) {
    if (!wordList.length || !text) return [];
    // Sort by length descending to match longer phrases first
    const sorted = [...new Set(wordList)].sort((a, b) => b.length - a.length);
    const found = [];
    for (const word of sorted) {
      const rx = new RegExp('\\b' + escRx(word) + '\\b', 'gi');
      let m;
      while ((m = rx.exec(text)) !== null) {
        found.push({ vocabWord: word, start: m.index, end: m.index + m[0].length, original: m[0] });
      }
    }
    found.sort((a, b) => a.start - b.start);
    const clean = [];
    let lastEnd = 0;
    for (const f of found) {
      if (f.start >= lastEnd) { clean.push(f); lastEnd = f.end; }
    }
    return clean;
  }

  /* ── Detect vocab words in text (from vocabData only) ── */
  function detectVocabInText(text) {
    if (!vocabData.length || !text) return [];
    const vocabWords = vocabData.map(v => ({ word: v.word, lc: v.word.toLowerCase() }));
    vocabWords.sort((a, b) => b.word.length - a.word.length);
    const found = [];
    for (const vw of vocabWords) {
      const rx = new RegExp('\\b' + escRx(vw.word) + '\\b', 'gi');
      let m;
      while ((m = rx.exec(text)) !== null) {
        found.push({ vocabWord: vw.word, start: m.index, end: m.index + m[0].length, original: m[0] });
      }
    }
    found.sort((a, b) => a.start - b.start);
    const clean = [];
    let lastEnd = 0;
    for (const f of found) {
      if (f.start >= lastEnd) { clean.push(f); lastEnd = f.end; }
    }
    return clean;
  }

  /* ── Render highlighted story ── */
  function renderStoryHighlighted(text, matches) {
    if (!matches) matches = getActiveStoryMarkedWords(text);
    let html = '', pos = 0;
    for (const m of matches) {
      html += esc(text.slice(pos, m.start));
      const inVocab = vocabData.some(v => v.word.toLowerCase() === m.vocabWord.toLowerCase());
      const cls = inVocab ? 'story-vocab-word story-vocab-known' : 'story-vocab-word';
      html += '<span class="' + cls + '" data-word="' + escAttr(m.vocabWord) + '" onclick="showStoryWordInfo(this)">' + esc(m.original) + '</span>';
      pos = m.end;
    }
    html += esc(text.slice(pos));
    return html.replace(/\n/g, '<br>');
  }

  /* ── Render fill-in-the-blank quiz ── */
  function renderStoryQuizHTML(text, matches) {
    if (!matches) matches = getActiveStoryMarkedWords(text);
    let html = '', pos = 0;
    const answers = [];
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      html += esc(text.slice(pos, m.start));
      const w = m.original.length;
      const inputW = Math.max(5, Math.min(14, w + 2));
      // First-letter hint for longer words
      const hint = w > 4 ? m.original[0] + '·'.repeat(Math.min(w - 1, 5)) : '·'.repeat(Math.min(w, 6));
      html += '<input type="text" class="story-blank-input" data-idx="' + i + '" style="width:' + inputW + 'ch" placeholder="' + hint + '" autocomplete="off" spellcheck="false"/>';
      answers.push({ word: m.original, original: m.original });
      pos = m.end;
    }
    html += esc(text.slice(pos));
    return { html: html.replace(/\n/g, '<br>'), answers };
  }

  /* ── Word info tooltip ── */
  const _dictCache = {}; // cache dictionary API lookups

  function buildTooltipHTML(info) {
    let html = '<div style="max-width:320px">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">';
    html += '<span style="font-size:1rem;font-weight:700;color:#4f46e5">' + esc(info.word) + '</span>';
    if (info.phonetics) html += '<span style="font-size:0.7rem;color:#9ca3af">' + esc(info.phonetics) + '</span>';
    html += '<button onclick="speakWord(\'' + escAttr(info.word) + '\',this)" class="speaker-btn speaker-btn-sm" style="margin-left:auto"><i class="fa-solid fa-volume-high"></i></button>';
    html += '<button onclick="hideStoryTooltip()" style="color:#cbd5e1;cursor:pointer;background:none;border:none;font-size:0.8rem"><i class="fa-solid fa-xmark"></i></button>';
    html += '</div>';
    if (info.partOfSpeech) html += '<p style="font-size:0.65rem;color:#a78bfa;font-weight:600;margin-bottom:2px;font-style:italic">' + esc(info.partOfSpeech) + '</p>';
    html += '<p style="font-size:0.8125rem;color:#374151;margin-bottom:4px">' + esc(info.definition) + '</p>';
    if (info.synonyms && info.synonyms.trim() && info.synonyms.trim() !== '—')
      html += '<p style="font-size:0.7rem;color:#9ca3af"><b style="color:#6b7280">Syn:</b> ' + esc(info.synonyms) + '</p>';
    if (info.example)
      html += '<p style="font-size:0.7rem;color:#9ca3af;margin-top:4px;font-style:italic">"' + esc(info.example) + '"</p>';
    else if (info.context && info.context.trim())
      html += '<p style="font-size:0.7rem;color:#9ca3af;margin-top:4px;font-style:italic">' + esc(info.context) + '</p>';
    if (info.source) html += '<p style="font-size:0.6rem;color:#d1d5db;margin-top:4px">' + info.source + '</p>';
    html += '</div>';
    return html;
  }

  function positionTooltipNear(el) {
    const tooltip = $('storyTooltip');
    const rect = el.getBoundingClientRect();
    let top = rect.bottom + 8, left = rect.left;
    if (top + 220 > window.innerHeight) top = rect.top - 200;
    if (left + 340 > window.innerWidth) left = window.innerWidth - 350;
    if (left < 10) left = 10;
    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
  }

  window.showStoryWordInfo = function(el) {
    const wordStr = el.dataset.word;
    const lc = wordStr.toLowerCase();
    const item = vocabData.find(v => v.word.toLowerCase() === lc);
    const tooltip = $('storyTooltip');

    // If word is in vocabData, show immediately
    if (item) {
      tooltip.innerHTML = buildTooltipHTML({
        word: item.word, phonetics: item.phonetics, definition: item.definition,
        synonyms: item.synonyms, context: item.context,
        source: '<span style="color:#22c55e"><i class="fa-solid fa-bookmark" style="font-size:0.55rem"></i> In your vocab list</span>'
      });
      tooltip.classList.remove('hidden');
      positionTooltipNear(el);
      return;
    }

    // Check dictionary cache
    if (_dictCache[lc]) {
      tooltip.innerHTML = buildTooltipHTML(_dictCache[lc]);
      tooltip.classList.remove('hidden');
      positionTooltipNear(el);
      return;
    }

    // Show loading, then fetch from free dictionary API
    tooltip.innerHTML = '<div style="max-width:320px;padding:4px">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
      '<span style="font-size:1rem;font-weight:700;color:#4f46e5">' + esc(wordStr) + '</span>' +
      '<button onclick="speakWord(\'' + escAttr(wordStr) + '\',this)" class="speaker-btn speaker-btn-sm" style="margin-left:auto"><i class="fa-solid fa-volume-high"></i></button>' +
      '<button onclick="hideStoryTooltip()" style="color:#cbd5e1;cursor:pointer;background:none;border:none;font-size:0.8rem"><i class="fa-solid fa-xmark"></i></button>' +
      '</div>' +
      '<p style="font-size:0.75rem;color:#9ca3af"><i class="fa-solid fa-spinner fa-spin" style="margin-right:4px"></i>Looking up...</p></div>';
    tooltip.classList.remove('hidden');
    positionTooltipNear(el);

    fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(lc))
      .then(r => r.ok ? r.json() : Promise.reject('not found'))
      .then(data => {
        const entry = data[0] || {};
        const phonetic = (entry.phonetics || []).find(p => p.text) || {};
        const meaning = (entry.meanings || [])[0] || {};
        const def = ((meaning.definitions || [])[0] || {});
        const syns = (meaning.synonyms || []).slice(0, 5).join(', ');
        const info = {
          word: wordStr, phonetics: phonetic.text || '', partOfSpeech: meaning.partOfSpeech || '',
          definition: def.definition || 'No definition found.', synonyms: syns, example: def.example || '',
          source: '<span style="color:#6366f1"><i class="fa-solid fa-globe" style="font-size:0.55rem"></i> Dictionary API</span>'
        };
        _dictCache[lc] = info;
        if (!tooltip.classList.contains('hidden')) { tooltip.innerHTML = buildTooltipHTML(info); positionTooltipNear(el); }
      })
      .catch(() => {
        const info = {
          word: wordStr, phonetics: '', definition: 'Definition not available.',
          source: '<a href="https://www.google.com/search?q=define+' + encodeURIComponent(wordStr) + '" target="_blank" style="color:#6366f1;text-decoration:underline;font-size:0.65rem"><i class="fa-solid fa-magnifying-glass" style="font-size:0.55rem"></i> Search Google</a>'
        };
        _dictCache[lc] = info;
        if (!tooltip.classList.contains('hidden')) { tooltip.innerHTML = buildTooltipHTML(info); positionTooltipNear(el); }
      });
  };

  window.hideStoryTooltip = function() { $('storyTooltip').classList.add('hidden'); };

  /* ── Quiz check ── */
  window.checkStoryQuiz = function() {
    const inputs = $('storyQuizContent').querySelectorAll('.story-blank-input');
    let correct = 0;
    inputs.forEach((inp, i) => {
      const answer = storyQuizAnswers[i];
      if (!answer) return;
      const ok = inp.value.trim().toLowerCase() === answer.word.toLowerCase();
      inp.classList.remove('correct','wrong');
      if (ok) { inp.classList.add('correct'); correct++; }
      else { inp.classList.add('wrong'); inp.title = 'Answer: ' + answer.word; }
    });
    const total = storyQuizAnswers.length;
    const pct = total > 0 ? Math.round(correct / total * 100) : 0;
    $('storyQuizScore').innerHTML = '<span class="text-green-600"><i class="fa-solid fa-check mr-1"></i>' + correct + '</span> / ' + total + ' <span class="text-gray-400">(' + pct + '%)</span>';
    if (correct === total && total > 0) toast('Perfect! All blanks correct! 🎉', 'success');
  };

  window.revealStoryAnswers = function() {
    const inputs = $('storyQuizContent').querySelectorAll('.story-blank-input');
    inputs.forEach((inp, i) => {
      const answer = storyQuizAnswers[i];
      if (answer && !inp.value.trim()) {
        inp.value = answer.word;
        inp.classList.add('correct');
      }
    });
  };

  /* ── Save / Load / Delete stories ── */
  window.saveCurrentStory = function() {
    const title = $('storyTitleInput').value.trim();
    const text = $('storyTextInput').value.trim();
    if (!text) { toast('Write a story first.', 'info'); return; }
    const name = title || 'Untitled Story';
    const stories = loadStories();
    const existing = stories.findIndex(s => s.title === name);
    if (existing >= 0) {
      stories[existing].text = text;
      stories[existing].updated = Date.now();
    } else {
      stories.unshift({ title: name, text: text, created: Date.now() });
    }
    saveStories(stories);
    refreshStorySavedDropdown();
    toast('Story saved! 📖', 'success');
  };

  window.loadSavedStory = function() {
    const idx = parseInt($('storySavedSelect').value);
    if (isNaN(idx)) return;
    const stories = loadStories();
    if (!stories[idx]) return;
    $('storyTitleInput').value = stories[idx].title;
    $('storyTextInput').value = stories[idx].text;
    // Load knhl-marked words if available
    activeStoryWords = (stories[idx].words || []).map(w => ({ word: w }));
    switchStoryMode('edit');
    updateStoryWordCount();
    renderStoryWordBank();
  };

  window.deleteCurrentStory = function() {
    const idx = parseInt($('storySavedSelect').value);
    if (isNaN(idx)) { toast('Select a saved story first.', 'info'); return; }
    const stories = loadStories();
    if (!stories[idx]) return;
    if (!confirm('Delete "' + stories[idx].title + '"?')) return;
    stories.splice(idx, 1);
    saveStories(stories);
    refreshStorySavedDropdown();
    toast('Story deleted.', 'info');
  };

  function refreshStorySavedDropdown() {
    const sel = $('storySavedSelect');
    const stories = loadStories();
    sel.innerHTML = '<option value="">\ud83d\udcc1 Saved (' + stories.length + ')...</option>';
    stories.forEach((s, i) => { sel.innerHTML += '<option value="' + i + '">' + esc(s.title) + '</option>'; });
  }

  /* ── Word bank ── */
  function renderStoryWordBank() {
    const list = $('storyWordBankList');
    if (!list) return;
    if (!vocabData.length) { list.innerHTML = '<p class="text-xs text-gray-400">Load vocabulary first.</p>'; return; }
    const text = ($('storyTextInput') ? $('storyTextInput').value : '').toLowerCase();
    list.innerHTML = vocabData.map(v => {
      const used = text.includes(v.word.toLowerCase());
      return '<div class="story-wb-item' + (used ? ' used' : '') + '" onclick="insertStoryWord(\'' + escAttr(v.word) + '\')" title="' + escAttr(v.definition) + '">' + esc(v.word) + '</div>';
    }).join('');
  }

  window.insertStoryWord = function(word) {
    const ta = $('storyTextInput');
    if ($('storyEditPanel').classList.contains('hidden')) { switchStoryMode('edit'); }
    const pos = ta.selectionStart || ta.value.length;
    const before = ta.value.slice(0, pos);
    const after = ta.value.slice(pos);
    const space = (before.length && !before.endsWith(' ') && !before.endsWith('\n')) ? ' ' : '';
    ta.value = before + space + word + ' ' + after;
    ta.focus();
    ta.selectionStart = ta.selectionEnd = pos + space.length + word.length + 1;
    updateStoryWordCount();
    renderStoryWordBank();
  };

  function updateStoryWordCount() {
    const el = $('storyWordCount');
    if (!el) return;
    const text = $('storyTextInput').value;
    const matches = getActiveStoryMarkedWords(text);
    const inVocab = matches.filter(m => vocabData.some(v => v.word.toLowerCase() === m.vocabWord.toLowerCase())).length;
    if (matches.length > 0 && inVocab > 0) {
      el.innerHTML = '<span class="text-purple-500 font-semibold">' + matches.length + '</span> highlighted words · <span class="text-green-500">' + inVocab + '</span> in your vocab';
    } else if (matches.length > 0) {
      el.textContent = matches.length + ' highlighted word' + (matches.length !== 1 ? 's' : '') + ' detected';
    } else {
      el.textContent = '0 highlighted words';
    }
  }

  /* Close tooltip on click outside */
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.story-vocab-word') && !e.target.closest('#storyTooltip')) {
      hideStoryTooltip();
    }
  });

  /* ── Fetch stories from kndict.com ── */
  const CORS_PROXIES = [
    url => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
    url => 'https://corsproxy.io/?' + encodeURIComponent(url),
  ];

  async function fetchWithProxy(url) {
    for (const mkUrl of CORS_PROXIES) {
      try {
        const resp = await fetch(mkUrl(url));
        if (resp.ok) return await resp.text();
      } catch (e) { /* try next proxy */ }
    }
    throw new Error('All CORS proxies failed. Try again later.');
  }

  window.fetchStoryList = async function() {
    const baseUrl = $('storyFetchUrl').value.trim().replace(/\/page\/\d+\/?$/, '').replace(/\/$/, '');
    if (!baseUrl) { toast('Enter a kndict.com URL.', 'info'); return; }
    const page = parseInt($('storyFetchPage').value) || 1;
    const url = page <= 1 ? baseUrl : baseUrl + '/page/' + page;

    const btn = $('storyFetchBtn');
    const status = $('storyFetchStatus');
    const listEl = $('storyFetchList');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải...';
    status.classList.remove('hidden');
    status.textContent = 'Đang fetch danh sách truyện...';
    listEl.classList.add('hidden');

    try {
      const html = await fetchWithProxy(url);
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // Collect story links
      const seen = new Set();
      const storyLinks = [];
      doc.querySelectorAll('a[href*="/truyen-chem/"]').forEach(a => {
        const href = a.getAttribute('href');
        const text = a.textContent.trim();
        if (!href || !href.endsWith('.html') || !text || text.length < 3) return;
        const full = href.startsWith('http') ? href : 'https://kndict.com' + href;
        if (seen.has(full)) return;
        seen.add(full);
        storyLinks.push({ url: full, title: text });
      });

      if (storyLinks.length === 0) {
        // Maybe single story page — extract directly
        const storyText = extractStoryContent(doc);
        if (storyText) {
          const title = doc.querySelector('h1') ? doc.querySelector('h1').textContent.trim() : 'Kndict Story';
          importFetchedStory(title, storyText);
          status.innerHTML = '<i class="fa-solid fa-check text-green-500"></i> Đã import: <b>' + esc(title) + '</b>';
          toast('Story imported: ' + title, 'success');
        } else {
          status.textContent = '❌ Không tìm thấy truyện ở URL này.';
        }
      } else {
        // Auto-increment page for next fetch
        const pageInput = $('storyFetchPage');
        pageInput.value = (parseInt(pageInput.value) || 1) + 1;
        // Show list with import-all + individual buttons
        status.innerHTML = '<b>' + storyLinks.length + '</b> truyện tìm thấy (trang ' + page + '). Click để import:';
        listEl.classList.remove('hidden');
        let btnsHTML = '<button onclick="fetchAllStories(this)" class="w-full mb-2 px-3 py-2.5 rounded-lg text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 transition flex items-center gap-2 justify-center">' +
          '<i class="fa-solid fa-cloud-arrow-down"></i> Import tất cả ' + storyLinks.length + ' truyện</button>';
        btnsHTML += '<div id="storyFetchItems" class="space-y-1">';
        storyLinks.forEach((s, i) => {
          btnsHTML += '<button data-fetch-url="' + escAttr(s.url) + '" data-fetch-title="' + escAttr(s.title) + '" ' +
            'onclick="fetchSingleStory(this)" ' +
            'class="story-fetch-item w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-purple-100 transition flex items-center gap-2 border border-transparent hover:border-purple-200">' +
            '<i class="fa-solid fa-book-open text-purple-400 text-xs"></i> <span class="flex-1 truncate">' + esc(s.title) + '</span>' +
            '</button>';
        });
        btnsHTML += '</div>';
        listEl.innerHTML = btnsHTML;
      }
    } catch (e) {
      status.textContent = '❌ Lỗi: ' + e.message;
      console.error('[Fetch story]', e);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-download"></i> Fetch';
    }
  };

  window.fetchSingleStory = async function(btnEl) {
    const url = btnEl.dataset.fetchUrl;
    const title = btnEl.dataset.fetchTitle;
    btnEl.disabled = true;
    const origHTML = btnEl.innerHTML;
    btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-purple-400 text-xs"></i> Đang tải...';
    try {
      const html = await fetchWithProxy(url);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const text = extractStoryContent(doc);
      const storyTitle = title || (doc.querySelector('h1') ? doc.querySelector('h1').textContent.trim() : 'Kndict Story');
      if (text) {
        importFetchedStory(storyTitle, text);
        btnEl.innerHTML = '<i class="fa-solid fa-check text-green-500 text-xs"></i> <span class="flex-1 truncate">' + esc(storyTitle) + '</span> <span class="text-green-500 text-xs">✓</span>';
        btnEl.classList.add('bg-green-50');
      } else {
        btnEl.innerHTML = '<i class="fa-solid fa-xmark text-red-400 text-xs"></i> <span class="flex-1 truncate">' + esc(title) + '</span> <span class="text-red-400 text-xs">(trống)</span>';
      }
    } catch (e) {
      btnEl.innerHTML = '<i class="fa-solid fa-xmark text-red-400 text-xs"></i> Lỗi';
      console.error('[Fetch single]', e);
    }
  };

  window.fetchAllStories = async function(btnEl) {
    const items = document.querySelectorAll('#storyFetchItems .story-fetch-item');
    if (!items.length) return;
    btnEl.disabled = true;
    btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang import 0/' + items.length + '...';
    let done = 0;
    for (const item of items) {
      if (item.classList.contains('bg-green-50')) { done++; continue; } // already imported
      await fetchSingleStory(item);
      done++;
      btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang import ' + done + '/' + items.length + '...';
    }
    btnEl.innerHTML = '<i class="fa-solid fa-check text-white"></i> Đã import ' + done + ' truyện!';
    btnEl.classList.replace('bg-purple-600', 'bg-green-600');
    toast('Đã import ' + done + ' truyện từ Kndict! 📚', 'success');
    refreshStorySavedDropdown();
  };

  function extractStoryContent(doc) {
    // ── 1. Try kndict's dedicated story-content container ──
    let container = doc.querySelector('#story-content') || doc.querySelector('.story-content');

    // ── 2. Extract <span class="knhl"> marked words (kndict highlights) ──
    const markedWords = [];
    if (container) {
      container.querySelectorAll('span.knhl').forEach(sp => {
        const w = sp.textContent.trim();
        if (w) markedWords.push(w);
      });
    }

    // ── 3. If no kndict container, fall back to generic selectors ──
    if (!container) {
      const selectors = ['.entry-content', '.post-content', 'article .content', '.single-content', 'article'];
      for (const sel of selectors) {
        container = doc.querySelector(sel);
        if (container) break;
      }
    }
    if (!container) container = doc.body;
    if (!container) return null;

    // ── 4. Walk the DOM and build plain text, preserving paragraph breaks ──
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = node.tagName.toLowerCase();
          if (['script','style','nav','footer','aside','header'].includes(tag)) return NodeFilter.FILTER_REJECT;
          const cls = (node.className || '').toString().toLowerCase();
          if (cls.includes('related') || cls.includes('comment') || cls.includes('author-box') || cls.includes('sidebar') || cls.includes('navigation') || cls.includes('vocab-list')) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const blocks = [];
    let current = '';
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        current += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        if (['p','br','div','h1','h2','h3','h4','h5','h6','li'].includes(tag)) {
          if (current.trim()) blocks.push(current.trim());
          current = '';
        }
      }
    }
    if (current.trim()) blocks.push(current.trim());

    let text = blocks.join('\n');

    // ── 5. Clean up kndict-specific noise ──
    const vocabIdx = text.indexOf('Từ vựng trong bài');
    if (vocabIdx > 0) text = text.slice(0, vocabIdx);
    text = text.replace(/\/?\s*Tác giả:.*$/s, '');
    const commentIdx = text.indexOf('Bình luận');
    if (commentIdx > 0) text = text.slice(0, commentIdx);
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    // Remove duplicate title at start
    const h1 = doc.querySelector('h1');
    if (h1) {
      const titleText = h1.textContent.trim();
      if (text.startsWith(titleText)) text = text.slice(titleText.length).trim();
      const titleRx = new RegExp('^\\d*\\s*' + escRx(titleText), 'i');
      text = text.replace(titleRx, '').trim();
    }
    text = text.replace(/^\d+\s*/, '');

    if (text.length <= 50) return null;

    // ── 6. Return object with text + unique marked words ──
    const uniqueWords = [...new Set(markedWords)];
    return { text, words: uniqueWords };
  }

  function importFetchedStory(title, result) {
    const text = typeof result === 'string' ? result : result.text;
    const words = typeof result === 'string' ? [] : (result.words || []);
    const stories = loadStories();
    const existing = stories.findIndex(s => s.title === title);
    if (existing >= 0) {
      stories[existing].text = text;
      stories[existing].words = words;
      stories[existing].updated = Date.now();
    } else {
      stories.unshift({ title: title, text: text, words: words, created: Date.now(), source: 'kndict' });
    }
    saveStories(stories);
    refreshStorySavedDropdown();

    // Also set active story in memory so Read/Fill Blanks work immediately
    activeStoryWords = words.map(w => ({ word: w }));
    $('storyTitleInput').value = title;
    $('storyTextInput').value = text;
    updateStoryWordCount();
    renderStoryWordBank();
    // Auto-select this story in dropdown
    const newIdx = existing >= 0 ? existing : 0;
    $('storySavedSelect').value = '' + newIdx;
  }

  /* ━━━━━━━━━ CUSTOM WORD SETS ━━━━━━━━━ */
  const SETS_KEY = 'vocabLearnerSets';

  function loadSets() {
    try {
      const d = localStorage.getItem(SETS_KEY);
      return d ? JSON.parse(d) : [];
    } catch (_) { return []; }
  }
  function saveSets(sets) {
    localStorage.setItem(SETS_KEY, JSON.stringify(sets));
  }

  function refreshSetDropdown() {
    const sel = $('awTargetSet');
    if (!sel) return;
    const sets = loadSets();
    // keep the first option (_current), remove the rest
    while (sel.options.length > 1) sel.remove(1);
    sets.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = 'set_' + i;
      opt.textContent = s.name + ' (' + s.words.length + ' words)';
      sel.appendChild(opt);
    });
  }

  /* ━━━━━━━━━ ADD WORD MODAL ━━━━━━━━━ */
  window.openAddWordModal = function() {
    refreshSetDropdown();
    switchAddWordTab('manual');
    $('addWordModal').classList.remove('hidden');
    setTimeout(() => $('awWord').focus(), 100);
  };
  window.closeAddWordModal = function() {
    $('addWordModal').classList.add('hidden');
  };

  /* ── Add Word tab switcher ── */
  window.switchAddWordTab = function(tab) {
    const isImport = tab === 'import';
    // Panels
    $('awManualPanel').classList.toggle('hidden', isImport);
    $('awImportPanel').classList.toggle('hidden', !isImport);
    // Footers
    $('awManualFooter').classList.toggle('hidden', isImport);
    $('awImportFooter').classList.toggle('hidden', !isImport);
    // Tab active style
    $('awTabManual').classList.toggle('aw-tab-active', !isImport);
    $('awTabImport').classList.toggle('aw-tab-active', isImport);
  };

  /* ── Import & Merge state ── */
  let _pendingMergeWords = null;

  window.handleMergeFileSelect = function(e) {
    const file = e.target.files[0];
    if (file) processMergeFile(file);
    e.target.value = '';
  };
  window.handleMergeFileDrop = function(e) {
    const file = e.dataTransfer.files[0];
    if (file) processMergeFile(file);
  };

  function processMergeFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv','xlsx','xls'].includes(ext)) {
      toast('Please use a .csv, .xlsx or .xls file.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        let json;
        if (ext === 'csv') {
          json = parseCSV(e.target.result);
        } else {
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        }
        if (!json || !json.length) { toast('No data found in file.', 'error'); return; }
        const parsed = parseMergeJSON(json);
        if (!parsed) return;
        showMergePreview(file.name, parsed);
      } catch(err) {
        toast('Could not read file: ' + err.message, 'error');
      }
    };
    if (ext === 'csv') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  }

  function parseMergeJSON(json) {
    const norm = s => String(s).trim().toLowerCase();
    const cm = {};
    for (const key of Object.keys(json[0])) {
      const n = norm(key);
      if (n === 'word')                                                               cm.word = key;
      else if (n === 'collocations' || n === 'collocation' || n === 'vietnamese' || n === 'tiếng việt' || n === 'tieng viet') cm.collocations = key;
      else if (n === 'phonetics' || n === 'phonetic' || n === 'pronunciation')        cm.phonetics = key;
      else if (n === 'definition')       cm.definition = key;
      else if (n === 'synonyms')         cm.synonyms = key;
      else if (n === 'antonyms')         cm.antonyms = key;
      else if (n.includes('context') || n.includes('example')) cm.context = key;
    }
    if (!cm.word || !cm.definition) {
      toast('Missing required columns: "Word" and "Definition".', 'error');
      return null;
    }
    return json.map(r => ({
      word:         String(r[cm.word]         || '').trim(),
      collocations: String(r[cm.collocations] || '').trim(),
      phonetics:    String(r[cm.phonetics]    || '').trim(),
      definition:   String(r[cm.definition]   || '').trim(),
      synonyms:     String(r[cm.synonyms]     || '').trim(),
      antonyms:     String(r[cm.antonyms]     || '').trim(),
      context:      String(r[cm.context]      || '').trim(),
    })).filter(r => r.word && r.definition);
  }

  function showMergePreview(fileName, parsed) {
    const existingWords = new Set(vocabData.map(w => w.word.toLowerCase()));
    const newWords  = parsed.filter(r => !existingWords.has(r.word.toLowerCase()));
    const dupCount  = parsed.length - newWords.length;
    _pendingMergeWords = newWords;

    $('awMergeFileName').textContent = fileName;
    $('awMergeTotalCount').textContent = parsed.length;
    $('awMergeDupCount').textContent = dupCount;
    $('awMergeNewCount').textContent = newWords.length;
    $('awMergePreview').classList.remove('hidden');
    $('awDropZone').classList.add('hidden');
    $('awConfirmMergeBtn').disabled = newWords.length === 0;
  }

  window.resetMergePanel = function() {
    _pendingMergeWords = null;
    $('awMergePreview').classList.add('hidden');
    $('awDropZone').classList.remove('hidden');
    $('awConfirmMergeBtn').disabled = true;
  };

  window.confirmMergeImport = function() {
    if (!_pendingMergeWords || !_pendingMergeWords.length) return;
    vocabData.push(..._pendingMergeWords);
    localStorage.setItem(LS_KEY, JSON.stringify(vocabData));
    rebuildFcOrder();
    renderTable();
    $('wordCountText').textContent = vocabData.length + ' words';
    const qTo = $('quizRangeTo');
    if (qTo) { qTo.max = vocabData.length; qTo.placeholder = vocabData.length; }
    const added = _pendingMergeWords.length;
    _pendingMergeWords = null;
    closeAddWordModal();
    toast(`Merged ${added} new word${added !== 1 ? 's' : ''} into your vocabulary!`, 'success');
  };
  window.clearAddWordForm = function() {
    ['awWord','awDefinition','awPhonetics','awCollocations','awSynonyms','awAntonyms','awContext'].forEach(id => { $( id).value = ''; });
  };

  window.saveAddWord = function() {
    const word = ($('awWord').value || '').trim();
    const definition = ($('awDefinition').value || '').trim();
    if (!word || !definition) { toast('Word and Definition are required.', 'error'); return; }

    const entry = {
      word,
      collocations: ($('awCollocations').value || '').trim(),
      phonetics:    ($('awPhonetics').value || '').trim(),
      definition,
      synonyms:     ($('awSynonyms').value || '').trim(),
      antonyms:     ($('awAntonyms').value || '').trim(),
      context:      ($('awContext').value || '').trim(),
    };

    const target = $('awTargetSet').value;

    if (target === '_current') {
      // Check duplicate
      const dup = vocabData.some(v => v.word.toLowerCase().trim() === word.toLowerCase().trim());
      if (dup) { toast('"' + word + '" already exists in current vocabulary.', 'error'); return; }
      vocabData.push(entry);
      localStorage.setItem(LS_KEY, JSON.stringify(vocabData));
      rebuildFcOrder();
      renderTable();
      $('wordCountText').textContent = vocabData.length + ' words';
      // Update quiz range
      const qTo = $('quizRangeTo');
      if (qTo) { qTo.max = vocabData.length; qTo.placeholder = vocabData.length; }
      toast('"' + word + '" added to current vocabulary!', 'success');
    } else {
      // Add to custom set
      const sets = loadSets();
      const idx = parseInt(target.replace('set_', ''));
      if (!sets[idx]) { toast('Set not found.', 'error'); return; }
      const dup = sets[idx].words.some(v => v.word.toLowerCase().trim() === word.toLowerCase().trim());
      if (dup) { toast('"' + word + '" already exists in "' + sets[idx].name + '".', 'error'); return; }
      sets[idx].words.push(entry);
      saveSets(sets);
      toast('"' + word + '" added to "' + sets[idx].name + '"!', 'success');
    }

    clearAddWordForm();
    closeAddWordModal();
  };

  window.promptNewSet = function() {
    const name = prompt('Enter a name for the new word set:');
    if (!name || !name.trim()) return;
    const sets = loadSets();
    const dup = sets.some(s => s.name.toLowerCase() === name.trim().toLowerCase());
    if (dup) { toast('A set with that name already exists.', 'error'); return; }
    sets.push({ name: name.trim(), words: [], created: new Date().toISOString() });
    saveSets(sets);
    refreshSetDropdown();
    // Select the new set
    const sel = $('awTargetSet');
    if (sel) sel.value = 'set_' + (sets.length - 1);
    toast('Set "' + name.trim() + '" created!', 'success');
  };

  /* ━━━━━━━━━ CUSTOM SETS MODAL ━━━━━━━━━ */
  window.openCustomSetsModal = function() {
    closeExportMenu();
    renderCustomSets();
    $('customSetsModal').classList.remove('hidden');
  };
  window.closeCustomSetsModal = function() {
    $('customSetsModal').classList.add('hidden');
  };
  window.createNewSetPrompt = function() {
    promptNewSet();
    renderCustomSets();
  };

  function renderCustomSets() {
    const sets = loadSets();
    const container = $('customSetsList');
    if (!container) return;

    // Show current vocab set first
    let html = '<div class="set-card border-brand-200 bg-brand-50/30">';
    html += '<div class="set-info">';
    html += '<span class="set-name text-brand-700"><i class="fa-solid fa-book-open mr-1"></i> Current Vocabulary</span>';
    html += '<span class="set-meta">' + vocabData.length + ' words · Active</span>';
    html += '</div>';
    html += '<div class="set-actions">';
    html += '<button onclick="exportSetCSV(\'_current\')" class="text-green-600 hover:bg-green-50" title="Export CSV"><i class="fa-solid fa-file-csv"></i></button>';
    html += '<button onclick="exportSetExcel(\'_current\')" class="text-emerald-600 hover:bg-emerald-50" title="Export Excel"><i class="fa-solid fa-file-excel"></i></button>';
    html += '</div></div>';

    if (!sets.length) {
      html += '<p class="text-center text-gray-400 py-6 text-sm"><i class="fa-solid fa-folder-open text-xl mb-2 block"></i>No custom sets yet. Create one to organize your words!</p>';
    } else {
      sets.forEach((s, i) => {
        const date = new Date(s.created).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
        html += '<div class="set-card">';
        html += '<div class="set-info">';
        html += '<span class="set-name"><i class="fa-solid fa-folder mr-1 text-brand-400"></i> ' + esc(s.name) + '</span>';
        html += '<span class="set-meta">' + s.words.length + ' words · Created ' + date + '</span>';
        html += '</div>';
        html += '<div class="set-actions">';
        html += '<button onclick="loadSetAsVocab(' + i + ')" class="text-brand-600 hover:bg-brand-50" title="Load & study"><i class="fa-solid fa-play"></i></button>';
        html += '<button onclick="mergeSetToCurrent(' + i + ')" class="text-amber-600 hover:bg-amber-50" title="Merge into current"><i class="fa-solid fa-code-merge"></i></button>';
        html += '<button onclick="exportSetCSV(\'set_' + i + '\')" class="text-green-600 hover:bg-green-50" title="Export CSV"><i class="fa-solid fa-file-csv"></i></button>';
        html += '<button onclick="exportSetExcel(\'set_' + i + '\')" class="text-emerald-600 hover:bg-emerald-50" title="Export Excel"><i class="fa-solid fa-file-excel"></i></button>';
        html += '<button onclick="deleteSet(' + i + ')" class="text-red-400 hover:bg-red-50" title="Delete set"><i class="fa-solid fa-trash-can"></i></button>';
        html += '</div></div>';
      });
    }
    container.innerHTML = html;
  }

  window.loadSetAsVocab = function(idx) {
    const sets = loadSets();
    if (!sets[idx] || !sets[idx].words.length) { toast('This set is empty.', 'error'); return; }
    loadData(sets[idx].words);
    localStorage.setItem(LS_KEY, JSON.stringify(sets[idx].words));
    closeCustomSetsModal();
    toast('Loaded "' + sets[idx].name + '" (' + sets[idx].words.length + ' words)', 'success');
  };

  window.mergeSetToCurrent = function(idx) {
    const sets = loadSets();
    if (!sets[idx] || !sets[idx].words.length) { toast('This set is empty.', 'error'); return; }
    let added = 0;
    sets[idx].words.forEach(w => {
      const dup = vocabData.some(v => v.word.toLowerCase().trim() === w.word.toLowerCase().trim());
      if (!dup) { vocabData.push(w); added++; }
    });
    if (added === 0) { toast('All words already exist in current vocabulary.', 'info'); return; }
    localStorage.setItem(LS_KEY, JSON.stringify(vocabData));
    rebuildFcOrder();
    renderTable();
    $('wordCountText').textContent = vocabData.length + ' words';
    const qTo = $('quizRangeTo');
    if (qTo) { qTo.max = vocabData.length; qTo.placeholder = vocabData.length; }
    toast('Merged ' + added + ' new words from "' + sets[idx].name + '"!', 'success');
  };

  window.deleteSet = function(idx) {
    const sets = loadSets();
    if (!sets[idx]) return;
    if (!confirm('Delete "' + sets[idx].name + '"? This cannot be undone.')) return;
    const name = sets[idx].name;
    sets.splice(idx, 1);
    saveSets(sets);
    renderCustomSets();
    toast('"' + name + '" deleted.', 'info');
  };

  /* ━━━━━━━━━ EXPORT ━━━━━━━━━ */
  window.toggleExportMenu = function() {
    const dd = $('exportDropdown');
    dd.classList.toggle('hidden');
    // Close when clicking outside
    if (!dd.classList.contains('hidden')) {
      setTimeout(() => {
        const handler = e => {
          if (!dd.contains(e.target) && !e.target.closest('#exportNavBtn')) {
            dd.classList.add('hidden');
            document.removeEventListener('click', handler);
          }
        };
        document.addEventListener('click', handler);
      }, 0);
    }
  };
  function closeExportMenu() {
    const dd = $('exportDropdown');
    if (dd) dd.classList.add('hidden');
  }

  function getSetWords(target) {
    if (target === '_current') return { words: vocabData, name: 'vocabulary' };
    const sets = loadSets();
    const idx = parseInt(target.replace('set_', ''));
    if (!sets[idx]) return null;
    return { words: sets[idx].words, name: sets[idx].name };
  }

  function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  function wordsToCSVString(words) {
    const headers = ['Word','Collocations','Phonetics','Definition','Synonyms','Antonyms','Context/Example'];
    const escape = v => {
      const s = String(v || '');
      return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = words.map(w => [
      escape(w.word), escape(w.collocations), escape(w.phonetics),
      escape(w.definition), escape(w.synonyms), escape(w.antonyms), escape(w.context)
    ].join(','));
    return headers.join(',') + '\n' + rows.join('\n');
  }

  window.exportCurrentCSV = function() {
    closeExportMenu();
    exportSetCSV('_current');
  };
  window.exportCurrentExcel = function() {
    closeExportMenu();
    exportSetExcel('_current');
  };

  window.exportSetCSV = function(target) {
    const data = getSetWords(target);
    if (!data || !data.words.length) { toast('No words to export.', 'error'); return; }
    const csv = wordsToCSVString(data.words);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
    const filename = data.name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.csv';
    downloadFile(blob, filename);
    toast('Exported ' + data.words.length + ' words as CSV!', 'success');
  };

  window.exportSetExcel = function(target) {
    const data = getSetWords(target);
    if (!data || !data.words.length) { toast('No words to export.', 'error'); return; }
    const rows = data.words.map(w => ({
      'Word': w.word, 'Collocations': w.collocations, 'Phonetics': w.phonetics,
      'Definition': w.definition, 'Synonyms': w.synonyms, 'Antonyms': w.antonyms,
      'Context/Example': w.context
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    // Auto-size columns
    ws['!cols'] = [
      {wch:20},{wch:25},{wch:15},{wch:40},{wch:25},{wch:25},{wch:45}
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vocabulary');
    const filename = data.name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.xlsx';
    XLSX.writeFile(wb, filename);
    toast('Exported ' + data.words.length + ' words as Excel!', 'success');
  };

  /* ━━━━━━━━━ ARTICLE READER — VOA Learning English ━━━━━━━━━ */

  const SAVED_ARTICLES_KEY = 'vocabLearnerSavedArticles';
  let readerTranslationsVisible = false;
  let currentArticle = null;   // { title, body, url, date, paragraphs, html }
  let readerArticlesCache = []; // fetched article list

  /* ── CORS Proxy Fallback Helper ── */
  function _fetchWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
  }

  async function fetchViaProxy(targetUrl) {
    /* Each entry: { build(url)->proxyUrl, parse(response)->text } */
    const proxies = [
      {
        name: 'allorigins',
        build: u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
        parse: async r => { const j = await r.json(); if (!j.contents) throw new Error('empty'); return j.contents; }
      },
      {
        name: 'corsproxy.io',
        build: u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        parse: r => r.text()
      },
      {
        name: 'corsproxy.org',
        build: u => `https://corsproxy.org/?${encodeURIComponent(u)}`,
        parse: r => r.text()
      },
    ];

    const errors = [];
    for (const proxy of proxies) {
      try {
        console.log(`[Reader] Trying ${proxy.name}…`);
        const r = await _fetchWithTimeout(proxy.build(targetUrl), 12000);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await proxy.parse(r);
        if (!text || text.length < 200) throw new Error('Response too short');
        console.log(`[Reader] ✓ ${proxy.name} succeeded (${text.length} chars)`);
        return text;
      } catch (err) {
        console.warn(`[Reader] ✗ ${proxy.name} failed:`, err.message);
        errors.push(`${proxy.name}: ${err.message}`);
        continue;
      }
    }

    throw new Error('All proxies failed — ' + errors.join('; '));
  }

  /* ── VOA Zone ID Mapping ── */
  const VOA_ZONES = {
    'all':                '',
    'arts-culture':       '986',
    'health-lifestyle':   '955',
    'science-technology': '1579',
    'us':                 '3521',
    'world':              '987',
  };

  /* ── Fetch VOA Article Feed ── */
  window.fetchVOAArticles = async function(category) {
    /* Update category button active state */
    document.querySelectorAll('.reader-cat-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === category);
    });

    const zoneId = VOA_ZONES[category] || '';
    const pageUrl = zoneId
      ? `https://learningenglish.voanews.com/z/${zoneId}`
      : 'https://learningenglish.voanews.com/';

    const listEl = $('readerArticleList');
    const loadEl = $('readerLoading');
    const viewEl = $('readerView');

    viewEl.classList.add('hidden');
    loadEl.classList.remove('hidden');
    listEl.innerHTML = '';

    try {
      const html = await fetchViaProxy(pageUrl);
      loadEl.classList.add('hidden');
      const articles = parseVOAPage(html);
      readerArticlesCache = articles;
      renderArticleList(articles);
    } catch (err) {
      loadEl.classList.add('hidden');
      console.error('VOA fetch error:', err);
      listEl.innerHTML = `<div class="text-center py-10 text-gray-400">
        <i class="fa-solid fa-triangle-exclamation text-2xl mb-2 block"></i>
        <p class="text-sm font-semibold">Could not load articles</p>
        <p class="text-xs mt-1">${esc(err.message)}</p>
        <button onclick="fetchVOAArticles('all')" class="mt-3 text-xs text-emerald-600 font-semibold hover:underline">Try again</button>
      </div>`;
    }
  };

  /* ── Parse VOA page HTML to extract article list ── */
  function parseVOAPage(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const articles = [];
    const seen = new Set();

    /* VOA pages list articles as links with pattern /a/slug/ID.html */
    const links = doc.querySelectorAll('a[href*="/a/"]');
    links.forEach(a => {
      const href = a.getAttribute('href') || '';
      /* Ensure it's a real article link */
      if (!href.match(/\/a\/[^/]+\/\d+\.html/)) return;
      const fullUrl = href.startsWith('http') ? href : 'https://learningenglish.voanews.com' + href;

      /* Deduplicate */
      if (seen.has(fullUrl)) return;

      /* Extract title — look for text content in the link or nearby heading */
      let title = '';
      const span = a.querySelector('span, h4, h3, h2');
      if (span) title = span.textContent.trim();
      if (!title) title = a.textContent.trim();
      /* Skip if title is too short (navigation links etc) */
      if (!title || title.length < 10) return;
      /* Skip duplicates by title too */
      if (articles.some(x => x.title === title)) return;

      seen.add(fullUrl);

      /* Try to find thumbnail image */
      let thumb = '';
      const img = a.querySelector('img');
      if (img) thumb = img.getAttribute('src') || img.getAttribute('data-src') || '';
      /* If the link is inside a container, look for nearby img */
      if (!thumb) {
        const parent = a.closest('.media-block, .content-wrap, li, div');
        if (parent) {
          const pImg = parent.querySelector('img');
          if (pImg) thumb = pImg.getAttribute('src') || pImg.getAttribute('data-src') || '';
        }
      }
      if (thumb && !thumb.startsWith('http')) thumb = 'https://learningenglish.voanews.com' + thumb;

      /* Try to find date */
      let pubDate = '';
      const parent = a.closest('.media-block, .content-wrap, li, div');
      if (parent) {
        const time = parent.querySelector('time, .date, span[class*="date"]');
        if (time) pubDate = time.textContent.trim() || time.getAttribute('datetime') || '';
      }

      articles.push({ title, link: fullUrl, excerpt: '', pubDate, thumb });
    });

    return articles.slice(0, 20);
  }

  /* ── Render Article List ── */
  function renderArticleList(articles) {
    const listEl = $('readerArticleList');
    if (!articles.length) {
      listEl.innerHTML = '<p class="text-center text-gray-400 py-8 text-sm">No articles found. Try another category.</p>';
      return;
    }

    /* Count vocab matches in excerpts for badges */
    const vocabSet = new Set(vocabData.map(v => v.word.toLowerCase().trim()));

    listEl.innerHTML = articles.map((a, i) => {
      const date = a.pubDate ? new Date(a.pubDate).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '';
      const words = a.excerpt.toLowerCase().split(/\W+/);
      const matchCount = words.filter(w => vocabSet.has(w)).length;
      const vocabBadge = matchCount > 0
        ? `<span class="article-vocab-badge"><i class="fa-solid fa-star"></i> ${matchCount} vocab</span>`
        : '';

      return `<div class="reader-article-card" onclick="openArticle(${i})">
        ${a.thumb ? `<img class="article-thumb" src="${escAttr(a.thumb)}" alt="" loading="lazy" onerror="this.style.display='none'"/>` : ''}
        <div class="article-info">
          <div class="article-title">${esc(a.title)}</div>
          <div class="article-excerpt">${esc(a.excerpt)}</div>
          <div class="article-meta">${date}${vocabBadge}</div>
        </div>
        <i class="fa-solid fa-chevron-right text-gray-300 flex-shrink-0 mt-3"></i>
      </div>`;
    }).join('');
  }

  /* ── Open Article ── */
  window.openArticle = function(idx) {
    const article = readerArticlesCache[idx];
    if (!article) return;
    loadArticleContent(article.link, article.title, article.pubDate);
  };

  /* ── Load Custom URL ── */
  window.loadCustomArticle = function() {
    const url = ($('readerCustomUrl').value || '').trim();
    if (!url) { toast('Please enter a URL.', 'error'); return; }
    if (!url.startsWith('http')) { toast('Invalid URL.', 'error'); return; }
    loadArticleContent(url, 'Custom Article', '');
  };

  /* ── Fetch & Render Full Article ── */
  async function loadArticleContent(url, fallbackTitle, pubDate) {
    const loadEl = $('readerLoading');
    const viewEl = $('readerView');
    const listEl = $('readerArticleList');

    loadEl.classList.remove('hidden');
    viewEl.classList.add('hidden');

    try {
      const html = await fetchViaProxy(url);
      loadEl.classList.add('hidden');

      const result = extractArticleContent(html, fallbackTitle);
      const title = result.title || fallbackTitle;
      const paragraphs = result.paragraphs;

      if (!paragraphs.length) {
        toast('Could not extract article content.', 'error');
        return;
      }

      listEl.innerHTML = '';
      displayArticle(title, paragraphs, url, pubDate);
    } catch (err) {
      loadEl.classList.add('hidden');
      console.error('Article fetch error:', err);
      toast('Error loading article: ' + err.message, 'error');
    }
  }

  /* ── Extract Article Content from HTML ── */
  function extractArticleContent(html, fallbackTitle) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    /* Try VOA-specific selectors first */
    let title = '';
    let paragraphs = [];

    /* VOA Learning English structure */
    const voaTitle = doc.querySelector('h1.title, .pg-title, h1');
    if (voaTitle) title = voaTitle.textContent.trim();

    const articleBody = doc.querySelector('.wsw, .article__body, article, .content-body, .post-content, main');
    if (articleBody) {
      const pEls = articleBody.querySelectorAll('p');
      pEls.forEach(p => {
        const text = p.textContent.trim();
        if (text.length > 20) paragraphs.push(text);
      });
    }

    /* Fallback: get all paragraphs */
    if (paragraphs.length < 2) {
      paragraphs = [];
      doc.querySelectorAll('p').forEach(p => {
        const text = p.textContent.trim();
        if (text.length > 30 && !text.includes('cookie') && !text.includes('subscribe'))
          paragraphs.push(text);
      });
    }

    return { title: title || fallbackTitle, paragraphs };
  }

  /* ── Display Article with Vocab Highlighting ── */
  function displayArticle(title, paragraphs, url, pubDate) {
    const viewEl = $('readerView');
    viewEl.classList.remove('hidden');

    $('readerTitle').textContent = title;
    const date = pubDate ? new Date(pubDate).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : '';
    $('readerMeta').textContent = date ? date + ' · VOA Learning English' : url;

    /* Build vocab lookup */
    const vocabMap = {};
    vocabData.forEach(v => { vocabMap[v.word.toLowerCase().trim()] = v; });

    let totalVocabFound = 0;
    const bodyEl = $('readerBody');
    let html = '';

    paragraphs.forEach((para, pi) => {
      let highlighted = escHtmlReader(para);

      /* Highlight vocab words — longest first to avoid partial matches */
      const sortedWords = Object.keys(vocabMap).sort((a, b) => b.length - a.length);
      for (const vw of sortedWords) {
        if (vw.length < 3) continue;
        const rx = new RegExp('\\b(' + escRx(vw) + ')\\b', 'gi');
        const before = highlighted;
        highlighted = highlighted.replace(rx, (m) => {
          return '<span class="reader-vocab-word" data-rdr-word="' + escAttr(vocabMap[vw].word) + '">' + m + '</span>';
        });
        if (highlighted !== before) totalVocabFound++;
      }

      html += `<p>${highlighted}
        <button class="reader-translate-btn" onclick="event.stopPropagation(); translateParagraph(${pi})" title="Translate to Vietnamese">
          <i class="fa-solid fa-language"></i> VI
        </button>
        <span class="reader-para-vi hidden" data-para-idx="${pi}"></span>
      </p>`;
    });

    bodyEl.innerHTML = html;
    readerTranslationsVisible = false;
    $('readerToggleLabel').textContent = 'Translate All';

    $('readerVocabCount').textContent = totalVocabFound > 0 ? totalVocabFound + ' vocab words found' : '';

    /* Store current */
    currentArticle = { title, paragraphs, url, date: pubDate, html: bodyEl.innerHTML };

    /* Attach tooltip events */
    attachReaderTooltips();

    /* Scroll into view */
    viewEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Count as read only when user reaches the end of the article
    watchReadScrollEnd('readerBody', 'reading');
  }

  function escHtmlReader(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  /* ── Vocab Tooltips ── */
  function attachReaderTooltips() {
    document.querySelectorAll('.reader-vocab-word').forEach(el => {
      el.addEventListener('mouseenter', showReaderTooltip);
      el.addEventListener('mouseleave', hideReaderTooltip);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const word = el.dataset.rdrWord || el.textContent.trim();
        speakWord(word);
      });
    });
  }

  function showReaderTooltip(e) {
    hideReaderTooltip();
    const el = e.currentTarget;
    const wordStr = (el.dataset.rdrWord || el.textContent).trim();
    const key = wordStr.toLowerCase();
    const found = vocabData.find(v => v.word.toLowerCase().trim() === key);
    if (!found) return;

    const lv = getSRSLevel(found.word);
    const tt = document.createElement('div');
    tt.className = 'reader-vocab-tooltip';
    tt.innerHTML = `
      <div><span class="rtt-word">${esc(found.word)}</span><span class="rtt-phonetics">${esc(found.phonetics || '')}</span></div>
      <div class="rtt-def">${esc(found.definition)}</div>
      ${found.collocations ? '<div style="margin-top:4px;font-size:0.7rem;color:#a7f3d0">\u{1f4dd} ' + esc(found.collocations) + '</div>' : ''}
      <div class="rtt-srs"><span class="srs-badge srs-${lv}" style="font-size:0.6rem">${srsLabel(lv)}</span></div>
    `;

    el.style.position = 'relative';
    el.appendChild(tt);

    requestAnimationFrame(() => {
      const rect = tt.getBoundingClientRect();
      if (rect.left < 8) { tt.style.left = '0'; tt.style.transform = 'none'; }
      if (rect.right > window.innerWidth - 8) {
        tt.style.left = 'auto';
        tt.style.right = '0';
        tt.style.transform = 'none';
      }
      if (rect.top < 8) {
        tt.style.bottom = 'auto';
        tt.style.top = 'calc(100% + 8px)';
      }
    });
  }

  function hideReaderTooltip() {
    document.querySelectorAll('.reader-vocab-tooltip').forEach(t => t.remove());
  }

  /* ── Translate Single Paragraph (MyMemory API — free, no key) ── */
  window.translateParagraph = async function(paraIdx) {
    const viEl = document.querySelector(`.reader-para-vi[data-para-idx="${paraIdx}"]`);
    if (!viEl) return;

    /* If already translated, just toggle */
    if (viEl.textContent.trim()) {
      viEl.classList.toggle('hidden');
      return;
    }

    const para = currentArticle?.paragraphs?.[paraIdx];
    if (!para) return;

    viEl.classList.remove('hidden');
    viEl.textContent = 'Translating...';

    try {
      /* MyMemory API: free, up to 5000 chars/day for anonymous, 10K with email */
      const text = para.substring(0, 500); // limit to avoid too-long queries
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|vi`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (data.responseData?.translatedText) {
        viEl.textContent = data.responseData.translatedText;
      } else {
        viEl.textContent = '(Translation unavailable)';
      }
    } catch (err) {
      console.error('Translation error:', err);
      viEl.textContent = '(Translation failed)';
    }
  };

  /* ── Translate All Paragraphs Toggle ── */
  window.toggleReaderTranslation = async function() {
    if (!currentArticle) return;

    readerTranslationsVisible = !readerTranslationsVisible;
    $('readerToggleLabel').textContent = readerTranslationsVisible ? 'Hide Translations' : 'Translate All';

    const viEls = document.querySelectorAll('.reader-para-vi');
    if (!readerTranslationsVisible) {
      viEls.forEach(el => el.classList.add('hidden'));
      return;
    }

    /* Show all and translate any that haven't been translated */
    for (const el of viEls) {
      el.classList.remove('hidden');
      if (!el.textContent.trim()) {
        const idx = parseInt(el.dataset.paraIdx);
        await translateParagraph(idx);
        /* Small delay to avoid rate limits */
        await new Promise(r => setTimeout(r, 300));
      }
    }
  };

  /* ── Read Article Aloud ── */
  let _speakQueue = [];
  let _speakIdx = 0;

  function _getVoice() {
    const voices = window.speechSynthesis.getVoices();
    return voices.find(v => v.lang === 'en-US' && v.name.includes('Samantha'))
        || voices.find(v => v.lang === 'en-US')
        || voices.find(v => v.lang.startsWith('en'))
        || null;
  }

  /* Ensure voices are loaded (async on most browsers) */
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }

  function _speakNext() {
    if (_speakIdx >= _speakQueue.length) {
      $('readerSpeakBtn').innerHTML = '<i class="fa-solid fa-volume-high mr-1"></i> Read Aloud';
      _speakQueue = [];
      _speakIdx = 0;
      return;
    }

    const utt = new SpeechSynthesisUtterance(_speakQueue[_speakIdx]);
    utt.lang = 'en-US';
    utt.rate = 0.85;
    utt.pitch = 1;
    const voice = _getVoice();
    if (voice) utt.voice = voice;

    utt.onend = () => { _speakIdx++; _speakNext(); };
    utt.onerror = (e) => {
      console.warn('Speech error on chunk', _speakIdx, e.error);
      _speakIdx++;
      _speakNext();
    };

    window.speechSynthesis.speak(utt);
  }

  window.speakArticle = function() {
    if (!window.speechSynthesis) { toast('Speech not supported in this browser.', 'error'); return; }

    /* Toggle off if already speaking */
    if (window.speechSynthesis.speaking || _speakQueue.length) {
      window.speechSynthesis.cancel();
      _speakQueue = [];
      _speakIdx = 0;
      $('readerSpeakBtn').innerHTML = '<i class="fa-solid fa-volume-high mr-1"></i> Read Aloud';
      return;
    }

    if (!currentArticle?.paragraphs?.length) {
      toast('No article loaded.', 'error');
      return;
    }

    /* Split into paragraph-sized chunks (avoids Chrome 15s kill bug) */
    _speakQueue = currentArticle.paragraphs.filter(p => p.trim().length > 0);
    _speakIdx = 0;

    if (!_speakQueue.length) { toast('Nothing to read.', 'error'); return; }

    $('readerSpeakBtn').innerHTML = '<i class="fa-solid fa-stop mr-1"></i> Stop Reading';
    _speakNext();
  };

  /* ── Close Reader View → back to list ── */
  window.closeReaderView = function() {
    $('readerView').classList.add('hidden');
    if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
    _speakQueue = [];
    _speakIdx = 0;
    /* Re-render list if we have cached articles */
    if (readerArticlesCache.length) renderArticleList(readerArticlesCache);
  };

  /* ── Save / Load Articles ── */
  function loadSavedArticles() {
    try {
      const d = localStorage.getItem(SAVED_ARTICLES_KEY);
      return d ? JSON.parse(d) : [];
    } catch (_) { return []; }
  }

  window.saveCurrentArticle = function() {
    if (!currentArticle) { toast('No article to save.', 'error'); return; }
    const saved = loadSavedArticles();
    /* Avoid duplicate by URL */
    if (saved.some(a => a.url === currentArticle.url)) {
      toast('Article already saved.', 'info');
      return;
    }
    saved.unshift({
      title: currentArticle.title,
      url: currentArticle.url,
      date: currentArticle.date,
      paragraphs: currentArticle.paragraphs,
      savedAt: new Date().toISOString()
    });
    if (saved.length > 30) saved.length = 30;
    localStorage.setItem(SAVED_ARTICLES_KEY, JSON.stringify(saved));
    renderSavedArticles();
    toast('Article saved!', 'success');
  };

  function renderSavedArticles() {
    const saved = loadSavedArticles();
    const list = $('readerSavedList');
    const clearBtn = $('clearArticlesBtn');
    if (!list) return;

    if (!saved.length) {
      list.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm"><i class="fa-regular fa-bookmark text-lg mb-2 block"></i>No saved articles yet.</p>';
      if (clearBtn) clearBtn.classList.add('hidden');
      return;
    }
    if (clearBtn) clearBtn.classList.remove('hidden');

    list.innerHTML = saved.map((a, i) => {
      const date = a.savedAt ? new Date(a.savedAt).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '';
      return `<div class="saved-article-card" onclick="loadSavedArticle(${i})">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <div class="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <i class="fa-solid fa-newspaper text-emerald-500 text-sm"></i>
          </div>
          <div style="min-width:0;flex:1">
            <div style="font-weight:700;font-size:0.85rem;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.title)}</div>
            <div style="font-size:0.7rem;color:#94a3b8">${a.paragraphs?.length || 0} paragraphs · Saved ${date}</div>
          </div>
        </div>
        <button onclick="event.stopPropagation(); deleteSavedArticle(${i})" class="text-gray-300 hover:text-red-500 transition p-1" title="Delete">
          <i class="fa-solid fa-trash-can text-xs"></i>
        </button>
      </div>`;
    }).join('');
  }

  window.loadSavedArticle = function(idx) {
    const saved = loadSavedArticles();
    if (!saved[idx]) return;
    const a = saved[idx];
    displayArticle(a.title, a.paragraphs, a.url, a.date);
  };

  window.deleteSavedArticle = function(idx) {
    const saved = loadSavedArticles();
    if (!saved[idx]) return;
    saved.splice(idx, 1);
    localStorage.setItem(SAVED_ARTICLES_KEY, JSON.stringify(saved));
    renderSavedArticles();
    toast('Article deleted.', 'info');
  };

  window.clearAllSavedArticles = function() {
    localStorage.removeItem(SAVED_ARTICLES_KEY);
    renderSavedArticles();
    toast('All saved articles cleared.', 'info');
  };

  /* ── Init Reader Tab ── */
  function initReaderTab() {
    renderSavedArticles();
    if (!readerArticlesCache.length) {
      fetchVOAArticles('all');
    }
  }

  /* ━━━━━━━━━ UTILITIES ━━━━━━━━━ */
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function escAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function toast(msg, type = 'info') {
    const colors = {
      success:'bg-green-50 text-green-700 border border-green-200',
      error:'bg-red-50 text-red-700 border border-red-200',
      info:'bg-blue-50 text-blue-700 border border-blue-200',
    };
    const icons = { success:'fa-circle-check', error:'fa-circle-exclamation', info:'fa-circle-info' };
    const el = document.createElement('div');
    el.className = 'toast ' + (colors[type] || colors.info);
    el.innerHTML = '<i class="fa-solid ' + (icons[type]||icons.info) + ' mr-2"></i>' + esc(msg);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }

  /* ━━━━━━━━━ DICTIONARY / TRANSLATE PANEL ━━━━━━━━━ */

  let dictLangPair = { from: 'en', to: 'vi', fromLabel: 'English', toLabel: 'Tiếng Việt' };
  let lastDictResult = null; // store last lookup for "add to vocab"
  let _dictEnabled = true;

  function setDictEnabled(on) {
    _dictEnabled = on;
    const fab = $('dictFab');
    if (fab) fab.style.display = on ? '' : 'none';
    if (!on) {
      // hide panel if open
      const panel = $('dictPanel');
      if (panel) panel.classList.add('hidden');
      if (fab)  fab.classList.remove('fab-open');
      // hide selection bubble
      const bubble = $('dictSelectionBubble');
      if (bubble) bubble.style.display = 'none';
    }
  }

  window.toggleDictPanel = function() {
    if (!_dictEnabled) return;
    const panel = $('dictPanel');
    const fab = $('dictFab');
    const isHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !isHidden);
    fab.classList.toggle('fab-open', isHidden);
    if (isHidden) {
      /* Focus the active input */
      const wordMode = !$('dictWordMode').classList.contains('hidden');
      if (wordMode) $('dictWordInput').focus();
      else $('dictTranslateInput').focus();
    }
  };

  window.setDictMode = function(mode) {
    $('dictModeWord').classList.toggle('active', mode === 'word');
    $('dictModeTranslate').classList.toggle('active', mode === 'translate');
    $('dictWordMode').classList.toggle('hidden', mode !== 'word');
    $('dictTranslateMode').classList.toggle('hidden', mode !== 'translate');
    if (mode === 'word') $('dictWordInput').focus();
    else $('dictTranslateInput').focus();
  };

  /* ── Word Lookup (Free Dictionary API) ── */
  window.lookupWord = async function() {
    const word = ($('dictWordInput').value || '').trim().toLowerCase();
    if (!word) return;

    const resultEl = $('dictWordResult');
    resultEl.innerHTML = '<div class="dict-loading"><div class="spinner"></div><span class="text-xs text-gray-400">Looking up…</span></div>';

    try {
      const resp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!resp.ok) {
        if (resp.status === 404) {
          resultEl.innerHTML = `<div class="dict-placeholder"><i class="fa-solid fa-face-frown text-2xl text-gray-300 mb-2"></i><p class="text-sm text-gray-500 font-semibold">"${esc(word)}" not found</p><p class="text-xs text-gray-400 mt-1">Check spelling and try again</p></div>`;
          return;
        }
        throw new Error('API error');
      }

      const data = await resp.json();
      const entry = data[0];
      lastDictResult = entry;
      resultEl.innerHTML = renderDictEntry(entry);
    } catch (err) {
      console.error('Dict lookup error:', err);
      resultEl.innerHTML = `<div class="dict-placeholder"><i class="fa-solid fa-circle-exclamation text-2xl text-red-300 mb-2"></i><p class="text-sm text-red-500">Lookup failed. Try again.</p></div>`;
    }
  };

  function renderDictEntry(entry) {
    const word = entry.word || '';
    const phonetic = entry.phonetic || entry.phonetics?.find(p => p.text)?.text || '';
    const audioUrl = entry.phonetics?.find(p => p.audio)?.audio || '';

    let html = '<div class="dict-word-card">';
    html += '<div class="dict-word-header">';
    html += `<span class="dict-word-main">${esc(word)}</span>`;
    if (phonetic) html += `<span class="dict-word-phonetic">${esc(phonetic)}</span>`;
    if (audioUrl) {
      html += `<button class="dict-word-play" onclick="new Audio('${escAttr(audioUrl)}').play()" title="Pronounce"><i class="fa-solid fa-volume-high"></i></button>`;
    } else {
      html += `<button class="dict-word-play" onclick="speakWord('${escAttr(word)}')" title="Pronounce"><i class="fa-solid fa-volume-high"></i></button>`;
    }
    html += '</div>';

    /* Meanings */
    (entry.meanings || []).forEach(m => {
      html += '<div class="dict-meaning-block">';
      html += `<span class="dict-pos-tag">${esc(m.partOfSpeech)}</span>`;

      (m.definitions || []).slice(0, 3).forEach(d => {
        html += `<div class="dict-definition">• ${esc(d.definition)}</div>`;
        if (d.example) html += `<div class="dict-example">"${esc(d.example)}"</div>`;
      });

      /* Synonyms */
      const syns = (m.synonyms || []).slice(0, 6);
      if (syns.length) {
        html += '<div class="dict-synonyms">';
        syns.forEach(s => { html += `<span class="dict-syn-tag">${esc(s)}</span>`; });
        html += '</div>';
      }

      html += '</div>';
    });

    /* Add to vocab button */
    const alreadyExists = vocabData.some(v => v.word.toLowerCase().trim() === word.toLowerCase().trim());
    if (alreadyExists) {
      html += `<button class="dict-add-vocab-btn" disabled><i class="fa-solid fa-check mr-1"></i> Already in your vocab</button>`;
    } else {
      html += `<button class="dict-add-vocab-btn" onclick="addDictWordToVocab()"><i class="fa-solid fa-plus mr-1"></i> Add to vocabulary list</button>`;
    }

    html += '</div>';
    return html;
  }

  window.addDictWordToVocab = function() {
    if (!lastDictResult) return;
    const e = lastDictResult;
    const word = e.word || '';
    const phonetic = e.phonetic || e.phonetics?.find(p => p.text)?.text || '';

    /* Build definition from first meaning */
    let definition = '';
    let synonyms = '';
    let context = '';
    if (e.meanings?.length) {
      const m = e.meanings[0];
      if (m.definitions?.[0]) {
        definition = m.definitions[0].definition;
        if (m.definitions[0].example) context = m.definitions[0].example;
      }
      synonyms = (m.synonyms || []).slice(0, 4).join(', ');
    }

    /* Avoid duplicate */
    if (vocabData.some(v => v.word.toLowerCase().trim() === word.toLowerCase().trim())) {
      toast('Word already exists in vocab.', 'info');
      return;
    }

    vocabData.push({
      word: word,
      collocations: '',
      phonetics: phonetic,
      definition: definition,
      synonyms: synonyms,
      antonyms: '',
      context: context
    });

    toast(`"${word}" added to vocabulary!`, 'success');

    /* Refresh whatever tab is visible */
    if (!$('tab-list').classList.contains('hidden')) renderList();
    if (!$('tab-flashcards').classList.contains('hidden')) {
      fcOrder = [...Array(vocabData.length).keys()];
      $('fcTotal').textContent = vocabData.length;
    }

    /* Update the button */
    $('dictWordResult').querySelectorAll('.dict-add-vocab-btn').forEach(btn => {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Added!';
    });
  };

  /* ── Translate Sentence (MyMemory API) ── */
  window.swapDictLang = function() {
    const t = dictLangPair.from;
    dictLangPair.from = dictLangPair.to;
    dictLangPair.to = t;
    const tl = dictLangPair.fromLabel;
    dictLangPair.fromLabel = dictLangPair.toLabel;
    dictLangPair.toLabel = tl;
    $('dictLangFrom').textContent = dictLangPair.fromLabel;
    $('dictLangTo').textContent = dictLangPair.toLabel;
  };

  window.translateSentence = async function() {
    const text = ($('dictTranslateInput').value || '').trim();
    if (!text) return;

    const resultEl = $('dictTranslateResult');
    resultEl.innerHTML = '<div class="dict-loading"><div class="spinner"></div><span class="text-xs text-gray-400">Translating…</span></div>';

    try {
      const pair = `${dictLangPair.from}|${dictLangPair.to}`;
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.substring(0, 500))}&langpair=${pair}`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (data.responseData?.translatedText) {
        let translated = data.responseData.translatedText;

        /* Collect alternative matches if available */
        let alts = '';
        if (data.matches?.length > 1) {
          const seen = new Set([translated.toLowerCase()]);
          const altTexts = data.matches
            .filter(m => m.translation && !seen.has(m.translation.toLowerCase()) && m.quality && parseInt(m.quality) > 50)
            .slice(0, 3);
          altTexts.forEach(m => {
            seen.add(m.translation.toLowerCase());
            alts += `<div class="text-xs text-gray-500 mt-1">• ${esc(m.translation)}</div>`;
          });
        }

        resultEl.innerHTML = `<div class="dict-translate-result-card">
          <div class="dict-translate-label">${esc(dictLangPair.toLabel)}</div>
          <div style="font-size:0.95rem;font-weight:600;color:#1e293b">${esc(translated)}</div>
          ${alts ? '<div class="mt-2" style="border-top:1px solid #e2e8f0;padding-top:0.5rem"><div class="dict-translate-label">Alternatives</div>' + alts + '</div>' : ''}
        </div>`;
      } else {
        resultEl.innerHTML = '<div class="dict-placeholder"><p class="text-sm text-gray-500">Translation unavailable. Try a different text.</p></div>';
      }
    } catch (err) {
      console.error('Translate error:', err);
      resultEl.innerHTML = '<div class="dict-placeholder"><i class="fa-solid fa-circle-exclamation text-2xl text-red-300 mb-2"></i><p class="text-sm text-red-500">Translation failed. Try again.</p></div>';
    }
  };

  /* Close panel when clicking outside */
  document.addEventListener('click', (e) => {
    const panel = $('dictPanel');
    const fab = $('dictFab');
    if (!panel || panel.classList.contains('hidden')) return;
    if (!panel.contains(e.target) && !fab.contains(e.target)) {
      panel.classList.add('hidden');
      fab.classList.remove('fab-open');
    }
  });

  /* ── Selection / Double-click → Lookup Bubble ── */
  let _selBubble = null;

  function removeSelBubble() {
    if (_selBubble) { _selBubble.remove(); _selBubble = null; }
  }

  function getSelectedWord() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return '';
    return sel.toString().trim();
  }

  function showSelBubble(word, x, y) {
    removeSelBubble();
    if (!word || word.length < 2 || word.length > 500) return;
    /* Only single words or short phrases (max 3 words for translate) */
    const isSingleWord = !/\s/.test(word);

    const bubble = document.createElement('div');
    bubble.id = 'dictSelectionBubble';
    bubble.innerHTML = isSingleWord
      ? `<i class="fa-solid fa-book-open"></i> Look up "${esc(word.length > 18 ? word.slice(0, 18) + '…' : word)}"`
      : `<i class="fa-solid fa-language"></i> Translate`;

    bubble.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeSelBubble();

      if (isSingleWord) {
        /* Open dict panel in word mode and look up */
        const panel = $('dictPanel');
        const fab = $('dictFab');
        panel.classList.remove('hidden');
        fab.classList.add('fab-open');
        setDictMode('word');
        $('dictWordInput').value = word;
        lookupWord();
      } else {
        /* Open dict panel in translate mode */
        const panel = $('dictPanel');
        const fab = $('dictFab');
        panel.classList.remove('hidden');
        fab.classList.add('fab-open');
        setDictMode('translate');
        $('dictTranslateInput').value = word;
        translateSentence();
      }
    });

    /* Position: above the selection, centered */
    document.body.appendChild(bubble);
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    let left = x - bw / 2;
    let top = y - bh - 10;

    /* Keep within viewport */
    if (left < 8) left = 8;
    if (left + bw > window.innerWidth - 8) left = window.innerWidth - 8 - bw;
    if (top < 8) top = y + 24; /* flip below if too high */

    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
    _selBubble = bubble;
  }

  /* Show bubble on mouseup after selecting text */
  document.addEventListener('mouseup', (e) => {
    /* Disabled during quiz */
    if (!_dictEnabled) return;
    /* Skip if click is on the bubble itself, FAB, or dict panel */
    if (e.target.closest('#dictSelectionBubble, #dictPanel, #dictFab')) return;

    /* Small delay to let selection stabilize */
    setTimeout(() => {
      const word = getSelectedWord();
      if (!word) { removeSelBubble(); return; }
      showSelBubble(word, e.clientX, e.clientY);
    }, 10);
  });

  /* Remove bubble when clicking elsewhere or scrolling */
  document.addEventListener('mousedown', (e) => {
    if (_selBubble && !_selBubble.contains(e.target)) removeSelBubble();
  });
  document.addEventListener('scroll', removeSelBubble, true);
  document.addEventListener('keydown', removeSelBubble);

  /* ━━━━━━━━━ DAILY GOAL SYSTEM ━━━━━━━━━ */
  function todayStr() { return new Date().toISOString().slice(0, 10); }

  function loadDailyGoal() {
    try {
      const d = JSON.parse(localStorage.getItem(GOAL_KEY));
      if (d && d.date === todayStr()) return d;
    } catch (_) {}
    return null;
  }

  function saveDailyGoalData(data) {
    localStorage.setItem(GOAL_KEY, JSON.stringify(data));
  }

  function getDailyGoalStreak() {
    try {
      const history = JSON.parse(localStorage.getItem(GOAL_KEY + '_hist')) || [];
      // Count consecutive days ending today or yesterday
      const t = new Date(); t.setHours(0,0,0,0);
      let streak = 0;
      for (let i = history.length - 1; i >= 0; i--) {
        const d = new Date(history[i]); d.setHours(0,0,0,0);
        const diff = Math.round((t - d) / 86400000);
        if (diff === streak) streak++;
        else break;
      }
      return streak;
    } catch (_) { return 0; }
  }

  function addGoalToHistory() {
    try {
      const hist = JSON.parse(localStorage.getItem(GOAL_KEY + '_hist')) || [];
      const today = todayStr();
      if (!hist.includes(today)) hist.push(today);
      // Keep last 365 days
      if (hist.length > 365) hist.splice(0, hist.length - 365);
      localStorage.setItem(GOAL_KEY + '_hist', JSON.stringify(hist));
    } catch (_) {}
  }

  /* Watch scroll to bottom of a container; fires bumpDailyGoal once per load */
  const _readWatchedEls = new WeakSet();
  function watchReadScrollEnd(elId, category) {
    const el = $(elId);
    if (!el || _readWatchedEls.has(el)) return;
    _readWatchedEls.add(el);
    // Use IntersectionObserver on a sentinel at the bottom
    const sentinel = document.createElement('div');
    sentinel.style.height = '1px';
    el.appendChild(sentinel);
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        obs.disconnect();
        bumpDailyGoal(category, 1);
        toast('📖 Đọc xong! +1 mục tiêu Reading', 'success');
      }
    }, { threshold: 1.0 });
    obs.observe(sentinel);
  }

  function bumpDailyGoal(category, amount) {
    const goal = loadDailyGoal();
    if (!goal || !goal.goals[category]) return;
    goal.progress[category] = Math.min(
      (goal.progress[category] || 0) + (amount || 1),
      goal.goals[category]
    );
    // Check overall completion
    const allDone = Object.keys(goal.goals).every(k =>
      goal.goals[k] === 0 || goal.progress[k] >= goal.goals[k]
    );
    if (allDone && !goal.completed) {
      goal.completed = true;
      addGoalToHistory();
      saveDailyGoalData(goal);
      updateGoalNavBtn();
      // Delay celebration so user sees the final state first
      setTimeout(showGoalCelebration, 600);
      updateGoalWidget();
      return;
    }
    saveDailyGoalData(goal);
    updateGoalNavBtn();
    updateGoalWidget();
  }

  function updateGoalNavBtn() {
    const btn = $('dailyGoalNavBtn');
    const badge = $('goalNavBadge');
    if (!btn) return;
    const goal = loadDailyGoal();
    updateGoalWidget();
    if (!goal) {
      btn.classList.remove('hidden');
      btn.classList.add('flex');
      badge.classList.add('hidden');
      return;
    }
    btn.classList.remove('hidden');
    btn.classList.add('flex');
    if (goal.completed) {
      badge.classList.remove('hidden');
      badge.classList.add('flex');
    } else {
      badge.classList.add('hidden');
    }
  }

  window.openDailyGoalModal = function() {
    const modal = $('dailyGoalModal');
    const setup = $('goalSetupPanel');
    const progress = $('goalProgressPanel');
    $('goalDateLabel').textContent = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const goal = loadDailyGoal();
    if (goal) {
      setup.classList.add('hidden');
      progress.classList.remove('hidden');
      renderGoalProgress(goal);
    } else {
      setup.classList.remove('hidden');
      progress.classList.add('hidden');
      // Restore previous targets if available
      try {
        const last = JSON.parse(localStorage.getItem(GOAL_KEY + '_last'));
        if (last) {
          if (last.flashcards != null) $('goalFlashcards').value = last.flashcards;
          if (last.quiz != null) $('goalQuiz').value = last.quiz;
          if (last.reading != null) $('goalReading').value = last.reading;
        }
      } catch(_) {}
    }
    modal.classList.remove('hidden');
  };

  window.closeDailyGoalModal = function() {
    $('dailyGoalModal').classList.add('hidden');
  };

  window.saveDailyGoal = function() {
    const fc = Math.max(0, parseInt($('goalFlashcards').value) || 0);
    const qz = Math.max(0, parseInt($('goalQuiz').value) || 0);
    const rd = Math.max(0, parseInt($('goalReading').value) || 0);
    if (fc + qz + rd === 0) { toast('Set at least one goal!', 'info'); return; }
    const data = {
      date: todayStr(),
      goals: { flashcards: fc, quiz: qz, reading: rd },
      progress: { flashcards: 0, quiz: 0, reading: 0 },
      completed: false
    };
    saveDailyGoalData(data);
    // Remember targets for next time
    localStorage.setItem(GOAL_KEY + '_last', JSON.stringify(data.goals));
    updateGoalNavBtn();
    toast('Daily goal set! Let\'s go! 🚀', 'success');
    closeDailyGoalModal();
  };

  window.skipDailyGoal = function() {
    closeDailyGoalModal();
  };

  window.resetDailyGoal = function() {
    if (!confirm('Reset today\'s goal and progress?')) return;
    localStorage.removeItem(GOAL_KEY);
    updateGoalNavBtn();
    closeDailyGoalModal();
    toast('Daily goal reset.', 'info');
  };

  function renderGoalProgress(goal) {
    const container = $('goalProgressItems');
    const items = [
      { key: 'flashcards', label: 'Flashcards', icon: 'fa-clone', color: 'blue' },
      { key: 'quiz', label: 'Quiz', icon: 'fa-gamepad', color: 'purple' },
      { key: 'reading', label: 'Reading', icon: 'fa-book-open', color: 'green' },
    ];
    let totalGoal = 0, totalDone = 0;
    let html = '';
    for (const it of items) {
      const g = goal.goals[it.key] || 0;
      if (g === 0) continue; // skip disabled goals
      const p = Math.min(goal.progress[it.key] || 0, g);
      totalGoal += g; totalDone += p;
      const pct = Math.round(p / g * 100);
      const done = p >= g;
      html += '<div class="flex items-center gap-3">';
      html += '<div class="w-9 h-9 rounded-lg bg-' + it.color + '-100 flex items-center justify-center shrink-0">';
      html += done
        ? '<i class="fa-solid fa-circle-check text-' + it.color + '-500"></i>'
        : '<i class="fa-solid ' + it.icon + ' text-' + it.color + '-500"></i>';
      html += '</div>';
      html += '<div class="flex-1 min-w-0">';
      html += '<div class="flex justify-between text-xs mb-1"><span class="font-semibold text-gray-700">' + it.label + '</span><span class="text-gray-400">' + p + ' / ' + g + '</span></div>';
      html += '<div class="w-full h-2 bg-surface-100 rounded-full overflow-hidden"><div class="h-full rounded-full bg-' + it.color + '-500 transition-all duration-500" style="width:' + pct + '%"></div></div>';
      html += '</div></div>';
    }
    container.innerHTML = html;
    const overallPct = totalGoal > 0 ? Math.round(totalDone / totalGoal * 100) : 0;
    $('goalOverallPct').textContent = overallPct + '%';
    $('goalOverallFill').style.width = overallPct + '%';
  }

  function showGoalCelebration() {
    const goal = loadDailyGoal();
    if (!goal) return;
    const items = [
      { key: 'flashcards', label: 'Flashcards reviewed', icon: '📚' },
      { key: 'quiz', label: 'Quiz questions', icon: '🎯' },
      { key: 'reading', label: 'Readings completed', icon: '📖' },
    ];
    let statsHtml = '';
    for (const it of items) {
      const g = goal.goals[it.key] || 0;
      if (g === 0) continue;
      statsHtml += '<div class="flex items-center justify-between py-1"><span>' + it.icon + ' ' + it.label + '</span><span class="font-bold text-green-600">' + g + '/' + g + ' ✓</span></div>';
    }
    $('celebrationStats').innerHTML = statsHtml;
    const streak = getDailyGoalStreak();
    $('celebrationStreak').textContent = streak + ' day streak!';
    $('goalCelebration').classList.remove('hidden');
  }

  window.closeCelebration = function() {
    $('goalCelebration').classList.add('hidden');
  };

  /* ── Floating goal progress widget ── */
  function updateGoalWidget() {
    const widget = $('goalWidget');
    if (!widget) return;
    const goal = loadDailyGoal();
    if (!goal) { widget.classList.add('hidden'); return; }
    const cfg = [
      { key: 'flashcards', icon: 'fa-clone',    color: '#3b82f6' },
      { key: 'quiz',       icon: 'fa-gamepad',  color: '#a855f7' },
      { key: 'reading',    icon: 'fa-book-open', color: '#22c55e' },
    ];
    widget.classList.remove('hidden');
    let html = '';
    let anyActive = false;
    for (const c of cfg) {
      const g = goal.goals[c.key] || 0;
      if (g === 0) continue;
      anyActive = true;
      const p = Math.min(goal.progress[c.key] || 0, g);
      const pct = Math.round(p / g * 100);
      const done = p >= g;
      html += '<div class="goal-widget-item" title="' + c.key[0].toUpperCase() + c.key.slice(1) + ': ' + p + '/' + g + '">';
      html += '<i class="fa-solid ' + c.icon + '" style="color:' + c.color + ';font-size:0.7rem"></i>';
      html += '<div class="goal-widget-bar"><div class="goal-widget-fill' + (done ? ' done' : '') + '" style="width:' + pct + '%;background:' + c.color + '"></div></div>';
      html += '<span class="goal-widget-label">' + p + '/' + g + '</span>';
      if (done) html += '<i class="fa-solid fa-circle-check" style="color:#22c55e;font-size:0.65rem"></i>';
      html += '</div>';
    }
    if (!anyActive) { widget.classList.add('hidden'); return; }
    $('goalWidgetInner').innerHTML = html;
    if (goal.completed) {
      widget.classList.add('goal-widget-complete');
    } else {
      widget.classList.remove('goal-widget-complete');
    }
  }

  function maybeShowDailyGoalOnLoad() {
    // Show goal modal if no goal set for today and user has vocab loaded
    const goal = loadDailyGoal();
    updateGoalNavBtn();
    updateGoalWidget();
    if (!goal) {
      // Only prompt if user has data loaded
      if (vocabData.length > 0) {
        setTimeout(() => openDailyGoalModal(), 500);
      }
    }
  }

  /* ━━━━━━━━━ BOOT ━━━━━━━━━ */
  init();
})();


