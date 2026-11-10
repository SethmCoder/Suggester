import { describe, expect, it, vi } from "vitest";
import { AnalyticsEvent } from "@/lib/analytics/events";
import { computeSignupToPlanFunnel } from "@/lib/analytics/funnel";
import { isAnalyticsAdmin } from "@/lib/analytics/track";

function mockSvc(rows: Array<Record<string, unknown>>, trips: string[] = []) {
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
              in() {
                return Promise.resolve({
                  data: trips.map((owner_id) => ({ owner_id })),
                });
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
        listUsers: async () => ({ data: { users: [] } }),
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

  it("allows any email when ANALYTICS_ADMIN_EMAILS is unset", () => {
    const prev = process.env.ANALYTICS_ADMIN_EMAILS;
    delete process.env.ANALYTICS_ADMIN_EMAILS;
    expect(isAnalyticsAdmin("anyone@example.com")).toBe(true);
    process.env.ANALYTICS_ADMIN_EMAILS = prev;
  });

  it("restricts funnel to listed admin emails", () => {
    const prev = process.env.ANALYTICS_ADMIN_EMAILS;
    process.env.ANALYTICS_ADMIN_EMAILS = "owner@waypoint.test, co@x.com";
    expect(isAnalyticsAdmin("owner@waypoint.test")).toBe(true);
    expect(isAnalyticsAdmin("stranger@x.com")).toBe(false);
    process.env.ANALYTICS_ADMIN_EMAILS = prev;
  });

  it("computes signup → plan rate from event rows", async () => {
    const rows = [
      {
        user_id: "a",
        event_name: AnalyticsEvent.SignupCompleted,
        created_at: "2026-11-01T10:00:00.000Z",
      },
      {
        user_id: "b",
        event_name: AnalyticsEvent.SignupCompleted,
        created_at: "2026-11-01T11:00:00.000Z",
      },
      {
        user_id: "a",
        event_name: AnalyticsEvent.WizardOpened,
        created_at: "2026-11-01T12:00:00.000Z",
      },
      {
        user_id: "a",
        event_name: AnalyticsEvent.GenerateClicked,
        created_at: "2026-11-01T12:05:00.000Z",
      },
      {
        user_id: "a",
        event_name: AnalyticsEvent.TripPlanned,
        created_at: "2026-11-01T12:10:00.000Z",
      },
    ];
    const stats = await computeSignupToPlanFunnel(
      mockSvc(rows) as never,
      30,
    );
    expect(stats.signedUp).toBe(2);
    expect(stats.wizardOpened).toBe(1);
    expect(stats.generateClicked).toBe(1);
    expect(stats.tripPlanned).toBe(1);
    expect(stats.signedUpThenPlanned).toBe(1);
    expect(stats.signupToPlanRate).toBe(0.5);
  });
});
