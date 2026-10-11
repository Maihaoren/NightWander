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
| `GAME_VERSION` | `v6/js/config.js` | `v1.9.0b3` | 面向玩家的游戏版本 |
| `VERSION` | `v6/js/saveSystem.js` | `4` | **存档结构**版本 |

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

## [v1.9.0b3] — 2026-10-11 —— 落地荒野（8 节点 + 6 个黑暗地点）+ 禁区解锁 + 驿站文本 + 金钥匙

**回档点 / git 标签**：`v1.9.0b3`

> 存档结构版本号**不变（仍是 v4）**、**没有新增字段**：禁区的解锁状态**完全由
> `visitedByArea` 推导**（森林深处 + 沼泽深处都到过），visited 只增不减，所以解锁天然永久、
> 读档后自动恢复。这是 b 块（地图重做）的第 3 块，共 4 块；本块**只落地数据**，
> 没有改动任何机制代码（黑暗流逝 / 移动耗时 / 存档格式一律没碰）。

### 新增

- **改动 1：荒野区域落地**（`v6/js/map.js`、`v6/js/texts.js`）
  - 8 个节点：共享接口 `northgate`（北关，与废城共用同一份文案）+ 7 个内部节点
    `yizhan` 驿站 / `xiaoshulin` 小树林 / `senlin` 森林 / `senlinshenchu` 森林深处 /
    `jinqu` 禁区 / `zhaoze` 沼泽 / `zhaozeshenchu` 沼泽深处。
  - 8 条边逐条按需求落地（`northgate→yizhan→xiaoshulin→senlin→senlinshenchu→jinqu`、
    `xiaoshulin→zhaoze→zhaozeshenchu`、`senlinshenchu↔zhaozeshenchu`），一条不多一条不少；
    前两条主链进 `mainRoads`，`forest深处→禁区` 与 `森林深处↔沼泽深处` 算支路（耗时 ×1.4）。
  - `primaryShelter = yizhan`：驿站成为安全屋（过夜 + 储物箱），沿用「共享节点 ∪ 各区域
    primaryShelter」的既有判定，安全屋总数 7 → 8。
  - `wilderness` 的 `placeholder` 标记去掉（`isAreaImplemented` 变 true），
    `REGION_VIEW_POS` 给荒野加了一条 `northgate` 的视觉覆盖：荒野在废城【北面】，
    所以北关在荒野这一侧贴【南】边（与 industry/coast/island/dock 四处同一套处理）。
  - 文本：`texts.js` 的 `SCENES` 补 7 段（节点总数 48 → 55，SCENES 同步 55）。
- **改动 2：荒野 6 个节点标记为黑暗**（`v6/js/map.js`）
  - `isDark = true`：`xiaoshulin` / `senlin` / `senlinshenchu` / `jinqu` / `zhaoze` / `zhaozeshenchu`；
    驿站 `yizhan` 与接口 `northgate` 不黑暗。这是黑暗机制的**第一批启用点**。
  - 机制代码零改动：`batteryDrainPerHour()` / `drainBatteryForGameSeconds()` / `tick()` /
    `advanceTime()` 一行没碰，`config.js` 的 2% 与 1% 也没动 —— 实测黑暗地点仍是 **3%/游戏小时**、
    普通地点 2%；「没电进不去黑暗地点」与「黑暗里掉到 0 断电回家（不扣体力上限）」照旧复用。
  - 文本用词：全局搜「手电筒 / 火把」——项目里这两个物品早就删了，所以把还提它们的措辞改掉：
    `x_e2s` 的按钮 `把手电开到最亮` → `把照明开到最亮`；随机事件 `flicker` 的叙事
    `手电被闪得忽明忽暗` → `手机的光被闪得忽明忽暗`；`modal.js` 用法示例里的 `手电筒` → `罐头`。
    **例外**：改动 4 那段用户钦定的值班日志正文里的「手电」原样保留（一字不改）。
- **改动 3：禁区解锁机制**（`v6/js/map.js`、`v6/js/main.js`）
  - `map.js` 新增 `LOCKED_NODES = { jinqu: ['senlinshenchu','zhaozeshenchu'] }` 与
    `isNodeUnlocked(nodeId)` / `lockedNodeIds()`；`renderArea()` 的 `stateOf()` 第一行加门槛：
    未解锁的节点**完全不渲染**（连菱形都没有），解锁后自动回到机制 A（相邻当前节点 → 菱形，
    不相邻 → 仍不渲染）。当前节点自己例外，免得 debug 传送过去后地图上没有自己那一格。
  - `main.js` 的 `visitNode()` 比较「标记前后还锁着哪些节点」，发现新解锁就置 `gateNoticePending`；
    `arriveAt()` 在到达文案之后输出 `UI.gateOpened = '林子里似乎出现了一条小路。'`
    （不能在 visitNode 里直接打：`arriveAt` 开头的 `clearQueue()` 会把它清掉）。
  - 解锁永久保持（visited 只增不减）；**不新增存档字段**，读档后按 visited 自动恢复。
- **改动 4：驿站储物箱的文本物品「值班日志」**（`v6/js/texts.js`、`v6/js/main.js`）
  - `DOCUMENTS` 从两份变三份，并给每份补一个 `shelter` 字段决定它挂在哪个安全屋：
    日记 / README → `home`；`shiftlog` 值班日志 → `yizhan`。
    `main.js` 的 `renderInventory()` 改成按 `doc.shelter === shelterKey` 过滤（原来是
    `shelterKey === HOME_ID` 才渲染两份）。
  - 名称「值班日志」、描述「一张皱巴巴的值班日志。」、正文两段按需求**一字不改**
    （第二段保留开头的省略号）；仍然不可拾取 / 不占容量 / 不消耗时间 / 可反复读。
- **改动 5：金钥匙**（`v6/js/texts.js`、`v6/js/map.js`）
  - `ITEMS.goldenkey`：名称「金钥匙」、无 `slot`（穿不上）、不提供口袋格；物品表 7 → 8 件。
  - 放置点 = 荒野禁区 `jinqu` 的 `items`（b4 码头金锁开门用，本块只落地物品与放置点）。
    于是「荒野有物品的地点」= 1 个（只有禁区），符合 b2 的口径。
- **改动 6：荒野资源交换分配**（`v6/js/map.js`）
  - 荒野无物品地点 = 5 个（不含禁区、驿站、北关）→ 按 b2 规则 2/5、1/5、2/5：
    **小树林 `x_scav`、森林 `x_nap`（时间 ↔ 资源 ×2）；沼泽 `x_s2e`（资源 ↔ 资源 ×1）；
    森林深处 / 沼泽深处 无交互 ×2**（两处「深处」是禁区门槛，刻意留空 → 到达时输出
    「这里什么都没有」）。用的都是既有 `EXCHANGES` 条目，没有新增文案；交换点总数 25 → 28。

### 变更

- `v6/js/config.js`：`GAME_VERSION = 'v1.9.0b3'`。

### 验证

- 新增临时校验脚本 `.tools/nw_b3_check.mjs`（6 个改动 + a/b1/b1.1/b2~b2.4 回归，全部通过），
  其中专门回归了三条「机制不许被碰」的约束：黑暗速率仍是 3%/h（离散与 tick 两条路各测一次）、
  没电仍进不去黑暗地点（走真正的 `travelTo`，不是 debug 传送）、黑暗归零仍断电回家且不扣体力上限；
  以及「存档字段表仍是那 18 个键」「解锁完全由 visited 推导」。
- 同步更新了老套件里因本块而变动的数字：节点 48 → 55、物品 7 → 8、安全屋 7 → 8、
  交换点 25 → 28、空地点 12 → 14、`isAreaImplemented('wilderness')` false → true、
  b1 里「试图进入未实现区域」的对照从荒野改到码头。
- 走过的全量套件（全部通过）：`nw_b3_check` / `nw_b24_check` / `nw_b23_check` / `nw_b22_check` /
  `nw_b21b_check` / `nw_b2_check` / `nw_b11_check` / `nw_b1_check` / `nw_r13_check` / `nw_r14_check` /
  `nw_boot_check` / `nw_ver_check`。

### 已知限制 / 遗留

- **「值班记录」还是「值班日志」**：本轮需求的目标一栏写的是「值班记录」，改动 4 的细则写的是
  物品名「值班日志」（正文也自称值班日志）——按细则落地为 **值班日志**。
- **debug 传送可以绕过禁区门槛**：门槛只作用在渲染层（不渲染 → 点不到），`/goto` 这类调试指令
  仍能直接把玩家送进去。这是调试入口的既有性质，没有为它加特例。
- 两处「深处」没有交换、也没有物品，到达时只说「这里什么都没有」；如果想给它们内容，
  等 c 块的物品/使用系统。
- 黑暗节点目前只有荒野这 6 个；b4 的码头/孤岛若也有黑暗地点，直接在 `defNode` 上补 `isDark` 即可。
- 金钥匙与渡口钥匙都只是「带着的道具」，开门判定等 b4。

---

## [v1.9.0b2.4] — 2026-10-11 —— 拾取弹窗补装备入口（电容器根因收口）+ 作者留言显示名改 README

**回档点 / git 标签**：`v1.9.0b2.4`

> 存档结构版本号**不变（仍是 v4）**、**没有新增字段**。
> 改动 1 是 b2.3 那条的**收口**：主要入口在 b2.3 已经补上，本块把判据统一成
> 「slot 必须在 SLOTS 里」并把这套行为固化成验收断言；
> 改动 2 只动一个显示名。

### 变更

- **改动 1：拾取弹窗的「装备 X」入口收口**（`v6/js/inventory.js`、`v6/js/main.js`、`v6/js/texts.js`）
  - 现状说明：b2.3 已经落地了这条主路径 —— `inventory.canEquip()`、`main.js` 的 `takeAndEquip()`、
    `pickUpItems()` 里给可装备物品多列的「装备 X」（`id` 前缀 `equip:`，`modal.js` 不动）、
    以及 `tryTakeItem()` 的「已被拿走」去重守卫。本块**没有重复实现**，只做了下面两件事。
  - `canEquip(item)` 的判据补齐：原来是 `Boolean(item && item.slot)`，
    「槽位名必须在 `SLOTS` 里」那一步只写在 `planEquipFromCarried` 内部 ——
    现在并进 `canEquip`（`Boolean(item && item.slot && SLOTS.includes(item.slot))`），
    于是**所有入口**（拾取弹窗的「装备 X」、物品栏的当地物品行 / 口袋行 / 手持槽行、
    `takeAndEquip`、`planEquipFromCarried`）用的是同一条判断：
    一个把槽位名写成 `'hat'` 的物品在任何入口都不会冒出「装备」按钮，也不会静默「装备成功」。
  - `planEquipFromCarried` 的提示分成两种：没有 `slot` →「这东西穿不上。」；
    槽位名不在 `SLOTS` 里 →「这东西没地方穿戴。」（原来两者混在一句里）。
  - 验收固化成 `.tools/nw_b24_check.mjs`：电容器 / 大衣 / 牛仔裤 / 任意新槽位物品
    （测试里临时造的「挎包」`back` + `pockets: 2`）都能从拾取弹窗**一步穿到对应槽位**；
    `back` 已有装备时弹「换上 / 先不换」替换流程；不可装备的物品（罐头）不会多出条目；
    过期条目不会重复发一份；穿上电容器前后 `computePocketCapacity` 不变（`pockets: 0`）；
    野外点背部槽依旧不会脱下（`unequip()` 的 `currentShelterKey()` 判断未动）。
  - **没做**：电容器 `batteryMaxBonus: 25`（电量上限 +25%）仍只是数据，本块不参与任何计算（留 c 块）。
- **改动 2：作者留言显示名 → `README`**（`v6/js/texts.js`，另有 3 处注释同步）
  - `DOCUMENTS` 第二份的 `name`：`'作者留言'` → `'README'`。`id` 本来就是 `'readme'`，没动。
  - **只动显示名**：储物箱里的位置（排在真物品与日记之后）、点开后的终端输出
    （仍是 `UI.inspect('README', '一张夹在盒子里的纸。')` + 4 段正文）、
    「不可拾取 / 不占容量 / 不消耗时间」的既有行为，以及 a 块的怀表看时间入口，全部没变。
  - **存档不受影响**：两份文档从来就不在 `state` 里（`state.js` 只有一条提到它们的注释），
    快照与存档字段表里既没有 `diary` / `readme` 也没有显示名 —— 所以既不用迁移，也不用兼容分支。
    实测存档串里搜 `diary` / `readme` / `日记` / `README` 全部为 false。
  - 其他出现处的统一：`main.js` 两处注释、`map.js` 一处注释里的「作者留言」改成 README。
    `CHANGELOG.md` 里 a / b1 的历史条目**保持原样**（那是当时的事实记录，本节的改名事实记在这里）；
    `HANDOFF.md` 的遗留表更新为「靠名称 `README` 区分」。

### 验证

- 新增临时校验脚本 `.tools/nw_b24_check.mjs`（2 个改动 + a/b1/b1.1/b2/b2.1/b2.2/b2.3 回归，全部通过）。
- 同步更新了 `.tools/nw_b1_check.mjs` / `nw_b11_check.mjs` / `nw_b2_check.mjs` 里
  「DOCUMENTS 名称 / 储物箱行名」的断言（`作者留言` → `README`），
  以及 `nw_b22_check` / `nw_b23_check` 里过时的版本号与 `canEquip` 正则。
- 走过的全量套件（全部通过）：`nw_b24_check` / `nw_b23_check` / `nw_b22_check` / `nw_b21b_check` /
  `nw_b2_check` / `nw_b11_check` / `nw_b1_check` / `nw_r13_check` / `nw_r14_check` /
  `nw_boot_check` / `nw_ver_check`。

### 已知限制 / 遗留

- 拾取弹窗里可装备的物品仍占两行（「电容器」+「装备 电容器」）。这是刻意的：
  一行是「拿走」，一行是「拿走并穿上」；物品栏那条窄按钮也仍然保留，两条路都通。
- 电容器装上后没有任何数值效果（上限 +25% 属于 c 块）。
- 「挎包 / 大背包」这两个物品本身还没进 `ITEMS`（c 块按计划加），
  本块的验收用一个临时造的 `back` + `pockets: 2` 物品证明了**任意合法槽位**都能走这条入口。
- 老套件 `nw_r16_check.mjs` 是 a 块时期的临时脚本（里面还写着已删除的手电筒 / 火把 / 古老地图），
  早已被后续套件取代，本次没有跟着改它的断言。

---

## [v1.9.0b2.3] — 2026-10-11 —— 事件弹窗标题改「在路途上：」+ 空地点只说一句 + 电容器装备入口补全

**回档点 / git 标签**：`v1.9.0b2.3`

> 存档结构版本号**不变（仍是 v4）**、**没有新增字段**。三处都是小改：
> 一条文案、一处条件输出、一条拾取弹窗入口（外加一条防重复拾取的守卫）。

### 变更

- **改动 1：突发事件弹窗标题 →「在路途上：」**（`v6/js/texts.js`）
  - `UI.eventTitle`：`'突发事件'` → `'在路途上：'`。全项目只有一处引用它
    （`main.js` 的 `runEventFlow` 里 `title: UI.eventTitle`），所以只影响随机事件那一个弹窗。
  - 正文（事件 `desc`）、选项、触发时机、以及「选择窗 → 结果窗 → 拾取窗」的流程一行没动；
    资源交换（空标题）/ 安全屋（安全屋）/ 拾取（发现物品）/ mustResolve（地点名）四个弹窗
    各自用自己的标题，不受影响。
  - 深色模式没有给 `.map-modal__title` 写过单独样式（深色块只覆盖颜色变量），
    标题样式沿用原来那一条 `font-weight: 700`，本块没有碰 CSS。
  - `events.js` 本来就没有任何标题文案（它只管事件池与效果），所以**该文件未改动**。
- **改动 2：空地点只说一句**（`v6/js/texts.js`、`v6/js/main.js`）
  - 文案统一成 `UI.nothingHere = '这里什么都没有。'`（原 b2.2 的「这里什么也没有」全项目改掉）。
  - `arriveAt()` 第 3 步改成条件输出：`const barren = hasNothingToDo(node);`
    为真 → 只打 `UI.nothingHere`；为假 → 照旧打 `UI.prompt`（你要做什么？）。
    b2.2 那一步「什么都没有」的输出位置也从拾取之后挪到了这里，两句话不再一前一后叠着出现。
  - 判定条件沿用 b2.2 改动 1（`hasNothingToDo`：无物品 + 无资源交换 + 无其它交互，三者全满足）；
    `UI.prompt` 文案本身与输入框占位符都没改。
