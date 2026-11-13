"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import type { TravelIntelligence } from "@/lib/intelligence/types";
import { emptyIntelligence } from "@/lib/intelligence/types";
import { loadIntelligence, saveIntelligence } from "@/lib/intelligence/sync";
import { recordIntelligenceSignal } from "@/lib/intelligence/store";

const INTEREST_OPTIONS = [
  "architecture",
  "history",
  "food",
  "museums",
  "nature",
  "aviation",
  "culture",
  "adventure",
  "nightlife",
  "beaches",
];

export function TravelPreferences() {
  const [profile, setProfile] = useState<TravelIntelligence>(emptyIntelligence());
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">(
    "loading",
  );
  const [interestDraft, setInterestDraft] = useState("");

  useEffect(() => {
    void loadIntelligence()
      .then(({ profile: next }) => {
        setProfile(next);
        setStatus("idle");
      })
      .catch(() => setStatus("error"));
  }, []);

  async function persist(next: TravelIntelligence) {
    setStatus("saving");
    setProfile(next);
    try {
      await saveIntelligence(next);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  function toggleInterest(interest: string) {
    const has = profile.explicit.interests.includes(interest);
    const interests = has
      ? profile.explicit.interests.filter((row) => row !== interest)
      : [...profile.explicit.interests, interest].slice(0, 16);
    void persist({
      ...profile,
      explicit: { ...profile.explicit, interests },
    });
  }

  function removeInferred(interest: string) {
    const next = {
      ...profile,
      inferred: {
        ...profile.inferred,
        interests: profile.inferred.interests.filter((row) => row.interest !== interest),
        downrankedInterests: profile.inferred.downrankedInterests.filter(
          (row) => row.interest !== interest,
        ),
        preferredDestinations: profile.inferred.preferredDestinations.filter(
          (row) => row !== interest,
        ),
      },
    };
    void persist(next);
  }

  return (
    <section className="rounded-[16px] border border-[#E1E5F0] bg-white p-6 shadow-[0_4px_20px_rgba(8,11,58,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#1F2937]">Travel preferences</h2>
          <p className="mt-1 text-sm text-[#6B7280]">
            Explicit settings always win. Inferred preferences need repeated signals before they
            steer Discover, Trip Wizard, and itinerary generation.
          </p>
          <p className="mt-2 text-xs font-medium text-[#0400FF]">
            Used by Trip Architect — pace and interests prefill when you plan a new trip.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#1F2937]">
          <input
            type="checkbox"
            checked={profile.personalizationEnabled}
            onChange={(event) => {
              const next = recordIntelligenceSignal({
                type: "toggle",
                enabled: event.target.checked,
              });
              void persist(next);
            }}
          />
          Personalization on
        </label>
      </div>

      {status === "loading" ? (
        <p className="mt-4 text-sm text-[#6B7280]">Loading preferences…</p>
      ) : null}

      <div className="mt-5 space-y-4">
        <div>
          <Label>Interests you set</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((interest) => {
              const active = profile.explicit.interests.includes(interest);
              return (
                <button
                  key={interest}
                  type="button"
                  onClick={() => toggleInterest(interest)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    active
                      ? "border-[#0400FF] bg-[#EEF0FF] text-[#0400FF]"
                      : "border-[#E1E5F0] text-[#6B7280]"
                  }`}
                >
                  {interest}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={interestDraft}
              onChange={(event) => setInterestDraft(event.target.value)}
              placeholder="Add a custom interest"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const value = interestDraft.trim().toLowerCase();
                if (!value) return;
                toggleInterest(value);
                setInterestDraft("");
              }}
            >
              Add
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Usual pace</Label>
            <select
              className="mt-1 w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
              value={profile.explicit.pace ?? ""}
              onChange={(event) =>
                void persist({
                  ...profile,
                  explicit: {
                    ...profile.explicit,
                    pace: (event.target.value || undefined) as
                      | "relaxed"
                      | "balanced"
                      | "packed"
                      | undefined,
                  },
                })
              }
            >
              <option value="">Not set</option>
              <option value="relaxed">Relaxed</option>
              <option value="balanced">Balanced</option>
              <option value="packed">Packed</option>
            </select>
          </div>
          <div>
            <Label>Preferred transport</Label>
            <Input
              value={profile.explicit.transport ?? ""}
              onChange={(event) =>
                void persist({
                  ...profile,
                  explicit: { ...profile.explicit, transport: event.target.value || undefined },
                })
              }
              placeholder="walking, transit, mixed…"
            />
          </div>
          <div>
            <Label>Typical budget ceiling (USD)</Label>
            <Input
              type="number"
              value={profile.explicit.budgetMax ?? ""}
              onChange={(event) =>
                void persist({
                  ...profile,
                  explicit: {
                    ...profile.explicit,
                    budgetMax: event.target.value ? Number(event.target.value) : null,
                  },
                })
              }
            />
          </div>
          <div>
            <Label>Preferred trip length (days)</Label>
            <Input
              type="number"
              value={profile.explicit.preferredDurationDays ?? ""}
              onChange={(event) =>
                void persist({
                  ...profile,
                  explicit: {
                    ...profile.explicit,
                    preferredDurationDays: event.target.value
                      ? Number(event.target.value)
                      : null,
                  },
                })
              }
            />
          </div>
        </div>

        <div>
          <Label>Inferred from saves and trips</Label>
          {profile.inferred.interests.filter((row) => row.evidence >= 2).length ? (
            <ul className="mt-2 space-y-2">
              {profile.inferred.interests
                .filter((row) => row.evidence >= 2)
                .map((row) => (
                  <li
                    key={row.interest}
                    className="flex items-center justify-between rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
                  >
                    <span>
                      {row.interest} · weight {row.weight.toFixed(2)} · {row.evidence} signals
                    </span>
                    <button
                      type="button"
                      className="text-xs font-semibold text-[#B91C1C]"
                      onClick={() => removeInferred(row.interest)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[#6B7280]">
              Nothing inferred yet with enough evidence. Save places or create future trips.
            </p>
          )}
        </div>

        <div>
          <Label>Why recommendations look this way</Label>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#374151]">
            {profile.explanations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const next = recordIntelligenceSignal({ type: "reset" });
              void persist(next);
            }}
          >
            Reset personalization
          </Button>
          {status === "saved" ? (
            <p className="self-center text-sm text-[#15803D]">Saved</p>
          ) : null}
          {status === "error" ? (
            <p className="self-center text-sm text-[#DC2626]">Couldn’t save</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
