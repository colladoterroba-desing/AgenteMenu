import { planificarSemana, type TipoComida } from "./planificacion.js";
import type { Despensa, Dia, Familia } from "./tipos.js";

export const SECCIONES = [
  "Frutería",
  "Carnicería",
  "Pescadería",
  "Charcutería y quesos",
  "Lácteos y huevos",
  "Panadería",
  "Despensa",
  "Congelados",
] as const;
export type Seccion = (typeof SECCIONES)[number];

export interface Ingrediente {
  nombre: string;
  /** Cantidad para una ración de referencia (adulto de 2000 kcal). */
  cantidad: number;
  unidad: string;
  seccion: Seccion;
}

export type Tecnica = "sin cocinar" | "plancha" | "horno" | "guiso" | "frío";

export interface Receta {
  id: string;
  nombre: string;
  tipo: TipoComida | "tupper";
  tiempoMin: number;
  tecnica: Tecnica;
  ingredientes: Ingrediente[];
  pasos: string[];
  conservacion?: string;
}

export interface PlatoMenu {
  receta: string;
  /** Cuándo y cómo se prepara si no es en el momento (batch, ración extra...). */
  prepara?: string;
  /** Miembros que comen otra receta en esa comida (p. ej. RFA cuando hay pescado). */
  variantes?: Record<string, string>;
}

export interface MenuSemana {
  semana: string;
  batch?: { dia: Dia; tareas: string[] }[];
  dias: Record<Dia, Partial<Record<TipoComida, PlatoMenu>>>;
  tuppers: Partial<Record<Dia, Record<string, PlatoMenu>>>;
}

export interface Racion {
  receta: Receta;
  comensales: { id: string; kcal: number; factorRacion: number }[];
  raciones: number;
  prepara?: string;
}

export interface ComidaDelMenu {
  tipo: TipoComida;
  platos: Racion[];
  tuppers: (Racion & { para: string; tipoTupper: string })[];
  cocina: string;
}

export interface DiaDelMenu {
  dia: Dia;
  nombre: string;
  comidas: ComidaDelMenu[];
}

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** Comprueba que el menú solo usa recetas existentes y que cubre las comidas de la rejilla. */
export function validarMenu(familia: Familia, menu: MenuSemana, recetas: Receta[]): string[] {
  const ids = new Set(recetas.map((r) => r.id));
  const errores: string[] = [];
  const comprobar = (donde: string, p: PlatoMenu) => {
    if (!ids.has(p.receta)) errores.push(`${donde}: receta desconocida «${p.receta}»`);
    for (const [id, receta] of Object.entries(p.variantes ?? {})) {
      if (!ids.has(receta)) errores.push(`${donde} (variante ${id}): receta desconocida «${receta}»`);
    }
  };
  for (const dia of planificarSemana(familia)) {
    for (const comida of dia.comidas) {
      const plato = menu.dias[dia.dia]?.[comida.tipo];
      if (!plato) errores.push(`${dia.nombre} ${comida.tipo}: falta el plato`);
      else comprobar(`${dia.nombre} ${comida.tipo}`, plato);
      for (const t of comida.tuppers) {
        const tupper = menu.tuppers[dia.dia]?.[t.id];
        if (!tupper) errores.push(`${dia.nombre}: falta el tupper de ${t.id}`);
        else comprobar(`${dia.nombre} tupper ${t.id}`, tupper);
      }
    }
  }
  return errores;
}

/** Une la rejilla de comensales con los platos del menú. */
export function componerMenu(familia: Familia, menu: MenuSemana, recetas: Receta[]): DiaDelMenu[] {
  const porId = new Map(recetas.map((r) => [r.id, r]));
  const receta = (id: string) => {
    const r = porId.get(id);
    if (!r) throw new Error(`Receta desconocida: ${id}`);
    return r;
  };

  return planificarSemana(familia).map((dia) => ({
    dia: dia.dia,
    nombre: dia.nombre,
    comidas: dia.comidas.map((comida): ComidaDelMenu => {
      const plato = menu.dias[dia.dia]?.[comida.tipo];
      const platos: Racion[] = [];
      if (plato) {
        const variantes = plato.variantes ?? {};
        const principal = comida.comensales.filter((c) => !variantes[c.id]);
        platos.push({
          receta: receta(plato.receta),
          comensales: principal,
          raciones: redondear2(principal.reduce((s, c) => s + c.factorRacion, 0)),
          prepara: plato.prepara,
        });
        for (const [id, variante] of Object.entries(variantes)) {
          const comensal = comida.comensales.find((c) => c.id === id);
          if (!comensal) continue;
          platos.push({ receta: receta(variante), comensales: [comensal], raciones: comensal.factorRacion });
        }
      }
      const tuppers = comida.tuppers.flatMap((t) => {
        const tupper = menu.tuppers[dia.dia]?.[t.id];
        if (!tupper) return [];
        return [{
          receta: receta(tupper.receta),
          comensales: [t],
          raciones: t.factorRacion,
          prepara: tupper.prepara,
          para: t.id,
          tipoTupper: t.tipo,
        }];
      });
      return { tipo: comida.tipo, platos, tuppers, cocina: comida.cocina };
    }),
  }));
}

export interface LineaCompra {
  nombre: string;
  unidad: string;
  cantidad: number;
  enDespensa: number;
  comprar: number;
  recetas: string[];
}

/** Redondea hacia arriba a una cantidad razonable para comprar. */
function redondearCompra(cantidad: number, unidad: string): number {
  if (cantidad <= 0) return 0;
  if (unidad === "g" || unidad === "ml") {
    const paso = cantidad > 500 ? 50 : 10;
    return Math.ceil(cantidad / paso) * paso;
  }
  return Math.ceil(cantidad);
}

/** Suma los ingredientes de todas las raciones de la semana y descuenta la despensa. */
export function listaCompra(dias: DiaDelMenu[], despensa?: Despensa): Record<Seccion, LineaCompra[]> {
  const acumulado = new Map<string, LineaCompra & { seccion: Seccion }>();
  const todas = dias.flatMap((d) => d.comidas.flatMap((c) => [...c.platos, ...c.tuppers]));
  for (const { receta, raciones } of todas) {
    for (const ing of receta.ingredientes) {
      const clave = `${ing.nombre.toLowerCase()}|${ing.unidad}`;
      const linea = acumulado.get(clave) ?? {
        nombre: ing.nombre, unidad: ing.unidad, seccion: ing.seccion,
        cantidad: 0, enDespensa: 0, comprar: 0, recetas: [],
      };
      linea.cantidad += ing.cantidad * raciones;
      if (!linea.recetas.includes(receta.nombre)) linea.recetas.push(receta.nombre);
      acumulado.set(clave, linea);
    }
  }

  const lista = Object.fromEntries(SECCIONES.map((s) => [s, [] as LineaCompra[]])) as Record<Seccion, LineaCompra[]>;
  for (const { seccion, ...linea } of acumulado.values()) {
    const enCasa = despensa?.productos.find(
      (p) => p.nombre.toLowerCase() === linea.nombre.toLowerCase() && p.unidad === linea.unidad,
    );
    linea.enDespensa = enCasa?.cantidad ?? 0;
    linea.comprar = redondearCompra(linea.cantidad - linea.enDespensa, linea.unidad);
    linea.cantidad = redondear2(linea.cantidad);
    lista[seccion].push(linea);
  }
  for (const s of SECCIONES) lista[s].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return lista;
}

