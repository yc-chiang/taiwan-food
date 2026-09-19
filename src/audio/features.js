import { FFT, hannWindow } from './fft.js';
import { normalize, normalizeLog, clamp01 } from '../match/feature-space.js';

const FRAME_SIZE = 2048;
const HOP_SIZE = 512;
/** 低於這個 RMS 的幀視為靜音，不納入統計 */
const SILENCE_RMS = 0.004;

/**
 * 從一段 PCM 抽出感知特徵向量。
 *
 * 流程：去頭尾靜音 → 分幀加窗 → 逐幀算時域／頻域特徵 → 統計聚合 → 正規化到 0~1。
 *
 * @param {Float32Array} samples 單聲道 PCM，範圍 -1~1
 * @param {number} sampleRate
 * @returns {{vector:object, raw:object, meta:object}}
 */
export function extractFeatures(samples, sampleRate) {
  const trimmed = trimSilence(samples);
  const durationSec = trimmed.length / sampleRate;

  const fft = new FFT(FRAME_SIZE);
  const window = hannWindow(FRAME_SIZE);
  const frameBuf = new Float32Array(FRAME_SIZE);
  const spectrum = new Float32Array(FRAME_SIZE / 2 + 1);
  let prevSpectrum = null;

  const rmsSeq = [];
  const centroidSeq = [];
  const rolloffSeq = [];
  const flatnessSeq = [];
  const zcrSeq = [];
  const fluxSeq = [];
  const f0Seq = [];

  const frameCount = Math.max(0, Math.floor((trimmed.length - FRAME_SIZE) / HOP_SIZE) + 1);

  for (let f = 0; f < frameCount; f += 1) {
    const offset = f * HOP_SIZE;
    let sumSquares = 0;
    let crossings = 0;
    for (let i = 0; i < FRAME_SIZE; i += 1) {
      const s = trimmed[offset + i];
      sumSquares += s * s;
      if (i > 0 && (s >= 0) !== (trimmed[offset + i - 1] >= 0)) crossings += 1;
      frameBuf[i] = s * window[i];
    }
    const rms = Math.sqrt(sumSquares / FRAME_SIZE);
    rmsSeq.push(rms);
    if (rms < SILENCE_RMS) {
      prevSpectrum = null; // 靜音打斷，下一幀不要算跨越靜音的 flux
      continue;
    }

    zcrSeq.push(crossings / FRAME_SIZE);
    fft.magnitude(frameBuf, spectrum);

    centroidSeq.push(spectralCentroid(spectrum, sampleRate));
    rolloffSeq.push(spectralRolloff(spectrum, sampleRate, 0.85));
    flatnessSeq.push(spectralFlatness(spectrum));
    if (prevSpectrum) fluxSeq.push(spectralFlux(spectrum, prevSpectrum));
    prevSpectrum = spectrum.slice();

    const f0 = estimatePitch(trimmed, offset, FRAME_SIZE, sampleRate);
    if (f0) f0Seq.push(f0);
  }

  const voicedRatio = rmsSeq.length ? zcrSeq.length / rmsSeq.length : 0;
  const loudFrames = rmsSeq.filter((r) => r >= SILENCE_RMS);
  const rmsDb = loudFrames.map((r) => 20 * Math.log10(r));

  const rises = rmsRiseDb(rmsSeq);

  const raw = {
    durationSec,
    peak: peakOf(trimmed),
    rmsMean: mean(loudFrames),
    rmsDbMean: mean(rmsDb),
    rmsDbStd: std(rmsDb),
    centroidHz: mean(centroidSeq),
    rolloffHz: mean(rolloffSeq),
    flatness: mean(flatnessSeq),
    zcr: mean(zcrSeq),
    onsetRate: countOnsets(rises) / Math.max(durationSec, 0.001),
    transientDb: transientDb(rises),
    fluxMean: mean(fluxSeq),
    f0Hz: median(f0Seq),
    f0SemitoneStd: f0Seq.length > 1 ? std(f0Seq.map((f) => 12 * Math.log2(f / 55))) : 0,
    /** 有明確基頻的幀佔比，用來分辨「哼唱」與「噪音」 */
    harmonicRatio: zcrSeq.length ? f0Seq.length / zcrSeq.length : 0,
    voicedRatio,

    sustainRatio: sustainRatio(rmsSeq),
  };

  // 這些上下界是以一般人對著手機發聲的實測範圍抓的，之後可依實際資料再校正
  const vector = {
    loudness: normalize(raw.rmsDbMean, -48, -6),
    dynamics: normalize(raw.rmsDbStd, 0, 14),
    pitch: normalizeLog(raw.f0Hz, 70, 800),
    pitchRange: normalize(raw.f0SemitoneStd, 0, 10),
    // 上下界依實測校正：一般人對著麥克風發出的聲音，頻譜重心可達 12kHz，
    // 原本 6000 的上界會讓所有噪音類（酥脆／油炸／沙沙）全部壓在 1.00 而分不開
    brightness: normalizeLog(raw.centroidHz, 150, 13000),
    roughness: normalize(raw.flatness, 0.01, 0.85),
    sharpness: normalize(raw.zcr, 0.005, 0.55),
    rhythm: normalize(raw.onsetRate, 0.3, 8),
    duration: normalize(raw.durationSec, 0.2, 4),
    attack: normalize(raw.transientDb, 1, 14),
    sustain: clamp01(raw.sustainRatio),
    tonality: clamp01(raw.harmonicRatio),
  };

  return {
    vector,
    raw,
    meta: {
      sampleRate,
      frameCount,
      voicedFrames: zcrSeq.length,
      /** 樣本太短或幾乎全靜音時，比對結果不可信，UI 應該請使用者重錄 */
      reliable: durationSec >= 0.25 && zcrSeq.length >= 4,
    },
  };
}

