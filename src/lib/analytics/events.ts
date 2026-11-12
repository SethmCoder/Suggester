/** Canonical product analytics event names. */
export const AnalyticsEvent = {
  SignupCompleted: "signup_completed",
  WizardOpened: "trip_wizard_opened",
  GenerateClicked: "trip_generate_clicked",
  TripPlanned: "trip_planned",
} as const;

export type AnalyticsEventName =
  (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

export type FunnelStats = {
  days: number;
  /** Accounts created in the window (auth cohort when available). */
  signedUp: number;
  /** Honest labeling for the signup denominator. */
  cohortSource: "auth" | "events";
  wizardOpened: number;
  generateClicked: number;
  tripPlanned: number;
  /** Cohort users who planned ≥1 trip (owned trip and/or trip_planned). */
  signedUpThenPlanned: number;
  /** signedUpThenPlanned / signedUp (0–1). */
  signupToPlanRate: number;
  /** Cohort users with ≥2 owned trips and/or ≥2 trip_planned events. */
  secondTripUsers: number;
  /** secondTripUsers / signedUp (0–1). */
  secondTripRate: number;
  /** Legacy mirror of auth cohort trip conversion (kept for older clients). */
  fallback?: {
    usersCreated: number;
    usersWithTrip: number;
    rate: number;
  };
};
