/* Motor de reglas (sin dependencias). Funciona en el navegador (window.Engine) y en Node (module.exports). */
(function (root) {
  const E = {};
  const SUP = { "¹": "L1", "²": "L2" };
  const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const lc = (s) => String(s || "").toLowerCase();
  const countEmojis = (t) => (String(t).match(/\p{Extended_Pictographic}/gu) || []).length;

  /* ---------- Ortografía y puntuación (reglas locales) ---------- */
  const TYPO = { tambien: "también", ademas: "además", facil: "fácil", rapido: "rápido", dia: "día", dias: "días", asi: "así", aqui: "aquí", ahi: "ahí", despues: "después", pagina: "página", credito: "crédito", debito: "débito", numero: "número", codigo: "código", telefono: "teléfono", electronico: "electrónico", informacion: "información", promocion: "promoción", comision: "comisión", transaccion: "transacción", linea: "línea", ultimo: "último", util: "útil", unico: "único", tecnologia: "tecnología", exito: "éxito", maximo: "máximo", minimo: "mínimo", mexico: "México", porfavor: "por favor", aveces: "a veces", atraves: "a través", podras: "podrás", tendras: "tendrás", recibiras: "recibirás", seras: "serás", sera: "será", click: "clic", clicks: "clics", envio: "envío", envios: "envíos", categoria: "categoría", catalogo: "catálogo", pais: "país", limite: "límite", movil: "móvil", prestamo: "préstamo", prestamos: "préstamos", valido: "válido", validos: "válidos", vigencia_: "", descarga_: "", pagalo: "págalo", registrate: "regístrate", solicitalo: "solicítalo", pidelo: "pídelo", aprovechalo: "aprovéchalo", estrena_: "", mas: "más", asi_: "", rapidamente: "rápidamente", facilmente: "fácilmente", unicamente: "únicamente", semanalidad_: "", compralo: "cómpralo", descubrelo: "descúbrelo", llevatelo: "llévatelo", corre_: "", ya_: "", despues_: "" };
  E.spell = function (t, extra) {
    const out = [], e = (m) => out.push({ s: "err", m }), w = (m) => out.push({ s: "warn", m });
    if (/\s{2,}/.test(t)) e("Espacios dobles");
    if (/^\s|\s$/.test(t)) e("Espacios al inicio o al final");
    const rep = t.match(/\b([\p{L}]{2,})\s+\1\b/iu);
    if (rep) e("Palabra repetida: «" + rep[1] + "»");
    if ((t.match(/¿/g) || []).length !== (t.match(/\?/g) || []).length) e("Signos de interrogación sin pareja (¿ ?)");
    if ((t.match(/¡/g) || []).length !== (t.match(/!/g) || []).length) e("Signos de exclamación sin pareja (¡ !)");
    if (/\s[,.;:!?]/.test(t) && !/\s\.\.\./.test(t)) e("Espacio antes de un signo de puntuación");
    if (/[,;:][^\s\d"”)]/.test(t)) e("Falta espacio después de coma, punto y coma o dos puntos");
    if (/[a-záéíóúñ][.!?][A-ZÁÉÍÓÚÑ¡¿]/.test(t) && !/https?:|www\./i.test(t)) e("Falta espacio después del punto");
    if (/\.{4,}/.test(t)) e("Más de tres puntos suspensivos");
    if (/[!?]{2,}/.test(t)) w("Signos repetidos (!! o ??)");
    const map = Object.assign({}, TYPO, extra || {});
    const seen = new Set();
    (t.toLowerCase().match(/[\p{L}]+/gu) || []).forEach((wd) => {
      if (map[wd] && !seen.has(wd)) { seen.add(wd); e("Posible falta de acento u ortografía: «" + wd + "» → «" + map[wd] + "»"); }
    });
    return out;
  };

  /* ---------- Límites ---------- */
  E.limits = function (pack, ciclo, mat, ovr) {
    const m = pack.materiales[mat]; if (!m) return {};
    const out = {};
    m.campos.forEach((c) => { if (c.max) out[c.id] = { max: c.max, hasta: c.hasta }; });
    const co = ((pack.ciclos[ciclo] || {}).limites || {})[mat] || {};
    Object.keys(co).forEach((k) => { out[k] = Object.assign({}, out[k], { max: co[k] }); });
    const o = (ovr || {})[mat] || {};
    Object.keys(o).forEach((k) => { if (+o[k] > 0) out[k] = Object.assign({}, out[k], { max: +o[k] }); });
    Object.keys(out).forEach((k) => { if (out[k].hasta && out[k].hasta <= out[k].max) delete out[k].hasta; });
    return out;
  };

  /* ---------- Hechos del brief ---------- */
  E.facts = function (b) {
    const txt = [b.categoria, b.oferta, b.consideraciones, b.producto, b.vigencia].filter(Boolean).join(" · ");
    const nums = new Set((txt.match(/\d[\d.,]*/g) || []).map(normNum));
    return {
      txt, nums,
      sem: /semanal|semanalidad/i.test(txt),
      msi: /\bMSI\b|meses sin intereses/i.test(txt),
      precio: /\$\s?\d/.test(txt),
    };
  };
  function normNum(n) { return String(n).replace(/[,\s]/g, "").replace(/\.$/, "").replace(/\.0+$/, ""); }

  /* ---------- Legales (se componen por reglas, no los redacta la IA) ---------- */
  const reL1 = /pr[eé]stamo|credimax/i, reMSI = /\bMSI\b|meses sin intereses/i, reTYC = /descuento adicional|regalo|cup[oó]n|bono|primeros \d+|promoci[oó]n limitada/i;
  E.legalNeeds = function (fields) {
    const t = Object.values(fields || {}).join(" \n ");
    const need = [];
    if (reL1.test(t)) need.push("L1");
    if (reMSI.test(t)) need.push("L2_MSI");
    if (reTYC.test(t)) need.push("L2_TYC");
    return need;
  };
  E.autoLegal = function (p, pack, lib) {
    const m = pack.materiales[p.material];
    if (!m || !m.legal) return { texto: "", need: [], missing: [] };
    const L = Object.assign({}, pack.legales, lib || {});
    const need = E.legalNeeds(copyFields(p, m));
    const texto = need.map((k) => (L[k] && L[k].texto || "").trim()).filter(Boolean).join("  ");
    const missing = need.filter((k) => !((L[k] && L[k].texto) || "").trim());
    return { texto, need, missing };
  };
  function copyFields(p, m) { const o = {}; m.campos.forEach((c) => { if (p.fields && p.fields[c.id]) o[c.id] = p.fields[c.id]; }); return o; }

  /* ---------- Validación de una pieza ---------- */
  E.validate = function (p, pack, opts) {
    opts = opts || {};
    const m = pack.materiales[p.material], ciclo = pack.ciclos[p.ciclo] || {}, val = ciclo.valida || {};
    const out = [], g = pack.glosario, F = p.fields || {};
    const err = (msg, campo) => out.push({ s: "err", m: msg, campo }), warn = (msg, campo) => out.push({ s: "warn", m: msg, campo });
    if (!m) { err("Material sin reglas definidas"); return out; }
    const lim = E.limits(pack, p.ciclo, p.material, opts.ovr);
    const all = m.campos.map((c) => F[c.id] || "").join(" \n ");
    const filled = m.campos.filter((c) => (F[c.id] || "").trim());
    if (!filled.length) return [{ s: "warn", m: "Sin texto todavía" }];
    const facts = E.facts(p.brief || {});

    m.campos.forEach((c) => {
      const t = F[c.id] || "";
      if (!t.trim()) { if (c.id !== "out_subtitulo") warn("Campo vacío: " + c.nombre, c.id); return; }
      E.spell(t, opts.typos).forEach((x) => out.push({ s: x.s, m: c.nombre + ": " + x.m, campo: c.id }));
      const l = lim[c.id];
      if (l) {
        if (t.length > (l.hasta || l.max)) err(c.nombre + ": " + t.length + "/" + l.max + (l.hasta ? " (tope de excepción " + l.hasta + ")" : "") + " caracteres", c.id);
        else if (t.length > l.max) warn(c.nombre + ": " + t.length + "/" + l.max + " — excede la regla; solo válido como excepción (hasta " + l.hasta + ")", c.id);
      }
      if (/shopinbaz/i.test(t)) (t.match(/shopinbaz/gi) || []).forEach((x) => { if (x !== g.marca) err(c.nombre + ": escribe «" + g.marca + "» en minúsculas (hay «" + x + "»)", c.id); });
      if (!val.permiteOFF) {
        if (/\bOFF\b/i.test(t)) err(c.nombre + ": di «descuento», no «OFF» (solo Activación lo permite)", c.id);
        if (/\bd(c)?tos?\b\.?/i.test(t)) err(c.nombre + ": di «descuento», no «dto.»", c.id);
      }
      if (/\b(Cel|CEL|Fon|FON)\b/.test(t)) warn(c.nombre + ": «cel» y «fon» van en minúsculas", c.id);
      g.categorias.forEach((cat) => {
        const low = cat.charAt(0).toLowerCase() + cat.slice(1);
        if (new RegExp("(^|[^\\p{L}])" + low + "s?(?![\\p{L}])", "u").test(t)) warn(c.nombre + ": si «" + low + "» nombra la categoría/producto, usa mayúscula inicial («" + cat + "»)", c.id);
      });
      // modalidad de pago por campo
      if (/semanal/i.test(t) && !/pr[eé]stamo/i.test(t)) err(c.nombre + ": si hay pago semanal debe decir «con préstamo»", c.id);
      if (reMSI.test(t) && !/tarjeta|\bTDC\b/i.test(t)) err(c.nombre + ": si hay MSI debe decir «con tarjeta de crédito / TDC»", c.id);
      if (/(\bOFF\b)/.test(t) === false && /\bgratis\b/i.test(t) && !/gratis/i.test(facts.txt)) warn(c.nombre + ": «gratis» no está respaldado por el brief", c.id);
    });

    // marca obligatoria por ciclo
    if (val.marca) {
      const target = val.marca === "cuerpo" ? (F.cuerpo || F.in || all) : all;
      if (!/shopinbaz/i.test(target)) err("Debe mencionar shopinbaz" + (val.marca === "cuerpo" ? " en el cuerpo" : ""));
    }
    // no inventar modalidades
    if (reMSI.test(all) && !facts.msi) err("Menciona MSI pero el brief no los incluye");
    if (/semanal/i.test(all) && !facts.sem) err("Menciona pago semanal pero el brief no lo incluye");
    // cifras presentes en el brief
    const copyNums = (all.replace(/[¹²³]/g, "").match(/\d[\d.,]*/g) || []).map(normNum).filter((n) => n && !(/^0+$/.test(n)));
    const bad = [...new Set(copyNums.filter((n) => !facts.nums.has(n)))];
    if (bad.length) warn("Cifras que no aparecen en el brief: " + bad.join(", ") + " (verifica que coincidan exactamente)");
    // emojis
    const ne = countEmojis(all);
    if (m.emojis && (ne < m.emojis[0] || ne > m.emojis[1])) warn("Emojis: " + ne + " (la regla pide " + m.emojis[0] + "–" + m.emojis[1] + ")");
    else if (ne > 5) warn("Muchos emojis (" + ne + "): evita saturar");
    (g.emojisProhibidos || []).forEach((x) => { if (all.includes(x)) err("Emoji no permitido (alusión sexual): " + x); });
    // variables de personalización
    (all.match(/#[A-Za-zÁÉÍÓÚÑ]+#?/g) || []).forEach((tok) => {
      if (!g.tokens.includes(tok)) warn("Variable «" + tok + "» no reconocida (usa " + g.tokens.join(" o ") + ")");
    });
    // duplicados y repeticiones entre campos
    const tit = F.titulo || F.out_titulo || "", cuerpo = F.cuerpo || F.in || "", sub = F.out_subtitulo || "", cta = F.cta || "";
    const nt = lc(norm(tit));
    if (nt.length > 6 && lc(norm(cuerpo)).includes(nt)) warn("El título se repite literalmente en el cuerpo");
    if (cta && [nt, lc(norm(sub))].includes(lc(norm(cta)))) warn("El CTA repite el título o subtítulo");
    if (nt && (opts.titles || []).includes(nt)) warn("Título repetido en otra pieza del mismo ciclo (varía los títulos)");
    // vocabulario por segmento (Recu-Retención PN)
    if (val.segmentoVocab && p.brief && p.brief.segKey) {
      const re = { "SI-SI": /regres|vuelv/i, "SI-NO": /primer|empiez/i, "NO-NO": /descubr|conoc|explor|entra/i }[p.brief.segKey];
      if (re && !re.test(all)) warn("Segmento " + p.brief.segKey + ": falta el vocabulario del segmento (" + { "SI-SI": "regresa/vuelve", "SI-NO": "primera compra/empieza", "NO-NO": "descubre/conoce/explora/entra" }[p.brief.segKey] + ")");
    }
    // lógica de modalidad de pago (Recu-Retención PN)
    if (val.pagoLogic) {
      const s = facts.sem, ms = facts.msi, has = (re) => re.test(all);
      if (s && ms && !(has(/semanal/i) && has(reMSI))) warn("El brief tiene semanalidad y MSI: comunica ambas modalidades");
      else if (s && !ms && !has(/guardadito/i)) warn("Solo semanalidad: agrega la alternativa Guardadito");
      else if (!s && ms && !(has(reMSI) && has(/pr[eé]stamo/i))) warn("Solo MSI: comunica «hasta X MSI» + «podrías usar tu préstamo»");
      else if (!s && !ms && !(has(/pr[eé]stamo/i) && has(/guardadito/i))) warn("Sin semanalidad ni MSI: comunica préstamo + Guardadito");
    }
    if (val.prestamoEnCuerpo && F.cuerpo && !/pr[eé]stamo/i.test(F.cuerpo)) warn("En Uso, el cuerpo debe mencionar el préstamo");
    if (val.nocturno && !/noche|desvel|dormir|luna|sue[ñn]|madrugada|despiert/i.test(all)) warn("Desvelados: falta lenguaje nocturno (noche, desvelo, dormir, luna, sueños, madrugada)");
    if (/aprobaci[oó]n (inmediata|garantizada)|te aprobamos|garantizad/i.test(all)) err("No prometas aprobación ni garantías que el brief no respalde");

    // legales
    if (m.legal) {
      const lg = E.autoLegal(p, pack, opts.legalLib);
      lg.missing.forEach((k) => err("Falta cargar en la biblioteca el legal «" + ((pack.legales[k] || {}).nombre || k) + "»"));
      if (lg.need.includes("L2_MSI") && lg.need.includes("L2_TYC")) warn("Hay MSI y TyC a la vez: confirma la numeración de los legales (² y ³)");
      const used = new Set((all.match(/[¹²]/g) || []));
      const want = new Set(lg.need.map((k) => ((pack.legales[k] || {}).simbolo)));
      want.forEach((s) => { if (s && !used.has(s)) err("Falta el superíndice " + s + " en el copy (corresponde a un legal que se incluirá)"); });
      used.forEach((s) => { if (!want.has(s)) err("El superíndice " + s + " no tiene legal correspondiente"); });
    } else if (/[¹²]/.test(all)) warn("Hay superíndices en un material sin legal");
    // únicos
    return out.filter((x, i, a) => a.findIndex((y) => y.m === x.m) === i);
  };
  E.hasErr = (list) => list.some((x) => x.s === "err");

  /* ---------- Importación de parrillas ---------- */
  const HDR = [
    ["semana", /^semana/i], ["dia", /^d[ií]a/i], ["hora", /^hora/i], ["fecha", /^fecha/i],
    ["segmento", /segmento|audiencia/i], ["categoria", /categor[ií]a/i], ["oferta", /oferta|apuesta/i], ["sku", /sku/i],
    ["material", /tipo de\s*material|^material/i], ["consideraciones", /consideraci/i],
  ];
  E.detectHeader = function (rows) {
    let best = -1, score = 0;
    rows.slice(0, 80).forEach((r, i) => {
      const s = HDR.filter((h) => r.some((c) => h[1].test(norm(c)))).length;
      if (s > score) { score = s; best = i; }
    });
    return score >= 3 ? best : -1;
  };
  E.mapColumns = function (headerRow) {
    const m = {};
    HDR.forEach(([k, re]) => { const j = headerRow.findIndex((c) => re.test(norm(c))); if (j >= 0) m[k] = j; });
    return m;
  };
  E.cleanCell = function (v) {
    let s = String(v == null ? "" : v).replace(/\r/g, "").trim();
    if (/^#(REF|N\/A|VALUE|NAME|DIV)/i.test(s) || /^=/.test(s)) return "";
    s = s.replace(/^["“]+|["”]+$/g, "").replace(/\s*\n\s*/g, " · ").replace(/\s{2,}/g, " ").trim();
    return s;
  };
  const MAT_NAMES = [[/enriquecid/i, "PE"], [/sencilla/i, "PS"], [/centro de notif/i, "CN"], [/in\s?app.*imagen|inapp.*imagen/i, "INI"], [/in\s?app.*texto|inapp.*texto/i, "INT"], [/whats/i, "WA"], [/mailing|correo/i, "MA"]];
  E.materialFromCell = function (v, pack) {
    const s = norm(v); if (!s) return "";
    const code = s.toUpperCase();
    if (pack.materiales[code]) return code;
    if (code === "IN") return "INT";
    for (const [re, c] of MAT_NAMES) if (re.test(s)) return c;
    return "";
  };
  E.segKey = function (text) { const m = String(text || "").match(/\b(SI|NO)\s?-\s?(SI|NO)\b/i); return m ? (m[1] + "-" + m[2]).toUpperCase() : ""; };

  root.Engine = E;
  if (typeof module !== "undefined" && module.exports) module.exports = E;
})(typeof window !== "undefined" ? window : globalThis);
