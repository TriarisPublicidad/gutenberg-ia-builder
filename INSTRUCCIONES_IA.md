# Manifiesto de Reglas para el Sistema IA (Gutenberg IA Builder)

Estas reglas definen el marco operativo, de seguridad y de diseño del plugin. Se cargan y respetan antes de cada interacción. Su integridad se valida mediante hash MD5.

## 1. NAMING_CONVENTIONS

- Usa kebab-case para archivos públicos, assets, carpetas y slugs; por ejemplo: `editor-plugin.js`, `class-admin-settings.php`.
- Usa snake_case para funciones PHP, variables, hooks, opciones de base de datos y meta keys; por ejemplo: `gutenberg_ia_init`, `ia_gemini_api_key`.

## 2. SECURITY & INTEGRITY

- **Acceso Exclusivo para Administradores:** Toda funcionalidad, pantalla y endpoint REST del plugin está reservada exclusivamente para usuarios administradores con capacidad `current_user_can( 'manage_options' )`.
- **Validación de Nonces:** Cada solicitud a la API REST debe validar el nonce de WordPress con `wp_verify_nonce( $nonce, 'wp_rest' )` en el `permission_callback`.
- **Credencial Secreta (API Key):** La única credencial secreta autorizada en la base de datos es la clave de Gemini en la opción `ia_gemini_api_key`. Se gestiona exclusivamente mediante las APIs nativas de WordPress (`get_option`, `update_option`), con sanitización estricta (`sanitize_text_field`), `autoload => 'no'`, y nunca se expone ni devuelve al navegador del usuario.
- **Validación de Manifiesto (Hash MD5):** El plugin compara el hash MD5 de este archivo con el valor de activación. Ante cualquier discrepancia, se alerta de inmediato en el panel administrativo y se bloquean las peticiones hacia la IA para prevenir desvíos de seguridad.
- **Sanitización y Escape:** Toda entrada enviada a la API se sanitiza con funciones nativas de WordPress y toda salida en interfaces administrativas se escapa según su contexto (`esc_html`, `esc_attr`).

## 3. SCOPE_LIMITS

- **Inmutabilidad del Sistema:** Está terminantemente prohibido modificar `wp-admin/`, `wp-includes/`, `wp-config.php`, temas activos o plugins de terceros. La escritura de código se limita estrictamente a:
  ```php
  trailingslashit( WP_PLUGIN_DIR ) . 'gutenberg-ia-builder/'
  ```
- **Rutas Nativas:** Resuelve siempre las rutas mediante `WP_PLUGIN_DIR`, `WP_CONTENT_DIR` y `ABSPATH`. No utilices rutas absolutas del sistema operativo.
- **Edición en el Editor Gutenberg:** La IA está autorizada a leer y reemplazar el contenido del editor de bloques (páginas y entradas) en tiempo real mientras el usuario está en el panel de edición. No publica directamente ni altera estados sin la acción explícita del usuario en el editor.
- **Inspección Multimodal (Gemini Vision):** Autorizada exclusivamente para bloques `core/image` presentes en el editor, transmitiendo los bytes de la imagen en base64 (`inlineData`) para generar automáticamente textos alternativos (`alt`), descripciones accesibles y pies de foto contextualmente relevantes.

## 4. DATABASE_RULES

- **Uso Exclusivo de Opciones Nativas:** El plugin no crea tablas personalizadas ni realiza consultas SQL directas. Todo se gestiona mediante la API de Opciones de WordPress (`get_option`, `update_option`, `delete_option`).
- **Opciones Autorizadas en `wp_options`:**
  - `ia_gemini_api_key`: Clave API secreta (`autoload => 'no'`).
  - `ia_gemini_default_model`: Modelo predeterminado de Gemini.
  - `ia_gemini_brand_voice`: Tono y voz de marca predeterminados.
  - `ia_gemini_temperature`: Nivel de creatividad de las respuestas.
- **Operaciones Destructivas Prohibidas:** Queda absolutamente prohibida cualquier operación destructiva o manipulación fuera de sus propias opciones.

## 5. GUTENBERG_API & BLOCK MARKUP

- **Ecosistema React Oficial:** La interacción con el editor se realiza exclusivamente a través del ecosistema oficial de WordPress (`wp.data`, `wp.blocks`), utilizando `select()` y `dispatch()` sobre `core/block-editor`. Queda prohibido jQuery o manipulación directa del DOM.
- **Herencia Visual por Defecto (Theme Style Inheritance):** Todo bloque o sección nueva que la IA genere debe adoptar por defecto el estilo visual de un bloque existente en la página (o la sección más próxima si no hay selección específica), clonando fielmente sus clases CSS (`is-style-*`), bordes redondeados (`border-radius`), espaciados y diseño de botones para garantizar que el nuevo contenido nazca 100% integrado con el tema activo.
- **Auto-Limpieza y Validación de Sintaxis:** Antes de aplicar cualquier marcado al editor, el sistema debe depurar automáticamente cualquier residuo de formato markdown (bloques ```` ```html ````) y verificar la paridad exacta de etiquetas de apertura y cierre (`<!-- wp:... -->` y `<!-- /wp:... -->`) para garantizar que Gutenberg nunca arroje un error de bloque no válido.
- **Cero Bloqueo / Independencia Total:** Todo el contenido generado se inyecta como bloques estáticos nativos de WordPress (`core/group`, `core/columns`, `core/heading`, `core/buttons`, etc.). La visualización del sitio nunca dependerá de que este plugin permanezca activo en el futuro.
