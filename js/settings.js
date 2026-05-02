/* ━━━━━━━━━ SETTINGS ━━━━━━━━━ */
  function loadSettings() {
    try {
      const s = localStorage.getItem(SETTINGS_KEY);
      if (s) {
        const settings = JSON.parse(s);
        AUTO_FLIP_MS = settings.autoFlipMs || 120000;
        AUTO_NEXT_MS = settings.autoNextMs || 20000;
      }
    } catch (_) {}
  }
  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      autoFlipMs: AUTO_FLIP_MS,
      autoNextMs: AUTO_NEXT_MS
    }));
  }

  window.openSettings = function() {
    $('settingsModal').classList.remove('hidden');
    $('settingsFlipMin').value = Math.floor(AUTO_FLIP_MS / 60000);
    $('settingsFlipSec').value = Math.floor((AUTO_FLIP_MS % 60000) / 1000);
    $('settingsNextSec').value = Math.floor(AUTO_NEXT_MS / 1000);
  };

  window.closeSettings = function() {
    $('settingsModal').classList.add('hidden');
  };

  window.saveSettingsForm = function() {
    const flipMin = parseInt($('settingsFlipMin').value) || 0;
    const flipSec = parseInt($('settingsFlipSec').value) || 0;
    const nextSec = parseInt($('settingsNextSec').value) || 10;

    AUTO_FLIP_MS = (flipMin * 60 + flipSec) * 1000;
    AUTO_NEXT_MS = nextSec * 1000;

    if (AUTO_FLIP_MS < 5000) AUTO_FLIP_MS = 5000;   // min 5s
    if (AUTO_NEXT_MS < 5000) AUTO_NEXT_MS = 5000;   // min 5s

    saveSettings();
    closeSettings();
    toast('Settings saved!', 'success');

    // restart timers with new values
    if (autoPlayOn) {
      const card = $('flashcard');
      if (card && card.classList.contains('flipped')) startAutoNextTimer();
      else startAutoFlipTimer();
    }
  };

  