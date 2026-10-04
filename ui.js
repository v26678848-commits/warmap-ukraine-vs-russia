(function () {
  let state = null;
  let toastTimer = null;
  const $ = id => document.getElementById(id);
  const ownerLabels = Territory.OWNER_NAMES;

  function bind(s) { state = s; }
  function showToast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function setLoading(text) { $('loadingText').textContent = text; }
  function hideLoading() { $('loadingOverlay').classList.add('hidden'); }
  function showLoading() { $('loadingOverlay').classList.remove('hidden'); }

  function updateMode() {
    const owner = state.selectedOwner;
    $('modeBadge').innerHTML = `Режим: <strong>${ownerLabels[owner]}</strong>`;
    document.querySelectorAll('.owner-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.owner === owner));
  }

  function stats() {
    const total = turf.area(state.countryOutline || turf.featureCollection([]));
    const result = { ukraine:0, russia:0, gray:0 };
    (state.territories || []).forEach(f => {
      const o = f.properties.owner;
      if (result[o] !== undefined) result[o] += turf.area(f);
    });
    const format = area => `${(area / Math.max(total,1) * 100).toFixed(1)}%`;
    $('statUkraine').textContent = format(result.ukraine);
    $('statRussia').textContent = format(result.russia);
    $('statGray').textContent = format(result.gray);
    $('statMeta').textContent = `${Math.round(total/1e6).toLocaleString('ru-RU')} км² карта`;
  }

  function updateSettings() {
    $('grayZoneWidth').value = state.settings.grayZoneWidth;
    $('grayZoneWidthLabel').textContent = `${state.settings.grayZoneWidth} км`;
    $('connectionTolerance').value = state.settings.connectionTolerance;
    $('connectionToleranceLabel').textContent = `${state.settings.connectionTolerance} км`;
  }

  function openConfirm(owner, areaKm2, onApply, onCancel) {
    $('confirmOwner').textContent = ownerLabels[owner];
    $('confirmOwner').style.color = owner === 'ukraine' ? '#8ebcff' : owner === 'russia' ? '#ff91a0' : '#ccd2dc';
    $('confirmArea').textContent = `${areaKm2.toLocaleString('ru-RU', {maximumFractionDigits:0})} км²`;
    $('confirmMessage').textContent = 'Изменение будет применено к геометрии территорий и войдёт в историю Undo.';
    $('confirmModal').classList.remove('hidden');
    $('confirmApply').onclick = () => { closeConfirm(); onApply(); };
    $('confirmCancel').onclick = () => { closeConfirm(); onCancel?.(); };
  }
  function closeConfirm() { $('confirmModal').classList.add('hidden'); }
  function openMenu() { updateSettings(); $('menuModal').classList.remove('hidden'); }
  function closeMenu() { $('menuModal').classList.add('hidden'); }
  function setDrawingUI(on) { $('drawHint').classList.toggle('hidden', !on); $('captureBtn').textContent = on ? 'ГОТОВО' : 'ЗАХВАТИТЬ'; $('cancelDrawBtn').disabled = !on; }
  function showCity(city, owner) {
    const p = city.properties || {};
    const el = $('cityPopup');
    const pop = Number(p.pop_max || p.pop_min || 0);
    const population = pop ? `${Math.round(pop/1000).toLocaleString('ru-RU')} тыс.` : 'нет данных';
    el.innerHTML = `<h3>${p.nameascii || p.name || 'Город'}</h3><div class="muted">Область/регион: ${p.adm1name || 'не указано'}</div><div>Владелец: <b>${ownerLabels[owner]}</b></div><div>Население: <b>${population}</b></div>`;
    el.style.left = '50%'; el.style.top = '46%'; el.style.transform = 'translate(-50%,-50%)';
    el.classList.remove('hidden');
    setTimeout(() => document.addEventListener('click', closeCity, {once:true}), 0);
  }
  function closeCity() { $('cityPopup').classList.add('hidden'); }

  window.UI = { bind, showToast, setLoading, hideLoading, showLoading, updateMode, stats, updateSettings, openConfirm, closeConfirm, openMenu, closeMenu, setDrawingUI, showCity, closeCity };
})();
