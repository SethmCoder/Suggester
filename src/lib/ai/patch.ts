import { z } from "zod";

export const patchOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("move"),
    activityId: z.string(),
    toDayIndex: z.number(),
    toSortOrder: z.number(),
  }),
  z.object({
    op: z.literal("delete"),
    activityId: z.string(),
  }),
  z.object({
    op: z.literal("update"),
    activityId: z.string(),
    fields: z.object({
      startTime: z.string().optional(),
      durationMinutes: z.number().optional(),
      priority: z.enum(["must_see", "preferred", "optional"]).optional(),
      planningNote: z.string().optional(),
      completed: z.boolean().optional(),
      name: z.string().optional(),
    }),
  }),
  z.object({
    op: z.literal("insert"),
    toDayIndex: z.number(),
    placeId: z.string().optional(),
    name: z.string().optional(),
    startTime: z.string(),
    durationMinutes: z.number(),
    priority: z.enum(["must_see", "preferred", "optional"]),
    planningNote: z.string().optional(),
  }),
  /** Push/pull every activity on a day by minutes (e.g. flight delay). */
  z.object({
    op: z.literal("shift_day"),
    dayIndex: z.number(),
    shiftMinutes: z.number(),
    reason: z.string().optional(),
  }),
  /** Replace one activity with another suggested place (by name when no placeId). */
  z.object({
    op: z.literal("replace"),
    activityId: z.string(),
    newName: z.string(),
    placeId: z.string().optional(),
    planningNote: z.string().optional(),
    durationMinutes: z.number().optional(),
  }),
  /** Persist OSM travel leg / end time after a reshuffle. */
  z.object({
    op: z.literal("set_travel"),
    activityId: z.string(),
    travelMinutesFromPrev: z.number(),
    endTime: z.string().optional(),
    sortOrder: z.number().optional(),
  }),
]);

export const assistantPatchSchema = z.object({
  summary: z.string(),
  operations: z.array(patchOpSchema),
  suggestions: z.array(z.string()).optional(),
});

export type AssistantPatch = z.infer<typeof assistantPatchSchema>;
export type PatchOp = z.infer<typeof patchOpSchema>;
