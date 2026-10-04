<?php
/**
 * Cliente HTTP para la API de Google Gemini en Gutenberg IA Builder.
 *
 * @package Gutenberg_IA_Builder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Gestiona la comunicación con la API de Google Gemini con soporte de fallback y auto-limpieza.
 */
class Gutenberg_IA_Gemini_Client {

	/**
	 * Instancia Singleton.
	 *
	 * @var Gutenberg_IA_Gemini_Client|null
	 */
	private static $instance = null;

	/**
	 * URL base de la API de Gemini.
	 */
	const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

	/**
	 * Obtener instancia singleton.
	 *
	 * @return Gutenberg_IA_Gemini_Client
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor privado.
	 */
	private function __construct() {}

	/**
	 * Procesa o genera Block Markup mediante Gemini.
	 *
	 * @param string $prompt           Instrucción del usuario.
	 * @param string $block_markup     Marcado de bloques actual (en modo adapt).
	 * @param string $reference_markup Marcado de referencia estética (Theme Style Inheritance).
	 * @param string $mode             'adapt' o 'generate'.
	 * @return array{success: bool, markup?: string, model?: string, error?: string}
	 */
	public function process_markup( $prompt, $block_markup = '', $reference_markup = '', $mode = 'adapt' ) {
		$api_key = get_option( 'ia_gemini_api_key', '' );
		if ( empty( $api_key ) ) {
			return array(
				'success' => false,
				'error'   => __( 'No se ha configurado la API Key de Gemini en Ajustes > Gutenberg IA.', 'gutenberg-ia-builder' ),
			);
		}

		$primary_model   = get_option( 'ia_gemini_default_model', 'gemini-flash-lite-latest' );
		$fallback_model  = ( 'gemini-flash-lite-latest' === $primary_model ) ? 'gemini-3.1-flash-lite' : 'gemini-flash-lite-latest';
		$temperature     = floatval( get_option( 'ia_gemini_temperature', '0.7' ) );
		$brand_voice     = get_option( 'ia_gemini_brand_voice', '' );

		$system_instruction = $this->build_system_instruction( $mode, $brand_voice, $reference_markup );
		$user_content       = $this->build_user_content( $prompt, $block_markup, $mode, $reference_markup );

		$payload = array(
			'contents'          => array(
				array(
					'role'  => 'user',
					'parts' => array(
						array( 'text' => $user_content ),
					),
				),
			),
			'systemInstruction' => array(
				'parts' => array(
					array( 'text' => $system_instruction ),
				),
			),
			'generationConfig'  => array(
				'temperature'     => $temperature,
				'maxOutputTokens' => 65536,
			),
		);

		// Intento 1: Modelo Primario
		$response = $this->call_api( $primary_model, $payload, $api_key );

		if ( $response['success'] ) {
			$cleaned = $this->clean_and_validate_markup( $response['text'] );
			if ( $cleaned['valid'] ) {
				return array(
					'success' => true,
					'markup'  => $cleaned['markup'],
					'model'   => $primary_model,
				);
			}
		}

		// Si falló por cuota (429) o error de respuesta, reintentar con el modelo de respaldo.
		if ( ! empty( $fallback_model ) && $fallback_model !== $primary_model ) {
			$fallback_response = $this->call_api( $fallback_model, $payload, $api_key );
			if ( $fallback_response['success'] ) {
				$cleaned = $this->clean_and_validate_markup( $fallback_response['text'] );
				if ( $cleaned['valid'] ) {
					return array(
						'success' => true,
						'markup'  => $cleaned['markup'],
						'model'   => $fallback_model . ' (fallback)',
					);
				}
			}
		}

		$error_message = isset( $response['error'] ) ? $response['error'] : __( 'Error desconocido al procesar con Gemini.', 'gutenberg-ia-builder' );
		return array(
			'success' => false,
			'error'   => $error_message,
		);
	}

