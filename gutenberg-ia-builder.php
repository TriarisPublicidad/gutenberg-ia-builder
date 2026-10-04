<?php
/**
 * Plugin Name: Gutenberg IA Builder
 * Plugin URI:  https://github.com/TriarisPublicidad/gutenberg-ia-builder
 * Description: Procesador inteligente de código Gutenberg con IA para adaptar, generar y reconstruir bloques y páginas completas preservando el 100% del diseño y clases CSS.
 * Version:     1.0.0
 * Author:      Triaris
 * Author URI:  https://github.com/TriarisPublicidad
 * License:     GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: gutenberg-ia-builder
 * Requires at least: 6.0
 * Requires PHP:      7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'GIB_VERSION', '1.0.0' );
define( 'GIB_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'GIB_PLUGIN_URL', plugins_url( '', __FILE__ ) );

// Base vacía lista para desarrollo limpio paso a paso.
