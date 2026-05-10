import type { BotSettingsParsed } from "../types/guildSettings.js";

export function envNotionToken(): string {
  const t = process.env.NOTION_TOKEN?.trim();
  if (!t) throw new Error("NOTION_TOKEN is not set");
  return t;
}

/**
 * ギルド上書きまたは環境変数から Notion Integration トークンを得る。
 * どちらも無ければ null（throw しない）。
 */
export function tryResolveIntegrationToken(settings: BotSettingsParsed): string | null {
  const o = settings.notionApiKeyOverride?.trim();
  if (o) return o;
  const t = process.env.NOTION_TOKEN?.trim();
  return t || null;
}

/** ギルド行の上書きトークンがあれば優先、なければ環境変数 NOTION_TOKEN（無ければ throw） */
export function resolveIntegrationToken(settings: BotSettingsParsed): string {
  const t = tryResolveIntegrationToken(settings);
  if (!t) throw new Error("NOTION_TOKEN is not set");
  return t;
}
