import {
  type ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  inlineCode,
} from "discord.js";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { validateThreeDbSetup } from "./notion/validateDatabases.js";
import {
  deleteGuildSettings,
  patchGuildSettings,
  upsertGuildSettings,
} from "./db/guildSettingsRepository.js";
import {
  createAiKeyPage,
  deleteAiKeyPage,
  findAiKeyByName,
  updateAiKeyLlmModel,
  listAiKeysForGuild,
  pickNextAiKey,
  updateAiKeyPriority,
  updateAiKeyStatus,
} from "./notion/aiKeysRepository.js";
import { isGuildAdmin } from "./permissions.js";
import {
  assertGuildAiBudgetCtx,
  getMonthUsageAggregatesCtx,
  getTodayUsageSummaryCtx,
} from "./services/usageService.js";
import { callLlmExtract } from "./services/llmExtractService.js";
import {
  buildConfirmPayloadFromAi,
  buildSimpleConfirmPayload,
} from "./services/todoConfirmBuilder.js";
import { createPendingPayload } from "./services/pendingInteractionService.js";
import { buildTodoConfirmEmbed, confirmButtonRow } from "./ui/todoConfirmEmbed.js";
import { buildHelpEmbed } from "./ui/helpEmbed.js";
import { buildNotionApiInfoEmbed } from "./ui/notionApiInfoEmbed.js";
import {
  saveOrderedTaskIds,
  resolveTaskPageIdByDisplayIndex,
} from "./services/taskListCacheService.js";
import { logTaskAction } from "./services/taskActionLogService.js";
import { formatRangeLabel } from "./lib/timezone.js";
import type { TaskRow } from "./notion/notionRepository.js";
import { loadGuildContext, type GuildContext } from "./runtime/guildContext.js";
import { ja } from "./i18n/ja.js";
import { formatCaughtError } from "./lib/formatCaughtError.js";
import { resolveTodoAssigneeForManual } from "./lib/discordAssignee.js";
import {
  archiveMemberMapPage,
  createMemberMapPage,
  findMemberMapPageIdForUser,
  invalidateMemberMapCache,
  listMemberMapEntries,
  normalizeAliasesInput,
  updateMemberMapPage,
} from "./notion/memberMapRepository.js";

function adminOnlyMessage(): string {
  return ja.adminOnly;
}

async function requireGuildContext(
  interaction: ChatInputCommandInteraction
): Promise<GuildContext | null> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.guildOnly });
    return null;
  }
  const loaded = await loadGuildContext(guildId);
  if (!loaded.ok) {
    const content =
      loaded.reason === "no_settings" ? ja.notionNotConnected : ja.notionCredentialMissing;
    await interaction.reply({ flags: MessageFlags.Ephemeral, content });
    return null;
  }
  return loaded.ctx;
}

function filterTasks(
  rows: TaskRow[],
  filter: string | null,
  userId: string,
  timeZone: string
): TaskRow[] {
  if (!filter) return rows;
  const now = new Date();
  if (filter === "mine") {
    return rows.filter((r) => {
      const raw = r.assigneeDiscordId?.trim();
      if (!raw) return false;
      const ids = raw.split(",").map((x) => x.trim()).filter(Boolean);
      return ids.includes(userId);
    });
  }
  if (filter === "doing") {
    return rows.filter((r) => r.status === "Doing");
  }
  if (filter === "overdue") {
    return rows.filter((r) => {
      if (!r.dueDate) return false;
      const d = r.dueDate.includes("T") ? new Date(r.dueDate) : new Date(`${r.dueDate}T23:59:59`);
      return d.getTime() < now.getTime();
    });
  }
  if (filter === "today") {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    return rows.filter((r) => {
      if (!r.dueDate) return false;
      const d = r.dueDate.includes("T")
        ? new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(r.dueDate))
        : r.dueDate.slice(0, 10);
      return d === today;
    });
  }
  return rows;
}

