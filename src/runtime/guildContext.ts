import { Client } from "@notionhq/client";
import type { BotSettingsParsed } from "../notion/botSettingsRepository.js";
import {
  createBootstrapClient,
  findBotSettingsByGuild,
  resolveIntegrationToken,
} from "../notion/botSettingsRepository.js";
import { createNotionRepository } from "../notion/notionRepository.js";
import type { NotionRepository } from "../notion/notionRepository.js";

function envToken(): string {
  const t = process.env.NOTION_TOKEN?.trim();
  if (!t) throw new Error("NOTION_TOKEN is not set");
  return t;
}

export type GuildContext = {
  settings: BotSettingsParsed;
  /** ギルド設定・Tasks・Projects・AI Keys 操作用 */
  dataClient: Client;
  tasksRepo: NotionRepository;
};

export async function loadGuildContext(guildId: string): Promise<GuildContext | null> {
  const bootstrap = createBootstrapClient();
  const settings = await findBotSettingsByGuild(bootstrap, guildId);
  if (!settings) return null;
  const token = resolveIntegrationToken(settings);
  const dataClient = token === envToken() ? bootstrap : new Client({ auth: token });
  const tasksRepo = createNotionRepository(
    token,
    settings.tasksDatabaseId,
    settings.projectsDatabaseId
  );
  return { settings, dataClient, tasksRepo };
}

export function repoForToken(
  settings: BotSettingsParsed,
  token: string
): NotionRepository {
  return createNotionRepository(token, settings.tasksDatabaseId, settings.projectsDatabaseId);
}
