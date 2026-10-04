# PROMPT MAESTRO - GUTENBERG IA BUILDER (Versión 3.2.0)

Actúa como desarrollador senior de WordPress y arquitecto de sistemas de Inteligencia Artificial. Tu objetivo es desarrollar el plugin **Gutenberg IA Builder** (`gutenberg-ia-builder`) para integrar Google Gemini con WordPress Gutenberg, basando el 100% del procesamiento en la manipulación directa de **Marcado Nativo de Bloques (Block Markup)** tal como lo genera el Editor de Código de WordPress (`<!-- wp:... -->` y su HTML interno).

Debes seguir estrictamente las APIs oficiales de WordPress, aplicar seguridad por defecto, respetar el manifiesto [INSTRUCCIONES_IA.md](file:///c:/Users/bfuen/OneDrive/Desktop/WWW/triaris/app/public/content/plugins/gutenberg-ia-builder/INSTRUCCIONES_IA.md) y realizar únicamente los cambios autorizados para la fase en curso.

---

## 1. Principio Fundamental: Procesamiento Directo de "Block Markup" (Cero JSON / Cero AST)

### Lo que NUNCA se debe hacer (Prohibición Expresa de Conversores Complejos):
- **PROHIBIDO:** Convertir el contenido a estructuras de datos JSON complejas, árboles AST recursivos o esquemas intermedios. Este enfoque fue la causa del colapso del plugin anterior (más de 6.000 líneas de código frágil que mutilaban clases CSS).
- **PROHIBIDO:** Utilizar analizadores PHP que intenten reinterpretar o reconstruir los bloques como objetos o arrays multidimensionales.

### Lo que SÍ se hace (Flujo de Texto Plano 100% Nativo):
- **Entrada:** Cadena de texto plano del **Block Markup** copiado directamente desde el Editor de Código de Gutenberg (o serializado nativamente con `wp.blocks.serialize`).
- **Procesamiento:** Gemini procesa el texto respetando los comentarios `<!-- wp:... -->` y el HTML interno como código fuente directo.
- **Salida:** Cadena de texto plano del **Block Markup** adaptado, listo para ser insertado directamente en el Editor de Código (o mediante `wp.blocks.parse` nativo de WordPress).
- **Atributos inline de WordPress:** Los textos entre llaves `{...}` que WordPress incluye literalmente dentro de sus comentarios de bloque (ej. `<!-- wp:group {"style":{...},"className":"..."} -->`) son tratados simplemente como **texto literal inmutable** que la IA debe preservar sin alterar ni reinterpretar.

---

## 2. Metodología Obligatoria y Seguridad de Acceso

1. **Acceso Exclusivo para Administradores:**  
   Todo el sistema, pantalla de ajustes y endpoints REST están estrictamente restringidos a usuarios con capacidad `current_user_can( 'manage_options' )`.
2. **Inspección Previa:**  
   Confirma siempre las rutas efectivas mediante `WP_PLUGIN_DIR`, `WP_CONTENT_DIR` y `ABSPATH`. No utilices rutas absolutas del sistema operativo.
3. **Ejecución por Fases:**  
   Implementa exclusivamente la fase solicitada por el usuario. No avances a fases posteriores sin aprobación explícita.
4. **Verificación Inmediata:**  
   Tras cada modificación, ejecuta validaciones de sintaxis (`php -l`, `node -c`), comprobaciones funcionales y estado limpio en Git (`git status`).

---

## 3. Alcance, Seguridad e Integridad del Core

1. **Inmutabilidad Absoluta del Core y Archivos del Sistema:**  
   Está **estrictamente prohibido** modificar `wp-admin/`, `wp-includes/`, `wp-config.php`, temas activos o código de otros plugins. La escritura está limitada exclusivamente a la carpeta del plugin:
   ```php
   trailingslashit( WP_PLUGIN_DIR ) . 'gutenberg-ia-builder/'
   ```
2. **Control de Acceso y Nonces:**  
   Todas las llamadas y endpoints REST deben restringirse a administradores y validar el nonce de WordPress (`wp_rest` vía `wp_verify_nonce()`).
3. **Credenciales y Opciones en `wp_options`:**  
   La única credencial secreta autorizada es la API key de Gemini en la opción `ia_gemini_api_key`. Se gestionará exclusivamente con la API de Opciones de WordPress (`get_option`, `update_option`), con `autoload => 'no'`, sanitizada y sin exponerse jamás en el navegador.
4. **Validación del Manifiesto de Integridad:**  
   El plugin debe validar el hash MD5 del archivo [INSTRUCCIONES_IA.md](file:///c:/Users/bfuen/OneDrive/Desktop/WWW/triaris/app/public/content/plugins/gutenberg-ia-builder/INSTRUCCIONES_IA.md). Si se detecta alteración o ausencia del manifiesto, el plugin debe alertar y detener las peticiones hacia Gemini.

---

## 4. Reglas de Preservación y Estética del "Block Markup"

Al procesar cualquier bloque o página, el motor de IA debe acatar estas reglas estrictas:

1. **Inmutabilidad de Clases CSS y Estilos Existentes:**  
   Se deben conservar intactos todos los comentarios `<!-- wp:... -->`, atributos inline literales, clases CSS personalizadas (`is-style-*`, `hover-translate`, etc.), esquinas redondeadas (`border-radius`), espaciados (`padding`, `margin`), sombras, iconos SVG y degradados del tema original.
2. **Herencia Visual por Defecto (Theme Style Inheritance):**  
   **REGLA OBLIGATORIA:** Al generar cualquier bloque o sección nueva a pedido del usuario (ej. tablas de precios, tarjetas, grids, testimonios), el plugin debe tomar **por defecto** el estilo de un bloque existente en la página (o la sección más próxima si no hay bloque seleccionado) como referencia visual. La IA clonará exactamente las clases CSS del tema (`is-style-*`), diseño de botones y bordes redondeados para que el nuevo bloque nazca 100% integrado estéticamente con el tema.
3. **Filtro de Auto-Limpieza y Validación de Sintaxis (Pre-Inyección):**  
   Antes de inyectar el código generado en Gutenberg:
   - Depuración automática de cualquier residuo de markdown (```` ```html ```` y ```` ``` ````).
   - Verificación estricta de paridad de comentarios: cada etiqueta abierta `<!-- wp:... -->` debe tener su correspondiente `<!-- /wp:... -->` o ser autocerrada `-->`.
   - Si no cumple la validación sintáctica, el plugin bloquea la inyección para evitar el error de *"Bloque no válido"* en Gutenberg y solicita corrección automática.
4. **Reemplazo Selectivo de Textos:**  
   La IA modifica únicamente los textos visibles en:
   - Titulares (`<!-- wp:heading --> <h1..h6>`)
   - Párrafos (`<!-- wp:paragraph --> <p>`)
   - Botones (`<!-- wp:button --> <a>`)
   - Listas (`<!-- wp:list-item --> <li>`)
5. **Equilibrio Tipográfico:**  
   Mantener la proporción de caracteres respecto a la plantilla original para no desbalancear el diseño ni la jerarquía visual de las columnas.
6. **Formato de Salida Estricto:**  
   La salida de la IA debe iniciar directamente en `<!-- wp:` y finalizar en `-->`, sin preámbulos conversacionales ni bloques markdown.

---

## 5. Experiencia de Usuario y Capacidades del Plugin

1. **Adaptación de Bloque / Sección Seleccionada:**  
   Permite al administrador seleccionar un bloque o sección específica en el editor y adaptar sus textos con un briefing en 2-4 segundos, preservando sus clases y estructura.
2. **Generación de Nuevos Contenidos a Pedido (Con ADN del Tema por Defecto):**  
   Genera nuevas secciones completas heredando por defecto la estética de las tarjetas y botones existentes en la página.
3. **Modo Comparativo "Antes y Después" y Deshacer:**  
   En la barra lateral de Gutenberg, el administrador puede alternar:
   - **[ Ver Original ]** / **[ Ver Generado por IA ]**
   - Botón de **Confirmar** para consolidar el cambio y botón de **Deshacer** para revertir inmediatamente.
4. **Regeneración de Páginas Completas por Secciones (Modular):**  
   Para evitar límites de tokens de salida y desbordamiento de memoria PHP, las páginas completas se procesan de forma modular (sección por sección) en tiempo real con una barra de progreso visible.
5. **Cliente Resiliente con Reintento y Fallback:**  
   Si el modelo principal (`gemini-flash-lite-latest`) encuentra una limitación temporal de cuota (error 429), el cliente PHP reintenta inmediatamente con el modelo secundario (`gemini-3.1-flash-lite`) sin interrumpir al usuario.
6. **Inspección Multimodal (Gemini Vision) para Imágenes:**  
   Generación automática de textos alternativos (`alt`), descripciones accesibles y pies de foto para bloques `core/image`.

---

## 6. Arquitectura Técnica de Gutenberg IA Builder

El plugin se estructura de forma limpia, modular y minimalista:

```text
gutenberg-ia-builder/
├── gutenberg-ia-builder.php   # Punto de entrada, constantes y ciclo de vida
├── INSTRUCCIONES_IA.md        # Manifiesto de integridad y reglas (MD5 validado)
├── PROMPT-MAESTRO.md          # Este documento normativo y especificación
├── README.md                  # Documentación del proyecto
├── .gitignore                 # Exclusiones de Git
├── includes/
│   ├── class-admin-settings.php  # Pantalla de configuración (API Key, Modelo, Tono, MD5)
│   ├── class-gemini-client.php   # Cliente HTTP REST para Gemini (TLS, fallback, 65k tokens)
│   └── class-rest-api.php        # Endpoints REST autenticados (/process, /vision)
└── assets/
    ├── js/editor-plugin.js       # Integración React en Gutenberg (wp.data, serialize/parse, UI)
    └── css/editor-plugin.css     # Estilos de interfaz, barra de progreso y comparador
```

---

## 7. Fases de Implementación del Proyecto

### Fase 1: Configuración Base y Validación de Integridad
- Implementar verificación de `INSTRUCCIONES_IA.md` mediante hash MD5.
- Crear pantalla de ajustes en **Ajustes > Gutenberg IA** para configurar la API Key de Gemini y selector de modelo (`gemini-flash-lite-latest` recomendado, `gemini-3.1-flash-lite`, `gemini-3.8-flash`).
- Comprobación estricta de permisos (`manage_options`) y almacenamiento seguro en `ia_gemini_api_key` (`autoload => no`).

### Fase 2: Cliente de Conexión Gemini y Endpoint REST
- Implementar `class-gemini-client.php` con `wp_remote_post()`, timeout de 120s, `maxOutputTokens: 65536` y fallback automático.
- Registrar endpoint REST `/gutenberg-ia/v1/process` con control de permisos y nonces.
- Implementar filtro de auto-limpieza y validación de sintaxis de comentarios de bloque.

### Fase 3: Integración con Gutenberg (Barra Lateral, Adaptación y Herencia Visual)
- Registrar script en Gutenberg usando `wp.data` oficial sobre `core/block-editor`.
- Capturar el marcado mediante `wp.blocks.serialize()` y aplicar cambios mediante `wp.blocks.parse()` y `replaceBlocks()`.
- Implementar herencia de estilo del tema por defecto al solicitar nuevo contenido.
- Implementar botones de **Antes y Después**, **Confirmar** y **Deshacer**.

### Fase 4: Procesamiento Modular de Páginas Completas y Gemini Vision
- Escaneo de secciones principales de la página para procesamiento secuencial en tiempo real.
- Barra de progreso por secciones para páginas completas.
- Modo multimodal para generación de textos alternativos (`alt`) en imágenes con Gemini Vision.

---

## 8. Control de Versiones (Git y GitHub)

- Todo avance de cada fase debe confirmarse con un commit descriptivo y sincronizarse mediante `git push origin main` al repositorio oficial:  
  `https://github.com/TriarisPublicidad/gutenberg-ia-builder.git`
- Se debe validar `git status` limpio antes y después de cada hito.
