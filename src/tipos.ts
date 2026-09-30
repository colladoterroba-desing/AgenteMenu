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
    /** Quién se lleva un almuerzo de media mañana (colegio, trabajo) y qué días. */
    almuerzo?: Record<string, { dias: Dia[]; lugar: string }>;
    /** Quién se lleva la comida a la oficina, qué días y si se come frío o recalentado. */
    tupper?: Record<string, { dias: Dia[]; tipo: "frío" | "para recalentar" }>;
    desayuno: string;
    merienda: string;
  };
  roles: Record<string, string>;
  /** Normas de la casa que aplican a todas las recetas (p. ej. tipo de leche). */
  preferencias?: string[];
  /**
   * Platos marcados como no deseados, con el motivo, para no repetirlos en futuros
   * menús. `por` es un miembro (no se le sirve a él) o "familia" (no se sirve a nadie).
   */
  noDeseados?: { receta: string; por: string; motivo: string; fecha: string }[];
  /** Electrodomésticos de la cocina que las recetas pueden aprovechar (p. ej. Thermomix). */
  equipamiento?: string[];
  /** Recetas que la familia hace habitualmente; el agente les da prioridad. */
  platosHabituales?: { cenas: string[]; comidas: string[] };
  /** Ingredientes que solo se sirven si come alguno de esos adultos (p. ej. legumbres). */
  supervision?: { ingredientes: string[]; adultos: string[]; motivo: string }[];
  /** Ingredientes que solo pueden aparecer en ciertas comidas (p. ej. pescado azul solo el jueves a mediodía). */
  restricciones?: {
    ingredientes: string[];
    soloEn: { dia: Dia; comida: string }[];
    motivo: string;
  }[];
  /**
   * Desayuno habitual de cada miembro, el mismo todos los días. Por defecto no se
   * muestra en el menú (mostrarEnMenu: true para verlo); siempre cuenta en la compra.
   */
  desayunos?: Record<string, { receta: string; nota?: string; mostrarEnMenu?: boolean }>;
  objetivos: Record<string, Objetivo>;
}

export interface Producto {
  nombre: string;
  cantidad: number;
  unidad: string;
  categoria?: string;
  caducidad?: string;
  /** De dónde sale el dato (p. ej. ticket) y si la cantidad está confirmada. */
  nota?: string;
}

export interface Sobra {
  descripcion: string;
  /** Raciones que quedan en reserva. */
  raciones: number;
  fecha: string;
  consumirAntesDe?: string;
  /** Receta de la que salen: si el menú la vuelve a poner, se descuentan de la compra. */
  receta?: string;
  /** Dónde se guardan. */
  ubicacion?: "nevera" | "congelador";
  /** Raciones que se hicieron en total ese día (lo que sobró es `raciones`). */
  hechas?: number;
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
  /** Número de factura o ticket, para no registrarlo dos veces. */
  referencia?: string;
  lineas: LineaTicket[];
}
