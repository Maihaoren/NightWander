/**
 * map.js —— 多区域地图（数据 + SVG 绘制 + 点击回调）
 *
 * 数据模型：
 *   NODES   —— 全局节点字典，以 id 为键。节点 id 全局唯一，不重复。
 *   REGIONS —— 区域字典，用 nodes: string[] 引用 NODES 里的 id。
 *
 * 区域之间靠【共享节点】连通，不再有「跨区域边」，所以切区域不消耗体力与时间。
 *
 * 【v1.9.0b1 现状】7 个区域全部注册，但只落地了 2 个：
 *   giantwall 巨墙   —— wallfoot + wallgate（墙门是共享节点）
 *   wasteland 废城   —— home + 19 个普通地点 + 4 个接口（wallgate / northgate /
 *                       eastgate / southgate）
 *   其余 5 个（wilderness 荒野 / industry 工业区 / coast 东海岸 / dock 码头 /
 *   island 孤岛）是**占位**：placeholder: true，nodes 里只放那个共享接口节点、
 *   edges 为空、primaryShelter 为 null，等 b2 / b3 / b4 落地。
 *
 * 区域内部用细线（.road），区域之间用粗线（.region-link），
 * 接口节点朝外还有一根「延伸白线」（.road .region-spoke，见改动 6）。
 * 本模块不判断游戏规则，不操作终端。
 */

import { SCENES, UI, EXCHANGES } from './texts.js';
import { DEFAULT_TRAVEL_COST, DISTANCE_TO_TIME_RATIO, SECONDARY_ROAD_PENALTY } from './config.js';
import * as game from './state.js';
import { formatDuration, formatClock } from './timeSystem.js';

/**
 * 地图画布尺寸。
 *
 * v1.9.0b1.1：画布整体 ×1.25（1000×600 → 1250×750），并把节点的【绘制】位置按同一系数摊开。
 * 关键点：节点框（NODE_W/NODE_H）与噪声（NOISE_RANGE）**一个都没动**，
 * 所以「节点尺寸 : 节点间距」变小，24 个节点挤在一起的重叠就消失了
 * （实测最近一对 station↔subway 的最小余量从 -2.6 变成 +14.9）。
 *
 * 为什么不是「把节点坐标乘 1.25 再算耗时也乘 1.25」：那样移动耗时会跟着放大 1.25 倍，
 * 和 v1.9.0b1.1 改动 3 要的「×1.5」叠在一起就变成了 ×1.875 —— 手感会失控。
 * 这里只在【绘制】时摊开（见 drawPos），NODES 里的 x/y 仍是算耗时的唯一依据，
 * 所以地图变大不影响任何数值。
 */
const DRAW_SCALE = 1.25;
export const VIEW = { w: Math.round(1000 * DRAW_SCALE), h: Math.round(600 * DRAW_SCALE) };
export const NODE_W = 130;
export const NODE_H = 56;
export const HOME_ID = 'home';
export const START_AREA = 'wasteland';          /* 开局所在区域（家就在废城里） */

/* 选项前置条件（requires(state) === false 时按钮灰着并显示 requiresHint）。
   v1.9.0b1：旧规则挂在 n3 / n5 上，那两个节点随旧地图一起删了，所以本表暂时为空 ——
   机制原样保留，以后挂选项时往这里补即可。 */
const REQUIRES = {};

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
       接口节点（墙门 / 北关 / 东关 / 南关）也就不需要任何特例。 */
    isDark: Boolean(isDark),
  };
}

/* ===============================================================
   1. 节点字典（全局唯一 id）—— v1.9.0b1 共 25 个
   ---------------------------------------------------------------
   坐标是「逻辑坐标」，直接参与 computeEdgeCost 的距离计算，
   绘制时再叠加 getNodeNoise() 的固定伪随机偏移（沿用既有机制，没有手写噪声）。
   家与巨墙在东侧 / 西侧的对齐、四个接口贴边，都是为了让延伸白线指向正确的边框。
   =============================================================== */

