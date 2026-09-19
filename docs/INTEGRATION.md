# 串接說明

這份文件寫給兩件事：**接上你的介面**，以及 **填入食物清單**。核心邏輯已完成，兩者都不需要改動 `src/` 底下的音訊程式碼。

---

## 一、接上你的介面

### 最小可動版本

```js
import { createFoodVoiceMatcher, State } from './src/app.js';
import { foods } from './src/data/foods.js';

const app = createFoodVoiceMatcher();
app.loadFoods(foods);

app.on('state', ({ to }) => renderScreen(to));
app.on('level', ({ db, waveform }) => drawVisualizer(waveform, db));
app.on('result', ({ best, matches }) => showResult(best, matches));
app.on('error', (err) => showToast(err.messageZh));

// ⚠️ 必須在使用者點擊事件裡直接呼叫，Safari／iOS 才會放行
startButton.addEventListener('click', async () => {
  await app.connect();
  await app.start();
});
```

### 狀態機

UI 只要對這幾個狀態各畫一個畫面就完成了：

| 狀態 | 意義 | 建議畫面 |
|---|---|---|
| `idle` | 尚未要權限 | 首頁、CTA 按鈕 |
| `connecting` | 正在要麥克風權限 | 轉圈、引導文案 |
| `ready` | 麥克風就緒，等待觸發 | 「按一下開始」 |
| `listening` | 已在聽，但還沒偵測到聲音 | 「發出聲音看看」＋呼吸動畫 |
| `recording` | 收音中 | 波形視覺化＋進度 |
| `analyzing` | 特徵抽取與比對中 | 過場動畫（約 50–200ms） |
| `result` | 有結果 | 結果卡片 |
| `error` | 出錯 | 依 `context.error.code` 分流 |

`analyzing` 很短但**一定要畫**，否則使用者會看到畫面卡一下。

### 事件

| 事件 | payload | 用途 |
|---|---|---|
| `state` | `{from, to, context}` | 切畫面 |
| `level` | `{rms, peak, db, waveform, frequency}` | 波形／音量條視覺化 |
| `vad` | `{event, db, noiseFloorDb, aboveFloorDb}` | 顯示「聽到你了」的即時回饋 |
| `progress` | `{elapsedMs, remainingMs, ratio}` | 錄音倒數環 |
| `result` | `{best, matches, confident, features, audio}` | 結果畫面 |
| `devices` | `{devices, activeDeviceId}` | 麥克風選單（桌機用） |
| `permission` | `{state}` | 權限狀態變化 |
| `interrupted` | `{muted}` | 來電／其他 App 搶走麥克風 |
| `timeout` | `{waitedMs}` | 等太久沒聲音 |
| `error` | `AppError` | 錯誤提示 |

`on()` 回傳 unsubscribe function，元件卸載時記得呼叫。

### 視覺化

`level` 事件預設每 50ms 發一次（`config.audio.levelIntervalMs`）。事件不直接驅動繪圖——快取最新值，用 `requestAnimationFrame` 畫，這樣即使事件頻率低於 60fps，動畫也能自己補間：

```js
let latest = null;
app.on('level', (l) => { latest = l; });

(function frame() {
  requestAnimationFrame(frame);
  if (latest) draw(latest.waveform, latest.db);
})();
```

想要更即時的回饋就把 `levelIntervalMs` 調到 16，代價是主執行緒負擔變高。

`level.frequency` 是 `Uint8Array`（0–255 的頻譜），`level.waveform` 是 `Float32Array`（-1~1 的時域波形）。畫頻譜柱狀圖用前者，畫波形線用後者。

### 結果資料

```js
app.on('result', ({ best, matches, confident, features, audio }) => {
  best.name;                    // 食物名稱
  best.similarity;              // 0~1
  best.breakdown;               // 逐維度吻合度，已由高到低排序
  best.breakdown[0].label;      // 例如「粗糙度」
  best.breakdown[0].fit;        // 例如 0.95

  matches;                      // 前 N 名（config.match.topK，預設 3）
  confident;                    // 是否超過 minConfidence 門檻
  features.vector;              // 這次輸入的 12 維特徵值
  audio.blob;                   // WAV，可直接 URL.createObjectURL() 回放
});
```

`breakdown` 是給文案用的好東西——可以寫出「因為你的聲音**很粗糙**又**很明亮**，最像臭豆腐下鍋」這種解釋，比只給一個百分比有說服力得多。

---

## 二、食物資料格式

### 兩種比對粒度

比對可以在兩種層級進行，系統依資料自動決定，你不用改程式：

- **氛圍分類層級**（目前狀態）：20 道食物分成 5 組，比對只分辨這 5 組，
  命中後從該組的 4 道中隨機挑一道。目標值寫在 `src/data/vibe-groups.js` 的 `group.profile`。
- **食物層級**：只要有任何一道食物填了自己的 `profile`，比對就改成直接在這些食物之間分勝負。
  沒填 `profile` 的food 不參與。

ASMR 的目標狀態是後者 —— 每道食物有自己的聲音指紋。

