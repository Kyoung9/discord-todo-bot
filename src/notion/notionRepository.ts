import { Client } from "@notionhq/client";
import type {
  DatabaseObjectResponse,
  PageObjectResponse,
  PartialDatabaseObjectResponse,
  PartialPageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints.js";
import { PROJECT_PROPS, TASK_PROPS } from "../config/notionSchema.js";
import type { TaskStatus } from "../config/notionSchema.js";
import {
  buildProjectProperties,
  buildTaskProperties,
  checkbox,
  patchTaskUpdatedAt,
  richText,
  selectName,
  titleProp,
  type ProjectCreateInput,
  type TaskCreateInput,
} from "./propertyBuilders.js";

type QueryResult = PageObjectResponse | PartialPageObjectResponse | PartialDatabaseObjectResponse | DatabaseObjectResponse;

function isFullPage(p: QueryResult): p is PageObjectResponse {
  return "object" in p && p.object === "page" && "properties" in p && !!p.properties;
}

function readTitle(page: PageObjectResponse): string {
  const prop = page.properties[TASK_PROPS.title] ?? page.properties[PROJECT_PROPS.name];
  if (!prop || prop.type !== "title") return "";
  return prop.title.map((t) => t.plain_text).join("") || "";
}

function readRichText(page: PageObjectResponse, key: string): string | null {
  const prop = page.properties[key];
  if (!prop || prop.type !== "rich_text") return null;
  const t = prop.rich_text.map((x) => x.plain_text).join("");
  return t || null;
}

function readSelect(page: PageObjectResponse, key: string): string | null {
  const prop = page.properties[key];
  if (!prop || prop.type !== "select") return null;
  return prop.select?.name ?? null;
}

function readDateStart(page: PageObjectResponse, key: string): string | null {
  const prop = page.properties[key];
  if (!prop || prop.type !== "date") return null;
  return prop.date?.start ?? null;
}

function readRelationIds(page: PageObjectResponse, key: string): string[] {
  const prop = page.properties[key];
  if (!prop || prop.type !== "relation") return [];
  return prop.relation.map((r) => r.id);
}

function readCheckbox(page: PageObjectResponse, key: string): boolean {
  const prop = page.properties[key];
  if (!prop || prop.type !== "checkbox") return false;
  return prop.checkbox;
}

export type TaskRow = {
  pageId: string;
  title: string;
  status: string | null;
  projectIds: string[];
  parentIds: string[];
  assigneeMention: string | null;
  assigneeDiscordId: string | null;
  startDate: string | null;
  dueDate: string | null;
  priority: string | null;
  taskLevel: string | null;
};

export class NotionRepository {
  constructor(
    private readonly client: Client,
    private readonly tasksDbId: string,
    private readonly projectsDbId: string
  ) {}

  async createTask(input: TaskCreateInput): Promise<string> {
    const res = await this.client.pages.create({
      parent: { database_id: this.tasksDbId },
      properties: buildTaskProperties(input),
    });
    return res.id;
  }

  async createProject(input: ProjectCreateInput): Promise<string> {
    const res = await this.client.pages.create({
      parent: { database_id: this.projectsDbId },
      properties: buildProjectProperties(input),
    });
    return res.id;
  }

  /** ギルド内の「未完了」タスクを取得（一覧用） */
  async queryOpenTasks(guildId: string): Promise<TaskRow[]> {
    const res = await this.client.databases.query({
      database_id: this.tasksDbId,
      filter: {
        and: [
          {
            property: TASK_PROPS.discordGuildId,
            rich_text: { equals: guildId },
          },
          {
            or: [
              { property: TASK_PROPS.status, select: { equals: "Todo" } },
              { property: TASK_PROPS.status, select: { equals: "Doing" } },
              { property: TASK_PROPS.status, select: { equals: "Review" } },
            ],
          },
        ],
      },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    });

    return res.results.filter(isFullPage).map((p) => this.toTaskRow(p));
  }

  async queryTasksForReminders(guildId: string): Promise<TaskRow[]> {
    const res = await this.client.databases.query({
      database_id: this.tasksDbId,
      filter: {
        and: [
          {
            property: TASK_PROPS.discordGuildId,
            rich_text: { equals: guildId },
          },
          {
            or: [
              { property: TASK_PROPS.status, select: { equals: "Todo" } },
              { property: TASK_PROPS.status, select: { equals: "Doing" } },
              { property: TASK_PROPS.status, select: { equals: "Review" } },
            ],
          },
        ],
      },
    });
    return res.results.filter(isFullPage).map((p) => this.toTaskRow(p));
  }

  async queryProjectByName(guildId: string, name: string): Promise<{ pageId: string; title: string } | null> {
    const res = await this.client.databases.query({
      database_id: this.projectsDbId,
      filter: {
        and: [
          {
            property: PROJECT_PROPS.discordGuildId,
            rich_text: { equals: guildId },
          },
          {
            property: PROJECT_PROPS.name,
            title: { equals: name },
          },
        ],
      },
    });
    const p = res.results.find(isFullPage);
    if (!p) return null;
    return { pageId: p.id, title: readTitle(p) };
  }

  async queryProjects(guildId: string): Promise<{ pageId: string; title: string; type: string | null }[]> {
    const res = await this.client.databases.query({
      database_id: this.projectsDbId,
      filter: {
        property: PROJECT_PROPS.discordGuildId,
        rich_text: { equals: guildId },
      },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    });
    return res.results.filter(isFullPage).map((p) => ({
      pageId: p.id,
      title: readTitle(p),
      type: readSelect(p, PROJECT_PROPS.type),
    }));
  }

  async getProjectPage(pageId: string): Promise<PageObjectResponse | null> {
    try {
      const p = await this.client.pages.retrieve({ page_id: pageId });
      return isFullPage(p) ? p : null;
    } catch {
      return null;
    }
  }

  async archivePage(pageId: string): Promise<void> {
    await this.client.pages.update({ page_id: pageId, archived: true });
  }

  async getTaskPage(pageId: string): Promise<PageObjectResponse | null> {
    try {
      const p = await this.client.pages.retrieve({ page_id: pageId });
      return isFullPage(p) ? p : null;
    } catch {
      return null;
    }
  }

  async updateTaskStatus(pageId: string, status: TaskStatus, doneByUserId?: string): Promise<void> {
    const props: Record<string, unknown> = {
      [TASK_PROPS.status]: selectName(status),
      ...patchTaskUpdatedAt(),
    };
    if (status === "Done") {
      props[TASK_PROPS.doneBy] = richText(doneByUserId ?? "");
      props[TASK_PROPS.doneAt] = { date: { start: new Date().toISOString() } };
    }
    await this.client.pages.update({
      page_id: pageId,
      properties: props as never,
    });
  }

  async updateTaskCanceled(pageId: string): Promise<void> {
    await this.updateTaskStatus(pageId, "Canceled");
  }

  async updateReminderFlags(
    pageId: string,
    patch: Partial<{
      startNotified: boolean;
      reminded24h: boolean;
      reminded3h: boolean;
      reminded1h: boolean;
      overdueNotified: boolean;
    }>
  ): Promise<void> {
    const props: Record<string, unknown> = { ...patchTaskUpdatedAt() };
    if (patch.startNotified !== undefined) props[TASK_PROPS.startNotified] = checkbox(patch.startNotified);
    if (patch.reminded24h !== undefined) props[TASK_PROPS.reminded24h] = checkbox(patch.reminded24h);
    if (patch.reminded3h !== undefined) props[TASK_PROPS.reminded3h] = checkbox(patch.reminded3h);
    if (patch.reminded1h !== undefined) props[TASK_PROPS.reminded1h] = checkbox(patch.reminded1h);
    if (patch.overdueNotified !== undefined) props[TASK_PROPS.overdueNotified] = checkbox(patch.overdueNotified);
    await this.client.pages.update({ page_id: pageId, properties: props as never });
  }

  async updateTaskFields(
    pageId: string,
    fields: Partial<{
      title: string;
      description: string | null;
      priority: string;
      startDateIso: string | null;
      dueDateIso: string | null;
      projectPageId: string | null;
    }>
  ): Promise<void> {
    const props: Record<string, unknown> = { ...patchTaskUpdatedAt() };
    if (fields.title !== undefined) props[TASK_PROPS.title] = titleProp(fields.title);
    if (fields.description !== undefined) props[TASK_PROPS.description] = richText(fields.description);
    if (fields.priority !== undefined) props[TASK_PROPS.priority] = selectName(fields.priority);
    if (fields.startDateIso !== undefined) {
      props[TASK_PROPS.startDate] = fields.startDateIso
        ? { date: { start: fields.startDateIso } }
        : { date: null };
    }
    if (fields.dueDateIso !== undefined) {
      props[TASK_PROPS.dueDate] = fields.dueDateIso
        ? { date: { start: fields.dueDateIso } }
        : { date: null };
    }
    if (fields.projectPageId !== undefined) {
      props[TASK_PROPS.project] = fields.projectPageId
        ? { relation: [{ id: fields.projectPageId }] }
        : { relation: [] };
    }
    await this.client.pages.update({ page_id: pageId, properties: props as never });
  }

  async queryTasksByProjectPageId(guildId: string, projectPageId: string): Promise<TaskRow[]> {
    const res = await this.client.databases.query({
      database_id: this.tasksDbId,
      filter: {
        and: [
          {
            property: TASK_PROPS.discordGuildId,
            rich_text: { equals: guildId },
          },
          {
            property: TASK_PROPS.project,
            relation: { contains: projectPageId },
          },
        ],
      },
    });
    return res.results.filter(isFullPage).map((p) => this.toTaskRow(p));
  }

  private toTaskRow(p: PageObjectResponse): TaskRow {
    return {
      pageId: p.id,
      title: readTitle(p),
      status: readSelect(p, TASK_PROPS.status),
      projectIds: readRelationIds(p, TASK_PROPS.project),
      parentIds: readRelationIds(p, TASK_PROPS.parentTask),
      assigneeMention: readRichText(p, TASK_PROPS.assigneeMention),
      assigneeDiscordId: readRichText(p, TASK_PROPS.assigneeDiscordId),
      startDate: readDateStart(p, TASK_PROPS.startDate),
      dueDate: readDateStart(p, TASK_PROPS.dueDate),
      priority: readSelect(p, TASK_PROPS.priority),
      taskLevel: readSelect(p, TASK_PROPS.taskLevel),
    };
  }

  /** リマインダー通知のメンション用（担当プロパティ） */
  readAssigneeForReminder(page: PageObjectResponse): {
    assigneeName: string | null;
    assigneeDiscordId: string | null;
    assigneeMention: string | null;
  } {
    return {
      assigneeName: readRichText(page, TASK_PROPS.assigneeName),
      assigneeDiscordId: readRichText(page, TASK_PROPS.assigneeDiscordId),
      assigneeMention: readRichText(page, TASK_PROPS.assigneeMention),
    };
  }

  /** リマインダー用: ページの生プロパティ読み取り */
  readReminderState(page: PageObjectResponse): {
    startDate: string | null;
    dueDate: string | null;
    startNotified: boolean;
    reminded24h: boolean;
    reminded3h: boolean;
    reminded1h: boolean;
    overdueNotified: boolean;
    status: string | null;
  } {
    return {
      startDate: readDateStart(page, TASK_PROPS.startDate),
      dueDate: readDateStart(page, TASK_PROPS.dueDate),
      startNotified: readCheckbox(page, TASK_PROPS.startNotified),
      reminded24h: readCheckbox(page, TASK_PROPS.reminded24h),
      reminded3h: readCheckbox(page, TASK_PROPS.reminded3h),
      reminded1h: readCheckbox(page, TASK_PROPS.reminded1h),
      overdueNotified: readCheckbox(page, TASK_PROPS.overdueNotified),
      status: readSelect(page, TASK_PROPS.status),
    };
  }

  async updateProjectFields(
    pageId: string,
    fields: Partial<{
      name: string;
      description: string | null;
      status: string;
      startDateIso: string | null;
      endDateIso: string | null;
    }>
  ): Promise<void> {
    const props: Record<string, unknown> = {
      [PROJECT_PROPS.updatedAt]: { date: { start: new Date().toISOString() } },
    };
    if (fields.name !== undefined) props[PROJECT_PROPS.name] = titleProp(fields.name);
    if (fields.description !== undefined) props[PROJECT_PROPS.description] = richText(fields.description);
    if (fields.status !== undefined) props[PROJECT_PROPS.status] = selectName(fields.status);
    if (fields.startDateIso !== undefined) {
      props[PROJECT_PROPS.startDate] = fields.startDateIso
        ? { date: { start: fields.startDateIso } }
        : { date: null };
    }
    if (fields.endDateIso !== undefined) {
      props[PROJECT_PROPS.endDate] = fields.endDateIso
        ? { date: { start: fields.endDateIso } }
        : { date: null };
    }
    await this.client.pages.update({ page_id: pageId, properties: props as never });
  }
}

export function createNotionRepository(
  token: string,
  tasksDbId: string,
  projectsDbId: string
): NotionRepository {
  return new NotionRepository(new Client({ auth: token }), tasksDbId, projectsDbId);
}
