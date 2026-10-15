export type Macro = 'vazio' | 'destinado' | 'carga' | 'viagem' | 'descarga' | 'manutencao';

export type Section = 'exportacao' | 'status' | 'importacao';

export type Country = 'BR' | 'AR' | 'UY' | 'CL' | 'PY';

export type Role = 'admin' | 'operador';

export interface Vehicle {
  id: string;
  /** Número da frota (ex: 161, 177, 243) */
  frota: string;
  placaCavalo: string;
  placaCarreta: string;
  motorista: string;
  /** Último macro enviado pelo rastreador */
  macro: Macro;
  macroUpdatedAt: string;
}

export interface Column {
  id: string;
  title: string;
  section: Section;
  subtitle?: string;
  country?: Country;
  /** Macros esperados para frotas nessa coluna (usado nos alertas) */
  expectedMacros?: Macro[];
}

/** Bloco de Programação + CRT (ou agrupamento operacional) dentro de uma coluna */
export interface Group {
  id: string;
  columnId: string;
  label?: string;
  programacao?: string;
  crt?: string;
  cliente?: string;
  expectedMacros?: Macro[];
  frotaIds: string[];
  createdAt: string;
}

export interface BoardState {
  vehicles: Vehicle[];
  columns: Column[];
  groups: Group[];
  updatedAt: string;
  updatedBy?: string;
  version: number;
}

export interface Session {
  user: string;
  role: Role;
}

export type VehicleInput = Pick<Vehicle, 'frota' | 'placaCavalo' | 'placaCarreta' | 'motorista'>;

export interface ExtractedRow {
  placaCavalo: string;
  placaCarreta?: string | null;
  motorista?: string | null;
  crt?: string | null;
  programacao?: string | null;
  destino?: string | null;
  cliente?: string | null;
}

export interface ExtractionResult {
  source: 'claude' | 'simulacao';
  documento?: string | null;
  tipo?: 'exportacao' | 'importacao' | null;
  pais?: Country | null;
  programacao?: string | null;
  rows: ExtractedRow[];
  warning?: string;
}
