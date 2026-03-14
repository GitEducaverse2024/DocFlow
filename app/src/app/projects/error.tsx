"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProjectsErrorRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catbrains');
  }, [router]);
  return null;
}
