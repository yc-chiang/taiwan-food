import { Emitter } from '../core/emitter.js';
import { AppError, ErrorCode, fromMediaError } from '../core/errors.js';

/**
 * 麥克風裝置管理：能力偵測、權限、裝置列舉與切換、熱插拔、中斷復原。
 * 手機（iOS/Android）與桌機的差異都收斂在這一層，上層不需要知道。
 *
 * 事件：
 *   'devices'      {devices, activeDeviceId}  可用裝置清單變動（插拔耳機時會觸發）
 *   'permission'   {state}                    'granted' | 'denied' | 'prompt'
 *   'stream'       {stream, deviceId, settings}
 *   'lost'         {reason}                   裝置被拔除或被系統收走
 */
export class MicDevice extends Emitter {
  #stream = null;
  #deviceId = null;
  #audioConfig;
  #devices = [];
  #permissionStatus = null;
  #boundDeviceChange = null;

  constructor(audioConfig) {
    super();
    this.#audioConfig = audioConfig;
  }

  get stream() {
    return this.#stream;
  }

  get deviceId() {
    return this.#deviceId;
  }

  get devices() {
    return [...this.#devices];
  }

  get isOpen() {
    return Boolean(this.#stream?.getAudioTracks().some((t) => t.readyState === 'live'));
  }

  /**
   * 開麥前先檢查環境。回傳可直接拿去畫「不支援」畫面的結果，而不是丟錯。
   */
  static checkSupport() {
    const issues = [];
    // file:// 或 http:// 下 mediaDevices 整個不存在，錯誤訊息會很難懂，先攔下來
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      issues.push(ErrorCode.INSECURE_CONTEXT);
    }
    if (!navigator?.mediaDevices?.getUserMedia) {
      issues.push(ErrorCode.UNSUPPORTED_BROWSER);
    }
    const AudioCtx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioCtx) issues.push(ErrorCode.UNSUPPORTED_BROWSER);

    return {
      supported: issues.length === 0,
      issues,
      /** Safari（含所有 iOS 瀏覽器）需要在使用者手勢內 resume AudioContext */
      needsUserGesture: isAppleWebKit(),
      /** iOS 不允許用 deviceId 指定麥克風，只能用系統當前輸入 */
      canSelectDevice: !isIOS(),
      hasAudioWorklet: Boolean(globalThis.AudioWorkletNode),
      hasPermissionsApi: Boolean(navigator?.permissions?.query),
    };
  }

  /**
   * 查目前權限狀態，不會跳出授權視窗。
   * Safari 長期不支援 permissions.query({name:'microphone'})，查不到就回 'unknown'。
   */
  async queryPermission() {
    if (!navigator?.permissions?.query) return 'unknown';
    try {
      const status = await navigator.permissions.query({ name: 'microphone' });
      this.#watchPermission(status);
      return status.state;
    } catch {
      return 'unknown';
    }
  }

  #watchPermission(status) {
    if (this.#permissionStatus === status) return;
    this.#permissionStatus = status;
    status.onchange = () => {
      this.emit('permission', { state: status.state });
      // 使用者在設定頁把權限收回時，串流會變成死的，主動結束避免 UI 停在「錄音中」
      if (status.state === 'denied' && this.isOpen) {
        this.close();
        this.emit('lost', { reason: 'permission-revoked' });
      }
    };
  }

  /**
   * 開啟麥克風。必須在使用者手勢（click/touch）內呼叫，否則 Safari 會直接拒絕。
   * @param {string|null} deviceId 指定裝置，null 表示系統預設
   */
  async open(deviceId = null) {
    const support = MicDevice.checkSupport();
    if (!support.supported) {
      throw new AppError(support.issues[0], { detail: support.issues });
    }

    // 換裝置前先關舊的，否則部分 Android 機型會拿不到第二支麥克風
    if (this.#stream) this.close();

    const constraints = this.#buildConstraints(deviceId);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      const appError = fromMediaError(err);
      // 指定的取樣率／裝置不被支援時，退回最寬鬆的條件再試一次，而不是直接失敗
      if (appError.code === ErrorCode.OVERCONSTRAINED) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (retryErr) {
          throw fromMediaError(retryErr);
        }
      } else {
        throw appError;
      }
    }

