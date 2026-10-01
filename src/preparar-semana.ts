// Preparar la semana siguiente sin la API (OI-14). Lo usa la tarea programada de cada lunes
// (.claude/skills/preparar-semana/SKILL.md): Claude escribe el borrador y este programa lo comprueba y lo guarda.
//   npm run preparar-semana                    → rota las semanas si toca y dice qué semana falta preparar
//   npm run preparar-semana -- borrador.json   → comprueba el borrador con las normas de la casa y lo guarda
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Almacen, hoyIso } from "./almacen.js";
import { validarMenu, type MenuSemana } from "./menu.js";

/** Lunes (AAAA-MM-DD) que va `semanas` después del lunes `inicio`. */
export function lunesSiguiente(inicio: string, semanas = 1): string {
  const [y, m, d] = inicio.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + 7 * semanas));
  return f.toISOString().slice(0, 10);
}

/** Qué semana siguiente toca preparar: el lunes después de la semana en curso y la letra contraria (los tuppers rotan A/B). */
export function semanaQueFalta(actual: MenuSemana, siguiente?: MenuSemana): { inicio: string; semana: string } | null {
  if (!actual.inicio) return null;
  const inicio = lunesSiguiente(actual.inicio);
  if (siguiente?.inicio === inicio) return null;
  return { inicio, semana: actual.semana === "A" ? "B" : "A" };
}

async function main() {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const almacen = new Almacen(path.join(raiz, "data"));
  const rotada = await almacen.rotarSemanas();
  if (rotada) console.log(`Rotación: la semana ${rotada.semana} (${rotada.inicio}) pasa a ser la semana en curso; la anterior se guarda en data/historial/.`);
  const actual = await almacen.menu();
  const siguiente = await almacen.menu(true).catch(() => undefined);
  const falta = semanaQueFalta(actual, siguiente);
  const fichero = process.argv[2];

  if (!fichero) {
    console.log(`Semana en curso: ${actual.semana} (${actual.inicio}). Hoy: ${hoyIso()}.`);
    console.log(falta
      ? `FALTA preparar la semana siguiente: semana ${falta.semana}, inicio ${falta.inicio}.`
      : `La semana siguiente ya está preparada: ${siguiente!.semana} (${siguiente!.inicio}). No hay nada que hacer.`);
    return;
  }

  const borrador = JSON.parse(await readFile(path.resolve(fichero), "utf8")) as MenuSemana & { descripcion?: string };
  const [familia, recetas] = await Promise.all([almacen.familia(), almacen.recetas()]);
  const errores = validarMenu(familia, borrador, recetas);
  if (falta && (borrador.inicio !== falta.inicio || borrador.semana !== falta.semana)) {
    errores.unshift(`El borrador tiene que ser la semana ${falta.semana} con inicio ${falta.inicio} (tiene ${borrador.semana}, ${borrador.inicio}).`);
  }
  if (errores.length) {
    console.error(`No se guarda: el borrador no cumple las normas (${errores.length}):\n- ${errores.join("\n- ")}`);
    process.exit(1);
  }
  const { descripcion, ...menu } = borrador;
  await almacen.guardarMenu({
    ...menu,
    cambios: [{ por: "Claude (automático)", fecha: hoyIso(), descripcion: descripcion ?? `Propuesta de la semana ${menu.semana}` }],
  }, true);
  console.log(`Guardado data/menu-siguiente.json: semana ${menu.semana} (${menu.inicio}).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
