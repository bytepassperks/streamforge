<?php
/**
 * Removes the stored key, host, account summary and cached library responses.
 *
 * @package Videokr
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

$videokr_cache_keys = get_option( 'videokr_cache_keys', array() );
if ( is_array( $videokr_cache_keys ) ) {
	foreach ( $videokr_cache_keys as $videokr_cache_key ) {
		delete_transient( $videokr_cache_key );
	}
}

delete_option( 'videokr_cache_keys' );
delete_option( 'videokr_api_key' );
delete_option( 'videokr_host' );
delete_option( 'videokr_account' );
