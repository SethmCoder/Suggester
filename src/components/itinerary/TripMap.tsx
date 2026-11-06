"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { getMapsProviderPreference } from "@/lib/maps/settings";
import type { MapsProviderId } from "@/lib/maps/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any;
  }
}

export interface MapPin {
  lat: number;
  lng: number;
  label: string;
  order: number;
  /** Day's starred restaurant / top recommendation */
  starred?: boolean;
  address?: string | null;
  activityId?: string;
}

export type HotelMapPin = {
  id: string;
  lat: number;
  lng: number;
  name: string;
  propertyType: string;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  starRating?: number | null;
};

function hotelColor(type: string) {
  if (type === "hostel") return "#0F766E";
  if (type === "motel") return "#7C3AED";
  if (type === "guest_house" || type === "bed_and_breakfast") return "#B45309";
  if (type === "apartment" || type === "chalet") return "#0369A1";
  return "#1616C9";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : "&#39;",
  );
}

function clusterHotels(pins: HotelMapPin[]) {
  if (pins.length <= 24) {
    return pins.map((pin) => ({ kind: "hotel" as const, pin }));
  }
  const cell = 0.012;
  const groups = new Map<string, HotelMapPin[]>();
  for (const pin of pins) {
    const key = `${Math.round(pin.lat / cell)}:${Math.round(pin.lng / cell)}`;
    const list = groups.get(key) ?? [];
    list.push(pin);
    groups.set(key, list);
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) return { kind: "hotel" as const, pin: group[0] };
    return {
      kind: "cluster" as const,
      lat: group.reduce((sum, pin) => sum + pin.lat, 0) / group.length,
      lng: group.reduce((sum, pin) => sum + pin.lng, 0) / group.length,
      pins: group,
    };
  });
}

