/* Trix · Centro de Control Patrimonial Proactivo con Liquid Glass, Chart.js y Gemini 3.8 Flash */
(() => {
  'use strict';

  /* ============================== Constantes y Config ============================== */
  const KEYS = {
    txs: 'patrimonio.movimientos',
    legacyTxs: 'movimientos',
    settings: 'patrimonio.ajustes',
    apiKey: 'patrimonio.apiKey',
    geminiKey: 'gemini_api_key',
    summary: 'patrimonio.resumenSemanal',
    budgetMonthly: 'presupuesto_mensual',
    ingresosFijos: 'ingresos_fijos',
    gastosFijos: 'gastos_fijos',
    metasAhorro: 'metas_ahorro'
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

  // Paleta oscura Liquid Glass
  const CHART_PALETTE = {
    carmesi: '#720000',
    esmeralda: '#10B981',
    violeta: '#8B5CF6',
    pizarra: '#334155',
    ambar: '#F59E0B'
  };

  /* ============================== Utilidades ============================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const parseNum = (v) => parseInt(String(v || '').replace(/\D/g, ''), 10) || 0;
  const fmt = (n) => Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const money = (n) => `${n < 0 ? '-' : ''}$ ${fmt(n)}`;
  const signed = (n) => `${n < 0 ? '-' : '+'}$ ${fmt(n)}`;
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { toast('No se pudo guardar en el almacenamiento local'); }
  }

  /* ==================== CRÍTICO: PERSISTENCIA SEGURA DE DATOS ==================== */
  function loadInitialTxs() {
    try {
      const rawLegacy = localStorage.getItem('movimientos');
      if (rawLegacy) {
        const parsed = JSON.parse(rawLegacy);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    try {
      const rawPat = localStorage.getItem('patrimonio.movimientos');
      if (rawPat) {
        const parsed = JSON.parse(rawPat);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  }

  let txs = loadInitialTxs().filter((t) => t && t.amount > 0).map((t) => ({ ...t, ts: new Date(t.ts).getTime() }));

  // Fallbacks seguros sin tocar lo que el usuario ya registró
  let ingresos_fijos = JSON.parse(localStorage.getItem('ingresos_fijos')) || [];
  let gastos_fijos = JSON.parse(localStorage.getItem('gastos_fijos')) || [];
  let metas_ahorro = JSON.parse(localStorage.getItem('metas_ahorro')) || [];

  function saveIngresosFijos() {
    localStorage.setItem('ingresos_fijos', JSON.stringify(ingresos_fijos));
  }
  function saveGastosFijos() {
    localStorage.setItem('gastos_fijos', JSON.stringify(gastos_fijos));
  }
  function saveMetasAhorro() {
    localStorage.setItem('metas_ahorro', JSON.stringify(metas_ahorro));
  }

  const persistTxs = () => {
    const serialized = txs.map((t) => ({ ...t, ts: new Date(t.ts).toISOString() }));
    // Sincroniza tanto 'movimientos' como 'patrimonio.movimientos'
    localStorage.setItem('movimientos', JSON.stringify(serialized));
    localStorage.setItem('patrimonio.movimientos', JSON.stringify(serialized));
  };

  const getApiKey = () => localStorage.getItem('gemini_api_key') || localStorage.getItem(KEYS.apiKey) || '';
  const setApiKey = (key) => {
    if (key) {
      localStorage.setItem('gemini_api_key', key);
      localStorage.setItem(KEYS.apiKey, key);
    } else {
      localStorage.removeItem('gemini_api_key');
      localStorage.removeItem(KEYS.apiKey);
    }
  };

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

  let settings = Object.assign({ budget: loadMonthlyBudget(), sunday: true }, load(KEYS.settings, {}));
  settings.budget = loadMonthlyBudget();
  let summary = load(KEYS.summary, null);
  // Limpieza de cualquier texto residual de IA en la pantalla principal
  if (summary && summary.text) {
    const lower = summary.text.toLowerCase();
    if (lower.includes('veredicto') || lower.includes('luz verde') || lower.includes('luz roja') || lower.includes('precaución') || lower.includes('antojo')) {
      summary = null;
      try { localStorage.removeItem(KEYS.summary); } catch (e) {}
    }
  }

  let state = { tab: 'boveda', period: 'week', filter: 'all', query: '' };
  let draft = { type: 'gasto', category: 'antojos', source: 'debito', cuotas: 1 };
  let generating = false;

  // Chart.js instances
  let chartGastosCatInstance = null;
  let chartBalanceInstance = null;

  /* ============================ GESTIÓN DE CICLO FINANCIERO (30 DÍAS FLOTANTE) ============================ */
  function getTodayISO() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getActiveCycle() {
    const raw = localStorage.getItem('trix_ciclo');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.fechaInicio) {
          return {
            fechaInicio: parsed.fechaInicio,
            duracion: Number(parsed.duracion) || 30
          };
        }
      } catch (e) {
        console.warn('Error leyendo trix_ciclo', e);
      }
    }
    const defaultCiclo = { fechaInicio: getTodayISO(), duracion: 30 };
    localStorage.setItem('trix_ciclo', JSON.stringify(defaultCiclo));
    return defaultCiclo;
  }

  function iniciarCicloHoy() {
    const hoyISO = getTodayISO();
    const ciclo = { fechaInicio: hoyISO, duracion: 30 };
    // 1. Guarda en localStorage.setItem('trix_ciclo', JSON.stringify({ fechaInicio: hoyISO, duracion: 30 }))
    localStorage.setItem('trix_ciclo', JSON.stringify(ciclo));

    // 2. Reinicia el montoCubierto = 0 de las bolsas de gastos fijos
    gastos_fijos.forEach((item) => {
      item.montoCubierto = 0;
    });
    saveGastosFijos();

    // 3. Muestra una alerta toast o feedback visual: "Nuevo ciclo de 30 días iniciado"
    toast('Nuevo ciclo de 30 días iniciado');

    // 4. Recalcula el margen disponible de inmediato sobre los 30 días completos
    renderAll();

    if (navigator.vibrate) navigator.vibrate(18);
    return ciclo;
  }

  /* ============================ Cálculos Financieros ============================ */
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

  /* ==================== MÓDULO 3: MOTOR PATRIMONIAL & SINCRONIZACIÓN DE AHORRO ==================== */
  function getPatrimonialMetrics() {
    const ciclo = getActiveCycle();
    const duracion = Number(ciclo.duracion) || 30;

    const parts = (ciclo.fechaInicio || getTodayISO()).split('-').map(Number);
    const startCycleDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
    const startCycleTs = startCycleDate.getTime();

    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const diffDays = Math.floor((todayDate.getTime() - startCycleTs) / (24 * 60 * 60 * 1000));

    // Día actual del ciclo (Día 1 si inició hoy)
    const diaActual = Math.max(1, diffDays + 1);
    // Días restantes del ciclo activo (30 días completos si inició hoy)
    const diasRestantes = Math.max(1, duracion - Math.max(0, diffDays));

    // Transacciones que caen dentro del ciclo activo (desde el inicio del ciclo)
    const cycleTxs = txs.filter((t) => t.ts >= startCycleTs);

    // 1. Ingresos Fijos del Ciclo = Suma de ingresos_fijos + ingresos extraordinarios registrados en este ciclo
    const ingresosFijosSuma = ingresos_fijos.reduce((sum, item) => sum + (Number(item.monto) || 0), 0);
    const ingresosExtra = cycleTxs.filter((t) => t.type === 'ingreso').reduce((sum, t) => sum + t.amount, 0);
    const totalIngresos = ingresosFijosSuma + ingresosExtra;

    // 2. Gastos Fijos Operativos (Servicios, transporte, suscripciones)
    const gastosFijosOperativos = gastos_fijos.reduce((sum, item) => {
      const proy = Number(item.montoProyectado) || 0;
      const cub = Number(item.montoCubierto) || 0;
      return sum + Math.max(0, proy - cub);
    }, 0);
    const fijosCubiertos = gastos_fijos.reduce((sum, item) => sum + (Number(item.montoCubierto) || 0), 0);

    // 3. Cuota Mensual de Ahorro = Suma de todos los aportes mensuales planeados (Compromiso Fijo Sagrado)
    const cuotaAhorroMensual = metas_ahorro.reduce((sum, item) => sum + (Number(item.aporteMensualPlaneado) || 0), 0);
    const ahorroTotalAcumulado = metas_ahorro.reduce((sum, item) => sum + (Number(item.montoActual) || 0), 0);

    // 4. Gastos Variables = Gastos del ciclo registrados que no corresponden a fijos
    const gastosVariables = cycleTxs.filter((t) => t.type === 'gasto' && t.category !== 'fijos').reduce((sum, t) => sum + t.amount, 0);

    // 5. Dinero Libre Real = Ingresos Fijos - Gastos Fijos Operativos - Cuota Mensual de Ahorro - Gastos Variables
    const dineroLibreReal = totalIngresos - gastosFijosOperativos - cuotaAhorroMensual - gastosVariables;

    // 6. Margen Diario Disponible = Dinero Libre Real / Días restantes del ciclo activo
    const margenDiario = Math.round(dineroLibreReal / diasRestantes);

    return {
      now,
      ciclo,
      diaActual,
      duracionCiclo: duracion,
      diasRestantes,
      totalIngresos,
      ingresosFijosSuma,
      ingresosExtra,
      gastosFijosOperativos,
      fijosCubiertos,
      cuotaAhorroMensual,
      ahorroTotalAcumulado,
      gastosVariables,
      dineroLibreReal,
      margenDiario
    };
  }

  /* ============================== Navegación ============================== */
  function setTab(tab) {
    state.tab = tab;
    $$('.view').forEach((v) => { v.hidden = v.id !== `view-${tab}`; });
    $$('.nav-btn').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const viewEl = $(`#view-${tab}`);
    if (viewEl) $('#hdrTitle').textContent = viewEl.dataset.title || 'Trix';
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

    // Sparkline
    const vals = Array.from({ length: 7 }, (_, i) => balanceAt(end - (6 - i) * DAY));
    const min = Math.min(...vals), max = Math.max(...vals);
    const pts = vals.map((v, i) => [(i * 320) / 6, max === min ? 20 : 34 - ((v - min) / (max - min)) * 28]);
    const line = sparkPath(pts);
    $('#sparkLine').setAttribute('d', line);
    $('#sparkArea').setAttribute('d', `${line} L320,40 L0,40 Z`);
    $('#sparkDot').setAttribute('cx', pts[6][0]);
    $('#sparkDot').setAttribute('cy', pts[6][1]);

    // Módulo 3: Render Centro de Control & Burn Rate
    const pm = getPatrimonialMetrics();
    const dailyAvailableEl = $('#dailyAvailable');
    if (dailyAvailableEl) {
      dailyAvailableEl.textContent = `Margen disponible para hoy: ${pm.margenDiario < 0 ? '-' : ''}$ ${fmt(pm.margenDiario)} COP`;
    }
    const daysEl = $('#dailyRemainingDays');
    if (daysEl) {
      daysEl.textContent = `Ciclo activo: Día ${pm.diaActual} de 30 (Quedan ${pm.diasRestantes} días)`;
    }
    const burnBadge = $('#burnRateBadge');
    if (burnBadge) {
      if (pm.margenDiario > 0) {
        burnBadge.textContent = 'Ritmo Saludable 🟢';
        burnBadge.className = 'text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-[#10B981]/20 border border-[#10B981]/40 text-[#34D399]';
      } else {
        burnBadge.textContent = 'Ritmo Ajustado 🔴';
        burnBadge.className = 'text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-[#720000]/30 border border-[#bb0000]/50 text-[#ffb4a8]';
      }
    }
    $('#burnTotalIngresos').textContent = `+$ ${fmt(pm.totalIngresos)} COP`;
    $('#burnFijosPendientes').textContent = `-$ ${fmt(pm.gastosFijosOperativos)} COP`;
    $('#burnAhorroDestinado').textContent = `-$ ${fmt(pm.cuotaAhorroMensual)} COP`;
    $('#burnMargenLibre').textContent = `${pm.dineroLibreReal < 0 ? '-' : ''}$ ${fmt(pm.dineroLibreReal)} COP`;

    // Módulos interactivos
    renderGastosFijosModule();
    renderMetasAhorroModule();
    renderIngresosFijosModule();

    // Resumen Semanal
    const cycleExp = pm.gastosVariables + pm.fijosCubiertos;
    renderSummaryCard(cycleExp);

    // Movimientos recientes
    const recent = [...txs].sort((a, b) => b.ts - a.ts).slice(0, 4);
    $('#recentList').innerHTML = recent.length
      ? recent.map((t, i) => compactRow(t) + (i < recent.length - 1 ? '<div class="hairline-divider mx-3"></div>' : '')).join('')
      : emptyState('Aún no hay movimientos', 'Registra tu primer gasto o ingreso.');
  }

  /* ==================== MÓDULO 4: BOLSAS DE GASTOS FIJOS ==================== */
  function renderGastosFijosModule() {
    const container = $('#gastosFijosList');
    if (!container) return;

    if (!gastos_fijos.length) {
      container.innerHTML = `
        <div class="glass-surface rounded-[22px] p-4 text-center flex flex-col items-center gap-2">
          <span class="material-symbols-outlined text-[24px] text-[#71717A]">receipt_long</span>
          <span class="text-xs text-white font-semibold">Sin compromisos fijos</span>
          <span class="text-[11px] text-[#9CA3AF]">Define bolsas para transporte, arriendo, servicios con abonos parciales.</span>
          <button type="button" id="btnQuickAddFijo" class="mt-1 px-4 py-1.5 rounded-full bg-[#720000]/30 hover:bg-[#720000]/50 border border-[#bb0000]/40 text-xs text-white font-semibold active:scale-95 transition-all">
            + Añadir primer compromiso
          </button>
        </div>`;
      $('#btnQuickAddFijo')?.addEventListener('click', () => openFormFijo());
      return;
    }

    container.innerHTML = gastos_fijos.map((item) => {
      const proy = Number(item.montoProyectado) || 0;
      const cub = Number(item.montoCubierto) || 0;
      const pct = proy > 0 ? Math.min(100, Math.round((cub / proy) * 100)) : 100;
      const isComplete = cub >= proy && proy > 0;
      const pendiente = Math.max(0, proy - cub);

      return `
        <div class="glass-surface rounded-[22px] p-4 flex flex-col gap-2.5 relative border border-white/10 hover:border-white/20 transition-all">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-[#720000]/30 border border-[#720000]/50 flex items-center justify-center text-white shrink-0">
                <span class="material-symbols-outlined text-[16px]">receipt_long</span>
              </div>
              <div class="flex flex-col">
                <span class="text-sm font-bold text-white tracking-tight">${esc(item.nombre)}</span>
                <span class="text-[10px] text-[#9CA3AF] font-numbers">$ ${fmt(cub)} / $ ${fmt(proy)} COP</span>
              </div>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] px-2.5 py-0.5 rounded-full font-semibold font-numbers ${isComplete ? 'bg-[#10B981]/20 border border-[#10B981]/40 text-[#34D399]' : 'bg-[#720000]/25 border border-[#720000]/40 text-[#ffb4a8]'}">
                ${isComplete ? '100% Cubierto' : `-$ ${fmt(pendiente)}`}
              </span>
              <button type="button" data-action="edit-fijo" data-id="${item.id}" class="w-7 h-7 rounded-full bg-white/[0.04] hover:bg-white/10 flex items-center justify-center text-[#9CA3AF] hover:text-white" aria-label="Editar">
                <span class="material-symbols-outlined text-[15px]">edit</span>
              </button>
            </div>
          </div>

          <div class="progress-track">
            <div class="${isComplete ? 'progress-fill-emerald' : 'progress-fill-crimson'}" style="width: ${pct}%;"></div>
          </div>

          <div class="flex items-center justify-between pt-1">
            <span class="text-[11px] text-[#9CA3AF] font-numbers font-medium">${pct}% cubierto</span>
            <button type="button" data-action="abonar-fijo" data-id="${item.id}" class="px-3.5 py-1.5 rounded-full btn-liquid-wine text-xs text-white font-bold active:scale-95 transition-all flex items-center gap-1.5 shadow-sm">
              <span class="material-symbols-outlined text-[14px]">add</span>
              <span>+ Abonar</span>
            </button>
          </div>
        </div>`;
    }).join('');
  }

  /* ==================== MÓDULO 5: METAS DE AHORRO SINCRONIZADAS ==================== */
  function renderMetasAhorroModule() {
    const container = $('#metasAhorroList');
    if (!container) return;

    if (!metas_ahorro.length) {
      container.innerHTML = `
        <div class="glass-surface rounded-[22px] p-4 text-center flex flex-col items-center gap-2">
          <span class="material-symbols-outlined text-[24px] text-[#71717A]">savings</span>
          <span class="text-xs text-white font-semibold">Sin metas de ahorro</span>
          <span class="text-[11px] text-[#9CA3AF]">Define objetivos visuales con su aporte mensual planeado.</span>
          <button type="button" id="btnQuickAddMeta" class="mt-1 px-4 py-1.5 rounded-full bg-[#10B981]/20 hover:bg-[#10B981]/30 border border-[#10B981]/40 text-xs text-[#34D399] font-semibold active:scale-95 transition-all">
            + Añadir primera meta
          </button>
        </div>`;
      $('#btnQuickAddMeta')?.addEventListener('click', () => openFormMeta());
      return;
    }

    container.innerHTML = metas_ahorro.map((meta) => {
      const obj = Number(meta.montoObjetivo) || 0;
      const act = Number(meta.montoActual) || 0;
      const aportePlan = Number(meta.aporteMensualPlaneado) || 0;
      const pct = obj > 0 ? Math.min(100, Math.round((act / obj) * 100)) : 100;
      const isComplete = act >= obj && obj > 0;
      const falta = Math.max(0, obj - act);

      return `
        <div class="glass-surface rounded-[22px] p-4 flex flex-col gap-2.5 relative border border-white/10 hover:border-white/20 transition-all">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-[#10b981]/20 border border-[#10b981]/40 flex items-center justify-center text-[#34D399] shrink-0">
                <span class="material-symbols-outlined text-[16px]">savings</span>
              </div>
              <div class="flex flex-col">
                <span class="text-sm font-bold text-white tracking-tight">${esc(meta.nombre)}</span>
                <span class="text-[10px] text-[#9CA3AF] font-numbers">Acumulado: $ ${fmt(act)} / $ ${fmt(obj)} COP</span>
              </div>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] px-2.5 py-0.5 rounded-full font-semibold font-numbers ${isComplete ? 'bg-[#10B981]/20 border border-[#10B981]/40 text-[#34D399]' : 'bg-white/[0.05] border border-white/10 text-white/90'}">
                ${isComplete ? '¡Alcanzada! 🏆' : `${pct}%`}
              </span>
              <button type="button" data-action="edit-meta" data-id="${meta.id}" class="w-7 h-7 rounded-full bg-white/[0.04] hover:bg-white/10 flex items-center justify-center text-[#9CA3AF] hover:text-white" aria-label="Editar">
                <span class="material-symbols-outlined text-[15px]">edit</span>
              </button>
            </div>
          </div>

          <div class="progress-track">
            <div class="progress-fill-emerald" style="width: ${pct}%;"></div>
          </div>

          <div class="flex items-center justify-between pt-1">
            <div class="flex flex-col">
              <span class="text-[11px] text-[#9CA3AF] font-numbers font-medium">${isComplete ? 'Meta alcanzada' : `Faltan $ ${fmt(falta)} COP`}</span>
              <span class="text-[10px] text-[#34D399] font-medium font-numbers">Aporte planeado: $ ${fmt(aportePlan)}/mes</span>
            </div>
            <button type="button" data-action="aportar-meta" data-id="${meta.id}" class="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#059669] to-[#10B981] text-xs text-white font-bold active:scale-95 transition-all flex items-center gap-1.5 shadow-[0_2px_12px_rgba(16,185,129,0.35)]">
              <span class="material-symbols-outlined text-[14px]">add</span>
              <span>+ Aportar</span>
            </button>
          </div>
        </div>`;
    }).join('');
  }

  /* ==================== MÓDULO INGRESOS FIJOS ==================== */
  function renderIngresosFijosModule() {
    const container = $('#ingresosFijosList');
    if (!container) return;

    if (!ingresos_fijos.length) {
      container.innerHTML = `
        <div class="glass-surface rounded-[20px] p-3 text-center flex items-center justify-between">
          <span class="text-xs text-[#9CA3AF]">Sin ingresos fijos registrados.</span>
          <button type="button" id="btnQuickAddIngreso" class="text-xs text-[#34D399] font-semibold hover:underline">
            + Añadir salario
          </button>
        </div>`;
      $('#btnQuickAddIngreso')?.addEventListener('click', () => openFormIngreso());
      return;
    }

    container.innerHTML = ingresos_fijos.map((item) => `
      <div class="glass-surface rounded-[20px] p-3 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
            <span class="material-symbols-outlined text-[14px]">payments</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-xs font-semibold text-white truncate">${esc(item.nombre)}</span>
            <span class="text-[10px] text-[#9CA3AF] font-numbers">+$ ${fmt(item.monto)} COP/mes</span>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button type="button" data-action="iniciar-ciclo" data-id="${item.id}" class="btn-iniciar-ciclo bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-medium active:scale-95 transition-all">
            <span>🔄</span>
            <span>Iniciar ciclo hoy</span>
          </button>
          <button type="button" data-action="edit-ingreso" data-id="${item.id}" class="w-7 h-7 rounded-full bg-white/[0.04] hover:bg-white/10 flex items-center justify-center text-[#9CA3AF] hover:text-white active:scale-95 transition-all" aria-label="Editar">
            <span class="material-symbols-outlined text-[14px]">edit</span>
          </button>
        </div>
      </div>`).join('');
  }

  function renderSummaryCard(cycleExp) {
    // Limpieza de cualquier texto residual de consultas pasadas de IA en la pantalla principal
    if (summary && summary.text) {
      const lower = summary.text.toLowerCase();
      if (lower.includes('veredicto') || lower.includes('luz verde') || lower.includes('luz roja') || lower.includes('precaución') || lower.includes('antojo')) {
        summary = null;
        try { localStorage.removeItem(KEYS.summary); } catch (e) {}
      }
    }

    const cats = categoryTotals(last7());
    const ranked = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const weekExp = sumExpenses(last7());
    const topShare = weekExp > 0 ? Math.round((ranked[0][1] / weekExp) * 100) : 0;
    $('#pillTop').textContent = `${topShare}%`;
    $('#pillRest').textContent = `${weekExp > 0 ? 100 - topShare : 0}%`;

    const ratio = settings.budget > 0 ? cycleExp / settings.budget : 0;
    $('#sumBadge').textContent = ratio <= 0.7 ? 'Ritmo Óptimo' : ratio <= 1 ? 'Atención' : 'Tope Superado';

    if (summary && summary.text) {
      $('#sumText').innerHTML = renderRichText(summary.text);
      const d = new Date(summary.ts);
      $('#sumMeta').textContent = `Generado por Gemini · ${sameDay(d, new Date()) ? 'hoy' : dayLabel(d).toLowerCase()} ${hhmm(d)}`;
    } else {
      $('#sumText').textContent = cycleExp > 0
        ? `Llevas $ ${fmt(cycleExp)} en gastos este ciclo (${Math.round(ratio * 100)}% de tu tope). Lo que más pesa: ${CATEGORIES[ranked[0][0]]?.label || 'Varios'}. Genera el balance con IA para un análisis completo.`
        : 'Sin gastos en este ciclo. Registra movimientos y genera tu balance conversacional con Gemini.';
      $('#sumMeta').textContent = '';
    }
  }

  /* ==================== MÓDULO 2: GRÁFICAS VISUALES LIQUID GLASS (CHART.JS) ==================== */
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

    // Gráfica 1: Dona estilizada Chart.js
    renderChartDoughnut(cats, total);

    // Gráfica 2: Barra comparativa / Balance Chart.js
    renderChartBalance(cur);

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

  function renderChartDoughnut(cats, total) {
    const canvas = $('#chartGastosCat');
    if (!canvas || typeof Chart === 'undefined') return;

    if (chartGastosCatInstance) {
      chartGastosCatInstance.destroy();
      chartGastosCatInstance = null;
    }

    const catKeys = Object.keys(CATEGORIES);
    const catLabels = catKeys.map((k) => CATEGORIES[k].label);
    const catValues = catKeys.map((k) => cats[k] || 0);

    const hasData = total > 0;
    const dataValues = hasData ? catValues : [1];
    const bgColors = hasData
      ? [CHART_PALETTE.carmesi, CHART_PALETTE.esmeralda, CHART_PALETTE.violeta, CHART_PALETTE.pizarra, CHART_PALETTE.ambar]
      : ['rgba(255,255,255,0.06)'];

    chartGastosCatInstance = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: hasData ? catLabels : ['Sin gastos'],
        datasets: [{
          data: dataValues,
          backgroundColor: bgColors,
          borderWidth: 0,
          hoverOffset: hasData ? 6 : 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '74%',
        animation: { duration: 600 },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: hasData,
            backgroundColor: 'rgba(15, 14, 20, 0.94)',
            titleColor: '#ffffff',
            bodyColor: '#e5e1e5',
            borderColor: 'rgba(255, 255, 255, 0.12)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 12,
            callbacks: {
              label: (context) => {
                const val = context.raw || 0;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
                return ` ${context.label}: $ ${fmt(val)} COP (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  function renderChartBalance(periodTxs) {
    const canvas = $('#chartBalanceComparativa');
    if (!canvas || typeof Chart === 'undefined') return;

    if (chartBalanceInstance) {
      chartBalanceInstance.destroy();
      chartBalanceInstance = null;
    }

    const ingresos = periodTxs.filter((t) => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0)
      + (state.period === 'month' ? ingresos_fijos.reduce((s, i) => s + (Number(i.monto) || 0), 0) : 0);

    const fijosCubiertos = periodTxs.filter((t) => t.type === 'gasto' && t.category === 'fijos').reduce((s, t) => s + t.amount, 0);
    const variables = periodTxs.filter((t) => t.type === 'gasto' && t.category !== 'fijos').reduce((s, t) => s + t.amount, 0);

    $('#mbTotalIngresos').textContent = `$ ${fmt(ingresos)}`;
    $('#mbFijosCubiertos').textContent = `$ ${fmt(fijosCubiertos)}`;
    $('#mbGastosVariables').textContent = `$ ${fmt(variables)}`;

    chartBalanceInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Ingresos', 'Fijos Cub.', 'Variables'],
        datasets: [{
          data: [ingresos, fijosCubiertos, variables],
          backgroundColor: [CHART_PALETTE.esmeralda, CHART_PALETTE.carmesi, CHART_PALETTE.violeta],
          borderRadius: 8,
          borderWidth: 0,
          barThickness: 20
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#9CA3AF',
              font: { family: 'Plus Jakarta Sans', size: 10 },
              callback: (v) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : (v / 1000).toFixed(0) + 'k')
            }
          },
          y: {
            grid: { display: false },
            ticks: {
              color: '#E5E1E5',
              font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' }
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 14, 20, 0.94)',
            titleColor: '#ffffff',
            bodyColor: '#e5e1e5',
            borderColor: 'rgba(255, 255, 255, 0.12)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 12,
            callbacks: {
              label: (ctx) => ` $ ${fmt(ctx.raw)} COP`
            }
          }
        }
      }
    });
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

  function renderRichText(text) {
    return esc(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
  }

  /* ================================= Diálogos ================================= */
  let confirmResolve = null;
  function confirmDialog({ title, detail, amount = '', amountClass = '', okLabel = 'Eliminar' }) {
    $('#confirmTitle').textContent = title;
    $('#confirmDetail').textContent = detail;
    const a = $('#confirmAmount');
    if (amount) { a.textContent = amount; a.className = `num-figures text-lg font-bold mt-1 ${amountClass}`; a.hidden = false; }
    else a.hidden = true;
    const okBtn = $('#confirmOk');
    okBtn.textContent = okLabel;
    okBtn.className = okLabel === 'Importar' ? 'h-12 rounded-full bg-white/[0.1] text-white border border-white/20 text-sm font-semibold' : 'h-12 rounded-full liquid-red-btn text-white text-sm font-semibold';
    document.body.classList.add('confirm-open');
    return new Promise((res) => { confirmResolve = res; });
  }
  function closeConfirm(val) {
    document.body.classList.remove('confirm-open');
    if (confirmResolve) { confirmResolve(val); confirmResolve = null; }
  }

  /* ============================ Modal Presupuesto Mensual ============================ */
  const budgetInputEl = $('#budgetInput');
  const parseBudgetValue = () => parseNum(budgetInputEl ? budgetInputEl.value : '');
  const setBudgetInputValue = (n) => {
    if (budgetInputEl) budgetInputEl.value = n > 0 ? `$ ${fmt(n)}` : '';
  };

  function openBudgetModal() {
    setBudgetInputValue(settings.budget);
    document.body.classList.add('budget-open');
    setTimeout(() => {
      if (budgetInputEl) {
        budgetInputEl.focus();
        const val = budgetInputEl.value;
        budgetInputEl.setSelectionRange(val.length, val.length);
      }
    }, 150);
  }

  function closeBudgetModal() {
    document.body.classList.remove('budget-open');
    if (document.activeElement === budgetInputEl) budgetInputEl?.blur();
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
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  /* ============================ Modal Nuevo Movimiento ============================ */
  const amountEl = $('#amountInput');
  const noteEl = $('#noteInput');
  const parseAmount = () => parseNum(amountEl ? amountEl.value : '');
  const setAmount = (n) => { if (amountEl) amountEl.value = n > 0 ? `$ ${fmt(n)}` : ''; };

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

  /* ==================== MÓDULO 4: ABONAR Y GESTIONAR FIJOS ==================== */
  let activeFijoAbono = null;
  function openAbonarFijoModal(fijoId) {
    const item = gastos_fijos.find((x) => x.id === fijoId);
    if (!item) return;
    activeFijoAbono = item;
    const proy = Number(item.montoProyectado) || 0;
    const cub = Number(item.montoCubierto) || 0;
    const pendiente = Math.max(0, proy - cub);
    const pct = proy > 0 ? Math.min(100, Math.round((cub / proy) * 100)) : 100;

    $('#abonarFijoTitle').textContent = `Abonar a ${item.nombre}`;
    $('#abonarFijoProgresoText').textContent = `$ ${fmt(cub)} / $ ${fmt(proy)} COP`;
    $('#abonarFijoPendienteText').textContent = pendiente > 0 ? `Faltan $ ${fmt(pendiente)} COP` : '¡Cubierto!';
    $('#abonarFijoProgressBar').style.width = `${pct}%`;
    $('#abonarMontoInput').value = '';

    $('#modal-abonar-fijo').classList.add('modal-open');
    setTimeout(() => $('#abonarMontoInput').focus(), 150);
  }

  function closeAbonarFijoModal() {
    $('#modal-abonar-fijo').classList.remove('modal-open');
    activeFijoAbono = null;
  }

  function confirmAbonoFijo() {
    if (!activeFijoAbono) return;
    const abono = parseNum($('#abonarMontoInput').value);
    if (abono <= 0) {
      toast('Ingresa un monto de abono mayor a 0');
      return;
    }

    activeFijoAbono.montoCubierto = (Number(activeFijoAbono.montoCubierto) || 0) + abono;
    saveGastosFijos();

    const tx = {
      id: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: 'gasto',
      amount: abono,
      note: `Abono: ${activeFijoAbono.nombre}`,
      category: 'fijos',
      source: 'debito',
      origen: 'debito',
      ts: Date.now()
    };
    txs.push(tx);
    persistTxs();

    closeAbonarFijoModal();
    renderAll();
    toast(`Abono de $ ${fmt(abono)} a ${activeFijoAbono.nombre} registrado`);
    if (navigator.vibrate) navigator.vibrate(14);
  }

  function openFormFijo(fijoId = null) {
    const fijo = fijoId ? gastos_fijos.find((x) => x.id === fijoId) : null;
    $('#fijoIdInput').value = fijo ? fijo.id : '';
    $('#fijoNombreInput').value = fijo ? fijo.nombre : '';
    $('#fijoProyectadoInput').value = fijo ? `$ ${fmt(fijo.montoProyectado)}` : '';
    $('#formFijoTitle').textContent = fijo ? 'Editar Compromiso Fijo' : 'Nuevo Compromiso Fijo';
    $('#btnDeleteFijo').hidden = !fijo;
    $('#btnSaveFijo').className = fijo ? 'h-11 rounded-full btn-liquid-wine text-white text-xs font-bold active:scale-95 transition-all' : 'h-11 col-span-2 rounded-full btn-liquid-wine text-white text-xs font-bold active:scale-95 transition-all';
    $('#modal-form-fijo').classList.add('modal-open');
    setTimeout(() => $('#fijoNombreInput').focus(), 150);
  }

  function closeFormFijo() {
    $('#modal-form-fijo').classList.remove('modal-open');
  }

  function saveFormFijo(e) {
    e.preventDefault();
    const id = $('#fijoIdInput').value;
    const nombre = $('#fijoNombreInput').value.trim();
    const proyectado = parseNum($('#fijoProyectadoInput').value);

    if (!nombre) { toast('Ingresa el nombre del gasto fijo'); return; }
    if (proyectado <= 0) { toast('Ingresa un monto proyectado válido'); return; }

    if (id) {
      const idx = gastos_fijos.findIndex((x) => x.id === id);
      if (idx !== -1) {
        gastos_fijos[idx].nombre = nombre;
        gastos_fijos[idx].montoProyectado = proyectado;
      }
    } else {
      gastos_fijos.push({
        id: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        nombre,
        montoProyectado: proyectado,
        montoCubierto: 0
      });
    }
    saveGastosFijos();
    closeFormFijo();
    renderAll();
    toast(`Compromiso "${nombre}" guardado`);
  }

  function deleteFormFijo() {
    const id = $('#fijoIdInput').value;
    if (!id) return;
    gastos_fijos = gastos_fijos.filter((x) => x.id !== id);
    saveGastosFijos();
    closeFormFijo();
    renderAll();
    toast('Compromiso eliminado');
  }

  /* ==================== MÓDULO 5: METAS DE AHORRO CON APORTE PLANEADO ==================== */
  let activeMetaAporte = null;
  function openAportarMetaModal(metaId) {
    const meta = metas_ahorro.find((x) => x.id === metaId);
    if (!meta) return;
    activeMetaAporte = meta;
    const obj = Number(meta.montoObjetivo) || 0;
    const act = Number(meta.montoActual) || 0;
    const falta = Math.max(0, obj - act);
    const pct = obj > 0 ? Math.min(100, Math.round((act / obj) * 100)) : 100;

    $('#aportarMetaTitle').textContent = `Aportar a ${meta.nombre}`;
    $('#aportarMetaProgresoText').textContent = `$ ${fmt(act)} / $ ${fmt(obj)} COP`;
    $('#aportarMetaRestanteText').textContent = falta > 0 ? `Faltan $ ${fmt(falta)} COP` : '¡Objetivo alcanzado!';
    $('#aportarMetaProgressBar').style.width = `${pct}%`;
    $('#aporteMontoInput').value = '';

    $('#modal-aportar-meta').classList.add('modal-open');
    setTimeout(() => $('#aporteMontoInput').focus(), 150);
  }

  function closeAportarMetaModal() {
    $('#modal-aportar-meta').classList.remove('modal-open');
    activeMetaAporte = null;
  }

  function confirmAporteMeta() {
    if (!activeMetaAporte) return;
    const aporte = parseNum($('#aporteMontoInput').value);
    if (aporte <= 0) {
      toast('Ingresa un monto de aporte mayor a 0');
      return;
    }
    activeMetaAporte.montoActual = (Number(activeMetaAporte.montoActual) || 0) + aporte;
    saveMetasAhorro();
    closeAportarMetaModal();
    renderAll();
    toast(`Aporte de $ ${fmt(aporte)} guardado para ${activeMetaAporte.nombre}`);
    if (navigator.vibrate) navigator.vibrate(14);
  }

  function openFormMeta(metaId = null) {
    const meta = metaId ? metas_ahorro.find((x) => x.id === metaId) : null;
    $('#metaIdInput').value = meta ? meta.id : '';
    $('#metaNombreInput').value = meta ? meta.nombre : '';
    $('#metaObjetivoInput').value = meta ? `$ ${fmt(meta.montoObjetivo)}` : '';
    $('#metaAporteMensualInput').value = meta && meta.aporteMensualPlaneado ? `$ ${fmt(meta.aporteMensualPlaneado)}` : '';
    $('#metaInicialInput').value = meta ? (meta.montoActual ? `$ ${fmt(meta.montoActual)}` : '') : '';
    $('#formMetaTitle').textContent = meta ? 'Editar Meta de Ahorro' : 'Nueva Meta de Ahorro';
    $('#btnDeleteMeta').hidden = !meta;
    $('#btnSaveMeta').className = meta ? 'h-11 rounded-full bg-gradient-to-r from-[#059669] to-[#10B981] text-white text-xs font-bold active:scale-95 transition-all' : 'h-11 col-span-2 rounded-full bg-gradient-to-r from-[#059669] to-[#10B981] text-white text-xs font-bold active:scale-95 transition-all shadow-[0_4px_16px_rgba(16,185,129,0.4)]';
    $('#modal-form-meta').classList.add('modal-open');
    setTimeout(() => $('#metaNombreInput').focus(), 150);
  }

  function closeFormMeta() {
    $('#modal-form-meta').classList.remove('modal-open');
  }

  function saveFormMeta(e) {
    e.preventDefault();
    const id = $('#metaIdInput').value;
    const nombre = $('#metaNombreInput').value.trim();
    const objetivo = parseNum($('#metaObjetivoInput').value);
    const aporteMensual = parseNum($('#metaAporteMensualInput').value);
    const inicial = parseNum($('#metaInicialInput').value);

    if (!nombre) { toast('Ingresa el nombre del objetivo'); return; }
    if (objetivo <= 0) { toast('Ingresa un monto objetivo válido'); return; }

    if (id) {
      const idx = metas_ahorro.findIndex((x) => x.id === id);
      if (idx !== -1) {
        metas_ahorro[idx].nombre = nombre;
        metas_ahorro[idx].montoObjetivo = objetivo;
        metas_ahorro[idx].aporteMensualPlaneado = aporteMensual;
        if (inicial > 0) metas_ahorro[idx].montoActual = inicial;
      }
    } else {
      metas_ahorro.push({
        id: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        nombre,
        montoObjetivo: objetivo,
        aporteMensualPlaneado: aporteMensual,
        montoActual: inicial || 0
      });
    }
    saveMetasAhorro();
    closeFormMeta();
    renderAll();
    toast(`Meta "${nombre}" guardada`);
  }

  function deleteFormMeta() {
    const id = $('#metaIdInput').value;
    if (!id) return;
    metas_ahorro = metas_ahorro.filter((x) => x.id !== id);
    saveMetasAhorro();
    closeFormMeta();
    renderAll();
    toast('Meta eliminada');
  }

  /* ==================== INGRESOS FIJOS GESTIÓN ==================== */
  function openFormIngreso(ingresoId = null) {
    const ing = ingresoId ? ingresos_fijos.find((x) => x.id === ingresoId) : null;
    $('#ingresoIdInput').value = ing ? ing.id : '';
    $('#ingresoNombreInput').value = ing ? ing.nombre : '';
    $('#ingresoMontoInput').value = ing ? `$ ${fmt(ing.monto)}` : '';
    const chk = $('#ingresoIniciarCicloCheckbox');
    if (chk) chk.checked = false;
    $('#formIngresoTitle').textContent = ing ? 'Editar Ingreso Fijo' : 'Nuevo Ingreso Fijo';
    $('#btnDeleteIngreso').hidden = !ing;
    $('#btnSaveIngreso').className = ing ? 'h-11 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-xs font-bold active:scale-95 transition-all' : 'h-11 col-span-2 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-xs font-bold active:scale-95 transition-all shadow-[0_4px_16px_rgba(16,185,129,0.4)]';
    $('#modal-form-ingreso').classList.add('modal-open');
    setTimeout(() => $('#ingresoNombreInput').focus(), 150);
  }

  function closeFormIngreso() {
    $('#modal-form-ingreso').classList.remove('modal-open');
  }

  function saveFormIngreso(e) {
    e.preventDefault();
    const id = $('#ingresoIdInput').value;
    const nombre = $('#ingresoNombreInput').value.trim();
    const monto = parseNum($('#ingresoMontoInput').value);
    const marcarCiclo = $('#ingresoIniciarCicloCheckbox')?.checked;

    if (!nombre) { toast('Ingresa el concepto del ingreso'); return; }
    if (monto <= 0) { toast('Ingresa un monto mensual válido'); return; }

    if (id) {
      const idx = ingresos_fijos.findIndex((x) => x.id === id);
      if (idx !== -1) {
        ingresos_fijos[idx].nombre = nombre;
        ingresos_fijos[idx].monto = monto;
      }
    } else {
      ingresos_fijos.push({
        id: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        nombre,
        monto
      });
    }
    saveIngresosFijos();
    closeFormIngreso();

    if (marcarCiclo) {
      iniciarCicloHoy();
      toast(`Ingreso fijo "${nombre}" guardado y nuevo ciclo de 30 días iniciado`);
    } else {
      renderAll();
      toast(`Ingreso fijo "${nombre}" guardado`);
    }
  }

  function deleteFormIngreso() {
    const id = $('#ingresoIdInput').value;
    if (!id) return;
    ingresos_fijos = ingresos_fijos.filter((x) => x.id !== id);
    saveIngresosFijos();
    closeFormIngreso();
    renderAll();
    toast('Ingreso fijo eliminado');
  }

  /* ==================== MÓDULO 6: CORRECCIÓN SIMULADOR DE ANTOJOS CON GEMINI 3.8 FLASH ==================== */
  function updateAntojoPreview() {
    const monto = parseNum($('#antojoMontoInput').value);
    const pm = getPatrimonialMetrics();
    $('#antojoCupoAntes').textContent = `${pm.margenDiario < 0 ? '-' : ''}$ ${fmt(pm.margenDiario)} COP`;
    $('#antojoDiasRestantes').textContent = `${pm.diasRestantes} días (Ciclo: Día ${pm.diaActual} de 30)`;

    const nuevoDineroLibre = pm.dineroLibreReal - monto;
    const nuevoMargenDiario = Math.round(nuevoDineroLibre / pm.diasRestantes);
    const despuesEl = $('#antojoCupoDespues');
    despuesEl.textContent = `${nuevoMargenDiario < 0 ? '-' : ''}$ ${fmt(nuevoMargenDiario)} COP`;
    despuesEl.className = `font-bold font-numbers ${nuevoMargenDiario < 0 ? 'text-[#ff9a8a]' : 'text-white'}`;
  }

  function openAntojoModal() {
    $('#antojoMontoInput').value = '';
    $('#antojoConceptoInput').value = '';
    const resBox = $('#resultado-simulador-ia');
    if (resBox) resBox.innerHTML = '';
    updateAntojoPreview();
    $('#modal-antojo').classList.add('modal-open');
    setTimeout(() => $('#antojoMontoInput').focus(), 150);
  }

  function closeAntojoModal() {
    $('#modal-antojo').classList.remove('modal-open');
  }

  async function consultarAntojoGemini() {
    const monto = parseNum($('#antojoMontoInput').value);
    const concepto = $('#antojoConceptoInput').value.trim() || 'Antojo';

    if (monto <= 0) {
      toast('Ingresa el monto del antojo');
      $('#antojoMontoInput').focus();
      return;
    }

    const key = getApiKey();
    if (!key) {
      toast('Guarda tu Google AI Studio API Key en Ajustes primero');
      closeAntojoModal();
      setTab('ajustes');
      setTimeout(() => $('#apiKeyInput').focus(), 150);
      return;
    }

    const pm = getPatrimonialMetrics();
    const nuevoDineroLibre = pm.dineroLibreReal - monto;
    const nuevoMargenDiario = Math.round(nuevoDineroLibre / pm.diasRestantes);

    // Estado de carga DENTRO del modal activo
    const resContainer = $('#resultado-simulador-ia');
    if (resContainer) {
      resContainer.innerHTML = `
        <div class="p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center gap-3 text-white">
          <span class="material-symbols-outlined spin text-white text-[22px]">sync</span>
          <div class="flex flex-col">
            <span class="text-xs font-bold text-white">Analizando impacto financiero...</span>
            <span class="text-[11px] text-[#9CA3AF]">Evaluando fijos, cuota de ahorro sagrada y ciclo de 30 días</span>
          </div>
        </div>`;
    }

    const icon = $('#antojoConsultarIcon');
    const label = $('#antojoConsultarLabel');
    const btn = $('#btnConsultarAntojo');

    btn.disabled = true;
    icon.classList.add('spin');
    label.textContent = 'Analizando impacto financiero...';

    // Instrucción estricta al modelo con contexto del ahorro mensual como gasto fijo sagrado
    const promptTexto = `Eres un asesor financiero personal directo y realista.
El usuario ya apartó su meta de ahorro como un gasto fijo sagrado. Evalúa si el antojo solicitado pone en riesgo el dinero libre restante para lo que queda de su ciclo financiero de 30 días, considerando qué día del ciclo es hoy.

Datos Financieros del Usuario en Colombia (COP):
- Ciclo Financiero Activo: Día ${pm.diaActual} de 30. Quedan ${pm.diasRestantes} días en este ciclo (incluyendo hoy).
- Ingreso del ciclo: $${fmt(pm.totalIngresos)} COP.
- Gastos fijos operativos (servicios, transporte, suscripciones): $${fmt(pm.gastosFijosOperativos)} COP pendientes.
- Cuota de ahorro mensual ya protegida (sagrada): $${fmt(pm.cuotaAhorroMensual)} COP.
- Gastos variables acumulados del ciclo: $${fmt(pm.gastosVariables)} COP.
- Dinero libre sobrante real del ciclo (antes del antojo): $${fmt(pm.dineroLibreReal)} COP.
- Cupo diario antes del antojo: $${fmt(pm.margenDiario)} COP/día.
- Antojo solicitado: "${concepto}" por valor de $${fmt(monto)} COP.
- Dinero libre restante si compra el antojo: $${fmt(nuevoDineroLibre)} COP.
- Cupo diario restante si compra el antojo: $${fmt(nuevoMargenDiario)} COP/día.

Responde obligatoriamente en este formato exacto:
VEREDICTO: [Luz Verde 🟢 | Precaución 🟡 | Luz Roja 🔴]
EXPLICACION: [Tu análisis de exactamente 2 frases cortas y contundentes sobre el impacto matemático en su cupo diario restante.]`;

    try {
      const respuesta = await generarBalanceConGemini(key, promptTexto);

      // Procesar veredicto
      let veredicto = 'PRECAUCIÓN 🟡';
      let badgeClass = 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.3)]';

      const lower = respuesta.toLowerCase();
      if (lower.includes('luz verde') || lower.includes('verde')) {
        veredicto = 'LUZ VERDE 🟢';
        badgeClass = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.4)]';
      } else if (lower.includes('luz roja') || lower.includes('roja')) {
        veredicto = 'LUZ ROJA 🔴';
        badgeClass = 'bg-[#720000]/30 text-[#ffb4a8] border border-[#bb0000]/50 shadow-[0_0_12px_rgba(187,0,0,0.4)]';
      }

      let cleanText = respuesta.replace(/VEREDICTO:[^\n]*/i, '').replace(/EXPLICACION:/i, '').trim();
      if (!cleanText) cleanText = respuesta;

      // Renderizar DENTRO del modal activo en #resultado-simulador-ia
      if (resContainer) {
        resContainer.innerHTML = `
          <div class="glass-surface p-4 rounded-2xl border border-white/15 flex flex-col gap-3 relative overflow-hidden" style="background: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(20,20,26,0.85) 100%);">
            <div class="flex items-center justify-between">
              <span class="text-[10px] uppercase font-bold text-[#9CA3AF] tracking-widest">Veredicto Oficial</span>
              <span class="text-xs font-extrabold px-3 py-1 rounded-full ${badgeClass}">
                ${veredicto}
              </span>
            </div>
            
            <p class="text-sm text-[#FFFFFF] leading-relaxed font-normal pr-1">
              ${esc(cleanText)}
            </p>

            <div class="pt-2 border-t border-white/10 flex flex-col gap-2 mt-1">
              <button id="btnComprarAntojo" type="button" class="w-full h-11 rounded-full btn-liquid-wine text-white text-xs font-bold active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg">
                <span class="material-symbols-outlined text-[16px]">shopping_bag</span>
                <span>Comprar y Registrar Gasto</span>
              </button>
              <button id="btnDescartarAntojo" type="button" class="w-full py-1.5 text-center text-xs text-[#9CA3AF] hover:text-white active:scale-95 transition-colors">
                Pensarlo mejor / No comprar
              </button>
            </div>
          </div>`;

        // Scroll suave al resultado para visibilidad en celulares
        const modalContent = $('#modal-antojo .app-modal-card');
        if (modalContent) {
          setTimeout(() => {
            modalContent.scrollTo({ top: modalContent.scrollHeight, behavior: 'smooth' });
          }, 100);
        }

        $('#btnComprarAntojo')?.addEventListener('click', comprarAntojoConfirmado);
        $('#btnDescartarAntojo')?.addEventListener('click', closeAntojoModal);
      }
    } catch (err) {
      console.error('[Gemini Antojo Error]', err);
      if (resContainer) {
        resContainer.innerHTML = `
          <div class="p-3.5 rounded-2xl bg-red-950/40 border border-red-800/40 text-xs text-[#ffb4a8]">
            <strong>Error al consultar Gemini:</strong> ${esc(err.message)}
          </div>`;
      }
      toast(`Error en Gemini: ${err.message}`.slice(0, 120));
    } finally {
      btn.disabled = false;
      icon.classList.remove('spin');
      label.textContent = 'Consultar a Gemini 3.8 Flash';
    }
  }

  function comprarAntojoConfirmado() {
    const monto = parseNum($('#antojoMontoInput').value);
    const concepto = $('#antojoConceptoInput').value.trim() || 'Antojo personal';
    if (monto <= 0) return;

    const tx = {
      id: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: 'gasto',
      amount: monto,
      note: concepto,
      category: 'antojos',
      source: 'debito',
      origen: 'debito',
      ts: Date.now()
    };
    txs.push(tx);
    persistTxs();
    closeAntojoModal();
    renderAll();
    toast(`Antojo "${concepto}" por $ ${fmt(monto)} registrado`);
    if (navigator.vibrate) navigator.vibrate(12);
  }

  /* ==================== GEMINI API ENGINE (GEMINI 3.8 FLASH) ==================== */
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
      const pm = getPatrimonialMetrics();
      const list = last7().sort((a, b) => a.ts - b.ts);
      const gastosSemana = sumExpenses(list);
      const cats = categoryTotals(list);
      const catLines = Object.entries(cats).filter(([, v]) => v > 0).map(([k, v]) => `${CATEGORIES[k].label}: $${fmt(v)}`).join(', ') || 'sin gastos';
      const lines = list.map((t) => `${t.type === 'ingreso' ? '+' : '-'}$${fmt(t.amount)} en ${CATEGORIES[t.category].label} ("${t.note}")`).join(', ');

      const promptTexto = `Eres un asesor financiero personal directo y amigable en Trix. Analiza el ritmo de gasto del usuario frente a su patrimonio y margen diario en Colombia.
Datos del usuario:
- Ingreso mensual fijo: $${fmt(pm.totalIngresos)} COP.
- Dinero libre real del mes: $${fmt(pm.dineroLibreReal)} COP.
- Margen diario disponible actual: $${fmt(pm.margenDiario)} COP.
- Fijos operativos pendientes: $${fmt(pm.gastosFijosOperativos)} COP.
- Ahorro mensual protegido: $${fmt(pm.cuotaAhorroMensual)} COP.
- Gastos últimos 7 días: $${fmt(gastosSemana)} COP (${catLines}).
- Movimientos recientes: ${lines}.
Dame un diagnóstico conciso y un consejo práctico en máximo 2 frases cortas.`;

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

  /* ==================== MÓDULO 1: BOTÓN DE RESPALDO PREVENTIVO (EXPORTAR JSON) ==================== */
  function exportData() {
    const dump = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      try {
        dump[k] = JSON.parse(localStorage.getItem(k));
      } catch {
        dump[k] = localStorage.getItem(k);
      }
    }

    const backup = {
      app: 'trix',
      version: 3,
      exportedAt: new Date().toISOString(),
      movimientos: txs.map((t) => ({ ...t, ts: new Date(t.ts).toISOString() })),
      ingresos_fijos,
      gastos_fijos,
      metas_ahorro,
      presupuesto_mensual: settings.budget,
      trix_ciclo: getActiveCycle(),
      gemini_api_key: getApiKey(),
      localStorageDump: dump
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `trix-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Copia de seguridad exportada con éxito');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        const rawMovs = Array.isArray(data) ? data : (data.movimientos || data['patrimonio.movimientos'] || []);
        if (!Array.isArray(rawMovs)) throw new Error('Formato no válido');

        const clean = rawMovs.filter((t) => t && t.amount > 0 && ['gasto', 'ingreso'].includes(t.type) && CATEGORIES[t.category] && !isNaN(new Date(t.ts)))
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

        if (!(await confirmDialog({ title: '¿Importar respaldo?', detail: `Se cargarán ${clean.length} movimientos y tus bolsas de fijos/metas del archivo.`, okLabel: 'Importar' }))) return;

        txs = clean;
        persistTxs();

        if (Array.isArray(data.ingresos_fijos)) {
          ingresos_fijos = data.ingresos_fijos;
          saveIngresosFijos();
        }
        if (Array.isArray(data.gastos_fijos)) {
          gastos_fijos = data.gastos_fijos;
          saveGastosFijos();
        }
        if (Array.isArray(data.metas_ahorro)) {
          metas_ahorro = data.metas_ahorro;
          saveMetasAhorro();
        }
        if (data.gemini_api_key) {
          setApiKey(data.gemini_api_key);
        }
        if (data.trix_ciclo) {
          localStorage.setItem('trix_ciclo', typeof data.trix_ciclo === 'string' ? data.trix_ciclo : JSON.stringify(data.trix_ciclo));
        } else if (data.localStorageDump?.trix_ciclo) {
          localStorage.setItem('trix_ciclo', typeof data.localStorageDump.trix_ciclo === 'string' ? data.localStorageDump.trix_ciclo : JSON.stringify(data.localStorageDump.trix_ciclo));
        }

        const importedBudget = (data.presupuesto_mensual && data.presupuesto_mensual > 0) ? data.presupuesto_mensual : (data.settings && data.settings.budget > 0) ? data.settings.budget : 0;
        if (importedBudget > 0) {
          settings.budget = importedBudget;
          localStorage.setItem('presupuesto_mensual', String(importedBudget));
          save(KEYS.settings, settings);
        }

        renderAll();
        toast(`${clean.length} movimientos y datos importados`);
      } catch (e) {
        console.error(e);
        toast('Archivo no válido');
      }
    };
    reader.readAsText(file);
  }

  /* ================================ Eventos ================================ */
  function bind() {
    // Navegación
    $$('.nav-btn').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $$('#btnNewMovement, #btnNewTx, #btnHeaderAdd').forEach((b) => b.addEventListener('click', openSheet));
    $('#btnSeeAll').addEventListener('click', () => setTab('movimientos'));
    $('#btnExplore').addEventListener('click', () => generateBalance());
    $('#btnGenerate').addEventListener('click', () => generateBalance());

    // Métricas y filtros
    $$('.period-btn').forEach((b) => b.addEventListener('click', () => { state.period = b.dataset.period; renderMetricas(); }));
    $$('.fchip').forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.filter; renderMovimientos(); }));
    $('#searchInput').addEventListener('input', (e) => { state.query = e.target.value; renderMovimientos(); });

    // Clicks en transacciones para eliminar
    const txClick = async (e) => {
      if (e.target.closest('button') && !e.target.closest('.tx-row')) return;
      const row = e.target.closest('[data-id]');
      if (!row) return;
      const t = txs.find((x) => x.id === row.dataset.id);
      if (!t) return;
      const ok = await confirmDialog({
        title: '¿Eliminar movimiento?',
        detail: t.note,
        amount: `${t.type === 'gasto' ? '-' : '+'}$ ${fmt(t.amount)} COP`,
        amountClass: t.type === 'ingreso' ? 'text-[#34D399]' : 'text-[#ffb4a8]'
      });
      if (!ok) return;
      txs = txs.filter((x) => x.id !== t.id);
      persistTxs();
      renderAll();
      toast('Movimiento eliminado');
    };
    $('#txList').addEventListener('click', txClick);
    $('#recentList').addEventListener('click', txClick);

    // Event delegation para Bolsas de Gastos Fijos
    $('#gastosFijosList')?.addEventListener('click', (e) => {
      const abonarBtn = e.target.closest('[data-action="abonar-fijo"]');
      if (abonarBtn) {
        openAbonarFijoModal(abonarBtn.dataset.id);
        return;
      }
      const editBtn = e.target.closest('[data-action="edit-fijo"]');
      if (editBtn) {
        openFormFijo(editBtn.dataset.id);
      }
    });
    $('#btnNewGastoFijo')?.addEventListener('click', () => openFormFijo());

    // Event delegation para Metas de Ahorro
    $('#metasAhorroList')?.addEventListener('click', (e) => {
      const aportarBtn = e.target.closest('[data-action="aportar-meta"]');
      if (aportarBtn) {
        openAportarMetaModal(aportarBtn.dataset.id);
        return;
      }
      const editBtn = e.target.closest('[data-action="edit-meta"]');
      if (editBtn) {
        openFormMeta(editBtn.dataset.id);
      }
    });
    $('#btnNewMetaAhorro')?.addEventListener('click', () => openFormMeta());

    // Event delegation para Ingresos Fijos
    $('#ingresosFijosList')?.addEventListener('click', (e) => {
      const cicloBtn = e.target.closest('[data-action="iniciar-ciclo"], .btn-iniciar-ciclo');
      if (cicloBtn) {
        iniciarCicloHoy();
        return;
      }
      const editBtn = e.target.closest('[data-action="edit-ingreso"]');
      if (editBtn) {
        openFormIngreso(editBtn.dataset.id);
      }
    });
    $('#btnNewIngresoFijo')?.addEventListener('click', () => openFormIngreso());

    // Simulador de Antojos
    $('#btnOpenAntojoModal')?.addEventListener('click', openAntojoModal);
    $('#btnCloseAntojoModal')?.addEventListener('click', closeAntojoModal);
    $('#antojoModalScrim')?.addEventListener('click', closeAntojoModal);
    $('#antojoMontoInput')?.addEventListener('input', () => {
      const n = Math.min(parseNum($('#antojoMontoInput').value), 999999999999);
      $('#antojoMontoInput').value = n > 0 ? `$ ${fmt(n)}` : '';
      updateAntojoPreview();
    });
    $$('[data-antojo-add]').forEach((b) => b.addEventListener('click', () => {
      const cur = parseNum($('#antojoMontoInput').value);
      const n = cur + Number(b.dataset.antojoAdd);
      $('#antojoMontoInput').value = `$ ${fmt(n)}`;
      updateAntojoPreview();
    }));
    $('#btnConsultarAntojo')?.addEventListener('click', consultarAntojoGemini);

    // Modal Abonar Fijo
    $('#btnCloseAbonarFijo')?.addEventListener('click', closeAbonarFijoModal);
    $('#btnCancelAbonarFijo')?.addEventListener('click', closeAbonarFijoModal);
    $('#abonarFijoScrim')?.addEventListener('click', closeAbonarFijoModal);
    $('#abonarMontoInput')?.addEventListener('input', () => {
      const n = Math.min(parseNum($('#abonarMontoInput').value), 999999999999);
      $('#abonarMontoInput').value = n > 0 ? `$ ${fmt(n)}` : '';
    });
    $$('[data-abono-add]').forEach((b) => b.addEventListener('click', () => {
      const cur = parseNum($('#abonarMontoInput').value);
      const n = cur + Number(b.dataset.abonoAdd);
      $('#abonarMontoInput').value = `$ ${fmt(n)}`;
    }));
    $('#btnAbonarRestante')?.addEventListener('click', () => {
      if (!activeFijoAbono) return;
      const proy = Number(activeFijoAbono.montoProyectado) || 0;
      const cub = Number(activeFijoAbono.montoCubierto) || 0;
      const pendiente = Math.max(0, proy - cub);
      $('#abonarMontoInput').value = pendiente > 0 ? `$ ${fmt(pendiente)}` : '';
    });
    $('#btnConfirmAbonarFijo')?.addEventListener('click', confirmAbonoFijo);

    // Modal Form Fijo
    $('#btnCloseFormFijo')?.addEventListener('click', closeFormFijo);
    $('#formFijoScrim')?.addEventListener('click', closeFormFijo);
    $('#fijoProyectadoInput')?.addEventListener('input', () => {
      const n = Math.min(parseNum($('#fijoProyectadoInput').value), 999999999999);
      $('#fijoProyectadoInput').value = n > 0 ? `$ ${fmt(n)}` : '';
    });
    $('#formGastoFijo')?.addEventListener('submit', saveFormFijo);
    $('#btnDeleteFijo')?.addEventListener('click', deleteFormFijo);

    // Modal Aportar Meta
    $('#btnCloseAportarMeta')?.addEventListener('click', closeAportarMetaModal);
    $('#btnCancelAportarMeta')?.addEventListener('click', closeAportarMetaModal);
    $('#aportarMetaScrim')?.addEventListener('click', closeAportarMetaModal);
    $('#aporteMontoInput')?.addEventListener('input', () => {
      const n = Math.min(parseNum($('#aporteMontoInput').value), 999999999999);
      $('#aporteMontoInput').value = n > 0 ? `$ ${fmt(n)}` : '';
    });
    $$('[data-aporte-add]').forEach((b) => b.addEventListener('click', () => {
      const cur = parseNum($('#aporteMontoInput').value);
      const n = cur + Number(b.dataset.aporteAdd);
      $('#aporteMontoInput').value = `$ ${fmt(n)}`;
    }));
    $('#btnConfirmAportarMeta')?.addEventListener('click', confirmAporteMeta);

    // Modal Form Meta
    $('#btnCloseFormMeta')?.addEventListener('click', closeFormMeta);
    $('#formMetaScrim')?.addEventListener('click', closeFormMeta);
    $('#metaObjetivoInput')?.addEventListener('input', () => {
      const n = Math.min(parseNum($('#metaObjetivoInput').value), 999999999999);
      $('#metaObjetivoInput').value = n > 0 ? `$ ${fmt(n)}` : '';
    });
    $('#metaAporteMensualInput')?.addEventListener('input', () => {
      const n = Math.min(parseNum($('#metaAporteMensualInput').value), 999999999999);
      $('#metaAporteMensualInput').value = n > 0 ? `$ ${fmt(n)}` : '';
    });
    $('#metaInicialInput')?.addEventListener('input', () => {
      const n = Math.min(parseNum($('#metaInicialInput').value), 999999999999);
      $('#metaInicialInput').value = n > 0 ? `$ ${fmt(n)}` : '';
    });
    $('#formMetaAhorro')?.addEventListener('submit', saveFormMeta);
    $('#btnDeleteMeta')?.addEventListener('click', deleteFormMeta);

    // Modal Form Ingreso Fijo
    $('#btnCloseFormIngreso')?.addEventListener('click', closeFormIngreso);
    $('#formIngresoScrim')?.addEventListener('click', closeFormIngreso);
    $('#ingresoMontoInput')?.addEventListener('input', () => {
      const n = Math.min(parseNum($('#ingresoMontoInput').value), 999999999999);
      $('#ingresoMontoInput').value = n > 0 ? `$ ${fmt(n)}` : '';
    });
    $('#formIngresoFijo')?.addEventListener('submit', saveFormIngreso);
    $('#btnDeleteIngreso')?.addEventListener('click', deleteFormIngreso);

    // Modal Nuevo Movimiento
    $('#btnCloseSheet').addEventListener('click', closeSheet);
    $('#btnCancelSheet').addEventListener('click', closeSheet);
    $('#sheetScrim').addEventListener('click', closeSheet);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.body.classList.contains('budget-open')) closeBudgetModal();
        else if (confirmResolve) closeConfirm(false);
        else if ($('#modal-antojo')?.classList.contains('modal-open')) closeAntojoModal();
        else if ($('#modal-abonar-fijo')?.classList.contains('modal-open')) closeAbonarFijoModal();
        else if ($('#modal-form-fijo')?.classList.contains('modal-open')) closeFormFijo();
        else if ($('#modal-aportar-meta')?.classList.contains('modal-open')) closeAportarMetaModal();
        else if ($('#modal-form-meta')?.classList.contains('modal-open')) closeFormMeta();
        else if ($('#modal-form-ingreso')?.classList.contains('modal-open')) closeFormIngreso();
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
    $('#catChips').addEventListener('click', (e) => {
      const c = e.target.closest('[data-cat]');
      if (c) { draft.category = c.dataset.cat; paintSheet(); }
    });
    $$('.src-btn').forEach((b) => b.addEventListener('click', () => {
      draft.source = b.dataset.source;
      paintSheet();
    }));
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

    // Manija del bottom sheet
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
      setApiKey(v);
      renderAjustes();
      toast(v ? 'Google AI Studio API Key guardada' : 'API Key eliminada');
      if (v) maybeAutoSundaySummary();
    });
    $('#btnToggleKey').addEventListener('click', () => {
      const i = $('#apiKeyInput');
      const show = i.type === 'password';
      i.type = show ? 'text' : 'password';
      $('#btnToggleKey .material-symbols-outlined').textContent = show ? 'visibility_off' : 'visibility';
    });
    $('#sundayToggle').addEventListener('change', (e) => { settings.sunday = e.target.checked; save(KEYS.settings, settings); });

    // Presupuesto Mensual
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

    // Respaldo preventivo e importación
    $('#btnExport').addEventListener('click', exportData);
    $('#btnImport').addEventListener('click', () => $('#fileImport').click());
    $('#fileImport').addEventListener('change', (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
    $('#btnReset').addEventListener('click', async () => {
      if (!(await confirmDialog({ title: '¿Restablecer bóveda en Trix?', detail: 'Se borrarán TODOS tus movimientos y el resumen guardado. Esta acción es irreversible.', okLabel: 'Borrar todo' }))) return;
      txs = []; summary = null;
      localStorage.removeItem('movimientos');
      localStorage.removeItem('patrimonio.movimientos');
      localStorage.removeItem(KEYS.summary);
      renderAll();
      toast('Bóveda restablecida');
    });

    // Sincronizar entre pestañas
    window.addEventListener('storage', (e) => {
      if (e.key === 'movimientos' || e.key === 'patrimonio.movimientos') {
        txs = loadInitialTxs().map((t) => ({ ...t, ts: new Date(t.ts).getTime() }));
        renderAll();
      }
      if (e.key === 'gastos_fijos') {
        gastos_fijos = JSON.parse(localStorage.getItem('gastos_fijos')) || [];
        renderAll();
      }
      if (e.key === 'metas_ahorro') {
        metas_ahorro = JSON.parse(localStorage.getItem('metas_ahorro')) || [];
        renderAll();
      }
      if (e.key === 'ingresos_fijos') {
        ingresos_fijos = JSON.parse(localStorage.getItem('ingresos_fijos')) || [];
        renderAll();
      }
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
