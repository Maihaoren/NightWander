# HANDOFF-LITE —— NightWander 精简交接

> 完整版见同目录 `HANDOFF.md`。本文只保留开发必需项；未标注「已验证」的都是未经运行验证的内容。

## 身份与目标
纯前端「地图探索」文字 demo，原生 HTML/CSS/JS + ES module，零依赖零构建，可直接静态托管。
循环：在家（时间不流逝）→ 出发 → 沿边移动（扣体力 1、耗游戏时间）→ 选项探查/拾取（可扣电、耗时）
→ 06:00 或体力归零被强制回家 → 结算（天数 +1、时间归零、体力电量回满）→ 下一天。

## 路径与运行
- 当前开发目录：`D:\Dsh\NightWander\v6`（12 文件：`index.html`、`style.css`、`js/{config,texts,map,state,timeSystem,inventory,saveSystem,debug,terminal,main}.js`）
- 上一代归档：`D:\Dsh\NightWander\v5`（含 10 张 `.jpg`；v6 不使用图片）
- 打包/回退：`D:\Dsh\NightWander\NightWander-v6.zip`（34.2 KB，含**重写前**的 `map.js`）
- 预览：`cd D:\Dsh\NightWander` → `node serve.mjs 8000` → `http://127.0.0.1:8000/v6/`（v5 在 `/v5/`）
- 本机 `python`/`python3` 不可用；容器内没有 `git`，回退只能靠 ZIP。

## 当前状态（最重要）
- 版本号：`config.GAME_VERSION = 'v1.7.5'`（多区域需求要求改 `v1.8.0`，未做）
- `DEBUG_CONSOLE = true`（用户临时开启；交付前应改回 `false`，**待确认**）
- 阶段：开发中，且**当前不可运行**。`map.js` 已重写为多区域版（未验证），其余 8 个文件未迁移 →
  新 `map.js` 依赖 `state.getVisitedByArea` / `state.currentArea` / `state.sheltersByArea`（都不存在），
  且 `config.js` 缺 `CROSS_REGION_COST_SEC`（新 `map.js` 已 import）→ 启动即报错。

## 核心接口（真实名称）
- **state**：`initState/visit/getCurrentNode/getVisitedByArea(未实现)/getOptions/setOptions/markOptionUsed(nodeId,index,perDay)/getUsedGroups/markGroupUsed/getStamina/spendStamina/getBattery/spendBattery/getDay/setDay/getElapsedSeconds/setElapsedSeconds/toSnapshot/replaceFromSnapshot`
- **timeSystem**：`startClock/stopClock/resetClock/advanceTime(sec)/getTimeString()/computeBatteryCap(sec)`
- **map（新版）**：`getRegion/getCurrentRegion/getNode(areaId,nodeId)/getNodes/getEdges/getCrossRegionTarget/isShelter/isPrimaryShelter/computeClickable(areaId,visited)/computeEdgeCost(from,to,areaId)/setMapView('world'|'area')/refreshMap/initMap`
- **terminal**：`log(text,className?)/logLines/clearQueue/visibleOptions/renderButtons/handleCommand/setLocked/showModal/copyText`
- **saveSystem**：`serialize(snapshot)/deserialize(str)` ← 版本常量当前为 **1**
- **debug**：`runCommand(input,state,ctx)/getAllCommandNames()`
- **main**：`travelTo/arriveAt/pickUpItems/onOptionClick/handleCommand/settleNight/onForceHome/ensureTimeOption/buildOptions/availableOptions/refreshButtons/renderStatusBar/renderInventory`

## 关键约定（不可擅改）
- 模块边界：`map` 不判规则、`state` 不碰 DOM、`saveSystem` 纯函数、`main` 唯一协调者；文案只在 `texts.js`，数值只在 `config.js`。
- 可点击判定 ＝ 已访问 ∪ 与已访问节点**有边相连**；**不使用距离阈值**。
- 边耗时 ＝ 距离 × `DISTANCE_TO_TIME_RATIO(3.0)`，支路再 × `SECONDARY_ROAD_PENALTY(1.4)`；跨区域边用其 `timeCost`。
- 时间用 `Date.now()` 差值累加；**在家不流逝**；**天数 +1 只发生在结算流程**（`main.settleNight`）。
- 按钮：用过的一次性选项消失；`requires` 不满足 ＝ 灰按钮 + `title` 提示且**占编号**；`group` 互斥 ＝ 灰。
- 地图：已访问＝矩形+名称；未访问可点＝黑白菱形(无文字)；未访问不可点＝不渲染；边两端有隐藏则不画。
- 终端两种主题都黑底白字（`--term-*` 不随主题变）；深色模式存 localStorage，不进存档。
- 用户硬约束：不改文件结构、不重构、只改点名位置、无第三方库/CDN、回复里要列出「改了哪些函数/字段」。

## 已知风险
1. **项目当前跑不起来**（见「当前状态」）——最高优先级。
2. 仓库内**没有任何测试文件**；历史验证都是一次性 Node 脚本 / headless Chrome 注入脚本，均已删除。
3. Tab 补全循环、`escapeHtml`、到达斜体/选项粗体 这批改动只做过 Node 逻辑验证与语法检查，**未做浏览器回归**。
4. `/event` 曾被报告「失效」，Node 桩环境无法复现；已重写并 Node 验证六种输入，浏览器未复测。
5. 遗留未清理：`REACH` 常量（无人引用）；菱形配色改主题黑白仅经补丁脚本输出确认，未视觉验证。
6. 手感/平衡（移动 510-1188 秒、探查 1800、休息 3600 秒，一夜 36000 秒）**未试玩验证**。

## 下一步（已明确，按序执行）
1. `config.js`：`GAME_VERSION='v1.8.0'`、`SHELTER_OVERNIGHT_COST_SEC=0`、`CROSS_REGION_COST_SEC=3600`
2. `state.js`：新增 `currentArea/mapView/visitedByArea/sheltersByArea/storageCapacityByShelter`，去掉 `homeStorage`/`visited`
3. `texts.js`：`lighthouse`(灯塔，`items:['pocketwatch']`)、`southgate`(南门，选项「前往南边的未知地域」)、area2 五节点(`entrance/m1/m2/m3/goal2`) + 8-12 行 ASCII
4. `inventory.js`：储物箱按 `shelterKey`（`'area1:home'` 形式）隔离
5. `main.js`：视图切换与「返回大地图」、安全屋「过夜/稍作停留」置顶、强制回家送 `primaryShelter` 且不自动结算、跨区域移动、`isShelter` 替换 `=== 'home'`
6. `saveSystem.js`：升 v2（`v:1` → 「存档版本过旧，无法加载」返回 `null`）
7. `debug.js`：`/area list`、`/area goto {areaId}`、`/goto area2:m1`、`/help`
8. `style.css` + `index.html`：`.region-block/.region-name/.region-link` 与顶部「返回大地图」按钮

## 新对话开场提示（简短版）
「请先读 `HANDOFF.md` + `HANDOFF-LITE.md`，并实际查看 `v6/js` 下的代码，用 3-5 行复述现状/任务/风险/下一步后停下等我确认；
确认之前不要改代码。下一步是按 HANDOFF 第 7 节完成多区域改造（**当前项目不可运行**）。」
