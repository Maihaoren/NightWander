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
| `GAME_VERSION` | `v6/js/config.js` | `v1.8.9` | 面向玩家的游戏版本 |
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

## [v1.8.9] — 2026-10-11 —— 野外丢弃物品 + 修「黑暗归零强制回家没生效」

**回档点**：`v1.8.9`

### 修复

**1. 野外丢弃物品（`inventory.js` + `main.js` + `texts.js` + `style.css` + `state.js`）**

- 症状：在野外（没有安全屋的地方）物品栏里没有丢弃动作，背包一满就再也捡不了新东西。
- 根因：物品栏的整理动作只有「安全屋里放回储物箱」这一套（`pocketToStorage` / `unequip`），
  野外点口袋里的物品是「收进手持槽 / 查看」（`onPocketClickAway`），**根本没有把东西放回地面的入口**。
- 修复：野外每一件随身物品右侧多一个「丢弃」按钮，点了就把东西放到当前节点的「当地物品」区。
  - `inventory.js` 新增纯函数 `planDrop(item, equipped, pocket)`：判断「这件东西现在在哪」，
    返回 `{ where: 'pocket' | 'hand' }` 或 `{ reason }`。**不写 state、不碰 DOM**，与同文件的
    `planTakeFromStorage` / `planUnequip` / `planPocketToStorage` 同一套分工。
  - `main.js` 新增 `addToNode(node, itemId)`（`dropFromNode` 的反操作）与 `dropItemToNode(item)`（真正改状态）。
    关键一步是 `game.unmarkItemCollected(item.id)`：`collectedItems` 决定节点物品列表里哪些条目不再显示，
    不解标记的话东西丢在脚下也看不见、捡不回来。
  - `main.js` 新增 `carriedItemRow(label, { onClick, disabled, hint, onDrop, dropHint })`：物品按钮 + 右侧「丢弃」的行容器。
    `onDrop` 为空时**只返回原来那一个按钮**，所以安全屋与装备槽的渲染结果与改动前逐字节一致。
  - `state.js` 新增 `unmarkItemCollected(id)`（`markItemCollected` 的反操作）。
  - `texts.js` 新增 `UI.dropItem`（「丢弃」）、`UI.dropped(name)`、`UI.dropHint(name)`。
  - `style.css` 新增 `.inv-item` / `.inv-item__main` / `.inv-item__drop`（flex 行：物品按钮占满，丢弃按钮窄的一条）。
- 规则落实：丢弃**不消耗时间**（没有 `time.advanceTime` 调用）、**不消耗体力**、丢弃后可再捡回（空间够）、
  **手持槽里的东西也能丢**、安全屋里的整理模式（点一下 → 放回储物箱）**行为不变**。
- 与请求的差异（已在交付说明里写明）：请求写的是「`inventory.js` 新增 `dropItem(item)`」+「`terminal.js` 物品栏渲染」，
  实际是 —— ① 物品栏渲染不在 `terminal.js`（那里只渲染终端选项按钮），而在 `main.js` 的 `renderInventory()` 与 `itemButton()`；
  ② `inventory.js` 按模块约定只做判定（文件头写明「状态改动由 main.js 调 state.js 完成；不碰 DOM」），
  所以那里放的是纯函数 `planDrop`，真正的搬运写在 `main.js` 的 `dropItemToNode()`。

**2. 黑暗归零强制回家没生效（`timeSystem.js` + `main.js`）**

- 症状：人在 `dark_core` 里、电量归零，**没有**触发强制回家（要等电量从正数掉到 0 才有效）。
- 根因（已复现）：`timeSystem.js` 的 `drainBatteryForGameSeconds()` 里写的是

  ```js
  if (game.getBattery() <= 0) return;          /* 已经没电：不再重复扣，也不重复触发 */   ← v1.8.8
  game.spendBattery(...);
  if (game.getBattery() <= 0 && onBatteryEmpty) onBatteryEmpty();
  ```

  这个提前 return 把「不重复扣」和「不重复通知」捆在了一起，于是**电量本来就是 0 的情形永远等不到
  「从正数变 0」的那一跳**，而 tick 是唯一的连续检测者 —— 归零通知永远不会发出。
  受影响的具体场景：调试指令 `/battery set 0`（最常用的测试手法）、导入一份电量为 0 的存档、
  在黑暗地点用选项把电一次用干（`batteryCost` 直接扣到 0 而 `timeCost` 为 0 时没有流逝）。
  只有「电量从 >0 被流逝扣到 0」这一条路径是通的，所以 v1.8.8 的自测（从 1% 扣到 0）没测出来。
- 修复：把「不再累减」与「是否已见底要通知」拆开，新增 `notifyBatteryEmpty()`：

  ```js
  if (game.getBattery() > 0) game.spendBattery((sec / 3600) * batteryDrainPerHour());   /* 只在有电时累减 */
  notifyBatteryEmpty();                                                                 /* 每次都比一次 */
  ```

  不做「只通知一次」的闩锁 —— 那种闩锁会在导入存档后变脏，漏掉后面的归零。
  `main.js` 的 `onBatteryCollapse()` 本身就是幂等的（不在黑暗地点直接 `return false`），
  所以每 tick 调一次没有副作用；真的执行时它会立刻把电量回满，也不会重复执行。
  `drainBatteryOnDayChange()` 同样改用 `notifyBatteryEmpty()`。
