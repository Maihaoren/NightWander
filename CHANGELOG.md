# CHANGELOG —— NightWander 更新日志

> **维护规则（重要，勿跳过）**
> 1. 每次改动 `v6/js/config.js` 里的 `GAME_VERSION`，**必须同时在本文件顶部新增一节**。不允许只改版本号不写日志。
> 2. 新版本写在「未发布」下方，标题格式：`## [vX.Y.Z] — YYYY-MM-DD —— 一句话主题`，正文里写明对应的 git 标签。
> 3. 版本定稿后打标签：`git tag -a vX.Y.Z -m "..."`。
> 4. 只写**已经发生的事实**。计划、想法、待办一律放 `HANDOFF.md`，不要写进来。
> 5. 中文书写；改动要可审计（写清改了哪些文件、哪些函数/字段、签名怎么变的）。

## ⚠️ 两套编号不要混

| 编号 | 定义位置 | 当前值 | 含义 |
|---|---|---|---|
| `GAME_VERSION` | `v6/js/config.js` | `v1.8.0` | 面向玩家的游戏版本 |
| `VERSION` | `v6/js/saveSystem.js` | `2` | **存档结构**版本 |

两者独立递增：游戏版本升了但存档结构没变，`VERSION` 就不用动；反之亦然。
**只要 `VERSION` 变了，本文件必须写明「旧存档能否加载」。**

## 分类约定（Keep a Changelog 精简版）

- **新增**：新功能、新内容
- **变更**：已有行为或接口的变化（签名变化必须列表写清）
- **修复**：修掉的 bug（写清**症状 + 根因**，不只是「修了个 bug」）
- **移除**：删掉的东西
- **已知限制 / 遗留**：明确知道、但本轮不处理的问题
- **回档点**：对应的 git 标签

---

## [未发布]

（下一次开发从这里开始写。当前没有进行中的改动。）

---

## [v1.8.0] — 2026-10-10 —— 多区域地图

**回档点**：`v1.8.0`（另有逐步骤标签 `v1.8.0-step1` ~ `v1.8.0-step8`，可逐步回退）
**存档格式**：`1` → **`2`**。**v1 存档无法加载**，导入时提示「存档版本过旧，无法加载」（按需求不提供迁移工具）。

### 背景

v1.7.5 的 `js/map.js` 已被重写为多区域版，但其余 8 个文件没有跟着迁移，导致项目**完全无法启动**（三层致命错误）。
本版本把这 8 个文件补齐，项目恢复可运行。

### 新增

- **多区域地图**：`area1 家与灯塔`（10 节点）、`area2 未知地域`（5 节点）；区域间经南门**单向**连通
- **大地图视图**：只渲染已解锁区域；点击当前区域进入区域地图，点击其他区域提示「你现在不在这里。」
- **「返回大地图」按钮**（地图面板标题栏右侧，与「深色模式」按钮同一套样式）
- **安全屋机制**：`home`（家）/ `lighthouse`（灯塔）/ `entrance`（南渡口）三处
  - 到达安全屋时，选项列表**最前面**插入「过夜（进入下一天）」与「稍作停留」；导出/导入存档照旧跟在后面
  - 「过夜」触发结算：天数 +1、时间归零、体力电量回满、perDay 选项复位
- **跨区域移动**：南门的「前往南边的未知地域」，扣 1 体力、耗时 3600 游戏秒，切到 area2 的南渡口
- **安全屋储物隔离**：各安全屋的储物箱与容量互相独立（键为 `areaId:nodeId`，如 `area1:home`）
- 新增 6 个场景：`southgate` 南门 / `entrance` 南渡口 / `m1` 枯树林 / `m2` 碎石路 / `m3` 断桥 / `goal2` 旅者之石（各 11–12 行硬编码 ASCII）
- 灯塔节点新增可拾取物品**怀表**（原先开局就在家的储物箱里）
- debug 新增指令：`/area list`、`/area goto {areaId}`、`/goto {areaId}:{nodeId}`（跨区域传送）

### 变更

