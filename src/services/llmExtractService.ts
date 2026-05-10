import type { Client } from "@notionhq/client";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import type { AiKeyRecord } from "../notion/aiKeysRepository.js";
import {
  bumpKeyUsageFailure,
  bumpKeyUsageSuccess,
  getAiKeyRecordByPageId,
} from "../notion/aiKeysRepository.js";
import { aiExtractSchema, type AiExtractResult } from "./aiSchema.js";

export type AiCallMeta = {
  guildId: string;
  timezone: string;
  fallbackUsed: boolean;
};

const SYSTEM_PROMPT = `You are a scheduling assistant for Discord teams.
Analyze the user's message and output ONLY valid JSON (no markdown) matching this shape:
{
  "detectedType": one of [
    "single_todo",
    "multiple_todos",
    "project_with_tasks",
    "event_with_tasks",
    "parent_with_subtasks"
  ],
  "project": null | { "name": string, "type": string, "startDate": string|null, "endDate": string|null },
  "tasks": [ { "title": string, "description": string|null, "assigneeName": string|null, "assigneeDiscordId": string|null, "startDate": string|null, "dueAt": string|null, "priority": "high"|"medium"|"low", "subtasks": string[] } ],
  "parentTask": string|null,
  "subtasks": string[],
  "questions": string[]
}
Rules:
- Use ISO 8601 with timezone offset when possible (e.g. 2026-05-31T23:59:00+09:00). If unknown, use null.
- If unclear, add questions in Japanese in "questions".
- Do not invent assignee Discord IDs; leave assigneeDiscordId null unless explicitly present as a numeric ID.
- parent_with_subtasks: set parentTask and subtasks (flat list). tasks can be empty.
- project_with_tasks: fill project and tasks.
- Omit fields you cannot infer; prefer nulls over guesses.`;

function userPayload(
  meta: AiCallMeta,
  memberHints: string,
  userText: string
): string {
  return `Timezone: ${meta.timezone} (use for relative dates).\nMember hints:\n${memberHints}\n\nUser message:\n${userText}`;
}

async function handleFailure(
  notion: Client,
  key: AiKeyRecord,
  timezone: string
): Promise<void> {
  const fresh = await getAiKeyRecordByPageId(notion, key.pageId);
  const failures = (fresh?.failureCount ?? key.failureCount) + 1;
  await bumpKeyUsageFailure(notion, fresh ?? key, timezone, failures);
}

export async function callLlmExtract(params: {
  notion: Client;
  key: AiKeyRecord;
  userText: string;
  memberHints: string;
  meta: AiCallMeta;
}): Promise<{ ok: true; data: AiExtractResult } | { ok: false; error: string }> {
  const provider = params.key.provider.toLowerCase();
  const userContent = userPayload(params.meta, params.memberHints, params.userText);

  try {
    let text = "{}";
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let model = "";

    if (provider === "openai") {
      model =
        params.key.llmModel?.trim() ||
        process.env.OPENAI_MODEL ||
        "gpt-4o-mini";
      const openai = new OpenAI({ apiKey: params.key.apiKeyPlain });
      const resp = await openai.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      });
      text = resp.choices[0]?.message?.content ?? "{}";
      inputTokens = resp.usage?.prompt_tokens ?? 0;
      outputTokens = resp.usage?.completion_tokens ?? 0;
      totalTokens = resp.usage?.total_tokens ?? inputTokens + outputTokens;
    } else if (provider === "google") {
      model =
        params.key.llmModel?.trim() ||
        process.env.GEMINI_MODEL ||
        "gemini-2.0-flash";
      const genAI = new GoogleGenerativeAI(params.key.apiKeyPlain);
      const mdl = genAI.getGenerativeModel({
        model,
        generationConfig: {
          responseMimeType: "application/json",
        },
        systemInstruction: SYSTEM_PROMPT,
      });
      const result = await mdl.generateContent(userContent);
      text = result.response.text();
      const metaUsage = result.response.usageMetadata;
      inputTokens = metaUsage?.promptTokenCount ?? 0;
      outputTokens = metaUsage?.candidatesTokenCount ?? 0;
      totalTokens = metaUsage?.totalTokenCount ?? inputTokens + outputTokens;
    } else if (provider === "anthropic") {
      model =
        params.key.llmModel?.trim() ||
        process.env.ANTHROPIC_MODEL ||
        "claude-3-5-haiku-20241022";
      const anthropic = new Anthropic({ apiKey: params.key.apiKeyPlain });
      const msg = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      });
      const block = msg.content.find((c) => c.type === "text");
      text = block && block.type === "text" ? block.text : "{}";
      inputTokens = msg.usage?.input_tokens ?? 0;
      outputTokens = msg.usage?.output_tokens ?? 0;
      totalTokens = inputTokens + outputTokens;
    } else {
      return { ok: false, error: `Unknown provider: ${provider}` };
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      await handleFailure(params.notion, params.key, params.meta.timezone);
      return { ok: false, error: "Invalid JSON from model" };
    }

    const parsed = aiExtractSchema.safeParse(json);
    if (!parsed.success) {
      await handleFailure(params.notion, params.key, params.meta.timezone);
      return { ok: false, error: "AI output validation failed" };
    }

    await bumpKeyUsageSuccess(params.notion, params.key, params.meta.timezone, totalTokens);
    void inputTokens;
    void outputTokens;
    void model;
    return { ok: true, data: parsed.data };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await handleFailure(params.notion, params.key, params.meta.timezone);
    return { ok: false, error: msg };
  }
}
