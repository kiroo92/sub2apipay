'use client';

import React from 'react';
import type { Locale } from '@/lib/locale';
import { pickLocaleText } from '@/lib/locale';

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

const PLATFORM_STYLES: Record<string, { bg: string; text: string }> = {
  claude: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  openai: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300' },
  gemini: { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
  codex: { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300' },
  sora: { bg: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-700 dark:text-pink-300' },
};

function getPlatformStyle(platform: string, isDark: boolean): { bg: string; text: string } {
  const key = platform.toLowerCase();
  const match = PLATFORM_STYLES[key];
  if (match) {
    return {
      bg: isDark ? match.bg.split(' ')[1]?.replace('dark:', '') || match.bg.split(' ')[0] : match.bg.split(' ')[0],
      text: isDark
        ? match.text.split(' ')[1]?.replace('dark:', '') || match.text.split(' ')[0]
        : match.text.split(' ')[0],
    };
  }
  return {
    bg: isDark ? 'bg-slate-700' : 'bg-slate-100',
    text: isDark ? 'text-slate-300' : 'text-slate-600',
  };
}

export default function ChannelCard({ channel, onTopUp, isDark, locale, userBalance }: ChannelCardProps) {
  const platformStyle = getPlatformStyle(channel.platform, isDark);
  const usableQuota = (1 / channel.rateMultiplier).toFixed(2);

  return (
    <div
      className={[
        'flex flex-col rounded-2xl border p-5 transition-shadow hover:shadow-lg',
        isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white',
      ].join(' ')}
    >
      {/* Header: Platform badge + Name */}
      <div className="mb-3 flex items-center gap-2">
        <span className={['rounded-full px-2.5 py-0.5 text-xs font-medium', platformStyle.bg, platformStyle.text].join(' ')}>
          {channel.platform}
        </span>
        <h3 className={['text-lg font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
          {channel.name}
        </h3>
      </div>

      {/* Rate display */}
      <div className="mb-1 flex items-baseline gap-1.5">
        <span className={['text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
          {pickLocaleText(locale, '当前倍率', 'Rate')}
        </span>
        <span className="text-base font-semibold text-emerald-500">
          1 : {channel.rateMultiplier}
        </span>
      </div>

      {userBalance !== undefined && (
        <p className={['mb-3 text-xs', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
          {pickLocaleText(
            locale,
            `1元可用约${usableQuota}美元额度`,
            `1 CNY ≈ ${usableQuota} USD quota`,
          )}
        </p>
      )}

      {/* Description */}
      {channel.description && (
        <p className={['mb-3 text-sm leading-relaxed', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
          {channel.description}
        </p>
      )}

      {/* Models */}
      {channel.models.length > 0 && (
        <div className="mb-3">
          <p className={['mb-1.5 text-xs font-medium uppercase tracking-wide', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
            {pickLocaleText(locale, '支持模型', 'Supported Models')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {channel.models.map((model) => (
              <span
                key={model}
                className={[
                  'rounded-md px-2 py-0.5 text-xs',
                  isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600',
                ].join(' ')}
              >
                {model}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Features */}
      {channel.features.length > 0 && (
        <div className="mb-4">
          <p className={['mb-1.5 text-xs font-medium uppercase tracking-wide', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
            {pickLocaleText(locale, '功能特性', 'Features')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {channel.features.map((feature) => (
              <span
                key={feature}
                className={[
                  'rounded-md px-2 py-0.5 text-xs',
                  isDark ? 'bg-emerald-900/30 text-emerald-300' : 'bg-emerald-50 text-emerald-700',
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
        className="mt-2 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 active:bg-emerald-700"
      >
        {pickLocaleText(locale, '立即充值', 'Top Up Now')}
      </button>
    </div>
  );
}
