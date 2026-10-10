/**
 * main.js —— 入口与唯一协调者
 * 初始化与接线、深色模式、状态栏与物品栏渲染，并编排：移动/到达/选项/
 * 野外捡物/强制回家/夜晚结算/存档/debug 指令。
 */

import {
  STAMINA_MIN, BATTERY_MAX, FORCE_HOME_PENALTY, MOVE_STAMINA_COST, TICK_INTERVAL_MS, DEBUG_CONSOLE,
} from './config.js';
import { UI, SCENES, ITEMS } from './texts.js';
import {
  initMap, refreshMap, isClickable, getNode, computeEdgeCost, getPickableItems, HOME_ID, GOAL_ID, NODES,
} from './map.js';
import * as terminal from './terminal.js';
import * as game from './state.js';
import * as time from './timeSystem.js';
import * as inventory from './inventory.js';
import * as save from './saveSystem.js';
import * as debug from './debug.js';

const THEME_KEY = 'nightwander:theme';

let nightEnded = false;      /* 本轮移动/选项期间是否刚好天亮了 */
let sceneEl = null;

/* ---------------- 静态文案 ---------------- */

function pickText(path) {
  return path.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), UI);
}

function applyTexts() {
  document.title = UI.pageTitle;
  document.querySelectorAll('[data-text]').forEach((el) => {
    const value = pickText(el.dataset.text);
    if (typeof value === 'string') el.textContent = value;
  });
}

/* ---------------- 画面（硬编码 ascii） ---------------- */

function setSceneArt(text) {
  if (sceneEl) sceneEl.textContent = text || '';
}

/* ---------------- 状态栏 ---------------- */

function renderStatusBar() {
  const cell = (name) => document.querySelector(`#status .status__cell--${name}`);
  const day = cell('day');
  const stamina = cell('stamina');
  const battery = cell('battery');
  const clock = cell('time');
  if (!day || !stamina || !battery || !clock) return;

  day.textContent = UI.status.day(game.getDay());
  stamina.textContent = UI.status.stamina(game.getStamina(), game.getStaminaMax());
  battery.textContent = UI.status.battery(game.getBattery());
  clock.textContent = UI.status.time(time.getTimeString());
}

/* ---------------- 物品栏 ---------------- */

function itemButton(label, { onClick, disabled, hint } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'term-button item-button';
  button.textContent = label;
  if (hint) button.title = hint;
  if (disabled) {
    button.disabled = true;
    button.classList.add('used');
  } else if (onClick) {
    button.addEventListener('click', onClick);
  }
  return button;
}

function section(title, nodes) {
  const box = document.createElement('div');
  box.className = 'inv-section';
  const head = document.createElement('div');
  head.className = 'inv-section__title';
  head.textContent = title;
  box.appendChild(head);

  if (nodes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'inv-section__empty';
    empty.textContent = UI.inventory.empty;
    box.appendChild(empty);
  } else {
    for (const node of nodes) box.appendChild(node);
  }
  return box;
}

function inspectItem(item) {
  if (game.isGameOver()) return;
  terminal.log(UI.inspect(item.name, item.desc));
}

function renderInventory() {
  const el = document.getElementById('inventory');
  const count = document.getElementById('inventory-count');
  const title = document.getElementById('inventory-title');
  if (!el || !count) return;

  const equipped = game.getEquipped();
  const pocket = game.getPocket();
  const storage = game.getHomeStorage();
  const capacity = inventory.computePocketCapacity(equipped);
  const full = pocket.length >= capacity;
  const atHome = game.getCurrentNode() === HOME_ID;

  count.textContent = UI.inventory.count(pocket.length, capacity, full);
  const hint = UI.inventory.sources(inventory.getPocketSources(equipped, UI.slotName));
  count.title = hint;
  if (title) title.title = hint;

  el.textContent = '';

  /* 装备槽：在家点击卸下，离家只读 */
  el.appendChild(section(UI.inventory.slots, inventory.SLOTS.map((slot) => {
    const item = equipped[slot];
    const label = `${UI.slotName[slot]}：${item ? item.name : UI.inventory.emptySlot}`;
    if (!atHome) return itemButton(label, { onClick: () => inspectItem(item), disabled: !item });
    return itemButton(label, {
      onClick: () => unequip(slot),
      disabled: !item,
      hint: item && item.pockets ? `提供 ${item.pockets} 个口袋格` : '',
    });
  })));

  /* 储物箱：只在家可见 */
  if (atHome) {
    el.appendChild(section(
      `${UI.inventory.storage} ${storage.length}/${game.getStorageCapacity()}`,
      storage.map((item) => {
        const plan = inventory.planTakeFromStorage(item, equipped, pocket);
        return itemButton(`${item.name}${plan.mode === 'equip' ? '（可装备）' : ''}`, {
          onClick: () => takeFromStorage(item),
          disabled: Boolean(plan.reason),
          hint: item.pockets ? `可提供 ${item.pockets} 个口袋格` : '',
        });
      }),
    ));
  }

  el.appendChild(section(UI.inventory.pocket, pocket.map((item) => itemButton(item.name, {
    onClick: atHome ? () => pocketToStorage(item) : () => inspectItem(item),
    hint: item.slot ? `${UI.slotName[item.slot]}槽物品` : '',
  }))));
}

