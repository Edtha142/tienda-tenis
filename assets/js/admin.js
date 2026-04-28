/* ═══════════════════════════════════════════════════════════════
   TIENDA VIRTUAL MIKI — admin.js
   Panel de Administración · Fase 3
   CRUD productos · GitHub API · Raspberry Pi sync
═══════════════════════════════════════════════════════════════ */

// ─── Configuración ──────────────────────────────────────────────
const ADMIN_CONFIG = {
  githubRepo: 'Edtha142/tienda-tenis',
  githubFile: 'data/productos.json',
  piUrl:      'http://100.107.186.115:8000',
  piToken:    'fc397a253cee34f67ed2ceb7dcb7803e91e450cfe772c3abe13d8110ec60adf3',
  piTimeout:  3000,
};

// ─── Estado global ───────────────────────────────────────────────
let productos   = [];
let fileSHA     = '';
let piConectado = false;
let stockPi     = {};   // { pi_id → cantidad }
let editingId   = null; // null = nuevo producto
let hasChanges  = false;

// ═══════════════════════════════════════════════════════════════
// AUTH — Contraseña fija hardcodeada (no configurable desde web)
// ═══════════════════════════════════════════════════════════════

const ADMIN_HASH = 'c82edeec03f49794'; // hash de la contraseña del admin

function hashPwd(pwd) {
  const salted = 'miki-admin-2025:' + pwd;
  let h = 5381;
  for (let i = 0; i < salted.length; i++) {
    h = (Math.imul(h, 33) ^ salted.charCodeAt(i)) >>> 0;
  }
  let h2 = h ^ 0xdeadbeef;
  for (let i = salted.length - 1; i >= 0; i--) {
    h2 = (Math.imul(h2, 31) + salted.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8,'0') + h2.toString(16).padStart(8,'0');
}

function login(pwd) {
  if (hashPwd(pwd) === ADMIN_HASH) {
    sessionStorage.setItem('admin_ok', '1');
    showApp();
  } else {
    showToast('Contraseña incorrecta', 'error');
    document.getElementById('login-pwd').value = '';
    document.getElementById('login-pwd').focus();
  }
}

function logout() {
  sessionStorage.removeItem('admin_ok');
  location.reload();
}

function checkAuth() {
  const isOk = sessionStorage.getItem('admin_ok');
  if (!isOk) { showScreen('login'); return; }
  showApp();
}

function showScreen(name) {
  document.getElementById('screen-login').hidden = (name !== 'login');
  document.getElementById('screen-app').hidden   = true;
}

async function showApp() {
  document.getElementById('screen-login').hidden = true;
  document.getElementById('screen-app').hidden   = false;
  await init();
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════

async function init() {
  await loadProductos();
  renderTabla();
  renderStats();
  attachAdminEvents();
  updateGithubStatus(!!getToken());
  // Pi sync solo al presionar el botón — no automático al cargar
}

// ═══════════════════════════════════════════════════════════════
// GITHUB API
// ═══════════════════════════════════════════════════════════════

function getToken() {
  return localStorage.getItem('gh_token') || '';
}

async function loadProductos() {
  showLoading(true);

  // ── PASO 1: cargar JSON local primero (instantáneo en GitHub Pages) ──
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch('../data/productos.json', { signal: ctrl.signal });
    if (res.ok) {
      productos = await res.json();
    } else {
      throw new Error('JSON no encontrado');
    }
  } catch (e) {
    showToast('Error al cargar productos: ' + e.message, 'error');
    showLoading(false);
    return;
  }

  showLoading(false); // mostrar UI ya — no esperar a GitHub

  // ── PASO 2: obtener SHA de GitHub en segundo plano (para poder guardar) ──
  obtenerSHAEnSegundoPlano();
}

async function obtenerSHAEnSegundoPlano() {
  const token = getToken();
  if (!token) return; // sin token, nada que hacer
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      `https://api.github.com/repos/${ADMIN_CONFIG.githubRepo}/contents/${ADMIN_CONFIG.githubFile}`,
      { headers: { Authorization: `token ${token}` }, signal: ctrl.signal }
    );
    if (res.ok) {
      const data = await res.json();
      fileSHA = data.sha;
      updateGithubStatus(true);
    }
  } catch {
    // silencioso — el SHA se obtendrá al guardar
  }
}

