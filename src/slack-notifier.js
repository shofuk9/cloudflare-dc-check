// ============================================================
// Slack Incoming Webhook を使用した通知モジュール
// Block Kit 形式でリッチなメッセージを送信
// ============================================================

import { getStatusLabel } from './status-fetcher.js';

/**
 * Slack Incoming Webhook にメッセージを送信
 * @param {string} webhookUrl - Slack Webhook URL
 * @param {Object} payload - Slack メッセージペイロード
 */
async function postToSlack(webhookUrl, payload) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Slack webhook failed: ${response.status} - ${body}`);
  }
}

/**
 * 現在時刻を JST（日本標準時）フォーマットで取得
 * @returns {string} JST形式の日時文字列
 */
function getJstTimestamp() {
  const now = new Date();
  return now.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 障害通知メッセージを構築して送信
 * @param {string} webhookUrl - Slack Webhook URL
 * @param {Array} incidents - 障害が発生したデータセンターの配列
 */
export async function sendIncidentNotification(webhookUrl, incidents) {
  const timestamp = getJstTimestamp();

  const dcList = incidents
    .map((dc) => `• *${dc.name}*\n  ステータス: ${getStatusLabel(dc.status)}`)
    .join('\n');

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔴 Cloudflare データセンター障害検知',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '以下のデータセンターで障害が発生しています:',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: dcList,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `検知時刻: ${timestamp} (JST) | <https://www.cloudflarestatus.com|Cloudflare Status Page>`,
          },
        ],
      },
      { type: 'divider' },
    ],
  };

  await postToSlack(webhookUrl, payload);
}

/**
 * 復旧通知メッセージを構築して送信
 * @param {string} webhookUrl - Slack Webhook URL
 * @param {Array} recoveries - 復旧したデータセンターの配列
 */
export async function sendRecoveryNotification(webhookUrl, recoveries) {
  const timestamp = getJstTimestamp();

  const dcList = recoveries
    .map((dc) => `• *${dc.name}*\n  ステータス: ${getStatusLabel(dc.status)}（復旧前: ${getStatusLabel(dc.previousStatus)}）`)
    .join('\n');

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🟢 Cloudflare データセンター復旧通知',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '以下のデータセンターが復旧しました:',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: dcList,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `復旧時刻: ${timestamp} (JST) | <https://www.cloudflarestatus.com|Cloudflare Status Page>`,
          },
        ],
      },
      { type: 'divider' },
    ],
  };

  await postToSlack(webhookUrl, payload);
}

/**
 * メンテナンス開始通知メッセージを構築して送信
 * @param {string} webhookUrl - Slack Webhook URL
 * @param {Array} maintenanceList - メンテナンス開始したデータセンターの配列
 */
export async function sendMaintenanceStartNotification(webhookUrl, maintenanceList) {
  const timestamp = getJstTimestamp();

  const dcList = maintenanceList
    .map((dc) => `• *${dc.name}*\n  ステータス: ${getStatusLabel(dc.status)}`)
    .join('\n');

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔧 Cloudflare データセンター 定期メンテナンス開始',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '以下のデータセンターで *定期メンテナンス* が開始されました。\nこれは計画的な作業であり、トラフィックは一時的に他のデータセンターへリルートされます。',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: dcList,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `検知時刻: ${timestamp} (JST) | <https://www.cloudflarestatus.com|Cloudflare Status Page>`,
          },
        ],
      },
      { type: 'divider' },
    ],
  };

  await postToSlack(webhookUrl, payload);
}

/**
 * メンテナンス終了通知メッセージを構築して送信
 * @param {string} webhookUrl - Slack Webhook URL
 * @param {Array} maintenanceList - メンテナンス終了したデータセンターの配列
 */
export async function sendMaintenanceEndNotification(webhookUrl, maintenanceList) {
  const timestamp = getJstTimestamp();

  const dcList = maintenanceList
    .map((dc) => `• *${dc.name}*\n  ステータス: ${getStatusLabel(dc.status)}（メンテナンス完了）`)
    .join('\n');

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '✅ Cloudflare データセンター 定期メンテナンス終了',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '以下のデータセンターの *定期メンテナンス* が完了し、正常稼働に復帰しました:',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: dcList,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `完了時刻: ${timestamp} (JST) | <https://www.cloudflarestatus.com|Cloudflare Status Page>`,
          },
        ],
      },
      { type: 'divider' },
    ],
  };

  await postToSlack(webhookUrl, payload);
}
