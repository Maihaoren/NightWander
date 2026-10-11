/**
 * texts.js —— 全部文案
 * SCENES 以节点 id 为键，map.js 把 name / ascii / altAscii / desc / options 展开到节点上。
 * 选项只写“文字 + 代价 + 生命周期标记”，handler 由 main.js 按 节点id + 序号 挂上。
 */

export const UI = {
  pageTitle: 'NightWander',

  panel: { inventory: '物品栏', map: '地图', scene: '画面', status: '状态栏', terminal: '终端' },
  theme: { toDark: '深色模式', toLight: '浅色模式' },

  status: {
    day: (day) => `第${day}天`,
    stamina: (cur, max) => `体力 ${cur}/${max}`,
    battery: (battery) => `电量 ${Math.floor(battery)}%`,
    time: (t) => `时间 ${t}`,
  },

  inventory: {
    count: (used, total, full) => `${used}/${total}${full ? ' 已满' : ''}`,
    full: '已满',
    slots: '装备槽',
    local: '当地物品',
    storage: '储物箱',
    pocket: '口袋',
    sources: (list) => list.map((s) => `${s.name} ${s.count}`).join(' / '),
    empty: '（空）',
    emptySlot: '空',
  },
  slotName: { hand: '手持', torso: '上身', legs: '下身', back: '背部' },

  /* 安全屋专属选项（由 main.js 插到选项列表最前） */
  shelter: {
    overnight: '过夜（进入下一天）',
    stay: '稍作停留',
    stayReply: '你在安全屋里坐下，把身上的东西一件件理了理。夜还长。',
  },
  notHere: '你现在不在这里。',
  backToWorld: '返回大地图',
  backToArea: '返回区域地图',
  /* 移动横幅：10 个 = + 空格 + 地点一 + 空格 + --> + 地点二 + 空格 + 10 个 = ／ 第二行是耗时 */
    moved: (from, to) => `${'='.repeat(10)} ${from} -->${to} ${'='.repeat(10)}`,
  timeCost: (sec) => `耗时：${sec}`,
  mapHere: '你在这里',
  exhausted: '你感到筋疲力尽。',
  tipDuration: (d) => `预计耗时 ${d}`,
  tipArrival: (t) => `到达时间 ${t}`,
  /* 没电时的悬浮提示：只此一行，不给耗时/到达时间（普通可点节点用这句） */
  tipNoBattery: '没电了，预测不了时间。',
  /* 没电 + 目标是黑暗地点：那种地方压根进不去，所以单独一句（判断要排在 tipNoBattery 之前） */
  tipDarkBlocked: '因为没电了，进不去。',
  /* 黑暗地点 / 黑暗区域在地图上的小标签（节点名下方 / 区域名下方） */
  mapDarkTag: '[黑暗]',
  /* 大地图区域通道的小标签：把这条通道靠哪些共享节点连起来说清楚 */
  mapRegionLink: (names) => names.join(' ↔ '),

  terminalPlaceholder: '输入序号或命令后回车',
  echo: (input) => `> ${input}`,
  arrived: (name) => `========== 已经到达 ${name} ==========`,
  prompt: '你要做什么？',
  optionLine: (buttons) => buttons.map((b) => `[${b.index}] ${b.option.text}`).join('  '),
  unknownCommand: '未知的命令',
  noOptionToRun: '当前没有可执行的选项',
  optionNoRequirement: '当前无法使用',

  /* 拾取（整理物品式弹窗） */
  pickupTitle: '发现物品',
  pickupDesc: '地上散着几样东西。要拿哪一件？',
  pickupTakeAll: '带走拿得下的',
  pickupSkipAll: '全部放弃',
  pickupLater: '稍后处理',

  /* mustResolve 弹窗 */
  mustResolveNothing: '这里似乎没什么可做的。',

  /* 区域切换 */
  cannotGoDirectly: '你无法直接前往那里，需要走陆路。',
  notOnTheWay: '你不在通往那里的路上。',
  /* v1.9.0b1：通往「还没落地」的区域（荒野 / 工业区 / 东海岸 / 码头 / 孤岛）时的提示。
     这些区域在区域表里占位、白线也画出来了，但节点表是空的，走不过去。 */
  roadNotOpen: '前面的路还没通。',
  areaSwitched: (name) => `你换到了${name}这一侧。`,

  gotItem: (name) => `获得物品：${name}`,
  inspect: (name, desc) => `你查看 ${name}：${desc}`,
  takeEquip: (name) => `你穿上了${name}。`,
  takePocket: (name) => `你把${name}放进了口袋。`,
  toHand: (name) => `你把${name}拿在了手里。`,
  toPocket: (name) => `你把${name}收进了口袋。`,
  unequip: (name) => `你脱下了${name}。`,
  backToStorage: (name) => `你把${name}放回了储物箱。`,
  /* 野外丢弃：物品旁的入口按钮文字 + 丢弃结果文案（不消耗时间，之后还能捡回来） */
  dropItem: '丢弃',
  dropped: (name) => `你把${name}丢在了地上。`,
  dropHint: (name) => `把${name}丢在当前地点，不消耗时间，之后还能捡回来`,

  farAway: '那里太远了，你还不认识路。',
  mustResolveFirst: '你需要先在这里做出决定。',
  noStamina: '你太累了，无法继续前进。',
  noBattery: '电量不足。',
  nightHome: '天亮了，你不得不回家。',
  collapse: '你精疲力尽，倒在了路边……',
  /* 黑暗地点电量归零：强制送回 home 并结算，但不扣体力上限（区别于体力归零的 collapse） */
  darkCollapse: '你在黑暗中失去了意识……',
  gameOverStamina: '你已经精疲力尽，再也走不动了。游戏结束。',
  storageFull: '储物箱满了。',
  pocketTooSmall: '你的口袋装不下这么多东西。',
  noRoom: '没有空间了',
  /* v1.9.0b1：foundLighthouse / crossRegionWalk / foundJourneyEnd 三条已删除 ——
     它们描述的「传说灯塔」「南门石柱」「旅者之石」在旧地图里，节点全没了，
     引用也只存在于被删掉的终点判定里，留着只会误导。
     终局的灯塔文案等 b4 把码头落地后再写。 */

  exportSave: '导出存档',
  importSave: '导入存档',
  saveTitle: '存档数据（Base64）',
  saveImported: '存档已导入。',
  saveInvalid: '存档无效',
  saveTooOld: '存档版本过旧，无法加载',
  saveConfirm: '导入会覆盖当前进度，确定继续吗？',
  copy: '复制到剪贴板',
  copied: '已复制到剪贴板。',
  copyFailed: '复制失败：请在上方文本框里手动选中复制。',
  close: '关闭',
  ok: '确定导入',
  cancel: '取消',

  discardTitle: '口袋满了，选一件丢掉，或者放弃拾取',
  discardCancel: '放弃拾取',

  /* 随机事件弹窗（与 mustResolve 一样：只有选项按钮，必须选一个才能继续） */
  eventTitle: '突发事件',
  /* 选完之后的「结果弹窗」：只一个按钮；里面放【效果文本】（系统信息，不是叙事） */
  eventResultTitle: '结果',
  eventContinue: '继续',
  /* B 类「无效果」选项在结果弹窗里的固定文案 */
  eventNoChange: '无变化',
};

