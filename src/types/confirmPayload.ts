/** Notion登録確認ボタン用ペイロード */

export type ConfirmTodoItem = {
  title: string;
  description?: string | null;
  projectPageId?: string | null;
  parentTaskPageId?: string | null;
  taskLevel: "Single" | "Parent" | "Subtask";
  priority: "High" | "Medium" | "Low";
  startDateIso?: string | null;
  dueDateIso?: string | null;
  /** Notion Assignee Name / Discord ID / メンション文字列 */
  assigneeName?: string | null;
  assigneeDiscordId?: string | null;
  assigneeMention?: string | null;
};

export type ConfirmProjectSpec = {
  name: string;
  type: string;
  startDateIso?: string | null;
  endDateIso?: string | null;
};

export type ConfirmTodoPayload = {
  version: 1;
  guildId: string;
  channelId: string;
  userId: string;
  sourceText: string;
  sourceType: "manual" | "ai_text";
  items: ConfirmTodoItem[];
  createProject?: ConfirmProjectSpec | null;
};
