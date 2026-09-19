import { Emitter } from './emitter.js';

/**
 * 整個互動流程的狀態。UI 只要對著這幾個狀態畫畫面即可。
 *
 *   idle ──connect()──▶ connecting ──▶ ready ──start()──▶ listening ──▶ recording
 *                           │                                              │
 *                           ▼                                              ▼
 *                         error ◀──────────────────────────────────── analyzing
 *                                                                          │
 *                                                                          ▼
 *                                                                       result
 */
export const State = {
  IDLE: 'idle',             // 還沒要權限，等使用者按下開始
  CONNECTING: 'connecting', // 正在要權限／開麥克風
  READY: 'ready',           // 麥克風已就緒，等待使用者觸發錄音
  LISTENING: 'listening',   // 已開始監聽，但還沒偵測到聲音（VAD 等待中）
  RECORDING: 'recording',   // 正在收音
  ANALYZING: 'analyzing',   // 特徵抽取與比對中
  RESULT: 'result',         // 有比對結果
  ERROR: 'error',
};

const TRANSITIONS = {
  [State.IDLE]: [State.CONNECTING, State.ERROR],
  [State.CONNECTING]: [State.READY, State.ERROR, State.IDLE],
  [State.READY]: [State.LISTENING, State.RECORDING, State.CONNECTING, State.IDLE, State.ERROR],
  [State.LISTENING]: [State.RECORDING, State.ANALYZING, State.READY, State.ERROR, State.IDLE],
  [State.RECORDING]: [State.ANALYZING, State.READY, State.ERROR, State.IDLE],
  [State.ANALYZING]: [State.RESULT, State.READY, State.ERROR, State.IDLE],
  [State.RESULT]: [State.READY, State.LISTENING, State.RECORDING, State.IDLE, State.ERROR],
  [State.ERROR]: [State.IDLE, State.CONNECTING, State.READY],
};

export class StateMachine extends Emitter {
  #state = State.IDLE;
  #context = {};

  get state() {
    return this.#state;
  }

  get context() {
    return { ...this.#context };
  }

  can(next) {
    return TRANSITIONS[this.#state]?.includes(next) ?? false;
  }

  /**
   * @param {string} next 目標狀態
   * @param {object} [context] 附帶資料（error、result 等），會併進 context 供 UI 讀取
   * @returns {boolean} 是否真的轉換了
   */
  to(next, context = {}) {
    if (next === this.#state) {
      // 同狀態更新 context（例如 recording 中更新 elapsed），不發 state 事件
      this.#context = { ...this.#context, ...context };
      return false;
    }
    if (!this.can(next)) {
      console.warn(`[state] 忽略不合法的轉換 ${this.#state} → ${next}`);
      return false;
    }
    const from = this.#state;
    this.#state = next;
    this.#context = { ...context };
    this.emit('state', { from, to: next, context: this.context });
    return true;
  }

  reset() {
    const from = this.#state;
    this.#state = State.IDLE;
    this.#context = {};
    if (from !== State.IDLE) {
      this.emit('state', { from, to: State.IDLE, context: {} });
    }
  }
}
