'use client';

import { useState, useEffect } from 'react';

interface RefundDialogProps {
  orderId: string;
  amount: number;
  onConfirm: (reason: string, force: boolean) => Promise<void>;
  onCancel: () => void;
  warning?: string;
  requireForce?: boolean;
  dark?: boolean;
}

export default function RefundDialog({
  orderId,
  amount,
  onConfirm,
  onCancel,
  warning,
  requireForce,
  dark = false,
}: RefundDialogProps) {
  const [reason, setReason] = useState('');
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(reason, force);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className={[
          'w-full max-w-md rounded-xl p-6 shadow-xl',
          dark ? 'bg-slate-900' : 'bg-white',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={['text-lg font-bold', dark ? 'text-slate-100' : 'text-gray-900'].join(' ')}>确认退款</h3>

        <div className="mt-4 space-y-3">
          <div className={['rounded-lg p-3', dark ? 'bg-slate-800' : 'bg-gray-50'].join(' ')}>
            <div className={['text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>订单号</div>
            <div className="text-sm font-mono">{orderId}</div>
          </div>

          <div className={['rounded-lg p-3', dark ? 'bg-slate-800' : 'bg-gray-50'].join(' ')}>
            <div className={['text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>退款金额</div>
            <div className="text-lg font-bold text-red-600">¥{amount.toFixed(2)}</div>
          </div>

          {warning && (
            <div
              className={[
                'rounded-lg p-3 text-sm',
                dark ? 'bg-yellow-900/30 text-yellow-300' : 'bg-yellow-50 text-yellow-700',
              ].join(' ')}
            >
              {warning}
            </div>
          )}

          <div>
            <label className={['mb-1 block text-sm font-medium', dark ? 'text-slate-300' : 'text-gray-700'].join(' ')}>
              退款原因
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="请输入退款原因（可选）"
              className={[
                'w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none',
                dark ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-gray-300 bg-white text-gray-900',
              ].join(' ')}
            />
          </div>

          {requireForce && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className={['rounded', dark ? 'border-slate-600' : 'border-gray-300'].join(' ')}
              />
              <span className="text-red-600">强制退款（余额可能扣为负数）</span>
            </label>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            className={[
              'flex-1 rounded-lg border py-2 text-sm',
              dark
                ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || (requireForce && !force)}
            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {loading ? '处理中...' : '确认退款'}
          </button>
        </div>
      </div>
    </div>
  );
}
