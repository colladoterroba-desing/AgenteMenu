# Temas abiertos

Tareas y decisiones pendientes de definir. Cuando se resuelva una, se marca con `[x]` y se anota la decisión.

## Web

- [ ] **OI-01 · Modificar la configuración de los usuarios desde la web.**
  Ahora la página de Configuración solo se puede consultar: los datos salen de `data/familia.json` y cualquier cambio pasa por el agente o por editar el fichero y volver a generar la página. Hay que decidir:
  - Qué se puede editar (peso, deporte, gustos, desayunos, régimen de comidas, roles...) y quién puede hacerlo.
  - Dónde se guardan los cambios: en la propia página (base de datos del artifact, compartida entre quienes la abran) o en el repositorio. Si se guardan en la página, hay que definir cómo llegan después a `data/familia.json` para que el agente los use.
  - Si al cambiar un dato se recalculan al momento raciones, menú y lista de la compra.
- [ ] **OI-02 · Actualización de la página.** Hoy hay que ejecutar `npm run web` y volver a publicar a mano. Definir si se automatiza (por ejemplo, al guardar un menú nuevo con el agente).
- [ ] **OI-03 · Compartir la página con la familia.** Es privada. Decidir si se comparte, con quién y si cada persona tiene su propia vista.

## Personas y hábitos

- [ ] **OI-04 · Confirmar quién toma «café solo + almuerzo para el colegio».** En los datos aparecía dos veces RFA. Se ha asignado a **RFC**; falta confirmarlo.
- [ ] **OI-05 · Desayuno de RFC el fin de semana.** Sin almuerzo, solo toma café y le faltan unas 600 kcal del desayuno. ¿Desayuna algo más en casa el sábado y el domingo?
- [ ] **OI-06 · Desayuno de RFA los días de running (L y M).** Tiene unas 170 kcal frente a unas 470 objetivo. Propuesta: añadir fruta o una tortita más. Pendiente de que RFA lo acepte.
- [ ] **OI-07 · Desayuno de CCT.** Propuesta: tostada integral con tomate y queso fresco, sin azúcar, y una pieza de fruta. Pendiente de que CCT la acepte.
- [ ] **OI-08 · Objetivos de peso de RFA y CCT.** Hay propuestas calculadas (67,8 kg: RFA en unas 11 semanas y CCT en unas 23), pero no se aplican hasta acordarlas. Recomendable consultarlas antes con su médico.
- [ ] **OI-09 · Merienda.** Se ha supuesto que meriendan los cuatro de lunes a viernes y nadie el fin de semana. Confirmar.
- [ ] **OI-10 · Pescado para RFA.** «No come mucho pescado»: de las 4 comidas de pescado de la semana, RFA tiene plato alternativo en 2. Confirmar si es la proporción adecuada.
- [ ] **OI-11 · Energía según el día.** Las raciones usan el gasto medio de la semana. Valorar si se ajustan por día (más en días de entreno o partido).

## Tuppers y almuerzos

- [ ] **OI-12 · Días y medios en la oficina.** Se ha supuesto tupper de RFA y CCT de lunes a miércoles. Confirmar, y si CCT tiene microondas y RFA nevera en la oficina.
- [ ] **OI-13 · Almuerzo de RFC.** Confirmar que no tiene nevera en el colegio (las propuestas aguantan sin ella) y si le gustan los tres almuerzos propuestos.

## Menú y recetas

- [ ] **OI-14 · Menú de la semana B.** Solo existe la rotación de tuppers de la semana B. Falta el menú completo y decidir cómo rotan las semanas.
- [ ] **OI-15 · Valor nutricional de las recetas.** No se calculan las kcal de cada receta, así que no se comprueba que el plato cubra la ración objetivo. Valorar usar una tabla de composición de alimentos (por ejemplo, BEDCA).

## Lista de la compra y despensa

- [ ] **OI-16 · Cantidades que conviene revisar.** Pan integral: unos 3,5 kg por semana. Doradas: salen 5 porque las raciones suman 4,5, aunque con 4 basta. Definir qué ingredientes van «por persona» (una dorada, un huevo) en lugar de escalarse con la ración.
- [ ] **OI-17 · Formatos de compra.** La lista va en g, ml y unidades. Falta pasarla a paquetes, botes y latas (por ejemplo, cuántas galletas Animadas trae un paquete).
- [ ] **OI-18 · Básicos que no se cuentan.** Sal, especias y caldo no entran en la lista. Decidir si se controlan desde la despensa.
- [ ] **OI-19 · Inventario inicial de la despensa.** `data/despensa.json` está vacío, así que no se descuenta nada de la compra.
- [ ] **OI-20 · Tickets de compra.** Aún no hay ninguno registrado. Definir cada cuánto se suben y qué análisis se quiere ver (gasto por categoría, productos que se repiten, ahorro).

## Agente y proyecto

- [ ] **OI-21 · Probar el agente con Claude.** No se ha ejecutado contra la API. Hace falta una `ANTHROPIC_API_KEY` en `.env` y probar el flujo completo: necesidades, menú, recetas, lista de la compra y tickets.
- [ ] **OI-22 · Llevar el trabajo a `main`.** Todo está en la rama `claude/init-repo-menu-agent-surwuu`. Decidir si se abre una pull request.
