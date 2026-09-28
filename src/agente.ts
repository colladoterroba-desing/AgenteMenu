import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { Almacen } from "./almacen.js";
import { crearHerramientas } from "./herramientas.js";

const MODELO = "claude-opus-5";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SISTEMA = `Eres AgenteMenú, el asistente de cocina de una familia. Hablas en español de España, con un tono cercano y práctico.

Tu trabajo:
1. Revisar talla, peso y actividad de cada miembro (calcular_necesidades) para dimensionar las raciones. Si un adulto tiene sobrepeso, propón un objetivo de peso y un plazo, explícalo y ACUÉRDALO con el usuario antes de guardarlo con guardar_objetivo. Recomienda consultarlo con su médico. Con menores no hay restricciones calóricas: se prioriza el crecimiento y el rendimiento deportivo.
2. Crear un menú semanal sano y equilibrado (dieta mediterránea: legumbres 2-4 veces/semana, pescado 3-4, verdura en comida y cena, fruta a diario, carne roja como mucho 1-2, ultraprocesados ocasionales), con desayuno, comida, merienda (L-V) y cena. Usa planificar_comensales: indica para cada comida quién come en casa y la ración de cada uno.
3. Respetar las preferencias de la casa (familia.preferencias, p. ej. leche siempre semidesnatada) y los desayunos habituales de cada uno (familia.desayunos): no se cambian salvo que se proponga una mejora y la familia la acepte. Quien tiene almuerzo (regimen.almuerzo) se lleva algo de media mañana que aguante sin nevera; va en el menú como «almuerzo». Respeta también familia.restricciones (p. ej. salmón, atún, anchoas y sardinas solo el jueves a mediodía). Por las mañanas no se cocina: almuerzos y tuppers se preparan la noche anterior o en el batch, y las recetas marcadas alMomento (tortilla francesa) solo se sirven en comidas y cenas en casa. Da prioridad a familia.platosHabituales (cenas fáciles de huevo, purés y cremas, carnes a la plancha...) y pon huevo varias veces por semana; una comida puede tener primero y segundo (campo segundo). Las legumbres, solo en comidas en las que esté RFA o CCT (familia.supervision). Los días que RFA y CCT no comen en casa, aprovecha para dar a RFC y AFC pasta o platos más calóricos (siempre de plancha o para recalentar). Evita los platos de familia.noDeseados (con su motivo) para quien los marcó; guardar_menu rechaza los menús que incumplen estas normas. Si hay productos en la despensa (ver_despensa), da prioridad a platos que los aprovechen, sobre todo lo que caduca antes. Además del menú de esta semana, propón el de la siguiente (menu-siguiente) como borrador.
4. Respetar gustos (p. ej. RFA come poco pescado: ofrécele alternativas o preparaciones que le gusten más) y alergias.
5. Adaptar la cocina a quién está: si CCT no está en casa, la comida debe hacerse a la plancha o dejarse preparada para recalentar. Planifica batch cooking (qué cocinar, cuándo y cuánto tiempo), aprovechando que hay comidas y cenas que se pueden duplicar.
6. Incluir en el menú los tuppers de oficina que indique planificar_comensales. Los fríos (RFA) deben poder comerse sin calentar y aguantar en bolsa isotérmica: ensaladas completas de legumbre, pasta, arroz o quinoa, wraps, tortillas; con proteína, hidrato, verdura y fruta. Los de recalentar (CCT) salen idealmente de una ración extra de la cena anterior o del batch cooking, y ese mismo plato puede servir de comida para RFC y AFC ese día. Añade sus ingredientes a la lista de la compra.
7. Ajustar la carga de los días de deporte (más hidratos antes de entrenar, proteína y recuperación después, partido de AFC los sábados).
8. Generar la lista de la compra agrupada por secciones del supermercado, descontando lo que ya hay en la despensa (ver_despensa) y dando prioridad a lo que caduca antes y a las sobras.
9. Registrar tickets de compra (registrar_ticket) y usar resumen_habitos para detectar hábitos y proponer mejoras de salud y de ahorro. Al registrar un ticket, guarda también con registrar_precio el precio de cada línea que corresponda a un ingrediente de las recetas (nombre exacto del ingrediente, tienda, envase). La familia compra sobre todo en Mercadona y a veces en BM y Casa Elías (Madrid): con coste_cesta compara el coste de la compra en cada tienda y la combinación más barata, y deja claro qué parte es estimación.

Para fijar el menú: guarda cada receta nueva con guardar_receta (cantidades por ración de referencia) y el menú con guardar_menu, que lo deja en borrador. Solo quien figure en familia.permisos.validarMenu (CCT) puede dar el menú por válido y publicarlo: antes de llamar a validar_menu pregunta quién eres hablando y pide su confirmación explícita. CCT puede pedir cambios; aplícalos con guardar_menu (el menú vuelve a borrador) y muéstrale el resultado antes de validar. La vista web (npm run web) indica si el menú es borrador o está validado. La lista de la compra sale de lista_compra. Los planes de cocina u otros documentos, guárdalos con guardar_documento en Markdown. No inventes datos de la familia: consúltalos con las herramientas. Si falta información importante, pregúntala.`;

