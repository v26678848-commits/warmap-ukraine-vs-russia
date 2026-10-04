(function () {
  const INITIAL_VIEW = { center: [48.7, 31.4], zoom: 6 };
  let map, territoryLayer, adminLayer, infraLayer, riversLayer, lakesLayer, roadsLayer, autoGrayLayer, drawLayer, countryLayer;
  let stateRef = null;
  let cityPopupHandler = null;

  function colorFor(owner) {
    return { ukraine:'#2e7df6', russia:'#ee4b62', gray:'#a4acb8', neutral:'#d2ddd5' }[owner] || '#d2ddd5';
  }

  function territoryStyle(feature) {
    const owner = feature.properties?.owner || 'neutral';
    return { color: colorFor(owner), weight: 1.5, opacity: .95, fillColor: colorFor(owner), fillOpacity: owner === 'neutral' ? .24 : .46, className: 'territory-fill' };
  }

  function adminStyle() { return { color:'rgba(18,32,45,.56)', weight:1, fillColor:'transparent', fillOpacity:0, className:'admin-outline' }; }

  function addFeatureLayer(fc, style, target) {
    target.clearLayers();
    L.geoJSON(fc, { style, interactive:false }).addTo(target);
  }

  async function init(state, progress, onCity) {
    stateRef = state;
    cityPopupHandler = onCity;
    map = L.map('map', { zoomControl:false, attributionControl:true, preferCanvas:true, zoomAnimation:true, fadeAnimation:false, markerZoomAnimation:true, doubleClickZoom:true, touchZoom:true, dragging:true, scrollWheelZoom:false, boxZoom:false, keyboard:false }).setView(state.map.center, state.map.zoom);
    L.control.attribution({prefix:'Leaflet'}).addTo(map);

    territoryLayer = L.layerGroup().addTo(map);
    adminLayer = L.layerGroup().addTo(map);
    infraLayer = L.layerGroup().addTo(map);
    riversLayer = L.layerGroup().addTo(map);
    lakesLayer = L.layerGroup().addTo(map);
    roadsLayer = L.layerGroup().addTo(map);
    autoGrayLayer = L.layerGroup().addTo(map);
    drawLayer = L.layerGroup().addTo(map);
    countryLayer = L.layerGroup().addTo(map);

    progress?.('Отрисовка территорий');
    renderCountry(state.countryOutline);
    renderTerritories(state);
    if (state.adminRegions) addFeatureLayer(state.adminRegions, adminStyle, adminLayer);

    map.on('zoomend moveend', () => { state.map = { center:[map.getCenter().lat, map.getCenter().lng], zoom:map.getZoom() }; window.GameState.save(state); refreshDetailLayers(); });
    refreshDetailLayers();

    try {
      await Cities.load(progress);
      Cities.render(map, state, map.getZoom(), cityPopupHandler);
    } catch (e) { console.warn(e); }
    return map;
  }

  function renderCountry(fc) {
    countryLayer.clearLayers();
    L.geoJSON(fc, { style: { color:'#163040', weight:1.8, fillColor:'#dae6de', fillOpacity:.72 }, interactive:false }).addTo(countryLayer);
  }

  function renderTerritories(state) {
    territoryLayer.clearLayers();
    (state.territories || []).forEach(feature => {
      const layer = L.geoJSON(feature, { style:territoryStyle, interactive:false });
      layer.addTo(territoryLayer);
    });
    GrayZone.render(autoGrayLayer, state, state.settings.grayZoneWidth);
    Cities.render(map, state, map.getZoom(), cityPopupHandler);
  }

  function renderAutoGray(state) { GrayZone.render(autoGrayLayer, state, state.settings.grayZoneWidth); }

  function fitCountry() { map.fitBounds(countryLayer.getBounds(), { padding:[24, 24], animate:true, duration:.6 }); }
  function getMap() { return map; }
  function getDrawLayer() { return drawLayer; }
  function redraw(state) { stateRef = state; renderTerritories(state); renderAutoGray(state); }

  function refreshDetailLayers() {
    if (!map) return;
    const z = map.getZoom();
    const showRivers = z >= 6;
    const showLakes = z >= 6.5;
    const showRoads = z >= 7.5;
    riversLayer.eachLayer(l => l.setStyle({ opacity: showRivers ? .55 : 0 }));
    lakesLayer.eachLayer(l => l.setStyle({ opacity: showLakes ? .65 : 0 }));
    roadsLayer.eachLayer(l => l.setStyle({ opacity: showRoads ? .5 : 0 }));
    if (window.Cities) Cities.render(map, stateRef, z, cityPopupHandler);
  }

  async function loadInfrastructure(progress) {
    async function safe(url, label) {
      try { progress?.(label); const r = await fetch(url, {cache:'no-cache'}); if (!r.ok) throw new Error(r.status); return r.json(); }
      catch (e) { console.warn('infra load', url, e); return null; }
    }
    const base = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/';
    const [rivers, lakes, roads] = await Promise.all([
      safe(base+'ne_50m_rivers_lake_centerlines.geojson','Загрузка рек'),
      safe(base+'ne_50m_lakes.geojson','Загрузка озёр'),
      safe(base+'ne_50m_roads.geojson','Загрузка дорог')
    ]);
    const bbox = turf.bbox(stateRef.countryOutline);
    const bboxPoly = turf.bboxPolygon(bbox);
    function crop(fc) {
      if (!fc?.features) return turf.featureCollection([]);
      const features = fc.features.filter(f => {
        try { return turf.booleanIntersects(turf.bboxPolygon(turf.bbox(f)), bboxPoly); } catch(e) { return false; }
      });
      return turf.featureCollection(features);
    }
    if (rivers) addFeatureLayer(crop(rivers), {color:'#3b7ea5', weight:1.1, opacity:.55, interactive:false}, riversLayer);
    if (lakes) addFeatureLayer(crop(lakes), {color:'#6a9bb5', weight:.8, fillColor:'#9ec8da', fillOpacity:.6, opacity:.65, interactive:false}, lakesLayer);
    if (roads) addFeatureLayer(crop(roads), {color:'#8b6f54', weight:1.1, opacity:0, interactive:false}, roadsLayer);
    refreshDetailLayers();
  }

  function setDrawingMode(on) {
    if (!map) return;
    if (on) {
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
    } else {
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
    }
  }

  function screenPointToLatLng(ev) { return map.mouseEventToLatLng(ev); }
  function addDrawLine(latlngs) { return L.polyline(latlngs, { color:'#ffffff', weight:3, opacity:.95, lineCap:'round', lineJoin:'round', dashArray:'8 5', className:'draw-line' }).addTo(drawLayer); }
  function clearDrawLayer() { drawLayer.clearLayers(); }
  function removeDrawLine(line) { if (line) drawLayer.removeLayer(line); }

  window.GameMap = { INITIAL_VIEW, init, fitCountry, getMap, redraw, renderAutoGray, loadInfrastructure, setDrawingMode, screenPointToLatLng, addDrawLine, clearDrawLayer, removeDrawLine, refreshDetailLayers };
})();
