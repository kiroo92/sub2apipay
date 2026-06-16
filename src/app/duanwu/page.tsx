'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PayPageLayout from '@/components/PayPageLayout';
import { applyLocaleToSearchParams, pickLocaleText, resolveLocale } from '@/lib/locale';
import { formatCreatedAt, getPaymentChannelLabel } from '@/lib/pay-utils';

interface DuanwuData {
  user: {
    id: number;
    username?: string;
    email?: string | null;
    balance?: number;
  };
  activity: {
    key: string;
    name: string;
    minTotalAmount: number;
    startAt: string;
    endAt: string;
    prizes: Array<{ key: string; name: string; amount: number }>;
  };
  orders: Array<{
    id: string;
    amount: number;
    createdAt: string;
    paidAt: string | null;
    paymentType: string;
    status: string;
  }>;
  drawRecord: {
    id: string;
    prizeKey: string;
    prizeName: string;
    prizeAmount: number;
    issueStatus: 'PENDING' | 'ISSUED' | 'ISSUE_FAILED';
    issueError: string | null;
    createdAt: string;
    issuedAt: string | null;
    rechargeOrderCount: number;
    totalRechargeAmount: number;
  } | null;
  stats: {
    paidRechargeCount: number;
    totalRechargeAmount: number;
    eligible: boolean;
    hasDrawn: boolean;
    canDraw: boolean;
    canRetryIssue: boolean;
  };
}

