/** 確認ボタン用のインメモリ一時ストア（再起動で失効） */

type Entry = {
  guildId: string;
  userId: string;
  kind: string;
  payload: string;
  expiresAt: number;
};

const store = new Map<string, Entry>();
const DEFAULT_TTL_MS = 30 * 60 * 1000;

function randomShortId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function prune(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt < now) store.delete(k);
  }
}

export async function createPendingPayload(params: {
  guildId: string;
  userId: string;
  kind: string;
  payload: unknown;
  ttlMs?: number;
}): Promise<string> {
  prune();
  const shortId = randomShortId();
  const expiresAt = Date.now() + (params.ttlMs ?? DEFAULT_TTL_MS);
  store.set(shortId, {
    guildId: params.guildId,
    userId: params.userId,
    kind: params.kind,
    payload: JSON.stringify(params.payload),
    expiresAt,
  });
  return shortId;
}

export async function getPendingPayload<T>(
  shortId: string,
  expectedUserId: string
): Promise<{ kind: string; payload: T } | null> {
  prune();
  const row = store.get(shortId);
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    store.delete(shortId);
    return null;
  }
  if (row.userId !== expectedUserId) return null;
  return { kind: row.kind, payload: JSON.parse(row.payload) as T };
}

export async function deletePending(shortId: string): Promise<void> {
  store.delete(shortId);
}

/** 確認内容をモーダル送信後に更新 */
export async function updatePendingPayload<T>(
  shortId: string,
  expectedUserId: string,
  payload: T
): Promise<boolean> {
  prune();
  const row = store.get(shortId);
  if (!row || row.expiresAt < Date.now()) return false;
  if (row.userId !== expectedUserId) return false;
  row.payload = JSON.stringify(payload);
  return true;
}
