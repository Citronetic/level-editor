import { state } from './state.js';
import { buildLevelList, setFilter, initSidebar, addCustomLevelToSidebar } from './sidebar.js';
import { setupPanZoom, zoomIn, zoomOut, zoomFit, mouseToGrid } from './interaction.js';
import { renderLevel } from './render.js';
import {
  switchTab, buildLegend, updateInfoPanel, updateJsonPanel,
  selectBlock, editProp, editDoorProp, editCurtainProp,
  doorMeltIce, doorResetIce, doorToggleStar, doorToggleTurn,
  removeCellFromElement, deleteSelected
} from './panels.js';
import { switchEditMode, setTool, setColor, setShape, enterDrawMode, commitDraftBlock, cancelDraftBlock, exportLevel, showViolation, initDesign } from './design.js';
import {
  cloneCurrentLevel, confirmClone, closeCloneModal,
  createBlankLevel, confirmNewLevel, closeNewLevelModal,
  updateNewLevelPreview, importLevelFromFile, updateModeToggleVisibility,
  initCustomLevels
} from './custom-levels.js';
import { playStart, playReset, playStop, refreshPlayButtons, tickAnim, updateHUD } from './play-ui.js';
import { stopGame, isPlaying, trySlide } from './game.js';

// ── Wire up lazy dependencies ──
initDesign(mouseToGrid, zoomFit);
initCustomLevels(zoomFit, loadLevel);
initSidebar(loadLevel);

// ── Expose to inline HTML handlers ──
Object.assign(window, {
  setFilter, switchEditMode, createBlankLevel, cloneCurrentLevel,
  importLevelFromFile, exportLevel, setTool, setColor,
  setShape, enterDrawMode, commitDraftBlock, cancelDraftBlock,
  zoomIn, zoomOut, zoomFit, switchTab,
  closeNewLevelModal, confirmNewLevel, updateNewLevelPreview,
  closeCloneModal, confirmClone,
  selectBlock, editProp, editDoorProp, editCurtainProp,
  doorMeltIce, doorResetIce, doorToggleStar, doorToggleTurn,
  removeCellFromElement, deleteSelected,
  playStart, playReset, playStop,
});

// ── Keyboard handler (consolidated) ──
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  // Escape closes modals
  if (e.key === 'Escape') {
    if (document.getElementById('new-level-modal').style.display === 'flex') closeNewLevelModal();
    if (document.getElementById('clone-modal').style.display === 'flex') closeCloneModal();
    return;
  }

  // Delete/Backspace deletes selected element (custom levels only)
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedElement && state.currentLevel) {
    if (state.isCustomLevel) {
      deleteSelected();
    }
    e.preventDefault();
    return;
  }

  // ── Play-mode movement (WASD + arrows) ─────────────────────────────
  // Slides the currently selected block all the way in the chosen direction,
  // mirroring real-game swipe behavior. Game Y is +up (see mouseToGrid flip).
  if (isPlaying()) {
    const DIR = {
      w: [0, 1],  W: [0, 1],  ArrowUp: [0, 1],
      s: [0, -1], S: [0, -1], ArrowDown: [0, -1],
      a: [-1, 0], A: [-1, 0], ArrowLeft: [-1, 0],
      d: [1, 0],  D: [1, 0],  ArrowRight: [1, 0],
    };
    if (DIR[e.key]) {
      e.preventDefault();
      const sel = state.selectedElement;
      if (sel?.type !== 'block') {
        showViolation('请先点选一个方块');
        return;
      }
      const [dx, dy] = DIR[e.key];
      const res = trySlide(sel.index, dx, dy);
      if (res.moved > 0) {
        // After exit/win/fail the block index is gone — drop selection.
        if (res.exited || res.win || res.fail) state.selectedElement = null;
        tickAnim();
        updateHUD();
        updateInfoPanel();
        updateJsonPanel();
      } else if (res.reason) {
        showViolation(res.reason);
      }
      return;
    }
  }

  // Arrow keys are reserved for play-mode movement (handled above). When not
  // playing, swallow them so they don't switch levels — that conflicts with
  // the natural "arrow = move" expectation. Level nav lives on PageUp/PageDown.
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    return;
  }

  // Level navigation & zoom
  const items = [...document.querySelectorAll('.level-item:not([style*="display: none"])')];
  const activeIdx = items.findIndex(i => i.classList.contains('active'));

  switch(e.key) {
    case 'PageDown':
      if (activeIdx < items.length - 1) { items[activeIdx+1].click(); items[activeIdx+1].scrollIntoView({block:'nearest'}); }
      e.preventDefault(); break;
    case 'PageUp':
      if (activeIdx > 0) { items[activeIdx-1].click(); items[activeIdx-1].scrollIntoView({block:'nearest'}); }
      e.preventDefault(); break;
    case '=': case '+': zoomIn(); e.preventDefault(); break;
    case '-': zoomOut(); e.preventDefault(); break;
    case '0': zoomFit(); e.preventDefault(); break;
    case 'g': case 'G':
      document.getElementById('show-grid').click(); renderLevel(); break;
    case 'l': case 'L':
      document.getElementById('show-labels').click(); renderLevel(); break;
  }
});

