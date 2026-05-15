import { state } from './state.js';
import { COLORS } from './constants.js';
import { validateBlockMove, validateGenericMove } from './rules.js';
import { renderLevel, canvas } from './render.js';
import { updateInfoPanel, updateSelectionPanel, updateJsonPanel } from './panels.js';
import { handleDesignClick, showViolation } from './design.js';

const wrap = document.getElementById('canvas-wrap');
const tooltip = document.getElementById('tooltip');

function autoSave() {
  try { localStorage.setItem('customLevels', JSON.stringify(state.customLevels)); } catch(e) {}
}

export function mouseToGrid(e) {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / (rect.width / canvas.width);
  const my = (e.clientY - rect.top) / (rect.height / canvas.height);
  const rs = state.renderState;
  return {
    gridX: Math.floor((mx - rs.ox) / rs.cellSize) + rs.offsetX,
    gridY: rs.offsetY + rs.gridH - 1 - Math.floor((my - rs.oy) / rs.cellSize),
  };
}

export function findElementAt(gx, gy) {
  const posMatch = (p) => p.x === gx && p.y === gy;
  let found = null;
  (state.currentLevel?.BMS||[]).forEach((bm, i) => { if (!found && (bm.BPMS||[]).some(posMatch)) found = { type: 'block', index: i }; });
  if (!found) (state.currentLevel?.DMS||[]).forEach((dm, i) => { if (!found && (dm.BPMS||[]).some(posMatch)) found = { type: 'door', index: i }; });
  if (!found) (state.currentLevel?.EMS||[]).forEach((em, i) => { if (!found && (em.BPMS||[]).some(posMatch)) found = { type: 'elevator', index: i }; });
  if (!found) (state.currentLevel?.CLMS||[]).forEach((cl, i) => { if (!found && (cl.BPMS||[]).some(posMatch)) found = { type: 'curtain', index: i }; });
  if (!found) (state.currentLevel?.WMS||[]).forEach((wm, i) => { if (!found && posMatch(wm.BPM)) found = { type: 'wall', index: i }; });
  return found;
}

export function getElementPositions(el) {
  if (!el || !state.currentLevel) return null;
  const lists = { block: 'BMS', door: 'DMS', elevator: 'EMS', curtain: 'CLMS' };
  if (el.type === 'wall') {
    const wm = state.currentLevel.WMS?.[el.index];
    return wm ? [wm.BPM] : null;
  }
  const listKey = lists[el.type];
  const item = state.currentLevel[listKey]?.[el.index];
  return item?.BPMS || null;
}

