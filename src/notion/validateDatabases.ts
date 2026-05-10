import { Client } from "@notionhq/client";
import {
  AI_KEYS_PROPS,
  BOT_SETTINGS_PROPS,
  PROJECT_PROPS,
  TASK_PROPS,
} from "../config/notionSchema.js";

function getPropTypes(db: {
  properties: Record<string, { type: string; relation?: { database_id: string } }>;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(db.properties)) {
    out[k] = v.type;
  }
  return out;
}

function requireType(props: Record<string, string>, name: string, t: string): string | null {
  const ty = props[name];
  if (!ty) return `必須プロパティがありません: ${name}`;
  if (ty !== t) return `プロパティ ${name} の型が不正です（期待: ${t}, 実際: ${ty}）`;
  return null;
}

/** README 6.2 / 11章に基づく検証 */
export async function validateNotionSetup(
  notionToken: string,
  tasksDbId: string,
  projectsDbId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = new Client({ auth: notionToken });
  const tasksId = tasksDbId.replace(/\s+/g, "");
  const projectsId = projectsDbId.replace(/\s+/g, "");

  try {
    const tasksDb = await client.databases.retrieve({ database_id: tasksId });
    const projectsDb = await client.databases.retrieve({ database_id: projectsId });

    const taskProps = getPropTypes(tasksDb);
    const projectProps = getPropTypes(projectsDb);

    const taskChecks: (string | null)[] = [
      requireType(taskProps, TASK_PROPS.title, "title"),
      requireType(taskProps, TASK_PROPS.description, "rich_text"),
      requireType(taskProps, TASK_PROPS.status, "select"),
      requireType(taskProps, TASK_PROPS.project, "relation"),
      requireType(taskProps, TASK_PROPS.parentTask, "relation"),
      requireType(taskProps, TASK_PROPS.taskLevel, "select"),
      requireType(taskProps, TASK_PROPS.assigneeName, "rich_text"),
      requireType(taskProps, TASK_PROPS.assigneeDiscordId, "rich_text"),
      requireType(taskProps, TASK_PROPS.assigneeMention, "rich_text"),
      requireType(taskProps, TASK_PROPS.startDate, "date"),
      requireType(taskProps, TASK_PROPS.dueDate, "date"),
      requireType(taskProps, TASK_PROPS.priority, "select"),
      requireType(taskProps, TASK_PROPS.sourceType, "select"),
      requireType(taskProps, TASK_PROPS.sourceText, "rich_text"),
      requireType(taskProps, TASK_PROPS.discordGuildId, "rich_text"),
      requireType(taskProps, TASK_PROPS.discordChannelId, "rich_text"),
      requireType(taskProps, TASK_PROPS.createdBy, "rich_text"),
      requireType(taskProps, TASK_PROPS.createdAt, "date"),
      requireType(taskProps, TASK_PROPS.updatedAt, "date"),
      requireType(taskProps, TASK_PROPS.doneBy, "rich_text"),
      requireType(taskProps, TASK_PROPS.doneAt, "date"),
      requireType(taskProps, TASK_PROPS.startNotified, "checkbox"),
      requireType(taskProps, TASK_PROPS.reminded24h, "checkbox"),
      requireType(taskProps, TASK_PROPS.reminded3h, "checkbox"),
      requireType(taskProps, TASK_PROPS.reminded1h, "checkbox"),
      requireType(taskProps, TASK_PROPS.overdueNotified, "checkbox"),
    ];

    const projChecks: (string | null)[] = [
      requireType(projectProps, PROJECT_PROPS.name, "title"),
      requireType(projectProps, PROJECT_PROPS.type, "select"),
      requireType(projectProps, PROJECT_PROPS.status, "select"),
      requireType(projectProps, PROJECT_PROPS.startDate, "date"),
      requireType(projectProps, PROJECT_PROPS.endDate, "date"),
      requireType(projectProps, PROJECT_PROPS.description, "rich_text"),
      requireType(projectProps, PROJECT_PROPS.discordGuildId, "rich_text"),
      requireType(projectProps, PROJECT_PROPS.createdBy, "rich_text"),
      requireType(projectProps, PROJECT_PROPS.createdAt, "date"),
      requireType(projectProps, PROJECT_PROPS.updatedAt, "date"),
    ];

    const rel = tasksDb.properties[TASK_PROPS.project];
    if (rel && rel.type === "relation" && "database_id" in rel.relation) {
      const rid = (rel.relation as { database_id: string }).database_id.replace(/-/g, "");
      const pid = projectsId.replace(/-/g, "");
      if (rid !== pid) {
        taskChecks.push(`Tasks の ${TASK_PROPS.project} が Projects DB と一致しません`);
      }
    }

    const firstErr = [...taskChecks, ...projChecks].find(Boolean);
    if (firstErr) return { ok: false, message: firstErr };

    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `Notion API エラー: ${msg}`,
    };
  }
}

