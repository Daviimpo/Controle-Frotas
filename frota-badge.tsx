import type { ReactNode } from 'react';
import { MACROS, normalizeMacro } from '@/lib/macro';
import type { Macro } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Número da frota pintado com a cor da macro do rastreador (padrão: VIAGEM) */
export function FrotaBadge({
  numero,
  macro,
  className,
  children,
}: {
  numero: string;
  macro?: Macro | string | null;
  className?: string;
  children?: ReactNode;
}) {
  const m = normalizeMacro(macro ?? 'viagem');
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-bold tabular-nums shadow-sm', MACROS[m].chip, className)}
      title={MACROS[m].label}
    >
      {numero}
      {children}
    </span>
  );
}

/** Rótulo da macro (ex.: na tabela do cadastro) */
export function MacroLabel({ macro, className }: { macro: Macro; className?: string }) {
  return (
    <span className={cn('inline-block rounded border px-2.5 py-1 text-xs font-bold uppercase', MACROS[macro].chip, className)}>
      {MACROS[macro].label}
    </span>
  );
}