export const NODES = {
  /* ---- 巨墙 giantwall（2 个） ---- */
  wallfoot: defNode('wallfoot', 350, 300, []),            /* 墙根：无任何交互 */
  wallgate: defNode('wallgate', 95, 170, []),             /* 共享：巨墙 ↔ 废城，也是巨墙的主安全屋 */

  /* ---- 废城 wasteland（24 个 = 家 1 + 普通 19 + 接口 4） ---- */
  home: defNode('home', 95, 300, []),                     /* 唯一回电点，储物箱里有罐头 / 大衣 / 牛仔裤 + 日记 / README */

  /* 四个接口（共享节点）：各自贴着自己那一侧的边框 */
  northgate: defNode('northgate', 850, 50, []),           /* 北 → 荒野（占位，b3 落地） */
  eastgate: defNode('eastgate', 930, 300, []),            /* 东 → 东海岸（占位，b2 落地） */
  southgate: defNode('southgate', 700, 560, []),          /* 南 → 工业区（占位，b2 落地） */

  /* 19 个普通地点 */
  plaza: defNode('plaza', 270, 300, []),
  apartment: defNode('apartment', 200, 215, []),
  gasstation: defNode('gasstation', 185, 85, []),
  hospital: defNode('hospital', 300, 110, []),
  brokenbridge: defNode('brokenbridge', 395, 395, ['pocketwatch']),  /* 怀表放在这里（本块只落地放置点） */
  sewer: defNode('sewer', 195, 420, []),
  station: defNode('station', 700, 300, []),
  school: defNode('school', 470, 145, []),
  library: defNode('library', 590, 110, []),
  church: defNode('church', 700, 90, []),
  factoryold: defNode('factoryold', 270, 505, []),
  warehouse: defNode('warehouse', 420, 545, []),
  subway: defNode('subway', 620, 230, []),
  park: defNode('park', 370, 205, []),
  parking: defNode('parking', 690, 425, []),
  watertower: defNode('watertower', 790, 215, []),
  substation: defNode('substation', 540, 520, []),
  dump: defNode('dump', 520, 400, []),
  mall: defNode('mall', 470, 300, []),

  /* ---- 工业区 industry（v1.9.0b2 落地，15 个） ---- */
  powerplant: defNode('powerplant', 500, 540, []),         /* 共享：工业区 ↔ 孤岛；在这里过夜会充一部分电 */
  steelmill: defNode('steelmill', 740, 265, []),
  chimney: defNode('chimney', 185, 360, []),
  freight: defNode('freight', 640, 150, ['cannedfood']),
  oiltank: defNode('oiltank', 240, 245, []),
  railway: defNode('railway', 360, 150, ['ironkey']),
  coolingtower: defNode('coolingtower', 300, 465, []),
  boilerroom: defNode('boilerroom', 870, 195, []),
  pipezone: defNode('pipezone', 865, 345, []),
  assembly: defNode('assembly', 630, 385, []),
  lab: defNode('lab', 395, 285, ['capacitor']),
  canteen: defNode('canteen', 490, 185, ['cannedfood']),
  materialyard: defNode('materialyard', 860, 105, []),
  wastewater: defNode('wastewater', 145, 480, []),

  /* ---- 东海岸 coast（v1.9.0b2 落地，10 个） ---- */
  dockgate: defNode('dockgate', 940, 300, []),             /* 共享：东海岸 ↔ 码头（码头 b4 落地） */
  beach: defNode('beach', 350, 160, []),
  breakwater: defNode('breakwater', 520, 140, []),
  fishingvillage: defNode('fishingvillage', 210, 420, ['cannedfood']),
  rockybeach: defNode('rockybeach', 370, 470, []),
  seacave: defNode('seacave', 540, 490, ['ferrykey']),
  shipyard: defNode('shipyard', 720, 440, ['charger']),
  observationdeck: defNode('observationdeck', 700, 180, []),
  coastalroad: defNode('coastalroad', 200, 200, []),

  /* ---- 荒野 wilderness（v1.9.0b3 落地，7 个内部节点） ----
     入口是共享节点 northgate（北关，坐标在废城那一组里：850,50 = 废城北缘）。
     除了驿站，6 个内部节点全部 isDark —— 这是黑暗机制的第一批启用点：
     身处其中电量 2% + 1% = 3%/游戏小时，没电进不去，在里面掉到 0 会断电回家。
     禁区 jinqu 还额外带一个「解锁前完全不渲染」的门槛（见 LOCKED_NODES）。 */
  yizhan: defNode('yizhan', 500, 400, []),                            /* 驿站：荒野入口 + 主安全屋（不黑暗） */
  xiaoshulin: defNode('xiaoshulin', 500, 260, [], false, true),       /* 小树林 */
  senlin: defNode('senlin', 330, 190, [], false, true),               /* 森林 */
  senlinshenchu: defNode('senlinshenchu', 200, 150, [], false, true), /* 森林深处（解锁门槛之一） */
  jinqu: defNode('jinqu', 95, 60, ['goldenkey'], false, true),        /* 禁区：金钥匙放这儿 */
  zhaoze: defNode('zhaoze', 760, 230, [], false, true),               /* 沼泽 */
  zhaozeshenchu: defNode('zhaozeshenchu', 880, 110, [], false, true), /* 沼泽深处（解锁门槛之一） */
};

/* ===============================================================
   1.6 节点级解锁门槛（v1.9.0b3 改动 3）
   ---------------------------------------------------------------
   禁区 jinqu 一开始完全不渲染，也不可进入；等【森林深处】与【沼泽深处】都到达过，
   它才按机制 A 正常参与渲染（相邻当前节点 → 菱形；不相邻 → 仍不渲染）。

   实现：解锁状态**完全由已访问集合推导**（visitedByArea 已经在存档里），
   所以不新增任何存档字段 —— 读档后门槛状态自动恢复（见 saveSystem 的 v4 字段表）。
   一旦满足就永久保持（visited 只增不减，所以天然不回退）。

   判定挂在 renderArea 的 stateOf() 里：未解锁的节点直接不渲染（当前节点自己例外，
   免得 debug 传送过去之后地图上没有自己这一格）。
   =============================================================== */
const LOCKED_NODES = {
  jinqu: ['senlinshenchu', 'zhaozeshenchu'],
};

/** 该节点是否已经解锁（没有门槛的节点恒为 true） */
export function isNodeUnlocked(nodeId) {
  const need = LOCKED_NODES[nodeId];
  if (!need) return true;
  return need.every((id) => isNodeVisited(id));
}

/** 还没解锁的节点 id 列表 —— main.js 用它比较「这一趟有没有新解锁了什么」 */
export function lockedNodeIds() {
  return Object.keys(LOCKED_NODES).filter((id) => !isNodeUnlocked(id));
}

/* ===============================================================
   1.5 地点资源交换的分配（v1.9.0b2 新增；v1.9.0b2.1 补齐废城 + 改成到达自动弹）
   ---------------------------------------------------------------
   分配口径：对【所有没有物品奖励的地点和安全屋】按比例给
     2/5 时间 ↔ 资源、1/5 资源 ↔ 资源、2/5 无交互（允许 ±1 浮动把整数凑好看）。

   废城（v1.9.0b2.1 改动 1 新补）：24 个节点里只有「断桥」有怀表，其余 23 个都算：
     2/5 × 23 = 9.2 →  9  （时间 ↔ 资源）
     1/5 × 23 = 4.6 →  5  （资源 ↔ 资源）
     2/5 × 23 = 9.2 →  9  （无交互）
   工业区（11 个无物品）与东海岸（7 个无物品）b2 已经按规则分过，
   只补上当时漏掉的 4 个共享接口里的两个（保持各区域比例不变）：
     工业区 11 个 → 目标 4 时间 + 2 资源 + 5 无 → 原 4/1/6，补 1 个资源（南关）
     东海岸  7 个 → 目标 3 时间 + 1~2 资源 + 2~3 无 → 原 2/2/3，补 1 个时间（东关）
     发电厂 / 码头关按比例归入「无交互」。
   荒野（v1.9.0b3 改动 6）：无物品地点 5 个（禁区有金钥匙、驿站是安全屋、北关是共享节点，
     三者都不计入）→ 2/5 × 5 = 2 时间、1/5 × 5 = 1 资源、2/5 × 5 = 2 无交互。
     落点：小树林 x_scav、森林 x_nap（时间型）；沼泽 x_s2e（资源型）；
     两处「深处」保留无交互（它们是禁区门槛，不额外挂东西）。

   挂上去的是一个**可点的地点选项**（v1.9.0b2.2 改动 2 从 b2.1 的 arrivalOnly 改回来）：
   到达时它会出现在地点按钮行 / 选项行里，由玩家主动点击 → 才弹窗（见 main.js 的 exchangeAtNode）。
   option.exchange 是效果表（EXCHANGE_EFFECTS）的键。
   「已用过」状态直接落在既有的 usedOptions 里，存档格式一个字都不用改。
   =============================================================== */
