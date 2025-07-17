import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@7/+esm';
import { gpx } from "https://unpkg.com/@tmcw/togeojson?module";


// ---===
// ---=== BLOCK: Variables
// ---===
let heatLayer = null;


// ---===
// ---=== BLOCK: DataBase
// ---===
const dbName = "rbrgmn-maps";

const tableGPXTrack = "tracks";
const db = await openDB(dbName, 2, {
  upgrade(db) {
    if (db.objectStoreNames.contains(tableGPXTrack)) {
      db.deleteObjectStore(tableGPXTrack);
    }
    db.createObjectStore(tableGPXTrack, {keyPath: 'id'});
  }
});


// ---===
// ---=== BLOCK: Leaflet
// ---===
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: 'OpenStreetMap'
});

const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/' +
  'World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Esri'
});

const stadia_smooth = L.tileLayer("https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png");
const cartodb_dark = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png");
const cartodb_light = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png");

const baseLayers = {
  'OpenStreetMap': osm,
  'ESRI Imagery': esri,
  "CartoDB Dark": cartodb_dark,
  "CartoDB Light": cartodb_light,
  "Stadia Smooth (Slow Loading)": stadia_smooth,
};

const myTracks = L.layerGroup();
const myHeatmap = L.layerGroup();
const overLayers = {
  "My Traveled Tracks": myTracks,
  "Heatmap": myHeatmap,
};

const map = L.map("map", {
    preferCanvas: true,
    renderer: L.canvas(),
  }
).setView([20, 0], 2);

osm.addTo(map);
myTracks.addTo(map);

L.control.layers(
  baseLayers,
  overLayers,
  { collapsed: false },
).addTo(map);


// ---===
// ---=== BLOCK: 
// ---===
async function loadAndRenderTracks() {
  const allTracks = await db.getAll(tableGPXTrack);
  const allCoords = [];

  for (const track of allTracks) {
    const blob = new Blob([track.data], { type: 'application/gpx+xml' });
    const text = await blob.text();
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    const geojson = gpx(xml);
    
    const coords = [];
    L.geoJSON(geojson, {
      style: { color: 'red', weight: 2 },
      filter: function (feature) {
        return feature.geometry.type !== 'Point';},
      onEachFeature: function (feature) {
        if (feature.geometry.type === 'LineString') {
          feature.geometry.coordinates.forEach(([lon, lat]) => {
            coords.push([lat, lon]);
          });
        } else if (feature.geometry.type == "MultiLineString") {
          feature.geometry.coordinates.forEach(line => {
            line.forEach(([lon, lat]) => {
              coords.push([lat, lon]);
            });
          });
        }
      }
    }).addTo(myTracks);
    allCoords.push(...coords);

    //renderGeoJSON(geojson);
    if (allCoords.length > 0) {
      if (heatLayer) map.removeLayer(heatLayer);

      heatLayer = L.heatLayer(
        allCoords, 
        { 
          maxZoom: 17,
          max: 3,
          radius: 5,
          blur: 1,
          gradient: {
            0.2: 'blue',
            0.4: 'lime',
            0.6: 'orange',
            0.8: 'red',
            1.0: 'darkred'}
        }
      );
    };
  }
  await myHeatmap.addLayer(heatLayer);
}

function renderGeoJSON(geojson) {
  L.geoJSON(
    geojson, 
    {
      style: { color: 'red', weight: 2 },
      filter: function (feature) {
        return feature.geometry.type !== 'Point';
      },
    }
  ).addTo(myTracks);
}

function updateMapView() {
  const layers = [];
  map.eachLayer((layer) => {
    if (layer instanceof L.GeoJSON) layers.push(layer);
  });

  if (layers.length) {
    const group = L.featureGroup(layers);
    map.fitBounds(group.getBounds(), { padding: [20, 20] });
  } else {
    map.setView([20, 0], 2);
  }
}


// ---===
// ---=== BLCOK: Events
// ---===
document.getElementById('gpxUpload').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    await db.put(tableGPXTrack, { id: file.name, data: arrayBuffer });
  }

  await loadAndRenderTracks();
  updateMapView();
});


document.getElementById('clearTracks').addEventListener('click', async () => {
  const tx = db.transaction(tableGPXTrack, 'readwrite');
  await tx.store.clear();
  myTracks.clearLayers();
  myHeatmap.clearLayers();
  map.addLayer(myTracks);
  map.removeLayer(myHeatmap);
});


await loadAndRenderTracks();
updateMapView();
