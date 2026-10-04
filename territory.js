(function () {
  const OWNERS = ['ukraine', 'russia', 'gray', 'neutral'];
  const OWNER_NAMES = { ukraine: 'Украина', russia: 'Россия', gray: 'Серая зона', neutral: 'Нейтральная' };
  const OWNER_COLORS = { ukraine: '#2e7df6', russia: '#ee4b62', gray: '#a4acb8', neutral: '#d2ddd5' };

  // Educational sandbox ownership. It is intentionally fictional and not a statement about current battlefield control.
  const SANDBOX_ASSIGNMENT = {
    ukraine: ['Lvivska','Volynska','Rivnenska','Ternopilska','Ivano-Frankivska','Chernivetska','Zakarpatska','Khmelnytska','Vinnytska','Zhytomyrska','Kyivska','Chernihivska','Sumy','Poltavska','Cherkaska','Kirovohradska','Odeska','Mykolaivska','Dnipropetrovska'],
    russia: ['Donetska','Luhanska','Zaporizka','Khersonska','Avtonomna Respublika Krym'],
  };

  const DATA_BASE = 'https://cdn.jsdelivr.net/gh/EugeneBorshch/ukraine_geojson@master/';
  const REGION_FILES = [
    ['05','Vinnytska','UA_05_Vinnytska.geojson'], ['07','Volynska','UA_07_Volynska.geojson'], ['09','Luhanska','UA_09_Luhanska.geojson'],
    ['12','Dnipropetrovska','UA_12_Dnipropetrovska.geojson'], ['14','Donetska','UA_14_Donetska.geojson'], ['18','Zhytomyrska','UA_18_Zhytomyrska.geojson'],
    ['21','Zakarpatska','UA_21_Zakarpatska.geojson'], ['23','Zaporizka','UA_23_Zaporizka.geojson'], ['26','Ivano-Frankivska','UA_26_Ivano_Frankivska.geojson'],
    ['32','Kyivska','UA_32_Kyivska.geojson'], ['35','Kirovohradska','UA_35_Kirovohradska.geojson'], ['43','Avtonomna Respublika Krym','UA_43_Avtonomna_Respublika_Krym.geojson'],
    ['46','Lvivska','UA_46_Lvivska.geojson'], ['48','Mykolaivska','UA_48_Mykolaivska.geojson'], ['51','Odeska','UA_51_Odeska.geojson'],
    ['53','Poltavska','UA_53_Poltavska.geojson'], ['56','Rivnenska','UA_56_Rivnenska.geojson'], ['59','Sumska','UA_59_Sumska.geojson'],
    ['61','Ternopilska','UA_61_Ternopilska.geojson'], ['63','Kharkivska','UA_63_Kharkivska.geojson'], ['65','Khersonska','UA_65_Khersonska.geojson'],
    ['68','Khmelnytska','UA_68_Khmelnytska.geojson'], ['71','Cherkaska','UA_71_Cherkaska.geojson'], ['74','Chernihivska','UA_74_Chernihivska.geojson'],
    ['77','Chernivetska','UA_77_Chernivetska.geojson']
  ];

  const REGION_ALIASES = {
    Sumska: 'Sumy',
  };

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
  }

  function asFeature(input, name) {
    if (!input) return null;
    let f = input.type === 'FeatureCollection' ? input.features[0] : input;
    if (!f) return null;
    if (f.type === 'Feature') {
      f = turf.feature(f.geometry, Object.assign({}, f.properties, { adminName: name }));
    } else {
      f = turf.feature(input, { adminName: name });
    }
    if (!['Polygon', 'MultiPolygon'].includes(f.geometry.type)) return null;
    return f;
  }

  function mergeFeatures(features, owner) {
    const valid = features.filter(Boolean);
    if (!valid.length) return null;
    if (valid.length === 1) return turf.feature(valid[0].geometry, { owner });
    const merged = turf.union(turf.featureCollection(valid));
    if (!merged) return null;
    merged.properties = { owner };
    return merged;
  }

  function ownerForRegion(name) {
    for (const owner of ['ukraine', 'russia']) {
      if (SANDBOX_ASSIGNMENT[owner].some(v => v === name || v === REGION_ALIASES[name])) return owner;
    }
    return 'neutral';
  }

  async function loadRegions(progress) {
    const out = [];
    for (let i = 0; i < REGION_FILES.length; i++) {
      const [id, name, file] = REGION_FILES[i];
      progress?.(`Загрузка областей: ${i + 1}/${REGION_FILES.length}`);
      const raw = await fetchJson(DATA_BASE + file);
      const feat = asFeature(raw, name);
      if (!feat) continue;
      feat.properties = { adminName: name, code: id, owner: ownerForRegion(name) };
      out.push(feat);
    }
    return out;
  }

  async function loadCountryOutline(progress) {
    progress?.('Загрузка контура Украины');
    return fetch('./data/ukraine-outline.geojson', { cache: 'no-cache' }).then(r => r.json());
  }

  function ownerFeature(state, owner) {
    const f = (state.territories || []).find(t => t.properties?.owner === owner);
    return f || null;
  }

  function normalizeTerritories(list) {
    return list.filter(Boolean).map(f => {
      f.properties = Object.assign({}, f.properties, { owner: f.properties.owner });
      return f;
    });
  }

  async function buildFallbackState(countryOutline) {
    const country = countryOutline?.features?.[0];
    if (!country) throw new Error('Нет контура Украины для fallback.');
    const seeds = [
      { owner:'ukraine', center:[24.03,49.84], name:'Западная база' },
      { owner:'russia', center:[37.80,48.56], name:'Восточная база' },
      { owner:'gray', center:[31.0,48.9], name:'Серая база' }
    ];
    const pieces = [];
    for (const s of seeds) {
      const c = turf.point(s.center);
      const b = turf.buffer(c, 55, { units:'kilometers', steps:16 });
      const clipped = turf.intersect(turf.featureCollection([country, b]));
      if (clipped) pieces.push(turf.feature(clipped.geometry, { owner:s.owner, adminName:s.name, fallback:true }));
    }
    const occupied = pieces.length ? turf.union(turf.featureCollection(pieces)) : null;
    const neutral = occupied ? turf.difference(turf.featureCollection([country, occupied])) : country;
    const territories = pieces.slice();
    if (neutral) territories.push(turf.feature(neutral.geometry, { owner:'neutral', adminName:'Нейтральная территория', fallback:true }));
    return { territories, adminRegions:turf.featureCollection([country]), fallback:true };
  }

  async function buildInitialState(progress) {
    const regionFeatures = await loadRegions(progress);
    const grouped = { ukraine: [], russia: [], neutral: [], gray: [] };
    regionFeatures.forEach(f => grouped[f.properties.owner].push(f));
    const territories = [];
    for (const owner of OWNERS) {
      if (grouped[owner].length) {
        const merged = mergeFeatures(grouped[owner], owner);
        if (merged) territories.push(merged);
      }
    }
    return { territories, adminRegions: turf.featureCollection(regionFeatures) };
  }

  function getTerritoryOwnerAtPoint(state, pt) {
    for (const f of state.territories || []) {
      if (turf.booleanPointInPolygon(pt, f)) return f.properties.owner;
    }
    return 'neutral';
  }

  function validateOwners(territories) {
    return territories.every(f => f && f.geometry && OWNERS.includes(f.properties?.owner));
  }

  function validateGeometry(territories) {
    try {
      return territories.every(f => {
        if (!f.geometry) return false;
        if (turf.booleanValid && !turf.booleanValid(f)) return false;
        const a = turf.area(f);
        return Number.isFinite(a) && a > 0;
      });
    } catch (e) {
      return false;
    }
  }

  function mergeSameOwner(territories) {
    const grouped = { ukraine: [], russia: [], gray: [], neutral: [] };
    for (const f of territories) grouped[f.properties.owner].push(f);
    const merged = [];
    for (const owner of OWNERS) {
      if (!grouped[owner].length) continue;
      if (grouped[owner].length === 1) merged.push(grouped[owner][0]);
      else {
        const u = turf.union(turf.featureCollection(grouped[owner]));
        if (u) { u.properties = { owner }; merged.push(u); }
      }
    }
    return merged;
  }

  function subtract(base, cut) {
    const result = turf.difference(turf.featureCollection([base, cut]));
    if (!result) return null;
    result.properties = { owner: base.properties.owner };
    return result;
  }

  function intersect(a, b) {
    return turf.intersect(turf.featureCollection([a, b]));
  }

  function totalArea(state) {
    return turf.area(state.countryOutline || state.territories.reduce((acc, f) => acc ? turf.union(turf.featureCollection([acc, f])) : f, null)) || 0;
  }

  window.Territory = {
    OWNERS, OWNER_NAMES, OWNER_COLORS, REGION_FILES, DATA_BASE, SANDBOX_ASSIGNMENT,
    loadCountryOutline, loadRegions, buildInitialState, ownerFeature, getTerritoryOwnerAtPoint,
    normalizeTerritories, validateOwners, validateGeometry, mergeSameOwner, subtract, intersect,
    totalArea, fetchJson, buildFallbackState
  };
})();