const EXCHANGE_BY_NODE = {
  /* ---- 废城：时间 ↔ 资源 ×9 ---- */
  home: 'x_rest',              /* 家 */
  plaza: 'x_rest',            /* 废墟广场 */
  apartment: 'x_nap',         /* 倒塌公寓 */
  hospital: 'x_scav',         /* 旧医院 */
  station: 'x_nap',           /* 废车站 */
  school: 'x_cell',           /* 学校废墟 */
  library: 'x_scav',          /* 图书馆废墟 */
  church: 'x_rest',           /* 教堂废墟 */
  watertower: 'x_power',      /* 水塔 */

  /* ---- 废城：资源 ↔ 资源 ×5 ---- */
  wallgate: 'x_s2e',          /* 墙门 */
  subway: 'x_e2s',            /* 地铁口 */
  park: 'x_e2i',              /* 街心公园 */
  dump: 'x_s2i',              /* 垃圾场 */
  mall: 'x_e2i',              /* 商业街废墟 */

  /* ---- 工业区：b2 已分的 5 个 + 本次补的 1 个 ----
     补的是【发电厂】而不是【南关】：南关同时属于废城，给它挂交换会让废城的
     「9 时间 / 5 资源 / 9 无交互」变成 10/6/7；发电厂只属于工业区与孤岛，不干扰废城的计数。 */
  boilerroom: 'x_nap',
  oiltank: 'x_rest',
  assembly: 'x_power',
  pipezone: 'x_cell',
  materialyard: 'x_e2s',
  powerplant: 'x_s2i',        /* 补：发电厂（工业区第 2 个资源 ↔ 资源） */

  /* ---- 东海岸：b2 已分的 4 个 + 本次补的 1 个 ----
     同理，补的是【码头关】而不是【东关】（东关也属于废城）。 */
  breakwater: 'x_ration',
  coastalroad: 'x_scav',
  beach: 'x_s2e',
  observationdeck: 'x_e2i',
  dockgate: 'x_power',        /* 补：码头关（东海岸第 3 个时间 ↔ 资源） */

  /* ---- 荒野：v1.9.0b3 改动 6 新分 ----
     5 个无物品地点（小树林 / 森林 / 森林深处 / 沼泽 / 沼泽深处）→ 2 时间 + 1 资源 + 2 无交互。
     两处「深处」是禁区门槛，刻意留空（无交互 → 到达时输出「这里什么都没有」）。 */
  xiaoshulin: 'x_scav',       /* 小树林：时间 ↔ 资源（翻找 → 刷物资） */
  senlin: 'x_nap',            /* 森林：时间 ↔ 资源（靠着树睡一会儿 → 回体力） */
  zhaoze: 'x_s2e',            /* 沼泽：资源 ↔ 资源（体力 -1 → 电量 +8） */
};

/* 把交换挂成地点的选项：放在区域表之前，保证 NODES 建好就能用。
   按钮文案取自 texts.js 的 EXCHANGES[id].button（与弹窗描述呼应）；数值效果一律不写在这里。
   timeCost = 0：时间代价在 EXCHANGE_EFFECTS 里，这样它不会触发「耗时后掷事件」。
   once 语义：选项默认就是一次性的，但只有玩家在弹窗里选了「执行」才打「已用过」标记
   （见 main.js 的 onOptionClick 对 kind === 'exchange' 的例外），所以「算了」之后按钮还在。 */
for (const [nodeId, exchangeId] of Object.entries(EXCHANGE_BY_NODE)) {
  const node = NODES[nodeId];
  const ex = EXCHANGES[exchangeId];
  if (!node || !ex) continue;
  node.options.push({
    text: ex.button,
    kind: 'exchange',
    exchange: exchangeId,
    timeCost: 0,
    batteryCost: 0,
  });
}

/* ===============================================================
   2. 区域字典（nodes 是 id 数组）—— v1.9.0b1 共 7 个
   ---------------------------------------------------------------
   primaryShelter 必须是本区域自己的节点（强制回家会 visitNode(区域, 该节点)）。
   unlocked 只有开局区域 wasteland 是 true，其余靠「访问过该区域的任一节点」解锁 ——
   共享节点被访问时会在它所属的每个区域里都标记一次，所以走到接口就等于
   把对面那个区域解锁了（但占位区域还没落地，见 placeholder）。

   【placeholder】本块只有 giantwall / wasteland 落地；其余 5 个是占位：
     nodes 里只放那个共享接口节点（改动 5 要求接口同时出现在两个区域的 nodes 列表里，
     否则 areasOfNode() 只有 1 个区域，接口就不成其为「共享节点」、白线也没有方向），
     edges / mainRoads 为空数组，primaryShelter 为 null。
     玩家点它们会得到「前面的路还没通。」（见 isAreaImplemented）。
   =============================================================== */

