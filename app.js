/* ============================================================
   DNM Agency Management — app.js  (Fase 1: acceso + esqueleto)
   ============================================================ */
const APP_VERSION = "v63";
try {
  window.APP_VERSION = APP_VERSION;
  document.addEventListener("DOMContentLoaded", () => {
    const el = document.getElementById("appVersion");
    if (el) el.textContent = "DNM Agency Management · " + APP_VERSION;
  });
  console.log("DNM Agency Management", APP_VERSION);
} catch (e) {}

/* ---- Portada / intro ---- */
(function initSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  let seen = false;
  try { seen = sessionStorage.getItem("dnm_splash_seen") === "1"; } catch (e) {}
  if (seen) splash.classList.add("instant");

  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hold = seen ? 500 : (reduce ? 800 : 5300);

  let closed = false;
  const finish = () => {
    if (closed) return; closed = true;
    splash.classList.add("done");
    setTimeout(() => splash.remove(), 600);
    try { sessionStorage.setItem("dnm_splash_seen", "1"); } catch (e) {}
  };
  const t = setTimeout(finish, hold);
  splash.addEventListener("click", () => { clearTimeout(t); finish(); });
})();

/* ---- Configuración de Supabase ----
   La llave "publishable" es pública por diseño: es seguro que viva
   aquí, en el código que corre en el navegador. */
const SUPABASE_URL = "https://avgtjafpreepneaxxfln.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RxkN8mVcCmpa1ArM1JtXkQ_6Tyuj6VU";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

/* ---- Atajos ---- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---- Elementos ---- */
const authScreen = $("#authScreen");
const appRoot    = $("#app");
const authMsg    = $("#authMsg");

let mode = "login"; // "login" | "register"

/* ============================================================
   Utilidades de interfaz
   ============================================================ */
function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2800);
}

function showAuthMsg(text, kind = "error") {
  authMsg.textContent = text;
  authMsg.className = "msg " + (kind === "ok" ? "msg--ok" : "msg--error");
  authMsg.classList.remove("hidden");
}
function clearAuthMsg() { authMsg.classList.add("hidden"); }

function initials(name) {
  if (!name) return "–";
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "–";
}

/* Avatar de cliente: logo si existe, si no un círculo con la inicial */
function clientById(id) {
  return (typeof CLIENTS !== "undefined" ? CLIENTS : []).find((c) => c.id === id) || null;
}
function clientAvatar(client, size) {
  const s = size || 24;
  if (!client) return "";
  if (client.logo_url) {
    return `<span class="cli-avatar" style="width:${s}px;height:${s}px"><img src="${escapeHtml(client.logo_url)}" alt="${escapeHtml(client.name || "")}" /></span>`;
  }
  return `<span class="cli-avatar cli-avatar--initial" style="width:${s}px;height:${s}px;font-size:${Math.round(s * 0.42)}px">${escapeHtml(initials(client.name))}</span>`;
}
/* Logo + nombre en línea */
function clientChip(client, size) {
  if (!client) return "";
  return `<span class="cli-chip">${clientAvatar(client, size)}<span class="cli-chip__name">${escapeHtml(client.name || "")}</span></span>`;
}

/* Traduce errores comunes de Supabase a español claro */
function friendlyError(err) {
  const m = (err?.message || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed"))       return "Tu correo aún no está confirmado. (Puedes desactivar la confirmación en Supabase mientras pruebas.)";
  if (m.includes("user already registered") || m.includes("already been registered")) return "Ese correo ya tiene una cuenta. Inicia sesión.";
  if (m.includes("password should be at least")) return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("unable to validate email"))  return "Ese correo no parece válido.";
  return err?.message || "Ocurrió un error. Intenta de nuevo.";
}

/* ============================================================
   Alternar login / registro
   ============================================================ */
function setMode(next) {
  mode = next;
  const isReg = mode === "register";
  $("#tabLogin").classList.toggle("active", !isReg);
  $("#tabRegister").classList.toggle("active", isReg);
  $("#fieldName").classList.toggle("hidden", !isReg);
  $("#authTitle").textContent = isReg ? "Crea tu cuenta" : "Inicia sesión";
  $("#authDesc").textContent  = isReg ? "Regístrate para colaborar en producción." : "Accede a tu tablero de producción.";
  $("#btnAuthLabel").textContent = isReg ? "Crear cuenta" : "Entrar";
  $("#inPass").setAttribute("autocomplete", isReg ? "new-password" : "current-password");
  $("#authSwitchHint").innerHTML = isReg
    ? '¿Ya tienes cuenta? <a href="#" id="linkSwitch" style="color:var(--amber)">Inicia sesión</a>'
    : '¿No tienes cuenta? <a href="#" id="linkSwitch" style="color:var(--amber)">Créala aquí</a>';
  bindSwitchLink();
  clearAuthMsg();
}

function bindSwitchLink() {
  const link = $("#linkSwitch");
  if (link) link.onclick = (e) => { e.preventDefault(); setMode(mode === "login" ? "register" : "login"); };
}

$("#tabLogin").onclick = () => setMode("login");
$("#tabRegister").onclick = () => setMode("register");
bindSwitchLink();

/* ============================================================
   Enviar formulario de acceso
   ============================================================ */
const btnAuth = $("#btnAuth");

async function handleAuth() {
  clearAuthMsg();
  const email = $("#inEmail").value.trim();
  const pass  = $("#inPass").value;
  const name  = $("#inName").value.trim();

  if (!email || !pass) return showAuthMsg("Escribe tu correo y contraseña.");
  if (mode === "register" && !name) return showAuthMsg("Escribe tu nombre.");
  if (mode === "register" && pass.length < 6) return showAuthMsg("La contraseña debe tener al menos 6 caracteres.");

  setBtnLoading(true);
  try {
    if (mode === "register") {
      const { data, error } = await sb.auth.signUp({
        email, password: pass,
        options: { data: { name } },
      });
      if (error) throw error;

      // Si Supabase pide confirmar correo, no habrá sesión activa todavía.
      if (!data.session) {
        setMode("login");
        showAuthMsg("Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión. (Si desactivaste la confirmación en Supabase, ya puedes entrar.)", "ok");
      }
      // Si hay sesión, onAuthStateChange se encarga de entrar.
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
    }
  } catch (err) {
    showAuthMsg(friendlyError(err));
  } finally {
    setBtnLoading(false);
  }
}

function setBtnLoading(on) {
  btnAuth.disabled = on;
  $("#btnAuthLabel").innerHTML = on
    ? '<span class="spinner"></span>'
    : (mode === "register" ? "Crear cuenta" : "Entrar");
}

btnAuth.onclick = handleAuth;
// Enter para enviar
["inEmail", "inPass", "inName"].forEach((id) => {
  $("#" + id).addEventListener("keydown", (e) => { if (e.key === "Enter") handleAuth(); });
});

$("#btnLogout").onclick = async () => {
  await sb.auth.signOut();
  toast("Sesión cerrada");
};

/* ============================================================
   Perfil + entrar a la app
   ============================================================ */
let currentProfile = null;

async function loadProfile(user) {
  // Intenta leer el perfil (lo crea un trigger al registrarse).
  let { data, error } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();

  // Respaldo: si por alguna razón no existe la fila, la creamos.
  if (!data && !error) {
    const nombre = user.user_metadata?.name || (user.email || "").split("@")[0];
    const up = await sb.from("profiles")
      .upsert({ id: user.id, name: nombre, email: user.email, role: "editor" })
      .select("*").maybeSingle();
    data = up.data;
  }
  currentProfile = data || { id: user.id, name: user.email, email: user.email, role: "editor" };
  return currentProfile;
}

function paintUser(p) {
  $("#userName").textContent = p.name || p.email || "Usuario";
  $("#userRole").textContent = isAdmin() ? "Administrador" : "Editor";
  $("#userAvatar").textContent = initials(p.name || p.email);
  applyRoleGating();
}

function isAdmin() {
  return !!currentProfile && (currentProfile.role === "admin" || currentProfile.role === "owner");
}

function applyRoleGating() {
  const admin = isAdmin();
  document.querySelectorAll("[data-admin-only]").forEach((el) => { el.style.display = admin ? "" : "none"; });
  const nb = document.getElementById("btnNewClient");
  if (nb) nb.style.display = admin ? "" : "none";
}

function enterApp() {
  authScreen.classList.add("hidden");
  appRoot.classList.add("active");
  bootData();
}
function exitApp() {
  appRoot.classList.remove("active");
  authScreen.classList.remove("hidden");
  // limpia campos sensibles
  $("#inPass").value = "";
}

/* ============================================================
   Navegación entre vistas
   ============================================================ */
function switchView(view) {
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  $$(".nav__item, .bottomnav__item").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view)
  );
  if (view === "actividades" || view === "grabacion") {
    initCalendars();
    (view === "actividades" ? calAct : calGrab).render();
  }
  if (view === "compartido") {
    initCalendars();
    loadShared();
  }
  if (view === "clientes") {
    if (!isAdmin()) { switchView("tablero"); return; }
    renderClients();
  }
  if (view === "historial") renderHistorial();
  if (view === "contenido") { renderContent(); renderGuests(); }
  if (view === "entregables") { renderDeliverables(); }
  if (view === "fases") { renderPhases(); }
  if (view === "usuarios") {
    if (!isAdmin()) { switchView("tablero"); return; }
    renderUsuarios();
  }
  // El botón flotante (+) solo tiene sentido en el tablero de tareas
  const fab = $("#fabNewTask");
  if (fab) fab.style.display = view === "tablero" ? "" : "none";
  window.scrollTo({ top: 0, behavior: "instant" });
}
$$(".nav__item, .bottomnav__item").forEach((b) => {
  b.onclick = () => switchView(b.dataset.view);
});

/* ============================================================
   Estado de sesión (mantiene al usuario dentro al recargar)
   ============================================================ */
sb.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    const p = await loadProfile(session.user);
    paintUser(p);
    enterApp();
  } else {
    currentProfile = null;
    exitApp();
  }
});

// Comprobación inicial al cargar la página
(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session?.user) {
    const p = await loadProfile(data.session.user);
    paintUser(p);
    enterApp();
  }
})();

/* ============================================================
   Service Worker (PWA)
   ============================================================ */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

/* ============================================================
   FASE 2 — Tareas y tablero
   ============================================================ */

// Etapas de producción (etiqueta en la tarjeta y estado en Contenido)
const ESTADOS = [
  "Agendado en calendario", "Grabación", "Edición", "Cortes", "Portada",
  "Revisión", "Correcciones", "Por programar", "Programado para publicar",
  "Publicado", "Cancelado",
];
const CONTENT_DONE_STAGES = ["Programado para publicar", "Publicado"];

// Estatus de avance de la tarea (columnas del Tablero)
const TASK_STATUS = ["Por hacer", "En curso", "En revisión", "Terminado", "Cancelado"];
const TASK_DONE = ["Terminado", "Cancelado"];
// Estatus de PIEZAS de contenido: incluye "Entregado" (sale del tablero, pero sigue en el entregable)
const CONTENT_STATUS = ["Por hacer", "En curso", "En revisión", "Entregado", "Terminado", "Cancelado"];
const CONTENT_ARCHIVE = ["Entregado", "Terminado", "Cancelado"]; // salen del tablero y del calendario de grabación activo
const ACTIVE_STATUS = ["Por hacer", "En curso", "En revisión"]; // columnas del tablero (lo cerrado va al Historial)

// Pipeline de producción de Fases y Entregables (igual que en Notion)
const PHASE_PIPELINE = [
  "Por iniciar", "Idea / Conceptualización / escaleta de contenido", "En curso",
  "Ready to shot / grabación", "Edición", "Revisión", "Revisión cliente",
  "Correcciones", "Terminado", "Listo para publicar", "Publicado", "Cancelado",
];
const PHASE_DONE = ["Terminado", "Listo para publicar", "Publicado", "Cancelado"];
const BOARD_COLUMNS = ["Por hacer", "En curso", "En revisión", "Terminado", "Cancelado"]; // Terminado/Cancelado se ven pero archivan al instante
const BOARD_ARCHIVE_COLS = ["Terminado", "Cancelado"]; // apartados de archivo: no muestran tarjetas
function closedAtFor(newStatus, prevClosedAt) {
  if (TASK_DONE.includes(newStatus) || newStatus === "Entregado") return prevClosedAt || new Date().toISOString();
  return null;
}
function statusPct(st) {
  return ({ "Por hacer": 8, "En curso": 45, "En revisión": 78, "Terminado": 100, "Cancelado": 0 })[st] ?? 8;
}
function clientProgress(clientId) {
  let done = 0, total = 0;
  TASKS.forEach((t) => {
    if (t.client_id !== clientId) return;
    const st = taskStatus(t);
    if (st === "Cancelado") return;
    total++; if (st === "Terminado") done++;
  });
  (typeof CONTENT !== "undefined" ? CONTENT : []).forEach((c) => {
    if (c.client_id !== clientId) return;
    const st = TASK_STATUS.includes(c.estatus) ? c.estatus : "Por hacer";
    if (st === "Cancelado") return;
    total++; if (st === "Terminado") done++;
  });
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function taskStatus(t) { return TASK_STATUS.includes(t.estado) ? t.estado : "Por hacer"; }
function taskEtapa(t) {
  if (ESTADOS.includes(t.proceso)) return t.proceso;
  if (ESTADOS.includes(t.estado)) return t.estado; // compatibilidad con datos previos
  return "Agendado en calendario";
}

let MEMBERS = [];   // [{id,name,email,role}]
let CLIENTS = [];   // [{id,name,active}]
let TASKS = [];     // tareas
let boardClientFilter = ""; // filtro por cliente en el Tablero
let editingTask = null; // null = creando; objeto = editando
let taskNotes = [];     // notas generales en edición dentro del modal
let taskCorrections = []; // correcciones de revisión en edición
let taskAssignees = []; // responsables seleccionados (chips)

/* ---- Carga inicial de datos al entrar ---- */
async function bootData() {
  await Promise.all([loadMembers(), loadClients(), loadClientFileCounts(), loadGuests(), loadContent(), loadDeliverables(), loadRecordings(), loadPhases()]);
  await loadTasks();
}

async function loadMembers() {
  const { data, error } = await sb.from("profiles").select("id,name,email,role").order("name");
  MEMBERS = error ? [] : (data || []);
}

async function loadClients() {
  const { data, error } = await sb.from("clients").select("*").order("name");
  CLIENTS = error ? [] : (data || []);
}

async function loadTasks() {
  const { data, error } = await sb
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) { toast("No se pudieron cargar las tareas"); TASKS = []; }
  else TASKS = data || [];
  // Privacidad: los miembros solo ven sus propias tareas; los administradores ven todo
  if (!isAdmin()) {
    const me = currentProfile?.id;
    TASKS = TASKS.filter((t) => isMyTask(t, me));
  }
  renderBoard();
  rerenderCalendars();
}

/* Una tarea es "mía" si soy su responsable o su creador */
function isMyTask(t, me) {
  me = me || currentProfile?.id;
  if (!me) return false;
  if (t.owner_id === me) return true;
  return Array.isArray(t.assignee_ids) && t.assignee_ids.includes(me);
}

/* ---- Utilidades de presentación ---- */
function memberName(id) {
  const m = MEMBERS.find((x) => x.id === id);
  return m ? (m.name || m.email) : "—";
}
function fmtDate(d) {
  if (!d) return null;
  const [y, mo, da] = d.split("-").map(Number);
  const dt = new Date(y, mo - 1, da);
  return dt.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}
function isOverdue(d, estado) {
  if (!d || TASK_DONE.includes(estado)) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  const [y, mo, da] = d.split("-").map(Number);
  return new Date(y, mo - 1, da) < today;
}
function canDelete(task) {
  return task.owner_id === currentProfile?.id || currentProfile?.role === "owner";
}

function fillBoardClientFilter() {
  const sel = $("#boardClientFilter");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos los clientes</option>' +
    CLIENTS.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  sel.value = cur;
  if (!sel.dataset.wired) {
    sel.dataset.wired = "1";
    sel.onchange = () => { boardClientFilter = sel.value; renderBoard(); };
  }
}

