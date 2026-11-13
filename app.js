"use strict";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const E = window.Engine;
const GATED = ["Aprobado Cliente", "Validado LEGAL"];
var PACK = null, items = [], filter = "all", shown = 60, busy = false, stopFlag = false, loaded = false, saveT = null;
var legalLib = {}, ovr = {}, IMP = null, CODE = sessionStorage.getItem("acc") || "";
const nid = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const msg = (t) => { $("#rmsg").textContent = t; };

/* ---------- acceso y llamadas al servidor ---------- */
function showLogin(m) { $("#lg").style.display = "flex"; $("#lgm").textContent = m || ""; }
$("#lgb").onclick = () => { CODE = $("#lgi").value.trim(); sessionStorage.setItem("acc", CODE); $("#lg").style.display = "none"; };
async function ai(body) {
  if (!CODE) { showLogin(); throw new Error("Falta el código de acceso"); }
  const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json", "x-access-code": CODE }, body: JSON.stringify(body) });
  if (r.status === 401) { sessionStorage.removeItem("acc"); CODE = ""; showLogin("Código incorrecto"); throw new Error("Código incorrecto"); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Error del servidor");
  return j.data;
}

/* ---------- helpers de piezas ---------- */
const mat = (p) => PACK.materiales[p.material];
const lim = (p) => E.limits(PACK, p.ciclo, p.material, ovr);
const nz = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
const isEmpty = (p) => !mat(p) || !mat(p).campos.some((c) => (p.fields[c.id] || "").trim());
function titlesFor(p) {
  const out = [];
  items.forEach((o) => { if (o !== p && o.ciclo === p.ciclo && o.material === p.material) { const t = o.fields.titulo || o.fields.out_titulo; if (t) out.push(nz(t)); } });
  return out;
}
const check = (p) => (mat(p) ? E.validate(p, PACK, { ovr, legalLib, titles: titlesFor(p) }) : [{ s: "err", m: "Material sin reglas definidas" }]);
const errCount = (p) => check(p).filter((x) => x.s === "err").length;
const skuList = (p) => E.parseSkus(p.brief && p.brief.sku);
const skuState = (p, s) => ((p.skus || {})[s] || {}).estado || "Sin verificar";
const skuPending = (p) => $("#skureq").checked && skuList(p).some((s) => skuState(p, s) !== "Disponible");
const skuLink = (s) => "https://www.google.com/search?q=" + encodeURIComponent(s + " " + ($("#skusite").value.trim() || "Elektra"));
const canApprove = (p) => !isEmpty(p) && errCount(p) === 0 && p.aiOk && !skuPending(p);
function newPiece(ciclo, material, brief) {
  return { id: nid(), t: Date.now(), ciclo, material, brief, fields: {}, skus: {}, estado: "Por revisar", aiOk: false, aiSug: null };
}
function specs(p) {
  const L = lim(p);
  return mat(p).campos.map((c) => ({ id: c.id, nombre: c.nombre, max: L[c.id] ? L[c.id].max : undefined }));
}

/* ---------- render ---------- */
function chipsHtml(p) {
  const c = check(p);
  if (isEmpty(p)) return '<span class="chip inf">Sin texto todavía</span>';
  return c.length ? c.map((x) => '<span class="chip ' + x.s + '">' + esc(x.m) + "</span>").join("") : '<span class="chip ok">Reglas: sin alertas</span>';
}
function legalHtml(p) {
  if (!mat(p).legal) return "";
  const lg = E.autoLegal(p, PACK, legalLib);
  return '<div class="legal"><b>Legal (automático)</b>: ' + (lg.texto ? esc(lg.texto) : lg.need.length ? "falta cargar el texto legal" : "no aplica por ahora") + "</div>";
}
const SKU_ST = ["Sin verificar", "Disponible", "Agotado", "No encontrado"];
function skuHtml(p) {
  const l = skuList(p); if (!l.length) return "";
  return '<div class="legal"><b>SKU a verificar</b> (abre la búsqueda, entra a la ficha del producto y confirma la disponibilidad antes de aprobar)' + l.map((s) => {
    const o = (p.skus || {})[s] || {}, st = skuState(p, s);
    return '<div class="foot"><a href="' + esc(skuLink(s)) + '" target="_blank" rel="noopener noreferrer">' + esc(s) + ' · buscar en Google ↗</a>' +
      '<select data-a="skust" data-id="' + p.id + '" data-k="' + esc(s) + '">' + SKU_ST.map((x) => "<option" + (x === st ? " selected" : "") + ">" + x + "</option>").join("") + "</select>" +
      '<input type="text" style="flex:1 1 220px" placeholder="Pega aquí el enlace del producto (opcional)" data-a="skuurl" data-id="' + p.id + '" data-k="' + esc(s) + '" value="' + esc(o.url || "") + '">' +
      (st === "Agotado" || st === "No encontrado" ? '<span class="chip err">' + st + "</span>" : st === "Disponible" ? '<span class="chip ok">Disponible</span>' : "") + "</div>";
  }).join("") + "</div>";
}
function aiHtml(p) {
  if (p.aiOk) return '<span class="chip ok">IA: sin errores</span>';
  if (p.aiSug) {
    return '<span class="chip warn">IA encontró observaciones</span><div class="sug">' + Object.entries(p.aiSug).map(([k, v]) => "<b>" + esc((mat(p).campos.find((c) => c.id === k) || {}).nombre || k) + ":</b> " + esc(v.text) + (v.issues && v.issues.length ? "<br><small>" + esc(v.issues.join(" · ")) + "</small>" : "")).join("<br>") +
      '<div class="foot"><button data-a="apply" data-id="' + p.id + '">Aplicar correcciones</button></div></div>';
  }
  return '<span class="chip inf">IA: pendiente de verificar</span>';
}
function footHtml(p) {
  const opts = PACK.estados.map((s) => '<option' + (s === p.estado ? " selected" : "") + ">" + s + "</option>").join("");
  const mats = Object.entries(PACK.materiales).map(([k, v]) => '<option value="' + k + '"' + (k === p.material ? " selected" : "") + ">" + esc(v.nombre) + "</option>").join("");
  return '<select data-a="st" data-id="' + p.id + '">' + opts + '</select><select data-a="mat" data-id="' + p.id + '">' + mats + '</select><button data-a="del" data-id="' + p.id + '">Eliminar</button>';
}
function cardHtml(p) {
  const m = mat(p), L = lim(p), b = p.brief;
  const meta = [m.nombre, (PACK.ciclos[p.ciclo] || {}).nombre, b.dia && b.dia + (b.hora ? " " + b.hora : ""), b.categoria, b.segKey].filter(Boolean).map(esc).join(" · ");
  const fields = m.campos.map((c) => {
    const v = p.fields[c.id] || "", l = L[c.id];
    return '<div class="fl"><label>' + esc(c.nombre) + '</label><span class="cnt' + (l && v.length > (l.hasta || l.max) ? " over" : "") + '" data-n="' + c.id + '">' + v.length + (l ? "/" + l.max : "") + "</span></div>" +
      '<textarea rows="' + (c.id === "in" ? 3 : 2) + '" spellcheck="true" lang="es-MX" data-id="' + p.id + '" data-c="' + c.id + '">' + esc(v) + "</textarea>";
  }).join("");
  return '<div class="meta">' + meta + '</div><div class="brief"><b>Oferta:</b> ' + esc((b.oferta || "").slice(0, 200)) + (b.consideraciones ? " · <i>" + esc(b.consideraciones.slice(0, 80)) + "</i>" : "") + "</div>" + fields +
    '<div data-r="legal">' + legalHtml(p) + '</div><div data-r="sku">' + skuHtml(p) + '</div><div class="chips" data-r="chips">' + chipsHtml(p) + '</div><div class="ai" data-r="ai">' + aiHtml(p) + '</div><div class="foot" data-r="foot">' + footHtml(p) + "</div>";
}
function refreshCard(p) {
  const el = document.getElementById("c_" + p.id);
  if (el) {
    el.className = "card item" + (GATED.includes(p.estado) ? " appr" : "");
    el.querySelector("[data-r=chips]").innerHTML = chipsHtml(p);
    el.querySelector("[data-r=legal]").innerHTML = legalHtml(p);
    el.querySelector("[data-r=sku]").innerHTML = skuHtml(p);
    el.querySelector("[data-r=ai]").innerHTML = aiHtml(p);
    const L = lim(p);
    mat(p).campos.forEach((c) => { const n = el.querySelector('[data-n="' + c.id + '"]'); if (n) { const v = (p.fields[c.id] || "").length, l = L[c.id]; n.textContent = v + (l ? "/" + l.max : ""); n.className = "cnt" + (l && v > (l.hasta || l.max) ? " over" : ""); } });
  }
  stats();
}
function visible(p) {
  if (filter === "err") return !isEmpty(p) && errCount(p) > 0;
  if (filter === "pend") return isEmpty(p);
  if (filter === "noai") return !isEmpty(p) && !p.aiOk;
  if (filter === "ok") return GATED.includes(p.estado);
  if (filter === "sku") return skuPending(p);
  return true;
}
function render() {
  if (!PACK) return;
  const l = $("#list"), v = items.filter(visible);
  if (!items.length) l.innerHTML = '<p class="msg">Aún no hay piezas. Importa tu parrilla o agrega una manualmente.</p>';
  else l.innerHTML = v.length ? v.slice(0, shown).map((p) => '<div class="card item' + (GATED.includes(p.estado) ? " appr" : "") + '" id="c_' + p.id + '">' + cardHtml(p) + "</div>").join("") : '<p class="msg">Nada en este filtro.</p>';
  $("#more").style.display = v.length > shown ? "inline-block" : "none";
  stats();
}
function stats() {
  const filled = items.filter((p) => !isEmpty(p));
  const S = [["Total", items.length], ["Por generar", items.length - filled.length], ["Con errores", filled.filter((p) => errCount(p) > 0).length], ["Sin verificar IA", filled.filter((p) => !p.aiOk).length], ["SKU por verificar", items.filter(skuPending).length], ["Aprobadas", items.filter((p) => GATED.includes(p.estado)).length]];
  $("#stats").innerHTML = S.map((a) => '<div class="st"><b>' + a[1] + "</b><span>" + a[0] + "</span></div>").join("");
  $("#gen").disabled = busy || S[1][1] === 0; $("#proof").disabled = busy || S[3][1] === 0;
  $("#fix").disabled = busy || filled.every((p) => !check(p).some((x) => x.s !== "ok" && !/Sin texto/.test(x.m)));
  persist();
}

/* ---------- acciones sobre piezas ---------- */
function onField(id, c, v) {
  const p = items.find((x) => x.id === id); if (!p) return;
  p.fields[c] = v; p.aiOk = false; p.aiSug = null;
  if (GATED.includes(p.estado)) p.estado = "Ajustado";
  refreshCard(p);
}
function onState(id, val) {
  const p = items.find((x) => x.id === id); if (!p) return;
  if (GATED.includes(val) && !canApprove(p)) { msg("No se puede marcar «" + val + "»: la pieza tiene errores, falta la verificación de IA o hay SKU sin confirmar como «Disponible»."); render(); return; }
  p.estado = val; refreshCard(p);
}
function onSku(id, sku, field, val) {
  const p = items.find((x) => x.id === id); if (!p) return;
  p.skus = p.skus || {}; const o = (p.skus[sku] = Object.assign({ estado: "Sin verificar", url: "" }, p.skus[sku])); o[field] = val; o.fecha = new Date().toISOString().slice(0, 10);
  if (GATED.includes(p.estado) && !canApprove(p)) { p.estado = "Por revisar"; msg("La pieza volvió a «Por revisar»: un SKU ya no está como «Disponible»."); }
  refreshCard(p);
}
function onMat(id, val) {
  const p = items.find((x) => x.id === id); if (!p || !PACK.materiales[val]) return;
  const keep = {}; PACK.materiales[val].campos.forEach((c) => { if (p.fields[c.id]) keep[c.id] = p.fields[c.id]; });
  p.material = val; p.fields = keep; p.aiOk = false; p.aiSug = null; if (GATED.includes(p.estado)) p.estado = "Por revisar"; render();
}
function onAct(a, id) {
  const p = items.find((x) => x.id === id); if (!p) return;
  if (a === "del") { items = items.filter((x) => x !== p); render(); }
  if (a === "apply" && p.aiSug) { Object.entries(p.aiSug).forEach(([k, v]) => { p.fields[k] = v.text; }); p.aiSug = null; p.aiOk = true; render(); }
}
$("#list").addEventListener("input", (e) => { const t = e.target; if (t.tagName === "TEXTAREA") onField(t.dataset.id, t.dataset.c, t.value); });
$("#list").addEventListener("change", (e) => { const t = e.target; if (t.dataset && t.dataset.a === "st") onState(t.dataset.id, t.value); if (t.dataset && t.dataset.a === "mat") onMat(t.dataset.id, t.value); if (t.dataset && t.dataset.a === "skust") onSku(t.dataset.id, t.dataset.k, "estado", t.value); if (t.dataset && t.dataset.a === "skuurl") onSku(t.dataset.id, t.dataset.k, "url", t.value.trim()); });
$("#list").addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("button"); if (b && b.dataset.a) onAct(b.dataset.a, b.dataset.id); });
document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { filter = b.dataset.f; shown = 60; document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b)); render(); }));
$("#more").onclick = () => { shown += 60; render(); };
$("#stop").onclick = () => { stopFlag = true; };

