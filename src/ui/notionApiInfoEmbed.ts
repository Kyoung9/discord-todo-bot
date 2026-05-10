import { EmbedBuilder } from "discord.js";

/** /notion-api — 公式 changelog への導線と、このボットの Notion 利用範囲（概要） */
export function buildNotionApiInfoEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Notion API — 更新情報とこのボットの利用範囲")
    .setDescription(
      [
        "API の**追加・変更・廃止**は Notion 公式の changelog / reference を参照してください（ボット側に差分リストは保持しません）。",
        "",
        "• [API Changelog](https://developers.notion.com/page/changelog)",
        "• [API Reference](https://developers.notion.com/reference/intro)",
      ].join("\n")
    )
    .addFields(
      {
        name: "このボットが触る Notion の主なもの",
        value: [
          "`databases.retrieve` — 接続時のスキーマ検証",
          "`databases.query` — Tasks / Projects / AI Keys / メンバー映射 の読み取り",
          "`pages.create` — タスク・プロジェクト・AI キー行の作成",
          "`pages.update` — プロパティ更新・アーカイブ",
        ].join("\n"),
        inline: false,
      },
      {
        name: "プロパティ名・DB 種別",
        value:
          "`src/config/notionSchema.ts` の `TASK_PROPS` / `PROJECT_PROPS` / `AI_KEYS_PROPS` / `MEMBER_MAP_PROPS` を参照してください。",
        inline: false,
      }
    )
    .setFooter({ text: "Integration Secret は /setup-notion の api_key または環境変数 NOTION_TOKEN（フォールバック）。" });
}
