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
}

export interface CambioMenu {
  por: string;
  fecha: string;
  descripcion: string;
}

export interface MenuSemana {
  semana: string;
  /** Un menú nuevo o modificado es borrador hasta que lo valida quien tiene permiso. */
  estado?: "borrador" | "validado";
  validacion?: { por: string; fecha: string };
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
  const todas = dias
    .flatMap((d) => d.comidas.flatMap((c) => [...c.platos, ...c.tuppers]))
    .flatMap((r) => [
      { receta: r.receta, raciones: r.raciones, personas: r.comensales.length },
      ...(r.segundo ? [{ ...r.segundo, personas: r.comensales.length }] : []),
    ]);
  for (const { receta, raciones, personas } of todas) {
    for (const ing of receta.ingredientes) {
      const clave = `${ing.nombre.toLowerCase()}|${ing.unidad}`;
      const linea = acumulado.get(clave) ?? {
        nombre: ing.nombre, unidad: ing.unidad, seccion: ing.seccion,
        cantidad: 0, enDespensa: 0, comprar: 0, recetas: [],
      };
      linea.cantidad += ing.cantidad * (ing.porPersona ? personas : raciones);
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


/** Quién puede validar menús (por defecto, nadie: hay que configurarlo). */
export const validadoresMenu = (familia: Familia) => familia.permisos?.validarMenu ?? [];

/** Marca el menú como validado. Solo lo permite a quien tenga permiso. */
export function validarPublicacion(familia: Familia, menu: MenuSemana, por: string, fecha: string): MenuSemana {
  const validadores = validadoresMenu(familia);
  if (!validadores.includes(por)) {
    throw new Error(`Solo ${validadores.join(", ") || "(nadie configurado)"} puede validar y publicar el menú; ${por} no.`);
  }
  return { ...menu, estado: "validado", validacion: { por, fecha } };
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
