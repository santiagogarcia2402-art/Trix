/* Patrimonio · lógica de la SPA (navegación, movimientos, métricas, Gemini, PWA) */
(() => {
  'use strict';

  /* ============================== Constantes ============================== */
  const KEYS = {
    txs: 'patrimonio.movimientos',
    settings: 'patrimonio.ajustes',
    apiKey: 'patrimonio.apiKey',
    summary: 'patrimonio.resumenSemanal',
    budgetMonthly: 'presupuesto_mensual'
  };
  const DAY = 86400000;

  const CATEGORIES = {
    antojos:    { label: 'Antojos',    icon: 'icecream' },
    comida:     { label: 'Comida',     icon: 'restaurant' },
    transporte: { label: 'Transporte', icon: 'directions_car' },
    fijos:      { label: 'Fijos',      icon: 'receipt_long' },
    extra:      { label: 'Extra',      icon: 'auto_awesome' }
  };
  const SOURCES = { debito: 'Efectivo / Débito', credito: 'Tarjeta Crédito' };
  const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const WEEKDAYS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  const DONUT_COLORS = ['url(#liquidCrimson2)', 'url(#liquidCrimson1)', '#520000', 'rgba(255,255,255,0.30)', 'rgba(255,255,255,0.16)'];
  const DONUT_LEN = 2 * Math.PI * 62;

  /* ============================== Utilidades ============================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const fmt = (n) => Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const money = (n) => `${n < 0 ? '-' : ''}$ ${fmt(n)}`;
  const signed = (n) => `${n < 0 ? '-' : '+'}$ ${fmt(n)}`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dayLabel = (d) => `${pad(d.getDate())} ${MONTHS[d.getMonth()]}`;
  const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { toast('No se pudo guardar en el dispositivo'); }
  }

  /* ================================ Estado ================================ */
  function loadMonthlyBudget() {
    const raw = localStorage.getItem('presupuesto_mensual');
    if (raw !== null && raw !== '') {
      const n = parseInt(String(raw).replace(/\D/g, ''), 10);
      if (n > 0) return n;
    }
    const prevSettings = load(KEYS.settings, null);
    if (prevSettings && prevSettings.budget && prevSettings.budget > 0) {
      const multiplied = prevSettings.budget * 4;
      localStorage.setItem('presupuesto_mensual', String(multiplied));
      return multiplied;
    }
    const fallback = 1200000;
    localStorage.setItem('presupuesto_mensual', String(fallback));
    return fallback;
  }

  let txs = load(KEYS.txs, []).filter((t) => t && t.amount > 0).map((t) => ({ ...t, ts: new Date(t.ts).getTime() }));
  let settings = Object.assign({ budget: loadMonthlyBudget(), sunday: true }, load(KEYS.settings, {}));
  settings.budget = loadMonthlyBudget();
  let summary = load(KEYS.summary, null);
  let state = { tab: 'boveda', period: 'week', filter: 'all', query: '' };
  let draft = { type: 'gasto', category: 'antojos', source: 'debito', cuotas: 1 };
  let generating = false;

  const persistTxs = () => save(KEYS.txs, txs.map((t) => ({ ...t, ts: new Date(t.ts).toISOString() })));
  const getApiKey = () => localStorage.getItem(KEYS.apiKey) || '';

  /* ============================ Cálculos financieros ============================ */
  // Solo efectivo/débito mueve el saldo de la bóveda; la tarjeta genera deuda.
  const cashEffect = (t) => (t.type === 'ingreso' ? t.amount : (t.source === 'debito' || t.origen === 'debito') ? -t.amount : 0);
  const balanceAt = (limitTs) => txs.reduce((s, t) => (t.ts < limitTs ? s + cashEffect(t) : s), 0);
  const sumExpenses = (list) => list.filter((t) => t.type === 'gasto').reduce((s, t) => s + t.amount, 0);
  const inRange = (from, to) => txs.filter((t) => t.ts >= from && t.ts < to);
  const tomorrowTs = () => startOfDay(new Date()).getTime() + DAY;

  function periodRange(period) {
    const now = new Date();
    if (period === 'month') {
      return {
        cur: [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()],
        prev: [new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), new Date(now.getFullYear(), now.getMonth(), 1).getTime()],
        days: now.getDate(), label: 'Mes'
      };
    }
    if (period === 'semester') {
      // S1: 1 ene – 30 jun · S2: 1 jul – 31 dic (límites semiabiertos: [inicio, inicio del siguiente))
      const y = now.getFullYear();
      const first = now.getMonth() < 6;
      const start = new Date(y, first ? 0 : 6, 1).getTime();
      return {
        cur: [start, new Date(y, first ? 6 : 12, 1).getTime()],
        prev: first
          ? [new Date(y - 1, 6, 1).getTime(), start]
          : [new Date(y, 0, 1).getTime(), start],
        days: Math.floor((startOfDay(now).getTime() - start) / DAY) + 1,
        label: 'Semestre'
      };
    }
    const end = tomorrowTs();
    return { cur: [end - 7 * DAY, end], prev: [end - 14 * DAY, end - 7 * DAY], days: 7, label: 'Semana' };
  }

  function categoryTotals(list) {
    const totals = {};
    Object.keys(CATEGORIES).forEach((k) => (totals[k] = 0));
    list.filter((t) => t.type === 'gasto').forEach((t) => { totals[t.category] = (totals[t.category] || 0) + t.amount; });
    return totals;
  }

  const last7 = () => { const end = tomorrowTs(); return inRange(end - 7 * DAY, end); };

  /* ============================== Navegación ============================== */
  function setTab(tab) {
    state.tab = tab;
    $$('.view').forEach((v) => { v.hidden = v.id !== `view-${tab}`; });
    $$('.nav-btn').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('#hdrTitle').textContent = $(`#view-${tab}`).dataset.title;
    window.scrollTo({ top: 0 });
    if (history.replaceState) history.replaceState(null, '', `#${tab}`);
    renderAll();
  }

  /* ================================ Render ================================ */
  function renderHeader() {
    const d = new Date();
    $('#hdrDate').textContent = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }

  function sparkPath(points) {
    let d = `M${points[0][0]},${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const mx = (x0 + x1) / 2;
      d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
    }
    return d;
  }

  function renderBoveda() {
    const end = tomorrowTs();
    const balance = balanceAt(end);
    const debt = txs.filter((t) => t.type === 'gasto' && (t.source === 'credito' || t.origen === 'credito')).reduce((s, t) => s + t.amount, 0);
    $('#balTotal').textContent = money(balance);
    $('#cardDebt').textContent = money(debt);

    // Variación semanal
    const base = balanceAt(end - 7 * DAY);
    const delta = balance - base;
    const pct = base > 0 ? (delta / base) * 100 : null;
    $('#balPct').textContent = pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    $('#balTrendIcon').textContent = delta < 0 ? 'trending_down' : 'trending_up';
    $('#balWeekDelta').textContent = `${delta < 0 ? '-' : '+'}$${fmt(delta)} COP`;

    // Sparkline: saldo al cierre de cada uno de los últimos 7 días
    const vals = Array.from({ length: 7 }, (_, i) => balanceAt(end - (6 - i) * DAY));
    const min = Math.min(...vals), max = Math.max(...vals);
    const pts = vals.map((v, i) => [(i * 320) / 6, max === min ? 20 : 34 - ((v - min) / (max - min)) * 28]);
    const line = sparkPath(pts);
    $('#sparkLine').setAttribute('d', line);
    $('#sparkArea').setAttribute('d', `${line} L320,40 L0,40 Z`);
    $('#sparkDot').setAttribute('cx', pts[6][0]);
    $('#sparkDot').setAttribute('cy', pts[6][1]);

    // Cápsulas
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    const monthTxs = inRange(monthStart, monthEnd);
    const monthIncome = monthTxs.filter((t) => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0);
    const monthExp = sumExpenses(monthTxs);
    $('#incMonth').textContent = money(monthIncome);
    $('#expWeek').textContent = money(monthExp);
    $('#expWeekPct').textContent = `COP · ${settings.budget > 0 ? Math.round((monthExp / settings.budget) * 100) : 0}% del tope mensual`;

    renderSummaryCard(monthExp);

    // Recientes
    const recent = [...txs].sort((a, b) => b.ts - a.ts).slice(0, 4);
    $('#recentList').innerHTML = recent.length
      ? recent.map((t, i) => compactRow(t) + (i < recent.length - 1 ? '<div class="hairline-divider mx-3"></div>' : '')).join('')
      : emptyState('Aún no hay movimientos', 'Registra tu primer gasto o ingreso.');
  }

  function renderSummaryCard(monthExp) {
    const cats = categoryTotals(last7());
    const ranked = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const weekExp = sumExpenses(last7());
    const topShare = weekExp > 0 ? Math.round((ranked[0][1] / weekExp) * 100) : 0;
    $('#pillTop').textContent = `${topShare}%`;
    $('#pillRest').textContent = `${weekExp > 0 ? 100 - topShare : 0}%`;

    const ratio = settings.budget > 0 ? monthExp / settings.budget : 0;
    $('#sumBadge').textContent = ratio <= 0.7 ? 'Ritmo Óptimo' : ratio <= 1 ? 'Atención' : 'Tope Superado';

    if (summary && summary.text) {
      $('#sumText').innerHTML = renderRichText(summary.text);
      const d = new Date(summary.ts);
      $('#sumMeta').textContent = `Generado por Gemini · ${sameDay(d, new Date()) ? 'hoy' : dayLabel(d).toLowerCase()} ${hhmm(d)}`;
    } else {
      $('#sumText').textContent = monthExp > 0
        ? `Llevas $ ${fmt(monthExp)} en gastos este mes (${Math.round(ratio * 100)}% de tu tope mensual). Lo que más pesa: ${CATEGORIES[ranked[0][0]].label}. Genera el balance con IA para un análisis completo.`
        : 'Sin gastos este mes. Registra movimientos y genera tu balance conversacional con Gemini.';
      $('#sumMeta').textContent = '';
    }
  }

  function renderMetricas() {
    $$('.period-btn').forEach((b) => {
      const on = b.dataset.period === state.period;
      b.className = `period-btn flex-1 py-2 rounded-full text-center font-body-sm text-body-sm transition-all ${on ? 'text-white glass-button-active font-semibold' : 'text-[#9CA3AF] hover:text-white font-medium'}`;
    });

    const r = periodRange(state.period);
    const cur = inRange(...r.cur), prev = inRange(...r.prev);
    const total = sumExpenses(cur), prevTotal = sumExpenses(prev);
    const cats = categoryTotals(cur);
    const ranked = Object.entries(cats).sort((a, b) => b[1] - a[1]);

    $('#mTotalLabel').textContent = `COP · Total ${r.label}`;
    $('#mTotal').textContent = `$ ${fmt(total)}`;
    $('#mTotal').style.fontSize = total >= 100000000 ? '24px' : total >= 10000000 ? '28px' : '32px';
    const monthRatio = settings.budget > 0 ? Math.round((total / settings.budget) * 100) : 0;
    if (state.period === 'month') {
      $('#mDelta').textContent = `${monthRatio}% del tope mensual`;
    } else {
      $('#mDelta').textContent = prevTotal > 0
        ? `${total >= prevTotal ? '+' : '-'}${Math.abs(((total - prevTotal) / prevTotal) * 100).toFixed(1)}% vs prev.`
        : 'Sin periodo previo';
    }
    $('#mAvg').textContent = `$ ${fmt(total / Math.max(1, r.days))}`;
    $('#mTop').textContent = total > 0 ? `${CATEGORIES[ranked[0][0]].label} (${Math.round((ranked[0][1] / total) * 100)}%)` : '—';

    // Dona
    const g = $('#donutSegs');
    g.innerHTML = '';
    if (total > 0) {
      const active = ranked.filter(([, v]) => v > 0);
      let cum = 0;
      active.forEach(([cat, v], i) => {
        const len = (v / total) * DONUT_LEN;
        const gap = active.length > 1 ? Math.min(4, len * 0.4) : 0;
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', 80); c.setAttribute('cy', 80); c.setAttribute('r', 62); c.setAttribute('fill', 'none');
        c.setAttribute('stroke', DONUT_COLORS[i] || DONUT_COLORS[4]);
        c.setAttribute('stroke-width', i === 0 ? 15 : 13);
        c.setAttribute('stroke-dasharray', `${Math.max(0.5, len - gap)} ${DONUT_LEN}`);
        c.setAttribute('stroke-dashoffset', -cum);
        if (i === 0) c.setAttribute('filter', 'url(#softGlow)');
        c.dataset.cat = cat;
        g.appendChild(c);
        cum += len;
      });
    }

    // Tarjetas de categoría
    const order = Object.keys(CATEGORIES);
    $('#catGrid').innerHTML = order.map((cat, idx) => {
      const v = cats[cat];
      const share = total > 0 ? Math.round((v / total) * 100) : 0;
      const isTop = total > 0 && ranked[0][0] === cat;
      const span = order.length % 2 === 1 && idx === order.length - 1 ? ' col-span-2' : '';
      return `
        <div class="glass-surface rounded-[22px] p-4 flex flex-col justify-between h-[132px] relative hover:border-[#880000]/50 transition-all duration-200${span}">
          <div class="flex items-center justify-between">
            <div class="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-white">
              <span class="material-symbols-outlined text-[19px]">${CATEGORIES[cat].icon}</span>
            </div>
            <span class="num-figures px-2 py-0.5 rounded-full ${isTop ? 'bg-[#720000]/60 border-[#880000]/40' : 'bg-white/[0.05] border-white/10'} border text-[11px] text-white font-semibold">${share}%</span>
          </div>
          <div>
            <span class="text-[13px] text-[#9CA3AF] block mb-0.5">${CATEGORIES[cat].label}</span>
            <span class="num-figures text-[17px] text-white tracking-tight font-semibold block">COP $${fmt(v)}</span>
          </div>
        </div>`;
    }).join('');

    // Análisis local
    if (total > 0) {
      const top = ranked[0];
      const share = Math.round((top[1] / total) * 100);
      $('#aiAnalysis').innerHTML = `El <strong class="num-figures text-white font-bold">${share}% de tus gastos</strong> fue en ${CATEGORIES[top[0]].label.toLowerCase()}. ${share >= 50 ? 'Intenta priorizar lo esencial para conservar liquidez en tu bóveda.' : 'Tu gasto está bien repartido; mantén el ritmo.'}`;
      $('#aiGoal').textContent = `-$${fmt(top[1] * 0.2)} COP`;
    } else {
      $('#aiAnalysis').textContent = 'Aún no hay gastos en este periodo. Cuando registres movimientos verás aquí el análisis.';
      $('#aiGoal').textContent = '—';
    }
  }

  function renderMovimientos() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthTxs = inRange(monthStart, new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime());
    const monthExp = sumExpenses(monthTxs);
    const monthBudget = settings.budget;
    const ratio = monthBudget > 0 ? monthExp / monthBudget : 0;
    $('#hCount').textContent = `${monthTxs.length} movimiento${monthTxs.length === 1 ? '' : 's'}`;
    $('#hTotal').textContent = monthExp > 0 ? `-$ ${fmt(monthExp)}` : '$ 0';
    $('#hBudgetMsg').textContent = ratio < 0.75 ? 'Presupuesto en rango seguro' : ratio <= 1 ? 'Cerca del límite mensual' : 'Presupuesto superado';
    $('#hBudgetPct').textContent = `${Math.round(ratio * 100)}% del tope mensual`;

    // Chips de filtro
    $$('.fchip').forEach((c) => {
      const on = c.dataset.filter === state.filter;
      c.className = `fchip h-8 ${on ? 'px-4 bg-[#720000] border border-[#880000] text-white shadow-[0_0_12px_rgba(114,0,0,0.55)]' : 'px-3.5 glass-panel border border-white/10 text-[#9CA3AF] hover:text-white'} rounded-full text-caption font-caption font-medium shrink-0 transition-all active:scale-95`;
    });

    // Filtrado
    const q = state.query.trim().toLowerCase();
    const f = state.filter;
    let list = [...txs].sort((a, b) => b.ts - a.ts).filter((t) => {
      if (f === 'gasto' || f === 'ingreso') { if (t.type !== f) return false; }
      else if (f === 'credito' || f === 'debito') { if ((t.source !== f && t.origen !== f) || t.type !== 'gasto') return false; }
      else if (f !== 'all' && t.category !== f) return false;
      if (q) {
        const hay = `${t.note} ${CATEGORIES[t.category].label} ${SOURCES[t.source]} ${t.amount} ${fmt(t.amount)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (!list.length) {
      $('#txList').innerHTML = emptyState(txs.length ? 'Sin resultados' : 'Aún no hay movimientos', txs.length ? 'Prueba con otro filtro o búsqueda.' : 'Toca "+ Nueva transacción" para empezar.');
      return;
    }

    const groups = [];
    list.forEach((t) => {
      const key = startOfDay(new Date(t.ts)).getTime();
      let g = groups.find((x) => x.key === key);
      if (!g) { g = { key, items: [] }; groups.push(g); }
      g.items.push(t);
    });

    const today = startOfDay(now).getTime();
    $('#txList').innerHTML = groups.map((g) => {
      const d = new Date(g.key);
      const title = g.key === today ? `HOY — ${dayLabel(d)}` : g.key === today - DAY ? `AYER — ${dayLabel(d)}` : `${WEEKDAYS[d.getDay()].slice(0, 3)} — ${dayLabel(d)}`;
      const net = g.items.reduce((s, t) => s + (t.type === 'ingreso' ? t.amount : -t.amount), 0);
      return `
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between px-1">
            <span class="text-metric-label font-metric-label text-[#9CA3AF] tracking-wider text-[11px] font-semibold">${title}</span>
            <span class="num-lining text-caption font-caption text-[#71717A] text-[10px]">${g.items.length} op. · ${net < 0 ? '-' : '+'}$ ${fmt(net)}</span>
          </div>
          <div class="flex flex-col gap-2">${g.items.map(fullRow).join('')}</div>
        </div>`;
    }).join('');
  }

  function renderAjustes() {
    const key = getApiKey();
    $('#apiKeyInput').value = key;
    $('#aiStatus').textContent = key ? 'Motor Activo' : 'Sin clave';
    $('#sundayToggle').checked = !!settings.sunday;
    $('#budgetLabel').textContent = `$ ${fmt(settings.budget)} COP`;
    $('#storageInfo').textContent = `${txs.length} movimiento${txs.length === 1 ? '' : 's'}`;
    $('#accCash').textContent = `Saldo ${money(balanceAt(tomorrowTs()))}`;
    $('#accCard').textContent = `Por pagar ${money(txs.filter((t) => t.type === 'gasto' && (t.source === 'credito' || t.origen === 'credito')).reduce((s, t) => s + t.amount, 0))}`;
  }

  function renderAll() {
    renderHeader();
    if (state.tab === 'boveda') renderBoveda();
    if (state.tab === 'metricas') renderMetricas();
    if (state.tab === 'movimientos') renderMovimientos();
    if (state.tab === 'ajustes') renderAjustes();
  }

  /* ----------------------------- Plantillas de fila ----------------------------- */
  function emptyState(title, text) {
    return `<div class="glass-surface rounded-[24px] p-6 flex flex-col items-center text-center gap-1.5">
      <span class="material-symbols-outlined text-[28px] text-[#71717A]">inbox</span>
      <span class="text-sm text-white font-semibold">${title}</span>
      <span class="text-[11px] text-[#9CA3AF]">${text}</span></div>`;
  }

  // Color y signo del monto (inline + !important para que ninguna clase lo sobreescriba)
  const amountStyle = (t) => {
    const colorMonto = t.type === 'ingreso' ? '#10B981' : '#EF4444';
    const signo = t.type === 'ingreso' ? '+' : '-';
    return { signo, style: `color: ${colorMonto} !important;` };
  };

  const sourceLabel = (t) => {
    if (t.type === 'ingreso') return 'Bóveda';
    if (t.source === 'credito') {
      const cuotas = t.cuotas || 1;
      if (cuotas > 1) {
        const vCuota = t.valorCuota || Math.round(t.amount / cuotas);
        return `💳 Crédito · ${cuotas} cuotas ($${fmt(vCuota)}/mes)`;
      }
      return '💳 Tarjeta Crédito';
    }
    return 'Efectivo / Débito';
  };

  function compactRow(t) {
    const { signo, style } = amountStyle(t);
    const d = new Date(t.ts);
    const when = sameDay(d, new Date()) ? `Hoy ${hhmm(d)}` : sameDay(d, new Date(Date.now() - DAY)) ? `Ayer ${hhmm(d)}` : dayLabel(d);
    return `
      <div class="flex items-center justify-between p-3 rounded-[18px] hover:bg-white/[0.03] active:scale-[0.99] transition-all duration-150" data-id="${t.id}">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white shrink-0">
            <span class="material-symbols-outlined text-[20px] text-white">${CATEGORIES[t.category].icon}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-sm text-white font-semibold truncate">${esc(t.note)}</span>
            <span class="text-[10px] text-[#9CA3AF] tracking-wider font-medium truncate">${CATEGORIES[t.category].label} · ${sourceLabel(t)}</span>
          </div>
        </div>
        <div class="flex flex-col items-end shrink-0 pl-2">
          <span class="text-[15px] font-bold tracking-tight font-numbers" style="${style}">${signo}$ ${fmt(t.amount)}</span>
          <span class="text-[10px] text-[#9CA3AF] font-numbers">COP · ${when}</span>
        </div>
      </div>`;
  }

  function fullRow(t) {
    const { signo, style } = amountStyle(t);
    const d = new Date(t.ts);
    return `
      <button type="button" data-id="${t.id}" class="tx-row w-full text-left glass-panel border border-white/[0.09] hover:border-white/20 rounded-[20px] p-3.5 flex items-center justify-between transition-all duration-200 active:scale-[0.99]">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-11 h-11 rounded-full glass-panel border border-white/15 flex items-center justify-center shrink-0 shadow-sm">
            <span class="material-symbols-outlined text-[20px] ${t.type === 'ingreso' ? 'text-white' : 'text-primary'}">${CATEGORIES[t.category].icon}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <h3 class="text-body-sm font-body-sm text-white font-medium leading-tight truncate">${esc(t.note)}</h3>
            <div class="flex items-center gap-2 mt-1">
              <span class="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-caption font-caption text-[#9CA3AF] truncate">${CATEGORIES[t.category].label} · ${sourceLabel(t)}</span>
              <span class="num-lining text-caption font-caption text-[#71717A]">${hhmm(d)}</span>
            </div>
          </div>
        </div>
        <div class="text-right shrink-0 pl-2">
          <p class="num-lining text-[17px] font-bold tracking-tight leading-none" style="${style}">${signo}$ ${fmt(t.amount)}</p>
          <p class="text-caption font-caption text-[#71717A] text-[10px] mt-1">COP</p>
        </div>
      </button>`;
  }

  // Convierte **negrita** de Gemini en <strong>, escapando antes el HTML.
  function renderRichText(text) {
    return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong class="num-figures text-white font-bold">$1</strong>').replace(/\n+/g, '<br>');
  }

  /* ====================== Diálogo de confirmación Liquid Glass ====================== */
  let confirmResolve = null;
  function confirmDialog({ title, detail = '', amount = '', amountClass = '', okLabel = 'Eliminar' }) {
    if (confirmResolve) confirmResolve(false);
    $('#confirmTitle').textContent = title;
    $('#confirmDetail').textContent = detail;
    const a = $('#confirmAmount');
    a.textContent = amount;
    a.className = `num-figures text-lg font-bold mt-1 ${amountClass}`;
    a.hidden = !amount;
    $('#confirmDetail').hidden = !detail;
    $('#confirmOk').textContent = okLabel;
    document.body.classList.add('confirm-open');
    setTimeout(() => $('#confirmCancel').focus(), 50);
    return new Promise((resolve) => { confirmResolve = resolve; });
  }
  function closeConfirm(result) {
    document.body.classList.remove('confirm-open');
    const r = confirmResolve; confirmResolve = null;
    if (r) r(result);
  }

  /* ====================== Modal Presupuesto Mensual ====================== */
  const budgetInputEl = $('#budgetInput');
  const parseBudgetValue = () => parseInt((budgetInputEl?.value || '').replace(/\D/g, ''), 10) || 0;
  const setBudgetInputValue = (n) => { if (budgetInputEl) budgetInputEl.value = n > 0 ? `$ ${fmt(n)}` : ''; };

  function openBudgetModal() {
    setBudgetInputValue(loadMonthlyBudget());
    document.body.classList.add('budget-open');
    setTimeout(() => {
      if (budgetInputEl) {
        budgetInputEl.focus();
        budgetInputEl.select();
      }
    }, 150);
  }

  function closeBudgetModal() {
    document.body.classList.remove('budget-open');
    if (document.activeElement === budgetInputEl) budgetInputEl.blur();
  }

  function saveBudget() {
    const val = parseBudgetValue();
    if (val <= 0) {
      toast('Ingresa un presupuesto válido');
      budgetInputEl?.focus();
      return;
    }
    settings.budget = val;
    localStorage.setItem('presupuesto_mensual', String(val));
    save(KEYS.settings, settings);
    closeBudgetModal();
    renderAll();
    toast('Presupuesto mensual actualizado');
  }

  /* ================================= Toast ================================= */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  /* ============================ Modal Nuevo Movimiento ============================ */
  const amountEl = $('#amountInput');
  const noteEl = $('#noteInput');
  const parseAmount = () => parseInt(amountEl.value.replace(/\D/g, ''), 10) || 0;
  const setAmount = (n) => { amountEl.value = n > 0 ? `$ ${fmt(n)}` : ''; };

  function updateInstallmentsUI() {
    const isCredito = draft.type === 'gasto' && draft.source === 'credito';
    const block = $('#installmentsBlock');
    if (!block) return;
    block.hidden = !isCredito;
    if (!isCredito) return;

    const cuotas = draft.cuotas || 1;
    $$('.cuota-chip').forEach((c) => {
      const on = Number(c.dataset.cuotas) === cuotas;
      c.className = `cuota-chip flex-shrink-0 px-3.5 py-1.5 rounded-full border text-xs transition-all active:scale-95 ${on ? 'chip-on font-semibold' : 'border-white/10 bg-white/[0.04] font-medium text-[#9CA3AF] hover:text-white'}`;
    });

    const amount = parseAmount();
    const detailEl = $('#installmentDetailText');
    if (detailEl) {
      if (cuotas > 1 && amount > 0) {
        const valCuota = Math.round(amount / cuotas);
        detailEl.textContent = `Valor por cuota: $ ${fmt(valCuota)} COP / mes`;
      } else if (cuotas > 1) {
        detailEl.textContent = `${cuotas} cuotas mensuales`;
      } else {
        detailEl.textContent = '1 cuota (pago directo)';
      }
    }

    const now = new Date();
    const diaCompra = now.getDate();
    // Ciclo de facturación:
    // Corte: 15 de cada mes. Límite de pago: 3 del mes siguiente.
    // Si compra <= 15: entra al corte de este mes, pago el 3 del mes siguiente.
    // Si compra > 15: entra al corte del mes siguiente.
    const mesCorteIdx = diaCompra <= 15 ? now.getMonth() : (now.getMonth() + 1) % 12;
    const mesPagoIdx = (mesCorteIdx + 1) % 12;
    const billingEl = $('#installmentBillingInfo');
    if (billingEl) {
      billingEl.textContent = `Corte 15 de ${MONTHS[mesCorteIdx]} · Primer pago: 3 de ${MONTHS[mesPagoIdx]}`;
    }
  }

  function paintSheet() {
    $$('.type-btn').forEach((b) => {
      const on = b.dataset.type === draft.type;
      b.classList.toggle('seg-on', on);
      b.classList.toggle('text-[#9CA3AF]', !on);
    });
    $('#catChips').innerHTML = Object.entries(CATEGORIES).map(([k, c]) => `
      <button type="button" data-cat="${k}" class="cat-chip flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white/90 active:scale-95 transition-all ${draft.category === k ? 'chip-on' : ''}">
        <span class="material-symbols-outlined text-[16px] ${draft.category === k ? '' : 'text-[#9CA3AF]'}">${c.icon}</span>
        <span class="text-xs ${draft.category === k ? 'font-semibold' : 'font-medium text-[#9CA3AF]'}">${c.label}</span>
      </button>`).join('');
    $$('.src-btn').forEach((b) => {
      const on = b.dataset.source === draft.source;
      b.className = `src-btn flex items-center gap-2 p-2.5 rounded-2xl border text-left transition-all active:scale-[0.98] ${on ? 'chip-on' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07] text-[#9CA3AF]'}`;
    });
    $('#sourceBlock').hidden = draft.type === 'ingreso';
    updateInstallmentsUI();
  }

  function openSheet() {
    draft = { type: 'gasto', category: 'antojos', source: 'debito', cuotas: 1 };
    setAmount(0);
    noteEl.value = '';
    paintSheet();
    document.body.classList.add('sheet-open');
    $('#sheet').style.transform = '';
    setTimeout(() => amountEl.focus({ preventScroll: true }), 350);
  }
  function closeSheet() {
    document.body.classList.remove('sheet-open');
    $('#sheet').style.transform = '';
    document.activeElement && document.activeElement.blur();
  }

  function submitTx(e) {
    e.preventDefault();
    const amount = parseAmount();
    if (amount <= 0) {
      amountEl.classList.remove('shake'); void amountEl.offsetWidth; amountEl.classList.add('shake');
      amountEl.focus();
      toast('Ingresa un monto mayor a 0');
      return;
    }
    const isCredito = draft.type === 'gasto' && draft.source === 'credito';
    const cuotas = isCredito ? (draft.cuotas || 1) : 1;
    const tx = {
      id: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: draft.type,
      amount,
      note: noteEl.value.trim() || CATEGORIES[draft.category].label,
      category: draft.category,
      source: draft.type === 'ingreso' ? 'debito' : draft.source,
      origen: draft.type === 'ingreso' ? 'debito' : draft.source,
      ...(isCredito ? {
        cuotas,
        valorCuota: Math.round(amount / cuotas),
        diaCorte: 15,
        diaPago: 3
      } : {}),
      ts: Date.now()
    };
    txs.push(tx);
    persistTxs();
    closeSheet();
    renderAll();
    toast(`${tx.type === 'gasto' ? 'Gasto' : 'Ingreso'} de $ ${fmt(amount)} guardado`);
    if (navigator.vibrate) navigator.vibrate(12);
  }

  /* ============================== Gemini (resumen) ============================== */
  function buildResumenGastosTexto() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    const monthTxs = inRange(monthStart, monthEnd);
    const monthGastos = sumExpenses(monthTxs);
    const monthIngresos = monthTxs.filter((t) => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0);

    const list = last7().sort((a, b) => a.ts - b.ts);
    const gastosSemana = sumExpenses(list);
    const cats = categoryTotals(monthTxs);
    const catLines = Object.entries(cats).filter(([, v]) => v > 0).map(([k, v]) => `${CATEGORIES[k].label}: $${fmt(v)}`).join(', ') || 'sin gastos';
    const lines = list.map((t) => `${t.type === 'ingreso' ? '+' : '-'}$${fmt(t.amount)} en ${CATEGORIES[t.category].label} ("${t.note}")`).join(', ');

    const presupuestoMensual = settings.budget;
    const disponibleMes = Math.max(0, presupuestoMensual - monthGastos);
    const pctEjecutado = presupuestoMensual > 0 ? Math.round((monthGastos / presupuestoMensual) * 100) : 0;

    return `Presupuesto mensual: $${fmt(presupuestoMensual)} COP. Gastos acumulados del mes: $${fmt(monthGastos)} COP (${pctEjecutado}% del tope mensual, disponible: $${fmt(disponibleMes)} COP). Ingresos del mes: $${fmt(monthIngresos)} COP. Gastos de los últimos 7 días: $${fmt(gastosSemana)} COP. Categorías del mes: ${catLines}. Movimientos recientes: ${lines}.`;
  }

  async function generarBalanceConGemini(apiKey, promptTexto) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: promptTexto }]
        }]
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[Gemini API Error]', { status: res.status, data });
      throw new Error(data.error?.message || `Error en Gemini API (${res.status})`);
    }

    const respuestaTexto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!respuestaTexto) {
      console.error('[Gemini API Sin Texto]', data);
      throw new Error('Gemini no devolvió texto en candidates[0].content.parts[0].text');
    }

    return respuestaTexto;
  }

  function setGenerating(on) {
    generating = on;
    $('#btnGenerate').disabled = on;
    $('#btnGenerateIcon').classList.toggle('spin', on);
    $('#btnGenerateLabel').textContent = on ? 'Generando balance…' : 'Generar Balance Manual';
    $('#btnExploreIcon').textContent = on ? 'sync' : 'arrow_forward';
    $('#btnExploreIcon').classList.toggle('spin', on);
    $('#btnExploreLabel').textContent = on ? 'Generando…' : 'Actualizar balance';
  }

  async function generateBalance({ silent = false } = {}) {
    if (generating) return;
    const key = getApiKey();
    if (!key) {
      if (!silent) { toast('Primero guarda tu API Key de Google AI Studio'); setTab('ajustes'); setTimeout(() => $('#apiKeyInput').focus(), 100); }
      return;
    }
    if (!last7().length) {
      if (!silent) toast('No hay movimientos en los últimos 7 días');
      return;
    }
    setGenerating(true);
    try {
      const promptTexto = `Eres un asesor financiero personal directo y amigable. Analiza el ritmo de gasto del usuario frente a su presupuesto mensual disponible en Colombia y dame un diagnóstico y consejo en máximo 2 frases cortas: ${buildResumenGastosTexto()}`;
      const text = await generarBalanceConGemini(key, promptTexto);
      summary = { text, ts: new Date().toISOString() };
      save(KEYS.summary, summary);
      renderAll();
      if (!silent) { toast('Balance semanal generado'); if (state.tab === 'ajustes') setTab('boveda'); }
    } catch (err) {
      console.error('[Gemini]', err);
      if (!silent) toast(`Gemini: ${err.message}`.slice(0, 140));
    } finally {
      setGenerating(false);
    }
  }

  function maybeAutoSundaySummary() {
    const now = new Date();
    if (now.getDay() !== 0 || !settings.sunday || !getApiKey()) return;
    if (summary && sameDay(new Date(summary.ts), now)) return;
    generateBalance({ silent: true });
  }

  /* ============================ Datos y respaldo ============================ */
  function exportData() {
    const blob = new Blob([JSON.stringify({ app: 'patrimonio', version: 1, exportedAt: new Date().toISOString(), settings, movimientos: txs.map((t) => ({ ...t, ts: new Date(t.ts).toISOString() })) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `patrimonio-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Copia de seguridad exportada');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        const arr = Array.isArray(data) ? data : data.movimientos;
        if (!Array.isArray(arr)) throw new Error('formato');
        const clean = arr.filter((t) => t && t.amount > 0 && ['gasto', 'ingreso'].includes(t.type) && CATEGORIES[t.category] && !isNaN(new Date(t.ts)))
          .map((t) => {
            const isCred = t.source === 'credito' || t.origen === 'credito';
            const cuotas = isCred ? (t.cuotas || 1) : 1;
            return {
              id: t.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              type: t.type,
              amount: Math.round(t.amount),
              note: String(t.note || CATEGORIES[t.category].label).slice(0, 60),
              category: t.category,
              source: isCred ? 'credito' : 'debito',
              origen: isCred ? 'credito' : 'debito',
              ...(isCred ? {
                cuotas,
                valorCuota: t.valorCuota || Math.round(t.amount / cuotas),
                diaCorte: t.diaCorte || 15,
                diaPago: t.diaPago || 3
              } : {}),
              ts: new Date(t.ts).getTime()
            };
          });
        if (!(await confirmDialog({ title: '¿Importar datos?', detail: `Se reemplazarán tus movimientos actuales por ${clean.length} del archivo.`, okLabel: 'Importar' }))) return;
        txs = clean; persistTxs();
        const importedBudget = (data.presupuesto_mensual && data.presupuesto_mensual > 0) ? data.presupuesto_mensual : (data.settings && data.settings.budget > 0) ? data.settings.budget : 0;
        if (importedBudget > 0) {
          settings.budget = importedBudget;
          localStorage.setItem('presupuesto_mensual', String(importedBudget));
          save(KEYS.settings, settings);
        }
        renderAll(); toast(`${clean.length} movimientos importados`);
      } catch { toast('Archivo no válido'); }
    };
    reader.readAsText(file);
  }

  /* ================================ Eventos ================================ */
  function bind() {
    $$('.nav-btn').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $$('#btnNewMovement, #btnNewTx, #btnHeaderAdd').forEach((b) => b.addEventListener('click', openSheet));
    $('#btnSeeAll').addEventListener('click', () => setTab('movimientos'));
    $('#btnExplore').addEventListener('click', () => generateBalance());
    $('#btnGenerate').addEventListener('click', () => generateBalance());

    $$('.period-btn').forEach((b) => b.addEventListener('click', () => { state.period = b.dataset.period; renderMetricas(); }));
    $$('.fchip').forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.filter; renderMovimientos(); }));
    $('#searchInput').addEventListener('input', (e) => { state.query = e.target.value; renderMovimientos(); });

    const txClick = async (e) => {
      const row = e.target.closest('[data-id]');
      if (!row) return;
      const t = txs.find((x) => x.id === row.dataset.id);
      if (!t) return;
      const ok = await confirmDialog({
        title: '¿Eliminar movimiento?',
        detail: t.note,
        amount: `${t.type === 'gasto' ? '-' : '+'}$ ${fmt(t.amount)} COP`,
        amountClass: t.type === 'ingreso' ? 'text-[#34D399]' : 'text-[#ff9a8a]'
      });
      if (!ok) return;
      txs = txs.filter((x) => x.id !== t.id); persistTxs(); renderAll(); toast('Movimiento eliminado');
    };
    $('#txList').addEventListener('click', txClick);
    $('#recentList').addEventListener('click', txClick);

    // Modal
    $('#btnCloseSheet').addEventListener('click', closeSheet);
    $('#btnCancelSheet').addEventListener('click', closeSheet);
    $('#sheetScrim').addEventListener('click', closeSheet);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.body.classList.contains('budget-open')) closeBudgetModal();
        else if (confirmResolve) closeConfirm(false);
        else closeSheet();
      }
    });
    $('#confirmOk').addEventListener('click', () => closeConfirm(true));
    $('#confirmCancel').addEventListener('click', () => closeConfirm(false));
    $('#confirmScrim').addEventListener('click', () => closeConfirm(false));
    $('#txForm').addEventListener('submit', submitTx);
    $$('.type-btn').forEach((b) => b.addEventListener('click', () => {
      draft.type = b.dataset.type;
      if (draft.type === 'ingreso' && draft.category !== 'extra') draft.category = 'extra';
      if (draft.type === 'gasto' && draft.category === 'extra') draft.category = 'antojos';
      paintSheet();
    }));
    $('#catChips').addEventListener('click', (e) => { const c = e.target.closest('[data-cat]'); if (c) { draft.category = c.dataset.cat; paintSheet(); } });
    $$('.src-btn').forEach((b) => b.addEventListener('click', () => { draft.source = b.dataset.source; paintSheet(); }));
    $('#installmentChips')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.cuota-chip');
      if (!btn) return;
      draft.cuotas = parseInt(btn.dataset.cuotas, 10) || 1;
      updateInstallmentsUI();
    });
    $$('[data-add]').forEach((b) => b.addEventListener('click', () => {
      setAmount(parseAmount() + Number(b.dataset.add));
      updateInstallmentsUI();
    }));
    $('#btnClearAmount').addEventListener('click', () => {
      setAmount(0);
      updateInstallmentsUI();
      amountEl.focus();
    });
    amountEl.addEventListener('input', () => {
      const n = Math.min(parseAmount(), 999999999999);
      setAmount(n);
      updateInstallmentsUI();
    });

    // Arrastrar la manija para cerrar el bottom sheet
    const handle = $('#sheetHandle');
    let startY = null;
    handle.addEventListener('pointerdown', (e) => { startY = e.clientY; handle.setPointerCapture(e.pointerId); $('#sheet').style.transition = 'none'; });
    handle.addEventListener('pointermove', (e) => { if (startY !== null) $('#sheet').style.transform = `translateY(${Math.max(0, e.clientY - startY)}px)`; });
    const endDrag = (e) => {
      if (startY === null) return;
      const dy = e.clientY - startY; startY = null;
      $('#sheet').style.transition = '';
      if (dy > 110) closeSheet(); else $('#sheet').style.transform = '';
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);

    // Ajustes
    $('#btnSaveKey').addEventListener('click', () => {
      const v = $('#apiKeyInput').value.trim();
      if (v) localStorage.setItem(KEYS.apiKey, v); else localStorage.removeItem(KEYS.apiKey);
      renderAjustes();
      toast(v ? 'API Key guardada' : 'API Key eliminada');
      if (v) maybeAutoSundaySummary();
    });
    $('#btnToggleKey').addEventListener('click', () => {
      const i = $('#apiKeyInput');
      const show = i.type === 'password';
      i.type = show ? 'text' : 'password';
      $('#btnToggleKey .material-symbols-outlined').textContent = show ? 'visibility_off' : 'visibility';
    });
    $('#sundayToggle').addEventListener('change', (e) => { settings.sunday = e.target.checked; save(KEYS.settings, settings); });

    // Presupuesto Mensual Modal Liquid Glass
    $('#btnBudget').addEventListener('click', openBudgetModal);
    $('#btnCancelBudget')?.addEventListener('click', closeBudgetModal);
    $('#budgetModalScrim')?.addEventListener('click', closeBudgetModal);
    $('#btnSaveBudget')?.addEventListener('click', saveBudget);
    budgetInputEl?.addEventListener('input', () => {
      const n = Math.min(parseBudgetValue(), 999999999999);
      setBudgetInputValue(n);
    });
    budgetInputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveBudget();
      }
    });
    $('#btnExport').addEventListener('click', exportData);
    $('#btnImport').addEventListener('click', () => $('#fileImport').click());
    $('#fileImport').addEventListener('change', (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
    $('#btnReset').addEventListener('click', async () => {
      if (!(await confirmDialog({ title: '¿Restablecer bóveda?', detail: 'Se borrarán TODOS tus movimientos y el resumen guardado. Esta acción es irreversible.', okLabel: 'Borrar todo' }))) return;
      txs = []; summary = null;
      localStorage.removeItem(KEYS.txs); localStorage.removeItem(KEYS.summary);
      renderAll(); toast('Bóveda restablecida');
    });

    // Sincronizar entre pestañas y al volver a la app
    window.addEventListener('storage', (e) => {
      if (e.key === KEYS.txs) { txs = load(KEYS.txs, []).map((t) => ({ ...t, ts: new Date(t.ts).getTime() })); renderAll(); }
      if (e.key === 'presupuesto_mensual' || e.key === KEYS.settings) {
        settings.budget = loadMonthlyBudget();
        renderAll();
      }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderAll(); maybeAutoSundaySummary(); } });
    window.addEventListener('hashchange', () => {
      const tab = location.hash.slice(1);
      if (['boveda', 'metricas', 'movimientos', 'ajustes'].includes(tab) && tab !== state.tab) setTab(tab);
    });
  }

  /* ================================== Init ================================== */
  bind();
  const initial = location.hash.slice(1);
  setTab(['boveda', 'metricas', 'movimientos', 'ajustes'].includes(initial) ? initial : 'boveda');
  maybeAutoSundaySummary();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW:', e)));
  }
})();
