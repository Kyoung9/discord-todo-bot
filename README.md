# Discord Project Todo Bot 要件整理

運用・セットアップ手順は **[USAGE.md](./USAGE.md)** にまとめています。

---

## 1. サービス概要

本サービスは、Discord サーバー内でチームが Todo、プロジェクト、大会スケジュール、子タスクを管理できるようにする Discord ボットです。

ユーザーは Discord 上で自然文またはスラッシュコマンドから作業を入力でき、ボットは Notion データベースに保存します。AI 用 API キーが登録されている場合は、自然文からプロジェクト、イベント、親タスク、サブタスク、担当者、開始日、期限などを自動抽出します。キーがない場合は、入力内容をそのまま Todo として登録する通常の Todo ボットとして動作します。

初期 MVP では **Todo / Project / Event / Subtask 管理**を中心に実装し、議事録要約や会議ベースの Todo 生成は将来の拡張とします。

---

## 2. コア目標

```text
Discord 内でチーム業務を素早く Todo 化できるようにする。

Todo は単独の作業にも、特定 Project/Event に紐づく作業にもできる。

大きな Task の下に Subtask を作れるようにする。

大会、ハッカソン、発表、チーム課題のように開始日・終了日がある Event を管理できるようにする。

AI API キーがあれば自然文を構造化された Todo/Project/Subtask に自動変換する。

キーがない、または失敗した場合は通常 Todo ボットとして動作する。

Todo データは Notion DB に保存する。

期限または開始日が近づいたら Discord で通知する。

他の Discord サーバーにも共有可能な、サーバー別設定構造を持つ。
```

---

## 3. MVP 範囲

### 3.1 含める機能

```text
- Discord サーバー別 Notion 設定（実装: Supabase guild_settings + Notion 3 DB）
- Discord サーバー別 AI API キー設定（実装: Notion AI Keys DB）
- 複数 AI API キー登録とフォールバック
- キーがない場合の通常 Todo 登録
- Project/Event 作成
- Project/Event への Todo 紐づけ
- Parent Task / Subtask 構造
- Start Date / Due Date 管理
- 自然文 Todo 作成
- 登録前の確認
- Todo 編集
- 担当者指定
- 優先度指定
- Todo 一覧
- Project 別 Todo 一覧
- Todo 完了
- Todo キャンセル/削除
- 期限通知
- 開始日通知
- API 使用量の把握（実装: Notion AI Keys 上のカウンタ等）
- サーバー別利用制限（guild_settings / AI Key 行の上限フィールド）
```

### 3.2 MVP で除外する機能

```text
- 音声会議の録音
- STT
- 自動議事録生成
- 会議ベース Todo 生成
- Web ダッシュボード
- ガントチャート
- 複雑な課金
- Slack / LINE 連携
```

### 3.3 将来の拡張

```text
- 議事録要約
- 会議内容ベースの Todo 自動生成
- Discord 音声会議 STT
- 日次/週次レポート
- プロジェクト別進捗レポート
- ガント / カレンダービュー
- Web 管理ダッシュボード
- Notion 以外の DB 連携
```

---

## 4. 主要概念

### 4.1 Project

複数の Todo を束ねる上位単位。

例:

```text
AI Todo Bot 開発
卒研発表準備
チーム課題
サービスリリース準備
```

開始日・終了日を持てるが必須ではない。

### 4.2 Event

開始日・終了日が明確なスケジュール中心の単位。

例:

```text
ハッカソン
コンテスト
大会
発表会
面接
展示会
```

Event も Project と同様に Todo を持てる。

### 4.3 Task

実際に行う作業。

例:

```text
発表資料作成
デモデプロイ
README 修正
デザイン整理
```

単独でも、Project/Event に属してもよい。

### 4.4 Parent Task / Subtask

大きな作業は子タスクを持てる。

例:

```text
発表準備
├─ スライド作成
├─ 原稿作成
└─ 発表練習
```

上位を Parent Task、下位を Subtask として管理する。

---

## 5. 主要ユーザーフロー

### 5.1 初期設定

管理者が Discord サーバーにボットを招待し、Notion を接続する。

```text
/setup-notion
```

入力（実装に合わせた必須項目）:

```text
- tasks_database_id（Tasks DB）
- projects_database_id（Projects DB）
- ai_keys_database_id（AI Keys DB）
- api_key（任意。省略時は環境変数 NOTION_TOKEN）
```

任意で AI API キーを登録する。

```text
/setup-ai-key add
```

入力例:

```text
- Provider: openai
- Key Name: main-key
- API Key
- Priority
```