- 逐条对照请求里的排查清单（结论都写进了源码注释）：
  1. `isDark` 查得到：标记在**节点数据**上（`map.getNode('dark_core').isDark === true`），
     查询入口 `map.isDarkNode(nodeId)`。它刻意**不放 state**：节点数据是静态世界数据，不进存档，
     `state` 只存动态进度；`main.js` 在 `boot()` 里用 `time.setDarkNodeResolver(isDarkNode)` 把它注入 timeSystem。
  2. 归零检测里的分支：`main.js` 的 `onBatteryCollapse()` —— `if (!node || !isDarkNode(node.id)) return false;`
     是 → 走黑暗归零流程；否 → 直接返回，交给原来的逻辑（没电在别处只意味着视野收缩 + 悬浮提示）。
  3. 流程真的执行了传送 + 结算：`visitNode(HOME_ID, HOME_ID)` → `settleNight()`（天数 +1 / 时间归零 / 体力回满 / 电量回满），
     实测节点与区域都变成 `home`、天数 +1、电量 100——不是只打印提示。
  4. 没有被别的判断提前拦截：`tick` / `advanceTime` 里「扣电通知」都排在夜晚结束判断**之前**，
     所以 06:00 天亮不会抢先；与体力归零是两条独立路径（判断的量、位置、后果都不同），
     体力那条在 `travelTo` 里、且电量那条一旦执行就把体力回满，两者不会互相拦截。
- 新增的实测用例（已验证）：电量**本来就是 0** 时下一个 tick 就触发；从 1% 扣到 0 照旧；
  **走进黑暗地点那一刻刚好走干**（`travelTo` 在 `visitNode` 之后的落点检测）也会触发；
  非黑暗地点没电连续多个 tick 都不会误传送；体力那条仍然扣上限、电量那条仍然不扣。

### 变更

| 文件 | 改动 |
|---|---|
| `v6/js/inventory.js` | 新增 `planDrop(item, equipped, pocket)` |
| `v6/js/state.js` | 新增 `unmarkItemCollected(id)` |
| `v6/js/timeSystem.js` | 拆出 `notifyBatteryEmpty()`；`drainBatteryForGameSeconds()` 不再因「已经是 0」而跳过通知；`drainBatteryOnDayChange()` 改用它 |
| `v6/js/main.js` | 新增 `carriedItemRow()`、`addToNode()`、`dropItemToNode()`；`renderInventory()` 给口袋物品与手持槽加丢弃入口；`onBatteryCollapse()` 补注释（isDark 分支 / 两条独立路径 / 触发点） |
| `v6/js/texts.js` | 新增 `UI.dropItem` / `UI.dropped(name)` / `UI.dropHint(name)` |
| `v6/style.css` | 新增 `.inv-item` / `.inv-item__main` / `.inv-item__drop` |
| `v6/js/config.js` | `GAME_VERSION` → `v1.8.9` |
| `HANDOFF.md` | 游戏版本同步 `v1.8.9` |

**存档格式**：`VERSION` 仍为 **`3`**，**未变**，旧存档照常加载（`unmarkItemCollected` 只改 `collectedItems` 这个已有字段的内容）。

### 验证

- 模块链接检查（10 个模块 OK，`main` 需 DOM）、DOM 桩 `boot()` 无异常、11 个 js 文件 `node --check` 通过、`style.css` 花括号 115/115 配平。
- 54 项断言全部通过（`.tools/nw_r10_check.mjs`，DOM 桩里真跑 `boot()`、真点按钮、真跑 `tick`，用可控 `Date.now` 推进游戏时间）：
  - **丢弃**：`planDrop` 的四种判定；安全屋 0 个丢弃入口且有储物箱区、野外 3 个（口袋 2 + 手持 1）；
    每个入口套在 `.inv-item` 行里且行内正好两个按钮；点丢弃后 —— 口袋少一件、进当前节点物品池、
    `collectedItems` 标记被解除、**时间与体力都没变**、终端打印「你把黄铜罗盘丢在了地上。」、
    当地物品区立刻出现；再点就能捡回；容量 6/6 满时丢一件腾位后能捡回；
    手持槽的东西也能丢且丢后槽位空出来；安全屋里点物品仍然是「放回储物箱」（储物箱 5 → 6）。
  - **黑暗归零**：`isDark` 标记与查询；**电量本来就是 0** 一个 tick 内触发（回 home、天数 +1、时间归零、电量/体力回满、`staminaMax` 不变、打印「你在黑暗中失去了意识……」）；
    从 1% 扣到 0 照旧；走进黑暗地点那一刻刚好走干也触发；非黑暗地点没电连续 3 个 tick 都不误传送；
    体力 0 走到非安全屋仍然扣上限（10→9）而电量那条不扣；`elapsedSeconds` 推到 06:00 前 5 秒时仍然是黑暗归零先处理。
