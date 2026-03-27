'use client';

import React from 'react';
import type { Locale } from '@/lib/locale';
import { pickLocaleText } from '@/lib/locale';
import { formatValidityLabel, formatValiditySuffix, type ValidityUnit } from '@/lib/subscription-utils';
import { PlatformBadge, getPlatformStyle } from '@/lib/platform-style';

export interface PlanInfo {
  id: string;
  groupId: number;
  groupName: string | null;
  name: string;
  price: number;
  originalPrice: number | null;
  validityDays: number;
  validityUnit?: ValidityUnit;
  features: string[];
  description: string | null;
  platform: string | null;
  rateMultiplier: number | null;
  limits: {
    daily_limit_usd: number | null;
    weekly_limit_usd: number | null;
    monthly_limit_usd: number | null;
  } | null;
  allowMessagesDispatch: boolean;
  defaultMappedModel: string | null;
  modelScopes?: string[] | null;
  inviterRewardAmount?: number | null;
  inviteeRewardAmount?: number | null;
}

/** 套餐信息展示（Header + 价格 + 描述 + 倍率/限额 + 特性），不含操作按钮 */
export function PlanInfoDisplay({ plan, isDark, locale }: { plan: PlanInfo; isDark: boolean; locale: Locale }) {
  const unit = plan.validityUnit ?? 'day';
  const periodLabel = formatValidityLabel(plan.validityDays, unit, locale);
  const periodSuffix = formatValiditySuffix(plan.validityDays, unit, locale);
  const planModelScopes = Array.from(
    new Set(
      [...(plan.modelScopes ?? []), ...(plan.defaultMappedModel ? [plan.defaultMappedModel] : [])].filter(Boolean),
    ),
  );

  const hasLimits =
    plan.limits &&
    (plan.limits.daily_limit_usd !== null ||
      plan.limits.weekly_limit_usd !== null ||
      plan.limits.monthly_limit_usd !== null);

  const isOpenAI = plan.platform?.toLowerCase() === 'openai';
  const ps = getPlatformStyle(plan.platform ?? '');
  const accentCls = isDark ? ps.accent.dark : ps.accent.light;
  const hasInviteRewards = (plan.inviterRewardAmount ?? 0) > 0 || (plan.inviteeRewardAmount ?? 0) > 0;

  return (
    <>
      {/* Header: Platform badge + Name + Period + /v1/messages */}
      <div className="mb-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {plan.platform && <PlatformBadge platform={plan.platform} />}
          <h3 className={['text-base font-bold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>{plan.name}</h3>
          <span
            className={[
              'rounded-full px-2 py-0.5 text-[11px] font-medium',
              isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-50 text-emerald-700',
            ].join(' ')}
          >
            {periodLabel}
          </span>
          <span
            className={[
              'rounded-full px-2 py-0.5 text-[11px] font-medium',
              isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-700',
            ].join(' ')}
          >
            {pickLocaleText(locale, '指定模型', 'Specific models')}
          </span>
          {isOpenAI && plan.allowMessagesDispatch && (
            <span
              className={[
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                isDark ? 'bg-green-500/20 text-green-300' : 'bg-green-100 text-green-700',
              ].join(' ')}
            >
              /v1/messages
              {plan.defaultMappedModel && (
                <span className={['font-mono', isDark ? 'text-green-400' : 'text-green-800'].join(' ')}>
                  {plan.defaultMappedModel}
                </span>
              )}
            </span>
          )}
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-1.5">
          {plan.originalPrice !== null && (
            <span className={['text-xs line-through', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
              ¥{plan.originalPrice}
            </span>
          )}
          <span className={['text-2xl font-bold', accentCls].join(' ')}>¥{plan.price}</span>
          <span className={['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>{periodSuffix}</span>
        </div>
      </div>

      {/* Description */}
      {plan.description && (
        <p className={['mb-3 text-xs leading-5', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
          {plan.description}
        </p>
      )}

      {planModelScopes.length > 0 && (
        <div className="mb-3">
          <p className={['mb-1 text-[11px]', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
            {pickLocaleText(locale, '可用模型', 'Included Models')}
          </p>
          <div className="flex flex-wrap gap-1">
            {planModelScopes.map((model) => (
              <span
                key={model}
                className={[
                  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]',
                  isDark
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    : 'border-amber-200 bg-amber-50 text-amber-700',
                ].join(' ')}
              >
                <span className={['h-1.5 w-1.5 rounded-full', isDark ? 'bg-amber-300' : 'bg-amber-500'].join(' ')} />
                {model}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rate + Limits grid */}
      {(plan.rateMultiplier != null || hasLimits) && (
        <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-2">
          {plan.rateMultiplier != null && (
            <div>
              <span className={['text-[11px]', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
                {pickLocaleText(locale, '倍率', 'Rate')}
              </span>
              <div className="flex items-baseline">
                <span className={['text-base font-bold', accentCls].join(' ')}>1</span>
                <span className={['mx-1 text-sm', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>:</span>
                <span className={['text-base font-bold', accentCls].join(' ')}>{plan.rateMultiplier}</span>
              </div>
            </div>
          )}
          {plan.limits?.daily_limit_usd !== null && plan.limits?.daily_limit_usd !== undefined && (
            <div>
              <span className={['text-[11px]', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
                {pickLocaleText(locale, '日限额', 'Daily Limit')}
              </span>
              <div className={['text-base font-semibold', isDark ? 'text-slate-200' : 'text-slate-800'].join(' ')}>
                ${plan.limits.daily_limit_usd}
              </div>
            </div>
          )}
          {plan.limits?.weekly_limit_usd !== null && plan.limits?.weekly_limit_usd !== undefined && (
            <div>
              <span className={['text-[11px]', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
                {pickLocaleText(locale, '周限额', 'Weekly Limit')}
              </span>
              <div className={['text-base font-semibold', isDark ? 'text-slate-200' : 'text-slate-800'].join(' ')}>
                ${plan.limits.weekly_limit_usd}
              </div>
            </div>
          )}
          {plan.limits?.monthly_limit_usd !== null && plan.limits?.monthly_limit_usd !== undefined && (
            <div>
              <span className={['text-[11px]', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
                {pickLocaleText(locale, '月限额', 'Monthly Limit')}
              </span>
              <div className={['text-base font-semibold', isDark ? 'text-slate-200' : 'text-slate-800'].join(' ')}>
                ${plan.limits.monthly_limit_usd}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Invite rewards */}
      {hasInviteRewards && (
        <div
          className={[
            'mb-3 rounded-lg border px-3 py-2 text-xs leading-5',
            isDark ? 'border-cyan-500/20 bg-cyan-500/10 text-slate-300' : 'border-cyan-200 bg-cyan-50 text-slate-700',
          ].join(' ')}
        >
          <div className={['font-medium', isDark ? 'text-cyan-300' : 'text-cyan-700'].join(' ')}>
            {pickLocaleText(locale, '邀请奖励', 'Invite rewards')}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {(plan.inviterRewardAmount ?? 0) > 0 && (
              <span>{pickLocaleText(locale, '邀请人', 'Inviter')}: +${plan.inviterRewardAmount}</span>
            )}
            {(plan.inviteeRewardAmount ?? 0) > 0 && (
              <span>{pickLocaleText(locale, '被邀请人', 'Invitee')}: +${plan.inviteeRewardAmount}</span>
            )}
          </div>
          <div className={['mt-1 text-[11px]', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
            {pickLocaleText(locale, '奖励发放到普通余额', 'Rewards are credited to regular balance')}
          </div>
        </div>
      )}

      {/* Features */}
      {plan.features.length > 0 && (
        <div className="mb-4">
          <p className={['mb-1 text-[11px]', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
            {pickLocaleText(locale, '功能特性', 'Features')}
          </p>
          <div className="flex flex-wrap gap-1">
            {plan.features.map((feature) => (
              <span
                key={feature}
                className={[
                  'rounded-md px-2 py-0.5 text-[11px]',
                  isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700',
                ].join(' ')}
              >
                {feature}
              </span>
            ))}
          </div>
        </div>
      )}

      <div
        className={[
          'rounded-lg border px-3 py-2.5 text-xs leading-5',
          isDark ? 'border-slate-700 bg-slate-900/40 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600',
        ].join(' ')}
      >
        {pickLocaleText(
          locale,
          '套餐仅限指定模型/端点使用，不能使用账户余额兑换。',
          'This plan only works for its listed models/endpoints and cannot be redeemed using account balance.',
        )}
      </div>
    </>
  );
}

interface SubscriptionPlanCardProps {
  plan: PlanInfo;
  onSubscribe: (planId: string) => void;
  isDark: boolean;
  locale: Locale;
}

export default function SubscriptionPlanCard({ plan, onSubscribe, isDark, locale }: SubscriptionPlanCardProps) {
  const ps = getPlatformStyle(plan.platform ?? '');

  return (
    <div
      className={[
        'flex flex-col rounded-xl border p-4 transition-shadow hover:shadow-md',
        isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white',
      ].join(' ')}
    >
      <PlanInfoDisplay plan={plan} isDark={isDark} locale={locale} />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Subscribe button */}
      <button
        type="button"
        onClick={() => onSubscribe(plan.id)}
        className={[
          'mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-colors',
          isDark ? ps.button.dark : ps.button.light,
        ].join(' ')}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        {pickLocaleText(locale, '立即开通', 'Subscribe Now')}
      </button>
    </div>
  );
}
