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
- [ ] **OI-23 · Publicar como PWA (Progressive Web App).** Que se pueda instalar en el móvil como una app y consultar sin conexión (por ejemplo, la lista de la compra en el súper). Hay que decidir:
  - **Alojamiento.** La página actual no sirve: los artifacts de claude.ai no permiten service workers, que una PWA necesita para funcionar sin conexión. Opciones: GitHub Pages (con el repositorio privado exige un plan de pago o hacerlo público), Netlify, Vercel o Cloudflare Pages.
  - **Privacidad.** La web incluye datos de salud de la familia, también de una menor. Si se publica en internet, tiene que ir con acceso restringido (contraseña o cuenta) o sin esos datos.
  - **Qué funciona sin conexión.** Menú, recetas y lista de la compra, y si las casillas marcadas se sincronizan entre móviles.
  - **Identidad de la app.** Nombre, icono y colores del manifiesto.
  - **Relación con OI-01 y OI-02.** Si la app permite editar la configuración, dónde se guardan los datos. Y cómo se actualiza cuando el agente genera un menú nuevo.

- [ ] **OI-24 · Identificar a quien valida el menú.** Decidido: por el momento solo CCT puede dar por válido un menú y publicarlo, y puede pedir cambios antes (que lo devuelven a borrador). Falta decidir cómo se comprueba que es CCT: en el chat del agente se confía en que quien escribe dice la verdad, y la web no identifica a nadie. Va ligado a OI-01, OI-03 y OI-23 (cuentas o contraseña). También hay que decidir si la validación caduca (por ejemplo, un menú por semana).

- [ ] **OI-25 · Sincronizar la web con el repositorio.** La despensa y los platos no deseados que se apuntan en la web se guardan en la página; hoy hay que pedir a Claude Code que los copie a `data/despensa.json` y `data/familia.json` para que el agente los use. Decidir si se automatiza (ligado a OI-01 y OI-02).

## Uso diario del menú

- [x] **OI-26 · Inventario de despensa para actualizar el menú.** Hecho: página Despensa en la web; la compra se descuenta al momento. Queda pendiente copiar el inventario al repositorio (OI-25) y que el agente cambie platos para aprovecharlo.
- [x] **OI-27 · Marcar platos como no deseados, con el motivo, para futuros menús.** Hecho: en Recetas, por persona o por la familia; el sistema no vuelve a servirlos a quien los marcó. Queda pendiente la sincronización (OI-25).
- [x] **OI-28 · Mostrar la propuesta de la semana siguiente.** Hecho: pestaña «Semana siguiente» en el menú y PDF propio. Queda pendiente la rotación de semanas (OI-14).
- [ ] **OI-29 · Registrar cuando no se cumple el menú.** A veces se come otra cosa. Hace falta una opción para marcar una comida como «no se hizo» y apuntar lo que se comió de verdad. Hay que decidir:
  - Dónde se marca: en la web, en cada casilla del menú, y quién puede hacerlo.
  - Qué se apunta: el plato real (de las recetas o texto libre) y quién lo comió.
  - Qué pasa con lo que no se cocinó: los ingredientes vuelven a la despensa y se proponen para otro día.
  - Cómo lo usa el agente: aprender qué platos se saltan a menudo, ajustar las cantidades y el seguimiento de calorías de quien tiene objetivo de peso.

## Personas y hábitos