async function testProviderPing(
  provider: string,
  apiKey: string,
  modelOverride?: string | null
): Promise<void> {
  const p = provider.toLowerCase();
  if (p === "openai") {
    const o = new OpenAI({ apiKey });
    const model =
      modelOverride?.trim() || process.env.OPENAI_MODEL || "gpt-4o-mini";
    await o.chat.completions.create({
      model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 5,
    });
    return;
  }
  if (p === "google") {
    const gen = new GoogleGenerativeAI(apiKey);
    const model =
      modelOverride?.trim() || process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const m = gen.getGenerativeModel({ model });
    await m.generateContent("ping");
    return;
  }
  if (p === "anthropic") {
    const a = new Anthropic({ apiKey });
    const model =
      modelOverride?.trim() || process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";
    await a.messages.create({
      model,
      max_tokens: 8,
      messages: [{ role: "user", content: "ping" }],
    });
    return;
  }
  throw new Error(`unknown provider: ${provider}`);
}

export async function handleChatInputCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  try {
    if (interaction.commandName === "help-todo") {
      await interaction.reply({ embeds: [buildHelpEmbed()], flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.commandName === "notion-api") {
      await interaction.reply({
        embeds: [buildNotionApiInfoEmbed()],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.guildOnly });
      return;
    }

    switch (interaction.commandName) {
      case "setup-notion": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: adminOnlyMessage() });
          return;
        }
        const apiKeyOpt = interaction.options.getString("api_key");
        const apiKey = (apiKeyOpt?.trim() || process.env.NOTION_TOKEN?.trim() || "").trim();
        if (!apiKey) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.notionTokenMissing });
          return;
        }
        const tasksDb = interaction.options.getString("tasks_database_id", true);
        const projectsDb = interaction.options.getString("projects_database_id", true);
        const aiKeysDb = interaction.options.getString("ai_keys_database_id", true);
        const memberMapOpt = interaction.options.getString("member_map_database_id");
        const memberMapTrim = memberMapOpt?.trim() || null;
        const v = await validateThreeDbSetup({
          notionToken: apiKey,
          tasksDbId: tasksDb,
          projectsDbId: projectsDb,
          aiKeysDbId: aiKeysDb,
          memberMapDatabaseId: memberMapTrim,
        });
        if (!v.ok) {
          await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: ja.notionSetupFail(v.message),
          });
          return;
        }
        const gname = interaction.guild?.name ?? guildId;
        const prev = await loadGuildContext(guildId);
        await upsertGuildSettings({
          guildId,
          guildName: gname,
          tasksDatabaseId: tasksDb,
          projectsDatabaseId: projectsDb,
          aiKeysDatabaseId: aiKeysDb,
          memberMapDatabaseId: memberMapTrim === null ? undefined : memberMapTrim,
          notionApiKeyPlain: apiKeyOpt?.trim() || null,
          createdBy: interaction.user.id,
        });
        if (prev.ok && prev.ctx.settings.memberMapDatabaseId) {
          invalidateMemberMapCache(prev.ctx.settings.memberMapDatabaseId, guildId);
        }
        if (memberMapTrim) invalidateMemberMapCache(memberMapTrim, guildId);
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.notionSetupOk });
        return;
      }

      case "setup-timezone": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const tz = interaction.options.getString("timezone", true);
        await patchGuildSettings(guildId, { timezone: tz });
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.timezoneSet(inlineCode(tz)) });
        return;
      }

      case "setup-channel": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const ch = interaction.options.getChannel("channel", true);
        await patchGuildSettings(guildId, { reminderChannelId: ch.id });
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.channelSet(ch.id) });
        return;
      }

      case "setup-role": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const role = interaction.options.getRole("role", true);
        await patchGuildSettings(guildId, { adminRoleId: role.id });
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.roleSet(role.id) });
        return;
      }

      case "settings": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const s = ctx.settings;
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: ja.settingsSummary([
            `Notion: 接続済み`,
            `メンバー映射 DB: ${s.memberMapDatabaseId ? "接続済み" : "未設定"}`,
            `Timezone: ${s.timezone}`,
            `通知: ${s.reminderChannelId ? `<#${s.reminderChannelId}>` : "未設定"}`,
            `管理ロール: ${s.adminRoleId ? `<@&${s.adminRoleId}>` : "未設定"}`,
            `AI: ${s.aiEnabled ? "ON" : "OFF"}`,
            `AI 1日上限: リクエスト ${s.dailyAiRequestLimit} / トークン ${s.dailyAiTokenLimit}`,
          ]),
        });
        return;
      }

      case "disconnect-notion": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const keys = await listAiKeysForGuild(
          ctx.dataClient,
          ctx.settings.aiKeysDatabaseId,
          guildId
        );
        for (const k of keys) await deleteAiKeyPage(ctx.dataClient, k.pageId);
        await deleteGuildSettings(guildId);
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.disconnectOk });
        return;
      }

      case "delete-server-settings": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: adminOnlyMessage() });
          return;
        }
        const loaded = await loadGuildContext(guildId);
        if (loaded.ok) {
          const ctx = loaded.ctx;
          const keys = await listAiKeysForGuild(
            ctx.dataClient,
            ctx.settings.aiKeysDatabaseId,
            guildId
          );
          for (const k of keys) await deleteAiKeyPage(ctx.dataClient, k.pageId);
          await deleteGuildSettings(guildId);
        }
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.deleteAllOk });
        return;
      }

      case "setup-ai-key": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const sub = interaction.options.getSubcommand(true);
        if (sub === "add") {
          const provider = interaction.options.getString("provider", true);
          const keyName = interaction.options.getString("key_name", true);
          const apiKey = interaction.options.getString("api_key", true);
          const priority = interaction.options.getInteger("priority", true);
          const llmModel = interaction.options.getString("model");
          const existing = await findAiKeyByName(
            ctx.dataClient,
            ctx.settings.aiKeysDatabaseId,
            guildId,
            keyName
          );
          if (existing) await deleteAiKeyPage(ctx.dataClient, existing.pageId);
          try {
            await createAiKeyPage({
              client: ctx.dataClient,
              aiKeysDatabaseId: ctx.settings.aiKeysDatabaseId,
              guildId,
              keyName,
              provider,
              apiKey,
              llmModel: llmModel?.trim() || null,
              priority,
              createdBy: interaction.user.id,
              timezone: ctx.settings.timezone,
            });
          } catch (e: unknown) {
            const msg = formatCaughtError(e);
            await interaction.reply({
              flags: MessageFlags.Ephemeral,
              content: ja.aiKeySaveMaybeModelProp(msg.slice(0, 400)),
            });
            return;
          }
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.aiKeySaved });
          return;
        }
        if (sub === "list") {
          const keys = await listAiKeysForGuild(
            ctx.dataClient,
            ctx.settings.aiKeysDatabaseId,
            guildId
          );
          const lines = keys.map(
            (k, i) =>
              `${i + 1}. ${k.keyName}\n   Provider: ${k.provider}\n   Model: ${k.llmModel ?? ja.aiKeyModelDefaultLabel}\n   Priority: ${k.priority}\n   Status: ${k.status}`
          );
          await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: lines.length ? lines.join("\n\n") : ja.aiKeyListEmpty,
          });
          return;
        }
        if (sub === "disable") {
          const keyName = interaction.options.getString("key_name", true);
          const row = await findAiKeyByName(
            ctx.dataClient,
            ctx.settings.aiKeysDatabaseId,
            guildId,
            keyName
          );
          if (!row) {
            await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.aiKeyNotFound });
            return;
          }
          await updateAiKeyStatus(ctx.dataClient, row.pageId, "disabled");
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.aiKeyDisabled });
          return;
        }
        if (sub === "remove") {
          const keyName = interaction.options.getString("key_name", true);
          const row = await findAiKeyByName(
            ctx.dataClient,
            ctx.settings.aiKeysDatabaseId,
            guildId,
            keyName
          );
          if (!row) {
            await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.aiKeyNotFound });
            return;
          }
          await deleteAiKeyPage(ctx.dataClient, row.pageId);
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.aiKeyRemoved });
          return;
        }
        if (sub === "priority") {
          const keyName = interaction.options.getString("key_name", true);
          const value = interaction.options.getInteger("value", true);
          const row = await findAiKeyByName(
            ctx.dataClient,
            ctx.settings.aiKeysDatabaseId,
            guildId,
            keyName
          );
          if (!row) {
            await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.aiKeyNotFound });
            return;
          }
          await updateAiKeyPriority(ctx.dataClient, row.pageId, value);
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.aiKeyPriorityOk });
          return;
        }
        if (sub === "model") {
          const keyName = interaction.options.getString("key_name", true);
          const modelRaw = interaction.options.getString("model");
          const row = await findAiKeyByName(
            ctx.dataClient,
            ctx.settings.aiKeysDatabaseId,
            guildId,
            keyName
          );
          if (!row) {
            await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.aiKeyNotFound });
            return;
          }
          try {
            await updateAiKeyLlmModel(
              ctx.dataClient,
              row.pageId,
              modelRaw?.trim() ? modelRaw.trim() : null
            );
          } catch (e: unknown) {
            const msg = formatCaughtError(e);
            await interaction.reply({
              flags: MessageFlags.Ephemeral,
              content: ja.aiKeySaveMaybeModelProp(msg.slice(0, 400)),
            });
            return;
          }
          await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: modelRaw?.trim() ? ja.aiKeyModelOk(modelRaw.trim()) : ja.aiKeyModelCleared,
          });
          return;
        }
        if (sub === "test") {
          const keyName = interaction.options.getString("key_name", true);
          const row = await findAiKeyByName(
            ctx.dataClient,
            ctx.settings.aiKeysDatabaseId,
            guildId,
            keyName
          );
          if (!row) {
            await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.aiKeyNotFound });
            return;
          }
          try {
            await testProviderPing(row.provider, row.apiKeyPlain, row.llmModel);
            await interaction.reply({
              flags: MessageFlags.Ephemeral,
              content: ja.aiTestOk(String(row.provider)),
            });
          } catch (e: unknown) {
            const msg = formatCaughtError(e);
            await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.aiTestFail(msg.slice(0, 300)) });
          }
          return;
        }
        return;
      }

      case "member-map": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const mapId = ctx.settings.memberMapDatabaseId;
        if (!mapId) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.memberMapNoDb });
          return;
        }
        const sub = interaction.options.getSubcommand(true);
        if (sub === "list") {
          try {
            const rows = await listMemberMapEntries(ctx.dataClient, mapId, guildId);
            if (rows.length === 0) {
              await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.memberMapListEmpty });
              return;
            }
            const body = rows
              .map((r) =>
                ja.memberMapListLine(
                  r.displayName,
                  r.discordUserId,
                  r.aliases ?? ja.memberMapNoAliases
                )
              )
              .join("\n\n")
              .slice(0, 3500);
            await interaction.reply({ flags: MessageFlags.Ephemeral, content: body });
          } catch (e: unknown) {
            await interaction.reply({
              flags: MessageFlags.Ephemeral,
              content: ja.error(formatCaughtError(e).slice(0, 400)),
            });
          }
          return;
        }
        if (sub === "add") {
          const user = interaction.options.getUser("user", true);
          const nameOpt = interaction.options.getString("display_name")?.trim();
          const aliasesRaw = interaction.options.getString("aliases");
          const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
          const displayName =
            nameOpt ||
            member?.displayName ||
            user.globalName ||
            user.username;
          const aliases = normalizeAliasesInput(aliasesRaw);
          try {
            const existing = await findMemberMapPageIdForUser(
              ctx.dataClient,
              mapId,
              guildId,
              user.id
            );
            if (existing) {
              await interaction.reply({
                flags: MessageFlags.Ephemeral,
                content: ja.memberMapExists(user.id),
              });
              return;
            }
            await createMemberMapPage({
              client: ctx.dataClient,
              mapDatabaseId: mapId,
              guildId,
              discordUserId: user.id,
              displayName,
              aliases,
            });
            await interaction.reply({
              flags: MessageFlags.Ephemeral,
              content: ja.memberMapAdded(displayName, aliases),
            });
          } catch (e: unknown) {
            await interaction.reply({
              flags: MessageFlags.Ephemeral,
              content: ja.error(formatCaughtError(e).slice(0, 400)),
            });
          }
          return;
        }
        if (sub === "edit") {
          const user = interaction.options.getUser("user", true);
          const nameOpt = interaction.options.getString("display_name");
          const aliasesRaw = interaction.options.getString("aliases");
          const clearAliases = interaction.options.getBoolean("clear_aliases") === true;
          const hasName = Boolean(nameOpt?.trim());
          const hasAliases = Boolean(aliasesRaw?.trim());
          if (!hasName && !hasAliases && !clearAliases) {
            await interaction.reply({
              flags: MessageFlags.Ephemeral,
              content: ja.memberMapEditNothing,
            });
            return;
          }
          try {
            const pageId = await findMemberMapPageIdForUser(
              ctx.dataClient,
              mapId,
              guildId,
              user.id
            );
            if (!pageId) {
              await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.memberMapNotFound });
              return;
            }
            await updateMemberMapPage({
              client: ctx.dataClient,
              mapDatabaseId: mapId,
              guildId,
              pageId,
              displayName: hasName ? nameOpt!.trim() : undefined,
              aliases: clearAliases ? null : hasAliases ? normalizeAliasesInput(aliasesRaw) : undefined,
            });
            await interaction.reply({
              flags: MessageFlags.Ephemeral,
              content: ja.memberMapUpdated,
            });
          } catch (e: unknown) {
            await interaction.reply({
              flags: MessageFlags.Ephemeral,
              content: ja.error(formatCaughtError(e).slice(0, 400)),
            });
          }
          return;
        }
        if (sub === "remove") {
          const user = interaction.options.getUser("user", true);
          try {
            const pageId = await findMemberMapPageIdForUser(
              ctx.dataClient,
              mapId,
              guildId,
              user.id
            );
            if (!pageId) {
              await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.memberMapNotFound });
              return;
            }
            await archiveMemberMapPage({
              client: ctx.dataClient,
              mapDatabaseId: mapId,
              guildId,
              pageId,
            });
            await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.memberMapRemoved });
          } catch (e: unknown) {
            await interaction.reply({
              flags: MessageFlags.Ephemeral,
              content: ja.error(formatCaughtError(e).slice(0, 400)),
            });
          }
          return;
        }
        return;
      }

      case "project-create": {
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const name = interaction.options.getString("name", true);
        const start = interaction.options.getString("start");
        const end = interaction.options.getString("end");
        await ctx.tasksRepo.createProject({
          name,
          type: "Project",
          startDateIso: start ?? null,
          endDateIso: end ?? null,
          guildId,
          createdByUserId: interaction.user.id,
        });
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.projectCreated(name) });
        return;
      }

      case "event-create": {
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const name = interaction.options.getString("name", true);
        const start = interaction.options.getString("start", true);
        const end = interaction.options.getString("end", true);
        await ctx.tasksRepo.createProject({
          name,
          type: "Event",
          startDateIso: start,
          endDateIso: end,
          guildId,
          createdByUserId: interaction.user.id,
        });
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.eventCreated(name) });
        return;
      }

      case "project-list": {
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const list = await ctx.tasksRepo.queryProjects(guildId);
        const body = list
          .map((p) => `・ ${p.title} (${p.type ?? "?"})`)
          .join("\n")
          .slice(0, 3500);
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: body.length ? body : ja.projectListEmpty,
        });
        return;
      }

      case "project-edit": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const name = interaction.options.getString("name", true);
        const proj = await ctx.tasksRepo.queryProjectByName(guildId, name);
        if (!proj) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.projectNotFound });
          return;
        }
        const newName = interaction.options.getString("new_name");
        const status = interaction.options.getString("status");
        const start = interaction.options.getString("start");
        const end = interaction.options.getString("end");
        await ctx.tasksRepo.updateProjectFields(proj.pageId, {
          name: newName ?? undefined,
          status: status ?? undefined,
          startDateIso: start === null ? undefined : start ?? undefined,
          endDateIso: end === null ? undefined : end ?? undefined,
        });
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.projectUpdated });
        return;
      }

      case "project-delete": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const name = interaction.options.getString("name", true);
        const proj = await ctx.tasksRepo.queryProjectByName(guildId, name);
        if (!proj) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.projectNotFound });
          return;
        }
        await ctx.tasksRepo.archivePage(proj.pageId);
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.projectArchived });
        return;
      }

      case "todo": {
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const text = interaction.options.getString("text", true);
        const projectName = interaction.options.getString("project");
        let projectPageId: string | null = null;
        if (projectName) {
          const p = await ctx.tasksRepo.queryProjectByName(guildId, projectName);
          projectPageId = p?.pageId ?? null;
        }

        const manualResolved = await resolveTodoAssigneeForManual(interaction, text);
        let payload = buildSimpleConfirmPayload({
          guildId,
          channelId: interaction.channelId ?? "",
          userId: interaction.user.id,
          title: manualResolved.title,
          projectPageId,
          assignee: manualResolved.assignee,
        });

        const budget = await assertGuildAiBudgetCtx(ctx);
        const allKeys = await listAiKeysForGuild(
          ctx.dataClient,
          ctx.settings.aiKeysDatabaseId,
          guildId
        );
        const keysExist = allKeys.some((k) => k.status !== "disabled");
        let aiFailedMessage: string | null = null;
        let aiKeysFooterHint: string | undefined;

        if (ctx.settings.aiEnabled && keysExist && budget.ok) {
          let fallbackUsed = false;
          let lastError = "";
          let gotAi = false;
          for (let attempt = 0; attempt < 8; attempt++) {
            const key = await pickNextAiKey({
              client: ctx.dataClient,
              aiKeysDatabaseId: ctx.settings.aiKeysDatabaseId,
              guildId,
              timezone: ctx.settings.timezone,
            });
            if (!key) break;
            const coll = await interaction.guild?.members
              .fetch({ limit: 30 })
              .catch(() => null);
            const hints = coll
              ? [...coll.values()].map((m) => `${m.user.id}:${m.displayName}`).join("\n")
              : "";
            const res = await callLlmExtract({
              notion: ctx.dataClient,
              key,
              userText: text,
              memberHints: hints.slice(0, 2000),
              meta: {
                guildId,
                timezone: ctx.settings.timezone,
                fallbackUsed,
              },
            });
            if (res.ok) {
              payload = await buildConfirmPayloadFromAi({
                guildId,
                channelId: interaction.channelId ?? "",
                userId: interaction.user.id,
                sourceText: text,
                ai: res.data,
                repo: ctx.tasksRepo,
                dataClient: ctx.dataClient,
                memberMapDatabaseId: ctx.settings.memberMapDatabaseId,
              });
              gotAi = true;
              break;
            }
            lastError = res.error;
            fallbackUsed = true;
          }
          if (!gotAi) {
            aiFailedMessage = lastError ? ja.aiAllFailed(lastError.slice(0, 200)) : ja.aiNoKey;
          }
        } else if (!budget.ok) {
          aiFailedMessage = budget.message;
        } else if (ctx.settings.aiEnabled && !keysExist && budget.ok) {
          aiKeysFooterHint = ja.aiKeysHint;
        }

        if (aiFailedMessage) {
          const again = await resolveTodoAssigneeForManual(interaction, text);
          payload = buildSimpleConfirmPayload({
            guildId,
            channelId: interaction.channelId ?? "",
            userId: interaction.user.id,
            title: again.title,
            projectPageId,
            assignee: again.assignee,
          });
        }

        const shortId = await createPendingPayload({
          guildId,
          userId: interaction.user.id,
          kind: "todo_confirm",
          payload,
        });

        const embed = buildTodoConfirmEmbed(
          payload,
          aiFailedMessage ? ja.todoConfirmFallback : ja.todoConfirmTitle,
          aiKeysFooterHint
        );
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          embeds: [embed],
          components: [confirmButtonRow(shortId)],
        });
        return;
      }

      case "todo-list": {
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const filter = interaction.options.getString("filter");
        const projectName = interaction.options.getString("project")?.trim();
        let rows = await ctx.tasksRepo.queryOpenTasks(guildId);
        let scopeHeader = "";
        if (projectName) {
          const proj = await ctx.tasksRepo.queryProjectByName(guildId, projectName);
          if (!proj) {
            await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.projectNotFound });
            return;
          }
          rows = rows.filter((r) => r.projectIds.includes(proj.pageId));
          scopeHeader = ja.todoListScoped(projectName);
        }
        rows = filterTasks(rows, filter, interaction.user.id, ctx.settings.timezone);
        const ids = rows.map((r) => r.pageId);
        await saveOrderedTaskIds(interaction.user.id, guildId, ids);
        const lines = rows.map((r, i) => {
          return (
            `#${i + 1} ${r.title}\n` +
            `状態: ${r.status ?? "?"} / 優先度: ${r.priority ?? "?"}\n` +
            `期限: ${r.dueDate ?? "未設定"}`
          );
        });
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: lines.length
            ? `${scopeHeader}${ja.todoListTitle}\n\n${lines.join("\n\n")}`.slice(0, 3500)
            : projectName
              ? ja.todoListEmptyScoped(projectName)
              : ja.todoListEmpty,
        });
        return;
      }

      case "todo-edit": {
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const id = interaction.options.getInteger("id", true);
        const pageId = await resolveTaskPageIdByDisplayIndex(
          interaction.user.id,
          guildId,
          id
        );
        if (!pageId) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.listIndexHint });
          return;
        }
        const title = interaction.options.getString("title");
        const priority = interaction.options.getString("priority");
        const start = interaction.options.getString("start");
        const due = interaction.options.getString("due");
        const projectName = interaction.options.getString("project");
        let projectPageId: string | null | undefined = undefined;
        if (projectName) {
          const p = await ctx.tasksRepo.queryProjectByName(guildId, projectName);
          projectPageId = p?.pageId ?? null;
        }
        await ctx.tasksRepo.updateTaskFields(pageId, {
          title: title ?? undefined,
          priority: priority ?? undefined,
          startDateIso: start === null ? null : start ?? undefined,
          dueDateIso: due === null ? null : due ?? undefined,
          projectPageId,
        });
        await logTaskAction({
          guildId,
          taskId: pageId,
          actionType: "updated",
          actedBy: interaction.user.id,
        });
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.todoUpdated });
        return;
      }

      case "todo-done": {
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const id = interaction.options.getInteger("id", true);
        const pageId = await resolveTaskPageIdByDisplayIndex(
          interaction.user.id,
          guildId,
          id
        );
        if (!pageId) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.listIndexHint });
          return;
        }
        await ctx.tasksRepo.updateTaskStatus(pageId, "Done", interaction.user.id);
        await logTaskAction({
          guildId,
          taskId: pageId,
          actionType: "done",
          actedBy: interaction.user.id,
        });
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.todoDone(id) });
        return;
      }

      case "todo-delete": {
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const id = interaction.options.getInteger("id", true);
        const hard = interaction.options.getBoolean("hard") ?? false;
        const pageId = await resolveTaskPageIdByDisplayIndex(
          interaction.user.id,
          guildId,
          id
        );
        if (!pageId) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.listIndexHint });
          return;
        }
        const admin =
          interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
        if (hard && !admin) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.hardDeleteAdminOnly });
          return;
        }
        if (hard) {
          await ctx.tasksRepo.archivePage(pageId);
          await logTaskAction({
            guildId,
            taskId: pageId,
            actionType: "deleted",
            actedBy: interaction.user.id,
          });
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.todoArchived });
        } else {
          await ctx.tasksRepo.updateTaskCanceled(pageId);
          await logTaskAction({
            guildId,
            taskId: pageId,
            actionType: "canceled",
            actedBy: interaction.user.id,
          });
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.todoCanceled });
        }
        return;
      }

      case "subtask-add": {
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const parentIndex = interaction.options.getInteger("parent", true);
        const title = interaction.options.getString("title", true);
        const parentPageId = await resolveTaskPageIdByDisplayIndex(
          interaction.user.id,
          guildId,
          parentIndex
        );
        if (!parentPageId) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.parentNotFound });
          return;
        }
        await ctx.tasksRepo.createTask({
          title,
          taskLevel: "Subtask",
          parentTaskPageId: parentPageId,
          guildId,
          channelId: interaction.channelId ?? "",
          createdByUserId: interaction.user.id,
        });
        await logTaskAction({
          guildId,
          taskId: parentPageId,
          actionType: "created",
          afterValue: { title, parent: parentPageId },
          actedBy: interaction.user.id,
        });
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.subtaskCreated(title) });
        return;
      }

      case "usage": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ flags: MessageFlags.Ephemeral, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const sub = interaction.options.getSubcommand(true);
        if (sub === "today") {
          const s = await getTodayUsageSummaryCtx(ctx);
          await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: ja.usageToday([
              `本日の AI 使用量`,
              `基準: ${formatRangeLabel(s.timezone, s.date)}`,
              `リクエスト: ${s.requestCount} / ${s.requestLimit}`,
              `トークン: ${s.totalTokens} / ${s.tokenLimit}`,
            ]),
          });
          return;
        }
        if (sub === "month") {
          const m = await getMonthUsageAggregatesCtx(ctx);
          await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: ja.usageMonth(m.monthKey, m.requests, m.tokens),
          });
          return;
        }
        if (sub === "keys") {
          const keys = await listAiKeysForGuild(
            ctx.dataClient,
            ctx.settings.aiKeysDatabaseId,
            guildId
          );
          const lines = keys.map(
            (k) =>
              `${k.keyName}: ${k.provider} prio=${k.priority} status=${k.status} today_req=${k.todayRequestCount}/${k.dailyRequestLimit}`
          );
          await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: ja.usageKeys(lines.join("\n").slice(0, 3500)),
          });
          return;
        }
        return;
      }

      default:
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.unknownCommand });
    }
  } catch (e: unknown) {
    const msg = formatCaughtError(e).slice(0, 500);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: ja.error(msg) });
    } else {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: ja.error(msg) });
    }
  }
}
