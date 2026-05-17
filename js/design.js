import { state } from './state.js';
import { SHAPES, SHAPE_DEFAULT_BAD } from './constants.js';
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
  // The block-tool-opts row lives outside design-tools (it's the 3rd toolbar
  // row), so hide it explicitly when leaving design mode.
  const blockOpts = document.getElementById('block-tool-opts');
  if (blockOpts && mode !== 'design') blockOpts.style.display = 'none';
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  wrap.style.cursor = mode === 'design' ? 'crosshair' : 'default';
  state.selectedElement = null;
  // Leaving design → drop any in-progress custom-shape draft
  if (mode !== 'design' && state.drawMode) cancelDraftBlock();
  if (mode === 'design') setTool(state.activeTool);
  renderLevel();
  updateInfoPanel();
  updateSelectionPanel();
}

export function setTool(tool, btnEl) {
  state.activeTool = tool;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  const showColor = tool === 'block' || tool === 'door' || tool === 'colorcell';
  // block-tool-opts is now its own toolbar row — use flex (full row), not
  // inline-flex (shrink-to-fit). Hidden when no colored tool is active.
  document.getElementById('block-tool-opts').style.display = showColor ? 'flex' : 'none';
  document.getElementById('ice-tool-opts').style.display = tool === 'block' ? 'inline-flex' : 'none';
  // Shape palette only meaningful for block tool
  const shapePalette = document.getElementById('shape-palette');
  if (shapePalette) shapePalette.style.display = tool === 'block' ? 'inline-flex' : 'none';
  // Leaving block tool while drafting custom shape → discard draft to avoid orphan state
  if (tool !== 'block' && state.drawMode) cancelDraftBlock();
  state.selectedElement = null;
  renderLevel();
  updateSelectionPanel();
}

export function setShape(shapeKey, btnEl) {
  if (!SHAPES[shapeKey]) return;
  state.placeShape = shapeKey;
  document.querySelectorAll('#shape-palette .shape-btn').forEach(b => b.classList.toggle('active', b.dataset.shape === shapeKey));
}

export function enterDrawMode() {
  state.drawMode = true;
  state.draftCells = [];
  document.getElementById('shape-palette').style.display = 'none';
  document.getElementById('draw-mode-bar').style.display = 'inline-flex';
  document.getElementById('draft-count').textContent = '0';
  renderLevel();
}

export function cancelDraftBlock() {
  state.drawMode = false;
  state.draftCells = [];
  document.getElementById('draw-mode-bar').style.display = 'none';
  if (state.activeTool === 'block') {
    document.getElementById('shape-palette').style.display = 'inline-flex';
  }
  renderLevel();
}

export function commitDraftBlock() {
  if (!state.currentLevel) return;
  if (state.draftCells.length === 0) {
    showViolation('至少选 1 格');
    return;
  }
  const bct = parseInt(document.getElementById('place-color').value);
  const ice = parseInt(document.getElementById('place-ice').value) || 0;
  if (!state.currentLevel.BMS) state.currentLevel.BMS = [];
  state.currentLevel.BMS.push({
    "$type": "BM", "BCT": bct,
    "BPMS": state.draftCells.map(([x, y]) => ({ "$type": "BPM", x, y })),
    "BIC": ice, "BAD": 0, "KID": 0,
    "LID": ice > 0 ? 1 : 0,
    "BHS": false, "BD": ice, "ILE": false, "LBCT": 0
  });
  state.selectedElement = { type: 'block', index: state.currentLevel.BMS.length - 1 };
  state.drawMode = false;
  state.draftCells = [];
  document.getElementById('draw-mode-bar').style.display = 'none';
  if (state.activeTool === 'block') {
    document.getElementById('shape-palette').style.display = 'inline-flex';
  }
  afterPaint();
  updateSelectionPanel();
}

