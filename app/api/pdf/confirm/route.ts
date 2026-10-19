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

    // 1. Lê o estado atual do quadro
    const state = await readState();
    const macro = body.macro || 'viagem';

    // 2. Se o banco não retornar colunas, inicializa com as colunas padrão
    if (!state.columns || state.columns.length === 0) {
      state.columns = [...DEFAULT_COLUMNS];
    }

    const exportColumns = state.columns.filter((c) => c.section === 'exportacao');
    const fallbackColumn = exportColumns[0] || state.columns[0];

    let frotasAlocadas = 0;
    const blocosCriados = new Set<string>();

    for (const alloc of body.allocations) {
      if (!alloc.vehicleId) continue;

      // 3. Localiza a coluna de destino por ID ou título
      let targetCol = state.columns.find((c) => c.id === alloc.columnId);

      if (!targetCol && alloc.columnId) {
        const cleanSearch = alloc.columnId.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        targetCol = state.columns.find((c) => {
          const cleanTitle = (c.title || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return cleanTitle.includes(cleanSearch) || cleanSearch.includes(cleanTitle);
        });
      }

      const finalColumnId = targetCol?.id || fallbackColumn.id;

      // 4. Remove a frota de alocações anteriores no quadro
      if (!state.groups) state.groups = [];
      for (const group of state.groups) {
        group.frotaIds = group.frotaIds.filter((id) => id !== alloc.vehicleId);
      }

      // Limpa blocos que ficaram vazios
      state.groups = state.groups.filter((g) => g.frotaIds.length > 0);

      // 5. Localiza ou cria o bloco de Programação / CRT
      let targetGroup = state.groups.find(
        (g) => g.columnId === finalColumnId && String(g.programacao) === String(alloc.programacao) && String(g.crt) === String(alloc.crt)
      );

      if (!targetGroup) {
        targetGroup = {
          id: `grp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          columnId: finalColumnId,
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

      blocosCriados.add(`${finalColumnId}_${alloc.programacao}_${alloc.crt}`);

      // 6. Atualiza a macro da frota
      const vehicle = state.vehicles.find((v) => v.id === alloc.vehicleId);
      if (vehicle) {
        vehicle.macro = macro;
        vehicle.macroUpdatedAt = new Date().toISOString();
      }
    }

    // 7. Salva o quadro completo via Store oficial (populando colunas, blocos e frotas no Supabase)
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
