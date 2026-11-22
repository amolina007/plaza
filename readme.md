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

### Resumen diario de actividad (dev)

`core.plaza_dev_resumenes` guarda un cierre por fecha de Chile. El trabajo `plaza-dev-resumen-diario` corre cada hora al minuto 10: publica el día anterior a las 00:10 locales y reintenta sin duplicar. Recupera hasta siete cierres pendientes por ejecución. La fecha local y sus medianoches se calculan con `America/Santiago`, incluido horario de verano.

El ranking considera hasta tres salas activas públicas, mensajes no retirados ni ocultos por reportes, participantes distintos que escribieron y la hora local con más mensajes. Empates de canal: participantes y luego ID estable; empate horario: primera hora. Los días sin mensajes tienen una publicación explícita sin ranking. No se retroceden días anteriores al primer cierre. No guarda textos ni identidades de autores. Si una sala deja de ser pública/activa, desaparece de la lectura de cierres anteriores.

La tabla y los generadores no tienen acceso para `anon`/`authenticated`. Solo `core.plaza_dev_feed(p_limite)` devuelve publicaciones agregadas, máximo 100, aplicando disponibilidad y expulsiones actuales. Core dev incorpora esa RPC como fuente independiente `plaza`, sin cambiar las fuentes ni el Feed de producción. En este primer alcance las tarjetas automáticas no incluyen comentarios ni reacciones.

Prueba transaccional: `tests/resumen-diario.sql` revierte todos sus fixtures. Comprueba top 3, cantidad de mensajes, participantes únicos, empate peak, límites de día, exclusión de privados/retirados/ocultos, cambio posterior a privado, día abierto, lectura anónima y permisos del generador. La copia de la migración aplicada tiene la versión real `20261121020023`.

### Salas moderadas de Plaza (dev)

El diseño de explorar/crear/detalle/moderación usa `core.plaza_dev_catalogo`, sin copiar chats ni mensajes. Las nuevas salas son salas reales de Core de tipo `restringida`; su política de ingreso vive en `core.plaza_dev_salas`. Abierta acepta una cuenta activa después de leer las reglas; con aprobación requiere decisión de moderador; por invitación solo aparece al invitado o a quien ya tiene acceso. Publicar una sala abierta o con aprobación hace visibles su propósito, reglas, integrantes agregados y alias de moderadores. Las conversaciones requieren acceso. El formulario lo explica antes de crear.

El creador es el primer moderador, puede nombrar a integrantes aprobados, y tiene un máximo de cinco salas activas propias. Los moderadores de una sala no reciben privilegios generales en Core. El panel permite aceptar/rechazar solicitudes, invitar por alias exacto, cambiar ingreso/reglas, advertir, silenciar una hora, quitar silencio y expulsar. Las decisiones requieren motivo y quedan en un historial accesible solo a moderadores. No se permite sancionar a otro moderador. Un rechazo permite volver a solicitar ingreso a partir de 24 horas. Cambiar el ingreso no expulsa a integrantes actuales.

Las RPC aplican sesión activa, controles de privacidad de Core y autorización por sala. Las cinco tablas auxiliares tienen RLS y acceso directo revocado: las advertencias de asesoría RLS sin políticas son esperadas por el diseño de acceso exclusivo por RPC. La expulsión usa `core.sala_expulsiones` y retira membresía y autorización. El silencio se verifica con un trigger antes de insertar mensajes de esa sala, incluso llamando a Core desde fuera de Plaza. Los chats antiguos conservan su comportamiento; no se convierten ni se anuncian salas privadas anteriores.

Core dev muestra reglas, moderadores y avisos personales en Messenger. Las advertencias de Plaza son informativas; no activan la antigua regla global de tres amonestaciones. El panel de moderación se abre en Plaza. Las rutas raíz siguen siendo Inicio, Explorar, Feed, Mis salas y Mi perfil; crear/detalle/moderar son pantallas independientes, no secciones apiladas. El perfil ampliado sigue pendiente del trabajo descrito en su sección.

`tests/salas-moderadas.sql` ejecuta creación, solicitud, aprobación, ingreso abierto, invitación, co-moderación, cambio de reglas, silencio y expulsión con tres identidades reales elegibles, dentro de una transacción con rollback. No deja salas, mensajes, miembros, decisiones ni solicitudes de prueba. Comprueba que abrir por nombre y llamar al envío de Core no permite saltarse los controles.
