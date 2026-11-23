/* Planificador: de la ficha + respuestas + perfil a 2-3 planes con horas reales. */
const Plan = (() => {
  'use strict';
  const M = (typeof Motor !== 'undefined') ? Motor : require('./motor.js');
  const H = 3600e3, MIN = 60e3;

  // ---------------- utilidades ----------------
  const mid = v => Array.isArray(v) ? (v.length === 3 ? v[1] : (v[0] + v[v.length - 1]) / 2) : v;
  const lo = v => Array.isArray(v) ? v[0] : v;
  const hi = v => Array.isArray(v) ? v[v.length - 1] : v;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const round = (x, d = 0) => { const p = 10 ** d; return Math.round(x * p) / p; };

  // ---------------- tipo de producto ----------------
  function gType(f) {
    const g = f.fermentacion.G;
    if (g === 'masa_madre') return 'pan';
    if (f.familia === 'focaccia' && g === 'pan') return 'pan';
    return g;
  }
  const isPizza = f => f.familia === 'pizza' && gType(f) === 'pizza';

  // ---------------- fórmula ----------------
  // valores típicos cuando la ficha (p. ej. un pliego de IGP) no los da
  const DEF_AGUA = { centeno: 82, mixto: 75, mollete: 65, gallego: 75, ensaimada: 48, brioche: 0, trenza: 0, bollos: 0 };
  const DEF_SAL = { pizza: 2.8, enriquecido: 1.5, focaccia: 2.2, pan: 1.9 };
  function liquidEq(f) { return (f.otros || []).filter(o => o.pct).reduce((a, o) => a + o.pct * (/leche/.test(o.ing) ? 0.87 : /huevo/.test(o.ing) ? 0.75 : 0), 0); }
  function supuestos(f) {
    const out = [];
    if (mid(f.agua_pct) == null) out.push('agua');
    if (mid(f.sal_pct) == null) out.push('sal');
    return out;
  }
  function hydration(f, ans) {
    const a = f.agua_pct;
    let base = mid(a);
    if (base == null) base = DEF_AGUA[f.estilo] != null ? DEF_AGUA[f.estilo] + (DEF_AGUA[f.estilo] === 0 ? liquidEq(f) + 5 : 0) : (f.familia === 'pizza' ? 63 : f.familia === 'enriquecido' ? 55 : 68);
    let h = base;
    const lo_ = lo(a) ?? h - 5, hi_ = hi(a) ?? h + 8;
    h += (ans.ajusteAgua || 0);
    const adj = { muy_abierta: 5, abierta: 2, regular: 0, cerrada: -3, fina_blanda: 0, fina_crujiente: -3, media: 0, gruesa_esponjosa: 3,
                  alta: 3, fina: -3, alveolado: 2, tierno: -1 };
    for (const k of ['miga', 'base', 'altura', 'interior']) if (ans[k] && adj[ans[k]] != null) h += adj[ans[k]];
    if (ans.borde === 'alto') h += 1;
    return clamp(h, lo_, hi_);
  }
  // gramos de masa por cm2 según estilo
  function gcm2(f, ans) {
    if (f.pieza && f.pieza.g_cm2) return f.pieza.g_cm2;
    if (f.estilo === 'bandeja') return 0.74;
    if (f.familia === 'focaccia') return { fina: 0.6, media: 0.9, alta: 1.2 }[ans.altura || 'media'] || 0.9;
    return 0.40;
  }
  function doughMass(f, ans) {
    const q = ans.cantidad || {};
    if (f.familia === 'pizza' && f.estilo !== 'bandeja') {
      const n = q.n || 4, d = q.diam || 30;
      let dens = gcm2(f, ans); if (d < 26) dens *= 1.12;
      return { masa: n * Math.PI * (d / 2) ** 2 * dens, piezas: n, porPieza: Math.PI * (d / 2) ** 2 * dens, desc: `${n} pizzas de ${d} cm` };
    }
    if (f.estilo === 'bandeja' || f.familia === 'focaccia') {
      const [w, l] = q.bandeja || [30, 40], n = q.n || 1;
      const m = w * l * gcm2(f, ans);
      return { masa: n * m, piezas: n, porPieza: m, desc: `${n} bandeja${n > 1 ? 's' : ''} de ${w}×${l} cm` };
    }
    const n = q.n || 1, p = q.peso || 750;
    return { masa: n * p, piezas: n, porPieza: p, desc: `${n} pieza${n > 1 ? 's' : ''} de ${p} g de masa` };
  }
  function formula(f, ans) {
    const agua = hydration(f, ans);
    const sal = mid(f.sal_pct) ?? DEF_SAL[f.familia] ?? 2.0;
    const grasa = f.grasa ? (mid(f.grasa.pct) ?? (f.familia === 'focaccia' ? 4 : 0)) : 0;
    const azucar = f.azucar_pct || 0;
    const otros = (f.otros || []).filter(o => o.pct).map(o => ({ ing: o.ing, pct: o.pct }));
    // agua efectiva de leche y huevo: se descuenta del agua
    let aguaAnadida = agua, liquidos = [];
    for (const o of otros) {
      const k = /leche/.test(o.ing) ? 0.87 : /huevo/.test(o.ing) ? 0.75 : 0;
      if (k) { aguaAnadida -= o.pct * k; liquidos.push(o); }
    }
    aguaAnadida = Math.max(0, aguaAnadida);
    const pctSum = 100 + aguaAnadida + sal + grasa + azucar + otros.reduce((a, o) => a + o.pct, 0);
    const dm = doughMass(f, ans);
    const harina = dm.masa * 1.02 / (pctSum / 100);
    return { agua, aguaAnadida, sal, grasa, azucar, otros, harina, masa: dm, liquidos };
  }

  // ---------------- tiempos activos (min) ----------------
  function durations(f, ans, prof, metodo) {
    const mezcla = ans.amasado === 'pliegues' ? 10 : (ans.amasado === 'mano' ? 20 : 15);
    const dm = doughMass(f, ans);
    const pizza = isPizza(f);
    const formar = pizza ? 10 + 2 * dm.piezas : (f.familia === 'focaccia' || f.estilo === 'bandeja') ? 10 : 10 + 5 * dm.piezas;
    const horno = (prof.hornos || []).find(o => o.id === ans.horno) || (prof.hornos || [])[0];
    let bake = bakeMinutes(f, prof);
    if (pizza && horno && horno.tmax < 350 && bake < 7) bake = 7;
    const hornear = pizza ? dm.piezas * (bake + 2) : bake;
    const precal = pizza ? 60 : 45;
    return { mezcla, formar, hornear, precal, bake };
  }
  function bakeMinutes(f) {
    const t = f.horneado && f.horneado.tiempo_min;
    if (typeof t === 'number') return t;
    if (Array.isArray(t)) { const v = t.filter(x => x != null); if (v.length) return Math.round(v.reduce((a, b) => a + b, 0) / v.length); }
    if (f.familia === 'pizza') return f.estilo === 'bandeja' ? 22 : 5;
    if (f.familia === 'focaccia') return 25;
    return 40;
  }
  function bakeInfo(f, prof, horno) {
    const h = f.horneado || {}; let T = h.T, txt, need;
    if (T && typeof T === 'object' && !Array.isArray(T)) { need = T.boveda || T.suelo && hi(T.suelo) || T.acero; txt = Object.entries(T).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join('–') : v} °C`).join(', '); }
    else if (Array.isArray(T) && T.filter(x => x != null).length) {
      const t = T.filter(x => x != null);
      if (t.length === 2 && t[0] > t[1]) { need = t[0]; txt = `${t[0]} °C y luego ${t[1]} °C`; }
      else if (t.length === 1) { need = t[0]; txt = `${t[0]} °C`; }
      else { need = t[0]; txt = `${t.join('–')} °C`; }
    }
    else if (typeof T === 'number') { need = T; txt = `${T} °C`; }
    else { need = f.familia === 'enriquecido' ? 180 : f.familia === 'pizza' ? (f.estilo === 'bandeja' ? 250 : 280) : 240; txt = `≈ ${need} °C`; }
    const avisos = [];
    if (horno && need && horno.tmax && need > horno.tmax + 10) {
      txt = `al máximo (${horno.tmax} °C)` + (f.familia === 'pizza' && f.estilo !== 'bandeja' ? ', sobre piedra o acero bien caliente; los últimos 1–2 min con el grill' : '');
      avisos.push(`Tu horno «${horno.nombre}» llega a ${horno.tmax} °C y este estilo pide ≈ ${need} °C: hornea al máximo y cuenta con más tiempo y menos color.`); }
    const vapor = h.vapor === true ? 'con vapor los primeros 15–20 min' : h.vapor === 'cocotte' ? 'en olla de hierro tapada los primeros 20–30 min' : h.vapor === 'inicial' ? 'con vapor al principio' : '';
    if (vapor && horno && horno.vapor === 'ninguno' && h.vapor !== 'cocotte') avisos.push(horno.olla ? 'Tu horno no tiene vapor: hornea dentro de la olla de hierro tapada los primeros 20–25 min.' : 'Tu horno no tiene vapor: pon una bandeja con agua hirviendo abajo al meter el pan.');
    return { txt, vapor, avisos };
  }

  // ---------------- disponibilidad ----------------
  function blockedWindows(prof, extra, from, to) {
    const w = [...(extra || [])].map(x => ({ from: new Date(x.from), to: new Date(x.to) }));
    const s = prof.horario && prof.horario.dormir;
    if (s) {
      const [a, b] = [s.desde, s.hasta].map(t => t.split(':').map(Number));
      const d0 = new Date(from); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() - 1);
      for (let d = new Date(d0); d < to; d.setDate(d.getDate() + 1)) {
        const f1 = new Date(d); f1.setHours(a[0], a[1], 0, 0);
        const t1 = new Date(d); t1.setHours(b[0], b[1], 0, 0); if (t1 <= f1) t1.setDate(t1.getDate() + 1);
        w.push({ from: f1, to: t1 });
      }
    }
    return w;
  }
  const conflicts = (steps, wins) => steps.filter(s => s.tipo === 'activo').some(s => {
    const a = s.t.getTime(), b = a + (s.dur || 5) * MIN;
    return wins.some(w => a < w.to.getTime() && b > w.from.getTime());
  });

  // ---------------- constructores de planes ----------------
  const PREF_Y = { pan: 0.35, pan_denso: 0.6, pizza: 0.12, teglia: 0.35 };    // dosis cómoda (instantánea %)
  const MAXY = { pan: 1.5, pan_denso: 1.2, pizza: 1.0, teglia: 1.2 };
  const MINY = 0.015;

  function ctx(f, ans, prof) {
    const fo = formula(f, ans);
    const g = gType(f);
    const Tc = ans.cocina ?? prof.cocina ?? 21;
    const Tfr = prof.nevera ?? 5;
    const k = (prof.calib && prof.calib.levadura) || 1;
    const enr = f.familia === 'enriquecido';
    let fac = M.saltF(fo.sal) * M.hs(fo.agua / 100) * M.fatF(fo.grasa) * k;
    const Gt = M.G[g] ?? M.G.pan;
    const Tmasa = enr ? 26 : g === 'pizza' ? 23 : g === 'pan_denso' ? 25 : 24;
    return { fo, g, Tc, Tfr, k, fac, Gt, Tmasa, enr, pizza: isPizza(f), D: durations(f, ans, prof) };
  }

  // reparto del tiempo de fermentación a temperatura ambiente
  function splitAmbient(c, F) {
    if (c.pizza) { const b = clamp(F * 0.25, 1, 3); return [b, F - b]; }
    if (c.g === 'teglia') { const a = clamp(F * 0.2, 0.75, 2); return [F - a, a]; }
    const a = clamp(F * (1 - (M.REPARTO[c.g] ?? 0.7)), 0.6, 3); return [F - a, a];
  }

  // genérico: busca la hora de inicio que da una dosis cómoda y no choca con horas ocupadas
  function search(build, earliest, latest, prefY, maxY, wins) {
    let best = null;
    const stepMs = 15 * MIN;
    for (let s = earliest.getTime(); s <= latest.getTime(); s += stepMs) {
      const p = build(new Date(s)); if (!p) continue;
      if (p.y == null || p.y > maxY || p.y < MINY) continue;
      if (conflicts(p.steps, wins)) continue;
      const score = Math.abs(Math.log(p.y / prefY)) + (p.penal || 0);
      if (!best || score < best.score) best = { ...p, score };
    }
    return best;
  }

  function stepsCommon(c, f, ans, t0, parts) { return parts; }

  // --- directa a temperatura ambiente ---
  function planDirecta(f, ans, prof, start, eatAt, wins) {
    const c = ctx(f, ans, prof), D = c.D;
    const bakeStart = new Date(eatAt.getTime() - (D.hornear + (c.pizza ? 0 : 30)) * MIN);
    const build = S => {
      const fermH = (bakeStart - S) / H - (D.mezcla + D.formar) / 60;
      if (fermH < 1.2) return null;
      const [b, a] = splitAmbient(c, fermH);
      const stages = [{ h: b, Tenv: c.Tc, tau: 2, T0: c.Tmasa }, { h: a, Tenv: c.Tc, tau: c.pizza ? 1 : 0.7 }];
      const y = M.solveDose(stages, c.fac, c.Gt);
      const tMix = S, tBloque = new Date(S.getTime() + D.mezcla * MIN), tForm = new Date(tBloque.getTime() + b * H);
      const steps = [
        step(tMix, D.mezcla, 'activo', 'mezclar'),
        ...pliegues(ans, tBloque, b),
        step(tBloque, b * 60, 'pasivo', 'bloque'),
        step(tForm, D.formar, 'activo', c.pizza ? 'bolear' : 'formar'),
        step(new Date(tForm.getTime() + D.formar * MIN), a * 60, 'pasivo', c.pizza ? 'bolas' : 'apresto'),
        step(new Date(bakeStart.getTime() - D.precal * MIN), 3, 'activo', 'precalentar'),
        step(bakeStart, D.hornear, 'activo', 'hornear'),
      ];
      return { y, steps, stages, fermH, penal: 0 };
    };
    const latest = new Date(bakeStart.getTime() - 1.5 * H);
    const p = search(build, start, latest, PREF_Y[c.g] ?? 0.35, MAXY[c.g] ?? 1.5, wins);
    if (!p) return fail('directa', c, 'No cabe a temperatura ambiente con tus horas libres.');
    return finish('directa', f, ans, prof, c, p, { titulo: 'Directa, a temperatura ambiente', cambio: 'La más sencilla; sabor suave.' });
  }

  // --- con nevera ---
  function planNevera(f, ans, prof, start, eatAt, wins) {
    const c = ctx(f, ans, prof), D = c.D;
    const bakeStart = new Date(eatAt.getTime() - (D.hornear + (c.pizza ? 0 : 30)) * MIN);
    const temper = c.pizza ? 3 : (c.g === 'teglia' ? 1.25 : 0.75);   // horas fuera de la nevera antes de hornear/estirar
    const build = S => {
      const b = c.pizza ? 1.5 : (c.g === 'teglia' ? 0.75 : 3.0);
      const tForm = new Date(S.getTime() + (D.mezcla * MIN) + b * H);
      const tOut = new Date(bakeStart.getTime() - temper * H);
      const fr = (tOut - tForm) / H - D.formar / 60;
      if (fr < 6) return null;
      const tauFr = c.pizza ? 1.0 : (c.g === 'teglia' ? 1.0 : 2.5);   // una pieza de pan grande tarda horas en enfriarse
      const stages = [{ h: b, Tenv: c.Tc, tau: 2, T0: c.Tmasa - 2 }, { h: fr, Tenv: c.Tfr, tau: tauFr }, { h: temper, Tenv: c.Tc, tau: 1 }];
      const y = M.solveDose(stages, c.fac, c.Gt);
      const tBl = new Date(S.getTime() + D.mezcla * MIN);
      const steps = [
        step(S, D.mezcla, 'activo', 'mezclar'),
        ...pliegues(ans, tBl, b),
        step(tBl, b * 60, 'pasivo', 'bloque'),
        step(tForm, D.formar, 'activo', c.pizza ? 'bolear_nevera' : c.g === 'teglia' ? 'nevera_bandeja' : 'formar_nevera'),
        step(new Date(tForm.getTime() + D.formar * MIN), fr * 60, 'pasivo', 'nevera'),
        step(tOut, 3, 'activo', 'sacar'),
        step(new Date(tOut.getTime() + 3 * MIN), temper * 60 - 3, 'pasivo', c.pizza ? 'atemperar' : 'apresto'),
        step(new Date(bakeStart.getTime() - D.precal * MIN), 3, 'activo', 'precalentar'),
        step(bakeStart, D.hornear, 'activo', 'hornear'),
      ];
      return { y, steps, stages, fermH: (bakeStart - S) / H, penal: fr > 72 ? 5 : 0 };
    };
    const p = search(build, start, new Date(bakeStart.getTime() - 9 * H), c.pizza ? 0.2 : c.enr ? 0.6 : 0.25, c.enr ? 2.0 : 1.0, wins);
    if (!p) return fail('nevera', c, 'Con nevera hacen falta al menos 9–10 h.');
    return finish('nevera', f, ans, prof, c, p, { titulo: 'Con una noche (o un día) en nevera', cambio: 'Más sabor y más fácil de encajar; la masa se maneja fría.' });
  }

  // --- prefermento (poolish o biga) + masa final ---
  function planPref(tipo, f, ans, prof, start, eatAt, wins) {
    const c = ctx(f, ans, prof), D = c.D;
    const bakeStart = new Date(eatAt.getTime() - (D.hornear + (c.pizza ? 0 : 30)) * MIN);
    const frac = tipo === 'poolish' ? (c.pizza ? 0.4 : 0.3) : (c.pizza ? 0.5 : 0.4);
    const Hp = tipo === 'poolish' ? 1.0 : 0.5;                 // hidratación del prefermento
    const facP = tipo === 'poolish' ? M.hs(1.0) : M.hs(0.5);
    const muP = tipo === 'poolish' ? M.MU_POOLISH : M.MU * M.hs(0.5);
    const Gp = tipo === 'poolish' ? M.G.poolish : M.G.biga;
    const Tp = tipo === 'biga' ? Math.min(c.Tc, 19) : c.Tc;
    const finalH = c.pizza ? 5 : 3.0;
    const build = S => {
      const tMix = new Date(bakeStart.getTime() - (finalH * 60 + D.mezcla + D.formar) * MIN);
      const hp = (tMix - S) / H - 0.1;
      if (hp < (tipo === 'poolish' ? 8 : 12) || hp > 22) return null;
      const stP = [{ h: hp, Tenv: Tp, tau: 1.5, T0: Tp }];
      const yP = M.solveDose(stP, facP * c.k, Gp, muP);
      if (yP == null || yP < 0.01 || yP > 1.2) return null;
      const Np = M.simulate(yP, stP, facP * c.k, muP).N * frac;
      const [b, a] = splitAmbient(c, finalH);
      const stages = [{ h: b, Tenv: c.Tc, tau: 2, T0: c.Tmasa }, { h: a, Tenv: c.Tc, tau: c.pizza ? 1 : 0.7 }];
      let y = M.solveDose(stages, c.fac, c.Gt, M.MU, Np);
      if (y == null) return null;
      const yFinal = y; // instantánea extra en masa final
      const tBl = new Date(tMix.getTime() + D.mezcla * MIN), tForm = new Date(tBl.getTime() + b * H);
      const steps = [
        step(S, 6, 'activo', tipo),
        step(new Date(S.getTime() + 6 * MIN), hp * 60, 'pasivo', tipo + '_madura'),
        step(tMix, D.mezcla, 'activo', 'mezclar_pref'),
        ...pliegues(ans, tBl, b),
        step(tBl, b * 60, 'pasivo', 'bloque'),
        step(tForm, D.formar, 'activo', c.pizza ? 'bolear' : 'formar'),
        step(new Date(tForm.getTime() + D.formar * MIN), a * 60, 'pasivo', c.pizza ? 'bolas' : 'apresto'),
        step(new Date(bakeStart.getTime() - D.precal * MIN), 3, 'activo', 'precalentar'),
        step(bakeStart, D.hornear, 'activo', 'hornear'),
      ];
      return { y: Math.max(yFinal, MINY), yP, frac, Hp, steps, stages, penal: Math.abs(hp - 14) / 6 };
    };
    const p = search(build, start, new Date(bakeStart.getTime() - (finalH + 8) * H), tipo === 'poolish' ? 0.05 : 0.1, 1.2, wins);
    if (!p) return fail(tipo, c, `Con ${tipo} hacen falta unas ${tipo === 'poolish' ? 12 : 16} h antes de la masa final.`);
    return finish(tipo, f, ans, prof, c, p, {
      titulo: tipo === 'poolish' ? 'Con poolish la víspera' : 'Con biga la víspera',
      cambio: tipo === 'poolish' ? 'Más aroma y masa más extensible; miga más abierta.' : 'Sabor más complejo y masa con más fuerza.' });
  }

  // --- masa madre ---
  function planMasaMadre(f, ans, prof, start, eatAt, wins) {
    const c = ctx(f, ans, prof), D = c.D;
    const mm = prof.masamadre || {};
    if (mm.estado !== 'activa') return null;
    const g21 = mm.g21 || M.G21_DEF;
    const bakeStart = new Date(eatAt.getTime() - (D.hornear + 30) * MIN);
    const ratios = [[1, 1, 1], [1, 2, 2], [1, 3, 3], [1, 5, 5]];
    const build = S => {
      let best = null;
      for (const rr of ratios) {
        const Dr = rr[0] + rr[1] + rr[2];
        const peak = M.levainPeakHours(Dr, c.Tc, g21);
        const tMix = new Date(S.getTime() + (5 + peak * 60) * MIN);
        const ferm = (bakeStart - tMix) / H - (D.mezcla + D.formar) / 60;
        if (ferm < 3) continue;
        const [b, a] = splitAmbient({ ...c, g: 'pan' }, ferm);
        const stages = [{ h: b, Tenv: c.Tc, tau: 2, T0: c.Tmasa }, { h: a, Tenv: c.Tc, tau: 0.7 }];
        const Dd = M.sourdoughD(stages, g21);
        const pctHarina = (100 + c.fo.agua + c.fo.sal) / Dd;      // masa madre refrescada, % sobre la harina
        if (pctHarina < 8 || pctHarina > 35) continue;
        const pen = Math.abs(Math.log(pctHarina / 20));
        if (!best || pen < best.pen) best = { rr, peak, tMix, b, a, stages, pctHarina, pen };
      }
      if (!best) return null;
      const { rr, peak, tMix, b, a, stages, pctHarina } = best;
      const tBl = new Date(tMix.getTime() + D.mezcla * MIN), tForm = new Date(tBl.getTime() + b * H);
      const steps = [
        step(S, 5, 'activo', 'refresco'),
        step(new Date(S.getTime() + 5 * MIN), peak * 60, 'pasivo', 'refresco_madura'),
        step(tMix, D.mezcla, 'activo', 'mezclar_mm'),
        ...pliegues({ ...ans, amasado: ans.amasado || 'pliegues' }, tBl, b),
        step(tBl, b * 60, 'pasivo', 'bloque_mm'),
        step(tForm, D.formar, 'activo', 'formar'),
        step(new Date(tForm.getTime() + D.formar * MIN), a * 60, 'pasivo', 'apresto'),
        step(new Date(bakeStart.getTime() - D.precal * MIN), 3, 'activo', 'precalentar'),
        step(bakeStart, D.hornear, 'activo', 'hornear'),
      ];
      return { y: 0.2, inoc: pctHarina, ratio: rr, steps, stages, penal: best.pen };
    };
    const p = search(build, start, new Date(bakeStart.getTime() - 6 * H), 0.2, 1, wins);
    if (!p) {
      const need = M.K_BLOQUE * g21 * Math.log2(9) / M.rLab(c.Tc) + M.levainPeakHours(3, c.Tc, g21);
      return fail('masa_madre', c, `Con la cocina a ${c.Tc} °C, la masa madre necesita unas ${Math.round(need)} h desde el refresco hasta el horno.`);
    }
    return finish('masa_madre', f, ans, prof, c, p, { titulo: 'Con tu masa madre', cambio: 'Sabor ligeramente ácido, corteza más gruesa, dura más.', confianza: 'baja: el bloque con masa madre aún no está calibrado; manda la señal del tarro' });
  }

  // ---------------- pasos y textos ----------------
  function step(t, dur, tipo, clave) { return { t: new Date(t), dur: Math.round(dur), tipo, clave }; }
  function pliegues(ans, tBl, bH) {
    if (ans.amasado !== 'pliegues') return [];
    const n = clamp(Math.floor(bH * 60 / 2 / 30), 3, 6), out = [];
    for (let i = 1; i <= n; i++) out.push(step(new Date(tBl.getTime() + i * 30 * MIN), 2, 'activo', 'pliegue'));
    return out;
  }
  function fail(metodo, c, motivo) { return { metodo, posible: false, motivo }; }

  function finish(metodo, f, ans, prof, c, p, meta) {
    const fo = c.fo, F = fo.harina;
    const lev = prof.levadura || 'fresca';
    const facLev = M.LEV[lev] || 3;
    const items = [];
    const pref = (metodo === 'poolish' || metodo === 'biga');
    const usaLevadura = metodo !== 'masa_madre';
    let aguaTotal = F * fo.aguaAnadida / 100;
    if (pref) {
      const Fp = F * p.frac, Wp = Fp * p.Hp, Yp = Fp * p.yP / 100 * facLev;
      items.push({ grupo: metodo === 'poolish' ? 'Poolish (la víspera)' : 'Biga (la víspera)', lista: [
        ['Harina', Fp], ['Agua', Wp], [`Levadura ${lev}`, Yp, 2] ] });
      items.push({ grupo: 'Masa final', lista: [
        [metodo === 'poolish' ? 'Todo el poolish' : 'Toda la biga', Fp + Wp + Yp], ['Harina', F - Fp], ['Agua', aguaTotal - Wp],
        ...(fo.liquidos || []).map(o => [cap(o.ing), F * o.pct / 100]),
        ['Sal', F * fo.sal / 100, 1], ...(p.y > 0.03 ? [[`Levadura ${lev}`, F * p.y / 100 * facLev, 2]] : []),
        ...(fo.grasa ? [[cap(f.grasa.tipo), F * fo.grasa / 100]] : []), ...(fo.azucar ? [['Azúcar', F * fo.azucar / 100]] : []),
        ...fo.otros.filter(o => !/leche|huevo/.test(o.ing)).map(o => [cap(o.ing), F * o.pct / 100, 1]) ] });
    } else if (metodo === 'masa_madre') {
      const L = F * p.inoc / 100;            // levain al 100 %: mitad harina, mitad agua
      const [ra, rb, rc] = p.ratio || [1, 5, 5], Dr = ra + rb + rc;
      items.push({ grupo: `Refresco de masa madre (${ra}:${rb}:${rc})`, lista: [['Masa madre', L * ra / Dr], ['Harina', L * rb / Dr], ['Agua', L * rc / Dr]] });
      items.push({ grupo: 'Masa', lista: [['Masa madre refrescada', L], ['Harina', F - L / 2], ['Agua', aguaTotal - L / 2], ['Sal', F * fo.sal / 100, 1],
        ...(fo.grasa ? [[cap(f.grasa.tipo), F * fo.grasa / 100]] : [])] });
    } else {
      items.push({ grupo: 'Masa', lista: [['Harina', F], ['Agua', aguaTotal],
        ...(fo.liquidos || []).map(o => [cap(o.ing), F * o.pct / 100]),
        ['Sal', F * fo.sal / 100, 1], [`Levadura ${lev}`, F * p.y / 100 * facLev, 2],
        ...(fo.grasa ? [[cap(f.grasa.tipo), F * fo.grasa / 100]] : []), ...(fo.azucar ? [['Azúcar', F * fo.azucar / 100]] : []),
        ...fo.otros.filter(o => !/leche|huevo/.test(o.ing)).map(o => [cap(o.ing), F * o.pct / 100, 1])] });
    }
    // temperatura del agua
    const mix = ans.amasado === 'pliegues' ? 'pliegues' : (ans.amasado === 'mano' ? 'mano' : (ans.amasadoraTipo || 'mano'));
    const dT = (ans.amasadoraDT ?? M.DT_MEZCLA[mix]) ?? 1.5;
    const Ttarget = metodo === 'nevera' ? c.Tmasa - 2 : c.Tmasa;
    const prefMass = pref ? F * p.frac * (1 + p.Hp) : 0;
    const liqMass = (fo.liquidos || []).reduce((a, o) => a + F * o.pct / 100, 0);
    const Fmix = pref ? F * (1 - p.frac) : F, Wmix = (pref ? aguaTotal - F * p.frac * p.Hp : aguaTotal) + liqMass;
    let Tw = M.waterTemp({ flour: Fmix, water: Math.max(1, Wmix), Tflour: c.Tc, Ttarget, dT, preferment: prefMass, Tpref: c.Tc });
    const avisos = [];
    const liqTxt = liqMass > 0 ? 'Los líquidos (agua, leche, huevo)' : 'El agua';
    if (Tw < 3) { avisos.push(`${liqTxt} tendrían que estar a ${Tw.toFixed(0)} °C: usa agua de nevera con hielo y enfría la harina, o amasa menos rato.`); Tw = 3; }
    if (Tw > 40) { avisos.push(`El agua saldría a ${Tw.toFixed(0)} °C: no pases de 38 °C y busca un sitio templado para la masa.`); Tw = 38; }
    // levadura pequeña
    const yG = usaLevadura ? F * (pref ? Math.min(p.yP * p.frac, p.y > 0.03 ? p.y : 99) : p.y) / 100 * facLev : 0;
    if (usaLevadura && yG < 1 && !prof.bascula01) avisos.push(`La levadura sale a ${yG.toFixed(2)} g: disuelve 1 g en 20 g de agua y echa ${(yG * 21).toFixed(0)} g de esa mezcla.`);
    const horno = (prof.hornos || []).find(h => h.id === ans.horno) || (prof.hornos || [])[0];
    const bi = bakeInfo(f, prof, horno); avisos.push(...bi.avisos);
    // tolerancia: cuánto antes/después sigue entre 85 % y 120 % del gas
    const tol = tolerance(p.stages, c, p, metodo);
    const steps = p.steps.sort((a, b) => a.t - b.t).map(s => ({ ...s, ...texto(s, f, c, metodo, bi, tol, ans) }));
    const activos = steps.filter(s => s.tipo === 'activo');
    return {
      metodo, posible: true, titulo: meta.titulo, cambio: meta.cambio, confianza: meta.confianza || (metodo === 'masa_madre' ? 'baja' : 'alta'),
      ficha: f.id, items, Tw: round(Tw), twTxt: liqMass > 0 ? 'Líquidos (agua, leche y huevo)' : 'Agua', Ttarget, steps, nActivos: activos.length,
      minutosActivos: activos.reduce((a, s) => a + s.dur, 0),
      inicio: steps[0].t, fin: steps[steps.length - 1].t, avisos, supuestos: supuestos(f), horneado: bi, masa: fo.masa, pct: fo, yInst: p.y, tol,
    };
  }
  function tolerance(stages, c, p, metodo) {
    if (!stages || !p.y) return null;
    try {
      const last = stages[stages.length - 1], step = 0.25;
      const more = stages.slice(0, -1).concat([{ ...last, h: last.h + step }]);
      const g0 = M.simulate(p.y, stages, c.fac).G, g1 = M.simulate(p.y, more, c.fac).G;
      const slope = (g1 - g0) / step;                // gas por hora al final
      if (slope <= 0) return null;
      return { antes: Math.round(0.15 * c.Gt / slope * 60), despues: Math.round(0.2 * c.Gt / slope * 60) };
    } catch (e) { return null; }
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  function texto(s, f, c, metodo, bi, tol, ans) {
    const tolTxt = tol ? ` Margen: hasta ${tol.antes} min antes o ${tol.despues} min después.` : '';
    const T = {
      mezclar: ['Mezclar y amasar', ans.amasado === 'pliegues'
        ? 'Mezcla todo hasta que no quede harina seca (la sal al final). No amases: los pliegues harán el trabajo.'
        : 'Mezcla agua y harina, añade la levadura, y la sal a los 2–5 min. Amasa hasta una masa lisa.', 'Masa lisa, sin harina seca.'],
      mezclar_pref: ['Masa final', 'Mezcla el prefermento con el agua, añade la harina, la levadura y por último la sal. Amasa hasta masa lisa.', 'Masa lisa y elástica.'],
      mezclar_mm: ['Masa final con masa madre', 'Disuelve la masa madre en el agua, añade la harina y luego la sal. Guarda una cucharada de masa en un tarro estrecho y marca su nivel.', 'Masa unida; tarro marcado.'],
      pliegue: ['Pliegues', 'Con la mano mojada, estira un lado de la masa hacia arriba y dóblalo encima; gira el bol y repite 4 veces.', 'La masa gana tensión de una serie a otra.'],
      bloque: ['Fermentación en bloque', 'Tapada, a temperatura de cocina.', c.pizza ? 'Superficie lisa, algo hinchada.' : 'Ha crecido un 50–75 %, burbujas en los bordes, se despega del recipiente.'],
      bloque_mm: ['Fermentación en bloque', 'Tapada. Fíjate más en el tarro que en el reloj.', 'El tarro marca +30–50 % de volumen.'],
      formar: ['Dividir y formar', 'Divide, preforma, deja reposar 10 min y da la forma final con tensión. Ponla en cesta o bandeja.', 'Piezas tensas y lisas.'],
      formar_nevera: ['Formar y a la nevera', 'Forma las piezas, ponlas en cesta o bandeja tapadas y a la nevera.', 'Piezas tensas, bien tapadas.'],
      bolear: ['Bolear', 'Divide en bolas iguales, ciérralas con tensión y colócalas tapadas.', 'Bolas lisas y tensas.'],
      bolear_nevera: ['Bolear y a la nevera', 'Divide en bolas, ciérralas con tensión y guárdalas tapadas en la nevera.', 'Bolas lisas y tensas.'],
      nevera_bandeja: ['A la bandeja y a la nevera', 'Pon la masa en la bandeja aceitada, tápala bien y a la nevera.', '—'],
      nevera: ['En nevera', 'Nada que hacer.', '—'],
      sacar: ['Sacar de la nevera', c.pizza ? 'Saca las bolas para que se atemperen.' : 'Saca la masa de la nevera.', '—'],
      atemperar: ['Atemperar', 'Tapadas, a temperatura de cocina.', 'Bola relajada, +50–80 % de volumen, se estira sin encoger.'],
      bolas: ['Reposo en bolas', 'Tapadas, a temperatura de cocina.' + tolTxt, 'Bola relajada, +50–80 % de volumen, se estira sin encoger.'],
      apresto: ['Fermentación final', 'Tapadas.' + tolTxt, 'Al hundir un dedo, la marca vuelve despacio y no del todo.'],
      precalentar: ['Encender el horno', `Pon el horno a ${bi.txt}${bi.vapor ? ', ' + bi.vapor : ''}. Si tienes piedra o acero, dentro desde ya.`, 'Horno a temperatura.'],
      hornear: [c.pizza ? 'Estirar y hornear' : 'Hornear', `${bi.txt}${bi.vapor ? ', ' + bi.vapor : ''}. ${f.horneado && f.horneado.T_interior ? `Listo con ${f.horneado.T_interior.join('–')} °C dentro.` : ''}`, f.familia === 'pan' ? 'Corteza dorada; suena hueco al golpear la base.' : 'Bien dorada por abajo.'],
      poolish: ['Hacer el poolish', 'Mezcla la harina, el agua y la levadura del poolish. Tapa.', '—'],
      poolish_madura: ['Poolish madurando', 'A temperatura de cocina.', 'Ha duplicado, lleno de burbujas, el centro empieza a ceder.'],
      biga: ['Hacer la biga', 'Mezcla sin amasar: debe quedar en grumos secos. Tapa.', '—'],
      biga_madura: ['Biga madurando', 'En sitio fresco.', 'Olor alcohólico suave; algo más voluminosa.'],
      refresco: ['Refrescar la masa madre', 'Mezcla masa madre, harina y agua en las cantidades del refresco. Marca el nivel del bote.', '—'],
      refresco_madura: ['Masa madre subiendo', 'A temperatura de cocina.', 'Ha duplicado o más y está en el pico (empieza a abombarse).'],
    }[s.clave] || [s.clave, '', ''];
    return { titulo: T[0], texto: T[1], senal: T[2] };
  }

  // ---------------- entrada principal ----------------
  function build(f, ans, prof, opts) {
    const start = new Date(Math.ceil((opts.start || Date.now()) / (5 * MIN)) * 5 * MIN);
    const eatAt = new Date(opts.target);
    const wins = blockedWindows(prof, opts.bloqueos, start, eatAt);
    const ded = ans.dedicacion || 2;
    const ms = new Set((f.fermentacion.metodos || []).map(m => m.split('+')[0]));
    const out = [];
    const tryAdd = p => { if (p) out.push(p); };
    if (ms.has('directa') || ms.has('masa_vieja') || ms.size === 0 || ms.has('masa_madre')) tryAdd(planDirecta(f, ans, prof, start, eatAt, wins));
    if (ded >= 2 && f.familia !== 'enriquecido' || ms.has('nevera')) tryAdd(planNevera(f, ans, prof, start, eatAt, wins));
    if (ded >= 3 || ms.has('poolish')) if (f.familia !== 'enriquecido' && gType(f) !== 'pan_denso') tryAdd(planPref('poolish', f, ans, prof, start, eatAt, wins));
    if ((ded >= 3 && f.familia !== 'enriquecido' && gType(f) !== 'pan_denso') || ms.has('biga')) tryAdd(planPref('biga', f, ans, prof, start, eatAt, wins));
    if (ms.has('masa_madre')) tryAdd(planMasaMadre(f, ans, prof, start, eatAt, wins));
    const ok = out.filter(p => p.posible), ko = out.filter(p => !p.posible);
    // preferidos: los que la ficha propone primero; menos pasos activos con dedicación baja
    const orden = (f.fermentacion.metodos || []).map(m => m.split('+')[0]);
    const rank = p => { const i = orden.indexOf(p.metodo); return i < 0 ? 10 : i; };
    ok.sort((a, b) => (ded <= 1 ? a.nActivos - b.nActivos : 0) || rank(a) - rank(b));
    return { planes: ok.slice(0, 3), descartados: ko, ventana: { start, eatAt }, wins };
  }

  // replanificar en vivo: escala los pasos pasivos restantes
  function replan(plan, idx, factor) {
    const now = Date.now(); let shift = 0;
    const steps = plan.steps.map((s, i) => {
      const n = { ...s, t: new Date(new Date(s.t).getTime() + shift) };
      if (i >= idx && s.tipo === 'pasivo' && /bloque|apresto|bolas|atemperar|madura/.test(s.clave)) {
        const rest = Math.max(0, new Date(n.t).getTime() + s.dur * MIN - now);
        const delta = rest * (factor - 1);
        n.dur = Math.max(5, Math.round(s.dur + delta / MIN)); shift += delta;
      }
      return n;
    });
    return { ...plan, steps };
  }

  return { build, supuestos, formula, replan, blockedWindows, hydration, doughMass, gType, _ctx: ctx };
})();
if (typeof module !== 'undefined') module.exports = Plan;
