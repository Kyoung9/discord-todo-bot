import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { BOT_SETTINGS_PROPS } from "../config/notionSchema.js";
import {
  readCheckbox,
  readDateStart,
  readNumber,
  readRichText,
  readTitle,
} from "./pagePropRead.js";

export type BotSettingsParsed = {
  pageId: string;
  guildId: string;
  guildName: string | null;
  tasksDatabaseId: string;
  projectsDatabaseId: string;
  settingsDatabaseId: string | null;
  aiKeysDatabaseId: string;
  notionApiKeyOverride: string | null;
  aiEnabled: boolean;
  timezone: string;
  reminderChannelId: string | null;
  adminRoleId: string | null;
  dailyAiRequestLimit: number;
  dailyAiTokenLimit: number;
  createdBy: string | null;
};

function bootstrapDatabaseId(): string {
  const id = process.env.NOTION_BOT_SETTINGS_DATABASE_ID?.replace(/\s+/g, "");
  if (!id) throw new Error("NOTION_BOT_SETTINGS_DATABASE_ID is not set");
  return id;
}

function envToken(): string {
  const t = process.env.NOTION_TOKEN?.trim();
  if (!t) throw new Error("NOTION_TOKEN is not set");
  return t;
}

export function createBootstrapClient(): Client {
  return new Client({ auth: envToken() });
}

/** ギルド行用のトークン（行に上書きがあればそれを優先） */
export function resolveIntegrationToken(settings: BotSettingsParsed): string {
  const o = settings.notionApiKeyOverride?.trim();
  if (o) return o;
  return envToken();
}

function parseSettingsPage(page: PageObjectResponse): BotSettingsParsed | null {
  const gid = readRichText(page, BOT_SETTINGS_PROPS.discordGuildId);
  if (!gid) return null;
  const tasks = readRichText(page, BOT_SETTINGS_PROPS.notionTasksDatabaseId);
  const projects = readRichText(page, BOT_SETTINGS_PROPS.notionProjectsDatabaseId);
  const aiKeys = readRichText(page, BOT_SETTINGS_PROPS.notionAiKeysDatabaseId);
  if (!tasks || !projects || !aiKeys) return null;

  return {
    pageId: page.id,
    guildId: gid,
    guildName: readRichText(page, BOT_SETTINGS_PROPS.discordGuildName),
    tasksDatabaseId: tasks.replace(/\s+/g, ""),
    projectsDatabaseId: projects.replace(/\s+/g, ""),
    settingsDatabaseId: readRichText(page, BOT_SETTINGS_PROPS.notionSettingsDatabaseId)?.replace(
      /\s+/g,
      ""
    ) ?? null,
    aiKeysDatabaseId: aiKeys.replace(/\s+/g, ""),
    notionApiKeyOverride: readRichText(page, BOT_SETTINGS_PROPS.notionApiKey),
    aiEnabled: readCheckbox(page, BOT_SETTINGS_PROPS.aiEnabled),
    timezone: readRichText(page, BOT_SETTINGS_PROPS.timezone) ?? "Asia/Tokyo",
    reminderChannelId: readRichText(page, BOT_SETTINGS_PROPS.reminderChannelId),
    adminRoleId: readRichText(page, BOT_SETTINGS_PROPS.adminRoleId),
    dailyAiRequestLimit: readNumber(page, BOT_SETTINGS_PROPS.dailyAiRequestLimit) ?? 100,
    dailyAiTokenLimit: readNumber(page, BOT_SETTINGS_PROPS.dailyAiTokenLimit) ?? 100_000,
    createdBy: readRichText(page, BOT_SETTINGS_PROPS.createdBy),
  };
}

export async function findBotSettingsByGuild(
  client: Client,
  guildId: string
): Promise<BotSettingsParsed | null> {
  const dbId = bootstrapDatabaseId();
  const res = await client.databases.query({
    database_id: dbId,
    filter: {
      property: BOT_SETTINGS_PROPS.discordGuildId,
      rich_text: { equals: guildId },
    },
  });
  for (const r of res.results) {
    if (!("properties" in r) || !("object" in r) || r.object !== "page") continue;
    const p = parseSettingsPage(r as PageObjectResponse);
    if (p) return p;
  }
  return null;
}

