import { Emitter } from './core/emitter.js';
import { State, StateMachine } from './core/state-machine.js';
import { AppError, ErrorCode } from './core/errors.js';
import { mergeConfig } from './config.js';
import { MicDevice } from './audio/mic-device.js';
import { AudioEngine } from './audio/audio-engine.js';
import { VoiceActivityDetector } from './audio/vad.js';
import { extractFeatures } from './audio/features.js';
import { encodeWav } from './audio/wav.js';
import { Matcher } from './match/matcher.js';

/** VAD 觸發時往回保留的音訊長度，確保起音不被切掉 */
const PRE_ROLL_MS = 200;

/**
 * 互動主控。把「裝置連接 → 收音 → 特徵抽取 → 比對」串成一條流程，
 * 對外只暴露事件與少數幾個方法，UI 層完全不需要知道音訊細節。
 *
 * 最小用法：
 *   const app = createFoodVoiceMatcher();
 *   app.loadFoods(foods);
 *   app.on('state', ({to}) => render(to));
 *   app.on('result', ({matches}) => showResult(matches));
 *   button.onclick = () => app.connect().then(() => app.start());
 *
 * 事件一覽：
 *   'state'      {from, to, context}      狀態機轉換，UI 主要依據
 *   'level'      {rms, db, frequency, waveform}  即時音量／頻譜，畫視覺化用
 *   'vad'        {event, db, aboveFloorDb}  自動收音的偵測狀態
 *   'progress'   {elapsedMs, remainingMs, ratio}  錄音進度
 *   'result'     {matches, best, confident, features, audio}
 *   'devices'    {devices, activeDeviceId}
 *   'permission' {state}
 *   'interrupted'{muted}                  被來電／其他 App 搶走麥克風
 *   'error'      AppError
 */
export class FoodVoiceMatcher extends Emitter {
  #config;
  #machine;
  #mic;
  #engine;
  #vad;
  #matcher;
  #recordingStartedAt = 0;
  #maxDurationTimer = null;
  #progressTimer = null;
  #vadArmed = false;
  #destroyed = false;
  #boundVisibility = null;

  constructor(overrides = {}) {
    super();
    this.#config = mergeConfig(overrides);
    this.#machine = new StateMachine();
    this.#mic = new MicDevice(this.#config.audio);
    this.#engine = new AudioEngine(this.#config.audio);
    this.#vad = new VoiceActivityDetector(this.#config.vad);
    this.#matcher = new Matcher(this.#config.match);

    this.#wireInternalEvents();
  }

  get state() {
    return this.#machine.state;
  }

