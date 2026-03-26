'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Locale } from '@/lib/locale';
import { pickLocaleText } from '@/lib/locale';
import type { InviteBindingInfo, InviteSummary } from '@/lib/invite-client';

interface InviteBindingCardProps {
  invite: InviteSummary | null | undefined;
  isDark: boolean;
  locale: Locale;
  mode?: 'summary' | 'bind';
  bindPageHref?: string;
  backHref?: string;
  initialInviteCode?: string;
  onBind?: (inviteCode: string) => Promise<InviteBindingInfo>;
  onBindingChange?: (binding: InviteBindingInfo) => void;
}

function formatBoundAt(boundAt: string, locale: Locale) {
  const date = new Date(boundAt);
  if (Number.isNaN(date.getTime())) return boundAt;
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function InviteBindingCard({
  invite,
  isDark,
  locale,
  mode = 'summary',
  bindPageHref,
  backHref,
  initialInviteCode,
  onBind,
  onBindingChange,
}: InviteBindingCardProps) {
  const [inviteCode, setInviteCode] = useState(initialInviteCode ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setInviteCode(initialInviteCode ?? '');
  }, [initialInviteCode]);

  const normalized = useMemo<InviteSummary>(
    () =>
      invite ?? {
        programEnabled: false,
        bindingEnabled: false,
        rewardEnabled: false,
        ownInviteCode: null,
        binding: null,
      },
    [invite],
  );

  if (!normalized.programEnabled) {
    return mode === 'summary' ? null : (
      <div
        className={[
          'rounded-2xl border p-5',
          isDark
            ? 'border-slate-700 bg-slate-800/70 text-slate-300'
            : 'border-slate-200 bg-white text-slate-700 shadow-sm',
        ].join(' ')}
      >
        <div className="text-base font-semibold">
          {pickLocaleText(locale, '邀请绑定暂未开启', 'Invite binding is not available right now')}
        </div>
        <p className={['mt-2 text-sm leading-6', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
          {pickLocaleText(
            locale,
            '当前站点尚未开放邀请绑定功能，可稍后再试或返回支付页继续购买。',
            'This site has not enabled invite binding yet. You can try again later or return to the payment page.',
          )}
        </p>
        {backHref && (
          <a
            href={backHref}
            className={[
              'mt-4 inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              isDark
                ? 'border-slate-600 text-slate-200 hover:bg-slate-700'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50',
            ].join(' ')}
          >
            {pickLocaleText(locale, '返回支付页', 'Back to payment page')}
          </a>
        )}
      </div>
    );
  }

  const isBound = Boolean(normalized.binding);

  const handleBind = async () => {
    const code = inviteCode.trim();
    if (!code || !onBind || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const binding = await onBind(code);
      setInviteCode(binding.inviteCode);
      onBindingChange?.(binding);
    } catch (err) {
      setError(err instanceof Error ? err.message : pickLocaleText(locale, '绑定失败，请稍后重试', 'Binding failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={[
        'rounded-2xl border p-5',
        isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white shadow-sm',
      ].join(' ')}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={['text-base font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
              {pickLocaleText(locale, '邀请绑定', 'Invite binding')}
            </h3>
            <span
              className={[
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                isBound
                  ? isDark
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-emerald-50 text-emerald-700'
                  : isDark
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-amber-50 text-amber-700',
              ].join(' ')}
            >
              {isBound ? pickLocaleText(locale, '已绑定', 'Bound') : pickLocaleText(locale, '未绑定', 'Not bound')}
            </span>
            {normalized.rewardEnabled && (
              <span
                className={[
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                  isDark ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-50 text-cyan-700',
                ].join(' ')}
              >
                {pickLocaleText(locale, '邀请奖励已开启', 'Invite rewards enabled')}
              </span>
            )}
          </div>

          <p className={['mt-2 text-sm leading-6', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
            {isBound
              ? pickLocaleText(
                  locale,
                  '当前账号已完成一次性绑定，后续符合条件的充值或订阅订单将按站点规则结算邀请奖励。',
                  'This account has already completed its one-time invite binding. Eligible top-up or subscription orders will follow the site reward rules.',
                )
              : pickLocaleText(
                  locale,
                  '绑定后，后续符合条件的充值或订阅订单可按站点规则发放邀请奖励；绑定关系为一次性且不可修改。',
                  'After binding, eligible future top-up or subscription orders can grant invite rewards under the site rules. Binding is one-time and cannot be changed.',
                )}
          </p>
        </div>

        {normalized.ownInviteCode && (
          <div
            className={[
              'rounded-xl border px-4 py-3 text-sm md:min-w-[220px]',
              isDark
                ? 'border-slate-600 bg-slate-900/60 text-slate-200'
                : 'border-slate-200 bg-slate-50 text-slate-700',
            ].join(' ')}
          >
            <div
              className={[
                'text-xs font-medium uppercase tracking-wide',
                isDark ? 'text-slate-500' : 'text-slate-400',
              ].join(' ')}
            >
              {pickLocaleText(locale, '我的邀请码', 'My invite code')}
            </div>
            <div
              className={[
                'mt-2 font-mono text-lg font-semibold tracking-[0.18em]',
                isDark ? 'text-cyan-300' : 'text-cyan-700',
              ].join(' ')}
            >
              {normalized.ownInviteCode}
            </div>
            <div className={['mt-1 text-xs leading-5', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
              {pickLocaleText(
                locale,
                '用于邀请新用户绑定，奖励单位为普通 USD 余额。',
                'Use this when inviting new users. Rewards are credited as regular USD balance.',
              )}
            </div>
          </div>
        )}
      </div>

      {normalized.binding && (
        <div
          className={[
            'mt-4 rounded-xl border px-4 py-3 text-sm',
            isDark
              ? 'border-emerald-500/20 bg-emerald-500/10 text-slate-200'
              : 'border-emerald-200 bg-emerald-50 text-slate-700',
          ].join(' ')}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              {pickLocaleText(locale, '已绑定邀请码：', 'Bound invite code: ')}
              <span className="font-mono font-semibold">{normalized.binding.inviteCode}</span>
            </span>
            <span>
              {pickLocaleText(locale, '邀请人 ID：', 'Inviter ID: ')}
              <span className="font-semibold">{normalized.binding.inviterUserId}</span>
            </span>
          </div>
          <div className={['mt-1 text-xs', isDark ? 'text-emerald-200/80' : 'text-emerald-700/80'].join(' ')}>
            {pickLocaleText(locale, '绑定时间：', 'Bound at: ')}
            {formatBoundAt(normalized.binding.boundAt, locale)}
          </div>
        </div>
      )}

      {!isBound && mode === 'summary' && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {normalized.bindingEnabled && bindPageHref ? (
            <a
              href={bindPageHref}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              {pickLocaleText(locale, '去绑定邀请码', 'Bind invite code')}
            </a>
          ) : (
            <div className={['text-sm', isDark ? 'text-slate-500' : 'text-slate-500'].join(' ')}>
              {pickLocaleText(locale, '当前暂不支持新绑定', 'New bindings are currently unavailable')}
            </div>
          )}
        </div>
      )}

      {!isBound && mode === 'bind' && (
        <div className="mt-4 space-y-4">
          {normalized.bindingEnabled ? (
            <>
              <div>
                <label
                  className={['mb-2 block text-sm font-medium', isDark ? 'text-slate-200' : 'text-slate-700'].join(' ')}
                >
                  {pickLocaleText(locale, '输入邀请码', 'Enter invite code')}
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                  placeholder={pickLocaleText(locale, '例如 S2A9IX', 'e.g. S2A9IX')}
                  className={[
                    'w-full rounded-xl border px-4 py-3 text-sm font-mono tracking-[0.18em] uppercase outline-none transition-colors',
                    isDark
                      ? 'border-slate-600 bg-slate-900/60 text-slate-100 placeholder-slate-500 focus:border-indigo-400'
                      : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-indigo-500',
                  ].join(' ')}
                />
                <p className={['mt-2 text-xs leading-5', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
                  {pickLocaleText(
                    locale,
                    '邀请码绑定为一次性操作，成功后不可更改。',
                    'Invite binding is one-time and cannot be changed after success.',
                  )}
                </p>
              </div>

              {error && (
                <div
                  className={[
                    'rounded-lg border px-3 py-2 text-sm',
                    isDark ? 'border-red-700 bg-red-900/30 text-red-300' : 'border-red-200 bg-red-50 text-red-600',
                  ].join(' ')}
                >
                  {error}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={submitting || !inviteCode.trim() || !onBind}
                  onClick={handleBind}
                  className={[
                    'inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    'bg-indigo-600 hover:bg-indigo-700',
                  ].join(' ')}
                >
                  {submitting
                    ? pickLocaleText(locale, '绑定中...', 'Binding...')
                    : pickLocaleText(locale, '确认绑定', 'Confirm binding')}
                </button>
                {backHref && (
                  <a
                    href={backHref}
                    className={[
                      'inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                      isDark
                        ? 'border-slate-600 text-slate-200 hover:bg-slate-700'
                        : 'border-slate-300 text-slate-700 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {pickLocaleText(locale, '返回支付页', 'Back to payment page')}
                  </a>
                )}
              </div>
            </>
          ) : (
            <div className={['text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
              {pickLocaleText(
                locale,
                '当前暂不开放新的邀请码绑定，但你仍可返回支付页继续购买。',
                'New invite bindings are currently disabled, but you can still return to the payment page.',
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
