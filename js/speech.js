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

  