/* ---- Render del tablero ---- */
function renderBoard() {
  const board = $("#board");
  if (!board.querySelector(".column")) buildBoardColumns();
  fillBoardClientFilter();
  board.querySelectorAll(".column__body").forEach((b) => (b.innerHTML = ""));

  const sourceAll = boardClientFilter ? TASKS.filter((t) => t.client_id === boardClientFilter) : TASKS;
  const piecesAll = boardClientFilter ? CONTENT.filter((c) => c.client_id === boardClientFilter) : CONTENT;
  const source = sourceAll.filter((t) => !TASK_DONE.includes(taskStatus(t)));
  const pieces = piecesAll.filter((c) => !CONTENT_ARCHIVE.includes(c.estatus));
  const total = source.length + pieces.length;
  $("#taskCount").textContent = `${total} ${total === 1 ? "actividad" : "actividades"}`;

  const counts = {};
  BOARD_COLUMNS.forEach((s) => (counts[s] = 0));

  source.forEach((t) => {
    const st = taskStatus(t);
    counts[st]++;
    const body = board.querySelector(`.column__body[data-col="${st}"]`);
    if (body) body.appendChild(taskCardEl(t));
  });

  pieces.forEach((c) => {
    const st = BOARD_COLUMNS.includes(c.estatus) ? c.estatus : "Por hacer";
    counts[st]++;
    const body = board.querySelector(`.column__body[data-col="${st}"]`);
    if (body) body.appendChild(contentCardEl(c));
  });

  BOARD_COLUMNS.forEach((s) => {
    const col = board.querySelector(`.column[data-estado="${s}"]`);
    if (!col) return;
    const isArchive = BOARD_ARCHIVE_COLS.includes(s);
    col.querySelector(".column__count").textContent = isArchive ? "" : counts[s];
    const body = col.querySelector(".column__body");
    if (isArchive) {
      const hint = document.createElement("div");
      hint.className = "col-empty col-archive";
      hint.textContent = "Suelta aquí para archivar →  Historial";
      body.appendChild(hint);
    } else if (counts[s] === 0) {
      const empty = document.createElement("div");
      empty.className = "col-empty";
      empty.textContent = "Sin tareas";
      body.appendChild(empty);
    }
  });
}