// ── Control listeners ──
document.getElementById('cell-size').addEventListener('input', () => { renderLevel(); zoomFit(); });
document.getElementById('show-layer').addEventListener('change', renderLevel);
document.getElementById('show-coords').addEventListener('change', renderLevel);
document.getElementById('show-labels').addEventListener('change', renderLevel);
document.getElementById('show-grid').addEventListener('change', renderLevel);

// ── Load level ──
async function loadLevel(seedId) {
  if (state.game) stopGame();
  refreshPlayButtons();
  // Drop any draft from the previous level
  if (state.drawMode) cancelDraftBlock();
  const custom = state.customLevels.find(c => c.seedId === seedId);
  try {
    if (custom) {
      state.currentLevel = custom.data;
      state.isCustomLevel = true;
    } else {
      const resp = await fetch(`data/levels/${seedId}.json`);
      state.currentLevel = await resp.json();
      state.isCustomLevel = false;
    }
    state.currentLevelId = seedId;
    state.selectedElement = null;
    state.modified = false;
    state.doorStates = {};
    (state.currentLevel.DMS || []).forEach((dm, i) => {
      state.doorStates[i] = {
        iceRemaining: dm.DIC || 0,
        starSatisfied: !dm.DHS,
        turnState: (dm.TBD > 0) ? 'closed' : 'open',
      };
    });
    document.querySelectorAll('.level-item').forEach(item => item.classList.toggle('active', item.dataset.seedId === seedId));
    const cfg = state.levelsConfig.find(c => c.seedId === seedId);
    let title = seedId;
    if (cfg) {
      title = `#${cfg.levelIndex} ${seedId}`;
      if (cfg.isHard) title += ' (Hard)';
      if (cfg.isSuperHard) title += ' (Super Hard)';
    }
    if (custom) title = custom.name + (custom.difficulty ? ` (${custom.difficulty})` : '');
    document.getElementById('level-title').textContent = title;
    if (!state.isCustomLevel) switchEditMode('play');
    updateModeToggleVisibility();
    updateInfoPanel();
    updateJsonPanel();
    zoomFit();
  } catch(e) {
    console.error('Failed to load level:', seedId, e);
  }
}

// ── Init ──
async function init() {
  try {
    const resp = await fetch('data/LevelsConfig.json');
    const data = await resp.json();
    state.levelsConfig = data.levelConfigModels || [];
  } catch(e) {}

  try {
    const resp = await fetch('data/level-manifest.json');
    state.allLevelFiles = await resp.json();
  } catch(e) {}

  const configSeedIds = new Set(state.levelsConfig.map(c => c.seedId));
  const extraLevels = state.allLevelFiles.filter(f => !configSeedIds.has(f) && f !== 'mockLevel');
  extraLevels.sort((a, b) => {
    const na = parseInt(a.replace(/\D+/g, '') || '0');
    const nb = parseInt(b.replace(/\D+/g, '') || '0');
    return na - nb;
  });
  extraLevels.forEach((seedId, i) => {
    state.levelsConfig.push({ levelIndex: 300 + i, isHard: false, isSuperHard: false, levelDuration: 180, seedId, isExtra: true });
  });
  if (state.allLevelFiles.includes('mockLevel')) {
    state.levelsConfig.push({ levelIndex: 0, isHard: false, isSuperHard: false, levelDuration: 0, seedId: 'mockLevel', isExtra: true });
  }

  buildLevelList();
  buildLegend();
  setupPanZoom();

  // Restore custom levels
  try {
    const saved = localStorage.getItem('customLevels');
    if (saved) state.customLevels = JSON.parse(saved);
  } catch(e) {}
  state.customLevels.forEach(entry => addCustomLevelToSidebar(entry));

  if (state.levelsConfig.length > 0) loadLevel(state.levelsConfig[0].seedId);
}

init();
