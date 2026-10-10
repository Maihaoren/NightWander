/**
 * map.js —— 多区域地图（数据 + SVG 绘制 + 点击回调）
 * 数据源是 REGIONS；对外提供 getRegion / getCurrentRegion / getNode /
 * getCrossRegionTarget / isShelter / isPrimaryShelter / computeEdgeCost 等。
 * 不判断游戏规则，不操作终端。
 */

import { SCENES, UI } from './texts.js';
import {
  DEFAULT_TRAVEL_COST, DISTANCE_TO_TIME_RATIO, SECONDARY_ROAD_PENALTY, CROSS_REGION_COST_SEC,
} from './config.js';
import * as game from './state.js';

export const VIEW = { w: 1000, h: 600 };
export const NODE_W = 130;
export const NODE_H = 56;
export const HOME_ID = 'home';

/* 自动追加到安全屋的存档选项 */
const SAVE_OPTIONS = [
  { id: 'save_export', text: UI.exportSave, repeatable: true, timeCost: 0, batteryCost: 0, save: 'export' },
  { id: 'save_import', text: UI.importSave, repeatable: true, timeCost: 0, batteryCost: 0, save: 'import' },
];

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

function makeNode(areaId, id, x, y, scene, items) {
  const options = scene.options.map((o) => {
    const rule = (REQUIRES[id] || {})[o.text];
    return rule ? { ...o, requires: rule.check, requiresHint: rule.hint } : { ...o };
  });
  return {
    id, areaId, x, y,
    name: scene.name, desc: scene.desc, ascii: scene.ascii, altAscii: scene.altAscii,
    items: items || [], options,
  };
}

/* ===============================================================
   1. 区域数据
   =============================================================== */

export const REGIONS = {
  area1: {
    id: 'area1',
    name: '家与灯塔',
    entranceNode: null,          /* 起始区域，没有入口 */
    exitNode: 'southgate',       /* 通往 area2 的节点 */
    primaryShelter: 'home',      /* 强制回家送达地 */
    shelters: ['home', 'lighthouse'],
    mainRoads: [['home', 'n2'], ['n2', 'n5'], ['n5', 'n7'], ['n7', 'lighthouse']],
    nodes: [
      makeNode('area1', 'home', 80, 300, SCENES.home, []),
      makeNode('area1', 'n1', 250, 100, SCENES.n1, ['flashlight']),
      makeNode('area1', 'n2', 250, 300, SCENES.n2, ['torch']),
      makeNode('area1', 'n3', 250, 500, SCENES.n3, []),
      makeNode('area1', 'n4', 450, 100, SCENES.n4, []),
      makeNode('area1', 'n5', 450, 300, SCENES.n5, []),
      makeNode('area1', 'n6', 450, 500, SCENES.n6, []),
      makeNode('area1', 'n7', 650, 300, SCENES.n7, []),
      makeNode('area1', 'lighthouse', 800, 300, SCENES.lighthouse, ['pocketwatch']),
      makeNode('area1', 'southgate', 920, 300, SCENES.southgate, []),
    ],
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
      { from: 'lighthouse', to: 'southgate' },
      { from: 'southgate', to: 'area2:entrance', crossRegion: true, timeCost: CROSS_REGION_COST_SEC },
    ],
  },

  area2: {
    id: 'area2',
    name: '未知地域',
    entranceNode: 'entrance',
    exitNode: null,
    primaryShelter: 'entrance',
    shelters: ['entrance'],
    mainRoads: [['entrance', 'm1'], ['m1', 'm2'], ['m2', 'm3'], ['m3', 'goal2']],
    nodes: [
      makeNode('area2', 'entrance', 80, 300, SCENES.entrance, []),
      makeNode('area2', 'm1', 250, 200, SCENES.m1, []),
      makeNode('area2', 'm2', 450, 300, SCENES.m2, []),
      makeNode('area2', 'm3', 650, 200, SCENES.m3, []),
      makeNode('area2', 'goal2', 800, 300, SCENES.goal2, []),
    ],
    edges: [
      { from: 'entrance', to: 'm1' },
      { from: 'm1', to: 'm2' },
      { from: 'm2', to: 'm3' },
      { from: 'm3', to: 'goal2' },
    ],
  },
};

