/**
 * Gutenberg IA Builder - Integración oficial con el Editor de Bloques.
 *
 * Basado 100% en manipulación de Block Markup nativo como texto plano.
 * Cero conversores JSON AST intermedios.
 * Vista compacta estilo Asistente / Chat con Selector de Alcance explícito.
 */

( function() {
	'use strict';

	if ( ! window.wp || ! window.wp.plugins || ! window.wp.editPost || ! window.wp.element ) {
		return;
	}

	var el = wp.element.createElement;
	var useState = wp.element.useState;
	var useEffect = wp.element.useEffect;
	var useRef = wp.element.useRef;
	var Component = wp.element.Component;

	var registerPlugin = wp.plugins.registerPlugin;
	var PluginSidebar = wp.editPost.PluginSidebar;
	var PluginSidebarMoreMenuItem = wp.editPost.PluginSidebarMoreMenuItem;

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
						'Ocurrió un error en la barra lateral. Haz clic para reiniciar el panel.'
					),
					el(
						Button,
						{
							isSecondary: true,
							onClick: () => this.setState( { hasError: false, error: null } ),
							style: { marginTop: '10px' },
						},
						'Reiniciar Panel'
					)
				);
			}
			return this.props.children;
		}
	}

	/**
	 * Componente principal de la barra lateral con formato Chat / Asistente.
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
		var selectBlock = blockEditorDispatch.selectBlock;
		var updateBlockAttributes = blockEditorDispatch.updateBlockAttributes;

		// Estados de interfaz y alcance.
		var [ scope, setScope ] = useState( 'block' ); // 'block' o 'page'
		var [ prompt, setPrompt ] = useState( '' );
		var [ isLoading, setIsLoading ] = useState( false );
		var [ statusText, setStatusText ] = useState( '' );
		var [ errorMessage, setErrorMessage ] = useState( '' );
		var [ successMessage, setSuccessMessage ] = useState( '' );
		var [ useThemeStyle, setUseThemeStyle ] = useState( true );

		// Historial de mensajes tipo Chat.
		var [ messages, setMessages ] = useState( [
			{
				id: 'welcome',
				sender: 'ai',
				text: '¡Hola! Escribe qué deseas modificar en el bloque activo o qué nuevo componente deseas que construya para insertarlo en la página.',
			},
		] );

		// Estado para comparación (Antes / Después) y Deshacer.
		var [ comparison, setComparison ] = useState( {
			active: false,
			targetClientId: null,
			originalMarkup: '',
			generatedMarkup: '',
			currentView: 'generated',
		} );

		// Progreso de transformación modular de páginas completas.
		var [ progress, setProgress ] = useState( {
			active: false,
			current: 0,
			total: 0,
			percent: 0,
		} );
		var [ pageUndoStack, setPageUndoStack ] = useState( null );

		var chatStreamRef = useRef( null );

		// Auto-scroll del chat al agregar mensajes.
		useEffect( function() {
			if ( chatStreamRef.current ) {
				chatStreamRef.current.scrollTop = chatStreamRef.current.scrollHeight;
			}
		}, [ messages, isLoading ] );

		var clearMessages = function() {
			setErrorMessage( '' );
			setSuccessMessage( '' );
		};

		/**
		 * Ejecuta la acción unificada "Regenerar con IA".
		 */
		var handleRegenerateClick = async function() {
			if ( ! prompt.trim() ) {
				setErrorMessage( 'Escribe una instrucción para que la IA sepa qué realizar.' );
				return;
			}

			clearMessages();

			// Registrar mensaje del usuario en el chat.
			var userMsgId = 'user-' + Date.now();
			var userPrompt = prompt;
			setMessages( function( prev ) {
				return prev.concat( [ { id: userMsgId, sender: 'user', text: userPrompt } ] );
			} );
			setPrompt( '' );

			// Si el alcance es 'page', ejecutar transformación modular de página completa.
			if ( 'page' === scope ) {
				await executePageTransformation( userPrompt );
				return;
			}

			// Si el alcance es 'block', determinar si es generación de nuevo bloque o adaptación.
			await executeBlockAction( userPrompt );
		};

		/**
		 * Ejecuta la acción sobre el bloque (generación o adaptación).
		 */
		var executeBlockAction = async function( userPrompt ) {
			setIsLoading( true );

			// Detectar si el usuario pide crear/generar contenido nuevo o si no hay bloque seleccionado.
			var isGeneratingNew = ( ! selectedBlock ) || /^(genera|crea|agrega|inserta|nuevo|nueva|dise\u00f1a)/i.test( userPrompt.trim() );
			var mode = isGeneratingNew ? 'generate' : 'adapt';

			setStatusText( isGeneratingNew ? 'Diseñando bloque compuesto con IA...' : 'Adaptando bloque seleccionado...' );

			try {
				var currentMarkup = ( selectedBlock && 'adapt' === mode ) ? serialize( selectedBlock ) : '';
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
					headers: { 'X-WP-Nonce': settings.nonce },
					data: {
						prompt: userPrompt,
						markup: currentMarkup,
						reference_markup: referenceMarkup,
						mode: mode,
					},
				} );

				if ( response && response.success && response.data && response.data.markup ) {
					var newBlocks = parse( response.data.markup );

					if ( newBlocks && newBlocks.length > 0 ) {
						if ( 'generate' === mode ) {
							// Inserción segura debidamente calculada inmediatamente debajo del bloque activo.
							var selectStore = wp.data.select( 'core/block-editor' );
							var rootClientId = undefined;
							var insertIndex = undefined;

							if ( selectedBlockClientId ) {
								rootClientId = selectStore.getBlockRootClientId( selectedBlockClientId ) || undefined;
								var blockIndex = selectStore.getBlockIndex( selectedBlockClientId );
								insertIndex = ( blockIndex !== -1 ) ? blockIndex + 1 : undefined;
							}

							insertBlocks( newBlocks, insertIndex, rootClientId );

							if ( newBlocks[0] && newBlocks[0].clientId ) {
								selectBlock( newBlocks[0].clientId );
							}

							// Configurar opción de deshacer en el chat.
							setComparison( {
								active: true,
								targetClientId: newBlocks[0].clientId,
								originalMarkup: '',
								generatedMarkup: response.data.markup,
								currentView: 'generated',
								isNewInsertion: true,
							} );

							setMessages( function( prev ) {
								return prev.concat( [ {
									id: 'ai-' + Date.now(),
									sender: 'ai',
									text: '✓ Bloque compuesto creado e insertado inmediatamente debajo del bloque activo.',
									hasActions: true,
								} ] );
							} );
						} else {
							// Modo Adaptar: reemplazar bloque seleccionado.
							var targetClientId = selectedBlockClientId;
							replaceBlocks( targetClientId, newBlocks );

							if ( newBlocks[0] && newBlocks[0].clientId ) {
								selectBlock( newBlocks[0].clientId );
							}

							setComparison( {
								active: true,
								targetClientId: newBlocks[0].clientId,
								originalMarkup: currentMarkup,
								generatedMarkup: response.data.markup,
								currentView: 'generated',
								isNewInsertion: false,
							} );

							setMessages( function( prev ) {
								return prev.concat( [ {
									id: 'ai-' + Date.now(),
									sender: 'ai',
									text: '✓ Bloque adaptado en 2s respetando clases y diseño.',
									hasActions: true,
								} ] );
							} );
						}
					} else {
						setErrorMessage( 'El código generado no pudo ser interpretado como bloques de Gutenberg.' );
					}
				} else {
					setErrorMessage( 'Respuesta inválida del servidor.' );
				}
			} catch ( error ) {
				console.error( 'Error con IA:', error );
				var msg = ( error && error.message ) ? error.message : 'Error al comunicarse con la IA.';
				setErrorMessage( msg );
				setMessages( function( prev ) {
					return prev.concat( [ {
						id: 'ai-error-' + Date.now(),
						sender: 'ai',
						text: '⚠ Error: ' + msg,
					} ] );
				} );
			} finally {
				setIsLoading( false );
				setStatusText( '' );
			}
		};

		/**
		 * Ejecuta la transformación modular sección por sección de toda la página.
		 */
		var executePageTransformation = async function( userPrompt ) {
			if ( ! allBlocks || allBlocks.length === 0 ) {
				setErrorMessage( 'No hay bloques en la página para transformar.' );
				return;
			}

			setIsLoading( true );

			var originalPageMarkup = serialize( allBlocks );
			setPageUndoStack( originalPageMarkup );

			var total = allBlocks.length;
			setProgress( { active: true, current: 0, total: total, percent: 0 } );

			try {
				for ( var i = 0; i < total; i++ ) {
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

					if ( ! currentMarkup.trim() || 'core/separator' === currentBlock.name || 'core/spacer' === currentBlock.name ) {
						continue;
					}

					var response = await apiFetch( {
						path: '/gutenberg-ia/v1/process',
						method: 'POST',
						headers: { 'X-WP-Nonce': settings.nonce },
						data: {
							prompt: 'Briefing general para toda la página: ' + userPrompt + '. Adapta esta sección específica manteniendo intactas sus clases CSS y estructura.',
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

				setMessages( function( prev ) {
					return prev.concat( [ {
						id: 'ai-' + Date.now(),
						sender: 'ai',
						text: '✓ Toda la página ha sido regenerada modularmente sección por sección.',
						isPageTransform: true,
					} ] );
				} );
			} catch ( error ) {
				console.error( 'Error transformando página:', error );
				var msg = ( error && error.message ) ? error.message : 'Fallo en la conexión.';
				setErrorMessage( msg );
			} finally {
				setIsLoading( false );
				setProgress( { active: false, current: 0, total: 0, percent: 0 } );
				setStatusText( '' );
			}
		};

		/**
		 * Deshacer la transformación completa de la página.
		 */
		var handleUndoPage = function() {
			if ( ! pageUndoStack ) return;
			var parsed = parse( pageUndoStack );
			if ( parsed ) {
				var currentBlocks = wp.data.select( 'core/block-editor' ).getBlocks();
				var clientIds = currentBlocks.map( function( b ) { return b.clientId; } );
				replaceBlocks( clientIds, parsed );
				setPageUndoStack( null );
				setMessages( function( prev ) {
					return prev.concat( [ {
						id: 'ai-' + Date.now(),
						sender: 'ai',
						text: 'Página completa restaurada al estado original.',
					} ] );
				} );
			}
		};

		/**
		 * Alternar vista en modo comparativo.
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
		 * Confirmar cambio de bloque.
		 */
		var handleConfirmBlock = function() {
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
			setSuccessMessage( '✓ Cambio consolidado y confirmado.' );
		};

		/**
		 * Deshacer cambio de bloque.
		 */
		var handleUndoBlock = function() {
			if ( comparison.isNewInsertion ) {
				// Si fue un bloque nuevo insertado, eliminarlo
				wp.data.dispatch( 'core/block-editor' ).removeBlock( comparison.targetClientId );
			} else {
				// Si fue una adaptación, restaurar el original
				var parsedBlocks = parse( comparison.originalMarkup );
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
			setSuccessMessage( 'Cambio revertido al estado original.' );
		};

		/**
		 * Optimización multimodal con Gemini Vision para core/image.
		 */
		var handleAnalyzeImage = async function() {
			if ( ! selectedBlock || selectedBlock.name !== 'core/image' ) {
				return;
			}

			var imageUrl = selectedBlock.attributes.url;
			var attachmentId = selectedBlock.attributes.id || 0;

			if ( ! imageUrl ) {
				setErrorMessage( 'El bloque no tiene ninguna imagen cargada.' );
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
					if ( response.data.alt ) updates.alt = response.data.alt;
					if ( response.data.caption ) updates.caption = response.data.caption;

					updateBlockAttributes( selectedBlockClientId, updates );
					setMessages( function( prev ) {
						return prev.concat( [ {
							id: 'ai-' + Date.now(),
							sender: 'ai',
							text: '✓ Gemini Vision optimizó la imagen: Alt text ("' + ( response.data.alt || '' ) + '") y pie de foto aplicados.',
						} ] );
					} );
				}
			} catch ( error ) {
				console.error( 'Error con Gemini Vision:', error );
				setErrorMessage( 'Error al analizar imagen.' );
			} finally {
				setIsLoading( false );
				setStatusText( '' );
			}
		};

		var isImageBlock = ( selectedBlock && selectedBlock.name === 'core/image' );

		// Nombre amigable del bloque activo para la etiqueta de alcance.
		var targetDescription = '';
		if ( 'page' === scope ) {
			targetDescription = 'Toda la página (' + allBlocks.length + ' secciones raíz)';
		} else if ( selectedBlock ) {
			targetDescription = selectedBlock.name + ( selectedBlock.attributes && selectedBlock.attributes.className ? ' (' + selectedBlock.attributes.className + ')' : '' );
		} else {
			targetDescription = 'Sin bloque activo (se creará al inicio o final)';
		}

		return el(
			'div',
			{ className: 'gib-sidebar-container' },

			// 1. Barra superior ultra compacta
			el(
				'div',
				{ className: 'gib-top-bar' },
				el(
					'div',
					{ className: 'gib-top-bar-status' },
					el( 'span', { className: 'gib-dot-status' } ),
					el( 'span', null, settings.defaultModel )
				),
				el(
					'a',
					{
						href: '/wp-admin/options-general.php?page=gutenberg-ia-settings',
						target: '_blank',
						className: 'gib-settings-link',
					},
					'⚙ Ajustes'
				)
			),

			// 2. Selector de Alcance (Bloque vs Toda la Página)
			el(
				'div',
				{ className: 'gib-scope-box' },
				el( 'span', { className: 'gib-scope-label' }, 'Alcance de la Acción:' ),
				el(
					'div',
					{ className: 'gib-scope-selector' },
					el(
						Button,
						{
							isPrimary: 'block' === scope,
							isSecondary: 'block' !== scope,
							className: 'gib-scope-btn',
							onClick: () => setScope( 'block' ),
						},
						'🎯 Bloque'
					),
					el(
						Button,
						{
							isPrimary: 'page' === scope,
							isSecondary: 'page' !== scope,
							className: 'gib-scope-btn',
							onClick: () => setScope( 'page' ),
						},
						'🌐 Toda la Página'
					)
				),
				el(
					'div',
					{ className: 'gib-scope-target', title: targetDescription },
					'Objetivo: ' + targetDescription
				)
			),

			// Notificaciones
			errorMessage && el(
				Notice,
				{
					status: 'error',
					isDismissible: true,
					onDismiss: () => setErrorMessage( '' ),
					style: { marginBottom: '8px' },
				},
				errorMessage
			),

			successMessage && el(
				Notice,
				{
					status: 'success',
					isDismissible: true,
					onDismiss: () => setSuccessMessage( '' ),
					style: { marginBottom: '8px' },
				},
				successMessage
			),

			// Gemini Vision si es imagen
			isImageBlock && el(
				'div',
				{ className: 'gib-image-seo-box' },
				el(
					'div',
					{ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
					el( 'strong', { style: { fontSize: '12px' } }, '🖼 Gemini Vision' ),
					el(
						Button,
						{
							isSecondary: true,
							isSmall: true,
							onClick: handleAnalyzeImage,
							disabled: isLoading,
						},
						'Generar Alt SEO'
					)
				)
			),

			// 3. Historial del Chat (Área con scroll)
			el(
				'div',
				{ className: 'gib-chat-container' },
				el(
					'div',
					{ className: 'gib-chat-stream', ref: chatStreamRef },
					messages.map( function( msg, index ) {
						var isUser = ( 'user' === msg.sender );
						return el(
							'div',
							{
								key: msg.id || index,
								className: isUser ? 'gib-message-user' : 'gib-message-ai',
							},
							msg.text,

							// Acciones del asistente en el último mensaje
							msg.hasActions && comparison.active && el(
								'div',
								{ className: 'gib-chat-actions' },
								! comparison.isNewInsertion && el(
									Button,
									{
										isSecondary: comparison.currentView !== 'original',
										isPrimary: comparison.currentView === 'original',
										isSmall: true,
										className: 'gib-chat-btn-small',
										onClick: () => toggleCompareView( 'original' ),
									},
									'Ver Original'
								),
								! comparison.isNewInsertion && el(
									Button,
									{
										isSecondary: comparison.currentView !== 'generated',
										isPrimary: comparison.currentView === 'generated',
										isSmall: true,
										className: 'gib-chat-btn-small',
										onClick: () => toggleCompareView( 'generated' ),
									},
									'Ver Generado'
								),
								el(
									Button,
									{
										isDestructive: true,
										isSmall: true,
										className: 'gib-chat-btn-small',
										onClick: handleUndoBlock,
									},
									'✕ Deshacer'
								),
								el(
									Button,
									{
										isPrimary: true,
										isSmall: true,
										className: 'gib-chat-btn-small',
										style: { background: '#007017', borderColor: '#007017' },
										onClick: handleConfirmBlock,
									},
									'✓ Confirmar'
								)
							),

							// Acción para deshacer página completa
							msg.isPageTransform && pageUndoStack && el(
								'div',
								{ className: 'gib-chat-actions' },
								el(
									Button,
									{
										isDestructive: true,
										isSmall: true,
										className: 'gib-chat-btn-small',
										onClick: handleUndoPage,
									},
									'✕ Deshacer Transformación de Página'
								)
							)
						);
					} )
				)
			),

			// Barra de Progreso Modular si está activa
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

			// 4. Caja de Entrada de Mensaje / Instrucción
			el(
				'div',
				{ className: 'gib-input-box' },
				el( TextareaControl, {
					value: prompt,
					onChange: setPrompt,
					placeholder: 'block' === scope
						? 'Escribe tu instrucción o pide: "Genera un bloque con titular, 3 columnas..."'
						: 'Briefing general para transformar toda la página...',
					rows: 3,
				} )
			),

			// Toggle de Herencia de Estilo
			el( ToggleControl, {
				label: 'Heredar estilos del tema',
				help: 'Clona clases CSS, bordes y botones de tu plantilla.',
				checked: useThemeStyle,
				onChange: setUseThemeStyle,
			} ),

			// 5. Botón Principal Unificado
			isLoading ? el(
				'div',
				{ style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' } },
				el( Spinner, null ),
				el( 'span', { style: { fontSize: '12px', color: '#555' } }, statusText )
			) : el(
				Button,
				{
					isPrimary: true,
					className: 'gib-btn-regenerate',
					onClick: handleRegenerateClick,
				},
				'⚡ Regenerar con IA'
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

	registerPlugin( 'gutenberg-ia-builder', {
		render: GibPluginSidebar,
		icon: 'superhero',
	} );

} )();
