import { z } from "zod";

const taskItemSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  assigneeName: z.string().nullable().optional(),
  assigneeDiscordId: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueAt: z.string().nullable().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  subtasks: z.array(z.string()).optional(),
});

export const aiExtractSchema = z.object({
  detectedType: z.string(),
  project: z
    .object({
      name: z.string(),
      type: z.string(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  tasks: z.array(taskItemSchema).optional(),
  parentTask: z.string().nullable().optional(),
  subtasks: z.array(z.string()).optional(),
  questions: z.array(z.string()).optional(),
});

export type AiExtractResult = z.infer<typeof aiExtractSchema>;
