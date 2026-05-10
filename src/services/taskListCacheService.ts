/** /todo-list 番号解決用インメモリ（再起動で失効） */

type Entry = { ids: string[]; expiresAt: number };
const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, Entry>();

function key(userId: string, guildId: string): string {
  return `${userId}:${guildId}`;
}

export async function saveOrderedTaskIds(
  userId: string,
  guildId: string,
  orderedTaskPageIds: string[]
): Promise<void> {
  cache.set(key(userId, guildId), {
    ids: orderedTaskPageIds,
    expiresAt: Date.now() + TTL_MS,
  });
}

export async function resolveTaskPageIdByDisplayIndex(
  userId: string,
  guildId: string,
  displayIndex: number
): Promise<string | null> {
  const k = key(userId, guildId);
  const row = cache.get(k);
  if (!row || row.expiresAt < Date.now()) {
    cache.delete(k);
    return null;
  }
  const i = displayIndex - 1;
  if (i < 0 || i >= row.ids.length) return null;
  return row.ids[i] ?? null;
}