export async function upsertBotSettingsPage(params: {
  client: Client;
  guildId: string;
  guildName: string;
  tasksDatabaseId: string;
  projectsDatabaseId: string;
  aiKeysDatabaseId: string;
  settingsDatabaseId?: string | null;
  notionApiKey?: string | null;
  createdBy: string;
}): Promise<BotSettingsParsed> {
  const dbId = bootstrapDatabaseId();
  const existing = await findBotSettingsByGuild(params.client, params.guildId);
  const now = new Date().toISOString();
  const settingsDbId = params.settingsDatabaseId?.trim() || bootstrapDatabaseId();

  const props = {
    [BOT_SETTINGS_PROPS.name]: {
      title: [{ type: "text" as const, text: { content: params.guildName.slice(0, 2000) } }],
    },
    [BOT_SETTINGS_PROPS.discordGuildId]: {
      rich_text: [{ type: "text" as const, text: { content: params.guildId } }],
    },
    [BOT_SETTINGS_PROPS.discordGuildName]: {
      rich_text: [{ type: "text" as const, text: { content: params.guildName.slice(0, 2000) } }],
    },
    [BOT_SETTINGS_PROPS.notionTasksDatabaseId]: {
      rich_text: [{ type: "text" as const, text: { content: params.tasksDatabaseId } }],
    },
    [BOT_SETTINGS_PROPS.notionProjectsDatabaseId]: {
      rich_text: [{ type: "text" as const, text: { content: params.projectsDatabaseId } }],
    },
    [BOT_SETTINGS_PROPS.notionAiKeysDatabaseId]: {
      rich_text: [{ type: "text" as const, text: { content: params.aiKeysDatabaseId } }],
    },
    [BOT_SETTINGS_PROPS.notionSettingsDatabaseId]: {
      rich_text: [{ type: "text" as const, text: { content: settingsDbId } }],
    },
    [BOT_SETTINGS_PROPS.notionApiKey]: params.notionApiKey
      ? {
          rich_text: [
            { type: "text" as const, text: { content: params.notionApiKey.slice(0, 2000) } },
          ],
        }
      : { rich_text: [] },
    [BOT_SETTINGS_PROPS.aiEnabled]: { checkbox: false },
    [BOT_SETTINGS_PROPS.timezone]: {
      rich_text: [{ type: "text" as const, text: { content: "Asia/Tokyo" } }],
    },
    [BOT_SETTINGS_PROPS.reminderChannelId]: { rich_text: [] },
    [BOT_SETTINGS_PROPS.adminRoleId]: { rich_text: [] },
    [BOT_SETTINGS_PROPS.dailyAiRequestLimit]: { number: 100 },
    [BOT_SETTINGS_PROPS.dailyAiTokenLimit]: { number: 100_000 },
    [BOT_SETTINGS_PROPS.createdBy]: {
      rich_text: [{ type: "text" as const, text: { content: params.createdBy } }],
    },
    [BOT_SETTINGS_PROPS.createdAt]: { date: { start: now } },
    [BOT_SETTINGS_PROPS.updatedAt]: { date: { start: now } },
  };

  if (existing) {
    await params.client.pages.update({
      page_id: existing.pageId,
      properties: props as never,
    });
    const refreshed = await findBotSettingsByGuild(params.client, params.guildId);
    if (!refreshed) throw new Error("Failed to refresh settings");
    return refreshed;
  }

  const created = await params.client.pages.create({
    parent: { database_id: dbId },
    properties: props as never,
  });
  const p = await params.client.pages.retrieve({ page_id: created.id });
  if (!("properties" in p)) throw new Error("Invalid page");
  const parsed = parseSettingsPage(p as PageObjectResponse);
  if (!parsed) throw new Error("Failed to parse new settings");
  return parsed;
}

