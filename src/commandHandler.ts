import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  inlineCode,
} from "discord.js";
import { Client } from "@notionhq/client";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { validateFourDbSetup } from "./notion/validateDatabases.js";
import {
  archivePage,
  findBotSettingsByGuild,
  patchBotSettingsPage,
  upsertBotSettingsPage,
} from "./notion/botSettingsRepository.js";
import {
  createAiKeyPage,
  deleteAiKeyPage,
  findAiKeyByName,
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
import {
  saveOrderedTaskIds,
  resolveTaskPageIdByDisplayIndex,
} from "./services/taskListCacheService.js";
import { logTaskAction } from "./services/taskActionLogService.js";
import { formatRangeLabel } from "./lib/timezone.js";
import type { TaskRow } from "./notion/notionRepository.js";
import { loadGuildContext, type GuildContext } from "./runtime/guildContext.js";
import { ja } from "./i18n/ja.js";

function adminOnlyMessage(): string {
  return ja.adminOnly;
}

async function requireGuildContext(
  interaction: ChatInputCommandInteraction
): Promise<GuildContext | null> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ ephemeral: true, content: ja.guildOnly });
    return null;
  }
  const ctx = await loadGuildContext(guildId);
  if (!ctx) {
    await interaction.reply({ ephemeral: true, content: ja.notionNotConnected });
    return null;
  }
  return ctx;
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
    return rows.filter((r) => r.assigneeDiscordId === userId);
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

