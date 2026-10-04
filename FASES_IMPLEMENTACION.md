# GUÍA DE PROMPTS DE IMPLEMENTACIÓN - GUTENBERG IA BUILDER

Este documento contiene los prompts ejecutables para cada una de las 4 fases de desarrollo del plugin `gutenberg-ia-builder`, de acuerdo con las especificaciones de `PROMPT-MAESTRO.md` v3.2.0 y el manifiesto `INSTRUCCIONES_IA.md`.

---

## 🟢 PROMPT - FASE 1: Configuración Base y Validación de Integridad

### ROL E INSTRUCCIÓN
Actúa como desarrollador senior de WordPress. Ejecuta la FASE 1 del plugin "Gutenberg IA Builder" (`gutenberg-ia-builder`). 
Debes respetar estrictamente el manifiesto `INSTRUCCIONES_IA.md` y las especificaciones de `PROMPT-MAESTRO.md` v3.2.0.

### OBJETIVO DE LA FASE 1
Crear la estructura base de clases del plugin, la pantalla de administración en WordPress y el sistema de validación de integridad criptográfica (hash MD5).

### ARCHIVOS A CREAR O MODIFICAR
1. `gutenberg-ia-builder.php` (Actualizar punto de entrada, hooks de activación/desactivación y carga de clases).
2. `includes/class-admin-settings.php` (Crear pantalla de configuración en Ajustes > Gutenberg IA).

### REQUERIMIENTOS TÉCNICOS
1. **Activación y Hash MD5:**
   - En el hook de activación (`register_activation_hook`), calcular el hash MD5 de `INSTRUCCIONES_IA.md` y almacenarlo en la opción `ia_gemini_rules_hash`.
   - Si no existe el archivo, registrar error y detener activación.
2. **Control de Acceso:**
   - La pantalla de administración debe estar bajo el menú "Ajustes" (`options-general.php?page=gutenberg-ia-settings`) y protegida estrictamente con `current_user_can('manage_options')`.
3. **Campos de Configuración en Pantalla:**
   - **Estado de Integridad:** Semáforo visual. Compara en tiempo real el MD5 de `INSTRUCCIONES_IA.md` con el hash guardado. Si coincide: badge verde "✓ Manifiesto íntegro". Si difiere: alerta roja "⚠ Manifiesto alterado".
   - **API Key de Gemini:** Campo tipo password (`ia_gemini_api_key`), guardado con `autoload => 'no'`, sanitizado con `sanitize_text_field`. Si ya existe una clave, mostrar indicador "Clave configurada (••••••••)" sin revelar su valor en texto plano.
   - **Selector de Modelo Predeterminado:** Menú desplegable con:
     * `gemini-flash-lite-latest` (Recomendado / Ultra rápido)
     * `gemini-3.1-flash-lite` (Respaldo)
     * `gemini-3.8-flash` (Creativo / Razonamiento avanzado)
   - **Voz y Tono de Marca:** Campo de texto (`ia_gemini_brand_voice`) para definir el tono comercial predeterminado del sitio (opcional).
   - **Botón de Guardar:** Protegido con `check_admin_referer()` / nonce de WordPress.

### CRITERIOS DE VERIFICACIÓN
- Validar sintaxis PHP con `php -l`.
- Acceder a wp-admin > Ajustes > Gutenberg IA y verificar que guarde y lea las opciones en `wp_options` sin errores ni advertencias.
- `git status` limpio y commit: `"feat: implementar Fase 1 - configuracion base y validacion MD5"`.

---

## 🟢 PROMPT - FASE 2: Cliente Resiliente de Gemini y Endpoint REST

### ROL E INSTRUCCIÓN
Actúa como desarrollador senior de WordPress y especialista en APIs de IA. Ejecuta la FASE 2 del plugin "Gutenberg IA Builder" (`gutenberg-ia-builder`).
Debes respetar estrictamente el manifiesto `INSTRUCCIONES_IA.md` y `PROMPT-MAESTRO.md` v3.2.0. Prohibido usar conversores JSON/AST complejos; el procesamiento es 100% texto plano (Block Markup).

### OBJETIVO DE LA FASE 2
Implementar el cliente HTTP oficial para la API de Google Gemini con mecanismo de respaldo (fallback) y registrar el endpoint REST autenticado con filtro de auto-limpieza sintáctica.

