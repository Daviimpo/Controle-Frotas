import { getStore, readState } from '@/lib/server/storage';
import { errorResponse, json } from '@/lib/server/http';
import type { Group, Macro } from '@/lib/types';

export const runtime = 'nodejs';

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

    // 1. Lê o estado atual via storage nativo
    const state = await readState();
    const macro = body.macro || 'viagem';

    if (!state.columns || state.columns.length === 0) {
      return errorResponse('Nenhuma coluna cadastrada no quadro.', 400);
    }

    const exportColumns = state.columns.filter((c) => c.section === 'exportacao');
    const fallbackColumn = exportColumns[0] || state.columns[0];

    let frotasAlocadas = 0;
    const blocosCriados = new Set<string>();

    for (const alloc of body.allocations) {
      if (!alloc.vehicleId) continue;

      // 2. Extrai e valida a coluna/destino de forma inteligente
      // Separa o destino se vier no formato "CLIENTE / DESTINO" (ex: "VITOPEL / CORDOBA")
      let searchTarget = alloc.columnId || alloc.cliente || '';
      if (searchTarget.includes('/')) {
        const parts = searchTarget.split('/');
        searchTarget = parts[parts.length - 1].trim();
      }

      let targetCol = state.columns.find((c) => c.id === searchTarget);

      if (!targetCol && searchTarget) {
        const cleanSearch = searchTarget.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        targetCol = state.columns.find((c) => {
          const cleanTitle = (c.title || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return cleanTitle.includes(cleanSearch) || cleanSearch.includes(cleanTitle);
        });
      }

      const finalColumn = targetCol || fallbackColumn;

      // Extrai o nome limpo do cliente
      let rawCliente = alloc.cliente || 'VITOPEL';
      if (rawCliente.includes('/')) {
        rawCliente = rawCliente.split('/')[0].trim();
      }

      // 3. Remove a frota de alocações anteriores no quadro
      if (!state.groups) state.groups = [];
      for (const group of state.groups) {
        group.frotaIds = group.frotaIds.filter((id) => id !== alloc.vehicleId);
      }

      // Remove blocos vazios
      state.groups = state.groups.filter((g) => g.frotaIds.length > 0);

      // 4. Localiza ou cria o bloco de Programação / CRT
      let targetGroup = state.groups.find(
        (g) => g.columnId === finalColumn.id && String(g.programacao) === String(alloc.programacao) && String(g.crt) === String(alloc.crt)
      );

      if (!targetGroup) {
        targetGroup = {
          id: `grp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          columnId: finalColumn.id,
          programacao: alloc.programacao,
          crt: alloc.crt,
          cliente: rawCliente,
          frotaIds: [],
          createdAt: new Date().toISOString(),
        } as Group;
        state.groups.push(targetGroup);
      }

      if (!targetGroup.frotaIds.includes(alloc.vehicleId)) {
        targetGroup.frotaIds.push(alloc.vehicleId);
        frotasAlocadas++;
      }

      blocosCriados.add(`${finalColumn.id}_${alloc.programacao}_${alloc.crt}`);

      // 5. Atualiza a macro da frota
      const vehicle = state.vehicles.find((v) => v.id === alloc.vehicleId);
      if (vehicle) {
        vehicle.macro = macro;
        vehicle.macroUpdatedAt = new Date().toISOString();
      }
    }

    // 6. Grava tudo usando estritamente o saveBoard da Store
    const savedState = await getStore().saveBoard(state, 'importacao_pdf');

    return json({
      success: true,
      frotas: frotasAlocadas,
      blocos: blocosCriados.size,
      state: savedState,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes('schema cache') || errorMsg.includes('coluna_id')) {
      return errorResponse(
        'Erro de esquema no Supabase. Por favor, rode a migração 0002_corrigir_schema_existente.sql no SQL Editor.',
        500
      );
    }
    return errorResponse(`Erro ao confirmar importação: ${errorMsg}`, 500);
  }
}
