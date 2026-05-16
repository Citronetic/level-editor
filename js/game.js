// Play-mode game simulation. Mirrors BlockOutClone2 / BlockOutOut runtime rules:
// - Multi-cell block slides one step at a time until blocked
// - Block exits when every cell lands on its own color, open exit door
// - Each exit globally ticks all door ice (DIC) and all remaining block ice (BIC)
// - Bomb (BD) decrements on every successful swipe; reaching 0 fails the level
// - Turn-based door (TBD) flips open/closed on every successful swipe
// - Curtain lock (CLC) decrements when a block bumps into a closed curtain cell
// - Locked block (LID/LKI) is movable only after every required key (KID) has exited

import { state } from './state.js';

function clone(o) { return JSON.parse(JSON.stringify(o)); }

export function isPlaying() {
  return !!state.game && state.game.active && state.game.status === 'playing';
}
export function isPlayingAnyStatus() {
  return !!state.game && state.game.active;
}

export function startGame() {
  if (!state.currentLevel) return false;
  state.gameOriginalLevel = state.currentLevel;       // ref to whatever caller had (e.g. customLevel.data)
  state.gameSnapshot = clone(state.currentLevel);      // immutable starting point for resets
  state.currentLevel = clone(state.currentLevel);      // working copy that the simulation mutates
  state.selectedElement = null;
  state.game = {
    active: true,
    status: 'playing',
    moves: 0,
    failReason: '',
    collectedKeys: new Set(),
  };
  syncDoorStates();
  return true;
}

export function resetGame() {
  if (!state.game || !state.gameSnapshot) return;
  state.currentLevel = clone(state.gameSnapshot);
  state.selectedElement = null;
  state.game.status = 'playing';
  state.game.moves = 0;
  state.game.failReason = '';
  state.game.collectedKeys = new Set();
  state.game.anim = null;
  syncDoorStates();
}

export function stopGame() {
  if (!state.game) return;
  if (state.gameOriginalLevel) state.currentLevel = state.gameOriginalLevel;
  state.gameOriginalLevel = null;
  state.gameSnapshot = null;
  state.game = null;
  state.selectedElement = null;
  syncDoorStates();
}

function syncDoorStates() {
  // Keep the existing renderer's doorStates badge values in sync with the level data
  state.doorStates = {};
  (state.currentLevel?.DMS || []).forEach((dm, i) => {
    state.doorStates[i] = {
      iceRemaining: dm.DIC || 0,
      starSatisfied: !dm.DHS,
      turnState: (dm.TBD > 0) ? 'closed' : 'open',
    };
  });
}

// ── lookup helpers ─────────────────────────────────────────────────────────

function buildLookups(lvl, excludeBlockIdx) {
  const cellSet = new Set();
  (lvl.CMS || []).forEach(c => cellSet.add(`${c.BPM.x},${c.BPM.y}`));

  const wallSet = new Set();
  (lvl.WMS || []).forEach(w => wallSet.add(`${w.BPM.x},${w.BPM.y}`));
  // IWMS cells are treated as additional impassable cells (BlockOutOut convention).
  (lvl.IWMS || []).forEach(iw => {
    (iw.BPMS || []).forEach(p => wallSet.add(`${p.x},${p.y}`));
  });

  const doorByCell = new Map();
  (lvl.DMS || []).forEach((dm, i) => {
    (dm.BPMS || []).forEach(p => doorByCell.set(`${p.x},${p.y}`, { idx: i, dm }));
  });

  const curtainByCell = new Map();
  (lvl.CLMS || []).forEach((cl, i) => {
    if ((cl.CLC || 0) <= 0) return;
    (cl.BPMS || []).forEach(p => curtainByCell.set(`${p.x},${p.y}`, { idx: i, cl }));
  });

  const blockByCell = new Map();
  (lvl.BMS || []).forEach((b, i) => {
    if (i === excludeBlockIdx) return;
    (b.BPMS || []).forEach(p => blockByCell.set(`${p.x},${p.y}`, i));
  });

  return { cellSet, wallSet, doorByCell, curtainByCell, blockByCell };
}