async function saveToGitHub() {
  const token = getToken();
  if (!token) {
    // Mostrar modal para ingresar token
    document.getElementById('modal-token').hidden = false;
    document.getElementById('input-token').focus();
    return;
  }

  const btn = document.getElementById('btn-save-github');
  btn.disabled    = true;
  btn.textContent = 'Guardando…';

  try {
    // Obtener SHA actual
    const getRes = await fetch(
      `https://api.github.com/repos/${ADMIN_CONFIG.githubRepo}/contents/${ADMIN_CONFIG.githubFile}`,
      { headers: { Authorization: `token ${token}` } }
    );
    if (!getRes.ok) throw new Error('No se pudo obtener el archivo de GitHub');
    const current = await getRes.json();
    fileSHA = current.sha;

    // Codificar contenido en base64 (soporte UTF-8)
    const jsonStr  = JSON.stringify(productos, null, 2);
    const encoded  = btoa(unescape(encodeURIComponent(jsonStr)));
    const now      = new Date().toLocaleString('es-BO');

    const putRes = await fetch(
      `https://api.github.com/repos/${ADMIN_CONFIG.githubRepo}/contents/${ADMIN_CONFIG.githubFile}`,
      {
        method: 'PUT',
        headers: {
          Authorization:  `token ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Admin: actualizar catálogo ${now}`,
          content: encoded,
          sha:     fileSHA,
        }),
      }
    );

    if (!putRes.ok) {
      const err = await putRes.json();
      throw new Error(err.message || 'Error al guardar en GitHub');
    }

    const result = await putRes.json();
    fileSHA     = result.content.sha;
    hasChanges  = false;
    updateGithubStatus(true);
    showToast('✓ Catálogo guardado en GitHub', 'success');
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Guardar en GitHub';
  }
}

// ═══════════════════════════════════════════════════════════════
// RASPBERRY PI — Sincronizar stock
// ═══════════════════════════════════════════════════════════════

async function syncPiStock() {
  const btn = document.getElementById('btn-sync-pi');
  if (btn) { btn.disabled = true; btn.textContent = 'Sincronizando…'; }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ADMIN_CONFIG.piTimeout);

    const res = await fetch(`${ADMIN_CONFIG.piUrl}/api/stock`, {
      signal:  controller.signal,
      headers: { 'X-API-Token': ADMIN_CONFIG.piToken },
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error('API de Pi devolvió error');
    const data = await res.json();

    // Construir cache
    stockPi = {};
    data.forEach(item => { stockPi[item.id] = item.cantidad; });
    piConectado = true;

    // Actualizar stock en los productos
    let cambiados = 0;
    productos.forEach(p => {
      if (p.pi_id !== undefined && stockPi[p.pi_id] !== undefined) {
        if (p.stock !== stockPi[p.pi_id]) {
          p.stock = stockPi[p.pi_id];
          cambiados++;
        }
      }
    });

    updatePiStatus(true, data.length);
    showToast(`Pi conectada — ${cambiados} stocks actualizados`, 'success');
    renderTabla(document.getElementById('search-admin').value);
    renderStats();
  } catch {
    piConectado = false;
    updatePiStatus(false, 0);
    showToast('Pi no disponible — sin cambios en stock', 'info');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Sync Pi'; }
  }
}

async function updateStockEnPi(piId, cantidad) {
  if (!piConectado || !piId) return;
  try {
    await fetch(`${ADMIN_CONFIG.piUrl}/api/productos/${piId}`, {
      method:  'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Token':  ADMIN_CONFIG.piToken,
      },
      body: JSON.stringify({ cantidad }),
    });
  } catch {
    // Fallo silencioso — el cron de sync corregirá el desfase
  }
}

// ═══════════════════════════════════════════════════════════════
// RENDER TABLA
// ═══════════════════════════════════════════════════════════════