function DuanwuPageContent() {
  const searchParams = useSearchParams();
  const token = (searchParams.get('token') || '').trim();
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const uiMode = searchParams.get('ui_mode') || 'standalone';
  const locale = resolveLocale(searchParams.get('lang'));
  const isDark = theme === 'dark';

  const [data, setData] = useState<DuanwuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [drawResult, setDrawResult] = useState<{
    name: string;
    amount: number;
    alreadyDrawn: boolean;
    reissue: boolean;
  } | null>(null);

  const backToPayUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    params.set('theme', theme);
    params.set('ui_mode', uiMode);
    applyLocaleToSearchParams(params, locale);
    return `/pay?${params.toString()}`;
  }, [locale, theme, token, uiMode]);

  const loadDataUrl = useMemo(() => {
    if (!token) return null;
    const url = new URL('/api/duanwu', 'http://localhost');
    url.searchParams.set('token', token);
    if (locale === 'en') url.searchParams.set('lang', 'en');
    return `${url.pathname}${url.search}`;
  }, [locale, token]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError(pickLocaleText(locale, '缺少 token 参数', 'Missing token parameter'));
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        if (!loadDataUrl) return;
        const res = await fetch(loadDataUrl);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'load failed');
        }
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadDataUrl, locale, token]);

  const handleDraw = async () => {
    if (!token) return;
    setDrawing(true);
    setError('');
    setDrawResult(null);

    try {
      const res = await fetch('/api/duanwu/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'draw failed');
      }
      setDrawResult({
        name: json.prize.name,
        amount: json.prize.amount,
        alreadyDrawn: json.alreadyDrawn,
        reissue: json.reissue,
      });
      if (loadDataUrl) {
        const refreshRes = await fetch(loadDataUrl);
        const refreshJson = await refreshRes.json();
        if (!refreshRes.ok) {
          throw new Error(refreshJson.error || 'load failed');
        }
        setData(refreshJson);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDrawing(false);
    }
  };

  const minAmount = data?.activity.minTotalAmount ?? 66.66;
  const totalAmount = data?.stats.totalRechargeAmount ?? 0;
  const remaining = Math.max(0, minAmount - totalAmount);
  const canDraw = data?.stats.canDraw ?? false;
  const hasDrawn = data?.stats.hasDrawn ?? false;
  const drawStatusText = hasDrawn
    ? data?.stats.canRetryIssue
      ? pickLocaleText(locale, '待补发', 'Retry Issue')
      : pickLocaleText(locale, '已参与', 'Completed')
    : canDraw
      ? pickLocaleText(locale, '龙舟启航', 'Ready')
      : pickLocaleText(locale, '尚未达标', 'Locked');

  return (
    <PayPageLayout
      isDark={isDark}
      isEmbedded={uiMode === 'embedded'}
      maxWidth="lg"
      locale={locale}
      title={pickLocaleText(locale, '端午龙舟抽奖', 'Dragon Boat Festival Draw')}
      subtitle={pickLocaleText(
        locale,
        '竹香入夏，舟行粽浪。6 月充值达标即可参与节日抽奖。',
        'A festive June draw with zongzi, river waves, and one lucky spin.',
      )}
      actions={
        <a
          href={backToPayUrl}
          className={[
            'inline-flex items-center rounded-full border px-4 py-2 text-xs font-semibold transition-colors',
            isDark
              ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20'
              : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
          ].join(' ')}
        >
          {pickLocaleText(locale, '返回充值页', 'Back to Pay')}
        </a>
      }
    >
      <div
        className={[
          'relative overflow-hidden rounded-[32px] border px-5 py-6 sm:px-8 sm:py-8',
          isDark
            ? 'border-emerald-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.14),_transparent_38%),linear-gradient(135deg,#052e2b_0%,#0b1f1d_46%,#1b4332_100%)]'
            : 'border-emerald-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.16),_transparent_40%),linear-gradient(135deg,#fff8ef_0%,#f4fff8_48%,#e9f7ef_100%)]',
        ].join(' ')}
      >
        <div className="pointer-events-none absolute -right-10 top-4 h-28 w-28 rounded-full border border-emerald-300/20" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 rounded-full bg-amber-300/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 opacity-60">
          <div className="absolute inset-x-0 bottom-8 h-px bg-gradient-to-r from-transparent via-emerald-400/45 to-transparent" />
          <div className="absolute inset-x-10 bottom-5 h-px bg-gradient-to-r from-transparent via-emerald-300/30 to-transparent" />
          <div className="absolute inset-x-20 bottom-2 h-px bg-gradient-to-r from-transparent via-emerald-200/20 to-transparent" />
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div
              className={[
                'mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold tracking-[0.2em]',
                isDark ? 'bg-emerald-500/15 text-emerald-100' : 'bg-emerald-100 text-emerald-700',
              ].join(' ')}
            >
              <span>DRAGON BOAT</span>
              <span className={isDark ? 'text-amber-300' : 'text-amber-600'}>•</span>
              <span>{pickLocaleText(locale, '端午限定', 'JUNE EVENT')}</span>
            </div>

            <div className="flex items-start gap-4">
              <div
                className={[
                  'flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] border text-3xl shadow-lg',
                  isDark
                    ? 'border-emerald-400/30 bg-emerald-500/10 shadow-emerald-900/40'
                    : 'border-emerald-200 bg-white/80 shadow-emerald-100',
                ].join(' ')}
              >
                粽
              </div>
              <div>
                <h2 className={['text-3xl font-black tracking-tight sm:text-4xl', isDark ? 'text-amber-50' : 'text-emerald-950'].join(' ')}>
                  {pickLocaleText(locale, '粽浪开奖', 'River of Rewards')}
                </h2>
                <p className={['mt-3 max-w-2xl text-sm leading-7 sm:text-base', isDark ? 'text-emerald-50/80' : 'text-emerald-950/70'].join(' ')}>
                  {pickLocaleText(
                    locale,
                    '这是一场独立的端午活动页。系统会根据你 2026 年 6 月的充值记录判断是否可参与，满足条件后即可抽取节日奖励。',
                    'This is a dedicated seasonal page. Eligibility is determined from your June 2026 recharge records, and qualified users can draw a festival reward.',
                  )}
                </p>
                <div
                  className={[
                    'mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold tracking-[0.12em]',
                    isDark ? 'bg-amber-300/12 text-amber-100' : 'bg-amber-100 text-amber-700',
                  ].join(' ')}
                >
                  <span>100%</span>
                  <span>{pickLocaleText(locale, '中奖率', 'WIN RATE')}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                isDark={isDark}
                accent="emerald"
                label={pickLocaleText(locale, '6 月订单数', 'June Orders')}
                value={String(data?.stats.paidRechargeCount ?? 0)}
                hint={pickLocaleText(locale, '已支付充值订单', 'Paid recharge orders')}
              />
              <MetricCard
                isDark={isDark}
                accent="amber"
                label={pickLocaleText(locale, '6 月累计充值', 'June Total')}
                value={`¥${totalAmount.toFixed(2)}`}
                hint={pickLocaleText(locale, '活动统计口径', 'Activity total')}
              />
              <MetricCard
                isDark={isDark}
                accent="cyan"
                label={pickLocaleText(locale, '距离门槛', 'Remaining')}
                value={`¥${remaining.toFixed(2)}`}
                hint={pickLocaleText(locale, '满额自动解锁', 'Unlock at threshold')}
              />
              <MetricCard
                isDark={isDark}
                accent="rose"
                label={pickLocaleText(locale, '当前状态', 'Status')}
                value={drawStatusText}
                hint={pickLocaleText(locale, '活动进行中', 'Festival live')}
              />
            </div>
          </div>

          <div
            className={[
              'relative overflow-hidden rounded-[28px] border p-5 sm:p-6',
              isDark
                ? 'border-amber-300/20 bg-black/15 shadow-2xl shadow-emerald-950/30'
                : 'border-amber-200 bg-white/70 shadow-xl shadow-amber-100/80',
            ].join(' ')}
          >
            <div className="pointer-events-none absolute -top-8 right-6 text-8xl opacity-10">舟</div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={['text-xs font-semibold tracking-[0.18em]', isDark ? 'text-amber-200/80' : 'text-amber-700'].join(' ')}>
                  {pickLocaleText(locale, '奖池一览', 'REWARD POOL')}
                </div>
                <h3 className={['mt-2 text-2xl font-bold', isDark ? 'text-amber-50' : 'text-emerald-950'].join(' ')}>
                  {pickLocaleText(locale, '划桨开盲盒', 'Festival Prize Set')}
                </h3>
              </div>
              <div
                className={[
                  'rounded-full px-3 py-1 text-xs font-semibold',
                  canDraw
                    ? isDark
                      ? 'bg-emerald-400/20 text-emerald-100'
                      : 'bg-emerald-100 text-emerald-700'
                    : isDark
                      ? 'bg-slate-700 text-slate-300'
                      : 'bg-slate-100 text-slate-600',
                ].join(' ')}
              >
                {drawStatusText}
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {(data?.activity.prizes ?? []).map((prize, index) => (
                <PrizeStrip key={prize.key} isDark={isDark} index={index} name={prize.name} amount={prize.amount} />
              ))}
            </div>

            <div className={['mt-6 space-y-2 text-sm leading-6', isDark ? 'text-emerald-50/75' : 'text-emerald-950/70'].join(' ')}>
              <p>{pickLocaleText(locale, '规则 1：仅统计 2026 年 6 月内已支付的余额充值订单。', 'Rule 1: only paid balance recharge orders in June 2026 are counted.')}</p>
              <p>{pickLocaleText(locale, `规则 2：6 月累计充值满 ¥${minAmount.toFixed(2)} 才能抽奖。`, `Rule 2: your June total recharge must reach ¥${minAmount.toFixed(2)}.`)}</p>
              <p>{pickLocaleText(locale, '规则 3：每个用户整个活动只能抽一次。', 'Rule 3: each user can draw only once for the whole activity.')}</p>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={loading || drawing || !canDraw}
                onClick={handleDraw}
                className={[
                  'inline-flex min-w-40 items-center justify-center rounded-full px-5 py-3 text-sm font-bold transition-all duration-200',
                  loading || drawing || !canDraw
                    ? 'cursor-not-allowed bg-slate-400/60 text-white/80'
                    : isDark
                      ? 'bg-gradient-to-r from-amber-400 via-orange-400 to-emerald-400 text-emerald-950 shadow-lg shadow-amber-500/20 hover:-translate-y-0.5'
                      : 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-amber-400 text-white shadow-lg shadow-emerald-200 hover:-translate-y-0.5',
                ].join(' ')}
              >
                {drawing
                  ? pickLocaleText(locale, '龙舟冲刺中...', 'Drawing...')
                  : data?.stats.canRetryIssue
                    ? pickLocaleText(locale, '重试发奖', 'Retry Reward')
                    : pickLocaleText(locale, '立即抽奖', 'Draw Now')}
              </button>
              <div className={['text-xs leading-5', isDark ? 'text-emerald-50/55' : 'text-slate-500'].join(' ')}>
                {pickLocaleText(
                  locale,
                  '100% 中奖，活动策略由系统后台自动判定，结果将在抽奖后即时到账。',
                  '100% win rate. Reward rules are enforced server-side and the result is credited immediately after draw.',
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div
          className={[
            'mt-5 rounded-2xl border px-4 py-3 text-sm',
            isDark ? 'border-red-700 bg-red-900/30 text-red-300' : 'border-red-200 bg-red-50 text-red-600',
          ].join(' ')}
        >
          {error}
        </div>
      )}

      {drawResult && (
        <div
          className={[
            'mt-5 overflow-hidden rounded-[30px] border p-5 sm:p-6',
            isDark
              ? 'border-amber-300/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(16,185,129,0.18))] text-amber-50'
              : 'border-amber-200 bg-[linear-gradient(135deg,rgba(251,191,36,0.22),rgba(16,185,129,0.12))] text-emerald-950',
          ].join(' ')}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className={['text-xs font-semibold tracking-[0.16em]', isDark ? 'text-amber-100/70' : 'text-amber-700'].join(' ')}>
                {pickLocaleText(locale, '开奖结果', 'DRAW RESULT')}
              </div>
              <div className="mt-2 text-3xl font-black">
                {drawResult.alreadyDrawn
                  ? drawResult.reissue
                    ? pickLocaleText(locale, '奖励已补发', 'Reward Reissued')
                    : pickLocaleText(locale, '已完成抽奖', 'Draw Completed')
                  : pickLocaleText(locale, '恭喜中签', 'Lucky Draw Success')}
              </div>
              <div className={['mt-2 text-sm', isDark ? 'text-amber-50/80' : 'text-emerald-950/75'].join(' ')}>
                {pickLocaleText(locale, `你获得了 ${drawResult.name}，奖励 ¥${drawResult.amount.toFixed(2)}`, `You received ${drawResult.name}, reward ¥${drawResult.amount.toFixed(2)}`)}
              </div>
            </div>
            <div
              className={[
                'inline-flex h-24 w-24 items-center justify-center rounded-full border text-2xl font-black shadow-xl',
                isDark
                  ? 'border-amber-300/30 bg-black/15 text-amber-100 shadow-amber-500/10'
                  : 'border-white/70 bg-white/75 text-emerald-700 shadow-amber-200/60',
              ].join(' ')}
            >
              ¥{drawResult.amount.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div
          className={[
            'rounded-[28px] border p-5 sm:p-6',
            isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white',
          ].join(' ')}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={['text-xs font-semibold tracking-[0.16em]', isDark ? 'text-emerald-200/75' : 'text-emerald-700'].join(' ')}>
                {pickLocaleText(locale, '个人进度', 'YOUR PROGRESS')}
              </div>
              <h3 className={['mt-2 text-2xl font-bold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
                {pickLocaleText(locale, '龙舟蓄力条', 'Festival Progress')}
              </h3>
            </div>
            <div
              className={[
                'rounded-full px-3 py-1 text-xs font-semibold',
                canDraw
                  ? isDark
                    ? 'bg-emerald-500/20 text-emerald-100'
                    : 'bg-emerald-100 text-emerald-700'
                  : isDark
                    ? 'bg-slate-700 text-slate-300'
                    : 'bg-slate-100 text-slate-600',
              ].join(' ')}
            >
              {pickLocaleText(locale, '活动进行中', 'Live')}
            </div>
          </div>

          <div className="mt-6">
            <div className={['mb-2 flex items-end justify-between text-sm', isDark ? 'text-slate-300' : 'text-slate-600'].join(' ')}>
              <span>{pickLocaleText(locale, '累计进度', 'Progress')}</span>
              <span className={['text-xl font-bold', isDark ? 'text-emerald-100' : 'text-emerald-700'].join(' ')}>
                {Math.min(100, (totalAmount / minAmount) * 100).toFixed(0)}%
              </span>
            </div>
            <div className={['relative h-4 overflow-hidden rounded-full', isDark ? 'bg-slate-800' : 'bg-slate-100'].join(' ')}>
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#059669,#10b981,#f59e0b)]"
                style={{ width: `${Math.min(100, (totalAmount / minAmount) * 100)}%` }}
              />
              <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.35),transparent)] opacity-60" />
            </div>
            <div className={['mt-3 flex justify-between text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
              <span>¥0</span>
              <span>¥{minAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <MiniInfo
              isDark={isDark}
              label={pickLocaleText(locale, '统计周期', 'Window')}
              value={pickLocaleText(locale, '2026.06.01 - 2026.06.30', '2026.06.01 - 2026.06.30')}
            />
            <MiniInfo
              isDark={isDark}
              label={pickLocaleText(locale, '当前用户', 'User')}
              value={data?.user.username || data?.user.email || `#${data?.user.id ?? '-'}`}
            />
          </div>
        </div>

        <div
          className={[
            'overflow-hidden rounded-[28px] border',
            isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white',
          ].join(' ')}
        >
          <div className={['grid grid-cols-5 gap-4 border-b px-5 py-4 text-xs font-semibold tracking-[0.14em]', isDark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'].join(' ')}>
            <div>{pickLocaleText(locale, '订单号', 'ORDER')}</div>
            <div>{pickLocaleText(locale, '金额', 'AMOUNT')}</div>
            <div>{pickLocaleText(locale, '方式', 'CHANNEL')}</div>
            <div>{pickLocaleText(locale, '支付时间', 'PAID AT')}</div>
            <div>{pickLocaleText(locale, '状态', 'STATUS')}</div>
          </div>

          {loading && (
            <div className={['px-5 py-10 text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
              {pickLocaleText(locale, '正在整理 6 月充值航线...', 'Loading June recharge ledger...')}
            </div>
          )}

          {!loading && (data?.orders.length ?? 0) === 0 && (
            <div className={['px-5 py-10 text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
              {pickLocaleText(locale, '6 月暂无符合统计范围的已支付充值订单', 'No paid June recharge orders in range')}
            </div>
          )}

          {!loading &&
            data?.orders.map((order, index) => (
              <div
                key={order.id}
                className={[
                  'grid grid-cols-1 gap-3 border-b px-5 py-4 text-sm sm:grid-cols-5 sm:items-center',
                  isDark ? 'border-slate-800 text-slate-200' : 'border-slate-100 text-slate-700',
                  index % 2 === 0 ? '' : isDark ? 'bg-white/[0.02]' : 'bg-emerald-50/30',
                ].join(' ')}
              >
                <div className="font-mono text-xs">{order.id}</div>
                <div className="font-semibold">¥{order.amount.toFixed(2)}</div>
                <div>{getPaymentChannelLabel(order.paymentType, locale)}</div>
                <div>{order.paidAt ? formatCreatedAt(order.paidAt, locale) : '-'}</div>
                <div>
                  <span
                    className={[
                      'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                      isDark ? 'bg-emerald-500/15 text-emerald-100' : 'bg-emerald-100 text-emerald-700',
                    ].join(' ')}
                  >
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </PayPageLayout>
  );
}

function MetricCard({
  isDark,
  label,
  value,
  hint,
  accent,
}: {
  isDark: boolean;
  label: string;
  value: string;
  hint: string;
  accent: 'emerald' | 'amber' | 'cyan' | 'rose';
}) {
  const accentMap = {
    emerald: isDark ? 'from-emerald-400/22 to-emerald-500/5 text-emerald-50' : 'from-emerald-100 to-white text-emerald-900',
    amber: isDark ? 'from-amber-300/22 to-amber-500/5 text-amber-50' : 'from-amber-100 to-white text-amber-900',
    cyan: isDark ? 'from-cyan-300/22 to-cyan-500/5 text-cyan-50' : 'from-cyan-100 to-white text-cyan-900',
    rose: isDark ? 'from-rose-300/22 to-rose-500/5 text-rose-50' : 'from-rose-100 to-white text-rose-900',
  };

  return (
    <div
      className={[
        'rounded-[24px] border p-4',
        isDark ? 'border-white/10 bg-white/[0.04]' : 'border-white/80 bg-white/70 shadow-lg shadow-emerald-100/30',
      ].join(' ')}
    >
      <div className={['text-xs font-semibold tracking-[0.12em]', isDark ? 'text-slate-300' : 'text-slate-500'].join(' ')}>
        {label}
      </div>
      <div
        className={[
          'mt-3 rounded-2xl bg-gradient-to-br px-4 py-4 text-2xl font-black',
          accentMap[accent],
        ].join(' ')}
      >
        {value}
      </div>
      <div className={['mt-3 text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>{hint}</div>
    </div>
  );
}

function PrizeStrip({
  isDark,
  index,
  name,
  amount,
}: {
  isDark: boolean;
  index: number;
  name: string;
  amount: number;
}) {
  const medals = ['壹', '贰', '叁'];
  return (
    <div
      className={[
        'flex items-center justify-between rounded-[22px] border px-4 py-3',
        isDark ? 'border-white/10 bg-white/[0.04]' : 'border-white/80 bg-white/75',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <div
          className={[
            'flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-black',
            isDark ? 'bg-amber-400/15 text-amber-100' : 'bg-amber-100 text-amber-700',
          ].join(' ')}
        >
          {medals[index] || '奖'}
        </div>
        <div>
          <div className={['font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>{name}</div>
          <div className={['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
            {pickLocaleTextSafe(name, isDark)}
          </div>
        </div>
      </div>
      <div className={['text-xl font-black', isDark ? 'text-amber-100' : 'text-emerald-700'].join(' ')}>
        ¥{amount.toFixed(2)}
      </div>
    </div>
  );
}

function MiniInfo({ isDark, label, value }: { isDark: boolean; label: string; value: string }) {
  return (
    <div
      className={[
        'rounded-2xl border px-4 py-3',
        isDark ? 'border-slate-700 bg-slate-950/45' : 'border-slate-200 bg-slate-50/90',
      ].join(' ')}
    >
      <div className={['text-xs font-semibold tracking-[0.12em]', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
        {label}
      </div>
      <div className={['mt-2 text-sm font-semibold', isDark ? 'text-slate-100' : 'text-slate-800'].join(' ')}>
        {value}
      </div>
    </div>
  );
}

function pickLocaleTextSafe(name: string, isDark: boolean) {
  if (name.includes('一')) return isDark ? '河鼓星落，重彩金彩' : '稀有奖项';
  if (name.includes('二')) return isDark ? '粽叶藏金，节日厚礼' : '高阶奖励';
  return isDark ? '龙舟巡江，入场即享' : '基础奖励';
}

function Fallback() {
  return <div className="p-8 text-sm text-slate-500">Loading...</div>;
}

export default function DuanwuPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <DuanwuPageContent />
    </Suspense>
  );
}
