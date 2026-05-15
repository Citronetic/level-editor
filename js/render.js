import { state } from './state.js';
import { COLORS } from './constants.js';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

export { canvas, ctx };

function darken(hex, amount) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgb(${Math.max(0,Math.round(r*(1-amount)))},${Math.max(0,Math.round(g*(1-amount)))},${Math.max(0,Math.round(b*(1-amount)))})`;
}

function roundRect(ctx, x, y, w, h, r) {
  roundRectVar(ctx, x, y, w, h, r, r, r, r);
}

function roundRectVar(ctx, x, y, w, h, tl, tr, br, bl) {
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr) ctx.quadraticCurveTo(x+w, y, x+w, y+tr); else ctx.lineTo(x+w, y);
  ctx.lineTo(x + w, y + h - br);
  if (br) ctx.quadraticCurveTo(x+w, y+h, x+w-br, y+h); else ctx.lineTo(x+w, y+h);
  ctx.lineTo(x + bl, y + h);
  if (bl) ctx.quadraticCurveTo(x, y+h, x, y+h-bl); else ctx.lineTo(x, y+h);
  ctx.lineTo(x, y + tl);
  if (tl) ctx.quadraticCurveTo(x, y, x+tl, y); else ctx.lineTo(x, y);
  ctx.closePath();
}

function drawBlock(bm, gx, gy, alpha) {
  const cInfo = COLORS[String(bm.BCT)];
  const color = cInfo?.hex || '#888';
  const light = cInfo?.light || '#aaa';
  // ILE blocks paint the outer skin in LBCT color and the inner core in BCT color
  const hasLayer = !!bm.ILE;
  const outerInfo = hasLayer ? COLORS[String(bm.LBCT ?? bm.BCT)] : null;
  const outerColor = outerInfo?.hex || color;
  const outerLight = outerInfo?.light || light;
  const positions = bm.BPMS || [];
  if (positions.length === 0) return;
  const showLabels = document.getElementById('show-labels').checked;
  const cs = state.renderState.cellSize;
  const inset = Math.max(3, cs * 0.08);
  const posSet = new Set(positions.map(p => `${p.x},${p.y}`));

  ctx.globalAlpha = alpha;

  positions.forEach(p => {
    const x = gx(p.x), y = gy(p.y);

    const hasRight = posSet.has(`${p.x+1},${p.y}`);
    const hasDown = posSet.has(`${p.x},${p.y-1}`);
    const hasLeft = posSet.has(`${p.x-1},${p.y}`);
    const hasUp = posSet.has(`${p.x},${p.y+1}`);

    // Outer skin paint uses outerColor for ILE blocks, otherwise BCT color
    const paintColor = hasLayer ? outerColor : color;
    const paintLight = hasLayer ? outerLight : light;
    const grad = ctx.createLinearGradient(x, y, x, y+cs);
    grad.addColorStop(0, paintLight);
    grad.addColorStop(0.3, paintColor);
    grad.addColorStop(1, darken(paintColor, 0.3));
    ctx.fillStyle = grad;

    const r = Math.max(2, cs * 0.1);
    const tl = (!hasLeft && !hasUp) ? r : 0;
    const tr = (!hasRight && !hasUp) ? r : 0;
    const br = (!hasRight && !hasDown) ? r : 0;
    const bl = (!hasLeft && !hasDown) ? r : 0;

    const elx = hasLeft ? x : x + inset;
    const ety = hasUp ? y : y + inset;
    const erw = cs - (hasLeft ? 0 : inset) - (hasRight ? 0 : inset);
    const erh = cs - (hasUp ? 0 : inset) - (hasDown ? 0 : inset);

    roundRectVar(ctx, elx, ety, erw, erh, tl, tr, br, bl);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.save();
    ctx.beginPath();
    roundRectVar(ctx, elx, ety, erw, erh, tl, tr, br, bl);
    ctx.clip();
    ctx.fillRect(elx, ety, erw, erh * 0.3);
    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    roundRectVar(ctx, elx, ety, erw, erh, tl, tr, br, bl);
    ctx.stroke();

    // ── ILE inner core: a smaller rounded square in the BCT color ──
    if (hasLayer) {
      const innerInset = Math.max(4, cs * 0.22);
      const ix = x + innerInset, iy = y + innerInset;
      const iw = cs - innerInset * 2, ih = cs - innerInset * 2;
      const innerGrad = ctx.createLinearGradient(ix, iy, ix, iy + ih);
      innerGrad.addColorStop(0, light);
      innerGrad.addColorStop(0.4, color);
      innerGrad.addColorStop(1, darken(color, 0.25));
      ctx.fillStyle = innerGrad;
      roundRect(ctx, ix, iy, iw, ih, Math.max(2, cs*0.06));
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (bm.BD > 0) {
      const iceAlpha = Math.min(0.6, 0.15 * bm.BD);
      ctx.fillStyle = `rgba(130, 220, 255, ${iceAlpha})`;
      roundRectVar(ctx, elx, ety, erw, erh, tl, tr, br, bl);
      ctx.fill();
      ctx.strokeStyle = `rgba(200, 240, 255, ${iceAlpha + 0.1})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(elx + erw*0.3, ety + erh*0.2);
      ctx.lineTo(elx + erw*0.5, ety + erh*0.5);
      ctx.lineTo(elx + erw*0.4, ety + erh*0.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(elx + erw*0.5, ety + erh*0.5);
      ctx.lineTo(elx + erw*0.7, ety + erh*0.4);
      ctx.stroke();
    }
  });

  // BIC number badge on first cell
  if (bm.BIC > 0 && positions.length > 0) {
    const p = positions[0];
    const px = gx(p.x), py = gy(p.y);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const badgeSize = Math.max(16, cs * 0.4);
    ctx.beginPath();
    ctx.arc(px + cs/2, py + cs/2, badgeSize/2, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = darken(color, 0.3);
    ctx.font = `bold ${Math.max(11, cs*0.3)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(bm.BIC), px + cs/2, py + cs/2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // Block labels on first cell
  if (showLabels && positions.length > 0) {
    const p = positions[0];
    const parts = [];
    if (bm.BAD > 0) parts.push(bm.BAD === 1 ? 'H' : 'V');
    if (bm.KID > 0) parts.push(`K${bm.KID}`);
    if (bm.BHS) parts.push('T');
    if (bm.BD > 0) parts.push(`❄${bm.BD}`);
    if (bm.ILE) parts.push('!');
    if (parts.length > 0) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 3;
      ctx.font = `bold ${Math.max(8,cs/4.5)}px sans-serif`;
      ctx.fillText(parts.join(''), gx(p.x)+inset+2, gy(p.y)+cs-inset-2);
      ctx.shadowBlur = 0;
    }
  }

  ctx.globalAlpha = 1;
}

export function renderLevel() {
  if (!state.currentLevel) return;

  const showLayer = document.getElementById('show-layer').value;
  const showCoords = document.getElementById('show-coords').checked;
  const showLabels = document.getElementById('show-labels').checked;
  const showGrid = document.getElementById('show-grid').checked;
  state.cellSize = parseInt(document.getElementById('cell-size').value);
  const cellSize = state.cellSize;

  // Compute bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const scan = (items) => {
    if (!items) return;
    items.forEach(item => {
      if (item.BPM) { minX=Math.min(minX,item.BPM.x); maxX=Math.max(maxX,item.BPM.x); minY=Math.min(minY,item.BPM.y); maxY=Math.max(maxY,item.BPM.y); }
      if (item.BPMS) item.BPMS.forEach(p => { minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); });
    });
  };
  scan(state.currentLevel.CMS); scan(state.currentLevel.WMS); scan(state.currentLevel.IWMS); scan(state.currentLevel.BMS); scan(state.currentLevel.DMS); scan(state.currentLevel.CCMS); scan(state.currentLevel.GRM);
  scan(state.currentLevel.EMS); scan(state.currentLevel.CLMS); scan(state.currentLevel.GMS);
  if (state.currentLevel.BSP) state.currentLevel.BSP.forEach(p => { minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); });
  if (minX === Infinity) { minX=0; maxX=10; minY=0; maxY=10; }

  const pad = 1;
  const gridW = maxX - minX + 1 + pad*2;
  const gridH = maxY - minY + 1 + pad*2;
  const offX = minX - pad;
  const offY = minY - pad;
  const ox = 36, oy = 36;

  canvas.width = gridW * cellSize + ox + 12;
  canvas.height = gridH * cellSize + oy + 12;

  state.renderState = { offsetX: offX, offsetY: offY, gridW, gridH, ox, oy, cellSize };

  const gx = (x) => (x - offX) * cellSize + ox;
  const gy = (y) => (gridH - 1 - (y - offY)) * cellSize + oy;

  // Background
  ctx.fillStyle = '#161628';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid
  if (showGrid) {
    ctx.strokeStyle = '#2a2a44';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= gridW; x++) { ctx.beginPath(); ctx.moveTo(ox + x*cellSize, oy); ctx.lineTo(ox + x*cellSize, oy + gridH*cellSize); ctx.stroke(); }
    for (let y = 0; y <= gridH; y++) { ctx.beginPath(); ctx.moveTo(ox, oy + y*cellSize); ctx.lineTo(ox + gridW*cellSize, oy + y*cellSize); ctx.stroke(); }
  }

  // ─── CELLS ───
  if (showLayer === 'all' || showLayer === 'cells') {
    (state.currentLevel.CMS || []).forEach(cm => {
      const p = cm.BPM;
      const x = gx(p.x), y = gy(p.y);
      const grad = ctx.createLinearGradient(x, y, x, y + cellSize);
      grad.addColorStop(0, '#28284a');
      grad.addColorStop(1, '#20203c');
      ctx.fillStyle = grad;
      roundRect(ctx, x+1, y+1, cellSize-2, cellSize-2, 3);
      ctx.fill();
      ctx.strokeStyle = '#343458';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });
  }

  // ─── ELEVATORS ───
  if (showLayer === 'all' || showLayer === 'special') {
    (state.currentLevel.EMS || []).forEach((em, ei) => {
      const path = em.BPMS || [];
      if (path.length > 1) {
        ctx.strokeStyle = 'rgba(74,144,217,0.4)';
        ctx.lineWidth = 3;
        ctx.setLineDash([6,4]);
        ctx.beginPath();
        ctx.moveTo(gx(path[0].x)+cellSize/2, gy(path[0].y)+cellSize/2);
        for (let i=1; i<path.length; i++) ctx.lineTo(gx(path[i].x)+cellSize/2, gy(path[i].y)+cellSize/2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      path.forEach((p, pi) => {
        ctx.fillStyle = 'rgba(74,144,217,0.1)';
        ctx.fillRect(gx(p.x)+1, gy(p.y)+1, cellSize-2, cellSize-2);
        if (pi === 0) {
          ctx.fillStyle = 'rgba(74,144,217,0.3)';
          roundRect(ctx, gx(p.x)+2, gy(p.y)+2, cellSize-4, cellSize-4, 3);
          ctx.fill();
        }
      });
      (em.EBMS || []).forEach(bm => drawBlock(bm, gx, gy, 0.5));
      if (showLabels && path.length > 0) {
        ctx.fillStyle = '#74b9ff';
        ctx.font = `bold ${Math.max(9,cellSize/3.5)}px sans-serif`;
        ctx.fillText(`E${ei}`, gx(path[0].x)+3, gy(path[0].y)+14);
      }
    });
  }

  // ─── WALLS ───
  if (showLayer === 'all' || showLayer === 'walls') {
    (state.currentLevel.WMS || []).forEach(wm => {
      const p = wm.BPM;
      const x = gx(p.x), y = gy(p.y);
      const bi = wm.BI || 1;
      const grad = ctx.createLinearGradient(x, y, x+cellSize, y+cellSize);
      grad.addColorStop(0, bi > 1 ? '#6a6a88' : '#505070');
      grad.addColorStop(1, bi > 1 ? '#585878' : '#404060');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      const half = cellSize/2;
      ctx.beginPath(); ctx.moveTo(x, y+half); ctx.lineTo(x+cellSize, y+half); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+half, y); ctx.lineTo(x+half, y+half); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+cellSize*0.25, y+half); ctx.lineTo(x+cellSize*0.25, y+cellSize); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+cellSize*0.75, y+half); ctx.lineTo(x+cellSize*0.75, y+cellSize); ctx.stroke();
    });

    // ── INNER WALLS (IWMS) ── treated as wall cells by the game engine
    (state.currentLevel.IWMS || []).forEach(iw => {
      (iw.BPMS || []).forEach(p => {
        const x = gx(p.x), y = gy(p.y);
        const grad = ctx.createLinearGradient(x, y, x+cellSize, y+cellSize);
        grad.addColorStop(0, '#6a5a8a');
        grad.addColorStop(1, '#4a3a6a');
        ctx.fillStyle = grad;
        roundRect(ctx, x+2, y+2, cellSize-4, cellSize-4, 4);
        ctx.fill();
        ctx.strokeStyle = '#8a7aaa';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // hatch pattern to distinguish from outer walls
        ctx.save();
        ctx.beginPath(); ctx.rect(x+2, y+2, cellSize-4, cellSize-4); ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        for (let i = -cellSize; i < cellSize*2; i += 5) {
          ctx.beginPath(); ctx.moveTo(x+i, y); ctx.lineTo(x+i+cellSize, y+cellSize); ctx.stroke();
        }
        ctx.restore();
      });
    });
  }

  // ─── BLOCKS ───
  if (showLayer === 'all' || showLayer === 'blocks') {
    const anim = state.game?.anim;
    const animActive = anim && anim.t < 1;
    (state.currentLevel.BMS || []).forEach((bm, i) => {
      if (animActive && anim.blockIdx === i) {
        const k = 1 - anim.t;
        const offX = -anim.dx * k * cellSize;
        const offY =  anim.dy * k * cellSize;   // board y inverted on screen
        const ax = (x) => gx(x) + offX;
        const ay = (y) => gy(y) + offY;
        drawBlock(bm, ax, ay, 1.0);
      } else {
        drawBlock(bm, gx, gy, 1.0);
      }
    });
    // Draw the exit-ghost (block already spliced from BMS but mid-slide)
    if (animActive && anim.blockIdx === -1 && anim.ghostBPMS) {
      const k = 1 - anim.t;
      const offX = -anim.dx * k * cellSize;
      const offY =  anim.dy * k * cellSize;
      const ax = (x) => gx(x) + offX;
      const ay = (y) => gy(y) + offY;
      drawBlock({ BCT: anim.ghostBCT, BPMS: anim.ghostBPMS }, ax, ay, 1 - anim.t * 0.4);
    }
  }

  // ─── CURTAIN LOCKS (drape over blocks while CLC > 0; vanish at 0) ───
  if (showLayer === 'all' || showLayer === 'special') {
    // Subtle per-CLM hue shift so two adjacent curtain groups read as distinct
    const CURTAIN_PALETTE = [
      { dark: '#4a2d7a', mid: '#7c4cc8', light: '#5b3a96', rim: '#b89aff' },
      { dark: '#2d4a7a', mid: '#4c7cc8', light: '#3a5b96', rim: '#9aabff' },
      { dark: '#7a2d4a', mid: '#c84c7c', light: '#963a5b', rim: '#ff9ab8' },
      { dark: '#2d7a5a', mid: '#4cc88c', light: '#3a965b', rim: '#9affb8' },
    ];
    (state.currentLevel.CLMS || []).forEach((clm, ci) => {
      if ((clm.CLC || 0) <= 0) return;            // broken curtain: vanish, blocks visible
      const cells = clm.BPMS || [];
      if (cells.length === 0) return;
      const palette = CURTAIN_PALETTE[ci % CURTAIN_PALETTE.length];
      const posSet = new Set(cells.map(p => `${p.x},${p.y}`));
      const ys = cells.map(p => p.y);
      const maxY = Math.max(...ys);

      cells.forEach(p => {
        const x = gx(p.x), y = gy(p.y);
        const hasLeft  = posSet.has(`${p.x-1},${p.y}`);
        const hasRight = posSet.has(`${p.x+1},${p.y}`);
        const hasUp    = posSet.has(`${p.x},${p.y+1}`);
        const hasDown  = posSet.has(`${p.x},${p.y-1}`);

        // Fabric base — velvet gradient in this group's palette
        const fabricGrad = ctx.createLinearGradient(x, y, x, y + cellSize);
        fabricGrad.addColorStop(0, palette.light);
        fabricGrad.addColorStop(0.5, palette.mid);
        fabricGrad.addColorStop(1, palette.dark);
        ctx.fillStyle = fabricGrad;
        ctx.fillRect(x, y, cellSize, cellSize);

        // Vertical pleats — bands of light/dark for fabric depth
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, cellSize, cellSize); ctx.clip();
        const pleatCount = 4;
        const pleatW = cellSize / pleatCount;
        for (let i = 0; i < pleatCount; i++) {
          const px = x + i * pleatW;
          const g = ctx.createLinearGradient(px, y, px + pleatW, y);
          g.addColorStop(0, 'rgba(255,255,255,0.16)');
          g.addColorStop(0.4, 'rgba(255,255,255,0.04)');
          g.addColorStop(0.55, 'rgba(0,0,0,0.0)');
          g.addColorStop(1, 'rgba(0,0,0,0.32)');
          ctx.fillStyle = g;
          ctx.fillRect(px, y, pleatW, cellSize);
        }
        ctx.restore();

        // Internal seam between adjacent curtain cells of the same group
        if (hasLeft)  { ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x+0.5, y); ctx.lineTo(x+0.5, y+cellSize); ctx.stroke(); }
        if (hasRight) { ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x+cellSize-0.5, y); ctx.lineTo(x+cellSize-0.5, y+cellSize); ctx.stroke(); }

        // Bottom hem of the curtain — appears only along the actual bottom edge of this group
        if (!hasDown) {
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          const hemH = Math.max(2, cellSize*0.07);
          ctx.fillRect(x, y + cellSize - hemH, cellSize, hemH);
        }

        // Strong outer boundary on edges that face OUTSIDE this group
        // (this is what visually separates adjacent CLM groups from each other)
        ctx.strokeStyle = palette.rim;
        ctx.lineWidth = Math.max(2, cellSize * 0.06);
        if (!hasLeft)  { ctx.beginPath(); ctx.moveTo(x+1, y); ctx.lineTo(x+1, y+cellSize); ctx.stroke(); }
        if (!hasRight) { ctx.beginPath(); ctx.moveTo(x+cellSize-1, y); ctx.lineTo(x+cellSize-1, y+cellSize); ctx.stroke(); }
        if (!hasUp)    { ctx.beginPath(); ctx.moveTo(x, y+1); ctx.lineTo(x+cellSize, y+1); ctx.stroke(); }
        if (!hasDown)  { ctx.beginPath(); ctx.moveTo(x, y+cellSize-1); ctx.lineTo(x+cellSize, y+cellSize-1); ctx.stroke(); }
      });

      // Rod across the top edge of the curtain (only across the topmost row of this group)
      const topRow = cells.filter(p => p.y === maxY);
      if (topRow.length) {
        const xsTop = topRow.map(p => p.x).sort((a,b)=>a-b);
        const rx = gx(xsTop[0]);
        const rxEnd = gx(xsTop[xsTop.length-1]) + cellSize;
        const ry = gy(maxY) - Math.max(2, cellSize*0.08);
        const rh = Math.max(3, cellSize * 0.14);
        const rodGrad = ctx.createLinearGradient(0, ry, 0, ry + rh);
        rodGrad.addColorStop(0, '#d4be72');
        rodGrad.addColorStop(0.5, '#8a6a2e');
        rodGrad.addColorStop(1, '#5a4520');
        ctx.fillStyle = rodGrad;
        roundRect(ctx, rx - 2, ry, rxEnd - rx + 4, rh, rh / 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // CLC remaining-hits badge on the first cell of the group
      const cp = cells[0];
      const px = gx(cp.x), py = gy(cp.y);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      const badgeSize = Math.max(16, cellSize * 0.42);
      ctx.beginPath();
      ctx.arc(px + cellSize/2, py + cellSize/2, badgeSize/2, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = palette.dark;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = palette.dark;
      ctx.font = `bold ${Math.max(11, cellSize*0.32)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(clm.CLC), px + cellSize/2, py + cellSize/2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

      if (showLabels) {
        ctx.fillStyle = palette.rim;
        ctx.font = `bold ${Math.max(9, cellSize/4.5)}px sans-serif`;
        ctx.fillText(`CL${ci}`, gx(cp.x)+3, gy(cp.y)+cellSize-4);
      }
    });
  }

  // ─── DOORS ───
  if (showLayer === 'all' || showLayer === 'doors') {
    (state.currentLevel.DMS || []).forEach((dm, di) => {
      const color = COLORS[String(dm.BCT)]?.hex || '#888';
      const light = COLORS[String(dm.BCT)]?.light || '#aaa';
      const positions = dm.BPMS || [];

      positions.forEach(p => {
        const x = gx(p.x), y = gy(p.y);
        ctx.fillStyle = color + '22';
        roundRect(ctx, x+2, y+2, cellSize-4, cellSize-4, 4);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5,3]);
        roundRect(ctx, x+3, y+3, cellSize-6, cellSize-6, 3);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = light + '33';
        ctx.lineWidth = 1;
        roundRect(ctx, x+5, y+5, cellSize-10, cellSize-10, 2);
        ctx.stroke();
      });

      if (dm.DIC > 0) {
        const ds = state.doorStates[di] || {};
        const remaining = ds.iceRemaining ?? dm.DIC;
        positions.forEach(p => {
          const x = gx(p.x), y = gy(p.y);
          ctx.fillStyle = remaining > 0 ? 'rgba(100,180,255,0.85)' : 'rgba(0,200,180,0.7)';
          const badgeSize = Math.max(16, cellSize * 0.45);
          ctx.beginPath();
          ctx.arc(x + cellSize/2, y + cellSize/2, badgeSize/2, 0, Math.PI*2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${Math.max(11, cellSize*0.32)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(remaining), x + cellSize/2, y + cellSize/2);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
        });
      }
      if (showLabels && positions.length > 0) {
        const p = positions[0];
        ctx.fillStyle = light;
        ctx.font = `bold ${Math.max(9,cellSize/4)}px sans-serif`;
        let label = '';
        if (dm.IH) label += 'H';
        if (dm.DHS) label += '★';
        if (dm.TBD > 0) label += `T${dm.TBD}`;
        if (label) ctx.fillText(label, gx(p.x)+4, gy(p.y)+cellSize-4);
      }
    });
  }

  // ─── GENERATORS ───
  if (showLayer === 'all' || showLayer === 'special') {
    (state.currentLevel.GMS || []).forEach(gm => {
      const pos = gm.BPM ? [gm.BPM] : (gm.BPMS || []);
      pos.forEach(p => {
        const x = gx(p.x), y = gy(p.y);
        ctx.fillStyle = 'rgba(255,107,107,0.15)';
        roundRect(ctx, x+2, y+2, cellSize-4, cellSize-4, 4);
        ctx.fill();
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const cx = x+cellSize/2, cy = y+cellSize/2;
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        ctx.moveTo(cx, cy+6); ctx.lineTo(cx-5, cy-2); ctx.lineTo(cx+5, cy-2);
        ctx.closePath(); ctx.fill();
      });
    });
  }

  // ─── CCMS (Color Connected Cells) ───
  if (showLayer === 'all' || showLayer === 'special') {
    (state.currentLevel.CCMS || []).forEach((ccm, ci) => {
      const color = COLORS[String(ccm.BCT)]?.hex || '#888';
      const positions = ccm.BPMS || [];
      if (positions.length > 1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.6;
        ctx.setLineDash([3,3]);
        ctx.beginPath();
        ctx.moveTo(gx(positions[0].x)+cellSize/2, gy(positions[0].y)+cellSize/2);
        for (let i=1; i<positions.length; i++) ctx.lineTo(gx(positions[i].x)+cellSize/2, gy(positions[i].y)+cellSize/2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      positions.forEach(p => {
        const cx = gx(p.x)+cellSize/2, cy = gy(p.y)+cellSize/2;
        const s = Math.max(5, cellSize*0.18);
        ctx.fillStyle = color + 'aa';
        ctx.beginPath();
        ctx.moveTo(cx, cy-s); ctx.lineTo(cx+s, cy); ctx.lineTo(cx, cy+s); ctx.lineTo(cx-s, cy);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
      if (showLabels && positions.length > 0) {
        const p = positions[0];
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.max(8,cellSize/5)}px sans-serif`;
        ctx.fillText(`CC${ci}`, gx(p.x)+2, gy(p.y)+cellSize-2);
      }
    });
  }

  // ─── GRM (Grinders) ───
  if (showLayer === 'all' || showLayer === 'special') {
    (state.currentLevel.GRM || []).forEach((grm, gi) => {
      const entry = grm.BPM;
      const path = grm.BPMS || [];
      if (path.length > 1) {
        ctx.strokeStyle = 'rgba(255,165,0,0.4)';
        ctx.lineWidth = 3;
        ctx.setLineDash([4,3]);
        ctx.beginPath();
        ctx.moveTo(gx(path[0].x)+cellSize/2, gy(path[0].y)+cellSize/2);
        for (let i=1; i<path.length; i++) ctx.lineTo(gx(path[i].x)+cellSize/2, gy(path[i].y)+cellSize/2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (entry) {
        const x = gx(entry.x), y = gy(entry.y);
        ctx.fillStyle = 'rgba(255,165,0,0.25)';
        roundRect(ctx, x+2, y+2, cellSize-4, cellSize-4, 4);
        ctx.fill();
        ctx.strokeStyle = '#ffa500';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ffa500';
        ctx.font = `bold ${Math.max(12,cellSize/2.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('⚙', x+cellSize/2, y+cellSize/2+4);
        ctx.textAlign = 'left';
      }
      if (showLabels && entry) {
        ctx.fillStyle = '#ffa500';
        ctx.font = `bold ${Math.max(8,cellSize/5)}px sans-serif`;
        ctx.fillText(`GR${gi}`, gx(entry.x)+2, gy(entry.y)+cellSize-2);
      }
    });
  }

  // ─── BSP ───
  if (state.currentLevel.BSP) {
    state.currentLevel.BSP.forEach(p => {
      const x = gx(p.x), y = gy(p.y);
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2;
      ctx.setLineDash([4,2]);
      roundRect(ctx, x+3, y+3, cellSize-6, cellSize-6, 4);
      ctx.stroke();
      ctx.setLineDash([]);
      const cx = x+cellSize/2, cy = y+cellSize/2;
      ctx.fillStyle = '#00ff8855';
      ctx.beginPath();
      ctx.moveTo(cx, cy-5); ctx.lineTo(cx+5, cy); ctx.lineTo(cx, cy+5); ctx.lineTo(cx-5, cy);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  // ─── COORDS ───
  if (showCoords) {
    ctx.fillStyle = '#5a5a78';
    ctx.font = '10px "SF Mono", monospace';
    ctx.textAlign = 'center';
    for (let x = offX + pad; x <= offX + gridW - pad; x++) {
      ctx.fillText(x, gx(x) + cellSize/2, oy - 10);
    }
    ctx.textAlign = 'right';
    for (let y = offY + pad; y <= offY + gridH - pad; y++) {
      ctx.fillText(y, ox - 8, gy(y) + cellSize/2 + 3);
    }
    ctx.textAlign = 'left';
  }

  // ─── SELECTION HIGHLIGHT (merged from monkey-patch) ───
  if (!state.selectedElement || !state.currentLevel) return;

  let positions = [];
  const s = state.selectedElement;
  if (s.type === 'block' && state.currentLevel.BMS?.[s.index]) positions = state.currentLevel.BMS[s.index].BPMS || [];
  if (s.type === 'door' && state.currentLevel.DMS?.[s.index]) positions = state.currentLevel.DMS[s.index].BPMS || [];
  if (s.type === 'elevator' && state.currentLevel.EMS?.[s.index]) positions = state.currentLevel.EMS[s.index].BPMS || [];
  if (s.type === 'curtain' && state.currentLevel.CLMS?.[s.index]) positions = state.currentLevel.CLMS[s.index].BPMS || [];
  if (s.type === 'wall' && state.currentLevel.WMS?.[s.index]) positions = [state.currentLevel.WMS[s.index].BPM];

  const rs = state.renderState;
  const gxFn = (x) => (x - rs.offsetX) * rs.cellSize + rs.ox;
  const gyFn = (y) => (rs.gridH - 1 - (y - rs.offsetY)) * rs.cellSize + rs.oy;

  const isMoving = state.dragMode === 'move';
  const selColor = isMoving ? (state.lastMoveValid ? '#00ff88' : '#ff4444') : '#ffffff';

  if (isMoving && !state.lastMoveValid) {
    ctx.fillStyle = 'rgba(255, 50, 50, 0.25)';
    positions.forEach(p => {
      ctx.fillRect(gxFn(p.x), gyFn(p.y), rs.cellSize, rs.cellSize);
    });
  }

  ctx.strokeStyle = selColor;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([6, 3]);
  positions.forEach(p => {
    roundRect(ctx, gxFn(p.x) + 1, gyFn(p.y) + 1, rs.cellSize - 2, rs.cellSize - 2, 4);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  ctx.fillStyle = selColor;
  positions.forEach(p => {
    const x = gxFn(p.x), y = gyFn(p.y), cs = rs.cellSize;
    [[x,y],[x+cs-4,y],[x,y+cs-4],[x+cs-4,y+cs-4]].forEach(([cx,cy]) => {
      ctx.fillRect(cx, cy, 4, 4);
    });
  });

  if (isMoving && !state.lastMoveValid && state.moveViolation && positions.length > 0) {
    const p0 = positions[0];
    const tx = gxFn(p0.x);
    const ty = gyFn(p0.y) - 8;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    const tw = ctx.measureText(state.moveViolation).width;
    roundRect(ctx, tx - 4, ty - 14, tw + 8, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#ff6b6b';
    ctx.fillText(state.moveViolation, tx, ty);
  }
}