/** 区域在大地图上的摆放 */
const REGION_BOX = {
  area1: { x: 80, y: 120, w: 560, h: 360 },
  area2: { x: 760, y: 120, w: 200, h: 360 },
};

/** 大地图上的区域通道 */
const REGION_LINKS = [['area1', 'area2']];

/* ===============================================================
   2. 查询接口
   =============================================================== */

export function getRegion(areaId) {
  return REGIONS[areaId] || null;
}

export function getCurrentRegion() {
  return getRegion(game.state.currentArea) || REGIONS.area1;
}

/** getNode(nodeId) 查当前区域；也支持 getNode('area2:m1') 与 getNode(areaId, nodeId) */
export function getNode(areaId, nodeId) {
  if (nodeId === undefined) {
    const raw = String(areaId);
    if (raw.includes(':')) {
      const parts = raw.split(':');
      return getNode(parts[0], parts[1]);
    }
    return getNode(game.state.currentArea, raw);
  }
  const region = getRegion(areaId);
  if (!region) return null;
  return region.nodes.find((n) => n.id === nodeId) || null;
}

export function getNodes(areaId) {
  const region = getRegion(areaId);
  return region ? region.nodes : [];
}

export function getEdges(areaId) {
  const region = getRegion(areaId);
  return region ? region.edges : [];
}

/** 该节点若有跨区域边，返回 { areaId, nodeId } */
export function getCrossRegionTarget(nodeId, areaId) {
  const area = areaId || game.state.currentArea;
  for (const edge of getEdges(area)) {
    if (!edge.crossRegion) continue;
    const target = edge.from === nodeId ? edge.to : (edge.to === nodeId ? edge.from : null);
    if (!target) continue;
    const parts = target.split(':');
    return { areaId: parts[0], nodeId: parts[1] };
  }
  return null;
}

export function isShelter(areaId, nodeId) {
  const region = getRegion(areaId);
  return Boolean(region) && region.shelters.includes(nodeId);
}

export function isPrimaryShelter(areaId, nodeId) {
  const region = getRegion(areaId);
  return Boolean(region) && region.primaryShelter === nodeId;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 可点击判定：节点【已访问】，或【与任一已访问节点有边相连】。
 * 不用距离阈值 —— 有连线就能走，避免“看得见路却点不动”。
 */
export function computeClickable(areaId, visited) {
  const known = visited instanceof Set ? visited : new Set(visited || []);
  const result = new Set();

  for (const node of getNodes(areaId)) {
    if (known.has(node.id)) result.add(node.id);
  }
  for (const edge of getEdges(areaId)) {
    if (known.has(edge.from)) result.add(edge.to);
    if (known.has(edge.to)) result.add(edge.from);
  }
  return result;
}

const edgeCostCache = new Map();

/**
 * 边耗时：跨区域边用 edges 里写死的 timeCost（缺省 CROSS_REGION_COST_SEC）；
 * 同区域边 = 逻辑距离 × DISTANCE_TO_TIME_RATIO（支路再乘 SECONDARY_ROAD_PENALTY）。
 */
export function computeEdgeCost(fromId, toId, areaId) {
  const area = areaId || game.state.currentArea;
  const key = `${area}|${fromId}|${toId}`;
  if (edgeCostCache.has(key)) return edgeCostCache.get(key);

  const a = getNode(area, fromId);
  const b = getNode(area, toId);
  if (!a || !b) return DEFAULT_TRAVEL_COST;

  const edge = getEdges(area).find((e) => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId));
  let cost;
  if (edge && edge.crossRegion) {
    cost = Math.round(edge.timeCost || CROSS_REGION_COST_SEC);
  } else {
    const mainRoads = getRegion(area).mainRoads || [];
    const isMain = mainRoads.some(([x, y]) => (x === fromId && y === toId) || (x === toId && y === fromId));
    cost = Math.round(distance(a, b) * DISTANCE_TO_TIME_RATIO * (isMain ? 1 : SECONDARY_ROAD_PENALTY));
  }
  edgeCostCache.set(key, cost);
  return cost;
}