export function TripMap({
  pins,
  polyline,
  onSelectPin,
  onSelectHotel,
  hotelPins = [],
  onBounds,
  overlay,
}: {
  pins: MapPin[];
  polyline?: string;
  onSelectPin?: (pin: MapPin) => void;
  onSelectHotel?: (pin: HotelMapPin) => void;
  hotelPins?: HotelMapPin[];
  onBounds?: (bounds: { south: number; west: number; north: number; east: number }) => void;
  overlay?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const onSelectRef = useRef(onSelectPin);
  onSelectRef.current = onSelectPin;
  const onHotelRef = useRef(onSelectHotel);
  onHotelRef.current = onSelectHotel;
  const onBoundsRef = useRef(onBounds);
  onBoundsRef.current = onBounds;
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const pinKey = pins
    .map(
      (pin) =>
        `${pin.activityId ?? ""}:${pin.order}:${pin.lat.toFixed(5)}:${pin.lng.toFixed(5)}:${pin.label}:${pin.starred ? 1 : 0}`,
    )
    .join("|");
  const hotelLayerRef = useRef<any>(null);
  const googleHotelMarkers = useRef<any[]>([]);
  const googleMapRef = useRef<any>(null);
  const [mapEpoch, setMapEpoch] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [provider, setProvider] = useState<MapsProviderId>("openstreetmap");
  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

  useEffect(() => {
    setMounted(true);
    setProvider(getMapsProviderPreference());
    function onChange(e: Event) {
      const detail = (e as CustomEvent<MapsProviderId>).detail;
      if (detail) setProvider(detail);
      else setProvider(getMapsProviderPreference());
    }
    window.addEventListener("waypoint:maps-provider", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("waypoint:maps-provider", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  useEffect(() => {
    if (!mounted || !ref.current || pinsRef.current.length === 0) return;
    let cancelled = false;
    const pins = pinsRef.current;

    function framePins(map: any, bounds: any) {
      map.invalidateSize({ animate: false, pan: false });
      const size = map.getSize();
      if (size.x < 20 || size.y < 20 || !bounds.isValid()) return false;
      if (pins.length < 2) {
        map.setView(bounds.getCenter(), 14, { animate: false });
      } else {
        map.fitBounds(bounds.pad(0.2), {
          animate: false,
          maxZoom: 15,
          padding: [24, 24],
        });
      }
      return true;
    }

    async function renderOsm() {
      const L = await import("leaflet");
      if (cancelled || !ref.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(ref.current, {
        zoomAnimation: true,
        fadeAnimation: false,
        markerZoomAnimation: false,
      }).setView([pins[0].lat, pins[0].lng], 14, { animate: false });
      mapRef.current = map;

      // Satellite basemap + place/road labels overlay (keeps readable names)
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution:
            "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
          maxZoom: 19,
        },
      ).addTo(map);
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Labels &copy; Esri",
          maxZoom: 19,
          opacity: 0.95,
          pane: "overlayPane",
        },
      ).addTo(map);
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Roads &copy; Esri",
          maxZoom: 19,
          opacity: 0.85,
          pane: "overlayPane",
        },
      ).addTo(map);

      const bounds = L.latLngBounds([]);
      pins.forEach((p) => {
        const star = p.starred
          ? `<span style="position:absolute;top:-8px;right:-6px;font-size:14px;line-height:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,.35))">★</span>`
          : "";
        const bg = p.starred ? "#C45F00" : "#1616C9";
        const icon = L.divIcon({
          className: "waypoint-pin",
          html: `<div style="position:relative;background:${bg};color:#fff;border-radius:999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.25)">${p.order}${star}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
        marker.on("click", () => onSelectRef.current?.(p));
        bounds.extend([p.lat, p.lng]);
      });
      if (pins.length > 1) {
        L.polyline(
          pins.map((p) => [p.lat, p.lng] as [number, number]),
          { color: "#1616C9", weight: 4 },
        ).addTo(map);
      }
      let framed = 0;
      let framing = false;
      let userMoved = false;
      let lastW = 0;
      let lastH = 0;
      const settle = () => {
        if (cancelled || framed >= 4) return;
        const size = map.getSize();
        const changed =
          Math.abs(size.x - lastW) >= 48 || Math.abs(size.y - lastH) >= 48;
        if (framed > 0 && !changed) return;
        if (userMoved) {
          map.invalidateSize({ animate: false, pan: false });
          return;
        }
        framing = true;
        const fitted = framePins(map, bounds);
        framing = false;
        if (!fitted) return;
        const next = map.getSize();
        lastW = next.x;
        lastH = next.y;
        framed += 1;
      };
      map.on("dragstart", () => {
        userMoved = true;
      });
      map.on("zoom", () => {
        if (!framing) userMoved = true;
      });
      settle();
      const container = ref.current;
      const observer = new ResizeObserver(() => settle());
      if (container) observer.observe(container);
      map.on("moveend", () => {
        if (framing) return;
        const box = map.getBounds();
        onBoundsRef.current?.({
          south: box.getSouth(),
          west: box.getWest(),
          north: box.getNorth(),
          east: box.getEast(),
        });
      });
      if (!cancelled) setMapEpoch((n) => n + 1);
      return observer;
    }

    function renderGoogle() {
      if (!googleKey || !ref.current) return;
      const scriptId = "google-maps-js";
      function init() {
        if (!ref.current || !window.google || cancelled) return;
        const map = new window.google.maps.Map(ref.current, {
          center: { lat: pins[0].lat, lng: pins[0].lng },
          zoom: 14,
          mapTypeId: "hybrid", // satellite + labels
        });
        googleMapRef.current = map;
        map.addListener("idle", () => {
          const box = map.getBounds?.();
          if (!box) return;
          const ne = box.getNorthEast();
          const sw = box.getSouthWest();
          onBoundsRef.current?.({
            south: sw.lat(),
            west: sw.lng(),
            north: ne.lat(),
            east: ne.lng(),
          });
        });
        if (!cancelled) setMapEpoch((n) => n + 1);
        const bounds = new window.google.maps.LatLngBounds();
        pins.forEach((p) => {
          bounds.extend({ lat: p.lat, lng: p.lng });
          const marker = new window.google.maps.Marker({
            map,
            position: { lat: p.lat, lng: p.lng },
            label: p.starred ? "★" : String(p.order),
            title: p.starred ? `★ ${p.label} (recommended)` : p.label,
          });
          marker.addListener("click", () => onSelectRef.current?.(p));
        });
        const idle = window.google.maps.event.addListenerOnce(map, "idle", () => {
          window.google.maps.event.removeListener(idle);
          map.fitBounds(bounds, 24);
        });
        if (polyline && window.google.maps.geometry?.encoding) {
          const path =
            window.google.maps.geometry.encoding.decodePath(polyline);
          new window.google.maps.Polyline({
            map,
            path,
            strokeColor: "#1616C9",
            strokeWeight: 4,
          });
        }
      }

      if (window.google?.maps) {
        init();
        return;
      }
      if (!document.getElementById(scriptId)) {
        const s = document.createElement("script");
        s.id = scriptId;
        s.src = `https://maps.googleapis.com/maps/api/js?key=${googleKey}&libraries=geometry`;
        s.async = true;
        s.onload = init;
        document.head.appendChild(s);
      } else {
        document.getElementById(scriptId)?.addEventListener("load", init);
      }
    }

    let observer: ResizeObserver | null = null;
    if (provider === "google" && googleKey) {
      renderGoogle();
    } else {
      void renderOsm().then((created) => {
        observer = created ?? null;
        if (cancelled) observer?.disconnect();
      });
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mounted, pinKey, polyline, provider, googleKey]);

  useEffect(() => {
    if (!mapEpoch) return;
    let cancelled = false;

    async function drawOsmHotels() {
      const map = mapRef.current;
      if (!map) return;
      const L = await import("leaflet");
      if (cancelled || !mapRef.current) return;
      if (hotelLayerRef.current) {
        mapRef.current.removeLayer(hotelLayerRef.current);
        hotelLayerRef.current = null;
      }
      const group = L.layerGroup();
      for (const item of clusterHotels(hotelPins)) {
        if (item.kind === "cluster") {
          const icon = L.divIcon({
            className: "waypoint-hotel-cluster",
            html: `<div style="background:#EEEEFF;color:#1616C9;border:2px solid #1616C9;border-radius:999px;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">${item.pins.length}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          const marker = L.marker([item.lat, item.lng], { icon, zIndexOffset: 0 });
          marker.on("click", () => {
            const bounds = L.latLngBounds(item.pins.map((pin) => [pin.lat, pin.lng] as [number, number]));
            mapRef.current?.fitBounds(bounds.pad(0.2), { maxZoom: 16 });
          });
          marker.addTo(group);
          continue;
        }
        const pin = item.pin;
        const icon = L.divIcon({
          className: "waypoint-hotel-pin",
          html: `<div style="background:${hotelColor(pin.propertyType)};width:14px;height:14px;border:2px solid #fff;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        const site =
          pin.website && /^https?:\/\//i.test(pin.website)
            ? `<br/><a href="${escapeHtml(pin.website)}" target="_blank" rel="noopener">Website</a>`
            : "";
        const marker = L.marker([pin.lat, pin.lng], { icon, zIndexOffset: 50 });
        marker.bindPopup(
          `<strong>${escapeHtml(pin.name)}</strong><br/>${escapeHtml(pin.propertyType.replaceAll("_", " "))}${pin.starRating != null ? ` · ${pin.starRating}★` : ""}${pin.address ? `<br/>${escapeHtml(pin.address)}` : ""}${pin.phone ? `<br/>${escapeHtml(pin.phone)}` : ""}${site}<br/><span style="color:#6B7280">© OpenStreetMap contributors</span>`,
        );
        marker.on("click", () => onHotelRef.current?.(pin));
        marker.addTo(group);
      }
      group.addTo(mapRef.current);
      hotelLayerRef.current = group;
    }

    function drawGoogleHotels() {
      const map = googleMapRef.current;
      if (!map || !window.google?.maps) return;
      googleHotelMarkers.current.forEach((marker) => marker.setMap(null));
      googleHotelMarkers.current = [];
      for (const item of clusterHotels(hotelPins)) {
        if (item.kind === "cluster") {
          const marker = new window.google.maps.Marker({
            map,
            position: { lat: item.lat, lng: item.lng },
            label: String(item.pins.length),
            title: `${item.pins.length} hotels`,
          });
          googleHotelMarkers.current.push(marker);
          continue;
        }
        const pin = item.pin;
        const marker = new window.google.maps.Marker({
          map,
          position: { lat: pin.lat, lng: pin.lng },
          title: pin.name,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: hotelColor(pin.propertyType),
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
        marker.addListener("click", () => onHotelRef.current?.(pin));
        googleHotelMarkers.current.push(marker);
      }
    }

    if (provider === "google" && googleKey) drawGoogleHotels();
    else void drawOsmHotels();

    return () => {
      cancelled = true;
    };
  }, [hotelPins, mapEpoch, provider, googleKey]);

  const usingGoogle = provider === "google" && Boolean(googleKey);

  if (!mounted) {
    return (
      <div className="flex h-full min-h-[240px] w-full items-center justify-center rounded-xl bg-[#F7F8FC] text-sm text-[#6B7280]">
        Loading map…
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[240px] w-full overflow-hidden rounded-xl bg-[#F7F8FC]">
      <div ref={ref} className="absolute inset-0 h-full w-full" />
      {overlay}
      <span className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded bg-white/90 px-2 py-0.5 text-[10px] text-[#6B7280] shadow">
        {usingGoogle ? "Google hybrid" : "Satellite + labels"}
        {hotelPins.length ? " · Hotels © OpenStreetMap" : ""}
      </span>
    </div>
  );
}