export const REGIONS = {
  giantwall: {
    id: 'giantwall',
    name: '巨墙',
    type: 'region',
    nodes: ['wallfoot', 'wallgate'],
    edges: [
      { from: 'wallgate', to: 'wallfoot' },
    ],
    mainRoads: [['wallgate', 'wallfoot']],
    neighbors: ['wasteland'],
    primaryShelter: 'wallgate',
    unlocked: false,
  },

  wasteland: {
    id: 'wasteland',
    name: '废城',
    type: 'region',
    /* home + 19 个普通地点 + 4 个接口 */
    nodes: ['home', 'wallgate', 'northgate', 'eastgate', 'southgate',
      'plaza', 'mall', 'station', 'park', 'school', 'library', 'church',
      'apartment', 'hospital', 'gasstation', 'subway', 'watertower',
      'sewer', 'factoryold', 'warehouse', 'substation',
      'brokenbridge', 'dump', 'parking'],
    /* 主干道「比较复杂」：三条主向 + 两条副线 + 一条西向，含环路与分支。
       基准拓扑按需求逐条落地；park / mall / plaza 是枢纽，
       substation 与 parking 是南向的双入口。 */
    edges: [
      /* 西向：家 → 墙门 */
      { from: 'home', to: 'wallgate' },
      /* 东向主干：家 → 广场 → 商业街 → 车站 → 东关 */
      { from: 'home', to: 'plaza' },
      { from: 'plaza', to: 'mall' },
      { from: 'mall', to: 'station' },
      { from: 'station', to: 'eastgate' },
      /* 北向支线：广场 → 公园 → 学校 → 图书馆 → 教堂 → 北关 */
      { from: 'plaza', to: 'park' },
      { from: 'park', to: 'school' },
      { from: 'school', to: 'library' },
      { from: 'library', to: 'church' },
      { from: 'church', to: 'northgate' },
      /* 北向副线：家 → 公寓 → 医院 → 公园（在公园与北向支线汇合） */
      { from: 'home', to: 'apartment' },
      { from: 'apartment', to: 'hospital' },
      { from: 'hospital', to: 'park' },
      /* 东向副线：商业街 → 地铁口 → 水塔 → 东关（与东向主干构成环路） */
      { from: 'mall', to: 'subway' },
      { from: 'subway', to: 'watertower' },
      { from: 'watertower', to: 'eastgate' },
      /* 南向支线：家 → 下水道口 → 工厂旧址 → 旧仓库 → 变电所 → 南关 */
      { from: 'home', to: 'sewer' },
      { from: 'sewer', to: 'factoryold' },
      { from: 'factoryold', to: 'warehouse' },
      { from: 'warehouse', to: 'substation' },
      { from: 'substation', to: 'southgate' },
      /* 南向副线：广场 → 断桥 → 垃圾场 → 地下停车场 → 南关（与南向支线构成环路） */
      { from: 'plaza', to: 'brokenbridge' },
      { from: 'brokenbridge', to: 'dump' },
      { from: 'dump', to: 'parking' },
      { from: 'parking', to: 'southgate' },
      /* 【超出基准拓扑的一条边】需求给的每一条边里都没有「废弃加油站」，
         照抄会让它成为一个孤立节点（永远不可达、也不渲染）。
         这里按最小改动给它挂一条线：公寓 → 废弃加油站。 */
      { from: 'apartment', to: 'gasstation' },
    ],
    mainRoads: [
      ['home', 'plaza'], ['plaza', 'mall'], ['mall', 'station'], ['station', 'eastgate'],
      ['plaza', 'park'], ['park', 'school'], ['school', 'library'], ['library', 'church'],
      ['church', 'northgate'],
      ['home', 'apartment'], ['apartment', 'hospital'], ['hospital', 'park'],
      ['home', 'sewer'], ['sewer', 'factoryold'], ['factoryold', 'warehouse'],
      ['warehouse', 'substation'], ['substation', 'southgate'],
      ['home', 'wallgate'],
    ],
    neighbors: ['giantwall', 'wilderness', 'coast', 'industry'],
    primaryShelter: 'home',
    unlocked: true,                     /* 开局区域：家在这里 */
  },

  /* ================= 以下 3 个是占位（b4 落地） ================= */

  wilderness: {
    id: 'wilderness',
    name: '荒野',
    type: 'region',
    /* v1.9.0b3 落地：northgate 一个共享接口 + 7 个内部节点 = 8 */
    nodes: ['northgate',
      'yizhan', 'xiaoshulin', 'senlin', 'senlinshenchu', 'jinqu', 'zhaoze', 'zhaozeshenchu'],
    /* 需求给的 8 条边，逐条落地（没有增删）：
         北关 → 驿站 → 小树林 → 森林 → 森林深处 → 禁区
                              ↘ 沼泽 → 沼泽深处
         森林深处 ↔ 沼泽深处 是一条横穿的连线（把两条链收成一个环）。
       mainRoads 只标两条主链（北关→驿站→小树林→森林→森林深处、小树林→沼泽→沼泽深处）；
       另外两条（森林深处→禁区、森林深处↔沼泽深处）算支路，走它们要多花 1.4 倍时间。 */
    edges: [
      { from: 'northgate', to: 'yizhan' },
      { from: 'yizhan', to: 'xiaoshulin' },
      { from: 'xiaoshulin', to: 'senlin' },
      { from: 'senlin', to: 'senlinshenchu' },
      { from: 'senlinshenchu', to: 'jinqu' },
      { from: 'xiaoshulin', to: 'zhaoze' },
      { from: 'senlinshenchu', to: 'zhaozeshenchu' },
      { from: 'zhaoze', to: 'zhaozeshenchu' },
    ],
    mainRoads: [
      ['northgate', 'yizhan'], ['yizhan', 'xiaoshulin'], ['xiaoshulin', 'senlin'],
      ['senlin', 'senlinshenchu'],
      ['xiaoshulin', 'zhaoze'], ['zhaoze', 'zhaozeshenchu'],
    ],
    neighbors: ['wasteland'],
    primaryShelter: 'yizhan',           /* 驿站：安全屋（过夜 + 储物箱 + 值班日志） */
    unlocked: false,
  },

  industry: {
    id: 'industry',
    name: '工业区',
    type: 'region',
    /* v1.9.0b2 落地：southgate + powerplant 两个共享接口 + 13 个专属节点 = 15 */
    nodes: ['southgate', 'powerplant',
      'freight', 'steelmill', 'assembly', 'railway', 'oiltank', 'chimney', 'coolingtower',
      'boilerroom', 'pipezone', 'canteen', 'lab', 'materialyard', 'wastewater'],
    /* 主干道「比较复杂」：两条主链 + 三条支线 + 一条互连边，含环路。
       基准拓扑按需求逐条落地；materialyard ↔ wastewater 是需求给的互连边，
       另外补了 steelmill → materialyard 与 coolingtower → wastewater 两条，把这一对接进主链
       （需求要求「至少一条边接入」，补两条是为了两边都接上、顺便形成环路）。 */
    edges: [
      /* 主链一（东侧）：南关 → 货运站 → 炼钢炉 → 装配车间 → 发电厂 */
      { from: 'southgate', to: 'freight' },
      { from: 'freight', to: 'steelmill' },
      { from: 'steelmill', to: 'assembly' },
      { from: 'assembly', to: 'powerplant' },
      /* 主链二（西侧）：南关 → 铁轨 → 储油罐 → 烟囱 → 冷却塔 → 发电厂 */
      { from: 'southgate', to: 'railway' },
      { from: 'railway', to: 'oiltank' },
      { from: 'oiltank', to: 'chimney' },
      { from: 'chimney', to: 'coolingtower' },
      { from: 'coolingtower', to: 'powerplant' },
      /* 支线：炼钢炉 → 锅炉房 → 管道区 → 冷却塔 */
      { from: 'steelmill', to: 'boilerroom' },
      { from: 'boilerroom', to: 'pipezone' },
      { from: 'pipezone', to: 'coolingtower' },
      /* 支线：货运站 → 职工食堂 → 化验室 → 发电厂 */
      { from: 'freight', to: 'canteen' },
      { from: 'canteen', to: 'lab' },
      { from: 'lab', to: 'powerplant' },
      /* 材料场 ↔ 废水池，两侧各接一条回主链 */
      { from: 'materialyard', to: 'wastewater' },
      { from: 'steelmill', to: 'materialyard' },
      { from: 'coolingtower', to: 'wastewater' },
    ],
    mainRoads: [
      ['southgate', 'freight'], ['freight', 'steelmill'], ['steelmill', 'assembly'],
      ['assembly', 'powerplant'],
      ['southgate', 'railway'], ['railway', 'oiltank'], ['oiltank', 'chimney'],
      ['chimney', 'coolingtower'], ['coolingtower', 'powerplant'],
    ],
    neighbors: ['wasteland', 'island'],
    primaryShelter: 'powerplant',
    unlocked: false,
  },

  coast: {
    id: 'coast',
    name: '东海岸',
    type: 'region',
    /* v1.9.0b2 落地：eastgate + dockgate 两个共享接口 + 8 个专属节点 = 10 */
    nodes: ['eastgate', 'dockgate',
      'coastalroad', 'beach', 'breakwater', 'observationdeck',
      'fishingvillage', 'rockybeach', 'seacave', 'shipyard'],
    /* 两条沿海链 + 一条横连（beach ↔ fishingvillage），形成环路 */
    edges: [
      /* 上链：东关 → 海岸公路 → 沙滩 → 防波堤 → 观景台 → 码头关 */
      { from: 'eastgate', to: 'coastalroad' },
      { from: 'coastalroad', to: 'beach' },
      { from: 'beach', to: 'breakwater' },
      { from: 'breakwater', to: 'observationdeck' },
      { from: 'observationdeck', to: 'dockgate' },
      /* 下链：东关 → 渔村 → 岩石滩 → 海蚀洞 → 废弃船厂 → 码头关 */
      { from: 'eastgate', to: 'fishingvillage' },
      { from: 'fishingvillage', to: 'rockybeach' },
      { from: 'rockybeach', to: 'seacave' },
      { from: 'seacave', to: 'shipyard' },
      { from: 'shipyard', to: 'dockgate' },
      /* 横连：沙滩 ↔ 渔村 */
      { from: 'beach', to: 'fishingvillage' },
    ],
    mainRoads: [
      ['eastgate', 'coastalroad'], ['coastalroad', 'beach'], ['beach', 'breakwater'],
      ['breakwater', 'observationdeck'], ['observationdeck', 'dockgate'],
      ['eastgate', 'fishingvillage'], ['fishingvillage', 'rockybeach'],
      ['rockybeach', 'seacave'], ['seacave', 'shipyard'], ['shipyard', 'dockgate'],
    ],
    neighbors: ['wasteland', 'dock'],
    primaryShelter: 'eastgate',
    unlocked: false,
  },

  dock: {
    id: 'dock',
    name: '码头',
    type: 'region',
    placeholder: true,
    nodes: ['dockgate'],                /* v1.9.0b2：接上东海岸的接口；内部节点等 b4 */
    edges: [],
    mainRoads: [],
    neighbors: ['coast'],
    primaryShelter: null,
    unlocked: false,
  },

  island: {
    id: 'island',
    name: '孤岛',
    type: 'region',
    placeholder: true,
    nodes: ['powerplant'],              /* v1.9.0b2：接上工业区的接口；内部节点等 b4 */
    edges: [],
    mainRoads: [],
    neighbors: ['industry'],
    primaryShelter: null,
    unlocked: false,
  },
};

