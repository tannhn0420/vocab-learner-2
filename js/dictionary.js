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

  