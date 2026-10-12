# HANDOFF.md —— NightWander 项目交接文档

> 依据：本次对话的完整开发记录 + 交接前对 `D:\Dsh\NightWander` 实际文件的检查（2025 年对话末尾，检查结果见附录 B）。
> 凡未经验证的内容均标注「待确认 / 未验证 / 计划」。**不要**把「计划」当作「已实现」。
>
> **【第二轮核对 · 2026-10-10】** 本文档已由新一轮对话重新逐项实测核对（模块加载实验 + 导出表比对 + 哈希校验），
> 差异与新增发现见 **附录 D**。同轮还完成了 **本地 Git 仓库建立**（提交 `0c08aad`，标签 `v1.7.5-baseline`）。
> **游戏逻辑代码未作任何修改**，`v6/` 下 12 个文件的字节与建仓前完全一致。

---

## 1. 项目概况

- **名称/类型**：NightWander —— 纯前端「地图探索」文字 demo（原生 HTML/CSS/JS + ES module）。
- **目标**：点击地图节点移动、在终端式日志区阅读场景与选项、按选项编号行动；有体力/电量/游戏时间/夜晚结算/物品与装备槽/存档导出导入等系统；可直接丢到静态托管分享。
- **核心循环**：在家（时间不流逝）→ 出发 → 沿边移动（扣体力、耗时）→ 在节点上用选项探查/拾取（扣电、耗时）→ 06:00 或体力归零被强制回家 → 结算（天数 +1、时间归零、体力电量回满）→ 下一天。
- **当前实际版本号**：`v1.7.5`（依据：`v6/js/config.js` 中 `export const GAME_VERSION = 'v1.7.5'`，交接前实测）。
  - **计划值**：多区域需求要求改成 `v1.8.0` —— **尚未修改**。
- **当前阶段**：**开发中，且处于不可运行的中间态**。依据：最近一次改动是把 `v6/js/map.js` 重写为多区域版，但 `state.js / main.js / inventory.js / saveSystem.js / debug.js / texts.js / style.css / index.html / config.js` 尚未同步迁移；新 `map.js` 调用 `game.getVisitedByArea()`、`game.state.currentArea`、`game.state.sheltersByArea` 等**当前不存在**的接口（实测 `state.js` 中无 `getVisitedByArea`、仍有 `homeStorage`；`main.js` 未出现 `setMapView`）。因此在同步完成前，页面会在启动时报错。
- **技术栈/运行**：零依赖、零构建。浏览器需支持 ES module。本地预览用一种零依赖 Node 静态服务器（`serve.mjs`，我为本机补的；本机没有可用的 python）。部署方式：上传 `index.html`、`style.css`、`js/` 到任意静态托管即可（v6 无图片素材）。
- **最重要设计目标 / 用户明确约束**：
  1. 原生实现，**不引入任何第三方库或 CDN**；
  2. **不擅自重构、不改文件结构、不顺手优化无关代码**，每次只改用户点名的位置；
  3. 最小实现，不做「无意义的封装」；模块职责边界严格（map 不判规则、state 不碰 DOM、saveSystem 纯函数、main 是唯一协调者）；
  4. 中文注释与中文文案；
  5. 需要时用户会要求「列出改了哪些函数/字段」便于核对，改动要可审计。

---

## 2. 文件清单与职责

> 以下为交接前**实际检查到的**目录（`Get-ChildItem -Recurse`）：

```
D:\Dsh\NightWander\
├─ serve.mjs                 零依赖 Node 静态服务器（可选，非游戏代码）
├─ NightWander-v6.zip        v1.7.5 全量打包（34.2 KB，12 文件）
├─ v5\                       上一代（v5 规格）归档：index.html/style.css/js(10)/pics(10)/NightWander.zip/serve.mjs
└─ v6\                       当前开发目录（12 文件）
   ├─ index.html
   ├─ style.css
   └─ js\ config.js  debug.js  inventory.js  main.js  map.js
          saveSystem.js  state.js  terminal.js  texts.js  timeSystem.js
```

| 路径 | 职责 | 当前状态 | 稳定性 | 实际验证情况 |
|---|---|---|---|---|
| `v6/js/config.js` | 所有可调数值（体力/电量/时间/距离系数/终端历史/事件开关/版本号） | 已实现 | 稳定 | 本机 Node 读取实测（`GAME_VERSION='v1.7.5'`、`DEBUG_CONSOLE=true`、`EVENTS_DEFAULT=false`）；缺 `CROSS_REGION_COST_SEC`/`SHELTER_OVERNIGHT_COST_SEC` |
| `v6/js/texts.js` | 全部文案（UI 文案、物品表 `ITEMS`、场景表 `SCENES`，含 9 张 12 行 ASCII） | 已实现（单区域版） | 常改 | 曾用 Node 断言验证 9 个场景的 ASCII 行数/宽度/纯 ASCII；**尚未**新增 `lighthouse`/`southgate`/area2 五节点文案（注意：源码里出现的 `lighthouse` 子串来自文案键 `foundLighthouse`，不是灯塔场景） |
| `v6/js/map.js` | 地图数据 + SVG 绘制 + 点击回调 | **刚重写为多区域版，未验证且与其余文件不兼容** | 正在大改 | 交接前 `Move-Item` 覆盖为多区域实现（**实测 420 行**，文档原记 413 行）；**未做任何运行验证**；第二轮实测：导出表已由旧版的 `NODES/GOAL_ID/isClickable/getPickableItems` 变为 22 个新导出 |
| `v6/js/state.js` | 游戏状态与只读查询（不碰 DOM） | 已实现（单区域版） | 常改 | `state` 字段与存取函数经 Node 实测；**仍是 `homeStorage`/`visited` 旧命名，未迁移到 `sheltersByArea`/`visitedByArea`** |
| `v6/js/timeSystem.js` | 时间/天数推进、`HH:MM:SS` 格式化、夜晚结束回调、电量上限衰减 | 已实现 | 稳定 | Node 实测：`20:00:00`↔`06:00:00` 边界、`computeBatteryCap` 取值（0→100、18000→55、36000→10）、在家不流逝（浏览器实测） |
| `v6/js/inventory.js` | 容量计算、装备槽、整理判断（无 DOM） | 已实现（单储物箱版） | 常改 | Node 实测 `0+3+2=5`、拾取/脱下/回箱各拒绝分支；**未按 shelterKey 隔离** |
| `v6/js/saveSystem.js` | 纯函数序列化/反序列化（Base64+JSON+版本号） | 已实现（**版本号为 1**） | 稳定 | Node 实测往返保留字段、乱码/版本不符/字段缺失均返回 `null`；**尚未升 v2** |
| `v6/js/debug.js` | `/` 指令解析与执行（受 `DEBUG_CONSOLE` 控制） | 已实现 | 常改 | Node 实测 10 条指令 + `/goto help` + `/event` 六种输入 + `/version`；**尚无 `/area`** |
| `v6/js/terminal.js` | 日志队列、输入（历史/Tab 补全）、按钮行、弹窗、`escapeHtml` | 已实现 | 常改 | 队列/清队列竞态修复曾浏览器实测；Tab 循环与 `escapeHtml` 经 Node 语法检查 + 逻辑审查（**未做完整浏览器回归**） |
| `v6/js/main.js` | 入口与唯一协调者（流程编排、状态栏/物品栏渲染、主题、debug ctx） | 已实现（单区域版） | 最常改 | 多轮浏览器实测（移动/选项/结算/强制回家/存档/物品）；**未接入 `setMapView`、未做区域化改造** |
| `v6/index.html` | DOM 骨架（面板/状态栏四栏/终端三段/弹窗容器） | 已实现 | 稳定 | 多轮浏览器 DOM 检查；**尚未加「返回大地图」按钮** |
| `v6/style.css` | 全部样式 + CSS 变量（终端独立变量、深色模式、菱形、hover、日志样式） | 已实现 | 常改 | 变量与选择器经 PowerShell 校验；**尚无 `.region-*` 大地图样式** |
| `v5/**` | 上一代（v5 规格）归档，含 10 张 `.jpg` 素材 | 只读归档 | — | 未在本次开发中修改 |
| `serve.mjs`（根） | 本地预览用零依赖静态服务器 | 已实现 | 稳定 | 交接前 8000 端口在监听、`/v6/` 返回 200 |

