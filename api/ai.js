// Función serverless (Vercel) para el paquete de reglas de la marca (rules/shopinbaz.json). Las claves viven SOLO aquí, como variables de entorno.
// PROVIDER_ORDER = proveedores en orden de preferencia, p. ej. "gemini,groq" (opciones: gemini, groq, claude).
// Si un proveedor está saturado, se reintenta y después se pasa automáticamente al siguiente.
const ORDER = (process.env.PROVIDER_ORDER || process.env.PROVIDER || "gemini").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
const RETRY_MS = +process.env.RETRY_MS || 1500;
const PACK = require("../rules/shopinbaz.json");
const SYSTEM = "Responde únicamente con JSON válido, sin texto adicional ni bloques de código.";

const PROVIDERS = {
  gemini: {
    key: () => process.env.GEMINI_API_KEY,
    model: () => process.env.GEMINI_MODEL || "gemini-3.5-flash-lite", // confirma el nombre vigente en Google AI Studio
    async call(prompt, model) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 4000, temperature: 0.7 },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error?.message || "Error de Gemini"), { status: r.status });
      return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    },
  },
  groq: {
    key: () => process.env.GROQ_API_KEY,
    model: () => process.env.GROQ_MODEL || "llama-3.3-70b-versatile", // confirma el nombre vigente en console.groq.com
    async call(prompt, model) {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + process.env.GROQ_API_KEY },
        body: JSON.stringify({
          model, temperature: 0.7, max_tokens: 4000,
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error?.message || "Error de Groq"), { status: r.status });
      return j.choices?.[0]?.message?.content || "";
    },
  },
  claude: {
    key: () => process.env.ANTHROPIC_API_KEY,
    model: () => process.env.MODEL || "claude-sonnet-5-5",
    async call(prompt, model) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 4000, system: SYSTEM, messages: [{ role: "user", content: prompt }] }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error?.message || "Error de Claude"), { status: r.status });
      return (j.content || []).map((b) => b.text || "").join("");
    },
  },
};

