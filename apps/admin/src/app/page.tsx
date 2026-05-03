'use client';

import { useRequireAuth } from '../hooks/useRequireAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function HomePage() {
  const { loading } = useRequireAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.push('/dashboard');
    }
  }, [loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return null;
}