**依赖方向（当前实际）**：`main.js → {config, texts, map, state, timeSystem, inventory, saveSystem, debug, terminal}`；`map.js → {texts, config, state}`（**新 map.js 引入了对 `state` 的运行时依赖**，历史版本没有）；`timeSystem → {config, state}`；`terminal → {texts, debug, config}`；`state → {config, texts}`；`inventory → {config}`；`saveSystem → 无`（仅用 `window.btoa/atob`）；`debug → {config}`。

---

## 3. 关键数据结构与接口

### 3.1 `state`（`v6/js/state.js`，交接前实测字段）

```js
export const state = {
  day: 1,
  elapsedSeconds: 0,        // 浮点，当前夜晚已流逝游戏秒
  currentNode: null,
  visited: new Set(),       // 单区域版；多区域计划改为 visitedByArea
  stamina: STAMINA_MAX_INIT,
  staminaMax: STAMINA_MAX_INIT,
  battery: BATTERY_MAX,     // 浮点（电量上限随时间衰减，显示时才取整）
  storageCapacity: STORAGE_CAPACITY,
  homeStorage: [],          // 单储物箱；多区域计划改为 sheltersByArea
  equipped: { hand: null, torso: null, legs: null, back: null },
  pocket: [],
  collectedItems: new Set(),// 已被捡走的节点物品 id
  eventsEnabled: false,     // 随机事件开关（只留开关，无事件系统）
  gameOver: false,
  options: [],              // 当前选项列表（已挂 handler 与 fullIndex）
};
```
模块级（未在 `state` 内）：`usedOptions: Map<nodeId, Set<index>>`、`usedPerDay: Map<nodeId, Set<index>>`、`usedGroups: Map<nodeId, Set<group>>`。
导出函数（实测存在）：`initState, visit, setCurrentNode, getCurrentNode, getVisited, isVisited, getStamina, setStamina, spendStamina, getStaminaMax, setStaminaMax, getBattery, setBattery, spendBattery, getDay, setDay, getElapsedSeconds, setElapsedSeconds, addElapsedSeconds, isGameOver, setGameOver, setOptions, getOptions, getUsedOptions, getUsedOptionsPersistent, markOptionUsed, clearPerDayOptions, getUsedGroups, markGroupUsed, getStorageCapacity, setStorageCapacity, getHomeStorage, getEquipped, getPocket, addToStorage, removeFromStorage, setEquippedSlot, addToPocket, removeFromPocket, isItemCollected, markItemCollected, setEventsEnabled, getEventsEnabled, toSnapshot, replaceFromSnapshot`。
**多区域需求要求新增**（尚未实现）：`currentArea='area1'`、`mapView='world'`、`visitedByArea`、`sheltersByArea`、`storageCapacityByShelter`，并删除 `homeStorage`/`visited`。

### 3.2 节点（新 `map.js` 的 `makeNode`）

```js
{ id, areaId, x, y, name, desc, ascii, altAscii?, items: string[], options: Option[] }
```
`REGIONS`（新 map.js，已写入文件但未验证）：
```js
REGIONS.area1 = { id, name:'家与灯塔', entranceNode:null, exitNode:'southgate',
  primaryShelter:'home', shelters:['home','lighthouse'],
  mainRoads:[['home','n2'],['n2','n5'],['n5','n7'],['n7','lighthouse']],
  nodes:[home,n1,n2,n3,n4,n5,n6,n7,lighthouse,southgate], edges:[...12 条，最后一条跨区域] }
REGIONS.area2 = { id, name:'未知地域', entranceNode:'entrance', exitNode:null,
  primaryShelter:'entrance', shelters:['entrance'],
  mainRoads:[['entrance','m1'],['m1','m2'],['m2','m3'],['m3','goal2']],
  nodes:[entrance,m1,m2,m3,goal2], edges:[4 条] }
```
节点坐标（新 map.js 内，**来自本次需求指定值**）：area1 `home(80,300) n1(250,100) n2(250,300) n3(250,500) n4(450,100) n5(450,300) n6(450,500) n7(650,300) lighthouse(800,300) southgate(920,300)`；area2 `entrance(80,300) m1(250,200) m2(450,300) m3(650,200) goal2(800,300)`。（需求原文写 southgate「例如 (900,300)」，实现取了 920。）
跨区域边：`{ from:'southgate', to:'area2:entrance', crossRegion:true, timeCost:CROSS_REGION_COST_SEC }` —— `CROSS_REGION_COST_SEC` **尚未在 config.js 定义**（需求值 3600）。

### 3.3 选项 `Option`（v1.7.5 实际字段）

```js
{
  text: string,              // 按钮文字
  timeCost: number,          // 游戏秒
  batteryCost?: number,
  repeatable?: boolean,      // true = 点后不变暗
  perDay?: boolean,          // 天数 +1 时重置（且不进存档）
  group?: string,            // 同组互斥
  requires?: (state) => boolean,   // false → 灰按钮 + hover 提示
  requiresHint?: string,           // 缺省 '当前无法使用'
  save?: 'export' | 'import',      // 存档选项（仅安全屋追加）
  timeKind?: 'home' | 'street' | 'watch', // 看时间类选项的文案种类
  fullIndex?: number,        // 在“全量选项数组”里的稳定序号（用于已用判定）
  handler: (option, node) => void | Promise<void>, // 由 main.buildOptions 挂上
}
```
自动追加：`ensureTimeOption(node)` 在 `main.js` 内按地点/是否持有 `pocketwatch` 决定是否追加「看一眼墙上的老钟 / 查看街角的老钟 / 掏出怀表看一眼」（三者电量归零时统一输出「钟面/表盘一片漆黑，什么也看不清。」）。

### 3.4 物品 / 装备

`texts.js` 的 `ITEMS`（实测）：`coat`(slot torso, pockets 3)、`jeans`(slot legs, pockets 2)、`flashlight`(slot hand)、`torch`(slot hand)、`oldmap`(无 slot)、`pocketwatch`(slot null, pockets 0，只能进袋)。
`inventory.SLOTS = ['hand','torso','legs','back']`；口袋容量 = 各装备 `pockets` 之和。开局储物箱（`state.js` 的 `INITIAL_STORAGE`）= `['coat','jeans','flashlight','torch','oldmap','pocketwatch']` —— **多区域需求要求把怀表从家储物箱移除、改放灯塔节点 `items`**（尚未实现）。

### 3.5 存档（`saveSystem.js`，当前 **v1**）

```js
{ v: 1, data: {
  day, elapsedSeconds, currentNode, visited: string[],
  stamina, staminaMax, battery, storageCapacity,
  homeStorage: Item[], equipped: {hand,torso,legs,back},
  pocket: Item[], collectedItems: string[],
  usedOptions: { nodeId: number[] }, usedGroups: [ [nodeId, string[]] ]
} }  // → JSON → Base64（TextEncoder + window.btoa）
```
`deserialize()` 校验 `REQUIRED` 字段齐全、数组类型正确、数值有限；任何不符返回 `null`。多区域需求要求升到 `v: 2`（新增 `currentArea/mapView/visitedByArea/sheltersByArea/storageCapacityByShelter`，移除 `homeStorage/visitedNodes`；`v:1` 要输出「存档版本过旧，无法加载」并返回 `null`）—— **尚未实现**。

### 3.6 关键函数（真实名称/签名/调用方）