	/**
	 * Realiza la petición HTTP a la API de Gemini vía wp_remote_post.
	 *
	 * @param string $model   Nombre del modelo.
	 * @param array  $payload Datos JSON a enviar.
	 * @param string $api_key Clave de API.
	 * @return array{success: bool, text?: string, error?: string, status_code?: int}
	 */
	private function call_api( $model, $payload, $api_key ) {
		$clean_model = ltrim( str_replace( 'models/', '', $model ), '/' );
		$url         = self::API_BASE_URL . $clean_model . ':generateContent?key=' . rawurlencode( $api_key );

		$args = array(
			'headers'     => array(
				'Content-Type' => 'application/json; charset=utf-8',
			),
			'body'        => wp_json_encode( $payload ),
			'timeout'     => 120,
			'data_format' => 'body',
			'sslverify'   => true,
		);

		$raw_response = wp_remote_post( $url, $args );

		if ( is_wp_error( $raw_response ) ) {
			return array(
				'success' => false,
				'error'   => $raw_response->get_error_message(),
			);
		}

		$status_code = wp_remote_retrieve_response_code( $raw_response );
		$body        = wp_remote_retrieve_body( $raw_response );
		$data        = json_decode( $body, true );

		if ( 200 !== $status_code ) {
			$error_msg = isset( $data['error']['message'] ) ? $data['error']['message'] : sprintf( __( 'Error HTTP %d de la API de Gemini.', 'gutenberg-ia-builder' ), $status_code );
			return array(
				'success'     => false,
				'error'       => $error_msg,
				'status_code' => $status_code,
			);
		}

		if ( ! empty( $data['candidates'][0]['content']['parts'][0]['text'] ) ) {
			return array(
				'success' => true,
				'text'    => $data['candidates'][0]['content']['parts'][0]['text'],
			);
		}

		return array(
			'success' => false,
			'error'   => __( 'La API de Gemini devolvió una respuesta vacía o incompleta.', 'gutenberg-ia-builder' ),
		);
	}

	/**
	 * Construye las instrucciones de sistema estrictas.
	 *
	 * @param string $mode             'adapt' o 'generate'.
	 * @param string $brand_voice      Tono de marca configurado.
	 * @param string $reference_markup Marcado de referencia de estilo.
	 * @return string
	 */
	private function build_system_instruction( $mode, $brand_voice = '', $reference_markup = '' ) {
		$instructions = array();
		$instructions[] = 'Eres un motor de arquitectura de código para WordPress Gutenberg y especialista en copywriting web.';
		$instructions[] = 'Tu única función es recibir y emitir código fuente nativo de bloques de Gutenberg (Block Markup), combinando comentarios <!-- wp:... --> con etiquetas HTML estándar.';
		$instructions[] = 'REGLAS CRÍTICAS DE SALIDA:';
		$instructions[] = '1. Tu respuesta DEBE comenzar inmediatamente con "<!-- wp:" y finalizar con "-->" o su bloque de cierre. NUNCA agregues preámbulos, saludos, explicaciones, ni bloques markdown como ```html o ```.';
		$instructions[] = '2. INMUTABILIDAD DE ESTILOS: Conserva intactos todos los comentarios <!-- wp:... -->, los atributos JSON literales {"className":"...", "style":{...}}, todas las clases CSS personalizadas (is-style-*, hover-*, border-radius, padding, margin, sombras, iconos SVG y degradados).';
		$instructions[] = '3. INTEGRIDAD MATEMÁTICA DE ETIQUETAS: Toda etiqueta HTML abierta (<div class="...">, <h1>, <p>, <a>) debe cerrarse de forma matemáticamente exacta (</div>, </h1>, etc.). Queda terminantemente prohibido generar HTML desbalanceado.';
		$instructions[] = '4. MODIFICACIÓN SELECTIVA: Modifica únicamente los textos legibles visibles (titulares h1-h6, párrafos p, textos de botones a, elementos de lista li) según el briefing solicitado.';
		$instructions[] = '5. EQUILIBRIO TIPOGRÁFICO: Mantén una proporción de caracteres similar a la plantilla para no desarmar el diseño visual ni la jerarquía de columnas.';
		$instructions[] = '6. CREACIÓN DE BLOQUES COMPUESTOS ANIDADOS: Cuando se te solicite crear un bloque nuevo o compuesto (ej. titular, subtitular, 3 columnas con imágenes y redes sociales, botones centrados), debes generar la estructura completa de bloques nativos anidados de WordPress (<!-- wp:group --> conteniendo <!-- wp:heading -->, <!-- wp:columns --> <!-- wp:column --> ... <!-- /wp:column --> <!-- /wp:columns -->, <!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} --> ...). Envuelve siempre la sección compuesta en un bloque <!-- wp:group --> con clase coherente.';
		$instructions[] = '7. GRAMÁTICA ESTRICTA DE LISTAS (WordPress 6.x): Toda lista generada mediante <!-- wp:list --> DEBE contener sus elementos como bloques hijos individuales <!-- wp:list-item --><li>...</li><!-- /wp:list-item --> dentro de la etiqueta <ul>. Queda terminantemente prohibido generar etiquetas <li> directas sin su correspondiente comentario <!-- wp:list-item -->. Para listas de enlaces a redes sociales, utiliza preferentemente el bloque nativo <!-- wp:social-links --><ul class="wp-block-social-links"><!-- wp:social-link {"url":"...","service":"..."} /--></ul><!-- /wp:social-links -->.';

		if ( ! empty( $brand_voice ) ) {
			$instructions[] = 'VOZ Y TONO DE MARCA OBLIGATORIO: Adapta los textos respetando esta directriz de personalidad: ' . $brand_voice;
		}

		if ( 'generate' === $mode || ! empty( $reference_markup ) ) {
			$instructions[] = 'HERENCIA VISUAL POR DEFECTO (Theme Style Inheritance): Se te ha provisto un bloque de referencia del tema. Debes clonar exactamente sus clases CSS, atributos de estilo, diseño de botones y estructura de tarjetas para que el nuevo contenido creado nazca 100% integrado visualmente con el tema.';
		}

		return implode( "\n", $instructions );
	}