function toggleDraftCell(x, y) {
  const lvl = state.currentLevel;
  if (!lvl) return false;
  const isCell = (lvl.CMS || []).some(c => c.BPM.x === x && c.BPM.y === y);
  if (!isCell) { showViolation('需要先铺棋盘格'); return true; }
  const isWall = (lvl.WMS || []).some(w => w.BPM.x === x && w.BPM.y === y);
  if (isWall) { showViolation('不能选在外墙上'); return true; }
  const otherBlock = (lvl.BMS || []).some(b => (b.BPMS || []).some(p => p.x === x && p.y === y));
  if (otherBlock) { showViolation('已有其他方块'); return true; }

  const idx = state.draftCells.findIndex(([cx, cy]) => cx === x && cy === y);
  if (idx >= 0) {
    state.draftCells.splice(idx, 1);
  } else {
    // Require contiguity after the first cell so we don't accumulate disjoint groups.
    if (state.draftCells.length > 0) {
      const adj = state.draftCells.some(([cx, cy]) =>
        (Math.abs(cx - x) === 1 && cy === y) || (Math.abs(cy - y) === 1 && cx === x)
      );
      if (!adj) { showViolation('需与已勾选格相邻'); return true; }
    }
    state.draftCells.push([x, y]);
  }
  document.getElementById('draft-count').textContent = String(state.draftCells.length);
  renderLevel();
  return true;
}

export function setColor(c, btnEl) {
  document.getElementById('place-color').value = String(c);
  document.querySelectorAll('.color-swatch').forEach(b => b.classList.toggle('active', parseInt(b.dataset.color) === c));
}