/* 整理操作：判断在 inventory.js，状态改动在 state.js */
function takeFromStorage(item) {
  if (game.isGameOver()) return;
  const plan = inventory.planTakeFromStorage(item, game.getEquipped(), game.getPocket());
  if (plan.reason) {
    terminal.log(plan.reason);
    return;
  }
  game.removeFromStorage(item);
  if (plan.mode === 'equip') {
    game.setEquippedSlot(plan.slot, item);
    terminal.log(UI.takeEquip(item.name));
  } else {
    game.addToPocket(item);
    terminal.log(UI.takePocket(item.name));
  }
  renderInventory();
}

function unequip(slot) {
  if (game.isGameOver()) return;
  const item = game.getEquipped()[slot];
  const plan = inventory.planUnequip(slot, game.getEquipped(), game.getPocket(),
    game.getHomeStorage(), game.getStorageCapacity());
  if (plan.reason) {
    terminal.log(plan.reason);
    return;
  }
  game.setEquippedSlot(slot, null);
  game.addToStorage(item);
  terminal.log(UI.unequip(item.name));
  renderInventory();
}

function pocketToStorage(item) {
  if (game.isGameOver()) return;
  const plan = inventory.planPocketToStorage(game.getHomeStorage(), game.getStorageCapacity());
  if (plan.reason) {
    terminal.log(plan.reason);
    return;
  }
  game.removeFromPocket(item);
  game.addToStorage(item);
  terminal.log(UI.backToStorage(item.name));
  renderInventory();
}

/* ---------------- 选项 ---------------- */

function hasLight() {
  const hand = game.getEquipped().hand;
  if (hand && (hand.id === 'flashlight' || hand.id === 'torch')) return true;
  return game.getPocket().some((item) => item.id === 'flashlight' || item.id === 'torch');
}

function enterCave() {
  if (!hasLight()) {
    terminal.log(SCENES.n3.caveDark);
    return;
  }
  terminal.log(SCENES.n3.caveLit);
  setSceneArt(SCENES.n3.altAscii);
}

/** 是否持有某件物品（口袋或任一装备槽） */
function hasItem(id) {
  if (game.getPocket().some((item) => item.id === id)) return true;
  return Object.values(game.getEquipped()).some((item) => item && item.id === id);
}

/** 按地点/物品决定是否追加一个“看时间”类选项；不追加时返回 null */
function ensureTimeOption(node) {
  if (node.id === GOAL_ID) return null;
  if (node.id === HOME_ID) return { text: '看一眼墙上的老钟', repeatable: true, timeCost: 0, batteryCost: 0, timeKind: 'home' };
  if (node.id === 'n2') return { text: '查看街角的老钟', repeatable: true, timeCost: 0, batteryCost: 0, timeKind: 'street' };
  if (hasItem('pocketwatch')) return { text: '掏出怀表看一眼', repeatable: true, timeCost: 0, batteryCost: 0, timeKind: 'watch' };
  return null;
}

const TIME_TEXTS = {
  home: (t2) => `家里的老钟显示 ${t2}`,
  street: (t2) => `街道尽头矗立着那块古老的钟，指针停在 ${t2}`,
  watch: (t2) => `怀表显示：${t2}`,
};

/** 看时间：电量归零时三个来源统一输出同一句 */
function lookAtTime(kind) {
  if (game.getBattery() <= 0) {
    terminal.log('钟面/表盘一片漆黑，什么也看不清。');
    return;
  }
  terminal.log(TIME_TEXTS[kind || 'watch'](time.getTimeString()));
}

function defaultHandler(option) {
  if (option.reply) terminal.log(option.reply);
}

const OPTION_HANDLERS = { n3: { 1: enterCave } };

