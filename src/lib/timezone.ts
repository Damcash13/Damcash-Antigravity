type DateInput = string | number | Date | null | undefined;

const DEFAULT_DATE_TIME: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

const DEFAULT_DATE: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

const toDate = (value: DateInput): Date | null => {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getUserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export const getTimeZoneLabel = (value: DateInput = Date.now()): string => {
  const date = toDate(value) ?? new Date();
  try {
    const part = new Intl.DateTimeFormat(undefined, {
      timeZone: getUserTimeZone(),
      timeZoneName: 'short',
    }).formatToParts(date).find(item => item.type === 'timeZoneName');
    return part?.value || getUserTimeZone();
  } catch {
    return getUserTimeZone();
  }
};

export const formatLocalDateTime = (
  value: DateInput,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_TIME,
  includeTimeZone = false,
): string => {
  const date = toDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: getUserTimeZone(),
    ...(includeTimeZone ? { timeZoneName: 'short' as const } : {}),
  }).format(date);
};

export const formatLocalDate = (
  value: DateInput,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE,
  includeTimeZone = false,
): string => formatLocalDateTime(value, options, includeTimeZone);
