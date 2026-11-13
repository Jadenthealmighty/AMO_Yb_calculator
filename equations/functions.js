/* Functions, lineshapes & numerical tools (integrate, root-find, differentiate — all unit-aware). */
(function (g) {
  var P = g.PhysCalc = g.PhysCalc || {};
  P.equations = P.equations || [];
  var cat = 'Functions, lineshapes & numerics';

  // helpers for unit-aware numerics: map x (Unit or number) <-> plain numbers
  function xAxis(math, a, b) {
    if (math.isUnit(a)) {
      var u = a.formatUnits ? a.formatUnits() : '';
      var unitStr = a.units.map(function (c) { return c.prefix.name + c.unit.name + (c.power === 1 ? '' : '^' + c.power); }).join(' ');
      if (a.units.length === 1 && a.units[0].unit.offset) unitStr = 'K';          // degC etc. -> integrate in K
      return {
        unit: unitStr,
        lo: a.toNumber(unitStr), hi: b.toNumber(unitStr),
        make: function (x) { return math.unit(x, unitStr); },
        scale: math.unit(1, unitStr)
      };
    }
    return { unit: null, lo: a, hi: b, make: function (x) { return x; }, scale: 1 };
  }
  function yReader(math, sample) {
    if (math.isUnit(sample)) {
      var s = sample.clone(); s.fixPrefix = false;
      var unitStr = s.units.map(function (c) { return c.prefix.name + c.unit.name + (c.power === 1 ? '' : '^' + c.power); }).join(' ');
      return { read: function (y) { return y.toNumber(unitStr); }, scale: math.unit(1, unitStr) };
    }
    return { read: function (y) { return math.isComplex(y) ? y.re : Number(y); }, scale: 1 };
  }

  [
    { name: 'Gaussian (1D)', def: 'gauss1D(x, A, x0, sigma) = A*exp(-(x - x0)^2/(2*sigma^2))', tex: 'A\\,e^{-(x-x_0)^2/2\\sigma^2}', args: { x: 'variable', A: 'amplitude', x0: 'centre', sigma: 'standard deviation' }, returns: 'units of A', example: 'gauss1D(1, 1, 0, 1)' },
    { name: 'Gaussian (2D, elliptical)', def: 'gauss2D(x, y, A, x0, y0, sx, sy) = A*exp(-(x - x0)^2/(2*sx^2) - (y - y0)^2/(2*sy^2))', tex: 'A\\exp\\!\\left[-\\frac{(x-x_0)^2}{2\\sigma_x^2}-\\frac{(y-y_0)^2}{2\\sigma_y^2}\\right]', args: { x: 'x', y: 'y', A: 'amplitude', x0: 'centre x', y0: 'centre y', sx: 'σx', sy: 'σy' }, returns: 'units of A', example: 'G2(x, y) = gauss2D(x, y, 1, 0, 0, 1, 2)', also: ['plot2d(G2, -5, 5, -5, 5)'] },
    { name: 'Gaussian (2D, rotated)', def: 'gauss2D_rot(x, y, A, x0, y0, sx, sy, th) = A*exp(-((x - x0)*cos(th) + (y - y0)*sin(th))^2/(2*sx^2) - (-(x - x0)*sin(th) + (y - y0)*cos(th))^2/(2*sy^2))', tex: "A\\exp\\!\\left[-\\frac{x'^2}{2\\sigma_x^2}-\\frac{y'^2}{2\\sigma_y^2}\\right],\\ (x',y') = R(\\theta)(x-x_0, y-y_0)", args: { x: 'x', y: 'y', A: 'amplitude', x0: 'centre x', y0: 'centre y', sx: 'σ along rotated x', sy: 'σ along rotated y', th: 'rotation angle' }, returns: 'units of A', example: 'G3(x, y) = gauss2D_rot(x, y, 1, 0, 0, 2, 0.7, 30 deg)', also: ['plot2d(G3, -5, 5, -5, 5)'] },
    { name: 'Normal distribution pdf', def: 'gauss_pdf(x, mu, sigma) = exp(-(x - mu)^2/(2*sigma^2))/(sigma*sqrt(2*pi))', tex: '\\frac{1}{\\sigma\\sqrt{2\\pi}}e^{-(x-\\mu)^2/2\\sigma^2}', args: { x: 'variable', mu: 'mean', sigma: 'std. dev.' }, returns: 'density', example: 'gauss_pdf(0, 0, 1)' },
    { name: 'Lorentzian (normalized)', def: 'lorentz(x, x0, fwhm) = (fwhm/2)/(pi*((x - x0)^2 + (fwhm/2)^2))', tex: '\\frac{1}{\\pi}\\frac{\\Gamma/2}{(x-x_0)^2+(\\Gamma/2)^2}', args: { x: 'variable', x0: 'centre', fwhm: 'FWHM' }, returns: 'density', example: 'lorentz(0 MHz, 0 MHz, 29 MHz)', also: ['L1(x) = lorentz(x, 0 MHz, 29 MHz)', 'G1(x) = gauss_pdf(x, 0 MHz, sigma_from_fwhm(29 MHz))', 'plot(L1, G1, -60 MHz, 60 MHz)'] },
    { name: 'Lorentzian (peak height A)', def: 'lorentz_peak(x, A, x0, fwhm) = A*(fwhm/2)^2/((x - x0)^2 + (fwhm/2)^2)', tex: 'A\\frac{(\\Gamma/2)^2}{(x-x_0)^2+(\\Gamma/2)^2}', args: { x: 'variable', A: 'peak', x0: 'centre', fwhm: 'FWHM' }, returns: 'units of A', example: 'lorentz_peak(10 MHz, 1, 0 MHz, 29 MHz)' },
    {
      name: 'Pseudo-Voigt (normalized)', def: 'pvoigt(x, x0, fG, fL) = pv_eta(fG, fL)*lorentz(x, x0, pv_f(fG, fL)) + (1 - pv_eta(fG, fL))*gauss_pdf(x, x0, pv_f(fG, fL)/(2*sqrt(2*log(2))))',
      tex: 'V \\approx \\eta L(x;f) + (1-\\eta)G(x;f)', args: { x: 'variable', x0: 'centre', fG: 'Gaussian FWHM', fL: 'Lorentzian FWHM' }, returns: 'density', example: 'pvoigt(0 MHz, 0 MHz, 50 MHz, 29 MHz)',
      notes: 'Thompson, Cox & Hastings, J. Appl. Cryst. 20, 79 (1987); ≈1 % accuracy.'
    },
    { name: 'Voigt total FWHM (approx.)', def: 'pv_f(fG, fL) = (fG^5 + 2.69269*fG^4*fL + 2.42843*fG^3*fL^2 + 4.47163*fG^2*fL^3 + 0.07842*fG*fL^4 + fL^5)^(1/5)', tex: 'f = (f_G^5 + 2.69269 f_G^4 f_L + \\dots + f_L^5)^{1/5}', args: { fG: 'Gaussian FWHM', fL: 'Lorentzian FWHM' }, returns: 'FWHM', example: 'pv_f(50 MHz, 29 MHz)' },
    { name: 'Pseudo-Voigt mixing η', def: 'pv_eta(fG, fL) = 1.36603*(fL/pv_f(fG, fL)) - 0.47719*(fL/pv_f(fG, fL))^2 + 0.11116*(fL/pv_f(fG, fL))^3', tex: '\\eta = 1.36603\\,\\tfrac{f_L}{f} - 0.47719\\left(\\tfrac{f_L}{f}\\right)^2 + 0.11116\\left(\\tfrac{f_L}{f}\\right)^3', args: { fG: 'Gaussian FWHM', fL: 'Lorentzian FWHM' }, returns: '0…1', example: 'pv_eta(50 MHz, 29 MHz)' },
    { name: 'σ from FWHM', def: 'sigma_from_fwhm(fw) = fw/(2*sqrt(2*log(2)))', tex: '\\sigma = \\mathrm{FWHM}/2\\sqrt{2\\ln2}', args: { fw: 'FWHM' }, returns: 'same units', example: 'sigma_from_fwhm(1 mm)' },
    { name: 'FWHM from σ', def: 'fwhm_from_sigma(s0) = 2*sqrt(2*log(2))*s0', tex: '\\mathrm{FWHM} = 2\\sqrt{2\\ln2}\\,\\sigma', args: { s0: 'σ' }, returns: 'same units', example: 'fwhm_from_sigma(1 mm)' },
    {
      name: 'sinc', sig: 'sinc(x)', js: function (ctx) { var math = ctx.math; return function sinc(x) { if (math.isUnit(x)) x = x.toNumber('rad'); return Math.abs(x) < 1e-12 ? 1 : Math.sin(x) / x; }; },
      tex: '\\mathrm{sinc}\\,x = \\sin x/x', args: { x: 'argument (rad)' }, returns: 'number', example: 'sinc(pi/2)'
    },
    {
      name: 'Heaviside step', sig: 'heaviside(x)', js: function (ctx) { var math = ctx.math; return function heaviside(x) { var v = math.isUnit(x) ? x.value : x; return v > 0 ? 1 : (v < 0 ? 0 : 0.5); }; },
      tex: '\\Theta(x)', args: { x: 'argument' }, returns: '0, ½, 1', example: 'heaviside(-2)'
    },
    { name: 'Logistic step', def: 'logistic(x, x0, w) = 1/(1 + exp(-(x - x0)/w))', tex: '\\frac{1}{1+e^{-(x-x_0)/w}}', args: { x: 'variable', x0: 'midpoint', w: 'width' }, returns: '0…1', example: 'logistic(1, 0, 1)' },
    { name: 'Exponential decay', def: 'exp_decay(t, A, tau, C0) = A*exp(-t/tau) + C0', tex: 'A e^{-t/\\tau} + C', args: { t: 'time', A: 'amplitude', tau: 'time constant', C0: 'offset' }, returns: 'units of A', example: 'exp_decay(1 s, 1, 2 s, 0)' },
    { name: 'Damped oscillation', def: 'damped_osc(t, A, tau, f, phi) = A*exp(-t/tau)*cos(2*pi*f*t + phi)', tex: 'A e^{-t/\\tau}\\cos(2\\pi f t+\\phi)', args: { t: 'time', A: 'amplitude', tau: 'decay time', f: 'frequency', phi: 'phase' }, returns: 'units of A', example: 'damped_osc(1 ms, 1, 5 ms, 1 kHz, 0)' },
    {
      name: 'Evenly spaced points', sig: 'linspace(a, b, n)', js: function (ctx) {
        var math = ctx.math;
        return function linspace(a, b, n) { n = Math.round(Number(n)); var out = []; for (var k = 0; k < n; k++) out.push(math.add(a, math.multiply(math.subtract(b, a), n > 1 ? k / (n - 1) : 0))); return math.matrix(out); };
      }, tex: '\\mathrm{linspace}(a,b,n)', args: { a: 'start', b: 'stop', n: 'count' }, returns: 'vector', example: 'linspace(0, 1, 5)'
    },
    {
      name: 'Numerical integral ∫ f dx', sig: 'integrate(f, a, b)', js: function (ctx) {
        var math = ctx.math;
        return function integrate(f, a, b, nIn) {
          if (typeof f !== 'function') throw new Error('integrate(f, a, b): f must be a function, e.g. p(v) = MB_speed(v, Yb.m, 700 K)');
          var X = xAxis(math, a, b), n = Math.max(2, Math.round(nIn || 2000)); if (n % 2) n++;
          var h = (X.hi - X.lo) / n, Y = null, s = 0;
          for (var k = 0; k <= n; k++) {
            var y = f(X.make(X.lo + k * h));
            if (!Y) Y = yReader(math, y);
            var w = (k === 0 || k === n) ? 1 : (k % 2 ? 4 : 2);
            s += w * Y.read(y);
          }
          var val = s * h / 3;
          return math.multiply(math.multiply(val, Y.scale), X.scale);
        };
      }, tex: '\\int_a^b f(x)\\,dx', args: { f: 'function of one variable', a: 'lower limit', b: 'upper limit' }, returns: 'units of f·x', example: 'integrate(sin, 0, pi)', notes: "Composite Simpson's rule, 2000 intervals (optional 4th argument)."
    },
    {
      name: 'Root finder f(x) = 0', sig: 'findroot(f, a, b)', js: function (ctx) {
        var math = ctx.math;
        return function findroot(f, a, b) {
          if (typeof f !== 'function') throw new Error('findroot(f, a, b): f must be a function');
          var X = xAxis(math, a, b), lo = X.lo, hi = X.hi;
          var Y = null; function F(x) { var y = f(X.make(x)); if (!Y) Y = yReader(math, y); return Y.read(y); }
          var flo = F(lo), fhi = F(hi);
          if (flo === 0) return X.make(lo); if (fhi === 0) return X.make(hi);
          if (flo * fhi > 0) throw new Error('findroot: f(a) and f(b) must have opposite signs');
          for (var k = 0; k < 200; k++) {
            var mid = 0.5 * (lo + hi), fm = F(mid);
            if (fm === 0 || Math.abs(hi - lo) <= 1e-15 * Math.max(1, Math.abs(mid))) { lo = hi = mid; break; }
            if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
          }
          return X.make(0.5 * (lo + hi));
        };
      }, tex: 'f(x^*) = 0,\\ x^*\\in[a,b]', args: { f: 'function', a: 'bracket low', b: 'bracket high' }, returns: 'x (units of a)', example: 'findroot(cos, 0, 3)', notes: 'Bisection to machine precision. e.g. T for 1e-3 torr: q(T) = Yb.Pvap(T) - 1e-3 torr, findroot(q, 500 K, 900 K)'
    },
    {
      name: 'Numerical derivative df/dx', sig: 'nderiv(f, x)', js: function (ctx) {
        var math = ctx.math;
        return function nderiv(f, x) {
          var X = xAxis(math, x, x), x0 = X.lo, h = 1e-5 * Math.max(Math.abs(x0), 1e-8);
          var y1 = f(X.make(x0 + h)), y0 = f(X.make(x0 - h));
          var Y = yReader(math, y1);
          return math.divide(math.multiply((Y.read(y1) - Y.read(y0)) / (2 * h), Y.scale), X.scale);
        };
      }, tex: "f'(x)", args: { f: 'function', x: 'point' }, returns: 'units of f/x', example: 'nderiv(sin, 0)', notes: 'For symbolic derivatives use derivative("x^2 sin(x)", "x").'
    }
  ].forEach(function (e) { e.cat = cat; P.equations.push(e); });
})(typeof globalThis !== 'undefined' ? globalThis : this);
