'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import PayPageLayout from '@/components/PayPageLayout';
import { resolveLocale } from '@/lib/locale';

interface InviteBindingItem {
  id: string;
  inviterUserId: number;
  inviteeUserId: number;
  inviteCode: string;
  inviteCodeOwnerUserId: number;
  createdAt: string;
}

interface InviteRewardItem {
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
}

interface UserInviteDetailData {
  userId: number;
  summary: {
    asInviterCount: number;
    asInviteeCount: number;
    receivedRewardCount: number;
    receivedRewardAmount: number;
    generatedInviteeRewardCount: number;
    generatedInviteeRewardAmount: number;
    inviterSelfRewardCount: number;
    inviterSelfRewardAmount: number;
  };
  bindings: InviteBindingItem[];
  rewards: InviteRewardItem[];
}

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

function buildStatusBadge(status: InviteRewardItem['status'], isDark: boolean) {
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

function UserInviteDetailContent() {
  const params = useParams<{ userId: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const uiMode = searchParams.get('ui_mode') || 'standalone';
  const locale = resolveLocale(searchParams.get('lang'));
  const isDark = theme === 'dark';
  const isEmbedded = uiMode === 'embedded';
  const userId = Number(params.userId || '0');

  const text =
    locale === 'en'
      ? {
          missingToken: 'Missing admin token',
          missingTokenHint: 'Please access the admin page from the Sub2API platform.',
          invalidToken: 'Invalid admin token',
          requestFailed: 'Request failed',
          loadFailed: 'Failed to load invite detail',
          title: 'Invite User Detail',
          subtitle: `Inspect invite activity for user #${userId || '-'}`,
          back: 'Back to Invites',
          refresh: 'Refresh',
          loading: 'Loading...',
          statAsInviter: 'Bindings as Inviter',
          statAsInvitee: 'Bindings as Invitee',
          statReceivedRewards: 'Rewards Received',
          statGeneratedInviteeRewards: 'Invitee Rewards Generated',
          statInviterSelfRewards: 'Inviter Rewards Received',
          bindingsTitle: 'Related Bindings',
          rewardsTitle: 'Related Reward Records',
          noBindings: 'No related bindings',
          noRewards: 'No related rewards',
          inviter: 'Inviter',
          invitee: 'Invitee',
          code: 'Invite Code',
          boundAt: 'Bound At',
          order: 'Order',
          role: 'Role',
          recipient: 'Recipient',
          amount: 'Amount',
          status: 'Status',
          createdAt: 'Created At',
          detail: 'Detail',
          balance: 'Balance Top-Up',
          subscription: 'Subscription',
          roleInviter: 'Inviter',
          roleInvitee: 'Invitee',
          rewardStatuses: {
            PENDING: 'Pending',
            PROCESSING: 'Processing',
            COMPLETED: 'Completed',
            FAILED: 'Failed',
          },
        }
      : {
          missingToken: '缺少管理员凭证',
          missingTokenHint: '请从 Sub2API 平台正确访问管理页面',
          invalidToken: '管理员凭证无效',
          requestFailed: '请求失败',
          loadFailed: '加载邀请详情失败',
          title: '单人邀请详情',
          subtitle: `查看用户 #${userId || '-'} 的邀请活动`,
          back: '返回邀请管理',
          refresh: '刷新',
          loading: '加载中...',
          statAsInviter: '作为邀请人的绑定数',
          statAsInvitee: '作为被邀请人的绑定数',
          statReceivedRewards: '收到返利',
          statGeneratedInviteeRewards: '为被邀请人生成返利',
          statInviterSelfRewards: '邀请人自收返利',
          bindingsTitle: '相关绑定记录',
          rewardsTitle: '相关返利记录',
          noBindings: '暂无相关绑定记录',
          noRewards: '暂无相关返利记录',
          inviter: '邀请人',
          invitee: '被邀请人',
          code: '邀请码',
          boundAt: '绑定时间',
          order: '订单',
          role: '角色',
          recipient: '收款用户',
          amount: '金额',
          status: '状态',
          createdAt: '创建时间',
          detail: '说明',
          balance: '余额充值',
          subscription: '订阅',
          roleInviter: '邀请人',
          roleInvitee: '被邀请人',
          rewardStatuses: {
            PENDING: '待处理',
            PROCESSING: '处理中',
            COMPLETED: '已完成',
            FAILED: '失败',
          },
        };

  const [data, setData] = useState<UserInviteDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const hrefWithCurrentQuery = useCallback(
    (path: string) => {
      const query = searchParams.toString();
      return query ? `${path}?${query}` : path;
    },
    [searchParams],
  );

  const fetchData = useCallback(async () => {
    if (!token || !Number.isInteger(userId) || userId <= 0) return;
    setLoading(true);
    setError('');
    try {
      const query = searchParams.toString();
      const res = await fetch(`/api/admin/invites/user/${userId}${query ? `?${query}` : ''}`);
      if (!res.ok) {
        if (res.status === 401) {
          setError(text.invalidToken);
          return;
        }
        throw new Error(text.requestFailed);
      }
      setData(await res.json());
    } catch {
      setError(text.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [searchParams, text.invalidToken, text.loadFailed, text.requestFailed, token, userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const btnBase = [
    'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
    isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100',
  ].join(' ');

  const cardCls = [
    'rounded-xl border p-4',
    isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white shadow-sm',
  ].join(' ');

  const userLinkCls = [
    'font-medium underline underline-offset-2 transition-colors',
    isDark ? 'text-cyan-300 hover:text-cyan-200' : 'text-cyan-700 hover:text-cyan-900',
  ].join(' ');

  if (!token) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="text-center text-red-500">
          <p className="text-lg font-medium">{text.missingToken}</p>
          <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{text.missingTokenHint}</p>
        </div>
      </div>
    );
  }

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
          <a href={hrefWithCurrentQuery('/admin/invites')} className={btnBase}>
            {text.back}
          </a>
          <button type="button" onClick={fetchData} className={btnBase}>
            {text.refresh}
          </button>
        </>
      }
    >
      {error && (
        <div className={`mb-4 rounded-lg border p-3 text-sm ${isDark ? 'border-red-800 bg-red-950/50 text-red-400' : 'border-red-200 bg-red-50 text-red-600'}`}>
          {error}
          <button onClick={() => setError('')} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {loading ? (
        <div className={`py-24 text-center ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{text.loading}</div>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: text.statAsInviter, value: data.summary.asInviterCount },
              { label: text.statAsInvitee, value: data.summary.asInviteeCount },
              { label: text.statReceivedRewards, value: `$${data.summary.receivedRewardAmount.toFixed(2)} / ${data.summary.receivedRewardCount}` },
              { label: text.statGeneratedInviteeRewards, value: `$${data.summary.generatedInviteeRewardAmount.toFixed(2)} / ${data.summary.generatedInviteeRewardCount}` },
              { label: text.statInviterSelfRewards, value: `$${data.summary.inviterSelfRewardAmount.toFixed(2)} / ${data.summary.inviterSelfRewardCount}` },
            ].map((item) => (
              <div key={item.label} className={cardCls}>
                <div className={['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>{item.label}</div>
                <div className={['mt-2 text-2xl font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>{item.value}</div>
              </div>
            ))}
          </div>

          <div className={cardCls}>
            <h3 className={['mb-4 text-base font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>{text.bindingsTitle}</h3>
            {data.bindings.length === 0 ? (
              <div className={['rounded-lg border border-dashed px-4 py-8 text-center text-sm', isDark ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-500'].join(' ')}>{text.noBindings}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                      <th className="px-3 py-2 text-left font-medium">{text.code}</th>
                      <th className="px-3 py-2 text-left font-medium">{text.inviter}</th>
                      <th className="px-3 py-2 text-left font-medium">{text.invitee}</th>
                      <th className="px-3 py-2 text-left font-medium">{text.boundAt}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bindings.map((item) => (
                      <tr key={item.id} className={['border-t', isDark ? 'border-slate-700' : 'border-slate-200'].join(' ')}>
                        <td className="px-3 py-2 font-mono">{item.inviteCode}</td>
                        <td className="px-3 py-2">
                          <a href={hrefWithCurrentQuery(`/admin/invites/user/${item.inviterUserId}`)} className={userLinkCls}>#{item.inviterUserId}</a>
                        </td>
                        <td className="px-3 py-2">
                          <a href={hrefWithCurrentQuery(`/admin/invites/user/${item.inviteeUserId}`)} className={userLinkCls}>#{item.inviteeUserId}</a>
                        </td>
                        <td className="px-3 py-2">{formatDateTime(item.createdAt, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={cardCls}>
            <h3 className={['mb-4 text-base font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>{text.rewardsTitle}</h3>
            {data.rewards.length === 0 ? (
              <div className={['rounded-lg border border-dashed px-4 py-8 text-center text-sm', isDark ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-500'].join(' ')}>{text.noRewards}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                      <th className="px-3 py-2 text-left font-medium">{text.order}</th>
                      <th className="px-3 py-2 text-left font-medium">{text.code}</th>
                      <th className="px-3 py-2 text-left font-medium">{text.role}</th>
                      <th className="px-3 py-2 text-left font-medium">{text.recipient}</th>
                      <th className="px-3 py-2 text-left font-medium">{text.amount}</th>
                      <th className="px-3 py-2 text-left font-medium">{text.status}</th>
                      <th className="px-3 py-2 text-left font-medium">{text.createdAt}</th>
                      <th className="px-3 py-2 text-left font-medium">{text.detail}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rewards.map((item) => (
                      <tr key={item.id} className={['border-t align-top', isDark ? 'border-slate-700' : 'border-slate-200'].join(' ')}>
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs">{item.orderId.slice(0, 10)}</div>
                          <div className={['mt-1 text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                            {item.order.orderType === 'balance' ? text.balance : text.subscription}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono">{item.binding.inviteCode}</td>
                        <td className="px-3 py-2">{item.role === 'INVITER' ? text.roleInviter : text.roleInvitee}</td>
                        <td className="px-3 py-2">
                          <a href={hrefWithCurrentQuery(`/admin/invites/user/${item.recipientUserId}`)} className={userLinkCls}>#{item.recipientUserId}</a>
                        </td>
                        <td className="px-3 py-2 font-medium">${item.amount.toFixed(2)}</td>
                        <td className="px-3 py-2"><span className={buildStatusBadge(item.status, isDark)}>{text.rewardStatuses[item.status]}</span></td>
                        <td className="px-3 py-2">{formatDateTime(item.createdAt, locale)}</td>
                        <td className="px-3 py-2 text-xs leading-5">
                          <div>
                            {locale === 'en' ? 'Inviter' : '邀请人'} <a href={hrefWithCurrentQuery(`/admin/invites/user/${item.binding.inviterUserId}`)} className={userLinkCls}>#{item.binding.inviterUserId}</a>
                            {' / '}
                            {locale === 'en' ? 'Invitee' : '被邀请人'} <a href={hrefWithCurrentQuery(`/admin/invites/user/${item.binding.inviteeUserId}`)} className={userLinkCls}>#{item.binding.inviteeUserId}</a>
                          </div>
                          <div className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                            {locale === 'en' ? 'Order user' : '下单用户'} <a href={hrefWithCurrentQuery(`/admin/invites/user/${item.order.userId}`)} className={userLinkCls}>#{item.order.userId}</a>
                          </div>
                          <div className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                            {item.order.orderType === 'balance' ? `${text.balance} · +$${item.order.creditAmount.toFixed(2)}` : `${text.subscription} · ¥${item.order.amount.toFixed(2)}`}
                          </div>
                          {item.failedReason ? <div className="text-red-400">{item.failedReason}</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </PayPageLayout>
  );
}

function UserInviteDetailPageFallback() {
  const searchParams = useSearchParams();
  const locale = resolveLocale(searchParams.get('lang'));
  const isDark = searchParams.get('theme') === 'dark';

  return (
    <div className={`flex min-h-screen items-center justify-center ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <div className={isDark ? 'text-slate-400' : 'text-slate-500'}>{locale === 'en' ? 'Loading...' : '加载中...'}</div>
    </div>
  );
}

export default function UserInviteDetailPage() {
  return (
    <Suspense fallback={<UserInviteDetailPageFallback />}>
      <UserInviteDetailContent />
    </Suspense>
  );
}