function taskCardEl(t) {
  const card = document.createElement("article");
  card.className = "tcard";
  card.dataset.id = t.id;
  card.dataset.prioridad = t.prioridad || "Media";
  card.setAttribute("draggable", "true");

  const cliente = CLIENTS.find((c) => c.id === t.client_id);
  const fecha = fmtDate(t.due_date);
  const overdue = isOverdue(t.due_date, t.estado);

  const ids = Array.isArray(t.assignee_ids) ? t.assignee_ids : [];
  let avatars = "";
  ids.slice(0, 3).forEach((id) => {
    avatars += `<span class="mini" title="${escapeHtml(memberName(id))}">${escapeHtml(initials(memberName(id)))}</span>`;
  });
  if (ids.length > 3) avatars += `<span class="mini more">+${ids.length - 3}</span>`;

  card.innerHTML = `
    <div class="tcard__title">${escapeHtml(t.title)}</div>
    <div class="tcard__selects">
      <select class="tstatus" data-status-select title="Estatus de la tarea">${TASK_STATUS.map((s) => `<option ${s === taskStatus(t) ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select>
      <select class="tstage" data-stage-select title="Etapa de producción">${ESTADOS.map((e) => `<option ${e === taskEtapa(t) ? "selected" : ""}>${escapeHtml(e)}</option>`).join("")}</select>
    </div>
    <div class="tcard__row">
      ${cliente ? `<span class="chip chip--cliente">${clientAvatar(cliente, 16)}${escapeHtml(cliente.name)}</span>` : ""}
      ${fecha ? `<span class="chip chip--fecha ${overdue ? "overdue" : ""}">${fecha}</span>` : ""}
      ${t.drive_url ? `<a class="tcard__drive" data-drive href="${escapeHtml(normalizeUrl(t.drive_url))}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>Drive</a>` : ""}
      ${t.reels_url ? `<a class="tcard__drive tcard__reels" data-reels href="${escapeHtml(normalizeUrl(t.reels_url))}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4zM4 9h16M9 4l2.5 5M14 4l2.5 5"/><path d="m10 13 4 2.5-4 2.5z" fill="currentColor" stroke="none"/></svg>Reels</a>` : ""}
      ${Array.isArray(t.notes) && t.notes.length ? `<span class="tcard__notes" title="${t.notes.length} nota(s)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 10h8M8 14h5M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/></svg>${t.notes.length}</span>` : ""}
      ${Array.isArray(t.time_log) && t.time_log.length ? `<span class="tcard__notes tcard__time" title="Tiempo registrado"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>${escapeHtml(fmtDur(timeTotalMin(t.time_log)))}</span>` : ""}
      ${myTimerStart(t) ? `<span class="tcard__running" title="Cronómetro en curso"><span class="rdot"></span>en curso</span>` : ""}
      ${(() => {
        const pz = t.content_id ? CONTENT.find((c) => c.id === t.content_id) : null;
        if (!pz) return "";
        let h = `<span class="chip" title="${escapeHtml(pz.title)}">🎬 ${pz.chapter != null ? "#" + pz.chapter : "Ep"}</span>`;
        if (pz.delivery_date) h += `<span class="chip chip--due" title="Fecha de entrega del episodio">Entrega ${fmtDate(pz.delivery_date)}</span>`;
        return h;
      })()}
    </div>
    <div class="tcard__foot">
      <span class="chip chip--prio" data-p="${escapeHtml(t.prioridad || "Media")}"><span class="pdot"></span>${escapeHtml(t.prioridad || "Media")}</span>
      <span class="assignees">${avatars || '<span style="font-size:11px;color:var(--text-faint)">Sin responsables</span>'}</span>
    </div>
    <div class="tprog" title="${escapeHtml(taskStatus(t))} · ${statusPct(taskStatus(t))}%">
      <div class="tprog__bar"><div class="tprog__fill" data-st="${escapeHtml(taskStatus(t))}" style="width:${statusPct(taskStatus(t))}%"></div></div>
      <span class="tprog__lbl">${escapeHtml(taskStatus(t))} · ${statusPct(taskStatus(t))}%</span>
    </div>
  `;

  card.addEventListener("click", () => openTaskModal(t));
  card.querySelector("[data-drive]")?.addEventListener("click", (e) => e.stopPropagation());
  card.querySelector("[data-reels]")?.addEventListener("click", (e) => e.stopPropagation());

  // Selector de estatus en la tarjeta (mueve de columna)
  const statusSel = card.querySelector("[data-status-select]");
  if (statusSel) {
    statusSel.addEventListener("click", (e) => e.stopPropagation());
    statusSel.addEventListener("mousedown", (e) => e.stopPropagation());
    statusSel.addEventListener("change", async (e) => {
      e.stopPropagation();
      await updateTaskEstado(t, statusSel.value);
    });
  }

  // Selector de etapa de producción en la tarjeta
  const stageSel = card.querySelector("[data-stage-select]");
  if (stageSel) {
    stageSel.addEventListener("click", (e) => e.stopPropagation());
    stageSel.addEventListener("mousedown", (e) => e.stopPropagation());
    stageSel.addEventListener("change", async (e) => {
      e.stopPropagation();
      await updateTaskProceso(t, stageSel.value);
    });
  }

  // Arrastrar y soltar (escritorio)
  card.addEventListener("dragstart", (e) => {
    card.classList.add("dragging");
    e.dataTransfer.setData("text/plain", t.id);
    e.dataTransfer.effectAllowed = "move";
  });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));

  return card;
}

/* Tarjeta de PIEZA de contenido dentro del Tablero (mismo registro que Producción) */
function contentCardEl(c) {
  const card = document.createElement("article");
  card.className = "tcard tcard--pieza";
  card.dataset.id = c.id;
  card.setAttribute("draggable", "true");

  const cliente = CLIENTS.find((x) => x.id === c.client_id);
  const st = TASK_STATUS.includes(c.estatus) ? c.estatus : "Por hacer";
  const etapa = ESTADOS.includes(c.estado) ? c.estado : "Agendado en calendario";
  const overdue = isOverdue(c.delivery_date, st);

  const ids = Array.isArray(c.assignee_ids) ? c.assignee_ids : [];
  let avatars = "";
  ids.slice(0, 3).forEach((id) => { avatars += `<span class="mini" title="${escapeHtml(memberName(id))}">${escapeHtml(initials(memberName(id)))}</span>`; });
  if (ids.length > 3) avatars += `<span class="mini more">+${ids.length - 3}</span>`;

  card.innerHTML = `
    <div class="tcard__title"><span class="pieza-tag">🎬 ${c.chapter != null ? "#" + c.chapter : "Pieza"}</span> ${escapeHtml(c.title)}</div>
    <div class="tcard__selects">
      <select class="tstatus" data-status-select title="Estatus">${TASK_STATUS.map((s) => `<option ${s === st ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select>
      <select class="tstage" data-stage-select title="Etapa de producción">${ESTADOS.map((e) => `<option ${e === etapa ? "selected" : ""}>${escapeHtml(e)}</option>`).join("")}</select>
    </div>
    <div class="tcard__row">
      ${cliente ? `<span class="chip chip--cliente">${clientAvatar(cliente, 16)}${escapeHtml(cliente.name)}</span>` : ""}
      ${c.delivery_date ? `<span class="chip chip--fecha ${overdue ? "overdue" : ""}" title="Fecha de entrega">Entrega ${fmtDate(c.delivery_date)}</span>` : ""}
      ${c.drive_url ? `<a class="tcard__drive" data-drive href="${escapeHtml(normalizeUrl(c.drive_url))}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>Drive</a>` : ""}
      ${c.reels_url ? `<a class="tcard__drive tcard__reels" data-reels href="${escapeHtml(normalizeUrl(c.reels_url))}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4zM4 9h16M9 4l2.5 5M14 4l2.5 5"/><path d="m10 13 4 2.5-4 2.5z" fill="currentColor" stroke="none"/></svg>Reels</a>` : ""}
    </div>
    <div class="tcard__foot">
      <span class="chip pieza-chip">Pieza</span>
      <span class="assignees">${avatars || '<span style="font-size:11px;color:var(--text-faint)">Sin editores</span>'}</span>
    </div>
  `;

  card.addEventListener("click", () => openContentModal(c));
  card.querySelector("[data-drive]")?.addEventListener("click", (e) => e.stopPropagation());
  card.querySelector("[data-reels]")?.addEventListener("click", (e) => e.stopPropagation());

  const statusSel = card.querySelector("[data-status-select]");
  if (statusSel) {
    statusSel.addEventListener("click", (e) => e.stopPropagation());
    statusSel.addEventListener("mousedown", (e) => e.stopPropagation());
    statusSel.addEventListener("change", async (e) => { e.stopPropagation(); await updateContentEstatus(c, statusSel.value); });
  }
  const stageSel = card.querySelector("[data-stage-select]");
  if (stageSel) {
    stageSel.addEventListener("click", (e) => e.stopPropagation());
    stageSel.addEventListener("mousedown", (e) => e.stopPropagation());
    stageSel.addEventListener("change", async (e) => { e.stopPropagation(); await updateContentEstado(c, stageSel.value); });
  }

  card.addEventListener("dragstart", (e) => {
    card.classList.add("dragging");
    e.dataTransfer.setData("text/plain", c.id);
    e.dataTransfer.effectAllowed = "move";
  });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));

  return card;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---- Construcción dinámica de columnas del tablero (por estatus) ---- */
function buildBoardColumns() {
  const board = $("#board");
  board.innerHTML = BOARD_COLUMNS.map((s) => `
    <div class="column" data-estado="${escapeHtml(s)}">
      <div class="column__head"><span class="column__title"><span class="dot"></span>${escapeHtml(s)}</span><span class="column__count">0</span></div>
      <div class="column__body" data-col="${escapeHtml(s)}"></div>
    </div>`).join("");
  board.querySelectorAll(".column").forEach((col) => {
    const estado = col.dataset.estado;
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("dragover"); });
    col.addEventListener("dragleave", () => col.classList.remove("dragover"));
    col.addEventListener("drop", async (e) => {
      e.preventDefault();
      col.classList.remove("dragover");
      const id = e.dataTransfer.getData("text/plain");
      const task = TASKS.find((t) => t.id === id);
      if (task) { if (taskStatus(task) !== estado) await updateTaskEstado(task, estado); return; }
      const piece = CONTENT.find((c) => c.id === id);
      if (piece) {
        const cur = TASK_STATUS.includes(piece.estatus) ? piece.estatus : "Por hacer";
        if (cur !== estado) await updateContentEstatus(piece, estado);
      }
    });
  });
}

async function updateTaskEstado(task, estado) {
  const prev = task.estado;
  const prevClosed = task.closed_at || null;
  const closed_at = closedAtFor(estado, prevClosed);
  task.estado = estado;               // optimista
  task.closed_at = closed_at;
  renderBoard();
  const { error } = await sb.from("tasks")
    .update({ estado, closed_at, updated_at: new Date().toISOString() })
    .eq("id", task.id);
  if (error) { task.estado = prev; task.closed_at = prevClosed; renderBoard(); toast("No se pudo mover la tarea"); }
  else if (TASK_DONE.includes(estado)) {
    toast("Tarea cerrada y archivada en el Historial");
    if (task.recording_id) archiveRecording(task.recording_id);
  }
}

async function updateTaskProceso(task, proceso) {
  const prev = task.proceso;
  task.proceso = proceso;             // optimista
  renderBoard();
  const { error } = await sb.from("tasks")
    .update({ proceso, updated_at: new Date().toISOString() })
    .eq("id", task.id);
  if (error) { task.proceso = prev; renderBoard(); toast("No se pudo cambiar la etapa"); }
}

async function updateContentEstatus(piece, estatus) {
  const prev = piece.estatus;
  const prevClosed = piece.closed_at || null;
  const closed_at = closedAtFor(estatus, prevClosed);
  piece.estatus = estatus;            // optimista
  piece.closed_at = closed_at;
  renderBoard(); renderContent();
  const { error } = await sb.from("content_items")
    .update({ estatus, closed_at, updated_at: new Date().toISOString() })
    .eq("id", piece.id);
  if (error) { piece.estatus = prev; piece.closed_at = prevClosed; renderBoard(); renderContent(); toast("No se pudo mover la pieza"); }
  else if (TASK_DONE.includes(estatus)) toast("Pieza cerrada y archivada en el Historial");
}

async function updateContentEstado(piece, estado) {
  const prev = piece.estado;
  piece.estado = estado;              // optimista (etapa de producción)
  renderBoard(); renderContent();
  const { error } = await sb.from("content_items")
    .update({ estado, updated_at: new Date().toISOString() })
    .eq("id", piece.id);
  if (error) { piece.estado = prev; renderBoard(); renderContent(); toast("No se pudo cambiar la etapa"); }
}

/* ============================================================
   Modal de tarea
   ============================================================ */
const taskOverlay = $("#taskOverlay");

function openTaskModal(task, prefill, context) {
  editingTask = task || null;
  $("#taskMsg").classList.add("hidden");
  $("#taskModalTitle").textContent = task
    ? (context === "grabacion" ? "Editar grabación" : "Editar tarea")
    : (context === "grabacion" ? "Nueva grabación" : "Nueva tarea");
  $("#btnSaveLabel").textContent = "Guardar";

  // Formulario simplificado para el calendario de grabación:
  // sin proceso, estado ni prioridad.
  const grabacion = context === "grabacion";
  $("#rowEstadoPrio").classList.toggle("hidden", grabacion);
  $("#fieldEtapa").classList.toggle("hidden", grabacion);

  // Poblar clientes
  const selC = $("#tCliente");
  selC.innerHTML = '<option value="">— Sin cliente —</option>' +
    CLIENTS.map((c) => {
      const st = c.status || "Activo";
      return `<option value="${c.id}">${escapeHtml(c.name)}${st !== "Activo" ? ` (${st.toLowerCase()})` : ""}</option>`;
    }).join("");
  selC.onchange = updateTClientePreview;

  // Responsables (desplegable con avatares)
  taskAssignees = (task && Array.isArray(task.assignee_ids)) ? task.assignee_ids.slice() : [];
  makeMultiSelect($("#tPeople"), MEMBERS.map((m) => ({ id: m.id, name: m.name || m.email })), taskAssignees,
    { avatar: true, placeholder: "Agregar responsable…", emptyMsg: "Aún no hay más personas registradas." });

  // Valores
  $("#tTitle").value     = task?.title || "";
  // Estatus (columna del Tablero)
  const selEstado = $("#tEstado");
  selEstado.innerHTML = TASK_STATUS.map((s) => `<option>${s}</option>`).join("");
  selEstado.value = taskStatus(task || {});
  // Etapa de producción (etiqueta)
  const selProc = $("#tProceso");
  selProc.innerHTML = ESTADOS.map((e) => `<option>${e}</option>`).join("");
  selProc.value = task ? taskEtapa(task) : "Agendado en calendario";
  $("#tPrioridad").value = task?.prioridad || "Media";
  $("#tFecha").value     = task?.due_date || "";
  $("#tCliente").value   = task?.client_id || "";
  updateTClientePreview();
  $("#tDrive").value     = task?.drive_url || "";
  $("#tReels").value     = task?.reels_url || "";

  // Episodio / pieza ligada
  const selCo = $("#tContent");
  selCo.innerHTML = '<option value="">— Ninguna —</option>' +
    CONTENT.map((c) => `<option value="${c.id}">${c.chapter != null ? "#" + c.chapter + " · " : ""}${escapeHtml(c.title)}</option>`).join("");
  selCo.value = task?.content_id || (prefill && prefill.content_id) || "";

  // Grabación vinculada (solo activas + la ya vinculada si estuviera archivada)
  const selRec = $("#tRecording");
  const recs = (typeof RECORDINGS !== "undefined" ? RECORDINGS : []).filter((r) => r.status !== "Archivada" || r.id === task?.recording_id);
  selRec.innerHTML = '<option value="">— Ninguna —</option>' +
    recs.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}${r.date ? " · " + fmtDate(r.date) : ""}</option>`).join("");
  selRec.value = task?.recording_id || (prefill && prefill.recording_id) || "";

  // Notas / correcciones (copia de trabajo)
  taskNotes = Array.isArray(task?.notes) ? JSON.parse(JSON.stringify(task.notes)) : [];
  taskCorrections = Array.isArray(task?.corrections) ? JSON.parse(JSON.stringify(task.corrections)) : [];
  $("#tNoteInput").value = "";
  $("#tCorrInput").value = "";
  renderTaskNotes();
  renderTaskCorr();
  renderTimeSection();

  // Prefill al crear desde el calendario (fecha y/o etapa)
  if (!task && prefill) {
    if (prefill.due_date) $("#tFecha").value = prefill.due_date;
    if (prefill.estado)   $("#tEstado").value = prefill.estado;
    if (prefill.proceso)  $("#tProceso").value = prefill.proceso;
  }

  // Botón eliminar solo si puede
  const delBtn = $("#btnDeleteTask");
  delBtn.classList.toggle("hidden", !(task && canDelete(task)));

  taskOverlay.classList.add("open");
  setTimeout(() => $("#tTitle").focus(), 50);
}

function closeTaskModal() {
  stopTick();
  taskOverlay.classList.remove("open");
  editingTask = null;
}

$("#btnNewTask").onclick = () => openTaskModal(null);
$("#fabNewTask").onclick = () => openTaskModal(null);
$("#btnRefresh").onclick = async () => { await bootData(); toast("Actualizado"); };
$("#taskModalClose").onclick = closeTaskModal;
$("#btnCancelTask").onclick = closeTaskModal;
taskOverlay.addEventListener("click", (e) => { if (e.target === taskOverlay) closeTaskModal(); });

/* ---- Guardar ---- */
$("#btnSaveTask").onclick = async () => {
  const title = $("#tTitle").value.trim();
  if (!title) { showTaskMsg("Escribe un título para la tarea."); return; }

  const assignee_ids = taskAssignees.slice();
  const payload = {
    title,
    proceso: $("#tProceso").value,
    estado: $("#tEstado").value,
    prioridad: $("#tPrioridad").value,
    due_date: $("#tFecha").value || null,
    client_id: $("#tCliente").value || null,
    drive_url: normalizeUrl($("#tDrive").value),
    reels_url: normalizeUrl($("#tReels").value),
    content_id: $("#tContent").value || null,
    recording_id: $("#tRecording").value || null,
    assignee_ids,
    notes: taskNotes,
    corrections: taskCorrections,
    closed_at: closedAtFor($("#tEstado").value, editingTask?.closed_at || null),
    updated_at: new Date().toISOString(),
  };

  const saveBtn = $("#btnSaveTask");
  saveBtn.disabled = true;
  $("#btnSaveLabel").innerHTML = '<span class="spinner"></span>';

  let error;
  if (editingTask) {
    ({ error } = await sb.from("tasks").update(payload).eq("id", editingTask.id));
  } else {
    payload.owner_id = currentProfile.id;
    ({ error } = await sb.from("tasks").insert(payload));
  }

  saveBtn.disabled = false;
  $("#btnSaveLabel").textContent = "Guardar";

  if (error) { showTaskMsg("No se pudo guardar: " + error.message); return; }
  // Si la tarea se cerró y tiene grabación vinculada, archivar esa grabación
  const recId = $("#tRecording").value || null;
  if (recId && TASK_DONE.includes($("#tEstado").value)) {
    await archiveRecording(recId);
  }
  closeTaskModal();
  toast(editingTask ? "Tarea actualizada" : "Tarea creada");
  await loadTasks();
};

/* ---- Eliminar ---- */
$("#btnDeleteTask").onclick = async () => {
  if (!editingTask) return;
  if (!confirm("¿Eliminar esta tarea? No se puede deshacer.")) return;
  const { error } = await sb.from("tasks").delete().eq("id", editingTask.id);
  if (error) { showTaskMsg("No se pudo eliminar: " + error.message); return; }
  closeTaskModal();
  toast("Tarea eliminada");
  await loadTasks();
};

function showTaskMsg(text) {
  const m = $("#taskMsg");
  m.textContent = text;
  m.className = "msg msg--error";
  m.classList.remove("hidden");
}

/* ============================================================
   FASE 3 — Calendarios (mes / semana)
   ============================================================ */

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function sameYmd(a, b) { return ymd(a) === b; }

// Lunes de la semana que contiene 'date'
function mondayOf(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function createCalendar(mountId, opts) {
  const mount = document.getElementById(mountId);
  let cursor = new Date();
  let mode = "month"; // 'month' | 'week'
  cursor.setHours(0, 0, 0, 0);

  function eventsByDay() {
    const map = {};
    if (opts.shared) {
      // Grabaciones propias de DNM (eventos), activas
      (typeof RECORDINGS !== "undefined" ? RECORDINGS : []).forEach((r) => {
        if (!r.date || r.status === "Archivada") return;
        (map[r.date] = map[r.date] || []).push({
          kind: "shared", id: r.id, recording: true,
          title: r.name || "Grabación", department: "DNM", estado: null,
        });
      });
      // Espejo de Notion (otros departamentos), por fecha de grabación
      (typeof SHARED !== "undefined" ? SHARED : []).forEach((c) => {
        const day = c.record_date;
        if (!day) return;
        (map[day] = map[day] || []).push({
          kind: "shared", id: c.notion_id,
          title: (c.chapter != null ? "#" + c.chapter + " " : "") + (c.title || "Pieza"),
          department: c.department || null, estado: c.estado || null,
        });
      });
      return map;
    }
    TASKS.filter(opts.filter).forEach((t) => {
      if (!t.due_date) return;
      (map[t.due_date] = map[t.due_date] || []).push({
        kind: "task", id: t.id, title: t.title, estado: t.estado, prioridad: t.prioridad,
      });
    });
    if (opts.includeContent && typeof CONTENT !== "undefined" && Array.isArray(CONTENT)) {
      CONTENT.forEach((c) => {
        if (!c.delivery_date) return;
        (map[c.delivery_date] = map[c.delivery_date] || []).push({
          kind: "content", id: c.id,
          title: (c.chapter != null ? "#" + c.chapter + " " : "") + (c.title || "Pieza"),
        });
      });
    }
    return map;
  }

  function label() {
    if (mode === "month") {
      const mn = cursor.toLocaleDateString("es-MX", { month: "long" });
      return mn.charAt(0).toUpperCase() + mn.slice(1) + " " + cursor.getFullYear();
    }
    const start = mondayOf(cursor);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const sameMonth = start.getMonth() === end.getMonth();
    const fmt = (d, withMonth) => d.toLocaleDateString("es-MX",
      withMonth ? { day: "numeric", month: "short" } : { day: "numeric" });
    return `${fmt(start, !sameMonth)} – ${fmt(end, true)} ${end.getFullYear()}`;
  }

  function cellsForMonth() {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = mondayOf(first);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      cells.push(d);
    }
    // recorta la última semana si sobra completa
    while (cells.length > 35 && cells[cells.length - 7].getMonth() !== cursor.getMonth()) {
      cells.splice(cells.length - 7, 7);
    }
    return cells;
  }

  function cellsForWeek() {
    const start = mondayOf(cursor);
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      cells.push(d);
    }
    return cells;
  }

  function render() {
    const byDay = eventsByDay();
    const todayStr = ymd(new Date());
    const cells = mode === "month" ? cellsForMonth() : cellsForWeek();
    const maxPills = mode === "week" ? 12 : 3;

    let grid = `<div class="cal__weekdays">${WEEKDAYS.map((w) => `<div class="cal__weekday">${w}</div>`).join("")}</div>`;
    grid += `<div class="cal__grid ${mode === "week" ? "week" : ""}">`;

    cells.forEach((d) => {
      const key = ymd(d);
      const isOther = mode === "month" && d.getMonth() !== cursor.getMonth();
      const isToday = key === todayStr;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const list = (byDay[key] || []);

      let pills = list.slice(0, maxPills).map((ev) => {
        if (ev.kind === "shared") {
          const dep = ev.department ? ` · ${ev.department}` : "";
          const icon = ev.recording ? "🎥 " : "";
          return `<div class="cal__pill cal__pill--shared${ev.recording ? " cal__pill--rec" : ""}" data-kind="shared" data-id="${ev.id}" title="${escapeHtml(ev.title + dep)}">${icon}${escapeHtml(ev.title)}${ev.department ? ` <span class="cal__dep">${escapeHtml(ev.department)}</span>` : ""}</div>`;
        }
        if (ev.kind === "content") {
          return `<div class="cal__pill cal__pill--content" data-kind="content" data-id="${ev.id}" title="Entrega: ${escapeHtml(ev.title)}">🎬 ${escapeHtml(ev.title)}</div>`;
        }
        const done = TASK_DONE.includes(ev.estado);
        return `<div class="cal__pill ${done ? "done" : ""}" data-kind="task" data-prioridad="${escapeHtml(ev.prioridad || "Media")}" data-id="${ev.id}" title="${escapeHtml(ev.title)}">${escapeHtml(ev.title)}</div>`;
      }).join("");
      if (list.length > maxPills) pills += `<div class="cal__more">+${list.length - maxPills} más</div>`;

      grid += `
        <div class="cal__cell ${isOther ? "other" : ""} ${isToday ? "today" : ""} ${isWeekend ? "weekend" : ""}" data-day="${key}">
          <div class="cal__daynum"><span>${d.getDate()}</span></div>
          ${pills}
        </div>`;
    });
    grid += `</div>`;

    mount.innerHTML = `
      <div class="cal__bar">
        <div class="cal__nav">
          <button class="cal__navbtn" data-act="prev" aria-label="Anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m15 18-6-6 6-6"/></svg></button>
          <button class="cal__today" data-act="today">Hoy</button>
          <button class="cal__navbtn" data-act="next" aria-label="Siguiente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m9 18 6-6-6-6"/></svg></button>
        </div>
        <div class="cal__label">${label()}</div>
        <div class="cal__spacer"></div>
        <div class="cal__modes">
          <button data-mode="month" class="${mode === "month" ? "active" : ""}">Mes</button>
          <button data-mode="week" class="${mode === "week" ? "active" : ""}">Semana</button>
        </div>
      </div>
      ${grid}`;

    // eventos de la barra
    mount.querySelector('[data-act="prev"]').onclick = () => { shift(-1); };
    mount.querySelector('[data-act="next"]').onclick = () => { shift(1); };
    mount.querySelector('[data-act="today"]').onclick = () => { cursor = new Date(); cursor.setHours(0,0,0,0); render(); };
    mount.querySelectorAll("[data-mode]").forEach((b) => {
      b.onclick = () => { mode = b.dataset.mode; render(); };
    });

    // click en una tarjeta -> editar (tarea o pieza). En 'shared' es solo lectura.
    if (opts.shared) {
      // pills: editar grabación propia (las de DNM); las del espejo (Notion) son solo lectura
      mount.querySelectorAll('.cal__pill[data-kind="shared"]').forEach((p) => {
        p.onclick = (e) => {
          e.stopPropagation();
          const r = (typeof RECORDINGS !== "undefined" ? RECORDINGS : []).find((x) => x.id === p.dataset.id);
          if (r) openRecordingModal(r);
        };
      });
      // tocar un día crea una grabación (evento) con esa fecha
      mount.querySelectorAll(".cal__cell").forEach((c) => {
        c.onclick = () => openRecordingModal(null, { date: c.dataset.day });
      });
    } else {
      mount.querySelectorAll(".cal__pill").forEach((p) => {
        p.onclick = (e) => {
          e.stopPropagation();
          if (p.dataset.kind === "content") {
            const c = CONTENT.find((x) => x.id === p.dataset.id);
            if (c) openContentModal(c);
          } else {
            const t = TASKS.find((x) => x.id === p.dataset.id);
            if (t) openTaskModal(t, null, opts.context);
          }
        };
      });
      mount.querySelectorAll(".cal__cell").forEach((c) => {
        c.onclick = () => openTaskModal(null, { due_date: c.dataset.day, proceso: opts.newProceso }, opts.context);
      });
    }
  }

  function shift(dir) {
    if (mode === "month") cursor.setMonth(cursor.getMonth() + dir);
    else cursor.setDate(cursor.getDate() + dir * 7);
    render();
  }

  return { render };
}

// Instancias
let calAct = null;   // todas las tareas con fecha
let calGrab = null;  // solo "Grabación"
let calShared = null; // espejo de Notion (solo lectura)
let SHARED = [];      // contenido compartido (todos los departamentos)

function initCalendars() {
  if (!calAct) {
    calAct = createCalendar("cal-actividades", {
      filter: () => true,
      includeContent: true,
    });
  }
  if (!calGrab) {
    calGrab = createCalendar("cal-grabacion", {
      filter: (t) => taskEtapa(t) === "Grabación",
      newProceso: "Grabación",
      context: "grabacion",
    });
  }
  if (!calShared) {
    calShared = createCalendar("cal-compartido", { shared: true });
  }
}

function rerenderCalendars() {
  initCalendars();
  // solo re-render de la vista visible (las otras se rendean al entrar)
  if ($("#view-actividades").classList.contains("active")) calAct.render();
  if ($("#view-grabacion").classList.contains("active")) calGrab.render();
}

/* ============================================================
   FASE 4 — Clientes
   ============================================================ */

let clientFilter = "todos"; // 'todos' | 'activos'
let editingClient = null;

function canDeleteClient(c) {
  return c.owner_id === currentProfile?.id || currentProfile?.role === "owner";
}

function taskCountForClient(id) {
  return TASKS.filter((t) => t.client_id === id).length;
}

function renderClients() {
  const grid = $("#clientsGrid");
  let list = CLIENTS;
  if (clientFilter === "activos") list = CLIENTS.filter((c) => (c.status || "Activo") === "Activo");
  else if (clientFilter === "prospectos") list = CLIENTS.filter((c) => c.status === "Prospecto");

  $("#clientCount").textContent = `${list.length} ${list.length === 1 ? "cliente" : "clientes"}`;

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="clients-empty" style="grid-column:1/-1">
        <strong>${CLIENTS.length === 0 ? "Aún no hay clientes" : "No hay clientes en este filtro"}</strong>
        <span>${CLIENTS.length === 0 ? 'Toca "Nuevo cliente" para agregar el primero.' : "Cambia el filtro a Todos para verlos."}</span>
      </div>`;
    return;
  }

  grid.innerHTML = "";
  list.forEach((c) => {
    const n = taskCountForClient(c.id);
    const el = document.createElement("article");
    const status = c.status || "Activo";
    el.className = "ccard" + (status === "Pausado" ? " inactive" : "");
    const stClass = "st-" + status.toLowerCase();
    const subtitle = [c.empresa, c.industry].filter(Boolean).join(" · ");
    const typeShort = (c.client_type || "").replace(" (Podcast)", "");
    el.innerHTML = `
      <div class="ccard__head">
        <div class="ccard__id">${clientAvatar(c, 40)}<div class="ccard__name">${escapeHtml(c.name)}</div></div>
        <span class="status ${stClass}">${escapeHtml(status)}</span>
      </div>
      ${subtitle ? `<div class="ccard__industry">${escapeHtml(subtitle)}</div>` : ""}
      <div class="ccard__chips">
        ${c.label ? `<span class="cchip ${c.label === "Prospecto" ? "label-prospecto" : ""}">${escapeHtml(c.label)}</span>` : ""}
        ${c.funnel ? `<span class="cchip funnel">${escapeHtml(c.funnel)}</span>` : ""}
        ${typeShort ? `<span class="cchip">${escapeHtml(typeShort)}</span>` : ""}
      </div>
      ${c.notes ? `<div class="ccard__notes">${escapeHtml(c.notes)}</div>` : ""}
      <div class="ccard__foot">
        <div class="ccard__badges">
          <span class="ccard__tasks">${n} ${n === 1 ? "tarea" : "tareas"}</span>
          ${CLIENT_FILE_COUNT[c.id] ? `<span class="ccard__files">${CLIENT_FILE_COUNT[c.id]} ${CLIENT_FILE_COUNT[c.id] === 1 ? "archivo" : "archivos"}</span>` : ""}
        </div>
      </div>`;
    el.onclick = () => openClientModal(c);
    grid.appendChild(el);
  });
}

/* Filtro Todos / Activos */
$("#clientFilter").querySelectorAll("button").forEach((b) => {
  b.onclick = () => {
    clientFilter = b.dataset.f;
    $("#clientFilter").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    renderClients();
  };
});

/* Modal */
const clientOverlay = $("#clientOverlay");

function openClientModal(client) {
  editingClient = client || null;
  $("#clientMsg").classList.add("hidden");
  $("#clientModalTitle").textContent = client ? "Editar cliente" : "Nuevo cliente";
  $("#btnSaveClientLabel").textContent = "Guardar";

  $("#cName").value = client?.name || "";
  renderClientLogoPreview();
  // Link del brief en Notion
  $("#cBriefUrl").value = client?.brief_url || "";
  updateBriefNotionBtn();
  $("#cEmpresa").value = client?.empresa || "";
  $("#cIndustry").value = client?.industry || "";
  $("#cLabel").value = client?.label || "Cliente";
  $("#cStatus").value = client?.status || "Activo";
  $("#cType").value = client?.client_type || "";
  $("#cFunnel").value = client?.funnel || "Nuevo";
  $("#cEmail").value = client?.email || "";
  $("#cPosition").value = client?.puesto || "";
  $("#cSource").value = client?.source || "";
  $("#cContactDate").value = client?.contact_date || "";
  $("#cLeadership").value = client?.liderazgo || "";
  $("#cNotes").value = client?.notes || "";
  $("#cReason").value = client?.reason || "";

  // Información traída de Notion (contenido del cuerpo) + enlace
  const nf = $("#cNotionField");
  const hasNotion = !!(client && (client.notion_content || client.notion_id));
  nf.style.display = hasNotion ? "" : "none";
  if (hasNotion) {
    $("#cNotionContent").textContent = client.notion_content || "(Sin contenido en el cuerpo de Notion)";
    const link = $("#btnViewNotion");
    if (client.notion_id) {
      link.href = "https://www.notion.so/" + String(client.notion_id).replace(/-/g, "");
      link.style.display = "";
    } else {
      link.style.display = "none";
    }
  }

  // Responsable: lista del equipo
  const selR = $("#cResponsible");
  selR.innerHTML = '<option value="">— Sin asignar —</option>' +
    MEMBERS.map((m) => `<option value="${m.id}">${escapeHtml(m.name || m.email)}</option>`).join("");
  selR.value = client?.responsible_id || "";

  $("#btnDeleteClient").classList.toggle("hidden", !(client && canDeleteClient(client)));

  refreshClientFilesPanel();
  applyClientModalRole();

  clientOverlay.classList.add("open");
  if (isAdmin()) setTimeout(() => $("#cName").focus(), 50);
}

function closeClientModal() {
  clientOverlay.classList.remove("open");
  editingClient = null;
}

$("#btnNewClient").onclick = () => openClientModal(null);
$("#clientModalClose").onclick = closeClientModal;
$("#btnCancelClient").onclick = closeClientModal;
clientOverlay.addEventListener("click", (e) => { if (e.target === clientOverlay) closeClientModal(); });

/* Guardar */
$("#btnSaveClient").onclick = async () => {
  const name = $("#cName").value.trim();
  if (!name) { showClientMsg("Escribe el nombre del cliente."); return; }

  const status = $("#cStatus").value;
  const payload = {
    name,
    empresa: $("#cEmpresa").value.trim() || null,
    industry: $("#cIndustry").value.trim() || null,
    label: $("#cLabel").value,
    status,
    active: status === "Activo",
    client_type: $("#cType").value || null,
    funnel: $("#cFunnel").value,
    email: $("#cEmail").value.trim() || null,
    puesto: $("#cPosition").value.trim() || null,
    source: $("#cSource").value || null,
    contact_date: $("#cContactDate").value || null,
    responsible_id: $("#cResponsible").value || null,
    liderazgo: $("#cLeadership").value.trim() || null,
    notes: $("#cNotes").value.trim() || null,
    reason: $("#cReason").value.trim() || null,
    brief_url: $("#cBriefUrl").value.trim() || null,
    sync_source: "app",
  };

  const btn = $("#btnSaveClient");
  btn.disabled = true;
  $("#btnSaveClientLabel").innerHTML = '<span class="spinner"></span>';

  let error;
  if (editingClient) {
    ({ error } = await sb.from("clients").update(payload).eq("id", editingClient.id));
    btn.disabled = false;
    $("#btnSaveClientLabel").textContent = "Guardar";
    if (error) { showClientMsg("No se pudo guardar: " + error.message); return; }
    closeClientModal();
    toast("Cliente actualizado");
    await loadClients();
    renderClients();
  } else {
    payload.owner_id = currentProfile.id;
    const { data, error: insErr } = await sb.from("clients").insert(payload).select().single();
    btn.disabled = false;
    $("#btnSaveClientLabel").textContent = "Guardar";
    if (insErr) { showClientMsg("No se pudo guardar: " + insErr.message); return; }
    // Cambiar a modo edición sin cerrar, para poder subir archivos
    editingClient = data;
    $("#clientModalTitle").textContent = "Editar cliente";
    $("#btnDeleteClient").classList.toggle("hidden", !canDeleteClient(data));
    refreshClientFilesPanel();
    toast("Cliente creado. Ya puedes subir archivos.");
    await loadClients();
    await loadClientFileCounts();
    renderClients();
  }
};

/* Eliminar */
$("#btnDeleteClient").onclick = async () => {
  if (!editingClient) return;
  const n = taskCountForClient(editingClient.id);
  const extra = n > 0 ? ` Las ${n} tarea(s) ligadas quedarán sin cliente.` : "";
  if (!confirm("¿Eliminar este cliente?" + extra)) return;
  const { error } = await sb.from("clients").delete().eq("id", editingClient.id);
  if (error) { showClientMsg("No se pudo eliminar: " + error.message); return; }
  closeClientModal();
  toast("Cliente eliminado");
  await Promise.all([loadClients(), loadTasks()]);
  renderClients();
};

function showClientMsg(text) {
  const m = $("#clientMsg");
  m.textContent = text;
  m.className = "msg msg--error";
  m.classList.remove("hidden");
}

/* ============================================================
   FASE 5 — Utilidades + archivos de cliente
   ============================================================ */

const FILES_BUCKET = "client-files";
let CLIENT_FILE_COUNT = {}; // { client_id: n }

function normalizeUrl(v) {
  const s = (v || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) return "https://" + s;
  return s;
}
function fmtSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
function fmtDateTime(iso) {
  try { return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return ""; }
}
function safeName(name) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

async function loadClientFileCounts() {
  const { data, error } = await sb.from("client_files").select("client_id");
  CLIENT_FILE_COUNT = {};
  if (!error && data) data.forEach((r) => { CLIENT_FILE_COUNT[r.client_id] = (CLIENT_FILE_COUNT[r.client_id] || 0) + 1; });
}

/* ---- Archivos dentro del modal de cliente ---- */
async function loadClientFiles(clientId) {
  const listEl = $("#cFilesList");
  listEl.innerHTML = '<div class="files__empty">Cargando archivos…</div>';
  const { data, error } = await sb.from("client_files")
    .select("*").eq("client_id", clientId).order("created_at", { ascending: false });
  if (error) { listEl.innerHTML = '<div class="files__empty">No se pudieron cargar los archivos.</div>'; return; }
  renderFilesList(data || []);
}

function renderFilesList(files) {
  const listEl = $("#cFilesList");
  if (!files.length) { listEl.innerHTML = '<div class="files__empty">Aún no hay archivos. Sube el primero abajo.</div>'; return; }
  listEl.innerHTML = "";
  files.forEach((f) => {
    const row = document.createElement("div");
    row.className = "file-row";
    row.innerHTML = `
      <div class="file-row__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
      </div>
      <div class="file-row__main">
        <div class="file-row__name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
        <div class="file-row__meta">${fmtSize(f.size)} · ${fmtDateTime(f.created_at)}</div>
      </div>
      <button class="file-row__act dl" title="Descargar / abrir">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      </button>
      <button class="file-row__act del" title="Eliminar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>`;
    row.querySelector(".dl").onclick = () => downloadFile(f);
    row.querySelector(".del").onclick = () => deleteFile(f);
    listEl.appendChild(row);
  });
}

