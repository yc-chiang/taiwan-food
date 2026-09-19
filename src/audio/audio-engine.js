import { Emitter } from '../core/emitter.js';
import { AppError, ErrorCode } from '../core/errors.js';
import { isAppleWebKit } from './mic-device.js';

/**
 * AudioContext 生命週期與音訊圖管理。
 *
 *   MediaStreamSource ─┬─▶ AnalyserNode      （即時音量／頻譜，給 UI 畫視覺化）
 *                      └─▶ CaptureNode       （抓原始 PCM 做特徵比對）
 *
 * 刻意不接到 destination：接了會從喇叭放出自己的聲音造成回授。
 *
 * 事件：
 *   'level'   {rms, peak, db, frequency}  節流後的即時音量，給波形／音量條用
 *   'frames'  {samples, sampleRate}       原始 PCM 區塊（錄音中才會有）
 *   'statechange' {state}                 AudioContext 狀態
 */
export class AudioEngine extends Emitter {
  #ctx = null;
  #source = null;
  #analyser = null;
  #captureNode = null;
  #config;
  #timeData = null;
  #freqData = null;
  #levelTimer = null;
  #capturing = false;
  #captureBuffers = [];
  #capturedLength = 0;
  #usingWorklet = false;

  constructor(audioConfig) {
    super();
    this.#config = audioConfig;
  }

  get context() {
    return this.#ctx;
  }

  get sampleRate() {
    // 一律以實際 AudioContext 的取樣率為準，不要相信 config 裡要求的值
    return this.#ctx?.sampleRate ?? this.#config.sampleRate;
  }

  get analyser() {
    return this.#analyser;
  }

  get isRunning() {
    return this.#ctx?.state === 'running';
  }

  /**
   * 建立 AudioContext 並接上串流。
   * 必須在使用者手勢內呼叫，否則 Safari / Chrome 的 autoplay policy 會讓它停在 suspended。
   */
  async attach(stream) {
    const AudioCtx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioCtx) throw new AppError(ErrorCode.UNSUPPORTED_BROWSER);

    if (!this.#ctx || this.#ctx.state === 'closed') {
      // latencyHint:'interactive' 讓緩衝區小一點，視覺化才跟得上聲音
      this.#ctx = new AudioCtx({ latencyHint: 'interactive' });
      this.#watchContextState();
    }
    await this.resume();

    this.#teardownGraph();

    this.#source = this.#ctx.createMediaStreamSource(stream);

    this.#analyser = this.#ctx.createAnalyser();
    this.#analyser.fftSize = this.#config.fftSize;
    // 給視覺化用的平滑，0.6 在「反應快」與「不抖」之間還算平衡
    this.#analyser.smoothingTimeConstant = 0.6;
    this.#timeData = new Float32Array(this.#analyser.fftSize);
    this.#freqData = new Uint8Array(this.#analyser.frequencyBinCount);
    this.#source.connect(this.#analyser);

