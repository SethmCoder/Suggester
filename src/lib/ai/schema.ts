import { z } from "zod";

export const itineraryActivitySchema = z.object({
  placeId: z.string(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().min(15).max(480),
  priority: z.enum(["must_see", "preferred", "optional"]),
  planningNote: z.string().max(400).optional(),
});

export const itineraryDaySchema = z.object({
  dayIndex: z.number().int().min(0),
  activities: z.array(itineraryActivitySchema),
});

export const itineraryGenerationSchema = z.object({
  days: z.array(itineraryDaySchema).min(1),
  warnings: z.array(z.string()).optional(),
});

export type ItineraryGeneration = z.infer<typeof itineraryGenerationSchema>;