async function downloadFile(f) {
  const { data, error } = await sb.storage.from(FILES_BUCKET).createSignedUrl(f.path, 60);
  if (error || !data?.signedUrl) { toast("No se pudo abrir el archivo"); return; }
  window.open(data.signedUrl, "_blank", "noopener");
}

async function deleteFile(f) {
  if (!confirm(`¿Eliminar "${f.name}"?`)) return;
  const { error: sErr } = await sb.storage.from(FILES_BUCKET).remove([f.path]);
  if (sErr) { toast("No se pudo eliminar del almacén"); return; }
  await sb.from("client_files").delete().eq("id", f.id);
  toast("Archivo eliminado");
  await loadClientFiles(f.client_id);
  await loadClientFileCounts();
}

async function handleFileUpload(fileList) {
  if (!editingClient) { toast("Guarda el cliente primero"); return; }
  const files = Array.from(fileList);
  if (!files.length) return;

  const label = $("#cUploadLabel");
  const original = label.textContent;
  $("#cUploadBtn").style.pointerEvents = "none";

  let ok = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    label.innerHTML = `<span class="spinner"></span> Subiendo ${i + 1}/${files.length}…`;
    const path = `${editingClient.id}/${Date.now()}-${safeName(file.name)}`;
    const { error: upErr } = await sb.storage.from(FILES_BUCKET).upload(path, file, { upsert: false });
    if (upErr) { toast(`No se pudo subir ${file.name}`); continue; }
    const { error: insErr } = await sb.from("client_files").insert({
      client_id: editingClient.id, name: file.name, path,
      size: file.size, mime: file.type || null, uploaded_by: currentProfile.id,
    });
    if (insErr) { await sb.storage.from(FILES_BUCKET).remove([path]); toast(`Error registrando ${file.name}`); continue; }
    ok++;
  }

  label.textContent = original;
  $("#cUploadBtn").style.pointerEvents = "";
  $("#cFileInput").value = "";
  if (ok) toast(ok === 1 ? "Archivo subido" : `${ok} archivos subidos`);
  await loadClientFiles(editingClient.id);
  await loadClientFileCounts();
}

$("#cFileInput").addEventListener("change", (e) => handleFileUpload(e.target.files));

/* Mostrar u ocultar el panel de archivos según si el cliente ya existe */
function refreshClientFilesPanel() {
  const exists = !!editingClient;
  $("#cFilesHint").classList.toggle("hidden", exists);
  $("#cUploadBtn").classList.toggle("hidden", !exists);
  $("#cBriefHint").classList.toggle("hidden", exists);
  $("#btnOpenBrief").classList.toggle("hidden", !exists);
  if (exists) loadClientFiles(editingClient.id);
  else $("#cFilesList").innerHTML = "";
}

/* ============================================================
   FASE 6 / 20 — Notas y Correcciones (logs dentro del modal de tarea)
   ============================================================ */
function renderLog(boxSel, arr, emptyMsg, onChange) {
  const box = $(boxSel);
  if (!arr.length) { box.innerHTML = `<div class="notes-empty">${escapeHtml(emptyMsg)}</div>`; return; }
  box.innerHTML = "";
  arr.slice().reverse().forEach((note) => {
    const row = document.createElement("div");
    row.className = "note";
    row.innerHTML = `
      <div class="note__meta">
        <span class="note__who">${escapeHtml(note.author_name || "Alguien")}</span>
        <span>${escapeHtml(fmtDateTime(note.created_at))}</span>
      </div>
      <div class="note__body">${escapeHtml(note.body)}</div>`;
    const del = document.createElement("button");
    del.className = "note__del"; del.type = "button"; del.title = "Borrar"; del.innerHTML = "&times;";
    del.onclick = () => { const i = arr.findIndex((n) => n.id === note.id); if (i >= 0) arr.splice(i, 1); onChange(); };
    row.querySelector(".note__meta").appendChild(del);
    box.appendChild(row);
  });
}
function addLogEntry(arr, inputSel, onChange) {
  const input = $(inputSel);
  const body = input.value.trim();
  if (!body) return;
  arr.push({
    id: newId(), body,
    author_id: currentProfile?.id || null,
    author_name: currentProfile?.name || currentProfile?.email || "Alguien",
    created_at: new Date().toISOString(),
  });
  input.value = "";
  onChange();
  input.focus();
}

function renderTaskNotes() { renderLog("#tNotesList", taskNotes, "Aún no hay notas.", renderTaskNotes); }
function renderTaskCorr()  { renderLog("#tCorrList", taskCorrections, "Aún no hay correcciones.", renderTaskCorr); }

function newId() {
  try { return crypto.randomUUID(); } catch (e) { return "n_" + Date.now() + "_" + Math.random().toString(16).slice(2); }
}

$("#btnAddNote").onclick = () => addLogEntry(taskNotes, "#tNoteInput", renderTaskNotes);
$("#btnAddCorr").onclick = () => addLogEntry(taskCorrections, "#tCorrInput", renderTaskCorr);

/* ============================================================
   FASE 9 — Contenido (piezas/episodios) + Invitados
   ============================================================ */

const CONTENT_ESTADOS = ESTADOS;
const CONTENT_DONE = ["Programado para publicar", "Publicado"];

let GUESTS = [];
let CONTENT = [];
let editingContent = null;
let editingGuest = null;
let contentFilterEstado = "";
let contentClientFilter = "";
let contentMine = false;

async function loadGuests() {
  const { data, error } = await sb.from("guests").select("*").order("name");
  GUESTS = error ? [] : (data || []);
}
async function loadContent() {
  const { data, error } = await sb.from("content_items").select("*").order("created_at", { ascending: false });
  CONTENT = error ? [] : (data || []);
}

function guestName(id) {
  const g = GUESTS.find((x) => x.id === id);
  return g ? g.name : "—";
}

/* ---- Pestañas Piezas / Invitados ---- */
$("#contentTabs").querySelectorAll("button").forEach((b) => {
  b.onclick = () => {
    $("#contentTabs").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    const tab = b.dataset.tab;
    $("#tab-piezas").classList.toggle("hidden", tab !== "piezas");
    $("#tab-invitados").classList.toggle("hidden", tab !== "invitados");
    if (tab === "piezas") renderContent(); else renderGuests();
  };
});

/* ---- Filtro por estado ---- */
function fillContentFilter() {
  const sel = $("#contentFilter");
  if (sel.options.length <= 1) {
    CONTENT_ESTADOS.forEach((e) => {
      const o = document.createElement("option"); o.value = e; o.textContent = e; sel.appendChild(o);
    });
    sel.onchange = () => { contentFilterEstado = sel.value; renderContent(); };
  }
  const selC = $("#contentClientFilter");
  if (selC) {
    const cur = selC.value;
    selC.innerHTML = '<option value="">Todos los clientes</option>' +
      CLIENTS.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    selC.value = cur;
    if (!selC.dataset.wired) {
      selC.dataset.wired = "1";
      selC.onchange = () => { contentClientFilter = selC.value; renderContent(); };
    }
  }
}

