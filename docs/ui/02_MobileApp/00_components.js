/* ============================================================
   ADAPTIVELEARN — COMMON COMPONENTS & CONTROLS
   Student Portal · v1.0 · April 2026
   Usage: include after 00_design-system.css
   ============================================================ */

/* ─────────────────────────────────────────
   COMPONENT: Sidebar
   Usage: ALP.sidebar({ active: 'dashboard', badge: 'doubts' })
───────────────────────────────────────── */
const ALP_NAV = [
  { id:'dashboard',  icon:'⚡', label:'Home' },
  { id:'study',      icon:'📚', label:'Study' },
  { id:'practice',   icon:'🎯', label:'Practice' },
  { id:'analysis',   icon:'📊', label:'Analysis' },
  { id:'experts',    icon:'💬', label:'Experts',  badge: true },
  { id:'leaderboard',icon:'🏆', label:'Rank' },
  { id:'profile',    icon:'⚙️', label:'Profile' },
];

function ALP_renderSidebar(activeId, badgeIds = ['experts']) {
  return `
  <nav class="sidebar">
    <div class="sidebar-logo">A</div>
    ${ALP_NAV.map(n => `
      <div class="nav-item ${n.id===activeId?'active':''}" onclick="ALP_navigate('${n.id}')">
        <span class="nav-icon">${n.icon}</span>
        <span class="nav-label">${n.label}</span>
        ${badgeIds.includes(n.id) ? '<div class="nav-badge"></div>' : ''}
      </div>`).join('')}
    <div class="sidebar-avatar">P</div>
  </nav>`;
}

/* ─────────────────────────────────────────
   COMPONENT: Topbar
   Usage: ALP_renderTopbar({ title, chips, actions })
───────────────────────────────────────── */
function ALP_renderTopbar({ title = '', chips = [], actions = '' }) {
  const chipHtml = chips.map(c =>
    `<div class="topbar-chip">${c.dot ? '<div class="live-dot"></div>' : ''}${c.label}</div>`
  ).join('');
  return `
  <header class="topbar">
    <div class="topbar-title">${title}</div>
    ${chipHtml}
    ${actions}
  </header>`;
}

/* ─────────────────────────────────────────
   COMPONENT: AI Recommendation Card
   Usage: ALP_recoCard({ eyebrow, title, meta, impact, btnLabel, onClick })
───────────────────────────────────────── */
function ALP_recoCard({ eyebrow='◈ AI RECOMMENDS · RIGHT NOW', title='', meta='', impact='', btnLabel='Start →', onClick='', extra='' }) {
  return `
  <div class="reco-card" onclick="${onClick}" style="
    background:rgba(34,212,238,0.04);border:1.5px solid rgba(34,212,238,0.2);
    border-radius:14px;padding:13px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;">
    <div style="width:44px;height:44px;border-radius:12px;background:rgba(34,212,238,0.1);
      border:1px solid rgba(34,212,238,0.18);display:flex;align-items:center;justify-content:center;
      font-size:20px;flex-shrink:0">⚡</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:9px;font-weight:700;color:#22D4EE;letter-spacing:.6px;margin-bottom:2px">${eyebrow}</div>
      <div style="font-size:13px;font-weight:700;color:#EEF2FF;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${title}</div>
      <div style="font-size:10.5px;color:#7A8BAD">${meta}</div>
      ${impact ? `<div style="font-size:10px;font-weight:700;color:#10C47A;margin-top:4px">${impact}</div>` : ''}
      ${extra}
    </div>
    <div class="btn btn-ai" style="flex-shrink:0">${btnLabel}</div>
  </div>`;
}

