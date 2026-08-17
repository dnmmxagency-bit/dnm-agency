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
