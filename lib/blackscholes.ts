function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Abramowitz & Stegun approximation — error < 7.5e-8
function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x >  8) return 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = normalPDF(x);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

export function deltaBS(
  S: number, K: number, T: number, r: number, sigma: number, isCall: boolean
): number {
  if (T <= 0 || sigma <= 0 || K <= 0 || S <= 0) return isCall ? 0 : -1;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return isCall ? normalCDF(d1) : normalCDF(d1) - 1;
}

export function gammaBS(
  S: number, K: number, T: number, r: number, sigma: number
): number {
  if (T <= 0 || sigma <= 0 || K <= 0 || S <= 0) return 0;
  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) /
    (sigma * Math.sqrt(T));
  return normalPDF(d1) / (S * sigma * Math.sqrt(T));
}

export function vannaBS(
  S: number, K: number, T: number, r: number, sigma: number
): number {
  if (T <= 0 || sigma <= 0 || K <= 0 || S <= 0) return 0;
  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) /
    (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return (-normalPDF(d1) * d2) / sigma;
}
