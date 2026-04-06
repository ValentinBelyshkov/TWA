import { useEffect, useRef } from "react";
import L from "leaflet";

interface MapComponentProps {
  dronePosition?: {
    lat: number;
    lng: number;
  };
  path?: Array<{ lat: number; lng: number }>;
}

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

export function MapComponent({
  dronePosition = { lat: 55.7558, lng: 37.6173 }, // Default: Moscow
  path = [],
}: MapComponentProps) {
  const mapRef = useRef<L.Map | null>(null);
  const droneMarkerRef = useRef<L.Marker | null>(null);
  const pathPolylineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    // Load Leaflet CSS dynamically
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    if (mapRef.current) return;

    // Initialize map
    const map = L.map("map").setView([dronePosition.lat, dronePosition.lng], 17);

    // Add OpenStreetMap tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Create custom drone icon
    const droneIcon = L.icon({
      iconUrl:
        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTQiIGZpbGw9IiMwMDdhZjgiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMiIvPgo8cGF0aCBkPSJNMTYgOEwxOSAxNEgxM0wxNiA4WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTI0IDE2TDE4IDE5VjEzTDI0IDE2WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTggMTZMMTQgMTlWMTNMOCAxNloiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0xNiAyNEwxMyAyMFYyNkwxNiAyNFoiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPg==",
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    });

    // Add drone marker
    const droneMarker = L.marker([dronePosition.lat, dronePosition.lng], {
      icon: droneIcon,
    })
      .addTo(map)
      .bindPopup("<b>📍 Позиция дрона</b>");

    droneMarkerRef.current = droneMarker;

    // Add path if exists
    if (path.length > 1) {
      const pathCoords = path.map((p) => [p.lat, p.lng] as [number, number]);
      const polyline = L.polyline(pathCoords, {
        color: "#007af8",
        weight: 3,
        opacity: 0.7,
        dashArray: "5, 5",
      }).addTo(map);

      pathPolylineRef.current = polyline;

      // Fit map to path
      const group = new L.FeatureGroup([droneMarker, polyline]);
      map.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
  }, []);

  // Update drone position
  useEffect(() => {
    if (droneMarkerRef.current && mapRef.current) {
      droneMarkerRef.current.setLatLng([dronePosition.lat, dronePosition.lng]);
      // Optionally follow drone
      mapRef.current.panTo([dronePosition.lat, dronePosition.lng]);
    }
  }, [dronePosition]);

  // Update path
  useEffect(() => {
    if (pathPolylineRef.current) {
      const pathCoords = path.map((p) => [p.lat, p.lng] as [number, number]);
      pathPolylineRef.current.setLatLngs(pathCoords);
    } else if (path.length > 1 && mapRef.current) {
      const pathCoords = path.map((p) => [p.lat, p.lng] as [number, number]);
      const polyline = L.polyline(pathCoords, {
        color: "#007af8",
        weight: 3,
        opacity: 0.7,
        dashArray: "5, 5",
      }).addTo(mapRef.current);

      pathPolylineRef.current = polyline;
    }
  }, [path]);

  return (
    <div
      id="map"
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "0.5rem",
      }}
    />
  );
}
