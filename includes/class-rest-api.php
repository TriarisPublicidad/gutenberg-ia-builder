<?php
/**
 * Endpoints de la API REST para Gutenberg IA Builder.
 *
 * @package Gutenberg_IA_Builder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registra y gestiona los endpoints REST autenticados del plugin.
 */
class Gutenberg_IA_Rest_API {

	/**
	 * Instancia Singleton.
	 *
	 * @var Gutenberg_IA_Rest_API|null
	 */
	private static $instance = null;

	/**
	 * Espacio de nombres de la API REST.
	 */
	const REST_NAMESPACE = 'gutenberg-ia/v1';

	/**
	 * Obtener instancia singleton.
	 *
	 * @return Gutenberg_IA_Rest_API
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor privado. Registra los hooks de la API REST.
	 */
	private function __construct() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Registra las rutas REST de Gutenberg IA.
	 */
	public function register_routes() {
		// Ruta para procesar o generar marcado de bloques.
		register_rest_route(
			self::REST_NAMESPACE,
			'/process',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'handle_process' ),
				'permission_callback' => array( $this, 'check_permissions' ),
				'args'                => array(
					'prompt'           => array(
						'required'          => true,
						'type'              => 'string',
						'sanitize_callback' => 'sanitize_textarea_field',
					),
					'markup'           => array(
						'required' => false,
						'type'     => 'string',
					),
					'reference_markup' => array(
						'required' => false,
						'type'     => 'string',
					),
					'mode'             => array(
						'required'          => false,
						'type'              => 'string',
						'default'           => 'adapt',
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
			)
		);

		// Ruta para comprobar estado y diagnóstico del sistema.
		register_rest_route(
			self::REST_NAMESPACE,
			'/status',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'handle_status' ),
				'permission_callback' => array( $this, 'check_permissions' ),
			)
		);
	}

	/**
	 * Verificación de permisos y nonce REST.
	 * Exclusivo para administradores con manage_options.
	 *
	 * @param WP_REST_Request $request Objeto de petición.
	 * @return bool|WP_Error
	 */
	public function check_permissions( $request ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new WP_Error(
				'rest_forbidden',
				__( 'Acceso denegado. Se requieren permisos de Administrador.', 'gutenberg-ia-builder' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		$nonce = $request->get_header( 'X-WP-Nonce' );
		if ( empty( $nonce ) || ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
			return new WP_Error(
				'rest_invalid_nonce',
				__( 'El nonce de seguridad de WordPress es inválido o ha expirado.', 'gutenberg-ia-builder' ),
				array( 'status' => 403 )
			);
		}

		return true;
	}

	/**
	 * Maneja la petición de procesamiento o generación de bloques.
	 *
	 * @param WP_REST_Request $request Objeto de petición.
	 * @return WP_REST_Response|WP_Error
	 */
	public function handle_process( $request ) {
		// 1. Validar integridad criptográfica del manifiesto.
		$settings  = Gutenberg_IA_Admin_Settings::get_instance();
		$integrity = $settings->get_integrity_status();

		if ( ! $integrity['is_valid'] ) {
			return new WP_Error(
				'integrity_violation',
				__( 'Petición bloqueada por seguridad: El manifiesto de reglas INSTRUCCIONES_IA.md fue alterado o no coincide con el hash autorizado.', 'gutenberg-ia-builder' ),
				array( 'status' => 403 )
			);
		}

		// 2. Extraer parámetros.
		$prompt           = $request->get_param( 'prompt' );
		$markup           = $request->get_param( 'markup' );
		$reference_markup = $request->get_param( 'reference_markup' );
		$mode             = $request->get_param( 'mode' );

		// Desescapar el código fuente sin alterar las etiquetas HTML ni los JSON internos.
		$raw_markup     = ! empty( $markup ) ? wp_unslash( $markup ) : '';
		$raw_reference  = ! empty( $reference_markup ) ? wp_unslash( $reference_markup ) : '';

		if ( empty( trim( $prompt ) ) ) {
			return new WP_Error(
				'empty_prompt',
				__( 'La instrucción (prompt) no puede estar vacía.', 'gutenberg-ia-builder' ),
				array( 'status' => 400 )
			);
		}

		// 3. Procesar mediante el cliente de Gemini.
		$client = Gutenberg_IA_Gemini_Client::get_instance();
		$result = $client->process_markup( $prompt, $raw_markup, $raw_reference, $mode );

		if ( ! $result['success'] ) {
			return new WP_Error(
				'gemini_processing_error',
				$result['error'],
				array( 'status' => 500 )
			);
		}

		return rest_ensure_response(
			array(
				'success' => true,
				'data'    => array(
					'markup'     => $result['markup'],
					'model_used' => $result['model'],
				),
			)
		);
	}

	/**
	 * Devuelve el estado de configuración para la interfaz en el editor.
	 *
	 * @param WP_REST_Request $request Objeto de petición.
	 * @return WP_REST_Response
	 */
	public function handle_status( $request ) {
		$api_key   = get_option( 'ia_gemini_api_key', '' );
		$settings  = Gutenberg_IA_Admin_Settings::get_instance();
		$integrity = $settings->get_integrity_status();

		return rest_ensure_response(
			array(
				'has_api_key'    => ! empty( $api_key ),
				'is_valid'       => $integrity['is_valid'],
				'default_model'  => get_option( 'ia_gemini_default_model', 'gemini-flash-lite-latest' ),
				'brand_voice'    => get_option( 'ia_gemini_brand_voice', '' ),
			)
		);
	}
}
