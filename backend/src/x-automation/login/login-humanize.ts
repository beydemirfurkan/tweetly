import type { Page } from 'patchright';

/**
 * Human-like interaction helpers for browser automation.
 *
 * Anti-bot systems detect mechanical timing patterns (fixed delays,
 * zero mouse movement, instant clicking). These helpers introduce
 * realistic jitter and mouse movement so the automation fingerprint
 * blends with organic traffic.
 *
 * All timing values are in milliseconds.
 */

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function humanDelay(min = 80, max = 350): Promise<void> {
  const ms = randInt(min, max);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function humanTypeDelay(): Promise<number> {
  return randInt(25, 75);
}

export async function moveMouseRandomly(page: Page): Promise<void> {
  const vp = page.viewportSize() ?? { width: 1280, height: 800 };
  const steps = randInt(2, 5);
  for (let i = 0; i < steps; i++) {
    const x = randInt(100, vp.width - 100);
    const y = randInt(100, vp.height - 100);
    await page.mouse.move(x, y, { steps: randInt(5, 15) });
    await humanDelay(30, 120);
  }
}

export async function humanScroll(page: Page, direction: 'down' | 'up' = 'down', times = 1): Promise<void> {
  const delta = direction === 'down' ? randInt(150, 400) : -randInt(150, 400);
  for (let i = 0; i < times; i++) {
    await page.mouse.wheel(0, delta);
    await humanDelay(200, 600);
  }
}

export async function humanClick(page: Page, x: number, y: number): Promise<void> {
  await moveMouseRandomly(page);
  await page.mouse.move(x, y, { steps: randInt(8, 20) });
  await humanDelay(50, 150);
  await page.mouse.click(x, y);
  await humanDelay(100, 300);
}

export async function humanWarmup(page: Page): Promise<void> {
  await humanDelay(500, 1500);
  await moveMouseRandomly(page);
  await humanScroll(page, 'down', randInt(1, 3));
  await humanDelay(300, 800);
  await moveMouseRandomly(page);
}

export function randomViewport(): { width: number; height: number } {
  const bases: Array<{ width: number; height: number }> = [
    { width: 1280, height: 800 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 },
  ];
  const base = bases[randInt(0, bases.length - 1)];
  return {
    width: base.width + randInt(-20, 20),
    height: base.height + randInt(-10, 10),
  };
}