### ARCHIVOS A CREAR
1. `includes/class-gemini-client.php` (Cliente de conexión HTTP REST para Gemini).
2. `includes/class-rest-api.php` (Endpoints REST `/gutenberg-ia/v1/process` y `/gutenberg-ia/v1/status`).

### REQUERIMIENTOS TÉCNICOS
1. **Cliente Gemini (`class-gemini-client.php`):**
   - Utilizar exclusivamente `wp_remote_post()` contra el endpoint `https://generativelanguage.googleapis.com/v1beta/{model}:generateContent?key={apiKey}`.
   - Timeout de conexión: 120 segundos. Parámetro `maxOutputTokens: 65536`.
   - **Mecanismo de Fallback y Resiliencia:** Si el modelo principal devuelve error HTTP 429 (límite de cuota) o falla la conexión, reintentar automáticamente de inmediato utilizando el modelo secundario (`gemini-3.1-flash-lite`).
   - Construir el system prompt con las reglas de inmutabilidad de clases CSS (`is-style-*`), atributos literales, equilibrio tipográfico y prohibición de preámbulos conversacionales.
2. **Endpoint REST (`class-rest-api.php`):**
   - Registrar la ruta `POST /gutenberg-ia/v1/process`.
   - `permission_callback`: Verificar estrictamente `current_user_can('manage_options')` y validar nonce con `wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest')`.
   - Verificar integridad MD5: Si el hash del manifiesto no coincide, rechazar la solicitud con código 403.
3. **Filtro de Auto-Limpieza y Validación Sintáctica Pre-Inyección:**
   - Depurar automáticamente cualquier residuo de markdown (` ```html ` o ` ``` `).
   - Validar matemáticamente que el contenido comience con `<!-- wp:` y termine con `-->`.
   - Verificar paridad de etiquetas de apertura y cierre (`<!-- wp:... -->` y `<!-- /wp:... -->`). Si no está balanceado, aplicar saneamiento o solicitar regeneración.

### CRITERIOS DE VERIFICACIÓN
- Validar sintaxis con `php -l`.
- Probar endpoint REST mediante prueba HTTP interna autenticada.
- Verificar manejo correcto de errores y fallback.
- `git status` limpio y commit: `"feat: implementar Fase 2 - cliente Gemini resiliente y endpoint REST con auto-limpieza"`.

---

## 🟢 PROMPT - FASE 3: Integración en Gutenberg (Sidebar, Adaptación y Herencia Visual)

### ROL E INSTRUCCIÓN
Actúa como desarrollador frontend senior especializado en el ecosistema React de WordPress Gutenberg. Ejecuta la FASE 3 del plugin "Gutenberg IA Builder" (`gutenberg-ia-builder`).
Debes respetar estrictamente el manifiesto `INSTRUCCIONES_IA.md` y `PROMPT-MAESTRO.md` v3.2.0. Prohibido jQuery o manipulación directa del DOM; utiliza exclusivamente `wp.data` sobre `core/block-editor`.

### OBJETIVO DE LA FASE 3
Crear la barra lateral oficial en Gutenberg para permitir la adaptación inmediata del bloque seleccionado y la generación de nuevo contenido con herencia visual del tema por defecto.

### ARCHIVOS A CREAR
1. `assets/js/editor-plugin.js` (Panel de plugin oficial de Gutenberg).
2. `assets/css/editor-plugin.css` (Estilos del sidebar, comparador visual y estados).

### REQUERIMIENTOS TÉCNICOS
1. **Registro de la Barra Lateral:**
   - Registrar con `wp.plugins.registerPlugin('gutenberg-ia-builder', ...)` y `PluginSidebar` de `@wordpress/edit-post`.
   - Icono oficial en la barra superior del editor para abrir/cerrar el panel lateral.
2. **Caso 1: Adaptación de Bloque Seleccionado:**
   - Obtener el bloque actualmente seleccionado con `wp.data.select('core/block-editor').getSelectedBlock()`.
   - Serializar el bloque a texto plano mediante `wp.blocks.serialize(block)`.
   - Campo de texto (prompt/briefing) para que el administrador escriba la orden (ej: "Adapta para clínica dental").
   - Botón "Adaptar con IA": envía el Block Markup y el prompt al endpoint REST `/gutenberg-ia/v1/process`.
