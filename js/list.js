/* ━━━━━━━━━ VOCABULARY LIST ━━━━━━━━━ */
  window.renderTable = function() {
    const q = ($('searchInput').value || '').toLowerCase().trim();
    let filtered = vocabData.filter(v =>
      v.word.toLowerCase().includes(q) || v.definition.toLowerCase().includes(q)
    );
    if (showLeechOnly) filtered = filtered.filter(v => isLeech(v.word));

    const tbody = $('vocabTableBody');
    $('listCount').textContent = filtered.length + ' of ' + vocabData.length;
    updateLeechFilterUI();

    if (!filtered.length) {
      const emptyMsg = showLeechOnly
        ? '<i class="fa-solid fa-circle-check text-2xl mb-2 block text-green-400"></i>No leeches yet — keep practicing!'
        : '<i class="fa-solid fa-inbox text-2xl mb-2 block"></i>No words found.';
      tbody.innerHTML = '<tr><td colspan="10" class="text-center py-12 text-gray-400">' + emptyMsg + '</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map((v, i) => {
      const lv = getSRSLevel(v.word);
      const origIdx = vocabData.indexOf(v) + 1;
      const known = isSkipped(v.word);
      const leech = isLeech(v.word);
      const stats = getStats(v.word);
      let statsCell;
      if (!stats || !stats.seen) {
        statsCell = '<span class="text-gray-300 text-xs">—</span>';
      } else {
        const pct = Math.round((stats.correct / stats.seen) * 100);
        const pctColor = pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-red-500';
        statsCell = `<span class="text-xs font-mono ${pctColor}" title="Correct/Seen · Accuracy">${stats.correct}/${stats.seen} · ${pct}%</span>`;
      }
      const rowCls = [
        'border-t border-surface-100 hover:bg-surface-50 transition',
        known ? 'opacity-50' : '',
        leech ? 'leech-row' : ''
      ].filter(Boolean).join(' ');
      return `
      <tr class="${rowCls}">
        <td class="px-4 py-3 text-gray-400 text-xs font-mono">${origIdx}</td>
        <td class="px-4 py-3 font-semibold text-brand-700 whitespace-nowrap">
          ${esc(v.word)} ${known ? '<span class="text-[10px] text-green-500 font-bold ml-1">✓ KNOWN</span>' : ''}${leech ? '<span class="text-[10px] text-red-500 font-bold ml-1" title="Frequently wrong"><i class="fa-solid fa-bug"></i> LEECH</span>' : ''}
          <button onclick="event.stopPropagation();speakWord(this.dataset.word,this)"
            data-word="${escAttr(v.word)}"
            class="speaker-btn speaker-btn-sm ml-1 align-middle" title="Listen">
            <i class="fa-solid fa-volume-high"></i>
          </button>
        </td>
        <td class="px-4 py-3 text-emerald-600 text-sm hidden sm:table-cell">${esc(v.collocations) || '<span class="text-gray-300">—</span>'}</td>
        <td class="px-4 py-3 text-brand-500 hidden sm:table-cell">${esc(v.phonetics) || '<span class="text-gray-300">—</span>'}</td>
        <td class="px-4 py-3 text-gray-600 hidden md:table-cell">${esc(v.definition)}</td>
        <td class="px-4 py-3 text-gray-500 hidden md:table-cell">${esc(v.synonyms) || '<span class="text-gray-300">—</span>'}</td>
        <td class="px-4 py-3 text-gray-500 hidden lg:table-cell">${esc(v.antonyms) || '<span class="text-gray-300">—</span>'}</td>
        <td class="px-4 py-3 text-gray-500 italic hidden lg:table-cell">${esc(v.context) || '<span class="text-gray-300">—</span>'}</td>
        <td class="px-4 py-3 hidden md:table-cell">${statsCell}</td>
        <td class="px-4 py-3 hidden sm:table-cell"><span class="srs-badge srs-${lv}">${srsLabel(lv)}</span></td>
      </tr>`;
    }).join('');
  };

  window.toggleLeechFilter = function() {
    showLeechOnly = !showLeechOnly;
    renderTable();
  };

  function updateLeechFilterUI() {
    const btn = $('leechFilterBtn');
    const badge = $('leechCount');
    if (!btn || !badge) return;
    const n = countLeeches();
    badge.textContent = n;
    btn.classList.toggle('active', showLeechOnly);
    btn.classList.toggle('hidden', n === 0 && !showLeechOnly);
  }