設定が完了すると、その Discord サーバーで Todo 機能を使える。

### 5.2 AI API キーがある場合

ユーザー入力例:

```text
/todo 6月1日からハッカソンが始まるから、その前に発表資料を作ってデモをデプロイしてデザインを整えないと
```

ボット処理:

```text
1. サーバー設定確認（Supabase guild_settings）
2. 利用可能な AI API キー選択（Notion AI Keys DB）
3. AI API 呼び出し
4. Project/Event と Todo 候補の抽出
5. 開始日、期限、担当者の抽出
6. Discord で確認メッセージ表示
7. ユーザーが登録/修正/キャンセル
8. 登録時に Notion DB へ保存
```

### 5.3 AI API キーがない場合

```text
/todo 発表資料を書く
```

処理:

```text
1. サーバー設定確認
2. AI キーなし
3. 入力文をそのまま Todo タイトルに
4. 登録前確認
5. Notion Tasks DB に保存
```

### 5.4 Parent Task と Subtask

```text
/todo 発表準備でスライドと原稿と練習が必要
```

AI 利用時は親子構造を提案し、`/subtask-add` で手動追加も可能。

### 5.5 AI キーがすべて失敗した場合

フォールバックで入力文をそのまま Todo タイトルにする通常モードへ切り替える。

---

## 6. 機能要件

### 6.1 サーバー別設定

Discord ギルドごとに別設定を保存する。

保存項目（実装の主な対応）:

```text
- Discord Guild ID
- Notion API Key（ギルド用・Supabase 上で暗号化。未設定時は NOTION_TOKEN）
- Notion Tasks / Projects / AI Keys Database ID
- AI 利用可否
- Timezone
- Reminder Channel ID
- Admin Role ID
- 日次 AI リクエスト/トークン上限（guild_settings）
```

コマンド:

```text
/setup-notion
/setup-timezone
/setup-channel
/setup-role
/settings
/disconnect-notion
/delete-server-settings
```

### 6.2 Notion 連携

管理者はスラッシュコマンドで Notion と 3 つの DB を登録できる。

接続時の検証例:

```text
- Notion API が有効か
- Tasks / Projects / AI Keys の各 DB ID が有効か
- インテグレーションが各 DB に接続されているか
- 必須プロパティが存在するか
```

### 6.3 AI API キー登録

サーバーごとに複数キーを登録できる（Notion AI Keys DB 上の行）。

```text
/setup-ai-key add | list | test | disable | remove | priority
```

一覧では実キーは表示しない。

### 6.4 AI キーのフォールバック

複数キーがある場合、active・クールダウンでない・上限未満・priority 順などで選択し、失敗時は次のキーを試す。すべて失敗すれば通常 Todo モード。

### 6.5 Project/Event 作成

```text
/project-create name: … start: … end: …
/event-create name: … start: … end: …
```

### 6.6 Project/Event に Todo を紐づける

```text
/todo project:ハッカソン text: …
```

自然文から AI が検出することもある。

### 6.7 Parent Task / Subtask

```text
/todo text: …
/subtask-add parent:1 title: …
```

### 6.8 Todo 作成

`/todo`。AI 有効時は自然文解析、無効時はタイトルとしてそのまま扱う。

### 6.9 登録前確認

AI の有無にかかわらず、即保存せず確認ステップを挟む（ボタン等）。

### 6.10 Todo 編集

`/todo-edit` および確認 UI の「修正」。

### 6.11 担当者

Assignee Name / Discord ID / Mention を Notion に保存。メンション時は ID を保存。

### 6.12 開始日 / 期限

サーバーの timezone（既定 `Asia/Tokyo`）基準で解釈。

### 6.13 Todo 一覧

`/todo-list` とフィルタ（`mine` / `today` / `overdue` / `doing` など）および **任意の `project`**（Projects DB 上の**プロジェクト名またはイベント名**で紐づく Todo のみ表示）。

### 6.14 Todo 完了

`/todo-done`。Status を Done にし、Done By / Done At を記録。

### 6.15 Todo 削除 / キャンセル

`/todo-delete`。推奨は Canceled で履歴を残す。管理者は `hard` でアーカイブ等。

### 6.16 通知

スケジューラが Notion を参照し、開始当日・期限 24h/3h/1h・期限超過などを通知。重複は Notion 上のチェックボックス等で防止。

---

## 7. API 使用量

### 7.1 記録対象

ギルド ID、キー識別、プロバイダ、モデル、トークン数、成否、フォールバック有無など（実装は Notion AI Keys 行のプロパティや集計に依存）。