/* ---- Render de piezas ---- */
function renderContent() {
  fillContentFilter();
  const box = $("#contentList");
  let list = CONTENT;
  if (contentFilterEstado) list = list.filter((c) => c.estado === contentFilterEstado);
  else list = list.filter((c) => !CONTENT_ARCHIVE.includes(c.estatus));
  if (contentClientFilter) list = list.filter((c) => c.client_id === contentClientFilter);
  if (contentMine) list = list.filter((c) => (Array.isArray(c.assignee_ids) ? c.assignee_ids : []).includes(currentProfile?.id));

  $("#contentCount").textContent = `${list.length} ${list.length === 1 ? "pieza" : "piezas"}`;

  if (!list.length) {
    box.innerHTML = `<div class="board-empty"><strong>${CONTENT.length ? "Sin piezas en este filtro" : "Aún no hay piezas"}</strong><span>${CONTENT.length ? "Cambia el filtro de estado." : 'Toca "Nueva pieza" para crear la primera.'}</span></div>`;
    return;
  }

  box.innerHTML = "";
  list.forEach((c) => {
    const cliente = CLIENTS.find((x) => x.id === c.client_id);
    const guests = (Array.isArray(c.guest_ids) ? c.guest_ids : []).map(guestName).filter((n) => n !== "—");
    const taskN = TASKS.filter((t) => t.content_id === c.id).length;
    const editors = (Array.isArray(c.assignee_ids) ? c.assignee_ids : []);
    const metaParts = [];
    if (cliente) metaParts.push(cliente.name);
    if (guests.length) metaParts.push("con " + guests.join(", "));
    if (taskN) metaParts.push(`${taskN} tarea${taskN === 1 ? "" : "s"}`);
    const estadoCls = CONTENT_DONE.includes(c.estado) ? "done" : (c.estado === "Cancelado" ? "muted" : "");
    let avatars = "";
    editors.slice(0, 3).forEach((id) => { avatars += `<span class="mini" title="${escapeHtml(memberName(id))}">${escapeHtml(initials(memberName(id)))}</span>`; });

    const row = document.createElement("div");
    row.className = "litem" + (c.estado === "Cancelado" ? " cancel" : "");
    row.innerHTML = `
      ${c.cover_url ? `<img class="litem__cover" src="${escapeHtml(c.cover_url)}" alt="" onerror="this.style.display='none'">` : `<div class="litem__chap">${c.chapter != null ? "#" + c.chapter : "—"}</div>`}
      <div class="litem__main">
        <div class="litem__title">${c.chapter != null && c.cover_url ? `<span style="color:var(--text-faint)">#${c.chapter} · </span>` : ""}${escapeHtml(c.title)}</div>
        <div class="litem__meta">${metaParts.length ? escapeHtml(metaParts.join(" · ")) : "Sin cliente"}</div>
        ${(c.drive_url || c.reels_url) ? `<div class="litem__links">
          ${c.drive_url ? `<a class="tcard__drive" data-lnk href="${escapeHtml(normalizeUrl(c.drive_url))}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>Drive</a>` : ""}
          ${c.reels_url ? `<a class="tcard__drive tcard__reels" data-lnk href="${escapeHtml(normalizeUrl(c.reels_url))}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4zM4 9h16M9 4l2.5 5M14 4l2.5 5"/><path d="m10 13 4 2.5-4 2.5z" fill="currentColor" stroke="none"/></svg>Reels</a>` : ""}
        </div>` : ""}
        ${avatars ? `<div class="assignees" style="margin-top:6px">${avatars}</div>` : ""}
      </div>
      <div class="litem__right">
        <span class="estado-chip ${estadoCls}">${escapeHtml(c.estado)}</span>
        <div class="litem__dates">
          ${c.record_date ? `<div><span class="lbl">Grab:</span> ${fmtDate(c.record_date)}</div>` : ""}
          ${c.release_date ? `<div><span class="lbl">Estreno:</span> ${fmtDate(c.release_date)}</div>` : ""}
          ${c.delivery_date ? `<div><span class="lbl">Entrega:</span> ${fmtDate(c.delivery_date)}</div>` : ""}
        </div>
      </div>`;
    row.onclick = () => openContentModal(c);
    row.querySelectorAll("[data-lnk]").forEach((a) => a.addEventListener("click", (e) => e.stopPropagation()));
    box.appendChild(row);
  });
}

/* ---- Modal de pieza ---- */
const contentOverlay = $("#contentOverlay");

function openContentModal(item, prefill) {
  editingContent = item || null;
  $("#contentMsg").classList.add("hidden");
  $("#contentModalTitle").textContent = item ? "Editar pieza" : "Nueva pieza";
  $("#btnSaveContentLabel").textContent = "Guardar";

  // estado
  const selE = $("#coEstado");
  selE.innerHTML = CONTENT_ESTADOS.map((e) => `<option>${e}</option>`).join("");
  selE.value = item?.estado || (prefill && prefill.estado) || "Agendado en calendario";
  // estatus (aparece en el Tablero)
  const selSt = $("#coEstatus");
  selSt.innerHTML = CONTENT_STATUS.map((s) => `<option>${s}</option>`).join("");
  selSt.value = (item && TASK_STATUS.includes(item.estatus)) ? item.estatus : "Por hacer";

  // cliente
  const selC = $("#coClient");
  selC.innerHTML = '<option value="">— Sin cliente —</option>' +
    CLIENTS.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  selC.value = item?.client_id || "";

  // entregable
  const selD = $("#coDeliverable");
  selD.innerHTML = '<option value="">— Sin entregable —</option>' +
    (typeof DELIVERABLES !== "undefined" ? DELIVERABLES : []).filter((d) => d.status !== "Archivado")
      .map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("");
  selD.value = item?.deliverable_id || "";

  // invitados (desplegable)
  coGuestsSel = (item && Array.isArray(item.guest_ids)) ? item.guest_ids.slice() : [];
  makeMultiSelect($("#coGuests"), GUESTS.map((g) => ({ id: g.id, name: g.name })), coGuestsSel,
    { avatar: false, search: true, placeholder: "Buscar invitado…", emptyMsg: "Aún no hay invitados. Créalos en la pestaña Invitados." });

  // editores (desplegable con avatares)
  coEditorsSel = (item && Array.isArray(item.assignee_ids)) ? item.assignee_ids.slice() : [];
  makeMultiSelect($("#coEditors"), MEMBERS.map((m) => ({ id: m.id, name: m.name || m.email })), coEditorsSel,
    { avatar: true, placeholder: "Agregar editor…", emptyMsg: "Aún no hay personas registradas." });

  $("#coTitle").value = item?.title || "";
  $("#coChapter").value = item?.chapter ?? "";
  $("#coRecord").value = item?.record_date || (prefill && prefill.record_date) || "";
  $("#coRelease").value = item?.release_date || "";
  $("#coDelivery").value = item?.delivery_date || "";
  $("#coCover").value = item?.cover_url || "";
  $("#coDrive").value = item?.drive_url || "";
  $("#coReels").value = item?.reels_url || "";
  $("#coNotes").value = item?.notes || "";
  $("#coCorr").value = item?.corrections || "";

  $("#btnDeleteContent").classList.toggle("hidden", !(item && (item.owner_id === currentProfile?.id || currentProfile?.role === "owner")));

  contentOverlay.classList.add("open");
  setTimeout(() => $("#coTitle").focus(), 50);
}
function closeContentModal() { contentOverlay.classList.remove("open"); editingContent = null; }

$("#btnNewContent").onclick = () => openContentModal(null);
$("#btnMyContent").onclick = () => {
  contentMine = !contentMine;
  $("#btnMyContent").classList.toggle("btn--primary", contentMine);
  $("#btnMyContent").classList.toggle("btn--ghost", !contentMine);
  renderContent();
};
$("#contentModalClose").onclick = closeContentModal;
$("#btnCancelContent").onclick = closeContentModal;
contentOverlay.addEventListener("click", (e) => { if (e.target === contentOverlay) closeContentModal(); });

$("#btnSaveContent").onclick = async () => {
  const title = $("#coTitle").value.trim();
  if (!title) { showMsg("#contentMsg", "Escribe un título."); return; }
  const chapterRaw = $("#coChapter").value.trim();
  const guest_ids = coGuestsSel.slice();
  const assignee_ids = coEditorsSel.slice();
  const payload = {
    title,
    chapter: chapterRaw === "" ? null : Number(chapterRaw),
    estado: $("#coEstado").value,
    estatus: $("#coEstatus").value,
    closed_at: closedAtFor($("#coEstatus").value, editingContent?.closed_at || null),
    record_date: $("#coRecord").value || null,
    release_date: $("#coRelease").value || null,
    delivery_date: $("#coDelivery").value || null,
    client_id: $("#coClient").value || null,
    deliverable_id: $("#coDeliverable").value || null,
    guest_ids,
    assignee_ids,
    cover_url: normalizeUrl($("#coCover").value),
    drive_url: normalizeUrl($("#coDrive").value),
    reels_url: normalizeUrl($("#coReels").value),
    notes: $("#coNotes").value.trim() || null,
    corrections: $("#coCorr").value.trim() || null,
    sync_source: "app",
    updated_at: new Date().toISOString(),
  };
  const btn = $("#btnSaveContent"); btn.disabled = true; $("#btnSaveContentLabel").innerHTML = '<span class="spinner"></span>';
  let error;
  if (editingContent) ({ error } = await sb.from("content_items").update(payload).eq("id", editingContent.id));
  else { payload.owner_id = currentProfile.id; ({ error } = await sb.from("content_items").insert(payload)); }
  btn.disabled = false; $("#btnSaveContentLabel").textContent = "Guardar";
  if (error) { showMsg("#contentMsg", "No se pudo guardar: " + error.message); return; }
  closeContentModal(); toast(editingContent ? "Pieza actualizada" : "Pieza creada");
  await loadContent(); renderContent(); renderBoard();
  if (calShared) calShared.render();
  if (typeof renderDeliverables === "function") renderDeliverables();
};

$("#btnDeleteContent").onclick = async () => {
  if (!editingContent) return;
  if (!confirm("¿Eliminar esta pieza?")) return;
  const { error } = await sb.from("content_items").delete().eq("id", editingContent.id);
  if (error) { showMsg("#contentMsg", "No se pudo eliminar: " + error.message); return; }
  closeContentModal(); toast("Pieza eliminada");
  await loadContent(); renderContent(); renderBoard();
};

/* ---- Invitados ---- */
function renderGuests() {
  const grid = $("#guestsGrid");
  $("#guestCount").textContent = `${GUESTS.length} ${GUESTS.length === 1 ? "invitado" : "invitados"}`;
  if (!GUESTS.length) {
    grid.innerHTML = `<div class="clients-empty" style="grid-column:1/-1"><strong>Aún no hay invitados</strong><span>Toca "Nuevo invitado" para agregar el primero.</span></div>`;
    return;
  }
  grid.innerHTML = "";
  GUESTS.forEach((g) => {
    const el = document.createElement("article");
    el.className = "gcard";
    el.innerHTML = `
      <div class="gcard__name">${escapeHtml(g.name)}</div>
      ${g.instagram ? `<div class="gcard__ig">${escapeHtml(g.instagram)}</div>` : ""}
      ${g.notes ? `<div class="gcard__notes">${escapeHtml(g.notes)}</div>` : ""}`;
    el.onclick = () => openGuestModal(g);
    grid.appendChild(el);
  });
}

const guestOverlay = $("#guestOverlay");
function openGuestModal(g) {
  editingGuest = g || null;
  $("#guestMsg").classList.add("hidden");
  $("#guestModalTitle").textContent = g ? "Editar invitado" : "Nuevo invitado";
  $("#btnSaveGuestLabel").textContent = "Guardar";
  $("#guName").value = g?.name || "";
  $("#guInstagram").value = g?.instagram || "";
  $("#guEmail").value = g?.email || "";
  $("#guNotes").value = g?.notes || "";
  $("#btnDeleteGuest").classList.toggle("hidden", !(g && (g.owner_id === currentProfile?.id || currentProfile?.role === "owner")));
  guestOverlay.classList.add("open");
  setTimeout(() => $("#guName").focus(), 50);
}
function closeGuestModal() { guestOverlay.classList.remove("open"); editingGuest = null; }

$("#btnNewGuest").onclick = () => openGuestModal(null);
$("#guestModalClose").onclick = closeGuestModal;
$("#btnCancelGuest").onclick = closeGuestModal;
guestOverlay.addEventListener("click", (e) => { if (e.target === guestOverlay) closeGuestModal(); });

$("#btnSaveGuest").onclick = async () => {
  const name = $("#guName").value.trim();
  if (!name) { showMsg("#guestMsg", "Escribe el nombre."); return; }
  const payload = {
    name,
    instagram: $("#guInstagram").value.trim() || null,
    email: $("#guEmail").value.trim() || null,
    notes: $("#guNotes").value.trim() || null,
  };
  const btn = $("#btnSaveGuest"); btn.disabled = true; $("#btnSaveGuestLabel").innerHTML = '<span class="spinner"></span>';
  let error;
  if (editingGuest) ({ error } = await sb.from("guests").update(payload).eq("id", editingGuest.id));
  else { payload.owner_id = currentProfile.id; ({ error } = await sb.from("guests").insert(payload)); }
  btn.disabled = false; $("#btnSaveGuestLabel").textContent = "Guardar";
  if (error) { showMsg("#guestMsg", "No se pudo guardar: " + error.message); return; }
  closeGuestModal(); toast(editingGuest ? "Invitado actualizado" : "Invitado creado");
  await loadGuests(); renderGuests();
};

$("#btnDeleteGuest").onclick = async () => {
  if (!editingGuest) return;
  if (!confirm("¿Eliminar este invitado?")) return;
  const { error } = await sb.from("guests").delete().eq("id", editingGuest.id);
  if (error) { showMsg("#guestMsg", "No se pudo eliminar: " + error.message); return; }
  closeGuestModal(); toast("Invitado eliminado");
  await loadGuests(); renderGuests();
};

/* Utilidad de mensajes en modales */
function showMsg(sel, text) {
  const m = $(sel);
  m.textContent = text; m.className = "msg msg--error"; m.classList.remove("hidden");
}

/* ============================================================
   FASE 10 — Brief de arranque (plantilla DNM por cliente)
   ============================================================ */
const BRIEF_SCHEMA = [
  { title: "1. Preguntas de entrevista", items: [
    { type: "area", key: "e_historia", label: "Historia y autoridad (cómo llegó, momentos clave, qué enseña mejor, resultados)" },
    { type: "area", key: "e_mercado", label: "Mercado y audiencia (problema que ve, qué no entiende el mercado, cliente a atraer / evitar)" },
    { type: "area", key: "e_oferta", label: "Oferta y venta (qué vende, oferta más rentable, objeciones, proceso comercial)" },
    { type: "area", key: "e_contenido", label: "Contenido (temas que le gustan, temas a evitar, opiniones fuertes, referentes)" },
  ]},
  { title: "2. Datos generales", items: [
    { type: "text", key: "dg_nombre", label: "Nombre completo" },
    { type: "text", key: "dg_marca", label: "Nombre público / marca personal" },
    { type: "text", key: "dg_empresa", label: "Empresa / organización" },
    { type: "text", key: "dg_puesto", label: "Puesto actual" },
    { type: "text", key: "dg_industria", label: "Industria" },
    { type: "text", key: "dg_ciudad", label: "Ciudad / país" },
    { type: "text", key: "dg_tel", label: "Teléfono" },
    { type: "text", key: "dg_email", label: "Email" },
    { type: "text", key: "dg_redes", label: "Redes sociales actuales" },
    { type: "text", key: "dg_web", label: "Sitio web / landing" },
    { type: "text", key: "dg_responsable", label: "Responsable interno DNM" },
    { type: "text", key: "dg_inicio", label: "Fecha de inicio" },
    { type: "text", key: "dg_estado", label: "Estado del proyecto" },
  ]},
  { title: "3. Brief inicial", items: [
    { type: "area", key: "bi_contexto", label: "Contexto general (quién es, trayectoria, diferenciador, por qué ahora, qué espera lograr)" },
    { type: "check", key: "bi_objetivos", label: "Objetivos principales", options: ["Posicionamiento como referente","Generación de prospectos","Atracción de oportunidades comerciales","Autoridad para vender consultoría / servicios","Reputación ejecutiva","Diferenciación frente a competidores","Lanzamiento de producto / servicio","Fortalecimiento de confianza"] },
    { type: "area", key: "bi_prioridades", label: "Prioridades del cliente (1, 2, 3)" },
  ]},
  { title: "4. Audiencia objetivo", items: [
    { type: "area", key: "au_ideal", label: "Cliente ideal (a quién atraer, cargo del decisor, industria, tamaño, poder adquisitivo, problema, deseo, objeciones)" },
    { type: "rows", key: "au_segmentos", label: "Segmentos de audiencia", cols: ["Segmento","Descripción","Prioridad"], count: 3 },
  ]},
  { title: "5. Oferta y modelo comercial", items: [
    { type: "area", key: "of_principal", label: "Oferta principal (servicio, problema que resuelve, resultado, ticket, duración, canal y proceso de venta)" },
    { type: "area", key: "of_secundarias", label: "Ofertas secundarias" },
    { type: "check", key: "of_conversion", label: "Conversión esperada", options: ["DM / mensaje directo","Formulario","Llamada diagnóstica","WhatsApp","Evento / webinar","Newsletter","Landing page"] },
  ]},
  { title: "6. Canales y ecosistema digital", items: [
    { type: "rows", key: "ca_tabla", label: "Canales", cols: ["Canal","Estado actual","Objetivo"], fixedRows: ["Instagram","LinkedIn","TikTok","YouTube","Facebook","Sitio web","Newsletter","WhatsApp / CRM"] },
    { type: "text", key: "ca_principal", label: "Canal principal recomendado" },
    { type: "text", key: "ca_secundario", label: "Canal secundario recomendado" },
  ]},
  { title: "7. Plan de implementación", items: [
    { type: "check", key: "pl_f1", label: "Fase 1 — Diagnóstico y estrategia", options: ["Levantamiento de información","Auditoría de presencia digital","Definición de posicionamiento","Definición de audiencia","Definición de pilares de contenido"] },
    { type: "check", key: "pl_f2", label: "Fase 2 — Producción base", options: ["Guías de contenido","Guiones iniciales","Diseño visual","Optimización de perfiles","Producción de fotos / videos"] },
    { type: "check", key: "pl_f3", label: "Fase 3 — Publicación y validación", options: ["Calendario de contenido","Publicación de primeras piezas","Medición inicial","Ajustes de mensaje","Ajustes de CTA"] },
    { type: "check", key: "pl_f4", label: "Fase 4 — Escalamiento", options: ["Campañas pagadas","Automatización de leads","Lead magnet","Embudo comercial","Reportes y optimización"] },
  ]},
  { title: "8. KPIs y métricas", items: [
    { type: "rows", key: "kp_tabla", label: "Métricas", cols: ["Métrica","Meta","Resultado"], fixedRows: ["Alcance","Crecimiento de audiencia","Engagement","Guardados","Compartidos","DMs recibidos","Leads generados","Llamadas agendadas","Ventas / cierres","Costo por lead"] },
  ]},
];

let briefClient = null;
const briefOverlay = $("#briefOverlay");

function openBrief(client) {
  if (!client) return;
  briefClient = client;
  const data = client.brief && typeof client.brief === "object" ? client.brief : {};
  // Prefill de datos generales desde la ficha, si están vacíos
  const defaults = {
    dg_nombre: client.name, dg_empresa: client.empresa, dg_puesto: client.puesto,
    dg_email: client.email, dg_industria: client.industry,
  };
  $("#briefModalTitle").textContent = "Brief — " + (client.name || "Cliente");
  $("#briefBody").innerHTML = BRIEF_SCHEMA.map((sec, i) => `
    <details class="brief-sec" ${i === 0 ? "open" : ""}>
      <summary>${sec.title}</summary>
      <div class="brief-sec__body">
        ${sec.items.map((it) => briefFieldHtml(it, data, defaults)).join("")}
      </div>
    </details>`).join("");
  briefOverlay.classList.add("open");
}

function briefFieldHtml(it, data, defaults) {
  const val = (data[it.key] != null && data[it.key] !== "") ? data[it.key] : (defaults[it.key] || "");
  if (it.type === "text")
    return `<div class="brief-field"><label>${it.label}</label><input class="input" data-bk="${it.key}" data-type="text" value="${escapeHtml(val)}"></div>`;
  if (it.type === "area")
    return `<div class="brief-field"><label>${it.label}</label><textarea class="input" data-bk="${it.key}" data-type="area">${escapeHtml(val || "")}</textarea></div>`;
  if (it.type === "check") {
    const sel = new Set(Array.isArray(data[it.key]) ? data[it.key] : []);
    return `<div class="brief-field"><label>${it.label}</label><div class="brief-check" data-bk="${it.key}" data-type="check">${it.options.map((o) => `<label><input type="checkbox" value="${escapeHtml(o)}" ${sel.has(o) ? "checked" : ""}> ${escapeHtml(o)}</label>`).join("")}</div></div>`;
  }
  if (it.type === "rows") {
    const cols = it.cols, fixed = it.fixedRows || null;
    const rows = Array.isArray(data[it.key]) ? data[it.key] : [];
    const n = fixed ? fixed.length : (it.count || 3);
    const gt = fixed ? `120px repeat(${cols.length - 1},1fr)` : `repeat(${cols.length},1fr)`;
    let h = `<div class="brief-field"><label>${it.label}</label><div class="brief-rows" data-bk="${it.key}" data-type="rows" data-fixed="${fixed ? 1 : 0}">`;
    h += `<div class="brief-row" style="grid-template-columns:${gt}">${cols.map((c) => `<div class="rowlabel" style="font-weight:600;color:var(--text-faint)">${escapeHtml(c)}</div>`).join("")}</div>`;
    for (let r = 0; r < n; r++) {
      const rd = rows[r] || [];
      h += `<div class="brief-row" data-row="${r}" style="grid-template-columns:${gt}">`;
      if (fixed) {
        h += `<div class="rowlabel">${escapeHtml(fixed[r])}</div>`;
        for (let c = 1; c < cols.length; c++) h += `<input class="input" data-col="${c - 1}" value="${escapeHtml(rd[c - 1] || "")}">`;
      } else {
        for (let c = 0; c < cols.length; c++) h += `<input class="input" data-col="${c}" value="${escapeHtml(rd[c] || "")}" placeholder="${escapeHtml(cols[c])}">`;
      }
      h += `</div>`;
    }
    h += `</div></div>`;
    return h;
  }
  return "";
}

function collectBrief() {
  const out = {};
  $("#briefBody").querySelectorAll("[data-bk]").forEach((el) => {
    const key = el.dataset.bk, type = el.dataset.type;
    if (type === "text" || type === "area") out[key] = el.value.trim();
    else if (type === "check") out[key] = Array.from(el.querySelectorAll("input:checked")).map((i) => i.value);
    else if (type === "rows") {
      const rows = [];
      el.querySelectorAll(".brief-row[data-row]").forEach((rowEl) => {
        const vals = Array.from(rowEl.querySelectorAll("input")).map((i) => i.value.trim());
        rows.push(vals);
      });
      out[key] = rows;
    }
  });
  return out;
}

function closeBrief() { briefOverlay.classList.remove("open"); briefClient = null; }

$("#btnOpenBrief").onclick = () => openBrief(editingClient);
$("#briefModalClose").onclick = closeBrief;
$("#btnCancelBrief").onclick = closeBrief;
briefOverlay.addEventListener("click", (e) => { if (e.target === briefOverlay) closeBrief(); });

$("#btnSaveBrief").onclick = async () => {
  if (!briefClient) return;
  const brief = collectBrief();
  const btn = $("#btnSaveBrief"); btn.disabled = true; $("#btnSaveBriefLabel").innerHTML = '<span class="spinner"></span>';
  const { error } = await sb.from("clients").update({ brief }).eq("id", briefClient.id);
  btn.disabled = false; $("#btnSaveBriefLabel").textContent = "Guardar brief";
  if (error) { toast("No se pudo guardar el brief"); return; }
  briefClient.brief = brief;
  const inList = CLIENTS.find((c) => c.id === briefClient.id); if (inList) inList.brief = brief;
  if (editingClient && editingClient.id === briefClient.id) editingClient.brief = brief;
  toast("Brief guardado");
  closeBrief();
};

/* ============================================================
   FASE 12 — Multi-selector desplegable con chips
   makeMultiSelect(container, options[{id,name}], selectedIds[], opts)
   - muta selectedIds en su lugar; con avatar:true muestra el ícono.
   ============================================================ */
let coGuestsSel = [];
let coEditorsSel = [];

function makeMultiSelect(container, options, selectedIds, opts) {
  opts = opts || {};
  const avatar = !!opts.avatar;
  const search = !!opts.search;
  const placeholder = opts.placeholder || "Agregar…";
  const emptyMsg = opts.emptyMsg || null;
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  container.className = "ms-wrap";

  function chipsHtml() {
    return selectedIds.map((id) => {
      const o = options.find((x) => x.id === id);
      const name = o ? o.name : "—";
      return `<span class="ms-chip ${avatar ? "has-ava" : ""}">${avatar ? `<span class="ms-ava">${escapeHtml(initials(name))}</span>` : ""}${escapeHtml(name)}<button type="button" class="ms-x" data-id="${id}" aria-label="Quitar">&times;</button></span>`;
    }).join("");
  }
  function bindChips() {
    container.querySelectorAll(".ms-x").forEach((b) => {
      b.onclick = () => { const i = selectedIds.indexOf(b.dataset.id); if (i >= 0) selectedIds.splice(i, 1); render(); };
    });
  }
  function add(id) { if (!selectedIds.includes(id)) selectedIds.push(id); render(); }

  function render() {
    if (!options.length && emptyMsg) { container.innerHTML = `<div class="ms-empty">${escapeHtml(emptyMsg)}</div>`; return; }
    const remaining = options.filter((o) => !selectedIds.includes(o.id));

    if (search) {
      container.innerHTML = `<div class="ms-chips">${chipsHtml()}</div><div class="ms-search"><input type="text" class="input ms-input" placeholder="${escapeHtml(placeholder)}" autocomplete="off"><div class="ms-suggest hidden"></div></div>`;
      bindChips();
      const input = container.querySelector(".ms-input");
      const box = container.querySelector(".ms-suggest");
      let active = -1;

      function results() {
        const q = norm(input.value.trim());
        const list = remaining.filter((o) => !q || norm(o.name).includes(q));
        return list.slice(0, 30);
      }
      function paint() {
        const list = results();
        active = -1;
        if (!input.value.trim() && !list.length) { box.classList.add("hidden"); return; }
        box.innerHTML = list.length
          ? list.map((o, i) => `<div class="ms-opt" data-id="${o.id}" data-i="${i}">${escapeHtml(o.name)}</div>`).join("")
          : `<div class="ms-opt ms-opt--none">Sin coincidencias</div>`;
        box.classList.remove("hidden");
        box.querySelectorAll(".ms-opt[data-id]").forEach((el) => {
          el.addEventListener("mousedown", (e) => { e.preventDefault(); add(el.dataset.id); });
        });
      }
      input.addEventListener("focus", paint);
      input.addEventListener("input", paint);
      input.addEventListener("keydown", (e) => {
        const items = Array.from(box.querySelectorAll(".ms-opt[data-id]"));
        if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, items.length - 1); items.forEach((el, i) => el.classList.toggle("active", i === active)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); items.forEach((el, i) => el.classList.toggle("active", i === active)); }
        else if (e.key === "Enter") { e.preventDefault(); const pick = active >= 0 ? items[active] : items[0]; if (pick) add(pick.dataset.id); }
        else if (e.key === "Escape") { box.classList.add("hidden"); }
      });
      input.addEventListener("blur", () => setTimeout(() => box.classList.add("hidden"), 120));
      setTimeout(() => input.focus(), 0);
      return;
    }

    // modo desplegable simple
    const optsHtml = `<option value="">${escapeHtml(placeholder)}</option>` +
      remaining.map((o) => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join("");
    container.innerHTML = `<div class="ms-chips">${chipsHtml()}</div><select class="input ms-select">${optsHtml}</select>`;
    bindChips();
    const sel = container.querySelector(".ms-select");
    if (!remaining.length) sel.disabled = true;
    sel.onchange = () => { if (sel.value) add(sel.value); };
  }
  render();
}

