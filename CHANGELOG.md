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
| `GAME_VERSION` | `v6/js/config.js` | `v1.8.2` | 面向玩家的游戏版本 |
| `VERSION` | `v6/js/saveSystem.js` | `3` | **存档结构**版本 |

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

## [v1.8.2] — 2026-10-10 —— 地图结构重构：家独立成区域，灯塔成为跨区域共享节点

**回档点**：`v1.8.2`（另有逐步骤标签 `v1.8.2-refactor-step1` ~ `step7`，可逐步回退）
**存档格式**：`2` → **`3`**。**v1 与 v2 存档都无法加载**，导入时提示「存档版本过旧，无法加载」
（按需求不提供迁移工具）。

### 背景

v1.8.0 的结构是「家是 area1 的一个节点，area1 与 area2 靠一个独立的 southgate 节点 +
一条跨区域边连接」。本次改为：

- **家提升为独立区域** `home`，同时保留在 area1 的节点列表里作为 area1 的起点
- **灯塔就是跨区域连接点**，`southgate` 节点整条删除
- **灯塔同时属于 area1 与 area2**（共享节点）
- 大地图渲染规则与区域地图完全一致

### 新增

- **NODES 全局节点字典**：13 个节点以 id 为键，id 全局唯一；节点新增字段
  `mustResolve` 与 `mustResolveDesc`
- **三个区域**：`home`（家）/ `area1`（荒原）/ `area2`（未知地域）；
  REGIONS 的 `nodes` 改为 **id 数组**，并新增 `type` 与 `neighbors`
- **共享节点机制**：`home` 同时属于 home/area1，`lighthouse` 同时属于 area1/area2；
  区域之间**不再有跨区域边**，切换区域就是换一个视图，玩家仍站在同一节点上
- **大地图三态渲染**（与区域地图规则一致）：
  已解锁且访问过 → 实心矩形块 + 区域名；已解锁未访问 → 菱形不显示名称；未解锁 → 完全不渲染
- **区域通道**由 `neighbors` 推导、去重，只在两端区域都可见时画，用粗线 `.region-link`
- **`js/modal.js`**：通用模态 API `showModal({ title, desc, items, actions })`，
  半透明遮罩覆盖地图区、不可点击遮罩关闭、复用 `.term-button` 样式
- **拾取改为「整理物品」式弹窗**：到达节点若地上有东西就弹窗，
  点单件 → 尝试拾取（空间不够弹替换模态，处理完回到拾取模态，成功则该行消失），
  「带走拿得下的」按节点顺序依次拿、遇到第一个拿不下的就停，「全部放弃」则全部留在节点；
  **拾取与放弃都不消耗时间**
- **mustResolve 改为弹窗**：到达关键节点后弹出「必须从里面选一个」的模态；
  无可点选项时输出「这里似乎没什么可做的。」并视为已解除
- **5 个关键节点**：`n1` `n3` `n5` `n7` `lighthouse`；`n2` `n4` `n6` `goal2` `home` 不标记
- debug 新增/更新：`/area list` 显示三区域，`/area goto {areaId}` 优先停在共享节点上

### 变更

- `GAME_VERSION`：`v1.8.1` → `v1.8.2`
- `state.currentArea` 取值变为 `'home' | 'area1' | 'area2'`，开局在 `home`
- `visitedByArea` 按三个区域记录；**共享节点被访问时在每个所属区域里都标记**
- **储物键与 mustResolve 键改用裸 `nodeId`**（节点 id 已全局唯一）；
  `makeShelterKey(areaId, nodeId)` 删除
- `isShelter(nodeId)` = **所有区域 `primaryShelter` 的并集**（= `home` 与 `lighthouse`）；
  `isPrimaryShelter(nodeId)` 对当前区域判定
- `map.getNode(nodeId)` 改为全局查表（仍容错接受 `'area2:m1'` 前缀写法）
- `travelTo` 要求目标节点属于当前区域，且只查当前区域的边
- 强制回家送到**当前区域自己的** `primaryShelter`（home → home，area1 → home，area2 → lighthouse）
- 删除 `southgate` 与 `entrance` 两个场景；`lighthouse` 的 desc 增加从塔顶能望见未知地域边缘
- area2 的四个节点（m1 枯树林 / m2 碎石路 / m3 断桥 / goal2 旅者之石）沿用 v1.8.0 已有的
  11–12 行纯 ASCII，本次未改

### 已知限制 / 遗留

1. **静态 `unlocked` 标记必须保留**。需求写「区域解锁 = `visitedByArea[id].size > 0`」，
   但开局 area1 访问数为 0；若严格按此判定，area1 在大地图上不会渲染，
   玩家就没有入口从「家」走进 area1。因此实现为
   `isAreaUnlocked = 数据里的初始 unlocked || 访问过任一节点`。
   开局大地图实测：`home` 实心矩形 + `area1` 菱形 + `area2` 不渲染。
