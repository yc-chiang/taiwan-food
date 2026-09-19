import { FEATURE_KEYS, FEATURE_SPACE } from './feature-space.js';
import { AppError, ErrorCode } from '../core/errors.js';

/**
 * 食物資料格式（你之後提供清單時照這個填即可）：
 *
 * {
 *   id: 'stinky-tofu',              // 必填，唯一
 *   name: '臭豆腐',                  // 必填，顯示用
 *   profile: {                      // 必填，至少一個維度；值域 0~1
 *     roughness: 0.9,
 *     brightness: 0.35,
 *     rhythm: 0.7,
 *   },
 *   // 以下皆為選填，核心邏輯不使用，會原封不動帶到比對結果裡給 UI 用
 *   description: '油鍋裡滋滋作響的聲音',
 *   image: './assets/stinky-tofu.jpg',
 *   tags: ['夜市', '發酵'],
 *   weight: 1,                      // 出現機率調整，>1 較容易被選中，預設 1
 * }
 */

const OPTIONAL_PASSTHROUGH = ['description', 'image', 'tags', 'color', 'emoji', 'sound', 'meta'];

export function validateFoods(foods) {
  if (!Array.isArray(foods)) {
    throw new AppError(ErrorCode.INVALID_FOOD_DATA, { detail: '食物資料必須是陣列' });
  }
  if (foods.length === 0) {
    throw new AppError(ErrorCode.NO_FOOD_DATA);
  }

  const errors = [];
  const warnings = [];
  const seenIds = new Set();
  const normalized = [];

  foods.forEach((food, index) => {
    const at = `第 ${index + 1} 筆${food?.name ? `（${food.name}）` : ''}`;

    if (!food || typeof food !== 'object') {
      errors.push(`${at}：不是物件`);
      return;
    }
    if (!food.id || typeof food.id !== 'string') {
      errors.push(`${at}：缺少 id`);
      return;
    }
    if (seenIds.has(food.id)) {
      errors.push(`${at}：id "${food.id}" 重複`);
      return;
    }
    seenIds.add(food.id);

    if (!food.name || typeof food.name !== 'string') {
      errors.push(`${at}：缺少 name`);
      return;
    }
    if (!food.profile || typeof food.profile !== 'object') {
      errors.push(`${at}：缺少 profile`);
      return;
    }

    const profile = {};
    for (const [key, value] of Object.entries(food.profile)) {
      if (!FEATURE_KEYS.includes(key)) {
        warnings.push(`${at}：未知的維度 "${key}"，已忽略`);
        continue;
      }
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        errors.push(`${at}：維度 "${key}" 必須是 0~1 的數字，收到 ${JSON.stringify(value)}`);
        continue;
      }
      profile[key] = value;
    }

    const filled = Object.keys(profile).length;
    if (filled === 0) {
      errors.push(`${at}：profile 沒有任何有效維度`);
      return;
    }
    // 只填 1~2 個維度時比對會很不穩定，會跟一堆聲音都「很接近」
    if (filled < 3) {
      warnings.push(`${at}：只填了 ${filled} 個維度，建議至少 3 個以提高辨識度`);
    }

    normalized.push({
      ...Object.fromEntries(
        OPTIONAL_PASSTHROUGH.filter((k) => k in food).map((k) => [k, food[k]]),
      ),
      id: food.id,
      name: food.name,
      profile,
      weight: Number.isFinite(food.weight) && food.weight > 0 ? food.weight : 1,
    });
  });

  if (errors.length > 0) {
    throw new AppError(ErrorCode.INVALID_FOOD_DATA, { detail: errors });
  }

  return { foods: normalized, warnings };
}

/** 產生一份空白 profile 範本，方便你手動填食物清單。 */
export function blankProfileTemplate() {
  return FEATURE_SPACE.map((f) => `  ${f.key}: 0.5, // ${f.label} — ${f.hint}`).join('\n');
}
