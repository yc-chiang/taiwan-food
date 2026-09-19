import { FEATURE_KEYS } from './feature-space.js';

/**
 * 距離函式。全部回傳 0~1 的「距離」，0 = 完全一致。
 *
 * 共同的設計重點：食物 profile 允許只填部分維度，
 * 沒填的維度不能當成 0（那會變成「這個食物很低沉」的錯誤語意），
 * 必須整個排除，並把權重重新分配給有填的維度。
 */

function sharedKeys(profile) {
  return FEATURE_KEYS.filter((k) => Number.isFinite(profile[k]));
}

/** 加權歐式距離。對「單一維度差很多」較敏感，適合特徵明確的食物。 */
export function weightedEuclidean(vector, profile, weights) {
  const keys = sharedKeys(profile);
  if (keys.length === 0) return 1;
  let sum = 0;
  let weightSum = 0;
  for (const k of keys) {
    const w = weights[k] ?? 1;
    sum += w * (vector[k] - profile[k]) ** 2;
    weightSum += w;
  }
  // 除以權重總和再開根號，結果自然落在 0~1（因為每維差值最大為 1）
  return Math.sqrt(sum / weightSum);
}

/** 加權曼哈頓距離。比歐式寬容，多個維度小幅偏差時不會被過度放大。 */
export function weightedManhattan(vector, profile, weights) {
  const keys = sharedKeys(profile);
  if (keys.length === 0) return 1;
  let sum = 0;
  let weightSum = 0;
  for (const k of keys) {
    const w = weights[k] ?? 1;
    sum += w * Math.abs(vector[k] - profile[k]);
    weightSum += w;
  }
  return sum / weightSum;
}

/**
 * 餘弦距離。只看「形狀」不看「強度」——
 * 小聲哼和大聲哼同一個旋律會被視為相同。
 * 如果你希望音量本身也是判斷依據，用 euclidean 而不是這個。
 */
export function cosineDistance(vector, profile, weights) {
  const keys = sharedKeys(profile);
  if (keys.length === 0) return 1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const k of keys) {
    const w = weights[k] ?? 1;
    const a = vector[k] * w;
    const b = profile[k] * w;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 1;
  const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return (1 - similarity) / 2; // 餘弦相似度是 -1~1，映射到 0~1
}

export const METRICS = {
  euclidean: weightedEuclidean,
  manhattan: weightedManhattan,
  cosine: cosineDistance,
};

export function getMetric(name) {
  const fn = METRICS[name];
  if (!fn) throw new Error(`未知的距離函式："${name}"，可用：${Object.keys(METRICS).join(', ')}`);
  return fn;
}
