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
    packageUsagePerCard: number;
    balanceUsagePerCard: number;
    adminContact: string;
    voucherRedemptionDays: number;
  };
  stats: {
    active: boolean;
    earnedCards: number;
    usedCards: number;
    availableCards: number;
    hasActiveSubscription: boolean;
    monthlyPurchases: number;
    monthlyCards: number;
    packageUsageAmount: number;
    packageCards: number;
    balanceUsageAmount: number;
    balanceCards: number;
  };
  pool: { initial: number; awarded: number; remaining: number };
  drawRecords: DrawRecord[];
}

const WHEEL_PRIZES = [
  { key: 'balance_30', lines: ['$30', '额度'], icon: '$' },
  { key: 'balance_60', lines: ['$60', '额度'], icon: '$' },
  { key: 'balance_120', lines: ['$120', '额度'], icon: '$' },
  { key: 'balance_240', lines: ['$240', '额度'], icon: '$' },
  { key: 'redraw', lines: ['再摇', '一次'], icon: '↻' },
  { key: 'quota_reset', lines: ['免费重置', '额度'], icon: '▤' },
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
  if (record.prize.redraw) return '摇摇卡未扣除';
  if (record.issueStatus === 'ISSUED') return '已发放';
  if (record.issueStatus === 'MANUAL_PENDING') return '待兑换';
  if (record.issueStatus === 'MANUAL_REDEEMED') return '已兑换';
  if (record.issueStatus === 'ISSUE_FAILED') return '待补发';
  return '处理中';
}

