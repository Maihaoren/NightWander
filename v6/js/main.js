/**
 * main.js —— 入口与唯一协调者
 * 初始化与接线、深色模式、状态栏与物品栏渲染，并编排：移动/到达/选项/
 * 野外捡物/强制回家/夜晚结算/存档/debug 指令。
 */

import {
  STAMINA_MIN, BATTERY_MAX, FORCE_HOME_PENALTY, MOVE_STAMINA_COST, TICK_INTERVAL_MS, DEBUG_CONSOLE,
  SHELTER_OVERNIGHT_COST_SEC, EVENTS_DEFAULT, EVENT_HOVER_SHOW_EFFECT,
} from './config.js';
import { UI, SCENES, ITEMS } from './texts.js';
import {
  initMap, refreshMap, setMapView, getNode, getNodes, getRegion, getNodeIds,
  isShelter, isAreaUnlocked, areasOfNode, sharedNodes, isAreaNeighbor,
  isSharedNode, primaryShelterOf, getVisitedIn,
  reachableVisited, hasDirectEdge, calcMoveDuration, clearMoveDurationCache, REGIONS, HOME_ID,
  isDarkNode, isNodeBlockedByDarkness, findNearestReachableShelter,
} from './map.js';
import * as terminal from './terminal.js';
import * as modal from './modal.js';
import * as game from './state.js';
import * as time from './timeSystem.js';
import * as inventory from './inventory.js';
import * as save from './saveSystem.js';
import * as debug from './debug.js';
import * as events from './events.js';

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

/**
 * 物品栏的一行：物品按钮（占满一行）+ 右侧可选的「丢弃」按钮。
 *
 * HTML 结构（onDrop 为空时只返回那一个按钮，与改动前完全一致）：
 *   <div class="inv-item">
 *     <button class="term-button item-button inv-item__main">物品名</button>
 *     <button class="term-button inv-item__drop">丢弃</button>
 *   </div>
 *
 * 「丢弃」入口只在野外出现（没有安全屋 = 没有储物箱可以放东西）；
 * 安全屋里走原来的整理模式，物品按钮点击就是放回储物箱。
 */
