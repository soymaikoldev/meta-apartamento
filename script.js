/* Meta Apartamento · Maikol
   Cascarón público. Todos los datos viven en el repo privado content-hub-data (meta.json)
   y se cargan con tu token (el mismo del Content Hub, compartido por mismo origen). */

const GH = { owner: "soymaikoldev", repo: "content-hub-data", path: "meta.json" };
const API = `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${GH.path}`;
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: k => { try { localStorage.removeItem(k); } catch {} }
};
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = n => "US$" + Number(n || 0).toLocaleString("es-VE");
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const ymd = dt => dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
const TODAY = ymd(new Date());
const monthYear = dt => { const s = dt.toLocaleDateString("es-VE", { month: "long", year: "numeric" }); return s.charAt(0).toUpperCase() + s.slice(1); };
/* "12.50", "12,50", "1.500", "1,500.25", "1.500,25" → número */
function parseMonto(str) {
  let t = String(str || "").replace(/[^\d.,]/g, "");
  if (!t) return NaN;
  const lastDot = t.lastIndexOf("."), lastCom = t.lastIndexOf(",");
  if (lastDot > -1 && lastCom > -1) { // los dos: el último es el decimal
    const dec = lastDot > lastCom ? "." : ",";
    t = t.split(dec === "." ? "," : ".").join("").replace(dec, ".");
  } else {
    const sep = lastDot > -1 ? "." : lastCom > -1 ? "," : null;
    if (sep) {
      const parts = t.split(sep);
      const miles = parts.length > 2 || (parts[1].length === 3 && parts[0].length > 0 && parts[0] !== "0");
      t = miles ? parts.join("") : parts[0] + "." + parts[1];
    }
  }
  return parseFloat(t);
}
/* meses → "~8 meses", "~2 años", "~3,5 años" */
function duracion(meses) {
  if (!isFinite(meses) || meses <= 0) return "—";
  const anios = Math.round(meses / 12 * 2) / 2;
  if (anios < 1) { const m = Math.max(1, Math.round(meses)); return `~${m} ${m === 1 ? "mes" : "meses"}`; }
  return `~${String(anios).replace(".", ",")} ${anios === 1 ? "año" : "años"}`;
}
const PERSONAS = () => (data && data.personas) || ["Maikol", "Leonor"];
const fechaCorta = d => { const s = new Date(d + "T00:00:00").toLocaleDateString("es-VE", { day: "numeric", month: "short" }); return s; };

/* íconos de línea (lucide, inline) */
const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>'
};
const ic = (n, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;

let token = ls.get("hub.token");
let data = null, sha = null, saveTimer = null, saving = false, dirty = false;

const b64e = s => { const b = new TextEncoder().encode(s); let r = ""; for (let i = 0; i < b.length; i += 0x8000) r += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(r); };
const b64d = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), c => c.charCodeAt(0)));

/* ---------- GitHub ---------- */
async function gh(method, body) {
  const res = await fetch(API + (method === "GET" ? `?t=${Date.now()}` : ""), {
    method, cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401 || res.status === 403) { askToken("El token no es válido o no tiene permiso sobre " + GH.repo + "."); throw new Error("auth"); }
  return res;
}
async function pull() {
  const res = await gh("GET");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json(); sha = j.sha;
  return JSON.parse(b64d(j.content));
}
async function push() {
  if (!token || !data) return;
  if (saving) { dirty = true; return; }
  saving = true; dirty = false; syncDot("busy", "Guardando…");
  try {
    for (let i = 0; i < 3; i++) {
      const res = await gh("PUT", { message: "meta: actualización", content: b64e(JSON.stringify(data, null, 1)), ...(sha ? { sha } : {}) });
      if (res.ok) { sha = (await res.json()).content.sha; syncDot("ok", "Sincronizado " + hora()); break; }
      if (res.status === 409 || res.status === 422) { const r = await pull(); continue; } // refresca sha, reintenta (último gana)
      throw new Error("HTTP " + res.status);
    }
  } catch (e) { if (e.message !== "auth") syncDot("err", "Sin conexión: se guardará al volver la red."); dirty = true; }
  saving = false;
  if (dirty && navigator.onLine !== false) { clearTimeout(saveTimer); saveTimer = setTimeout(push, 4000); }
}
function save() { ls.set("meta.cache", JSON.stringify(data)); if (!token) return; syncDot("busy", "Cambios sin guardar…"); clearTimeout(saveTimer); saveTimer = setTimeout(push, 900); }
const hora = () => new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });

