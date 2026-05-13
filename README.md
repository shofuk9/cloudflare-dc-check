# Cloudflare DC Status Monitor

Cloudflare データセンターのステータスを定期監視し、障害・復旧・メンテナンスの変化を検知して Slack に通知する **Cloudflare Workers** アプリケーションです。

## 機能

- 🔍 **定期監視** — 5分ごとに [Cloudflare Status API](https://www.cloudflarestatus.com/api/v2/components.json) をチェック
- 🔴 **障害検知** — `partial_outage` / `major_outage` / `degraded_performance` を検知して通知
- 🟢 **復旧通知** — 障害状態から `operational` に戻った際に通知
- 🔧 **メンテナンス通知** — 定期メンテナンスの開始・終了を通知
- 💬 **Slack 連携** — Block Kit 形式のリッチな通知メッセージを送信
- 📊 **ステータス確認 API** — HTTP エンドポイント (`GET /`) で現在のステータスを JSON で取得
- 🚀 **GitHub Actions 対応** — プッシュするだけで自動デプロイ

## アーキテクチャ

```
Cloudflare Status API
        │
        ▼
┌─────────────────────┐
│  Cron Trigger (5分)  │
│  ┌───────────────┐  │
│  │ status-fetcher│──── API からDCステータスを取得
│  │ state-manager │──── KV で前回値と比較・変化検知
│  │ slack-notifier│──── 変化があれば Slack に通知
│  └───────────────┘  │
│    Workers KV        │──── ステータスの永続化
└─────────────────────┘
```

### ファイル構成

```
src/
├── index.js            # メインエントリーポイント（Cron / HTTP ハンドラー）
├── status-fetcher.js   # Cloudflare Status API からのデータ取得
├── state-manager.js    # Workers KV を使ったステータスの保存・比較・変化検知
└── slack-notifier.js   # Slack Incoming Webhook への通知送信
.github/
└── workflows/
    └── deploy.yml      # GitHub Actions 自動デプロイ設定
```

## クイックスタート

このリポジトリをフォークまたはクローンして、自分の環境にデプロイする手順です。

### 必要なもの

| 項目 | 説明 | 取得方法 |
|-----|------|---------|
| Cloudflare アカウント | Workers を実行するためのアカウント | [無料登録](https://dash.cloudflare.com/sign-up) |
| Cloudflare API トークン | Workers のデプロイに必要 | [作成手順](#1-cloudflare-api-トークンの作成) |
| Cloudflare アカウント ID | Workers のデプロイ先を指定 | [ダッシュボード](https://dash.cloudflare.com) のサイドバーに表示 |
| Slack Incoming Webhook URL | 通知先の Slack チャンネル | [作成手順](#2-slack-incoming-webhook-の設定) |

---

### 1. Cloudflare API トークンの作成

1. [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) にアクセス
2. **「トークンを作成」** をクリック
3. **「Edit Cloudflare Workers」** テンプレートを選択
4. アカウントリソースで自分のアカウントを選択
5. **「概要に進む」→「トークンを作成」** をクリック
6. 表示されたトークンをコピー（⚠️ この画面を閉じると再表示できません）

### 2. Slack Incoming Webhook の設定

1. [Slack API: Incoming Webhooks](https://api.slack.com/messaging/webhooks) にアクセス
2. **「Create your Slack app」** からアプリを作成
3. **「Incoming Webhooks」** を有効化
4. **「Add New Webhook to Workspace」** で通知先チャンネルを選択
5. 生成された Webhook URL（`https://hooks.slack.com/services/...`）をコピー

### 3. KV ネームスペースの作成

ローカルに `wrangler` がある場合：

```bash
npx wrangler kv:namespace create STATUS_KV
```

または、[Cloudflare ダッシュボード](https://dash.cloudflare.com) → **Workers & Pages** → **KV** から GUI で作成できます。

出力された（または画面に表示された）**Namespace ID** をコピーしてください。

### 4. wrangler.toml の編集（ローカルデプロイの場合のみ）

> ⚠️ **GitHub Actions で自動デプロイする場合、この手順は不要です。** 次の「デプロイ方法」に進んでください。

ローカル環境から手動でデプロイする場合は、`wrangler.toml` を開き、プレースホルダーを自分の環境に合わせて直接編集してください：

```toml
# 監視対象データセンター（カンマ区切りのIATAコード）
[vars]
MONITORED_DCS = "NRT,KIX"  # ${MONITORED_DCS} から書き換え

# KV ネームスペース ID を設定
[[kv_namespaces]]
binding = "STATUS_KV"
id = "<ステップ3で取得したID>"  # ${KV_NAMESPACE_ID} から書き換え
```

#### 主な日本のデータセンター

| IATA コード | 場所 |
|------------|------|
| NRT | 東京（成田） |
| KIX | 大阪（関西） |
| FUK | 福岡 |

> 💡 全データセンターを監視する場合は `MONITORED_DCS = "ALL"` を指定してください。

---

## デプロイ方法

### 方法 A: GitHub Actions で自動デプロイ（推奨）

ローカルに `wrangler` をインストールせず、GitHub だけで完結する方法です。

#### GitHub Secrets と Variables の設定

リポジトリの **Settings** → **Secrets and variables** → **Actions** で以下の設定を行います：

**1. Secrets (シークレット)** 
以下の 3 つを登録します：

| Secret 名 | 値 | 説明 |
|-----------|---|------|
| `CLOUDFLARE_API_TOKEN` | `xxxxxxxx` | ステップ1で取得した API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | `xxxxxxxx` | Cloudflare ダッシュボードに表示されるアカウント ID |
| `SLACK_WEBHOOK_URL` | `https://hooks.slack.com/services/...` | ステップ2で取得した Webhook URL |
| `KV_NAMESPACE_ID` | `xxxxxxxxxxxxxxxx` | ステップ3で取得した KV の ID |

**2. Variables (変数) - 任意**
必要に応じて **Variables** タブに以下を登録します（登録しない場合はデフォルトで `NRT,KIX` が設定されます）：

| Variable 名 | 値の例 | 説明 |
|-------------|-------|------|
| `MONITORED_DCS` | `NRT,KIX,FUK` | 監視対象のIATAコード（カンマ区切り）。全監視は `ALL` |

#### デプロイ実行

設定完了後、`main` ブランチにプッシュすると自動でデプロイされます。

```bash
git add .
git commit -m "setup: 環境設定を更新"
git push
```

GitHub リポジトリの **Actions** タブでデプロイの進行状況を確認できます。

> 💡 **手動デプロイ**: Actions タブ →「Deploy to Cloudflare Workers」→「Run workflow」からも実行可能です。

### 方法 B: ローカルから手動デプロイ

```bash
# 1. 依存パッケージをインストール
npm install

# 2. Cloudflare にログイン
npx wrangler login

# 3. Slack Webhook URL をシークレットとして設定
npx wrangler secret put SLACK_WEBHOOK_URL

# 4. デプロイ
npm run deploy
```

---

## ローカル開発

```bash
npm install
npm run dev
```

開発サーバーが起動し、以下が利用可能になります：

- **HTTP エンドポイント**: `http://localhost:8787/` — 現在のステータスを JSON で確認
- **Cron テスト**: `--test-scheduled` フラグにより、Cron Trigger の手動実行が可能

ローカル環境でシークレットを使用する場合は、プロジェクトルートに `.dev.vars` ファイルを作成してください：

```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxxxx/xxxxx/xxxxx
```

> `.dev.vars` は `.gitignore` に含まれているため、Git にコミットされません。

---

## 通知メッセージ例

### 障害検知

> 🔴 **Cloudflare データセンター障害検知**
>
> 以下のデータセンターで障害が発生しています:
> - **Tokyo, Japan - (NRT)** ステータス: 🔴 部分的障害（リルート中）
>
> 検知時刻: 2024/01/15 14:30:00 (JST)

### 復旧通知

> 🟢 **Cloudflare データセンター復旧通知**
>
> 以下のデータセンターが復旧しました:
> - **Tokyo, Japan - (NRT)** ステータス: ✅ 正常稼働

### メンテナンス通知

> 🔧 **Cloudflare データセンター 定期メンテナンス開始**
>
> 以下のデータセンターで定期メンテナンスが開始されました。

---

## コスト

このプロジェクトは **Cloudflare Workers 無料プラン** の範囲内で運用できます：

| リソース | 使用量（1日あたり） | 無料枠 |
|---------|-------------------|--------|
| Workers リクエスト | 288回（5分×24時間×1cron） | 100,000回/日 |
| Workers KV 読み取り | 288回 | 100,000回/日 |
| Workers KV 書き込み | 576回（2回×288） | 1,000回/日 |

## ステータス種別

Cloudflare Status API が返すステータス値と、本システムでの扱いは以下の通りです：

| ステータス | 表示 | 通知種別 |
|-----------|------|---------|
| `operational` | ✅ 正常稼働 | 復旧通知（障害/メンテからの復帰時） |
| `degraded_performance` | ⚠️ パフォーマンス低下 | 障害通知 |
| `partial_outage` | 🔴 部分的障害（リルート中） | 障害通知 |
| `major_outage` | 🔴 重大障害 | 障害通知 |
| `under_maintenance` | 🔧 定期メンテナンス | メンテナンス通知 |

## ライセンス

[MIT](LICENSE)