- **改动 3：电容器（第一件 back 槽装备）装备入口补全**（`v6/js/inventory.js`、`v6/js/main.js`、`v6/js/texts.js`）
  - **根因（先排查后修）**：把「能不能穿」写在多处（各处 `item.slot` 真值判断），
    而野外拿东西的**第一入口**——到达时自动弹的**拾取弹窗**——只有「点物品拿走」一条路，
    **没有任何装备入口**。所以「捡到就能立刻穿上」在 b2.2 只对「物品栏里那个窄窄的『装备』小按钮」成立，
    从拾取弹窗走的话只能先收进口袋/手持槽再去找那个按钮 —— 电容器就是这么被漏掉的。
    经实测排除了需求里列的四种猜测：`slot` 就是 `'back'`（没缺字段）；`SLOTS` / `POCKET_SLOTS`
    都含 `back`，也没有「无 pockets 就被跳过」的分支；装备入口的渲染与替换流程都不认槽位名。
  - `inventory.js`：新增 `canEquip(item)` —— **唯一判据 = 物品自带 `slot`**，
    与槽位叫什么无关；`planEquipFromCarried` 改用它，并补一道「槽位名必须在 `SLOTS` 里」的校验
    （物品表写错槽名时给出理由，而不是静默「装备成功」却没人承接）。
  - `main.js`：新增 `takeAndEquip(node, itemId, item)`（拿起 + 立刻穿上，拾取弹窗与物品栏共用）；
    `pickUpItems()` 里可装备的物品**多列一条「装备 X」**（`id` 用 `'equip:<itemId>'` 前缀区分，
    modal 只把它当不透明值回传，所以 `modal.js` 不用改）；物品栏三个入口（当地物品行 / 口袋行 /
    手持槽行）的渲染条件统一改走 `inventory.canEquip(item)`。
  - `texts.js`：新增 `UI.pickupEquip(name) = '装备 X'` 与 `UI.pickupEquipHint(name)`。
  - 顺带修掉一个相邻 bug：拾取弹窗的列表是打开时的快照，玩家可以在弹窗开着的时候
    用物品栏入口把同一件东西拿走，再点那个过期条目就会**再发一份**（重复物品）。
    `tryTakeItem()` 现在先判「已被拿走且不在节点物品池里」→ 直接返回 false。
  - **没做**：电容器 `batteryMaxBonus: 25`（电量上限 +25%）仍然只是数据，本块不参与任何计算 ——
    上限系统留 c 块；`pockets: 0` 意味着穿上它不改变口袋容量（第一件 back 装备不会挤掉别的槽位）。

### 验证

- 新增临时校验脚本 `.tools/nw_b23_check.mjs`（3 个改动 + a/b1/b1.1/b2/b2.1/b2.2 回归，全部通过）；
  其中改动 1 走的是真事件流程（`/event trigger coin_purse` → 标题 / 正文 / 选项 / 结果窗 / 拾取窗
  逐项核对），改动 3 覆盖「拾取弹窗装备 / 物品栏装备 / 替换流程 / 非装备物品不多出条目 /
  存档往返 / 过期条目不重复发」。
- 装备路径实测矩阵（9 种起始状态：口袋 / 手持 / 当地 / 储物箱 × back 空 / 占用 × 口袋有无空位）
  全部能穿上，唯一被拒绝的是「口袋没空位 + 手持被占 + 目标槽也有装备」且旧装备无处安放 ——
  那是容量规则本身，不是 back 槽的问题。
- 走过的全量套件（全部通过）：`nw_b23_check` / `nw_b22_check` / `nw_b21b_check` / `nw_b2_check` /
  `nw_b11_check` / `nw_b1_check` / `nw_r13_check` / `nw_r14_check` / `nw_boot_check` / `nw_ver_check`。

### 已知限制 / 遗留

- 拾取弹窗里可装备的东西会占两行（「电容器」与「装备 电容器」）。这是为了让「捡到就穿」
  在最常用的入口就能完成；物品栏那条窄按钮仍然保留（两条路都通）。
- 空地点那一句仍然可能出现在随机事件之前（事件是 `arriveAt` 之后才掷的），要彻底消掉
  这个顺序得把掷骰提到到达流程之前，本块没动。
- 电容器装上后没有任何数值效果（上限 +25% 属于 c 块）；装备替换时旧装备优先回口袋、
  再看手持槽，两处都不行就拒绝更换而不是自动丢弃。

---

## [v1.9.0b2.2] — 2026-10-11 —— 交换改回点选项触发 + 野外可立即装备 + 安全屋弹窗加「显示大地图」+ 发电厂回电改回

**回档点 / git 标签**：`v1.9.0b2.2`

> 存档结构版本号**不变（仍是 v4）**、**没有新增字段**：交换的「已用」状态继续落在既有的
> `usedOptions` 里。本版把 b2.1 的三处改动**按需求改回去**：
> 资源交换（自动弹窗 → 点选项触发）、发电厂过夜回电（+30% 上限）、野外装备限制（放开）。
> v1.9.0b2.1 保留的其它内容（怀表点击看时间、10 条场景化交换文案、空标题弹窗、
> 废城 9/5/9 的交换分配）一个字都没动。

### 新增

- **改动 1：无交互地点补一句空文案**（`v6/js/texts.js`、`v6/js/main.js`）
  - 新增 `UI.nothingHere = '这里什么也没有。'`；到达「什么都不能做」的地点时终端补这一句，
    不消耗时间、不弹窗、不生成选项。
  - 判定 `hasNothingToDo(node)`（main.js）四个条件全满足才输出：
    ① 没有可拾取物品（按 `collectedItems` 过滤）② 没有资源交换 ③ 不是安全屋
    ④ 没有 mustResolve、也没有任何非系统选项。全图共 12 个这样的地点。
- **改动 4：安全屋弹窗加「显示大地图」**（`v6/js/texts.js`、`v6/js/main.js`）
  - `UI.showWorldMap = '显示大地图'`；`resolveShelter()` 的选项从 4 个变 5 个，
    顺序 `[过夜] [导出存档] [导入存档] [显示大地图] [稍作停留]`（新增项在倒数第二）。
  - 点它会 `switchMapView('world')` 打开大地图，然后**就地结束整个弹窗**：
    不消耗时间 / 体力 / 电量、不移动、不换天，**关掉大地图后不会回到安全屋弹窗**、
    也不再逼玩家补选一项（弹窗已经在点它的时候 resolve 掉了）。
  - `modal.js` 不需要改动：它本来就按 `items` 数组渲染任意数量。

### 变更

- **改动 2：资源交换改回「点选项 → 弹窗」**（`v6/js/map.js`、`v6/js/main.js`、`v6/js/texts.js`）
  - `map.js`：交换选项去掉 `arrivalOnly: true`（删除占位常量 `EXCHANGE_OPTION_TEXT`），
    按钮文案回到 `EXCHANGES[id].button`；`timeCost: 0` 不变。
  - `main.js`：`availableOptions()` 去掉 `arrivalOnly` 过滤器；恢复 `KIND_HANDLERS.exchange = exchangeAtNode`
    （即 b2 的 `exchangeAtNode`，原 `resolveExchange` 改名并去掉到达自动弹窗那一段）；
    `arriveAt()` 里删掉第 8 步（不再自动弹），只剩第 9 步安全屋弹窗；
    `onOptionClick` 恢复「kind === 'exchange' 不打『已用过』标记」的例外 ——
    点按钮只是开窗，**只有弹窗里选「执行」才消耗**，选「算了」按钮保留；
    删除 `promptedExchange` 守卫（只剩 `promptedShelter`）。
  - `texts.js`：`EXCHANGES` 每条新增 `button`（10 条地点选项按钮文案），措辞与各自 `desc` 呼应，
    例如 `x_rest` → `坐下来歇一会儿`、`x_power` → `接上电充一会儿`、`x_scav` → `翻一翻那堆杂物`。
  - 到达安全屋且该地也有交换时：**安全屋弹窗先弹**，关掉之后地点按钮行里的交换按钮由玩家自己点。
- **改动 3：所有捡到的装备都能立刻穿上**（`v6/js/inventory.js`、`v6/js/main.js`）
  - `inventory.js` 新增纯函数 `planEquipFromCarried(item, equipped, pocket, from)`：
    没有 `slot` 的东西穿不上；槽空 → `mode:'equip'`；槽已有装备 → `mode:'replace'`
    并把旧装备的去处（`carry: 'pocket' | 'hand'`）一起算好（口袋按**换好之后**的装备算容量，
    换上的装备提供的口袋格数可能不同）；两处都放不下就返回 `reason` 让玩家先腾空间。
  - `main.js` 新增 `equipFromCarried(item, from)`（穿：替换时弹二选一确认窗）、
    `carriedInstanceOf(itemId)`（拾取存的是副本，要按实例找）、`localEquip(itemId)`
    （当地物品行点「装备」= 先按原拾取规则拿起来，再立刻穿上）。
  - 物品栏里装备类物品多一个「装备」小按钮：**当地物品行**（野外捡到就能穿）、
    **口袋行**、**手持槽行**三处；文案 `UI.equipAction / equipHint / equipReplaceTitle /
    equipReplaceDesc / equipReplaceConfirm / equipReplaceCancel`。
  - 「野外只能捡不能装备」不是全局开关、也不再有物品级例外 —— 原来的限制是结构性的
    （`planWildPickup` 只返回 pocket/hand，`planTakeFromStorage` 的 equip 分支只在家用），
    本版是**新增一条入口**，没有解锁任何开关。
  - **脱下仍然只在安全屋**：`unequip()` 开头那句 `currentShelterKey()` 判断一行没动，
    野外点装备槽依旧只是「查看」。
- **改动 5：发电厂过夜回电改回（+= 上限 × 30%）**（`v6/js/main.js`、`v6/js/texts.js`）
  - 恢复 `POWERPLANT_ID = 'powerplant'`、`POWERPLANT_RECHARGE_RATIO = 0.30` 与
    `UI.powerplantOvernight` 文案；`settleNight()` 第 4 步恢复两条分支：
    家 → 回满，发电厂 → `setBattery(当前 + BATTERY_MAX × 30%)`（`setBattery` 自带 clamp 到上限）。
  - 新增 `logOvernightFlavor()`：过夜后按落点输出「发电厂专属那句 / 通用那句」；
    `overnightAtShelter()` 把它放在 `arriveAt()` **之后**（arriveAt 开头会 `clearQueue()`，
    排前面会被连排队一起清掉），安全屋弹窗里的「过夜」也调它。
  - 结算顺序与电量流逝逻辑一个字没改：仍是 `天数 +1 → 跨天扣 5 → 时间归零 → 体力回满 → 回电`；
    `timeSystem.js` 依旧没有被改动（回电规则一直在 main.js 的 `settleNight`）。

### 验证

- 新增临时校验脚本 `.tools/nw_b22_check.mjs`（5 个改动 + a/b1/b1.1/b2/b2.1 回归，全部通过）；
  同时把 `.tools/nw_b21b_check.mjs` / `.tools/nw_b2_check.mjs` 里被本版回退的过时断言
  改成新行为（交换按钮触发、发电厂 +30%、安全屋 5 项、电容器可装备）。
- 走过的全量套件（全部通过）：`nw_b22_check` / `nw_b21b_check` / `nw_b2_check` / `nw_b11_check` /
  `nw_b1_check` / `nw_r13_check` / `nw_r14_check` / `nw_boot_check` / `nw_ver_check`。
- 交换选项 `kind='exchange'` + `timeCost=0`：不进随机事件池、不被移动或耗时随机触发（断言覆盖）；
  与事件 / mustResolve / 拾取 / 安全屋弹窗依旧 await 串行、不叠加。

### 已知限制 / 遗留

- 「这里什么也没有。」在**随机事件触发前**就打了：事件是 `arriveAt` 之后才掷的
  （见 `travelTo` 里 `arriveAt` 的下一条 `rollRandomEvent`），所以地点可能先报「什么都没有」、
  紧接着弹一个事件。要彻底消掉这个顺序问题得把掷骰提到到达流程之前，本块没动。
- 发电厂的「上限」取的是常量 `BATTERY_MAX`（当前恒为 100）。c 块把电量上限做成可变值之后，
  `settleNight` 那一行要改成读上限接口，否则 125% 上限的例子不会成立。
- 装备替换时旧装备优先回口袋、口袋放不下再看手持槽；两处都不行就**拒绝更换**并提示先腾空间
  （不做「自动丢弃」）。
- 储物箱里的装备没有加「装备」小按钮：在家取出来本身就会走 equip/口袋，取不出来时
  点口袋里的「装备」即可，功能没有缺口。
- 交换的 effect 数值依旧不显示给玩家（只有描述性文案）；
  「物资 -1 → 体力 +1」那条需求仍未实现（需要一个选物品的选择器）。

---

## [v1.9.0b2.1] — 2026-10-11 —— 交换改成到达即弹窗 + 怀表点击看时间 + 发电厂不再回电

**回档点 / git 标签**：`v1.9.0b2.1`

> 存档结构版本号**不变（仍是 v4）**，**没有新增字段**：交换的「已用」状态继续复用既有的
> `usedOptions`。交换选项在 `map.js` 里仍然是一条真实选项（`arrivalOnly: true`），
> 只是不再渲染成按钮 —— 这样它的 `fullIndex` 编号稳定，「已用」状态天然进存档。

### 变更

- **改动 1：交换点补全**（`v6/js/map.js`）
  - 废城（`wasteland`）按 b2 的「同一套比例」补齐：23 个「没有物品」的地点里
    **9 个时间↔资源 / 5 个资源↔资源 / 9 个无交互**（2/5 × 23 = 9.2、1/5 × 23 = 4.6，允许 ±1 浮动）。
  - 工业区/东海岸复查后只补了两个真正欠缺的节点：`powerplant`（资源↔资源 `x_s2i`）、
    `dockgate`（时间↔资源 `x_power`）。**刻意没动 `southgate` / `eastgate`** ——
    这两个接口节点同时属于废城，挂上去会把废城那 23 个的分配比例顶掉（变成 10/6/7）。
  - 结果：工业区 11 个无物品地点 → 4 时间 / 2 资源 / 5 无交互；东海岸 7 个 → 3 / 2 / 2；
    全图交换点共 **25 个**（废城 14 + 工业区 6 + 东海岸 5）。有物品的地点一个都没挂交换。
- **改动 2：交换改成「到达即弹窗」**（`v6/js/main.js`、`v6/js/modal.js`、`v6/js/texts.js`）
  - 新增 `async resolveExchange(node)`，由 `arriveAt` 在 mustResolve 之后调用：
    走进一个挂了交换的地点就**自动弹出**二选一弹窗，**没有关闭按钮、没有底部按钮、不响应 ESC / 点遮罩**，
    必须二选一；弹窗期间时间暂停（走既有 `withTimePaused`）。
  - 选「动手」→ 执行 effect、写「已用」标记、终端输出叙事；选「不做」→ 什么都不变、
    选项保留，**离开再回来才会再弹**（守卫 `promptedExchange`，只在 `visitNode()` 里清空，
    所以安全屋「就地过夜」那种原地重进到达流程不会二次弹窗）。
  - 交换弹窗排在安全屋弹窗**之前**，两者串行、不叠加。
  - 交换选项不再出现在按钮行 / 选项行 / mustResolve 弹窗里（`availableOptions()` 过滤 `arrivalOnly`）。
  - **修复**：`exchangeOptionOf()` 改为优先从 `game.getOptions()`（`buildOptions` 已盖好 `fullIndex`）
    取那条交换选项。原先直接读 `map.js` 里的原始选项对象，那个对象没有 `fullIndex`，
    于是 `markOptionUsed` 写进一个 `undefined` —— 同一次会话里看着正常，
    但存档里被序列化成 `null`，**读档后「已用」判定失效，同一个交换能再做一次**。
- **改动 4：怀表点击看时间**（`v6/js/main.js`、`v6/js/texts.js`）
  - 删掉所有「掏出怀表看一眼」选项（以及 `TIME_TEXTS` 里的 watch 一项）：
    现在「看时间」只有一个入口 —— 在物品栏里点怀表（储物箱 / 口袋 / 手持槽三处都行）。
  - 点击输出 `怀表指针停在 HH:MM:SS。`（`UI.watchTime`，不消耗时间/体力/电量）；
    电量归零时改说 `怀表指针也看不清了。`（`UI.watchDark`）。
  - 怀表的「整理动作」没丢，挪到行内右侧小按钮：储物箱里是「取出」、口袋里是「放回储物箱」
    （野外是「拿在手里」）、手持槽里是「收回口袋」。为此 `carriedItemRow()` 增加 `extras` 参数，
    其它物品的渲染完全不变。
- **改动 5：发电厂过夜不再回电**（`v6/js/main.js`）
  - 删掉 b2 的「发电厂过夜 `+= 上限 × 30%`」分支与 `POWERPLANT_ID` / `POWERPLANT_RECHARGE_RATIO`
    两个常量、以及 `UI.powerplantOvernight` 文案。`settleNight()` 里只剩**家**一个回电分支
    （`RECHARGE_NODE = HOME_ID` → 电量回满）；其余结算（跨天扣 5 电、体力、日期）一律不变。
  - 结果：发电厂过夜 40 → 35（只扣跨天），和南关等其它安全屋一致。
- **改动 6：到达安全屋自动弹窗**（`v6/js/main.js`、`v6/js/texts.js`）
  - 新增 `async resolveShelter(node)`，`arriveAt` 里排在交换弹窗之后：
    到达安全屋自动弹四选一 —— **`[过夜] [导出存档] [导入存档] [稍作停留]`**（顺序即需求顺序），
    标题 `安全屋`、正文一句描述；同样强制二选一之外的「必须选一项」，期间时间暂停。
  - 每次停留只弹一次（守卫 `promptedShelter`，清空点同样是 `visitNode()`）：
    **离开再回来会再弹**，原地过夜不会。
  - 注意这是**新增**入口，不是替换：按钮行里原有的「过夜 / 稍作停留」选项照旧保留。
- **改动 7：交换弹窗文案重写**（`v6/js/texts.js`、`v6/js/modal.js`）
  - `EXCHANGES` 每条从 `{ button, desc, narrate }` 改成 `{ desc, exec, cancel, narrate }`，
    共 10 条（新增 `x_s2i`）。删掉 `UI.exchangeTitle` / `UI.exchangeExec` / `UI.exchangeCancel`。
  - 弹窗**标题留空**（`modal.js` 改成标题为空就不画那一行），不再出现「资源交换」字样；
    描述强调代价与收益、不下裸露数值；两个按钮用场景化措辞（如 `坐下歇会儿` / `撑住不歇`、
    `接线充电` / `先不充`），执行后用一句叙事收尾。
  - `modal.js` 的唯一改动：标题行改为 `if (title)` 条件渲染。

### 验证

