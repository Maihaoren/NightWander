/**
 * inventory.js —— 容量计算、装备槽与整理逻辑
 * 只算“能不能、放到哪”，状态改动由 main.js 调 state.js 完成；不碰 DOM。
 */

export const SLOTS = ['hand', 'torso', 'legs', 'back'];

/** 会提供口袋格数的槽：手持槽不在其中（它只提供固定的保底 1 格） */
export const POCKET_SLOTS = ['torso', 'legs', 'back'];

/** 手持槽固定提供的保底格数：与装备无关，单独计在口袋之外 */
export const HAND_BASE_CAPACITY = 1;

export function hasStorageRoom(storage, capacity) {
  return storage.length < capacity;
}

/** 口袋容量 = 已装备的 torso/legs/back 所提供的 pockets 之和（不含手持槽） */
export function computeEquippedPockets(equipped) {
  return POCKET_SLOTS.reduce((sum, slot) => {
    const item = equipped[slot];
    return sum + ((item && item.pockets) || 0);
  }, 0);
}

/**
 * 总携带容量 = 手持槽保底 1 格 + 已装备的 torso/legs/back 的 pockets 之和。
 * 手持槽里放任何东西都不提供额外格数（手拿大衣也只算它自己占的那 1 格）。
 * 空手 = 1；空手 + 大衣(3) + 牛仔裤(2) = 6。
 */
export function computePocketCapacity(equipped) {
  return HAND_BASE_CAPACITY + computeEquippedPockets(equipped);
}

/** 已占格数 = 口袋里的件数 + 手持槽占用（手持最多 1 件） */
export function computeCarried(equipped, pocket) {
  return pocket.length + (equipped.hand ? 1 : 0);
}

/** 容量来源明细（手持保底 + 三个装备槽），供物品栏 hover 显示 */
export function getPocketSources(equipped, slotNames = {}) {
  const rows = [{ name: slotNames.hand || 'hand', count: HAND_BASE_CAPACITY }];
  for (const slot of POCKET_SLOTS) {
    const item = equipped[slot];
    rows.push({ name: item ? item.name : (slotNames[slot] || slot), count: (item && item.pockets) || 0 });
  }
  return rows;
}

/** 口袋里还有没有空位（只看口袋，不看手持保底槽） */
export function hasPocketRoom(pocket, equipped) {
  return pocket.length < computeEquippedPockets(equipped);
}

/** 从储物箱取一件：能装备就装备，否则进袋，再否则进手持保底槽 */
export function planTakeFromStorage(item, equipped, pocket) {
  if (item.slot && !equipped[item.slot]) return { mode: 'equip', slot: item.slot };
  if (hasPocketRoom(pocket, equipped)) return { mode: 'pocket' };
  if (!equipped.hand) return { mode: 'hand' };      /* 手持槽不限物品类型，任何东西都能放 */
  return { reason: '没有空间了' };
}

/** 野外捡到一件物品：优先口袋 → 其次手持保底槽 → 都满才需要替换 */
export function planWildPickup(pocket, equipped) {
  if (hasPocketRoom(pocket, equipped)) return { mode: 'pocket' };
  if (!equipped.hand) return { mode: 'hand' };
  return { needDiscard: true };
}

/* ---------------- 「当地物品」区（节点上的东西，还不属于你） ---------------- */

/**
 * 当地物品列表：节点上还没被捡走的物品 id。
 * 纯函数：只做过滤，不碰 state、不碰 DOM。
 * @param {string[]} nodeItems 节点自带的 items
 * @param {Set<string>|string[]} collected 已拾取过的物品 id
 */
export function listLocalItems(nodeItems, collected) {
  const got = collected instanceof Set ? collected : new Set(collected || []);
  return (nodeItems || []).filter((id) => !got.has(id));
}

/**
 * 点「当地物品」区里一件时的拾取方案。
 * 与野外拾取共用同一套优先级：口袋（若空位）→ 手持（若空）→ 都满则要弹替换窗。
 */
export function planLocalPickup(pocket, equipped) {
  return planWildPickup(pocket, equipped);
}

/** 手持槽 → 口袋（野外与在家都允许） */
export function planHandToPocket(equipped, pocket) {
  if (!equipped.hand) return { reason: '手持槽是空的。' };
  if (!hasPocketRoom(pocket, equipped)) return { reason: '你的口袋装不下更多东西。' };
  return { ok: true };
}

/** 口袋 → 手持槽（野外与在家都允许，手持只放一件） */
export function planPocketToHand(equipped) {
  if (!equipped.hand) return { ok: true };
  return { reason: '手持槽已经有东西了。' };
}

/** 脱下装备（放回储物箱） */
export function planUnequip(slot, equipped, pocket, storage, capacity) {
  if (!equipped[slot]) return { reason: '这里没有装备。' };
  if (!hasStorageRoom(storage, capacity)) return { reason: '储物箱满了。' };

  const after = { ...equipped, [slot]: null };
  /* 用「装备提供口袋数」而不是总容量：手持保底那 1 格不受脱下装备影响 */
  if (pocket.length > computeEquippedPockets(after)) return { reason: '你的口袋装不下这么多东西。' };

  return { ok: true };
}

/** 口袋里的物品放回储物箱 */
export function planPocketToStorage(storage, capacity) {
  if (!hasStorageRoom(storage, capacity)) return { reason: '储物箱满了。' };
  return { ok: true };
}
