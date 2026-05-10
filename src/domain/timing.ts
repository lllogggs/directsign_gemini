const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (time: number) => {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

const parseTime = (value?: string) => {
  if (!value) return Number.NaN;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
};

export const formatElapsedDayLabel = (
  value: string | undefined,
  currentTime: number,
  prefix: string,
) => {
  const time = parseTime(value);
  if (!Number.isFinite(time)) return `${prefix} D+0`;

  const days = Math.max(
    0,
    Math.floor((startOfDay(currentTime) - startOfDay(time)) / DAY_MS),
  );

  return `${prefix} D+${days}`;
};

export const formatUploadDueLabel = (
  value: string | undefined,
  currentTime: number,
  prefix = "업로드",
) => {
  const time = parseTime(value);
  if (!Number.isFinite(time)) {
    return prefix === "업로드" ? "업로드일 미정" : `${prefix} 미정`;
  }

  const days = Math.ceil((startOfDay(time) - startOfDay(currentTime)) / DAY_MS);

  if (days > 0) return `${prefix} D-${days}`;
  if (days === 0) return `${prefix} D-day`;
  return `${prefix} D+${Math.abs(days)}`;
};
