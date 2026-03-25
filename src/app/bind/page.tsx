'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import InviteBindingCard from '@/components/InviteBindingCard';
import PayPageLayout from '@/components/PayPageLayout';
import { applyLocaleToSearchParams, pickLocaleText, resolveLocale } from '@/lib/locale';
import {
  bindInviteCodeCompat,
  fetchInviteSummaryCompat,
  type InviteBindingInfo,
  type InviteSummary,
} from '@/lib/invite-client';

function BindContent() {
  const searchParams = useSearchParams();
  const token = (searchParams.get('token') || '').trim();
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const uiMode = searchParams.get('ui_mode') || 'standalone';
  const srcHost = searchParams.get('src_host') || undefined;
  const srcUrl = searchParams.get('src_url') || undefined;
  const locale = resolveLocale(searchParams.get('lang'));
  const isDark = theme === 'dark';
  const isEmbedded = uiMode === 'embedded';
  const initialInviteCode = (searchParams.get('invite_code') || searchParams.get('code') || '').trim().toUpperCase();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteInfo, setInviteInfo] = useState<InviteSummary | null>(null);
  const [displayName, setDisplayName] = useState('');

  const buildPayUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    params.set('theme', theme);
    params.set('ui_mode', uiMode);
    if (srcHost) params.set('src_host', srcHost);
    if (srcUrl) params.set('src_url', srcUrl);
    applyLocaleToSearchParams(params, locale);
    return `/pay?${params.toString()}`;
  }, [locale, srcHost, srcUrl, theme, token, uiMode]);

  const payUrl = buildPayUrl();

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const meRes = await fetch(`/api/orders/my?token=${encodeURIComponent(token)}`);
        if (!meRes.ok) {
          setError(
            pickLocaleText(
              locale,
              '无法获取当前用户信息，请从 Sub2API 平台重新进入。',
              'Failed to load current user info. Please re-open this page from Sub2API.',
            ),
          );
          return;
        }

        const meData = await meRes.json();
        const meUser = meData.user || {};
        const meId = Number(meUser.id);
        if (!Number.isInteger(meId) || meId <= 0) {
          setError(
            pickLocaleText(
              locale,
              '当前登录态无效，请返回支付页后重试。',
              'The current session is invalid. Please return to the payment page and try again.',
            ),
          );
          return;
        }

        setDisplayName(
          (typeof meUser.displayName === 'string' && meUser.displayName.trim()) ||
            (typeof meUser.username === 'string' && meUser.username.trim()) ||
            pickLocaleText(locale, `用户 #${meId}`, `User #${meId}`),
        );

        const invite = await fetchInviteSummaryCompat(token, meId);
        setInviteInfo(invite);
      } catch {
        setError(
          pickLocaleText(
            locale,
            '加载邀请信息失败，请稍后重试。',
            'Failed to load invite info. Please try again later.',
          ),
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [locale, token]);

  const handleBind = async (inviteCode: string): Promise<InviteBindingInfo> => {
    const binding = await bindInviteCodeCompat(token, inviteCode);
    setInviteInfo((prev) => ({
      programEnabled: prev?.programEnabled ?? true,
      bindingEnabled: false,
      rewardEnabled: prev?.rewardEnabled ?? false,
      ownInviteCode: prev?.ownInviteCode ?? null,
      binding,
    }));
    return binding;
  };

  if (!token) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="text-center text-red-500">
          <p className="text-lg font-medium">{pickLocaleText(locale, '缺少认证信息', 'Missing authentication info')}</p>
          <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {pickLocaleText(locale, '请从 Sub2API 平台正确访问绑定页面。', 'Please open the bind page from Sub2API.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <PayPageLayout
      isDark={isDark}
      isEmbedded={isEmbedded}
      maxWidth="lg"
      title={pickLocaleText(locale, '绑定邀请码', 'Bind invite code')}
      subtitle={
        displayName
          ? pickLocaleText(
              locale,
              `为 ${displayName} 绑定一次性邀请关系`,
              `Bind a one-time invite relationship for ${displayName}`,
            )
          : pickLocaleText(
              locale,
              '完成一次性邀请绑定后再继续购买',
              'Complete your one-time invite binding before purchasing',
            )
      }
      locale={locale}
      actions={
        <a
          href={payUrl}
          className={[
            'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
            isDark
              ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
              : 'border-slate-300 text-slate-700 hover:bg-slate-100',
          ].join(' ')}
        >
          {pickLocaleText(locale, '返回支付页', 'Back to payment page')}
        </a>
      }
    >
      {error && (
        <div
          className={[
            'mb-4 rounded-lg border p-3 text-sm',
            isDark ? 'border-red-700 bg-red-900/30 text-red-300' : 'border-red-200 bg-red-50 text-red-600',
          ].join(' ')}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span className={['ml-3 text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
            {pickLocaleText(locale, '加载中...', 'Loading...')}
          </span>
        </div>
      ) : (
        <div className="space-y-4">
          <InviteBindingCard
            invite={inviteInfo}
            isDark={isDark}
            locale={locale}
            mode="bind"
            initialInviteCode={initialInviteCode}
            onBind={handleBind}
            onBindingChange={(binding) =>
              setInviteInfo((prev) =>
                prev
                  ? {
                      ...prev,
                      bindingEnabled: false,
                      binding,
                    }
                  : {
                      programEnabled: true,
                      bindingEnabled: false,
                      rewardEnabled: false,
                      ownInviteCode: null,
                      binding,
                    },
              )
            }
            backHref={payUrl}
          />

          <div
            className={[
              'rounded-2xl border p-4 text-sm leading-6',
              isDark
                ? 'border-slate-700 bg-slate-800/70 text-slate-300'
                : 'border-slate-200 bg-white text-slate-600 shadow-sm',
            ].join(' ')}
          >
            <div className={['font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
              {pickLocaleText(locale, '绑定说明', 'Binding notes')}
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                {pickLocaleText(
                  locale,
                  '邀请码绑定仅能执行一次，成功后不可更改。',
                  'Invite binding can only be performed once and cannot be changed afterward.',
                )}
              </li>
              <li>
                {pickLocaleText(
                  locale,
                  '邀请奖励如开启，将以普通 USD 余额发放，不会抵扣本次订单金额。',
                  'If invite rewards are enabled, they are credited as regular USD balance and do not reduce this order amount.',
                )}
              </li>
              <li>
                {pickLocaleText(
                  locale,
                  '若当前站点暂未开放绑定或后端尚未升级，本页会自动保持只读状态。',
                  'If this site has not enabled binding yet or the backend is not upgraded, this page stays read-only safely.',
                )}
              </li>
            </ul>
          </div>
        </div>
      )}
    </PayPageLayout>
  );
}

function BindPageFallback() {
  const searchParams = useSearchParams();
  const locale = resolveLocale(searchParams.get('lang'));

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-slate-500">{locale === 'en' ? 'Loading...' : '加载中...'}</div>
    </div>
  );
}

export default function BindPage() {
  return (
    <Suspense fallback={<BindPageFallback />}>
      <BindContent />
    </Suspense>
  );
}
