/**
 * README 11.1 / 11.2 및 Bot Settings / AI Keys DB のプロパティ名
 */

export const PROJECT_PROPS = {
  name: "Name",
  type: "Type",
  status: "Status",
  startDate: "Start Date",
  endDate: "End Date",
  description: "Description",
  discordGuildId: "Discord Guild ID",
  createdBy: "Created By",
  createdAt: "Created At",
  updatedAt: "Updated At",
} as const;

export const TASK_PROPS = {
  title: "Title",
  description: "Description",
  status: "Status",
  project: "Project",
  parentTask: "Parent Task",
  taskLevel: "Task Level",
  assigneeName: "Assignee Name",
  assigneeDiscordId: "Assignee Discord ID",
  assigneeMention: "Assignee Mention",
  startDate: "Start Date",
  dueDate: "Due Date",
  priority: "Priority",
  sourceType: "Source Type",
  sourceText: "Source Text",
  discordGuildId: "Discord Guild ID",
  discordChannelId: "Discord Channel ID",
  createdBy: "Created By",
  createdAt: "Created At",
  updatedAt: "Updated At",
  doneBy: "Done By",
  doneAt: "Done At",
  startNotified: "Start Notified",
  reminded24h: "Reminded 24h",
  reminded3h: "Reminded 3h",
  reminded1h: "Reminded 1h",
  overdueNotified: "Overdue Notified",
} as const;

/** Bot Settings DB（管理者用） */
export const BOT_SETTINGS_PROPS = {
  name: "Name",
  discordGuildId: "Discord Guild ID",
  discordGuildName: "Discord Guild Name",
  notionTasksDatabaseId: "Notion Tasks Database ID",
  notionProjectsDatabaseId: "Notion Projects Database ID",
  notionSettingsDatabaseId: "Notion Settings Database ID",
  notionAiKeysDatabaseId: "Notion AI Keys Database ID",
  notionApiKey: "Notion API Key",
  aiEnabled: "AI Enabled",
  timezone: "Timezone",
  reminderChannelId: "Reminder Channel ID",
  adminRoleId: "Admin Role ID",
  dailyAiRequestLimit: "Daily AI Request Limit",
  dailyAiTokenLimit: "Daily AI Token Limit",
  createdBy: "Created By",
  createdAt: "Created At",
  updatedAt: "Updated At",
} as const;

/** Discord メンバー → User ID 映射（任意 DB） */
export const MEMBER_MAP_PROPS = {
  name: "Name",
  discordUserId: "Discord User ID",
  discordGuildId: "Discord Guild ID",
  aliases: "Aliases",
} as const;

/** AI Keys DB */
export const AI_KEYS_PROPS = {
  name: "Name",
  discordGuildId: "Discord Guild ID",
  provider: "Provider",
  apiKey: "API Key",
  /** 任意 rich_text — プロバイダごとのモデル ID（未設定時は環境変数・コードデフォルト） */
  model: "Model",
  priority: "Priority",
  status: "Status",
  failureCount: "Failure Count",
  cooldownUntil: "Cooldown Until",
  lastUsedAt: "Last Used At",
  lastSuccessAt: "Last Success At",
  lastFailedAt: "Last Failed At",
  dailyRequestLimit: "Daily Request Limit",
  dailyTokenLimit: "Daily Token Limit",
  todayRequestCount: "Today Request Count",
  todayTokenCount: "Today Token Count",
  usageDate: "Usage Date",
  createdBy: "Created By",
  createdAt: "Created At",
  updatedAt: "Updated At",
} as const;

export type ProjectType =
  | "Project"
  | "Event"
  | "Competition"
  | "Presentation"
  | "Assignment"
  | "Research"
  | "Other";

export type ProjectStatus = "Planning" | "Active" | "Done" | "Canceled";

export type TaskStatus = "Todo" | "Doing" | "Review" | "Done" | "Canceled";

export type TaskLevel = "Single" | "Parent" | "Subtask";

export type TaskPriority = "High" | "Medium" | "Low";

export type SourceType = "manual" | "ai_text";

export type LlmProvider = "openai" | "google" | "anthropic";
