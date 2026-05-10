# Discord Project Todo Bot — 利用ガイド

本書はボットの**セットアップ・起動・スラッシュコマンド・トラブルシューティング**をまとめたものです。プロダクト要件の全体像は [README.md](./README.md) を参照してください。

---

## 前提

- **Node.js** 20 以上（`package.json` の `engines` に準拠）
- **Discord アプリケーション**（Bot トークン、Application ID）
- **Notion インテグレーション**（Secret / `NOTION_TOKEN` またはギルドごとの API キー）
- **Supabase プロジェクト**（`guild_settings` 用。マイグレーションは `supabase/migrations/`）

### ホストが違う・公開したボットを複数サーバーが使う場合（Notion）

- **各 Discord サーバー（チーム）**は、原則として **自分たちの Notion ワークスペース**でインテグレーションを作り、Tasks / Projects / AI Keys（など）に接続します。
- サーバー管理者は `/setup-notion` の **`api_key`** に、そのサーバー用の **Integration Secret** を入れます（Supabase に暗号化保存）。こうすると **ホストの `.env` `NOTION_TOKEN` なし**でも、そのサーバーだけ独立して動けます。
- 逆に、**ホストの `NOTION_TOKEN` を全サーバー共通で使う**と、Notion 上は「ホストが共有した 1 本のインテグレーション」前提になります。**他チームのデータと混ざらない**運用では、`NOTION_TOKEN` は空にして利用者に `api_key` 設定を必須にするのが安全です。

---

## 1. Notion 側の準備

