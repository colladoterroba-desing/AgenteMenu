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

test("tuppers de oficina: RFA frío y CCT para recalentar de lunes a miércoles", () => {
  const semana = planificarSemana(familia);
  for (const dia of semana) {
    const tuppers = dia.comidas.find((c) => c.tipo === "comida")!.tuppers;
    if (["L", "M", "X"].includes(dia.dia)) {
      assert.deepEqual(tuppers.map((t) => [t.id, t.tipo]), [["RFA", "frío"], ["CCT", "para recalentar"]]);
    } else {
      assert.equal(tuppers.length, 0);
    }
  }
});

test("el menú de ejemplo usa recetas existentes y cubre todas las comidas y tuppers", async () => {
  const { validarMenu } = await import("../src/menu.js");
  const menu = JSON.parse(await readFile("data/menu-semana.json", "utf8"));
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  assert.deepEqual(validarMenu(familia, menu, recetas), []);
});

test("las variantes sacan al comensal del plato principal y la compra suma todas las raciones", async () => {
  const { componerMenu, listaCompra } = await import("../src/menu.js");
  const menu = JSON.parse(await readFile("data/menu-semana.json", "utf8"));
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  const dias = componerMenu(familia, menu, recetas);
  const cenaMiercoles = dias[2].comidas.find((c) => c.tipo === "cena")!;
  assert.deepEqual(cenaMiercoles.platos.map((p) => [p.receta.id, p.comensales.map((c) => c.id)]), [
    ["merluza-plancha-brocoli", ["CCT", "RFC", "AFC"]],
    ["tortilla-francesa-brocoli", ["RFA"]],
  ]);
  // Albóndigas: 4 comensales de la cena del lunes + tupper de CCT del martes.
  const pavo = listaCompra(dias).Carnicería.find((l) => l.nombre === "Carne picada de pavo")!;
  assert.ok(Math.abs(pavo.cantidad - 130 * (1.17 + 1.01 + 1.23 + 1.12 + 1.01)) < 1);
  // Salmón: solo la comida del jueves (CCT, RFC y AFC).
  const salmon = listaCompra(dias).Pescadería.find((l) => l.nombre === "Lomo de salmón")!;
  const esperado = 130 * (1.01 + 1.23 + 1.12);
  assert.ok(Math.abs(salmon.cantidad - esperado) < 1);
  assert.ok(salmon.comprar >= salmon.cantidad);
});

test("la despensa se descuenta de la lista de la compra", async () => {
  const { componerMenu, listaCompra } = await import("../src/menu.js");
  const menu = JSON.parse(await readFile("data/menu-semana.json", "utf8"));
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  const dias = componerMenu(familia, menu, recetas);
  const sin = listaCompra(dias).Despensa.find((l) => l.nombre === "Lentejas pardinas")!;
  const con = listaCompra(dias, {
    productos: [{ nombre: "lentejas pardinas", cantidad: 1000, unidad: "g" }], sobras: [],
  }).Despensa.find((l) => l.nombre === "Lentejas pardinas")!;
  assert.ok(sin.comprar > 0);
  assert.equal(con.comprar, 0);
});

test("la leche de todas las recetas es semidesnatada", async () => {
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  const leches = recetas.flatMap((r: { ingredientes: { nombre: string }[] }) => r.ingredientes)
    .filter((i: { nombre: string }) => /^leche/i.test(i.nombre));
  assert.ok(leches.length > 0);
  for (const l of leches) assert.equal(l.nombre, "Leche semidesnatada");
});

test("desayunos habituales por persona, con ración fija, y almuerzo de RFC entre semana", async () => {
  const { componerMenu, listaCompra } = await import("../src/menu.js");
  const menu = JSON.parse(await readFile("data/menu-semana.json", "utf8"));
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  const dias = componerMenu(familia, menu, recetas);
  for (const dia of dias) {
    const desayuno = dia.comidas.find((c) => c.tipo === "desayuno")!;
    assert.deepEqual(
      Object.fromEntries(desayuno.platos.map((p) => [p.comensales[0].id, p.receta.id])),
      { RFA: "desayuno-rfa", CCT: "desayuno-cct", RFC: "cafe-solo", AFC: "desayuno-afc" },
    );
    const almuerzo = dia.comidas.find((c) => c.tipo === "almuerzo");
    assert.equal(Boolean(almuerzo), !["S", "D"].includes(dia.dia));
    if (almuerzo) assert.deepEqual(almuerzo.platos[0].comensales.map((c) => c.id), ["RFC"]);
  }
  // 8 galletas al día, 7 días: sin escalar por el factor de ración de AFC.
  const galletas = listaCompra(dias).Despensa.find((l) => l.nombre.startsWith("Galletas"))!;
  assert.equal(galletas.cantidad, 56);
});

