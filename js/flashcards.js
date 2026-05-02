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

  