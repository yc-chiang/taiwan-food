/**
 * 特徵空間定義 —— 這是「聲音」與「食物」之間唯一的共同語言。
 *
 * 每一個維度都已正規化到 0~1，並且刻意選用「人可以用形容詞描述」的感知維度，
 * 而不是 MFCC 那種數學上有效、但人類無法手寫的係數。
 * 這樣你在寫食物清單時，可以直接用直覺填值：
 *
 *   { id:'stinky-tofu', name:'臭豆腐', profile:{ roughness:0.9, brightness:0.35, rhythm:0.7 } }
 *
 * 沒填的維度會被自動忽略（距離計算時動態重新分配權重），
 * 所以一個食物只填 3 個維度也能正常比對。
 */
export const FEATURE_SPACE = [
  {
    key: 'loudness',
    label: '音量',
    hint: '0 = 氣音般輕，1 = 大聲喊',
    weight: 0.8,
  },
  {
    key: 'dynamics',
    label: '起伏',
    hint: '0 = 一路平穩，1 = 忽大忽小',
    weight: 0.9,
  },
  {
    key: 'pitch',
    label: '音高',
    hint: '0 = 低沉，1 = 尖高',
    weight: 1.2,
  },
  {
    key: 'pitchRange',
    label: '音域變化',
    hint: '0 = 單一音，1 = 大幅滑音／轉折',
    weight: 0.8,
  },
  {
    key: 'brightness',
    label: '明亮度',
    hint: '頻譜重心。0 = 悶厚，1 = 清亮刺耳',
    weight: 1.3,
  },
  {
    key: 'roughness',
    label: '粗糙度',
    hint: '雜訊感。0 = 純淨樂音，1 = 沙沙／嘶嘶／爆裂',
    weight: 1.3,
  },
  {
    key: 'sharpness',
    label: '銳利度',
    hint: '高頻能量。0 = 圓潤，1 = 尖脆',
    weight: 1.0,
  },
  {
    key: 'rhythm',
    label: '節奏密度',
    hint: '0 = 一個長音，1 = 連續快速斷奏',
    weight: 1.0,
  },
  {
    key: 'duration',
    label: '長度',
    hint: '0 = 極短促，1 = 拉很長',
    weight: 0.6,
  },
  {
    key: 'attack',
    label: '起音',
    hint: '0 = 慢慢淡入，1 = 瞬間爆發',
    weight: 0.9,
  },
  {
    key: 'sustain',
    label: '延續感',
    hint: '0 = 一下就消失，1 = 尾音綿長',
    weight: 0.7,
  },
  {
    key: 'tonality',
    label: '樂音性',
    hint: '0 = 純噪音（拍打、摩擦），1 = 有明確音高（哼唱）',
    weight: 1.1,
  },
];

export const FEATURE_KEYS = FEATURE_SPACE.map((f) => f.key);

export const DEFAULT_WEIGHTS = Object.fromEntries(FEATURE_SPACE.map((f) => [f.key, f.weight]));

/** 把數值夾在 0~1，任何不是有限數字的輸入都回傳 fallback。 */
export function clamp01(value, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** 線性正規化到 0~1 並夾邊界。 */
export function normalize(value, min, max) {
  if (!Number.isFinite(value)) return 0;
  return clamp01((value - min) / (max - min));
}

/** 對數正規化，用在頻率這種感知上是對數尺度的量。 */
export function normalizeLog(value, min, max) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return clamp01((Math.log2(value) - Math.log2(min)) / (Math.log2(max) - Math.log2(min)));
}
