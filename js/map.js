// Maryhill derelict land map
// Site data lives in data/sites.geojson. Edit "description" and "images" there to fill in each site.

(function () {
  const css = getComputedStyle(document.documentElement);
  const ACCENT = css.getPropertyValue('--accent').trim();
  const INK = css.getPropertyValue('--ink').trim();
  const BOUNDARY = css.getPropertyValue('--boundary').trim();

  const map = L.map('map', { zoomControl: false, attributionControl: true });
  L.control.zoom({ position: 'topleft' }).addTo(map);
  map.setView([55.893, -4.297], 15);

  // Free OpenStreetMap tiles, made grey in css/style.css (.leaflet-tile-pane) so the sites stand out
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Boundary: ONS, OGL v3.0, contains OS data &copy; Crown copyright 2024'
  }).addTo(map);

  const panel = document.getElementById('panel');
  const els = {
    number: document.getElementById('panel-number'),
    status: document.getElementById('panel-status'),
    title: document.getElementById('panel-title'),
    area: document.getElementById('panel-area'),
    images: document.getElementById('panel-images'),
    description: document.getElementById('panel-description')
  };

  const baseStyle = { color: ACCENT, weight: 2, fillColor: ACCENT, fillOpacity: 0.35 };
  const hoverStyle = { weight: 3, fillOpacity: 0.6 };
  const activeStyle = { color: INK, weight: 3, fillColor: ACCENT, fillOpacity: 0.7 };
  const dimStyle = { color: ACCENT, weight: 1, fillColor: ACCENT, fillOpacity: 0.15 };

  let sites = [];      // [{ feature, layer, label }]
  let activeIndex = -1;

  const isPhone = () => window.matchMedia('(max-width: 719px)').matches;

  function styleAll() {
    sites.forEach((s, i) => {
      if (activeIndex === -1) s.layer.setStyle(baseStyle);
      else s.layer.setStyle(i === activeIndex ? activeStyle : dimStyle);
      const el = s.label.getElement();
      if (el) el.classList.toggle('is-active', i === activeIndex);
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fillPanel(p) {
    els.number.textContent = p.number;
    els.status.textContent = p.status || '';
    els.title.textContent = p.name;
    els.area.textContent = p.area_ha != null ? p.area_ha + ' ha' : '–';

    els.images.innerHTML = '';
    if (p.images && p.images.length) {
      p.images.forEach(src => {
        const img = document.createElement('img');
        img.src = src;
        img.alt = p.name;
        img.loading = 'lazy';
        els.images.appendChild(img);
      });
    } else {
      els.images.innerHTML = '<div class="placeholder">Photo of ' + escapeHtml(p.name) + ' goes here</div>';
    }

    els.description.innerHTML = p.description
      ? p.description.split(/\n{2,}/).map(par => '<p>' + escapeHtml(par) + '</p>').join('')
      : '<p class="empty">Description coming soon.</p>';
  }

  function openSite(index, { updateHash = true } = {}) {
    const n = sites.length;
    index = ((index % n) + n) % n;
    activeIndex = index;
    const { feature, layer } = sites[index];
    fillPanel(feature.properties);
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    panel.querySelector('.panel-body').scrollTop = 0;
    styleAll();
    layer.bringToFront();

    const padding = isPhone()
      ? { paddingTopLeft: [24, 24], paddingBottomRight: [24, Math.round(window.innerHeight * 0.62) + 16] }
      : { paddingTopLeft: [40, 40], paddingBottomRight: [panel.offsetWidth + 40, 40] };
    map.flyToBounds(layer.getBounds(), { ...padding, maxZoom: 19, duration: 0.8 });

    if (updateHash) history.replaceState(null, '', '#' + feature.properties.id);
  }

  function closePanel() {
    activeIndex = -1;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    styleAll();
    history.replaceState(null, '', location.pathname + location.search);
  }

  document.querySelector('.panel-close').addEventListener('click', closePanel);
  document.getElementById('prev-site').addEventListener('click', () => openSite(activeIndex - 1));
  document.getElementById('next-site').addEventListener('click', () => openSite(activeIndex + 1));
  document.addEventListener('keydown', e => {
    if (activeIndex === -1) return;
    if (e.key === 'Escape') closePanel();
    if (e.key === 'ArrowRight') openSite(activeIndex + 1);
    if (e.key === 'ArrowLeft') openSite(activeIndex - 1);
  });
  map.on('click', () => { if (activeIndex !== -1) closePanel(); });

  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const i = sites.findIndex(s => s.feature.properties.id === id);
    if (i !== -1) openSite(i, { updateHash: false });
  }
  window.addEventListener('hashchange', openFromHash);

  Promise.all([
    fetch('data/sites.geojson').then(r => r.json()),
    fetch('data/maryhill-boundary.geojson').then(r => r.json()).catch(() => null)
  ]).then(([siteData, boundary]) => {
    if (boundary) {
      L.geoJSON(boundary, {
        interactive: false,
        style: { color: BOUNDARY, weight: 1.5, opacity: 0.5, dashArray: '4 6', fill: false }
      }).addTo(map);
    }

    const group = L.featureGroup().addTo(map);
    siteData.features.forEach((feature, i) => {
      const layer = L.geoJSON(feature, { style: baseStyle }).getLayers()[0];
      layer.addTo(group);

      const label = L.tooltip({
        permanent: true, direction: 'center', className: 'site-label', interactive: true
      }).setContent(String(feature.properties.number));
      layer.bindTooltip(label);

      layer.on('mouseover', () => { if (activeIndex === -1 || activeIndex !== i) layer.setStyle(hoverStyle); });
      layer.on('mouseout', () => styleAll());
      layer.on('click', e => { L.DomEvent.stopPropagation(e); openSite(i); });
      label.on('click', e => { L.DomEvent.stopPropagation(e); openSite(i); });

      sites.push({ feature, layer, label });
    });

    document.getElementById('site-count').textContent = sites.length;
    map.fitBounds(group.getBounds(), { padding: [40, 40] });
    styleAll();
    if (location.hash) openFromHash();
  }).catch(err => {
    console.error(err);
    document.querySelector('.legend').textContent = 'Could not load site data.';
  });
})();
