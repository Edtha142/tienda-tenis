/* ═══════════════════════════════════════════════════════════════
   SOLE STORE — app.js
   Carga catálogo · Filtros · Modal · WhatsApp
═══════════════════════════════════════════════════════════════ */

// ─── Configuración ──────────────────────────────────────────────
const CONFIG = {
  whatsapp1: { numero: '59174864473', nombre: 'Miki' },  // ← cambia por número real
  whatsapp2: { numero: '59169820171', nombre: 'Paola' },  // ← cambia por número real
  catalogPath: 'data/productos.json',
  imagesBase:  '',
};

// ─── Estado global ───────────────────────────────────────────────
let allProducts   = [];
let filtered      = [];
let currentImages = [];
window.allProducts = allProducts; // expuesto para stock.js

// ─── Inicialización ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Inyectar números de WhatsApp desde CONFIG
  const hwa1 = document.getElementById('header-wa1');
  if (hwa1) hwa1.href = `https://wa.me/${CONFIG.whatsapp1.numero}`;

  const fwa1 = document.getElementById('footer-wa1');
  const fwa2 = document.getElementById('footer-wa2');
  if (fwa1) { fwa1.href = `https://wa.me/${CONFIG.whatsapp1.numero}`; fwa1.textContent = `📱 ${CONFIG.whatsapp1.nombre}`; }
  if (fwa2) { fwa2.href = `https://wa.me/${CONFIG.whatsapp2.numero}`; fwa2.textContent = `📱 ${CONFIG.whatsapp2.nombre}`; }

  await loadCatalog();
  buildFilters();
  renderGrid(allProducts);
  attachEvents();

  // Iniciar conexión con Raspberry Pi (si hay Tailscale activo)
  if (typeof initStock === 'function') initStock();
});

// ─── Carga del JSON ──────────────────────────────────────────────
async function loadCatalog() {
  try {
    const res = await fetch(CONFIG.catalogPath);
    if (!res.ok) throw new Error('No se pudo cargar el catálogo');
    allProducts = await res.json();
  window.allProducts = allProducts; // sync global ref
  } catch (e) {
    console.error(e);
    document.getElementById('product-grid').innerHTML =
      '<p style="color:red;padding:20px">Error al cargar el catálogo.</p>';
  }
}

// ─── Filtros dinámicos ───────────────────────────────────────────
function buildFilters() {
  // Marcas únicas (extraída del nombre del producto)
  const marcas = [...new Set(allProducts.map(p => getMarca(p.nombre)))].sort();
  const selMarca = document.getElementById('filter-marca');
  marcas.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    selMarca.appendChild(opt);
  });

  // Tallas únicas
  const tallas = [...new Set(allProducts.flatMap(p => p.tallas))].sort((a, b) => a - b);
  const selTalla = document.getElementById('filter-talla');
  tallas.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = `Talla ${t}`;
    selTalla.appendChild(opt);
  });
}

function getMarca(nombre) {
  const n = nombre.toUpperCase();
  if (n.includes('ONCLOUD') || n.includes('ONCLUD')) return 'On Cloud';
  if (n.includes('ADIZERO') || n.includes('ULTRABOOST') || n.includes('ADODAS') || n.includes('ADIDAS')) return 'Adidas';
  if (n.includes('NIKE') || n.includes('PEGASUS')) return 'Nike';
  if (n.includes('NEW BALANCE')) return 'New Balance';
  if (n.includes('JORDAN')) return 'Jordan';
  return nombre.split(' ')[0];
}

// ─── Renderizado del grid ─────────────────────────────────────────
function renderGrid(products) {
  const grid  = document.getElementById('product-grid');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('result-count');

  filtered = products;
  count.textContent = `${products.length} producto${products.length !== 1 ? 's' : ''} encontrado${products.length !== 1 ? 's' : ''}`;

  if (!products.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  grid.innerHTML = products.map(p => cardHTML(p)).join('');

  // Eventos de cards
  grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card__wa')) return; // no abrir modal si clic en WA
      openModal(card.dataset.id);
    });
  });
}

function cardHTML(p) {
  const marca   = getMarca(p.nombre);
  const inStock = p.stock > 0;
  const badgeTxt = inStock ? `Disponible` : 'Agotado';
  const badgeCls = inStock ? '' : 'card__badge--agotado';
  const waMsg   = encodeURIComponent(p.whatsapp || `Hola, me interesa el ${p.nombre} talla ${p.tallas[0]} Bs ${p.precio}`);
  const waLink  = `https://wa.me/${CONFIG.whatsapp1.numero}?text=${waMsg}`;
  const imgSrc  = p.imagen || 'assets/images/placeholder.jpg';

  return `
  <article class="card" data-id="${p.id}" role="button" tabindex="0" aria-label="Ver ${p.nombre}">
    <div class="card__img-wrap">
      <img class="card__img" src="${imgSrc}" alt="${p.nombre}" loading="lazy" />
      <span class="card__badge ${badgeCls}">${badgeTxt}</span>
    </div>
    <div class="card__body">
      <p class="card__brand">${marca}</p>
      <p class="card__name">${p.nombre}</p>
      <p class="card__talla">Talla ${p.tallas.join(', ')}</p>
      <p class="card__price">Bs ${p.precio.toLocaleString('es-BO')}</p>
    </div>
    <a class="card__wa" href="${waLink}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.855L.057 23.428a.75.75 0 0 0 .916.916l5.573-1.471A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.712 9.712 0 0 1-4.95-1.355l-.355-.211-3.684.972.988-3.597-.232-.372A9.712 9.712 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
      Preguntar
    </a>
  </article>`;
}