/**
 * 区域在大地图上的摆放。
 *
 *          wilderness
 *              |
 *  giantwall - wasteland - coast - dock
 *              |
 *          industry - island
 *
 * 【改动 6 依赖这张表】接口节点的延伸白线方向不是手写的，而是用
 * regionDirection(from, to) 取两块中心的连线主轴算出来的，所以：
 *   wasteland → giantwall = west、→ wilderness = north、
 *   → coast = east、→ industry = south   （四个方向全部对上）
 * 占位区域也必须有坐标，否则方向算不出来、白线就画不了。
 */
/* v1.9.0b1.1：方框本身 ×1.15，横向/纵向空隙 ×1.5（30→45、50→75、40→60），
   整块布局重新居中到 1250×750 的画布里。空隙变大后，
   「墙门」这类区域通道标签（字号也调大了，见 style.css 的 --fs-link）才有呼吸空间。 */
const REGION_BOX = {
  wilderness: { x: 378, y: 18, w: 253, h: 81 },
  giantwall: { x: 85, y: 183, w: 173, h: 150 },
  wasteland: { x: 303, y: 160, w: 403, h: 196 },
  coast: { x: 751, y: 178, w: 196, h: 161 },
  dock: { x: 992, y: 206, w: 173, h: 104 },
  industry: { x: 332, y: 431, w: 345, h: 127 },
  island: { x: 401, y: 618, w: 207, h: 115 },
};

