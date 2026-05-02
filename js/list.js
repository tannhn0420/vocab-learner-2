/* ━━━━━━━━━ VOCABULARY LIST ━━━━━━━━━ */
  window.renderTable = function() {
    const q = ($('searchInput').value || '').toLowerCase().trim();
    const filtered = vocabData.filter(v =>
      v.word.toLowerCase().includes(q) || v.definition.toLowerCase().includes(q)
    );
    const tbody = $('vocabTableBody');
    $('listCount').textContent = filtered.length + ' of ' + vocabData.length;

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center py-12 text-gray-400">' +
        '<i class="fa-solid fa-inbox text-2xl mb-2 block"></i>No words found.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map((v, i) => {
      const lv = getSRSLevel(v.word);
      const origIdx = vocabData.indexOf(v) + 1;
      const known = isSkipped(v.word);
      return `
      <tr class="border-t border-surface-100 hover:bg-surface-50 transition ${known ? 'opacity-50' : ''}">
        <td class="px-4 py-3 text-gray-400 text-xs font-mono">${origIdx}</td>
        <td class="px-4 py-3 font-semibold text-brand-700 whitespace-nowrap">
          ${esc(v.word)} ${known ? '<span class="text-[10px] text-green-500 font-bold ml-1">✓ KNOWN</span>' : ''}
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
        <td class="px-4 py-3 hidden sm:table-cell"><span class="srs-badge srs-${lv}">${srsLabel(lv)}</span></td>
      </tr>`;
    }).join('');
  };

  