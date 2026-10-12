/**
 * debug.js —— debug 指令解析与执行
 * 只解析 "/xxx" 指令、读写传进来的 state、必要时调 ctx 里的动作；不碰渲染细节。
 * 仅在 config.DEBUG_CONSOLE === true 时由 main.js 调用（默认关闭，模块加载但不执行）。
 */

import { BATTERY_MAX, STORAGE_CAPACITY, EVENTS_DEFAULT, GAME_VERSION, DEBUG_CONSOLE } from './config.js';
import { ITEMS } from './texts.js';

/** 所有指令名（不带 "/"），供终端 Tab 补全使用 */
export function getAllCommandNames() {
  return ['time', 'day', 'stamina', 'staminaMax', 'battery', 'storage', 'unlockall', 'give', 'goto', 'area', 'event', 'version', 'help'];
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
  '/goto {nodeId}       传送到指定节点（节点 id 全局唯一；/goto help 列出当前区域的节点）',
  '/area list           列出所有区域与解锁状态',
  '/area goto {areaId}  切换到指定区域（优先停在与当前区域的共享节点上）',
  '/storage set {n}     设置「当前节点所在储物箱」的容量（>=0）',
  '/storage add {n}     同上，容量 +n',
  '/unlockall           把当前区域的所有节点标记为已访问（不跨区域、不消耗任何资源）',
  '/give {itemId} {n}   把 n 件指定物品塞进背包（n 省略 = 1；不看容量、不消耗任何资源；id 写错会列出全部 id）',
  '/event on|off|reset  开关随机事件系统（reset = 回到默认，并清空「已触发过的事件」）',
  '/event hover [on|off] 选项按钮上是否悬浮显示该选项效果（不带参数 = 看当前状态）',
  '/event trigger {id}  强制触发指定事件（无视开关、几率与「已触发过」，测试入口）',
  '/event help          列出 /event 的全部用法与所有事件 id',
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
  goto: '/goto {nodeId}（/goto help 列出当前区域的节点）',
  area: '/area list 或 /area goto {areaId}',
  unlockall: '/unlockall（无参数）',
  give: '/give {itemId} [数量]（数量省略 = 1，必须是正整数）',
  event: '/event {on|off|reset|hover|trigger|help}',   /* 用法提示固定为这一句 */
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
      /* 储物箱按安全屋隔离；节点 id 全局唯一，直接用节点 id 当键 */
      const key = String(state.currentNode);
      if (!state.storageCapacityByShelter) state.storageCapacityByShelter = {};
      const before0 = Number.isFinite(state.storageCapacityByShelter[key])
        ? state.storageCapacityByShelter[key] : STORAGE_CAPACITY;
      const before = sub === 'set' ? n : before0 + n;
      state.storageCapacityByShelter[key] = Math.max(0, before);
      return join(`${key} 的储物箱容量为 ${state.storageCapacityByShelter[key]}。`,
        clampText(before, state.storageCapacityByShelter[key]));
    }

    /**
     * /unlockall —— 把【当前所在区域】的所有节点标记为已访问。
     *
     * 只动「已访问 / 已探明」这两类标记，别的什么都不碰：
     *   - 不改当前节点位置（玩家站在原地，不会因为解锁就被挪走）
     *   - 不消耗时间 / 体力 / 电量（不经过 advanceTime / spendStamina / spendBattery）
     *   - 不动物品、选项、事件、储物箱、gameOver 等任何其他状态
     *   - 不跨区域：共享节点【只在当前区域】里标记，不顺手写进它所属的另一个区域
     *
     * 「已探明」在这个项目里不是一个单独的标记，而是【边两端都已访问】派生出来的
     * （见 map.js 的 buildAdjacency / reachableVisited）：把节点全标成已访问之后，
     * 本区域每条边自然都是「两端都已访问」＝已探明，所以不需要第二套数据。
     */
    case '/unlockall': {
      if (sub) return `参数错误。用法：${usage}`;
      if (state.gameOver) return '游戏已结束，无法执行。';

      const areaId = state.currentArea;
      const region = ctx.areas ? ctx.areas().find((a) => a.id === areaId) : null;
      const areaName = region ? region.name : areaId;
      const nodes = ctx.nodes ? ctx.nodes() : [];
      if (nodes.length === 0) return '当前区域暂无节点';

      if (!state.visitedByArea) state.visitedByArea = {};
      if (!(state.visitedByArea[areaId] instanceof Set)) state.visitedByArea[areaId] = new Set();
      for (const n of nodes) state.visitedByArea[areaId].add(n.id);

      if (ctx.redrawMap) ctx.redrawMap();
      return DEBUG_CONSOLE
        ? `已解锁当前区域：${areaName} [debug] unlockall ${areaId}`
        : `已解锁当前区域：${areaName}`;
    }

    case '/event': {
      /* tokens[1] 是子命令（不是 tokens[0]）；大小写无关；state 里没有该字段时以 EVENTS_DEFAULT 兜底 */
      const arg = String(tokens[1] || '').toLowerCase();
      const current = typeof state.eventsEnabled === 'boolean' ? state.eventsEnabled : EVENTS_DEFAULT;

      /* ---- /event help：列出全部用法 + 所有事件 id 与描述（off 时也能用，只走终端输出） ---- */
      if (arg === 'help') {
        const rows = (ctx.eventCatalog ? ctx.eventCatalog() : []).map(
          (e) => `  ${String(e.id).padEnd(12)}${e.desc}（选项：${(e.options || []).join(' / ')}）`,
        );
        return [
          '随机事件系统用法：',
          '  /event on | off | reset        主开关（reset 回到默认值）',
          '  /event hover on | hover off | hover   选项效果悬浮提示的开关',
          '  /event trigger {id}            强制触发一个事件（无视开关与几率）',
          '  /event help                    本说明',
          '事件池：',
          ...rows,
        ].join('\n');
      }

      /* ---- /event hover [on|off]：运行时切换悬浮开关（状态存 localStorage，不进存档） ---- */
      if (arg === 'hover') {
        const sub2 = String(tokens[2] || '').toLowerCase();
        const readHover = () => (typeof ctx.isHoverEnabled === 'function' ? ctx.isHoverEnabled() : null);
        const writeHover = (v) => (typeof ctx.setHoverEnabled === 'function' ? ctx.setHoverEnabled(v) : null);

        if (sub2 === '') {
          const now = readHover();
          if (now === null) return '当前环境不支持运行时切换悬浮开关。';
          return now ? '选项效果悬浮提示：已开启' : '选项效果悬浮提示：已关闭';
        }
        if (sub2 !== 'on' && sub2 !== 'off') return `用法：${usage}`;
        const now = writeHover(sub2 === 'on');
        if (now === null) return '当前环境不支持运行时切换悬浮开关。';
        return now
          ? '选项效果悬浮提示：已开启（鼠标停在选项按钮上会显示该选项的效果）'
          : '选项效果悬浮提示：已关闭';
      }

      /* ---- /event trigger {id}：强制触发（无视开关与几率，走与自然触发完全一致的流程） ---- */
      if (arg === 'trigger') {
        const id = String(tokens[2] || '');
        if (!id) return `参数错误。用法：${usage}`;

        const known = (ctx.eventCatalog ? ctx.eventCatalog() : []).some((e) => e.id === id);
        if (!known) return '未知事件 id，用 /event help 查看';
        if (typeof ctx.canTriggerEvent === 'function' && !ctx.canTriggerEvent()) {
          return '当前有弹窗没处理完或正在移动，先处理完再触发。';
        }
        if (typeof ctx.triggerEvent !== 'function' || !ctx.triggerEvent(id)) {
          return '当前无法触发事件。';
        }
        /* 调试日志只在 DEBUG_CONSOLE 下输出（本模块本身就只在 DEBUG_CONSOLE 时被 main 调用） */
        return DEBUG_CONSOLE
          ? `[debug] 强制触发事件 ${id}`
          : '已强制触发事件。';
      }

      /* ---- /event on | off | reset（原逻辑；reset 同时把 hover 开关也拨回默认值） ---- */
      let next;
      if (arg === 'on') next = true;
      else if (arg === 'off') next = false;
      else if (arg === 'reset') next = EVENTS_DEFAULT;
      else if (arg === '') next = !current;                    /* 无参数：切换 */
      else return `用法：${usage}`;

      /* 真正开关事件系统：优先走 main 注入的 state.setEventsEnabled（它同时写 localStorage），
         拿不到时才退回直接改 state + 自己写盘。事件池在 js/events.js，掷骰由 main.js 在两处触发点调用 */
      if (typeof ctx.setEventsEnabled === 'function') ctx.setEventsEnabled(next);
      else {
        state.eventsEnabled = next;
        try { localStorage.setItem('game_events_enabled', String(next)); } catch (err) { /* 写盘失败不影响本次会话 */ }
      }

      const pool = typeof ctx.eventIds === 'function' ? ctx.eventIds() : [];
      const tail = pool.length ? `（事件池 ${pool.length} 个：${pool.join('/')}）` : '';
      if (arg === 'reset') {
        /* reset 也把 hover 开关拨回 config 里的默认值，并同步 localStorage */
        if (typeof ctx.resetHoverEnabled === 'function') ctx.resetHoverEnabled();
        /* v1.9.0b1.1：reset 还要清空「已触发过的事件」，
           否则事件池被触发过的部分就再也回不来了（见需求改动 4 的 a 条）。
           清的是 state 里那份（它会进存档），不是 localStorage —— 开关本身仍不进存档。 */
        if (typeof ctx.clearTriggeredEvents === 'function') ctx.clearTriggeredEvents();
        else state.triggeredEventIds = new Set();
        const hoverDefault = typeof ctx.hoverDefault === 'function' ? ctx.hoverDefault() : false;
        return `随机事件系统：已重置为默认（${EVENTS_DEFAULT ? '开' : '关'}，悬浮提示 ${hoverDefault ? '开' : '关'}${
          '，已触发记录已清空'}）${tail}`;
      }
      return (next ? '随机事件系统：已开启' : '随机事件系统：已关闭') + tail;
    }

    /**
     * /give {itemId} [数量] —— v1.9.0b4.1 改动 10（调试入口）。
     *
     * 直接把物品塞进背包，方便测试钥匙门槛、终局这些要走很远才到得了的东西：
     *   - 不消耗任何资源（不经过 advanceTime / spendStamina / spendBattery）
     *   - 不看容量（调试入口，口袋该满还是满），也不动物品栏以外的任何状态
     *   - 数量省略 = 1；给了非法数量（0 / 负数 / 小数 / 非数字）一律拒绝，不做四舍五入
     *   - 未知 id 会把全部可用 id 列出来，免得猜
     * 具体往哪放由 main.js 的 ctx.giveItem 负责（口袋优先），这里只解析与措辞。
     */
    case '/give': {
      const id = String(tokens[1] || '').trim().toLowerCase();
      if (!id) return `参数错误。用法：${usage}`;

      const item = ITEMS[id];
      if (!item) {
        return [
          `未知物品 id：${id}`,
          `可用物品 id：${Object.keys(ITEMS).join(' / ')}`,
        ].join('\n');
      }

      let count = 1;
      if (tokens[2] !== undefined) {
        const n = Number(tokens[2]);
        if (!Number.isInteger(n) || n < 1) return '数量必须是正整数。';
        count = n;
      }

      if (typeof ctx.giveItem !== 'function' || !ctx.giveItem(id, count)) {
        return '当前无法给予物品。';
      }
      const line = `已给予 ${item.name} ×${count}`;
      return DEBUG_CONSOLE ? `${line} [debug] give ${id} ×${count}` : line;
    }

    case '/version': {
      if (tokens[1]) return `参数错误。用法：${usage}`;
      return '当前游戏版本：' + GAME_VERSION;
    }

    case '/goto': {
      if (!tokens[1]) return `参数错误。用法：${usage}`;
      if (tokens[1].toLowerCase() === 'help') {
        const rows = ctx.nodes().map((n) => `${n.id.padEnd(12)}${n.name}`);
        return [`当前区域（${state.currentArea}）可传送的节点：`, ...rows].join('\n');
      }
      /* 支持 /goto coast:eastgate 的跨区域写法；不带冒号即当前区域的节点 */
      const spec = String(tokens[1]);
      const sep = spec.indexOf(':');
      const areaId = sep >= 0 ? spec.slice(0, sep) : undefined;
      const nodeId = sep >= 0 ? spec.slice(sep + 1) : spec;
      if (!nodeId) return `参数错误。用法：${usage}`;

      const moved = ctx.goto(nodeId, areaId);
      return moved ? `已传送到 ${areaId ? areaId + ':' : ''}${nodeId}。` : '未知节点。输入 /goto help 查看列表。';
    }

    case '/area': {
      if (sub === '' || sub === 'list') {
        const rows = (ctx.areas ? ctx.areas() : []).map((a) => {
          const mark = a.unlocked ? '  ' : '× ';
          return `${mark}${a.id.padEnd(8)}${a.name}${a.current ? '   ← 当前所在' : ''}`;
        });
        return ['区域列表（× = 未解锁）：', ...rows].join('\n');
      }
      if (sub === 'goto') {
        const areaId = tokens[2];
        if (!areaId) return `参数错误。用法：${usage}`;
        const moved = ctx.gotoArea ? ctx.gotoArea(areaId) : false;
        return moved ? `已切换到区域 ${areaId}。` : '未知区域。输入 /area list 查看列表。';
      }
      return `参数错误。用法：${usage}`;
    }

    default:
      return '未知指令。输入 /help 查看列表。';
  }
}


