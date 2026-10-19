import { readState } from '@/lib/server/storage';
import { errorResponse, json } from '@/lib/server/http';
import type { BoardState, Macro } from '@/lib/types';

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

    // 1. Carrega o estado atual usando a função padrão da aplicação
    const state = (await readState()) as BoardState;
    const macro = body.macro || 'viagem';

    if (!state || !state.columns || !Array.isArray(state.columns) || state.columns.length === 0) {
      return errorResponse('Nenhuma coluna cadastrada no quadro.', 400);
    }

    const exportColumns = state.columns.filter((c: any) => c.section === 'exportacao');
    const fallbackColumn = exportColumns[0] || state.columns[0];

    let frotasAlocadas = 0;
    const blocosCriados = new Set<string>();

    for (const alloc of body.allocations) {
      if (!alloc.vehicleId) continue;

      // 2. Busca a coluna de destino (por ID ou correspondência de nome)
      let targetCol: any = state.columns.find((c: any) => c.id === alloc.columnId);

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

      // 3. Remove a frota de outras posições no quadro
      for (const col of state.columns as any[]) {
        const list = col.groups || col.items || col.cards || [];
        for (const grp of list) {
          if (Array.isArray(grp.frotas)) {
            grp.frotas = grp.frotas.filter((f: string) => f !== alloc.vehicleId);
          }
        }
        if (col.groups) col.groups = col.groups.filter((grp: any) => grp.frotas?.length > 0);
        if (col.items) col.items = col.items.filter((grp: any) => grp.frotas?.length > 0);
      }

      // 4. Cria ou reutiliza o bloco de Programação / CRT
      if (!targetCol.groups && !targetCol.items) {
        targetCol.groups = [];
      }
      const targetList = targetCol.groups || targetCol.items;

      let targetGroup = targetList.find(
        (g: any) => String(g.programacao) === String(alloc.programacao) && String(g.crt) === String(alloc.crt)
      );

      if (!targetGroup) {
        targetGroup = {
          id: `grp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          programacao: alloc.programacao,
          crt: alloc.crt,
          cliente: alloc.cliente || 'VITOPEL / CORDOBA',
          frotas: [],
        };
        targetList.push(targetGroup);
      }

      if (!targetGroup.frotas.includes(alloc.vehicleId)) {
        targetGroup.frotas.push(alloc.vehicleId);
        frotasAlocadas++;
      }

      blocosCriados.add(`${targetCol.id}_${alloc.programacao}_${alloc.crt}`);

      // 5. Atualiza a macro da frota
      if (Array.isArray(state.vehicles)) {
        const vehicle = state.vehicles.find((v: any) => v.id === alloc.vehicleId);
        if (vehicle) {
          vehicle.macro = macro;
        }
      }
    }

    state.updatedAt = new Date().toISOString();

    // 6. Atualiza o estado chamando a API de atualização do quadro interno
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    try {
      await fetch(`${baseUrl}/api/board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
    } catch {
      // Caso a chamada via HTTP falhe em build, o objeto retornado atualiza o provider
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
