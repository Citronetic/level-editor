import { state } from './state.js';
import { COLORS } from './constants.js';
import { renderLevel } from './render.js';

export function switchTab(tab, el) {
  document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t === el));
  document.getElementById('panel-info').style.display = tab === 'info' ? '' : 'none';
  document.getElementById('panel-legend').style.display = tab === 'legend' ? '' : 'none';
  document.getElementById('panel-json').style.display = tab === 'json' ? '' : 'none';
}

export function updateInfoPanel() {
  if (!state.currentLevel) return;
  const cfg = state.levelsConfig.find(c => c.seedId === state.currentLevelId);

  const ov = document.getElementById('info-overview');
  const cells = state.currentLevel.CMS?.length || 0;
  const blocks = state.currentLevel.BMS?.length || 0;
  const walls = state.currentLevel.WMS?.length || 0;
  const doors = state.currentLevel.DMS?.length || 0;
  const diffLabel = cfg?.isSuperHard ? '超难' : cfg?.isHard ? '困难' : '普通';
  ov.innerHTML = `
    <div class="info-card"><div class="ic-value">${cells}</div><div class="ic-label">棋盘格 (CMS)</div></div>
    <div class="info-card"><div class="ic-value">${blocks}</div><div class="ic-label">方块 (BMS)</div></div>
    <div class="info-card"><div class="ic-value">${walls}</div><div class="ic-label">外墙 (WMS)</div></div>
    <div class="info-card"><div class="ic-value">${doors}</div><div class="ic-label">出口门 (DMS)</div></div>
    <div class="info-card wide"><div class="ic-value">${cfg?.levelDuration || '?'}s</div><div class="ic-label">时间限制 &mdash; ${diffLabel}</div></div>
  `;

  const colorCounts = {};
  (state.currentLevel.BMS || []).forEach(bm => {
    const c = String(bm.BCT);
    colorCounts[c] = (colorCounts[c] || 0) + (bm.BPMS?.length || 1);
  });
  const totalColorCells = Object.values(colorCounts).reduce((a,b)=>a+b, 0) || 1;
  const sortedColors = Object.entries(colorCounts).sort((a,b) => b[1] - a[1]);

  document.getElementById('color-bar').innerHTML = sortedColors.map(([c, n]) =>
    `<div class="color-bar-seg" style="width:${(n/totalColorCells*100).toFixed(1)}%;background:${COLORS[c]?.hex||'#888'}"></div>`
  ).join('');

  document.getElementById('color-list').innerHTML = sortedColors.map(([c, n]) =>
    `<div class="color-chip"><div class="cc-swatch" style="background:${COLORS[c]?.hex||'#888'}"></div>${COLORS[c]?.name||'?'}<span class="cc-count">${n}</span></div>`
  ).join('');

  const el = document.getElementById('info-elements');
  const elems = [];
  if (state.currentLevel.EMS?.length) elems.push(['升降梯 (EMS)', state.currentLevel.EMS.length]);
  if (state.currentLevel.GMS?.length) elems.push(['生成器 (GMS)', state.currentLevel.GMS.length]);
  if (state.currentLevel.CLMS?.length) elems.push(['帘锁 (CLMS)', state.currentLevel.CLMS.length]);
  if (state.currentLevel.IWMS?.length) elems.push(['内墙 (IWMS)', state.currentLevel.IWMS.length]);
  if (state.currentLevel.CBMS?.length) elems.push(['连通方块 (CBMS)', state.currentLevel.CBMS.length]);
  if (state.currentLevel.GRM?.length) elems.push(['研磨器 (GRM)', state.currentLevel.GRM.length]);
  if (state.currentLevel.BSP?.length) elems.push(['起始位置 (BSP)', state.currentLevel.BSP.length]);
  el.innerHTML = elems.length ? elems.map(([name, count]) =>
    `<div class="info-card"><div class="ic-value">${count}</div><div class="ic-label">${name}</div></div>`
  ).join('') : '<div style="color:var(--text-dim);font-size:11px">无特殊元素</div>';

  const bd = document.getElementById('block-details');
  const blockLines = (state.currentLevel.BMS || []).map((bm, i) => {
    const color = COLORS[String(bm.BCT)]?.name || '?';
    const shape = bm.BPMS?.length || 0;
    const attrs = [];
    if (bm.BIC > 0) attrs.push(`数量:${bm.BIC}`);
    if (bm.BAD > 0) attrs.push(bm.BAD===1?'方向:水平':'方向:垂直');
    if (bm.KID > 0) attrs.push(`钥匙:${bm.KID}`);
    if (bm.BHS) attrs.push('高');
    if (bm.BD > 0) attrs.push(`伤害:${bm.BD}`);
    if (bm.ILE) attrs.push('可爆炸');
    const sel = state.selectedElement?.type === 'block' && state.selectedElement.index === i ? 'background:var(--accent);color:#fff;' : '';
    return `<div style="padding:4px 6px;border-bottom:1px solid var(--border);cursor:pointer;border-radius:3px;${sel}" onclick="selectBlock(${i})">
      <span style="color:${COLORS[String(bm.BCT)]?.hex||'#888'}">&#9632;</span>
      方块 ${i} &mdash; ${color}, ${shape}格 ${attrs.length ? '(' + attrs.join(', ') + ')' : ''}
    </div>`;
  });
  bd.innerHTML = blockLines.join('') || '<span>无方块</span>';
}