2. **N1 的名称与需求描述对不上**。需求写「N1 中央大道（捡手电筒）」，但当前
   `n1` 是北岭松林（才有手电筒），中央大道是 `n2`（放的是火把）。
   本次按 id 与「捡手电筒」判定，标记的是 `n1`，未改任何节点名。
3. **`home` 区域只有一个节点，坐标沿用 (80,300)**（共享节点只有一组坐标），
   单独看「家」区域的区域地图时，这个节点会显示在偏左的位置，不在正中。
4. **area2 的布局向左延伸**。`lighthouse` 的坐标由 area1 那侧定死（x=800，最右），
   右边放不下 m1~goal2，所以 area2 是 lighthouse(800,300) → m1(620,120) →
   m2(460,300) → m3(300,120) → goal2(140,300)。噪声重叠实测为 0。
5. **mustResolve 的「不能离开」闸门保留**（v1.8.1 已有）。弹窗负责逼玩家选，
   闸门负责选了才能走。但模态只覆盖地图区，终端输入框没被挡住，
   理论上能用 `/goto` 绕过闸门（`goto` 不经过 `travelTo`）。
6. **`UI.notHere`（你现在不在这里。）与 `UI.crossRegionWalk` 已成为无人引用的遗留文案**，
   它们被「你无法直接前往那里，需要走陆路。」与「你不在通往那里的路上。」取代。
7. 上一版遗留未动：时间只在 `home` 节点暂停（`timeSystem.js` 的判定），
   在灯塔过夜时时间照常流逝；`UI.foundLighthouse` / `SAVE_OPTIONS` / `REACH` 无人引用。
8. **仍未做真实浏览器回归**（本机无可用浏览器自动化）。本轮做到 11 个模块全部链接、
   DOM 桩跑通 `boot()`、完整路径模拟、存档 v3 往返与旧版本拒绝；
   视觉与交互（模态观感、大地图三态、共享节点切换）仍需人工确认。

### 完整可玩路径（实测数字）

| 步 | 区域 | 节点 | 动作 | 耗时 | 体力 |
|---|---|---|---|---|---|
| 0 | home | home | 开局 | — | — |
| 1 | area1 | home | 在共享节点 home 上切到 area1 | 0 | 0 |
| 2 | area1 | n2 | home → n2（中央大道） | 510 | −1 |
| 3 | area1 | n5 | n2 → n5（废弃哨塔）**mustResolve** | 600 | −1 |
| 4 | area1 | n7 | n5 → n7（岔路口）**mustResolve** | 600 | −1 |
| 5 | area1 | lighthouse | n7 → lighthouse（灯塔）**mustResolve** | 450 | −1 |
| 6 | area2 | lighthouse | 在共享节点 lighthouse 上切到 area2 | 0 | 0 |
| 7 | area2 | m1 | lighthouse → m1（枯树林） | 764 | −1 |
| 8 | area2 | m2 | m1 → m2（碎石路） | 722 | −1 |
| 9 | area2 | m3 | m2 → m3（断桥） | 722 | −1 |
| 10 | area2 | goal2 | m3 → goal2（旅者之石）→ 首次到达即 gameOver | 722 | −1 |

合计：移动 8 次、5090 秒、体力 −8；两次区域切换各 0 体力 0 时间。

### 改动规模

| 文件 | 说明 |
|---|---|
| `v6/js/map.js` | 数据结构、查询接口、大地图渲染整体重写 |
| `v6/js/state.js` | 三区域、markVisited、键改 nodeId |
| `v6/js/main.js` | visitNode、区域切换、拾取弹窗、mustResolve 弹窗 |
| `v6/js/modal.js` | **新增** |
| `v6/js/texts.js` | 删 2 个场景、改灯塔、加 mustResolveDesc、加 8 条 UI 文案 |
| `v6/js/saveSystem.js` | 升 v3 |
| `v6/js/debug.js` | `/storage` 键、`/help`、`USAGE` |
| `v6/js/config.js` | 版本号 |
| `v6/style.css` | 模态样式 |

---## [v1.8.1] — 2026-10-10 —— 手持槽改为「保底物品栏」＋ 5 处改动

**回档点**：`v1.8.1`
**存档格式**：仍为 **`2`**，**未变更**。v1.8.0 的存档可正常导入——
新增的 `resolvedMustResolve` 是可选字段，旧存档缺它时按空集处理（= 都没解除，安全默认）。

### 修复

