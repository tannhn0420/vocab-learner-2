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

    // Listening / Dictation — hearing confusion
    if (q.type === 'listening' || q.type === 'dictation') {
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
    } else if (quizMode === 'dictation') {
      pool = [];
      rangeIndices.forEach(i => {
        const v = vocabData[i];
        if (v.context && v.context.trim()) pool.push(i);
      });
      if (pool.length < 2) { toast('Not enough example sentences for Dictation in this range. Try another mode.', 'error'); return; }
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
          if (m === 'dictation') return v.context && v.context.trim();
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
      quizQuestions = picked.map(idx => {
        const q = buildQuizQuestion(idx, quizMode);
        if (quizMode === 'dictation' && (!q.sentence || !q.sentence.trim())) return buildQuizQuestion(idx, 'typein');
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
    if (mode === 'speaking') {
      return { type:'speaking', word:c.word, definition:c.definition, answer:c.word, phonetics:c.phonetics, idx };
    }
    if (mode === 'dictation') {
      // Full-sentence dictation: hear the example sentence, type it back
      return { type:'dictation', sentence:c.context, answer:c.context, word:c.word, definition:c.definition, idx };
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
    $('quizSpeakingArea').classList.add('hidden');
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
    const labels = { mc:'Multiple Choice', typein:'Type-in', cloze:'Cloze Test', listening:'Listening', reverse:'Reverse', synonym:'Synonym Match', speaking:'Speaking', dictation:'Dictation', smart:'⚡ Smart' };
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

    } else if (q.type === 'dictation') {
      $('quizPrompt').innerHTML = '<i class="fa-solid fa-headphones mr-1"></i> Listen and type the full sentence:';
      $('quizQuestion').innerHTML = '<button onclick=\"speakWord(this.dataset.sentence, this)\" data-sentence=\"' + escAttr(q.sentence) + '\" class=\"speaker-btn mx-auto\" style=\"width:4rem;height:4rem;font-size:1.5rem\" title=\"Play again\"><i class=\"fa-solid fa-volume-high\"></i></button><br><span class=\"text-xs text-gray-400 mt-2\">Click to replay · You can play multiple times</span>';
      $('quizInputArea').classList.remove('hidden');
      inp.placeholder = 'Type the sentence you hear…';
      setTimeout(() => { speakWord(q.sentence); inp.focus(); }, 300);

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

    } else if (q.type === 'speaking') {
      $('quizPrompt').innerHTML = '<i class="fa-solid fa-microphone mr-1 text-red-500"></i> Hãy đọc từ vựng có ý nghĩa này:';
      
      let html = '<span class="text-2xl font-extrabold text-brand-700">' + esc(q.definition) + '</span>';
      if (q.phonetics) {
        html += '<br><span class="text-sm text-indigo-500 font-medium mt-2 block">' + esc(q.phonetics) + '</span>';
      }
      $('quizQuestion').innerHTML = html;
      
      $('quizSpeakingArea').classList.remove('hidden');
      $('quizSubmitBtn').classList.add('hidden');
      if (typeof window.stopQuizRecordingUI === 'function') window.stopQuizRecordingUI();
      $('quizSpeakingFeedback').classList.add('hidden');
      const interimEl = $('quizSpeakingInterimTranscript');
      if (interimEl) {
        interimEl.innerHTML = '';
        interimEl.classList.remove('opacity-100', 'scale-100');
        interimEl.classList.add('opacity-0', 'scale-95');
      }
      if (window.quizRecognition && window.isQuizRecording) window.quizRecognition.stop();

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

  /* Normalize a sentence for dictation comparison */
  function normalizeForDictation(s) {
    return (s || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s']/gu, ' ')   // strip punctuation (keep apostrophes)
      .replace(/\s+/g, ' ')
      .trim();
  }
  /* Compare two sentences word-by-word. Returns { matched, total, diffHTML } */
  function diffDictation(userText, target) {
    const u = normalizeForDictation(userText).split(' ').filter(Boolean);
    const t = normalizeForDictation(target).split(' ').filter(Boolean);
    // Use LCS for an order-preserving diff
    const m = u.length, n = t.length;
    const dp = Array.from({length: m + 1}, () => new Uint16Array(n + 1));
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = u[i-1] === t[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
    // Walk back to mark which target words were matched
    const matchedFlags = new Array(n).fill(false);
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (u[i-1] === t[j-1]) { matchedFlags[j-1] = true; i--; j--; }
      else if (dp[i-1][j] >= dp[i][j-1]) i--;
      else j--;
    }
    const matched = matchedFlags.filter(Boolean).length;
    const targetWords = (target || '').split(/(\s+)/); // keep whitespace tokens
    // Build pretty diff: highlight target words green if matched, red if missed
    let wIdx = 0;
    const html = targetWords.map(tok => {
      if (/^\s+$/.test(tok)) return tok;
      const norm = normalizeForDictation(tok);
      if (!norm) return esc(tok);
      const ok = matchedFlags[wIdx];
      wIdx++;
      const cls = ok ? 'dict-word-ok' : 'dict-word-miss';
      return `<span class="${cls}">${esc(tok)}</span>`;
    }).join('');
    return { matched, total: n, diffHTML: html };
  }

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
    let dictResult = null;

    if (q.type === 'dictation') {
      dictResult = diffDictation(val, q.answer);
      const pct = dictResult.total ? dictResult.matched / dictResult.total : 0;
      ok = pct >= 0.85;
      displayAnswer = q.answer;
    } else if (q.type === 'reverse') {
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
      if (q.type === 'dictation') {
        const sub = dictResult && dictResult.total > dictResult.matched
          ? '<div class="dict-diff mt-2">' + dictResult.diffHTML + '</div><div class="text-xs text-gray-500 mt-1">' + dictResult.matched + '/' + dictResult.total + ' words matched</div>'
          : '';
        fb.innerHTML = '<i class="fa-solid fa-circle-check mr-1"></i> Great! You got the sentence.' + sub;
      } else if (q.type === 'reverse') {
        fb.innerHTML = '<i class="fa-solid fa-circle-check mr-1"></i> Correct! Full definition: "' + esc(displayAnswer) + '"';
      } else {
        fb.innerHTML = '<i class="fa-solid fa-circle-check mr-1"></i> Correct! "' + esc(displayAnswer) + '"';
      }
    } else {
      quizScore.wrong++;
      inp.classList.add('wrong-input');
      fb.classList.add('wrong-feedback');
      if (q.type === 'dictation') {
        const diff = dictResult ? dictResult.diffHTML : esc(displayAnswer);
        const score = dictResult ? dictResult.matched + '/' + dictResult.total + ' words matched' : '';
        fb.innerHTML = '<i class="fa-solid fa-circle-xmark mr-1"></i> Not quite. Target sentence:<div class="dict-diff mt-2">' + diff + '</div><div class="text-xs text-gray-500 mt-1">' + score + '</div>';
      } else if (q.type === 'reverse') {
        fb.innerHTML = '<i class="fa-solid fa-circle-xmark mr-1"></i> Not quite. The definition is: "<strong>' + esc(displayAnswer) + '</strong>"';
      } else {
        fb.innerHTML = '<i class="fa-solid fa-circle-xmark mr-1"></i> Wrong! The answer is "<strong>' + esc(displayAnswer) + '</strong>"';
      }
    }
    inp.disabled = true;
    $('quizSubmitBtn').classList.add('hidden');

    const srsWord = q.type === 'reverse' ? q.word : (q.type === 'dictation' ? q.word : (q.answer || q.word));
    updateSRS(srsWord, ok);
    if (!ok) addWrongWord(srsWord);
    else removeWrongWord(srsWord);
    const mistakeInfo = ok ? null : analyzeMistake(q, val);
    quizReport.push({ word: srsWord, correct: ok, userAnswer: val, correctAnswer: displayAnswer, mode: q.type, mistakeInfo, _qIdx: q.idx, _qOrder: quizIdx });
    afterAnswer(srsWord, ok);
  };

  /* ━━━━━━━━━ QUIZ — SPEAKING ANSWER ━━━━━━━━━ */
  window.quizRecognition = null;
  window.isQuizRecording = false;
  let quizSpeakingTranscriptAcc = '';
  let quizSpeakingEvalTimeout = null;

  window.toggleQuizRecording = function() {
    if (quizAnswered) return;
    if (window.isQuizRecording && window.quizRecognition) {
      window.quizRecognition.stop();
      return;
    }
    
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast('Speech Recognition API not supported. Please use Chrome.', 'error');
      return;
    }

    if (!window.quizRecognition) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      window.quizRecognition = new SpeechRecognition();
      window.quizRecognition.lang = 'en-US';
      window.quizRecognition.interimResults = true;
      window.quizRecognition.continuous = true;
      window.quizRecognition.maxAlternatives = 1;
      
      window.quizRecognition.onstart = function() {
        window.isQuizRecording = true;
        quizSpeakingTranscriptAcc = '';
        if (quizSpeakingEvalTimeout) clearTimeout(quizSpeakingEvalTimeout);
        $('quizMicBtn').classList.add('bg-red-600', 'scale-110');
        $('quizMicBtn').classList.remove('bg-red-500');
        $('quizRecordingPulse').classList.remove('hidden');
        $('quizSpeakingStatus').textContent = 'Đang nghe...';
        const interimEl = $('quizSpeakingInterimTranscript');
        if (interimEl) {
          interimEl.innerHTML = '';
          interimEl.classList.remove('opacity-100', 'scale-100');
          interimEl.classList.add('opacity-0', 'scale-95');
        }
      };
      
      window.quizRecognition.onresult = function(event) {
        let interimTranscript = '';
        let finalStr = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalStr += event.results[i][0].transcript + ' ';
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        if (finalStr) quizSpeakingTranscriptAcc += finalStr;
        
        const el = $('quizSpeakingInterimTranscript');
        if (el) {
          const fullText = (quizSpeakingTranscriptAcc + '<span class="opacity-50">' + interimTranscript + '</span>').trim();
          if (fullText) {
            el.innerHTML = fullText;
            el.classList.remove('opacity-0', 'scale-95');
            el.classList.add('opacity-100', 'scale-100');
          }
        }

        if (quizSpeakingEvalTimeout) clearTimeout(quizSpeakingEvalTimeout);
        quizSpeakingEvalTimeout = setTimeout(() => {
          if (window.isQuizRecording && window.quizRecognition) window.quizRecognition.stop();
        }, 2000); // 2 second delay before auto-eval
      };
      
      window.quizRecognition.onerror = function(event) {
        if (event.error === 'no-speech') return; // ignore no-speech
        let msg = event.error;
        if (event.error === 'network') msg += ' (Do chạy offline file:// hoặc mất mạng)';
        toast('Lỗi Microphone: ' + msg, 'error');
        window.stopQuizRecordingUI();
      };
      
      window.quizRecognition.onend = function() {
        window.stopQuizRecordingUI();
        if (quizSpeakingTranscriptAcc.trim()) {
          evaluateQuizSpeech(quizSpeakingTranscriptAcc.trim());
        }
      };
    }
    
    $('quizSpeakingFeedback').classList.add('hidden');
    try {
      window.quizRecognition.start();
    } catch(e) { console.error(e); }
  };

  window.stopQuizRecordingUI = function() {
    window.isQuizRecording = false;
    const btn = $('quizMicBtn');
    if (btn) {
      btn.classList.remove('bg-red-600', 'scale-110');
      btn.classList.add('bg-red-500');
    }
    const pulse = $('quizRecordingPulse');
    if (pulse) pulse.classList.add('hidden');
    const status = $('quizSpeakingStatus');
    if (status && !quizAnswered) status.textContent = 'Nhấn để nói';
  };

  function evaluateQuizSpeech(transcript) {
    if (quizAnswered) return;
    quizAnswered = true;
    
    const q = quizQuestions[quizIdx];
    const targetWords = q.answer.toLowerCase().replace(/[.,!?]/g, '').split(' ').filter(w=>w);
    const actualWords = transcript.toLowerCase().replace(/[.,!?]/g, '').split(' ').filter(w=>w);
    
    let matches = 0;
    for (const tw of targetWords) {
      if (actualWords.includes(tw)) matches++;
    }
    const pct = targetWords.length ? (matches / targetWords.length) : 0;
    const ok = pct >= 0.8; // 80% is considered correct

    const fb = $('quizSpeakingFeedback');
    fb.classList.remove('hidden', 'bg-green-100', 'bg-red-100', 'text-green-700', 'text-red-700');
    
    if (ok) {
      quizScore.correct++;
      fb.classList.add('bg-green-100', 'text-green-700');
      fb.innerHTML = '<i class="fa-solid fa-circle-check"></i> Chính xác! Bạn đã nói: "' + esc(transcript) + '"';
    } else {
      quizScore.wrong++;
      fb.classList.add('bg-red-100', 'text-red-700');
      fb.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Sai rồi. Bạn đã nói: "' + esc(transcript) + '"';
    }
    
    $('quizSpeakingStatus').textContent = 'Đã nhận diện xong';

    const srsWord = q.answer;
    updateSRS(srsWord, ok);
    if (!ok) addWrongWord(srsWord);
    else removeWrongWord(srsWord);
    const mistakeInfo = ok ? null : { type: 'pronunciation', label: 'Pronunciation', icon: 'fa-microphone', color: 'pink' };
    quizReport.push({ word: srsWord, correct: ok, userAnswer: transcript, correctAnswer: q.answer, mode: 'speaking', mistakeInfo, _qIdx: q.idx, _qOrder: quizIdx });
    afterAnswer(srsWord, ok);
  }

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
          if (m === 'dictation') return v.context && v.context.trim();
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
        if (quizMode === 'dictation' && (!q.sentence || !q.sentence.trim())) return buildQuizQuestion(idx, 'typein');
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

  