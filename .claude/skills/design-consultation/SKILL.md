---
name: design-consultation
description: |
  Decisiones de sistema de diseño y lenguaje visual: paleta, tokens, tipografía,
  jerarquía, cómo representar un dato nuevo. Úsala antes de diseñar una pantalla o
  componente, o cuando haya que decidir cómo se ve algo.
  Frases disparadoras: "sistema de diseño", "qué color uso", "cómo lo muestro",
  "diseño", "marca", "paleta", "tipografía", "cómo represento este dato".
user_invocable: true
---

# Consultoría de diseño — wall

El lenguaje visual del proyecto es **terminal financiera**: fondo oscuro, monoespaciada
para cifras, densidad alta, color usado como señal y no como decoración. Toda decisión
nueva se juzga contra esa coherencia.

## Los tokens reales

Definidos en `app/globals.css` con Tailwind v4 (`@theme inline`). **Úsalos; no metas
hex sueltos.**

| Token | Oscuro | Uso |
|---|---|---|
| `bg` | `#101419` | Fondo de página |
| `surface` | `#181d24` | Contenedores |
| `card` | `#1d232b` | Tarjetas sobre surface |
| `border` | `#2c3545` | Separadores |
| `accent` | `#00b85c` | Verde terminal — marca, positivo |
| `danger` | `#f04444` | Negativo, error |
| `warning` | `#fbbf24` | Precaución, dato dudoso |
| `info` | `#3b82f6` | Neutro informativo |
| `muted` / `subtle` / `text` | `#4a5568` / `#8b98b0` / `#d4dbe8` | Jerarquía de texto |

## La regla no obvia del modo claro

El tema claro **no reescribe los componentes**: `html.light` remapea la escala de
grises de Tailwind (`--color-gray-950` pasa a casi blanco, `--color-gray-100` a casi
negro) más overrides puntuales para `.text-white` y `.bg-white`.

Consecuencias vinculantes:

- Escribe con la escala `gray-*` y con los tokens. Se invierten solos.
- **Un hex hardcodeado no se invierte** y quedará ilegible en claro. Es el error más
  fácil de cometer aquí.
- Si usas un color fuera de la escala (p. ej. `emerald-600`), comprueba el resultado
  en los dos temas antes de darlo por bueno.
- El tema lo gestiona `app/ThemeProvider.tsx` con `useSyncExternalStore`; el servidor
  siempre renderiza `dark` y el cliente sincroniza tras hidratar. No introduzcas
  lecturas de `localStorage` en efectos: reintroducirías el hydration mismatch que
  ese patrón ya resolvió.

## Cómo representar un dato

Antes de elegir forma, responde qué es el dato:

- **Magnitud comparable entre filas** → número monoespaciado alineado a la derecha.
- **Posición dentro de un rango** → barra o track, no número suelto.
- **Estado discreto** (gate, señal, grado) → badge con color semántico.
- **Serie temporal** → gráfico; si el usuario no va a leer la forma, una cifra basta.
- **Ausencia de dato** → `—` en `muted`. **Nunca `0` ni `0%`**: en un sistema
  financiero, cero es una afirmación y ausente no lo es. Esta regla es dura.

## Color como señal

El color codifica dirección, no adorno. Convención ya establecida en el repo:

- Verde ≥ umbral bueno · amarillo intermedio · rojo negativo
- Los umbrales concretos deben ser **los mismos en todas las pantallas** para la misma
  magnitud. Si `/screener` pinta verde a partir de +20% de upside, `/senales` también.

Nunca uses solo color para transmitir información crítica: acompáñalo de signo,
etiqueta o posición.

## Densidad

Es un dashboard profesional, no una landing. Prioriza ver mucho de un vistazo:
`text-xs`/`text-sm`, padding contenido, `tracking-wider` y mayúsculas para etiquetas
de sección. No añadas aire por estética si desplaza datos fuera de pantalla.

## Salida

Recomendación concreta en español: qué tokens y clases usar, cómo se comporta en los
dos temas, y qué alternativa descartaste y por qué. Si la propuesta rompe una
convención existente, dilo y justifica por qué merece la pena romperla.
