/**
 * events.js —— 随机事件池（v1.8.14：选择弹窗 + 结果弹窗；终端叙事 / 弹窗效果分工）
 *
 * 只做四件事：定义事件池、掷骰、把「玩家选的选项」执行掉、维护悬浮开关的运行时状态。
 * 不碰 DOM —— 弹窗由 main.js 调 modal.js 弹，文案全部来自 texts.js 的 EVENTS。
 *
 * 事件结构（EVENT_POOL 的每一项）：
 *   { id, desc, options: [{ label, effect, effectText, narrate, hoverText }] }
 *   desc       —— 描述（双出：终端 + 选择弹窗）
 *   label      —— 选择弹窗里的选项按钮文字
 *   effect     —— 函数，执行该选项的状态改动；接收 ctx = { node }，
 *                 可返回 { spawned?: 物品名 } 之类的附加信息
 *   effectText —— 结果弹窗文本（系统信息：玩家得失；无效果时为「无变化」）
 *   narrate    —— 终端文本（描述性叙事）
 *   hoverText  —— 悬浮提示（只有 hover 开关打开时由 main.js 用作按钮 title）
 *
 * 触发时机（由 main.js 决定，本模块不自己挂时机）：
 *   1) 移动到达节点时掷一次
 *   2) 每次「消耗时间」的选项执行后掷一次（不含移动本身，免得一个动作掷两次）
 * 每个触发点只掷一次；命中（Math.random() < EVENT_CHANCE）才从池里抽一个事件。
 * 事件可重复触发，不做「刚出过就排除」的过滤。
 *
 * 与 v1.8.11 的区别：rollEvent() 只负责「出不出、出哪个」，效果不再自动执行；
 * 玩家在弹窗里选完，main.js 再调 runEventOption() 执行对应 effect。
 */

import { EVENT_CHANCE, EVENT_HOVER_SHOW_EFFECT, EVENT_HOVER_KEY, readEventHoverEnabled } from './config.js';
import { EVENTS, ITEMS } from './texts.js';
import { getNode } from './map.js';
import * as game from './state.js';
import * as time from './timeSystem.js';

/** 无效果选项在结果弹窗里的兜底文案（texts.js 的 UI.eventNoChange 是同一句话） */
const EVENT_NO_CHANGE = '无变化';

/**
 * 「刷物品」类选项用的候选表。
 * 只挑无槽位／通用的小件，且避开开局储物箱里已经有的东西，免得满地都是大衣牛仔裤。
 *
 * v1.9.0b1：原来的 ['compass','pocketwatch','darkshard','oldmap'] 里有 3 件
 * 已经随物品表精简删掉了（compass / darkshard / oldmap），留着会让随机刷物品
 * 刷出 ITEMS 里不存在的 id —— spawnItemOnNode 会直接返回 false，
 * 但事件的 effectText 照样写「获得 1 件物品」，玩家白高兴一场。
 *
 * 怀表也**刻意移出候选表**：它是废城「断桥」节点上唯一的任务物品，
 * 而 collectedItems 是按【物品 id】记的 —— 一旦随机刷出第二块怀表并被捡走，
 * 断桥那块也会被一起标记成「已拾取」而消失。候选表里不放这种唯一物品。
 *
 * 副作用：候选只剩 1 件，所以随机事件刷出来的永远是罐头；
 * 同一节点上已经有罐头时刷不出来（沿用 spawnItemOnNode 拒绝重复的既有行为）。
 * 等物品表在 b2+ 变丰富之后再补候选。
 */
const SUPPLY_ITEMS = ['cannedfood'];

/** 把一件东西放到某个节点的物品池里，并解除「已拾取」标记（否则躺在脚下也捡不起来） */
function spawnItemOnNode(node, itemId) {
  if (!node || !itemId || !ITEMS[itemId]) return false;
  if (node.items.includes(itemId)) return false;
  node.items.push(itemId);
  game.unmarkItemCollected(itemId);
  return true;
}