- `GAME_VERSION`：`v1.7.5` → `v1.8.0`
- 旧场景 `goal`（灯塔）**改名为** `lighthouse`，并从「终点」变为「中途节点」；新终点是 area2 的 `goal2`（旅者之石）
- **主动回家不再自动结算**：走到安全屋只是「到达」，是否过夜由玩家用选项决定
- **强制回家**改为送回**当前区域自己的** `primaryShelter`（area1 → 家，area2 → 南渡口），体力上限惩罚立即生效，且不再自动结算
- 场景总数：9 → **15**
- 储物箱 UI 的出现条件由「在 `home`」改为「当前节点是安全屋」
- UI 文案键数：44 → **50**
- debug 指令数：10 → **11**

**接口签名变化（`state.js`）**

| 旧签名 | 新签名 |
|---|---|
| `visit(id)` | `visit(areaId, nodeId)` |
| `getVisited()` | `getVisitedByArea(areaId)` |
| `isVisited(id)` | `isVisited(areaId, nodeId)` |
| `getHomeStorage()` | `getShelterStorage(shelterKey)` |
| `getStorageCapacity()` | `getStorageCapacity(shelterKey)` |
| `setStorageCapacity(v)` | `setStorageCapacity(shelterKey, v)` |
| `addToStorage(item)` | `addToStorage(shelterKey, item)` |
| `removeFromStorage(item)` | `removeFromStorage(shelterKey, item)` |

**`state` 字段变化**

- 新增：`currentArea`、`mapView`、`visitedByArea`、`sheltersByArea`、`storageCapacityByShelter`
- 删除：`visited`、`homeStorage`、`storageCapacity`

**新增导出函数**：`getCurrentArea`、`setCurrentArea`、`getMapView`、`setMapView`、`makeShelterKey`、`getShelterStorage`（`state.js`）；`peekVersion`（`saveSystem.js`）

**`main.js` 新增内部函数**：`currentShelterKey`、`switchMapView`、`onRegionClick`、`goCrossRegion`、`overnightAtShelter`、`stayAtShelter`、`getPickableItems`；`redrawHomeQuietly` 改名 `redrawShelterQuietly`

### 修复

1. **项目完全无法启动**（三层阻塞，实测的触发顺序）
   - `config.js` 缺 `CROSS_REGION_COST_SEC` → `SyntaxError: './config.js' does not provide an export named 'CROSS_REGION_COST_SEC'`
   - 补上该常量后，`texts.js` 缺 `SCENES.lighthouse` → `TypeError: Cannot read properties of undefined (reading 'options')`
   - `main.js` 仍从 `map.js` 导入已不存在的 `isClickable` / `getPickableItems` / `GOAL_ID` / `NODES` → `SyntaxError`
   - 只改 `config.js` 页面依然打不开，这四个文件必须一起到位
2. **南门在画布外，永远点不到**
   - 症状：`area2` 根本无法到达，验收标准失效
   - 根因：`index.html` 的 `viewBox` 是 `0 0 900 600`，而 `map.js` 的 `VIEW` 是 1000×600、南门在 `x=920`
   - 修复：`viewBox` 改为 `0 0 1000 600`
3. **存档导出后必定导入失败**
   - 根因：`state.toSnapshot()` 已改成多区域结构，而 `deserialize()` 仍在校验 `visited` / `homeStorage` / `storageCapacity`
   - 修复：存档升 v2，校验表与结构同步
4. **「过夜」用一次就永久消失**
   - 根因：它按普通一次性选项处理，用过即被 `markOptionUsed` 记入持久已用表
   - 修复：标为 `perDay: true`，由结算流程的 `clearPerDayOptions` 复位
5. **`/storage` 在写已被删除的字段**
   - 根因：仍读写 `state.storageCapacity`（步骤 2 已删除），会写出 `undefined`
   - 修复：改为写「当前节点所在储物箱」的容量

### 移除

- `state.visited` / `state.homeStorage` / `state.storageCapacity` 三个字段
- 旧的 `goal` 场景键（已改名 `lighthouse`）

### 已知限制 / 遗留

