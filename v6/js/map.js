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

import { SCENES } from './texts.js';
import { DEFAULT_TRAVEL_COST, DISTANCE_TO_TIME_RATIO, SECONDARY_ROAD_PENALTY } from './config.js';
import * as game from './state.js';

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
function defNode(id, x, y, items, mustResolve) {
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
    neighbors: ['area1'],
    primaryShelter: 'home',
    unlocked: true,
  },

  area1: {
    id: 'area1',
    name: '荒原',
    type: 'region',
    nodes: ['home', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'lighthouse'],
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
    ],
    mainRoads: [['home', 'n2'], ['n2', 'n5'], ['n5', 'n7'], ['n7', 'lighthouse']],
    neighbors: ['home', 'area2'],
    primaryShelter: 'home',
    unlocked: true,
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

/** 区域在大地图上的摆放 */
const REGION_BOX = {
  home: { x: 60, y: 200, w: 200, h: 200 },
  area1: { x: 320, y: 120, w: 400, h: 360 },
  area2: { x: 780, y: 120, w: 180, h: 360 },
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

/** b 是否在 a 的 neighbors 里（单向查即可，数据里是双向声明的） */
export function isAreaNeighbor(areaA, areaB) {
  const region = getRegion(areaA);
  return Boolean(region) && (region.neighbors || []).includes(areaB);
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

/** 节点实际绘制坐标 = 原始坐标 + 噪声，再夹回画布内（否则贴边节点会被 viewBox 裁掉） */
function drawPos(node) {
  const { dx, dy } = getNodeNoise(node.id);
  const halfW = NODE_W / 2;
  const halfH = NODE_H / 2;
  return {
    x: Math.min(VIEW.w - halfW, Math.max(halfW, node.x + dx)),
    y: Math.min(VIEW.h - halfH, Math.max(halfH, node.y + dy)),
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
  const visible = new Set();
  for (const id of Object.keys(REGIONS)) {
    if (isAreaUnlocked(id)) visible.add(id);
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
      layers.roads.appendChild(svgNode('line', {
        class: 'region-link',
        x1: ca.x + ca.w / 2, y1: ca.y + ca.h / 2,
        x2: cb.x + cb.w / 2, y2: cb.y + cb.h / 2,
      }));
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
  const clickable = computeClickable(regionId, visited);

  /* 可见 = 已访问 或 可点击；边只有在两端都可见时才画 */
  const visible = new Set();
  for (const id of region.nodes) {
    if (visited.has(id) || clickable.has(id)) visible.add(id);
  }

  for (const edge of getEdges(regionId)) {
    if (!visible.has(edge.from) || !visible.has(edge.to)) continue;   /* 任一端不可见 → 不渲染 */

    const a = getNode(edge.from);
    const b = getNode(edge.to);
    if (!a || !b) continue;
    const pa = drawPos(a);
    const pb = drawPos(b);
    const line = svgNode('line', { class: 'road', x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y });
    layers.roads.appendChild(line);
    edgeEls.push({ from: edge.from, to: edge.to, el: line });
  }

  for (const id of region.nodes) {
    const node = getNode(id);
    if (!node) continue;

    const seen = visited.has(id);
    const open = clickable.has(id);
    if (!seen && !open) continue;            /* 未访问且不可点：完全不渲染 */

    const classes = ['node'];
    if (seen) classes.push('is-visited');
    else classes.push('is-open', 'is-unseen');
    if (id === currentNode) classes.push('is-current');

    const group = svgNode('g', { class: classes.join(' '), 'data-id': id });
    const d = NODE_W / 2;
    const p = drawPos(node);                 /* 绘制坐标 = 原始坐标 + 固定噪声 */

    group.appendChild(svgNode('rect', {
      class: 'node-rect',
      x: p.x - d, y: p.y - NODE_H / 2, width: NODE_W, height: NODE_H,
    }));
    group.appendChild(svgNode('polygon', {
      class: 'node-diamond',
      points: `${p.x},${p.y - d} ${p.x + d},${p.y} ${p.x},${p.y + d} ${p.x - d},${p.y}`,
    }));
    const label = svgNode('text', { class: 'node-name', x: p.x, y: p.y + 9 });
    label.textContent = node.name;
    group.appendChild(label);

    layers.nodes.appendChild(group);
    nodeEls.set(id, group);
  }
}

export function setMapView(next) {
  view = next === 'world' ? 'world' : 'area';
  if (!svgEl) return view;

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
