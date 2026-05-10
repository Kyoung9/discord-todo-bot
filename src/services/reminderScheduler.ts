import type { Client, TextChannel } from "discord.js";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { TASK_PROPS } from "../config/notionSchema.js";
import { listGuildSettingsForReminders } from "../db/guildSettingsRepository.js";
import type { BotSettingsParsed } from "../types/guildSettings.js";
import { createNotionRepository, type NotionRepository } from "../notion/notionRepository.js";
import { tryResolveIntegrationToken } from "../notion/notionTokens.js";

function dueToDate(dueIso: string, timeZone: string): Date {
  if (dueIso.includes("T")) return new Date(dueIso);
  if (timeZone === "Asia/Tokyo") return new Date(`${dueIso}T23:59:00+09:00`);
  return new Date(`${dueIso}T23:59:00Z`);
}

function startToDate(startIso: string, timeZone: string): Date {
  if (startIso.includes("T")) return new Date(startIso);
  if (timeZone === "Asia/Tokyo") return new Date(`${startIso}T00:00:00+09:00`);
  return new Date(`${startIso}T00:00:00Z`);
}

function ymdToday(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function readTaskTitle(page: PageObjectResponse): string {
  const prop = page.properties[TASK_PROPS.title];
  if (!prop || prop.type !== "title") return "";
  return prop.title.map((t) => t.plain_text).join("") || "";
}

async function send(channel: TextChannel, content: string): Promise<void> {
  await channel.send({ content: content.slice(0, 2000) });
}

async function processTaskPage(
  discord: Client,
  repo: NotionRepository,
  settings: BotSettingsParsed,
  _guildId: string,
  pageId: string
): Promise<void> {
  const channelId = settings.reminderChannelId;
  if (!channelId) return;
  const ch = await discord.channels.fetch(channelId);
  if (!ch || !ch.isTextBased()) return;
  const channel = ch as TextChannel;

  const page = await repo.getTaskPage(pageId);
  if (!page) return;
  const st = repo.readReminderState(page);
  if (st.status === "Done" || st.status === "Canceled") return;

  const tz = settings.timezone ?? "Asia/Tokyo";
  const now = new Date();
  const today = ymdToday(tz);

  if (st.startDate) {
    const sd = startToDate(st.startDate, tz);
    const startYmd =
      st.startDate.length <= 10
        ? st.startDate
        : new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(sd);
    if (!st.startNotified && startYmd === today) {
      const title = readTaskTitle(page);
      await send(
        channel,
        `📌 今日開始のタスクです。\n\n# ${title}\n期限: ${st.dueDate ?? "未設定"}`
      );
      await repo.updateReminderFlags(pageId, { startNotified: true });
    }
  }

  if (!st.dueDate) return;
  const due = dueToDate(st.dueDate, tz);
  const ms = due.getTime() - now.getTime();

  if (!st.overdueNotified && ms < 0) {
    const title = readTaskTitle(page);
    await send(channel, `⚠️ 期限を過ぎたタスクです。\n\n# ${title}\n期限: ${st.dueDate}`);
    await repo.updateReminderFlags(pageId, { overdueNotified: true });
    return;
  }

  const h1 = 60 * 60 * 1000;
  if (!st.reminded1h && ms > 0 && ms <= h1) {
    const title = readTaskTitle(page);
    await send(channel, `⏰ 期限1時間前です。\n\n# ${title}\n期限: ${st.dueDate}`);
    await repo.updateReminderFlags(pageId, { reminded1h: true });
    return;
  }

  const h3 = 3 * h1;
  if (!st.reminded3h && ms > h1 && ms <= h3) {
    const title = readTaskTitle(page);
    await send(channel, `⏰ 期限3時間前です。\n\n# ${title}\n期限: ${st.dueDate}`);
    await repo.updateReminderFlags(pageId, { reminded3h: true });
    return;
  }

  const h24 = 24 * h1;
  if (!st.reminded24h && ms > h3 && ms <= h24) {
    const title = readTaskTitle(page);
    await send(channel, `⏰ 期限24時間前です。\n\n# ${title}\n期限: ${st.dueDate}`);
    await repo.updateReminderFlags(pageId, { reminded24h: true });
  }
}

export async function runReminderTick(discord: Client): Promise<void> {
  let rows: BotSettingsParsed[] = [];
  try {
    rows = await listGuildSettingsForReminders();
  } catch {
    return;
  }

  for (const settings of rows) {
    if (!settings.reminderChannelId) continue;
    try {
      const token = tryResolveIntegrationToken(settings);
      if (!token) {
        console.warn(`[reminder] skip guild ${settings.guildId}: Notion token unavailable`);
        continue;
      }
      const repo = createNotionRepository(
        token,
        settings.tasksDatabaseId,
        settings.projectsDatabaseId
      );
      const notionRows = await repo.queryTasksForReminders(settings.guildId);
      for (const r of notionRows) {
        if (!r.startDate && !r.dueDate) continue;
        await processTaskPage(discord, repo, settings, settings.guildId, r.pageId);
      }
    } catch {
      // ギルド単位の失敗は無視
    }
  }
}
