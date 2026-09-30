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
  assert.equal(clasificarImc(miembro("RFC")), "sobrepeso"); // 76 kg, 1,73 m: IMC 25,4
  assert.equal(clasificarImc(miembro("AFC")), "menor: valorar con percentiles");
});

test("propuesta de objetivo solo para adultos con sobrepeso", () => {
  const rfa = proponerObjetivo(miembro("RFA"))!;
  assert.equal(rfa.pesoObjetivoKg, 67.8);
  assert.equal(rfa.semanas, 11);
  assert.equal(proponerObjetivo(miembro("RFC"))!.pesoObjetivoKg, 74.5);
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
  const antes = (await almacen.despensa()).productos.length;
  const alubias = (d: { productos: { nombre: string; cantidad: number }[] }) => d.productos.find((p) => p.nombre === "Alubias pintas");
  await almacen.ajustarProductos([{ nombre: "Alubias pintas", cantidad: 1000, unidad: "g" }]);
  let despensa = await almacen.ajustarProductos([{ nombre: "alubias pintas", cantidad: -400, unidad: "g" }]);
  assert.equal(alubias(despensa)!.cantidad, 600);
  despensa = await almacen.ajustarProductos([{ nombre: "Alubias pintas", cantidad: -600, unidad: "g" }]);
  assert.equal(alubias(despensa), undefined);
  assert.equal(despensa.productos.length, antes);
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

test("tuppers de oficina: RFA frío de lunes a jueves y CCT para recalentar de lunes a miércoles", () => {
  const semana = planificarSemana(familia);
  for (const dia of semana) {
    const tuppers = dia.comidas.find((c) => c.tipo === "comida")!.tuppers;
    if (["L", "M", "X"].includes(dia.dia)) {
      assert.deepEqual(tuppers.map((t) => [t.id, t.tipo]), [["RFA", "frío"], ["CCT", "para recalentar"]]);
    } else if (dia.dia === "J") {
      assert.deepEqual(tuppers.map((t) => [t.id, t.tipo]), [["RFA", "frío"]]);
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
    ["huevos-revueltos-jamon-queso", ["RFA"]],
  ]);
  // Albóndigas: 4 comensales de la cena del lunes + tupper de CCT del martes.
  const f = (id: string) => calcularNecesidades(miembro(id), familia.objetivos[id]).factorRacion;
  const pavo = listaCompra(dias).Carnicería.find((l) => l.nombre === "Carne picada de pavo")!;
  assert.ok(Math.abs(pavo.cantidad - 130 * (f("RFA") + f("CCT") + f("RFC") + f("AFC") + f("CCT"))) < 1);
  // Salmón: solo la comida del jueves (CCT, RFC y AFC).
  const salmon = listaCompra(dias).Pescadería.find((l) => l.nombre === "Lomo de salmón")!;
  const esperado = 130 * (f("CCT") + f("RFC") + f("AFC"));
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

test("las raciones en reserva de una receta no se vuelven a comprar", async () => {
  const { componerMenu, listaCompra, caducidadReserva } = await import("../src/menu.js");
  const menu = JSON.parse(await readFile("data/menu-semana.json", "utf8"));
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  const dias = componerMenu(familia, menu, recetas);
  const plato = dias.flatMap((d) => d.comidas.flatMap((c) => c.platos))
    .find((p) => !p.receta.racionFija && p.raciones >= 2 && p.receta.ingredientes.some((i) => !i.porPersona))!;
  const ing = plato.receta.ingredientes.find((i) => !i.porPersona)!;
  const linea = (sobras: { receta: string; raciones: number; descripcion: string; fecha: string }[]) =>
    Object.values(listaCompra(dias, { productos: [], sobras })).flat()
      .find((l) => l.nombre === ing.nombre && l.unidad === ing.unidad)?.cantidad ?? 0;
  const sin = linea([]);
  const con = linea([{ receta: plato.receta.id, raciones: 2, descripcion: plato.receta.nombre, fecha: "2026-09-28" }]);
  assert.ok(Math.abs(sin - con - ing.cantidad * 2) < 0.1, `${ing.nombre}: ${sin} → ${con}`);
  assert.equal(caducidadReserva("2026-09-28", "nevera"), "2026-10-01");
  assert.equal(caducidadReserva("2026-09-28", "congelador"), "2026-12-28");
});

test("registrar y gastar raciones en reserva", async () => {
  const { ejecutar } = crearHerramientas(await almacenTemporal());
  const mala = await ejecutar("registrar_sobra", { descripcion: "x", raciones: 1, fecha: "2026-09-28", receta: "no-existe" });
  assert.equal(mala.error, true);
  const leer = (r: { contenido: string }) => JSON.parse(r.contenido);
  const d = leer(await ejecutar("registrar_sobra", {
    descripcion: "Lentejas", raciones: 3, hechas: 7, fecha: "2026-09-28", receta: "lentejas-estofadas", ubicacion: "congelador",
  }));
  const i = d.sobras.length - 1;
  assert.equal(d.sobras[i].consumirAntesDe, "2026-12-28");
  const tras = leer(await ejecutar("consumir_sobra", { indice: i, raciones: 1 }));
  assert.equal(tras.sobras[i].raciones, 2);
  const fin = leer(await ejecutar("consumir_sobra", { indice: i }));
  assert.equal(fin.sobras.length, i);
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
      { RFA: "desayuno-rfa", CCT: "desayuno-cct-actual", RFC: "cafe-solo", AFC: "desayuno-afc" },
    );
    const almuerzo = dia.comidas.find((c) => c.tipo === "almuerzo");
    assert.equal(Boolean(almuerzo), !["S", "D"].includes(dia.dia));
    if (almuerzo) assert.deepEqual(almuerzo.platos[0].comensales.map((c) => c.id), ["RFC"]);
  }
  // 8 galletas al día (4 g cada una), 7 días: sin escalar por el factor de ración de AFC.
  const galletas = listaCompra(dias).Despensa.find((l) => l.nombre.startsWith("Galletas"))!;
  assert.equal(galletas.unidad, "g");
  assert.equal(galletas.cantidad, 56 * 4);
  assert.equal(galletas.equivalencia, "56 ud");
});

test("el menú se guarda sin validación y con las sobras enlazadas a la comida de la que salen", async () => {
  const almacen = await almacenTemporal();
  const { ejecutar } = crearHerramientas(almacen);
  const { cambios: _c, ...datos } = await almacen.menu();
  const r = await ejecutar("guardar_menu", { ...datos, autor: "CCT", fecha: "2026-09-29", descripcionCambio: "Cambio la cena del jueves" });
  assert.equal(r.error, false, r.contenido);
  const tras = await almacen.menu() as Record<string, unknown> & Awaited<ReturnType<typeof almacen.menu>>;
  assert.equal(tras.estado, undefined);
  assert.equal(tras.cambios!.at(-1)!.por, "CCT");
  assert.deepEqual(tras.tuppers.M!.CCT.sobrasDe, { dia: "L", comida: "cena" });
  const sinValidar = await ejecutar("validar_menu", { por: "CCT", fecha: "2026-09-29" });
  assert.equal(sinValidar.error, true);
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

test("objetivos de peso aceptados: las raciones de RFA y CCT usan las kcal del objetivo", () => {
  for (const id of ["RFA", "CCT"]) {
    const n = calcularNecesidades(miembro(id), familia.objetivos[id]);
    assert.equal(n.kcalObjetivo, familia.objetivos[id].kcalDiarias);
    assert.ok(n.kcalObjetivo < n.gastoDiario);
    assert.ok(n.kcalObjetivo >= n.tmb);
    assert.equal(n.propuestaObjetivo, null);
  }
  assert.equal(familia.objetivos.RFC, undefined);
  assert.equal(familia.objetivos.AFC, undefined);
});

test("platos no deseados: no se sirven a quien los marcó (o a nadie si es la familia)", async () => {
  const { validarMenu } = await import("../src/menu.js");
  const menu = JSON.parse(await readFile("data/menu-semana.json", "utf8"));
  const siguiente = JSON.parse(await readFile("data/menu-siguiente.json", "utf8"));
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  assert.deepEqual(validarMenu(familia, siguiente, recetas), []);

  const marca = (por: string, receta: string) => {
    const f = structuredClone(familia);
    f.noDeseados = [{ receta, por, motivo: "no le gusta", fecha: "2026-09-28" }];
    return f;
  };
  // RFA no come la merluza del miércoles (tiene variante): marcarla por RFA no bloquea el menú.
  assert.deepEqual(validarMenu(marca("RFA", "merluza-plancha-brocoli"), menu, recetas), []);
  // Pero si la marca RFC, que sí la come, el menú se rechaza.
  assert.ok(validarMenu(marca("RFC", "merluza-plancha-brocoli"), menu, recetas).some((e) => /no deseado por RFC/.test(e)));
  // Marcado por la familia: no vale para nadie, tuppers incluidos.
  assert.ok(validarMenu(marca("familia", "wraps-pavo-hummus"), menu, recetas).some((e) => /tupper RFA/.test(e)));
});

test("legumbres solo con un adulto delante; pasta para los niños cuando están solos", async () => {
  const { validarMenu } = await import("../src/menu.js");
  const menu = JSON.parse(await readFile("data/menu-semana.json", "utf8"));
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  const solos = structuredClone(menu);
  solos.dias.L.comida = { receta: "garbanzos-espinacas" };
  assert.ok(validarMenu(familia, solos, recetas).some((e) => /garbanzos/.test(e) && /supervise/.test(e)));
  // Con CCT en casa (jueves) sí valen; y en el tupper de un adulto también.
  const conCct = structuredClone(menu);
  conCct.dias.J.comida = { receta: "lentejas-estofadas" };
  assert.deepEqual(validarMenu(familia, conCct, recetas), []);
  // El almuerzo de RFC en el colegio tampoco puede llevar legumbres.
  const almuerzo = structuredClone(menu);
  almuerzo.dias.M.almuerzo = { receta: "arroz-garbanzos-feta" };
  assert.ok(validarMenu(familia, almuerzo, recetas).some((e) => /Martes almuerzo/.test(e)));
});

test("primero y segundo: el segundo lo comen los mismos y entra en la compra", async () => {
  const { componerMenu, listaCompra } = await import("../src/menu.js");
  const menu = JSON.parse(await readFile("data/menu-semana.json", "utf8"));
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  const dias = componerMenu(familia, menu, recetas);
  const martes = dias[1].comidas.find((c) => c.tipo === "comida")!.platos[0];
  assert.equal(martes.receta.id, "pure-calabaza");
  assert.equal(martes.segundo!.receta.id, "lomo-adobado-plancha");
  assert.equal(martes.segundo!.raciones, martes.raciones);
  const lomo = listaCompra(dias).Carnicería.find((l) => l.nombre === "Lomo adobado en filetes")!;
  assert.ok(Math.abs(lomo.cantidad - 120 * martes.raciones) < 1);
  // Más huevo: al menos 4 comidas o cenas de la semana llevan huevo.
  const conHuevo = dias.flatMap((d) => d.comidas.filter((c) => c.tipo === "comida" || c.tipo === "cena"))
    .filter((c) => c.platos.some((p) => [p.receta, p.segundo?.receta].some((r) => r?.ingredientes.some((i) => i.nombre === "Huevos"))));
  assert.ok(conHuevo.length >= 4, `solo ${conHuevo.length}`);
});

test("coste de la cesta: envases enteros, granel, tienda más barata y sin precios inventados", async () => {
  const { costeCesta } = await import("../src/precios.js");
  const linea = (nombre: string, unidad: string, comprar: number) =>
    ({ nombre, unidad, cantidad: comprar, enDespensa: 0, comprar, recetas: [] });
  const lista = {
    "Frutería": [linea("Tomate", "g", 1500)], "Carnicería": [], "Pescadería": [], "Charcutería y quesos": [],
    "Lácteos y huevos": [linea("Leche semidesnatada", "g", 3605), linea("Huevos", "g", 1200)],
    "Panadería": [], "Despensa": [], "Congelados": [],
  };
  const p = (producto: string, tienda: string, precio: number, cantidad: number, unidad: string, granel = false) =>
    ({ producto, tienda, precio, cantidad, unidad, granel, fecha: "2026-09-28", fuente: "manual" as const });
  const tabla = {
    tiendas: [{ id: "Mercadona" }, { id: "BM" }],
    precios: [
      p("Leche semidesnatada", "Mercadona", 0.9, 1000, "ml"), p("Leche semidesnatada", "BM", 1.0, 1000, "ml"),
      p("Tomate", "Mercadona", 2, 1000, "g", true),
    ],
  };
  const c = costeCesta(lista, tabla);
  const leche = c.lineas.find((l) => l.nombre === "Leche semidesnatada")!;
  assert.equal(leche.porTienda.Mercadona.envases, 4); // 3.605 g (3,5 l) → 4 bricks de 1 l (1.030 g)
  assert.equal(leche.porTienda.Mercadona.coste, 3.6);
  assert.equal(leche.masBarata, "Mercadona");
  assert.equal(c.lineas.find((l) => l.nombre === "Tomate")!.porTienda.Mercadona.coste, 3); // granel: 1,5 kg × 2 €
  assert.deepEqual(c.totales.BM, { total: 4, conPrecio: 1, sinPrecio: 2 });
  // Huevos sin precio en ninguna tienda: no se inventa, queda fuera del total.
  assert.equal(c.optimizada.sinPrecio, 1);
  assert.equal(c.optimizada.total, 3.6 + 3);
  assert.equal(c.hayPrecios, true);
});

test("ingredientes por persona: una dorada por comensal, sin redondear por la ración", async () => {
  const { componerMenu, listaCompra } = await import("../src/menu.js");
  const menu = JSON.parse(await readFile("data/menu-semana.json", "utf8"));
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  const dorada = listaCompra(componerMenu(familia, menu, recetas)).Pescadería.find((l) => l.nombre.startsWith("Dorada"))!;
  assert.equal(dorada.unidad, "g");
  assert.equal(dorada.comprar, 4 * 350);
  assert.equal(dorada.equivalencia, "4 ud");
});

test("sin tickets no hay precios: ni estimaciones en los datos ni columna de precios en el PDF", async () => {
  const { costeCesta } = await import("../src/precios.js");
  const { componerMenu, listaCompra } = await import("../src/menu.js");
  const { htmlCompraPdf } = await import("../src/pdf.js");
  const precios = JSON.parse(await readFile("data/precios.json", "utf8"));
  assert.ok(precios.precios.every((p: { fuente: string }) => p.fuente !== "estimado"));
  const menu = JSON.parse(await readFile("data/menu-semana.json", "utf8"));
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  const vacia = { ...precios, precios: [] };
  assert.equal(costeCesta(listaCompra(componerMenu(familia, menu, recetas)), vacia).hayPrecios, false);
  const html = htmlCompraPdf({ familia, menu, recetas, precios: vacia, fecha: "28 de septiembre de 2026" });
  assert.doesNotMatch(html, /€/);
});

test("Thermomix: las cremas y purés del menú tienen pasos con tiempo, temperatura y velocidad", async () => {
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  const cremas = recetas.filter((r: { id: string }) => /^(pure|crema)-/.test(r.id));
  assert.ok(cremas.length >= 6);
  for (const r of cremas) {
    assert.ok(r.thermomix?.length, `${r.id} sin pasos de Thermomix`);
    assert.ok(r.thermomix.some((p: string) => /\d+ (min|s)\/.*vel/.test(p)), `${r.id}: formato tiempo/temperatura/velocidad`);
  }
});

test("equivalencias: ud y ml pasan a gramos, y lo desconocido no se inventa", async () => {
  const { aGramos, aGramosObligatorio, equivalencia } = await import("../src/unidades.js");
  assert.equal(aGramos("Huevos", 2, "ud"), 120);
  assert.equal(aGramos("Leche semidesnatada", 250, "ml"), 257.5);
  assert.equal(aGramos("Agua", 500, "ml"), 500);
  assert.equal(aGramos("Cosa rara", 1, "ud"), undefined);
  assert.throws(() => aGramosObligatorio("Cosa rara", 1, "ud"), /equivalencias/);
  assert.equal(equivalencia("Huevos", 1320), "22 ud");
  assert.equal(equivalencia("Aceite de oliva virgen extra", 92), "100 ml");
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  const unidades = new Set(recetas.flatMap((r: { ingredientes: { unidad: string }[] }) => r.ingredientes.map((i) => i.unidad)));
  assert.deepEqual([...unidades], ["g"]);
});

test("la compra va en gramos y lo que se vende por piezas se redondea a piezas enteras", async () => {
  const { componerMenu, listaCompra } = await import("../src/menu.js");
  const menu = JSON.parse(await readFile("data/menu-semana.json", "utf8"));
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  const lista = listaCompra(componerMenu(familia, menu, recetas), { productos: [{ nombre: "Huevos", cantidad: 6, unidad: "ud" }], sobras: [] });
  const huevos = lista["Lácteos y huevos"].find((l) => l.nombre === "Huevos")!;
  assert.equal(huevos.unidad, "g");
  assert.equal(huevos.enDespensa, 360); // 6 ud apuntadas a mano cuentan como 360 g
  assert.equal(huevos.comprar % 60, 0);
});

test("guardar una receta en ud o ml la deja en gramos", async () => {
  const almacen = await almacenTemporal();
  const { ejecutar } = crearHerramientas(almacen);
  const r = await ejecutar("guardar_receta", {
    id: "prueba-huevos", nombre: "Prueba", tipo: "cena", tiempoMin: 5, tecnica: "plancha", pasos: ["Hacer."],
    ingredientes: [
      { nombre: "Huevos", cantidad: 2, unidad: "ud", seccion: "Lácteos y huevos" },
      { nombre: "Aceite de oliva virgen extra", cantidad: 10, unidad: "ml", seccion: "Despensa" },
    ],
  });
  assert.equal(r.error, false, r.contenido);
  const guardada = (await almacen.recetas()).find((x) => x.id === "prueba-huevos")!;
  assert.deepEqual(guardada.ingredientes.map((i) => [i.cantidad, i.unidad]), [[120, "g"], [9.2, "g"]]);
});

test("web: las comidas que salen de otra (sobras) suman sus raciones a la que se cocina", async () => {
  const { componerMenu } = await import("../src/menu.js");
  const { celdasCliente, generarHtml } = await import("../src/web.js");
  const menu = JSON.parse(await readFile("data/menu-semana.json", "utf8"));
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  const celdas = celdasCliente("A", componerMenu(familia, menu, recetas));
  const cenaMartes = celdas.find((c) => c.id === "A-1-cena")!;
  const comidaMiercoles = celdas.find((c) => c.id === "A-2-comida")!;
  const tupperCct = comidaMiercoles.tuppers.find((t) => t.quien === "CCT")!;
  assert.equal(comidaMiercoles.sobras, true);
  assert.equal(tupperCct.sobras, true);
  assert.equal(cenaMartes.racCocinar, Math.round((cenaMartes.rac + comidaMiercoles.rac + tupperCct.rac) * 100) / 100);
  assert.ok(celdas.some((c) => c.id === "A-3-comida" && c.tuppers.some((t) => t.quien === "RFA")));
  const html = generarHtml({ familia, propuesta: JSON.parse(await readFile("data/propuesta-tuppers.json", "utf8")), menu, recetas, fecha: "30 de septiembre de 2026" });
  for (const id of ["diario", "definiciones", "dlg-actualizar", "btn-confirmar-compra"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /Aprobar el menú|Borrador/);
});

test("web: alias en lugar de siglas, página Normas y fichas editables", async () => {
  const { conAlias, generarHtml } = await import("../src/web.js");
  const menu = JSON.parse(await readFile("data/menu-semana.json", "utf8"));
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  // El alias cambia el texto visible, pero no ids, clases, valores ni scripts.
  const trozo = conAlias(`<p id="cfg-RFA" title="RFA: 500 kcal">RFA y RFC</p><option value="CCT">CCT</option><script>const x = "AFC";</script>`, familia);
  assert.equal(trozo, `<p id="cfg-RFA" title="Ricardo: 500 kcal">Ricardo y Ricardo hijo</p><option value="CCT">Cristina</option><script>const x = "AFC";</script>`);
  const html = generarHtml({ familia, propuesta: JSON.parse(await readFile("data/propuesta-tuppers.json", "utf8")), menu, recetas, fecha: "30 de septiembre de 2026" });
  const visible = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]*>/g, " ");
  assert.doesNotMatch(visible, /\b(RFA|CCT|RFC|AFC)\b/);
  for (const id of ["normas", "dlg-perfil"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /Cambios al menú/);
  for (const editar of ["peso", "objetivo", "alimentacion"]) assert.match(html, new RegExp(`data-m="CCT" data-editar="${editar}"`));
  // Los menores no tienen objetivo de peso que cambiar.
  assert.doesNotMatch(html, /data-m="AFC" data-editar="objetivo"/);
});

test("la ficha de la web recalcula el gasto con los mismos coeficientes que el agente", async () => {
  const { coeficientesTmb, kcalDeportePorKg, gastoEnergeticoDiario, FACTOR_BASE } = await import("../src/nutricion.js");
  for (const m of familia.miembros) {
    const { porKg, fija } = coeficientesTmb(m);
    const gastoWeb = (porKg * m.pesoKg + fija) * FACTOR_BASE + kcalDeportePorKg(m) * m.pesoKg;
    assert.ok(Math.abs(gastoWeb - gastoEnergeticoDiario(m)) < 1e-9);
  }
});

test("rotación de semanas: el lunes de la semana siguiente, su menú pasa a ser el de la semana en curso", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "menu-"));
  await cp("data", dir, { recursive: true });
  const almacen = new Almacen(dir);
  const antes = await almacen.menu();
  const siguiente = await almacen.menu(true);
  assert.equal(await almacen.rotarSemanas("2026-10-04"), null); // domingo: aún no toca
  const rotada = await almacen.rotarSemanas(siguiente.inicio!);
  assert.equal(rotada?.semana, siguiente.semana);
  assert.equal((await almacen.menu()).inicio, siguiente.inicio);
  await assert.rejects(almacen.menu(true)); // falta preparar la nueva semana siguiente
  const archivado = JSON.parse(await readFile(path.join(dir, "historial", `menu-${antes.inicio}.json`), "utf8"));
  assert.equal(archivado.semana, antes.semana);
  assert.equal(await almacen.rotarSemanas("2026-10-20"), null); // sin semana siguiente no hay nada que rotar
});

test("web: las casillas se identifican por el lunes de su semana", async () => {
  const { generarHtml } = await import("../src/web.js");
  const menu = JSON.parse(await readFile("data/menu-semana.json", "utf8"));
  const menuSiguiente = JSON.parse(await readFile("data/menu-siguiente.json", "utf8"));
  const { recetas } = JSON.parse(await readFile("data/recetas.json", "utf8"));
  const html = generarHtml({ familia, propuesta: JSON.parse(await readFile("data/propuesta-tuppers.json", "utf8")), menu, menuSiguiente, recetas, fecha: "30 de septiembre de 2026" });
  assert.match(html, new RegExp(`data-celda="${menu.inicio}-0-comida"`));
  assert.match(html, new RegExp(`data-celda="${menuSiguiente.inicio}-0-comida"`));
  assert.doesNotMatch(html, /data-celda="[AB]-/);
  assert.match(html, /Semana en curso · A/);
  assert.match(html, /Próxima semana · B/);
});
