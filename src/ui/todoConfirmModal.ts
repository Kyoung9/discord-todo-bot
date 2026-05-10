import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { ConfirmTodoPayload } from "../types/confirmPayload.js";
import { ja } from "../i18n/ja.js";

const FIELD_TITLES = "tdm_titles";
const FIELD_DUE = "tdm_due";
const FIELD_PRIORITY = "tdm_priority";

export function todoConfirmModalCustomId(shortId: string): string {
  return `tdm:${shortId}`;
}

export function buildTodoEditModal(shortId: string, payload: ConfirmTodoPayload): ModalBuilder {
  const titlesValue = payload.items.map((it) => it.title).join("\n").slice(0, 3900);
  const dueValue =
    payload.items.length === 1
      ? (payload.items[0]?.dueDateIso?.slice(0, 10) ?? "")
      : "";
  const priValue = payload.items.length ? (payload.items[0]?.priority ?? "Medium") : "Medium";

  const titlesInput = new TextInputBuilder()
    .setCustomId(FIELD_TITLES)
    .setLabel("Todo（1行1件・改行で複数）")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(3900)
    .setValue(titlesValue);

  const dueInput = new TextInputBuilder()
    .setCustomId(FIELD_DUE)
    .setLabel("期限 YYYY-MM-DD（1件のときのみ）")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(80)
    .setValue(dueValue);

  const priInput = new TextInputBuilder()
    .setCustomId(FIELD_PRIORITY)
    .setLabel("優先度 High / Medium / Low（空=変更なし）")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(20)
    .setValue(payload.items.length === 1 ? priValue : "");

  return new ModalBuilder()
    .setCustomId(todoConfirmModalCustomId(shortId))
    .setTitle(ja.modalTodoEditTitle.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(titlesInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(dueInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(priInput)
    );
}

export function readTodoEditModalFields(interaction: {
  fields: { getTextInputValue: (id: string) => string };
}): { titlesRaw: string; dueRaw: string; priorityRaw: string } {
  return {
    titlesRaw: interaction.fields.getTextInputValue(FIELD_TITLES),
    dueRaw: interaction.fields.getTextInputValue(FIELD_DUE),
    priorityRaw: interaction.fields.getTextInputValue(FIELD_PRIORITY),
  };
}

/** YYYY-MM-DD またはパース可能な日時 → ISO 文字列 */
export function parseDueInput(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T23:59:59.000Z`;
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

export function normalizePriorityInput(
  raw: string
): "High" | "Medium" | "Low" | null | "invalid" {
  const s = raw.trim();
  if (!s) return null;
  const u = s.toLowerCase();
  if (u === "high" || u === "高") return "High";
  if (u === "medium" || u === "中") return "Medium";
  if (u === "low" || u === "低") return "Low";
  return "invalid";
}
