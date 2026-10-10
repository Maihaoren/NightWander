/**
 * debug.js —— debug 指令解析与执行
 * 只解析 "/xxx" 指令、读写传进来的 state、必要时调 ctx 里的动作；不碰渲染细节。
 * 仅在 config.DEBUG_CONSOLE === true 时由 main.js 调用（默认关闭，模块加载但不执行）。
 */

import { BATTERY_MAX, EVENTS_DEFAULT, GAME_VERSION } from './config.js';

/** 所有指令名（不带 "/"），供终端 Tab 补全使用 */
export function getAllCommandNames() {
  return ['time', 'day', 'stamina', 'staminaMax', 'battery', 'storage', 'goto', 'event', 'version', 'help'];
}

const HELP = [
  '可用指令：',
  '/time set {n}        设置已流逝游戏秒数（可小数）',
  '/time add {n}        追加游戏秒数',
  '/day set {n}         设置天数（正整数）',
  '/day pass {n}        天数 +n',
  '/stamina set {n}     设置体力（clamp 到 [0, 上限]）',
  '/stamina add {n}     体力 +n（clamp）',
  '/staminaMax set {n}  设置体力上限（>=1，并 clamp 体力）',
  '/battery set {n}     设置电量（clamp 到 [0, 100]）',
  '/battery add {n}     电量 +n（clamp）',
  '/goto {nodeId}   —— 传送到指定节点（/goto help 列出所有节点）',
  '/storage set {n}     设置储物箱容量（>=0）',
  '/storage add {n}     储物箱容量 +n',
  '/event {on|off|reset}   —— 开关随机事件系统',
  '/version               —— 显示当前游戏版本',
  '/help                显示本列表',
].join('\n');

