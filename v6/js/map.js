/**
 * map.js —— 多区域地图（数据 + SVG 绘制 + 点击回调）
 *
 * 数据模型（本次重构）：
 *   NODES   —— 全局节点字典，以 id 为键。节点 id 全局唯一，不重复。
 *   REGIONS —— 区域字典，用 nodes: string[] 引用 NODES 里的 id。
 *
 * 区域之间靠【共享节点】连通，不再有「跨区域边」：
 *   home       同时属于 home 区域与 area1
 *   lighthouse 同时属于 area1 与 area2
 * 因此从一个区域切到另一个区域 = 换一个区域视图，玩家仍站在同一个节点上，
 * 不消耗体力、不消耗时间。
 *
 * 区域内部用细线（.road），区域之间用粗线（.region-link）。
 * 本模块不判断游戏规则，不操作终端。
 */

import { SCENES, UI } from './texts.js';
import { DEFAULT_TRAVEL_COST, DISTANCE_TO_TIME_RATIO, SECONDARY_ROAD_PENALTY } from './config.js';
import * as game from './state.js';
import { formatDuration, formatClock } from './timeSystem.js';

export const VIEW = { w: 1000, h: 600 };
export const NODE_W = 130;
export const NODE_H = 56;
export const HOME_ID = 'home';
export const START_AREA = 'home';           /* 开局所在区域 */
export const LIGHTHOUSE_ID = 'lighthouse';  /* area1 与 area2 的共享节点 */

/* 选项前置条件（requires(state) === false 时按钮灰着并显示 requiresHint） */
const HOLDS_LIGHT = (s) => {
  const slots = [s.equipped.hand, s.equipped.torso, s.equipped.legs, s.equipped.back];
  const lit = (item) => Boolean(item) && (item.id === 'flashlight' || item.id === 'torch');
  return slots.some(lit) || s.pocket.some(lit);
};
const HOLDS_FLASHLIGHT = (s) => {
  const slots = [s.equipped.hand, s.equipped.torso, s.equipped.legs, s.equipped.back];
  const isTorch = (item) => Boolean(item) && item.id === 'flashlight';
  return slots.some(isTorch) || s.pocket.some(isTorch);
};
const REQUIRES = {
  n3: { 进入洞穴: { check: HOLDS_LIGHT, hint: '需要光源' } },
  n5: { 使用手电筒探查: { check: HOLDS_FLASHLIGHT, hint: '需要手电筒' } },
};

/**
 * 从 SCENES 展开一个节点。
 * 文案（含 mustResolveDesc）一律来自 texts.js；坐标与 items / mustResolve 写在这里。
 */
function defNode(id, x, y, items, mustResolve, isDark) {
  const scene = SCENES[id];
  if (!scene) throw new Error(`map.js: SCENES 缺少节点 ${id} 的文案`);

  const options = (scene.options || []).map((o) => {
    const rule = (REQUIRES[id] || {})[o.text];
    return rule ? { ...o, requires: rule.check, requiresHint: rule.hint } : { ...o };
  });

  return {
    id,
    name: scene.name,
    x,
    y,
    ascii: scene.ascii,
    altAscii: scene.altAscii,
    desc: scene.desc,
    options,
    items: items || [],
    mustResolve: Boolean(mustResolve),          /* 到达后必须先做出一次选择才能离开 */
    mustResolveDesc: scene.mustResolveDesc || '',
    /* 黑暗地点：身处其中时电量额外流逝，且没电时不能从外面走进去。
       标记写在节点上而不是「按区域 + 是否入口」推：同一区域将来可以有多个黑暗地点，
       入口通道（southpass）也就不需要任何特例。 */
    isDark: Boolean(isDark),
  };
}

/* ===============================================================
   1. 节点字典（全局唯一 id）
   =============================================================== */

export const NODES = {
  home: defNode('home', 80, 300, []),
  n1: defNode('n1', 250, 100, ['flashlight'], true),   /* 关键节点：捡手电筒 */
  n2: defNode('n2', 250, 300, ['torch']),
  n3: defNode('n3', 250, 500, [], true),               /* 关键节点：幽暗洞穴 */
  n4: defNode('n4', 450, 100, []),
  n5: defNode('n5', 450, 300, [], true),               /* 关键节点：废弃哨塔 */
  n6: defNode('n6', 450, 500, []),
  n7: defNode('n7', 650, 300, [], true),               /* 关键节点：岔路口 */
  lighthouse: defNode('lighthouse', 800, 300, ['pocketwatch'], true),  /* 关键节点 + 共享节点 */

  /* area2：以 lighthouse 为起点向左延伸（lighthouse 是共享节点，坐标由 area1 那侧定死） */
  m1: defNode('m1', 620, 120, []),
  m2: defNode('m2', 460, 300, []),
  m3: defNode('m3', 300, 120, []),
  goal2: defNode('goal2', 140, 300, []),

  /* 北面两个新区域 */
  northpass: defNode('northpass', 660, 60, []),   /* area1 的北出口 / newarea2 的东出口（共享） */
  northgate: defNode('northgate', 580, 300, []),  /* newarea1 的东端 / newarea2 的西端（共享） */
  na1_main: defNode('na1_main', 330, 300, ['compass']),
  na2_main: defNode('na2_main', 350, 300, []),

  /* 南面黑暗地带：southpass 是 area1 的南出口 / darkarea 的北入口（共享），
     dark_core 是区域内部的黑暗地点（isDark = true） */
  southpass: defNode('southpass', 660, 540, []),        /* 仿 northpass，只是方向朝南 */
  dark_core: defNode('dark_core', 660, 300, ['darkshard'], false, true),
};

/* ===============================================================
   2. 区域字典（nodes 是 id 数组）
   =============================================================== */