/* ============================================================
   FASE 19 — Usuarios y roles (solo administradores)
   ============================================================ */
function renderUsuarios() {
  const box = document.getElementById("usersList");
  if (!box) return;
  box.innerHTML = "";
  MEMBERS.forEach((m) => {
    const isMe = m.id === currentProfile?.id;
    const isOwner = m.role === "owner";
    const roleVal = (m.role === "admin" || m.role === "owner") ? "admin" : "editor";
    const el = document.createElement("div");
    el.className = "urow";
    el.innerHTML = `
      <div class="urow__id">
        <span class="mini">${escapeHtml(initials(m.name || m.email))}</span>
        <div>
          <div class="urow__name">${escapeHtml(m.name || m.email)}${isMe ? ' <span class="urow__you">Tú</span>' : ""}</div>
          <div class="urow__mail">${escapeHtml(m.email || "")}</div>
        </div>
      </div>
      ${isOwner
        ? `<span class="urow__owner">Dueño</span>`
        : `<select class="input urow__role" data-id="${m.id}">
             <option value="admin"  ${roleVal === "admin" ? "selected" : ""}>Administrador</option>
             <option value="editor" ${roleVal === "editor" ? "selected" : ""}>Editor</option>
           </select>`}`;
    box.appendChild(el);
  });
  box.querySelectorAll(".urow__role").forEach((sel) => {
    sel.onchange = async () => {
      sel.disabled = true;
      const id = sel.dataset.id;
      const { error } = await sb.from("profiles").update({ role: sel.value }).eq("id", id);
      sel.disabled = false;
      if (error) { toast("No se pudo cambiar el rol"); return; }
      toast("Rol actualizado");
      await loadMembers();
      if (id === currentProfile?.id) { currentProfile.role = sel.value; paintUser(currentProfile); }
      renderUsuarios();
    };
  });
}

/* Gating del modal de cliente: los miembros solo pueden ver */
function applyClientModalRole() {
  const admin = isAdmin();
  const body = document.querySelector("#clientOverlay .modal__body");
  if (body) body.querySelectorAll("input, select, textarea").forEach((el) => { el.disabled = !admin; });
  const save = document.getElementById("btnSaveClient");
  if (save) save.style.display = admin ? "" : "none";
  const del = document.getElementById("btnDeleteClient");
  if (!admin && del) del.classList.add("hidden");
  const brief = document.getElementById("btnOpenBrief");
  if (brief) brief.style.display = admin ? "" : "none";
  const up = document.getElementById("cUploadBtn");
  if (up) up.style.display = admin ? "" : "none";
  const ro = document.getElementById("clientReadonly");
  if (ro) ro.classList.toggle("hidden", admin);
}

/* ============================================================
   FASE 2 — Historial / archivo por cliente
   ============================================================ */
let histClientFilter = "";

function fmtCloseDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
  } catch (e) { return "—"; }
}

function fillHistClientFilter() {
  const sel = document.getElementById("histClientFilter");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos los clientes</option>' +
    CLIENTS.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  sel.value = cur;
  if (!sel.dataset.wired) {
    sel.dataset.wired = "1";
    sel.onchange = () => { histClientFilter = sel.value; renderHistorial(); };
  }
}