/**
 * 覆盖所有区域方框的外接矩形（含少量留白）。
 * v1.9.0b1.1 改动 5.3 用：大地图按这个范围设置 viewBox，
 * 于是方框能填满面板、区域通道标签也保持在可读尺寸，
 * 而不是被一张 1250×750 的全画布缩得很小。
 */
function worldViewBox() {
  const boxes = Object.values(REGION_BOX);
  if (!boxes.length) return { x: 0, y: 0, w: VIEW.w, h: VIEW.h };
  const pad = 24;
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad;
  const y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
  const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * 改动 6 用：fromArea 看过去，toArea 在哪个方向 —— 'north' | 'south' | 'east' | 'west'。
 * 按两块在大地图上的中心连线取绝对值较大的那个轴；两块位置重合（或有一块没有坐标）返回 null。
 * 数据驱动的好处：挪动 REGION_BOX 就能改白线朝向，不需要手写四根线的方向。
 */
function regionDirection(fromArea, toArea) {
  const a = REGION_BOX[fromArea];
  const b = REGION_BOX[toArea];
  if (!a || !b) return null;
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2);
  const dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'east' : 'west';
  return dy >= 0 ? 'south' : 'north';
}

/** 从节点位置朝某方向画到【地图边框】—— 需求要的就是「一直延伸到边框处」 */
function borderPoint(p, dir) {
  if (dir === 'north') return { x: p.x, y: 0 };
  if (dir === 'south') return { x: p.x, y: VIEW.h };
  if (dir === 'west') return { x: 0, y: p.y };
  return { x: VIEW.w, y: p.y };
}

/**
 * 该区域是否已经落地（有节点表内容）。占位区域返回 false。
 * 用途：玩家想切到还没落地的区域时，main.js 打一句「前面的路还没通。」
 * 判定读的是 region.placeholder 标记，而不是「nodes 是不是空」——
 * 因为占位区域为了当共享节点，nodes 里必须留着那个接口节点。
 */
export function isAreaImplemented(regionId) {
  const region = getRegion(regionId);
  return Boolean(region) && region.placeholder !== true;
}

/* ===============================================================
   3. 查询接口
   =============================================================== */

export function getRegion(regionId) {
  return REGIONS[regionId] || null;
}

export function getCurrentRegion() {
  return getRegion(game.getCurrentArea()) || REGIONS[START_AREA];
}

/** getNode(id)；也接受 'island:ferry' 这种带区域前缀的写法（id 全局唯一，前缀只是容错） */
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
 *      （例如两个区域共享接口节点时，即使 neighbors 里没写也认得出来）
 */
export function isAreaNeighbor(areaA, areaB) {
  const region = getRegion(areaA);
  if (!region) return false;
  if ((region.neighbors || []).includes(areaB)) return true;
  return sharedNodes(areaA, areaB).length > 0;
}

/** 该区域的强制回家送达地；占位区域 primaryShelter 是 null，这时回落到 HOME_ID */
export function primaryShelterOf(regionId) {
  const region = getRegion(regionId);
  return (region && region.primaryShelter) ? region.primaryShelter : HOME_ID;
}

/**
 * 是不是安全屋（可过夜 + 带储物箱）。
 *
 * v1.9.0b1：判定扩成【共享节点 ∪ 各区域 primaryShelter】。
 *   前者让四个接口（墙门 / 北关 / 东关 / 南关）自动成为安全屋 ——
 *   需求改动 5 要的就是这个「接口节点自动成为安全屋」的效果；
 *   后者保住「家」这个唯一的回电点（家不再是独立区域，靠 wasteland.primaryShelter 进来）。
 *
 * 注意：v1.9.0a 里本函数【只有后半段】（所有 primaryShelter 的并集），
 * 当时共享节点里只有一部分是安全屋（northgate 就不是）。这里按需求的意图改了。
 */
export function isShelter(nodeId) {
  if (isPortalNode(nodeId)) return true;
  return Object.values(REGIONS).some((region) => region.primaryShelter === nodeId);
}

/** 该节点是不是【当前区域】的主安全屋 */
export function isPrimaryShelter(nodeId) {
  return getCurrentRegion().primaryShelter === nodeId;
}

/**
 * 黑暗地点：节点数据里的 isDark 标记（v1.9.0b1 的两块区域里还没有黑暗节点，等荒野落地）。
 * 判定只看节点自己，不看区域，所以接口节点不需要任何特例。
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

/**
 * 该节点是不是「门户」＝安全屋：出现在 ≥ 2 个区域的 nodes 列表里（即共享节点）。
 * 不手写名单，以后新增门户自动就是安全屋。
 *   现状（v1.9.0b1）：wallgate / northgate / eastgate / southgate。
 *   注意 home 只属于 wasteland 一个区域，所以它【不是】门户 —— 它靠 isShelter 提供过夜与储物箱。
 *
 * 注意它与 isShelter() 的区别：isShelter() 是「所有区域 primaryShelter 的并集」，
 * 决定谁能提供过夜选项与储物箱（v1.9.0b1 起 = 共享节点 ∪ primaryShelter，共 5 个）；
 * 本函数只回答「这是不是区域的出入口」，供寻路挑选强制回家的落点。
 */
export function isPortalNode(nodeId) {
  return areasOfNode(nodeId).length >= 2;
}

