# taiwan-food

用聲音找出最接近的台灣經典食物 —— 互動邏輯與裝置連接層。

目前這個 repo 包含**完整的核心邏輯**：麥克風連接、即時音訊處理、聲音特徵抽取與比對引擎。
**互動介面與食物清單尚未加入**，兩者的接口都已預留好。

**概念**：ASMR。對著麥克風發出不同的聲音（油炸、咀嚼、湯汁、剪刀…），
系統判斷這是哪一道台灣小吃的聲音，把那道食物的樣子跑出來。

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
    ├── foods.js              20 道食物（profile 待填）
    └── vibe-groups.js        5 個氛圍分類

index.html                    測試介面（一顆按鈕）
dev/harness.html              工程除錯台
docs/INTEGRATION.md           串接說明與資料格式
```

## 還缺什麼

1. **各食物的 profile** → 在 `src/data/foods.js` 幫食物填上 `profile`
2. **食物圖片** → 目前用 emoji 佔位，填 `image` 欄位即可換成實際圖片
3. **正式介面** → 現在的 `index.html` 是測試用的最小版本

### 比對粒度會自動切換

| 資料狀態 | 比對方式 |
|---|---|
| 沒有任何食物填 `profile`（目前） | 先判 5 個氛圍分類，再從該組 4 道隨機挑一道 |
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