- **未改动**：`v6/js/timeSystem.js`（改动 5 的规则一直落在 `main.js` 的 `settleNight()` 里，
  时间模块本身没有回电逻辑）、`v6/js/inventory.js`（改动 3 只做核对：`planWildPickup` /
  `planLocalPickup` 的返回只可能是 `pocket` / `hand` / `needDiscard`，**永远不会 `equip`**；
  电容器 `slot: 'back'` 也只是数据 —— 野外捡不起装备、点背部槽只查看）。
  存档格式（`saveSystem.js`，`VERSION = 4`）未动。
- 新增临时校验脚本 `.tools/nw_b21b_check.mjs`（7 个改动 + a/b1/b1.1/b2 回归，全部通过）；
  同时更新了 `.tools/nw_b2_check.mjs` 里 3 处过时断言（交换不再是可点选项、发电厂过夜回电、
  `EXCHANGES` 条数与字段），并给 `nw_b1_check` / `nw_b11_check` / `nw_r13_check` / `nw_r14_check`
  的传送步骤补了「收拾到达弹窗」—— 否则自动弹窗会锁住输入、吃掉后续 debug 指令。

### 已知限制 / 遗留

- 交换的 effect 数值（+体力 / -电量 / 刷物品）**不显示给玩家**，只有描述性文案。
- 需求里「物资 -1 → 体力 +1」这一条**没有实现**：它需要一个「选哪件物品」的选择器，
  而二选一弹窗给不了；当前用的是对称的「体力 -1 → 物资 +1」（`x_s2i`）。
- `ITEMS.capacitor.batteryMaxBonus = 25` 仍是纯数据，没有任何计算读它（电量上限系统在 c 块）。
- 安全屋弹窗与按钮行里的「过夜 / 稍作停留」是两套入口，功能重复（按需求保留）。

---

## [v1.9.0b2] — 2026-10-11 —— 字体加大 + 地点资源交换系统 + 落地工业区/东海岸

**回档点 / git 标签**：`v1.9.0b2`

> 存档结构版本号**不变（仍是 v4）**，也**没有新增字段**：
> 资源交换的「用过」状态直接复用既有的 `usedOptions`（每个节点一份「已用序号」集合），
> 天然进存档、天然恢复，所以 b2 不需要动存档格式。

### 新增

- **地点资源交换系统**（改动 2）：给「没有物品奖励」的地点补一个交互入口。
  - 分配比例按需求落在 b2 两个新区域里「专属且没有物品」的 14 个节点上：
    2/5 × 14 = 5.6 → **6 个时间↔资源**；1/5 × 14 = 2.8 → **3 个资源↔资源**；
    2/5 × 14 = 5.6 → **5 个保留无交互**（6 + 3 + 5 = 14，差的 2 个按「允许 ±1 浮动」补齐）。
  - 交互形式：地点上挂一个 **once** 选项按钮 → 点击弹出「资源交换」弹窗
    （标题 + 描述 + 「执行 / 算了」两项，与随机事件弹窗同形式）→ 选择后关闭弹窗，
    「执行」才执行 effect 并往终端输出一句描述性文本。
  - **「执行」才消耗该选项**（按钮消失）；**「算了」不算用掉**，选项保留、下次还能点。
  - 弹窗期间时间暂停（走既有 `withTimePaused`）；与 mustResolve / 拾取弹窗顺序执行、不串台。
  - **不进随机事件池**、不被移动或耗时触发：交换选项自身 `timeCost = 0`，
    所以 `onOptionClick` 末尾那条「耗时后掷一次」不会执行；时间推进发生在 effect 里。
  - 9 条交换：时间↔资源 6 条（睡一会儿 / 喘口气 / 接电 / 吃点东西 / 拆电池 / 翻杂物）、
    资源↔资源 3 条（电换体力 / 体力换电 / 电换物资）。
- **工业区 `industry` 落地**（改动 3）：southgate + powerplant 两个共享接口 + 13 个专属节点 = **15**。
- **东海岸 `coast` 落地**（改动 4）：eastgate + dockgate 两个共享接口 + 8 个专属节点 = **10**。
- **发电厂特殊过夜**（改动 3）：在 `powerplant` 过夜时 **电量 += 上限 × 30%**（加完 clamp），
  与「家回满」区分开；另有一句说明「在这儿充上电了」的文本。
- **新物品**：`capacitor` 电容器（背部槽，`batteryMaxBonus: 25`）、`charger` 充电器、`ferrykey` 渡口钥匙。
- `UI` 新增：`exchangeTitle` / `exchangeExec` / `exchangeCancel` / `powerplantOvernight`。

### 变更

- **改动 1：物品栏与终端字体 +20%~25%**
  | 变量 | 旧 | 新 | 用途 |
  |---|---|---|---|
  | `--fs-term` | 13px | **16px** | 终端日志 / 选项按钮 / 输入框 / 物品名按钮 |
  | `--fs-body` | 14px | **17px** | 物品栏正文 |
  | `--fs-title` | 13px | **16px** | 面板标题 / 物品栏容量数字 / 主题按钮 |
  | `--fs-inv-label` | （写死 12px） | **15px** | 物品栏分区标题 / 空提示（新增变量） |
  - `--fs-status` **没动**（状态栏是定高的，放大容易挤爆；需求也只说了物品栏与终端）。
  - 小屏媒体查询那一套字号同步放大。
  - **「深色模式两套变量都要改」这条不适用**：字号变量只有 `:root` 一份，
    `html[data-theme="dark"]` 里只有颜色、没有字号 —— 字号本来就与主题无关，两套主题共用一份。
- `southgate` 在工业区视图、`eastgate` 在东海岸视图各加一条视觉覆盖（各自贴到朝对面区域的那一侧）；
  `powerplant`（孤岛侧）与 `dockgate`（码头侧）也补了覆盖，虽然 b4 前进不去。
- `REGIONS.industry / coast` 不再是占位；`regions.dock.nodes = ['dockgate']`、`island.nodes = ['powerplant']`。
- `GAME_VERSION`：`v1.9.0b1.1` → `v1.9.0b2`。

### 修复

- **发电厂过夜那句专属文本会被吞掉**：`arriveAt()` 开头会 `terminal.clearQueue()`，
  如果把 `terminal.log(...)` 排在 `settleNight()` 之后、`arriveAt()` 之前，
  这一行还在排队就被清掉了，玩家根本看不到。已改成 `arriveAt()` **之后**再打。

### 变更清单

| 文件 | 改动 |
|---|---|
| `v6/style.css` | 字号变量放大（改动 1）；新增 `--fs-inv-label`；`.inv-section__title` / `.inv-section__empty` 改用该变量；小屏那一套同步 |
| `v6/js/texts.js` | 新增 `EXCHANGES`（9 条）；ITEMS 加 capacitor / charger / ferrykey；SCENES 加 23 个新地点；UI 加 4 条文案 |
| `v6/js/map.js` | 新增 `powerplant` / `dockgate` / 13 个工业区节点 / 8 个东海岸节点；industry / coast 区域表落地；dock / island 接上接口；`REGION_VIEW_POS` 加 4 条覆盖；新增 `EXCHANGE_BY_NODE` 表 + 把交换挂成地点选项的循环 |
| `v6/js/main.js` | 新增 `EXCHANGE_EFFECTS` / `spawnItemOnNode()` / `exchangeAtNode()`；`KIND_HANDLERS` 加 `exchange`；`onOptionClick` 对交换选项跳过「点击即打标」；`settleNight()` 加发电厂 30% 回电；`overnightAtShelter()` 加专属文本（放在 arriveAt 之后） |
| `v6/js/config.js` | `GAME_VERSION` → `v1.9.0b2`（数值常量一个都没动） |
| `v6/js/modal.js` | **未改动**（需求列了它，但交换弹窗复用既有 `items` + 空 `actions` 的形式，`showModal` 不需要新能力） |
| `v6/js/state.js` / `saveSystem.js` / `inventory.js` / `terminal.js` / `events.js` / `debug.js` / `v6/index.html` | **未改动** |

### 验证

- 新增 `.tools/nw_b2_check.mjs`：**105 条断言，全部通过**：
  - 改动 1：四个字号变量逐值、放大比例都落在 +20%~30%、分区标题不再写死 12px、
    小屏同步、**深色主题块里确实没有字号**（所以「两套都要改」不适用）、
    防溢出的三条关键规则（物品名省略号 / 终端 `pre-wrap` / 物品栏可滚动）仍在。
  - 改动 2：9 条交换齐全；**分配比例实测 6/3/5 = 14**（并打印了 2/5、1/5 的算式）；
    有物品的节点一个都没挂交换；每个节点最多一个；
    **端到端跑通「弹窗 → 算了 → 选项保留 + 零副作用」与「弹窗 → 执行 → 结算 + 选项消失」**；
    执行后时间 +180、电量 +5（扣掉这 180 秒的自然流逝 0.1）；
    资源↔资源不消耗时间、体力 -1 / 电量 +8；刷物品型接着弹既有拾取窗；
    **交换不弹随机事件、已触发集合不增长、不动物品上限与储物箱**；
    「用过」状态经 `usedOptions` 存档往返，重载后选项不会复活。
  - 改动 3/4：两个区域的节点数、13 + 8 个专属节点的 id 与中文名逐条、边**逐条比对**
    （工业区 16 条基准边一条不少、只多出 2 条把材料场/废水池接进主链的边；东海岸 11 条一条不多不少）、
    连通性、环路、物品分布（工业区 4 个、东海岸 3 个）；
    发电厂过夜 40 → 65、90 → 115 被 clamp 到 100，家仍是回满、南关不回电。
  - 改动 5/6：6 个共享节点；powerplant 属 industry+island、dockgate 属 coast+dock；
    工业区视图里 powerplant 的白线指向南、东海岸视图里 dockgate 指向东；
    白线仍不进 `nodeEls`；站到发电厂上点「孤岛」→「前面的路还没通。」且没切过去。
  - 改动 7：`SAVE_VERSION` 仍是 4；`triggeredEventIds` 仍在；**快照键集合与 b1.1 完全一致**
    （没有新增字段）；v4 往返有效。
  - 回归：7 区域 / 废城 24 节点 26 边 / 巨墙 2 节点 / 怀表仍在断桥 / 画布 1250×750 /
    耗时系数 4.5 / 菱形 65% / a 块的日记与留言仍可读 / SCENES 与 NODES 都是 48 条。
- **反证**（两项都确认承重）：
  - 去掉 `onOptionClick` 里「交换选项不在点击时打标」的例外 → **1 条 FAIL**（选「算了」后选项消失）；
  - 去掉 `settleNight` 的发电厂分支 → **2 条 FAIL**（40 → 35、90 → 85）。
  两处均已还原并复测全绿。
- 冒烟：`nw_b1_check` / `nw_b11_check`（已把 b2 有意改动的 10 条期望值同步更新：
  ITEMS 4→7、节点 25→48、共享节点 4→6、占位区 5→3、industry/coast 不再是占位）、
  `nw_boot_check` / `nw_link_check` / `nw_r13_check` / `nw_r14_check`、
  `v6/js` 全部 `node --check` 均通过；改动文件的 UTF-8 BOM 与 `HEAD` 逐字节一致。

### 已知限制 / 遗留

- **交换的效果数值玩家看不到**：需求只要求「终端输出描述性文本」，所以既没有结果弹窗、
  也没有把「时间 +180 秒 / 电量 +5」这类数字写给玩家。文案里只有定性的暗示
  （「屏幕的光暗了一点」）。要不要像随机事件那样补一个结果弹窗，等你定。
- **`电容器` 的 `batteryMaxBonus` 目前只是数据**：本块不实现电量上限系统
  （c 块做，存档结构变更也在 c 块），所以现在装上也**不会**提高上限，`BATTERY_MAX` 仍是常量 100。
  发电厂的 30% 也是按 100 算的。
- **资源↔资源里的「物资 -1 → 体力 +1」没有采用**：需求给的 4 个示例里我选了 3 个
  （电→体力、体力→电、电→物资）。「物资 -1」要消耗背包里指定的一件物品，
  而弹窗按需求只有「执行 / 算了」两个按钮、没有选物品的地方，本块不做。
- **`industrial` / `coast` 的边有两处超出基准拓扑**：需求要求「材料场 ↔ 废水池（至少一条边接入）」，
  我补了 `steelmill → materialyard` 与 `coolingtower → wastewater` 两条，把这一对两侧都接进主链并形成环路；
  只按需求写的那一条也能连通，但那一对会变成挂在主链上的一个死端。
- **`dockgate` / `powerplant` 的视觉覆盖**（各自在码头 / 孤岛视图里贴到西/北边）目前用不到 ——
  这两个区域还是占位的、点进去只会得到「前面的路还没通。」；覆盖是为 b4 先放好的。
- **字体只放大了物品栏与终端**：状态栏（`--fs-status` 13px）与地图字号都没动。
  左栏物品栏在 45% 的高度里现在行高更大，内容多时会靠滚动（`.panel__body` 本来就是 `overflow:auto`）。
- 旧套件 `nw_r8`–`nw_r16`（含 `nw_e2e2`、`nw_r14_hover`）自 v1.9.0b1 起已作废，本块未恢复。

---

## [v1.9.0b1.1] — 2026-10-11 —— 地图放大去重叠 + 菱形缩小 + /unlockall + 移动耗时 ×1.5 + 事件只触发一次 + 大地图连线样式

**回档点 / git 标签**：`v1.9.0b1.1`

> 存档结构版本号**不变（仍是 v4）**：本块只新增一个可选兼容字段 `triggeredEventIds`，
> 旧档（没有该字段）读进来按空数组处理，**不算无效存档**。

### 新增

- **`/unlockall` 调试指令**（`js/debug.js`）：把**当前所在区域**的所有节点标记为已访问。
  - 输出「已解锁当前区域：{区域名}」，`DEBUG_CONSOLE` 下额外附 `[debug] unlockall {区域 id}`
  - **不跨区域**：共享节点只在当前区域里标记，不写进它所属的另一个区域
  - 不改当前节点、不消耗时间/体力/电量、不动物品/选项/事件/储物箱/`gameOver`
  - `gameOver` 后拦截；带参数报用法；区域没有节点时提示「当前区域暂无节点」
  - 「已探明」在本项目里是**派生量**（边两端都已访问就自动已探明，见 `buildAdjacency`），
    所以不需要第二套数据 —— 节点全标已访问，本区域每条边自然都是已探明
  - 已加进 `getAllCommandNames()`（Tab 补全）与 `/help`
- **state 新增 `triggeredEventIds`**（内部 `Set`，快照里是数组）+ 四个接口
  `isEventTriggered` / `markEventTriggered` / `clearTriggeredEvents` / `getTriggeredEventIds`。
- **大地图区域通道标签**新增专用颜色变量 `--link-label`（浅色 `#3d3d3d` / 深色 `#d8d8d8`），
  刻意**不复用 `--muted`** —— muted 还用在不可达节点名、面板计数等地方，改它会连带一片。

### 变更

- **改动 1：地图 UI 加大 + 菱形缩小**
  - 画布 `VIEW` 1000×600 → **1250×750**（×1.25），`index.html` 的 `viewBox` 同步。
    节点的**绘制**位置按同一系数摊开（`map.js` 新增 `DRAW_SCALE = 1.25`，只作用于 `drawPos`）。
  - **节点框（130×56）与噪声（±35）一个都没动** —— 所以「节点尺寸 : 节点间距」变小、重叠消失。
  - **耗时完全不受影响**：`NODES` 里的 x/y 仍是算耗时的唯一依据（`drawPos` 才乘 `DRAW_SCALE`）。
    这一步很关键：如果连坐标一起乘 1.25 再让耗时跟着变，会和改动 3 的 ×1.5 叠成 ×1.875。
  - 「能到未到」的菱形缩到节点框的 **65%**（`DIAMOND_SCALE`，需求建议 60%~70% 取中）。
  - **点击区域不变**：未访问节点的节点框不再 `display:none`，改成「透明 + 无描边 + `pointer-events: all`」，
    于是菱形缩小只是视觉变化，热区仍是整块节点框（hover 态也一并钉成透明，避免冒出方框）。
- **改动 5：大地图连接样式**
  - `REGION_BOX` 重新布局：方框 ×1.15，**空隙 ×1.5**（横向 30→45，纵向 30/50/40→61/75/60），
    整体重新居中到 1250×750 画布（左右留白对称、上下留白对称）。
  - `--fs-link` 15px → **20px**（+33%）；`.region-link-label` 改用 `--link-label` 并加 `font-weight: 600`。
- **改动 3：移动耗时 ×1.5** —— `DISTANCE_TO_TIME_RATIO` **3.0 → 4.5**。
  这是「移动基础耗时」那一个分量（边耗时 = 距离 × 本系数 × 支路惩罚），
  改它等于主路与支路**统一** ×1.5。`DEFAULT_TRAVEL_COST` 900 → 1350 同口径跟随。
  `MOVE_JITTER`（±10%）与「预览/实际共用同一个随机值」的机制都没动。
- **改动 4：事件不再多次触发**
  - 掷概率选事件时只从**没触发过**的事件里选（`pickEvent` 过滤）；
    全都触发过 → `rollEvent` 返回 `null`，**静默跳过**（终端不打字、不弹窗）。
  - 事件被消费的时点放在 `events.runEventOption()` 末尾 —— 两条触发路径
    （自然掷骰 / `/event trigger`）最终都会走到它，正好对应「无论玩家选哪个选项、效果执行完」。
  - 不再有任何「每天重置」逻辑。
  - `/event reset` → 主开关回 `EVENTS_DEFAULT`、hover 回默认值、并**清空 `triggeredEventIds`**。
  - `/event trigger {id}` → 无视 on/off、不走概率、**且无视 `triggeredEventIds`**（已触发过的仍可强制触发）。
  - 事件开关（`game_events_enabled` / `game_event_hover`）仍**不进存档**；`triggeredEventIds` **进存档**。