/* ---------- Carga ---------- */
async function load() {
  if (!token) { showGate("Este tablero es privado. Conéctate con tu token para verlo."); return; }
  gateSync("Conectando…");
  try {
    const r = await pull();
    if (!r) { try { data = JSON.parse(ls.get("meta.cache")); } catch {} if (!data) { showGate("Aún no hay datos en tu repo. Pídele a Claude que los cree."); return; } }
    else { data = r; ls.set("meta.cache", JSON.stringify(data)); }
    render();
  } catch (e) {
    if (e.message === "auth") return;
    try { data = JSON.parse(ls.get("meta.cache")); } catch {}
    if (data) { render(); syncDot("err", "Sin conexión: última copia."); }
    else showGate("Sin conexión. Intenta de nuevo.");
  }
}

/* ---------- Render ---------- */
function syncDot(kind, text) { const el = $("#syncnote"); if (el) el.innerHTML = `<span class="dot ${kind}"></span>${esc(text)}`; }
function gateSync(t) { const el = $("#gate-sync"); if (el) el.textContent = t; }
function showGate(msg) { $("#gate").hidden = false; $("#app").hidden = true; $("#gate-msg").textContent = msg; gateSync(""); }

function render() {
  if (!data) return;
  const meta = Number(data.goal || 0);
  const aportes = data.aportes || [];
  const saved = aportes.length ? aportes.reduce((s, a) => s + Number(a.amt || 0), 0) : Number(data.saved || 0);
  const pct = meta ? Math.min(100, saved / meta * 100) : 0;
  const fillW = Math.max(saved > 0 ? 2 : 0.8, pct);

  // proyección
  const faltante = Math.max(0, meta - saved);
  const since = ymd(new Date(Date.now() - 90 * 864e5));
  const recientes = aportes.filter(a => a.d >= since);
  const desde = recientes.reduce((m, a) => a.d < m ? a.d : m, TODAY);
  const mesesVentana = Math.min(3, Math.max(1, (Date.parse(TODAY) - Date.parse(desde)) / 864e5 / 30.44));
  const ritmoReal = Math.round(recientes.reduce((s, a) => s + Number(a.amt || 0), 0) / mesesVentana);
  const ritmo = data.ritmoMeta != null ? Number(data.ritmoMeta) : (ritmoReal || Number((data.reframe && data.reframe.ritmo) || 0));
  const meses = ritmo > 0 && faltante > 0 ? Math.ceil(faltante / ritmo) : null;
  const fecha = meses != null ? monthYear(new Date(new Date().getFullYear(), new Date().getMonth() + meses, 1)) : null;
  const fechaTxt = saved >= meta && meta > 0
    ? "¡Llegamos! A buscar nuestro apartamento."
    : meses != null ? `llegamos en <b>${fecha}</b> <span class="meses">(~${meses} ${meses === 1 ? "mes" : "meses"})</span>`
    : "pon un ritmo para ver la fecha";

  const aporteListHtml = aportes.length
    ? aportes.slice(0, 8).map(a => `<li data-ap="${esc(a.id)}">
        <span class="ap-d">${esc(fechaCorta(a.d))}</span>
        <span class="ap-src">${a.who ? `<span class="ap-who">${esc(a.who)}</span>` : ""}${esc(a.src || "Aporte")}</span>
        <b class="ap-amt">+${fmt(a.amt)}</b>
        <button class="ap-del" data-apdel="${esc(a.id)}" type="button" aria-label="Borrar">${ic("x")}</button></li>`).join("")
      + (aportes.length > 8 ? `<li class="ap-more">y ${aportes.length - 8} más…</li>` : "")
    : `<li class="ap-empty">Aún sin aportes. Anoten el primero arriba.</li>`;
  const porPersona = PERSONAS().map(n => ({ n, t: aportes.filter(a => a.who === n).reduce((s, a) => s + Number(a.amt || 0), 0) }));
  const porPersonaHtml = aportes.some(a => a.who)
    ? `<div class="ap-split">${porPersona.map(p => `<span>${esc(p.n)} <b>${fmt(p.t)}</b></span>`).join("")}</div>` : "";
  const whoSel = PERSONAS().includes(ls.get("meta.who")) ? ls.get("meta.who") : PERSONAS()[0];
  const whoHtml = PERSONAS().map(n => `<button type="button" class="who-btn${n === whoSel ? " on" : ""}" data-who="${esc(n)}" aria-pressed="${n === whoSel}">${esc(n)}</button>`).join("");

  // deuda
  const debt = Number(data.debt || 0);
  const debtStart = Math.max(debt, Number(data.debtStart || 0));
  const debtPaidPct = debtStart ? (debtStart - debt) / debtStart * 100 : 100;

  // tabla calculada a partir de la meta, lo ahorrado y el ritmo
  const montos = (data.tablaAhorros || [1000, 1500, 3000, 5000]).slice();
  if (ritmo > 0 && !montos.includes(ritmo)) montos.push(ritmo);
  montos.sort((a, b) => a - b);

  const phaseHtml = (data.phases || []).map((p, i) => {
    const cls = p.status === "now" ? "active" : p.status === "done" ? "done" : "";
    const pill = p.status === "now" ? `<span class="pill now" data-phase="${i}">Aquí estamos</span>`
      : p.status === "done" ? `<span class="pill done" data-phase="${i}">${ic("check")} Hecho</span>`
      : `<span class="pill next" data-phase="${i}">${esc(p.badge || "Siguiente")}</span>`;
    return `<div class="phase ${cls}"><div class="pnum">${esc(p.n)}</div><div>
      <div class="ptitle"><h3>${esc(p.title)}</h3>${pill}</div>
      <div class="pgoal">${String(p.body || "").replace(/\{deuda\}/g, fmt(debt))}</div>
      <div class="pgoal">Meta: <span class="ptarget">${esc(p.meta)}</span></div>
    </div></div>`;
  }).join("");

  const motoresHtml = (data.motores || []).map(m => `<div class="motor">
    <h3>${esc(m.title)} <span class="tag">${esc(m.tag)}</span></h3>
    <ul>${(m.items || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    <div class="range">${esc(m.range)}<small> ${esc(m.rangeNote)}</small></div>
  </div>`).join("");

  const tablaHtml = montos.map(m => `<tr class="${m === ritmo ? "hot" : ""}">
    <td class="num">${fmt(m)}${m === ritmo ? ' <small class="tag-ritmo">nuestro ritmo</small>' : ""}</td>
    <td class="num">${faltante > 0 ? duracion(faltante / m) : "listo"}</td>
    <td class="num">${faltante > 0 ? monthYear(new Date(new Date().getFullYear(), new Date().getMonth() + Math.ceil(faltante / m), 1)) : "—"}</td></tr>`).join("");

  const weekHtml = (data.week || []).map(w => `<li data-week="${esc(w.id)}" class="${w.done ? "done" : ""}">
    <span class="chk">${ic("check")}</span><span class="txt"><b>${esc(w.title)}</b><span>${esc(w.note)}</span></span></li>`).join("");

  $("#app").innerHTML = `
  <header class="hero"><div class="hero-in">
    <div class="toprow">
      <div class="brandmark">nuestro <em>plan</em></div>
      <div class="top-actions">
        <span class="sync-note" id="syncnote"><span class="dot"></span></span>
        <button class="chip-btn" id="tt" type="button">tema</button>
      </div>
    </div>
    <div class="eyebrow">Nuestra estrella del norte</div>
    <h1>${esc(data.headline)}</h1>
    <div class="goal"><span class="big">${fmt(meta)}</span><span class="cap">${esc(data.goalCaption || "el apartamento, listo para mudarnos")}</span></div>
    <div class="prog">
      <div class="prog-track"><div class="prog-fill" style="width:${fillW}%"></div></div>
      <div class="prog-labels">
        <span>Ahorrado <b>${fmt(saved)}</b> de ${fmt(meta)}</span>
        <span><b>${pct.toFixed(pct < 10 ? 1 : 0)}%</b> del apartamento</span>
      </div>
    </div>
    <div class="debt">
      <div class="debt-head">${debt > 0
        ? `<span>Deuda por pagar <b class="editable" data-edit="debt">${fmt(debt)}</b></span><span>${debtPaidPct > 0 ? `pagado ${Math.round(debtPaidPct)}% de ${fmt(debtStart)}` : "toca el monto para actualizarlo"}</span>`
        : `<span>${ic("check")} Deuda en cero <b class="editable" data-edit="debt">${fmt(0)}</b></span><span>de ${fmt(debtStart)}</span>`}</div>
      <div class="debt-track"><i style="width:${debt > 0 ? debtPaidPct : 100}%"></i></div>
    </div>
  </div></header>

  <div class="wrap">
    <section>
      <div class="sec-head"><h2>No es imposible: es un cronograma</h2>
        <p>${esc(data.reframe && data.reframe.intro)}</p></div>
      <div class="two">
        <div class="card"><div class="k">La meta</div>
          <div class="v hl">${fmt(meta)} <small>apartamento hecho</small></div>
          <div class="note">De contado: sin cuotas de construcción ni sorpresas de obra. Un solo número.</div></div>
        <div class="card"><div class="k">Lo que hace falta de verdad</div>
          <div class="v">${fmt(data.reframe && data.reframe.ritmo)}<small>/mes de ahorro</small></div>
          <div class="note">A ese ritmo, son ${duracion(meta / Number((data.reframe && data.reframe.ritmo) || 0))}. El reto no es el número: es subir el ingreso.</div></div>
      </div>
    </section>

    <section class="ahorro">
      <div class="sec-head"><h2>Nuestro ahorro para el apartamento</h2>
        <p>Cada vez que guardemos algo, lo anotamos. Lo que no se fuga, se acerca.</p></div>

      <div class="save-top">
        <div class="save-num"><b>${fmt(saved)}</b> <span>de ${fmt(meta)} · ${pct.toFixed(pct < 10 ? 1 : 0)}%</span></div>
        <div class="save-bar"><i style="width:${fillW}%"></i></div>
      </div>

      ${porPersonaHtml}
      <div class="aporte-add">
        <div class="who" role="group" aria-label="¿Quién aporta?">${whoHtml}</div>
        <input id="ap-amt" inputmode="decimal" placeholder="Monto US$">
        <input id="ap-src" placeholder="¿De dónde salió? (opcional)">
        <button class="btn-add" id="ap-add" type="button">${ic("plus")} Guardar aporte</button>
      </div>

      <ul class="aporte-list">${aporteListHtml}</ul>

      <div class="proj">
        <div class="proj-row"><span>Nos falta</span><b>${fmt(faltante)}</b></div>
        <div class="proj-row"><span>Nuestro ritmo (últimos 3 meses)</span><b>${ritmoReal > 0 ? fmt(ritmoReal) + "/mes" : "aún sin datos"}</b></div>
        <div class="proj-sim">Si guardamos US$<input id="ritmo" class="ritmo-in" inputmode="numeric" value="${ritmo}">/mes → ${fechaTxt}</div>
      </div>
    </section>

    <section>
      <div class="sec-head"><h2>El camino en 4 fases</h2>
        <p>Cada fase desbloquea la siguiente. Toca la etiqueta de una fase para marcarla.</p></div>
      ${phaseHtml}
    </section>

    <section>
      <div class="sec-head"><h2>Los dos motores</h2>
        <p>No dependen del mismo riesgo: si uno se pone lento, el otro sostiene. Juntos nos llevan al ingreso de la Fase 2.</p></div>
      <div class="two">${motoresHtml}</div>
    </section>

    <section>
      <div class="sec-head"><h2>Cuánto tardamos, según cuánto ahorremos</h2>
        <p>La matemática no miente: el tiempo lo decide el ingreso, no apretarnos el cinturón.</p></div>
      <div class="tablewrap"><table>
        <thead><tr><th>Ahorro por mes</th><th>Tiempo</th><th>Llegamos en</th></tr></thead>
        <tbody>${tablaHtml}</tbody></table></div>
      <p class="caption">Calculado con lo que ya llevamos ahorrado. Por eso la Fase 2 es todo: subir el ingreso convierte el sueño en fecha.</p>
    </section>

    <section>
      <div class="sec-head"><h2>Esta semana</h2>
        <p>Lo pensado ya está pensado. Lo que mueve la aguja es algo tangible. Toca cada tarea para marcarla.</p></div>
      <ul class="week" id="week">${weekHtml}</ul>
    </section>

    <div class="closing">
      <p class="big">${esc(data.closing && data.closing.big)}</p>
      <p>${esc(data.closing && data.closing.body)}</p>
      <p class="foot">Actualizado ${esc(data.updated)} · los números se guardan privados y se sincronizan entre tus dispositivos.
        <br><a href="#" id="logout" style="color:var(--muted)">Desconectar este dispositivo</a></p>
    </div>
  </div>`;

  $("#gate").hidden = true; $("#app").hidden = false;
  wire();
  syncDot(token ? "ok" : "", token ? "Sincronizado " + hora() : "");
}

