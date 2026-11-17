/** Start of the current trading day: 00:00 Europe/Amsterdam (decision D10), DST-aware. */
export function tradingDayStart(now: Date = new Date(), timeZone = 'Europe/Amsterdam'): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const localMidnightAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'));
  const localNowAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  const offset = localNowAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(localMidnightAsUtc - offset);
}