3. **Caso 2: Herencia Visual por Defecto (Theme Style Inheritance):**
   - Si el usuario solicita un bloque nuevo (ej: "Crea una tabla de 3 precios"), el sistema toma automáticamente el bloque seleccionado (o el más próximo) como plantilla de referencia estética, enviándolo a Gemini para que replique sus clases CSS (`is-style-*`), bordes y botones.
4. **Modo Comparativo y Deshacer:**
   - Al recibir el nuevo marcado, mantener en memoria el original y el generado.
   - Botones interactivos: **[ Ver Original ]** y **[ Ver Generado por IA ]** para alternar la vista en el lienzo antes de confirmar.
   - Botón **Confirmar** (consolida el cambio) y botón **Deshacer** (restaura el estado original).
   - Inserción limpia en el lienzo mediante `wp.blocks.parse(newMarkup)` y `replaceBlocks()`.

### CRITERIOS DE VERIFICACIÓN
- Validar sintaxis JS con `node -c`.
- Abrir el editor de Gutenberg en una página real.
- Seleccionar un bloque con clases personalizadas (ej. tarjeta del tema), adaptarlo con un prompt y confirmar que las clases CSS y el diseño se conservan al 100%.
- Probar alternancia de "Ver Original" y botón "Deshacer".
- `git status` limpio y commit: `"feat: implementar Fase 3 - sidebar Gutenberg, adaptacion de bloques y herencia visual"`.

---

## 🟢 PROMPT - FASE 4: Páginas Completas Modulares y Gemini Vision

### ROL E INSTRUCCIÓN
Actúa como desarrollador senior de WordPress e IA. Ejecuta la FASE 4 del plugin "Gutenberg IA Builder" (`gutenberg-ia-builder`).
Debes respetar estrictamente el manifiesto `INSTRUCCIONES_IA.md` y `PROMPT-MAESTRO.md` v3.2.0.

### OBJETIVO DE LA FASE 4
Implementar el procesamiento secuencial modular para páginas completas (evitando desbordamiento de memoria) y la inspección multimodal de imágenes (`core/image`) con Gemini Vision para generar textos alternativos SEO.

### ARCHIVOS A MODIFICAR
1. `assets/js/editor-plugin.js` (Agregar lógica de escaneo por secciones, barra de progreso y visión de imágenes).
2. `includes/class-gemini-client.php` y `includes/class-rest-api.php` (Agregar soporte para endpoint `/vision`).

### REQUERIMIENTOS TÉCNICOS
1. **Regeneración de Páginas Completas (Procesamiento Modular):**
   - Escanear todos los bloques raíz de la página (`getBlocks()`).
   - Dividir la página en secciones secuenciales (ej. Hero, Características, Precios, FAQ, Contacto).
   - Barra de progreso interactiva en el sidebar: *"Procesando sección 1 de 5: Hero..."*, *"Procesando sección 2 de 5: Beneficios..."*.
   - Procesar cada sección de forma independiente y actualizar el lienzo de Gutenberg progresivamente.
   - Opción global de **Confirmar Todo** o **Deshacer Todo**.
2. **Inspección Multimodal (Gemini Vision para Imágenes):**
   - Al seleccionar un bloque `core/image`, mostrar botón: *"Analizar imagen con Gemini Vision"*.
   - Obtener la URL de la imagen cargada en WordPress, transmitirla de forma segura al endpoint REST `/gutenberg-ia/v1/vision`.
   - Gemini analiza el contenido visual y genera automáticamente:
     * Texto alternativo SEO (`alt`).
     * Pie de foto sugerido (`caption`).
   - El plugin actualiza los atributos del bloque `core/image` sin recargar la página.

### CRITERIOS DE VERIFICACIÓN
- Validar sintaxis de todos los archivos (`php -l`, `node -c`).
- Probar regeneración secuencial de una página completa con varias secciones sin errores de memoria PHP.
- Probar análisis multimodal en una imagen del editor y verificar la asignación correcta del atributo `alt`.
- `git status` limpio y sincronización final: `git push origin main`.
- Commit: `"feat: implementar Fase 4 - regeneracion modular de paginas completas y Gemini Vision"`.
