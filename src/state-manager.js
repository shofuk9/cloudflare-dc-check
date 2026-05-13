// ============================================================
// Workers KV を使用した状態管理モジュール
// 前回のデータセンターステータスを保存・取得する
// ============================================================

const KV_KEY_STATUSES = 'dc_statuses';
const KV_KEY_LAST_CHECK = 'last_check';

/**
 * KV から前回のデータセンターステータスを取得
 * @param {KVNamespace} kv - Workers KV ネームスペース
 * @returns {Promise<Object|null>} 前回のステータスオブジェクト、または初回の場合は null
 */
export async function getPreviousStatuses(kv) {
  const data = await kv.get(KV_KEY_STATUSES, { type: 'json' });
  return data;
}

/**
 * 現在のデータセンターステータスを KV に保存
 * @param {KVNamespace} kv - Workers KV ネームスペース
 * @param {Map<string, {name: string, status: string, iataCode: string}>} statuses - 現在のステータス
 */
export async function saveCurrentStatuses(kv, statuses) {
  // Map を通常のオブジェクトに変換して保存
  const obj = {};
  for (const [id, data] of statuses) {
    obj[id] = data;
  }

  await kv.put(KV_KEY_STATUSES, JSON.stringify(obj));
  await kv.put(KV_KEY_LAST_CHECK, new Date().toISOString());
}

/**
 * 現在と前回のステータスを比較し、変化を検知
 * @param {Map<string, {name: string, status: string, iataCode: string}>} current - 現在のステータス
 * @param {Object|null} previous - 前回のステータス（KVから取得）
 * @returns {{incidents: Array, recoveries: Array, maintenanceStart: Array, maintenanceEnd: Array}}
 */
export function detectChanges(current, previous) {
  const changes = {
    incidents: [],       // 新規障害（partial_outage, major_outage, degraded_performance）
    recoveries: [],      // 復旧（operational に戻った）
    maintenanceStart: [], // メンテナンス開始
    maintenanceEnd: [],   // メンテナンス終了
  };

  // 初回実行時は変化なし（ベースラインを保存するのみ）
  if (!previous) {
    return changes;
  }

  for (const [id, currentData] of current) {
    const prevData = previous[id];
    const prevStatus = prevData ? prevData.status : null;
    const currStatus = currentData.status;

    // ステータスに変化がない場合はスキップ
    if (prevStatus === currStatus) continue;

    // 新しいデータセンター（前回のデータにない場合）で異常ステータスの場合
    // または ステータスが変化した場合
    if (currStatus === 'operational') {
      // 復旧: 何らかの異常状態から operational に戻った
      if (prevStatus && prevStatus !== 'operational') {
        if (prevStatus === 'under_maintenance') {
          changes.maintenanceEnd.push({
            ...currentData,
            previousStatus: prevStatus,
          });
        } else {
          changes.recoveries.push({
            ...currentData,
            previousStatus: prevStatus,
          });
        }
      }
    } else if (currStatus === 'under_maintenance') {
      // メンテナンス開始
      if (prevStatus !== 'under_maintenance') {
        changes.maintenanceStart.push({
          ...currentData,
          previousStatus: prevStatus || 'unknown',
        });
      }
    } else {
      // 障害発生: partial_outage, major_outage, degraded_performance
      if (prevStatus !== currStatus) {
        changes.incidents.push({
          ...currentData,
          previousStatus: prevStatus || 'unknown',
        });
      }
    }
  }

  return changes;
}
