import { MessageFlags, type ModalSubmitInteraction } from "discord.js";
import {
  getPendingPayload,
  updatePendingPayload,
} from "./services/pendingInteractionService.js";
import type { ConfirmTodoPayload } from "./types/confirmPayload.js";
import { buildTodoConfirmEmbed, confirmButtonRow } from "./ui/todoConfirmEmbed.js";
import {
  normalizePriorityInput,
  parseDueInput,
  readTodoEditModalFields,
} from "./ui/todoConfirmModal.js";
import { ja } from "./i18n/ja.js";

function shortIdFromModalCustomId(customId: string): string | null {
  const prefix = "tdm:";
  if (!customId.startsWith(prefix)) return null;
  const id = customId.slice(prefix.length);
  return id.length ? id : null;
}

export async function handleTodoConfirmModal(
  interaction: ModalSubmitInteraction
): Promise<boolean> {
  const shortId = shortIdFromModalCustomId(interaction.customId);
  if (!shortId) return false;

  const row = await getPendingPayload<ConfirmTodoPayload>(shortId, interaction.user.id);
  if (!row || row.kind !== "todo_confirm") {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: "確認セッションの有効期限が切れました。もう一度お試しください。",
    });
    return true;
  }

  const payload = row.payload;
  const { titlesRaw, dueRaw, priorityRaw } = readTodoEditModalFields(interaction);
  const lines = titlesRaw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (lines.length !== payload.items.length) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: ja.confirmEditLineMismatch(payload.items.length, lines.length),
    });
    return true;
  }

  if (payload.items.length === 1 && dueRaw.trim()) {
    const parsed = parseDueInput(dueRaw);
    if (!parsed) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: ja.confirmEditInvalidDue,
      });
      return true;
    }
  }

  const pri = normalizePriorityInput(priorityRaw);
  if (pri === "invalid") {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: ja.confirmEditInvalidPriority,
    });
    return true;
  }

  let nextItems = payload.items.map((it, i) => ({
    ...it,
    title: lines[i]!,
    ...(pri ? { priority: pri } : {}),
  }));

  if (payload.items.length === 1) {
    const head = nextItems[0]!;
    if (dueRaw.trim()) {
      const parsed = parseDueInput(dueRaw)!;
      nextItems = [{ ...head, dueDateIso: parsed }];
    } else {
      nextItems = [{ ...head, dueDateIso: null }];
    }
  }

  const next: ConfirmTodoPayload = {
    ...payload,
    items: nextItems,
  };

  const ok = await updatePendingPayload(shortId, interaction.user.id, next);
  if (!ok) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: "確認セッションの更新に失敗しました。",
    });
    return true;
  }

  const embed = buildTodoConfirmEmbed(next, ja.todoConfirmTitle);
  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: ja.confirmEditSaved,
  });

  const msg = interaction.message;
  if (msg?.editable) {
    await msg.edit({ embeds: [embed], components: [confirmButtonRow(shortId)] });
  }

  return true;
}
