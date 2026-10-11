/**
 * state.js —— 游戏状态与只读查询
 * 只负责状态变更和查询接口：不操作 DOM、不认识时间/终端/存档格式。
 *
 * 关于 state.day：本模块只提供 setDay()，调用它的地方只有 main.js 的结算流程。
 */

import { STAMINA_MAX_INIT, BATTERY_MAX, STORAGE_CAPACITY, EVENTS_DEFAULT } from './config.js';
import { ITEMS } from './texts.js';

/**
 * 初始放在储物箱里的物品。
 * 多区域需求：怀表（pocketwatch）已移到「灯塔」节点的 items，不再开局给。
 */
const INITIAL_STORAGE = ['coat', 'jeans', 'flashlight', 'torch', 'oldmap'];

export const state = {
  day: 1,
  elapsedSeconds: 0,
  currentArea: 'home',         /* 当前所在区域：'home' | 'area1' | 'area2'；开局在 home */
  mapView: 'world',            /* 地图视图：'world' 大地图 / 'area' 区域地图 */
  currentNode: null,
  visitedByArea: {},           /* areaId -> Set<nodeId>，各区域的已访问节点分开记 */
  stamina: STAMINA_MAX_INIT,
  staminaMax: STAMINA_MAX_INIT,
  battery: BATTERY_MAX,
  sheltersByArea: {},           /* shelterKey('area1:home') -> Item[]，各安全屋储物箱互相隔离 */
  storageCapacityByShelter: {}, /* shelterKey -> number，各安全屋容量互相独立 */
  equipped: { hand: null, torso: null, legs: null, back: null },
  pocket: [],
  collectedItems: new Set(),   /* 已经被捡走过的节点物品 id（保证不会反复捡到同一个） */
  resolvedMustResolve: new Set(), /* mustResolve 已解除的节点 id（节点 id 全局唯一，直接用 id 当键；可存档） */
  eventsEnabled: false,        /* 随机事件系统开关（从 localStorage 读，功能待实现） */
  gameOver: false,
  options: [],
};

/** 已用选项：普通项与 perDay 项分开记（perDay 在天数 +1 时清空，且不进存档） */
const usedOptions = new Map();   /* nodeId -> Set<index> */
const usedPerDay = new Map();    /* nodeId -> Set<index> */
const usedGroups = new Map();    /* nodeId -> Set<group> */

export function initState(homeId) {
  state.eventsEnabled = readEventsEnabled();   /* 首次加载：localStorage → 默认值 */
  state.currentNode = homeId;
  getVisitedByArea(state.currentArea).add(homeId);
  /* 开局物品放进家的储物箱（节点 id 全局唯一，直接用 id 当储物键） */
  getShelterStorage(homeId).push(...INITIAL_STORAGE.filter((id) => ITEMS[id]).map((id) => ({ ...ITEMS[id] })));
}

/* ---------------- 区域与地图视图 ---------------- */

export function getCurrentArea() {
  return state.currentArea;
}

export function setCurrentArea(areaId) {
  state.currentArea = areaId;
}

export function getMapView() {
  return state.mapView;
}

/** 只取值 'world' / 'area'，非法值一律当 'area'（与 map.setMapView 保持一致） */
export function setMapView(view) {
  state.mapView = view === 'world' ? 'world' : 'area';
  return state.mapView;
}

/* 关于储物键：节点 id 已全局唯一（home / lighthouse / n1 …），
   所以不再需要 'areaId:nodeId' 这种键，直接用节点 id 作键。
   getShelterStorage(nodeId) / getStorageCapacity(nodeId) 等接口签名不变。 */

/* ---------------- 位置 ---------------- */

/**
 * 标记某节点在某区域内已访问。
 * 共享节点（home、lighthouse）需要由调用方对每个所属区域各调一次 —— main.js 负责这件事，
 * 因为「哪些区域含这个节点」是 map.js 的知识，state.js 不认识区域表。
 */
export function markVisited(areaId, nodeId) {
  getVisitedByArea(areaId).add(nodeId);
}

/** 移动/传送：同时切换区域与节点，并把该节点标记为该区域的已访问 */
export function visit(areaId, nodeId) {
  state.currentArea = areaId;
  state.currentNode = nodeId;
  markVisited(areaId, nodeId);
}

export function setCurrentNode(id) {
  state.currentNode = id;
}

export function getCurrentNode() {
  return state.currentNode;
}

/** 某区域的已访问节点集合（首次使用该区域时惰性建空集） */
export function getVisitedByArea(areaId) {
  if (!state.visitedByArea[areaId]) state.visitedByArea[areaId] = new Set();
  return state.visitedByArea[areaId];
}

export function isVisited(areaId, nodeId) {
  return getVisitedByArea(areaId).has(nodeId);
}

/* ---------------- mustResolve（必须先做出决定的节点） ---------------- */

/* 节点 id 全局唯一，直接用它当键，不再需要 'areaId:nodeId' 前缀 */

