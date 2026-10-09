# Plaza Aura

Portada pública de Plaza Aura (https://plaza.convergenciaaura.cl/). El chat vive en Aura Messenger (core.convergenciaaura.cl); este sitio solo presenta los canales y explica cómo entrar.

## Indexación

`build.sh` genera la carpeta `dist/` que publica Netlify (ver `netlify.toml`) según el contexto del deploy:

- **Producción** (rama `main`): indexable. `robots.txt` permisivo, `sitemap.xml` y sin `noindex`.
- **Cualquier otro deploy** (rama `dev`, deploy previews): bloqueado con cabecera `X-Robots-Tag: noindex, nofollow`, `robots.txt` con `Disallow: /`, meta robots `noindex` y sin sitemap.

No agregues `X-Robots-Tag` a `_headers` ni `noindex` a `index.html`: bloquearían producción. El bloqueo de dev lo agrega `build.sh`.

El `sitemap.xml` lista solo páginas públicas reales de este dominio. Si se crea una página pública nueva, agrégala ahí. Las conversaciones no están en este sitio y nunca deben listarse.