/**
 * 从 currentNodeId 出发，在【两端都已访问（已探明）】的边构成的子图上，
 * 找【可达的最近门户（安全屋）】—— 强制回家用它挑落点，避免把人送到走不到的地方。
 *
 * 距离口径：
 *   - 该区域已探明边里只要有一条带 distance 字段 → 按 distance 累加（Dijkstra，带权）
 *     （某条边缺 distance 时退回两端节点的逻辑坐标距离，避免图被断开）
 *   - 一条都没有 distance 字段 → 按跳数最少（普通 BFS）
 *   现状：所有边都只写了 { from, to }，没有 distance，所以走的是「跳数最少」。
 *
 * 起点自身也算候选（站在门户上时距离 0，强制回家就是原地不动，只结算）。
 * 找不到（理论上不会：玩家总是从某个门户进来的，那个门户必然可达）返回 null，由调用方兜底。
 *
 * @param {string} [currentNodeId] 起点；省略则用 state 里的当前节点
 * @param {string} [regionId] 限定在哪个区域里找；省略则用当前区域
 * @returns {string|null} 门户节点 id
 */
export function findNearestReachableShelter(currentNodeId = null, regionId = null) {
  const area = regionId || game.getCurrentArea();
  const from = currentNodeId || game.getCurrentNode();
  const ids = getNodeIds(area);
  if (!from || !ids.includes(from)) return null;
  /* 起点本身就是门户 → 最近的就是它 */
  if (isPortalNode(from)) return from;

  const visited = getVisitedIn(area);
  const edges = getEdges(area).filter((e) => visited.has(e.from) && visited.has(e.to));
  const weighted = edges.some((e) => Number.isFinite(e.distance));

  const adj = new Map(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (!adj.has(e.from) || !adj.has(e.to)) continue;
    const w = weighted ? edgeWeight(e) : 1;
    adj.get(e.from).push([e.to, w]);
    adj.get(e.to).push([e.from, w]);
  }

  if (!weighted) {
    /* 普通 BFS：跳数最少。同一层按邻接表顺序走，结果稳定（平手时先被遍历到的赢） */
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      for (const [next] of adj.get(cur)) {
        if (seen.has(next)) continue;
        if (isPortalNode(next)) return next;
        seen.add(next);
        queue.push(next);
      }
    }
    return null;
  }

  /* 带权 Dijkstra（只在边上有 distance 字段时才会走到这里） */
  const dist = new Map([[from, 0]]);
  const done = new Set();
  for (;;) {
    let cur = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (done.has(id) || d >= best) continue;
      cur = id;
      best = d;
    }
    if (cur === null) return null;
    if (cur !== from && isPortalNode(cur)) return cur;
    done.add(cur);
    for (const [next, w] of adj.get(cur)) {
      if (done.has(next)) continue;
      const nd = best + w;
      if (nd < (dist.get(next) ?? Infinity)) dist.set(next, nd);
    }
  }
}

