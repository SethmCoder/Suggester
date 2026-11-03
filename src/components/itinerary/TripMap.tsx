"use client";

import { useEffect, useRef } from "react";

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
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

  useEffect(() => {
    if (!ref.current || !key || pins.length === 0) return;

    const scriptId = "google-maps-js";
    function init() {
      if (!ref.current || !window.google) return;
      const center = pins[0];
      const map = new window.google.maps.Map(ref.current, {
        center: { lat: center.lat, lng: center.lng },
        zoom: 13,
        mapId: "WAYPOINT_MAP",
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
        const path = window.google.maps.geometry.encoding.decodePath(polyline);
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
      s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry`;
      s.async = true;
      s.onload = init;
      document.head.appendChild(s);
    } else {
      const existing = document.getElementById(scriptId);
      existing?.addEventListener("load", init);
      return () => existing?.removeEventListener("load", init);
    }
  }, [pins, polyline, key]);

  if (!key) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-[#E5E7EB] bg-white p-4 text-sm text-[#6B7280]">
        Add NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY to show the map.
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="h-full min-h-[280px] w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FC]"
    />
  );
}
