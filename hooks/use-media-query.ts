'use client'

import { useEffect, useState } from 'react'

/**
 * 回報某個 media query 目前是否成立，並在視窗變化時跟著更新。
 *
 * SSR 期間一律回 false：server 不知道瀏覽器尺寸，先猜一個值會造成 hydration 不一致。
 * 因此呼叫端要讓 false 代表「比較保守、在任何尺寸都能用」的那個版本。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
