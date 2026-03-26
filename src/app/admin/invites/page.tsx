'use client';

import { useSearchParams } from 'next/navigation';
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

interface InviteAdminData {
  summary: {
    bindingCount: number;
    rewardCount: number;
    rewardAmount: number;
    completedRewardCount: number;
    completedRewardAmount: number;
    failedRewardCount: number;
    pendingRewardCount: number;
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

function InviteAdminContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const uiMode = searchParams.get('ui_mode') || 'standalone';
  const locale = resolveLocale(searchParams.get('lang'));
  const isDark = theme === 'dark';
  const isEmbedded = uiMode === 'embedded';

  const text =
    locale === 'en'
      ? {
          missingToken: 'Missing admin token',
          missingTokenHint: 'Please access the admin page from the Sub2API platform.',
          invalidToken: 'Invalid admin token',
          requestFailed: 'Request failed',
          loadFailed: 'Failed to load invite data',
          title: 'Invite Management',
          subtitle: 'Review invite bindings and reward grants',
          dashboard: 'Dashboard',
          refresh: 'Refresh',
          search: 'Search',
          userId: 'User ID',
          inviteCode: 'Invite Code',
          orderType: 'Order Type',
          rewardStatus: 'Reward Status',
          all: 'All',
          balance: 'Balance Top-Up',
          subscription: 'Subscription',
          statBindings: 'Bindings',
          statRewards: 'Reward Grants',
          statCompletedAmount: 'Completed Reward Amount',
          statFailed: 'Failed Grants',
          bindingsTitle: 'Invite Bindings',
          bindingsHint: 'Latest 100 bindings matching the current filters.',
          rewardsTitle: 'Reward Records',
          rewardsHint: 'Latest 200 reward grants matching the current filters.',
          noBindings: 'No bindings found',
          noRewards: 'No reward records found',
          inviter: 'Inviter',
          invitee: 'Invitee',
          code: 'Code',
          boundAt: 'Bound At',
          order: 'Order',
          role: 'Role',
          recipient: 'Recipient',
          amount: 'Amount',
          status: 'Status',
          createdAt: 'Created At',
          detail: 'Detail',
          loading: 'Loading...',
          roleInviter: 'Inviter',
          roleInvitee: 'Invitee',
          rewardStatuses: {
            '': 'All',
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
          loadFailed: '加载邀请数据失败',
          title: '邀请管理',
          subtitle: '查看邀请码绑定关系与返利发放记录',
          dashboard: '数据概览',
          refresh: '刷新',
          search: '搜索',
          userId: '用户 ID',
          inviteCode: '邀请码',
          orderType: '订单类型',
          rewardStatus: '返利状态',
          all: '全部',
          balance: '余额充值',
          subscription: '订阅',
          statBindings: '绑定数',
          statRewards: '返利记录数',
          statCompletedAmount: '已完成返利金额',
          statFailed: '失败返利数',
          bindingsTitle: '邀请码绑定',
          bindingsHint: '展示当前筛选条件下最新 100 条绑定记录。',
          rewardsTitle: '返利记录',
          rewardsHint: '展示当前筛选条件下最新 200 条返利记录。',
          noBindings: '暂无绑定记录',
          noRewards: '暂无返利记录',
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
          loading: '加载中...',
          roleInviter: '邀请人',
          roleInvitee: '被邀请人',
          rewardStatuses: {
            '': '全部',
            PENDING: '待处理',
            PROCESSING: '处理中',
            COMPLETED: '已完成',
            FAILED: '失败',
          },
        };

  const [filters, setFilters] = useState({
    userId: '',
    inviteCode: '',
    orderType: '',
    rewardStatus: '',
  });
  const [data, setData] = useState<InviteAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ token });
      if (filters.userId.trim()) params.set('user_id', filters.userId.trim());
      if (filters.inviteCode.trim()) params.set('invite_code', filters.inviteCode.trim());
      if (filters.orderType) params.set('order_type', filters.orderType);
      if (filters.rewardStatus) params.set('reward_status', filters.rewardStatus);

