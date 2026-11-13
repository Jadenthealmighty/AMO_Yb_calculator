/* Optics & lasers. ABCD / q-parameter helpers work in plain SI metres (numbers);
 * everything else is unit-aware. Angles: radians, or write 30 deg. */
(function (g) {
  var P = g.PhysCalc = g.PhysCalc || {};
  P.equations = P.equations || [];
  var cat = 'Optics & lasers';

  function m(math, x) { return math.isUnit(x) ? x.toNumber('m') : x; }

  [
    { name: 'Photon energy', def: 'photon_E(lambda) = h*c/lambda', tex: 'E = hc/\\lambda', args: { lambda: 'wavelength' }, returns: 'J', example: 'photon_E(Yb.lambda399) to eV' },
    { name: 'Frequency from wavelength', def: 'freq(lambda) = c/lambda', tex: '\\nu = c/\\lambda', args: { lambda: 'vacuum wavelength' }, returns: 'Hz', example: 'freq(759.3537 nm) to THz' },
    { name: 'Wavelength from frequency', def: 'wavelength(nu) = c/nu', tex: '\\lambda = c/\\nu', args: { nu: 'frequency' }, returns: 'm', example: 'wavelength(518.294025 THz) to nm' },
    { name: 'Wavenumber', def: 'wavenumber(lambda) = inUnits(1/lambda, "cm^-1")', tex: '\\tilde\\nu = 1/\\lambda', args: { lambda: 'wavelength' }, returns: 'cm⁻¹', example: 'wavenumber(Yb.lambda556)' },
    { name: 'Frequency from wavenumber', def: 'freq_wn(k) = c*k', tex: '\\nu = c\\,\\tilde\\nu', args: { k: 'wavenumber (e.g. Yb.E_3S1)' }, returns: 'Hz', example: 'freq_wn(Yb.E_3S1 - Yb.E_3P1) to GHz' },
    { name: 'Photon flux of a beam', def: 'photon_flux(Pw, lambda) = inUnits(Pw*lambda/(h*c), "s^-1")', tex: '\\dot N = P\\lambda/hc', args: { Pw: 'power', lambda: 'wavelength' }, returns: 's⁻¹', example: 'photon_flux(1 mW, Yb.lambda399)' },
    { name: 'Rayleigh range', def: 'zR(w0, lambda) = pi*w0^2/lambda', tex: 'z_R = \\pi w_0^2/\\lambda', args: { w0: 'waist (1/e² radius)', lambda: 'wavelength' }, returns: 'm', example: 'zR(100 um, Yb.lambda759) to mm' },
    { name: 'Beam radius vs z', def: 'w_z(z, w0, lambda) = w0*sqrt(1 + (z/zR(w0, lambda))^2)', tex: 'w(z) = w_0\\sqrt{1+(z/z_R)^2}', args: { z: 'distance from waist', w0: 'waist', lambda: 'wavelength' }, returns: 'm', example: 'w_z(10 cm, 100 um, Yb.lambda759) to um' },
    { name: 'Wavefront radius of curvature', def: 'R_z(z, w0, lambda) = z*(1 + (zR(w0, lambda)/z)^2)', tex: 'R(z) = z\\left[1+(z_R/z)^2\\right]', args: { z: 'distance from waist', w0: 'waist', lambda: 'wavelength' }, returns: 'm', example: 'R_z(10 cm, 100 um, Yb.lambda759)' },
    { name: 'Gouy phase', def: 'gouy(z, w0, lambda) = atan(z/zR(w0, lambda))', tex: '\\zeta(z) = \\arctan(z/z_R)', args: { z: 'distance from waist', w0: 'waist', lambda: 'wavelength' }, returns: 'rad', example: 'gouy(1 cm, 100 um, Yb.lambda759)' },
    { name: 'Gaussian beam peak intensity', def: 'I_peak(Pw, w) = 2*Pw/(pi*w^2)', tex: 'I_0 = \\frac{2P}{\\pi w^2}', args: { Pw: 'power', w: '1/e² radius' }, returns: 'W/m²', example: 'I_peak(10 mW, 2 mm) to mW/cm^2' },
    { name: 'Gaussian beam intensity profile', def: 'I_gauss(r, Pw, w) = I_peak(Pw, w)*exp(-2*r^2/w^2)', tex: 'I(r) = \\frac{2P}{\\pi w^2}e^{-2r^2/w^2}', args: { r: 'radius', Pw: 'power', w: '1/e² radius' }, returns: 'W/m²', example: 'I_gauss(1 mm, 10 mW, 2 mm) to mW/cm^2' },
    { name: 'Elliptical beam peak intensity', def: 'I_peak_ellip(Pw, wx, wy) = 2*Pw/(pi*wx*wy)', tex: 'I_0 = \\frac{2P}{\\pi w_x w_y}', args: { Pw: 'power', wx: '1/e² radius x', wy: '1/e² radius y' }, returns: 'W/m²', example: 'I_peak_ellip(50 mW, 3 mm, 1 mm) to mW/cm^2' },
    { name: 'Power through circular aperture', def: 'P_frac_aperture(a, w) = 1 - exp(-2*a^2/w^2)', tex: 'P_t/P = 1-e^{-2a^2/w^2}', args: { a: 'aperture radius', w: '1/e² radius' }, returns: 'fraction', example: 'P_frac_aperture(1 mm, 1 mm)' },
    { name: 'Knife-edge power curve', def: 'knife_edge(x, P0, x0, w) = P0/2*(1 + erf(sqrt(2)*(x - x0)/w))', tex: 'P(x) = \\frac{P_0}{2}\\left[1+\\mathrm{erf}\\frac{\\sqrt2(x-x_0)}{w}\\right]', args: { x: 'blade position', P0: 'total power', x0: 'beam centre', w: '1/e² radius' }, returns: 'units of P0', example: 'knife_edge(0.5 mm, 1 mW, 0 mm, 1 mm)' },
    { name: 'Focused waist', def: 'w_focus(lambda, f, w_in) = lambda*f/(pi*w_in)', tex: "w_0' = \\frac{\\lambda f}{\\pi w}", args: { lambda: 'wavelength', f: 'focal length', w_in: 'input 1/e² radius (collimated)' }, returns: 'm', example: 'w_focus(Yb.lambda759, 300 mm, 1.5 mm) to um' },
    { name: 'Far-field divergence (half angle)', def: 'divergence(w0, lambda) = lambda/(pi*w0)', tex: '\\theta = \\lambda/\\pi w_0', args: { w0: 'waist', lambda: 'wavelength' }, returns: 'rad', example: 'divergence(100 um, Yb.lambda399) * 1000' },
    { name: 'FWHM from 1/e² radius', def: 'fwhm_from_w(w) = w*sqrt(2*log(2))', tex: '\\mathrm{FWHM} = w\\sqrt{2\\ln 2}', args: { w: '1/e² radius' }, returns: 'length', example: 'fwhm_from_w(1 mm)' },
    { name: '1/e² radius from FWHM', def: 'w_from_fwhm(fw) = fw/sqrt(2*log(2))', tex: 'w = \\mathrm{FWHM}/\\sqrt{2\\ln 2}', args: { fw: 'intensity FWHM' }, returns: 'length', example: 'w_from_fwhm(1.18 mm)' },
    { name: 'Gaussian mode-matching efficiency', def: 'mode_match(w1, w2) = (2*w1*w2/(w1^2 + w2^2))^2', tex: '\\eta = \\left(\\frac{2w_1w_2}{w_1^2+w_2^2}\\right)^2', args: { w1: 'waist 1', w2: 'waist 2 (same position)' }, returns: 'fraction', example: 'mode_match(2.5 um, 2.0 um)' },
    { name: 'Thin lens image distance', def: 'thin_lens(f, s_obj) = 1/(1/f - 1/s_obj)', tex: "\\frac1{s'} = \\frac1f - \\frac1s", args: { f: 'focal length', s_obj: 'object distance' }, returns: 'length', example: 'thin_lens(100 mm, 300 mm)' },
    { name: "Lensmaker's equation (thin)", def: 'lensmaker(n, R1, R2) = 1/((n - 1)*(1/R1 - 1/R2))', tex: '\\frac1f = (n-1)\\left(\\frac1{R_1}-\\frac1{R_2}\\right)', args: { n: 'index', R1: 'front radius', R2: 'back radius' }, returns: 'length', example: 'lensmaker(1.5, 100 mm, -100 mm)' },
    { name: "Snell's law (refraction angle)", def: 'snell(n1, n2, th1) = asin(n1*sin(th1)/n2)', tex: 'n_1\\sin\\theta_1 = n_2\\sin\\theta_2', args: { n1: 'incident index', n2: 'transmitted index', th1: 'incidence angle' }, returns: 'rad', example: 'snell(1, 1.5, 45 deg) rad to deg' },
    { name: "Brewster's angle", def: 'brewster(n1, n2) = atan(n2/n1)', tex: '\\theta_B = \\arctan(n_2/n_1)', args: { n1: 'incident index', n2: 'other index' }, returns: 'rad', example: 'brewster(1, 1.45) rad to deg' },
    { name: 'Critical angle (TIR)', def: 'crit_angle(n1, n2) = asin(n2/n1)', tex: '\\theta_c = \\arcsin(n_2/n_1)', args: { n1: 'denser index', n2: 'rarer index' }, returns: 'rad', example: 'crit_angle(1.45, 1) rad to deg' },
    { name: 'Fresnel r_s', def: 'fresnel_rs(n1, n2, th) = (n1*cos(th) - n2*cos(snell(n1, n2, th)))/(n1*cos(th) + n2*cos(snell(n1, n2, th)))', tex: 'r_s = \\frac{n_1\\cos\\theta_i - n_2\\cos\\theta_t}{n_1\\cos\\theta_i + n_2\\cos\\theta_t}', args: { n1: 'incident index', n2: 'transmitted index', th: 'incidence angle' }, returns: 'amplitude (complex past TIR)', example: 'fresnel_rs(1, 1.5, 45 deg)' },
    { name: 'Fresnel r_p', def: 'fresnel_rp(n1, n2, th) = (n2*cos(th) - n1*cos(snell(n1, n2, th)))/(n2*cos(th) + n1*cos(snell(n1, n2, th)))', tex: 'r_p = \\frac{n_2\\cos\\theta_i - n_1\\cos\\theta_t}{n_2\\cos\\theta_i + n_1\\cos\\theta_t}', args: { n1: 'incident index', n2: 'transmitted index', th: 'incidence angle' }, returns: 'amplitude', example: 'fresnel_rp(1, 1.5, 56.31 deg)' },
    { name: 'Fresnel power reflectances', def: 'fresnel_R(n1, n2, th) = [abs(fresnel_rs(n1, n2, th))^2, abs(fresnel_rp(n1, n2, th))^2]', tex: '[R_s,\\ R_p] = [|r_s|^2,\\ |r_p|^2]', args: { n1: 'incident index', n2: 'transmitted index', th: 'incidence angle' }, returns: '[Rs, Rp]', example: 'fresnel_R(1, 1.45, 45 deg)' },
    { name: 'Normal-incidence reflectance', def: 'R_normal(n1, n2) = ((n1 - n2)/(n1 + n2))^2', tex: 'R = \\left(\\frac{n_1-n_2}{n_1+n_2}\\right)^2', args: { n1: 'index 1', n2: 'index 2' }, returns: 'fraction', example: 'R_normal(1, 1.45)' },
    { name: 'Free spectral range (linear cavity)', def: 'FSR(L) = c/(2*L)', tex: '\\nu_{FSR} = c/2L', args: { L: 'mirror spacing' }, returns: 'Hz', example: 'FSR(10 cm) to GHz' },
    { name: 'Free spectral range (ring cavity)', def: 'FSR_ring(Lrt) = c/Lrt', tex: '\\nu_{FSR} = c/L_{rt}', args: { Lrt: 'round-trip length' }, returns: 'Hz', example: 'FSR_ring(30 cm) to MHz' },
    { name: 'Finesse (equal mirrors)', def: 'finesse(R) = pi*sqrt(R)/(1 - R)', tex: '\\mathcal F = \\frac{\\pi\\sqrt R}{1-R}', args: { R: 'mirror reflectivity' }, returns: 'dimensionless', example: 'finesse(0.999)' },
    { name: 'Finesse (two mirrors)', def: 'finesse2(R1, R2) = pi*(R1*R2)^(1/4)/(1 - sqrt(R1*R2))', tex: '\\mathcal F = \\frac{\\pi (R_1R_2)^{1/4}}{1-\\sqrt{R_1R_2}}', args: { R1: 'reflectivity 1', R2: 'reflectivity 2' }, returns: 'dimensionless', example: 'finesse2(0.999, 0.99)' },
    { name: 'Cavity linewidth', def: 'cav_linewidth(L, F) = c/(2*L*F)', tex: '\\delta\\nu = \\nu_{FSR}/\\mathcal F', args: { L: 'length', F: 'finesse' }, returns: 'Hz', example: 'cav_linewidth(10 cm, 1000) to kHz' },
    { name: 'Fabry–Pérot (Airy) transmission', def: 'fp_T(nu, L, R) = 1/(1 + 4*R/(1 - R)^2*sin(2*pi*nu*L/c)^2)', tex: 'T = \\frac{1}{1+\\frac{4R}{(1-R)^2}\\sin^2(2\\pi\\nu L/c)}', args: { nu: 'frequency', L: 'length', R: 'mirror reflectivity' }, returns: 'fraction', example: 'fp_T(1 GHz, 15 cm, 0.95)' },
    { name: 'Symmetric resonator waist', def: 'cav_w0(L, Rc, lambda) = sqrt(lambda/(2*pi)*sqrt(L*(2*Rc - L)))', tex: 'w_0^2 = \\frac{\\lambda}{2\\pi}\\sqrt{L(2R-L)}', args: { L: 'length', Rc: 'mirror radius of curvature', lambda: 'wavelength' }, returns: 'm', example: 'cav_w0(10 cm, 50 cm, Yb.lambda578) to um' },
    { name: 'Resonator g-parameter', def: 'cav_g(L, Rc) = 1 - L/Rc', tex: 'g = 1 - L/R \\quad (0\\le g_1g_2\\le 1\\ \\text{stable})', args: { L: 'length', Rc: 'mirror ROC' }, returns: 'dimensionless', example: 'cav_g(10 cm, 50 cm)' },
    { name: 'Grating equation (diffracted angle)', def: 'grating(lambda, d, order, th_in) = asin(order*lambda/d - sin(th_in))', tex: '\\sin\\theta_m = m\\lambda/d - \\sin\\theta_i', args: { lambda: 'wavelength', d: 'groove spacing', order: 'diffraction order', th_in: 'incidence angle' }, returns: 'rad', example: 'grating(Yb.lambda399, 1 mm/3600, 1, 30 deg) rad to deg' },
    { name: 'Littrow angle', def: 'littrow(lambda, d) = asin(lambda/(2*d))', tex: '\\theta_L = \\arcsin(\\lambda/2d)', args: { lambda: 'wavelength', d: 'groove spacing' }, returns: 'rad', example: 'littrow(Yb.lambda399, 1 mm/3600) rad to deg' },
    { name: 'Airy-disk radius (first zero)', def: 'airy_r(lambda, f, D) = 1.22*lambda*f/D', tex: 'r = 1.22\\,\\lambda f/D', args: { lambda: 'wavelength', f: 'focal length', D: 'aperture diameter' }, returns: 'm', example: 'airy_r(Yb.lambda399, 50 mm, 25 mm) to um' },
    { name: "Malus's law", def: 'malus(I0, th) = I0*cos(th)^2', tex: 'I = I_0\\cos^2\\theta', args: { I0: 'input', th: 'angle' }, returns: 'units of I0', example: 'malus(1 mW, 30 deg)' },
    { name: 'Decibels', def: 'dB(P1, P2) = 10*log10(P1/P2)', tex: '10\\log_{10}(P_1/P_2)', args: { P1: 'power 1', P2: 'power 2' }, returns: 'dB', example: 'dB(1 mW, 1 W)' },
    { name: 'Optical density → transmission', def: 'od_T(OD) = 10^(-OD)', tex: 'T = 10^{-OD}', args: { OD: 'optical density' }, returns: 'fraction', example: 'od_T(3)' },
    // Jones calculus
    { name: 'Rotation matrix (Jones)', def: 'rotm(th) = [[cos(th), sin(th)], [-sin(th), cos(th)]]', tex: 'R(\\theta)=\\begin{bmatrix}\\cos\\theta&\\sin\\theta\\\\-\\sin\\theta&\\cos\\theta\\end{bmatrix}', args: { th: 'angle' }, returns: '2×2', example: 'rotm(45 deg)' },
    { name: 'Jones: general waveplate', def: 'jones_wp(th, phi) = rotm(-th)*[[1, 0], [0, exp(i*phi)]]*rotm(th)', tex: 'R(-\\theta)\\,\\mathrm{diag}(1,e^{i\\phi})\\,R(\\theta)', args: { th: 'fast-axis angle', phi: 'retardance' }, returns: '2×2', example: 'jones_wp(22.5 deg, pi) * [1, 0]' },
    { name: 'Jones: half-wave plate', def: 'jones_hwp(th) = jones_wp(th, pi)', tex: 'J_{\\lambda/2}(\\theta)', args: { th: 'fast-axis angle' }, returns: '2×2', example: 'jones_hwp(22.5 deg) * [1, 0]' },
    { name: 'Jones: quarter-wave plate', def: 'jones_qwp(th) = jones_wp(th, pi/2)', tex: 'J_{\\lambda/4}(\\theta)', args: { th: 'fast-axis angle' }, returns: '2×2', example: 'jones_qwp(45 deg) * [1, 0]' },
    { name: 'Jones: linear polarizer', def: 'jones_pol(th) = rotm(-th)*[[1, 0], [0, 0]]*rotm(th)', tex: 'J_{pol}(\\theta)', args: { th: 'transmission-axis angle' }, returns: '2×2', example: 'jones_pol(45 deg) * [1, 0]' },
    // ABCD
    {
      name: 'ABCD: free space', sig: 'abcd_free(d)', js: function (ctx) { var math = ctx.math; return function abcd_free(d) { return math.matrix([[1, m(math, d)], [0, 1]]); }; },
      tex: '\\begin{bmatrix}1&d\\\\0&1\\end{bmatrix}', args: { d: 'distance' }, returns: '2×2 (SI metres)', example: 'abcd_lens(100 mm) * abcd_free(10 cm)'
    },
    {
      name: 'ABCD: thin lens', sig: 'abcd_lens(f)', js: function (ctx) { var math = ctx.math; return function abcd_lens(f) { return math.matrix([[1, 0], [-1 / m(math, f), 1]]); }; },
      tex: '\\begin{bmatrix}1&0\\\\-1/f&1\\end{bmatrix}', args: { f: 'focal length' }, returns: '2×2 (SI)', example: 'abcd_lens(50 mm)'
    },
    {
      name: 'ABCD: curved mirror', sig: 'abcd_mirror(Rc)', js: function (ctx) { var math = ctx.math; return function abcd_mirror(Rc) { return math.matrix([[1, 0], [-2 / m(math, Rc), 1]]); }; },
      tex: '\\begin{bmatrix}1&0\\\\-2/R&1\\end{bmatrix}', args: { Rc: 'radius of curvature' }, returns: '2×2 (SI)', example: 'abcd_mirror(50 cm)'
    },
    {
      name: 'ABCD: flat interface', sig: 'abcd_interface(n1, n2)', js: function (ctx) { var math = ctx.math; return function abcd_interface(n1, n2) { return math.matrix([[1, 0], [0, n1 / n2]]); }; },
      tex: '\\begin{bmatrix}1&0\\\\0&n_1/n_2\\end{bmatrix}', args: { n1: 'from index', n2: 'to index' }, returns: '2×2', example: 'abcd_interface(1, 1.5)'
    },
    {
      name: 'Gaussian q parameter', sig: 'q_param(z, w0, lambda)', js: function (ctx) {
        var math = ctx.math;
        return function q_param(z, w0, lambda) { var W = m(math, w0), L = m(math, lambda); return math.complex(m(math, z), Math.PI * W * W / L); };
      }, tex: 'q = z + i z_R', args: { z: 'distance from waist', w0: 'waist', lambda: 'wavelength' }, returns: 'complex (metres)', example: 'q_param(0 m, 100 um, 759 nm)'
    },
    {
      name: 'Propagate q through ABCD', sig: 'q_prop(M, q)', js: function (ctx) {
        var math = ctx.math;
        return function q_prop(M, q) { var a = ctx.toArray(M); return math.divide(math.add(math.multiply(a[0][0], q), a[0][1]), math.add(math.multiply(a[1][0], q), a[1][1])); };
      }, tex: "q' = \\frac{Aq+B}{Cq+D}", args: { M: 'ABCD matrix (SI)', q: 'q parameter' }, returns: 'complex (metres)', example: 'q_prop(abcd_free(0.3) * abcd_lens(0.3), q_param(0, 1.5 mm, 759 nm))'
    },
    {
      name: 'Beam radius from q', sig: 'w_of_q(q, lambda)', js: function (ctx) {
        var math = ctx.math;
        return function w_of_q(q, lambda) { var inv = math.divide(1, q); var im = math.im(inv); return math.unit(Math.sqrt(-m(math, lambda) / (Math.PI * im)), 'm'); };
      }, tex: 'w = \\sqrt{-\\lambda/\\pi\\,\\mathrm{Im}(1/q)}', args: { q: 'q parameter (m)', lambda: 'wavelength' }, returns: 'm', example: 'w_of_q(q_param(0.1, 100 um, 759 nm), 759 nm) to um'
    },
    {
      name: 'Waist position and size from q', sig: 'waist_of_q(q, lambda)', js: function (ctx) {
        var math = ctx.math;
        return function waist_of_q(q, lambda) {
          var z = math.re(q), zr = math.im(q), L = m(math, lambda);
          return [math.unit(-z, 'm'), math.unit(Math.sqrt(zr * L / Math.PI), 'm')];
        };
      }, tex: 'z_{waist} = -\\mathrm{Re}\\,q,\\ w_0 = \\sqrt{\\lambda\\,\\mathrm{Im}\\,q/\\pi}', args: { q: 'q parameter (m)', lambda: 'wavelength' }, returns: '[distance to waist, w0]',
      example: 'waist_of_q(q_prop(abcd_lens(0.3), q_param(0, 1.5 mm, 759 nm)), 759 nm)'
    }
  ].forEach(function (e) { e.cat = cat; P.equations.push(e); });
})(typeof globalThis !== 'undefined' ? globalThis : this);
