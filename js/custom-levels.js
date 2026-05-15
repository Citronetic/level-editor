import { state } from './state.js';
import { updateInfoPanel, updateJsonPanel } from './panels.js';
import { switchEditMode, setTool, showViolation } from './design.js';
import { addCustomLevelToSidebar } from './sidebar.js';

// Set via initCustomLevels to avoid circular deps
let _zoomFit = null;
let _loadLevel = null;

export function initCustomLevels(zoomFitFn, loadLevelFn) {
  _zoomFit = zoomFitFn;
  _loadLevel = loadLevelFn;
}

function autoSave() {
  try { localStorage.setItem('customLevels', JSON.stringify(state.customLevels)); } catch(e) {}
}

export function updateModeToggleVisibility() {
  document.querySelector('.mode-toggle').style.display = state.isCustomLevel ? 'flex' : 'none';
  document.getElementById('readonly-badge').style.display = state.isCustomLevel ? 'none' : '';
}

export function cloneCurrentLevel() {
  if (!state.currentLevel) { showViolation('先选一个关卡再克隆'); return; }
  const sourceId = state.currentLevelId || 'level';
  document.getElementById('clone-source').textContent = sourceId;
  document.getElementById('clone-name').value = `${sourceId}-copy`;
  document.getElementById('clone-modal').style.display = 'flex';
}

export function closeCloneModal() { document.getElementById('clone-modal').style.display = 'none'; }

export function confirmClone() {
  const name = document.getElementById('clone-name').value.trim() || `custom-${Date.now()}`;
  const difficulty = document.getElementById('clone-difficulty').value;
  const cloned = JSON.parse(JSON.stringify(state.currentLevel));
  const seedId = `custom-${Date.now()}`;

  const entry = { seedId, name, difficulty, data: cloned };
  state.customLevels.push(entry);
  addCustomLevelToSidebar(entry);
  autoSave();

  state.currentLevel = cloned;
  state.currentLevelId = seedId;
  state.isCustomLevel = true;
  state.selectedElement = null;
  state.modified = true;
  state.doorStates = {};
  (state.currentLevel.DMS || []).forEach((dm, i) => {
    state.doorStates[i] = { iceRemaining: dm.DIC || 0, starSatisfied: !dm.DHS, turnState: (dm.TBD > 0) ? 'closed' : 'open' };
  });

  closeCloneModal();
  updateModeToggleVisibility();
  switchEditMode('design');
  setTool('cell');

  document.getElementById('level-title').textContent = name + (difficulty ? ` (${difficulty})` : '');
  document.querySelectorAll('.level-item').forEach(item => item.classList.toggle('active', item.dataset.seedId === seedId));
  updateInfoPanel();
  updateJsonPanel();
  _zoomFit();
}

export function createBlankLevel() {
  document.getElementById('new-level-modal').style.display = 'flex';
  updateNewLevelPreview();
}

export function closeNewLevelModal() {
  document.getElementById('new-level-modal').style.display = 'none';
}

function clampInt(id, min, max) {
  let v = parseInt(document.getElementById(id).value);
  if (isNaN(v)) v = min;
  v = Math.max(min, Math.min(max, v));
  document.getElementById(id).value = v;
  return v;
}

function generateLayout(w, h, layout) {
  const grid = {};
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const isBorder = x === 0 || x === w - 1 || y === 0 || y === h - 1;
      let kind = 'empty';
      if (layout === 'walled')        kind = isBorder ? 'wall' : 'cell';
      else if (layout === 'cells-only') kind = 'cell';
      grid[`${x},${y}`] = kind;
    }
  }
  return grid;
}

export function updateNewLevelPreview() {
  const w = clampInt('new-w', 3, 20);
  const h = clampInt('new-h', 3, 20);
  const layout = document.getElementById('new-layout').value;
  const grid = generateLayout(w, h, layout);
  let txt = '';
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      const k = grid[`${x},${y}`];
      txt += k === 'wall' ? '▮ ' : k === 'cell' ? '· ' : '  ';
    }
    txt += '\n';
  }
  document.getElementById('new-preview').textContent = txt;
}

export function confirmNewLevel() {
  const w = clampInt('new-w', 3, 20);
  const h = clampInt('new-h', 3, 20);
  const layout = document.getElementById('new-layout').value;
  const name = document.getElementById('new-name').value.trim() || `level-${Date.now()}`;
  const difficulty = document.getElementById('new-difficulty').value;
  const grid = generateLayout(w, h, layout);

  const cms = [], wms = [];
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const k = grid[`${x},${y}`];
      if (k === 'cell') cms.push({ "$type": "CM", "BPM": { "$type": "BPM", x, y } });
      else if (k === 'wall') wms.push({ "$type": "WM", "BPM": { "$type": "BPM", x, y }, "BI": 1 });
    }
  }

  const seedId = 'custom-' + Date.now();
  const levelData = {
    "$type": "LM",
    "BMS": [], "DMS": [], "WMS": wms, "CMS": cms,
    "IWMS": [], "GMS": [], "EMS": [], "CLMS": [],
    "CCMS": [], "GRM": [], "BSP": []
  };

  const entry = { seedId, name, difficulty, data: levelData };
  state.customLevels.push(entry);
  addCustomLevelToSidebar(entry);
  autoSave();

  state.currentLevel = levelData;
  state.currentLevelId = seedId;
  state.isCustomLevel = true;
  state.selectedElement = null;
  state.modified = true;
  state.doorStates = {};

  closeNewLevelModal();
  updateModeToggleVisibility();
  switchEditMode('design');
  setTool('cell');

  document.getElementById('level-title').textContent = name + (difficulty ? ` (${difficulty})` : '');
  document.querySelectorAll('.level-item').forEach(item => item.classList.toggle('active', item.dataset.seedId === seedId));
  updateInfoPanel();
  updateJsonPanel();
  _zoomFit();
}

export function importLevelFromFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        let levelData, name, difficulty;
        if (data.levelData) {
          levelData = data.levelData;
          name = data.name || file.name.replace('.json', '');
          difficulty = data.difficulty || '';
        } else {
          levelData = data;
          name = file.name.replace('.json', '');
          difficulty = '';
        }
        const seedId = 'imported-' + Date.now();
        const entry = { seedId, name, difficulty, data: levelData };
        state.customLevels.push(entry);
        addCustomLevelToSidebar(entry);
        _loadLevel(seedId);
      } catch(err) {
        showViolation('JSON 解析失败');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
