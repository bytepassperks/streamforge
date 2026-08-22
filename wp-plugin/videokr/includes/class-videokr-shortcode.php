<?php
/**
 * `[videokr]` shortcode.
 *
 * @package Videokr
 */

defined( 'ABSPATH' ) || exit;

/**
 * Usage:
 *
 *   [videokr id="vid_abc123"]
 *   [videokr playlist="launch-week" ratio="16/9"]
 *   [videokr id="my-demo" width="640" autoplay="true" muted="true" start="30"]
 */
class Videokr_Shortcode {

	/**
	 * Registers the shortcode and the assets it may enqueue.
	 *
	 * @return void
	 */
	public static function register() {
		add_shortcode( 'videokr', array( __CLASS__, 'render' ) );
		wp_register_style( 'videokr-embed', VIDEOKR_URL . 'assets/embed.css', array(), VIDEOKR_VERSION );
		wp_register_script( 'videokr-embed', VIDEOKR_URL . 'assets/embed.js', array(), VIDEOKR_VERSION, true );
	}

	/**
	 * Renders the shortcode.
	 *
	 * @param array $atts Shortcode attributes.
	 * @return string
	 */
	public static function render( $atts ) {
		$atts = shortcode_atts( Videokr_Embed::defaults(), $atts, 'videokr' );
		return Videokr_Embed::render( $atts );
	}
}
