/* ═══════════════════════════════════════════════════════════════
   SOLE STORE — stock.js
   Conexión en tiempo real con Raspberry Pi via Tailscale
   Fallback silencioso al JSON local si la Pi no responde
═══════════════════════════════════════════════════════════════ */

const STOCK_CONFIG = {
  piUrl:        'http://100.107.186.115:8000/api/stock',
  timeout:      3000,    // 3 segundos para detectar si está en Tailscale
  refreshEvery: 60000,   // actualizar cada 60 segundos
};

// Stock en memoria: { pi_id → cantidad }
let stockCache = {};
let stockConectado = false;

// ─── Iniciar monitoreo ───────────────────────────────────────────
async function initStock() {
  await fetchStock();
  setInterval(fetchStock, STOCK_CONFIG.refreshEvery);
}

// ─── Obtener stock de la Pi ──────────────────────────────────────
async function fetchStock() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STOCK_CONFIG.timeout);

    const res = await fetch(STOCK_CONFIG.piUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error('API error');

    const data = await res.json();

    // Construir cache { pi_id: cantidad }
    stockCache = {};
    data.forEach(item => { stockCache[item.id] = item.cantidad; });

    stockConectado = true;
    actualizarBadgesUI();
    console.log(`[Stock] Conectado a Pi — ${data.length} productos`);

  } catch (e) {
    stockConectado = false;
    console.log('[Stock] Pi no alcanzable — usando datos locales');
  }
}

// ─── Obtener stock de un producto ────────────────────────────────
function getStock(producto) {
  if (!stockConectado || !producto.pi_id) return producto.stock;
  const cantidad = stockCache[producto.pi_id];
  return (cantidad !== undefined) ? cantidad : producto.stock;
}

// ─── Actualizar badges en el DOM ─────────────────────────────────
function actualizarBadgesUI() {
  if (!window.allProducts) return;

  window.allProducts.forEach(p => {
    const card = document.querySelector(`.card[data-id="${p.id}"]`);
    if (!card) return;

    const cantidad = getStock(p);
    const badge = card.querySelector('.card__badge');
    if (!badge) return;

    if (cantidad > 0) {
      badge.textContent = 'Disponible';
      badge.className = 'card__badge';
    } else {
      badge.textContent = 'Agotado';
      badge.className = 'card__badge card__badge--agotado';
    }
  });

  // Badge en modal si está abierto
  const modalBadge = document.getElementById('modal-stock-badge');
  const modalTitle = document.getElementById('modal-title');
  if (modalBadge && modalTitle && window.allProducts) {
    const nombreActual = modalTitle.textContent;
    const p = window.allProducts.find(x => x.nombre === nombreActual);
    if (p) {
      const cantidad = getStock(p);
      modalBadge.textContent = cantidad > 0 ? `En stock (${cantidad})` : 'Agotado';
      modalBadge.className = 'badge' + (cantidad > 0 ? '' : ' badge--agotado');
    }
  }
}

// ─── Indicador de conexión (opcional) ────────────────────────────
function mostrarEstadoConexion() {
  const indicator = document.getElementById('stock-status');
  if (!indicator) return;
  indicator.textContent = stockConectado ? '● En vivo' : '● Local';
  indicator.style.color  = stockConectado ? '#25d366' : '#999';
}
