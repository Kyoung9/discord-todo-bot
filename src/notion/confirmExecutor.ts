import type { NotionRepository } from "./notionRepository.js";
import type { ConfirmTodoPayload } from "../types/confirmPayload.js";
import type { ProjectType } from "../config/notionSchema.js";
import { logTaskAction } from "../services/taskActionLogService.js";

function mapProjectType(t: string): ProjectType {
  const allowed: ProjectType[] = [
    "Project",
    "Event",
    "Competition",
    "Presentation",
    "Assignment",
    "Research",
    "Other",
  ];
  if (allowed.includes(t as ProjectType)) return t as ProjectType;
  return "Other";
}

/** 確認ペイロードを Notion へ反映 */
export async function executeConfirmTodoPayload(
  repo: NotionRepository,
  payload: ConfirmTodoPayload
): Promise<{ createdTaskIds: string[]; projectPageId: string | null }> {
  let projectPageId: string | null = null;
  if (payload.createProject) {
    projectPageId = await repo.createProject({
      name: payload.createProject.name,
      type: mapProjectType(payload.createProject.type),
      startDateIso: payload.createProject.startDateIso ?? null,
      endDateIso: payload.createProject.endDateIso ?? null,
      guildId: payload.guildId,
      createdByUserId: payload.userId,
    });
  }

  const createdTaskIds: string[] = [];
  let pendingParentId: string | null = null;

  for (const it of payload.items) {
    const projId = it.projectPageId ?? projectPageId;
    let parentId = it.parentTaskPageId ?? null;
    if (it.taskLevel === "Subtask" && !parentId) parentId = pendingParentId;

    const id = await repo.createTask({
      title: it.title,
      description: it.description ?? null,
      taskLevel: it.taskLevel,
      projectPageId: projId,
      parentTaskPageId: parentId,
      priority: it.priority,
      startDateIso: it.startDateIso ?? null,
      dueDateIso: it.dueDateIso ?? null,
      sourceType: payload.sourceType,
      sourceText: payload.sourceText,
      guildId: payload.guildId,
      channelId: payload.channelId,
      createdByUserId: payload.userId,
    });
    createdTaskIds.push(id);
    await logTaskAction({
      guildId: payload.guildId,
      taskId: id,
      actionType: "created",
      afterValue: { title: it.title, taskLevel: it.taskLevel },
      actedBy: payload.userId,
    });

    if (it.taskLevel === "Parent") pendingParentId = id;
    if (it.taskLevel === "Single") pendingParentId = null;
  }

  return { createdTaskIds, projectPageId };
}