export async function patchBotSettingsPage(
  client: Client,
  pageId: string,
  patch: Partial<{
    guildName: string;
    notionApiKey: string | null;
    aiEnabled: boolean;
    timezone: string;
    reminderChannelId: string | null;
    adminRoleId: string | null;
    dailyAiRequestLimit: number;
    dailyAiTokenLimit: number;
    tasksDatabaseId: string;
    projectsDatabaseId: string;
    aiKeysDatabaseId: string;
  }>
): Promise<void> {
  const now = new Date().toISOString();
  const props: Record<string, unknown> = {
    [BOT_SETTINGS_PROPS.updatedAt]: { date: { start: now } },
  };
  if (patch.guildName !== undefined) {
    props[BOT_SETTINGS_PROPS.name] = {
      title: [{ type: "text", text: { content: patch.guildName.slice(0, 2000) } }],
    };
    props[BOT_SETTINGS_PROPS.discordGuildName] = {
      rich_text: [{ type: "text", text: { content: patch.guildName.slice(0, 2000) } }],
    };
  }
  if (patch.notionApiKey !== undefined) {
    props[BOT_SETTINGS_PROPS.notionApiKey] = patch.notionApiKey
      ? { rich_text: [{ type: "text", text: { content: patch.notionApiKey.slice(0, 2000) } }] }
      : { rich_text: [] };
  }
  if (patch.aiEnabled !== undefined) props[BOT_SETTINGS_PROPS.aiEnabled] = { checkbox: patch.aiEnabled };
  if (patch.timezone !== undefined) {
    props[BOT_SETTINGS_PROPS.timezone] = {
      rich_text: [{ type: "text", text: { content: patch.timezone.slice(0, 200) } }],
    };
  }
  if (patch.reminderChannelId !== undefined) {
    props[BOT_SETTINGS_PROPS.reminderChannelId] = patch.reminderChannelId
      ? { rich_text: [{ type: "text", text: { content: patch.reminderChannelId } }] }
      : { rich_text: [] };
  }
  if (patch.adminRoleId !== undefined) {
    props[BOT_SETTINGS_PROPS.adminRoleId] = patch.adminRoleId
      ? { rich_text: [{ type: "text", text: { content: patch.adminRoleId } }] }
      : { rich_text: [] };
  }
  if (patch.dailyAiRequestLimit !== undefined) {
    props[BOT_SETTINGS_PROPS.dailyAiRequestLimit] = { number: patch.dailyAiRequestLimit };
  }
  if (patch.dailyAiTokenLimit !== undefined) {
    props[BOT_SETTINGS_PROPS.dailyAiTokenLimit] = { number: patch.dailyAiTokenLimit };
  }
  if (patch.tasksDatabaseId !== undefined) {
    props[BOT_SETTINGS_PROPS.notionTasksDatabaseId] = {
      rich_text: [{ type: "text", text: { content: patch.tasksDatabaseId } }],
    };
  }
  if (patch.projectsDatabaseId !== undefined) {
    props[BOT_SETTINGS_PROPS.notionProjectsDatabaseId] = {
      rich_text: [{ type: "text", text: { content: patch.projectsDatabaseId } }],
    };
  }
  if (patch.aiKeysDatabaseId !== undefined) {
    props[BOT_SETTINGS_PROPS.notionAiKeysDatabaseId] = {
      rich_text: [{ type: "text", text: { content: patch.aiKeysDatabaseId } }],
    };
  }
  await client.pages.update({ page_id: pageId, properties: props as never });
}

export async function archivePage(client: Client, pageId: string): Promise<void> {
  await client.pages.update({ page_id: pageId, archived: true });
}

/** リマインダー用: Bot Settings DB の全行 */
export async function listAllBotSettings(client: Client): Promise<BotSettingsParsed[]> {
  const dbId = bootstrapDatabaseId();
  const out: BotSettingsParsed[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.databases.query({
      database_id: dbId,
      start_cursor: cursor,
    });
    for (const r of res.results) {
      if (!("properties" in r) || !("object" in r) || r.object !== "page") continue;
      const p = parseSettingsPage(r as PageObjectResponse);
      if (p) out.push(p);
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}