export function updateJsonPanel() {
  if (!state.currentLevel) return;
  const json = JSON.stringify(state.currentLevel, null, 2);
  document.getElementById('json-view').innerHTML = syntaxHighlight(json);
}

function syntaxHighlight(json) {
  return json.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"(\$type|[A-Z]{2,}[A-Za-z]*|[a-z][A-Za-z]*)":/g, '<span class="json-key">"$1"</span>:')
    .replace(/"([^"]*)"(?!:)/g, '<span class="json-str">"$1"</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="json-num">$1</span>')
    .replace(/\b(true|false)\b/g, '<span class="json-bool">$1</span>');
}

export function buildLegend() {
  document.getElementById('legend-colors').innerHTML = Object.entries(COLORS).map(([k,v]) =>
    `<div class="legend-item"><div class="legend-swatch" style="background:${v.hex}"></div>${v.name} (${k})</div>`
  ).join('');

  const elems = [
    ['#2a2a4e', '棋盘格 (可放置区)', ''],
    ['#555577', '外墙', 'hatch'],
    ['#888', '出口门', 'dashed'],
    ['#4a90d9', '升降梯路径', ''],
    ['#ff6b6b', '生成器', ''],
    ['#8b5cf6', '帘锁', ''],
    ['#00ff88', '起始位置 (BSP)', 'outline'],
  ];
  document.getElementById('legend-elements').innerHTML = elems.map(([c,l,s]) =>
    `<div class="legend-item"><div class="legend-swatch" style="background:${c};${s==='dashed'?'border:2px dashed #fff;background:transparent':''}${s==='outline'?'border:2px solid #00ff88;background:transparent':''}"></div>${l}</div>`
  ).join('');
}

export function selectBlock(i) {
  state.selectedElement = { type: 'block', index: i };
  renderLevel();
  updateInfoPanel();
  updateSelectionPanel();
}

