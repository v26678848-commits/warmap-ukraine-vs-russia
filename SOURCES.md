# Sources and attributions

## Map engine and geometry

- Leaflet 1.9.4 — https://leafletjs.com/
- Turf.js 7.4.0 — https://turfjs.org/

## Administrative boundaries

- EugeneBorshch/ukraine_geojson — https://github.com/EugeneBorshch/ukraine_geojson

## Physical and cultural layers

- Natural Earth vector data — https://www.naturalearthdata.com/
- Natural Earth repository — https://github.com/nvkelso/natural-earth-vector

The application intentionally keeps the heavy regional and reference layers as runtime requests to jsDelivr and caches them with the service worker after they have been successfully fetched. This keeps the GitHub Pages repository practical for a mobile browser.