export function isMustResolveResolved(nodeId) {
  return state.resolvedMustResolve.has(String(nodeId));
}

export function markMustResolveResolved(nodeId) {
  state.resolvedMustResolve.add(String(nodeId));
}

/* ---------------- 体力 ---------------- */

export function getStamina() {
  return state.stamina;
}

/**
 * 体力只夹上限，**不夹 0**：内部允许记录负值。
 * 0 只是「筋疲力尽」的提示点，负值才触发强制回家；UI 显示时取 max(0, 体力)。
 */
export function setStamina(value) {
  state.stamina = Math.min(state.staminaMax, Number(value) || 0);
}

export function spendStamina(amount) {
  state.stamina -= (Number(amount) || 0);
  if (state.stamina > state.staminaMax) state.stamina = state.staminaMax;
}

export function getStaminaMax() {
  return state.staminaMax;
}

export function setStaminaMax(value) {
  state.staminaMax = Math.max(1, value);
  setStamina(state.stamina);
}

/* ---------------- 电量 ---------------- */

export function getBattery() {
  return state.battery;
}

export function setBattery(value) {
  state.battery = Math.max(0, Math.min(BATTERY_MAX, value));
}

export function spendBattery(amount) {
  setBattery(state.battery - amount);
}

/* ---------------- 天数与时间 ---------------- */

export function getDay() {
  return state.day;
}

/** 只由 main.js 的结算流程调用 */
export function setDay(value) {
  state.day = value;
}

export function getElapsedSeconds() {
  return state.elapsedSeconds;
}

export function setElapsedSeconds(value) {
  state.elapsedSeconds = Math.max(0, value);
}

export function addElapsedSeconds(seconds) {
  state.elapsedSeconds += seconds;
}

/* ---------------- 游戏结束 ---------------- */

export function isGameOver() {
  return state.gameOver;
}

export function setGameOver(value) {
  state.gameOver = Boolean(value);
}

/* ---------------- 当前选项列表 ---------------- */

export function setOptions(options) {
  state.options = Array.isArray(options) ? options.slice() : [];
}

export function getOptions() {
  return state.options;
}

/* ---------------- 已用选项 / 已选 group ---------------- */

function readSet(map, nodeId) {
  const set = map.get(nodeId);
  return set ? new Set(set) : new Set();
}

/** 按钮渲染用的“已用序号”＝普通项 + perDay 项 */
export function getUsedOptions(nodeId) {
  const all = readSet(usedOptions, nodeId);
  for (const index of readSet(usedPerDay, nodeId)) all.add(index);
  return all;
}

/** 存档用：只导出非 perDay 的已用选项 */
export function getUsedOptionsPersistent(nodeId) {
  return readSet(usedOptions, nodeId);
}

export function markOptionUsed(nodeId, index, perDay) {
  const map = perDay ? usedPerDay : usedOptions;
  if (!map.has(nodeId)) map.set(nodeId, new Set());
  map.get(nodeId).add(index);
}

/** 结算时清空所有 perDay 项 */
export function clearPerDayOptions() {
  usedPerDay.clear();
}

export function getUsedGroups(nodeId) {
  return readSet(usedGroups, nodeId);
}

export function markGroupUsed(nodeId, group) {
  if (!group) return;
  if (!usedGroups.has(nodeId)) usedGroups.set(nodeId, new Set());
  usedGroups.get(nodeId).add(group);
}

/* ---------------- 储物箱 / 装备槽 / 口袋 ---------------- */

export function getStorageCapacity(shelterKey) {
  /* 首次使用该安全屋时惰性初始化为默认容量 */
  if (state.storageCapacityByShelter[shelterKey] === undefined) {
    state.storageCapacityByShelter[shelterKey] = STORAGE_CAPACITY;
  }
  return state.storageCapacityByShelter[shelterKey];
}

export function setStorageCapacity(shelterKey, value) {
  state.storageCapacityByShelter[shelterKey] = Math.max(0, value);
}

/** 某安全屋的储物箱（首次使用该安全屋时惰性建空箱） */
export function getShelterStorage(shelterKey) {
  if (!state.sheltersByArea[shelterKey]) state.sheltersByArea[shelterKey] = [];
  return state.sheltersByArea[shelterKey];
}

export function getEquipped() {
  return state.equipped;
}

export function getPocket() {
  return state.pocket;
}

/* ---------------- 物品拾取唯一性 ---------------- */

/* ---------------- 随机事件开关（持久化到 localStorage） ---------------- */

const EVENTS_KEY = 'game_events_enabled';

function readEventsEnabled() {
  try {
    const saved = localStorage.getItem(EVENTS_KEY);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
  } catch (err) {
    /* 隐私模式 / file:// 下忽略 */
  }
  return EVENTS_DEFAULT;
}

