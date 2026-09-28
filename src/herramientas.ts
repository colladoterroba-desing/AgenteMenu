import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { resumirHabitos, type Almacen } from "./almacen.js";
import { calcularNecesidades, esAdulto } from "./nutricion.js";
import { componerMenu, listaCompra, SECCIONES, validarMenu, validarPublicacion, type MenuSemana } from "./menu.js";
import { planificarSemana } from "./planificacion.js";
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
        unidad: z.enum(["g", "ml", "ud"]),
        seccion: z.enum(SECCIONES),
      }),
    )
    .min(1),
  pasos: z.array(z.string()).min(1),
  conservacion: z.string().optional(),
  racionFija: z.boolean().optional().describe("true si las cantidades son por persona y no se escalan (desayunos habituales)"),
  alMomento: z.boolean().optional().describe("true si se prepara justo antes de comer (p. ej. tortilla francesa): no vale para almuerzos ni tuppers"),
});

const plato = z.object({
  receta: z.string().describe("Plato único o primer plato"),
  segundo: z.string().optional().describe("Segundo plato para los mismos comensales"),
  prepara: z.string().optional().describe("Batch, ración extra de otra comida, plancha..."),
  variantes: z.record(z.string(), z.string()).optional().describe("Miembro → receta alternativa"),
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
        "Añade (cantidad positiva) o consume (cantidad negativa) productos de la despensa. Los productos que llegan a 0 desaparecen.",
      esquema: z.object({ cambios: z.array(producto).min(1) }),
      ejecutar: ({ cambios }) => almacen.ajustarProductos(cambios),
    }),
    herramienta({
      nombre: "registrar_sobra",
      descripcion: "Registra raciones cocinadas que han sobrado para reaprovecharlas en el menú.",
      esquema: z.object({
        descripcion: z.string(),
        raciones: z.number().positive(),
        fecha,
        consumirAntesDe: fecha.optional(),
      }),
      ejecutar: (sobra) => almacen.registrarSobra(sobra),
    }),
    herramienta({
      nombre: "consumir_sobra",
      descripcion: "Elimina una sobra ya aprovechada, por su índice en la lista de sobras de ver_despensa.",
      esquema: z.object({ indice: z.number().int().min(0) }),
      ejecutar: ({ indice }) => almacen.consumirSobra(indice),
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
        "Guarda el menú de la semana como BORRADOR (cualquier cambio anula la validación anterior). Todas las recetas deben existir (guardar_receta antes). Debe cubrir cada comida de planificar_comensales y cada tupper. Indica quién pide el cambio y qué cambia.",
      esquema: z.object({
        autor: z.string().describe("Quién pide o hace el cambio (p. ej. CCT o agente)"),
        fecha,
        descripcionCambio: z.string().describe("Qué se ha cambiado respecto al menú anterior"),
        siguiente: z.boolean().optional().describe("true para la propuesta de la semana siguiente"),
        semana: z.string(),
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
        await almacen.guardarMenu({ ...(datos as MenuSemana), estado: "borrador", cambios }, siguiente);
        return { guardado: true, estado: "borrador", pendienteDe: familia.permisos?.validarMenu ?? [] };
      },
    }),
    herramienta({
      nombre: "validar_menu",
      descripcion:
        "Da por válido el menú guardado y lo marca como publicado. Solo puede hacerlo quien figure en familia.permisos.validarMenu (CCT). Úsala únicamente cuando esa persona lo confirme de forma explícita en la conversación.",
      esquema: z.object({ por: z.string(), fecha, siguiente: z.boolean().optional().describe("true para la propuesta de la semana siguiente") }),
      ejecutar: async ({ por, fecha, siguiente }) => {
        const [familia, menu] = await Promise.all([almacen.familia(), almacen.menu(siguiente)]);
        await almacen.guardarMenu(validarPublicacion(familia, menu, por, fecha), siguiente);
        return { validado: true, por, fecha };
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
