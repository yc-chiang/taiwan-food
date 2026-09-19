/**
 * AudioWorklet processor：在音訊執行緒把原始 PCM 丟回主執行緒。
 * 這個檔案由 AudioEngine 以 addModule() 動態載入，不能被 bundler 內聯。
 */
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.port.onmessage = (event) => {
      const type = event.data?.type;
      if (type === 'start') this.active = true;
      else if (type === 'stop') this.active = false;
    };
  }

  process(inputs) {
    if (!this.active) return true;
    const channel = inputs[0]?.[0];
    if (!channel || channel.length === 0) return true;
    // 必須複製：render quantum 的底層 buffer 會被下一輪重用
    const copy = new Float32Array(channel);
    this.port.postMessage(copy, [copy.buffer]);
    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
