/**
 * timeSystem.js —— 时间与天数推进、格式化、夜晚结束触发
 * 只负责时间的推进与格式化，不判断游戏规则。
 *
 * 推进方案：时间戳差值。每次 tick 用 Date.now() 的真实差值累加，
 * 所以标签页被节流、切回前台时会一次性补足。
 * 在家节点时时间不流逝。
 */

import { NIGHT_START_HOUR, NIGHT_DURATION_SEC, TIME_SPEED, TICK_INTERVAL_MS, BATTERY_CAP_FLOOR, BATTERY_CAP_CEIL } from './config.js';
import * as game from './state.js';

let timerId = null;
let lastTickTime = 0;
let onNightEnd = null;

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

/** 20:00 → 06:00 之间电量上限从 BATTERY_CAP_CEIL 线性降到 BATTERY_CAP_FLOOR */
export function computeBatteryCap(elapsedSeconds) {
  const ratio = Math.min(1, Math.max(0, 1 - elapsedSeconds / NIGHT_DURATION_SEC));
  return BATTERY_CAP_FLOOR + (BATTERY_CAP_CEIL - BATTERY_CAP_FLOOR) * ratio;
}

function tick() {
  const now = Date.now();
  const deltaRealSec = (now - lastTickTime) / 1000;
  lastTickTime = now;

  /* 在家不流逝：基准已经更新，所以离开家那一刻不会把这期间的时间补上 */
  if (game.getCurrentNode() === 'home') return;

  game.addElapsedSeconds(deltaRealSec * TIME_SPEED);

  /* 电量上限随时间衰减：超出部分直接削掉（正常用电扣减不受影响） */
  const cap = computeBatteryCap(game.getElapsedSeconds());
  if (game.getBattery() > cap) game.setBattery(cap);

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

  if (game.getElapsedSeconds() >= NIGHT_DURATION_SEC) {
    game.setElapsedSeconds(NIGHT_DURATION_SEC);
    finish();
  }
}

function finish() {
  stopClock();
  if (onNightEnd) onNightEnd();
}

/** "HH:MM:SS"；电量归零时返回 "??:??:??"（时间照常流逝） */
export function getTimeString() {
  if (game.getBattery() <= 0) return '??:??:??';

  const totalSec = Math.floor(game.getElapsedSeconds());
  const totalSecOfDay = (NIGHT_START_HOUR * 3600 + totalSec) % 86400;
  const hours = Math.floor(totalSecOfDay / 3600);
  const minutes = Math.floor((totalSecOfDay % 3600) / 60);
  const seconds = totalSecOfDay % 60;

  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}
