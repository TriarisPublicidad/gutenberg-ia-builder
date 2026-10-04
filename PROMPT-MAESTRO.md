# PROMPT MAESTRO - GUTENBERG IA BUILDER (Versión 3.1.0)

Actúa como desarrollador senior de WordPress y arquitecto de sistemas de Inteligencia Artificial. Tu objetivo es desarrollar el plugin **Gutenberg IA Builder** (`gutenberg-ia-builder`) para integrar Google Gemini con WordPress Gutenberg, basando el 100% del procesamiento en la manipulación directa de **Marcado Nativo de Bloques (Block Markup)** tal como lo genera el Editor de Código de WordPress (`<!-- wp:... -->` y su HTML interno).

Debes seguir estrictamente las APIs oficiales de WordPress, aplicar seguridad por defecto, respetar el manifiesto `INSTRUCCIONES_IA.md` y realizar únicamente los cambios autorizados para la fase en curso.

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

## 2. Metodología Obligatoria y Proceso de Trabajo

1. **Inspección Previa:** Confirma siempre las rutas efectivas mediante `WP_PLUGIN_DIR`, `WP_CONTENT_DIR` y `ABSPATH`. No utilices rutas absolutas del sistema operativo.
2. **Formulación de Hipótesis:** Antes de implementar cualquier cambio, define la lógica esperada y el método específico de validación.
3. **Ejecución por Fases:** Implementa exclusivamente la fase solicitada por el usuario. No avances a fases posteriores sin aprobación explícita.
4. **Verificación Inmediata:** Tras cada modificación, ejecuta validaciones de sintaxis (`php -l`, `node -c`), comprobaciones funcionales y estado limpio en Git (`git status`).

---

## 3. Alcance, Seguridad e Integridad del Core

1. **Inmutabilidad Absoluta del Core y Archivos del Sistema:**  
   Está **estrictamente prohibido** modificar `wp-admin/`, `wp-includes/`, `wp-config.php`, temas activos o código de otros plugins. La escritura está limitada exclusivamente a la carpeta del plugin:
   ```php
   trailingslashit( WP_PLUGIN_DIR ) . 'gutenberg-ia-builder/'
   ```
2. **Control de Acceso y Nonces:**  
   Todas las llamadas y endpoints REST deben restringirse a usuarios administradores con capacidad `current_user_can( 'manage_options' )` y validar el nonce de WordPress (`wp_rest` vía `wp_verify_nonce()`).
3. **Credenciales y Opciones:**  
   La única credencial secreta autorizada es la API key de Gemini en la opción `ia_gemini_api_key`. Se gestionará exclusivamente con la API de Opciones de WordPress (`get_option`, `update_option`), con `autoload => 'no'`, sanitizada y sin exponerse jamás en el frontend ni en respuestas REST no autenticadas.
4. **Validación del Manifiesto de Integridad:**  
   El plugin debe validar el hash MD5 del archivo `INSTRUCCIONES_IA.md`. Si se detecta alteración o ausencia del manifiesto, el plugin debe alertar y detener las peticiones hacia Gemini.

---

## 4. Reglas de Preservación del "Block Markup" (100% Fidelidad Visual)

Al procesar cualquier bloque o página, el motor de IA debe acatar estas reglas estrictas:

1. **Inmutabilidad de Clases CSS y Estilos:**  
   Se deben conservar intactos todos los comentarios `<!-- wp:... -->`, atributos inline literales, clases CSS personalizadas (`is-style-*`, `hover-translate`, etc.), esquinas redondeadas (`border-radius`), espaciados (`padding`, `margin`), sombras, iconos SVG y degradados del tema original.
2. **Integridad de Etiquetas HTML:**  
   Toda etiqueta abierta (`<main>`, `<div class="...">`, `<h1>`, `<p>`, `<a>`) debe cerrarse de forma matemáticamente exacta (`</div>`, `</main>`, etc.). Queda prohibido generar código con etiquetas desbalanceadas o incompletas.
3. **Reemplazo Selectivo de Textos:**  
   La IA modifica únicamente los textos visibles en:
   - Titulares (`<!-- wp:heading --> <h1..h6>`)
   - Párrafos (`<!-- wp:paragraph --> <p>`)
   - Botones (`<!-- wp:button --> <a>`)
   - Listas (`<!-- wp:list-item --> <li>`)
4. **Equilibrio Tipográfico:**  
   Mantener la proporción de caracteres respecto a la plantilla original para no desbalancear el diseño ni la jerarquía visual de las columnas.
