import type { ChatInputCommandInteraction, GuildMember } from "discord.js";

export type AssigneeTriple = {
  assigneeName: string;
  assigneeDiscordId: string;
  assigneeMention: string;
};

/** 先頭のユーザーメンションを取り出す（<@id> / <@!id>） */
export function extractFirstUserMentionId(text: string): { id: string; rest: string } | null {
  const m = text.match(/<@!?(\d{17,20})>/);
  if (!m?.[1]) return null;
  const id = m[1];
  const rest = text.replace(m[0], "").replace(/\s+/g, " ").trim();
  return { id, rest };
}

/** 出現順ですべてのユーザーメンション ID を列挙（重複は除外） */
export function extractAllUserMentionIdsInOrder(text: string): string[] {
  const re = /<@!?(\d{17,20})>/g;
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = m[1];
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * 手動 /todo: メンションがあればそのユーザー（複数可）、なければ実行者を担当にする。
 * Notion には Assignee Name / Discord ID はカンマ区切り、Mention はスペース区切りで保存する。
 * タイトルは全メンションを除いた文言。
 */
export async function resolveTodoAssigneeForManual(
  interaction: ChatInputCommandInteraction,
  rawText: string
): Promise<{ title: string; assignee: AssigneeTriple }> {
  const ids =
    interaction.guild ? extractAllUserMentionIdsInOrder(rawText) : ([] as string[]);
  if (ids.length > 0 && interaction.guild) {
    const names: string[] = [];
    for (const id of ids) {
      const member = await interaction.guild.members.fetch(id).catch(() => null);
      names.push(
        member?.displayName ??
          member?.user.globalName ??
          member?.user.username ??
          "User"
      );
    }
    const stripped = rawText.replace(/<@!?\d{17,20}>/g, "").replace(/\s+/g, " ").trim();
    const title = stripped.length > 0 ? stripped : rawText;
    return {
      title,
      assignee: {
        assigneeName: names.join(", "),
        assigneeDiscordId: ids.join(","),
        assigneeMention: ids.map((id) => `<@${id}>`).join(" "),
      },
    };
  }

  const uid = interaction.user.id;
  let name = interaction.user.globalName ?? interaction.user.username;
  if (
    interaction.member &&
    typeof interaction.member !== "string" &&
    "displayName" in interaction.member
  ) {
    name = (interaction.member as GuildMember).displayName || name;
  } else if (interaction.guild) {
    const m = await interaction.guild.members.fetch(uid).catch(() => null);
    if (m) name = m.displayName || m.user.username;
  }

  return {
    title: rawText,
    assignee: {
      assigneeName: name,
      assigneeDiscordId: uid,
      assigneeMention: `<@${uid}>`,
    },
  };
}
