# Temas abiertos

Tareas y decisiones pendientes de definir. Cuando se resuelva una, se marca con `[x]` y se anota la decisión.

## Web

- [ ] **OI-01 · Modificar la configuración de los usuarios desde la web.** En parte hecho el 30/09/2026: desde la ficha de cada persona se cambian el peso, el objetivo, los gustos y el desayuno (colección `perfil`); la ficha se recalcula al momento y el menú al sincronizar (OI-25). Falta el resto (deporte, régimen de comidas, roles...).
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

- [x] **OI-24 · Identificar a quien valida el menú.** Descartado el 30/09/2026: el menú ya no necesita validación. Anotado en `decisions.md`. Se quitan los botones de aprobar y la herramienta `validar_menu`; lo que se come de verdad se apunta en el diario (OI-29).

- [ ] **OI-25 · Sincronizar la web con el repositorio.** La despensa, las raciones hechas (reservas), los platos no deseados, el diario, lo cocinado, los cambios de «Actualizar menú», los comentarios y la actividad que se hacen en la web se guardan en la página (colecciones `despensa`, `hechas`, `no-deseados`, `diario`, `cocinado`, `cambios`, `comentarios`, `eventos`, `perfil` y `comido`); hoy hay que pedir a Claude Code que los copie al repositorio (`data/`) para que el agente y los PDF los usen. Decidir si se automatiza (ligado a OI-01 y OI-02).

## Uso diario del menú

- [x] **OI-26 · Inventario de despensa para actualizar el menú.** Hecho: página Despensa en la web; la compra se descuenta al momento. Queda pendiente copiar el inventario al repositorio (OI-25) y que el agente cambie platos para aprovecharlo.
- [x] **OI-27 · Marcar platos como no deseados, con el motivo, para futuros menús.** Hecho: en Recetas, por persona o por la familia; el sistema no vuelve a servirlos a quien los marcó. Queda pendiente la sincronización (OI-25).
- [x] **OI-28 · Mostrar la propuesta de la semana siguiente.** Hecho: pestaña «Semana siguiente» en el menú y PDF propio. Queda pendiente la rotación de semanas (OI-14).
- [x] **OI-29 · Registrar cuando no se cumple el menú.** Hecho el 30/09/2026: botón «Diario» en cada casilla del menú (lo previsto, otro plato del recetario u otra cosa, con nota), página Diario con los cambios sobre el menú ideal, comentarios de la semana y el botón «Actualizar menú», con el que Claude revisa los días que quedan. Lo que no se cocina no se resta de la despensa. Queda pendiente que el agente aprenda de los platos que se saltan (ligado a OI-25). Lo que se planteó:
  - Dónde se marca: en la web, en cada casilla del menú, y quién puede hacerlo.
  - Qué se apunta: el plato real (de las recetas o texto libre) y quién lo comió.
  - Qué pasa con lo que no se cocinó: los ingredientes vuelven a la despensa y se proponen para otro día.
  - Cómo lo usa el agente: aprender qué platos se saltan a menudo, ajustar las cantidades y el seguimiento de calorías de quien tiene objetivo de peso.
- [x] **OI-33 · Medidas en gramos y página de Definiciones.** Hecho el 30/09/2026: recetas, despensa, compra, precios y tuppers en gramos; equivalencias en `data/equivalencias.json`; página Definiciones con términos, equivalencias, medidas caseras, tamaño de una ración y Thermomix.
- [ ] **OI-34 · Confirmar las equivalencias a gramos.** Son pesos medios supuestos: base de pizza (200 g), galletas Animadas (4 g), tortitas de maíz (7 g), yogur líquido (180 g), dorada limpia (350 g), tortillas integrales (40 g) y lata de atún (80 g). Pesarlos en casa o mirar el envase y corregir `data/equivalencias.json`.
- [x] **OI-35 · Marcar lo cocinado y pasar la compra a la despensa.** Hecho el 30/09/2026: casilla «Cocinado» con raciones en cada plato del menú (resta los ingredientes de la despensa; al desmarcar vuelven) y botón fijo «Confirmar compra» en la lista (suma lo marcado a la despensa). Las sobras (`sobrasDe`) se marcan una sola vez, en la comida donde se cocinan.
- [x] **OI-36 · Dos formas de apuntar lo cocinado.** Resuelto el 30/09/2026: una sola, «Cocinado» en cada receta (comidas del menú para las que se cocina + raciones hechas; lo que sobra va a la reserva). El menú ya no tiene casillas de cocinado.
- [ ] **OI-37 · «Nadie come aquí».** Si nadie come una comida (por ejemplo, el almuerzo de RFC cuando está de viaje), no hay forma de quitarla del menú: Claude solo puede cambiar el plato o quién come. Falta una opción para dejarla vacía, que tampoco cuente en la compra.
- [ ] **OI-38 · Revisar también lo que queda de hoy.** «Actualizar menú» solo revisa a partir de mañana. Si un aviso afecta al día de hoy (por ejemplo, alguien no cena), no lo cambia. Decidir si se incluyen las comidas de hoy que aún no se han hecho.
- [x] **OI-42 · Apuntar qué ha comido cada persona.** Hecho el 30/09/2026: en cada comida del menú salen los cuatro con una casilla (ha comido lo previsto) y el botón «Anotaciones» (otro plato, otra cosa o no come; «tampoco las demás comidas de ese día»; lo gastado de la despensa o de una ración en reserva se resta). Quien no come lo previsto se descuenta de las raciones y de la compra. Sustituye al «Diario» de la comida entera. Queda pendiente la sincronización con el proyecto (OI-25).
- [ ] **OI-39 · Motivos de los cambios de Claude.** En la primera prueba, Claude cambió una comida de la semana B diciendo que lo había pedido la familia, sin que hubiera ningún comentario ni plato no deseado que lo pidiera. Ya se le pide que no invente peticiones; conviene revisar sus propuestas antes de aplicarlas y valorar que cite el comentario en que se basa.
- [ ] **OI-40 · Coste de la cesta al día.** El coste se calcula al generar la página con la lista completa de la semana; no cambia con lo cocinado, la despensa ni las compras confirmadas.
- [x] **OI-32 · Marcar la cantidad hecha de una receta y guardar la reserva.** Hecho: en cada receta, «Marcar cantidad hecha» (raciones hechas, las que se comen esta semana, nevera o congelador y fecha). Lo que sobra queda en reserva, aparece en Despensa con la fecha límite (nevera 3 días, congelador 3 meses) y se va gastando con «Usar 1 ración». En el repositorio, las reservas con receta se descuentan de la lista de la compra cuando el menú vuelve a poner esa receta, y el agente las gasta primero al preparar la semana siguiente. Queda pendiente la sincronización web → repositorio (OI-25).
- [ ] **OI-41 · Desayuno en texto libre.** Desde el 30/09/2026 el desayuno de cada persona se puede cambiar en su ficha con texto libre. Hasta que Claude lo pase a receta, la lista de la compra sigue contando el desayuno anterior. Al sincronizar (OI-25), crear la receta del desayuno nuevo.