/**
 * 随机事件池的文案。
 * 逻辑（哪个选项改什么）写在 js/events.js 的 EFFECTS，这里只放字 ——
 * 与 map.js 的 defNode() 从 SCENES 取文案是同一套分工。
 *
 * 每个事件（三个数组都按下标与 options 一一对应）：
 *   desc        —— 描述。**双出**：触发时进终端（叙事流），同时显示在选择弹窗里
 *   options     —— 两个选项的按钮文字
 *   effectTexts —— 【结果弹窗】文本：系统信息、玩家得失，非描述性（如「体力 -1」）
 *   narrates    —— 【终端】文本：描述性叙事，选完之后补进叙事流
 *   hoverTexts  —— 悬浮提示（只有 hover 开关打开时用作按钮 title）
 *
 * 输出分工：终端 = 叙事流（desc + narrate）；结果弹窗 = 系统信息（effectText）；
 * 终端既不输出选项名，也不输出效果文本。
 */
export const EVENTS = {
  coin_purse: {
    desc: '路边有个钱包，看起来是别人掉落的。',
    options: ['捡起来看看', '放回原处'],
    effectTexts: ['获得 1 件物品', '无变化'],
    narrates: ['你翻开钱包，里面已经没什么现金，但夹层里掉出一样东西。', '你把钱包放回原处，继续赶路。'],
    hoverTexts: ['查看：当前节点获得 1 件物品', '什么也不做'],
  },
  slip: {
    desc: '地面湿滑，你差点摔倒。',
    options: ['强行稳住', '顺势蹲下休息'],
    effectTexts: ['体力 -1', '时间 +180 秒'],
    narrates: ['你勉强稳住身形，膝盖却磕得生疼。', '你蹲下缓了一会儿，才重新站起来。'],
    hoverTexts: ['强行稳住：体力 -1', '蹲下休息：时间 +180 秒'],
  },
  vending: {
    desc: '路边有个自动售货机，还亮着灯。',
    options: ['投币试试', '无视'],
    effectTexts: ['电量 -5% / 获得 1 件物品', '无变化'],
    narrates: ['售货机嗡了一声，吐出一件东西，屏幕也暗了几分。', '你没有理会，径直走过。'],
    hoverTexts: ['投币：电量 -5%，获得物品', '什么也不做'],
  },
  flicker: {
    desc: '头顶路灯突然剧烈闪烁，电流不稳。',
    options: ['快步走开', '原地等它稳定'],
    effectTexts: ['电量 -3%', '电量 -8% / 时间 +180 秒'],
    narrates: ['你加快脚步离开，手电被闪得忽明忽暗。', '你站在原地等它稳定，灯没稳，电量先掉了一截。'],
    hoverTexts: ['快步走开：电量 -3%', '原地等待：电量 -8%，时间 +180 秒'],
  },
  lost: {
    desc: '你意识到自己走错了方向。',
    options: ['原路返回', '硬着头皮往前'],
    effectTexts: ['时间 +180 秒', '时间 +300 秒 / 体力 -1'],
    narrates: ['你沿原路折返，多花了一些时间。', '你硬着头皮往前，绕了更远的路，也耗了不少力气。'],
    hoverTexts: ['原路返回：时间 +180 秒', '硬着头皮往前：时间 +300 秒，体力 -1'],
  },
};

