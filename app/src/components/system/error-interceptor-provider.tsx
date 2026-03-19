"use client";

import { useErrorInterceptor } from '@/hooks/use-error-interceptor';

export function ErrorInterceptorProvider() {
  useErrorInterceptor();
  return null;
}