- 旧套件回归：v1.8.6 / v1.8.7 / v1.8.8 的断言与端到端全部通过（其中 v1.8.8 那条「已经为 0 就不再重复触发」正是本次修掉的漏洞，已改写为「仍然继续通知」并注明原因）。

### 已知限制 / 遗留

- **丢弃入口只覆盖「没穿在身上」的东西**：口袋里的、手持槽里的。穿在身上的 `torso` / `legs` / `back`
  是「穿着」而不是「带着」，脱下来还会改变口袋容量，所以野外不给丢弃入口（安全屋里照旧点一下 = 脱下放回储物箱）。
- **丢弃入口只在“没有安全屋”的地方出现**。`lighthouse` / `northpass` / `southpass` 也是安全屋（有储物箱），
  那里点物品仍然是「放回储物箱」，所以看不到丢弃按钮 —— 与请求里「野外（非 home）」的说法在
  其它安全屋上略有差别：本实现按「有没有储物箱」划分，而不是按「是不是 home 区域」。
- 丢弃后的物品会**跟随节点**留在原地：走到别的节点丢，就留在那个节点；回头再走到那个节点时，
  到达流程的拾取弹窗会把它重新列出来。
- 断电检测在电量已经是 0 时每 tick 都会问一次 `onBatteryCollapse()`（O(1) 的几个判断，代价可忽略）；
  这里刻意不用闩锁，避免导入存档后闩锁变脏再次漏检。
- 预先存在、本轮**未处理**：`m1`（枯树林）的 ASCII 图是 11 行，与项目「12 行」约定不符。

---

## [v1.8.8] — 2026-10-11 —— 2 个 bug + 电量流逝机制重做 + 新增「黑暗地带」区域 + 黑暗地点规则

**回档点**：`v1.8.8`

### 修复

**1. home 回电判断从「区域」改成「节点」（`main.js`）**

- 症状：站在 `area1` / `newarea1` 里的 `home` 节点过夜**不回电**，只有 `home` 区域里的 `home` 节点回电。
- 根因：v1.8.5 实现「只有家能回电」时，判断写成了 `game.getCurrentArea() === 'home'`。但 `home` 是**共享节点**，同时属于 `home` / `area1` / `newarea1` 三个区域；按区域判断等于把「同一个家」在别的区域里当成了别的地方。
- 修复：`main.js settleNight()` 改为 `game.getCurrentNode() === RECHARGE_NODE`，常量 `RECHARGE_AREA = 'home'` → `RECHARGE_NODE = HOME_ID`（节点 id 全局唯一）。灯塔 / 北关口 / 南关口等安全屋照旧不回电。
- 注：请求里写的文件是 `timeSystem.js`，实际结算回电逻辑在 `main.js` 的 `settleNight()`，只改了那里。

**2. 没电时悬浮提示显示说明文案（`map.js` + `texts.js`）**

- 症状：电量归零后悬浮节点，提示**完全静默**，玩家不知道自己为什么点不动。
- 修复：`buildTipLines()` 在 `game.getBattery() <= 0` 时不再 `return null`，而是返回一行 `UI.tipNoBattery`（「没电了，预测不了时间。」）—— **只这一行**，不给预计耗时与到达时间。不可点节点（当前所在 / 已访问但走不到）依旧不绑悬浮事件、没有任何提示。
- 配套：`showTip()` 的重建判断由「目标 id 变了没」改成「目标 id + 文案变了没」，否则没电时两行变一行不会重绘。

### 新增

**1. 新增「黑暗地带」区域 `darkarea`（`map.js` + `texts.js`）**

| 项 | 值 |
|---|---|
| `regionId` | `darkarea` |
| 显示名 | 黑暗地带 |
| `nodes` | `['southpass', 'dark_core']` |
| `edges` | `southpass ↔ dark_core`（`mainRoads` 同一条） |
| `neighbors` | `['area1']`（`area1.neighbors` 同步加上 `'darkarea'`） |
| `primaryShelter` | `'southpass'`（**必须是本区域节点**：强制回家会 `visitNode(区域, 该节点)`；没有安全屋节点就落到北入口，与 `newarea2 → northpass` 同一套） |
| `unlocked` | `false`（访问过任一节点即解锁） |
| 大地图位置 | `REGION_BOX.darkarea = { x: 420, y: 500, w: 200, h: 90 }`，在 `area1` 正南（中心 x=520 对齐），与 `area1` 底边留 20px 给通道标签，整块不出画布 |

节点（`NODES` 逻辑坐标，另见 `REGION_VIEW_POS`）：