1. [Notion インテグレーション](https://www.notion.so/my-integrations)を作成し、**Internal Integration Secret** を控える。
2. 次の **3 つのデータベース**を用意し、それぞれにインテグレーションを**接続（共有）**する。
   - **Tasks**
   - **Projects**
   - **AI Keys**（プロパティ名はコードのスキーマと一致。キーごとに LLM モデルを変えたい場合は **任意** で **Model**（rich_text）列を追加し、`/setup-ai-key add` の `model` または `model` サブコマンドで設定）
3. （任意）**メンバー映射**用の第 4 データベースを作り、同じインテグレーションを接続する。  
   AI やリマインダーで「名前だけ」の担当を Discord User ID / メンションに直すときに使います。  
   必須プロパティは `src/config/notionSchema.ts` の `MEMBER_MAP_PROPS` と一致させてください。
   - **Name**（Title）… 表示名
   - **Discord User ID**（rich_text）… 数値のユーザー ID
   - **Discord Guild ID**（rich_text）… その行を使う Discord サーバー ID（ボットはクエリ時に現在のギルドと一致する行だけを読みます）
   - **Aliases**（rich_text・任意）… `別名1,別名2` のようにカンマ区切り
4. 各データベースの URL から **Database ID**（32 文字の UUID）を取得する。

`/setup-notion` 実行時に、Tasks / Projects / AI Keys の ID を渡します。任意で `member_map_database_id` に映射 DB の ID を渡せます（省略した場合は映射なしで動作し、再実行で省略すると既存の映射 ID はそのまま維持されます）。

---

## 2. Supabase の準備

1. Supabase でプロジェクトを作成する。
2. SQL エディタまたは CLI で、`supabase/migrations/` 内のマイグレーションを適用する（`guild_settings` の作成に加え、映射用の `notion_member_map_database_id` 列を含む最新まで適用すること）。
3. **Project Settings → API** から `URL` と **`service_role`** キーを取得する。  
   ボットはサーバー側で RLS をバイパスするため **`service_role`** を使用します（クライアントに埋め込まないこと）。

---

## 3. Discord アプリケーション設定

1. [Discord Developer Portal](https://discord.com/developers/applications) で Bot を作成し、**Token** と **Application ID** を控える。
2. **Bot** タブで必要に応じて **Privileged Gateway Intents** を有効にする。  
   メンバー解決などで **Server Members Intent** が必要な場合は Portal でオンにする。  
   意図（intents）と Portal 設定が一致しないと起動時に `disallowed intents` で失敗します。
3. **OAuth2 → URL Generator** で `bot` と `applications.commands` を選び、必要な権限（メッセージ送信、埋め込み、スラッシュコマンドなど）を付与してサーバーに招待する。

---

## 4. 環境変数

リポジトリルートに `.env` を置き、`.env.example` を参考に設定します。

| 変数 | 説明 |
|------|------|
| `DISCORD_TOKEN` | Bot トークン |
| `DISCORD_CLIENT_ID` | Application ID（コマンド登録に使用） |
| `DISCORD_GUILD_ID` | （任意）開発時、スラッシュコマンドを特定ギルドのみに登録 |
| `SUPABASE_URL` | Supabase プロジェクト URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role キー |
| `GUILD_SETTINGS_ENCRYPTION_KEY` | AES-256-GCM 用の **64 文字 hex（32 バイト）**推奨。ギルド別 Notion Secret の暗号化に使用 |
| `NOTION_TOKEN` | デフォルトの Notion インテグレーション Secret（`/setup-notion` で API キーを省略した場合のフォールバック） |
| `OPENAI_MODEL` など | （任意）LLM のデフォルトモデル名 |

---

## 5. インストールとビルド

```bash
npm install
npm run build
```

開発時はホットリロード:

```bash
npm run dev
```

---

## 6. スラッシュコマンドの登録

Discord API にコマンド定義を登録します（初回およびコマンド変更後に実行）。

```bash
npm run deploy-commands
```

`DISCORD_GUILD_ID` を設定している場合はそのギルドにのみ、未設定の場合はグローバル登録（反映に時間がかかることがあります）になります。実装は `src/deploy-commands.ts` を参照してください。

---

## 7. 起動

```bash
npm start
```

`dist/index.js` が実行されます。起動時に Supabase と暗号化キーが読み込まれ、ギルド設定は Supabase の `guild_settings` に保存されます。

---

## 8. 初回セットアップ（サーバー管理者）

1. ボットをサーバーに招待したうえで、**管理者**が次を実行します。
   - `/setup-notion` … `tasks_database_id`, `projects_database_id`, `ai_keys_database_id` を指定。`member_map_database_id` は任意。`api_key` は省略可（その場合 `NOTION_TOKEN` を使用）。
   - 必要に応じて `/setup-timezone`, `/setup-channel`, `/setup-role`, `/settings`。
2. AI を使う場合は `/setup-ai-key` で Notion **AI Keys** DB に行が追加されます（キーは一覧に平文は出しません）。モデルはキー行の **Model** 列またはホストの環境変数（`OPENAI_MODEL` 等）の順で決まります。

### 複数担当者（Tasks DB のプロパティ 3 つ）

追加の Notion 列は使わず、次の**書き方の約束**で複数人を保存します。

- **Assignee Discord ID** … `123456789,987654321`（カンマ区切り・空白はトリム）
- **Assignee Mention** … `<@123456789> <@987654321>`（スペース区切り）
- **Assignee Name** … `Aさん, Bさん` など表示用（カンマ区切り）

手動 `/todo` の本文に複数のユーザーメンション（`<@…>`）がある場合、ボットが上記形式で Notion に書き込みます。`/todo-list` の「自分」フィルタは、カンマ区切り ID のいずれかが自分なら表示されます。

---

## 9. スラッシュコマンド一覧

実装は `src/commandDefinitions.ts` と一致しています。

### ヘルプ（全員・エフェメラル）

| コマンド | 説明 |
|----------|------|
| `/help-todo` | 主要コマンドの要約と USAGE.md / README.md への案内（自分だけに表示） |

### 設定（管理者・デフォルトで Administrator 権限）

| コマンド | 説明 |
|----------|------|
| `/setup-notion` | Tasks / Projects / AI Keys DB を接続（必須 3 つ + 任意 `member_map_database_id`） |
| `/setup-timezone` | タイムゾーン |
| `/setup-channel` | リマインダー通知チャンネル |
| `/setup-role` | 管理者ロール |
| `/settings` | サーバー設定の概要 |
| `/member-map` | メンバー映射: `add`（`user`・任意 `display_name`・カンマ区切り `aliases`）/ `list` / `edit`（`clear_aliases` で別名クリア）/ `remove`（要 `member_map_database_id`） |
| `/disconnect-notion` | Notion 連携解除 |
| `/delete-server-settings` | サーバー設定削除（Supabase） |
| `/setup-ai-key` | `add`（任意 `model`）/ `list` / `test` / `disable` / `remove` / `priority` / `model` |
| `/usage` | `today` / `month` / `keys`（AI 使用量） |

### プロジェクト・イベント

| コマンド | 説明 |
|----------|------|
| `/project-create` | プロジェクト作成 |
| `/event-create` | イベント作成 |
| `/project-list` | 一覧（Projects DB 上の Project / Event など） |
| `/project-edit` | 編集（管理者） |
| `/project-delete` | 削除・アーカイブ（管理者） |

### Todo

| コマンド | 説明 |
|----------|------|
| `/todo` | Todo 登録（`text`、任意で `project`） |
| `/todo-list` | 一覧（任意 `filter`・任意 `project` でプロジェクト名／イベント名に紐づく Todo のみ） |
| `/todo-edit` | 編集（`/todo-list` の番号 `id`） |
| `/todo-done` | 完了 |
| `/todo-delete` | 削除／キャンセル（`hard` で管理者アーカイブ） |
| `/subtask-add` | 親番号 `parent` にサブタスク |

---

## 10. トラブルシューティング

### `disallowed intents` / 接続直後に落ちる

- Developer Portal の **Privileged Gateway Intents** と、`src/index.ts` で指定している `GatewayIntentBits` が一致しているか確認してください。

### スラッシュコマンドが表示されない

- `npm run deploy-commands` を再実行する。  
- グローバル登録の場合、反映まで数分〜最大 1 時間程度かかることがあります。開発中は `DISCORD_GUILD_ID` でギルド登録すると早いです。

### `APPLICATION_COMMAND_OPTIONS_REQUIRED_INVALID`

- Discord の仕様で、**必須オプションは任意オプションより前**に定義する必要があります。定義順は `commandDefinitions.ts` に従います。

### Notion が「接続できない」「プロパティがない」

- 使う DB すべて（Tasks / Projects / AI Keys、および映射を使う場合は **Member Map**）にインテグレーションが共有されているか。  
- DB ID が正しいか（空白を含めない）。  
- プロパティ名が `src/config/notionSchema.ts` の定義と一致しているか（映射は `MEMBER_MAP_PROPS`）。

### `Invalid path specified in request URL`（Notion）

- **ページ**の URL を **データベース**の ID として渡していないか確認する（データベースを開いた URL を使う）。  
- ID は **32 文字の英数字**、または **Notion の DB 共有 URL 全体**（`?view=` 付きでも可）を貼り付けてよい。ボット側で ID を抽出する。

### Supabase エラー

- `SUPABASE_URL` は **`https://xxxx.supabase.co` のようなプロジェクトのオリジンだけ**（`/rest/v1` などは含めない）。誤って含めた場合は起動時にオリジンへ直す処理を入れてある。  
- `SUPABASE_SERVICE_ROLE_KEY` が正しいか。  
- `guild_settings` マイグレーションが適用済みか。  
- `GUILD_SETTINGS_ENCRYPTION_KEY` が未設定または長さ不正だと暗号化周りで失敗します。

---

## 11. 関連ファイル

| パス | 内容 |
|------|------|
| `src/index.ts` | エントリ、クライアント・インテント |
| `src/commandHandler.ts` | スラッシュコマンド処理 |
| `src/commandDefinitions.ts` | コマンド定義 |
| `src/db/guildSettingsRepository.ts` | Supabase ギルド設定 |
| `src/notion/` | Notion リポジトリ |
| `src/config/notionSchema.ts` | Notion プロパティ名 |

---

## ライセンス・詳細仕様

リポジトリのライセンス表記があればそれに従います。機能要件の全文は [README.md](./README.md) を参照してください。
