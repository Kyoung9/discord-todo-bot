const HEX32 = /^[0-9a-f]{32}$/i;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Notion データベース ID を API 用に正規化する。
 * 共有 URL・?view= 付き・スラッグ末尾の 32hex などを吸収し、小文字 32 桁 hex を返す。
 */
export function normalizeNotionDatabaseId(input: string): string {
  let s = input.trim();
  if (!s) return s;

  let cut = s.indexOf("?");
  if (cut !== -1) s = s.slice(0, cut);
  cut = s.indexOf("#");
  if (cut !== -1) s = s.slice(0, cut);

  const segments = s.split("/").filter(Boolean);
  let tail = segments.length ? segments[segments.length - 1]! : s;

  const slug32 = tail.match(/-([0-9a-f]{32})$/i);
  if (slug32) tail = slug32[1];

  tail = tail.replace(/\s+/g, "");

  if (UUID.test(tail)) {
    return tail.replace(/-/g, "").toLowerCase();
  }
  if (HEX32.test(tail)) {
    return tail.toLowerCase();
  }

  const hexOnly = tail.replace(/[^0-9a-f]/gi, "");
  if (hexOnly.length === 32) {
    return hexOnly.toLowerCase();
  }

  return tail;
}

export function isValidNotionDatabaseId(normalized: string): boolean {
  return HEX32.test(normalized);
}
