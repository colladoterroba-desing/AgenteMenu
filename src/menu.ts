import { planificarSemana, type TipoComida } from "./planificacion.js";
import type { Despensa, Dia, Familia } from "./tipos.js";
import { aGramos, equivalencia, gramosPorUnidad } from "./unidades.js";

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
  /** Se compra uno por persona (p. ej. una dorada), sin escalar por el tamaño de la ración. */
  porPersona?: boolean;
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
  /** Pasos alternativos con Thermomix (tiempo/temperatura/velocidad). */
  thermomix?: string[];
  conservacion?: string;
  /** Cantidades por persona, sin escalar por ración (desayunos habituales, envasados...). */
  racionFija?: boolean;
  /** Se prepara justo antes de comerla (p. ej. tortilla francesa): no vale para almuerzos ni tuppers. */
  alMomento?: boolean;
}

export interface PlatoMenu {
  receta: string;
  /** Segundo plato de la misma comida (p. ej. puré de primero y lomo de segundo). */
  segundo?: string;
  /** Cuándo y cómo se prepara si no es en el momento (batch, ración extra...). */
  prepara?: string;
  /** Miembros que comen otra receta en esa comida (p. ej. RFA cuando hay pescado). */
  variantes?: Record<string, string>;
  /**
   * Se cocina junto con otra comida (ración extra de una cena, batch...): son sobras de
   * esa comida. En la web no se marca como cocinado aparte; sus raciones se suman a las de esa comida.
   */
  sobrasDe?: { dia: Dia; comida: TipoComida };
}

export interface CambioMenu {
  por: string;
  fecha: string;
  descripcion: string;
}

export interface MenuSemana {
  semana: string;
  /** Lunes de la semana (AAAA-MM-DD): la web oculta los días que ya han pasado. */
  inicio?: string;
  cambios?: CambioMenu[];
  batch?: { dia: Dia; tareas: string[] }[];
  dias: Record<Dia, Partial<Record<TipoComida, PlatoMenu>>>;
  tuppers: Partial<Record<Dia, Record<string, PlatoMenu>>>;
}

