#!/bin/sh
# Genera la carpeta dist/ que Netlify publica.
#
# Producción (CONTEXT=production, solo la rama main en plaza.convergenciaaura.cl):
#   se publica el sitio indexable: robots.txt permisivo, sitemap.xml y sin noindex.
# Cualquier otro contexto (deploy de rama como dev, deploy previews, o CONTEXT sin definir):
#   se bloquea la indexación con cabecera X-Robots-Tag, robots.txt "Disallow: /",
#   meta robots noindex y sin sitemap. Además usa aura-hub.js del entorno dev de Convergencia Aura
#   (dev.convergenciaaura.cl) mientras el hub no esté publicado en producción.
set -eu

OUT="dist"
rm -rf "$OUT"
mkdir -p "$OUT"

cp -R index.html css img js "$OUT"/
cp _headers robots.txt "$OUT"/

if [ "${CONTEXT:-}" = "production" ]; then
  cp sitemap.xml "$OUT"/
  echo "build: contexto production -> sitio indexable"
else
  printf 'User-agent: *\nDisallow: /\n' > "$OUT/robots.txt"
  printf '\n/*\n  X-Robots-Tag: noindex, nofollow\n' >> "$OUT/_headers"
  sed -e 's|content="index, follow, max-image-preview:large"|content="noindex, nofollow"|' \
      -e 's|https://convergenciaaura.cl/aura-hub.js|https://dev.convergenciaaura.cl/aura-hub.js|' \
    index.html > "$OUT/index.html"
  echo "build: contexto ${CONTEXT:-sin definir} -> indexación bloqueada"
fi
