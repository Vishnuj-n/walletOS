function getLocaleForCurrency(currency: string): string {
  const currencyToLocale: Record<string, string> = {
    USD: 'en-US',
    EUR: 'de-DE',
    GBP: 'en-GB',
    INR: 'en-IN',
    JPY: 'ja-JP',
    CAD: 'en-CA',
    AUD: 'en-AU',
  };
  return currencyToLocale[currency.toUpperCase()] || 'en-US';
}

export function formatCurrency(amount: string | number, currency: string) {
  const numericValue = typeof amount === 'number' ? amount : Number(amount);
  const locale = getLocaleForCurrency(currency);

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDateInputValue(value: string) {
  if (!value) return '';
  return value.slice(0, 10);
}

export function maskIdentifier(value: string, visible = 4) {
  const visibleCount = Math.min(visible, value.length);
  return `${'*'.repeat(Math.max(value.length - visibleCount, 3))}${value.slice(value.length - visibleCount)}`;
}

export function titleCaseStatus(value: string) {
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}
