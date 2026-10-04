/**
 * Gutenberg IA Builder - Integración oficial con el Editor de Bloques.
 *
 * Basado 100% en manipulación de Block Markup nativo como texto plano.
 * Cero conversores JSON AST intermedios.
 */

( function() {
	'use strict';

	// Asegurar que las dependencias de WordPress estén cargadas.
	if ( ! window.wp || ! window.wp.plugins || ! window.wp.editPost || ! window.wp.element ) {
		return;
	}

	var el = wp.element.createElement;
	var useState = wp.element.useState;
	var useEffect = wp.element.useEffect;
	var useCallback = wp.element.useCallback;
	var Component = wp.element.Component;

	var registerPlugin = wp.plugins.registerPlugin;
	var PluginSidebar = wp.editPost.PluginSidebar;
	var PluginSidebarMoreMenuItem = wp.editPost.PluginSidebarMoreMenuItem;

	var PanelBody = wp.components.PanelBody;
	var Button = wp.components.Button;
	var TextareaControl = wp.components.TextareaControl;
	var Spinner = wp.components.Spinner;
	var Notice = wp.components.Notice;
	var ToggleControl = wp.components.ToggleControl;

	var useSelect = wp.data.useSelect;
	var useDispatch = wp.data.useDispatch;
	var serialize = wp.blocks.serialize;
	var parse = wp.blocks.parse;
	var apiFetch = wp.apiFetch;

	// Configuración inyectada desde PHP.
	var settings = window.gutenbergIaSettings || {
		restUrl: '/wp-json/gutenberg-ia/v1/',
		nonce: '',
		defaultModel: 'gemini-flash-lite-latest',
		isIntegrityValid: true,
		hasApiKey: true,
	};

	/**
	 * Error Boundary para prevenir cualquier colapso de la interfaz de Gutenberg.
	 */
	class GibErrorBoundary extends Component {
		constructor( props ) {
			super( props );
			this.state = { hasError: false, error: null };
		}

		static getDerivedStateFromError( error ) {
			return { hasError: true, error: error };
		}

		componentDidCatch( error, errorInfo ) {
			console.error( 'Gutenberg IA Builder Error:', error, errorInfo );
		}

		render() {
			if ( this.state.hasError ) {
				return el(
					'div',
					{ className: 'gib-sidebar-container' },
					el(
						Notice,
						{ status: 'error', isDismissible: false },
						'Ocurrió un error en la barra lateral de IA. Haz clic para reiniciar el panel.'
					),
					el(
						Button,
						{
							isSecondary: true,
							onClick: () => this.setState( { hasError: false, error: null } ),
							style: { marginTop: '10px' },
						},
						'Reiniciar Barra Lateral'
					)
				);
			}
			return this.props.children;
		}
	}

	/**
	 * Componente principal de la barra lateral.
	 */
	function GibSidebarContent() {
		// Selectores de Gutenberg.
		var selectedBlock = useSelect( function( select ) {
			return select( 'core/block-editor' ).getSelectedBlock();
		}, [] );

		var selectedBlockClientId = useSelect( function( select ) {
			return select( 'core/block-editor' ).getSelectedBlockClientId();
		}, [] );

		var allBlocks = useSelect( function( select ) {
			return select( 'core/block-editor' ).getBlocks();
		}, [] );

		// Acciones de Gutenberg.
		var blockEditorDispatch = useDispatch( 'core/block-editor' );
		var replaceBlocks = blockEditorDispatch.replaceBlocks;
		var insertBlocks = blockEditorDispatch.insertBlocks;

		// Estados locales.
		var [ prompt, setPrompt ] = useState( '' );
		var [ isLoading, setIsLoading ] = useState( false );
		var [ statusText, setStatusText ] = useState( '' );
		var [ errorMessage, setErrorMessage ] = useState( '' );
		var [ successMessage, setSuccessMessage ] = useState( '' );
		var [ useThemeStyle, setUseThemeStyle ] = useState( true ); // Herencia de estilo activa por defecto

		// Estado para comparación (Antes / Después) y Deshacer.
		var [ comparison, setComparison ] = useState( {
			active: false,
			targetClientId: null,
			originalMarkup: '',
			generatedMarkup: '',
			currentView: 'generated', // 'generated' o 'original'
		} );

		// Limpiar mensajes tras interacción.
		var clearMessages = function() {
			setErrorMessage( '' );
			setSuccessMessage( '' );
		};

		/**
		 * Ejecuta la adaptación del bloque seleccionado.
		 */
		var handleAdaptBlock = async function() {
			if ( ! selectedBlock ) {
				setErrorMessage( 'Selecciona primero un bloque en el editor para adaptarlo.' );
				return;
			}

			if ( ! prompt.trim() ) {
				setErrorMessage( 'Escribe una instrucción para que la IA sepa qué adaptar.' );
				return;
			}

			clearMessages();
			setIsLoading( true );
			setStatusText( 'Conectando con Gemini...' );

			try {
				// 1. Serializar el bloque a texto plano directamente con la API nativa de Gutenberg.
				var currentMarkup = serialize( selectedBlock );
				var targetClientId = selectedBlockClientId;

				// 2. Enviar petición al endpoint REST autenticado.
				var response = await apiFetch( {
					path: '/gutenberg-ia/v1/process',
					method: 'POST',
					headers: {
						'X-WP-Nonce': settings.nonce,
					},
					data: {
						prompt: prompt,
						markup: currentMarkup,
						mode: 'adapt',
					},
				} );

				if ( response && response.success && response.data && response.data.markup ) {
					var newMarkup = response.data.markup;

					// 3. Parsear el nuevo Block Markup nativo.
					var newBlocks = parse( newMarkup );

					if ( newBlocks && newBlocks.length > 0 ) {
						// 4. Reemplazar el bloque en el lienzo de Gutenberg.
						replaceBlocks( targetClientId, newBlocks );

						// 5. Configurar modo comparativo y opción de deshacer.
						setComparison( {
							active: true,
							targetClientId: newBlocks[0].clientId,
							originalMarkup: currentMarkup,
							generatedMarkup: newMarkup,
							currentView: 'generated',
						} );

						setSuccessMessage( '✓ Bloque adaptado en 2-3s. Revisa los cambios abajo.' );
						setPrompt( '' );
					} else {
						setErrorMessage( 'El código generado no pudo ser interpretado como bloques de WordPress.' );
					}
				} else {
					setErrorMessage( 'Respuesta inválida del servidor.' );
				}
			} catch ( error ) {
				console.error( 'Error adaptando bloque:', error );
				var msg = ( error && error.message ) ? error.message : 'Error al comunicarse con la IA.';
				setErrorMessage( msg );
			} finally {
				setIsLoading( false );
				setStatusText( '' );
			}
		};

		/**
		 * Ejecuta la generación de un nuevo componente heredando estilo del tema.
		 */
		var handleGenerateBlock = async function() {
			if ( ! prompt.trim() ) {
				setErrorMessage( 'Escribe qué tipo de sección o bloque deseas generar.' );
				return;
			}

			clearMessages();
			setIsLoading( true );
			setStatusText( 'Diseñando nuevo bloque con el estilo de tu tema...' );

			try {
				// Buscar bloque de referencia para herencia visual (Theme Style Inheritance).
				var referenceMarkup = '';
				if ( useThemeStyle ) {
					if ( selectedBlock ) {
						referenceMarkup = serialize( selectedBlock );
					} else if ( allBlocks && allBlocks.length > 0 ) {
						// Tomar el primer bloque del tema disponible como plantilla de referencia.
						referenceMarkup = serialize( allBlocks[0] );
					}
				}

				var response = await apiFetch( {
					path: '/gutenberg-ia/v1/process',
					method: 'POST',
					headers: {
						'X-WP-Nonce': settings.nonce,
					},
					data: {
						prompt: prompt,
						reference_markup: referenceMarkup,
						mode: 'generate',
					},
				} );

				if ( response && response.success && response.data && response.data.markup ) {
					var newBlocks = parse( response.data.markup );

					if ( newBlocks && newBlocks.length > 0 ) {
						if ( selectedBlockClientId ) {
							insertBlocks( newBlocks, undefined, selectedBlockClientId );
						} else {
							insertBlocks( newBlocks );
						}

						setSuccessMessage( '✓ Nuevo bloque generado e insertado con la estética de tu tema.' );
						setPrompt( '' );
					} else {
						setErrorMessage( 'No se pudo generar un bloque válido.' );
					}
				} else {
					setErrorMessage( 'Respuesta inválida al generar bloque.' );
				}
			} catch ( error ) {
				console.error( 'Error generando bloque:', error );
				var msg = ( error && error.message ) ? error.message : 'Error al generar nuevo contenido.';
				setErrorMessage( msg );
			} finally {
				setIsLoading( false );
				setStatusText( '' );
			}
		};

		/**
		 * Alternar vista en modo comparativo (Ver Original vs Ver Generado).
		 */
		var toggleCompareView = function( view ) {
			if ( ! comparison.active || comparison.currentView === view ) {
				return;
			}

			var markupToApply = ( 'original' === view ) ? comparison.originalMarkup : comparison.generatedMarkup;
			var parsedBlocks = parse( markupToApply );

			if ( parsedBlocks && parsedBlocks.length > 0 ) {
				replaceBlocks( comparison.targetClientId, parsedBlocks );
				setComparison( Object.assign( {}, comparison, {
					targetClientId: parsedBlocks[0].clientId,
					currentView: view,
				} ) );
			}
		};

		/**
		 * Confirmar cambio definitivamente.
		 */
		var handleConfirm = function() {
			// Si estaba viendo el original, restaurar el generado antes de consolidar.
			if ( 'original' === comparison.currentView ) {
				var parsedBlocks = parse( comparison.generatedMarkup );
				if ( parsedBlocks && parsedBlocks.length > 0 ) {
					replaceBlocks( comparison.targetClientId, parsedBlocks );
				}
			}

			setComparison( {
				active: false,
				targetClientId: null,
				originalMarkup: '',
				generatedMarkup: '',
				currentView: 'generated',
			} );
			setSuccessMessage( '✓ Cambio consolidado y confirmado exitosamente.' );
		};

		/**
		 * Deshacer y restaurar el estado original.
		 */
		var handleUndo = function() {
			var parsedBlocks = parse( comparison.originalMarkup );
			if ( parsedBlocks && parsedBlocks.length > 0 ) {
				replaceBlocks( comparison.targetClientId, parsedBlocks );
			}

			setComparison( {
				active: false,
				targetClientId: null,
				originalMarkup: '',
				generatedMarkup: '',
				currentView: 'generated',
			} );
			setSuccessMessage( 'Cambio revertido al estado original.' );
		};

		return el(
			'div',
			{ className: 'gib-sidebar-container' },

			// Encabezado con estado
			el(
				'div',
				{ style: { marginBottom: '14px' } },
				el(
					'span',
					{ className: 'gib-badge-status gib-badge-success' },
					'● Motor Gemini Listo (' + settings.defaultModel + ')'
				)
			),

			// Notificaciones
			errorMessage && el(
				Notice,
				{
					status: 'error',
					isDismissible: true,
					onDismiss: () => setErrorMessage( '' ),
					style: { marginBottom: '14px' },
				},
				errorMessage
			),

			successMessage && el(
				Notice,
				{
					status: 'success',
					isDismissible: true,
					onDismiss: () => setSuccessMessage( '' ),
					style: { marginBottom: '14px' },
				},
				successMessage
			),

			// Barra de Modo Comparativo (Antes / Después)
			comparison.active && el(
				'div',
				{ className: 'gib-compare-container' },
				el( 'div', { className: 'gib-card-header' }, 'Comparar Versión' ),
				el(
					'div',
					{ className: 'gib-compare-buttons' },
					el(
						Button,
						{
							isSecondary: comparison.currentView !== 'original',
							isPrimary: comparison.currentView === 'original',
							className: 'gib-compare-btn',
							onClick: () => toggleCompareView( 'original' ),
						},
						'Ver Original'
					),
					el(
						Button,
						{
							isSecondary: comparison.currentView !== 'generated',
							isPrimary: comparison.currentView === 'generated',
							className: 'gib-compare-btn',
							onClick: () => toggleCompareView( 'generated' ),
						},
						'Ver Generado'
					)
				),
				el(
					'div',
					{ className: 'gib-actions-row' },
					el(
						Button,
						{
							className: 'gib-btn-confirm',
							onClick: handleConfirm,
						},
						'✓ Confirmar'
					),
					el(
						Button,
						{
							isDestructive: true,
							className: 'gib-btn-undo',
							onClick: handleUndo,
						},
						'✕ Deshacer'
					)
				)
			),

			// Tarjeta: Información del Bloque Seleccionado
			el(
				'div',
				{ className: 'gib-card' },
				el(
					'div',
					{ className: 'gib-card-header' },
					'Bloque Activo',
					selectedBlock && el(
						'span',
						{ style: { fontSize: '11px', color: '#007017' } },
						'Seleccionado'
					)
				),
				selectedBlock ? el(
					'div',
					null,
					el( 'div', { className: 'gib-block-preview' }, selectedBlock.name + ( selectedBlock.attributes && selectedBlock.attributes.className ? ' (' + selectedBlock.attributes.className + ')' : '' ) ),
					el(
						'p',
						{ style: { fontSize: '12px', color: '#666', margin: '4px 0 10px 0' } },
						'La IA reescribirá el contenido manteniendo intactas sus clases CSS y diseño.'
					)
				) : el(
					'p',
					{ style: { fontSize: '12px', color: '#888', margin: '0' } },
					'Ningún bloque seleccionado en el lienzo. Puedes seleccionar uno para adaptarlo o generar uno nuevo abajo.'
				)
			),

			// Tarjeta: Instrucción y Acción
			el(
				'div',
				{ className: 'gib-card' },
				el( 'div', { className: 'gib-card-header' }, 'Instrucción para la IA' ),
				el( TextareaControl, {
					label: '¿Qué deseas hacer?',
					value: prompt,
					onChange: setPrompt,
					placeholder: selectedBlock
						? 'Ejemplo: Adapta este titular y texto para una clínica de implantes dentales.'
						: 'Ejemplo: Crea una sección de precios con 3 planes y botones de llamada a la acción.',
					rows: 4,
				} ),

				// Toggle de Herencia de Estilo del Tema
				el( ToggleControl, {
					label: 'Herencia de Estilo del Tema',
					help: 'Clona automáticamente las clases CSS, bordes y botones de tu plantilla.',
					checked: useThemeStyle,
					onChange: setUseThemeStyle,
				} ),

				// Indicador de Carga
				isLoading ? el(
					'div',
					{ className: 'gib-loading-box' },
					el( Spinner, null ),
					el( 'p', null, statusText )
				) : el(
					'div',
					{ style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' } },
					selectedBlock && el(
						Button,
						{
							isPrimary: true,
							onClick: handleAdaptBlock,
							style: { justifyContent: 'center' },
						},
						'⚡ Adaptar Bloque Seleccionado'
					),
					el(
						Button,
						{
							isSecondary: true,
							onClick: handleGenerateBlock,
							style: { justifyContent: 'center' },
						},
						'✨ Generar Nuevo Bloque'
					)
				)
			)
		);
	}

	/**
	 * Contenedor del Plugin y Registro en la Barra Lateral de Gutenberg.
	 */
	function GibPluginSidebar() {
		// Ícono SVG de Sparkle / IA
		var aiIcon = el(
			'svg',
			{
				width: 20,
				height: 20,
				viewBox: '0 0 24 24',
				fill: 'none',
				stroke: 'currentColor',
				strokeWidth: 2,
				strokeLinecap: 'round',
				strokeLinejoin: 'round',
			},
			el( 'path', { d: 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83' } )
		);

		return el(
			wp.element.Fragment,
			null,
			el(
				PluginSidebarMoreMenuItem,
				{
					target: 'gutenberg-ia-sidebar',
					icon: aiIcon,
				},
				'Gutenberg IA'
			),
			el(
				PluginSidebar,
				{
					name: 'gutenberg-ia-sidebar',
					title: 'Gutenberg IA Builder',
					icon: aiIcon,
				},
				el(
					GibErrorBoundary,
					null,
					el( GibSidebarContent, null )
				)
			)
		);
	}

	// Registrar plugin oficial en el editor de bloques.
	registerPlugin( 'gutenberg-ia-builder', {
		render: GibPluginSidebar,
		icon: 'superhero',
	} );

} )();