- `/event` 的 help / 用法文案同步（reset 那句补上「并清空已触发记录」）。
- `GAME_VERSION`：`v1.9.0b1` → `v1.9.0b1.1`。

### 变更清单

| 文件 | 改动 |
|---|---|
| `v6/js/map.js` | 新增 `DRAW_SCALE` / `DIAMOND_SCALE`；`VIEW` ×1.25；`drawPos` 乘 `DRAW_SCALE`；菱形用 `dd`；`REGION_BOX` 重排 + 新增 `worldViewBox()`；`setMapView` 里新增 `applyViewBox()` 按视图设 viewBox |
| `v6/style.css` | `.app` 列宽 30fr/70fr → **40fr/60fr**；`.col--left` 行 55% → **45%**；`--fs-link` 15→20px；新增 `--link-label`（两套主题）；`.region-link-label` 换色加粗；未访问节点框改「透明 + 可点」 |
| `v6/index.html` | `viewBox` 1000×600 → **1250×750**（与 `VIEW` 同步） |
| `v6/js/debug.js` | 新增 `/unlockall`（含 `getAllCommandNames` / `HELP` / `USAGE`）；`/event reset` 清 `triggeredEventIds`；`/event trigger` 的 help 文案更新 |
| `v6/js/events.js` | `pickEvent` 只抽未触发过的；`rollEvent` 池空时静默返回 null；`runEventOption` 末尾 `markEventTriggered` |
| `v6/js/state.js` | 新增 `triggeredEventIds` 字段 + 4 个接口；`toSnapshot` / `replaceFromSnapshot` 带上它（缺失当空集） |
| `v6/js/saveSystem.js` | `triggeredEventIds` 进 `REQUIRED`，但**缺失时补空数组后再校验**（可选兼容）；新增「必须是数组」的类型检查；`VERSION` 不变（仍 4） |
| `v6/js/config.js` | `DISTANCE_TO_TIME_RATIO` 3.0→4.5；`DEFAULT_TRAVEL_COST` 900→1350；`GAME_VERSION` → `v1.9.0b1.1` |
| `v6/js/main.js` | debugContext 新增 `clearTriggeredEvents` 钩子（唯一改动） |
| `v6/js/texts.js` / `inventory.js` / `terminal.js` / `modal.js` | **未改动** |

### 验证

- 新增 `.tools/nw_b11_check.mjs`：**81 条断言，全部通过**：
  - 改动 1：`VIEW` = 1250×750、`NODE_W/H` 与 `NOISE_RANGE` 未动、`index.html` viewBox 同步；
    **24 个节点全揭示时按真实渲染图元算，视觉重叠 0 对**（用最严口径：任意「矩形/菱形」组合都不重叠，
    最小余量 **+14.9**；同一口径在放大前是 **-2.6、冲突 1 对（plaza|apartment）** ——
    这正好是用户报的「部分图标重叠」）；菱形实测为节点框的 **0.650**；
    未访问节点的节点框仍是完整尺寸且 CSS 没把它 `display:none`；
    区域视图 viewBox = `0 0 1250 750`，大地图 viewBox 紧贴方框且完整包住所有方框、每边留白 ≤30；
    其他节点状态（is-visited / is-current / is-blocked）规则原样。
  - 改动 5：空隙实测 45/45/45（横向）与 61/75/60（纵向），方框互不重叠；
    内容占用 x 85..1165 / y 18..733，**左右与上下留白都对称**、没超出画布；
    重新布局后四个方向（西/北/东/南）仍正确；`--fs-link` 20px；`--link-label` 两套主题都有定义；
    **对比度实测**：浅色 3.36 → **10.86**、深色 4.53 → **13.64**（都过 WCAG AA）。
  - 改动 3：`DISTANCE_TO_TIME_RATIO` = 4.5、`DEFAULT_TRAVEL_COST` = 1350、支路惩罚未动；
    **实测同一跳**（home→plaza 距离 175）**旧 525s → 新 788s，正好 1.5 倍**；
    ±10% 随机机制原样，预览与实际共用同一缓存值。
  - 改动 2：指令进 Tab 补全与 `/help`；输出与 `[debug]` 后缀正确；当前区域全节点已访问；
    不跨区域（其他 4 个区域访问数仍为 0）；不改当前节点、不消耗三种资源、不动物品/储物箱/事件/gameOver；
    重复执行幂等；`gameOver` 拦截；无节点区域提示；带参数报用法。
  - 改动 4：字段名/类型/快照数组/`REQUIRED` 收录；未触发时能抽全 5 个；
    **标掉一个后连抽 300 次一次都没抽到它、其余 4 个仍抽得到**；
    全部触发过 → `rollEvent` 返回 null 且终端无输出；`/event trigger` 仍能强制触发已触发过的事件；
    `/event reset` 清空后又能抽全 5 个；**伪造缺字段的旧档仍有效且被补成空数组**；往返还原正确。
  - 回归：b1 的 7 区域 / 25 节点 / 26 条边 / 4 个共享节点 / 怀表位置不变；
    **a 块的日记与作者留言仍可读**、起步 3 件仍在储物箱、物品表仍是那 4 件。
- **反证**（三项都确认是承重的）：
  - `DRAW_SCALE` 改回 1.0 → **6 条 FAIL**（画布尺寸、两处 viewBox、居中、内容超出）；
  - `DIAMOND_SCALE` 改回 1.0 → **2 条 FAIL**（菱形比例、节点框比菱形大）；
  - 去掉 `pickEvent` 的过滤 → **5 条 FAIL**（抽到已触发事件、池空仍返回事件、导入后不跳过）。
  三处均已还原并复测全绿。
- 冒烟：`nw_b1_check.mjs`（已把白线判定里写死的 1000/600 改成从 `map.VIEW` 读）、
  `nw_boot_check.mjs`、`nw_link_check.mjs`、`nw_r13_check.mjs`、`nw_r14_check.mjs`、
  `v6/js` 全部文件 `node --check` 均通过；12 个改动文件的 UTF-8 BOM 与 `HEAD` 逐字节一致。

### 已知限制 / 遗留

- **画布放大会让画面元素的实际像素变小**：面板宽度虽然 +33%（左栏 30%→40%），但画布同时 ×1.25，
  所以真实缩放比只是从约 0.375 提到约 0.40。**节点名实测仍然只有 ~6.5px**，偏小。
  这是「一个区域塞 24 个节点」的固有限制：想同时做到「节点大」与「不重叠」，
  只能继续加大面板或减少单区节点数。本块按需求只改了尺寸与菱形，**没有动节点字号**。
- **左上角左栏从 30% 加宽到 40%**，右栏（画面/终端）相应从 70% 收到 60%。
  终端是纯文本，60% 宽度仍然充裕，但这是一处布局再平衡 —— 如果你更希望右栏保持 70%，
  说一声我把地图改成只加高不加宽。
- **大地图改成了按视图设置 viewBox**（区域地图整张画布、大地图紧贴方框）。
  这是为了让连接标签在面板里保持可读；副作用是大地方块之间的**相对位置不变但整体被放大**，
  与区域地图不再共用同一套缩放。
- `triggeredEventIds` 记录的是「事件被消费」，不是「弹窗出现过」：
  如果玩家在弹窗开着的时候直接关掉页面，那个事件**不算已触发**，下次还会进池。
  （弹窗没有关闭按钮，所以正常玩法下不会发生。）
- `/unlockall` 只标当前区域，**不会**顺手把共享节点在对面区域的访问记录也写上；
  所以解锁完废城之后，大地图上「巨墙 / 荒野 / 东海岸 / 工业区」仍然要靠正常走过去才亮。
- 旧套件 `nw_r8`–`nw_r16`（含 `nw_e2e2`、`nw_r14_hover`）自 v1.9.0b1 起已作废，本块未恢复。

---

## [v1.9.0b1] — 2026-10-11 —— **破坏性**：地图重做第 1 块（7 区域注册表 + 巨墙/废城 + 白线 + 存档 v3 → v4）

**回档点 / git 标签**：`v1.9.0b1`

> ⚠️ **破坏性变更**：存档结构 `v3` → **`v4`**，**旧存档一律不兼容**（导入返回 null → 提示「存档版本过旧，无法加载」）。
> 旧 6 个区域与全部旧节点 id 都删掉了，旧存档里的 `visitedByArea` / `sheltersByArea` /
> `usedOptions` 全是已经不存在的键，无法映射，因此**不做迁移**。
> 本块是 b 块（地图重做）的 **4 块中的第 1 块**，只落地「巨墙」与「废城」。

### 新增

- **7 区域注册表**（旧的 home / area1 / area2 / newarea1 / newarea2 / darkarea 全部废弃）：

  | 区域 id | 显示名 | primaryShelter | 状态 |
  |---|---|---|---|
  | `giantwall` | 巨墙 | `wallgate` | **本块落地**（2 节点） |
  | `wasteland` | 废城 | `home` | **本块落地**（24 节点） |
  | `wilderness` | 荒野 | `null` | 占位（b3） |
  | `industry` | 工业区 | `null` | 占位（b2） |
  | `coast` | 东海岸 | `null` | 占位（b2） |
  | `dock` | 码头 | `null` | 占位（b4） |
  | `island` | 孤岛 | `null` | 占位（b2 / b4） |

- **巨墙**：`wallfoot`（墙根，无任何交互）+ `wallgate`（墙门，与废城共享、也是巨墙的主安全屋）。
  墙根到达文本按需求原文：「自从大爆炸后他们就建立了这堵墙，到现在已经矗立了十几年了。」
- **废城 24 个节点** = 家 1（`home`）+ 普通 19 + 接口 4。家不再是独立区域，降级成废城里的一个节点，
  仍是唯一回电点、仍带储物箱。
- **4 个接口节点（共享）**：`wallgate`（西→巨墙）、`northgate`（北→荒野）、
  `eastgate`（东→东海岸）、`southgate`（南→工业区）。每个都同时出现在两个区域的 `nodes` 里，
  因此自动成为共享节点、自动成为安全屋。
- **接口白线延伸（改动 6）**：区域地图里，接口节点朝它连接的另一个区域方向拉一根白线，
  一直画到地图边框。`class="road region-spoke"` —— 与主干道同一个 `.road` 类，**没有新增任何 CSS**。
  方向不是手写的：`regionDirection()` 按 `REGION_BOX` 的两块中心连线取主轴算出来。
  未落地区域的白线同样画（尽头暂时没有节点，b2/b3 落地后自然接上）。
- **未实现区域提示（改动 7）**：`isAreaImplemented()` + `UI.roadNotOpen`（「前面的路还没通。」）。
  荒野 / 工业区 / 东海岸 / 码头 / 孤岛 5 个占位区域带 `placeholder: true`；
  玩家站在接口节点上、在大地图点它们时给这句提示，不会切过去。
- **物品**：新增 `cannedfood` 罐头（无槽位、不提供格子，使用效果在 c 块）。

### 变更

- **物品表精简**：删除 `flashlight` 手电筒 / `torch` 火把 / `oldmap` 古老地图 /
  `compass` 黄铜罗盘 / `darkshard` 黑曜石碎片；`coat` pockets 3 → 1、`jeans` pockets 2 → 1
  （描述里的「三个深口袋」「两个后袋」同步改成一个，免得文案与数值对不上）；
  `pocketwatch` 怀表保留不动。
  容量口径：手持保底 1 + 大衣 1 + 牛仔裤 1 = **起步 3 格**（c 块加挎包 +2 = 5、大背包 +4 = 7）。
- **初始储物箱**：`INITIAL_STORAGE` 由 `['coat','jeans','flashlight','torch','oldmap']`
  改为 **`['cannedfood','coat','jeans']`**。日记 / 作者留言（a 块）仍挂在家储物箱；其余安全屋开局为空。
- `state.currentArea` 初值 `'home'` → **`'wasteland'`**（必须与 `map.START_AREA` 一致，
  否则 `getNodeIds(开局区域)` 是空数组、一步都走不动）。
- **`isShelter()` 判定扩成「共享节点 ∪ 各区域 primaryShelter」**。
  需求说「按现有『安全屋 = 所有共享节点』判定」——**v1.9.0a 其实不是这样**（那时只是所有
  primaryShelter 的并集，共享节点里只有一部分是安全屋）。按需求的意图改成了并集，
  于是 4 个接口自动成为安全屋（可过夜 + 带储物箱），家仍靠 `wasteland.primaryShelter` 进来。
- `primaryShelterOf()` 在 `primaryShelter` 为 null（占位区域）时回落到 `HOME_ID`，避免强制回家把人送到 null。
- `saveSystem.js`：`VERSION` 3 → 4。**字段表没有增删**（仍与 `REQUIRED` 一致），只换版本号。
- `GAME_VERSION`：`v1.9.0a` → `v1.9.0b1`。

### 移除

- 旧 6 个区域、旧 19 个节点、旧地点文案（`SCENES` 从 16 项换成 25 项；只保留「家」的 ASCII 画面）。
- `main.js` 里指向已删节点的死代码：`enterCave()`、`hasLight()`、`OPTION_HANDLERS.n3`、
  街角老钟分支（`n2`）、`TIME_TEXTS.street`、终点判定 `GOAL2_ID`（`goal2`）、未再使用的 `SCENES` / `firstVisit`。
- `UI.foundJourneyEnd` / `crossRegionWalk` / `foundLighthouse` / `lookTime` 四条失效文案
  （都指向已删节点或早已无人引用）。

### 修复

- **`events.js` 的随机刷物品候选表引用了 3 个已删物品 id**（`['compass','pocketwatch','darkshard','oldmap']`）。
  留着会刷出 `ITEMS` 里不存在的 id：`spawnItemOnNode` 直接返回 false，
  但事件的 effectText 照样写「获得 1 件物品」——玩家白高兴一场。
  改为 `['cannedfood']`，并**刻意排除怀表**：它是「断桥」上唯一的任务物品，
  而 `collectedItems` 按物品 id 记，一旦随机刷出第二块并被捡走，断桥那块也会一起消失。

### 变更清单

| 文件 | 改动 |
|---|---|
| `v6/js/map.js` | REGIONS 7 个（含 5 个 placeholder）；NODES 25 个；废城 26 条边 + mainRoads；REGION_BOX 换成 7 块并新增 `regionDirection` / `borderPoint`；`REGION_VIEW_POS` 换成巨墙一处覆盖；`isShelter` 扩展；新增 `isAreaImplemented`；`primaryShelterOf` 空值兜底；`renderArea` 加接口白线；`REQUIRES` 清空（旧规则挂在已删节点上） |
| `v6/js/texts.js` | ITEMS 精简为 4 件；SCENES 换成本块 25 个节点；新增 `UI.roadNotOpen`；删 4 条失效文案 |
| `v6/js/state.js` | `INITIAL_STORAGE` 重定；`currentArea` → `wasteland` |
| `v6/js/main.js` | `onRegionClick` 加未实现区域拦截；删指向已删节点的死代码；`RECHARGE_NODE` 注释更新（取值不用改） |
| `v6/js/saveSystem.js` | `VERSION` 3 → 4 |
| `v6/js/events.js` | `SUPPLY_ITEMS` 修剪为 `['cannedfood']` |
| `v6/js/config.js` | `GAME_VERSION` → `v1.9.0b1` |
| `v6/js/debug.js` / `modal.js` | 仅注释（示例里的旧 id 换成新 id） |
| `v6/js/inventory.js` / `terminal.js` / `v6/style.css` / `v6/index.html` | **未改动** |

### 验证

- 新增 `.tools/nw_b1_check.mjs`：**84 条断言，全部通过**，逐条覆盖 9 个改动：
  - 改动 1：ITEMS 恰为 4 件、5 件已删物品确认不在、大衣/牛仔裤格数、怀表未动、罐头字段与描述、
    日记/README 仍不在 ITEMS、**起步容量实测 = 3**。
  - 改动 2：家储物箱开局正好 `cannedfood/coat/jeans`，旧 5 件一件不留，其余安全屋开局为空。
  - 改动 3：7 区域的 id/显示名/顺序；旧 6 区确认废弃；5 个占位区的 `placeholder` / 空 edges /
    `primaryShelter: null`；`START_AREA` 与 `state.currentArea` 一致。
  - 改动 4：巨墙 2 节点、废城 24 节点、全局去重 25；**需求给的 25 条基准边一条不少**；
    只多出「公寓→废弃加油站」一条（见下）；废城连通 + 有环路 + park/plaza/mall 是枢纽 +
    substation/parking 双入口；墙根文案一字不差且无任何交互；怀表在断桥；
    **节点两两间距最小值 = 106**（≥100）。
  - 改动 5：4 个接口各自恰好属于两个区域、没有第 5 个共享节点；4 个接口 + 家都是安全屋；
    家不是门户；**端到端**：站在北关上按钮行确实出现「过夜 / 稍作停留」。
  - 改动 6：**刚开局只渲染墙门 → 只有 1 根白线**（白线跟着节点渲染走，沿用既有「不泄露没走过的地图」机制）；
    4 个接口都访问过后 → **正好 4 根，方向西/北/东/南各一，末梢都落在地图边框上，
    每根起点都等于对应接口的绘制坐标**；巨墙视图里 wallgate 的白线指向东；
    用的是同一个 `.road` 类；`style.css` 里没有 `region-spoke`。
  - 改动 7：`isAreaImplemented` 7 个区域逐一；走到北关把荒野解锁、大地图上出现荒野；
    点它 → 「前面的路还没通。」且**真的没切过去**；对照：站到墙门上点巨墙能正常切区域；
    站错节点则走既有的「你不在通往那里的路上。」
  - 改动 8：`SAVE_VERSION = 4`；往返可读；`peekVersion` 4；
    **伪造字段齐全但版本号 3、且带旧区域键的存档 → deserialize 返回 null**；快照字段表未增删。
  - 改动 9 + a 块回归：家过夜电量回满 100、接口安全屋过夜只扣跨天 5（不回电）；
    旧 3 个储物箱节点确认不存在；墙门惰性建空箱；**a 块的日记 / 作者留言仍可读且输出格式不变**。
