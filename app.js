/* ============================================================
   LIBROS BLUE — app.js
   Carga datos desde data/libros.json y construye toda la UI.
   ============================================================ */

const state = {
  libros: [],
  renta: [],
  config: {},
  rentaActivaId: null
};

document.addEventListener('DOMContentLoaded', init);

async function init(){
  try{
    const res = await fetch('data/libros.json');
    if(!res.ok) throw new Error('respuesta no OK');
    const data = await res.json();
    state.libros = data.catalogo;
    state.renta = data.renta;
    state.config = data.configuracion;
  }catch(err){
    // Si fetch falla (ej. abriendo el archivo localmente con file://),
    // usamos el respaldo embebido cargado por data/libros.embedded.js
    if(window.LIBROS_BLUE_DATA){
      console.warn('fetch a data/libros.json falló, usando datos embebidos de respaldo.', err);
      state.libros = window.LIBROS_BLUE_DATA.catalogo;
      state.renta = window.LIBROS_BLUE_DATA.renta;
      state.config = window.LIBROS_BLUE_DATA.configuracion;
    }else{
      console.error('No se pudo cargar data/libros.json y no hay respaldo embebido.', err);
      return;
    }
  }

  buildHeroLibrary();
  renderCatalogo();
  renderRentaLista();
  renderVisitaPago();
  wireRailDrag();
  wireRailArrows();
  wireModal();
}

/* ---------------------------------------------------------
   1. HERO — biblioteca generativa en SVG (estanterías + lámparas)
   --------------------------------------------------------- */
function buildHeroLibrary(){
  const shelvesLeft = document.getElementById('shelvesLeft');
  const shelvesRight = document.getElementById('shelvesRight');
  const lamps = document.getElementById('lamps');
  if(!shelvesLeft || !shelvesRight) return;

  const ns = 'http://www.w3.org/2000/svg';
  const bookColors = ['#3a6ea5','#7a3b46','#1f4e5f','#4a5a3a','#5a2e6b','#c9a35f','#2a2a3a','#3a6ea5'];

  // Construye una "pared" de estantería en perspectiva, con filas de lomos.
  function buildWall(group, originX, depthDir){
    // depthDir: -1 para pared izquierda (se aleja hacia la derecha), +1 para derecha
    const rows = 6;
    for(let r=0; r<rows; r++){
      const t = r / (rows-1); // 0 = cerca, 1 = lejos
      const y = 900 - t*640;          // de abajo hacia el punto de fuga
      const xNear = originX;
      const xFar = 800 + depthDir * (120 + t*40);
      const rowHeight = 70 - t*40;

      // Repisa (estante horizontal)
      const shelf = document.createElementNS(ns,'rect');
      const shelfW = Math.abs(xFar - xNear);
      shelf.setAttribute('x', Math.min(xNear,xFar));
      shelf.setAttribute('y', y);
      shelf.setAttribute('width', shelfW);
      shelf.setAttribute('height', Math.max(4, 10 - t*6));
      shelf.setAttribute('fill', '#040810');
      shelf.setAttribute('opacity', (0.9 - t*0.3).toFixed(2));
      group.appendChild(shelf);

      // Lomos de libros sobre la repisa
      const nBooks = Math.max(3, Math.round(10 - t*6));
      const usableW = shelfW * 0.92;
      const startX = Math.min(xNear,xFar) + shelfW*0.04;
      const bw = usableW / nBooks;
      for(let i=0;i<nBooks;i++){
        const bx = startX + i*bw;
        const bh = rowHeight * (0.7 + Math.sin(i*1.7+r)*0.12 + 0.12);
        const by = y - bh;
        const rect = document.createElementNS(ns,'rect');
        rect.setAttribute('x', bx.toFixed(1));
        rect.setAttribute('y', by.toFixed(1));
        rect.setAttribute('width', Math.max(1.5,(bw*0.78)).toFixed(1));
        rect.setAttribute('height', bh.toFixed(1));
        const color = bookColors[(i+r) % bookColors.length];
        rect.setAttribute('fill', color);
        rect.setAttribute('opacity', (0.85 - t*0.45).toFixed(2));
        rect.setAttribute('rx', '0.6');
        group.appendChild(rect);
      }
    }
  }

  buildWall(shelvesLeft, 0, -1);
  buildWall(shelvesRight, 1600, 1);

  // Lámparas colgantes con halo, distribuidas sobre el pasillo
  const lampPositions = [
    {x:560, y:120}, {x:800, y:90}, {x:1040, y:120}
  ];
  lampPositions.forEach((p, idx) => {
    const wrap = document.createElementNS(ns,'g');

    const wire = document.createElementNS(ns,'line');
    wire.setAttribute('x1', p.x); wire.setAttribute('y1', 0);
    wire.setAttribute('x2', p.x); wire.setAttribute('y2', p.y);
    wire.setAttribute('stroke', '#1a2740'); wire.setAttribute('stroke-width','1.5');
    wrap.appendChild(wire);

    const halo = document.createElementNS(ns,'circle');
    halo.setAttribute('cx', p.x); halo.setAttribute('cy', p.y+14);
    halo.setAttribute('r', 70);
    halo.setAttribute('fill', '#c9a35f');
    halo.setAttribute('opacity', '0.10');
    halo.setAttribute('class','lamp-halo');
    wrap.appendChild(halo);

    const bulb = document.createElementNS(ns,'circle');
    bulb.setAttribute('cx', p.x); bulb.setAttribute('cy', p.y+10);
    bulb.setAttribute('r', 6);
    bulb.setAttribute('fill', '#f4e3b0');
    wrap.appendChild(bulb);

    lamps.appendChild(wrap);
  });
}

