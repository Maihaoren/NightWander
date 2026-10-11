# CHANGELOG —— NightWander 更新日志

> **维护规则（重要，勿跳过）**
> 1. 每次改动 `v6/js/config.js` 里的 `GAME_VERSION`，**必须同时在本文件顶部新增一节**。不允许只改版本号不写日志。
> 2. 新版本写在「未发布」下方，标题格式：`## [vX.Y.Z] — YYYY-MM-DD —— 一句话主题`，正文里写明对应的 git 标签。
> 3. 版本定稿后打标签：`git tag -a vX.Y.Z -m "..."`。
> 4. 只写**已经发生的事实**。计划、想法、待办一律放 `HANDOFF.md`，不要写进来。
> 5. 中文书写；改动要可审计（写清改了哪些文件、哪些函数/字段、签名怎么变的）。
> 6. **版本号该不该升、日志怎么写，由助手自行评估并直接执行，不再逐次询问用户。**
>    有功能或内容变化就升版本，纯文档或内部整理可只记日志不升版本；升了就必须在本文件留一节。
> 7. **版本号默认只递增 patch**（v1.8.5 → v1.8.6 → …），**不升 minor**，除非用户明确要求。

## ⚠️ 两套编号不要混

| 编号 | 定义位置 | 当前值 | 含义 |
|---|---|---|---|
| `GAME_VERSION` | `v6/js/config.js` | `v1.8.6` | 面向玩家的游戏版本 |
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

## [v1.8.6] — 2026-10-11 —— 修 4 个问题：返回按钮、移动输出格式、标签字号与节点自适应缩放、已探明路径连通性

**回档点**：`v1.8.6`
**存档格式**：仍为 **`3`**，**未变更**。

### 修复

1. **大地图上「返回区域地图」按钮点了没反应**
   - 根因：上一条补丁只改了文案，点击仍然固定 `switchMapView('world')`，
     在大地图上点等于原地不动
   - 修复：新增 `onBackButtonClick()`，按当前视图决定目标 ——
     在大地图上回到**玩家当前所在区域**的区域地图（`switchMapView('area')`，
     地图模块内部用的是 `game.getCurrentArea()`，不是写死的 area1）；
     在区域地图上回到大地图。`boot()` 里的监听器改为绑这个函数
2. **移动输出格式**
   - 新格式两行：`========== 地点一 -->地点二 ==========` + `耗时：N`
   - 实现：`travelTo` 记录 `pendingMove = { fromId, toId, cost }`，`arriveAt` 据此打印；
     非移动类到达（开局 / 过夜 / 强制回家 / debug 传送）没有 from，仍用原来的「已经到达 X」
   - 移动逻辑一行没动
3. **大地图通道标签字号太小 + 节点尺寸不随揭示情况变化**
   - 通道标签改用独立变量 `--fs-link: 15px`（原来和「你在这里」共用 11px 的 `--fs-mapnote`）
   - 新增 `computeNodeScale(count) = clamp(sqrt(6 / count), 0.62, 1.18)`：
     揭示得越少节点越大、越多越小，`节点数 × 单个面积 ≈ 常数`，总占位面积大致不变
   - **只缩放视觉尺寸，坐标（方位）一个都没动**；实心块、菱形、当前位置标识、
     描边宽度、文字字号全部走同一个系数（描边用 `calc(... * var(--node-scale, 1))`，
     字号由 JS 算好写在内联样式里并带下限 11px 保证可读）
4. **区域内移动改为「已探明路径连通性」判定**
   - 根因：原来可点性 = 「已访问 ∪ 与任一已访问节点相邻」，于是远端节点也能点，
     耗时再按两点直线距离凭空算（例如 area1 里 `北关口 → 家` 修复前直接按直线收 2636 秒）
   - 修复：新增 `reachableVisited(regionId, fromId, visited)` —— 从当前节点出发，
     只在**两端都已访问（已探明）**的边构成的子图上做 DFS，能走到的已访问节点才可点
   - `buildAdjacency` / `findShortestPath` / `computeMoveCost` 增加可选的 `visited` 参数，
     移动耗时改为**沿已探明路径**逐跳累加；直接边（通往未访问菱形的第一条边）仍放行
   - 点击不可点节点 → **静默返回**：不移动、不扣体力、不推时间、不弹提示
   - 新增第 4 种节点状态 `.is-blocked`（已访问但不可达）：灰色描边 + 虚线 + 透明度 0.45

