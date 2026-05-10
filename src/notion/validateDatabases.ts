import { Client } from "@notionhq/client";
import { AI_KEYS_PROPS, MEMBER_MAP_PROPS, PROJECT_PROPS, TASK_PROPS } from "../config/notionSchema.js";
import {
  isValidNotionDatabaseId,
  normalizeNotionDatabaseId,
} from "../lib/notionIdNormalize.js";

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
  const tasksId = normalizeNotionDatabaseId(tasksDbId);
  const projectsId = normalizeNotionDatabaseId(projectsDbId);
  if (!isValidNotionDatabaseId(tasksId)) {
    return {
      ok: false,
      message:
        "Tasks Database ID の形式が不正です。32 桁の ID、または Notion の DB ページ URL（?view= 付きでも可）を入力してください。",
    };
  }
  if (!isValidNotionDatabaseId(projectsId)) {
    return {
      ok: false,
      message:
        "Projects Database ID の形式が不正です。32 桁の ID、または Notion の DB ページ URLを入力してください。",
    };
  }

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

function validateMemberMapProps(props: Record<string, string>): string | null {
  const checks: (string | null)[] = [
    requireType(props, MEMBER_MAP_PROPS.name, "title"),
    requireType(props, MEMBER_MAP_PROPS.discordUserId, "rich_text"),
    requireType(props, MEMBER_MAP_PROPS.discordGuildId, "rich_text"),
  ];
  const aliasesTy = props[MEMBER_MAP_PROPS.aliases];
  if (aliasesTy !== undefined && aliasesTy !== "rich_text") {
    return `プロパティ ${MEMBER_MAP_PROPS.aliases} の型が不正です（期待: rich_text, 実際: ${aliasesTy}）`;
  }
  return checks.find(Boolean) ?? null;
}

/** メンバー映射 DB のスキーマ検証（Integration が DB に接続済みであること） */
export async function validateMemberMapDatabase(
  notionToken: string,
  memberMapDbId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = new Client({ auth: notionToken });
  const id = normalizeNotionDatabaseId(memberMapDbId);
  if (!isValidNotionDatabaseId(id)) {
    return {
      ok: false,
      message:
        "Member Map Database ID の形式が不正です。32 桁の ID、または Notion の DB ページ URLを入力してください。",
    };
  }
  try {
    const db = await client.databases.retrieve({ database_id: id });
    const err = validateMemberMapProps(getPropTypes(db));
    if (err) return { ok: false, message: err };
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Notion API エラー: ${msg}` };
  }
}

function validateAiKeysProps(props: Record<string, string>): string | null {
  const modelTy = props[AI_KEYS_PROPS.model];
  if (modelTy !== undefined && modelTy !== "rich_text") {
    return `プロパティ ${AI_KEYS_PROPS.model} の型が不正です（期待: rich_text, 実際: ${modelTy}）`;
  }
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

/** Tasks / Projects / AI Keys の 3 DB 検証（ギルド設定は Supabase）。任意でメンバー映射 DB も検証 */
export async function validateThreeDbSetup(params: {
  notionToken: string;
  tasksDbId: string;
  projectsDbId: string;
  aiKeysDbId: string;
  memberMapDatabaseId?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const base = await validateNotionSetup(
    params.notionToken,
    params.tasksDbId,
    params.projectsDbId
  );
  if (!base.ok) return base;

  const client = new Client({ auth: params.notionToken });
  const akId = normalizeNotionDatabaseId(params.aiKeysDbId);
  if (!isValidNotionDatabaseId(akId)) {
    return {
      ok: false,
      message:
        "AI Keys Database ID の形式が不正です。32 桁の ID、または Notion の DB ページ URLを入力してください。",
    };
  }

  try {
    const ak = await client.databases.retrieve({ database_id: akId });
    const akErr = validateAiKeysProps(getPropTypes(ak));
    if (akErr) return { ok: false, message: akErr };

    const mapRaw = params.memberMapDatabaseId?.trim();
    if (mapRaw) {
      const mapCheck = await validateMemberMapDatabase(params.notionToken, mapRaw);
      if (!mapCheck.ok) return mapCheck;
    }

    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Notion API エラー: ${msg}` };
  }
}
