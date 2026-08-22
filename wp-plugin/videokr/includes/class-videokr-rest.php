<?php
/**
 * REST proxy so the block editor can browse the library without ever holding
 * the account API key in the browser.
 *
 * @package Videokr
 */

defined( 'ABSPATH' ) || exit;

/**
 * Routes are editor-only: `edit_posts` plus the standard REST nonce.
 */
class Videokr_Rest {

	const NAMESPACE_V1 = 'videokr/v1';

	/**
	 * Hooks route registration.
	 *
	 * @return void
	 */
	public static function register() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
	}

	/**
	 * Declares the routes.
	 *
	 * @return void
	 */
	public static function routes() {
		register_rest_route(
			self::NAMESPACE_V1,
			'/library',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'library' ),
				'permission_callback' => array( __CLASS__, 'can_edit' ),
				'args'               => array(
					'search' => array(
						'type'              => 'string',
						'default'           => '',
						'sanitize_callback' => 'sanitize_text_field',
					),
					'fresh'  => array(
						'type'    => 'boolean',
						'default' => false,
					),
				),
			)
		);
	}

	/**
	 * Whether the current user may browse the library.
	 *
	 * @return bool
	 */
	public static function can_edit() {
		return current_user_can( 'edit_posts' );
	}

	/**
	 * Videos and playlists in one response, which is all the picker needs.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function library( WP_REST_Request $request ) {
		if ( ! Videokr_Settings::is_connected() ) {
			return new WP_Error(
				'videokr_not_connected',
				__( 'Connect your Videokr account first.', 'videokr' ),
				array( 'status' => 409 )
			);
		}

		$fresh  = (bool) $request->get_param( 'fresh' );
		$videos = Videokr_Api::videos( (string) $request->get_param( 'search' ), $fresh );
		if ( is_wp_error( $videos ) ) {
			return new WP_Error( $videos->get_error_code(), $videos->get_error_message(), array( 'status' => 502 ) );
		}
		$playlists = Videokr_Api::playlists( $fresh );
		if ( is_wp_error( $playlists ) ) {
			return new WP_Error( $playlists->get_error_code(), $playlists->get_error_message(), array( 'status' => 502 ) );
		}

		return rest_ensure_response(
			array(
				'videos'    => isset( $videos['videos'] ) ? $videos['videos'] : array(),
				'playlists' => isset( $playlists['playlists'] ) ? $playlists['playlists'] : array(),
				'host'      => Videokr_Settings::host(),
			)
		);
	}
}