/* ─────────────────────────────────────────
   COMPONENT: KPI stat tile
   Usage: ALP_kpiTile({ value, label, delta, color, icon })
───────────────────────────────────────── */
function ALP_kpiTile({ value='', label='', delta='', color='var(--text-primary)', icon='' }) {
  const deltaColor = delta.startsWith('▲') ? 'var(--color-green)' : delta.startsWith('▼') ? 'var(--color-red)' : 'var(--text-faint)';
  return `
  <div class="card" style="padding:12px">
    ${icon ? `<div style="font-size:15px;margin-bottom:6px">${icon}</div>` : ''}
    <div style="font-size:20px;font-weight:800;color:${color};line-height:1;font-variant-numeric:tabular-nums;margin-bottom:4px">${value}</div>
    <div style="font-size:9.5px;color:var(--text-faint)">${label}</div>
    ${delta ? `<div style="font-size:9.5px;font-weight:600;color:${deltaColor};margin-top:5px">${delta}</div>` : ''}
  </div>`;
}

/* ─────────────────────────────────────────
   COMPONENT: Subject mastery row
   Usage: ALP_subjectRow({ emoji, name, pct, strength, color, topicCount })
───────────────────────────────────────── */
function ALP_subjectRow({ emoji='', name='', pct=0, strength='DEVELOPING', color='var(--color-blue)', topicCount='' }) {
  const strClass = {STRONG:'str-strong',DEVELOPING:'str-dev',WEAK:'str-weak','NOT STARTED':'str-new'}[strength] || 'str-dev';
  return `
  <div class="flex gap-3" style="margin-bottom:11px;align-items:center">
    <span style="font-size:15px;width:22px;text-align:center;flex-shrink:0">${emoji}</span>
    <div style="flex:1;min-width:0">
      <div class="flex-between" style="margin-bottom:4px">
        <span style="font-size:12px;font-weight:600;color:var(--text-secondary)">${name}</span>
        <div class="flex gap-2" style="align-items:center">
          <span class="str ${strClass}">${strength}</span>
          <span style="font-size:11px;font-weight:700;color:${color};font-variant-numeric:tabular-nums">${pct}%</span>
        </div>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
      ${topicCount ? `<div style="font-size:9px;color:var(--text-faint);margin-top:2px">${topicCount}</div>` : ''}
    </div>
  </div>`;
}

/* ─────────────────────────────────────────
   COMPONENT: AI Insight bullet list
   Usage: ALP_insightList([ { color, text } ])
───────────────────────────────────────── */
function ALP_insightList(items = []) {
  return `
  <div style="background:rgba(34,212,238,0.04);border:1px solid rgba(34,212,238,0.14);border-radius:13px;padding:13px">
    <div style="font-size:9px;font-weight:700;color:#22D4EE;letter-spacing:.5px;margin-bottom:10px">◈ AI INSIGHTS</div>
    ${items.map(i => `
      <div class="flex" style="gap:8px;align-items:flex-start;margin-bottom:7px">
        <div style="width:5px;height:5px;border-radius:50%;background:${i.color};flex-shrink:0;margin-top:4px"></div>
        <div style="font-size:11px;color:var(--text-muted);line-height:1.5">${i.text}</div>
      </div>`).join('')}
  </div>`;
}

/* ─────────────────────────────────────────
   COMPONENT: Readiness ring (SVG)
   Usage: ALP_readinessRing({ score, size, strokeColor })
───────────────────────────────────────── */
function ALP_readinessRing({ score=0, size=90, color='url(#ring-gradient)' }) {
  const r = (size - size*0.18) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const c = size / 2;
  return `
  <div style="position:relative;width:${size}px;height:${size}px;flex-shrink:0">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs><linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#10C47A"/>
        <stop offset="100%" stop-color="#4F87F6"/>
      </linearGradient></defs>
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${size*0.09}"/>
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${size*0.09}"
        stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
        transform="rotate(-90 ${c} ${c})"/>
    </svg>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <div style="font-size:${size*0.26}px;font-weight:800;background:linear-gradient(135deg,#10C47A,#4F87F6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1;font-variant-numeric:tabular-nums">${score}</div>
      <div style="font-size:${size*0.09}px;color:var(--text-faint);margin-top:1px;letter-spacing:.3px">READINESS</div>
    </div>
  </div>`;
}

