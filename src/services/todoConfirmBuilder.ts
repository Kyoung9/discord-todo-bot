import type { Client } from "@notionhq/client";
import type { NotionRepository } from "../notion/notionRepository.js";
import type { AiExtractResult } from "./aiSchema.js";
import type { ConfirmProjectSpec, ConfirmTodoItem, ConfirmTodoPayload } from "../types/confirmPayload.js";
import type { AssigneeTriple } from "../lib/discordAssignee.js";
import {
  resolveDiscordIdByAlias,
  resolveDiscordIdsFromNameList,
} from "../notion/memberMapRepository.js";

function mapPriority(p?: string): "High" | "Medium" | "Low" {
  const x = (p ?? "medium").toLowerCase();
  if (x === "high") return "High";
  if (x === "low") return "Low";
  return "Medium";
}

function assigneeFieldsFromAi(task: {
  assigneeName?: string | null;
  assigneeDiscordId?: string | null;
}): Pick<ConfirmTodoItem, "assigneeName" | "assigneeDiscordId" | "assigneeMention"> {
  const rawId = task.assigneeDiscordId?.trim() || "";
  const ids = rawId
    .split(",")
    .map((x) => x.replace(/\D/g, ""))
    .filter(Boolean);
  const idJoined = ids.length > 0 ? ids.join(",") : null;
  const name = task.assigneeName?.trim() || null;
  if (!idJoined && !name) {
    return { assigneeName: null, assigneeDiscordId: null, assigneeMention: null };
  }
  return {
    assigneeName: name,
    assigneeDiscordId: idJoined,
    assigneeMention: idJoined
      ? idJoined
          .split(",")
          .map((x) => `<@${x}>`)
          .join(" ")
      : null,
  };
}

/** 名前のみのときメンバー映射 DB で ID・メンションを補完（DB 未設定時は何もしない） */
async function enrichAssigneeFromMemberMap(
  client: Client,
  memberMapDatabaseId: string | null,
  guildId: string,
  task: { assigneeName?: string | null; assigneeDiscordId?: string | null }
): Promise<Pick<ConfirmTodoItem, "assigneeName" | "assigneeDiscordId" | "assigneeMention">> {
  const base = assigneeFieldsFromAi(task);
  if (base.assigneeDiscordId || !base.assigneeName || !memberMapDatabaseId) return base;

  const name = base.assigneeName;
  if (name.includes(",")) {
    const ids = await resolveDiscordIdsFromNameList(client, memberMapDatabaseId, guildId, name);
    if (ids.length === 0) return base;
    return {
      assigneeName: name,
      assigneeDiscordId: ids.join(","),
      assigneeMention: ids.map((id) => `<@${id}>`).join(" "),
    };
  }

  const id = await resolveDiscordIdByAlias(client, memberMapDatabaseId, guildId, name);
  if (!id) return base;
  return {
    assigneeName: name,
    assigneeDiscordId: id,
    assigneeMention: `<@${id}>`,
  };
}

export async function buildConfirmPayloadFromAi(params: {
  guildId: string;
  channelId: string;
  userId: string;
  sourceText: string;
  ai: AiExtractResult;
  repo: NotionRepository;
  dataClient: Client;
  memberMapDatabaseId: string | null;
}): Promise<ConfirmTodoPayload> {
  let createProject: ConfirmProjectSpec | null = null;
  let projectPageId: string | null = null;

  if (params.ai.project) {
    const found = await params.repo.queryProjectByName(
      params.guildId,
      params.ai.project.name
    );
    if (found) projectPageId = found.pageId;
    else {
      createProject = {
        name: params.ai.project.name,
        type: params.ai.project.type,
        startDateIso: params.ai.project.startDate ?? null,
        endDateIso: params.ai.project.endDate ?? null,
      };
    }
  }

  const items: ConfirmTodoItem[] = [];

  if (params.ai.detectedType === "parent_with_subtasks" && params.ai.parentTask) {
    items.push({
      title: params.ai.parentTask,
      taskLevel: "Parent",
      priority: "Medium",
      projectPageId,
      assigneeName: null,
      assigneeDiscordId: null,
      assigneeMention: null,
    });
    for (const s of params.ai.subtasks ?? []) {
      items.push({
        title: s,
        taskLevel: "Subtask",
        priority: "Medium",
        projectPageId,
        assigneeName: null,
        assigneeDiscordId: null,
        assigneeMention: null,
      });
    }
  } else {
    for (const t of params.ai.tasks ?? []) {
      const pr = mapPriority(t.priority);
      const a = await enrichAssigneeFromMemberMap(
        params.dataClient,
        params.memberMapDatabaseId,
        params.guildId,
        t
      );
      items.push({
        title: t.title,
        description: t.description ?? null,
        taskLevel: t.subtasks?.length ? "Parent" : "Single",
        priority: pr,
        projectPageId,
        startDateIso: t.startDate ?? null,
        dueDateIso: t.dueAt ?? null,
        ...a,
      });
      for (const st of t.subtasks ?? []) {
        items.push({
          title: st,
          taskLevel: "Subtask",
          priority: pr,
          projectPageId,
          startDateIso: null,
          dueDateIso: t.dueAt ?? null,
          ...a,
        });
      }
    }
  }

  if (items.length === 0) {
    items.push({
      title: params.sourceText.slice(0, 2000),
      taskLevel: "Single",
      priority: "Medium",
      projectPageId,
      assigneeName: null,
      assigneeDiscordId: null,
      assigneeMention: null,
    });
  }

  return {
    version: 1,
    guildId: params.guildId,
    channelId: params.channelId,
    userId: params.userId,
    sourceText: params.sourceText,
    sourceType: "ai_text",
    items,
    createProject,
  };
}

export function buildSimpleConfirmPayload(params: {
  guildId: string;
  channelId: string;
  userId: string;
  title: string;
  projectPageId?: string | null;
  assignee: AssigneeTriple;
}): ConfirmTodoPayload {
  return {
    version: 1,
    guildId: params.guildId,
    channelId: params.channelId,
    userId: params.userId,
    sourceText: params.title,
    sourceType: "manual",
    createProject: null,
    items: [
      {
        title: params.title,
        taskLevel: "Single",
        priority: "Medium",
        projectPageId: params.projectPageId ?? null,
        assigneeName: params.assignee.assigneeName,
        assigneeDiscordId: params.assignee.assigneeDiscordId,
        assigneeMention: params.assignee.assigneeMention,
      },
    ],
  };
}
