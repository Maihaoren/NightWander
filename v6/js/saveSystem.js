/**
 * saveSystem.js —— 存档序列化 / 反序列化
 * 纯函数：不碰 DOM、不改 state，只做 字符串 <-> 快照对象 的转换与校验。
 * 格式：{ v: 1, data: { ... } } → JSON → Base64
 */

const VERSION = 1;

const REQUIRED = ['day', 'elapsedSeconds', 'currentNode', 'visited', 'stamina', 'staminaMax',
  'battery', 'storageCapacity', 'homeStorage', 'equipped', 'pocket', 'collectedItems', 'usedOptions', 'usedGroups'];

/** 快照 → 存档字符串（Base64） */
export function serialize(snapshot) {
  return toBase64(JSON.stringify({ v: VERSION, data: snapshot }));
}

/** 存档字符串 → 快照对象；解析失败 / 版本不符 / 字段缺失都返回 null */
export function deserialize(text) {
  try {
    const payload = JSON.parse(fromBase64(String(text || '').trim()));
    if (!payload || payload.v !== VERSION || !payload.data) return null;

    const data = payload.data;
    if (!REQUIRED.every((key) => data[key] !== undefined && data[key] !== null)) return null;
    if (!Array.isArray(data.visited) || !Array.isArray(data.pocket) || !Array.isArray(data.homeStorage)) return null;
    if (!data.usedOptions || typeof data.usedOptions !== 'object' || !Array.isArray(data.usedGroups)) return null;
    if (!data.equipped || typeof data.equipped !== 'object') return null;
    if (!Number.isFinite(data.day) || !Number.isFinite(data.stamina) || !Number.isFinite(data.battery)) return null;

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
