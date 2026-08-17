/* ============================================================
   DNM Agency Management — app.js  (Fase 1: acceso + esqueleto)
   ============================================================ */

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
      .upsert({ id: user.id, name: nombre, email: user.email, role: "member" })
      .select("*").maybeSingle();
    data = up.data;
  }
  currentProfile = data || { id: user.id, name: user.email, email: user.email, role: "member" };
  return currentProfile;
}

function paintUser(p) {
  $("#userName").textContent = p.name || p.email || "Usuario";
  $("#userRole").textContent = p.role || "member";
  $("#userAvatar").textContent = initials(p.name || p.email);
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
  if (view === "clientes") renderClients();
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

const ESTADOS = ["Pendiente", "En curso", "Hecho", "Cancelado"];

let MEMBERS = [];   // [{id,name,email,role}]
let CLIENTS = [];   // [{id,name,active}]
let TASKS = [];     // tareas
let editingTask = null; // null = creando; objeto = editando

/* ---- Carga inicial de datos al entrar ---- */
async function bootData() {
  await Promise.all([loadMembers(), loadClients(), loadClientFileCounts()]);
  await loadTasks();
}

async function loadMembers() {
  const { data, error } = await sb.from("profiles").select("id,name,email,role").order("name");
  MEMBERS = error ? [] : (data || []);
}

async function loadClients() {
  const { data, error } = await sb.from("clients").select("id,name,active").order("name");
  CLIENTS = error ? [] : (data || []);
}

async function loadTasks() {
  const { data, error } = await sb
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) { toast("No se pudieron cargar las tareas"); TASKS = []; }
  else TASKS = data || [];
  renderBoard();
  rerenderCalendars();
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
  if (!d || estado === "Hecho" || estado === "Cancelado") return false;
  const today = new Date(); today.setHours(0,0,0,0);
  const [y, mo, da] = d.split("-").map(Number);
  return new Date(y, mo - 1, da) < today;
}
function canDelete(task) {
  return task.owner_id === currentProfile?.id || currentProfile?.role === "owner";
}

