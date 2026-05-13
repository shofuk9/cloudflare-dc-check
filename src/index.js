// ============================================================
// Cloudflare データセンター ステータス監視 Worker
// メインエントリーポイント
//
// 環境変数:
//   MONITORED_DCS    - 監視対象DCのIATAコード（カンマ区切り）例: "NRT,KIX"
//   SLACK_WEBHOOK_URL - Slack Incoming Webhook URL（シークレット）
//
// KVバインディング:
//   STATUS_KV        - ステータス保存用KVネームスペース
// ============================================================

import { fetchDataCenterStatuses } from './status-fetcher.js';
import { getPreviousStatuses, saveCurrentStatuses, detectChanges } from './state-manager.js';
import {
  sendIncidentNotification,
  sendRecoveryNotification,
  sendMaintenanceStartNotification,
  sendMaintenanceEndNotification,
} from './slack-notifier.js';

export default {
  /**
   * Cron Trigger ハンドラー
   * 5分ごとにCloudflareデータセンターのステータスを確認し、
   * 変化があればSlackに通知を送信する
   */
  async scheduled(controller, env, ctx) {
    try {
      console.log(`[${new Date().toISOString()}] ステータスチェック開始...`);

      // 環境変数から監視対象データセンターを取得
      const monitoredCodes = (env.MONITORED_DCS || 'NRT,KIX')
        .split(',')
        .map((code) => code.trim().toUpperCase());

      console.log(`監視対象DC: ${monitoredCodes.join(', ')}`);

      // 1. Cloudflare Status API から現在のステータスを取得
      const currentStatuses = await fetchDataCenterStatuses(monitoredCodes);
      console.log(`取得したDC数: ${currentStatuses.size}`);

      if (currentStatuses.size === 0) {
        console.warn('監視対象のデータセンターが見つかりませんでした。MONITORED_DCS の設定を確認してください。');
        return;
      }

      // 現在のステータスをログ出力
      for (const [id, data] of currentStatuses) {
        console.log(`  ${data.iataCode} (${data.name}): ${data.status}`);
      }

      // 2. KV から前回のステータスを取得
      const previousStatuses = await getPreviousStatuses(env.STATUS_KV);
      const isFirstRun = !previousStatuses;

      if (isFirstRun) {
        console.log('初回実行: ベースラインステータスを保存します。');
      }

      // 3. ステータスの変化を検知
      const changes = detectChanges(currentStatuses, previousStatuses);

      const hasChanges =
        changes.incidents.length > 0 ||
        changes.recoveries.length > 0 ||
        changes.maintenanceStart.length > 0 ||
        changes.maintenanceEnd.length > 0;

      if (hasChanges) {
        console.log(
          `変化検知: 障害=${changes.incidents.length}, 復旧=${changes.recoveries.length}, ` +
          `メンテ開始=${changes.maintenanceStart.length}, メンテ終了=${changes.maintenanceEnd.length}`
        );

        // 4. Slack 通知を送信
        const webhookUrl = env.SLACK_WEBHOOK_URL;
        if (!webhookUrl) {
          console.error('SLACK_WEBHOOK_URL が設定されていません。通知をスキップします。');
        } else {
          // 障害通知
          if (changes.incidents.length > 0) {
            await sendIncidentNotification(webhookUrl, changes.incidents);
            console.log('障害通知を送信しました。');
          }

          // 復旧通知
          if (changes.recoveries.length > 0) {
            await sendRecoveryNotification(webhookUrl, changes.recoveries);
            console.log('復旧通知を送信しました。');
          }

          // メンテナンス開始通知
          if (changes.maintenanceStart.length > 0) {
            await sendMaintenanceStartNotification(webhookUrl, changes.maintenanceStart);
            console.log('メンテナンス開始通知を送信しました。');
          }

          // メンテナンス終了通知
          if (changes.maintenanceEnd.length > 0) {
            await sendMaintenanceEndNotification(webhookUrl, changes.maintenanceEnd);
            console.log('メンテナンス終了通知を送信しました。');
          }
        }
      } else {
        console.log('ステータスに変化はありません。');
      }

      // 5. 現在のステータスを KV に保存
      await saveCurrentStatuses(env.STATUS_KV, currentStatuses);
      console.log('ステータスを保存しました。');

    } catch (error) {
      console.error(`エラーが発生しました: ${error.message}`);
      console.error(error.stack);

      // エラー時もSlack通知を試みる
      try {
        if (env.SLACK_WEBHOOK_URL) {
          await fetch(env.SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              blocks: [
                {
                  type: 'header',
                  text: {
                    type: 'plain_text',
                    text: '⚠️ ステータス監視システムエラー',
                    emoji: true,
                  },
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `ステータス監視処理中にエラーが発生しました:\n\`\`\`${error.message}\`\`\``,
                  },
                },
              ],
            }),
          });
        }
      } catch (notifyError) {
        console.error(`エラー通知の送信にも失敗: ${notifyError.message}`);
      }
    }
  },

  /**
   * HTTP リクエストハンドラー（手動テスト・ステータス確認用）
   * GET / でシステムの状態を確認可能
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      const monitoredCodes = (env.MONITORED_DCS || 'NRT,KIX')
        .split(',')
        .map((code) => code.trim().toUpperCase());

      let statusInfo;
      try {
        const currentStatuses = await fetchDataCenterStatuses(monitoredCodes);
        const previousStatuses = await getPreviousStatuses(env.STATUS_KV);

        statusInfo = {
          system: 'Cloudflare DC Status Monitor',
          monitoredDataCenters: monitoredCodes,
          currentStatuses: Object.fromEntries(currentStatuses),
          hasWebhook: !!env.SLACK_WEBHOOK_URL,
          hasPreviousData: !!previousStatuses,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        statusInfo = {
          system: 'Cloudflare DC Status Monitor',
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }

      return new Response(JSON.stringify(statusInfo, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};
