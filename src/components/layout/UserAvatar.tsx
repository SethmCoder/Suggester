"use client";

import { useEffect, useState } from "react";
import {
  AVATAR_STORAGE_KEY,
  avatarInitial,
  letterAvatarDataUrl,
  readStoredAvatar,
  writeStoredAvatar,
} from "@/lib/avatar";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "h-9 w-9 text-sm",
  md: "h-16 w-16 text-xl",
  lg: "h-20 w-20 text-2xl",
};

export function UserAvatar({
  displayName,
  email,
  imageUrl,
  size = "sm",
  className = "",
  listenForStorage = false,
}: {
  displayName?: string | null;
  email?: string | null;
  /** Remote or data-URL photo. When omitted, local letter/photo storage is used. */
  imageUrl?: string | null;
  size?: Size;
  className?: string;
  listenForStorage?: boolean;
}) {
  const [stored, setStored] = useState<string | null>(null);

  useEffect(() => {
    let current = readStoredAvatar();
    if (!current && listenForStorage) {
      // Persist the blue letter mark as the set avatar on first use.
      current = letterAvatarDataUrl(avatarInitial(displayName, email, "M"));
      writeStoredAvatar(current);
    }
    setStored(current);
    if (!listenForStorage) return;
    function onStorage(e: StorageEvent) {
      if (e.key === AVATAR_STORAGE_KEY) setStored(e.newValue);
    }
    function onCustom() {
      setStored(readStoredAvatar());
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("waypoint:avatar-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("waypoint:avatar-changed", onCustom);
    };
  }, [listenForStorage, displayName, email]);

  const src = imageUrl || stored;
  const letter = avatarInitial(displayName, email, "M");

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0400FF] font-bold text-white ${SIZES[size]} ${className}`}
      aria-hidden={src ? undefined : true}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        letter
      )}
    </div>
  );
}

export function notifyAvatarChanged() {
  window.dispatchEvent(new Event("waypoint:avatar-changed"));
}
