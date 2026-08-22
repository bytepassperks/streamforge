<?php
/**
 * Stored options: the account API key and the host it belongs to.
 *
 * @package Videokr
 */

defined( 'ABSPATH' ) || exit;

/**
 * Thin, typed wrapper around the plugin's options so nothing else has to know
 * the option names or apply the same defaults twice.
 */
class Videokr_Settings {

	const OPTION_KEY     = 'videokr_api_key';
	const OPTION_HOST    = 'videokr_host';
	const OPTION_ACCOUNT = 'videokr_account';

	/**
	 * The account API key, or an empty string when the site is not connected.
	 *
	 * @return string
	 */
	public static function api_key() {
		return (string) get_option( self::OPTION_KEY, '' );
	}

	/**
	 * Videokr host without a trailing slash.
	 *
	 * @return string
	 */
	public static function host() {
		$host = (string) get_option( self::OPTION_HOST, '' );
		if ( '' === $host ) {
			$host = VIDEOKR_DEFAULT_HOST;
		}
		return untrailingslashit( $host );
	}

	/**
	 * Whether a key has been saved.
	 *
	 * @return bool
	 */
	public static function is_connected() {
		return '' !== self::api_key();
	}

	/**
	 * The account summary captured when the key was verified: email, plan_name
	 * and the plays used against the allowance.
	 *
	 * @return array
	 */
	public static function account() {
		$account = get_option( self::OPTION_ACCOUNT, array() );
		return is_array( $account ) ? $account : array();
	}

	/**
	 * Saves a verified connection.
	 *
	 * @param string $key     Account API key.
	 * @param string $host    Videokr host.
	 * @param array  $account Account summary from /api/v1/account.
	 * @return void
	 */
	public static function save_connection( $key, $host, $account ) {
		update_option( self::OPTION_KEY, sanitize_text_field( $key ) );
		update_option( self::OPTION_HOST, untrailingslashit( esc_url_raw( $host ) ) );
		update_option( self::OPTION_ACCOUNT, $account );
	}

	/**
	 * Forgets the key but keeps the host, so reconnecting a staging site does
	 * not need the host typed again.
	 *
	 * @return void
	 */
	public static function disconnect() {
		delete_option( self::OPTION_KEY );
		delete_option( self::OPTION_ACCOUNT );
	}
}
