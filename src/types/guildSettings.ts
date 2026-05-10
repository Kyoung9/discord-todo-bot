/** Supabase guild_settings 行に対応（Notion Bot Settings ページの代替） */
export type BotSettingsParsed = {
  id: string;
  guildId: string;
  guildName: string | null;
  tasksDatabaseId: string;
  projectsDatabaseId: string;
  aiKeysDatabaseId: string;
  /** Notion メンバー映射 DB（未設定時は null） */
  memberMapDatabaseId: string | null;
  /** 復号済み Notion Integration Secret（行に無ければ null） */
  notionApiKeyOverride: string | null;
  aiEnabled: boolean;
  timezone: string;
  reminderChannelId: string | null;
  adminRoleId: string | null;
  dailyAiRequestLimit: number;
  dailyAiTokenLimit: number;
  createdBy: string | null;
};
