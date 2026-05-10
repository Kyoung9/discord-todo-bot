-- ギルド単位の Notion 接続・設定（Bot Settings Notion DB の代替）
create table if not exists public.guild_settings (
  id uuid primary key default gen_random_uuid(),
  discord_guild_id text not null unique,
  guild_name text,
  notion_tasks_database_id text not null,
  notion_projects_database_id text not null,
  notion_ai_keys_database_id text not null,
  notion_api_key_encrypted text,
  ai_enabled boolean not null default false,
  timezone text not null default 'Asia/Tokyo',
  reminder_channel_id text,
  admin_role_id text,
  daily_ai_request_limit integer not null default 100,
  daily_ai_token_limit integer not null default 100000,
  created_by_discord_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_guild_settings_reminder
  on public.guild_settings (discord_guild_id)
  where reminder_channel_id is not null and length(trim(reminder_channel_id)) > 0;
