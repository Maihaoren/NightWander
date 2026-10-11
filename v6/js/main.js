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
  initMap, refreshMap, setMapView, getNode, getNodes, getRegion, getNodeIds,
  isShelter, isAreaUnlocked, areasOfNode, sharedNodes, isAreaNeighbor,
  isSharedNode, primaryShelterOf, getVisitedIn,
  reachableVisited, hasDirectEdge, calcMoveDuration, clearMoveDurationCache, REGIONS, HOME_ID,
  isDarkNode, isNodeBlockedByDarkness,
} from './map.js';
import * as terminal from './terminal.js';
import * as modal from './modal.js';
import * as game from './state.js';
import * as time from './timeSystem.js';
import * as inventory from './inventory.js';
import * as save from './saveSystem.js';
import * as debug from './debug.js';

const THEME_KEY = 'nightwander:theme';

/** 终点节点：首次到达即结束。旧版的 GOAL_ID 已随 map.js 重写移除，终点改为 area2 的旅者之石 */
const GOAL2_ID = 'goal2';

/**
 * 回电地点：只有【家节点】。v1.8.5 起这里写的是「当前区域是 home」，
 * 于是站在 area1 / newarea1 里的 home 节点过夜不回电 —— 那一版按区域判断是错的。
 * 节点 id 全局唯一，所以按节点判断：走到哪个区域的 home，都在自己家里。
 * 灯塔 / 北关口 / 南关口这些安全屋不回电。
 */
const RECHARGE_NODE = HOME_ID;

let nightEnded = false;      /* 本轮移动/选项期间是否刚好天亮了 */
let batteryCollapsed = false;/* 本轮移动/选项期间是否触发了「黑暗地点断电回家」 */
let sceneEl = null;
let pendingMove = null;      /* 本次移动的 { fromId, toId, cost }，供 arriveAt 打印移动横幅 */

/** 当前所在安全屋的储物键（节点 id 全局唯一，直接用 id）；不在安全屋时返回 null */
function currentShelterKey() {
  const node = game.getCurrentNode();
  return isShelter(node) ? node : null;
}

/**
 * 到达某节点：切换区域与节点，并把【共享节点】在每个所属区域里都标记为已访问。
 * 「哪些区域含这个节点」是 map.js 的知识，所以这条规则放在 main.js（唯一协调者）里。
 */
function visitNode(areaId, nodeId) {
  game.setCurrentArea(areaId);
  game.setCurrentNode(nodeId);
  for (const area of areasOfNode(nodeId)) game.markVisited(area, nodeId);
}

/** 视图切换：同时改 state（进存档）与 map（真正重绘），两者不允许各走各的 */
function switchMapView(view) {
  game.setMapView(view);
  setMapView(view);
  updateBackButton(view);
}

/**
 * 「返回」按钮的点击目标跟着上下文走（上一条补丁只改了文案、没改 target，是 bug）：
 *   在大地图上   → 回到【玩家当前所在区域】的区域地图（不是固定的 area1）
 *   在区域地图上 → 回到大地图
 * 文案同步：大地图上显示「返回区域地图」，区域地图上显示「返回大地图」。
 */
function onBackButtonClick() {
  switchMapView(game.getMapView() === 'world' ? 'area' : 'world');
}

