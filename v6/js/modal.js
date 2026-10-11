/**
 * modal.js —— 通用模态（覆盖地图区）
 *
 * 只负责把「标题 + 说明 + 物品列表 + 底部按钮」画出来，
 * 并把玩家的点击结果以 { type, ... } 的形式 resolve 出去；不判断任何游戏规则。
 * 文案全部由调用方从 texts.js 传进来。
 *
 * 用法：
 *   const r = await showModal({
 *     title: '发现物品',
 *     desc: '地上散着几样东西。',
 *     items:   [{ id: 'flashlight', text: '手电筒', hint: '占 1 格' }],
 *     actions: [{ text: '全部放弃', value: 'skipAll' }],
 *   });
 *   r = { type: 'item', id } | { type: 'action', value }
 */

let active = null;

/** 当前是否有模态开着 */
export function isModalOpen() {
  return Boolean(active);
}

/** 遮罩要盖住的地方：地图面板；找不到就退化为整页 */
function mountPoint() {
  return document.querySelector('.panel--map') || document.body;
}

/** 主动关掉当前模态；result 会作为 showModal 的返回值 */
export function closeModal(result = null) {
  if (!active) return false;
  const { overlay, resolve } = active;
  active = null;
  overlay.remove();
  resolve(result);
  return true;
}

/**
 * 打开一个模态。
 * @returns {Promise<{type:'item', id:any} | {type:'action', value:any} | null>}
 *   点了物品 → { type:'item', id }
 *   点了底部按钮 → { type:'action', value }
 *   被 closeModal 掉 → 传入的 result（默认 null）
 *
 * 特性：
 *   - 半透明遮罩覆盖地图区
 *   - 遮罩本身不绑 click，所以点遮罩不会关闭
 *   - 按钮复用终端的 .term-button 样式
 *   - 同一时刻只允许一个模态；若已有模态开着，先把它关掉（其 Promise 得到 null）
 */
export function showModal({ title, desc, items = [], actions = [] } = {}) {
  if (active) closeModal(null);

  const mount = mountPoint();

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'map-modal';

    const box = document.createElement('div');
    box.className = 'map-modal__box';

    const settle = (result) => {
      if (!active || active.overlay !== overlay) return;
      active = null;
      overlay.remove();
      resolve(result);
    };

    /* v1.9.0b2.1 改动 7：标题为空时不再画那一行（资源交换弹窗故意不显示标题，
       原来会留一条空白标题栏）。传了 title 的弹窗行为完全不变。 */
    if (title) {
      const head = document.createElement('div');
      head.className = 'map-modal__title';
      head.textContent = String(title);
      box.appendChild(head);
    }

    if (desc) {
      const text = document.createElement('div');
      text.className = 'map-modal__desc';
      text.textContent = String(desc);
      box.appendChild(text);
    }

    if (items.length) {
      const list = document.createElement('div');
      list.className = 'map-modal__list';
      for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'term-button map-modal__item';
        button.textContent = String(item.text ?? '');
        if (item.hint) button.title = String(item.hint);

        if (item.disabled) {
          button.disabled = true;
          button.classList.add('used');
        } else {
          button.addEventListener('click', () => settle({ type: 'item', id: item.id }));
        }
        list.appendChild(button);
      }
      box.appendChild(list);
    }

    if (actions.length) {
      const row = document.createElement('div');
      row.className = 'map-modal__actions';
      for (const action of actions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'term-button map-modal__action';
        button.textContent = String(action.text ?? '');
        button.addEventListener('click', () => settle({ type: 'action', value: action.value }));
        row.appendChild(button);
      }
      box.appendChild(row);
    }

    overlay.appendChild(box);
    /* 遮罩不绑 click：不可点击遮罩关闭 */
    mount.appendChild(overlay);
    active = { overlay, resolve };
  });
}