function buildOptions(node) {
  const table = OPTION_HANDLERS[node.id] || {};
  const extra = ensureTimeOption(node);
  const all = extra ? [...node.options, extra] : [...node.options];

  return all.map((option, i) => {
    let handler = table[i + 1];
    if (!handler && option.timeKind) handler = () => lookAtTime(option.timeKind);
    if (!handler && option.save === 'export') handler = exportSave;
    if (!handler && option.save === 'import') handler = importSave;
    return { ...option, fullIndex: i + 1, handler: handler || defaultHandler };
  });
}

/** 所有选项照常参与渲染：requires 不满足的只是标灰（terminal 按 requirementMet 决定），
    已用选项的判定统一用 option.fullIndex（与过滤无关的稳定编号） */
function availableOptions() {
  return game.getOptions().map((option) => ({
    ...option,
    requiresHint: option.requiresHint || UI.optionNoRequirement,
    requirementMet: !option.requires || option.requires(game.state),
  }));
}

let lastButtons = [];

function currentButtons() {
  return terminal.visibleOptions(availableOptions(), game.getUsedOptions(game.getCurrentNode()),
    game.getUsedGroups(game.getCurrentNode()));
}

function refreshButtons() {
  lastButtons = terminal.renderButtons(availableOptions(), game.getUsedOptions(game.getCurrentNode()),
    game.getUsedGroups(game.getCurrentNode()), onOptionClick);
}

/* ---------------- 移动 / 到达 ---------------- */

async function travelTo(id) {
  if (game.isGameOver()) return;                     /* 0 */
  const node = getNode(id);
  if (!node) return;

  if (!isClickable(id)) {
    terminal.log(UI.farAway);
    return;
  }
  if (game.getStamina() < MOVE_STAMINA_COST) {        /* 1 */
    terminal.log(UI.noStamina);
    return;
  }

  const cost = computeEdgeCost(game.getCurrentNode(), id);   /* 2 */
  const firstVisit = !game.isVisited(id);

  nightEnded = false;
  game.spendStamina(MOVE_STAMINA_COST);              /* 3 */
  time.advanceTime(cost);
  if (nightEnded) return;                            /* 途中天亮：已被强制送回并结算 */

  game.visit(id);
  if (id === HOME_ID) settleNight();                 /* 4 主动回家 → 结算 */

  await arriveAt(node);                              /* 5 正常到达流程 */
  if (game.isGameOver()) return;

  if (id === GOAL_ID && firstVisit) {                /* 终点：首次到达即结束 */
    terminal.log(UI.foundLighthouse);
    game.setGameOver(true);
    time.stopClock();
    terminal.setLocked(true);
    renderStatusBar();
    return;
  }

  if (id !== HOME_ID && game.getStamina() <= 0) onForceHome('stamina');
}

async function arriveAt(node) {
  terminal.clearQueue();

  game.setOptions(buildOptions(node));
  refreshMap({ visited: game.getVisited(), current: node.id });
  setSceneArt(node.ascii);
  refreshButtons();   /* 先让按钮行切到当前地点：拾取弹窗会阻塞后续流程，期间不该显示上个地点的按钮 */

  terminal.log('');                                  /* 到达前空行 */
  terminal.log(UI.arrived(node.name), 'arrival');    /* 1 斜体到达文本 */
  terminal.log('');                                  /* 到达后空行 */
  terminal.log(node.desc);                           /* 2 */
  terminal.log(UI.prompt);                           /* 3 */
  await pickUpItems(node);                           /* 4 */
  terminal.log(UI.optionLine(currentButtons()), 'options');   /* 5 选项列表加粗 */
  refreshButtons();                                  /* 6 */
  renderStatusBar();
  renderInventory();
  terminal.focusInput();
}

/* ---------------- 野外捡物 ---------------- */

async function pickUpItems(node) {
  let changed = false;

  for (const itemId of getPickableItems(node, game.state.collectedItems)) {
    const item = ITEMS[itemId];
    if (!item) continue;

    const plan = inventory.planWildPickup(game.getPocket(), game.getEquipped());
    if (plan.mode === 'pocket') {
      game.addToPocket({ ...item });
      game.markItemCollected(itemId);
      dropFromNode(node, itemId);
      terminal.log(UI.gotItem(item.name));
      changed = true;
      continue;
    }

    /* 口袋满了：弹窗选一件丢掉，或放弃拾取（未选择前不关闭，时间照常流逝） */
    const choice = await terminal.showModal({
      title: UI.discardTitle,
      text: `捡到：${item.name}（${item.desc}）`,
      actions: [
        ...game.getPocket().map((held, index) => ({ label: `丢掉 ${held.name}`, value: index })),
        { label: UI.discardCancel, value: null },
      ],
    });
    if (choice === null || choice === undefined) continue;   /* 物品留在节点 */

    const dropped = game.getPocket()[choice];
    game.removeFromPocket(dropped);
    game.addToPocket({ ...item });
    game.markItemCollected(itemId);
    dropFromNode(node, itemId);
    terminal.log(UI.gotItem(item.name));
    changed = true;
  }

  if (changed) renderInventory();
}

