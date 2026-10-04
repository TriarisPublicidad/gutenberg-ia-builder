/**
 * Gutenberg IA Builder - Integración oficial con el Editor de Bloques.
 *
 * Basado 100% en manipulación de Block Markup nativo como texto plano.
 * Cero conversores JSON AST intermedios.
 * Interfaz con protagonismo en Chat, iconos lineales sobrios e ícono principal SPARKLE.
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

	// --- ÍCONOS LINEALES SOBRIOS ESTILO FONT AWESOME (SVG) ---

	function IconSparkle( props ) {
		var size = ( props && props.size ) ? props.size : 18;
		return el(
			'svg',
			{
				width: size,
				height: size,
				viewBox: '0 0 24 24',
				fill: 'none',
				stroke: 'currentColor',
				strokeWidth: 1.8,
				strokeLinecap: 'round',
				strokeLinejoin: 'round',
				className: 'gib-icon-svg',
			},
			el( 'path', { d: 'M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z' } )
		);
	}

	function IconCopy( props ) {
		var size = ( props && props.size ) ? props.size : 12;
		return el(
			'svg',
			{ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
			el( 'rect', { x: 9, y: 9, width: 13, height: 13, rx: 2, ry: 2 } ),
			el( 'path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' } )
		);
	}

	function IconEdit( props ) {
		var size = ( props && props.size ) ? props.size : 12;
		return el(
			'svg',
			{ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
			el( 'path', { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' } ),
			el( 'path', { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' } )
		);
	}

	function IconUndo( props ) {
		var size = ( props && props.size ) ? props.size : 12;
		return el(
			'svg',
			{ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
			el( 'path', { d: 'M3 7v6h6' } ),
			el( 'path', { d: 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13' } )
		);
	}

	function IconCheck( props ) {
		var size = ( props && props.size ) ? props.size : 12;
		return el(
			'svg',
			{ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
			el( 'polyline', { points: '20 6 9 17 4 12' } )
		);
	}

	function IconEye( props ) {
		var size = ( props && props.size ) ? props.size : 12;
		return el(
			'svg',
			{ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
			el( 'path', { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' } ),
			el( 'circle', { cx: 12, cy: 12, r: 3 } )
		);
	}

	function IconTarget() {
		return el(
			'svg',
			{ width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
			el( 'circle', { cx: 12, cy: 12, r: 10 } ),
			el( 'circle', { cx: 12, cy: 12, r: 4 } )
		);
	}

	function IconGlobe() {
		return el(
			'svg',
			{ width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
			el( 'circle', { cx: 12, cy: 12, r: 10 } ),
			el( 'line', { x1: 2, y1: 12, x2: 22, y2: 12 } ),
			el( 'path', { d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' } )
		);
	}

	function IconSettings() {
		return el(
			'svg',
			{ width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
			el( 'circle', { cx: 12, cy: 12, r: 3 } ),
			el( 'path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' } )
		);
	}

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
		var textareaRef = useRef( null );

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
		 * Copiar texto al portapapeles.
		 */
		var handleCopyText = function( text ) {
			if ( navigator.clipboard && navigator.clipboard.writeText ) {
				navigator.clipboard.writeText( text );
				setSuccessMessage( 'Texto copiado al portapapeles.' );
			}
		};

		/**
		 * Editar mensaje y cargarlo en la caja para reprocesar.
		 */
		var handleEditPrompt = function( text ) {
			setPrompt( text );
			setSuccessMessage( 'Mensaje cargado en la caja de texto. Puedes editarlo y pulsar Regenerar.' );
		};

		/**
		 * Ejecuta la acción unificada "Regenerar con IA".
		 */
		var handleRegenerateClick = async function() {
			if ( ! prompt.trim() ) {
				setErrorMessage( 'Escribe una instrucción para que la IA sepa qué realizar.' );
				return;
			}

			// Si había una comparación pendiente y el usuario continúa el chat, se considera aprobado el cambio
			if ( comparison.active ) {
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
			}

			clearMessages();

			var userMsgId = 'user-' + Date.now();
			var userPrompt = prompt;
			setMessages( function( prev ) {
				var updated = prev.map( function( m ) {
					return m.hasActions ? Object.assign( {}, m, { hasActions: false } ) : m;
				} );
				return updated.concat( [ { id: userMsgId, sender: 'user', text: userPrompt } ] );
			} );
			setPrompt( '' );

			if ( 'page' === scope ) {
				await executePageTransformation( userPrompt );
				return;
			}

			await executeBlockAction( userPrompt );
		};

		/**
		 * Ejecuta la acción sobre el bloque (generación o adaptación).
		 */
		var executeBlockAction = async function( userPrompt ) {
			setIsLoading( true );

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
			setMessages( function( prev ) {
				return prev.map( function( m ) {
					return m.hasActions ? Object.assign( {}, m, { hasActions: false } ) : m;
				} );
			} );
			setSuccessMessage( '✓ Cambio consolidado y confirmado.' );
		};

		var handleUndoBlock = function() {
			if ( comparison.isNewInsertion ) {
				wp.data.dispatch( 'core/block-editor' ).removeBlock( comparison.targetClientId );
			} else {
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
			setMessages( function( prev ) {
				return prev.map( function( m ) {
					return m.hasActions ? Object.assign( {}, m, { hasActions: false } ) : m;
				} );
			} );
			setSuccessMessage( 'Cambio revertido al estado original.' );
		};

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

			// 1. Barra superior ultra compacta con icono de ajustes
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
					el( IconSettings ),
					'Ajustes'
				)
			),

			// 2. Selector de Alcance (Bloque vs Toda la Página) con iconos
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
						el( IconTarget ),
						'Bloque'
					),
					el(
						Button,
						{
							isPrimary: 'page' === scope,
							isSecondary: 'page' !== scope,
							className: 'gib-scope-btn',
							onClick: () => setScope( 'page' ),
						},
						el( IconGlobe ),
						'Toda la Página'
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

			// 3. Historial del Chat (Área con scroll y mayor protagonismo)
			el(
				'div',
				{ className: 'gib-chat-container' },
				el(
					'div',
					{ className: 'gib-chat-stream', ref: chatStreamRef },
					( function() {
						// Encontrar el último mensaje del usuario para habilitar Editar solo en él
						var lastUserIndex = -1;
						for ( var m = messages.length - 1; m >= 0; m-- ) {
							if ( 'user' === messages[m].sender ) {
								lastUserIndex = m;
								break;
							}
						}

						return messages.map( function( msg, index ) {
							var isUser = ( 'user' === msg.sender );
							var isLastUser = ( isUser && index === lastUserIndex );

							if ( isUser ) {
								return el(
									'div',
									{ key: msg.id || index, className: 'gib-message-group gib-message-group-user' },
									el(
										'div',
										{ className: 'gib-message-user' },
										el( 'div', { className: 'gib-msg-content' }, msg.text ),
										el(
											'div',
											{ className: 'gib-msg-bubble-tools' },
											el(
												Button,
												{
													className: 'gib-bubble-tool-btn',
													title: 'Copiar mensaje',
													'aria-label': 'Copiar mensaje',
													onClick: () => handleCopyText( msg.text ),
												},
												el( IconCopy, { size: 12 } )
											),
											isLastUser && el(
												Button,
												{
													className: 'gib-bubble-tool-btn',
													title: 'Editar mensaje y volver a procesar',
													'aria-label': 'Editar mensaje',
													onClick: () => handleEditPrompt( msg.text ),
												},
												el( IconEdit, { size: 12 } )
											)
										)
									)
								);
							}

							// Mensaje de la IA
							return el(
								'div',
								{ key: msg.id || index, className: 'gib-message-group gib-message-group-ai' },
								el(
									'div',
									{ className: 'gib-message-ai' },
									el( 'div', { className: 'gib-msg-content' }, msg.text ),

									// Acciones del asistente (solo iconos compactos con tooltip explicativo)
									msg.hasActions && comparison.active && el(
										'div',
										{ className: 'gib-chat-actions' },
										! comparison.isNewInsertion && el(
											Button,
											{
												className: 'gib-action-icon-btn' + ( comparison.currentView === 'original' ? ' is-active' : '' ),
												title: 'Ver bloque original antes del cambio',
												'aria-label': 'Ver bloque original',
												onClick: () => toggleCompareView( 'original' ),
											},
											el( IconEye, { size: 13 } )
										),
										! comparison.isNewInsertion && el(
											Button,
											{
												className: 'gib-action-icon-btn' + ( comparison.currentView === 'generated' ? ' is-active' : '' ),
												title: 'Ver bloque generado con IA',
												'aria-label': 'Ver bloque generado',
												onClick: () => toggleCompareView( 'generated' ),
											},
											el( IconSparkle, { size: 13 } )
										),
										el(
											Button,
											{
												className: 'gib-action-icon-btn is-destructive',
												title: 'Deshacer y restaurar original',
												'aria-label': 'Deshacer cambios',
												onClick: handleUndoBlock,
											},
											el( IconUndo, { size: 13 } )
										),
										el(
											Button,
											{
												className: 'gib-action-icon-btn is-confirm',
												title: 'Aceptar y confirmar cambio',
												'aria-label': 'Confirmar cambio',
												onClick: handleConfirmBlock,
											},
											el( IconCheck, { size: 13 } )
										)
									),

									// Acción para deshacer página completa
									msg.isPageTransform && pageUndoStack && el(
										'div',
										{ className: 'gib-chat-actions' },
										el(
											Button,
											{
												className: 'gib-action-icon-btn is-destructive',
												title: 'Deshacer transformación de página completa',
												'aria-label': 'Deshacer página',
												onClick: handleUndoPage,
											},
											el( IconUndo, { size: 13 } )
										)
									),

									// Barra de herramientas dentro de la burbuja AI (Copiar)
									el(
										'div',
										{ className: 'gib-msg-bubble-tools' },
										el(
											Button,
											{
												className: 'gib-bubble-tool-btn',
												title: 'Copiar respuesta',
												'aria-label': 'Copiar respuesta',
												onClick: () => handleCopyText( msg.text ),
											},
											el( IconCopy, { size: 12 } )
										)
									)
								)
							);
						} );
					} )()
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

			// 5. Botón Principal Unificado "Regenerar con IA" con icono SPARKLE
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
				el( IconSparkle, { size: 16 } ),
				'Regenerar con IA'
			)
		);
	}

	/**
	 * Contenedor del Plugin y Registro en la Barra Lateral de Gutenberg.
	 * Utiliza el ícono lineal SPARKLE oficial.
	 */
	function GibPluginSidebar() {
		return el(
			wp.element.Fragment,
			null,
			el(
				PluginSidebarMoreMenuItem,
				{
					target: 'gutenberg-ia-sidebar',
					icon: IconSparkle( { size: 20 } ),
				},
				'Gutenberg IA'
			),
			el(
				PluginSidebar,
				{
					name: 'gutenberg-ia-sidebar',
					title: 'Gutenberg IA Builder',
					icon: IconSparkle( { size: 20 } ),
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
		icon: IconSparkle( { size: 20 } ),
	} );

} )();
