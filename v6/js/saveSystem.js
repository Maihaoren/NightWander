/**
 * saveSystem.js —— 存档序列化 / 反序列化
 * 纯函数：不碰 DOM、不改 state，只做 字符串 <-> 快照对象 的转换与校验。
 * 格式：{ v: 4, data: { ... } } → JSON → Base64
 *
 * v4（v1.9.0b1 地图重做第 1 块）：**破坏性变更，v3 及更早的存档一律不兼容**。
 *   区域表整表换新（home/area1/area2/newarea1/newarea2/darkarea → 7 个新区域 id），
 *   节点 id 也全换了，旧存档里的 visitedByArea / sheltersByArea / usedOptions
 *   全是已经不存在的区域与节点键，无法映射，因此**不提供迁移**。
 *   **字段表本身没有增删**（仍与 REQUIRED 一致）——只换了版本号，
 *   因为「新地图 id」已经足以让旧档无法对应上。
 *
 * v3（区域重构）：区域从 area1/area2 变成 home/area1/area2，节点 id 全局唯一，
 * 储物键与 mustResolve 键都改用裸 nodeId，并新增 resolvedMustResolve 字段。
 * v1 / v2 / v3 存档结构不兼容，不提供迁移，加载时返回 null，
 * 由 main.js 按版本号提示「存档版本过旧，无法加载」。
 */

const VERSION = 4;

/** 当前存档版本，供 main.js 区分「版本过旧」与「存档无效」 */
export const SAVE_VERSION = VERSION;

const REQUIRED = ['day', 'elapsedSeconds', 'currentArea', 'mapView', 'currentNode', 'visitedByArea',
  'stamina', 'staminaMax', 'battery', 'storageCapacityByShelter', 'sheltersByArea',
  'equipped', 'pocket', 'collectedItems', 'usedOptions', 'usedGroups', 'resolvedMustResolve'];

/** 快照 → 存档字符串（Base64） */
export function serialize(snapshot) {
  return toBase64(JSON.stringify({ v: VERSION, data: snapshot }));
}

/** 只读出存档里的版本号（读不出来返回 null）。main 用它区分「版本过旧」与「存档无效」 */
export function peekVersion(text) {
  try {
    const payload = JSON.parse(fromBase64(String(text || '').trim()));
    return payload && Number.isFinite(payload.v) ? payload.v : null;
  } catch (err) {
    return null;
  }
}

/** 存档字符串 → 快照对象；解析失败 / 版本不符 / 字段缺失都返回 null */
export function deserialize(text) {
  try {
    const payload = JSON.parse(fromBase64(String(text || '').trim()));
    if (!payload || payload.v !== VERSION || !payload.data) return null;

    const data = payload.data;
    if (!REQUIRED.every((key) => data[key] !== undefined && data[key] !== null)) return null;
    if (!Array.isArray(data.pocket)) return null;
    if (!data.usedOptions || typeof data.usedOptions !== 'object' || !Array.isArray(data.usedGroups)) return null;
    if (!data.equipped || typeof data.equipped !== 'object') return null;
    if (!Number.isFinite(data.day) || !Number.isFinite(data.stamina) || !Number.isFinite(data.battery)) return null;

    /* 多区域结构：区域与视图必须是字符串 */
    if (typeof data.currentArea !== 'string' || typeof data.mapView !== 'string') return null;
    if (typeof data.currentNode !== 'string') return null;

    /* visitedByArea / sheltersByArea：对象，且每个值都必须是数组 */
    if (typeof data.visitedByArea !== 'object' || Array.isArray(data.visitedByArea)) return null;
    if (!Object.values(data.visitedByArea).every((list) => Array.isArray(list))) return null;
    if (typeof data.sheltersByArea !== 'object' || Array.isArray(data.sheltersByArea)) return null;
    if (!Object.values(data.sheltersByArea).every((list) => Array.isArray(list))) return null;
    if (typeof data.storageCapacityByShelter !== 'object' || Array.isArray(data.storageCapacityByShelter)) return null;

    /* resolvedMustResolve：v3 起是必需字段，必须是数组 */
    if (!Array.isArray(data.resolvedMustResolve)) return null;

    /* collectedItems 存的是数组，还原成 Set */
    if (!Array.isArray(data.collectedItems)) return null;
    data.collectedItems = new Set(data.collectedItems);

    return data;
  } catch (err) {
    return null;
  }
}

/* Base64 编解码（UTF-8 安全，不用第三方库） */

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function fromBase64(base64) {
  const binary = window.atob(base64);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
