import { calcularNecesidades, REPARTO_FIN_DE_SEMANA, REPARTO_LABORABLE } from "./nutricion.js";
import { DIAS, NOMBRE_DIA, type Dia, type Familia } from "./tipos.js";

export type TipoComida = "desayuno" | "comida" | "merienda" | "cena";

export interface Comensal {
  id: string;
  kcal: number;
  factorRacion: number;
}

export interface ComidaPlanificada {
  tipo: TipoComida;
  comensales: Comensal[];
  /** Raciones totales en equivalentes de adulto de referencia (2000 kcal). */
  racionesEquivalentes: number;
  comenFuera: string[];
  /** Comensales de fuera que se llevan tupper preparado en casa. */
  tuppers: (Comensal & { tipo: "frío" | "para recalentar" })[];
  /** Quién puede cocinar esa comida y con qué limitaciones. */
  cocina: string;
}

export interface DiaPlanificado {
  dia: Dia;
  nombre: string;
  comidas: ComidaPlanificada[];
}

const LABORABLES: Dia[] = ["L", "M", "X", "J", "V"];
const COCINERA = "CCT";

function quienCocina(familia: Familia, presentes: string[]): string {
  if (presentes.includes(COCINERA)) return `${COCINERA} (${familia.roles[COCINERA]})`;
  const ayudantes = presentes
    .filter((id) => familia.roles[id])
    .map((id) => `${id}: ${familia.roles[id]}`);
  return `Sin ${COCINERA} en casa → plato a la plancha o preparado con antelación para recalentar (${ayudantes.join("; ")})`;
}

/**
 * Traduce el régimen de comidas de la familia en una rejilla semanal con los
 * comensales de cada comida y las kcal que le corresponden a cada uno.
 */
export function planificarSemana(familia: Familia): DiaPlanificado[] {
  const todos = familia.miembros.map((m) => m.id);
  const necesidades = new Map(
    familia.miembros.map((m) => [m.id, calcularNecesidades(m, familia.objetivos[m.id])]),
  );

  return DIAS.map((dia) => {
    const laborable = LABORABLES.includes(dia);
    const reparto = laborable ? REPARTO_LABORABLE : REPARTO_FIN_DE_SEMANA;
    const presentesPorComida: Record<TipoComida, string[]> = {
      desayuno: todos,
      comida: familia.regimen.comida[dia],
      merienda: laborable ? todos : [],
      cena: familia.regimen.cena[dia],
    };

    const comidas = (Object.keys(presentesPorComida) as TipoComida[])
      .filter((tipo) => presentesPorComida[tipo].length > 0)
      .map((tipo): ComidaPlanificada => {
        const presentes = presentesPorComida[tipo];
        const comensales = presentes.map((id) => {
          const n = necesidades.get(id)!;
          return { id, kcal: Math.round(n.kcalObjetivo * reparto[tipo]), factorRacion: n.factorRacion };
        });
        const racionesEquivalentes =
          Math.round(comensales.reduce((s, c) => s + c.factorRacion, 0) * 100) / 100;
        const comenFuera = todos.filter((id) => !presentes.includes(id));
        const tuppers =
          tipo === "comida"
            ? comenFuera.flatMap((id) => {
                const tupper = familia.regimen.tupper?.[id];
                if (!tupper?.dias.includes(dia)) return [];
                const n = necesidades.get(id)!;
                return [{ id, kcal: Math.round(n.kcalObjetivo * reparto.comida), factorRacion: n.factorRacion, tipo: tupper.tipo }];
              })
            : [];
        return {
          tipo,
          comensales,
          racionesEquivalentes,
          comenFuera,
          tuppers,
          cocina: quienCocina(familia, presentes),
        };
      });

    return { dia, nombre: NOMBRE_DIA[dia], comidas };
  });
}