export interface Racion {
  receta: Receta;
  comensales: { id: string; kcal: number; factorRacion: number }[];
  raciones: number;
  prepara?: string;
  nota?: string;
  /** Sale de otra comida (ración extra, batch): no se cocina aparte. */
  sobrasDe?: { dia: Dia; comida: TipoComida };
  /** Segundo plato, para los mismos comensales. */
  segundo?: { receta: Receta; raciones: number };
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

const normalizar = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Normas de la familia que incumple una receta servida en ese día y comida. */
function incumpleNormas(familia: Familia, receta: Receta, dia: Dia, comida: string, fuera: boolean): string[] {
  const avisos: string[] = [];
  if (fuera && receta.alMomento) avisos.push(`«${receta.nombre}» se hace al momento y no se puede preparar antes`);
  for (const r of familia.restricciones ?? []) {
    const permitido = r.soloEn.some((x) => x.dia === dia && x.comida === comida);
    const prohibido = receta.ingredientes.find((i) =>
      r.ingredientes.some((palabra) => normalizar(i.nombre).includes(normalizar(palabra))),
    );
    if (prohibido && !permitido) avisos.push(`«${receta.nombre}» lleva ${prohibido.nombre.toLowerCase()}: ${r.motivo}`);
  }
  return avisos;
}

/** Comprueba que el menú solo usa recetas existentes, cumple las normas de la casa y cubre la rejilla. */
export function validarMenu(familia: Familia, menu: MenuSemana, recetas: Receta[]): string[] {
  const porId = new Map(recetas.map((r) => [r.id, r]));
  const errores: string[] = [];
  const comprobar = (donde: string, p: PlatoMenu, dia?: Dia, comida?: string, fuera = false, quienes: string[] = []) => {
    const ids = [p.receta, ...(p.segundo ? [p.segundo] : []), ...Object.values(p.variantes ?? {})];
    for (const id of ids) {
      const receta = porId.get(id);
      if (!receta) {
        errores.push(`${donde}: receta desconocida «${id}»`);
      } else if (dia && comida) {
        for (const aviso of incumpleNormas(familia, receta, dia, comida, fuera)) errores.push(`${donde}: ${aviso}`);
      }
    }
    // Platos no deseados: el principal lo comen quienes no tienen variante; cada variante, su dueño.
    const principales = quienes.filter((q) => !p.variantes?.[q]);
    const comen = new Map<string, string[]>([[p.receta, principales]]);
    if (p.segundo) comen.set(p.segundo, [...(comen.get(p.segundo) ?? []), ...principales]);
    for (const [q, r] of Object.entries(p.variantes ?? {})) comen.set(r, [...(comen.get(r) ?? []), q]);
    for (const [receta, personas] of comen) {
      const r = porId.get(receta);
      for (const sup of familia.supervision ?? []) {
        const ingrediente = r?.ingredientes.find((i) =>
          sup.ingredientes.some((palabra) => normalizar(i.nombre).includes(normalizar(palabra))),
        );
        if (ingrediente && personas.length && !personas.some((q) => sup.adultos.includes(q))) {
          errores.push(`${donde}: «${r!.nombre}» lleva ${ingrediente.nombre.toLowerCase()} y no come ${sup.adultos.join(" ni ")}: ${sup.motivo}`);
        }
      }
      for (const nd of familia.noDeseados ?? []) {
        if (nd.receta !== receta) continue;
        if (nd.por === "familia" || personas.includes(nd.por)) {
          errores.push(`${donde}: «${porId.get(receta)?.nombre ?? receta}» está marcado como no deseado por ${nd.por} (${nd.motivo})`);
        }
      }
    }
  };
  for (const [id, d] of Object.entries(familia.desayunos ?? {})) comprobar(`Desayuno de ${id}`, d);
  for (const dia of planificarSemana(familia)) {
    for (const comida of dia.comidas) {
      if (comida.tipo === "desayuno" && familia.desayunos && !menu.dias[dia.dia]?.desayuno) {
        for (const c of comida.comensales) {
          if (!familia.desayunos[c.id]) errores.push(`${dia.nombre} desayuno: falta el desayuno de ${c.id}`);
        }
        for (const t of comida.tuppers) errores.push(`${dia.nombre}: tupper inesperado de ${t.id}`);
        continue;
      }
      const plato = menu.dias[dia.dia]?.[comida.tipo];
      if (!plato) errores.push(`${dia.nombre} ${comida.tipo}: falta el plato`);
      else comprobar(`${dia.nombre} ${comida.tipo}`, plato, dia.dia, comida.tipo, comida.tipo === "almuerzo", comida.comensales.map((c) => c.id));
      for (const t of comida.tuppers) {
        const tupper = menu.tuppers[dia.dia]?.[t.id];
        if (!tupper) errores.push(`${dia.nombre}: falta el tupper de ${t.id}`);
        else comprobar(`${dia.nombre} tupper ${t.id}`, tupper, dia.dia, "comida", true, [t.id]);
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

  const raciones = (r: Receta, comensales: { factorRacion: number }[]) =>
    redondear2(r.racionFija ? comensales.length : comensales.reduce((s, c) => s + c.factorRacion, 0));

  /** Desayunos habituales: un plato por receta con quienes la toman. */
  const desayunosHabituales = (comensales: Racion["comensales"]): Racion[] => {
    const porReceta = new Map<string, Racion["comensales"]>();
    for (const c of comensales) {
      const id = familia.desayunos![c.id]?.receta;
      if (id) porReceta.set(id, [...(porReceta.get(id) ?? []), c]);
    }
    return [...porReceta].map(([id, cs]) => ({
      receta: receta(id),
      comensales: cs,
      raciones: raciones(receta(id), cs),
      nota: cs.length === 1 ? familia.desayunos![cs[0].id].nota : undefined,
    }));
  };

  const segundo = (p: PlatoMenu, comensales: { factorRacion: number }[]) =>
    p.segundo ? { receta: receta(p.segundo), raciones: raciones(receta(p.segundo), comensales) } : undefined;

  return planificarSemana(familia).map((dia) => ({
    dia: dia.dia,
    nombre: dia.nombre,
    comidas: dia.comidas.map((comida): ComidaDelMenu => {
      const plato = menu.dias[dia.dia]?.[comida.tipo];
      const platos: Racion[] = [];
      if (comida.tipo === "desayuno" && familia.desayunos && !plato) {
        platos.push(...desayunosHabituales(comida.comensales));
      } else if (plato) {
        const variantes = plato.variantes ?? {};
        const principal = comida.comensales.filter((c) => !variantes[c.id]);
        platos.push({
          receta: receta(plato.receta),
          comensales: principal,
          raciones: raciones(receta(plato.receta), principal),
          prepara: plato.prepara,
          sobrasDe: plato.sobrasDe,
          segundo: segundo(plato, principal),
        });
        for (const [id, variante] of Object.entries(variantes)) {
          const comensal = comida.comensales.find((c) => c.id === id);
          if (!comensal) continue;
          platos.push({ receta: receta(variante), comensales: [comensal], raciones: raciones(receta(variante), [comensal]) });
        }
      }
      const tuppers = comida.tuppers.flatMap((t) => {
        const tupper = menu.tuppers[dia.dia]?.[t.id];
        if (!tupper) return [];
        return [{
          receta: receta(tupper.receta),
          comensales: [t],
          raciones: raciones(receta(tupper.receta), [t]),
          prepara: tupper.prepara,
          sobrasDe: tupper.sobrasDe,
          segundo: segundo(tupper, [t]),
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
  /** Siempre «g» salvo productos sin equivalencia en gramos (data/equivalencias.json). */
  unidad: string;
  cantidad: number;
  enDespensa: number;
  comprar: number;
  recetas: string[];
  /** Equivalencia aproximada de lo que hay que comprar (p. ej. «22 ud»). */
  equivalencia?: string;
}

/** Cantidad en gramos si se puede convertir; si no, la deja como está. */
export function normalizarCantidad(nombre: string, cantidad: number, unidad: string): { cantidad: number; unidad: string } {
  const g = aGramos(nombre, cantidad, unidad);
  return g === undefined ? { cantidad, unidad } : { cantidad: g, unidad: "g" };
}

/** Redondea hacia arriba a una cantidad razonable para comprar (piezas enteras si se venden por unidades). */
export function redondearCompra(cantidad: number, unidad: string, nombre = ""): number {
  if (cantidad <= 0.0001) return 0;
  const porPieza = unidad === "g" ? gramosPorUnidad(nombre) : undefined;
  if (porPieza) return Math.ceil(cantidad / porPieza - 1e-9) * porPieza;
  if (unidad === "g" || unidad === "ml") {
    const paso = cantidad > 500 ? 50 : 10;
    return Math.ceil(cantidad / paso) * paso;
  }
  return Math.ceil(cantidad);
}

/** Hasta cuándo aguanta una reserva: nevera 3 días, congelador 3 meses. */
export function caducidadReserva(fecha: string, ubicacion?: "nevera" | "congelador"): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  if (ubicacion === "congelador") d.setUTCMonth(d.getUTCMonth() + 3);
  else d.setUTCDate(d.getUTCDate() + 3);
  return d.toISOString().slice(0, 10);
}

/** Raciones ya cocinadas y guardadas (nevera o congelador), por receta. */
export function reservasPorReceta(despensa?: Despensa): Map<string, number> {
  const reservas = new Map<string, number>();
  for (const s of despensa?.sobras ?? []) {
    if (s.receta && s.raciones > 0) reservas.set(s.receta, (reservas.get(s.receta) ?? 0) + s.raciones);
  }
  return reservas;
}

/** Suma los ingredientes de todas las raciones de la semana y descuenta la despensa. */
export function listaCompra(dias: DiaDelMenu[], despensa?: Despensa): Record<Seccion, LineaCompra[]> {
  const acumulado = new Map<string, LineaCompra & { seccion: Seccion }>();
  const todas = dias
    .flatMap((d) => d.comidas.flatMap((c) => [...c.platos, ...c.tuppers]))
    .flatMap((r) => [
      { receta: r.receta, raciones: r.raciones, personas: r.comensales.length },
      ...(r.segundo ? [{ ...r.segundo, personas: r.comensales.length }] : []),
    ]);
  const reservas = reservasPorReceta(despensa);
  for (const { receta, raciones: pedidas, personas } of todas) {
    // Las raciones que ya están hechas (reserva) no se vuelven a comprar.
    const deReserva = Math.min(reservas.get(receta.id) ?? 0, pedidas);
    if (deReserva > 0) reservas.set(receta.id, (reservas.get(receta.id) ?? 0) - deReserva);
    const raciones = pedidas - deReserva;
    if (raciones <= 0) continue;
    for (const ing of receta.ingredientes) {
      const cant = normalizarCantidad(ing.nombre, ing.cantidad, ing.unidad);
      const clave = `${ing.nombre.toLowerCase()}|${cant.unidad}`;
      const linea = acumulado.get(clave) ?? {
        nombre: ing.nombre, unidad: cant.unidad, seccion: ing.seccion,
        cantidad: 0, enDespensa: 0, comprar: 0, recetas: [],
      };
      linea.cantidad += cant.cantidad * (ing.porPersona ? (personas * raciones) / pedidas : raciones);
      if (!linea.recetas.includes(receta.nombre)) linea.recetas.push(receta.nombre);
      acumulado.set(clave, linea);
    }
  }

  const lista = Object.fromEntries(SECCIONES.map((s) => [s, [] as LineaCompra[]])) as Record<Seccion, LineaCompra[]>;
  for (const { seccion, ...linea } of acumulado.values()) {
    // Lo que hay en casa, en la misma unidad (los gramos suman aunque se apuntaran en ud o ml).
    linea.enDespensa = redondear2((despensa?.productos ?? [])
      .filter((p) => p.nombre.toLowerCase() === linea.nombre.toLowerCase())
      .map((p) => normalizarCantidad(p.nombre, p.cantidad, p.unidad))
      .filter((p) => p.unidad === linea.unidad)
      .reduce((s, p) => s + p.cantidad, 0));
    linea.comprar = redondearCompra(linea.cantidad - linea.enDespensa, linea.unidad, linea.nombre);
    linea.cantidad = redondear2(linea.cantidad);
    const eq = linea.unidad === "g" ? equivalencia(linea.nombre, linea.comprar) : "";
    if (eq) linea.equivalencia = eq;
    lista[seccion].push(linea);
  }
  for (const s of SECCIONES) lista[s].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return lista;
}


/**
 * Menú tal como se enseña (web y PDF): quita los desayunos fijos de quien no quiere
 * verlos. La lista de la compra se calcula con el menú completo.
 */
export function menuVisible(familia: Familia, dias: DiaDelMenu[]): DiaDelMenu[] {
  const visible = (id: string) => familia.desayunos?.[id]?.mostrarEnMenu === true || !familia.desayunos?.[id];
  return dias.map((d) => ({
    ...d,
    comidas: d.comidas
      .map((c) =>
        c.tipo !== "desayuno"
          ? c
          : {
              ...c,
              platos: c.platos
                .map((p) => ({ ...p, comensales: p.comensales.filter((x) => visible(x.id)) }))
                .filter((p) => p.comensales.length > 0),
            },
      )
      .filter((c) => c.tipo !== "desayuno" || c.platos.length > 0),
  }));
}