function dropFromNode(node, itemId) {
  const i = node.items.indexOf(itemId);
  if (i >= 0) node.items.splice(i, 1);
}

/* ---------------- 选项执行 ---------------- */

async function onOptionClick(index) {
  if (game.isGameOver()) return;                     /* 0 */

  const node = getNode(game.getCurrentNode());
  const button = lastButtons.find((b) => b.index === index);
  const option = button && button.option;
  if (!node || !option) return;

  const batteryCost = option.batteryCost || 0;
  if (game.getBattery() < batteryCost) {             /* 1 */
    terminal.log(UI.noBattery);
    return;
  }

  nightEnded = false;
  game.spendBattery(batteryCost);                    /* 2 */
  time.advanceTime(option.timeCost || 0);

  terminal.log(UI.echo(option.text));                                      /* 回看：> 选项文本 */
  game.markOptionUsed(node.id, option.fullIndex, option.perDay === true);  /* 3 */
  game.markGroupUsed(node.id, option.group);

  if (!nightEnded) await option.handler(option, node);           /* 4 */

  refreshButtons();                                  /* 5 */
  renderStatusBar();
  renderInventory();
}

/* ---------------- 命令输入 ---------------- */

function handleCommand(input) {
  if (game.isGameOver()) return;

  const text = String(input).trim();

  if (text.startsWith('/')) {
    if (!DEBUG_CONSOLE) {
      terminal.log(UI.unknownCommand);
      return;
    }
    terminal.log(debug.runCommand(text, game.state, debugContext));
    return;
  }

  if (/^\d+$/.test(text)) {
    const index = Number(text);
    const button = lastButtons.find((b) => b.index === index);

    /* requires 不满足：编号占用，输入后提示需求而不是“未知的命令” */
    if (button && button.disabledByRequirement) {
      terminal.log(button.option.requiresHint || UI.optionNoRequirement);
      return;
    }
    if (button && !button.disabled) {
      onOptionClick(index);
      return;
    }
  }
  terminal.log(UI.unknownCommand);
}

/* ---------------- 强制回家 / 结算 ---------------- */

function onNightEnd() {
  nightEnded = true;
  if (game.isGameOver()) return;

  if (game.getCurrentNode() !== HOME_ID) {
    onForceHome('night');
    return;
  }

  /* 已经在家（正常流程不会走到）：天数 +1 并把当晚计时归零，否则时钟会卡在 06:00 */
  game.setDay(game.getDay() + 1);
  game.setElapsedSeconds(0);
  time.startClock(onNightEnd);
  renderStatusBar();
}

async function onForceHome(reason) {
  if (game.isGameOver()) return;                     /* 1 */

  terminal.clearQueue();                             /* 2 */
  terminal.log(reason === 'night' ? UI.nightHome : UI.collapse);   /* 3 */

  game.visit(HOME_ID);                               /* 4 先传送回家（并标记已访问），不扣体力/时间 */
  game.setStaminaMax(game.getStaminaMax() - FORCE_HOME_PENALTY);   /* 5 */

  if (game.getStaminaMax() <= STAMINA_MIN) {         /* 6 走不动了：先结算，再 gameOver */
    settleNight();                                   /* a) 天数 +1、时间归零、体力电量回满、切整理模式 */
    game.setGameOver(true);                          /* b) */
    terminal.log(UI.gameOverStamina);                /* c) "你已经精疲力尽，再也走不动了。游戏结束。" */
    time.stopClock();                                /* d) 停止时钟 */
    terminal.setLocked(true);
    redrawHomeQuietly();                             /* e) 重绘所有 UI（人已经在家） */
    return;                                          /* f) */
  }

  settleNight();                                     /* 7 正常结算 */
  await arriveAt(getNode(HOME_ID));
}

/** 不打印到达文案地把 UI 切到“家”（结算后 gameOver 时用） */
function redrawHomeQuietly() {
  const home = getNode(HOME_ID);
  game.setOptions(buildOptions(home));
  setSceneArt(home.ascii);
  refreshMap({ visited: game.getVisited(), current: HOME_ID });
  refreshButtons();
  renderStatusBar();
  renderInventory();
}