function isDoorOpen(dm) {
  if ((dm.DIC || 0) > 0) return false;
  if (dm.DHS) return false;            // star door — no star mechanic in our model → stays closed
  if ((dm._tbd_closed || false)) return false;
  return true;
}

// A block with an outer layer (ILE) behaves as the outer color (LBCT) for
// passability and exit checks until the layer pops. After popping, ILE clears
// and the block reverts to its inner BCT color.
function effColor(bm) {
  return bm.ILE ? ((bm.LBCT ?? bm.BCT)) : bm.BCT;
}

// After a step is committed, check whether the piece should exit:
// the LEADING-edge cells (along the direction of motion) must all sit on the
// same matching open door. Trailing cells can still be on regular floor.
// Mirrors BlockOutOut's CanExitThroughLeadingDoor.
function checkExitAfterStep(bm, dirX, dirY, doorByCell) {
  if (bm.BPMS.length === 0) return null;
  let edge;
  if (dirX > 0)      edge = Math.max(...bm.BPMS.map(p => p.x));
  else if (dirX < 0) edge = Math.min(...bm.BPMS.map(p => p.x));
  else if (dirY > 0) edge = Math.max(...bm.BPMS.map(p => p.y));
  else               edge = Math.min(...bm.BPMS.map(p => p.y));

  let door = null;
  for (const cell of bm.BPMS) {
    const onLeading = (dirX !== 0) ? (cell.x === edge) : (cell.y === edge);
    if (!onLeading) continue;
    const e = doorByCell.get(`${cell.x},${cell.y}`);
    if (!e) return null;
    if (e.dm.BCT !== effColor(bm)) return null;
    if (!isDoorOpen(e.dm)) return null;
    if (door === null) door = e;
    else if (door.idx !== e.idx) return null;
  }
  return door;
}

// ── slide ──────────────────────────────────────────────────────────────────

