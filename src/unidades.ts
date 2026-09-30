import { readFileSync } from "node:fs";

/** Tabla de equivalencias a gramos (data/equivalencias.json). */
export interface Equivalencias {
  nota?: string;
  /** Gramos que pesa una unidad de cada producto. */
  porUnidad: Record<string, number>;
  /** Gramos por mililitro de los líquidos (si no está, 1 g/ml). */
  densidad: Record<string, number>;
  /** Medidas caseras para la página de Definiciones: [medida, gramos]. */
  medidasCaseras?: [string, string][];
}

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const EQUIVALENCIAS: Equivalencias = JSON.parse(
  readFileSync(new URL("../data/equivalencias.json", import.meta.url), "utf8"),
);

const buscar = (tabla: Record<string, number>, nombre: string) =>
  Object.entries(tabla).find(([k]) => normalizar(k) === normalizar(nombre))?.[1];

/** Gramos por unidad de un producto, si se conoce. */
export const gramosPorUnidad = (nombre: string, eq = EQUIVALENCIAS) => buscar(eq.porUnidad, nombre);
/** Gramos por ml de un líquido (1 si no está en la tabla). */
export const densidad = (nombre: string, eq = EQUIVALENCIAS) => buscar(eq.densidad, nombre) ?? 1;

/**
 * Pasa una cantidad a gramos. Acepta g, kg, ml, l y ud (esta última solo si el
 * producto está en la tabla porUnidad). Devuelve undefined si no se puede.
 */
export function aGramos(nombre: string, cantidad: number, unidad: string, eq = EQUIVALENCIAS): number | undefined {
  switch (unidad) {
    case "g": return cantidad;
    case "kg": return cantidad * 1000;
    case "ml": return cantidad * densidad(nombre, eq);
    case "l": return cantidad * 1000 * densidad(nombre, eq);
    case "ud": {
      const g = gramosPorUnidad(nombre, eq);
      return g === undefined ? undefined : cantidad * g;
    }
    default: return undefined;
  }
}

/** Como aGramos, pero lanza un error claro si falta la equivalencia. */
export function aGramosObligatorio(nombre: string, cantidad: number, unidad: string, eq = EQUIVALENCIAS): number {
  const g = aGramos(nombre, cantidad, unidad, eq);
  if (g === undefined) {
    throw new Error(`No sé cuántos gramos pesa 1 ${unidad} de «${nombre}». Añádelo a data/equivalencias.json (porUnidad).`);
  }
  return Math.round(g * 10) / 10;
}

/** Equivalencia aproximada para mostrar junto a los gramos: «≈2 ud» o «≈250 ml». */
export function equivalencia(nombre: string, gramos: number, eq = EQUIVALENCIAS): string {
  if (!gramos) return "";
  const gu = gramosPorUnidad(nombre, eq);
  if (gu) {
    const ud = gramos / gu;
    const txt = Math.abs(ud - Math.round(ud)) < 0.05 ? String(Math.round(ud)) : ud.toLocaleString("es-ES", { maximumFractionDigits: 1 });
    return `${txt} ud`;
  }
  const d = buscar(eq.densidad, nombre);
  if (d) return `${String(Math.round(gramos / d)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ml`;
  return "";
}
