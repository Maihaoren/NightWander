/**
 * main.js —— 入口与唯一协调者
 * 初始化与接线、深色模式、状态栏与物品栏渲染，并编排：移动/到达/选项/
 * 野外捡物/强制回家/夜晚结算/存档/debug 指令。
 */

import {
  STAMINA_MIN, BATTERY_MAX, FORCE_HOME_PENALTY, MOVE_STAMINA_COST, TICK_INTERVAL_MS, DEBUG_CONSOLE,
  SHELTER_OVERNIGHT_COST_SEC,
} from './config.js';
import { UI, SCENES, ITEMS } from './texts.js';
import {
  initMap, refreshMap, setMapView, getNode, getNodes, getRegion, computeClickable, computeEdgeCost,
  getCrossRegionTarget, isShelter, isAreaUnlocked, REGIONS, HOME_ID,
} from './map.js';
import * as terminal from './terminal.js';
import * as game from './state.js';
import * as time from './timeSystem.js';
import * as inventory from './inventory.js';
import * as save from './saveSystem.js';
import * as debug from './debug.js';

const THEME_KEY = 'nightwander:theme';

/** 终点节点：首次到达即结束。旧版的 GOAL_ID 已随 map.js 重写移除，终点改为 area2 的旅者之石 */
const GOAL2_ID = 'goal2';

let nightEnded = false;      /* 本轮移动/选项期间是否刚好天亮了 */
let sceneEl = null;

/** 当前所在安全屋的储物键（形如 'area1:home'）；不在安全屋时返回 null */
function currentShelterKey() {
  const area = game.getCurrentArea();
  const node = game.getCurrentNode();
  return isShelter(area, node) ? game.makeShelterKey(area, node) : null;
}

