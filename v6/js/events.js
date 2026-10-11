/**
 * events.js —— 随机事件池
 *
 * 只做三件事：定义事件池、掷骰、抽事件并应用效果。
 * 不碰 DOM（终端输出由 main.js 负责），文案全部来自 texts.js 的 EVENTS。
 *
 * 触发时机（由 main.js 决定，本模块不自己挂时机）：
 *   1) 移动到达节点时掷一次
 *   2) 每次「消耗时间」的选项执行后掷一次（不含移动本身，免得一个动作掷两次）
 * 每个触发点只掷一次；命中（Math.random() < EVENT_CHANCE）才从池里抽一个事件。
 *
 * 事件可重复触发，不做「刚出过就排除」的过滤。
 */

import { EVENT_CHANCE } from './config.js';
import { EVENTS, ITEMS } from './texts.js';
import { getNode } from './map.js';
import * as game from './state.js';
import * as time from './timeSystem.js';

/**
 * 「路边补给」用来刷物品的候选表。
 * 只挑无槽位／通用的小件，且避开开局储物箱里已经有的东西，免得满地都是大衣牛仔裤。
 */
const SUPPLY_ITEMS = ['compass', 'pocketwatch', 'darkshard', 'oldmap'];

/** 把一件东西放到某个节点的物品池里，并解除「已拾取」标记（否则躺在脚下也捡不起来） */
function spawnItemOnNode(node, itemId) {
  if (!node || !itemId || !ITEMS[itemId]) return false;
  if (node.items.includes(itemId)) return false;
  node.items.push(itemId);
  game.unmarkItemCollected(itemId);
  return true;
}

/** 从候选里挑一件该节点还没有的；都齐了就用第一件（重复刷同一件没有意义） */
function pickSupplyItem(node) {
  const free = SUPPLY_ITEMS.filter((id) => ITEMS[id] && !node.items.includes(id));
  const pool = free.length ? free : SUPPLY_ITEMS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 事件池。每个事件：
 *   id      —— 与 texts.js 的 EVENTS 键一致
 *   text    —— 由 texts.js 提供，不在池里重复写
 *   apply(node) —— 实际效果，返回一句「补充说明」或 ''（可选）
 *
 * 效果都只做简单状态改动：体力 / 电量 / 时间 / 节点物品池。
 */
export const EVENT_POOL = [
  {
    id: 'coins',
    /* 1) 拾得零钱：没有状态改动，纯氛围 */
    apply: () => '',
  },
  {
    id: 'slip',
    /* 2) 脚下一滑：体力 -1（允许扣成负数，交由 main.js 的既有规则处理） */
    apply: () => {
      game.spendStamina(1);
      return '';
    },
  },
  {
    id: 'supply',
    /* 3) 路边补给：当前节点刷出 1 件物品（走现有节点物品池） */
    apply: (node) => {
      if (!node) return '';
      const itemId = pickSupplyItem(node);
      if (!spawnItemOnNode(node, itemId)) return '';
      return `地上多了一件${ITEMS[itemId].name}。`;
    },
  },
  {
    id: 'flicker',
    /* 4) 路灯闪烁：电量 -5%（走 state.setBattery，下限 0 由它夹住） */
    apply: () => {
      game.spendBattery(5);
      return '';
    },
  },
  {
    id: 'lost',
    /* 5) 迷路片刻：时间 +300 秒。
          走 time.advanceTime()：既推进钟点、也按速率扣电、还会检查是否天亮，与其它时间流逝一致 */
    apply: () => {
      time.advanceTime(300);
      return '';
    },
  },
];

const POOL_BY_ID = new Map(EVENT_POOL.map((e) => [e.id, e]));

/** 池里所有事件 id（debug / 测试用） */
export function listEventIds() {
  return EVENT_POOL.map((e) => e.id);
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
 * 强制触发指定事件（不走掷骰）。id 不认识时返回 null。
 * @returns {{ id:string, text:string, extra:string } | null}
 */
export function triggerEvent(id, nodeId = null) {
  const event = POOL_BY_ID.get(id);
  if (!event) return null;

  const node = getNode(nodeId || game.getCurrentNode());
  const copy = EVENTS[event.id] || { text: '' };
  const extra = event.apply(node) || '';

  return { id: event.id, text: copy.text, extra };
}

/**
 * 触发点：掷一次骰子，命中才抽事件并应用。
 *
 * 受开关控制：
 *   - state.eventsEnabled（/event on|off|reset 控制，存 localStorage）
 *   - 游戏已结束时不再触发
 * 关着的时候直接返回 null，不消耗随机数。
 *
 * @returns {{ id:string, text:string, extra:string } | null} 命中并执行了才返回结果
 */
export function rollEvent(nodeId = null, rng = Math.random) {
  if (!game.getEventsEnabled()) return null;
  if (game.isGameOver()) return null;
  if (!(rng() < EVENT_CHANCE)) return null;          /* 没命中：这一次不抽事件 */

  const event = pickEvent(rng);
  if (!event) return null;

  const node = getNode(nodeId || game.getCurrentNode());
  const copy = EVENTS[event.id] || { text: '' };
  const extra = event.apply(node) || '';

  return { id: event.id, text: copy.text, extra };
}