/* 物品：slot 可装备槽位，pockets 提供口袋格数
   v1.9.0b1 精简后的物品表：
     删除 flashlight / torch / oldmap / compass / darkshard
     改 coat 3→1、jeans 2→1 格
     新增 cannedfood（普通随身物品，使用效果在 c 块实现）
   容量口径：手持保底 1 + 大衣 1 + 牛仔裤 1 = 起步 3 格
            （c 块加挎包 +2 = 5，加大背包 +4 = 7） */
export const ITEMS = {
  coat: { id: 'coat', name: '大衣', desc: '厚呢大衣，内衬缝着一个深口袋。', slot: 'torso', pockets: 1 },
  jeans: { id: 'jeans', name: '牛仔裤', desc: '磨旧的牛仔裤，一个后袋还能用。', slot: 'legs', pockets: 1 },
  pocketwatch: { id: 'pocketwatch', name: '怀表', desc: '一块黄铜壳的旧怀表，走时还算准。', slot: null, pockets: 0 },
  cannedfood: { id: 'cannedfood', name: '罐头', desc: '一个还能吃的罐头。', slot: null, pockets: 0 },
};

/* ===============================================================
   家储物箱里可反复阅读的两份文档
   ---------------------------------------------------------------
   **不是物品**：不占储物箱容量、不可拾取、不进背包 / 装备槽，
   也不写进存档（state.js 里根本没有它们，快照因此一个字都不变）。
   body 按段落拆成数组，由 terminal.logLines() 一段一行输出。
   =============================================================== */

