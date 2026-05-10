/** Discord ユーザー向け文言（日本語） */

export const ja = {
  guildOnly: "このコマンドはサーバー内でのみ使えます。",
  notionNotConnected:
    "Notion が未設定です。管理者が `/setup-notion` で接続してください。",
  adminOnly: "このコマンドは管理者のみ使用できます。",
  notionSetupOk: "Notion 接続を保存しました。",
  notionSetupFail: (detail: string) =>
    `Notion 接続に失敗しました。\n\n${detail}\n\n1. Integration Secret\n2. Tasks / Projects / AI Keys DB へ接続\n3. Database ID\n4. 必須プロパティ`,
  timezoneSet: (tz: string) => `タイムゾーン: ${tz}`,
  channelSet: (id: string) => `通知チャンネル: <#${id}>`,
  roleSet: (id: string) => `管理者ロール: <@&${id}>`,
  settingsSummary: (lines: string[]) => lines.join("\n"),
  disconnectOk: "Notion 設定行をアーカイブしました。",
  deleteAllOk: "サーバー設定と AI キー行をアーカイブしました。",
  aiKeySaved: "AI API キーを保存しました。",
  aiKeyModelDefaultLabel: "（既定 / 環境変数）",
  aiKeyModelOk: (m: string) => `モデルを設定しました: ${m}`,
  aiKeyModelCleared: "モデル列をクリアしました（ホストの既定・環境変数を使用します）。",
  aiKeySaveMaybeModelProp: (detail: string) =>
    `保存に失敗しました。AI Keys DB に **Model**（rich_text）プロパティを追加し、\`/setup-notion\` で再接続（検証）してください。\n\n${detail}`,
  aiKeyListEmpty: "登録されたキーがありません。",
  aiKeyDisabled: "無効化しました。",
  aiKeyRemoved: "削除（アーカイブ）しました。",
  aiKeyPriorityOk: "優先度を更新しました。",
  aiKeyNotFound: "キーが見つかりません。",
  aiTestOk: (provider: string) => `${provider} の呼び出しに成功しました。`,
  aiTestFail: (msg: string) => `失敗: ${msg}`,
  projectCreated: (name: string) => `プロジェクトを作成しました: ${name}`,
  eventCreated: (name: string) => `イベントを作成しました: ${name}`,
  projectListEmpty: "プロジェクトがありません。",
  projectNotFound: "プロジェクトが見つかりません。",
  projectUpdated: "プロジェクトを更新しました。",
  projectArchived: "プロジェクトをアーカイブしました。",
  todoListEmpty: "表示する Todo がありません。",
  todoListEmptyScoped: (projectName: string) =>
    `「${projectName}」に紐づく表示対象の Todo がありません。`,
  todoListScoped: (projectName: string) => `**${projectName}** で絞り込み\n\n`,
  todoListTitle: "現在の Todo 一覧",
  listIndexHint: "先に `/todo-list` を実行し、番号を確認してください。",
  todoUpdated: "Todo を更新しました。",
  todoDone: (n: number) => `#${n} を完了にしました。`,
  todoCanceled: "Todo をキャンセル（Canceled）にしました。",
  todoArchived: "Todo ページをアーカイブしました。",
  hardDeleteAdminOnly: "hard 削除は管理者のみです。",
  subtaskCreated: (t: string) => `サブタスクを作成しました: ${t}`,
  parentNotFound: "親の番号を確認してください。",
  unknownCommand: "不明なコマンドです。",
  error: (msg: string) => `エラー: ${msg}`,
  usageToday: (lines: string[]) => lines.join("\n"),
  usageNoData: "データがありません。",
  usageMonth: (key: string, req: number, tok: number) =>
    `月間合計 (${key}): リクエスト ${req}, トークン ${tok}`,
  usageKeys: (body: string) => body || "キーがありません。",
  todoConfirmTitle: "この内容で Todo を登録しますか？",
  todoConfirmFallback: "確認（通常 Todo モード）",
  confirmEditSaved:
    "確認内容を更新しました。「登録する」で確定するか、再度「修正」できます。",
  confirmEditLineMismatch: (expected: number, got: number) =>
    `Todo は ${expected} 件ですが、入力は ${got} 行です。改行で件数を合わせてください。`,
  confirmEditInvalidDue: "期限の形式が不正です。YYYY-MM-DD または ISO 日時、空欄にしてください。",
  confirmEditInvalidPriority:
    "優先度は High / Medium / Low のいずれか、または空欄にしてください。",
  modalTodoEditTitle: "Todo 確認内容の修正",
  registered: (n: number) => `登録完了: ${n} 件`,
  notionSaveFail: (msg: string) => `Notion 保存に失敗: ${msg}`,
  budgetRequests: "本日の AI リクエスト上限に達しました。通常 Todo モードに切り替えます。",
  budgetTokens: "本日の AI トークン上限に達しました。通常 Todo モードに切り替えます。",
  aiAllFailed: (reason: string) =>
    `AI キーがすべて失敗したため、入力文をそのまま Todo にします。\n理由: ${reason}`,
  aiNoKey: "利用可能な AI キーがありません。通常 Todo モードにします。",
  settingsNotFound: "設定が見つかりません。",
  notionTokenMissing:
    "NOTION_TOKEN 環境変数か、コマンドの api_key オプションで Integration Secret を指定してください。",
  /** ギルドは設定済みだが Notion Secret が解決できないとき（環境変数未設定・復号失敗など） */
  notionCredentialMissing:
    "Notion の Integration Secret が設定されていません。\n\n" +
    "• **管理者**: `/setup-notion` の `api_key` に Integration Secret を入れて再接続する\n" +
    "• **ホスト**: 環境変数 `NOTION_TOKEN` を設定する\n\n" +
    "（Notion の [My integrations](https://www.notion.so/my-integrations) で Secret を確認できます）",
  /** AI 有効だが AI Keys DB にキー行がないとき */
  aiKeysHint:
    "AI が有効ですが API キーが未登録です。管理者は `/setup-ai-key add` でキーを追加してください。",
  memberMapNoDb:
    "メンバー映射 DB が未設定です。`/setup-notion` の `member_map_database_id` で接続してください。",
  memberMapListEmpty: "このサーバーの映射行がありません。`/member-map add` で追加できます。",
  memberMapNoAliases: "（別名なし）",
  memberMapListLine: (displayName: string, discordUserId: string, aliases: string) =>
    `• **${displayName}** / ID \`${discordUserId}\`\n  別名: ${aliases}`,
  memberMapExists: (userId: string) =>
    `このユーザーは既に登録されています。更新は \`/member-map edit user:<@${userId}>\` を使ってください。`,
  memberMapAdded: (displayName: string, aliases: string | null) =>
    `映射を追加しました: **${displayName}**` +
    (aliases ? `\n別名: ${aliases}` : ""),
  memberMapUpdated: "映射を更新しました。",
  memberMapRemoved: "映射を削除（アーカイブ）しました。",
  memberMapNotFound: "そのユーザーの映射行が見つかりません。",
  memberMapEditNothing:
    "変更内容がありません。`display_name`・`aliases` のいずれか、または `clear_aliases: true` を指定してください。",
} as const;
