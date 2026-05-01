'use client';

import { useRequireAuth } from '../hooks/useRequireAuth';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const { loading } = useRequireAuth();
  const router = useRouter();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  // Redirect to dashboard after auth check
  router.push('/dashboard');
  return null;
}