/** 去掉頭尾低於門檻的部分，但各保留 50ms 讓起音不被切掉 */
function trimSilence(samples, threshold = SILENCE_RMS) {
  let start = 0;
  let end = samples.length - 1;
  while (start < samples.length && Math.abs(samples[start]) < threshold) start += 1;
  while (end > start && Math.abs(samples[end]) < threshold) end -= 1;
  if (end - start < FRAME_SIZE) return samples; // 太短就不要切，交給後面的 reliable 判斷
  const pad = 2048;
  return samples.subarray(Math.max(0, start - pad), Math.min(samples.length, end + pad));
}

function spectralCentroid(spectrum, sampleRate) {
  let weighted = 0;
  let total = 0;
  const binHz = sampleRate / 2 / (spectrum.length - 1);
  for (let i = 1; i < spectrum.length; i += 1) {
    weighted += i * binHz * spectrum[i];
    total += spectrum[i];
  }
  return total > 0 ? weighted / total : 0;
}

/** 能量累積到 ratio 的頻率，代表「聲音能量集中在多高」 */
function spectralRolloff(spectrum, sampleRate, ratio) {
  let total = 0;
  for (let i = 1; i < spectrum.length; i += 1) total += spectrum[i];
  const target = total * ratio;
  let acc = 0;
  const binHz = sampleRate / 2 / (spectrum.length - 1);
  for (let i = 1; i < spectrum.length; i += 1) {
    acc += spectrum[i];
    if (acc >= target) return i * binHz;
  }
  return sampleRate / 2;
}

/** 幾何平均／算術平均。越接近 1 越像白噪音，越接近 0 越像純音。 */
function spectralFlatness(spectrum) {
  let logSum = 0;
  let sum = 0;
  let n = 0;
  for (let i = 1; i < spectrum.length; i += 1) {
    const v = spectrum[i] + 1e-10;
    logSum += Math.log(v);
    sum += v;
    n += 1;
  }
  if (n === 0 || sum === 0) return 0;
  return Math.exp(logSum / n) / (sum / n);
}

/**
 * 頻譜變化量。保留給未來可能的音色變化分析，目前 onset 偵測已改用 RMS 包絡。
 */
function spectralFlux(current, previous) {
  let sum = 0;
  let total = 0;
  for (let i = 1; i < current.length; i += 1) {
    const diff = current[i] - previous[i];
    if (diff > 0) sum += diff;
    total += current[i];
  }
  return total > 0 ? sum / total : 0;
}

/** onset 之間至少要隔這麼多幀（約 50ms），避免同一下被算成兩次 */
const MIN_ONSET_GAP_FRAMES = 5;
/** 音量至少要在一幀內跳升這麼多 dB 才算一次 onset */
const ONSET_RISE_DB = 5;

/**
 * 逐幀的音量上升量（dB）。這是節奏與起音兩個特徵的共同基礎。
 *
 * 為什麼不用頻譜變化（spectral flux）：白噪音的頻譜每一幀都在隨機跳動，
 * flux 天生就很高，結果「持續的嘶嘶聲」會被判成節奏密度最高的聲音，
 * 和實際感受完全相反。音量包絡沒有這個問題 —— 穩態噪音的音量幾乎不變。
 */
