import { describe, expect, it } from "vitest";
import { AnalyticsEvent } from "@/lib/analytics/events";
import { computeSignupToPlanFunnel } from "@/lib/analytics/funnel";
import { isAnalyticsAdmin } from "@/lib/analytics/track";

function mockSvc(
  rows: Array<Record<string, unknown>>,
  trips: string[] = [],
  authUsers: Array<{ id: string; created_at: string }> = [],
) {
  return {
    from(table: string) {
      if (table === "analytics_events") {
        const state: {
          filters: Array<(r: Record<string, unknown>) => boolean>;
          eqEvent?: string;
          inUsers?: string[];
        } = { filters: [] };
        const builder = {
          select() {
            return builder;
          },
          gte() {
            return builder;
          },
          in(_col: string, values: string[]) {
            if (_col === "event_name") {
              state.filters.push((r) => values.includes(String(r.event_name)));
            } else if (_col === "user_id") {
              state.inUsers = values;
            }
            return builder;
          },
          eq(col: string, value: string) {
            if (col === "event_name") state.eqEvent = value;
            return builder;
          },
          then(resolve: (v: { data: unknown }) => void) {
            let data = rows;
            if (state.eqEvent) {
              data = data.filter((r) => r.event_name === state.eqEvent);
            }
            for (const f of state.filters) data = data.filter(f);
            if (state.inUsers) {
              data = data.filter((r) =>
                state.inUsers!.includes(String(r.user_id)),
              );
            }
            resolve({ data });
          },
        };
        return builder;
      }
      if (table === "trips") {
        return {
          select() {
            return {
              in(_col: string, ownerIds: string[]) {
                const data = trips
                  .filter((owner_id) => ownerIds.includes(owner_id))
                  .map((owner_id) => ({ owner_id }));
                return Promise.resolve({ data });
              },
            };
          },
        };
      }
      return {
        select() {
          return {
            gte() {
              return { in: () => Promise.resolve({ data: [] }) };
            },
          };
        },
      };
    },
    auth: {
      admin: {
        listUsers: async () => ({
          data: {
            users: authUsers.length
              ? authUsers
              : [],
          },
        }),
      },
    },
  };
}

describe("analytics funnel", () => {
  it("exposes canonical conversion events", () => {
    expect(AnalyticsEvent.SignupCompleted).toBe("signup_completed");
    expect(AnalyticsEvent.WizardOpened).toBe("trip_wizard_opened");
    expect(AnalyticsEvent.GenerateClicked).toBe("trip_generate_clicked");
    expect(AnalyticsEvent.TripPlanned).toBe("trip_planned");
  });

  it("denies all when ANALYTICS_ADMIN_EMAILS is unset or empty", () => {
    const prev = process.env.ANALYTICS_ADMIN_EMAILS;
    delete process.env.ANALYTICS_ADMIN_EMAILS;
    expect(isAnalyticsAdmin("anyone@example.com")).toBe(false);
    process.env.ANALYTICS_ADMIN_EMAILS = "";
    expect(isAnalyticsAdmin("anyone@example.com")).toBe(false);
    process.env.ANALYTICS_ADMIN_EMAILS = prev;
  });

  it("restricts funnel to listed admin emails", () => {
    const prev = process.env.ANALYTICS_ADMIN_EMAILS;
    process.env.ANALYTICS_ADMIN_EMAILS = "owner@waypoint.test, co@x.com";
    expect(isAnalyticsAdmin("owner@waypoint.test")).toBe(true);
    expect(isAnalyticsAdmin("stranger@x.com")).toBe(false);
    expect(isAnalyticsAdmin(null)).toBe(false);
    process.env.ANALYTICS_ADMIN_EMAILS = prev;
  });

  it("computes signup → plan rate from auth cohort + trips", async () => {
    const now = Date.now();
    const recent = new Date(now - 2 * 86_400_000).toISOString();
    const rows = [
      {
        user_id: "a",
        event_name: AnalyticsEvent.SignupCompleted,
        created_at: recent,
      },
      {
        user_id: "b",
        event_name: AnalyticsEvent.SignupCompleted,
        created_at: recent,
      },
      {
        user_id: "a",
        event_name: AnalyticsEvent.WizardOpened,
        created_at: recent,
      },
      {
        user_id: "a",
        event_name: AnalyticsEvent.GenerateClicked,
        created_at: recent,
      },
      {
        user_id: "a",
        event_name: AnalyticsEvent.TripPlanned,
        created_at: recent,
      },
      {
        user_id: "a",
        event_name: AnalyticsEvent.TripPlanned,
        created_at: recent,
      },
    ];
    const stats = await computeSignupToPlanFunnel(
      mockSvc(rows, ["a", "a"], [
        { id: "a", created_at: recent },
        { id: "b", created_at: recent },
      ]) as never,
      30,
    );
    expect(stats.cohortSource).toBe("auth");
    expect(stats.signedUp).toBe(2);
    expect(stats.wizardOpened).toBe(1);
    expect(stats.generateClicked).toBe(1);
    expect(stats.signedUpThenPlanned).toBe(1);
    expect(stats.signupToPlanRate).toBe(0.5);
    expect(stats.secondTripUsers).toBe(1);
    expect(stats.secondTripRate).toBe(0.5);
  });

  it("falls back to signup_completed events when auth list is empty of recent users", async () => {
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const rows = [
      {
        user_id: "a",
        event_name: AnalyticsEvent.SignupCompleted,
        created_at: recent,
      },
      {
        user_id: "a",
        event_name: AnalyticsEvent.TripPlanned,
        created_at: recent,
      },
    ];
    // Auth returns no recent users → cohort from events path needs listUsers to throw
    // or return empty. Empty auth users means signedUp=0 with auth source.
    // Use a throwing listUsers via custom mock:
    const svc = mockSvc(rows, ["a"]) as never;
    (svc as { auth: { admin: { listUsers: () => Promise<unknown> } } }).auth.admin.listUsers =
      async () => {
        throw new Error("no admin");
      };
    const stats = await computeSignupToPlanFunnel(svc, 30);
    expect(stats.cohortSource).toBe("events");
    expect(stats.signedUp).toBe(1);
    expect(stats.signedUpThenPlanned).toBe(1);
  });
});
