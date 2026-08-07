'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type IssueStatus = 'PENDING' | 'ISSUED' | 'ISSUE_FAILED' | 'MANUAL_PENDING' | 'MANUAL_REDEEMED';

interface DrawRecord {
  id: string;
  drawIndex: number;
  prize: {
    key: string;
    name: string;
    amount: number;
    manual: boolean;
    redraw: boolean;
    grand: boolean;
  };
  issueStatus: IssueStatus;
  createdAt: string;
}

interface LotteryData {
  user: { id: number; username: string; balance: number };
  activity: {
    name: string;
    startAt: string;
    endAt: string;
    firstCardRecharge: number;
    additionalCardRecharge: number;
    adminContact: string;
    voucherRedemptionDays: number;
  };
  stats: {
    active: boolean;
    totalRechargeAmount: number;
    earnedCards: number;
    usedCards: number;
    availableCards: number;
    hasActiveSubscription: boolean;
  };
  drawRecords: DrawRecord[];
}

const WHEEL_PRIZES = [
  { key: 'balance_2', amount: '$2', detail: '额度', className: 'coral' },
  { key: 'balance_5', amount: '$5', detail: '额度', className: 'cream' },
  { key: 'balance_10', amount: '$10', detail: '额度', className: 'mint' },
  { key: 'balance_20', amount: '$20', detail: '额度', className: 'yellow' },
  { key: 'balance_50', amount: '$50', detail: '大奖', className: 'blue' },
  { key: 'quota_reset', amount: '订阅重置卡', detail: '联系管理员', className: 'rose' },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function statusText(record: DrawRecord) {
  if (record.prize.redraw) return '摇摇卡已返还';
  if (record.issueStatus === 'ISSUED') return '已到账';
  if (record.issueStatus === 'MANUAL_PENDING') return '待兑换';
  if (record.issueStatus === 'MANUAL_REDEEMED') return '已兑换';
  if (record.issueStatus === 'ISSUE_FAILED') return '待补发';
  return '处理中';
}

async function readApiPayload<T>(response: Response, fallbackError: string): Promise<T & { error?: string }> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const body = await response.text();
  if (!contentType.includes('json')) {
    throw new Error(fallbackError);
  }
  try {
    return JSON.parse(body) as T & { error?: string };
  } catch {
    throw new Error(fallbackError);
  }
}

