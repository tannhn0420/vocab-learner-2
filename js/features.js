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

  /* ━━━━━━━━━ DARK MODE ━━━━━━━━━ */
  window.toggleDarkMode = function() {
    const html = document.documentElement;
    html.classList.toggle('dark');
    const isDark = html.classList.contains('dark');
    localStorage.setItem('vocabLearnerDarkMode', isDark);
    const icon = $('darkModeIcon');
    if (icon) {
      icon.className = isDark ? 'fa-solid fa-sun text-amber-400' : 'fa-solid fa-moon';
    }
  };

  // Load dark mode on start
  if (localStorage.getItem('vocabLearnerDarkMode') === 'true') {
    document.documentElement.classList.add('dark');
    window.addEventListener('DOMContentLoaded', () => {
      const icon = $('darkModeIcon');
      if (icon) icon.className = 'fa-solid fa-sun text-amber-400';
    });
  }

  /* ━━━━━━━━━ SPEAKING FEATURE ━━━━━━━━━ */
  let speakingMode = 'word'; // 'word' or 'context'
  let speakingTargets = [];
  let speakingIdx = 0;
  let recognition = null;
  let isRecording = false;
  let speakingTranscriptAcc = '';
  let speakingEvalTimeout = null;

  window.startSpeakingSession = function(mode) {
    if (!vocabData.length) { toast('Please load vocabulary first.', 'error'); return; }
    speakingMode = mode;
    speakingTargets = vocabData.filter(v => mode === 'word' ? v.word : v.context);
    if (!speakingTargets.length) { toast('No valid targets for this mode.', 'error'); return; }
    
    // shuffle
    speakingTargets.sort(() => Math.random() - 0.5);
    speakingIdx = 0;
    
    $('speakingPlayArea').classList.remove('hidden');
    $('speakingPromptType').textContent = mode === 'word' ? 'Hãy đọc to từ này' : 'Hãy đọc to câu này';
    $('speakingTotal').textContent = speakingTargets.length;
    
    initSpeechRecognition();
    renderSpeakingTarget();
  };

  function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast('Speech Recognition API not supported in your browser. Please use Chrome/Edge.', 'error');
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    
    recognition.onstart = function() {
      isRecording = true;
      speakingTranscriptAcc = '';
      if (speakingEvalTimeout) clearTimeout(speakingEvalTimeout);
      $('micBtn').classList.add('bg-red-600', 'scale-110');
      $('micBtn').classList.remove('bg-red-500');
      $('recordingPulse').classList.remove('hidden');
      const interimEl = $('speakingInterimTranscript');
      if (interimEl) {
        interimEl.innerHTML = '';
        interimEl.classList.remove('opacity-100', 'scale-100');
        interimEl.classList.add('opacity-0', 'scale-95');
      }
      $('speakingResultBox').classList.add('hidden');
    };
    
    recognition.onresult = function(event) {
      let interimTranscript = '';
      let finalStr = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalStr += event.results[i][0].transcript + ' ';
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      if (finalStr) speakingTranscriptAcc += finalStr;
      
      const el = $('speakingInterimTranscript');
      if (el) {
        const fullText = (speakingTranscriptAcc + '<span class="opacity-50">' + interimTranscript + '</span>').trim();
        if (fullText) {
          el.innerHTML = fullText;
          el.classList.remove('opacity-0', 'scale-95');
          el.classList.add('opacity-100', 'scale-100');
        }
      }

      if (speakingEvalTimeout) clearTimeout(speakingEvalTimeout);
      speakingEvalTimeout = setTimeout(() => {
        if (isRecording && recognition) recognition.stop();
      }, 2000); // 2 second delay before auto-eval
    };
    
    recognition.onerror = function(event) {
      if (event.error === 'no-speech') return;
      toast('Lỗi Microphone: ' + event.error, 'error');
      stopRecordingUI();
    };
    
    recognition.onend = function() {
      stopRecordingUI();
      if (speakingTranscriptAcc.trim()) {
        evaluateSpeech(speakingTranscriptAcc.trim());
      }
    };
  }

  function stopRecordingUI() {
    isRecording = false;
    $('micBtn').classList.remove('bg-red-600', 'scale-110');
    $('micBtn').classList.add('bg-red-500');
    $('recordingPulse').classList.add('hidden');
  }

  window.toggleRecording = function() {
    if (!recognition) return;
    if (isRecording) {
      recognition.stop();
    } else {
      $('speakingResultBox').classList.add('hidden');
      recognition.start();
    }
  };

  window.stopSpeakingSession = function() {
    if (isRecording && recognition) recognition.stop();
    $('speakingPlayArea').classList.add('hidden');
  };

  function renderSpeakingTarget() {
    $('speakingCurrent').textContent = speakingIdx + 1;
    const item = speakingTargets[speakingIdx];
    let textToSpeak = speakingMode === 'word' ? item.word : item.context;
    
    if (speakingMode === 'context') {
      textToSpeak = textToSpeak.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    }
    
    $('speakingTargetText').textContent = textToSpeak;
    $('speakingPhonetics').textContent = item.phonetics || '';
    $('speakingResultBox').classList.add('hidden');
    
    const interimEl = $('speakingInterimTranscript');
    if (interimEl) {
      interimEl.innerHTML = '';
      interimEl.classList.remove('opacity-100', 'scale-100');
      interimEl.classList.add('opacity-0', 'scale-95');
    }
  }

  window.nextSpeakingTarget = function() {
    if (isRecording && recognition) recognition.stop();
    if (speakingIdx < speakingTargets.length - 1) {
      speakingIdx++;
      renderSpeakingTarget();
    } else {
      toast('Đã hoàn thành phiên luyện đọc!', 'success');
      stopSpeakingSession();
    }
  };

  window.speakTargetText = function() {
    const text = $('speakingTargetText').textContent;
    speakWord(text);
  };

  function evaluateSpeech(transcript) {
    const target = $('speakingTargetText').textContent.toLowerCase().replace(/[.,!?]/g, '');
    const actual = transcript.toLowerCase().replace(/[.,!?]/g, '');
    
    // Simple word matching logic
    const targetWords = target.split(' ').filter(w=>w);
    const actualWords = actual.split(' ').filter(w=>w);
    
    let matches = 0;
    let diffHTML = '';
    
    // evaluate per word
    for (const tw of targetWords) {
      if (actualWords.includes(tw)) {
        matches++;
        diffHTML += '<span class="diff-correct">' + tw + '</span> ';
      } else {
        diffHTML += '<span class="diff-wrong">' + tw + '</span> ';
      }
    }
    
    const pct = targetWords.length ? Math.round((matches / targetWords.length) * 100) : 0;
    
    $('speakingResultBox').classList.remove('hidden');
    $('speakingTranscript').innerHTML = diffHTML + '<br><span class="text-xs text-gray-400 mt-2 block">Bạn đã nói: "' + transcript + '"</span>';
    
    const badge = $('speakingScoreBadge');
    badge.className = 'text-xs font-bold px-2 py-1 rounded-full ';
    if (pct >= 80) {
      badge.textContent = pct + '% - Xuất sắc 🌟';
      badge.classList.add('score-perfect');
    } else if (pct >= 50) {
      badge.textContent = pct + '% - Khá tốt 👍';
      badge.classList.add('score-good');
    } else {
      badge.textContent = pct + '% - Thử lại nhé ❌';
      badge.classList.add('score-bad');
    }
  }

  