| 函数 | 位置 | 签名 | 调用方 / 副作用 |
|---|---|---|---|
| `computeEdgeCost` | 新 `map.js` | `(fromId, toId, areaId?) => number` | `main.travelTo`；内部按区域缓存；跨区域边取 `edge.timeCost` |
| `computeClickable` | 新 `map.js` | `(areaId, visited) => Set<string>` | `renderArea`；规则＝已访问 ∪ 与已访问节点有边相连 |
| `getCrossRegionTarget` | 新 `map.js` | `(nodeId, areaId?) => {areaId,nodeId}｜null` | 计划由 `main` 用于跨区域移动 |
| `isShelter` / `isPrimaryShelter` | 新 `map.js` | `(areaId, nodeId) => boolean` | 计划由 `main` 替换旧 `=== 'home'` 判定 |
| `setMapView` | 新 `map.js` | `('world'｜'area') => view` | 计划由 `main` 调用 |
| `advanceTime` / `getTimeString` / `computeBatteryCap` / `startClock` / `stopClock` / `resetClock` | `timeSystem.js` | 见源码 | `main` 的移动与选项流程、结算 |
| `log(text, className?)` / `logLines` / `clearQueue` / `visibleOptions` / `renderButtons` / `handleCommand` / `setLocked` / `showModal` / `copyText` | `terminal.js` | 见源码 | `main` 全流程调用 |
| `serialize` / `deserialize` | `saveSystem.js` | `(snapshot)=>string` / `(str)=>object｜null` | `main` 的导出/导入选项 |
| `runCommand` / `getAllCommandNames` | `debug.js` | `(input, state, ctx)` / `() => string[]` | `main.handleCommand`（`/` 分支）、`terminal` Tab 补全 |
| `settleNight` / `onForceHome` / `ensureTimeOption` / `buildOptions` / `availableOptions` / `refreshButtons` | `main.js` | 见源码 | 夜间结算、强制回家、选项构造与渲染 |

debug 指令当前实际支持（`getAllCommandNames()` 实测返回值，v1.9.0c）：`['time','day','stamina','staminaMax','battery','storage','unlockall','give','goto','area','event','version','help']`，另有 `/goto help` 与 `/event help`。其中 `/give {itemId} [数量]` 是 v1.9.0b4.1 新增（不看容量、不消耗资源，给钥匙会立刻算「拿到过」）；`/battery` 自 v1.9.0c 起按**当前电量上限**夹取（上限从装备推导）。

---

## 4. 关键约定与设计决策

**存档与版本**
- 存档版本常量 `VERSION` 在 `saveSystem.js`，**当前为 4**；游戏版本号在 `config.GAME_VERSION`，**当前 `v1.9.0c`**；两者独立递增（游戏版本升了但存档结构没变，`VERSION` 就不用动）。v1 / v2 存档不提供迁移，只提示「存档版本过旧，无法加载」。
- **【用户要求】更新日志必须同步维护**：每次改 `GAME_VERSION`，都要在仓库根目录的 `CHANGELOG.md` 顶部新增一节（格式与分类约定见该文件开头），并按 `git tag -a vX.Y.Z` 打标签。只写已发生的事实，计划留在本文档。
- 惯例：解析失败一律返回 `null`，由 `main` 打印 `存档无效`；导入前 `window.confirm` 确认，导入后必须「停旧定时器 → 替换 state → 重启定时器 → 重绘全部 UI」。

**文件组织 / 职责边界（用户多次强调，勿破）**
- `map.js` 不判规则、不碰终端；`state.js` 不碰 DOM；`saveSystem.js` 纯函数、不改 state；`timeSystem.js` 只推进与格式化；`inventory.js` 只算容量与装备判断、渲染交给 `main`；`terminal.js` 只做日志/输入/按钮/弹窗；**`main.js` 是唯一协调者**。
- `index.html` 只放 DOM 骨架；文案一律进 `texts.js`；数值一律进 `config.js`。
- 日志行 class 约定：`term-line terminal-line [arrival|options]`（同时保留旧类名以兼容既有样式）。

**机制规则**
- **时间**：`tick` 用 `Date.now()` 真实差值累加（`TICK_INTERVAL_MS=250`），因此后台节流后回前台会一次性补足；**在 `currentNode === 'home'` 时不累加**（只更新基准，避免离开家时补时）；`advanceTime(sec)` 用于移动/选项的离散扣时。
- **天数 +1 只在结算流程里发生**（`main.settleNight`），入口只有两个：主动回家、强制回家；`main.onNightEnd` 的「已在家」防御分支也会 +1；`state.setDay`/`replaceFromSnapshot` 是写入点，`debug` 的 `/day` 是开发旁路。
- **强制回家**（06:00 或移动后体力归零且不在家）：清队列 → 提示（`天亮了，你不得不回家。` / `你精疲力尽，倒在了路边……`）→ 传送回家并标记已访问（不扣体力/时间）→ 体力上限 −`FORCE_HOME_PENALTY` → 若 `staminaMax <= STAMINA_MIN` 则**先结算再 gameOver**并输出 `你已经精疲力尽，再也走不动了。游戏结束。`。
- **可点击判定**：`已访问 ∪ 与任一已访问节点有边相连`；**不使用距离阈值**（历史 220 阈值因「看得见连线却点不动」被明确弃用）。
- **边耗时**：同区域 = 逻辑距离 × `DISTANCE_TO_TIME_RATIO`（支路再 × `SECONDARY_ROAD_PENALTY`）；跨区域 = 边上的 `timeCost`。
- **地图可见性**：已访问 → 矩形+名称；未访问但可点 → 琥珀→**现为主题黑白**的菱形（无文字、无名称）；未访问且不可点 → 完全不渲染；边两端有任一端完全不渲染时该边也不画。
- **按钮生命周期**：用过的一次性选项（非 repeatable、无 group）→ 从按钮行消失；`requires` 不满足 → 灰按钮 + `title=requiresHint` + 占编号（输入该编号输出 hint）；group 已被别的选项选过 → 灰按钮。编号按过滤后连续排列。
- **存档不含**：图片缓存、定时器、深色模式、UI 状态（终端历史等）。`perDay` 已用项不进存档。
- **物品使用（v1.9.0c）**：物品栏每一行右侧都有「使用」按钮（装备槽四个槽 + 口袋；储物箱与当地物品没有）。
  效果集中写在 `main.js` 的 `ITEM_USES` 表里，出口只有 `useItem()`：充电器电量 +4、罐头体力 +1、
  怀表 = 点怀表本身（同一个 `watchTimeAtInventory()`）；其余一律 `你不知道这个东西在这怎么用。`。
  充电器与罐头**用掉一件**，满电 / 满体力时不消耗；使用不消耗时间 / 体力 / 电量。
- **电量上限（v1.9.0c）**：上限 = `config.BATTERY_MAX`(100) + 穿戴槽物品的 `batteryMaxBonus`（电容器 +25），
  算法在 `inventory.computeBatteryMax()`，唯一读取入口是 `state.getBatteryMax()`；
  `state.setBattery()` 一律夹到该上限，`setEquippedSlot()` 与 `replaceFromSnapshot()` 末尾各夹一次，
  所以穿脱装备与读档都不会让电量超出上限。上限**不进存档**（实时推导）。
  只有 `torso / legs / back`（`WEAR_SLOTS`）算「穿戴」，手持槽不算。

**被否决/替代的方案（有对话依据）**
- 图片→ASCII：v6 规格明确「不使用图片转 ASCII」，`imageToAscii.js` 与 `pics/` 已从 v6 移除（素材仍在 `v5/pics`）。
- 距离阈值 220：已弃用（见上）。
- 琥珀色菱形：被用户在下一轮要求改为主题黑白（已改）。
- `setInterval` 固定增量累加时间：被否决，改为时间戳差值。

**用户明确要求保留、不得擅改**
- 手持/上身/下身/背部槽只接收对应 `slot` 的物品；怀表 `slot: null` 只能进袋，看时间靠 `hasItem` 判定；`DEBUG_CONSOLE` 默认应为 `false`（当前被用户要求临时设为 `true`）。

---

## 5. 当前问题与风险

