import { getMetric } from './distance.js';
import { validateFoods } from './schema.js';
import { DEFAULT_WEIGHTS, FEATURE_SPACE } from './feature-space.js';
import { AppError, ErrorCode } from '../core/errors.js';

/**
 * 比對引擎：把一個 0~1 的特徵向量對上最接近的食物。
 *
 * 與資料解耦——食物清單用 load() 注入，換清單不用動任何邏輯。
 */
export class Matcher {
  #foods = [];
  #config;
  #weights;
  #recent = [];

  constructor(matchConfig, weights = DEFAULT_WEIGHTS) {
    this.#config = matchConfig;
    this.#weights = { ...weights };
  }

  get size() {
    return this.#foods.length;
  }

  get foods() {
    return this.#foods.map((f) => ({ ...f }));
  }

  /**
   * 載入食物清單。會驗證格式，格式錯直接丟 AppError（早失敗好過比對出怪結果）。
   * @returns {{count:number, warnings:string[]}}
   */
  load(foods) {
    const { foods: normalized, warnings } = validateFoods(foods);
    this.#foods = normalized;
    this.#recent = [];
    return { count: normalized.length, warnings };
  }

  /** 調整各維度權重，例如你想讓「粗糙度」比「音量」更有決定性。 */
  setWeights(partial) {
    this.#weights = { ...this.#weights, ...partial };
  }

  /**
   * 執行比對。
   * @param {object} vector extractFeatures() 產生的 vector
   * @returns {{matches:Array, best:object|null, confident:boolean}}
   */
  match(vector) {
    if (this.#foods.length === 0) throw new AppError(ErrorCode.NO_FOOD_DATA);

    const metric = getMetric(this.#config.metric);
    const scored = this.#foods.map((food) => {
      const distance = metric(vector, food.profile, this.#weights);
      // weight 越大越容易勝出：直接把距離按比例縮小
      const adjusted = distance / food.weight;
      return {
        food,
        distance: adjusted,
        rawDistance: distance,
        similarity: 1 - Math.min(1, adjusted),
        /** 每個維度差多少，UI 可以用來說明「為什麼是這個」 */
        breakdown: explain(vector, food.profile),
      };
    });

    scored.sort((a, b) => a.distance - b.distance);

    // 冷卻：避免連續好幾輪都跳同一個食物，體驗上會覺得壞掉
    const cooled =
      this.#config.cooldownRounds > 0
        ? preferUnseen(scored, this.#recent, this.#config.cooldownRounds)
        : scored;

    const matches = cooled.slice(0, this.#config.topK).map((entry) => ({
      ...entry.food,
      similarity: entry.similarity,
      distance: entry.distance,
      breakdown: entry.breakdown,
    }));

    const best = matches[0] ?? null;
    if (best) {
      this.#recent.unshift(best.id);
      this.#recent = this.#recent.slice(0, this.#config.cooldownRounds);
    }

    const threshold = this.#config.minConfidence;
    return {
      matches,
      best,
      confident: threshold == null || (best?.similarity ?? 0) >= threshold,
    };
  }

  reset() {
    this.#recent = [];
  }
}

/** 逐維度列出差距，由大到小排序——UI 想顯示「最關鍵的三個特徵」時直接取前三。 */
function explain(vector, profile) {
  return FEATURE_SPACE.filter((f) => Number.isFinite(profile[f.key]))
    .map((f) => ({
      key: f.key,
      label: f.label,
      input: vector[f.key],
      target: profile[f.key],
      delta: vector[f.key] - profile[f.key],
      // 這個維度有多「吻合」，1 = 完全一樣
      fit: 1 - Math.abs(vector[f.key] - profile[f.key]),
    }))
    .sort((a, b) => b.fit - a.fit);
}

/** 把最近出現過的往後排，但如果全部都在冷卻中就照原順序（總得給個答案）。 */
function preferUnseen(scored, recent, cooldown) {
  const recentSet = new Set(recent.slice(0, cooldown));
  if (recentSet.size === 0 || recentSet.size >= scored.length) return scored;
  const fresh = scored.filter((s) => !recentSet.has(s.food.id));
  const stale = scored.filter((s) => recentSet.has(s.food.id));
  return [...fresh, ...stale];
}
