import { EmbedBuilder } from "discord.js";

/** /help-todo 用の埋め込み（ユーザー向け日本語） */
export function buildHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Todo Bot — 使い方")
    .setDescription(
      [
        "初回は**管理者**が `/setup-notion` で Notion（Tasks / Projects / AI Keys）を接続してください。",
        "詳しいセットアップはリポジトリの **USAGE.md**、要件は **README.md** を参照してください。",
      ].join("\n")
    )
    .addFields(
      {
        name: "ドキュメント",
        value: "`/notion-api` — Notion API 公式 changelog へのリンクと、このボットの利用 API 概要",
        inline: false,
      },
      {
        name: "設定（管理者）",
        value: [
          "`/setup-notion` — Notion 3 DB 接続",
          "`/setup-timezone` `/setup-channel` `/setup-role`",
          "`/settings` `/disconnect-notion` `/delete-server-settings`",
          "`/member-map` — add / list / edit / remove（要 member_map DB）",
          "`/setup-ai-key` — add（任意 model）/ list / test / model / …",
          "`/usage` — today / month / keys",
        ].join("\n"),
        inline: false,
      },
      {
        name: "プロジェクト・イベント",
        value: [
          "`/project-create` `/event-create` `/project-list`",
          "`/project-edit` `/project-delete`（`/event-create` は Projects DB に Event 行を作成）",
        ].join("\n"),
        inline: false,
      },
      {
        name: "Todo",
        value: [
          "`/todo` — 登録（`text`、任意 `project`）",
          "`/todo-list` — 一覧（`filter` / 任意 `project` でプロジェクト・イベント別）",
          "`/todo-edit` `/todo-done` `/todo-delete`",
          "`/subtask-add` — 親番号にサブタスク",
        ].join("\n"),
        inline: false,
      }
    )
    .setFooter({ text: "このメッセージはあなただけに表示されています。" });
}