| # | 问题 | 状态 | 依据 |
|---|---|---|---|
| 1 | **`v6` 当前不可运行**：新 `map.js` 依赖 `game.getVisitedByArea()`、`state.currentArea`、`state.sheltersByArea`（都不存在），且 `main.js` 仍调用旧接口（`getNode(id)`、`refreshMap({visited,current})`、`state.homeStorage`） | **已确认（文件检查 + 第二轮模块加载实验）**，未修复 | 交接前实测：`state.js` 无 `getVisitedByArea`、有 `homeStorage`；`main.js` 无 `setMapView`；`config.js` 无 `CROSS_REGION_COST_SEC`。**第二轮补充：实际的启动阻塞有三层，且 `main.js` 的 import 本身就是链接期致命错误 —— 见新增问题 13/14** |
| 2 | `map.js` 里的 `CROSS_REGION_COST_SEC` 导入目标未定义 → 模块链接会失败 | 已确认（静态检查），未修复 | 新 `map.js` 的 import 列表包含该常量，`config.js` 中不存在 |
| 3 | v1.7.5 的 9 张 ASCII 里新节点（lighthouse/southgate/area2 五节点）文案缺失 | 已确认，未实现 | `texts.js` 仍是单区域 9 场景 |
| 4 | 「过夜」选项、安全屋储物箱隔离、跨区域移动、`/area`、存档 v2、大地图样式与「返回大地图」按钮 | 计划实现，**均未开始** | 需求文档；文件检查未见相关代码 |
| 5 | Tab 补全循环 + `escapeHtml` + 到达斜体/选项粗体 这批改动**只做了 Node 级逻辑验证与语法检查，未做完整浏览器回归** | 修复待验证 | 该轮以模块加载 + Node 逻辑测试代替整局回归（当时上下文受限），已在对话中如实标注 |
| 6 | `/event` 指令用户报告「失效」，但我用 Node 桩环境无法复现（原实现能响应） | **待复现**；已按「显式分支 + 大小写无关 + 非布尔兜底 + 固定用法文案」重写并 Node 验证六种输入 | 对话记录 + 当时的 Node 输出 |
| 7 | `REACH`（220 阈值）常量删除未成功（锚点不匹配），现为**无人引用的遗留导出** | 已确认，低风险 | 该轮补丁报告 `MISS 删除 REACH`；`computeClickable` 已不再引用它 |
| 8 | 「unvisited 菱形」配色在 `style.css` 中已改为主题黑白（浅 `#000/#fff`、深 `#fff/#1a1a1a`），**本轮未做浏览器视觉确认** | 未验证 | 补丁脚本输出 `ok css 菱形配色`，但本轮未截图/未跑浏览器 |
| 9 | ~~无版本控制：容器内没有 `git`，回退只能靠 ZIP~~ | **✅ 已解决（第二轮）** | 已在 `D:\Dsh\NightWander` 建立本地 Git 仓库：初始提交 `0c08aad`、标签 `v1.7.5-baseline`；Git 2.56.0 便携版装在 `.tools/PortableGit/`（已 gitignore）并加入用户 PATH。**注意：用户明确只要本地 Git，不建 GitHub 远程仓库。** |
| 10 | 终端历史保存在内存、不进存档；导入存档不重置历史（设计如此） | 设计已定 | 需求原文 |
| 11 | 在本机无法用 `python -m http.server`（`python`/`python3` 均不可用）→ 预览依赖 `serve.mjs` | 已确认 | 早期实测 |
| 12 | 手感/平衡未定：一夜 10 小时、移动 510-1188 秒、探查 1800、休息 3600 秒，实际节奏（一晚约 10-20 次行动）**未做真人试玩验证** | 设计待定 | 需求中的设计意图 + `computeEdgeCost` 计算结果 |
| 13 | **`main.js` 的第 12 行 import 本身就会让模块链接失败**：它从 `map.js` 导入 `isClickable`、`getPickableItems`、`GOAL_ID`、`NODES` 四个名字，而新 `map.js` **一个都没有导出**。这是独立于「state 接口缺失」的第三个阻塞点 | **第二轮新发现**，文档原第 5 节问题 1 未提及，未修复 | `SyntaxError: The requested module './map.js' does not provide an export named 'GOAL_ID'`（实测） |
| 14 | **启动阻塞有三层，顺序已实测确定**：① `config.js` 缺 `CROSS_REGION_COST_SEC`（链接期 SyntaxError）→ ② 补上后 `texts.js` 缺 `SCENES.lighthouse`（求值期 `TypeError: Cannot read properties of undefined (reading 'options')`）→ ③ `main.js` 缺 `GOAL_ID` 等 4 个导入（链接期 SyntaxError）。**只补 config.js 页面依然打不开** | **第二轮实测确认**，未修复 | 在临时副本中逐层补桩后 import 得到的三条报错 |
| 15 | **`v6` 下行尾格式不统一**：7 个文件纯 LF（`index.html`/`config.js`/`inventory.js`/`map.js`/`saveSystem.js`/`state.js`/`timeSystem.js`），5 个文件 CRLF/LF 混排**且带 UTF-8 BOM**（`style.css`/`debug.js`/`main.js`/`terminal.js`/`texts.js`） | 已确认，**刻意未修改** | 逐字节统计。这正是文档里「PowerShell 补丁多次 `MISS`：锚点与实际文件 CRLF/文字不一致」的根因 |
| 16 | 环境：本机 `winget` 完全不可用（任何命令返回 `0x8A150001`），系统 schannel 被环境挡住（`SEC_E_NO_CREDENTIALS`，`curl` 亦不可用），GitHub HTTPS 间歇性失败（DNS 返回污染地址 `198.51.44.8`/`198.51.45.8`） | 已确认（若日后要推远程须注意） | 第二轮实测；本地 Git 不受影响，`git` 已设 `http.sslBackend=openssl` |
| 17 | **mustResolve 门禁仍可被「系统附加入口」满足**（v1.9.0a 已知限制，未修）：`onOptionClick()` 里 `if (node.mustResolve) game.markMustResolveResolved(node.id);` 对任何选项都生效；`terminal.setLocked()` 只 `disable` 输入框**不禁用按钮行**，`.map-modal` 遮罩又只覆盖地图面板 → 弹窗开着时仍可点按钮行的「掏出怀表看一眼」把门禁满足掉。v1.9.0a 只修了弹窗里的误渲染（`resolveMustResolve()` 过滤 `systemOption`），按用户「仅去除误渲染」要求未动这一处 | **已确认，刻意未修** | v1.9.0a 的 `nw_r16_check.mjs` 实测；候选改法：该行加 `&& !option.systemOption`（一行） |
| 18 | v1.9.0a 新增的两份文档（日记 / README）没有独立 CSS 类，外观与物品按钮一致，靠名称区分（第二份的显示名 v1.9.0b2.4 起是 `README`，不再是「作者留言」）；若要做视觉区分需动 `style.css` | 已确认，未做 | `renderInventory()` 复用 `itemButton()`；当前名称即视为已满足 |
| 19 | **v1.9.0b1 没有终局**：旧的 `goal2`（旅者之石）随旧地图删除，终点判定一并移除；灯塔在占位的码头区域，等 b4 落地后接回「到达即游戏结束」 | 已确认，按分块计划留给 b4 | `main.js` 的 `travelTo` 里留了注释说明；`map.js` 没有 `lighthouse` 节点 |
| 20 | **「废弃加油站」是需求边列表里的孤立节点**：改动 4 给的每条边都没有它，照抄会导致永远不可达、也不渲染。v1.9.0b1 按最小改动补了 `apartment → gasstation` 一条边 | 已确认的刻意偏离 | `nw_b1_check.mjs` 里有一条断言专门核对「只多出这一条边」 |
| 21 | **接口白线跟着节点渲染走**：未访问且与当前节点不相邻的接口，白线也一起不画（沿用「不泄露没走过的地图」机制）。所以刚进废城只看得见墙门那 1 根，4 个接口都访问过才是 4 根 | 已确认，未开例外 | `nw_b1_check.mjs` 的改动 6 断言；`renderArea` 里 `if (!states.get(id)) continue` |
| 26 | **v1.9.0b1.1 放大地图后，节点名实测仍只有约 6.5px（偏小）**：画布 ×1.25 与面板 +33% 大致抵消，真实缩放比只从 ~0.375 提到 ~0.40。「一个区域 24 个节点」下，想同时「节点大」又「不重叠」只能继续加大面板或减少单区节点数。本块按要求只改了尺寸与菱形，**没动节点字号** | 已确认，未做 | `nw_b11_check.mjs` 打印了实测缩放与菱形比例 |
| 27 | **v1.9.0b1.1 把左栏从 30% 加宽到 40%**（右栏 70%→60%）以获得更多真实像素；终端 60% 仍充裕，但这是一处布局再平衡 | 已确认，可按需回退 | `style.css` 的 `.app { grid-template-columns: 40fr 60fr }` 与 `.col--left { 45% … }` |
| 28 | **大地图改成按视图设 viewBox**（区域地图用整张画布 `0 0 1250 750`，大地图紧贴区域方框）：为了让连接标签在面板里保持可读。副作用是大地图与区域地图不再共用同一套缩放 | 已确认（改动 5.3 要求） | `map.js` 的 `applyViewBox()` / `worldViewBox()` |
| 29 | **`triggeredEventIds` 记的是「事件被消费」而不是「弹窗出现过」**：弹窗开着时直接关掉页面 → 该事件不算已触发，下次仍会进池 | 已确认，可接受（弹窗无关闭按钮，正常玩法遇不到） | `events.js` 的 `runEventOption()` 末尾打标 |
| 30 | **`/unlockall` 只标当前区域**，不会顺手写对面区域的访问记录；所以解锁完废城后，大地图上「巨墙/荒野/东海岸/工业区」仍要靠正常走过去才亮 | 已确认（需求改动 2-4 明确「不跨区域」） | `debug.js` 的 `/unlockall` 分支 |
| 31 | **`.tools/` 不在版本库里**：改动画布尺寸会让写死坐标的旧断言失效（v1.9.0b1.1 已把 `nw_b1_check.mjs` 里白线判定的 1000/600 改成读 `map.VIEW`）。以后改画布记得同步这类断言 | 已确认，已修一处 | `git ls-files .tools` 为空 |
| 22 | **两块区域的节点都没有 `options` / `dark` / `mustResolve`**：需求只要求「节点 + 文案 + 拓扑 + 物品放置」，交互与钥匙逻辑在 c 块。`REQUIRES` 与 `OPTION_HANDLERS` 机制保留但都是空表 | 已确认，按分块计划 | `map.js` 里 `const REQUIRES = {}`；`main.js` 里 `const OPTION_HANDLERS = {}` |
| 32 | **v1.9.0b2 资源交换的效果数值玩家看不到**：需求只要求「终端输出描述性文本」，所以没有结果弹窗、也没把「时间 +180 秒 / 电量 +5」写给玩家；文案只有定性暗示 | 已确认，等用户定 | `texts.js` 的 `EXCHANGES` 只有 button / desc / narrate |
| 33 | **`电容器` 的 `batteryMaxBonus: 25` 现在只是数据**：本块不实现电量上限系统（c 块做，存档变更也在 c 块），装上也**不会**提高上限，`BATTERY_MAX` 仍是常量 100；发电厂的 30% 也按 100 算 | 已确认，按分块计划留给 c | `nw_b2_check.mjs` 里有断言确认 `inventory.js` 不读这个字段 |
| 34 | **资源↔资源只采用了 3 个示例中的 3 条**（电→体力、体力→电、电→物资）：需求给的「物资 -1 → 体力 +1」要消耗背包里指定的一件物品，而弹窗按需求只有「执行/算了」两个按钮、没有选物品的地方，本块没做 | 已确认（需求说示例可扩写） | `main.js` 的 `EXCHANGE_EFFECTS` 里没有物资消耗型 |
| 35 | **工业区有两处边超出基准拓扑**：需求要求「材料场 ↔ 废水池（至少一条边接入）」，实际补了 `steelmill → materialyard` 与 `coolingtower → wastewater` 两条 —— 只按需求写的那一条虽然也连通，但那一对会变成挂在主链上的死端 | 已确认的刻意补齐 | `nw_b2_check.mjs` 里有一条断言专门核对「只多出这两条边」 |
| 36 | **v1.9.0b2 起字号只放大了物品栏与终端**：`--fs-status`（状态栏）与地图字号没动。左栏物品栏在 45% 高度里行高更大，内容多时靠滚动 | 已确认，按需求范围 | `style.css` 的 `:root` 字号变量 |
| 37 | **发电厂过夜那句文本必须放在 `arriveAt()` 之后**：`arriveAt` 开头 `terminal.clearQueue()` 会把还在排队的行一起清掉（v1.9.0b2 修过一次）。以后往「过夜 / 到达」流程里加输出要记住这条 | 已修复并留注释 | `main.js` 的 `overnightAtShelter()` |
| 23 | **随机刷物品候选只剩「罐头」1 件**（`events.js` 的 `SUPPLY_ITEMS`）：物品表精简后只剩它可用，且刻意排除怀表（唯一任务物品，`collectedItems` 按 id 记会串）。同一节点已有罐头时刷不出来 | 已确认，等 b2+ 物品表变丰富 | `events.js` 顶部注释写明了理由 |
| 24 | **25 个节点挤一张 1000×600 画布**：最近的一对（station ↔ subway）间距 106，叠加 ±35 固定噪声后个别节点可能轻微贴边/重叠。本块按需求「沿用现有伪随机偏移机制」放坐标，没改噪声范围 | 已确认，未做 | `nw_b1_check.mjs` 会打印最近的一对及距离并断言 ≥100 |
| 25 | **`.tools/` 不在版本库里**（gitignore）：回退/切版本时测试脚本不会跟着回退，需要手工对齐；`nw_r8`–`nw_r16` 已在本块作废 | 已确认 | `git ls-files .tools` 为空；作废标记写在各文件头 |

