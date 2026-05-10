import type { ButtonInteraction } from "discord.js";
import { executeConfirmTodoPayload } from "./notion/confirmExecutor.js";
import {
  deletePending,
  getPendingPayload,
} from "./services/pendingInteractionService.js";
import type { ConfirmTodoPayload } from "./types/confirmPayload.js";
import { loadGuildContext } from "./runtime/guildContext.js";
import { ja } from "./i18n/ja.js";

export async function handleTodoConfirmButton(
  interaction: ButtonInteraction
): Promise<boolean> {
  if (!interaction.customId.startsWith("td:")) return false;
  const parts = interaction.customId.split(":");
  if (parts.length !== 3) return false;
  const [, shortId, action] = parts;
  if (action !== "y" && action !== "n") return false;

  const row = await getPendingPayload<ConfirmTodoPayload>(
    shortId,
    interaction.user.id
  );
  if (!row || row.kind !== "todo_confirm") {
    await interaction.reply({
      ephemeral: true,
      content: "確認セッションの有効期限が切れました。もう一度お試しください。",
    });
    return true;
  }

  if (action === "n") {
    await deletePending(shortId);
    await interaction.update({
      content: "キャンセルしました。",
      embeds: [],
      components: [],
    });
    return true;
  }

  await interaction.deferUpdate();
  const payload = row.payload;
  const ctx = await loadGuildContext(payload.guildId);
  if (!ctx) {
    await interaction.editReply({
      content: ja.notionNotConnected,
      embeds: [],
      components: [],
    });
    return true;
  }

  try {
    const { createdTaskIds } = await executeConfirmTodoPayload(ctx.tasksRepo, payload);
    await deletePending(shortId);
    await interaction.editReply({
      content: ja.registered(createdTaskIds.length),
      embeds: [],
      components: [],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await interaction.editReply({
      content: ja.notionSaveFail(msg.slice(0, 500)),
      embeds: [],
      components: [],
    });
  }
  return true;
}
