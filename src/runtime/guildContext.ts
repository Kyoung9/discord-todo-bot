import { Client } from "@notionhq/client";
import { findGuildSettingsByDiscordId } from "../db/guildSettingsRepository.js";
import type { BotSettingsParsed } from "../types/guildSettings.js";
import { tryResolveIntegrationToken } from "../notion/notionTokens.js";
import { createNotionRepository } from "../notion/notionRepository.js";
import type { NotionRepository } from "../notion/notionRepository.js";

export type GuildContext = {
  settings: BotSettingsParsed;
  /** ギルド設定・Tasks・Projects・AI Keys 操作用 Notion クライアント */
  dataClient: Client;
  tasksRepo: NotionRepository;
};

export type GuildContextLoad =
  | { ok: true; ctx: GuildContext }
  | { ok: false; reason: "no_settings" | "notion_token_missing" };

export async function loadGuildContext(guildId: string): Promise<GuildContextLoad> {
  const settings = await findGuildSettingsByDiscordId(guildId);
  if (!settings) return { ok: false, reason: "no_settings" };
  const token = tryResolveIntegrationToken(settings);
  if (!token) return { ok: false, reason: "notion_token_missing" };
  const dataClient = new Client({ auth: token });
  const tasksRepo = createNotionRepository(
    token,
    settings.tasksDatabaseId,
    settings.projectsDatabaseId
  );
  return { ok: true, ctx: { settings, dataClient, tasksRepo } };
}

export function repoForToken(settings: BotSettingsParsed, token: string): NotionRepository {
  return createNotionRepository(token, settings.tasksDatabaseId, settings.projectsDatabaseId);
}