关键报错记录（已确认原因）：
- `SyntaxError: Identifier 'NODES' has already been declared`（`main.js` 被重复插入 import）→ 已修；症状是浏览器整页无输出。
- `TypeError: Cannot read properties of undefined (reading 'id')`（测试脚本对 `options[4]` 取值，实际只有 4 项）→ 测试脚本问题。
- 终端「强制回家提示被吞」→ 根因是 `clearQueue()` 未取消排队中的 drain 定时器；已修（`clearTimeout` + `draining=false`）。
- `document is not defined`（在 Node 里 import `main.js`）→ 预期行为，不是 bug。
- PowerShell 脚本多次 `MISS`：锚点与实际文件 CRLF/文字不一致；以及「JS 模板字面量行尾单反斜杠＝续行符」导致 ASCII 图换行被吃掉（已用 `String.fromCharCode(92)` 双反斜杠修复）。

---

## 6. 调试、运行与验证

- **启动（本机实测可用）**：`cd D:\Dsh\NightWander` → `node serve.mjs 8000` → 访问 `http://127.0.0.1:8000/v6/`（v5 归档在 `/v5/`）。服务器带 `Cache-Control: no-store`。当前交接时 8000 端口**在监听**。
  - 静态托管：直接传 `v6/index.html`、`v6/style.css`、`v6/js/`。
  - **注意**：按上面命令启动的是 `serve.mjs`（零依赖）；`python -m http.server` 在本机不可用（待确认你的环境是否可用）。