function renderTabla(filter = '') {
  const tbody = document.getElementById('tabla-body');
  const q     = (filter || '').toLowerCase();

  const lista = productos.filter(p =>
    !q ||
    (p.nombre || '').toLowerCase().includes(q) ||
    String(p.id).includes(q) ||
    (p.marca  || '').toLowerCase().includes(q)
  );

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#999;padding:40px">Sin productos</td></tr>`;
    document.getElementById('count-label').textContent = '0 productos';
    return;
  }

  tbody.innerHTML = lista.map(p => {
    const marca     = p.marca || getMarcaAdmin(p.nombre);
    const inStock   = (p.stock || 0) > 0;
    const badgeCls  = inStock ? 'badge-ok' : 'badge-ago';
    const badgeTxt  = inStock ? 'En stock' : 'Agotado';
    const tallasStr = (p.tallas || []).join(', ');
    const imgSrc    = p.imagen
      ? (p.imagen.startsWith('assets') ? '../' + p.imagen : p.imagen)
      : '../assets/images/placeholder.jpg';

    return `
    <tr data-id="${p.id}">
      <td class="td-img">
        <img class="tabla-thumb"
             src="${imgSrc}"
             alt="${p.nombre}"
             loading="lazy"
             onerror="this.src='../assets/images/placeholder.jpg'" />
      </td>
      <td class="td-id">#${p.id}</td>
      <td class="td-nombre">${p.nombre}</td>
      <td>${marca}</td>
      <td class="td-precio">Bs ${Number(p.precio).toLocaleString('es-BO')}</td>
      <td class="td-tallas">${tallasStr}</td>
      <td class="td-stock">
        <div class="stock-ctrl">
          <button class="stock-btn" onclick="cambiarStock('${p.id}', -1)">−</button>
          <input class="stock-input"
                 type="number"
                 value="${p.stock || 0}"
                 min="0"
                 onchange="setStock('${p.id}', this.value)" />
          <button class="stock-btn" onclick="cambiarStock('${p.id}', 1)">+</button>
        </div>
      </td>
      <td><span class="badge ${badgeCls}">${badgeTxt}</span></td>
      <td>
        <div class="acciones">
          <button class="btn-accion btn-edit" onclick="abrirEditar('${p.id}')" title="Editar">✏️</button>
          <button class="btn-accion btn-del"  onclick="confirmarEliminar('${p.id}')" title="Eliminar">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('count-label').textContent =
    `${lista.length} producto${lista.length !== 1 ? 's' : ''}`;
}

function renderStats() {
  const total    = productos.length;
  const enStock  = productos.filter(p => (p.stock || 0) > 0).length;
  const agotados = total - enStock;
  const valor    = productos.reduce((s, p) => s + (p.precio || 0) * (p.stock || 0), 0);

  document.getElementById('stat-total').textContent   = total;
  document.getElementById('stat-stock').textContent   = enStock;
  document.getElementById('stat-agotado').textContent = agotados;
  document.getElementById('stat-valor').textContent   = `Bs ${valor.toLocaleString('es-BO')}`;
}

// ═══════════════════════════════════════════════════════════════
// STOCK INLINE
// ═══════════════════════════════════════════════════════════════

function cambiarStock(id, delta) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  p.stock = Math.max(0, (p.stock || 0) + delta);
  markChanged();
  // Actualizar input en la fila sin re-render completo
  const fila  = document.querySelector(`tr[data-id="${id}"]`);
  if (!fila) return;
  fila.querySelector('.stock-input').value = p.stock;
  const badge = fila.querySelector('.badge');
  badge.textContent = p.stock > 0 ? 'En stock' : 'Agotado';
  badge.className   = 'badge ' + (p.stock > 0 ? 'badge-ok' : 'badge-ago');
  renderStats();
  updateStockEnPi(p.pi_id, p.stock);
}

function setStock(id, val) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  p.stock = Math.max(0, parseInt(val) || 0);
  markChanged();
  const fila = document.querySelector(`tr[data-id="${id}"]`);
  if (fila) {
    const badge = fila.querySelector('.badge');
    badge.textContent = p.stock > 0 ? 'En stock' : 'Agotado';
    badge.className   = 'badge ' + (p.stock > 0 ? 'badge-ok' : 'badge-ago');
  }
  renderStats();
  updateStockEnPi(p.pi_id, p.stock);
}

// ═══════════════════════════════════════════════════════════════
// CRUD — Formulario de producto
// ═══════════════════════════════════════════════════════════════

function abrirNuevo() {
  editingId = null;
  resetFormProducto();
  document.getElementById('modal-form-title').textContent = 'Añadir Producto';
  document.getElementById('modal-form').hidden = false;
  document.getElementById('f-nombre').focus();
}

function abrirEditar(id) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  editingId = id;

  document.getElementById('f-nombre').value      = p.nombre      || '';
  document.getElementById('f-marca').value        = p.marca       || getMarcaAdmin(p.nombre);
  document.getElementById('f-precio').value       = p.precio      || '';
  document.getElementById('f-stock').value        = p.stock       || 0;
  document.getElementById('f-descripcion').value  = p.descripcion || '';
  document.getElementById('f-imagen').value       = p.imagen      || '';
  document.getElementById('f-carpeta').value      = p.carpeta     || '';
  document.getElementById('f-whatsapp').value     = p.whatsapp    || '';
  document.getElementById('f-tallas').value       = (p.tallas || []).join(', ');

  document.getElementById('modal-form-title').textContent = `Editar #${id}`;
  document.getElementById('modal-form').hidden = false;
  document.getElementById('f-nombre').focus();
}

function cerrarModalForm() {
  document.getElementById('modal-form').hidden = true;
  editingId = null;
}

function resetFormProducto() {
  document.getElementById('form-producto').reset();
  document.getElementById('f-stock').value = '0';
}

function guardarProducto() {
  const nombre      = document.getElementById('f-nombre').value.trim();
  const marca       = document.getElementById('f-marca').value.trim();
  const precioRaw   = document.getElementById('f-precio').value;
  const precio      = parseFloat(precioRaw);
  const stock       = parseInt(document.getElementById('f-stock').value) || 0;
  const descripcion = document.getElementById('f-descripcion').value.trim();
  const imagen      = document.getElementById('f-imagen').value.trim();
  const carpeta     = document.getElementById('f-carpeta').value.trim();
  const whatsapp    = document.getElementById('f-whatsapp').value.trim();
  const tallasRaw   = document.getElementById('f-tallas').value;
  const tallas      = tallasRaw
    .split(',')
    .map(t => parseFloat(t.trim()))
    .filter(t => !isNaN(t));

  if (!nombre)             { showToast('El nombre es obligatorio', 'error'); return; }
  if (isNaN(precio) || precio <= 0) { showToast('Ingresa un precio válido', 'error'); return; }
  if (!tallas.length)      { showToast('Ingresa al menos una talla', 'error'); return; }

  const marcaFinal    = marca || getMarcaAdmin(nombre);
  const whatsappFinal = whatsapp || `Hola, me interesa el ${nombre} Bs ${precio}`;
  const imagenFinal   = imagen  || (carpeta ? `assets/images/${carpeta}/main.jpg` : '');

  if (editingId) {
    const p = productos.find(x => x.id === editingId);
    if (p) {
      Object.assign(p, { nombre, marca: marcaFinal, precio, stock,
        descripcion, imagen: imagenFinal, carpeta, whatsapp: whatsappFinal, tallas });
    }
    showToast('Producto actualizado', 'success');
  } else {
    const maxNum = Math.max(...productos.map(p => parseInt(p.id) || 0), 32);
    const newNum = maxNum + 1;
    const newId  = String(newNum).padStart(3, '0');
    const piId   = newNum + 68; // mantiene la convención de mapeo

    productos.push({
      id: newId, nombre, marca: marcaFinal, precio, stock,
      descripcion, imagen: imagenFinal, carpeta,
      whatsapp: whatsappFinal, tallas, pi_id: piId,
    });
    showToast('Producto añadido', 'success');
  }

  markChanged();
  cerrarModalForm();
  renderTabla(document.getElementById('search-admin').value);
  renderStats();
}

function confirmarEliminar(id) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`¿Eliminar "${p.nombre}"?\nEsta acción no se puede deshacer del catálogo web.`)) return;
  productos = productos.filter(x => x.id !== id);
  markChanged();
  renderTabla(document.getElementById('search-admin').value);
  renderStats();
  showToast('Producto eliminado', 'success');
}

