import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { AI_KEYS_PROPS } from "../config/notionSchema.js";
import type { LlmProvider } from "../config/notionSchema.js";
import { dateKeyInTimeZone } from "../lib/timezone.js";
import {
  readDateStart,
  readDateStartAsDate,
  readNumber,
  readRichText,
  readSelectName,
  readTitle,
} from "./pagePropRead.js";

export type AiKeyRecord = {
  pageId: string;
  keyName: string;
  guildId: string;
  provider: LlmProvider | string;
  apiKeyPlain: string;
  priority: number;
  status: string;
  failureCount: number;
  cooldownUntil: Date | null;
  dailyRequestLimit: number;
  dailyTokenLimit: number;
  todayRequestCount: number;
  todayTokenCount: number;
  usageDateKey: string | null;
};

function parseAiKeyPage(page: PageObjectResponse): AiKeyRecord | null {
  const guildId = readRichText(page, AI_KEYS_PROPS.discordGuildId);
  const apiKey = readRichText(page, AI_KEYS_PROPS.apiKey);
  if (!guildId || !apiKey) return null;
  const provider = readSelectName(page, AI_KEYS_PROPS.provider) ?? "openai";
  const cd = readDateStartAsDate(page, AI_KEYS_PROPS.cooldownUntil);
  const usageDateRaw = readDateStart(page, AI_KEYS_PROPS.usageDate);

  return {
    pageId: page.id,
    keyName: readTitle(page, AI_KEYS_PROPS.name) || "key",
    guildId,
    provider: provider as LlmProvider,
    apiKeyPlain: apiKey,
    priority: readNumber(page, AI_KEYS_PROPS.priority) ?? 1,
    status: readSelectName(page, AI_KEYS_PROPS.status) ?? "active",
    failureCount: readNumber(page, AI_KEYS_PROPS.failureCount) ?? 0,
    cooldownUntil: cd,
    dailyRequestLimit: readNumber(page, AI_KEYS_PROPS.dailyRequestLimit) ?? 100,
    dailyTokenLimit: readNumber(page, AI_KEYS_PROPS.dailyTokenLimit) ?? 100_000,
    todayRequestCount: readNumber(page, AI_KEYS_PROPS.todayRequestCount) ?? 0,
    todayTokenCount: readNumber(page, AI_KEYS_PROPS.todayTokenCount) ?? 0,
    usageDateKey: usageDateRaw ? usageDateRaw.slice(0, 10) : null,
  };
}

export async function listAiKeysForGuild(
  client: Client,
  aiKeysDatabaseId: string,
  guildId: string
): Promise<AiKeyRecord[]> {
  const res = await client.databases.query({
    database_id: aiKeysDatabaseId,
    filter: {
      property: AI_KEYS_PROPS.discordGuildId,
      rich_text: { equals: guildId },
    },
  });
  const out: AiKeyRecord[] = [];
  for (const r of res.results) {
    if (!("properties" in r) || !("object" in r) || r.object !== "page") continue;
    const p = parseAiKeyPage(r as PageObjectResponse);
    if (p) out.push(p);
  }
  return out;
}

/** Usage Date がタイムゾーンの「今日」と違えばカウンタをリセット */
export function maybeResetUsageCountersLocal(
  key: AiKeyRecord,
  timezone: string
): AiKeyRecord {
  const today = dateKeyInTimeZone(new Date(), timezone);
  if (key.usageDateKey === today) return key;
  return {
    ...key,
    todayRequestCount: 0,
    todayTokenCount: 0,
    usageDateKey: today,
  };
}

async function writeUsageResetIfNeeded(
  client: Client,
  key: AiKeyRecord,
  timezone: string
): Promise<AiKeyRecord> {
  const today = dateKeyInTimeZone(new Date(), timezone);
  if (key.usageDateKey === today) return key;
  await client.pages.update({
    page_id: key.pageId,
    properties: {
      [AI_KEYS_PROPS.todayRequestCount]: { number: 0 },
      [AI_KEYS_PROPS.todayTokenCount]: { number: 0 },
      [AI_KEYS_PROPS.usageDate]: { date: { start: today } },
      [AI_KEYS_PROPS.updatedAt]: { date: { start: new Date().toISOString() } },
    } as never,
  });
  return { ...key, todayRequestCount: 0, todayTokenCount: 0, usageDateKey: today };
}

function cooldownExpired(key: AiKeyRecord): boolean {
  if (key.status !== "cooldown") return true;
  if (!key.cooldownUntil) return true;
  return key.cooldownUntil.getTime() <= Date.now();
}