### 新增

- `map.js` 导出：`reachableVisited(regionId, fromId, visited)`、`computeNodeScale(count)`
- `texts.js` 新增 `UI.moved(from, to)`、`UI.timeCost(sec)`
- `style.css` 新增 `--fs-link`、`.map .node.is-blocked` 系列

### 实测

- `reachableVisited`：6 项断言通过（含「已探明边断开时不可达」「当前节点自身不在结果里」）
- 耗时：`northgate→home`（newarea1，三节点都已访问）= **1500**；
  同样的两点若 `na1_main` 未访问则返回 **null**（不再凭空传过去）；
  area1 里 `northpass→home` 沿主路 = **2431**（修复前按直线是 2636）
- 缩放：揭示 1→3 个系数 1.18（触顶，节点 153×66）、6 个 1.00（130×56）、
  10 个 0.775、13 个 0.679
- **缩放后节点重叠实测 0**（7 组场景：home 1 个 / newarea1 2~3 个 / newarea2 3 个 /
  area2 5 个 / area1 5 个与 10 个），坐标与方位一致性未受影响
- 渲染状态：站在 n7 且只访问 home/n1/n7 时，home 与 n1 正确变成 `is-blocked`，
  n7 是 `is-current` 且带「你在这里」，另有 5 个相邻未访问菱形
- 返回按钮：大地图上点 → 视图变 `area` 且按钮文案变「返回大地图」；
  在区域地图上点 → 回到 `world` 且文案变「返回区域地图」（还专门把当前区域换成
  newarea1 验证过不是写死 area1）
- 移动输出：`========== 北岸滩地 -->家 ==========` / `耗时：750`，等号个数与空格位置逐字符核对
- 全模块链接正常、`boot()` 无异常、style.css 花括号 106/106 配平

### 已知限制 / 遗留

1. **未访问节点的菱形判定口径变了**：从「与**任一已访问**节点相邻」改成
   「与**当前节点**相邻」（照需求原文「未访问节点仍按相邻当前节点判定菱形/不渲染」）。
   副作用是站在不同节点时，视野里的菱形会跟着变 —— 这也是需求描述的行为。
2. **`is-blocked` 在正常游玩里很少出现**：只要玩家是沿边一路走过来的，
   已访问子图对当前位置就是连通的。真实会触发的场景是「通过共享节点进区域后
   回头看不连通的旧足迹」，机制本身按需求实现了。
3. **移动横幅只在 `travelTo` 里产生**。开局落位、安全屋过夜、强制回家、debug `/goto`
   仍走原来的「已经到达 X」文案 —— 它们没有「从哪来」。
4. **问题 4 涉及文件与需求描述不符**：需求写的是 `js/map.js + js/state.js + js/main.js`，
   但 **`state.js` 无需改动** —— `visitedByArea` / `getVisitedByArea` 已经足够表达
   「已访问集合」，判定逻辑本身属于地图的职责，所以只改了 `map.js` 与 `main.js`。
5. **问题 2 的文件归属也与需求描述不符**：移动输出在 `main.js` 的 `arriveAt` 里，
   `terminal.js` 只管日志队列与输入渲染，没有任何移动输出代码。
6. **耗时仍是「最少跳数」而不是「最短时间」**（沿用上一版的选择）。
7. 上一版遗留未动：切区域时共享节点会在屏幕上跳位；`northpass` 因被设为
   `newarea2` 的 `primaryShelter` 而自动成了安全屋；
   `UI.foundLighthouse` / `notHere` / `crossRegionWalk` / `SAVE_OPTIONS` / `REACH` 无人引用。
8. **仍未做真实浏览器回归**（本机无可用浏览器自动化）。

### 改动规模

4 个文件：`v6/js/map.js`、`v6/js/main.js`、`v6/js/texts.js`、`v6/style.css`

---

## [v1.8.5] — 2026-10-11 —— 修 5 个问题：移动耗时走边、只有家回电、返回按钮文案、通道标签、当前节点标识

**回档点**：`v1.8.5`
**存档格式**：仍为 **`3`**，**未变更**。

