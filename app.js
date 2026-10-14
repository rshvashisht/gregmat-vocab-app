let WORDS = [];
let filtered = [];

const $list = document.getElementById('list');
const $search = document.getElementById('search');
const $group = document.getElementById('groupFilter');
const $flag = document.getElementById('flagFilter');
const $sort = document.getElementById('sortOrder');
const $info = document.getElementById('resultInfo');
const $empty = document.getElementById('empty');
const $count = document.getElementById('count');
const $flagCounts = document.getElementById('flagCounts');

// Red / yellow / green markings, persisted per device
const FLAGS_KEY = 'gregmat-flags-v1';
let flags = {};
try { flags = JSON.parse(localStorage.getItem(FLAGS_KEY) || '{}') || {}; }
catch (e) { flags = {}; }
function saveFlags() {
  try { localStorage.setItem(FLAGS_KEY, JSON.stringify(flags)); }
  catch (e) { /* storage unavailable — flags last for this session only */ }
}
function updateCounts() {
  let r = 0, y = 0, g = 0;
  for (const k in flags) {
    if (flags[k] === 'red') r++;
    else if (flags[k] === 'yellow') y++;
    else if (flags[k] === 'green') g++;
  }
  $flagCounts.textContent = `🔴 ${r} · 🟡 ${y} · 🟢 ${g}`;
}

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

// Chunked-render state ({i, q} or null when fully rendered)
const CHUNK = 120;
let pendingRender = null;
function drawChunk() {
  const st = pendingRender;
  if (!st) return;
  const frag = document.createDocumentFragment();
  for (let j = 0; j < CHUNK && st.i < filtered.length; j++, st.i++) {
    frag.appendChild(cardEl(filtered[st.i], st.q));
  }
  $list.appendChild(frag);
  if (st.i < filtered.length) requestAnimationFrame(drawChunk);
  else pendingRender = null;
}

function applyFilters() {
  const q = $search.value.trim().toLowerCase();
  const g = $group.value;
  const f = $flag.value;
  const sort = $sort.value;

  filtered = WORDS.filter((w, idx) => {
    if (g !== 'all' && w.group !== g) return false;
    if (f !== 'all' && (flags[w.word] || 'none') !== f) return false;
    if (q && !searchIndex[idx].includes(q)) return false;
    return true;
  });

  if (sort === 'az') filtered.sort((a, b) => a.word.localeCompare(b.word));
  else if (sort === 'za') filtered.sort((a, b) => b.word.localeCompare(a.word));
  else if (sort === 'group') filtered.sort((a, b) => a.group.localeCompare(b.group, undefined, {numeric: true}) || a.word.localeCompare(b.word));
  else if (sort === 'flag') {
    const rank = { red: 0, yellow: 1, green: 2, none: 3 };
    filtered.sort((a, b) => (rank[flags[a.word] || 'none'] - rank[flags[b.word] || 'none']) || a.word.localeCompare(b.word));
  }

  render(q);
}

function render(q) {
  $count.textContent = WORDS.length;
  $info.textContent = `Showing ${filtered.length} of ${WORDS.length} words`;
  $empty.hidden = filtered.length !== 0;
  updateCounts();
  setSelected(-1, false);

  // Render in chunks to keep UI snappy for 1020 cards
  $list.innerHTML = '';
  pendingRender = { i: 0, q };
  drawChunk();
}

// Finish rendering all remaining cards immediately (used before keyboard jumps)
function flushRender() {
  const st = pendingRender;
  if (!st) return;
  const frag = document.createDocumentFragment();
  while (st.i < filtered.length) frag.appendChild(cardEl(filtered[st.i++], st.q));
  $list.appendChild(frag);
  pendingRender = null;
}

