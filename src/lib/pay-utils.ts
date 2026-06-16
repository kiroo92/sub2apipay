import type { Locale } from './locale';

export function formatCreatedAt(value: string | Date, locale: Locale = 'zh'): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN');
}

export function getPaymentChannelLabel(type: string, locale: Locale = 'zh'): string {
  const map: Record<string, { zh: string; en: string }> = {
    alipay: { zh: '支付宝', en: 'Alipay' },
    wxpay: { zh: '微信支付', en: 'WeChat Pay' },
    stripe: { zh: 'Stripe', en: 'Stripe' },
  };
  return map[type]?.[locale] || type || '-';
}