/* ---------- IA: generar, corregir, verificar ---------- */
function entry(p, k, fix) {
  const b = p.brief, o = { i: k, material: p.material, campos: specs(p), categoria: b.categoria, oferta: b.oferta, consideraciones: b.consideraciones, dia: b.dia, hora: b.hora, segmento: b.segKey || undefined };
  if ($("#usesku").checked && b.sku) o.sku = b.sku;
  if (fix) { o.actuales = p.fields; o.problemas = check(p).filter((x) => !/Sin texto/.test(x.m)).map((x) => x.m); }
  return o;
}
function applyFields(p, campos) {
  mat(p).campos.forEach((c) => { if (typeof campos[c.id] === "string") p.fields[c.id] = campos[c.id].trim(); });
  p.aiOk = false; p.aiSug = null; if (GATED.includes(p.estado)) p.estado = "Ajustado";
}
async function runAI(task, pieces, label) {
  if (!pieces.length) return;
  busy = true; stopFlag = false; stats(); let done = 0;
  const byC = {}; pieces.forEach((p) => (byC[p.ciclo] = byC[p.ciclo] || []).push(p));
  try {
    for (const c of Object.keys(byC)) {
      const list = byC[c];
      for (let i = 0; i < list.length && !stopFlag; i += 4) {
        const ch = list.slice(i, i + 4); msg(label + " " + Math.min(done + ch.length, pieces.length) + " de " + pieces.length + "…");
        const res = await ai({ task, ciclo: c, voz: $("#voz").value, confidential: $("#confmode").checked, chunk: ch.map((p, k) => entry(p, k, task === "fix")) });
        (res || []).forEach((o) => { const p = ch[o.i]; if (p && o.campos) applyFields(p, o.campos); });
        done += ch.length; render();
      }
    }
    msg(done + " piezas procesadas" + (stopFlag ? " (detenido)" : "") + ".");
  } catch (e) { msg("Error: " + (e && e.message || "intenta de nuevo") + ". Lo ya procesado se conserva."); }
  busy = false; render();
}
async function generate() { await runAI("generate", items.filter(isEmpty), "Generando"); if (!stopFlag) await proof(); }
async function fixAll() { await runAI("fix", items.filter((p) => !isEmpty(p) && check(p).some((x) => !/Sin texto/.test(x.m))), "Corrigiendo"); if (!stopFlag) await proof(); }
async function proof() {
  const pend = items.filter((p) => !p.aiOk && !isEmpty(p)); if (!pend.length) return;
  const flat = [];
  pend.forEach((p) => mat(p).campos.forEach((c) => { const t = p.fields[c.id] || ""; if (t.trim()) flat.push({ p, c, id: p.id + "|" + c.id, text: t }); }));
  busy = true; stats(); const R = {};
  try {
    for (let i = 0; i < flat.length; i += 20) {
      msg("Verificando ortografía " + Math.min(i + 20, flat.length) + " de " + flat.length + "…");
      const res = await ai({ task: "proof", confidential: $("#confmode").checked, items: flat.slice(i, i + 20).map((x) => ({ id: x.id, text: x.text })) });
      (res || []).forEach((o) => { R[o.id] = o; });
    }
    pend.forEach((p) => {
      const sug = {}; let all = true, any = false;
      mat(p).campos.forEach((c) => {
        const t = p.fields[c.id] || ""; if (!t.trim()) return;
        const o = R[p.id + "|" + c.id]; if (!o) { all = false; return; }
        any = true;
        if (!(o.ok && o.corrected === t) && typeof o.corrected === "string" && o.corrected !== t) { sug[c.id] = { text: o.corrected, issues: o.issues || [] }; all = false; }
      });
      if (any && all) { p.aiOk = true; p.aiSug = null; } else if (Object.keys(sug).length) { p.aiSug = sug; p.aiOk = false; }
    });
    msg("Verificación completa.");
  } catch (e) { msg("No se pudo verificar: " + (e && e.message || "intenta de nuevo")); }
  busy = false; render();
}
$("#gen").onclick = generate; $("#fix").onclick = fixAll; $("#proof").onclick = proof;
$("#ping").onclick = async () => { msg("Probando…"); try { const d = await ai({ task: "ping" }); msg("Conexión OK: " + d.provider + " · " + d.model); } catch (e) { msg("Falló: " + e.message); } };

