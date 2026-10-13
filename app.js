let WORDS = [];
let filtered = [];

const $list = document.getElementById('list');
const $search = document.getElementById('search');
const $group = document.getElementById('groupFilter');
const $sort = document.getElementById('sortOrder');
const $info = document.getElementById('resultInfo');
const $empty = document.getElementById('empty');
const $count = document.getElementById('count');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function highlight(word, q) {
  if (!q) return esc(word);
  const i = word.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return esc(word);
  return esc(word.slice(0, i)) + '<mark>' + esc(word.slice(i, i + q.length)) + '</mark>' + esc(word.slice(i + q.length));
}

function searchableText(w) {
  const parts = [w.word, w.group, w.ipa];
  for (const s of w.senses) {
    parts.push(s.pos, s.sentence, ...(s.meanings || []), ...(s.synonyms || []));
  }
  return parts.join(' ').toLowerCase();
}
// Precompute for speed
let searchIndex = [];

function applyFilters() {
  const q = $search.value.trim().toLowerCase();
  const g = $group.value;
  const sort = $sort.value;

  filtered = WORDS.filter((w, idx) => {
    if (g !== 'all' && w.group !== g) return false;
    if (q && !searchIndex[idx].includes(q)) return false;
    return true;
  });

  if (sort === 'az') filtered.sort((a, b) => a.word.localeCompare(b.word));
  else if (sort === 'za') filtered.sort((a, b) => b.word.localeCompare(a.word));
  else if (sort === 'group') filtered.sort((a, b) => a.group.localeCompare(b.group, undefined, {numeric: true}) || a.word.localeCompare(b.word));

  render(q);
}

function render(q) {
  $count.textContent = WORDS.length;
  $info.textContent = `Showing ${filtered.length} of ${WORDS.length} words`;
  $empty.hidden = filtered.length !== 0;

  // Render in chunks to keep UI snappy for 1020 cards
  const CHUNK = 120;
  $list.innerHTML = '';
  let i = 0;
  function drawChunk() {
    const frag = document.createDocumentFragment();
    for (let j = 0; j < CHUNK && i < filtered.length; j++, i++) {
      frag.appendChild(cardEl(filtered[i], q));
    }
    $list.appendChild(frag);
    if (i < filtered.length) requestAnimationFrame(drawChunk);
  }
  drawChunk();
}

function cardEl(w, q) {
  const div = document.createElement('article');
  div.className = 'card';
  div.id = 'w-' + w.word;

  const sensesHtml = w.senses.map(s => `
    <div class="sense">
      ${s.pos ? `<span class="pos ${esc(s.pos)}">${esc(s.pos)}</span>` : ''}
      ${s.meanings?.length ? `<div class="meaning"><ul>${s.meanings.map(m => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}
      ${s.sentence ? `<div class="sentence">“${esc(s.sentence)}”</div>` : ''}
      ${s.synonyms?.length ? `<div class="syn-row"><span class="syn-label">Synonyms</span>${s.synonyms.map(sy => `<button class="syn" data-syn="${esc(sy)}">${esc(sy)}</button>`).join('')}</div>` : ''}
    </div>
  `).join('');

  div.innerHTML = `
    <div class="card-top">
      <div>
        <h2 class="word">${highlight(w.word, q)}</h2>
        ${w.ipa ? `<div class="ipa">${esc(w.ipa)}
          ${w.audio ? `<button class="audio-btn" data-audio="${esc(w.audio)}" title="Play pronunciation">🔊 play</button>` : ''}
        </div>` : (w.audio ? `<div class="ipa"><button class="audio-btn" data-audio="${esc(w.audio)}">🔊 play</button></div>` : '')}
      </div>
      <span class="group-badge">${esc(w.group)}</span>
    </div>
    ${sensesHtml}
  `;
  return div;
}

// Events (delegated)
$list.addEventListener('click', e => {
  const a = e.target.closest('.audio-btn');
  if (a) {
    new Audio(a.dataset.audio).play().catch(() => alert('Audio failed to load.'));
    return;
  }
  const s = e.target.closest('.syn');
  if (s) {
    $search.value = s.dataset.syn;
    applyFilters();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

let debounce;
$search.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(applyFilters, 120);
});
$group.addEventListener('change', applyFilters);
$sort.addEventListener('change', applyFilters);

document.getElementById('clearBtn').addEventListener('click', () => {
  $search.value = ''; $group.value = 'all'; $sort.value = 'az'; applyFilters();
});
document.getElementById('resetBtn').addEventListener('click', () => {
  $search.value = ''; $group.value = 'all'; applyFilters();
});
document.getElementById('randomBtn').addEventListener('click', () => {
  if (!filtered.length) return;
  const w = filtered[Math.floor(Math.random() * filtered.length)];
  const el = document.getElementById('w-' + w.word);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
document.getElementById('compactToggle').addEventListener('change', e => {
  document.body.classList.toggle('compact', e.target.checked);
});

// Init
fetch('words.json')
  .then(r => r.json())
  .then(data => {
    WORDS = data;
    searchIndex = WORDS.map(w => searchableText(w));
    // Populate group filter in numeric order
    const groups = [...new Set(WORDS.map(w => w.group))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }));
    for (const g of groups) {
      const opt = document.createElement('option');
      opt.value = g; opt.textContent = g;
      $group.appendChild(opt);
    }
    applyFilters();
  })
  .catch(err => {
    $list.innerHTML = `<p>Could not load <code>words.json</code>. If you opened index.html directly, run a local server instead:<br><code>cd gregmat-vocab-app && python3 -m http.server 8000</code> then open <code>http://localhost:8000</code></p>`;
    console.error(err);
  });
