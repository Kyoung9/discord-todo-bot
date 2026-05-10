import type { GuildContext } from "../runtime/guildContext.js";
import {
  assertGuildAiBudgetNotion,
  sumGuildAiUsageToday,
} from "../notion/aiKeysRepository.js";
import { dateKeyInTimeZone } from "../lib/timezone.js";
import { ja } from "../i18n/ja.js";

export async function assertGuildAiBudgetCtx(
  ctx: GuildContext
): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = await assertGuildAiBudgetNotion({
    client: ctx.dataClient,
    aiKeysDatabaseId: ctx.settings.aiKeysDatabaseId,
    guildId: ctx.settings.guildId,
    timezone: ctx.settings.timezone,
    requestLimit: ctx.settings.dailyAiRequestLimit,
    tokenLimit: ctx.settings.dailyAiTokenLimit,
  });
  if (!r.ok) {
    return {
      ok: false,
      message: r.message === "ja_budget_tokens" ? ja.budgetTokens : ja.budgetRequests,
    };
  }
  return { ok: true };
}

export async function getTodayUsageSummaryCtx(ctx: GuildContext): Promise<{
  date: string;
  timezone: string;
  requestCount: number;
  totalTokens: number;
  requestLimit: number;
  tokenLimit: number;
}> {
  const tz = ctx.settings.timezone;
  const date = dateKeyInTimeZone(new Date(), tz);
  const s = await sumGuildAiUsageToday(
    ctx.dataClient,
    ctx.settings.aiKeysDatabaseId,
    ctx.settings.guildId,
    tz
  );
  return {
    date,
    timezone: tz,
    requestCount: s.requests,
    totalTokens: s.tokens,
    requestLimit: ctx.settings.dailyAiRequestLimit,
    tokenLimit: ctx.settings.dailyAiTokenLimit,
  };
}

/** Notion のみのため履歴は今日分の合計のみ（月次はキー行の累積なし） */
export async function getMonthUsageAggregatesCtx(
  ctx: GuildContext
): Promise<{ monthKey: string; requests: number; tokens: number }> {
  const today = await getTodayUsageSummaryCtx(ctx);
  return {
    monthKey: today.date.slice(0, 7),
    requests: today.requestCount,
    tokens: today.totalTokens,
  };
}