| 节点 | 逻辑坐标 | 视觉坐标 | 说明 |
|---|---|---|---|
| `southpass` 南关口 | `(660, 540)` | `area1` 里就是 `(660,540)`（n7 正南）；`darkarea` 里覆盖为 `(660,120)`（北入口） | **共享节点**，同时出现在 `area1.nodes` 与 `darkarea.nodes` |
| `dark_core` 黑暗核心 | `(660, 300)` | 同逻辑坐标（在 `southpass` 下方） | **黑暗地点**，`isDark: true` |

连接关系：`area1.n7 (650,300)` ↔ `southpass (660,540)` ↔ `dark_core (660,300)`。
`n7→southpass` 的边耗时 **721 秒**，与北出口 `n7→northpass` 完全对称；`southpass→dark_core` = **720 秒**。

内容（测试性）：`dark_core` 挂 1 件测试物品 `darkshard`（黑曜石碎片，形态对齐 `compass`／`oldmap`：无槽位）+ 2 个测试选项（「伸手在黑暗里摸索」1800 秒、「屏住呼吸听一听」900 秒可重复）。`dark_core` **没有** `mustResolve`，可以自由进出。

**2. 黑暗地点标记：`node.isDark`（`map.js`）**

- 字段名 **`isDark`**，在 `defNode(id, x, y, items, mustResolve, isDark)` 的第 6 个形参上写入节点对象（默认 `false`）。
- 选这个方案而不是「`regionId === 'darkarea'` 且非入口节点」：同一区域将来可以有多个黑暗地点，入口通道也就不需要任何特例判断；查询统一走 `isDarkNode(nodeId)`。

**3. 电量流逝机制重做（`config.js` + `timeSystem.js` + `main.js`）**

- **废弃**「电量上限随时间衰减」（`cap = 10 + 90 × (1 − elapsed / NIGHT_DURATION)`）：`BATTERY_CAP_FLOOR` / `BATTERY_CAP_CEIL` 两个常量与函数 `computeBatteryCap()` 一并删除。
- 新规则**只削当前电量，上限恒为 `BATTERY_MAX`（100%）**，完整公式：

  ```
  速率(百分点/游戏小时) = BATTERY_NATURAL_DRAIN_PER_HOUR              （2）
                        + （当前节点 isDark ? BATTERY_DARK_AREA_EXTRA_DRAIN_PER_HOUR : 0）   （+1）

  流逝扣除   = 游戏内流逝秒数 / 3600 × 速率            ← 连续积分，下限 0
  跨天扣除   = BATTERY_DAY_CHANGE_DRAIN                （5，天数 +1 时一次性）
  当前电量   = clamp(当前电量 − 流逝扣除 − 跨天扣除, 0, BATTERY_MAX)
  ```

- 两条时间推进路径共用同一个扣除函数 `drainBatteryForGameSeconds()`：`tick()`（`Date.now` 真实差值 × `TIME_SPEED` → 游戏秒）与 `advanceTime()`（移动 / 选项的离散秒数），所以速率规则只有一份实现。
- 离散扣电的黑暗判定用「**扣电那一刻玩家所在的节点**」：离开黑暗地点那一步算黑暗速率（人还在黑暗里），走进黑暗地点那一步算自然速率。在家节点时间不流逝，所以也不扣电。
- 跨天扣电：`time.drainBatteryOnDayChange()`，由 `main.js` 在天数 +1 的两处调用（`settleNight()`、`onNightEnd()`）。**在 `settleNight()` 里刻意排在「回家回电」之前** —— 于是「在家过夜（含黑暗断电被送回 home）」是满电开局，而在灯塔 / 南关口过夜才会真扣掉这 5%。
- 倒计时/状态栏显示不变（`电量 N%`，`Math.floor`），下限 0 由 `state.setBattery()` 原有的 `Math.max(0, ...)` 保证，不会出现负数。

**4. 黑暗地点电量归零 → 强制回家，但不扣体力上限（`timeSystem.js` + `main.js` + `texts.js`）**

- `timeSystem.js` 新增两个注入口（timeSystem 不认识地图，也不该认识游戏规则；直接 `import map.js` 会与 `map.js → timeSystem.js` 形成循环依赖）：
  - `setDarkNodeResolver(fn)` —— 「这个节点是黑暗地点吗」，决定流逝速率；`main.js` 在 `boot()` 里注入 `isDarkNode`。
  - `setOnBatteryEmpty(fn)` —— 「流逝中电量掉到 0 了」；`main.js` 注入 `onBatteryCollapse`。
- `main.js` 新增 `onBatteryCollapse()`，伪代码：

  ```
  onBatteryCollapse():
      if 游戏已结束            → return false
      if 当前电量 > 0          → return false
      node = 当前节点
      if node 不是 isDark      → return false        # 普通地点没电只是视野收缩

      终端清队列 + 打印 UI.darkCollapse（「你在黑暗中失去了意识……」）
      visitNode('home', 'home')                      # 1 传送：区域与节点都换成 home
      settleNight()                                  # 2 结算：天数 +1 / 时间归零 / 体力回满 / 电量回满
                                                     #   ← 这里【没有】setStaminaMax()，体力上限一分不扣
      if staminaMax <= STAMINA_MIN:                  # 3 沿用原顺序：先传送+结算，再判 gameOver
          gameOver = true; 打印 UI.gameOverStamina; 停时钟; 锁终端; redrawShelterQuietly()
          return true
      arriveAt(getNode('home'))                      # 4 与体力强制回家一致的到达流程（不 await）
      return true
  ```