> 说明：这两批改动原先被编成 v1.9.0 / v1.9.1（升了 minor）。按用户要求改为**默认只递增 patch**：
> 北面扩展 = **v1.8.4**、本轮 5 个修复 = **v1.8.5**。两个 git 标签已随之改名
>（`v1.9.0` → `v1.8.4`、`v1.9.1` → `v1.8.5`）；提交内容未变，只改了版本号与提交信息。

### 修复

1. **节点间移动耗时不沿边走，凭空按直线算**（最严重）
   - 症状：在 newarea1 区域地图里，从 `北门` 可以直接点 `家` 传送回去，
     时间惩罚与真实路线无关
   - 根因：`travelTo` 直接调 `computeEdgeCost(当前节点, 目标, 区域)`，
     而它**不检查两点之间有没有边**，一律按两点直线距离 × 系数算；
     同时 `computeClickable` 是「已访问 ∪ 已访问节点的邻居」，所以远端节点也会进入可点集合
   - 实测对照：`北门 → 家` 修复前收 **2100 秒**（直线 500 × 3.0 × 1.4），
     而真实路径 `北门 → 北岸滩地 → 家` 只要 **1500 秒**（750 + 750）
   - 修复：新增 `computeMoveCost(fromId, toId, regionId)`：
     有直接边按那条边算；没有边就用 **BFS 求最少跳数**并逐跳累加边耗时（这就是绕路惩罚）；
     **不连通返回 `null`**，`travelTo` 据此拒绝移动且不消耗任何资源
2. **灯塔 / 北关口等其他安全屋过夜也回电**
   - 根因：`main.js` 的 `settleNight()` 里 `game.setBattery(BATTERY_MAX)` 是无条件执行的
   - 修复：加区域判断，只有 `game.getCurrentArea() === RECHARGE_AREA`（`'home'`）才回电；
     电量上限随时间衰减的逻辑（`timeSystem.computeBatteryCap`）一点没动
3. **大地图上按钮写着「返回大地图」，自相矛盾**
   - 根因：按钮文案来自 `texts.UI.backToWorld`，与当前视图无关
   - 修复：`switchMapView` 里调新增的 `updateBackButton(view)`：
     大地图上显示「返回区域地图」，区域地图上显示「返回大地图」；点击行为未改
4. **大地图区域通道看不出连的是哪个节点**
   - 修复：`renderWorld` 给每条通道加小标签，内容是该通道所依赖的**共享节点名**
     （`家` / `灯塔` / `北关口` / `北门`），放在**两块之间的空隙中点**，不压到区域块上；
     字号 `--fs-mapnote: 11px`（区域块名是 24px），颜色 `--muted`，跟随主题
5. **区域地图看不出玩家在哪**
   - 根因：`.map .node.is-current .node-rect { stroke-width: 7 }` 只是加粗描边，
     而描边色跟填充色相同（实心黑块加黑边），肉眼分不出来
   - 修复：描边改成**反色**的 `var(--paper)` 并加粗到 9，同时在节点下方加一行
     「你在这里」（`--ink` 色、11px、加粗）。移动后 `refreshMap({current})` 会跟着更新

### 新增

- `map.js` 导出：`hasDirectEdge(regionId, fromId, toId)`、`findShortestPath(regionId, fromId, toId)`、
  `computeMoveCost(fromId, toId, regionId)`
- `texts.js` 新增 `UI.backToArea`、`UI.mapHere`、`UI.mapRegionLink(names)`
- `style.css` 新增 `--fs-mapnote`、`.map .node-here`、`.map .region-link-label`

### 已知限制 / 遗留

1. **BFS 求的是「最少跳数」不是「最短时间」**。需求原文写的是「BFS 求两节点在图上的最短跳数，
   每跳 timeCost 累加」，所以按跳数实现。实测差别的例子：area1 里 `家 → 灯塔` 无直接边，
   BFS 走 `家→北岭松林→旧观测台→岔路口→灯塔`（4 跳）共 **3580 秒**，
   而沿主路 `家→中央大道→废弃哨塔→岔路口→灯塔` 只要 **2160 秒**。
   若想改成按时间最短，把 BFS 换成 Dijkstra 即可。