function renderHistorial() {
  fillHistClientFilter();
  const box = document.getElementById("histList");
  if (!box) return;

  // Reunir cerradas: tareas + piezas
  const items = [];
  TASKS.forEach((t) => {
    if (!TASK_DONE.includes(taskStatus(t))) return;
    items.push({
      kind: "Tarea", id: t.id, title: t.title, client_id: t.client_id,
      estado: taskStatus(t), closed_at: t.closed_at || t.updated_at || null,
      assignees: (t.assignee_ids || []), obj: t,
    });
  });
  CONTENT.forEach((c) => {
    const st = TASK_STATUS.includes(c.estatus) ? c.estatus : "Por hacer";
    if (!TASK_DONE.includes(st)) return;
    items.push({
      kind: "Pieza", id: c.id, title: (c.chapter != null ? "#" + c.chapter + " " : "") + (c.title || "Pieza"),
      client_id: c.client_id, estado: st, closed_at: c.closed_at || c.updated_at || null,
      assignees: (c.assignee_ids || []), obj: c, isContent: true,
    });
  });

  let list = items;
  if (histClientFilter) list = list.filter((i) => i.client_id === histClientFilter);
  list.sort((a, b) => (b.closed_at || "").localeCompare(a.closed_at || ""));

  document.getElementById("histCount").textContent = `${list.length} ${list.length === 1 ? "cerrada" : "cerradas"}`;

  if (!list.length) {
    box.innerHTML = `<div class="board-empty"><strong>Sin cierres todavía</strong><span>Cuando marques una tarea o pieza como Terminado o Cancelado, aparecerá aquí.</span></div>`;
    return;
  }

  box.innerHTML = "";
  list.forEach((i) => {
    const cliente = CLIENTS.find((x) => x.id === i.client_id);
    const doneCls = i.estado === "Cancelado" ? "muted" : "done";
    let avatars = "";
    i.assignees.slice(0, 3).forEach((id) => { avatars += `<span class="mini" title="${escapeHtml(memberName(id))}">${escapeHtml(initials(memberName(id)))}</span>`; });
    const row = document.createElement("div");
    row.className = "litem";
    row.innerHTML = `
      <div class="litem__chap" style="border-color:var(--border-strong);color:var(--text-faint)">${i.kind === "Pieza" ? "🎬" : "✓"}</div>
      <div class="litem__main">
        <div class="litem__title">${escapeHtml(i.title)}</div>
        <div class="litem__meta">${escapeHtml([i.kind, cliente ? cliente.name : "Sin cliente"].join(" · "))}</div>
        ${avatars ? `<div class="assignees" style="margin-top:6px">${avatars}</div>` : ""}
      </div>
      <div class="litem__right">
        <span class="estado-chip ${doneCls}">${escapeHtml(i.estado)}</span>
        <div class="litem__dates"><div><span class="lbl">Cerrada:</span> ${fmtCloseDate(i.closed_at)}</div></div>
      </div>`;
    row.onclick = () => { if (i.isContent) openContentModal(i.obj); else openTaskModal(i.obj); };
    box.appendChild(row);
  });
}

/* ============================================================
   FASE 22 — Registro de tiempo por tarea (timer + manual)
   ============================================================ */
let timerInterval = null;

function timeTotalMin(arr) { return (arr || []).reduce((s, e) => s + (Number(e.minutes) || 0), 0); }
function fmtDur(min) {
  min = Math.round(min || 0);
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}
function myTimerStart(task) {
  const at = (task && task.active_timers) || {};
  return at[currentProfile?.id] || null;
}
function twoDig(n) { return String(n).padStart(2, "0"); }

function stopTick() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }

function tickClock() {
  if (!editingTask) return;
  const start = myTimerStart(editingTask);
  const clock = document.getElementById("tTimerClock");
  if (!start || !clock) return;
  let sec = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 1000));
  const h = Math.floor(sec / 3600); sec -= h * 3600;
  const m = Math.floor(sec / 60); const s = sec - m * 60;
  clock.textContent = `${twoDig(h)}:${twoDig(m)}:${twoDig(s)}`;
}

function renderTimeSection() {
  const box = document.getElementById("tTimeBox");
  const hint = document.getElementById("tTimeHint");
  if (!box) return;
  stopTick();
  if (!editingTask) {           // tarea nueva: aún no se puede registrar tiempo
    box.classList.add("hidden");
    if (hint) hint.classList.remove("hidden");
    return;
  }
  box.classList.remove("hidden");
  if (hint) hint.classList.add("hidden");

  const log = Array.isArray(editingTask.time_log) ? editingTask.time_log : [];
  document.getElementById("tTimeTotal").textContent = "Total: " + fmtDur(timeTotalMin(log));

  // lista de entradas
  const list = document.getElementById("tTimeList");
  if (!log.length) {
    list.innerHTML = '<div class="notes-empty">Sin tiempo registrado aún.</div>';
  } else {
    list.innerHTML = "";
    log.slice().reverse().forEach((e) => {
      const row = document.createElement("div");
      row.className = "note";
      row.innerHTML = `
        <div class="note__meta">
          <span class="note__who">${escapeHtml(fmtDur(e.minutes))} · ${escapeHtml(e.author_name || "Alguien")}</span>
          <span>${escapeHtml(fmtDateTime(e.created_at))}</span>
        </div>`;
      const del = document.createElement("button");
      del.className = "note__del"; del.type = "button"; del.title = "Borrar"; del.innerHTML = "&times;";
      del.onclick = () => deleteTimeEntry(e.id);
      row.querySelector(".note__meta").appendChild(del);
      list.appendChild(row);
    });
  }

  // estado del cronómetro
  const running = !!myTimerStart(editingTask);
  const btn = document.getElementById("btnTimer");
  if (running) {
    btn.textContent = "Detener";
    btn.classList.remove("btn--primary"); btn.classList.add("btn--danger");
    tickClock();
    timerInterval = setInterval(tickClock, 1000);
  } else {
    btn.textContent = "Iniciar";
    btn.classList.add("btn--primary"); btn.classList.remove("btn--danger");
    document.getElementById("tTimerClock").textContent = "00:00:00";
  }
}

async function saveTimeLog() {
  if (!editingTask) return;
  const time_log = editingTask.time_log || [];
  const inList = TASKS.find((t) => t.id === editingTask.id);
  if (inList) inList.time_log = time_log;
  renderBoard();
  const { error } = await sb.from("tasks").update({ time_log }).eq("id", editingTask.id);
  if (error) toast("No se pudo guardar el tiempo");
}

function addTime(minutes) {
  minutes = Math.round(Number(minutes) || 0);
  if (minutes <= 0 || !editingTask) return;
  editingTask.time_log = Array.isArray(editingTask.time_log) ? editingTask.time_log : [];
  editingTask.time_log.push({
    id: newId(), minutes,
    author_id: currentProfile?.id || null,
    author_name: currentProfile?.name || currentProfile?.email || "Alguien",
    created_at: new Date().toISOString(),
  });
  saveTimeLog();
  renderTimeSection();
}

function deleteTimeEntry(id) {
  if (!editingTask) return;
  editingTask.time_log = (editingTask.time_log || []).filter((e) => e.id !== id);
  saveTimeLog();
  renderTimeSection();
}

async function saveActiveTimers() {
  if (!editingTask) return;
  const active_timers = editingTask.active_timers || {};
  const inList = TASKS.find((t) => t.id === editingTask.id);
  if (inList) inList.active_timers = active_timers;
  renderBoard();
  const { error } = await sb.from("tasks").update({ active_timers }).eq("id", editingTask.id);
  if (error) toast("No se pudo sincronizar el cronómetro");
}

document.getElementById("btnTimer").onclick = async () => {
  if (!editingTask) return;
  const uid = currentProfile?.id;
  if (!uid) return;
  editingTask.active_timers = editingTask.active_timers || {};
  const start = editingTask.active_timers[uid];
  if (start) {
    // detener
    const mins = Math.max(1, Math.round((Date.now() - new Date(start).getTime()) / 60000));
    delete editingTask.active_timers[uid];
    stopTick();
    await saveActiveTimers();
    addTime(mins);
    toast("Se registraron " + fmtDur(mins));
  } else {
    editingTask.active_timers[uid] = new Date().toISOString();
    await saveActiveTimers();
    renderTimeSection();
  }
};
document.getElementById("btnAddTime").onclick = () => {
  const inp = document.getElementById("tTimeManual");
  addTime(inp.value);
  inp.value = "";
};
document.querySelectorAll(".timer__quick button").forEach((b) => {
  b.onclick = () => addTime(b.dataset.min);
});

/* ============================================================
   Calendario compartido (espejo de Notion, solo lectura)
   ============================================================ */
async function loadShared() {
  try {
    const { data, error } = await sb.from("shared_content").select("*");
    if (error) { console.warn("shared_content:", error.message); SHARED = []; }
    else SHARED = data || [];
  } catch (e) { SHARED = []; }
  const cnt = document.getElementById("sharedCount");
  if (cnt) cnt.textContent = `${SHARED.length} ${SHARED.length === 1 ? "pieza" : "piezas"}`;
  if (calShared) calShared.render();
}

document.getElementById("btnRefreshShared")?.addEventListener("click", loadShared);

/* ============================================================
   ENTREGABLES (objetivos de piezas por entregar)
   ============================================================ */
let DELIVERABLES = [];
let showArchivedDeliv = false;

async function loadDeliverables() {
  try {
    const { data, error } = await sb.from("deliverables").select("*").order("created_at", { ascending: false });
    DELIVERABLES = error ? [] : (data || []);
  } catch (e) { DELIVERABLES = []; }
}

function deliverablePieces(id) {
  return (typeof CONTENT !== "undefined" ? CONTENT : []).filter((c) => c.deliverable_id === id);
}
function deliverableProgress(d) {
  const pieces = deliverablePieces(d.id);
  const done = pieces.filter((c) => c.estatus === "Entregado").length;
  const meta = Math.max(1, d.meta || 1);
  return { done, meta, pct: Math.min(100, Math.round((done / meta) * 100)) };
}

function renderDeliverables() {
  const box = $("#deliverablesList");
  if (!box) return;
  let list = DELIVERABLES.filter((d) => showArchivedDeliv ? d.status === "Archivado" : d.status !== "Archivado");
  $("#deliverablesCount").textContent = `${list.length}`;
  $("#btnToggleArchivedDeliv").textContent = showArchivedDeliv ? "Ver activos" : "Ver archivados";

  if (!list.length) {
    box.innerHTML = `<div class="empty-state">${showArchivedDeliv ? "No hay entregables archivados." : "Aún no hay entregables. Crea uno con “+ Nuevo entregable”."}</div>`;
    return;
  }

  box.innerHTML = list.map((d) => {
    const ph = d.phase_id ? (typeof PHASES !== "undefined" ? PHASES.find((x) => x.id === d.phase_id) : null) : null;
    const cli = CLIENTS.find((c) => c.id === (d.client_id || ph?.client_id));
    const { done, meta, pct } = deliverableProgress(d);
    const pieces = deliverablePieces(d.id);
    const piezasHtml = pieces.length
      ? pieces.map((p) => {
          const st = p.estatus || "Por hacer";
          const isDone = p.estatus === "Entregado";
          return `<div class="deliv-piece ${isDone ? "is-done" : ""}" data-piece="${p.id}">
            <span class="deliv-piece__name">${p.chapter != null ? "#" + p.chapter + " " : ""}${escapeHtml(p.title || "Pieza")}</span>
            <span class="deliv-piece__st chip">${escapeHtml(st)}</span>
          </div>`;
        }).join("")
      : `<div class="deliv-empty">Sin piezas aún. Créalas en Contenido y asígnalas a este entregable.</div>`;

    return `<div class="deliv-card" data-deliv="${d.id}">
      <div class="deliv-card__head">
        <div>
          <div class="deliv-card__name">${escapeHtml(d.name)}</div>
          <div class="deliv-card__meta">${cli ? escapeHtml(cli.name) + " · " : ""}<span class="chip">${escapeHtml(d.estado || "Por iniciar")}</span> · ${done}/${meta} entregadas${d.delivery_date ? " · entrega " + fmtDate(d.delivery_date) : ""}</div>
        </div>
        <div class="deliv-card__actions">
          <button class="btn btn--ghost btn--sm" data-edit-deliv="${d.id}" type="button">Editar</button>
          ${d.status === "Archivado"
            ? `<button class="btn btn--ghost btn--sm" data-unarchive-deliv="${d.id}" type="button">Reactivar</button>`
            : `<button class="btn btn--ghost btn--sm" data-archive-deliv="${d.id}" type="button">Archivar</button>`}
        </div>
      </div>
      <div class="deliv-bar"><div class="deliv-bar__fill" style="width:${pct}%"></div></div>
      <div class="deliv-bar__label">${pct}%</div>
      <div class="deliv-pieces">${piezasHtml}</div>
    </div>`;
  }).join("");

  box.querySelectorAll("[data-edit-deliv]").forEach((b) => b.onclick = () => {
    const d = DELIVERABLES.find((x) => x.id === b.dataset.editDeliv); if (d) openDeliverableModal(d);
  });
  box.querySelectorAll("[data-archive-deliv]").forEach((b) => b.onclick = () => setDeliverableStatus(b.dataset.archiveDeliv, "Archivado"));
  box.querySelectorAll("[data-unarchive-deliv]").forEach((b) => b.onclick = () => setDeliverableStatus(b.dataset.unarchiveDeliv, "Activo"));
  box.querySelectorAll(".deliv-piece").forEach((el) => el.onclick = () => {
    const p = CONTENT.find((x) => x.id === el.dataset.piece); if (p) openContentModal(p);
  });
}

