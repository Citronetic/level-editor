import { state } from './state.js';
import { COLORS } from './constants.js';

export function buildLevelLookups() {
  if (!state.currentLevel) return {};
  const cellSet = new Set((state.currentLevel.CMS||[]).map(c => `${c.BPM.x},${c.BPM.y}`));
  const wallSet = new Set((state.currentLevel.WMS||[]).map(w => `${w.BPM.x},${w.BPM.y}`));

  const doorMap = new Map();
  (state.currentLevel.DMS||[]).forEach((dm, i) => {
    (dm.BPMS||[]).forEach(p => {
      doorMap.set(`${p.x},${p.y}`, { doorIndex: i, bct: dm.BCT, ih: dm.IH, dic: dm.DIC, dhs: dm.DHS, tbd: dm.TBD || 0 });
    });
  });

  const curtainMap = new Map();
  (state.currentLevel.CLMS||[]).forEach((cl, i) => {
    (cl.BPMS||[]).forEach(p => {
      curtainMap.set(`${p.x},${p.y}`, { curtainIndex: i, clc: cl.CLC });
    });
  });

  const blockMap = new Map();
  (state.currentLevel.BMS||[]).forEach((bm, i) => {
    (bm.BPMS||[]).forEach(p => {
      blockMap.set(`${p.x},${p.y}`, { blockIndex: i, bct: bm.BCT });
    });
  });

  return { cellSet, wallSet, doorMap, curtainMap, blockMap };
}

export function isCellBlocked(key, blockIndex, blockBCT, lookups) {
  if (lookups.wallSet.has(key)) {
    return '被外墙阻挡';
  }

  const onFloor = lookups.cellSet.has(key);
  const onDoor = lookups.doorMap.has(key);
  if (!onFloor && !onDoor) {
    return '超出棋盘范围（虚空）';
  }

  if (lookups.blockMap.has(key)) {
    const other = lookups.blockMap.get(key);
    return `与方块#${other.blockIndex}碰撞`;
  }

  if (onDoor) {
    const door = lookups.doorMap.get(key);
    if (door.bct !== blockBCT) {
      const doorColor = COLORS[String(door.bct)]?.name || '?';
      return `${doorColor}门阻挡 (颜色不匹配)`;
    }
    const ds = state.doorStates[door.doorIndex];
    if (ds) {
      if (ds.iceRemaining > 0) return `门冰封中 (剩${ds.iceRemaining}层)`;
      if (!ds.starSatisfied) return '需要星星方块';
      if (ds.turnState === 'closed') return '回合门关闭中';
    }
  }

  if (lookups.curtainMap.has(key)) {
    const curtain = lookups.curtainMap.get(key);
    if (curtain.clc > 0) return `帘锁未解锁 (${curtain.clc}次)`;
  }

  return null;
}

export function simulateSlide(blockIndex, dirX, dirY) {
  const bm = state.currentLevel.BMS[blockIndex];
  if (!bm) return { steps: 0, reason: '方块不存在' };
  const lookups = buildLevelLookups();

  const origPositions = bm.BPMS || [];
  origPositions.forEach(p => lookups.blockMap.delete(`${p.x},${p.y}`));

  let maxSteps = 0;
  let stopReason = '';

  for (let step = 1; step <= 20; step++) {
    let blocked = false;
    let reason = '';
    for (const p of origPositions) {
      const nx = p.x + dirX * step;
      const ny = p.y + dirY * step;
      const r = isCellBlocked(`${nx},${ny}`, blockIndex, bm.BCT, lookups);
      if (r) { blocked = true; reason = r; break; }
    }
    if (blocked) { stopReason = reason; break; }
    maxSteps = step;
  }

  return { steps: maxSteps, reason: stopReason };
}

export function validateBlockMove(blockIndex, newPositions) {
  const bm = state.currentLevel.BMS[blockIndex];
  if (!bm) return { valid: false, reason: '方块不存在' };
  const lookups = buildLevelLookups();
  const origPositions = state.moveTarget?.origPositions || [];

  origPositions.forEach(p => lookups.blockMap.delete(`${p.x},${p.y}`));

  for (const p of newPositions) {
    const key = `${p.x},${p.y}`;
    const r = isCellBlocked(key, blockIndex, bm.BCT, lookups);
    if (r) return { valid: false, reason: r };
  }

  if (origPositions.length > 0 && newPositions.length > 0) {
    const dx = newPositions[0].x - origPositions[0].x;
    const dy = newPositions[0].y - origPositions[0].y;
    if (dx !== 0 && dy !== 0) {
      return { valid: false, reason: '只能沿水平或垂直方向滑动' };
    }
    if (dx === 0 && dy === 0) return { valid: true, reason: '' };

    const dirX = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
    const dirY = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
    const totalSteps = Math.abs(dx + dy);
    for (let step = 1; step <= totalSteps; step++) {
      for (const p of origPositions) {
        const nx = p.x + dirX * step;
        const ny = p.y + dirY * step;
        const r = isCellBlocked(`${nx},${ny}`, blockIndex, bm.BCT, lookups);
        if (r) return { valid: false, reason: `路径第${step}步: ${r}` };
      }
    }
  }

  return { valid: true, reason: '' };
}

export function validateGenericMove(elType, newPositions) {
  return { valid: true, reason: '' };
}