2. **回电判断按的是「区域」不是「节点」**（照需求原文实现）。
   因此站在 `家` 节点、但把视图切到 `area1` 或 `newarea1` 时过夜**不会**回电；
   而 `timeSystem.tick()` 对「在 `家` 节点」是不流逝时间的（按节点判）。
   两处口径不一致，若要统一，把判断换成 `game.getCurrentNode() === HOME_ID` 就行。
3. **问题 3 只改了文案，没动点击行为**（照需求原文「点击行为不变」）。
   于是在大地图上点这个按钮目前是空操作 —— 如果要让它切回区域地图，需要另说。
4. **问题 3 的涉及文件也与需求描述不符**：返回按钮是 `index.html` 里的
   `<button id="back-to-world" data-text="backToWorld">`，逻辑在 `main.js` 的
   `switchMapView` / `updateBackButton`，`terminal.js` 里没有任何按钮渲染代码。
5. **通道标签目前都是单个节点名**。因为共享节点设计下，两个区域之间只由 1 个节点连通
   （home–area1 与 home–newarea1 都是 `家`）。若将来两个区域共享多个节点，
   `UI.mapRegionLink` 会自动显示成 `A ↔ B` 的样式。
6. 上一版遗留未动：切区域时 `lighthouse` / `northgate` / `northpass` 会在屏幕上跳位；
   `northpass` 因为被设为 `newarea2` 的 `primaryShelter` 而自动成了安全屋；
   `UI.foundLighthouse` / `notHere` / `crossRegionWalk` / `SAVE_OPTIONS` / `REACH` 无人引用。
7. **仍未做真实浏览器回归**（本机无可用浏览器自动化）。本轮验到 DOM 桩 + 断言层：
   耗时函数、回电分支、按钮文案、5 条通道的标签文字与落点、当前节点标识的归属与跟随更新，
   全部有断言覆盖。

### 改动规模

5 个文件：`v6/js/map.js`、`v6/js/main.js`、`v6/js/texts.js`、`v6/style.css`
（`v6/index.html` 未改 —— `data-text="backToWorld"` 只作为初始值，
启动时 `applyTexts()` 先写一次，紧接着 `switchMapView` 会按当前视图纠正）

---

## [v1.8.4] — 2026-10-10 —— 往北扩展两个新区域：北岸 / 北境

**回档点**：`v1.8.4`
**存档格式**：仍为 **`3`**，**未变更**。`visitedByArea` 是动态结构，多出的两个 key 不影响
旧存档载入；实测把缺少 `newarea1` / `newarea2` 的 v3 存档导入后，
这两个 key 会被惰性建出为空集合，不报错。因此**不需要升版本号**。

### 新增

- **两个新区域**
  - `newarea1`「北岸」：`nodes = ['home', 'na1_main', 'northgate']`
  - `newarea2`「北境」：`nodes = ['northgate', 'na2_main', 'northpass']`
- **两个新探索节点**
  - `na1_main`「北岸滩地」：可拾取物品 **黄铜罗盘**（新物品 `compass`，无 slot，
    只能进袋或手持）
  - `na2_main`「北境石林」：一个一次性选项「在石柱上刻下记号」（1800 秒）
- **两个新关口节点**
  - `northpass`「北关口」：`area1` 的北出口，也是 `newarea2` 的东出口
  - `northgate`「北门」：`newarea1` 的东端，也是 `newarea2` 的西端
- **area1 新增北出口边**：`n7 → northpass`（主路，721 秒）。选 `n7`（岔路口）而不是
  `lighthouse`，因为 n7 本来就是三岔路口，往北再开一条路最自然
- **大地图上排新增两个区域块**，方位与需求一致：
  `newarea1.x = home.x`、`newarea2.x = area1.x`、两块同一行且都在下排之上

### 共享节点总览（本次扩展后）

| 节点 | 出现在哪些区域 |
|---|---|
| `home` | `home` / `area1` / **`newarea1`**（三区域共享） |
| `northpass` | **`area1` / `newarea2`** |
| `northgate` | **`newarea1` / `newarea2`** |
| `lighthouse` | `area1` / `area2`（不变） |

### 变更