/* ─────────────────────────────────────────
   COMPONENT: Score trajectory SVG chart
   Usage: ALP_trajectoryChart({ actual, predicted, target, width, height })
   actual/predicted: arrays of {x,y} 0-100 values mapped to viewBox
───────────────────────────────────────── */
function ALP_trajectoryChart({ width=320, height=120, todayScore=68, predictedScore=83 }) {
  return `
  <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" width="100%" height="100%">
    <defs>
      <linearGradient id="chart-ga" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#10C47A" stop-opacity=".2"/>
        <stop offset="100%" stop-color="#10C47A" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="chart-gb" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4F87F6" stop-opacity=".12"/>
        <stop offset="100%" stop-color="#4F87F6" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <line x1="0" y1="${height*0.15}" x2="${width}" y2="${height*0.15}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    <line x1="0" y1="${height*0.5}"  x2="${width}" y2="${height*0.5}"  stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    <line x1="0" y1="${height*0.85}" x2="${width}" y2="${height*0.85}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    <line x1="14" y1="${height*0.15}" x2="${width}" y2="${height*0.15}" stroke="#F5A623" stroke-width="1" stroke-dasharray="3,3" opacity=".4"/>
    <path d="M14,${height*.88} C55,${height*.8} 100,${height*.75} 150,${height*.65} C200,${height*.55} 230,${height*.52} ${width*0.78},${height*.42}"
      fill="none" stroke="#10C47A" stroke-width="2" stroke-linecap="round"/>
    <path d="M14,${height*.88} C55,${height*.8} 100,${height*.75} 150,${height*.65} C200,${height*.55} 230,${height*.52} ${width*0.78},${height*.42} L${width*0.78},${height} L14,${height}Z"
      fill="url(#chart-ga)"/>
    <circle cx="${width*0.78}" cy="${height*0.42}" r="4.5" fill="#10C47A" stroke="#07090F" stroke-width="2"/>
    <text x="${width*0.78}" y="${height*0.35}" fill="#10C47A" font-size="8" text-anchor="middle">${todayScore}</text>
    <path d="M${width*0.78},${height*0.42} C${width*0.87},${height*0.32} ${width*0.93},${height*0.22} ${width-4},${height*0.14}"
      fill="none" stroke="#4F87F6" stroke-width="1.8" stroke-dasharray="4,3" stroke-linecap="round"/>
    <path d="M${width*0.78},${height*0.42} C${width*0.87},${height*0.32} ${width*0.93},${height*0.22} ${width-4},${height*0.14} L${width-4},${height} L${width*0.78},${height}Z"
      fill="url(#chart-gb)"/>
    <circle cx="${width-4}" cy="${height*0.14}" r="4" fill="#4F87F6" stroke="#07090F" stroke-width="1.5"/>
    <text x="${width-8}" y="${height*0.09}" fill="#4F87F6" font-size="7.5" text-anchor="end">${predictedScore}</text>
    <text x="14" y="${height-2}" fill="#3E4D6A" font-size="7.5">Day 1</text>
    <text x="${width*0.78}" y="${height-2}" fill="#3E4D6A" font-size="7.5" text-anchor="middle">Today</text>
    <text x="${width-4}" y="${height-2}" fill="#4F87F6" font-size="7.5" text-anchor="end">Exam day</text>
  </svg>`;
}