/* ---- Render del tablero ---- */
function renderBoard() {
  const board = $("#board");
  // limpiar columnas
  ESTADOS.forEach((e) => {
    const body = board.querySelector(`.column__body[data-col="${e}"]`);
    body.innerHTML = "";
  });

  $("#taskCount").textContent = `${TASKS.length} ${TASKS.length === 1 ? "tarea" : "tareas"}`;

  const counts = { "Pendiente":0, "En curso":0, "Hecho":0, "Cancelado":0 };

  TASKS.forEach((t) => {
    const estado = ESTADOS.includes(t.estado) ? t.estado : "Pendiente";
    counts[estado]++;
    const body = board.querySelector(`.column__body[data-col="${estado}"]`);
    body.appendChild(taskCardEl(t));
  });

  // contadores + vacíos
  ESTADOS.forEach((e) => {
    const col = board.querySelector(`.column[data-estado="${e}"]`);
    col.querySelector(".column__count").textContent = counts[e];
    const body = col.querySelector(".column__body");
    if (counts[e] === 0) {
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
    <div class="tcard__row">
      <span class="chip chip--proceso">${escapeHtml(t.proceso || "Planeación")}</span>
      ${cliente ? `<span class="chip chip--cliente">${escapeHtml(cliente.name)}</span>` : ""}
      ${fecha ? `<span class="chip chip--fecha ${overdue ? "overdue" : ""}">${fecha}</span>` : ""}
      ${t.drive_url ? `<a class="tcard__drive" data-drive href="${escapeHtml(normalizeUrl(t.drive_url))}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>Drive</a>` : ""}
    </div>
    <div class="tcard__foot">
      <span class="chip chip--prio" data-p="${escapeHtml(t.prioridad || "Media")}"><span class="pdot"></span>${escapeHtml(t.prioridad || "Media")}</span>
      <span class="assignees">${avatars || '<span style="font-size:11px;color:var(--text-faint)">Sin responsables</span>'}</span>
    </div>
  `;

  card.addEventListener("click", () => openTaskModal(t));
  card.querySelector("[data-drive]")?.addEventListener("click", (e) => e.stopPropagation());

  // Arrastrar y soltar (escritorio)
  card.addEventListener("dragstart", (e) => {
    card.classList.add("dragging");
    e.dataTransfer.setData("text/plain", t.id);
    e.dataTransfer.effectAllowed = "move";
  });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));

  return card;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---- Drag & drop sobre las columnas ---- */
$$(".column").forEach((col) => {
  const estado = col.dataset.estado;
  col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("dragover"); });
  col.addEventListener("dragleave", () => col.classList.remove("dragover"));
  col.addEventListener("drop", async (e) => {
    e.preventDefault();
    col.classList.remove("dragover");
    const id = e.dataTransfer.getData("text/plain");
    const task = TASKS.find((t) => t.id === id);
    if (!task || task.estado === estado) return;
    await updateTaskEstado(task, estado);
  });
});

async function updateTaskEstado(task, estado) {
  const prev = task.estado;
  task.estado = estado;               // optimista
  renderBoard();
  const { error } = await sb.from("tasks")
    .update({ estado, updated_at: new Date().toISOString() })
    .eq("id", task.id);
  if (error) { task.estado = prev; renderBoard(); toast("No se pudo mover la tarea"); }
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
  $("#fieldProceso").classList.toggle("hidden", grabacion);
  $("#rowEstadoPrio").classList.toggle("hidden", grabacion);

  // Poblar clientes
  const selC = $("#tCliente");
  selC.innerHTML = '<option value="">— Sin cliente —</option>' +
    CLIENTS.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}${c.active ? "" : " (inactivo)"}</option>`).join("");

  // Poblar responsables (checkboxes)
  const people = $("#tPeople");
  if (MEMBERS.length === 0) {
    people.innerHTML = '<div class="people__empty">Aún no hay más personas registradas.</div>';
  } else {
    const selected = new Set(task && Array.isArray(task.assignee_ids) ? task.assignee_ids : []);
    people.innerHTML = MEMBERS.map((m) => `
      <label class="person">
        <input type="checkbox" value="${m.id}" ${selected.has(m.id) ? "checked" : ""}/>
        <span class="person__name">${escapeHtml(m.name || m.email)}</span>
        ${m.id === currentProfile?.id ? '<span class="person__you">Tú</span>' : ""}
      </label>`).join("");
  }

  // Valores
  $("#tTitle").value     = task?.title || "";
  $("#tProceso").value   = task?.proceso || "Planeación";
  $("#tEstado").value    = task?.estado || "Pendiente";
  $("#tPrioridad").value = task?.prioridad || "Media";
  $("#tFecha").value     = task?.due_date || "";
  $("#tCliente").value   = task?.client_id || "";
  $("#tDrive").value     = task?.drive_url || "";

  // Prefill al crear desde el calendario (fecha y/o proceso)
  if (!task && prefill) {
    if (prefill.due_date) $("#tFecha").value = prefill.due_date;
    if (prefill.proceso)  $("#tProceso").value = prefill.proceso;
  }

  // Botón eliminar solo si puede
  const delBtn = $("#btnDeleteTask");
  delBtn.classList.toggle("hidden", !(task && canDelete(task)));

  taskOverlay.classList.add("open");
  setTimeout(() => $("#tTitle").focus(), 50);
}

function closeTaskModal() {
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

  const assignee_ids = Array.from($("#tPeople").querySelectorAll("input:checked")).map((i) => i.value);
  const payload = {
    title,
    proceso: $("#tProceso").value,
    estado: $("#tEstado").value,
    prioridad: $("#tPrioridad").value,
    due_date: $("#tFecha").value || null,
    client_id: $("#tCliente").value || null,
    drive_url: normalizeUrl($("#tDrive").value),
    assignee_ids,
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

  function tasksByDay() {
    const map = {};
    TASKS.filter(opts.filter).forEach((t) => {
      if (!t.due_date) return;
      (map[t.due_date] = map[t.due_date] || []).push(t);
    });
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
    const byDay = tasksByDay();
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

      let pills = list.slice(0, maxPills).map((t) => {
        const done = t.estado === "Hecho" || t.estado === "Cancelado";
        return `<div class="cal__pill ${done ? "done" : ""}" data-prioridad="${escapeHtml(t.prioridad || "Media")}" data-id="${t.id}" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>`;
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

    // click en una tarjeta -> editar; click en el día -> nueva tarea con esa fecha
    mount.querySelectorAll(".cal__pill").forEach((p) => {
      p.onclick = (e) => {
        e.stopPropagation();
        const t = TASKS.find((x) => x.id === p.dataset.id);
        if (t) openTaskModal(t, null, opts.context);
      };
    });
    mount.querySelectorAll(".cal__cell").forEach((c) => {
      c.onclick = () => openTaskModal(null, { due_date: c.dataset.day, proceso: opts.newProceso }, opts.context);
    });
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
let calGrab = null;  // solo "Por grabar"

function initCalendars() {
  if (!calAct) {
    calAct = createCalendar("cal-actividades", {
      filter: () => true,
    });
  }
  if (!calGrab) {
    calGrab = createCalendar("cal-grabacion", {
      filter: (t) => t.proceso === "Por grabar",
      newProceso: "Por grabar",
      context: "grabacion",
    });
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
  const list = clientFilter === "activos" ? CLIENTS.filter((c) => c.active) : CLIENTS;

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
    el.className = "ccard" + (c.active ? "" : " inactive");
    el.innerHTML = `
      <div class="ccard__head">
        <div class="ccard__name">${escapeHtml(c.name)}</div>
        <span class="status ${c.active ? "" : "off"}">${c.active ? "Activo" : "Inactivo"}</span>
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
  $("#cNotes").value = client?.notes || "";
  $("#cActive").checked = client ? !!client.active : true;

  $("#btnDeleteClient").classList.toggle("hidden", !(client && canDeleteClient(client)));

  refreshClientFilesPanel();

  clientOverlay.classList.add("open");
  setTimeout(() => $("#cName").focus(), 50);
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

  const payload = {
    name,
    notes: $("#cNotes").value.trim() || null,
    active: $("#cActive").checked,
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
  if (exists) loadClientFiles(editingClient.id);
  else $("#cFilesList").innerHTML = "";
}
