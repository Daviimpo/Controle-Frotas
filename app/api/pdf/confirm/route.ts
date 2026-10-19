import { readState } from '@/lib/server/storage';
import { errorResponse, json } from '@/lib/server/http';
import { getSupabase } from '@/lib/server/supabase';
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

    // 1. Lê o estado atual (colunas e frotas)
    const state = await readState();
    const macro = body.macro || 'viagem';

    // Pega as colunas de exportação existentes no seu quadro
    const exportColumns = state.columns.filter((c) => c.section === 'exportacao');
    const fallbackColumn = exportColumns[0] || state.columns[0];

    if (!fallbackColumn) {
      return errorResponse('Nenhuma coluna de exportação encontrada no quadro.', 400);
    }

    let frotasAlocadas = 0;
    const blocosCriados = new Set<string>();

    for (const alloc of body.allocations) {
      if (!alloc.vehicleId) continue;

      // 2. Determina a coluna de destino existente no banco
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

      // 3. Remove a frota de qualquer outro bloco no quadro antes de alocar
      if (!state.groups) state.groups = [];
      for (const group of state.groups) {
        group.frotaIds = group.frotaIds.filter((id) => id !== alloc.vehicleId);
      }

      // Limpa blocos vazios
      state.groups = state.groups.filter((g) => g.frotaIds.length > 0);

      // 4. Localiza ou cria o bloco de Programação / CRT na coluna de destino
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

      // 5. Atualiza a macro da frota
      const vehicle = state.vehicles.find((v) => v.id === alloc.vehicleId);
      if (vehicle) {
        vehicle.macro = macro;
        vehicle.macroUpdatedAt = new Date().toISOString();
      }
    }

    // 6. Salva APENAS o quadro de frotas e as macros no Supabase (sem mexer em quadro_colunas)
    const sb = getSupabase();

    // Converte blocos para o formato da tabela 'quadro_frotas'
    const blocosRows = state.groups.map((g, i) => ({
      id: g.id,
      coluna_id: g.columnId,
      rotulo: g.label ?? null,
      programacao: g.programacao ?? null,
      crt: g.crt ?? null,
      cliente: g.cliente ?? null,
      frota_ids: g.frotaIds,
      ordem: i,
      created_at: g.createdAt,
    }));

    if (blocosRows.length) {
      const { error: errBlocos } = await sb.from('quadro_frotas').upsert(blocosRows);
      if (errBlocos) throw new Error(`Erro ao salvar frotas no quadro: ${errBlocos.message}`);
    }

    // Atualiza macros das frotas
    const frotasRows = state.vehicles.map((v) => ({
      id: v.id,
      frota: v.frota,
      placa_cavalo: v.placaCavalo ?? '',
      placa_carreta: v.placaCarreta ?? '',
      motorista: v.motorista ?? '',
      macro: v.macro,
      macro_updated_at: v.macroUpdatedAt,
      updated_at: new Date().toISOString(),
    }));

    if (frotasRows.length) {
      const { error: errFrotas } = await sb.from('frotas').upsert(frotasRows);
      if (errFrotas) throw new Error(`Erro ao atualizar frotas: ${errFrotas.message}`);
    }

    // Atualiza versão do quadro
    await sb.from('quadro_meta').upsert({ id: 1, version: Date.now(), updated_at: new Date().toISOString(), updated_by: 'importacao_pdf' });

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
