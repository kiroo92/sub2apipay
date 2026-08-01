'use client';

import { Suspense } from 'react';
import LotteryExperience from '@/components/LotteryExperience';

export default function LotteryPage() {
  return (
    <Suspense fallback={<div className="lottery-message">加载活动...</div>}>
      <LotteryExperience />
    </Suspense>
  );
}
