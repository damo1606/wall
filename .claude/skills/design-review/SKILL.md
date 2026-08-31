---
name: design-review
description: |
  Auditoría visual de pantallas ya construidas: coherencia con el sistema, legibilidad
  en ambos temas, jerarquía, estados vacíos y densidad. Úsala para pulir una pantalla
  existente o revisar cómo quedó algo.
  Frases disparadoras: "revisa el diseño", "auditoría visual", "cómo se ve",
  "pule esto", "design review", "revisa la pantalla", "está feo".
user_invocable: true
---

# Auditoría visual — wall

Revisas **lo construido**, no lo planeado. Cada hallazgo señala un elemento concreto
con su `archivo:línea` y dice qué debería ser en su lugar.

## Paso 1 — Verlo de verdad

No audites leyendo JSX. Levanta la app y mira la pantalla:

```powershell
$env:PATH = "C:\Users\daniel.montero\node\node-v22.14.0-win-x64;$env:PATH"
node .\node_modules\next\dist\bin\next dev
```

Si tienes disponible la automatización de Chrome, úsala para capturar la pantalla en
**los dos temas** y en ancho estrecho. Si no puedes verla, dilo y limita el alcance a
lo que sí puedas verificar leyendo el código — no describas como observado algo que
solo has inferido.

## Paso 2 — La lista de comprobación

### Coherencia con el sistema

- ¿Usa los tokens (`bg`, `surface`, `card`, `border`, `accent`, `danger`…) o hay hex
  sueltos y colores fuera de la escala `gray-*`?
- ¿Los umbrales de color coinciden con los del resto de la app para la misma
  magnitud? Un `+20%` verde en una pantalla y amarillo en otra es un bug de producto.
- ¿Etiquetas de sección con el mismo tratamiento (`text-xs uppercase tracking-wider`)?

### Modo claro

El fallo más frecuente del repo. `html.light` remapea la escala `gray-*`, pero **no**
arregla hex hardcodeados ni colores fuera de esa escala.

- Busca contrastes rotos: texto claro sobre fondo claro.
- Bordes que desaparecen.
- Badges cuyo color de fondo deja de contrastar con su texto.

### Jerarquía

- ¿Se distingue de un vistazo el dato principal del secundario?
- ¿Compiten varios elementos por ser lo primero que se mira?
- ¿El orden visual coincide con el orden de importancia para decidir?

### Estados

Los que más se olvidan y más rompen la confianza:

- **Vacío**: ¿dice por qué no hay datos, o solo muestra una tabla en blanco?
- **Cargando**: ¿hay indicador, o la pantalla parece rota?
- **Error**: ¿mensaje accionable, o un `undefined` crudo?
- **Sin dato en una celda**: debe ser `—` en `muted`. **Si aparece `0` o `0%` donde
  el dato falta, es un hallazgo grave**, no cosmético: falsea una lectura financiera.

### Números

- Cifras en monoespaciada y alineadas a la derecha para poder compararlas en columna.
- Decimales consistentes dentro de una misma columna.
- Unidades y signos explícitos (`+`/`−`, `%`, `$`).

### Densidad y desbordes

- ¿Cabe la información sin scroll horizontal?
- Tablas anchas: ¿scrollean dentro de su contenedor sin arrastrar la página entera?
- Textos largos (nombres de empresa, tesis): ¿truncan con elegancia?

## Paso 3 — Informe

Ordenado por impacto, no por posición en pantalla:

- 🔴 **Rompe la lectura** — dato ilegible, número engañoso, `0` donde falta el dato.
- 🟠 **Incoherencia** — se desvía del sistema y se nota.
- 🟡 **Fricción** — funciona pero cuesta más de lo necesario.
- 🟢 **Pulido** — detalle fino.

Cada hallazgo: `archivo:línea`, qué se ve, qué debería verse, y el cambio concreto de
clases o tokens. Si algo está bien resuelto, dilo brevemente para que no se rompa
después.
