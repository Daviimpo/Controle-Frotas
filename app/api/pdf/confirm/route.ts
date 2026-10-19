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

    // 1. Lê o estado atual
    const state = await readState();
    const macro = body.macro || 'viagem';

    const exportColumns = state.columns?.filter((c) => c.section === 'exportacao') || [];
    const fallbackColumn = exportColumns[0] || state.columns?.[0];

    let frotasAlocadas = 0;
    const blocosCriados = new Set<string>();

    for (const alloc of body.allocations) {
      if (!alloc.vehicleId) continue;

      // 2. Determina a coluna no quadro
      let targetCol = state.columns?.find((c) => c.id === alloc.columnId);

      if (!targetCol && alloc.columnId) {
        const cleanSearch = alloc.columnId.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        targetCol = state.columns?.find((c) => {
          const cleanTitle = (c.title || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return cleanTitle.includes(cleanSearch) || cleanSearch.includes(cleanTitle);
        });
      }

      const finalColumnId = targetCol?.id || alloc.columnId || fallbackColumn?.id || 'cordoba';

      // 3. Remove a frota de alocações anteriores no quadro
      if (!state.groups) state.groups = [];
      for (const group of state.groups) {
        group.frotaIds = group.frotaIds.filter((id) => id !== alloc.vehicleId);
      }

      // Limpa blocos que ficaram vazios
      state.groups = state.groups.filter((g) => g.frotaIds.length > 0);

      // 4. Localiza ou cria o bloco de Programação / CRT na coluna de destino
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

      // 5. Atualiza a macro da frota
      const vehicle = state.vehicles.find((v) => v.id === alloc.vehicleId);
      if (vehicle) {
        vehicle.macro = macro;
        vehicle.macroUpdatedAt = new Date().toISOString();
      }
    }

    // 6. Grava diretamente no Supabase mapeando o nome exato da coluna 'column_id'
    const sb = getSupabase();

    const blocosRows = state.groups.map((g, i) => ({
      id: g.id,
      column_id: g.columnId, // Mapeado para column_id em inglês conforme tabela do banco
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