	/**
	 * Construye el contenido del usuario para la petición.
	 *
	 * @param string $prompt           Briefing del usuario.
	 * @param string $block_markup     Marcado a transformar.
	 * @param string $mode             'adapt' o 'generate'.
	 * @param string $reference_markup Referencia visual.
	 * @return string
	 */
	private function build_user_content( $prompt, $block_markup, $mode, $reference_markup ) {
		$content = array();

		if ( 'adapt' === $mode && ! empty( $block_markup ) ) {
			$content[] = "=== MARCADOR GUTENBERG A ADAPTAR ===";
			$content[] = $block_markup;
			$content[] = "====================================";
			$content[] = "BRIEFING / INSTRUCCIÓN DEL USUARIO:";
			$content[] = $prompt;
			$content[] = "Instrucción de ejecución: Reescribe los textos del bloque anterior según el briefing, manteniendo al 100% todas las clases CSS, bordes, espaciados y estructura intacta.";
		} else {
			if ( ! empty( $reference_markup ) ) {
				$content[] = "=== PLANTILLA DE REFERENCIA ESTÉTICA DEL TEMA ===";
				$content[] = $reference_markup;
				$content[] = "=================================================";
			}
			$content[] = "BRIEFING / SOLICITUD DE NUEVO CONTENIDO:";
			$content[] = $prompt;
			$content[] = "Instrucción de ejecución: Crea el componente o sección solicitada utilizando bloques nativos de Gutenberg, heredando las clases CSS, diseño de botones y estilos de la plantilla de referencia provista.";
		}

		return implode( "\n\n", $content );
	}

	/**
	 * Filtro de auto-limpieza sintáctica y validación de paridad de comentarios.
	 *
	 * @param string $raw_text Salida sin procesar de Gemini.
	 * @return array{valid: bool, markup: string, error?: string}
	 */
	public function clean_and_validate_markup( $raw_text ) {
		// 1. Quitar posibles bloques de markdown generados por el modelo.
		$cleaned = trim( $raw_text );
		$cleaned = preg_replace( '/^```(?:html)?\s*/i', '', $cleaned );
		$cleaned = preg_replace( '/\s*```$/', '', $cleaned );
		$cleaned = trim( $cleaned );

		// 2. Extraer el segmento que comienza en <!-- wp: y termina en -->
		$start_pos = strpos( $cleaned, '<!-- wp:' );
		if ( false === $start_pos ) {
			return array(
				'valid'  => false,
				'markup' => '',
				'error'  => __( 'La respuesta generada no contiene bloques válidos de Gutenberg (<!-- wp:).', 'gutenberg-ia-builder' ),
			);
		}

		$cleaned = substr( $cleaned, $start_pos );

		// 3. Validación de paridad básica de comentarios de bloque:
		// Cada <!-- wp:name que no sea autocerrado (/) debe tener su <!-- /wp:name -->
		preg_match_all( '/<!--\s*wp:([a-z0-9\/-]+)(?:\s+{[^}]*})?\s*(\/)?-->/i', $cleaned, $open_matches );
		preg_match_all( '/<!--\s*\/wp:([a-z0-9\/-]+)\s*-->/i', $cleaned, $close_matches );

		$total_open = 0;
		if ( ! empty( $open_matches[2] ) ) {
			foreach ( $open_matches[2] as $self_closing ) {
				if ( '/' !== trim( $self_closing ) ) {
					$total_open++;
				}
			}
		}

		$total_close = ! empty( $close_matches[1] ) ? count( $close_matches[1] ) : 0;

		// Si faltan etiquetas de cierre, intentar cerrar el último bloque principal si es un desbalance leve (1)
		if ( $total_open > $total_close && ! empty( $open_matches[1][0] ) && ( $total_open - $total_close === 1 ) ) {
			$root_block = $open_matches[1][0];
			$cleaned   .= "\n<!-- /wp:{$root_block} -->";
		}

		return array(
			'valid'  => true,
			'markup' => $cleaned,
		);
	}