## Personas y hábitos

- [ ] **OI-04 · Confirmar quién toma «café solo + almuerzo para el colegio».** En los datos aparecía dos veces RFA. Se ha asignado a **RFC**; falta confirmarlo.
- [ ] **OI-05 · Desayuno de RFC el fin de semana.** Sin almuerzo, solo toma café y le faltan unas 600 kcal del desayuno. ¿Desayuna algo más en casa el sábado y el domingo?
- [ ] **OI-06 · Desayuno de RFA los días de running (L y M).** Tiene unas 170 kcal frente a unas 375 objetivo (con el objetivo de peso aceptado). Propuesta: añadir fruta o una tortita más. Pendiente de que RFA lo acepte. Pendiente por decisión del 28/09/2026; mientras tanto se mantiene su desayuno actual.
- [ ] **OI-07 · Desayuno de CCT.** Propuesta: tostada integral con tomate y queso fresco, sin azúcar, y una pieza de fruta. Pendiente de que CCT la acepte. Pendiente por decisión del 28/09/2026; mientras tanto, el menú y la compra usan su desayuno actual (tostada con aceite y azúcar).
- [x] **OI-08 · Objetivos de peso de RFA y CCT.** Aceptados el 28/09/2026: los dos, a 67,8 kg (IMC 24,9) perdiendo unos 0,5 kg por semana. RFA: 1.879 kcal/día, fecha prevista 14/12/2026. CCT: 1.623 kcal/día, fecha prevista 08/03/2027. Pendiente: consultarlo con su médico. El peso se apunta con «Cambiar peso» en la ficha de cada persona (queda un registro con la fecha); falta decidir cada cuánto.
- [ ] **OI-31 · Objetivo de peso de RFC.** Con 76 kg y 1,73 m (actualizado el 28/09/2026), su IMC es 25,4, justo por encima del límite de sobrepeso. Propuesta: 74,5 kg en unas 3 semanas con 2.089 kcal/día (gasto actual, unas 2.589). Pendiente de acordar. A tener en cuenta: tiene 18 años y nada dos días por semana, así que parte del peso puede ser músculo; el IMC no lo distingue. Conviene consultarlo con su médico antes de aceptarlo.
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
- [ ] **OI-17 · Formatos de compra.** Desde el 30/09/2026 todo va en gramos, con la equivalencia en unidades o ml (`data/equivalencias.json`). Falta pasarla a paquetes, botes y latas (por ejemplo, cuántas galletas Animadas trae un paquete).
- [ ] **OI-18 · Básicos que no se cuentan.** Sal, especias y caldo no entran en la lista. Decidir si se controlan desde la despensa.
- [ ] **OI-19 · Inventario inicial de la despensa.** Ya se puede rellenar en la página Despensa de la web. Falta hacer el primer inventario.
- [ ] **OI-20 · Tickets de compra.** Aún no hay ninguno registrado. Definir cada cuánto se suben y qué análisis se quiere ver (gasto por categoría, productos que se repiten, ahorro).

- [ ] **OI-30 · Precios reales por tienda.** Decidido el 28/09/2026: sin estimaciones; los precios de Mercadona, BM y Casa Elías se irán cargando desde los tickets de compra (registrar_ticket + registrar_precio) o a mano. El comparador y el PDF muestran costes solo cuando hay precios. Pendiente: subir los primeros tickets y confirmar los formatos de envase (galletas Animadas y tortitas de maíz por paquete). Opcional: permitir en el entorno el acceso a tienda.mercadona.es, casa-elias.com y la tienda online de BM. Primer ticket registrado (Mercadona, 28/09/2026, 80,27 €): precios guardados de lo que va a granel (pimiento rojo y brócoli). Los envases del resto (peso o unidades) están pendientes de confirmar para poder calcular su precio.

## Agente y proyecto

- [ ] **OI-21 · Probar el agente con Claude.** No se ha ejecutado contra la API. Hace falta una `ANTHROPIC_API_KEY` en `.env` y probar el flujo completo: necesidades, menú, recetas, lista de la compra y tickets.
- [x] **OI-22 · Llevar el trabajo a `main`.** Hecho el 28/09/2026: PR colladoterroba-desing/AgenteMenu#2 fusionada en `main`.
