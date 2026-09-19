import { vibeGroupById } from './vibe-groups.js';
import { weightedEuclidean } from '../match/distance.js';
import { DEFAULT_WEIGHTS } from '../match/feature-space.js';

/**
 * 20 道台灣經典食物。
 * 名稱、英文名與氛圍分組來自來源資料（taiwan-food-vibes-en-zh），未增減。
 *
 * ── 概念：ASMR ──
 * 使用者對著麥克風發出各種聲音（咀嚼、油炸、湯汁、剪刀、翻攪…），
 * 系統判斷這是哪一道食物的聲音，然後把那道食物的樣子跑出來。
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
 * `emoji` 是「食物樣子」的暫時佔位，之後換成 `image` 的實際圖片。
 */
export const foods = [
  // ── 1 · 溫暖療癒 ──────────────────────────────────────────
  { id: 'beef-noodle-soup',  name: '牛肉麵',   nameEn: 'Taiwanese Beef Noodle Soup', group: 1, emoji: '🍜', image: null, asmr: '吸麵條、湯汁滾動',       profile: null },
  { id: 'braised-pork-rice', name: '滷肉飯',   nameEn: 'Braised Pork Rice',          group: 1, emoji: '🍚', image: null, asmr: '湯匙刮碗、黏稠拌攪',     profile: null },
  { id: 'oyster-vermicelli', name: '蚵仔麵線', nameEn: 'Oyster Vermicelli',          group: 1, emoji: '🍲', image: null, asmr: '濃稠羹湯、小口吸食',     profile: null },
  { id: 'danzai-noodles',    name: '擔仔麵',   nameEn: 'Danzai Noodles',             group: 1, emoji: '🍜', image: null, asmr: '小碗輕碰、清湯',         profile: null },

  // ── 2 · 溫馨相聚 ──────────────────────────────────────────
  { id: 'soup-dumplings',    name: '小籠包',   nameEn: 'Soup Dumplings',             group: 2, emoji: '🥟', image: null, asmr: '咬破麵皮、吸湯汁',       profile: null },
  { id: 'pork-belly-bun',    name: '刈包',     nameEn: 'Taiwanese Pork Belly Bun',   group: 2, emoji: '🥪', image: null, asmr: '鬆軟麵皮、花生粉',       profile: null },
  { id: 'three-cup-chicken', name: '三杯雞',   nameEn: 'Three-Cup Chicken',          group: 2, emoji: '🍗', image: null, asmr: '砂鍋翻炒、九層塔下鍋',   profile: null },
  { id: 'taiwanese-sausage', name: '台灣香腸', nameEn: 'Taiwanese Sausage',          group: 2, emoji: '🌭', image: null, asmr: '炭烤滋滋、咬下爆汁',     profile: null },

  // ── 3 · 熱鬧夜市 ──────────────────────────────────────────
  { id: 'oyster-omelet',     name: '蚵仔煎',   nameEn: 'Oyster Omelet',              group: 3, emoji: '🍳', image: null, asmr: '鐵板煎、鍋鏟刮動',       profile: null },
  { id: 'fried-chicken',     name: '鹽酥雞',   nameEn: 'Taiwanese Fried Chicken',    group: 3, emoji: '🍗', image: null, asmr: '下油鍋爆響、酥脆咀嚼',   profile: null },
  { id: 'scallion-pancake',  name: '蔥油餅',   nameEn: 'Scallion Pancake',           group: 3, emoji: '🫓', image: null, asmr: '煎餅翻面、撕開酥層',     profile: null },
  { id: 'pepper-bun',        name: '胡椒餅',   nameEn: 'Pepper Bun',                 group: 3, emoji: '🥟', image: null, asmr: '窯烤硬殼、咬碎脆皮',     profile: null },

  // ── 4 · 大膽冒險 ──────────────────────────────────────────
  { id: 'stinky-tofu',       name: '臭豆腐',   nameEn: 'Stinky Tofu',                group: 4, emoji: '🧈', image: null, asmr: '滾油劇烈滋滋、夾起瀝油', profile: null },
  { id: 'pigs-blood-cake',   name: '豬血糕',   nameEn: "Pig's Blood Cake",           group: 4, emoji: '🍡', image: null, asmr: '黏糯咀嚼、沾花生粉',     profile: null },
  { id: 'sausage-in-sausage',name: '大腸包小腸', nameEn: 'Small Sausage in Large Sausage', group: 4, emoji: '🌭', image: null, asmr: '剪刀剪斷、炭烤爆皮', profile: null },
  { id: 'iron-eggs',         name: '鐵蛋',     nameEn: 'Iron Eggs',                  group: 4, emoji: '🥚', image: null, asmr: '硬韌咀嚼、緊實有嚼勁',   profile: null },

  // ── 5 · 甜蜜夢幻 ──────────────────────────────────────────
  { id: 'pineapple-cake',    name: '鳳梨酥',   nameEn: 'Pineapple Cake',             group: 5, emoji: '🍍', image: null, asmr: '拆紙盒、酥鬆碎屑',       profile: null },
  { id: 'taro-balls',        name: '芋圓',     nameEn: 'Taro Balls',                 group: 5, emoji: '🍡', image: null, asmr: 'Q 彈咀嚼、冰塊碰撞',     profile: null },
  { id: 'shaved-ice',        name: '刨冰',     nameEn: 'Taiwanese Shaved Ice',       group: 5, emoji: '🍧', image: null, asmr: '刨冰機沙沙、湯匙挖冰',   profile: null },
  { id: 'wheel-cake',        name: '車輪餅',   nameEn: 'Wheel Cake',                 group: 5, emoji: '🥮', image: null, asmr: '烤模扣出、綿密內餡',     profile: null },
];

/** 取得某個氛圍分類底下的所有食物。 */
export function foodsByGroup(groupId) {
  return foods.filter((f) => f.group === groupId);
}

/** 把食物補上它所屬分類的完整資訊，方便 UI 直接顯示。 */
export function withGroup(food) {
  return { ...food, vibe: vibeGroupById.get(food.group) ?? null };
}

/** 有填 profile 的食物。決定要走食物層級還是分類層級比對。 */
export function foodsWithProfile() {
  return foods.filter((f) => f.profile && Object.keys(f.profile).length > 0);
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
  return withGroup(foods[Math.floor(Math.random() * foods.length)]);
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
  const food = foods.find((f) => f.id === id);
  return food ? withGroup(food) : null;
}

export default foods;
