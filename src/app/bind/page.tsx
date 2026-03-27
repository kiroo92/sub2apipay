'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
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

type ActivityTab = 'bindings' | 'rewards';

type InviteBindingRecord = {
  id: string;
  inviterUserId: number;
  inviteeUserId: number;
  inviteCode: string;
  inviteCodeOwnerUserId: number;
  createdAt: string;
};

type InviteRewardRecord = {
  id: string;
  orderId: string;
  recipientUserId: number;
  role: 'INVITER' | 'INVITEE';
  amount: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  failedReason: string | null;
  processingAt: string | null;
  completedAt: string | null;
  createdAt: string;
  order: {
    orderType: 'balance' | 'subscription';
    userId: number;
    paymentType: string;
    amount: number;
    creditAmount: number;
    status: string;
    paidAt: string | null;
    completedAt: string | null;
  };
  binding: {
    inviterUserId: number;
    inviteeUserId: number;
    inviteCode: string;
  };
};

type PaginationInfo = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

type InviteActivityData = {
  userId: number;
  summary: {
    asInviterCount: number;
    asInviteeCount: number;
    bindingCount: number;
    rewardCount: number;
    rewardAmount: number;
    completedRewardCount: number;
    completedRewardAmount: number;
  };
  bindings: InviteBindingRecord[];
  rewards: InviteRewardRecord[];
  bindings_pagination: PaginationInfo;
  rewards_pagination: PaginationInfo;
};

