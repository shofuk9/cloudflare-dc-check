// ============================================================
// Cloudflare Status API からデータセンターのステータスを取得
// ============================================================

const STATUS_API_URL = 'https://www.cloudflarestatus.com/api/v2/components.json';

// Cloudflare Sites and Services のグループID（サービスコンポーネントの親）
const SERVICES_GROUP_ID = '1km35smx8p41';

// リージョングループID一覧（データセンターの親グループ）
// これらのグループに属するコンポーネントがデータセンター
const REGION_GROUP_IDS = new Set([
  '00gpj4s37mz4', // Africa
  '77867vxkttgw', // Asia
  'zqxhg7y54vy8', // Europe
  '91blz4ztt7dm', // Latin America & the Caribbean
  'm3639x4txd08', // Middle East
  '4l01sk5cdn5c', // North America
  'q6qm6fvkst4h', // Oceania
]);

/**
 * データセンター名からIATAコード（空港コード）を抽出
 * 例: "Tokyo, Japan - (NRT)" → "NRT"
 * @param {string} name - データセンター名
 * @returns {string|null} IATAコード、または抽出できない場合は null
 */
function extractIataCode(name) {
  const match = name.match(/\(([A-Z]{3})\)/);
  return match ? match[1] : null;
}

/**
 * Cloudflare Status API からデータセンターのステータスを取得
 * @param {string[]} monitoredCodes - 監視対象のIATAコード配列。['ALL'] の場合は全DC
 * @returns {Promise<Map<string, {name: string, status: string, iataCode: string}>>}
 */
export async function fetchDataCenterStatuses(monitoredCodes) {
  const response = await fetch(STATUS_API_URL);

  if (!response.ok) {
    throw new Error(`Status API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const components = data.components || [];

  // データセンターコンポーネントのみフィルタリング
  // - group: false（グループヘッダーではない）
  // - group_id がリージョングループIDに属する（サービスではなくDC）
  const dataCenters = new Map();
  const monitorAll = monitoredCodes.includes('ALL');

  for (const component of components) {
    // グループコンポーネントはスキップ
    if (component.group) continue;

    // サービスコンポーネントはスキップ
    if (component.group_id === SERVICES_GROUP_ID) continue;

    // リージョングループに属するコンポーネント（＝データセンター）のみ
    if (!REGION_GROUP_IDS.has(component.group_id)) continue;

    const iataCode = extractIataCode(component.name);
    if (!iataCode) continue;

    // 監視対象のフィルタリング
    if (!monitorAll && !monitoredCodes.includes(iataCode)) continue;

    dataCenters.set(component.id, {
      name: component.name,
      status: component.status,
      iataCode: iataCode,
    });
  }

  return dataCenters;
}

/**
 * ステータスの日本語ラベルを取得
 * @param {string} status - APIステータス値
 * @returns {string} 日本語ラベル
 */
export function getStatusLabel(status) {
  const labels = {
    operational: '✅ 正常稼働',
    degraded_performance: '⚠️ パフォーマンス低下',
    partial_outage: '🔴 部分的障害（リルート中）',
    major_outage: '🔴 重大障害',
    under_maintenance: '🔧 定期メンテナンス',
  };
  return labels[status] || `❓ 不明 (${status})`;
}