export function setupPanZoom() {
  wrap.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    state.dragStartX = e.clientX; state.dragStartY = e.clientY;
    state.dragPanX = state.panX; state.dragPanY = state.panY;
    state.dragMoved = false;
    state.dragMode = 'pending';
    state.lastMoveValid = true;
    state.moveViolation = '';

    const canMove = state.selectedElement && state.currentLevel && (state.editMode === 'play' || state.isCustomLevel);
    if (canMove) {
      const { gridX, gridY } = mouseToGrid(e);
      const positions = getElementPositions(state.selectedElement);
      if (positions && positions.some(p => p.x === gridX && p.y === gridY)) {
        state.moveTarget = {
          ...state.selectedElement,
          startGridX: gridX,
          startGridY: gridY,
          origPositions: positions.map(p => ({ x: p.x, y: p.y })),
        };
        if (state.selectedElement.type === 'elevator') {
          const em = state.currentLevel.EMS?.[state.selectedElement.index];
          state.moveTarget.origEBMS = (em?.EBMS||[]).map(bm => ({
            BPMS: (bm.BPMS||[]).map(p => ({ x: p.x, y: p.y }))
          }));
        }
        wrap.style.cursor = 'move';
        return;
      }
    }
  });

  window.addEventListener('mousemove', e => {
    if (state.dragMode === 'none') return;
    const dx = e.clientX - state.dragStartX;
    const dy = e.clientY - state.dragStartY;
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (state.dragMode === 'pending' && dist > 5) {
      if (state.moveTarget) {
        state.dragMode = 'move';
        wrap.style.cursor = 'move';
      } else {
        state.dragMode = 'none';
        state.dragMoved = true;
        return;
      }
      state.dragMoved = true;
    }

    if (state.dragMode === 'move' && state.moveTarget && state.currentLevel) {
      const { gridX, gridY } = mouseToGrid(e);
      let offsetX = gridX - state.moveTarget.startGridX;
      let offsetY = gridY - state.moveTarget.startGridY;

      if (state.selectedElement.type === 'block' && state.editMode === 'play') {
        if (Math.abs(offsetX) >= Math.abs(offsetY)) {
          offsetY = 0;
        } else {
          offsetX = 0;
        }
      }

      const newPositions = state.moveTarget.origPositions.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));

      let validation;
      if (state.editMode === 'design') {
        validation = validateGenericMove(state.selectedElement.type, newPositions);
      } else if (state.selectedElement.type === 'block') {
        validation = validateBlockMove(state.selectedElement.index, newPositions);
      } else {
        validation = validateGenericMove(state.selectedElement.type, newPositions);
      }
      state.lastMoveValid = validation.valid;
      state.moveViolation = validation.reason;

      const positions = getElementPositions(state.selectedElement);
      if (positions) {
        state.moveTarget.origPositions.forEach((orig, i) => {
          if (positions[i]) { positions[i].x = orig.x + offsetX; positions[i].y = orig.y + offsetY; }
        });
      }
      if (state.selectedElement.type === 'wall') {
        const wm = state.currentLevel.WMS?.[state.selectedElement.index];
        if (wm) { wm.BPM.x = state.moveTarget.origPositions[0].x + offsetX; wm.BPM.y = state.moveTarget.origPositions[0].y + offsetY; }
      }
      if (state.selectedElement.type === 'elevator' && state.moveTarget.origEBMS) {
        const em = state.currentLevel.EMS?.[state.selectedElement.index];
        (em?.EBMS||[]).forEach((bm, bi) => {
          (bm.BPMS||[]).forEach((p, pi) => {
            if (state.moveTarget.origEBMS[bi]?.BPMS[pi]) {
              p.x = state.moveTarget.origEBMS[bi].BPMS[pi].x + offsetX;
              p.y = state.moveTarget.origEBMS[bi].BPMS[pi].y + offsetY;
            }
          });
        });
      }
      renderLevel();
    }
  });

  window.addEventListener('mouseup', e => {
    const wasDragMode = state.dragMode;
    const wasValid = state.lastMoveValid;
    state.isDragging = false;
    state.dragMode = 'none';
    wrap.classList.remove('dragging');
    wrap.style.cursor = 'default';

    if (state.moveTarget && wasDragMode === 'move') {
      if (!wasValid) {
        const positions = getElementPositions(state.selectedElement);
        if (positions) {
          state.moveTarget.origPositions.forEach((orig, i) => {
            if (positions[i]) { positions[i].x = orig.x; positions[i].y = orig.y; }
          });
        }
        if (state.selectedElement.type === 'wall') {
          const wm = state.currentLevel.WMS?.[state.selectedElement.index];
          if (wm) { wm.BPM.x = state.moveTarget.origPositions[0].x; wm.BPM.y = state.moveTarget.origPositions[0].y; }
        }
        if (state.selectedElement.type === 'elevator' && state.moveTarget.origEBMS) {
          const em = state.currentLevel.EMS?.[state.selectedElement.index];
          (em?.EBMS||[]).forEach((bm, bi) => {
            (bm.BPMS||[]).forEach((p, pi) => {
              if (state.moveTarget.origEBMS[bi]?.BPMS[pi]) {
                p.x = state.moveTarget.origEBMS[bi].BPMS[pi].x;
                p.y = state.moveTarget.origEBMS[bi].BPMS[pi].y;
              }
            });
          });
        }
        showViolation(state.moveViolation);
      } else {
        state.modified = true;
        if (state.isCustomLevel) autoSave();
      }
      state.moveViolation = '';
      state.lastMoveValid = true;
      state.moveTarget = null;
      renderLevel();
      updateInfoPanel();
      updateSelectionPanel();
      updateJsonPanel();
      return;
    }
    state.moveTarget = null;

    if (!state.dragMoved && state.currentLevel && wasDragMode === 'pending') {
      if (state.editMode === 'design') {
        handleDesignClick(e);
        return;
      }
      const { gridX, gridY } = mouseToGrid(e);
      const found = findElementAt(gridX, gridY);
      state.selectedElement = found;
      renderLevel();
      updateInfoPanel();
      updateSelectionPanel();
    }
  });

  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    state.zoom = Math.max(0.3, Math.min(3, state.zoom * delta));
    applyTransform();
    document.getElementById('zoom-label').textContent = Math.round(state.zoom * 100) + '%';
  }, { passive: false });

  wrap.addEventListener('mousemove', handleHover);
  wrap.addEventListener('mouseleave', () => tooltip.style.display = 'none');
}

