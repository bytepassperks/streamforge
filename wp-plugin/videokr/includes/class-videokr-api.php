<?php
/**
 * Client for the Videokr integration API (`/api/v1`).
 *
 * @package Videokr
 */

defined( 'ABSPATH' ) || exit;

/**
 * Every call goes out server-side with the account key in an Authorization
 * header, so the key is never exposed to a visitor or to the block editor.
 * Library listings are cached briefly: a picker that re-renders should not cost
 * a round trip each time.
 */
class Videokr_Api {

	const CACHE_TTL      = 300;
	const CACHE_KEYS_OPT = 'videokr_cache_keys';

	/**
	 * Verifies a key against a host without saving anything.
	 *
	 * @param string $key  Account API key.
	 * @param string $host Videokr host.
	 * @return array|WP_Error Account payload on success.
	 */
	public static function verify( $key, $host ) {
		return self::request( '/account', array(), $key, $host );
	}

	/**
	 * The account's videos, newest first.
	 *
	 * @param string $search Optional title/slug filter.
	 * @param bool   $fresh  Skip the cache.
	 * @return array|WP_Error
	 */
	public static function videos( $search = '', $fresh = false ) {
		return self::cached( '/videos', array( 'search' => $search ), $fresh );
	}

	/**
	 * The account's playlists, newest first.
	 *
	 * @param bool $fresh Skip the cache.
	 * @return array|WP_Error
	 */
	public static function playlists( $fresh = false ) {
		return self::cached( '/playlists', array(), $fresh );
	}

	/**
	 * The connected account, its plan and this month's play usage.
	 *
	 * @param bool $fresh Skip the cache.
	 * @return array|WP_Error
	 */
	public static function account( $fresh = false ) {
		return self::cached( '/account', array(), $fresh );
	}

	/**
	 * Usage, lifetime totals, the last 30 days of plays and the best videos.
	 *
	 * @param bool $fresh Skip the cache.
	 * @return array|WP_Error
	 */
	public static function insights( $fresh = false ) {
		return self::cached( '/insights', array(), $fresh );
	}

	/**
	 * Recent form submissions across the account's videos.
	 *
	 * @param bool $fresh Skip the cache.
	 * @return array|WP_Error
	 */
	public static function leads( $fresh = false ) {
		return self::cached( '/leads', array(), $fresh );
	}

	/**
	 * Drops every cached response. Called on reconnect, manual refresh and
	 * deactivation.
	 *
	 * @return void
	 */
	public static function flush_cache() {
		$keys = get_option( self::CACHE_KEYS_OPT, array() );
		if ( is_array( $keys ) ) {
			foreach ( $keys as $key ) {
				delete_transient( $key );
			}
		}
		delete_option( self::CACHE_KEYS_OPT );
	}

	/**
	 * Runs a request through the transient cache.
	 *
	 * @param string $path  API path.
	 * @param array  $query Query arguments.
	 * @param bool   $fresh Skip the cache.
	 * @return array|WP_Error
	 */
	private static function cached( $path, $query, $fresh ) {
		$name = 'videokr_' . md5( Videokr_Settings::host() . $path . wp_json_encode( $query ) );
		if ( ! $fresh ) {
			$hit = get_transient( $name );
			if ( is_array( $hit ) ) {
				return $hit;
			}
		}
		$result = self::request( $path, $query );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		set_transient( $name, $result, self::CACHE_TTL );
		$keys = get_option( self::CACHE_KEYS_OPT, array() );
		$keys = is_array( $keys ) ? $keys : array();
		if ( ! in_array( $name, $keys, true ) ) {
			$keys[] = $name;
			update_option( self::CACHE_KEYS_OPT, $keys, false );
		}
		return $result;
	}

	/**
	 * Performs one API request.
	 *
	 * @param string $path  API path, e.g. `/videos`.
	 * @param array  $query Query arguments.
	 * @param string $key   Key override (used before one is saved).
	 * @param string $host  Host override.
	 * @return array|WP_Error
	 */
	private static function request( $path, $query = array(), $key = '', $host = '' ) {
		$key  = '' !== $key ? $key : Videokr_Settings::api_key();
		$host = '' !== $host ? untrailingslashit( $host ) : Videokr_Settings::host();
		if ( '' === $key ) {
			return new WP_Error( 'videokr_no_key', __( 'Add your Videokr API key first.', 'videokr' ) );
		}

		$url = $host . '/api/v1' . $path;
		if ( ! empty( $query ) ) {
			$url = add_query_arg( array_filter( $query, 'strlen' ), $url );
		}

		$response = wp_remote_get(
			$url,
			array(
				'timeout' => 15,
				'headers' => array(
					'Authorization' => 'Bearer ' . $key,
					'Accept'        => 'application/json',
				),
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( 401 === $code ) {
			return new WP_Error( 'videokr_unauthorized', __( 'That API key was rejected. Create a new one in Videokr under Integrations.', 'videokr' ) );
		}
		if ( 200 !== $code || ! is_array( $body ) ) {
			$message = is_array( $body ) && isset( $body['error'] ) ? $body['error'] : __( 'Videokr did not answer as expected.', 'videokr' );
			/* translators: 1: HTTP status code, 2: error message. */
			return new WP_Error( 'videokr_http', sprintf( __( 'Videokr returned %1$d: %2$s', 'videokr' ), $code, $message ) );
		}
		return $body;
	}
}