export const REGIONS = {
  home: {
    id: 'home',
    name: '家',
    type: 'region',
    nodes: ['home'],
    neighbors: ['area1', 'newarea1'],
    primaryShelter: 'home',
    unlocked: true,
  },

  /* 北面新区域一：在家正北。home 是三区域共享节点，所以它的西端就是 home */
  newarea1: {
    id: 'newarea1',
    name: '北岸',
    type: 'region',
    nodes: ['home', 'na1_main', 'northgate'],
    edges: [
      { from: 'home', to: 'na1_main' },
      { from: 'na1_main', to: 'northgate' },
    ],
    mainRoads: [['home', 'na1_main'], ['na1_main', 'northgate']],
    neighbors: ['home', 'newarea2'],
    primaryShelter: 'home',
    unlocked: true,                     /* home 也属于这一区域，开局就该能看到 */
  },

  /* 北面新区域二：在 area1 正北。northgate 是它的西端，northpass 是它的东端（南出口） */
  newarea2: {
    id: 'newarea2',
    name: '北境',
    type: 'region',
    nodes: ['northgate', 'na2_main', 'northpass'],
    edges: [
      { from: 'northgate', to: 'na2_main' },
      { from: 'na2_main', to: 'northpass' },
    ],
    mainRoads: [['northgate', 'na2_main'], ['na2_main', 'northpass']],
    neighbors: ['newarea1', 'area1'],
    primaryShelter: 'northpass',        /* 区域内没有安全屋节点，强制回家落到南出口 */
    unlocked: false,
  },

  area1: {
    id: 'area1',
    name: '荒原',
    type: 'region',
    nodes: ['home', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'lighthouse', 'northpass', 'southpass'],
    edges: [
      { from: 'home', to: 'n1' },
      { from: 'home', to: 'n2' },
      { from: 'home', to: 'n3' },
      { from: 'n1', to: 'n4' },
      { from: 'n2', to: 'n5' },
      { from: 'n3', to: 'n6' },
      { from: 'n4', to: 'n7' },
      { from: 'n5', to: 'n7' },
      { from: 'n6', to: 'n7' },
      { from: 'n7', to: 'lighthouse' },
      { from: 'n7', to: 'northpass' },   /* 北出口：从岔路口往北 */
      { from: 'n7', to: 'southpass' },   /* 南出口：从岔路口往南，通黑暗地带 */
    ],
    mainRoads: [['home', 'n2'], ['n2', 'n5'], ['n5', 'n7'], ['n7', 'lighthouse'],
      ['n7', 'northpass'], ['n7', 'southpass']],
    neighbors: ['home', 'area2', 'newarea2', 'darkarea'],
    primaryShelter: 'home',
    unlocked: true,
  },

  /* 南面新区域：黑暗地带。southpass 是它与 area1 的共享节点（北入口），
     dark_core 是区域内部的黑暗地点（没电时不能从外面走进去，身处其中电量加速流逝）。 */
  darkarea: {
    id: 'darkarea',
    name: '黑暗地带',
    type: 'region',
    nodes: ['southpass', 'dark_core'],
    edges: [
      { from: 'southpass', to: 'dark_core' },
    ],
    mainRoads: [['southpass', 'dark_core']],
    neighbors: ['area1'],
    /* primaryShelter 必须是本区域的节点（强制回家会 visitNode(区域, 该节点)）：
       没有安全屋节点，就落到北入口，与 newarea2 → northpass 同一套做法。
       副作用：southpass 因此进了 isShelter 的并集，会像 northpass 一样多出「过夜」选项；
       但它不回电 —— 回电只认「当前节点是 home」。 */
    primaryShelter: 'southpass',
    unlocked: false,                    /* 初始锁定；访问过任一节点即解锁 */
  },

  area2: {
    id: 'area2',
    name: '未知地域',
    type: 'region',
    nodes: ['lighthouse', 'm1', 'm2', 'm3', 'goal2'],
    edges: [
      { from: 'lighthouse', to: 'm1' },
      { from: 'm1', to: 'm2' },
      { from: 'm2', to: 'm3' },
      { from: 'm3', to: 'goal2' },
    ],
    mainRoads: [['lighthouse', 'm1'], ['m1', 'm2'], ['m2', 'm3'], ['m3', 'goal2']],
    neighbors: ['area1'],
    primaryShelter: 'lighthouse',
    unlocked: false,                    /* 初始锁定；访问过任一节点即解锁 */
  },
};

/**
 * 区域在大地图上的摆放。
 * 上排：北面两个新区域。newarea1 在 home 正北、newarea2 在 area1 正北，
 *       所以它们的 x 与宽度都跟正下方那一块对齐，竖向连线才是直的。
 * 下排：原有三块坐标一律未动。
 * 南面：darkarea 摆在 area1 正南（x 中心对齐 area1 的 x 中心 520），
 *       与 area1 底边（480）留 20px 空隙给通道标签，且整块不超出画布高 600。
 * 注：现有数据里 home.y(200) 与 area1.y(120) 本来就不相等，
 * 但两者的高度让中心线都落在 y=300，所以「下排在同一水平线上」是成立的；
 * 上排整排压在 y<=110 的空档里，不与下排重叠。
 */
const REGION_BOX = {
  newarea1: { x: 60, y: 10, w: 200, h: 100 },
  newarea2: { x: 320, y: 10, w: 400, h: 100 },
  home: { x: 60, y: 200, w: 200, h: 200 },
  area1: { x: 320, y: 120, w: 400, h: 360 },
  area2: { x: 780, y: 120, w: 180, h: 360 },
  darkarea: { x: 420, y: 500, w: 200, h: 90 },   /* area1 正南（中心 x 与 area1 对齐） */
};

/* ===============================================================
   3. 查询接口
   =============================================================== */

export function getRegion(regionId) {
  return REGIONS[regionId] || null;
}

export function getCurrentRegion() {
  return getRegion(game.getCurrentArea()) || REGIONS[START_AREA];
}

/** getNode(id)；也接受 'area2:m1' 这种带区域前缀的写法（id 全局唯一，前缀只是容错） */
export function getNode(id) {
  if (id === undefined || id === null) return null;
  const raw = String(id);
  const key = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw;
  return NODES[key] || null;
}

/** 区域里的节点对象数组（按 nodes 数组顺序） */
export function getNodes(regionId) {
  const region = getRegion(regionId);
  if (!region) return [];
  return region.nodes.map((id) => NODES[id]).filter(Boolean);
}