export function updateSelectionPanel() {
  const sec = document.getElementById('selection-section');
  const info = document.getElementById('selection-info');
  if (!state.selectedElement || !state.currentLevel) { sec.style.display = 'none'; return; }
  sec.style.display = '';
  switchTab('info', document.querySelector('[data-tab="info"]'));

  const s = state.selectedElement;
  let html = '';
  const typeNames = { block:'方块', door:'出口门', wall:'外墙', elevator:'升降梯', curtain:'帘锁' };
  const badNames = { 0:'无', 1:'水平', 2:'垂直' };
  const _row = (label, value) => `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px"><span style="color:var(--text-dim)">${label}</span><span style="color:var(--text);font-weight:500">${value}</span></div>`;

  if (!state.isCustomLevel) {
    // ── Read-only mode ──
    if (s.type === 'block') {
      const bm = state.currentLevel.BMS[s.index];
      if (!bm) { sec.style.display='none'; return; }
      const c = COLORS[String(bm.BCT)];
      html = `
        <div style="font-weight:600;color:var(--accent-bright);margin-bottom:8px">${typeNames[s.type]} #${s.index}</div>
        <div style="margin-bottom:8px"><span style="color:${c?.hex}">&#9632;</span> ${c?.name} (BCT=${bm.BCT})</div>
        <div style="background:var(--bg-darkest);border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px">
          <div style="font-size:10px;font-weight:600;color:var(--text);margin-bottom:4px">属性</div>
          ${_row('颜色', `${c?.name} (${bm.BCT})`)}
          ${_row('数量', bm.BIC||0)}
          ${_row('攻击', badNames[bm.BAD]||'无')}
          ${_row('冰冻', bm.BD ? bm.BD+'层' : '无')}
          ${_row('钥匙', bm.KID ? 'K'+bm.KID : '无')}
          ${_row('高方块', bm.BHS?'是':'否')}
          ${_row('可爆炸', bm.ILE?'是':'否')}
        </div>
        <div style="font-size:10px;color:var(--text-dim)">
          占格 (${(bm.BPMS||[]).length}格): ${(bm.BPMS||[]).map(p=>`(${p.x},${p.y})`).join(' ')}
        </div>
      `;
    } else if (s.type === 'door') {
      const dm = state.currentLevel.DMS[s.index];
      if (!dm) { sec.style.display='none'; return; }
      const c = COLORS[String(dm.BCT)];
      const ds = state.doorStates[s.index] || { iceRemaining: 0, starSatisfied: true, turnState: 'open' };
      const isOpen = (ds.iceRemaining <= 0) && ds.starSatisfied && (ds.turnState !== 'closed');
      html = `
        <div style="font-weight:600;color:var(--accent-bright);margin-bottom:8px">${typeNames[s.type]} #${s.index}
          <span style="font-size:10px;padding:2px 6px;border-radius:3px;margin-left:6px;${isOpen?'background:rgba(0,206,201,.2);color:#00cec9':'background:rgba(255,118,117,.2);color:#ff7675'}">${isOpen?'可通过':'阻挡中'}</span>
        </div>
        <div style="margin-bottom:8px"><span style="color:${c?.hex}">&#9632;</span> ${c?.name} (BCT=${dm.BCT})</div>
        <div style="background:var(--bg-darkest);border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px">
          <div style="font-size:10px;font-weight:600;color:var(--text);margin-bottom:4px">属性</div>
          ${_row('颜色', `${c?.name} (${dm.BCT})`)}
          ${_row('区域', dm.BI||1)}
          ${_row('冰层', dm.DIC||0)}
          ${_row('回合', dm.TBD||0)}
          ${_row('水平', dm.IH?'是':'否')}
          ${_row('星星门', dm.DHS?'是':'否')}
        </div>
        <div style="font-size:10px;color:var(--text-dim)">
          占格 (${(dm.BPMS||[]).length}格): ${(dm.BPMS||[]).map(p=>`(${p.x},${p.y})`).join(' ')}
        </div>
      `;
    } else {
      const listKeys = { wall:'WMS', elevator:'EMS', curtain:'CLMS' };
      const el = state.currentLevel[listKeys[s.type]]?.[s.index];
      const positions = el ? (el.BPMS || (el.BPM ? [el.BPM] : [])) : [];
      html = `<div style="font-weight:600;color:var(--accent-bright);margin-bottom:8px">${typeNames[s.type]} #${s.index}</div>
        <div style="font-size:10px;color:var(--text-dim)">占格: ${positions.map(p=>`(${p.x},${p.y})`).join(' ')}</div>`;
    }
  } else {
    // ── Editable mode (custom level) ──
    if (s.type === 'block') {
      const bm = state.currentLevel.BMS[s.index];
      if (!bm) { sec.style.display='none'; return; }
      const c = COLORS[String(bm.BCT)];
      html = `
        <div style="font-weight:600;color:var(--accent-bright);margin-bottom:8px">${typeNames[s.type]} #${s.index}</div>
        <div style="margin-bottom:6px"><span style="color:${c?.hex}">&#9632;</span> ${c?.name} (BCT=${bm.BCT})</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
          <label style="font-size:10px;color:var(--text-dim)">颜色 (BCT)<br><select onchange="editProp('block',${s.index},'BCT',+this.value)" style="width:100%;background:var(--bg-darkest);color:var(--text);border:1px solid var(--border);padding:3px;border-radius:3px;font-size:11px">
            ${Object.entries(COLORS).map(([k,v])=>`<option value="${k}" ${String(bm.BCT)===k?'selected':''}>${v.name} (${k})</option>`).join('')}
          </select></label>
          <label style="font-size:10px;color:var(--text-dim)">初始数量 (BIC)<br><input type="number" value="${bm.BIC||0}" onchange="editProp('block',${s.index},'BIC',+this.value)" style="width:100%;background:var(--bg-darkest);color:var(--text);border:1px solid var(--border);padding:3px;border-radius:3px;font-size:11px"></label>
          <label style="font-size:10px;color:var(--text-dim)">攻击方向 (BAD)<br><select onchange="editProp('block',${s.index},'BAD',+this.value)" style="width:100%;background:var(--bg-darkest);color:var(--text);border:1px solid var(--border);padding:3px;border-radius:3px;font-size:11px">
            <option value="0" ${bm.BAD===0?'selected':''}>无</option><option value="1" ${bm.BAD===1?'selected':''}>水平</option><option value="2" ${bm.BAD===2?'selected':''}>垂直</option>
          </select></label>
          <label style="font-size:10px;color:var(--text-dim)">伤害 (BD)<br><input type="number" value="${bm.BD||0}" onchange="editProp('block',${s.index},'BD',+this.value)" style="width:100%;background:var(--bg-darkest);color:var(--text);border:1px solid var(--border);padding:3px;border-radius:3px;font-size:11px"></label>
          <label style="font-size:10px;color:var(--text-dim)">冰冻层数 (BD)<br><input type="number" value="${bm.BD||0}" min="0" max="10" onchange="editProp('block',${s.index},'BD',+this.value)" style="width:100%;background:var(--bg-darkest);color:var(--text);border:1px solid var(--border);padding:3px;border-radius:3px;font-size:11px"></label>
          <label style="font-size:10px;color:var(--text-dim)">钥匙ID (KID)<br><input type="number" value="${bm.KID||0}" onchange="editProp('block',${s.index},'KID',+this.value)" style="width:100%;background:var(--bg-darkest);color:var(--text);border:1px solid var(--border);padding:3px;border-radius:3px;font-size:11px"></label>
        </div>
        <div style="display:flex;gap:8px;margin-top:6px">
          <label class="tool-toggle" style="font-size:10px"><input type="checkbox" ${bm.BHS?'checked':''} onchange="editProp('block',${s.index},'BHS',this.checked)"> 高方块(BHS)</label>
          <label class="tool-toggle" style="font-size:10px"><input type="checkbox" ${bm.ILE?'checked':''} onchange="editProp('block',${s.index},'ILE',this.checked)"> 可爆炸(ILE)</label>
        </div>
        <div style="margin-top:6px;font-size:10px;color:var(--text-dim)">
          占格 (${(bm.BPMS||[]).length}格): ${(bm.BPMS||[]).map((p,pi)=>`<span style="cursor:pointer;text-decoration:underline dotted" title="点击移除此格" onclick="removeCellFromElement('block',${s.index},${pi})">(${p.x},${p.y})</span>`).join(' ')}
        </div>
        <div style="margin-top:4px;font-size:10px;color:var(--accent-bright)">💡 Shift+点击相邻格子可扩展此方块</div>
        <button onclick="deleteSelected()" style="margin-top:8px;padding:4px 12px;background:var(--danger);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px">删除此方块</button>
      `;
    } else if (s.type === 'door') {
      const dm = state.currentLevel.DMS[s.index];
      if (!dm) { sec.style.display='none'; return; }
      const c = COLORS[String(dm.BCT)];
      const ds = state.doorStates[s.index] || { iceRemaining: 0, starSatisfied: true, turnState: 'open' };
      const isOpen = (ds.iceRemaining <= 0) && ds.starSatisfied && (ds.turnState !== 'closed');
      html = `
        <div style="font-weight:600;color:var(--accent-bright);margin-bottom:8px">${typeNames[s.type]} #${s.index}
          <span style="font-size:10px;padding:2px 6px;border-radius:3px;margin-left:6px;${isOpen?'background:rgba(0,206,201,.2);color:#00cec9':'background:rgba(255,118,117,.2);color:#ff7675'}">${isOpen?'可通过':'阻挡中'}</span>
        </div>
        <div style="margin-bottom:6px"><span style="color:${c?.hex}">&#9632;</span> ${c?.name} (BCT=${dm.BCT})</div>

        <div style="background:var(--bg-darkest);border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px">
          <div style="font-size:10px;font-weight:600;color:var(--text);margin-bottom:6px">门状态模拟</div>
          ${dm.DIC > 0 ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-size:10px;color:var(--text-dim)">冰层: ${ds.iceRemaining}/${dm.DIC}</span>
            <button onclick="doorMeltIce(${s.index})" style="padding:2px 8px;background:${ds.iceRemaining>0?'var(--success)':'var(--border)'};color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px" ${ds.iceRemaining<=0?'disabled':''}>消除一层冰</button>
            <button onclick="doorResetIce(${s.index})" style="padding:2px 8px;background:var(--border);color:var(--text);border:none;border-radius:3px;cursor:pointer;font-size:10px">重置</button>
          </div>` : ''}
          ${dm.DHS ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-size:10px;color:var(--text-dim)">星星门:</span>
            <button onclick="doorToggleStar(${s.index})" style="padding:2px 8px;background:${ds.starSatisfied?'var(--success)':'var(--warning)'};color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px">${ds.starSatisfied?'已满足 (点击锁定)':'未满足 (点击解锁)'}</button>
          </div>` : ''}
          ${dm.TBD > 0 ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-size:10px;color:var(--text-dim)">回合门 (${dm.TBD}回合):</span>
            <button onclick="doorToggleTurn(${s.index})" style="padding:2px 8px;background:${ds.turnState==='open'?'var(--success)':'var(--danger)'};color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px">${ds.turnState==='open'?'开启 (点击关闭)':'关闭 (点击开启)'}</button>
          </div>` : ''}
          ${!dm.DIC && !dm.DHS && !dm.TBD ? '<div style="font-size:10px;color:var(--text-dim)">此门无特殊限制，始终可通过同色方块</div>' : ''}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
          <label style="font-size:10px;color:var(--text-dim)">颜色 (BCT)<br><select onchange="editDoorProp(${s.index},'BCT',+this.value)" style="width:100%;background:var(--bg-darkest);color:var(--text);border:1px solid var(--border);padding:3px;border-radius:3px;font-size:11px">
            ${Object.entries(COLORS).map(([k,v])=>`<option value="${k}" ${String(dm.BCT)===k?'selected':''}>${v.name} (${k})</option>`).join('')}
          </select></label>
          <label style="font-size:10px;color:var(--text-dim)">区域 (BI)<br><input type="number" value="${dm.BI||1}" onchange="editDoorProp(${s.index},'BI',+this.value)" style="width:100%;background:var(--bg-darkest);color:var(--text);border:1px solid var(--border);padding:3px;border-radius:3px;font-size:11px"></label>
          <label style="font-size:10px;color:var(--text-dim)">冰层数 (DIC)<br><input type="number" value="${dm.DIC||0}" onchange="editDoorProp(${s.index},'DIC',+this.value)" style="width:100%;background:var(--bg-darkest);color:var(--text);border:1px solid var(--border);padding:3px;border-radius:3px;font-size:11px"></label>
          <label style="font-size:10px;color:var(--text-dim)">回合数 (TBD)<br><input type="number" value="${dm.TBD||0}" onchange="editDoorProp(${s.index},'TBD',+this.value)" style="width:100%;background:var(--bg-darkest);color:var(--text);border:1px solid var(--border);padding:3px;border-radius:3px;font-size:11px"></label>
        </div>
        <div style="display:flex;gap:8px;margin-top:6px">
          <label class="tool-toggle" style="font-size:10px"><input type="checkbox" ${dm.IH?'checked':''} onchange="editDoorProp(${s.index},'IH',this.checked)"> 水平(IH)</label>
          <label class="tool-toggle" style="font-size:10px"><input type="checkbox" ${dm.DHS?'checked':''} onchange="editDoorProp(${s.index},'DHS',this.checked)"> 星星门(DHS)</label>
        </div>
        <div style="margin-top:6px;font-size:10px;color:var(--text-dim)">
          占格 (${(dm.BPMS||[]).length}格): ${(dm.BPMS||[]).map((p,pi)=>`<span style="cursor:pointer;text-decoration:underline dotted" title="点击移除此格" onclick="removeCellFromElement('door',${s.index},${pi})">(${p.x},${p.y})</span>`).join(' ')}
        </div>
        <div style="margin-top:4px;font-size:10px;color:var(--accent-bright)">💡 Shift+点击相邻格子可扩展此门</div>
        <button onclick="deleteSelected()" style="margin-top:8px;padding:4px 12px;background:var(--danger);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px">删除此门</button>
      `;
    } else {
      html = `<div style="font-weight:600;color:var(--accent-bright);margin-bottom:8px">${typeNames[s.type]} #${s.index}</div>
        <button onclick="deleteSelected()" style="margin-top:8px;padding:4px 12px;background:var(--danger);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px">删除</button>`;
    }
  }
  info.innerHTML = html;
}

export function editProp(type, index, prop, value) {
  if (!state.isCustomLevel) return;
  if (type === 'block' && state.currentLevel.BMS?.[index]) {
    state.currentLevel.BMS[index][prop] = value;
    state.modified = true;
    renderLevel();
    updateInfoPanel();
    updateJsonPanel();
    autoSave();
  }
}

export function editDoorProp(index, prop, value) {
  if (!state.isCustomLevel) return;
  if (state.currentLevel.DMS?.[index]) {
    state.currentLevel.DMS[index][prop] = value;
    if (prop === 'DIC') {
      state.doorStates[index] = state.doorStates[index] || {};
      state.doorStates[index].iceRemaining = value;
    }
    if (prop === 'DHS') {
      state.doorStates[index] = state.doorStates[index] || {};
      state.doorStates[index].starSatisfied = !value;
    }
    if (prop === 'TBD') {
      state.doorStates[index] = state.doorStates[index] || {};
      state.doorStates[index].turnState = value > 0 ? 'closed' : 'open';
    }
    state.modified = true;
    renderLevel();
    updateInfoPanel();
    updateSelectionPanel();
    updateJsonPanel();
    autoSave();
  }
}

export function doorMeltIce(index) {
  if (!state.doorStates[index]) return;
  state.doorStates[index].iceRemaining = Math.max(0, state.doorStates[index].iceRemaining - 1);
  renderLevel();
  updateSelectionPanel();
}

export function doorResetIce(index) {
  if (!state.doorStates[index] || !state.currentLevel.DMS?.[index]) return;
  state.doorStates[index].iceRemaining = state.currentLevel.DMS[index].DIC || 0;
  renderLevel();
  updateSelectionPanel();
}

export function doorToggleStar(index) {
  if (!state.doorStates[index]) return;
  state.doorStates[index].starSatisfied = !state.doorStates[index].starSatisfied;
  renderLevel();
  updateSelectionPanel();
}

export function doorToggleTurn(index) {
  if (!state.doorStates[index]) return;
  state.doorStates[index].turnState = state.doorStates[index].turnState === 'open' ? 'closed' : 'open';
  renderLevel();
  updateSelectionPanel();
}

export function removeCellFromElement(type, index, posIndex) {
  if (!state.isCustomLevel) return;
  const lists = { block: 'BMS', door: 'DMS' };
  const listKey = lists[type];
  if (!listKey || !state.currentLevel[listKey]?.[index]) return;
  const el = state.currentLevel[listKey][index];
  const positions = el.BPMS || [];
  if (positions.length <= 1) {
    state.currentLevel[listKey].splice(index, 1);
    state.selectedElement = null;
  } else {
    positions.splice(posIndex, 1);
  }
  state.modified = true;
  renderLevel();
  updateInfoPanel();
  updateSelectionPanel();
  updateJsonPanel();
  autoSave();
}

export function deleteSelected() {
  if (!state.isCustomLevel) return;
  if (!state.selectedElement || !state.currentLevel) return;
  const s = state.selectedElement;
  const lists = { block: 'BMS', door: 'DMS', wall: 'WMS', elevator: 'EMS', curtain: 'CLMS' };
  const listKey = lists[s.type];
  if (listKey && state.currentLevel[listKey]) {
    state.currentLevel[listKey].splice(s.index, 1);
    state.selectedElement = null;
    state.modified = true;
    renderLevel();
    updateInfoPanel();
    updateSelectionPanel();
    updateJsonPanel();
    autoSave();
  }
}

function autoSave() {
  try { localStorage.setItem('customLevels', JSON.stringify(state.customLevels)); } catch(e) {}
}