// ═══════════════════════════════════════════════════════════════
// TOKEN MODAL
// ═══════════════════════════════════════════════════════════════

function guardarToken() {
  const t = (document.getElementById('input-token').value || '').trim();
  if (!t) { showToast('Ingresa el token de GitHub', 'error'); return; }
  localStorage.setItem('gh_token', t);
  document.getElementById('modal-token').hidden = true;
  updateGithubStatus(true);
  saveToGitHub();
}

function cerrarModalToken() {
  document.getElementById('modal-token').hidden = true;
}

// ═══════════════════════════════════════════════════════════════
// CAMBIAR CONTRASEÑA
// ═══════════════════════════════════════════════════════════════

function abrirCambiarPwd() {
  document.getElementById('modal-pwd').hidden = false;
  document.getElementById('pwd-actual').focus();
}

function cerrarModalPwd() {
  document.getElementById('modal-pwd').hidden = true;
  document.getElementById('form-cambiar-pwd').reset();
}

function cambiarContrasena(actual, nueva, confirm) {
  const stored = localStorage.getItem('admin_hash');
  if (hashPwd(actual) !== stored) {
    showToast('Contraseña actual incorrecta', 'error');
    return;
  }
  if (nueva.length < 6) { showToast('Mínimo 6 caracteres', 'error'); return; }
  if (nueva !== confirm) { showToast('Las contraseñas no coinciden', 'error'); return; }
  localStorage.setItem('admin_hash', hashPwd(nueva));
  cerrarModalPwd();
  showToast('Contraseña actualizada', 'success');
}

