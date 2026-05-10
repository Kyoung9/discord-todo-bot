import type {
  CreatePageParameters,
  UpdatePageParameters,
} from "@notionhq/client/build/src/api-endpoints.js";
import { PROJECT_PROPS, TASK_PROPS } from "../config/notionSchema.js";
import type { ProjectStatus, ProjectType, SourceType, TaskLevel, TaskPriority, TaskStatus } from "../config/notionSchema.js";

export function titleProp(content: string): CreatePageParameters["properties"][string] {
  return {
    title: [{ type: "text", text: { content: content.slice(0, 2000) } }],
  };
}

export function richText(content: string | null | undefined): CreatePageParameters["properties"][string] {
  if (!content) return { rich_text: [] };
  return {
    rich_text: [{ type: "text", text: { content: content.slice(0, 2000) } }],
  };
}

export function selectName(name: string): CreatePageParameters["properties"][string] {
  return { select: { name } };
}

export function dateOnly(iso: string | null | undefined): CreatePageParameters["properties"][string] {
  if (!iso) return { date: null };
  return { date: { start: iso } };
}

export function dateWithOptionalTime(
  iso: string | null | undefined
): CreatePageParameters["properties"][string] {
  if (!iso) return { date: null };
  return { date: { start: iso } };
}

export function checkbox(v: boolean): CreatePageParameters["properties"][string] {
  return { checkbox: v };
}

export function relation(ids: string[]): CreatePageParameters["properties"][string] {
  return { relation: ids.map((id) => ({ id })) };
}

export type TaskCreateInput = {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  taskLevel?: TaskLevel;
  projectPageId?: string | null;
  parentTaskPageId?: string | null;
  assigneeName?: string | null;
  assigneeDiscordId?: string | null;
  assigneeMention?: string | null;
  startDateIso?: string | null;
  dueDateIso?: string | null;
  priority?: TaskPriority;
  sourceType?: SourceType;
  sourceText?: string | null;
  guildId: string;
  channelId: string;
  createdByUserId: string;
};

export function buildTaskProperties(input: TaskCreateInput): CreatePageParameters["properties"] {
  const now = new Date().toISOString();
  const p: Record<string, unknown> = {
    [TASK_PROPS.title]: titleProp(input.title),
    [TASK_PROPS.description]: richText(input.description ?? null),
    [TASK_PROPS.status]: selectName(input.status ?? "Todo"),
    [TASK_PROPS.taskLevel]: selectName(input.taskLevel ?? "Single"),
    [TASK_PROPS.assigneeName]: richText(input.assigneeName ?? null),
    [TASK_PROPS.assigneeDiscordId]: richText(input.assigneeDiscordId ?? null),
    [TASK_PROPS.assigneeMention]: richText(input.assigneeMention ?? null),
    [TASK_PROPS.startDate]: dateWithOptionalTime(input.startDateIso ?? null),
    [TASK_PROPS.dueDate]: dateWithOptionalTime(input.dueDateIso ?? null),
    [TASK_PROPS.priority]: selectName(input.priority ?? "Medium"),
    [TASK_PROPS.sourceType]: selectName(input.sourceType ?? "manual"),
    [TASK_PROPS.sourceText]: richText(input.sourceText ?? null),
    [TASK_PROPS.discordGuildId]: richText(input.guildId),
    [TASK_PROPS.discordChannelId]: richText(input.channelId),
    [TASK_PROPS.createdBy]: richText(input.createdByUserId),
    [TASK_PROPS.createdAt]: { date: { start: now } },
    [TASK_PROPS.updatedAt]: { date: { start: now } },
    [TASK_PROPS.doneBy]: richText(null),
    [TASK_PROPS.doneAt]: { date: null },
    [TASK_PROPS.startNotified]: checkbox(false),
    [TASK_PROPS.reminded24h]: checkbox(false),
    [TASK_PROPS.reminded3h]: checkbox(false),
    [TASK_PROPS.reminded1h]: checkbox(false),
    [TASK_PROPS.overdueNotified]: checkbox(false),
  };

  if (input.projectPageId) {
    p[TASK_PROPS.project] = relation([input.projectPageId]);
  }
  if (input.parentTaskPageId) {
    p[TASK_PROPS.parentTask] = relation([input.parentTaskPageId]);
  }

  return p as CreatePageParameters["properties"];
}

export type ProjectCreateInput = {
  name: string;
  type: ProjectType;
  status?: ProjectStatus;
  startDateIso?: string | null;
  endDateIso?: string | null;
  description?: string | null;
  guildId: string;
  createdByUserId: string;
};

export function buildProjectProperties(input: ProjectCreateInput): CreatePageParameters["properties"] {
  const now = new Date().toISOString();
  return {
    [PROJECT_PROPS.name]: titleProp(input.name),
    [PROJECT_PROPS.type]: selectName(input.type),
    [PROJECT_PROPS.status]: selectName(input.status ?? "Active"),
    [PROJECT_PROPS.startDate]: dateOnly(input.startDateIso ?? null),
    [PROJECT_PROPS.endDate]: dateOnly(input.endDateIso ?? null),
    [PROJECT_PROPS.description]: richText(input.description ?? null),
    [PROJECT_PROPS.discordGuildId]: richText(input.guildId),
    [PROJECT_PROPS.createdBy]: richText(input.createdByUserId),
    [PROJECT_PROPS.createdAt]: { date: { start: now } },
    [PROJECT_PROPS.updatedAt]: { date: { start: now } },
  } as CreatePageParameters["properties"];
}

export function patchTaskUpdatedAt(): UpdatePageParameters["properties"] {
  return {
    [TASK_PROPS.updatedAt]: { date: { start: new Date().toISOString() } },
  };
}
