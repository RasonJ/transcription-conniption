/**
 * Run async work over items with a fixed concurrency limit (chunked pool).
 * Includes optional main-thread yields so mobile/web UI stays responsive.
 */

const yieldToMainThread = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });

export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  options?: { yieldBetweenItems?: boolean },
): Promise<R[]> {
  if (items.length === 0) return [];

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      if (options?.yieldBetweenItems && i > 0 && i % limit === 0) {
        await yieldToMainThread();
      }
      results[i] = await worker(items[i], i);
    }
  }

  const runners = Array.from({ length: limit }, () => run());
  await Promise.all(runners);
  return results;
}
