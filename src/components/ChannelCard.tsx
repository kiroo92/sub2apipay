'use client';

import React from 'react';
import type { Locale } from '@/lib/locale';
import { pickLocaleText } from '@/lib/locale';
import { PlatformBadge, getPlatformStyle } from '@/lib/platform-style';

export interface ChannelInfo {
  id: string;
  groupId: number;
  name: string;
  platform: string;
  rateMultiplier: number;
  description: string | null;
  models: string[];
  features: string[];
}

interface ChannelCardProps {
  channel: ChannelInfo;
  onTopUp: () => void;
  isDark: boolean;
  locale: Locale;
  userBalance?: number;
}

export default function ChannelCard({ channel, onTopUp, isDark, locale }: ChannelCardProps) {
  const usableQuota = (1 / channel.rateMultiplier).toFixed(2);
  const ps = getPlatformStyle(channel.platform);
  const accentCls = isDark ? ps.accent.dark : ps.accent.light;

  return (
    <div
      className={[
        'flex flex-col rounded-2xl border p-6 transition-shadow hover:shadow-lg',
        isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white',
      ].join(' ')}
    >
      {/* Header: Platform badge + Name */}
      <div className="mb-4">
        <div className="mb-3 flex items-center gap-2">
          <PlatformBadge platform={channel.platform} />
          <h3 className={['text-lg font-bold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
            {channel.name}
          </h3>
          <span
            className={[
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
              isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700',
            ].join(' ')}
          >
            {pickLocaleText(locale, '全部模型可用', 'All models')}
          </span>
        </div>

        {/* Rate display - prominent */}
        <div className="mb-3">
          <div className="flex items-baseline gap-2">
            <span className={['text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
              {pickLocaleText(locale, '当前倍率', 'Rate')}
            </span>
            <div className="flex items-baseline">
              <span className={['text-xl font-bold', accentCls].join(' ')}>1</span>
              <span className={['mx-1.5 text-lg', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>:</span>
              <span className={['text-xl font-bold', accentCls].join(' ')}>{channel.rateMultiplier}</span>
            </div>
          </div>
          <p className={['mt-1 text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
            {pickLocaleText(
              locale,
              <>
                1元可用约<span className={['font-medium', accentCls].join(' ')}>{usableQuota}</span>美元额度
              </>,
              <>
                1 CNY ≈ <span className={['font-medium', accentCls].join(' ')}>{usableQuota}</span> USD quota
              </>,
            )}
          </p>
        </div>

        {/* Description */}
        {channel.description && (
          <p className={['text-sm leading-relaxed', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
            {channel.description}
          </p>
        )}
      </div>

      <div
        className={[
          'mb-4 rounded-xl border px-3 py-3 text-sm leading-6',
          isDark ? 'border-slate-700 bg-slate-900/40 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600',
        ].join(' ')}
      >
        <div className={['text-xs font-medium uppercase tracking-wide', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
          {pickLocaleText(locale, '余额规则', 'Balance Scope')}
        </div>
        <p className="mt-1">
          {pickLocaleText(
            locale,
            '这里充值的是通用余额，到账后可用于全部模型按量消费；下方渠道信息仅用于说明倍率与特性，不会限制余额使用范围。',
            'This top-up adds general balance for pay-as-you-go usage across all models. Channel details below describe rates and features only, not balance restrictions.',
          )}
        </p>
      </div>

      {/* Features */}
      {channel.features.length > 0 && (
        <div className="mb-5">
          <p className={['mb-2 text-xs', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
            {pickLocaleText(locale, '功能特性', 'Features')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {channel.features.map((feature) => (
              <span
                key={feature}
                className={[
                  'rounded-md px-2 py-1 text-xs',
                  isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700',
                ].join(' ')}
              >
                {feature}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Spacer to push button to bottom */}
      <div className="flex-1" />

      {/* Top-up button */}
      <button
        type="button"
        onClick={onTopUp}
        className={[
          'mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-colors',
          isDark ? ps.button.dark : ps.button.light,
        ].join(' ')}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        {pickLocaleText(locale, '充值通用余额', 'Top Up Balance')}
      </button>
    </div>
  );
}
