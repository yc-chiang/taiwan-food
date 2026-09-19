/**
 * 迭代式 radix-2 FFT。只需要實數輸入的幅度頻譜，所以介面收實數、回傳 magnitude。
 * 預先算好旋轉因子與位元反轉表，逐幀重複使用時才不會每次重算。
 */
export class FFT {
  constructor(size) {
    if ((size & (size - 1)) !== 0) throw new Error('FFT size 必須是 2 的次方');
    this.size = size;
    this.cos = new Float32Array(size / 2);
    this.sin = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i += 1) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / size);
      this.sin[i] = Math.sin((-2 * Math.PI * i) / size);
    }
    this.reverse = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i += 1) {
      let r = 0;
      for (let b = 0; b < bits; b += 1) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.reverse[i] = r;
    }
    this.re = new Float32Array(size);
    this.im = new Float32Array(size);
  }

  /**
   * @param {Float32Array} input 長度需等於 size
   * @param {Float32Array} [out] 輸出 magnitude，長度 size/2+1
   */
  magnitude(input, out = new Float32Array(this.size / 2 + 1)) {
    const { size, re, im, reverse, cos, sin } = this;
    for (let i = 0; i < size; i += 1) {
      re[i] = input[reverse[i]];
      im[i] = 0;
    }
    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1;
      const step = size / len;
      for (let i = 0; i < size; i += len) {
        for (let j = 0; j < half; j += 1) {
          const tIdx = j * step;
          const c = cos[tIdx];
          const s = sin[tIdx];
          const a = i + j;
          const b = a + half;
          const tre = re[b] * c - im[b] * s;
          const tim = re[b] * s + im[b] * c;
          re[b] = re[a] - tre;
          im[b] = im[a] - tim;
          re[a] += tre;
          im[a] += tim;
        }
      }
    }
    for (let i = 0; i <= size / 2; i += 1) {
      out[i] = Math.hypot(re[i], im[i]);
    }
    return out;
  }
}

/** Hann 窗，減少分幀造成的頻譜洩漏 */
export function hannWindow(size) {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}