- `GAME_VERSION`：`v1.8.3` → `v1.8.4`
- `home.neighbors`：`['area1']` → `['area1', 'newarea1']`
- `area1.neighbors`：`['home', 'area2']` → `['home', 'area2', 'newarea2']`
- **`isAreaNeighbor(a, b)` 现在也认「两个区域共享同一个节点」**。
  原因是 `area1` 与 `newarea1` 共享 `home`：玩家站在 `home` 上本来就该能切过去，
  但按方位图这一对不画连线。于是把「画线用 `neighbors`」与「点击判定用
  `neighbors` 或共享节点」分开
- `REGION_VIEW_POS` 增加 `newarea2` 的覆盖：`northgate`（东端 → 西端）、
  `northpass`（北出口 → 东端略偏南）。`newarea1` 不需要覆盖
  （`home(80) < na1_main(330) < northgate(580)` 本来就单调）

### 已知限制 / 遗留

1. **`northpass` 变成了安全屋**。`newarea2` 的三个节点里没有任何安全屋节点，
   但 `primaryShelter` 必须落在本区域内的节点上（否则强制回家会把玩家送到
   不属于当前区域的地方，地图会失去高亮、点击也会乱），所以只能把
   `newarea2.primaryShelter` 设成 `northpass`。而 `isShelter` 的判定是
   「所有区域 `primaryShelter` 的并集」，于是 `northpass` 自动获得了
   过夜 / 稍作停留 / 导出 / 导入存档这几个选项。
   如果不想这样，需要在 `newarea2` 里新增一个专门的安全屋节点，或者改 `isShelter` 的口径。
2. **两个区域的名称是我取的**（「北岸」「北境」），需求里只给了 id。
3. **需求写的 `home.y = area1.y` 与现状不符**：现有数据里 `home.y=200`、`area1.y=120`。
   两者的高度让中心线都落在 `y=300`，所以「下排在同一水平线上」是成立的。
   本次按「上排整排放在下排之上」实现，**没有移动原有三块中的任何一块**。
4. **`northpass` / `northgate` 在我给的坐标下靠得很近的两对**：
   `northpass(660,60)` 与 `n4(450,100)` 的水平间距 210，在 ±35 噪声下最坏会到 140，
   仍然 ≥ 节点宽 130，实测三个区域的重叠对数都是 0、越界数 0。
5. 上一版遗留未动：切区域时 `lighthouse` 会在屏幕上跳位；时间只在 `home` 节点暂停；
   `UI.foundLighthouse` / `notHere` / `crossRegionWalk` / `SAVE_OPTIONS` / `REACH` 无人引用。
6. **仍未做真实浏览器回归**（本机无可用浏览器自动化）。

### 新增移动耗时（现有规则：距离 × 3.0，主路不打折）

| 边 | 区域 | 耗时 |
|---|---|---|
| `home → na1_main` | newarea1 | 750 秒 |
| `na1_main → northgate` | newarea1 | 750 秒 |
| `northgate → na2_main` | newarea2 | 690 秒 |
| `na2_main → northpass` | newarea2 | 1176 秒 |
| `n7 → northpass` | area1 | 721 秒 |

原有费用未变：`home→n2` 仍 510 秒、`lighthouse→m1` 仍 764 秒。

### 改动规模

2 个文件：`v6/js/map.js`、`v6/js/texts.js`
（`state.js` 与 `saveSystem.js` 经核对**无需改动**：`getVisitedByArea` 是惰性建键、
`replaceFromSnapshot` 整块重建、`saveSystem` 只校验 `visitedByArea` 是对象且值为数组）

---

## [v1.8.3] — 2026-10-10 —— 修 4 个问题：区域块配色、area1 空白、方位统一、物品栏「当地物品」区

**回档点**：`v1.8.3`（另有 `v1.8.2-fix-124`、`v1.8.2-fix3` 两个中间点）
**存档格式**：仍为 **`3`**，**未变更**。v1.8.2 的存档可正常导入。

### 修复