/* ─────────────────────────────────────────
   COMPONENT: Topic Matrix Cell
   Usage: ALP_topicCell({ name, pct, strength, onClick })
───────────────────────────────────────── */
function ALP_topicCell({ name='', pct=0, strength='DEVELOPING', onClick='' }) {
  const clsMap = { STRONG:'tm-strong', DEVELOPING:'tm-dev', WEAK:'tm-weak', 'NOT STARTED':'tm-new' };
  const colMap = { STRONG:'#10C47A', DEVELOPING:'#4F87F6', WEAK:'#F43F5E', 'NOT STARTED':'#4A5570' };
  const cls = clsMap[strength] || 'tm-dev';
  const col = colMap[strength] || '#4F87F6';
  const lbl = strength === 'DEVELOPING' ? 'DEV.' : strength === 'NOT STARTED' ? 'NEW' : strength;
  return `
  <div class="tm-cell ${cls}" onclick="${onClick}">
    <div style="font-size:10px;font-weight:600;color:${col};margin-bottom:2px;line-height:1.3">${name}</div>
    <div style="font-size:15px;font-weight:800;color:${col};line-height:1;font-variant-numeric:tabular-nums">${pct > 0 ? pct+'%' : '—'}</div>
    <div style="font-size:7.5px;font-weight:700;color:${col};letter-spacing:.3px;margin-top:2px">${lbl}</div>
  </div>`;
}

/* ─────────────────────────────────────────
   COMPONENT: Decay warning strip
   Usage: ALP_decayWarn({ topics, onClick })
───────────────────────────────────────── */
function ALP_decayWarn({ topics = [], onClick = '' }) {
  return `
  <div onclick="${onClick}" style="
    background:rgba(244,63,94,0.05);border:1px solid rgba(244,63,94,0.18);
    border-radius:9px;padding:9px 12px;display:flex;gap:8px;align-items:center;cursor:pointer;margin-top:10px;">
    <span style="font-size:14px;flex-shrink:0">⚠️</span>
    <div style="flex:1;font-size:10.5px;color:var(--text-muted)">
      <strong style="color:var(--color-red)">Mastery decay:</strong> ${topics.join(' · ')}
    </div>
    <div class="btn btn-ai" style="font-size:9.5px;padding:4px 9px">Fix →</div>
  </div>`;
}

/* ─────────────────────────────────────────
   UTILITY: Navigation
───────────────────────────────────────── */
function ALP_navigate(screenId) {
  // Implement per-page routing
  console.log('[ALP] Navigate to:', screenId);
  const ev = new CustomEvent('alp:navigate', { detail: { screen: screenId } });
  window.dispatchEvent(ev);
}

/* ─────────────────────────────────────────
   UTILITY: Format numbers
───────────────────────────────────────── */
const ALP_fmt = {
  score: v => Number(v).toFixed(1),
  pct:   v => Math.round(v) + '%',
  pts:   v => (v >= 0 ? '+' : '') + Number(v).toFixed(1) + ' pts',
  theta: v => 'θ ' + Number(v).toFixed(2),
};

/* ─────────────────────────────────────────
   UTILITY: Strength from percentage
───────────────────────────────────────── */
function ALP_strength(pct) {
  if (pct === 0)   return 'NOT STARTED';
  if (pct < 40)    return 'WEAK';
  if (pct < 70)    return 'DEVELOPING';
  return 'STRONG';
}

function ALP_strengthColor(pct) {
  if (pct === 0)   return 'var(--text-faint)';
  if (pct < 40)    return 'var(--color-red)';
  if (pct < 70)    return 'var(--color-blue)';
  return 'var(--color-green)';
}

/* Export all */
window.ALP = {
  renderSidebar: ALP_renderSidebar,
  renderTopbar:  ALP_renderTopbar,
  recoCard:      ALP_recoCard,
  kpiTile:       ALP_kpiTile,
  subjectRow:    ALP_subjectRow,
  insightList:   ALP_insightList,
  readinessRing: ALP_readinessRing,
  trajectoryChart: ALP_trajectoryChart,
  topicCell:     ALP_topicCell,
  decayWarn:     ALP_decayWarn,
  navigate:      ALP_navigate,
  fmt:           ALP_fmt,
  strength:      ALP_strength,
  strengthColor: ALP_strengthColor,
};

console.log('[ALP] Components v1.0 loaded — ' + Object.keys(window.ALP).length + ' exports');
