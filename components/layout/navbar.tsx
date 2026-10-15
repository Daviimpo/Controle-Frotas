'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Columns3, Eye, FileUp, LayoutDashboard, LogIn, LogOut, RefreshCw, Truck } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useBoard } from '@/components/providers/board-provider';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/quadro', label: 'Quadro de Frotas', icon: Columns3 },
  { href: '/importar-pdf', label: 'Importar PDF', icon: FileUp },
  { href: '/cadastro', label: 'Cadastro Frotas', icon: Truck },
];

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Polivias Transportes">
      {/* Substitua por <Image src="/logo-polivias.svg" …/> quando tiver o arquivo oficial */}
      <div className="grid h-9 w-9 place-items-center rounded-md bg-navy shadow-sm">
        <Truck className="h-5 w-5 text-white" strokeWidth={2.25} />
      </div>
      <div className="leading-none">
        <div className="text-[17px] font-extrabold tracking-tight text-navy">POLIVIAS</div>
        <div className="mt-0.5 text-[9.5px] font-bold tracking-[0.28em] text-slate-500">TRANSPORTES</div>
      </div>
    </Link>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { session, isEditor, openLogin, logout, loading } = useAuth();
  const { saving, error } = useBoard();

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="h-1 bg-navy" />
      <div className="mx-auto flex h-16 max-w-[1800px] items-center gap-5 px-4">
        <Logo />
        <div className="hidden h-8 w-px bg-slate-200 md:block" />
        <div className="hidden text-sm font-semibold text-slate-700 md:block">Controle de Frotas</div>

        <nav className="ml-2 hidden h-16 items-stretch lg:flex">
          {TABS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 border-b-2 px-3.5 text-sm font-medium transition-colors',
                isActive(href) ? 'border-navy text-navy' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {saving && (
            <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Salvando…
            </span>
          )}
          {error && !saving && <span className="hidden text-xs font-medium text-red-600 sm:block">Offline</span>}

          {loading ? null : isEditor && session ? (
            <div className="flex items-center gap-2.5">
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-sm font-semibold text-slate-800">{session.user}</div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-600">
                  {session.role === 'admin' ? 'Administrador' : 'Operador'} · edição
                </div>
              </div>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-bold uppercase text-white">
                {session.user.slice(0, 2)}
              </div>
              <Button variant="ghost" size="icon" onClick={logout} title="Sair">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 sm:inline-flex">
                <Eye className="h-3.5 w-3.5" /> Modo leitura
              </span>
              <Button size="sm" onClick={openLogin}>
                <LogIn className="h-4 w-4" /> Entrar
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Abas em telas menores */}
      <nav className="flex overflow-x-auto border-t border-slate-100 px-2 lg:hidden">
        {TABS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium',
              isActive(href) ? 'border-navy text-navy' : 'border-transparent text-slate-500',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
