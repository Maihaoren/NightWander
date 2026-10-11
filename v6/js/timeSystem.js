/**
 * timeSystem.js —— 时间与天数推进、电量流逝、格式化、夜晚结束触发
 * 只负责时间的推进与格式化，不判断游戏规则。
 *
 * 推进方案：时间戳差值。每次 tick 用 Date.now() 的真实差值累加。
 *
 * 【暂停条件】（v1.8.12 起统一成一处判断，互不覆盖）：
 *   1) 有任意「暂停来源」生效 —— 窗口隐藏（visibilitychange）／模态弹窗打开期间
 *      这些来源用 token 记在一个 Set 里，全部解除才恢复；用 Set 而不是布尔值，
 *      是因为多个来源可能重叠，布尔值会被后一个来源的「恢复」把前一个还没结束的暂停覆盖掉。
 *   2) 在家节点 —— 这是按当前节点算出来的「每帧条件」，不是事件，所以留在 tick 里一起判。
 *   暂停期间【不补足】时间：tick 每帧都把 lastTickTime 推到当前时刻，
 *   恢复时再显式重建一次基准，所以隐藏 / 弹窗期间流逝的真实时间一律不算。
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

/* ---------------- 暂停条件（token 集合） ----------------

   窗口隐藏用固定 token 'hidden'；模态弹窗由 main.js 每次开窗分配一个唯一 token
  （'modal:1'、'modal:2'…），这样两个弹窗叠在一起时先关掉的那个不会把另一个的暂停解除掉。
   setOnPauseChange() 是「暂停↔恢复」翻转时的通知钩子（timeSystem 不认识终端）。
   v1.8.12 曾用它往终端打「时间已暂停 / 时间已恢复」，v1.8.13 起不再输出，
   所以 main.js 不再注册；钩子本身保留，暂停/恢复逻辑不受影响。
*/
const HIDDEN_REASON = 'hidden';
const pauseTokens = new Set();
let onPauseChange = null;

export function setOnPauseChange(callback) {
  onPauseChange = typeof callback === 'function' ? callback : null;
}

/** 追加一个暂停来源；全部解除时才算恢复 */
export function addPauseReason(token) {
  const was = pauseTokens.size > 0;
  pauseTokens.add(String(token));
  notifyPause(was);
}

/** 解除一个暂停来源；还有别的来源生效就继续暂停 */
export function removePauseReason(token) {
  const was = pauseTokens.size > 0;
  pauseTokens.delete(String(token));
  notifyPause(was);
}

/** 当前是否因为「暂停来源」而暂停（不含「在家」那条每帧条件） */
export function isTimePaused() {
  return pauseTokens.size > 0;
}

/** 只有在「暂停↔恢复」真正翻转时才通知一次，避免每帧刷屏 */
function notifyPause(wasPaused) {
  const nowPaused = pauseTokens.size > 0;
  if (wasPaused === nowPaused) return;
  if (onPauseChange) onPauseChange(nowPaused);
}

/**
 * 监听窗口隐藏 / 显示（由 main.js 在 boot() 里装一次）。
 *   隐藏 → 记上 'hidden'：tick 的暂停条件成立，隐藏期间的时间不补足
 *   显示 → 解除 'hidden' 并重建 lastTickTime，恢复计时
 * 启动时如果页面已经是隐藏的（后台标签打开），直接按隐藏处理。
 */
export function watchVisibility() {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      addPauseReason(HIDDEN_REASON);
    } else {
      removePauseReason(HIDDEN_REASON);
      lastTickTime = Date.now();          /* 重建基准：隐藏期间一秒都不补 */
    }
  });
  if (document.hidden) addPauseReason(HIDDEN_REASON);
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
  /* 基准每帧都推到当前时刻：所以无论因为什么原因跳过累加，
     跳过的那段时间都不会在恢复后被一次补上 */
  lastTickTime = now;

  /* 【暂停条件】统一在这里判断，两个条件互不覆盖：
       1) 有暂停来源（窗口隐藏 / 弹窗打开）
       2) 在家节点（状态派生出来的每帧条件） */
  if (isTimePaused() || game.getCurrentNode() === 'home') return;

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
