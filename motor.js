/* Motor de masas v1 — modelos calibrados en las tandas 1-3 (ver documento de especificación).
   Unidades: horas, °C, gramos, % sobre harina. Levadura interna = instantánea equivalente (%). */
const Motor = (() => {
  'use strict';
  // ---------- velocidades relativas (Ratkowsky) ----------
  const ratk = (T, Tmin, Tmax, c) => (T <= Tmin || T >= Tmax) ? 0 : ((T - Tmin) * (1 - Math.exp(c * (T - Tmax)))) ** 2;
  const R24 = ratk(24, 3, 45, 0.3);
  const rY = T => ratk(T, 3, 45, 0.3) / R24;                 // levadura, r(24 °C) = 1
  const R21L = ratk(21, -3, 40, 0.3);
  const rLab = T => ratk(T, -3, 40, 0.3) / R21L;            // masa madre, r(21 °C) = 1

  // ---------- factores ----------
  const hs = H => Math.min(1, Math.pow(Math.max(1e-4, (H - 0.20) / 0.45), 1.5)); // H en tanto por uno
  const saltF = s => Math.exp(-0.1 * ((s ?? 2) - 2));
  const fatF = g => Math.exp(-0.005 * (g || 0));
  const MU = 0.10, MU_POOLISH = 0.20, NS = 2.0;
  const G = { pan: 1.60, pan_denso: 0.80, pizza: 0.48, teglia: 0.84, poolish: 1.88, biga: 1.56 };
  const REPARTO = { pan: 0.70, pan_denso: 0.35, pizza: 0.25, teglia: 0.80 };   // fracción del tiempo de fermentación en bloque (ambiente)

  // ---------- temperatura de la masa en el tiempo (Newton) ----------
  const tpath = (T0, Tenv, tau, t) => Tenv + (T0 - Tenv) * Math.exp(-t / tau);

  /* stages: [{h, Tenv, tau, T0?}] ; fac: factor de velocidad (sal·hidratación·grasa·calibración) */
  function simulate(N0, stages, fac, mu = MU, dt = 0.04) {
    let N = N0, Gs = 0, T = stages[0].T0 ?? stages[0].Tenv;
    for (const s of stages) {
      if (s.T0 != null) T = s.T0;
      const n = Math.max(1, Math.ceil(s.h / dt)), step = s.h / n;
      for (let i = 0; i < n; i++) {
        const r = rY(tpath(T, s.Tenv, s.tau, step / 2)) * fac;
        Gs += N / (1 + N / NS) * r * step;
        N *= Math.exp(mu * r * step);
        T = tpath(T, s.Tenv, s.tau, step);
      }
    }
    return { G: Gs, N, T };
  }
  // dosis (instantánea %) para llegar a Gt
  function solveDose(stages, fac, Gt, mu = MU, extraN = 0) {
    let lo = 1e-4, hi = 6;
    if (simulate(hi + extraN, stages, fac, mu).G < Gt) return null;
    if (simulate(lo + extraN, stages, fac, mu).G >= Gt) return lo;
    for (let i = 0; i < 50; i++) {
      const m = Math.sqrt(lo * hi);
      if (simulate(m + extraN, stages, fac, mu).G < Gt) lo = m; else hi = m;
    }
    return Math.sqrt(lo * hi);
  }
  // fracción de gas acumulado en el tiempo (para ventanas y replanificar)
  function gasCurve(N0, stages, fac, mu = MU) {
    const out = []; let acc = 0;
    for (const s of stages) {
      const r = simulate(N0, stages.slice(0, stages.indexOf(s) + 1), fac, mu);
      acc += s.h; out.push({ t: acc, G: r.G });
    }
    return out;
  }

  // ---------- masa madre ----------
  const G21_DEF = 3.1;   // h por duplicación a 21 °C (tanda 1, 7 refrescos)
  const K_BLOQUE = 1.2;  // bloque+apresto con masa madre (abierto: ±50 %)
  const eqHoursLab = stages => stages.reduce((a, s) => {
    let T = s.T0 ?? s.Tenv, acc = 0; const n = Math.max(1, Math.ceil(s.h / 0.1)), st = s.h / n;
    for (let i = 0; i < n; i++) { acc += rLab(tpath(T, s.Tenv, s.tau, st / 2)) * st; T = tpath(T, s.Tenv, s.tau, st); }
    return a + acc;
  }, 0);
  // dilución D (masa total / masa de madre) que llega justo a tiempo
  const sourdoughD = (stages, g21 = G21_DEF, k = K_BLOQUE) => Math.pow(2, eqHoursLab(stages) / (k * g21));
  const levainPeakHours = (D, T, g21 = G21_DEF) => Math.log2(D) * g21 / rLab(T);

  // ---------- temperatura del agua (balance térmico) ----------
  function waterTemp({ flour, water, Tflour, Ttarget, dT, preferment = 0, Tpref = null }) {
    const cF = 1.7, cW = 4.18, cP = 3.0;
    const heat = (Ttarget - dT) * (flour * cF + water * cW + preferment * cP) - flour * cF * Tflour - preferment * cP * (Tpref ?? Tflour);
    return heat / (water * cW);
  }
  const DT_MEZCLA = { mano: 1.5, pliegues: 1.0, espiral: 5.5, brazos: 3, planetaria: 8, thermomix: 8, panificadora: 6 };

  // ---------- conversiones ----------
  const LEV = { instantanea: 1, fresca: 3, seca: 1.33 };
  return { rY, rLab, hs, saltF, fatF, G, REPARTO, MU, MU_POOLISH, simulate, solveDose, gasCurve,
           eqHoursLab, sourdoughD, levainPeakHours, G21_DEF, K_BLOQUE, waterTemp, DT_MEZCLA, LEV, tpath };
})();
if (typeof module !== 'undefined') module.exports = Motor;