/* ---------- Interacción ---------- */
function wire() {
  // tema
  const btn = $("#tt");
  const cur = () => { const a = document.documentElement.getAttribute("data-theme"); return a || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light"); };
  const label = () => btn.innerHTML = cur() === "dark" ? ic("moon") + " oscuro" : ic("sun") + " claro";
  label();
  btn.onclick = () => { const n = cur() === "dark" ? "light" : "dark"; document.documentElement.setAttribute("data-theme", n); ls.set("meta.theme", n); label(); };

  // números editables (deuda, ahorrado)
  document.querySelectorAll(".editable").forEach(el => el.onclick = () => editNumber(el, el.getAttribute("data-edit")));

  // tareas de la semana
  document.querySelectorAll("#week li").forEach(li => li.onclick = () => {
    const id = li.getAttribute("data-week"), w = data.week.find(x => x.id === id);
    if (!w) return; w.done = !w.done; li.classList.toggle("done", w.done); save();
  });

  // ciclar estado de fase
  document.querySelectorAll(".pill[data-phase]").forEach(p => p.onclick = e => {
    e.stopPropagation();
    const i = +p.getAttribute("data-phase"), ph = data.phases[i];
    ph.status = ph.status === "next" ? "now" : ph.status === "now" ? "done" : "next";
    save(); render();
  });

  // aportes
  if ($("#ap-add")) {
    $("#ap-add").onclick = addAporte;
    $("#ap-amt").addEventListener("keydown", ev => { if (ev.key === "Enter") addAporte(); });
  }
  document.querySelectorAll(".who-btn").forEach(b => b.onclick = () => {
    ls.set("meta.who", b.getAttribute("data-who"));
    document.querySelectorAll(".who-btn").forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); });
  });
  document.querySelectorAll("[data-apdel]").forEach(b => b.onclick = () => delAporte(b.getAttribute("data-apdel")));
  const ri = $("#ritmo");
  if (ri) ri.addEventListener("change", e => { const v = parseInt(String(e.target.value).replace(/[^\d]/g, ""), 10); data.ritmoMeta = isNaN(v) ? 0 : v; save(); render(); });

  $("#logout").onclick = e => { e.preventDefault(); if (!confirm("¿Quitar el token de este dispositivo? Tus datos quedan a salvo en el repo privado.")) return; ls.del("hub.token"); token = null; data = null; showGate("Desconectado. Conéctate de nuevo cuando quieras."); };
}