    this.#stream = stream;
    const track = stream.getAudioTracks()[0];
    if (!track) {
      this.close();
      throw new AppError(ErrorCode.NO_DEVICE);
    }

    const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
    this.#deviceId = settings.deviceId ?? deviceId ?? null;

    // 耳機被拔掉、藍牙斷線、或 iOS 被來電打斷時會觸發
    track.addEventListener('ended', () => {
      this.#stream = null;
      this.emit('lost', { reason: 'track-ended' });
    });
    // iOS 被來電／其他 App 搶走麥克風時是 mute，通話結束會自動 unmute
    track.addEventListener('mute', () => this.emit('interrupted', { muted: true }));
    track.addEventListener('unmute', () => this.emit('interrupted', { muted: false }));

    this.#startWatchingDevices();
    // 授權之後 label 才會有值，這時候重新列舉才拿得到「MacBook Pro 麥克風」這種可讀名稱
    await this.refreshDevices();

    this.emit('permission', { state: 'granted' });
    this.emit('stream', { stream, deviceId: this.#deviceId, settings });
    return stream;
  }

  #buildConstraints(deviceId) {
    const { echoCancellation, noiseSuppression, autoGainControl, channelCount, sampleRate } =
      this.#audioConfig;
    const audio = {
      echoCancellation,
      noiseSuppression,
      autoGainControl,
      channelCount,
      // ideal 而非 exact：拿不到就退而求其次，不要讓整個 getUserMedia 失敗
      sampleRate: { ideal: sampleRate },
    };
    // iOS 指定 deviceId 會直接丟 OverconstrainedError，所以只在桌機／Android 帶入
    if (deviceId && !isIOS()) {
      audio.deviceId = { exact: deviceId };
    }
    return { audio, video: false };
  }

  /** 列舉可用的輸入裝置。未授權前 label 會是空字串，這是瀏覽器的隱私保護。 */
  async refreshDevices() {
    if (!navigator?.mediaDevices?.enumerateDevices) return [];
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      this.#devices = all
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          groupId: d.groupId,
          label: d.label || `麥克風 ${i + 1}`,
          isDefault: d.deviceId === 'default' || d.deviceId === '',
          hasLabel: Boolean(d.label),
        }));
      this.emit('devices', { devices: this.devices, activeDeviceId: this.#deviceId });
    } catch {
      this.#devices = [];
    }
    return this.devices;
  }

  #startWatchingDevices() {
    if (this.#boundDeviceChange || !navigator?.mediaDevices?.addEventListener) return;
    this.#boundDeviceChange = async () => {
      const before = this.#devices.map((d) => d.deviceId).join('|');
      await this.refreshDevices();
      const after = this.#devices.map((d) => d.deviceId).join('|');
      if (before !== after) {
        // 只在清單真的變了才通知，避免某些瀏覽器的重複事件洗版
        this.emit('deviceschanged', { devices: this.devices, activeDeviceId: this.#deviceId });
      }
    };
    navigator.mediaDevices.addEventListener('devicechange', this.#boundDeviceChange);
  }

  /** 切換到另一支麥克風，會重新取得串流；上層需要重接音訊圖。 */
  async switchTo(deviceId) {
    if (isIOS()) {
      // iOS 只能由使用者在系統層（控制中心／藍牙）切換輸入來源
      throw new AppError(ErrorCode.OVERCONSTRAINED, { detail: 'iOS 不支援由網頁指定麥克風' });
    }
    return this.open(deviceId);
  }

  close() {
    if (this.#stream) {
      for (const track of this.#stream.getTracks()) track.stop();
      this.#stream = null;
    }
  }

  destroy() {
    this.close();
    if (this.#boundDeviceChange) {
      navigator.mediaDevices.removeEventListener('devicechange', this.#boundDeviceChange);
      this.#boundDeviceChange = null;
    }
    if (this.#permissionStatus) this.#permissionStatus.onchange = null;
    this.removeAll();
  }
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ 的 UA 偽裝成 Mac，用觸控點數判斷
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isAppleWebKit() {
  if (typeof navigator === 'undefined') return false;
  return isIOS() || /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
}
