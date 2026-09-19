/**
 * 五個氛圍分類。
 *
 * 分類名稱、感覺描述、音樂風格與搜尋關鍵字皆來自來源資料
 * （taiwan-food-vibes-en-zh，Vibe Guide 工作表），未經改寫。
 *
 * `profile` 則是「衍生」欄位，不在來源資料中：
 * 它是把該組的音樂風格翻譯成 12 維聲音特徵，作為比對用的目標值。
 * 推導依據寫在每一組的 profileNote，之後實測後可依結果微調。
 */
export const vibeGroups = [
  {
    id: 1,
    slug: 'warm-comforting',
    name: '溫暖療癒',
    nameEn: 'Warm & Comforting',
    feeling: '熱騰騰、熟悉而安心，適合下雨天或想家的時候。',
    feelingEn: 'Hot, familiar and reassuring. Best for rainy days or moments of homesickness.',
    musicStyle: '原聲音樂、Lo-fi、獨立民謠、輕柔鋼琴',
    musicStyleEn: 'Acoustic, lo-fi, indie folk, soft piano',
    keywords: ['溫暖雨天', '台灣懷舊', '療癒系', '木吉他'],
    keywordsEn: ['warm rainy day', 'Taiwan nostalgic', 'comfort food', 'cozy acoustic'],
    profileNote: '原聲與輕柔鋼琴：音量小、動態平緩、頻譜偏暗、幾乎無雜訊、長音多。',
    profile: {
      loudness: 0.35,
      dynamics: 0.25,
      pitch: 0.35,
      pitchRange: 0.3,
      brightness: 0.25,
      roughness: 0.15,
      sharpness: 0.2,
      rhythm: 0.25,
      duration: 0.7,
      attack: 0.25,
      sustain: 0.75,
      tonality: 0.85,
    },
  },
  {
    id: 2,
    slug: 'cozy-sociable',
    name: '溫馨相聚',
    nameEn: 'Cozy & Sociable',
    feeling: '適合與朋友或家人分享，輕鬆愉快但不過度喧鬧。',
    feelingEn: 'Relaxed food to share with friends or family. Cheerful without feeling too loud.',
    musicStyle: '獨立流行、輕柔流行、輕爵士、城市民謠',
    musicStyleEn: 'Indie pop, soft pop, light jazz, city folk',
    keywords: ['朋友聚餐', '溫馨咖啡館', '輕快民謠', '柔和城市流行'],
    keywordsEn: ['dinner with friends', 'cozy café', 'happy acoustic', 'soft city pop'],
    profileNote: '輕爵士與獨立流行：各項數值居中偏上，有節奏但不強烈，樂音性高。',
    profile: {
      loudness: 0.5,
      dynamics: 0.4,
      pitch: 0.5,
      pitchRange: 0.45,
      brightness: 0.45,
      roughness: 0.25,
      sharpness: 0.35,
      rhythm: 0.45,
      duration: 0.6,
      attack: 0.45,
      sustain: 0.6,
      tonality: 0.8,
    },
  },
  {
    id: 3,
    slug: 'energetic-night-market',
    name: '熱鬧夜市',
    nameEn: 'Energetic Night Market',
    feeling: '酥脆、現做，充滿人群、霓虹燈與街頭活力。',
    feelingEn: 'Crispy, freshly cooked and full of crowds, neon lights and street energy.',
    musicStyle: '輕快流行、放克、迪斯可、歡樂嘻哈、台灣城市流行',
    musicStyleEn: 'Upbeat pop, funk, disco, playful hip-hop, Taiwanese city pop',
    keywords: ['台北夜市', '霓虹街頭', '輕快城市流行', '街頭放克'],
    keywordsEn: ['Taipei night market', 'neon street', 'upbeat city pop', 'street food funk'],
    profileNote: '放克與迪斯可：節奏密度最高、音量大、頻譜明亮、起音強、尾音短。',
    profile: {
      loudness: 0.85,
      dynamics: 0.7,
      pitch: 0.55,
      pitchRange: 0.6,
      brightness: 0.8,
      roughness: 0.55,
      sharpness: 0.7,
      rhythm: 0.9,
      duration: 0.5,
      attack: 0.85,
      sustain: 0.35,
      tonality: 0.5,
    },
  },
  {
    id: 4,
    slug: 'bold-adventurous',
    name: '大膽冒險',
    nameEn: 'Bold & Adventurous',
    feeling: '風味強烈、外觀獨特，帶有挑戰與探索新滋味的感覺。',
    feelingEn:
      'Strong flavors and unusual appearances, with a sense of challenge and discovery.',
    musicStyle: '另類搖滾、實驗電子、龐克、暗黑流行',
    musicStyleEn: 'Alternative rock, experimental electronic, punk, dark pop',
    keywords: ['實驗音樂', '怪趣街頭', '暗黑俏皮', '都市冒險'],
    keywordsEn: ['bold experimental', 'quirky street', 'dark playful', 'urban adventure'],
    profileNote: '龐克與實驗電子：粗糙度最高、動態劇烈、樂音性低（破音與噪音成分多）。',
    profile: {
      loudness: 0.8,
      dynamics: 0.8,
      pitch: 0.4,
      pitchRange: 0.7,
      brightness: 0.6,
      roughness: 0.85,
      sharpness: 0.65,
      rhythm: 0.7,
      duration: 0.55,
      attack: 0.8,
      sustain: 0.4,
      tonality: 0.3,
    },
  },
  {
    id: 5,
    slug: 'sweet-dreamy',
    name: '甜蜜夢幻',
    nameEn: 'Sweet & Dreamy',
    feeling: '柔和可愛、帶著童年回憶，適合約會或漫步老街。',
    feelingEn:
      'Soft, cute and nostalgic. Suited to dates, childhood memories and old-street walks.',
    musicStyle: '夢幻流行、臥室流行、巴薩諾瓦、台灣復古音樂',
    musicStyleEn: 'Dream pop, bedroom pop, bossa nova, retro Taiwanese music',
    keywords: ['甜蜜懷舊', '夢幻台灣', '可愛咖啡館', '復古浪漫'],
    keywordsEn: ['sweet nostalgia', 'dreamy Taiwan', 'cute café', 'retro romance'],
    profileNote: '夢幻流行：音高偏高、殘響長使尾音綿延、粗糙度低、節奏鬆散。',
    profile: {
      loudness: 0.4,
      dynamics: 0.3,
      pitch: 0.7,
      pitchRange: 0.4,
      brightness: 0.55,
      roughness: 0.15,
      sharpness: 0.3,
      rhythm: 0.35,
      duration: 0.75,
      attack: 0.2,
      sustain: 0.85,
      tonality: 0.9,
    },
  },
];

export const vibeGroupById = new Map(vibeGroups.map((g) => [g.id, g]));

/** 把氛圍分類轉成 Matcher 可以吃的格式（比對是在「分類」層級進行，不是單一食物）。 */
export function groupsAsMatchItems() {
  return vibeGroups.map((g) => ({
    id: g.slug,
    name: g.name,
    profile: g.profile,
    description: g.feeling,
    meta: { groupId: g.id, musicStyle: g.musicStyle, keywords: g.keywords },
  }));
}

export default vibeGroups;
