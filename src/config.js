/**
 * 全域預設設定。呼叫 createFoodVoiceMatcher({ ... }) 時可以逐項覆寫。
 */
export const defaultConfig = {
  audio: {
    /**
     * 重要：做「音色比對」時這三個瀏覽器內建處理必須關掉。
     * 它們是為了人聲通話而設計，會削掉我們要拿來比對的頻譜特徵與動態。
     * 若你之後改成「講出食物名稱」的語音辨識模式，再把它們打開會比較準。
     */
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
    /** iOS 會忽略這個值、直接給硬體取樣率，所有後續計算都讀 AudioContext.sampleRate */
    sampleRate: 48000,
    /** 分析用 FFT 大小，2048 @48kHz ≈ 43ms 視窗 */
    fftSize: 2048,
    /** 視覺化回呼的節流（毫秒），60fps 約 16ms */
    levelIntervalMs: 50,
  },
  recording: {
    /** 低於這個長度視為誤觸 */
    minDurationMs: 300,
    /** 硬上限，避免使用者忘了停 */
    maxDurationMs: 8000,
    /** 是否同時保留一份可播放的音檔（供 UI 回放）*/
    keepPlayback: true,
  },
  vad: {
    /** 自動偵測開始／結束說話。關掉的話就是純手動 start/stop */
    enabled: true,
    /** 開始門檻：高於背景噪音多少 dB 視為有聲 */
    startThresholdDb: 10,
    /** 結束門檻，比 start 低一點做遲滯，避免忽開忽關 */
    endThresholdDb: 6,
    /** 連續靜音多久視為講完 */
    silenceHangoverMs: 700,
    /** 進入 listening 後多久還沒聲音就放棄 */
    maxWaitMs: 6000,
    /** 開頭多久用來量測背景噪音底 */
    calibrationMs: 300,
  },
  match: {
    /** 回傳前幾名 */
    topK: 3,
    /** 'cosine' | 'euclidean' | 'manhattan' */
    metric: 'euclidean',
    /** 低於這個相似度就不算命中（0~1），null 表示永遠給答案 */
    minConfidence: null,
    /** 同一輪內避免重複給同一個答案的冷卻次數，0 表示關閉 */
    cooldownRounds: 0,
  },
  debug: false,
};

/** 深層合併（只處理單層物件，夠用且可預期）*/
export function mergeConfig(overrides = {}) {
  const out = structuredClone(defaultConfig);
  for (const [section, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && section in out) {
      Object.assign(out[section], value);
    } else {
      out[section] = value;
    }
  }
  return out;
}
