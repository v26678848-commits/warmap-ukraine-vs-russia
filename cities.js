(function () {
  const CITIES_URL = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_populated_places_simple.geojson';
  let cityData = null;
  let cityLayers = [];

  function cityRank(p) {
    const r = Number(p.rank_max ?? p.rank ?? 99);
    return Number.isFinite(r) ? r : 99;
  }

  function cityLabel(p) { return p.nameascii || p.name || p.namepar || 'Город'; }

  async function load(progress) {
    progress?.('Загрузка городов и населённых пунктов');
    const res = await fetch(CITIES_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Не удалось загрузить города');
    const raw = await res.json();
    cityData = turf.featureCollection(raw.features.filter(f => {
      if (f.geometry?.type !== 'Point') return false;
      const [x,y] = f.geometry.coordinates;
      return x >= 21 && x <= 41 && y >= 44 && y <= 53.5 && ['Ukraine'].includes(f.properties?.adm0name || f.properties?.sov0name);
    }));
    return cityData;
  }

  function ownerForCity(state, pt) {
    for (const f of state.territories || []) if (turf.booleanPointInPolygon(pt, f)) return f.properties.owner;
    return 'neutral';
  }

  function createMarker(city, state, onClick) {
    const p = city.properties || {};
    const owner = ownerForCity(state, city);
    const rank = cityRank(p);
    const major = rank <= 8;
    const cls = `city-marker ${major ? 'major' : ''} ${owner}`;
    const icon = L.divIcon({ className: '', html: `<div class="${cls}"></div>`, iconSize: major ? [13,13] : [11,11], iconAnchor: major ? [6,6] : [5,5] });
    const m = L.marker([city.geometry.coordinates[1], city.geometry.coordinates[0]], { icon, keyboard: false, interactive: true });
    m.on('click', () => onClick(city, owner));
    if (major) m.bindTooltip(cityLabel(p), { permanent: true, direction: 'top', className: 'city-label', offset:[0,-4], opacity:.9 });
    return m;
  }

  function render(map, state, zoom, onClick) {
    if (!cityData) return;
    cityLayers.forEach(m => m.remove());
    cityLayers = [];
    const minRank = zoom >= 8 ? 20 : zoom >= 7 ? 12 : 6;
    cityData.features.forEach(c => {
      if (cityRank(c.properties) > minRank) return;
      const m = createMarker(c, state, onClick);
      m.addTo(map);
      cityLayers.push(m);
    });
  }

  function clear() { cityLayers.forEach(m => m.remove()); cityLayers=[]; }
  function getAll() { return cityData; }
  window.Cities = { load, render, clear, getAll };
})();
