# PhysCalc

A Desmos-style physics calculator that runs locally in Chrome at **http://localhost:31415**.
It's unit-aware throughout (`h*c/(399 nm) to eV`) and includes ¹⁷⁴Yb data, CODATA 2022 constants,
about 200 equations, matrices and eigen-solvers, plots, and numerical integration and root-finding.
Everything runs offline in the browser using math.js and KaTeX.

## Install (macOS)

```bash
cd ~/Downloads/physcalc        # wherever you unzipped it
bash install.sh
```

The installer:

- copies the app to `~/Applications/PhysCalc`;
- adds a small login item (a launchd agent running `server.py`) so the page is always available;
- opens the page in Chrome.

macOS may show a "Background item added" notice. That notice is for the server.

To give it its own window and Dock icon, open the Chrome menu (⋮) and choose **Cast, save, and share → Install page as app…**.

You can also skip the server and just open `index.html` directly. In that case your worksheets are saved separately from the localhost version.

**Uninstall:** run `bash ~/Applications/PhysCalc/uninstall.sh`. Add `--all` to delete the files too.

## Using it

| Type | Get |
|---|---|
| `w = 1.5 mm` | a variable (used by every line below) |
| `I_peak(15 mW, w) to mW/cm^2` | equation from the library + unit conversion |
| `f(x) = x^2 sin(x)` | your own function |
| `M = [[0, 1], [1, 0]]` then `eig(M)` | eigenvalues + normalized eigenvectors |
| `plot(f, 0, 10)` / `plot2d(g, -1, 1, -1, 1)` | line plot / heat map |
| `integrate(f, a, b)`, `findroot(f, a, b)` | numerics (unit-aware) |
| `Yb.Isat399`, `Yb.Pvap(450 degC) to torr` | ¹⁷⁴Yb data |
| `# note` | a text line; `x = 3  # comment` also works |
| `ans`, `$3` | previous result; result of line 3 |

**Conventions**

- Hz and s⁻¹ are the same unit to the calculator. Γ, Ω, Δ and ω are angular (shown as s⁻¹); ν, f and γ are cyclic (Hz). Write detunings as `2*pi*15 MHz`.
- `G` is the gauss and `G_N` is Newton's constant.
- `qe` is the elementary charge and `e` is Euler's number.
- `u` means micro (`uK`, `um`), and you can also type `µ`.
- `450 degC` (or `450 °C`) is an absolute temperature and is converted to 723.15 K before any arithmetic. Use K for temperature differences.

## Files you'll edit

```
equations/my_equations.js   ← your own equations (kept when you re-run install.sh)
data/user_constants.js      ← your own constants (kept too)
data/yb174.js               ← every ¹⁷⁴Yb number, with its source
equations/amo.js, optics.js, thermal.js, quantum.js, em.js, functions.js   ← the built-in library
data/codata2022.js          ← generated from scipy.constants (CODATA 2022)
```

After you edit a file, reload the page (⌘R). An equation is one line of calculator syntax:

```js
{ name: 'Lattice depth in recoils', def: 'U_Er(P, w) = lattice_U0(P, w, Yb.alpha759)/Yb.Er759',
  args: { P: 'power per beam', w: 'waist' }, example: 'U_Er(1 W, 100 um)' }
```

## Notes on the Yb data

- Transition frequencies are ¹⁷⁴Yb measurements:
  - 399 nm: Kleinert 2016
  - 556 nm: I₂-referenced, 2023
  - 578 nm: Poli 2008
  - 431 nm: Yao 2026
  - magic wavelength: Barber 2008
- The 680, 649, 770, 1389 and 1052 nm lines are computed from NIST level energies. Their accuracy is roughly 0.1 GHz.
- Lifetimes, branching ratios and reduced matrix elements come from the ¹⁷¹Yb Reference Data compilation (arXiv:2509.04416). They are electronic properties, so they are the same for ¹⁷⁴Yb at this precision. Where your lab spreadsheet differs, both values are noted.
