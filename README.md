# Agente Planificador de Menú Familiar

**AgenteMenu** es un agente de menú familiar: un asistente inteligente, basado en Claude, que ayuda a planificar las comidas de la familia de forma sencilla, variada y equilibrada.

## ¿Qué hace?

- ⚖️ **Calcula las raciones de cada miembro** a partir de su edad, altura, peso y deporte. Si un adulto tiene sobrepeso, propone un objetivo y un plazo que acuerda contigo.
- 🍽️ **Genera el menú semanal**: desayuno, comida, merienda (L-V) y cena, según quién come en casa cada día.
- 👩‍🍳 **Planifica recetas y tiempos de cocina** según quién puede cocinar (si solo están los que hacen plancha, lo tiene en cuenta).
- 🛒 **Crea la lista de la compra** descontando lo que ya hay en la despensa.
- ♻️ **Reaprovecha las sobras** y da prioridad a lo que caduca antes.
- 🧾 **Aprende de tus tickets de compra** (foto o PDF) para detectar hábitos y proponer mejoras.

Todas las cantidades van en **gramos**; las equivalencias de lo que se cuenta por unidades o por volumen están en [data/equivalencias.json](data/equivalencias.json). Los requisitos completos están en [docs/REQUISITOS.md](docs/REQUISITOS.md) y la propuesta de tuppers para la oficina en [docs/propuestas/tuppers-oficina.md](docs/propuestas/tuppers-oficina.md). Los temas pendientes de definir están en [open-issues.md](open-issues.md).

## Puesta en marcha

Necesitas Node.js 22 o superior y una clave de la API de Anthropic.

```bash
npm install
cp .env.example .env      # y pon tu ANTHROPIC_API_KEY
npm start
```

Ejemplos de uso en el chat:

```
> Revisa las necesidades de la familia y prepárame el menú de la semana
> Hazme la lista de la compra y el plan de cocina del domingo
> Han sobrado 3 raciones de lentejas
> /ticket tickets/mercadona-27-09.jpg
> ¿En qué gastamos más?
```

Los documentos generados (menú, lista de la compra, plan de cocina) se guardan en `salidas/`.

Para ver los resultados en el navegador (menú de la semana, recetas, lista de la compra, personas y tuppers):

```bash
npm run web   # genera salidas/resultados.html
npm run pdf   # menú (A4 horizontal) y lista de la compra (A4 vertical) de esta semana y la siguiente, en salidas/
```

La web tiene las páginas Menú (esta semana y la siguiente), Diario, Recetas, Compra, Despensa, Tuppers, Normas, Definiciones y Configuración. Las personas aparecen con su nombre (alias) en lugar de las siglas:

- **Menú:** pestañas «Semana en curso» y «Próxima semana». Cuando empieza la próxima semana, pasa sola a ser la semana en curso (y `npm run web`, `npm run pdf` y el agente mueven su menú a `data/menu-semana.json` y guardan el anterior en `data/historial/`); después hay que pedir a Claude la nueva próxima semana. Los días que ya han pasado se ocultan. Lo cocinado se ve con «✓ Cocinado» (se marca en la receta). Si no se apunta nada, se da por comido lo previsto; con **Anotaciones** se apunta quién comió otra cosa o no come (una o varias personas, y varias anotaciones por comida) y lo que se gastó de la despensa. Quien no come lo previsto se descuenta de las raciones y de la compra. El botón **Actualizar menú** pide a Claude que revise los días que quedan con el diario, los comentarios y la despensa; tú eliges qué cambios se aplican. El menú no necesita validación.
- **Diario:** comentarios de la semana (por ejemplo, «RFC no come X, J y V»), cambios sobre el menú ideal, lo cocinado y la actividad.
- **Compra:** lo que falta para lo que queda de semana, en gramos, sin lo que ya hay en casa. Al marcar productos aparece **Confirmar compra** (abajo a la derecha), que los suma a la despensa.
- **Despensa:** añadir cualquier producto, lo que hay en casa, reservas de raciones cocinadas y lo que pide el menú.
- **Recetas:** cantidades en gramos con la equivalencia en unidades o ml. **Cocinado**: eliges para qué comidas del menú has cocinado y cuántas raciones has hecho; se restan los ingredientes de la despensa, esas comidas dejan de contar en la compra y lo que sobra queda en reserva. También se marca un plato como no deseado. Las recetas que no se cocinan (bocadillos, yogures, desayunos fijos) no salen en la lista: se abren desde el menú y se restan solas de la despensa el día que tocan.
- **Normas:** normas de la casa, alergias y quién cocina.
- **Configuración:** régimen de comidas (en color: en casa, tupper frío, tupper para recalentar y almuerzo), reparto de la energía y una ficha por persona. En la ficha se cambian el peso, el objetivo de peso (con «¿Aceptar?» Sí/No), los gustos y el desayuno; la ficha se recalcula al momento, y el menú y la compra cuando se sincronizan los datos con el proyecto.
- **Definiciones:** términos de la página, equivalencias a gramos, medidas caseras, tamaño de una ración y Thermomix.

