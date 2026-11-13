/* Thermal, kinetic theory, vacuum & radiation. */
(function (g) {
  var P = g.PhysCalc = g.PhysCalc || {};
  P.equations = P.equations || [];
  var cat = 'Thermal, vacuum & radiation';
  [
    {
      name: 'Maxwell–Boltzmann speed distribution (3D)', def: 'MB_speed(v, m, T) = 4*pi*(m/(2*pi*kB*T))^(3/2)*v^2*exp(-m*v^2/(2*kB*T))',
      tex: 'f(v) = 4\\pi\\left(\\frac{m}{2\\pi k_BT}\\right)^{3/2} v^2\\, e^{-mv^2/2k_BT}', args: { v: 'speed', m: 'mass', T: 'temperature' }, returns: 'probability density (s/m)',
      example: 'MB_speed(300 m/s, Yb.m, 700 K)', also: ['p(v) = MB_speed(v, Yb.m, 700 K)', 'plot(p, 0 m/s, 800 m/s)']
    },
    {
      name: 'Maxwell–Boltzmann 1D velocity distribution', def: 'MB_1D(v, m, T) = sqrt(m/(2*pi*kB*T))*exp(-m*v^2/(2*kB*T))',
      tex: 'f(v_x) = \\sqrt{\\frac{m}{2\\pi k_BT}}\\,e^{-mv_x^2/2k_BT}', args: { v: 'velocity component', m: 'mass', T: 'temperature' }, returns: 's/m', example: 'MB_1D(10 cm/s, Yb.m, 20 uK)'
    },
    {
      name: 'Maxwell–Boltzmann energy distribution', def: 'MB_E(E, T) = inUnits(2*sqrt(E/pi)*(kB*T)^(-3/2)*exp(-E/(kB*T)), "J^-1")',
      tex: 'f(E) = 2\\sqrt{\\frac{E}{\\pi}}\\,(k_BT)^{-3/2}e^{-E/k_BT}', args: { E: 'energy', T: 'temperature' }, returns: '1/J', example: 'MB_E(kB*700 K, 700 K)'
    },
    {
      name: 'Effusive-beam speed distribution (flux-weighted)', def: 'beam_pdf(v, m, T) = (m/(kB*T))^2/2*v^3*exp(-m*v^2/(2*kB*T))',
      tex: 'f(v) = \\frac{1}{2}\\left(\\frac{m}{k_BT}\\right)^2 v^3 e^{-mv^2/2k_BT}', args: { v: 'speed', m: 'mass', T: 'oven temperature' }, returns: 's/m (normalized)',
      example: 'beam_pdf(300 m/s, Yb.m, 450 degC)', also: ['fb(v) = beam_pdf(v, Yb.m, 450 degC)', 'integrate(fb, 0 m/s, 40 m/s)']
    },
    { name: 'Most probable speed (gas)', def: 'v_mp(m, T) = sqrt(2*kB*T/m)', tex: 'v_p = \\sqrt{2k_BT/m}', args: { m: 'mass', T: 'temperature' }, returns: 'm/s', example: 'v_mp(Yb.m, 450 degC)' },
    { name: 'Mean speed (gas)', def: 'v_mean(m, T) = sqrt(8*kB*T/(pi*m))', tex: '\\bar v = \\sqrt{8k_BT/\\pi m}', args: { m: 'mass', T: 'temperature' }, returns: 'm/s', example: 'v_mean(Yb.m, 450 degC)' },
    { name: 'RMS speed (gas)', def: 'v_rms(m, T) = sqrt(3*kB*T/m)', tex: 'v_{rms} = \\sqrt{3k_BT/m}', args: { m: 'mass', T: 'temperature' }, returns: 'm/s', example: 'v_rms(Yb.m, 450 degC)' },
    { name: 'Mean speed in an effusive beam', def: 'v_beam_mean(m, T) = sqrt(9*pi*kB*T/(8*m))', tex: '\\bar v_{beam} = \\sqrt{9\\pi k_BT/8m}', args: { m: 'mass', T: 'oven temperature' }, returns: 'm/s', example: 'v_beam_mean(Yb.m, 450 degC)' },
    { name: 'Most probable speed in an effusive beam', def: 'v_beam_mp(m, T) = sqrt(3*kB*T/m)', tex: 'v_{p,beam} = \\sqrt{3k_BT/m}', args: { m: 'mass', T: 'oven temperature' }, returns: 'm/s', example: 'v_beam_mp(Yb.m, 450 degC)' },
    { name: 'Boltzmann factor', def: 'boltz(E, T) = exp(-E/(kB*T))', tex: 'e^{-E/k_BT}', args: { E: 'energy', T: 'temperature' }, returns: 'dimensionless', example: 'boltz(h*1 GHz, 300 K)' },
    { name: 'Ideal-gas number density', def: 'n_gas(p, T) = p/(kB*T)', tex: 'n = p/k_BT', args: { p: 'pressure', T: 'temperature' }, returns: 'm⁻³', example: 'n_gas(1e-9 torr, 293 K) to cm^-3' },
    { name: 'Mean free path', def: 'mfp(p, T, d) = kB*T/(sqrt(2)*pi*d^2*p)', tex: '\\ell = \\frac{k_BT}{\\sqrt2\\,\\pi d^2 p}', args: { p: 'pressure', T: 'temperature', d: 'molecular diameter' }, returns: 'm', example: 'mfp(1e-6 torr, 293 K, 0.37 nm)' },
    { name: 'Effusive flux density', def: 'eff_flux(n, m, T) = n*v_mean(m, T)/4', tex: '\\Phi = \\tfrac14 n\\bar v', args: { n: 'number density', m: 'mass', T: 'temperature' }, returns: 'atoms / (m² s)', example: 'eff_flux(Yb.nvap(450 degC), Yb.m, 450 degC) to cm^-2 s^-1' },
    { name: 'Effusion rate through an aperture', def: 'eff_rate(p, T, m, A) = inUnits(p*A/sqrt(2*pi*m*kB*T), "s^-1")', tex: '\\dot N = \\frac{pA}{\\sqrt{2\\pi m k_BT}}', args: { p: 'pressure', T: 'temperature', m: 'mass', A: 'aperture area' }, returns: 'atoms / s', example: 'eff_rate(Yb.Pvap(450 degC), 450 degC, Yb.m, pi*(0.5 mm)^2)' },
    { name: 'Molecular-flow conductance: aperture', def: 'C_aperture(A, m, T) = inUnits(A*v_mean(m, T)/4, "L/s")', tex: 'C = \\tfrac14\\bar v A', args: { A: 'area', m: 'gas mass', T: 'temperature' }, returns: 'L/s', example: 'C_aperture(1 cm^2, 28.97 amu, 293 K)' },
    { name: 'Molecular-flow conductance: long tube', def: 'C_tube(d, L, m, T) = inUnits(pi/12*v_mean(m, T)*d^3/L, "L/s")', tex: 'C = \\frac{\\pi}{12}\\bar v\\,\\frac{d^3}{L}', args: { d: 'inner diameter', L: 'length (≫ d)', m: 'gas mass', T: 'temperature' }, returns: 'L/s', example: 'C_tube(1 cm, 10 cm, 28.97 amu, 293 K)' },
    { name: 'Conductances in series', def: 'C_series(C1, C2) = 1/(1/C1 + 1/C2)', tex: 'C^{-1} = C_1^{-1}+C_2^{-1}', args: { C1: 'conductance 1', C2: 'conductance 2' }, returns: 'L/s', example: 'C_series(10 L/s, 20 L/s)' },
    { name: 'Planck spectral radiance (per Hz)', def: 'planck_nu(nu, T) = inUnits(2*h*nu^3/c^2/(exp(h*nu/(kB*T)) - 1), "W m^-2 Hz^-1")', tex: 'B_\\nu = \\frac{2h\\nu^3}{c^2}\\frac{1}{e^{h\\nu/k_BT}-1}', args: { nu: 'frequency', T: 'temperature' }, returns: 'W/(m² sr Hz)', example: 'planck_nu(30 THz, 300 K)' },
    { name: 'Planck spectral radiance (per wavelength)', def: 'planck_lambda(lambda, T) = inUnits(2*h*c^2/lambda^5/(exp(h*c/(lambda*kB*T)) - 1), "W m^-3")', tex: 'B_\\lambda = \\frac{2hc^2}{\\lambda^5}\\frac{1}{e^{hc/\\lambda k_BT}-1}', args: { lambda: 'wavelength', T: 'temperature' }, returns: 'W/(m³ sr)', example: 'planck_lambda(10 um, 300 K)' },
    { name: 'Stefan–Boltzmann radiated power', def: 'stefan_P(T, A, eps) = eps*sigmaSB*A*T^4', tex: 'P = \\epsilon\\sigma A T^4', args: { T: 'temperature', A: 'area', eps: 'emissivity' }, returns: 'W', example: 'stefan_P(450 degC, 2 cm^2, 0.3)' },
    { name: 'Net radiative exchange', def: 'rad_exchange(T1, T2, A, eps) = eps*sigmaSB*A*(T1^4 - T2^4)', tex: 'P = \\epsilon\\sigma A(T_1^4-T_2^4)', args: { T1: 'hot', T2: 'cold surroundings', A: 'area', eps: 'emissivity' }, returns: 'W', example: 'rad_exchange(723 K, 293 K, 2 cm^2, 0.3)' },
    { name: "Wien's law (peak λ)", def: 'wien_lambda(T) = bWien/T', tex: '\\lambda_{max} = b/T', args: { T: 'temperature' }, returns: 'm', example: 'wien_lambda(300 K) to um' },
    { name: "Wien's law (peak ν)", def: 'wien_nu(T) = bWien_nu*T', tex: "\\nu_{max} = b' T", args: { T: 'temperature' }, returns: 'Hz', example: 'wien_nu(300 K) to THz' },
    { name: 'Bose–Einstein occupation', def: 'bose(E, mu, T) = 1/(exp((E - mu)/(kB*T)) - 1)', tex: '\\bar n = \\frac{1}{e^{(E-\\mu)/k_BT}-1}', args: { E: 'energy', mu: 'chemical potential', T: 'temperature' }, returns: 'occupation', example: 'bose(h*1 GHz, 0 J, 1 K)' },
    { name: 'Fermi–Dirac occupation', def: 'fermi(E, mu, T) = 1/(exp((E - mu)/(kB*T)) + 1)', tex: '\\bar n = \\frac{1}{e^{(E-\\mu)/k_BT}+1}', args: { E: 'energy', mu: 'chemical potential', T: 'temperature' }, returns: 'occupation', example: 'fermi(1 eV, 0.9 eV, 300 K)' },
    { name: 'Thermal de Broglie wavelength', def: 'lambda_th(m, T) = h/sqrt(2*pi*m*kB*T)', tex: '\\lambda_{dB} = \\frac{h}{\\sqrt{2\\pi m k_BT}}', args: { m: 'mass', T: 'temperature' }, returns: 'm', example: 'lambda_th(Yb.m, 1 uK) to nm' },
    { name: 'Phase-space density', def: 'psd(n, m, T) = n*lambda_th(m, T)^3', tex: '\\rho = n\\lambda_{dB}^3', args: { n: 'peak density', m: 'mass', T: 'temperature' }, returns: 'dimensionless', example: 'psd(1e13 cm^-3, Yb.m, 1 uK)' },
    { name: 'BEC critical temperature (uniform)', def: 'Tc_bec(n, m) = 2*pi*hbar^2/(m*kB)*(n/zeta(1.5))^(2/3)', tex: 'T_c = \\frac{2\\pi\\hbar^2}{mk_B}\\left(\\frac{n}{\\zeta(3/2)}\\right)^{2/3}', args: { n: 'density', m: 'mass' }, returns: 'K', example: 'Tc_bec(1e14 cm^-3, Yb.m) to nK' },
    { name: 'Johnson–Nyquist noise voltage', def: 'johnson_V(R, T, df) = sqrt(4*kB*T*R*df)', tex: 'V_{rms} = \\sqrt{4k_BTR\\,\\Delta f}', args: { R: 'resistance', T: 'temperature', df: 'bandwidth' }, returns: 'V', example: 'johnson_V(50 ohm, 293 K, 1 MHz) to uV' },
    { name: 'Shot-noise current', def: 'shot_I(I, df) = sqrt(2*qe*I*df)', tex: 'i_{rms} = \\sqrt{2eI\\Delta f}', args: { I: 'DC current', df: 'bandwidth' }, returns: 'A', example: 'shot_I(1 mA, 1 MHz) to nA' },
    { name: 'Thermal conduction (slab)', def: 'heat_cond(k, A, dT, L) = k*A*dT/L', tex: '\\dot Q = kA\\,\\Delta T/L', args: { k: 'thermal conductivity', A: 'area', dT: 'temperature difference', L: 'thickness' }, returns: 'W', example: 'heat_cond(16 W/(m K), 1 cm^2, 400 K, 5 cm)' }
  ].forEach(function (e) { e.cat = cat; P.equations.push(e); });
})(typeof globalThis !== 'undefined' ? globalThis : this);
