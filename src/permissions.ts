import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  type GuildMember,
} from "discord.js";
import { loadGuildContext } from "./runtime/guildContext.js";

/** 管理者: Discord 管理者 または Bot Settings の管理ロール */
export async function isGuildAdmin(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const perms = interaction.memberPermissions;
  if (perms?.has(PermissionFlagsBits.Administrator)) return true;

  const guildId = interaction.guildId;
  if (!guildId) return false;

  const ctx = await loadGuildContext(guildId);
  const roleId = ctx?.settings.adminRoleId;
  if (!roleId) return false;

  const member = interaction.member;
  if (!member || !("roles" in member)) return false;
  return (member as GuildMember).roles.cache.has(roleId);
}

export function isGuildAdminSync(member: GuildMember, adminRoleId: string | null): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (adminRoleId && member.roles.cache.has(adminRoleId)) return true;
  return false;
}