/* ---------- referencias visuales ---------- */
var IMGS = [], IMGRES = null;
async function toJpeg(f) {
  const bm = await createImageBitmap(f), k = Math.min(1, 1024 / Math.max(bm.width, bm.height));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bm.width * k)); c.height = Math.max(1, Math.round(bm.height * k));
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(bm, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72);
}
function renderThumbs() {
  $("#thumbs").innerHTML = IMGS.map((m, i) => '<span><img src="' + m.url + '" alt="" style="height:64px;border-radius:8px;display:block"><button data-i="' + i + '" style="padding:2px 8px;font-size:12px;margin-top:2px">Quitar</button></span>').join("");
  document.querySelectorAll("#thumbs button").forEach((b) => { b.onclick = () => { IMGS.splice(+b.dataset.i, 1); renderThumbs(); }; });
}
$("#imgs").onchange = async (e) => {
  const fs = [...e.target.files].slice(0, 6 - IMGS.length); $("#imgmsg").textContent = "Preparando imágenes…";
  try {
    for (const f of fs) { const u = await toJpeg(f); IMGS.push({ name: f.name, mime: "image/jpeg", data: u.split(",")[1], url: u }); }
    renderThumbs(); $("#imgmsg").textContent = IMGS.length + " imagen(es) lista(s).";
  } catch (err) { $("#imgmsg").textContent = "No se pudo leer una imagen: " + err.message; }
};
$("#imgan").onclick = async () => {
  if (!IMGS.length) { $("#imgmsg").textContent = "Primero sube al menos una imagen."; return; }
  const size = IMGS.reduce((a, m) => a + m.data.length, 0); if (size > 3300000) { $("#imgmsg").textContent = "Las imágenes pesan demasiado: usa menos o más pequeñas."; return; }
  $("#imgmsg").textContent = "Analizando " + IMGS.length + " imagen(es)…";
  try {
    IMGRES = await ai({ task: "imgstyle", confidential: $("#confmode").checked, images: IMGS.map((m) => ({ mime: m.mime, data: m.data })) });
    renderImgRes(); $("#imgmsg").textContent = "Listo: revisa y aplica la guía.";
  } catch (e) { $("#imgmsg").textContent = "Error al analizar: " + (e && e.message || "intenta de nuevo"); }
};
function renderImgRes() {
  const r = IMGRES || {}, L = (k, v) => (Array.isArray(v) ? v.length : v) ? "<li><b>" + k + ":</b> " + esc(Array.isArray(v) ? v.join(" · ") : v) + "</li>" : "";
  const ex = (r.ejemplos || r.textos_visibles || []).slice(0, 8);
  $("#imgres").innerHTML = '<ul style="font-size:13px;color:var(--mut);padding-left:18px">' + L("Resumen", r.resumen) + L("Tono", r.tono) + L("Recursos del texto", r.recursos_del_texto) + L("Estilo visual", r.estilo_visual) + L("Particularidades", r.particularidades) + "</ul>" +
    '<label>Guía propuesta (editable)</label><textarea id="imgguia" rows="4">' + esc(r.guia || "") + "</textarea>" +
    (ex.length ? '<label style="margin-top:8px">Textos de ejemplo vistos en las imágenes: marca los que servirán de modelo</label>' + ex.map((e, j) => '<label class="ck" style="margin:4px 0;align-items:flex-start"><input type="checkbox" data-j="' + j + '" checked><span>' + esc(e.texto || "") + "</span></label>").join("") : "") +
    '<div class="bar"><button class="p" id="imgapply">Aplicar a la guía adicional</button><span class="msg" id="imgapm"></span></div>';
  $("#imgapply").onclick = () => {
    const ch = [...document.querySelectorAll("#imgres input[data-j]:checked")].map((x) => ex[+x.dataset.j]).filter(Boolean);
    const blk = "Referencias visuales:\n" + $("#imgguia").value.trim() + (ch.length ? "\nTextos de referencia (imítalos en tono y estructura, sin copiarlos):\n" + ch.map((e) => "- " + (e.material ? "[" + e.material + "] " : "") + e.texto).join("\n") : "");
    $("#voz").value = ($("#voz").value.replace(/\n?Referencias visuales:[\s\S]*$/, "").trim() + "\n" + blk).trim();
    persist(); $("#imgapm").textContent = "Aplicado a la guía adicional (se usará en la próxima generación).";
  };
}

