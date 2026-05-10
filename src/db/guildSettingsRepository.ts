import { getSupabaseAdmin } from "../lib/supabaseAdmin.js";
import { decryptGuildSecret, encryptGuildSecret } from "../lib/guildSettingsCrypto.js";
import { normalizeNotionDatabaseId } from "../lib/notionIdNormalize.js";
import type { BotSettingsParsed } from "../types/guildSettings.js";

type GuildSettingsRow = {
  id: string;
  discord_guild_id: string;
  guild_name: string | null;
  notion_tasks_database_id: string;
  notion_projects_database_id: string;
  notion_ai_keys_database_id: string;
  notion_member_map_database_id: string | null;
  notion_api_key_encrypted: string | null;
  ai_enabled: boolean;
  timezone: string;
  reminder_channel_id: string | null;
  admin_role_id: string | null;
  daily_ai_request_limit: number;
  daily_ai_token_limit: number;
  created_by_discord_user_id: string | null;
};

function rowToParsed(row: GuildSettingsRow): BotSettingsParsed {
  let notionApiKeyOverride: string | null = null;
  if (row.notion_api_key_encrypted) {
    try {
      notionApiKeyOverride = decryptGuildSecret(row.notion_api_key_encrypted);
    } catch {
      notionApiKeyOverride = null;
    }
  }
  return {
    id: row.id,
    guildId: row.discord_guild_id,
    guildName: row.guild_name,
    tasksDatabaseId: normalizeNotionDatabaseId(row.notion_tasks_database_id),
    projectsDatabaseId: normalizeNotionDatabaseId(row.notion_projects_database_id),
    aiKeysDatabaseId: normalizeNotionDatabaseId(row.notion_ai_keys_database_id),
    memberMapDatabaseId: row.notion_member_map_database_id?.trim()
      ? normalizeNotionDatabaseId(row.notion_member_map_database_id)
      : null,
    notionApiKeyOverride,
    aiEnabled: row.ai_enabled,
    timezone: row.timezone || "Asia/Tokyo",
    reminderChannelId: row.reminder_channel_id?.trim() || null,
    adminRoleId: row.admin_role_id?.trim() || null,
    dailyAiRequestLimit: row.daily_ai_request_limit ?? 100,
    dailyAiTokenLimit: row.daily_ai_token_limit ?? 100_000,
    createdBy: row.created_by_discord_user_id,
  };
}

export async function findGuildSettingsByDiscordId(
  guildId: string
): Promise<BotSettingsParsed | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("guild_settings")
    .select("*")
    .eq("discord_guild_id", guildId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToParsed(data as GuildSettingsRow);
}

export async function upsertGuildSettings(params: {
  guildId: string;
  guildName: string;
  tasksDatabaseId: string;
  projectsDatabaseId: string;
  aiKeysDatabaseId: string;
  /** 任意。undefined なら既存行の値を維持（更新時） */
  memberMapDatabaseId?: string | null;
  /** /setup-notion の api_key オプション。null なら暗号化列は空（NOTION_TOKEN を使用） */
  notionApiKeyPlain: string | null;
  createdBy: string;
}): Promise<BotSettingsParsed> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const enc =
    params.notionApiKeyPlain && params.notionApiKeyPlain.trim()
      ? encryptGuildSecret(params.notionApiKeyPlain.trim())
      : null;

  const existing = await findGuildSettingsByDiscordId(params.guildId);
  const mapId =
    params.memberMapDatabaseId === undefined
      ? existing?.memberMapDatabaseId ?? null
      : params.memberMapDatabaseId
        ? normalizeNotionDatabaseId(params.memberMapDatabaseId)
        : null;

  const baseRow = {
    guild_name: params.guildName,
    notion_tasks_database_id: normalizeNotionDatabaseId(params.tasksDatabaseId),
    notion_projects_database_id: normalizeNotionDatabaseId(params.projectsDatabaseId),
    notion_ai_keys_database_id: normalizeNotionDatabaseId(params.aiKeysDatabaseId),
    notion_member_map_database_id: mapId,
    notion_api_key_encrypted: enc,
    ai_enabled: false,
    timezone: "Asia/Tokyo",
    reminder_channel_id: null as string | null,
    admin_role_id: null as string | null,
    daily_ai_request_limit: 100,
    daily_ai_token_limit: 100_000,
    updated_at: now,
  };

  if (existing) {
    const { error } = await supabase
      .from("guild_settings")
      .update(baseRow)
      .eq("discord_guild_id", params.guildId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("guild_settings").insert({
      discord_guild_id: params.guildId,
      ...baseRow,
      created_by_discord_user_id: params.createdBy,
      created_at: now,
    });
    if (error) throw error;
  }

  const refreshed = await findGuildSettingsByDiscordId(params.guildId);
  if (!refreshed) throw new Error("Failed to load guild_settings after upsert");
  return refreshed;
}

