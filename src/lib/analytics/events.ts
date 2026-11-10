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
  signedUp: number;
  wizardOpened: number;
  generateClicked: number;
  tripPlanned: number;
  /** Users who signed up in the window and later planned a trip. */
  signedUpThenPlanned: number;
  /** signedUpThenPlanned / signedUp (0–1). */
  signupToPlanRate: number;
  /** Fallback from auth.users + trips when event rows are thin. */
  fallback?: {
    usersCreated: number;
    usersWithTrip: number;
    rate: number;
  };
};