function cardEl(w, q) {
  const div = document.createElement('article');
  div.className = 'card';
  div.id = 'w-' + w.word;
  const cur = flags[w.word] || 'none';
  div.dataset.flag = cur;

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
    <div class="flag-row" role="group" aria-label="Mark this word">
      ${['red', 'yellow', 'green'].map(c =>
        `<button class="dot ${c}${cur === c ? ' active' : ''}" data-flag="${c}" data-word="${esc(w.word)}" title="${c === 'red' ? 'Red — don’t know' : c === 'yellow' ? 'Yellow — unsure' : 'Green — known'} (click again to clear)"></button>`
      ).join('')}
    </div>
    ${sensesHtml}
  `;
  return div;
}

// Set (or toggle off) a flag for a word and sync the card in place
function setFlagFor(word, color) {
  if (!color || flags[word] === color) delete flags[word]; // same color again clears
  else flags[word] = color;
  saveFlags();
  updateCounts();
  const cur = flags[word] || 'none';
  const card = document.getElementById('w-' + word);
  if (card) {
    card.dataset.flag = cur;
    card.querySelectorAll('.dot').forEach(b => b.classList.toggle('active', flags[word] === b.dataset.flag));
  }
  // If the card no longer matches the active flag filter, drop it in place (keeps scroll position)
  if ($flag.value !== 'all' && cur !== $flag.value) {
    if (card) card.remove();
    const idx = filtered.findIndex(x => x.word === word);
    if (idx >= 0) filtered.splice(idx, 1);
    const visible = $list.querySelectorAll('.card').length;
    $info.textContent = `Showing ${visible} of ${WORDS.length} words`;
    $empty.hidden = visible !== 0;
    if (selIdx === idx) {
      selIdx = -1;
      if (filtered.length) setSelected(Math.min(idx, filtered.length - 1));
    } else if (selIdx > idx) selIdx--;
  }
}

// ---- Keyboard navigation: selected tile ----
let selIdx = -1;
function setSelected(i, scroll = true) {
  $list.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
  selIdx = i;
  if (i < 0 || i >= filtered.length) { selIdx = -1; return; }
  const el = document.getElementById('w-' + filtered[i].word);
  if (el) {
    el.classList.add('selected');
    if (scroll) el.scrollIntoView({ block: 'nearest' });
  }
}
// How many cards fit in one visual row of the grid
function columnCount() {
  const kids = $list.children;
  if (!kids.length) return 1;
  const top = kids[0].offsetTop;
  let n = 0;
  for (const k of kids) {
    if (k.offsetTop === top) n++;
    else break;
  }
  return Math.max(n, 1);
}
function moveSelection(key) {
  if (!filtered.length) return;
  flushRender();
  const cols = columnCount();
  let i = selIdx;
  if (i < 0) i = 0;
  else if (key === 'ArrowRight') i = Math.min(i + 1, filtered.length - 1);
  else if (key === 'ArrowLeft') i = Math.max(i - 1, 0);
  else if (key === 'ArrowDown') i = Math.min(i + cols, filtered.length - 1);
  else if (key === 'ArrowUp') i = Math.max(i - cols, 0);
  setSelected(i);
}
// Events (delegated)
$list.addEventListener('click', e => {
  const d = e.target.closest('.dot');
  if (d) {
    setFlagFor(d.dataset.word, d.dataset.flag);
    const idx = filtered.findIndex(x => 'w-' + x.word === d.closest('.card')?.id);
    if (idx >= 0) setSelected(idx, false);
    return;
  }
  // Clicking anywhere on a card selects it for keyboard nav
  const card = e.target.closest('.card');
  if (card) {
    const idx = filtered.findIndex(x => 'w-' + x.word === card.id);
    if (idx >= 0) setSelected(idx, false);
  }
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
$flag.addEventListener('change', applyFilters);
$sort.addEventListener('change', applyFilters);

document.getElementById('clearBtn').addEventListener('click', () => {
  $search.value = ''; $group.value = 'all'; $flag.value = 'all'; $sort.value = 'az'; applyFilters();
});
document.getElementById('resetBtn').addEventListener('click', () => {
  $search.value = ''; $group.value = 'all'; $flag.value = 'all'; applyFilters();
});
document.getElementById('randomBtn').addEventListener('click', () => {
  if (!filtered.length) return;
  flushRender();
  const idx = Math.floor(Math.random() * filtered.length);
  const el = document.getElementById('w-' + filtered[idx].word);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setSelected(idx, false);
});
document.getElementById('compactToggle').addEventListener('change', e => {
  document.body.classList.toggle('compact', e.target.checked);
});

// Global shortcuts: arrows move between tiles, R/Y/G flag, X clears, ? focuses search.
// Skipped while typing in a field so normal typing is unaffected.
document.addEventListener('keydown', e => {
  const t = e.target;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  if (typing) {
    if (e.key === 'Escape') t.blur();
    return;
  }
  if (e.key === '?') {
    e.preventDefault();
    $search.focus();
    $search.select();
    return;
  }
  if (e.key === 'Escape') { setSelected(-1, false); return; }
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    moveSelection(e.key);
    return;
  }
  const k = e.key.toLowerCase();
  if ((k === 'r' || k === 'y' || k === 'g' || k === 'x') && selIdx >= 0 && selIdx < filtered.length) {
    const color = k === 'r' ? 'red' : k === 'y' ? 'yellow' : k === 'g' ? 'green' : null;
    setFlagFor(filtered[selIdx].word, color);
  }
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