function updateBackButton(view) {
  const button = document.getElementById('back-to-world');
  if (button) button.textContent = view === 'world' ? UI.backToArea : UI.backToWorld;
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
  stamina.textContent = UI.status.stamina(Math.max(0, game.getStamina()), game.getStaminaMax());
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
  const capacity = inventory.computePocketCapacity(equipped);   /* 手持保底 1 格 + 装备提供的 pockets */
  const carried = inventory.computeCarried(equipped, pocket);   /* 口袋件数 + 手持槽占用 */
  const full = carried >= capacity;
  const atHome = Boolean(shelterKey);

  count.textContent = UI.inventory.count(carried, capacity, full);
  const hint = UI.inventory.sources(inventory.getPocketSources(equipped, UI.slotName));
  count.title = hint;
  if (title) title.title = hint;

  el.textContent = '';

  /* 装备槽：在家点击卸下；野外只有手持槽能动（它同时是保底物品栏），其余槽只读 */
  el.appendChild(section(UI.inventory.slots, inventory.SLOTS.map((slot) => {
    const item = equipped[slot];
    const label = `${UI.slotName[slot]}：${item ? item.name : UI.inventory.emptySlot}`;

    if (slot === 'hand') {
      return itemButton(label, {
        onClick: () => handToPocket(),
        disabled: !item,
        hint: item
          ? (atHome ? '点击收回口袋（口袋满则放回储物箱）' : '点击收回口袋')
          : '保底物品栏：固定 1 格，任何物品都能放',
      });
    }
    if (!atHome) return itemButton(label, { onClick: () => inspectItem(item), disabled: !item });
    return itemButton(label, {
      onClick: () => unequip(slot),
      disabled: !item,
      hint: item && item.pockets ? `提供 ${item.pockets} 个口袋格` : '',
    });
  })));

  /* 当地物品：当前节点上还没捡走的东西。
     逻辑上「还不属于你」，所以放在装备槽下面、你的物品（储物箱 / 口袋）上面；
     全部捡走后这一区自动消失。它是到达弹窗之外的第二入口 */
  const here = getNode(game.getCurrentNode());
  const localItems = here ? getPickableItems(here, game.state.collectedItems) : [];
  if (localItems.length) {
    el.appendChild(section(
      `${UI.inventory.local} ${localItems.length}`,
      localItems.map((itemId) => {
        const item = ITEMS[itemId];
        const plan = inventory.planLocalPickup(pocket, equipped);
        const suffix = plan.needDiscard ? '（空间不足）' : '';
        return itemButton(`${item ? item.name : itemId}${suffix}`, {
          onClick: () => localPickup(itemId),
          hint: item ? item.desc : '',
        });
      }),
    ));
  }

  /* 储物箱：只在安全屋可见 */
  if (atHome) {
    el.appendChild(section(
      `${UI.inventory.storage} ${storage.length}/${game.getStorageCapacity(shelterKey)}`,
      storage.map((item) => {
        const plan = inventory.planTakeFromStorage(item, equipped, pocket);
        const suffix = plan.mode === 'equip' ? '（可装备）' : (plan.mode === 'hand' ? '（可拿在手里）' : '');
        return itemButton(`${item.name}${suffix}`, {
          onClick: () => takeFromStorage(item),
          disabled: Boolean(plan.reason),
          hint: item.pockets ? `可提供 ${item.pockets} 个口袋格` : '',
        });
      }),
    ));
  }

  el.appendChild(section(UI.inventory.pocket, pocket.map((item) => itemButton(item.name, {
    onClick: atHome ? () => pocketToStorage(item) : () => onPocketClickAway(item),
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
  } else if (plan.mode === 'hand') {
    game.setEquippedSlot('hand', item);
    terminal.log(UI.toHand(item.name));
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

/* ---------------- 口袋 ↔ 手持（手持槽 = 保底物品栏） ---------------- */

/** 口袋 → 手持槽：野外与在家都允许，手持只放一件 */
function pocketToHand(item) {
  if (game.isGameOver()) return;
  const plan = inventory.planPocketToHand(game.getEquipped());
  if (plan.reason) {
    terminal.log(plan.reason);
    return;
  }
  game.removeFromPocket(item);
  game.setEquippedSlot('hand', item);
  terminal.log(UI.toHand(item.name));
  renderInventory();
}

/** 手持槽 → 口袋；在家且口袋放不下时退回储物箱（野外只提示） */
function handToPocket() {
  if (game.isGameOver()) return;
  const item = game.getEquipped().hand;
  if (!item) return;

  const plan = inventory.planHandToPocket(game.getEquipped(), game.getPocket());
  if (plan.reason) {
    if (currentShelterKey()) { unequip('hand'); return; }
    terminal.log(plan.reason);
    return;
  }
  game.setEquippedSlot('hand', null);
  game.addToPocket(item);
  terminal.log(UI.toPocket(item.name));
  renderInventory();
}

/** 野外点口袋里的物品：手持槽空着就先收进手持槽，否则退回「查看」 */
function onPocketClickAway(item) {
  if (game.isGameOver()) return;
  if (game.getEquipped().hand) { inspectItem(item); return; }
  pocketToHand(item);
}

/**
 * 点物品栏「当地物品」区里的一件：走与到达弹窗完全相同的拾取逻辑
 *（口袋 → 手持 → 空间不足时弹替换窗），不消耗时间。
 */
async function localPickup(itemId) {
  if (game.isGameOver()) return;
  const node = getNode(game.getCurrentNode());
  const item = ITEMS[itemId];
  if (!node || !item) return;
  if (game.state.collectedItems.has(itemId)) return;      /* 已经被拿走了 */
  await tryTakeItem(node, itemId, item);
  renderInventory();
}

/** 当前节点是否处于「必须先做出决定」且尚未解除的状态（mustResolve） */
function isMustResolvePending(nodeId) {
  const node = getNode(nodeId);
  if (!node || !node.mustResolve) return false;
  return !game.isMustResolveResolved(nodeId);
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
};

/* 按 option.kind 挂 handler：安全屋选项是运行时生成的，用序号会随插队错位 */
const KIND_HANDLERS = { overnight: overnightAtShelter, stay: stayAtShelter };

function buildOptions(node) {
  const table = OPTION_HANDLERS[node.id] || {};
  const extra = ensureTimeOption(node);
  const shelterExtras = isShelter(node.id) ? SHELTER_OPTIONS : [];
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
  const node = getNode(id);
  if (!node) return;

  /* mustResolve：当前所在节点还没做出决定时不能离开（不消耗任何资源） */
  if (isMustResolvePending(game.getCurrentNode())) {
    terminal.log(UI.mustResolveFirst);
    return;
  }

  /* 只能在当前区域内移动 */
  if (!getNodeIds(area).includes(id)) return;

  /* 没电时不能进入黑暗地点：点击一律无效（静默，与其它不可点情形一致）。
     southpass 只是通道、没有 isDark 标记，所以不受这条限制。 */
  if (isNodeBlockedByDarkness(id)) return;

  /* 可点性：已访问的走「已探明路径连通」，未访问的只看是否与当前节点直接相邻。
     不可点就静默返回 —— 不移动、不扣体力、不推时间、不弹提示 */
  const here = game.getCurrentNode();
  const visitedIn = getVisitedIn(area);
  const clickable = visitedIn.has(id)
    ? reachableVisited(area, here, visitedIn).has(id)
    : hasDirectEdge(area, here, id);
  if (!clickable) return;

  /* 2 移动耗时走 calcMoveDuration（沿已探明路径 + ±10% 随机）。
       悬浮预览时已经算好并缓存过，这里复用同一个值 —— 预览与实际必然一致 */
  const move = calcMoveDuration(here, id, area, visitedIn);
  if (!move) return;
  clearMoveDurationCache();                           /* 用完即作废，免得影响下一步的预览 */
  const firstVisit = !game.isVisited(area, id);

  pendingMove = { fromId: here, toId: id, seconds: move.seconds, display: move.display };

  nightEnded = false;
  batteryCollapsed = false;
  /* 3 扣体力：0 只是「筋疲力尽」的提示点，负值才触发强制回家 */
  game.spendStamina(MOVE_STAMINA_COST);
  if (game.getStamina() === 0) terminal.log(UI.exhausted);
  time.advanceTime(move.seconds);
  if (nightEnded) return;                            /* 途中天亮：已被强制送回安全屋 */
  /* 路上把电量走干了、而出发地就是黑暗地点（从黑暗里往外走）：已在流逝回调里送回 home */
  if (batteryCollapsed) { pendingMove = null; return; }

  visitNode(area, id);                               /* 4 共享节点会在所属的每个区域里都标记 */
  /* 4.5 落点就是黑暗地点且电量已经见底（刚好在路上走干）：走黑暗断电回家，不再打印到达 */
  if (onBatteryCollapse()) { pendingMove = null; return; }

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

  /* 6 体力为负：正好在安全屋就地结算（不惩罚），否则强制回家 + 惩罚 */
  if (game.getStamina() < 0) {
    if (isShelter(id)) settleNight();
    else onForceHome('stamina');
  }
}

async function arriveAt(node) {
  terminal.clearQueue();

  game.setOptions(buildOptions(node));
  refreshMap({ current: node.id });
  setSceneArt(node.ascii);
  refreshButtons();   /* 先让按钮行切到当前地点：拾取弹窗会阻塞后续流程，期间不该显示上个地点的按钮 */

  /* 移动横幅：一次移动显示「地点一 -->地点二」+ 耗时；
     非移动类到达（开局 / 过夜 / 强制回家 / debug 传送）没有 from，退回旧文案 */
  const move = pendingMove;
  pendingMove = null;

  terminal.log('');                                  /* 到达前空行 */
  if (move && move.toId === node.id) {
    const fromNode = getNode(move.fromId);
    terminal.log(UI.moved(fromNode ? fromNode.name : '？', node.name), 'arrival');
    terminal.log(UI.timeCost(move.display));          /* HH:MM:SS */
  } else {
    terminal.log(UI.arrived(node.name), 'arrival');   /* 1 斜体到达文本 */
  }
  terminal.log('');                                  /* 到达后空行 */
  terminal.log(node.desc);                           /* 2 */
  terminal.log(UI.prompt);                           /* 3 */
  renderInventory();                                 /* 3.5 先让物品栏的「当地物品」区显示出来 */
  await pickUpItems(node);                           /* 4 */
  terminal.log(UI.optionLine(currentButtons()), 'options');   /* 5 选项列表加粗 */
  refreshButtons();                                  /* 6 */
  renderStatusBar();
  renderInventory();
  terminal.focusInput();

  await resolveMustResolve(node);                    /* 7 到达流程结束后再弹 mustResolve 模态 */
}

/**
 * mustResolve：到达关键节点后弹一个「必须从里面选一个」的模态。
 * 无可点选项（requires 都不满足 / 都用过了）时不弹，输出提示并视为已解除，允许离开。
 */
async function resolveMustResolve(node) {
  if (!node.mustResolve) return;
  if (game.isMustResolveResolved(node.id)) return;

  const choices = currentButtons().filter((b) => !b.disabled);
  if (choices.length === 0) {
    terminal.log(UI.mustResolveNothing);
    game.markMustResolveResolved(node.id);
    return;
  }

  const result = await modal.showModal({
    title: node.name,
    desc: node.mustResolveDesc,
    items: choices.map((b) => ({ id: b.index, text: `[${b.index}] ${b.option.text}` })),
    actions: [],                                    /* 没有底部按钮：必须从 items 里选一个 */
  });

  if (!result || result.type !== 'item') return;
  await onOptionClick(result.id);                   /* 触发 handler；解除由 onOptionClick 负责 */
}

/* ---------------- 区域切换 / 安全屋过夜 / 地图视图 ---------------- */

/**
 * 点击大地图上的区域块（改动 2 + 改动 3）：
 *   当前所在区域              → 进区域地图
 *   相邻区域 + 站在共享节点上 → 允许切换（不消耗体力与时间）
 *   相邻区域但不在共享节点上  → 「你不在通往那里的路上。」
 *   不相邻                    → 「你无法直接前往那里，需要走陆路。」
 * 未解锁区域根本不会渲染，所以走不到这里。
 */
async function onRegionClick(areaId) {
  if (!areaId) return;

  const current = game.getCurrentArea();
  if (areaId === current) {
    switchMapView('area');
    return;
  }

  if (!isAreaNeighbor(current, areaId)) {
    terminal.log(UI.cannotGoDirectly);
    return;
  }
  if (!isSharedNode(game.getCurrentNode(), current, areaId)) {
    terminal.log(UI.notOnTheWay);
    return;
  }

  await switchArea(areaId);
}

/**
 * 在共享节点上切换区域视图：只换区域，玩家仍站在同一个节点上，
 * 不消耗体力、不消耗时间。重绘地图并刷新按钮（两个区域的选项可能不同）。
 */
async function switchArea(areaId) {
  game.setCurrentArea(areaId);
  switchMapView('area');

  const node = getNode(game.getCurrentNode());
  if (!node) return;

  game.setOptions(buildOptions(node));
  setSceneArt(node.ascii);
  refreshMap({ current: node.id });
  refreshButtons();
  renderStatusBar();
  renderInventory();
  terminal.log(UI.areaSwitched(getRegion(areaId).name));
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

/** 节点上还没被捡走的物品；实现放在 inventory.js 的 listLocalItems，这里保留原调用名 */
function getPickableItems(node, collected) {
  return inventory.listLocalItems(node && node.items, collected);
}

/**
 * 拾取：整理物品式弹窗（改动 6）。
 *   点单个物品 → 尝试拾取；空间不够就弹替换模态，处理完回到拾取模态；成功则该行消失
 *   带走拿得下的 → 按节点 items 顺序依次尝试，遇到第一个拿不下的就停（不触发替换窗）
 *   全部放弃 → 关闭，物品全部留在节点
 * 拾取与放弃都不消耗时间。
 */
async function pickUpItems(node) {
  let changed = false;

  for (;;) {
    const pickable = getPickableItems(node, game.state.collectedItems);
    if (pickable.length === 0) break;                 /* 列表空了 → 自动关闭 */

    const result = await modal.showModal({
      title: UI.pickupTitle,
      desc: UI.pickupDesc,
      items: pickable.map((itemId) => {
        const item = ITEMS[itemId];
        return { id: itemId, text: item ? item.name : itemId, hint: item ? item.desc : '' };
      }),
      actions: [
        { text: UI.pickupTakeAll, value: 'takeAll' },
        { text: UI.pickupSkipAll, value: 'skipAll' },
        { text: UI.pickupLater, value: 'later' },       /* 关掉弹窗，改从物品栏「当地物品」区处理 */
      ],
    });

    if (!result) break;                               /* 被外部关掉 */
    if (result.type === 'action') {
      if (result.value === 'skipAll' || result.value === 'later') break;   /* 物品全部留在节点 */
      takeAsManyAsPossible(node);                     /* 带走拿得下的 */
      changed = true;
      break;
    }

    /* 点了某一件 */
    const itemId = result.id;
    const item = ITEMS[itemId];
    if (!item) {                                      /* 文案缺失时的兜底：直接记走 */
      game.markItemCollected(itemId);
      dropFromNode(node, itemId);
      changed = true;
      continue;
    }
    if (await tryTakeItem(node, itemId, item)) changed = true;
    /* 玩家在替换窗里放弃 → 该件留在列表里，循环回到拾取模态继续让他选 */
  }

  if (changed) renderInventory();
}

/** 真正把一件记成已拾取（调用方已确认有位置） */
function markTaken(node, itemId, logText) {
  game.markItemCollected(itemId);
  dropFromNode(node, itemId);
  terminal.log(logText);
}

/**
 * 尝试拾取一件：口袋优先 → 手持保底槽 → 都不行才弹替换模态。
 * 返回是否拾取成功（玩家在替换窗放弃则返回 false，物品留在节点）。
 */
async function tryTakeItem(node, itemId, item) {
  const plan = inventory.planWildPickup(game.getPocket(), game.getEquipped());

  if (plan.mode === 'pocket') {
    game.addToPocket({ ...item });
    markTaken(node, itemId, UI.gotItem(item.name));
    return true;
  }
  if (plan.mode === 'hand') {
    game.setEquippedSlot('hand', { ...item });
    markTaken(node, itemId, UI.toHand(item.name));
    return true;
  }

  /* 口袋与手持槽都满了：替换模态（沿用原有「丢一件或放弃」的规则） */
  const result = await modal.showModal({
    title: UI.discardTitle,
    desc: `捡到：${item.name}（${item.desc}）`,
    items: game.getPocket().map((held, index) => ({
      id: index, text: `丢掉 ${held.name}`, hint: held.desc || '',
    })),
    actions: [{ text: UI.discardCancel, value: 'cancel' }],
  });

  if (!result || result.type !== 'item') return false;   /* 放弃这一件 */

  const dropped = game.getPocket()[result.id];
  if (!dropped) return false;
  game.removeFromPocket(dropped);
  game.addToPocket({ ...item });
  markTaken(node, itemId, UI.gotItem(item.name));
  return true;
}

/** 「带走拿得下的」：按节点 items 顺序依次尝试，遇到第一个拿不下的就停 */
function takeAsManyAsPossible(node) {
  for (const itemId of getPickableItems(node, game.state.collectedItems)) {
    const item = ITEMS[itemId];
    if (!item) { game.markItemCollected(itemId); dropFromNode(node, itemId); continue; }

    const plan = inventory.planWildPickup(game.getPocket(), game.getEquipped());
    if (plan.mode === 'pocket') {
      game.addToPocket({ ...item });
      markTaken(node, itemId, UI.gotItem(item.name));
      continue;
    }
    if (plan.mode === 'hand') {
      game.setEquippedSlot('hand', { ...item });
      markTaken(node, itemId, UI.toHand(item.name));
      continue;
    }
    break;                                            /* 拿不下了：停，剩余留在节点 */
  }
  renderInventory();
}

function dropFromNode(node, itemId) {
  const i = node.items.indexOf(itemId);
  if (i >= 0) node.items.splice(i, 1);
}

/* ---------------- 选项执行 ---------------- */

async function onOptionClick(index) {
  if (game.isGameOver()) return;                     /* 0 */

  const area = game.getCurrentArea();
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
  batteryCollapsed = false;
  game.spendBattery(batteryCost);                    /* 2 */
  time.advanceTime(option.timeCost || 0);
  /* 2.5 选项自带的 batteryCost 直接把电量用干、人又站在黑暗地点：
         advanceTime 只在「有流逝」时才会回调，所以这里补一次检测 */
  if (!batteryCollapsed) onBatteryCollapse();

  terminal.log(UI.echo(option.text));                                      /* 回看：> 选项文本 */
  game.markOptionUsed(node.id, option.fullIndex, option.perDay === true);  /* 3 */
  game.markGroupUsed(node.id, option.group);

  /* mustResolve：做出任意一次选择即视为解除 */
  if (node.mustResolve) game.markMustResolveResolved(node.id);

  /* 4 被打断（天亮 / 黑暗断电）时不再执行选项本身的效果 —— 与 nightEnded 同一套处理 */
  if (!nightEnded && !batteryCollapsed) await option.handler(option, node);   /* 4 */

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
  if (!isShelter(game.getCurrentNode())) {
    onForceHome('night');
    return;
  }

  /* 天亮时人在安全屋（正常流程不会走到）：天数 +1 并把当晚计时归零，否则时钟会卡在 06:00 */
  game.setDay(game.getDay() + 1);
  time.drainBatteryOnDayChange();          /* 跨天同样扣一笔（这里没有回电，所以一定会扣到） */
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
  const shelterId = primaryShelterOf(area);
  visitNode(area, shelterId);
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
  await arriveAt(getNode(shelterId));
}

/** 不打印到达文案地把 UI 切到当前安全屋（结算后 gameOver 时用） */
function redrawShelterQuietly() {
  const area = game.getCurrentArea();
  const node = getNode(game.getCurrentNode()) || getNode(HOME_ID);
  if (!node) return;
  game.setOptions(buildOptions(node));
  setSceneArt(node.ascii);
  refreshMap({ current: node.id });
  refreshButtons();
  renderStatusBar();
  renderInventory();
}

/**
 * 黑暗地点断电：身处黑暗地点（isDark 节点）时电量归零 ——
 *   送回 home + 天数 +1 + 时间归零 + 体力回满 + 电量回满，
 *   但**不扣体力上限**（这是与体力归零强制回家的唯一区别），所以不会因此 gameOver。
 *
 * 全程同步：tick 里的电量流逝是定时器回调，等不了 await；而用到的
 * visitNode / settleNight / redrawShelterQuietly 本来就都是同步的。
 *
 * 触发点（都是「电量已经为 0」这一件事的不同来源）：
 *   1) timeSystem 的流逝扣电（tick 连续积分 / advanceTime 离散）→ 通过 setOnBatteryEmpty 回调
 *   2) 选项自带的 batteryCost 直接扣到 0
 *   3) 走进黑暗地点那一刻（路上扣到 0，落点就是黑暗地点）
 *
 * @returns {boolean} 是否真的执行了断电回家（没电但不在黑暗地点 = false，只走视野收缩）
 */
function onBatteryCollapse() {
  if (game.isGameOver()) return false;
  if (game.getBattery() > 0) return false;

  const node = getNode(game.getCurrentNode());
  if (!node || !isDarkNode(node.id)) return false;   /* 非黑暗地点：没电只是视野收缩，不做任何事 */

  terminal.clearQueue();
  terminal.log(UI.darkCollapse);

  /* 1 传送回 home：区域也要跟着换（home 是 home 区域唯一的节点） */
  visitNode(HOME_ID, HOME_ID);

  /* 2 结算：天数 +1、时间归零、体力回满、电量回满（当前节点是 home，回电条件成立）。
       注意这里【没有】setStaminaMax(...)，体力上限一分不扣。 */
  settleNight();

  /* 3 再判断 gameOver（沿用原顺序）。体力上限没被扣，所以只有本来就已经触底才可能成立 */
  if (game.getStaminaMax() <= STAMINA_MIN) {
    game.setGameOver(true);
    terminal.log(UI.gameOverStamina);
    time.stopClock();
    terminal.setLocked(true);
    redrawShelterQuietly();                          /* 人已经在家里，静默重绘（同体力强制回家那一支） */
    batteryCollapsed = true;
    return true;
  }

  /* 4 正常情况与体力强制回家保持一致：照常走一次到达流程，让玩家在终端里看到自己回到了家。
       这里刻意不 await —— 本函数是从定时器回调或 travelTo 里【同步】调用的，
       到达流程的后续重绘彼此独立（与 debugContext.goto 的用法相同）。 */
  arriveAt(getNode(HOME_ID));
  batteryCollapsed = true;
  return true;
}

/**
 * 结算流程：主动回家与强制回家共用。
 * 这是修改 state.day 的唯一游戏逻辑位置（main.js / settleNight）。
 */
function settleNight() {
  game.setDay(game.getDay() + 1);        /* 1 */
  /* 1.5 跨天一次性扣电：必须在「回家回电」之前，
         这样在家过夜（含黑暗断电被送回 home）才是满电开局，在灯塔/南关口过夜才会真扣掉这 5% */
  time.drainBatteryOnDayChange();
  game.setElapsedSeconds(0);             /* 2 */
  game.setStamina(game.getStaminaMax()); /* 3 */
  /* 4 只有【家节点】回电：灯塔 / 北关口 / 南关口这些安全屋过夜不回电。
       按节点判断，所以在 area1 / newarea1 里走到 home 也算在家。 */
  if (game.getCurrentNode() === RECHARGE_NODE) game.setBattery(BATTERY_MAX);
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
    /* v1 / v2 存档结构不兼容，按需求不提供迁移：版本号偏低时给一句更准确的提示 */
    const version = save.peekVersion(text);
    const tooOld = Number.isFinite(version) && version < save.SAVE_VERSION;
    terminal.log(tooOld ? UI.saveTooOld : UI.saveInvalid);
    return;
  }
  if (!window.confirm(UI.saveConfirm)) return;

  time.stopClock();                                   /* 1 停旧定时器 */
  game.replaceFromSnapshot(snapshot);                 /* 2 替换状态 */
  const area = game.getCurrentArea();
  const node = getNode(game.getCurrentNode()) || getNode(HOME_ID);
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
    const node = getNode(nodeId);
    if (!node) return false;
    /* 指定区域时要求该节点确实属于那个区域；没指定就落在第一个含它的区域 */
    const area = areaId || areasOfNode(nodeId)[0] || game.getCurrentArea();
    if (!getNodeIds(area).includes(nodeId)) return false;
    visitNode(area, nodeId);
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
    /* 优先用两个区域的共享节点切过去（玩家本来就站在那）；没有就落到该区域第一个节点 */
    const shared = sharedNodes(game.getCurrentArea(), areaId);
    const targetId = shared[0] || region.nodes[0];
    const node = targetId ? getNode(targetId) : null;
    if (!node) return false;
    visitNode(areaId, targetId);
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

  /* 注入两个只有 main 才知道的判定：timeSystem 不认识地图，也不该认识游戏规则 */
  time.setDarkNodeResolver(isDarkNode);   /* 「这个节点是黑暗地点吗」→ 决定电量流逝速率 */
  time.setOnBatteryEmpty(onBatteryCollapse); /* 「流逝中电量掉到 0 了」→ 黑暗地点走断电回家 */

  const worldButton = document.getElementById('back-to-world');
  if (worldButton) worldButton.addEventListener('click', onBackButtonClick);

  game.initState(HOME_ID);
  switchMapView(game.getMapView());   /* 新开局按 state 的默认值显示大地图 */
  renderStatusBar();
  renderInventory();

  time.startClock(onNightEnd);
  window.setInterval(renderStatusBar, TICK_INTERVAL_MS);

  arriveAt(getNode(HOME_ID));
}

boot();