- **debug 模式**：`v6/js/config.js` 的 `DEBUG_CONSOLE`（**当前为 `true`**，用户临时开启）。为 `true` 时输入框里以 `/` 开头的输入交给 `debug.js`；为 `false` 时输出「未知的命令」。
- **已实现的调试指令**（实测）：`/time set|add {n}`、`/day set|pass {n}`、`/stamina set|add {n}`、`/staminaMax set {n}`、`/battery set|add {n}`、`/storage set|add {n}`、`/goto {nodeId}`、`/goto help`、`/event [on|off|reset]`、`/version`、`/help`。越界自动 clamp 并提示；非法参数提示「参数错误。用法：…」。
- **测试工具现状（重要）**：**仓库内没有任何测试文件**。所有验证都是我在会话中临时写、用完即删的脚本：
  - Node 侧：静态断言脚本（断言 config 取值、节点/边/选项/存档结构、`computeBatteryCap`、`computeClickable`、`saveSystem` 往返、`visibleOptions` 规则、debug 指令输出等，历史最高单次 200 项断言）；
  - 浏览器侧：headless Chrome + `--dump-dom` + 临时 `_t*.js/_t*.html` 注入脚本，驱动真实点击/输入并回读 DOM。
  - **结论**：没有可复用的自动化测试；每次改动后需要重新写脚本。请新对话在修改前先决定是否落一份测试到仓库。
- **必须通过的回归清单（本次交接时点的真实状态）**：
  1. 页面能加载、模块无链接错误 —— **当前失败/无法测试**（见问题 1、2）。
  2. 终端输出到达文本（斜体、前后空行）+ 选项列表（粗体）—— 曾经浏览器实测通过，**此后的大改动未回归**。
  3. 移动扣体力与耗时、`computeEdgeCost` 数值（`home→n2`=510 秒）—— Node 实测通过（旧版）；新版未验证。
  4. 强制回家（06:00 / 体力归零）先结算再 gameOver —— 旧版浏览器实测通过。
  5. 野外拾取唯一性（`collectedItems`）—— 旧版浏览器实测通过。
  6. 存档导出/导入往返、非法输入返回 `null` —— Node 实测通过（v1 格式）。
  7. Tab 补全循环、历史上下键 —— **仅逻辑审查 + Node 语法检查，未浏览器验证**。
  8. `/event` 六种输入 —— Node 验证通过；浏览器未复测。
- **常见排查路径**：页面空白 → 先看控制台是否模块链接错误（最常见是 import 了不存在的导出）；日志区没输出 → 看 `terminal.writeLine` 与队列；节点点不动 → 看 `computeClickable` 与 `is-hidden` 渲染分支；时间不动 → 看你是否在家（`currentNode === 'home'` 时刻意不流逝）。

---

## 7. 待办任务与开发路线

**当前最优先任务（进行中，用户已给出完整需求）**：把「多区域地图」机制落地。用户按文件拆成「重写」与「打补丁」两类，**必须严格按标记执行、不改其他文件**。

- 已完成子任务：`js/map.js` 重写（已写入文件，**未验证**）。
- 尚未完成（按建议顺序，含前置依赖）：
  1. `js/config.js`：`GAME_VERSION='v1.8.0'`、新增 `SHELTER_OVERNIGHT_COST_SEC=0`、`CROSS_REGION_COST_SEC=3600`（**新 map.js 已 import 后者，属于阻塞项**）。
  2. `js/state.js`：新增 `currentArea/mapView/visitedByArea/sheltersByArea/storageCapacityByShelter`；移除 `homeStorage`（改为 `sheltersByArea.area1.home`）与 `visited`（改名 `visitedByArea`）；提供 `getVisitedByArea`、按 `shelterKey`（形如 `'area1:home'`）的存取函数。
  3. `js/texts.js`：新增 `lighthouse`（灯塔，`items:['pocketwatch']`，desc 提到塔顶怀表）、`southgate`（南门，选项含「前往南边的未知地域」）、area2 五节点（`entrance` 南渡口 / `m1` 枯树林 / `m2` 碎石路 / `m3` 断桥 / `goal2` 旅者之石），每个 8-12 行硬编码 ASCII；怀表从家储物箱移除。
  4. `js/inventory.js`：储物箱按 `shelterKey` 隔离（`computeStorageUsed(shelterKey)`、`getStorageCapacity(shelterKey)`）。
  5. `js/main.js`：`initMap` 后 `setMapView('world')`；点击区域块 → `'area'`／其他区域 → 「你现在不在这里。」；安全屋到达时把「过夜（进入下一天）」与「稍作停留」**插到选项列表最前**，其余安全屋选项（导出/导入/整理）照旧；强制回家改送 `primaryShelter` 且**不自动结算**、惩罚立即生效；跨区域移动（扣 1 体力、`advanceTime(CROSS_REGION_COST_SEC)`、切 `currentArea/currentNode`、`visitedByArea.area2.add('entrance')`、`setMapView('area')`、刷新）；`isShelter` 替换旧 `=== 'home'` 判定；「返回大地图」按钮接线。
  6. `js/saveSystem.js`：升 v2（新字段；`v:1` → 输出「存档版本过旧，无法加载」并返回 `null`；其他 → 「存档无效」）。
  7. `js/debug.js`：`/area list`、`/area goto {areaId}`、`/goto area2:m1` 跨区域语法、`/help` 更新。
  8. `style.css` + `index.html`：`.region-block` / `.region-name` / `.region-link` / 当前区域高亮样式 + 顶部「返回大地图」按钮。
- 验收标准（来自需求）：能从家 → 灯塔 → 南门 → area2 一路走通；大地图只显示已解锁区域并可切换视图；安全屋过夜能结算；强制回家按区域送到各自 `primaryShelter`。

**后续任务（依赖上一项完成）**：真机试玩调平衡（移动/选项耗时与一夜行动次数）；决定是否把「随机事件系统」补上（当前只有 `state.eventsEnabled` 开关与 `/event`，**没有任何事件触发逻辑**）；决定是否落一份持久化测试脚本。

**已明确放弃/暂缓**：图片→ASCII（v6 不用）；距离阈值判定；`REACH` 常量（遗留未清）；v1 存档迁移工具（需求明确「本 demo 暂不提供迁移工具」）。

**需要用户确认**：多区域改造完成后是否要立刻做一次完整浏览器回归；`DEBUG_CONSOLE` 是否要改回 `false` 再交付；`GAME_VERSION` 是否只升到 `v1.8.0` 还是另有规则。

---

## 8. 下次对话开场白

```text
这是一个纯前端「地图探索」demo 项目 NightWander（原生 HTML/CSS/JS + ES module，零依赖、零构建）。
当前代码在 D:\Dsh\NightWander\v6（上一代归档在 v5\），本地预览：node serve.mjs 8000 → http://127.0.0.1:8000/v6/

请先完整阅读项目根目录的 HANDOFF.md（以及 HANDOFF-LITE.md），并严格区分「已实现 / 已验证 / 未验证 / 计划」；
不要仅凭文档假设文件现状，动手前请先实际查看 v6/js 下的相关文件。

然后用 3-5 行复述：项目现状、当前任务、主要风险、你的下一步计划。复述完请停下等我确认，
在我明确同意前不要修改任何代码、不要启动新任务。

本次交接的下一步任务（已明确）：完成「多区域地图」机制（map.js 已重写并写入，但尚未验证，且与其余文件不兼容，
当前项目处于不可运行状态），按 HANDOFF.md 第 7 节的 8 个子任务顺序补齐 config/state/texts/inventory/main/saveSystem/debug/style+html，
并遵守「不改文件结构、不重构、只改点名的位置」这一约束。
```

---

## 附录 A：本次对话结束记录

