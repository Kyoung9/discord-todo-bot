/** キャッチした値をユーザー向け短い文字列にする（[object Object] を避ける） */
export function formatCaughtError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e !== null && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    const code = o.code;
    if (typeof code === "string" || typeof code === "number") {
      const msg = typeof o.message === "string" ? o.message : undefined;
      return msg ? `${code}: ${msg}` : String(code);
    }
    try {
      const s = JSON.stringify(e);
      if (s && s !== "{}") return s.slice(0, 800);
    } catch {
      /* fallthrough */
    }
  }
  return String(e);
}