async function setDeliverableStatus(id, status) {
  const patch = { status, closed_at: status === "Archivado" ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
  const { error } = await sb.from("deliverables").update(patch).eq("id", id);
  if (error) { toast("No se pudo actualizar"); return; }
  if (status === "Archivado" && typeof archiveRecordingsByDeliverable === "function") {
    await archiveRecordingsByDeliverable(id);
  }
  await loadDeliverables(); renderDeliverables();
  toast(status === "Archivado" ? "Entregable archivado" : "Entregable reactivado");
}

let editingDeliverable = null;
const deliverableOverlay = $("#deliverableOverlay");

function openDeliverableModal(item) {
  editingDeliverable = item || null;
  $("#deliverableMsg").classList.add("hidden");
  $("#deliverableModalTitle").textContent = item ? "Editar entregable" : "Nuevo entregable";
  const selC = $("#dClient");
  selC.innerHTML = '<option value="">— Sin cliente —</option>' +
    CLIENTS.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  selC.value = item?.client_id || "";
  $("#dName").value = item?.name || "";
  $("#dMeta").value = item?.meta ?? 5;
  const selP = $("#dPhase");
  selP.innerHTML = '<option value="">— Sin fase —</option>' +
    (typeof PHASES !== "undefined" ? PHASES : []).filter((p) => p.status !== "Archivada")
      .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  selP.value = item?.phase_id || "";

  const selEst = $("#dEstado");
  selEst.innerHTML = PHASE_PIPELINE.map((s) => `<option>${s}</option>`).join("");
  selEst.value = item?.estado || "Por iniciar";
  $("#dDelivery").value = item?.delivery_date || "";
  $("#dRecord").value = item?.record_date || "";
  $("#btnDeleteDeliverable").classList.toggle("hidden", !item);
  deliverableOverlay.classList.add("open");
  setTimeout(() => $("#dName").focus(), 50);
}
function closeDeliverableModal() { deliverableOverlay.classList.remove("open"); editingDeliverable = null; }

$("#btnNewDeliverable")?.addEventListener("click", () => openDeliverableModal(null));
$("#btnToggleArchivedDeliv")?.addEventListener("click", () => { showArchivedDeliv = !showArchivedDeliv; renderDeliverables(); });
$("#deliverableModalClose")?.addEventListener("click", closeDeliverableModal);
$("#btnCancelDeliverable")?.addEventListener("click", closeDeliverableModal);
deliverableOverlay?.addEventListener("click", (e) => { if (e.target === deliverableOverlay) closeDeliverableModal(); });

$("#btnSaveDeliverable")?.addEventListener("click", async () => {
  const name = $("#dName").value.trim();
  if (!name) { showMsg("#deliverableMsg", "Escribe un nombre."); return; }
  const payload = {
    name,
    client_id: $("#dClient").value || null,
    meta: Math.max(1, parseInt($("#dMeta").value || "1", 10)),
    phase_id: $("#dPhase").value || null,
    estado: $("#dEstado").value,
    sync_source: "app",
    delivery_date: $("#dDelivery").value || null,
    record_date: $("#dRecord").value || null,
    updated_at: new Date().toISOString(),
  };
  const btn = $("#btnSaveDeliverable"); btn.disabled = true; $("#btnSaveDeliverableLabel").innerHTML = '<span class="spinner"></span>';
  let error;
  if (editingDeliverable) ({ error } = await sb.from("deliverables").update(payload).eq("id", editingDeliverable.id));
  else { payload.owner_id = currentProfile.id; ({ error } = await sb.from("deliverables").insert(payload)); }
  btn.disabled = false; $("#btnSaveDeliverableLabel").textContent = "Guardar";
  if (error) { showMsg("#deliverableMsg", "No se pudo guardar: " + error.message); return; }
  closeDeliverableModal(); toast(editingDeliverable ? "Entregable actualizado" : "Entregable creado");
  await loadDeliverables(); renderDeliverables();
});

$("#btnDeleteDeliverable")?.addEventListener("click", async () => {
  if (!editingDeliverable) return;
  const { error } = await sb.from("deliverables").delete().eq("id", editingDeliverable.id);
  if (error) { showMsg("#deliverableMsg", "No se pudo eliminar: " + error.message); return; }
  closeDeliverableModal(); toast("Entregable eliminado");
  await loadDeliverables(); renderDeliverables();
});

/* ============================================================
   GRABACIONES (eventos de referencia, se vinculan en tareas)
   ============================================================ */
let RECORDINGS = [];

async function loadRecordings() {
  try {
    const { data, error } = await sb.from("recordings").select("*").order("date", { ascending: true });
    RECORDINGS = error ? [] : (data || []);
  } catch (e) { RECORDINGS = []; }
}

let editingRecording = null;
const recordingOverlay = $("#recordingOverlay");

function openRecordingModal(item, prefill) {
  editingRecording = item || null;
  $("#recordingMsg").classList.add("hidden");
  $("#recordingModalTitle").textContent = item ? "Editar grabación" : "Nueva grabación";
  const selC = $("#rClient");
  selC.innerHTML = '<option value="">— Sin cliente —</option>' +
    CLIENTS.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  selC.value = item?.client_id || "";
  const selD = $("#rDeliverable");
  selD.innerHTML = '<option value="">— Sin entregable —</option>' +
    (typeof DELIVERABLES !== "undefined" ? DELIVERABLES : []).filter((d) => d.status !== "Archivado")
      .map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("");
  selD.value = item?.deliverable_id || "";
  $("#rName").value = item?.name || "";
  $("#rDate").value = item?.date || (prefill && prefill.date) || "";
  $("#btnDeleteRecording").classList.toggle("hidden", !item);
  $("#btnArchiveRecording").classList.toggle("hidden", !item || item.status === "Archivada");
  recordingOverlay.classList.add("open");
  setTimeout(() => $("#rName").focus(), 50);
}
function closeRecordingModal() { recordingOverlay.classList.remove("open"); editingRecording = null; }

$("#recordingModalClose")?.addEventListener("click", closeRecordingModal);
$("#btnCancelRecording")?.addEventListener("click", closeRecordingModal);
recordingOverlay?.addEventListener("click", (e) => { if (e.target === recordingOverlay) closeRecordingModal(); });

$("#btnSaveRecording")?.addEventListener("click", async () => {
  const name = $("#rName").value.trim();
  const date = $("#rDate").value;
  if (!name) { showMsg("#recordingMsg", "Escribe un nombre."); return; }
  if (!date) { showMsg("#recordingMsg", "Elige una fecha."); return; }
  const payload = {
    name, date,
    client_id: $("#rClient").value || null,
    deliverable_id: $("#rDeliverable").value || null,
    updated_at: new Date().toISOString(),
  };
  const btn = $("#btnSaveRecording"); btn.disabled = true; $("#btnSaveRecordingLabel").innerHTML = '<span class="spinner"></span>';
  let error;
  if (editingRecording) ({ error } = await sb.from("recordings").update(payload).eq("id", editingRecording.id));
  else { payload.owner_id = currentProfile.id; ({ error } = await sb.from("recordings").insert(payload)); }
  btn.disabled = false; $("#btnSaveRecordingLabel").textContent = "Guardar";
  if (error) { showMsg("#recordingMsg", "No se pudo guardar: " + error.message); return; }
  closeRecordingModal(); toast(editingRecording ? "Grabación actualizada" : "Grabación creada");
  await loadRecordings(); if (calShared) calShared.render();
});

$("#btnArchiveRecording")?.addEventListener("click", async () => {
  if (!editingRecording) return;
  await archiveRecording(editingRecording.id);
  closeRecordingModal();
});

$("#btnDeleteRecording")?.addEventListener("click", async () => {
  if (!editingRecording) return;
  const { error } = await sb.from("recordings").delete().eq("id", editingRecording.id);
  if (error) { showMsg("#recordingMsg", "No se pudo eliminar: " + error.message); return; }
  closeRecordingModal(); toast("Grabación eliminada");
  await loadRecordings(); if (calShared) calShared.render();
});

async function archiveRecording(id) {
  const { error } = await sb.from("recordings")
    .update({ status: "Archivada", closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (!error) { await loadRecordings(); if (calShared) calShared.render(); toast("Grabación archivada"); }
}

// Archivar grabaciones ligadas a un entregable (cuando el entregable se archiva)
async function archiveRecordingsByDeliverable(deliverableId) {
  const ligadas = RECORDINGS.filter((r) => r.deliverable_id === deliverableId && r.status !== "Archivada");
  for (const r of ligadas) await archiveRecording(r.id);
}

/* ============================================================
   FASES (Cliente -> Fase -> Entregable -> Piezas)
   ============================================================ */
let PHASES = [];
let showArchivedPhase = false;
let phaseClientFilter = "";

async function loadPhases() {
  try {
    const { data, error } = await sb.from("phases").select("*").order("created_at", { ascending: false });
    PHASES = error ? [] : (data || []);
  } catch (e) { PHASES = []; }
}

function phaseDeliverables(id) {
  return (typeof DELIVERABLES !== "undefined" ? DELIVERABLES : []).filter((d) => d.phase_id === id);
}

function fillPhaseClientFilter() {
  const sel = $("#phaseClientFilter"); if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos los clientes</option>' +
    CLIENTS.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  sel.value = cur;
}

function renderPhases() {
  const box = $("#phasesList"); if (!box) return;
  fillPhaseClientFilter();
  let list = PHASES.filter((p) => showArchivedPhase ? p.status === "Archivada" : p.status !== "Archivada");
  if (phaseClientFilter) list = list.filter((p) => p.client_id === phaseClientFilter);
  $("#phasesCount").textContent = `${list.length}`;
  $("#btnToggleArchivedPhase").textContent = showArchivedPhase ? "Ver activas" : "Ver archivadas";

  if (!list.length) {
    box.innerHTML = `<div class="empty-state">${showArchivedPhase ? "No hay fases archivadas." : "Aún no hay fases. Crea una con “+ Nueva fase”."}</div>`;
    return;
  }

  box.innerHTML = list.map((p) => {
    const cli = CLIENTS.find((c) => c.id === p.client_id);
    const dels = phaseDeliverables(p.id);
    const delsHtml = dels.length
      ? dels.map((d) => {
          const pieces = (typeof deliverablePieces === "function") ? deliverablePieces(d.id) : [];
          const done = pieces.filter((x) => x.estatus === "Entregado").length;
          const meta = Math.max(1, d.meta || 1);
          const pct = Math.min(100, Math.round((done / meta) * 100));
          return `<div class="deliv-piece" data-deliv="${d.id}">
            <span class="deliv-piece__name">${escapeHtml(d.name)}</span>
            <span class="deliv-piece__st chip">${done}/${meta} · ${pct}%</span>
          </div>`;
        }).join("")
      : `<div class="deliv-empty">Sin entregables. Créalos en Entregables y asígnalos a esta fase.</div>`;

    return `<div class="deliv-card" data-phase="${p.id}">
      <div class="deliv-card__head">
        <div>
          <div class="deliv-card__name">${escapeHtml(p.name)}</div>
          <div class="deliv-card__meta">${cli ? escapeHtml(cli.name) + " · " : ""}<span class="chip">${escapeHtml(p.estado || "Por iniciar")}</span>${p.start_date ? " · " + fmtDate(p.start_date) : ""}${p.end_date ? " → " + fmtDate(p.end_date) : ""}</div>
        </div>
        <div class="deliv-card__actions">
          <button class="btn btn--ghost btn--sm" data-edit-phase="${p.id}" type="button">Editar</button>
          ${p.status === "Archivada"
            ? `<button class="btn btn--ghost btn--sm" data-unarchive-phase="${p.id}" type="button">Reactivar</button>`
            : `<button class="btn btn--ghost btn--sm" data-archive-phase="${p.id}" type="button">Archivar</button>`}
        </div>
      </div>
      <div class="deliv-pieces">${delsHtml}</div>
    </div>`;
  }).join("");

  box.querySelectorAll("[data-edit-phase]").forEach((b) => b.onclick = () => {
    const p = PHASES.find((x) => x.id === b.dataset.editPhase); if (p) openPhaseModal(p);
  });
  box.querySelectorAll("[data-archive-phase]").forEach((b) => b.onclick = () => setPhaseStatus(b.dataset.archivePhase, "Archivada"));
  box.querySelectorAll("[data-unarchive-phase]").forEach((b) => b.onclick = () => setPhaseStatus(b.dataset.unarchivePhase, "Activa"));
  box.querySelectorAll(".deliv-piece[data-deliv]").forEach((el) => el.onclick = () => {
    const d = DELIVERABLES.find((x) => x.id === el.dataset.deliv); if (d && typeof openDeliverableModal === "function") openDeliverableModal(d);
  });
}

async function setPhaseStatus(id, status) {
  const patch = { status, closed_at: status === "Archivada" ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
  const { error } = await sb.from("phases").update(patch).eq("id", id);
  if (error) { toast("No se pudo actualizar"); return; }
  await loadPhases(); renderPhases();
  toast(status === "Archivada" ? "Fase archivada" : "Fase reactivada");
}

let editingPhase = null;
const phaseOverlay = $("#phaseOverlay");

function openPhaseModal(item) {
  editingPhase = item || null;
  $("#phaseMsg").classList.add("hidden");
  $("#phaseModalTitle").textContent = item ? "Editar fase" : "Nueva fase";
  const selC = $("#phClient");
  selC.innerHTML = '<option value="">— Sin cliente —</option>' +
    CLIENTS.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  selC.value = item?.client_id || (phaseClientFilter || "");
  const selE = $("#phEstado");
  selE.innerHTML = PHASE_PIPELINE.map((s) => `<option>${s}</option>`).join("");
  selE.value = item?.estado || "Por iniciar";
  $("#phName").value = item?.name || "";
  $("#phStart").value = item?.start_date || "";
  $("#phEnd").value = item?.end_date || "";
  $("#btnDeletePhase").classList.toggle("hidden", !item);
  $("#btnArchivePhase").classList.toggle("hidden", !item || item.status === "Archivada");
  phaseOverlay.classList.add("open");
  setTimeout(() => $("#phName").focus(), 50);
}
function closePhaseModal() { phaseOverlay.classList.remove("open"); editingPhase = null; }

$("#btnNewPhase")?.addEventListener("click", () => openPhaseModal(null));
$("#btnToggleArchivedPhase")?.addEventListener("click", () => { showArchivedPhase = !showArchivedPhase; renderPhases(); });
$("#phaseClientFilter")?.addEventListener("change", (e) => { phaseClientFilter = e.target.value; renderPhases(); });
$("#phaseModalClose")?.addEventListener("click", closePhaseModal);
$("#btnCancelPhase")?.addEventListener("click", closePhaseModal);
phaseOverlay?.addEventListener("click", (e) => { if (e.target === phaseOverlay) closePhaseModal(); });

$("#btnSavePhase")?.addEventListener("click", async () => {
  const name = $("#phName").value.trim();
  if (!name) { showMsg("#phaseMsg", "Escribe un nombre."); return; }
  const payload = {
    name,
    client_id: $("#phClient").value || null,
    estado: $("#phEstado").value,
    start_date: $("#phStart").value || null,
    end_date: $("#phEnd").value || null,
    sync_source: "app",
    updated_at: new Date().toISOString(),
  };
  const btn = $("#btnSavePhase"); btn.disabled = true; $("#btnSavePhaseLabel").innerHTML = '<span class="spinner"></span>';
  let error;
  if (editingPhase) ({ error } = await sb.from("phases").update(payload).eq("id", editingPhase.id));
  else { payload.owner_id = currentProfile.id; ({ error } = await sb.from("phases").insert(payload)); }
  btn.disabled = false; $("#btnSavePhaseLabel").textContent = "Guardar";
  if (error) { showMsg("#phaseMsg", "No se pudo guardar: " + error.message); return; }
  closePhaseModal(); toast(editingPhase ? "Fase actualizada" : "Fase creada");
  await loadPhases(); renderPhases();
});

$("#btnArchivePhase")?.addEventListener("click", async () => {
  if (!editingPhase) return; await setPhaseStatus(editingPhase.id, "Archivada"); closePhaseModal();
});

$("#btnDeletePhase")?.addEventListener("click", async () => {
  if (!editingPhase) return;
  const { error } = await sb.from("phases").delete().eq("id", editingPhase.id);
  if (error) { showMsg("#phaseMsg", "No se pudo eliminar: " + error.message); return; }
  closePhaseModal(); toast("Fase eliminada");
  await loadPhases(); renderPhases();
});

/* Preview de logo+nombre del cliente en el modal de tarea */
function updateTClientePreview() {
  const box = document.getElementById("tClientePreview");
  if (!box) return;
  const c = clientById(document.getElementById("tCliente").value);
  box.innerHTML = c ? clientChip(c, 22) : "";
}

/* ============================================================
   LOGO DE CLIENTE (subida a bucket público 'client-logos')
   ============================================================ */
const LOGOS_BUCKET = "client-logos";

function renderClientLogoPreview() {
  const box = document.getElementById("cLogoPreview");
  if (!box) return;
  const url = editingClient?.logo_url;
  box.innerHTML = url
    ? `<img src="${escapeHtml(url)}" alt="logo" />`
    : `<span class="logo-preview__initial">${escapeHtml(initials(editingClient?.name || $("#cName")?.value || ""))}</span>`;
  document.getElementById("cLogoRemove")?.classList.toggle("hidden", !url);
  const lbl = document.getElementById("cLogoLabel");
  if (lbl) lbl.textContent = url ? "Cambiar logo" : "Subir logo";
}

document.getElementById("cLogoInput")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  if (!editingClient) { toast("Guarda el cliente primero, luego sube su logo"); return; }
  if (!file.type.startsWith("image/")) { toast("El logo debe ser una imagen"); return; }
  if (file.size > 3 * 1024 * 1024) { toast("La imagen es muy grande (máx. 3 MB)"); return; }

  const lbl = document.getElementById("cLogoLabel");
  const prev = lbl ? lbl.textContent : "";
  if (lbl) lbl.innerHTML = '<span class="spinner"></span> Subiendo…';
  try {
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${editingClient.id}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from(LOGOS_BUCKET).upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = sb.storage.from(LOGOS_BUCKET).getPublicUrl(path);
    const url = pub.publicUrl;
    const { error: updErr } = await sb.from("clients").update({ logo_url: url, sync_source: "notion" }).eq("id", editingClient.id);
    if (updErr) throw updErr;
    editingClient.logo_url = url;
    const inMem = CLIENTS.find((c) => c.id === editingClient.id);
    if (inMem) inMem.logo_url = url;
    renderClientLogoPreview();
    renderClients();
    toast("Logo actualizado");
  } catch (err) {
    toast("No se pudo subir el logo: " + (err.message || err));
  } finally {
    if (lbl) lbl.textContent = prev || "Subir logo";
  }
});

document.getElementById("cLogoRemove")?.addEventListener("click", async () => {
  if (!editingClient?.logo_url) return;
  if (!confirm("¿Quitar el logo de este cliente?")) return;
  const { error } = await sb.from("clients").update({ logo_url: null, sync_source: "notion" }).eq("id", editingClient.id);
  if (error) { toast("No se pudo quitar"); return; }
  editingClient.logo_url = null;
  const inMem = CLIENTS.find((c) => c.id === editingClient.id);
  if (inMem) inMem.logo_url = null;
  renderClientLogoPreview();
  renderClients();
  toast("Logo quitado");
});

/* Botón "Ver brief en Notion": se activa cuando hay link válido */
function updateBriefNotionBtn() {
  const url = ($("#cBriefUrl")?.value || "").trim();
  const btn = document.getElementById("btnBriefNotion");
  if (!btn) return;
  if (url) { btn.href = normalizeUrl(url); btn.classList.remove("hidden"); }
  else { btn.classList.add("hidden"); }
}
document.getElementById("cBriefUrl")?.addEventListener("input", updateBriefNotionBtn);
