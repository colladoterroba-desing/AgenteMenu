// Menú mensual (decisión del 19/10/2026): una vista aparte con las comidas y cenas de lunes a viernes de cada mes.
// No sustituye al menú semanal: reutiliza sus recetas y su forma de calcular comensales y raciones.
import { componerMenu, normalizarCantidad, type MenuSemana, type Receta } from "./menu.js";
import { DIAS, NOMBRE_DIA, type Dia, type Familia } from "./tipos.js";

/** Un mes preparado a mano (data/menus-mensuales/AAAA-MM.json): varias semanas, de las que cuentan los días del mes. */
export interface MenuMensual {
  /** AAAA-MM. */
  mes: string;
  descripcion?: string;
  semanas: MenuSemana[];
}

export interface TarjetaMensual {
  receta: string;
  nombre: string;
  /** Quiénes lo comen (siglas). */
  quien: string[];
  raciones: number;
  /** Peso de los ingredientes de una ración, en gramos. */
  gramosRacion: number;
  /** casa: plato de la mesa · variante: otro plato para una persona · frio / calor: tupper para llevar. */
  tipo: "casa" | "variante" | "frio" | "calor";
  prepara?: string;
}

export interface DiaMensual {
  /** AAAA-MM-DD. */
  fecha: string;
  dia: Dia;
  nombre: string;
  comida: TarjetaMensual[];
  cena: TarjetaMensual[];
}

export interface MesMenu {
  mes: string;
  /** «Oct 26». */
  etiqueta: string;
  descripcion?: string;
  /** «archivo» si está preparado a mano para el mes; «semanas» si se compone con los menús semanales. */
  origen: "archivo" | "semanas";
  dias: DiaMensual[];
}

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const LABORABLES: Dia[] = ["L", "M", "X", "J", "V"];

/** «2026-10» → «Oct 26». */
export const etiquetaMes = (mes: string) => `${MESES_CORTOS[Number(mes.slice(5, 7)) - 1]} ${mes.slice(2, 4)}`;

/** Fecha (AAAA-MM-DD) del día `dia` de la semana que empieza el lunes `lunes`. */
export function fechaDelDia(lunes: string, dia: Dia): string {
  const d = new Date(`${lunes}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + DIAS.indexOf(dia));
  return d.toISOString().slice(0, 10);
}

const gramosDeUnaRacion = (r: Receta) =>
  Math.round(r.ingredientes.reduce((s, i) => s + normalizarCantidad(i.nombre, i.cantidad, i.unidad).cantidad, 0));

/** Días de lunes a viernes de una semana, con las tarjetas de la comida y la cena (los desayunos, almuerzos y meriendas no salen). */
export function diasDeLaSemana(familia: Familia, recetas: Receta[], menu: MenuSemana): DiaMensual[] {
  if (!menu.inicio) return [];
  const porId = new Map(recetas.map((r) => [r.id, r]));
  const tarjeta = (id: string, quien: string[], raciones: number, tipo: TarjetaMensual["tipo"], prepara?: string): TarjetaMensual => ({
    receta: id, nombre: porId.get(id)?.nombre ?? id, quien, raciones, gramosRacion: gramosDeUnaRacion(porId.get(id)!), tipo, ...(prepara ? { prepara } : {}),
  });
  return componerMenu(familia, menu, recetas)
    .filter((d) => LABORABLES.includes(d.dia))
    .map((d) => {
      const tarjetas = (tipo: "comida" | "cena"): TarjetaMensual[] => {
        const c = d.comidas.find((x) => x.tipo === tipo);
        if (!c) return [];
        const [principal, ...variantes] = c.platos;
        return [
          ...(principal ? [
            tarjeta(principal.receta.id, principal.comensales.map((x) => x.id), principal.raciones, "casa", principal.prepara),
            ...(principal.segundo ? [tarjeta(principal.segundo.receta.id, principal.comensales.map((x) => x.id), principal.segundo.raciones, "casa")] : []),
          ] : []),
          ...variantes.map((v) => tarjeta(v.receta.id, v.comensales.map((x) => x.id), v.raciones, "variante")),
          ...c.tuppers.flatMap((t) => {
            const tipoTupper = t.tipoTupper === "frío" ? "frio" : "calor";
            return [
              tarjeta(t.receta.id, [t.para], t.raciones, tipoTupper, t.prepara),
              ...(t.segundo ? [tarjeta(t.segundo.receta.id, [t.para], t.segundo.raciones, tipoTupper)] : []),
            ];
          }),
        ];
      };
      return { fecha: fechaDelDia(menu.inicio!, d.dia), dia: d.dia, nombre: NOMBRE_DIA[d.dia], comida: tarjetas("comida"), cena: tarjetas("cena") };
    });
}

/**
 * Meses que se pueden elegir en la página, de más antiguo a más reciente:
 * - los que tienen su propio fichero (`archivos`), con los días de ese mes;
 * - los demás, desde el mes de `hoy`, compuestos con los menús semanales que cubren sus días.
 * Si un mes tiene fichero, manda el fichero.
 */
export function construirMeses(
  familia: Familia,
  recetas: Receta[],
  { archivos, semanas, hoy }: { archivos: MenuMensual[]; semanas: MenuSemana[]; hoy: string },
): MesMenu[] {
  const delMes = (dias: DiaMensual[], mes: string) => dias.filter((d) => d.fecha.startsWith(mes)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const meses = new Map<string, MesMenu>();
  for (const a of archivos) {
    const dias = delMes(a.semanas.flatMap((s) => diasDeLaSemana(familia, recetas, s)), a.mes);
    meses.set(a.mes, { mes: a.mes, etiqueta: etiquetaMes(a.mes), descripcion: a.descripcion, origen: "archivo", dias });
  }
  const deSemanas = new Map<string, DiaMensual[]>();
  for (const s of semanas) {
    for (const d of diasDeLaSemana(familia, recetas, s)) {
      const mes = d.fecha.slice(0, 7);
      if (meses.has(mes) || mes < hoy.slice(0, 7)) continue;
      deSemanas.set(mes, [...(deSemanas.get(mes) ?? []), d]);
    }
  }
  for (const [mes, dias] of deSemanas) {
    // Una misma fecha puede estar en dos ficheros (semana en curso e historial): se queda la primera.
    const unicos = [...new Map(dias.map((d) => [d.fecha, d])).values()];
    meses.set(mes, { mes, etiqueta: etiquetaMes(mes), origen: "semanas", dias: delMes(unicos, mes) });
  }
  return [...meses.values()].filter((m) => m.dias.length).sort((a, b) => a.mes.localeCompare(b.mes));
}