- **为什么交接**：多区域改造是跨 9 个文件的大改动，当前对话上下文已接近耗尽，无法在同一轮内安全完成；为避免留下无法核对的半成品，先把状态与约束固化成文档。
- **交接前正在做的任务**：「多区域地图」机制（用户给出的重写/补丁清单）。
- **最后一次确认完成的工作**：`js/map.js` 重写完成并已用 `Move-Item` 覆盖到 `v6/js/map.js`（413 行）。
- **最后一次修改是否已保存/运行/验证**：**已保存**；**未运行、未验证**。该次修改本身就会让页面报错（依赖未迁移），这是预期中的中间态。
- **当前停留在哪一步**：map.js 完成、其余 8 个文件未改。
- **下一步具体做什么**：按第 7 节顺序先改 `config.js`（补 `CROSS_REGION_COST_SEC` 等，解除 map.js 的 import 阻塞）与 `state.js`（区域/安全屋字段与函数），再依次 texts → inventory → main → saveSystem → debug → style/html。
- **回退手段**（第二轮已升级）：**首选 Git** —— 仓库位于 `D:\Dsh\NightWander\.git`，`git` 已加入用户 PATH。
  - 回到改造前版本：`git reset --hard v1.7.5-baseline`（或 `git checkout v1.7.5-baseline`）
  - 丢弃当前所有未提交改动：`git restore .`
  - 查看这次到底改了哪些函数/字段：`git diff`
  - 注意：该便携版 Git 的 `git clone` 在本机受限环境（DSH 沙箱禁止命名管道）下会失败并报 `couldn't create signal pipe`，其余命令（status/log/diff/commit/restore/reset/tag/fsck 等）均实测可用。
  - 原 ZIP 备份仍在：`NightWander-v6.zip`（34.2 KB，12 文件）内含**重写前**的 `map.js`（v1.7.5 状态）；`v5\NightWander.zip`（实测 109.6 MB）为更早一代全量（含 pics）。两者均已被 `.gitignore` 排除、未被改动。
- 待确认：`NightWander-v6.zip` 是否已包含最后一次 bug 修复之后的全部文件（该 ZIP 是在「4 个 bug 修复」那一轮结束后重建的，**其后只发生了 map.js 重写**，而重写发生在 ZIP 之后 → 因此 ZIP 里的 map.js 是旧版，其余文件同代）。

---

## 附录 B：信息可信度与缺失项

**由代码/文件直接证实（交接前实测）**
- 目录结构、文件清单与大小；`GAME_VERSION='v1.7.5'`；`DEBUG_CONSOLE=true`；`EVENTS_DEFAULT=false`；`state.js` 无 `getVisitedByArea`、仍有 `homeStorage`；`main.js` 无 `setMapView`；`config.js` 无 `CROSS_REGION_COST_SEC`/`SHELTER_OVERNIGHT_COST_SEC`；8000 端口在监听；`git` 命令不存在。
- `texts.js` 中出现的 `lighthouse` 子串来自文案键 `foundLighthouse`，**不是**灯塔场景 → 灯塔/南门/area2 文案确实缺失。

**由对话明确确认（用户明说）**
- 不使用第三方库/CDN；只改点名位置、不重构；`DEBUG_CONSOLE` 临时开启；v1 存档不提供迁移工具；图片转 ASCII 在 v6 不用。
- 多区域需求的全部字段名、节点名、坐标与流程顺序。

**仅有计划记录（尚未实现）**
- 存档 v2、`/area` 指令、安全屋「过夜」选项、跨区域移动、大地图视图与样式、区域化储物箱、`GAME_VERSION` 升 `v1.8.0`、随机事件系统（只留开关）。

**无法判断/需要用户确认**
- 我无法在本机复现「`/event` 完全无反应」（Node 桩环境可响应）——若你在浏览器仍遇到，请提供控制台报错。
- 未做真人试玩的节奏平衡结论；`southgate` 最终坐标（需求给「例如 (900,300)」，实现取 920）。
- 多区域改造完成后是否需要保留/清理 `v5/`、`serve.mjs` 是否随包交付。
- 交接时无法确认的是：`v6` 目录下是否还存在我在会话中创建但未清理的临时文件（本轮检查的清单里**没有** `_t*.js/_t*.html/_patch*.mjs`，看起来已清理干净）。

---

## 附录 C：HANDOFF-LITE.md

```markdown
# HANDOFF-LITE —— NightWander 精简交接（≤150 行）

## 身份与目标
纯前端「地图探索」文字 demo，原生 HTML/CSS/JS + ES module，零依赖零构建，可直接静态托管。
循环：在家（时间不流逝）→ 出发 → 沿边移动（扣体力 1、耗游戏时间）→ 选项探查/拾取（可扣电、耗时）
→ 06:00 或体力归零被强制回家 → 结算（天数 +1、时间归零、体力电量回满）→ 下一天。

## 路径与运行
- 当前开发目录：D:\Dsh\NightWander\v6（12 文件：index.html、style.css、js/{config,texts,map,state,timeSystem,inventory,saveSystem,debug,terminal,main}.js）
- 上一代归档：D:\Dsh\NightWander\v5（含 10 张 .jpg，v6 不用图片）
- 打包/回退：D:\Dsh\NightWander\NightWander-v6.zip（34.2 KB，含重写前的 map.js）
- 预览：cd D:\Dsh\NightWander && node serve.mjs 8000 → http://127.0.0.1:8000/v6/
  （本机 python 不可用；无 git，回退只能靠 ZIP）

## 当前状态（最重要）
- 版本号：config.GAME_VERSION = 'v1.7.5'（多区域需求要求升 v1.8.0，未做）
- DEBUG_CONSOLE = true（用户临时开启；交付前应改回 false，待确认）
- 阶段：开发中，且**当前不可运行**。map.js 已重写为多区域版（未验证），
  其余 8 个文件未迁移 → 新 map.js 依赖 state.getVisitedByArea / state.currentArea /
  state.sheltersByArea（都不存在），config 缺 CROSS_REGION_COST_SEC（map.js 已 import）→ 启动即报错。

## 核心接口（真实名称）
- state: initState/visit/getCurrentNode/getVisitedByArea(未实现)/getOptions/setOptions/
  markOptionUsed(nodeId,index,perDay)/getUsedGroups/markGroupUsed/getStamina/spendStamina/
  getBattery/spendBattery/getDay/setDay/getElapsedSeconds/setElapsedSeconds/toSnapshot/replaceFromSnapshot
- timeSystem: startClock/stopClock/resetClock/advanceTime(sec)/getTimeString()/computeBatteryCap(sec)
- map(新): getRegion/getCurrentRegion/getNode(areaId,nodeId)/getNodes/getEdges/
  getCrossRegionTarget/isShelter/isPrimaryShelter/computeClickable(areaId,visited)/
  computeEdgeCost(from,to,areaId)/setMapView('world'|'area')/refreshMap/initMap
- terminal: log(text,className)/logLines/clearQueue/visibleOptions/renderButtons/
  handleCommand/setLocked/showModal/copyText
- saveSystem: serialize(snapshot)/deserialize(str)  ← 版本常量当前为 1
- debug: runCommand(input,state,ctx)/getAllCommandNames()
- main: travelTo/arriveAt/pickUpItems/onOptionClick/handleCommand/settleNight/onForceHome/
  ensureTimeOption/buildOptions/availableOptions/refreshButtons/renderStatusBar/renderInventory

## 关键约定（不可擅改）
- 模块边界：map 不判规则、state 不碰 DOM、saveSystem 纯函数、main 唯一协调者；文案只在 texts.js，数值只在 config.js。
- 可点击判定＝已访问 ∪ 与已访问节点有边相连；**不用距离阈值**。
- 边耗时＝距离×DISTANCE_TO_TIME_RATIO(3.0)，支路再×SECONDARY_ROAD_PENALTY(1.4)；跨区域边用其 timeCost。
- 时间用 Date.now() 差值累加；在家不流逝；天数 +1 只发生在结算流程（main.settleNight）。
- 按钮：用过的一次性选项消失；requires 不满足＝灰按钮+title 提示且占编号；group 互斥＝灰。
- 地图：已访问=矩形+名称；未访问可点=黑白菱形(无字)；未访问不可点=不渲染；边两端有隐藏则不画。
- 终端两种主题都黑底白字（--term-* 不随主题变）；深色模式存 localStorage，不进存档。
- 用户硬约束：不改文件结构、不重构、只改点名位置、无第三方库/CDN、响应里要列出改了哪些函数与字段。

## 已知风险
1. 项目当前跑不起来（见「当前状态」）——最高优先级。
2. 仓库内没有任何测试文件；历史验证都是一次性 Node 脚本 / headless Chrome 注入脚本，均已删除。
3. Tab 补全循环、escapeHtml、到达斜体/选项粗体 这批改动只做过 Node 逻辑验证，未做浏览器回归。
4. /event 曾报「失效」，Node 桩环境无法复现；已重写并 Node 验证六种输入。
5. 遗留未清理：REACH 常量（无人引用）；琥珀色已被主题黑白替代但仅经补丁输出确认。
6. 手感/平衡未试玩验证。

## 下一步（已明确，按序）
1. config.js：GAME_VERSION='v1.8.0'、SHELTER_OVERNIGHT_COST_SEC=0、CROSS_REGION_COST_SEC=3600
2. state.js：currentArea/mapView/visitedByArea/sheltersByArea/storageCapacityByShelter，去掉 homeStorage/visited
3. texts.js：lighthouse(灯塔, items:['pocketwatch'])、southgate(南门, 选项「前往南边的未知地域」)、area2 五节点(entrance/m1/m2/m3/goal2) + ASCII
4. inventory.js：储物箱按 shelterKey 隔离
5. main.js：视图切换与「返回大地图」、安全屋「过夜/稍作停留」置顶、强制回家送 primaryShelter 且不自动结算、跨区域移动、isShelter 判定
6. saveSystem.js：升 v2（v1 → 「存档版本过旧，无法加载」返回 null）
7. debug.js：/area list|goto、/goto area2:m1、/help
8. style.css + index.html：.region-* 样式与顶部按钮

## 新对话开场提示（简短版）
「请先读 HANDOFF.md + HANDOFF-LITE.md 并实际查看 v6/js 下的代码，用 3-5 行复述现状/任务/风险/下一步后停下等我确认；
在确认之前不要改代码。下一步是按 HANDOFF 第 7 节完成多区域改造（当前项目不可运行）。」
```

