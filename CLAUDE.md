# CLAUDE.md — Tienda Web de Tenis

Guía maestra del proyecto para Claude. Leer este archivo COMPLETO antes de tocar cualquier archivo.

---

## 🎯 Visión General del Proyecto

Tienda web profesional de venta de tenis (sneakers), en tres fases:

| Fase | Objetivo | Estado |
|------|----------|--------|
| 1 | Tienda estática en GitHub Pages | 🔲 Por iniciar |
| 2 | Stock en tiempo real desde Raspberry Pi | 🔲 Por iniciar |
| 3 | Panel de administración web (/admin) | 🔲 Por iniciar |

---

## 🏗️ Arquitectura del Proyecto

```
tienda web/
├── CLAUDE.md               ← Este archivo
├── index.html              ← Página principal / catálogo
├── admin/
│   └── index.html          ← Panel de administración (protegido)
├── assets/
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── app.js          ← Lógica principal de la tienda
│   │   ├── admin.js        ← Lógica del panel admin
│   │   └── stock.js        ← Conexión con Raspberry Pi
│   └── images/             ← Fotos de los productos
├── data/
│   └── productos.json      ← Catálogo (fuente de verdad local)
└── .github/
    └── workflows/
        └── deploy.yml      ← Despliegue automático a GitHub Pages
```

---

## 🎨 Stack Tecnológico

- **Frontend**: HTML5 + CSS3 + JavaScript vanilla (sin frameworks)
- **Hosting**: GitHub Pages (gratis, automático con GitHub Actions)
- **Datos**: JSON estático (`data/productos.json`) + GitHub API para actualizaciones desde admin
- **Stock en tiempo real**: Raspberry Pi API via Tailscale
- **Sin backend propio** — todo es estático excepto la conexión a la Pi

---

## 🎨 Guía de Diseño

### Estilo
- **Tema**: Claro / Minimalista — inspiración Nike, Apple
- **Fondo**: `#FFFFFF` / `#F5F5F5`
- **Texto**: `#111111` (casi negro)
- **Acento principal**: `#111111` (negro) con hover `#333333`
- **Acento secundario**: `#E5E5E5` (gris claro para bordes y cards)
- **Tipografía**: Google Fonts — `Inter` (cuerpo) + `Bebas Neue` o `Oswald` (títulos de impacto)
- **Bordes**: redondeados suaves (`border-radius: 8px`)
- **Sombras**: ligeras (`box-shadow: 0 2px 12px rgba(0,0,0,0.08)`)

### Componentes clave
- **Hero**: imagen de impacto full-width con tagline y CTA
- **Filtros**: por marca, talla, precio (sin recargar página)
- **Cards de producto**: foto, nombre, marca, precio, stock (badge), botón WhatsApp
- **Modal de detalle**: imagen ampliada, descripción completa, tallas disponibles
- **Footer**: redes sociales, WhatsApp, info de contacto

### NO usar
- Botones de pago (es solo catálogo/vitrina)
- Carrito de compras complejo
- Fondo oscuro / colores neón

---

## 📦 Estructura del Catálogo (`data/productos.json`)

```json
[
  {
    "id": "001",
    "nombre": "Air Max 90",
    "marca": "Nike",
    "precio": 1299.00,
    "descripcion": "Clásico que nunca pasa de moda...",
    "tallas": [6, 6.5, 7, 7.5, 8, 8.5, 9],
    "stock": 15,
    "imagen": "assets/images/airmax90.jpg",
    "whatsapp": "Hola, me interesa el Nike Air Max 90 precio $1299",
    "destacado": true
  }
]
```

El Excel del usuario se convierte a este JSON como primer paso.

---

## 📡 Integración con Raspberry Pi (Fase 2)

### Contexto de la Pi
- Corre en **Docker**
- Conectada via **Tailscale** (red privada segura)
- Ya tiene una app que expone datos via Tailscale
- Ya tiene un bot de **Telegram** que consulta stock

### Enfoque de integración
La tienda consulta la API de la Pi **directamente desde el navegador** cuando el usuario está conectado a Tailscale. Si no hay conexión a la Pi, usa los datos del JSON local como fallback.

```javascript
// stock.js — lógica de conexión
const PI_API_URL = 'http://<ip-tailscale-pi>:5000/api/stock';

async function obtenerStockReal(productoId) {
  try {
    const res = await fetch(`${PI_API_URL}/${productoId}`, { signal: AbortSignal.timeout(3000) });
    return await res.json();
  } catch {
    return null; // fallback silencioso al JSON local
  }
}
```

### API mínima necesaria en la Pi (Flask/Python)
```python
# Endpoint que la tienda necesita
GET /api/stock          → lista todos los stocks { "id": X, "stock": N }
GET /api/stock/:id      → stock de un producto específico
POST /api/stock/:id     → actualizar stock (solo desde admin, con token)
```