test("solo CCT puede validar el menú y cualquier cambio lo devuelve a borrador", async () => {
  const almacen = await almacenTemporal();
  const { ejecutar } = crearHerramientas(almacen);
  const noPermitido = await ejecutar("validar_menu", { por: "RFA", fecha: "2026-09-28" });
  assert.equal(noPermitido.error, true);
  assert.match(noPermitido.contenido, /Solo CCT/);
  assert.equal((await almacen.menu()).estado, "borrador");

  const ok = await ejecutar("validar_menu", { por: "CCT", fecha: "2026-09-28" });
  assert.equal(ok.error, false);
  const validado = await almacen.menu();
  assert.equal(validado.estado, "validado");
  assert.deepEqual(validado.validacion, { por: "CCT", fecha: "2026-09-28" });

  const { estado: _e, validacion: _v, cambios: _c, ...datos } = validado;
  const cambio = await ejecutar("guardar_menu", {
    ...datos, autor: "CCT", fecha: "2026-09-29", descripcionCambio: "Cambio la cena del jueves",
  });
  assert.equal(cambio.error, false, cambio.contenido);
  const tras = await almacen.menu();
  assert.equal(tras.estado, "borrador");
  assert.equal(tras.validacion, undefined);
  assert.equal(tras.cambios!.at(-1)!.por, "CCT");
});

test("normas de la casa: pescado azul solo el jueves a mediodía y nada «al momento» para llevar", async () => {
  const { validarMenu } = await import("../src/menu.js");
  const menu = JSON.parse(await readFile("data/menu-semana.json", "utf8"));
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));

  const salmonEnCena = structuredClone(menu);
  salmonEnCena.dias.L.cena = { receta: "salmon-horno-patata" };
  assert.ok(validarMenu(familia, salmonEnCena, recetas).some((e) => /salmón/.test(e) && /jueves/.test(e)));

  const atunEnAlmuerzo = structuredClone(menu);
  atunEnAlmuerzo.dias.M.almuerzo = { receta: "almuerzo-bocadillo-atun" };
  assert.ok(validarMenu(familia, atunEnAlmuerzo, recetas).some((e) => /atún/.test(e)));

  const tortillaEnTupper = structuredClone(menu);
  tortillaEnTupper.tuppers.L.CCT = { receta: "tortilla-francesa-brocoli" };
  assert.ok(validarMenu(familia, tortillaEnTupper, recetas).some((e) => /al momento/.test(e)));

  // En casa, a la hora de cenar, la tortilla francesa sí vale.
  const tortillaEnCena = structuredClone(menu);
  tortillaEnCena.dias.X.cena = { receta: "tortilla-francesa-brocoli" };
  assert.deepEqual(validarMenu(familia, tortillaEnCena, recetas), []);
});

test("los desayunos fijos ocultos no salen en el menú pero sí en la compra; PDF en su orientación", async () => {
  const { componerMenu, listaCompra, menuVisible } = await import("../src/menu.js");
  const { htmlMenuPdf, htmlCompraPdf } = await import("../src/pdf.js");
  const menu = JSON.parse(await readFile("data/menu-semana.json", "utf8"));
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  const dias = componerMenu(familia, menu, recetas);
  assert.ok(menuVisible(familia, dias).every((d) => !d.comidas.some((c) => c.tipo === "desayuno")));
  assert.ok(listaCompra(dias).Despensa.some((l) => l.nombre.startsWith("Galletas")));

  const conAfc = structuredClone(familia);
  conAfc.desayunos!.AFC.mostrarEnMenu = true;
  const desayuno = menuVisible(conAfc, dias)[0].comidas.find((c) => c.tipo === "desayuno")!;
  assert.deepEqual(desayuno.platos.flatMap((p) => p.comensales.map((c) => c.id)), ["AFC"]);

  const datos = { familia, menu, recetas, fecha: "28 de septiembre de 2026" };
  assert.match(htmlMenuPdf(datos), /size:A4 landscape/);
  assert.match(htmlCompraPdf(datos), /size:A4 portrait/);
  assert.doesNotMatch(htmlMenuPdf(datos), /Nesquik/);
});
