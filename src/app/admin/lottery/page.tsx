'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const ADMIN_SESSION_KEY = 'sub2apipay.admin-token';

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
  summary: { totalDraws: number; issuedAmount: number; grandPrizeUsers: number };
  prizeStats: Array<{
    prizeKey: string;
    count: number;
    totalAmount: number;
    initialStock: number | null;
    remainingStock: number | null;
  }>;
  issueStats: Array<{ issueStatus: string; count: number }>;
  records: AdminRecord[];
  total: number;
  page: number;
  total_pages: number;
}

const PRIZE_NAMES: Record<string, string> = {
  balance_30: '$30 额度',
  balance_60: '$60 额度',
  balance_120: '$120 额度',
  balance_240: '$240 额度',
  redraw: '再摇一次',
  quota_reset: '订阅重置卡',
  balance_2: '$2 额度',
  balance_5: '$5 额度',
  balance_10: '$10 额度',
  balance_20: '$20 额度',
  balance_50: '$50 额度',
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
  const urlToken = searchParams.get('token') || '';
  const [token, setToken] = useState(urlToken);
  const [tokenInput, setTokenInput] = useState(urlToken);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    const stored = window.sessionStorage.getItem(ADMIN_SESSION_KEY) || '';
    const selected = urlToken || stored;
    setToken(selected);
    setTokenInput(selected);
    if (urlToken) {
      window.sessionStorage.setItem(ADMIN_SESSION_KEY, urlToken);
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('token');
      window.history.replaceState({}, '', cleanUrl);
    }
    setReady(true);
  }, [urlToken]);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    const params = new URLSearchParams({ page: String(page), page_size: '20' });
    if (status) params.set('issueStatus', status);
    try {
      const response = await fetch(`/api/admin/lottery?${params}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (response.status === 401) {
        window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
        setToken('');
      }
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
      const response = await fetch('/api/admin/lottery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

  const login = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextToken = tokenInput.trim();
    if (!nextToken) {
      setError('请输入管理员口令');
      return;
    }
    window.sessionStorage.setItem(ADMIN_SESSION_KEY, nextToken);
    setError('');
    setToken(nextToken);
  };

  const logout = () => {
    window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setToken('');
    setTokenInput('');
    setData(null);
    setError('');
  };

  if (!ready) return <main className="admin-lottery">加载管理入口...</main>;

  if (!token) {
    return (
      <main className="admin-login">
        <form className="admin-login__panel" onSubmit={login}>
          <span>ACTIVITY OPS</span>
          <h1>管理员登录</h1>
          <p>输入活动后台口令</p>
          {error ? <div className="admin-error">{error}</div> : null}
          <label htmlFor="admin-token">管理员口令</label>
          <input
            id="admin-token"
            type="password"
            autoComplete="current-password"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            autoFocus
          />
          <button type="submit">进入控制台</button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-lottery">
      <header className="admin-lottery__header">
        <div>
          <span>ACTIVITY OPS</span>
          <h1>大转盘控制台</h1>
        </div>
        <div className="admin-lottery__actions">
          <button type="button" onClick={() => void load()}>
            刷新数据
          </button>
          <button type="button" onClick={logout}>
            退出
          </button>
        </div>
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
              <strong>${data.summary.issuedAmount.toFixed(2)}</strong>
            </div>
            <div>
              <span>大奖用户</span>
              <strong>{data.summary.grandPrizeUsers}</strong>
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
                  已发 {item.count} / {item.remainingStock === null ? '不限量' : `剩余 ${item.remainingStock}`}
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
                  <small>${record.prizeAmount.toFixed(2)}</small>
                </div>
                <span>{record.prizeReason === 'HIGH_RECHARGE_GUARANTEE' ? '历史保底' : '库存奖池'}</span>
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
