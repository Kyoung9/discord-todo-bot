import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName("help-todo")
    .setDescription("使い方・主要コマンド一覧を表示"),

  new SlashCommandBuilder()
    .setName("setup-notion")
    .setDescription("Notion Tasks / Projects / AI Keys を接続（管理者・ギルド設定は Supabase）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName("tasks_database_id").setDescription("Tasks DB の ID").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("projects_database_id").setDescription("Projects DB の ID").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("ai_keys_database_id").setDescription("AI Keys DB の ID").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("api_key")
        .setDescription("省略時は環境変数 NOTION_TOKEN を使用")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("setup-timezone")
    .setDescription("タイムゾーンを設定（管理者）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName("timezone").setDescription("例: Asia/Tokyo").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setup-channel")
    .setDescription("リマインダー通知チャンネル（管理者）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((o) =>
      o.setName("channel").setDescription("通知を送るチャンネル").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setup-role")
    .setDescription("管理者ロール（管理者）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((o) =>
      o.setName("role").setDescription("Bot 管理用ロール").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("サーバー設定の概要（管理者）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("disconnect-notion")
    .setDescription("Notion 連携を解除（AIキー行を削除し Bot Settings をアーカイブ）（管理者）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("delete-server-settings")
    .setDescription("サーバー設定を削除（管理者）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("setup-ai-key")
    .setDescription("AI API キー管理（管理者）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription("キーを追加")
        .addStringOption((o) =>
          o
            .setName("provider")
            .setDescription("プロバイダ")
            .setRequired(true)
            .addChoices(
              { name: "openai", value: "openai" },
              { name: "google (Gemini)", value: "google" },
              { name: "anthropic", value: "anthropic" }
            )
        )
        .addStringOption((o) =>
          o.setName("key_name").setDescription("キー名（一意）").setRequired(true)
        )
        .addStringOption((o) => o.setName("api_key").setDescription("API Key").setRequired(true))
        .addIntegerOption((o) =>
          o.setName("priority").setDescription("優先度（小さいほど先）").setRequired(true)
        )
    )
    .addSubcommand((sc) => sc.setName("list").setDescription("キー一覧"))
    .addSubcommand((sc) =>
      sc
        .setName("test")
        .setDescription("キーをテスト")
        .addStringOption((o) =>
          o.setName("key_name").setDescription("キー名").setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("disable")
        .setDescription("キーを無効化")
        .addStringOption((o) =>
          o.setName("key_name").setDescription("キー名").setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("remove")
        .setDescription("キーを削除")
        .addStringOption((o) =>
          o.setName("key_name").setDescription("キー名").setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("priority")
        .setDescription("優先度を変更")
        .addStringOption((o) =>
          o.setName("key_name").setDescription("キー名").setRequired(true)
        )
        .addIntegerOption((o) =>
          o.setName("value").setDescription("新しい優先度").setRequired(true)
        )
    ),

  new SlashCommandBuilder()
    .setName("project-create")
    .setDescription("プロジェクトを作成")
    .addStringOption((o) => o.setName("name").setDescription("名前").setRequired(true))
    .addStringOption((o) =>
      o.setName("start").setDescription("開始日 YYYY-MM-DD").setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("end").setDescription("終了日 YYYY-MM-DD").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("event-create")
    .setDescription("イベントを作成")
    .addStringOption((o) => o.setName("name").setDescription("名前").setRequired(true))
    .addStringOption((o) =>
      o.setName("start").setDescription("開始日 YYYY-MM-DD").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("end").setDescription("終了日 YYYY-MM-DD").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("project-list")
    .setDescription("プロジェクト／イベント一覧"),

  new SlashCommandBuilder()
    .setName("project-tasks")
    .setDescription("プロジェクト別の Todo")
    .addStringOption((o) =>
      o.setName("project").setDescription("プロジェクト名").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("project-edit")
    .setDescription("プロジェクトを編集（管理者）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) => o.setName("name").setDescription("対象名").setRequired(true))
    .addStringOption((o) => o.setName("new_name").setDescription("新しい名前").setRequired(false))
    .addStringOption((o) => o.setName("status").setDescription("ステータス").setRequired(false))
    .addStringOption((o) => o.setName("start").setDescription("開始日").setRequired(false))
    .addStringOption((o) => o.setName("end").setDescription("終了日").setRequired(false)),

  new SlashCommandBuilder()
    .setName("project-delete")
    .setDescription("プロジェクトを削除（アーカイブ）（管理者）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) => o.setName("name").setDescription("名前").setRequired(true)),

  new SlashCommandBuilder()
    .setName("todo")
    .setDescription("Todo を登録")
    .addStringOption((o) => o.setName("text").setDescription("内容").setRequired(true))
    .addStringOption((o) =>
      o.setName("project").setDescription("プロジェクト名（任意）").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("todo-list")
    .setDescription("Todo 一覧")
    .addStringOption((o) =>
      o
        .setName("filter")
        .setDescription("フィルタ")
        .setRequired(false)
        .addChoices(
          { name: "自分", value: "mine" },
          { name: "今日", value: "today" },
          { name: "期限超過", value: "overdue" },
          { name: "進行中", value: "doing" }
        )
    ),

  new SlashCommandBuilder()
    .setName("todo-edit")
    .setDescription("Todo を編集")
    .addIntegerOption((o) =>
      o.setName("id").setDescription("/todo-list の番号").setRequired(true)
    )
    .addStringOption((o) => o.setName("title").setDescription("新しいタイトル").setRequired(false))
    .addStringOption((o) =>
      o.setName("priority").setDescription("優先度").setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("start").setDescription("開始日 ISO").setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("due").setDescription("期限 ISO").setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("project").setDescription("プロジェクト名").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("todo-done")
    .setDescription("Todo を完了")
    .addIntegerOption((o) =>
      o.setName("id").setDescription("/todo-list の番号").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("todo-delete")
    .setDescription("Todo を削除／キャンセル")
    .addIntegerOption((o) =>
      o.setName("id").setDescription("/todo-list の番号").setRequired(true)
    )
    .addBooleanOption((o) =>
      o
        .setName("hard")
        .setDescription("管理者: Notion ページをアーカイブ").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("subtask-add")
    .setDescription("サブタスクを追加")
    .addIntegerOption((o) =>
      o.setName("parent").setDescription("親 /todo-list 番号").setRequired(true)
    )
    .addStringOption((o) => o.setName("title").setDescription("タイトル").setRequired(true)),

  new SlashCommandBuilder()
    .setName("usage")
    .setDescription("AI 使用量（管理者）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sc) => sc.setName("today").setDescription("今日"))
    .addSubcommand((sc) => sc.setName("month").setDescription("今月"))
    .addSubcommand((sc) => sc.setName("keys").setDescription("キー別サマリ")),
].map((c) => c.toJSON());
