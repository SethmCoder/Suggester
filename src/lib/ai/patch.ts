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
    }),
  }),
  z.object({
    op: z.literal("insert"),
    toDayIndex: z.number(),
    placeId: z.string(),
    startTime: z.string(),
    durationMinutes: z.number(),
    priority: z.enum(["must_see", "preferred", "optional"]),
  }),
]);

export const assistantPatchSchema = z.object({
  summary: z.string(),
  operations: z.array(patchOpSchema),
});

export type AssistantPatch = z.infer<typeof assistantPatchSchema>;
