import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AppProviders } from '@/components/providers/app-providers';
import { Navbar } from '@/components/layout/navbar';

export const metadata: Metadata = {
  title: 'Controle de Frotas · Polivias Transportes',
  description: 'Programação e controle das frotas Polivias no Mercosul',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen font-sans">
        <AppProviders>
          <Navbar />
          <main className="mx-auto max-w-[1800px] px-4 py-6">{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
