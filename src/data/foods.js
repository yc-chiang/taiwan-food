import { vibeGroupById } from './vibe-groups.js';
import { soundTypeById } from './sound-types.js';
import { weightedEuclidean } from '../match/distance.js';
import { DEFAULT_WEIGHTS } from '../match/feature-space.js';

/**
 * 20 道台灣經典食物。
 * 名稱、英文名與氛圍分組來自來源資料（taiwan-food-vibes-en-zh），未增減。
 *
 * ── 概念：ASMR ──
 * 使用者對著麥克風發出各種聲音（咀嚼、油炸、湯汁、摩擦…），
 * 系統判斷這是哪一種「聲音型態」，再給出該型底下的食物。
 *
 * ── 兩條分類軸 ──
 * `sound` 聲音型態（6 型）── 比對用的主軸，定義在 sound-types.js
 * `group` 氛圍分類（5 組）── 來源試算表的分類，只用於顯示，不參與比對
 *
 * ── 你要填的是 profile ──
 * 每道食物的 `profile` 目前都是 null。填上之後，比對會自動從
 * 「分類層級」切換到「食物層級」，也就是直接在 20 道之間分勝負。
 *
 *   profile: { roughness: 0.9, brightness: 0.85, rhythm: 0.8, tonality: 0.1 }
 *
 * 12 個維度的定義見 docs/INTEGRATION.md。實務建議：
 *   · 先填最有辨識度的 3~5 個維度就好，不必填滿
 *   · 用極端值（0.05 / 0.95），中間值 0.5 幾乎不提供資訊
 *   · 只填一部分食物也可以，沒填的就不參與食物層級比對
 *
 * `asmr` 欄位是我先擬的聲音提示，方便你對照著填 profile，可自由改寫或刪除。
 *
 * ── 食物的樣子 ──
 * `stage` 指向完整的舞台圖：食物長在人體胃部、和背景同一種霓虹熱感畫風的那張。
 * 檔案放到 assets/foods/<id>.jpg 就會自動生效，不需要改任何程式碼。
 * 圖還沒放進去的食物會自動退回粒子渲染（用 emoji 的形狀聚合成霓虹粒子），
 * 所以可以一張一張慢慢補，不必等 20 張都齊了才能測。
 */
