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
  // Plot size: full row width and the default height unless width=/height= (pixels) were given.
  function plotWidth(container, opts) {
    var full = Math.max(280, container.clientWidth || 600);
    return opts && opts.width ? Math.max(280, Math.min(full, Math.round(opts.width))) : full;
  }
  function setupCanvas(container, height, width) {
    container.innerHTML = '';
    var wrap = document.createElement('div'); wrap.className = 'plot-wrap';
    var cv = document.createElement('canvas');
    var tip = document.createElement('div'); tip.className = 'plot-tip'; tip.style.display = 'none';
    wrap.appendChild(cv); wrap.appendChild(tip); container.appendChild(wrap);
    var w = width || Math.max(280, container.clientWidth || 600), h = height;
    var dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    var ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    return { cv: cv, ctx: ctx, w: w, h: h, tip: tip };
  }

  function withUnit(label, unit) {
    label = String(label);
    if (!unit || /[\])]\s*$/.test(label)) return label;    // "Detuning (MHz)" already names its unit
    return (label ? label + ' ' : '') + '[' + unitLabel(unit) + ']';
  }
  function paramName(f) { var m = f && f.syntax && f.syntax.match(/\(\s*([^,)\s]+)/); return m ? m[1] : 'x'; }
  var FONT = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Ubuntu, "DejaVu Sans", sans-serif';

  function render1d(container, spec, engine) {
    var math = engine.math, opts = spec.opts || {};
    var list = spec.series || spec.fns.map(function (f) { return { fn: f }; });
    var logx = !!opts.logx, logy = !!opts.logy;
    function xnum(x, us) {
      try { if (us) return math.isUnit(x) ? x.toNumber(us) : NaN; return typeof x === 'number' ? x : NaN; } catch (e) { return NaN; }
    }
    // ---- x axis: from the given range, or from the data when only points are plotted
    var X;
    if (spec.xa !== undefined && spec.xb !== undefined) X = axisFor(math, spec.xa, spec.xb);
    else {
      var first = null;
      list.forEach(function (s) { if (s.pts && first === null && s.pts.x.length) first = s.pts.x[0]; });
      if (first === null) throw new Error('plot: give the x range');
      var us0 = math.isUnit(first) ? unitStrOf(first) : '', lo0 = Infinity, hi0 = -Infinity;
      list.forEach(function (s) { if (s.pts) s.pts.x.forEach(function (x) { var n = xnum(x, us0); if (isFinite(n)) { if (n < lo0) lo0 = n; if (n > hi0) hi0 = n; } }); });
      if (!isFinite(lo0)) throw new Error('plot: the data has no finite x values');
      if (hi0 === lo0) { lo0 -= 0.5; hi0 += 0.5; } else if (!logx) { var px0 = (hi0 - lo0) * 0.04; lo0 -= px0; hi0 += px0; }
      X = { unit: us0, lo: lo0, hi: hi0, make: us0 ? function (x) { return math.unit(x, us0); } : function (x) { return x; } };
    }
    if (!(isFinite(X.lo) && isFinite(X.hi)) || X.hi === X.lo) throw new Error('plot: bad x range');
    if (X.hi < X.lo) { var tmp = X.lo; X.lo = X.hi; X.hi = tmp; }
    if (logx && (X.lo <= 0 || X.hi <= 0)) throw new Error('logx needs a positive x range');

    // ---- sample every series (raw values keep their units for now)
    var N = 500, series = [];
    list.forEach(function (s, si) {
      var S = { color: COLORS[si % COLORS.length], raw: [], xs: [], isPts: !!s.pts };
      if (s.fn) {
        S.name = s.fn.syntax || s.fn.name || ('f' + (si + 1));
        var errs = 0, lastErr = null;
        for (var k = 0; k <= N; k++) {
          var t = k / N;
          var x = logx ? Math.pow(10, Math.log10(X.lo) + t * (Math.log10(X.hi) - Math.log10(X.lo))) : X.lo + t * (X.hi - X.lo);
          S.xs.push(x);
          try { S.raw.push(s.fn(X.make(x))); } catch (e) { S.raw.push(undefined); errs++; lastErr = e; }
        }
        if (errs > N * 0.9) throw new Error('plot: ' + S.name + ': ' + lastErr.message);
      } else {
        S.name = 'data';
        var okx = 0;
        s.pts.x.forEach(function (x, i) { var n = xnum(x, X.unit); if (isFinite(n)) okx++; S.xs.push(n); S.raw.push(s.pts.y[i]); });
        if (!okx && s.pts.x.length) throw new Error('plot: the x values of the data need ' + (X.unit ? 'units like ' + unitLabel(X.unit) : 'to be plain numbers, like the x range'));
      }
      series.push(S);
    });
    var names = series.map(function (S, i) { return (opts.legend && opts.legend[i]) || S.name; });

    // ---- y axes: curves whose units cannot be converted into each other get a second (right) axis
    var axes = [];
    series.forEach(function (S) {
      var best = null, bestMag = -1;
      S.raw.forEach(function (y) {
        var mag;
        if (math.isUnit(y)) mag = Math.abs(y.value); else if (typeof y === 'number') mag = Math.abs(y); else if (math.isComplex(y)) mag = Math.abs(y.re); else return;
        if (isFinite(mag) && mag > bestMag) { bestMag = mag; best = y; }
      });
      S.axis = -1;
      if (best === null) return;
      var isU = math.isUnit(best), ai = -1;
      axes.forEach(function (A, i) { if (ai < 0 && A.isUnit === isU && (!isU || A.sample.equalBase(best))) ai = i; });
      if (ai < 0) {
        if (axes.length === 2 && !opts.normalize) throw new Error('plot: these curves have more than two different kinds of units — plot them separately, or add normalize=true to compare shapes');
        axes.push({ isUnit: isU, sample: best, mag: bestMag, series: [] }); ai = axes.length - 1;
      } else if (bestMag > axes[ai].mag) { axes[ai].sample = best; axes[ai].mag = bestMag; }
      S.axis = ai; axes[ai].series.push(S);
    });
    if (!axes.length) throw new Error('plot: function gave no finite values in this range');
    axes.forEach(function (A) { var rd = readerFor(math, engine, A.sample); A.unit = rd.unit; A.read = rd.read; });
    series.forEach(function (S) {
      var A = axes[S.axis];
      S.ys = S.raw.map(function (y) { var v = A ? A.read(y) : NaN; if (logy && !(v > 0)) v = NaN; return isFinite(v) ? v : NaN; });
      S.raw = null;
    });
    if (opts.normalize) {                       // compare shapes: every curve scaled to a peak of 1
      series.forEach(function (S) {
        var mx = 0; S.ys.forEach(function (y) { if (isFinite(y) && Math.abs(y) > mx) mx = Math.abs(y); });
        if (mx > 0) S.ys = S.ys.map(function (y) { return y / mx; });
        if (S.axis >= 0) S.axis = 0;
      });
      axes = [{ unit: '', normalized: true, series: series.filter(function (S) { return S.axis === 0; }) }];
    }
    function optNum(v, A) { return math.isUnit(v) ? v.toNumber(A.unit) : Number(v); }
    axes.forEach(function (A, ai) {
      var lo = Infinity, hi = -Infinity;
      A.series.forEach(function (S) { S.ys.forEach(function (y) { if (!isFinite(y)) return; var v = logy ? Math.log10(y) : y; if (v < lo) lo = v; if (v > hi) hi = v; }); });
      if (!isFinite(lo)) { if (ai === 0) throw new Error('plot: function gave no finite values in this range'); lo = 0; hi = 1; }
      if (opts.zero && !logy) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
      var fixLo = false, fixHi = false;
      if (ai === 0 && opts.ymin !== undefined) { var a = optNum(opts.ymin, A); if (logy) a = Math.log10(a); if (isFinite(a)) { lo = a; fixLo = true; } }
      if (ai === 0 && opts.ymax !== undefined) { var b = optNum(opts.ymax, A); if (logy) b = Math.log10(b); if (isFinite(b)) { hi = b; fixHi = true; } }
      if (!(hi > lo)) { var d = Math.abs(hi) || 1; lo -= d * 0.5; hi += d * 0.5; }
      var pad = (hi - lo) * 0.06; if (!fixLo) lo -= pad; if (!fixHi) hi += pad;
      A.lo = lo; A.hi = hi;
    });
    var xlo = logx ? Math.log10(X.lo) : X.lo, xhi = logx ? Math.log10(X.hi) : X.hi;

    // ---- labels
    var title = opts.title !== undefined ? String(opts.title) : '';
    var firstFn = null; list.forEach(function (s) { if (s.fn && !firstFn) firstFn = s.fn; });
    function join(name, unit) { return (name || '') + (unit ? (name ? ' ' : '') + '[' + unitLabel(unit) + ']' : ''); }
    var xlabel = opts.xlabel !== undefined && opts.xlabel !== '' ? withUnit(opts.xlabel, X.unit) : join(firstFn ? paramName(firstFn) : 'x', X.unit);
    function defaultY(A) {
      if (A.normalized) return 'normalized';
      var only = A.series.length === 1 && !A.series[0].isPts ? names[series.indexOf(A.series[0])] : '';
      return join(only, A.unit);
    }
    var ylabel = opts.ylabel !== undefined && opts.ylabel !== '' ? withUnit(opts.ylabel, axes[0].unit) : defaultY(axes[0]);
    var y2label = axes[1] ? (opts.y2label !== undefined && opts.y2label !== '' ? withUnit(opts.y2label, axes[1].unit) : defaultY(axes[1])) : '';
    var showLegend = series.length > 1 || !!(opts.legend && opts.legend.length);

    // ---- layout (legend sits above the plot area so it never covers a curve)
    var W = plotWidth(container, opts);
    var L = 66, R = axes[1] ? 70 : 16, B = 44, pw = W - L - R;
    var meas = document.createElement('canvas').getContext('2d'); meas.font = FONT;
    var legend = [], rows = 0;
    if (showLegend) {
      var cx = 0; rows = 1;
      series.forEach(function (S, i) {
        var txt = names[i] + (S.axis === 1 ? '  (right axis)' : '');
        var wid = 26 + meas.measureText(txt).width + 16;
        if (cx > 0 && cx + wid > pw + 6) { cx = 0; rows++; }
        legend.push({ S: S, txt: txt, x: cx, row: rows - 1 }); cx += wid;
      });
    }
    var T = 10 + (title ? 22 : 0) + rows * 17 + (rows ? 3 : 0), ph = opts.height ? Math.max(80, Math.round(opts.height) - T - B) : 210;
    var C = setupCanvas(container, T + ph + B, W), ctx = C.ctx;
    function sx(x) { return L + ((logx ? Math.log10(x) : x) - xlo) / (xhi - xlo) * pw; }
    function sy(y, A) { return T + (1 - ((logy ? Math.log10(y) : y) - A.lo) / (A.hi - A.lo)) * ph; }
    var fg = css('--fg', '#111'), muted = css('--muted', '#777'), grid = css('--grid', '#e5e7eb'), bg = css('--bg', '#fff');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, C.w, C.h);          // solid background so "Save PNG" is not transparent
    if (title) { ctx.font = '600 13px' + FONT.slice(4); ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(title, L + pw / 2, 8); }
    ctx.font = FONT; ctx.lineWidth = 1;
    // grid + ticks
    var A0 = axes[0];
    var xt = logx ? logTicks(xlo, xhi) : ticks(xlo, xhi, Math.max(3, Math.floor(pw / 90)));
    var yt = logy ? logTicks(A0.lo, A0.hi) : ticks(A0.lo, A0.hi, Math.max(3, Math.floor(ph / 45)));
    ctx.strokeStyle = grid; ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    xt.forEach(function (t) {
      var px = L + (t - xlo) / (xhi - xlo) * pw; if (px < L - 0.5 || px > L + pw + 0.5) return;
      ctx.beginPath(); ctx.moveTo(px, T); ctx.lineTo(px, T + ph); ctx.stroke();
      ctx.fillText(logx ? '10' + supers(t) : fmtTick(t), px, T + ph + 5);
    });
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    yt.forEach(function (t) {
      var py = T + (1 - (t - A0.lo) / (A0.hi - A0.lo)) * ph; if (py < T - 0.5 || py > T + ph + 0.5) return;
      ctx.beginPath(); ctx.moveTo(L, py); ctx.lineTo(L + pw, py); ctx.stroke();
      ctx.fillText(logy ? '10' + supers(t) : fmtTick(t), L - 6, py);
    });
    if (axes[1]) {
      var A1 = axes[1], yt2 = logy ? logTicks(A1.lo, A1.hi) : ticks(A1.lo, A1.hi, Math.max(3, Math.floor(ph / 45)));
      ctx.textAlign = 'left'; ctx.strokeStyle = muted;
      yt2.forEach(function (t) {
        var py = T + (1 - (t - A1.lo) / (A1.hi - A1.lo)) * ph; if (py < T - 0.5 || py > T + ph + 0.5) return;
        ctx.beginPath(); ctx.moveTo(L + pw, py); ctx.lineTo(L + pw + 4, py); ctx.stroke();
        ctx.fillText(logy ? '10' + supers(t) : fmtTick(t), L + pw + 7, py);
      });
    }
    // zero line
    if (!logy && A0.lo < 0 && A0.hi > 0) { ctx.strokeStyle = muted; ctx.globalAlpha = 0.5; var zy = sy(0, A0); ctx.beginPath(); ctx.moveTo(L, zy); ctx.lineTo(L + pw, zy); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.strokeStyle = muted; ctx.strokeRect(L + 0.5, T + 0.5, pw, ph);
    // axis labels
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(xlabel, L + pw / 2, C.h - 6);
    function vlabel(txt, x) { if (!txt) return; ctx.save(); ctx.translate(x, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, 0); ctx.restore(); }
    vlabel(ylabel, 12); vlabel(y2label, C.w - 10);
    // legend
    legend.forEach(function (g) {
      var lx = L + g.x, ly = 10 + (title ? 22 : 0) + g.row * 17 + 7;
      ctx.strokeStyle = g.S.color; ctx.fillStyle = g.S.color; ctx.lineWidth = 2;
      if (g.S.isPts && !opts.lines) { ctx.beginPath(); ctx.arc(lx + 10, ly, 3.2, 0, 2 * Math.PI); ctx.fill(); }
      else { ctx.setLineDash(g.S.axis === 1 ? [5, 3] : []); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 20, ly); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(g.txt, lx + 26, ly);
    });
    // curves (right-axis curves are dashed) and data points
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
    series.forEach(function (S) {
      var A = axes[S.axis]; if (!A) return;
      if (S.isPts && opts.lines) {                 // data drawn as a connected trace, in file order
        ctx.strokeStyle = S.color; ctx.lineWidth = 1.5; ctx.beginPath();
        var down = false;
        S.xs.forEach(function (x, i) {
          if (!isFinite(x) || !isFinite(S.ys[i]) || (logx && !(x > 0))) { down = false; return; }
          if (!down) { ctx.moveTo(sx(x), sy(S.ys[i], A)); down = true; } else ctx.lineTo(sx(x), sy(S.ys[i], A));
        });
        ctx.stroke();
        return;
      }
      if (S.isPts) {
        var npt = S.xs.length, rad = npt > 2000 ? 1.3 : npt > 300 ? 2.1 : 3.4;
        ctx.fillStyle = S.color; ctx.strokeStyle = bg; ctx.lineWidth = 1;
        S.xs.forEach(function (x, i) {
          if (!isFinite(x) || !isFinite(S.ys[i]) || (logx && !(x > 0))) return;
          ctx.beginPath(); ctx.arc(sx(x), sy(S.ys[i], A), rad, 0, 2 * Math.PI); ctx.fill(); if (rad > 3) ctx.stroke();
        });
        return;
      }
      ctx.strokeStyle = S.color; ctx.lineWidth = 2; ctx.setLineDash(S.axis === 1 ? [6, 4] : []); ctx.beginPath();
      var pen = false;
      S.xs.forEach(function (x, i) {
        var y = S.ys[i];
        if (!isFinite(y)) { pen = false; return; }
        var px = sx(x), py = sy(y, A);
        if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
      });
      ctx.stroke(); ctx.setLineDash([]);
    });
    ctx.restore();
    // hover read-out: every curve at the cursor's x
    C.cv.addEventListener('mousemove', function (ev) {
      var r = C.cv.getBoundingClientRect(), mx = ev.clientX - r.left;
      if (mx < L || mx > L + pw) { C.tip.style.display = 'none'; return; }
      var t = (mx - L) / pw, k = Math.round(t * N);
      var xv = xlo + t * (xhi - xlo); if (logx) xv = Math.pow(10, xv);
      var lines = [xlabel.replace(/\s*\[.*$/, '') + ' = ' + fmtTick(+xv.toPrecision(4)) + (X.unit ? ' ' + unitLabel(X.unit) : '')];
      series.forEach(function (S, i) {
        var A = axes[S.axis]; if (!A) return;
        var y;
        if (S.isPts) {
          var bi = -1, bd = 14;
          S.xs.forEach(function (x, j) { if (!isFinite(x)) return; var dpx = Math.abs(sx(x) - mx); if (dpx < bd) { bd = dpx; bi = j; } });
          if (bi < 0) return;
          y = S.ys[bi];
        } else y = S.ys[k];
        lines.push('<span style="color:' + S.color + '">●</span> ' + (showLegend ? escHtml(names[i]) + ': ' : '') + (isFinite(y) ? (+y.toPrecision(6)) : '—') + (A.unit ? ' ' + unitLabel(A.unit) : ''));
      });
      C.tip.innerHTML = lines.join('<br>');
      C.tip.style.display = 'block';
      var tw = C.tip.offsetWidth || 150;
      C.tip.style.left = Math.max(0, Math.min(mx + 12, C.w - tw - 4)) + 'px';
      C.tip.style.top = (T + 6) + 'px';
    });
    C.cv.addEventListener('mouseleave', function () { C.tip.style.display = 'none'; });
  }
  function escHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function supers(n) { return String(Math.round(n)).split('').map(function (ch) { return '⁰¹²³⁴⁵⁶⁷⁸⁹⁻'['0123456789-'.indexOf(ch)] || ch; }).join(''); }

  function render2d(container, spec, engine) {
    var math = engine.math;
    var X = axisFor(math, spec.xa, spec.xb), Yax = axisFor(math, spec.ya, spec.yb);
    var f = spec.fns[0], N = spec.opts.grid ? Math.max(60, Math.min(300, spec.opts.grid)) : (spec.opts.fine ? 160 : 90), vals = new Float64Array(N * N), Z = null, lo = Infinity, hi = -Infinity, bad = 0;
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
    var opts = spec.opts || {}, title = opts.title !== undefined ? String(opts.title) : '';
    var T = title ? 34 : 12;
    var sized = !!(opts.width || opts.height);
    var C = setupCanvas(container, opts.height ? Math.max(160, Math.round(opts.height)) : 288 + T, plotWidth(container, opts)), ctx = C.ctx;
    var L = 66, R = 74, B = 44, ph = C.h - T - B, pw = sized ? C.w - L - R : Math.min(C.w - L - R, ph * Math.max(0.6, Math.min(2.5, C.w / 600 * 1.4)));
    var fg = css('--fg', '#111');
    ctx.fillStyle = css('--bg', '#fff'); ctx.fillRect(0, 0, C.w, C.h);
    if (title) { ctx.font = '600 13px' + FONT.slice(4); ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(title, L + pw / 2, 9); }
    var xlabel = opts.xlabel !== undefined && opts.xlabel !== '' ? withUnit(opts.xlabel, X.unit) : 'x' + (X.unit ? ' [' + unitLabel(X.unit) + ']' : '');
    var ylabel = opts.ylabel !== undefined && opts.ylabel !== '' ? withUnit(opts.ylabel, Yax.unit) : 'y' + (Yax.unit ? ' [' + unitLabel(Yax.unit) + ']' : '');
    var img = ctx.createImageData(N, N);
    for (var jj = 0; jj < N; jj++) for (var ii = 0; ii < N; ii++) {
      var vv = vals[jj * N + ii], o = ((N - 1 - jj) * N + ii) * 4;
      if (!isFinite(vv)) { img.data[o + 3] = 0; continue; }
      var c = cmap((vv - lo) / (hi - lo)); img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
    var off = document.createElement('canvas'); off.width = N; off.height = N; off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = !spec.opts.grid; ctx.drawImage(off, L, T, pw, ph);     // show real pixels for array data
    var muted = css('--muted', '#777');
    ctx.strokeStyle = muted; ctx.strokeRect(L + 0.5, T + 0.5, pw, ph);
    ctx.font = FONT; ctx.fillStyle = muted;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ticks(X.lo, X.hi, Math.max(3, Math.floor(pw / 90))).forEach(function (t) { var px = L + (t - X.lo) / (X.hi - X.lo) * pw; ctx.fillText(fmtTick(t), px, T + ph + 5); });
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ticks(Yax.lo, Yax.hi, 5).forEach(function (t) { var py = T + (1 - (t - Yax.lo) / (Yax.hi - Yax.lo)) * ph; ctx.fillText(fmtTick(t), L - 6, py); });
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(xlabel, L + pw / 2, C.h - 6);
    ctx.save(); ctx.translate(12, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(ylabel, 0, 0); ctx.restore();
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