export async function patchGuildSettings(
  guildId: string,
  patch: Partial<{
    guildName: string;
    notionApiKeyPlain: string | null;
    aiEnabled: boolean;
    timezone: string;
    reminderChannelId: string | null;
    adminRoleId: string | null;
    dailyAiRequestLimit: number;
    dailyAiTokenLimit: number;
    tasksDatabaseId: string;
    projectsDatabaseId: string;
    aiKeysDatabaseId: string;
    memberMapDatabaseId: string | null;
  }>
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.guildName !== undefined) row.guild_name = patch.guildName;
  if (patch.notionApiKeyPlain !== undefined) {
    row.notion_api_key_encrypted =
      patch.notionApiKeyPlain && patch.notionApiKeyPlain.trim()
        ? encryptGuildSecret(patch.notionApiKeyPlain.trim())
        : null;
  }
  if (patch.aiEnabled !== undefined) row.ai_enabled = patch.aiEnabled;
  if (patch.timezone !== undefined) row.timezone = patch.timezone;
  if (patch.reminderChannelId !== undefined) {
    row.reminder_channel_id = patch.reminderChannelId?.trim() || null;
  }
  if (patch.adminRoleId !== undefined) {
    row.admin_role_id = patch.adminRoleId?.trim() || null;
  }
  if (patch.dailyAiRequestLimit !== undefined) {
    row.daily_ai_request_limit = patch.dailyAiRequestLimit;
  }
  if (patch.dailyAiTokenLimit !== undefined) {
    row.daily_ai_token_limit = patch.dailyAiTokenLimit;
  }
  if (patch.tasksDatabaseId !== undefined) {
    row.notion_tasks_database_id = normalizeNotionDatabaseId(patch.tasksDatabaseId);
  }
  if (patch.projectsDatabaseId !== undefined) {
    row.notion_projects_database_id = normalizeNotionDatabaseId(patch.projectsDatabaseId);
  }
  if (patch.aiKeysDatabaseId !== undefined) {
    row.notion_ai_keys_database_id = normalizeNotionDatabaseId(patch.aiKeysDatabaseId);
  }
  if (patch.memberMapDatabaseId !== undefined) {
    row.notion_member_map_database_id =
      patch.memberMapDatabaseId && patch.memberMapDatabaseId.trim()
        ? normalizeNotionDatabaseId(patch.memberMapDatabaseId)
        : null;
  }
  const { error } = await supabase.from("guild_settings").update(row).eq("discord_guild_id", guildId);
  if (error) throw error;
}

export async function deleteGuildSettings(guildId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("guild_settings").delete().eq("discord_guild_id", guildId);
  if (error) throw error;
}

/** リマインダー用: 通知チャンネルが設定されたギルド */
export async function listGuildSettingsForReminders(): Promise<BotSettingsParsed[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("guild_settings")
    .select("*")
    .not("reminder_channel_id", "is", null);
  if (error) throw error;
  const rows = (data ?? []) as GuildSettingsRow[];
  return rows
    .filter((r) => (r.reminder_channel_id?.trim() ?? "").length > 0)
    .map(rowToParsed);
}