async function testProviderPing(provider: string, apiKey: string): Promise<void> {
  const p = provider.toLowerCase();
  if (p === "openai") {
    const o = new OpenAI({ apiKey });
    await o.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 5,
    });
    return;
  }
  if (p === "google") {
    const gen = new GoogleGenerativeAI(apiKey);
    const m = gen.getGenerativeModel({ model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash" });
    await m.generateContent("ping");
    return;
  }
  if (p === "anthropic") {
    const a = new Anthropic({ apiKey });
    await a.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-20241022",
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
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ ephemeral: true, content: ja.guildOnly });
    return;
  }

  try {
    switch (interaction.commandName) {
      case "setup-notion": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ ephemeral: true, content: adminOnlyMessage() });
          return;
        }
        const apiKeyOpt = interaction.options.getString("api_key");
        const apiKey = (apiKeyOpt?.trim() || process.env.NOTION_TOKEN?.trim() || "").trim();
        if (!apiKey) {
          await interaction.reply({ ephemeral: true, content: ja.notionTokenMissing });
          return;
        }
        const tasksDb = interaction.options.getString("tasks_database_id", true);
        const projectsDb = interaction.options.getString("projects_database_id", true);
        const botSettingsDb = interaction.options.getString("bot_settings_database_id", true);
        const aiKeysDb = interaction.options.getString("ai_keys_database_id", true);
        const envBs = process.env.NOTION_BOT_SETTINGS_DATABASE_ID?.replace(/\s+/g, "");
        const bsNorm = botSettingsDb.replace(/\s+/g, "");
        if (envBs && envBs !== bsNorm) {
          await interaction.reply({ ephemeral: true, content: ja.botSettingsDbMismatch });
          return;
        }
        const v = await validateFourDbSetup({
          notionToken: apiKey,
          tasksDbId: tasksDb,
          projectsDbId: projectsDb,
          botSettingsDbId: botSettingsDb,
          aiKeysDbId: aiKeysDb,
        });
        if (!v.ok) {
          await interaction.reply({
            ephemeral: true,
            content: ja.notionSetupFail(v.message),
          });
          return;
        }
        const client = new Client({ auth: apiKey });
        const gname = interaction.guild?.name ?? guildId;
        await upsertBotSettingsPage({
          client,
          guildId,
          guildName: gname,
          tasksDatabaseId: tasksDb,
          projectsDatabaseId: projectsDb,
          aiKeysDatabaseId: aiKeysDb,
          settingsDatabaseId: bsNorm,
          notionApiKey: apiKeyOpt?.trim() || null,
          createdBy: interaction.user.id,
        });
        await interaction.reply({ ephemeral: true, content: ja.notionSetupOk });
        return;
      }

      case "setup-timezone": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ ephemeral: true, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const tz = interaction.options.getString("timezone", true);
        await patchBotSettingsPage(ctx.dataClient, ctx.settings.pageId, { timezone: tz });
        await interaction.reply({ ephemeral: true, content: ja.timezoneSet(inlineCode(tz)) });
        return;
      }

      case "setup-channel": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ ephemeral: true, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const ch = interaction.options.getChannel("channel", true);
        await patchBotSettingsPage(ctx.dataClient, ctx.settings.pageId, {
          reminderChannelId: ch.id,
        });
        await interaction.reply({ ephemeral: true, content: ja.channelSet(ch.id) });
        return;
      }

      case "setup-role": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ ephemeral: true, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const role = interaction.options.getRole("role", true);
        await patchBotSettingsPage(ctx.dataClient, ctx.settings.pageId, { adminRoleId: role.id });
        await interaction.reply({ ephemeral: true, content: ja.roleSet(role.id) });
        return;
      }

      case "settings": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ ephemeral: true, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const s = ctx.settings;
        await interaction.reply({
          ephemeral: true,
          content: ja.settingsSummary([
            `Notion: 接続済み`,
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
          await interaction.reply({ ephemeral: true, content: adminOnlyMessage() });
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
        await archivePage(ctx.dataClient, ctx.settings.pageId);
        await interaction.reply({ ephemeral: true, content: ja.disconnectOk });
        return;
      }

      case "delete-server-settings": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ ephemeral: true, content: adminOnlyMessage() });
          return;
        }
        const ctx = await loadGuildContext(guildId);
        if (ctx) {
          const keys = await listAiKeysForGuild(
            ctx.dataClient,
            ctx.settings.aiKeysDatabaseId,
            guildId
          );
          for (const k of keys) await deleteAiKeyPage(ctx.dataClient, k.pageId);
          await archivePage(ctx.dataClient, ctx.settings.pageId);
        }
        await interaction.reply({ ephemeral: true, content: ja.deleteAllOk });
        return;
      }

      case "setup-ai-key": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ ephemeral: true, content: adminOnlyMessage() });
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
          const existing = await findAiKeyByName(
            ctx.dataClient,
            ctx.settings.aiKeysDatabaseId,
            guildId,
            keyName
          );
          if (existing) await deleteAiKeyPage(ctx.dataClient, existing.pageId);
          await createAiKeyPage({
            client: ctx.dataClient,
            aiKeysDatabaseId: ctx.settings.aiKeysDatabaseId,
            guildId,
            keyName,
            provider,
            apiKey,
            priority,
            createdBy: interaction.user.id,
            timezone: ctx.settings.timezone,
          });
          await interaction.reply({ ephemeral: true, content: ja.aiKeySaved });
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
              `${i + 1}. ${k.keyName}\n   Provider: ${k.provider}\n   Priority: ${k.priority}\n   Status: ${k.status}`
          );
          await interaction.reply({
            ephemeral: true,
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
            await interaction.reply({ ephemeral: true, content: ja.aiKeyNotFound });
            return;
          }
          await updateAiKeyStatus(ctx.dataClient, row.pageId, "disabled");
          await interaction.reply({ ephemeral: true, content: ja.aiKeyDisabled });
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
            await interaction.reply({ ephemeral: true, content: ja.aiKeyNotFound });
            return;
          }
          await deleteAiKeyPage(ctx.dataClient, row.pageId);
          await interaction.reply({ ephemeral: true, content: ja.aiKeyRemoved });
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
            await interaction.reply({ ephemeral: true, content: ja.aiKeyNotFound });
            return;
          }
          await updateAiKeyPriority(ctx.dataClient, row.pageId, value);
          await interaction.reply({ ephemeral: true, content: ja.aiKeyPriorityOk });
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
            await interaction.reply({ ephemeral: true, content: ja.aiKeyNotFound });
            return;
          }
          try {
            await testProviderPing(row.provider, row.apiKeyPlain);
            await interaction.reply({
              ephemeral: true,
              content: ja.aiTestOk(String(row.provider)),
            });
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            await interaction.reply({ ephemeral: true, content: ja.aiTestFail(msg.slice(0, 300)) });
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
        await interaction.reply({ ephemeral: true, content: ja.projectCreated(name) });
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
        await interaction.reply({ ephemeral: true, content: ja.eventCreated(name) });
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
          ephemeral: true,
          content: body.length ? body : ja.projectListEmpty,
        });
        return;
      }

      case "project-tasks": {
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const name = interaction.options.getString("project", true);
        const proj = await ctx.tasksRepo.queryProjectByName(guildId, name);
        if (!proj) {
          await interaction.reply({ ephemeral: true, content: ja.projectNotFound });
          return;
        }
        const tasks = await ctx.tasksRepo.queryTasksByProjectPageId(guildId, proj.pageId);
        const by = (st: string) => tasks.filter((t) => t.status === st);
        const fmt = (arr: TaskRow[]) => arr.map((t) => `- ${t.title}`).join("\n") || "(なし)";
        await interaction.reply({
          ephemeral: true,
          content: `**${name}**\n\nTodo\n${fmt(by("Todo"))}\n\nDoing\n${fmt(
            by("Doing")
          )}\n\nDone\n${fmt(by("Done"))}`.slice(0, 3500),
        });
        return;
      }

      case "project-edit": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ ephemeral: true, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const name = interaction.options.getString("name", true);
        const proj = await ctx.tasksRepo.queryProjectByName(guildId, name);
        if (!proj) {
          await interaction.reply({ ephemeral: true, content: ja.projectNotFound });
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
        await interaction.reply({ ephemeral: true, content: ja.projectUpdated });
        return;
      }

      case "project-delete": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ ephemeral: true, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const name = interaction.options.getString("name", true);
        const proj = await ctx.tasksRepo.queryProjectByName(guildId, name);
        if (!proj) {
          await interaction.reply({ ephemeral: true, content: ja.projectNotFound });
          return;
        }
        await ctx.tasksRepo.archivePage(proj.pageId);
        await interaction.reply({ ephemeral: true, content: ja.projectArchived });
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

        let payload = buildSimpleConfirmPayload({
          guildId,
          channelId: interaction.channelId ?? "",
          userId: interaction.user.id,
          title: text,
          projectPageId,
        });

        const budget = await assertGuildAiBudgetCtx(ctx);
        const allKeys = await listAiKeysForGuild(
          ctx.dataClient,
          ctx.settings.aiKeysDatabaseId,
          guildId
        );
        const keysExist = allKeys.some((k) => k.status !== "disabled");
        let aiFailedMessage: string | null = null;

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
        }

        if (aiFailedMessage) {
          payload = buildSimpleConfirmPayload({
            guildId,
            channelId: interaction.channelId ?? "",
            userId: interaction.user.id,
            title: text,
            projectPageId,
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
          aiFailedMessage ? ja.todoConfirmFallback : ja.todoConfirmTitle
        );
        await interaction.reply({
          ephemeral: true,
          embeds: [embed],
          components: [confirmButtonRow(shortId)],
        });
        return;
      }

      case "todo-list": {
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const filter = interaction.options.getString("filter");
        const rows = filterTasks(
          await ctx.tasksRepo.queryOpenTasks(guildId),
          filter,
          interaction.user.id,
          ctx.settings.timezone
        );
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
          ephemeral: true,
          content: lines.length
            ? `${ja.todoListTitle}\n\n${lines.join("\n\n")}`.slice(0, 3500)
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
          await interaction.reply({ ephemeral: true, content: ja.listIndexHint });
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
        await interaction.reply({ ephemeral: true, content: ja.todoUpdated });
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
          await interaction.reply({ ephemeral: true, content: ja.listIndexHint });
          return;
        }
        await ctx.tasksRepo.updateTaskStatus(pageId, "Done", interaction.user.id);
        await logTaskAction({
          guildId,
          taskId: pageId,
          actionType: "done",
          actedBy: interaction.user.id,
        });
        await interaction.reply({ ephemeral: true, content: ja.todoDone(id) });
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
          await interaction.reply({ ephemeral: true, content: ja.listIndexHint });
          return;
        }
        const admin =
          interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
        if (hard && !admin) {
          await interaction.reply({ ephemeral: true, content: ja.hardDeleteAdminOnly });
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
          await interaction.reply({ ephemeral: true, content: ja.todoArchived });
        } else {
          await ctx.tasksRepo.updateTaskCanceled(pageId);
          await logTaskAction({
            guildId,
            taskId: pageId,
            actionType: "canceled",
            actedBy: interaction.user.id,
          });
          await interaction.reply({ ephemeral: true, content: ja.todoCanceled });
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
          await interaction.reply({ ephemeral: true, content: ja.parentNotFound });
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
        await interaction.reply({ ephemeral: true, content: ja.subtaskCreated(title) });
        return;
      }

      case "usage": {
        if (!(await isGuildAdmin(interaction))) {
          await interaction.reply({ ephemeral: true, content: adminOnlyMessage() });
          return;
        }
        const ctx = await requireGuildContext(interaction);
        if (!ctx) return;
        const sub = interaction.options.getSubcommand(true);
        if (sub === "today") {
          const s = await getTodayUsageSummaryCtx(ctx);
          await interaction.reply({
            ephemeral: true,
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
            ephemeral: true,
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
            ephemeral: true,
            content: ja.usageKeys(lines.join("\n").slice(0, 3500)),
          });
          return;
        }
        return;
      }

      default:
        await interaction.reply({ ephemeral: true, content: ja.unknownCommand });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ ephemeral: true, content: ja.error(msg.slice(0, 500)) });
    } else {
      await interaction.reply({ ephemeral: true, content: ja.error(msg.slice(0, 500)) });
    }
  }
}
