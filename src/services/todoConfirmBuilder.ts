import type { NotionRepository } from "../notion/notionRepository.js";
import type { AiExtractResult } from "./aiSchema.js";
import type { ConfirmProjectSpec, ConfirmTodoItem, ConfirmTodoPayload } from "../types/confirmPayload.js";

function mapPriority(p?: string): "High" | "Medium" | "Low" {
  const x = (p ?? "medium").toLowerCase();
  if (x === "high") return "High";
  if (x === "low") return "Low";
  return "Medium";
}

export async function buildConfirmPayloadFromAi(params: {
  guildId: string;
  channelId: string;
  userId: string;
  sourceText: string;
  ai: AiExtractResult;
  repo: NotionRepository;
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
    });
    for (const s of params.ai.subtasks ?? []) {
      items.push({
        title: s,
        taskLevel: "Subtask",
        priority: "Medium",
        projectPageId,
      });
    }
  } else {
    for (const t of params.ai.tasks ?? []) {
      const pr = mapPriority(t.priority);
      items.push({
        title: t.title,
        description: t.description ?? null,
        taskLevel: t.subtasks?.length ? "Parent" : "Single",
        priority: pr,
        projectPageId,
        startDateIso: t.startDate ?? null,
        dueDateIso: t.dueAt ?? null,
      });
      for (const st of t.subtasks ?? []) {
        items.push({
          title: st,
          taskLevel: "Subtask",
          priority: pr,
          projectPageId,
          startDateIso: null,
          dueDateIso: t.dueAt ?? null,
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
      },
    ],
  };
}
