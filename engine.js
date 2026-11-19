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
    const co = ((E.cycle(pack, ciclo, mat) || {}).limites || {})[mat] || {};
    Object.keys(co).forEach((k) => { out[k] = Object.assign({}, out[k], { max: co[k] }); });
    const o = (ovr || {})[mat] || {};
    Object.keys(o).forEach((k) => { if (+o[k] > 0) out[k] = Object.assign({}, out[k], { max: +o[k] }); });
    Object.keys(out).forEach((k) => { if (out[k].hasta && out[k].hasta <= out[k].max) delete out[k].hasta; });
    return out;
  };

  /* ---------- Hechos del brief ---------- */
  E.facts = function (b) {
    const txt = [b.categoria, b.oferta, b.consideraciones, b.producto, b.vigencia, b.temporalidad].filter(Boolean).join(" · ");
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
    const need = [], msi = reMSI.test(t), tyc = reTYC.test(t);
    if (reL1.test(t) || /¹/.test(t)) need.push("L1");
    if (msi) need.push("L2_MSI");
    if (tyc) need.push("L2_TYC");
    if (/²/.test(t) && !msi && !tyc) need.push("L2_TYC"); // un ² sin otra pista se interpreta como TyC (así se usa en las parrillas)
    return need;
  };
  E.autoLegal = function (p, pack, lib) {
    const m = pack.materiales[p.material];
    if (!m || !m.legal || E.cycle(pack, p.ciclo, p.material).otraMarca) return { texto: "", need: [], missing: [] };
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
    const m = pack.materiales[p.material], ciclo = E.cycle(pack, p.ciclo, p.material), val = ciclo.valida || {}, brand = !ciclo.otraMarca;
    const out = [], g = pack.glosario, F = p.fields || {};
    const err = (msg, campo) => out.push({ s: "err", m: msg, campo }), warn = (msg, campo) => out.push({ s: "warn", m: msg, campo });
    if (!m) { err("Material sin reglas definidas"); return out; }
    const lim = E.limits(pack, p.ciclo, p.material, opts.ovr);
    const all = m.campos.map((c) => F[c.id] || "").join(" \n ");
    const filled = m.campos.filter((c) => (F[c.id] || "").trim());
    if (!filled.length) return [{ s: "warn", m: "Sin texto todavía" }];
    const facts = E.facts(p.brief || {});
    const tg = E.tagLine(p, pack);
    if (p.brief && p.brief.temporalidad) {
      E.spell(p.brief.temporalidad, opts.typos).forEach((x) => out.push({ s: x.s, m: "Temporalidad: " + x.m, campo: "temporalidad" }));
      if (tg && /\(\s*tag\b/i.test(F.in || "")) warn("El Copy in ya contiene un tag: el sistema agrega el de temporalidad al inicio");
    }

    m.campos.forEach((c) => {
      const t = F[c.id] || "";
      if (!t.trim()) { if (c.id !== "out_subtitulo") warn("Campo vacío: " + c.nombre, c.id); return; }
      E.spell(t, opts.typos).forEach((x) => out.push({ s: x.s, m: c.nombre + ": " + x.m, campo: c.id }));
      const l = lim[c.id];
      if (l) {
        if (t.length > (l.hasta || l.max)) err(c.nombre + ": " + t.length + "/" + l.max + (l.hasta ? " (tope de excepción " + l.hasta + ")" : "") + " caracteres", c.id);
        else if (t.length > l.max) warn(c.nombre + ": " + t.length + "/" + l.max + " — excede la regla; solo válido como excepción (hasta " + l.hasta + ")", c.id);
      }
      if (brand && /shopinbaz/i.test(t)) (t.match(/shopinbaz/gi) || []).forEach((x) => { if (x !== g.marca) err(c.nombre + ": escribe «" + g.marca + "» en minúsculas (hay «" + x + "»)", c.id); });
      if (brand && !val.permiteOFF) {
        if (/\bOFF\b/i.test(t)) err(c.nombre + ": di «descuento», no «OFF» (solo Activación lo permite)", c.id);
        if (/\bd(c)?tos?\b\.?/i.test(t)) err(c.nombre + ": di «descuento», no «dto.»", c.id);
      }
      if (brand && /\b(Cel|CEL|Fon|FON)\b/.test(t)) warn(c.nombre + ": «cel» y «fon» van en minúsculas", c.id);
      if (brand) g.categorias.forEach((cat) => {
        const low = cat.charAt(0).toLowerCase() + cat.slice(1);
        if (new RegExp("(^|[^\\p{L}])" + low + "s?(?![\\p{L}])", "u").test(t)) warn(c.nombre + ": si «" + low + "» nombra la categoría/producto, usa mayúscula inicial («" + cat + "»)", c.id);
      });
      // modalidad de pago por campo
      if (brand && /semanal/i.test(t) && !/pr[eé]stamo/i.test(t)) err(c.nombre + ": si hay pago semanal debe decir «con préstamo»", c.id);
      if (brand && reMSI.test(t) && !/tarjeta|\bTDC\b/i.test(t)) err(c.nombre + ": si hay MSI debe decir «con tarjeta de crédito / TDC»", c.id);
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
    if (brand && m.emojis && (ne < m.emojis[0] || ne > m.emojis[1])) warn("Emojis: " + ne + " (la regla pide " + m.emojis[0] + "–" + m.emojis[1] + ")");
    else if (ne > 5) warn("Muchos emojis (" + ne + "): evita saturar");
    (g.emojisProhibidos || []).forEach((x) => { if (all.includes(x)) err("Emoji no permitido (alusión sexual): " + x); });
    // variables de personalización
    if (brand) (all.match(/#[A-Za-zÁÉÍÓÚÑ]+#?/g) || []).forEach((tok) => {
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
    if (m.legal && brand) {
      const lg = E.autoLegal(p, pack, opts.legalLib);
      lg.missing.forEach((k) => err("Falta cargar en la biblioteca el legal «" + ((pack.legales[k] || {}).nombre || k) + "»"));
      if (/²/.test(all) && !reMSI.test(all) && !reTYC.test(all)) warn("Superíndice ² sin MSI ni beneficio adicional en el texto: se insertará el legal de TyC; confirma que corresponde");
      if (/¹/.test(all) && !reL1.test(all)) warn("Superíndice ¹ sin mención de préstamo o Credimax: se insertará el legal de Credimax; confirma que corresponde");
      if (lg.need.includes("L2_MSI") && lg.need.includes("L2_TYC")) warn("Hay MSI y TyC a la vez: confirma la numeración de los legales (² y ³)");
      const used = new Set((all.match(/[¹²]/g) || []));
      const want = new Set(lg.need.map((k) => ((pack.legales[k] || {}).simbolo)));
      want.forEach((s) => { if (s && !used.has(s)) err("Falta el superíndice " + s + " en el copy (corresponde a un legal que se incluirá)"); });
      used.forEach((s) => { if (!want.has(s)) err("El superíndice " + s + " no tiene legal correspondiente"); });
    } else if (!m.legal && /[¹²]/.test(all)) warn("Hay superíndices en un material sin legal");
    // únicos
    return out.filter((x, i, a) => a.findIndex((y) => y.m === x.m) === i);
  };
  E.hasErr = (list) => list.some((x) => x.s === "err");

  /* ---------- Importación de parrillas ---------- */
  const HDR = [
    ["semana", /^semana/i], ["dia", /^d[ií]a/i], ["hora", /^hora/i], ["fecha", /^fecha/i],
    ["segmento", /segmento|audiencia/i], ["categoria", /categor[ií]a/i], ["oferta", /oferta|apuesta/i], ["sku", /sku/i],
    ["material", /tipo de\s*material|^material/i], ["consideraciones", /consideraci/i], ["temporalidad", /temporalidad|vigencia/i],
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
  E.parseSkus = function (s) {
    const out = [];
    String(s || "").split(/[\s,;|]+/).forEach((t) => { t = t.replace(/^[^\w]+|[^\w]+$/g, ""); if (t.length >= 4 && /\d/.test(t) && !out.includes(t)) out.push(t); });
    return out;
  };
  E.segKey = function (text) { const m = String(text || "").match(/\b(SI|NO)\s?-\s?(SI|NO)\b/i); return m ? (m[1] + "-" + m[2]).toUpperCase() : ""; };

  /* ---------- ciclos (con herencia) ---------- */
  E.baseCiclo = function (pack, id, mat, depth) {
    const c = pack.ciclos[id] || {};
    if (!c.hereda || (depth || 0) > 4) return c;
    const h = typeof c.hereda === "string" ? c.hereda : (c.hereda[mat] || c.hereda.default);
    return E.baseCiclo(pack, h, mat, (depth || 0) + 1);
  };
  E.cycle = function (pack, id, mat) {
    const own = pack.ciclos[id] || {}, b = E.baseCiclo(pack, id, mat);
    return Object.assign({}, b, { nombre: own.nombre || b.nombre, otraMarca: !!own.otraMarca, sinReglas: !!own.sinReglas, aviso: own.aviso, nota: own.nota });
  };
  const nrm = (c) => norm(c).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  E.cicloFromSheet = function (rows, pack) {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const r = rows[i] || [];
      for (let j = 0; j < r.length; j++) {
        if (/ciclo/.test(nrm(r[j]))) {
          for (let k = j + 1; k < Math.min(r.length, j + 8); k++) {
            const v = nrm(r[k]); if (!v) continue;
            const hit = Object.entries(pack.ciclos).find(([, c]) => nrm(c.nombre) === v);
            return hit ? hit[0] : "";
          }
          return "";
        }
      }
    }
    return "";
  };

  /* ---------- exportación en el formato del archivo de origen ---------- */
  E.colLetter = (n) => { let s = ""; n = n + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  E.exportColumns = function (hdr) {
    const map = {}, counts = {}; let prev = null;
    hdr.forEach((c, j) => {
      const h = nrm(c); let role = null;
      if (/^titulo$/.test(h)) role = "titulo";
      else if (/^(copy out|mensaje|copy|cuerpo)$/.test(h)) role = "copyout";
      else if (/^copy in$/.test(h)) role = "copyin";
      else if (/^legal/.test(h)) role = "legal";
      else if (/^cta$/.test(h)) role = "cta";
      if (role && !(role in map)) { map[role] = j; prev = role; }
      else if (!role && /^(#|largo)/.test(h) && !/ajustes|de com/.test(h) && prev && !(prev in counts)) counts[prev] = j;
    });
    return { map, counts };
  };
  /* Tag de temporalidad para Diseño: lo escribe la persona; se inserta al inicio del Copy in */
  E.tagLine = function (p, pack) {
    const t = String((p.brief || {}).temporalidad || "").replace(/\s+/g, " ").trim(), tg = pack.tag;
    if (!t || !tg || !(tg.materiales || []).includes(p.material)) return "";
    return String(tg.formato || "(Tag {t})").replace("{t}", t);
  };
  E.exportValues = function (p, pack, lib) {
    const F = p.fields || {}, tag = E.tagLine(p, pack), cin = (F.in || "").trim();
    return { titulo: (F.titulo || F.out_titulo || "").trim(), copyout: (F.cuerpo || F.out_subtitulo || "").trim(), copyin: tag ? tag + (cin ? "\n" + cin : "") : cin, cta: (F.cta || "").trim(), legal: E.autoLegal(p, pack, lib).texto };
  };

  /* ---------- parrilla anterior autorizada: estadísticas, alertas y detector de similitud ---------- */
  E.maskPII = function (t) {
    return String(t || "").replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL]").replace(/\b\d{18}\b/g, "[CLABE]").replace(/\b[A-ZÑ]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/gi, "[CURP]")
      .replace(/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/gi, "[RFC]").replace(/\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,4}\b/g, "[TARJETA]")
      .replace(/(?:\+?52[\s.-]?)?\(?\d{2,3}\)?[\s.-]\d{3,4}[\s.-]\d{4}\b|\b\d{10}\b/g, "[TEL]");
  };
  /* Campos de una pieza a partir de las columnas Título / Copy out / Copy in / CTA de una parrilla */
  E.fieldsFromRow = function (mat, v) {
    const o = {}, set = (k, x) => { if (x && String(x).trim()) o[k] = String(x).trim(); };
    if (["PE", "WA", "MA"].includes(mat)) { set("out_titulo", v.titulo); set("out_subtitulo", v.copyout); set("in", v.copyin); set("cta", v.cta); }
    else { set("titulo", v.titulo); set("cuerpo", v.copyout); if (mat === "INI" || mat === "INT") set("cta", v.cta); }
    return o;
  };
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : 0; };
  E.refStats = function (records, pack, ciclo, ovr) {
    const by = {}; records.forEach((r) => { (by[r.material] = by[r.material] || []).push(r); });
    const out = [];
    Object.keys(by).forEach((mat) => {
      const m = pack.materiales[mat]; if (!m) return;
      const L = E.limits(pack, ciclo, mat, ovr), F = by[mat].map((r) => E.fieldsFromRow(mat, r.vals));
      m.campos.forEach((c) => {
        const lens = F.map((f) => (f[c.id] || "").length).filter((n) => n > 0); if (!lens.length) return;
        const l = L[c.id], withE = F.filter((f) => f[c.id] && /\p{Extended_Pictographic}/u.test(f[c.id])).length;
        out.push({ material: mat, matNombre: m.nombre, campo: c.id, campoNombre: c.nombre, n: lens.length, med: med(lens), p90: pct(lens, 0.9), max: Math.max(...lens), limite: l ? l.max : null, pctSobre: l ? Math.round(100 * lens.filter((n) => n > l.max).length / lens.length) : null, pctEmoji: Math.round(100 * withE / lens.length) });
      });
    });
    return out;
  };
  E.refAlerts = function (records, pack, ciclo, opts) {
    const cnt = {}; let total = 0;
    records.slice(0, 1500).forEach((r) => {
      const p = { ciclo, material: r.material, brief: r.brief || {}, fields: E.fieldsFromRow(r.material, r.vals) };
      if (!Object.keys(p.fields).length) return; total++;
      const seen = new Set();
      E.validate(p, pack, Object.assign({}, opts)).forEach((x) => {
        if (/Sin texto|Campo vacío/.test(x.m)) return;
        const k = x.s + "|" + x.m.replace(/\d+/g, "N").replace(/«[^»]*»/g, "«…»").replace(/\(hasta N\)/g, ""); if (seen.has(k)) return; seen.add(k); cnt[k] = (cnt[k] || 0) + 1;
      });
    });
    return Object.entries(cnt).map(([k, n]) => { const i = k.indexOf("|"); return { s: k.slice(0, i), m: k.slice(i + 1), n, pct: Math.round(100 * n / Math.max(1, total)) }; }).sort((a, b) => b.n - a.n).slice(0, 10);
  };
  /* Detector de similitud: guarda solo huellas (hashes) de n-gramas de palabras, no el texto */
  E.words = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ\s]/g, " ").split(/\s+/).filter(Boolean);
  E.hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  E.shingles = (t, n) => { const w = E.words(t); n = n || 3; if (w.length < n) return []; const s = new Set(); for (let i = 0; i + n <= w.length; i++) s.add(E.hash(w.slice(i, i + n).join(" "))); return [...s]; };
  E.refRecords = function (records) {
    const out = [];
    records.forEach((r) => ["titulo", "copyout", "copyin", "cta"].forEach((k) => {
      const t = r.vals[k], w = E.words(t); if (w.length < 3) return;
      out.push({ l: r.row, f: k, full: E.hash(w.join(" ")), n: w.length, s: E.shingles(t).slice(0, 40) });
    }));
    return out;
  };
  E.buildRef = function (compact, nombre) {
    const idx = new Map(), byFull = new Map();
    compact.forEach((r, i) => { if (!byFull.has(r.full)) byFull.set(r.full, i); r.s.forEach((h) => { let a = idx.get(h); if (!a) idx.set(h, (a = [])); a.push(i); }); });
    return { records: compact, idx, byFull, nombre: nombre || "parrilla anterior" };
  };
  E.simCheck = function (text, ref) {
    const w = E.words(text); if (w.length < 3) return null;
    const ex = ref.byFull.get(E.hash(w.join(" "))); if (ex !== undefined) return { tipo: "exacto", n: w.length, rec: ref.records[ex] };
    if (w.length < 6) return null;
    const sh = E.shingles(text); if (!sh.length) return null; const hits = {};
    sh.forEach((h) => (ref.idx.get(h) || []).forEach((i) => { hits[i] = (hits[i] || 0) + 1; }));
    let best = null; Object.keys(hits).forEach((i) => { const r = hits[i] / sh.length; if (!best || r > best.ratio) best = { ratio: r, rec: ref.records[i] }; });
    return best && best.ratio >= 0.7 ? { tipo: "parcial", ratio: best.ratio, rec: best.rec } : null;
  };
  E.refIssues = function (p, pack, ref) {
    const m = pack.materiales[p.material], out = []; if (!m || !ref) return out;
    m.campos.forEach((c) => {
      const t = (p.fields || {})[c.id]; if (!t || !t.trim()) return;
      const s = E.simCheck(t, ref); if (!s) return;
      const where = "fila " + s.rec.l + " de «" + ref.nombre + "»";
      if (s.tipo === "exacto") out.push({ s: s.n >= 5 ? "err" : "warn", m: c.nombre + ": repite textualmente un copy de la parrilla anterior (" + where + "); escribe una versión nueva", campo: c.id });
      else out.push({ s: "warn", m: c.nombre + ": se parece mucho (" + Math.round(s.ratio * 100) + "%) a un copy de la parrilla anterior (" + where + "); varía la redacción", campo: c.id });
    });
    return out;
  };

  root.Engine = E;
  if (typeof module !== "undefined" && module.exports) module.exports = E;
})(typeof window !== "undefined" ? window : globalThis);