export default function LotteryExperience() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const embedded = searchParams.get('ui_mode') === 'embedded';
  const [data, setData] = useState<LotteryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<DrawRecord | null>(null);

  const loadData = useCallback(async () => {
    if (!token) {
      setError('请从 Sub2API 主站进入活动');
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/lottery?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      const payload = await readApiPayload<LotteryData>(response, '活动数据刷新失败');
      if (!response.ok) throw new Error(payload.error || '活动数据刷新失败');
      setData(payload);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '活动数据刷新失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const draw = async () => {
    if (!data || spinning || data.stats.availableCards <= 0) return;
    setSpinning(true);
    setResult(null);
    setError('');
    try {
      const response = await fetch('/api/lottery/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, requestId: crypto.randomUUID() }),
      });
      const payload = await readApiPayload<DrawRecord>(response, '摇奖请求处理失败');
      if (!response.ok) throw new Error(payload.error || '摇奖请求处理失败');
      const prizeIndex = Math.max(
        0,
        WHEEL_PRIZES.findIndex((prize) => prize.key === payload.prize.key),
      );
      const target = 360 - (prizeIndex * 60 + 30);
      setRotation((current) => current + 6 * 360 + ((target - (current % 360) + 360) % 360));
      await new Promise((resolve) => window.setTimeout(resolve, 3600));
      setResult(payload);
      await loadData();
    } catch (drawError) {
      setError(drawError instanceof Error ? drawError.message : '摇奖请求处理失败');
    } finally {
      setSpinning(false);
    }
  };

  const rechargeProgress = data
    ? (() => {
        const { firstCardRecharge, additionalCardRecharge } = data.activity;
        const previousThreshold =
          data.stats.earnedCards === 0 ? 0 : firstCardRecharge + (data.stats.earnedCards - 1) * additionalCardRecharge;
        const nextThreshold =
          data.stats.earnedCards === 0 ? firstCardRecharge : previousThreshold + additionalCardRecharge;
        return Math.min(
          100,
          Math.max(
            0,
            ((data.stats.totalRechargeAmount - previousThreshold) / (nextThreshold - previousThreshold)) * 100,
          ),
        );
      })()
    : 0;
  const nextThreshold = data
    ? data.stats.earnedCards === 0
      ? data.activity.firstCardRecharge
      : data.activity.firstCardRecharge + data.stats.earnedCards * data.activity.additionalCardRecharge
    : null;
  const rechargeNeeded =
    data && nextThreshold !== null ? Math.max(0, nextThreshold - data.stats.totalRechargeAmount) : 0;
  const canDraw = Boolean(data?.stats.active && data.stats.availableCards > 0 && !spinning);
  const drawLabel = !data?.stats.active
    ? '活动未开放'
    : data.stats.availableCards > 0
      ? spinning
        ? '正在开奖'
        : '立即摇奖'
      : nextThreshold
        ? `再充值 ${formatMoney(rechargeNeeded)} 得 1 张`
        : '摇摇卡已用完';

  const latestRecords = useMemo(() => [...(data?.drawRecords ?? [])].reverse(), [data?.drawRecords]);

  return (
    <main className={['shake-page', embedded ? 'shake-page--embedded' : ''].join(' ')}>
      {loading ? <div className="shake-notice">正在核对活动资格...</div> : null}
      {error ? (
        <div className="shake-notice shake-notice--error" role="alert">
          {error}
        </div>
      ) : null}

      {data ? (
        <div className="shake-shell">
          <header className="shake-topbar">
            <div className="shake-brand">
              <span className="shake-brand__mark">S</span>
              <div>
                <b>SUB2API</b>
                <span>八月充值回馈</span>
              </div>
            </div>
            <div className="shake-topbar__title">
              <span>SHAKE &amp; WIN</span>
              <h1>充值幸运大转盘</h1>
            </div>
            <div className="shake-user">
              <span>{data.user.username}</span>
              <b>账户余额 {formatMoney(data.user.balance)}</b>
            </div>
          </header>

          <div className="shake-layout">
            <section className="shake-stage" aria-labelledby="shake-title">
              <div className="shake-stage__heading">
                <div>
                  <span>每摇必中</span>
                  <h2 id="shake-title">大奖正在池中</h2>
                </div>
                <p>最高 $50 额度，订阅用户可抽重置卡</p>
              </div>

              <div className="shake-wheel-zone">
                <div className="shake-pointer" aria-hidden="true">
                  <span />
                </div>
                <div className="shake-wheel-frame">
                  <div className="shake-wheel" style={{ transform: `rotate(${rotation}deg)` }}>
                    {WHEEL_PRIZES.map((prize, index) => {
                      const angle = index * 60 + 30;
                      return (
                        <span
                          className={`shake-wheel__label shake-wheel__label--${prize.className}`}
                          key={prize.key}
                          style={{ transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-36%)` }}
                        >
                          <b style={{ transform: `rotate(-${angle}deg)` }}>
                            <strong>{prize.amount}</strong>
                            <small>{prize.detail}</small>
                          </b>
                        </span>
                      );
                    })}
                  </div>
                  <button className="shake-wheel__button" type="button" onClick={draw} disabled={!canDraw}>
                    <strong>{spinning ? '开奖中' : '摇一摇'}</strong>
                    <small>{data.stats.availableCards} 张可用</small>
                  </button>
                </div>
              </div>

              <div className="shake-stage__foot">
                <span>100% 中奖</span>
                <p>$2 额度起步，中奖结果由服务端实时锁定</p>
              </div>
            </section>

            <aside className="shake-console">
              <section className="shake-card-balance">
                <div>
                  <span>我的摇摇卡</span>
                  <strong>{data.stats.availableCards}</strong>
                  <small>
                    累计获得 {data.stats.earnedCards} 张 · 已抽 {data.stats.usedCards} 次
                  </small>
                </div>
                <button type="button" onClick={draw} disabled={!canDraw}>
                  {drawLabel}
                </button>
              </section>

              <section className="shake-recharge">
                <div className="shake-section-heading">
                  <div>
                    <span>RECHARGE PROGRESS</span>
                    <h2>活动累计充值</h2>
                  </div>
                  <strong>{formatMoney(data.stats.totalRechargeAmount)}</strong>
                </div>

                <div className="shake-recharge__rail" aria-label={`充值进度 ${rechargeProgress.toFixed(0)}%`}>
                  <span style={{ width: `${rechargeProgress}%` }} />
                </div>

                <div className="shake-tiers">
                  <div className={data.stats.earnedCards > 0 ? 'is-unlocked' : ''}>
                    <span>{data.stats.earnedCards > 0 ? '首张已获得' : '首张条件'}</span>
                    <strong>满 ${data.activity.firstCardRecharge}</strong>
                    <small>获得 1 张</small>
                  </div>
                  <div className={data.stats.earnedCards > 1 ? 'is-unlocked' : ''}>
                    <span>之后</span>
                    <strong>每增加 $100</strong>
                    <small>再获得 1 张</small>
                  </div>
                </div>

                <p className="shake-recharge__hint">
                  {nextThreshold ? `距离下一张还差 ${formatMoney(rechargeNeeded)}` : '已获得当前充值对应的全部摇摇卡'}
                </p>
              </section>

              <section className="shake-rules">
                <h2>活动说明</h2>
                <ol>
                  <li>
                    仅统计从 <strong>8 月 7 日开始</strong>的有效充值订单（已完成且未退款）。
                  </li>
                  <li>累计充值达到 $20 获得首张，之后每累计增加 $100 再获得 1 张。</li>
                  <li>订阅重置卡仅对当前有效订阅用户开放，中奖后联系管理员兑换。</li>
                </ol>
              </section>
            </aside>
          </div>

          <section className="shake-history">
            <div className="shake-section-heading">
              <div>
                <span>MY REWARDS</span>
                <h2>中奖记录</h2>
              </div>
              <strong>{latestRecords.length} 条</strong>
            </div>
            {latestRecords.length ? (
              <div className="shake-history__table">
                <div className="shake-history__head">
                  <span>时间</span>
                  <span>奖品</span>
                  <span>摇奖序号</span>
                  <span>状态</span>
                </div>
                {latestRecords.map((record) => (
                  <article className="shake-history__row" key={record.id}>
                    <time>{formatDate(record.createdAt)}</time>
                    <strong>{record.prize.name}</strong>
                    <span>{record.prize.redraw ? '本次未扣卡' : `第 ${record.drawIndex} 摇`}</span>
                    <span className={`shake-status shake-status--${record.issueStatus.toLowerCase()}`}>
                      {statusText(record)}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="shake-history__empty">你的第一份奖励还在转盘里</div>
            )}
          </section>
        </div>
      ) : null}

      {result ? (
        <div className="shake-result" role="dialog" aria-modal="true" aria-labelledby="shake-result-title">
          <button
            className="shake-result__backdrop"
            type="button"
            onClick={() => setResult(null)}
            aria-label="关闭中奖结果"
          />
          <section className="shake-result__content">
            <span>CONGRATULATIONS</span>
            <h2 id="shake-result-title">{result.prize.name}</h2>
            <p>
              {result.prize.redraw
                ? '本次不扣摇摇卡，可以继续摇。'
                : result.prize.manual
                  ? `请凭记录 ${result.id.slice(-8)} 联系 ${data?.activity.adminContact}`
                  : result.issueStatus === 'ISSUED'
                    ? '额度已经发放到账户。'
                    : '奖励正在处理。'}
            </p>
            <button type="button" onClick={() => setResult(null)}>
              收下奖励
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