export function trySlide(blockIdx, dirX, dirY, maxSteps = 200) {
  const g = state.game;
  if (!g || g.status !== 'playing') return { moved: 0, reason: '游戏未激活' };
  if ((dirX === 0) === (dirY === 0)) return { moved: 0, reason: '需要直线方向' };
  const lvl = state.currentLevel;
  const bm = lvl.BMS?.[blockIdx];
  if (!bm) return { moved: 0, reason: '方块不存在' };

  if ((bm.BIC || 0) > 0) return { moved: 0, reason: `方块冰封 (剩${bm.BIC}层)` };

  const bad = bm.BAD || 0;
  if (bad === 1 && dirY !== 0) return { moved: 0, reason: '水平方块不能纵向移动' };
  if (bad === 2 && dirX !== 0) return { moved: 0, reason: '垂直方块不能横向移动' };

  if ((bm.LID || 0) > 0) {
    const lki = bm.LKI || [];
    for (const k of lki) {
      if (!g.collectedKeys.has(k)) return { moved: 0, reason: `锁定中 (缺钥匙#${k})` };
    }
  }

  const lookups = buildLookups(lvl, blockIdx);
  let totalSteps = 0;
  let exited = false;
  let curtainHitIdx = -1;

  // Step until blocked OR maxSteps reached. Default 200 = effectively unlimited
  // (full swipe-style slide). Pass maxSteps=1 for arrow-key cell-by-cell mode.
  const cap = Math.max(1, Math.min(200, maxSteps | 0));
  for (let safety = 0; safety < cap; safety++) {
    const cur = bm.BPMS;
    const next = cur.map(p => ({ x: p.x + dirX, y: p.y + dirY }));

    // 1) check passability of each cell of the moved block
    let blocked = false;
    for (let i = 0; i < next.length; i++) {
      const nc = next[i];
      const k = `${nc.x},${nc.y}`;
      // wall / off-board
      if (lookups.wallSet.has(k)) { blocked = true; break; }
      // door cell: matching open door is passable
      const doorEntry = lookups.doorByCell.get(k);
      if (doorEntry) {
        if (doorEntry.dm.BCT !== effColor(bm)) { blocked = true; break; }
        if (!isDoorOpen(doorEntry.dm)) { blocked = true; break; }
        // matching open door cell — passable
      } else if (!lookups.cellSet.has(k)) {
        blocked = true; break;                 // not floor and not door → void
      }
      // curtain
      if (lookups.curtainByCell.has(k)) {
        curtainHitIdx = lookups.curtainByCell.get(k).idx;
        blocked = true; break;
      }
      // other block
      if (lookups.blockByCell.has(k)) { blocked = true; break; }
    }
    if (blocked) break;

    // 2) commit one step
    cur.forEach((p, i) => { p.x = next[i].x; p.y = next[i].y; });
    totalSteps += 1;

    // 3) check exit (leading edge of the now-moved block all on same open door)
    const exitDoor = checkExitAfterStep(bm, dirX, dirY, lookups.doorByCell);
    if (exitDoor) { exited = true; break; }
  }

  // Hit-curtain side effect — decrement on EVERY swipe that bumps a curtain,
  // regardless of how many cells the block managed to travel before hitting it.
  // This matches the intuitive "swipe taps the curtain once → CLC -= 1" model.
  if (curtainHitIdx >= 0) {
    const cl = lvl.CLMS[curtainHitIdx];
    if (cl && cl.CLC > 0) cl.CLC -= 1;
  }

  if (totalSteps === 0) return { moved: 0, reason: '无法移动' };

  // ── stash animation info BEFORE splice (so an exiting block can still ghost-render) ──
  const dxTotal = dirX * totalSteps;
  const dyTotal = dirY * totalSteps;
  const dur = Math.min(280, 70 + totalSteps * 22);
  if (exited) {
    g.anim = {
      blockIdx: -1,
      ghostBPMS: bm.BPMS.map(p => ({ x: p.x, y: p.y })),
      ghostBCT: bm.BCT,
      dx: dxTotal, dy: dyTotal, t: 0, start: performance.now(), dur,
    };
  } else {
    g.anim = { blockIdx, ghostBPMS: null, ghostBCT: 0, dx: dxTotal, dy: dyTotal, t: 0, start: performance.now(), dur };
  }

  // ── post-move bookkeeping ──
  g.moves += 1;

  // bomb tick on every successful swipe
  let fail = false;
  for (let i = 0; i < lvl.BMS.length; i++) {
    if (i === blockIdx && exited) continue;
    const b = lvl.BMS[i];
    if ((b.BD || 0) > 0) {
      b.BD -= 1;
      if (b.BD <= 0) {
        fail = true;
        g.failReason = `方块#${i} 炸弹爆炸`;
      }
    }
  }

  // turn-based door tick
  (lvl.DMS || []).forEach(dm => {
    if ((dm.TBD || 0) > 0) {
      dm._tbd_closed = !dm._tbd_closed;
    }
  });

  if (exited) {
    if ((bm.KID || 0) > 0) g.collectedKeys.add(bm.KID);
    lvl.BMS.splice(blockIdx, 1);

    // tick all remaining block ice
    lvl.BMS.forEach(b => { if ((b.BIC || 0) > 0) b.BIC -= 1; });
    // tick all door ice
    (lvl.DMS || []).forEach(dm => { if ((dm.DIC || 0) > 0) dm.DIC -= 1; });
  }

  syncDoorStates();

  let win = false;
  if (fail) {
    g.status = 'lost';
  } else if (lvl.BMS.length === 0) {
    g.status = 'won';
    win = true;
  }

  return { moved: totalSteps, exited, win, fail, reason: '' };
}

