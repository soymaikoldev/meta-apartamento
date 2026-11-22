# Meta Apartamento

Tablero privado de una sola meta: el apartamento en Lechería.

**Cómo funciona (igual que el Content Hub):**

- Este repo es **público** pero contiene solo el *cascarón*: diseño (`styles.css`) y lógica (`script.js`). **Ningún dato personal.**
- Los números reales (deuda, ahorro, fases, tareas) viven en el repo **privado** `content-hub-data`, en el archivo `meta.json`.
- La página los carga al vuelo con un token de GitHub guardado en el navegador (el mismo del Content Hub — comparten origen `soymaikoldev.github.io`).
- Sin token, la página solo muestra una pantalla de bloqueo. Nadie más ve tus números.

**Mantenerlo:** la deuda, el ahorro, el estado de las fases y las tareas de la semana se editan con un clic desde la propia página y se sincronizan entre PC y teléfono. El resto del texto se cambia en `meta.json`.

**Desplegado en:** GitHub Pages → https://soymaikoldev.github.io/meta-apartamento/