/** 视图切换：同时改 state（进存档）与 map（真正重绘），两者不允许各走各的 */
function switchMapView(view) {
  game.setMapView(view);
  setMapView(view);
}

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
  const shelterKey = currentShelterKey();
  const storage = shelterKey ? game.getShelterStorage(shelterKey) : [];
  const capacity = inventory.computePocketCapacity(equipped);
  const full = pocket.length >= capacity;
  const atHome = Boolean(shelterKey);

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

  /* 储物箱：只在安全屋可见 */
  if (atHome) {
    el.appendChild(section(
      `${UI.inventory.storage} ${storage.length}/${game.getStorageCapacity(shelterKey)}`,
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
  const shelterKey = currentShelterKey();
  if (!shelterKey) return;
  const plan = inventory.planTakeFromStorage(item, game.getEquipped(), game.getPocket());
  if (plan.reason) {
    terminal.log(plan.reason);
    return;
  }
  game.removeFromStorage(shelterKey, item);
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
  const shelterKey = currentShelterKey();
  if (!shelterKey) return;
  const item = game.getEquipped()[slot];
  const plan = inventory.planUnequip(slot, game.getEquipped(), game.getPocket(),
    game.getShelterStorage(shelterKey), game.getStorageCapacity(shelterKey));
  if (plan.reason) {
    terminal.log(plan.reason);
    return;
  }
  game.setEquippedSlot(slot, null);
  game.addToStorage(shelterKey, item);
  terminal.log(UI.unequip(item.name));
  renderInventory();
}

function pocketToStorage(item) {
  if (game.isGameOver()) return;
  const shelterKey = currentShelterKey();
  if (!shelterKey) return;
  const plan = inventory.planPocketToStorage(game.getShelterStorage(shelterKey), game.getStorageCapacity(shelterKey));
  if (plan.reason) {
    terminal.log(plan.reason);
    return;
  }
  game.removeFromPocket(item);
  game.addToStorage(shelterKey, item);
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
  if (node.id === GOAL2_ID) return null;
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

/* 安全屋专属选项：按需求插到选项列表最前（过夜 / 稍作停留），导出与导入照旧跟在后面 */
const SHELTER_OPTIONS = [
  /* perDay：用过之后由结算流程 clearPerDayOptions 复位，否则第二天就再也点不到「过夜」了 */
  { text: UI.shelter.overnight, timeCost: SHELTER_OVERNIGHT_COST_SEC, batteryCost: 0, perDay: true, kind: 'overnight' },
  { text: UI.shelter.stay, repeatable: true, timeCost: 0, batteryCost: 0, kind: 'stay' },
  { text: UI.exportSave, repeatable: true, timeCost: 0, batteryCost: 0, save: 'export' },
  { text: UI.importSave, repeatable: true, timeCost: 0, batteryCost: 0, save: 'import' },
];

const OPTION_HANDLERS = {
  n3: { 1: enterCave },              /* 序号 1 对应 SCENES.n3 的「进入洞穴」 */
  southgate: { 1: goCrossRegion },   /* 序号 1 对应 SCENES.southgate 的「前往南边的未知地域」 */
};

/* 按 option.kind 挂 handler：安全屋选项是运行时生成的，用序号会随插队错位 */
const KIND_HANDLERS = { overnight: overnightAtShelter, stay: stayAtShelter };

function buildOptions(node) {
  const table = OPTION_HANDLERS[node.id] || {};
  const extra = ensureTimeOption(node);
  const shelterExtras = isShelter(game.getCurrentArea(), node.id) ? SHELTER_OPTIONS : [];
  const all = [...shelterExtras, ...node.options];
  if (extra) all.push(extra);

  return all.map((option, i) => {
    let handler = table[i + 1];
    if (!handler && option.kind) handler = KIND_HANDLERS[option.kind];
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
  const area = game.getCurrentArea();
  const node = getNode(area, id);
  if (!node) return;

  if (!computeClickable(area, game.getVisitedByArea(area)).has(id)) {
    terminal.log(UI.farAway);
    return;
  }
  if (game.getStamina() < MOVE_STAMINA_COST) {        /* 1 */
    terminal.log(UI.noStamina);
    return;
  }

  const cost = computeEdgeCost(game.getCurrentNode(), id, area);   /* 2 */
  const firstVisit = !game.isVisited(area, id);

  nightEnded = false;
  game.spendStamina(MOVE_STAMINA_COST);              /* 3 */
  time.advanceTime(cost);
  if (nightEnded) return;                            /* 途中天亮：已被强制送回安全屋 */

  game.visit(area, id);                              /* 4 到达安全屋不再自动结算，改由选项里的「过夜」触发 */

  await arriveAt(node);                              /* 5 正常到达流程 */
  if (game.isGameOver()) return;

  if (id === GOAL2_ID && firstVisit) {               /* 终点：首次到达即结束 */
    terminal.log(UI.foundJourneyEnd);
    game.setGameOver(true);
    time.stopClock();
    terminal.setLocked(true);
    renderStatusBar();
    return;
  }

  if (!isShelter(area, id) && game.getStamina() <= 0) onForceHome('stamina');
}

async function arriveAt(node) {
  terminal.clearQueue();

  game.setOptions(buildOptions(node));
  refreshMap({ current: node.id });
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

/* ---------------- 跨区域移动 / 安全屋过夜 / 地图视图 ---------------- */

/** 点击大地图上的区域块：当前区域切进区域地图，其他区域提示不在这里 */
function onRegionClick(areaId) {
  if (!areaId) return;
  if (areaId === game.getCurrentArea()) {
    switchMapView('area');
    return;
  }
  terminal.log(UI.notHere);
}

/** southgate 的「前往南边的未知地域」：扣 1 体力并切换区域与节点（耗时已由选项 timeCost 扣过） */
async function goCrossRegion() {
  if (game.isGameOver()) return;

  const area = game.getCurrentArea();
  const target = getCrossRegionTarget(game.getCurrentNode(), area);
  if (!target) return;
  const node = getNode(target.areaId, target.nodeId);
  if (!node) return;

  if (game.getStamina() < MOVE_STAMINA_COST) {
    terminal.log(UI.noStamina);
    return;
  }

  game.spendStamina(MOVE_STAMINA_COST);
  game.visit(target.areaId, target.nodeId);   /* 同时把 entrance 记进 visitedByArea.area2 */
  terminal.log(UI.crossRegionWalk);
  switchMapView('area');                      /* 换区域后回到区域地图 */

  await arriveAt(node);
}

/** 安全屋过夜：走与回家同一套结算流程，之后重新打印一次到达 */
async function overnightAtShelter() {
  settleNight();
  const node = getNode(game.getCurrentArea(), game.getCurrentNode());
  if (node) await arriveAt(node);
}

function stayAtShelter() {
  terminal.log(UI.shelter.stayReply);
}

/* ---------------- 野外捡物 ---------------- */

/** 节点上还没被捡走的物品（旧 map.js 的 getPickableItems 在新版里没有了，改由 main 负责） */
function getPickableItems(node, collected) {
  return (node.items || []).filter((id) => !collected.has(id));
}

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

  const node = getNode(game.getCurrentArea(), game.getCurrentNode());
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

  const area = game.getCurrentArea();
  if (!isShelter(area, game.getCurrentNode())) {
    onForceHome('night');
    return;
  }

  /* 天亮时人在安全屋（正常流程不会走到）：天数 +1 并把当晚计时归零，否则时钟会卡在 06:00 */
  game.setDay(game.getDay() + 1);
  game.setElapsedSeconds(0);
  time.startClock(onNightEnd);
  renderStatusBar();
}

async function onForceHome(reason) {
  if (game.isGameOver()) return;                     /* 1 */

  terminal.clearQueue();                             /* 2 */
  terminal.log(reason === 'night' ? UI.nightHome : UI.collapse);   /* 3 */

  /* 4 按区域送回该区域自己的 primaryShelter（并标记已访问），不扣体力/时间 */
  const area = game.getCurrentArea();
  const region = getRegion(area);
  const shelterId = (region && region.primaryShelter) || HOME_ID;
  game.visit(area, shelterId);
  game.setStaminaMax(game.getStaminaMax() - FORCE_HOME_PENALTY);   /* 5 惩罚立即生效 */

  if (game.getStaminaMax() <= STAMINA_MIN) {         /* 6 走不动了：先结算，再 gameOver */
    settleNight();                                   /* a) 天数 +1、时间归零、体力电量回满 */
    game.setGameOver(true);                          /* b) */
    terminal.log(UI.gameOverStamina);                /* c) "你已经精疲力尽，再也走不动了。游戏结束。" */
    time.stopClock();                                /* d) 停止时钟 */
    terminal.setLocked(true);
    redrawShelterQuietly();                          /* e) 重绘所有 UI（人已经在安全屋） */
    return;                                          /* f) */
  }

  /* 7 强制回家不再自动结算：送到安全屋后由玩家自己选「过夜」 */
  await arriveAt(getNode(area, shelterId));
}

/** 不打印到达文案地把 UI 切到当前安全屋（结算后 gameOver 时用） */
function redrawShelterQuietly() {
  const area = game.getCurrentArea();
  const node = getNode(area, game.getCurrentNode()) || getNode(area, HOME_ID);
  if (!node) return;
  game.setOptions(buildOptions(node));
  setSceneArt(node.ascii);
  refreshMap({ current: node.id });
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

  renderStatusBar();                     /* 7 重绘 UI（6 整理模式由「当前节点是安全屋」自动生效） */
  renderInventory();
  refreshMap({ current: game.getCurrentNode() });
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
    /* v1 是单区域存档，按需求不提供迁移，单独给一句更准确的提示 */
    terminal.log(save.peekVersion(text) === 1 ? UI.saveTooOld : UI.saveInvalid);
    return;
  }
  if (!window.confirm(UI.saveConfirm)) return;

  time.stopClock();                                   /* 1 停旧定时器 */
  game.replaceFromSnapshot(snapshot);                 /* 2 替换状态 */
  const area = game.getCurrentArea();
  const node = getNode(area, game.getCurrentNode()) || getNode(area, HOME_ID);
  game.setOptions(buildOptions(node));
  switchMapView(game.getMapView());                   /* 3 视图按存档恢复（大地图 / 区域地图） */
  time.startClock(onNightEnd);                        /* 4 重启定时器（重建时间基准） */

  refreshMap({ current: game.getCurrentNode() });     /* 5 重绘 UI */
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
    refreshMap({ current: game.getCurrentNode() });
  },
  getState: () => game.state,
  setState: (patch) => Object.assign(game.state, patch),
  goto: (nodeId, areaId) => {
    const area = areaId || game.getCurrentArea();
    const node = getNode(area, nodeId);
    if (!node) return false;
    game.visit(area, nodeId);
    switchMapView('area');
    arriveAt(node);
    return true;
  },
  redrawMap: () => refreshMap({ current: game.getCurrentNode() }),
  nodes: () => getNodes(game.getCurrentArea()).map((n) => ({ id: n.id, name: n.name })),
  areas: () => Object.keys(REGIONS).map((id) => ({
    id,
    name: REGIONS[id].name,
    unlocked: isAreaUnlocked(id),
    current: id === game.getCurrentArea(),
  })),
  gotoArea: (areaId) => {
    const region = getRegion(areaId);
    if (!region) return false;
    const targetId = region.entranceNode || region.primaryShelter || (region.nodes[0] && region.nodes[0].id);
    const node = targetId ? getNode(areaId, targetId) : null;
    if (!node) return false;
    game.visit(areaId, targetId);
    switchMapView('area');
    arriveAt(node);
    return true;
  },
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

  initMap(document.getElementById('map'), { onNodeClick: travelTo, onRegionClick });
  terminal.initTerminal({ onSubmit: handleCommand });

  const worldButton = document.getElementById('back-to-world');
  if (worldButton) worldButton.addEventListener('click', () => switchMapView('world'));

  game.initState(HOME_ID);
  switchMapView(game.getMapView());   /* 新开局按 state 的默认值显示大地图 */
  renderStatusBar();
  renderInventory();

  time.startClock(onNightEnd);
  window.setInterval(renderStatusBar, TICK_INTERVAL_MS);

  arriveAt(getNode(game.getCurrentArea(), HOME_ID));
}

boot();