/** 一条已探明边的权重：优先用边自带的 distance，缺了就用两端节点的逻辑坐标距离 */
function edgeWeight(edge) {
  if (Number.isFinite(edge.distance)) return edge.distance;
  const a = getNode(edge.from);
  const b = getNode(edge.to);
  return (a && b) ? distance(a, b) : 1;
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
 * 为什么需要它：wallgate 是共享节点，只有一个逻辑坐标，而它必须同时
 * 是废城的最西端（贴西边框、白线往西）、又是巨墙的最东端（贴东边框、通往废城）——
 * 一个 x 做不到。所以把这件事放在视觉层解决，逻辑层一动不动。
 *
 * 废城不需要覆盖：wallgate(95,170) 本来就是西侧。
 * 巨墙需要：wallgate 在这里当东端。
 * 逻辑坐标（算费用）一个都没动：wallgate(95,170) ↔ wallfoot(350,300) = 286 → 858 秒。
 */
const REGION_VIEW_POS = {
  giantwall: {
    wallgate: { x: 940, y: 300 },
  },
  /* v1.9.0b2：新落地两个区域之后，它们各自的共享接口也要挪到「朝对面区域」的那一侧：
       industry 的 southgate（逻辑坐标是废城南端 700,560）→ 挪到工业区北端
       coast    的 eastgate （逻辑坐标是废城东端 930,300）→ 挪到东海岸西端
     另外 powerplant / dockgate 的逻辑坐标分别是「工业区南端 / 东海岸东端」，
     到了占位区域（孤岛 / 码头）那一侧也要反过来贴边 —— 虽然 b4 之前进不去，
     但区域视图一旦被渲染（比如 debug 直接切视图），位置也必须是对的。
   v1.9.0b3：荒野在废城【北面】，所以共享节点 northgate 在荒野这一侧要贴【南】边
      （逻辑坐标 850,50 是它在废城那一侧的北缘，两个区域看到的必须是同一段文案、
       但方位要各自朝对面）。 */
  wilderness: {
    northgate: { x: 500, y: 540 },
  },
  industry: {
    southgate: { x: 500, y: 60 },
  },
  coast: {
    eastgate: { x: 60, y: 300 },
  },
  island: {
    powerplant: { x: 500, y: 60 },
  },
  dock: {
    dockgate: { x: 60, y: 300 },
  },
};

/** 节点在指定区域里的视觉基准坐标：有覆盖用覆盖，没有就用逻辑坐标 */
function viewPos(regionId, node) {
  const overrides = REGION_VIEW_POS[regionId];
  const over = overrides && overrides[node.id];
  return over ? { x: over.x, y: over.y } : { x: node.x, y: node.y };
}

/**
 * 节点实际绘制坐标 = 该区域的视觉基准坐标 × DRAW_SCALE + 固定噪声，再夹回画布内（否则贴边节点会被裁掉）。
 *
 * 注意 DRAW_SCALE 只作用在【这里】（绘制），NODES 里的 x/y 保持原值不变 ——
 * computeEdgeCost 算耗时读的是原始坐标，所以「地图摊开」不会改任何数值（见 VIEW 的注释）。
 */
function drawPos(node, regionId) {
  const { dx, dy } = getNodeNoise(node.id);
  const base = viewPos(regionId, node);
  const halfW = NODE_W / 2;
  const halfH = NODE_H / 2;
  return {
    x: Math.min(VIEW.w - halfW, Math.max(halfW, base.x * DRAW_SCALE + dx)),
    y: Math.min(VIEW.h - halfH, Math.max(halfH, base.y * DRAW_SCALE + dy)),
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
 * 接口节点是共享节点：访问记录可能只落在它所属的另一个区域里
 *（例如开局站在家里，wasteland 里有 'home'；走到北关则 wasteland 与 wilderness 各记一次）。
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
 *   - 废城里只要区域内已探明路径通到 home，home 就可点（不算绕路）
 *   - 例如在巨墙里，废城的那些节点根本不在本区域列表里，自然不会出现在图上
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

/** 「能到未到」的菱形相对节点框的比例（v1.9.0b1.1 新增；65% = 需求建议的 60%~70% 取中） */
const DIAMOND_SCALE = 0.65;

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
    /* 黑暗区域画【圆】：半径取区域框的半个高（区域框比节点框更扁，用高度才能保证
       整块圆落在自己的框里、不出大地图画布）；区域名的字号在 CSS 里相应调小以放进圆内。 */
    if (isDarkRegion(id)) {
      group.appendChild(svgNode('circle', {
        class: 'region-circle', cx, cy, r: box.h / 2,
      }));
    }
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
     否则站在家里切进巨墙时本区域 Set 是空的，整个地图会什么都不画 */
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
     所以既不显示名字（不泄露没走过的地图），又明显区别于可点的琥珀菱形。
     v1.9.0b3 改动 3：还带一个解锁门槛 —— 未解锁的节点（禁区）完全不渲染、不可点，
     解锁条件满足后自动回到下面这套常规判定（当前节点自己例外，免得人站在上面却看不见自己）。 */
  const stateOf = (id) => {
    if (id !== here && !isNodeUnlocked(id)) return null;   /* 未解锁：连形态都不给（机制 A 之外的门槛） */
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
  /* v1.9.0b1.1 改动 1.2：「能到未到」节点的菱形缩到 65%。
     只缩这个标记本身的视觉尺寸 —— 点击区域仍沿用节点框（见 style.css 里
     .node.is-unseen .node-rect 改成透明但可点），所以手感不变、图更清爽。 */
  const dd = d * DIAMOND_SCALE;
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

  /* 【改动 6】接口节点的「延伸白线」：从接口位置朝它所连接的另一个区域的方向，
     一直画到地图边框。样式与主干道白线完全一致（同一个 .road 类，不新增任何 CSS）。
     方向不是手写的，而是按 REGION_BOX 的方位算出来的（见 regionDirection）。
     只从【共享节点】伸出去，并且只伸向「另一个区域」那一侧。

     未落地的区域（荒野 / 工业区 / 东海岸）同样画：尽头暂时没有对应节点，
     b2 / b3 落地后自然接上。这些线是纯装饰 —— 不绑任何事件、
     不进 nodeEls / edgeEls，所以既不参与点击，也不参与可达性判定。 */
  for (const id of region.nodes) {
    if (!states.get(id)) continue;                 /* 节点没渲染 → 它的白线也不画 */
    for (const otherArea of areasOfNode(id)) {
      if (otherArea === regionId) continue;        /* 自己这一侧不画 */
      const dir = regionDirection(regionId, otherArea);
      if (!dir) continue;
      const p = drawPos(getNode(id), regionId);
      const end = borderPoint(p, dir);
      layers.roads.appendChild(svgNode('line', {
        class: 'road region-spoke',
        x1: p.x, y1: p.y, x2: end.x, y2: end.y,
      }));
    }
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
    /* 黑暗地点标识：独立于上面那几种状态再叠一层（圆形 + 中性深灰圆环 + 名字下方的小标签），
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
      points: `${p.x},${p.y - dd} ${p.x + dd},${p.y} ${p.x},${p.y + dd} ${p.x - dd},${p.y}`,
    }));
    /* 黑暗地点画【圆】：半径取节点框的半个宽（节点框是扁矩形，用宽度才能把名字圈进去）。
       矩形与菱形由 CSS 在 .is-dark 时隐藏，配色沿用通用节点变量（见 style.css）。 */
    if (node.isDark) {
      group.appendChild(svgNode('circle', {
        class: 'node-circle', cx: p.x, cy: p.y, r: w / 2,
      }));
    }
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

    /* 黑暗地点的小标签：圆形里排在名字下面一行（「你在这里」也显示时再往下让一行）。
       未访问时节点名被 CSS 藏起来，但这个标签照常显示 —— 它不泄露名字，只说明这里很黑。 */
    if (node.isDark) {
      const darkTag = svgNode('text', {
        class: 'dark-tag',
        x: p.x,
        y: p.y + Math.round(h / 2 + (st === 'current' ? 24 : 6)),
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
  applyViewBox();
  if (view === 'world') renderWorld();
  else renderArea(game.getCurrentArea());
  return view;
}

/**
 * 按当前视图设置 SVG 的 viewBox（v1.9.0b1.1 改动 5.3）。
 *   区域地图 → 整个画布 0 0 VIEW.w VIEW.h
 *   大地图   → 只框住所有区域方框（worldViewBox），于是方框能填满面板、
 *              区域通道标签（「墙门」这类）保持可读，而不是被整张画布缩得极小。
 */
function applyViewBox() {
  if (!svgEl || typeof svgEl.setAttribute !== 'function') return;
  if (view === 'world') {
    const b = worldViewBox();
    svgEl.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
  } else {
    svgEl.setAttribute('viewBox', `0 0 ${VIEW.w} ${VIEW.h}`);
  }
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
 * wasteland 的初始标记是 true：否则开局访问数为 0，它在大地图上根本不会渲染，
 * 玩家就没有入口从家走出去（其余区域靠「走到接口节点」解锁）。
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
