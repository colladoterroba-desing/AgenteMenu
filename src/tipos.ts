export const DIAS = ["L", "M", "X", "J", "V", "S", "D"] as const;
export type Dia = (typeof DIAS)[number];

export const NOMBRE_DIA: Record<Dia, string> = {
  L: "Lunes",
  M: "Martes",
  X: "Miércoles",
  J: "Jueves",
  V: "Viernes",
  S: "Sábado",
  D: "Domingo",
};

export type Sexo = "V" | "M";

export interface Actividad {
  deporte: string;
  dias: Dia[];
  minutos: number;
}

export interface Miembro {
  id: string;
  edad: number;
  sexo: Sexo;
  alturaCm: number;
  pesoKg: number;
  gustos: string[];
  actividades: Actividad[];
}

/** Objetivo de peso acordado con el usuario (solo adultos). */
export interface Objetivo {
  pesoObjetivoKg: number;
  kcalDiarias: number;
  semanas: number;
  fechaInicio: string;
  notas?: string;
}

export interface Familia {
  nombre: string;
  miembros: Miembro[];
  alergias: string[];
  regimen: {
    comida: Record<Dia, string[]>;
    cena: Record<Dia, string[]>;
    /** Quién se lleva la comida a la oficina, qué días y si se come frío o recalentado. */
    tupper?: Record<string, { dias: Dia[]; tipo: "frío" | "para recalentar" }>;
    desayuno: string;
    merienda: string;
  };
  roles: Record<string, string>;
  objetivos: Record<string, Objetivo>;
}

export interface Producto {
  nombre: string;
  cantidad: number;
  unidad: string;
  categoria?: string;
  caducidad?: string;
}

export interface Sobra {
  descripcion: string;
  raciones: number;
  fecha: string;
  consumirAntesDe?: string;
}

export interface Despensa {
  productos: Producto[];
  sobras: Sobra[];
}

export interface LineaTicket {
  producto: string;
  cantidad: number;
  unidad: string;
  precio: number;
  categoria?: string;
}

export interface Ticket {
  fecha: string;
  tienda: string;
  total: number;
  lineas: LineaTicket[];
}
