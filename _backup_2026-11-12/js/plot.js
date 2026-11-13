/* PhysCalc plotting: plot(f, a, b, …) line plots and plot2d(f, xa, xb, ya, yb) heat maps on <canvas>. */
(function (g) {
  'use strict';
  var P = g.PhysCalc = g.PhysCalc || {};
  var COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#db2777'];
  // viridis (sampled)
  var VIR = [[68, 1, 84], [72, 35, 116], [64, 67, 135], [52, 94, 141], [41, 120, 142], [32, 144, 140], [34, 167, 132], [68, 190, 112], [121, 209, 81], [189, 222, 38], [253, 231, 37]];

  function unitStrOf(u) {
    return u.units.map(function (c) { return c.prefix.name + c.unit.name + (c.power === 1 ? '' : '^' + c.power); }).join(' ');
  }
  function axisFor(math, a, b) {
    if (math.isUnit(a)) {
      var us = unitStrOf(a);
      if (a.units.length === 1 && a.units[0].unit.offset) us = a.units[0].prefix.name + a.units[0].unit.name;
      return { unit: us, lo: a.toNumber(us), hi: math.isUnit(b) ? b.toNumber(us) : Number(b), make: function (x) { return math.unit(x, us); } };
    }
    if (math.isUnit(b)) return axisFor(math, math.unit(Number(a), unitStrOf(b)), b);
    return { unit: '', lo: Number(a), hi: Number(b), make: function (x) { return x; } };
  }
  function readerFor(math, engine, y) {
    if (math.isUnit(y)) {
      var nu = engine.fmtUnit(y, 6);
      var us = nu.unitStr || unitStrOf(y);
      return { unit: us, read: function (v) { try { return math.isUnit(v) ? v.toNumber(us) : NaN; } catch (e) { return NaN; } } };
    }
    return { unit: '', read: function (v) { if (math.isComplex(v)) return Math.abs(v.im) < 1e-12 * Math.abs(v.re) ? v.re : NaN; return typeof v === 'number' ? v : NaN; } };
  }
  function niceStep(span, n) {
    var raw = span / Math.max(1, n), mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  }
  function ticks(lo, hi, n) {
    if (!(hi > lo)) return [lo];
    var st = niceStep(hi - lo, n), out = [];
    for (var t = Math.ceil(lo / st) * st; t <= hi + st * 1e-9; t += st) out.push(Math.abs(t) < st * 1e-9 ? 0 : t);
    return out;
  }
  function logTicks(lo, hi) {
    var out = [];
    for (var e = Math.floor(lo); e <= Math.ceil(hi); e++) if (e >= lo - 1e-9 && e <= hi + 1e-9) out.push(e);
    if (out.length < 2) return ticks(lo, hi, 4);
    while (out.length > 8) out = out.filter(function (_, i) { return i % 2 === 0; });
    return out;
  }
  function fmtTick(v) {
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (a >= 1e5 || a < 1e-3) { var s = v.toExponential(2).replace(/\.?0+e/, 'e').replace('e+', 'e'); return s; }
    return String(+v.toPrecision(4));
  }
  function fracUnit(u) {
    var num = [], den = [];
    String(u).trim().split(/\s+/).forEach(function (t) {
      var m = t.match(/^(.*?)\^(-?[\d.]+)$/);
      if (m && parseFloat(m[2]) < 0) { var p = -parseFloat(m[2]); den.push(m[1] + (p === 1 ? '' : '^' + p)); } else num.push(t);
    });
    if (!den.length) return num.join(' ');
    return (num.length ? num.join(' ') : '1') + '/' + (den.length > 1 ? '(' + den.join(' ') + ')' : den[0]);
  }
  function unitLabel(u) { u = u ? fracUnit(u) : u; return u ? u.replace(/\bu(?=[a-zA-Z])/g, 'µ').replace(/\^(-?\d+(\.\d+)?)/g, function (m, p) { return p.split('').map(function (ch) { return '⁰¹²³⁴⁵⁶⁷⁸⁹⁻·'['0123456789-.'.indexOf(ch)] || ch; }).join(''); }) : ''; }
  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }
  function setupCanvas(container, height) {
    container.innerHTML = '';
    var wrap = document.createElement('div'); wrap.className = 'plot-wrap';
    var cv = document.createElement('canvas');
    var tip = document.createElement('div'); tip.className = 'plot-tip'; tip.style.display = 'none';
    wrap.appendChild(cv); wrap.appendChild(tip); container.appendChild(wrap);
    var w = Math.max(280, container.clientWidth || 600), h = height;
    var dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    var ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    return { cv: cv, ctx: ctx, w: w, h: h, tip: tip };
  }

  function render1d(container, spec, engine) {
    var math = engine.math;
    var X = axisFor(math, spec.xa, spec.xb);
    if (!(isFinite(X.lo) && isFinite(X.hi)) || X.hi === X.lo) throw new Error('plot: bad x range');
    var logx = !!spec.opts.logx, logy = !!spec.opts.logy;
    if (logx && (X.lo <= 0 || X.hi <= 0)) throw new Error('logx needs a positive x range');
    var N = 500, series = [], Y = null, errs = 0;
    spec.fns.forEach(function (f, fi) {
      var pts = [];
      for (var k = 0; k <= N; k++) {
        var t = k / N;
        var x = logx ? Math.pow(10, Math.log10(X.lo) + t * (Math.log10(X.hi) - Math.log10(X.lo))) : X.lo + t * (X.hi - X.lo);
        var yv;
        try { var y = f(X.make(x)); if (!Y && y !== undefined && (math.isUnit(y) || typeof y === 'number' || math.isComplex(y))) Y = readerFor(math, engine, y); yv = Y ? Y.read(y) : NaN; }
        catch (e) { yv = NaN; errs++; if (errs > N * 0.9 * spec.fns.length) throw new Error('plot: ' + e.message); }
        if (logy && !(yv > 0)) yv = NaN;
        pts.push([x, isFinite(yv) ? yv : NaN]);
      }
      series.push({ pts: pts, color: COLORS[fi % COLORS.length], name: f.syntax || f.name || ('f' + (fi + 1)) });
    });
    var ys = []; series.forEach(function (s) { s.pts.forEach(function (p) { if (isFinite(p[1])) ys.push(logy ? Math.log10(p[1]) : p[1]); }); });
    if (!ys.length) throw new Error('plot: function gave no finite values in this range');
    var ylo = Math.min.apply(null, ys), yhi = Math.max.apply(null, ys);
    if (spec.opts.zero && !logy) { ylo = Math.min(ylo, 0); yhi = Math.max(yhi, 0); }
    if (yhi === ylo) { var d = Math.abs(yhi) || 1; ylo -= d * 0.5; yhi += d * 0.5; }
    var pad = (yhi - ylo) * 0.06; ylo -= pad; yhi += pad;
    var xlo = logx ? Math.log10(X.lo) : X.lo, xhi = logx ? Math.log10(X.hi) : X.hi;

    var C = setupCanvas(container, 260), ctx = C.ctx;
    var L = 62, R = 14, T = 12, B = 40, pw = C.w - L - R, ph = C.h - T - B;
    function sx(x) { return L + ((logx ? Math.log10(x) : x) - xlo) / (xhi - xlo) * pw; }
    function sy(y) { return T + (1 - ((logy ? Math.log10(y) : y) - ylo) / (yhi - ylo)) * ph; }
    var fg = css('--fg', '#111'), muted = css('--muted', '#777'), grid = css('--grid', '#e5e7eb');
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.lineWidth = 1;
    // grid + ticks
    var xt = logx ? logTicks(xlo, xhi) : ticks(xlo, xhi, Math.max(3, Math.floor(pw / 90)));
    var yt = logy ? logTicks(ylo, yhi) : ticks(ylo, yhi, Math.max(3, Math.floor(ph / 45)));
    ctx.strokeStyle = grid; ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    xt.forEach(function (t) {
      var px = L + (t - xlo) / (xhi - xlo) * pw; if (px < L - 0.5 || px > L + pw + 0.5) return;
      ctx.beginPath(); ctx.moveTo(px, T); ctx.lineTo(px, T + ph); ctx.stroke();
      ctx.fillText(logx ? '10' + supers(t) : fmtTick(t), px, T + ph + 5);
    });
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    yt.forEach(function (t) {
      var py = T + (1 - (t - ylo) / (yhi - ylo)) * ph; if (py < T - 0.5 || py > T + ph + 0.5) return;
      ctx.beginPath(); ctx.moveTo(L, py); ctx.lineTo(L + pw, py); ctx.stroke();
      ctx.fillText(logy ? '10' + supers(t) : fmtTick(t), L - 6, py);
    });
    // zero line
    if (!logy && ylo < 0 && yhi > 0) { ctx.strokeStyle = muted; ctx.globalAlpha = 0.5; var zy = sy(0); ctx.beginPath(); ctx.moveTo(L, zy); ctx.lineTo(L + pw, zy); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.strokeStyle = muted; ctx.strokeRect(L + 0.5, T + 0.5, pw, ph);
    // labels
    ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(X.unit ? 'x [' + unitLabel(X.unit) + ']' : 'x', L + pw / 2, C.h - 4);
    if (Y && Y.unit) { ctx.save(); ctx.translate(12, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText('[' + unitLabel(Y.unit) + ']', 0, 0); ctx.restore(); }
    // curves
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
    series.forEach(function (s) {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.beginPath();
      var pen = false;
      s.pts.forEach(function (p) {
        if (!isFinite(p[1])) { pen = false; return; }
        var px = sx(p[0]), py = sy(p[1]);
        if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });
    ctx.restore();
    if (series.length > 1) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      series.forEach(function (s, i) { ctx.fillStyle = s.color; ctx.fillRect(L + 10, T + 10 + i * 16, 14, 3); ctx.fillStyle = fg; ctx.fillText(s.name, L + 30, T + 11 + i * 16); });
    }
    // hover
    C.cv.addEventListener('mousemove', function (ev) {
      var r = C.cv.getBoundingClientRect(), mx = ev.clientX - r.left;
      if (mx < L || mx > L + pw) { C.tip.style.display = 'none'; return; }
      var t = (mx - L) / pw, k = Math.round(t * N);
      var x = series[0].pts[k][0];
      var lines = ['x = ' + fmtTick(x) + (X.unit ? ' ' + unitLabel(X.unit) : '')];
      series.forEach(function (s) { var y = s.pts[k][1]; lines.push('<span style="color:' + s.color + '">●</span> ' + (isFinite(y) ? (+y.toPrecision(6)) : '—') + (Y && Y.unit ? ' ' + unitLabel(Y.unit) : '')); });
      C.tip.innerHTML = lines.join('<br>');
      C.tip.style.display = 'block';
      C.tip.style.left = Math.min(mx + 12, C.w - 150) + 'px';
      C.tip.style.top = (T + 6) + 'px';
    });
    C.cv.addEventListener('mouseleave', function () { C.tip.style.display = 'none'; });
  }

  function supers(n) { return String(Math.round(n)).split('').map(function (ch) { return '⁰¹²³⁴⁵⁶⁷⁸⁹⁻'['0123456789-'.indexOf(ch)] || ch; }).join(''); }

  function render2d(container, spec, engine) {
    var math = engine.math;
    var X = axisFor(math, spec.xa, spec.xb), Yax = axisFor(math, spec.ya, spec.yb);
    var f = spec.fns[0], N = spec.opts.fine ? 160 : 90, vals = new Float64Array(N * N), Z = null, lo = Infinity, hi = -Infinity, bad = 0;
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var x = X.lo + (i + 0.5) / N * (X.hi - X.lo), y = Yax.lo + (j + 0.5) / N * (Yax.hi - Yax.lo), v;
      try { var r = f(X.make(x), Yax.make(y)); if (!Z) Z = readerFor(math, engine, r); v = Z.read(r); }
      catch (e) { v = NaN; if (++bad > N * N * 0.9) throw new Error('plot2d: ' + e.message); }
      if (spec.opts.log) v = v > 0 ? Math.log10(v) : NaN;
      vals[j * N + i] = v;
      if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    if (!isFinite(lo)) throw new Error('plot2d: no finite values');
    if (hi === lo) hi = lo + 1;
    var C = setupCanvas(container, 300), ctx = C.ctx;
    var L = 62, R = 74, T = 12, B = 40, ph = C.h - T - B, pw = Math.min(C.w - L - R, ph * Math.max(0.6, Math.min(2.5, C.w / 600 * 1.4)));
    var img = ctx.createImageData(N, N);
    for (var jj = 0; jj < N; jj++) for (var ii = 0; ii < N; ii++) {
      var vv = vals[jj * N + ii], o = ((N - 1 - jj) * N + ii) * 4;
      if (!isFinite(vv)) { img.data[o + 3] = 0; continue; }
      var c = cmap((vv - lo) / (hi - lo)); img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
    var off = document.createElement('canvas'); off.width = N; off.height = N; off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(off, L, T, pw, ph);
    var muted = css('--muted', '#777');
    ctx.strokeStyle = muted; ctx.strokeRect(L + 0.5, T + 0.5, pw, ph);
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'; ctx.fillStyle = muted;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ticks(X.lo, X.hi, Math.max(3, Math.floor(pw / 90))).forEach(function (t) { var px = L + (t - X.lo) / (X.hi - X.lo) * pw; ctx.fillText(fmtTick(t), px, T + ph + 5); });
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ticks(Yax.lo, Yax.hi, 5).forEach(function (t) { var py = T + (1 - (t - Yax.lo) / (Yax.hi - Yax.lo)) * ph; ctx.fillText(fmtTick(t), L - 6, py); });
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(X.unit ? 'x [' + unitLabel(X.unit) + ']' : 'x', L + pw / 2, C.h - 4);
    ctx.save(); ctx.translate(12, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(Yax.unit ? 'y [' + unitLabel(Yax.unit) + ']' : 'y', 0, 0); ctx.restore();
    // colour bar
    var cbx = L + pw + 16, cbw = 12;
    for (var k = 0; k < ph; k++) { var cc = cmap(1 - k / ph); ctx.fillStyle = 'rgb(' + cc.join(',') + ')'; ctx.fillRect(cbx, T + k, cbw, 1.5); }
    ctx.strokeStyle = muted; ctx.strokeRect(cbx + 0.5, T + 0.5, cbw, ph);
    ctx.fillStyle = muted; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ticks(lo, hi, 5).forEach(function (t) { var py = T + (1 - (t - lo) / (hi - lo)) * ph; ctx.fillText((spec.opts.log ? '10^' : '') + fmtTick(t), cbx + cbw + 4, py); });
    if (Z && Z.unit) { ctx.textBaseline = 'bottom'; ctx.fillText(unitLabel(Z.unit), cbx, T - 1 > 10 ? T - 1 : 11); }
    C.cv.addEventListener('mousemove', function (ev) {
      var r = C.cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
      if (mx < L || mx > L + pw || my < T || my > T + ph) { C.tip.style.display = 'none'; return; }
      var i = Math.min(N - 1, Math.floor((mx - L) / pw * N)), j = Math.min(N - 1, Math.floor((1 - (my - T) / ph) * N));
      var x = X.lo + (i + 0.5) / N * (X.hi - X.lo), y = Yax.lo + (j + 0.5) / N * (Yax.hi - Yax.lo), v = vals[j * N + i];
      C.tip.innerHTML = 'x = ' + fmtTick(x) + ' ' + unitLabel(X.unit) + '<br>y = ' + fmtTick(y) + ' ' + unitLabel(Yax.unit) + '<br>f = ' + (isFinite(v) ? (spec.opts.log ? '10^' : '') + (+v.toPrecision(5)) : '—') + (Z && Z.unit ? ' ' + unitLabel(Z.unit) : '');
      C.tip.style.display = 'block'; C.tip.style.left = Math.min(mx + 12, C.w - 150) + 'px'; C.tip.style.top = Math.max(0, my - 50) + 'px';
    });
    C.cv.addEventListener('mouseleave', function () { C.tip.style.display = 'none'; });
  }
  function cmap(t) {
    t = Math.max(0, Math.min(1, t)) * (VIR.length - 1);
    var i = Math.floor(t), f = t - i, a = VIR[i], b = VIR[Math.min(VIR.length - 1, i + 1)];
    return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
  }

  P.renderPlot = function (container, spec, engine) {
    try {
      if (spec.type === '2d') render2d(container, spec, engine); else render1d(container, spec, engine);
      return null;
    } catch (e) {
      container.innerHTML = '';
      return e.message || String(e);
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