- 全程同步（tick 的定时器回调等不了 `await`），用到的 `visitNode` / `settleNight` / `redrawShelterQuietly` 本来就都是同步的；只有最后的 `arriveAt()` 是即发即忘。
- 三个触发点：① 流逝扣电（tick / `advanceTime`）通过回调命中；② 选项自带的 `batteryCost` 直接扣到 0（`onOptionClick` 里补一次检测）；③ 走进黑暗地点那一刻（`travelTo` 在 `visitNode` 之后补一次检测，覆盖「路上刚好走干、落点就是黑暗地点」）。
- 打断处理沿用既有的 `nightEnded` 写法：新增模块级 `batteryCollapsed` 标志，`travelTo` / `onOptionClick` 在动作开始时清零、被打断时不再执行选项效果、不再打印到达。

**5. 没电时禁止进入黑暗地点（`map.js` + `main.js`）**

- `map.js` 新增 `isNodeBlockedByDarkness(nodeId)` = `isDarkNode(nodeId) && game.getBattery() <= 0`。
- 可点性：`travelTo()` 在原有可点性判断之前加一行 `if (isNodeBlockedByDarkness(id)) return;`（静默拒绝，与其它不可点情形一致）。`southpass` 没有 `isDark` 标记，因此作为通道不受限制。
- 渲染：`renderArea()` 的状态机新增第 5 种状态 `darkblock` ——
  - 已访问过 → `is-visited is-blocked`
  - 没访问过 → `is-unseen is-blocked`（保留菱形、不显示名字，不泄露没走过的地图），且**不给** `is-open`（不加 pointer 光标）
  - `is-blocked` 就是 v1.8.6 那套「灰 + 虚线 + 降透明度」的特殊样式。
- 悬浮：`darkblock` 是全项目**唯一**「不可点但仍绑悬浮事件」的状态，绑它只是为了能说出理由 —— 电量 0 时 `buildTipLines()` 返回「没电了，预测不了时间。」，不需要额外分支。
- 玩家**已经在** `dark_core` 里没电属于另一种情形，走上面第 4 条（断电回家），不属于本规则。

### 变更

| 文件 | 改动 |
|---|---|
| `v6/js/config.js` | 删 `BATTERY_CAP_FLOOR` / `BATTERY_CAP_CEIL`；加 `BATTERY_NATURAL_DRAIN_PER_HOUR = 2`、`BATTERY_DARK_AREA_EXTRA_DRAIN_PER_HOUR = 1`、`BATTERY_DAY_CHANGE_DRAIN = 5`；`BATTERY_MAX` 注释改为「电量上限，不随时间衰减」；`GAME_VERSION` → `v1.8.8` |
| `v6/js/timeSystem.js` | 删 `computeBatteryCap()` 与 cap 逻辑；加 `setOnBatteryEmpty()` / `setDarkNodeResolver()` / `drainBatteryOnDayChange()` 与内部 `batteryDrainPerHour()` / `drainBatteryForGameSeconds()`；`tick()` 与 `advanceTime()` 都接入扣电 |
| `v6/js/map.js` | `defNode()` 增加第 6 个形参 `isDark`；`NODES` 加 `southpass` / `dark_core`；`REGIONS` 加 `darkarea`，`area1` 加 `southpass` 节点 / `n7→southpass` 边 / `neighbors` 加 `'darkarea'`；`REGION_BOX` 加 `darkarea`；`REGION_VIEW_POS` 加 `darkarea`；加导出 `isDarkNode()` / `isNodeBlockedByDarkness()`；`buildTipLines()` 没电返回说明行；`showTip()` 按「目标 + 文案」重建；`renderArea()` 状态机加 `darkblock` |
| `v6/js/texts.js` | 加 `UI.tipNoBattery` / `UI.darkCollapse`；`ITEMS` 加 `darkshard`；`SCENES` 加 `southpass` / `dark_core`（各 12 行 ASCII） |
| `v6/js/main.js` | `RECHARGE_AREA` → `RECHARGE_NODE`，`settleNight()` 回电改按节点；加 `batteryCollapsed` 标志与 `onBatteryCollapse()`；`travelTo()` 加没电禁入黑暗与两处断电检测；`onOptionClick()` 加断电检测与打断处理；`onNightEnd()` / `settleNight()` 加跨天扣电；`boot()` 注入两个 timeSystem 钩子 |
| `HANDOFF.md` | 游戏版本同步 `v1.8.8` |

**不需要改的文件（已核对）**：

