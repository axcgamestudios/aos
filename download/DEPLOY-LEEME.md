# Cómo publicar la última versión de axcsOS (AXC ID + autocompletado)

## Estado

- **main en GitHub YA TIENE todo el trabajo nuevo** (commits `d733178` y `9674738`):
  verificación de correo por OTP (`/api/auth/send-otp` + `/api/auth/verify-otp`),
  bóveda de contraseñas cifrada con AES-256-GCM, autocompletado/inicio de sesión
  en Safari y sesiones del navegador ligadas a la cuenta.
- Lo que falta es publicar el **sitio en vivo** (rama `gh-pages`). Durante esta
  sesión un accidente con rsync borró el `.git` local del entorno (que llevaba
  el token de push incrustado), así que desde aquí ya no se puede empujar.
  El código fuente nunca se perdió: está todo en `origin/main`.

## Opción A (recomendada, 2 minutos, sin instalar nada): GitHub Actions

A partir de ahora el propio GitHub puede construir y publicar el sitio con cada
push a `main`. Solo hay que activarlo una vez:

1. Abre el repo → **Add file → Create new file**.
2. Nombra el archivo exactamente:
   `.github/workflows/deploy-pages.yml`
3. Pega el contenido de `workflow-deploy-pages.yml` (está en esta misma carpeta
   de descargas) y haz **Commit changes**.
4. Ve a **Settings → Pages** y en *Build and deployment* cambia
   **Source** a **GitHub Actions**.
5. (Opcional) Pega también el mismo archivo en la web si quieres forzar un
   despliegue ya: pestaña **Actions → Deploy axcsOS to GitHub Pages → Run workflow**.

Cuando termine el workflow, https://axcgamestudios.github.io/aos/ quedará
actualizado, y **todos los despliegues futuros serán automáticos** con cada
cambio en `main` (ya no hará falta empujar la rama gh-pages a mano).

> Nota: `main` ya incluye este workflow (commit `9674738`); el paso 1-2 solo es
> necesario si GitHub aún no lo tiene — si el panel de administrador u otra
> sesión ya subió `main`, ve directo al paso 4.

## Opción B (alternativa con git en tu máquina): aplicar el bundle

En esta carpeta está `gh-pages-deploy-2026-10-22.bundle` con el despliegue
estático ya construido (rama `gh-pages`, un commit por delante del remoto).

```bash
git clone https://github.com/axcgamestudios/aos.git
cd aos
git fetch /ruta/a/gh-pages-deploy-2026-10-22.bundle gh-pages
git push origin FETCH_HEAD:gh-pages
```

El bundle **no toca `data/accounts.json`** (preserva las cuentas gestionadas
por el panel de administrador).

## Para volver a desplegar desde este entorno en el futuro

El entorno perdió la credencial de push. Con la Opción A activada ya no hace
falta: cualquier cambio que se suba a `main` (incluso desde el editor web de
GitHub o el panel) se publica solo.