- **反证**：把 `onRegionClick` 里的未实现区域拦截临时去掉 → 立刻 2 条 FAIL
  （提示没打、而且真的切进了空区域），确认这道门是**承重**的；随后已还原并复测全绿。
- 冒烟：`nw_boot_check.mjs`（开局 wasteland/home、只有废城解锁）、`nw_link_check.mjs`、
  `nw_r13_check.mjs` / `nw_r14_check.mjs`、`v6/js` 全部文件 `node --check` 均通过。
- **旧套件 `nw_r8`–`nw_r16`（含 `nw_e2e2`、`nw_r14_hover`）已作废**：本块把旧地图整张删掉了，
  它们引用旧区域/旧节点，已不可能通过，已在文件头标注「已作废，保留仅为留档」。

### 已知限制 / 遗留

- **本块没有终局**：旧的 `goal2`（旅者之石）随旧地图删除，终点判定一并移除。
  灯塔在码头区域（占位），等 b4 落地后再把「到达即游戏结束」接回来。
- **缺一条边的补齐（刻意偏离基准拓扑）**：需求给的每条边里都没有「废弃加油站」，
  照抄会让 `gasstation` 成为孤立节点（永远不可达、也不渲染）。这里按最小改动补了
  **`apartment → gasstation`** 一条；想挂到别处说一声即可换。
- **白线跟着节点渲染走**：没渲染出来的接口（未访问且与当前节点不相邻）连白线一起不画。
  这是沿用既有的「不泄露没走过的地图结构」机制；如果你希望一进废城就看见 4 根白线，
  需要另外给它开例外（本块没开）。
- **`home` 的到达描述改了一句**：原来写「一间靠海的小屋」（旧地图里家是靠海的），
  现在家在废城内部，所以改成「一间勉强还算完整的屋子，窗台上摆着昨天捡回来的石头。」
- **两块区域都没有 `dark` 节点 / `mustResolve` 节点 / 任何 `options`**：
  需求的改动 1/4/5 只要求「节点 + 文案 + 拓扑 + 物品放置」，交互与钥匙逻辑在 c 块。
  因此 `map.js` 的 `REQUIRES` 与 `main.js` 的 `OPTION_HANDLERS` 机制保留但都是空表。
- **随机刷物品候选只剩 1 件**（罐头），同一节点上已有罐头时刷不出来；
  等物品表在 b2+ 变丰富之后再补候选（见上文的「修复」一节）。
- **25 个节点挤在一张 1000×600 的画布上**：最近的一对（station ↔ subway）间距 106，
  叠加 ±35 的固定伪随机偏移后个别节点视觉上可能轻微贴边或重叠。
  坐标是按需求「沿用现有伪随机偏移机制、可按方位微调」放的，本块没有改噪声范围。
- 旧套件的 `nw_r17_check.mjs`（v1.9.0b 的实验版新地图）与本次实现**不是同一套 id**，
  已随那次回退一起作废，不要再参考。

---

## [v1.9.0a] — 2026-10-11 —— 家储物箱加「日记 / 作者留言」+ 修掉怀表「看时间」入口误渲染进 mustResolve 弹窗

**回档点 / git 标签**：`v1.9.0a`

> 版本号本次按用户明确要求从 `v1.8.14` 跨到 `v1.9.0a`（不是默认的 patch 递增）。
> **存档结构未变**：`saveSystem.js` 的 `VERSION` 仍是 `3`，旧存档照常加载。

### 新增

- **家储物箱里多出两条可反复阅读的文档**（只在 `shelterKey === HOME_ID` 时渲染）：
  - **日记** —— 描述 `一本翻旧了的日记。`
  - **作者留言**（README）—— 描述 `一张夹在盒子里的纸。`
- `v6/js/texts.js`：新增导出 `DIARY_TEXT`（4 段）、`README_TEXT`（4 段，`海岸区域` 已按要求改为 `码头`）、
  `DOCUMENTS`（`[{ id, name, desc, body }]`，`body` 为段落数组）。
  **两份文档刻意不是 `ITEMS` 成员** —— 拾取 / 装备 / 事件刷物品全部以 `ITEMS[id]` 为凭据，
  不进去就永远拿不走，也不会被随机事件刷到地上。
- `v6/js/main.js`：新增 `readDocument(doc)` —— 用 `terminal.logLines()` 先出一行
  `UI.inspect(name, desc)`（沿用既有「先名称再描述」约定，即 `你查看 日记：一本翻旧了的日记。`），
  再一段一行铺正文。纯读取：不改 state、不消耗时间，可以反复点。

### 修复

- **症状**：玩家背包里带着怀表时，mustResolve 弹窗（松林 n1 / 洞穴 n3 / 哨塔 n5 / 岔路口 n7 / 灯塔）
  会多渲染出一个「掏出怀表看一眼」，出现在本该只有「这个地点要你做的决定」的列表里。
- **根因**：`main.js` 的 `ensureTimeOption(node)` 把「看时间」类伪选项（老钟 / 街角老钟 / 怀表）
  塞进了和地点真选项**同一个**数组，`buildOptions()` 顺手给了它一个 `fullIndex`；
  而 `resolveMustResolve()` 用
  `const choices = currentButtons().filter((b) => !b.disabled);`
  取「可用选项」当作弹窗条目 —— 它分不清「玩家要做的决定」和「系统附加入口」，
  于是怀表跟着一起进了弹窗。带怀表时弹窗从 2 条变 3 条，就是这一处。
- **修法**（两处，都是最小改动）：
  1. `ensureTimeOption()` 的三个返回值各加一个 `systemOption: true` 字段，把「这是系统附加入口、
     不是决定」显式写在数据上（没有复用 `timeKind` —— 那个字段的语义是「印哪句钟表文案」，
     拿它当过滤依据是隐式耦合，将来加第四个钟表来源就会踩坑）；
  2. `resolveMustResolve()` 的过滤条件改为
     `!b.disabled && !b.option.systemOption`。
- **保留的东西**：`掏出怀表看一眼` 在终端选项行与按钮行里照常出现、照常能点、照常报时 ——
  那才是设计中的合法查看入口，只去掉了它在弹窗里的误渲染。
  怀表物品本体与获取位置（灯塔 `lighthouse` 节点的 `items`）一个字没动。
- **连带效果**：地点自己的选项都用光时，现在会正确地走 `UI.mustResolveNothing`
  （提示一句 + 视为已解除），而不是弹一个「只有怀表」、点了也不算做决定的窗。

### 变更

- **签名 / 字段**：
  - `ensureTimeOption(node)` 返回值新增字段 `systemOption: true`（三个分支都有）。
    该选项对象只存在于运行时（`toSnapshot()` 不含 `options`），所以**存档不受影响**。
  - `readDocument(doc)` 新增，无返回值；`doc` 形如 `{ id, name, desc, body: string[] }`。
  - `DOCUMENTS`、`DIARY_TEXT`、`README_TEXT` 三个新导出；`texts.js` 原有导出（`UI` / `EVENTS` / `ITEMS` / `SCENES`）签名不变。
- `renderInventory()` 里储物箱那段由内联的 `storage.map(...)` 提成局部变量 `storageRows`，
  再在 `shelterKey === HOME_ID` 时追加两条文档行 —— 分区标题仍只统计真物品
  （家开局显示 `储物箱 5/20`，不含这两条，所以**不占容量**）。
- `GAME_VERSION`：`v1.8.14` → `v1.9.0a`。

### 变更清单

| 文件 | 改动 |
|---|---|
| `v6/js/texts.js` | 新增 `DIARY_TEXT` / `README_TEXT` / `DOCUMENTS`（插在 `ITEMS` 之后、`SCENES` 之前） |
| `v6/js/main.js` | `import` 增加 `DOCUMENTS`；新增 `readDocument()`；`ensureTimeOption()` 三处加 `systemOption`；`resolveMustResolve()` 过滤条件；`renderInventory()` 储物箱段 |
| `v6/js/config.js` | `GAME_VERSION` → `v1.9.0a` |

**未改动**：`map.js`（没往 home 的 `items` 里加东西）、`state.js`、`saveSystem.js`、`inventory.js`、
`terminal.js`、`modal.js`、`timeSystem.js`、`events.js`、`debug.js`、`style.css`。
特别是 `state.js` 一行未动 —— 两份文档不进 state，所以快照结构与内容都不变。

### 验证

- 新增 `.tools/nw_r16_check.mjs`（**全部通过**）：
  - 改动 1：`DIARY_TEXT` / `README_TEXT` 与要求**逐字比对**（含 README 里已是「码头」、无「海岸区域」残留）；
    `DOCUMENTS` 的 id / 名称 / 描述 / 段数；两份文档确认**不在** `ITEMS` 里。
  - 改动 2：家渲染出 `储物箱 5/20` 且两条排在真物品之后；不在「当地物品」区；两条都可点未置灰；
    title = 简短描述；点击后终端先出 `你查看 X：Y` 再逐段出正文；可反复读；
    时间 / 体力 / 电量零变化；储物箱仍 5 件、口袋与装备槽仍空；
    `toSnapshot()` 的字段集合与改动前完全一致且不含这两条；渲染处确实是 `shelterKey === HOME_ID`。
  - 改动 3：三个伪选项都带 `systemOption`、且没有任何 `SCENES` 选项自带该标记（不会误伤真选项）；
    在 n5（无光源）/ n7 / n5（有手电筒）/ n3 四个场景下，
    弹窗内容 === 当前可用按钮减去伪选项、且不含「怀表」；按钮行仍保留怀表入口；
    点弹窗条目执行的确实是那条真选项（索引映射没坏）；
    真选项用光的判别性用例走 `mustResolveNothing` 而不再弹「只有怀表」的窗；
    按钮行点怀表仍正常报时。
- **反证**：把 `resolveMustResolve()` 的过滤条件临时改回 `!b.disabled`，该套件立刻 **11 条 FAIL**
  （四个场景的弹窗都多出怀表 + 判别性用例失效），确认修复是**承重**的，不是巧合通过。
- 顺带确认的既有行为（**不是**本次修复）：`n5` 的「使用手电筒探查」需要 `HOLDS_FLASHLIGHT`、
  `n3` 的「进入洞穴」需要 `HOLDS_LIGHT`，因此没带光源时它们不进弹窗 —— 这是 `map.js` 的 `REQUIRES` 门控，
  与怀表无关，套件里单列了一条断言把它和本次修复区分开。
- 回归：`nw_r15` / `nw_r14` / `nw_r14_hover` / `nw_r13` / `nw_r12` / `nw_r11` / `nw_r10` /
  `nw_r9_e2e` / `nw_r8` / `nw_e2e2` / `nw_boot_check` / `nw_link_check` 全部通过；
  `v6/js` 全部文件 `node --check` 通过；`main.js` / `texts.js` 的 UTF-8 BOM 与 `HEAD` 逐字节一致。

### 已知限制 / 遗留

- **同一根因还有一条未堵的路径**：`onOptionClick()` 里
  `if (node.mustResolve) game.markMustResolveResolved(node.id);` 对**任何**选项都生效，
  而 `terminal.setLocked()` 只 `disable` 输入框、**不禁用按钮行**，`.map-modal` 的遮罩又只覆盖地图面板
  （`style.css` 注释也写了「只覆盖地图区」）。所以 mustResolve 弹窗开着时，
  理论上仍能点按钮行的「掏出怀表看一眼」把门禁满足掉。
  用户本轮明确要求「仅去除误渲染、其余不动」，因此**这一处刻意没改**，留待下一版评估
  （候选改法：`... && !option.systemOption`，一行）。
- 两份文档没有单独的 CSS 类，外观与物品按钮一致；与日记的区分按用户建议**靠名称「作者留言」**。
  若想让它们视觉上进一步区分，需要动 `style.css`，本轮未做。
- 文档内容写死在 `texts.js`，不随剧情推进变化，也不受存档影响（任何存档下、任何一天都读得到同样内容）。

---

## [v1.8.14] — 2026-10-11 —— 修正事件输出分工 + /event 语法扩展 + 并入 6 条（跨天亮 / 拾取弹窗 / 单事件）

**回档点**：`v1.8.14`

### 修复

**1. 修正事件输出分工：终端 = 叙事流、结果弹窗 = 系统信息（`events.js` + `texts.js` + `main.js`）**

- 症状：v1.8.13 反了 —— 终端打的是「`> 选项名称`」，结果弹窗放的是描述性氛围文案。
- 新分工（落实要求 1~9）：
  | 信息 | 终端 | 选择弹窗 | 结果弹窗 |
  |---|---|---|---|
  | 事件描述 `desc` | ✅（触发时就打，不等选完） | ✅ | — |
  | 选项名称 `label` | ❌（**本轮删掉了那行 `> 选项名` 回显**） | ✅（按钮） | — |
  | 描述性叙事 `narrate` | ✅（选完之后补进叙事流） | — | — |
  | 效果文本 `effectText` | ❌ | — | ✅（唯一出现处） |
  | B 类无效果 | narrate 照常进终端 | ✅ | ✅ 显示「无变化」 |
- 事件 id 按需求改名：`coins` → **`coin_purse`**（其余 `slip` / `vending` / `flicker` / `lost` 不变）。
- 每个 option 补齐五个字段：`{ label, effect, effectText, narrate, hoverText }`（文案在 `texts.js`，效果在 `events.js` 的 `EFFECTS`，
  由 `EVENT_POOL` 拼成要求的结构）。10 条 `effectText`、10 条 `narrate`、10 条 `hoverText` 都与需求给的文字逐字一致。

### 新增

**2. `/event` 语法扩展（`debug.js` + `events.js` + `config.js` + `main.js`）**

| 子命令 | 行为 |
|---|---|
| `/event on \| off \| reset` | 主开关（逻辑不变）；**reset 现在同时把 hover 开关拨回默认值**并同步 localStorage |
| `/event hover on \| hover off \| hover` | 运行时切换「选项效果悬浮提示」；不带参数显示当前状态；状态存 localStorage `game_event_hover` |
| `/event trigger {id}` | 强制触发指定事件：无视主开关与几率、100% 触发、走**与自然触发完全一致**的流程；id 不存在 →「未知事件 id，用 /event help 查看」；有弹窗未处理或正在移动 → 拒绝并提示；gameOver 后拦截（与忙碌判断一起收在 `main.js` 的 `canTriggerEvent()`） |
| `/event help` | 列出全部用法 + 5 个事件 id、描述与选项；**off 时也能用**；只走终端输出，不弹窗 |

- `EVENT_HOVER_SHOW_EFFECT` 保留为**默认值**；`config.js` 新增读取函数 `readEventHoverEnabled()`：优先读 localStorage，没有/读不出来就用默认值。
  运行时状态由 `events.js` 的 `isHoverEnabled()` / `setHoverEnabled()` / `resetHoverEnabled()` 维护，`main.js` 在构造选项按钮时用 `events.isHoverEnabled()` 决定 `hint`。
- debug 日志：`/event trigger` 在 `DEBUG_CONSOLE` 下才输出 `[debug] 强制触发事件 {id}`。
- 两个开关都**不进存档**：主开关只在 `state`+localStorage（`game_events_enabled`），hover 只在 localStorage（`game_event_hover`）；
  实测 `toSnapshot()` 里没有任何开关字段。

### 变更

**3. 上轮推荐并入的 6 条**

1. **事件效果造成的时间变化不再触发事件**：掷骰只在两个触发点（`travelTo` 的到达、`onOptionClick` 的时间消耗）里做，
   `timeSystem.advanceTime()` 里没有任何掷骰调用（原本就如此，本轮补了断言把它钉住）。
2. **事件效果跨过 06:00 → 事件结算完后补一次天亮**：`main.js` 新增 `suppressNightEnd`，事件流程期间 `onNightEnd()` 只置 `nightEnded` 不处理；
   流程结束（含结果窗、拾取窗）后再检查一次 `nightEnded`，为真才调 `onNightEnd()` 走天亮流程。
   否则「时间 +N」会让传送/结算插进弹窗中间。
3. **事件刷出的物品走 v1.8.3 原有拾取弹窗**：结果窗点「继续」之后调 `pickUpItems(node)`，
   三个按钮仍是 `[带走拿得下的] [全部放弃] [稍后处理]`，容量不够按原逻辑处理 —— 没有新造拾取流程。
4. **一次移动最多一个事件**：`main.js` 新增 `eventFiredThisAction` + `beginAction()`（在 `travelTo` 与 `onOptionClick` 开头调用）；
   `rollRandomEvent()` 见到标记就直接丢弃。这样「走到带 mustResolve 的节点 → 在它的模态里选了耗时选项 → 回到移动流程又掷一次」也不会叠两个事件弹窗。
5. **两个事件开关不进存档**（同上）。
6. **trigger 的调试日志只在 `DEBUG_CONSOLE` 下输出**。

### 变更清单

