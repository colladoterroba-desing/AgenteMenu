# Temas abiertos

Tareas y decisiones pendientes de definir. Cuando se resuelva una, se marca con `[x]` y se anota la decisión.

## Web

- [x] **OI-01 · Modificar la configuración de los usuarios desde la web.** Hecho el 01/10/2026: desde la ficha de cada persona se cambian el peso, el objetivo, los gustos, el desayuno, el **deporte**, las **comidas en casa** (comida, cena, tupper y almuerzo) y el **papel en la cocina** (colección `perfil`). La ficha se recalcula al momento; el menú, las raciones y la compra, al sincronizar por la noche.
- [ ] **OI-02 · Actualización de la página.** Hoy hay que ejecutar `npm run web` y volver a publicar a mano. Definir si se automatiza (por ejemplo, al guardar un menú nuevo con el agente).
- [ ] **OI-03 · Compartir la página con la familia.** Es privada. Decidir si se comparte, con quién y si cada persona tiene su propia vista.
- [ ] **OI-23 · Publicar como PWA (Progressive Web App).** Que se pueda instalar en el móvil como una app y consultar sin conexión (por ejemplo, la lista de la compra en el súper). Hay que decidir:
  - **Alojamiento.** La página actual no sirve: los artifacts de claude.ai no permiten service workers, que una PWA necesita para funcionar sin conexión. Opciones: GitHub Pages (con el repositorio privado exige un plan de pago o hacerlo público), Netlify, Vercel o Cloudflare Pages.
  - **Privacidad.** La web incluye datos de salud de la familia, también de una menor. Si se publica en internet, tiene que ir con acceso restringido (contraseña o cuenta) o sin esos datos.
  - **Qué funciona sin conexión.** Menú, recetas y lista de la compra, y si las casillas marcadas se sincronizan entre móviles.
  - **Identidad de la app.** Nombre, icono y colores del manifiesto.
  - **Relación con OI-01 y OI-02.** Si la app permite editar la configuración, dónde se guardan los datos. Y cómo se actualiza cuando el agente genera un menú nuevo.

- [x] **OI-24 · Identificar a quien valida el menú.** Descartado el 30/09/2026: el menú ya no necesita validación. Anotado en `decisions.md`. Se quitan los botones de aprobar y la herramienta `validar_menu`; lo que se come de verdad se apunta en el diario (OI-29).

- [x] **OI-25 · Sincronizar la web con el repositorio.** Hecho el 30/09/2026: una tarea programada copia cada noche (hacia las 23:30) lo apuntado en la web, `npm run sincronizar` lo une con el proyecto sin IA, regenera y publica la página y guarda los datos en `main`. Los cambios de «Actualizar menú» también pasan al menú del proyecto. La noche del 30/09/2026 se publicó la página pero los datos no llegaron a `main`; se recuperaron a mano el 01/10/2026 y la tarea ahora comprueba que se han guardado.

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
- [x] **OI-34 · Confirmar las equivalencias a gramos.** Decidido el 30/09/2026: se usan los pesos estimados de `data/equivalencias.json` (base de pizza 200 g, galletas Animadas 4 g, tortitas de maíz 7 g, yogur líquido 180 g, lubina limpia 350 g, tortillas integrales 40 g, lata de atún 80 g). Se corrigen si algún día se pesan.
- [x] **OI-35 · Marcar lo cocinado y pasar la compra a la despensa.** Hecho el 30/09/2026: casilla «Cocinado» con raciones en cada plato del menú (resta los ingredientes de la despensa; al desmarcar vuelven) y botón fijo «Confirmar compra» en la lista (suma lo marcado a la despensa). Las sobras (`sobrasDe`) se marcan una sola vez, en la comida donde se cocinan.
- [x] **OI-36 · Dos formas de apuntar lo cocinado.** Resuelto el 30/09/2026: una sola, «Cocinado» en cada receta (comidas del menú para las que se cocina + raciones hechas; lo que sobra va a la reserva). El menú ya no tiene casillas de cocinado.
- [x] **OI-37 · «Nadie come aquí».** Hecho el 01/10/2026: en «Anotaciones» de cada comida, botones «Nadie come aquí» y «Nadie come en todo el día» (útil para los fines de semana). Esas comidas no se cocinan ni cuentan en la compra. Claude también puede proponerlo en «Actualizar menú».
- [x] **OI-38 · Revisar también lo que queda de hoy.** Descartado el 01/10/2026: «Actualizar menú» sigue revisando solo desde mañana.
- [x] **OI-42 · Apuntar qué ha comido cada persona.** Hecho el 30/09/2026: sin anotación se da por comido lo previsto; cada comida tiene un botón «Anotaciones» con una o varias anotaciones, cada una con sus personas (no come, otra cosa, otro plato o nota; lo gastado de la despensa o de una reserva se resta). Quien no come lo previsto se descuenta de las raciones y de la compra. Queda pendiente la sincronización con el proyecto (OI-25).
- [x] **OI-39 · Motivos de los cambios de Claude.** Hecho el 01/10/2026: Claude explica cada cambio en una frase corta (15 palabras como mucho) y, si sale de un comentario de la familia, cita sus palabras. La familia sigue eligiendo qué cambios se aplican.
- [x] **OI-40 · Coste de la cesta al día.** Decidido el 01/10/2026: la web y el PDF no muestran costes hasta que haya bastantes tickets; se valorará más adelante. Los precios se siguen guardando desde los tickets (`MOSTRAR_COSTES` en `src/precios.ts`).
- [x] **OI-32 · Marcar la cantidad hecha de una receta y guardar la reserva.** Hecho: en cada receta, «Marcar cantidad hecha» (raciones hechas, las que se comen esta semana, nevera o congelador y fecha). Lo que sobra queda en reserva, aparece en Despensa con la fecha límite (nevera 3 días, congelador 3 meses) y se va gastando con «Usar 1 ración». En el repositorio, las reservas con receta se descuentan de la lista de la compra cuando el menú vuelve a poner esa receta, y el agente las gasta primero al preparar la semana siguiente. Queda pendiente la sincronización web → repositorio (OI-25).
- [x] **OI-41 · Desayuno en texto libre.** Hecho el 01/10/2026: la sincronización de cada noche pasa a receta los desayunos nuevos escritos en la web (con cantidades en gramos) y los pone como desayuno de esa persona.

