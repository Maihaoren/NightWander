/**
 * terminal.js —— 终端面板
 * 只负责日志、输入、按钮行与弹窗：不判断游戏规则。
 * 日志一律入队，逐条消费（间隔 150~300ms），不直接写 DOM。
 */

import { UI } from './texts.js';
import { getAllCommandNames } from './debug.js';
import { TERMINAL_HISTORY_MAX } from './config.js';

const MIN_DELAY = 150;
const MAX_DELAY = 300;

const els = { output: null, form: null, input: null, buttons: null, modal: null };
const queue = [];
let draining = false;
let drainTimer = null;
let onSubmit = null;
let onSelect = null;
let locked = false;
let lastButtons = [];                              /* 上一次渲染出的按钮，Tab 补全用 */
const history = [];                                /* 玩家手动提交过的输入 */
let historyCursor = 0;                             /* 指向“当前新输入”的位置（数组末尾之后） */

/* Tab 补全的循环状态：候选列表 / 当前下标 / 上次补全后的输入快照 */
const completion = { candidates: [], cursor: -1, lastInputSnapshot: '' };

export function initTerminal(handlers = {}) {
  els.output = document.getElementById('term-output');
  els.form = document.getElementById('term-form');
  els.input = document.getElementById('term-input');
  els.buttons = document.getElementById('term-buttons');
  els.modal = document.getElementById('modal-root');

  onSubmit = typeof handlers.onSubmit === 'function' ? handlers.onSubmit : null;
  if (els.input) {
    els.input.placeholder = UI.terminalPlaceholder;
    els.input.addEventListener('keydown', handleKeydown);
    els.input.addEventListener('blur', resetCompletion);
  }

  if (els.form) {
    els.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = els.input ? els.input.value : '';
      if (els.input) els.input.value = '';
      handleCommand(value);
    });
  }
}

/* ---------------- 输出队列 ---------------- */

export function log(text, className) {
  queue.push({ text: String(text ?? ''), className: className || '' });
  drain();
}

export function logLines(lines) {
  const list = Array.isArray(lines) ? lines : [lines];
  for (const line of list) queue.push({ text: String(line ?? ''), className: '' });
  drain();
}

export function clearQueue() {
  queue.length = 0;
  /* 连排队中的下一条也取消，否则紧接着 log() 的那行会被后面的 clearQueue() 丢掉 */
  if (drainTimer !== null) {
    window.clearTimeout(drainTimer);
    drainTimer = null;
  }
  draining = false;
}

function drain() {
  if (draining || queue.length === 0) return;

  draining = true;
  writeLine(queue.shift());

  drainTimer = window.setTimeout(() => {
    drainTimer = null;
    draining = false;
    drain();
  }, MIN_DELAY + Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)));
}

function writeLine(entry) {
  if (!els.output) return;

  const { text, className } = typeof entry === 'string' ? { text: entry, className: '' } : entry;
  const safe = escapeHtml(text);

  const line = document.createElement('div');
  line.className = 'term-line terminal-line' + (className ? ' ' + className : '');

  /* 只有到达消息用斜体、选项列表用粗体；其余一律纯文本（已转义） */
  if (className === 'arrival') line.innerHTML = '<em>' + safe + '</em>';
  else if (className === 'options') line.innerHTML = '<strong>' + safe + '</strong>';
  else line.innerHTML = safe;

  els.output.appendChild(line);
  els.output.scrollTop = els.output.scrollHeight;
}

/** 转义 & < > " ' 五个字符，避免日志内容（含玩家输入）注入 HTML */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------------- 按钮行 ---------------- */

/**
 * 1) 有 group 且该 group 已选过、本项非被选中 → disabled
 * 2) 无 group、非 repeatable、已用过 → disabled
 * 3) 否则可点
 */
export function visibleOptions(options, usedSet, usedGroups) {
  const used = usedSet instanceof Set ? usedSet : new Set(usedSet || []);
  const groups = usedGroups instanceof Set ? usedGroups : new Set(usedGroups || []);

  /* 已用的一次性选项（无 group、非 repeatable）直接不渲染；
     group 已选过 → 保留但变暗；requires 不满足 → 保留、变暗并带 hover 提示 */
  const fullIndexOf = (option, i) => (option.fullIndex !== undefined ? option.fullIndex : i + 1);

  const kept = options.filter((option, i) => {
    const isUsed = used.has(fullIndexOf(option, i));
    if (option.group) return true;
    if (option.requirementMet === false) return true;
    return option.repeatable || !isUsed;
  });

  return kept.map((option, i) => {
    const isUsed = used.has(fullIndexOf(option, i));
    const byRequirement = option.requirementMet === false;
    return {
      index: i + 1,
      option,
      disabled: byRequirement || (Boolean(option.group) && groups.has(option.group) && !isUsed),
      disabledByRequirement: byRequirement,
    };
  });
}

