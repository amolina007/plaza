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


### Selección del panel por entorno

El cargador local del panel elige
`https://dev--convergencia-aura-core.netlify.app/js/aura-hub.js` para los dominios
`dev--*.netlify.app`, `dev.convergenciaaura.cl` y localhost. En dominios de
producción sigue usando `https://core.convergenciaaura.cl/js/aura-hub.js`.
Esto evita que un despliegue dev cargue accidentalmente el panel antiguo de main.
Las políticas CSP de los sitios que las requieren permiten únicamente estos
orígenes concretos de Core en script-src; no se desactiva CSP ni se amplían las
permisiones de datos. No se cambia main ni se trasladan sesiones entre dominios.

## Directorio de Plaza (dev)

El directorio consulta `core.plaza_dev_directorio()` en cada carga y al pulsar
Actualizar. Nombres, descripciones y membresías pertenecen a Core; no hay una
copia estática ni una suma engañosa de integrantes como usuarios únicos.
`integrantes` cuenta inscripciones en `sala_miembros`, excluyendo expulsiones;
no representa presencia en línea ni autorizaciones aún no inscritas.

- Visitantes: solo salas activas públicas.
- Con sesión: también privadas/restringidas permitidas por `puedo_ver_sala`.
- Se excluyen cuentas inactivas y salas de las que la cuenta fue expulsada.
- Origen: `creada_por IS NULL` = Convergencia; de lo contrario, usuarios.
- No se enumeran mensajes, correos ni identidades de los integrantes.
- Core todavía no guarda reglas particulares. `core.plaza_dev_reglas` las
  incorpora exclusivamente para esta revisión. Se editan en la ficha, por el
  creador o moderación, siempre con acceso vigente. Ausencia de reglas se
  informa explícitamente y se enlazan las normas generales.
- El nombre y el botón de cada canal abren `messenger.html?sala=slug` en Core dev.
  Core resuelve el destino tras iniciar sesión y solo entre las salas accesibles.

El acceso de Plaza usa la misma identidad Supabase de Core, con sesión propia
persistente en el origen de Plaza. Esto permite probar en Netlify, donde las
cookies de convergenciaaura.cl no funcionan. El formulario solicita un código
para cuentas existentes; no envía nada hasta que la persona lo solicite.
Se carga el canje oficial de accesos secundarios de Core.

La migración es aditiva: no cambia salas, mensajes, políticas existentes ni
membresías. La interfaz rechaza el dominio de producción hasta una promoción
explícita. Antes de promover, acordar el destino definitivo de las reglas,
la sesión compartida y la URL de Core. No basta con fusionar esta fase.

Verificación: `sh build.sh`, compilación de JS, prueba real RPC como `anon`,
y `tests/directorio-permisos.sql` (transacción con rollback; datos existentes
se usan como contexto de prueba, ninguna edición de prueba queda guardada).

## Favoritos, categorías y tema semanal (dev)

`core.plaza_dev_explorar()` amplía el directorio existente sin duplicar salas.
Los favoritos se guardan por identidad en `core.plaza_dev_favoritos`, son privados,
no implican membresía y solo se muestran si la persona conserva acceso al canal.
`plaza_dev_favorito` permite guardar/quitar de forma idempotente.

`core.plaza_dev_editorial` guarda una categoría y un tema por canal. El creador o
la moderación, con acceso vigente, los editan en «Administrar categoría y tema».
La semana empieza el lunes a las 00:00 de America/Santiago. La consulta solo devuelve
el tema de la semana vigente; vacío lo retira. No hay temas de ejemplo publicados.
Las cuatro salas públicas se clasificaron según sus descripciones existentes;
los canales restantes aparecen sin categoría hasta que su responsable la asigne.

Las tablas nuevas tienen RLS y acceso directo revocado; las RPC comprueban cuenta,
visibilidad y autoría. El conteo no revela los favoritos de otras personas.
El cliente elimina los datos anteriores al cambiar de cuenta y descarta respuestas
pendientes. Texto de categorías/temas se inserta con textContent, nunca como HTML.

Pruebas: `node --test tests/directorio-model.test.mjs`; ejecutar
`tests/explorar-permisos.sql` en una transacción (incluye rollback).
No se modifican mensajes, membresías ni la API original del directorio.
