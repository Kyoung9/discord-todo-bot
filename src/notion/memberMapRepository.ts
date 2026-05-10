import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { MEMBER_MAP_PROPS } from "../config/notionSchema.js";
import { normalizeNotionDatabaseId } from "../lib/notionIdNormalize.js";
import { richText, titleProp } from "./propertyBuilders.js";
import { readRichText, readTitle } from "./pagePropRead.js";

const CACHE_TTL_MS = 180_000;

type CacheEntry = {
  expiresAt: number;
  /** 小文字化したキー → Discord User ID（数字のみ） */
  lookup: Map<string, string>;
};

const cache = new Map<string, CacheEntry>();

function cacheKey(mapDbId: string, guildId: string): string {
  return `${normalizeNotionDatabaseId(mapDbId)}:${guildId}`;
}

function normalizeLookupKey(s: string): string {
  return s.trim().toLowerCase();
}

function parseMemberPage(page: PageObjectResponse): { userId: string; keys: string[] } | null {
  const userIdRaw = readRichText(page, MEMBER_MAP_PROPS.discordUserId);
  if (!userIdRaw?.trim()) return null;
  const userId = userIdRaw.replace(/\D/g, "");
  if (!userId) return null;

  const keys: string[] = [];
  const title = readTitle(page, MEMBER_MAP_PROPS.name);
  if (title?.trim()) keys.push(normalizeLookupKey(title));

  const aliasesRaw = readRichText(page, MEMBER_MAP_PROPS.aliases);
  if (aliasesRaw?.trim()) {
    for (const part of aliasesRaw.split(",")) {
      const k = normalizeLookupKey(part);
      if (k) keys.push(k);
    }
  }

  if (keys.length === 0) keys.push(userId);

  return { userId, keys };
}

/** Notion からギルド行を読み、名前・別名 → Discord User ID のルックアップを構築（短い TTL キャッシュ） */
export async function loadMemberMapLookup(
  client: Client,
  mapDatabaseId: string,
  guildId: string
): Promise<Map<string, string>> {
  const key = cacheKey(mapDatabaseId, guildId);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.lookup;

  const dbId = normalizeNotionDatabaseId(mapDatabaseId);
  const lookup = new Map<string, string>();

  let cursor: string | undefined;
  do {
    const res = await client.databases.query({
      database_id: dbId,
      filter: {
        property: MEMBER_MAP_PROPS.discordGuildId,
        rich_text: { equals: guildId },
      },
      start_cursor: cursor,
    });

    for (const r of res.results) {
      if (!("properties" in r) || r.object !== "page") continue;
      const parsed = parseMemberPage(r as PageObjectResponse);
      if (!parsed) continue;
      for (const k of parsed.keys) {
        if (!lookup.has(k)) lookup.set(k, parsed.userId);
      }
    }
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);

  cache.set(key, { lookup, expiresAt: now + CACHE_TTL_MS });
  return lookup;
}

/** 表示名または別名から Discord User ID を解決（マッピング DB 未設定時は呼ばない） */
export async function resolveDiscordIdByAlias(
  client: Client,
  mapDatabaseId: string,
  guildId: string,
  rawName: string
): Promise<string | null> {
  const k = normalizeLookupKey(rawName);
  if (!k) return null;
  const lookup = await loadMemberMapLookup(client, mapDatabaseId, guildId);
  return lookup.get(k) ?? null;
}

