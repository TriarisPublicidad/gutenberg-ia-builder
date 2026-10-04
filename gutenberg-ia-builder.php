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

// Constantes globales del plugin.
define( 'GIB_VERSION', '1.0.0' );
define( 'GIB_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'GIB_PLUGIN_URL', plugins_url( '', __FILE__ ) );
define( 'GIB_PLUGIN_FILE', __FILE__ );
define( 'GIB_RULES_FILE', GIB_PLUGIN_DIR . 'INSTRUCCIONES_IA.md' );

/**
 * Hook de activación del plugin: valida el manifiesto y guarda el hash MD5 oficial.
 */
function gib_activate_plugin() {
	if ( file_exists( GIB_RULES_FILE ) ) {
		$hash = md5_file( GIB_RULES_FILE );
		if ( $hash ) {
			update_option( 'ia_gemini_rules_hash', $hash, 'no' );
		}
	}

	// Inicializar valores predeterminados no sensibles si no existen.
	if ( false === get_option( 'ia_gemini_default_model' ) ) {
		update_option( 'ia_gemini_default_model', 'gemini-flash-lite-latest', 'no' );
	}

	if ( false === get_option( 'ia_gemini_temperature' ) ) {
		update_option( 'ia_gemini_temperature', '0.7', 'no' );
	}
}
register_activation_hook( __FILE__, 'gib_activate_plugin' );

/**
 * Hook de desactivación del plugin.
 */
function gib_deactivate_plugin() {
	// Limpieza temporal o transitorios si fuese necesario en el futuro.
}
register_deactivation_hook( __FILE__, 'gib_deactivate_plugin' );

/**
 * Cargar clases del plugin.
 */
require_once GIB_PLUGIN_DIR . 'includes/class-admin-settings.php';
require_once GIB_PLUGIN_DIR . 'includes/class-gemini-client.php';
require_once GIB_PLUGIN_DIR . 'includes/class-rest-api.php';

/**
 * Inicializar componentes tras la carga de plugins.
 */
function gib_init_plugin() {
	// Inicializar API REST (debe registrarse tanto en admin como en peticiones REST).
	Gutenberg_IA_Rest_API::get_instance();

	if ( is_admin() ) {
		Gutenberg_IA_Admin_Settings::get_instance();

		// Auto-inicializar hash si el plugin ya estaba activo y aún no se guardó.
		if ( false === get_option( 'ia_gemini_rules_hash' ) && file_exists( GIB_RULES_FILE ) ) {
			$hash = md5_file( GIB_RULES_FILE );
			if ( $hash ) {
				update_option( 'ia_gemini_rules_hash', $hash, 'no' );
			}
		}
	}
}
add_action( 'plugins_loaded', 'gib_init_plugin' );