### 食物欄位

`src/data/foods.js` 裡每一道的格式：

```js
{
  id: 'stinky-tofu',              // 唯一識別
  name: '臭豆腐',
  nameEn: 'Stinky Tofu',
  group: 4,                       // 所屬氛圍分類 1~5
  emoji: '🧈',                     // 「食物樣子」的佔位
  image: null,                    // 填上圖片路徑就會取代 emoji
  asmr: '滾油劇烈滋滋、夾起瀝油',     // 聲音提示，方便對照著填 profile
  profile: {                      // ← 你要填的；null 表示不參與食物層級比對
    roughness: 0.95,
    brightness: 0.6,
    rhythm: 0.4,
    tonality: 0.05,
  },
}
```

### 十二個維度

不必全部填。**沒填的維度會被完全排除**，權重自動重新分配——所以填 4 個維度的食物不會因為「少填」而吃虧。

| key | 中文 | 0 是什麼 | 1 是什麼 |
|---|---|---|---|
| `loudness` | 音量 | 氣音般輕 | 大聲喊 |
| `dynamics` | 起伏 | 一路平穩 | 忽大忽小 |
| `pitch` | 音高 | 低沉 | 尖高 |
| `pitchRange` | 音域變化 | 單一音 | 大幅滑音 |
| `brightness` | 明亮度 | 悶厚 | 清亮刺耳 |
| `roughness` | 粗糙度 | 純淨樂音 | 沙沙／嘶嘶／爆裂 |
| `sharpness` | 銳利度 | 圓潤 | 尖脆 |
| `rhythm` | 節奏密度 | 一個長音 | 連續快速斷奏 |
| `duration` | 長度 | 極短促 | 拉很長 |
| `attack` | 起音 | 慢慢淡入 | 瞬間爆發 |
| `sustain` | 延續感 | 一下就消失 | 尾音綿長 |
| `tonality` | 樂音性 | 純噪音 | 有明確音高 |

### 填值的實務建議

1. **先填最有辨識度的 3–5 個維度就好**，填滿 12 個反而會讓所有食物擠在中間值附近，彼此難以區分。
2. **極端值比中間值有用**。0.5 幾乎不提供資訊；0.05 和 0.95 才會讓比對結果分得開。
3. **檢查彼此有沒有撞在一起**。兩個食物 profile 太接近時，使用者會覺得系統在亂猜。可以用：

```js
import { Matcher } from './src/match/matcher.js';
// 把每個食物的 profile 當成輸入去比對，如果第一名不是它自己，代表撞號了
```

4. 填完後載入時看 console，`loadFoods()` 會回傳 `warnings` 告訴你哪幾筆填太少。

---

## 三、可調參數

全部在 `src/config.js`，建構時覆寫：

```js
const app = createFoodVoiceMatcher({
  vad: { enabled: false },            // 關掉自動收音，改成長按錄音
  recording: { maxDurationMs: 5000 },
  match: { topK: 5, metric: 'cosine', minConfidence: 0.6 },
});
```

幾個值得注意的：

- **`audio.echoCancellation / noiseSuppression / autoGainControl` 預設全關。** 這三個是為了通話品質設計的，會把我們要拿來比對的頻譜特徵和動態範圍削掉。除非你改成語音辨識模式，否則不要打開。
- **`vad.startThresholdDb`（預設 10）** 是「比背景噪音高多少 dB 才算有聲」。在夜市之類的吵雜環境要調高到 14–16；在安靜室內可以降到 8。
- **`match.metric`**：`euclidean`（預設）對單一維度的大落差敏感；`cosine` 只看特徵形狀、忽略整體強度——如果你不希望「大聲」本身影響結果就用它。
- **`match.cooldownRounds`**：設成 2–3 可以避免連續好幾次都跳同一個食物。

---

## 四、行動裝置注意事項

這些是實作時已處理、但你在設計流程時需要知道的限制：

| 限制 | 影響到的設計決策 |
|---|---|
| 必須 HTTPS（`localhost` 除外） | 手機測試要用 ngrok 或直接部署 |
| `connect()` 必須在使用者手勢的同步呼叫鏈中 | **不能**自動要權限，一定要有一顆按鈕 |
| iOS 不允許網頁指定麥克風 | iOS 上不要出現「選擇麥克風」的 UI |
| iOS 切到背景會 suspend 音訊 | 切回前景已自動嘗試恢復，但可能需要再點一下 |
| 來電／其他 App 會搶走麥克風 | 監聽 `interrupted` 事件，顯示「請重新開始」 |
| 授權前裝置名稱是空字串 | 「選擇麥克風」的選單只能在授權後才有意義 |
| iOS 會忽略指定的取樣率 | 所有運算都以 `AudioContext.sampleRate` 為準，已處理 |

---

## 五、除錯

`dev/harness.html` 是工程用的測試台，可以看到即時波形、VAD 判斷過程、完整的特徵向量與比對排名。手機測試就開這一頁。

它用的是寫死的假資料，**不是**食物清單。正式介面請另外建 `index.html`。
