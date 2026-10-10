/**
 * saveSystem.js —— 存档序列化 / 反序列化
 * 纯函数：不碰 DOM、不改 state，只做 字符串 <-> 快照对象 的转换与校验。
 * 格式：{ v: 2, data: { ... } } → JSON → Base64
 *
 * v2（多区域）：字段改为 currentArea / mapView / visitedByArea / sheltersByArea /
 * storageCapacityByShelter，不再有 visited / homeStorage / storageCapacity。
 * v1 的单区域存档不提供迁移，加载时返回 null，由 main.js 提示「存档版本过旧」。
 */

const VERSION = 2;

const REQUIRED = ['day', 'elapsedSeconds', 'currentArea', 'mapView', 'currentNode', 'visitedByArea',
  'stamina', 'staminaMax', 'battery', 'storageCapacityByShelter', 'sheltersByArea',
  'equipped', 'pocket', 'collectedItems', 'usedOptions', 'usedGroups'];

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