/* ---------------------------------------------------------
   2. CATÁLOGO — estante deslizable de libros
   --------------------------------------------------------- */
function renderCatalogo(){
  const rail = document.getElementById('shelfRail');
  if(!rail) return;
  rail.innerHTML = '';

  state.libros.forEach(libro => {
    const card = document.createElement('div');
    card.className = 'book';
    card.tabIndex = 0;
    card.setAttribute('role','button');
    card.setAttribute('aria-label', `Ver historia de ${libro.titulo}`);

    card.innerHTML = `
      <div class="book-spine" style="background:${libro.colorLomo}; color:${libro.colorAcento};">
        <span class="book-genero">${libro.genero}</span>
        <div>
          <div class="book-titulo">${libro.titulo}</div>
          <div class="book-autor">${libro.autor}</div>
        </div>
      </div>
      <div class="book-caption">
        <div class="book-titulo-cap">${libro.titulo}</div>
        <div class="book-autor-cap">${libro.autor} · ${libro.anio}</div>
      </div>
    `;

    const open = () => openModal(libro);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); }
    });

    rail.appendChild(card);
  });
}

function wireRailDrag(){
  const rail = document.getElementById('shelfRail');
  if(!rail) return;
  let isDown = false, startX = 0, scrollLeft = 0, moved = false;

  rail.addEventListener('mousedown', (e) => {
    isDown = true; moved = false;
    rail.classList.add('dragging');
    startX = e.pageX - rail.offsetLeft;
    scrollLeft = rail.scrollLeft;
  });
  window.addEventListener('mouseup', () => {
    isDown = false; rail.classList.remove('dragging');
  });
  window.addEventListener('mousemove', (e) => {
    if(!isDown) return;
    e.preventDefault();
    const x = e.pageX - rail.offsetLeft;
    const walk = x - startX;
    if(Math.abs(walk) > 5) moved = true;
    rail.scrollLeft = scrollLeft - walk;
  });
  // Evita que un drag se interprete como click al soltar sobre un libro
  rail.addEventListener('click', (e) => {
    if(moved){ e.stopPropagation(); e.preventDefault(); }
  }, true);

  // Touch nativo: el navegador ya maneja scroll-x, no se requiere JS extra.
}

function wireRailArrows(){
  const rail = document.getElementById('shelfRail');
  const left = document.getElementById('railLeft');
  const right = document.getElementById('railRight');
  if(!rail || !left || !right) return;
  left.addEventListener('click', () => rail.scrollBy({left:-420, behavior:'smooth'}));
  right.addEventListener('click', () => rail.scrollBy({left:420, behavior:'smooth'}));
}

/* ---------------------------------------------------------
   3. MODAL — historia completa del libro
   --------------------------------------------------------- */
function wireModal(){
  const overlay = document.getElementById('modalOverlay');
  const closeBtn = document.getElementById('modalClose');
  if(!overlay || !closeBtn) return;

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if(e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape') closeModal();
  });
}

