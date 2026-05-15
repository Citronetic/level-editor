import { state } from './state.js';
import { renderLevel, canvas } from './render.js';
import { updateInfoPanel, updateSelectionPanel, updateJsonPanel } from './panels.js';

// Lazy imports set via initDesign to break circular deps
let _mouseToGrid = null;
let _zoomFit = null;

export function initDesign(mouseToGridFn, zoomFitFn) {
  _mouseToGrid = mouseToGridFn;
  _zoomFit = zoomFitFn;
}

function autoSave() {
  try { localStorage.setItem('customLevels', JSON.stringify(state.customLevels)); } catch(e) {}
}

export function showViolation(msg) {
  const toast = document.getElementById('violation-toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

export function switchEditMode(mode) {
  const wrap = document.getElementById('canvas-wrap');
  if (mode === 'design' && !state.isCustomLevel) {
    showViolation('只读关卡，请先克隆或新建');
    return;
  }
  state.editMode = mode;
  document.getElementById('design-tools').style.display = mode === 'design' ? 'flex' : 'none';
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  wrap.style.cursor = mode === 'design' ? 'crosshair' : 'default';
  state.selectedElement = null;
  if (mode === 'design') setTool(state.activeTool);
  renderLevel();
  updateInfoPanel();
  updateSelectionPanel();
}

export function setTool(tool, btnEl) {
  state.activeTool = tool;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  const showColor = tool === 'block' || tool === 'door' || tool === 'colorcell';
  document.getElementById('block-tool-opts').style.display = showColor ? 'inline-flex' : 'none';
  document.getElementById('ice-tool-opts').style.display = tool === 'block' ? 'inline-flex' : 'none';
  state.selectedElement = null;
  renderLevel();
  updateSelectionPanel();
}

export function setColor(c, btnEl) {
  document.getElementById('place-color').value = String(c);
  document.querySelectorAll('.color-swatch').forEach(b => b.classList.toggle('active', parseInt(b.dataset.color) === c));
}

export function handleDesignClick(e) {
  if (state.editMode !== 'design' || !state.currentLevel) return false;
  const { gridX, gridY } = _mouseToGrid(e);
  const tool = state.activeTool;

  // Shift+click: extend selected block/door
  if (e.shiftKey && state.selectedElement) {
    const sel = state.selectedElement;
    if (sel.type === 'block' && state.currentLevel.BMS?.[sel.index]) {
      const bm = state.currentLevel.BMS[sel.index];
      const positions = bm.BPMS || [];
      if (positions.some(p => p.x === gridX && p.y === gridY)) return true;
      const isAdj = positions.some(p =>
        (Math.abs(p.x - gridX) === 1 && p.y === gridY) ||
        (Math.abs(p.y - gridY) === 1 && p.x === gridX)
      );
      if (!isAdj) { showViolation('Shift+点击需要与方块相邻'); return true; }
      const isCell = (state.currentLevel.CMS||[]).some(c => c.BPM.x === gridX && c.BPM.y === gridY);
      if (!isCell) { showViolation('需要先铺棋盘格'); return true; }
      const otherBlock = (state.currentLevel.BMS||[]).findIndex((b,i) => i !== sel.index && (b.BPMS||[]).some(p => p.x === gridX && p.y === gridY));
      if (otherBlock >= 0) { showViolation('已有其他方块'); return true; }
      positions.push({ "$type": "BPM", x: gridX, y: gridY });
      afterPaint();
      return true;
    }
    if (sel.type === 'door' && state.currentLevel.DMS?.[sel.index]) {
      const dm = state.currentLevel.DMS[sel.index];
      const positions = dm.BPMS || [];
      if (positions.some(p => p.x === gridX && p.y === gridY)) return true;
      const isAdj = positions.some(p =>
        (Math.abs(p.x - gridX) === 1 && p.y === gridY) ||
        (Math.abs(p.y - gridY) === 1 && p.x === gridX)
      );
      if (!isAdj) { showViolation('Shift+点击需要与门相邻'); return true; }
      positions.push({ "$type": "BPM", x: gridX, y: gridY });
      afterPaint();
      return true;
    }
  }

  switch (tool) {
    case 'cell':      return paintCell(gridX, gridY);
    case 'wall':      return paintWall(gridX, gridY);
    case 'curtain':   return paintCurtain(gridX, gridY);
    case 'generator': return paintGenerator(gridX, gridY);
    case 'door':      return paintDoor(gridX, gridY);
    case 'colorcell': return paintColorCell(gridX, gridY);
    case 'grinder':   return paintGrinder(gridX, gridY);
    case 'erase':     return eraseAt(gridX, gridY);
    default:          return paintBlock(gridX, gridY);
  }
}

function afterPaint() {
  state.modified = true;
  const prevW = canvas.width, prevH = canvas.height;
  renderLevel();
  if (canvas.width !== prevW || canvas.height !== prevH) _zoomFit();
  updateInfoPanel();
  updateSelectionPanel();
  updateJsonPanel();
  if (state.isCustomLevel) autoSave();
}

function clearTerrainAt(x, y) {
  const removeFrom = (key, hasBPMS) => {
    if (!state.currentLevel[key]) return;
    for (let i = state.currentLevel[key].length - 1; i >= 0; i--) {
      const it = state.currentLevel[key][i];
      const hit = hasBPMS
        ? (it.BPMS||[]).some(p => p.x === x && p.y === y)
        : (it.BPM && it.BPM.x === x && it.BPM.y === y);
      if (hit) state.currentLevel[key].splice(i, 1);
    }
  };
  removeFrom('CMS', false);
  removeFrom('WMS', false);
  removeFrom('DMS', true);
}

function paintCell(x, y) {
  if (!state.currentLevel.CMS) state.currentLevel.CMS = [];
  const idx = state.currentLevel.CMS.findIndex(c => c.BPM.x === x && c.BPM.y === y);
  if (idx >= 0) {
    state.currentLevel.CMS.splice(idx, 1);
  } else {
    clearTerrainAt(x, y);
    state.currentLevel.CMS.push({ "$type": "CM", "BPM": { "$type": "BPM", x, y } });
  }
  afterPaint();
  return true;
}

function paintWall(x, y) {
  if (!state.currentLevel.WMS) state.currentLevel.WMS = [];
  const idx = state.currentLevel.WMS.findIndex(w => w.BPM.x === x && w.BPM.y === y);
  if (idx >= 0) {
    state.currentLevel.WMS.splice(idx, 1);
  } else {
    clearTerrainAt(x, y);
    state.currentLevel.WMS.push({ "$type": "WM", "BPM": { "$type": "BPM", x, y }, "BI": 1 });
  }
  afterPaint();
  return true;
}

function paintBlock(x, y) {
  const isCell = (state.currentLevel.CMS||[]).some(c => c.BPM.x === x && c.BPM.y === y);
  if (!isCell) { showViolation('需要先用"棋盘格"工具铺底'); return true; }
  const isWall = (state.currentLevel.WMS||[]).some(w => w.BPM.x === x && w.BPM.y === y);
  if (isWall) { showViolation('不能放在外墙上'); return true; }

  const existingBlock = (state.currentLevel.BMS||[]).findIndex(bm =>
    (bm.BPMS||[]).some(p => p.x === x && p.y === y)
  );
  if (existingBlock >= 0) {
    state.selectedElement = { type: 'block', index: existingBlock };
    renderLevel(); updateInfoPanel(); updateSelectionPanel();
    return true;
  }

  if (state.selectedElement?.type === 'block' && state.currentLevel.BMS?.[state.selectedElement.index]) {
    const bm = state.currentLevel.BMS[state.selectedElement.index];
    const positions = bm.BPMS || [];
    const isAdj = positions.some(p =>
      (Math.abs(p.x - x) === 1 && p.y === y) || (Math.abs(p.y - y) === 1 && p.x === x)
    );
    if (isAdj) {
      positions.push({ "$type": "BPM", x, y });
      afterPaint();
      updateSelectionPanel();
      return true;
    }
  }

  const bct = parseInt(document.getElementById('place-color').value);
  const ice = parseInt(document.getElementById('place-ice').value) || 0;
  if (!state.currentLevel.BMS) state.currentLevel.BMS = [];
  state.currentLevel.BMS.push({
    "$type": "BM", "BCT": bct,
    "BPMS": [{ "$type": "BPM", x, y }],
    "BIC": ice, "BAD": 0, "KID": 0,
    "LID": ice > 0 ? 1 : 0,
    "BHS": false, "BD": ice, "ILE": false, "LBCT": 0
  });
  state.selectedElement = { type: 'block', index: state.currentLevel.BMS.length - 1 };
  afterPaint();
  updateSelectionPanel();
  return true;
}

function paintCurtain(x, y) {
  if (!state.currentLevel.CLMS) state.currentLevel.CLMS = [];
  const idx = state.currentLevel.CLMS.findIndex(cl => (cl.BPMS||[]).some(p => p.x === x && p.y === y));
  if (idx >= 0) {
    state.currentLevel.CLMS.splice(idx, 1);
  } else {
    state.currentLevel.CLMS.push({
      "$type": "CLM",
      "BPMS": [{ "$type": "BPM", x, y }],
      "CLC": 1
    });
  }
  afterPaint();
  return true;
}

function paintGenerator(x, y) {
  if (!state.currentLevel.GMS) state.currentLevel.GMS = [];
  const idx = state.currentLevel.GMS.findIndex(g => g.BPM && g.BPM.x === x && g.BPM.y === y);
  if (idx >= 0) {
    state.currentLevel.GMS.splice(idx, 1);
  } else {
    state.currentLevel.GMS.push({
      "$type": "GM",
      "BPM": { "$type": "BPM", x, y },
      "IH": false, "GBMS": []
    });
  }
  afterPaint();
  return true;
}

function paintDoor(x, y) {
  if (!state.currentLevel.DMS) state.currentLevel.DMS = [];
  const idx = state.currentLevel.DMS.findIndex(d => (d.BPMS||[]).some(p => p.x === x && p.y === y));
  if (idx >= 0) {
    state.selectedElement = { type: 'door', index: idx };
    afterPaint();
    updateSelectionPanel();
  } else if (state.selectedElement?.type === 'door' && state.currentLevel.DMS?.[state.selectedElement.index]) {
    const dm = state.currentLevel.DMS[state.selectedElement.index];
    const positions = dm.BPMS || [];
    const isAdj = positions.some(p =>
      (Math.abs(p.x - x) === 1 && p.y === y) || (Math.abs(p.y - y) === 1 && p.x === x)
    );
    if (isAdj) {
      positions.push({ "$type": "BPM", x, y });
      afterPaint();
      updateSelectionPanel();
    } else {
      createNewDoor(x, y);
    }
  } else {
    createNewDoor(x, y);
  }
  return true;
}

function createNewDoor(x, y) {
  clearTerrainAt(x, y);
  const bct = parseInt(document.getElementById('place-color').value);
  state.currentLevel.DMS.push({
    "$type": "DM", "BCT": bct,
    "BPMS": [{ "$type": "BPM", x, y }],
    "IH": true, "BI": 1, "DIC": 0, "TBD": 0, "DHS": false
  });
  const newIdx = state.currentLevel.DMS.length - 1;
  state.doorStates[newIdx] = { iceRemaining: 0, starSatisfied: true, turnState: 'open' };
  state.selectedElement = { type: 'door', index: newIdx };
  afterPaint();
  updateSelectionPanel();
}

function paintColorCell(x, y) {
  if (!state.currentLevel.CCMS) state.currentLevel.CCMS = [];
  const bct = parseInt(document.getElementById('place-color').value);

  const existingIdx = state.currentLevel.CCMS.findIndex(cc =>
    (cc.BPMS||[]).some(p => p.x === x && p.y === y)
  );
  if (existingIdx >= 0) {
    const cc = state.currentLevel.CCMS[existingIdx];
    cc.BPMS = cc.BPMS.filter(p => !(p.x === x && p.y === y));
    if (cc.BPMS.length === 0) state.currentLevel.CCMS.splice(existingIdx, 1);
  } else {
    let addedToExisting = false;
    for (const cc of state.currentLevel.CCMS) {
      if (cc.BCT !== bct) continue;
      const isAdjacent = (cc.BPMS||[]).some(p =>
        (Math.abs(p.x - x) === 1 && p.y === y) || (Math.abs(p.y - y) === 1 && p.x === x)
      );
      if (isAdjacent) {
        cc.BPMS.push({ "$type": "BPM", x, y });
        addedToExisting = true;
        break;
      }
    }
    if (!addedToExisting) {
      state.currentLevel.CCMS.push({
        "$type": "CCM",
        "BPMS": [{ "$type": "BPM", x, y }],
        "BCT": bct
      });
    }
  }
  afterPaint();
  return true;
}

function paintGrinder(x, y) {
  if (!state.currentLevel.GRM) state.currentLevel.GRM = [];

  const existingIdx = state.currentLevel.GRM.findIndex(g =>
    (g.BPM && g.BPM.x === x && g.BPM.y === y) ||
    (g.BPMS||[]).some(p => p.x === x && p.y === y)
  );
  if (existingIdx >= 0) {
    const g = state.currentLevel.GRM[existingIdx];
    if (g.BPM && g.BPM.x === x && g.BPM.y === y) {
      state.currentLevel.GRM.splice(existingIdx, 1);
    } else {
      g.BPMS = (g.BPMS||[]).filter(p => !(p.x === x && p.y === y));
    }
  } else {
    const lastGrinder = state.currentLevel.GRM.length > 0 ? state.currentLevel.GRM[state.currentLevel.GRM.length - 1] : null;
    if (lastGrinder && lastGrinder._building) {
      lastGrinder.BPMS.push({ "$type": "BPM", x, y });
    } else {
      state.currentLevel.GRM.push({
        "$type": "GDM",
        "BPM": { "$type": "BPM", x, y },
        "BPMS": [{ "$type": "BPM", x, y }],
        "_building": true
      });
    }
  }
  afterPaint();
  return true;
}

function eraseAt(x, y) {
  const matchPos = (p) => p.x === x && p.y === y;
  const eraseFromList = (key, hasBPMS) => {
    if (!state.currentLevel[key]) return false;
    let any = false;
    for (let i = state.currentLevel[key].length - 1; i >= 0; i--) {
      const it = state.currentLevel[key][i];
      const hit = hasBPMS
        ? (it.BPMS||[]).some(matchPos)
        : (it.BPM && matchPos(it.BPM));
      if (hit) { state.currentLevel[key].splice(i, 1); any = true; }
    }
    return any;
  };
  eraseFromList('BMS',  true);
  eraseFromList('DMS',  true);
  eraseFromList('EMS',  true);
  eraseFromList('CLMS', true);
  eraseFromList('CCMS', true);
  eraseFromList('GRM',  true);
  eraseFromList('GMS',  false);
  eraseFromList('WMS',  false);
  eraseFromList('CMS',  false);
  state.selectedElement = null;
  afterPaint();
  return true;
}

export function exportLevel() {
  if (!state.currentLevel) return;
  const json = JSON.stringify(state.currentLevel);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.currentLevelId || 'level'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