| 文件 | 改动 |
|---|---|
| `v6/js/events.js` | `EFFECTS` 的 key 改成 `coin_purse`；`EVENT_POOL` 的每个 option 变成 `{label, effect, effectText, narrate, hoverText}`；`runEventOption()` 返回 `{label, effectText, narrate, spawned}`；新增 `isHoverEnabled()` / `setHoverEnabled()` / `resetHoverEnabled()` / `listEvents()` |
| `v6/js/texts.js` | `EVENTS` 改为 `{ desc, options, effectTexts, narrates, hoverTexts }` 五栏（10+10+10 条文案按需求逐字落地）；`UI` 新增 `eventNoChange`（「无变化」）、删除不再用的 `eventSpawned` |
| `v6/js/main.js` | 事件流程拆成 `rollRandomEvent()`（掷骰 + 单事件去重）与 `runEventFlow()`（弹窗流程，自然触发与 trigger 共用）；新增 `beginAction()` / `isFlowBusy()` / `eventFiredThisAction` / `suppressNightEnd`；`onNightEnd()` 加推迟判断；结果窗后接原有拾取弹窗；`debugContext` 增加 `eventCatalog` / `isHoverEnabled` / `setHoverEnabled` / `resetHoverEnabled` / `hoverDefault` / `canTriggerEvent` / `triggerEvent`；config 导入改为 `EVENTS_DEFAULT` + `EVENT_HOVER_SHOW_EFFECT` |
| `v6/js/debug.js` | `/event` 扩展成 `on\|off\|reset\|hover\|trigger\|help`；`HELP` / `USAGE` 同步；**补上缺失的 `DEBUG_CONSOLE` 导入**（本轮实测踩到的坑，见下） |
| `v6/js/config.js` | `EVENT_HOVER_SHOW_EFFECT` 注释改为「默认值」；新增 `EVENT_HOVER_KEY = 'game_event_hover'` 与 `readEventHoverEnabled()`；`GAME_VERSION` → `v1.8.14` |
| `v6/js/timeSystem.js` | **未改动**（改动 3-1 只是把它「不掷事件」这件事钉了断言） |
| `v6/js/inventory.js` | **未改动**：拾取弹窗的分支逻辑（`listLocalItems` / `planWildPickup`）本来就是现成的，改动 3-3 复用它 |
| `HANDOFF.md` | 游戏版本同步 `v1.8.14` |

**存档格式**：`VERSION` 仍为 **`3`**，**未变**，旧存档照常加载。

### 验证

- 模块链接检查（11 个模块 OK + `main` 需 DOM）、DOM 桩 `boot()` 无异常、12 个 js 文件 `node --check`。
- **79 项断言全部通过**（`.tools/nw_r15_check.mjs`，DOM 桩里真跑 `boot()`、真点选项/继续/拾取按钮、真跑 `tick`）：
  - **结构**：事件 id 五个（含 `coin_purse`）；每个 option 五字段齐全；10 条 `effectText` / 10 条 `narrate` / 10 条 `hoverText` 与需求逐字一致。
  - **输出分工（端到端）**：选择窗描述 = desc；触发时终端就有 desc；选完后 **终端只多出 narrate**（既没有选项名、也没有效果文本）；结果窗 desc = effectText、标题「结果」、只有一个「继续」；
    **点「继续」后因为刷出了物品，接着弹出原有拾取窗**（标题「发现物品」、三个按钮与 v1.8.3 一致）；拾取窗期间仍暂停；整段结束才恢复时间 / 解锁终端。
  - **B 类无效果**：终端出 `narrates[1]`、结果窗出「无变化」、无状态改动。
  - **`/event`**：help 列出四个子命令 + 5 个事件 id/描述，且 off 时可用；hover 查询/on/off、写盘 key 与运行时状态即时生效；`readEventHoverEnabled()` 优先读 localStorage、无值时回默认；
    reset 同时复位主开关与 hover 并同步 localStorage；trigger 无视开关、未知 id 提示、忙碌拒绝、`[debug]` 前缀只在 DEBUG_CONSOLE 下；
    trigger 与自然触发调用的是**同一个** `runEventFlow()`，且 triggerEvent 里没有任何时间/体力/电量消耗。
  - **改动 3**：`advanceTime` 无掷骰、掷骰只在两个触发点；**实测效果把时间推过 06:00** —— 结果窗照常先出、当时仍在原节点，点「继续」之后才天数 +1、时间归零、被送回安全屋；
    事件刷物品确实调 `pickUpItems()`（全项目只有一处弹拾取窗）；**实测一次动作两个触发源都命中时，只有先命中的那一个出事件**（事件描述在终端只出现 1 次、没有第二个弹窗）；
    存档快照里没有开关字段；`[debug]` 日志条件化。
- 旧套件回归：v1.8.6 ~ v1.8.13 全部通过。其中两个套件的**事件相关段落**按本轮改写做了裁剪并在注释里写明去向：
  `nw_r13`（v1.8.12 的「弹窗化 + 悬浮开关」）与 `nw_r14`（v1.8.13 的「结果弹窗 + 去重 + 悬浮开关」）里的事件断言已整体由 `nw_r15` 覆盖；
  `nw_r14_hover`（副本里把开关改成 true 的那个）改成读 `hoverText` 与新 id。
- **本轮实测暴露并修掉一个真实缺陷**：`debug.js` 里用了 `DEBUG_CONSOLE` 却没从 `config.js` 导入，
  `/event trigger {id}` 一执行就 `ReferenceError` → 已补上导入（断言里加了一条防回归）。

### 已知限制 / 遗留

- `/event trigger` 只能通过终端敲指令触发，**没有 UI 入口**；它刻意无视 `on|off` 与几率，属于测试/调试口子。
- `hoverText` 里的文字（如「查看：当前节点获得 1 件物品」）按需求**带着动作前缀**整句写死，所以按钮悬浮提示会重复一遍选项名；
  若想去掉前缀，改 `texts.js` 的 `hoverTexts` 即可。
- hover 开关是「本地偏好」：不进存档，但会跟着浏览器 localStorage 一直留着，换浏览器/清缓存就回到默认 `false`。
- 事件流程与 `mustResolve` 弹窗串联时，是先弹 `mustResolve`（玩家必须选一个）再弹事件窗 —— 两者严格首尾相接，不会同时存在。
- 预先存在、本轮**未处理**：`m1`（枯树林）的 ASCII 图是 11 行，与项目「12 行」约定不符。

---

## [v1.8.13] — 2026-10-11 —— 去掉时间暂停提示 + 事件结果改用弹窗（输出去重） + 悬浮显示选项效果开关

**回档点**：`v1.8.13`

### 变更

**1. 去掉「时间已暂停 / 时间已恢复」的终端输出（`main.js` + `texts.js` + `timeSystem.js`）**

- 删掉 `boot()` 里注册的那个回调（原来按 `DEBUG_CONSOLE` 往终端打两句话）；`UI.timePaused` / `UI.timeResumed` 两个文案键一并删除。
- **暂停/恢复逻辑本身一行没动**：`pauseTokens` 集合、`isTimePaused()`、`watchVisibility()`、`tick()` 里那道统一闸门全部保持原样；
  `timeSystem.setOnPauseChange()` 这个通知钩子也保留（只是 main 不再注册），需要重新显示时接回去就行。
- 其他 debug 日志不受影响：`handleCommand` 里 `DEBUG_CONSOLE` 的分流、`/time` `/battery` 等指令输出都没碰
  （实测：隐藏 600 秒仍然一秒不补、恢复后照常走，只是终端不再出现那两行）。

**2. 事件选项的结果也用弹窗输出，并明确输出去重规则（`events.js` + `main.js` + `texts.js`）**

- 新流程（**整段共用一个 `withTimePaused`**，所以从选择窗弹出到结果窗关掉，时间一直暂停、终端一直锁输入）：

  ```
  掷骰命中
    → ① 描述打到终端（叙事流历史）           ┐ 描述的「双出」
    → ② 弹【选择窗】：同一条描述 + 2 个选项   ┘
    → 玩家必须选一个（无底部按钮、点遮罩不关闭）
    → ③ 先执行 effect（含 断电回家检测 + 重绘）
    → ④ 弹【结果窗】：结果文案 + 只有一个「继续」按钮
    → ⑤ 点「继续」→ 关窗 → 整段结束：时间恢复、终端解锁
  ```
- **去重规则落实**：
  | 信息 | 终端 | 选择弹窗 | 结果弹窗 |
  |---|---|---|---|
  | 事件描述 | ✅（触发时就打，不等选完） | ✅ | — |
  | 选项文字 | ✅（`> 选项文字` 一行操作记录） | ✅（按钮） | — |
  | **结果文案** | ❌（不再重复） | — | ✅（唯一出现处） |
  | 刷出的物品名 | ❌ | — | ✅（并进结果文案同一条） |
- 每个选项都有一句结果文案，放在 `texts.js` 的 `EVENTS[id].results`（10 条，与需求给的一字不差）；
  `events.js` 原来叫 `reply` 的字段改名 `result`，`runEventOption()` 的返回值同步改名。
- 结果弹窗复用 `modal.showModal()`：`desc` 放结果文案、`items: []`、`actions: [{ text: UI.eventContinue }]`
  —— **只有一个「继续」按钮**，与选择窗严格串联（不会同时存在两个模态，所以 `modal.showModal` 里「打开新的会先关掉旧的」这条逻辑不会被触发）。
- 其他弹窗（mustResolve / 拾取物品 / 替换 / 过夜结算）**完全没动**：结构、文案、暂停包装全部保持 v1.8.12 现状。
- 终端仍保留一行 `> 选项文字`：它是「玩家做了什么」的操作记录（与本作其它选项的回显一致），不是结果文案。
  若你希望连这行也去掉，说一句即可（改 `main.js` 一行）。

**3. 新增开关：悬浮显示事件选项效果（`config.js` + `events.js` + `main.js`）**

- `config.js` 新增 `EVENT_HOVER_SHOW_EFFECT = false`（默认关，保持探索感）。
- 文案在 `texts.js` 的 `EVENTS[id].effects`（10 条，与需求逐条一致）：
  | 事件 | A | B |
  |---|---|---|
  | 拾得零钱 | 当前节点获得 1 件物品 | 什么也不做 |
  | 脚下一滑 | 体力 -1 | 时间 +180 秒 |
  | 路边售货机 | 电量 -5%，获得物品 | 什么也不做 |
  | 路灯闪烁 | 电量 -3% | 电量 -8%，时间 +180 秒 |
  | 迷路片刻 | 时间 +180 秒 | 时间 +300 秒，体力 -1 |
- **读取位置**：`main.js` 的 `rollRandomEvent()` 里、构造选择窗的 `items` 时：
  ```js
  items: event.options.map((option, index) => ({
    id: index, text: option.label,
    hint: EVENT_HOVER_SHOW_EFFECT ? option.effectText : '',   /* ← 唯一一次判断 */
  })),
  ```
- **实现方式**：只用 `title` 属性，由现成的 `modal.js` 写上去（`if (item.hint) button.title = String(item.hint);`）。
  所以 `modal.js` 不需要改；原生 tooltip 由浏览器渲染，浅色/深色主题下都可读，不需要 CSS。
- 为 `false` 时 `hint` 传空串 → 按钮没有 `title` → 不显示提示，点击行为完全不受影响。

### 变更清单

| 文件 | 改动 |
|---|---|
| `v6/js/main.js` | `rollRandomEvent()` 改成「描述进终端 → 选择窗 → 执行效果 → 结果窗 → 继续」并用**一个** `withTimePaused` 包住整段；选项 `items` 增加受开关控制的 `hint`；`boot()` 删掉暂停提示回调；config 导入增加 `EVENT_HOVER_SHOW_EFFECT` |
| `v6/js/events.js` | 池里每个选项增加 `result`（原 `reply` 改名）与 `effectText`；`runEventOption()` 返回值 `reply` → `result`；文件头注释同步 |
| `v6/js/texts.js` | `EVENTS` 的 `replies` → `results`（换成需求给的 10 条结果文案）并新增 `effects`（10 条悬浮说明）；新增 `UI.eventResultTitle` / `UI.eventContinue`；删除 `UI.timePaused` / `UI.timeResumed` |
| `v6/js/config.js` | 新增 `EVENT_HOVER_SHOW_EFFECT = false`；`GAME_VERSION` → `v1.8.13` |
| `v6/js/timeSystem.js` | 仅注释：说明该钩子现在没有消费者，暂停/恢复逻辑不变 |
| `v6/js/modal.js` | **未改动**：`item.hint → button.title` 与「单个 action 按钮」本来就支持，本轮核对确认 |
| `v6/js/terminal.js` | **未改动**：仍复用现成的 `setLocked()` 实现「弹窗期间不接收输入」 |
| `v6/style.css` | **未改动**：悬浮用原生 `title`，模态配色走 `--term-*`（两套主题一致），无需新样式 |
| `HANDOFF.md` | 游戏版本同步 `v1.8.13` |

**存档格式**：`VERSION` 仍为 **`3`**，**未变**，旧存档照常加载。

### 验证

- 模块链接检查（11 个模块 OK + `main` 需 DOM）、DOM 桩 `boot()` 无异常、12 个 js 文件 `node --check`。
- 66 项断言全部通过（`.tools/nw_r14_check.mjs`，DOM 桩里真跑 `boot()`、真点选项/继续按钮、真跑 `tick`）：
  - **改动 1**：两个文案键与注册代码都已删除、钩子与暂停逻辑仍在；隐藏 600 秒仍不补时间、恢复后照常走，但**终端不再出现那两句话**；其他 debug 分流未受影响。
  - **改动 2**：10 条结果文案与需求一字不差、旧 `replies` 清零；**端到端**：描述在弹窗之前就进了终端（双出）、选择窗结构正确、点 A 后 **效果先执行**且选择窗关掉后弹的是**结果窗**（标题「结果」、只一个「继续」按钮、没有选项按钮）、结果文案**只在**结果窗里（终端同一时刻不含它）、刷出的物品名并进同一条、**两个弹窗期间时间都暂停且终端都锁着**、点「继续」后弹窗全关 → 时间恢复 → 终端解锁；B 分支同样只把结果文案放进弹窗。
  - **改动 3**：常量默认 `false`、只在 `rollRandomEvent()` 里判断一次、默认时按钮没有 `title`；10 条悬浮说明与需求一字不差；`modal.js` 的 `hint → title` 通道实测可用。
- **开关 true 分支单独验证**（`.tools/nw_r14_hover.mjs`）：ESM 的 import 绑定只读、进程内改不了常量，
  所以把 `v6/` 复制到临时目录并把常量改成 `true` 再跑 —— 两个选项按钮分别拿到
  「当前节点获得 1 件物品」/「什么也不做」，按钮仍可点击（跑完自动清理副本）。
- 旧套件回归：v1.8.6 ~ v1.8.12 全部通过。其中 `nw_r13`（v1.8.12 的套件）按本轮变化改了 5 处：
  两条「终端提示时间暂停/恢复」的断言取消、`reply/replies` 改名、事件流程改成「选完弹结果窗 → 点继续才恢复」。
  顺带修掉该套件一个自身的小 bug：找按钮时用 `includes()` 匹配类名，把容器 `map-modal__actions` 也算成了按钮，
  改成整词匹配后正常。

### 已知限制 / 遗留

- 终端仍会为事件留一行 `> 选项文字`（玩家操作记录）。严格按「同一信息只出现在一处」的话，这一行与选择窗的按钮文字重合；
  我判断它是操作记录而非结果文案，所以保留；要更严格就删掉 `main.js` 里那一行 `terminal.log(UI.echo(option.label));`。
- 结果窗里的「结果文案 + 刷出物品」用空格连成一句（`join(' ')`），没有引入多行样式；
  如果你想分成两行显示，需要给 `.map-modal__desc` 加 `white-space: pre-line`（会影响所有模态的描述框，但现有描述都不含换行，视觉上无变化）。
- 悬浮提示用的是浏览器原生 `title`（需求里允许）：样式由系统决定，无法跟主题；若要跟主题样式需要换成自定义 tooltip。
- `EVENT_HOVER_SHOW_EFFECT` 是编译期常量，改完要刷新页面生效（它是 `import` 的绑定，运行中不能切换）。
- 预先存在、本轮**未处理**：`m1`（枯树林）的 ASCII 图是 11 行，与项目「12 行」约定不符。

---

## [v1.8.12] — 2026-10-11 —— 后台不再补时间 + 去掉全部紫色 + 随机事件改「弹窗 + 必须决断」

**回档点**：`v1.8.12`

### 变更

**1. 窗口隐藏时暂停计时，不再补足（`timeSystem.js` + `main.js`）**

- 反转让：原设计是「切后台回来一次性补足」，现在改成**隐藏期间的时间一秒都不补**。
- 暂停条件统一成一处（`timeSystem.js` 的 `tick()`），两种条件互不覆盖：
  1. **暂停来源**（事件式）：窗口隐藏（`visibilitychange`）／模态弹窗打开期间 —— 用 **token 集合** `pauseTokens` 记录，
     全部解除才恢复。用 Set 而不是布尔值，是因为多个来源可能重叠，布尔值会被后一个来源的「恢复」把前一个还没结束的暂停覆盖掉。
  2. **在家节点**（状态派生的每帧条件）：仍留在同一个 `if` 里判断，不占暂停来源。
  ```js
  if (isTimePaused() || game.getCurrentNode() === 'home') return;
  ```
- 计时仍是 `Date.now()` 差值：`tick()` 每帧都把 `lastTickTime` 推到当前时刻，所以任何被跳过的时段都不会在恢复后被补上；
  恢复可见时再显式重建一次基准（`lastTickTime = Date.now()`）。
- **没有**用「隐藏时 `stopClock()`、显示时 `startClock()`」的写法：那样会和「夜晚结束 / gameOver 时停表」互相覆盖，
  正是要求里说的「不要互相覆盖」。停表只由原有的三个拥有者负责，暂停只是 tick 内的一个闸门。
- 存档导入：`startClock()` 本来就会重建基准，另外按要求在可见时再显式调一次 `time.resetClock()`；
  隐藏期间导入的情况，等恢复可见时由 `visibilitychange` 重建（要求 3、4）。
- 终端提示（仅 `DEBUG_CONSOLE === true`）：`UI.timePaused`（「时间已暂停」）/ `UI.timeResumed`（「时间已恢复」），
  由 `time.setOnPauseChange()` 注入的回调输出，且**只在暂停↔恢复真正翻转时**输出一次（避免每帧刷屏）。

