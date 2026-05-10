import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import type { ConfirmTodoPayload } from "../types/confirmPayload.js";

export function buildTodoConfirmEmbed(
  payload: ConfirmTodoPayload,
  title: string,
  footerHint?: string
): EmbedBuilder {
  const lines: string[] = [];
  if (payload.createProject) {
    lines.push(
      `**プロジェクト作成**: ${payload.createProject.name} (${payload.createProject.type})`
    );
  }
  let n = 1;
  for (const it of payload.items) {
    lines.push(
      `${n}. ${it.title} — ${it.taskLevel} / ${it.priority}` +
        (it.dueDateIso ? `\n   期限: ${it.dueDateIso}` : "")
    );
    n += 1;
  }
  if (payload.sourceType === "ai_text") {
    lines.push("");
    lines.push(
      `原文: ${payload.sourceText.slice(0, 500)}${payload.sourceText.length > 500 ? "…" : ""}`
    );
  }
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(lines.join("\n").slice(0, 4000));
  if (footerHint?.trim()) {
    embed.setFooter({ text: footerHint.trim().slice(0, 2048) });
  }
  return embed;
}

export function confirmButtonRow(shortId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`td:${shortId}:y`)
      .setLabel("登録する")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`td:${shortId}:n`)
      .setLabel("キャンセル")
      .setStyle(ButtonStyle.Danger)
  );
}
