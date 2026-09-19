/**
 * 極簡事件發送器。UI 層透過 on()/off() 訂閱，核心邏輯不直接碰 DOM。
 */
export class Emitter {
  #handlers = new Map();

  on(event, handler) {
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(handler);
    return () => this.off(event, handler); // 回傳 unsubscribe，方便 UI 元件卸載時清理
  }

  once(event, handler) {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off(event, handler) {
    const set = this.#handlers.get(event);
    if (!set) return;
    if (handler) set.delete(handler);
    else set.clear();
    if (set.size === 0) this.#handlers.delete(event);
  }

  emit(event, payload) {
    const set = this.#handlers.get(event);
    if (!set) return;
    // 複製一份，避免 handler 內部呼叫 off() 造成迭代錯亂
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        // 單一訂閱者出錯不應中斷整條事件鏈
        console.error(`[emitter] handler for "${event}" threw:`, err);
      }
    }
  }

  removeAll() {
    this.#handlers.clear();
  }
}
