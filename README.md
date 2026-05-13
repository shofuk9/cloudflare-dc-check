# Cloudflare DC Status Monitor

Cloudflare データセンターのステータスを定期監視し、障害・復旧・メンテナンスの変化を検知して Slack に通知する **Cloudflare Workers** アプリケーションです。

## 機能

- 🔍 **定期監視** — 5分ごとに [Cloudflare Status API](https://www.cloudflarestatus.com/api/v2/components.json) をチェック
- 🔴 **障害検知** — `partial_outage` / `major_outage` / `degraded_performance` を検知して通知
- 🟢 **復旧通知** — 障害状態から `operational` に戻った際に通知
- 🔧 **メンテナンス通知** — 定期メンテナンスの開始・終了を通知
- 💬 **Slack 連携** — Block Kit 形式のリッチな通知メッセージを送信
- 📊 **ステータス確認 API** — HTTP エンドポイント (`GET /`) で現在のステータスを JSON で取得

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
```

## 前提条件

- [Node.js](https://nodejs.org/) v18 以降
- [Cloudflare アカウント](https://dash.cloudflare.com/sign-up)（無料プランで利用可能）
- [Slack Incoming Webhook URL](https://api.slack.com/messaging/webhooks)

## セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/<your-username>/cloudflare-dc-check.git
cd cloudflare-dc-check
```

### 2. 依存パッケージのインストール

```bash
npm install
```

### 3. Cloudflare へのログイン

```bash
npx wrangler login
```

### 4. Workers KV ネームスペースの作成

```bash
npx wrangler kv:namespace create STATUS_KV
```

出力される `id` を `wrangler.toml` の `[[kv_namespaces]]` セクションに設定してください：

```toml
[[kv_namespaces]]
binding = "STATUS_KV"
id = "<ここに出力されたIDを貼り付け>"
```

### 5. 監視対象データセンターの設定

`wrangler.toml` の `[vars]` セクションで、監視したいデータセンターの [IATA 空港コード](https://ja.wikipedia.org/wiki/IATA%E7%A9%BA%E6%B8%AF%E3%82%B3%E3%83%BC%E3%83%89) をカンマ区切りで指定します：

```toml
[vars]
MONITORED_DCS = "NRT,KIX"   # 東京（成田）、大阪（関空）
```

全データセンターを監視する場合は `"ALL"` を指定してください。

#### 主な日本のデータセンター

| IATA コード | 場所 |
|------------|------|
| NRT | 東京（成田） |
| KIX | 大阪（関西） |
| FUK | 福岡 |

### 6. Slack Webhook URL の設定

Slack Incoming Webhook URL をシークレットとして設定します：

```bash
npx wrangler secret put SLACK_WEBHOOK_URL
```

プロンプトが表示されたら、Webhook URL を入力してください。

> **⚠️ 注意**: Webhook URL は `wrangler secret` で安全に管理されます。コードや `wrangler.toml` にハードコードしないでください。

### 7. デプロイ

```bash
npm run deploy
```

## ローカル開発

```bash
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

MIT