/* ---------- importación de la parrilla ---------- */
const ROLES = [["", "(no usar)"], ["semana", "Semana"], ["dia", "Día"], ["hora", "Hora"], ["categoria", "Categoría"], ["oferta", "Oferta"], ["material", "Tipo de material"], ["consideraciones", "Consideraciones"], ["segmento", "Segmento (solo para detectar SI-SI / SI-NO / NO-NO)"], ["sku", "SKU"]];
const clip = (s, n) => { s = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const hrowIdx = () => Math.max(1, +$("#hrow").value || 1) - 1;
function readRoles() {
  const col = {}; ROLES.forEach(([k]) => { if (k) col[k] = -1; });
  (IMP.cols || []).forEach((i) => { const r = $("#r_" + i).value; if (r && col[r] < 0) col[r] = i; });
  return col;
}
function updateImpInfo() {
  const col = readRoles(), rows = IMP.rows.slice(hrowIdx() + 1);
  const n = rows.filter((r) => (col.oferta >= 0 && E.cleanCell(r[col.oferta])) || (col.categoria >= 0 && E.cleanCell(r[col.categoria]))).length;
  const dup = (IMP.cols || []).map((i) => $("#r_" + i).value).filter(Boolean).filter((r, k, arr) => arr.indexOf(r) !== k);
  $("#impinfo").textContent = (col.oferta < 0 && col.categoria < 0 ? "Elige qué columna es la Oferta o la Categoría. " : n + " comunicaciones detectadas. ") +
    (col.material < 0 ? "Sin columna de material: se usará el material de abajo. " : "") + (dup.length ? "Hay roles repetidos (" + [...new Set(dup)].join(", ") + "): se usa la primera columna." : "");
}
function buildMaps() {
  const h = hrowIdx(), hdr = (IMP.rows[h] || []).map(String), body = IMP.rows.slice(h + 1).filter((r) => r.some((c) => String(c).trim())), sample = body.slice(0, 4);
  const guess = E.mapColumns(hdr), roleOf = {};
  Object.entries(guess).forEach(([k, i]) => { if (ROLES.some((r) => r[0] === k) && !(i in roleOf)) roleOf[i] = k; });
  IMP.cols = hdr.map((_, i) => i).filter((i) => hdr[i].trim() || sample.some((r) => String(r[i] || "").trim()));
  $("#maps").innerHTML = "<label>Para cada columna de tu hoja, elige para qué se usa. Debajo de cada título ves los datos reales de las primeras filas.</label><div class=\"tw\"><table class=\"pv\"><thead><tr>" +
    IMP.cols.map((i) => "<th>" + esc(clip(hdr[i] || "Columna " + (i + 1), 28)) + '<select id="r_' + i + '">' + ROLES.map(([k, n]) => '<option value="' + k + '">' + esc(n) + "</option>").join("") + "</select></th>").join("") + "</tr></thead><tbody>" +
    (sample.length ? sample.map((r) => "<tr>" + IMP.cols.map((i) => "<td>" + esc(clip(E.cleanCell(r[i]), 60)) + "</td>").join("") + "</tr>").join("") : '<tr><td colspan="99">No hay filas debajo de la fila de encabezados.</td></tr>') + "</tbody></table></div>";
  IMP.cols.forEach((i) => { const s = $("#r_" + i); s.value = roleOf[i] || ""; s.onchange = updateImpInfo; });
  updateImpInfo();
}
function loadSheet(name) {
  const ws = IMP.wb.Sheets[name]; let rb = 0, cb = 0;
  try { const d = XLSX.utils.decode_range((ws && ws["!ref"]) || "A1"); rb = d.s.r; cb = d.s.c; } catch (e) { /* sin rango */ }
  IMP.sheet = name; IMP.rowBase = rb; IMP.colBase = cb;
  IMP.rows = XLSX.utils.sheet_to_json(IMP.wb.Sheets[name], { header: 1, raw: false, defval: "", blankrows: true });
  const d = E.detectHeader(IMP.rows); $("#hrow").value = String(d >= 0 ? d + 1 : 1);
  $("#impmsg").textContent = d >= 0 ? "Encabezados detectados en la fila " + (d + 1) + "." : "No pude detectar los encabezados: indica la fila.";
  const cid = E.cicloFromSheet(IMP.rows, PACK);
  if (cid) { $("#ciclo").value = cid; renderRules(); renderCicloNote(); $("#impmsg").textContent += " Ciclo detectado en la hoja: " + PACK.ciclos[cid].nombre + "."; }
  buildMaps();
}
var ORIG = null;
function openWorkbook(wb, meta) {
  IMP = Object.assign({ wb, rows: [], cols: [], name: "archivo", kind: "xlsx" }, meta || {});
  if (IMP.kind === "xlsx" && IMP.buf) ORIG = { name: IMP.name, buf: IMP.buf, wb };
  $("#sheetSel").innerHTML = wb.SheetNames.map((n) => "<option>" + esc(n) + "</option>").join(""); $("#sheetSel").value = wb.SheetNames[0];
  $("#impBox").style.display = "block"; loadSheet(wb.SheetNames[0]);
}
$("#file").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return; $("#impBox").style.display = "block"; $("#impmsg").textContent = "Leyendo…";
  try {
    if (!window.XLSX) throw new Error("No se pudo cargar el lector de Excel: guarda la hoja como CSV o revisa tu conexión.");
    if (/\.csv$/i.test(f.name)) openWorkbook(XLSX.read(await f.text(), { type: "string" }), { name: f.name, kind: "csv" });
    else { const buf = await f.arrayBuffer(); openWorkbook(XLSX.read(buf, { type: "array" }), { name: f.name, kind: /\.xlsx$/i.test(f.name) ? "xlsx" : "xls", buf }); }
  } catch (err) { $("#impmsg").textContent = err.message; }
};
$("#surlb").onclick = async () => {
  const u = $("#surl").value.trim(); if (!u) return; $("#impBox").style.display = "block"; $("#impmsg").textContent = "Descargando hoja…";
  try {
    if (!CODE) { showLogin(); throw new Error("Falta el código de acceso"); }
    const r = await fetch("/api/sheet", { method: "POST", headers: { "Content-Type": "application/json", "x-access-code": CODE }, body: JSON.stringify({ url: u }) });
    if (r.status === 401) { sessionStorage.removeItem("acc"); CODE = ""; showLogin("Código incorrecto"); throw new Error("Código incorrecto"); }
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "No se pudo leer la hoja");
    if (!window.XLSX) throw new Error("No se pudo cargar el lector de Excel.");
    openWorkbook(XLSX.read(j.csv, { type: "string" }), { name: "Google Sheets", kind: "sheets" });
  } catch (err) { $("#impmsg").textContent = err.message; }
};
$("#sheetSel").onchange = () => IMP && loadSheet($("#sheetSel").value);
$("#hrow").onchange = () => IMP && buildMaps();
$("#mkpieces").onclick = () => {
  if (!IMP) return;
  const h = Math.max(1, +$("#hrow").value || 1) - 1, col = {};
  Object.assign(col, readRoles());
  const get = (r, k) => (col[k] >= 0 ? E.cleanCell(r[col[k]]) : "");
  const n = +$("#nvar").value || 1, ciclo = $("#ciclo").value, segSel = $("#seg").value;
  let made = 0, skipped = 0, noMat = {}, total = 0;
  for (let ri = h + 1; ri < IMP.rows.length; ri++) {
    const r = IMP.rows[ri];
    const b = { semana: get(r, "semana"), dia: get(r, "dia"), hora: get(r, "hora"), categoria: get(r, "categoria"), oferta: get(r, "oferta"), consideraciones: get(r, "consideraciones"), sku: get(r, "sku") };
    if (!b.oferta && !b.categoria) continue;
    total++;
    const matCell = col.material >= 0 ? String(r[col.material] || "").trim() : "";
    const m = matCell ? E.materialFromCell(matCell, PACK) : $("#defmat").value;
    if (!m) { skipped++; noMat[matCell || "(vacío)"] = 1; continue; }
    b.segKey = E.segKey(col.segmento >= 0 ? r[col.segmento] : "") || (segSel !== "-" ? segSel : "");
    const src = { sheet: IMP.sheet, row: IMP.rowBase + ri + 1, hdr: IMP.rowBase + h + 1, file: IMP.name, kind: IMP.kind };
    for (let i = 0; i < n && items.length < 2000; i++) { const np = newPiece(ciclo, m, Object.assign({}, b)); np.src = src; items.push(np); made++; }
  }
  $("#impmsg").textContent = made + " piezas creadas de " + total + " comunicaciones" + (skipped ? ". Omitidas " + skipped + " por material sin reglas: " + Object.keys(noMat).join(", ") : "") + ".";
  render();
};
$("#madd").onclick = () => {
  const o = $("#mofe").value.trim(), c = $("#mcat").value.trim(), sk = $("#msku").value.trim(); if (!o && !c) { msg("Escribe al menos la oferta o la categoría."); return; }
  const n = +$("#nvar").value || 1, segSel = $("#seg").value;
  for (let i = 0; i < n; i++) items.push(newPiece($("#ciclo").value, $("#mmat").value, { categoria: c, oferta: o, sku: sk, consideraciones: $("#mcons").value.trim(), segKey: segSel !== "-" ? segSel : "" }));
  $("#mofe").value = ""; render();
};

