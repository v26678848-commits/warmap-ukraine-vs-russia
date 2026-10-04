(function () {
  function buildAutoGrayZone(state, widthKm) {
    const ua = Territory.ownerFeature(state, 'ukraine');
    const ru = Territory.ownerFeature(state, 'russia');
    if (!ua || !ru) return null;
    try {
      const ub = turf.buffer(ua, widthKm, { units: 'kilometers', steps: 5 });
      const rb = turf.buffer(ru, widthKm, { units: 'kilometers', steps: 5 });
      const z = turf.intersect(turf.featureCollection([ub, rb]));
      if (!z) return null;
      z.properties = { kind: 'auto-gray-zone' };
      return z;
    } catch (e) {
      console.warn('Auto gray zone failed', e);
      return null;
    }
  }

  function render(layer, state, widthKm) {
    layer.clearLayers();
    const z = buildAutoGrayZone(state, widthKm);
    if (!z) return null;
    L.geoJSON(z, { style: { color: '#a4acb8', weight: 1, opacity: .7, fillColor: '#a4acb8', fillOpacity: .23, dashArray: '5 5', interactive: false } }).addTo(layer);
    return z;
  }

  window.GrayZone = { buildAutoGrayZone, render };
})();
