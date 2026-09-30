import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { resumirHabitos, type Almacen } from "./almacen.js";
import { calcularNecesidades, esAdulto } from "./nutricion.js";
import { caducidadReserva, componerMenu, listaCompra, SECCIONES, validarMenu, type MenuSemana } from "./menu.js";
import { planificarSemana } from "./planificacion.js";
import { costeCesta } from "./precios.js";
import { DIAS } from "./tipos.js";

interface Herramienta<S extends z.ZodObject> {
  nombre: string;
  descripcion: string;
  esquema: S;
  ejecutar: (entrada: z.infer<S>) => Promise<unknown>;
}

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Fecha AAAA-MM-DD");

const producto = z.object({
  nombre: z.string(),
  cantidad: z.number().describe("Positiva para añadir, negativa para consumir"),
  unidad: z.string().describe("g, kg, ml, l, ud, paquete..."),
  categoria: z.string().optional(),
  caducidad: fecha.optional(),
});

const TIPOS_COMIDA = ["desayuno", "almuerzo", "comida", "merienda", "cena"] as const;

const receta = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).describe("Identificador en minúsculas con guiones"),
  nombre: z.string(),
  tipo: z.enum([...TIPOS_COMIDA, "tupper"]),
  tiempoMin: z.number().int().positive(),
  tecnica: z.enum(["sin cocinar", "plancha", "horno", "guiso", "frío"]),
  ingredientes: z
    .array(
      z.object({
        nombre: z.string(),
        cantidad: z.number().positive().describe("Para una ración de referencia (adulto de 2000 kcal)"),
        unidad: z.enum(["g", "kg", "ml", "l", "ud"]).describe("Se guarda en gramos; ud y ml se convierten con data/equivalencias.json"),
        seccion: z.enum(SECCIONES),
        porPersona: z.boolean().optional().describe("true si se compra uno por persona (una dorada, un filete)"),
      }),
    )
    .min(1),
  pasos: z.array(z.string()).min(1),
  thermomix: z.array(z.string()).optional().describe("Pasos con Thermomix en formato «tiempo/temperatura/velocidad» (cremas, purés, guisos, salsas)"),
  conservacion: z.string().optional(),
  racionFija: z.boolean().optional().describe("true si las cantidades son por persona y no se escalan (desayunos habituales)"),
  alMomento: z.boolean().optional().describe("true si se prepara justo antes de comer (p. ej. tortilla francesa): no vale para almuerzos ni tuppers"),
});

const plato = z.object({
  receta: z.string().describe("Plato único o primer plato"),
  segundo: z.string().optional().describe("Segundo plato para los mismos comensales"),
  prepara: z.string().optional().describe("Batch, ración extra de otra comida, plancha..."),
  variantes: z.record(z.string(), z.string()).optional().describe("Miembro → receta alternativa"),
  sobrasDe: z
    .object({ dia: z.enum(DIAS), comida: z.enum(TIPOS_COMIDA) })
    .optional()
    .describe("Si se cocina junto con otra comida (ración extra de una cena, batch): esa comida. Así en la web no se descuenta dos veces"),
});

function herramienta<S extends z.ZodObject>(h: Herramienta<S>): Herramienta<S> {
  return h;
}

