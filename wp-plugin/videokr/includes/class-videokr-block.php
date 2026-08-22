<?php
/**
 * `videokr/embed` block.
 *
 * @package Videokr
 */

defined( 'ABSPATH' ) || exit;

/**
 * A dynamic block: the editor stores only the chosen id and options, and the
 * markup is produced by the same renderer the shortcode uses, so both paths
 * can never drift apart.
 */
class Videokr_Block {

	/**
	 * Registers the block and its editor script.
	 *
	 * @return void
	 */
	public static function register() {
		if ( ! function_exists( 'register_block_type' ) ) {
			return;
		}
		wp_register_script(
			'videokr-block',
			VIDEOKR_URL . 'assets/block.js',
			array( 'wp-blocks', 'wp-element', 'wp-components', 'wp-block-editor', 'wp-i18n', 'wp-api-fetch', 'wp-server-side-render' ),
			VIDEOKR_VERSION,
			true
		);
		wp_register_style( 'videokr-block-editor', VIDEOKR_URL . 'assets/block.css', array(), VIDEOKR_VERSION );
		wp_localize_script(
			'videokr-block',
			'videokrBlock',
			array(
				'host'      => Videokr_Settings::host(),
				'connected' => Videokr_Settings::is_connected(),
				'settings'  => admin_url( 'admin.php?page=videokr' ),
			)
		);

		register_block_type(
			VIDEOKR_DIR . 'blocks/embed',
			array( 'render_callback' => array( __CLASS__, 'render' ) )
		);
	}

	/**
	 * Renders the block on the front end and in editor previews.
	 *
	 * @param array $attributes Block attributes.
	 * @return string
	 */
	public static function render( $attributes ) {
		$attributes = is_array( $attributes ) ? $attributes : array();
		return Videokr_Embed::render(
			array(
				'id'       => isset( $attributes['videoId'] ) ? $attributes['videoId'] : '',
				'playlist' => isset( $attributes['playlistId'] ) ? $attributes['playlistId'] : '',
				'ratio'    => isset( $attributes['ratio'] ) ? $attributes['ratio'] : '',
				'width'    => isset( $attributes['width'] ) ? $attributes['width'] : '100%',
				'align'    => isset( $attributes['align'] ) ? $attributes['align'] : '',
				'autoplay' => ! empty( $attributes['autoplay'] ),
				'muted'    => ! empty( $attributes['muted'] ),
				'start'    => isset( $attributes['start'] ) ? $attributes['start'] : '',
			)
		);
	}
}
