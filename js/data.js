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

  