- `v6/js/state.js`：`visitedByArea` 是**惰性建 key 的动态对象**（`getVisitedByArea()` 首次访问新区域时建空 `Set`），新区域 `darkarea` 直接可用；`setBattery()` 本来就是 `Math.max(0, Math.min(BATTERY_MAX, value))`，负值与超上限都夹得住。**本轮未改动这个文件。**
- `v6/js/saveSystem.js`：只做结构性校验（`visitedByArea` 必须是对象、每个值必须是数组），不枚举区域 id，新区域只是多一个动态 key。**存档版本仍是 `VERSION = 3`，旧存档照常加载。**

### 验证

- 模块链接检查（10 个模块 OK，`main` 需 DOM）、DOM 桩 `boot()` 无异常、11 个 js 文件 `node --check` 全部通过。
- 59 项断言全部通过（`.tools/nw_r9_check.mjs`）：旧电量常量与 `computeBatteryCap` 已彻底消失；自然速率 1 小时 −2%、黑暗中 −3%、离开黑暗立刻恢复 −2%；跨天 −5%；下限不为负；电量归零只回调一次；`southpass` 的共享关系与 `n7→southpass = n7→northpass = 721`；`isDark` / `darkblock` 类名 / 没电悬浮文案；渲染层没电时 `dark_core` 得到 `is-blocked` 且不给 `is-open`。
- 端到端模拟（`.tools/nw_r9_e2e.mjs`，在 DOM 桩里真跑 `boot()` + 真跑 `tick()`，并用可控 `Date.now` 推进游戏时间）：
  - 站在 **area1 的 home 节点**过夜 → 电量回到 100%（区域仍是 `area1`）；站在 **area1 的 lighthouse** 过夜 → 不回电且照扣跨天 5%（40 → 35）。
  - 在 `dark_core` 里跑满 1 小时 → −3%；把电量压到 1% 再跑 1 小时 → 触发断电回家：节点与区域都变成 `home`、天数 +1、时间归零、体力与电量回满、**`staminaMax` 一分没扣**、终端依次打印「你在黑暗中失去了意识……」与「已经到达 家」、没有 gameOver。
  - 同一套时间流逝在非黑暗节点 1 小时只扣 2%；10 分钟对照实测黑暗 : 自然 = **1.5 : 1**。
  - 站在南关口、电量 0：`dark_core` 显示为不可点样式、点击无效、悬浮给出「没电了，预测不了时间。」；有电时同样的点击正常走进 `dark_core` 并打印移动横幅。
  - 回归：`n7` 视角下南关口是相邻菱形、能走过去并解锁 `darkarea`；存档往返保留 `darkarea` 的访问记录；存档版本仍为 3。
- 绘制坐标实测：大地图 `darkarea` 矩形 `(420,500)-(620,590)`，中心 x 与 `area1` 对齐、在 `area1` 正下方、不出画布、与 `area1` 底边留 20px；通道线与标签「南关口」都正常落在空隙里。区域地图里南关口在上、黑暗核心在下（北入口 → 往南进入黑暗）。

### 已知限制 / 遗留

- **`southpass` 因为要当 `darkarea.primaryShelter` 而进了 `isShelter()` 的并集**，于是它会像 `northpass` 一样多出「过夜 / 稍作停留」选项。这是「`primaryShelter` 必须是本区域节点」这条既有不变式带来的副作用；它**不回电**（回电只认 `home` 节点）。
- **黑暗断电回家后想去黑暗地点，可能被自己的规则挡一次**：如果在门口把电量刚好走干，`dark_core` 会立刻变成不可点，必须回 home 过夜补电再去。这是问题 7 的直接后果，未加特例。
- 电量流逝的速率只按「当前节点」判定，不区分「在黑暗里待着」与「从黑暗往外走的路上」：后者也算黑暗速率（见上面的判定说明）。
- 黑暗额外流逝默认 1%/h，在一夜 10 小时的尺度下只额外吃掉 10%，数值手感（以及是否该让黑暗地带更危险）待后续调参，常量都在 `config.js`。
- 预先存在的、本轮**未处理**的问题：`m1`（枯树林）的 ASCII 图是 **11 行**，与项目「12 行」的约定不符（其余 18 个场景都是 12 行）。
- 浏览器内的实际观感（黑暗地带的配色、没电视野收缩 + 黑暗禁入叠加后的可读性）仍需用户实测；本机没有浏览器自动化。

---

## [v1.8.7] — 2026-10-11 —— 5 项功能：机制 A 转正、移动耗时抽象、悬浮提示、没电视野收缩、体力 0/负值规则

**回档点**：`v1.8.7`

### 新增

**1. 移动耗时统一成 `HH:MM:SS` + ±10% 随机（`map.js` + `timeSystem.js`）**

- 新函数 `calcMoveDuration(fromId, toId, regionId = null, visited = null)` → `{ seconds, base, display } | null`
  - `base`：沿已探明路径逐跳累加的基础秒数（`computeMoveCost()` 的结果）
  - `seconds`：`Math.max(1, Math.round(base × (1 ± 0.1)))`
  - `display`：`formatDuration(seconds)` → `HH:MM:SS`
  - **不可达返回 `null`**，调用方必须据此拒绝移动（`null` 不等于 0，不是「免费移动」）
