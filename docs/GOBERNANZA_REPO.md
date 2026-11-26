# Gobernanza del repositorio

Cómo se protege `main` y cómo se mergean los cambios en `CORJAR-Computers/dinamo_rent_web`. Resumen para el equipo: no hace falta leer los YAML.

---

## 1. Protección de `main` (lo que GitHub aplica, no el workflow)

`main` solo acepta cambios por PR. Reglas activas:

| Regla | Efecto |
| --- | --- |
| Check requerido **`svelte-check + guardia de contacto`** | El PR no se puede mergear hasta que ese check termine en verde sobre su último commit. |
| `enforce_admins: true` | **Nadie** salta la regla, ni el owner de la organización. No hay bypass de admin. |
| Force push bloqueado | `git push --force` a `main` se rechaza en el servidor (`GH006`), aunque el commit sea "correcto". |
| Borrado bloqueado | No se puede eliminar la rama `main`. |
| Sin "strict" | No hace falta que el PR esté rebasado sobre el último `main` para mergear; basta con que el check pase sobre el head del PR. |
| Sin revisiones obligatorias | No se exigen aprobaciones: por eso el automerge puede mergear sin intervención humana. |

Consecuencia: cualquier intento de push directo a `main` falla, y un PR en rojo no se mergea ni a mano ni por el bot.

> El nombre del check es literal: si se renombra el job en `check.yml` (`name: svelte-check + guardia de contacto`), la protección deja de encontrar el check y **bloquea todos los merges**. No se renombra.

---

## 2. El check `Check` (lo que tiene que estar verde)

El workflow `Check` (`check.yml`) corre en cada `push`, `pull_request` y a mano (`workflow_dispatch`), con permisos de **solo lectura** (`contents: read`):

1. `npm ci` con la versión de Node de `.nvmrc`
2. `prisma generate` + migraciones contra un Postgres de servicio
3. `npm run lint`
4. `npm test` (Vitest)
5. `npm run check` → svelte-check **+ guardia de contacto** (falla si un teléfono, `wa.me` o ubicación por defecto de la empresa queda hardcodeado fuera de `contact.ts` / `PICKUP_LOCATIONS`)
6. `npm run build` con `VERCEL=1` (adaptador real de despliegue)

Si algo falla, no hay merge: ni manual ni automático.

---

## 3. Workflow `Automerge`

`automerge.yml` se dispara cuando el workflow `Check` termina (`workflow_run: completed`). Mergea **solo** cuando se cumple todo esto:

- el run viene de un evento `pull_request` (los runs de `push` a `main` no hacen nada);
- la conclusión del check es `success`;
- el PR es del propio repo (los forks quedan fuera, sin revisión no se mergean);
- el PR está **abierto** y **no es borrador**;
- el PR **no** lleva la etiqueta `no-automerge`.

Si el run no trae PR asociado, sale sin hacer nada (no busca un PR por SHA: podría ser otro).

### Cómo mergea

- `gh pr merge --rebase --match-head-commit <head>`: **rebase merge**, historial lineal y los commits convencionales intactos (requiere que el repo mantenga "Allow rebase merging" activo). Nada de squash ni merge commits.
- `--match-head-commit` impide colar un push que llegó después del check.
- El merge lo hace `app/github-actions` con el `GITHUB_TOKEN`: no depende de OAuth Apps ni de aprobaciones de la organización.
- La protección de rama sigue mandando: si el check requerido no está verde sobre ese head, GitHub rechaza el merge aunque el token tenga `contents: write`.

### Dos detalles que explican rarezas

- **Se usa un workflow aparte y no un job dentro de `check.yml`** para que el token con permiso de escritura nunca conviva con código de PR: `workflow_run` ejecuta la copia del archivo en `main`, sin checkout ni `npm ci`.
- **Tras mergear, relanza el check sobre `main`**: los push hechos con `GITHUB_TOKEN` no disparan workflows, así que `main` quedaría sin verificar. El workflow lanza `gh workflow run check.yml --ref main` (los `workflow_dispatch` sí crean run).

Además serializa por rama (`concurrency: automerge-<rama>`): si dos runs del check terminan seguidos, el segundo encuentra el PR ya mergeado y no hace nada.

---

## 4. Etiqueta `no-automerge`: la válvula de escape

Poner `no-automerge` en un PR lo deja **abierto aunque el CI esté verde**; sirve para tener el PR ahí (por ejemplo, solo para que corra el CI, o para revisarlo con calma) sin que el bot lo mergee.

- Se evalúa en cada run, mirando las etiquetas actuales del PR (no las del momento del check).
- Quitar la etiqueta **no** dispara el automerge por sí solo. Hay que provocar otro run del check en esa rama:
  ```bash
  gh workflow run check.yml --ref <rama>
  ```
 y en cuanto ese run termine en verde, el PR se mergea solo.

---

## 5. Quién hace qué en el merge

| Pieza | Al mergear |
| --- | --- |
| Protección de `main` | Impide el merge si el check requerido no está verde, aunque sea admin o el propio bot. Es la última palabra. |
| `check.yml` | Es quien decide "verde o rojo". Corre sobre el PR con permisos de lectura; no mergea nada. |
| `automerge.yml` | Mergea el PR en verde por rebase, desde `main`, sin tocar el código del PR, y luego relanza el check sobre `main`. |
| Etiqueta `no-automerge` | Bloquea el merge automático de ese PR concreto. |
| Pre-commit local (`scripts/githooks/pre-commit`) | Corre la guardia de contacto antes de dejar commitear, para no enterarse del fallo recién en el CI. |

---

## 6. Flujo normal del equipo

1. Rama desde `main` → commit(s).
2. Abrir PR. `Check` corre solo.
3. Revisión humana si hace falta (opcional; no bloquea).
4. `Check` en verde → `Automerge` mergea por rebase.
5. `Automerge` relanza `Check` sobre `main`; el commit que queda en `main` es el del merge.
6. Borrar la rama (local y remota). Al ser rebase, el SHA de la rama no queda como ancestro de `main`: `git branch -d` puede negarse; si su diff ya está integrado, se borra con `-D`.

Si el PR debe quedarse abierto, se le pone `no-automerge`. Para publicarlo, se quita la etiqueta y se lanza `gh workflow run check.yml --ref <rama>`.

---

## 7. Lo que no está automatizado

- No hay auto-merge nativo de GitHub activado ni aprobaciones requeridas.
- No hay rulesets («repository rules»): la protección es la clásica de rama. El campo `enforcement_level` puede aparecer en `null` y `GET /rules` devolver 404 — es normal y no afecta a la protección.
- La API de la integración GitHub devuelve 403 al mergear por «OAuth App access restrictions» de la organización; el automerge no usa esa vía (usa el `GITHUB_TOKEN` del repo).
