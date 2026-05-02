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

  