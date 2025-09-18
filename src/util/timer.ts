export function timer(timeInMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, timeInMs))
}