function formatDateTime(value: string | null, locale: 'zh' | 'en') {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildBadgeClass(status: InviteRewardRecord['status'], isDark: boolean) {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';
  switch (status) {
    case 'COMPLETED':
      return [base, isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700'].join(' ');
    case 'FAILED':
      return [base, isDark ? 'bg-red-500/15 text-red-300' : 'bg-red-50 text-red-700'].join(' ');
    case 'PROCESSING':
      return [base, isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-50 text-blue-700'].join(' ');
    default:
      return [base, isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-700'].join(' ');
  }
}

function buildRolePillClass(kind: 'self' | 'counterparty', isDark: boolean) {
  return [
    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
    kind === 'self'
      ? isDark
        ? 'bg-cyan-500/15 text-cyan-300'
        : 'bg-cyan-50 text-cyan-700'
      : isDark
        ? 'bg-violet-500/15 text-violet-300'
        : 'bg-violet-50 text-violet-700',
  ].join(' ');
}

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
  const [activityTab, setActivityTab] = useState<ActivityTab>('bindings');
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [activityData, setActivityData] = useState<InviteActivityData | null>(null);
  const [bindingsPage, setBindingsPage] = useState(1);
  const [rewardsPage, setRewardsPage] = useState(1);

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

  const fetchActivity = useCallback(
    async (nextBindingsPage: number, nextRewardsPage: number) => {
      if (!token) return;
      setActivityLoading(true);
      setActivityError('');
      try {
        const params = new URLSearchParams({
          token,
          bindings_page: String(nextBindingsPage),
          bindings_page_size: '10',
          rewards_page: String(nextRewardsPage),
          rewards_page_size: '10',
        });
        const res = await fetch(`/api/invite-code/activity?${params.toString()}`);
        if (!res.ok) {
          throw new Error('load_failed');
        }
        const data = (await res.json()) as InviteActivityData;
        setActivityData(data);
      } catch {
        setActivityError(
          pickLocaleText(locale, '加载邀请记录失败，请稍后重试。', 'Failed to load invite activity. Please try again later.'),
        );
      } finally {
        setActivityLoading(false);
      }
    },
    [locale, token],
  );

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

        const [invite] = await Promise.all([fetchInviteSummaryCompat(token, meId), fetchActivity(1, 1)]);
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
  }, [fetchActivity, locale, token]);

  const handleBind = async (inviteCode: string): Promise<InviteBindingInfo> => {
    const binding = await bindInviteCodeCompat(token, inviteCode);
    setInviteInfo((prev) => ({
      programEnabled: prev?.programEnabled ?? true,
      bindingEnabled: false,
      rewardEnabled: prev?.rewardEnabled ?? false,
      ownInviteCode: prev?.ownInviteCode ?? null,
      binding,
    }));
    setBindingsPage(1);
    setRewardsPage(1);
    void fetchActivity(1, 1);
    return binding;
  };

  const tabText = useMemo(
    () => ({
      bindings: pickLocaleText(locale, '邀请关系', 'Invite Relations'),
      rewards: pickLocaleText(locale, '返利记录', 'Reward Records'),
      inviter: pickLocaleText(locale, '邀请人', 'Inviter'),
      invitee: pickLocaleText(locale, '被邀请人', 'Invitee'),
      inviteCode: pickLocaleText(locale, '邀请码', 'Invite Code'),
      createdAt: pickLocaleText(locale, '时间', 'Created At'),
      emptyBindings: pickLocaleText(locale, '暂无邀请关系记录', 'No invite relation records yet'),
      emptyRewards: pickLocaleText(locale, '暂无返利记录', 'No reward records yet'),
      role: pickLocaleText(locale, '角色', 'Role'),
      amount: pickLocaleText(locale, '金额', 'Amount'),
      status: pickLocaleText(locale, '状态', 'Status'),
      order: pickLocaleText(locale, '订单', 'Order'),
      prev: pickLocaleText(locale, '上一页', 'Previous'),
      next: pickLocaleText(locale, '下一页', 'Next'),
      page: pickLocaleText(locale, '第', 'Page'),
      pageSuffix: pickLocaleText(locale, '页', ''),
      total: pickLocaleText(locale, '总数', 'Total'),
      meLabel: pickLocaleText(locale, '当前用户', 'Current user'),
      roleInviter: pickLocaleText(locale, '邀请人奖励', 'Inviter reward'),
      roleInvitee: pickLocaleText(locale, '被邀请人奖励', 'Invitee reward'),
      rewardSummary: pickLocaleText(locale, '累计返利', 'Total rewards'),
      rewardDoneSummary: pickLocaleText(locale, '已完成返利', 'Completed rewards'),
      relationSummary: pickLocaleText(locale, '邀请关系总数', 'Total relations'),
      meAsInviter: pickLocaleText(locale, '我作为邀请人', 'Me as inviter'),
      meAsInvitee: pickLocaleText(locale, '我作为被邀请人', 'Me as invitee'),
      otherParty: pickLocaleText(locale, '对方', 'Counterparty'),
      statusPending: pickLocaleText(locale, '待处理', 'Pending'),
      statusProcessing: pickLocaleText(locale, '处理中', 'Processing'),
      statusCompleted: pickLocaleText(locale, '已完成', 'Completed'),
      statusFailed: pickLocaleText(locale, '失败', 'Failed'),
      recipient: pickLocaleText(locale, '收款用户', 'Recipient'),
      paymentMethod: pickLocaleText(locale, '支付方式', 'Payment method'),
      orderAmount: pickLocaleText(locale, '订单金额', 'Order amount'),
      creditAmount: pickLocaleText(locale, '到账金额', 'Credited amount'),
      completedAt: pickLocaleText(locale, '完成时间', 'Completed at'),
      failedReason: pickLocaleText(locale, '失败原因', 'Failure reason'),
      processingAt: pickLocaleText(locale, '处理时间', 'Processing at'),
    }),
    [locale],
  );

  const cardCls = [
    'rounded-2xl border p-4',
    isDark ? 'border-slate-700 bg-slate-800/70 text-slate-200' : 'border-slate-200 bg-white text-slate-700 shadow-sm',
  ].join(' ');

  const tabBtn = (active: boolean) =>
    [
      'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      active
        ? isDark
          ? 'bg-slate-100 text-slate-900'
          : 'bg-slate-900 text-white'
        : isDark
          ? 'bg-slate-900/60 text-slate-300 hover:bg-slate-700'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
    ].join(' ');

  const renderPagination = (type: ActivityTab, pagination: PaginationInfo | undefined) => {
    if (!pagination || pagination.total_pages <= 1) return null;
    const currentPage = type === 'bindings' ? bindingsPage : rewardsPage;
    const setPage = type === 'bindings' ? setBindingsPage : setRewardsPage;
    return (
      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <div className={isDark ? 'text-slate-400' : 'text-slate-500'}>
          {tabText.total} {pagination.total} · {tabText.page} {pagination.page}/{pagination.total_pages}
          {locale === 'zh' ? tabText.pageSuffix : ''}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1 || activityLoading}
            onClick={() => {
              const nextPage = Math.max(1, currentPage - 1);
              setPage(nextPage);
              void fetchActivity(type === 'bindings' ? nextPage : bindingsPage, type === 'rewards' ? nextPage : rewardsPage);
            }}
            className="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {tabText.prev}
          </button>
          <button
            type="button"
            disabled={currentPage >= pagination.total_pages || activityLoading}
            onClick={() => {
              const nextPage = Math.min(pagination.total_pages, currentPage + 1);
              setPage(nextPage);
              void fetchActivity(type === 'bindings' ? nextPage : bindingsPage, type === 'rewards' ? nextPage : rewardsPage);
            }}
            className="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {tabText.next}
          </button>
        </div>
      </div>
    );
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
      title={pickLocaleText(locale, '邀请绑定', 'Invite binding')}
      subtitle={
        displayName
          ? pickLocaleText(
              locale,
              `为 ${displayName} 绑定邀请码，后续符合条件的订单可获取邀请奖励`,
              `Bind an invite code for ${displayName}. Eligible future orders can receive invite rewards.`,
            )
          : pickLocaleText(
              locale,
              '完成一次性邀请绑定后，后续符合条件的订单可获取邀请奖励',
              'Complete the one-time invite binding to receive invite rewards on eligible future orders.',
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

          <div className={cardCls}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className={isDark ? 'text-slate-400 text-xs' : 'text-slate-500 text-xs'}>{tabText.relationSummary}</div>
                <div className="mt-1 text-lg font-semibold">{activityData?.summary.bindingCount ?? 0}</div>
              </div>
              <div>
                <div className={isDark ? 'text-slate-400 text-xs' : 'text-slate-500 text-xs'}>{tabText.rewardSummary}</div>
                <div className="mt-1 text-lg font-semibold">{activityData?.summary.rewardAmount ?? 0}</div>
              </div>
              <div>
                <div className={isDark ? 'text-slate-400 text-xs' : 'text-slate-500 text-xs'}>{tabText.rewardDoneSummary}</div>
                <div className="mt-1 text-lg font-semibold">{activityData?.summary.completedRewardAmount ?? 0}</div>
              </div>
              <div>
                <div className={isDark ? 'text-slate-400 text-xs' : 'text-slate-500 text-xs'}>{tabText.meLabel}</div>
                <div className="mt-1 text-sm font-medium">#{activityData?.userId ?? '-'}</div>
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button type="button" className={tabBtn(activityTab === 'bindings')} onClick={() => setActivityTab('bindings')}>
                {tabText.bindings}
              </button>
              <button type="button" className={tabBtn(activityTab === 'rewards')} onClick={() => setActivityTab('rewards')}>
                {tabText.rewards}
              </button>
            </div>

            {activityError ? (
              <div className={isDark ? 'text-red-300 text-sm' : 'text-red-600 text-sm'}>{activityError}</div>
            ) : activityLoading && !activityData ? (
              <div className={isDark ? 'text-slate-400 text-sm' : 'text-slate-500 text-sm'}>
                {pickLocaleText(locale, '加载记录中...', 'Loading activity...')}
              </div>
            ) : activityTab === 'bindings' ? (
              <>
                {activityData?.bindings.length ? (
                  <div className="space-y-3">
                    {activityData.bindings.map((item) => {
                      const currentUserId = activityData.userId;
                      const isMeInviter = item.inviterUserId === currentUserId;
                      const counterpartyId = isMeInviter ? item.inviteeUserId : item.inviterUserId;
                      return (
                        <div
                          key={item.id}
                          className={[
                            'rounded-xl border p-3 text-sm',
                            isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50/80',
                          ].join(' ')}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={buildRolePillClass('self', isDark)}>
                                {isMeInviter ? tabText.meAsInviter : tabText.meAsInvitee}
                              </span>
                              <span className={buildRolePillClass('counterparty', isDark)}>
                                {tabText.otherParty} #{counterpartyId}
                              </span>
                            </div>
                            <div className={isDark ? 'text-slate-400 text-xs' : 'text-slate-500 text-xs'}>
                              {formatDateTime(item.createdAt, locale)}
                            </div>
                          </div>
                          <div className={['mt-3 grid gap-2 sm:grid-cols-2', isDark ? 'text-slate-300' : 'text-slate-600'].join(' ')}>
                            <div>
                              {tabText.inviter}：#{item.inviterUserId}
                            </div>
                            <div>
                              {tabText.invitee}：#{item.inviteeUserId}
                            </div>
                            <div>
                              {tabText.inviteCode}：<span className="font-mono">{item.inviteCode}</span>
                            </div>
                            <div>
                              {tabText.createdAt}：{formatDateTime(item.createdAt, locale)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={isDark ? 'text-slate-400 text-sm' : 'text-slate-500 text-sm'}>{tabText.emptyBindings}</div>
                )}
                {renderPagination('bindings', activityData?.bindings_pagination)}
              </>
            ) : (
              <>
                {activityData?.rewards.length ? (
                  <div className="space-y-3">
                    {activityData.rewards.map((item) => {
                      const statusText =
                        item.status === 'COMPLETED'
                          ? tabText.statusCompleted
                          : item.status === 'FAILED'
                            ? tabText.statusFailed
                            : item.status === 'PROCESSING'
                              ? tabText.statusProcessing
                              : tabText.statusPending;
                      return (
                        <div
                          key={item.id}
                          className={[
                            'rounded-xl border p-3 text-sm',
                            isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50/80',
                          ].join(' ')}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-medium">
                              {item.order.orderType === 'subscription'
                                ? pickLocaleText(locale, '订阅订单', 'Subscription order')
                                : pickLocaleText(locale, '余额充值', 'Balance top-up')}{' '}
                              #{item.orderId}
                            </div>
                            <span className={buildBadgeClass(item.status, isDark)}>{statusText}</span>
                          </div>
                          <div className={['mt-3 grid gap-2 sm:grid-cols-2', isDark ? 'text-slate-300' : 'text-slate-600'].join(' ')}>
                            <div>
                              {tabText.role}：{item.role === 'INVITER' ? tabText.roleInviter : tabText.roleInvitee}
                            </div>
                            <div>
                              {tabText.recipient}：#{item.recipientUserId}
                            </div>
                            <div>
                              {tabText.amount}：{item.amount}
                            </div>
                            <div>
                              {tabText.paymentMethod}：{item.order.paymentType || '-'}
                            </div>
                            <div>
                              {tabText.orderAmount}：{item.order.amount}
                            </div>
                            <div>
                              {tabText.creditAmount}：{item.order.creditAmount}
                            </div>
                            <div>
                              {tabText.inviter}：#{item.binding.inviterUserId}
                            </div>
                            <div>
                              {tabText.invitee}：#{item.binding.inviteeUserId}
                            </div>
                            <div>
                              {tabText.inviteCode}：<span className="font-mono">{item.binding.inviteCode}</span>
                            </div>
                            <div>
                              {tabText.createdAt}：{formatDateTime(item.createdAt, locale)}
                            </div>
                            <div>
                              {tabText.completedAt}：{formatDateTime(item.completedAt, locale)}
                            </div>
                            <div>
                              {tabText.processingAt}：{formatDateTime(item.processingAt, locale)}
                            </div>
                          </div>
                          {item.failedReason ? (
                            <div className={['mt-2 text-xs', isDark ? 'text-red-300' : 'text-red-600'].join(' ')}>
                              {tabText.failedReason}：{item.failedReason}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={isDark ? 'text-slate-400 text-sm' : 'text-slate-500 text-sm'}>{tabText.emptyRewards}</div>
                )}
                {renderPagination('rewards', activityData?.rewards_pagination)}
              </>
            )}
          </div>

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