export const foods = [
  // ── 1 · 溫暖療癒 ──────────────────────────────────────────
  { id: 'beef-noodle-soup', stage: 'assets/foods/beef-noodle-soup.jpg', sound: 'liquid',  name: '牛肉麵',   nameEn: 'Taiwanese Beef Noodle Soup', group: 1, emoji: '🍜', image: null, asmr: '咻咻咻——吸麵條、湯汁滾動',       profile: null },
  { id: 'braised-pork-rice', stage: 'assets/foods/braised-pork-rice.jpg', sound: 'soft', name: '滷肉飯',   nameEn: 'Braised Pork Rice',          group: 1, emoji: '🍚', image: null, asmr: '湯匙刮碗、黏稠拌攪',     profile: null },
  { id: 'oyster-vermicelli', stage: 'assets/foods/oyster-vermicelli.jpg', sound: 'liquid', name: '蚵仔麵線', nameEn: 'Oyster Vermicelli',          group: 1, emoji: '🍲', image: null, asmr: '濃稠羹湯、小口吸食',     profile: null },
  { id: 'danzai-noodles', stage: 'assets/foods/danzai-noodles.jpg', sound: 'liquid',    name: '擔仔麵',   nameEn: 'Danzai Noodles',             group: 1, emoji: '🍜', image: null, asmr: '小碗輕碰、清湯',         profile: null },

  // ── 2 · 溫馨相聚 ──────────────────────────────────────────
  // 原本歸「湯汁流動」，但牛肉麵才是那一型最典型的代表；兩道同型就分不開，
  // 所以小籠包改走蒸籠與鬆軟麵皮的悶聲。
  { id: 'soup-dumplings', stage: 'assets/foods/soup-dumplings.jpg', sound: 'soft',    name: '小籠包',   nameEn: 'Soup Dumplings',             group: 2, emoji: '🥟', image: null, asmr: '哈哈哈——蒸籠掀蓋的暖氣',     profile: null },
  { id: 'pork-belly-bun', stage: 'assets/foods/pork-belly-bun.jpg', sound: 'soft',    name: '刈包',     nameEn: 'Taiwanese Pork Belly Bun',   group: 2, emoji: '🥪', image: null, asmr: '鬆軟麵皮、花生粉',       profile: null },
  { id: 'three-cup-chicken', stage: 'assets/foods/three-cup-chicken.jpg', sound: 'sizzling', name: '三杯雞',   nameEn: 'Three-Cup Chicken',          group: 2, emoji: '🍗', image: null, asmr: '砂鍋翻炒、九層塔下鍋',   profile: null },
  { id: 'taiwanese-sausage', stage: 'assets/foods/taiwanese-sausage.jpg', sound: 'sizzling', name: '台灣香腸', nameEn: 'Taiwanese Sausage',          group: 2, emoji: '🌭', image: null, asmr: '炭烤滋滋、咬下爆汁',     profile: null },

  // ── 3 · 熱鬧夜市 ──────────────────────────────────────────
  { id: 'oyster-omelet', stage: 'assets/foods/oyster-omelet.jpg', sound: 'sizzling',     name: '蚵仔煎',   nameEn: 'Oyster Omelet',              group: 3, emoji: '🍳', image: null, asmr: '鐵板煎、鍋鏟刮動',       profile: null },
  { id: 'fried-chicken', stage: 'assets/foods/fried-chicken.jpg', sound: 'crispy',     name: '鹽酥雞',   nameEn: 'Taiwanese Fried Chicken',    group: 3, emoji: '🍗', image: null, asmr: '下油鍋爆響、酥脆咀嚼',   profile: null },
  { id: 'scallion-pancake', stage: 'assets/foods/scallion-pancake.jpg', sound: 'crispy',  name: '蔥油餅',   nameEn: 'Scallion Pancake',           group: 3, emoji: '🫓', image: null, asmr: '煎餅翻面、撕開酥層',     profile: null },
  { id: 'pepper-bun', stage: 'assets/foods/pepper-bun.jpg', sound: 'crispy',        name: '胡椒餅',   nameEn: 'Pepper Bun',                 group: 3, emoji: '🥟', image: null, asmr: '窯烤硬殼、咬碎脆皮',     profile: null },

  // ── 4 · 大膽冒險 ──────────────────────────────────────────
  { id: 'stinky-tofu', stage: 'assets/foods/stinky-tofu.jpg', sound: 'sizzling',       name: '臭豆腐',   nameEn: 'Stinky Tofu',                group: 4, emoji: '🧈', image: null, asmr: '滾油劇烈滋滋、夾起瀝油', profile: null },
  { id: 'pigs-blood-cake', stage: 'assets/foods/pigs-blood-cake.jpg', sound: 'chewy',   name: '豬血糕',   nameEn: "Pig's Blood Cake",           group: 4, emoji: '🍡', image: null, asmr: '黏糯咀嚼、沾花生粉',     profile: null },
  { id: 'sausage-in-sausage', stage: 'assets/foods/sausage-in-sausage.jpg', sound: 'crispy',name: '大腸包小腸', nameEn: 'Small Sausage in Large Sausage', group: 4, emoji: '🌭', image: null, asmr: '剪刀剪斷、炭烤爆皮', profile: null },
  { id: 'iron-eggs', stage: 'assets/foods/iron-eggs.jpg', sound: 'chewy',         name: '鐵蛋',     nameEn: 'Iron Eggs',                  group: 4, emoji: '🥚', image: null, asmr: '硬韌咀嚼、緊實有嚼勁',   profile: null },

  // ── 5 · 甜蜜夢幻 ──────────────────────────────────────────
  // 「酥」本來就是脆；歸到酥脆也呼應站名「嘎脆嘣」
  { id: 'pineapple-cake', stage: 'assets/foods/pineapple-cake.jpg', sound: 'crispy',    name: '鳳梨酥',   nameEn: 'Pineapple Cake',             group: 5, emoji: '🍍', image: null, asmr: '喀滋喀滋——咬碎酥皮',       profile: null },
  { id: 'taro-balls', stage: 'assets/foods/taro-balls.jpg', sound: 'chewy',        name: '芋圓',     nameEn: 'Taro Balls',                 group: 5, emoji: '🍡', image: null, asmr: 'Q 彈咀嚼、冰塊碰撞',     profile: null },
  { id: 'shaved-ice', stage: 'assets/foods/shaved-ice.jpg', sound: 'grainy',        name: '刨冰',     nameEn: 'Taiwanese Shaved Ice',       group: 5, emoji: '🍧', image: null, asmr: '刨冰機沙沙、湯匙挖冰',   profile: null },
  { id: 'wheel-cake', stage: 'assets/foods/wheel-cake.jpg', sound: 'soft',        name: '車輪餅',   nameEn: 'Wheel Cake',                 group: 5, emoji: '🥮', image: null, asmr: '烤模扣出、綿密內餡',     profile: null },
];

/**
 * ── 只保留指定的食物 ──
 *
 * 列出食物 id 就只有這幾道會參與；空陣列代表 20 道全開。
 * 例如只想留有畫好舞台圖的那幾道：
 *
 *   export const activeFoodIds = ['soup-dumplings', 'stinky-tofu', 'fried-chicken'];
 *
 * 比對會自動收斂到「這些食物所屬的聲音型態」之間 ——
 * 所以不管使用者發出什麼聲音，結果一定落在保留的食物裡，不會判到空的型態。
 */