1. **大地图区域块在深色模式下完全看不见**
   - 症状：区域块是纯黑方块，深色模式下背景也黑，什么都看不到
   - 根因：**不是配色写死，而是类名对不上**。v1.8.2 重构后 `renderWorld` 输出的类名是
     `.region-rect` / `.region-diamond`，而 `style.css` 里写的仍是旧的 `.region-block`——
     一条规则都没匹配上，于是落到 SVG 默认的 `fill: black`
   - 修复：整段 `.region-block` 换成 `.region-rect` / `.region-diamond`，全部复用节点那套变量；
     当前所在区域反色填充 + 描边加粗到 7 作为明显标识；
     已解锁未访问仍按区域地图的菱形规则
2. **从大地图进 area1，整张区域地图是空白的**（不只是「看不到 home」）
   - 根因：`renderArea` 只读 `getVisitedByArea(regionId)`。从家切进 area1 时
     `visitedByArea.area1` 还是空集 → `computeClickable` 空 → `visible` 空 →
     **什么都不渲染**。`home` 是共享节点，访问记录落在 `visitedByArea.home`
   - 同一个坑还在 `main.js` 的 `travelTo`：就算画出来了，点 n1/n2/n3 也会判成「那里太远了」
   - 修复：`map.js` 新增两个**只读**查询 `isNodeVisited(nodeId)` 与 `getVisitedIn(regionId)`，
     `renderArea` 与 `travelTo` 都改用后者；`visitedByArea` 一个字节都没被写入，不污染存档语义
3. **区域内部方位与大地图不一致**（area2 是从东往西走）
   - 根因：`lighthouse` 是共享节点只有一个逻辑坐标，而它必须同时是 area1 的最东端
     与 area2 的最西端 —— 一个 x 做不到
   - 修复：新增 `REGION_VIEW_POS` **视觉坐标覆盖表**，只影响绘制、不影响逻辑坐标。
     area2 的视觉 x 改为 lighthouse(140) → m1(300) → m2(460) → m3(620) → goal2(780)，
     一路向东；area1 本来就单调，一项都没覆盖
   - **逻辑坐标与全部移动耗时一点没变**：`home→n2` 仍是 510

### 新增

- **物品栏「当地物品」区**：到达节点地上有东西时，除了弹窗，物品栏里也能看到并直接拿。
  位置在**装备槽下方、你的物品（储物箱/口袋）上方**（逻辑上「还不属于你」），
  只在有未拾取物品时显示，全部捡走后自动消失
- 到达弹窗按钮行新增 **「稍后处理」**：关掉弹窗、物品留在节点，之后从物品栏这一区操作；
  拾取与放弃都不消耗时间
- `inventory.js` 新增 `listLocalItems(nodeItems, collected)` 与
  `planLocalPickup(pocket, equipped)`（复用 口袋 → 手持 → 要替换 的同一套优先级）
- `texts.js` 新增 `UI.inventory.local`、`UI.pickupLater`

### 变更

- `GAME_VERSION`：`v1.8.2` → `v1.8.3`
- `main.js` 的 `getPickableItems` 改为委托 `inventory.listLocalItems`（单一实现）
- `map.js` 的 `drawPos(node)` → `drawPos(node, regionId)`

### 已知限制 / 遗留

1. **切区域时灯塔会在屏幕上跳位**：在 area1 它是东端（视觉 x=800），切到 area2 它是西端
   （视觉 x=140）。这是「共享节点只有一个逻辑坐标 + 逻辑坐标不许变」的必然结果。
   想让两边共用同一屏幕位置，就得放弃「逻辑坐标不变」。
2. **问题 4 的涉及文件与需求描述不符**：需求里写的是 `terminal.js`，
   但物品栏渲染函数 `renderInventory` 实际在 `main.js` 里（`terminal.js` 只管
   终端日志/输入/按钮行/弹窗，没有任何物品栏代码）。所以改的是 `main.js`，`terminal.js` 一行没动。
3. **仍未做真实浏览器回归**（本机无可用浏览器自动化）。本轮验到 DOM 桩 + 断言层：
   区域块 CSS 规则、跨区域访问集合、area1/area2 的实际绘制 x、物品栏新区的数据与拾取优先级
   全部有断言覆盖，但**视觉观感需要人工确认**。

### 改动规模

5 个文件：`v6/style.css`、`v6/js/map.js`、`v6/js/main.js`、`v6/js/inventory.js`、`v6/js/texts.js`

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

---

## [v1.8.1] — 2026-10-10 —— 手持槽改为「保底物品栏」＋ 5 处改动

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