/* ---------- exportación a Excel ---------- */
function exportRows(onlyOk) {
  const head = ["Semana", "Día", "Hora", "Ciclo", "Tipo de material", "Categoría", "Oferta", "SKU / disponibilidad", "Título / Copy out título", "# carac. título", "Subtítulo (Copy out)", "Cuerpo / Copy in", "# carac. cuerpo", "CTA", "Legal", "Estado", "Alertas"];
  const rows = items.filter((p) => !isEmpty(p) && (!onlyOk || GATED.includes(p.estado))).map((p) => {
    const F = p.fields, t = F.titulo || F.out_titulo || "", c = F.cuerpo || F.in || "";
    return [p.brief.semana, p.brief.dia, p.brief.hora, (PACK.ciclos[p.ciclo] || {}).nombre, mat(p).nombre, p.brief.categoria, p.brief.oferta, skuList(p).map((s) => s + " " + skuState(p, s)).join("; "), t, t.length, F.out_subtitulo || "", c, c.length, F.cta || "", E.autoLegal(p, PACK, legalLib).texto, p.estado, check(p).map((x) => x.m).join(" | ")];
  });
  return [head].concat(rows);
}
$("#expo").onclick = () => {
  const only = $("#expOnly").checked, data = exportRows(only);
  if (data.length < 2) { msg(only ? "No hay piezas aprobadas para exportar." : "No hay piezas con texto para exportar."); return; }
  if (!window.XLSX) { msg("No se pudo cargar el generador de Excel."); return; }
  const ws = XLSX.utils.aoa_to_sheet(data), wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Copies");
  XLSX.writeFile(wb, "Copies_" + PACK.marca + "_" + $("#ciclo").value + "_" + new Date().toISOString().slice(0, 10) + ".xlsx");
  msg((data.length - 1) + " piezas exportadas.");
};