function openModal(libro){
  const overlay = document.getElementById('modalOverlay');
  document.getElementById('modalSpine').style.background = libro.colorLomo;
  document.getElementById('modalGenero').textContent = libro.genero;
  document.getElementById('modalTitulo').textContent = libro.titulo;
  document.getElementById('modalMeta').textContent = `${libro.autor} · ${libro.anio} · ${libro.paginas} páginas`;
  document.getElementById('modalHistoria').textContent = libro.historia;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(){
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

/* ---------------------------------------------------------
   4. RENTA — lista + reseña/detalle + enlace a pago (Google Form)
   --------------------------------------------------------- */
function renderRentaLista(){
  const lista = document.getElementById('rentaLista');
  if(!lista) return;
  lista.innerHTML = '';

  state.renta.forEach(item => {
    const row = document.createElement('div');
    row.className = 'renta-item' + (item.disponible ? '' : ' disabled');
    row.tabIndex = item.disponible ? 0 : -1;
    row.dataset.id = item.id;

    row.innerHTML = `
      <div class="renta-item-info">
        <div class="ri-titulo">${item.titulo}</div>
        <div class="ri-autor">${item.autor}</div>
        ${!item.disponible ? '<span class="ri-tag">No disponible</span>' : ''}
      </div>
      <div class="renta-item-precio">
        Q${item.precioRenta}
        <small>${item.diasRenta} días</small>
      </div>
    `;

    if(item.disponible){
      const select = () => selectRenta(item.id);
      row.addEventListener('click', select);
      row.addEventListener('keydown', (e) => {
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); select(); }
      });
    }

    lista.appendChild(row);
  });
}

function selectRenta(id){
  state.rentaActivaId = id;

  // Resalta el item activo
  document.querySelectorAll('.renta-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });

  const item = state.renta.find(r => r.id === id);
  const libro = state.libros.find(l => l.id === item.tituloId);
  const detalle = document.getElementById('rentaDetalle');
  if(!item || !libro || !detalle) return;

  const formUrl = buildFormUrl(item, libro);

  detalle.innerHTML = `
    <p class="rd-genero">${libro.genero}</p>
    <h3 class="rd-titulo">${libro.titulo}</h3>
    <p class="rd-autor">${libro.autor} · ${libro.anio} · ${libro.paginas} páginas</p>
    <p class="rd-resena">${libro.sinopsisCorta} ${libro.historia.slice(0, 220)}…</p>
    <div class="rd-footer">
      <div class="rd-precio-block">
        <span class="rd-precio">Q${item.precioRenta}</span>
        <small>Renta por ${item.diasRenta} días</small>
      </div>
      <a class="rd-cta" href="${formUrl}" target="_blank" rel="noopener noreferrer">
        Rentar este libro
      </a>
    </div>
  `;
}

/* Construye la URL del Google Form, pre-llenando el título si el
   formulario usa parámetros prellenados (entry.XXXXXXXX). Si no se
   configuró un Form real, simplemente enlaza a la URL base. */
function buildFormUrl(item, libro){
  const base = state.config.urlGoogleForm || '#';
  if(base === '#' ) return '#';
  try{
    const url = new URL(base);
    url.searchParams.set('usp', 'pp_url');
    return url.toString();
  }catch{
    return base;
  }
}

/* ---------------------------------------------------------
   5. VISITA Y PAGO — dirección, horario y marcas de pago (ficticias)
   --------------------------------------------------------- */
function renderVisitaPago(){
  const dir = state.config.direccion;
  const metodos = state.config.metodosPago || [];
  const formUrl = state.config.urlGoogleForm || '#';

  const direccionEl = document.getElementById('visitaDireccion');
  const notaEl = document.getElementById('visitaNota');
  const pagoGrid = document.getElementById('pagoGrid');
  const btnForm = document.getElementById('btnPagoForm');

  if(direccionEl && dir){
    direccionEl.innerHTML = `
      ${dir.calle}<br>
      ${dir.ciudad}<br>
      ${dir.horario}<br>
      ${dir.telefono}
    `;
  }
  if(notaEl && dir){
    notaEl.textContent = dir.nota || '';
  }

  if(pagoGrid){
    pagoGrid.innerHTML = metodos.map(m => `
      <div class="pago-chip">
        <span class="pago-chip-nombre">${m.nombre}</span>
        <span class="pago-chip-desc">${m.descripcion}</span>
      </div>
    `).join('');
  }

  if(btnForm){
    btnForm.setAttribute('href', formUrl);
  }
}