/** カンマ区切りの名前列から ID 列を組み立て（解決できない名前はスキップ） */
export async function resolveDiscordIdsFromNameList(
  client: Client,
  mapDatabaseId: string,
  guildId: string,
  commaSeparatedNames: string
): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();
  const lookup = await loadMemberMapLookup(client, mapDatabaseId, guildId);
  for (const part of commaSeparatedNames.split(",")) {
    const k = normalizeLookupKey(part);
    if (!k) continue;
    const id = lookup.get(k);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** テストまたは設定変更直後用（任意） */
export function invalidateMemberMapCache(mapDatabaseId: string, guildId: string): void {
  cache.delete(cacheKey(mapDatabaseId, guildId));
}

export type MemberMapEntry = {
  pageId: string;
  displayName: string;
  discordUserId: string;
  aliases: string | null;
};

/** カンマ区切り入力を正規化（表示・保存用） */
export function normalizeAliasesInput(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

function pageToEntry(page: PageObjectResponse): MemberMapEntry | null {
  const userIdRaw = readRichText(page, MEMBER_MAP_PROPS.discordUserId);
  const uid = userIdRaw?.replace(/\D/g, "") ?? "";
  if (!uid) return null;
  const aliasesRaw = readRichText(page, MEMBER_MAP_PROPS.aliases)?.trim() || null;
  return {
    pageId: page.id,
    displayName: readTitle(page, MEMBER_MAP_PROPS.name) || "?",
    discordUserId: uid,
    aliases: aliasesRaw,
  };
}

/** ギルドの映射行をすべて取得（管理 UI 用） */
export async function listMemberMapEntries(
  client: Client,
  mapDatabaseId: string,
  guildId: string
): Promise<MemberMapEntry[]> {
  const dbId = normalizeNotionDatabaseId(mapDatabaseId);
  const out: MemberMapEntry[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.databases.query({
      database_id: dbId,
      filter: {
        property: MEMBER_MAP_PROPS.discordGuildId,
        rich_text: { equals: guildId },
      },
      start_cursor: cursor,
    });
    for (const r of res.results) {
      if (!("properties" in r) || r.object !== "page") continue;
      const e = pageToEntry(r as PageObjectResponse);
      if (e) out.push(e);
    }
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);
  out.sort((a, b) => a.displayName.localeCompare(b.displayName, "ja"));
  return out;
}

/** 同一ギルド・同一 Discord User ID の行を検索 */
export async function findMemberMapPageIdForUser(
  client: Client,
  mapDatabaseId: string,
  guildId: string,
  discordUserId: string
): Promise<string | null> {
  const dbId = normalizeNotionDatabaseId(mapDatabaseId);
  const res = await client.databases.query({
    database_id: dbId,
    filter: {
      and: [
        { property: MEMBER_MAP_PROPS.discordGuildId, rich_text: { equals: guildId } },
        { property: MEMBER_MAP_PROPS.discordUserId, rich_text: { equals: discordUserId } },
      ],
    },
    page_size: 5,
  });
  for (const r of res.results) {
    if ("id" in r && r.object === "page") return r.id;
  }
  return null;
}

/** 新規行を作成 */
export async function createMemberMapPage(params: {
  client: Client;
  mapDatabaseId: string;
  guildId: string;
  discordUserId: string;
  displayName: string;
  aliases: string | null;
}): Promise<string> {
  const dbId = normalizeNotionDatabaseId(params.mapDatabaseId);
  const res = await params.client.pages.create({
    parent: { database_id: dbId },
    properties: {
      [MEMBER_MAP_PROPS.name]: titleProp(params.displayName.slice(0, 2000)),
      [MEMBER_MAP_PROPS.discordUserId]: richText(params.discordUserId),
      [MEMBER_MAP_PROPS.discordGuildId]: richText(params.guildId),
      [MEMBER_MAP_PROPS.aliases]: richText(params.aliases),
    } as never,
  });
  invalidateMemberMapCache(params.mapDatabaseId, params.guildId);
  return res.id;
}

/** 既存行を更新（指定したフィールドのみ） */
export async function updateMemberMapPage(params: {
  client: Client;
  mapDatabaseId: string;
  guildId: string;
  pageId: string;
  displayName?: string;
  aliases?: string | null;
}): Promise<void> {
  const props: Record<string, unknown> = {};
  if (params.displayName !== undefined) {
    props[MEMBER_MAP_PROPS.name] = titleProp(params.displayName.slice(0, 2000));
  }
  if (params.aliases !== undefined) {
    props[MEMBER_MAP_PROPS.aliases] = richText(params.aliases);
  }
  if (Object.keys(props).length === 0) return;
  await params.client.pages.update({
    page_id: params.pageId,
    properties: props as never,
  });
  invalidateMemberMapCache(params.mapDatabaseId, params.guildId);
}

/** 行をアーカイブ（削除扱い） */
export async function archiveMemberMapPage(params: {
  client: Client;
  mapDatabaseId: string;
  guildId: string;
  pageId: string;
}): Promise<void> {
  await params.client.pages.update({
    page_id: params.pageId,
    archived: true,
  });
  invalidateMemberMapCache(params.mapDatabaseId, params.guildId);
}
