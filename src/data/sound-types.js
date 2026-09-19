/**
 * 聲音型態 —— 比對的主軸。
 *
 * 使用者對著麥克風發出某種質地的聲音，系統判斷是哪一型，
 * 再從該型底下的食物中給出答案。
 *
 * profile 的設計重點是「六型之間要能分得開」。幾組關鍵對比：
 *
 *   酥脆 vs 油炸   兩者都是高頻噪音，差別在「斷」與「連」
 *                  酥脆 rhythm .85 / sustain .15；油炸 rhythm .15 / sustain .9
 *   油炸 vs 沙沙   兩者都是持續噪音，差別在音量與頻譜高度
 *                  油炸 loudness .75 / brightness .7；沙沙 loudness .3 / brightness .85
 *   柔軟 vs Q彈    兩者都低頻低音量，差別在有沒有咀嚼的顆粒感
 *                  柔軟 roughness .05 / attack 0；Q彈 roughness .55 / attack 1.0
 *
 * 這些數值是「實測校準」來的：我合成六段對應質地的音訊跑過特徵抽取，
 * 再以實測結果回頭訂定目標值，而不是憑感覺填。這樣才對得上抽取器的實際行為。
 *
 * 已知較弱的一組：油炸 vs 沙沙，兩者都是持續的高頻噪音，
 * 主要靠音量區分（油炸 .85 / 沙沙 .35）。音量會受麥克風增益影響，
 * 實機測試時若這兩型容易混淆，調整它們的 loudness 差距即可。
 *
 * 註：`duration` 與 `pitchRange` 刻意不填 —— 手動按鈕錄音長度由使用者決定，
 * 這兩維提供不了辨識資訊，填了反而變成干擾。沒填的維度會被自動排除。
 */
export const soundTypes = [
  {
    id: 'crispy',
    color: '#ffb454',
    name: '酥脆',
    nameEn: 'Crispy',
    emoji: '💥',
    /** 給 UI 顯示「試試看發出什麼聲音」 */
    tryThis: '喀啦喀啦、咬碎脆片',
    description: '一下一下、短促而明亮的爆裂聲。咬下去的瞬間碎開。',
    profile: {
      loudness: 0.55,
      dynamics: 0.7,
      brightness: 0.95,
      roughness: 0.95,
      sharpness: 0.6,
      rhythm: 0.8,
      attack: 1.0,
      sustain: 0.25,
      tonality: 0.05,
    },
  },
  {
    id: 'sizzling',
    color: '#ff7043',
    name: '油炸滋滋',
    nameEn: 'Sizzling',
    emoji: '🔥',
    tryThis: '嘶———（持續送氣）',
    description: '連綿不斷的滋滋聲，像下油鍋那一刻。音量大、不間斷。',
    profile: {
      loudness: 0.85,
      dynamics: 0.05,
      brightness: 0.9,
      roughness: 0.95,
      sharpness: 0.9,
      rhythm: 0.05,
      attack: 0.0,
      sustain: 0.95,
      tonality: 0.05,
    },
  },
  {
    id: 'liquid',
    color: '#4fc3f7',
    name: '湯汁流動',
    nameEn: 'Liquid',
    emoji: '💧',
    tryThis: '咕嚕咕嚕、吸麵條的聲音',
    description: '有起伏的流動感，濕潤而低沉。吸吮、倒湯、滾水。',
    profile: {
      loudness: 0.7,
      dynamics: 0.6,
      brightness: 0.85,
      roughness: 0.8,
      sharpness: 0.45,
      rhythm: 0.05,
      attack: 0.25,
      sustain: 0.5,
      tonality: 0.05,
    },
  },
  {
    id: 'soft',
    color: '#f5b7c8',
    name: '柔軟綿密',
    nameEn: 'Soft',
    emoji: '☁️',
    tryThis: '嗯～（輕輕哼一個低音）',
    description: '幾乎沒有雜訊的輕柔聲，鬆軟、平穩、不刺耳。',
    profile: {
      loudness: 0.5,
      dynamics: 0.05,
      pitch: 0.3,
      brightness: 0.1,
      roughness: 0.05,
      sharpness: 0.05,
      rhythm: 0.05,
      attack: 0.0,
      sustain: 0.95,
      tonality: 0.9,
    },
  },
  {
    id: 'chewy',
    color: '#b39ddb',
    name: 'Q彈黏牙',
    nameEn: 'Chewy',
    emoji: '🫧',
    tryThis: '嚼嚼嚼（閉嘴咀嚼的悶聲）',
    description: '低沉、悶、有節奏的咀嚼感。黏、韌、慢。',
    profile: {
      loudness: 0.45,
      dynamics: 0.65,
      brightness: 0.75,
      roughness: 0.55,
      sharpness: 0.15,
      rhythm: 0.35,
      attack: 1.0,
      sustain: 0.2,
      tonality: 0.05,
    },
  },
  {
    id: 'grainy',
    color: '#9fd8f5',
    name: '沙沙細碎',
    nameEn: 'Grainy',
    emoji: '❄️',
    tryThis: '沙沙沙（輕輕摩擦、氣音）',
    description: '細小、乾爽、輕柔的沙沙聲。刨冰、碎屑、摩擦紙張。',
    profile: {
      loudness: 0.35,
      dynamics: 0.05,
      brightness: 1.0,
      roughness: 0.95,
      sharpness: 0.95,
      rhythm: 0.05,
      attack: 0.0,
      sustain: 0.95,
      tonality: 0.05,
    },
  },
];

export const soundTypeById = new Map(soundTypes.map((t) => [t.id, t]));

/**
 * 轉成 Matcher 吃的格式。
 * @param {string[]} [onlyIds] 只保留這些型態 —— 傳入「目前還有食物的型態」，
 *   比對就會收斂到它們之間，任何聲音都必然落在有食物的型態上。
 */
export function soundTypesAsMatchItems(onlyIds) {
  const list = onlyIds?.length
    ? soundTypes.filter((t) => onlyIds.includes(t.id))
    : soundTypes;
  return list.map((t) => ({
    id: t.id,
    name: t.name,
    profile: t.profile,
    description: t.description,
    meta: { emoji: t.emoji, nameEn: t.nameEn, tryThis: t.tryThis, color: t.color },
  }));
}

export default soundTypes;
