'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PayPageLayout from '@/components/PayPageLayout';
import { formatCreatedAt } from '@/lib/pay-utils';
import { resolveLocale } from '@/lib/locale';

interface DuanwuAdminData {
  activity: {
    key: string;
    startAt: string;
    endAt: string;
    minTotalAmount: number;
  };
  summary: {
    participantCount: number;
    qualifiedUserCount: number;
    issuedRewardAmount: number;
    participantRechargeAmount: number;
  };
  prizeStats: Array<{
    prizeKey: string;
    prizeName: string;
    count: number;
    totalAmount: number;
  }>;
  issueStats: Array<{
    issueStatus: 'PENDING' | 'ISSUED' | 'ISSUE_FAILED';
    count: number;
  }>;
  records: Array<{
    id: string;
    userId: number;
    userName: string | null;
    userEmail: string | null;
    userNotes: string | null;
    rechargeOrderCount: number;
    totalRechargeAmount: number;
    prizeKey: string;
    prizeName: string;
    prizeAmount: number;
    issueStatus: 'PENDING' | 'ISSUED' | 'ISSUE_FAILED';
    issueError: string | null;
    issuedAt: string | null;
    createdAt: string;
  }>;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

function getIssueStatusLabel(status: string, locale: 'zh' | 'en') {
  const map: Record<string, { zh: string; en: string }> = {
    PENDING: { zh: '待发放', en: 'Pending' },
    ISSUED: { zh: '已发放', en: 'Issued' },
    ISSUE_FAILED: { zh: '发放失败', en: 'Issue Failed' },
  };
  return map[status]?.[locale] || status;
}

function DuanwuAdminContent() {
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
          title: 'Duanwu Activity',
          subtitle: 'Participants, winning results, and reward issuance overview',
          loading: 'Loading...',
          refresh: 'Refresh',
          participantCount: 'Participants',
          qualifiedUserCount: 'Qualified Users',
          issuedRewardAmount: 'Rewards Issued',
          participantRechargeAmount: 'Recharge Amount',
          prizeDistribution: 'Prize Distribution',
          issueDistribution: 'Issue Status',
          recordList: 'Participant Records',
          user: 'User',
          recharge: 'Recharge',
          prize: 'Prize',
          issueStatus: 'Issue Status',
          createdAt: 'Created At',
          issuedAt: 'Issued At',
          empty: 'No records',
          queryFailed: 'Failed to load activity data',
        }
      : {
          title: '端午活动后台',
          subtitle: '查看参与用户、中奖结果与奖品发放情况',
          loading: '加载中...',
          refresh: '刷新',
          participantCount: '参与人数',
          qualifiedUserCount: '达标人数',
          issuedRewardAmount: '已发奖金额',
          participantRechargeAmount: '参与用户累计充值',
          prizeDistribution: '中奖分布',
          issueDistribution: '发奖状态',
          recordList: '用户记录',
          user: '用户',
          recharge: '充值情况',
          prize: '中奖结果',
          issueStatus: '发奖状态',
          createdAt: '抽奖时间',
          issuedAt: '发放时间',
          empty: '暂无记录',
          queryFailed: '加载活动数据失败',
        };

