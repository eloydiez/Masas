/* Psomares v1 — interfaz. Sin servidor: todo en localStorage. */
(() => {
'use strict';
const VERSION = '1.1.0';
const KEY = 'masas.v1';
const $main = document.getElementById('main');
let RECETAS = [];

// ------------------------------------------------------------ utilidades
function h(tag, at, ...ch) {
  const e = document.createElement(tag);
  if (at) for (const [k, v] of Object.entries(at)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of ch.flat(9)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const clone = o => JSON.parse(JSON.stringify(o));
const pad = n => String(n).padStart(2, '0');
const hhmm = d => { d = new Date(d); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function dayLabel(d) {
  d = new Date(d); const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  const diff = Math.round((b - a) / 864e5);
  if (diff === 0) return 'Hoy'; if (diff === 1) return 'Mañana'; if (diff === -1) return 'Ayer';
  return `${DIAS[d.getDay()]} ${d.getDate()}`;
}
const toLocalInput = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hhmm(d)}`; };
const dur = min => { min = Math.round(min); if (min < 60) return `${min} min`; const hh = Math.floor(min / 60), m = min % 60; return m ? `${hh} h ${m} min` : `${hh} h`; };
const g = (v, d = 0) => (v < 10 && d === 0 && v % 1) ? v.toFixed(1) : v.toFixed(d);
function toast(t) { const e = h('div', { class: 'toast' }, t); document.body.append(e); setTimeout(() => e.remove(), 2600); }

// ------------------------------------------------------------ estado
function perfilNuevo(nombre = 'Casa') {
  return {
    id: 'p' + Date.now().toString(36), nombre, cocina: 21, nevera: 5, levadura: 'fresca', bascula01: false,
    harinas: ['panificable', 'fuerza'], amasadora: 'ninguna',
    horario: { dormir: { desde: '23:30', hasta: '07:30' } },
    hornos: [{ id: 'h' + Date.now().toString(36), nombre: 'Horno de casa', energia: 'electrico', tmax: 250, ventilador: true, vapor: 'ninguno', piedra: 'ninguna', olla: false }],
    masamadre: { estado: 'no', g21: null, log: [] }, calib: { levadura: 1 },
  };
}
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.perfiles && s.perfiles.length) return s; } catch (e) {}
  const p = perfilNuevo(); return { perfiles: [p], activo: p.id, historial: [], marcha: null, notif: false };
}
let S = load();
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
const perfil = () => S.perfiles.find(p => p.id === S.activo) || S.perfiles[0];

// ------------------------------------------------------------ diccionarios
const FAM = {
  pan: ['Pan', 'Hogazas, barras, panes españoles, centeno…'],
  pizza: ['Pizza', 'Redonda o en bandeja'],
  focaccia: ['Focaccia y tortas', 'Focaccia genovesa, alta, tortas de aceite'],
  enriquecido: ['Dulces y masas enriquecidas', 'Brioche, trenza, bollos, ensaimada'],
};
const ATTR = {
  origen: ['¿Qué pan te apetece?', { es: 'Pan español', fuera: 'De fuera (Francia, Alemania, Italia, EE. UU.)' }],
  formato: ['¿Qué pizza?', { redonda: 'Redonda, individual', bandeja: 'En bandeja (al taglio, para cortar)' }],
  cereal: ['¿De qué cereal?', { trigo: 'Trigo', centeno: 'Centeno', mezcla: 'Mezcla trigo y centeno' }],
  miga: ['¿Cómo quieres la miga?', { muy_abierta: 'Muy abierta, alvéolos grandes', abierta: 'Abierta', media: 'Media, regular', cerrada: 'Cerrada y prieta', tierna: 'Tierna y esponjosa', algodonosa: 'Algodonosa, que se deshace', hojaldrada: 'Hojaldrada, en capas' }],
  corteza: ['¿Y la corteza?', { fina_crujiente: 'Fina y crujiente', gruesa_oscura: 'Gruesa y oscura', fina: 'Fina y clara', media: 'Media', blanda: 'Blanda' }],
  sabor: ['¿Qué sabor?', { suave: 'Suave', tostado: 'Tostado, de cereal', ligeramente_acido: 'Ligeramente ácido', acido: 'Ácido, de centeno' }],
  conservacion: ['¿Cuánto tiene que durar?', { media: 'Dos o tres días', larga: 'Una semana o más' }],
  base: ['¿Cómo quieres la base?', { fina_blanda: 'Fina y blanda', fina_crujiente: 'Fina y crujiente', gruesa_esponjosa: 'Gruesa y esponjosa' }],
  borde: ['¿Y el borde?', { alto: 'Alto e hinchado', medio: 'Medio', bajo: 'Bajo' }],
  altura: ['¿Qué grosor?', { fina: 'Fina', media: 'Media', alta: 'Alta' }],
  interior: ['¿Cómo por dentro?', { alveolado: 'Alveolado', tierno: 'Tierno' }],
  aceite: ['¿Cuánto aceite?', { mucho: 'Mucho', medio: 'Normal' }],
  riqueza: ['¿Cómo de rica en mantequilla y huevo?', { ligero: 'Ligera', medio: 'Media', muy_rico: 'Muy rica' }],
  dulzor: ['¿Cómo de dulce?', { poco: 'Poco', medio: 'Medio', mucho: 'Mucho' }],
};
const ORDEN = {
  pan: ['origen', 'cereal', 'miga', 'corteza', 'sabor', 'conservacion'],
  pizza: ['formato', 'base', 'borde'],
  focaccia: ['altura', 'aceite', 'interior'],
  enriquecido: ['riqueza', 'dulzor', 'miga'],
};
const HARINAS = { '00': 'Tipo 00', '0': 'Tipo 0', panificable: 'Panificable (W 150–250)', fuerza: 'De fuerza (W > 300)', floja: 'Floja / repostería', integral: 'Integral de trigo', centeno: 'Centeno', candeal: 'Candeal', semola: 'Sémola de trigo duro', espelta: 'Espelta' };
const AMASADORAS = { ninguna: 'No tengo', planetaria: 'Planetaria (KitchenAid, Kenwood…)', espiral: 'De espiral', brazos: 'De brazos', thermomix: 'Thermomix o robot', panificadora: 'Panificadora' };
const LEVADURAS = { fresca: 'Fresca (de panadero)', seca: 'Seca activa', instantanea: 'Seca de panadero / instantánea' };
const VAPOR = { ninguno: 'Nada', bandeja: 'Bandeja con agua', inyeccion: 'Inyección o depósito de vapor', combi: 'Horno de vapor (combi)' };

function valor(r, k) {
  if (k === 'origen') return r.id.startsWith('es-') ? 'es' : 'fuera';
  if (k === 'formato') return r.estilo === 'bandeja' ? 'bandeja' : 'redonda';
  if (k === 'cereal') return (r.resultado && r.resultado.cereal) || 'trigo';
  return r.resultado ? r.resultado[k] : undefined;
}
function harinaKeys(r) {
  const s = ((r.harina && r.harina.tipos) || []).join(' ').toLowerCase(), k = new Set();
  if (/\b00\b/.test(s)) k.add('00');
  if (/(^|[^0])0($|[^0])/.test(s) && !/type|t65/.test(s.replace(/ 0 /, ''))) k.add('0');
  if (/panificable|type 550|t65|t55|trigo|floja/.test(s)) k.add('panificable');
  if (/fuerza|w > 300/.test(s)) k.add('fuerza');
  if (/integral|1050/.test(s)) k.add('integral');
  if (/centeno/.test(s)) k.add('centeno');
  if (/candeal/.test(s)) k.add('candeal');
  if (/semola/.test(s)) k.add('semola');
  if (/405|floja|poca fuerza/.test(s)) k.add('floja');
  return [...k];
}
const necesitaMM = r => (r.fermentacion.metodos || []).every(m => m.startsWith('masa_madre'));
const conf = c => h('span', { class: 'tag ' + (c || 'media') }, 'fiabilidad ' + (c || 'media'));

// ------------------------------------------------------------ navegación
let TAB = 'hacer';
const pilaTabs = [];
function go(tab, desdeAtras) {
  if (!desdeAtras && tab !== TAB) pilaTabs.push(TAB);
  TAB = tab;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  render(); window.scrollTo(0, 0);
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));
document.getElementById('perfilBtn').onclick = () => go('perfil');
function render() {
  document.getElementById('perfilBtn').textContent = '👤 ' + perfil().nombre;
  $main.replaceChildren();
  ({ hacer: vHacer, marcha: vMarcha, recetas: vRecetas, madre: vMadre, perfil: vPerfil })[TAB]();
}

// ------------------------------------------------------------ conversación
let C = convNueva();
function convNueva() { return { paso: 'familia', fam: null, resp: {}, preg: [], ficha: null, ans: {}, hist: [], res: null, planIdx: null }; }
function avanzar(mod) { C.hist.push(JSON.stringify({ ...C, hist: [], res: null })); mod(); C.paso = siguiente(); render(); window.scrollTo(0, 0); }
function atras() {
  if (!C.hist.length) return;
  const prev = JSON.parse(C.hist.pop()); const hist = C.hist; C = { ...prev, hist, res: null };
  if (C.paso === 'plan' || C.paso === 'alternativas') C.paso = 'tiempo';
  render();
}
function candidatos() {
  let rs = RECETAS.filter(r => r.familia === C.fam);
  for (const k of C.preg) {
    const v = C.resp[k]; if (!v || v === 'igual') continue;
    rs = rs.filter(r => { const x = valor(r, k); return x === v || x === undefined; });
  }
  const score = r => C.preg.reduce((a, k) => a + (C.resp[k] && C.resp[k] !== 'igual' && valor(r, k) === C.resp[k] ? 1 : 0), 0);
  return rs.sort((a, b) => score(b) - score(a));
}
function attrPendiente() {
  const rs = candidatos();
  for (const k of ORDEN[C.fam] || []) {
    if (C.preg.includes(k)) continue;
    const vals = new Set(rs.map(r => valor(r, k)).filter(v => v !== undefined));
    if (vals.size >= 2) return k;
  }
  return null;
}
function siguiente() {
  const f = C.ficha && RECETAS.find(r => r.id === C.ficha);
  switch (C.paso) {
    case 'familia': case 'attr': return attrPendiente() ? 'attr' : 'elegir';
    case 'elegir': return 'cantidad';
    case 'cantidad': return 'harina';
    case 'harina': return 'amasado';
    case 'amasado': return (perfil().hornos || []).length > 1 ? 'horno' : 'dedicacion';
    case 'horno': return 'dedicacion';
    case 'dedicacion': return 'tiempo';
    case 'tiempo': return 'alternativas';
    case 'alternativas': return 'plan';
  }
  return C.paso;
}
function cab(n, total = 9) {
  const order = ['familia', 'attr', 'elegir', 'cantidad', 'harina', 'amasado', 'dedicacion', 'tiempo', 'alternativas', 'plan'];
  const i = Math.max(0, order.indexOf(C.paso === 'horno' ? 'amasado' : C.paso));
  return [
    C.hist.length ? h('button', { class: 'back', onclick: atras }, '‹ Atrás') : null,
    h('div', { class: 'steps' }, order.map((_, j) => h('i', { class: j <= i ? 'on' : '' }))),
  ];
}
function opcion(titulo, sub, on, sel, dim) { return h('button', { class: 'opt' + (sel ? ' sel' : '') + (dim ? ' dim' : ''), onclick: on }, h('b', null, titulo), sub ? h('small', null, sub) : null); }

function vHacer() {
  if (C.ficha && !RECETAS.find(r => r.id === C.ficha)) C = convNueva();
  const fn = { familia: pFamilia, attr: pAttr, elegir: pElegir, cantidad: pCantidad, harina: pHarina, amasado: pAmasado, horno: pHorno, dedicacion: pDedicacion, tiempo: pTiempo, alternativas: pAlternativas, plan: pPlan }[C.paso];
  fn();
}
function pFamilia() {
  if (S.marcha) $main.append(h('div', { class: 'info' }, 'Tienes una masa en marcha. ', h('a', { href: '#', onclick: e => { e.preventDefault(); go('marcha'); } }, 'Ver')));
  $main.append(h('div', { class: 'q' }, '¿Qué quieres hacer?'),
    h('div', { class: 'opts' },
      Object.entries(FAM).map(([k, [t, s]]) => opcion(t, s, () => avanzar(() => { C.fam = k; }))),
      opcion('Crear masa madre', 'Guía día a día desde cero', () => go('madre'))));
}
function pAttr() {
  const k = attrPendiente(); if (!k) { C.paso = 'elegir'; return pElegir(); }
  const rs = candidatos(); const [q, labels] = ATTR[k];
  const vals = [...new Set(rs.map(r => valor(r, k)).filter(v => v !== undefined))];
  $main.append(...cab(), h('div', { class: 'q' }, q), h('div', { class: 'opts' },
    vals.map(v => opcion(labels[v] || v, `${rs.filter(r => valor(r, k) === v).length} receta(s)`, () => avanzar(() => { C.preg.push(k); C.resp[k] = v; C.paso = 'attr'; }))),
    opcion('Me da igual', null, () => avanzar(() => { C.preg.push(k); C.resp[k] = 'igual'; C.paso = 'attr'; }))));
}
function pElegir() {
  const rs = candidatos(); const P = perfil(); const mm = P.masamadre.estado === 'activa';
  $main.append(...cab(), h('div', { class: 'q' }, rs.length === 1 ? 'Esta es la que encaja:' : `Encajan ${rs.length}. Elige una:`),
    h('div', { class: 'opts' }, rs.map(r => {
      const bloq = necesitaMM(r) && !mm && (valor(r, 'cereal') !== 'trigo');
      const sub = [r.descripcion, necesitaMM(r) && !mm ? (bloq ? ' · Necesita masa madre: el centeno sin acidez da miga pegajosa. Créala primero.' : ' · Original con masa madre; te propongo la versión con levadura.') : ''].join('');
      return opcion(r.nombre, sub, bloq ? () => toast('Primero crea la masa madre (pestaña Masa madre).') : () => avanzar(() => elegirFicha(r)), false, bloq);
    })));
}
function elegirFicha(r) {
  C.ficha = r.id; C.fam = r.familia; const P = perfil();
  const pz = r.pieza || {};
  const pref = r.estilo === 'mollete' ? 100 : r.familia === 'enriquecido' ? 600 : 900;
  const pesoDef = Array.isArray(pz.g) ? pz.g.filter(x => x).reduce((a, b) => Math.abs(b - pref) < Math.abs(a - pref) ? b : a) : (pz.g || pref);
  C.ans = { cantidad: r.familia === 'pizza' && r.estilo !== 'bandeja' ? { n: 4, diam: 30 } : (r.familia === 'focaccia' || r.estilo === 'bandeja') ? { n: 1, bandeja: [30, 40] } : { n: r.estilo === 'mollete' ? 8 : 1, peso: pesoDef } };
  for (const k of ['miga', 'base', 'altura', 'interior', 'borde'])
    if (C.resp[k] && C.resp[k] !== 'igual' && valor(r, k) === undefined) C.ans[k] = C.resp[k];
  C.ans.cocina = P.cocina;
}
function ficha() { return RECETAS.find(r => r.id === C.ficha); }

function pCantidad() {
  const f = ficha(), q = clone(C.ans.cantidad); const box = h('div', { class: 'card' });
  const num = (lab, key, val, min, max, step = 1) => [h('label', null, lab), h('input', { type: 'number', inputmode: 'decimal', min, max, step, value: val, oninput: e => { q[key] = +e.target.value; upd(); } })];
  const info = h('p', { class: 'muted small' });
  function upd() {
    const ans = { ...C.ans, cantidad: q }; const fo = Plan.formula(f, ans);
    info.textContent = `Masa total ≈ ${Math.round(fo.masa.masa)} g (${Math.round(fo.masa.porPieza)} g por ${f.familia === 'pizza' && f.estilo !== 'bandeja' ? 'bola' : 'pieza'}) · harina ${Math.round(fo.harina)} g`;
  }
  if (f.familia === 'pizza' && f.estilo !== 'bandeja') box.append(...num('¿Cuántas pizzas?', 'n', q.n, 1, 30), ...num('Diámetro (cm)', 'diam', q.diam, 18, 40));
  else if (f.familia === 'focaccia' || f.estilo === 'bandeja') {
    box.append(...num('¿Cuántas bandejas?', 'n', q.n, 1, 6),
      h('label', null, 'Medida de la bandeja (cm)'), h('div', { class: 'row' },
        h('input', { type: 'number', value: q.bandeja[0], oninput: e => { q.bandeja[0] = +e.target.value; upd(); } }), '×',
        h('input', { type: 'number', value: q.bandeja[1], oninput: e => { q.bandeja[1] = +e.target.value; upd(); } })));
    if (f.familia === 'focaccia' && !f.resultado.altura) box.append(h('label', null, 'Grosor'), h('select', { onchange: e => { C.ans.altura = e.target.value; upd(); } },
      ['fina', 'media', 'alta'].map(v => h('option', { value: v, selected: (C.ans.altura || 'media') === v }, ATTR.altura[1][v]))));
  } else box.append(...num('¿Cuántas piezas?', 'n', q.n, 1, 20), ...num('Peso de masa por pieza (g)', 'peso', q.peso, 50, 3000, 10));
  box.append(info); upd();
  $main.append(...cab(), h('div', { class: 'q' }, f.nombre), h('p', { class: 'muted' }, '¿Cuánto quieres hacer?'), box,
    h('button', { class: 'btn', onclick: () => avanzar(() => { C.ans.cantidad = q; }) }, 'Seguir'));
}
function pHarina() {
  const f = ficha(), P = perfil(), pide = harinaKeys(f), tengo = P.harinas || [];
  const ok = pide.filter(k => tengo.includes(k));
  const sust = { '00': ['0', 'panificable', 'fuerza'], '0': ['00', 'panificable', 'fuerza'], panificable: ['0', 'fuerza', '00'], fuerza: ['panificable', '0'], candeal: ['panificable', 'floja'], floja: ['panificable'], semola: [], centeno: [], integral: [] };
  const alt = [...new Set(pide.flatMap(k => sust[k] || []))].filter(k => tengo.includes(k) && !ok.includes(k));
  const notas = { fuerza: 'Con harina de fuerza la masa aguanta más agua: te sumo un 2 %.', floja: 'Con harina floja reduce el agua un 3 % y amasa menos.', panificable: '', '0': '', '00': '' };
  $main.append(...cab(), h('div', { class: 'q' }, '¿Qué harina vas a usar?'),
    h('p', { class: 'muted small' }, 'La receta pide: ', ((f.harina && f.harina.tipos) || []).join(', '), f.harina && f.harina.W ? ` · W ${[].concat(f.harina.W).join('–')}` : ''),
    h('div', { class: 'opts' },
      ok.map(k => opcion(HARINAS[k], 'Es la que pide la receta', () => avanzar(() => { C.ans.harina = k; C.ans.ajusteAgua = 0; }))),
      alt.map(k => opcion(HARINAS[k], 'Sustituto razonable. ' + (notas[k] || ''), () => avanzar(() => { C.ans.harina = k; C.ans.ajusteAgua = k === 'fuerza' ? 2 : k === 'floja' ? -3 : 0; }))),
      !ok.length && !alt.length ? h('div', { class: 'aviso' }, 'No tienes en tu perfil ninguna harina que sirva para esta receta. Puedes comprarla o seguir igualmente.') : null,
      opcion('Compraré la que pide', null, () => avanzar(() => { C.ans.harina = pide[0]; C.ans.ajusteAgua = 0; }))));
}
function pAmasado() {
  const f = ficha(), P = perfil(), ap = (f.amasado && f.amasado.alternativa_pliegues) || {};
  const tieneMaq = P.amasadora && P.amasadora !== 'ninguna';
  $main.append(...cab(), h('div', { class: 'q' }, '¿Cómo vas a amasar?'),
    f.amasado && f.amasado.desarrollo ? h('p', { class: 'muted small' }, `La receta pide desarrollo ${f.amasado.desarrollo} del gluten.`) : null,
    h('div', { class: 'opts' },
      tieneMaq ? opcion('Con la amasadora', AMASADORAS[P.amasadora], () => avanzar(() => { C.ans.amasado = 'amasadora'; C.ans.amasadoraTipo = P.amasadora; })) : null,
      opcion('A mano', 'Amasado clásico sobre la mesa', () => avanzar(() => { C.ans.amasado = 'mano'; })),
      ap.posible !== false
        ? opcion('Sin amasar: pliegues y reposos', 'Mezclas, y cada 30 min haces una serie de pliegues (2 min). Mismo resultado en masas hidratadas; más tiempo de presencia, cero esfuerzo. ' + (ap.motivo || ''), () => avanzar(() => { C.ans.amasado = 'pliegues'; }))
        : h('div', { class: 'aviso' }, 'Pliegues y reposos no sirven aquí: ', ap.motivo || 'la masa necesita amasado intenso.')));
}
function pHorno() {
  const P = perfil();
  $main.append(...cab(), h('div', { class: 'q' }, '¿En qué horno?'), h('div', { class: 'opts' },
    P.hornos.map(o => opcion(o.nombre, `${o.tmax} °C · ${o.ventilador ? 'con' : 'sin'} ventilador · vapor: ${VAPOR[o.vapor] || o.vapor}`, () => avanzar(() => { C.ans.horno = o.id; })))));
}
function pDedicacion() {
  $main.append(...cab(), h('div', { class: 'q' }, '¿Cuánta dedicación?'), h('div', { class: 'opts' },
    opcion('Lo mínimo', 'Pocos pasos, lo más sencillo', () => avanzar(() => { C.ans.dedicacion = 1; })),
    opcion('Normal', 'También versiones con nevera', () => avanzar(() => { C.ans.dedicacion = 2; })),
    opcion('Me lo curro', 'También poolish o biga la víspera: más sabor', () => avanzar(() => { C.ans.dedicacion = 3; }))));
}
function pTiempo() {
  const f = ficha(), P = perfil();
  const def = new Date();
  if (f.familia === 'pizza') { def.setHours(21, 0, 0, 0); if (def - Date.now() < 6 * 36e5) def.setDate(def.getDate() + 1); }
  else { def.setDate(def.getDate() + 1); def.setHours(14, 0, 0, 0); }
  const t = C.ans.tiempo || { comer: toLocalInput(def), desde: toLocalInput(new Date()), bloqueos: [] };
  const bl = h('div');
  function pintaBloq() {
    bl.replaceChildren(...t.bloqueos.map((b, i) => h('div', { class: 'card' },
      h('label', null, 'No estoy desde'), h('input', { type: 'datetime-local', value: b.from, onchange: e => b.from = e.target.value }),
      h('label', null, 'hasta'), h('input', { type: 'datetime-local', value: b.to, onchange: e => b.to = e.target.value }),
      h('button', { class: 'btn ghost', onclick: () => { t.bloqueos.splice(i, 1); pintaBloq(); } }, 'Quitar'))));
  }
  pintaBloq();
  const s = P.horario.dormir;
  $main.append(...cab(), h('div', { class: 'q' }, '¿Cuándo lo quieres?'), h('div', { class: 'card' },
    h('label', null, f.familia === 'pizza' ? 'Hora de cenar (primera pizza)' : 'Listo para comer a las'),
    h('input', { type: 'datetime-local', value: t.comer, onchange: e => t.comer = e.target.value }),
    h('label', null, 'Puedo empezar desde'),
    h('input', { type: 'datetime-local', value: t.desde, onchange: e => t.desde = e.target.value }),
    h('label', null, 'Temperatura de la cocina (°C)'),
    h('input', { type: 'number', value: C.ans.cocina ?? P.cocina, step: 0.5, onchange: e => C.ans.cocina = +e.target.value }),
    h('p', { class: 'muted small' }, `Duermes de ${s.desde} a ${s.hasta} (se cambia en Perfil): ahí no pondré nada que hacer.`)),
    h('h3', null, 'Horas en que no estás'), bl,
    h('button', { class: 'btn sec', onclick: () => { const a = new Date(); a.setDate(a.getDate() + 1); a.setHours(8, 0, 0, 0); const b = new Date(a); b.setHours(17, 0, 0, 0); t.bloqueos.push({ from: toLocalInput(a), to: toLocalInput(b) }); pintaBloq(); } }, '+ Añadir hueco ocupado'),
    h('p'), h('button', { class: 'btn', onclick: () => {
      if (new Date(t.comer) <= new Date(t.desde)) return toast('La hora de comer tiene que ser posterior.');
      avanzar(() => { C.ans.tiempo = t; });
    } }, 'Calcular'));
}
function ansMotor() {
  const a = { ...C.ans };
  return a;
}
function fichaAjustada() {
  return clone(ficha());
}
function calcula() {
  const f = fichaAjustada(), t = C.ans.tiempo;
  return Plan.build(f, ansMotor(), perfil(), { start: new Date(t.desde), target: new Date(t.comer), bloqueos: t.bloqueos.filter(b => b.from && b.to) });
}
function pAlternativas() {
  if (!C.res) C.res = calcula();
  const r = C.res, f = ficha();
  $main.append(...cab(), h('div', { class: 'q' }, r.planes.length ? (r.planes.length > 1 ? `${r.planes.length} formas de hacerlo` : 'Así cabe:') : 'No cabe en ese horario'));
  r.planes.forEach((p, i) => $main.append(h('div', { class: 'card alt', onclick: () => avanzar(() => { C.planIdx = i; }) },
    h('h3', null, p.titulo), h('p', { class: 'muted small' }, p.cambio),
    h('div', { class: 'kv' },
      h('span', null, 'Empiezas'), h('span', null, `${dayLabel(p.inicio)} ${hhmm(p.inicio)}`),
      h('span', null, 'Te ocupa'), h('span', null, `${p.nActivos} ratos, ${dur(p.minutosActivos)} en total`),
      h('span', null, 'Levadura'), h('span', null, p.metodo === 'masa_madre' ? 'masa madre' : `${g(p.items.flatMap(x => x.lista).filter(l => /^Levadura/.test(l[0])).reduce((a, l) => a + l[1], 0), 1)} g ${perfil().levadura}`)),
    p.confianza === 'baja' ? h('div', { class: 'aviso' }, 'Tiempo poco seguro: guíate por la señal de cada paso.') : null)));
  if (r.descartados.length) $main.append(h('details', null, h('summary', null, 'Opciones descartadas'), r.descartados.map(d => h('p', { class: 'small muted' }, d.motivo))));
  if (!r.planes.length) $main.append(h('p', null, 'Prueba a retrasar la hora de comer o a empezar antes.'), h('button', { class: 'btn', onclick: atras }, 'Cambiar horario'));
}
function pPlan() {
  if (!C.res) C.res = calcula();
  const p = C.res.planes[C.planIdx]; if (!p) { C.paso = 'alternativas'; return render(); }
  $main.append(...cab(), vistaPlan(p, ficha()),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => empezar(p) }, 'Empezar'),
      h('button', { class: 'btn sec', onclick: () => ics(p, ficha()) }, 'Al calendario')));
}
function vistaPlan(p, f) {
  const fr = h('div');
  fr.append(h('h2', null, f.nombre), h('p', { class: 'muted' }, p.titulo, ' · ', p.masa.desc));
  for (const a of p.avisos) fr.append(h('div', { class: 'aviso' }, a));
  if (p.supuestos && p.supuestos.length) fr.append(h('div', { class: 'info small' }, `La fuente no da ${p.supuestos.join(' ni ')}: uso el valor típico del estilo. Ajústalo con tu experiencia.`));
  for (const gr of p.items) fr.append(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, gr.grupo),
    h('table', null, gr.lista.map(([n, v, d]) => h('tr', null, h('td', null, n), h('td', { class: 'n' }, `${v < 10 ? v.toFixed(d ?? 1) : Math.round(v)} g`))))));
  fr.append(h('div', { class: 'info' }, `${p.twTxt || 'Agua'} a ${p.Tw} °C para que la masa salga a unos ${p.Ttarget} °C.`));
  const fo = p.pct;
  fr.append(h('details', null, h('summary', null, 'Porcentajes panaderos'), h('table', null,
    h('tr', null, h('td', null, 'Harina'), h('td', { class: 'n' }, '100 %')),
    h('tr', null, h('td', null, 'Hidratación total'), h('td', { class: 'n' }, `${fo.agua.toFixed(0)} %`)),
    h('tr', null, h('td', null, 'Sal'), h('td', { class: 'n' }, `${fo.sal.toFixed(1)} %`)),
    fo.grasa ? h('tr', null, h('td', null, 'Grasa'), h('td', { class: 'n' }, `${fo.grasa.toFixed(0)} %`)) : null,
    fo.azucar ? h('tr', null, h('td', null, 'Azúcar'), h('td', { class: 'n' }, `${fo.azucar.toFixed(0)} %`)) : null,
    p.metodo !== 'masa_madre' ? h('tr', null, h('td', null, 'Levadura instantánea equiv. (masa final)'), h('td', { class: 'n' }, `${p.yInst.toFixed(2)} %`)) : null)));
  fr.append(h('h3', null, 'Horario'), lineaTiempo(p.steps));
  if (f.notas) fr.append(h('details', null, h('summary', null, 'Notas de la receta'), [].concat(f.notas).map(n => h('p', { class: 'small' }, n))));
  if (f.fuentes) fr.append(h('details', null, h('summary', null, 'Fuentes'), f.fuentes.map(s => h('p', { class: 'small' }, s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.nombre) : s.nombre, ' ', conf(s.confianza)))));
  return fr;
}
function lineaTiempo(steps, now, done) {
  const ul = h('ul', { class: 'tl' }); let dia = '';
  steps.forEach((s, i) => {
    const d = dayLabel(s.t); if (d !== dia) { dia = d; ul.append(h('li', { class: 'day' }, d)); }
    const cls = (s.tipo === 'activo' ? 'act' : 'pas') + (done && done.includes(i) ? ' done' : '') + (now === i ? ' now' : '');
    ul.append(h('li', { class: cls }, h('span', { class: 'h' }, hhmm(s.t)), h('div', null,
      h('div', { class: 't' }, s.tipo === 'activo' ? '► ' : '', s.titulo, h('span', { class: 'muted small' }, ` · ${dur(s.dur)}`)),
      s.tipo === 'activo' && s.texto ? h('div', { class: 'small' }, s.texto) : null,
      s.senal && s.senal !== '—' ? h('div', { class: 'small muted' }, 'Señal: ', s.senal) : null)));
  });
  return ul;
}

// ------------------------------------------------------------ calendario (.ics)
function ics(p, f) {
  const z = d => { d = new Date(d); return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
  const esc = s => String(s).replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Psomares//ES'];
  p.steps.filter(s => s.tipo === 'activo').forEach((s, i) => {
    const a = new Date(s.t), b = new Date(a.getTime() + Math.max(5, s.dur) * 6e4);
    L.push('BEGIN:VEVENT', `UID:${z(a)}-${i}@psomares`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(a)}`, `DTEND:${z(b)}`,
      `SUMMARY:${esc(f.nombre + ': ' + s.titulo)}`, `DESCRIPTION:${esc(s.texto + (s.senal && s.senal !== '—' ? '\nSeñal: ' + s.senal : ''))}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(s.titulo)}`, 'TRIGGER:-PT0M', 'END:VALARM', 'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  const a = h('a', { href: URL.createObjectURL(new Blob([L.join('\r\n')], { type: 'text/calendar' })), download: f.id + '.ics' });
  document.body.append(a); a.click(); a.remove();
}

// ------------------------------------------------------------ en marcha
const revive = p => ({ ...p, steps: p.steps.map(s => ({ ...s, t: new Date(s.t) })), inicio: new Date(p.inicio), fin: new Date(p.fin) });
function empezar(p) {
  if (S.marcha && !confirm('Ya hay una masa en marcha. ¿La sustituyo?')) return;
  S.marcha = { id: 'm' + Date.now().toString(36), ficha: C.ficha, ans: clone(C.ans), plan: clone(p), hechos: [], avisados: [], empezado: new Date().toISOString() };
  save(); pedirNotif(); go('marcha');
}
async function pedirNotif() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) {} }
}
let wake = null;
async function pedirWake() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => wake = null); } } catch (e) {} }
function pitido() {
  try { const ac = new (window.AudioContext || window.webkitAudioContext)(); [0, .35, .7].forEach(t => { const o = ac.createOscillator(), gg = ac.createGain(); o.frequency.value = 880; o.connect(gg); gg.connect(ac.destination); gg.gain.setValueAtTime(.25, ac.currentTime + t); gg.gain.exponentialRampToValueAtTime(.001, ac.currentTime + t + .3); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + .3); }); } catch (e) {}
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
}
async function notificar(titulo, cuerpo, tag) {
  pitido();
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { const reg = await navigator.serviceWorker.ready; reg.showNotification(titulo, { body: cuerpo, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', requireInteraction: true, vibrate: [300, 150, 300] }); }
  catch (e) { try { new Notification(titulo, { body: cuerpo, tag }); } catch (e2) {} }
}
function vigilar() {
  const m = S.marcha; if (!m) return;
  const p = revive(m.plan), now = Date.now(); let cambio = false;
  p.steps.forEach((s, i) => {
    if (s.tipo !== 'activo' || m.hechos.includes(i) || m.avisados.includes(i)) return;
    if (s.t.getTime() <= now + 15e3 && s.t.getTime() > now - 3 * 36e5) {
      m.avisados.push(i); cambio = true;
      const f = RECETAS.find(r => r.id === m.ficha);
      notificar(`${s.titulo} · ${f ? f.nombre : ''}`, s.texto, m.id + '-' + i);
    }
  });
  if (cambio) save();
  if (TAB === 'marcha') pintaReloj();
}
setInterval(vigilar, 5000);

let relojEl = null;
function vMarcha() {
  const m = S.marcha;
  if (!m) {
    $main.append(h('h2', null, 'En marcha'), h('p', { class: 'muted' }, 'No hay ninguna masa en marcha.'), h('button', { class: 'btn', onclick: () => go('hacer') }, 'Hacer algo'));
    return vHistorial();
  }
  pedirWake();
  const f = RECETAS.find(r => r.id === m.ficha), p = revive(m.plan);
  const idx = p.steps.findIndex((s, i) => s.tipo === 'activo' && !m.hechos.includes(i));
  const pasActual = (() => { const now = Date.now(); let k = -1; p.steps.forEach((s, i) => { if (s.tipo === 'pasivo' && s.t <= now && now < s.t.getTime() + s.dur * 6e4) k = i; }); return k; })();
  $main.append(h('h2', null, f.nombre), h('p', { class: 'muted small' }, p.titulo));
  if ('Notification' in window && Notification.permission !== 'granted') $main.append(h('div', { class: 'aviso' }, 'Activa las notificaciones para que te avise. ', h('button', { class: 'btn sec', onclick: async () => { await pedirNotif(); render(); } }, 'Activar')));
  $main.append(h('div', { class: 'info small' }, 'Avisa mientras la app esté abierta o en segundo plano reciente. Para ir sobre seguro, usa también «Al calendario».'));
  if (idx >= 0) {
    const s = p.steps[idx];
    relojEl = h('div', { class: 'big' });
    $main.append(h('div', { class: 'card center' }, h('div', { class: 'muted' }, 'Próximo paso'), h('div', { class: 'q' }, s.titulo), relojEl,
      h('div', { class: 'muted' }, `${dayLabel(s.t)} a las ${hhmm(s.t)}`), h('p', { style: 'text-align:left' }, s.texto),
      s.senal && s.senal !== '—' ? h('p', { class: 'small muted', style: 'text-align:left' }, 'Señal: ', s.senal) : null,
      h('button', { class: 'btn ok', onclick: () => { m.hechos.push(idx); save(); render(); } }, 'Hecho')));
    pintaReloj();
  } else {
    $main.append(h('div', { class: 'card center' }, h('div', { class: 'q' }, '¡Terminado!'), h('p', null, 'Cuéntame cómo ha salido para afinar la próxima vez.')), feedback(m, f));
  }
  if (pasActual >= 0) {
    const s = p.steps[pasActual];
    $main.append(h('div', { class: 'card' }, h('b', null, s.titulo), h('p', { class: 'small' }, 'Señal: ', s.senal),
      h('p', { class: 'small muted' }, '¿Cómo va comparado con lo previsto?'),
      h('div', { class: 'row' },
        h('button', { class: 'btn sec', onclick: () => ajustar(pasActual, 0.8) }, 'Va más rápido'),
        h('button', { class: 'btn sec', onclick: () => toast('Perfecto, sigue el plan.') }, 'Va bien'),
        h('button', { class: 'btn sec', onclick: () => ajustar(pasActual, 1.25) }, 'Va más lento'))));
  }
  $main.append(h('h3', null, 'Plan completo'), lineaTiempo(p.steps, pasActual >= 0 ? pasActual : idx, m.hechos));
  $main.append(h('details', null, h('summary', null, 'Ingredientes'), p.items.map(gr => h('div', { class: 'card' }, h('b', null, gr.grupo),
    h('table', null, gr.lista.map(([n, v, d]) => h('tr', null, h('td', null, n), h('td', { class: 'n' }, `${v < 10 ? v.toFixed(d ?? 1) : Math.round(v)} g`))))))),
    h('p', { class: 'info small' }, `${p.twTxt || 'Agua'} a ${p.Tw} °C.`));
  $main.append(h('p'), h('div', { class: 'row' },
    h('button', { class: 'btn sec', onclick: () => ics(p, f) }, 'Al calendario'),
    h('button', { class: 'btn ghost', onclick: () => { if (confirm('¿Abandonar esta masa?')) { archivar(m, null); render(); } } }, 'Abandonar')));
}
function pintaReloj() {
  const m = S.marcha; if (!m || !relojEl || !document.body.contains(relojEl)) return;
  const p = revive(m.plan); const idx = p.steps.findIndex((s, i) => s.tipo === 'activo' && !m.hechos.includes(i)); if (idx < 0) return;
  const ms = p.steps[idx].t - Date.now();
  if (ms <= 0) { relojEl.textContent = '¡Ahora!'; relojEl.style.color = 'var(--acc)'; return; }
  const s = Math.floor(ms / 1000), hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
  relojEl.textContent = hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}
setInterval(pintaReloj, 1000);
function ajustar(i, factor) {
  const m = S.marcha; const p = revive(m.plan);
  const np = Plan.replan(p, i, factor);
  m.plan = clone(np); m.avisados = m.avisados.filter(k => k < i); save();
  toast(factor < 1 ? 'Adelanto los siguientes pasos.' : 'Retraso los siguientes pasos.'); render();
}
function feedback(m, f) {
  const r = { ferm: null, miga: null, otra: null };
  const q = (txt, key, ops) => h('div', { class: 'card' }, h('b', null, txt), h('div', { class: 'opts', style: 'margin-top:8px' },
    ops.map(([v, l]) => { const b = opcion(l, null, () => { r[key] = v; b.parentNode.querySelectorAll('.opt').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); }); return b; })));
  return h('div', null,
    q('¿Cómo fue la fermentación?', 'ferm', [['corta', 'Se quedó corta (poco volumen, miga apretada)'], ['bien', 'En su punto'], ['pasada', 'Se pasó (se aplanó, olor fuerte)']]),
    q('¿La miga o la textura?', 'miga', [['peor', 'Peor de lo que buscaba'], ['bien', 'Como buscaba'], ['mejor', 'Mejor']]),
    q('¿La repetirías igual?', 'otra', [['si', 'Sí'], ['cambios', 'Con cambios'], ['no', 'No']]),
    h('label', null, 'Notas (opcional)'), h('textarea', { rows: 2, oninput: e => r.notas = e.target.value }),
    h('p'), h('button', { class: 'btn', onclick: () => {
      const P = perfil();
      if (r.ferm === 'corta') P.calib.levadura = Math.max(0.5, P.calib.levadura * 0.87);
      if (r.ferm === 'pasada') P.calib.levadura = Math.min(2, P.calib.levadura * 1.15);
      archivar(m, r); toast(r.ferm && r.ferm !== 'bien' ? `Ajustado: tu factor de fermentación es ×${P.calib.levadura.toFixed(2)}` : 'Guardado.'); render();
    } }, 'Guardar'));
}
function archivar(m, fb) {
  S.historial.unshift({ id: m.id, ficha: m.ficha, ans: m.ans, fecha: new Date().toISOString(), titulo: m.plan.titulo, metodo: m.plan.metodo, fb });
  S.historial = S.historial.slice(0, 100); S.marcha = null; save();
}
function vHistorial() {
  if (!S.historial.length) return;
  $main.append(h('h3', null, 'Historial'), h('div', { class: 'card' }, S.historial.map(x => {
    const f = RECETAS.find(r => r.id === x.ficha);
    return h('div', { class: 'list-item' }, h('div', null, h('b', null, f ? f.nombre : x.ficha), h('div', { class: 'small muted' },
      `${new Date(x.fecha).toLocaleDateString('es-ES')} · ${x.titulo}`, x.fb ? ` · fermentación ${x.fb.ferm || '?'}` : ' · abandonada', x.fb && x.fb.notas ? ` · ${x.fb.notas}` : '')),
      f ? h('button', { class: 'btn sec', onclick: () => repetir(x) }, 'Repetir') : null);
  })));
}
function repetir(x) {
  const f = RECETAS.find(r => r.id === x.ficha);
  C = convNueva(); C.fam = f.familia; C.ficha = f.id; C.ans = clone(x.ans); delete C.ans.tiempo; C.paso = 'tiempo';
  C.hist = [JSON.stringify({ ...convNueva(), paso: 'familia' })];
  go('hacer');
}

// ------------------------------------------------------------ recetas
let filtroR = '';
let fichaVista = null;
function vRecetas() {
  if (fichaVista) return vFicha(RECETAS.find(r => r.id === fichaVista));
  const inp = h('input', { type: 'search', placeholder: 'Buscar…', value: filtroR, oninput: e => { filtroR = e.target.value; lista(); } });
  const cont = h('div');
  function lista() {
    const t = filtroR.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    cont.replaceChildren(...Object.entries(FAM).map(([k, [tit]]) => {
      const rs = RECETAS.filter(r => r.familia === k && (!t || (r.nombre + ' ' + r.descripcion + ' ' + r.estilo).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').includes(t)));
      if (!rs.length) return '';
      return h('div', null, h('h3', null, tit), h('div', { class: 'card' }, rs.map(r => h('div', { class: 'list-item', onclick: () => { fichaVista = r.id; render(); window.scrollTo(0, 0); } },
        h('div', null, h('b', null, r.nombre), h('div', { class: 'small muted' }, r.descripcion)), conf(r.confianza)))));
    }));
  }
  lista();
  $main.append(h('h2', null, `Recetas (${RECETAS.length})`), inp, cont);
}
function vFicha(r) {
  const fe = r.fermentacion || {}, ho = r.horneado || {};
  const rng = v => v == null ? '—' : [].concat(v).join('–');
  const T = ho.T && typeof ho.T === 'object' && !Array.isArray(ho.T) ? Object.entries(ho.T).map(([k, v]) => `${k} ${rng(v)}`).join(', ') : rng(ho.T);
  const ap = (r.amasado && r.amasado.alternativa_pliegues) || {};
  $main.append(h('button', { class: 'back', onclick: () => { fichaVista = null; render(); } }, '‹ Recetas'),
    h('h2', null, r.nombre), h('p', null, r.descripcion), conf(r.confianza),
    h('div', { class: 'card' }, h('div', { class: 'kv' },
      h('span', null, 'Harina'), h('span', null, ((r.harina && r.harina.tipos) || []).join(', ') + (r.harina && r.harina.W ? ` (W ${rng(r.harina.W)})` : '')),
      h('span', null, 'Agua'), h('span', null, `${rng(r.agua_pct)} %`),
      h('span', null, 'Sal'), h('span', null, `${rng(r.sal_pct)} %`),
      r.grasa ? [h('span', null, 'Grasa'), h('span', null, `${r.grasa.tipo} ${rng(r.grasa.pct)} %`)] : null,
      r.azucar_pct ? [h('span', null, 'Azúcar'), h('span', null, `${rng(r.azucar_pct)} %`)] : null,
      (r.otros || []).length ? [h('span', null, 'Otros'), h('span', null, r.otros.map(o => `${o.ing}${o.pct ? ' ' + o.pct + ' %' : ''}`).join(', '))] : null,
      h('span', null, 'Fermentación'), h('span', null, (fe.metodos || []).join(', ').replace(/_/g, ' ') + (fe.tiempo_total_h ? ` · ${rng(fe.tiempo_total_h)} h` : '') + (fe.T_masa ? ` · masa a ${rng(fe.T_masa)} °C` : '')),
      h('span', null, 'Amasado'), h('span', null, (r.amasado && r.amasado.desarrollo) || '—', ap.posible === false ? ' · sin opción de pliegues' : ' · admite pliegues'),
      h('span', null, 'Horno'), h('span', null, `${T} °C · ${rng(ho.tiempo_min)} min` + (ho.vapor ? ` · vapor ${ho.vapor === true ? 'sí' : ho.vapor}` : '') + (ho.T_interior ? ` · ${rng(ho.T_interior)} °C dentro` : '')))),
    (r.etapas || []).length ? h('details', null, h('summary', null, 'Etapas originales'), h('ol', null, r.etapas.map(e => h('li', { class: 'small' }, typeof e === 'string' ? e : Object.values(e).join(' · '))))) : null,
    r.notas ? h('details', { open: true }, h('summary', null, 'Notas'), [].concat(r.notas).map(n => h('p', { class: 'small' }, n))) : null,
    h('details', null, h('summary', null, 'Fuentes'), (r.fuentes || []).map(s => h('p', { class: 'small' }, s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.nombre) : s.nombre, ' ', conf(s.confianza)))),
    h('p'), h('button', { class: 'btn', onclick: () => {
      C = convNueva(); C.fam = r.familia; C.hist = [JSON.stringify({ ...convNueva() })];
      elegirFicha(r); C.paso = 'cantidad'; fichaVista = null; go('hacer');
    } }, 'Hacer esta'));
}

// ------------------------------------------------------------ masa madre
function vMadre() {
  const P = perfil(), mm = P.masamadre;
  mm.log = mm.log || [];
  $main.append(h('h2', null, 'Masa madre'));
  const est = { no: 'No tienes todavía', creando: 'Creándola', activa: 'Activa' }[mm.estado] || mm.estado;
  $main.append(h('div', { class: 'card' }, h('div', { class: 'kv' }, h('span', null, 'Estado'), h('b', null, est),
    mm.g21 ? [h('span', null, 'Velocidad'), h('span', null, `duplica en ${(mm.g21 * Math.log2(2)).toFixed(1)} h por cada ×2 a 21 °C (${mm.log.length} refrescos anotados)`)] : null)));
  if (mm.estado === 'no') {
    $main.append(guiaCrear(), h('button', { class: 'btn', onclick: () => { mm.estado = 'creando'; mm.inicio = new Date().toISOString(); save(); render(); } }, 'Empiezo hoy'));
    return;
  }
  if (mm.estado === 'creando') {
    const dias = Math.floor((Date.now() - new Date(mm.inicio)) / 864e5) + 1;
    $main.append(h('div', { class: 'info' }, `Día ${dias}. `, consejoDia(dias, mm)));
  }
  // formulario de refresco
  const now = new Date(); const fr = { cuando: toLocalInput(now), a: mm.estado === 'creando' ? 1 : 1, b: mm.estado === 'creando' ? 1 : 2, c: mm.estado === 'creando' ? 1 : 2, T: P.cocina, horas: '', duplico: 'si' };
  $main.append(h('h3', null, 'Anotar un refresco'), h('div', { class: 'card' },
    h('label', null, 'Cuándo lo refrescaste'), h('input', { type: 'datetime-local', value: fr.cuando, onchange: e => fr.cuando = e.target.value }),
    h('label', null, 'Proporción madre : harina : agua'), h('div', { class: 'row' },
      ['a', 'b', 'c'].map(k => h('input', { type: 'number', min: 0.5, step: 0.5, value: fr[k], oninput: e => fr[k] = +e.target.value }))),
    h('label', null, 'Temperatura del sitio (°C)'), h('input', { type: 'number', step: 0.5, value: fr.T, oninput: e => fr.T = +e.target.value }),
    h('label', null, '¿Duplicó?'), h('select', { onchange: e => fr.duplico = e.target.value }, h('option', { value: 'si' }, 'Sí'), h('option', { value: 'no' }, 'No, apenas subió')),
    h('label', null, 'Horas hasta duplicar (o hasta el pico)'), h('input', { type: 'number', step: 0.5, placeholder: 'p. ej. 6', oninput: e => fr.horas = e.target.value }),
    h('p'), h('button', { class: 'btn', onclick: () => {
      const e = { t: fr.cuando, r: [fr.a, fr.b, fr.c], T: fr.T, dup: fr.duplico === 'si', horas: fr.horas ? +fr.horas : null };
      if (e.dup && e.horas) { const D = (fr.a + fr.b + fr.c) / fr.a; e.g21 = e.horas * Motor.rLab(fr.T) / Math.log2(Math.max(2, D)) * Math.log2(2);
        // tiempo de pico ≈ log2(D)·g ⇒ g = horas·r/log2(D)
        e.g21 = e.horas * Motor.rLab(fr.T) / Math.log2(D); }
      mm.log.unshift(e); mm.log = mm.log.slice(0, 60);
      const ult = mm.log.filter(x => x.g21).slice(0, 3).map(x => x.g21).sort((a, b) => a - b);
      if (ult.length) mm.g21 = ult[Math.floor(ult.length / 2)];
      save();
      const listos = mm.log.slice(0, 3).length === 3 && mm.log.slice(0, 3).every(x => x.dup && x.g21 && x.g21 <= 4.5);
      if (mm.estado === 'creando' && listos) { if (confirm('Ha duplicado con fuerza tres refrescos seguidos. ¿La marco como activa?')) { mm.estado = 'activa'; save(); } }
      toast('Anotado.'); render();
    } }, 'Guardar refresco')));
  if (mm.estado === 'activa') $main.append(h('div', { class: 'info small' }, 'Mantenimiento: en la nevera, refresca una vez por semana (1:5:5). La víspera de usarla, refresca a temperatura ambiente y úsala en el pico. Cada refresco anotado ajusta los tiempos del planificador.'));
  if (mm.log.length) $main.append(h('h3', null, 'Refrescos anotados'), h('div', { class: 'card' }, mm.log.map(x => h('div', { class: 'list-item small' },
    h('span', null, `${new Date(x.t).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${x.r.join(':')} · ${x.T} °C`),
    h('span', null, x.dup ? (x.horas ? `×2 en ${x.horas} h` : 'duplicó') : 'no subió')))));
  $main.append(h('details', null, h('summary', null, 'Guía para crearla'), guiaCrear()));
  $main.append(h('p'), h('div', { class: 'row' },
    mm.estado !== 'activa' ? h('button', { class: 'btn sec', onclick: () => { mm.estado = 'activa'; save(); render(); } }, 'Marcar como activa') : null,
    h('button', { class: 'btn ghost', onclick: () => { if (confirm('¿Empezar de cero? Se borra el registro.')) { P.masamadre = { estado: 'no', g21: null, log: [] }; save(); render(); } } }, 'Empezar de cero')));
}
function consejoDia(d, mm) {
  const sube = mm.log.slice(0, 2).some(x => x.dup);
  if (d <= 1) return 'Mezcla 50 g de harina integral (de centeno si tienes) con 50 g de agua a unos 26 °C. Tarro limpio, tapado sin apretar, marca el nivel con una goma.';
  if (d <= 3) return 'Cada 24 h: tira todo menos 50 g y añade 50 g de harina y 50 g de agua. Si los días 2–3 sube mucho y luego se para, es normal: sigue.';
  if (!sube) return 'Sigue cada 24 h (1:1:1). Si a los 7 días no hay subida regular, búscale un sitio a 25–27 °C.';
  return 'Ya sube: pasa a refrescar cada 12 h con 1:2:2 (25 g + 50 g + 50 g) usando la harina de hacer pan. Anota cuánto tarda en duplicar.';
}
function guiaCrear() {
  return h('div', { class: 'card small' },
    h('p', null, h('b', null, 'Qué necesitas: '), 'harina integral (centeno o trigo), agua sin cloro (del grifo reposada unas horas, o mineral), un tarro de cristal, una goma y un sitio a 24–27 °C.'),
    h('ol', null,
      h('li', null, 'Día 1: 50 g de harina integral + 50 g de agua a 26 °C. Tapa sin cerrar. Marca el nivel.'),
      h('li', null, 'Días 2 a 4: cada 24 h, tira todo salvo 50 g y añade 50 g de harina y 50 g de agua. Puede subir mucho al principio y pararse: son bacterias que no se quedan; sigue.'),
      h('li', null, 'Cuando suba de forma regular (día 4–7): refresca cada 12 h con 1:2:2 y ve cambiando a la harina de pan.'),
      h('li', null, 'Está lista cuando duplica en 4–8 h tres veces seguidas a 24–26 °C, huele a yogur o fruta y no a pies o acetona. Total: 1–2 semanas.'),
      h('li', null, 'Anota aquí cada refresco con las horas hasta duplicar: la app calcula su velocidad y la usa en los planes.')),
    h('p', { class: 'muted' }, 'Fuentes: Hamelman, «Bread»; King Arthur Baking, «Sourdough starter»; Calvel, «Le goût du pain».'));
}

// ------------------------------------------------------------ perfil
function vPerfil() {
  const P = perfil();
  const fld = (lab, key, type = 'text', extra = {}) => [h('label', null, lab), h('input', { type, value: P[key], ...extra, onchange: e => { P[key] = type === 'number' ? +e.target.value : e.target.value; save(); render(); } })];
  const sel = (lab, obj, key) => [h('label', null, lab), h('select', { onchange: e => { obj[key] = e.target.value; save(); } }, Object.entries(key === 'amasadora' ? AMASADORAS : LEVADURAS).map(([k, v]) => h('option', { value: k, selected: obj[key] === k }, v)))];
  $main.append(h('h2', null, 'Perfil'),
    h('div', { class: 'card' }, h('label', null, 'Perfil activo'), h('select', { onchange: e => { S.activo = e.target.value; save(); render(); } }, S.perfiles.map(p => h('option', { value: p.id, selected: p.id === P.id }, p.nombre))),
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'btn sec', onclick: () => { const n = prompt('Nombre del perfil nuevo (p. ej. «Pueblo»)'); if (!n) return; const np = clone(P); np.id = 'p' + Date.now().toString(36); np.nombre = n; S.perfiles.push(np); S.activo = np.id; save(); render(); } }, 'Nuevo (copia)'),
        S.perfiles.length > 1 ? h('button', { class: 'btn ghost', onclick: () => { if (!confirm(`¿Borrar el perfil «${P.nombre}»?`)) return; S.perfiles = S.perfiles.filter(p => p.id !== P.id); S.activo = S.perfiles[0].id; save(); render(); } }, 'Borrar') : null)),
    h('div', { class: 'card' }, ...fld('Nombre', 'nombre'), ...fld('Temperatura normal de la cocina (°C)', 'cocina', 'number', { step: 0.5 }), ...fld('Temperatura de la nevera (°C)', 'nevera', 'number', { step: 0.5 }),
      h('label', null, 'Duermo de'), h('div', { class: 'row' },
        h('input', { type: 'time', value: P.horario.dormir.desde, onchange: e => { P.horario.dormir.desde = e.target.value; save(); } }), 'a',
        h('input', { type: 'time', value: P.horario.dormir.hasta, onchange: e => { P.horario.dormir.hasta = e.target.value; save(); } })),
      ...sel('Levadura que usas', P, 'levadura'), ...sel('Amasadora', P, 'amasadora'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: P.bascula01, onchange: e => { P.bascula01 = e.target.checked; save(); } }), 'Tengo báscula de precisión (0,01 g)')),
    h('h3', null, 'Harinas que sueles tener'), h('div', { class: 'card' }, Object.entries(HARINAS).map(([k, v]) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: P.harinas.includes(k), onchange: e => { P.harinas = e.target.checked ? [...new Set([...P.harinas, k])] : P.harinas.filter(x => x !== k); save(); } }), v))),
    h('h3', null, 'Hornos'), ...P.hornos.map(o => editorHorno(P, o)),
    h('button', { class: 'btn sec', onclick: () => { P.hornos.push({ id: 'h' + Date.now().toString(36), nombre: 'Horno nuevo', energia: 'electrico', tmax: 250, ventilador: true, vapor: 'ninguno', piedra: 'ninguna', olla: false }); save(); render(); } }, '+ Añadir horno'),
    h('h3', null, 'Calibración'), h('div', { class: 'card small' }, `Factor de fermentación: ×${P.calib.levadura.toFixed(2)} `, h('span', { class: 'muted' }, '(se ajusta solo con tus valoraciones; 1 = como el modelo)'),
      P.calib.levadura !== 1 ? h('button', { class: 'btn ghost', onclick: () => { P.calib.levadura = 1; save(); render(); } }, 'Poner a 1') : null),
    h('h3', null, 'Copia de seguridad'), h('div', { class: 'card' }, h('p', { class: 'small muted' }, 'Para pasar tus perfiles e historial del móvil al PC hasta que haya sincronización.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn sec', onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' })), download: 'psomares-copia.json' }); document.body.append(a); a.click(); a.remove(); } }, 'Exportar'),
        h('label', { class: 'btn sec', style: 'text-align:center;margin:0;color:var(--acc)' }, 'Importar', h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: async e => {
          try { const d = JSON.parse(await e.target.files[0].text()); if (!d.perfiles) throw 0; if (!confirm('Esto sustituye todo lo que hay en este dispositivo. ¿Seguir?')) return; S = d; save(); render(); toast('Importado.'); } catch (er) { toast('Ese archivo no es una copia válida.'); }
        } })))),
    h('h3', null, 'Avisos'), h('div', { class: 'card small' }, 'Notificaciones: ', ('Notification' in window) ? Notification.permission : 'no disponibles', ' ',
      h('button', { class: 'btn sec', onclick: async () => { await pedirNotif(); render(); } }, 'Pedir permiso'), ' ',
      h('button', { class: 'btn ghost', onclick: () => notificar('Prueba', 'Así sonarán los avisos.', 'prueba') }, 'Probar')),
    h('p', { class: 'muted small center' }, `Psomares v${VERSION} · ${RECETAS.length} recetas`));
}
function editorHorno(P, o) {
  const set = (k, v) => { o[k] = v; save(); };
  return h('div', { class: 'oven card' },
    h('label', null, 'Nombre'), h('input', { value: o.nombre, onchange: e => set('nombre', e.target.value) }),
    h('div', { class: 'row' },
      h('div', null, h('label', null, 'Energía'), h('select', { onchange: e => set('energia', e.target.value) }, ['electrico', 'gas', 'leña', 'pellet'].map(k => h('option', { value: k, selected: o.energia === k }, k)))),
      h('div', null, h('label', null, 'Temperatura máx. (°C)'), h('input', { type: 'number', value: o.tmax, onchange: e => set('tmax', +e.target.value) }))),
    h('label', null, 'Vapor'), h('select', { onchange: e => set('vapor', e.target.value) }, Object.entries(VAPOR).map(([k, v]) => h('option', { value: k, selected: o.vapor === k }, v))),
    h('label', null, 'Piedra o acero'), h('select', { onchange: e => set('piedra', e.target.value) }, [['ninguna', 'Nada'], ['piedra', 'Piedra refractaria'], ['acero', 'Acero de hornear'], ['suelo', 'Suelo refractario (horno de leña/pizza)']].map(([k, v]) => h('option', { value: k, selected: o.piedra === k }, v))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: o.ventilador, onchange: e => set('ventilador', e.target.checked) }), 'Tiene ventilador'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: o.olla, onchange: e => set('olla', e.target.checked) }), 'Tengo olla de hierro que cabe'),
    P.hornos.length > 1 ? h('button', { class: 'btn ghost', onclick: () => { P.hornos = P.hornos.filter(x => x !== o); save(); render(); } }, 'Borrar horno') : null);
}

