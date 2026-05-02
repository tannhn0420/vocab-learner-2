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

  