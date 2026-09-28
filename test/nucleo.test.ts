import assert from "node:assert/strict";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Almacen, resumirHabitos } from "../src/almacen.js";
import { crearHerramientas } from "../src/herramientas.js";
import { calcularNecesidades, clasificarImc, imc, proponerObjetivo } from "../src/nutricion.js";
import { planificarSemana } from "../src/planificacion.js";
import type { Familia } from "../src/tipos.js";

const familia: Familia = JSON.parse(await readFile("data/familia.json", "utf8"));
const miembro = (id: string) => familia.miembros.find((m) => m.id === id)!;

test("IMC y clasificación de la familia", () => {
  assert.equal(Math.round(imc(miembro("RFA")) * 10) / 10, 26.8);
  assert.equal(clasificarImc(miembro("RFA")), "sobrepeso");
  assert.equal(clasificarImc(miembro("CCT")), "sobrepeso");
  assert.equal(clasificarImc(miembro("RFC")), "normopeso");
  assert.equal(clasificarImc(miembro("AFC")), "menor: valorar con percentiles");
});

test("propuesta de objetivo solo para adultos con sobrepeso", () => {
  const rfa = proponerObjetivo(miembro("RFA"))!;
  assert.equal(rfa.pesoObjetivoKg, 67.8);
  assert.equal(rfa.semanas, 11);
  assert.equal(proponerObjetivo(miembro("RFC")), null);
  assert.equal(proponerObjetivo(miembro("AFC")), null);
});

test("el déficit nunca baja de la tasa metabólica basal", () => {
  for (const m of familia.miembros) {
    const n = calcularNecesidades(m);
    if (n.propuestaObjetivo) assert.ok(n.propuestaObjetivo.kcalDiarias >= n.tmb);
  }
});

test("rejilla semanal respeta el régimen de comidas", () => {
  const semana = planificarSemana(familia);
  const lunes = semana[0];
  const comida = lunes.comidas.find((c) => c.tipo === "comida")!;
  assert.deepEqual(comida.comensales.map((c) => c.id), ["RFC", "AFC"]);
  assert.deepEqual(comida.comenFuera, ["RFA", "CCT"]);
  assert.match(comida.cocina, /plancha/);
  const juevesComida = semana[3].comidas.find((c) => c.tipo === "comida")!;
  assert.match(juevesComida.cocina, /^CCT/);
  // Merienda solo de lunes a viernes.
  assert.ok(semana[4].comidas.some((c) => c.tipo === "merienda"));
  assert.ok(!semana[5].comidas.some((c) => c.tipo === "merienda"));
  for (const dia of semana) assert.equal(dia.comidas.find((c) => c.tipo === "cena")!.comensales.length, 4);
});

async function almacenTemporal() {
  const dir = await mkdtemp(path.join(tmpdir(), "agente-menu-"));
  await cp("data", path.join(dir, "data"), { recursive: true });
  return new Almacen(path.join(dir, "data"));
}

test("despensa: añadir, consumir y eliminar al llegar a cero", async () => {
  const almacen = await almacenTemporal();
  await almacen.ajustarProductos([{ nombre: "Lentejas", cantidad: 1000, unidad: "g" }]);
  let despensa = await almacen.ajustarProductos([{ nombre: "lentejas", cantidad: -400, unidad: "g" }]);
  assert.equal(despensa.productos[0].cantidad, 600);
  despensa = await almacen.ajustarProductos([{ nombre: "Lentejas", cantidad: -600, unidad: "g" }]);
  assert.equal(despensa.productos.length, 0);
});

test("herramientas validan la entrada y protegen datos sensibles", async () => {
  const { ejecutar, definiciones } = crearHerramientas(await almacenTemporal());
  assert.ok(definiciones.every((d) => d.input_schema.type === "object"));
  const menor = await ejecutar("guardar_objetivo", {
    id: "AFC", pesoObjetivoKg: 48, kcalDiarias: 1800, semanas: 8, fechaInicio: "2026-09-28",
  });
  assert.equal(menor.error, true);
  const ruta = await ejecutar("guardar_documento", { nombre: "../../fuera.md", contenido: "x" });
  assert.equal(ruta.error, true);
  const invalida = await ejecutar("registrar_sobra", { descripcion: "Lentejas" });
  assert.equal(invalida.error, true);
});

test("resumen de hábitos de compra", () => {
  const resumen = resumirHabitos([
    { fecha: "2026-09-20", tienda: "Mercado", total: 10, lineas: [
      { producto: "Leche", cantidad: 6, unidad: "l", precio: 6, categoria: "lácteos" },
      { producto: "Plátanos", cantidad: 1, unidad: "kg", precio: 4, categoria: "fruta" },
    ] },
    { fecha: "2026-09-27", tienda: "Mercado", total: 6, lineas: [
      { producto: "leche", cantidad: 6, unidad: "l", precio: 6, categoria: "lácteos" },
    ] },
  ]);
  assert.equal(resumen.gastoTotal, 16);
  assert.equal(resumen.gastoPorCategoria["lácteos"], 12);
  assert.equal(resumen.productosMasComprados[0].veces, 2);
});
