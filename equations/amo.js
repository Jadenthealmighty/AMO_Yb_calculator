/* AMO & laser cooling equations.
 *
 * HOW TO ADD YOUR OWN: copy an entry. `def` is ordinary calculator syntax (units welcome),
 * `tex` is what the Equations panel shows, `example` is inserted by the “Try” button.
 * Conventions: Γ, Ω, Δ, ω are ANGULAR (s⁻¹); ν, f, γ are cyclic (Hz). Write 2*pi*10 MHz for Δ = 2π×10 MHz.
 */
(function (g) {
  var P = g.PhysCalc = g.PhysCalc || {};
  P.equations = P.equations || [];
  var cat = 'AMO & laser cooling';
  [
    {
      name: 'Saturation parameter', def: 'sat_param(I, Isat) = I/Isat',
      tex: 's = I/I_{sat}', args: { I: 'intensity', Isat: 'saturation intensity' }, returns: 'dimensionless',
      example: 'sat_param(10 mW/cm^2, Yb.Isat399)'
    },
    {
      name: 'Scattering rate (two-level)', def: 'scatt_rate(s, Delta, Gamma) = Gamma/2*s/(1 + s + ratio(2*Delta, Gamma)^2)',
      tex: 'R_{sc} = \\frac{\\Gamma}{2}\\,\\frac{s}{1+s+(2\\Delta/\\Gamma)^2}',
      args: { s: 'saturation parameter I/I_sat', Delta: 'detuning ω_L − ω₀ (angular)', Gamma: 'natural linewidth (angular)' },
      returns: 'photons / s', example: 'scatt_rate(1, -2*pi*15 MHz, Yb.Gamma399)'
    },
    {
      name: 'Radiation-pressure force', def: 'rad_force(s, Delta, Gamma, k) = hbar*k*scatt_rate(s, Delta, Gamma)',
      tex: 'F = \\hbar k\\,R_{sc}', args: { s: 'saturation parameter', Delta: 'detuning (angular)', Gamma: 'linewidth (angular)', k: 'wavevector 2π/λ' },
      returns: 'N', example: 'rad_force(1, 0, Yb.Gamma399, Yb.k399)'
    },
    {
      name: 'Power-broadened linewidth', def: 'power_broad(Gamma, s) = Gamma*sqrt(1 + s)',
      tex: "\\Gamma' = \\Gamma\\sqrt{1+s}", args: { Gamma: 'natural linewidth', s: 'saturation parameter' }, returns: 'same units as Γ',
      example: 'power_broad(Yb.gamma556, 100)'
    },
    {
      name: 'Saturation intensity (cycling transition)', def: 'Isat_cyc(lambda, Gamma) = pi*h*c*Gamma/(3*lambda^3)',
      tex: 'I_{sat} = \\frac{\\pi h c\\,\\Gamma}{3\\lambda^3}', args: { lambda: 'wavelength', Gamma: 'decay rate (angular)' },
      returns: 'W/m²', example: 'Isat_cyc(Yb.lambda399, Yb.Gamma399) to mW/cm^2'
    },
    {
      name: 'Saturation intensity (open transition)', def: 'Isat_open(lambda, Gamma, A) = pi*h*c*Gamma^2/(3*lambda^3*A)',
      tex: 'I_{sat} = \\frac{\\pi h c}{3\\lambda^3}\\frac{\\Gamma_{tot}^2}{A_{ki}}',
      args: { lambda: 'wavelength', Gamma: 'total decay rate of the upper state', A: 'partial rate on this line' },
      returns: 'W/m²', example: 'Isat_open(Yb.lambda680, Yb.Gamma_3S1, Yb.A680) to mW/cm^2',
      notes: 'Defined by s = 2Ω²/Γ_tot² with Ω from the partial rate A. Reduces to Isat_cyc when A = Γ.'
    },
    {
      name: 'Resonant absorption cross section', def: 'sigma0(lambda) = 3*lambda^2/(2*pi)',
      tex: '\\sigma_0 = \\frac{3\\lambda^2}{2\\pi}', args: { lambda: 'wavelength' }, returns: 'm²', example: 'sigma0(Yb.lambda399)'
    },
    {
      name: 'Optical depth of a cloud', def: 'optical_depth(n, L, lambda) = n*sigma0(lambda)*L',
      tex: 'OD = n\\,\\sigma_0\\,L', args: { n: 'number density', L: 'path length', lambda: 'wavelength' }, returns: 'dimensionless',
      example: 'optical_depth(1e10 cm^-3, 1 mm, Yb.lambda399)'
    },
    {
      name: 'Doppler temperature', def: 'doppler_T(Gamma) = hbar*Gamma/(2*kB)',
      tex: 'T_D = \\frac{\\hbar\\Gamma}{2k_B}', args: { Gamma: 'linewidth (angular)' }, returns: 'K', example: 'doppler_T(Yb.Gamma556) to uK'
    },
    {
      name: 'Doppler velocity', def: 'doppler_v(Gamma, m) = inUnits(sqrt(hbar*Gamma/(2*m)), "m/s")',
      tex: 'v_D = \\sqrt{\\hbar\\Gamma/2m}', args: { Gamma: 'linewidth (angular)', m: 'atomic mass' }, returns: 'm/s',
      example: 'doppler_v(Yb.Gamma399, Yb.m) to cm/s', notes: '1D rms velocity at T_D (√(k_B T_D/m)).'
    },
    {
      name: 'Recoil velocity', def: 'recoil_v(lambda, m) = h/(m*lambda)',
      tex: 'v_r = \\frac{\\hbar k}{m} = \\frac{h}{m\\lambda}', args: { lambda: 'wavelength', m: 'mass' }, returns: 'm/s', example: 'recoil_v(Yb.lambda399, Yb.m) to mm/s'
    },
    {
      name: 'Recoil frequency', def: 'recoil_f(lambda, m) = h/(2*m*lambda^2)',
      tex: 'f_r = \\frac{E_r}{h} = \\frac{h}{2m\\lambda^2}', args: { lambda: 'wavelength', m: 'mass' }, returns: 'Hz', example: 'recoil_f(Yb.lambda759, Yb.m) to kHz'
    },
    {
      name: 'Recoil energy', def: 'recoil_E(lambda, m) = h^2/(2*m*lambda^2)',
      tex: 'E_r = \\frac{\\hbar^2k^2}{2m}', args: { lambda: 'wavelength', m: 'mass' }, returns: 'J', example: 'recoil_E(Yb.lambda759, Yb.m)'
    },
    {
      name: 'Recoil temperature', def: 'recoil_T(lambda, m) = h^2/(m*lambda^2*kB)',
      tex: 'T_r = \\frac{\\hbar^2k^2}{m k_B}', args: { lambda: 'wavelength', m: 'mass' }, returns: 'K', example: 'recoil_T(Yb.lambda556, Yb.m) to nK'
    },
    {
      name: 'Maximum scattering deceleration', def: 'a_max(lambda, Gamma, m) = h*Gamma/(2*m*lambda)',
      tex: 'a_{max} = \\frac{\\hbar k\\Gamma}{2m}', args: { lambda: 'wavelength', Gamma: 'linewidth (angular)', m: 'mass' }, returns: 'm/s²',
      example: 'a_max(Yb.lambda399, Yb.Gamma399, Yb.m)'
    },
    {
      name: 'Zeeman-slower stopping distance', def: 'stop_dist(v, lambda, Gamma, m, eta) = v^2/(2*eta*a_max(lambda, Gamma, m))',
      tex: 'L = \\frac{v^2}{2\\eta\\,a_{max}}', args: { v: 'initial speed', lambda: 'wavelength', Gamma: 'linewidth (angular)', m: 'mass', eta: 'design fraction of a_max (≈0.5)' },
      returns: 'm', example: 'stop_dist(300 m/s, Yb.lambda399, Yb.Gamma399, Yb.m, 0.5) to cm'
    },
    {
      name: 'Max. speed stoppable in a distance', def: 'v_stop(D, lambda, Gamma, m) = sqrt(2*a_max(lambda, Gamma, m)*D)',
      tex: 'v = \\sqrt{2a_{max}D}', args: { D: 'distance (e.g. MOT beam diameter)', lambda: 'wavelength', Gamma: 'linewidth (angular)', m: 'mass' },
      returns: 'm/s', example: 'v_stop(1 cm, Yb.lambda556, Yb.Gamma556, Yb.m)', notes: 'Upper bound on capture velocity.'
    },
    {
      name: 'Laser electric-field amplitude', def: 'E_field(I) = inUnits(sqrt(2*I/(c*eps0)), "V/m")',
      tex: 'E_0 = \\sqrt{2I/c\\varepsilon_0}', args: { I: 'intensity' }, returns: 'V/m', example: 'E_field(1 W/cm^2)'
    },
    {
      name: 'Rabi frequency from dipole moment', def: 'rabi_d(I, d) = inUnits(d*sqrt(2*I/(c*eps0))/hbar, "s^-1")',
      tex: '\\Omega = \\frac{d\\,E_0}{\\hbar}', args: { I: 'intensity', d: 'dipole matrix element (C·m), e.g. 0.5*Yb.d399' }, returns: 's⁻¹ (angular)',
      example: 'rabi_d(1 W/cm^2, Yb.d680/sqrt(3))', notes: 'd is the matrix element for the driven sub-transition; reduced elements need the angular factor.'
    },
    {
      name: 'Rabi frequency from decay rate', def: 'rabi_A(I, lambda, A) = inUnits(sqrt(6*pi*c^2*A*I/(hbar*(2*pi*c/lambda)^3)), "s^-1")',
      tex: '\\Omega^2 = \\frac{6\\pi c^2 A\\,I}{\\hbar\\,\\omega^3}', args: { I: 'intensity', lambda: 'wavelength', A: 'partial decay rate of the line' },
      returns: 's⁻¹ (angular)', example: 'rabi_A(1 W/cm^2, Yb.lambda680, Yb.A680)', notes: 'Equivalent to Ω = Γ√(I/2I_sat) for a cycling line; assumes the stretched-state angular factor.'
    },
    {
      name: 'Rabi frequency from saturation', def: 'rabi_sat(I, Isat, Gamma) = Gamma*sqrt(I/(2*Isat))',
      tex: '\\Omega = \\Gamma\\sqrt{I/2I_{sat}}', args: { I: 'intensity', Isat: 'saturation intensity', Gamma: 'linewidth (angular)' }, returns: 'same as Γ',
      example: 'rabi_sat(1 mW/cm^2, Yb.Isat556, Yb.Gamma556)'
    },
    {
      name: 'Two-photon effective Rabi frequency', def: 'rabi2(O1, O2, Delta) = O1*O2/(2*Delta)',
      tex: '\\Omega_{eff} = \\frac{\\Omega_1\\Omega_2}{2\\Delta}', args: { O1: 'Rabi frequency, leg 1', O2: 'Rabi frequency, leg 2', Delta: 'intermediate detuning' },
      returns: 'same as Ω', example: 'rabi2(2*pi*10 MHz, 2*pi*10 MHz, 2*pi*1 GHz)'
    },
    {
      name: 'Three-photon effective Rabi frequency', def: 'rabi3(O1, O2, O3, D1, D2) = O1*O2*O3/(2*D1*D2)',
      tex: '\\Omega_{eff} = \\frac{\\Omega_1\\Omega_2\\Omega_3}{2\\Delta_1\\Delta_2}\\,\\hat e_1\\!\\cdot\\!(\\hat e_2\\times\\hat e_3)',
      args: { O1: '556 leg', O2: '680 leg', O3: '649 leg', D1: 'detuning from ³P₁', D2: 'detuning from ³S₁' }, returns: 'same as Ω',
      example: 'rabi3(2*pi*1 MHz, 2*pi*50 MHz, 2*pi*50 MHz, 2*pi*100 MHz, 2*pi*2 GHz)',
      notes: 'Degenerate-intermediate form, Carman et al., PRX 15, 031051 (2025), Eq. 2. Multiply by the polarization triple product; check your Ω convention.'
    },
    {
      name: 'AC Stark (light) shift, two-level', def: 'light_shift(Omega, Delta) = Omega^2/(4*Delta)',
      tex: '\\delta_{AC} = \\frac{\\Omega^2}{4\\Delta}', args: { Omega: 'Rabi frequency', Delta: 'detuning ω_L − ω₀' }, returns: 'same as Ω (angular)',
      example: 'light_shift(2*pi*1 MHz, 2*pi*100 MHz)/(2*pi) to kHz', notes: 'Far-detuned limit; ground state shifts by +Ω²/4Δ (up for blue detuning).'
    },
    {
      name: 'Dipole potential (two-level, with counter-rotating term)',
      def: 'dipole_U(I, lambda, lambda0, Gamma) = -(3*pi*c^2/(2*(2*pi*c/lambda0)^3))*(Gamma/(2*pi*c/lambda0 - 2*pi*c/lambda) + Gamma/(2*pi*c/lambda0 + 2*pi*c/lambda))*I',
      tex: 'U = -\\frac{3\\pi c^2}{2\\omega_0^3}\\left(\\frac{\\Gamma}{\\omega_0-\\omega}+\\frac{\\Gamma}{\\omega_0+\\omega}\\right)I',
      args: { I: 'intensity', lambda: 'laser wavelength', lambda0: 'transition wavelength', Gamma: 'linewidth (angular)' }, returns: 'J',
      example: 'dipole_U(1e9 W/m^2, 1064 nm, Yb.lambda399, Yb.Gamma399)/kB to uK', notes: 'Grimm, Weidemüller & Ovchinnikov, Adv. At. Mol. Opt. Phys. 42, 95 (2000), Eq. 10.'
    },
    {
      name: 'Light shift from polarizability', def: 'dipole_U_alpha(I, alpha_au) = -alpha_au*au_pol*I/(2*eps0*c)',
      tex: 'U = -\\frac{\\alpha\\, I}{2\\varepsilon_0 c}', args: { I: 'local intensity', alpha_au: 'polarizability in atomic units' }, returns: 'J',
      example: 'dipole_U_alpha(1e8 W/m^2, Yb.alpha759)/h to kHz'
    },
    {
      name: '1D lattice depth (retro-reflected)', def: 'lattice_U0(P, w, alpha_au) = 4*alpha_au*au_pol*(2*P/(pi*w^2))/(2*eps0*c)',
      tex: 'U_0 = \\frac{4\\alpha}{2\\varepsilon_0 c}\\,\\frac{2P}{\\pi w^2}', args: { P: 'single-beam power', w: 'beam waist (1/e² radius)', alpha_au: 'polarizability (a.u.)' },
      returns: 'J (depth, positive)', example: 'lattice_U0(1 W, 100 um, Yb.alpha759)/Yb.Er759', notes: 'Standing wave of two equal beams: peak intensity 4× the single-beam peak.'
    },
    {
      name: 'Lattice axial trap frequency', def: 'lattice_nu_ax(U0, lambda, m) = inUnits(sqrt(2*U0/m)/lambda, "Hz")',
      tex: '\\nu_{ax} = \\frac{1}{\\lambda}\\sqrt{\\frac{2U_0}{m}} = 2\\frac{E_r}{h}\\sqrt{\\frac{U_0}{E_r}}', args: { U0: 'lattice depth (energy)', lambda: 'lattice wavelength', m: 'mass' },
      returns: 'Hz', example: 'lattice_nu_ax(100*Yb.Er759, Yb.lambda759, Yb.m) to kHz'
    },
    {
      name: 'Lattice radial trap frequency', def: 'lattice_nu_rad(U0, w, m) = inUnits(sqrt(4*U0/(m*w^2))/(2*pi), "Hz")',
      tex: '\\nu_{rad} = \\frac{1}{2\\pi}\\sqrt{\\frac{4U_0}{m w^2}}', args: { U0: 'lattice depth (energy)', w: 'beam waist', m: 'mass' }, returns: 'Hz',
      example: 'lattice_nu_rad(100*Yb.Er759, 100 um, Yb.m)'
    },
    {
      name: 'Lamb–Dicke parameter', def: 'lamb_dicke(lambda, m, nu_trap) = sqrt(h/(2*m*lambda^2)/nu_trap)',
      tex: '\\eta = k x_0 = \\sqrt{f_r/\\nu_{trap}}', args: { lambda: 'probe wavelength', m: 'mass', nu_trap: 'trap frequency (Hz)' }, returns: 'dimensionless',
      example: 'lamb_dicke(Yb.lambda578, Yb.m, 50 kHz)'
    },
    {
      name: 'Linear Zeeman shift', def: 'zeeman_shift(gJ, mJ, B) = gJ*mJ*muB_h*B',
      tex: '\\Delta\\nu = g_J m_J\\,\\mu_B B/h', args: { gJ: 'Landé g', mJ: 'magnetic quantum number', B: 'field' }, returns: 'Hz',
      example: 'zeeman_shift(Yb.gJ_3P1, 1, 1 G) to MHz'
    },
    {
      name: 'Zeeman coefficient', def: 'zeeman_coef(g) = inUnits(g*muB_h, "MHz/G")',
      tex: 'g\\,\\mu_B/h', args: { g: 'g-factor' }, returns: 'MHz/G', example: 'zeeman_coef(Yb.gJ_1P1)'
    },
    {
      name: 'Landé g_J', def: 'landeJ(J, L, S) = (J*(J+1) - S*(S+1) + L*(L+1))/(2*J*(J+1)) - ge*(J*(J+1) + S*(S+1) - L*(L+1))/(2*J*(J+1))',
      tex: 'g_J = \\frac{J(J{+}1)-S(S{+}1)+L(L{+}1)}{2J(J{+}1)} + g_S\\frac{J(J{+}1)+S(S{+}1)-L(L{+}1)}{2J(J{+}1)}',
      args: { J: 'J', L: 'L', S: 'S' }, returns: 'dimensionless', example: 'landeJ(1, 1, 1)', notes: 'LS coupling, g_L = 1, g_S = −g_e ≈ 2.0023.'
    },
    {
      name: 'Landé g_F', def: 'landeF(F, J, I, gJ) = gJ*(F*(F+1) - I*(I+1) + J*(J+1))/(2*F*(F+1))',
      tex: 'g_F \\approx g_J\\frac{F(F{+}1)-I(I{+}1)+J(J{+}1)}{2F(F{+}1)}', args: { F: 'F', J: 'J', I: 'nuclear spin', gJ: 'electronic g' }, returns: 'dimensionless',
      example: 'landeF(3/2, 1, 1/2, Yb.gJ_3P1)', notes: 'Neglects the nuclear g-factor.'
    },
    {
      name: 'Einstein A from reduced dipole element', def: 'A_from_d(lambda, d, Jup) = inUnits((2*pi*c/lambda)^3*d^2/(3*pi*eps0*hbar*c^3*(2*Jup+1)), "s^-1")',
      tex: 'A = \\frac{\\omega^3}{3\\pi\\varepsilon_0\\hbar c^3}\\frac{|\\langle J\\|d\\|J\'\\rangle|^2}{2J\'+1}', args: { lambda: 'wavelength', d: 'reduced matrix element (C·m)', Jup: 'upper-state J' },
      returns: 's⁻¹', example: 'A_from_d(Yb.lambda399, Yb.d399, 1)'
    },
    {
      name: 'Reduced dipole element from A', def: 'd_from_A(lambda, A, Jup) = sqrt(3*pi*eps0*hbar*c^3*(2*Jup+1)*A/(2*pi*c/lambda)^3)',
      tex: '|\\langle J\\|d\\|J\'\\rangle| = \\sqrt{\\frac{3\\pi\\varepsilon_0\\hbar c^3(2J\'+1)A}{\\omega^3}}', args: { lambda: 'wavelength', A: 'partial decay rate', Jup: 'upper-state J' },
      returns: 'C·m (divide by au_d for ea₀)', example: 'd_from_A(Yb.lambda556, Yb.Gamma556, 1)/au_d'
    },
    {
      name: 'Linewidth from lifetime', def: 'gamma_of_tau(tau) = 1/(2*pi*tau)',
      tex: '\\Gamma/2\\pi = \\frac{1}{2\\pi\\tau}', args: { tau: 'lifetime' }, returns: 'Hz (cyclic)', example: 'gamma_of_tau(5.464 ns) to MHz'
    },
    {
      name: 'Doppler-broadened FWHM', def: 'doppler_fwhm(nu0, T, m) = nu0*sqrt(8*kB*T*log(2)/(m*c^2))',
      tex: '\\Delta\\nu_D = \\nu_0\\sqrt{\\frac{8k_BT\\ln 2}{mc^2}}', args: { nu0: 'transition frequency', T: 'temperature', m: 'mass' }, returns: 'Hz',
      example: 'doppler_fwhm(Yb.nu399, 700 K, Yb.m) to MHz'
    },
    {
      name: 'First-order Doppler shift', def: 'doppler_shift(v, lambda) = v/lambda',
      tex: '\\delta\\nu = v/\\lambda = k v/2\\pi', args: { v: 'velocity along k', lambda: 'wavelength' }, returns: 'Hz', example: 'doppler_shift(20 cm/s, Yb.lambda556) to kHz'
    }
  ].forEach(function (e) { e.cat = cat; P.equations.push(e); });
})(typeof globalThis !== 'undefined' ? globalThis : this);