/** 从候选里挑一件该节点还没有的；都齐了就随机重复刷一件 */
function pickSupplyItem(node) {
  const free = SUPPLY_ITEMS.filter((id) => ITEMS[id] && !node.items.includes(id));
  const pool = free.length ? free : SUPPLY_ITEMS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 在当前节点刷 1 件物品，返回物品名（没刷成返回空串） */
function grantItemToNode(node) {
  const itemId = pickSupplyItem(node);
  return spawnItemOnNode(node, itemId) ? ITEMS[itemId].name : '';
}

/**
 * 每个事件两个选项的效果，下标与 texts.js 里 EVENTS[id].options 一一对应。
 * 只做简单状态改动：体力 / 电量 / 时间 / 节点物品池。
 */
const EFFECTS = {
  /* 1) 拾得零钱：A 刷 1 件物品；B 无效果 */
  coin_purse: [
    (ctx) => ({ spawned: grantItemToNode(ctx.node) }),
    () => null,
  ],

  /* 2) 脚下一滑：A 体力 -1；B 时间 +180 秒 */
  slip: [
    () => { game.spendStamina(1); },
    () => { time.advanceTime(180); },
  ],

  /* 3) 路边售货机：A 电量 -5% 且刷 1 件物品；B 无效果 */
  vending: [
    (ctx) => { game.spendBattery(5); return { spawned: grantItemToNode(ctx.node) }; },
    () => null,
  ],

  /* 4) 路灯闪烁：A 电量 -3%；B 电量 -8% 且时间 +180 秒 */
  flicker: [
    () => { game.spendBattery(3); },
    () => { game.spendBattery(8); time.advanceTime(180); },
  ],

  /* 5) 迷路片刻：A 时间 +180 秒；B 时间 +300 秒且体力 -1 */
  lost: [
    () => { time.advanceTime(180); },
    () => { time.advanceTime(300); game.spendStamina(1); },
  ],
};

/**
 * 事件池：把 texts.js 的文案与上面的效果拼成
 *   { id, desc, options: [{ label, effect, effectText, narrate, hoverText }] }
 * 加新事件只要在 texts.js 加一条 EVENTS、在这里加一组 EFFECTS。
 *
 * 五个字段的分工（v1.8.14 起）：
 *   label     —— 选择弹窗里的按钮文字
 *   effect    —— 执行状态改动
 *   effectText—— 【结果弹窗】文本（系统信息：玩家得失，如「体力 -1」；无效果时为「无变化」）
 *   narrate   —— 【终端】文本（描述性叙事，选完之后补进叙事流）
 *   hoverText —— 悬浮提示（只有 hover 开关打开时由 main.js 用作按钮 title）
 */
export const EVENT_POOL = Object.keys(EVENTS).map((id) => {
  const copy = EVENTS[id];
  const effects = EFFECTS[id] || [];
  return {
    id,
    desc: copy.desc,
    options: (copy.options || []).map((label, index) => ({
      label,
      effect: effects[index] || (() => null),
      effectText: (copy.effectTexts || [])[index] || EVENT_NO_CHANGE,
      narrate: (copy.narrates || [])[index] || '',
      hoverText: (copy.hoverTexts || [])[index] || '',
    })),
  };
});

const POOL_BY_ID = new Map(EVENT_POOL.map((e) => [e.id, e]));

/* ---------------- 悬浮显示效果：运行时开关（默认值在 config.js，状态存 localStorage） ---------------- */

let hoverEnabled = readEventHoverEnabled();

/** 当前是否显示「选项效果」的悬浮提示 */
export function isHoverEnabled() {
  return hoverEnabled;
}

/** 改运行时状态并写 localStorage（/event hover on|off 用）；返回改完的值 */
export function setHoverEnabled(value) {
  hoverEnabled = Boolean(value);
  try {
    localStorage.setItem(EVENT_HOVER_KEY, String(hoverEnabled));
  } catch (err) {
    /* 写盘失败不影响本次会话 */
  }
  return hoverEnabled;
}

/** 回到 config 里的默认值，并同步 localStorage（/event reset 用） */
export function resetHoverEnabled() {
  return setHoverEnabled(EVENT_HOVER_SHOW_EFFECT);
}

/** 池里所有事件 id（debug / 测试用） */
export function listEventIds() {
  return EVENT_POOL.map((e) => e.id);
}

/** 事件清单（/event help 用）：id + 描述 + 选项文字 */
export function listEvents() {
  return EVENT_POOL.map((e) => ({
    id: e.id,
    desc: e.desc,
    options: e.options.map((o) => o.label),
  }));
}

/** 按 id 取事件对象（不执行任何效果）；不认识的 id 返回 null */
export function getEvent(id) {
  return POOL_BY_ID.get(id) || null;
}

/**
 * 抽取一个事件对象。
 * @param {function} [rng] 随机源，默认 Math.random（测试时可注入固定值）
 */
export function pickEvent(rng = Math.random) {
  if (EVENT_POOL.length === 0) return null;
  const i = Math.min(EVENT_POOL.length - 1, Math.max(0, Math.floor(rng() * EVENT_POOL.length)));
  return EVENT_POOL[i];
}

/**
 * 触发点：掷一次骰子，命中就返回要弹的事件（**不执行效果**）。
 *
 * 受开关控制：
 *   - game.getEventsEnabled()（/event on|off|reset 控制，存 localStorage）
 *   - 游戏已结束时不再触发
 * 关着的时候直接返回 null，不消耗随机数。
 *
 * @returns {object|null} 命中则返回 { id, desc, options }，否则 null
 */
export function rollEvent(nodeId = null, rng = Math.random) {
  if (!game.getEventsEnabled()) return null;
  if (game.isGameOver()) return null;
  if (!(rng() < EVENT_CHANCE)) return null;          /* 没命中：这一次不抽事件 */
  void nodeId;                                       /* 落点由 main.js 在执行效果时传回来 */
  return pickEvent(rng);
}

/**
 * 执行玩家选中的那个选项。
 * @param {object} event rollEvent() / getEvent() 返回的事件对象
 * @param {number} index 选项下标（0 / 1）
 * @param {string} [nodeId] 当前节点，默认用 state 里的
 * @returns {{ id:string, index:number, label:string, effectText:string, narrate:string, spawned:string } | null}
 *   effectText —— 结果弹窗文本（系统信息）
 *   narrate    —— 终端文本（描述性叙事）
 *   spawned    —— 刷出来的物品名（没刷则空串；交给原有拾取弹窗处理）
 */
export function runEventOption(event, index, nodeId = null) {
  if (!event || !Array.isArray(event.options)) return null;
  const option = event.options[Number(index)];
  if (!option) return null;

  const node = getNode(nodeId || game.getCurrentNode());
  const outcome = option.effect({ node }) || {};

  return {
    id: event.id,
    index: Number(index),
    label: option.label,
    effectText: option.effectText || EVENT_NO_CHANGE,
    narrate: option.narrate || '',
    spawned: outcome.spawned || '',
  };
}
