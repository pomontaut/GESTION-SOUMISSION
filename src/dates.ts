/** Today as yyyy-mm-dd in the user's local time zone (toISOString would give the UTC date, off by one in the evening). */
export const localToday = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
