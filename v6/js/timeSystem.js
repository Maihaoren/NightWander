/**
 * timeSystem.js —— 时间与天数推进、电量流逝、格式化、夜晚结束触发
 * 只负责时间的推进与格式化，不判断游戏规则。
 *
 * 推进方案：时间戳差值。每次 tick 用 Date.now() 的真实差值累加，
 * 所以标签页被节流、切回前台时会一次性补足。
 * 在家节点时时间不流逝。
 *
 * 电量流逝（v1.8.8 起）：只削当前电量，上限恒为 BATTERY_MAX；
 * 按游戏内秒数连续积分，黑暗节点额外加速，跨天再一次性扣一笔。
 * 速率与判定细节见下面的「电量流逝（连续积分）」注释块。
 */

import {
  NIGHT_START_HOUR, NIGHT_DURATION_SEC, TIME_SPEED, TICK_INTERVAL_MS,
  BATTERY_NATURAL_DRAIN_PER_HOUR, BATTERY_DARK_AREA_EXTRA_DRAIN_PER_HOUR, BATTERY_DAY_CHANGE_DRAIN,
} from './config.js';
import * as game from './state.js';

let timerId = null;
let lastTickTime = 0;
let onNightEnd = null;

/* 电量归零回调：timeSystem 不认识地图与游戏规则，由 main.js 注入。
   电量在流逝中掉到 0 时调一次（黑暗地点的强制回家走这个钩子）。 */
let onBatteryEmpty = null;

/* 黑暗地点判定：同样由 main.js 注入（map.js 的节点数据只有 main 认识），默认「都不黑」 */
let darkNodeResolver = () => false;

export function setOnBatteryEmpty(callback) {
  onBatteryEmpty = typeof callback === 'function' ? callback : null;
}

export function setDarkNodeResolver(resolver) {
  darkNodeResolver = typeof resolver === 'function' ? resolver : () => false;
}

export function startClock(callback) {
  if (typeof callback === 'function') onNightEnd = callback;
  stopClock();
  lastTickTime = Date.now();
  timerId = window.setInterval(tick, TICK_INTERVAL_MS);
}

export function stopClock() {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

/** 结算 / 导入存档后重建时间基准，避免把暂停期间的真实时间算进去 */
export function resetClock() {
  lastTickTime = Date.now();
}

/* ---------------- 电量流逝（连续积分） ----------------

   速率 = BATTERY_NATURAL_DRAIN_PER_HOUR
        + （当前节点是黑暗地点 ? BATTERY_DARK_AREA_EXTRA_DRAIN_PER_HOUR : 0）   单位：百分点 / 游戏小时

   扣除量 = 流逝的游戏内秒数 / 3600 × 速率。
   时间推进有两条路：tick（按 Date.now 真实差值连续积分）与 advanceTime（离散：移动 / 选项），
   两条路都调用这里的 drainBatteryForGameSeconds()，所以速率规则只有一份。

   只削【当前电量】，上限恒为 BATTERY_MAX；下限 0 由 state.setBattery 夹住。
   离散扣时的黑暗判定用「扣电那一刻玩家所在的节点」：
   离开黑暗地点那一步算黑暗速率（人还在黑暗里），走进黑暗地点那一步算自然速率。

   【归零通知】只要扣电后电量是 0（或本来就是 0）就调一次 onBatteryEmpty。
   「已经是 0 就不再通知」曾经是个 bug：电量本来就为 0 的情形（调试指令设 0、
   导入电量 0 的存档、选项的 batteryCost 把电用干）永远等不到从正数变 0 的那一跳，
   tick 也就永远发现不了，黑暗地点的强制回家不会触发。
   main.js 那边的处理是幂等的（不在黑暗地点就 return false），所以每 tick 调一次没有副作用。
*/
function batteryDrainPerHour() {
  const dark = darkNodeResolver(game.getCurrentNode());
  return BATTERY_NATURAL_DRAIN_PER_HOUR + (dark ? BATTERY_DARK_AREA_EXTRA_DRAIN_PER_HOUR : 0);
}

/** 电量见底就通知 main.js（每次调用都判一次，不做「只通知一次」的闩锁） */
function notifyBatteryEmpty() {
  if (game.getBattery() > 0) return;
  if (onBatteryEmpty) onBatteryEmpty();
}

/** 按【游戏内秒数】连续积分扣当前电量；扣完（或本来就是 0）通知 main.js */
function drainBatteryForGameSeconds(gameSeconds) {
  const sec = Number(gameSeconds);
  if (!Number.isFinite(sec) || sec <= 0) return;

  /* 只有还有电才累减，避免在 0 上一直做减法 */
  if (game.getBattery() > 0) game.spendBattery((sec / 3600) * batteryDrainPerHour());

  notifyBatteryEmpty();
}

/** 跨天（天数 +1）时一次性扣电。由 main.js 在结算流程里调用，调用点必须在「回家回电」之前 */
export function drainBatteryOnDayChange() {
  if (game.getBattery() > 0) game.spendBattery(BATTERY_DAY_CHANGE_DRAIN);
  notifyBatteryEmpty();
}

function tick() {
  const now = Date.now();
  const deltaRealSec = (now - lastTickTime) / 1000;
  lastTickTime = now;

  /* 在家不流逝：基准已经更新，所以离开家那一刻不会把这期间的时间补上 */
  if (game.getCurrentNode() === 'home') return;

  const deltaGameSec = deltaRealSec * TIME_SPEED;
  game.addElapsedSeconds(deltaGameSec);

  /* 电量随游戏内时间自然流逝（黑暗地点额外流逝），连续积分 */
  drainBatteryForGameSeconds(deltaGameSec);

  if (game.getElapsedSeconds() >= NIGHT_DURATION_SEC) {
    game.setElapsedSeconds(NIGHT_DURATION_SEC);
    finish();
  }
}

/** 离散扣时（移动、选项）：直接累加 */
export function advanceTime(seconds) {
  const delta = Number(seconds);
  if (!Number.isFinite(delta) || delta <= 0 || game.isGameOver()) return;

  game.addElapsedSeconds(delta);
  drainBatteryForGameSeconds(delta);                  /* 离散推进同样按速率扣电 */

  if (game.getElapsedSeconds() >= NIGHT_DURATION_SEC) {
    game.setElapsedSeconds(NIGHT_DURATION_SEC);
    finish();
  }
}

function finish() {
  stopClock();
  if (onNightEnd) onNightEnd();
}

/** 把「已流逝游戏秒」格式化成夜间钟点 HH:MM:SS（20:00 起算） */
export function formatClock(elapsedSeconds) {
  const totalSec = Math.floor(Number(elapsedSeconds) || 0);
  const totalSecOfDay = (((NIGHT_START_HOUR * 3600 + totalSec) % 86400) + 86400) % 86400;
  const hours = Math.floor(totalSecOfDay / 3600);
  const minutes = Math.floor((totalSecOfDay % 3600) / 60);
  const seconds = totalSecOfDay % 60;

  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

/** 把一段「时长秒数」格式化成 HH:MM:SS —— 是时长不是钟点，超过 24 小时也不进位 */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  return [hours, minutes, secs].map((n) => String(n).padStart(2, '0')).join(':');
}

/** "HH:MM:SS"；电量归零时返回 "??:??:??"（时间照常流逝） */
export function getTimeString() {
  if (game.getBattery() <= 0) return '??:??:??';
  return formatClock(game.getElapsedSeconds());
}
