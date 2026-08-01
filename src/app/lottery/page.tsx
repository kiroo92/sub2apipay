'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type IssueStatus = 'PENDING' | 'ISSUED' | 'ISSUE_FAILED' | 'MANUAL_PENDING' | 'MANUAL_REDEEMED';

interface DrawRecord {
  id: string;
  drawIndex: number;
  prize: { key: string; name: string; amount: number; manual: boolean };
  issueStatus: IssueStatus;
  createdAt: string;
}

interface LotteryData {
  user: { id: number; username: string; balance: number };
  activity: {
    name: string;
    startAt: string;
    endAt: string;
    thresholds: number[];
    maxDraws: number;
    adminContact: string;
    voucherRedemptionDays: number;
  };
  stats: {
    active: boolean;
    totalRechargeAmount: number;
    earnedDraws: number;
    usedDraws: number;
    availableDraws: number;
    hasActiveSubscription: boolean;
  };
  drawRecords: DrawRecord[];
}

const WHEEL_PRIZES = [
  { key: 'balance_2', label: '¥2', color: '#f7c948' },
  { key: 'balance_5', label: '¥5', color: '#ef5b3f' },
  { key: 'balance_10', label: '¥10', color: '#2a9d8f' },
  { key: 'balance_20', label: '¥20', color: '#f4a261' },
  { key: 'balance_50', label: '¥50', color: '#d62828' },
  { key: 'subscription_reset', label: '套餐重置', color: '#264653' },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusText(status: IssueStatus) {
  if (status === 'ISSUED') return '已到账';
  if (status === 'MANUAL_PENDING') return '待联系管理员';
  if (status === 'MANUAL_REDEEMED') return '已兑换';
  return '奖励处理中';
}

function LotteryContent() {
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

  const progress = useMemo(() => {
    if (!data) return 0;
    return Math.min(100, (data.stats.totalRechargeAmount / 200) * 100);
  }, [data]);

  const draw = async () => {
    if (!data || spinning || data.stats.availableDraws <= 0) return;
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
      if (!response.ok) throw new Error(payload.error || '抽奖请求处理失败');
      const prizeIndex = Math.max(
        0,
        WHEEL_PRIZES.findIndex((prize) => prize.key === payload.prize.key),
      );
      const target = 360 - (prizeIndex * 60 + 30);
      setRotation((current) => current + 5 * 360 + ((target - (current % 360) + 360) % 360));
      await new Promise((resolve) => window.setTimeout(resolve, 3800));
      setResult(payload);
      await loadData();
    } catch (drawError) {
      setError(drawError instanceof Error ? drawError.message : '抽奖请求处理失败');
    } finally {
      setSpinning(false);
    }
  };

  const nextThreshold = data?.activity.thresholds.find((threshold) => threshold > data.stats.totalRechargeAmount);
  const buttonText = !data?.stats.active
    ? '活动当前未开放'
    : data.stats.availableDraws > 0
      ? '立即抽奖'
      : data.stats.usedDraws >= 3
        ? '本期次数已用完'
        : `充值满 ¥${nextThreshold ?? 200} 解锁`;

  return (
    <main className={['lottery-shell', embedded ? 'lottery-shell--embedded' : ''].join(' ')}>
      <header className="lottery-topbar">
        <div>
          <span className="lottery-kicker">SUB2API REWARD STATION</span>
          <h1>充值幸运大转盘</h1>
        </div>
        {data && (
          <div className="lottery-deadline">
            活动截止
            <br />
            <strong>{formatDate(data.activity.endAt)}</strong>
          </div>
        )}
      </header>

      {loading ? <div className="lottery-message">正在核对充值与订阅信息...</div> : null}
      {error ? (
        <div className="lottery-alert" role="alert">
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          <section className="lottery-stage">
            <div className="wheel-zone" aria-label="幸运大转盘">
              <div className="wheel-pointer" />
              <div className="wheel-rim">
                <div className="wheel" style={{ transform: `rotate(${rotation}deg)` }}>
                  {WHEEL_PRIZES.map((prize, index) => (
                    <span
                      key={prize.key}
                      className="wheel-label"
                      style={{ transform: `rotate(${index * 60 + 30}deg) translateY(-39%)` }}
                    >
                      <b style={{ transform: `rotate(-${index * 60 + 30}deg)` }}>{prize.label}</b>
                    </span>
                  ))}
                </div>
                <button
                  className="wheel-button"
                  type="button"
                  onClick={draw}
                  disabled={spinning || data.stats.availableDraws <= 0 || !data.stats.active}
                >
                  {spinning ? '开奖中' : 'GO'}
                </button>
              </div>
            </div>

            <aside className="lottery-status">
              <div className="draw-count">
                <strong>{data.stats.availableDraws}</strong>
                <span>/ 3 次可用</span>
              </div>
              <p>
                活动期累计充值 <b>¥{data.stats.totalRechargeAmount.toFixed(2)}</b>
              </p>
              <div className="recharge-track">
                <span style={{ width: `${progress}%` }} />
              </div>
              <div className="thresholds">
                <span>¥20</span>
                <span>¥100</span>
                <span>¥200</span>
              </div>
              <button
                className="primary-draw"
                type="button"
                onClick={draw}
                disabled={spinning || data.stats.availableDraws <= 0 || !data.stats.active}
              >
                {buttonText}
              </button>
              <p className="subscription-note">
                {data.stats.hasActiveSubscription
                  ? '有效订阅用户可抽中套餐重置券'
                  : '当前无有效订阅，奖池不含套餐重置券'}
              </p>
            </aside>
          </section>

          {result ? (
            <section className="result-strip" aria-live="polite">
              <div>
                <span>本次结果</span>
                <strong>{result.prize.name}</strong>
              </div>
              <p>
                {result.issueStatus === 'ISSUED'
                  ? '奖励已发放到 Sub2API 余额'
                  : result.prize.manual
                    ? `请凭记录 ${result.id} 联系 ${data.activity.adminContact}`
                    : '奖励正在由管理员处理'}
              </p>
            </section>
          ) : null}

          <section className="draw-history">
            <div className="section-heading">
              <h2>我的中奖记录</h2>
              <span>{data.drawRecords.length} / 3</span>
            </div>
            {data.drawRecords.length ? (
              data.drawRecords.map((record) => (
                <article className="history-row" key={record.id}>
                  <span className="history-index">0{record.drawIndex}</span>
                  <div>
                    <strong>{record.prize.name}</strong>
                    <small>{formatDate(record.createdAt)}</small>
                  </div>
                  <span className={`issue-pill issue-pill--${record.issueStatus.toLowerCase()}`}>
                    {statusText(record.issueStatus)}
                  </span>
                </article>
              ))
            ) : (
              <p className="empty-history">首笔充值满 ¥20，即可点亮第一条中奖记录。</p>
            )}
          </section>

          <details className="lottery-rules">
            <summary>活动规则</summary>
            <p>活动期累计充值满 ¥20、¥100、¥200，分别解锁第 1、2、3 次抽奖。每人最多三次。</p>
            <p>仅统计已完成且未退款的余额充值订单。退款订单不计入资格。</p>
            <p>
              套餐重置券仅向拥有有效订阅的用户开放，中奖后 {data.activity.voucherRedemptionDays} 天内联系管理员兑换。
            </p>
          </details>
        </>
      ) : null}
    </main>
  );
}

export default function LotteryPage() {
  return (
    <Suspense fallback={<div className="lottery-message">加载活动...</div>}>
      <LotteryContent />
    </Suspense>
  );
}