  get config() {
    return structuredClone(this.#config);
  }

  get support() {
    return MicDevice.checkSupport();
  }

  get isConnected() {
    return this.#mic.isOpen && this.#engine.isRunning;
  }

  #wireInternalEvents() {
    this.#machine.on('state', (payload) => this.emit('state', payload));

    this.#mic.on('devices', (p) => this.emit('devices', p));
    this.#mic.on('deviceschanged', (p) => this.emit('devices', p));
    this.#mic.on('permission', (p) => this.emit('permission', p));
    this.#mic.on('interrupted', (p) => this.emit('interrupted', p));
    this.#mic.on('lost', ({ reason }) => {
      this.#clearTimers();
      this.#fail(new AppError(ErrorCode.DEVICE_LOST, { detail: reason }));
    });

    this.#engine.on('level', (level) => {
      this.emit('level', level);
      this.#feedVad(level);
    });

    // 切回前景時 iOS 的 AudioContext 常常是 suspended，主動喚醒
    if (typeof document !== 'undefined') {
      this.#boundVisibility = () => {
        if (document.visibilityState === 'visible' && this.#mic.isOpen) {
          this.#engine.resume().catch(() => {
            // 沒有使用者手勢時會失敗，這是預期的；等下次使用者操作再恢復
          });
        }
      };
      document.addEventListener('visibilitychange', this.#boundVisibility);
    }
  }

  // ---------------------------------------------------------------- 資料

  /** 載入食物清單。可以在 connect() 之前或之後呼叫。 */
  loadFoods(foods) {
    const result = this.#matcher.load(foods);
    if (result.warnings.length && this.#config.debug) {
      console.warn('[foods] 資料警告：\n' + result.warnings.join('\n'));
    }
    return result;
  }

  setWeights(weights) {
    this.#matcher.setWeights(weights);
  }

  // ---------------------------------------------------------------- 裝置

  /**
   * 連接麥克風。**必須在使用者手勢（click / touchend）的同步呼叫鏈中觸發**，
   * 否則 Safari 與 iOS 會拒絕授權或讓 AudioContext 卡在 suspended。
   *
   * @param {string|null} deviceId 指定麥克風（iOS 不支援，會忽略）
   */
  async connect(deviceId = null) {
    if (this.#destroyed) throw new AppError(ErrorCode.UNKNOWN, { detail: '已銷毀' });

    const support = this.support;
    if (!support.supported) {
      const err = new AppError(support.issues[0], { detail: support.issues });
      this.#fail(err);
      throw err;
    }

    this.#machine.to(State.CONNECTING);
    try {
      const stream = await this.#mic.open(deviceId);
      await this.#engine.attach(stream);
      this.#machine.to(State.READY, {
        deviceId: this.#mic.deviceId,
        sampleRate: this.#engine.sampleRate,
      });
      return { deviceId: this.#mic.deviceId, sampleRate: this.#engine.sampleRate };
    } catch (err) {
      const appError = err instanceof AppError ? err : new AppError(ErrorCode.UNKNOWN, { cause: err });
      this.#fail(appError);
      throw appError;
    }
  }

  async listDevices() {
    return this.#mic.refreshDevices();
  }

  /** 切換麥克風。切換後需要重接音訊圖，這裡已處理。 */
  async switchDevice(deviceId) {
    if (this.state === State.RECORDING) this.cancel();
    const stream = await this.#mic.switchTo(deviceId);
    await this.#engine.attach(stream);
    this.#machine.to(State.READY, { deviceId: this.#mic.deviceId });
    return this.#mic.deviceId;
  }

  // ---------------------------------------------------------------- 錄音

  /**
   * 開始一輪收音。
   * VAD 開啟時會先進 listening 等使用者出聲，偵測到靜音就自動結束並比對；
   * VAD 關閉時立刻開始錄，必須自己呼叫 stop()。
   */
  async start() {
    if (!this.isConnected) {
      // 還沒連過或連線已斷（例如切回前景），自動重連一次
      await this.connect(this.#mic.deviceId);
    } else {
      await this.#engine.resume();
    }

    if (this.state === State.RECORDING || this.state === State.ANALYZING) return;

    this.#clearTimers();
    this.#engine.startCapture();
    this.#recordingStartedAt = performance.now();

    if (this.#config.vad.enabled) {
      this.#vad.reset();
      this.#vadArmed = true;
      this.#machine.to(State.LISTENING);
    } else {
      this.#vadArmed = false;
      this.#machine.to(State.RECORDING);
      this.#startProgress();
    }

    this.#maxDurationTimer = setTimeout(() => {
      if (this.state === State.RECORDING) this.stop();
      else if (this.state === State.LISTENING) this.#timeoutWaiting();
      // maxWaitMs 通常比 maxDurationMs 短，這裡是最後一道保險
    }, this.#config.recording.maxDurationMs + this.#config.vad.maxWaitMs);
  }

  #feedVad(level) {
    if (!this.#vadArmed) return;
    const result = this.#vad.push(level.db);
    this.emit('vad', result);

    switch (result.event) {
      case 'start':
        // 真正開始出聲才重新計時，前面等待的時間不算進錄音長度；
        // 已錄到的靜音也一併丟掉，只留 200ms pre-roll 保住起音瞬態
        this.#engine.trimCaptureToLast(PRE_ROLL_MS);
        this.#recordingStartedAt = performance.now();
        this.#machine.to(State.RECORDING, { noiseFloorDb: result.noiseFloorDb });
        this.#startProgress();
        break;
      case 'end':
        if (this.state === State.RECORDING) this.stop();
        break;
      case 'timeout':
        this.#timeoutWaiting();
        break;
      default:
        break;
    }
  }

  #timeoutWaiting() {
    this.#vadArmed = false;
    this.#clearTimers();
    this.#engine.stopCapture();
    this.#machine.to(State.READY, { reason: 'no-sound' });
    this.emit('timeout', { waitedMs: this.#config.vad.maxWaitMs });
  }

  #startProgress() {
    this.#stopProgress();
    const max = this.#config.recording.maxDurationMs;
    this.#progressTimer = setInterval(() => {
      const elapsedMs = performance.now() - this.#recordingStartedAt;
      this.emit('progress', {
        elapsedMs,
        remainingMs: Math.max(0, max - elapsedMs),
        ratio: Math.min(1, elapsedMs / max),
      });
      if (elapsedMs >= max) this.stop();
    }, 100);
  }

  #stopProgress() {
    if (this.#progressTimer) {
      clearInterval(this.#progressTimer);
      this.#progressTimer = null;
    }
  }

  /** 結束收音並執行比對。VAD 開啟時會自動被呼叫。 */
  async stop() {
    if (this.state !== State.RECORDING && this.state !== State.LISTENING) return null;

    this.#vadArmed = false;
    this.#clearTimers();
    const { samples, sampleRate } = this.#engine.stopCapture();
    const durationMs = (samples.length / sampleRate) * 1000;

    if (durationMs < this.#config.recording.minDurationMs) {
      this.#machine.to(State.READY, { reason: 'too-short' });
      const err = new AppError(ErrorCode.RECORDING_TOO_SHORT, { detail: { durationMs } });
      this.emit('error', err);
      return null;
    }

    this.#machine.to(State.ANALYZING, { durationMs });

    try {
      // 讓出一幀，確保 UI 有機會先畫出「分析中」再被特徵抽取的同步運算卡住
      await new Promise((resolve) => setTimeout(resolve, 0));

      const features = extractFeatures(samples, sampleRate);
      if (!features.meta.reliable) {
        this.#machine.to(State.READY, { reason: 'too-quiet' });
        const err = new AppError(ErrorCode.RECORDING_TOO_QUIET, { detail: features.meta });
        this.emit('error', err);
        return null;
      }

      const matchResult = this.#matcher.match(features.vector);
      const payload = {
        ...matchResult,
        features,
        audio: this.#config.recording.keepPlayback
          ? { blob: encodeWav(samples, sampleRate), durationMs, sampleRate }
          : null,
      };

      this.#machine.to(State.RESULT, { best: matchResult.best });
      this.emit('result', payload);
      return payload;
    } catch (err) {
      const appError = err instanceof AppError ? err : new AppError(ErrorCode.UNKNOWN, { cause: err });
      this.#fail(appError);
      return null;
    }
  }

  /** 中途放棄，不做比對。 */
  cancel() {
    this.#vadArmed = false;
    this.#clearTimers();
    this.#engine.stopCapture();
    if (this.state !== State.IDLE) this.#machine.to(State.READY, { reason: 'cancelled' });
  }

  /** 看完結果後回到可再錄一次的狀態。 */
  reset() {
    this.#matcher.reset();
    if (this.state !== State.IDLE) this.#machine.to(State.READY);
  }

  // ---------------------------------------------------------------- 內部

  #clearTimers() {
    if (this.#maxDurationTimer) {
      clearTimeout(this.#maxDurationTimer);
      this.#maxDurationTimer = null;
    }
    this.#stopProgress();
  }

  #fail(error) {
    this.#machine.to(State.ERROR, { error });
    this.emit('error', error);
  }

  async destroy() {
    this.#destroyed = true;
    this.#clearTimers();
    if (this.#boundVisibility) {
      document.removeEventListener('visibilitychange', this.#boundVisibility);
      this.#boundVisibility = null;
    }
    this.#mic.destroy();
    await this.#engine.destroy();
    this.#machine.reset();
    this.removeAll();
  }
}

export function createFoodVoiceMatcher(config) {
  return new FoodVoiceMatcher(config);
}

export { State } from './core/state-machine.js';
export { AppError, ErrorCode } from './core/errors.js';
export { FEATURE_SPACE, FEATURE_KEYS } from './match/feature-space.js';
export { blankProfileTemplate } from './match/schema.js';
export { extractFeatures } from './audio/features.js';
