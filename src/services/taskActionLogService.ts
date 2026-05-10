/** Notion のみ構成ではタスク監査ログは未実装（no-op） */

export async function logTaskAction(_params: {
  guildId: string;
  taskId: string;
  actionType: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  actedBy: string;
}): Promise<void> {
  void _params;
}