/* ---------- exportar en el formato del archivo original ---------- */
function exportTargets(onlyOk) {
  const by = {}; let manual = 0, cand = 0;
  items.filter((p) => !isEmpty(p) && (!onlyOk || GATED.includes(p.estado))).forEach((p) => {
    if (!p.src) { manual++; return; }
    cand++; const k = p.src.sheet + "|" + p.src.row;
    if (!by[k] || (GATED.includes(p.estado) && !GATED.includes(by[k].estado))) by[k] = p;
  });
  const list = Object.values(by); return { list, manual, extra: cand - list.length };
}
function cellEdits(p, cols, colBase) {
  const v = E.exportValues(p, PACK, legalLib), ed = [], row = p.src.row;
  if (cols.map.cta == null && v.cta) { v.copyin = (v.copyin ? v.copyin + "\n" : "") + "CTA: " + v.cta; v.cta = ""; }
  ["titulo", "copyout", "copyin", "cta", "legal"].forEach((role) => {
    const j = cols.map[role], text = v[role]; if (j == null || !text) return;
    const ref = E.colLetter(colBase + j) + row; ed.push({ ref, kind: "text", text });
    const cj = cols.counts[role]; if (cj != null) ed.push({ ref: E.colLetter(colBase + cj) + row, kind: "len", n: text.length, formula: "+LEN(" + ref + ")" });
  });
  return ed;
}
function sheetRows(wb, name) {
  const ws = wb.Sheets[name]; let rb = 0, cb = 0;
  try { const d = XLSX.utils.decode_range((ws && ws["!ref"]) || "A1"); rb = d.s.r; cb = d.s.c; } catch (e) { /* sin rango */ }
  return { rows: XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: true }), rowBase: rb, colBase: cb };
}
function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }
const outName = (n, ext) => String(n || "archivo").replace(/\.[^.]+$/, "") + "_con-copies." + ext;
function pickFile(accept) { return new Promise((res) => { const i = document.createElement("input"); i.type = "file"; i.accept = accept; i.onchange = () => res(i.files && i.files[0] || null); i.click(); }); }
function summary(t, wrote, extra) {
  return wrote + " comunicaciones escritas" + (t.extra ? ". " + t.extra + " variante(s) adicional(es) no caben en el formato original (se usó una por fila; las demás salen en «Descargar resumen de todas las piezas»)" : "") +
    (t.manual ? ". " + t.manual + " pieza(s) manual(es) sin fila de origen no se incluyeron" : "") + (extra ? ". " + extra : "") + ".";
}
async function exportXlsxInPlace(t) {
  const name = t.list[0].src.file;
  if (!ORIG || ORIG.name !== name) {
    msg("Selecciona de nuevo el archivo original («" + name + "») para escribir los copies en él.");
    const f = await pickFile(".xlsx"); if (!f) return;
    const buf = await f.arrayBuffer(); ORIG = { name: f.name, buf, wb: XLSX.read(buf, { type: "array" }) };
  }
  const z = await JSZip.loadAsync(ORIG.buf), wbXml = await z.file("xl/workbook.xml").async("string"), rels = await z.file("xl/_rels/workbook.xml.rels").async("string");
  let wrote = 0; const bad = [];
  for (const sh of [...new Set(t.list.map((p) => p.src.sheet))]) {
    const path = XPatch.sheetPathFor(wbXml, rels, sh), mine = t.list.filter((p) => p.src.sheet === sh);
    const { rows, rowBase, colBase } = sheetRows(ORIG.wb, sh), cols = E.exportColumns(rows[mine[0].src.hdr - rowBase - 1] || []);
    if (!path || !z.file(path) || (cols.map.titulo == null && cols.map.copyout == null && cols.map.copyin == null)) { bad.push(sh); continue; }
    const r = XPatch.patchSheet(await z.file(path).async("string"), mine.flatMap((p) => cellEdits(p, cols, colBase)));
    z.file(path, r.xml); wrote += mine.length - r.missing.length;
  }
  if (!wrote) { msg("No encontré columnas «Título», «Copy out» o «Copy in» en la hoja original; usa «Descargar resumen de todas las piezas»."); return; }
  z.file("xl/workbook.xml", XPatch.setFullCalc(wbXml));
  download(await z.generateAsync({ type: "blob", compression: "DEFLATE" }), outName(ORIG.name, "xlsx"));
  msg(summary(t, wrote, bad.length ? "Hojas sin columnas reconocidas: " + bad.join(", ") : ""));
}
function exportTabular(t, kind) {
  const f0 = t.list[0].src;
  if (!IMP || IMP.name !== f0.file) { msg("Vuelve a cargar el archivo o enlace original («" + f0.file + "») en el paso 02 para exportar en su formato."); return; }
  const out = IMP.rows.map((r) => r.slice()), hi = f0.hdr - IMP.rowBase - 1, cols = E.exportColumns(out[hi] || []);
  const LAB = { titulo: "Título", copyout: "Copy out", copyin: "Copy in", cta: "CTA", legal: "Legal" };
  Object.keys(LAB).forEach((k) => { if (cols.map[k] == null && t.list.some((p) => E.exportValues(p, PACK, legalLib)[k])) { cols.map[k] = out[hi].length; out[hi].push(LAB[k]); } });
  t.list.forEach((p) => {
    const idx = p.src.row - IMP.rowBase - 1, v = E.exportValues(p, PACK, legalLib);
    Object.keys(LAB).forEach((k) => { if (cols.map[k] == null || !v[k]) return; out[idx][cols.map[k]] = v[k]; if (cols.counts[k] != null) out[idx][cols.counts[k]] = v[k].length; });
  });
  const w = out.reduce((m, r) => Math.max(m, r.length), 0); out.forEach((r) => { while (r.length < w) r.push(""); });
  if (kind === "csv") download(new Blob(["\ufeff" + out.map((r) => r.map((c) => '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"').join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }), outName(f0.file, "csv"));
  else { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(out), "Copies"); XLSX.writeFile(wb, outName(f0.file === "Google Sheets" ? "Google_Sheets" : f0.file, "xlsx")); }
  msg(summary(t, t.list.length, kind === "sheets" ? "Se descargó un Excel con las mismas columnas (no se modifica tu Google Sheets)" : ""));
}
$("#expfmt").onclick = async () => {
  const t = exportTargets($("#expOnly").checked);
  if (!t.list.length) { msg(t.manual ? "Las piezas no vienen de un archivo importado: usa «Descargar resumen de todas las piezas»." : $("#expOnly").checked ? "No hay piezas aprobadas para exportar." : "No hay piezas con texto para exportar."); return; }
  try { const k = t.list[0].src.kind; if (k === "xlsx") await exportXlsxInPlace(t); else exportTabular(t, k === "csv" ? "csv" : "sheets"); }
  catch (e) { msg("No se pudo exportar en el formato original: " + (e && e.message || e)); }
};
$("#expsku").onclick = () => {
  const rows = [["Pieza", "Material", "Categoría", "SKU", "Enlace de búsqueda", "Estado", "URL del producto", "Fecha de verificación"]];
  items.forEach((p) => skuList(p).forEach((s) => { const o = (p.skus || {})[s] || {}; rows.push([p.id, mat(p) ? mat(p).nombre : p.material, p.brief.categoria, s, skuLink(s), skuState(p, s), o.url || "", o.fecha || ""]); }));
  if (rows.length < 2) { msg("Ninguna pieza tiene SKU."); return; }
  if (!window.XLSX) { msg("No se pudo cargar el generador de Excel."); return; }
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "SKU");
  XLSX.writeFile(wb, "SKU_" + PACK.marca + "_" + $("#ciclo").value + "_" + new Date().toISOString().slice(0, 10) + ".xlsx"); msg((rows.length - 1) + " SKU exportados.");
};
/* ---------- reglas visibles, biblioteca legal y límites ---------- */
const baseIds = (id, d) => { const c = PACK.ciclos[id] || {}; if (!c.hereda || (d || 0) > 4) return [id]; const l = typeof c.hereda === "string" ? [c.hereda] : [...new Set(Object.values(c.hereda))]; return l.flatMap((i) => baseIds(i, (d || 0) + 1)); };
function renderCicloSelect() {
  const g = {}; Object.entries(PACK.ciclos).forEach(([k, v]) => { (g[v.grupo || "Ciclos"] = g[v.grupo || "Ciclos"] || []).push([k, v]); });
  $("#ciclo").innerHTML = Object.entries(g).map(([n, l]) => '<optgroup label="' + esc(n) + '">' + l.map(([k, v]) => '<option value="' + k + '">' + esc(v.nombre) + "</option>").join("") + "</optgroup>").join("");
}
function renderCicloNote() {
  const id = $("#ciclo").value, c = PACK.ciclos[id] || {}; let t = "";
  if (c.otraMarca) t = c.aviso; else if (c.sinReglas) t = "Este ciclo no tiene reglas específicas cargadas: se aplican solo las reglas generales de " + PACK.marca + "."; else if (c.hereda) t = "Usa las reglas de " + baseIds(id).map((i) => PACK.ciclos[i].nombre).join(" y ") + (typeof c.hereda === "object" ? " (PN para Push sencilla y Centro de notificaciones; PE para el resto)." : ".");
  $("#ciclonote").textContent = ((t || "") + " " + (c.nota || "")).trim();
}
function renderRules() {
  const id = $("#ciclo").value, own = PACK.ciclos[id] || {}, li = (a) => "<ul>" + (a || []).map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>";
  const cyc = own.otraMarca ? "" : baseIds(id).map((b) => { const c = PACK.ciclos[b] || {}; return "<b>Ciclo: " + esc(c.nombre || "") + "</b>" + li(c.reglas) + (c.segmentos ? "<b>Segmentos</b>" + li(Object.entries(c.segmentos).map(([k, v]) => k + ": " + v)) : ""); }).join("");
  $("#rulesview").innerHTML = "<p class='msg'><b>" + esc(PACK.version) + ".</b> " + esc(PACK.alcance) + "</p><b>Reglas generales</b>" + li(own.otraMarca ? PACK.globales.filter((_, i) => !(PACK.marcaOnly || []).includes(i)) : PACK.globales) + cyc + (own.sinReglas && !own.hereda ? "<p class='msg'>Este ciclo no tiene reglas específicas cargadas.</p>" : "");
}
function renderLegal() {
  $("#legaled").innerHTML = Object.entries(PACK.legales).map(([k, v]) => "<label>" + esc(v.simbolo + " " + v.nombre) + '</label><textarea rows="2" data-k="' + k + '" placeholder="Pendiente de cargar">' + esc(legalLib[k] ? legalLib[k].texto : v.texto) + "</textarea>").join("");
  document.querySelectorAll("#legaled textarea").forEach((t) => { t.oninput = () => { legalLib[t.dataset.k] = { texto: t.value }; render(); }; });
}
function renderLimits() {
  $("#limgrid").innerHTML = "<table><tr><th>Material</th><th>Campo</th><th>Máx. por defecto</th><th>Tu ajuste</th></tr>" + Object.entries(PACK.materiales).flatMap(([k, m]) => m.campos.filter((c) => c.max).map((c) => "<tr><td>" + esc(m.nombre) + "</td><td>" + esc(c.nombre) + "</td><td>" + c.max + (c.hasta ? " (excepción " + c.hasta + ")" : "") + '</td><td><input type="number" min="1" data-m="' + k + '" data-c="' + c.id + '" value="' + ((ovr[k] || {})[c.id] || "") + '"></td></tr>')).join("") + "</table>";
  document.querySelectorAll("#limgrid input").forEach((i) => { i.oninput = () => { (ovr[i.dataset.m] = ovr[i.dataset.m] || {})[i.dataset.c] = +i.value || 0; render(); }; });
}
$("#ciclo").onchange = () => { if (PACK) { renderRules(); renderCicloNote(); } };

