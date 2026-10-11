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

/* ---------------- 野外丢弃（把随身物品放回当前节点） ---------------- */

/**
 * 野外丢弃一件随身物品的判定。纯函数：只说「这件东西现在在哪」，不改 state。
 * 状态改动由 main.js 的 dropItemToNode() 负责（与其它整理操作同一套分工）。
 *
 * 只有【随身物品】能丢：
 *   - 口袋里的
 *   - 手持槽里的（手持槽就是保底物品栏，里面的东西当然属于玩家）
 * 穿在身上的 torso / legs / back 是「穿着」而不是「带着」，
 * 脱下来会改变口袋容量，所以不算随身物品 —— 要脱先回安全屋整理。
 *
 * @returns {{ where:'pocket'|'hand' } | { reason:string }}
 */
export function planDrop(item, equipped, pocket) {
  if (!item) return { reason: '没有这件物品。' };
  if (equipped && equipped.hand && equipped.hand === item) return { where: 'hand' };
  if ((pocket || []).includes(item)) return { where: 'pocket' };
  return { reason: '这件东西不在你身上。' };
}

/* ---------------- 穿上装备（v1.9.0b2.2 改动 3；v1.9.0b2.3 改动 3 抽出 canEquip） ---------------- */

/**
 * 能不能穿在身上 —— **唯一判据就是「物品自己带 slot」**，与槽位叫什么无关。
 *
 * v1.9.0b2.3 改动 3 把这条判断抽成一个函数：以前「能不能装备」是在好几处各写一遍
 * （`item.slot` 真值判断 / `planEquipFromCarried` 里的守卫），只要有一处写成
 * 「只认 torso / legs」这类硬编码，第一个 back 槽物品（电容器）就会被漏掉。
 * 现在物品栏的「装备」按钮、拾取弹窗的「装备 X」、以及 planEquipFromCarried 全走这一条。
 *
 * 注意：槽位合法性只由 SLOTS 定义（`['hand','torso','legs','back']`），
 * 容量只统计 POCKET_SLOTS 里装备的 `pockets` 之和 —— 电容器 `pockets: 0`，
 * 所以穿上它不会改变口袋容量（第一件 back 物品也不会挤掉别的槽位）。
 */
export function canEquip(item) {
  return Boolean(item && item.slot);
}

/**
 * 把【已经在身上的】一件装备穿上（口袋或手持槽里的那件）。
 * 纯函数：只说能不能穿、旧的去哪儿；状态改动由 main.js 的 equipFromCarried() 完成。
 *
 * 规则：
 *   - 没有 slot 的东西穿不上（怀表 / 罐头之类只能拿在手里）
 *   - 目标槽空着        → mode: 'equip'（直接穿上）
 *   - 目标槽已经有装备  → mode: 'replace'，并把旧装备的去处一并算好：
 *       从手持槽换上来的 → 旧装备进手持槽（手持槽恒为 1 格，永远放得下）
 *       从口袋换上来的   → 旧装备先回口袋；口袋按【换好之后】的装备算容量
 *                          （换上的装备提供的口袋格数可能不同，容量会跟着变），
 *                          口袋放不下再看手持槽空不空；两处都不行就拒绝，让玩家先腾空间
 *
 * 脱下（把装备放回储物箱）仍然只在安全屋 —— main.js 的 unequip() 那条规则本块没动。
 *
 * @param {object} item 要穿上的装备
 * @param {object} equipped 当前四个槽
 * @param {Array} pocket 当前口袋
 * @param {'pocket'|'hand'} from 这件装备现在在哪儿
 * @returns {{mode:'equip', slot:string}
 *          | {mode:'replace', slot:string, current:object, carry:'pocket'|'hand'}
 *          | {reason:string}}
 */
export function planEquipFromCarried(item, equipped, pocket, from = 'pocket') {
  if (!item) return { reason: '没有这件物品。' };
  if (!canEquip(item)) return { reason: '这东西穿不上。' };
  /* 槽位名必须真的在 SLOTS 里 —— 防止物品表里写错槽名时静默「装备成功」却没有槽位承接 */
  if (!SLOTS.includes(item.slot)) return { reason: '这东西没地方穿戴。' };

  const current = equipped[item.slot] || null;
  if (!current) return { mode: 'equip', slot: item.slot };

  if (from === 'hand') return { mode: 'replace', slot: item.slot, current, carry: 'hand' };

  const after = { ...equipped, [item.slot]: item };
  if ((pocket || []).length <= computeEquippedPockets(after)) {
    return { mode: 'replace', slot: item.slot, current, carry: 'pocket' };
  }
  if (!equipped.hand) return { mode: 'replace', slot: item.slot, current, carry: 'hand' };
  return { reason: '换下来就装不下了，先腾出点空间。' };
}