function carriedItemRow(label, { onClick, disabled, hint, onDrop, dropHint } = {}) {
  const main = itemButton(label, { onClick, disabled, hint });
  if (typeof onDrop !== 'function') return main;

  main.classList.add('inv-item__main');

  const drop = document.createElement('button');
  drop.type = 'button';
  drop.className = 'term-button inv-item__drop';
  drop.textContent = UI.dropItem;
  if (dropHint) drop.title = dropHint;
  drop.addEventListener('click', onDrop);

  const row = document.createElement('div');
  row.className = 'inv-item';
  row.append(main, drop);
  return row;
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
      return carriedItemRow(label, {
        onClick: () => handToPocket(),
        disabled: !item,
        hint: item
          ? (atHome ? '点击收回口袋（口袋满则放回储物箱）' : '点击收回口袋')
          : '保底物品栏：固定 1 格，任何物品都能放',
        /* 手持槽里的东西也是随身物品，野外同样能丢（丢完这一格就空出来了） */
        onDrop: (atHome && item) ? null : (item ? () => dropItemToNode(item) : null),
        dropHint: item ? UI.dropHint(item.name) : '',
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

  /* 口袋：每件 —— 安全屋点一下放回储物箱（整理模式，行为不变）；
     野外点一下是收进手持槽（原行为），右侧额外给一个「丢弃」入口 */
  el.appendChild(section(UI.inventory.pocket, pocket.map((item) => carriedItemRow(item.name, {
    onClick: atHome ? () => pocketToStorage(item) : () => onPocketClickAway(item),
    hint: item.slot ? `${UI.slotName[item.slot]}槽物品` : '',
    onDrop: atHome ? null : () => dropItemToNode(item),
    dropHint: UI.dropHint(item.name),
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
  beginAction();                                     /* 这一次移动最多出一个事件 */
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

  /* 5.5 【事件触发点一】移动到达节点时掷一次。
        放在到达流程之后、体力负值判断之前：
        这样「脚下一滑 -1 体力」正好能参与下面那条负值强制回家判断。
        事件是弹窗式的，所以这里要 await —— 玩家选完才会继续往下走。 */
  await rollRandomEvent(id);

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

  const result = await withTimePaused(() => modal.showModal({
    title: node.name,
    desc: node.mustResolveDesc,
    items: choices.map((b) => ({ id: b.index, text: `[${b.index}] ${b.option.text}` })),
    actions: [],                                    /* 没有底部按钮：必须从 items 里选一个 */
  }));

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

    const result = await withTimePaused(() => modal.showModal({
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
    }));

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
  const result = await withTimePaused(() => modal.showModal({
    title: UI.discardTitle,
    desc: `捡到：${item.name}（${item.desc}）`,
    items: game.getPocket().map((held, index) => ({
      id: index, text: `丢掉 ${held.name}`, hint: held.desc || '',
    })),
    actions: [{ text: UI.discardCancel, value: 'cancel' }],
  }));

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

/** 把一件东西放回节点物品池（野外丢弃用）；已经在列表里就不重复加 */
function addToNode(node, itemId) {
  if (!node.items.includes(itemId)) node.items.push(itemId);
}

/**
 * 野外丢弃一件随身物品：从玩家身上摘下来，放回【当前节点】的「当地物品」区。
 *   - 不消耗时间、不消耗体力
 *   - 解除 collectedItems 里的「已拾取」标记，否则它躺在节点上也看不见、捡不回来
 *   - 之后可以再捡回来（前提是口袋/手持槽有位置）
 *   - 只在野外有入口；安全屋里物品按钮点击是「放回储物箱」，行为不变
 * 「在哪」的判断在 inventory.planDrop，状态改动在这里调 state.js 完成（与其它整理操作同一套分工）。
 */
function dropItemToNode(item) {
  if (game.isGameOver()) return;

  const node = getNode(game.getCurrentNode());
  if (!node) return;

  const plan = inventory.planDrop(item, game.getEquipped(), game.getPocket());
  if (plan.reason) {
    terminal.log(plan.reason);
    return;
  }

  /* 1 从玩家身上摘下来 */
  if (plan.where === 'hand') game.setEquippedSlot('hand', null);
  else game.removeFromPocket(item);

  /* 2 放回当前节点的物品池，并让它重新变成「当地物品」 */
  addToNode(node, item.id);
  game.unmarkItemCollected(item.id);

  terminal.log(UI.dropped(item.name));
  renderInventory();                                 /* 刷新物品栏 + 当地物品区 */
}

/* ---------------- 弹窗期间暂停时间 + 锁住终端输入 ---------------- */

let modalDepth = 0;        /* 同时开着的弹窗层数（嵌套 / 交叠时用来决定何时解锁） */
let modalSeq = 0;          /* 每次开窗一个唯一 token，避免先关掉的那个把后开的暂停解除 */

/**
 * 弹窗期间：时间暂停 + 终端不接收输入。
 * 所有弹窗都从这里开（模块模态 modal.showModal 与终端模态 terminal.showModal 都包一层），
 * 所以不会漏掉任何一个；用 try/finally 保证无论怎么结束都恢复。
 *
 * 用「层数 + 唯一 token」而不是布尔值：模态之间可能交叠
 *（modal.showModal 打开新的会先把旧的关掉），布尔值会被旧的那个 finally 提前清掉。
 */
async function withTimePaused(run) {
  const token = `modal:${++modalSeq}`;
  modalDepth += 1;
  time.addPauseReason(token);
  if (modalDepth === 1) terminal.setLocked(true);          /* 弹窗期间终端不接收输入 */

  try {
    return await run();
  } finally {
    time.removePauseReason(token);
    modalDepth -= 1;
    /* 游戏结束时终端要保持锁定，别在这里解锁 */
    if (modalDepth === 0 && !game.isGameOver()) terminal.setLocked(false);
  }
}

/* ---------------- 随机事件（触发点在 main，池与效果在 events.js） ---------------- */

let eventFiredThisAction = false;   /* 一次玩家动作（一次移动 / 一次选项）最多出一个事件 */
let suppressNightEnd = false;       /* 事件流程期间：把「跨过 06:00」推迟到流程结束再处理 */

/** 每次玩家动作开始时调用：允许这一次动作再出一个事件 */
function beginAction() {
  eventFiredThisAction = false;
}

/** 当前是否有未处理完的流程（开着的弹窗 / 正在移动）—— /event trigger 用它拒绝触发 */
function isFlowBusy() {
  return modal.isModalOpen() || modalDepth > 0 || pendingMove !== null;
}

/**
 * 在某个触发点掷一次随机事件（自然触发：受 /event 开关与几率控制）。
 * 一次动作里已经出过事件就丢弃，避免「移动到达 + 消耗时间」两个触发源叠弹窗。
 * 系统关着 / 没命中 / 游戏结束都返回 null，什么都不做。
 */
async function rollRandomEvent(nodeId = null) {
  if (eventFiredThisAction) return null;             /* 先命中先算，另一个丢弃 */
  const event = events.rollEvent(nodeId);
  if (!event) return null;
  return runEventFlow(event, nodeId);
}

/**
 * 事件主流程 —— 自然触发与 /event trigger 走的是同一条：
 *
 *   1. 命中 → 先把【描述】打到终端（叙事流），紧接着弹选择窗，选择窗里也显示同一段描述（描述的「双出」）
 *   2. 选一个选项（只有选项按钮、没有底部按钮、点遮罩不关闭 → 必须选）
 *   3. **先执行 effect** → 终端输出该选项的 narrate（描述性叙事）→ 弹【结果窗】显示 effectText（系统信息）
 *   4. 点「继续」→ 关窗；若效果刷出了物品，接着走【原有拾取弹窗】
 *   5. 整段结束：时间恢复、终端解锁；若期间跨过了 06:00，这时才补一次天亮流程
 *
 * 输出分工（v1.8.14）：终端 = 叙事流（desc + narrate，不输出选项名、不输出效果文本）；
 * 结果弹窗 = 系统信息（effectText，无效果时为「无变化」）。
 * 整段共用一个 withTimePaused：从选择窗弹出到结果窗关掉，时间一直暂停、终端一直锁输入。
 *
 * @returns {Promise<{id:string, index:number}|null>}
 */
async function runEventFlow(event, nodeId = null) {
  if (!event) return null;
  eventFiredThisAction = true;
  let chosenIndex = -1;

  terminal.log(event.desc);                          /* 规则 1：描述双出（弹窗之前/同时，不等选完） */

  suppressNightEnd = true;                           /* 改动 3-2：事件期间先不让天亮打断流程 */
  try {
    await withTimePaused(async () => {
      const picked = await modal.showModal({
        title: UI.eventTitle,
        desc: event.desc,
        /* 两个选项做成 items：只有它们能 resolve，所以必须选一个才能继续。
           悬浮提示只在 hover 开关打开时带上（modal 会写成 button.title） */
        items: event.options.map((option, index) => ({
          id: index,
          text: option.label,
          hint: events.isHoverEnabled() ? option.hoverText : '',
        })),
        actions: [],                                 /* 没有底部按钮：不能跳过、不能直接关闭 */
      });

      if (!picked || picked.type !== 'item') return;      /* 理论上不会发生（没有别的关闭途径） */

      const index = Number(picked.id);
      const option = event.options[index];
      if (!option) return;
      chosenIndex = index;

      /* 先执行效果；效果里的时间推进不会触发新事件（掷骰只在两个触发点里做） */
      const outcome = events.runEventOption(event, index, nodeId) || {};

      /* 终端 = 叙事流：只补描述性文本，不输出选项名、也不输出效果文本 */
      if (outcome.narrate) terminal.log(outcome.narrate);

      /* 效果可能改了体力 / 电量 / 时间 / 节点物品池，先重绘一次再弹结果窗 */
      onBatteryCollapse();                           /* 电量被用干、人又在黑暗地点 → 走断电回家 */
      renderStatusBar();
      renderInventory();
      refreshMap({ current: game.getCurrentNode() });

      /* 结果窗 = 系统信息：只有 effectText + 一个「继续」按钮 */
      await modal.showModal({
        title: UI.eventResultTitle,
        desc: outcome.effectText,
        items: [],
        actions: [{ text: UI.eventContinue, value: 'continue' }],
      });

      /* 刷出物品时走 v1.8.3 原有的拾取弹窗（[带走拿得下的] [全部放弃] [稍后处理]），不新造流程 */
      if (outcome.spawned) {
        const node = getNode(game.getCurrentNode());
        if (node) await pickUpItems(node);
      }
    });
  } finally {
    suppressNightEnd = false;
  }

  /* 改动 3-2：事件结算完后检查一次时间；效果把时间推过了 06:00 就在这里补一次天亮流程。
     顺序上晚于两个弹窗，所以不会在弹窗中间插入传送/结算。 */
  if (nightEnded) {
    nightEnded = false;
    onNightEnd();
  }
  return { id: event.id, index: chosenIndex };
}

/* ---------------- 选项执行 ---------------- */

async function onOptionClick(index) {
  if (game.isGameOver()) return;                     /* 0 */
  beginAction();                                     /* 这一次选项最多出一个事件 */

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

  /* 6 【事件触发点二】「每次消耗时间后掷一次」：
        只在这个选项真的消耗了游戏内时间、且没被天亮/断电打断时掷。
        移动本身不在这里掷 —— 移动的事件由 travelTo 的「到达」那一掷负责，避免一个动作掷两次。 */
  if (!nightEnded && !batteryCollapsed && (option.timeCost || 0) > 0) {
    await rollRandomEvent(node.id);
  }
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

  /* 事件流程期间先不处理：事件效果的「时间 +N」可能正好跨过 06:00，
     这时候弹窗还没关，直接传送/结算会插进事件流程中间。
     suppressNightEnd 只把这一段推迟，nightEnded 已经置上；
     事件结算完由 runEventFlow 收尾时再调一次本函数（改动 3-2）。 */
  if (suppressNightEnd) return;

  /* 天亮：不在安全屋就先按区域送回去（onForceHome('night') 内部同样是「先传送再结算」）；
     已经在安全屋就原地不动。两条分支都收在 settleNight() 上 —— 与「主动过夜」是同一套结算，
     不再有「只加天数、不回电不回体力」的半套代码。 */
  if (!isShelter(game.getCurrentNode())) {
    onForceHome('night');
    return;
  }
  settleNight();
}

/**
 * 强制回家的落点：当前节点在【已探明图】上可达的最近门户（安全屋）。
 * 门户 = 共享节点（出现在 ≥2 个区域的 nodes 列表里），由 map.isPortalNode 自动识别，
 * 不手写名单。这样送到的落点一定沿已探明路径走得回去，不会把人扔到走不到的地方。
 *
 * 兜底：理论上不会找不到（玩家总是从某个门户进来的，那个门户必然可达）；
 * 真找不到就退回本区域 primaryShelter，并打一条 debug 日志。
 */
function forceHomeTarget() {
  const area = game.getCurrentArea();
  const found = findNearestReachableShelter(game.getCurrentNode(), area);
  if (found) return found;

  console.warn('[NightWander] 找不到可达门户，退回 primaryShelter：',
    { area, node: game.getCurrentNode(), shelter: primaryShelterOf(area) });
  return primaryShelterOf(area);
}

async function onForceHome(reason) {
  if (game.isGameOver()) return;                     /* 1 */

  terminal.clearQueue();                             /* 2 */
  terminal.log(reason === 'night' ? UI.nightHome : UI.collapse);   /* 3 */

  /* 4 先挑落点：可达的最近门户（不再是「本区域 primaryShelter 写死」）。
       顺序很重要：先 visitNode，后面的结算读到的才是【传送后的节点】 */
  const area = game.getCurrentArea();
  const shelterId = forceHomeTarget();
  visitNode(area, shelterId);

  /* 5 体力上限惩罚：只有【体力归零】这条扣；06:00 天亮是自然现象，不扣 */
  if (reason !== 'night') game.setStaminaMax(game.getStaminaMax() - FORCE_HOME_PENALTY);

  if (game.getStaminaMax() <= STAMINA_MIN) {         /* 6 走不动了：先结算，再 gameOver */
    settleNight();                                   /* a) 天数 +1、时间归零、体力回满（回电看落点是不是 home） */
    game.setGameOver(true);                          /* b) */
    terminal.log(UI.gameOverStamina);                /* c) "你已经精疲力尽，再也走不动了。游戏结束。" */
    time.stopClock();                                /* d) 停止时钟 */
    terminal.setLocked(true);
    redrawShelterQuietly();                          /* e) 重绘所有 UI（人已经在安全屋） */
    return;                                          /* f) */
  }

  /* 7 两条路径都走「主动过夜」同一套结算（settleNight），差别只在上面那步是否扣上限。
        结算安排在 visitNode 之后，所以落点是 home 时电量会回满。 */
  settleNight();
  await arriveAt(getNode(game.getCurrentNode()));
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
 *   送回【当前节点可达的最近门户（安全屋）】（darkarea 里就是 southpass）+ 天数 +1 + 时间归零 + 体力回满，
 *   电量是否回满取决于落点：落点是 home 节点才回满（全局规则，落点是别的门户则保持 0），
 *   且**不扣体力上限**（这是与体力归零强制回家的唯一区别），所以不会因此 gameOver。
 *
 * 【与体力归零是两条独立路径】：
 *   体力：travelTo 里走完到达流程后判断 `getStamina() < 0` → 安全屋就地结算 / onForceHome('stamina')（扣上限）
 *   电量：本函数，判断 `getBattery() === 0 && 当前节点 isDark` → 传送 + 结算（不扣上限、不回电）
 *   两者判断的量、位置、后果都不同；本函数先跑，它一旦执行就把体力回满，
 *   所以同一时刻两者都成立时也不会互相拦截（电量断电先处理，之后体力一定是满的）。
 *   06:00 天亮那条也同样不会抢先：tick / advanceTime 里扣电通知都排在夜晚结束判断之前。
 *
 * 【顺序：先传送 → 后结算】不只是观感问题，也是必需的：
 *   settleNight() 里会调 time.drainBatteryOnDayChange()，而它会再通知一次本函数（电量仍是 0）。
 *   正因为已经把当前节点换成了非黑暗的安全屋，那次重入会立刻在 isDark 判断处返回 false，
 *   否则就会递归下去。改这一段时必须保持「先 visitNode、后 settleNight」。
 *
 * 全程同步：tick 里的电量流逝是定时器回调，等不了 await；而用到的
 * visitNode / settleNight / redrawShelterQuietly 本来就都是同步的。
 *
 * 触发点（都是「电量已经为 0」这一件事的不同来源）：
 *   1) timeSystem 的流逝扣电（tick 连续积分 / advanceTime 离散）→ 通过 setOnBatteryEmpty 回调。
 *      注意 timeSystem 是「只要电量是 0 就每次都通知」，所以「本来就是 0」的情形
 *      （调试指令设 0、导入电量 0 的存档）也会在下一个 tick 被发现 —— v1.8.8 曾漏掉这一类。
 *   2) 选项自带的 batteryCost 直接扣到 0
 *   3) 走进黑暗地点那一刻（路上扣到 0，落点就是黑暗地点）
 *
 * @returns {boolean} 是否真的执行了断电回家（没电但不在黑暗地点 = false，只走视野收缩）
 */
function onBatteryCollapse() {
  if (game.isGameOver()) return false;
  if (game.getBattery() > 0) return false;

  /* 分支：当前节点是黑暗地点 → 走黑暗归零流程；不是 → 直接 return，交给原来的逻辑
     （没电在别处只意味着视野收缩 + 悬浮提示「没电了」，不会有任何传送） */
  const node = getNode(game.getCurrentNode());
  if (!node || !isDarkNode(node.id)) return false;

  terminal.clearQueue();
  terminal.log(UI.darkCollapse);

  /* 1 传送回【当前节点可达的最近门户（安全屋）】：与体力归零 / 天亮强制回家同一条规则。
       黑暗地点只在 darkarea 里，探明图上离它最近的门户就是 southpass。 */
  const area = game.getCurrentArea();
  const shelterId = forceHomeTarget();
  visitNode(area, shelterId);

  /* 2 结算：天数 +1、时间归零、体力回满。
       电量回满与否交给 settleNight 的全局规则（落点 === home 才回电）；
       darkarea 里最近的门户是 southpass，所以正常情况电量保持 0。
       注意这里【没有】setStaminaMax(...)，体力上限一分不扣。
       结算读的就是上面 visitNode 换过之后的当前节点。 */
  settleNight();

  /* 3 再判断 gameOver（沿用原顺序）。体力上限没被扣，所以只有本来就已经触底才可能成立 */
  if (game.getStaminaMax() <= STAMINA_MIN) {
    game.setGameOver(true);
    terminal.log(UI.gameOverStamina);
    time.stopClock();
    terminal.setLocked(true);
    redrawShelterQuietly();                          /* 人已经在安全屋，静默重绘（同体力强制回家那一支） */
    batteryCollapsed = true;
    return true;
  }

  /* 4 正常情况与体力强制回家保持一致：照常走一次到达流程，让玩家在终端里看到自己到了安全屋。
       这里刻意不 await —— 本函数是从定时器回调或 travelTo 里【同步】调用的，
       到达流程的后续重绘彼此独立（与 debugContext.goto 的用法相同）。 */
  arriveAt(getNode(game.getCurrentNode()));
  batteryCollapsed = true;
  return true;
}

/**
 * 结算流程：主动过夜 / 06:00 天亮 / 黑暗断电 / 体力归零 共用。
 * 这是修改 state.day 的唯一游戏逻辑位置（main.js / settleNight）。
 * 不论从哪条路径进来，回电条件都只看【结算时的当前节点是不是 home】，
 * 所以「先传送 → 后结算」定下来之后，各条路径的回电行为自然一致。
 */
function settleNight() {
  game.setDay(game.getDay() + 1);        /* 1 */
  /* 1.5 跨天一次性扣电：必须在「回家回电」之前，
         这样在家过夜才是满电开局，在灯塔 / 北关口 / 南关口过夜才会真扣掉这 5% */
  time.drainBatteryOnDayChange();
  game.setElapsedSeconds(0);             /* 2 */
  game.setStamina(game.getStaminaMax()); /* 3 */
  /* 4 只有【家节点】回电：灯塔 / 北关口 / 南关口这些安全屋过夜不回电。
       按节点判断，所以在 area1 / newarea1 里走到 home 也算在家。
       黑暗断电送回的是 darkarea 的 southpass，所以那条路径不回电。 */
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

  const picked = await withTimePaused(() => terminal.showModal({
    title: UI.saveTitle,
    input: { value: text, readOnly: true },
    actions: [{ label: UI.copy, value: 'copy' }, { label: UI.close, value: null }],
  }));

  if (picked === 'copy') {
    const ok = await terminal.copyText(text);
    terminal.log(ok ? UI.copied : UI.copyFailed);
  }
}

async function importSave() {
  const text = await withTimePaused(() => terminal.showModal({
    title: UI.importSave,
    input: { placeholder: '把存档字符串粘贴到这里' },
    actions: [{ label: UI.ok }, { label: UI.cancel, value: null }],
  }));
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
  time.startClock(onNightEnd);                        /* 4 重启定时器（startClock 里会重建时间基准） */
  /* 4.5 页面可见时再显式重建一次基准，别把导入前的真实时间算进去。
         若导入时页面是隐藏的，tick 本来就被暂停条件挡着，等恢复可见时
         visibilitychange 会再重建一次基准（见 timeSystem.watchVisibility）。 */
  if (!document.hidden) time.resetClock();

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
  /* /event 走真正的开关接口（state.setEventsEnabled 会一并写 localStorage），
     并把事件池 id 列表回给 debug.js 显示，便于确认事件系统已生效 */
  setEventsEnabled: (value) => game.setEventsEnabled(value),
  eventIds: () => events.listEventIds(),
  /* /event help / trigger 用：事件清单（id + 描述 + 选项）、悬浮开关、强制触发入口 */
  eventCatalog: () => events.listEvents(),
  isHoverEnabled: () => events.isHoverEnabled(),
  setHoverEnabled: (value) => events.setHoverEnabled(value),
  resetHoverEnabled: () => events.resetHoverEnabled(),
  hoverDefault: () => EVENT_HOVER_SHOW_EFFECT,
  eventSwitchDefault: () => EVENTS_DEFAULT,
  /** /event trigger 前的准入检查：游戏结束 / 有弹窗没处理 / 正在移动 都拒绝 */
  canTriggerEvent: () => !game.isGameOver() && !isFlowBusy(),
  /** 强制触发（无视开关与几率，DEBUG_CONSOLE 下才有入口）；走与自然触发完全一致的事件流程 */
  triggerEvent: (id) => {
    const event = events.getEvent(id);
    if (!event) return false;
    runEventFlow(event);                      /* 不 await：debug 指令是同步返回字符串的 */
    return true;
  },
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

  /* v1.8.13：不再往终端输出「时间已暂停 / 时间已恢复」。
     timeSystem 的暂停/恢复逻辑与 setOnPauseChange() 钩子都保持原样，只是这里不注册了 */
  /* 窗口隐藏 → 暂停（隐藏期间的时间不补足）；显示 → 重建基准并恢复 */
  time.watchVisibility();

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



