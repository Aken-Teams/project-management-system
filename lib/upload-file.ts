import type { TaskLogAttachment } from '@/lib/mock-data'

/**
 * 以 XMLHttpRequest 上傳單一檔案，回報「真實上傳進度」。
 * fetch() 無法回報 upload progress，故上傳一律走這支以取得 xhr.upload.onprogress。
 *
 * @param onProgress 進度回呼，0~100；長度未知時回 -1（顯示為不確定進度）
 */
export function uploadFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<TaskLogAttachment> {
  return new Promise((resolve, reject) => {
    const fd = new FormData()
    fd.append('file', file)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload')

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100))
      else onProgress?.(-1)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText))
        } catch {
          reject(new Error('上傳回應解析失敗'))
        }
      } else {
        let msg = '上傳失敗'
        try { msg = JSON.parse(xhr.responseText).error || msg } catch { /* 用預設訊息 */ }
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => reject(new Error('網路錯誤，上傳失敗'))
    xhr.onabort = () => reject(new Error('上傳已取消'))

    xhr.send(fd)
  })
}