function validateBotSettingsProps(props: Record<string, string>): string | null {
  const checks: (string | null)[] = [
    requireType(props, BOT_SETTINGS_PROPS.name, "title"),
    requireType(props, BOT_SETTINGS_PROPS.discordGuildId, "rich_text"),
    requireType(props, BOT_SETTINGS_PROPS.discordGuildName, "rich_text"),
    requireType(props, BOT_SETTINGS_PROPS.notionTasksDatabaseId, "rich_text"),
    requireType(props, BOT_SETTINGS_PROPS.notionProjectsDatabaseId, "rich_text"),
    requireType(props, BOT_SETTINGS_PROPS.notionSettingsDatabaseId, "rich_text"),
    requireType(props, BOT_SETTINGS_PROPS.notionAiKeysDatabaseId, "rich_text"),
    requireType(props, BOT_SETTINGS_PROPS.notionApiKey, "rich_text"),
    requireType(props, BOT_SETTINGS_PROPS.aiEnabled, "checkbox"),
    requireType(props, BOT_SETTINGS_PROPS.timezone, "rich_text"),
    requireType(props, BOT_SETTINGS_PROPS.reminderChannelId, "rich_text"),
    requireType(props, BOT_SETTINGS_PROPS.adminRoleId, "rich_text"),
    requireType(props, BOT_SETTINGS_PROPS.dailyAiRequestLimit, "number"),
    requireType(props, BOT_SETTINGS_PROPS.dailyAiTokenLimit, "number"),
    requireType(props, BOT_SETTINGS_PROPS.createdBy, "rich_text"),
    requireType(props, BOT_SETTINGS_PROPS.createdAt, "date"),
    requireType(props, BOT_SETTINGS_PROPS.updatedAt, "date"),
  ];
  return checks.find(Boolean) ?? null;
}

function validateAiKeysProps(props: Record<string, string>): string | null {
  const checks: (string | null)[] = [
    requireType(props, AI_KEYS_PROPS.name, "title"),
    requireType(props, AI_KEYS_PROPS.discordGuildId, "rich_text"),
    requireType(props, AI_KEYS_PROPS.provider, "select"),
    requireType(props, AI_KEYS_PROPS.apiKey, "rich_text"),
    requireType(props, AI_KEYS_PROPS.priority, "number"),
    requireType(props, AI_KEYS_PROPS.status, "select"),
    requireType(props, AI_KEYS_PROPS.failureCount, "number"),
    requireType(props, AI_KEYS_PROPS.cooldownUntil, "date"),
    requireType(props, AI_KEYS_PROPS.lastUsedAt, "date"),
    requireType(props, AI_KEYS_PROPS.lastSuccessAt, "date"),
    requireType(props, AI_KEYS_PROPS.lastFailedAt, "date"),
    requireType(props, AI_KEYS_PROPS.dailyRequestLimit, "number"),
    requireType(props, AI_KEYS_PROPS.dailyTokenLimit, "number"),
    requireType(props, AI_KEYS_PROPS.todayRequestCount, "number"),
    requireType(props, AI_KEYS_PROPS.todayTokenCount, "number"),
    requireType(props, AI_KEYS_PROPS.usageDate, "date"),
    requireType(props, AI_KEYS_PROPS.createdBy, "rich_text"),
    requireType(props, AI_KEYS_PROPS.createdAt, "date"),
    requireType(props, AI_KEYS_PROPS.updatedAt, "date"),
  ];
  return checks.find(Boolean) ?? null;
}

/** 4 DB（Tasks / Projects / Bot Settings / AI Keys）の検証 */
export async function validateFourDbSetup(params: {
  notionToken: string;
  tasksDbId: string;
  projectsDbId: string;
  botSettingsDbId: string;
  aiKeysDbId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const base = await validateNotionSetup(
    params.notionToken,
    params.tasksDbId,
    params.projectsDbId
  );
  if (!base.ok) return base;

  const client = new Client({ auth: params.notionToken });
  const bsId = params.botSettingsDbId.replace(/\s+/g, "");
  const akId = params.aiKeysDbId.replace(/\s+/g, "");

  try {
    const bs = await client.databases.retrieve({ database_id: bsId });
    const ak = await client.databases.retrieve({ database_id: akId });
    const bsErr = validateBotSettingsProps(getPropTypes(bs));
    if (bsErr) return { ok: false, message: bsErr };
    const akErr = validateAiKeysProps(getPropTypes(ak));
    if (akErr) return { ok: false, message: akErr };
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Notion API エラー: ${msg}` };
  }
}
