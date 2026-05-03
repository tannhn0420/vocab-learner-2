/* ━━━━━━━━━ SPEECH SYNTHESIS ━━━━━━━━━ */
let _speakBtn = null;
let _currentUtterance = null; // Prevent garbage collection
let _voicesLoaded = false;

window.populateVoicesDropdown = function() {
  const select = document.getElementById('settingsVoice');
  if (!select || !window.speechSynthesis) return;
  
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return;

  // Filter for English voices to avoid a massive list
  const enVoices = voices.filter(v => v.lang.startsWith('en'));
  
  // Keep the 'auto' option
  select.innerHTML = '<option value="auto">Auto (Best Available)</option>';
  
  enVoices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    // Highlight if it's male/female if possible, but usually name says it
    opt.textContent = `${v.name} (${v.lang})`;
    select.appendChild(opt);
  });
  
  if (window.PREFERRED_VOICE) {
    select.value = window.PREFERRED_VOICE;
  }
};

window.speakWord = function(word, btn) {
  if (!window.speechSynthesis) {
    console.error('Speech synthesis not supported');
    if (typeof toast === 'function') toast('Speech not supported.', 'error');
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();
  
  if (_speakBtn) _speakBtn.classList.remove('speaking');

  // Sanitize word
  if (!word || typeof word !== 'string') return;
  const cleanWord = word.trim();
  if (!cleanWord) return;

  // Create utterance and store in global to prevent GC
  _currentUtterance = new SpeechSynthesisUtterance(cleanWord);
  const utt = _currentUtterance;
  
  utt.lang = 'en-US';
  utt.rate = 0.85;
  utt.pitch = 1;
  utt.volume = 1; // Ensure volume is max

  const voices = window.speechSynthesis.getVoices();
  let selectedVoice = null;

  if (window.PREFERRED_VOICE && window.PREFERRED_VOICE !== 'auto') {
    selectedVoice = voices.find(v => v.voiceURI === window.PREFERRED_VOICE);
  }

  if (!selectedVoice) {
    // Fallback to auto selection
    selectedVoice = voices.find(v => v.lang === 'en-US' && v.name.includes('Samantha')) ||
                    voices.find(v => v.lang === 'en-US' && v.name.includes('Google')) ||
                    voices.find(v => v.lang === 'en-US') ||
                    voices.find(v => v.lang.startsWith('en'));
  }
  
  if (selectedVoice) utt.voice = selectedVoice;

  if (btn) {
    _speakBtn = btn;
    btn.classList.add('speaking');
    utt.onend = () => {
      btn.classList.remove('speaking');
      _speakBtn = null;
      _currentUtterance = null;
    };
    utt.onerror = (err) => {
      console.error('SpeechSynthesis error:', err);
      btn.classList.remove('speaking');
      _speakBtn = null;
      _currentUtterance = null;
    };
  } else {
    utt.onend = () => { _currentUtterance = null; };
    utt.onerror = () => { _currentUtterance = null; };
  }

  // Small delay after cancel() helps on many browsers
  setTimeout(() => {
    // Chrome bug: sometimes it's paused even if we didn't pause it
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.speak(utt);
  }, 50);
};

// Pre-load voice list
if (window.speechSynthesis) {
  // Fix for some browsers where voices are not loaded initially
  let initialVoices = window.speechSynthesis.getVoices();
  if (initialVoices.length > 0) {
    _voicesLoaded = true;
    window.populateVoicesDropdown();
  }
  
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      console.log('Voices updated:', window.speechSynthesis.getVoices().length);
      if (!_voicesLoaded) {
        _voicesLoaded = true;
        window.populateVoicesDropdown();
      }
    };
  }
}  