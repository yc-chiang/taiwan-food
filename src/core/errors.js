/**
 * 統一錯誤碼。UI 只要讀 code 決定要顯示哪個畫面，messageZh 是可直接上畫面的預設文案。
 */
export const ErrorCode = {
  INSECURE_CONTEXT: 'INSECURE_CONTEXT',
  UNSUPPORTED_BROWSER: 'UNSUPPORTED_BROWSER',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  PERMISSION_DISMISSED: 'PERMISSION_DISMISSED',
  NO_DEVICE: 'NO_DEVICE',
  DEVICE_IN_USE: 'DEVICE_IN_USE',
  DEVICE_LOST: 'DEVICE_LOST',
  OVERCONSTRAINED: 'OVERCONSTRAINED',
  AUDIO_CONTEXT_BLOCKED: 'AUDIO_CONTEXT_BLOCKED',
  RECORDING_TOO_SHORT: 'RECORDING_TOO_SHORT',
  RECORDING_TOO_QUIET: 'RECORDING_TOO_QUIET',
  NO_FOOD_DATA: 'NO_FOOD_DATA',
  INVALID_FOOD_DATA: 'INVALID_FOOD_DATA',
  ABORTED: 'ABORTED',
  UNKNOWN: 'UNKNOWN',
};

const MESSAGES = {
  [ErrorCode.INSECURE_CONTEXT]:
    '瀏覽器只允許在 HTTPS（或 localhost）下使用麥克風，請改用安全連線開啟。',
  [ErrorCode.UNSUPPORTED_BROWSER]: '這個瀏覽器不支援麥克風錄音，請改用 Chrome、Edge 或 Safari。',
  [ErrorCode.PERMISSION_DENIED]:
    '麥克風權限被拒絕。請到瀏覽器網址列的權限設定重新允許，再試一次。',
  [ErrorCode.PERMISSION_DISMISSED]: '尚未授權麥克風，請再按一次並選擇「允許」。',
  [ErrorCode.NO_DEVICE]: '找不到可用的麥克風，請確認裝置已連接。',
  [ErrorCode.DEVICE_IN_USE]: '麥克風正被其他程式占用，請關閉後再試一次。',
  [ErrorCode.DEVICE_LOST]: '麥克風連線中斷（可能是耳機被拔除或切換了裝置）。',
  [ErrorCode.OVERCONSTRAINED]: '這支麥克風不支援目前的錄音設定，已嘗試改用預設設定。',
  [ErrorCode.AUDIO_CONTEXT_BLOCKED]: '需要你先點一下畫面，瀏覽器才會允許啟動音訊。',
  [ErrorCode.RECORDING_TOO_SHORT]: '錄得太短了，請再長一點。',
  [ErrorCode.RECORDING_TOO_QUIET]: '幾乎沒有聲音，請靠近麥克風再試一次。',
  [ErrorCode.NO_FOOD_DATA]: '尚未載入食物資料。',
  [ErrorCode.INVALID_FOOD_DATA]: '食物資料格式不正確。',
  [ErrorCode.ABORTED]: '已取消。',
  [ErrorCode.UNKNOWN]: '發生未預期的錯誤。',
};

export class AppError extends Error {
  constructor(code, { cause, detail } = {}) {
    const messageZh = MESSAGES[code] ?? MESSAGES[ErrorCode.UNKNOWN];
    super(`${code}: ${messageZh}`, { cause });
    this.name = 'AppError';
    this.code = code;
    this.messageZh = messageZh;
    this.detail = detail ?? null;
    // 使用者能否靠自己重試解決：UI 可據此決定要不要顯示「再試一次」按鈕
    this.recoverable = ![ErrorCode.INSECURE_CONTEXT, ErrorCode.UNSUPPORTED_BROWSER].includes(code);
  }
}

/**
 * 把 getUserMedia 丟出的原生 DOMException 轉成我們的錯誤碼。
 * 各家瀏覽器的 error.name 不完全一致，這裡把已知變體都收斂進來。
 */
export function fromMediaError(err) {
  const name = err?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      // Chrome 在使用者直接關掉提示（而非按拒絕）時 message 會是空的
      return new AppError(
        err.message ? ErrorCode.PERMISSION_DENIED : ErrorCode.PERMISSION_DISMISSED,
        { cause: err },
      );
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new AppError(ErrorCode.NO_DEVICE, { cause: err });
    case 'NotReadableError':
    case 'TrackStartError':
      return new AppError(ErrorCode.DEVICE_IN_USE, { cause: err });
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return new AppError(ErrorCode.OVERCONSTRAINED, { cause: err, detail: err.constraint });
    case 'AbortError':
      return new AppError(ErrorCode.ABORTED, { cause: err });
    default:
      return new AppError(ErrorCode.UNKNOWN, { cause: err });
  }
}
