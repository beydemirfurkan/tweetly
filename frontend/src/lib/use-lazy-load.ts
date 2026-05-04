'use client';

import { useEffect } from 'react';

export function useLazyLoad(callback: () => void): void {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      callback();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [callback]);
}
