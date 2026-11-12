"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import type { FriendshipRow, SocialActivityItem } from "@/lib/friends/types";

function otherProfile(
  friendship: FriendshipRow,
  viewerId: string | null,
): FriendshipRow["requester"] {
  if (!viewerId) return friendship.addressee ?? friendship.requester;
  return friendship.requesterId === viewerId
    ? friendship.addressee
    : friendship.requester;
}

function activityLabel(item: SocialActivityItem): string {
  const who = item.actor?.displayName ?? "Someone";
  switch (item.type) {
    case "friend_request":
      return `${who} sent a friend request`;
    case "friend_accepted":
      return `${who} accepted a friend request`;
    case "trip_shared":
      return `${who} shared a trip${item.meta.destination ? `: ${String(item.meta.destination)}` : ""}`;
    case "future_trip_shared":
      return `${who} shared a future plan${item.meta.label ? `: ${String(item.meta.label)}` : ""}`;
    case "wishlist_shared":
      return `${who} shared a wishlist${item.meta.name ? `: ${String(item.meta.name)}` : ""}`;
    default:
      return `${who} — ${item.type.replace(/_/g, " ")}`;
  }
}

function AvatarMark({ name }: { name: string }) {
  const letter = (name.trim().charAt(0) || "?").toUpperCase();
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-sm font-semibold text-[#0400FF]">
      {letter}
    </span>
  );
}

export function FriendsBoard() {
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendshipRow[]>([]);
  const [pendingIncoming, setPendingIncoming] = useState<FriendshipRow[]>([]);
  const [pendingOutgoing, setPendingOutgoing] = useState<FriendshipRow[]>([]);
  const [feed, setFeed] = useState<SocialActivityItem[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [friendsRes, feedRes] = await Promise.all([
        fetch("/api/friends"),
        fetch("/api/social/feed"),
      ]);
      const friendsData = await friendsRes.json();
      const feedData = await feedRes.json();
      if (friendsRes.status === 401 || friendsData.offline) {
        setOffline(true);
        return;
      }
      if (!friendsRes.ok) {
        throw new Error(friendsData.error ?? "Could not load friends");
      }
      if (friendsData.viewerId) setViewerId(friendsData.viewerId);
      setFriends(friendsData.friends ?? []);
      setPendingIncoming(friendsData.pendingIncoming ?? []);
      setPendingOutgoing(friendsData.pendingOutgoing ?? []);
      if (feedRes.ok) setFeed(feedData.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    import("@/lib/supabase/client").then(({ createClient, isSupabaseConfigured }) => {
      if (!isSupabaseConfigured()) return;
      createClient()
        .auth.getUser()
        .then(({ data: { user } }) => setViewerId(user?.id ?? null));
    });
  }, [refresh]);

  async function sendRequest() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setStatus(`Request sent to ${email.trim()}.`);
      setEmail("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function accept(id: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/friends/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendshipId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not accept");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept");
    } finally {
      setBusy(false);
    }
  }

  async function decline(id: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/friends/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendshipId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not decline");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decline");
    } finally {
      setBusy(false);
    }
  }

  if (offline) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0400FF]">
          Social
        </p>
        <h1 className="mt-2 text-[2rem] font-semibold tracking-tight text-[#080B3A]">
          Friends
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#6B7280]">
          Sign in to add friends, accept requests, and see activity from people
          you travel with.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <header className="max-w-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0400FF]">
          Social
        </p>
        <h1 className="mt-2 text-[2rem] font-semibold tracking-tight text-[#080B3A]">
          Friends
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6B7280]">
          Connect with people you travel with and follow what they share.
        </p>
      </header>

      {error ? (
        <p className="rounded-[12px] bg-[#FEF2F2] px-3.5 py-2.5 text-sm text-[#B91C1C]">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="rounded-[12px] bg-[#ECFDF5] px-3.5 py-2.5 text-sm text-[#047857]">
          {status}
        </p>
      ) : null}

      <section className="rounded-[18px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight text-[#080B3A]">
          Add by email
        </h2>
        <p className="mt-1 text-sm text-[#6B7280]">
          They need a Waypoint account with that email.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Label htmlFor="friend-email">Email</Label>
            <Input
              id="friend-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@email.com"
              className="mt-1.5"
            />
          </div>
          <Button
            type="button"
            disabled={busy || !email.trim()}
            onClick={() => void sendRequest()}
          >
            {busy ? "Sending…" : "Send request"}
          </Button>
        </div>
      </section>

      {loading ? (
        <p className="text-sm text-[#6B7280]">Loading…</p>
      ) : (
        <>
          {pendingIncoming.length ? (
            <section className="rounded-[18px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
              <h2 className="text-base font-semibold text-[#080B3A]">
                Pending requests
              </h2>
              <ul className="mt-4 divide-y divide-[#F0F2F8]">
                {pendingIncoming.map((row) => {
                  const name = row.requester?.displayName ?? "Traveler";
                  return (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center gap-3">
                        <AvatarMark name={name} />
                        <span className="text-sm font-medium text-[#080B3A]">
                          {name}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() => void accept(row.id)}
                        >
                          Accept
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void decline(row.id)}
                        >
                          Decline
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="rounded-[18px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
            <h2 className="text-base font-semibold text-[#080B3A]">Friends</h2>
            {friends.length === 0 ? (
              <p className="mt-3 text-sm leading-relaxed text-[#6B7280]">
                No friends yet — send a request above.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-[#F0F2F8]">
                {friends.map((row) => {
                  const profile = otherProfile(row, viewerId);
                  const name = profile?.displayName ?? "Traveler";
                  return (
                    <li
                      key={row.id}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <AvatarMark name={name} />
                      <span className="text-sm font-medium text-[#080B3A]">
                        {name}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {pendingOutgoing.length ? (
              <p className="mt-4 text-xs text-[#9CA3AF]">
                Waiting on {pendingOutgoing.length} outgoing request
                {pendingOutgoing.length === 1 ? "" : "s"}.
              </p>
            ) : null}
          </section>

          <section className="rounded-[18px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
            <h2 className="text-base font-semibold text-[#080B3A]">Activity</h2>
            {feed.length === 0 ? (
              <p className="mt-3 text-sm leading-relaxed text-[#6B7280]">
                Nothing yet from you or your friends.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-[#F0F2F8]">
                {feed.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <p className="text-sm text-[#1F2937]">
                      {activityLabel(item)}
                    </p>
                    <time className="shrink-0 text-xs text-[#9CA3AF]">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
