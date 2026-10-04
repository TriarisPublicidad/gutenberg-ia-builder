# Gutenberg IA Builder

Plugin para WordPress que procesa, adapta y genera bloques y páginas completas de Gutenberg utilizando Inteligencia Artificial (Gemini), procesando directamente el código fuente nativo de Gutenberg para preservar al 100% estilos, clases CSS, esquinas redondeadas, degradados y maquetación.

## Características Principales
- **Fidelidad Visual Absoluta:** Manipulación directa del marcado Gutenberg (HTML + comentarios `<!-- wp:... -->`).
- **Adaptación Inteligente:** Reemplaza textos de titulares, párrafos, botones y listas según el briefing suministrado.
- **Generación Contextual:** Crea nuevos bloques siguiendo la estructura de diseño del tema activo.
- **Sin Bloatware:** Código limpio, mantenible y nativo, sin dependencias complejas de AST ni riesgo de corrupción de memoria.

## Requisitos
- WordPress 6.0 o superior
- PHP 7.4 o superior
- Clave de API de Google Gemini (Google AI Studio)

## Licencia
GPL-2.0-or-later
