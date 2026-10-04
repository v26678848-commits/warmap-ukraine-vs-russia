(function () {
  const KEY = 'frontline-map-v1';
  const DEFAULTS = {
    selectedOwner: 'ukraine',
    map: { center: [48.7, 31.4], zoom: 6 },
    settings: { grayZoneWidth: 12, connectionTolerance: 1.5 },
    history: [],
    territories: null,
    version: 1,
  };

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      const parsed = JSON.parse(raw);
      return Object.assign(clone(DEFAULTS), parsed, {
        settings: Object.assign({}, DEFAULTS.settings, parsed.settings || {}),
        map: Object.assign({}, DEFAULTS.map, parsed.map || {}),
        history: Array.isArray(parsed.history) ? parsed.history : [],
      });
    } catch (err) {
      console.warn('State load failed', err);
      return clone(DEFAULTS);
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('State save failed', err);
    }
  }

  function clear() { localStorage.removeItem(KEY); }

  window.GameState = { KEY, DEFAULTS, clone, load, save, clear };
})();