/** 区域里的节点 id 数组 */
export function getNodeIds(regionId) {
  const region = getRegion(regionId);
  return region ? region.nodes.slice() : [];
}

export function getEdges(regionId) {
  const region = getRegion(regionId);
  return (region && region.edges) || [];
}

export function getMainRoads(regionId) {
  const region = getRegion(regionId);
  return (region && region.mainRoads) || [];
}

/* ---------------- 共享节点 / 邻接 ------------- */

/** 含该节点的所有区域 id（共享节点会返回多个） */
export function areasOfNode(nodeId) {
  return Object.keys(REGIONS).filter((id) => REGIONS[id].nodes.includes(nodeId));
}

/** 两个区域共享的节点 id 数组 */
export function sharedNodes(areaA, areaB) {
  const a = getRegion(areaA);
  const b = getRegion(areaB);
  if (!a || !b) return [];
  return a.nodes.filter((id) => b.nodes.includes(id));
}

/** 该节点是否同时属于这两个区域 */
export function isSharedNode(nodeId, areaA, areaB) {
  return sharedNodes(areaA, areaB).includes(nodeId);
}

/**
 * a 与 b 是否相邻。
 * 两种情况都算：
 *   1) 数据里 a.neighbors 显式声明了 b —— 这一组还会在大地图上画出连线
 *   2) 两个区域共享同一个节点 —— 玩家就站在那个节点上，本来就该能切过去
 *      （例如 area1 与 newarea1 共享 home，但按方位图它们之间不画连线）
 */
export function isAreaNeighbor(areaA, areaB) {
  const region = getRegion(areaA);
  if (!region) return false;
  if ((region.neighbors || []).includes(areaB)) return true;
  return sharedNodes(areaA, areaB).length > 0;
}

/** 该区域的强制回家送达地 */
export function primaryShelterOf(regionId) {
  const region = getRegion(regionId);
  return region ? region.primaryShelter : HOME_ID;
}

/**
 * 是不是安全屋。
 * 新结构里区域只有 primaryShelter、没有 shelters 数组，所以这里取「所有区域 primaryShelter 的并集」
 *（= home 与 lighthouse），这样不论从哪个区域看，灯塔都还是那个能过夜的安全屋。
 */
export function isShelter(nodeId) {
  return Object.values(REGIONS).some((region) => region.primaryShelter === nodeId);
}

/** 该节点是不是【当前区域】的主安全屋 */
export function isPrimaryShelter(nodeId) {
  return getCurrentRegion().primaryShelter === nodeId;
}

/**
 * 黑暗地点：节点数据里的 isDark 标记（目前只有 darkarea 的 dark_core）。
 * 判定只看节点自己 —— 入口通道（southpass）没有标记，所以永远不受黑暗规则影响。
 */
export function isDarkNode(nodeId) {
  const node = getNode(nodeId);
  return Boolean(node && node.isDark);
}

/**
 * 没电时不能进入黑暗地点：目标节点是黑暗地点、且当前电量 = 0 → 不可点。
 * 只针对「走进去」这一步；玩家已经在黑暗地点里没电属于另一种情形（main.js 的黑暗归零回家）。
 */
export function isNodeBlockedByDarkness(nodeId) {
  return isDarkNode(nodeId) && game.getBattery() <= 0;
}

/**
 * 该区域是不是「黑暗区域」（大地图上要额外标识的区域）。
 * 由节点推导而不是再加一个区域字段：一个区域只要含任何 isDark 节点就算，
 * 将来某个区域有多个黑暗地点、或者黑暗地点挪走，标识都会自动跟着变。
 */