export function handleDesignClick(e) {
  if (state.editMode !== 'design' || !state.currentLevel) return false;
  const { gridX, gridY } = _mouseToGrid(e);
  const tool = state.activeTool;

  // Draw-mode owns the canvas — every click toggles a draft cell, ignore shift.
  if (state.drawMode) return toggleDraftCell(gridX, gridY);

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
    if (sel.type === 'curtain' && state.currentLevel.CLMS?.[sel.index]) {
      const cl = state.currentLevel.CLMS[sel.index];
      const positions = cl.BPMS || [];
      if (positions.some(p => p.x === gridX && p.y === gridY)) return true;
      const isAdj = positions.some(p =>
        (Math.abs(p.x - gridX) === 1 && p.y === gridY) ||
        (Math.abs(p.y - gridY) === 1 && p.x === gridX)
      );
      if (!isAdj) { showViolation('Shift+点击需要与帘锁相邻'); return true; }
      const otherCurtain = (state.currentLevel.CLMS||[]).findIndex((c,i) => i !== sel.index && (c.BPMS||[]).some(p => p.x === gridX && p.y === gridY));
      if (otherCurtain >= 0) { showViolation('已属于其他帘锁组'); return true; }
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
  // Custom-shape draw mode: clicks toggle cells in/out of the draft instead of placing.
  if (state.drawMode) return toggleDraftCell(x, y);

  // Click on an existing block selects it (Shift+click extends — see handleDesignClick).
  const existingBlock = (state.currentLevel.BMS||[]).findIndex(bm =>
    (bm.BPMS||[]).some(p => p.x === x && p.y === y)
  );
  if (existingBlock >= 0) {
    state.selectedElement = { type: 'block', index: existingBlock };
    renderLevel(); updateInfoPanel(); updateSelectionPanel();
    return true;
  }

  // Resolve shape offsets. (dx, dy_screen) — flip dy_screen for game-y (+up).
  const shapeKey = state.placeShape || '1x1';
  const offsets = SHAPES[shapeKey] || SHAPES['1x1'];
  const positions = offsets.map(([dx, dy]) => ({ x: x + dx, y: y - dy }));

  // Validate every cell of the shape: must be on CMS, not a wall, not on another block.
  for (const p of positions) {
    const onCell = (state.currentLevel.CMS||[]).some(c => c.BPM.x === p.x && c.BPM.y === p.y);
    if (!onCell) { showViolation(`${shapeKey} 形状超出棋盘格 (需要先用"棋盘格"铺底)`); return true; }
    const onWall = (state.currentLevel.WMS||[]).some(w => w.BPM.x === p.x && w.BPM.y === p.y);
    if (onWall) { showViolation(`${shapeKey} 形状与外墙重叠`); return true; }
    const onOther = (state.currentLevel.BMS||[]).some(bm => (bm.BPMS||[]).some(q => q.x === p.x && q.y === p.y));
    if (onOther) { showViolation(`${shapeKey} 形状与已有方块重叠`); return true; }
  }

  const bct = parseInt(document.getElementById('place-color').value);
  const ice = parseInt(document.getElementById('place-ice').value) || 0;
  const bad = SHAPE_DEFAULT_BAD[shapeKey] || 0;
  if (!state.currentLevel.BMS) state.currentLevel.BMS = [];

  // For a single-cell click, auto-merge into an adjacent same-color block if
  // there is one — quick way to sketch contiguous block groups without
  // Shift+click. Multi-cell shapes (2x2, L, T, I, +) stay as separate
  // entries, matching the explicit decision in commit a6f606e.
  if (shapeKey === '1x1') {
    const adjIdx = state.currentLevel.BMS.findIndex(bm =>
      bm.BCT === bct && (bm.BPMS || []).some(p =>
        (Math.abs(p.x - x) === 1 && p.y === y) ||
        (Math.abs(p.y - y) === 1 && p.x === x)
      )
    );
    if (adjIdx >= 0) {
      state.currentLevel.BMS[adjIdx].BPMS.push({ "$type": "BPM", x, y });
      state.selectedElement = { type: 'block', index: adjIdx };
      afterPaint();
      updateSelectionPanel();
      return true;
    }
  }

  state.currentLevel.BMS.push({
    "$type": "BM", "BCT": bct,
    "BPMS": positions.map(p => ({ "$type": "BPM", x: p.x, y: p.y })),
    "BIC": ice, "BAD": bad, "KID": 0,
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
    // Click an existing curtain cell: select it (for CLC editing or Shift+extend)
    state.selectedElement = { type: 'curtain', index: idx };
    renderLevel(); updateInfoPanel(); updateSelectionPanel();
    return true;
  }

  // Plain click on empty cell creates a fresh 1-cell curtain group.
  // Use Shift+click on an adjacent cell to extend the selected curtain.
  state.currentLevel.CLMS.push({
    "$type": "CLM",
    "BPMS": [{ "$type": "BPM", x, y }],
    "CLC": 1
  });
  state.selectedElement = { type: 'curtain', index: state.currentLevel.CLMS.length - 1 };
  afterPaint();
  updateSelectionPanel();
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

// Edge-slot click resolution: if the user clicked a void cell that's directly
// adjacent to a CMS cell, treat the click as targeting that cell. Lets people
// click "outside" the board to place a door, matching the GDD MVP affordance.
function resolveDoorEdgeSlot(x, y) {
  const lvl = state.currentLevel;
  if (!lvl) return null;
  const onCell = (lvl.CMS || []).some(c => c.BPM.x === x && c.BPM.y === y);
  const onDoor = (lvl.DMS || []).some(d => (d.BPMS || []).some(p => p.x === x && p.y === y));
  if (onCell || onDoor) return null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if ((lvl.CMS || []).some(c => c.BPM.x === nx && c.BPM.y === ny)) return { x: nx, y: ny };
  }
  return null;
}

function paintDoor(x, y) {
  if (!state.currentLevel.DMS) state.currentLevel.DMS = [];
  // If the click landed in a void cell next to a CMS cell, treat it as a slot click.
  const slot = resolveDoorEdgeSlot(x, y);
  if (slot) { x = slot.x; y = slot.y; }
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

// Layer ordering: top of the visual stack first, bottom last. The eraser
// peels ONE layer per click. Click again to remove what's underneath
// (e.g., first click removes a block, second click clears the cell under it).
const ERASE_LAYERS = [
  ['BMS',  true],   // block (topmost gameplay element)
  ['DMS',  true],   // door
  ['EMS',  true],   // elevator
  ['CLMS', true],   // curtain
  ['CCMS', true],   // color cell
  ['GRM',  true],   // grinder
  ['GMS',  false],  // generator
  ['WMS',  false],  // wall
  ['CMS',  false],  // checker cell (bottom-most)
];

function eraseAt(x, y) {
  const matchPos = (p) => p.x === x && p.y === y;
  for (const [key, hasBPMS] of ERASE_LAYERS) {
    const list = state.currentLevel[key];
    if (!list) continue;
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      const hit = hasBPMS
        ? (it.BPMS || []).some(matchPos)
        : (it.BPM && matchPos(it.BPM));
      if (hit) {
        list.splice(i, 1);
        state.selectedElement = null;
        afterPaint();
        return true;
      }
    }
  }
  // Nothing to erase at this cell — no-op.
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
