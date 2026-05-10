-- Notion メンバー映射 DB（任意）。NULL なら名前→Discord ID 解決をスキップ
alter table public.guild_settings
  add column if not exists notion_member_map_database_id text null;
