/**
 * config.js —— 所有可调数值
 */

export const STAMINA_MAX_INIT = 10;      /* 初始体力上限 */
export const STAMINA_MIN = 1;            /* 体力上限下限：降到这个值就 gameOver */
export const BATTERY_MAX = 100;          /* 电量上限（也是每天在家节点过夜后的满电值）；不随时间衰减 */
/* 电量流逝（只削当前电量，上限恒为 BATTERY_MAX）：
   自然流逝 BATTERY_NATURAL_DRAIN_PER_HOUR 游戏内每小时
   + 身处黑暗地点时叠加 BATTERY_DARK_AREA_EXTRA_DRAIN_PER_HOUR
   跨天（天数 +1）时一次性扣 BATTERY_DAY_CHANGE_DRAIN */
export const BATTERY_NATURAL_DRAIN_PER_HOUR = 2;        /* 游戏内每小时自然流逝（百分点） */
export const BATTERY_DARK_AREA_EXTRA_DRAIN_PER_HOUR = 1;/* 黑暗地点额外流逝，叠加在自然流逝上 */
export const BATTERY_DAY_CHANGE_DRAIN = 5;              /* 跨天一次性扣除（百分点） */
export const STORAGE_CAPACITY = 20;      /* 储物箱初始容量 */
export const NIGHT_START_HOUR = 20;      /* 夜晚开始 20:00:00 */
export const NIGHT_DURATION_SEC = 36000; /* 一夜 10 小时 = 36000 游戏秒（到 06:00:00） */
export const TIME_SPEED = 1;             /* 1 游戏秒 = 1 现实秒（测试可调到 60） */
export const DEFAULT_TRAVEL_COST = 900;  /* 未定义边的默认移动耗时（15 分钟） */
export const FORCE_HOME_PENALTY = 1;     /* 强制回家：体力上限 -1 */
export const MOVE_STAMINA_COST = 1;      /* 每次移动消耗体力 */
export const TICK_INTERVAL_MS = 250;     /* 时间刷新频率（毫秒） */
export const DISTANCE_TO_TIME_RATIO = 3.0; /* 距离(逻辑单位)转秒数的系数 */
export const SECONDARY_ROAD_PENALTY = 1.4; /* 支路时间惩罚系数 */
export const CROSS_REGION_COST_SEC = 3600;   /* 跨区域移动耗时（1 小时） */
export const SHELTER_OVERNIGHT_COST_SEC = 0; /* 安全屋「过夜」耗时（0 = 立刻进入下一天） */
export const TERMINAL_HISTORY_MAX = 50;    /* 终端历史最多保存条数 */
export const EVENTS_DEFAULT = false;      /* 随机事件系统默认关闭（测试时用 /event on 打开） */
export const EVENT_CHANCE = 0.15;         /* 随机事件触发几率：每个触发点掷一次（0.15 = 15%） */
export const GAME_VERSION = 'v1.8.12';     /* 游戏版本号 */
export const DEBUG_CONSOLE = true;       /* 调试指令开关：true 时 "/" 开头的输入交给 js/debug.js */
