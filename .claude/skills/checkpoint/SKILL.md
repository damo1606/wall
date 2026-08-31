---
name: checkpoint
description: |
  Guarda el estado del trabajo en curso para poder retomarlo en otra sesión, o
  restaura uno guardado. Úsala al cerrar una sesión larga, antes de cambiar de
  tarea, o al empezar preguntando "¿dónde lo dejamos?".
  Frases disparadoras: "guarda el progreso", "checkpoint", "dónde lo dejamos",
  "retomar", "resume", "apunta esto para mañana", "cierro por hoy".
user_invocable: true
---

# Checkpoint — wall

Un checkpoint sirve para que la próxima sesión arranque sin arqueología. Se escribe
para alguien que no recuerda nada del contexto: tú dentro de dos semanas.

## Modo guardar

### Paso 1 — Capturar el estado real, no el recordado

```bash
git status --short
git log --oneline -10
git diff --stat
```

Anota también qué puertas están verdes **ahora mismo** (typecheck, tests, lint,
build). Un checkpoint que dice "todo bien" sin haberlo comprobado es peor que ninguno.

### Paso 2 — Escribir el archivo

En `docs/CHECKPOINT.md`, sobrescribiendo el anterior (el historial está en git):

```markdown
# Checkpoint — <YYYY-MM-DD>

## En qué estaba
Una o dos frases. El objetivo, no la última acción.

## Estado del árbol
Rama, commits recientes relevantes, archivos modificados sin commitear y por qué
están así (a medias / listos / experimento).

## Puertas
| Puerta | Estado | Comprobado |
|---|---|---|
| tsc / tests / lint / build | ... | sí/no en esta sesión |

## Decisiones tomadas
Las que no se deducen del código. Por qué se eligió un enfoque y qué se descartó.
Esto es lo que más caro sale reconstruir.

## Siguiente paso concreto
La acción exacta con la que retomar. No "seguir con X" sino "abrir lib/foo.ts:120 y
cambiar Y por Z".

## Trampas conocidas
Lo que te hizo perder tiempo y volvería a hacértelo.
```

### Paso 3 — Memoria

Lo que trascienda esta tarea (preferencias del usuario, restricciones del entorno,
decisiones de arquitectura duraderas) va además a memoria, no solo al archivo. El
checkpoint es para la tarea; la memoria es para el proyecto.

## Modo restaurar

1. Lee `docs/CHECKPOINT.md`.
2. **Verifica que sigue siendo cierto** antes de fiarte: `git status`, `git log`, y
   vuelve a correr las puertas. El árbol puede haber cambiado desde entonces.
3. Si el checkpoint contradice el estado real, gana el estado real. Dilo y actualiza.
4. Resume en español dónde se quedó y cuál es el siguiente paso, y espera confirmación
   antes de retomar trabajo que modifique archivos.

## Entorno

```powershell
$env:PATH = "C:\Users\daniel.montero\node\node-v22.14.0-win-x64;$env:PATH"
```
