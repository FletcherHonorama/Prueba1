/* Edita valores de celdas directamente en el XML de un .xlsx para conservar estilos, imágenes y fórmulas.
   Funciones puras (sin DOM): funcionan en el navegador (window.XPatch) y en Node (module.exports). */
(function (root) {
  const X = {};
  const dec = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const esc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const colNum = (letters) => { let n = 0; for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const attr = (tag, name) => { const m = tag.match(new RegExp("\\b" + name + '="([^"]*)"')); return m ? m[1] : null; };

  /* Ruta del XML de una hoja a partir de su nombre */
  X.sheetPathFor = function (wbXml, relsXml, name) {
    const re = /<sheet\b[^>]*>/g; let m;
    while ((m = re.exec(wbXml))) {
      const nm = attr(m[0], "name"), rid = attr(m[0], "r:id");
      if (nm != null && dec(nm) === name && rid) {
        const rel = new RegExp('<Relationship\\b[^>]*\\bId="' + rid + '"[^>]*>').exec(relsXml);
        const t = rel && attr(rel[0], "Target");
        if (!t) return null;
        return t.charAt(0) === "/" ? t.slice(1) : "xl/" + t.replace(/^\.\//, "");
      }
    }
    return null;
  };

  /* Pide a Excel recalcular las fórmulas al abrir (los conteos # carac. quedan al día) */
  X.setFullCalc = function (x) {
    if (/<calcPr\b/.test(x)) return x.replace(/<calcPr\b([^>]*?)(\/?)>/, (m, a, sl) => "<calcPr" + a.replace(/\sfullCalcOnLoad="[^"]*"/, "") + ' fullCalcOnLoad="1"' + sl + ">");
    const tag = '<calcPr calcId="191029" fullCalcOnLoad="1"/>';
    if (/<\/definedNames>/.test(x)) return x.replace("</definedNames>", "</definedNames>" + tag);
    if (/<\/externalReferences>/.test(x)) return x.replace("</externalReferences>", "</externalReferences>" + tag);
    return x.replace("</sheets>", "</sheets>" + tag);
  };

  function newCell(ref, style, e, existing) {
    const s = style ? ' s="' + style + '"' : "";
    if (e.kind === "text") {
      return e.text === "" ? '<c r="' + ref + '"' + s + "/>" : '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(e.text) + "</t></is></c>";
    }
    // conteo de caracteres: conserva la fórmula existente y actualiza el valor en caché
    const f = existing && existing.match(/<f\b[^>]*?(?:\/>|>[\s\S]*?<\/f>)/);
    return '<c r="' + ref + '"' + s + ">" + (f ? f[0] : "<f>" + e.formula + "</f>") + "<v>" + e.n + "</v></c>";
  }

  function patchRow(rowXml, edits) {
    const selfClosing = /\/>$/.test(rowXml) && !/<\/row>$/.test(rowXml);
    let open, inner;
    if (selfClosing) { open = rowXml.replace(/\/>$/, ">"); inner = ""; }
    else { const i = rowXml.indexOf(">") + 1; open = rowXml.slice(0, i); inner = rowXml.slice(i, rowXml.length - 6); }
    open = open.replace(/\sspans="[^"]*"/, "");
    const cells = []; const re = /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g; let m;
    while ((m = re.exec(inner))) { const col = (m[0].match(/\br="([A-Z]+)\d+"/) || [])[1]; cells.push({ cn: colNum(col), xml: m[0] }); }
    const rowNo = (open.match(/\br="(\d+)"/) || [])[1];
    edits.forEach((e) => {
      const i = cells.findIndex((c) => c.cn === e.cn), ex = i >= 0 ? cells[i].xml : null;
      const style = ex ? attr(ex.match(/^<c\b[^>]*>/)[0], "s") : null;
      const xml = newCell(e.col + rowNo, style, e, ex);
      if (i >= 0) cells[i].xml = xml; else cells.push({ cn: e.cn, xml });
    });
    cells.sort((a, b) => a.cn - b.cn);
    return open + cells.map((c) => c.xml).join("") + "</row>";
  }

  /* edits: [{ref:"M22", kind:"text", text:"…"} | {ref:"N22", kind:"len", n:12, formula:"+LEN(M22)"}] */
  X.patchSheet = function (xml, edits) {
    const byRow = {};
    edits.forEach((e) => {
      const m = e.ref.match(/^([A-Z]+)(\d+)$/); if (!m) return;
      (byRow[m[2]] = byRow[m[2]] || []).push(Object.assign({ col: m[1], cn: colNum(m[1]) }, e));
    });
    const missing = [];
    Object.keys(byRow).forEach((r) => {
      const re = new RegExp('<row\\b[^>]*\\br="' + r + '"[^>]*?(?:/>|>[\\s\\S]*?</row>)');
      if (!re.test(xml)) { missing.push(+r); return; }
      xml = xml.replace(re, (rowXml) => patchRow(rowXml, byRow[r]));
    });
    return { xml, missing };
  };

  root.XPatch = X;
  if (typeof module !== "undefined" && module.exports) module.exports = X;
})(typeof window !== "undefined" ? window : globalThis);