- 新函数 `clearMoveDurationCache()`：清空 `moveDurationCache`（`Map`，key = `` `${区域}|${起点}|${终点}` ``）
- **悬浮预览与点击移动共用同一份缓存值**：悬浮时先算并缓存，点击时 `travelTo()` 命中同一个 key，因此**两侧绝不会各摇一次随机**。作废时机：`setMapView()`（`refreshMap()` 内部会调它）与 `travelTo()` 移动生效之后。
- `timeSystem.js` 新增两个纯格式化函数：
  - `formatClock(elapsedSeconds)` —— 已流逝秒 → 夜间钟点 `HH:MM:SS`（20:00 起算，含负数取模保护）
  - `formatDuration(seconds)` —— 时长 → `HH:MM:SS`（**是时长不是钟点**，超过 24 小时不进位）
  - `getTimeString()` 改为复用 `formatClock()`，对外行为不变（没电仍返回 `??:??:??`）

**2. 悬浮提示：预计耗时 + 到达时间（`map.js` + `texts.js` + `style.css`）**

- 悬浮在**可点节点**（`is-visited` / `is-unseen`）上显示两行小提示：
  - `预计耗时 HH:MM:SS`（`UI.tipDuration`）
  - `到达时间 HH:MM:SS`（`UI.tipArrival`，= `formatClock(已流逝秒 + 本次耗时)`）
- 提示元素 `div.map-tip` 惰性创建，挂在 `<svg id="map">` 的父节点里；`position: fixed` + `pointer-events: none` + `z-index: 30`，贴视口边缘时自动翻到另一侧（`placeTip()`）。
- **电量归零 → 提示完全不可用**：`buildTipLines()` 第一行就是 `if (game.getBattery() <= 0) return null;`，连耗时都不显示。
- **不可点节点没有提示**：只有 `stateOf()` 判定为 `visited` / `unseen` 的分组才绑 `mouseenter` / `mousemove` / `mouseleave`；`is-current`（当前所在）与 `is-blocked`（已访问但走不到）都不绑。
- 同一目标上连续 `mousemove` 只挪位置、不重建两行文字（`tipFor` 记住上一个目标）。

**3. 机制 A 转正（`map.js`）**

- 「未访问节点渲染为菱形」的条件正式定为「**与当前节点有直接边**」——`hasDirectEdge(regionId, here, id)`；不满足则**完全不渲染**。源码注释已标注【正式机制 A】，不再视为临时行为。
- 理由（已写入注释）：同时满足「看得见路就能走」与「不泄露没走过的地图结构」；每次移动后 `currentNode` 变化，这一集合随重新渲染自动重算。
- `here` 为空时（尚未确定当前节点）退回旧规则 `computeClickable()`。

**4. 电量耗尽时视野收缩（`map.js`）**

- 区域地图：`inSight(id) = !noBattery || id === here || hasDirectEdge(regionId, here, id)`
  —— 只保留**当前节点与直接相邻节点**；**已访问但不相邻的节点也一并隐藏**。
  被隐藏的节点在 `stateOf()` 里直接返回 `null`：**既不可点，也没有悬浮提示**。
- 大地图：`inSight(id) = !noBattery || id === currentArea || isAreaNeighbor(currentArea, id)`
  —— 只保留**当前区域与相邻区域**（`isAreaNeighbor` = 声明了 `neighbors` 或共享节点）。

**5. 体力 0 / 负值规则（`state.js` + `main.js`）**

- `state.setStamina()` 改为**只夹上限、不夹 0**：`Math.min(state.staminaMax, Number(value) || 0)`，**内部允许记录负值**。
- `state.spendStamina()` 改为直接相减 + 只夹上限（不再经由 `setStamina()` 把负值抹成 0）。
- 状态栏显示 `Math.max(0, game.getStamina())` —— 内部负值不外显。
- `main.js travelTo()`：
  - **删除**「体力 < `MOVE_STAMINA_COST` 就拒绝移动」的门槛：**0 体力仍可行动，每次照扣 1 点**。
  - 扣完**正好为 0** → 打印 `UI.exhausted`（「你感到筋疲力尽。」）**仅此一句提示**，不影响行动。
  - 移动与到达流程走完后再判断体力 **< 0**：
    - 目标节点是安全屋（`isShelter(id)`）→ 就地 `settleNight()`，**不惩罚**；
    - 否则 → `onForceHome('stamina')`（送回本区域 `primaryShelter`，`staminaMax` −1）。
  - 「强制回家 → 先 `settleNight()` 再判 `gameOver`」的顺序**未变**；`staminaMax` 触底（≤ `STAMINA_MIN`）仍走游戏结束。

### 变更

