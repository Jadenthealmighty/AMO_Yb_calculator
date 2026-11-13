/* Opto-optical trap (OOT): the 1077 nm shift beams that replace the MOT coils.
 *
 * Two parts:
 *   1. The closed-form results of the OOT supplemental material (Sullivan, Jackson, Ha & Braverman,
 *      "Magneto-optical trapping of neutral atoms in a light-induced effective magnetic field", SI,
 *      Feb 2026), Eqs. S11–S32. These assume |Δs| ≫ Γs and the ideal pyramid of quad beams.
 *   2. A port of oot_shift_beams.py + oot_rate_eq.py, so the calculator gives the same numbers as the
 *      simulation at any point and velocity: oot_beams(…) builds the shift-beam set exactly like
 *      pyramid_beams(), mot_beams(…) builds six 399 nm cooling beams, and oot_B, oot_point, oot_accel,
 *      oot_grad, oot_freq, oot_depth evaluate them.
 *
 * Conventions (as everywhere in PhysCalc): Γ, Δ are angular (s⁻¹). Write 2*pi*143 MHz, or
 * 10*Yb.Gamma1077. In oot_beams and mot_beams a plain number for a detuning means "in units of Γ" of
 * that transition (oot_beams(2 W, 10 mm, 10) is Δs = +10 Γs, as OOT_SHIFT_DETUNING_GAMMA in the sim).
 *
 * The numbers below are the same as oot_shift_beams.py and data/yb174.js. Edit, save, reload.
 * (install.sh copies this file from the source folder each time, so edit it there and re-install.)
 */
