"use client";

import { useEffect, useRef, useState } from "react";
import { BillingPlansPanel } from "@/components/billing/BillingPlansPanel";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { SignupToPlanFunnel } from "@/components/settings/SignupToPlanFunnel";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  getMapsProviderPreference,
  setMapsProviderPreference,
} from "@/lib/maps/settings";
import type { MapsProviderId } from "@/lib/maps/types";
import { notifyAvatarChanged } from "@/components/layout/UserAvatar";
import { UserAvatar } from "@/components/layout/UserAvatar";
import {
  AVATAR_STORAGE_KEY,
  avatarInitial,
  letterAvatarDataUrl,
  writeStoredAvatar,
} from "@/lib/avatar";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import {
  getPreferredLanguageClient,
  LANGUAGE_OPTIONS,
  setPreferredLanguageClient,
  type AppLanguageCode,
} from "@/lib/i18n/preference";

const USERNAME_KEY = "waypoint:username";

export default function SettingsPage() {
  const { t } = useLanguage();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [mapsProvider, setMapsProvider] =
    useState<MapsProviderId>("openstreetmap");
  const [language, setLanguage] = useState<AppLanguageCode>("en");
  const [isDemo, setIsDemo] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    setMapsProvider(getMapsProviderPreference());
    setLanguage(getPreferredLanguageClient());
    try {
      setAvatarUrl(localStorage.getItem(AVATAR_STORAGE_KEY));
      setUsername(localStorage.getItem(USERNAME_KEY) ?? "");
    } catch {
      /* ignore */
    }

    fetch("/api/trips")
      .then((r) => r.json())
      .then((d) => setIsDemo(Boolean(d.isDemo)))
      .catch(() => null);

    if (!isSupabaseConfigured()) return;
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        setEmail(user.email ?? "");
        setNewEmail(user.email ?? "");
        supabase
          .from("profiles")
          .select("display_name, avatar_url, username, maps_provider")
          .eq("id", user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.display_name) setDisplayName(data.display_name);
            if (data?.avatar_url) setAvatarUrl(data.avatar_url);
            if (data?.username) setUsername(data.username);
            if (
              data?.maps_provider === "google" ||
              data?.maps_provider === "openstreetmap"
            ) {
              setMapsProvider(data.maps_provider);
              setMapsProviderPreference(data.maps_provider);
            }
          });
      });
    } catch {
      /* demo without supabase */
    }
  }, []);

  function onMapsSlider(value: number) {
    const next: MapsProviderId = value < 50 ? "openstreetmap" : "google";
    setMapsProvider(next);
    setMapsProviderPreference(next);
    document.cookie = `waypoint_maps=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    setStatus(
      next === "openstreetmap"
        ? "Using standard maps."
        : "Using Google Maps.",
    );
  }

  function setAvatar(dataUrl: string | null) {
    setAvatarUrl(dataUrl);
    writeStoredAvatar(dataUrl);
    notifyAvatarChanged();
  }

  function useLetterAvatar() {
    const letter = avatarInitial(displayName, email || newEmail, "M");
    setAvatar(letterAvatarDataUrl(letter));
    setStatus(`Letter avatar set to ${letter}.`);
    setError(null);
  }

  function onAvatarFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file");
      return;
    }
    if (file.size > 2_000_000) {
      setError("Image must be under 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setAvatar(String(reader.result));
        setError(null);
        setStatus("Photo avatar saved on this device.");
      } catch {
        setError("Could not store avatar locally");
      }
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    setError(null);
    setStatus(null);
    try {
      localStorage.setItem(USERNAME_KEY, username);
    } catch {
      /* ignore */
    }

    if (!isSupabaseConfigured() || isDemo) {
      setStatus("Saved on this device.");
      return;
    }

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Sign in to sync settings to your account.");
        return;
      }

      const { error: profileErr } = await supabase.from("profiles").upsert({
        id: user.id,
        display_name: displayName,
        username: username || null,
        avatar_url: avatarUrl?.startsWith("http") ? avatarUrl : null,
        maps_provider: mapsProvider,
      });
      if (profileErr) {
        setError(profileErr.message);
        return;
      }

      if (newEmail && newEmail !== email) {
        const { error: emailErr } = await supabase.auth.updateUser({
          email: newEmail,
        });
        if (emailErr) {
          setError(emailErr.message);
          return;
        }
        setStatus("Profile saved. Check your inbox to confirm the new email.");
        return;
      }

      setStatus("Profile saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function changePassword() {
    setError(null);
    setStatus(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!isSupabaseConfigured() || isDemo) {
      setError("Create an account before you can change a password.");
      return;
    }
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) setError(err.message);
    else {
      setPassword("");
      setConfirmPassword("");
      setStatus("Password updated.");
    }
  }

  const sliderValue = mapsProvider === "openstreetmap" ? 0 : 100;

  if (!mounted) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-[#E1E5F0] bg-white p-6 text-sm text-[#6B7280] shadow-sm">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {isDemo ? <DemoBanner /> : null}
      <div>
        <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-[#6B7280]">{t("settings.subtitle")}</p>
      </div>

      <BillingPlansPanel />

      <SignupToPlanFunnel />

      <section className="rounded-2xl border border-[#E1E5F0] bg-white p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t("settings.language")}</h2>
          <p className="mt-1 text-sm text-[#6B7280]">
            {t("settings.languageHint")}
          </p>
        </div>
        <div>
          <Label htmlFor="preferred-language">{t("settings.language")}</Label>
          <select
            id="preferred-language"
            className="mt-1 h-11 w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3 text-sm text-[#080B3A]"
            value={language}
            onChange={(e) => setLanguage(e.target.value as AppLanguageCode)}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.nativeLabel} ({option.label})
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          onClick={() => {
            setPreferredLanguageClient(language);
            setStatus(t("settings.languageSaved"));
            setError(null);
          }}
        >
          {t("settings.saveLanguage")}
        </Button>
      </section>

      {/* Avatar */}
      <section className="rounded-2xl border border-[#E1E5F0] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Avatar</h2>
        <p className="mt-1 text-sm text-[#6B7280]">
          The blue letter mark is the default Waypoint avatar. Set it once, or
          replace it with a photo.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <UserAvatar
            displayName={displayName || username}
            email={email || newEmail}
            imageUrl={avatarUrl}
            size="lg"
          />
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onAvatarFile(e.target.files?.[0] ?? null)}
            />
            <Button type="button" onClick={useLetterAvatar}>
              Use letter avatar
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
            >
              Upload photo
            </Button>
            {avatarUrl ? (
              <button
                type="button"
                className="text-sm font-semibold text-[#DC2626]"
                onClick={() => {
                  setAvatar(null);
                  setStatus("Avatar cleared. Header will show your letter again.");
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Profile */}
      <section className="rounded-2xl border border-[#E1E5F0] bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Profile</h2>
        <div>
          <Label>Display name</Label>
          <Input
            className="mt-1"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div>
          <Label>Username</Label>
          <Input
            className="mt-1"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="traveler123"
          />
        </div>
        <div>
          <Label>Email</Label>
          <Input
            className="mt-1"
            type="email"
            value={newEmail || email}
            onChange={(e) => setNewEmail(e.target.value)}
            disabled={isDemo && !isSupabaseConfigured()}
          />
          {isDemo ? (
            <p className="mt-1 text-xs text-[#6B7280]">
              Email changes are available after you create an account.
            </p>
          ) : null}
        </div>
        <Button type="button" onClick={saveProfile}>
          Save profile
        </Button>
      </section>

      {/* Password */}
      <section className="rounded-2xl border border-[#E1E5F0] bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Password</h2>
        <div>
          <Label>New password</Label>
          <Input
            className="mt-1"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
          />
        </div>
        <div>
          <Label>Confirm password</Label>
          <Input
            className="mt-1"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        <Button type="button" variant="secondary" onClick={changePassword}>
          Update password
        </Button>
      </section>

      {/* Maps provider slider */}
      <section className="rounded-2xl border border-[#E1E5F0] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Maps & places</h2>
        <p className="mt-1 text-sm text-[#6B7280]">
          Standard maps are ready to use. Switch to Google Maps if you prefer
          that map.
        </p>
        <div className="mt-6">
          <div className="mb-2 flex justify-between text-sm font-medium">
            <span
              className={
                mapsProvider === "openstreetmap"
                  ? "text-[#0400FF]"
                  : "text-[#6B7280]"
              }
            >
              Standard maps
            </span>
            <span
              className={
                mapsProvider === "google" ? "text-[#0400FF]" : "text-[#6B7280]"
              }
            >
              Google Maps
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={100}
            value={sliderValue}
            onChange={(e) => onMapsSlider(Number(e.target.value))}
            className="wp-slider h-2 w-full cursor-pointer appearance-none rounded-full bg-[#E1E5F0] accent-[#0400FF]"
            aria-label="Maps provider"
          />
          <p className="mt-3 text-xs text-[#6B7280]">
            Active:{" "}
            <strong>
              {mapsProvider === "openstreetmap"
                ? "Standard maps"
                : "Google Maps"}
            </strong>
            {mapsProvider === "google" &&
            !process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
              ? " — Google Maps isn’t connected yet, so the map stays on standard maps."
              : null}
          </p>
        </div>
      </section>

      {status ? <p className="text-sm text-[#15803D]">{status}</p> : null}
      {error ? <p className="text-sm text-[#DC2626]">{error}</p> : null}
    </div>
  );
}
