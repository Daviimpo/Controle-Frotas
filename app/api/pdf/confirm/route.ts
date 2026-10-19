import { readState } from '@/lib/server/storage';
import { errorResponse, json } from '@/lib/server/http';
import { createClient } from '@supabase/supabase-js';
import type { Macro } from '@/lib/types';

export const runtime = 'nodejs';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

interface ConfirmPayload {
  macro?: Macro;
  allocations: Array<{
    vehicleId: string;
    columnId: string;
    programacao: string;
    crt: string;
    cliente: string;
  }>;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ConfirmPayload;
    if (!body?.allocations || !Array.isArray(body.allocations) || body.allocations.length === 0) {
      return errorResponse('Nenhuma alocação informada.', 400);
    }

    const state = await readState();
    const macro = body.macro || 'viagem';

    // 1. Identifica colunas válidas de Exportação no quadro
    const exportColumns = state.columns.filter((c: any) => c.section === 'exportacao');
    const fallbackColumn = exportColumns[0] || state.columns[0];

    if (!fallbackColumn) {
      return errorResponse('Nenhuma coluna cadastrada no quadro.', 400);
    }

    let frotasAlocadas = 0;
    const blocosCriados = new Set<string>();

    for (const alloc of body.allocations) {
      if (!alloc.vehicleId) continue;

      // 2. Busca a coluna exata pelo ID ou pelo Título (ex: CORDOBA). Se não achar, usa a primeira de Exportação.
      let targetCol = state.columns.find((c: any) => c.id === alloc.columnId);

      if (!targetCol && alloc.columnId) {
        const cleanSearch = alloc.columnId.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        targetCol = state.columns.find((c: any) => {
          const cleanTitle = (c.title || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return cleanTitle.includes(cleanSearch) || cleanSearch.includes(cleanTitle);
        });
      }

      if (!targetCol) {
        targetCol = fallbackColumn;
      }

      // 3. Remove a frota de qualquer outro lugar no quadro
      for (const col of state.columns) {
        for (const grp of col.groups) {
          grp.frotas = grp.frotas.filter((f: string) => f !== alloc.vehicleId);
        }
        col.groups = col.groups.filter((grp: any) => grp.frotas.length > 0);
      }

      // 4. Localiza ou cria o bloco de Programação / CRT na coluna de destino
      let targetGroup = targetCol.groups.find(
        (g: any) => g.programacao === alloc.programacao && g.crt === alloc.crt
      );

      if (!targetGroup) {
        targetGroup = {
          id: `grp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          programacao: alloc.programacao,
          crt: alloc.crt,
          cliente: alloc.cliente || 'VITOPEL / CORDOBA',
          frotas: [],
        };
        targetCol.groups.push(targetGroup);
      }

      if (!targetGroup.frotas.includes(alloc.vehicleId)) {
        targetGroup.frotas.push(alloc.vehicleId);
        frotasAlocadas++;
      }

      blocosCriados.add(`${targetCol.id}_${alloc.programacao}_${alloc.crt}`);

      // 5. Atualiza a macro da frota
      const vehicle = state.vehicles.find((v: any) => v.id === alloc.vehicleId);
      if (vehicle) {
        vehicle.macro = macro;
      }
    }

    state.updatedAt = new Date().toISOString();

    // 6. Grava o estado atualizado diretamente no Supabase
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('board_state').upsert({ id: 'main', data: state, updated_at: state.updatedAt });
    }

    return json({
      success: true,
      frotas: frotasAlocadas,
      blocos: blocosCriados.size,
      state,
    });
  } catch (err) {
    return errorResponse(
      `Erro ao confirmar importação: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