**2. 去掉所有紫色元素（`style.css`）**

| 位置 | 原值 | 新值 |
|---|---|---|
| `:root` `--dark-node-stroke` | `#7b3ba3`（紫） | `#333333`（中性深灰，压在白底上） |
| `:root` `--dark-tag` | `#6d2f92`（紫） | `#4d4d4d`（中性深灰） |
| `html[data-theme="dark"]` `--dark-node-stroke` | `#c07ae0`（亮紫） | `#9a9a9a`（中性灰，比普通节点的白描边暗一档） |
| `html[data-theme="dark"]` `--dark-tag` | `#c07ae0` | `#b5b5b5` |
| `.node.is-dark .node-circle` 注释 | 「圆环强调色」 | 「中性深灰圆环」 |
| `map.js` 里的类名注释 | 「底色 + 紫色描边 + 小标签」 | 「圆形 + 中性深灰圆环 + 小标签」 |

- 全表只剩一个非中性色：`--term-echo: #7fd37f`（终端回显绿，v1.8.11 之前就有，不是紫色）。
  紫色字面量、以及 CSS/JS 里「紫 / purple / violet」字样**全部清零**（已用脚本逐色核对 R≈G≈B）。
- 黑暗地点与普通节点的区分改成**三件套、全靠非颜色手段**：圆形 + **比普通节点粗一档（4px）的中性灰圆环** + `[黑暗]` 小标签。
- 可读性（对比度实测，WCAG 非文本图形要求 ≥ 3:1、标签文字 ≥ 4.5:1）：
  浅色主题圆环 12.6 / 已访问 21.0、标签 8.5；深色主题圆环 6.9 / 已访问 17.4、标签 9.5 —— 两套主题、两种拜访状态全部达标。
  其中**已访问**的圆是反色底（浅色主题=黑底、深色主题=白底），中性灰圆环在其上对比不足，
  所以补了两条规则把圆环与标签一起换成反色文字色（`--node-visited-text`）。

**3. 随机事件改「弹窗 + 必须决断」（`events.js` + `modal.js` + `main.js` + `texts.js` + `terminal.js`）**

- 事件不再直接往终端打一行字就自动生效，而是：**触发 → 弹窗（描述 + 2 个选项）→ 必须选一个 → 执行效果 → 关窗**。
- 事件结构改成要求的样子：
  ```js
  { id, desc, options: [{ label, effect }, { label, effect }] }
  ```
  文案（`desc` / `options[].label` / `replies[]`）全部来自 `texts.js` 的 `EVENTS`，效果在 `events.js` 的 `EFFECTS` 里按 `[id][下标]` 对应 ——
  与 `map.js` 的 `defNode()` 从 `SCENES` 取文案是同一套分工。加新事件只要在两边各加一条。
- 5 个事件与 10 个选项的效果（测试用的都是简单状态改动）：
  | 事件 | A | B |
  |---|---|---|
  | 拾得零钱（路边有个钱包） | 捡起来看看 → 当前节点刷 1 件物品 | 放回原处 → 无效果 |
  | 脚下一滑（地面湿滑） | 强行稳住 → 体力 -1 | 顺势蹲下休息 → 时间 +180 秒 |
  | 路边售货机（还亮着灯） | 投币试试 → 电量 -5% 且刷 1 件物品 | 无视 → 无效果 |
  | 路灯闪烁（电流不稳） | 快步走开 → 电量 -3% | 原地等它稳定 → 电量 -8% 且时间 +180 秒 |
  | 迷路片刻（走错方向） | 原路返回 → 时间 +180 秒 | 硬着头皮往前 → 时间 +300 秒且体力 -1 |
- 弹窗复用 `modal.showModal()`：两个选项做成 `items`、`actions: []` —— 与 `mustResolve` 弹窗完全同一套
  （只有 item 能 resolve、没有底部按钮、遮罩不绑 click），所以**不能跳过、不能点遮罩关闭**。
- **弹窗期间时间暂停 + 终端不接收输入**：新增 `main.js` 的 `withTimePaused(run)` 包装器，
  `modal.showModal`（mustResolve / 拾取 / 替换 / 事件）与 `terminal.showModal`（导出 / 导入）**六处全部**从它走，
  用 `try/finally` 保证恢复；用「层数 `modalDepth` + 每次开窗的唯一 token」而不是布尔值，
  避免弹窗交叠时先关掉的那个提前解锁 / 提前恢复时间。
- 触发时机、几率、开关**与 v1.8.11 完全一致**（要求 2）：移动到达节点时掷一次、每次消耗时间的选项后掷一次（不含移动本身，不双掷）、
  `EVENT_CHANCE = 0.15`、可重复触发、`/event on|off|reset` 通过 `state.setEventsEnabled` 真正生效并写 localStorage `game_events_enabled`。
- 选完之后终端仍留痕：回显 `> 选项文字` + 该选项的氛围/结果文案（`EVENTS[id].replies`）+ 刷出的物品名（`UI.eventSpawned`）。

### 变更清单

| 文件 | 改动 |
|---|---|
| `v6/js/timeSystem.js` | 新增 `watchVisibility()`、`addPauseReason()`、`removePauseReason()`、`isTimePaused()`、`setOnPauseChange()`；`tick()` 的闸门改成 `isTimePaused() \|\| 在家` |
| `v6/js/main.js` | 新增 `withTimePaused()`（含 `modalDepth` / `modalSeq`）；`rollRandomEvent()` 改成弹窗流程（`await`）；6 处弹窗改走 `withTimePaused`；`travelTo` / `onOptionClick` 的事件触发点改成 `await`；`importSave()` 补可见时 `resetClock()`；`boot()` 注入暂停回调并调 `watchVisibility()` |
| `v6/js/events.js` | 事件池结构改成 `{ id, desc, options }`；新增 `EFFECTS` 表、`getEvent()`、`runEventOption()`；`rollEvent()` 只挑事件不再执行；删掉 `triggerEvent()`（改为「取事件 + 执行选项」两步） |
| `v6/js/texts.js` | `EVENTS` 改成 5 个事件的 `{ desc, options[2], replies[2] }`；`UI` 加 `eventTitle`、`eventSpawned(name)`、`timePaused`、`timeResumed`；删掉不再用的 `eventLine` |
| `v6/js/modal.js` | **未改动**：它本来就满足「必须选一个、不能点遮罩关闭」，事件弹窗直接复用（本轮核对确认，无需改） |
| `v6/js/terminal.js` | **未改动**：复用现成的 `setLocked()` 实现「弹窗期间不接收输入」（由 main 调用） |
| `v6/style.css` | 4 个紫色变量换成中性灰；圆环粗细 3 → 4；新增已访问反色圆环/标签两条规则；注释去紫 |
| `v6/js/map.js` | 仅一处注释去紫（无逻辑改动） |
| `v6/js/config.js` | `GAME_VERSION` → `v1.8.12` |
| `HANDOFF.md` | 游戏版本同步 `v1.8.12` |

**存档格式**：`VERSION` 仍为 **`3`**，**未变**，旧存档照常加载。

### 验证

- 模块链接检查（11 个模块 OK + `main` 需 DOM）、DOM 桩 `boot()` 无异常、12 个 js 文件 `node --check`、`style.css` 花括号 130/130 配平。
- 88 项断言全部通过（`.tools/nw_r13_check.mjs`，DOM 桩里真跑 `boot()`、真点节点 / 真点弹窗按钮 / 真跑 `tick`，用可控 `Date.now` 推进时间）：
  - **后台不补时间**：可见时 60 秒 → +60；**隐藏后 600 秒一秒都没走**；恢复瞬间不补、恢复后再走 30 秒 → +30；
    暂停/恢复各输出一次终端提示；「在家不流逝」仍有效且与暂停互不覆盖（隐藏+在家同时成立 → 去掉隐藏后在家这条继续单独生效）；
    导入存档的基准重建位置（可见时 `resetClock()`、恢复可见时重建）都已核对。
  - **去紫**：3 个旧紫色字面量与全部「紫/purple/violet」字样清零；全表非中性色只剩 `--term-echo` 的绿；
    两套主题 × 未访问/已访问的圆环与标签对比度全部达标；已访问换反色规则、圆环加粗、填充仍是通用配色。
  - **事件**：池结构（5 个 × {desc, options[2]}）；10 个选项的效果逐条验证（含 4B 的「-8% 再加 180 秒自然流逝」）；
    `rollEvent` 只挑不执行；关着→null、命中/未命中区间各 2000 次全对；两个触发点仍在且改成 `await`；移动仍不在 `advanceTime` 里掷；
    **弹窗端到端**：标题/描述/两个选项按钮/无底部按钮/遮罩无 click、**弹窗期间时间暂停且终端锁输入**、
    **弹窗期间 600 秒一秒都没走**、选 A 后效果生效 + 终端回显 + 氛围文案 + 刷出物品 + 恢复时间 + 解锁输入、再触发一次选 B 走另一分支；
    六处弹窗都走同一包装、两层暂停叠加时关掉一层仍保持暂停。
- 旧套件回归：v1.8.6 ~ v1.8.11 全部通过。其中三处按本轮变化做了调整并在注释里写明原因：
  - `nw_r11` / `nw_r12` 的紫色变量断言改成中性灰；
  - `nw_r12` 的「随机事件池」小节整体搬到 `nw_r13`（事件表现形式改了）；
  - `nw_r10` 的桩新增「关掉开着的弹窗」——因为**弹窗期间现在会暂停时间**，
    老套件的桩从不点弹窗，会让后面所有 tick 断言失效（这不是产品缺陷：真实玩家会点掉弹窗）。

### 已知限制 / 遗留

- **弹窗一直开着 = 时间一直暂停**（这是要求的行为）。若某个弹窗因为异常路径永不 resolve，时间就会一直停在那里；
  当前六处弹窗都走 `try/finally`，正常路径不会泄漏 token。
- **暂停期间 `advanceTime()` 仍然照常推进时间**（移动、选项、事件效果的离散耗时不受暂停影响）—— 暂停的是「按真实时间自然流逝」那条连续积分。
  这是刻意的：暂停时玩家也不可能触发移动/选项（终端锁了、弹窗盖着地图）。
- 「在家不流逝」没有并进 token 集合（它是按当前节点派生的每帧条件），但两者在 `tick()` 的**同一个闸门**里判断，不会互相覆盖；
  暂停/恢复的终端提示只覆盖事件式的两个来源（隐藏、弹窗），避免每次进出家门都刷屏。
- 黑暗标识全靠「圆形 + 加粗中性灰圆环 + `[黑暗]` 标签」区分，没有颜色辅助；如果你觉得不够醒目，可以再加一件非颜色手段（比如虚线圆环）。
- 预先存在、本轮**未处理**：`m1`（枯树林）的 ASCII 图是 11 行，与项目「12 行」约定不符。

---

## [v1.8.11] — 2026-10-11 —— 黑暗区域改圆形 + 强制回家改选「可达的最近门户」 + 实装随机事件池

**回档点**：`v1.8.11`

### 修复

**1. 黑暗区域显示改为圆形（`map.js` + `style.css`）**

- 症状：`dark_core` 与大地图 `darkarea` 块用的是「深底 + 紫描边」的另一套配色，与普通节点不是一套语言。
- 修复：
  - 形状：黑暗地点与黑暗区域改画 **`<circle>`**（新增 `node-circle` / `region-circle` 元素），方形与菱形由 CSS 在 `.is-dark` 时隐藏。
    - 节点圆的半径 = **节点框半宽**（`w / 2`）。节点框是扁矩形，只有用宽度才能把名字圈进去（`dark_core`＝「黑暗核心」4 字 × 26px）。
    - 区域圆的半径 = **区域框半高**（`box.h / 2`）。`darkarea` 的框是 200×90 且贴在大地图下边缘，用高度才能保证整块圆落在框内、不出 1000×600 画布；区域名字号相应降到 18px 才放进圆里。
  - 配色：填充与描边**沿用通用节点变量**（浅色黑框白底 / 深色白框深底），已访问用 `--node-visited-fill`、hover 用 `--hover-bg`、当前节点加粗描边 —— 全部与普通节点同一套，不再另造底色。
    为此删除了 v1.8.10 引入的 5 个独立底色变量：`--dark-node-fill`、`--dark-node-hover`、`--dark-node-diamond`、`--dark-node-text`、`--dark-region-fill`。
  - 保留的黑暗标识（与圆叠加）：圆环强调色 `--dark-node-stroke`（浅色 #7b3ba3 / 深色 #c07ae0）＋ 名字下方的 `[黑暗]` 小标签 `--dark-tag`（`UI.mapDarkTag`）。
  - 自适应缩放照旧：半径由 `NODE_W * computeNodeScale()` 推出；当前节点的描边粗细仍用 `calc(9px * var(--node-scale, 1))`。
  - 「已访问 / 未访问 / 当前 / 走不到 / 没电进不去」五种状态下的圆形都验过；标签排在「你在这里」下面一行且仍在圆内。

**2. 强制回家改为「可达的最近门户（安全屋）」（`map.js` + `main.js`）**

- 症状：强制回家直接调传送，绕过 v1.8.6 的「已探明路径连通性」判定，把玩家送到当前区域的 `primaryShelter`（可能根本不连通）。
- 修复：
  - `map.js` 新增导出 `isPortalNode(nodeId)`：**共享节点**（出现在 ≥2 个区域的 `nodes` 列表里）即门户，不手写名单 —— 现状是 `home` / `lighthouse` / `northpass` / `northgate` / `southpass`，以后加新门户自动生效。
  - `map.js` 新增导出 `findNearestReachableShelter(currentNodeId, regionId)`：在**两端都已访问（已探明）**的边子图上从当前节点出发找最近门户。
  - `main.js` 新增 `forceHomeTarget()`：先问上面的函数；找不到就退回 `primaryShelterOf(区域)` 并 `console.warn` 一条 debug 日志。
    三条强制回家流程（体力归零 / 06:00 天亮 / 黑暗归零）**全部改用它**，顺序统一为「先传送 → 后结算」（v1.8.10 已定，本轮沿用）。
  - 结算差异（按你的表落实，`main.js`）：
    | 流程 | 落点 | 天数 +1 / 时间归零 | 体力上限 | 电量 |
    |---|---|---|---|---|
    | 体力归零 | `forceHomeTarget()` | 是 | **-1** | 落点是 `home` 才回满 |
    | 06:00 天亮 | `forceHomeTarget()` | 是 | **不扣**（本轮改） | 落点是 `home` 才回满 |
    | 黑暗归零 | `forceHomeTarget()` | 是 | 不扣 | 落点是 `home` 才回满（darkarea 里落点是 southpass，所以保持 0） |
  - 两条连带变化（都在你的差异表里）：**06:00 天亮不再扣体力上限**（原先两种 reason 都扣）；**体力归零现在也会结算**（原先只传送+扣上限，由玩家自己点过夜，这是 v1.8.5 的老规则）。

### 新增

**3. 随机事件池（新建 `js/events.js` + `config.js` + `main.js` + `texts.js` + `debug.js`）**

- 新建 `js/events.js`：事件池 `EVENT_POOL`（5 个）、抽取 `pickEvent(rng)`、强制触发 `triggerEvent(id, nodeId)`、掷骰 `rollEvent(nodeId, rng)`、`listEventIds()`。
  不碰 DOM（终端输出由 `main.js` 负责），文案全部来自 `texts.js` 的 `EVENTS`。
- 触发时机（由 `main.js` 决定，模块本身不挂时机）：
  1. **移动到达节点时**：`travelTo` 里 `await arriveAt(node)` 之后、体力负值判断之前掷一次（这样「脚下一滑 -1 体力」正好能参与负值强制回家判断）；
  2. **每次消耗时间后**：`onOptionClick` 末尾，且满足「该选项 `timeCost > 0`」且「没被天亮/黑暗断电打断」才掷。
  移动本身不在 `advanceTime` 里掷 —— 避免一个动作掷两次。
- 几率：`config.EVENT_CHANCE = 0.15`，每个触发点只掷一次（`Math.random() < EVENT_CHANCE` 才抽事件），事件可重复触发。
- 5 个测试事件：`coins` 拾得零钱（无状态改动）、`slip` 脚下一滑（体力 -1）、`supply` 路边补给（当前节点刷出 1 件物品，走现有节点物品池并解除「已拾取」标记）、`flicker` 路灯闪烁（电量 -5%）、`lost` 迷路片刻（时间 +300 秒，走 `time.advanceTime`，因此也照常扣电并检查天亮）。
- 开关：`state.getEventsEnabled()` 是唯一的闸门（`/event` 控制，存 localStorage `game_events_enabled`）；关闭时连随机数都不消耗。
- `debug.js` 的 `/event` 从「空转」改为**走真正的开关接口**：优先调 `main.js` 注入的 `ctx.setEventsEnabled`（= `state.setEventsEnabled`，它一并写 localStorage），拿不到时才退回旧写法；
  返回值里附上事件池 id 列表（`ctx.eventIds`）便于确认已生效。`EVENTS_DEFAULT` **保持 `false`**（按你的建议，测试时 `/event on`）。

### 变更