/** アクティブ扱いに戻す（Notion更新） */
async function refreshCooldownInNotion(client: Client, key: AiKeyRecord): Promise<AiKeyRecord> {
  if (key.status !== "cooldown" || !cooldownExpired(key)) return key;
  await client.pages.update({
    page_id: key.pageId,
    properties: {
      [AI_KEYS_PROPS.status]: { select: { name: "active" } },
      [AI_KEYS_PROPS.cooldownUntil]: { date: null },
      [AI_KEYS_PROPS.updatedAt]: { date: { start: new Date().toISOString() } },
    } as never,
  });
  return { ...key, status: "active", cooldownUntil: null };
}

export async function sumGuildAiUsageToday(
  client: Client,
  aiKeysDatabaseId: string,
  guildId: string,
  timezone: string
): Promise<{ requests: number; tokens: number }> {
  const keys = await listAiKeysForGuild(client, aiKeysDatabaseId, guildId);
  let requests = 0;
  let tokens = 0;
  for (const k of keys) {
    const k2 = maybeResetUsageCountersLocal(k, timezone);
    requests += k2.todayRequestCount;
    tokens += k2.todayTokenCount;
  }
  return { requests, tokens };
}

export async function assertGuildAiBudgetNotion(params: {
  client: Client;
  aiKeysDatabaseId: string;
  guildId: string;
  timezone: string;
  requestLimit: number;
  tokenLimit: number;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const s = await sumGuildAiUsageToday(
    params.client,
    params.aiKeysDatabaseId,
    params.guildId,
    params.timezone
  );
  if (s.requests >= params.requestLimit) {
    return { ok: false, message: "ja_budget_requests" };
  }
  if (s.tokens >= params.tokenLimit) {
    return { ok: false, message: "ja_budget_tokens" };
  }
  return { ok: true };
}

export async function pickNextAiKey(params: {
  client: Client;
  aiKeysDatabaseId: string;
  guildId: string;
  timezone: string;
}): Promise<AiKeyRecord | null> {
  const raw = await listAiKeysForGuild(params.client, params.aiKeysDatabaseId, params.guildId);
  const candidates: AiKeyRecord[] = [];
  for (const k of raw) {
    if (k.status === "disabled") continue;
    let x = await writeUsageResetIfNeeded(params.client, k, params.timezone);
    x = await refreshCooldownInNotion(params.client, x);
    x = maybeResetUsageCountersLocal(x, params.timezone);
    if (x.status !== "active") continue;
    if (x.todayRequestCount >= x.dailyRequestLimit) continue;
    if (x.todayTokenCount >= x.dailyTokenLimit) continue;
    candidates.push(x);
  }
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) =>
      a.priority - b.priority ||
      a.todayTokenCount - b.todayTokenCount ||
      a.todayRequestCount - b.todayRequestCount
  );
  return candidates[0] ?? null;
}

export async function bumpKeyUsageSuccess(
  client: Client,
  key: AiKeyRecord,
  timezone: string,
  totalTokens: number
): Promise<void> {
  const k = maybeResetUsageCountersLocal(
    await writeUsageResetIfNeeded(client, key, timezone),
    timezone
  );
  const now = new Date().toISOString();
  await client.pages.update({
    page_id: key.pageId,
    properties: {
      [AI_KEYS_PROPS.todayRequestCount]: { number: k.todayRequestCount + 1 },
      [AI_KEYS_PROPS.todayTokenCount]: { number: k.todayTokenCount + totalTokens },
      [AI_KEYS_PROPS.usageDate]: {
        date: { start: k.usageDateKey ?? dateKeyInTimeZone(new Date(), timezone) },
      },
      [AI_KEYS_PROPS.lastUsedAt]: { date: { start: now } },
      [AI_KEYS_PROPS.lastSuccessAt]: { date: { start: now } },
      [AI_KEYS_PROPS.failureCount]: { number: 0 },
      [AI_KEYS_PROPS.status]: { select: { name: "active" } },
      [AI_KEYS_PROPS.cooldownUntil]: { date: null },
      [AI_KEYS_PROPS.updatedAt]: { date: { start: now } },
    } as never,
  });
}

