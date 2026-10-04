/**
 * Gutenberg IA Builder - Integración oficial con el Editor de Bloques.
 *
 * Basado 100% en manipulación de Block Markup nativo como texto plano.
 * Cero conversores JSON AST intermedios.
 * Fase 4: Procesamiento Modular de Páginas Completas y Gemini Vision.
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
		var updateBlockAttributes = blockEditorDispatch.updateBlockAttributes;

		// Estados locales.
		var [ prompt, setPrompt ] = useState( '' );
		var [ isLoading, setIsLoading ] = useState( false );
		var [ statusText, setStatusText ] = useState( '' );
		var [ errorMessage, setErrorMessage ] = useState( '' );
		var [ successMessage, setSuccessMessage ] = useState( '' );
		var [ useThemeStyle, setUseThemeStyle ] = useState( true ); // Herencia de estilo activa por defecto

		// Estado para comparación de bloque individual (Antes / Después) y Deshacer.
		var [ comparison, setComparison ] = useState( {
			active: false,
			targetClientId: null,
			originalMarkup: '',
			generatedMarkup: '',
			currentView: 'generated', // 'generated' o 'original'
		} );

		// Estado para regeneración modular de páginas completas.
		var [ progress, setProgress ] = useState( {
			active: false,
			current: 0,
			total: 0,
			percent: 0,
		} );
		var [ pageUndoStack, setPageUndoStack ] = useState( null );

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
				// Serializar el bloque a texto plano directamente con la API nativa de Gutenberg.
				var currentMarkup = serialize( selectedBlock );
				var targetClientId = selectedBlockClientId;

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
					var newBlocks = parse( newMarkup );

					if ( newBlocks && newBlocks.length > 0 ) {
						replaceBlocks( targetClientId, newBlocks );

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
		 * Ejecuta la generación de un nuevo componente heredando estilo del tema por defecto.
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
				var referenceMarkup = '';
				if ( useThemeStyle ) {
					if ( selectedBlock ) {
						referenceMarkup = serialize( selectedBlock );
					} else if ( allBlocks && allBlocks.length > 0 ) {
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
		 * Transforma la página completa de forma modular (sección por sección) en tiempo real.
		 * Previene desbordamiento de memoria procesando bloques raíz secuencialmente.
		 */
		var handleModularPageTransform = async function() {
			if ( ! allBlocks || allBlocks.length === 0 ) {
				setErrorMessage( 'No hay bloques en la página para transformar.' );
				return;
			}

			if ( ! prompt.trim() ) {
				setErrorMessage( 'Escribe una instrucción general para transformar la página.' );
				return;
			}

			if ( ! window.confirm( '¿Deseas transformar toda la página sección por sección con esta instrucción? Podrás deshacer todos los cambios si no te convence el resultado.' ) ) {
				return;
			}

			clearMessages();
			setIsLoading( true );

			// Guardar snapshot de toda la página para permitir Deshacer global.
			var originalPageMarkup = serialize( allBlocks );
			setPageUndoStack( originalPageMarkup );

			var total = allBlocks.length;
			setProgress( { active: true, current: 0, total: total, percent: 0 } );

			try {
				for ( var i = 0; i < total; i++ ) {
					// Obtener los bloques actualizados en cada paso
					var currentBlocksState = wp.data.select( 'core/block-editor' ).getBlocks();
					if ( ! currentBlocksState[i] ) {
						continue;
					}

					var currentBlock = currentBlocksState[i];
					var currentMarkup = serialize( currentBlock );
					var blockName = currentBlock.name.replace( 'core/', '' );

					setStatusText( 'Sección ' + ( i + 1 ) + ' de ' + total + ' (' + blockName + ')...' );
					setProgress( {
						active: true,
						current: i + 1,
						total: total,
						percent: Math.round( ( ( i + 1 ) / total ) * 100 ),
					} );

					// Omitir bloques triviales o espaciadores
					if ( ! currentMarkup.trim() || 'core/separator' === currentBlock.name || 'core/spacer' === currentBlock.name ) {
						continue;
					}

					var response = await apiFetch( {
						path: '/gutenberg-ia/v1/process',
						method: 'POST',
						headers: { 'X-WP-Nonce': settings.nonce },
						data: {
							prompt: 'Briefing general para toda la página: ' + prompt + '. Adapta esta sección específica manteniendo intactas sus clases CSS y estructura.',
							markup: currentMarkup,
							mode: 'adapt',
						},
					} );

					if ( response && response.success && response.data && response.data.markup ) {
						var parsed = parse( response.data.markup );
						if ( parsed && parsed.length > 0 ) {
							replaceBlocks( currentBlock.clientId, parsed );
						}
					}
				}

				setSuccessMessage( '✓ Página completa transformada exitosamente sección por sección sin sobrecargar la memoria.' );
			} catch ( error ) {
				console.error( 'Error en transformación de página:', error );
				setErrorMessage( 'Error durante la transformación: ' + ( ( error && error.message ) ? error.message : 'Fallo de conexión.' ) );
			} finally {
				setIsLoading( false );
				setProgress( { active: false, current: 0, total: 0, percent: 0 } );
				setStatusText( '' );
			}
		};

		/**
		 * Deshacer la transformación completa de la página.
		 */
		var handleUndoPageTransform = function() {
			if ( ! pageUndoStack ) {
				return;
			}
			var parsed = parse( pageUndoStack );
			if ( parsed ) {
				var currentBlocks = wp.data.select( 'core/block-editor' ).getBlocks();
				var clientIds = currentBlocks.map( function( b ) { return b.clientId; } );
				replaceBlocks( clientIds, parsed );
				setPageUndoStack( null );
				setSuccessMessage( 'Página completa restaurada al estado original.' );
			}
		};

		/**
		 * Optimización multimodal con Gemini Vision para bloques core/image.
		 */
		var handleAnalyzeImage = async function() {
			if ( ! selectedBlock || selectedBlock.name !== 'core/image' ) {
				return;
			}

			var imageUrl = selectedBlock.attributes.url;
			var attachmentId = selectedBlock.attributes.id || 0;

			if ( ! imageUrl ) {
				setErrorMessage( 'El bloque de imagen no tiene ninguna imagen seleccionada o cargada.' );
				return;
			}

			clearMessages();
			setIsLoading( true );
			setStatusText( 'Analizando imagen visualmente con Gemini Vision...' );

			try {
				var response = await apiFetch( {
					path: '/gutenberg-ia/v1/vision',
					method: 'POST',
					headers: { 'X-WP-Nonce': settings.nonce },
					data: {
						image_url: imageUrl,
						attachment_id: attachmentId,
						context_prompt: prompt,
					},
				} );

				if ( response && response.success && response.data ) {
					var updates = {};
					if ( response.data.alt ) {
						updates.alt = response.data.alt;
					}
					if ( response.data.caption ) {
						updates.caption = response.data.caption;
					}

					updateBlockAttributes( selectedBlockClientId, updates );
					setSuccessMessage( '✓ Gemini Vision optimizó la imagen: Alt text y pie de foto aplicados.' );
				} else {
					setErrorMessage( 'No se pudo obtener el análisis visual de la imagen.' );
				}
			} catch ( error ) {
				console.error( 'Error con Gemini Vision:', error );
				setErrorMessage( 'Error al analizar imagen: ' + ( ( error && error.message ) ? error.message : 'Fallo del servidor.' ) );
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
		 * Confirmar cambio de bloque individual.
		 */
		var handleConfirm = function() {
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
		 * Deshacer cambio de bloque individual.
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

		var isImageBlock = ( selectedBlock && selectedBlock.name === 'core/image' );

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

			// Tarjeta Especial: Gemini Vision (Si hay una imagen seleccionada)
			isImageBlock && el(
				'div',
				{ className: 'gib-image-seo-box' },
				el( 'div', { className: 'gib-card-header' }, '🖼 Gemini Vision (SEO de Imagen)' ),
				el(
					'p',
					{ style: { fontSize: '12px', color: '#555', margin: '4px 0 10px 0' } },
					selectedBlock.attributes.alt
						? 'Alt actual: "' + selectedBlock.attributes.alt + '"'
						: 'Esta imagen no tiene texto alternativo (alt).'
				),
				el(
					Button,
					{
						isSecondary: true,
						onClick: handleAnalyzeImage,
						disabled: isLoading,
						style: { width: '100%', justifyContent: 'center' },
					},
					'🔍 Generar Alt SEO y Pie de Foto con IA'
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
						'La IA adaptará el contenido manteniendo intactas sus clases CSS y diseño.'
					)
				) : el(
					'p',
					{ style: { fontSize: '12px', color: '#888', margin: '0' } },
					'Ningún bloque seleccionado en el lienzo. Puedes seleccionar uno para adaptarlo o generar uno nuevo abajo.'
				)
			),

			// Tarjeta: Instrucción y Acciones
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

				// Barra de Progreso Modular (Si está en ejecución)
				progress.active && el(
					'div',
					{ className: 'gib-progress-container' },
					el(
						'div',
						{ className: 'gib-progress-label' },
						el( 'span', null, statusText ),
						el( 'span', null, progress.percent + '%' )
					),
					el(
						'div',
						{ className: 'gib-progress-bar' },
						el( 'div', { className: 'gib-progress-fill', style: { width: progress.percent + '%' } } )
					)
				),

				// Indicador de Carga General
				isLoading && ! progress.active ? el(
					'div',
					{ className: 'gib-loading-box' },
					el( Spinner, null ),
					el( 'p', null, statusText )
				) : el(
					'div',
					{ style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' } },

					// Botón 1: Adaptar bloque seleccionado
					selectedBlock && el(
						Button,
						{
							isPrimary: true,
							onClick: handleAdaptBlock,
							disabled: isLoading,
							style: { justifyContent: 'center' },
						},
						'⚡ Adaptar Bloque Seleccionado'
					),

					// Botón 2: Generar nuevo bloque con ADN del tema
					el(
						Button,
						{
							isSecondary: true,
							onClick: handleGenerateBlock,
							disabled: isLoading,
							style: { justifyContent: 'center' },
						},
						'✨ Generar Nuevo Bloque'
					),

					// Botón 3: Transformar página completa de forma modular
					el(
						Button,
						{
							isSecondary: true,
							className: 'gib-btn-page',
							onClick: handleModularPageTransform,
							disabled: isLoading,
						},
						'🔄 Transformar Página Completa'
					),

					// Botón Deshacer Página Completa (si existe snapshot)
					pageUndoStack && el(
						Button,
						{
							isDestructive: true,
							onClick: handleUndoPageTransform,
							style: { justifyContent: 'center', marginTop: '4px' },
						},
						'✕ Deshacer Transformación de Página'
					)
				)
			)
		);
	}

	/**
	 * Contenedor del Plugin y Registro en la Barra Lateral de Gutenberg.
	 */
	function GibPluginSidebar() {
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
