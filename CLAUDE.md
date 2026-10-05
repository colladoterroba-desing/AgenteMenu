# Instrucciones para Claude

- Antes de hacer cualquier cambio, lee [`decisions.md`](decisions.md). Si lo que se pide contradice una decisión anotada, **avisa al usuario y espera su respuesta antes de tocar nada**.
- Cada decisión nueva sobre el proyecto se anota en `decisions.md` con la fecha y el motivo. Si una decisión cambia, se actualiza la fila (indicando a cuál sustituye), no se borra sin más.
- **Revisión diaria.** La primera vez cada día que se abra el proyecto (en la primera respuesta, antes de seguir con lo que pidan), haz esto y no lo repitas el mismo día:
  1. Revisa que no hay errores en las actualizaciones automáticas: con `list_triggers` (herramienta `claude-code-remote`) mira que las tareas «Sincronizar menú familiar (sesión fija)» y «Preparar la semana siguiente del menú (sesión fija)» están activas y que su última ejecución no ha fallado; y con `git fetch origin main && git log origin/main` mira que hay un commit «Sincronizar la web (fecha)» de cada noche y, los lunes, «Semana siguiente (fecha)». Si falta alguno o hay un fallo, avísalo en primer lugar y con palabras sencillas.
  2. Pregunta al usuario si quiere revisar los temas abiertos pendientes (los `- [ ]` de [`open-issues.md`](open-issues.md) y las issues abiertas en GitHub). No los revises sin que diga que sí.
- El usuario no tiene conocimientos técnicos: explica los pasos en lenguaje claro y directo.