// ── Live-drag helpers ──────────────────────────────────────────────────────
// Simulate how many steps the block can slide in (dirX,dirY) from origBPMS,
// capped by `maxSteps`. Does NOT mutate. Returns {steps, curtainIdx, reason}.
export function simulateSlide(blockIdx, origBPMS, dirX, dirY, maxSteps = 200) {
  const g = state.game;
  const lvl = state.currentLevel;
  const bm = lvl?.BMS?.[blockIdx];
  if (!bm) return { steps: 0, curtainIdx: -1, reason: 'no-block' };
  if ((bm.BIC || 0) > 0) return { steps: 0, curtainIdx: -1, reason: `方块冰封 (剩${bm.BIC}层)` };
  const bad = bm.BAD || 0;
  if (bad === 1 && dirY !== 0) return { steps: 0, curtainIdx: -1, reason: '水平方块不能纵向移动' };
  if (bad === 2 && dirX !== 0) return { steps: 0, curtainIdx: -1, reason: '垂直方块不能横向移动' };
  if (g && (bm.LID || 0) > 0) {
    for (const k of (bm.LKI || [])) {
      if (!g.collectedKeys.has(k)) return { steps: 0, curtainIdx: -1, reason: `锁定中 (缺钥匙#${k})` };
    }
  }

  const lookups = buildLookups(lvl, blockIdx);
  let curtainIdx = -1;
  for (let step = 1; step <= maxSteps; step++) {
    let blocked = false;
    for (const op of origBPMS) {
      const nc = { x: op.x + dirX * step, y: op.y + dirY * step };
      const k = `${nc.x},${nc.y}`;
      if (lookups.wallSet.has(k)) { blocked = true; break; }
      const de = lookups.doorByCell.get(k);
      if (de) {
        if (de.dm.BCT !== effColor(bm)) { blocked = true; break; }
        if (!isDoorOpen(de.dm)) { blocked = true; break; }
      } else if (!lookups.cellSet.has(k)) { blocked = true; break; }
      if (lookups.curtainByCell.has(k)) {
        curtainIdx = lookups.curtainByCell.get(k).idx;
        blocked = true; break;
      }
      if (lookups.blockByCell.has(k)) { blocked = true; break; }
    }
    if (blocked) return { steps: step - 1, curtainIdx, reason: '' };
  }
  return { steps: maxSteps, curtainIdx: -1, reason: '' };
}

// Place the block at origBPMS shifted by (dirX,dirY)*steps. Pure visual mutation.
export function setBlockPreview(blockIdx, origBPMS, dirX, dirY, steps) {
  const bm = state.currentLevel?.BMS?.[blockIdx];
  if (!bm) return;
  bm.BPMS.forEach((p, i) => {
    p.x = origBPMS[i].x + dirX * steps;
    p.y = origBPMS[i].y + dirY * steps;
  });
}

// Set the block's BPMS to an explicit set of positions (used by chained nav).
export function setBlockPreviewBPMS(blockIdx, finalBPMS) {
  const bm = state.currentLevel?.BMS?.[blockIdx];
  if (!bm) return;
  bm.BPMS.forEach((p, i) => { p.x = finalBPMS[i].x; p.y = finalBPMS[i].y; });
}

// Greedy axis-alternating navigation that handles ANY number of corners.
// dxCells/dyCells are signed cell deltas the user is requesting from origBPMS.
// Each iteration: slide as far as possible toward the remaining target in the
// axis with the larger remaining magnitude; if blocked, switch axes; repeat
// until both axes reach 0 or no progress is possible.
// Returns {bpms, curtainIdx} — bpms is the final preview position.
export function navigateDrag(blockIdx, origBPMS, dxCells, dyCells) {
  let bpms = origBPMS.map(p => ({ x: p.x, y: p.y }));
  let remX = dxCells | 0;
  let remY = dyCells | 0;
  let curtainIdx = -1;

  const tryAxis = (axis) => {
    const dx = axis === 'x' ? Math.sign(remX) : 0;
    const dy = axis === 'y' ? Math.sign(remY) : 0;
    const want = axis === 'x' ? Math.abs(remX) : Math.abs(remY);
    if (want === 0 || (dx === 0 && dy === 0)) return 0;
    const sim = simulateSlide(blockIdx, bpms, dx, dy, want);
    if (sim.steps === 0) {
      if (sim.curtainIdx >= 0 && curtainIdx < 0) curtainIdx = sim.curtainIdx;
      return 0;
    }
    bpms = bpms.map(p => ({ x: p.x + dx * sim.steps, y: p.y + dy * sim.steps }));
    if (axis === 'x') remX -= dx * sim.steps; else remY -= dy * sim.steps;
    if (sim.curtainIdx >= 0 && curtainIdx < 0) curtainIdx = sim.curtainIdx;
    return sim.steps;
  };

  // Up to 16 segments = 15 corners. Plenty for any sane drag path.
  for (let safety = 0; safety < 16; safety++) {
    if (remX === 0 && remY === 0) break;
    // Prefer the axis with more remaining distance — produces the most direct path.
    const preferX = Math.abs(remX) >= Math.abs(remY);
    const moved = preferX ? tryAxis('x') : tryAxis('y');
    if (moved > 0) continue;
    // Preferred axis blocked — try the other.
    const other = preferX ? tryAxis('y') : tryAxis('x');
    if (other === 0) break;  // both axes blocked — done
  }
  return { bpms, curtainIdx };
}

