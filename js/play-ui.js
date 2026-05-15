import { state } from './state.js';
import { startGame, resetGame, stopGame, isPlayingAnyStatus } from './game.js';
import { renderLevel } from './render.js';
import { updateInfoPanel, updateJsonPanel } from './panels.js';
import { showViolation } from './design.js';

// ── Slide animation tick ─────────────────────────────────────────────────
let _animRAF = 0;
export function tickAnim() {
  if (_animRAF) cancelAnimationFrame(_animRAF);
  const step = () => {
    _animRAF = 0;
    const a = state.game?.anim;
    if (!a) { renderLevel(); return; }
    const now = performance.now();
    a.t = Math.min(1, (now - a.start) / a.dur);
    // Ease-out cubic
    const eased = 1 - Math.pow(1 - a.t, 3);
    a.t = eased;
    renderLevel();
    if (a.t < 1) _animRAF = requestAnimationFrame(step);
    else { state.game.anim = null; renderLevel(); }
  };
  _animRAF = requestAnimationFrame(step);
}

const $ = (id) => document.getElementById(id);

export function refreshPlayButtons() {
  const playing = isPlayingAnyStatus();
  const btnPlay = $('btn-play');
  const btnReset = $('btn-reset');
  const btnStop = $('btn-stop');
  const hud = $('play-hud');
  const wrap = $('canvas-wrap');
  if (!btnPlay || !btnReset || !btnStop || !hud || !wrap) return;
  btnPlay.style.display = playing ? 'none' : '';
  btnReset.style.display = playing ? '' : 'none';
  btnStop.style.display = playing ? '' : 'none';
  hud.style.display = playing ? 'flex' : 'none';
  wrap.classList.toggle('playing', playing);
  // Disable design mode toggle visually while playing
  document.querySelectorAll('.mode-btn').forEach(b => { b.disabled = playing; b.style.opacity = playing ? '0.4' : ''; });
}

export function updateHUD() {
  if (!isPlayingAnyStatus()) return;
  const lvl = state.currentLevel;
  const g = state.game;
  $('hud-moves').textContent = String(g.moves);
  $('hud-remaining').textContent = String((lvl.BMS || []).length);

  // Keys collected
  const hasAnyLock = (lvl.BMS || []).some(b => (b.LID || 0) > 0) || g.collectedKeys.size > 0;
  const hudKeys = $('hud-keys');
  if (hasAnyLock) {
    hudKeys.style.display = '';
    $('hud-keys-val').textContent = [...g.collectedKeys].sort((a,b)=>a-b).join(', ') || '—';
  } else {
    hudKeys.style.display = 'none';
  }

  const banner = $('hud-banner');
  if (g.status === 'won') {
    banner.style.display = 'flex';
    banner.classList.remove('lost');
    banner.innerHTML = '🎉 通关！<button onclick="playReset()">再试一次</button>';
  } else if (g.status === 'lost') {
    banner.style.display = 'flex';
    banner.classList.add('lost');
    banner.innerHTML = `💥 失败：${g.failReason || '关卡失败'}<button onclick="playReset()">重试</button>`;
  } else {
    banner.style.display = 'none';
  }
}

export function playStart() {
  if (!state.currentLevel) return;
  if (!(state.currentLevel.BMS || []).length) {
    showViolation('没有方块可以试玩');
    return;
  }
  if (!(state.currentLevel.DMS || []).length) {
    showViolation('没有出口门，无法通关 — 仍可试玩观察');
  }
  if (!startGame()) return;
  refreshPlayButtons();
  renderLevel();
  updateHUD();
  updateInfoPanel();
  updateJsonPanel();
}

export function playReset() {
  resetGame();
  renderLevel();
  updateHUD();
  updateInfoPanel();
  updateJsonPanel();
}

export function playStop() {
  stopGame();
  refreshPlayButtons();
  renderLevel();
  updateHUD();
  updateInfoPanel();
  updateJsonPanel();
}