export function applyTransform() {
  canvas.style.transform = `scale(${state.zoom})`;
  canvas.style.transformOrigin = 'top left';
}

export function zoomIn() { state.zoom = Math.min(3, state.zoom * 1.2); applyTransform(); document.getElementById('zoom-label').textContent = Math.round(state.zoom*100)+'%'; }
export function zoomOut() { state.zoom = Math.max(0.3, state.zoom / 1.2); applyTransform(); document.getElementById('zoom-label').textContent = Math.round(state.zoom*100)+'%'; }
export function zoomFit() {
  if (!state.currentLevel) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const scan = (items) => {
    if (!items) return;
    items.forEach(item => {
      if (item.BPM) { minX=Math.min(minX,item.BPM.x); maxX=Math.max(maxX,item.BPM.x); minY=Math.min(minY,item.BPM.y); maxY=Math.max(maxY,item.BPM.y); }
      if (item.BPMS) item.BPMS.forEach(p => { minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); });
    });
  };
  scan(state.currentLevel.CMS); scan(state.currentLevel.WMS); scan(state.currentLevel.BMS); scan(state.currentLevel.DMS);
  scan(state.currentLevel.CCMS); scan(state.currentLevel.GRM); scan(state.currentLevel.EMS); scan(state.currentLevel.CLMS); scan(state.currentLevel.GMS);
  if (state.currentLevel.BSP) state.currentLevel.BSP.forEach(p => { minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); });
  if (minX === Infinity) { minX=0; maxX=10; minY=0; maxY=10; }

  const pad = 1;
  const gridW = maxX - minX + 1 + pad*2;
  const gridH = maxY - minY + 1 + pad*2;
  const ox = 36, oy = 36;

  const wrapRect = wrap.getBoundingClientRect();
  const availW = wrapRect.width - ox - 12;
  const availH = wrapRect.height - oy - 12;
  const idealCS = Math.floor(Math.min(availW / gridW, availH / gridH));
  const clampedCS = Math.max(24, Math.min(80, idealCS));
  document.getElementById('cell-size').value = clampedCS;

  state.zoom = 1;
  state.panX = 0; state.panY = 0;
  renderLevel();
  applyTransform();
  document.getElementById('zoom-label').textContent = '100%';
}

// ─── TOOLTIP ───
function handleHover(e) {
  if (!state.currentLevel || state.isDragging) { tooltip.style.display = 'none'; return; }
  const { gridX, gridY } = mouseToGrid(e);

  const items = getCellInfo(gridX, gridY);
  if (items.length === 0) { tooltip.style.display = 'none'; return; }

  let html = `<div class="tt-title">格子 (${gridX}, ${gridY})</div>`;
  items.forEach(item => {
    html += `<div style="margin-top:4px;padding-top:4px;border-top:1px solid var(--border)">`;
    html += `<div style="font-weight:600;color:var(--text);margin-bottom:2px">${item.type}</div>`;
    Object.entries(item.props).forEach(([k,v]) => {
      html += `<div class="tt-row"><span class="tt-key">${k}</span><span class="tt-val">${v}</span></div>`;
    });
    html += `</div>`;
  });

  tooltip.innerHTML = html;
  tooltip.style.display = 'block';
  tooltip.style.left = (e.clientX + 14) + 'px';
  tooltip.style.top = (e.clientY + 14) + 'px';
  const tr = tooltip.getBoundingClientRect();
  if (tr.right > window.innerWidth) tooltip.style.left = (e.clientX - tr.width - 10) + 'px';
  if (tr.bottom > window.innerHeight) tooltip.style.top = (e.clientY - tr.height - 10) + 'px';
}

