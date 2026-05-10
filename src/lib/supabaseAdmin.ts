import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

let cached: SupabaseClient | null = null;

/** REST パスを誤って含めた URL をプロジェクトオリジンに直す（supabase-js のパス結合エラー回避） */
function normalizeSupabaseUrl(raw: string): string {
  const t = raw.trim().replace(/\/+$/, "");
  try {
    const u = new URL(t);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    if (path === "/") return u.origin;
    if (
      path.startsWith("/rest") ||
      path.startsWith("/auth/v1") ||
      path.startsWith("/storage/v1") ||
      path.startsWith("/realtime/v1")
    ) {
      return u.origin;
    }
    return t;
  } catch {
    return t;
  }
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL ?? "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  // Node.js 22 未満はネイティブ WebSocket がないため ws を渡す（Realtime 初期化エラー回避）
  cached = createClient(url, key, {
    realtime: {
      // ws のコンストラクタ型と realtime-js の期待が完全一致しないため
      transport: WebSocket as never,
    },
  });
  return cached;
}