export function renderButtons(options, usedSet, usedGroups, onSelect_) {
  const buttons = visibleOptions(options, usedSet, usedGroups);
  lastButtons = buttons;
  onSelect = typeof onSelect_ === 'function' ? onSelect_ : null;
  if (!els.buttons) return buttons;

  els.buttons.textContent = '';
  for (const button of buttons) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'term-button';
    el.textContent = `[${button.index}] ${button.option.text}`;

    if (button.disabled) {
      el.disabled = true;
      if (button.disabledByRequirement) {
        el.classList.add('disabled-requirement');
        el.title = button.option.requiresHint || '当前无法使用';
      } else {
        el.classList.add('used');
      }
    } else {
      el.addEventListener('click', () => {
        if (onSelect) onSelect(button.index);
      });
    }
    els.buttons.appendChild(el);
  }
  return buttons;
}

/* ---------------- 输入 ---------------- */

export function handleCommand(input) {
  const text = String(input ?? '').trim();
  if (!text || locked) return;

  remember(text);
  resetCompletion();                              /* 回车提交后清掉 Tab 补全状态 */
  if (!/^\d+$/.test(text)) log(UI.echo(text));   /* 数字交由 main 回显“> 选项文本” */
  if (onSubmit) onSubmit(text);
}

/* ---------------- 历史与 Tab 补全 ---------------- */

function remember(text) {
  if (history[history.length - 1] === text) { historyCursor = history.length; return; }
  history.push(text);
  if (history.length > TERMINAL_HISTORY_MAX) history.shift();
  historyCursor = history.length;
}

function handleKeydown(event) {
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (historyCursor > 0) {
      historyCursor -= 1;
      els.input.value = history[historyCursor];
    }
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (historyCursor < history.length - 1) {
      historyCursor += 1;
      els.input.value = history[historyCursor];
    } else {
      historyCursor = history.length;
      els.input.value = '';            /* 越过最新一条 → 回到新输入 */
    }
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    complete();
  }
}

function complete() {
  const value = els.input.value;

  /* 玩家手动改过输入 → 候选重新计算、下标归零 */
  if (value !== completion.lastInputSnapshot) {
    completion.candidates = buildCandidates(value);
    completion.cursor = -1;
  }
  if (completion.candidates.length === 0) return;

  /* 每次按 Tab 切到下一个候选，到底后循环 */
  completion.cursor = (completion.cursor + 1) % completion.candidates.length;
  const picked = completion.candidates[completion.cursor];
  els.input.value = picked;
  completion.lastInputSnapshot = picked;
}

/** 候选："/" 开头 → 指令名前缀匹配；纯数字或空 → 当前可点按钮编号 */
function buildCandidates(value) {
  if (value.startsWith('/')) {
    const lower = value.toLowerCase();
    return getAllCommandNames().filter((n) => ('/' + n).startsWith(lower)).map((n) => '/' + n + ' ');
  }
  if (value.trim() === '' || /^\d+$/.test(value.trim())) {
    return lastButtons.filter((b) => !b.disabled).map((b) => String(b.index));
  }
  return [];
}

/** 提交或失焦后清掉补全状态 */
function resetCompletion() {
  completion.candidates = [];
  completion.cursor = -1;
  completion.lastInputSnapshot = '';
}

/** 锁住输入（游戏结束时由 main.js 调用） */
export function setLocked(value) {
  locked = Boolean(value);
  if (els.input) els.input.disabled = locked;
}

export function focusInput() {
  if (els.input && !locked) els.input.focus();
}

/* ---------------- 弹窗 ---------------- */

/**
 * @param {{title?: string, text?: string, input?: {placeholder?: string, value?: string, readOnly?: boolean},
 *          actions: Array<{label: string, value?: any}>}} config
 * @returns {Promise<any>} 点按钮 resolve 该按钮的 value（无 value 时返回输入框内容或按钮文字）
 */
export function showModal(config = {}) {
  return new Promise((resolve) => {
    if (!els.modal) {
      resolve(null);
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal';
    const box = document.createElement('div');
    box.className = 'modal__box';

    if (config.title) {
      const title = document.createElement('div');
      title.className = 'modal__title';
      title.textContent = config.title;
      box.appendChild(title);
    }

    if (config.text) {
      const body = document.createElement('div');
      body.className = 'modal__body';
      body.textContent = config.text;
      box.appendChild(body);
    }

    let field = null;
    if (config.input) {
      field = document.createElement('textarea');
      field.className = 'modal__input';
      field.rows = 5;
      field.spellcheck = false;
      field.placeholder = config.input.placeholder || '';
      if (config.input.value) field.value = config.input.value;
      if (config.input.readOnly) field.readOnly = true;
      box.appendChild(field);
    }

    const actions = document.createElement('div');
    actions.className = 'modal__actions';
    const close = (value) => {
      overlay.remove();
      resolve(value);
    };

    for (const action of config.actions || []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'term-button';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        close(Object.prototype.hasOwnProperty.call(action, 'value')
          ? action.value
          : (field ? field.value : action.label));
      });
      actions.appendChild(button);
    }
    box.appendChild(actions);

    overlay.appendChild(box);
    els.modal.textContent = '';
    els.modal.appendChild(overlay);
    els.modal.hidden = false;

    if (field) field.focus();
  });
}

export function closeModal() {
  if (!els.modal) return;
  els.modal.textContent = '';
  els.modal.hidden = true;
}

/** 复制到剪贴板；不可用时退回到选中文本框让玩家自己复制 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    const field = els.modal ? els.modal.querySelector('.modal__input') : null;
    if (field) {
      field.focus();
      field.select();
    }
    return false;
  }
}