function progressValue(current: number, threshold: number) {
  if (threshold <= 0) return 0;
  return Math.min(100, ((current % threshold) / threshold) * 100);
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
      const payload = await response.json();
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
    if (!data || spinning || data.stats.availableCards <= 0 || data.pool.remaining <= 0) return;
    setSpinning(true);
    setResult(null);
    setError('');
    try {
      const response = await fetch('/api/lottery/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, requestId: crypto.randomUUID() }),
      });
      const payload = await response.json();
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

  const packageRemainder = data ? data.stats.packageUsageAmount % data.activity.packageUsagePerCard : 0;
  const balanceRemainder = data ? data.stats.balanceUsageAmount % data.activity.balanceUsagePerCard : 0;
  const canDraw = Boolean(data?.stats.active && data.stats.availableCards > 0 && data.pool.remaining > 0 && !spinning);
  const drawLabel = !data?.stats.active
    ? '活动未开放'
    : data.pool.remaining <= 0
      ? '奖池已发完'
      : data.stats.availableCards > 0
        ? spinning
          ? '摇奖中'
          : '摇一摇'
        : '等待获得摇摇卡';

  const summaryItems = useMemo(
    () => [
      { value: data?.stats.availableCards ?? 0, label: '可用摇摇卡', tone: 'red' },
      { value: '$30+', label: '额度必得', tone: 'orange' },
      { value: data?.pool.remaining ?? 0, label: '奖池剩余', tone: 'green' },
    ],
    [data],
  );

  return (
    <main className={['shake-page', embedded ? 'shake-page--embedded' : ''].join(' ')}>
      {loading ? <div className="shake-notice">正在核对摇摇卡...</div> : null}
      {error ? (
        <div className="shake-notice shake-notice--error" role="alert">
          {error}
        </div>
      ) : null}

      {data ? (
        <div className="shake-layout">
          <section className="shake-stage" aria-labelledby="shake-title">
            <header className="shake-stage__header">
              <h1 id="shake-title">疯狂摇摇摇</h1>
              <p>每次转动必得额度，还有大奖等你摇</p>
            </header>

            <div className="shake-benefits" aria-label="获得摇摇卡的方式">
              <span>
                <b>购卡赠送</b>
                轻享 / 尊享月卡
              </span>
              <span>
                <b>消费赠卡</b>
                达标自动累计
              </span>
              <span>
                <b>重置福利</b>
                抽中联系兑换
              </span>
            </div>

            <div className="shake-wheel-zone">
              <div className="shake-pointer" aria-hidden="true" />
              <div className="shake-wheel-frame">
                <div className="shake-wheel" style={{ transform: `rotate(${rotation}deg)` }}>
                  {WHEEL_PRIZES.map((prize, index) => (
                    <span
                      className="shake-wheel__label"
                      key={prize.key}
                      style={{ transform: `rotate(${index * 60 + 30}deg) translateY(-39%)` }}
                    >
                      <b style={{ transform: `rotate(-${index * 60 + 30}deg)` }}>
                        <i>{prize.icon}</i>
                        {prize.lines.map((line) => (
                          <em key={line}>{line}</em>
                        ))}
                      </b>
                    </span>
                  ))}
                </div>
                <button className="shake-wheel__button" type="button" onClick={draw} disabled={!canDraw}>
                  <strong>{spinning ? '摇奖中' : '摇一摇'}</strong>
                  <small>还有 {data.stats.availableCards} 张</small>
                </button>
              </div>
            </div>

            <p className="shake-stage__caption">
              购买轻享 / 尊享月卡赠摇摇卡；非月卡套餐消费 ${data.activity.packageUsagePerCard}、余额消费 $
              {data.activity.balanceUsagePerCard} 各得一张。
            </p>
          </section>

          <aside className="shake-sidebar">
            <section className="shake-summary">
              {summaryItems.map((item) => (
                <div className={`shake-summary__item shake-summary__item--${item.tone}`} key={item.label}>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </section>

            <section className="shake-panel shake-progress-panel">
              <h2>距离下一张摇摇卡</h2>
              <div className="shake-progress-item">
                <div>
                  <b>轻享 / 尊享月卡</b>
                  <strong>{data.stats.monthlyCards} 张</strong>
                </div>
                <p>活动期已购买 {data.stats.monthlyPurchases} 次</p>
                <div className="shake-track">
                  <span style={{ width: data.stats.monthlyPurchases ? '100%' : '0%' }} />
                </div>
                <small>购买成功即得，不设累计上限</small>
              </div>
              <div className="shake-progress-item shake-progress-item--gold">
                <div>
                  <b>非月卡套餐消费</b>
                  <strong>
                    {formatMoney(packageRemainder)} / ${data.activity.packageUsagePerCard}
                  </strong>
                </div>
                <p>
                  累计 {formatMoney(data.stats.packageUsageAmount)}，已得 {data.stats.packageCards} 张
                </p>
                <div className="shake-track">
                  <span
                    style={{
                      width: `${progressValue(data.stats.packageUsageAmount, data.activity.packageUsagePerCard)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="shake-progress-item shake-progress-item--mint">
                <div>
                  <b>余额消费</b>
                  <strong>
                    {formatMoney(balanceRemainder)} / ${data.activity.balanceUsagePerCard}
                  </strong>
                </div>
                <p>
                  累计 {formatMoney(data.stats.balanceUsageAmount)}，已得 {data.stats.balanceCards} 张
                </p>
                <div className="shake-track">
                  <span
                    style={{
                      width: `${progressValue(data.stats.balanceUsageAmount, data.activity.balanceUsagePerCard)}%`,
                    }}
                  />
                </div>
              </div>
            </section>

            <section className="shake-panel shake-card-panel">
              <div className="shake-panel__heading">
                <h2>我的摇摇卡</h2>
                <span>累计获得 {data.stats.earnedCards} 张</span>
              </div>
              <button className="shake-primary" type="button" onClick={draw} disabled={!canDraw}>
                {drawLabel}
              </button>
            </section>

            <section className="shake-panel shake-pool-panel">
              <div className="shake-panel__heading">
                <h2>奖池进度</h2>
                <span>
                  {data.pool.remaining} / {data.pool.initial}
                </span>
              </div>
              <div className="shake-track shake-track--pool">
                <span style={{ width: `${(data.pool.remaining / Math.max(1, data.pool.initial)) * 100}%` }} />
              </div>
            </section>
          </aside>

          <section className="shake-history">
            <div className="shake-panel__heading">
              <h2>摇奖记录</h2>
              <span>共 {data.drawRecords.length} 条</span>
            </div>
            <div className="shake-history__table">
              <div className="shake-history__head">
                <span>时间</span>
                <span>奖品</span>
                <span>摇摇卡</span>
                <span>状态</span>
              </div>
              {data.drawRecords.length ? (
                [...data.drawRecords].reverse().map((record) => (
                  <article className="shake-history__row" key={record.id}>
                    <time>{formatDate(record.createdAt)}</time>
                    <strong>{record.prize.name}</strong>
                    <span>{record.prize.redraw ? '未扣除' : `第 ${record.drawIndex} 摇`}</span>
                    <span className={`shake-status shake-status--${record.issueStatus.toLowerCase()}`}>
                      {statusText(record)}
                    </span>
                  </article>
                ))
              ) : (
                <p className="shake-history__empty">暂无摇奖记录</p>
              )}
            </div>
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
            <span>本次摇中</span>
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