### Pasos para Fase 2
1. Identificar en qué puerto/contenedor Docker corre la app de Tailscale
2. Añadir los endpoints de stock si no existen (Python/Flask recomendado)
3. Configurar CORS para permitir peticiones desde GitHub Pages
4. Actualizar `stock.js` con la IP de Tailscale real

---

## 🛠️ Panel de Administración — `/admin` (Fase 3)

### Acceso
- URL: `https://[usuario].github.io/[repo]/admin/`
- Protegido con contraseña simple en JavaScript (no es seguridad bancaria, es para uso personal)
- Credenciales guardadas en `localStorage` con hash

### Funcionalidades del panel
1. **Ver todos los productos** en tabla
2. **Agregar producto** (formulario + subida de foto)
3. **Editar producto** (nombre, precio, tallas, stock)
4. **Activar/desactivar** producto (visible en tienda o no)
5. **Actualizar stock** (número directo o +/-)
6. **Guardar cambios** → actualiza `productos.json` via GitHub API (con Personal Access Token)

### Cómo actualiza el JSON sin backend
```javascript
// Usa GitHub REST API para hacer commit directamente
const GITHUB_TOKEN = localStorage.getItem('gh_token'); // PAT del usuario
const REPO = 'usuario/tienda-tenis';

async function guardarProductos(productos) {
  const contenido = btoa(JSON.stringify(productos, null, 2));
  await fetch(`https://api.github.com/repos/${REPO}/contents/data/productos.json`, {
    method: 'PUT',
    headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Actualizar catálogo', content: contenido, sha: await obtenerSHA() })
  });
}
```

---

## 🔄 Orden de Construcción (sesión a sesión)

### Fase 1 — Tienda (PRIORIDAD ACTUAL)
- [ ] **1.1** Leer el Excel del usuario y convertir a `productos.json`
- [ ] **1.2** Organizar las fotos en `assets/images/`
- [ ] **1.3** Construir `index.html` con estructura base
- [ ] **1.4** Construir `assets/css/styles.css` con el diseño minimalista
- [ ] **1.5** Construir `assets/js/app.js` (carga catálogo, filtros, modal, WhatsApp)
- [ ] **1.6** Configurar `deploy.yml` para GitHub Pages
- [ ] **1.7** Probar y ajustar diseño

### Fase 2 — Raspberry Pi
- [ ] **2.1** Revisar app existente en Docker y mapear endpoints disponibles
- [ ] **2.2** Añadir/adaptar endpoints de stock en la Pi
- [ ] **2.3** Construir `assets/js/stock.js` con fallback
- [ ] **2.4** Mostrar badge de stock en tiempo real en las cards

### Fase 3 — Panel Admin
- [ ] **3.1** Construir `admin/index.html` con layout de tabla
- [ ] **3.2** Construir `assets/js/admin.js` con CRUD + GitHub API
- [ ] **3.3** Sistema de login simple con contraseña hasheada
- [ ] **3.4** Formulario de subida de fotos (base64 o via GitHub API)
- [ ] **3.5** Integración con stock de la Pi desde el panel

---

## ⚠️ Reglas para Claude

1. **Siempre trabajar en HTML/CSS/JS vanilla** — sin React, sin Vue, sin npm.
2. **Mobile-first** — el sitio debe verse perfecto en celular primero.
3. **El JSON es la fuente de verdad local** — nunca hardcodear productos en el HTML.
4. **Fallback siempre** — si la Pi no responde, la tienda sigue funcionando con el JSON.
5. **GitHub Pages es estático** — no puede tener backend, todo es client-side.
6. **Antes de empezar cada fase**, confirmar con el usuario que tiene lo necesario (archivos, tokens, etc.).
7. **No inventar datos** — usar el Excel/fotos reales del usuario.
8. **El panel /admin usa GitHub API** — requiere un Personal Access Token (PAT) del usuario.
9. **Tailscale es el puente** — toda comunicación con la Pi pasa por la red de Tailscale.
10. **Idioma de la web**: Español (México/LatAm).

---

## 📁 Archivos del Usuario (pendiente de subir)

- [ ] Excel con productos (nombre, marca, precio, tallas, stock)
- [ ] Carpeta de fotos de los productos

Una vez que el usuario los suba, el primer paso es ejecutar un script Python para convertir el Excel a `productos.json` y organizar las imágenes.

---

## 🔗 Referencias

- Inspiración de diseño: https://skyrynow.github.io/GAME-SHOP/index.html
- Documentación GitHub Pages: https://pages.github.com/
- GitHub API (contenido de archivos): https://docs.github.com/en/rest/repos/contents
- Tailscale docs: https://tailscale.com/kb/