- [ ] **OI-43 · Asistente de voz (Alexa o similar).** Añadido el 05/10/2026. Planificar un asistente de voz para usar el menú sin tocar el móvil (por ejemplo, con las manos ocupadas en la cocina). Está solo planteado, nada decidido. Hay que definir:
  - **Qué se le pide.** Ideas: «¿qué hay de comer hoy?», «¿qué cenamos?», leer los pasos de una receta, «añade leche a la lista de la compra», «¿qué hay en la despensa?», «he cocinado el pollo guisado».
  - **Qué asistente.** Alexa, Google Assistant o Siri; cuál hay en casa y en qué aparatos (altavoz, móvil).
  - **Solo preguntar o también apuntar.** Leer el menú y la lista es lo más sencillo; apuntar cosas (cocinado, despensa, lista) obliga a que la voz escriba en la web, y hoy lo apuntado en la web solo se copia al proyecto cada noche (OI-25).
  - **Dónde vive.** La página actual es privada y no se puede consultar desde fuera; un asistente necesita un servicio en internet que le conteste. Va ligado a OI-23 (alojamiento y privacidad).
  - **Privacidad.** El menú y las fichas incluyen datos de salud de la familia, también de una menor. El asistente no debería leer en voz alta pesos ni objetivos.
  - **Quién habla.** Si el asistente distingue a cada persona o es uno para toda la casa (afecta a las anotaciones por persona).
  - **Coste y mantenimiento.** Cuánto cuesta y quién lo mantiene si algo falla.
  - **Relación con otros temas.** OI-23 (PWA y alojamiento), OI-25 (sincronización) y OI-02 (actualización de la página).

## Personas y hábitos

- [x] **OI-04 · Confirmar quién toma «café solo + almuerzo para el colegio».** Confirmado el 30/09/2026: es **RFC**.
- [x] **OI-05 · Desayuno de RFC el fin de semana.** Descartado el 30/09/2026: los fines de semana la familia no sigue el menú. El sábado y el domingo se dejan en el menú como están.
- [x] **OI-06 · Desayuno de RFA los días de running (L y M).** Descartado el 30/09/2026: RFA no acepta la propuesta (añadir fruta o una tortita más). Mantiene su desayuno actual.
- [x] **OI-07 · Desayuno de CCT.** Aceptado el 30/09/2026: café cortado, tostada integral con aceite y tomate, queso fresco y una pieza de fruta, sin azúcar (receta `desayuno-cct`). El menú y la compra ya lo usan.
- [x] **OI-08 · Objetivos de peso de RFA y CCT.** Aceptados el 28/09/2026: los dos, a 67,8 kg (IMC 24,9) perdiendo unos 0,5 kg por semana. RFA: 1.879 kcal/día, fecha prevista 14/12/2026. CCT: 1.623 kcal/día, fecha prevista 08/03/2027. Pendiente: consultarlo con su médico. El peso se apunta con «Cambiar peso» en la ficha de cada persona (queda un registro con la fecha); falta decidir cada cuánto.
- [x] **OI-31 · Objetivo de peso de RFC.** Descartado el 30/09/2026: no se define objetivo de peso para RFC.
- [x] **OI-09 · Merienda.** Resuelto el 30/09/2026: meriendan los cuatro de lunes a viernes. El fin de semana no importa: la familia no sigue el menú esos días.
- [x] **OI-10 · Pescado para RFA.** Resuelto el 30/09/2026: RFA come gambas; mejor lubina que dorada, así que la dorada al horno se cambia por **lubina al horno** (receta `lubina-horno`).
- [ ] **OI-11 · Energía según el día.** Las raciones usan el gasto medio de la semana. Valorar si se ajustan por día (más en días de entreno o partido).