Todo lo que se apunta se guarda en la propia página publicada en claude.ai. Para publicarla, la página necesita las capacidades `db` (datos guardados) y `sample` (el botón «Actualizar menú»). Colecciones que usa: `despensa`, `no-deseados`, `hechas`, `diario`, `cambios`, `cocinado`, `comentarios`, `eventos`, `perfil` y `comido`. Para llevar esos datos al repositorio (y que el agente los use al hacer los siguientes menús), se sincroniza sola cada noche hacia las 23:30 (tarea programada de Claude); también se puede pedir en cualquier momento a Claude Code con «sincroniza». Claude solo copia las colecciones de la página y ejecuta `npm run sincronizar`, que une sin IA la despensa, las reservas, los no deseados y los perfiles con `data/`, guarda una copia de todo lo apuntado en `data/web/` (el agente la lee con `ver_apuntes_web`) y vuelve a generar la página; después Claude la publica. Los pasos están en `.claude/skills/sincronizar/SKILL.md`. Si hay diferencias, manda lo apuntado en la web.

`npm run pdf` usa Chromium mediante Playwright: el de Playwright si está instalado, si no Google Chrome, o el que indique la variable `CHROMIUM_PATH`.

## Estructura

| Ruta | Contenido |
|---|---|
| `data/familia.json` | Perfil de la familia: miembros, deporte, gustos, régimen de comidas, roles y objetivos |
| `data/despensa.json` | Productos en casa y sobras |
| `data/tickets.json` | Tickets de compra registrados |
| `data/recetas.json` | Recetas con ingredientes por ración de referencia y pasos |
| `data/menu-semana.json` | Menú de la semana: plato de cada comida, variantes, tuppers, batch y sobras (`sobrasDe`) |
| `data/menu-siguiente.json` | Propuesta de menú de la semana siguiente |
| `src/nutricion.ts` | IMC, metabolismo basal, gasto diario, objetivos y factor de ración |
| `src/planificacion.ts` | Rejilla semanal de comensales, kcal por comida y quién cocina |
| `src/menu.ts` | Une menú y comensales, escala raciones y calcula la lista de la compra |
| `src/almacen.ts` | Lectura y escritura de datos y resumen de hábitos de compra |
| `src/herramientas.ts` | Herramientas que usa el agente |
| `src/agente.ts` | Chat de terminal con Claude |
| `src/web.ts` | Vista web de los resultados |
| `src/web-cliente.js` | Script de la página: diario, cocinado, compra, despensa y «Actualizar menú» |
| `src/unidades.ts` | Paso a gramos con las equivalencias |
| `data/equivalencias.json` | Gramos por unidad y por ml de cada producto, y medidas caseras |
| `src/pdf.ts` | PDF del menú y de la lista de la compra |
| `src/sincronizar.ts` | Une lo apuntado en la web con `data/` (`npm run sincronizar`) |
| `data/web/` | Copia de lo apuntado en la web (diario, anotaciones, cocinado, cambios, comentarios...) |
| `data/propuesta-tuppers.json` | Rotación de tuppers de oficina |
| `data/precios.json` | Precios reales por tienda (Mercadona, BM, Elías), cargados desde los tickets |
| `src/precios.ts` | Coste de la cesta por tienda y combinación más barata |

## Desarrollo

```bash
npm test          # tests
npm run typecheck # comprobación de tipos
```

> ⚠️ Los cálculos nutricionales son orientativos y no sustituyen el consejo de un profesional sanitario.

## Página estática `index.html` (GitHub Pages)

`index.html` es un generador de menús sencillo que funciona sin servidor (independiente del agente y de la web de `npm run web`).

La web está en `index.html` y funciona sin servidor. Para publicarla gratis:

1. En GitHub: **Settings → Pages**.
2. En *Source* elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`.
3. En unos minutos estará en `https://colladoterroba-desing.github.io/AgenteMenu/`.
