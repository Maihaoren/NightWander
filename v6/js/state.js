/**
 * state.js —— 游戏状态与只读查询
 * 只负责状态变更和查询接口：不操作 DOM、不认识时间/终端/存档格式。
 *
 * 关于 state.day：本模块只提供 setDay()，调用它的地方只有 main.js 的结算流程。
 */

import { STAMINA_MAX_INIT, BATTERY_MAX, STORAGE_CAPACITY, EVENTS_DEFAULT } from './config.js';
import { ITEMS } from './texts.js';

/** 初始放在储物箱里的物品 */
const INITIAL_STORAGE = ['coat', 'jeans', 'flashlight', 'torch', 'oldmap', 'pocketwatch'];

export const state = {
  day: 1,
  elapsedSeconds: 0,
  currentNode: null,
  visited: new Set(),
  stamina: STAMINA_MAX_INIT,
  staminaMax: STAMINA_MAX_INIT,
  battery: BATTERY_MAX,
  storageCapacity: STORAGE_CAPACITY,
  homeStorage: [],
  equipped: { hand: null, torso: null, legs: null, back: null },
  pocket: [],
  collectedItems: new Set(),   /* 已经被捡走过的节点物品 id（保证不会反复捡到同一个） */
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
  state.visited.add(homeId);
  state.homeStorage = INITIAL_STORAGE.filter((id) => ITEMS[id]).map((id) => ({ ...ITEMS[id] }));
}

/* ---------------- 位置 ---------------- */

export function visit(id) {
  state.currentNode = id;
  state.visited.add(id);
}

export function setCurrentNode(id) {
  state.currentNode = id;
}

export function getCurrentNode() {
  return state.currentNode;
}

export function getVisited() {
  return state.visited;
}

export function isVisited(id) {
  return state.visited.has(id);
}

/* ---------------- 体力 ---------------- */

export function getStamina() {
  return state.stamina;
}

export function setStamina(value) {
  state.stamina = Math.max(0, Math.min(state.staminaMax, value));
}

export function spendStamina(amount) {
  setStamina(state.stamina - amount);
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

export function getStorageCapacity() {
  return state.storageCapacity;
}

export function setStorageCapacity(value) {
  state.storageCapacity = Math.max(0, value);
}

export function getHomeStorage() {
  return state.homeStorage;
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

export function addToStorage(item) {
  state.homeStorage.push(item);
}

export function removeFromStorage(item) {
  const i = state.homeStorage.indexOf(item);
  if (i >= 0) state.homeStorage.splice(i, 1);
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

  return {
    day: state.day,
    elapsedSeconds: state.elapsedSeconds,
    currentNode: state.currentNode,
    visited: [...state.visited],
    stamina: state.stamina,
    staminaMax: state.staminaMax,
    battery: state.battery,
    storageCapacity: state.storageCapacity,
    homeStorage: state.homeStorage.map((item) => ({ ...item })),
    equipped: {
      hand: state.equipped.hand ? { ...state.equipped.hand } : null,
      torso: state.equipped.torso ? { ...state.equipped.torso } : null,
      legs: state.equipped.legs ? { ...state.equipped.legs } : null,
      back: state.equipped.back ? { ...state.equipped.back } : null,
    },
    pocket: state.pocket.map((item) => ({ ...item })),
    collectedItems: [...state.collectedItems],
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
  state.currentNode = data.currentNode;
  state.visited = new Set(data.visited);
  state.stamina = data.stamina;
  state.staminaMax = data.staminaMax;
  state.battery = data.battery;
  state.storageCapacity = data.storageCapacity;
  state.homeStorage = data.homeStorage.map((item) => ({ ...item }));
  state.equipped = {
    hand: data.equipped.hand ? { ...data.equipped.hand } : null,
    torso: data.equipped.torso ? { ...data.equipped.torso } : null,
    legs: data.equipped.legs ? { ...data.equipped.legs } : null,
    back: data.equipped.back ? { ...data.equipped.back } : null,
  };
  state.pocket = data.pocket.map((item) => ({ ...item }));
  state.collectedItems = new Set(data.collectedItems || []);
  state.gameOver = false;

  usedOptions.clear();
  for (const [id, list] of Object.entries(data.usedOptions)) usedOptions.set(id, new Set(list));
  usedPerDay.clear();
  usedGroups.clear();
  for (const [id, list] of data.usedGroups) usedGroups.set(id, new Set(list));
}
