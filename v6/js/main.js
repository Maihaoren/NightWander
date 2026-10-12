/**
 * main.js —— 入口与唯一协调者
 * 初始化与接线、深色模式、状态栏与物品栏渲染，并编排：移动/到达/选项/
 * 野外捡物/强制回家/夜晚结算/存档/debug 指令。
 */

import {
  STAMINA_MIN, BATTERY_MAX, FORCE_HOME_PENALTY, MOVE_STAMINA_COST, TICK_INTERVAL_MS, DEBUG_CONSOLE,
  SHELTER_OVERNIGHT_COST_SEC, EVENTS_DEFAULT, EVENT_HOVER_SHOW_EFFECT,
  CHARGER_BATTERY_GAIN, CANNEDFOOD_STAMINA_GAIN,
} from './config.js';
import { UI, ITEMS, DOCUMENTS, EXCHANGES, NEGATIVE_EVENTS, LIGHTHOUSE_WIN_ASCII } from './texts.js';
import {
  initMap, refreshMap, setMapView, getNode, getNodes, getRegion, getNodeIds,
  isShelter, isAreaUnlocked, areasOfNode, sharedNodes, isAreaNeighbor,
  isSharedNode, primaryShelterOf, getVisitedIn, isAreaImplemented,
  reachableVisited, hasDirectEdge, calcMoveDuration, clearMoveDurationCache, REGIONS, HOME_ID,
  isDarkNode, isNodeBlockedByDarkness, findNearestReachableShelter,
  lockedNodeIds,
  missingKeyFor, keyGateOf, keyGateNodeIds, carriesKey, isMoveGate,
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

/**
 * 回电地点：只有【家节点】。
 * 节点 id 全局唯一，所以按节点判断而不按区域判断：走到哪个区域的 home 都在自己家里。
 * v1.9.0b1：家不再是独立区域，而是「废城」里的一个节点，本常量与取值都不用改。
 * 其余安全屋（墙门 / 北关 / 东关 / 南关这些接口）过夜不回电。
 *
 * 【注意】v1.9.0b1 起终点节点（旧的 goal2）随旧地图一起删掉了，
 * 这里不再有 GOAL2_ID —— 终局（灯塔）等 b4 把码头落地后再接上。
 */
const RECHARGE_NODE = HOME_ID;
/* v1.9.0b4 改动 7：灯塔 = 游戏终点。到达它就 gameOver 并锁死一切操作。 */
const LIGHTHOUSE_ID = 'lighthouse';
const DOCKGATE_ID = 'dockgate';   /* v1.9.0b4 改动 3：到达这里时提示三把锁 */
/* v1.9.0b2.2 改动 5：发电厂过夜充电（b2 有 → b2.1 误删 → b2.2 改回来）。
   数值规则在 settleNight：电量 += 上限 × 30%，加完由 setBattery 夹到上限；
   氛围文案是 UI.powerplantOvernight，由 logOvernightFlavor() 输出。 */
const POWERPLANT_ID = 'powerplant';
const POWERPLANT_RECHARGE_RATIO = 0.30;

/**
 * v1.9.0b2.1 改动 5：发电厂过夜**不再回电**（b2 曾定为「+= 上限 × 30%」，现取消）。
 * 所以这里不再有 POWERPLANT_ID / POWERPLANT_RECHARGE_RATIO ——
 * 结算只看「当前节点是不是家」，其余安全屋（含发电厂）一律不回电。
 * 相关的「在这儿充上电了」文本也一并删掉了。
 */

let nightEnded = false;      /* 本轮移动/选项期间是否刚好天亮了 */
let batteryCollapsed = false;/* 本轮移动/选项期间是否触发了「黑暗地点断电回家」 */
let sceneEl = null;
let pendingMove = null;      /* 本次移动的 { fromId, toId, cost }，供 arriveAt 打印移动横幅 */
let gateNoticePending = false;  /* v1.9.0b3：这一次到访刚把某个「解锁门槛」打开了 → 到达时补一句话 */

/** 当前所在安全屋的储物键（节点 id 全局唯一，直接用 id）；不在安全屋时返回 null */
function currentShelterKey() {
  const node = game.getCurrentNode();
  return isShelter(node) ? node : null;
}

/**
 * 到达某节点：切换区域与节点，并把【共享节点】在每个所属区域里都标记为已访问。
 * 「哪些区域含这个节点」是 map.js 的知识，所以这条规则放在 main.js（唯一协调者）里。
 *
 * v1.9.0b3 改动 3：顺便比较「标记前后还有哪些节点没解锁」——
 * 解锁条件完全由 visited 推导（map.js 的 LOCKED_NODES / isNodeUnlocked），
 * 所以只要这一趟把门槛满足了（森林深处 + 沼泽深处都到过），这里就能发现。
 * 提示语不能直接在这里打：arriveAt 开头的 terminal.clearQueue() 会把排队的日志一起清掉，
 * 所以只置一个标记，由 arriveAt 在到达文案之后输出。
 */
function visitNode(areaId, nodeId) {
  const lockedBefore = new Set(lockedNodeIds());

  game.setCurrentArea(areaId);
  game.setCurrentNode(nodeId);
  for (const area of areasOfNode(nodeId)) game.markVisited(area, nodeId);

  /* 有节点从「未解锁」变成「已解锁」= 这一趟刚好满足了门槛。
     比较的是「标记前锁着的 - 标记后还锁着的」，不能反过来拿标记后的列表去 some()。 */
  if (lockedBefore.size > 0) {
    const lockedAfter = new Set(lockedNodeIds());
    if ([...lockedBefore].some((id) => !lockedAfter.has(id))) gateNoticePending = true;
  }

  /* v1.9.0b2.2：资源交换改回「点选项 → 弹窗」，所以「本次停留已弹过」的守卫只剩安全屋在用。 */
  promptedShelter.clear();
}

/** 视图切换：同时改 state（进存档）与 map（真正重绘），两者不允许各走各的 */
function switchMapView(view) {
  game.setMapView(view);
  setMapView(view);
  updateBackButton(view);
}

/**
 * 「返回」按钮的点击目标跟着上下文走（上一条补丁只改了文案、没改 target，是 bug）：
 *   在大地图上   → 回到【玩家当前所在区域】的区域地图（不是固定的某个区域）
 *   在区域地图上 → 回到大地图
 * 文案同步：大地图上显示「返回区域地图」，区域地图上显示「返回大地图」。
 */
function onBackButtonClick() {
  if (game.isGameOver()) return;                     /* v1.9.0b4：地图点击全部禁用 */
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
  battery.textContent = UI.status.battery(game.getBattery(), game.getBatteryMax());
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
 * 物品栏的一行：物品按钮（占满一行）+ 右侧可选的若干个小按钮。
 *
 * HTML 结构（没有任何小按钮时只返回那一个物品按钮，与改动前完全一致）：
 *   <div class="inv-item">
 *     <button class="term-button item-button inv-item__main">物品名</button>
 *     <button class="term-button inv-item__drop">丢弃</button>
 *   </div>
 *
 * 「丢弃」入口只在野外出现（没有安全屋 = 没有储物箱可以放东西）；
 * 安全屋里走原来的整理模式，物品按钮点击就是放回储物箱。
 *
 * v1.9.0b2.1 改动 4：为了让「点怀表看时间」不挤掉它原本的整理动作，
 * 这里扩成可以挂【多个】小按钮（`extras`）。其它物品仍然只用 onDrop 那一个，
 * 渲染结果与改动前逐字节一致。
 *   extras: [{ text, hint, onClick }]
 */
function carriedItemRow(label, { onClick, disabled, hint, onDrop, dropHint, extras } = {}) {
  const main = itemButton(label, { onClick, disabled, hint });

  const sides = [];
  if (typeof onDrop === 'function') {
    sides.push({ text: UI.dropItem, hint: dropHint, onClick: onDrop });
  }
  for (const ex of (extras || [])) {
    if (ex && typeof ex.onClick === 'function') sides.push(ex);
  }
  if (sides.length === 0) return main;

  main.classList.add('inv-item__main');

  const row = document.createElement('div');
  row.className = 'inv-item';
  row.append(main);
  for (const s of sides) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'term-button inv-item__drop';
    btn.textContent = s.text;
    if (s.hint) btn.title = s.hint;
    btn.addEventListener('click', s.onClick);
    row.append(btn);
  }
  return row;
}

/**
 * 「使用」小按钮（v1.9.0c）：物品栏每一行都挂这一个，形状完全一致。
 * 不可使用的物品照样有这个按钮，点了由 useItem() 回一句「你不知道这个东西在这怎么用。」。
 */
function useExtra(item) {
  return {
    text: UI.useItem,
    hint: UI.useHint(item.name),
    onClick: () => useItem(item),
  };
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

/**
 * 读一份储物箱里的文档（日记 / README）。
 * 沿用物品查看的日志风格：先名称再描述（UI.inspect 一行），再一段一行铺正文。
 * 纯读取：不动 state、不消耗时间、不占容量，所以可以反复点。
 */
function readDocument(doc) {
  if (game.isGameOver()) return;
  terminal.logLines([UI.inspect(doc.name, doc.desc), ...doc.body]);
}

function renderInventory() {
  /* v1.9.0b4.1：随身带着钥匙就把那把钥匙记成「拿到过」（物品栏每次变化都会走到这里） */
  syncKeyLocks();

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
      /* v1.9.0b2.1 改动 4：手持槽里的怀表 —— 点它看时间，右侧给「收回口袋」（野外还有「丢弃」）。
         其它物品行为完全不变。
         v1.9.0c：右侧再补一个「使用」—— 与点怀表本身完全等价（都走 watchTimeAtInventory）。 */
      if (isPocketwatch(item)) {
        return carriedItemRow(label, {
          onClick: () => watchTimeAtInventory(),
          hint: '点击看当前时间；右侧按钮把它收回口袋',
          onDrop: (atHome && item) ? null : (item ? () => dropItemToNode(item) : null),
          dropHint: item ? UI.dropHint(item.name) : '',
          extras: item ? [
            useExtra(item),
            {
              text: '收回口袋',
              hint: `把${item.name}收回口袋`,
              onClick: () => handToPocket(),
            },
          ] : [],
        });
      }
      return carriedItemRow(label, {
        onClick: () => handToPocket(),
        disabled: !item,
        hint: item
          ? (atHome ? '点击收回口袋（口袋满则放回储物箱）' : '点击收回口袋')
          : '保底物品栏：固定 1 格，任何物品都能放',
        /* 手持槽里的东西也是随身物品，野外同样能丢（丢完这一格就空出来了） */
        onDrop: (atHome && item) ? null : (item ? () => dropItemToNode(item) : null),
        dropHint: item ? UI.dropHint(item.name) : '',
        /* v1.9.0b2.2 改动 3：手持槽里拿着装备时也能直接穿上（野外不用回安全屋）。
           v1.9.0c：「使用」排在最前（每件随身物品都有），装备入口跟在后面。 */
        extras: item ? [
          useExtra(item),
          ...(inventory.canEquip(item) ? [{
            text: UI.equipAction,
            hint: UI.equipHint(item.name),
            onClick: () => equipFromCarried(item, 'hand'),
          }] : []),
        ] : [],
      });
    }
    /* v1.9.0c：穿在身上的四件也照样给「使用」按钮（视觉一致；它们都不可使用，
       点了统一回 UI.itemUnknownUse）。空槽位不加 —— 那里没有物品。 */
    if (!atHome) {
      return carriedItemRow(label, {
        onClick: () => inspectItem(item),
        disabled: !item,
        extras: item ? [useExtra(item)] : [],
      });
    }
    return carriedItemRow(label, {
      onClick: () => unequip(slot),
      disabled: !item,
      hint: item && item.pockets ? `提供 ${item.pockets} 个口袋格` : '',
      extras: item ? [useExtra(item)] : [],
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
        /* v1.9.0b2.2 改动 3：装备类物品（有 slot）多给一个「装备」入口 ——
           点它 = 先捡起来再立刻穿上，野外不用回安全屋。没有 slot 的（怀表 / 罐头）保持原样。 */
        return carriedItemRow(`${item ? item.name : itemId}${suffix}`, {
          onClick: () => localPickup(itemId),
          hint: item ? item.desc : '',
          extras: inventory.canEquip(item) ? [{
            text: UI.equipAction,
            hint: UI.equipHint(item.name),
            onClick: () => localEquip(itemId),
          }] : [],
        });
      }),
    ));
  }

  /* 储物箱：只在安全屋可见 */
  if (atHome) {
    const storageRows = storage.map((item) => {
      const plan = inventory.planTakeFromStorage(item, equipped, pocket);
      const suffix = plan.mode === 'equip' ? '（可装备）' : (plan.mode === 'hand' ? '（可拿在手里）' : '');
      /* v1.9.0b2.1 改动 4：储物箱里的怀表 —— 点它看时间，右侧给「取出」。
         取不出来时（口袋满）不再预先置灰，交给 takeFromStorage 自己提示原因。 */
      if (isPocketwatch(item)) {
        return carriedItemRow(`${item.name}${suffix}`, {
          onClick: () => watchTimeAtInventory(),
          hint: '点击看当前时间；右侧按钮把它取出来',
          extras: [{
            text: '取出',
            hint: `把${item.name}从储物箱里拿出来`,
            onClick: () => takeFromStorage(item),
          }],
        });
      }
      return itemButton(`${item.name}${suffix}`, {
        onClick: () => takeFromStorage(item),
        disabled: Boolean(plan.reason),
        hint: item.pockets ? `可提供 ${item.pockets} 个口袋格` : '',
      });
    });

    /* 家特有的两份文档（日记 / README）：跟在真物品后面列在同一个储物箱里。
       它们不是物品 —— 不在 storage 数组里，所以不占容量、计数也不含它们、
       点一下只是读（见 readDocument），既不消耗时间也不会被拿进背包。
       v1.9.0b3 改动 4：文档改成按【归属安全屋】过滤（DOCUMENTS[].shelter）——
       日记 / README 归家，值班日志归荒野驿站，所以驿站也有自己的一份可读文本。 */
    for (const doc of DOCUMENTS) {
      if (doc.shelter && doc.shelter !== shelterKey) continue;
      storageRows.push(itemButton(doc.name, {
        onClick: () => readDocument(doc),
        hint: doc.desc,
      }));
    }

    el.appendChild(section(
      `${UI.inventory.storage} ${storage.length}/${game.getStorageCapacity(shelterKey)}`,
      storageRows,
    ));
  }

  /* 口袋：每件 —— 安全屋点一下放回储物箱（整理模式，行为不变）；
     野外点一下是收进手持槽（原行为），右侧额外给一个「丢弃」入口。
     v1.9.0c：右侧最前面再挂一个「使用」（每件随身物品都有，位置统一）。 */
  el.appendChild(section(UI.inventory.pocket, pocket.map((item) => carriedItemRow(item.name, {
    onClick: isPocketwatch(item)
      ? () => watchTimeAtInventory()
      : (atHome ? () => pocketToStorage(item) : () => onPocketClickAway(item)),
    hint: isPocketwatch(item)
      ? '点击看当前时间'
      : (item.slot ? `${UI.slotName[item.slot]}槽物品` : ''),
    onDrop: atHome ? null : () => dropItemToNode(item),
    dropHint: UI.dropHint(item.name),
    extras: [
      useExtra(item),
      /* v1.9.0b2.2 改动 3：口袋里的装备可以直接穿上（野外与在家都行；脱下仍只在安全屋） */
      ...(inventory.canEquip(item) ? [{
        text: UI.equipAction,
        hint: UI.equipHint(item.name),
        onClick: () => equipFromCarried(item, 'pocket'),
      }] : []),
      ...(isPocketwatch(item)
        ? [atHome
          ? { text: '放回储物箱', hint: `把${item.name}放回储物箱`, onClick: () => pocketToStorage(item) }
          : { text: '拿在手里', hint: `把${item.name}拿到手上`, onClick: () => pocketToHand(item) }]
        : []),
    ],
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

/* ---------------- 穿上装备（v1.9.0b2.2 改动 3；v1.9.0b2.3 改动 3 补拾取弹窗入口） ----------------
   b2.1 的规则是「野外只能捡、不能装备」；b2.2 改成**所有捡到的装备都能立刻穿上**。
   v1.9.0b2.3：把「能不能穿」统一交给 inventory.canEquip(item)（唯一判据 = 物品自带 slot），
   并在**到达时的拾取弹窗**里也给出「装备 X」——那是野外拿东西的第一入口，
   以前只能先把东西收进口袋、再去点物品栏那个窄按钮，back 槽的第一件装备（电容器）就是这么被漏掉的。
   入口一共四处：拾取弹窗 / 当地物品行 / 口袋行 / 手持槽行。
   判定在 inventory.planEquipFromCarried（纯函数），状态改动在这里调 state.js
   —— 与口袋 ↔ 手持、丢弃、储物箱那些整理操作同一套分工。
   **脱下仍然只在安全屋**：unequip() 开头那句 currentShelterKey() 判断一行没动。 */

/**
 * 把身上的一件装备穿上。from 是它现在在哪儿：'pocket' | 'hand'。
 * 目标槽已经有装备时先弹一个「换不换」的二选一确认（弹窗式替换流程，无关闭按钮）；
 * 换下来那件不会被丢掉 —— 按 plan.carry 回到口袋或手持槽（plan 里已经算过容量）。
 * @returns {Promise<boolean>} 是否真的换上了
 */
async function equipFromCarried(item, from) {
  if (game.isGameOver() || !item) return false;

  const plan = inventory.planEquipFromCarried(item, game.getEquipped(), game.getPocket(), from);
  if (plan.reason) {
    terminal.log(plan.reason);
    return false;
  }

  if (plan.mode === 'replace') {
    const picked = await withTimePaused(() => modal.showModal({
      title: UI.equipReplaceTitle,
      desc: UI.equipReplaceDesc(item.name, plan.current.name),
      items: [
        { id: 'swap', text: UI.equipReplaceConfirm },
        { id: 'cancel', text: UI.equipReplaceCancel },
      ],
      actions: [],                                  /* 没有底部按钮：必须从两项里选一个 */
    }));
    if (!picked || picked.type !== 'item' || picked.id !== 'swap') return false;
  }

  /* 1 先从原处拿下来 */
  if (from === 'hand') game.setEquippedSlot('hand', null);
  else game.removeFromPocket(item);

  /* 2 穿上 */
  game.setEquippedSlot(plan.slot, item);

  /* 3 换下来的旧装备放回去：手持槽恒为 1 格，放口袋则按换好之后的容量算（plan 已经判过） */
  const old = plan.mode === 'replace' ? plan.current : null;
  if (old) {
    if (plan.carry === 'hand') game.setEquippedSlot('hand', old);
    else game.addToPocket(old);
  }

  terminal.log(UI.takeEquip(item.name));
  renderInventory();
  return true;
}

/**
 * 找出「这件物品现在在身上的哪一份实例」——拾取时会存 { ...item } 副本，
 * 所以不能把 ITEMS 表里那个对象直接传给 state（removeFromPocket 按实例找）。
 * 顺序与拾取一致：先口袋，再手持槽。
 * @returns {{ item:object, from:'pocket'|'hand' } | null}
 */
function carriedInstanceOf(itemId) {
  const inPocket = game.getPocket().find((it) => it.id === itemId);
  if (inPocket) return { item: inPocket, from: 'pocket' };
  const inHand = game.getEquipped().hand;
  if (inHand && inHand.id === itemId) return { item: inHand, from: 'hand' };
  return null;
}

/**
 * 【改动 3】拿起一件东西并立刻穿上 —— 野外的「装备」入口共用这一条（v1.9.0b2.3）。
 *   拾取阶段：按原有规则放（口袋 → 手持槽 → 空间不够就弹替换窗），不消耗时间；
 *   装备阶段：走 equipFromCarried（槽位已有装备时会弹「换上 / 先不换」）。
 * 调用方：拾取弹窗里的「装备 X」条目、物品栏「当地物品」行的「装备」按钮。
 * @returns {Promise<boolean>} 是否真的穿上了
 */
async function takeAndEquip(node, itemId, item) {
  if (game.isGameOver() || !node || !item) return false;
  if (!inventory.canEquip(item)) { terminal.log('这东西穿不上。'); return false; }
  if (game.state.collectedItems.has(itemId)) return false;   /* 已经被拿走了（弹窗列表可能已经过期） */

  const taken = await tryTakeItem(node, itemId, item);
  if (!taken) return false;                                  /* 玩家在替换窗里放弃了 */

  const carried = carriedInstanceOf(itemId);
  if (!carried) return false;
  return equipFromCarried(carried.item, carried.from);
}

/**
 * 点「当地物品」区里那件装备右侧的「装备」按钮：拿起 + 立刻穿上。
 * 具体逻辑在 takeAndEquip（与拾取弹窗里的「装备 X」是同一条）。
 */
async function localEquip(itemId) {
  if (game.isGameOver()) return;
  const node = getNode(game.getCurrentNode());
  const item = ITEMS[itemId];
  if (!node || !item) return;
  await takeAndEquip(node, itemId, item);
  renderInventory();
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

/** 是否持有某件物品（口袋或任一装备槽） */
function hasItem(id) {
  if (game.getPocket().some((item) => item.id === id)) return true;
  return Object.values(game.getEquipped()).some((item) => item && item.id === id);
}

/**
 * 按地点/物品决定是否追加一个“看时间”类选项；不追加时返回 null。
 *
 * systemOption 标记：这是**系统附加入口**，不是玩家在当前地点要做的决定。
 * 它照常出现在终端选项行与按钮行里（那才是设计中的合法入口），
 * 但不许进 mustResolve 弹窗 —— 见 resolveMustResolve 里的过滤。
 *
 * v1.9.0b1：旧的「n2 街角老钟」分支随 n2 节点一起删掉了；
 * 终点判定（原 GOAL2_ID）也一并移除，等 b4 用灯塔重做。
 * v1.9.0b2.1 改动 4：**怀表不再是一个选项**（它在任何弹窗 / 选项区里都不再出现），
 *   改用「点物品栏里的怀表看时间」—— 见 watchTimeAtInventory()。所以这里只剩「家里的老钟」。
 */
function ensureTimeOption(node) {
  if (node.id === HOME_ID) return { text: '看一眼墙上的老钟', repeatable: true, timeCost: 0, batteryCost: 0, timeKind: 'home', systemOption: true };
  return null;
}

const TIME_TEXTS = {
  home: (t2) => `家里的老钟显示 ${t2}`,
};

/** 看时间（只剩「家里的老钟」一个来源）：电量归零时统一输出同一句 */
function lookAtTime(kind) {
  if (game.getBattery() <= 0) {
    terminal.log('钟面/表盘一片漆黑，什么也看不清。');
    return;
  }
  terminal.log(TIME_TEXTS[kind || 'home'](time.getTimeString()));
}

/* ---------------- 怀表（v1.9.0b2.1 改动 4） ----------------
   怀表的使用方式从「选项」改成「点物品栏里的那一格」：
     - 不消耗时间 / 体力 / 电量（纯读取）
     - 电量归零时时间本身是 ??:??:??，这时不打时间，改说「看不清了」
   这是「物品使用」的雏形，c 块会把使用逻辑统一整理；本块只做怀表这一件。 */
function isPocketwatch(item) {
  return Boolean(item) && item.id === POCKETWATCH_ID;
}

/** 点物品栏 / 手持槽里的怀表：终端输出当前时间 */
function watchTimeAtInventory() {
  if (game.isGameOver()) return;
  if (game.getBattery() <= 0) {
    terminal.log(UI.watchDark);                       /* 没电：时间显示不出来 */
    return;
  }
  terminal.log(UI.watchTime(time.getTimeString()));
}

/* ===============================================================
   c 块（v1.9.0c）：物品使用入口
   ---------------------------------------------------------------
   物品栏每一行右侧都有「使用」按钮（不可使用的物品也有，保持视觉一致）。
   判定与效果集中在这张表里，出口只有一个 useItem()：
     blocked() —— 现在用不了的原因（返回文案就【不消耗】、不生效）
     run()     —— 生效（只改状态；输出由 run 自己打，比如怀表）
     text()    —— 生效后的输出（与 run 二选一）
     consume   —— 用完是否吃掉这一件（默认 true；怀表是工具，不动它）
   不消耗时间 / 体力 / 电量：使用只动（物品本身 + 它自己的效果）。
   =============================================================== */

/** 口径：只有带效果的物品能用；其余（钥匙 / 装备 / 杂物）走 UI.itemUnknownUse 那一句 */
const POCKETWATCH_ID = 'pocketwatch';

const ITEM_USES = {
  /* 充电器：电量 +4 个百分点，加完由 setBattery 夹到【当前上限】（电容器装上后是 125） */
  charger: {
    blocked: () => (game.getBattery() >= game.getBatteryMax() ? UI.useChargerFull : null),
    run: () => game.setBattery(game.getBattery() + CHARGER_BATTERY_GAIN),
    text: () => UI.useCharger,
  },
  /* 罐头：体力 +1，加完不超过体力上限（setStamina 自带夹取） */
  cannedfood: {
    blocked: () => (game.getStamina() >= game.getStaminaMax() ? UI.useCannedfoodFull : null),
    run: () => game.setStamina(game.getStamina() + CANNEDFOOD_STAMINA_GAIN),
    text: () => UI.useCannedfood,
  },
  /* 怀表：与「点怀表本身」完全同一个出口（都走 watchTimeAtInventory），所以不会出现两句输出；
     它是工具不是消耗品，用完留在原处。 */
  pocketwatch: {
    blocked: () => null,
    run: () => watchTimeAtInventory(),
    consume: false,
  },
};

/** 用掉随身的一件（口袋里的删掉；手持槽里的把那一格清空）—— 判定复用 inventory.planDrop */
function consumeCarried(item) {
  const plan = inventory.planDrop(item, game.getEquipped(), game.getPocket());
  if (plan.where === 'hand') game.setEquippedSlot('hand', null);
  else if (plan.where === 'pocket') game.removeFromPocket(item);
}

/**
 * 使用一件随身物品（物品栏各行的「使用」按钮都走这里）。
 * 顺序：游戏结束 → 没有效果（回「不知道怎么用」）→ 现在用不了（回原因，不消耗）
 *       → 生效 + 消耗 + 输出 → 立刻刷新状态栏与物品栏（状态变化即时可见）。
 */
function useItem(item) {
  if (!item || game.isGameOver()) return;
  const use = ITEM_USES[item.id];
  if (!use) {
    terminal.log(UI.itemUnknownUse);                  /* 钥匙 / 装备 / 其它：不消耗任何东西 */
    return;
  }
  const blocked = use.blocked();
  if (blocked) {
    terminal.log(blocked);                            /* 满电 / 满体力：留着这一件 */
    return;
  }
  if (use.consume !== false) consumeCarried(item);
  use.run();
  if (typeof use.text === 'function') terminal.log(use.text());
  renderStatusBar();
  renderInventory();
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

/**
 * 「按节点 id + 选项序号挂 handler」的旧机制。
 * v1.9.0b1：唯一一条规则挂在 n3（幽暗洞穴）上，该节点随旧地图一起删了，所以本表暂时为空 ——
 * 机制原样保留，buildOptions() 的查表逻辑一行没动，以后挂选项时往这里补即可。
 */
const OPTION_HANDLERS = {};

/* ===============================================================
   地点资源交换（v1.9.0b2 改动 2）
   ---------------------------------------------------------------
   给「没有物品奖励」的地点补的交互。
   v1.9.0b2.1 起改成【到达地点自动弹窗】：不再是一个可点的选项，
   玩家一到达就弹，必须选了才能继续；「执行」才结算并消耗，「算了」保留（离开再回来还会弹）。
     seconds / stamina / battery / spawn 的含义同前。
   =============================================================== */
const EXCHANGE_EFFECTS = {
  /* 时间 ↔ 资源 */
  x_nap: { seconds: 600, stamina: +2 },
  x_rest: { seconds: 300, stamina: +1 },
  x_power: { seconds: 180, battery: +5 },
  x_ration: { seconds: 300, stamina: +1, battery: -3 },
  x_cell: { seconds: 420, battery: +8 },
  x_scav: { seconds: 300, spawn: 'cannedfood' },
  /* 资源 ↔ 资源（不涉及时间） */
  x_e2s: { battery: -5, stamina: +1 },
  x_s2e: { stamina: -1, battery: +8 },
  x_e2i: { battery: -3, spawn: 'cannedfood' },
  x_s2i: { stamina: -1, spawn: 'cannedfood' },
};

/** 把一件东西放进当前节点的物品池，并解除「已拾取」标记（否则躺在脚下也捡不起来） */
function spawnItemOnNode(node, itemId) {
  if (!node || !itemId || !ITEMS[itemId]) return false;
  if (node.items.includes(itemId)) return false;
  node.items.push(itemId);
  game.unmarkItemCollected(itemId);
  return true;
}

/* ===============================================================
   荒野的纯负面遭遇（v1.9.0b3.1 改动 7；v1.9.0b3.2 改动 1 补齐输出分工）
   ---------------------------------------------------------------
   挂在地点上的「到达即弹窗」强制二选一（哪些节点挂见 map.js 的 NEGATIVE_EVENT_BY_NODE）。
   两个选项都不划算：一个失体力（-2）、一个失时间（+600 秒）。

   v1.9.0b3.2：b3 落地时漏接了输出通道（选完什么都不显示），现在按 v1.8.14 定下的分工补齐，
   与 runEventFlow（随机事件）完全一致：
     1. 选完 → 先执行 effect
     2. 终端输出该选项的 narrate（描述性叙事）
     3. 结果弹窗显示该选项的 effectText（系统信息：玩家得失），只有「继续」一个按钮
     4. 选择窗 + 结果窗整段共用一次 withTimePaused：期间时间一直暂停、终端一直不接收输入
   其余不变：标题留空、没有关闭按钮、必须二选一；once 记在 state.triggeredNegativeEvents。
   =============================================================== */
const NEGATIVE_EFFECTS = [
  { stamina: -2 },      /* options[0]：失体力（硬冲 / 硬钻 / 拔腿就跑 …） */
  { seconds: 600 },     /* options[1]：失时间（绕路 / 走远路 …） */
];

/**
 * 到达一个挂了负面遭遇的地点时的强制二选一。由 arriveAt 在资源选项行之后调用。
 * @returns {Promise<boolean>} 是否真的弹了窗（没挂遭遇 / 已经触发过 → false）
 */
async function resolveNegativeEvent(node) {
  if (!node || game.isGameOver()) return false;

  const eventId = node.negativeEvent;
  const ev = eventId ? NEGATIVE_EVENTS[eventId] : null;
  if (!ev) return false;

  /* once：这个地点的遭遇已经出现过（存档里记着）→ 不再弹 */
  if (game.isNegativeEventTriggered(node.id)) return false;

  /* 时间推进（失时间那一支）可能跨过 06:00：先压住天亮流程，
     等两个弹窗都关掉之后再补一次，免得天亮传送/结算插进弹窗中间（同 runEventFlow）。 */
  suppressNightEnd = true;
  try {
    /* 整段（选择窗 → 效果 → 叙事 → 结果窗）共用一个 withTimePaused：
       期间时间一直暂停、终端一直锁输入，直到流程结束才恢复。 */
    await withTimePaused(async () => {
      const picked = await modal.showModal({
        title: '',                                   /* 标题留空（沿用资源交换弹窗的写法） */
        desc: ev.desc,
        items: ev.options.map((option, index) => ({ id: index, text: option.label })),
        actions: [],                                 /* 没有底部按钮：必须从两项里选一个 */
      });

      /* 没有别的关闭途径，理论上一定拿得到选项；拿不到（被外部关掉）就不打标记，下次再弹 */
      if (!picked || picked.type !== 'item') return;

      const index = Number(picked.id);
      const option = ev.options[index];
      const fx = NEGATIVE_EFFECTS[index];
      if (!option || !fx) return;

      game.markNegativeEventTriggered(node.id);      /* once：这一处不再出现 */

      /* 1 先执行效果（数值在 NEGATIVE_EFFECTS，文案在 texts.js） */
      if (fx.stamina) game.spendStamina(-fx.stamina);   /* 取负：正数表示加体力，自带上限夹取 */
      if (fx.seconds) time.advanceTime(fx.seconds);
      if (!batteryCollapsed) onBatteryCollapse();       /* 时间推进可能把电走干（沿用既有检测） */

      /* 2 终端 = 叙事流：只补描述性文本 */
      if (option.narrate) terminal.log(option.narrate);

      /* 效果可能改了体力 / 电量 / 时间，先重绘一次再弹结果窗 */
      renderStatusBar();
      renderInventory();
      refreshButtons();

      /* 3 结果窗 = 系统信息：只有 effectText + 一个「继续」按钮 */
      await modal.showModal({
        title: UI.eventResultTitle,
        desc: option.effectText,
        items: [],
        actions: [{ text: UI.eventContinue, value: 'continue' }],
      });
    });
  } finally {
    suppressNightEnd = false;
  }

  /* 效果把时间推过了 06:00：这时才补一次天亮流程（顺序晚于两个弹窗） */
  if (nightEnded) {
    nightEnded = false;
    onNightEnd();
  }
  return true;
}

/** * 【到达自动弹窗】的「本次停留已弹过」守卫（v1.9.0b2.1 立、v1.9.0b2.2 起只剩安全屋在用）。
 *
 * 记「本次停留里已经弹过安全屋弹窗的节点 id」，清空点是 visitNode()（玩家真的换了节点）：
 *   - 移动 / 强制回家 / debug 传送：都会先 visitNode → 清空 → 到达时重新弹 ✓
 *   - 就地过夜（overnightAtShelter 不经过 visitNode）→ 不清空 → 不会再弹一次 ✓
 * 正好对上需求「到达安全屋只弹一次；离开再回来 → 再弹」。
 *
 * 资源交换在 v1.9.0b2.2 改回「点选项 → 弹窗」，不再需要这个守卫（它本身就是一个
 * once 选项 + 弹窗里的「执行」才消耗），所以 promptedExchange 已删除。
 */
const promptedShelter = new Set();

/**
 * 找到某个节点上那条交换选项（kind === 'exchange'，v1.9.0b2.2 起它就是一个普通可点选项）。
 *
 * 优先从**已构建的选项表**里取（arriveAt 第 2 步 setOptions(buildOptions(node)) 已经建好）：
 * buildOptions 会给每个选项盖上 fullIndex，而 map.js 里的原始选项对象没有这个字段。
 * 拿原始对象会在 markOptionUsed 时写进一个 undefined —— 同一次会话里「已用过」看着正常，
 * 但存档里会存成 null，读档后判定失效、同一个交换能再做一次。所以这里必须先查已构建表。
 */
function exchangeOptionOf(node) {
  const built = game.getOptions().find((o) => o.kind === 'exchange');
  if (built) return built;
  return (node.options || []).find((o) => o.kind === 'exchange') || null;
}

/**
 * 【改动 2】资源交换的选项 handler（kind === 'exchange'）。
 *
 * v1.9.0b2.2：从 b2.1 的「到达地点自动弹窗」改回 b2 的形态 ——
 *   到达时出现一个可点的地点选项 → 玩家主动点击 → 才弹窗（描述 + 2 选项）。
 *
 * - 弹窗无关闭按钮、必选一项；期间时间暂停（withTimePaused）
 * - 「exec」→ 关窗后执行 effect、打「已用过」标记（按钮消失）、终端输出叙事
 * - 「cancel」→ 关窗，什么都不做：选项保留、可以再点
 * - 不进随机事件池：选项自身 timeCost = 0，所以 onOptionClick 末尾那条「耗时后掷一次」不执行
 * - 与事件 / mustResolve / 拾取 / 安全屋弹窗都是 await 串行，不叠加
 */
async function exchangeAtNode(option, node) {
  const ex = EXCHANGES[option.exchange];
  const fx = EXCHANGE_EFFECTS[option.exchange];
  if (!ex || !fx) return;

  const picked = await withTimePaused(() => modal.showModal({
    title: '',                                   /* 改动 7：标题留空，不出现「资源交换」字样 */
    desc: ex.desc,
    items: [{ id: 'exec', text: ex.exec }, { id: 'cancel', text: ex.cancel }],
    actions: [],                                 /* 没有底部按钮：必须从两项里选一个 */
  }));

  if (!picked || picked.type !== 'item' || picked.id !== 'exec') return;   /* 算了 / 被关掉 */

  /* 「执行」才算用掉：写进既有的 usedOptions（所以存档格式不用改）。
     fullIndex 由 buildOptions 盖上 —— 点进来的 option 就是构建表里的那一个 ✓ */
  game.markOptionUsed(node.id, option.fullIndex);

  if (fx.seconds) time.advanceTime(fx.seconds);
  if (fx.stamina) game.spendStamina(-fx.stamina);     /* 取负：正数表示加体力，spendStamina 自带上限夹取 */
  if (fx.battery) game.spendBattery(-fx.battery);     /* 取负：正数表示加电量，setBattery 夹在 [0, 上限] */
  if (fx.spawn) spawnItemOnNode(node, fx.spawn);

  terminal.log(ex.narrate);

  renderStatusBar();
  renderInventory();
  refreshButtons();

  /* 刷出物品时走既有拾取弹窗，不新造流程（与事件刷物品一致） */
  if (fx.spawn) await pickUpItems(node);
}

/**
 * 【改动 4】到达安全屋时的自动弹窗：5 个按钮，必须选一个才能继续
 *（v1.9.0b2.2：在第 4 位插入「显示大地图」）。
 *   过夜       → 走既有结算流程（settleNight），**不重跑 arriveAt**（否则会再弹一次）
 *   导出 / 导入存档 → 走既有的导出导入流程（它们自己会再开一个弹窗，串行不叠加）
 *   显示大地图 → 只把地图切到大地图视图，然后就地结束：
 *                **不再回到这个弹窗、不强制玩家补选一项**（点掉它就算关掉整个弹窗）
 *   稍作停留   → 关窗，什么都不做
 * 资源交换在 v1.9.0b2.2 改回「点选项 → 弹窗」，所以到达安全屋时先弹本弹窗，
 * 关掉之后地点按钮行里的交换按钮由玩家自己点 ✓（顺序即需求 8）
 */
async function resolveShelter(node) {
  if (!node || game.isGameOver()) return;
  if (!isShelter(node.id)) return;
  if (promptedShelter.has(node.id)) return;         /* 本次停留已经弹过 */

  promptedShelter.add(node.id);

  const picked = await withTimePaused(() => modal.showModal({
    title: UI.shelterPromptTitle,
    desc: UI.shelterPromptDesc,
    items: [
      { id: 'overnight', text: UI.shelter.overnight },
      { id: 'export', text: UI.exportSave },
      { id: 'import', text: UI.importSave },
      { id: 'map', text: UI.showWorldMap },        /* 改动 4：倒数第二个 */
      { id: 'stay', text: UI.shelter.stay },
    ],
    actions: [],
  }));

  if (!picked || picked.type !== 'item') return;

  if (picked.id === 'overnight') {
    /* 就地结算：与「过夜」选项同一套流程，但不再重新走到达流程（避免再次弹窗） */
    settleNight();
    renderStatusBar();
    renderInventory();
    refreshButtons();
    logOvernightFlavor();                            /* 发电厂有专属一句，其它安全屋用通用那句 */
    return;
  }
  if (picked.id === 'export') { await exportSave(); return; }
  if (picked.id === 'import') { await importSave(); return; }
  if (picked.id === 'map') { switchMapView('world'); return; }   /* 改动 4：看一眼大地图就散 */
  /* stay：什么都不做 */
}

/**
 * 过夜之后的氛围文案（v1.9.0b2.2 改动 5）：
 *   发电厂 → 专属一句，说明在这儿充上电了（数值规则在 settleNight）
 *   其它安全屋 → 通用那句
 * 调用点都在结算【之后】—— overnightAtShelter 还特意排在 arriveAt 之后
 * （arriveAt 开头的 terminal.clearQueue() 会把之前排队的日志一起清掉）。
 */
function logOvernightFlavor() {
  terminal.log(game.getCurrentNode() === POWERPLANT_ID ? UI.powerplantOvernight : UI.shelter.overnightDone);
}

/* 按 option.kind 挂 handler：安全屋选项是运行时生成的，用序号会随插队错位。
   v1.9.0b2.2：exchange 又变回「可点的选项」，所以这里重新挂上 exchangeAtNode。 */
const KIND_HANDLERS = {
  overnight: overnightAtShelter,
  stay: stayAtShelter,
  exchange: exchangeAtNode,
};

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
    已用选项的判定统一用 option.fullIndex（与过滤无关的稳定编号）。
    v1.9.0b2.1 那个「把 arrivalOnly 的交换选项排除在外」的过滤器已在 v1.9.0b2.2 去掉 ——
    资源交换又变回可点的地点选项，照常进按钮行 / 选项行 / mustResolve 弹窗。 */
function availableOptions() {
  /* v1.9.0b4 改动 7：游戏结束后选项按钮全部禁用（返回空表 = 按钮行与选项行都清空）。 */
  if (game.isGameOver()) return [];

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
     接口节点（墙门 / 北关 / 东关 / 南关）没有 isDark 标记，所以不受这条限制。 */
  if (isNodeBlockedByDarkness(id)) return;

  /* 钥匙门槛的口径（v1.9.0b4.1 改动 3 / v1.9.0c 改动 5 修订）：
     两者在地图上的画法完全一样 —— 门槛没开时都是「已访问 + 不可达」的灰虚线假象；
     区别只在点了说什么：渡口（移动门）要说一句为什么走不了，
     三把锁与其它 blocked 节点一样静默返回（锁上并没有写着「渡口钥匙」）。 */
  if (missingKeyFor(id)) {
    if (isMoveGate(id)) terminal.log(UI.ferryLocked);
    return;
  }

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

  /* v1.9.0b1：终点判定（旧 goal2 / 旅者之石）随旧地图删除，本块没有终局节点。
     灯塔在码头区域，等 b4 把码头落地后再在这里重做「到达即游戏结束」。 */

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
  /* 2.4 【v1.9.0b4 改动 3】到达码头关：补一句说明那三把锁的存在。 */
  if (node.id === DOCKGATE_ID) terminal.log(UI.dockEntryHint);

  /* 2.5 【改动 3】这一趟刚好把「禁区」的门槛满足了 → 补一句解锁提示。
         标记由 visitNode() 置上（那时刚标记完已访问），这里输出才不会被 clearQueue 清掉。 */
  if (gateNoticePending) {
    gateNoticePending = false;
    terminal.log(UI.gateOpened);
  }
  /* 3 【改动 2】默认追问「你要做什么？」只在【这里确实有事可做】时才打；
       什么都没有的地点改成只打「这里什么都没有。」（b2.2 那一步的输出位置也挪到这里，
       免得「你要做什么？」和「什么都没有」一前一后叠着出现）。
       判定沿用 hasNothingToDo()：无物品 + 无资源交换 + 无其它交互，三者全满足才算空。 */
  const barren = hasNothingToDo(node);
  if (barren) terminal.log(UI.nothingHere);
  else terminal.log(UI.prompt);
  renderInventory();                                 /* 3.5 先让物品栏的「当地物品」区显示出来 */
  await pickUpItems(node);                           /* 4 */
  terminal.log(UI.optionLine(currentButtons()), 'options');   /* 5 选项列表加粗 */
  refreshButtons();                                  /* 6 */
  renderStatusBar();
  renderInventory();
  terminal.focusInput();

  syncKeyLocks();                                    /* 7.0 到达时再确认一次钥匙门槛（物品栏那条路已同步，这里兜底） */
  await resolveMustResolve(node);                    /* 7 到达流程结束后再弹 mustResolve 模态 */

  /* 8 v1.9.0b2.2【改动 2】：资源交换不再是到达自动弹窗 —— 它是地点按钮行里的一个可点选项，
        由玩家自己点（见 exchangeAtNode）。所以这里没有第 8 步了。 */

  /* 8.5 【v1.9.0b3.1 改动 7】荒野的纯负面遭遇：到达就弹、强制二选一、once。
         位置在 mustResolve 之后、安全屋弹窗之前 —— 全部 await 串行，不会两个弹窗叠在一起。
         与资源交换不冲突：交换是选项按钮（要玩家点），遭遇是自动弹窗。 */
  await resolveNegativeEvent(node);

  /* 9 【改动 4】到达安全屋 → 弹 5 选 1 的安全屋弹窗（过夜 / 导出 / 导入 / 显示大地图 / 稍作停留）。
        它排在所有流程之后；关掉之后玩家照常可以点地点选项（包括该地的资源交换按钮）。 */
  await resolveShelter(node);

  /* 10 【v1.9.0b4 改动 7】到达灯塔 = 通关：输出终局文案并锁死一切操作。
        放在最后：到达文案、物品拾取、选项行都已经走完，结束之后就只剩 /version 与 /help 还能用。 */
  checkLighthouseEnding(node);
}

/**
 * 【改动 1】这个地点是不是「什么都没有」：到达后没有任何可做的事。
 *
 * 三个条件全满足才为真（任一不满足就说明这里有交互，不输出空话）：
 *   1) 没有物品      —— 节点物品池里没有【还没被捡走】的东西（getPickableItems 已按 collectedItems 过滤）
 *   2) 没有资源交换  —— 不是 EXCHANGE_BY_NODE 里挂了交换的节点
 *   3) 没有其它交互  —— 不是安全屋、没有 mustResolve、也没有任何非系统选项
 *        （系统附加入口如「看一眼墙上的老钟」不算交互；v1.9.0b2.2 起交换选项本身就是普通选项，
 *          第 2 条已经覆盖它，这里再按 kind 排一次是为了防止将来加别的系统入口时误判）
 *
 * 【改动 2】它还决定到达时打哪一句：为真 → UI.nothingHere；为假 → 照旧问 UI.prompt。
 * 注意：随机事件是「到达之后」才掷的（travelTo 里 arriveAt 的下一条），
 * 所以这里无法预知会不会紧跟着弹一个事件 —— 那种情况下玩家会先看到空地点那一句、再看到事件。
 */
function hasNothingToDo(node) {
  if (!node) return false;
  if (getPickableItems(node, game.state.collectedItems).length > 0) return false;
  if (exchangeOptionOf(node)) return false;
  if (node.mustResolve) return false;
  if (isShelter(node.id)) return false;
  return !(node.options || []).some((o) => !o.systemOption && o.kind !== 'exchange');
}

/**
 * mustResolve：到达关键节点后弹一个「必须从里面选一个」的模态。
 * 无可点选项（requires 都不满足 / 都用过了）时不弹，输出提示并视为已解除，允许离开。
 */
async function resolveMustResolve(node) {
  if (!node.mustResolve) return;
  if (game.isMustResolveResolved(node.id)) return;

  /* 只列「这个地点要你做的决定」：系统附加入口（看时间类）不是决定，一律不进弹窗。
     它们仍然照常出现在终端选项行与按钮行里。 */
  const choices = currentButtons().filter((b) => !b.disabled && !b.option.systemOption);
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
 *   目标区域还是占位（v1.9.0b1）→ 「前面的路还没通。」
 * 未解锁区域根本不会渲染，所以走不到这里。
 */
async function onRegionClick(areaId) {
  if (!areaId) return;
  if (game.isGameOver()) return;                     /* v1.9.0b4：地图点击全部禁用 */

  const current = game.getCurrentArea();
  if (areaId === current) {
    switchMapView('area');
    return;
  }

  if (!isAreaNeighbor(current, areaId)) {
    terminal.log(UI.cannotGoDirectly);
    return;
  }
  /* 【改动 7】目标区域还是占位（荒野 / 工业区 / 东海岸 / 码头 / 孤岛）：
     站在接口节点上也会点得到那块区域，但它节点表还没落地，走不过去。
     这一句同时也是「延伸白线点不动」的说明 —— 白线本身没绑事件。 */
  if (!isAreaImplemented(areaId)) {
    terminal.log(UI.roadNotOpen);
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
  /* 过夜后的氛围文案要放在 arriveAt【之后】：arriveAt 开头会 terminal.clearQueue()，
     排在它前面会被连排队一起清掉，玩家根本看不到。
     发电厂专属那句（说明「在这儿充上电了」）就靠这个顺序才能显示出来。 */
  logOvernightFlavor();
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
      /* v1.9.0b2.3 改动 3：可装备的东西（有 slot）多出一条「装备 X」——
         这是野外拿东西的第一入口，放在这里才算真的「捡到就能立刻穿上」。
         id 用 'equip:<itemId>' 前缀区分：modal 只把它当不透明值回传，
         所以不用改 modal.js 的结构。 */
      items: pickable.flatMap((itemId) => {
        const item = ITEMS[itemId];
        const rows = [{ id: itemId, text: item ? item.name : itemId, hint: item ? item.desc : '' }];
        if (inventory.canEquip(item)) {
          rows.push({
            id: `equip:${itemId}`,
            text: UI.pickupEquip(item.name),
            hint: UI.pickupEquipHint(item.name),
          });
        }
        return rows;
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
    const rawId = String(result.id);
    const equipNow = rawId.startsWith('equip:');      /* 走「拿起 + 立刻穿上」那一支 */
    const itemId = equipNow ? rawId.slice('equip:'.length) : rawId;
    const item = ITEMS[itemId];
    if (!item) {                                      /* 文案缺失时的兜底：直接记走 */
      game.markItemCollected(itemId);
      dropFromNode(node, itemId);
      changed = true;
      continue;
    }
    if (equipNow) {
      if (await takeAndEquip(node, itemId, item)) changed = true;
    } else if (await tryTakeItem(node, itemId, item)) {
      changed = true;
    }
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
 *
 * v1.9.0b2.3：加一道「这件已经被拿走了」的守卫 —— 拾取弹窗的列表是打开时渲染的快照，
 * 玩家完全可能在这期间用物品栏的「当地物品 / 装备」入口把它拿走（两个面板都在屏幕上）。
 * 没有这道守卫的话，再点一次那个过期条目会再发一份同样的物品（重复物品）。
 */
async function tryTakeItem(node, itemId, item) {
  if (game.state.collectedItems.has(itemId) && !node.items.includes(itemId)) return false;
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

/* ===============================================================
   v1.9.0b4 / v1.9.0b4.1：钥匙门槛与灯塔终局
   ---------------------------------------------------------------
   1. syncKeyLocks()：只要【随身带着】某把钥匙（口袋 / 手持槽 / 装备槽，储物箱不算），
      就把【这把钥匙的 id】记成「拿到过」（state.everHeldKeys 进存档）——
      门槛一旦开过就永久保持，之后把钥匙丢掉（或塞进储物箱）也不会重新锁上。
      物品栏每次重绘都会调一次（拿东西/丢东西都会重绘），所以不需要额外挂钩。
   2. checkLighthouseEnding()：到达灯塔 = 通关，输出终局文案并锁死一切操作。
   =============================================================== */
function syncKeyLocks() {
  /* v1.9.0b4.1 改动 3.4 / 9：登记的是【钥匙 id】，不是锁的节点 id ——
     「拿到过」这件事发生在钥匙身上，锁的永久解锁由 isKeyGateOpen 从它推导。
     遍历的是【全部门槛】（三把锁 + 渡口），不是「还没开的」那几把：
     带着钥匙时 isKeyGateOpen 已经是 true，用后者的清单会一个都登记不到。 */
  for (const gateId of keyGateNodeIds()) {
    const keyId = keyGateOf(gateId);
    if (keyId && carriesKey(keyId)) game.markKeyHeld(keyId);
  }
}

/**
 * 结束（gameOver）之后统一的那一套锁死刷新（v1.9.0 改动 2）。
 *
 * 两个结束入口（体力上限降到 1 / 到达灯塔）都调这一个函数，所以「地图点击、选项按钮、
 * 状态栏、物品栏」四项的锁死表现逐项一致：
 *   - 地图：重绘一次，节点 / 区域块 / 返回按钮的点击由各自入口的 isGameOver 拦截挡掉
 *   - 选项按钮：refreshButtons() 拿到的 availableOptions() 在结束时返回空表
 *   - 状态栏：时间已在调用前 stopClock() 停住，这里只重绘数值
 *   - 物品栏：重绘（结束后物品栏仍然可以看，但不能用 —— useItem 开头也有 isGameOver 早退）
 * 终端输入的白名单（只放行 /version 与 /help）在 handleCommand 里，两条路径共用。
 */
function lockDownAfterGameOver() {
  refreshMap({ current: game.getCurrentNode() });
  refreshButtons();
  renderStatusBar();
  renderInventory();
}

/**
 * 灯塔终局（v1.9.0b4 改动 7 / v1.9.0 改动 1-2）：到达灯塔 → 胜利叙事 → 通关画面 → 游戏结束。
 *
 * 输出顺序（按需求逐条对应）：
 *   a) 胜利叙事 UI.lighthouseWin（三行，呼应日记里「灯塔顶端有我要的解药」）
 *   b) 通关画面 LIGHTHOUSE_WIN_ASCII（灯塔顶端的视角，只在这里换上去；节点本身的画不变）
 *   c) UI.gameOverLighthouse「游戏结束！」
 * 锁死范围与「体力上限降到 1」那条结束路径**逐项相同**，由 lockDownAfterGameOver() 统一负责；
 * 状态里仍然只用一个 gameOver 字段（不新增字段、不记结束原因）。
 * 注意【不锁终端输入】—— 按需求结束后还允许输入 /version 与 /help，
 * 由 handleCommand 拦掉其它指令（提示「游戏已结束。」）。
 * @returns {boolean} 是否触发了终局
 */
function checkLighthouseEnding(node) {
  if (!node || node.id !== LIGHTHOUSE_ID) return false;
  if (game.isGameOver()) return false;

  game.setGameOver(true);
  terminal.logLines(UI.lighthouseWin);               /* a) 胜利叙事（一段一行） */
  setSceneArt(LIGHTHOUSE_WIN_ASCII);                 /* b) 通关画面（灯塔顶端） */
  terminal.log(UI.gameOverLighthouse);               /* c) 游戏结束！ */
  time.stopClock();                                  /* 状态栏时间停住 */
  lockDownAfterGameOver();                           /* 与体力那条完全同一套刷新 */
  return true;
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
  if (game.isGameOver()) return null;               /* v1.9.0b4：结束后不再触发随机事件 */
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
  /* 3 打「已用过」标记。
     v1.9.0b2.2：资源交换又是可点的选项了，但它的 once 语义由弹窗决定 ——
     点按钮只是「打开弹窗」，选「算了」不算用掉（按钮要留着），
     所以这里跳过它，交给 exchangeAtNode 在确认「执行」之后自己打标。 */
  if (option.kind !== 'exchange') {
    game.markOptionUsed(node.id, option.fullIndex, option.perDay === true);
  }
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
  const text = String(input).trim();

  /* v1.9.0b4 改动 7：游戏结束后终端只放行 /version 与 /help。
     其余输入 —— 包括所有调试指令（/goto /time …）与选项编号 —— 一律回一句「游戏已结束。」。
     这里【不】用 terminal.setLocked(true)：那样连 /version 也打不出来了。 */
  if (game.isGameOver()) {
    const allowed = ['/version', '/help'];
    if (DEBUG_CONSOLE && allowed.includes(text)) {
      terminal.log(debug.runCommand(text, game.state, debugContext));
      return;
    }
    terminal.log(UI.gameOverLocked);
    return;
  }

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
    game.setGameOver(true);                          /* b) 结束（v1.9.0b4.1 起不再记结束原因） */
    terminal.log(UI.gameOverStamina);                /* c) "你再也走不动了。"（v1.9.0 改动 2 的新文案） */
    time.stopClock();                                /* d) 停止时钟 */
    /* d2) v1.9.0b4：不再 setLocked(true) —— 结束后按需求还允许 /version 与 /help，
           其余指令由 handleCommand 的白名单拦掉（提示「游戏已结束。」）。 */
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
  /* v1.9.0 改动 2：末段的重绘换成两条结束路径共用的那一个（内容与原先逐项相同） */
  lockDownAfterGameOver();
}

/**
 * 黑暗地点断电：身处黑暗地点（isDark 节点）时电量归零 ——
 *   送回【当前节点可达的最近门户（安全屋）】+ 天数 +1 + 时间归零 + 体力回满，
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
       本块的两块区域里还没有黑暗节点，等荒野（b3）落地后这条路径才会真正被用到。 */
  const area = game.getCurrentArea();
  const shelterId = forceHomeTarget();
  visitNode(area, shelterId);

  /* 2 结算：天数 +1、时间归零、体力回满。
       电量回满与否交给 settleNight 的全局规则（落点 === home 才回电）；
       darkarea/接口节点不是回电点，落点在那儿时正常情况电量保持 0。
       注意这里【没有】setStaminaMax(...)，体力上限一分不扣。
       结算读的就是上面 visitNode 换过之后的当前节点。 */
  settleNight();

  /* 3 再判断 gameOver（沿用原顺序）。体力上限没被扣，所以只有本来就已经触底才可能成立 */
  if (game.getStaminaMax() <= STAMINA_MIN) {
    game.setGameOver(true);                          /* v1.9.0b4：黑暗断电导致的结束 */
    terminal.log(UI.gameOverStamina);
    time.stopClock();
    /* v1.9.0b4：同样不锁终端（白名单在 handleCommand 里） */
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
 *
 * 回电规则（只看【结算时的当前节点】）：
 *   === RECHARGE_NODE（家）          → 电量回满
 *   === POWERPLANT_ID（发电厂）      → 电量 += 上限 × 30%，加完 clamp 到上限
 *                                      （v1.9.0b2.2 改动 5：b2 有这条、b2.1 删了、现在改回来）
 *   其余安全屋（墙门 / 北关 / 东关 / 南关 / 码头关）→ **不回电**
 * 所以「先传送 → 后结算」定下来之后，各条路径的回电行为自然一致。
 */
function settleNight() {
  game.setDay(game.getDay() + 1);        /* 1 */
  /* 1.5 跨天一次性扣电：必须在「回电」之前，
         这样在家过夜才是满电开局，在别的安全屋过夜才会真扣掉这 5%
         （发电厂也一样：先扣 5%，再加 30% —— 顺序按现有结算流程，本块不改电量流逝逻辑） */
  time.drainBatteryOnDayChange();
  game.setElapsedSeconds(0);             /* 2 */
  game.setStamina(game.getStaminaMax()); /* 3 */
  /* 4 回电：按节点判断，与区域无关（家在「废城」，发电厂在「工业区」）。
       v1.9.0b2.2 改动 5 把这条规则改回来；v1.9.0c 改动 3-4 起上限不再是常量 BATTERY_MAX，
       而是【当前上限】（＝基础 100 + 装备加成，电容器 +25），一律走 game.getBatteryMax()；
       setBattery 自带的 [0, 上限] 夹取正好实现「加完 clamp 到上限」。 */
  const hereNode = game.getCurrentNode();
  const batteryMax = game.getBatteryMax();
  if (hereNode === RECHARGE_NODE) {
    game.setBattery(batteryMax);
  } else if (hereNode === POWERPLANT_ID) {
    game.setBattery(game.getBattery() + batteryMax * POWERPLANT_RECHARGE_RATIO);
  }
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
  /** /battery 用（v1.9.0c）：当前电量上限（基础 100 + 装备加成），debug 侧的 clamp 走它 */
  batteryMax: () => game.getBatteryMax(),
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
  /* /event reset 用：清空「已触发过的事件」，让事件池恢复成完整一份（v1.9.0b1.1） */
  clearTriggeredEvents: () => game.clearTriggeredEvents(),
  /** /event trigger 前的准入检查：游戏结束 / 有弹窗没处理 / 正在移动 都拒绝 */
  canTriggerEvent: () => !game.isGameOver() && !isFlowBusy(),
  /**
   * /give 用（v1.9.0b4.1 改动 10）：把 count 件 itemId 塞进背包。
   * 调试入口，所以【不看容量】—— 全部放进口袋（口袋放不进去的极端环境才退回手持槽）。
   * 不消耗任何资源、不动节点物品列表与「已拾取」标记（给的是额外几件，不是从节点上拿的）。
   * 这里不做校验：id 是否存在、数量是否合法都由 debug.js 先判好。
   */
  giveItem: (itemId, count) => {
    const item = ITEMS[itemId];
    if (!item) return false;
    const n = Math.max(1, Math.floor(Number(count) || 1));
    if (Array.isArray(game.getPocket())) {
      for (let i = 0; i < n; i += 1) game.addToPocket({ ...item });
    } else {
      game.setEquippedSlot('hand', { ...item });
    }
    return true;
  },
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