// ------------------------------------------------------------ botón atrás del móvil
function atrasApp() {
  if (TAB === 'recetas' && fichaVista) { fichaVista = null; render(); return true; }
  if (TAB === 'hacer' && C.hist.length) { atras(); window.scrollTo(0, 0); return true; }
  if (pilaTabs.length) { go(pilaTabs.pop(), true); return true; }
  if (TAB !== 'hacer') { go('hacer', true); return true; }
  return false;
}
function prepararAtras() {
  history.replaceState({ psomares: 'raiz' }, '');
  history.pushState({ psomares: 'app' }, '');
  window.addEventListener('popstate', () => {
    if (atrasApp()) history.pushState({ psomares: 'app' }, '');
    else history.back();          // ya estamos al principio: salir
  });
}

// ------------------------------------------------------------ arranque
async function init() {
  try { RECETAS = (await (await fetch('recetas.json')).json()).recetas; } catch (e) { $main.textContent = 'No se pudieron cargar las recetas.'; return; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (S.marcha) TAB = 'marcha', document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === 'marcha'));
  render(); vigilar(); prepararAtras();
  const sp = document.getElementById('splash'); if (sp) setTimeout(() => { sp.classList.add('fuera'); setTimeout(() => sp.remove(), 500); }, 1100);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { vigilar(); if (TAB === 'marcha') { wake = null; pedirWake(); } } });
}
init();
window.__masas = { get S() { return S; }, get C() { return C; } };
})();