/* ---------- guardado local ---------- */
function persist() {
  if (!loaded) return; clearTimeout(saveT);
  saveT = setTimeout(() => {
    try {
      localStorage.setItem("contenido-pro:v1", JSON.stringify({ items: items.map((p) => ({ id: p.id, t: p.t, ciclo: p.ciclo, material: p.material, brief: p.brief, fields: p.fields, estado: p.estado, aiOk: !!p.aiOk, skus: p.skus || {}, src: p.src || null })), cfg: { skureq: $("#skureq").checked, skusite: $("#skusite").value, ciclo: $("#ciclo").value, seg: $("#seg").value, n: $("#nvar").value, voz: $("#voz").value, conf: $("#confmode").checked, sku: $("#usesku").checked }, legalLib, ovr }));
    } catch (e) { msg("No se pudo guardar en este navegador: exporta tu trabajo."); }
  }, 800);
}
function loadLocal() {
  try {
    const d = JSON.parse(localStorage.getItem("contenido-pro:v1") || "null"); if (!d) return;
    items = (d.items || []).filter((p) => PACK.materiales[p.material]).map((p) => Object.assign({ aiSug: null, skus: {} }, p)); legalLib = d.legalLib || {}; ovr = d.ovr || {};
    const c = d.cfg || {}; if (c.ciclo && PACK.ciclos[c.ciclo]) $("#ciclo").value = c.ciclo; if (c.seg) $("#seg").value = c.seg; if (c.n) $("#nvar").value = c.n; if (c.voz) $("#voz").value = c.voz;
    $("#skureq").checked = c.skureq !== false; if (c.skusite) $("#skusite").value = c.skusite; $("#confmode").checked = c.conf !== false; $("#usesku").checked = !!c.sku;
  } catch (e) { /* sin datos previos */ }
}
["#voz", "#ciclo", "#seg", "#nvar", "#confmode", "#usesku", "#skureq", "#skusite"].forEach((s) => { $(s).addEventListener("input", persist); $(s).addEventListener("change", persist); });

["#skureq", "#skusite"].forEach((s) => $(s).addEventListener("change", () => PACK && render()));

/* ---------- arranque ---------- */
async function init() {
  PACK = await (await fetch("/rules/shopinbaz.json")).json();
  $("#packname").textContent = "Reglas de " + PACK.marca + " · " + PACK.version;
  renderCicloSelect();
  $("#seg").innerHTML = '<option value="-">(no aplica)</option><option>SI-SI</option><option>SI-NO</option><option>NO-NO</option>';
  const mats = Object.entries(PACK.materiales).map(([k, v]) => '<option value="' + k + '">' + esc(v.nombre) + "</option>").join("");
  $("#mmat").innerHTML = mats; $("#defmat").innerHTML = '<option value="">(omitir filas sin material)</option>' + mats;
  loadLocal(); loaded = true; renderRules(); renderCicloNote(); renderLegal(); renderLimits(); render();
  msg("Biblioteca local: " + items.length + " piezas (solo en este navegador).");
  if (!CODE) showLogin();
}
init().catch((e) => { msg("No se pudo cargar el paquete de reglas: " + e.message); });
