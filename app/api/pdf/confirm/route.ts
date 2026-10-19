import { readState } from '@/lib/server/storage';
import { errorResponse, json } from '@/lib/server/http';
import { getSupabase } from '@/lib/server/supabase';
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

    const sb = getSupabase();

    // 1. Busca as colunas na tabela do Supabase
    let { data: dbColumns } = await sb.from('quadro_colunas').select('*').order('ordem');

    // Se estiver vazia, insere as colunas padrão enviando apenas o esquema base (sem campos incompatíveis)
    if (!dbColumns || dbColumns.length === 0) {
      const defaultRows = DEFAULT_COLUMNS.map((c, i) => ({
        id: c.id,
        titulo: c.title,
        secao: c.section,
        subtitulo: c.subtitle ?? null,
        ordem: i,
      }));

      const { error: insertColErr } = await sb.from('quadro_colunas').upsert(defaultRows, { onConflict: 'id' });
      if (insertColErr) {
        return errorResponse(`Erro ao inicializar quadro_colunas: ${insertColErr.message}`, 500);
      }

      const { data: reloadedCols } = await sb.from('quadro_colunas').select('*').order('ordem');
      dbColumns = reloadedCols || defaultRows;
    }

    // 2. Lê o estado
    const state = await readState();
    const macro = body.macro || 'viagem';

    const exportColumns = dbColumns.filter((c: any) => c.secao === 'exportacao');
    const fallbackColumn = exportColumns[0] || dbColumns[0];

    let frotasAlocadas = 0;
    const blocosCriados = new Set<string>();

    for (const alloc of body.allocations) {
      if (!alloc.vehicleId) continue;

      let targetDbCol = dbColumns.find((c: any) => c.id === alloc.columnId);

      if (!targetDbCol && alloc.columnId) {
        const cleanSearch = alloc.columnId.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        targetDbCol = dbColumns.find((c: any) => {
          const cleanTitle = (c.titulo || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return cleanTitle.includes(cleanSearch) || cleanSearch.includes(cleanTitle);
        });
      }

      const realColumnId = targetDbCol?.id || fallbackColumn.id;

      if (!state.groups) state.groups = [];
      for (const group of state.groups) {
        group.frotaIds = group.frotaIds.filter((id) => id !== alloc.vehicleId);
      }

      state.groups = state.groups.filter((g) => g.frotaIds.length > 0);

      let targetGroup = state.groups.find(
        (g) => g.columnId === realColumnId && String(g.programacao) === String(alloc.programacao) && String(g.crt) === String(alloc.crt)
      );

      if (!targetGroup) {
        targetGroup = {
          id: `grp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          columnId: realColumnId,
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

      blocosCriados.add(`${realColumnId}_${alloc.programacao}_${alloc.crt}`);

      const vehicle = state.vehicles.find((v) => v.id === alloc.vehicleId);
      if (vehicle) {
        vehicle.macro = macro;
        vehicle.macroUpdatedAt = new Date().toISOString();
      }
    }

    // 3. Grava frotas na tabela
    const blocosRows = state.groups.map((g, i) => ({
      id: g.id,
      column_id: g.columnId,
      label: g.label ?? null,
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