export function crearHerramientas(almacen: Almacen) {
  const lista = [
    herramienta({
      nombre: "ver_familia",
      descripcion:
        "Devuelve el perfil de la familia: miembros (edad, sexo, altura, peso, gustos, deporte), alergias, régimen de comidas, roles en la cocina y objetivos acordados.",
      esquema: z.object({}),
      ejecutar: () => almacen.familia(),
    }),
    herramienta({
      nombre: "calcular_necesidades",
      descripcion:
        "Calcula IMC, tasa metabólica basal, gasto diario, kcal objetivo y factor de ración de cada miembro. Incluye propuestas de objetivo para adultos con sobrepeso, que deben acordarse con el usuario antes de guardarlas.",
      esquema: z.object({}),
      ejecutar: async () => {
        const familia = await almacen.familia();
        return familia.miembros.map((m) => calcularNecesidades(m, familia.objetivos[m.id]));
      },
    }),
    herramienta({
      nombre: "planificar_comensales",
      descripcion:
        "Rejilla semanal (L-D) con cada comida del día: quién come en casa, kcal por comensal, raciones equivalentes totales, quién come fuera (y si se lleva tupper, frío o para recalentar, con sus kcal) y quién puede cocinar. Úsala como base del menú.",
      esquema: z.object({}),
      ejecutar: async () => planificarSemana(await almacen.familia()),
    }),
    herramienta({
      nombre: "guardar_objetivo",
      descripcion:
        "Guarda un objetivo de peso para un adulto SOLO después de que el usuario lo haya aceptado explícitamente. Nunca para menores de edad.",
      esquema: z.object({
        id: z.string(),
        pesoObjetivoKg: z.number().positive(),
        kcalDiarias: z.number().int().positive(),
        semanas: z.number().int().positive(),
        fechaInicio: fecha,
        notas: z.string().optional(),
      }),
      ejecutar: async ({ id, ...objetivo }) => {
        const miembro = (await almacen.familia()).miembros.find((m) => m.id === id);
        if (!miembro) throw new Error(`No existe el miembro ${id}`);
        if (!esAdulto(miembro)) throw new Error("No se guardan objetivos de peso para menores de edad");
        await almacen.guardarObjetivo(id, objetivo);
        return { guardado: true, id, ...objetivo };
      },
    }),
    herramienta({
      nombre: "configurar_desayuno",
      descripcion:
        "Cambia el desayuno habitual de un miembro: la receta, una nota o si se muestra en el menú (mostrarEnMenu). Aunque no se muestre, cuenta en la lista de la compra. Úsala solo cuando esa persona lo pida.",
      esquema: z.object({
        id: z.string(),
        receta: z.string().optional(),
        nota: z.string().optional(),
        mostrarEnMenu: z.boolean().optional(),
      }),
      ejecutar: async ({ id, ...cambios }) => {
        if (cambios.receta && !(await almacen.recetas()).some((r) => r.id === cambios.receta)) {
          throw new Error(`No existe la receta ${cambios.receta}`);
        }
        await almacen.configurarDesayuno(id, cambios);
        return { guardado: true, id, ...cambios };
      },
    }),
    herramienta({
      nombre: "marcar_no_deseado",
      descripcion:
        "Marca un plato como no deseado (por un miembro o por «familia») con el motivo, para no volver a ponerlo en futuros menús; quitar=true lo desmarca. guardar_menu rechaza los menús que lo sirvan a quien lo marcó.",
      esquema: z.object({
        receta: z.string(),
        por: z.string().describe("Id del miembro o «familia»"),
        motivo: z.string(),
        fecha,
        quitar: z.boolean().optional(),
      }),
      ejecutar: async ({ quitar, ...nd }) => {
        const [familia, recetas] = await Promise.all([almacen.familia(), almacen.recetas()]);
        if (!recetas.some((r) => r.id === nd.receta)) throw new Error(`No existe la receta ${nd.receta}`);
        if (nd.por !== "familia" && !familia.miembros.some((m) => m.id === nd.por)) throw new Error(`No existe el miembro ${nd.por}`);
        await almacen.marcarNoDeseado(nd, quitar);
        return { guardado: true, ...nd, quitado: Boolean(quitar) };
      },
    }),
    herramienta({
      nombre: "ver_despensa",
      descripcion: "Productos disponibles en casa (con caducidad si se conoce) y sobras de raciones ya cocinadas.",
      esquema: z.object({}),
      ejecutar: () => almacen.despensa(),
    }),
    herramienta({
      nombre: "actualizar_despensa",
      descripcion:
        "Añade (cantidad positiva) o consume (cantidad negativa) productos de la despensa. Los productos que llegan a 0 desaparecen. Nunca quedan cantidades negativas: si se consume más de lo que hay (o algo que no está), se toma como que faltaba apuntarlo y se queda a 0.",
      esquema: z.object({ cambios: z.array(producto).min(1) }),
      ejecutar: ({ cambios }) => almacen.ajustarProductos(cambios),
    }),
    herramienta({
      nombre: "registrar_sobra",
      descripcion:
        "Registra raciones ya cocinadas que se guardan (reserva) para usarlas otro día u otra semana. Con `receta`, si el menú vuelve a ponerla, esas raciones se descuentan de la lista de la compra. Si no se indica consumirAntesDe, se calcula: nevera 3 días, congelador 3 meses.",
      esquema: z.object({
        descripcion: z.string(),
        raciones: z.number().positive().describe("Raciones que quedan en reserva."),
        fecha,
        consumirAntesDe: fecha.optional(),
        receta: z.string().optional().describe("Id de la receta de la que salen."),
        ubicacion: z.enum(["nevera", "congelador"]).optional(),
        hechas: z.number().positive().optional().describe("Raciones que se hicieron en total."),
      }),
      ejecutar: async (sobra) => {
        if (sobra.receta && !(await almacen.recetas()).some((r) => r.id === sobra.receta)) {
          throw new Error(`No existe la receta ${sobra.receta}`);
        }
        return almacen.registrarSobra({ ...sobra, consumirAntesDe: sobra.consumirAntesDe ?? caducidadReserva(sobra.fecha, sobra.ubicacion) });
      },
    }),
    herramienta({
      nombre: "consumir_sobra",
      descripcion:
        "Gasta raciones de una sobra o reserva, por su índice en la lista de sobras de ver_despensa. Sin `raciones`, la quita entera.",
      esquema: z.object({ indice: z.number().int().min(0), raciones: z.number().positive().optional() }),
      ejecutar: ({ indice, raciones }) => almacen.consumirSobra(indice, raciones),
    }),
    herramienta({
      nombre: "registrar_ticket",
      descripcion:
        "Guarda un ticket de compra (transcrito de una foto o de texto) para aprender los hábitos de consumo. Asigna una categoría a cada línea (fruta, verdura, carne, pescado, lácteos, legumbres, cereales, bebidas, limpieza, snacks, otros...).",
      esquema: z.object({
        fecha,
        tienda: z.string(),
        total: z.number(),
        lineas: z
          .array(
            z.object({
              producto: z.string(),
              cantidad: z.number(),
              unidad: z.string(),
              precio: z.number().describe("Importe total de la línea en euros"),
              categoria: z.string(),
            }),
          )
          .min(1),
      }),
      ejecutar: async (ticket) => ({ registrado: true, totalTickets: await almacen.registrarTicket(ticket) }),
    }),
    herramienta({
      nombre: "resumen_habitos",
      descripcion: "Gasto total, gasto por categoría y productos más comprados según los tickets registrados.",
      esquema: z.object({}),
      ejecutar: async () => resumirHabitos(await almacen.tickets()),
    }),
    herramienta({
      nombre: "ver_recetas",
      descripcion: "Lista de recetas guardadas (ingredientes por ración de referencia, pasos, tiempo, técnica).",
      esquema: z.object({}),
      ejecutar: () => almacen.recetas(),
    }),
    herramienta({
      nombre: "guardar_receta",
      descripcion:
        "Guarda o sustituye una receta. Las cantidades son para una ración de referencia (2000 kcal/día); el sistema las escala según los comensales.",
      esquema: receta,
      ejecutar: async (r) => {
        await almacen.guardarReceta(r);
        return { guardada: r.id };
      },
    }),
    herramienta({
      nombre: "ver_menu",
      descripcion: "Menú guardado (esta semana o, con siguiente=true, la propuesta de la siguiente), con platos, comensales y raciones de cada comida y tupper.",
      esquema: z.object({ siguiente: z.boolean().optional().describe("true para la propuesta de la semana siguiente") }),
      ejecutar: async ({ siguiente }) => {
        const [familia, menu, recetas] = await Promise.all([almacen.familia(), almacen.menu(siguiente), almacen.recetas()]);
        return { semana: menu.semana, batch: menu.batch, dias: componerMenu(familia, menu, recetas) };
      },
    }),
    herramienta({
      nombre: "guardar_menu",
      descripcion:
        "Guarda el menú de la semana (no hace falta validarlo). Todas las recetas deben existir (guardar_receta antes). Debe cubrir cada comida de planificar_comensales y cada tupper. Indica quién pide el cambio y qué cambia.",
      esquema: z.object({
        autor: z.string().describe("Quién pide o hace el cambio (p. ej. CCT o agente)"),
        fecha,
        descripcionCambio: z.string().describe("Qué se ha cambiado respecto al menú anterior"),
        siguiente: z.boolean().optional().describe("true para la propuesta de la semana siguiente"),
        semana: z.string(),
        inicio: fecha.optional().describe("Lunes de esa semana"),
        batch: z.array(z.object({ dia: z.enum(DIAS), tareas: z.array(z.string()) })).optional(),
        dias: z.record(z.enum(DIAS), z.partialRecord(z.enum(TIPOS_COMIDA), plato)),
        tuppers: z.partialRecord(z.enum(DIAS), z.record(z.string(), plato)),
      }),
      ejecutar: async ({ autor, fecha, descripcionCambio, siguiente, ...datos }) => {
        const [familia, recetas, anterior] = await Promise.all([
          almacen.familia(), almacen.recetas(), almacen.menu(siguiente).catch(() => undefined),
        ]);
        const errores = validarMenu(familia, datos as MenuSemana, recetas);
        if (errores.length) throw new Error(`Menú incompleto:\n${errores.join("\n")}`);
        const cambios = [...(anterior?.cambios ?? []), { por: autor, fecha, descripcion: descripcionCambio }];
        await almacen.guardarMenu({ ...(datos as MenuSemana), cambios }, siguiente);
        return { guardado: true };
      },
    }),
    herramienta({
      nombre: "lista_compra",
      descripcion:
        "Lista de la compra del menú guardado: suma los ingredientes según las raciones de cada comida y tupper, descuenta la despensa y agrupa por sección.",
      esquema: z.object({ siguiente: z.boolean().optional().describe("true para la propuesta de la semana siguiente") }),
      ejecutar: async ({ siguiente }) => {
        const [familia, menu, recetas, despensa] = await Promise.all([
          almacen.familia(), almacen.menu(siguiente), almacen.recetas(), almacen.despensa(),
        ]);
        return listaCompra(componerMenu(familia, menu, recetas), despensa);
      },
    }),
    herramienta({
      nombre: "registrar_precio",
      descripcion:
        "Guarda el precio de un ingrediente en una tienda (Mercadona, BM, Elías...). Úsala al registrar un ticket para cada línea que corresponda a un ingrediente de las recetas, con el nombre exacto del ingrediente. `precio` es por envase de `cantidad` `unidad`; granel=true si se paga por peso (fruta, verdura, carne o pescado al corte).",
      esquema: z.object({
        producto: z.string().describe("Nombre del ingrediente tal como aparece en las recetas"),
        tienda: z.string(),
        precio: z.number().positive(),
        cantidad: z.number().positive(),
        unidad: z.enum(["g", "kg", "ml", "l", "ud"]).describe("Se guarda en gramos cuando hay equivalencia"),
        granel: z.boolean().optional(),
        fecha,
        fuente: z.enum(["ticket", "web", "manual"]),
        nota: z.string().optional(),
      }),
      ejecutar: async (p) => ({ guardado: true, total: await almacen.registrarPrecio(p) }),
    }),
    herramienta({
      nombre: "coste_cesta",
      descripcion:
        "Coste de la lista de la compra en cada tienda con los precios reales registrados (tickets o a mano) y la combinación más barata producto a producto. Indica qué productos no tienen precio; no inventes precios para ellos.",
      esquema: z.object({ siguiente: z.boolean().optional().describe("true para la semana siguiente") }),
      ejecutar: async ({ siguiente }) => {
        const [familia, menu, recetas, despensa, tabla] = await Promise.all([
          almacen.familia(), almacen.menu(siguiente), almacen.recetas(), almacen.despensa(), almacen.precios(),
        ]);
        const cesta = costeCesta(listaCompra(componerMenu(familia, menu, recetas), despensa), tabla);
        return {
          totales: cesta.totales,
          optimizada: cesta.optimizada,
          lineas: cesta.lineas.map((l) => ({
            producto: l.nombre,
            comprar: `${l.comprar} ${l.unidad}`,
            masBarata: l.masBarata ?? null,
            costes: Object.fromEntries(Object.entries(l.porTienda).map(([t, c]) => [t, c.coste])),
          })),
        };
      },
    }),
    herramienta({
      nombre: "guardar_documento",
      descripcion:
        "Guarda un documento Markdown en la carpeta salidas/ (menú semanal, lista de la compra, plan de cocina...). El nombre es solo el fichero, p. ej. menu-2026-S40.md.",
      esquema: z.object({
        nombre: z.string().regex(/^[\w-]+\.md$/),
        contenido: z.string(),
      }),
      ejecutar: async ({ nombre, contenido }) => ({ ruta: await almacen.guardarDocumento(nombre, contenido) }),
    }),
  ];

  const porNombre = new Map<string, Herramienta<z.ZodObject>>(
    lista.map((h) => [h.nombre, h as unknown as Herramienta<z.ZodObject>]),
  );

  const definiciones: Anthropic.Beta.BetaTool[] = lista.map((h) => {
    const { $schema: _, ...schema } = z.toJSONSchema(h.esquema) as Record<string, unknown>;
    return {
      name: h.nombre,
      description: h.descripcion,
      input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
      eager_input_streaming: true,
    };
  });

  /** Valida la entrada contra el esquema antes de ejecutar; devuelve texto para el tool_result. */
  async function ejecutar(nombre: string, entrada: unknown): Promise<{ contenido: string; error: boolean }> {
    const h = porNombre.get(nombre);
    if (!h) return { contenido: `Herramienta desconocida: ${nombre}`, error: true };
    const validada = h.esquema.safeParse(entrada);
    if (!validada.success) {
      return { contenido: `Entrada no válida: ${z.prettifyError(validada.error)}`, error: true };
    }
    try {
      return { contenido: JSON.stringify(await h.ejecutar(validada.data)), error: false };
    } catch (e) {
      return { contenido: e instanceof Error ? e.message : String(e), error: true };
    }
  }

  return { definiciones, ejecutar };
}