function rmsRiseDb(rmsSeq) {
  const rises = [];
  for (let i = 1; i < rmsSeq.length; i += 1) {
    const prev = 20 * Math.log10(Math.max(rmsSeq[i - 1], 1e-6));
    const cur = 20 * Math.log10(Math.max(rmsSeq[i], 1e-6));
    rises.push(Math.max(0, cur - prev));
  }
  return rises;
}

/** 從音量上升序列數出 onset 次數。 */
function countOnsets(rises) {
  if (rises.length < 3) return 0;
  let count = 0;
  let lastOnset = -MIN_ONSET_GAP_FRAMES;
  for (let i = 1; i < rises.length - 1; i += 1) {
    const isPeak = rises[i] >= rises[i - 1] && rises[i] > rises[i + 1];
    if (isPeak && rises[i] >= ONSET_RISE_DB && i - lastOnset >= MIN_ONSET_GAP_FRAMES) {
      count += 1;
      lastOnset = i;
    }
  }
  return count;
}

/**
 * 起音銳利度：音量上升量的第 90 百分位。
 * 持續的噪音每幀只升 1~2 dB；爆裂聲一下就升 15 dB 以上。
 * 取百分位而非最大值，才不會被單一異常幀決定整段的判斷。
 */
function transientDb(rises) {
  if (rises.length === 0) return 0;
  // 用第 98 而非第 90 百分位：onset 在一段錄音裡本來就稀疏
  // （3 秒約 280 幀、可能只有 20 次爆裂），取 90% 會整個落在非 onset 的平緩區
  const sorted = [...rises].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))];
}

/**
 * 自相關法估基頻。限制在 70~800Hz（人聲與大多數口技的範圍）。
 *
 * 關鍵在避免八度誤判：週期訊號在 lag 的每個整數倍都會有幾乎一樣高的峰，
 * 直接取最大值常常會挑到 2 倍、3 倍週期，音高就矮了八度。
 * 標準作法（YIN）是取「相關度達到最高值某個比例的最短 lag」。
 */
function estimatePitch(samples, offset, size, sampleRate) {
  const minLag = Math.floor(sampleRate / 800);
  const maxLag = Math.floor(sampleRate / 70);
  if (offset + size + maxLag > samples.length) return null;

  let energy = 0;
  for (let i = 0; i < size; i += 1) energy += samples[offset + i] ** 2;
  if (energy < 1e-6) return null;

  const corrs = new Float32Array(maxLag + 1);
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let corr = 0;
    let lagEnergy = 0;
    for (let i = 0; i < size; i += 1) {
      const a = samples[offset + i];
      const b = samples[offset + i + lag];
      corr += a * b;
      lagEnergy += b * b;
    }
    const normalized = corr / (Math.sqrt(energy * lagEnergy) + 1e-10);
    corrs[lag] = normalized;
    if (normalized > bestCorr) bestCorr = normalized;
  }

  // 0.45 是經驗值：低於此多半是噪音的假峰，視為這幀沒有明確音高
  if (bestCorr < 0.45) return null;

  // 從最短 lag 掃起，取第一個「是區域極大值且達到 bestCorr 九成」的 lag
  const acceptable = bestCorr * 0.9;
  let chosen = -1;
  for (let lag = minLag + 1; lag < maxLag; lag += 1) {
    if (corrs[lag] >= acceptable && corrs[lag] >= corrs[lag - 1] && corrs[lag] > corrs[lag + 1]) {
      chosen = lag;
      break;
    }
  }
  if (chosen < 0) return null;

  // 拋物線內插，讓解析度不受限於整數取樣點（高音時 lag 只有幾十個取樣，差很多）
  const y0 = corrs[chosen - 1];
  const y1 = corrs[chosen];
  const y2 = corrs[chosen + 1];
  const denom = 2 * (2 * y1 - y0 - y2);
  const shift = denom !== 0 ? (y2 - y0) / denom : 0;
  const refined = chosen + (Math.abs(shift) < 1 ? shift : 0);

  return sampleRate / refined;
}

/** 峰值之後仍維持在 50% 音量以上的比例，代表尾音綿不綿長 */
function sustainRatio(rmsSeq) {
  if (rmsSeq.length < 2) return 0;
  const peak = Math.max(...rmsSeq);
  if (peak <= 0) return 0;
  const peakIndex = rmsSeq.indexOf(peak);
  const tail = rmsSeq.slice(peakIndex);
  if (tail.length === 0) return 0;
  return tail.filter((r) => r >= peak * 0.5).length / tail.length;
}

function peakOf(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

function mean(arr) {
  if (!arr.length) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}

function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let sum = 0;
  for (const v of arr) sum += (v - m) ** 2;
  return Math.sqrt(sum / (arr.length - 1));
}

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
