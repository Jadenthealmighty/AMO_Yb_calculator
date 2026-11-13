/* PhysCalc UI: worksheet, side panel, autocomplete, keypad, persistence. */
(function () {
  'use strict';
  var P = window.PhysCalc;
  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  var MOD = MAC ? '⌘' : 'Ctrl';
  // Equations added from the GUI live in equations/custom_equations.js (written by server.py). A copy is kept in
  // this browser; it is used instead of the file only while it holds changes the server has not saved yet.
  var CUSTOM_KEY = 'physcalc.customEq.v1';
  var customList = (function () {
    var local = null;
    try { local = JSON.parse(localStorage.getItem(CUSTOM_KEY)); } catch (e) { /* ignore */ }
    var list = (local && local.dirty && Array.isArray(local.list)) ? local.list : (P.customEquations || []);
    return list.filter(function (e) { return e && typeof e.def === 'string'; }).map(function (e, i) { var c = Object.assign({}, e); if (!c.key) c.key = 'eq' + i + '_' + Math.random().toString(36).slice(2, 8); return c; });
  })();
  var customDirtyAtBoot = (function () { try { var l = JSON.parse(localStorage.getItem(CUSTOM_KEY)); return !!(l && l.dirty); } catch (e) { return false; } })();
  P.customEquations = customList;
  var engine;
  try {
    engine = P.createEngine(window.math);
  } catch (e) {
    var be = document.getElementById('boot-error'); be.hidden = false;
    be.textContent = 'PhysCalc failed to start:\n' + (e && e.stack || e);
    return;
  }
  if (engine.errors.length) console.warn('PhysCalc warnings:\n' + engine.errors.join('\n'));
  var math = engine.math;

  // ---------- small helpers ----------
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function tex(target, s, display) {
    try { katex.render(s, target, { throwOnError: true, displayMode: !!display, strict: 'ignore' }); return true; }
    catch (e) { target.textContent = ''; return false; }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '' };
  function prettyNum(s) {
    s = String(s);
    var m = s.match(/^(-?[\d.]+)e([+-]?\d+)$/i);
    if (!m) return s;
    return m[1] + '×10' + String(parseInt(m[2], 10)).split('').map(function (c) { return SUP[c] || c; }).join('');
  }
  function fracUnit(u) {   // "mW cm^-2" -> "mW/cm^2"
    var num = [], den = [];
    String(u).trim().split(/\s+/).forEach(function (t) {
      var m = t.match(/^(.*?)\^\(?(-?[\d.]+)\)?$/);
      if (m && parseFloat(m[2]) < 0) { var p = -parseFloat(m[2]); den.push(m[1] + (p === 1 ? '' : '^' + p)); } else num.push(t);
    });
    if (!den.length || !num.length) return String(u);
    return num.join(' ') + '/' + (den.length > 1 ? '(' + den.join(' ') + ')' : den[0]);
  }
  function prettyUnit(u) {
    return fracUnit(u || '').replace(/\bu(?=[A-Za-z])/g, 'µ').replace(/\^\(?(-?[\d.]+)\)?/g, function (m, p) { return p.split('').map(function (c) { return SUP[c] || (c === '.' ? '·' : c); }).join(''); });
  }
  function prettyText(t) {   // "1.23e-5 mW/cm^2" -> "1.23×10⁻⁵ mW/cm²"
    var i = String(t).indexOf(' ');
    if (i < 0) return prettyNum(t);
    return prettyNum(t.slice(0, i)) + ' ' + prettyUnit(t.slice(i + 1));
  }
  var toastT;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 1400); }
  function copy(text) {
    function fallback() { var ta = el('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } ta.remove(); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).catch(fallback); else fallback();
    toast('Copied  ' + (text.length > 60 ? text.slice(0, 60) + '…' : text));
  }

  // ---------- state ----------
  var KEY = 'physcalc.v1';
  var WELCOME = [
    '# Welcome to PhysCalc — type on any line; results update live. Click a result to copy it.',
    '# The panel on the right has ¹⁷⁴Yb data, CODATA constants and ~200 equations: click anything to insert it.',
    'h*c/Yb.lambda399 to eV',
    'w = 1.5 mm   # blue MOT beam 1/e² radius',
    'Pb = 15 mW',
    'I0 = I_peak(Pb, w) to mW/cm^2',
    's0 = I0/Yb.Isat399',
    'scatt_rate(s0, -2*pi*15 MHz, Yb.Gamma399)',
    '# matrices: eig() gives eigenvalues and normalized eigenvectors',
    'M = [[0, 1, 0], [1, 0, 1], [0, 1, 0]]/sqrt(2)',
    'eig(M)',
    'comm(sx, sy)',
    '# functions and plots',
    'p(v) = MB_speed(v, Yb.m, 450 degC)',
    'plot(p, 0 m/s, 800 m/s)',
    'Yb.Pvap(450 degC) to torr',
    ''
  ];
  var THREE = [
    '# Three-photon ¹S₀ → ³P₁ → ³S₁ → ³P₀ in ¹⁷⁴Yb — rough numbers (stretched-state angular factors)',
    'I1 = 1 W/cm^2',
    'O1 = rabi_A(I1, Yb.lambda556, Yb.Gamma556)',
    'O2 = rabi_A(I1, Yb.lambda680, Yb.A680)',
    'O3 = rabi_A(I1, Yb.lambda649, Yb.A649)',
    'D1 = 2*pi*100 MHz to s^-1   # detuning from ³P₁ (angular)',
    'D2 = 2*pi*1 GHz to s^-1     # detuning from ³S₁ (angular)',
    'rabi3(O1, O2, O3, D1, D2)/(2*pi) to Hz',
    '# resonance condition: ν556 + ν680 − ν649 = ν578',
    'Yb.D_3P1_3P0',
    'nu649_needed = Yb.nu680 + Yb.D_3P1_3P0',
    'Yb.nu556 + Yb.nu680 - Yb.nu649 - Yb.nu578 to MHz   # mismatch from NIST level energies',
    ''
  ];
  var NEWS = [
    '# New here: input hints, sliders, labelled plots, overlays, data points and row vectors',
    '# 1. Type  scatt_rate(  on an empty line: a hint lists the inputs and highlights the one you are on.',
    '# 2. Drag the slider: every line below follows.',
    'Tov = slider(850 K, 500 K, 1000 K)',
    'pT(v) = MB_speed(v, Yb.m, Tov)',
    'p0(v) = MB_speed(v, Yb.m, 700 K)',
    '# 3. Several curves in one plot, with labels (or use the boxes under the plot)',
    'plot(pT, p0, 0 m/s, 1000 m/s, xlabel="Atom speed", ylabel="Probability density", title="Maxwell–Boltzmann speeds", legend="oven at Tov, 700 K")',
    '# 4. Measured points on top of a model (made-up numbers here)',
    'vd = [150, 250, 350, 450, 600] m/s',
    'nd = [1.8e-3, 3.3e-3, 2.5e-3, 1.4e-3, 0.5e-3] s/m',
    'plot(p0, points(vd, nd), 0 m/s, 1000 m/s, legend="model, measured")',
    '# 5. Curves with different units: the second kind gets the right-hand axis (dashed)',
    'Rs(d) = scatt_rate(1, d, Yb.Gamma399)',
    'Ls(d) = lorentz(d, 0 MHz, 29 MHz)',
    'plot(Rs, Ls, -2*pi*100 MHz, 2*pi*100 MHz, xlabel="Detuning")',
    '# 6. The transpose of a vector is a row',
    'u = [1, 2, 3]',
    "u'",
    "u' * u",
    '# 7. Equations tab → “＋ Add” on any folder to add your own equation',
    ''
  ];
  var DEFAULT_SETTINGS = { precision: 10, angle: 'rad', panelOpen: true, tab: 'yb', keypad: false, theme: 'auto', panelW: 420 };
  function freshState() {
    var a = { id: uid(), name: 'Welcome', lines: WELCOME.slice() };
    var b = { id: uid(), name: '3-photon (example)', lines: THREE.slice() };
    var c = { id: uid(), name: 'New features (example)', lines: NEWS.slice() };
    return { sheets: [a, b, c], active: a.id, news: 2, settings: Object.assign({}, DEFAULT_SETTINGS) };
  }
  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.sheets && s.sheets.length) {
        s.settings = Object.assign({}, DEFAULT_SETTINGS, s.settings || {});
        if (!s.sheets.some(function (x) { return x.id === s.active; })) s.active = s.sheets[0].id;
        return s;
      }
    } catch (e) { /* ignore */ }
    return freshState();
  }
  var state = loadState();
  if (!state.news) {       // existing worksheets: add the tour of the new features once, without switching to it
    state.news = 2;
    state.sheets.push({ id: uid(), name: 'New features (example)', lines: NEWS.slice() });
  }
  var saveT;
  function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full / disabled */ } }, 250); }
  function sheet() { for (var i = 0; i < state.sheets.length; i++) if (state.sheets[i].id === state.active) return state.sheets[i]; return state.sheets[0]; }

  // ---------- worksheet rows ----------
  var rowsEl = $('#rows');
  var rows = [];
  var results = [];
  var active = -1;
  var lastCaret = { i: -1, pos: 0 };
  var typingRow = -1, typingT = null;
  var hasPlots = false;

  function makeRow(text) {
    var R = {};
    R.el = el('div', 'row');
    var gut = el('div', 'gutter'); R.num = el('span', 'num'); gut.appendChild(R.num);
    var body = el('div', 'body');
    var expr = el('div', 'expr');
    R.view = el('div', 'view');
    R.ta = el('textarea', 'src');
    R.ta.rows = 1; R.ta.spellcheck = false; R.ta.setAttribute('autocapitalize', 'off'); R.ta.setAttribute('autocomplete', 'off'); R.ta.setAttribute('autocorrect', 'off');
    R.ta.value = text || '';
    R.preview = el('div', 'preview');
    expr.appendChild(R.view); expr.appendChild(R.ta); expr.appendChild(R.preview);
    var out = el('div', 'out'); R.result = el('div', 'result'); out.appendChild(R.result);
    R.msg = el('div', 'msg'); R.plot = el('div', 'plot'); R.slider = el('div', 'slider');
    R.plotCanvas = el('div', 'plot-canvas'); R.plotBar = el('div', 'plot-bar'); R.plot.appendChild(R.plotCanvas); R.plot.appendChild(R.plotBar);
    body.appendChild(expr); body.appendChild(out); body.appendChild(R.slider); body.appendChild(R.msg); body.appendChild(R.plot);
    R.del = el('button', 'del', '×'); R.del.title = 'Delete line'; R.del.tabIndex = -1;
    R.el.appendChild(gut); R.el.appendChild(body); R.el.appendChild(R.del);
    wireRow(R);
    return R;
  }
  function idx(R) { return rows.indexOf(R); }
  function renumber() { rows.forEach(function (R, i) { R.num.textContent = String(i + 1); }); }
  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(31, ta.scrollHeight) + 'px'; }

  function buildRows() {
    rowsEl.innerHTML = '';
    rows = [];
    var lines = sheet().lines;
    if (!lines.length) lines.push('');
    lines.forEach(function (t) { var R = makeRow(t); rows.push(R); rowsEl.appendChild(R.el); });
    renumber();
    active = -1;
    evaluateNow();
    rows.forEach(function (R) { autosize(R.ta); });
  }

  function wireRow(R) {
    var ta = R.ta;
    ta.addEventListener('input', function () {
      var i = idx(R);
      sheet().lines[i] = ta.value;
      autosize(ta);
      typingRow = i;
      clearTimeout(typingT);
      typingT = setTimeout(function () { typingRow = -1; refreshMessages(); }, 900);
      scheduleEval();
      AC.update(R);
      Sig.quiet = false; Sig.update(R);
      save();
    });
    ta.addEventListener('focus', function () { setActive(idx(R)); Sig.update(R); });
    ta.addEventListener('blur', function () {
      lastCaret = { i: idx(R), pos: ta.selectionStart };
      setTimeout(function () {
        if (document.activeElement !== ta) {
          R.el.classList.remove('focused');
          if (active === idx(R)) active = -1;
          var onRow = document.activeElement && document.activeElement.classList.contains('src');   // focus moved to another line
          if (!AC.hovering && !(onRow && AC.R !== R)) AC.hide();
          if (!onRow) Sig.hide();
          refreshMessages();
        }
      }, 120);
    });
    ta.addEventListener('keydown', function (e) { onKey(e, R); });
    ['keyup', 'click', 'select'].forEach(function (ev) { ta.addEventListener(ev, function (e) { lastCaret = { i: idx(R), pos: ta.selectionStart }; if (!(ev === 'keyup' && e.key === 'Escape')) Sig.update(R); }); });
    R.view.addEventListener('mousedown', function (e) {
      if (e.target.closest('a')) return;
      e.preventDefault();
      focusRow(idx(R), 'end');
    });
    R.result.addEventListener('click', function () { if (R.copyText) copy(R.copyText); });
    R.del.addEventListener('click', function () { deleteRow(idx(R)); });
  }

  function setActive(i) {
    rows.forEach(function (R, k) { R.el.classList.toggle('focused', k === i); });
    active = i;
    lastCaret.i = i;
    updatePreview(i);
    refreshMessages();
  }
  function focusRow(i, where) {
    var R = rows[i]; if (!R) return;
    R.ta.focus();
    var p = where === 'start' ? 0 : (typeof where === 'number' ? where : R.ta.value.length);
    R.ta.setSelectionRange(p, p);
    lastCaret = { i: i, pos: p };
    Sig.update(R);
  }
  function insertRow(at, text, focus) {
    var R = makeRow(text || '');
    sheet().lines.splice(at, 0, text || '');
    rows.splice(at, 0, R);
    rowsEl.insertBefore(R.el, rowsEl.children[at] || null);
    renumber();
    autosize(R.ta);
    save();
    scheduleEval();
    if (focus) focusRow(at, 'end');
    return R;
  }
  function setRowText(i, text) { rows[i].ta.value = text; sheet().lines[i] = text; autosize(rows[i].ta); }
  function deleteRow(i) {
    if (rows.length === 1) { setRowText(0, ''); scheduleEval(); save(); focusRow(0); return; }
    rows[i].el.remove(); rows.splice(i, 1); sheet().lines.splice(i, 1);
    renumber(); save(); scheduleEval();
    focusRow(Math.max(0, i - 1), 'end');
  }
  function moveRow(i, d) {
    var j = i + d; if (j < 0 || j >= rows.length) return;
    var L = sheet().lines, t = L[i]; L[i] = L[j]; L[j] = t;
    var R = rows[i]; rows[i] = rows[j]; rows[j] = R;
    if (d < 0) rowsEl.insertBefore(rows[j].el, rows[i].el); else rowsEl.insertBefore(rows[i].el, rows[j].el);
    renumber(); save(); scheduleEval(); focusRow(j, R.ta.selectionStart);
  }

  function lineHeight(ta) { return parseFloat(getComputedStyle(ta).lineHeight) || 22; }
  function singleLine(ta) { return ta.value.indexOf('\n') < 0 && ta.scrollHeight < lineHeight(ta) * 1.9 + 8; }

  function onKey(e, R) {
    var i = idx(R), ta = R.ta;
    var mod = e.metaKey || e.ctrlKey;
    if (AC.open) {
      if (e.key === 'ArrowDown') { AC.move(1); e.preventDefault(); return; }
      if (e.key === 'ArrowUp') { AC.move(-1); e.preventDefault(); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && AC.navigated)) { AC.accept(); e.preventDefault(); return; }
      if (e.key === 'Escape') { AC.hide(); e.preventDefault(); return; }
    }
    if (e.key === 'Escape' && Sig.open) { Sig.quiet = true; Sig.hide(); e.preventDefault(); return; }
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault(); AC.hide();
      var v = ta.value, s = ta.selectionStart, en = ta.selectionEnd;
      if (s === 0 && en === 0 && v.length) { insertRow(i, '', false); focusRow(i + 1, 0); return; }
      if (en < v.length) { setRowText(i, v.slice(0, s)); insertRow(i + 1, v.slice(en), false); focusRow(i + 1, 'start'); return; }
      insertRow(i + 1, '', true);
      return;
    }
    if (e.key === 'Backspace' && !mod && ta.selectionStart === 0 && ta.selectionEnd === 0 && i > 0) {
      e.preventDefault();
      var prev = rows[i - 1], pl = prev.ta.value.length;
      if (ta.value.length) setRowText(i - 1, prev.ta.value + ta.value);
      rows[i].el.remove(); rows.splice(i, 1); sheet().lines.splice(i, 1);
      renumber(); save(); scheduleEval();
      focusRow(i - 1, pl);
      return;
    }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); moveRow(i, e.key === 'ArrowUp' ? -1 : 1); return; }
    if (e.key === 'ArrowUp' && !e.shiftKey && (singleLine(ta) || ta.selectionStart === 0)) { if (i > 0) { e.preventDefault(); focusRow(i - 1, 'end'); } return; }
    if (e.key === 'ArrowDown' && !e.shiftKey && (singleLine(ta) || ta.selectionStart === ta.value.length)) { if (i < rows.length - 1) { e.preventDefault(); focusRow(i + 1, 'end'); } return; }
    if (mod && e.shiftKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); insertRow(i + 1, ta.value, true); return; }
    if (mod && e.shiftKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); deleteRow(i); return; }
    if (e.key === 'Escape') { ta.blur(); }
  }

  // ---------- evaluation & rendering ----------
  var evalT = null;
  function scheduleEval() { clearTimeout(evalT); evalT = setTimeout(evaluateNow, hasPlots ? 140 : 25); }
  function evaluateNow() {
    clearTimeout(evalT);
    var lines = sheet().lines;
    results = engine.evaluateSheet(lines, { precision: +state.settings.precision, angle: state.settings.angle });
    hasPlots = false;
    results.forEach(function (r, i) { if (rows[i]) applyResult(rows[i], r, i); if (r.kind === 'plot') hasPlots = true; });
    if (active >= 0) updatePreview(active);
    refreshMessages();
  }
  function applyResult(R, r, i) {
    var src = R.ta.value;
    R.el.classList.toggle('note', r.kind === 'note');
    // rendered expression (shown when the line is not being edited)
    var viewKey = r.kind + '|' + (r.exprTex || '') + '|' + (r.comment || '') + '|' + src;
    if (viewKey !== R.viewKey) {
      R.viewKey = viewKey;
      R.view.innerHTML = '';
      var ok = false;
      if (r.kind === 'note') { R.view.textContent = src.replace(/^\s*#\s?/, ''); ok = true; }
      else if (r.kind !== 'empty' && r.kind !== 'error' && r.exprTex) {
        var span = el('span');
        ok = tex(span, r.exprTex);
        if (ok) {
          R.view.appendChild(span);
          if (r.comment) R.view.appendChild(el('span', 'cmt', r.comment));
        }
      }
      R.el.classList.toggle('show-view', ok);
    }
    // result pill
    var resKey = r.kind + '|' + (r.tex || '') + '|' + (r.text || '');
    if (resKey !== R.resKey) {
      R.resKey = resKey;
      R.result.innerHTML = ''; R.result.className = 'result'; R.copyText = null; R.result.title = '';
      if (r.kind === 'value' || r.kind === 'assign') {
        if (!(r.tex && tex(R.result, r.tex))) R.result.textContent = prettyText(r.text);
        R.copyText = r.text; R.result.title = 'Click to copy:  ' + r.text;
      } else if (r.kind === 'function') {
        R.result.className = 'result fn'; R.result.textContent = r.text + ' defined';
      }
    }
    // plots
    if (r.kind === 'plot') {
      R.plot.classList.add('on');
      var key = sheet().lines.slice(0, i + 1).join('\n') + '|' + state.settings.angle + '|' + Math.round(R.plot.clientWidth / 20);
      if (key !== R.plotKey) { R.plotKey = key; R.plotErr = P.renderPlot(R.plotCanvas, r.plot, engine); }
      updatePlotBar(R, r.plot);
    } else if (R.plotKey !== null) {
      R.plot.classList.remove('on'); R.plotCanvas.innerHTML = ''; R.plotKey = null; R.plotErr = null;
    }
    updateSlider(R, r.slider);
    R.lastResult = r;
  }
  function refreshMessages() {
    rows.forEach(function (R, i) {
      var r = R.lastResult || {};
      var msg = '', info = false;
      var typing = (i === typingRow);
      if (r.kind === 'error' && !typing) msg = '⚠ ' + r.error;
      else if (r.kind === 'plot' && R.plotErr) msg = '⚠ ' + R.plotErr;
      else if (r.kind === 'assign' && r.name && engine.isCommonUnit(r.name) && !typing) { msg = '“' + r.name + '” is also a unit; from here on it means your variable.'; info = true; }
      R.el.classList.toggle('has-error', r.kind === 'error' && !typing);
      if (msg !== R.msgText) { R.msgText = msg; R.msg.textContent = msg; }
      R.msg.classList.toggle('on', !!msg);
      R.msg.classList.toggle('info', info);
    });
  }
  function updatePreview(i) {
    var R = rows[i]; if (!R) return;
    var r = results[i] || {};
    var t = r.exprTex || (r.kind === 'error' ? engine.exprTex(R.ta.value) : null);
    var show = !!t && r.kind !== 'note' && !/^\s*-?[\d.]+\s*$/.test(R.ta.value);
    if (show && t !== R.previewTex) { R.previewTex = t; show = tex(R.preview, t); }
    R.preview.classList.toggle('on', show);
  }

  // ---------- editing a call's arguments in the source text (plot toolbar, sliders) ----------
  function findCall(src, re) {          // -> { open, close } indexes of the call's parentheses
    var m = re.exec(src); if (!m) return null;
    var open = m.index + m[0].length - 1, depth = 0, inQ = false;
    for (var i = open; i < src.length; i++) {
      var ch = src[i];
      if (inQ) { if (ch === '"') inQ = false; continue; }
      if (ch === '"') inQ = true;
      else if (ch === '#') break;
      else if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') { depth--; if (depth === 0) return { open: open, close: i }; }
    }
    return null;
  }
  function splitArgs(s) {
    var out = [], depth = 0, inQ = false, start = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (inQ) { if (ch === '"') inQ = false; continue; }
      if (ch === '"') inQ = true;
      else if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 0) { out.push(s.slice(start, i).trim()); start = i + 1; }
    }
    var last = s.slice(start).trim(); if (last || out.length) out.push(last);
    return out;
  }
  var PLOT_FLAGS = ['logx', 'logy', 'log', 'zero', 'normalize', 'fine', 'lines'];
  function rewritePlotOption(src, key, value) {
    var call = findCall(src, /\b(plot(2d)?|heatmap)\s*\(/); if (!call) return src;
    var out = [];
    splitArgs(src.slice(call.open + 1, call.close)).forEach(function (a) {
      if (new RegExp('^' + key + '\\s*=(?!=)').test(a)) return;                       // the old value of this option
      var sm = /^"([^"]*)"$/.exec(a) || /^'([^']*)'$/.exec(a);                         // old-style flags: "logx logy"
      if (sm && sm[1].indexOf('=') < 0 && PLOT_FLAGS.indexOf(key) >= 0) {
        var words = sm[1].split(/[ ,]+/).filter(function (w) { return w && w !== key; });
        if (!words.length) return;
        a = '"' + words.join(' ') + '"';
      }
      out.push(a);
    });
    if (typeof value === 'boolean') { if (value) out.push(key + '=true'); }
    else { var v = String(value).replace(/["\\#]/g, '').replace(/^\s+/, ''); if (v.trim()) out.push(key + '="' + v + '"'); }
    return src.slice(0, call.open + 1) + out.join(', ') + src.slice(call.close);
  }
  function rewriteSliderValue(src, valueText) {
    var call = findCall(src, /\bslider\s*\(/); if (!call) return src;
    var args = splitArgs(src.slice(call.open + 1, call.close)); if (!args.length) return src;
    args[0] = valueText;
    return src.slice(0, call.open + 1) + args.join(', ') + src.slice(call.close);
  }
  function setRowSource(R, text) {
    var i = idx(R); if (i < 0 || text === R.ta.value) return;
    setRowText(i, text); scheduleEval(); save();
  }

  // ---------- plot toolbar: title, axis labels, legend, log axes, PNG ----------
  function buildPlotBar(R) {
    var bar = R.plotBar; bar._f = {};
    function text(key, ph, grow) {
      var inp = el('input', 'pb-in'); inp.type = 'text'; inp.placeholder = ph; inp.title = ph; inp.spellcheck = false; inp.style.flexGrow = grow || 1;
      inp.addEventListener('input', function () { setRowSource(R, rewritePlotOption(R.ta.value, key, inp.value)); });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === 'Escape') inp.blur(); });
      bar.appendChild(inp); bar._f[key] = inp;
    }
    function check(key, label, tip) {
      var lab = el('label', 'pb-ck'); var cb = el('input'); cb.type = 'checkbox'; lab.appendChild(cb); lab.appendChild(document.createTextNode(label)); lab.title = tip;
      cb.addEventListener('change', function () { setRowSource(R, rewritePlotOption(R.ta.value, cb._key || key, cb.checked)); });
      bar.appendChild(lab); bar._f[key] = cb; cb._lab = lab;
    }
    text('title', 'Title', 2); text('xlabel', 'x-axis label', 2); text('ylabel', 'y-axis label', 2); text('legend', 'Legend names: a, b', 3);
    check('logx', 'log x', 'Logarithmic x axis'); check('logy', 'log y', 'Logarithmic y axis'); check('normalize', 'normalize', 'Scale every curve to a peak of 1 to compare shapes');
    check('lines', 'join points', 'Draw data points as a connected line');
    var png = el('button', 'btn', 'Save PNG'); png.title = 'Download this plot as an image';
    png.addEventListener('click', function () {
      var cv = R.plotCanvas.querySelector('canvas'); if (!cv) return;
      var a = el('a'); a.href = cv.toDataURL('image/png');
      a.download = ((bar._f.title.value || 'plot').replace(/[^\w.-]+/g, '_') || 'plot') + '.png';
      document.body.appendChild(a); a.click(); a.remove();
    });
    bar.appendChild(png);
  }
  function updatePlotBar(R, spec) {
    var bar = R.plotBar;
    if (!bar._f) buildPlotBar(R);
    var o = spec.opts || {}, f = bar._f, is2d = spec.type === '2d', many = (spec.series || []).length > 1;
    ['title', 'xlabel', 'ylabel', 'legend'].forEach(function (k) {
      if (document.activeElement === f[k]) return;
      var v = o[k] === undefined ? '' : (k === 'legend' ? o.legend.join(', ') : String(o[k]));
      if (f[k].value !== v) f[k].value = v;
    });
    f.legend.style.display = is2d ? 'none' : '';
    f.legend.placeholder = many ? 'Legend names: a, b' : 'Legend name';
    f.logx.checked = !!o.logx; f.logx._lab.style.display = is2d ? 'none' : '';
    f.logy._key = is2d ? 'log' : 'logy'; f.logy.checked = !!(is2d ? o.log : o.logy);
    f.logy._lab.lastChild.textContent = is2d ? 'log colour' : 'log y';
    f.normalize.checked = !!o.normalize; f.normalize._lab.style.display = (!is2d && many) ? '' : 'none';
    f.lines.checked = !!o.lines; f.lines._lab.style.display = (!is2d && (spec.series || []).some(function (s) { return s.pts; })) ? '' : 'none';
  }

  // ---------- sliders:  a = slider(value, min, max[, step]) ----------
  function niceStepUI(span) { var raw = span / 100, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag; return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * mag; }
  function updateSlider(R, s) {
    var box = R.slider;
    if (!s) { if (box._on) { box.classList.remove('on'); box._on = false; } return; }
    if (!box._range) {
      box._lo = el('span', 'sl-end'); box._hi = el('span', 'sl-end');
      var rg = box._range = el('input'); rg.type = 'range';
      rg.addEventListener('input', function () {
        var v = +(+rg.value).toPrecision(10);
        setRowSource(R, rewriteSliderValue(R.ta.value, String(v) + (box._unit ? ' ' + box._unit : '')));
      });
      box.appendChild(box._lo); box.appendChild(rg); box.appendChild(box._hi);
    }
    box._unit = s.unit; box._on = true; box.classList.add('on');
    var step = s.step || niceStepUI(s.hi - s.lo), rg2 = box._range;
    if (+rg2.min !== s.lo) rg2.min = String(s.lo);
    if (+rg2.max !== s.hi) rg2.max = String(s.hi);
    if (rg2.step !== String(step)) rg2.step = String(step);
    if (document.activeElement !== rg2 && Math.abs(+rg2.value - s.value) > step * 1e-6) rg2.value = String(s.value);
    var u = s.unit ? ' ' + prettyUnit(s.unit) : '';
    box._lo.textContent = prettyNum(String(+s.lo.toPrecision(6))) + u; box._hi.textContent = prettyNum(String(+s.hi.toPrecision(6))) + u;
  }

  // ---------- inserting text from panel / keypad ----------
  function insertText(text, opts) {
    opts = opts || {};
    var i = lastCaret.i;
    if (i < 0 || i >= rows.length) {
      // append to the last line if empty, else a new line
      i = rows.length - 1;
      if (rows[i].ta.value.trim()) { insertRow(rows.length, '', false); i = rows.length - 1; }
      lastCaret = { i: i, pos: rows[i].ta.value.length };
    }
    var R = rows[i], ta = R.ta;
    var pos = Math.min(lastCaret.pos, ta.value.length);
    if (opts.space && pos > 0 && /[\w)\].]/.test(ta.value[pos - 1])) text = ' ' + text;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    var ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) { ta.setRangeText(text, pos, pos, 'end'); ta.dispatchEvent(new Event('input')); }
    var np = pos + text.length - (opts.back || 0);
    ta.setSelectionRange(np, np);
    lastCaret = { i: i, pos: np };
    AC.hide();
  }
  function insertLines(lines) {
    var at = (lastCaret.i >= 0 ? lastCaret.i : rows.length - 1);
    if (rows[at] && !rows[at].ta.value.trim()) { setRowText(at, lines[0]); lines = lines.slice(1); }
    else at = at + 1, insertRow(at, lines.shift(), false);
    lines.forEach(function (l) { at += 1; insertRow(at, l, false); });
    if (lastCaret.i < 0) at = rows.length - 1;
    evaluateNow();
    focusRow(Math.min(at, rows.length - 1), 'end');
    rows[Math.min(at, rows.length - 1)].el.scrollIntoView({ block: 'nearest' });
  }

  // ---------- autocomplete ----------
  var acEl = $('#ac');
  var KIND = { fn: 'fn', const: 'const', var: 'var', yb: 'Yb', obj: 'obj', data: 'data' };
  var AC = {
    open: false, items: [], sel: 0, navigated: false, R: null, start: 0, end: 0, hovering: false,
    update: function (R) {
      var ta = R.ta, pos = ta.selectionStart;
      if (pos !== ta.selectionEnd) return this.hide();
      var before = ta.value.slice(0, pos);
      if (/#/.test(before.replace(/"[^"]*"/g, ''))) return this.hide();      // inside a comment
      var m = before.match(/([A-Za-z_$][\w$]*(?:\.[\w$]*)?)$/);
      if (!m) return this.hide();
      var token = m[1];
      if (/\d$/.test(before.slice(0, before.length - token.length)) && token.indexOf('.') < 0 && token.length < 2) return this.hide();
      var items = engine.completions(token);
      if (!items.length) return this.hide();
      this.items = items; this.sel = 0; this.navigated = false; this.R = R;
      this.start = pos - token.length; this.end = pos; this.token = token;
      this.render();
      var xy = caretXY(ta, this.start);
      acEl.style.left = Math.max(8, Math.min(xy.x - 6, window.innerWidth - 540)) + 'px';
      var below = xy.y + 4;
      acEl.hidden = false; this.open = true;
      var h = acEl.offsetHeight;
      acEl.style.top = (below + h > window.innerHeight - 8 ? Math.max(8, xy.y - lineHeight(ta) - h - 4) : below) + 'px';
    },
    render: function () {
      var self = this, t = this.token.toLowerCase();
      acEl.innerHTML = '';
      this.items.forEach(function (it, k) {
        var d = el('div', 'it' + (k === self.sel ? ' sel' : ''));
        var nm = el('span', 'nm');
        var name = it.name, li = name.toLowerCase().indexOf(t.slice(t.lastIndexOf('.') + 1), name.lastIndexOf('.') + 1);
        if (t.indexOf('.') < 0) li = name.toLowerCase().indexOf(t);
        var tl = t.indexOf('.') < 0 ? t.length : t.length - t.lastIndexOf('.') - 1;
        var tail = it.kind === 'fn' ? '<span class="pr">' + esc(it.sig && it.sig.indexOf(name + '(') === 0 ? it.sig.slice(name.length) : '()') + '</span>' : '';
        if (li >= 0) nm.innerHTML = esc(name.slice(0, li)) + '<b>' + esc(name.slice(li, li + tl)) + '</b>' + esc(name.slice(li + tl)) + tail;
        else nm.innerHTML = esc(name) + tail;
        d.appendChild(nm);
        d.appendChild(el('span', 'kd', KIND[it.kind] || it.kind));
        if (it.desc) d.appendChild(el('span', 'ds', it.desc));
        d.addEventListener('mousedown', function (e) { e.preventDefault(); self.sel = k; self.accept(); });
        acEl.appendChild(d);
      });
      var f = el('div', 'foot'); f.textContent = 'Tab to insert · ↑↓ to choose · Esc to close'; acEl.appendChild(f);
    },
    move: function (d) {
      this.sel = (this.sel + d + this.items.length) % this.items.length; this.navigated = true; this.render();
      var s = acEl.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
    },
    accept: function () {
      var it = this.items[this.sel], R = this.R; if (!it || !R) return this.hide();
      var ta = R.ta, ins = it.insert || it.name, after = ta.value.slice(this.end);
      var fn = it.kind === 'fn' && after[0] !== '(';
      ta.focus(); ta.setSelectionRange(this.start, this.end);
      var text = ins + (fn ? '()' : '');
      var ok = false; try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
      if (!ok) { ta.setRangeText(text, this.start, this.end, 'end'); ta.dispatchEvent(new Event('input')); }
      var p = this.start + text.length - (fn ? 1 : 0);
      ta.setSelectionRange(p, p);
      this.hide();
      Sig.quiet = false; Sig.update(R);
    },
    hide: function () { this.open = false; acEl.hidden = true; this.items = []; }
  };
  // ---------- input hints: which inputs a function takes, shown while the caret is inside its (…) ----------
  var sigEl = $('#sig');
  function callContext(text, pos) {
    var stack = [], inQ = false;
    for (var i = 0; i < pos; i++) {
      var ch = text[i], top = stack[stack.length - 1];
      if (inQ) { if (ch === '"') inQ = false; continue; }
      if (ch === '"') inQ = true;
      else if (ch === '#') return [];
      else if (ch === '(') { var m = /([A-Za-z_$][\w$]*(?:\.[\w$]+)?)$/.exec(text.slice(0, i)); stack.push({ name: m ? m[1] : null, open: i, arg: 0, br: 0 }); }
      else if (ch === ')') stack.pop();
      else if ((ch === '[' || ch === '{') && top) top.br++;
      else if ((ch === ']' || ch === '}') && top) top.br--;
      else if (ch === ',' && top && top.br === 0) top.arg++;
    }
    return stack;
  }
  var Sig = {
    open: false, quiet: false,
    update: function (R) {
      if (this.quiet || document.activeElement !== R.ta) return this.hide();
      var ta = R.ta, pos = ta.selectionStart, text = ta.value;
      if (pos !== ta.selectionEnd) return this.hide();
      var stack = callContext(text, pos), fr = null, info = null;
      for (var k = stack.length - 1; k >= 0 && !info; k--) {
        if (!stack[k].name) continue;
        // the header of a definition, f(x, y) = …, is not a call
        if (k === 0 && new RegExp('^\\s*' + stack[k].name.replace(/[$.]/g, '\\$&') + '\\s*\\([^()]*\\)\\s*=(?!=)').test(text) && stack[k].open < text.indexOf('=')) continue;
        info = engine.signature(stack[k].name); fr = stack[k];
      }
      if (!info) return this.hide();
      var n = info.params.length, cur = fr.arg;
      if (info.variadic) cur = fr.arg === 0 ? 0 : -1; else if (cur >= n) cur = -2;
      var h = '<div class="sg-head"><span class="sg-fn">' + esc(info.name) + '</span>(' + info.params.map(function (p, i) { return '<span class="sg-p' + (i === cur ? ' cur' : '') + '">' + esc(p.name) + '</span>'; }).join(', ') + ')' +
        (info.returns ? '<span class="sg-ret">→ ' + esc(info.returns) + '</span>' : '') + '</div>';
      if (info.title) h += '<div class="sg-title">' + esc(info.title) + '</div>';
      var rowsH = info.params.filter(function (p) { return p.desc; }).length ? info.params.map(function (p, i) { return '<tr class="' + (i === cur ? 'cur' : '') + '"><td><code>' + esc(p.name) + '</code></td><td>' + esc(p.desc || '') + '</td></tr>'; }).join('') : '';
      if (rowsH) h += '<table class="sg-args">' + rowsH + '</table>';
      if (cur === -2) h += '<div class="sg-warn">This function takes ' + n + ' input' + (n === 1 ? '' : 's') + '.</div>';
      if (info.notes) h += '<div class="sg-note">' + esc(info.notes) + '</div>';
      if (h !== this.html) { this.html = h; sigEl.innerHTML = h; }
      sigEl.hidden = false; this.open = true;
      var xy = caretXY(ta, fr.open + 1), lh = lineHeight(ta), hh = sigEl.offsetHeight, ww = sigEl.offsetWidth;
      var top = xy.y - lh - hh - 8;
      if (top < 50) { top = xy.y + 6; if (AC.open) top = Math.max(top, acEl.getBoundingClientRect().bottom + 6); }
      sigEl.style.left = Math.max(8, Math.min(xy.x - 14, window.innerWidth - ww - 8)) + 'px';
      sigEl.style.top = top + 'px';
    },
    hide: function () { if (this.open) { this.open = false; sigEl.hidden = true; } }
  };
  $('#sheet-pane').addEventListener('scroll', function () { if (Sig.open && rows[active]) Sig.update(rows[active]); });
  acEl.addEventListener('mouseenter', function () { AC.hovering = true; });
  acEl.addEventListener('mouseleave', function () { AC.hovering = false; });
  function caretXY(ta, pos) {
    var cs = getComputedStyle(ta), div = el('div');
    ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingLeft', 'paddingRight', 'paddingBottom', 'boxSizing', 'wordBreak'].forEach(function (p) { div.style[p] = cs[p]; });
    div.style.position = 'absolute'; div.style.visibility = 'hidden'; div.style.whiteSpace = 'pre-wrap'; div.style.top = '0'; div.style.left = '-9999px';
    div.style.width = ta.clientWidth + 'px';
    div.textContent = ta.value.slice(0, pos);
    var span = el('span', null, ta.value.slice(pos) || '.'); div.appendChild(span);
    document.body.appendChild(div);
    var r = ta.getBoundingClientRect();
    var out = { x: r.left + span.offsetLeft, y: r.top + span.offsetTop + (parseFloat(cs.lineHeight) || 22) + (parseFloat(cs.paddingTop) || 0) };
    div.remove();
    return out;
  }

  // ---------- header controls ----------
  function buildSheetSelect() {
    var s = $('#sheet-select'); s.innerHTML = '';
    state.sheets.forEach(function (sh) { var o = el('option', null, sh.name); o.value = sh.id; if (sh.id === state.active) o.selected = true; s.appendChild(o); });
  }
  $('#sheet-select').addEventListener('change', function () { state.active = this.value; save(); buildRows(); focusRow(rows.length - 1); });
  $('#sheet-new').addEventListener('click', function () {
    var n = 1; while (state.sheets.some(function (s) { return s.name === 'Sheet ' + n; })) n++;
    var sh = { id: uid(), name: 'Sheet ' + n, lines: [''] };
    state.sheets.push(sh); state.active = sh.id; save(); buildSheetSelect(); buildRows(); focusRow(0);
  });
  var menu = $('#sheet-menu');
  $('#sheet-menu-btn').addEventListener('click', function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
  menu.addEventListener('click', function (e) {
    var act = e.target.getAttribute('data-act'); if (!act) return;
    menu.hidden = true;
    var sh = sheet();
    if (act === 'rename') { var n = window.prompt('Worksheet name', sh.name); if (n && n.trim()) { sh.name = n.trim(); save(); buildSheetSelect(); } }
    else if (act === 'duplicate') { var d = { id: uid(), name: sh.name + ' copy', lines: sh.lines.slice() }; state.sheets.push(d); state.active = d.id; save(); buildSheetSelect(); buildRows(); }
    else if (act === 'export') {
      var blob = new Blob([sh.lines.join('\n')], { type: 'text/plain' });
      var a = el('a'); a.href = URL.createObjectURL(blob); a.download = sh.name.replace(/[^\w.-]+/g, '_') + '.txt'; document.body.appendChild(a); a.click(); a.remove();
    }
    else if (act === 'import') $('#import-file').click();
    else if (act === 'clear') { if (window.confirm('Clear every line of “' + sh.name + '”?')) { sh.lines = ['']; save(); buildRows(); focusRow(0); } }
    else if (act === 'delete') {
      if (window.confirm('Delete worksheet “' + sh.name + '”?')) {
        state.sheets = state.sheets.filter(function (s) { return s.id !== sh.id; });
        if (!state.sheets.length) state.sheets.push({ id: uid(), name: 'Sheet 1', lines: [''] });
        state.active = state.sheets[0].id; save(); buildSheetSelect(); buildRows();
      }
    }
  });
  $('#import-file').addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var sh = { id: uid(), name: f.name.replace(/\.txt$/i, ''), lines: String(rd.result).replace(/\r/g, '').split('\n') };
      state.sheets.push(sh); state.active = sh.id; save(); buildSheetSelect(); buildRows();
    };
    rd.readAsText(f); this.value = '';
  });

  function applySettings() {
    var st = state.settings;
    $$('#angle-seg button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === st.angle); });
    $('#precision').value = String(st.precision);
    document.body.classList.toggle('panel-hidden', !st.panelOpen);
    $('#panel-btn').classList.toggle('on', st.panelOpen);
    $('#keypad').hidden = !st.keypad;
    $('#keypad-btn').classList.toggle('on', st.keypad);
    document.documentElement.setAttribute('data-theme', st.theme);
    $('#theme-btn').title = 'Theme: ' + st.theme + ' (click to change)';
    document.documentElement.style.setProperty('--panel-w', Math.max(300, Math.min(900, st.panelW || 420)) + 'px');
  }
  $$('#angle-seg button').forEach(function (b) {
    b.addEventListener('click', function () { state.settings.angle = b.getAttribute('data-v'); save(); applySettings(); evaluateNow(); });
  });
  $('#precision').addEventListener('change', function () { state.settings.precision = +this.value; save(); evaluateNow(); });
  $('#panel-btn').addEventListener('click', function () { state.settings.panelOpen = !state.settings.panelOpen; save(); applySettings(); rerenderPlots(); });
  $('#keypad-btn').addEventListener('click', function () { state.settings.keypad = !state.settings.keypad; save(); applySettings(); });
  $('#theme-btn').addEventListener('click', function () {
    var order = ['auto', 'light', 'dark']; state.settings.theme = order[(order.indexOf(state.settings.theme) + 1) % 3];
    save(); applySettings(); rerenderPlots(); toast('Theme: ' + state.settings.theme);
  });
  $('#add-row').addEventListener('click', function () {
    var last = rows[rows.length - 1];
    if (last && !last.ta.value.trim()) focusRow(rows.length - 1); else insertRow(rows.length, '', true);
  });
  // splitter
  (function () {
    var sp = $('#splitter'), dragging = false;
    sp.addEventListener('mousedown', function (e) { dragging = true; e.preventDefault(); document.body.style.cursor = 'col-resize'; });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      state.settings.panelW = Math.max(300, Math.min(900, window.innerWidth - e.clientX));
      document.documentElement.style.setProperty('--panel-w', state.settings.panelW + 'px');
    });
    window.addEventListener('mouseup', function () { if (dragging) { dragging = false; document.body.style.cursor = ''; save(); rerenderPlots(); } });
  })();
  function rerenderPlots() { rows.forEach(function (R) { R.plotKey = undefined; }); evaluateNow(); }
  var rsT; window.addEventListener('resize', function () { clearTimeout(rsT); rsT = setTimeout(rerenderPlots, 200); });

  // global shortcuts
  document.addEventListener('keydown', function (e) {
    var mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === 'k' || e.key === 'K') && !e.shiftKey) {
      e.preventDefault();
      if (!state.settings.panelOpen) { state.settings.panelOpen = true; applySettings(); }
      if (['yb', 'const', 'eq'].indexOf(state.settings.tab) < 0) showTab('eq');
      $('#panel-search').focus(); $('#panel-search').select();
    }
    if (mod && e.key === '\\') { e.preventDefault(); $('#panel-btn').click(); }
    if (mod && e.key === ';') { e.preventDefault(); $('#keypad-btn').click(); }
  });

  // ---------- side panel ----------
  var TABS = {};
  function showTab(name) {
    state.settings.tab = name; save();
    $$('#tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === name); });
    $$('#panel-body .tab').forEach(function (t) { t.classList.toggle('on', t.id === 'tab-' + name); });
    document.body.classList.toggle('no-search', !(TABS[name] && TABS[name].filter));
    if (TABS[name] && TABS[name].filter) TABS[name].filter($('#panel-search').value);
    if (TABS[name] && TABS[name].show) TABS[name].show();
  }
  $$('#tabs button').forEach(function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); }); });
  $('#panel-search').addEventListener('input', function () { var t = TABS[state.settings.tab]; if (t && t.filter) t.filter(this.value); });
  $('#panel-search').addEventListener('keydown', function (e) { if (e.key === 'Escape') { this.value = ''; this.dispatchEvent(new Event('input')); focusRow(lastCaret.i >= 0 ? lastCaret.i : rows.length - 1, lastCaret.pos); } });

  function section(title, count, open) {
    var d = el('details', 'sec'); if (open) d.open = true;
    var s = el('summary'); s.appendChild(el('span', null, title)); if (count !== undefined) s.appendChild(el('span', 'count', String(count)));
    d.appendChild(s);
    return d;
  }
  function itemRow(o) {
    var d = el('div', 'item');
    var sym = el('div', 'sym'); if (!(o.tex && tex(sym, o.tex))) sym.textContent = o.name;
    var info = el('div', 'info');
    var l1 = el('div', 'l1'); l1.appendChild(el('code', null, o.label || o.name));
    var val = el('span', 'val', o.val || ''); val.title = o.val || ''; l1.appendChild(val);
    info.appendChild(l1);
    if (o.desc) { var ds = el('div', 'ds'); ds.textContent = o.desc; if (o.tag) ds.appendChild(el('span', 'tag', o.tag)); info.appendChild(ds); }
    if (o.src) info.appendChild(el('div', 'src', o.src));
    d.appendChild(sym); d.appendChild(info);
    d.title = 'Click to insert ' + (o.insert || o.name);
    d.addEventListener('click', function () { insertText(o.insert || o.name, { back: o.back || 0 }); });
    d._search = ((o.label || o.name) + ' ' + (o.desc || '') + ' ' + (o.src || '') + ' ' + (o.extra || '')).toLowerCase();
    return d;
  }
  function filterSections(root, q) {
    q = (q || '').trim().toLowerCase();
    var words = q.split(/\s+/).filter(Boolean);
    $$('details.sec', root).forEach(function (sec) {
      var n = 0;
      $$('.item, .eq', sec).forEach(function (it) {
        var ok = words.every(function (w) { return it._search.indexOf(w) >= 0; });
        it.style.display = ok ? '' : 'none'; if (ok) n++;
      });
      sec.style.display = n || !q ? '' : 'none';
      if (q) { if (!sec._wasOpen) sec._wasOpen = sec.open ? 'y' : 'n'; sec.open = n > 0; }
      else if (sec._wasOpen) { sec.open = sec._wasOpen === 'y'; sec._wasOpen = null; }
    });
  }

  // ---- ¹⁷⁴Yb tab ----
  (function buildYb() {
    var root = $('#tab-yb');
    var Y = engine.yb;
    if (!Y) { root.textContent = 'Yb data failed to load: ' + engine.errors.join('; '); return; }
    var intro = el('div', 'sec-note');
    intro.innerHTML = 'Click any value to insert <code>Yb.&lt;name&gt;</code>. Γ, ω are angular (s⁻¹); γ, ν are cyclic (Hz). Lifetimes, branching ratios and matrix elements are electronic properties (same for ¹⁷¹Yb and ¹⁷⁴Yb at this precision). Edit <code>data/yb174.js</code> to change a number.';
    root.appendChild(intro);
    Y.sections.forEach(function (s, si) {
      var sec = section(s.title, s.items.length, si < 2);
      if (s.id === '649') {
        var n = el('div', 'sec-note'); n.textContent = 'Three-photon resonance: ν₅₅₆ + ν₆₈₀ − ν₆₄₉ = ν₅₇₈. The 680/649 frequencies come from NIST level energies, so use Yb.D_3P1_3P0 with your measured 680 frequency.';
        sec.appendChild(n);
      }
      s.items.forEach(function (it) {
        var v = Y.object[it.key], val;
        if (typeof v === 'function') val = 'Yb.' + it.key + '(T)';
        else if (it.v !== undefined) val = prettyText(it.v.replace(/ au_d$/, ' ea₀').replace(/\bamu\b/, 'u'));
        else { var f = engine.fmtValue(v, 8); val = prettyText(f.text); }
        if (it.unc) val += '  ± ' + it.unc;
        sec.appendChild(itemRow({
          name: 'Yb.' + it.key, label: 'Yb.' + it.key, tex: it.tex, val: val, desc: it.desc, src: it.src && it.src !== 'derived' ? it.src : '',
          insert: typeof v === 'function' ? 'Yb.' + it.key + '()' : 'Yb.' + it.key, back: typeof v === 'function' ? 1 : 0, extra: s.title
        }));
      });
      root.appendChild(sec);
    });
    // dipole table
    var dt = Y.dipoleTable, sec = section('Reduced E1 matrix elements (ea₀)', undefined, false);
    var wrap = el('div', 'dip-wrap'), t = el('table', 'dip');
    var hr = el('tr'); hr.appendChild(el('th', null, 'even ↓ / odd →')); dt.cols.forEach(function (c) { hr.appendChild(el('th', null, c)); }); t.appendChild(hr);
    dt.rows.forEach(function (r) { var tr = el('tr'); r.forEach(function (c, k) { tr.appendChild(el(k ? 'td' : 'th', null, String(c))); }); t.appendChild(tr); });
    wrap.appendChild(t); sec.appendChild(wrap);
    var src = el('div', 'sec-note', dt.src); sec.appendChild(src);
    sec._noFilter = true;
    root.appendChild(sec);
    TABS.yb = { filter: function (q) { filterSections(root, q); } };
  })();

  // ---- Constants tab ----
  (function buildConst() {
    var root = $('#tab-const');
    var groups = {}, order = [];
    engine.codata.forEach(function (k) {
      if (!groups[k.group]) { groups[k.group] = []; order.push(k.group); }
      var val = prettyNum(String(k.value)) + (k.unit ? ' ' + prettyUnit(k.unit) : '');
      groups[k.group].push({ name: k.name, tex: k.tex, val: val, desc: k.desc, tag: k.exact ? 'exact' : (k.unc ? '± ' + prettyNum(k.unc.toPrecision(2)) : ''), src: '' });
    });
    if ((P.userConstants || []).length) {
      order.push('My constants (data/user_constants.js)');
      groups['My constants (data/user_constants.js)'] = P.userConstants.map(function (u) {
        var v = engine.base.get(u.name);
        return { name: u.name, tex: u.tex, val: v !== undefined ? prettyText(engine.fmtValue(v, 8).text) : '—', desc: u.desc };
      });
    }
    order.push('Math');
    groups.Math = [
      { name: 'pi', tex: '\\pi', val: '3.14159265358979', desc: 'π' }, { name: 'e', tex: 'e', val: '2.71828182845905', desc: "Euler's number (charge is qe)" },
      { name: 'i', tex: 'i', val: '√−1', desc: 'Imaginary unit' }, { name: 'tau', tex: '\\tau', val: '6.28318530717959', desc: '2π' },
      { name: 'phi', tex: '\\phi', val: '1.61803398874989', desc: 'Golden ratio' }, { name: 'Infinity', tex: '\\infty', val: '∞', desc: 'Infinity' }
    ];
    order.forEach(function (gname, gi) {
      var sec = section(gname, groups[gname].length, gi < 2);
      groups[gname].forEach(function (o) { sec.appendChild(itemRow(o)); });
      root.appendChild(sec);
    });
    // units chips
    var us = section('Units (click to insert)', undefined, false);
    var UNITS = [
      ['Length', 'nm um mm cm m km angstrom'], ['Time', 'fs ps ns us ms s minute hour'], ['Frequency', 'Hz kHz MHz GHz THz'],
      ['Temperature', 'nK uK mK K degC'], ['Energy', 'J mJ uJ eV meV keV'], ['Power', 'nW uW mW W kW'], ['Intensity', 'mW/cm^2 W/cm^2 W/m^2'],
      ['Magnetic', 'mG G kG T mT uT'], ['Pressure', 'Pa mbar torr Torr mTorr atm psi'], ['Electric', 'A mA V mV ohm kohm F uF nF pF H mH uH'],
      ['Mass', 'amu kg g mg'], ['Angle', 'rad mrad deg'], ['Other', 'L mol cm^-1 m^-3 cm^-3']
    ];
    UNITS.forEach(function (u) {
      var row = el('div', 'item'); row.style.gridTemplateColumns = '86px 1fr';
      row.appendChild(el('div', 'ds', u[0]));
      var box = el('div', 'btn-row');
      u[1].split(' ').forEach(function (n) {
        var b = el('button', 'btn', prettyUnit(n)); b.style.fontFamily = 'var(--mono)';
        b.addEventListener('click', function (e) { e.stopPropagation(); insertText(n, { space: true }); });
        box.appendChild(b);
      });
      row.appendChild(box); row._search = (u[0] + ' ' + u[1]).toLowerCase(); row.style.cursor = 'default';
      us.appendChild(row);
    });
    var note = el('div', 'sec-note'); note.innerHTML = 'Convert with <code>to</code>: <code>5 mW/(pi*(1 mm)^2) to mW/cm^2</code>. <code>G</code> is gauss here; Newton’s constant is <code>G_N</code>. µ can be typed as <code>u</code> (<code>uK</code>, <code>um</code>).';
    us.appendChild(note);
    root.appendChild(us);
    TABS.const = { filter: function (q) { filterSections(root, q); } };
  })();

  // ---- Equations tab ----
  var EQ_ORDER = ['AMO & laser cooling', 'Optics & lasers', 'Quantum', 'Thermal, vacuum & radiation', 'Electromagnetism & coils', 'Lab MOT coils', 'Opto-optical trap (OOT)', 'Functions, lineshapes & numerics', 'My equations'];
  function eqCategories() {
    var cats = [];
    engine.equations.forEach(function (e) { if (cats.indexOf(e.cat) < 0) cats.push(e.cat); });
    if (cats.indexOf('My equations') < 0) cats.push('My equations');
    cats.sort(function (a, b) { var ia = EQ_ORDER.indexOf(a), ib = EQ_ORDER.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    return cats;
  }
  function buildEq(openCat, focusKey) {
    var root = $('#tab-eq');
    var wasOpen = {}; $$('details.sec', root).forEach(function (sec) { wasOpen[sec._cat] = sec.open; });
    if (openCat) wasOpen[openCat] = true;
    root.innerHTML = '';
    var intro = el('div', 'sec-note');
    intro.innerHTML = 'Every equation is a function you can call on any line, with units. <b>Try</b> inserts a worked example. Use <b>＋ Add</b> on a folder to put your own equation in it.';
    root.appendChild(intro);
    var top = el('div', 'eq-top');
    var bNew = el('button', 'btn primary', '＋ New equation'); bNew.addEventListener('click', function () { openEqDialog({ cat: 'My equations' }); });
    var bFolder = el('button', 'btn', '＋ New folder'); bFolder.title = 'A folder appears once it holds an equation';
    bFolder.addEventListener('click', function () { openEqDialog({ cat: '' }, true); });
    top.appendChild(bNew); top.appendChild(bFolder); root.appendChild(top);
    var byCat = {};
    engine.equations.forEach(function (e) { (byCat[e.cat] = byCat[e.cat] || []).push(e); });
    var focusCard = null;
    eqCategories().forEach(function (c) {
      var list = byCat[c] || [];
      var sec = section(c, list.length, !!wasOpen[c]); sec._cat = c;
      var sm = sec.querySelector('summary');
      var add = el('button', 'sec-add', '＋ Add'); add.title = 'Add an equation to “' + c + '”';
      add.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); openEqDialog({ cat: c }); });
      sm.insertBefore(add, sm.querySelector('.count'));
      var addRow = el('button', 'eq-add', '＋ Add an equation to this folder');
      addRow.addEventListener('click', function () { openEqDialog({ cat: c }); });
      sec.appendChild(addRow);
      list.forEach(function (e) {
        var card = el('div', 'eq' + (e.custom ? ' custom' : ''));
        var head = el('div', 'head');
        head.appendChild(el('span', 'nm', e.name || e.id || '(untitled)'));
        var sig = el('code', 'sig', e.sig); sig.title = 'Insert ' + e.id + '(…)';
        sig.addEventListener('click', function () { if (!e.id) return; if (e.params) insertText(e.id + '()', { back: 1 }); else insertText(e.id); });
        head.appendChild(sig);
        if (e.custom) head.appendChild(el('span', 'tag', 'added'));
        card.appendChild(head);
        var tx = el('div', 'tx'); card.appendChild(tx); card._tx = tx; card._tex = e.tex || e.autoTex;
        if (e.error) card.appendChild(el('div', 'eq-err', '⚠ ' + e.error));
        if (e.args && Object.keys(e.args).length) {
          var a = el('div', 'args');
          a.innerHTML = Object.keys(e.args).filter(function (k) { return !e.custom || e.args[k]; }).map(function (k) { return '<code>' + esc(k) + '</code>' + (e.args[k] ? ' ' + esc(e.args[k]) : ''); }).join(' · ');
          if (a.innerHTML) card.appendChild(a);
        }
        if (e.returns) card.appendChild(el('div', 'ret', '→ ' + e.returns));
        if (e.notes) card.appendChild(el('div', 'nt', e.notes));
        var acts = el('div', 'acts');
        if (!e.error) {
          var bi = el('button', 'btn', 'Insert'); bi.addEventListener('click', function () { if (e.params) insertText(e.id + '()', { back: 1 }); else insertText(e.id); });
          acts.appendChild(bi);
        }
        if (e.example && !e.error) {
          var bt = el('button', 'btn primary', 'Try'); bt.title = e.example + (e.also ? '\n' + e.also.join('\n') : '');
          bt.addEventListener('click', function () { insertLines([e.example].concat(e.also || [])); });
          acts.appendChild(bt);
        }
        if (e.custom) {
          var be = el('button', 'btn', 'Edit'); be.addEventListener('click', function () { openEqDialog(customByKey(e.key) || e); });
          var bd = el('button', 'btn danger', 'Delete'); bd.addEventListener('click', function () { deleteCustom(e); });
          acts.appendChild(el('span', 'grow')); acts.appendChild(be); acts.appendChild(bd);
        }
        card.appendChild(acts);
        card._search = ((e.name || '') + ' ' + e.sig + ' ' + (e.returns || '') + ' ' + (e.notes || '') + ' ' + c + ' ' + Object.keys(e.args || {}).map(function (k) { return k + ' ' + e.args[k]; }).join(' ')).toLowerCase();
        if (focusKey && e.key === focusKey) focusCard = card;
        sec.appendChild(card);
      });
      sec.addEventListener('toggle', function () { if (sec.open) renderEqTex(sec); });
      if (sec.open) renderEqTex(sec);
      root.appendChild(sec);
    });
    function renderEqTex(sec) { $$('.eq', sec).forEach(function (card) { if (!card._done && card.style.display !== 'none') { card._done = true; if (card._tex) tex(card._tx, card._tex, true); } }); }
    TABS.eq = { filter: function (q) { filterSections(root, q); $$('details.sec', root).forEach(function (sec) { if (sec.open) renderEqTex(sec); }); } };
    if (state.settings.tab === 'eq' && $('#panel-search').value) TABS.eq.filter($('#panel-search').value);
    if (focusCard) { focusCard.scrollIntoView({ block: 'center' }); focusCard.classList.add('flash'); setTimeout(function () { focusCard.classList.remove('flash'); }, 1600); }
  }
  function customByKey(key) { for (var i = 0; i < customList.length; i++) if (customList[i].key === key) return customList[i]; return null; }
  function persistCustom(quiet) {
    var FIELDS = ['key', 'name', 'def', 'tex', 'args', 'returns', 'example', 'notes', 'cat'];
    var list = customList.map(function (e) { var o = {}; FIELDS.forEach(function (k) { if (e[k] !== undefined && e[k] !== '') o[k] = e[k]; }); return o; });
    function remember(dirty) { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify({ dirty: dirty, list: list })); } catch (e) { /* storage disabled */ } }
    remember(true);
    if (!/^https?:$/.test(location.protocol) || !window.fetch) { if (!quiet) toast('Saved in this browser (start the PhysCalc server to save to a file)'); return; }
    fetch('api/custom-equations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equations: list }) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); remember(false); if (!quiet) toast('Saved to equations/custom_equations.js'); })
      .catch(function () { if (!quiet) toast('Saved in this browser only — re-run install.sh to update the server'); });
  }
  function deleteCustom(e) {
    if (!window.confirm('Delete “' + (e.name || e.sig) + '”?')) return;
    engine.removeCustomEquation(e.key);
    customList = customList.filter(function (c) { return c.key !== e.key; });
    persistCustom(); buildEq(); evaluateNow();
  }

  // ---- add / edit equation dialog ----
  var eqDlg = null;
  function openEqDialog(entry, newFolder) {
    if (!eqDlg) eqDlg = buildEqDialog();
    eqDlg.open(entry || {}, newFolder);
  }
  function buildEqDialog() {
    var dlg = el('dialog', 'eq-dlg');
    dlg.innerHTML = [
      '<form method="dialog" autocomplete="off">',
      '<h3 id="eqd-h">Add an equation</h3>',
      '<label>Folder<input type="text" id="eqd-cat" list="eqd-cats" placeholder="e.g. Optics & lasers, or type a new folder name"><datalist id="eqd-cats"></datalist></label>',
      '<label>Title<input type="text" id="eqd-name" placeholder="e.g. Lattice depth in recoils"></label>',
      '<label>Equation <span class="hint">name(inputs) = formula, in calculator syntax</span>',
      '<input type="text" id="eqd-def" class="mono" spellcheck="false" placeholder="U_Er(P, w) = lattice_U0(P, w, Yb.alpha759)/Yb.Er759"></label>',
      '<div id="eqd-status" class="eqd-status"></div>',
      '<div id="eqd-prev" class="eqd-prev"></div>',
      '<div id="eqd-args"></div>',
      '<label>Result <span class="hint">what comes out / its unit (optional)</span><input type="text" id="eqd-ret" placeholder="e.g. dimensionless, or W/m²"></label>',
      '<label>Example <span class="hint">a line the “Try” button inserts (optional)</span><input type="text" id="eqd-ex" class="mono" spellcheck="false" placeholder="U_Er(1 W, 100 um)"></label>',
      '<div id="eqd-exout" class="eqd-status"></div>',
      '<details class="eqd-more"><summary>More: custom LaTeX, notes</summary>',
      '<label>LaTeX shown on the card <span class="hint">leave empty to typeset the equation automatically</span><input type="text" id="eqd-tex" class="mono" spellcheck="false" placeholder="U_0/E_r"></label>',
      '<label>Notes<input type="text" id="eqd-notes" placeholder="assumptions, reference, …"></label>',
      '</details>',
      '<div class="eqd-btns"><button type="button" class="btn" id="eqd-cancel">Cancel</button><button type="button" class="btn primary" id="eqd-save">Save equation</button></div>',
      '</form>'
    ].join('');
    document.body.appendChild(dlg);
    var f = {}; ['h', 'cat', 'cats', 'name', 'def', 'status', 'prev', 'args', 'ret', 'ex', 'exout', 'tex', 'notes', 'cancel', 'save'].forEach(function (k) { f[k] = $('#eqd-' + k, dlg); });
    var editing = null, argVals = {}, chk = null, t = null;
    function check() {
      chk = engine.checkEquation(f.def.value, f.ex.value, editing ? editing.fnName : null);
      var has = f.def.value.trim();
      f.status.className = 'eqd-status' + (!has ? '' : chk.ok ? ' ok' : ' bad');
      f.status.textContent = !has ? '' : chk.ok ? ('✓ ' + chk.name + '(' + chk.params.join(', ') + ')' + (chk.warnings.length ? '   ·   note: ' + chk.warnings.join('; ') : '')) : '⚠ ' + chk.error;
      var tx = f.tex.value.trim() || (chk.ok ? chk.tex : '');
      f.prev.style.display = tx && tex(f.prev, tx, true) ? '' : 'none';
      // one description box per input
      var params = chk.params || [];
      $$('input', f.args).forEach(function (inp) { argVals[inp._p] = inp.value; });
      var sigNow = params.join(',');
      if (f.args._sig !== sigNow) {
        f.args._sig = sigNow; f.args.innerHTML = '';
        if (params.length) f.args.appendChild(el('div', 'eqd-argh', 'Inputs — say what each one is (shown in the hints while typing)'));
        params.forEach(function (p) {
          var row = el('div', 'eqd-arg'); row.appendChild(el('code', null, p));
          var inp = el('input'); inp.type = 'text'; inp._p = p; inp.value = argVals[p] || ''; inp.placeholder = 'description, e.g. power per beam';
          row.appendChild(inp); f.args.appendChild(row);
        });
      }
      var exv = f.ex.value.trim();
      f.exout.className = 'eqd-status' + (!exv || !chk.ok ? '' : chk.exampleError ? ' bad' : ' ok');
      f.exout.textContent = !exv || !chk.ok ? '' : chk.exampleError ? '⚠ example: ' + chk.exampleError : '= ' + prettyText(chk.exampleText || '');
      f.save.disabled = !(chk.ok && f.cat.value.trim());
    }
    function later() { clearTimeout(t); t = setTimeout(check, 120); }
    [f.def, f.ex, f.tex, f.cat].forEach(function (inp) { inp.addEventListener('input', later); });
    f.cancel.addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); if ((e.metaKey || e.ctrlKey) && !f.save.disabled) f.save.click(); } });
    f.save.addEventListener('click', function () {
      check(); if (!chk.ok || !f.cat.value.trim()) return;
      $$('input', f.args).forEach(function (inp) { argVals[inp._p] = inp.value; });
      var args = {}; chk.params.forEach(function (p) { args[p] = (argVals[p] || '').trim(); });
      var entry = { key: editing ? editing.key : 'eq_' + uid(), name: f.name.value.trim() || chk.name, def: f.def.value.trim(), tex: f.tex.value.trim(), args: args,
        returns: f.ret.value.trim(), example: chk.exampleError ? '' : f.ex.value.trim(), notes: f.notes.value.trim(), cat: f.cat.value.trim() };
      var old = editing ? customByKey(editing.key) : null;
      try {
        if (editing) engine.removeCustomEquation(editing.key);
        engine.addCustomEquation(entry);
      } catch (err) {
        if (old) { try { engine.addCustomEquation(old); } catch (e2) { /* keep going */ } }
        f.status.className = 'eqd-status bad'; f.status.textContent = '⚠ ' + err.message; return;
      }
      if (old) customList[customList.indexOf(old)] = entry; else customList.push(entry);
      dlg.close();
      persistCustom();
      if (!state.settings.panelOpen) { state.settings.panelOpen = true; applySettings(); }
      showTab('eq'); buildEq(entry.cat, entry.key); evaluateNow();
    });
    return {
      open: function (e, newFolder) {
        editing = e.key ? { key: e.key, fnName: (e.def && /^\s*([A-Za-z_]\w*)\s*\(/.exec(e.def) || [])[1] || null } : null;
        f.h.textContent = editing ? 'Edit equation' : newFolder ? 'New folder — add its first equation' : 'Add an equation';
        f.save.textContent = editing ? 'Save changes' : 'Save equation';
        f.cats.innerHTML = ''; eqCategories().forEach(function (c) { var o = el('option'); o.value = c; f.cats.appendChild(o); });
        f.cat.value = e.cat || ''; f.name.value = e.key ? (e.name || '') : ''; f.def.value = e.def || ''; f.ret.value = e.returns || '';
        f.ex.value = e.example || ''; f.tex.value = e.tex || ''; f.notes.value = e.notes || '';
        argVals = Object.assign({}, e.args || {}); f.args._sig = null; f.args.innerHTML = '';
        $('.eqd-more', dlg).open = !!(e.tex || e.notes);
        check();
        if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
        (newFolder ? f.cat : (f.cat.value ? f.name : f.cat)).focus();
      }
    };
  }
  buildEq();
  if (customDirtyAtBoot) persistCustom(true);      // changes from last time that never reached the file

  // ---- Matrix tab ----
  (function buildMatrix() {
    var root = $('#tab-matrix');
    var st = { r: 2, c: 2, name: 'M', cells: [['1', '0'], ['0', '1']] };
    var box = el('div', 'box'); box.appendChild(el('h4', null, 'Matrix builder'));
    var dims = el('div', 'mx-dims');
    dims.innerHTML = 'Name <input type="text" id="mx-name" value="M"> rows <input type="number" id="mx-r" min="1" max="10" value="2"> cols <input type="number" id="mx-c" min="1" max="10" value="2">';
    box.appendChild(dims);
    var grid = el('div', 'mx-grid'); box.appendChild(grid);
    var br = el('div', 'btn-row');
    var bIns = el('button', 'btn primary', 'Insert into sheet'), bId = el('button', 'btn', 'Identity'), bZero = el('button', 'btn', 'Zeros');
    br.appendChild(bIns); br.appendChild(bId); br.appendChild(bZero);
    box.appendChild(br);
    var h = el('div', 'hint'); h.style.marginTop = '8px'; h.innerHTML = 'Cells accept expressions: <code>1/sqrt(2)</code>, <code>-i</code>, <code>2 MHz</code>, <code>cos(30 deg)</code>.'; box.appendChild(h);
    root.appendChild(box);

    var pbox = el('div', 'box'); pbox.appendChild(el('h4', null, 'Load a preset into the grid'));
    var prow = el('div', 'mx-dims');
    var sel = el('select');
    [['sx', 'Pauli σx'], ['sy', 'Pauli σy'], ['sz', 'Pauli σz'], ['Had', 'Hadamard'], ['identity(N)', 'Identity N×N'], ['Jx(N)', 'Spin Jx(j)'], ['Jy(N)', 'Spin Jy(j)'], ['Jz(N)', 'Spin Jz(j)'],
      ['Jp(N)', 'Spin J₊(j)'], ['a_op(N)', 'Annihilation a (n)'], ['adag(N)', 'Creation a† (n)'], ['rotm(N)', 'Rotation R(θ)'], ['jones_hwp(N)', 'Half-wave plate (θ)'],
      ['jones_qwp(N)', 'Quarter-wave plate (θ)'], ['H2(1, N)', 'Two-level H (Ω=1, Δ)']].forEach(function (p) { var o = el('option', null, p[1]); o.value = p[0]; sel.appendChild(o); });
    var par = el('input'); par.type = 'text'; par.value = '1'; par.style.width = '80px'; par.title = 'Parameter (j, n, θ, Δ …)';
    var bLoad = el('button', 'btn', 'Load');
    prow.appendChild(sel); prow.appendChild(el('span', 'hint', 'param')); prow.appendChild(par); prow.appendChild(bLoad);
    pbox.appendChild(prow);
    root.appendChild(pbox);

    var obox = el('div', 'box'); obox.appendChild(el('h4', null, 'Operations on the named matrix (insert a line)'));
    var orow = el('div', 'btn-row');
    [['eig', 'eig(M)'], ['diagonalize', 'diagonalize(M)'], ['eigvals', 'eigvals(M)'], ['eigvecs', 'eigvecs(M)'], ['det', 'det(M)'], ['inv', 'inv(M)'], ['trace', 'trace(M)'], ['transpose', 'transpose(M)'],
      ['dagger', 'dagger(M)'], ['M²', 'M^2'], ['M·M', 'M * M'], ['expm', 'expm(M)'], ['expm(-iMt)', 'evolve(M, 1)'], ['norm', 'norm(M)'], ['rank / size', 'size(M)'], ['M ⊗ M', 'kron(M, M)'], ['M·v', 'M * [1, 0]']]
      .forEach(function (o) { var b = el('button', 'btn', o[0]); b.addEventListener('click', function () { var n = $('#mx-name').value.trim() || 'M'; insertLines([o[1].replace(/\bM\b/g, n)]); }); orow.appendChild(b); });
    obox.appendChild(orow);
    var cheat = el('div', 'hint'); cheat.style.marginTop = '10px';
    cheat.innerHTML = 'Syntax: <code>[[1, 2], [3, 4]]</code> (rows) · <code>[1, 2, 3]</code> column vector · <code>A * B</code> matrix product · <code>A .* B</code> elementwise · <code>A\'</code> transpose (a vector becomes a row) · <code>dagger(A)</code> conjugate transpose · <code>A[i, j]</code> element, <code>A[0]</code> first column, <code>A[[0]]</code> first row (0-based; <code>-1</code> = last, <code>0:2</code> = slice) · <code>diagonalize(A)</code> gives A = P D P⁻¹ · <code>magnitude(v)</code> length · <code>kron(A, B)</code> / <code>tensor(A, B, C)</code> · <code>comm(A, B)</code> · <code>lusolve(A, b)</code> solves Ax = b · eigenvectors are normalized columns with a real, positive largest component.';
    obox.appendChild(cheat);
    root.appendChild(obox);

    function drawGrid() {
      grid.innerHTML = ''; grid.style.gridTemplateColumns = 'repeat(' + st.c + ', minmax(40px, 1fr))';
      for (var i = 0; i < st.r; i++) for (var j = 0; j < st.c; j++) {
        (function (i, j) {
          var inp = el('input'); inp.type = 'text'; inp.value = (st.cells[i] && st.cells[i][j] !== undefined) ? st.cells[i][j] : '0';
          inp.addEventListener('input', function () { st.cells[i][j] = inp.value; });
          grid.appendChild(inp);
        })(i, j);
      }
    }
    function resize(r, c) {
      st.r = Math.max(1, Math.min(10, r)); st.c = Math.max(1, Math.min(10, c));
      var n = []; for (var i = 0; i < st.r; i++) { n.push([]); for (var j = 0; j < st.c; j++) n[i].push(st.cells[i] && st.cells[i][j] !== undefined ? st.cells[i][j] : '0'); }
      st.cells = n; $('#mx-r').value = st.r; $('#mx-c').value = st.c; drawGrid();
    }
    $('#mx-r', box).addEventListener('change', function () { resize(+this.value, st.c); });
    $('#mx-c', box).addEventListener('change', function () { resize(st.r, +this.value); });
    bId.addEventListener('click', function () { for (var i = 0; i < st.r; i++) for (var j = 0; j < st.c; j++) st.cells[i][j] = i === j ? '1' : '0'; drawGrid(); });
    bZero.addEventListener('click', function () { for (var i = 0; i < st.r; i++) for (var j = 0; j < st.c; j++) st.cells[i][j] = '0'; drawGrid(); });
    bIns.addEventListener('click', function () {
      var n = $('#mx-name').value.trim() || 'M';
      var body = '[' + st.cells.map(function (r) { return '[' + r.map(function (c) { return c.trim() || '0'; }).join(', ') + ']'; }).join(', ') + ']';
      insertLines([n + ' = ' + body]);
    });
    bLoad.addEventListener('click', function () {
      var expr = sel.value.replace('N', par.value.trim() || '1');
      try {
        var v = math.evaluate(engine.preprocess(expr), engine.lastScope());
        var a = math.isMatrix(v) ? v.valueOf() : v;
        if (!Array.isArray(a) || !Array.isArray(a[0])) throw new Error('not a matrix');
        st.cells = a.map(function (r) { return r.map(function (x) { return engine.fmtValue(x, 6).text.replace(/ /g, ''); }); });
        resize(a.length, a[0].length);
      } catch (e) { toast('Could not load preset: ' + e.message); }
    });
    drawGrid();
    TABS.matrix = {};
  })();

  // ---- Data tab: upload .csv / .npy / .npz, use the columns by name, plot them ----
  var dataSets = [];       // { name, file, cols: [{ name, shape, data }], notes }
  (function buildDataTab() {
    var root = $('#tab-data'), D = P.dataFiles;
    var box = el('div', 'box'); box.appendChild(el('h4', null, 'Data files'));
    var drop = el('div', 'drop');
    drop.innerHTML = '<b>Drop a file here</b> or <button class="btn primary" type="button">Choose a file…</button><div class="hint">.csv, .txt, .tsv, .dat (columns of numbers, with or without a header row) · NumPy .npy · .npz</div>';
    var pick = el('input'); pick.type = 'file'; pick.accept = '.csv,.txt,.tsv,.dat,.npy,.npz,text/csv,text/plain'; pick.multiple = true; pick.hidden = true;
    box.appendChild(drop); box.appendChild(pick);
    var hint = el('div', 'hint'); hint.style.marginTop = '8px';
    hint.innerHTML = 'Each file becomes a name whose columns you can use on any line: <code>scan.signal</code>, <code>scan.freq MHz</code>, <code>max(scan.signal)</code>. Files are kept in this browser, on this computer.';
    box.appendChild(hint);
    root.appendChild(box);
    var listEl = el('div'); root.appendChild(listEl);
    drop.querySelector('button').addEventListener('click', function () { pick.click(); });
    pick.addEventListener('change', function () { addFiles(pick.files); pick.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { window.addEventListener(ev, function (e) {
      if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
      e.preventDefault(); drop.classList.add('over');
    }); });
    ['dragleave', 'drop'].forEach(function (ev) { window.addEventListener(ev, function () { drop.classList.remove('over'); }); });
    window.addEventListener('drop', function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      e.preventDefault(); addFiles(e.dataTransfer.files);
    });

    function freeName(base) {
      var n = base, k = 2;
      while (!engine.nameAvailable(n)) n = base + (/\d$/.test(base) ? '_' : '') + (k++);
      return n;
    }
    function addFiles(files) {
      Array.prototype.slice.call(files).forEach(function (file) {
        if (file.size > 200 * 1024 * 1024) { toast(file.name + ' is larger than 200 MB'); return; }
        file.arrayBuffer().then(function (buf) { return D.parseFile(file.name, buf); }).then(function (parsed) {
          var name = freeName(D.ident(file.name.replace(/\.[^.]+$/, ''), 'data'));
          var rec = { name: name, file: file.name, cols: parsed.cols, notes: parsed.notes, added: Date.now() };
          engine.setDataset(name, rec.cols, rec.file);
          dataSets.push(rec);
          D.save(rec).catch(function () { toast('Loaded, but this browser could not store the file for next time'); });
          if (!state.settings.panelOpen) { state.settings.panelOpen = true; applySettings(); }
          showTab('data'); render(name); evaluateNow();
          toast('Loaded ' + file.name + ' as ' + name);
        }).catch(function (err) { toast('Could not read ' + file.name + ': ' + (err && err.message || err)); showTab('data'); lastError(file.name, err); });
      });
    }
    function lastError(fname, err) {
      var d = el('div', 'box data-err'); d.textContent = '⚠ ' + fname + ': ' + (err && err.message || err);
      listEl.insertBefore(d, listEl.firstChild); setTimeout(function () { d.remove(); }, 15000);
    }
    function range(c) {
      var lo = Infinity, hi = -Infinity, nan = 0;
      for (var i = 0; i < c.data.length; i++) { var v = c.data[i]; if (v !== v) { nan++; continue; } if (v < lo) lo = v; if (v > hi) hi = v; }
      return lo === Infinity ? 'no numbers' : prettyNum(String(+lo.toPrecision(4))) + ' … ' + prettyNum(String(+hi.toPrecision(4))) + (nan ? '  (' + nan + ' NaN)' : '');
    }
    function render(flash) {
      listEl.innerHTML = '';
      if (!dataSets.length) { listEl.appendChild(el('div', 'sec-note', 'No files loaded yet.')); return; }
      dataSets.slice().reverse().forEach(function (ds) {
        var card = el('div', 'box data-set' + (ds.name === flash ? ' flash' : ''));
        var head = el('div', 'ds-head');
        var nm = el('code', 'ds-name', ds.name); nm.title = 'Click to insert'; nm.addEventListener('click', function () { insertText(ds.name); });
        head.appendChild(nm); head.appendChild(el('span', 'hint', ds.file));
        var bRen = el('button', 'btn', 'Rename'), bDel = el('button', 'btn danger', 'Remove');
        head.appendChild(el('span', 'grow')); head.appendChild(bRen); head.appendChild(bDel);
        card.appendChild(head);
        var one = ds.cols.filter(function (c) { return c.shape.length === 1; }), two = ds.cols.filter(function (c) { return c.shape.length === 2; });
        var tb = el('table', 'ds-cols');
        ds.cols.forEach(function (c) {
          var tr = el('tr'), ref = ds.name + '.' + c.name;
          var td = el('td'); var cd = el('code', null, ref); cd.title = 'Click to insert ' + ref; cd.addEventListener('click', function () { insertText(ref); }); td.appendChild(cd);
          tr.appendChild(td); tr.appendChild(el('td', null, c.shape.length === 2 ? c.shape[0] + ' × ' + c.shape[1] : c.shape[0] + ' values')); tr.appendChild(el('td', null, range(c)));
          tb.appendChild(tr);
        });
        card.appendChild(tb);
        if (ds.notes && ds.notes.length) card.appendChild(el('div', 'hint', 'Note: ' + ds.notes.join('; ')));
        if (one.length) {
          var pr = el('div', 'ds-plot');
          var sx = el('select'), sy = el('select');
          var o0 = el('option', null, 'row number'); o0.value = ''; sx.appendChild(o0);
          one.forEach(function (c) { var a = el('option', null, c.name); a.value = c.name; sx.appendChild(a); var b = el('option', null, c.name); b.value = c.name; sy.appendChild(b); });
          if (one.length > 1) { sx.value = one[0].name; sy.value = one[1].name; }
          var ck = el('label', 'pb-ck'); var cb = el('input'); cb.type = 'checkbox'; cb.checked = one[0].shape[0] > 300; ck.appendChild(cb); ck.appendChild(document.createTextNode('join points'));
          var bp = el('button', 'btn primary', 'Plot');
          bp.addEventListener('click', function () {
            var y = sy.value, x = sx.value;
            if (x && customLen(ds, x) !== customLen(ds, y)) { toast(x + ' and ' + y + ' have different lengths'); return; }
            insertLines(['plot(points(' + (x ? ds.name + '.' + x + ', ' : '') + ds.name + '.' + y + '), xlabel="' + (x || 'row') + '", ylabel="' + y + '"' + (cb.checked ? ', lines=true' : '') + ')']);
          });
          pr.appendChild(el('span', 'hint', 'x')); pr.appendChild(sx); pr.appendChild(el('span', 'hint', 'y')); pr.appendChild(sy); pr.appendChild(ck); pr.appendChild(bp);
          card.appendChild(pr);
        }
        two.forEach(function (c) {
          var hr = el('div', 'ds-plot');
          var bh = el('button', 'btn primary', 'Heat map of ' + c.name);
          bh.addEventListener('click', function () { insertLines(['heatmap(' + ds.name + '.' + c.name + ', title="' + ds.name + '.' + c.name + '")']); });
          hr.appendChild(bh); hr.appendChild(el('span', 'hint', c.shape[0] + ' rows × ' + c.shape[1] + ' columns; row 1 at the bottom'));
          card.appendChild(hr);
        });
        bDel.addEventListener('click', function () {
          if (!window.confirm('Remove “' + ds.name + '” (' + ds.file + ')? Lines that use it will show an error.')) return;
          engine.removeDataset(ds.name); dataSets.splice(dataSets.indexOf(ds), 1); D.remove(ds.name).catch(function () {});
          render(); evaluateNow();
        });
        bRen.addEventListener('click', function () {
          var n = window.prompt('New name (letters, digits, _). Lines using “' + ds.name + '.” must be updated by hand.', ds.name);
          if (!n || n === ds.name) return;
          n = n.trim();
          if (!engine.nameAvailable(n)) { toast('“' + n + '” is not available — it is used already or is not a valid name'); return; }
          var old = ds.name;
          engine.removeDataset(old); D.remove(old).catch(function () {});
          ds.name = n; engine.setDataset(n, ds.cols, ds.file); D.save(ds).catch(function () {});
          render(n); evaluateNow();
        });
        listEl.appendChild(card);
      });
    }
    function customLen(ds, colName) { for (var i = 0; i < ds.cols.length; i++) if (ds.cols[i].name === colName) return ds.cols[i].shape[0]; return -1; }
    render();
    TABS.data = {};
    // files stored from earlier sessions
    D.loadAll().then(function (recs) {
      (recs || []).sort(function (a, b) { return (a.added || 0) - (b.added || 0); }).forEach(function (rec) {
        try { engine.setDataset(rec.name, rec.cols, rec.file); dataSets.push(rec); } catch (e) { /* name now taken: leave it stored but unloaded */ }
      });
      if (dataSets.length) { render(); evaluateNow(); }
    }).catch(function () { /* storage unavailable: uploads still work for this session */ });
  })();

  // ---- Convert tab ----
  (function buildConvert() {
    var root = $('#tab-convert');
    var b1 = el('div', 'box'); b1.appendChild(el('h4', null, 'Spectroscopy converter'));
    var in1 = el('div', 'cv-in'); var q = el('input'); q.type = 'text'; q.value = '398.911 nm'; q.placeholder = 'e.g. 556 nm, 518.3 THz, 17288 cm^-1, 2.1 eV, 700 uK';
    in1.appendChild(q); b1.appendChild(in1);
    var tb = el('table', 'cv-table'); b1.appendChild(tb);
    var hint1 = el('div', 'hint'); hint1.textContent = 'Type a wavelength, frequency, wavenumber, energy or temperature. Click a value to insert it.'; b1.appendChild(hint1);
    root.appendChild(b1);
    var b2 = el('div', 'box'); b2.appendChild(el('h4', null, 'Unit conversion'));
    var in2 = el('div', 'cv-in'); var fr = el('input'); fr.type = 'text'; fr.value = '20 mW/(pi*(1.5 mm)^2)'; var to = el('input'); to.type = 'text'; to.value = 'mW/cm^2'; to.style.maxWidth = '120px';
    in2.appendChild(fr); in2.appendChild(el('span', 'hint', 'to')); in2.appendChild(to); b2.appendChild(in2);
    var out2 = el('div', 'cv-out'); b2.appendChild(out2);
    var hint2 = el('div', 'hint'); hint2.style.marginTop = '6px'; hint2.textContent = 'Any expression works, including your worksheet variables and Yb.* values. Click the result to copy.'; b2.appendChild(hint2);
    root.appendChild(b2);
    var C = engine.C;
    function conv() {
      tb.innerHTML = '';
      var v;
      try { v = math.evaluate(engine.preprocess(q.value), engine.lastScope()); } catch (e) { tb.innerHTML = '<tr><td colspan=2>' + esc(e.message) + '</td></tr>'; return; }
      if (!math.isUnit(v)) { tb.innerHTML = '<tr><td colspan=2>Give a value with a unit (nm, THz, cm^-1, eV, K …)</td></tr>'; return; }
      var E;
      try {
        if (v.equalBase(math.unit('m'))) E = math.divide(math.multiply(C.h, C.c), v);
        else if (v.equalBase(math.unit('Hz'))) E = math.multiply(C.h, v);
        else if (v.equalBase(math.unit('m^-1'))) E = math.multiply(math.multiply(C.h, C.c), v);
        else if (v.equalBase(math.unit('J'))) E = v;
        else if (v.equalBase(math.unit('K'))) E = math.multiply(C.kB, math.unit(v.toNumber('K'), 'K'));
        else { tb.innerHTML = '<tr><td colspan=2>Unit not recognised as λ, ν, 1/λ, E or T</td></tr>'; return; }
      } catch (e) { tb.innerHTML = '<tr><td colspan=2>' + esc(e.message) + '</td></tr>'; return; }
      var EJ = E.toNumber('J'), h = C.h.toNumber('J s'), c = C.c.toNumber('m/s'), kB = C.kB.toNumber('J/K'), eV = 1.602176634e-19;
      var nu = EJ / h;
      var rowsC = [
        ['Wavelength (vacuum)', c / nu * 1e9, 'nm'], ['Frequency', nu / 1e12, 'THz'], ['Frequency', nu / 1e9, 'GHz'],
        ['Angular frequency ω', 2 * Math.PI * nu, 's^-1'], ['Wavenumber', nu / c / 100, 'cm^-1'], ['Energy', EJ / eV, 'eV'],
        ['Energy', EJ / eV * 1e3, 'meV'], ['Energy', EJ, 'J'], ['Temperature E/k_B', EJ / kB, 'K'], ['Period', 1 / nu * 1e15, 'fs']
      ];
      rowsC.forEach(function (r) {
        var tr = el('tr'); tr.appendChild(el('td', null, r[0]));
        var s = Math.abs(r[1]) >= 1e-4 && Math.abs(r[1]) < 1e10 ? String(+r[1].toPrecision(10)) : r[1].toExponential(8).replace(/\.?0+e/, 'e');
        var td = el('td', 'v', prettyNum(s) + ' ' + prettyUnit(r[2])); td.title = 'Insert ' + s + ' ' + r[2];
        td.addEventListener('click', function () { insertText(s + ' ' + r[2], { space: true }); });
        tr.appendChild(td); tb.appendChild(tr);
      });
    }
    function conv2() {
      try {
        var v = math.evaluate(engine.preprocess(fr.value), engine.lastScope());
        var res = to.value.trim() ? math.to(v, to.value.trim()) : v;
        var f = engine.fmtValue(res, +state.settings.precision);
        out2.textContent = prettyText(f.text); out2._t = f.text;
      } catch (e) { out2.textContent = e.message; out2._t = null; }
    }
    out2.addEventListener('click', function () { if (out2._t) copy(out2._t); });
    q.addEventListener('input', conv); fr.addEventListener('input', conv2); to.addEventListener('input', conv2);
    TABS.convert = { show: function () { conv(); conv2(); } };
  })();

  // ---- Help tab ----
  (function buildHelp() {
    var root = $('#tab-help'); root.className += ' help';
    root.innerHTML = [
      '<h3>Typing</h3><table>',
      '<tr><td>3 nm * 2</td><td>units attach to numbers; implicit multiplication works (<code>2 pi r</code>)</td></tr>',
      '<tr><td>x = 5 mm</td><td>define a variable (used on every line below)</td></tr>',
      '<tr><td>f(x, y) = x^2 + y</td><td>define a function</td></tr>',
      '<tr><td>h*c/(399 nm) to eV</td><td>convert units with <code>to</code></td></tr>',
      '<tr><td>ans, $3</td><td>previous result; result of line 3</td></tr>',
      '<tr><td># text</td><td>a note line; text after <code>#</code> on a line is a comment</td></tr>',
      '<tr><td>sin(30 deg)</td><td>angles: radians, or attach <code>deg</code>; the RAD/DEG switch changes bare numbers</td></tr>',
      '<tr><td>2 + 3i, sqrt(-1)</td><td>complex numbers</td></tr>',
      '</table>',
      '<h3>Physics conventions</h3><ul>',
      '<li>Hz and s⁻¹ are the same unit to the calculator: keep track of 2π yourself. Here Γ, Ω, Δ, ω are <b>angular</b> (shown as s⁻¹) and ν, f, γ are <b>cyclic</b> (Hz). Write detunings as <code>2*pi*15 MHz</code>.</li>',
      '<li><code>G</code> is gauss (Newton’s constant is <code>G_N</code>), <code>qe</code> is the elementary charge (<code>e</code> is Euler’s number), <code>u</code> means micro (<code>uK</code>, <code>um</code>); <code>µ</code> also works.</li>',
      '<li>A variable with a unit’s name (<code>s</code>, <code>m</code>, <code>K</code>, <code>T</code>…) hides that unit on later lines; you get a note when that happens.</li>',
      '<li><code>450 degC</code> (or <code>450 °C</code>) is an absolute temperature, converted to 723.15 K before any arithmetic; use K for temperature differences.</li>',
      '<li>Results pick a sensible prefix automatically; add <code>to unit</code> to choose.</li></ul>',
      '<h3>Matrices & quantum</h3><table>',
      '<tr><td>M = [[1, 2], [3, 4]]</td><td>matrix (row by row); <code>[1, 0]</code> is a vector</td></tr>',
      '<tr><td>eig(M)</td><td>eigenvalues + normalized eigenvectors (columns)</td></tr>',
      '<tr><td>eigvals(M), eigvecs(M)</td><td>just one or the other</td></tr>',
      '<tr><td>A * B, inv(A), det(A), A\'</td><td>product, inverse, determinant, transpose</td></tr>',
      '<tr><td>v\', v\' * w, v * w\'</td><td>a vector’s transpose is a row; row × vector is a number, vector × row is the outer product</td></tr>',
      '<tr><td>dagger(A), kron(A, B), expm(A)</td><td>conjugate transpose, tensor product, matrix exponential</td></tr>',
      '<tr><td>sx, sy, sz, Jx(1), a_op(5)</td><td>Pauli / spin / ladder operators (ħ = 1)</td></tr>',
      '<tr><td>clebsch(…), w3j(…), w6j(…)</td><td>angular-momentum coupling</td></tr>',
      '</table>',
      '<h3>Plots & numerics</h3><table>',
      '<tr><td>plot(f, 0, 10)</td><td>plot a 1-variable function</td></tr>',
      '<tr><td>plot(f, g, h, 0, 10)</td><td>overlay several curves to compare them (legend, shared hover read-out). Curves with different units get a second axis on the right (dashed)</td></tr>',
      '<tr><td>plot(f, 0, 10, xlabel="Detuning", ylabel="Rate", title="…")</td><td>label the axes; the unit is appended for you. The boxes under each plot do the same thing</td></tr>',
      '<tr><td>legend="cold, hot" · y2label="…"</td><td>names for the curves · label for the right axis</td></tr>',
      '<tr><td>logx=true · logy=true · zero=true</td><td>log axes · include y = 0</td></tr>',
      '<tr><td>normalize=true</td><td>scale every curve to a peak of 1 (compare shapes)</td></tr>',
      '<tr><td>ymin=0, ymax=5 mW</td><td>fix the y range</td></tr>',
      '<tr><td>d = points([1, 2, 3] MHz, [4, 5, 6])</td><td>measured data; overlay it with <code>plot(f, d, 0 MHz, 4 MHz)</code> or plot it alone with <code>plot(d)</code></td></tr>',
      '<tr><td>plot2d(g, -1, 1, -1, 1)</td><td>heat map of g(x, y); takes xlabel, ylabel, title, log=true too</td></tr>',
      '<tr><td>Data tab</td><td>upload a .csv, .npy or .npz file; its columns become <code>name.column</code> and the tab’s <b>Plot</b> button writes the plot line for you</td></tr>',
      '<tr><td>plot(points(scan.x, scan.y), lines=true)</td><td>plot uploaded columns (joined by a line); add a model function before it to overlay</td></tr>',
      '<tr><td>heatmap(img.data)</td><td>colour map of a 2-D array; <code>heatmap(M, xmin, xmax, ymin, ymax)</code> sets the axes</td></tr>',
      '<tr><td>coil_B(x, y, z, I)</td><td>field of the lab MOT coils anywhere (vector, G); also coil_Bz, coil_Bmag, coil_grad_z</td></tr>',
      '<tr><td>a = slider(2 mm, 0.5 mm, 5 mm)</td><td>a variable with a slider (value, min, max[, step]); everything below follows as you drag</td></tr>',
      '<tr><td>integrate(f, a, b)</td><td>numerical integral (with units)</td></tr>',
      '<tr><td>findroot(f, a, b)</td><td>solve f(x) = 0 between a and b</td></tr>',
      '<tr><td>nderiv(f, x)</td><td>numerical derivative</td></tr>',
      '</table>',
      '<h3>Keyboard</h3><table>',
      '<tr><td><kbd>Enter</kbd></td><td>new line (splits the line at the cursor)</td></tr>',
      '<tr><td><kbd>Tab</kbd></td><td>accept the autocomplete suggestion</td></tr>',
      '<tr><td><kbd>(</kbd></td><td>inside a function’s brackets a hint lists its inputs; <kbd>Esc</kbd> hides it</td></tr>',
      '<tr><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>move between lines</td></tr>',
      '<tr><td><kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd></td><td>move the line up / down</td></tr>',
      '<tr><td><kbd>' + MOD + '</kbd><kbd>⇧</kbd><kbd>D</kbd> / <kbd>' + MOD + '</kbd><kbd>⇧</kbd><kbd>K</kbd></td><td>duplicate / delete line</td></tr>',
      '<tr><td><kbd>' + MOD + '</kbd><kbd>K</kbd></td><td>search the panel</td></tr>',
      '<tr><td><kbd>' + MOD + '</kbd><kbd>\\</kbd> · <kbd>' + MOD + '</kbd><kbd>;</kbd></td><td>toggle panel · toggle keypad</td></tr>',
      '</table>',
      '<h3>Your files</h3><ul>',
      '<li><b>Equations tab → ＋ Add</b>: add an equation to any folder from a form. They are saved in <code>equations/custom_equations.js</code>; copy that file to share them.</li>',
      '<li><code>equations/my_equations.js</code>: equations written by hand (copy the example entry).</li>',
      '<li><code>data/user_constants.js</code>: add constants.</li>',
      '<li><code>data/yb174.js</code>: every ¹⁷⁴Yb number, with sources.</li>',
      '<li>Worksheets are saved in this browser automatically; use ⋯ → Export to save a .txt.</li></ul>',
      '<p class="hint">Engine: math.js ' + esc(math.version) + ' · KaTeX ' + esc(katex.version) + ' · CODATA 2022 constants.</p>'
    ].join('');
    TABS.help = {};
  })();

  // ---------- keypad ----------
  (function buildKeypad() {
    var kp = $('#keypad');
    var ROWS = [
      ['', [['√', 'sqrt()', 1], ['x²', '^2'], ['xʸ', '^'], ['π', 'pi'], ['e', 'e'], ['i', 'i'], ['ħ', 'hbar'], ['k_B', 'kB'], ['c', 'c'], ['(', '('], [')', ')'], ['[', '['], [']', ']'], [',', ', '], ['×10ⁿ', 'e'], ['to', ' to ']]],
      ['', [['sin', 'sin()', 1], ['cos', 'cos()', 1], ['tan', 'tan()', 1], ['asin', 'asin()', 1], ['acos', 'acos()', 1], ['atan', 'atan()', 1], ['exp', 'exp()', 1], ['ln', 'ln()', 1], ['log₁₀', 'log10()', 1], ['|x|', 'abs()', 1], ['n!', '!'], ['eig', 'eig()', 1], ['det', 'det()', 1], ['inv', 'inv()', 1], ['⊗', 'kron(, )', 3], ['A†', 'dagger()', 1]]],
      ['units', [['nm', 'nm', 0, 1], ['µm', 'um', 0, 1], ['mm', 'mm', 0, 1], ['cm', 'cm', 0, 1], ['kHz', 'kHz', 0, 1], ['MHz', 'MHz', 0, 1], ['GHz', 'GHz', 0, 1], ['THz', 'THz', 0, 1], ['µK', 'uK', 0, 1], ['mK', 'mK', 0, 1], ['K', 'K', 0, 1], ['mW', 'mW', 0, 1], ['W', 'W', 0, 1], ['G', 'G', 0, 1], ['eV', 'eV', 0, 1], ['°', 'deg', 0, 1]]]
    ];
    ROWS.forEach(function (r) {
      var row = el('div', 'kr');
      row.appendChild(el('span', 'lbl', r[0]));
      r[1].forEach(function (k) {
        var b = el('button', k[3] ? 'u' : '', k[0]);
        b.addEventListener('mousedown', function (e) { e.preventDefault(); });
        b.addEventListener('click', function () { insertText(k[1], { back: k[2] || 0, space: !!k[3] }); });
        row.appendChild(b);
      });
      kp.appendChild(row);
    });
  })();

  // ---------- boot ----------
  applySettings();
  buildSheetSelect();
  buildRows();
  showTab(state.settings.tab || 'yb');
  $('#sheet-pane').addEventListener('mousedown', function (e) {
    if (e.target === $('#sheet-pane')) { e.preventDefault(); $('#add-row').click(); }
  });
  setTimeout(function () { focusRow(rows.length - 1); }, 50);
  window.PhysCalcApp = { engine: engine, rows: function () { return rows; }, state: state, evaluate: evaluateNow, insertLines: insertLines };
})();
