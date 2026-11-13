// Función serverless (Vercel) para el paquete de reglas de la marca (rules/shopinbaz.json). Las claves viven SOLO aquí, como variables de entorno.
// PROVIDER_ORDER = proveedores en orden de preferencia, p. ej. "gemini,groq" (opciones: gemini, groq, claude).
// Si un proveedor está saturado, se reintenta y después se pasa automáticamente al siguiente.
const ORDER = (process.env.PROVIDER_ORDER || process.env.PROVIDER || "gemini").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
const RETRY_MS = +process.env.RETRY_MS || 1500;
const PACK = require("../rules/shopinbaz.json");
const SYSTEM = "Responde únicamente con JSON válido, sin texto adicional ni bloques de código.";

const PROVIDERS = {
  gemini: {
    vision: true,
    key: () => process.env.GEMINI_API_KEY,
    model: () => process.env.GEMINI_MODEL || "gemini-3.5-flash-lite", // confirma el nombre vigente en Google AI Studio
    async call(prompt, model, images) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: prompt }, ...(images || []).map((i) => ({ inlineData: { mimeType: i.mime, data: i.data } }))] }],
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
    async call(prompt, model, images) {
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
    vision: true,
    key: () => process.env.ANTHROPIC_API_KEY,
    model: () => process.env.MODEL || "claude-sonnet-5-5",
    async call(prompt, model, images) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 4000, system: SYSTEM, messages: [{ role: "user", content: images && images.length ? [...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mime, data: i.data } })), { type: "text", text: prompt }] : prompt }] }),
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

async function run(prompt, confidential, images) {
  const tried = [];
  let order = confidential ? ORDER.filter((n) => CONF_OK.includes(n)) : ORDER;
  if (confidential && !order.some((n) => PROVIDERS[n] && PROVIDERS[n].key())) {
    const e = new Error("Modo confidencial: no hay un proveedor autorizado y configurado. Define CONFIDENTIAL_PROVIDERS (y su clave) en Vercel, o desactiva el modo confidencial para contenido no sensible.");
    e.code = "NO_CONF";
    throw e;
  }
  if (images && images.length) {
    order = order.filter((n) => PROVIDERS[n] && PROVIDERS[n].vision);
    if (!order.some((n) => PROVIDERS[n].key())) {
      const e = new Error("Para analizar imágenes hace falta un proveedor con visión (Gemini o Claude) en PROVIDER_ORDER, con su clave y, en modo confidencial, autorizado en CONFIDENTIAL_PROVIDERS.");
      e.code = "NO_VISION";
      throw e;
    }
  }
  for (const name of order) {
    const p = PROVIDERS[name];
    if (!p) { tried.push(name + ": proveedor desconocido"); continue; }
    if (!p.key()) { tried.push(name + ": falta la clave"); continue; }
    const model = p.model();
    for (let i = 0; i < 2; i++) {
      try {
        const data = parseJSON(await p.call(prompt, model, images));
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

const OUT = 'Responde SOLO JSON: [{"i":número,"campos":{"id_del_campo":"texto"}}]. Usa exactamente los ids de campo indicados en cada pieza.';
const LEGAL = "NO escribas textos legales ni notas al pie: el sistema los inserta. En los materiales con legal, coloca dentro del copy el superíndice ¹ junto a la mención del préstamo (Credimax) y ² junto a MSI/tarjetas participantes o a un descuento adicional/regalo/promoción (TyC), solo cuando esos beneficios aparezcan.";
const COUNT = "Cuenta los caracteres con cuidado (los emojis y los espacios cuentan) y no excedas el máximo de cada campo.";

const cleanImages = (a) => (Array.isArray(a) ? a : []).slice(0, 6).filter((i) => i && /^image\/(jpeg|png|webp)$/.test(i.mime) && typeof i.data === "string" && i.data.length < 1500000 && /^[A-Za-z0-9+/=]+$/.test(i.data));

const PROMPTS = {
  ping: () => 'Responde exactamente este JSON: {"ok":true}',
  generate: (p) => {
    const chunk = (p.chunk || []).slice(0, 6);
    return `Eres ${who(p.ciclo)}. Sigue estas reglas al pie de la letra.

${rulesBlock(p.ciclo, [...new Set(chunk.map((c) => c.material))])}

Guía adicional del cliente: ${String(p.voz || "").slice(0, 4000) || "(ninguna)"}

Usa ÚNICAMENTE los datos de cada brief (oferta, producto, precios, vigencia): no inventes cifras, semanalidades, MSI, escasez ni condiciones. ${LEGAL} ${COUNT}
${OUT}
Piezas: ${J(chunk)}`;
  },
  fix: (p) => {
    const chunk = (p.chunk || []).slice(0, 6);
    return `Eres editor y ${who(p.ciclo)}. Corrige cada pieza para que cumpla las reglas y límites, resolviendo todos los problemas listados en "problemas". Conserva el sentido, los datos del brief y el tono; cambia solo lo necesario. Devuelve todos los campos de texto de la pieza (los corregidos y los que no cambian).

${rulesBlock(p.ciclo, [...new Set(chunk.map((c) => c.material))])}

${LEGAL} ${COUNT}
${OUT}
Piezas: ${J(chunk)}`;
  },
  imgstyle: (p) => `Eres director creativo y estratega de contenido de ${PACK.marca}. Te comparto ${(p.images || []).length} imágenes de piezas anteriores (banners, push, in-app, creatividades). Observa el tono y el estilo del TEXTO que aparece en ellas y el estilo visual que acompaña al copy, para que otro redactor pueda escribir copy nuevo con la misma identidad.
Responde SOLO JSON: {"resumen":"2-3 frases","tono":"","recursos_del_texto":"emojis, mayúsculas, puntuación, longitud y estructura (gancho, beneficio, CTA)","estilo_visual":"colores, composición, tipografía, personajes o mascota, jerarquía y cómo se relaciona con el copy","textos_visibles":[{"material":"si se reconoce","texto":"transcripción literal"}],"particularidades":["rasgos concretos observados"],"guia":"máximo 700 caracteres, lista para usarse como guía de voz","ejemplos":[{"material":"","texto":"texto literal visible en las imágenes"}]}.
No inventes lo que no se ve: transcribe solo texto legible y omite lo que no lo sea. Estas son las reglas vigentes de la marca; si lo observado las contradice (por ejemplo usa “OFF”), anótalo en "particularidades" y NO lo incluyas en la guía:
${bullets(PACK.globales)}`,
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
    const images = task === "imgstyle" ? cleanImages(p.images) : undefined;
    if (task === "imgstyle" && !images.length) return res.status(400).json({ error: "No hay imágenes válidas (JPG, PNG o WebP)." });
    const out = await run(PROMPTS[task]({ ...p, images }), !!p.confidential, images);
    const info = { provider: out.provider + (out.tried.length ? " (respaldo)" : ""), model: out.model };
    return res.status(200).json({ data: task === "ping" ? { ...out.data, ...info } : out.data, via: out.provider });
  } catch (e) {
    console.error(e.message);
    if (e.code === "NO_CONF") return res.status(403).json({ error: e.message });
    if (e.code === "NO_VISION") return res.status(400).json({ error: e.message });
    return res.status(502).json({ error: "Ningún proveedor de IA respondió bien. " + String(e.message).slice(0, 300) });
  }
};