### 7.2 リセット基準

サーバー timezone の日付変更で「当日」カウンタをリセットする想定。

### 7.3 制限

リクエスト数とトークン数の両方を制限可能（guild_settings およびキー行の上限フィールド）。

### 7.4 上限超過時

AI を使わず通常 Todo 登録へフォールバック。

### 7.5 使用量コマンド

```text
/usage today
/usage month
/usage keys
```

---

## 8. 権限

### 8.1 管理者

Notion/AI 設定、チャンネル・ロール、設定削除、Project 削除など。

判定: Discord の管理者権限、または登録された管理者ロール。

### 8.2 一般ユーザー

Todo 作成・一覧・（ポリシーに応じた）完了・編集など。

---

## 9. セキュリティ

```text
- ギルド用 Notion Secret は平文で DB に置かず暗号化（Supabase guild_settings）
- Discord 上で API キーを晒さない。設定応答は ephemeral 等
- ログやエラーにキーを含めない
- list では実キーを表示しない
```

環境変数例:

```env
GUILD_SETTINGS_ENCRYPTION_KEY=64文字hex推奨
```

**実装上の注意:** AI 用キーは Notion AI Keys DB のプロパティに保存される。Notion 側のアクセス権限とページ共有範囲を厳格に管理すること。

---

## 10. データベース設計

### 10.1 `guild_settings`（Supabase）

Discord サーバー別の接続・設定を保存するテーブル（マイグレーション参照）。

```text
id (uuid)
discord_guild_id (unique)
guild_name
notion_tasks_database_id
notion_projects_database_id
notion_ai_keys_database_id
notion_api_key_encrypted（nullable。未設定時は NOTION_TOKEN）
ai_enabled
timezone
reminder_channel_id
admin_role_id
daily_ai_request_limit
daily_ai_token_limit
created_by_discord_user_id
created_at
updated_at
```

### 10.2 AI Keys（Notion データベース）

サーバー別の LLM キーと使用量カウンタを **ページ（行）** として保持。プロパティ名は `src/config/notionSchema.ts` の `AI_KEYS_PROPS` に定義（例: Name, Discord Guild ID, Provider, API Key, Priority, Status, Daily Request Limit, Today Request Count など）。

### 10.3 旧要件での SQL テーブル案（参考）

元ドキュメントの `ai_api_keys` / `ai_usage_logs` / `guild_daily_usage` などの **専用 SQL テーブル**は、現行実装では Notion 側プロパティと Supabase `guild_settings` に役割が集約されている。将来、PostgreSQL に移行する場合の設計メモとして残せる。

### 10.4 `task_action_logs`（参考）

Todo 変更履歴を専用テーブルに残す要件は、実装状況に応じて Notion または将来の DB で補完可能。

---

## 11. Notion DB 設計

### 11.1 Projects DB

| プロパティ名 | 型 | 説明 |
|-------------|-----|------|
| Name | Title | 名称 |
| Type | Select | Project / Event / … |
| Status | Select | Planning / Active / Done / Canceled |
| Start Date | Date | 開始日 |
| End Date | Date | 終了日 |
| Description | Text | 説明 |
| Discord Guild ID | Text | ギルド ID |
| Created By | Text | 作成者 |
| Created At | Date | 作成日時 |
| Updated At | Date | 更新日時 |

### 11.2 Tasks DB

| プロパティ名 | 型 | 説明 |
|-------------|-----|------|
| Title | Title | Todo タイトル |
| Description | Text | 詳細 |
| Status | Select | Todo / Doing / Review / Done / Canceled |
| Project | Relation | Projects へ |
| Parent Task | Relation | 親タスク |
| Task Level | Select | Single / Parent / Subtask |
| Assignee Name | Text | 担当者名 |
| Assignee Discord ID | Text | 担当者 Discord ID |
| Assignee Mention | Text | メンション文字列 |
| Start Date | Date | 開始 |
| Due Date | Date | 期限 |
| Priority | Select | High / Medium / Low |
| Source Type | Select | manual / ai_text 等 |
| Source Text | Text | 元入力 |
| Discord Guild ID | Text | ギルド ID |
| Discord Channel ID | Text | 作成チャンネル |
| Created By | Text | 作成者 |
| Created At / Updated At | Date | 日時 |
| Done By / Done At | Text/Date | 完了情報 |
| Start Notified / Reminded 24h / 3h / 1h / Overdue Notified | Checkbox | 通知済みフラグ |

### 11.3 AI Keys DB