  const [data, setData] = useState<DuanwuAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    params.set('page_size', '50');
    if (locale === 'en') params.set('lang', 'en');
    return `/api/admin/duanwu?${params.toString()}`;
  }, [locale, token]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) {
        throw new Error(text.queryFailed);
      }
      setData(await res.json());
    } catch {
      setError(text.queryFailed);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, text.queryFailed, token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <PayPageLayout
      isDark={isDark}
      isEmbedded={isEmbedded}
      maxWidth="full"
      title={text.title}
      subtitle={text.subtitle}
      locale={locale}
      actions={
        <button
          type="button"
          onClick={loadData}
          className={[
            'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
            isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100',
          ].join(' ')}
        >
          {text.refresh}
        </button>
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
        <div className={['py-20 text-center', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>{text.loading}</div>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard isDark={isDark} label={text.participantCount} value={String(data.summary.participantCount)} />
            <AdminStatCard isDark={isDark} label={text.qualifiedUserCount} value={String(data.summary.qualifiedUserCount)} />
            <AdminStatCard isDark={isDark} label={text.issuedRewardAmount} value={`¥${data.summary.issuedRewardAmount.toFixed(2)}`} />
            <AdminStatCard
              isDark={isDark}
              label={text.participantRechargeAmount}
              value={`¥${data.summary.participantRechargeAmount.toFixed(2)}`}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div
              className={[
                'rounded-2xl border p-5',
                isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white',
              ].join(' ')}
            >
              <div className={['mb-4 text-lg font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
                {text.prizeDistribution}
              </div>
              <div className="space-y-3">
                {data.prizeStats.map((item) => (
                  <div
                    key={item.prizeKey}
                    className={[
                      'flex items-center justify-between rounded-xl border px-4 py-3 text-sm',
                      isDark ? 'border-slate-800 bg-slate-950/40 text-slate-200' : 'border-slate-100 bg-slate-50 text-slate-700',
                    ].join(' ')}
                  >
                    <div>
                      <div className="font-medium">{item.prizeName}</div>
                      <div className={isDark ? 'text-slate-400' : 'text-slate-500'}>{item.count} 人</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">¥{item.totalAmount.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className={[
                'rounded-2xl border p-5',
                isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white',
              ].join(' ')}
            >
              <div className={['mb-4 text-lg font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
                {text.issueDistribution}
              </div>
              <div className="space-y-3">
                {data.issueStats.map((item) => (
                  <div
                    key={item.issueStatus}
                    className={[
                      'flex items-center justify-between rounded-xl border px-4 py-3 text-sm',
                      isDark ? 'border-slate-800 bg-slate-950/40 text-slate-200' : 'border-slate-100 bg-slate-50 text-slate-700',
                    ].join(' ')}
                  >
                    <div className="font-medium">{getIssueStatusLabel(item.issueStatus, locale)}</div>
                    <div className="font-semibold">{item.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            className={[
              'overflow-hidden rounded-2xl border',
              isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white',
            ].join(' ')}
          >
            <div className={['border-b px-5 py-4 text-lg font-semibold', isDark ? 'border-slate-700 text-slate-100' : 'border-slate-200 text-slate-900'].join(' ')}>
              {text.recordList}
            </div>
            <div className={['grid grid-cols-6 gap-4 border-b px-5 py-3 text-xs font-medium', isDark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'].join(' ')}>
              <div>{text.user}</div>
              <div>{text.recharge}</div>
              <div>{text.prize}</div>
              <div>{text.issueStatus}</div>
              <div>{text.createdAt}</div>
              <div>{text.issuedAt}</div>
            </div>

            {data.records.length === 0 ? (
              <div className={['px-5 py-8 text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>{text.empty}</div>
            ) : (
              data.records.map((record) => (
                <div
                  key={record.id}
                  className={[
                    'grid grid-cols-1 gap-3 border-b px-5 py-4 text-sm sm:grid-cols-6 sm:items-center',
                    isDark ? 'border-slate-800 text-slate-200' : 'border-slate-100 text-slate-700',
                  ].join(' ')}
                >
                  <div>
                    <div className="font-medium">
                      {record.userName || record.userEmail || `#${record.userId}`}
                    </div>
                    <div className={['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                      UID: {record.userId}
                      {record.userEmail ? ` · ${record.userEmail}` : ''}
                    </div>
                  </div>
                  <div>
                    <div>¥{record.totalRechargeAmount.toFixed(2)}</div>
                    <div className={['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                      {record.rechargeOrderCount} 笔
                    </div>
                  </div>
                  <div>
                    <div className="font-medium">{record.prizeName}</div>
                    <div className={['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                      ¥{record.prizeAmount.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div>{getIssueStatusLabel(record.issueStatus, locale)}</div>
                    {record.issueError && (
                      <div className="text-xs text-red-500 line-clamp-2">{record.issueError}</div>
                    )}
                  </div>
                  <div>{formatCreatedAt(record.createdAt, locale)}</div>
                  <div>{record.issuedAt ? formatCreatedAt(record.issuedAt, locale) : '-'}</div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </PayPageLayout>
  );
}

function AdminStatCard({ isDark, label, value }: { isDark: boolean; label: string; value: string }) {
  return (
    <div
      className={[
        'rounded-2xl border p-4',
        isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white',
      ].join(' ')}
    >
      <div className={['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>{label}</div>
      <div className={['mt-2 text-2xl font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
        {value}
      </div>
    </div>
  );
}

function Fallback() {
  return <div className="p-8 text-sm text-slate-500">Loading...</div>;
}

export default function AdminDuanwuPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <DuanwuAdminContent />
    </Suspense>
  );
}
