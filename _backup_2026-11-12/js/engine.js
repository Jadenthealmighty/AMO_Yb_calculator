/* PhysCalc engine — math.js setup, scopes, evaluation, result formatting, TeX.
 * No DOM access here, so the same file runs in the browser and under Node for tests.
 *
 * Load order (browser): vendor/math.js, data/*.js, equations/*.js, js/engine.js, js/plot.js, js/ui.js
 */
(function (g) {
  'use strict';
  var P = g.PhysCalc = g.PhysCalc || {};
  P.equations = P.equations || [];

  var KEYWORDS = new Set(['to', 'in', 'and', 'or', 'not', 'xor', 'mod', 'end']);
  var GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota',
    'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
    'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega'];
  var GREEK_SET = new Set(GREEK);
  var MICRO_UNITS = new Set(['m', 's', 'K', 'W', 'J', 'Hz', 'A', 'V', 'T', 'G', 'F', 'H', 'L', 'l', 'g', 'rad', 'C', 'N',
    'Pa', 'eV', 'Torr', 'torr', 'bar', 'mol', 'ohm', 'S', 'Wb', 'sr']);
  // prefixes we are happy to show automatically (engineering style)
  var PREFIX_EXP = { f: -15, p: -12, n: -9, u: -6, m: -3, '': 0, k: 3, M: 6, G: 9, T: 12 };

  P.createEngine = function (mathjs, options) {
    options = options || {};
    var math = mathjs.create(mathjs.all, {});
    var Unit = math.Unit;
    Unit.setUnitSystem('si');

    var codata = P.codata || [];
    var C = {};               // name -> value (Unit or number)
    var meta = {};            // name -> {tex, desc, kind, ...} for TeX + autocomplete
    var constErrors = [];
    codata.forEach(function (k) {
      if (typeof math[k.name] === 'function') constErrors.push(k.name + ': constant shadows a math.js function');
      var v = k.unit ? math.unit(k.value, k.unit) : k.value;
      C[k.name] = v;
      meta[k.name] = { tex: k.tex, desc: k.desc, kind: 'const' };
    });

    // ---- extra units --------------------------------------------------------------------
    var mu_kg = (codata.filter(function (k) { return k.name === 'm_u'; })[0] || { value: 1.66053906892e-27 }).value;
    function addUnit(name, def, more) {
      try { math.createUnit(name, Object.assign({ definition: def }, more || {})); } catch (e) { /* already defined */ }
    }
    addUnit('G', '1e-4 T', { prefixes: 'short', aliases: ['gauss', 'Gauss'] });       // gauss: 10 G, 5 mG, 2 kG
    addUnit('amu', mu_kg + ' kg', { aliases: ['Da'] });
    addUnit('Torr', '1 torr', { prefixes: 'short' });                                // mTorr, uTorr
    addUnit('ppm', '1e-6');
    addUnit('ppb', '1e-9');

    var COMMON_UNITS = new Set(['m', 's', 'g', 'K', 'A', 'T', 'G', 'J', 'W', 'N', 'V', 'C', 'F', 'H', 'L', 'l', 'Hz', 'Pa', 'eV', 'ohm', 'mol', 'rad', 'deg', 'torr', 'Torr', 'bar', 'atm', 'h', 'minute', 'hour', 'day', 'amu', 'Da', 'sr', 'cd']);
    var COMMON_PREFIX = new Set(['', 'k', 'M', 'G', 'T', 'm', 'u', 'n', 'p', 'f', 'c']);
    function isCommonUnit(name) {
      if (!isUnitName(name)) return false;
      try { var u = Unit.parse(name); return u.units.length === 1 && COMMON_UNITS.has(u.units[0].unit.name) && COMMON_PREFIX.has(u.units[0].prefix.name); } catch (e) { return false; }
    }
    function isUnitName(name) {
      try { return Unit.isValuelessUnit(name); } catch (e) { return false; }
    }

    // ---- helper functions available everywhere ----------------------------------------
    function toArray(x) {
      if (math.isMatrix(x)) return x.valueOf();
      return x;
    }
    function flat(x) { return math.flatten(toArray(x)); }
    function inUnits(x, u) { return math.to(x, u); }
    function stripNum(x, u) { return math.isUnit(x) ? x.toNumber(u) : x; }

    function normalizePhase(v) {
      // scale so the largest-magnitude component is real and positive
      var best = null, bestAbs = -1;
      for (var i = 0; i < v.length; i++) {
        var a = math.abs(v[i]);
        if (typeof a === 'number' && a > bestAbs + 1e-12) { bestAbs = a; best = v[i]; }
      }
      if (best === null || bestAbs === 0) return v;
      var ph = math.divide(math.abs(best), best);   // e^{-i arg}
      return v.map(function (c) { return cleanScalar(math.multiply(c, ph)); });
    }
    function cleanScalar(c) {
      if (math.isComplex(c)) {
        var re = Math.abs(c.re) < 1e-14 ? 0 : c.re, im = Math.abs(c.im) < 1e-14 ? 0 : c.im;
        return im === 0 ? re : math.complex(re, im);
      }
      if (typeof c === 'number' && Math.abs(c) < 1e-15) return 0;
      return c;
    }
    function eigFull(M) {
      var r = math.eigs(M);
      var evs = r.eigenvectors || [];
      var vals = [], cols = [];
      evs.forEach(function (ev) {
        var v = flat(ev.vector);
        var n = math.norm(v);
        v = v.map(function (c) { return math.divide(c, n); });
        vals.push(cleanScalar(ev.value));
        cols.push(normalizePhase(v));
      });
      var n = cols.length ? cols[0].length : 0;
      var V = [];
      for (var i = 0; i < n; i++) V.push(cols.map(function (c) { return c[i]; }));
      return { values: vals, V: V };
    }

    function isZero(x) { return (typeof x === 'number' && x === 0) || (math.isComplex(x) && x.re === 0 && x.im === 0); }
    var helpers = {
      ln: function (x) { return math.log(x); },
      ratio: function (a, b) { return isZero(a) ? 0 : math.divide(a, b); },
      inUnits: inUnits,
      eigvals: function (M) { return math.matrix(eigFull(M).values); },
      eigvecs: function (M) { return math.matrix(eigFull(M).V); },
      eig: function (M) { var r = eigFull(M); return { __eig: true, values: r.values, V: r.V }; },
      plot: function () {
        var fns = [], nums = [], opts = {};
        Array.prototype.slice.call(arguments).forEach(function (a) {
          if (typeof a === 'function') fns.push(a);
          else if (typeof a === 'string') a.split(/[ ,]+/).forEach(function (o) { if (o) opts[o] = true; });
          else if ((Array.isArray(a) || math.isMatrix(a)) && flat(a).every(function (f) { return typeof f === 'function'; })) fns = fns.concat(flat(a));
          else nums.push(a);
        });
        if (!fns.length) throw new Error('plot(f, xmin, xmax): first argument must be a function, e.g. f(x) = x^2');
        if (nums.length < 2) throw new Error('plot(f, xmin, xmax): give the x range');
        return { __plot: true, type: '1d', fns: fns, xa: nums[0], xb: nums[1], opts: opts };
      },
      plot2d: function (f, xa, xb, ya, yb, o) {
        if (typeof f !== 'function') throw new Error('plot2d(f, xmin, xmax, ymin, ymax): f must be a function of (x, y)');
        if (yb === undefined) throw new Error('plot2d(f, xmin, xmax, ymin, ymax): give both ranges');
        var opts = {}; if (typeof o === 'string') o.split(/[ ,]+/).forEach(function (s) { if (s) opts[s] = true; });
        return { __plot: true, type: '2d', fns: [f], xa: xa, xb: xb, ya: ya, yb: yb, opts: opts };
      }
    };

    // ---- base scope: constants + helpers + equation library + Yb --------------------------
    var base = new Map();
    Object.keys(C).forEach(function (k) { base.set(k, C[k]); });
    Object.keys(helpers).forEach(function (k) { base.set(k, helpers[k]); });
    var helperDocs = {
      ln: 'Natural logarithm (same as log)',
      ratio: 'ratio(a, b) — a/b, but a plain 0 counts as zero in any unit (useful for detunings)',
      inUnits: 'inUnits(x, "unit") — convert, same as x to unit',
      eigvals: 'eigvals(M) — eigenvalues as a vector',
      eigvecs: 'eigvecs(M) — normalized eigenvectors as columns',
      eig: 'eig(M) — eigenvalues + eigenvector matrix, nicely displayed',
      plot: 'plot(f, xmin, xmax[, g, …][, "logy"]) — line plot of 1-variable functions',
      plot2d: 'plot2d(f, xmin, xmax, ymin, ymax) — heat map of f(x, y)'
    };
    Object.keys(helperDocs).forEach(function (k) { meta[k] = { desc: helperDocs[k], kind: 'fn' }; });

    function preprocessLib(s) { return preprocess(s, base); }

    var ctx = { math: math, C: C, flat: flat, toArray: toArray, stripNum: stripNum, cleanScalar: cleanScalar };
    var eqErrors = constErrors.slice();
    var equations = [];
    (P.equations || []).forEach(function (e) {
      try {
        var name, params, fn;
        var newName = e.sig ? e.sig.slice(0, e.sig.indexOf('(')) : (e.def ? e.def.slice(0, e.def.indexOf('(')).trim() : e.name_id);
        if (base.has(newName)) eqErrors.push(newName + ': defined twice (overwrites an existing constant/function)');
        if (e.js) {
          fn = e.js(ctx);
          var sig = e.sig;
          name = sig.slice(0, sig.indexOf('('));
          params = sig.slice(sig.indexOf('(') + 1, sig.lastIndexOf(')')).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          base.set(name, fn);
        } else if (e.def) {
          var head = e.def.slice(0, e.def.indexOf('=')).trim();
          name = head.slice(0, head.indexOf('('));
          params = head.slice(head.indexOf('(') + 1, head.lastIndexOf(')')).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          math.evaluate(preprocessLib(e.def), base);
          fn = base.get(name);
        } else if (e.value !== undefined) {           // constant matrices etc.
          name = e.name_id;
          params = null;
          base.set(name, typeof e.value === 'function' ? e.value(ctx) : math.evaluate(e.value, base));
        }
        if (isUnitName(name)) eqErrors.push(name + ': name collides with a unit');
        if (typeof math[name] === 'function') eqErrors.push(name + ': name shadows a math.js function');
        var entry = Object.assign({}, e, { id: name, params: params, sig: params ? name + '(' + params.join(', ') + ')' : name });
        equations.push(entry);
        meta[name] = { desc: e.name + (e.returns ? ' → ' + e.returns : ''), kind: params ? 'fn' : 'const', tex: e.symtex };
      } catch (err) {
        eqErrors.push((e.def || e.sig || e.name) + ': ' + err.message);
      }
    });

    // ---- ytterbium -----------------------------------------------------------------
    var yb = null;
    if (P.ybBuild) {
      try {
        yb = P.ybBuild(math, C, base);
        base.set('Yb', yb.object);
      } catch (err) { eqErrors.push('Yb data: ' + err.message); }
    }

    // ---- user constants (data/user_constants.js) --------------------------------------
    (P.userConstants || []).forEach(function (u) {
      try {
        var v = typeof u.value === 'number' ? u.value : math.evaluate(String(u.value), base);
        base.set(u.name, v);
        meta[u.name] = { tex: u.tex, desc: u.desc || 'user constant', kind: 'const', user: true };
      } catch (err) { eqErrors.push('user constant ' + u.name + ': ' + err.message); }
    });

    // ---- degree mode layer --------------------------------------------------------------
    var D2R = Math.PI / 180;
    function degIn(f) { return function (x) { return math.isUnit(x) ? f(x) : f(math.multiply(x, D2R)); }; }
    function degOut(f) { return function () { return math.divide(f.apply(null, arguments), D2R); }; }
    var degLayer = new Map();
    ['sin', 'cos', 'tan', 'sec', 'csc', 'cot'].forEach(function (n) { degLayer.set(n, degIn(math[n])); });
    ['asin', 'acos', 'atan', 'asec', 'acsc', 'acot', 'atan2'].forEach(function (n) { degLayer.set(n, degOut(math[n])); });
    var emptyLayer = new Map();

    // ---- layered scope ------------------------------------------------------------------
    function Scope(mode) { this.local = new Map(); this.mode = mode || emptyLayer; }
    Scope.prototype.get = function (k) {
      if (this.local.has(k)) return this.local.get(k);
      if (this.mode.has(k)) return this.mode.get(k);
      return base.get(k);
    };
    Scope.prototype.has = function (k) { return this.local.has(k) || this.mode.has(k) || base.has(k); };
    Scope.prototype.set = function (k, v) { this.local.set(k, v); return this; };
    Scope.prototype.delete = function (k) { return this.local.delete(k); };
    Scope.prototype.clear = function () { this.local.clear(); };
    Scope.prototype.keys = function () {
      var s = new Set(base.keys());
      this.mode.forEach(function (v, k) { s.add(k); });
      this.local.forEach(function (v, k) { s.add(k); });
      return s.values();
    };
    Scope.prototype.forEach = function (cb) { var self = this; Array.from(this.keys()).forEach(function (k) { cb(self.get(k), k, self); }); };
    Scope.prototype.entries = function () { var self = this; return Array.from(this.keys()).map(function (k) { return [k, self.get(k)]; }).values(); };
    Scope.prototype[Symbol.iterator] = function () { return this.entries(); };
    Object.defineProperty(Scope.prototype, 'size', { get: function () { return Array.from(this.keys()).length; } });

    // ---- preprocessing ----------------------------------------------------------------
    function isValueName(name, scope) {
      if (KEYWORDS.has(name)) return false;
      if (scope && scope.has(name)) return typeof scope.get(name) !== 'function';
      if (name in math) return typeof math[name] !== 'function';
      return isUnitName(name);
    }
    function preprocess(src, scope) {
      var s = src;
      s = s.replace(/[×⋅·∙]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-')
        .replace(/⁻¹/g, '^-1').replace(/⁻²/g, '^-2').replace(/²/g, '^2').replace(/³/g, '^3')
        .replace(/√/g, 'sqrt').replace(/π/g, 'pi').replace(/ħ/g, 'hbar').replace(/∞/g, 'Infinity')
        .replace(/Å|Å/g, 'angstrom').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=')
        .replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
      s = s.replace(/[µμ]([A-Za-z]+)/g, function (m, rest) { return MICRO_UNITS.has(rest) ? 'u' + rest : m; });
      s = s.replace(/°C\b/g, 'degC').replace(/°F\b/g, 'degF').replace(/°/g, 'deg');
      // math.js treats degC/degF as temperature *differences* inside products (kB*450 degC would use 450 K).
      // For physics we want absolute temperatures, so "450 degC" becomes "((450 degC) to K)".
      s = s.replace(/(-?)(\d+\.?\d*(?:[eE][+-]?\d+)?)\s*(deg[CF])\b/g, function (m, minus, num, unit, off, str) {
        var before = str.slice(0, off).replace(/\s+$/, '');
        if (/\b(to|in)$/.test(before)) return m;
        var unary = minus && (!before || /[=(,\[;]$/.test(before));
        if (minus && !unary) return minus + '((' + num + ' ' + unit + ') to K)';
        return '((' + (unary ? '-' : '') + num + ' ' + unit + ') to K)';
      });
      // "4 pi (x+1)" would be a call to pi(); make value-like names followed by whitespace + "(" multiply
      s = s.replace(/(^|[^\w.$])([A-Za-z_$][\w$]*)(\s+)\(/g, function (m, pre, name, ws) {
        return isValueName(name, scope) ? pre + name + ws + '*(' : m;
      });
      return s;
    }

    // ---- number / unit / value formatting -------------------------------------------------
    function fmtNum(x, prec, upperExp) {
      if (typeof x !== 'number') x = Number(x);
      if (x === Infinity) return { text: 'Infinity', tex: '\\infty' };
      if (x === -Infinity) return { text: '-Infinity', tex: '-\\infty' };
      if (isNaN(x)) return { text: 'NaN', tex: '\\mathrm{NaN}' };
      if (Object.is(x, -0)) x = 0;
      var s = math.format(x, { notation: 'auto', precision: prec, lowerExp: -4, upperExp: upperExp || 10 });
      var m = s.match(/^(-?[\d.]+)e([+-]?\d+)$/);
      if (m) {
        var mant = m[1], ex = parseInt(m[2], 10);
        return { text: s, tex: (mant === '1' ? '' : mant + ' \\times ') + '10^{' + ex + '}' };
      }
      return { text: s, tex: s };
    }
    function fmtComplex(z, prec) {
      var re = z.re, im = z.im;
      var scale = Math.max(Math.abs(re), Math.abs(im));
      if (Math.abs(re) < scale * 1e-14) re = 0;
      if (Math.abs(im) < scale * 1e-14) im = 0;
      if (im === 0) return fmtNum(re, prec);
      var I = fmtNum(Math.abs(im), prec);
      var imText = (I.text === '1' ? '' : I.text) + 'i', imTex = (I.tex === '1' ? '' : (I.tex.indexOf('\\times') >= 0 ? '(' + I.tex + ')' : I.tex)) + 'i';
      if (re === 0) return { text: (im < 0 ? '-' : '') + imText, tex: (im < 0 ? '-' : '') + imTex };
      var R = fmtNum(re, prec);
      var sg = im < 0 ? ' - ' : ' + ';
      return { text: R.text + sg + imText, tex: R.tex + sg.trim() + imTex };
    }
    function unitNameTex(prefix, name) {
      var map = { ohm: '\\Omega', deg: '^{\\circ}', degC: '^{\\circ}\\mathrm{C}', degF: '^{\\circ}\\mathrm{F}', angstrom: '\\text{\\AA}', percent: '\\%' };
      if (map[name] && !prefix) return map[name];
      var p = prefix === 'u' ? '\\mu' : prefix;
      if (name === 'ohm') return (prefix === 'u' ? '\\mu' : '\\mathrm{' + prefix + '}') + '\\Omega';
      return (prefix === 'u' ? '\\mu\\mathrm{' + name + '}' : '\\mathrm{' + p + name + '}');
    }
    function unitTex(u) {
      var num = [], den = [];
      u.units.forEach(function (c) {
        var t = unitNameTex(c.prefix.name, c.unit.name);
        var p = c.power;
        var ap = Math.abs(p);
        var pw = ap === 1 ? '' : '^{' + (Number.isInteger(ap) ? ap : +ap.toFixed(4)) + '}';
        (p > 0 ? num : den).push(t + pw);
      });
      if (!num.length) return u.units.map(function (c) {
        var ap = Math.abs(c.power);
        return unitNameTex(c.prefix.name, c.unit.name) + '^{-' + (Number.isInteger(ap) ? ap : +ap.toFixed(4)) + '}';
      }).join('\\,');
      var n = num.join('\\,');
      if (!den.length) return n;
      return n + '/' + (den.length > 1 ? '(' + den.join('\\,') + ')' : den[0]);
    }
    function unitText(u) {
      var num = [], den = [];
      u.units.forEach(function (c) {
        var t = c.prefix.name + c.unit.name, ap = Math.abs(c.power);
        var pw = ap === 1 ? '' : '^' + (Number.isInteger(ap) ? ap : +ap.toFixed(4));
        (c.power > 0 ? num : den).push(t + pw);
      });
      if (!num.length) return u.units.map(function (c) { return c.prefix.name + c.unit.name + '^' + (Number.isInteger(c.power) ? c.power : +c.power.toFixed(4)); }).join(' ');
      if (!den.length) return num.join(' ');
      return num.join(' ') + '/' + (den.length > 1 ? '(' + den.join(' ') + ')' : den[0]);
    }
    function unitString(u) {   // parseable by math.js, e.g. "mW um^-2"
      return u.units.map(function (c) {
        var p = c.power;
        return c.prefix.name + c.unit.name + (p === 1 ? '' : '^' + (+p.toFixed(6)));
      }).join(' ');
    }

    function prefixable(c) { return c.unit.prefixes && c.unit.prefixes.k; }
    function withBestPrefix(u) {
      // u: single component, power 1, any prefix. Returns unit with fixPrefix + chosen prefix.
      var c = u.units[0];
      var baseName = c.unit.name;
      var vBase = u.value / c.unit.value;   // value in the unprefixed unit (math.js stores SI value)
      if (!prefixable(c)) { var keep = u.clone(); keep.fixPrefix = true; return { unit: keep, sci: true }; }
      if (baseName === 'g') {                       // masses: kg unless clearly in the g..mg range
        var kgv = u.value;
        var tgt = (Math.abs(kgv) >= 1e-6 && Math.abs(kgv) < 1) ? 'g' : 'kg';
        if (Math.abs(kgv) >= 1e-6 && Math.abs(kgv) < 1e-3) tgt = 'mg';
        return { unit: u.to(tgt), sci: tgt === 'kg' };
      }
      var av = Math.abs(vBase);
      if (av === 0 || !isFinite(av)) return { unit: u.to(baseName), sci: false };
      var e3 = Math.floor(Math.log10(av) / 3) * 3;
      var pre = null;
      Object.keys(PREFIX_EXP).forEach(function (p) { if (PREFIX_EXP[p] === e3) pre = p; });
      // keep the user's centimetres if they used them
      if (c.prefix.name === 'c' && baseName === 'm' && av >= 1e-2 && av < 10) pre = 'c';
      if (pre === null || !c.unit.prefixes[pre]) return { unit: u.to(baseName), sci: true };
      return { unit: u.to(pre + baseName), sci: false };
    }
    function coherent(u) {
      // strip prefixes (g -> kg)
      var parts = u.units.map(function (c) {
        var nm = c.unit.name === 'g' ? 'kg' : c.unit.name;
        var p = c.power;
        return nm + (p === 1 ? '' : '^' + (+p.toFixed(6)));
      });
      try { return u.to(parts.join(' ')); } catch (e) { return null; }
    }
    var PREFERRED = ['m/s', 'm/s^2', 'V/m', 'W/m^2', 's/m', 'J/K', 'C m', 'T/m', 'G/cm', 'm^-3', 'm^-2', 'm^-1', 'm^2', 'm^3',
      'kg/m^3', 'J/T', 'Hz/T', 'J s', 'kg m/s', 'm^2/s', 'J^-1', 'W/K', 'K/W', 'A/m', 'V/s', 'Hz/V', 's^2'];
    var preferredUnits = null;
    function preferredFor(u) {
      if (!preferredUnits) preferredUnits = PREFERRED.map(function (p) { return math.unit(p); });
      for (var i = 0; i < preferredUnits.length; i++) if (u.equalBase(preferredUnits[i])) return PREFERRED[i];
      return null;
    }
    function niceUnit(u) {
      if (u.value === null || u.value === undefined) return { unit: u, sci: false };
      if (u.fixPrefix) return { unit: u, sci: true, explicit: true };
      var cs = u.units;
      if (cs.length === 1 && cs[0].power === 1) return withBestPrefix(u);
      if (cs.length === 1 && cs[0].power === -1 && cs[0].unit.name === 's') {
        var r = u.to('s^-1'); return { unit: r, sci: true };
      }
      // compound unit that collapses to one named unit (kg m/s^2 -> N, J s Hz -> J, C V -> J)
      var simp0 = u.simplify();
      if (cs.length > 1 && simp0.units.length === 1 && simp0.units[0].power === 1) return withBestPrefix(simp0);
      // user-typed compound units with a reasonable magnitude: keep them (5 cm^2, 3 mW/cm^2)
      var reasonable = cs.length <= 3 && cs.every(function (c) { return Number.isInteger(c.power); });
      if (reasonable) {
        var keep = u.clone(); keep.fixPrefix = true;
        var v = Math.abs(keep.toNumber(unitString(keep)));
        if (v === 0 || (v >= 1e-3 && v < 1e6)) return { unit: keep, sci: false };
      }
      var simp = u.simplify();
      if (simp.units.length === 1 && simp.units[0].power === 1) return withBestPrefix(simp);
      var pref = preferredFor(u);
      if (pref) { var pu = u.to(pref); return { unit: pu, sci: true }; }
      var coh = coherent(u);
      var pick = coh && coh.units.length <= simp.units.length ? coh : simp;
      pick = pick.clone(); pick.fixPrefix = true;
      return { unit: pick, sci: true };
    }
    function fmtUnit(u, prec) {
      if (u.value === null || u.value === undefined) return { text: unitText(u), tex: unitTex(u) };
      var nu = niceUnit(u);
      var U = nu.unit;
      var us = unitString(U);
      var val;
      try { val = U.toNumeric(us); } catch (e) { val = U.toNumber(us); }
      var N = math.isComplex(val) ? fmtComplex(val, prec) : fmtNum(val, prec, nu.sci ? 6 : 10);
      if (math.isComplex(val) && val.im !== 0) N = { text: '(' + N.text + ')', tex: '(' + N.tex + ')' };
      return { text: N.text + ' ' + us, tex: N.tex + '\\;' + unitTex(U), unitStr: us, num: val };
    }
    function fmtScalar(x, prec) {
      if (typeof x === 'number') return fmtNum(x, prec);
      if (math.isComplex(x)) return fmtComplex(x, prec);
      if (math.isUnit(x)) return fmtUnit(x, prec);
      if (math.isBigNumber(x) || math.isFraction(x)) return fmtNum(Number(x), prec);
      if (typeof x === 'boolean') return { text: String(x), tex: '\\mathrm{' + x + '}' };
      if (typeof x === 'string') return { text: JSON.stringify(x), tex: '\\text{“' + x.replace(/[\\{}$&#^_%~]/g, '') + '”}' };
      if (x === null || x === undefined) return { text: String(x), tex: '\\mathrm{' + x + '}' };
      return null;
    }
    function zeroTiny(a) {
      var mx = 0;
      var all = math.flatten(a);
      all.forEach(function (x) { var v = (typeof x === 'number' || math.isComplex(x)) ? math.abs(x) : 0; if (v > mx) mx = v; });
      if (!mx) return a;
      var tol = mx * 1e-13;
      function fix(x) {
        if (Array.isArray(x)) return x.map(fix);
        if (typeof x === 'number') return Math.abs(x) < tol ? 0 : x;
        if (math.isComplex(x)) { var re = Math.abs(x.re) < tol ? 0 : x.re, im = Math.abs(x.im) < tol ? 0 : x.im; return im === 0 ? re : math.complex(re, im); }
        return x;
      }
      return fix(a);
    }
    function fmtMatrix(arr, prec) {
      var size = math.size(arr);
      size = Array.isArray(size) ? size : size.valueOf();
      var a = zeroTiny(toArray(arr));
      if (size.length === 1) {
        var n = size[0];
        if (n === 0) return { text: '[]', tex: '[\\,]' };
        var items = a.map(function (x) { return fmtValue(x, prec); });
        var text = '[' + items.map(function (i) { return i.text; }).join(', ') + ']';
        if (n <= 10) return { text: text, tex: '\\begin{bmatrix}' + items.map(function (i) { return i.tex; }).join('\\\\') + '\\end{bmatrix}' };
        var shown = items.slice(0, 6).map(function (i) { return i.tex; }).concat(['\\ldots'], items.slice(-2).map(function (i) { return i.tex; }));
        return { text: text, tex: '\\left[' + shown.join(',\\ ') + '\\right]_{' + n + '}' };
      }
      if (size.length === 2) {
        var r = size[0], c = size[1];
        var maxR = 12, maxC = 12;
        var rowsT = [], rowsX = [];
        for (var i = 0; i < r; i++) {
          var rt = [], rx = [];
          for (var j = 0; j < c; j++) {
            var f = fmtValue(a[i][j], prec);
            rx.push(f.text);
            if (i < maxR && j < maxC) rt.push(f.tex);
          }
          if (c > maxC) rt.push('\\cdots');
          rowsX.push('[' + rx.join(', ') + ']');
          if (i < maxR) rowsT.push(rt.join(' & '));
        }
        if (r > maxR) rowsT.push('\\vdots');
        return { text: '[' + rowsX.join(', ') + ']', tex: '\\begin{bmatrix}' + rowsT.join('\\\\') + '\\end{bmatrix}' + (r > maxR || c > maxC ? '_{' + r + '\\times' + c + '}' : '') };
      }
      return { text: math.format(arr, { precision: prec }), tex: '\\text{' + size.join('×') + ' array}' };
    }
    function fmtEig(r, prec) {
      var vals = r.values.map(function (v) { return fmtScalar(v, prec); });
      var V = fmtMatrix(r.V, prec);
      return {
        text: 'values: [' + vals.map(function (v) { return v.text; }).join(', ') + '], vectors (columns): ' + V.text,
        tex: '\\lambda = \\left(' + vals.map(function (v) { return v.tex; }).join(',\\ ') + '\\right),\\quad V = ' + V.tex
      };
    }
    function fmtValue(x, prec) {
      prec = prec || 10;
      var s = fmtScalar(x, prec);
      if (s) return s;
      if (math.isMatrix(x) || Array.isArray(x)) return fmtMatrix(x, prec);
      if (typeof x === 'function') {
        var sg = x.syntax || (x.name ? x.name + '(…)' : 'function');
        return { text: sg, tex: '\\mathrm{' + escTex(sg) + '}' };
      }
      if (x && x.__eig) return fmtEig(x, prec);
      if (x && x.values && x.eigenvectors) {          // raw math.js eigs() result
        var vals = flat(x.values);
        var cols = x.eigenvectors.map(function (ev) { var v = flat(ev.vector); var n = math.norm(v); return normalizePhase(v.map(function (c) { return math.divide(c, n); })); });
        var n = cols.length ? cols[0].length : 0, V = [];
        for (var i = 0; i < n; i++) V.push(cols.map(function (c) { return c[i]; }));
        return fmtEig({ values: vals.map(cleanScalar), V: V }, prec);
      }
      if (x && x.isResultSet) {
        var parts = x.entries.map(function (e) { return fmtValue(e, prec); });
        return { text: parts.map(function (p) { return p.text; }).join('; '), tex: parts.map(function (p) { return p.tex; }).join(';\\ ') };
      }
      if (x && typeof x === 'object') {
        var keys = Object.keys(x);
        return { text: '{' + keys.slice(0, 12).join(', ') + (keys.length > 12 ? ', …' : '') + '}', tex: '\\{\\text{object with ' + keys.length + ' fields}\\}' };
      }
      return { text: String(x), tex: '\\text{' + escTex(String(x)) + '}' };
    }
    function escTex(s) { return String(s).replace(/\\/g, '\\backslash ').replace(/([{}_$&#%^~])/g, '\\$1'); }

    // ---- expression -> TeX ---------------------------------------------------------------
    var ybTex = (yb && yb.tex) || {};
    function greekTex(n) { return GREEK_SET.has(n) ? '\\' + n : null; }
    function partTex(s, isBase) {
      var gr = greekTex(s);
      if (gr) return gr;
      if (s === 'hbar') return '\\hbar';
      if (s.length === 1) return s;
      return isBase ? '\\mathit{' + escTex(s) + '}' : '\\mathrm{' + escTex(s) + '}';
    }
    function symbolTex(name, scope) {
      if (scope && scope.local && scope.local.has(name)) return genericSymbolTex(name);
      if (meta[name] && meta[name].tex && meta[name].kind === 'const') return meta[name].tex;
      if (name === 'pi') return '\\pi';
      if (name === 'Infinity') return '\\infty';
      if (name === 'hbar') return '\\hbar';
      if (!(scope ? scope.has(name) : base.has(name)) && !(name in math) && isUnitName(name)) {
        try { var u = Unit.parse(name); return u.units.map(function (c) { return unitNameTex(c.prefix.name, c.unit.name); }).join(''); } catch (e) { /* fallthrough */ }
      }
      return genericSymbolTex(name);
    }
    function genericSymbolTex(name) {
      if (/^\$\d+$/.test(name)) return '\\$' + name.slice(1);
      var u = name.indexOf('_');
      if (u > 0 && u < name.length - 1) {
        var b = name.slice(0, u), subs = name.slice(u + 1).split('_').map(function (p) { return partTex(p, false); });
        var bm = b.match(/^([A-Za-z]+?)(\d+)$/);
        if (bm && (GREEK_SET.has(bm[1]) || bm[1].length <= 3)) { subs.unshift(bm[2]); b = bm[1]; }
        return partTex(b, true) + '_{' + subs.join(',') + '}';
      }
      var m = name.match(/^([A-Za-z]+?)(\d+)$/);
      if (m && (GREEK_SET.has(m[1]) || m[1].length <= 3)) return partTex(m[1], true) + '_{' + m[2] + '}';
      return partTex(name, true);
    }
    function texHandlerFor(scope) {
      return function handler(node, opts) {
        if (node.type === 'SymbolNode') return '{' + symbolTex(node.name, scope) + '}';
        if (node.type === 'AssignmentNode' && node.object && node.object.type === 'SymbolNode' && !node.index) {
          return '{' + genericSymbolTex(node.object.name) + '}=' + node.value.toTex(opts);
        }
        if (node.type === 'AccessorNode' && node.object && node.object.type === 'SymbolNode' && node.index && node.index.dotNotation) {
          var prop = node.index.getObjectProperty();
          var t = (node.object.name === 'Yb' && ybTex[prop]) ? ybTex[prop] : genericSymbolTex(prop);
          return '{\\mathrm{' + escTex(node.object.name) + '}.' + t + '}';
        }
        if (node.type === 'FunctionNode') {
          var fnNode = node.fn;
          var args = node.args.map(function (a) { return a.toTex(opts); }).join(',\\,');
          if (fnNode.type === 'AccessorNode') return fnNode.toTex(opts) + '\\left(' + args + '\\right)';
          var nm = fnNode.name;
          var isLib = base.has(nm) && typeof base.get(nm) === 'function';
          var isUser = scope && scope.local && scope.local.has(nm);
          if (isLib || isUser || nm.indexOf('_') >= 0) {
            if (nm === 'ln') return '\\ln\\left(' + args + '\\right)';
            return '\\operatorname{' + escTex(nm) + '}\\left(' + args + '\\right)';
          }
        }
        if (node.type === 'ConstantNode' && typeof node.value === 'number') {
          var s = String(node.value);
          var mm = s.match(/^([\d.]+)e([+-]?\d+)$/);
          if (mm) return '{' + (mm[1] === '1' ? '' : mm[1] + '\\times ') + '10^{' + parseInt(mm[2], 10) + '}}';
          return s;
        }
        if (node.type === 'ConstantNode' && typeof node.value === 'string') return '\\text{“' + node.value.replace(/[\\{}$&#^_%~]/g, '') + '”}';
        return undefined;
      };
    }
    var DEGRE = /\\left\(\\left\((-?[^()]*?)~\{\^\{\\circ\}\\mathrm\{([CF])\}\}\\right\)\\rightarrow\{\\mathrm\{K\}\}\\right\)/g;
    function nodeTex(node, scope) {
      var t = node.toTex({ parenthesis: 'keep', implicit: 'hide', handler: texHandlerFor(scope) });
      return t.replace(DEGRE, '$1~{^{\\circ}\\mathrm{$2}}');   // hide the "(450 °C → K)" rewrite
    }

    // ---- sheet evaluation ----------------------------------------------------------------
    var parseCache = new Map();
    function parseCached(s) {
      var hit = parseCache.get(s);
      if (hit) return hit;
      var node = math.parse(s);
      var entry = { node: node, code: node.compile() };
      if (parseCache.size > 2000) parseCache.clear();
      parseCache.set(s, entry);
      return entry;
    }
    function splitComment(src) {
      // math.js supports '#' comments; find a '#' outside quotes
      var inQ = false;
      for (var i = 0; i < src.length; i++) {
        var ch = src[i];
        if (ch === '"') inQ = !inQ;
        else if (ch === '#' && !inQ) return { expr: src.slice(0, i), comment: src.slice(i + 1).trim() };
      }
      return { expr: src, comment: '' };
    }

    function evaluateSheet(lines, opt) {
      opt = opt || {};
      var prec = opt.precision || 10;
      var scope = new Scope(opt.angle === 'deg' ? degLayer : emptyLayer);
      var out = [];
      var ans;
      lines.forEach(function (src, idx) {
        var r = { index: idx, src: src };
        out.push(r);
        var trimmed = (src || '').trim();
        if (!trimmed) { r.kind = 'empty'; return; }
        var sc = splitComment(src);
        r.comment = sc.comment;
        if (!sc.expr.trim()) { r.kind = 'note'; return; }
        try {
          var pre = preprocess(sc.expr, scope);
          var p = parseCached(pre);
          r.node = p.node;
          try { r.exprTex = nodeTex(p.node, scope); } catch (e) { r.exprTex = null; }
          if (ans !== undefined) scope.set('ans', ans);
          checkAccessors(p.node, scope);
          var v = p.code.evaluate(scope);
          var node = p.node;
          if (node.type === 'FunctionAssignmentNode') {
            r.kind = 'function';
            r.name = node.name;
            r.text = node.name + '(' + node.params.join(', ') + ')';
            r.tex = '\\text{defined}';
          } else {
            if (v && v.isResultSet) {
              var ents = v.entries;
              v = ents.length ? ents[ents.length - 1] : undefined;
            }
            if (v === undefined) { r.kind = 'empty'; return; }
            if (v && v.__plot) { r.kind = 'plot'; r.plot = v; r.text = 'plot'; }
            else {
              var f = fmtValue(v, prec);
              r.kind = node.type === 'AssignmentNode' ? 'assign' : 'value';
              if (node.type === 'AssignmentNode') r.name = node.name || (node.object && node.object.name);
              r.text = f.text; r.tex = f.tex;
              if (math.isUnit(v)) { r.unitStr = f.unitStr; }
              r.value = v;
              if (typeof v !== 'function') ans = v;
            }
            scope.set('$' + (idx + 1), v);
          }
        } catch (err) {
          r.kind = 'error';
          r.error = cleanError(err);
        }
      });
      lastScope = scope;
      return out;
    }
    function checkAccessors(node, scope) {
      node.traverse(function (n) {
        if (n.type === 'AccessorNode' && n.object && n.object.type === 'SymbolNode' && n.index && n.index.dotNotation) {
          var obj = scope.get(n.object.name), key = n.index.getObjectProperty();
          if (obj && typeof obj === 'object' && !math.isUnit(obj) && !math.isMatrix(obj) && !Array.isArray(obj) && !(key in obj)) {
            var close = Object.keys(obj).filter(function (k) { return k.toLowerCase().indexOf(key.toLowerCase().slice(0, 3)) === 0; }).slice(0, 4);
            throw new Error(n.object.name + ' has no “' + key + '”' + (close.length ? ' — did you mean ' + close.map(function (c) { return n.object.name + '.' + c; }).join(', ') + '?' : ' (type ' + n.object.name + '. to see the list)'));
          }
        }
      });
    }
    function cleanError(err) {
      var m = (err && err.message) ? err.message : String(err);
      m = m.replace(/\(char \d+\)/, '').replace(/\s+/g, ' ').trim();
      if (/Unexpected type of argument in function (add|subtract)/.test(m) || /Units do not match/.test(m)) m += ' — check that the units are compatible';
      if (/Undefined symbol/.test(m)) {
        var s = m.match(/Undefined symbol (\S+)/);
        if (s) m = 'Unknown name “' + s[1] + '”';
      }
      return m;
    }
    var lastScope = new Scope();

    function exprTex(src) {
      try {
        var sc = splitComment(src);
        if (!sc.expr.trim()) return null;
        return nodeTex(math.parse(preprocess(sc.expr, lastScope)), lastScope);
      } catch (e) { return null; }
    }

    // ---- completions -----------------------------------------------------------------
    var MATH_FNS = ['sqrt', 'cbrt', 'nthRoot', 'exp', 'log', 'log10', 'log2', 'ln', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
      'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'sec', 'csc', 'cot', 'abs', 'sign', 'round', 'floor', 'ceil', 'fix', 'mod',
      'gcd', 'lcm', 'factorial', 'gamma', 'lgamma', 'erf', 'zeta', 'combinations', 'permutations', 'max', 'min', 'sum', 'prod', 'mean',
      'median', 'std', 'variance', 're', 'im', 'conj', 'arg', 'det', 'inv', 'pinv', 'transpose', 'ctranspose', 'trace', 'kron', 'expm',
      'sqrtm', 'eigs', 'norm', 'dot', 'cross', 'diag', 'identity', 'zeros', 'ones', 'size', 'range', 'reshape', 'concat', 'lusolve',
      'lsolve', 'qr', 'lup', 'schur', 'hypot', 'number', 'unit', 'to', 'map', 'filter', 'sort', 'random', 'derivative', 'simplify', 'cumsum', 'diff', 'pow', 'distance', 'matrixFromColumns'];
    var MATH_CONST = ['pi', 'e', 'i', 'tau', 'phi', 'Infinity'];
    var staticItems = [];
    (function buildStatic() {
      var seen = new Set();
      function add(name, kind, desc) { if (seen.has(name)) return; seen.add(name); staticItems.push({ name: name, kind: kind, desc: desc || '' }); }
      Object.keys(meta).forEach(function (k) { add(k, meta[k].kind, meta[k].desc); });
      MATH_FNS.forEach(function (k) { add(k, 'fn', 'math function'); });
      MATH_CONST.forEach(function (k) { add(k, 'const', 'math constant'); });
      add('Yb', 'obj', '¹⁷⁴Yb data — type Yb. for the list');
    })();
    function completions(token) {
      if (!token) return [];
      var dot = token.lastIndexOf('.');
      if (dot > 0) {
        var objName = token.slice(0, dot), pre = token.slice(dot + 1);
        var obj = lastScope.get(objName);
        if (!obj || typeof obj !== 'object' || math.isUnit(obj) || math.isMatrix(obj)) return [];
        var ybDesc = (yb && objName === 'Yb') ? yb.desc : {};
        return Object.keys(obj).filter(function (k) { return k.toLowerCase().indexOf(pre.toLowerCase()) === 0; })
          .sort(function (a, b) { var ca = a.indexOf(pre) === 0 ? 0 : 1, cb = b.indexOf(pre) === 0 ? 0 : 1; return ca - cb; })
          .slice(0, 60).map(function (k) { return { name: objName + '.' + k, insert: objName + '.' + k, kind: typeof obj[k] === 'function' ? 'fn' : 'yb', desc: ybDesc[k] || '' }; });
      }
      var low = token.toLowerCase();
      var items = staticItems.slice();
      lastScope.local.forEach(function (v, k) { if (k[0] !== '$' && k !== 'ans') items.push({ name: k, kind: typeof v === 'function' ? 'fn' : 'var', desc: 'your variable' }); });
      var starts = [], contains = [];
      items.forEach(function (it) {
        var n = it.name.toLowerCase();
        if (n === low) return;
        if (n.indexOf(low) === 0) starts.push(it);
        else if (low.length >= 3 && n.indexOf(low) > 0) contains.push(it);
      });
      starts.sort(function (a, b) {
        var ca = a.name.indexOf(token) === 0 ? 0 : 1, cb = b.name.indexOf(token) === 0 ? 0 : 1;
        return ca - cb || a.name.length - b.name.length;
      });
      return starts.concat(contains).slice(0, 10);
    }

    return {
      math: math,
      C: C,
      meta: meta,
      codata: codata,
      equations: equations,
      yb: yb,
      errors: eqErrors,
      base: base,
      evaluateSheet: evaluateSheet,
      exprTex: exprTex,
      fmtValue: fmtValue,
      fmtNum: fmtNum,
      fmtUnit: fmtUnit,
      unitTex: unitTex,
      preprocess: function (s) { return preprocess(s, lastScope); },
      completions: completions,
      symbolTex: symbolTex,
      isUnitName: isUnitName,
      isCommonUnit: isCommonUnit,
      lastScope: function () { return lastScope; },
      newScope: function (deg) { return new Scope(deg ? degLayer : emptyLayer); }
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