- [ ] **OI-04 · Confirmar quién toma «café solo + almuerzo para el colegio».** En los datos aparecía dos veces RFA. Se ha asignado a **RFC**; falta confirmarlo.
- [ ] **OI-05 · Desayuno de RFC el fin de semana.** Sin almuerzo, solo toma café y le faltan unas 600 kcal del desayuno. ¿Desayuna algo más en casa el sábado y el domingo?
- [ ] **OI-06 · Desayuno de RFA los días de running (L y M).** Tiene unas 170 kcal frente a unas 375 objetivo (con el objetivo de peso aceptado). Propuesta: añadir fruta o una tortita más. Pendiente de que RFA lo acepte. Pendiente por decisión del 28/09/2026; mientras tanto se mantiene su desayuno actual.
- [ ] **OI-07 · Desayuno de CCT.** Propuesta: tostada integral con tomate y queso fresco, sin azúcar, y una pieza de fruta. Pendiente de que CCT la acepte. Pendiente por decisión del 28/09/2026; mientras tanto, el menú y la compra usan su desayuno actual (tostada con aceite y azúcar).
- [x] **OI-08 · Objetivos de peso de RFA y CCT.** Aceptados el 28/09/2026: los dos, a 67,8 kg (IMC 24,9) perdiendo unos 0,5 kg por semana. RFA: 1.879 kcal/día, fecha prevista 14/12/2026. CCT: 1.623 kcal/día, fecha prevista 08/03/2027. Pendiente: consultarlo con su médico y decidir cómo se registra el peso cada 2 semanas.
- [ ] **OI-09 · Merienda.** Se ha supuesto que meriendan los cuatro de lunes a viernes y nadie el fin de semana. Confirmar.
- [ ] **OI-10 · Pescado para RFA.** «No come mucho pescado». Con la norma del pescado azul (solo los jueves a mediodía, cuando RFA no come en casa), la semana A tiene merluza el miércoles por la noche (RFA toma tortilla), gambas el sábado y dorada el domingo. Confirmar si RFA come estas dos últimas.
- [ ] **OI-11 · Energía según el día.** Las raciones usan el gasto medio de la semana. Valorar si se ajustan por día (más en días de entreno o partido).

## Tuppers y almuerzos

- [ ] **OI-12 · Días y medios en la oficina.** Se ha supuesto tupper de RFA y CCT de lunes a miércoles. Confirmar, y si CCT tiene microondas y RFA nevera en la oficina.
- [ ] **OI-13 · Almuerzo de RFC.** Confirmar que no tiene nevera en el colegio y si le gustan los almuerzos: bocadillos de pollo asado, jamón serrano y queso fresco, más un día de yogur bebible con frutos secos. Todos se preparan la noche anterior.

## Menú y recetas

- [ ] **OI-14 · Rotación de semanas.** Ya hay propuesta de la semana B (`data/menu-siguiente.json`), que se ve en la web y sale en PDF. Falta decidir cuándo y cómo la siguiente pasa a ser la actual (por ejemplo, el domingo) y quién genera la nueva siguiente. Ojo: el batch del domingo de la semana B se cocina el domingo de la semana A.
- [ ] **OI-15 · Valor nutricional de las recetas.** No se calculan las kcal de cada receta, así que no se comprueba que el plato cubra la ración objetivo. Valorar usar una tabla de composición de alimentos (por ejemplo, BEDCA).

## Lista de la compra y despensa

- [ ] **OI-16 · Cantidades que conviene revisar.** Pan integral: unos 3,5 kg por semana. Resuelto para las doradas: los ingredientes pueden marcarse «por persona» (una dorada por comensal). Falta revisar si hay más casos (huevos, filetes).
- [ ] **OI-17 · Formatos de compra.** La lista va en g, ml y unidades. Falta pasarla a paquetes, botes y latas (por ejemplo, cuántas galletas Animadas trae un paquete).
- [ ] **OI-18 · Básicos que no se cuentan.** Sal, especias y caldo no entran en la lista. Decidir si se controlan desde la despensa.
- [ ] **OI-19 · Inventario inicial de la despensa.** Ya se puede rellenar en la página Despensa de la web. Falta hacer el primer inventario.
- [ ] **OI-20 · Tickets de compra.** Aún no hay ninguno registrado. Definir cada cuánto se suben y qué análisis se quiere ver (gasto por categoría, productos que se repiten, ahorro).

- [ ] **OI-30 · Precios reales por tienda.** Decidido el 28/09/2026: sin estimaciones; los precios de Mercadona, BM y Casa Elías se irán cargando desde los tickets de compra (registrar_ticket + registrar_precio) o a mano. El comparador y el PDF muestran costes solo cuando hay precios. Pendiente: subir los primeros tickets y confirmar los formatos de envase (galletas Animadas y tortitas de maíz por paquete). Opcional: permitir en el entorno el acceso a tienda.mercadona.es, casa-elias.com y la tienda online de BM.

## Agente y proyecto

- [ ] **OI-21 · Probar el agente con Claude.** No se ha ejecutado contra la API. Hace falta una `ANTHROPIC_API_KEY` en `.env` y probar el flujo completo: necesidades, menú, recetas, lista de la compra y tickets.
- [ ] **OI-22 · Llevar el trabajo a `main`.** Todo está en la rama `claude/init-repo-menu-agent-surwuu`. Decidir si se abre una pull request.
