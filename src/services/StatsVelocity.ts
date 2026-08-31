interface DailyChapters {
  date: string;
  chapters_read: number | string;
}

interface VelocityTrend {
  current_avg_per_day: number;
  previous_avg_per_day: number;
  trend_pct: number | null;
}

/**
 * Splits a 14-day chapters-read series into two trailing 7-day windows and
 * compares them. trend_pct is null (not Infinity or 0) when the prior
 * window had zero activity — a percent change from zero is meaningless,
 * per the statistical-analysis guidance against false precision.
 */
export function computeVelocityTrend(daily: DailyChapters[]): VelocityTrend {
  const values = daily.map((d) => Number(d.chapters_read));
  const mid = Math.max(0, values.length - 7);
  const previous = values.slice(0, mid);
  const current = values.slice(mid);

  const avg = (xs: number[]): number =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

  const currentAvg = avg(current);
  const previousAvg = avg(previous);
  const trendPct =
    previousAvg > 0
      ? Math.round(((currentAvg - previousAvg) / previousAvg) * 1000) / 10
      : null;

  return {
    current_avg_per_day: Math.round(currentAvg * 100) / 100,
    previous_avg_per_day: Math.round(previousAvg * 100) / 100,
    trend_pct: trendPct,
  };
}
