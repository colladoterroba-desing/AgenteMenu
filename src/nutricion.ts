import type { Miembro, Objetivo } from "./tipos.js";

/**
 * Cálculos nutricionales orientativos. No sustituyen el consejo de un
 * profesional sanitario; el agente lo recuerda siempre que propone objetivos.
 */

/** MET aproximados (Compendium of Physical Activities). */
const MET: Record<string, number> = {
  running: 9.8,
  yoga_funcional: 4.0,
  natacion: 7.0,
  futbol_entrenamiento: 7.0,
  futbol_partido: 8.0,
  educacion_fisica: 5.0,
};
const MET_POR_DEFECTO = 5.0;

/** Factor de actividad de la vida diaria sin contar el deporte. */
export const FACTOR_BASE = 1.4;
export const KCAL_REFERENCIA = 2000;
const IMC_OBJETIVO = 24.9;
export const PERDIDA_KG_SEMANA = 0.5;
const DEFICIT_MAXIMO_KCAL = 500;
/** Kcal que hay que dejar de comer para perder 1 kg de grasa (aproximado). */
export const KCAL_POR_KG = 7700;
/** Ritmo máximo de pérdida que se acepta al cambiar un objetivo desde la web. */
export const PERDIDA_MAXIMA_KG_SEMANA = 1;

export type ClasificacionImc =
  | "bajo peso"
  | "normopeso"
  | "sobrepeso"
  | "obesidad"
  | "menor: valorar con percentiles";

export const esAdulto = (m: Miembro) => m.edad >= 18;

export function imc(m: Miembro): number {
  const metros = m.alturaCm / 100;
  return m.pesoKg / (metros * metros);
}

export function clasificarImc(m: Miembro): ClasificacionImc {
  // Los umbrales de adulto no valen para menores: hacen falta tablas de percentiles.
  if (!esAdulto(m)) return "menor: valorar con percentiles";
  const valor = imc(m);
  if (valor < 18.5) return "bajo peso";
  if (valor < 25) return "normopeso";
  if (valor < 30) return "sobrepeso";
  return "obesidad";
}

/**
 * Tasa metabólica basal = porKg × peso + fija. Mifflin-St Jeor (adultos) o
 * Schofield (10-17 años). Por separado para recalcularla en la web al cambiar el peso.
 */
export function coeficientesTmb(m: Miembro): { porKg: number; fija: number } {
  if (esAdulto(m)) return { porKg: 10, fija: 6.25 * m.alturaCm - 5 * m.edad + (m.sexo === "V" ? 5 : -161) };
  return m.sexo === "V" ? { porKg: 17.686, fija: 658.2 } : { porKg: 13.384, fija: 692.6 };
}

export function tasaMetabolicaBasal(m: Miembro): number {
  const { porKg, fija } = coeficientesTmb(m);
  return porKg * m.pesoKg + fija;
}

/** Kcal diarias del deporte por cada kg de peso (el gasto del deporte es proporcional al peso). */
export function kcalDeportePorKg(m: Miembro): number {
  const semanales = m.actividades.reduce((total, a) => {
    const met = MET[a.deporte] ?? MET_POR_DEFECTO;
    const horas = (a.minutos / 60) * a.dias.length;
    return total + (met - 1) * horas;
  }, 0);
  return semanales / 7;
}

/** Kcal semanales del deporte por encima del reposo, repartidas por día. */
export function kcalDeporteDiarias(m: Miembro): number {
  return kcalDeportePorKg(m) * m.pesoKg;
}

export function gastoEnergeticoDiario(m: Miembro): number {
  return tasaMetabolicaBasal(m) * FACTOR_BASE + kcalDeporteDiarias(m);
}

export interface PropuestaObjetivo {
  pesoObjetivoKg: number;
  kcalDiarias: number;
  semanas: number;
}

/**
 * Propone un objetivo solo para adultos con IMC >= 25. El objetivo no se
 * aplica hasta que el usuario lo confirma (guardar_objetivo).
 */
export function proponerObjetivo(m: Miembro): PropuestaObjetivo | null {
  if (!esAdulto(m) || imc(m) < 25) return null;
  const metros = m.alturaCm / 100;
  const pesoObjetivoKg = Math.round(IMC_OBJETIVO * metros * metros * 10) / 10;
  const gasto = gastoEnergeticoDiario(m);
  const deficit = Math.min(DEFICIT_MAXIMO_KCAL, gasto * 0.2);
  // Nunca por debajo de la tasa metabólica basal.
  const kcalDiarias = Math.max(tasaMetabolicaBasal(m), gasto - deficit);
  const semanas = Math.ceil((m.pesoKg - pesoObjetivoKg) / PERDIDA_KG_SEMANA);
  return { pesoObjetivoKg, kcalDiarias: Math.round(kcalDiarias), semanas };
}

export interface Necesidades {
  id: string;
  imc: number;
  clasificacion: ClasificacionImc;
  tmb: number;
  gastoDiario: number;
  kcalObjetivo: number;
  /** Tamaño de ración relativo a un adulto de referencia de 2000 kcal. */
  factorRacion: number;
  objetivoActivo: Objetivo | null;
  propuestaObjetivo: PropuestaObjetivo | null;
  avisos: string[];
}

export function calcularNecesidades(m: Miembro, objetivo?: Objetivo): Necesidades {
  const gasto = gastoEnergeticoDiario(m);
  const kcalObjetivo = objetivo ? objetivo.kcalDiarias : Math.round(gasto);
  const avisos: string[] = [];
  if (!esAdulto(m)) {
    avisos.push(
      "Menor de edad: no se aplican restricciones calóricas. Cualquier duda sobre peso o crecimiento, con su pediatra.",
    );
  }
  const propuesta = objetivo ? null : proponerObjetivo(m);
  if (propuesta) {
    avisos.push(
      "IMC en sobrepeso: hay una propuesta de objetivo pendiente de acordar con el usuario. Recomendable consultarlo con su médico.",
    );
  }
  return {
    id: m.id,
    imc: Math.round(imc(m) * 10) / 10,
    clasificacion: clasificarImc(m),
    tmb: Math.round(tasaMetabolicaBasal(m)),
    gastoDiario: Math.round(gasto),
    kcalObjetivo,
    factorRacion: Math.round((kcalObjetivo / KCAL_REFERENCIA) * 100) / 100,
    objetivoActivo: objetivo ?? null,
    propuestaObjetivo: propuesta,
    avisos,
  };
}

/** Reparto de las kcal diarias entre comidas. */
export const REPARTO_LABORABLE = { desayuno: 0.2, almuerzo: 0, comida: 0.35, merienda: 0.15, cena: 0.3 };
export const REPARTO_FIN_DE_SEMANA = { desayuno: 0.25, almuerzo: 0, comida: 0.4, merienda: 0, cena: 0.35 };
/** Quien se lleva almuerzo desayuna poco: el almuerzo se queda con esta parte del desayuno. */
export const PARTE_DESAYUNO_PARA_ALMUERZO = 0.75;