1. **南门 → area2 的连线不绘制**。`map.js` 的 `renderArea` 用 `getNode('area1', 'area2:entrance')` 取跨区域边端点会取到 `null`，于是跳过画线。**仅视觉问题**，不影响跨区域移动。修它需要改 `map.js`，本轮按「只改点名文件」的约束未动。
2. **时间只在 `home` 暂停**。`timeSystem.js` 的判定是 `currentNode === 'home'`，所以在灯塔/南渡口这类安全屋时间照常流逝，天亮会被强制送回该区域的主安全屋。是否扩展到所有安全屋**待定**。
3. **`inventory.js` 未按 `shelterKey` 改造**。它 8 个函数全是 `(storage, capacity)` 泛型参数，隔离由 `main.js` 传入对应数据实现。若按原计划加 `computeStorageUsed(shelterKey)`，会让 `inventory` 反向依赖 `state`，破坏模块边界。
4. **无人引用的遗留**：`texts.js` 的 `UI.foundLighthouse`（已被 `UI.foundJourneyEnd` 取代）、`map.js` 的 `SAVE_OPTIONS`（声明后从未使用）、v1.7.5 起就遗留的 `REACH` 常量。
5. **未做真实浏览器回归**。本轮只用最小 DOM 桩执行了 `boot()`，确认无异常、选项顺序与终端日志正确；真实浏览器的视觉与交互（深色模式、大地图 hover、点击区域块切换视图、跨区域全流程）**尚未人工确认**。

### 改动规模

`git diff --stat v1.7.5-baseline HEAD`（含 `HANDOFF.md` 文档更新）：**9 files changed, 692 insertions(+), 137 deletions(-)**

| 文件 | v1.7.5 | v1.8.0 | 增减 |
|---|---:|---:|---:|
| `v6/js/config.js` | 23 | 25 | +2 |
| `v6/js/state.js` | 328 | 395 | +67 |
| `v6/js/texts.js` | 286 | 424 | +138 |
| `v6/js/main.js` | 672 | 798 | +126 |
| `v6/js/saveSystem.js` | 53 | 79 | +26 |
| `v6/js/debug.js` | 186 | 220 | +34 |
| `v6/index.html` | 86 | 89 | +3 |
| `v6/style.css` | 540 | 603 | +63 |
| `v6/js/map.js` | 420 | 420 | 0（**未改动**） |
| `v6/js/inventory.js` | 60 | 60 | 0（**未改动**） |
| `v6/js/terminal.js` | 369 | 369 | 0（**未改动**） |
| `v6/js/timeSystem.js` | 91 | 91 | 0（**未改动**） |

---

## [v1.7.5] — 2026-10-10 —— 首次纳入版本控制的基线

**回档点**：`v1.7.5-baseline`（本仓库的初始提交 `0c08aad`）
**存档格式**：`1`

### 说明

本仓库建立时项目已经是 v1.7.5。**v1.7.5 之前没有可考证的更新记录**——当时没有版本控制，回退只能靠 ZIP 包。
本节只记录「纳入版本控制那一刻的实际状态」，作为后续版本的对照基线。

### 当时的状态

- 单区域地图，9 个场景：`home`（家）+ `n1`~`n7` + `goal`（灯塔）
- 已有系统：游戏时间与天数、体力与体力上限、电量（随时间衰减上限）、夜晚结算、物品与装备槽/口袋、储物箱、存档导出导入、debug 指令 10 条
- `js/map.js` 已被重写为多区域版，但与其余文件不兼容 → **项目此时无法启动**（已在 v1.8.0 修复）
- `DEBUG_CONSOLE = true`（用户临时开启，**交付前应改回 `false`**）
- `EVENTS_DEFAULT = false`（只留开关，没有任何事件触发逻辑）

### 同一提交里完成的事（与游戏逻辑无关）

- 建立本地 Git 仓库；`.gitignore` 排除 `v5/`（含 10 张 JPG 与 `NightWander.zip`，合计约 230 MB，其中单个 ZIP 达 109.6 MB、**超过 GitHub 单文件 100 MB 上限**）、`*.zip`、`.tools/`
- 打标签 `v1.7.5-baseline`，作为多区域改造前的安全回退点
- `HANDOFF.md` 补充「附录 D：第二轮核对记录」