## Tuppers y almuerzos

- [x] **OI-12 · Días y medios en la oficina.** Confirmado el 30/09/2026: CCT, tupper de lunes a miércoles y tiene microondas; RFA, tupper de lunes a jueves y solo tiene nevera (tupper frío).
- [ ] **OI-13 · Almuerzo de RFC.** Confirmado el 30/09/2026 que no tiene nevera en el colegio. Falta que diga si le gustan los almuerzos: bocadillos de pollo asado, jamón serrano y queso fresco, más un día de yogur bebible con frutos secos. Todos se preparan la noche anterior.

## Menú y recetas

- [x] **OI-14 · Rotación de semanas.** Hecho el 01/10/2026: el lunes la semana siguiente pasa sola a ser la actual y una tarea programada de Claude prepara la nueva semana siguiente (`.claude/skills/preparar-semana/SKILL.md` y `npm run preparar-semana`, que comprueba las normas antes de guardar). Ojo: el batch del domingo de la semana siguiente se cocina el domingo de la semana en curso.
- [ ] **OI-15 · Valor nutricional de las recetas.** No se calculan las kcal de cada receta, así que no se comprueba que el plato cubra la ración objetivo. Valorar usar una tabla de composición de alimentos (por ejemplo, BEDCA).

## Lista de la compra y despensa

- [ ] **OI-16 · Cantidades que conviene revisar.** Pan integral: unos 3,5 kg por semana. Resuelto para el pescado entero: los ingredientes pueden marcarse «por persona» (una lubina por comensal). Falta revisar si hay más casos (huevos, filetes).
- [ ] **OI-17 · Formatos de compra.** Desde el 30/09/2026 todo va en gramos, con la equivalencia en unidades o ml (`data/equivalencias.json`). Falta pasarla a paquetes, botes y latas (por ejemplo, cuántas galletas Animadas trae un paquete).
- [ ] **OI-18 · Básicos que no se cuentan.** Sal, especias y caldo no entran en la lista. Decidir si se controlan desde la despensa.
- [ ] **OI-19 · Inventario inicial de la despensa.** Ya se puede rellenar en la página Despensa de la web. Falta hacer el primer inventario.
- [ ] **OI-20 · Tickets de compra.** Aún no hay ninguno registrado. Definir cada cuánto se suben y qué análisis se quiere ver (gasto por categoría, productos que se repiten, ahorro).

- [ ] **OI-30 · Precios reales por tienda.** Decidido el 28/09/2026: sin estimaciones; los precios de Mercadona, BM y Casa Elías se irán cargando desde los tickets de compra (registrar_ticket + registrar_precio) o a mano. El comparador y el PDF muestran costes solo cuando hay precios. Pendiente: subir los primeros tickets y confirmar los formatos de envase (galletas Animadas y tortitas de maíz por paquete). Opcional: permitir en el entorno el acceso a tienda.mercadona.es, casa-elias.com y la tienda online de BM. Primer ticket registrado (Mercadona, 28/09/2026, 80,27 €): precios guardados de lo que va a granel (pimiento rojo y brócoli). Los envases del resto (peso o unidades) están pendientes de confirmar para poder calcular su precio.

## Agente y proyecto

- [ ] **OI-21 · Probar el agente con Claude.** No se ha ejecutado contra la API. Hace falta una `ANTHROPIC_API_KEY` en `.env` y probar el flujo completo: necesidades, menú, recetas, lista de la compra y tickets.
- [x] **OI-22 · Llevar el trabajo a `main`.** Hecho el 28/09/2026: PR colladoterroba-desing/AgenteMenu#2 fusionada en `main`.
