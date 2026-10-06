import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { statusColor } from './ui';

export const DEFAULT_CENTER = [30.4846, 76.5944];
const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function Recenter({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center, Math.max(map.getZoom(), 16)); }, [center?.[0], center?.[1]]); // eslint-disable-line
  return null;
}

/** Status-coloured markers. renderPopup(point) returns popup content. */
export function MapView({ points, center = DEFAULT_CENTER, zoom = 14, height = 320, renderPopup, me }) {
  return (
    <MapContainer center={center} zoom={zoom} style={{ height }} className="rounded-lg border border-slate-200" scrollWheelZoom={false}>
      <TileLayer url={TILES} attribution={ATTR} />
      {points.map((p) => (
        <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: statusColor(p.status), fillOpacity: 0.95 }}>
          {renderPopup && <Popup>{renderPopup(p)}</Popup>}
        </CircleMarker>
      ))}
      {me && <CircleMarker center={me} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: '#0f5c78', fillOpacity: 1 }} />}
    </MapContainer>
  );
}

function Clicks({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Tap the map to place/adjust the pin. value = {lat,lng} | null */
export function LocationPicker({ value, onPick, center = DEFAULT_CENTER, height = 260 }) {
  const c = value ? [value.lat, value.lng] : center;
  return (
    <MapContainer center={c} zoom={value ? 17 : 14} style={{ height, cursor: 'crosshair' }} className="rounded-lg border border-slate-200">
      <TileLayer url={TILES} attribution={ATTR} />
      <Clicks onPick={onPick} />
      <Recenter center={value ? [value.lat, value.lng] : null} />
      {value && <CircleMarker center={[value.lat, value.lng]} radius={11} pathOptions={{ color: '#fff', weight: 3, fillColor: '#0f5c78', fillOpacity: 1 }} />}
    </MapContainer>
  );
}

export function Legend() {
  return (
    <div className="flex gap-4 text-xs text-slate-600" aria-label="Map legend">
      <span>🟥 Pending</span><span>🟨 In progress</span><span>🟩 Resolved</span>
    </div>
  );
}
