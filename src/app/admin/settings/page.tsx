'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, Suspense } from 'react';
import PayPageLayout from '@/components/PayPageLayout';
import { resolveLocale, type Locale } from '@/lib/locale';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ConfigItem {
  key: string;
  value: string;
  group?: string;
  label?: string;
}

interface ConfigGroup {
  id: string;
  title: string;
  titleEn: string;
  fields: ConfigField[];
}

interface ConfigField {
  key: string;
  label: string;
  labelEn: string;
  type: 'text' | 'number' | 'textarea' | 'password' | 'checkbox-group';
  options?: string[]; // for checkbox-group
  group: string;
}

/* ------------------------------------------------------------------ */
/*  Sensitive field helpers                                            */
/* ------------------------------------------------------------------ */

const SENSITIVE_PATTERNS = ['KEY', 'SECRET', 'PASSWORD', 'PRIVATE'];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => key.toUpperCase().includes(p));
}

function isMaskedValue(value: string): boolean {
  return /^\*+/.test(value);
}

/* ------------------------------------------------------------------ */
/*  Config field definitions                                           */
/* ------------------------------------------------------------------ */

const CONFIG_GROUPS: ConfigGroup[] = [
  {
    id: 'payment',
    title: '支付渠道',
    titleEn: 'Payment Providers',
    fields: [
      {
        key: 'PAYMENT_PROVIDERS',
        label: '启用的支付服务商',
        labelEn: 'Enabled Providers',
        type: 'checkbox-group',
        options: ['easypay', 'alipay', 'wxpay', 'stripe'],
        group: 'payment',
      },
      // EasyPay
      { key: 'EASY_PAY_PID', label: 'EasyPay 商户ID', labelEn: 'EasyPay PID', type: 'text', group: 'payment' },
      { key: 'EASY_PAY_PKEY', label: 'EasyPay 密钥', labelEn: 'EasyPay Key', type: 'password', group: 'payment' },
      {
        key: 'EASY_PAY_API_BASE',
        label: 'EasyPay API 地址',
        labelEn: 'EasyPay API Base',
        type: 'text',
        group: 'payment',
      },
      {
        key: 'EASY_PAY_NOTIFY_URL',
        label: 'EasyPay 回调地址',
        labelEn: 'EasyPay Notify URL',
        type: 'text',
        group: 'payment',
      },
      {
        key: 'EASY_PAY_RETURN_URL',
        label: 'EasyPay 返回地址',
        labelEn: 'EasyPay Return URL',
        type: 'text',
        group: 'payment',
      },
      // Alipay
      { key: 'ALIPAY_APP_ID', label: '支付宝 App ID', labelEn: 'Alipay App ID', type: 'text', group: 'payment' },
      {
        key: 'ALIPAY_PRIVATE_KEY',
        label: '支付宝应用私钥',
        labelEn: 'Alipay Private Key',
        type: 'password',
        group: 'payment',
      },
      {
        key: 'ALIPAY_PUBLIC_KEY',
        label: '支付宝公钥',
        labelEn: 'Alipay Public Key',
        type: 'password',
        group: 'payment',
      },
      {
        key: 'ALIPAY_NOTIFY_URL',
        label: '支付宝回调地址',
        labelEn: 'Alipay Notify URL',
        type: 'text',
        group: 'payment',
      },
      // Wxpay
      { key: 'WXPAY_APP_ID', label: '微信支付 App ID', labelEn: 'Wxpay App ID', type: 'text', group: 'payment' },
      { key: 'WXPAY_MCH_ID', label: '微信支付商户号', labelEn: 'Wxpay Merchant ID', type: 'text', group: 'payment' },
      {
        key: 'WXPAY_PRIVATE_KEY',
        label: '微信支付私钥',
        labelEn: 'Wxpay Private Key',
        type: 'password',
        group: 'payment',
      },
      {
        key: 'WXPAY_API_V3_KEY',
        label: '微信支付 APIv3 密钥',
        labelEn: 'Wxpay APIv3 Key',
        type: 'password',
        group: 'payment',
      },
      {
        key: 'WXPAY_PUBLIC_KEY',
        label: '微信支付公钥',
        labelEn: 'Wxpay Public Key',
        type: 'password',
        group: 'payment',
      },
      {
        key: 'WXPAY_CERT_SERIAL',
        label: '微信支付证书序列号',
        labelEn: 'Wxpay Cert Serial',
        type: 'text',
        group: 'payment',
      },
      {
        key: 'WXPAY_NOTIFY_URL',
        label: '微信支付回调地址',
        labelEn: 'Wxpay Notify URL',
        type: 'text',
        group: 'payment',
      },
      // Stripe
      {
        key: 'STRIPE_SECRET_KEY',
        label: 'Stripe 密钥',
        labelEn: 'Stripe Secret Key',
        type: 'password',
        group: 'payment',
      },
      {
        key: 'STRIPE_PUBLISHABLE_KEY',
        label: 'Stripe 公钥',
        labelEn: 'Stripe Publishable Key',
        type: 'password',
        group: 'payment',
      },
      {
        key: 'STRIPE_WEBHOOK_SECRET',
        label: 'Stripe Webhook 密钥',
        labelEn: 'Stripe Webhook Secret',
        type: 'password',
        group: 'payment',
      },
    ],
  },
  {
    id: 'limits',
    title: '业务参数',
    titleEn: 'Business Parameters',
    fields: [
      {
        key: 'ORDER_TIMEOUT_MINUTES',
        label: '订单超时时间 (分钟)',
        labelEn: 'Order Timeout (minutes)',
        type: 'number',
        group: 'limits',
      },
      {
        key: 'MIN_RECHARGE_AMOUNT',
        label: '最小充值金额',
        labelEn: 'Min Recharge Amount',
        type: 'number',
        group: 'limits',
      },
      {
        key: 'MAX_RECHARGE_AMOUNT',
        label: '最大充值金额',
        labelEn: 'Max Recharge Amount',
        type: 'number',
        group: 'limits',
      },
      {
        key: 'MAX_DAILY_RECHARGE_AMOUNT',
        label: '每日最大充值金额',
        labelEn: 'Max Daily Recharge Amount',
        type: 'number',
        group: 'limits',
      },
      {
        key: 'RECHARGE_AMOUNTS',
        label: '快捷充值金额选项 (逗号分隔)',
        labelEn: 'Quick Recharge Amounts (comma-separated)',
        type: 'text',
        group: 'limits',
      },
    ],
  },
  {
    id: 'display',
    title: '显示配置',
    titleEn: 'Display Settings',
    fields: [
      {
        key: 'PAY_HELP_IMAGE_URL',
        label: '支付帮助图片 URL',
        labelEn: 'Pay Help Image URL',
        type: 'text',
        group: 'display',
      },
      {
        key: 'PAY_HELP_TEXT',
        label: '支付帮助文本',
        labelEn: 'Pay Help Text',
        type: 'textarea',
        group: 'display',
      },
      {
        key: 'PAYMENT_SUBLABEL_ALIPAY',
        label: '支付宝副标签',
        labelEn: 'Alipay Sub-label',
        type: 'text',
        group: 'display',
      },
      {
        key: 'PAYMENT_SUBLABEL_WXPAY',
        label: '微信支付副标签',
        labelEn: 'Wxpay Sub-label',
        type: 'text',
        group: 'display',
      },
      {
        key: 'PAYMENT_SUBLABEL_STRIPE',
        label: 'Stripe 副标签',
        labelEn: 'Stripe Sub-label',
        type: 'text',
        group: 'display',
      },
      {
        key: 'PAYMENT_SUBLABEL_EASYPAY_ALIPAY',
        label: 'EasyPay 支付宝副标签',
        labelEn: 'EasyPay Alipay Sub-label',
        type: 'text',
        group: 'display',
      },
      {
        key: 'PAYMENT_SUBLABEL_EASYPAY_WXPAY',
        label: 'EasyPay 微信支付副标签',
        labelEn: 'EasyPay Wxpay Sub-label',
        type: 'text',
        group: 'display',
      },
      {
        key: 'SUPPORT_EMAIL',
        label: '客服邮箱',
        labelEn: 'Support Email',
        type: 'text',
        group: 'display',
      },
      {
        key: 'SITE_NAME',
        label: '站点名称',
        labelEn: 'Site Name',
        type: 'text',
        group: 'display',
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Chevron SVG                                                        */
/* ------------------------------------------------------------------ */

function ChevronIcon({ open, isDark }: { open: boolean; isDark: boolean }) {
  return (
    <svg
      className={[
        'h-5 w-5 shrink-0 transition-transform duration-200',
        open ? 'rotate-180' : '',
        isDark ? 'text-slate-400' : 'text-slate-500',
      ].join(' ')}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Eye toggle SVG                                                     */
/* ------------------------------------------------------------------ */

function EyeIcon({ visible, isDark }: { visible: boolean; isDark: boolean }) {
  const cls = ['h-4 w-4 cursor-pointer', isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'].join(' ');
  if (visible) {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.72 11.72 0 013.168-4.477M6.343 6.343A9.97 9.97 0 0112 5c5 0 9.27 3.11 11 7.5a11.72 11.72 0 01-4.168 4.477M6.343 6.343L3 3m3.343 3.343l2.829 2.829m4.486 4.486l2.829 2.829M6.343 6.343l11.314 11.314M14.121 14.121A3 3 0 009.879 9.879"
        />
      </svg>
    );
  }
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  i18n text                                                          */
/* ------------------------------------------------------------------ */

function getText(locale: Locale) {
  return locale === 'en'
    ? {
        missingToken: 'Missing admin token',
        missingTokenHint: 'Please access the admin page from the Sub2API platform.',
        invalidToken: 'Invalid admin token',
        requestFailed: 'Request failed',
        loadFailed: 'Failed to load configs',
        title: 'System Settings',
        subtitle: 'Manage system configuration and parameters',
        loading: 'Loading...',
        save: 'Save',
        saving: 'Saving...',
        saved: 'Saved',
        saveFailed: 'Save failed',
        orders: 'Order Management',
        dashboard: 'Dashboard',
        refresh: 'Refresh',
        noChanges: 'No changes to save',
      }
    : {
        missingToken: '缺少管理员凭证',
        missingTokenHint: '请从 Sub2API 平台正确访问管理页面',
        invalidToken: '管理员凭证无效',
        requestFailed: '请求失败',
        loadFailed: '加载配置失败',
        title: '系统配置',
        subtitle: '管理系统配置项与业务参数',
        loading: '加载中...',
        save: '保存',
        saving: '保存中...',
        saved: '已保存',
        saveFailed: '保存失败',
        orders: '订单管理',
        dashboard: '数据概览',
        refresh: '刷新',
        noChanges: '没有需要保存的更改',
      };
}

/* ------------------------------------------------------------------ */
/*  ConfigGroupCard component                                          */
/* ------------------------------------------------------------------ */

function ConfigGroupCard({
  group,
  values,
  onChange,
  onSave,
  savingGroup,
  savedGroup,
  saveError,
  isDark,
  locale,
}: {
  group: ConfigGroup;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onSave: () => void;
  savingGroup: boolean;
  savedGroup: boolean;
  saveError: string;
  isDark: boolean;
  locale: Locale;
}) {
  const text = getText(locale);
  const [open, setOpen] = useState(true);
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});

  const toggleVisible = (key: string) => {
    setVisibleFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const cardCls = [
    'rounded-xl border transition-colors',
    isDark ? 'border-slate-700/60 bg-slate-800/50' : 'border-slate-200 bg-white',
  ].join(' ');

  const headerCls = [
    'flex cursor-pointer select-none items-center justify-between px-4 py-3 sm:px-5',
    isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50',
    'rounded-xl transition-colors',
  ].join(' ');

  const labelCls = ['block text-sm font-medium mb-1', isDark ? 'text-slate-300' : 'text-slate-700'].join(' ');

  const inputCls = [
    'w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors',
    isDark
      ? 'border-slate-600 bg-slate-700/60 text-slate-100 placeholder-slate-500 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30'
      : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30',
  ].join(' ');

  const textareaCls = [
    'w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors resize-y min-h-[80px]',
    isDark
      ? 'border-slate-600 bg-slate-700/60 text-slate-100 placeholder-slate-500 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30'
      : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30',
  ].join(' ');

  return (
    <div className={cardCls}>
      <div className={headerCls} onClick={() => setOpen((v) => !v)}>
        <h3 className={['text-base font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
          {locale === 'en' ? group.titleEn : group.title}
        </h3>
        <ChevronIcon open={open} isDark={isDark} />
      </div>

      {open && (
        <div className="space-y-4 px-4 pb-4 sm:px-5 sm:pb-5">
          {group.fields.map((field) => {
            const value = values[field.key] ?? '';

            if (field.type === 'checkbox-group' && field.options) {
              const selected = value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              return (
                <div key={field.key}>
                  <label className={labelCls}>{locale === 'en' ? field.labelEn : field.label}</label>
                  <div className="flex flex-wrap gap-3">
                    {field.options.map((opt) => {
                      const checked = selected.includes(opt);
                      return (
                        <label
                          key={opt}
                          className={[
                            'inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors',
                            checked
                              ? isDark
                                ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-200'
                                : 'border-blue-400 bg-blue-50 text-blue-700'
                              : isDark
                                ? 'border-slate-600 text-slate-400 hover:border-slate-500'
                                : 'border-slate-300 text-slate-600 hover:border-slate-400',
                          ].join(' ')}
                        >
                          <input
                            type="checkbox"
                            className="accent-blue-600"
                            checked={checked}
                            onChange={() => {
                              const next = checked ? selected.filter((s) => s !== opt) : [...selected, opt];
                              onChange(field.key, next.join(','));
                            }}
                          />
                          {opt}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (field.type === 'textarea') {
              return (
                <div key={field.key}>
                  <label className={labelCls}>{locale === 'en' ? field.labelEn : field.label}</label>
                  <textarea className={textareaCls} value={value} onChange={(e) => onChange(field.key, e.target.value)} rows={3} />
                </div>
              );
            }

            if (field.type === 'password' || isSensitiveKey(field.key)) {
              const isVisible = visibleFields[field.key] ?? false;
              return (
                <div key={field.key}>
                  <label className={labelCls}>{locale === 'en' ? field.labelEn : field.label}</label>
                  <div className="relative">
                    <input
                      type={isVisible ? 'text' : 'password'}
                      className={inputCls + ' pr-10'}
                      value={value}
                      onChange={(e) => onChange(field.key, e.target.value)}
                      placeholder={isMaskedValue(value) ? '' : undefined}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      onClick={() => toggleVisible(field.key)}
                      tabIndex={-1}
                    >
                      <EyeIcon visible={isVisible} isDark={isDark} />
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={field.key}>
                <label className={labelCls}>{locale === 'en' ? field.labelEn : field.label}</label>
                <input
                  type={field.type === 'number' ? 'number' : 'text'}
                  className={inputCls}
                  value={value}
                  onChange={(e) => onChange(field.key, e.target.value)}
                />
              </div>
            );
          })}

          {/* Save button + status */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onSave}
              disabled={savingGroup}
              className={[
                'inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors',
                savingGroup ? 'cursor-not-allowed bg-green-400 opacity-70' : 'bg-green-600 hover:bg-green-700 active:bg-green-800',
              ].join(' ')}
            >
              {savingGroup ? text.saving : text.save}
            </button>
            {savedGroup && (
              <span className={['text-sm', isDark ? 'text-green-400' : 'text-green-600'].join(' ')}>{text.saved}</span>
            )}
            {saveError && <span className="text-sm text-red-500">{saveError}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main content                                                       */
/* ------------------------------------------------------------------ */

function SettingsContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const locale = resolveLocale(searchParams.get('lang'));
  const isDark = theme === 'dark';
  const uiMode = searchParams.get('ui_mode') || 'standalone';
  const isEmbedded = uiMode === 'embedded';

  const text = getText(locale);

  // State: original values from API, and local edited values
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Per-group save state
  const [savingGroups, setSavingGroups] = useState<Record<string, boolean>>({});
  const [savedGroups, setSavedGroups] = useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  const fetchConfigs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/config?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        if (res.status === 401) {
          setError(text.invalidToken);
          return;
        }
        throw new Error(text.requestFailed);
      }
      const data = await res.json();
      const configMap: Record<string, string> = {};
      (data.configs as ConfigItem[]).forEach((c) => {
        configMap[c.key] = c.value;
      });
      setOriginalValues(configMap);
      setEditedValues(configMap);
    } catch {
      setError(text.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleChange = (key: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
    // Clear saved status for the group this key belongs to
    const group = CONFIG_GROUPS.find((g) => g.fields.some((f) => f.key === key));
    if (group) {
      setSavedGroups((prev) => ({ ...prev, [group.id]: false }));
      setSaveErrors((prev) => ({ ...prev, [group.id]: '' }));
    }
  };

  const handleSaveGroup = async (group: ConfigGroup) => {
    // Collect only changed, non-masked fields in this group
    const changes: ConfigItem[] = [];
    for (const field of group.fields) {
      const edited = editedValues[field.key] ?? '';
      const original = originalValues[field.key] ?? '';
      if (edited === original) continue;
      // Skip if user didn't actually change a masked value
      if (isSensitiveKey(field.key) && isMaskedValue(edited)) continue;
      changes.push({ key: field.key, value: edited, group: field.group, label: locale === 'en' ? field.labelEn : field.label });
    }

    if (changes.length === 0) {
      setSaveErrors((prev) => ({ ...prev, [group.id]: text.noChanges }));
      return;
    }

    setSavingGroups((prev) => ({ ...prev, [group.id]: true }));
    setSaveErrors((prev) => ({ ...prev, [group.id]: '' }));
    setSavedGroups((prev) => ({ ...prev, [group.id]: false }));

    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ configs: changes }),
      });
      if (!res.ok) {
        throw new Error(text.saveFailed);
      }
      // Update original values for saved keys
      setOriginalValues((prev) => {
        const next = { ...prev };
        changes.forEach((c) => {
          next[c.key] = c.value;
        });
        return next;
      });
      setSavedGroups((prev) => ({ ...prev, [group.id]: true }));
      // Re-fetch to get properly masked values
      await fetchConfigs();
    } catch {
      setSaveErrors((prev) => ({ ...prev, [group.id]: text.saveFailed }));
    } finally {
      setSavingGroups((prev) => ({ ...prev, [group.id]: false }));
    }
  };

  if (!token) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="text-center text-red-500">
          <p className="text-lg font-medium">{text.missingToken}</p>
          <p className="mt-2 text-sm text-gray-500">{text.missingTokenHint}</p>
        </div>
      </div>
    );
  }

  const navParams = new URLSearchParams();
  navParams.set('token', token);
  if (locale === 'en') navParams.set('lang', 'en');
  if (theme === 'dark') navParams.set('theme', 'dark');
  if (isEmbedded) navParams.set('ui_mode', 'embedded');

  const btnBase = [
    'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
    isDark
      ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
      : 'border-slate-300 text-slate-700 hover:bg-slate-100',
  ].join(' ');

  return (
    <PayPageLayout
      isDark={isDark}
      isEmbedded={isEmbedded}
      maxWidth="full"
      title={text.title}
      subtitle={text.subtitle}
      locale={locale}
      actions={
        <>
          <a href={`/admin?${navParams}`} className={btnBase}>
            {text.orders}
          </a>
          <a href={`/admin/dashboard?${navParams}`} className={btnBase}>
            {text.dashboard}
          </a>
          <button type="button" onClick={fetchConfigs} className={btnBase}>
            {text.refresh}
          </button>
        </>
      }
    >
      {error && (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm ${isDark ? 'border-red-800 bg-red-950/50 text-red-400' : 'border-red-200 bg-red-50 text-red-600'}`}
        >
          {error}
          <button onClick={() => setError('')} className="ml-2 opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className={`py-24 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{text.loading}</div>
      ) : (
        <div className="space-y-4">
          {CONFIG_GROUPS.map((group) => (
            <ConfigGroupCard
              key={group.id}
              group={group}
              values={editedValues}
              onChange={handleChange}
              onSave={() => handleSaveGroup(group)}
              savingGroup={savingGroups[group.id] ?? false}
              savedGroup={savedGroups[group.id] ?? false}
              saveError={saveErrors[group.id] ?? ''}
              isDark={isDark}
              locale={locale}
            />
          ))}
        </div>
      )}
    </PayPageLayout>
  );
}

/* ------------------------------------------------------------------ */
/*  Page export with Suspense                                          */
/* ------------------------------------------------------------------ */

function SettingsPageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-gray-500">Loading...</div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsPageFallback />}>
      <SettingsContent />
    </Suspense>
  );
}