(function (g) {
  var P = g.PhysCalc = g.PhysCalc || {};
  P.equations = P.equations || [];
  var cat = 'Opto-optical trap (OOT)';

  var OOT = P.oot = {
    // shift transition ¹P₁ → 6s7s ¹S₀ (oot_shift_beams.py)
    E_1P1_CM: 25068.222,
    E_6S7S_CM: 34350.65,
    GAMMA_S: 3.0e7,            // s⁻¹, Γs (= A(6s7s ¹S₀ → ¹P₁) from the 4.31 ea₀ matrix element)
    GF_1P1: 1.035,
    // cooling transition ¹S₀ → ¹P₁, 399 nm (data/yb174.js)
    NU_399_HZ: 751526533.49e6,
    TAU_1P1_S: 5.464e-9,
    MASS_AMU: 173.93886755,
    // what oot_beams() uses for an input you leave out (the oot_trap_sweep.py defaults)
    THETA_DEG: 45,             // OOT_SHIFT_THETA_DEG
    N_QUAD: 3,                 // OOT_N_QUAD (3 = triad, 4 = the paper's tetrad)
    RETRO: 1,                  // OOT_RETRO
    PHI0_DEG: 0                // triad azimuth; the sim uses −FT_BEAM_TILT_DEG + OOT_TRIAD_ROT_DEG
  };

  function cod(name) {
    var k = (P.codata || []).filter(function (q) { return q.name === name; })[0];
    if (!k) throw new Error('constant ' + name + ' missing from data/codata2022.js');
    return k.value;
  }
  var K = null;                // SI constants, filled on first use
  function consts() {
    if (K) return K;
    var hbar = cod('hbar'), c = cod('c'), muB = cod('muB'), amu = cod('m_u'), kB = cod('kB');
    var kS = 100 * 2 * Math.PI * (OOT.E_6S7S_CM - OOT.E_1P1_CM);
    K = {
      hbar: hbar, c: c, muB: muB, kB: kB,
      kS: kS, GS: OOT.GAMMA_S, gF: OOT.GF_1P1,
      IsatS: hbar * c * Math.pow(kS, 3) * OOT.GAMMA_S / (12 * Math.PI),
      shiftCoeff: Math.PI * OOT.GAMMA_S / (2 * hbar * c * Math.pow(kS, 3)),
      kC: 2 * Math.PI * OOT.NU_399_HZ / c, GC: 1 / OOT.TAU_1P1_S,
      m: OOT.MASS_AMU * amu
    };
    return K;
  }

  // ---- small complex / 3-vector helpers (complex = [re, im]) -------------------------------
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function matvec(M, v) { return [dot(M[0], v), dot(M[1], v), dot(M[2], v)]; }
  function matTvec(M, v) { return [M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2], M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2], M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2]]; }
  function matmul(A, B) {
    var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) for (var k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j];
    return C;
  }
  function zeros3c() { return [[[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]]]; }

  // spin-1 matrices in the Cartesian basis, (S_k)_ij = −i ε_kij  (SPIN1 in oot_rate_eq.py)
  function eps3(i, j, k) { return (i - j) * (j - k) * (k - i) / 2; }

  // Hermitian eigen-decomposition by complex Jacobi rotations. H: n×n of [re, im].
  // Returns { E: ascending eigenvalues, U: U[i][j] = component i of eigenvector j }.
  function eighC(H) {
    var n = H.length, A = H.map(function (r) { return r.map(function (z) { return [z[0], z[1]]; }); });
    var V = [];
    for (var i = 0; i < n; i++) { V.push([]); for (var j = 0; j < n; j++) V[i].push([i === j ? 1 : 0, 0]); }
    var scale = 0;
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) scale = Math.max(scale, Math.hypot(A[i][j][0], A[i][j][1]));
    for (var sweep = 0; sweep < 60; sweep++) {
      var off = 0;
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) off = Math.max(off, Math.hypot(A[i][j][0], A[i][j][1]));
      if (off <= 1e-15 * scale || off === 0) break;
      for (var p = 0; p < n; p++) for (var q = p + 1; q < n; q++) {
        var re = A[p][q][0], im = A[p][q][1], b = Math.hypot(re, im);
        if (b <= 1e-300) continue;
        var cph = re / b, sph = im / b;                              // A_pq = b e^{iφ}
        var th = 0.5 * Math.atan2(2 * b, A[q][q][0] - A[p][p][0]);
        var c = Math.cos(th), s = Math.sin(th);
        // unitary J: columns p, q →  J_pp = c, J_pq = s e^{iφ}, J_qp = −s e^{−iφ}, J_qq = c
        var Jpq = [s * cph, s * sph], Jqp = [-s * cph, s * sph];
        for (var k = 0; k < n; k++) {                               // A ← A J (columns)
          var akp = A[k][p], akq = A[k][q];
          var np_ = [c * akp[0] + akq[0] * Jqp[0] - akq[1] * Jqp[1], c * akp[1] + akq[0] * Jqp[1] + akq[1] * Jqp[0]];
          var nq_ = [akp[0] * Jpq[0] - akp[1] * Jpq[1] + c * akq[0], akp[0] * Jpq[1] + akp[1] * Jpq[0] + c * akq[1]];
          A[k][p] = np_; A[k][q] = nq_;
          var vkp = V[k][p], vkq = V[k][q];
          V[k][p] = [c * vkp[0] + vkq[0] * Jqp[0] - vkq[1] * Jqp[1], c * vkp[1] + vkq[0] * Jqp[1] + vkq[1] * Jqp[0]];
          V[k][q] = [vkp[0] * Jpq[0] - vkp[1] * Jpq[1] + c * vkq[0], vkp[0] * Jpq[1] + vkp[1] * Jpq[0] + c * vkq[1]];
        }
        for (k = 0; k < n; k++) {                                   // A ← J† A (rows)
          var apk = A[p][k], aqk = A[q][k];
          // (J†)_pp = c, (J†)_pq = conj(J_qp), (J†)_qp = conj(J_pq), (J†)_qq = c
          var cJqp = [Jqp[0], -Jqp[1]], cJpq = [Jpq[0], -Jpq[1]];
          A[p][k] = [c * apk[0] + cJqp[0] * aqk[0] - cJqp[1] * aqk[1], c * apk[1] + cJqp[0] * aqk[1] + cJqp[1] * aqk[0]];
          A[q][k] = [cJpq[0] * apk[0] - cJpq[1] * apk[1] + c * aqk[0], cJpq[0] * apk[1] + cJpq[1] * apk[0] + c * aqk[1]];
        }
        A[p][q] = [0, 0]; A[q][p] = [0, 0];
      }
    }
    var idx = []; for (i = 0; i < n; i++) idx.push(i);
    idx.sort(function (a, b) { return A[a][a][0] - A[b][b][0]; });
    return {
      E: idx.map(function (k) { return A[k][k][0]; }),
      U: V.map(function (row) { return idx.map(function (k) { return row[k]; }); })
    };
  }

  // ---- shift beams (oot_shift_beams.py) -----------------------------------------------------
  function rotation(theta, phi) {
    var cth = Math.cos(theta), sth = Math.sin(theta), cph = Math.cos(phi), sph = Math.sin(phi);
    return matmul([[cph, sph, 0], [-sph, cph, 0], [0, 0, 1]], [[cth, 0, -sth], [0, 1, 0], [sth, 0, cth]]);
  }
  function displacedGaussian(I, w, theta, phi, r0, helicity, delta) {
    var R = rotation(theta, phi), s2 = Math.SQRT1_2;
    // pol in the laser frame: (x̂ + i·h·ŷ)/√2 ; in the lab: R·pol
    var pol = [0, 1, 2].map(function (i) { return [R[i][0] * s2, helicity * R[i][1] * s2]; });
    var proj = [0, 1, 2].map(function (i) {                        // proj_ij = conj(p_i) p_j
      return [0, 1, 2].map(function (j) {
        return [pol[i][0] * pol[j][0] + pol[i][1] * pol[j][1], pol[i][0] * pol[j][1] - pol[i][1] * pol[j][0]];
      });
    });
    return { I: I, w: w, R: R, khat: [R[0][2], R[1][2], R[2][2]], r0: r0, pol: pol, proj: proj, delta: delta };
  }
  function pyramidBeams(I, w, theta, delta, nQuad, phi0, retro) {
    var out = [];
    for (var i = 0; i < nQuad; i++) {
      var phi = phi0 + i * 2 * Math.PI / nQuad, r0 = [w / 2, 0, 0];
      var theta0 = retro ? Math.PI : 0, sign = retro ? 1 : -1;
      out.push(displacedGaussian(I, w, theta, phi, r0, +1, delta));
      out.push(displacedGaussian(I, w, theta, phi, r0, -1, -delta));
      var r1 = [sign * r0[0], 0, 0];
      out.push(displacedGaussian(I, w, theta + theta0, phi, r1, +1, sign * delta));
      out.push(displacedGaussian(I, w, theta + theta0, phi, r1, -1, -sign * delta));
    }
    return out;
  }
  function beamIntensity(b, r) {
    var q = matTvec(b.R, r), x = q[0] - b.r0[0], y = q[1] - b.r0[1];
    return b.I * Math.exp(-2 * (x * x + y * y) / (b.w * b.w));
  }
  // light-shift Hamiltonian of ¹P₁ in rad/s at r (m); v (m/s) or null for no Doppler shift
  function shiftH(beams, r, v) {
    var k = consts(), H = zeros3c();
    beams.forEach(function (b) {
      var d = v ? b.delta - k.kS * dot(b.khat, v) : b.delta;
      var amp = k.shiftCoeff * beamIntensity(b, r) * d / (d * d + k.GS * k.GS / 4);
      for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) { H[i][j][0] += amp * b.proj[i][j][0]; H[i][j][1] += amp * b.proj[i][j][1]; }
    });
    return H;
  }
  // a in H = a·S + scalar + tensor  (vector_part)
  function vectorPart(H) {
    var a = [0, 0, 0];
    for (var kk = 0; kk < 3; kk++) {
      var s = 0;
      for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
        var e = eps3(kk, j, i);                                      // (S_k)_ji = −i ε_kji
        if (e) s += H[i][j][1] * e;                                  // Re(H_ij · (−i e)) = e·Im(H_ij)
      }
      a[kk] = 0.5 * s;
    }
    return a;
  }
  function bOfH(H) { var k = consts(), a = vectorPart(H); return a.map(function (x) { return k.hbar * x / (k.gF * k.muB); }); }
  function zeemanH(a) {                                             // Σ a_k S_k
    var H = zeros3c();
    for (var kk = 0; kk < 3; kk++) for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      var e = eps3(kk, i, j); if (e) H[i][j][1] += -e * a[kk];
    }
    return H;
  }
  function fieldT(S, r) { return bOfH(shiftH(S._beams, r, null)); }
  function gradTensor(S) {                                          // dB_j/dr_i at the origin, T/m
    var h = 1e-5, G = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) {
      var rp = [0, 0, 0], rm = [0, 0, 0]; rp[i] = h; rm[i] = -h;
      var bp = fieldT(S, rp), bm = fieldT(S, rm);
      for (var j = 0; j < 3; j++) G[i][j] = (bp[j] - bm[j]) / (2 * h);
    }
    return G;
  }

  // ---- cooling beams and the steady-state rate equations (oot_rate_eq.py) -------------------
  var HAND = null;   // sign that makes mot_beams(…, handedness = +1) trap in B = b(x, y, −2z), b > 0
  function coolBeams(s0, deltaBar, w, hand) {
    var dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    return dirs.map(function (k) {
      var h = (k[2] !== 0 ? 1 : -1) * hand;                         // radial pairs opposite to the z pair
      var a = Math.abs(k[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      var e1 = cross(k, a), n1 = Math.sqrt(dot(e1, e1)); e1 = e1.map(function (x) { return x / n1; });
      var e2 = cross(k, e1), s2 = Math.SQRT1_2;
      return { khat: k, pol: [0, 1, 2].map(function (i) { return [e1[i] * s2, h * e2[i] * s2]; }), s0: s0, w: w, delta: deltaBar };
    });
  }
  function coolS(b, r) {
    if (!isFinite(b.w)) return b.s0;
    var kr = dot(b.khat, r), r2 = dot(r, r) - kr * kr;
    return b.s0 * Math.exp(-2 * r2 / (b.w * b.w));
  }
  // H in units of Γc; kv[b] = k·v/Γc for each beam. Returns force in ħkΓ units and ρe.
  function steadyForce(H, beams, r, kvOf) {
    var eg = eighC(H), E = eg.E, U = eg.U, nb = beams.length;
    var R = [], Rn = [0, 0, 0];
    for (var b = 0; b < nb; b++) {
      var be = beams[b], s = coolS(be, r), kv = kvOf(be), row = [];
      for (var j = 0; j < 3; j++) {
        var re = 0, im = 0;                                          // Σ_i conj(U_ij) pol_i
        for (var i = 0; i < 3; i++) {
          var u = U[i][j], p = be.pol[i];
          re += u[0] * p[0] + u[1] * p[1]; im += u[0] * p[1] - u[1] * p[0];
        }
        var f = re * re + im * im, det = be.delta - kv - E[j];
        var x = 0.5 * s * f / (1 + 4 * det * det);
        row.push(x); Rn[j] += x;
      }
      R.push(row);
    }
    var sumN = 0; for (j = 0; j < 3; j++) sumN += Rn[j] / (1 + Rn[j]);
    var Ng = 1 / (1 + sumN), F = [0, 0, 0];
    for (b = 0; b < nb; b++) {
      var net = 0; for (j = 0; j < 3; j++) net += R[b][j] * Ng / (1 + Rn[j]);
      for (i = 0; i < 3; i++) F[i] += net * beams[b].khat[i];
    }
    return { F: F, rho_e: 1 - Ng };
  }
  function handedness() {
    if (HAND !== null) return HAND;
    var b = 0.05, hstep = 0.02;                                     // field in units of Γc per unit length
    function stiff(sign, axis) {
      var beams = coolBeams(1, -1, Infinity, sign), F = [];
      [hstep, -hstep].forEach(function (x) {
        var r = [0, 0, 0]; r[axis] = x;
        F.push(steadyForce(zeemanH([b * r[0], b * r[1], -2 * b * r[2]]), beams, r, function () { return 0; }).F[axis]);
      });
      return (F[0] - F[1]) / (2 * hstep);
    }
    HAND = stiff(+1, 2) < 0 ? +1 : -1;
    if (!(stiff(HAND, 2) < 0 && stiff(HAND, 0) < 0)) throw new Error('mot_beams: could not find trapping polarizations');
    return HAND;
  }
  function coolForce(S, M, r, v, doppler) {
    var k = consts();
    var Hs = shiftH(S._beams, r, doppler ? v : null);
    var H = Hs.map(function (row) { return row.map(function (z) { return [z[0] / k.GC, z[1] / k.GC]; }); });
    var out = steadyForce(H, M._beams, r, function (be) { return dot(be.khat, v) * k.kC / k.GC; });
    var Fsi = out.F.map(function (x) { return x * k.hbar * k.kC * k.GC; });
    return { F: Fsi, a: Fsi.map(function (x) { return x / k.m; }), rho_e: out.rho_e, H: Hs };
  }
  function stiffness(S, M, axis) {
    var h = 0.5e-3, r1 = [0, 0, 0], r2 = [0, 0, 0]; r1[axis] = h; r2[axis] = -h;
    var z = [0, 0, 0];
    return (coolForce(S, M, r1, z, false).F[axis] - coolForce(S, M, r2, z, false).F[axis]) / (2 * h);
  }
  function depth(S, M) {                                            // J; weakest escape barrier from the centre at v = 0
    var wmax = Math.max(S._w, isFinite(M._w) ? M._w : 0), n = 151, rmax = 3 * wmax, best = Infinity;
    for (var ax = 0; ax < 3; ax++) for (var sg = -1; sg <= 1; sg += 2) {
      var U = 0, Umax = 0, prev = null, z = [0, 0, 0];
      for (var q = 0; q < n; q++) {
        var r = [0, 0, 0]; r[ax] = sg * rmax * q / (n - 1);
        var Fd = sg * coolForce(S, M, r, z, false).F[ax];
        if (prev !== null) { U -= 0.5 * (Fd + prev) * rmax / (n - 1); Umax = Math.max(Umax, U); }
        prev = Fd;
      }
      best = Math.min(best, Umax);
    }
    return best;
  }
  function shiftScatter(S, r, v) {                                  // Σ_b Γs/2 · s_b/(1 + 4 d_b²/Γs²), per unit ρe
    var k = consts(), R = 0, I = 0;
    S._beams.forEach(function (b) {
      var Ib = beamIntensity(b, r), d = v ? b.delta - k.kS * dot(b.khat, v) : b.delta;
      I += Ib; R += k.GS / 2 * (Ib / k.IsatS) / (1 + 4 * d * d / (k.GS * k.GS));
    });
    return { R: R, I: I };
  }

  // ---- calculator glue ------------------------------------------------------------------------
  function mk(ctx) {
    var math = ctx.math;
    function num(v, unit, what, plainOK) {
      if (math.isUnit(v)) { try { return v.toNumber(unit); } catch (e) { throw new Error(what + ' must be in ' + unit + '-compatible units'); } }
      if (typeof v === 'number' && plainOK) return v;
      if (typeof v === 'number') return v;
      throw new Error(what + ': expected a number with units');
    }
    function len(v, what) { return num(v, 'm', what || 'position', true); }
    function vel(v, what) { return v === undefined ? 0 : num(v, 'm/s', what || 'velocity', true); }
    function angle(v, what, def) {
      if (v === undefined) return def;
      if (math.isUnit(v)) return v.toNumber('rad');
      if (typeof v === 'number') { if (Math.abs(v) > 2 * Math.PI + 1e-9) throw new Error(what + ': give it with a unit, e.g. 45 deg'); return v; }
      throw new Error(what + ': expected an angle such as 45 deg');
    }
    function detuning(v, Gamma, what) {
      if (math.isUnit(v)) { try { return v.toNumber('s^-1'); } catch (e) { throw new Error(what + ' must be an angular frequency (e.g. 2*pi*143 MHz), or a plain number in units of Γ'); } }
      if (typeof v === 'number') return v * Gamma;
      throw new Error(what + ': expected an angular frequency or a number of linewidths');
    }
    function flag(v, def) { return v === undefined ? def : !!(math.isUnit(v) ? v.value : v); }
    function isS(S) { return S && S.__oot === 'shift'; }
    function isM(M) { return M && M.__oot === 'cool'; }
    function needS(S, fn) { if (!isS(S)) throw new Error(fn + ': first input must be a shift-beam set, e.g. S = oot_beams(2 W, 10 mm, 10)'); }
    function needM(M, fn) { if (!isM(M)) throw new Error(fn + ': give the cooling beams, e.g. M = mot_beams(1, -0.5)'); }
    function pos(x, y, z) { if (z === undefined) throw new Error('give x, y and z'); return [len(x, 'x'), len(y, 'y'), len(z, 'z')]; }
    function U(x, u) { return math.unit(x, u); }
    function clean(a, rel, floor) {                                  // drop round-off next to the largest entry
      var mx = 0; a.forEach(function (x) { mx = Math.max(mx, Math.abs(x)); });
      return a.map(function (x) { return Math.abs(x) < Math.max((rel || 1e-9) * mx, floor || 0) ? 0 : x; });
    }
    function vecU(a, u, scale, floor) { return math.matrix(clean(a, 1e-9, floor).map(function (x) { return U(x * (scale || 1), u); })); }
    var BFLOOR = 1e-15, EFLOOR = 1e-3;                               // T, rad/s
    function report(obj, rows) { Object.defineProperty(obj, '__report', { value: rows, enumerable: false }); return obj; }
    function hidden(obj, key, val) { Object.defineProperty(obj, key, { value: val, enumerable: false }); }
    var G = 1e4;

    function oot_beams(Pw, w, Delta, theta, Nquad, retro, phi0) {
      var k = consts();
      if (w === undefined) throw new Error('oot_beams(P, w, Δs): give at least the power, waist and detuning');
      var Ptot = num(Pw, 'W', 'P'), wm = len(w, 'w'), d = detuning(Delta, k.GS, 'Δs');
      var th = angle(theta, 'θ', OOT.THETA_DEG * Math.PI / 180);
      var nq = Nquad === undefined ? OOT.N_QUAD : Math.round(math.isUnit(Nquad) ? Nquad.value : Nquad);
      if (!(nq >= 1)) throw new Error('Nquad must be 1, 2, 3, 4, …');
      var rt = flag(retro, !!OOT.RETRO), ph = angle(phi0, 'φ0', OOT.PHI0_DEG * Math.PI / 180);
      var I0 = 2 * Ptot / (4 * nq * Math.PI * wm * wm);
      var S = { P: U(Ptot, 'W'), w: U(wm * 1e3, 'mm'), Delta_s: U(d, 's^-1'), Delta_Gamma: d / k.GS, nu_s: U(d / (2 * Math.PI) / 1e6, 'MHz'),
        theta: U(th * 180 / Math.PI, 'deg'), Nquad: nq, retro: rt, phi0: U(ph * 180 / Math.PI, 'deg'),
        I0: U(I0 / 1e4, 'W/cm^2'), S0: I0 / k.IsatS };
      Object.defineProperty(S, '__oot', { value: 'shift', enumerable: false });
      hidden(S, '_beams', pyramidBeams(I0, wm, th, d, nq, ph, rt));
      hidden(S, '_w', wm);
      var Gt = gradTensor(S);
      var gflat = clean([].concat(Gt[0], Gt[1], Gt[2]), 1e-6);
      S.grad = math.matrix([0, 1, 2].map(function (i) { return [0, 1, 2].map(function (j) { return U(gflat[3 * i + j] * G / 100, 'G/cm'); }); }));
      S.beta_paper = U(Ptot * Math.sin(2 * th) * k.GS / (4 * Math.exp(0.5) * k.gF * k.muB * k.c * Math.pow(k.kS * wm, 3) * d) * G / 100, 'G/cm');
      S.v_res = U(Math.abs(d) / k.kS, 'm/s');
      return report(S, [['P', 'power, all passes'], ['w', 'waist'], ['Delta_Gamma', 'Δs / Γs'], ['nu_s', 'Δs / 2π'], ['theta', 'θ from z'],
        ['Nquad', 'quad beams'], ['retro', 'retro-reflected'], ['phi0', 'φ₀'], ['I0', 'peak I per component'], ['S0', 'peak I / Isat,s'],
        ['grad', '∂Bⱼ/∂rᵢ at centre'], ['beta_paper', 'β, Eq. S22 (×1, 1, −2)'], ['v_res', 'Doppler-resonant speed |Δs|/ks']]);
    }

    function mot_beams(s, Delta_c, w_c, hand) {
      var k = consts();
      if (Delta_c === undefined) throw new Error('mot_beams(s, Δc): give the saturation per beam and the detuning');
      var s0 = num(s, '', 's', true), d = detuning(Delta_c, k.GC, 'Δc');
      var wc = w_c === undefined ? Infinity : len(w_c, 'w_c');
      if (math.isUnit(w_c) === false && w_c !== undefined && !(wc > 0)) wc = Infinity;
      var h = hand === undefined ? 1 : (num(hand, '', 'handedness', true) < 0 ? -1 : 1);
      var M = { s: s0, Delta_c: U(d, 's^-1'), Delta_Gamma: d / k.GC, nu_c: U(d / (2 * Math.PI) / 1e6, 'MHz'),
        w_c: isFinite(wc) ? U(wc * 1e3, 'mm') : Infinity, handedness: h };
      Object.defineProperty(M, '__oot', { value: 'cool', enumerable: false });
      hidden(M, '_beams', coolBeams(s0, d / k.GC, wc, h * handedness()));
      hidden(M, '_w', wc);
      return report(M, [['s', 's per beam (peak)'], ['Delta_Gamma', 'Δc / Γc'], ['nu_c', 'Δc / 2π'], ['w_c', 'waist (∞ = plane waves)'], ['handedness', 'handedness (+1 traps for Δs > 0)']]);
    }

    function Bstatic(S, x, y, z, fn) { needS(S, fn); return fieldT(S, pos(x, y, z)); }
    function oot_B(S, x, y, z) { return vecU(Bstatic(S, x, y, z, 'oot_B'), 'G', G, BFLOOR); }
    function oot_Bx(S, x, y, z) { return U(Bstatic(S, x, y, z, 'oot_Bx')[0] * G, 'G'); }
    function oot_By(S, x, y, z) { return U(Bstatic(S, x, y, z, 'oot_By')[1] * G, 'G'); }
    function oot_Bz(S, x, y, z) { return U(Bstatic(S, x, y, z, 'oot_Bz')[2] * G, 'G'); }
    function oot_Bmag(S, x, y, z) { var b = Bstatic(S, x, y, z, 'oot_Bmag'), m = Math.sqrt(dot(b, b)); return U(m < BFLOOR ? 0 : m * G, 'G'); }
    function oot_I(S, x, y, z) { needS(S, 'oot_I'); return U(shiftScatter(S, pos(x, y, z), null).I / 1e4, 'W/cm^2'); }
    function oot_grad(S) { needS(S, 'oot_grad'); return S.grad; }
    function oot_B_dop(S, x, y, z, vx, vy, vz) {
      needS(S, 'oot_B_dop');
      return vecU(bOfH(shiftH(S._beams, pos(x, y, z), [vel(vx), vel(vy), vel(vz)])), 'G', G, BFLOOR);
    }
    function oot_shifts(S, x, y, z, vx, vy, vz) {
      needS(S, 'oot_shifts');
      var E = clean(eighC(shiftH(S._beams, pos(x, y, z), [vel(vx), vel(vy), vel(vz)])).E, 1e-9, EFLOOR);
      return math.matrix(E.map(function (e) { return U(e / (2 * Math.PI) / 1e6, 'MHz'); }));
    }
    function accel(S, M, x, y, z, vx, vy, vz, dop, fn) {
      needS(S, fn); needM(M, fn);
      return coolForce(S, M, pos(x, y, z), [vel(vx), vel(vy), vel(vz)], flag(dop, true)).a;
    }
    function oot_accel(S, M, x, y, z, vx, vy, vz, dop) { return vecU(accel(S, M, x, y, z, vx, vy, vz, dop, 'oot_accel'), 'm/s^2'); }
    function oot_ax(S, M, x, y, z, vx, vy, vz, dop) { return U(accel(S, M, x, y, z, vx, vy, vz, dop, 'oot_ax')[0], 'm/s^2'); }
    function oot_ay(S, M, x, y, z, vx, vy, vz, dop) { return U(accel(S, M, x, y, z, vx, vy, vz, dop, 'oot_ay')[1], 'm/s^2'); }
    function oot_az(S, M, x, y, z, vx, vy, vz, dop) { return U(accel(S, M, x, y, z, vx, vy, vz, dop, 'oot_az')[2], 'm/s^2'); }
    function oot_freq(S, M) {
      needS(S, 'oot_freq'); needM(M, 'oot_freq');
      var k = consts();
      return math.matrix([0, 1, 2].map(function (ax) {
        var kk = stiffness(S, M, ax);
        return U(kk < 0 ? Math.sqrt(-kk / k.m) / (2 * Math.PI) : 0, 'Hz');
      }));
    }
    function oot_depth(S, M) { needS(S, 'oot_depth'); needM(M, 'oot_depth'); return U(depth(S, M) / consts().kB * 1e3, 'mK'); }

    function oot_point(S, x, y, z, vx, vy, vz, M) {
      needS(S, 'oot_point');
      if (M !== undefined) needM(M, 'oot_point');
      var k = consts(), r = pos(x, y, z), v = [vel(vx), vel(vy), vel(vz)];
      var B0 = clean(fieldT(S, r), 1e-9, BFLOOR), Hd = shiftH(S._beams, r, v), Bd = clean(bOfH(Hd), 1e-9, BFLOOR), a = vectorPart(Hd);
      var E = clean(eighC(Hd).E, 1e-9, EFLOOR), Hz = zeemanH(a), st = 0;
      for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) st = Math.max(st, Math.hypot(Hd[i][j][0] - Hz[i][j][0], Hd[i][j][1] - Hz[i][j][1]));
      var sc = shiftScatter(S, r, v), Bdm = Math.sqrt(dot(Bd, Bd));
      var o = {
        B: vecU(B0, 'G', G), Bmag: U(Math.sqrt(dot(B0, B0)) * G, 'G'),
        B_dop: vecU(Bd, 'G', G), Bmag_dop: U(Bdm * G, 'G'),
        zeeman: U(k.gF * k.muB * Bdm / (2 * Math.PI * k.hbar) / 1e6, 'MHz'),
        shifts: math.matrix(E.map(function (e) { return U(e / (2 * Math.PI) / 1e6, 'MHz'); })),
        st_part: U(st < EFLOOR ? 0 : st / (2 * Math.PI) / 1e6, 'MHz'),
        I_s: U(sc.I / 1e4, 'W/cm^2'), S_s: sc.I / k.IsatS,
        R_s: U(sc.R, 's^-1')
      };
      var rows = [['B', 'B_eff (static, v = 0)'], ['Bmag', '|B_eff|'], ['B_dop', 'B_eff with Doppler-shifted shift beams'], ['Bmag_dop', '|B_eff| with Doppler'],
        ['zeeman', 'g μB |B_eff| / h (per m)'], ['shifts', '¹P₁ sublevel light shifts / 2π'], ['st_part', 'scalar + tensor part (largest element) / 2π'],
        ['I_s', 'shift intensity, all components'], ['S_s', 'Σ I / Isat,s'], ['R_s', 'shift-beam scattering per unit ρₑ']];
      if (M) {
        var fc = coolForce(S, M, r, v, true), Er = k.hbar * k.hbar * k.kS * k.kS / (2 * k.m);
        o.rho_e = fc.rho_e;
        o.R_c = U(k.GC * fc.rho_e, 's^-1');
        o.R_s_abs = U(sc.R * fc.rho_e, 's^-1');
        o.heat_s = U(sc.R * fc.rho_e * 2 * Er / k.kB * 1e6 / 1e3, 'uK/ms');
        o.F = vecU(fc.F, 'N');
        o.a = vecU(fc.a, 'm/s^2');
        rows = rows.concat([['rho_e', 'excited population ρₑ'], ['R_c', 'cooling-light scattering Γc ρₑ'], ['R_s_abs', 'shift-beam scattering'],
          ['heat_s', 'shift-beam recoil heating, ΔE/k_B per time'], ['F', 'force (no gravity)'], ['a', 'acceleration (no gravity)']]);
      }
      return report(o, rows);
    }
    return { oot_beams: oot_beams, mot_beams: mot_beams, oot_B: oot_B, oot_Bx: oot_Bx, oot_By: oot_By, oot_Bz: oot_Bz, oot_Bmag: oot_Bmag,
      oot_I: oot_I, oot_grad: oot_grad, oot_B_dop: oot_B_dop, oot_shifts: oot_shifts, oot_accel: oot_accel, oot_ax: oot_ax, oot_ay: oot_ay,
      oot_az: oot_az, oot_freq: oot_freq, oot_depth: oot_depth, oot_point: oot_point };
  }
  var cache = null;
  function fn(name) { return function (ctx) { if (!cache || cache.ctx !== ctx) cache = { ctx: ctx, f: mk(ctx) }; return cache.f[name]; }; }
  P.oot.internals = { eighC: eighC, shiftH: shiftH, vectorPart: vectorPart, pyramidBeams: pyramidBeams, steadyForce: steadyForce, coolBeams: coolBeams, handedness: handedness, consts: consts };

  var XYZ = { x: 'position (from the trap centre; z is vertical)', y: 'position', z: 'position' };
  var VXYZ = { vx: 'velocity (m/s if a plain number)', vy: 'velocity', vz: 'velocity' };
  function A() { var o = {}; for (var i = 0; i < arguments.length; i++) for (var k in arguments[i]) o[k] = arguments[i][k]; return o; }
  var Sarg = { S: 'shift beams from oot_beams(…)' }, Marg = { M: 'cooling beams from mot_beams(…)' };
  var SETUP = 'S = oot_beams(2 W, 10 mm, 10)';
  var SETUPM = 'M = mot_beams(1, -0.5)';

  // ======== closed-form equations from the SI (def = calculator syntax) ========
  [
    {
      name: 'Effective B of a dual beam (S14)', def: 'Beff_dual(I, Delta, Gamma, k, gF) = inUnits(-pi*I*Gamma/(2*gF*muB*c*k^3*Delta), "G")',
      tex: 'B_{eff} = -\\frac{\\pi I}{2 g_F \\mu_B c k_0^3}\\,\\frac{\\Gamma_{ji}}{\\Delta}',
      args: { I: 'intensity of each colour (σ⁺ at +Δ, σ⁻ at −Δ)', Delta: 'detuning (angular)', Gamma: 'partial decay rate Γ_ji of the shift line', k: 'wavevector of the shift line', gF: 'g-factor of the shifted level' },
      returns: 'G, along k̂', example: 'Beff_dual(10 W/cm^2, 10*Yb.Gamma1077, Yb.Gamma1077, Yb.k1077, Yb.gJ_1P1)',
      notes: 'F_i = 1 → F_j = 0 (¹P₁ → 6s7s ¹S₀ in Yb), |Δ| ≫ Γ. The scalar and tensor shifts of the two colours cancel; only the vector part survives.'
    },
    {
      name: 'Effective B of a dual beam, Yb 1077 nm', def: 'oot_Beff_dual(I, Delta) = Beff_dual(I, Delta, Yb.Gamma1077, Yb.k1077, Yb.gJ_1P1)',
      tex: 'B_{eff} = -\\frac{\\pi I\\,\\Gamma_s}{2 g_F \\mu_B c k_s^3 \\Delta_s}', args: { I: 'intensity of each colour', Delta: 'shift detuning Δs (angular)' },
      returns: 'G', example: 'oot_Beff_dual(10 W/cm^2, 10*Yb.Gamma1077)'
    },
    {
      name: 'Peak intensity per component (S20)', def: 'oot_I0(P, w, Nquad) = 2*P/(4*Nquad*pi*w^2)',
      tex: 'I_0 = \\frac{2P}{4N_{quad}\\,\\pi w^2}', args: { P: 'shift power summed over every pass', w: 'shift beam waist', Nquad: 'number of quad beams (3 triad, 4 tetrad)' },
      returns: 'W/m²', example: 'oot_I0(2 W, 10 mm, 3) to W/cm^2'
    },
    {
      name: 'Shift saturation parameter per component', def: 'oot_S0(P, w, Nquad) = oot_I0(P, w, Nquad)/Yb.Isat1077',
      tex: 'S_s = I_0/I_{sat,s}', args: { P: 'shift power, all passes', w: 'waist', Nquad: 'quad beams' }, returns: 'dimensionless', example: 'oot_S0(2 W, 10 mm, 3)'
    },
    {
      name: 'Effective gradient β, radial (S22)', def: 'oot_grad_r(P, w, theta, Delta) = inUnits(P*sin(2*theta)*Yb.Gamma1077/(4*exp(0.5)*Yb.gJ_1P1*muB*c*(Yb.k1077*w)^3*Delta), "G/cm")',
      tex: '\\beta = \\frac{P\\sin 2\\theta}{4e^{1/2} g_F\\mu_B c\\,(k_s w)^3}\\,\\frac{\\Gamma_s}{\\Delta_s}',
      args: { P: 'shift power, all passes', w: 'waist', theta: 'beam angle from z', Delta: 'shift detuning (angular)' },
      returns: 'G/cm (∂B_x/∂x = ∂B_y/∂y = β)', example: 'oot_grad_r(2 W, 10 mm, 45 deg, 10*Yb.Gamma1077)',
      notes: 'Any N_quad ≥ 3 equally spaced quad beams. The coil MOT comparison: coil_grad_r(I).'
    },
    {
      name: 'Effective gradient, axial (S22)', def: 'oot_grad_z(P, w, theta, Delta) = -2*oot_grad_r(P, w, theta, Delta)',
      tex: '\\partial B_z/\\partial z = -2\\beta', args: { P: 'shift power, all passes', w: 'waist', theta: 'beam angle from z', Delta: 'shift detuning (angular)' },
      returns: 'G/cm', example: 'oot_grad_z(2 W, 10 mm, 45 deg, 10*Yb.Gamma1077)'
    },
    {
      name: 'Effective field near the centre (S21)', def: 'oot_B_lin(x, y, z, P, w, theta, Delta) = inUnits(oot_grad_r(P, w, theta, Delta)*[x, y, -2*z], "G")',
      tex: '\\vec B_{eff} \\approx \\beta\\,(x\\hat x + y\\hat y - 2z\\hat z)',
      args: { x: 'position', y: 'position', z: 'position (vertical)', P: 'shift power, all passes', w: 'waist', theta: 'beam angle', Delta: 'shift detuning' },
      returns: '[Bx, By, Bz] in G, valid for |r| ≪ w', example: 'oot_B_lin(1 mm, 0 mm, 1 mm, 2 W, 10 mm, 45 deg, 10*Yb.Gamma1077)'
    },
    {
      name: 'Effective field along the vertical axis (S16 summed)', def: 'oot_Bz_axis(z, P, w, theta, Delta) = inUnits(-cos(theta)*sinh(2*z*sin(theta)/w)*exp(-1/2 - 2*z^2*sin(theta)^2/w^2)*P*Yb.Gamma1077/(2*Yb.gJ_1P1*muB*c*Yb.k1077^3*w^2*Delta), "G")',
      tex: 'B_z(z) = -\\cos\\theta\\,\\sinh\\!\\frac{2z\\sin\\theta}{w}\\,e^{-\\frac12-\\frac{2z^2\\sin^2\\theta}{w^2}}\\,\\frac{P\\,\\Gamma_s}{2g_F\\mu_B c k_s^3 w^2\\Delta_s}',
      args: { z: 'height above the centre', P: 'shift power, all passes', w: 'waist', theta: 'beam angle', Delta: 'shift detuning' },
      returns: 'G (full Gaussian profile, not just the linear part)', example: 'oot_Bz_axis(5 mm, 2 W, 10 mm, 45 deg, 10*Yb.Gamma1077)',
      also: ['Bz_ax(z) = oot_Bz_axis(z, 2 W, 10 mm, 45 deg, 10*Yb.Gamma1077)', 'plot(Bz_ax, -25 mm, 25 mm, xlabel="z", ylabel="B_z on axis")'],
      notes: 'Slope at z = 0 is −2β. Independent of N_quad at fixed total power.'
    },
    {
      name: 'MOT force, 1D two-beam model (S23)', def: 'mot_force_1d(B, v, s, sT, Delta, Gamma, k, gF) = hbar*k*Gamma*(-(s/2)/(1 + sT + 4*((Delta + (gF*muB*B/hbar - k*v))/Gamma)^2) + (s/2)/(1 + sT + 4*((Delta - (gF*muB*B/hbar - k*v))/Gamma)^2))',
      tex: 'F = \\hbar k_c\\Gamma_c\\!\\left[-\\frac{S_c/2}{1+S_T+4(\\Delta_c+\\delta)^2/\\Gamma_c^2}+\\frac{S_c/2}{1+S_T+4(\\Delta_c-\\delta)^2/\\Gamma_c^2}\\right],\\ \\delta=\\frac{g_F\\mu_B B}{\\hbar}-k_c v',
      args: { B: 'field (or B_eff) along the axis', v: 'velocity along the axis', s: 'saturation per beam S_c', sT: 'total saturation S_T (≈ 6 S_c)', Delta: 'cooling detuning Δc (angular)', Gamma: 'cooling linewidth', k: 'cooling wavevector', gF: 'excited-state g' },
      returns: 'N', example: 'mot_force_1d(1 G, 0 m/s, 1, 6, -Yb.Gamma399/2, Yb.Gamma399, Yb.k399, Yb.gJ_1P1)'
    },
    {
      name: 'OOT force along z, small field (S25)', def: 'oot_F_axis(z, P, w, theta, Delta, s) = inUnits(-Yb.k399*s/(1 + 3*s)^2*Yb.gJ_1P1*muB*oot_Bz_axis(z, P, w, theta, Delta), "N")',
      tex: 'F(z) = -\\frac{k_c S_c}{(1+S_T/2)^2}\\,g_F\\mu_B B_{eff}(z),\\ S_T = 6S_c',
      args: { z: 'height', P: 'shift power, all passes', w: 'waist', theta: 'beam angle', Delta: 'shift detuning', s: 'cooling saturation per beam S_c' },
      returns: 'N (Δc = −Γc/2, g_F μB B_eff ≪ ħΓc, v = 0)', example: 'oot_F_axis(3 mm, 2 W, 10 mm, 45 deg, 10*Yb.Gamma1077, 1)',
      also: ['Fz(z) = oot_F_axis(z, 2 W, 10 mm, 45 deg, 10*Yb.Gamma1077, 1)/Yb.m', 'plot(Fz, -25 mm, 25 mm, xlabel="z", ylabel="acceleration")'],
      notes: 'The sign follows the SI; which detuning sign traps depends on the cooling-beam polarizations (mot_beams/oot_accel handle this).'
    },
    {
      name: 'OOT peak acceleration along z (S25)', def: 'oot_amax_axis(P, w, theta, Delta, s) = inUnits(abs(Yb.k399*s/(1 + 3*s)^2*cos(theta)*exp(-1/2)*0.7347337746295222*P*Yb.Gamma1077/(2*c*Yb.k1077^3*w^2*Delta))/Yb.m, "m/s^2")',
      tex: 'a_{max} = \\frac{k_c S_c\\cos\\theta}{m(1+3S_c)^2}\\,e^{-1/2}\\max_u(\\sinh u\\,e^{-u^2/2})\\,\\frac{P\\Gamma_s}{2ck_s^3w^2|\\Delta_s|}',
      args: { P: 'shift power, all passes', w: 'waist', theta: 'beam angle', Delta: 'shift detuning', s: 'cooling saturation per beam' },
      returns: 'm/s²', example: 'oot_amax_axis(2 W, 10 mm, 45 deg, 10*Yb.Gamma1077, 1)',
      notes: 'max(sinh u · e^{−u²/2}) = 0.73473 at u = 1.19968, i.e. at z = 0.59984 w / sin θ (oot_zpeak_axis).'
    },
    {
      name: 'Height of the peak OOT force', def: 'oot_zpeak_axis(w, theta) = 1.1996786402577433*w/(2*sin(theta))',
      tex: 'z_{peak} = \\frac{u^* w}{2\\sin\\theta},\\ u^*\\tanh u^* = 1', args: { w: 'waist', theta: 'beam angle' }, returns: 'length', example: 'oot_zpeak_axis(10 mm, 45 deg) to mm'
    },
    {
      name: 'OOT potential depth along z (∫ S25)', def: 'oot_depth_axis(P, w, theta, Delta, s) = abs(Yb.k399*s/(1 + 3*s)^2*P*Yb.Gamma1077/(2*c*Yb.k1077^3*w*Delta))*sqrt(pi/8)*erf(1/sqrt(2))/tan(theta)',
      tex: 'U = \\int_0^\\infty F\\,dz = \\frac{k_c S_c}{(1+3S_c)^2}\\frac{P\\,\\Gamma_s}{2ck_s^3 w|\\Delta_s|}\\sqrt{\\tfrac{\\pi}{8}}\\,\\mathrm{erf}\\!\\left(\\tfrac{1}{\\sqrt2}\\right)\\cot\\theta',
      args: { P: 'shift power, all passes', w: 'waist', theta: 'beam angle', Delta: 'shift detuning', s: 'cooling saturation per beam' },
      returns: 'J (divide by kB for a temperature)', example: 'oot_depth_axis(2 W, 10 mm, 45 deg, 10*Yb.Gamma1077, 1)/kB to mK',
      notes: 'Closed form of the SI integral U = ∫₀^∞ F(z) dz in the same small-field limit; it overestimates once g_F μB B_eff approaches ħΓc. oot_depth(S, M) does it with the full rate equations.'
    },
    {
      name: 'OOT trap frequency along z (S24)', def: 'oot_freq_axis(P, w, theta, Delta, s) = inUnits(sqrt(abs(2*oot_grad_r(P, w, theta, Delta)*Yb.k399*s*Yb.gJ_1P1*muB)/((1 + 3*s)^2*Yb.m))/(2*pi), "Hz")',
      tex: 'f_z = \\frac{1}{2\\pi}\\sqrt{\\frac{2|\\beta|\\,k_c S_c\\,g_F\\mu_B}{m(1+3S_c)^2}}',
      args: { P: 'shift power, all passes', w: 'waist', theta: 'beam angle', Delta: 'shift detuning', s: 'cooling saturation per beam' },
      returns: 'Hz', example: 'oot_freq_axis(2 W, 10 mm, 45 deg, 10*Yb.Gamma1077, 1)'
    },
    {
      name: 'Light shift of the coupled ¹P₁ sublevel', def: 'oot_ls(I, Delta) = inUnits(pi*Yb.Gamma1077*I/(2*hbar*c*Yb.k1077^3*Delta), "s^-1")',
      tex: '\\delta\\omega = \\frac{\\pi\\Gamma_s I}{2\\hbar c k_s^3\\Delta_s}', args: { I: 'intensity of one component', Delta: 'shift detuning (angular)' },
      returns: 's⁻¹ (angular; /(2π) for Hz)', example: 'oot_ls(10 W/cm^2, 10*Yb.Gamma1077)/(2*pi) to MHz',
      notes: 'SHIFT_COEFF·I/Δ in oot_shift_beams.py. A dual beam shifts m = ±1 (along k̂) by ∓ this, the effective Zeeman shift.'
    },
    {
      name: 'Speed at which a shift pass comes into resonance', def: 'oot_v_res(Delta) = inUnits(abs(Delta)/Yb.k1077, "m/s")',
      tex: 'v = |\\Delta_s|/k_s', args: { Delta: 'shift detuning (angular)' }, returns: 'm/s', example: 'oot_v_res(10*Yb.Gamma1077)',
      notes: 'An atom moving at this speed along a shift pass sees it Doppler-shifted onto resonance; B_eff is no longer static there.'
    },
    {
      name: 'Shift-beam scattering rate (S26)', def: 'oot_scatt_s(Ss, Delta, rho_e) = Yb.Gamma1077/2*Ss/(1 + 4*(Delta/Yb.Gamma1077)^2)*rho_e',
      tex: '\\Gamma_{scat,s} = \\frac{\\Gamma_s}{2}\\,\\frac{S_s}{1+4\\bar\\Delta_s^2}\\,\\rho_e', args: { Ss: 'shift saturation I/Isat,s of one component', Delta: 'shift detuning (angular)', rho_e: 'excited (¹P₁) population' },
      returns: 's⁻¹ per component', example: 'oot_scatt_s(oot_S0(2 W, 10 mm, 3), 10*Yb.Gamma1077, 0.1)'
    },
    {
      name: 'Shift-beam heating rate (S28)', def: 'oot_heat_s(Ss, Delta, rho_e, Nquad) = Nquad/2*exp(-1/2)*hbar^2*Yb.k1077^2*Yb.Gamma1077*Ss*rho_e/(Yb.m*(Delta/Yb.Gamma1077)^2)',
      tex: '\\dot E = \\frac{N_{quad}}{2}\\,e^{-1/2}\\,\\frac{\\hbar^2k_s^2\\Gamma_sS_s}{m\\bar\\Delta_s^2}\\,\\rho_e',
      args: { Ss: 'peak shift saturation per component', Delta: 'shift detuning (angular)', rho_e: 'excited population', Nquad: 'quad beams (4 gives Eq. S28)' },
      returns: 'W (divide by kB for K/s)', example: 'oot_heat_s(oot_S0(2 W, 10 mm, 3), 10*Yb.Gamma1077, 0.1, 3)/kB to uK/ms',
      notes: '4 N_quad components, each at e^{−1/2} S_s at the centre, 2E_r,s per scattered photon, |Δs| ≫ Γs.'
    },
    {
      name: 'Doppler temperature with shift-beam heating (S32)', def: 'oot_TD(Ss, Delta) = Yb.TD399 + hbar*Yb.Gamma1077/kB*(Yb.k1077/Yb.k399)^2*Ss/(Delta/Yb.Gamma1077)^2',
      tex: "T_D' = T_D + \\frac{\\hbar\\Gamma_s}{k_B}\\left(\\frac{k_s}{k_c}\\right)^2\\frac{S_s}{\\bar\\Delta_s^2}", args: { Ss: 'peak shift saturation per component', Delta: 'shift detuning (angular)' },
      returns: 'K', example: 'oot_TD(oot_S0(2 W, 10 mm, 3), 10*Yb.Gamma1077) to mK',
      notes: 'For fixed gradient, T_D′ − T_D ∝ w/Δ̄s (S33): use the largest detuning the power allows.'
    }
  ].forEach(function (e) { e.cat = cat; P.equations.push(e); });

  // ======== the shift-beam geometry (port of the simulation) ========
  [
    { name: 'Shift-beam set (pyramid of quad beams)', sig: 'oot_beams(P, w, Delta_s, theta, Nquad, retro, phi0)', js: fn('oot_beams'),
      tex: 'S = \\{\\text{dual beams}\\}', args: { P: 'shift power summed over every pass', w: 'waist', Delta_s: 'shift detuning: angular (2*pi*143 MHz) or a plain number of Γs', theta: 'beam angle from z (default 45 deg)', Nquad: 'quad beams (default 3)', retro: 'retro-reflected? (default true)', phi0: 'azimuth of the first quad beam (default 0 deg)' },
      returns: 'a shift-beam set; shows I₀, the gradient tensor and the SI β', example: 'S = oot_beams(2 W, 10 mm, 10)',
      notes: 'Same construction as pyramid_beams() in oot_shift_beams.py: each quad beam is two displaced dual beams (σ⁺ at +Δs, σ⁻ at −Δs), offset by ±w/2. Defaults are at the top of equations/oot.js.' },
    { name: 'Cooling beams (six 399 nm MOT beams)', sig: 'mot_beams(s, Delta_c, w_c, handedness)', js: fn('mot_beams'),
      tex: 'M = \\{\\pm\\hat x, \\pm\\hat y, \\pm\\hat z\\}', args: { s: 'saturation per beam (peak)', Delta_c: 'cooling detuning: angular, or a plain number of Γc', w_c: 'waist (default: plane waves)', handedness: '+1 (default) traps for Δs > 0; −1 flips every helicity' },
      returns: 'a cooling-beam set for oot_accel / oot_point', example: 'M = mot_beams(1, -0.5)',
      notes: 'Beams along the lab axes, centred on the trap, radial pairs of opposite helicity to the z pair, like a coil MOT. No slower and no beam offsets (the sim takes those from full_trap_sweep).' },
    { name: 'OOT effective field vector at any point', sig: 'oot_B(S, x, y, z)', js: fn('oot_B'), tex: '\\vec B_{eff}(\\vec r) = \\frac{\\hbar\\,\\vec a}{g_F\\mu_B},\\ H_{ls}=\\vec a\\cdot\\vec F+\\dots',
      args: A(Sarg, XYZ), returns: '[Bx, By, Bz] in G (v = 0)', example: 'oot_B(S, 2 mm, 0 mm, 3 mm)',
      notes: 'effective_field() in oot_shift_beams.py: the vector part of the summed light-shift Hamiltonian, with 1/Δ regularised by Γs.' },
    { name: 'OOT effective field magnitude', sig: 'oot_Bmag(S, x, y, z)', js: fn('oot_Bmag'), tex: '|\\vec B_{eff}(\\vec r)|', args: A(Sarg, XYZ), returns: 'G', example: 'oot_Bmag(S, 2 mm, 0 mm, 3 mm)',
      also: ['Bxz(x, z) = oot_Bmag(S, x, 0 mm, z)', 'plot2d(Bxz, -20 mm, 20 mm, -20 mm, 20 mm, xlabel="x", ylabel="z", title="|B_eff|")'] },
    { name: 'OOT effective field, x component', sig: 'oot_Bx(S, x, y, z)', js: fn('oot_Bx'), tex: 'B_{eff,x}', args: A(Sarg, XYZ), returns: 'G', example: 'oot_Bx(S, 2 mm, 0 mm, 0 mm)' },
    { name: 'OOT effective field, y component', sig: 'oot_By(S, x, y, z)', js: fn('oot_By'), tex: 'B_{eff,y}', args: A(Sarg, XYZ), returns: 'G', example: 'oot_By(S, 0 mm, 2 mm, 0 mm)' },
    { name: 'OOT effective field, z component', sig: 'oot_Bz(S, x, y, z)', js: fn('oot_Bz'), tex: 'B_{eff,z}', args: A(Sarg, XYZ), returns: 'G', example: 'oot_Bz(S, 0 mm, 0 mm, 2 mm)',
      also: ['Bz(z) = oot_Bz(S, 0 mm, 0 mm, z)', 'plot(Bz, -25 mm, 25 mm, xlabel="z", ylabel="B_eff,z on axis")'] },
    { name: 'OOT effective field with Doppler-shifted shift beams', sig: 'oot_B_dop(S, x, y, z, vx, vy, vz)', js: fn('oot_B_dop'), tex: '\\vec B_{eff}(\\vec r, \\vec v),\\ \\Delta_s \\to \\Delta_s - k_s\\hat k\\cdot\\vec v',
      args: A(Sarg, XYZ, VXYZ), returns: '[Bx, By, Bz] in G', example: 'oot_B_dop(S, 0 mm, 0 mm, 3 mm, 0, 0, 20 m/s)',
      notes: 'A moving atom sees each shift pass at its own Doppler-shifted detuning, so the two colours of a dual beam no longer cancel exactly and B_eff depends on v (what OOT_DOPPLER = 1 does in the sim).' },
    { name: 'OOT ¹P₁ sublevel light shifts', sig: 'oot_shifts(S, x, y, z, vx, vy, vz)', js: fn('oot_shifts'), tex: '\\mathrm{eig}(H_{ls})/2\\pi', args: A(Sarg, XYZ, VXYZ),
      returns: 'three shifts in MHz (lowest first)', example: 'oot_shifts(S, 0 mm, 0 mm, 3 mm, 0, 0, 0)' },
    { name: 'OOT shift-beam intensity at a point', sig: 'oot_I(S, x, y, z)', js: fn('oot_I'), tex: '\\sum_l I_l(\\vec r)', args: A(Sarg, XYZ), returns: 'W/cm², all components', example: 'oot_I(S, 0 mm, 0 mm, 0 mm)' },
    { name: 'OOT effective gradient tensor at the centre', sig: 'oot_grad(S)', js: fn('oot_grad'), tex: '\\beta_{ij} = \\partial B_{eff,j}/\\partial r_i', args: Sarg,
      returns: '3×3 in G/cm (≈ β·diag(1, 1, −2))', example: 'oot_grad(S)', notes: 'gradient_tensor() in oot_shift_beams.py.' },
    { name: 'OOT acceleration vector at any point and velocity', sig: 'oot_accel(S, M, x, y, z, vx, vy, vz, doppler)', js: fn('oot_accel'),
      tex: '\\vec a = \\frac{\\hbar k_c\\Gamma_c}{m}\\sum_l \\hat k_l\\,(R_l - \\text{stim.})', args: A(Sarg, Marg, XYZ, VXYZ, { doppler: 'Doppler-shift the shift beams? (default true)' }),
      returns: '[ax, ay, az] in m/s², gravity not included', example: 'oot_accel(S, M, 0 mm, 0 mm, 3 mm, 0, 0, 0)',
      notes: 'steady_force() in oot_rate_eq.py: J = 0 → 1 rate equations in the eigenbasis of the light-shift Hamiltonian (which need not point along one axis once the atom moves).' },
    { name: 'OOT acceleration, x component', sig: 'oot_ax(S, M, x, y, z, vx, vy, vz, doppler)', js: fn('oot_ax'), tex: 'a_x', args: A(Sarg, Marg, XYZ, VXYZ), returns: 'm/s²', example: 'oot_ax(S, M, 3 mm, 0 mm, 0 mm, 0, 0, 0)',
      also: ['ax(x) = oot_ax(S, M, x, 0 mm, 0 mm, 0, 0, 0)', 'plot(ax, -25 mm, 25 mm, xlabel="x", ylabel="a_x at v = 0")'] },
    { name: 'OOT acceleration, y component', sig: 'oot_ay(S, M, x, y, z, vx, vy, vz, doppler)', js: fn('oot_ay'), tex: 'a_y', args: A(Sarg, Marg, XYZ, VXYZ), returns: 'm/s²', example: 'oot_ay(S, M, 0 mm, 3 mm, 0 mm, 0, 0, 0)' },
    { name: 'OOT acceleration, z component', sig: 'oot_az(S, M, x, y, z, vx, vy, vz, doppler)', js: fn('oot_az'), tex: 'a_z', args: A(Sarg, Marg, XYZ, VXYZ), returns: 'm/s²', example: 'oot_az(S, M, 0 mm, 0 mm, 3 mm, 0, 0, 0)',
      also: ['az(vz) = oot_az(S, M, 0 mm, 0 mm, -3 mm, 0, 0, vz)', 'plot(az, -40 m/s, 40 m/s, xlabel="v_z", ylabel="a_z 3 mm below the centre")'] },
    { name: 'OOT trap frequencies at the centre', sig: 'oot_freq(S, M)', js: fn('oot_freq'), tex: 'f_i = \\frac{1}{2\\pi}\\sqrt{-\\partial_i F_i/m}', args: A(Sarg, Marg),
      returns: '[fx, fy, fz] in Hz (0 = not trapping along that axis)', example: 'oot_freq(S, M)', notes: 'stiffness() and trap_freq_hz() in oot_trap_sweep.py (±0.5 mm finite difference, v = 0).' },
    { name: 'OOT potential depth', sig: 'oot_depth(S, M)', js: fn('oot_depth'), tex: 'U = \\min_{\\pm x,\\pm y,\\pm z}\\max_r\\left(-\\int_0^r F\\,dr\'\\right)', args: A(Sarg, Marg),
      returns: 'mK (weakest of ±x, ±y, ±z)', example: 'oot_depth(S, M)', notes: 'potential_depth_mK() in oot_trap_sweep.py, out to 3 × the larger waist (3 w_s for plane-wave cooling beams).' },
    { name: 'Everything at one point', sig: 'oot_point(S, x, y, z, vx, vy, vz, M)', js: fn('oot_point'), tex: '\\text{OOT at } (\\vec r, \\vec v)', args: A(Sarg, XYZ, VXYZ, { M: 'cooling beams (optional): adds ρₑ, scattering, heating, force' }),
      returns: 'a table; pick entries with p.B, p.zeeman, p.a, …', example: 'p = oot_point(S, 1 mm, 0 mm, 3 mm, 0, 0, 10 m/s, M)',
      also: ['p.B_dop'],
      notes: 'B_eff static and Doppler-shifted, |B|, equivalent Zeeman splitting, the three ¹P₁ light shifts and the scalar + tensor part the Doppler shift leaves, shift intensity and S_s, shift scattering; with M also ρₑ, cooling and shift scattering rates, recoil heating, force and acceleration.' }
  ].forEach(function (e) { e.cat = cat; P.equations.push(e); });

  // worksheet setup lines for the "Try" buttons that need S and M
  P.equations.forEach(function (e) {
    if (e.cat !== cat || !e.sig || /^oot_beams|^mot_beams/.test(e.sig)) return;
    var pre = /\bM\b/.test(e.sig) ? [SETUPM] : [];
    e.also = pre.concat([e.example], e.also || []);
    e.example = SETUP;
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