const TIPOS_IMAGEN = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
} as const;

/** Convierte "/ticket ruta" en un mensaje con la imagen o el PDF del ticket adjunto. */
async function mensajeTicket(ruta: string): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  const datos = (await readFile(ruta)).toString("base64");
  const extension = path.extname(ruta).toLowerCase();
  const instruccion: Anthropic.Beta.BetaTextBlockParam = {
    type: "text",
    text: "Este es un ticket de compra. Transcríbelo y regístralo con registrar_ticket. Si alguna línea es ilegible, dímelo.",
  };
  if (extension === ".pdf") {
    return [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: datos } },
      instruccion,
    ];
  }
  const mediaType = TIPOS_IMAGEN[extension as keyof typeof TIPOS_IMAGEN];
  if (!mediaType) throw new Error(`Formato no soportado: ${extension} (usa jpg, png, webp, gif o pdf)`);
  return [{ type: "image", source: { type: "base64", media_type: mediaType, data: datos } }, instruccion];
}

async function main() {
  const client = new Anthropic();
  const herramientas = crearHerramientas(new Almacen(path.join(RAIZ, "data")));
  const mensajes: Anthropic.Beta.BetaMessageParam[] = [];
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log("AgenteMenú listo. Escribe tu petición, '/ticket <ruta>' para añadir un ticket o '/salir'.");
  console.log("Sugerencia: «Revisa las necesidades de la familia y prepárame el menú de la semana».\n");

  while (true) {
    const entrada = (await rl.question("> ")).trim();
    if (!entrada) continue;
    if (entrada === "/salir") break;

    const inicio = mensajes.length;
    try {
      const contenido = entrada.startsWith("/ticket ")
        ? await mensajeTicket(entrada.slice("/ticket ".length).trim())
        : entrada;
      mensajes.push({ role: "user", content: contenido });
      await turno(client, herramientas, mensajes);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) {
        console.error("Credenciales no válidas: revisa ANTHROPIC_API_KEY en .env");
        break;
      } else if (e instanceof Anthropic.RateLimitError) {
        console.error("Límite de peticiones alcanzado; inténtalo en un momento.");
      } else if (e instanceof Anthropic.APIError) {
        console.error(`Error de la API (${e.status}): ${e.message}`);
      } else {
        console.error(e instanceof Error ? e.message : e);
      }
      // Descarta el turno fallido para que el historial siga siendo válido.
      mensajes.length = inicio;
    }
  }
  rl.close();
}

/** Ejecuta el bucle de herramientas hasta que Claude termina su respuesta. */
async function turno(
  client: Anthropic,
  herramientas: ReturnType<typeof crearHerramientas>,
  mensajes: Anthropic.Beta.BetaMessageParam[],
) {
  let reintentosJson = 0;
  while (true) {
    const stream = client.beta.messages.stream({
      model: MODELO,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      cache_control: { type: "ephemeral" },
      system: SISTEMA,
      tools: herramientas.definiciones,
      messages: mensajes,
    });
    stream.on("text", (delta) => process.stdout.write(delta));

    let mensaje: Anthropic.Beta.BetaMessage;
    try {
      mensaje = await stream.finalMessage();
      reintentosJson = 0;
    } catch (e) {
      // Con eager_input_streaming, una entrada de herramienta ilegible rechaza aquí: se reintenta.
      if (e instanceof Anthropic.APIError || reintentosJson++ >= 2) throw e;
      continue;
    }

    if (mensaje.stop_reason === "refusal") throw new Error("\n[La petición no se ha podido completar.]");
    mensajes.push({ role: "assistant", content: mensaje.content });
    if (mensaje.stop_reason === "pause_turn") continue;

    const usos = mensaje.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (usos.length === 0) {
      process.stdout.write("\n\n");
      return;
    }
    if (mensaje.stop_reason === "max_tokens") {
      throw new Error("Respuesta cortada por max_tokens mientras llamaba a una herramienta.");
    }

    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const uso of usos) {
      process.stdout.write(`\n  · ${uso.name}\n`);
      const { contenido, error } = await herramientas.ejecutar(uso.name, uso.input);
      resultados.push({ type: "tool_result", tool_use_id: uso.id, content: contenido, is_error: error });
    }
    mensajes.push({ role: "user", content: resultados });
  }
}

main();
