/* The lab's anti-Helmholtz MOT coils: the same model as coil_field_model.py (magpylib), ported so
 * the calculator can give the field at any point. Every turn is an ideal circular current loop and
 * its exact off-axis field is computed with complete elliptic integrals, which is what magpylib's
 * current.Circle does; the two agree to better than 1 part in 10^9 at the test points.
 *
 * Geometry and imperfections are the constants below (same names and numbers as the Python file;
 * the FT_COIL_* environment overrides there are the last five entries here). Edit, save, reload.
 * (install.sh copies this file from the source folder each time, so edit it there and re-install.)
 *
 * Coordinates: z is the coil axis, origin midway between the two stacks. The top stack carries
 * +I, the bottom one −I. Lengths may be given with units (5 mm) or as plain numbers in metres.
 */
(function (g) {
  var P = g.PhysCalc = g.PhysCalc || {};
  P.equations = P.equations || [];
  var cat = 'Lab MOT coils';

  var COIL = P.motCoil = {
    INNER_RADIUS_MM: 110,
    COIL_STACK_HEIGHT_MM: 48,
    WIRE_SIDE_MM: 6,
    GAP_BETWEEN_COILS_MM: 70,
    N_TOP_COILS: 4,              // coils per side, wound side by side in radius
    LAYERS_PER_COIL: 2,
    // imperfections (FT_COIL_TURNS_TOP, FT_COIL_TURNS_BOTTOM, FT_COIL_REF_A_TOP, FT_COIL_REF_A_BOTTOM, FT_COIL_DZ_*_MM)
    N_TURNS_TOP: null,           // null = nominal (64); may be fractional, e.g. 60.5
    N_TURNS_BOTTOM: null,
    REF_CURRENT_TOP_A: -1.0,      // current in the top stack per 1 A asked for
    REF_CURRENT_BOTTOM_A: -1.0,
    DZ_TOP_MM: 0.0,              // axial misplacement of each stack
    DZ_BOTTOM_MM: 0.0
  };

  // ---- complete elliptic integrals K(m), E(m), m = k², by the arithmetic-geometric mean ----
  function ellipKE(m) {
    var a = 1, b = Math.sqrt(1 - m), c = Math.sqrt(m), sum = 0.5 * c * c, pow = 0.5;
    for (var n = 0; n < 40 && Math.abs(c) > 1e-17; n++) {
      var an = 0.5 * (a + b); c = 0.5 * (a - b); b = Math.sqrt(a * b); a = an;
      pow *= 2; sum += pow * c * c;
    }
    var K = Math.PI / (2 * a);
    return [K, K * (1 - sum)];
  }
  // Field of one circular loop (radius a, centred on the z axis at height zc, current I) at (rho, z). SI units.
  var MU0_4PI = 1e-7 * (P.codata && P.codata.filter(function (k) { return k.name === 'mu0'; })[0] ? P.codata.filter(function (k) { return k.name === 'mu0'; })[0].value / (4e-7 * Math.PI) : 1);
  function loopField(a, zc, I, rho, z, out) {
    var dz = z - zc, ap = (a + rho) * (a + rho) + dz * dz, am = (a - rho) * (a - rho) + dz * dz;
    if (am < 1e-24) { out[0] = NaN; out[1] = NaN; return; }             // on the wire itself
    var KE = ellipKE(4 * a * rho / ap), K = KE[0], E = KE[1], pre = 2 * MU0_4PI * I / Math.sqrt(ap);
    out[1] += pre * (K + (a * a - rho * rho - dz * dz) / am * E);
    if (rho > 1e-12 * a) out[0] += pre * dz / rho * (-K + (a * a + rho * rho + dz * dz) / am * E);
  }
  // The loops of both stacks at 1 A: [radius_m, height_m, current_A]. Rebuilt if COIL is edited.
  var loops = null, loopsKey = '';
  function getLoops() {
    var key = JSON.stringify(COIL);
    if (loops && key === loopsKey) return loops;
    var turnsPerLayer = Math.floor(COIL.COIL_STACK_HEIGHT_MM / COIL.WIRE_SIDE_MM);
    var nRadial = COIL.N_TOP_COILS * COIL.LAYERS_PER_COIL;
    var nominal = nRadial * turnsPerLayer;
    loops = [];
    [[+1, COIL.N_TURNS_TOP, COIL.REF_CURRENT_TOP_A, COIL.DZ_TOP_MM], [-1, COIL.N_TURNS_BOTTOM, COIL.REF_CURRENT_BOTTOM_A, COIL.DZ_BOTTOM_MM]].forEach(function (s) {
      var sign = s[0], nTurns = s[1] === null || s[1] === undefined ? nominal : s[1];
      var nRows = Math.ceil(nTurns / nRadial - 1e-9);
      for (var r = 0; r < nRows; r++) {
        var h = COIL.GAP_BETWEEN_COILS_MM / 2 + COIL.WIRE_SIDE_MM / 2 + r * COIL.WIRE_SIDE_MM;
        var fill = Math.max(0, Math.min(1, nTurns / nRadial - r));          // a partly wound last row carries a fraction
        for (var q = 0; q < nRadial; q++) {
          var rad = COIL.INNER_RADIUS_MM + COIL.WIRE_SIDE_MM / 2 + q * COIL.WIRE_SIDE_MM;
          loops.push([rad * 1e-3, (sign * h + s[3]) * 1e-3, sign * fill * s[2]]);
        }
      }
    });
    loopsKey = key;
    return loops;
  }
  // B in tesla at (x, y, z) metres for a coil current in amperes
  function fieldT(x, y, z, I) {
    var rho = Math.sqrt(x * x + y * y), acc = [0, 0], L = getLoops();
    for (var i = 0; i < L.length; i++) loopField(L[i][0], L[i][1], L[i][2], rho, z, acc);
    var br = acc[0] * I, bz = acc[1] * I;
    return rho > 0 ? [br * x / rho, br * y / rho, bz] : [0, 0, bz];
  }
  P.motCoil.fieldT = fieldT;
  function slope(xs, ys) {       // least-squares slope
    var n = xs.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (var i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
    return (n * sxy - sx * sy) / (n * sxx - sx * sx);
  }
  function gradient(axis, I) {   // G/cm, linear fit over ±5 mm through the centre (as in the Python file)
    var xs = [], ys = [];
    for (var k = 0; k < 41; k++) {
      var s = (-5 + k * 0.25) * 1e-3, B = axis === 2 ? fieldT(0, 0, s, I) : fieldT(s, 0, 0, I);
      xs.push(s * 100); ys.push(B[axis] * 1e4);
    }
    return slope(xs, ys);
  }
  function zeroZ() {             // height of the B = 0 point on the axis, in mm
    var prev = null, pz = 0;
    for (var k = 0; k <= 800; k++) {
      var z = -40 + k * 0.1, b = fieldT(0, 0, z * 1e-3, 1)[2];
      if (prev !== null && ((prev <= 0 && b > 0) || (prev >= 0 && b < 0))) return Math.round((pz + (z - pz) * (0 - prev) / (b - prev)) * 1e6) / 1e6;
      prev = b; pz = z;
    }
    return NaN;
  }

  function mk(ctx) {
    var math = ctx.math;
    function len(v, what) {
      if (math.isUnit(v)) { try { return v.toNumber('m'); } catch (e) { throw new Error(what + ' must be a length (e.g. 5 mm)'); } }
      if (typeof v !== 'number') throw new Error(what + ' must be a length (e.g. 5 mm)');
      return v;
    }
    function amp(v) {
      if (math.isUnit(v)) { try { return v.toNumber('A'); } catch (e) { throw new Error('I must be a current (e.g. 135 A)'); } }
      if (typeof v !== 'number') throw new Error('I must be a current (e.g. 135 A)');
      return v;
    }
    function G(t) { return math.unit(t * 1e4, 'G'); }
    function at(x, y, z, I) {
      if (I === undefined) throw new Error('give x, y, z and the current: coil_B(x, y, z, I)');
      return fieldT(len(x, 'x'), len(y, 'y'), len(z, 'z'), amp(I));
    }
    return {
      B: function coil_B(x, y, z, I) { var b = at(x, y, z, I); return math.matrix([G(b[0]), G(b[1]), G(b[2])]); },
      Bx: function coil_Bx(x, y, z, I) { return G(at(x, y, z, I)[0]); },
      By: function coil_By(x, y, z, I) { return G(at(x, y, z, I)[1]); },
      Bz: function coil_Bz(x, y, z, I) { return G(at(x, y, z, I)[2]); },
      Bmag: function coil_Bmag(x, y, z, I) { var b = at(x, y, z, I); return G(Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2])); },
      gz: function coil_grad_z(I) { return math.unit(gradient(2, amp(I)), 'G/cm'); },
      gr: function coil_grad_r(I) { return math.unit(gradient(0, amp(I)), 'G/cm'); },
      z0: function coil_zero_z() { return math.unit(zeroZ(), 'mm'); }
    };
  }
  var XYZI = { x: 'position across the axis (length, or metres)', y: 'position across the axis', z: 'position along the coil axis, from the midpoint', I: 'coil current' };
  var NOTE = 'Same model as coil_field_model.py; geometry is set at the top of equations/mot_coils.js.';
  [
    { name: 'MOT coil field vector at any point', sig: 'coil_B(x, y, z, I)', js: function (ctx) { return mk(ctx).B; }, tex: '\\vec B(x,y,z) = \\sum_{\\text{turns}} \\vec B_{\\text{loop}}', args: XYZI, returns: '[Bx, By, Bz] in G', notes: NOTE, example: 'coil_B(2 mm, 0 mm, 5 mm, 135 A)' },
    { name: 'MOT coil field magnitude at any point', sig: 'coil_Bmag(x, y, z, I)', js: function (ctx) { return mk(ctx).Bmag; }, tex: '|\\vec B(x,y,z)|', args: XYZI, returns: 'G', example: 'coil_Bmag(2 mm, 0 mm, 5 mm, 135 A)',
      also: ['Bxz(x, z) = coil_Bmag(x, 0 mm, z, 135 A)', 'plot2d(Bxz, -30 mm, 30 mm, -30 mm, 30 mm, xlabel="x", ylabel="z", title="|B| at 135 A")'] },
    { name: 'MOT coil axial field component', sig: 'coil_Bz(x, y, z, I)', js: function (ctx) { return mk(ctx).Bz; }, tex: 'B_z(x,y,z)', args: XYZI, returns: 'G', example: 'coil_Bz(0 mm, 0 mm, 10 mm, 135 A)',
      also: ['Bax(z) = coil_Bz(0 mm, 0 mm, z, 135 A)', 'plot(Bax, -60 mm, 60 mm, xlabel="z", ylabel="B_z on axis")'] },
    { name: 'MOT coil field component along x', sig: 'coil_Bx(x, y, z, I)', js: function (ctx) { return mk(ctx).Bx; }, tex: 'B_x(x,y,z)', args: XYZI, returns: 'G', example: 'coil_Bx(10 mm, 0 mm, 0 mm, 135 A)' },
    { name: 'MOT coil field component along y', sig: 'coil_By(x, y, z, I)', js: function (ctx) { return mk(ctx).By; }, tex: 'B_y(x,y,z)', args: XYZI, returns: 'G', example: 'coil_By(0 mm, 10 mm, 0 mm, 135 A)' },
    { name: 'MOT coil axial gradient at the centre', sig: 'coil_grad_z(I)', js: function (ctx) { return mk(ctx).gz; }, tex: '\\partial B_z/\\partial z', args: { I: 'coil current' }, returns: 'G/cm (linear fit over ±5 mm)', example: 'coil_grad_z(135 A)' },
    { name: 'MOT coil radial gradient at the centre', sig: 'coil_grad_r(I)', js: function (ctx) { return mk(ctx).gr; }, tex: '\\partial B_x/\\partial x', args: { I: 'coil current' }, returns: 'G/cm, about −½ of the axial one', example: 'coil_grad_r(135 A)' },
    { name: 'MOT coil field-zero height on the axis', sig: 'coil_zero_z()', js: function (ctx) { return mk(ctx).z0; }, tex: 'z_0:\\ B_z(0,0,z_0)=0', args: {}, returns: 'mm (0 for matched stacks)', example: 'coil_zero_z()' }
  ].forEach(function (e) { e.cat = cat; P.equations.push(e); });
})(typeof globalThis !== 'undefined' ? globalThis : this);
