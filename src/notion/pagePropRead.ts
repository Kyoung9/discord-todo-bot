import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";

export function readTitle(page: PageObjectResponse, key: string): string {
  const p = page.properties[key];
  if (!p || p.type !== "title") return "";
  return p.title.map((t) => t.plain_text).join("") || "";
}

export function readRichText(page: PageObjectResponse, key: string): string | null {
  const p = page.properties[key];
  if (!p || p.type !== "rich_text") return null;
  const t = p.rich_text.map((x) => x.plain_text).join("");
  return t.length ? t : null;
}

export function readNumber(page: PageObjectResponse, key: string): number | null {
  const p = page.properties[key];
  if (!p || p.type !== "number") return null;
  return p.number;
}

export function readCheckbox(page: PageObjectResponse, key: string): boolean {
  const p = page.properties[key];
  if (!p || p.type !== "checkbox") return false;
  return p.checkbox;
}

export function readSelectName(page: PageObjectResponse, key: string): string | null {
  const p = page.properties[key];
  if (!p || p.type !== "select") return null;
  return p.select?.name ?? null;
}

export function readDateStart(page: PageObjectResponse, key: string): string | null {
  const p = page.properties[key];
  if (!p || p.type !== "date") return null;
  return p.date?.start ?? null;
}

export function readDateStartAsDate(page: PageObjectResponse, key: string): Date | null {
  const s = readDateStart(page, key);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
