'use client';

import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider } from './auth-provider';
import { BoardProvider } from './board-provider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <BoardProvider>
        {children}
        <Toaster richColors position="top-right" closeButton />
      </BoardProvider>
    </AuthProvider>
  );
}