/**
 * 结算流程：主动回家与强制回家共用。
 * 这是修改 state.day 的唯一游戏逻辑位置（main.js / settleNight）。
 */
function settleNight() {
  game.setDay(game.getDay() + 1);        /* 1 */
  game.setElapsedSeconds(0);             /* 2 */
  game.setStamina(game.getStaminaMax()); /* 3 */
  game.setBattery(BATTERY_MAX);          /* 4 */
  game.clearPerDayOptions();             /* 5 清空 perDay 已用项 */
  time.resetClock();                     /* 时间回到 20:00:00 */
  time.startClock(onNightEnd);           /* 夜晚结束时时钟被停过，这里重新驱动 */

  renderStatusBar();                     /* 7 重绘 UI（6 整理模式由 currentNode === home 自动生效） */
  renderInventory();
  refreshMap({ visited: game.getVisited(), current: game.getCurrentNode() });
}

/* ---------------- 存档 ---------------- */

async function exportSave() {
  const text = save.serialize(game.toSnapshot());
  terminal.log(text);

  const picked = await terminal.showModal({
    title: UI.saveTitle,
    input: { value: text, readOnly: true },
    actions: [{ label: UI.copy, value: 'copy' }, { label: UI.close, value: null }],
  });

  if (picked === 'copy') {
    const ok = await terminal.copyText(text);
    terminal.log(ok ? UI.copied : UI.copyFailed);
  }
}

async function importSave() {
  const text = await terminal.showModal({
    title: UI.importSave,
    input: { placeholder: '把存档字符串粘贴到这里' },
    actions: [{ label: UI.ok }, { label: UI.cancel, value: null }],
  });
  if (!text) return;

  const snapshot = save.deserialize(text);
  if (!snapshot) {
    terminal.log(UI.saveInvalid);
    return;
  }
  if (!window.confirm(UI.saveConfirm)) return;

  time.stopClock();                                   /* 1 停旧定时器 */
  game.replaceFromSnapshot(snapshot);                 /* 2 替换状态 */
  const node = getNode(game.getCurrentNode()) || getNode(HOME_ID);
  game.setOptions(buildOptions(node));
  time.startClock(onNightEnd);                        /* 3 重启定时器（重建时间基准） */

  refreshMap({ visited: game.getVisited(), current: game.getCurrentNode() });   /* 4 重绘 UI */
  renderStatusBar();
  refreshButtons();
  renderInventory();
  setSceneArt(node.ascii);

  terminal.log(UI.saveImported);
}

/* ---------------- debug ctx ---------------- */

const debugContext = {
  refreshUI() {
    renderStatusBar();
    refreshButtons();
    renderInventory();
    refreshMap({ visited: game.getVisited(), current: game.getCurrentNode() });
  },
  getState: () => game.state,
  setState: (patch) => Object.assign(game.state, patch),
  goto: (nodeId) => {
    const node = getNode(nodeId);
    if (!node) return false;
    game.visit(nodeId);
    arriveAt(node);
    return true;
  },
  redrawMap: () => refreshMap({ visited: game.getVisited(), current: game.getCurrentNode() }),
  nodes: () => NODES.map((n) => ({ id: n.id, name: n.name })),
  redrawStatusBar: renderStatusBar,
};

/* ---------------- 深色模式 ---------------- */

function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    /* 隐私模式 / file:// 下忽略 */
  }
}

function applyTheme(mode, persist) {
  document.documentElement.dataset.theme = mode;
  const button = document.getElementById('theme-toggle');
  if (button) button.textContent = mode === 'dark' ? UI.theme.toLight : UI.theme.toDark;
  if (persist) safeSet(THEME_KEY, mode);
}

function initTheme() {
  const saved = safeGet(THEME_KEY);
  const prefersDark = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved === 'dark' || saved === 'light' ? saved : (prefersDark ? 'dark' : 'light'), false);

  const button = document.getElementById('theme-toggle');
  if (button) {
    button.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
    });
  }
}

/* ---------------- 启动 ---------------- */

function boot() {
  sceneEl = document.getElementById('scene');

  applyTexts();
  initTheme();

  initMap(document.getElementById('map'), { onNodeClick: travelTo });
  terminal.initTerminal({ onSubmit: handleCommand });

  game.initState(HOME_ID);
  refreshMap({ visited: game.getVisited(), current: game.getCurrentNode() });
  renderStatusBar();
  renderInventory();

  time.startClock(onNightEnd);
  window.setInterval(renderStatusBar, TICK_INTERVAL_MS);

  arriveAt(getNode(HOME_ID));
}

boot();