// ═══════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════

function getMarcaAdmin(nombre) {
  const n = (nombre || '').toUpperCase();
  if (n.includes('ONCLOUD') || n.includes('ON CLOUD')) return 'On Cloud';
  if (n.includes('ADIZERO') || n.includes('ULTRABOOST') || n.includes('ADIDAS')) return 'Adidas';
  if (n.includes('NIKE') || n.includes('PEGASUS'))       return 'Nike';
  if (n.includes('NEW BALANCE'))                         return 'New Balance';
  if (n.includes('JORDAN'))                              return 'Jordan';
  return (nombre || '').split(' ')[0];
}

function markChanged() {
  hasChanges = true;
  const btn = document.getElementById('btn-save-github');
  if (btn) btn.classList.add('btn--highlight');
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent  = msg;
  t.className    = `toast toast--${type} toast--visible`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3800);
}

function showLoading(show) {
  const ov = document.getElementById('loading-overlay');
  if (ov) ov.hidden = !show;
}

function updatePiStatus(ok, count) {
  const el = document.getElementById('pi-status');
  if (!el) return;
  el.textContent = ok ? `● Pi en vivo (${count} prod.)` : '● Pi sin conexión';
  el.style.color = ok ? '#25d366' : '#aaa';
}

function updateGithubStatus(ok) {
  const el = document.getElementById('github-status');
  if (!el) return;
  el.textContent = ok ? '● GitHub OK' : '● Sin token';
  el.style.color = ok ? '#0366d6' : '#aaa';
}

// ═══════════════════════════════════════════════════════════════
// EVENTOS
// ═══════════════════════════════════════════════════════════════

function attachAdminEvents() {
  // Búsqueda
  document.getElementById('search-admin').addEventListener('input', e => {
    renderTabla(e.target.value);
  });

  // Submit formulario de producto
  document.getElementById('form-producto').addEventListener('submit', e => {
    e.preventDefault();
    guardarProducto();
  });

  // Submit cambiar contraseña
  document.getElementById('form-cambiar-pwd').addEventListener('submit', e => {
    e.preventDefault();
    cambiarContrasena(
      document.getElementById('pwd-actual').value,
      document.getElementById('pwd-nueva').value,
      document.getElementById('pwd-confirm').value
    );
  });

  // Escape cierra modales
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      cerrarModalForm();
      cerrarModalToken();
      cerrarModalPwd();
    }
  });

  // Aviso si hay cambios sin guardar al salir
  window.addEventListener('beforeunload', e => {
    if (hasChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// ARRANQUE
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  const fLogin = document.getElementById('form-login');
  if (fLogin) fLogin.addEventListener('submit', e => {
    e.preventDefault();
    login(document.getElementById('login-pwd').value);
  });

  // Token modal
  const fToken = document.getElementById('form-token');
  if (fToken) fToken.addEventListener('submit', e => {
    e.preventDefault();
    guardarToken();
  });

  checkAuth();
});
