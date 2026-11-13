// Descarga una hoja de Google Sheets compartida como "Cualquier persona con el enlace" y devuelve su CSV.
// Solo acepta enlaces de docs.google.com/spreadsheets. Las hojas privadas no se pueden leer: descárgalas y súbelas como archivo.
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const codes = (process.env.ACCESS_CODES || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!codes.length || !codes.includes(req.headers["x-access-code"])) return res.status(401).json({ error: "Código inválido" });
  const url = String((req.body || {}).url || "");
  const m = url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (!m) return res.status(400).json({ error: "Pega un enlace de Google Sheets (docs.google.com/spreadsheets/d/…)." });
  const gid = (url.match(/[#&?]gid=(\d+)/) || [])[1] || "0";
  try {
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`, { redirect: "follow" });
    const ct = r.headers.get("content-type") || "";
    if (!r.ok || !/csv|text\/plain/i.test(ct))
      return res.status(400).json({ error: "No se pudo leer la hoja. Debe estar compartida como «Cualquier persona con el enlace: lector». Si es confidencial, descárgala como CSV o Excel y súbela como archivo." });
    const csv = await r.text();
    if (csv.length > 3000000) return res.status(413).json({ error: "La hoja es demasiado grande (máx. 3 MB)." });
    return res.status(200).json({ csv });
  } catch (e) {
    return res.status(502).json({ error: "No se pudo descargar la hoja." });
  }
};