---

## 附录 D：第二轮核对记录（2026-10-10，实测）

> 本轮任务：① 核对本文档与代码是否一致；② 建立本地 Git 版本控制。**未修改任何游戏逻辑代码。**

### D.1 核对方法

- **模块加载实验**：用 `node` 动态 `import()` 逐个加载 `v6/js/*.js`，记录真实报错。
- **导出表比对**：提取 `main.js` 的 `import { ... } from './map.js'` 名单，与 `map.js` 的 `export` 求差集。
- **字节校验**：建仓前后对 `v6/` 12 个文件做 SHA256 逐一比对。

### D.2 文档与代码一致的部分（文档可信）

| 文档声称 | 实测 |
|---|---|
| `GAME_VERSION='v1.7.5'`、`DEBUG_CONSOLE=true`、`EVENTS_DEFAULT=false` | ✅ 一致 |
| `config.js` 无 `CROSS_REGION_COST_SEC` / `SHELTER_OVERNIGHT_COST_SEC` | ✅ 一致（共 19 个导出） |
| `state.js` 仍有 `visited`/`homeStorage`，无 `getVisitedByArea` | ✅ 一致（共 46 个导出） |
| 新 `map.js` 的 `REGIONS`/节点/坐标/跨区域边结构 | ✅ 与需求一致 |
| `texts.js` 只有 `home, n1–n7, goal` 共 9 场景 | ✅ 一致 |
| `main.js` 无 `setMapView`，仍用 `=== 'home'` 硬编码 | ✅ 一致 |
| `saveSystem.js` `VERSION = 1`；`debug.js` 无 `/area` | ✅ 一致 |
| `style.css` 无 `.region-*`/`.road--cross`；`index.html` 无「返回大地图」按钮 | ✅ 一致 |
| 仓库内无遗留临时脚本 | ✅ 干净 |

**唯一数字差错**：`map.js` 实测 **420 行**，文档原记 413 行（已在第 2 节表格修正）。

### D.3 文档遗漏的新发现

见第 5 节新增问题 **13、14**：`main.js` 从 `map.js` 导入的 `isClickable` / `getPickableItems` / `GOAL_ID` / `NODES` 四者在新 `map.js` 中**均不存在**。这本身就是一个链接期致命错误，而不是文档所说的「只是尚未区域化改造」。

```text
main.js 需要：initMap, refreshMap, isClickable, getNode, computeEdgeCost,
             getPickableItems, HOME_ID, GOAL_ID, NODES
map.js 提供：VIEW, NODE_W, NODE_H, HOME_ID, REGIONS, getRegion, getCurrentRegion,
             getNode, getNodes, getEdges, getCrossRegionTarget, isShelter,
             isPrimaryShelter, distance, computeClickable, computeEdgeCost,
             initMap, setMapView, getMapView, refreshMap, unlockedAreas, isAreaUnlocked
缺失：isClickable, getPickableItems, GOAL_ID, NODES
```

### D.4 实测的三层启动阻塞（按触发顺序）

在**临时副本**中逐层补桩后重新加载模块得到（仓库文件未参与）：

```text
1) map.js  → SyntaxError: './config.js' does not provide an export named 'CROSS_REGION_COST_SEC'
2) 补上该常量后 →
   map.js  → TypeError: Cannot read properties of undefined (reading 'options')   ← SCENES.lighthouse 不存在
3) main.js → SyntaxError: './map.js' does not provide an export named 'GOAL_ID'
```

**结论：只改 `config.js` 解决不了问题。** 第 7 节的 8 个子任务里，config / state / texts / main 必须一起到位，页面才能重新起来。

### D.5 本轮建立的 Git 版本控制

- **工具**：PortableGit **2.56.0.windows.2**，位于 `.tools\PortableGit\`（445 MB，已 gitignore），`cmd\` 与 `bin\` 已加入**用户级 PATH**。
- **仓库**：`D:\Dsh\NightWander\.git`，默认分支 `main`。
- **初始提交**：`0c08aad`，16 文件 / 3666 行插入。
- **标签**：`v1.7.5-baseline`（多区域改造前的安全回退点）。
- **仓库级配置**（只写本仓库，未动全局）：`user.name=NightWander`、`user.email=2726904437@qq.com`、`core.autocrlf=false`、`core.safecrlf=false`、`http.sslBackend=openssl`。
- **`.gitignore` 关键排除**：`.tools/`、`v5/`、`*.zip`。
  依据：`v5\NightWander.zip` 实测 **109.6 MB**，超过 GitHub 单文件 100 MB 硬上限。
- **为什么设 `core.autocrlf=false`**：`v6` 下 7 个文件是纯 LF、5 个文件是 CRLF/LF 混排且带 UTF-8 BOM。任何行尾归一化规则都可能在 checkout 时改写文件，故按字节原样存取。
- **验证**：`git diff HEAD` 为空；16 个文件 `hash-object` 与 HEAD 逐一相符；`v6/` 12 个文件 SHA256 与建仓前基线**差异为 0**；`git fsck` 无错。

### D.6 本机环境限制（实测，仅备查）

| 现象 | 说明 |
|---|---|
| `winget` 任何命令返回 `0x8A150001` | 无法用于装软件；当前用户也不是管理员 |
| 系统 schannel `SEC_E_NO_CREDENTIALS` | `curl.exe`、PowerShell `Invoke-RestMethod` 均无法建 TLS；**Node 的 `fetch` 可用**，故改用 Node 下载 |
| `git clone`（本地仓库）失败 | `sh.exe: couldn't create signal pipe, Win32 error 5`——受限环境禁止命名管道；其余 git 命令实测全部可用 |
| 写注册表被拒 | 首次尝试加 PATH 被沙箱拒绝 `Requested registry access is not allowed`，经用户批准后成功 |
| GitHub 间歇性连不通 | `github.com` DNS 返回污染地址 `198.51.44.8`/`198.51.45.8`；本机 `127.0.0.1:10808` 代理未在监听。**本轮不需要，仅备查** |

### D.7 用户决定

- **只用本地 Git，不建 GitHub 远程仓库** —— 原第 7 节之后的远程推送计划全部作废。
- `user.name` 目前是占位值 `NightWander`，用户尚未提供正式署名。
- 用户要求：**v1.8.0 改造每个子步骤都要提交一次，保证随时可回档。**
