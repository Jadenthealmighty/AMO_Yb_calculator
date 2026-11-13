/* Quantum mechanics: operators, spin matrices, angular-momentum coupling, two-level physics.
 * Matrices are dimensionless with ħ = 1 unless a unit is attached. */
(function (g) {
  var P = g.PhysCalc = g.PhysCalc || {};
  P.equations = P.equations || [];
  var cat = 'Quantum';

  // ---- angular momentum coupling (Racah formulae) ----
  var lf = [0];
  function logfact(n) {
    if (n < 0 || n !== Math.round(n)) return NaN;
    for (var k = lf.length; k <= n; k++) lf[k] = lf[k - 1] + Math.log(k);
    return lf[n];
  }
  function isInt(x) { return Math.abs(x - Math.round(x)) < 1e-9; }
  function tri(a, b, c) { return a + b >= c && a + c >= b && b + c >= a && isInt(a + b + c); }
  function logDelta(a, b, c) { return 0.5 * (logfact(a + b - c) + logfact(a - b + c) + logfact(-a + b + c) - logfact(a + b + c + 1)); }
  function w3j(j1, j2, j3, m1, m2, m3) {
    if (Math.abs(m1 + m2 + m3) > 1e-9) return 0;
    if (!tri(j1, j2, j3)) return 0;
    if (Math.abs(m1) > j1 || Math.abs(m2) > j2 || Math.abs(m3) > j3) return 0;
    if (!isInt(j1 + m1) || !isInt(j2 + m2) || !isInt(j3 + m3)) return 0;
    var pre = logDelta(j1, j2, j3) + 0.5 * (logfact(j1 + m1) + logfact(j1 - m1) + logfact(j2 + m2) + logfact(j2 - m2) + logfact(j3 + m3) + logfact(j3 - m3));
    var kmin = Math.max(0, j2 - j3 - m1, j1 - j3 + m2), kmax = Math.min(j1 + j2 - j3, j1 - m1, j2 + m2);
    var s = 0;
    for (var k = Math.round(kmin); k <= kmax + 1e-9; k++) {
      var den = logfact(k) + logfact(Math.round(j3 - j2 + k + m1)) + logfact(Math.round(j3 - j1 + k - m2)) + logfact(Math.round(j1 + j2 - j3 - k)) + logfact(Math.round(j1 - k - m1)) + logfact(Math.round(j2 - k + m2));
      s += (k % 2 ? -1 : 1) * Math.exp(pre - den);
    }
    var ph = Math.round(j1 - j2 - m3);
    return (ph % 2 ? -1 : 1) * s;
  }
  function cg(j1, m1, j2, m2, J, M) {
    var ph = Math.round(j1 - j2 + M);
    return (ph % 2 ? -1 : 1) * Math.sqrt(2 * J + 1) * w3j(j1, j2, J, m1, m2, -M);
  }
  function w6j(a, b, c, d, e, f) {
    if (!tri(a, b, c) || !tri(a, e, f) || !tri(d, b, f) || !tri(d, e, c)) return 0;
    var pre = logDelta(a, b, c) + logDelta(a, e, f) + logDelta(d, b, f) + logDelta(d, e, c);
    var tmin = Math.max(a + b + c, a + e + f, d + b + f, d + e + c), tmax = Math.min(a + b + d + e, b + c + e + f, c + a + f + d);
    var s = 0;
    for (var t = Math.round(tmin); t <= tmax + 1e-9; t++) {
      var den = logfact(Math.round(t - a - b - c)) + logfact(Math.round(t - a - e - f)) + logfact(Math.round(t - d - b - f)) + logfact(Math.round(t - d - e - c)) +
        logfact(Math.round(a + b + d + e - t)) + logfact(Math.round(b + c + e + f - t)) + logfact(Math.round(c + a + f + d - t));
      s += (t % 2 ? -1 : 1) * Math.exp(pre + logfact(t + 1) - den);
    }
    return s;
  }
  function num(x) { return (x && typeof x === 'object' && 're' in x) ? x.re : Number(x); }

  // ---- spin matrices, basis ordered m = j, j-1, …, -j ----
  function spin(math, j, which) {
    j = num(j);
    var n = Math.round(2 * j + 1);
    if (Math.abs(n - (2 * j + 1)) > 1e-9 || j < 0) throw new Error('j must be 0, 1/2, 1, 3/2, …');
    var M = []; for (var a = 0; a < n; a++) { M.push(new Array(n).fill(0)); }
    var ms = []; for (var k = 0; k < n; k++) ms.push(j - k);
    for (var b = 0; b < n; b++) {
      var m = ms[b];
      if (which === 'z') M[b][b] = m;
      var up = Math.sqrt(j * (j + 1) - m * (m + 1));   // J+ |m> = up |m+1>, row index b-1
      var dn = Math.sqrt(j * (j + 1) - m * (m - 1));   // J- |m> = dn |m-1>, row index b+1
      if (which === '+' && b > 0) M[b - 1][b] = up;
      if (which === '-' && b < n - 1) M[b + 1][b] = dn;
      if (which === 'x') { if (b > 0) M[b - 1][b] += up / 2; if (b < n - 1) M[b + 1][b] += dn / 2; }
      if (which === 'y') { if (b > 0) M[b - 1][b] = math.add(M[b - 1][b], math.complex(0, -up / 2)); if (b < n - 1) M[b + 1][b] = math.add(M[b + 1][b], math.complex(0, dn / 2)); }
    }
    return math.matrix(M);
  }
  function ladder(math, n, dagger) {
    n = Math.round(num(n));
    var M = []; for (var a = 0; a < n; a++) M.push(new Array(n).fill(0));
    for (var k = 1; k < n; k++) { if (dagger) M[k][k - 1] = Math.sqrt(k); else M[k - 1][k] = Math.sqrt(k); }
    return math.matrix(M);
  }

  [
    { name: 'Pauli σx', name_id: 'sx', value: '[[0, 1], [1, 0]]', tex: '\\sigma_x', returns: '2×2', example: 'sx * sy - sy * sx' },
    { name: 'Pauli σy', name_id: 'sy', value: '[[0, -i], [i, 0]]', tex: '\\sigma_y', returns: '2×2', example: 'eig(sy)' },
    { name: 'Pauli σz', name_id: 'sz', value: '[[1, 0], [0, -1]]', tex: '\\sigma_z', returns: '2×2', example: 'sz' },
    { name: 'σ₊ (raising, |↑⟩ = [1,0])', name_id: 'sp', value: '[[0, 1], [0, 0]]', tex: '\\sigma_+', returns: '2×2', example: 'sp * [0, 1]' },
    { name: 'σ₋ (lowering)', name_id: 'sm', value: '[[0, 0], [1, 0]]', tex: '\\sigma_-', returns: '2×2', example: 'sm * [1, 0]' },
    { name: '2×2 identity', name_id: 'id2', value: '[[1, 0], [0, 1]]', tex: '\\mathbb 1', returns: '2×2', example: 'kron(sx, id2)' },
    { name: 'Hadamard', name_id: 'Had', value: '[[1, 1], [1, -1]]/sqrt(2)', tex: 'H', returns: '2×2', example: 'Had * [1, 0]' },
    { name: 'Spin matrix Jx', sig: 'Jx(j)', js: function (ctx) { return function Jx(j) { return spin(ctx.math, j, 'x'); }; }, tex: 'J_x', args: { j: 'spin (0, 1/2, 1, …)' }, returns: '(2j+1)² matrix, ħ=1, basis m = j…−j', example: 'eig(Jx(1))' },
    { name: 'Spin matrix Jy', sig: 'Jy(j)', js: function (ctx) { return function Jy(j) { return spin(ctx.math, j, 'y'); }; }, tex: 'J_y', args: { j: 'spin' }, returns: 'matrix', example: 'comm(Jx(1), Jy(1)) - i*Jz(1)' },
    { name: 'Spin matrix Jz', sig: 'Jz(j)', js: function (ctx) { return function Jz(j) { return spin(ctx.math, j, 'z'); }; }, tex: 'J_z', args: { j: 'spin' }, returns: 'matrix', example: 'Jz(3/2)' },
    { name: 'Raising operator J₊', sig: 'Jp(j)', js: function (ctx) { return function Jp(j) { return spin(ctx.math, j, '+'); }; }, tex: 'J_+', args: { j: 'spin' }, returns: 'matrix', example: 'Jp(1)' },
    { name: 'Lowering operator J₋', sig: 'Jm(j)', js: function (ctx) { return function Jm(j) { return spin(ctx.math, j, '-'); }; }, tex: 'J_-', args: { j: 'spin' }, returns: 'matrix', example: 'Jm(1)' },
    { name: 'Annihilation operator (truncated)', sig: 'a_op(n)', js: function (ctx) { return function a_op(n) { return ladder(ctx.math, n, false); }; }, tex: 'a', args: { n: 'Fock-space dimension' }, returns: 'n×n', example: 'comm(a_op(4), adag(4))' },
    { name: 'Creation operator (truncated)', sig: 'adag(n)', js: function (ctx) { return function adag(n) { return ladder(ctx.math, n, true); }; }, tex: 'a^\\dagger', args: { n: 'dimension' }, returns: 'n×n', example: 'adag(4) * a_op(4)' },
    { name: 'Commutator', def: 'comm(A, B) = A*B - B*A', tex: '[A,B] = AB-BA', args: { A: 'matrix', B: 'matrix' }, returns: 'matrix', example: 'comm(sx, sy)' },
    { name: 'Anticommutator', def: 'acomm(A, B) = A*B + B*A', tex: '\\{A,B\\} = AB+BA', args: { A: 'matrix', B: 'matrix' }, returns: 'matrix', example: 'acomm(sx, sx)' },
    { name: 'Hermitian conjugate', def: 'dagger(A) = ctranspose(A)', tex: 'A^\\dagger', args: { A: 'matrix or vector' }, returns: 'matrix', example: 'dagger(sy) - sy' },
    {
      name: 'Tensor product (any number)', sig: 'tensor(A, B, …)', js: function (ctx) {
        return function tensor() { var a = Array.prototype.slice.call(arguments); return a.reduce(function (x, y) { return ctx.math.kron(x, y); }); };
      }, tex: 'A\\otimes B\\otimes\\cdots', args: { A: 'matrix', B: 'matrix' }, returns: 'matrix', example: 'tensor(sz, id2, sx)'
    },
    {
      name: 'Outer product |u⟩⟨v|', sig: 'outer(u, v)', js: function (ctx) {
        var math = ctx.math;
        return function outer(u, v) { var a = ctx.flat(u), b = ctx.flat(v); return math.matrix(a.map(function (x) { return b.map(function (y) { return math.multiply(x, math.conj(y)); }); })); };
      }, tex: '|u\\rangle\\langle v|', args: { u: 'ket', v: 'ket' }, returns: 'matrix', example: 'outer([1, 0], [0, 1])'
    },
    { name: 'Projector / pure density matrix', def: 'proj(v) = outer(v, v)', tex: '|\\psi\\rangle\\langle\\psi|', args: { v: 'ket' }, returns: 'matrix', example: 'proj([1, 1]/sqrt(2))' },
    {
      name: 'Expectation value', sig: 'expect(A, psi)', js: function (ctx) {
        var math = ctx.math;
        return function expect(A, psi) {
          var v = ctx.flat(psi), Av = ctx.flat(math.multiply(A, v));
          var s = 0; for (var k = 0; k < v.length; k++) s = math.add(s, math.multiply(math.conj(v[k]), Av[k]));
          return ctx.cleanScalar(s);
        };
      }, tex: '\\langle\\psi|A|\\psi\\rangle', args: { A: 'operator', psi: 'normalized ket' }, returns: 'scalar', example: 'expect(sx, [1, 1]/sqrt(2))'
    },
    {
      name: 'Inner product ⟨u|v⟩', sig: 'braket(u, v)', js: function (ctx) {
        var math = ctx.math;
        return function braket(u, v) { var a = ctx.flat(u), b = ctx.flat(v), s = 0; for (var k = 0; k < a.length; k++) s = math.add(s, math.multiply(math.conj(a[k]), b[k])); return ctx.cleanScalar(s); };
      }, tex: '\\langle u|v\\rangle', args: { u: 'ket', v: 'ket' }, returns: 'scalar', example: 'braket([1, i]/sqrt(2), [1, 0])'
    },
    { name: 'Normalize a vector', def: 'normalize(v) = v/norm(v)', tex: 'v/\\|v\\|', args: { v: 'vector' }, returns: 'vector', example: 'normalize([1, 1, 1])' },
    { name: 'State fidelity (pure)', def: 'fidelity(u, v) = abs(braket(u, v))^2', tex: '|\\langle u|v\\rangle|^2', args: { u: 'ket', v: 'ket' }, returns: '0…1', example: 'fidelity([1, 0], [1, 1]/sqrt(2))' },
    {
      name: 'Partial trace (bipartite)', sig: 'ptrace(rho, dA, dB, keep)', js: function (ctx) {
        var math = ctx.math;
        return function ptrace(rho, dA, dB, keep) {
          var R = ctx.toArray(rho); dA = Math.round(ctx.cleanScalar(dA)); dB = Math.round(ctx.cleanScalar(dB));
          var keepA = (keep === 1 || keep === 'A' || keep === 'a');
          var d = keepA ? dA : dB, out = [];
          for (var i = 0; i < d; i++) { out.push([]); for (var j = 0; j < d; j++) {
            var s = 0;
            if (keepA) for (var k = 0; k < dB; k++) s = math.add(s, R[i * dB + k][j * dB + k]);
            else for (var k2 = 0; k2 < dA; k2++) s = math.add(s, R[k2 * dB + i][k2 * dB + j]);
            out[i].push(ctx.cleanScalar(s));
          } }
          return math.matrix(out);
        };
      }, tex: '\\mathrm{Tr}_{B}\\,\\rho', args: { rho: 'density matrix (dA·dB square)', dA: 'dim A', dB: 'dim B', keep: '1 or "A" to keep A, 2 or "B" to keep B' }, returns: 'reduced density matrix',
      example: 'ptrace(proj([1, 0, 0, 1]/sqrt(2)), 2, 2, 1)'
    },
    { name: 'Purity', def: 'purity(rho) = re(trace(rho*rho))', tex: '\\mathrm{Tr}\\,\\rho^2', args: { rho: 'density matrix' }, returns: '1/d … 1', example: 'purity(id2/2)' },
    {
      name: 'Von Neumann entropy (nats)', sig: 'entropy(rho)', js: function (ctx) {
        var math = ctx.math;
        return function entropy(rho) { var ev = ctx.flat(math.eigs(rho).values); return ev.reduce(function (s, l) { var x = num(l); return x > 1e-14 ? s - x * Math.log(x) : s; }, 0); };
      }, tex: 'S = -\\mathrm{Tr}\\,\\rho\\ln\\rho', args: { rho: 'density matrix' }, returns: 'nats (divide by ln 2 for bits)', example: 'entropy(id2/2)/log(2)'
    },
    { name: 'Bloch vector', def: 'bloch(rho) = re([trace(rho*sx), trace(rho*sy), trace(rho*sz)])', tex: '\\vec r = \\mathrm{Tr}(\\rho\\,\\vec\\sigma)', args: { rho: '2×2 density matrix' }, returns: '[x, y, z]', example: 'bloch(proj([1, i]/sqrt(2)))' },
    { name: 'Spin-½ rotation about x', def: 'rotx(th) = [[cos(th/2), -i*sin(th/2)], [-i*sin(th/2), cos(th/2)]]', tex: 'e^{-i\\theta\\sigma_x/2}', args: { th: 'angle' }, returns: '2×2', example: 'rotx(pi) * [1, 0]' },
    { name: 'Spin-½ rotation about y', def: 'roty(th) = [[cos(th/2), -sin(th/2)], [sin(th/2), cos(th/2)]]', tex: 'e^{-i\\theta\\sigma_y/2}', args: { th: 'angle' }, returns: '2×2', example: 'roty(pi/2) * [1, 0]' },
    { name: 'Spin-½ rotation about z', def: 'rotz(th) = [[exp(-i*th/2), 0], [0, exp(i*th/2)]]', tex: 'e^{-i\\theta\\sigma_z/2}', args: { th: 'angle' }, returns: '2×2', example: 'rotz(pi/2)' },
    { name: 'Two-level Hamiltonian (RWA, ħ=1)', def: 'H2(Omega, Delta) = [[-Delta/2, Omega/2], [Omega/2, Delta/2]]', tex: 'H = \\frac12\\begin{bmatrix}-\\Delta&\\Omega\\\\\\Omega&\\Delta\\end{bmatrix}', args: { Omega: 'Rabi frequency', Delta: 'detuning' }, returns: '2×2', example: 'eig(H2(1, 0.5))' },
    {
      name: 'Time evolution e^{−iHt}', sig: 'evolve(H, t)', js: function (ctx) {
        var math = ctx.math;
        return function evolve(H, t) {
          var tt = math.isUnit(t) ? t.toNumber('s') : t;
          var Hn = math.map(H, function (x) { return math.isUnit(x) ? x.toNumber('s^-1') : x; });
          return math.expm(math.multiply(math.complex(0, -tt), Hn));
        };
      }, tex: 'U = e^{-iHt}', args: { H: 'Hamiltonian in angular-frequency units (s⁻¹ or plain numbers)', t: 'time' }, returns: 'unitary', example: 'evolve(H2(2*pi*1, 0), 0.25) * [1, 0]'
    },
    { name: 'Rabi oscillation probability', def: 'rabi_P(Omega, Delta, t) = 1/(1 + ratio(Delta, Omega)^2)*sin(sqrt(1 + ratio(Delta, Omega)^2)*Omega*t/2)^2', tex: 'P_e = \\frac{\\Omega^2}{\\Omega^2+\\Delta^2}\\sin^2\\!\\left(\\frac{\\sqrt{\\Omega^2+\\Delta^2}\\,t}{2}\\right)', args: { Omega: 'Rabi frequency (angular)', Delta: 'detuning (angular)', t: 'time' }, returns: 'probability', example: 'rabi_P(2*pi*1 kHz, 0, 0.5 ms)' },
    { name: 'π-pulse duration', def: 't_pi(Omega) = pi/Omega', tex: 't_\\pi = \\pi/\\Omega', args: { Omega: 'Rabi frequency (angular)' }, returns: 's', example: 't_pi(2*pi*1 kHz) to ms' },
    { name: 'Landau–Zener diabatic probability', def: 'landau_zener(Omega, alpha) = exp(-pi*Omega^2/(2*alpha))', tex: 'P_{d} = e^{-\\pi\\Omega^2/2\\alpha}', args: { Omega: 'Rabi frequency (angular)', alpha: 'sweep rate dΔ/dt (rad/s²)' }, returns: 'probability', example: 'landau_zener(2*pi*10 kHz, 2*pi*1 MHz/(1 ms))' },
    { name: 'Harmonic oscillator energy', def: 'E_ho(n, omega) = hbar*omega*(n + 1/2)', tex: 'E_n = \\hbar\\omega(n+\\tfrac12)', args: { n: 'level', omega: 'angular frequency' }, returns: 'J', example: 'E_ho(0, 2*pi*50 kHz)/h to kHz' },
    { name: 'Zero-point length', def: 'x_zp(m, omega) = sqrt(hbar/(2*m*omega))', tex: 'x_0 = \\sqrt{\\hbar/2m\\omega}', args: { m: 'mass', omega: 'angular trap frequency' }, returns: 'm', example: 'x_zp(Yb.m, 2*pi*50 kHz) to nm' },
    { name: 'Particle in a box', def: 'E_box(n, L, m) = n^2*h^2/(8*m*L^2)', tex: 'E_n = \\frac{n^2h^2}{8mL^2}', args: { n: 'level', L: 'width', m: 'mass' }, returns: 'J', example: 'E_box(1, 1 nm, me) to eV' },
    { name: 'Hydrogen levels (∞ nuclear mass)', def: 'E_hydrogen(n) = -Ry/n^2', tex: 'E_n = -\\mathrm{Ry}/n^2', args: { n: 'principal quantum number' }, returns: 'J', example: 'E_hydrogen(2) - E_hydrogen(1) to eV' },
    { name: 'de Broglie wavelength', def: 'deBroglie(m, v) = h/(m*v)', tex: '\\lambda = h/mv', args: { m: 'mass', v: 'speed' }, returns: 'm', example: 'deBroglie(Yb.m, 1 cm/s) to nm' },
    {
      name: 'Clebsch–Gordan coefficient', sig: 'clebsch(j1, m1, j2, m2, J, M)', js: function () { return function (j1, m1, j2, m2, J, M) { return cg(num(j1), num(m1), num(j2), num(m2), num(J), num(M)); }; },
      tex: '\\langle j_1 m_1; j_2 m_2|J M\\rangle', args: { j1: '', m1: '', j2: '', m2: '', J: '', M: '' }, returns: 'number (Condon–Shortley)', example: 'clebsch(1/2, 1/2, 1/2, -1/2, 1, 0)'
    },
    {
      name: 'Wigner 3j symbol', sig: 'w3j(j1, j2, j3, m1, m2, m3)', js: function () { return function (a, b, c, d, e, f) { return w3j(num(a), num(b), num(c), num(d), num(e), num(f)); }; },
      tex: '\\begin{pmatrix}j_1&j_2&j_3\\\\m_1&m_2&m_3\\end{pmatrix}', args: { j1: '', j2: '', j3: '', m1: '', m2: '', m3: '' }, returns: 'number', example: 'w3j(1, 1, 0, 1, -1, 0)'
    },
    {
      name: 'Wigner 6j symbol', sig: 'w6j(j1, j2, j3, j4, j5, j6)', js: function () { return function (a, b, c, d, e, f) { return w6j(num(a), num(b), num(c), num(d), num(e), num(f)); }; },
      tex: '\\begin{Bmatrix}j_1&j_2&j_3\\\\j_4&j_5&j_6\\end{Bmatrix}', args: { j1: '', j2: '', j3: '', j4: '', j5: '', j6: '' }, returns: 'number', example: 'w6j(1, 1, 1, 1, 1, 1)'
    }
  ].forEach(function (e) { e.cat = cat; P.equations.push(e); });
})(typeof globalThis !== 'undefined' ? globalThis : this);
