# Adquisición Plaza → AuraCore

## Qué se comprobó el 22 de octubre de 2026

- Plaza producción: commit `770988f3db1c1790bd490663f24e052b9b6ab928`, publicado por Netlify desde `main`. El HTML público no carga un medidor; solo contiene datos estructurados. Sus siete enlaces de acceso llevan a Core Messenger.
- Core producción: commit `26ee2d08ffffed3b00d07f06cf4374f5f283788e`, desde `main`. Se revisaron 51 archivos JS/HTML/TOML, incluidos los scripts de Messenger: sin coincidencias de gtag, Google Analytics, GTM, dataLayer, Plausible, Umami, Matomo, PostHog, Clarity o Hotjar. No había funciones de Netlify desplegadas. El service worker solo maneja notificaciones, sin caché de páginas.
- Netlify ofrece registros de solicitudes, incluidos bots y herramientas. No son un registro de altas ni un embudo Plaza → Core. La ausencia de scripts no descarta medición externa o de servidor no visible en estas fuentes. No se verificó una cuenta de Google Analytics ni la configuración completa de Analytics en el panel de Netlify.
- Hay trabajo de autenticación separado en AuraCore (PR #6). Esta medición no llama a Supabase, no lee cuentas y no modifica archivos de autenticación.
- El aviso de Search Console aportado por 00 informa impresiones desde el 20 de octubre. No contiene por sí mismo evidencia de visitas ni conversiones. No se recuperaron cifras de Search Console.

## Eventos y unidad de medida

| Evento | Significado | Límite |
| --- | --- | --- |
| `plaza_view` | Documento de Plaza cargado con JavaScript y medición habilitada | Una visita medida, no una persona única. Recargar inicia otra visita. |
| `plaza_chat_click` | Primer clic de esa visita en cualquiera de los siete accesos al chat | Cuenta visitas con clic, no todos los clics repetidos. Incluye clic central/nueva pestaña. |
| `core_arrival` | Documento de Messenger cargado desde Plaza con marcador válido | No implica sesión ni sala cargada. Recargas y volver atrás no generan otra conversión. |
| `core_authenticated_view` | La vista de Messenger con sesión iniciada se hizo visible en ese documento | Puede ser una cuenta existente; no prueba registro nuevo, mensaje enviado ni carga exitosa de una sala. |

`source` solo admite `google_organic`, `paid`, `direct`, `other`. Google se infiere del dominio del referente, no de una consulta. `gclid`, `gbraid`, `wbraid` o `utm_medium=cpc/ppc/paid/paid_search` tienen prioridad para no confundir anuncios con orgánico. Sus valores nunca se envían. `direct` significa sin referente visible: también puede incluir referencias ocultas. La clasificación Google es una aproximación, puede incluir otras superficies de Google y no abarca todos sus dominios territoriales.

`placement` identifica nav, hero, plazaaura, chile, ritmos, ladra o create. El destino de todos sigue siendo Messenger; medir una tarjeta de canal no significa que se haya ingresado a esa sala.

## Privacidad y transporte

- Sin cookies de analítica ni identificadores persistentes de usuario. Un UUID aleatorio identifica únicamente el documento/visita; permite deduplicar reintentos y enlazar sus etapas. Es un dato seudónimo, no una garantía de anonimato absoluto. No se relaciona con la identidad Core.
- El UUID y cuatro etiquetas permitidas viajan en parámetros `pa_*` al abrir Core. Core elimina exclusivamente esos parámetros antes de cargar los scripts de sesión, conservando el resto de la consulta, el fragmento y `history.state`.
- Cada evento va en POST sin credenciales ni referente, a `/api/acquisition`. Core lo retransmite mediante una única regla de Netlify al receptor de Plaza. No se amplía la CSP ni se envía información de sesión.
- El receptor solo acepta el esquema cerrado, orígenes de producción y el par origen/evento correcto, con cuerpo máximo de 512 bytes y fecha reciente. Descarta campos extra, consultas, URL, correos, mensajes e identificadores de cuenta. No registra cuerpos ni cabeceras en logs propios. El alojamiento sigue procesando IP y registros técnicos conforme a sus políticas; no se promete ausencia de logs de infraestructura. Los parámetros de llegada pueden aparecer en el registro de la petición HTML de Core.
- DNT y GPC desactivan eventos y decoración de enlaces. El control de exclusión guarda solo una preferencia booleana local, por sitio. Excluirse no borra eventos ya recibidos. La opción no se sincroniza entre subdominios.
- Sin JS, con bloqueadores, sin referente Plaza, con enlaces copiados, con medición excluida o al volver del login en otro documento, la atribución puede perderse. No se intenta reconstruirla mediante huellas digitales ni identificar personas.
- Solo producción escribe. Dev y previews no envían eventos y el receptor tiene una segunda barrera por contexto de despliegue. No hay doble evento por incluir dos veces el script, repetir avisos de sesión o reintentar una respuesta 5xx.
- Límite de 30 solicitudes por minuto por IP/dominio en el receptor. Puede subcontar redes compartidas grandes. Es una barrera básica de abuso, no una certificación de tráfico humano: un cliente externo puede falsificar Origin y los eventos.

## Almacenamiento, consulta y conservación

Se usa Netlify Blobs en el sitio Plaza, store privado `plaza-acquisition-v1`. Cada evento es un objeto inmutable con clave `día/UUID/evento`, escrito con `onlyIfNew`. No se implementan contadores compartidos que pierdan incrementos simultáneos. No hay un endpoint público de lectura.

Netlify ejecuta `acquisition-cleanup` a las 06:00 UTC cada día en producción; borra claves anteriores a 30 días UTC (conservación máxima aproximada de 31 días). Blobs no aplica TTL automáticamente. Verificar que esta función programada aparezca en el despliegue y que se ejecute: si falla, la retención se prolonga hasta corregirla. Las copias descargadas deben gestionarse aparte. El volumen de Functions/Blobs puede consumir créditos del plan.

Para consultar sin exponer credenciales en el navegador:

1. En Netlify, sitio Plaza → Data & Storage → Blobs → `plaza-acquisition-v1`, comprobar que aparecen objetos.
2. En una copia local del repo: `npm ci`. Facilitar `NETLIFY_AUTH_TOKEN` mediante un gestor de secretos o el entorno privado de la terminal; no pegarlo en código, capturas ni commits.
3. Ejecutar `npm run report:acquisition --silent`. La salida JSON contiene solo totales por día UTC y fuente. La credencial se necesita únicamente para esta lectura privada; la web desplegada usa el contexto nativo de Netlify y no requiere un token manual.

El informe devuelve conteos brutos deduplicados y `matched_arrivals`/`matched_authenticated_views`. Una llegada se considera enlazada únicamente si existen visita y clic con el mismo ID/día/fuente y coincide el botón; si falta la visita aparece como `unmatched`, no se fuerza su atribución a orgánico. Las etapas se agrupan por el día de inicio de la visita; los eventos posteriores pueden llegar hasta el día siguiente. No representa sesiones que atraviesan el proceso de autenticación en otra página o dispositivo.

## Cómo combinar con Search Console

1. En Rendimiento → Resultados de búsqueda, elegir tipo Web y filtrar la página `https://plaza.convergenciaaura.cl/`. Exportar por consultas y páginas: impresiones, clics, CTR y posición. Mantener fechas y filtros constantes al comparar.
2. Usar impresiones como visibilidad; clics como salidas desde Google; `plaza_view` como documentos efectivamente medidos. No esperar igualdad: JS, exclusiones, referencias ocultas, anuncios, procesado y zonas horarias producen diferencias.
3. Para la cohorte `google_organic`, calcular visitas con clic / visitas medidas; llegadas enlazadas / visitas con clic; vistas autenticadas enlazadas / visitas medidas. Si el denominador es cero, informar «sin base», nunca dividir por cero ni inventar una tasa.
4. Search Console agrupa días en hora del Pacífico, salvo su vista de 24 horas. Aquí se conserva el día UTC de inicio, sin hora exacta. No se puede convertir una agrupación diaria UTC a PT de forma exacta: comparar tendencias semanales con cautela en los bordes, no declarar coincidencias diarias exactas. Algunas consultas están ocultas por privacidad.
5. Con una única landing no se puede saber qué consulta concreta convirtió: Search Console no entrega un ID de visita que pueda unirse a este embudo y el referente no entrega la búsqueda. Las consultas muestran demanda y clics; el embudo muestra el avance medido del conjunto orgánico. No repartir las conversiones proporcionalmente entre consultas ni presentar correlaciones como atribución individual.
6. Para investigar intención con más detalle, crear después páginas útiles distintas para temas distintos y medir cada landing de forma explícita. Eso permitiría comparar cohortes por página, sin afirmar que identifica la consulta o la persona exacta. Contar nuevas cuentas exigiría una señal de alta real independiente, fuera de esta implementación.

Fuentes oficiales:
- https://support.google.com/webmasters/answer/7576553?hl=es
- https://support.google.com/webmasters/answer/17010575?hl=en
- https://support.google.com/webmasters/answer/17011259?hl=en
- https://docs.netlify.com/build/data-and-storage/netlify-blobs/

## Pruebas y puesta en marcha

`npm ci`, `npx playwright install chromium`, `npm test` comprueban el contrato del receptor, deduplicación, exclusiones, navegación real entre dos orígenes simulados y preservación de parámetros de autenticación. `CONTEXT=production sh build.sh` debe incluir `dist/js/acquisition.js` y sitemap; un build preview debe conservar noindex y omitir sitemap.

Publicar primero Plaza con las dos Functions y Blobs; después Core con el script y la regla de proxy. Ambos cambios deben revisarse juntos. En las ramas dev no se escriben eventos por diseño. No basta con que las pruebas locales pasen para afirmar que producción mide.

Aceptación en producción: abrir Plaza con medición habilitada → comprobar POST 204 y objeto `plaza_view` en Blobs → pulsar un CTA → comprobar un `plaza_chat_click` y un `core_arrival` con el mismo ID → verificar marcador eliminado y consulta/fragmento de acceso conservados → si ya hay sesión, comprobar un único `core_authenticated_view` → ejecutar el informe privado y verificar una llegada enlazada. Repetir con DNT/GPC y confirmar cero nuevos objetos. Estas verificaciones generan tráfico de prueba: usar una ventana identificada y no contabilizarlo como crecimiento real. Comprobar también el estado y la ejecución de la limpieza programada.

No generar visitas orgánicas artificiales. No retrocompletar datos del 20–22 de octubre. Antes de publicar, el nuevo store no aporta datos históricos.

Reversión: retirar el script y el aviso de ambos HTML; restaurar el build anterior de Plaza y retirar el proxy de Core. Dejar el receptor/la limpieza hasta cumplir la retención o borrar el store mediante un operador autorizado. Nada de ello modifica cuentas ni Auth.
