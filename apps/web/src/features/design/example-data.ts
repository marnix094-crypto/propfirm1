/** Deterministic example series for the design preview. Clearly labelled "example" in the UI. */
const POINTS: Record<string, number> = { '1W': 28, '1M': 40, '3M': 60, '6M': 80, '1Y': 100 };

export function exampleSeries(range: string): number[] {
  const n = POINTS[range] ?? 40;
  let seed = n * 9301 + 49297;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const out: number[] = [];
  let v = 100;
  for (let i = 0; i < n; i++) {
    v += (rand() - 0.42) * 2.2;
    out.push(v);
  }
  return out;
}
