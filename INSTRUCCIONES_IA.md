# Manifiesto de reglas para el sistema IA

Estas reglas se deben cargar y respetar antes de cada interacción con el agente IA. El manifiesto se valida con el hash MD5 guardado al activar el plugin.

## NAMING_CONVENTIONS

- Usa kebab-case para archivos públicos, assets, carpetas y slugs; por ejemplo, `mi-estilo.css`.
- Usa snake_case para lógica PHP interna, funciones, variables y meta keys; por ejemplo, `wp_plugin_init`.

## SECURITY & INTEGRITY

- La integración de Gemini debe aceptar solicitudes únicamente de usuarios administradores con `current_user_can( 'manage_options' )` y validar el nonce REST con `wp_verify_nonce( $nonce, 'wp_rest' )` en cada `permission_callback`.
- La única credencial secreta autorizada para persistirse en la base de datos es la API key de Gemini, en la opción `ia_gemini_api_key`. Esta excepción no autoriza guardar otras credenciales o secretos externos. Usa APIs de opciones/configuración de WordPress, con capacidad `manage_options`, nonce, sanitización y autoload desactivado; no uses SQL directo para esta opción. No vuelvas a mostrar ni envíes la clave al navegador. WordPress no cifra automáticamente las opciones en reposo. No leas la clave desde `config.php` ni `wp-config.php`.
- Toda acción que cambie datos debe validar un nonce con `wp_verify_nonce()` y verificar permisos con `current_user_can( 'manage_options' )` para la integración de Gemini.
- Sanitiza todas las entradas con funciones nativas de WordPress y escapa todas las salidas según su contexto.
- Compara el hash MD5 de este archivo con el valor almacenado durante la activación. Ante una diferencia, registra una alerta roja en el panel y desactiva el plugin.
- No uses el chequeo de integridad como autorización para solicitudes a Gemini; la integridad se gestiona por separado de la validación de solicitudes.

## SCOPE_LIMITS

- Para cambios de código, limita la escritura a la carpeta del plugin y rutas expresamente aprobadas; no modifiques código fuente de otros plugins, tema, servidor ni core sin aprobación.
- Cuando el usuario lo solicite, se autoriza sin confirmación repetida crear/editar bloques y texto, páginas, entradas y tipos de contenido personalizados (CPT) registrados como borradores, imágenes mediante APIs de medios en `WP_CONTENT_DIR/uploads/`, enlaces, HTML, CSS, JavaScript, iframes, patrones/plantillas y bloques/widgets registrados de plugins instalados.
- Se autoriza la inspección multimodal de imágenes (Gemini Vision) para bloques `core/image` existentes en el editor, transmitiendo los bytes de imagen en base64 (`inlineData`) a la API de Gemini con el objetivo exclusivo de generar textos alternativos SEO (`alt`), pies de foto y descripciones de accesibilidad.
- La autorización de `uploads/` cubre solo medios solicitados mediante APIs de WordPress, con tipo/tamaño validados y nombres únicos. No hagas escrituras arbitrarias, sobrescribas ni elimines archivos.
- Las escrituras normales de contenido por APIs WordPress están autorizadas y no requieren volcado SQL por acción; no uses SQL directo. No publiques, programes, elimines contenido ni vacíes papelera sin aprobación explícita.
- Respeta `unfiltered_html`, KSES y capacidades. Si un bloque/widget no está disponible, deja espacio o marcador/comentario e informa; no instales, actives ni modifiques plugins.
- Bloques dinámicos de terceros pueden depender del plugin proveedor. Conserva el tipo registrado e informa esa dependencia; no lo reemplaces silenciosamente.
- Está estrictamente prohibido modificar `wp-admin/`, `wp-includes/` o `wp-config.php`.
- Resuelve las rutas mediante `WP_CONTENT_DIR`, `WP_PLUGIN_DIR`, `ABSPATH` y APIs nativas de WordPress. No fijes rutas absolutas.

## DATABASE_RULES

- Usa `$wpdb` para consultas SQL directas y APIs nativas de WordPress para sus propias opciones. La única excepción para guardar un secreto es la opción `ia_gemini_api_key`, autorizada exclusivamente para la API key Gemini y su pantalla administrativa; no almacenes otros secretos ni uses SQL directo para esta opción.
- Está absolutamente prohibida cualquier operación `DROP`.
- Se autoriza explícitamente guardar en `wp_options` (con `manage_options`, sanitización y autoload desactivado) las preferencias operativas y no secretas del sistema: cuenta asociada (`ia_gemini_account_email`), modelos habilitados (`ia_gemini_enabled_models`), modelo predeterminado (`ia_gemini_default_model`), voz/tono de marca del sitio (`ia_gemini_brand_voice`) y temperatura/creatividad (`ia_gemini_temperature`).
- Las escrituras normales de contenido/medios autorizadas en SCOPE_LIMITS y guardar, reemplazar o borrar `ia_gemini_api_key` o las preferencias operativas desde su pantalla no requieren aprobación adicional ni volcado SQL completo por acción. No uses SQL directo para ello.
- Antes de cualquier otra actualización de base de datos, presenta un reporte y espera aprobación humana. Si se aprueba, genera y verifica un respaldo obligatorio en `WP_CONTENT_DIR . '/ia-core-system/backups-ia/'` con formato `BD_backup_YYYYMMDD_HHMM.sql`. No sobrescribas respaldos; protege respaldos generales, que pueden incluir la API key.

## GUTENBERG_API

- Interactúa con el editor únicamente mediante el ecosistema React oficial de WordPress y `wp.data`, usando `select()` y `dispatch()` sobre `core/block-editor`.
- No uses jQuery ni manipulación directa del DOM.
- El contenido aplicado al editor debe guardarse como bloques nativos estáticos de Gutenberg, sin depender de callbacks PHP ni de la activación futura de este plugin. Se autoriza expresamente estructurar bloques nativos estáticos de WordPress, incluyendo `core/paragraph`, `core/heading`, `core/columns`, `core/column`, `core/group`, `core/list`, `core/list-item`, `core/buttons`, `core/button`, `core/image`, `core/table`, `core/details`, `core/quote` y `core/separator`. Excepción autorizada: se pueden usar bloques dinámicos de plugins instalados si el usuario los solicita; pueden depender del plugin proveedor y esa dependencia se debe informar, sin modificarlo.
