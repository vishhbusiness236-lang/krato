'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LandingPage from '@/app/components/LandingPage';

export default function LandingGate() {
  const router = useRouter();
  const [showLanding, setShowLanding] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const seenLanding = window.localStorage.getItem('krato_seen_landing');

    if (seenLanding === 'true') {
      router.replace('/login');
      return;
    }

    setShowLanding(true);
  }, [router]);

  if (!showLanding) {
    return null;
  }

  return <LandingPage />;
}
