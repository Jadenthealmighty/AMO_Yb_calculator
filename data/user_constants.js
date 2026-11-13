/* Your own constants. They appear in the Constants panel under "My constants" and can be used
 * by name anywhere. `value` is anything the calculator understands (units welcome).
 * Edit this file, then reload the page.
 */
(function (g) {
  var P = g.PhysCalc = g.PhysCalc || {};
  P.userConstants = [
    { name: 'rho_Cu', value: '1.68e-8 ohm m', desc: 'Resistivity of copper at 20 °C (approx.)', tex: '\\rho_{Cu}' },
    { name: 'g_Toronto', value: '9.8037 m/s^2', desc: 'Local gravity, Toronto (approx., change for your lab)', tex: 'g_{TO}' }
    // { name: 'w_MOT', value: '5 mm', desc: 'Our MOT beam waist', tex: 'w_{MOT}' },
  ];
})(typeof globalThis !== 'undefined' ? globalThis : this);
