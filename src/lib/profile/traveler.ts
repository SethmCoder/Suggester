export const INTRO_COOKIE = "waypoint_intro";
export const TRAVELER_STORAGE_KEY = "waypoint:traveler";

export type TravelerAnswer = { question: string; answer: string };

export type TravelerProfile = {
  completed: boolean;
  age?: string;
  dream?: string;
  answers: TravelerAnswer[];
};

export const emptyTraveler = (): TravelerProfile => ({
  completed: false,
  answers: [],
});