export function isDarkRegion(regionId) {
  return getNodeIds(regionId).some((id) => isDarkNode(id));
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/* ---------------- 节点坐标噪声（纯视觉抖动，不参与任何数值计算） ---------------- */

const NOISE_RANGE = 35;                 /* ±35：实测 ±40 会让节点框重叠，±35 是不重叠的最大值 */

/** FNV-1a 32 位字符串 hash：用 nodeId 当种子 */
function hashNodeId(nodeId) {
  const str = String(nodeId);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const noiseCache = new Map();

/**
 * 节点的固定随机偏移 { dx, dy }，各在 [-35, 35] 之间。
 * 同一个 nodeId 永远返回同一个结果，所以重绘、切视图、刷新页面都不会跳位。
 */
export function getNodeNoise(nodeId) {
  if (noiseCache.has(nodeId)) return noiseCache.get(nodeId);

  const h = hashNodeId(nodeId);
  const span = NOISE_RANGE * 2 + 1;
  const noise = {
    dx: ((h & 0xffff) % span) - NOISE_RANGE,
    dy: (((h >>> 16) & 0xffff) % span) - NOISE_RANGE,
  };
  noiseCache.set(nodeId, noise);
  return noise;
}

/**
 * 视觉坐标覆盖表：只影响【绘制】，不影响 computeEdgeCost 用的逻辑坐标（NODES 里的 x/y）。
 *
 * 为什么需要它：lighthouse 是共享节点，只有一个逻辑坐标，而它必须同时
 * 是 area1 的最东端、又是 area2 的最西端 —— 一个 x 做不到。
 * 所以把「区域内部要显示成西→东」这件事放在视觉层解决，逻辑层一动不动。
 *
 * area1 的逻辑坐标本来就是 home < 中间 < lighthouse，无需覆盖，故不列。
 * area2 的逻辑 x 是 lighthouse(800) → goal2(140)（从东往西），
 * 这里把它的视觉 x 反过来排，变成 lighthouse(140) → goal2(780)（从西往东）。
 * y 沿用各节点原有的高度，只调 x 的单调性。
 */
const REGION_VIEW_POS = {
  area2: {
    lighthouse: { x: 140, y: 300 },
    m1: { x: 300, y: 120 },
    m2: { x: 460, y: 300 },
    m3: { x: 620, y: 120 },
    goal2: { x: 780, y: 300 },
  },

  /* newarea2：northgate 在 newarea1 那侧是最东端，到这里要当最西端；
     northpass 在 area1 那侧是北出口，到这里当东端（略偏南，指向回 area1 的路）。
     na2_main 只在这一区域出现，逻辑坐标就是视觉坐标，不需要覆盖。
     newarea1 同理不需要覆盖：home(80) < na1_main(330) < northgate(580) 本来就单调。 */
  newarea2: {
    northgate: { x: 80, y: 240 },
    northpass: { x: 620, y: 360 },
  },

  /* darkarea：southpass 在 area1 那侧是南出口（逻辑 y = 540），到了本区域要当【北入口】，
     所以视觉上抬到 y = 120；dark_core 只在这一区域出现，逻辑坐标 (660,300) 就在它下面，
     正好读成「北入口 → 往南进入黑暗」，不需要覆盖。
     逻辑坐标（算费用）一个都没动：southpass(660,540) ↔ dark_core(660,300) = 240 → 720 秒。 */
  darkarea: {
    southpass: { x: 660, y: 120 },
  },
};

/** 节点在指定区域里的视觉基准坐标：有覆盖用覆盖，没有就用逻辑坐标 */
function viewPos(regionId, node) {
  const overrides = REGION_VIEW_POS[regionId];
  const over = overrides && overrides[node.id];
  return over ? { x: over.x, y: over.y } : { x: node.x, y: node.y };
}

/** 节点实际绘制坐标 = 该区域的视觉基准坐标 + 固定噪声，再夹回画布内（否则贴边节点会被裁掉） */
function drawPos(node, regionId) {
  const { dx, dy } = getNodeNoise(node.id);
  const base = viewPos(regionId, node);
  const halfW = NODE_W / 2;
  const halfH = NODE_H / 2;
  return {
    x: Math.min(VIEW.w - halfW, Math.max(halfW, base.x + dx)),
    y: Math.min(VIEW.h - halfH, Math.max(halfH, base.y + dy)),
  };
}

/**
 * 可点击判定：节点【已访问】，或【与任一已访问节点有边相连】。
 * 不用距离阈值 —— 有连线就能走，避免“看得见路却点不动”。
 */
export function computeClickable(regionId, visited) {
  const known = visited instanceof Set ? visited : new Set(visited || []);
  const result = new Set();

  for (const id of getNodeIds(regionId)) {
    if (known.has(id)) result.add(id);
  }
  for (const edge of getEdges(regionId)) {
    if (known.has(edge.from)) result.add(edge.to);
    if (known.has(edge.to)) result.add(edge.from);
  }
  return result;
}

/**
 * 某节点是否「被访问过」—— 跨区域判定。
 * home / lighthouse 是共享节点：访问记录可能只落在它所属的另一个区域里
 *（例如开局站在家里，visitedByArea.home 里有 'home'，但 visitedByArea.area1 里没有）。
 * 所以判断某一区域的可见性时，不能只看本区域那个 Set。
 */
export function isNodeVisited(nodeId) {
  return areasOfNode(nodeId).some((areaId) => game.getVisitedByArea(areaId).has(nodeId));
}

/**
 * 某区域里「算已访问」的节点集合：把共享节点在其他区域的访问状态并进来。
 * 只读、不改 state —— 不会往 visitedByArea[本区域] 里塞东西，避免污染存档语义。
 */
export function getVisitedIn(regionId) {
  const set = new Set();
  for (const id of getNodeIds(regionId)) {
    if (isNodeVisited(id)) set.add(id);
  }
  return set;
}

const edgeCostCache = new Map();

/**
 * 边耗时 = 逻辑距离 × DISTANCE_TO_TIME_RATIO（支路再乘 SECONDARY_ROAD_PENALTY）。
 *
 * 【坐标选择】一律用【原始坐标】算距离，不用 getNodeNoise 的绘制偏移。
 * 理由：噪声只是视觉抖动，若参与算距离会把已经定好的手感与平衡值改掉
 *（例如 home→n2 = 510 秒这条回归基准）。渲染用偏移、算费用原始值，两者刻意分开。
 */
export function computeEdgeCost(fromId, toId, regionId) {
  const area = regionId || game.getCurrentArea();
  const key = `${area}|${fromId}|${toId}`;
  if (edgeCostCache.has(key)) return edgeCostCache.get(key);

  const a = getNode(fromId);
  const b = getNode(toId);
  if (!a || !b) return DEFAULT_TRAVEL_COST;

  const isMain = getMainRoads(area).some(([x, y]) => (x === fromId && y === toId) || (x === toId && y === fromId));
  const cost = Math.round(distance(a, b) * DISTANCE_TO_TIME_RATIO * (isMain ? 1 : SECONDARY_ROAD_PENALTY));

  edgeCostCache.set(key, cost);
  return cost;
}

/* ---------------- 节点间移动耗时（含 BFS 最短路） ---------------- */

/** 该区域里 from → to 是否有一条直接边 */
export function hasDirectEdge(regionId, fromId, toId) {
  return getEdges(regionId).some(
    (e) => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId),
  );
}

/**
 * 该区域的无向邻接表。
 * 传了 visited 就只保留【两端都已访问（已探明）】的边 —— 玩家只能沿已探明的路走。
 */
function buildAdjacency(regionId, visited = null) {
  const known = visited ? (visited instanceof Set ? visited : new Set(visited)) : null;
  const adj = new Map();
  for (const id of getNodeIds(regionId)) adj.set(id, []);
  for (const edge of getEdges(regionId)) {
    if (!adj.has(edge.from) || !adj.has(edge.to)) continue;
    if (known && (!known.has(edge.from) || !known.has(edge.to))) continue;
    adj.get(edge.from).push(edge.to);
    adj.get(edge.to).push(edge.from);
  }
  return adj;
}

/**
 * 本区域内「可点的已访问节点集合」。
 * 从 fromId（当前所在节点）出发，只在【两端都已访问＝已探明】的边构成的子图上做 DFS，
 * 能走到的已访问节点才算可点。
 *
 * 这条规则自然满足跨区域语义：
 *   - 玩家从哪个共享节点进来，那条边两端都已访问＝已探明，所以能原路退回
 *   - area1 里只要区域内已探明路径通到 home，home 就可点（不算绕路）
 *   - newarea2 里 home 虽然在节点列表里，但已探明路径通不过去，于是不可点
 *
 * @returns {Set<string>} 可达的已访问节点（不含 fromId 自身）
 */
export function reachableVisited(regionId, fromId, visited) {
  const known = visited instanceof Set ? visited : new Set(visited || []);
  const result = new Set();
  if (!fromId || !known.has(fromId)) return result;

  const adj = buildAdjacency(regionId, known);
  const seen = new Set([fromId]);
  const stack = [fromId];                        /* DFS：用什么顺序都行，只求可达集合 */

  while (stack.length) {
    const cur = stack.pop();
    for (const next of adj.get(cur) || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      result.add(next);
      stack.push(next);
    }
  }
  return result;
}

/**
 * BFS 求 from → to 的最短路径（按跳数），返回节点 id 数组（含首尾）；不可达返回 null。
 * 传了 visited 就只走已探明的边。广度优先保证跳数最少；同一层按邻接表顺序走，结果稳定。
 */
export function findShortestPath(regionId, fromId, toId, visited = null) {
  if (fromId === toId) return [fromId];

  const adj = buildAdjacency(regionId, visited);
  if (!adj.has(fromId) || !adj.has(toId)) return null;

  const prev = new Map([[fromId, null]]);
  const queue = [fromId];

  while (queue.length) {
    const cur = queue.shift();
    for (const next of adj.get(cur)) {
      if (prev.has(next)) continue;
      prev.set(next, cur);

      if (next === toId) {
        const path = [toId];
        let step = cur;
        while (step !== null) { path.unshift(step); step = prev.get(step); }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/**
 * 两个节点之间的移动耗时 —— 区域地图内移动与跨区域移动都走这个函数。
 *   有直接边      → 按那条边算（沿用 computeEdgeCost 的全部现有规则：
 *                    逻辑距离 × DISTANCE_TO_TIME_RATIO，支路再乘 SECONDARY_ROAD_PENALTY）
 *   没有直接边但连通 → BFS 求最短跳数，把沿途每一跳的边耗时累加起来（这就是绕路惩罚）
 *   不连通         → 返回 null，调用方必须据此拒绝移动
 *
 * 返回值 null 是一个明确的信号，不是 0：调用方不能把它当成“免费移动”。
 */
export function computeMoveCost(fromId, toId, regionId, visited = null) {
  const area = regionId || game.getCurrentArea();
  if (!fromId || !toId) return null;
  if (fromId === toId) return 0;

  /* 直接边：可能是通往「未访问菱形」的第一条边，那条边还没探明，所以先放行 */
  if (hasDirectEdge(area, fromId, toId)) return computeEdgeCost(fromId, toId, area);

  /* 其余一律只沿已探明的边（两端都已访问）走 */
  const known = visited || getVisitedIn(area);
  const path = findShortestPath(area, fromId, toId, known);
  if (!path) return null;

  let total = 0;
  for (let i = 0; i + 1 < path.length; i += 1) total += computeEdgeCost(path[i], path[i + 1], area);
  return total;
}

/* ---------------- 节点视觉尺寸自适应缩放 ---------------- */

const NODE_SCALE_REF = 6;      /* 揭示这么多节点时缩放系数正好是 1 */
const NODE_SCALE_MIN = 0.62;
const NODE_SCALE_MAX = 1.18;

/**
 * 节点视觉尺寸的缩放系数。
 *   揭示得越少 → 节点画得越大；揭示得越多 → 越小。
 *   取 s = sqrt(NODE_SCALE_REF / count)，于是「节点数 × 单个面积」≈ 常数，
 *   总占位面积大致不变；再夹到 [MIN, MAX] 免得极端情况过大或过小。
 *
 * 只缩放【视觉尺寸】，坐标（方位）一个都不动 —— 方位一致性不受影响。
 */
export function computeNodeScale(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return 1;
  const raw = Math.sqrt(NODE_SCALE_REF / n);
  return Math.min(NODE_SCALE_MAX, Math.max(NODE_SCALE_MIN, raw));
}

/* ---------------- 移动耗时（预览与实际共用同一份随机值） ---------------- */

const MOVE_JITTER = 0.1;                 /* 基础耗时上叠加 ±10% 随机 */
const moveDurationCache = new Map();     /* key = `${区域}|${起点}|${终点}` */

/** 走完一步或换了视图就丢掉缓存，下次悬浮会重新摇一次随机 */
export function clearMoveDurationCache() {
  moveDurationCache.clear();
}

/**
 * 计算「从 fromId 走到 toId」要花多久。
 *
 * @returns {{ seconds:number, base:number, display:string } | null}
 *   seconds —— 叠加 ±10% 随机后的整数秒（至少 1 秒）
 *   base    —— 未加随机的路径耗时（沿已探明路径逐跳累加）
 *   display —— HH:MM:SS
 *   不可达返回 null
 *
 * 同一个 (区域, 起点, 终点) 在缓存有效期内返回**同一个**结果：
 * 悬浮预览时先算并缓存，点击移动时直接复用，所以预览与实际绝不会各摇一次随机。
 */
export function calcMoveDuration(fromId, toId, regionId = null, visited = null) {
  const area = regionId || game.getCurrentArea();
  const key = `${area}|${fromId}|${toId}`;
  if (moveDurationCache.has(key)) return moveDurationCache.get(key);

  const base = computeMoveCost(fromId, toId, area, visited);
  if (base === null) return null;

  const factor = 1 + (Math.random() * 2 - 1) * MOVE_JITTER;
  const seconds = Math.max(1, Math.round(base * factor));
  const result = { seconds, base, display: formatDuration(seconds) };

  moveDurationCache.set(key, result);
  return result;
}

/* ---------------- 悬浮提示（预计耗时 + 到达时间） ---------------- */

let tipEl = null;
let tipFor = null;      /* 当前提示对应的目标节点 id：同一个目标只是跟着鼠标挪位置，不重建内容 */

function tipElement() {
  if (tipEl && tipEl.parentNode) return tipEl;
  const host = svgEl && svgEl.parentElement ? svgEl.parentElement : document.body;
  tipEl = document.createElement('div');
  tipEl.className = 'map-tip';
  tipEl.hidden = true;
  host.appendChild(tipEl);
  return tipEl;
}

export function hideTip() {
  tipFor = null;
  if (tipEl) tipEl.hidden = true;
}

/** 把提示摆到鼠标右下角；贴到视口边缘时翻到另一侧，保证整块提示都在屏幕内 */
function placeTip(el, event) {
  const pad = 14;
  let x = (event && event.clientX ? event.clientX : 0) + pad;
  let y = (event && event.clientY ? event.clientY : 0) + pad;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  const rect = vw && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
  if (rect) {
    if (x + rect.width > vw - 4) x = Math.max(4, x - rect.width - pad * 2);
    if (y + rect.height > vh - 4) y = Math.max(4, y - rect.height - pad * 2);
  }

  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

/**
 * 悬浮提示的内容。
 * 没电 + 黑暗地点（进不去）：一行 —— 「因为没电了，进不去。」（UI.tipDarkBlocked）
 * 没电 + 普通可点节点      ：一行 —— 「没电了，预测不了时间。」（UI.tipNoBattery）
 * 有电                    ：两行 —— 预计耗时 / 到达时间
 *   没有当前节点、或目标就是当前节点、或路径算不出来（不可达）→ 返回 null（不显示提示）
 * 「当前所在」与「已访问但走不到」的节点不会绑悬浮事件；没电的黑暗地点是例外：
 * 它不可点，但会绑事件，为的就是能解释一句为什么不能去（见 renderArea）。
 */
function buildTipLines(toId, regionId) {
  /* 黑暗地点 + 没电 → 专门那句「进不去」，要排在通用那句之前 */
  if (isNodeBlockedByDarkness(toId)) return [UI.tipDarkBlocked];
  if (game.getBattery() <= 0) return [UI.tipNoBattery];         /* 没电：连耗时也预测不了 */

  const from = currentNode;
  if (!from || from === toId) return null;

  const move = calcMoveDuration(from, toId, regionId);          /* 与点击时同一份缓存值 */
  if (!move) return null;

  const arrival = formatClock(game.getElapsedSeconds() + move.seconds);
  return [UI.tipDuration(move.display), UI.tipArrival(arrival)];
}

function showTip(event, toId, regionId) {
  const lines = buildTipLines(toId, regionId);
  if (!lines) { hideTip(); return; }

  const el = tipElement();
  /* 目标或内容变了才重建文字（没电两行变一行也要重建）；
     同一目标 + 同一内容只挪位置，避免 mousemove 反复改 DOM */
  const key = `${toId}|${lines.join('\u0001')}`;
  if (tipFor !== key) {
    tipFor = key;
    el.textContent = '';
    for (const text of lines) {
      const row = document.createElement('div');
      row.className = 'map-tip__line';
      row.textContent = text;
      el.appendChild(row);
    }
  }
  el.hidden = false;
  placeTip(el, event);
}

/* ===============================================================
   4. 渲染（大地图 / 区域地图）
   =============================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';

let svgEl = null;
let layers = null;
let nodeEls = new Map();
let edgeEls = [];
let regionEls = [];
let view = 'area';
let currentNode = null;
let onNodeClick = null;
let onRegionClick = null;

function svgNode(name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, name);
  for (const key of Object.keys(attrs)) el.setAttribute(key, String(attrs[key]));
  return el;
}

function clearLayers() {
  if (!svgEl) return;
  svgEl.textContent = '';
  layers = {
    roads: svgNode('g', { class: 'roads' }),
    nodes: svgNode('g', { class: 'nodes' }),
    regions: svgNode('g', { class: 'regions' }),
  };
  svgEl.append(layers.roads, layers.nodes, layers.regions);
  nodeEls = new Map();
  edgeEls = [];
  regionEls = [];
}

export function initMap(svg, handlers = {}) {
  svgEl = svg;
  onNodeClick = typeof handlers.onNodeClick === 'function' ? handlers.onNodeClick : null;
  onRegionClick = typeof handlers.onRegionClick === 'function' ? handlers.onRegionClick : null;
  if (!svgEl) return null;

  clearLayers();
  svgEl.addEventListener('click', handleClick);
  return setMapView(view);
}

/**
 * 大地图：每个区域一个块，规则与区域地图的节点完全一致。
 *   已解锁且访问过（该区域任一节点）→ 实心矩形块 + 区域名
 *   已解锁但没访问过               → 菱形，不显示名称
 *   未解锁                        → 完全不渲染
 * 区域通道：两端区域都可见才画，用粗线（.region-link）。
 */
function renderWorld() {
  /* 【机制】电量耗尽时大地图同样收缩：只显示当前区域与它直接相邻的区域块 */
  const noBattery = game.getBattery() <= 0;
  const currentArea = game.getCurrentArea();
  const inSight = (id) => !noBattery || id === currentArea || isAreaNeighbor(currentArea, id);

  const visible = new Set();
  for (const id of Object.keys(REGIONS)) {
    if (isAreaUnlocked(id) && inSight(id)) visible.add(id);
  }

  const drawnLinks = new Set();
  for (const id of visible) {
    for (const nb of getRegion(id).neighbors || []) {
      if (!visible.has(nb)) continue;                 /* 任一端不可见 → 整条通道不画 */
      const pairKey = [id, nb].sort().join('|');
      if (drawnLinks.has(pairKey)) continue;
      drawnLinks.add(pairKey);

      const ca = REGION_BOX[id];
      const cb = REGION_BOX[nb];
      if (!ca || !cb) continue;

      const x1 = ca.x + ca.w / 2;
      const y1 = ca.y + ca.h / 2;
      const x2 = cb.x + cb.w / 2;
      const y2 = cb.y + cb.h / 2;
      layers.roads.appendChild(svgNode('line', { class: 'region-link', x1, y1, x2, y2 }));

      /* 小标签：写清这条通道靠哪个共享节点连起来（名字取自 NODES，拼接格式在 texts.js） */
      const names = sharedNodes(id, nb).map((nid) => (getNode(nid) || {}).name).filter(Boolean);
      if (names.length) {
        const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
        /* 标签放进两块之间的空隙中点，避免压到区域块上：
           空隙 = [两块里较早结束的那一边, 两块里较晚开始的那一边] */
        const gapMid = (lo1, hi1, lo2, hi2) => {
          const gapStart = Math.min(hi1, hi2);
          const gapEnd = Math.max(lo1, lo2);
          return gapEnd > gapStart ? (gapStart + gapEnd) / 2 : (lo1 + hi1 + lo2 + hi2) / 4;
        };
        const lx = horizontal
          ? gapMid(ca.x, ca.x + ca.w, cb.x, cb.x + cb.w)
          : (x1 + x2) / 2 + 16;
        const ly = horizontal
          ? (y1 + y2) / 2 - 10
          : gapMid(ca.y, ca.y + ca.h, cb.y, cb.y + cb.h);

        const linkLabel = svgNode('text', { class: 'region-link-label', x: lx, y: ly });
        linkLabel.textContent = UI.mapRegionLink(names);
        layers.roads.appendChild(linkLabel);
      }
    }
  }

  for (const id of visible) {
    const region = getRegion(id);
    const box = REGION_BOX[id];
    if (!box) continue;

    const seen = game.getVisitedByArea(id).size > 0;
    const classes = ['region'];
    if (seen) classes.push('is-visited');
    else classes.push('is-open', 'is-unseen');
    if (id === game.getCurrentArea()) classes.push('is-current');
    /* 黑暗区域标识：区域里有 isDark 节点就叠一层（与区域地图上的节点标识同一套配色） */
    if (isDarkRegion(id)) classes.push('is-dark');

    const group = svgNode('g', { class: classes.join(' '), 'data-area': id });
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;

    group.appendChild(svgNode('rect', {
      class: 'region-rect', x: box.x, y: box.y, width: box.w, height: box.h,
    }));
    group.appendChild(svgNode('polygon', {
      class: 'region-diamond',
      points: `${cx},${cy - box.h / 2} ${cx + box.w / 2},${cy} ${cx},${cy + box.h / 2} ${cx - box.w / 2},${cy}`,
    }));
    const label = svgNode('text', { class: 'region-name', x: cx, y: cy + 8 });
    label.textContent = region.name;
    group.appendChild(label);

    /* 黑暗区域的小标签：放在区域名下面一行；未解锁时区域名被 CSS 藏起来，这个标签照常显示 */
    if (isDarkRegion(id)) {
      const darkTag = svgNode('text', { class: 'dark-tag', x: cx, y: cy + 30 });
      darkTag.textContent = UI.mapDarkTag;
      group.appendChild(darkTag);
    }

    layers.regions.appendChild(group);
    regionEls.push({ areaId: id, el: group });
  }
}

/** 区域地图：与之前一致的矩形/菱形/道路渲染，数据源换成 id 数组 */
function renderArea(regionId) {
  const region = getRegion(regionId);
  if (!region) return;

  /* 遍历的是 region.nodes 全量；访问状态用跨区域的 getVisitedIn，
     否则站在家里切进 area1 时本区域 Set 是空的，整个地图会什么都不画 */
  const visited = getVisitedIn(regionId);
  const here = currentNode;

  /* 已访问节点里，只有「沿已探明边（两端都已访问）能走到」的才可点 */
  const reachable = here ? reachableVisited(regionId, here, visited) : new Set(visited);

  /* 【正式机制 A】未访问节点只在与当前节点有直接边时才渲染为菱形，否则完全不渲染。
     这不是临时行为：它同时满足「看得见路就能走」与「不泄露没走过的地图结构」。
     玩家每次移动后 currentNode 变化，这一集合会随重新渲染自动重算。 */
  const noBattery = game.getBattery() <= 0;
  /* 【机制】电量耗尽时视野再收缩一层：只保留与当前节点有直接边的节点（当前节点自己当然要在） */
  const inSight = (id) => !noBattery || !here || id === here || hasDirectEdge(regionId, here, id);

  /* 五种状态；null = 不渲染
     darkblock（v1.8.8 新增）：没电时的黑暗地点 —— 看得见、不能去。
     它拿 is-blocked 的既有样式（灰 + 虚线 + 降透明），未访问时再叠 is-unseen 保留菱形，
     所以既不显示名字（不泄露没走过的地图），又明显区别于可点的琥珀菱形。 */
  const stateOf = (id) => {
    if (!inSight(id)) return null;                      /* 没电被隐藏：不可点，也没有悬浮提示 */
    if (here && id === here) return 'current';          /* 当前位置：有标识，不参与可点性判断 */
    if (isNodeBlockedByDarkness(id)) return 'darkblock';
    if (visited.has(id)) return reachable.has(id) ? 'visited' : 'blocked';
    /* 【正式机制 A】未访问：只有与当前节点直接相邻才显示菱形；没有当前节点时退回旧规则 */
    if (!here) return computeClickable(regionId, visited).has(id) ? 'unseen' : null;
    return hasDirectEdge(regionId, here, id) ? 'unseen' : null;
  };

  const states = new Map();
  let revealed = 0;
  for (const id of region.nodes) {
    const st = stateOf(id);
    if (st) revealed += 1;
    states.set(id, st);
  }

  /* 视觉尺寸自适应缩放：只缩放尺寸，坐标（方位）一个都不动 */
  const scale = computeNodeScale(revealed);
  const w = NODE_W * scale;
  const h = NODE_H * scale;
  const d = w / 2;
  const nameSize = Math.max(11, Math.round(26 * scale));    /* 文字跟着缩，但有下限保证可读 */
  const hereSize = Math.max(10, Math.round(11 * scale));
  if (svgEl && svgEl.style && typeof svgEl.style.setProperty === 'function') {
    svgEl.style.setProperty('--node-scale', String(scale));
  }

  /* 边：两端都渲染出来才画 */
  for (const edge of getEdges(regionId)) {
    if (!states.get(edge.from) || !states.get(edge.to)) continue;
    if (!states.has(edge.from) || !states.has(edge.to)) continue;

    const a = getNode(edge.from);
    const b = getNode(edge.to);
    if (!a || !b) continue;
    const pa = drawPos(a, regionId);
    const pb = drawPos(b, regionId);
    const line = svgNode('line', { class: 'road', x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y });
    layers.roads.appendChild(line);
    edgeEls.push({ from: edge.from, to: edge.to, el: line });
  }

  for (const id of region.nodes) {
    const st = states.get(id);
    if (!st) continue;

    const node = getNode(id);
    if (!node) continue;

    const classes = ['node'];
    if (st === 'current') classes.push('is-visited', 'is-current');
    else if (st === 'visited') classes.push('is-visited');
    else if (st === 'blocked') classes.push('is-blocked');
    else if (st === 'darkblock') {
      /* 没电的黑暗地点：已访问过就画实心块（名字本来就认识），没访问过保留菱形但不给 pointer 光标 */
      if (visited.has(id)) classes.push('is-visited', 'is-blocked');
      else classes.push('is-unseen', 'is-blocked');
    } else classes.push('is-open', 'is-unseen');
    /* 黑暗地点标识：独立于上面那几种状态再叠一层（底色 + 紫色描边 + 名字下方的小标签），
       所以「已访问 / 未访问 / 当前 / 走不到 / 没电进不去」五种状态下都认得出来 */
    if (node.isDark) classes.push('is-dark');

    const group = svgNode('g', { class: classes.join(' '), 'data-id': id });
    const p = drawPos(node, regionId);       /* 绘制坐标 = 该区域的视觉坐标 + 固定噪声 */

    group.appendChild(svgNode('rect', {
      class: 'node-rect',
      x: p.x - d, y: p.y - h / 2, width: w, height: h,
    }));
    group.appendChild(svgNode('polygon', {
      class: 'node-diamond',
      points: `${p.x},${p.y - d} ${p.x + d},${p.y} ${p.x},${p.y + d} ${p.x - d},${p.y}`,
    }));
    const label = svgNode('text', {
      class: 'node-name', x: p.x, y: p.y + 9, style: `font-size:${nameSize}px`,
    });
    label.textContent = node.name;
    group.appendChild(label);

    /* 当前所在节点：名字下方再加一行「你在这里」；描边加粗由 CSS 的 .is-current 负责 */
    if (st === 'current') {
      const hereEl = svgNode('text', {
        class: 'node-here', x: p.x, y: p.y + h / 2 + 16, style: `font-size:${hereSize}px`,
      });
      hereEl.textContent = UI.mapHere;
      group.appendChild(hereEl);
    }

    /* 黑暗地点的小标签：放在「你在这里」下面一行，避免两者叠在一起。
       未访问时节点名被 CSS 藏起来，但这个标签照常显示 —— 它不泄露名字，只说明这里很黑。 */
    if (node.isDark) {
      const darkTag = svgNode('text', {
        class: 'dark-tag',
        x: p.x,
        y: p.y + h / 2 + (st === 'current' ? 30 : 16),
        style: `font-size:${hereSize}px`,
      });
      darkTag.textContent = UI.mapDarkTag;
      group.appendChild(darkTag);
    }

    layers.nodes.appendChild(group);
    nodeEls.set(id, group);

    /* 悬浮提示只给可点节点（visited / unseen）。
       darkblock 是唯一例外：它不可点，但绑上事件只为了说清楚「没电了，预测不了时间。」
       （buildTipLines 在没电时返回那一行，所以这里不需要额外分支）。
       blocked（已访问但走不到）与 current（当前所在）依旧不绑。 */
    if (st === 'visited' || st === 'unseen' || st === 'darkblock') {
      group.addEventListener('mouseenter', (ev) => showTip(ev, id, regionId));
      group.addEventListener('mousemove', (ev) => showTip(ev, id, regionId));
      group.addEventListener('mouseleave', hideTip);
    }
  }
}

export function setMapView(next) {
  view = next === 'world' ? 'world' : 'area';
  clearMoveDurationCache();          /* 换了视图 → 预览缓存作废，下次悬浮重新摇随机 */
  if (!svgEl) return view;
  hideTip();

  clearLayers();
  if (view === 'world') renderWorld();
  else renderArea(game.getCurrentArea());
  return view;
}

export function getMapView() {
  return view;
}

/** main.js 在状态变化后重画（沿用旧调用名） */
export function refreshMap(snapshot = {}) {
  if (snapshot && snapshot.current !== undefined) currentNode = snapshot.current;
  return setMapView(view);
}

function handleClick(event) {
  const target = event.target;
  if (!target || !target.closest) return;

  const nodeGroup = target.closest('.node');
  if (nodeGroup && onNodeClick) {
    const id = nodeGroup.dataset.id;
    if (id && id !== currentNode) onNodeClick(id);
    return;
  }

  const regionGroup = target.closest('.region');
  if (regionGroup && onRegionClick) onRegionClick(regionGroup.dataset.area);
}

/* ===============================================================
   5. 区域解锁
   =============================================================== */

/**
 * 区域解锁 = 数据里的初始 unlocked 标记，或【访问过该区域任一节点】。
 * area1 的初始标记是 true：否则开局访问数为 0，area1 在大地图上根本不会渲染，
 * 玩家就没有入口从「家」区域走到 area1。
 */
export function isAreaUnlocked(regionId) {
  const region = getRegion(regionId);
  if (!region) return false;
  return Boolean(region.unlocked) || game.getVisitedByArea(regionId).size > 0;
}

export function unlockedAreas() {
  const set = new Set();
  for (const id of Object.keys(REGIONS)) {
    if (isAreaUnlocked(id)) set.add(id);
  }
  return set;
}