/* ===============================================================
   3. 渲染（大地图 / 区域地图）
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

/** 大地图：已解锁区域画成矩形块（区域名、当前区域高亮、粗线通道）；未解锁不渲染 */
function renderWorld() {
  const unlocked = unlockedAreas();

  for (const areaId of Object.keys(REGIONS)) {
    if (!unlocked.has(areaId)) continue;
    const box = REGION_BOX[areaId];
    const group = svgNode('g', {
      class: 'region' + (areaId === game.state.currentArea ? ' is-current' : ''),
      'data-area': areaId,
    });

    group.appendChild(svgNode('rect', {
      class: 'region-block', x: box.x, y: box.y, width: box.w, height: box.h,
    }));
    const label = svgNode('text', { class: 'region-name', x: box.x + box.w / 2, y: box.y + box.h / 2 + 8 });
    label.textContent = REGIONS[areaId].name;
    group.appendChild(label);

    layers.regions.appendChild(group);
    regionEls.push({ areaId, el: group });
  }

  for (const link of REGION_LINKS) {
    if (!unlocked.has(link[0]) || !unlocked.has(link[1])) continue;
    const ca = REGION_BOX[link[0]];
    const cb = REGION_BOX[link[1]];
    layers.roads.appendChild(svgNode('line', {
      class: 'region-link',
      x1: ca.x + ca.w, y1: ca.y + ca.h / 2,
      x2: cb.x, y2: cb.y + cb.h / 2,
    }));
  }
}

/** 区域地图：沿用矩形/菱形/道路渲染，数据源是当前区域 */
function renderArea(areaId) {
  const region = getRegion(areaId);
  if (!region) return;

  const visited = game.getVisitedByArea(areaId);
  const clickable = computeClickable(areaId, visited);

  for (const edge of region.edges) {
    const a = getNode(areaId, edge.from);
    const b = getNode(areaId, edge.to);
    if (!a || !b) continue;
    const line = svgNode('line', {
      class: 'road' + (edge.crossRegion ? ' road--cross' : ''),
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
    });
    layers.roads.appendChild(line);
    edgeEls.push({ from: edge.from, to: edge.to, el: line });
  }

  for (const node of region.nodes) {
    const seen = visited.has(node.id);
    const open = clickable.has(node.id);
    if (!seen && !open) continue;            /* 未访问且不可点：完全不渲染 */

    const classes = ['node'];
    if (seen) classes.push('is-visited');
    else classes.push('is-open', 'is-unseen');
    if (node.id === currentNode) classes.push('is-current');

    const group = svgNode('g', { class: classes.join(' '), 'data-id': node.id });
    const d = NODE_W / 2;

    group.appendChild(svgNode('rect', {
      class: 'node-rect',
      x: node.x - d, y: node.y - NODE_H / 2, width: NODE_W, height: NODE_H,
    }));
    group.appendChild(svgNode('polygon', {
      class: 'node-diamond',
      points: `${node.x},${node.y - d} ${node.x + d},${node.y} ${node.x},${node.y + d} ${node.x - d},${node.y}`,
    }));
    const label = svgNode('text', { class: 'node-name', x: node.x, y: node.y + 9 });
    label.textContent = node.name;
    group.appendChild(label);

    layers.nodes.appendChild(group);
    nodeEls.set(node.id, group);
  }
}

export function setMapView(next) {
  view = next === 'world' ? 'world' : 'area';
  if (!svgEl) return view;

  clearLayers();
  if (view === 'world') renderWorld();
  else renderArea(game.state.currentArea);
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
   4. 区域解锁
   =============================================================== */

/** 玩家访问过该区域任一节点即解锁 */
export function unlockedAreas() {
  const set = new Set();
  for (const areaId of Object.keys(REGIONS)) {
    if (game.getVisitedByArea(areaId).size > 0) set.add(areaId);
  }
  if (set.size === 0) set.add('area1');
  return set;
}

export function isAreaUnlocked(areaId) {
  return unlockedAreas().has(areaId);
}