export async function bumpKeyUsageFailure(
  client: Client,
  key: AiKeyRecord,
  timezone: string,
  failures: number
): Promise<void> {
  const k = maybeResetUsageCountersLocal(
    await writeUsageResetIfNeeded(client, key, timezone),
    timezone
  );
  const now = new Date().toISOString();
  const cooldownUntil = new Date(Date.now() + (failures >= 5 ? 15 * 60 * 1000 : 60 * 1000));
  await client.pages.update({
    page_id: key.pageId,
    properties: {
      [AI_KEYS_PROPS.todayRequestCount]: { number: k.todayRequestCount + 1 },
      [AI_KEYS_PROPS.usageDate]: {
        date: { start: k.usageDateKey ?? dateKeyInTimeZone(new Date(), timezone) },
      },
      [AI_KEYS_PROPS.lastFailedAt]: { date: { start: now } },
      [AI_KEYS_PROPS.failureCount]: { number: failures },
      [AI_KEYS_PROPS.status]: { select: { name: "cooldown" } },
      [AI_KEYS_PROPS.cooldownUntil]: { date: { start: cooldownUntil.toISOString() } },
      [AI_KEYS_PROPS.updatedAt]: { date: { start: now } },
    } as never,
  });
}

export async function createAiKeyPage(params: {
  client: Client;
  aiKeysDatabaseId: string;
  guildId: string;
  keyName: string;
  provider: string;
  apiKey: string;
  priority: number;
  createdBy: string;
  timezone: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const today = dateKeyInTimeZone(new Date(), params.timezone);
  await params.client.pages.create({
    parent: { database_id: params.aiKeysDatabaseId },
    properties: {
      [AI_KEYS_PROPS.name]: {
        title: [{ type: "text", text: { content: params.keyName.slice(0, 2000) } }],
      },
      [AI_KEYS_PROPS.discordGuildId]: {
        rich_text: [{ type: "text", text: { content: params.guildId } }],
      },
      [AI_KEYS_PROPS.provider]: { select: { name: params.provider } },
      [AI_KEYS_PROPS.apiKey]: {
        rich_text: [{ type: "text", text: { content: params.apiKey.slice(0, 2000) } }],
      },
      [AI_KEYS_PROPS.priority]: { number: params.priority },
      [AI_KEYS_PROPS.status]: { select: { name: "active" } },
      [AI_KEYS_PROPS.failureCount]: { number: 0 },
      [AI_KEYS_PROPS.dailyRequestLimit]: { number: 100 },
      [AI_KEYS_PROPS.dailyTokenLimit]: { number: 100_000 },
      [AI_KEYS_PROPS.todayRequestCount]: { number: 0 },
      [AI_KEYS_PROPS.todayTokenCount]: { number: 0 },
      [AI_KEYS_PROPS.usageDate]: { date: { start: today } },
      [AI_KEYS_PROPS.createdBy]: {
        rich_text: [{ type: "text", text: { content: params.createdBy } }],
      },
      [AI_KEYS_PROPS.createdAt]: { date: { start: now } },
      [AI_KEYS_PROPS.updatedAt]: { date: { start: now } },
    } as never,
  });
}

export async function findAiKeyByName(
  client: Client,
  aiKeysDatabaseId: string,
  guildId: string,
  keyName: string
): Promise<AiKeyRecord | null> {
  const keys = await listAiKeysForGuild(client, aiKeysDatabaseId, guildId);
  return keys.find((k) => k.keyName === keyName) ?? null;
}

export async function updateAiKeyStatus(
  client: Client,
  pageId: string,
  status: string
): Promise<void> {
  await client.pages.update({
    page_id: pageId,
    properties: {
      [AI_KEYS_PROPS.status]: { select: { name: status } },
      [AI_KEYS_PROPS.updatedAt]: { date: { start: new Date().toISOString() } },
    } as never,
  });
}

export async function updateAiKeyPriority(
  client: Client,
  pageId: string,
  priority: number
): Promise<void> {
  await client.pages.update({
    page_id: pageId,
    properties: {
      [AI_KEYS_PROPS.priority]: { number: priority },
      [AI_KEYS_PROPS.updatedAt]: { date: { start: new Date().toISOString() } },
    } as never,
  });
}

export async function deleteAiKeyPage(client: Client, pageId: string): Promise<void> {
  await client.pages.update({ page_id: pageId, archived: true });
}

export async function getAiKeyRecordByPageId(
  client: Client,
  pageId: string
): Promise<AiKeyRecord | null> {
  const p = await client.pages.retrieve({ page_id: pageId });
  if (!("properties" in p) || !("object" in p) || p.object !== "page") return null;
  return parseAiKeyPage(p as PageObjectResponse);
}
