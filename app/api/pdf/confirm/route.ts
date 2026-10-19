import { getStore, readState } from '@/lib/server/storage';
import { errorResponse, json } from '@/lib/server/http';
import { DEFAULT_COLUMNS } from '@/lib/mock-data';
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

    // 1. Lê o estado atual
    const state = await readState();
    const macro = body.macro || 'viagem';

    // 2. Se a tabela de colunas estiver vazia no banco, inicializa com as colunas padrão
    if (!state.columns || state.columns.length === 0) {
      state.columns = [...DEFAULT_COLUMNS];
    }

    let exportColumns = state.columns.filter((c) => c.section === 'exportacao');
    
    if (exportColumns.length === 0) {
      exportColumns = [
        {
          id: 'cordoba',
          title: 'CÓRDOBA',
          section: 'exportacao',
          country: 'ARG',
        },
      ];
      state.columns.push(...exportColumns);
    }

    const fallbackColumn = exportColumns[0];
    let frotasAlocadas = 0;
    const blocosCriados = new Set<string>();

    for (const alloc of body.allocations) {
      if (!alloc.vehicleId) continue;

      // 3. Determina a coluna de destino
      let targetCol = state.columns.find((c) => c.id === alloc.columnId);

      if (!targetCol && alloc.columnId) {
        const cleanSearch = alloc.columnId.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        targetCol = state.columns.find((c) => {
          const cleanTitle = (c.title || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return cleanTitle.includes(cleanSearch) || cleanSearch.includes(cleanTitle);
        });
      }

      if (!targetCol) {
        targetCol = fallbackColumn;
      }

      // 4. Remove a frota de qualquer outro bloco no quadro antes de reatribuir
      if (!state.groups) state.groups = [];
      for (const group of state.groups) {
        group.frotaIds = group.frotaIds.filter((id) => id !== alloc.vehicleId);
      }

      // Remove blocos que ficaram sem frotas
      state.groups = state.groups.filter((g) => g.frotaIds.length > 0);

      // 5. Localiza ou cria o bloco de Programação / CRT na coluna de destino
      let targetGroup = state.groups.find(
        (g) => g.columnId === targetCol!.id && String(g.programacao) === String(alloc.programacao) && String(g.crt) === String(alloc.crt)
      );

      if (!targetGroup) {
        targetGroup = {
          id: `grp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          columnId: targetCol.id,
          programacao: alloc.programacao,
          crt: alloc.crt,
          cliente: alloc.cliente || 'VITOPEL / CORDOBA',
          frotaIds: [],
          createdAt: new Date().toISOString(),
        } as Group;
        state.groups.push(targetGroup);
      }

      if (!targetGroup.frotaIds.includes(alloc.vehicleId)) {
        targetGroup.frotaIds.push(alloc.vehicleId);
        frotasAlocadas++;
      }

      blocosCriados.add(`${targetCol.id}_${alloc.programacao}_${alloc.crt}`);

      // 6. Atualiza a macro da frota no estado
      const vehicle = state.vehicles.find((v) => v.id === alloc.vehicleId);
      if (vehicle) {
        vehicle.macro = macro;
        vehicle.macroUpdatedAt = new Date().toISOString();
      }
    }

    // 7. Salva permanentemente no Supabase via Store
    const savedState = await getStore().saveBoard(state, 'importacao_pdf');

    return json({
      success: true,
      frotas: frotasAlocadas,
      blocos: blocosCriados.size,
      state: savedState,
    });
  } catch (err) {
    return errorResponse(
      `Erro ao confirmar importação: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