| プロパティ名 | 型 | 説明 |
|-------------|-----|------|
| Name | Title | キー識別名 |
| Discord Guild ID | Text | ギルド ID |
| Provider | Select | openai / google / anthropic |
| API Key | Text | プロバイダのシークレット |
| **Model** | Text | **任意** — そのキーで使うモデル ID（未設定時はホストの環境変数 `OPENAI_MODEL` 等・コード既定） |
| Priority | Number | 小さいほど優先 |
| Status / Failure Count / Cooldown… | 既存どおり | 運用・上限カウンタ |

---

## 12. 主要コマンド一覧

### 12.1 設定

```text
/setup-notion
/setup-ai-key …
/setup-timezone
/setup-channel
/setup-role
/settings
/disconnect-notion
/delete-server-settings
```

### 12.2 Project/Event

```text
/project-create
/event-create
/project-list
/project-edit
/project-delete
```

（`/event-create` は **Projects DB** に `Type: Event` の行を作成する。Todo の一覧絞り込みは `/todo-list` の `project` オプションで行う。）

### 12.3 Todo

```text
/todo
/todo-list
/todo-edit
/todo-done
/todo-delete
/subtask-add
```

### 12.4 使用量

```text
/usage today
/usage month
/usage keys
```

---

## 13. AI 処理要件

自然文を次のいずれかに分類: 単一 Todo、複数 Todo、Project/Event 作成、紐づく Todo、Parent + Subtasks など。

抽出項目例: `detectedType`、project、tasks、parentTask、subtasks、assignee、日付、priority、confidence、questions。

低信頼時は確認質問を返し、即登録しない。

---

## 14. 通知要件

Done/Canceled 以外で日付がある行を対象に、開始当日・期限前後・超過を通知。Notion 上の通知済みフラグで重複を防ぐ。

---

## 15. エラー処理（メッセージ方針）

- Notion 接続失敗: キー、インテグレーション共有、DB ID、必須プロパティを確認するよう案内。
- AI 失敗: 次のキーを試し、全滅時は通常 Todo へ。
- 権限不足: 管理者のみ等と明示。
- 未設定: `/setup-notion` を先に実行するよう案内。

---

## 16. 非機能要件

- **使いやすさ:** 自然文登録、AI なしでも利用可、登録前確認。
- **セキュリティ:** シークレットの取り扱い、管理者コマンド。
- **拡張性:** サーバー別設定、Repository 分離、プロバイダ追加余地。
- **安定性:** AI/キー失敗時のフォールバック、通知の重複防止。

---

## 17. システム構成（現行実装の整理）

```text
Discord
  ↓
discord.js Bot（intents は src/index.ts 参照）
  ↓
Command Handler
  ↓
Guild Settings（Supabase guild_settings）
  ↓
Project / Todo / AI 各サービス
  ↓
Notion Client
  ↓
Notion: Projects DB / Tasks DB / AI Keys DB
```

AI キー選択〜フォールバック、リマインダースケジューラは各モジュール（`src/`）に実装。

---

## 18. 開発フェーズ（ロードマップ）

### Phase 1: 基本 Todo + Notion

Bot、`/setup-notion`、`/todo`、確認、Tasks 保存、`/todo-list`、`/todo-done`。

### Phase 2: Project/Event

Projects 連携、`/project-create`、`/event-create`（同一 Projects DB）、紐づけ、`/todo-list project:`、日付。

### Phase 3: Subtask

Parent Task、`/subtask-add`、一覧表示。

### Phase 4: AI

`/setup-ai-key`、抽出、確認 UI、フォールバック。

### Phase 5: 複数キー

Notion AI Keys 上での priority・状態・フォールバック。

### Phase 6: 通知

開始・期限のスケジュール、重複防止、チャンネル設定。

### Phase 7: 使用量

キー別・日次の集計と `/usage`、上限時フォールバック。

### Phase 8: 議事録（将来）

`/meeting-text` 等。

---

## 19. 最終まとめ

本プロジェクトは、Discord 上でチームの Todo、Project、Event、Subtask を管理する Notion 連携タスクボットである。

初版では Todo 作成、Project/Event 連携、親子タスク、日付管理、通知に焦点を当てる。AI キーがある場合は自然文から構造化し、ない場合や失敗時は通常 Todo として動作する。

サーバー別設定、複数 AI キー、フォールバック、利用制限、Notion 連携により、他チームへ展開しやすい構成を目指す。**セットアップとコマンドの実手順は [USAGE.md](./USAGE.md) を参照。**