export const DIARY_TEXT = [
  '……他说最东最东的灯塔顶端有我要的解药。到那边的路可不好走。行动的时候最好沿着大路，也就是地图上的白线走最方便。',
  '路上有很多能休息的地方，但是要给手机充电恐怕不方便，我该在家里把电充满再出发。',
  '还有这该死的太阳。六点日出之前一定要到达下一个休息处，身体会晒坏的。',
  '我好担心手机会没电。那样就看不了时间，地图也用不了导航也会失灵。',
];

export const README_TEXT = [
  '你好，我是maihaoren。这是游戏夜游者的一个早期demo，文本内容都是ai生成的，非正式的。游玩流程是完整的。游戏流程从家出发，走区域里的各个地点最终目标是到达码头的灯塔地点。',
  '这个游戏是关于资源管理和规划的，如你所见，主要的资源就是体力和电力（我才不会告诉你时间也是需要关注的资源呢！（不过现在时间成本可能不够高来制造管理的紧张感。））',
  '如果你卡关了，你总能直接回到家重置一切资源，然后再重新来过。如果实在太难，可以在终端输入/help作弊',
  '这个游戏现在这个版本主要是测试一些ui，交互体验之类的。',
];

/** 两份文档的名称 / 简短描述（形态对齐物品，但不是 ITEMS 成员，所以永远捡不起来） */
export const DOCUMENTS = [
  { id: 'diary', name: '日记', desc: '一本翻旧了的日记。', body: DIARY_TEXT },
  { id: 'readme', name: '作者留言', desc: '一张夹在盒子里的纸。', body: README_TEXT },
];

/* 保留原有 ASCII 画面（v1.9.0b1 只留「家」这一处；其余地点暂无画面） */
const HOME_ASCII = `     __                     __                     __
    /  \\                   /  \\                   /  \\
   /    \\                 /    \\                 /    \\
  /______\\_______________/______\\_______________/______\\______
  |  __  |       []      |  __  |       []      |  __  |      |
  | |  | |               | |  | |               | |  | |      |
  |_|__|_|_______________|_|__|_|_______________|_|__|_|______|
      ||                     ||                     ||
  ____||_____________________||_____________________||________
 |____________________________________________________________|
   ~~~~  ~~~~  ~~~~  ~~~~  ~~~~  ~~~~  ~~~~  ~~~~  ~~~~  ~~~~
   ,,,,  ,,,,  ,,,,  ,,,,  ,,,,  ,,,,  ,,,,  ,,,,  ,,,,  ,,,,`;

/* ===============================================================
   地点：v1.9.0b1 落地「巨墙」与「废城」两个区域（26 个节点）
   ---------------------------------------------------------------
   每个节点只写 name + desc（+ 可选 ascii）—— 文案一律来自这里，
   坐标 / items / dark / 共享关系全部写在 map.js。
   其余 5 个区域（荒野 / 工业区 / 东海岸 / 码头 / 孤岛）本块只是区域表里的占位，
   节点表为空，因此这里没有任何它们的文案，等 b2 / b3 / b4 补。
   注意：共享节点（墙门 / 北关 / 东关 / 南关）只有【一份】文案，
   两个区域里看到的是同一段话。
   =============================================================== */