| 文件 | 改动 |
|---|---|
| `v6/js/map.js` | 新增导出 `isPortalNode()`、`findNearestReachableShelter()`（+ 内部 `edgeWeight()`）；`renderArea()` 给 isDark 节点加 `circle` 元素并调整标签纵坐标；`renderWorld()` 给黑暗区域加 `circle` 元素 |
| `v6/js/main.js` | 新增 `forceHomeTarget()`、`rollRandomEvent()`；`onForceHome()` 改用 `forceHomeTarget()` 且只在体力归零时扣上限、两条路径都 `settleNight()`；`onBatteryCollapse()` 改用 `forceHomeTarget()`；`travelTo()` 加事件触发点一；`onOptionClick()` 加事件触发点二；`debugContext` 增加 `setEventsEnabled` / `eventIds` |
| `v6/js/events.js` | **新建**：事件池 + 抽取 + 触发 + 掷骰 |
| `v6/js/config.js` | 新增 `EVENT_CHANCE = 0.15`；`EVENTS_DEFAULT` 注释更新（值仍为 false）；`GAME_VERSION` → `v1.8.11` |
| `v6/js/texts.js` | 新增 `EVENTS`（5 条事件文案）与 `UI.eventLine` |
| `v6/js/debug.js` | `/event` 改为经 `ctx.setEventsEnabled` 真正开关，并在返回文案里附上事件池 id |
| `v6/style.css` | 新增 `.node-circle` / `.region-circle` 与黑暗圆形规则；删除 5 个独立底色变量；保留 `--dark-node-stroke` / `--dark-tag` |
| `HANDOFF.md` | 游戏版本同步 `v1.8.11` |

**未改动（已核对）**：`v6/js/state.js`（`setEventsEnabled` / `getEventsEnabled` 本来就齐）、`v6/js/timeSystem.js`（事件的时间改动直接复用它的 `advanceTime`）、`v6/js/inventory.js`、`v6/js/saveSystem.js`。

**存档格式**：`VERSION` 仍为 **`3`**，**未变**，旧存档照常加载（事件开关本来就在 localStorage，不进存档）。

### 验证

- 模块链接检查（**新增 events.js 一并纳入**，11 个模块 OK + `main` 需 DOM）、DOM 桩 `boot()` 无异常、12 个 js 文件 `node --check`、`style.css` 花括号 128/128 配平。
- 76 项断言全部通过（`.tools/nw_r12_check.mjs`，DOM 桩里真跑 `boot()` / 真点按钮 / 真跑 `tick`）：
  - **圆形**：`dark_core` 有 `circle`（半径 = 节点框半宽）且方形/菱形被隐藏；未访问 / 已访问 + 当前 / 没电进不去三种状态都带 `is-dark` 且圆还在；`[黑暗]` 标签在圆内、排在「你在这里」下面；`darkarea` 区域块有圆（半径 = 区域框半高，且圆不越出 1000×600 画布）；普通节点/区域没有圆；5 个旧底色变量确实已删、填充确实走 `--node-fill` / `--node-visited-fill`。
  - **最近门户**：`isPortalNode` 对 5 个共享节点为真、对普通节点为假；只走已探明边（未探明时 `n1` 孤立 → `null`）；起点本身是门户时返回自己；`n2` / `n5` 得 `home`、`n7` 得直连门户；`distance` 判定（当前无 `distance` 字段 → 走跳数 BFS，缺字段时有坐标兜底）；三条流程都调用 `forceHomeTarget()`；**实测**：体力归零（n2 → home，天数 +1、上限 -1、体力回满、电量回满）、天亮（n2 → home，天数 +1、**上限不扣**、电量回满）、黑暗归零（dark_core → southpass，天数 +1、不扣上限、电量保持 0）。
  - **事件池**：`EVENT_CHANCE`/`EVENTS_DEFAULT` 值；池 5 个、id 与 `texts.js` 一一对应；`pickEvent` 边界（注入 rng 取首/尾/中）；5 个事件各自效果（零钱无改动、滑倒 -1 体力、补给刷出合法物品且解除已拾取、闪烁 -5% 电量、迷路 +300 秒）；关着时掷骰返回 `null`；命中/未命中区间各 2000 次全对；两个触发点代码位置与「移动不在 advanceTime 里掷」；`/event on|off|reset|切换|非法参数` 的行为与写盘；**端到端**：把 `Math.random` 钉成 0.01（默认参数在调用时求值）后，一次移动与一次消耗时间的选项都稳定掷出事件行，关掉开关后同样的操作 0 次触发。
- 旧套件回归：v1.8.6 ~ v1.8.10 全部通过。若干条断言按本轮的行为变化**改写并注明原因**（天亮不再扣上限、体力归零也结算、黑暗配色变量删除、回家目标改门户）。

### 已知限制 / 遗留

- **平手时选谁由边序决定**：`n7` 直连 `lighthouse` / `northpass` / `southpass` 三个门户，都在 1 跳上；谁先被遍历到就选谁（测试里实测是 `southpass`，因为那句之前它已被标记为已访问）。如果你希望平手时优先 `home`（它才会回电），说一句即可加一条 tie-break。
- **「最近」现在是跳数**：所有边都只写了 `{ from, to }`，没有 `distance` 字段，所以走的是普通 BFS。想让「最近」按路程或时间算，需要给边补 `distance`（权重分支已经写好）或改用现成的 `computeEdgeCost`（耗时）。
- **门户 ≠ 可过夜**：`isPortalNode()` 是「是不是区域出入口」，与 `isShelter()`（所有区域 `primaryShelter` 的并集，决定过夜选项与储物箱）是两个概念。差别在 `northgate`：它是门户但当前不是 `isShelter`，所以被送到那里时没有过夜选项。要不要统一成一个概念，请你定。
- **黑暗归零的落点若正好是 `home`，电量会回满**：回电是全局规则「落点 === home 才回电」，本轮没有为黑暗这条单独写特例（`darkarea` 里最近门户是 `southpass`，所以正常情况仍保持 0）。
- **事件触发点一排在 `arriveAt` 之后**，而 `arriveAt` 末尾会弹 `mustResolve` 模态 —— 所以带 `mustResolve` 的节点上，事件会在玩家做出选择之后才输出。
- 「路边补给」的候选是 `compass` / `pocketwatch` / `darkshard` / `oldmap` 四件小件，池子写死在 `events.js` 的 `SUPPLY_ITEMS`，要调很容易。
- 本轮**我自己的 PowerShell 改写脚本出过一次事故**：一个 `@( @(...) )` 数组字面量被 PowerShell 展平，导致两个临时测试脚本被 `e→q` 与 `/→*` 误伤。**产品代码未受影响**（已逐个核对首字节、BOM 与 `node --check`）。其中一个脚本已还原，另一个（`nw_r9_check.mjs`）无法还原、已删除 —— 它覆盖的 v1.8.8 行为现在由 `nw_r9_e2e.mjs` / `nw_r10` / `nw_r11` / `nw_r12` 重复覆盖。
- 预先存在、本轮**未处理**：`m1`（枯树林）的 ASCII 图是 11 行，与项目「12 行」约定不符。

---

## [v1.8.10] — 2026-10-11 —— 黑暗归零改回本区域安全屋（不回电）+ 06:00 天亮复用过夜结算 + 黑暗标识与「进不去」文案

**回档点**：`v1.8.10`

### 修复

**1. 黑暗归零改成送回【本区域的 primaryShelter】，且电量不回满（`main.js`）**

- 症状：在 `dark_core` 里电量归零，人被送回 `home` 区域的 `home` 节点、而且电量回满 —— 与「黑影地带的安全屋是南关口」的设定不符。
- 根因：`main.js` 的 `onBatteryCollapse()` 里写死了 `visitNode(HOME_ID, HOME_ID)`（v1.8.8 那版的规格就是「回 home」，本轮改成按区域）。
  因为 `visitNode` 之后当前节点确实变成了 `home`，`settleNight()` 的回电条件「当前节点是 home」成立，于是电量顺带回满。
- 修复：改成与体力归零 / 天亮强制回家同一条规则 —— `primaryShelterOf(game.getCurrentArea())`：

  ```js
  const area = game.getCurrentArea();
  const shelterId = primaryShelterOf(area);      /* darkarea → southpass */
  visitNode(area, shelterId);                    /* 1 先传送 */
  settleNight();                                 /* 2 后结算 */
  ```

  传送目标是 `southpass`（不是 `home`），所以 `settleNight()` 的回电条件不成立 —— **电量不回满**是这条规则的自然结果，不需要额外写一个「不要回电」的特例。
  天数 +1 / 时间归零 / 体力回满 / **不扣体力上限** / 先生成后 gameOver 的顺序都没变。
- `darkarea.primaryShelter = 'southpass'` 这个字段 **v1.8.8 就已经存在**，本轮核对后确认无需改动（请求里的第 1 项已是现状）。
- 顺带被这条顺序救了一次：`settleNight()` 里会调 `time.drainBatteryOnDayChange()`，它会再通知一次 `onBatteryCollapse()`（电量仍是 0）。
  正因为「先传送」已经把当前节点换成非黑暗的 `southpass`，那次重入会在 `isDark` 判断处立刻返回 `false`，不会递归、也不会多结算一天。
  这条依赖已经写进源码注释，改这段时必须保持「先 visitNode、后 settleNight」。

**2. 06:00 天亮的结算复用「主动过夜」，电量按当前节点回（`main.js`）**

- 症状：06:00 被强制送回 `home` 之后，电量没有回满。
- 根因（与请求里的三条猜测有关，但真因是第 3 条）：`onNightEnd()` 有**两套半成品**，都不是 `settleNight()`：
  - 不在安全屋时 → `onForceHome('night')`，而这个函数当时**完全不结算**（只传送 + 扣体力上限 + 打印到达），
    注释写着「强制回家不再自动结算：送到安全屋后由玩家自己选『过夜』」—— 那是 v1.8.5 为**体力**强制回家定的规则，被天亮那条路径一并继承了；
  - 已经在安全屋时 → 另外一小段「只 `setDay(+1)` + 扣跨天电 + 时间归零」，**既不回体力也不回电**。
  - 至于「`regionId === 'home'` 没跟着改」—— 这条不成立：v1.8.8 已经把回电判断改成了 `currentNode === RECHARGE_NODE`，本轮核对仍在。
- 修复：
  - `onNightEnd()` 两条分支**都收在 `settleNight()`** 上（人在安全屋就原地结算，不在就先 `onForceHome('night')`），那段半成品代码删除；
  - `onForceHome('night')` 在传送 + 惩罚 + gameOver 判断之后，对 `reason === 'night'` 调用 `settleNight()` 再 `arriveAt(传送后的节点)`；
  - 顺序统一为**先传送 → 后结算**：`settleNight()` 读的就是传送之后的当前节点，所以送回 `home` 时电量回满、送回灯塔/南关口时不回电，规则只有一条。
- 体力归零那条路径**刻意不动**：仍然是「送到安全屋 + 扣体力上限 + 不自动结算，由玩家自己点过夜」（请求里也要求只改天亮这条）。
  天亮那条仍然照旧扣 1 点体力上限（沿用原行为，未改）。

**3. 黑暗地点/区域的视觉标识 + 没电进不去的悬浮文案（`map.js` + `texts.js` + `style.css`）**

- 症状：`dark_core` 与普通节点在图上分不出来；没电时悬浮它显示的是「没电了，预测不了时间。」，与真正的原因（进不去）不符。
- 修复：
  - 节点组新增 `is-dark` 类（`renderArea` 里 `if (node.isDark) classes.push('is-dark');`），与「已访问 / 未访问 / 当前 / 走不到 / 没电进不去」五种状态**叠加**而不是互斥；
    再在节点名下方加一个小标签 `[黑暗]`（`dark-tag` 元素，文案来自 `UI.mapDarkTag`）。未访问时节点名被 CSS 藏起来，但标签照常显示 —— 它不泄露名字，只说明这里很黑。
  - 大地图：新增导出 `isDarkRegion(regionId)`（= 该区域含任何 `isDark` 节点，由节点推导而不是再加区域字段），`renderWorld()` 给区域块叠 `is-dark` 并加同一个 `[黑暗]` 标签。
  - 配色走主题变量：`:root` 与 `html[data-theme="dark"]` 各一套 `--dark-node-fill / --dark-node-hover / --dark-node-stroke / --dark-node-text / --dark-node-diamond / --dark-region-fill / --dark-tag`。
    浅色主题是深底白字 + 紫描边，深色主题把描边与标签提亮（仍是紫系）。
  - CSS 里这组规则写在所有节点状态规则**之后**（同权重时后写的赢），并额外给 `.is-dark.is-current`（保留加粗描边）与 `.is-dark.is-open:hover`（hover 不换回普通灰底）各补了一条，避免原有状态提示被吃掉。
  - 悬浮文案：`buildTipLines()` 先判 `isNodeBlockedByDarkness(toId)` → 返回 `UI.tipDarkBlocked`（「因为没电了，进不去。」）；
    再判电量 0 → `UI.tipNoBattery`（「没电了，预测不了时间。」）；有电时照旧两行耗时 + 到达时间。

### 变更

| 文件 | 改动 |
|---|---|
| `v6/js/main.js` | `onNightEnd()` 两条分支都收在 `settleNight()`（删掉那段「只加天数」的半成品）；`onForceHome()` 的 `night` 分支改为「传送 → `settleNight()` → `arriveAt(传送后的节点)`」；`onBatteryCollapse()` 的传送目标 `visitNode(HOME_ID, HOME_ID)` → `visitNode(area, primaryShelterOf(area))`，`arriveAt` 同步改成传送后的节点；`settleNight()` 补注释 |
| `v6/js/map.js` | 新增导出 `isDarkRegion()`；`renderArea()` 给 isDark 节点加 `is-dark` 类与 `[黑暗]` 标签；`renderWorld()` 给黑暗区域块加 `is-dark` 类与 `[黑暗]` 标签；`buildTipLines()` 增加 `tipDarkBlocked` 分支（排在通用那句之前） |
| `v6/js/texts.js` | 新增 `UI.tipDarkBlocked`（「因为没电了，进不去。」）、`UI.mapDarkTag`（`[黑暗]`） |
| `v6/style.css` | 两套主题各加 7 个 `--dark-*` 变量；新增 `.node.is-dark` / `.is-dark.is-current` / `.is-dark.is-open:hover` / `.region.is-dark` / `.dark-tag` 规则 |
| `v6/js/config.js` | `GAME_VERSION` → `v1.8.10` |
| `HANDOFF.md` | 游戏版本同步 `v1.8.10` |

**未改动（已核对）**：`v6/js/map.js` 里 `darkarea.primaryShelter = 'southpass'` 已存在；`v6/js/timeSystem.js` 本轮不需要改
（它只提供流逝扣电与 `drainBatteryOnDayChange()`，结算与回电判断都在 `main.js` 的 `settleNight()`）；
`v6/js/state.js` / `v6/js/saveSystem.js` 也不需要改。

**存档格式**：`VERSION` 仍为 **`3`**，**未变**，旧存档照常加载。

### 验证

- 模块链接检查、DOM 桩 `boot()`、11 个 js 文件 `node --check`、`style.css` 花括号 123/123 配平，全部通过。
- 62 项断言全部通过（`.tools/nw_r11_check.mjs`，DOM 桩里真跑 `boot()` / 真点按钮 / 真跑 `tick`，用可控 `Date.now` 推进游戏时间）：
  - **黑暗归零**：送回的节点与区域是 `darkarea` / `southpass`（**不再是 home**）、天数 +1、时间归零、体力回满、**电量保持 0**、`staminaMax` 不变、天数只加一次（证明结算里那次跨天通知没有递归触发第二次断电）、到达文案落在南关口；「电量本来就是 0」的调试指令场景结果一致。
  - **06:00**：人在荒原野外 → 送回 `area1` 的 `home` → **电量回满**（本次修复的症状）、体力回满、天数 +1、时间 0；人在 `lighthouse` → 原地结算、**体力回满（旧的半成品不会回体力）**、天数 +1、非 home 安全屋不返电（只扣跨天 5%）；主动过夜与天亮结算在同一地点逐项结果一致（天数 +1 / 时间 0 / 体力满 / 电量 100）；代码层面核对「`visitNode` 在 `settleNight()` 之前」「`night` 分支调用 `settleNight()` 并打印到达」「体力那条仍不自动结算」「回电判断仍是 `currentNode === RECHARGE_NODE`」。
  - **黑暗标识**：未访问（菱形）、已访问 + 当前、没电进不去三种状态下 `dark_core` 都带 `is-dark`，`is-current` / `is-blocked` 等原有状态类一个没丢；`[黑暗]` 标签在节点与区域块上都存在，当前节点上让开「你在这里」；普通节点/区域既没有 `is-dark` 也没有标签；大地图 `darkarea` 区域块带 `is-dark`；7 个 `--dark-*` 变量在两套主题里都有定义，黑暗规则在源码里排在状态规则之后。
  - **悬浮文案**：没电悬停 `dark_core` → 「因为没电了，进不去。」；没电悬停普通节点（`n5`）→ 仍是「没电了，预测不了时间。」；有电悬停 `dark_core` → 正常两行耗时 / 到达时间。
- 旧套件回归：v1.8.6 ~ v1.8.9 的断言与端到端全部通过。其中若干条断言**故意改写**以对齐本轮的新设定（原先是「回 home + 电量回满」与「没电悬浮 dark_core 用通用那句」），都加了注释说明改动原因。

### 已知限制 / 遗留

- **黑暗断电后电量停在 0，而南关口不是 home 节点、过夜也不回电**：玩家必须自己走回 `home` 才能补电（没电时视野收缩成「当前节点 + 直接相邻」，仍能一步步走回去）。
  这是请求里「电量不回满」的直接后果，本轮照做未加兜底 —— 如果希望「至少给一点电」或「南关口也能补电」，说一声即可。
- **天亮强制回家仍然扣 1 点体力上限**（`FORCE_HOME_PENALTY`，沿用原行为）。请求只提到电量，所以没动；若希望天亮不扣（因为结算已经复用了过夜），需要单独确认。
- 黑暗标识用的是**紫系 + 深底 + `[黑暗]` 标签**三件套；`[黑暗]` 是普通 SVG 文字，不依赖特殊字体（项目里其它文案也都是普通中文字）。
- 预先存在、本轮**未处理**：`m1`（枯树林）的 ASCII 图是 11 行，与项目「12 行」约定不符。

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