	/**
	 * Analiza una imagen con Gemini Vision para generar alt text y pie de foto.
	 *
	 * @param string $image_url      URL de la imagen.
	 * @param int    $attachment_id  ID del archivo adjunto en medios de WP (opcional).
	 * @param string $context_prompt Instrucción contextual del usuario (opcional).
	 * @return array{success: bool, alt?: string, caption?: string, error?: string}
	 */
	public function analyze_image( $image_url, $attachment_id = 0, $context_prompt = '' ) {
		$api_key = get_option( 'ia_gemini_api_key', '' );
		if ( empty( $api_key ) ) {
			return array(
				'success' => false,
				'error'   => __( 'No se ha configurado la API Key de Gemini.', 'gutenberg-ia-builder' ),
			);
		}

		$image_bytes = '';
		$mime_type   = 'image/jpeg';

		if ( $attachment_id > 0 ) {
			$file_path = get_attached_file( $attachment_id );
			if ( $file_path && file_exists( $file_path ) ) {
				$image_bytes = file_get_contents( $file_path );
				$filetype    = wp_check_filetype( $file_path );
				if ( ! empty( $filetype['type'] ) ) {
					$mime_type = $filetype['type'];
				}
			}
		}

		if ( empty( $image_bytes ) && ! empty( $image_url ) ) {
			$upload_dir = wp_upload_dir();
			if ( 0 === strpos( $image_url, $upload_dir['baseurl'] ) ) {
				$relative_path = substr( $image_url, strlen( $upload_dir['baseurl'] ) );
				$local_path    = $upload_dir['basedir'] . $relative_path;
				if ( file_exists( $local_path ) ) {
					$image_bytes = file_get_contents( $local_path );
					$filetype    = wp_check_filetype( $local_path );
					if ( ! empty( $filetype['type'] ) ) {
						$mime_type = $filetype['type'];
					}
				}
			}

			if ( empty( $image_bytes ) ) {
				$response = wp_remote_get( $image_url, array( 'timeout' => 15, 'sslverify' => false ) );
				if ( ! is_wp_error( $response ) && 200 === wp_remote_retrieve_response_code( $response ) ) {
					$image_bytes = wp_remote_retrieve_body( $response );
					$header_type = wp_remote_retrieve_header( $response, 'content-type' );
					if ( ! empty( $header_type ) ) {
						$mime_type = explode( ';', $header_type )[0];
					}
				}
			}
		}

		if ( empty( $image_bytes ) ) {
			return array(
				'success' => false,
				'error'   => __( 'No se pudieron obtener los datos de la imagen para su análisis.', 'gutenberg-ia-builder' ),
			);
		}

		if ( strlen( $image_bytes ) > 4 * 1024 * 1024 ) {
			return array(
				'success' => false,
				'error'   => __( 'La imagen supera los 4MB de límite para análisis visual.', 'gutenberg-ia-builder' ),
			);
		}

		$base64_data   = base64_encode( $image_bytes );
		$primary_model = get_option( 'ia_gemini_default_model', 'gemini-flash-lite-latest' );

		$prompt_instruction = 'Analiza visualmente esta imagen para una página web en español. Devuelve ÚNICAMENTE un objeto JSON válido con la siguiente estructura exacta: {"alt": "descripción concisa y accesible del contenido de la imagen optimizada para SEO (máximo 125 caracteres)", "caption": "pie de foto breve y relevante para el contexto de la página"}. No agregues markdown ni explicaciones.';
		if ( ! empty( $context_prompt ) ) {
			$prompt_instruction .= ' Contexto adicional de la página: ' . $context_prompt;
		}

		$payload = array(
			'contents'         => array(
				array(
					'role'  => 'user',
					'parts' => array(
						array(
							'inlineData' => array(
								'mimeType' => $mime_type,
								'data'     => $base64_data,
							),
						),
						array(
							'text' => $prompt_instruction,
						),
					),
				),
			),
			'generationConfig' => array(
				'temperature'      => 0.2,
				'maxOutputTokens'  => 1024,
				'responseMimeType' => 'application/json',
			),
		);

		$api_res = $this->call_api( $primary_model, $payload, $api_key );
		if ( ! $api_res['success'] ) {
			$api_res = $this->call_api( 'gemini-3.1-flash-lite', $payload, $api_key );
		}

		if ( ! $api_res['success'] ) {
			return array(
				'success' => false,
				'error'   => $api_res['error'],
			);
		}

		$json_str = trim( $api_res['text'] );
		$json_str = preg_replace( '/^```(?:json)?\s*/i', '', $json_str );
		$json_str = preg_replace( '/\s*```$/', '', $json_str );
		$parsed   = json_decode( $json_str, true );

		if ( is_array( $parsed ) && isset( $parsed['alt'] ) ) {
			return array(
				'success' => true,
				'alt'     => sanitize_text_field( $parsed['alt'] ),
				'caption' => isset( $parsed['caption'] ) ? sanitize_text_field( $parsed['caption'] ) : '',
			);
		}

		return array(
			'success' => false,
			'error'   => __( 'La IA no devolvió un formato JSON válido para la imagen.', 'gutenberg-ia-builder' ),
		);
	}
}
