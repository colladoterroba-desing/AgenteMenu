---
name: sincronizar
description: Lleva al proyecto lo que la familia apunta en la web del menú (despensa, reservas, no deseados, perfiles, diario, anotaciones, cocinado, cambios y comentarios), vuelve a generar la página y la publica. Úsala cuando pidan «sincroniza», «sincroniza la web» o «trae lo de la web».
---

# Sincronizar la web con el proyecto

Es un trabajo mecánico: no leas ni interpretes los datos, solo cópialos. El programa `npm run sincronizar` hace la unión.

Página: https://claude.ai/artifact/76bJD5hCEB8vM9pnYSkS91

1. Borra `salidas/web-export/` si existe.
2. Copia cada colección con `ArtifactData`, `action: "list"`, `query: {"limit": 1000}` y `out_dir: "salidas/web-export"` (ruta absoluta dentro del proyecto). Colecciones: `despensa`, `no-deseados`, `hechas`, `diario`, `cambios`, `cocinado`, `comentarios`, `eventos`, `perfil`, `comido`. Hazlo en paralelo. Si una devuelve `next_cursor`, pide la página siguiente con el mismo `out_dir`.
3. Ejecuta `npm run sincronizar`. Une los datos con `data/` y genera `salidas/resultados.html`.
4. Publica `salidas/resultados.html` con la herramienta `Artifact` y `url` de la página de arriba, sin `capabilities` (así se conservan `db` y `sample`).
5. Haz commit de `data/` con el mensaje «Sincronizar la web (fecha)» y push a la rama de trabajo.
6. Cuenta al usuario en dos o tres líneas lo que ha escrito el programa (los recuentos y los avisos).