1. **手持槽不是「装备槽」，而是「保底物品栏」**（核心 bug）
   - 症状：空手时携带容量是 `0/0`，什么都装不下；手持槽只能放 `slot === 'hand'` 的物品；
     手拿大衣还会平白多出 3 格
   - 根因：`computePocketCapacity` 只累加四个槽的 `pockets`，把 `hand` 当成了普通装备槽
   - 修复：**总携带容量 = 手持保底 1 格 + `torso/legs/back` 的 `pockets` 之和**；
     手持槽不限物品类型，手持物品不提供任何效果
   - 基准：空手 `0/1`；空手 + 大衣(3) + 牛仔裤(2) = `6`

### 新增

- **手持槽独立成「保底物品栏」**：固定 1 格、任何物品都能放、不提供额外格数
- **野外「口袋 ↔ 手持」双向移动**：野外不再完全锁定装备，**手持槽例外**；
  `torso/legs/back` 仍然锁定，家的整理模式不变
- **空输入回车 = 执行编号最小的可点选项**；没有可点选项时输出「当前没有可执行的选项」
- **mustResolve 节点机制**：到达后必须先做出一次选择才能离开；未解除时点别处输出
  「你需要先在这里做出决定。」且**不消耗任何资源**。n7「岔路口」已启用
- **节点坐标噪声**：按 `nodeId` 做确定性固定偏移，主干道有摆动感

### 变更

- **布局 22% / 78% → 30% / 70%**；左栏内部 55 / 45 不变；状态栏 / ASCII / 终端随右栏自动跟随
- **严格边渲染**：一条边只有在两端节点都可见（已访问 **或** 可点击）时才绘制。
  实测开局从会画 **11 条**边降到 **3 条**（`home→n1/n2/n3`），
  其余 8 条通往不可见节点的悬空线不再泄露地图结构
- `planUnequip` 的容量判定基准由「总容量」改为「装备提供的口袋数」
  （手持保底那 1 格不随脱下装备变化）
- `planTakeFromStorage` 增加手持兜底：口袋满且手持空时可选择「拿在手里」
- `texts.js` 新增 4 条文案：`toHand` / `toPocket` / `mustResolveFirst` / `noOptionToRun`

### 已知限制 / 遗留

1. **噪声范围最终取 ±35，不是需求原文的 ±40**。±40 实测有 2 对节点框相交
   （`home↔n2`、`lighthouse↔southgate`），±35 是「无重叠」的最大值。
   同时 `drawPos` 会把绘制坐标**夹回画布内**——最右侧的 `southgate` 原始 `x=920`、
   节点半宽 65，加噪声后会被 `viewBox` 裁掉一截。
2. **严格边渲染没有完全达成「开局只看到家一个节点」**。按需求给的规则
   （两端都处于「已访问**或**可点击」），开局 `n1/n2/n3` 本身是可点击的，
   所以它们以及 `home→n1/n2/n3` 三条线仍会渲染。
   要去掉这三条线得改成「两端都必须已访问」，但那样会出现
   「看得到菱形节点、却看不到它与家的连线」，与既有的「看得见路就能走」原则冲突，故未改。
3. **替换弹窗仍只列口袋物品**。口袋满且手持也占用时，无法在弹窗里直接丢掉手持那件；
   只能丢口袋里的（新物品会进刚空出的口袋格），功能不受影响。
4. 上一版遗留未动：南门 → area2 的连线不绘制；时间只在 `home` 暂停；
   `inventory.js` 未按 `shelterKey` 改造；`UI.foundLighthouse` / `SAVE_OPTIONS` / `REACH` 无人引用。
5. **仍未做真实浏览器回归**（本机无可用浏览器自动化）。本轮用最小 DOM 桩跑通了 `boot()`，
   并端到端验证了空回车行为，视觉与交互仍需人工确认。

### 改动规模

9 个代码文件：**+252 / −32**

| 文件 | 增减 | 说明 |
|---|---|---|
| `v6/js/inventory.js` | +50 / −11 | 核心修复 |
| `v6/js/main.js` | +90 / −11 | 拾取、口袋↔手持、mustResolve 闸门 |
| `v6/js/map.js` | +70 / −6 | 严格边渲染、坐标噪声、mustResolve 字段 |
| `v6/js/state.js` | +16 / −0 | `resolvedMustResolve` 与读写函数 |
| `v6/js/terminal.js` | +16 / −1 | 空回车 |
| `v6/js/texts.js` | +4 / −0 | 4 条文案 |
| `v6/js/saveSystem.js` | +3 / −0 | 可选字段的宽容校验 |
| `v6/style.css` | +2 / −2 | 30 / 70 布局 |
| `v6/js/config.js` | +1 / −1 | 版本号 |

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
