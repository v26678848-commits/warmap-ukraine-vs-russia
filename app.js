(function () {
  let state = null;
  let drawing = false;
  let drawPoints = [];
  let drawLine = null;
  let pendingContour = null;
  let pointerId = null;

  function clone(v) { return GameState.clone(v); }
  function ownerName(owner) { return Territory.OWNER_NAMES[owner]; }

  function pushHistory() {
    state.history = Array.isArray(state.history) ? state.history : [];
    state.history.push({ territories: clone(state.territories), selectedOwner: state.selectedOwner, settings: clone(state.settings) });
    if (state.history.length > 12) state.history.shift();
  }

  function save() { GameState.save(state); }

  function restoreFromSnapshot(snap) {
    state.territories = snap.territories;
    state.selectedOwner = snap.selectedOwner;
    state.settings = snap.settings;
    save();
    GameMap.redraw(state);
    UI.updateMode(); UI.stats(); UI.updateSettings();
  }

  function undo() {
    if (!state.history.length) { UI.showToast('История пуста'); return; }
    const snap = state.history.pop();
    restoreFromSnapshot(snap);
    UI.showToast('Последний захват отменён');
  }

  function closeDrawingMode() {
    drawing = false; pointerId = null; drawPoints=[]; pendingContour=null;
    GameMap.setDrawingMode(false); GameMap.clearDrawLayer(); UI.setDrawingUI(false);
  }

  function isSelfIntersecting(line) { return turf.kinks(line).features.length > 0; }

  function validateContour(poly) {
    if (!poly?.geometry || poly.geometry.type !== 'Polygon') return { ok:false, msg:'Контур не является полигоном.' };
    const area = turf.area(poly);
    if (area < 250000) return { ok:false, msg:'Контур слишком мал. Обведите более заметный участок.' };
    if (area > turf.area(state.countryOutline) * 0.9) return { ok:false, msg:'Контур слишком большой.' };
    if (turf.kinks(poly).features.length) return { ok:false, msg:'Контур пересекает сам себя.' };
    if (turf.booleanValid && !turf.booleanValid(poly)) return { ok:false, msg:'Геометрия контура некорректна.' };
    const inside = turf.intersect(turf.featureCollection([poly, state.countryOutline.features[0]]));
    if (!inside) return { ok:false, msg:'Контур находится вне территории Украины.' };
    const clippedArea = turf.area(inside);
    if (clippedArea / Math.max(area,1) < .2) return { ok:false, msg:'Большая часть контура находится вне игровой карты.' };
    return { ok:true, area, clipped:inside };
  }

  function connectedToOwner(contour, owner) {
    const own = Territory.ownerFeature(state, owner);
    if (!own) return false;
    const tolerance = state.settings.connectionTolerance;
    try {
      const bufferedContour = turf.buffer(contour, tolerance, { units:'kilometers', steps:4 });
      return !!turf.intersect(turf.featureCollection([bufferedContour, own]));
    } catch (e) { return false; }
  }

  function computeTransfer(contour, targetOwner) {
    const before = clone(state.territories);
    const next = [];
    let claimed = null;
    let claimedArea = 0;

    for (const t of before) {
      if (!t) continue;
      let hit = null;
      try { hit = Territory.intersect(t, contour); } catch (e) { throw new Error('Ошибка intersection'); }
      if (!hit || turf.area(hit) < 1) { next.push(t); continue; }

      const oldOwner = t.properties.owner;
      const transfer = hit;
      claimedArea += turf.area(transfer);
      claimed = claimed ? turf.union(turf.featureCollection([claimed, transfer])) : transfer;

      if (oldOwner === targetOwner) {
        // Nothing to transfer; keep the existing geometry.
        next.push(t);
        continue;
      }
      const remaining = Territory.subtract(t, transfer);
      if (remaining && turf.area(remaining) > 1) next.push(remaining);
    }

    if (!claimed || claimedArea <= 0) throw new Error('Контур не пересекает игровую территорию.');

    // Add all transferred pieces as one target-owner geometry.
    next.push(turf.feature(claimed.geometry, { owner: targetOwner }));
    const merged = Territory.mergeSameOwner(next);
    return { before, after: merged, claimedArea, claimed };
  }

  function validateResult(result) {
    if (!Territory.validateOwners(result.after) || !Territory.validateGeometry(result.after)) return false;
    const totalBefore = result.before.reduce((s,f)=>s+turf.area(f),0);
    const totalAfter = result.after.reduce((s,f)=>s+turf.area(f),0);
    return Math.abs(totalBefore - totalAfter) / Math.max(totalBefore,1) < 0.0002;
  }

  function applyCapture() {
    if (!pendingContour) return;
    try {
      const targetOwner = state.selectedOwner;
      if (targetOwner !== 'gray' && !connectedToOwner(pendingContour, targetOwner)) {
        UI.showToast('Территория не связана с вашей зоной контроля.');
        closeDrawingMode();
        return;
      }
      UI.showLoading(); UI.setLoading('Выполняем intersection / difference / union…');
      setTimeout(() => {
        try {
          const result = computeTransfer(pendingContour, targetOwner);
          if (!validateResult(result)) throw new Error('Итоговая геометрия не прошла проверку.');
          pushHistory();
          state.territories = result.after;
          save();
          GameMap.redraw(state);
          UI.stats();
          UI.showToast(`${ownerName(targetOwner)} получила ${Math.round(result.claimedArea/1e6).toLocaleString('ru-RU')} км².`);
        } catch (err) {
          console.error(err);
          UI.showToast(err.message || 'Операция отменена: некорректная геометрия.');
        } finally {
          UI.hideLoading(); closeDrawingMode();
        }
      }, 30);
    } catch (e) {
      UI.hideLoading(); UI.showToast(e.message || 'Не удалось выполнить захват.'); closeDrawingMode();
    }
  }

  function finishDrawing() {
    if (drawPoints.length < 4) { UI.showToast('Контур слишком короткий.'); closeDrawingMode(); return; }
    const coords = drawPoints.map(ll => [ll.lng, ll.lat]);
    coords.push(coords[0]);
    const poly = turf.polygon([coords]);
    const validation = validateContour(poly);
    if (!validation.ok) { UI.showToast(validation.msg); closeDrawingMode(); return; }
    pendingContour = poly;
    GameMap.clearDrawLayer();
    L.geoJSON(poly, { style:{color:'#fff', weight:2, fillColor:'#fff', fillOpacity:.12, dashArray:'7 6', interactive:false} }).addTo(GameMap.getDrawLayer());
    const areaKm2 = validation.clipped ? turf.area(validation.clipped)/1e6 : validation.area/1e6;
    UI.openConfirm(state.selectedOwner, areaKm2, applyCapture, closeDrawingMode);
  }

  function pointerDown(e) {
    if (!drawing || pointerId !== null) return;
    pointerId = e.pointerId;
    drawPoints = [e.latlng];
    drawLine = GameMap.addDrawLine(drawPoints);
    e.originalEvent?.target?.setPointerCapture?.(pointerId);
  }
  function pointerMove(e) {
    if (!drawing || pointerId !== e.pointerId) return;
    const last = drawPoints[drawPoints.length - 1];
    if (!last || e.latlng.distanceTo(last) < 10) return;
    drawPoints.push(e.latlng);
    drawLine?.setLatLngs(drawPoints);
  }
  function pointerUp(e) {
    if (!drawing || pointerId !== e.pointerId) return;
    pointerId = null;
    finishDrawing();
  }

  function enterDrawing() {
    if (drawing) { finishDrawing(); return; }
    drawing = true; pointerId = null; drawPoints=[]; pendingContour=null;
    GameMap.setDrawingMode(true); UI.setDrawingUI(true); UI.showToast('Обведите территорию пальцем.');
  }

  function selectOwner(owner) {
    state.selectedOwner = owner; UI.updateMode(); save();
  }

  async function start() {
    UI.bind(GameState.load());
    state = GameState.load();
    try {
      UI.showLoading(); UI.setLoading('Загрузка геоданных…');
      if (!state.countryOutline || !state.territories || !state.adminRegions) {
        state.countryOutline = await Territory.loadCountryOutline(UI.setLoading);
        let base;
        try {
          base = await Territory.buildInitialState(UI.setLoading);
        } catch (remoteError) {
          console.warn('Remote region data unavailable; using emergency fallback.', remoteError);
          base = await Territory.buildFallbackState(state.countryOutline);
          UI.showToast('Геоданные областей временно недоступны; включён резервный режим.');
        }
        state.territories = base.territories;
        state.adminRegions = base.adminRegions;
        state.history = [];
        state.fallbackData = !!base.fallback;
        save();
      }
      if (!state.map) state.map = clone(GameState.DEFAULTS.map);
      if (!state.settings) state.settings = clone(GameState.DEFAULTS.settings);
      UI.bind(state); UI.updateMode(); UI.updateSettings(); UI.stats();
      await GameMap.init(state, UI.setLoading, UI.showCity);
      GameMap.fitCountry();
      setTimeout(() => GameMap.loadInfrastructure(UI.setLoading), 10);
      document.getElementById('zoomInBtn').onclick = () => GameMap.getMap().zoomIn(1, {animate:true});
      document.getElementById('zoomOutBtn').onclick = () => GameMap.getMap().zoomOut(1, {animate:true});
      document.getElementById('recenterBtn').onclick = () => GameMap.fitCountry();
      document.querySelectorAll('.owner-btn').forEach(b => b.onclick = () => selectOwner(b.dataset.owner));
      document.getElementById('captureBtn').onclick = enterDrawing;
      document.getElementById('cancelDrawBtn').onclick = closeDrawingMode;
      document.getElementById('undoBtn').onclick = undo;
      document.getElementById('menuBtn').onclick = UI.openMenu;
      document.getElementById('closeMenuBtn').onclick = UI.closeMenu;
      document.getElementById('continueBtn').onclick = UI.closeMenu;
      document.getElementById('newGameBtn').onclick = async () => { UI.closeMenu(); await newGame(); };
      document.getElementById('resetBtn').onclick = () => { GameState.clear(); location.reload(); };
      document.getElementById('grayZoneWidth').oninput = e => { state.settings.grayZoneWidth = Number(e.target.value); UI.updateSettings(); GameMap.renderAutoGray(state); save(); };
      document.getElementById('connectionTolerance').oninput = e => { state.settings.connectionTolerance = Number(e.target.value); UI.updateSettings(); save(); };
      const map = GameMap.getMap();
      const container = map.getContainer();
      container.addEventListener('pointerdown', ev => {
        if (!drawing || pointerId !== null) return;
        pointerId = ev.pointerId;
        container.setPointerCapture?.(pointerId);
        const p = map.mouseEventToLatLng(ev);
        drawPoints = [p];
        drawLine = GameMap.addDrawLine(drawPoints);
        ev.preventDefault();
      }, { passive:false });
      container.addEventListener('pointermove', ev => {
        if (!drawing || pointerId !== ev.pointerId) return;
        const p = map.mouseEventToLatLng(ev);
        const last = drawPoints[drawPoints.length - 1];
        if (last && p.distanceTo(last) < 8) return;
        drawPoints.push(p);
        drawLine?.setLatLngs(drawPoints);
        ev.preventDefault();
      }, { passive:false });
      const endPointer = ev => {
        if (!drawing || pointerId !== ev.pointerId) return;
        pointerId = null;
        ev.preventDefault();
        finishDrawing();
      };
      container.addEventListener('pointerup', endPointer, { passive:false });
      container.addEventListener('pointercancel', endPointer, { passive:false });
      UI.hideLoading();
    } catch (err) {
      console.error(err);
      UI.setLoading('Ошибка загрузки. Проверьте интернет при первом запуске и перезагрузите страницу.');
    }
  }

  async function newGame() {
    try {
      UI.showLoading(); UI.setLoading('Создаём новый sandbox-сценарий…');
      const base = await Territory.buildInitialState(UI.setLoading);
      state.territories = base.territories;
      state.adminRegions = base.adminRegions;
      state.history = [];
      state.selectedOwner = 'ukraine';
      save(); UI.bind(state); UI.updateMode(); UI.stats();
      GameMap.redraw(state); GameMap.fitCountry();
      UI.hideLoading(); UI.showToast('Новая игра создана.');
    } catch (e) { UI.hideLoading(); UI.showToast('Не удалось создать новую игру.'); }
  }

  window.addEventListener('load', start);
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js', { scope:'./' }).catch(console.warn));
  }
})();