function syncSaved() { data.saved = (data.aportes || []).reduce((s, a) => s + Number(a.amt || 0), 0); }
function addAporte() {
  const amtEl = $("#ap-amt"), srcEl = $("#ap-src");
  const amt = parseMonto(amtEl.value);
  if (!amt || amt <= 0) { amtEl.focus(); amtEl.classList.add("bad"); return; }
  data.aportes = data.aportes || [];
  data.aportes.unshift({ id: uid(), d: TODAY, amt: Math.round(amt * 100) / 100, src: (srcEl.value || "").trim(), who: (document.querySelector(".who-btn.on") || {}).dataset?.who || PERSONAS()[0] });
  syncSaved(); save(); render();
}
function delAporte(id) {
  if (!confirm("¿Borrar este aporte?")) return;
  data.aportes = (data.aportes || []).filter(a => a.id !== id);
  syncSaved(); save(); render();
}

function editNumber(el, key) {
  const cur = Number(data[key] || 0);
  const inp = document.createElement("input");
  inp.className = "edit-input"; inp.value = cur; inp.inputMode = "numeric";
  el.replaceChildren(inp); inp.focus(); inp.select();
  const commit = () => {
    const v = parseInt(String(inp.value).replace(/[^\d]/g, ""), 10);
    if (!isNaN(v)) { data[key] = v; if (key === "debt" && v > Number(data.debtStart || 0)) data.debtStart = v; save(); }
    render();
  };
  inp.onkeydown = ev => { if (ev.key === "Enter") commit(); if (ev.key === "Escape") render(); };
  inp.onblur = commit;
}

/* ---------- Token ---------- */
function askToken(msg = "") { $("#t-msg").textContent = msg; $("#t-input").value = ""; if (!$("#tok").open) $("#tok").showModal(); }

(function init() {
  try { const t = ls.get("meta.theme"); if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t); } catch {}
  $("#gate-btn").onclick = () => askToken();
  $("#t-cancel").onclick = () => $("#tok").close();
  $("#tok-form").onsubmit = () => { const t = $("#t-input").value.trim(); if (!t) return; token = t; ls.set("hub.token", t); $("#tok").close(); load(); };
  load();
})();

if ("serviceWorker" in navigator) { window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {})); }