// Try every direction's leading edge as a potential exit door.
function checkExitAnyDirection(bm, doorByCell) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const d = checkExitAfterStep(bm, dx, dy, doorByCell);
    if (d) return d;
  }
  return null;
}

// Commit the block at its current preview position. Applies all bookkeeping:
// exit detection, bombs, turn-doors, door-ice, block-ice, curtain hits.
export function commitDrag(blockIdx, origBPMS, curtainHitIdx) {
  const g = state.game;
  if (!g || g.status !== 'playing') return { moved: 0 };
  const lvl = state.currentLevel;
  const bm = lvl.BMS?.[blockIdx];
  if (!bm) return { moved: 0 };

  const dx = bm.BPMS[0].x - origBPMS[0].x;
  const dy = bm.BPMS[0].y - origBPMS[0].y;

  // Curtain bump → decrement that curtain once, regardless of whether the
  // block actually moved. Match trySlide's swipe semantics.
  if (curtainHitIdx >= 0) {
    const cl = lvl.CLMS?.[curtainHitIdx];
    if (cl && (cl.CLC || 0) > 0) cl.CLC -= 1;
  }

  if (dx === 0 && dy === 0) return { moved: 0, curtainBumped: curtainHitIdx >= 0 };

  // After a chained drag the final direction is ambiguous, so check every
  // direction's leading edge for a matching open door.
  const exitDoor = checkExitAnyDirection(bm, buildLookups(lvl, blockIdx).doorByCell);
  const exited = !!exitDoor;

  g.moves += 1;

  let fail = false;
  for (let i = 0; i < lvl.BMS.length; i++) {
    if (i === blockIdx && exited) continue;
    const b = lvl.BMS[i];
    if ((b.BD || 0) > 0) {
      b.BD -= 1;
      if (b.BD <= 0) { fail = true; g.failReason = `方块#${i} 炸弹爆炸`; }
    }
  }

  (lvl.DMS || []).forEach(dm => {
    if ((dm.TBD || 0) > 0) dm._tbd_closed = !dm._tbd_closed;
  });

  let layerPopped = false;
  if (exited) {
    if (bm.ILE) {
      // Layer pop — outer skin removed; block stays in place as its BCT inner color
      bm.ILE = false;
      layerPopped = true;
      // Do NOT splice, do NOT tick door/block ice, do NOT collect key.
      // Bombs and turn-doors already ticked above.
    } else {
      if ((bm.KID || 0) > 0) g.collectedKeys.add(bm.KID);
      lvl.BMS.splice(blockIdx, 1);
      // Every successful exit globally ticks: block ice (BIC), door ice (DIC),
      // and curtain locks (CLC). Curtain comment in BlockOutClone2:
      //   "cover specified cells until N pieces exit"
      lvl.BMS.forEach(b => { if ((b.BIC || 0) > 0) b.BIC -= 1; });
      (lvl.DMS || []).forEach(dm => { if ((dm.DIC || 0) > 0) dm.DIC -= 1; });
      (lvl.CLMS || []).forEach(cl => { if ((cl.CLC || 0) > 0) cl.CLC -= 1; });
    }
  }

  syncDoorStates();

  let win = false;
  if (fail) g.status = 'lost';
  else if (lvl.BMS.length === 0) { g.status = 'won'; win = true; }

  return { moved: Math.abs(dx) + Math.abs(dy), exited: exited && !layerPopped, layerPopped, win, fail };
}

// Pick the block under a board cell, if any.
export function blockAtCell(gx, gy) {
  const lvl = state.currentLevel;
  if (!lvl) return -1;
  for (let i = 0; i < (lvl.BMS || []).length; i++) {
    if ((lvl.BMS[i].BPMS || []).some(p => p.x === gx && p.y === gy)) return i;
  }
  return -1;
}