const USAGE = {
  time: '/time set {n} 或 /time add {n}',
  day: '/day set {n}（正整数）或 /day pass {n}',
  stamina: '/stamina set {n} 或 /stamina add {n}',
  staminamax: '/staminaMax set {n}（n >= 1）',
  battery: '/battery set {n} 或 /battery add {n}',
  storage: '/storage set {n} 或 /storage add {n}',
  goto: '/goto {nodeId}（/goto help 列出所有节点）',
  event: '/event {on|off|reset}',   /* 用法提示固定为这一句 */
  version: '/version',
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * 执行一条 "/" 指令。
 * @param {string} input 原始输入
 * @param {object} state 游戏状态对象（可直接读写）
 * @param {{refreshUI: Function, goto: Function}} ctx main.js 传进来的动作
 * @returns {string} 要打印到终端的文本
 */
export function runCommand(input, state, ctx) {
  const text = execute(input, state, ctx);
  ctx.refreshUI();          /* 每个指令执行后都刷新状态栏/按钮行/地图/物品栏 */
  return text;
}

function execute(input, state, ctx) {
  const tokens = String(input).trim().split(/\s+/).filter(Boolean);
  const cmd = String(tokens[0] || '').toLowerCase();
  const sub = String(tokens[1] || '').toLowerCase();
  const raw = tokens[2];
  const usage = USAGE[cmd.replace('/', '')] || '';

  if (cmd === '/help') return HELP;

  const num = () => {
    if (raw === undefined) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const needNumber = () => (num() === null ? `参数错误。用法：${usage}` : null);
  const clampText = (before, after) => (before === after ? '' : `已 clamp 到 ${after}`);
  const join = (...parts) => parts.filter(Boolean).join(' ');

  switch (cmd) {
    case '/time': {
      const bad = needNumber(); if (bad) return bad;
      const n = num();
      if (sub === 'set') {
        state.elapsedSeconds = Math.max(0, n);
        return join(`时间已设为 ${Math.floor(state.elapsedSeconds)} 秒。`, clampText(Math.floor(n), Math.floor(state.elapsedSeconds)));
      }
      if (sub === 'add') {
        const before = state.elapsedSeconds + n;
        state.elapsedSeconds = Math.max(0, before);
        return join(`时间已加到 ${Math.floor(state.elapsedSeconds)} 秒。`, clampText(Math.floor(before), Math.floor(state.elapsedSeconds)));
      }
      return `参数错误。用法：${usage}`;
    }

    case '/day': {
      const bad = needNumber(); if (bad) return bad;
      const n = num();
      if (sub === 'set') {
        if (!Number.isInteger(n) || n < 1) return `参数错误。用法：${usage}`;
        state.day = n;
        return `天数已设为 ${state.day}。`;
      }
      if (sub === 'pass') {
        if (!Number.isInteger(n)) return `参数错误。用法：${usage}`;
        state.day = Math.max(1, state.day + n);
        return `天数已到 ${state.day}。`;
      }
      return `参数错误。用法：${usage}`;
    }

    case '/stamina': {
      const bad = needNumber(); if (bad) return bad;
      const n = num();
      if (sub !== 'set' && sub !== 'add') return `参数错误。用法：${usage}`;
      const before = sub === 'set' ? n : state.stamina + n;
      state.stamina = clamp(before, 0, state.staminaMax);
      return join(`体力为 ${Math.floor(state.stamina)}。`, clampText(Math.floor(before), Math.floor(state.stamina)));
    }

    case '/staminamax': {
      const bad = needNumber(); if (bad) return bad;
      const n = num();
      if (sub !== 'set') return `参数错误。用法：${usage}`;
      const before = n;
      state.staminaMax = Math.max(1, n);
      state.stamina = clamp(state.stamina, 0, state.staminaMax);
      return join(`体力上限为 ${state.staminaMax}。`, clampText(before, state.staminaMax));
    }

    case '/battery': {
      const bad = needNumber(); if (bad) return bad;
      const n = num();
      if (sub !== 'set' && sub !== 'add') return `参数错误。用法：${usage}`;
      const before = sub === 'set' ? n : state.battery + n;
      state.battery = clamp(before, 0, BATTERY_MAX);
      return join(`电量为 ${Math.floor(state.battery)}。`, clampText(Math.floor(before), Math.floor(state.battery)));
    }

    case '/storage': {
      const bad = needNumber(); if (bad) return bad;
      const n = num();
      if (sub !== 'set' && sub !== 'add') return `参数错误。用法：${usage}`;
      const before = sub === 'set' ? n : state.storageCapacity + n;
      state.storageCapacity = Math.max(0, before);
      return join(`储物箱容量为 ${state.storageCapacity}。`, clampText(before, state.storageCapacity));
    }

    case '/event': {
      /* tokens[1] 是参数（不是 tokens[0]）；大小写无关；state 里没有该字段时以 EVENTS_DEFAULT 兜底 */
      const arg = String(tokens[1] || '').toLowerCase();
      const current = typeof state.eventsEnabled === 'boolean' ? state.eventsEnabled : EVENTS_DEFAULT;

      let next;
      if (arg === 'on') next = true;
      else if (arg === 'off') next = false;
      else if (arg === 'reset') next = EVENTS_DEFAULT;
      else if (arg === '') next = !current;                    /* 无参数：切换 */
      else return '用法：/event {on|off|reset}';

      state.eventsEnabled = next;
      try { localStorage.setItem('game_events_enabled', String(next)); } catch (err) { /* 写盘失败不影响本次会话 */ }

      if (arg === 'reset') return `随机事件系统：已重置为默认（${EVENTS_DEFAULT ? '开' : '关'}）`;
      return next ? '随机事件系统：已开启' : '随机事件系统：已关闭';
    }

    case '/version': {
      if (tokens[1]) return `参数错误。用法：${usage}`;
      return '当前游戏版本：' + GAME_VERSION;
    }

    case '/goto': {
      if (!tokens[1]) return `参数错误。用法：${usage}`;
      if (tokens[1].toLowerCase() === 'help') {
        const rows = ctx.nodes().map((n) => `${n.id.padEnd(12)}${n.name}`);
        return ['可传送的节点：', ...rows].join('\n');
      }
      const moved = ctx.goto(tokens[1]);
      return moved ? `已传送到 ${tokens[1]}。` : '未知节点。输入 /goto help 查看列表。';
    }

    default:
      return '未知指令。输入 /help 查看列表。';
  }
}