const isBusy = (e) => [429, 500, 502, 503, 504].includes(e.status) || /high demand|overload|unavailable|try again|rate limit|quota/i.test(e.message);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Extrae el JSON aunque el modelo añada texto o bloques ```json
function parseJSON(txt) {
  const t = String(txt).replace(/```json|```/g, "").trim();
  try { return JSON.parse(t); } catch (_) {}
  const m = t.match(/[\[{][\s\S]*[\]}]/);
  if (m) return JSON.parse(m[0]);
  throw new Error("La respuesta no era JSON válido");
}

// Prueba cada proveedor (2 intentos si está saturado) y pasa al siguiente si falla.
const CONF_OK = (process.env.CONFIDENTIAL_PROVIDERS || "claude").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
const FORMATS = "Push título, Push cuerpo, Encabezado, Cuerpo, CTA, Alt imagen, Mensaje de error, Banner";

async function run(prompt, confidential) {
  const tried = [];
  let order = confidential ? ORDER.filter((n) => CONF_OK.includes(n)) : ORDER;
  if (confidential && !order.some((n) => PROVIDERS[n] && PROVIDERS[n].key())) {
    const e = new Error("Modo confidencial: no hay un proveedor autorizado y configurado. Define CONFIDENTIAL_PROVIDERS (y su clave) en Vercel, o desactiva el modo confidencial para contenido no sensible.");
    e.code = "NO_CONF";
    throw e;
  }
  for (const name of order) {
    const p = PROVIDERS[name];
    if (!p) { tried.push(name + ": proveedor desconocido"); continue; }
    if (!p.key()) { tried.push(name + ": falta la clave"); continue; }
    const model = p.model();
    for (let i = 0; i < 2; i++) {
      try {
        const data = parseJSON(await p.call(prompt, model));
        return { data, provider: name, model, tried };
      } catch (e) {
        const last = i === 1 || !isBusy(e);
        if (last) { tried.push(`${name}: ${String(e.message).slice(0, 120)}`); break; }
        await sleep(RETRY_MS * (i + 1));
      }
    }
  }
  const err = new Error(tried.join(" | ") || "No hay proveedores configurados");
  err.tried = tried;
  throw err;
}


const J = (x) => JSON.stringify(x);
const bullets = (a) => (a || []).map((x) => "- " + x).join("\n");

const baseIds = (id, d = 0) => {
  const c = PACK.ciclos[id] || {};
  if (!c.hereda || d > 4) return [id];
  const l = typeof c.hereda === "string" ? [c.hereda] : [...new Set(Object.values(c.hereda))];
  return l.flatMap((i) => baseIds(i, d + 1));
};
const who = (ciclo) => {
  const own = PACK.ciclos[ciclo] || {};
  return own.otraMarca ? `redactor de contenido del ciclo «${own.nombre}» (distinto de ${PACK.marca})` : `redactor de contenido de ${PACK.marca}`;
};

function rulesBlock(ciclo, materiales) {
  const own = PACK.ciclos[ciclo] || {};
  let t;
  if (own.otraMarca) {
    t = `REGLAS UNIVERSALES DE REDACCIÓN. Este ciclo NO es de ${PACK.marca}: no apliques reglas, nomenclaturas ni criterios de ${PACK.marca}.\n${bullets(PACK.globales.filter((_, i) => !(PACK.marcaOnly || []).includes(i)))}`;
  } else {
    t = `REGLAS GENERALES DE ${PACK.marca} (${PACK.version}). ${PACK.alcance}\n${bullets(PACK.globales)}`;
    if (own.hereda && typeof own.hereda === "object") t += `\n\nEl ciclo «${own.nombre}» usa las reglas de Recu-Retención PN para ${Object.keys(own.hereda).filter((k) => k !== "default").join(" y ")} y las de Recu-Retención PE para los demás materiales.`;
    baseIds(ciclo).forEach((id) => {
      const c = PACK.ciclos[id] || {};
      if (c.reglas && c.reglas.length) t += `\n\nREGLAS DEL CICLO ${c.nombre}:\n${bullets(c.reglas)}`;
      if (c.segmentos) t += "\nSEGMENTOS DEL CICLO:\n" + Object.entries(c.segmentos).map(([k, v]) => `- ${k}: ${v}`).join("\n");
    });
    if (own.sinReglas && !own.hereda) t += `\n\nEl ciclo «${own.nombre}» no tiene reglas específicas cargadas: aplica solo las reglas generales.`;
  }
  materiales.forEach((m) => {
    const mm = PACK.materiales[m];
    if (mm) t += `\n\nMATERIAL ${mm.nombre} (${m}):\n${bullets(mm.reglas)}`;
  });
  return t;
}

const styleBlock = (p) => {
  const est = String(p.estilo || "").slice(0, 3500).trim();
  const ex = (Array.isArray(p.ejemplos) ? p.ejemplos : []).slice(0, 4).map((x) => "- " + String(x).slice(0, 300));
  if (!est && !ex.length) return "";
  return `\nESTILO Y ESTRUCTURA APRENDIDOS DE UNA PARRILLA ANTERIOR AUTORIZADA. Úsalos solo para entender el tipo de resultado esperado (estilo, reglas y estructura). NO copies frases, titulares ni combinaciones de palabras: cada texto debe ser nuevo y responder al brief actual. Si algo contradice las reglas vigentes, mandan las reglas vigentes.\n${est}${ex.length ? "\nEjemplos de referencia (solo para calibrar el nivel de detalle; no los reutilices ni los parafrasees de cerca):\n" + ex.join("\n") : ""}\n`;
};

const OUT = 'Responde SOLO JSON: [{"i":número,"campos":{"id_del_campo":"texto"}}]. Usa exactamente los ids de campo indicados en cada pieza.';
const LEGAL = "NO escribas textos legales ni notas al pie: el sistema los inserta. En los materiales con legal, coloca dentro del copy el superíndice ¹ junto a la mención del préstamo (Credimax) y ² junto a MSI/tarjetas participantes o a un descuento adicional/regalo/promoción (TyC), solo cuando esos beneficios aparezcan.";
const TEMP = `Si una pieza trae "temporalidad", úsala exactamente como viene: no la cambies, no la inventes ni la completes. En los materiales ${(PACK.tag && PACK.tag.materiales || []).join(", ")} el sistema inserta el tag de temporalidad al inicio del Copy in como indicación para Diseño: NO escribas ese tag ni repitas la temporalidad como etiqueta; basta con que ninguna fecha o cifra del copy la contradiga. En los demás materiales, incluye la vigencia cuando el formato lo permita y el brief la traiga.`;
const COUNT = "Cuenta los caracteres con cuidado (los emojis y los espacios cuentan) y no excedas el máximo de cada campo.";

const PROMPTS = {
  ping: () => 'Responde exactamente este JSON: {"ok":true}',
  generate: (p) => {
    const chunk = (p.chunk || []).slice(0, 6);
    return `Eres ${who(p.ciclo)}. Sigue estas reglas al pie de la letra.

${rulesBlock(p.ciclo, [...new Set(chunk.map((c) => c.material))])}

Guía adicional del cliente: ${String(p.voz || "").slice(0, 4000) || "(ninguna)"}
${styleBlock(p)}

