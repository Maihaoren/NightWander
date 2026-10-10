/**
 * inventory.js —— 容量计算、装备槽与整理逻辑
 * 只算“能不能、放到哪”，状态改动由 main.js 调 state.js 完成；不碰 DOM。
 */

export const SLOTS = ['hand', 'torso', 'legs', 'back'];

export function hasStorageRoom(storage, capacity) {
  return storage.length < capacity;
}

/** 口袋容量 = 所有装备提供的 pockets 之和 */
export function computePocketCapacity(equipped) {
  return SLOTS.reduce((sum, slot) => {
    const item = equipped[slot];
    return sum + ((item && item.pockets) || 0);
  }, 0);
}

/** 口袋容量来源明细（四个槽都列出，空槽 count 为 0），供物品栏 hover 显示 */
export function getPocketSources(equipped, slotNames = {}) {
  return SLOTS.map((slot) => {
    const item = equipped[slot];
    return { name: item ? item.name : (slotNames[slot] || slot), count: (item && item.pockets) || 0 };
  });
}

export function hasPocketRoom(pocket, equipped) {
  return pocket.length < computePocketCapacity(equipped);
}

/** 从储物箱取一件：能装备就装备，否则进袋 */
export function planTakeFromStorage(item, equipped, pocket) {
  if (item.slot && !equipped[item.slot]) return { mode: 'equip', slot: item.slot };
  if (hasPocketRoom(pocket, equipped)) return { mode: 'pocket' };
  return { reason: '没有空间了' };
}

/** 野外捡到一件物品 */
export function planWildPickup(pocket, equipped) {
  if (hasPocketRoom(pocket, equipped)) return { mode: 'pocket' };
  return { needDiscard: true };
}

/** 脱下装备（放回储物箱） */
export function planUnequip(slot, equipped, pocket, storage, capacity) {
  if (!equipped[slot]) return { reason: '这里没有装备。' };
  if (!hasStorageRoom(storage, capacity)) return { reason: '储物箱满了。' };

  const after = { ...equipped, [slot]: null };
  if (pocket.length > computePocketCapacity(after)) return { reason: '你的口袋装不下这么多东西。' };

  return { ok: true };
}

/** 口袋里的物品放回储物箱 */
export function planPocketToStorage(storage, capacity) {
  if (!hasStorageRoom(storage, capacity)) return { reason: '储物箱满了。' };
  return { ok: true };
}
