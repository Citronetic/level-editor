import { state } from './state.js';
import { cloneCustomLevelInline, deleteCustomLevel } from './custom-levels.js';

// loadLevel is imported lazily to avoid circular deps — set via initSidebar
let _loadLevel = null;

export function initSidebar(loadLevelFn) {
  _loadLevel = loadLevelFn;
  document.getElementById('search').addEventListener('input', applyFilters);
}

// Infer game source from cfg.game OR seedId prefix. Returns 'blockout'|'cbj'|'other'.
function gameFor(cfg) {
  if (cfg.game) return cfg.game;
  if (cfg.seedId?.startsWith('cbj-')) return 'cbj';
  if (cfg.seedId?.startsWith('t76') || cfg.seedId?.startsWith('t64') || cfg.seedId === 'mockLevel') return 'blockout';
  return 'other';
}

// Pretty display label per game/source.
function displayLabel(cfg) {
  const name = cfg.name || cfg.seedId;
  const g = gameFor(cfg);
  if (g === 'cbj') {
    // "Level 34" or "Derin Level 34 new" or "Levelstage1_album1"
    return name
      .replace(/^Level\s+tutorial/i, 'Tutor ')
      .replace(/^Levelstage1_album/i, 'Stage ')
      .replace(/^Level\s+mix\s*/i, 'Mix ')
      .replace(/^Derin\s+Level\s+/i, 'Derin ')
      .replace(/^New\s+Level\s+/i, 'New ');
  }
  return cfg.seedId;
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
    const game = gameFor(cfg);
    item.dataset.game = game;
    item.dataset.name = (cfg.name || cfg.seedId).toLowerCase();

    let badges = '';
    if (game === 'cbj')         badges += '<span class="badge badge-cbj">CBJ</span>';
    else if (game === 'blockout') badges += '<span class="badge badge-bo">BO</span>';
    if (cfg.isExtra && game !== 'cbj') badges += '<span class="badge badge-extra">T64</span>';
    if (cfg.isSuperHard) badges += '<span class="badge badge-superhard">S-Hard</span>';
    else if (cfg.isHard) badges += '<span class="badge badge-hard">Hard</span>';

    item.innerHTML = `
      <div class="li-left">
        <span class="li-num">${cfg.levelIndex}</span>
        <span class="li-name">${displayLabel(cfg)}</span>
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
  const hdr = document.getElementById('hdr-total');
  if (hdr) hdr.textContent = total;
}

export function setFilter(f, btn) {
  state.activeFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn));
  applyFilters();
}

export function applyFilters() {
  const q = document.getElementById('search').value.toLowerCase();
  document.querySelectorAll('.level-item').forEach(item => {
    const text = `${item.dataset.seedId} ${item.dataset.index} ${item.dataset.name || ''} ${item.textContent}`.toLowerCase();
    let show = text.includes(q);
    if (state.activeFilter === 'hard') show = show && (item.querySelector('.badge-hard') || item.querySelector('.badge-superhard'));
    if (state.activeFilter === 't64') show = show && item.dataset.type === 't64';
    if (state.activeFilter === 'blockout') show = show && item.dataset.game === 'blockout';
    if (state.activeFilter === 'cbj')      show = show && item.dataset.game === 'cbj';
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
    <div class="li-actions">
      <button class="li-action-btn" data-act="clone" title="复制并编辑">＋</button>
      <button class="li-action-btn li-action-danger" data-act="delete" title="删除">×</button>
    </div>
    <div class="li-badges"><span class="badge" style="background:rgba(167,139,250,.15);color:var(--accent-bright)">自定义</span>${diffBadge}</div>`;
  item.addEventListener('click', (e) => {
    if (e.target.closest('.li-actions')) return;
    _loadLevel(entry.seedId);
  });
  item.querySelector('[data-act="clone"]').addEventListener('click', (e) => {
    e.stopPropagation();
    cloneCustomLevelInline(entry.seedId);
  });
  item.querySelector('[data-act="delete"]').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteCustomLevel(entry.seedId);
  });
  list.insertBefore(item, list.firstChild);
}