| 文件 | 改动 |
|---|---|
| `v6/js/config.js` | `GAME_VERSION`：`v1.8.6` → `v1.8.7` |
| `v6/js/map.js` | 新增导出 `calcMoveDuration()` / `clearMoveDurationCache()` / `hideTip()`；新增内部件 `tipElement()` / `placeTip()` / `buildTipLines()` / `showTip()`；`renderArea()` 增加 `inSight` 过滤与悬浮事件绑定；`renderWorld()` 增加 `inSight` 过滤；`setMapView()` 清移动耗时缓存 + 收起提示；**新增对 `timeSystem.js` 的 import**（`formatDuration` / `formatClock`） |
| `v6/js/main.js` | `travelTo()` 改用 `calcMoveDuration()`，移除 `computeMoveCost()` 调用与体力门槛；`renderStatusBar()` 用 `Math.max(0, …)`；移动横幅打印 `move.display`；import 里去掉已无用的 `computeMoveCost` |
| `v6/js/state.js` | `setStamina()` / `spendStamina()` 允许负值 |
| `v6/js/timeSystem.js` | 新增 `formatClock()` / `formatDuration()`；`getTimeString()` 改为复用 `formatClock()` |
| `v6/js/texts.js` | 新增 `UI.exhausted` / `UI.tipDuration(d)` / `UI.tipArrival(t)` |
| `v6/style.css` | 新增 `.map-tip` / `.map-tip__line` |
| `HANDOFF.md` | 游戏版本同步为 `v1.8.7`；顺带修正该文档里「存档 `VERSION` 当前为 2」的过期描述（实际是 3） |

**存档格式**：`VERSION` 仍为 **`3`**，**未变**，旧存档照常加载。

### 验证

- 模块链接检查（10 个模块 OK，`main` 需 DOM）、DOM 桩 `boot()` 无异常、11 个 js 文件 `node --check` 全部通过。
- 45 项单元断言全部通过（脚本 `.tools/nw_r8_check.mjs`，`gitignore` 内，不入库）：
  - **机制 A**：站在 `home` 时 area1 只渲染 `home` + 菱形 `n1/n2/n3`；换到 `m1` 后菱形集合随之重算，且全部满足「与当前节点有直接边」。
  - **耗时**：`display` 匹配 `^\d{2}:\d{2}:\d{2}$`；400 次重摇的 `seconds/base` 落在 `0.900 ~ 1.100`；同一 key 第二次调用返回同一对象；**预览值 === 点击值**；`northgate → home` 绕行 `base = 1500` 秒；路径未探明时返回 `null`。
  - **提示**：两行文案正则匹配；电量 0 时不显示（`hidden === true`）；只有可点节点绑定了 `mouseenter`。
  - **没电收缩**：区域地图从 10 个节点缩到 4 个（只剩当前 + 直接相邻）；大地图从 4 个区域缩到 3 个（不相邻的 `area2` 被隐藏）。
  - **体力**：`0 − 1 = −1` 保留负值；`1 − 1 = 0` 不触发强制回家；上限仍生效；负值分支与「先结算再判 gameOver」的顺序断言通过。
- **端到端模拟**（脚本 `.tools/nw_e2e2.mjs`，48 项断言，全通过）：在 DOM 桩里真正跑 `boot()`，然后按玩家路径走一遍 ——
  大地图点 `area1` 切区域 → 悬浮 `n2` 读出「预计耗时 00:08:01 / 到达时间 20:08:01」→ 点击 `n2`，实际推进的秒数**恰好等于**预览那一份（`state.elapsed` 差值 === 预览秒数），横幅打印 `========== 家 -->中央大道 ==========` + 同一串 `耗时：`；
  体力 1 → 走到 `n5` 后变 0 并打印「你感到筋疲力尽。」、**没有被强制回家**；
  体力 0 时在 `n2` 走到 `n5`（非安全屋）→ 体力 −1 → **被送回本区域安全屋 `home`、`staminaMax` 10 → 9、不自动结算**；
  体力 0 时在 `n2` 走进 `home`（安全屋）→ **就地过夜：天数 +1、夜晚时间归零、体力回满、`staminaMax` 不变**；
  没电时区域地图 10 → 4 个节点、大地图 4 → 3 个区域、悬浮不再出提示。
  同时回归了既有的 `mustResolve` 规则：`n5` 未做出决定时点击其它节点不移动、不扣体力。


### 已知限制 / 遗留

- `UI.noStamina`（「你太累了，无法继续前进。」）在本轮之后**已无调用点**，暂时保留在文案表里未删。
- 移动耗时目前是**分钟级**（例如 `home → n2` 约 8~9 分钟），与夜间钟点刻度相比跨度偏大，数值手感待后续调整（`config.js` 的 `DISTANCE_TO_TIME_RATIO`）。
- 寻路仍以**跳数**最短为准，不是耗时最短（沿用 v1.8.5 起的既有行为）。
- 悬浮提示只绑在**区域地图的节点**上；大地图的区域块没有提示。
- 浏览器内的实际观感（提示位置、没电时的收缩效果）仍需用户实测；本机没有浏览器自动化。

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
