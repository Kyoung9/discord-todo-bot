import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;

/** GUILD_SETTINGS_ENCRYPTION_KEY: 64 桁 hex（32 byte）推奨。それ以外は scrypt で 32byte に導出 */
function deriveKey(): Buffer {
  const raw = process.env.GUILD_SETTINGS_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("GUILD_SETTINGS_ENCRYPTION_KEY is not set");
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return scryptSync(raw, "guild-settings-v1", 32);
}

/** Notion Integration Secret 等を DB 保存用に暗号化 */
export function encryptGuildSecret(plain: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptGuildSecret(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  if (buf.length < IV_LEN + TAG_LEN) throw new Error("invalid ciphertext");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const key = deriveKey();
  const dec = createDecipheriv(ALGO, key, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(data), dec.final()]).toString("utf8");
}
