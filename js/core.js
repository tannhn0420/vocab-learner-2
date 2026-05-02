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

  window.loadTopic = async function(filename) {
    if (window.location.protocol === 'file:') {
      toast('Lỗi: Tính năng chọn chủ đề yêu cầu chạy ứng dụng qua Live Server hoặc Local Server (không thể dùng file://)', 'error', 6000);
      return;
    }
    try {
      const topicName = filename.replace('.csv', '').toUpperCase();
      toast('Đang tải chủ đề: ' + topicName + '...', 'info');
      const response = await fetch('csv/' + filename);
      if (!response.ok) throw new Error('Không thể tải tệp ' + filename + ' (Mã lỗi: ' + response.status + ')');
      const blob = await response.blob();
      const file = new File([blob], filename, { type: 'text/csv' });
      handleFile(file);
    } catch (error) {
      console.error(error);
      toast('Lỗi khi tải chủ đề: ' + error.message, 'error');
    }
  };

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

  