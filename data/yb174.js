/* ¹⁷⁴Yb reference data for PhysCalc.
 *
 * Each item is evaluated with math.js in order; later items can use earlier keys by bare name
 * (plus every CODATA constant: c, h, hbar, kB, muB_h, au_d, …). Access in the calculator as Yb.<key>.
 *
 *   v:    a literal value with units        e.g. '751526533.49 MHz'
 *   expr: a derived value (formula)         e.g. 'c / nu399 to nm'
 *   fn:   a JS function (receives math, C, Yb-so-far)
 *   unc:  uncertainty as printed (string), src: where it came from, tex: symbol for display
 *
 * To change a number for your lab, edit it here (or override it in a worksheet: myGamma = 2 pi 29 MHz).
 */
(function (g) {
  var P = g.PhysCalc = g.PhysCalc || {};

  var SRC = {
    ciaaw: 'CIAAW (AME2020 masses), ciaaw.org/ytterbium.htm',
    ref171: '¹⁷¹Yb Reference Data, arXiv:2509.04416 (2025)',
    nist: 'NIST ASD Yb I levels (Martin, Zalubas & Hagan 1978)',
    kleinert: 'Kleinert, Gold Dahl & Bergeson, PRA 94, 052511 (2016) — ¹⁷⁴Yb, frequency comb',
    i2556: 'arXiv:2311.08542 (2023), ¹⁷⁴Yb via I₂ MTS; consistent with 539 386 600 MHz of earlier work',
    poli: 'Poli et al., PRA 77, 050501(R) (2008) — NIST ¹⁷⁴Yb lattice clock',
    barber: 'Barber et al., PRL 100, 103002 (2008) — ¹⁷⁴Yb magic frequency',
    yao: 'Yao et al., arXiv:2601.12862 (2026) — ¹⁷⁴Yb 431 nm inner-shell clock',
    alcock: 'Alcock, Itkin & Horrigan, Can. Metall. Q. 23, 309 (1984); solid, ±5 %, ≈298–900 K',
    sheet: 'Lab spreadsheet (Yb_Lattice_Clocks.xlsx)',
    py: 'ytterbium_1.py',
    derived: 'derived'
  };

  var sections = [
    {
      id: 'atom', title: 'Atom & vapour',
      items: [
        { key: 'm', v: '173.93886755 amu', unc: '0.00000008 u', desc: 'Atomic mass of ¹⁷⁴Yb', src: SRC.ciaaw, tex: 'm' },
        { key: 'Z', v: '70', desc: 'Atomic number', tex: 'Z' },
        { key: 'I', v: '0', desc: 'Nuclear spin (boson, no hyperfine structure)', tex: 'I' },
        { key: 'abund', v: '0.31896', unc: '0.00026', desc: 'Natural abundance (NIST lists 0.32026(80))', src: SRC.ciaaw, tex: '\\eta_{174}' },
        { key: 'Tmelt', v: '1097 K', desc: 'Melting point (824 °C)', src: SRC.ref171, tex: 'T_{m}' },
        { key: 'Tboil', v: '1469 K', desc: 'Boiling point (1196 °C)', src: SRC.ref171, tex: 'T_{b}' },
        { key: 'rho', v: '6904 kg/m^3', unc: '2 kg/m³', desc: 'Density at 20 °C (natural Yb)', src: SRC.ref171, tex: '\\rho' },
        { key: 'cp', v: '26.74 J/(mol K)', desc: 'Molar heat capacity', src: SRC.sheet, tex: 'c_p' },
        { key: 'Eion', v: '50443.0676 cm^-1', unc: '0.0012 cm⁻¹', desc: 'First ionization energy (wavenumber)', src: SRC.ref171, tex: 'E_{ion}' },
        { key: 'Eion_eV', expr: 'h*c*Eion to eV', desc: 'First ionization energy', src: SRC.derived, tex: 'E_{ion}' },
        {
          key: 'Pvap', fn: function (math) {
            return function Pvap(T) {
              var TK = math.isUnit(T) ? T.toNumber('K') : T;
              var lg = 9.111 - 8111 / TK - 1.0849 * Math.log10(TK);
              return math.unit(101325 * Math.pow(10, lg), 'Pa');
            };
          }, sig: 'Pvap(T)', desc: 'Vapour pressure over solid Yb: log₁₀(p/atm) = 9.111 − 8111/T − 1.0849·log₁₀T.  e.g. Yb.Pvap(400 degC) to torr', src: SRC.alcock, tex: 'P_{vap}'
        },
        {
          key: 'nvap', fn: function (math, C, Y) {
            return function nvap(T) {
              var TK = math.isUnit(T) ? T.toNumber('K') : T;
              var p = Y.Pvap(TK).toNumber('Pa');
              return math.unit(p / (C.kB.toNumber('J/K') * TK), 'm^-3');
            };
          }, sig: 'nvap(T)', desc: 'Saturated vapour number density p/(k_B T).  e.g. Yb.nvap(450 degC) to cm^-3', src: SRC.alcock, tex: 'n_{vap}'
        }
      ]
    },
    {
      id: '399', title: '399 nm · ¹S₀ → ¹P₁ · blue MOT / imaging', lambda: 399,
      items: [
        { key: 'nu399', v: '751526533.49 MHz', unc: '0.33 MHz', desc: 'Transition frequency (¹⁷⁴Yb)', src: SRC.kleinert, tex: '\\nu_{399}' },
        { key: 'lambda399', expr: 'c/nu399 to nm', desc: 'Vacuum wavelength', src: SRC.derived, tex: '\\lambda_{399}' },
        { key: 'k399', expr: '2*pi/lambda399 to m^-1', desc: 'Wavevector 2π/λ', src: SRC.derived, tex: 'k_{399}' },
        { key: 'omega399', expr: '2*pi*nu399 to s^-1', desc: 'Angular frequency', src: SRC.derived, tex: '\\omega_{399}' },
        { key: 'tau_1P1', v: '5.464 ns', unc: '0.011 ns', desc: '¹P₁ lifetime', src: SRC.ref171, tex: '\\tau_{^1P_1}' },
        { key: 'Gamma399', expr: '1/tau_1P1 to s^-1', desc: 'Natural linewidth Γ (angular, s⁻¹)', src: SRC.derived, tex: '\\Gamma_{399}' },
        { key: 'gamma399', expr: 'Gamma399/(2*pi) to MHz', desc: 'Natural linewidth Γ/2π (≈ 29.13 MHz)', src: SRC.derived, tex: '\\gamma_{399}' },
        { key: 'd399', v: '4.147 au_d', unc: '0.004 ea₀', desc: 'Reduced E1 matrix element ⟨¹S₀‖d‖¹P₁⟩ (stored in C·m; sheet: 4.148 ea₀)', src: SRC.ref171, tex: 'd_{399}' },
        { key: 'Isat399', expr: 'pi*h*c*Gamma399/(3*lambda399^3) to mW/cm^2', desc: 'Saturation intensity πhcΓ/3λ³ (cycling)', src: SRC.derived, tex: 'I_{sat,399}' },
        { key: 'sigma399', expr: '3*lambda399^2/(2*pi) to m^2', desc: 'Resonant cross section 3λ²/2π', src: SRC.derived, tex: '\\sigma_{399}' },
        { key: 'TD399', expr: 'hbar*Gamma399/(2*kB) to uK', desc: 'Doppler temperature ħΓ/2k_B', src: SRC.derived, tex: 'T_{D,399}' },
        { key: 'vD399', expr: 'sqrt(kB*TD399/mYb) to cm/s', desc: 'Doppler velocity √(k_B T_D/m) = √(ħΓ/2m)', src: SRC.derived, tex: 'v_{D,399}' },
        { key: 'vr399', expr: 'h/(mYb*lambda399) to mm/s', desc: 'Recoil velocity ħk/m', src: SRC.derived, tex: 'v_{r,399}' },
        { key: 'fr399', expr: 'h/(2*mYb*lambda399^2) to kHz', desc: 'Recoil frequency E_r/h', src: SRC.derived, tex: 'f_{r,399}' },
        { key: 'Tr399', expr: 'h^2/(mYb*lambda399^2*kB) to nK', desc: 'Recoil temperature ħ²k²/(m k_B)', src: SRC.derived, tex: 'T_{r,399}' },
        { key: 'amax399', expr: 'h*Gamma399/(2*mYb*lambda399) to m/s^2', desc: 'Max. radiation-pressure deceleration ħkΓ/2m', src: SRC.derived, tex: 'a_{max,399}' },
        { key: 'zeeman399', expr: 'gJ_1P1*muB_h to MHz/G', desc: 'Upper-state Zeeman shift g_J μ_B/h (per m_J)', src: SRC.derived, tex: '\\mu_{399}' }
      ]
    },
    {
      id: '556', title: '556 nm · ¹S₀ → ³P₁ · green MOT / 3-photon leg 1', lambda: 556,
      items: [
        { key: 'nu556', v: '539386597 MHz', unc: '6 MHz', desc: 'Transition frequency (¹⁷⁴Yb)', src: SRC.i2556, tex: '\\nu_{556}' },
        { key: 'lambda556', expr: 'c/nu556 to nm', desc: 'Vacuum wavelength', src: SRC.derived, tex: '\\lambda_{556}' },
        { key: 'k556', expr: '2*pi/lambda556 to m^-1', desc: 'Wavevector', src: SRC.derived, tex: 'k_{556}' },
        { key: 'omega556', expr: '2*pi*nu556 to s^-1', desc: 'Angular frequency', src: SRC.derived, tex: '\\omega_{556}' },
        { key: 'tau_3P1', v: '872.6 ns', unc: '1.9 ns', desc: '³P₁ lifetime (spreadsheet: 866.1 ns)', src: SRC.ref171, tex: '\\tau_{^3P_1}' },
        { key: 'Gamma556', expr: '1/tau_3P1 to s^-1', desc: 'Natural linewidth Γ (angular)', src: SRC.derived, tex: '\\Gamma_{556}' },
        { key: 'gamma556', expr: 'Gamma556/(2*pi) to kHz', desc: 'Γ/2π ≈ 182.4 kHz (your .py uses 184 kHz)', src: SRC.derived, tex: '\\gamma_{556}' },
        { key: 'd556', v: '0.5398 au_d', unc: '0.0006 ea₀', desc: 'Reduced E1 matrix element (sheet: 0.543 ea₀)', src: SRC.ref171, tex: 'd_{556}' },
        { key: 'Isat556', expr: 'pi*h*c*Gamma556/(3*lambda556^3) to mW/cm^2', desc: 'Saturation intensity (cycling)', src: SRC.derived, tex: 'I_{sat,556}' },
        { key: 'sigma556', expr: '3*lambda556^2/(2*pi) to m^2', desc: 'Resonant cross section', src: SRC.derived, tex: '\\sigma_{556}' },
        { key: 'TD556', expr: 'hbar*Gamma556/(2*kB) to uK', desc: 'Doppler temperature', src: SRC.derived, tex: 'T_{D,556}' },
        { key: 'vD556', expr: 'sqrt(kB*TD556/mYb) to cm/s', desc: 'Doppler velocity', src: SRC.derived, tex: 'v_{D,556}' },
        { key: 'vr556', expr: 'h/(mYb*lambda556) to mm/s', desc: 'Recoil velocity', src: SRC.derived, tex: 'v_{r,556}' },
        { key: 'fr556', expr: 'h/(2*mYb*lambda556^2) to kHz', desc: 'Recoil frequency', src: SRC.derived, tex: 'f_{r,556}' },
        { key: 'Tr556', expr: 'h^2/(mYb*lambda556^2*kB) to nK', desc: 'Recoil temperature', src: SRC.derived, tex: 'T_{r,556}' },
        { key: 'amax556', expr: 'h*Gamma556/(2*mYb*lambda556) to m/s^2', desc: 'Max. radiation-pressure deceleration', src: SRC.derived, tex: 'a_{max,556}' },
        { key: 'zeeman556', expr: 'gJ_3P1*muB_h to MHz/G', desc: '³P₁ Zeeman shift per m_J', src: SRC.derived, tex: '\\mu_{556}' }
      ]
    },
    {
      id: '680', title: '680 nm · ³P₁ → ³S₁ · 3-photon leg 2', lambda: 680,
      items: [
        { key: 'nu680', expr: 'c*(E_3S1 - E_3P1) to GHz', desc: 'From NIST level energies (≈0.1 GHz-level; measure with your wavemeter)', src: SRC.nist, tex: '\\nu_{680}' },
        { key: 'lambda680', expr: 'c/nu680 to nm', desc: 'Vacuum wavelength', src: SRC.derived, tex: '\\lambda_{680}' },
        { key: 'k680', expr: '2*pi/lambda680 to m^-1', desc: 'Wavevector', src: SRC.derived, tex: 'k_{680}' },
        { key: 'A680', expr: 'br_3S1_3P1*Gamma_3S1 to s^-1', desc: 'Partial decay rate A(³S₁→³P₁) (sheet: 2.67×10⁷ s⁻¹)', src: SRC.derived, tex: 'A_{680}' },
        { key: 'd680', v: '3.53 au_d', desc: 'Reduced E1 matrix element ⟨³P₁‖d‖³S₁⟩', src: SRC.sheet + ' (Porsev 1999 / Dzuba & Derevianko 2010)', tex: 'd_{680}' },
        { key: 'vr680', expr: 'h/(mYb*lambda680) to mm/s', desc: 'Recoil velocity', src: SRC.derived, tex: 'v_{r,680}' },
        { key: 'fr680', expr: 'h/(2*mYb*lambda680^2) to kHz', desc: 'Recoil frequency', src: SRC.derived, tex: 'f_{r,680}' }
      ]
    },
    {
      id: '649', title: '649 nm · ³P₀ → ³S₁ · 3-photon leg 3 / repump', lambda: 649,
      items: [
        { key: 'nu649', expr: 'c*(E_3S1 - E_3P0) to GHz', desc: 'From NIST level energies', src: SRC.nist, tex: '\\nu_{649}' },
        { key: 'lambda649', expr: 'c/nu649 to nm', desc: 'Vacuum wavelength', src: SRC.derived, tex: '\\lambda_{649}' },
        { key: 'k649', expr: '2*pi/lambda649 to m^-1', desc: 'Wavevector', src: SRC.derived, tex: 'k_{649}' },
        { key: 'A649', expr: 'br_3S1_3P0*Gamma_3S1 to s^-1', desc: 'Partial decay rate A(³S₁→³P₀) (sheet: 9.68×10⁶ s⁻¹)', src: SRC.derived, tex: 'A_{649}' },
        { key: 'd649', v: '1.98 au_d', desc: 'Reduced E1 matrix element ⟨³P₀‖d‖³S₁⟩ (ref: 1.96(15))', src: SRC.sheet, tex: 'd_{649}' },
        { key: 'vr649', expr: 'h/(mYb*lambda649) to mm/s', desc: 'Recoil velocity', src: SRC.derived, tex: 'v_{r,649}' },
        { key: 'fr649', expr: 'h/(2*mYb*lambda649^2) to kHz', desc: 'Recoil frequency', src: SRC.derived, tex: 'f_{r,649}' },
        { key: 'D_3P1_3P0', expr: 'nu556 - nu578 to GHz', desc: '³P₁–³P₀ splitting from the two measured lines. Three-photon resonance needs ν₆₄₉ = ν₆₈₀ + this', src: SRC.derived, tex: '\\Delta_{^3P_1-^3P_0}' }
      ]
    },
    {
      id: '578', title: '578 nm · ¹S₀ → ³P₀ · clock (direct, B-field induced)', lambda: 578,
      items: [
        { key: 'nu578', v: '518294025309217.8 Hz', unc: '0.9 Hz', desc: '¹⁷⁴Yb clock frequency (sheet value 518 295 836 590 863 Hz is ¹⁷¹Yb)', src: SRC.poli, tex: '\\nu_{578}' },
        { key: 'lambda578', expr: 'c/nu578 to nm', desc: 'Vacuum wavelength', src: SRC.derived, tex: '\\lambda_{578}' },
        { key: 'k578', expr: '2*pi/lambda578 to m^-1', desc: 'Wavevector', src: SRC.derived, tex: 'k_{578}' },
        { key: 'vr578', expr: 'h/(mYb*lambda578) to mm/s', desc: 'Recoil velocity', src: SRC.derived, tex: 'v_{r,578}' },
        { key: 'fr578', expr: 'h/(2*mYb*lambda578^2) to kHz', desc: 'Recoil frequency', src: SRC.derived, tex: 'f_{r,578}' },
        { key: 'beta578', v: '-6.12 Hz/mT^2', unc: '0.10 Hz/mT²', desc: 'Second-order Zeeman coefficient (¹⁷⁴Yb)', src: SRC.poli, tex: '\\beta_{578}' }
      ]
    },
    {
      id: '759', title: '759 nm · magic-wavelength lattice', lambda: 759,
      items: [
        { key: 'nu759', v: '394799475 MHz', unc: '35 MHz', desc: '¹⁷⁴Yb magic frequency (sheet uses 394 798 267 MHz = ¹⁷¹Yb)', src: SRC.barber, tex: '\\nu_{magic}' },
        { key: 'lambda759', expr: 'c/nu759 to nm', desc: 'Magic wavelength (vacuum)', src: SRC.derived, tex: '\\lambda_{magic}' },
        { key: 'k759', expr: '2*pi/lambda759 to m^-1', desc: 'Lattice wavevector', src: SRC.derived, tex: 'k_{L}' },
        { key: 'fr759', expr: 'h/(2*mYb*lambda759^2) to kHz', desc: 'Lattice recoil frequency E_r/h', src: SRC.derived, tex: 'f_{r,L}' },
        { key: 'Er759', expr: 'h*fr759 to J', desc: 'Lattice recoil energy E_r (use U/Er for depth in recoils)', src: SRC.derived, tex: 'E_{r,L}' },
        { key: 'alpha759', v: '190', desc: 'Clock-state polarizability at the magic λ, atomic units', src: SRC.sheet + ' (Dzuba & Derevianko 2010)', tex: '\\alpha_{magic}' },
        { key: 'UperI759', expr: 'alpha759*au_pol/(2*eps0*c*h) to Hz/(W/m^2)', desc: 'Light shift per local intensity: U = αI/(2ε₀c)', src: SRC.derived, tex: 'U/I' }
      ]
    },
    {
      id: '1389', title: '1389 nm · ³P₀ → ³D₁ · IR repump', lambda: 1389,
      items: [
        { key: 'nu1389', expr: 'c*(E_3D1 - E_3P0) to GHz', desc: 'From NIST level energies', src: SRC.nist, tex: '\\nu_{1389}' },
        { key: 'lambda1389', expr: 'c/nu1389 to nm', desc: 'Vacuum wavelength', src: SRC.derived, tex: '\\lambda_{1389}' },
        { key: 'A1389', expr: 'br_3D1_3P0*Gamma_3D1 to s^-1', desc: 'Partial decay rate A(³D₁→³P₀)', src: SRC.derived, tex: 'A_{1389}' },
        { key: 'd1389', v: '2.76 au_d', unc: '0.07 ea₀', desc: 'Reduced E1 matrix element (sheet: 2.61 ea₀)', src: SRC.ref171, tex: 'd_{1389}' }
      ]
    },
    {
      id: '770', title: '770 nm · ³P₂ → ³S₁ · repump', lambda: 770,
      items: [
        { key: 'nu770', expr: 'c*(E_3S1 - E_3P2) to GHz', desc: 'From NIST level energies', src: SRC.nist, tex: '\\nu_{770}' },
        { key: 'lambda770', expr: 'c/nu770 to nm', desc: 'Vacuum wavelength', src: SRC.derived, tex: '\\lambda_{770}' },
        { key: 'A770', expr: 'br_3S1_3P2*Gamma_3S1 to s^-1', desc: 'Partial decay rate A(³S₁→³P₂)', src: SRC.derived, tex: 'A_{770}' },
        { key: 'd770', v: '4.99 au_d', unc: '0.32 ea₀', desc: 'Reduced E1 matrix element (sheet: 5.05 ea₀)', src: SRC.ref171, tex: 'd_{770}' }
      ]
    },
    {
      id: '431', title: '431 nm · ¹S₀ → 4f¹³5d6s² (J=2) · inner-shell clock', lambda: 431,
      items: [
        { key: 'nu431', v: '695175030801776.5 Hz', unc: '6.3 Hz', desc: '¹⁷⁴Yb inner-shell clock frequency (m_J = 0)', src: SRC.yao, tex: '\\nu_{431}' },
        { key: 'lambda431', expr: 'c/nu431 to nm', desc: 'Vacuum wavelength', src: SRC.derived, tex: '\\lambda_{431}' },
        { key: 'gamma431', v: '0.8 mHz', desc: 'Natural linewidth (theory, approx.)', src: 'arXiv:2402.13541 (table of Yb lines)', tex: '\\gamma_{431}' },
        { key: 'nu1052', expr: 'c*(E_3S1 - E_J2) to GHz', desc: 'J=2 → ³S₁ (1052 nm, "3-photon inner shell" in sheet), from NIST levels', src: SRC.nist, tex: '\\nu_{1052}' },
        { key: 'lambda1052', expr: 'c/nu1052 to nm', desc: 'Vacuum wavelength, 1052 nm line', src: SRC.derived, tex: '\\lambda_{1052}' },
        { key: 'A1052', v: '1500 s^-1', desc: 'Partial decay rate, rough estimate', src: SRC.sheet + ' (approx.)', tex: 'A_{1052}' },
        { key: 'd1052', v: '0.05 au_d', desc: 'Reduced E1 matrix element, rough estimate', src: SRC.sheet + ' (approx., from ³D₁→J=2 at 1301 nm)', tex: 'd_{1052}' }
      ]
    },
    {
      id: 'levels', title: 'Energy levels, g-factors, lifetimes, branching',
      items: [
        { key: 'E_3P0', v: '17288.439 cm^-1', desc: '6s6p ³P₀', src: SRC.nist, tex: 'E(^3P_0)' },
        { key: 'E_3P1', v: '17992.007 cm^-1', desc: '6s6p ³P₁', src: SRC.nist, tex: 'E(^3P_1)' },
        { key: 'E_3P2', v: '19710.388 cm^-1', desc: '6s6p ³P₂', src: SRC.nist, tex: 'E(^3P_2)' },
        { key: 'E_J2', v: '23188.518 cm^-1', desc: '4f¹³5d6s² (7/2,3/2) J=2 (inner-shell clock state)', src: SRC.nist, tex: 'E(J{=}2)' },
        { key: 'E_3D1', v: '24489.102 cm^-1', desc: '5d6s ³D₁', src: SRC.nist, tex: 'E(^3D_1)' },
        { key: 'E_3D2', v: '24751.948 cm^-1', desc: '5d6s ³D₂', src: SRC.nist, tex: 'E(^3D_2)' },
        { key: 'E_1P1', v: '25068.222 cm^-1', desc: '6s6p ¹P₁', src: SRC.nist, tex: 'E(^1P_1)' },
        { key: 'E_3D3', v: '25270.902 cm^-1', desc: '5d6s ³D₃', src: SRC.nist, tex: 'E(^3D_3)' },
        { key: 'E_1D2', v: '27677.665 cm^-1', desc: '5d6s ¹D₂', src: SRC.nist, tex: 'E(^1D_2)' },
        { key: 'E_3S1', v: '32694.692 cm^-1', desc: '6s7s ³S₁', src: SRC.nist, tex: 'E(^3S_1)' },
        { key: 'E_1S0b', v: '34350.65 cm^-1', desc: '6s7s ¹S₀', src: SRC.py, tex: "E(^1S_0')" },
        { key: 'gJ_3P1', v: '1.49282', desc: 'Landé g, ³P₁', src: SRC.nist, tex: 'g_J(^3P_1)' },
        { key: 'gJ_3P2', v: '1.50', desc: 'Landé g, ³P₂', src: SRC.nist, tex: 'g_J(^3P_2)' },
        { key: 'gJ_1P1', v: '1.035', desc: 'Landé g, ¹P₁', src: SRC.nist, tex: 'g_J(^1P_1)' },
        { key: 'gJ_3D1', v: '0.50', desc: 'Landé g, ³D₁', src: SRC.nist, tex: 'g_J(^3D_1)' },
        { key: 'gJ_3D2', v: '1.16', desc: 'Landé g, ³D₂', src: SRC.nist, tex: 'g_J(^3D_2)' },
        { key: 'gJ_3D3', v: '1.34', desc: 'Landé g, ³D₃', src: SRC.nist, tex: 'g_J(^3D_3)' },
        { key: 'gJ_1D2', v: '1.01', desc: 'Landé g, ¹D₂', src: SRC.nist, tex: 'g_J(^1D_2)' },
        { key: 'gJ_3S1', v: '2.01', desc: 'Landé g, ³S₁', src: SRC.nist, tex: 'g_J(^3S_1)' },
        { key: 'zeeman_3S1', expr: 'gJ_3S1*muB_h to MHz/G', desc: '³S₁ Zeeman shift per m_J', src: SRC.derived, tex: '\\mu(^3S_1)' },
        { key: 'tau_3S1', v: '13.8 ns', unc: '1.7 ns', desc: '³S₁ lifetime (sheet: 13.46 ns)', src: SRC.ref171, tex: '\\tau_{^3S_1}' },
        { key: 'Gamma_3S1', expr: '1/tau_3S1 to s^-1', desc: '³S₁ total decay rate', src: SRC.derived, tex: '\\Gamma_{^3S_1}' },
        { key: 'tau_3D1', v: '332 ns', unc: '11 ns', desc: '³D₁ lifetime', src: SRC.ref171, tex: '\\tau_{^3D_1}' },
        { key: 'Gamma_3D1', expr: '1/tau_3D1 to s^-1', desc: '³D₁ total decay rate', src: SRC.derived, tex: '\\Gamma_{^3D_1}' },
        { key: 'br_3S1_3P0', v: '0.130', unc: '0.013', desc: 'Branching ³S₁ → ³P₀', src: SRC.ref171, tex: 'b(^3S_1\\to{}^3P_0)' },
        { key: 'br_3S1_3P1', v: '0.360', unc: '0.025', desc: 'Branching ³S₁ → ³P₁', src: SRC.ref171, tex: 'b(^3S_1\\to{}^3P_1)' },
        { key: 'br_3S1_3P2', v: '0.508', unc: '0.026', desc: 'Branching ³S₁ → ³P₂', src: SRC.ref171, tex: 'b(^3S_1\\to{}^3P_2)' },
        { key: 'br_3S1_1P1', v: '0.0021', unc: '0.0009', desc: 'Branching ³S₁ → ¹P₁', src: SRC.ref171, tex: 'b(^3S_1\\to{}^1P_1)' },
        { key: 'br_3D1_3P0', v: '0.638', unc: '0.027', desc: 'Branching ³D₁ → ³P₀', src: SRC.ref171, tex: 'b(^3D_1\\to{}^3P_0)' },
        { key: 'br_3D1_3P1', v: '0.352', unc: '0.027', desc: 'Branching ³D₁ → ³P₁', src: SRC.ref171, tex: 'b(^3D_1\\to{}^3P_1)' },
        { key: 'br_3D1_3P2', v: '0.0099', unc: '0.0039', desc: 'Branching ³D₁ → ³P₂', src: SRC.ref171, tex: 'b(^3D_1\\to{}^3P_2)' }
      ]
    },
    {
      id: 'iso', title: 'Isotopes (mass, abundance, spin)',
      items: [
        { key: 'm168', v: '167.933889 amu', desc: '¹⁶⁸Yb mass · abundance 0.00126', src: SRC.ciaaw, tex: 'm_{168}' },
        { key: 'm170', v: '169.93476725 amu', desc: '¹⁷⁰Yb mass · abundance 0.03023', src: SRC.ciaaw, tex: 'm_{170}' },
        { key: 'm171', v: '170.93633152 amu', desc: '¹⁷¹Yb mass · abundance 0.14216 · I = 1/2, μ = +0.4919 μ_N', src: SRC.ciaaw, tex: 'm_{171}' },
        { key: 'm172', v: '171.93638666 amu', desc: '¹⁷²Yb mass · abundance 0.21754', src: SRC.ciaaw, tex: 'm_{172}' },
        { key: 'm173', v: '172.93821622 amu', desc: '¹⁷³Yb mass · abundance 0.16098 · I = 5/2, μ = −0.6776 μ_N', src: SRC.ciaaw, tex: 'm_{173}' },
        { key: 'm174', v: '173.93886755 amu', desc: '¹⁷⁴Yb mass · abundance 0.31896', src: SRC.ciaaw, tex: 'm_{174}' },
        { key: 'm176', v: '175.9425747 amu', desc: '¹⁷⁶Yb mass · abundance 0.12887', src: SRC.ciaaw, tex: 'm_{176}' }
      ]
    },
    {
      id: '171', title: '¹⁷¹Yb reference (hyperfine A, clock)',
      items: [
        { key: 'A171_1P1', v: '-214.06 MHz', unc: '0.17 MHz', desc: 'Hyperfine A, ¹P₁ (sheet: −212.33)', src: SRC.ref171, tex: 'A_{hfs}(^1P_1)' },
        { key: 'A171_3P1', v: '3957.85 MHz', unc: '0.05 MHz', desc: 'Hyperfine A, ³P₁', src: SRC.ref171, tex: 'A_{hfs}(^3P_1)' },
        { key: 'A171_3P2', v: '2680.9 MHz', unc: '2.0 MHz', desc: 'Hyperfine A, ³P₂', src: SRC.ref171, tex: 'A_{hfs}(^3P_2)' },
        { key: 'A171_3S1', v: '6838.41 MHz', unc: '0.26 MHz', desc: 'Hyperfine A, ³S₁ (sheet: 6800)', src: SRC.ref171, tex: 'A_{hfs}(^3S_1)' },
        { key: 'A171_3D1', v: '-2038.30 MHz', unc: '0.11 MHz', desc: 'Hyperfine A, ³D₁', src: SRC.ref171, tex: 'A_{hfs}(^3D_1)' },
        { key: 'nu578_171', v: '518295836590863 Hz', desc: '¹⁷¹Yb clock frequency (as in sheet)', src: SRC.sheet, tex: '\\nu_{578}^{(171)}' }
      ]
    }
  ];

  // Reduced E1 matrix elements (ea₀) from the lab sheet (Dzuba & Derevianko 2010; Porsev et al. 1999)
  var dipoleTable = {
    cols: ['6s6p ³P₀', '6s6p ³P₁', '6s6p ³P₂', '6s6p ¹P₁', '6s7p ³P₀', '6s7p ³P₁', '6s7p ¹P₁', '6s8p ¹P₁', '6s8p ³P₁'],
    rows: [
      ['6s² ¹S₀', '', 0.543, '', 4.148, '', 0.08, 0.67, 0.21, 0.01],
      ['5d6s ³D₁', 2.61, 2.26, 0.6, 0.27, '', '', '', '', ''],
      ['5d6s ³D₂', '', 4.03, 2.39, 0.32, '', '', '', '', ''],
      ['5d6s ³D₃', '', '', 6.12, '', '', '', '', '', ''],
      ['5d6s ¹D₂', '', 0.54, 0.38, 3.6, '', '', '', '', ''],
      ['6s7s ³S₁', 1.98, 3.53, 5.05, 0.73, '', '', '', '', ''],
      ['6s7s ¹S₀', 1.952, 0.22, '', 4.31, '', '', '', '', ''],
      ['6s6d ³D₁', 1.79, 1.57, '', '', '', '', '', '', ''],
      ['6s7d ³D₁', 2.1, 2.47, '', '', '', '', '', '', ''],
      ['6s8s ³S₁', 0.62, 1, '', '', '', '', '', '', ''],
      ['6p² ³P₁', 1.97, 0.18, '', '', '', '', '', '', ''],
      ['6s7d ³D₂', '', 1.67, '', '', '', '', '', '', ''],
      ['6s7d ¹D₂', '', 0.86, '', '', '', '', '', '', ''],
      ['6s8s ¹S₀', '', 0.3, '', '', '', '', '', '', ''],
      ['6p² ³P₀', '', 2.59, '', '', '', '', '', '', ''],
      ['6p² ³P₂', '', 2.92, '', '', '', '', '', '', '']
    ],
    src: 'Lab spreadsheet “Reduced Dipole Matrix Elements” (Dzuba & Derevianko, J. Phys. B 43, 074011 (2010); Porsev et al., PRA 60, 2781 (1999)). ¹S₀–¹P₁ and ¹S₀–³P₁ are experimental.'
  };

  P.ybData = { sections: sections, dipoleTable: dipoleTable, sources: SRC };

  // Build the Yb object (called by the engine once math.js and CODATA are ready)
  P.ybBuild = function (math, C, base) {
    var Y = {};          // key -> value
    var tex = {}, desc = {};
    var order = [];
    var pending = [];
    sections.forEach(function (s) { s.items.forEach(function (it) { pending.push(it); }); });

    function scopeFor() {
      var m = new Map(base);
      Object.keys(Y).forEach(function (k) { m.set(k === 'm' ? 'mYb' : k, Y[k]); });
      return m;
    }
    // Some derived items reference keys defined in later sections (e.g. 680 uses E_3S1), so
    // evaluate in passes until nothing more resolves.
    var guard = 0;
    while (pending.length && guard++ < 10) {
      var still = [];
      pending.forEach(function (it) {
        try {
          var val;
          if (it.fn) val = it.fn(math, C, Y);
          else if (it.v !== undefined) val = math.evaluate(it.v, scopeFor());
          else val = math.evaluate(it.expr, scopeFor());
          Y[it.key] = val;
          tex[it.key] = it.tex || it.key;
          desc[it.key] = it.desc || '';
          order.push(it.key);
        } catch (e) {
          it._err = e.message;
          still.push(it);
        }
      });
      if (still.length === pending.length) break;
      pending = still;
    }
    if (pending.length) throw new Error('could not evaluate: ' + pending.map(function (p) { return p.key + ' (' + p._err + ')'; }).join(', '));
    return { object: Y, tex: tex, desc: desc, order: order, sections: sections, dipoleTable: dipoleTable };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