function getCellInfo(gx, gy) {
  const items = [];
  const posMatch = (p) => p.x === gx && p.y === gy;

  if ((state.currentLevel.CMS||[]).some(c => posMatch(c.BPM))) {
    items.push({ type: '棋盘格 (Cell)', props: { '坐标': `(${gx}, ${gy})` }});
  }

  (state.currentLevel.WMS||[]).forEach(w => {
    if (posMatch(w.BPM)) items.push({ type: '外墙 (Wall)', props: { '边界层级 (BI)': w.BI }});
  });

  (state.currentLevel.BMS||[]).forEach((bm, i) => {
    if ((bm.BPMS||[]).some(posMatch)) {
      const c = COLORS[String(bm.BCT)];
      const props = {
        '颜色 (BCT)': `<span class="tt-color" style="background:${c?.hex||'#888'}"></span>${c?.name||'?'} (${bm.BCT})`,
        '占格数': bm.BPMS.length,
      };
      if (bm.BIC) props['初始数量 (BIC)'] = bm.BIC;
      if (bm.BAD) props['攻击方向 (BAD)'] = bm.BAD === 1 ? '水平' : '垂直';
      if (bm.KID) props['钥匙ID (KID)'] = bm.KID;
      if (bm.BHS) props['高方块 (BHS)'] = '是';
      if (bm.BD) props['伤害 (BD)'] = bm.BD;
      if (bm.ILE) props['可爆炸 (ILE)'] = '是';
      items.push({ type: `方块 #${i}`, props, _clickable: { type: 'block', index: i } });
    }
  });

  (state.currentLevel.DMS||[]).forEach((dm, i) => {
    if ((dm.BPMS||[]).some(posMatch)) {
      const c = COLORS[String(dm.BCT)];
      const ds = state.doorStates[i] || {};
      const props = {
        '颜色 (BCT)': `<span class="tt-color" style="background:${c?.hex||'#888'}"></span>${c?.name||'?'}`,
        '水平 (IH)': dm.IH ? '是' : '否',
        '区域 (BI)': dm.BI,
      };
      if (dm.DIC) props['冰层 (DIC)'] = `${ds.iceRemaining || 0}/${dm.DIC} (${ds.iceRemaining > 0 ? '冰封中' : '已解冻'})`;
      if (dm.DHS) props['星星门 (DHS)'] = ds.starSatisfied ? '已满足' : '需要星星方块';
      if (dm.TBD) props['回合门 (TBD)'] = `${dm.TBD}回合 (${ds.turnState === 'open' ? '开启' : '关闭'})`;
      const isOpen = (ds.iceRemaining <= 0) && ds.starSatisfied && (ds.turnState !== 'closed');
      props['状态'] = isOpen ? '<span style="color:#00cec9">可通过</span>' : '<span style="color:#ff7675">阻挡中</span>';
      items.push({ type: `出口门 #${i}`, props, _clickable: { type: 'door', index: i } });
    }
  });

  (state.currentLevel.EMS||[]).forEach((em, i) => {
    if ((em.BPMS||[]).some(posMatch)) items.push({ type: `升降梯 #${i}`, props: { '路径格数': em.BPMS.length, '承载方块': em.EBMS?.length || 0 }, _clickable: { type: 'elevator', index: i } });
  });

  (state.currentLevel.CLMS||[]).forEach((cl, i) => {
    if ((cl.BPMS||[]).some(posMatch)) items.push({ type: `帘锁 #${i}`, props: { '解锁次数 (CLC)': cl.CLC, '覆盖格数': cl.BPMS.length }, _clickable: { type: 'curtain', index: i } });
  });

  if ((state.currentLevel.BSP||[]).some(posMatch)) items.push({ type: '起始位置 (BSP)', props: {} });

  return items;
}
