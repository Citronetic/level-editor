import { state } from './state.js';

// loadLevel is imported lazily to avoid circular deps — set via initSidebar
let _loadLevel = null;

export function initSidebar(loadLevelFn) {
  _loadLevel = loadLevelFn;
  document.getElementById('search').addEventListener('input', applyFilters);
}

export function buildLevelList() {
  const list = document.getElementById('level-list');
  list.innerHTML = '';
  state.levelsConfig.forEach(cfg => {
    const item = document.createElement('div');
    item.className = 'level-item';
    item.dataset.seedId = cfg.seedId;
    item.dataset.index = cfg.levelIndex;
    item.dataset.type = cfg.seedId.startsWith('t64') ? 't64' : cfg.seedId.startsWith('t76') ? 't76' : 'other';

    let badges = '';
    if (cfg.isExtra) badges += '<span class="badge badge-extra">T64</span>';
    if (cfg.isSuperHard) badges += '<span class="badge badge-superhard">S-Hard</span>';
    else if (cfg.isHard) badges += '<span class="badge badge-hard">Hard</span>';

    item.innerHTML = `
      <div class="li-left">
        <span class="li-num">${cfg.levelIndex}</span>
        <span class="li-name">${cfg.seedId}</span>
      </div>
      <div class="li-badges">${badges}</div>`;
    item.onclick = () => _loadLevel(cfg.seedId);
    list.appendChild(item);
  });

  const total = state.levelsConfig.length;
  const hard = state.levelsConfig.filter(c=>c.isHard).length;
  const superhard = state.levelsConfig.filter(c=>c.isSuperHard).length;
  document.getElementById('stat-total').textContent = `${total} Levels`;
  document.getElementById('stat-hard').textContent = `${hard} Hard`;
  document.getElementById('stat-superhard').textContent = `${superhard} S-Hard`;
}

export function setFilter(f, btn) {
  state.activeFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn));
  applyFilters();
}

export function applyFilters() {
  const q = document.getElementById('search').value.toLowerCase();
  document.querySelectorAll('.level-item').forEach(item => {
    const text = `${item.dataset.seedId} ${item.dataset.index} ${item.textContent}`.toLowerCase();
    let show = text.includes(q);
    if (state.activeFilter === 'hard') show = show && (item.querySelector('.badge-hard') || item.querySelector('.badge-superhard'));
    if (state.activeFilter === 't64') show = show && item.dataset.type === 't64';
    item.style.display = show ? '' : 'none';
  });
}

export function addCustomLevelToSidebar(entry) {
  const list = document.getElementById('level-list');
  const item = document.createElement('div');
  item.className = 'level-item';
  item.dataset.seedId = entry.seedId;
  item.dataset.index = 'custom';
  item.dataset.type = 'custom';
  const diffBadge = entry.difficulty === 'hard' ? '<span class="badge badge-hard">Hard</span>'
    : entry.difficulty === 'superhard' ? '<span class="badge badge-superhard">S-Hard</span>' : '';
  item.innerHTML = `
    <div class="li-left">
      <span class="li-num" style="color:var(--accent-bright)">✎</span>
      <span class="li-name">${entry.name}</span>
    </div>
    <div class="li-badges"><span class="badge" style="background:rgba(91,124,247,.15);color:var(--accent-bright)">自定义</span>${diffBadge}</div>`;
  item.onclick = () => _loadLevel(entry.seedId);
  list.insertBefore(item, list.firstChild);
}