export function setEventsEnabled(value) {
  state.eventsEnabled = Boolean(value);
  try {
    localStorage.setItem(EVENTS_KEY, String(state.eventsEnabled));
  } catch (err) {
    /* 写入失败不影响本次会话 */
  }
  return state.eventsEnabled;
}

export function getEventsEnabled() {
  return state.eventsEnabled;
}

export function isItemCollected(id) {
  return state.collectedItems.has(id);
}

export function markItemCollected(id) {
  state.collectedItems.add(id);
}

/**
 * 解除「已拾取」标记：野外丢弃时用。
 * collectedItems 决定节点物品列表里哪些条目不再显示，所以把东西丢回节点后必须解标记，
 * 否则它躺在节点上也看不见、捡不回来。
 */
export function unmarkItemCollected(id) {
  state.collectedItems.delete(id);
}

export function addToStorage(shelterKey, item) {
  getShelterStorage(shelterKey).push(item);
}

export function removeFromStorage(shelterKey, item) {
  const storage = getShelterStorage(shelterKey);
  const i = storage.indexOf(item);
  if (i >= 0) storage.splice(i, 1);
}

export function setEquippedSlot(slot, item) {
  state.equipped[slot] = item || null;
}

export function addToPocket(item) {
  state.pocket.push(item);
}

export function removeFromPocket(item) {
  const i = state.pocket.indexOf(item);
  if (i >= 0) state.pocket.splice(i, 1);
}

/* ---------------- 存档快照 ---------------- */

export function toSnapshot() {
  const persistent = {};
  for (const [nodeId, index] of getUsedOptionsAllNodes()) persistent[nodeId] = index;

  /* 各区域已访问节点：Set → 数组，才能进 JSON */
  const visitedByArea = {};
  for (const [areaId, set] of Object.entries(state.visitedByArea)) visitedByArea[areaId] = [...set];

  /* 各安全屋储物箱：逐件浅拷贝 */
  const sheltersByArea = {};
  for (const [key, list] of Object.entries(state.sheltersByArea)) {
    sheltersByArea[key] = list.map((item) => ({ ...item }));
  }

  return {
    day: state.day,
    elapsedSeconds: state.elapsedSeconds,
    currentArea: state.currentArea,
    mapView: state.mapView,
    currentNode: state.currentNode,
    visitedByArea,
    stamina: state.stamina,
    staminaMax: state.staminaMax,
    battery: state.battery,
    storageCapacityByShelter: { ...state.storageCapacityByShelter },
    sheltersByArea,
    equipped: {
      hand: state.equipped.hand ? { ...state.equipped.hand } : null,
      torso: state.equipped.torso ? { ...state.equipped.torso } : null,
      legs: state.equipped.legs ? { ...state.equipped.legs } : null,
      back: state.equipped.back ? { ...state.equipped.back } : null,
    },
    pocket: state.pocket.map((item) => ({ ...item })),
    collectedItems: [...state.collectedItems],
    resolvedMustResolve: [...state.resolvedMustResolve],
    usedOptions: persistent,           /* 只有非 perDay 的部分 */
    usedGroups: [...usedGroups].map(([id, set]) => [id, [...set]]),
  };
}

function getUsedOptionsAllNodes() {
  return [...usedOptions].map(([id, set]) => [id, [...set]]);
}

export function replaceFromSnapshot(data) {
  state.day = data.day;
  state.elapsedSeconds = data.elapsedSeconds;
  state.currentArea = data.currentArea;
  state.mapView = data.mapView;
  state.currentNode = data.currentNode;

  state.visitedByArea = {};
  for (const [areaId, list] of Object.entries(data.visitedByArea)) {
    state.visitedByArea[areaId] = new Set(list);
  }

  state.stamina = data.stamina;
  state.staminaMax = data.staminaMax;
  state.battery = data.battery;
  state.storageCapacityByShelter = { ...data.storageCapacityByShelter };

  state.sheltersByArea = {};
  for (const [key, list] of Object.entries(data.sheltersByArea)) {
    state.sheltersByArea[key] = list.map((item) => ({ ...item }));
  }

  state.equipped = {
    hand: data.equipped.hand ? { ...data.equipped.hand } : null,
    torso: data.equipped.torso ? { ...data.equipped.torso } : null,
    legs: data.equipped.legs ? { ...data.equipped.legs } : null,
    back: data.equipped.back ? { ...data.equipped.back } : null,
  };
  state.pocket = data.pocket.map((item) => ({ ...item }));
  state.collectedItems = new Set(data.collectedItems || []);
  /* 旧存档没有这个字段：缺省为空集（即都没解除），向后兼容，不需要升存档版本 */
  state.resolvedMustResolve = new Set(data.resolvedMustResolve || []);
  state.gameOver = false;

  usedOptions.clear();
  for (const [id, list] of Object.entries(data.usedOptions)) usedOptions.set(id, new Set(list));
  usedPerDay.clear();
  usedGroups.clear();
  for (const [id, list] of data.usedGroups) usedGroups.set(id, new Set(list));
}
