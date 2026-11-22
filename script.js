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
  if (!token) { showGate("Este tablero es solo tuyo. Conéctate con tu token para verlo."); return; }
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
  const inicial = Number(data.inicial || 0), saved = Number(data.saved || 0);
  const pct = inicial ? Math.min(100, saved / inicial * 100) : 0;
  const fillW = Math.max(saved > 0 ? 2 : 0.8, pct);

  const phaseHtml = (data.phases || []).map((p, i) => {
    const cls = p.status === "now" ? "active" : p.status === "done" ? "done" : "";
    const pill = p.status === "now" ? `<span class="pill now" data-phase="${i}">Aquí estás</span>`
      : p.status === "done" ? `<span class="pill done" data-phase="${i}">Hecho ✓</span>`
      : `<span class="pill next" data-phase="${i}">${esc(p.badge || "Siguiente")}</span>`;
    return `<div class="phase ${cls}"><div class="pnum">${esc(p.n)}</div><div>
      <div class="ptitle"><h3>${esc(p.title)}</h3>${pill}</div>
      <div class="pgoal">${p.body || ""}</div>
      <div class="pgoal">Meta: <span class="ptarget">${esc(p.meta)}</span></div>
    </div>`;
  }).join("");

  const motoresHtml = (data.motores || []).map(m => `<div class="motor">
    <h3>${esc(m.title)} <span class="tag">${esc(m.tag)}</span></h3>
    <ul>${(m.items || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    <div class="range">${esc(m.range)}<small> ${esc(m.rangeNote)}</small></div>
  </div>`).join("");

  const tablaHtml = (data.tabla || []).map(r => `<tr class="${r.hot ? "hot" : ""}"><td class="num">${esc(r.ahorro)}</td><td class="num">${esc(r.inicial)}</td><td class="num">${esc(r.full)}</td></tr>`).join("");

  const weekHtml = (data.week || []).map(w => `<li data-week="${esc(w.id)}" class="${w.done ? "done" : ""}">
    <span class="chk">✓</span><span class="txt"><b>${esc(w.title)}</b><span>${esc(w.note)}</span></span></li>`).join("");

  $("#app").innerHTML = `
  <header class="hero"><div class="hero-in">
    <div class="toprow">
      <div class="brandmark">maikol<span>·</span>plan</div>
      <div class="top-actions">
        <span class="sync-note" id="syncnote"><span class="dot"></span></span>
        <button class="chip-btn" id="tt" type="button">tema</button>
      </div>
    </div>
    <div class="star">★ ESTRELLA DEL NORTE</div>
    <h1>${esc(data.headline)}</h1>
    <div class="goal"><span class="big">${fmt(data.goal)}</span><span class="cap">${esc(data.goalCaption)}</span></div>
    <div class="prog">
      <div class="prog-track"><div class="prog-fill" style="width:${fillW}%"></div></div>
      <div class="prog-labels">
        <span>Hoy: deuda <b class="editable" data-edit="debt">&minus;${fmt(data.debt)}</b> · ahorrado <b class="editable" data-edit="saved">${fmt(saved)}</b></span>
        <span><b>${pct.toFixed(pct < 10 ? 1 : 0)}%</b> de la inicial</span>
      </div>
    </div>
  </div></header>

  <div class="wrap">
    <section>
      <div class="sec-head"><h2>No necesitas la meta de golpe</h2>
        <p>${esc(data.reframe && data.reframe.intro)}</p></div>
      <div class="two">
        <div class="card"><div class="k">Meta real de arranque</div>
          <div class="v hl">${fmt(inicial)} <small>inicial aprox.</small></div>
          <div class="note">Entrada para comprar en planos. Lo demás en cuotas mientras construyen.</div></div>
        <div class="card"><div class="k">Lo que hace falta de verdad</div>
          <div class="v">${fmt(data.reframe && data.reframe.ritmo)}<small>/mes de ahorro</small></div>
          <div class="note">A ese ritmo, la inicial sale en ~2 años. El reto no es el número: es llegar a ese ingreso.</div></div>
      </div>
    </section>

    <section>
      <div class="sec-head"><h2>El camino en 4 fases</h2>
        <p>Cada fase desbloquea la siguiente. Toca la etiqueta de una fase para marcarla.</p></div>
      ${phaseHtml}
    </section>

    <section>
      <div class="sec-head"><h2>Los dos motores</h2>
        <p>No dependen del mismo riesgo: si uno se pone lento, el otro sostiene. Juntos te llevan al ingreso de la Fase 2.</p></div>
      <div class="two">${motoresHtml}</div>
    </section>

    <section>
      <div class="sec-head"><h2>Cuánto tardas, según cuánto ahorres</h2>
        <p>La matemática no miente: el tiempo lo decide tu ingreso, no apretarte el cinturón.</p></div>
      <div class="tablewrap"><table>
        <thead><tr><th>Ahorro por mes</th><th>Inicial</th><th>Apto completo</th></tr></thead>
        <tbody>${tablaHtml}</tbody></table></div>
      <p class="caption">Por eso la Fase 2 es todo: pasar de ~US$1.000 a ~US$4.000/mes convierte el sueño en fecha.</p>
    </section>

    <section>
      <div class="sec-head"><h2>Esta semana</h2>
        <p>Lo pensado ya está pensado. Lo que mueve la aguja es algo tangible. Toca cada tarea para marcarla.</p></div>
      <ul class="week" id="week">${weekHtml}</ul>
    </section>

    <div class="closing">
      <p class="big">${esc(data.closing && data.closing.big)}</p>
      <p>${esc(data.closing && data.closing.body)}</p>
      <p class="foot">Actualizado ${esc(data.updated)} · tus números se guardan privados y se sincronizan entre tus dispositivos.
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
  const label = () => btn.textContent = cur() === "dark" ? "☾ oscuro" : "☀ claro";
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

  $("#logout").onclick = e => { e.preventDefault(); if (!confirm("¿Quitar el token de este dispositivo? Tus datos quedan a salvo en el repo privado.")) return; ls.del("hub.token"); token = null; data = null; showGate("Desconectado. Conéctate de nuevo cuando quieras."); };
}

function editNumber(el, key) {
  const cur = Number(data[key] || 0);
  const inp = document.createElement("input");
  inp.className = "edit-input"; inp.value = cur; inp.inputMode = "numeric";
  el.replaceChildren(inp); inp.focus(); inp.select();
  const commit = () => {
    const v = parseInt(String(inp.value).replace(/[^\d]/g, ""), 10);
    if (!isNaN(v)) { data[key] = v; save(); }
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