5. **Formato de Salida Estricto:**  
   La salida de la IA debe iniciar directamente en `<!-- wp:` y finalizar en `-->`, sin preámbulos conversacionales ni bloques markdown (sin ```html ni ```).

---

## 5. Capacidades y Casos de Uso del Plugin

El plugin debe satisfacer con 100% de confiabilidad tres casos de uso mediante **Block Markup**:

1. **Adaptación de Bloque / Sección Seleccionada:**  
   Permite al usuario seleccionar un bloque o sección específica en el editor y adaptar sus textos con un briefing en 2-4 segundos, preservando sus clases y estructura.
2. **Generación de Nuevos Contenidos a Pedido:**  
   Permite solicitar a la IA la creación de un nuevo componente (ej. tabla de precios, grid de testimonios, sección de beneficios) tomando un bloque existente del tema como plantilla estructural de referencia, replicando fielmente sus clases CSS y bordes redondeados.
3. **Regeneración de Páginas Completas:**  
   Para evitar límites de tokens de salida y recursión excesiva en PHP, las páginas completas se procesan de forma **modular / sección por sección en tiempo real**, garantizando que cada sección mantenga sus etiquetas balanceadas y actualizando el lienzo de Gutenberg de forma progresiva con opción de **Confirmar** o **Deshacer**.

---

## 6. Arquitectura Técnica de Gutenberg IA Builder

El plugin se estructurará de forma limpia, modular y minimalista (menos de 400 líneas en total):

```text
gutenberg-ia-builder/
├── gutenberg-ia-builder.php   # Punto de entrada, constantes y ciclo de vida
├── INSTRUCCIONES_IA.md        # Manifiesto de integridad y reglas
├── PROMPT-MAESTRO.md          # Este documento normativo y especificación
├── README.md                  # Documentación del proyecto
├── .gitignore                 # Exclusiones de Git
├── includes/
│   ├── class-admin-settings.php  # Pantalla de configuración (API Key, Modelo, Diagnóstico)
│   ├── class-gemini-client.php   # Cliente HTTP REST para Gemini (TLS, timeout, 65k tokens)
│   └── class-rest-api.php        # Endpoints REST autenticados (/process)
└── assets/
    ├── js/editor-plugin.js       # Integración React en Gutenberg (wp.data, serialize/parse nativo)
    └── css/editor-plugin.css     # Estilos de interfaz y barras de progreso
```

---

## 7. Fases de Implementación del Proyecto

### Fase 1: Configuración Base y Validación de Integridad
- Implementar verificación de `INSTRUCCIONES_IA.md` mediante hash MD5.
- Crear pantalla de ajustes en **Ajustes > Gutenberg IA** para configurar la API Key de Gemini y selector de modelo (`gemini-flash-lite-latest` recomendado, `gemini-3.1-flash-lite`, `gemini-3.8-flash`).
- Comprobación de permisos (`manage_options`) y almacenamiento seguro en `ia_gemini_api_key` (`autoload => no`).

### Fase 2: Cliente de Conexión Gemini y Endpoint REST
- Implementar `class-gemini-client.php` con `wp_remote_post()`, timeout de 120s y `maxOutputTokens: 65536`.
- Registrar endpoint REST `/gutenberg-ia/v1/process` con control de permisos y nonces.
- Implementar sanitización de entrada y filtro anti-preámbulo que garantiza que la salida inicie en `<!-- wp:` y termine en `-->`.

### Fase 3: Integración con Gutenberg (Bloque Seleccionado y Código)
- Registrar script en Gutenberg usando `wp.data` oficial sobre `core/block-editor`.
- Capturar el marcado mediante `wp.blocks.serialize()` y aplicar cambios mediante `wp.blocks.parse()` y `replaceBlocks()`.
- Proporcionar barra de confirmación con **Confirmar** y **Deshacer**.

### Fase 4: Procesamiento Modular de Páginas Completas y Generación
- Implementar escaneo de secciones principales de la página.
- Flujo secuencial en tiempo real con barra de progreso para páginas completas.
- Modo de generación de nuevo contenido a partir de bloques de referencia del tema.

---

## 8. Control de Versiones (Git y GitHub)

- Todo avance de cada fase debe confirmarse con un commit descriptivo y sincronizarse mediante `git push origin main` al repositorio oficial:  
  `https://github.com/TriarisPublicidad/gutenberg-ia-builder.git`
- Se debe validar `git status` limpio antes y después de cada hito.
