<?php
/**
 * Pantalla de configuración y diagnóstico de Gutenberg IA Builder.
 *
 * @package Gutenberg_IA_Builder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Clase que gestiona los ajustes administrativos y la integridad del plugin.
 */
class Gutenberg_IA_Admin_Settings {

	/**
	 * Instancia única (Singleton).
	 *
	 * @var Gutenberg_IA_Admin_Settings|null
	 */
	private static $instance = null;

	/**
	 * Obtener instancia singleton.
	 *
	 * @return Gutenberg_IA_Admin_Settings
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor. Registra los hooks de administración.
	 */
	private function __construct() {
		add_action( 'admin_menu', array( $this, 'register_admin_menu' ) );
		add_action( 'admin_init', array( $this, 'handle_save_settings' ) );
	}

	/**
	 * Registra la página en Ajustes > Gutenberg IA.
	 */
	public function register_admin_menu() {
		add_options_page(
			__( 'Gutenberg IA Builder', 'gutenberg-ia-builder' ),
			__( 'Gutenberg IA', 'gutenberg-ia-builder' ),
			'manage_options',
			'gutenberg-ia-settings',
			array( $this, 'render_settings_page' )
		);
	}

	/**
	 * Procesa el guardado de ajustes de forma segura.
	 */
	public function handle_save_settings() {
		if ( ! isset( $_POST['ia_gemini_save_settings'] ) ) {
			return;
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'No tienes permisos suficientes para realizar esta acción.', 'gutenberg-ia-builder' ) );
		}

		check_admin_referer( 'ia_gemini_settings_action', 'ia_gemini_settings_nonce' );

		// Procesar clave de API de Gemini.
		if ( isset( $_POST['ia_gemini_api_key'] ) ) {
			$raw_key = sanitize_text_field( wp_unslash( $_POST['ia_gemini_api_key'] ) );
			// Solo actualizar si no es una cadena de puntos o vacía cuando ya existe una clave.
			if ( ! empty( $raw_key ) && false === strpos( $raw_key, '••••' ) ) {
				update_option( 'ia_gemini_api_key', $raw_key, 'no' );
			}
		}

		// Opción para borrar la clave si el usuario lo marcó.
		if ( ! empty( $_POST['ia_gemini_delete_key'] ) ) {
			delete_option( 'ia_gemini_api_key' );
		}

		// Procesar Modelo Predeterminado.
		$allowed_models = array(
			'gemini-flash-lite-latest',
			'gemini-3.1-flash-lite',
			'gemini-3.8-flash',
		);
		if ( isset( $_POST['ia_gemini_default_model'] ) ) {
			$model = sanitize_text_field( wp_unslash( $_POST['ia_gemini_default_model'] ) );
			if ( in_array( $model, $allowed_models, true ) ) {
				update_option( 'ia_gemini_default_model', $model, 'no' );
			}
		}

		// Procesar Tono / Voz de Marca.
		if ( isset( $_POST['ia_gemini_brand_voice'] ) ) {
			$voice = sanitize_textarea_field( wp_unslash( $_POST['ia_gemini_brand_voice'] ) );
			update_option( 'ia_gemini_brand_voice', $voice, 'no' );
		}

		// Procesar Temperatura (Creatividad).
		if ( isset( $_POST['ia_gemini_temperature'] ) ) {
			$temp = floatval( $_POST['ia_gemini_temperature'] );
			if ( $temp >= 0.0 && $temp <= 1.0 ) {
				update_option( 'ia_gemini_temperature', strval( $temp ), 'no' );
			}
		}

		// Acción para sincronizar/actualizar hash si el administrador lo solicitó explícitamente.
		if ( ! empty( $_POST['ia_gemini_sync_hash'] ) ) {
			if ( file_exists( GIB_RULES_FILE ) ) {
				$new_hash = md5_file( GIB_RULES_FILE );
				if ( $new_hash ) {
					update_option( 'ia_gemini_rules_hash', $new_hash, 'no' );
				}
			}
		}

		wp_safe_redirect(
			add_query_arg(
				array(
					'page'             => 'gutenberg-ia-settings',
					'settings-updated' => 'true',
				),
				admin_url( 'options-general.php' )
			)
		);
		exit;
	}

	/**
	 * Obtiene el estado de integridad del manifiesto.
	 *
	 * @return array
	 */
	public function get_integrity_status() {
		$saved_hash   = get_option( 'ia_gemini_rules_hash', '' );
		$current_hash = file_exists( GIB_RULES_FILE ) ? md5_file( GIB_RULES_FILE ) : '';

		$is_valid = ( ! empty( $saved_hash ) && ! empty( $current_hash ) && $saved_hash === $current_hash );

		return array(
			'is_valid'     => $is_valid,
			'saved_hash'   => $saved_hash,
			'current_hash' => $current_hash,
			'file_exists'  => file_exists( GIB_RULES_FILE ),
		);
	}

	/**
	 * Renderiza la interfaz de usuario de ajustes.
	 */
	public function render_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$integrity      = $this->get_integrity_status();
		$api_key        = get_option( 'ia_gemini_api_key', '' );
		$has_key        = ! empty( $api_key );
		$default_model  = get_option( 'ia_gemini_default_model', 'gemini-flash-lite-latest' );
		$brand_voice    = get_option( 'ia_gemini_brand_voice', '' );
		$temperature    = get_option( 'ia_gemini_temperature', '0.7' );

		?>
		<div class="wrap" style="max-width: 900px;">
			<h1><?php esc_html_e( 'Gutenberg IA Builder - Configuración y Estado', 'gutenberg-ia-builder' ); ?></h1>
			<p class="description">
				<?php esc_html_e( 'Configura la integración directa de Google Gemini con el editor de bloques de Gutenberg. Todo el procesamiento opera sobre texto plano (Block Markup) nativo.', 'gutenberg-ia-builder' ); ?>
			</p>

			<?php if ( isset( $_GET['settings-updated'] ) && 'true' === $_GET['settings-updated'] ) : ?>
				<div class="notice notice-success is-dismissible">
					<p><strong><?php esc_html_e( 'Ajustes guardados correctamente.', 'gutenberg-ia-builder' ); ?></strong></p>
				</div>
			<?php endif; ?>

			<!-- Tarjeta de Estado e Integridad Criptográfica -->
			<div class="card" style="margin-top: 20px; padding: 20px; border-left: 4px solid <?php echo $integrity['is_valid'] ? '#46b450' : '#dc3232'; ?>;">
				<h2 style="margin-top: 0; display: flex; align-items: center; gap: 10px;">
					<?php if ( $integrity['is_valid'] ) : ?>
						<span style="color: #46b450; font-size: 24px;">✓</span>
						<span><?php esc_html_e( 'Integridad del Sistema: Correcta', 'gutenberg-ia-builder' ); ?></span>
					<?php else : ?>
						<span style="color: #dc3232; font-size: 24px;">⚠</span>
						<span><?php esc_html_e( 'Alerta de Integridad: Manifiesto No Coincide o No Inicializado', 'gutenberg-ia-builder' ); ?></span>
					<?php endif; ?>
				</h2>

				<p>
					<?php esc_html_e( 'El plugin valida que el archivo de reglas normativas (INSTRUCCIONES_IA.md) se mantenga matemáticamente idéntico al autorizado durante la activación.', 'gutenberg-ia-builder' ); ?>
				</p>

				<table class="widefat striped" style="margin-top: 10px; max-width: 700px;">
					<tbody>
						<tr>
							<td style="width: 220px;"><strong><?php esc_html_e( 'Hash MD5 de Activación:', 'gutenberg-ia-builder' ); ?></strong></td>
							<td><code><?php echo esc_html( $integrity['saved_hash'] ? $integrity['saved_hash'] : __( '(No registrado)', 'gutenberg-ia-builder' ) ); ?></code></td>
						</tr>
						<tr>
							<td><strong><?php esc_html_e( 'Hash MD5 en Disco:', 'gutenberg-ia-builder' ); ?></strong></td>
							<td><code><?php echo esc_html( $integrity['current_hash'] ? $integrity['current_hash'] : __( '(Archivo no encontrado)', 'gutenberg-ia-builder' ) ); ?></code></td>
						</tr>
						<tr>
							<td><strong><?php esc_html_e( 'Estado de Peticiones IA:', 'gutenberg-ia-builder' ); ?></strong></td>
							<td>
								<?php if ( $integrity['is_valid'] ) : ?>
									<span style="background: #e7f7ed; color: #1e7e34; padding: 3px 8px; border-radius: 4px; font-weight: 600;">
										<?php esc_html_e( 'Habilitadas (Seguro)', 'gutenberg-ia-builder' ); ?>
									</span>
								<?php else : ?>
									<span style="background: #fdf2f2; color: #b71c1c; padding: 3px 8px; border-radius: 4px; font-weight: 600;">
										<?php esc_html_e( 'Bloqueadas por Seguridad', 'gutenberg-ia-builder' ); ?>
									</span>
								<?php endif; ?>
							</td>
						</tr>
					</tbody>
				</table>
			</div>

			<!-- Formulario de Configuración -->
			<form method="post" action="" style="margin-top: 25px;">
				<?php wp_nonce_field( 'ia_gemini_settings_action', 'ia_gemini_settings_nonce' ); ?>

				<table class="form-table" role="presentation">
					<tbody>
						<!-- API Key -->
						<tr>
							<th scope="row">
								<label for="ia_gemini_api_key"><?php esc_html_e( 'API Key de Gemini', 'gutenberg-ia-builder' ); ?></label>
							</th>
							<td>
								<?php if ( $has_key ) : ?>
									<div style="margin-bottom: 8px;">
										<span style="background: #e7f7ed; color: #1e7e34; padding: 4px 10px; border-radius: 4px; font-size: 13px; font-weight: 600;">
											<?php esc_html_e( '✓ Clave configurada en la base de datos (••••••••••••' . esc_html( substr( $api_key, -4 ) ) . ')', 'gutenberg-ia-builder' ); ?>
										</span>
									</div>
								<?php endif; ?>

								<input
									name="ia_gemini_api_key"
									type="password"
									id="ia_gemini_api_key"
									value=""
									class="regular-text"
									placeholder="<?php echo $has_key ? esc_attr__( 'Ingresa una nueva clave solo para reemplazarla', 'gutenberg-ia-builder' ) : 'AIzaSy...'; ?>"
									autocomplete="new-password"
								/>
								<p class="description">
									<?php esc_html_e( 'Clave secreta obtenida de Google AI Studio. Se almacena protegida en wp_options y nunca se expone al navegador.', 'gutenberg-ia-builder' ); ?>
								</p>

								<?php if ( $has_key ) : ?>
									<label style="margin-top: 6px; display: inline-block;">
										<input type="checkbox" name="ia_gemini_delete_key" value="1" />
										<span style="color: #b71c1c;"><?php esc_html_e( 'Eliminar la API Key almacenada', 'gutenberg-ia-builder' ); ?></span>
									</label>
								<?php endif; ?>
							</td>
						</tr>

						<!-- Modelo Predeterminado -->
						<tr>
							<th scope="row">
								<label for="ia_gemini_default_model"><?php esc_html_e( 'Modelo de IA Predeterminado', 'gutenberg-ia-builder' ); ?></label>
							</th>
							<td>
								<select name="ia_gemini_default_model" id="ia_gemini_default_model">
									<option value="gemini-flash-lite-latest" <?php selected( $default_model, 'gemini-flash-lite-latest' ); ?>>
										<?php esc_html_e( 'gemini-flash-lite-latest (Recomendado: 2-3s, ultra veloz)', 'gutenberg-ia-builder' ); ?>
									</option>
									<option value="gemini-3.1-flash-lite" <?php selected( $default_model, 'gemini-3.1-flash-lite' ); ?>>
										<?php esc_html_e( 'gemini-3.1-flash-lite (Modelo de respaldo)', 'gutenberg-ia-builder' ); ?>
									</option>
									<option value="gemini-3.8-flash" <?php selected( $default_model, 'gemini-3.8-flash' ); ?>>
										<?php esc_html_e( 'gemini-3.8-flash (Alta capacidad analítica y creativa)', 'gutenberg-ia-builder' ); ?>
									</option>
								</select>
								<p class="description">
									<?php esc_html_e( 'El cliente incluye fallback automático: si el modelo seleccionado se satura, reintenta automáticamente con el modelo secundario.', 'gutenberg-ia-builder' ); ?>
								</p>
							</td>
						</tr>

						<!-- Tono y Voz de Marca -->
						<tr>
							<th scope="row">
								<label for="ia_gemini_brand_voice"><?php esc_html_e( 'Voz y Tono de Marca (Sitio)', 'gutenberg-ia-builder' ); ?></label>
							</th>
							<td>
								<textarea
									name="ia_gemini_brand_voice"
									id="ia_gemini_brand_voice"
									rows="3"
									class="large-text"
									placeholder="<?php esc_attr_e( 'Ejemplo: Profesional, innovador y directo. Enfocado en ahorro de tiempo y soluciones B2B para ejecutivos.', 'gutenberg-ia-builder' ); ?>"
								><?php echo esc_textarea( $brand_voice ); ?></textarea>
								<p class="description">
									<?php esc_html_e( 'Este tono se inyecta automáticamente en las solicitudes para que todas las generaciones de texto guarden la personalidad de tu negocio sin tener que repetirlo en cada prompt.', 'gutenberg-ia-builder' ); ?>
								</p>
							</td>
						</tr>

						<!-- Temperatura / Creatividad -->
						<tr>
							<th scope="row">
								<label for="ia_gemini_temperature"><?php esc_html_e( 'Creatividad (Temperatura)', 'gutenberg-ia-builder' ); ?></label>
							</th>
							<td>
								<select name="ia_gemini_temperature" id="ia_gemini_temperature">
									<option value="0.2" <?php selected( $temperature, '0.2' ); ?>>
										<?php esc_html_e( '0.2 - Muy Preciso / Conservador (Fiel al texto original)', 'gutenberg-ia-builder' ); ?>
									</option>
									<option value="0.5" <?php selected( $temperature, '0.5' ); ?>>
										<?php esc_html_e( '0.5 - Moderado', 'gutenberg-ia-builder' ); ?>
									</option>
									<option value="0.7" <?php selected( $temperature, '0.7' ); ?>>
										<?php esc_html_e( '0.7 - Equilibrado (Recomendado para Copywriting y Bloques)', 'gutenberg-ia-builder' ); ?>
									</option>
									<option value="1.0" <?php selected( $temperature, '1.0' ); ?>>
										<?php esc_html_e( '1.0 - Muy Creativo / Imaginativo', 'gutenberg-ia-builder' ); ?>
									</option>
								</select>
							</td>
						</tr>

						<!-- Botón de Sincronización de Hash -->
						<?php if ( ! $integrity['is_valid'] ) : ?>
							<tr>
								<th scope="row">
									<?php esc_html_e( 'Recalcular Integridad', 'gutenberg-ia-builder' ); ?>
								</th>
								<td>
									<label>
										<input type="checkbox" name="ia_gemini_sync_hash" value="1" />
										<strong><?php esc_html_e( 'Autorizo actualizar el hash MD5 con el archivo actual en disco', 'gutenberg-ia-builder' ); ?></strong>
									</label>
									<p class="description">
										<?php esc_html_e( 'Marca esta casilla únicamente si realizaste modificaciones autorizadas al archivo INSTRUCCIONES_IA.md.', 'gutenberg-ia-builder' ); ?>
									</p>
								</td>
							</tr>
						<?php endif; ?>
					</tbody>
				</table>

				<p class="submit">
					<input
						type="submit"
						name="ia_gemini_save_settings"
						id="submit"
						class="button button-primary"
						value="<?php esc_attr_e( 'Guardar Configuración', 'gutenberg-ia-builder' ); ?>"
					/>
				</p>
			</form>
		</div>
		<?php
	}
}