export const activeFoodIds = [
  'beef-noodle-soup',   // 牛肉麵 → 湯汁流動
  'soup-dumplings',     // 小籠包 → 柔軟綿密
  'pineapple-cake',     // 鳳梨酥 → 酥脆
];

/** 目前參與比對與呈現的食物。 */
export function activeFoods() {
  if (activeFoodIds.length === 0) return foods;
  const keep = new Set(activeFoodIds);
  return foods.filter((f) => keep.has(f.id));
}

/** 目前還有食物的聲音型態 id。比對只在這些型態之間分勝負。 */
export function activeSoundTypeIds() {
  return [...new Set(activeFoods().map((f) => f.sound))];
}

/** 取得某個氛圍分類底下的所有食物。 */
export function foodsByGroup(groupId) {
  return activeFoods().filter((f) => f.group === groupId);
}

/** 把食物補上聲音型態與氛圍分類的完整資訊，方便 UI 直接顯示。 */
export function withGroup(food) {
  return {
    ...food,
    sound: soundTypeById.get(food.sound) ?? null,
    vibe: vibeGroupById.get(food.group) ?? null,
  };
}

/** 取得某個聲音型態底下的所有食物。 */
export function foodsBySound(soundId) {
  return activeFoods().filter((f) => f.sound === soundId);
}

/**
 * 比對的第二段：在命中的聲音型態裡決定最終是哪一道。
 * 型內有食物填了自己的 profile 就比距離，否則隨機 —— 同一種聲音每次給不同食物。
 */
export function pickFoodFromSound(soundId, vector, weights = DEFAULT_WEIGHTS) {
  const pool = foodsBySound(soundId);
  if (pool.length === 0) return { food: randomFood(), method: 'fallback' };

  const withProfile = pool.filter((f) => f.profile && Object.keys(f.profile).length > 0);
  if (withProfile.length === 0 || !vector) {
    return { food: withGroup(pool[Math.floor(Math.random() * pool.length)]), method: 'random' };
  }

  let best = withProfile[0];
  let bestDistance = Infinity;
  for (const food of withProfile) {
    const d = weightedEuclidean(vector, food.profile, weights);
    if (d < bestDistance) {
      bestDistance = d;
      best = food;
    }
  }
  return { food: withGroup(best), method: 'profile', distance: bestDistance };
}

/** 有填 profile 的食物。決定要走食物層級還是分類層級比對。 */
export function foodsWithProfile() {
  return activeFoods().filter((f) => f.profile && Object.keys(f.profile).length > 0);
}

/**
 * 目前應該用哪一種比對粒度。
 *   'food'  — 已有食物填了 profile，直接在食物之間分勝負（ASMR 的目標狀態）
 *   'group' — 還沒有任何食物填 profile，先判氛圍分類，再從該組隨機挑一道
 */
export function matchGranularity() {
  return foodsWithProfile().length > 0 ? 'food' : 'group';
}

/** 把有 profile 的食物轉成 Matcher 吃的格式。 */
export function foodsAsMatchItems() {
  return foodsWithProfile().map((f) => ({
    id: f.id,
    name: f.name,
    profile: f.profile,
    description: f.asmr,
    meta: { groupId: f.group, emoji: f.emoji, image: f.image, nameEn: f.nameEn },
  }));
}

/** 從全部 20 道中隨機挑一道。 */
export function randomFood() {
  const pool = activeFoods();
  return withGroup(pool[Math.floor(Math.random() * pool.length)]);
}

/** 從指定分類中隨機挑一道。 */
export function randomFoodFromGroup(groupId) {
  const pool = foodsByGroup(groupId);
  if (pool.length === 0) return randomFood();
  return withGroup(pool[Math.floor(Math.random() * pool.length)]);
}

/**
 * 分類層級比對的第二段：在命中的分類裡決定最終是哪一道。
 * 組內有食物填了 profile 就比距離，全都沒填就隨機。
 */
export function pickFoodFromGroup(groupId, vector, weights = DEFAULT_WEIGHTS) {
  const pool = foodsByGroup(groupId);
  if (pool.length === 0) return { food: randomFood(), method: 'fallback' };

  const withProfile = pool.filter((f) => f.profile && Object.keys(f.profile).length > 0);
  if (withProfile.length === 0 || !vector) {
    return { food: withGroup(pool[Math.floor(Math.random() * pool.length)]), method: 'random' };
  }

  let best = withProfile[0];
  let bestDistance = Infinity;
  for (const food of withProfile) {
    const d = weightedEuclidean(vector, food.profile, weights);
    if (d < bestDistance) {
      bestDistance = d;
      best = food;
    }
  }
  return { food: withGroup(best), method: 'profile', distance: bestDistance };
}

/** 依 id 取回完整食物資料（含分類）。 */
export function foodById(id) {
  const food = activeFoods().find((f) => f.id === id);
  return food ? withGroup(food) : null;
}

export default foods;