// ─── Eventos de filtros ──────────────────────────────────────────
function attachEvents() {
  const search  = document.getElementById('search');
  const marca   = document.getElementById('filter-marca');
  const talla   = document.getElementById('filter-talla');
  const precio  = document.getElementById('filter-precio');
  const clear   = document.getElementById('clear-filters');

  [search, marca, talla, precio].forEach(el => el.addEventListener('input', applyFilters));
  clear.addEventListener('click', () => {
    search.value = marca.value = talla.value = precio.value = '';
    applyFilters();
  });

  // Teclado en cards
  document.getElementById('product-grid').addEventListener('keydown', e => {
    if (e.key === 'Enter') e.currentTarget.querySelector('.card:focus')?.click();
  });

  // Modal
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

function applyFilters() {
  const q      = document.getElementById('search').value.trim().toLowerCase();
  const marca  = document.getElementById('filter-marca').value;
  const talla  = parseFloat(document.getElementById('filter-talla').value);
  const precio = document.getElementById('filter-precio').value;

  const result = allProducts.filter(p => {
    if (q && !p.nombre.toLowerCase().includes(q)) return false;
    if (marca && getMarca(p.nombre) !== marca) return false;
    if (talla && !p.tallas.includes(talla)) return false;
    if (precio) {
      const [min, max] = precio.split('-').map(Number);
      if (p.precio < min || p.precio >= max) return false;
    }
    return true;
  });

  renderGrid(result);
}

// ─── Modal ───────────────────────────────────────────────────────
function openModal(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;

  const marca   = getMarca(p.nombre);
  const inStock = p.stock > 0;
  const waMsg   = encodeURIComponent(p.whatsapp || `Hola, me interesa el ${p.nombre} talla ${p.tallas[0]} Bs ${p.precio}`);

  document.getElementById('modal-brand').textContent = marca;
  document.getElementById('modal-title').textContent = p.nombre;
  document.getElementById('modal-price').textContent = `Bs ${p.precio.toLocaleString('es-BO')}`;

  const badge = document.getElementById('modal-stock-badge');
  badge.textContent = inStock ? `En stock (${p.stock})` : 'Agotado';
  badge.className = 'badge' + (inStock ? '' : ' badge--agotado');

  const waMsg2 = encodeURIComponent(p.whatsapp || `Hola, me interesa el ${p.nombre} talla ${p.tallas[0]} Bs ${p.precio}`);
  document.getElementById('modal-wa1').href = `https://wa.me/${CONFIG.whatsapp1.numero}?text=${waMsg2}`;
  document.getElementById('modal-wa1').childNodes[1].textContent = ` ${CONFIG.whatsapp1.nombre}`;
  document.getElementById('modal-wa2').href = `https://wa.me/${CONFIG.whatsapp2.numero}?text=${waMsg2}`;
  document.getElementById('modal-wa2').childNodes[1].textContent = ` ${CONFIG.whatsapp2.nombre}`;

  // Tallas
  const tallasEl = document.getElementById('modal-tallas');
  tallasEl.innerHTML = p.tallas.map(t =>
    `<span class="talla-chip">${t}</span>`).join('');

  // Galería — construir lista de fotos
  const carpeta  = p.carpeta || '';
  const imgBase  = carpeta ? `assets/images/${carpeta}` : '';
  const imgs = buildImageList(p, imgBase);

  currentImages = imgs;
  setMainImage(0);
  buildThumbs(imgs);

  const modal = document.getElementById('modal');
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function buildImageList(p, imgBase) {
  const list = [];
  // Siempre agregar main
  if (p.imagen) list.push(p.imagen);
  // Agregar foto2, foto3... si existen (se descubren por convención)
  if (imgBase) {
    for (let i = 2; i <= 5; i++) {
      list.push(`${imgBase}/foto${i}.jpg`);
    }
  }
  return [...new Set(list)]; // sin duplicados
}

function setMainImage(index) {
  const img = document.getElementById('modal-img');
  img.src = currentImages[index] || '';
  img.alt = 'Foto del producto';
  // Actualizar thumb activo
  document.querySelectorAll('.modal__thumb').forEach((t, i) => {
    t.classList.toggle('active', i === index);
  });
}

function buildThumbs(imgs) {
  const container = document.getElementById('modal-thumbs');
  container.innerHTML = imgs.map((src, i) =>
    `<img class="modal__thumb ${i === 0 ? 'active' : ''}" src="${src}" alt="Vista ${i+1}"
          loading="lazy" onerror="this.style.display='none'" />`
  ).join('');

  container.querySelectorAll('.modal__thumb').forEach((thumb, i) => {
    thumb.addEventListener('click', () => setMainImage(i));
  });
}

function closeModal() {
  document.getElementById('modal').hidden = true;
  document.body.style.overflow = '';
  currentImages = [];
}
