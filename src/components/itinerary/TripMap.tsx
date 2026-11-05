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

export function TripMap({
  pins,
  polyline,
  onSelectPin,
  overlay,
}: {
  pins: MapPin[];
  polyline?: string;
  onSelectPin?: (pin: MapPin) => void;
  overlay?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const onSelectRef = useRef(onSelectPin);
  onSelectRef.current = onSelectPin;
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
    if (!mounted || !ref.current || pins.length === 0) return;
    let cancelled = false;

    async function renderOsm() {
      const L = await import("leaflet");
      if (cancelled || !ref.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(ref.current).setView(
        [pins[0].lat, pins[0].lng],
        13,
      );
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
      map.fitBounds(bounds.pad(0.2));
    }

    function renderGoogle() {
      if (!googleKey || !ref.current) return;
      const scriptId = "google-maps-js";
      function init() {
        if (!ref.current || !window.google || cancelled) return;
        const center = pins[0];
        const map = new window.google.maps.Map(ref.current, {
          center: { lat: center.lat, lng: center.lng },
          zoom: 13,
          mapTypeId: "hybrid", // satellite + labels
        });
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
        map.fitBounds(bounds);
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

    if (provider === "google" && googleKey) {
      renderGoogle();
    } else {
      void renderOsm();
    }

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mounted, pins, polyline, provider, googleKey]);

  const usingGoogle = provider === "google" && Boolean(googleKey);

  useEffect(() => {
    if (!mounted || !mapRef.current) return;
    const t = window.setTimeout(() => {
      try {
        mapRef.current?.invalidateSize?.();
      } catch {
        /* ignore */
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [mounted, pins]);

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
      </span>
    </div>
  );
}