export const SCENES = {

  /* ================= 巨墙 giantwall ================= */

  /* wallgate 是巨墙 ↔ 废城的共享节点，也是巨墙的主安全屋 */
  wallgate: {
    name: '墙门',
    desc: '一扇嵌在巨墙里的铁门，门轴锈得发红，门缝里透不出光。墙太高了，抬头看不到顶。',
  },
  /* 墙根：到达时终端输出就是这段 desc（需求原文，一字未改），无任何其他交互 */
  wallfoot: {
    name: '墙根',
    desc: '自从大爆炸后他们就建立了这堵墙，到现在已经矗立了十几年了。',
  },

  /* ================= 废城 wasteland ================= */

  home: {
    name: '家',
    desc: '一间勉强还算完整的屋子，窗台上摆着昨天捡回来的石头。你已经在这里住了很久，今晚还要再走一趟。',
    ascii: HOME_ASCII,
  },

  /* ---- 接口节点（共享；其余三个通向尚未落地的区域） ---- */
  northgate: {
    name: '北关',
    desc: '城市的北缘。柏油路在这里断掉，再往前就是一片没有灯的地方。',
  },
  eastgate: {
    name: '东关',
    desc: '往东出城的路口，路牌被人拆走了一半。风里有很淡的海腥味。',
  },
  southgate: {
    name: '南关',
    desc: '南边的出城口，铁门半开着。风从低处刮上来，带着机油味。',
  },

  /* ---- 19 个普通地点 ---- */
  plaza: {
    name: '废墟广场',
    desc: '广场中间立着一座没有头的雕像，地砖缝里长满了枯草。',
  },
  apartment: {
    name: '倒塌公寓',
    desc: '整栋楼塌了一半，露出来的房间还保持着原来的样子。',
  },
  gasstation: {
    name: '废弃加油站',
    desc: '两台加油机锈死在原地，油枪垂着。价目牌上的数字已经看不清了。',
  },
  hospital: {
    name: '旧医院',
    desc: '门诊大厅的椅子还排着队，挂号窗口后面是黑的。',
  },
  brokenbridge: {
    name: '断桥',
    desc: '桥面从中间塌下去，断口里长满了枯草。桥下的河床是干的。',
  },
  sewer: {
    name: '下水道口',
    desc: '一个掀开的井盖，下面传来很轻的水声。梯子还在。',
  },
  station: {
    name: '废车站',
    desc: '站台上的顶棚塌了一角，时刻表停在同一行上。铁轨上没有人。',
  },
  school: {
    name: '学校废墟',
    desc: '教室的桌椅还排得整整齐齐，黑板上留着一行没擦干净的字。',
  },
  library: {
    name: '图书馆废墟',
    desc: '书架全倒了，纸页被风吹得满地都是，踩上去沙沙响。',
  },
  church: {
    name: '教堂废墟',
    desc: '烧过的教堂只剩下石墙和窗框。月光从窗框里整片地照进来。',
  },
  factoryold: {
    name: '工厂旧址',
    desc: '厂房的门敞着，里面能看见几台拆了一半的机器。',
  },
  warehouse: {
    name: '旧仓库',
    desc: '仓库的卷帘门开着一半。里面码着木箱，箱板上的字已经看不清了。',
  },
  subway: {
    name: '地铁口',
    desc: '下行扶梯停了，楼梯一直通到看不见的地方。下面有风。',
  },
  park: {
    name: '街心公园',
    desc: '公园里的树全死了，枝干还保持着张开的样子。长椅的坐板裂了缝。',
  },
  parking: {
    name: '地下停车场',
    desc: '坡道一直往下，入口的横杆断成两截。里面一盏灯都没亮。',
  },
  watertower: {
    name: '水塔',
    desc: '铁梯一直通到塔顶。塔身敲上去是空的，回声很闷。',
  },
  substation: {
    name: '变电所',
    desc: '围栏里的变压器全哑了，瓷瓶上落着一层灰。',
  },
  dump: {
    name: '垃圾场',
    desc: '整片空地堆着烧过的杂物，风一吹就翻起灰。',
  },
  mall: {
    name: '商业街废墟',
    desc: '两排店铺全空了，招牌褪成了白色。玻璃门大开着。',
  },
};
