/* YOUR equations — this file is yours to edit. Reload the page after saving.
 *
 * Each entry needs a name and a `def` in calculator syntax (units are fine). Optional:
 *   tex      LaTeX shown in the Equations panel
 *   args     { argName: 'description', … }
 *   returns  what comes out
 *   example  a line inserted by the "Try" button
 *   also     extra lines inserted after the example (e.g. a plot)
 *   notes    anything else
 *
 * Constants (c, h, hbar, kB, muB, …), Yb.<key>, and every other equation can be used inside `def`.
 * Avoid naming arguments h, c, e, i, pi or kB (they would hide the constants inside your formula).
 */
(function (g) {
  var P = g.PhysCalc = g.PhysCalc || {};
  P.equations = P.equations || [];
  var cat = 'My equations';
  [
    {
      name: 'Atoms in a MOT beam path (example — edit me)',
      def: 'mot_capture_frac(vc, T) = 1 - exp(-Yb.m*vc^2/(2*kB*T))*(1 + Yb.m*vc^2/(2*kB*T))',
      tex: 'F(v<v_c) = 1 - e^{-x}(1+x),\\ x = \\frac{m v_c^2}{2k_BT}',
      args: { vc: 'capture velocity', T: 'oven temperature' },
      returns: 'fraction of an effusive beam slower than v_c',
      example: 'mot_capture_frac(40 m/s, 450 degC)'
    }
  ].forEach(function (e) { e.cat = cat; P.equations.push(e); });
})(typeof globalThis !== 'undefined' ? globalThis : this);
