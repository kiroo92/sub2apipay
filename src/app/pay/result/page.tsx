'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

function ResultContent() {
  const searchParams = useSearchParams();
  // Support both ZPAY (out_trade_no) and Stripe (order_id) callback params
  const outTradeNo = searchParams.get('out_trade_no') || searchParams.get('order_id');
  const tradeStatus = searchParams.get('trade_status') || searchParams.get('status');
  const isPopup = searchParams.get('popup') === '1';
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const isDark = theme === 'dark';

  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInPopup, setIsInPopup] = useState(false);

  // Detect if opened as a popup window (from stripe-popup or via popup=1 param)
  useEffect(() => {
    if (isPopup || window.opener) {
      setIsInPopup(true);
    }
  }, [isPopup]);

  useEffect(() => {
    if (!outTradeNo) {
      setLoading(false);
      return;
    }

    const checkOrder = async () => {
      try {
        const res = await fetch(`/api/orders/${outTradeNo}`);
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    checkOrder();
    // Poll a few times in case status hasn't updated yet
    const timer = setInterval(checkOrder, 3000);
    const timeout = setTimeout(() => clearInterval(timer), 30000);
    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [outTradeNo]);

  // Auto-close popup window on success
  const isSuccess = status === 'COMPLETED' || status === 'PAID' || status === 'RECHARGING';

  useEffect(() => {
    if (!isInPopup || !isSuccess) return;
    const timer = setTimeout(() => {
      window.close();
    }, 3000);
    return () => clearTimeout(timer);
  }, [isInPopup, isSuccess]);

  if (loading) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className={isDark ? 'text-slate-400' : 'text-gray-500'}>查询支付结果中...</div>
      </div>
    );
  }

  const isPending = status === 'PENDING';

  return (
    <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <div
        className={[
          'w-full max-w-md rounded-xl p-8 text-center shadow-lg',
          isDark ? 'bg-slate-900 text-slate-100' : 'bg-white',
        ].join(' ')}
      >
        {isSuccess ? (
          <>
            <div className="text-6xl text-green-500">✓</div>
            <h1 className="mt-4 text-xl font-bold text-green-600">
              {status === 'COMPLETED' ? '充值成功' : '充值处理中'}
            </h1>
            <p className={isDark ? 'mt-2 text-slate-400' : 'mt-2 text-gray-500'}>
              {status === 'COMPLETED' ? '余额已成功到账！' : '支付成功，余额正在充值中...'}
            </p>
            {isInPopup && (
              <div className="mt-4 space-y-2">
                <p className={isDark ? 'text-sm text-slate-500' : 'text-sm text-gray-400'}>
                  此窗口将在 3 秒后自动关闭
                </p>
                <button
                  type="button"
                  onClick={() => window.close()}
                  className="text-sm text-blue-600 underline hover:text-blue-700"
                >
                  立即关闭窗口
                </button>
              </div>
            )}
          </>
        ) : isPending ? (
          <>
            <div className="text-6xl text-yellow-500">⏳</div>
            <h1 className="mt-4 text-xl font-bold text-yellow-600">等待支付</h1>
            <p className={isDark ? 'mt-2 text-slate-400' : 'mt-2 text-gray-500'}>订单尚未完成支付</p>
            {isInPopup && (
              <button
                type="button"
                onClick={() => window.close()}
                className="mt-4 text-sm text-blue-600 underline hover:text-blue-700"
              >
                关闭窗口
              </button>
            )}
          </>
        ) : (
          <>
            <div className="text-6xl text-red-500">✗</div>
            <h1 className="mt-4 text-xl font-bold text-red-600">
              {status === 'EXPIRED' ? '订单已超时' : status === 'CANCELLED' ? '订单已取消' : '支付异常'}
            </h1>
            <p className={isDark ? 'mt-2 text-slate-400' : 'mt-2 text-gray-500'}>
              {status === 'EXPIRED'
                ? '订单已超时，请重新充值'
                : status === 'CANCELLED'
                  ? '订单已被取消'
                  : '请联系管理员处理'}
            </p>
            {isInPopup && (
              <button
                type="button"
                onClick={() => window.close()}
                className="mt-4 text-sm text-blue-600 underline hover:text-blue-700"
              >
                关闭窗口
              </button>
            )}
          </>
        )}

        <p className={isDark ? 'mt-4 text-xs text-slate-500' : 'mt-4 text-xs text-gray-400'}>
          订单号: {outTradeNo || '未知'}
        </p>
      </div>
    </div>
  );
}

export default function PayResultPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="text-gray-500">加载中...</div>
        </div>
      }
    >
      <ResultContent />
    </Suspense>
  );
}
