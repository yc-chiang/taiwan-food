# taiwan-food

用聲音找出最接近的台灣經典食物 —— 互動邏輯與裝置連接層。

目前這個 repo 包含**完整的核心邏輯**：麥克風連接、即時音訊處理、聲音特徵抽取與比對引擎。
**互動介面與食物清單尚未加入**，兩者的接口都已預留好。

**概念**：ASMR。對著麥克風發出不同的聲音（油炸、咀嚼、湯汁、摩擦…），
系統判斷聲音質地屬於哪一型，把最接近的台灣小吃呈現在人體胃部的位置。

**互動流程**：按下開始錄音 → 食物沿食道下行的動畫 → 結束錄音 →
中央掃描 loading → 食物出現在胃部中央 → 右側面板顯示該食物的聲音特徵。

**食物的呈現**分兩種，程式自動判斷：

| 條件 | 呈現方式 |
|---|---|
| `assets/foods/<id>.jpg` 存在 | 整張舞台換成該圖（食物畫在人體胃部裡） |
| 圖還沒放 | 霓虹粒子聚合成食物形狀（用 emoji 取形） |

圖放進去就生效，不需要改程式，也可以一張一張慢慢補。

## 現在有什麼

```
src/
├── app.js                    對外主控 API：connect / start / stop / 事件
├── config.js                 所有可調參數
├── core/
│   ├── state-machine.js      8 個狀態的互動流程
│   ├── emitter.js            事件訂閱
│   └── errors.js             錯誤碼＋可直接上畫面的中文文案
├── audio/
│   ├── mic-device.js         權限、裝置列舉與切換、熱插拔、中斷復原
│   ├── audio-engine.js       AudioContext 生命週期、音訊圖、即時音量
│   ├── capture-processor.js  AudioWorklet（含 ScriptProcessor 退路）
│   ├── vad.js                自動偵測開始／結束說話
│   ├── features.js           12 維感知特徵抽取
│   ├── fft.js                FFT
│   └── wav.js                PCM → WAV，供回放
├── match/
│   ├── matcher.js            比對引擎
│   ├── distance.js           歐式／曼哈頓／餘弦
│   ├── feature-space.js      12 個維度的定義
│   └── schema.js             食物資料驗證
└── data/
    ├── foods.js              20 道食物
    ├── sound-types.js        6 種聲音型態（比對主軸）
    └── vibe-groups.js        5 個氛圍分類（僅顯示用）

assets/
├── bgm.mp3                   背景音樂
├── esophagus.jpg             食道階段底圖
├── stomach.jpg               胃部階段底圖
└── foods/                    各食物的舞台圖（待補，見該資料夾 README）

tools/build-single.py         打包成單一 HTML（資產全內嵌）

index.html                    主介面「島嶼味覺聲場」
dev/simple-test.html          早期的極簡測試介面
dev/harness.html              工程除錯台
docs/INTEGRATION.md           串接說明與資料格式
```

## 還缺什麼

1. **各食物的 profile** → 在 `src/data/foods.js` 幫食物填上 `profile`（型態層級已可用，這是要細到單道食物才需要）
2. **食物圖片** → 目前用 emoji 佔位，填 `image` 欄位即可換成實際圖片
3. **食物舞台圖** → 20 張放進 `assets/foods/`，檔名見該資料夾的 README

### 六種聲音型態

比對的主軸。每一型底下有 2~4 道食物。

| 型態 | 試試看發出 | 食物 |
|---|---|---|
| 💥 酥脆 | 喀啦喀啦、咬碎脆片 | 鹽酥雞、蔥油餅、胡椒餅、大腸包小腸 |
| 🔥 油炸滋滋 | 嘶———（持續送氣） | 三杯雞、台灣香腸、蚵仔煎、臭豆腐 |
| 💧 湯汁流動 | 咕嚕咕嚕、吸麵條 | 牛肉麵、蚵仔麵線、擔仔麵、小籠包 |
| ☁️ 柔軟綿密 | 嗯～（輕哼低音） | 滷肉飯、刈包、車輪餅 |
| 🫧 Q彈黏牙 | 嚼嚼嚼（閉嘴咀嚼） | 豬血糕、鐵蛋、芋圓 |
| ❄️ 沙沙細碎 | 沙沙沙（輕摩擦） | 鳳梨酥、刨冰 |

型態的 profile 是實測校準的 —— 合成六段對應質地的音訊跑過特徵抽取，
再以實測結果回頭訂定目標值。六段測試音訊的辨識率為 6/6。

### 比對粒度會自動切換

| 資料狀態 | 比對方式 |
|---|---|
| 沒有任何食物填 `profile`（目前） | 先判 6 種聲音型態，再從該型隨機挑一道 |
| 有食物填了 `profile` | 直接在這些食物之間分勝負 |

切換是自動的 —— 你填完 `profile` 之後，不需要改任何一行程式碼。

## 怎麼運作

```
麥克風 ──▶ AudioContext ──┬──▶ AnalyserNode ──▶ 即時音量／頻譜 ──▶ VAD 自動起停
                          │                                    └──▶ UI 視覺化
                          └──▶ AudioWorklet ──▶ 原始 PCM
                                                   │
                                     分幀加窗 ──▶ FFT ──▶ 12 維特徵向量
                                                              │
                                              加權距離比對 ──▶ 最接近的食物 ＋ 逐維度吻合度
```

比對用的 12 個維度刻意選成「人可以用形容詞描述」的感知特徵（音高、明亮度、粗糙度、節奏密度…），
而不是 MFCC 那種人類無法手寫的係數 —— 這樣食物清單可以直接用直覺填寫：

```js
{ id: 'stinky-tofu', name: '臭豆腐', profile: { roughness: 0.9, brightness: 0.35, rhythm: 0.7 } }
```

## 本機執行

```bash
npx serve .          # 或任何靜態伺服器
# 開 http://localhost:3000/dev/harness.html
```

麥克風需要 HTTPS（`localhost` 例外）。手機測試請用 ngrok 或直接部署到 GitHub Pages。

## 瀏覽器支援

Chrome / Edge / Safari 14.1+ / Firefox。iOS Safari 已特別處理 AudioContext 喚醒、
裝置指定限制與來電中斷；舊瀏覽器自動退回 ScriptProcessor。
