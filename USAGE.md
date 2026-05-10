# Discord Project Todo Bot — 利用ガイド

本書はボットの**セットアップ・起動・スラッシュコマンド・トラブルシューティング**をまとめたものです。プロダクト要件の全体像は [README.md](./README.md) を参照してください。

---

## 前提

- **Node.js** 20 以上（`package.json` の `engines` に準拠）
- **Discord アプリケーション**（Bot トークン、Application ID）
- **Notion インテグレーション**（Secret / `NOTION_TOKEN` またはギルドごとの API キー）
- **Supabase プロジェクト**（`guild_settings` 用。マイグレーションは `supabase/migrations/`）

---

## 1. Notion 側の準備

1. [Notion インテグレーション](https://www.notion.so/my-integrations)を作成し、**Internal Integration Secret** を控える。
2. 次の **3 つのデータベース**を用意し、それぞれにインテグレーションを**接続（共有）**する。
   - **Tasks**
   - **Projects**
   - **AI Keys**（プロパティ名はコードのスキーマと一致させる。詳細は `src/config/notionSchema.ts`）
3. 各データベースの URL から **Database ID**（32 文字の UUID）を取得する。

`/setup-notion` 実行時に、Tasks / Projects / AI Keys の ID を渡します。

---

## 2. Supabase の準備

1. Supabase でプロジェクトを作成する。
2. SQL エディタまたは CLI で、`supabase/migrations/` 内のマイグレーションを適用する（少なくとも `guild_settings` テーブルが作成されること）。
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
   - `/setup-notion` … `tasks_database_id`, `projects_database_id`, `ai_keys_database_id` を指定。`api_key` は省略可（その場合 `NOTION_TOKEN` を使用）。
   - 必要に応じて `/setup-timezone`, `/setup-channel`, `/setup-role`, `/settings`。
2. AI を使う場合は `/setup-ai-key` で Notion **AI Keys** DB に行が追加されます（キーは一覧に平文は出しません）。

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
| `/setup-notion` | Tasks / Projects / AI Keys DB を接続（必須オプション 3 つ） |
| `/setup-timezone` | タイムゾーン |
| `/setup-channel` | リマインダー通知チャンネル |
| `/setup-role` | 管理者ロール |
| `/settings` | サーバー設定の概要 |
| `/disconnect-notion` | Notion 連携解除 |
| `/delete-server-settings` | サーバー設定削除（Supabase） |
| `/setup-ai-key` | `add` / `list` / `test` / `disable` / `remove` / `priority` |
| `/usage` | `today` / `month` / `keys`（AI 使用量） |

### プロジェクト・イベント

| コマンド | 説明 |
|----------|------|
| `/project-create` | プロジェクト作成 |
| `/event-create` | イベント作成 |
| `/project-list` | 一覧 |
| `/project-tasks` | プロジェクト別 Todo |
| `/project-edit` | 編集（管理者） |
| `/project-delete` | 削除・アーカイブ（管理者） |

### Todo

| コマンド | 説明 |
|----------|------|
| `/todo` | Todo 登録（`text`、任意で `project`） |
| `/todo-list` | 一覧（任意 `filter`: 自分 / 今日 / 期限超過 / 進行中） |
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

- 3 つの DB すべてにインテグレーションが共有されているか。  
- DB ID が正しいか（空白を含めない）。  
- プロパティ名が `src/config/notionSchema.ts` の定義と一致しているか。

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