Usa ÚNICAMENTE los datos de cada brief (oferta, producto, precios, vigencia): no inventes cifras, semanalidades, MSI, escasez ni condiciones. ${LEGAL} ${TEMP} ${COUNT}
${OUT}
Piezas: ${J(chunk)}`;
  },
  fix: (p) => {
    const chunk = (p.chunk || []).slice(0, 6);
    return `Eres editor y ${who(p.ciclo)}. Corrige cada pieza para que cumpla las reglas y límites, resolviendo todos los problemas listados en "problemas". Conserva el sentido, los datos del brief y el tono; cambia solo lo necesario. Devuelve todos los campos de texto de la pieza (los corregidos y los que no cambian).

${rulesBlock(p.ciclo, [...new Set(chunk.map((c) => c.material))])}
${styleBlock(p)}
${LEGAL} ${TEMP} ${COUNT}
${OUT}
Piezas: ${J(chunk)}`;
  },
  refstyle: (p) => `Eres analista de estilo editorial de ${PACK.marca}. Te comparto ${(p.records || []).length} piezas de una parrilla ANTERIOR y AUTORIZADA (brief → copies finales) y estadísticas calculadas sobre toda la parrilla. Tu objetivo es describir el tipo de resultado que se espera (estilo, reglas observadas y estructura) para que otro redactor produzca copies NUEVOS de calidad y forma equivalentes, SIN copiar frases ni combinaciones de palabras.
Responde SOLO JSON: {"resumen":"2-3 frases","tono":"","estructura_por_material":[{"material":"código","campos":[{"campo":"id","patron":"descripción abstracta de cómo se construye","longitud_tipica":""}]}],"recursos":"emojis, mayúsculas, puntuación, personalización (#NOMBRE#), urgencia, cifras, superíndices","vocabulario_recurrente":[],"cierres_y_cta":[],"reglas_observadas":["reglas que se cumplen de forma sistemática"],"posibles_excepciones":["rasgos que contradicen las reglas vigentes: señálalos"],"particularidades":[],"patrones":["plantillas abstractas como [Gancho con emoji] + [beneficio con cifra] + [CTA]"],"guia":"máximo 900 caracteres con instrucciones de estilo y estructura listas para usar al redactar; describe patrones, no transcribas copies","ejemplos":[{"material":"código","texto":"copy literal representativo"}]}.
Reglas: en "guia" y "patrones" NO incluyas frases literales de las piezas. "ejemplos" (máximo 6, variados) sí son literales, solo para que la persona los revise. Basa todo en los datos; si hay pocas piezas, dilo en "resumen". Reglas vigentes de la marca, para detectar contradicciones:
${bullets(PACK.globales)}
Estadísticas: ${J(p.stats || {}).slice(0, 4000)}
Piezas: ${J((p.records || []).slice(0, 40))}`,
  proof: (p) => `Eres corrector de estilo profesional de español de México (RAE, Ortografía 2010). Revisa ortografía, acentuación, gramática, puntuación (¿? ¡!), concordancia, mayúsculas y typos. Corrige SOLO errores reales: no cambies estilo, tono ni longitud. Conserva tal cual: “${PACK.glosario.marca}” (siempre en minúsculas), ${PACK.glosario.propios.join(", ")}, las variables como ${PACK.glosario.tokens.join(", ")}, los superíndices ¹ ² y los emojis. Si no hay errores, ok=true y corrected igual al original. Responde SOLO un arreglo JSON: [{"id":"el mismo id recibido","ok":boolean,"corrected":"texto","issues":["descripción breve"]}].
Textos: ${J((p.items || []).slice(0, 20).map((x) => ({ id: x.id, text: String(x.text).slice(0, 600) })))}`,
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const codes = (process.env.ACCESS_CODES || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!codes.length || !codes.includes(req.headers["x-access-code"]))
    return res.status(401).json({ error: "Código inválido" });
  const { task, ...p } = req.body || {};
  if (!PROMPTS[task]) return res.status(400).json({ error: "Tarea desconocida" });
  try {
    const out = await run(PROMPTS[task](p), !!p.confidential);
    const info = { provider: out.provider + (out.tried.length ? " (respaldo)" : ""), model: out.model };
    return res.status(200).json({ data: task === "ping" ? { ...out.data, ...info } : out.data, via: out.provider });
  } catch (e) {
    console.error(e.message);
    if (e.code === "NO_CONF") return res.status(403).json({ error: e.message });
    return res.status(502).json({ error: "Ningún proveedor de IA respondió bien. " + String(e.message).slice(0, 300) });
  }
};
