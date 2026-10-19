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

    const supabase = getSupabaseClient();
    if (!supabase) {
      return errorResponse('Cliente Supabase não configurado.', 500);
    }

    // 1. Busca o estado real do quadro na tabela board_state
    const { data: boardRow } = await supabase
      .from('board_state')
      .select('data')
      .limit(1)
      .maybeSingle();

    let state = boardRow?.data;

    // Se o estado não existir no banco, estrutura um objeto base
    if (!state) {
      state = { columns: [], vehicles: [] };
    }

    // Se não existirem colunas, cria a estrutura padrão de Exportação
    if (!state.columns || !Array.isArray(state.columns) || state.columns.length === 0) {
      state.columns = [
        { id: 'cordoba', title: 'CÓRDOBA', section: 'exportacao', groups: [] },
        { id: 'zarate', title: 'ZÁRATE', section: 'exportacao', groups: [] },
        { id: 'rosario', title: 'ROSÁRIO', section: 'exportacao', groups: [] },
      ];
    }

    const macro = body.macro || 'viagem';
    const exportColumns = state.columns.filter((c: any) => c.section === 'exportacao');
    const fallbackColumn = exportColumns[0] || state.columns[0];

    let frotasAlocadas = 0;
    const blocosCriados = new Set<string>();

    for (const alloc of body.allocations) {
      if (!alloc.vehicleId) continue;

      // 2. Busca a coluna de destino (por ID ou aproximação de nome)
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

    // 6. Grava de forma forçada na tabela board_state
    const { error: saveError } = await supabase
      .from('board_state')
      .upsert({ id: 'main', data: state, updated_at: state.updatedAt });

    if (saveError) {
      return errorResponse(`Erro ao salvar no Supabase: ${saveError.message}`, 500);
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