    await this.#setupCaptureNode();
    this.#startLevelLoop();
    return this.#ctx;
  }

  /**
   * 原始 PCM 擷取。優先用 AudioWorklet（跑在音訊執行緒，不會被主執行緒卡住），
   * 舊瀏覽器退回已廢棄但仍可用的 ScriptProcessor。
   */
  async #setupCaptureNode() {
    if (globalThis.AudioWorkletNode && this.#ctx.audioWorklet) {
      try {
        const url = new URL('./capture-processor.js', import.meta.url);
        await this.#ctx.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(this.#ctx, 'capture-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          channelCount: 1,
        });
        node.port.onmessage = (event) => this.#onSamples(event.data);
        this.#source.connect(node);
        this.#captureNode = node;
        this.#usingWorklet = true;
        return;
      } catch (err) {
        // 常見於本機 file:// 或 CORS 擋掉 worklet 模組，靜默退回舊方案
        console.warn('[audio] AudioWorklet 不可用，改用 ScriptProcessor：', err);
      }
    }

    const node = this.#ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (event) => {
      if (!this.#capturing) return;
      this.#onSamples(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    this.#source.connect(node);
    // ScriptProcessor 必須接到 destination 才會被排程；用 0 增益避免真的發出聲音
    const mute = this.#ctx.createGain();
    mute.gain.value = 0;
    node.connect(mute);
    mute.connect(this.#ctx.destination);
    this.#captureNode = node;
    this.#usingWorklet = false;
  }

  #onSamples(samples) {
    if (!this.#capturing || !samples?.length) return;
    this.#captureBuffers.push(samples);
    this.#capturedLength += samples.length;
    this.emit('frames', { samples, sampleRate: this.sampleRate });
  }

  #watchContextState() {
    this.#ctx.addEventListener?.('statechange', () => {
      this.emit('statechange', { state: this.#ctx.state });
    });
  }

  /**
   * 喚醒被暫停的 AudioContext。
   * iOS 在切到背景、接電話、或按下靜音鍵之後會把 context 丟到 suspended / interrupted。
   */
  async resume() {
    if (!this.#ctx) return;
    if (this.#ctx.state === 'running') return;
    try {
      await this.#ctx.resume();
    } catch (err) {
      throw new AppError(ErrorCode.AUDIO_CONTEXT_BLOCKED, { cause: err });
    }
    // Safari 的 resume() 會 resolve 但狀態仍是 suspended，必須實際回查
    if (this.#ctx.state !== 'running' && isAppleWebKit()) {
      throw new AppError(ErrorCode.AUDIO_CONTEXT_BLOCKED);
    }
  }

  async suspend() {
    if (this.#ctx && this.#ctx.state === 'running') await this.#ctx.suspend();
  }

  #startLevelLoop() {
    this.#stopLevelLoop();
    // 用 setInterval 而非 rAF：頁面在背景時 rAF 會停，但我們仍需要 VAD 判斷
    this.#levelTimer = setInterval(() => {
      const level = this.readLevel();
      if (level) this.emit('level', level);
    }, this.#config.levelIntervalMs);
  }

  #stopLevelLoop() {
    if (this.#levelTimer) {
      clearInterval(this.#levelTimer);
      this.#levelTimer = null;
    }
  }

  /** 讀一次當下音量與頻譜快照。UI 想自己用 rAF 畫波形也可以直接呼叫這個。 */
  readLevel() {
    if (!this.#analyser) return null;
    this.#analyser.getFloatTimeDomainData(this.#timeData);
    this.#analyser.getByteFrequencyData(this.#freqData);

    let sumSquares = 0;
    let peak = 0;
    for (let i = 0; i < this.#timeData.length; i += 1) {
      const v = this.#timeData[i];
      sumSquares += v * v;
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sumSquares / this.#timeData.length);
    return {
      rms,
      peak,
      // -100 dB 當作靜音底，避免 log(0) 得到 -Infinity
      db: rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100,
      frequency: this.#freqData,
      waveform: this.#timeData,
    };
  }

  startCapture() {
    this.#captureBuffers = [];
    this.#capturedLength = 0;
    this.#capturing = true;
    if (this.#usingWorklet) this.#captureNode?.port.postMessage({ type: 'start' });
  }

  /**
   * 丟掉開頭多餘的已擷取音訊，只保留最後 keepMs 毫秒。
   * 用在 VAD 偵測到出聲的瞬間：等待期間錄到的靜音不該算進錄音長度，
   * 但要留一小段 pre-roll，否則起音的瞬態會被切掉（起音正是辨識度最高的部分）。
   */
  trimCaptureToLast(keepMs) {
    const keepSamples = Math.floor((keepMs / 1000) * this.sampleRate);
    if (this.#capturedLength <= keepSamples) return;

    let drop = this.#capturedLength - keepSamples;
    while (drop > 0 && this.#captureBuffers.length > 0) {
      const first = this.#captureBuffers[0];
      if (first.length <= drop) {
        this.#captureBuffers.shift();
        this.#capturedLength -= first.length;
        drop -= first.length;
      } else {
        this.#captureBuffers[0] = first.subarray(drop);
        this.#capturedLength -= drop;
        drop = 0;
      }
    }
  }

  /** 停止擷取並回傳串接好的單聲道 PCM。 */
  stopCapture() {
    this.#capturing = false;
    if (this.#usingWorklet) this.#captureNode?.port.postMessage({ type: 'stop' });

    const merged = new Float32Array(this.#capturedLength);
    let offset = 0;
    for (const chunk of this.#captureBuffers) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.#captureBuffers = [];
    this.#capturedLength = 0;
    return { samples: merged, sampleRate: this.sampleRate };
  }

  #teardownGraph() {
    try {
      this.#source?.disconnect();
      this.#analyser?.disconnect();
      if (this.#captureNode) {
        this.#captureNode.disconnect();
        if (this.#usingWorklet) this.#captureNode.port.onmessage = null;
        else this.#captureNode.onaudioprocess = null;
      }
    } catch {
      // 節點可能已經被瀏覽器回收，斷線失敗無所謂
    }
    this.#source = null;
    this.#analyser = null;
    this.#captureNode = null;
  }

  async destroy() {
    this.#stopLevelLoop();
    this.#capturing = false;
    this.#teardownGraph();
    if (this.#ctx && this.#ctx.state !== 'closed') {
      try {
        await this.#ctx.close();
      } catch {
        /* 已關閉 */
      }
    }
    this.#ctx = null;
    this.removeAll();
  }
}
