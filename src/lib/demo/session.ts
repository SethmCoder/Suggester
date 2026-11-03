export const DEMO_COOKIE = "waypoint_demo";
export const DEMO_COOKIE_VALUE = "1";

export function isDemoCookie(value: string | undefined | null): boolean {
  return value === DEMO_COOKIE_VALUE;
}
