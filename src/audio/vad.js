/**
 * 能量式語音／聲音活動偵測（VAD）。
 *
 * 做法：先量一小段背景噪音當基準，之後只看「比背景高多少 dB」，
 * 而不是用固定門檻——因為手機在安靜房間和在夜市的噪音底差 30dB 以上，
 * 固定門檻在其中一種情境一定會壞掉。
 *
 * 開始門檻高於結束門檻（遲滯 hysteresis），避免聲音在門檻附近時瘋狂開關。
 */
export class VoiceActivityDetector {
  #config;
  #noiseFloorDb = -60;
  #calibrationSamples = [];
  #calibrating = true;
  #calibrationStart = 0;
  #speaking = false;
  #lastVoiceAt = 0;
  #startedAt = 0;

  constructor(vadConfig) {
    this.#config = vadConfig;
  }

  get noiseFloorDb() {
    return this.#noiseFloorDb;
  }

  get isSpeaking() {
    return this.#speaking;
  }

  reset(now = performance.now()) {
    this.#calibrationSamples = [];
    this.#calibrating = true;
    this.#calibrationStart = now;
    this.#speaking = false;
    this.#lastVoiceAt = 0;
    this.#startedAt = now;
  }

  /**
   * 每次拿到音量就餵進來。
   * @returns {{event: 'calibrating'|'waiting'|'start'|'continue'|'end'|'timeout', db:number, noiseFloorDb:number, aboveFloorDb:number}}
   */
  push(db, now = performance.now()) {
    const base = {
      db,
      noiseFloorDb: this.#noiseFloorDb,
      aboveFloorDb: db - this.#noiseFloorDb,
    };

    if (this.#calibrating) {
      this.#calibrationSamples.push(db);
      if (now - this.#calibrationStart >= this.#config.calibrationMs) {
        this.#noiseFloorDb = median(this.#calibrationSamples);
        this.#calibrating = false;
      }
      return { ...base, event: 'calibrating', noiseFloorDb: this.#noiseFloorDb };
    }

    const above = db - this.#noiseFloorDb;

    if (!this.#speaking) {
      if (above >= this.#config.startThresholdDb) {
        this.#speaking = true;
        this.#lastVoiceAt = now;
        return { ...base, aboveFloorDb: above, event: 'start' };
      }
      // 安靜時持續用很慢的速度追蹤噪音底，才能適應環境變化（例如冷氣啟動）
      this.#noiseFloorDb = this.#noiseFloorDb * 0.95 + db * 0.05;
      if (now - this.#startedAt >= this.#config.maxWaitMs) {
        return { ...base, aboveFloorDb: above, event: 'timeout' };
      }
      return { ...base, aboveFloorDb: above, event: 'waiting' };
    }

    if (above >= this.#config.endThresholdDb) {
      this.#lastVoiceAt = now;
      return { ...base, aboveFloorDb: above, event: 'continue' };
    }
    if (now - this.#lastVoiceAt >= this.#config.silenceHangoverMs) {
      this.#speaking = false;
      return { ...base, aboveFloorDb: above, event: 'end' };
    }
    return { ...base, aboveFloorDb: above, event: 'continue' };
  }
}

function median(values) {
  if (values.length === 0) return -60;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