      const res = await fetch(`/api/admin/invites?${params.toString()}`);
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
  }, [filters.inviteCode, filters.orderType, filters.rewardStatus, filters.userId, text.invalidToken, text.loadFailed, text.requestFailed, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const navParams = useMemo(() => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (locale === 'en') params.set('lang', 'en');
    if (isDark) params.set('theme', 'dark');
    if (isEmbedded) params.set('ui_mode', 'embedded');
    return params.toString();
  }, [token, locale, isDark, isEmbedded]);

  const btnBase = [
    'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
    isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100',
  ].join(' ');

  const cardCls = [
    'rounded-xl border p-4',
    isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white shadow-sm',
  ].join(' ');

  const inputCls = [
    'w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40',
    isDark ? 'border-slate-600 bg-slate-900/50 text-slate-100 placeholder-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400',
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
          <a href={`/admin/dashboard?${navParams}`} className={btnBase}>
            {text.dashboard}
          </a>
          <button type="button" onClick={fetchData} className={btnBase}>
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

      <div className={`${cardCls} mb-4`}>
        <div className="grid gap-3 md:grid-cols-4">
          <input
            className={inputCls}
            placeholder={text.userId}
            value={filters.userId}
            onChange={(event) => setFilters((prev) => ({ ...prev, userId: event.target.value }))}
          />
          <input
            className={inputCls}
            placeholder={text.inviteCode}
            value={filters.inviteCode}
            onChange={(event) => setFilters((prev) => ({ ...prev, inviteCode: event.target.value.toUpperCase() }))}
          />
          <select
            className={inputCls}
            value={filters.orderType}
            onChange={(event) => setFilters((prev) => ({ ...prev, orderType: event.target.value }))}
          >
            <option value="">{text.orderType}: {text.all}</option>
            <option value="balance">{text.balance}</option>
            <option value="subscription">{text.subscription}</option>
          </select>
          <select
            className={inputCls}
            value={filters.rewardStatus}
            onChange={(event) => setFilters((prev) => ({ ...prev, rewardStatus: event.target.value }))}
          >
            {Object.entries(text.rewardStatuses).map(([value, label]) => (
              <option key={value} value={value}>
                {text.rewardStatus}: {label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={fetchData} className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700">
            {text.search}
          </button>
        </div>
      </div>

      {loading ? (
        <div className={`py-24 text-center ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{text.loading}</div>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: text.statBindings, value: data.summary.bindingCount },
              { label: text.statRewards, value: data.summary.rewardCount },
              { label: text.statCompletedAmount, value: `$${data.summary.completedRewardAmount.toFixed(2)}` },
              { label: text.statFailed, value: data.summary.failedRewardCount },
            ].map((item) => (
              <div key={item.label} className={cardCls}>
                <div className={['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>{item.label}</div>
                <div className={['mt-2 text-2xl font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <div className={cardCls}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className={['text-base font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>{text.bindingsTitle}</h3>
                <p className={['mt-1 text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>{text.bindingsHint}</p>
              </div>
              <div className={['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>{data.summary.bindingCount}</div>
            </div>

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
                        <td className="px-3 py-2">#{item.inviterUserId}</td>
                        <td className="px-3 py-2">#{item.inviteeUserId}</td>
                        <td className="px-3 py-2">{formatDateTime(item.createdAt, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={cardCls}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className={['text-base font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>{text.rewardsTitle}</h3>
                <p className={['mt-1 text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>{text.rewardsHint}</p>
              </div>
              <div className={['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                ${data.summary.rewardAmount.toFixed(2)} / {data.summary.rewardCount}
              </div>
            </div>

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
                        <td className="px-3 py-2">#{item.recipientUserId}</td>
                        <td className="px-3 py-2 font-medium">${item.amount.toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <span className={buildStatusBadge(item.status, isDark)}>{text.rewardStatuses[item.status]}</span>
                        </td>
                        <td className="px-3 py-2">{formatDateTime(item.createdAt, locale)}</td>
                        <td className="px-3 py-2 text-xs leading-5">
                          <div>
                            {locale === 'en' ? 'Inviter' : '邀请人'} #{item.binding.inviterUserId} / {locale === 'en' ? 'Invitee' : '被邀请人'} #{item.binding.inviteeUserId}
                          </div>
                          <div className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                            {item.order.orderType === 'balance'
                              ? `${text.balance} · +$${item.order.creditAmount.toFixed(2)}`
                              : `${text.subscription} · ¥${item.order.amount.toFixed(2)}`}
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

function InviteAdminPageFallback() {
  const searchParams = useSearchParams();
  const locale = resolveLocale(searchParams.get('lang'));
  const isDark = searchParams.get('theme') === 'dark';

  return (
    <div className={`flex min-h-screen items-center justify-center ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <div className={isDark ? 'text-slate-400' : 'text-slate-500'}>{locale === 'en' ? 'Loading...' : '加载中...'}</div>
    </div>
  );
}

export default function InviteAdminPage() {
  return (
    <Suspense fallback={<InviteAdminPageFallback />}>
      <InviteAdminContent />
    </Suspense>
  );
}
