"use client";

import { useEffect, useRef, useState } from "react";
import { getMapsProviderPreference } from "@/lib/maps/settings";
import type { MapsProviderId } from "@/lib/maps/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any;
  }
}

interface Pin {
  lat: number;
  lng: number;
  label: string;
  order: number;
}

export function TripMap({
  pins,
  polyline,
}: {
  pins: Pin[];
  polyline?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
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

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const bounds = L.latLngBounds([]);
      pins.forEach((p) => {
        const icon = L.divIcon({
          className: "waypoint-pin",
          html: `<div style="background:#1616C9;color:#fff;border-radius:999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.25)">${p.order}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
        marker.bindPopup(`<strong>${p.order}. ${p.label}</strong>`);
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
        });
        const bounds = new window.google.maps.LatLngBounds();
        pins.forEach((p) => {
          bounds.extend({ lat: p.lat, lng: p.lng });
          new window.google.maps.Marker({
            map,
            position: { lat: p.lat, lng: p.lng },
            label: String(p.order),
            title: p.label,
          });
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
      <span className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded bg-white/90 px-2 py-0.5 text-[10px] text-[#6B7280] shadow">
        {usingGoogle ? "Google Maps" : "OpenStreetMap"}
      </span>
    </div>
  );
}
