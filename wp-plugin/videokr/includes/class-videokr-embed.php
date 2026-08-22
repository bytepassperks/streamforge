<?php
/**
 * Turns embed attributes into markup.
 *
 * @package Videokr
 */

defined( 'ABSPATH' ) || exit;

/**
 * The iframe is rendered server-side rather than by loading Videokr's
 * `embed.js`, so a page works with JavaScript-heavy caching plugins and the
 * markup is visible to crawlers. The only script the plugin ships is the
 * playlist height listener, mirroring the loader's behaviour.
 */
class Videokr_Embed {

	/**
	 * Default shortcode and block attributes.
	 *
	 * @return array
	 */
	public static function defaults() {
		return array(
			'id'       => '',
			'playlist' => '',
			'ratio'    => '',
			'width'    => '100%',
			'align'    => '',
			'autoplay' => 'false',
			'muted'    => 'false',
			'start'    => '',
			'token'    => '',
		);
	}

	/**
	 * Renders one embed.
	 *
	 * @param array $atts Attributes, already merged with the defaults.
	 * @return string HTML.
	 */
	public static function render( $atts ) {
		$atts     = wp_parse_args( $atts, self::defaults() );
		$video    = sanitize_text_field( (string) $atts['id'] );
		$playlist = sanitize_text_field( (string) $atts['playlist'] );
		$key      = '' !== $video ? $video : $playlist;
		$is_video = '' !== $video;

		if ( '' === $key ) {
			return self::notice( __( 'Videokr: pick a video or playlist first.', 'videokr' ) );
		}
		if ( ! Videokr_Settings::is_connected() ) {
			return self::notice( __( 'Videokr: connect your account under Videokr → Settings.', 'videokr' ) );
		}

		$ratio  = self::ratio( (string) $atts['ratio'], $is_video );
		$params = array();
		foreach ( array( 'autoplay', 'muted' ) as $flag ) {
			if ( self::truthy( $atts[ $flag ] ) ) {
				$params[ $flag ] = '1';
			}
		}
		if ( '' !== (string) $atts['start'] ) {
			$params['start'] = (int) $atts['start'];
		}
		if ( '' !== (string) $atts['token'] ) {
			$params['token'] = sanitize_text_field( (string) $atts['token'] );
		}

		$src = Videokr_Settings::host() . ( $is_video ? '/e/' : '/ep/' ) . rawurlencode( $key );
		if ( ! empty( $params ) ) {
			$src = add_query_arg( $params, $src );
		}

		$classes = array( 'videokr-embed' );
		if ( in_array( $atts['align'], array( 'left', 'center', 'right', 'wide', 'full' ), true ) ) {
			$classes[] = 'videokr-align-' . $atts['align'];
		}
		if ( ! $is_video && '' === (string) $atts['ratio'] ) {
			/* The playlist page measures itself and posts its height back. */
			$classes[] = 'videokr-autoheight';
			wp_enqueue_script( 'videokr-embed' );
		}
		wp_enqueue_style( 'videokr-embed' );

		/* `max-width` is inline because a theme's constrained-layout rule
		   (`.is-layout-constrained > :where(...)`) sets its own max-width at the
		   same specificity and would otherwise let a fixed width overflow. */
		$style = sprintf(
			'width:%s;max-width:100%%;aspect-ratio:%s',
			esc_attr( self::width( (string) $atts['width'] ) ),
			esc_attr( $ratio )
		);

		return sprintf(
			'<div class="%1$s" style="%2$s"><iframe src="%3$s" title="%4$s" loading="lazy" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe></div>',
			esc_attr( implode( ' ', $classes ) ),
			$style,
			esc_url( $src ),
			esc_attr( $is_video ? __( 'Videokr video player', 'videokr' ) : __( 'Videokr playlist', 'videokr' ) )
		);
	}

	/**
	 * Normalises a `16/9` or `16:9` ratio into a CSS `aspect-ratio` value. A
	 * percentage padding box cannot be used here: percentage padding resolves
	 * against the *containing block*, so a fixed-width embed inside a wider
	 * column would get a wildly wrong height.
	 *
	 * A playlist starts taller because its queue sits beside the stage.
	 *
	 * @param string $ratio    Ratio such as `16/9`.
	 * @param bool   $is_video Whether this is a single video.
	 * @return string
	 */
	private static function ratio( $ratio, $is_video ) {
		$fallback = $is_video ? '16 / 9' : '16 / 11';
		$parts    = explode( '/', str_replace( ':', '/', $ratio ) );
		if ( 2 !== count( $parts ) ) {
			return $fallback;
		}
		$width  = (float) $parts[0];
		$height = (float) $parts[1];
		if ( $width <= 0 || $height <= 0 ) {
			return $fallback;
		}
		return $width . ' / ' . $height;
	}

	/**
	 * Accepts `640`, `640px` or `80%`.
	 *
	 * @param string $width Raw width.
	 * @return string CSS length.
	 */
	private static function width( $width ) {
		$width = trim( $width );
		if ( '' === $width ) {
			return '100%';
		}
		if ( preg_match( '/^\d+(\.\d+)?$/', $width ) ) {
			return $width . 'px';
		}
		if ( preg_match( '/^\d+(\.\d+)?(px|%|rem|em|vw)$/', $width ) ) {
			return $width;
		}
		return '100%';
	}

	/**
	 * Shortcodes carry strings, blocks carry booleans.
	 *
	 * @param mixed $value Raw value.
	 * @return bool
	 */
	private static function truthy( $value ) {
		if ( is_bool( $value ) ) {
			return $value;
		}
		return in_array( strtolower( (string) $value ), array( '1', 'true', 'yes', 'on' ), true );
	}

	/**
	 * An editor-only hint; visitors never see configuration problems.
	 *
	 * @param string $message Message.
	 * @return string
	 */
	private static function notice( $message ) {
		if ( ! current_user_can( 'edit_posts' ) ) {
			return '';
		}
		return '<p class="videokr-notice">' . esc_html( $message ) . '</p>';
	}
}
