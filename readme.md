# Plaza Aura

Portada pública de Plaza Aura (https://plaza.convergenciaaura.cl/). El chat vive en Aura Messenger (core.convergenciaaura.cl); este sitio solo presenta los canales y explica cómo entrar.

## Indexación

`build.sh` genera la carpeta `dist/` que publica Netlify (ver `netlify.toml`) según el contexto del deploy:

- **Producción** (rama `main`): indexable. `robots.txt` permisivo, `sitemap.xml` y sin `noindex`.
- **Cualquier otro deploy** (rama `dev`, deploy previews): bloqueado con cabecera `X-Robots-Tag: noindex, nofollow`, `robots.txt` con `Disallow: /`, meta robots `noindex` y sin sitemap.

No agregues `X-Robots-Tag` a `_headers` ni `noindex` a `index.html`: bloquearían producción. El bloqueo de dev lo agrega `build.sh`.

El `sitemap.xml` lista solo páginas públicas reales de este dominio. Si se crea una página pública nueva, agrégala ahí. Las conversaciones no están en este sitio y nunca deben listarse.


## Panel común de sesión

El botón con logo carga `https://core.convergenciaaura.cl/js/aura-hub.js`.
Muestra EXP acumulada de `core.mi_exp()` (en lugar de ELO), saldo AC desde la
consulta existente de cuenta y hasta ocho proyectos con su estado del catálogo
de Core. «Ver más» despliega el resto y «Ver menos» vuelve a ocho.
No calcula EXP desde AC ni crea una segunda sesión. Los errores no se muestran
como cero. Los cambios del panel requieren publicar AuraCore; aquí se conserva
el formulario de entrada del sitio y no se aplican migraciones.
