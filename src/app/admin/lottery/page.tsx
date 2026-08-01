'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface AdminRecord {
  id: string;
  userId: number;
  drawIndex: number;
  prizeKey: string;
  prizeAmount: number;
  prizeReason: string;
  issueStatus: string;
  createdAt: string;
}
interface AdminData {
  summary: { totalDraws: number; issuedAmount: number; guaranteeCount: number };
  prizeStats: Array<{ prizeKey: string; count: number; totalAmount: number }>;
  issueStats: Array<{ issueStatus: string; count: number }>;
  records: AdminRecord[];
  total: number;
  page: number;
  total_pages: number;
}

const PRIZE_NAMES: Record<string, string> = {
  balance_2: '¥2 余额',
  balance_5: '¥5 余额',
  balance_10: '¥10 余额',
  balance_20: '¥20 余额',
  balance_50: '¥50 余额',
  subscription_reset: '套餐重置券',
};
const STATUS_NAMES: Record<string, string> = {
  PENDING: '待发放',
  ISSUED: '已到账',
  ISSUE_FAILED: '发放失败',
  MANUAL_PENDING: '待人工兑换',
  MANUAL_REDEEMED: '已兑换',
};

function AdminLotteryContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [data, setData] = useState<AdminData | null>(null);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    if (!token) {
      setError('缺少管理员 token');
      return;
    }
    const params = new URLSearchParams({ token, page: String(page), page_size: '20' });
    if (status) params.set('issueStatus', status);
    try {
      const response = await fetch(`/api/admin/lottery?${params}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '管理数据加载失败');
      setData(payload);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '管理数据加载失败');
    }
  }, [page, status, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (record: AdminRecord, action: 'retry_issue' | 'mark_redeemed') => {
    let note = '';
    if (action === 'mark_redeemed') {
      note = window.prompt('填写套餐重置处理备注')?.trim() || '';
      if (!note) return;
    }
    setBusyId(record.id);
    try {
      const response = await fetch(`/api/admin/lottery?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, drawId: record.id, note }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '操作失败');
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '操作失败');
    } finally {
      setBusyId('');
    }
  };

  return (
    <main className="admin-lottery">
      <header className="admin-lottery__header">
        <div>
          <span>ACTIVITY OPS</span>
          <h1>大转盘控制台</h1>
        </div>
        <button type="button" onClick={() => void load()}>
          刷新数据
        </button>
      </header>
      {error ? <div className="admin-error">{error}</div> : null}
      {data ? (
        <>
          <section className="admin-metrics">
            <div>
              <span>总抽奖</span>
              <strong>{data.summary.totalDraws}</strong>
            </div>
            <div>
              <span>已发余额</span>
              <strong>¥{data.summary.issuedAmount.toFixed(2)}</strong>
            </div>
            <div>
              <span>¥50 保底</span>
              <strong>{data.summary.guaranteeCount}</strong>
            </div>
            <div>
              <span>人工待处理</span>
              <strong>{data.issueStats.find((item) => item.issueStatus === 'MANUAL_PENDING')?.count ?? 0}</strong>
            </div>
          </section>
          <section className="admin-prizes">
            {data.prizeStats.map((item) => (
              <div key={item.prizeKey}>
                <b>{PRIZE_NAMES[item.prizeKey] ?? item.prizeKey}</b>
                <span>
                  {item.count} 次 / ¥{item.totalAmount.toFixed(2)}
                </span>
              </div>
            ))}
          </section>
          <div className="admin-toolbar">
            <label>
              发放状态{' '}
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">全部</option>
                {Object.entries(STATUS_NAMES).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <span>共 {data.total} 条记录</span>
          </div>
          <section className="admin-table" aria-label="抽奖记录">
            <div className="admin-table__head">
              <span>用户 / 次数</span>
              <span>奖品</span>
              <span>原因</span>
              <span>状态</span>
              <span>时间</span>
              <span>操作</span>
            </div>
            {data.records.map((record) => (
              <article className="admin-table__row" key={record.id}>
                <div>
                  <strong>UID {record.userId}</strong>
                  <small>
                    第 {record.drawIndex} 次 · {record.id.slice(-8)}
                  </small>
                </div>
                <div>
                  <strong>{PRIZE_NAMES[record.prizeKey] ?? record.prizeKey}</strong>
                  <small>¥{record.prizeAmount.toFixed(2)}</small>
                </div>
                <span>{record.prizeReason === 'HIGH_RECHARGE_GUARANTEE' ? '高充值保底' : '随机奖池'}</span>
                <span className={`admin-status admin-status--${record.issueStatus.toLowerCase()}`}>
                  {STATUS_NAMES[record.issueStatus] ?? record.issueStatus}
                </span>
                <time>{new Date(record.createdAt).toLocaleString('zh-CN')}</time>
                <div className="admin-actions">
                  {['ISSUE_FAILED', 'PENDING'].includes(record.issueStatus) ? (
                    <button disabled={busyId === record.id} onClick={() => void runAction(record, 'retry_issue')}>
                      重试发放
                    </button>
                  ) : null}
                  {record.issueStatus === 'MANUAL_PENDING' ? (
                    <button disabled={busyId === record.id} onClick={() => void runAction(record, 'mark_redeemed')}>
                      标记已兑换
                    </button>
                  ) : null}
                  {!['ISSUE_FAILED', 'PENDING', 'MANUAL_PENDING'].includes(record.issueStatus) ? <span>-</span> : null}
                </div>
              </article>
            ))}
            {!data.records.length ? <div className="admin-empty">暂无符合条件的记录</div> : null}
          </section>
          <nav className="admin-pagination">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
              上一页
            </button>
            <span>
              {page} / {Math.max(1, data.total_pages)}
            </span>
            <button disabled={page >= data.total_pages} onClick={() => setPage((value) => value + 1)}>
              下一页
            </button>
          </nav>
        </>
      ) : null}
    </main>
  );
}

export default function AdminLotteryPage() {
  return (
    <Suspense fallback={<div className="admin-lottery">加载管理数据...</div>}>
      <AdminLotteryContent />
    </Suspense>
  );
}
