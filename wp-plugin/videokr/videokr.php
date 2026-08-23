<?php
/**
 * Plugin Name:       Videokr
 * Plugin URI:        https://videokr.com/
 * Description:       Embed your Videokr-hosted videos and playlists in WordPress with a shortcode or block — your branded player, your analytics, no third-party player chrome.
 * Version:           1.1.5
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Videokr
 * Author URI:        https://videokr.com/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       videokr
 *
 * @package Videokr
 */

defined( 'ABSPATH' ) || exit;

define( 'VIDEOKR_VERSION', '1.1.5' );
define( 'VIDEOKR_FILE', __FILE__ );
define( 'VIDEOKR_DIR', plugin_dir_path( __FILE__ ) );
define( 'VIDEOKR_URL', plugin_dir_url( __FILE__ ) );

/** Default host, overridable so a self-signed staging Worker can be pointed at. */
define( 'VIDEOKR_DEFAULT_HOST', 'https://videokr.com' );

require_once VIDEOKR_DIR . 'includes/class-videokr-settings.php';
require_once VIDEOKR_DIR . 'includes/class-videokr-api.php';
require_once VIDEOKR_DIR . 'includes/class-videokr-embed.php';
require_once VIDEOKR_DIR . 'includes/class-videokr-shortcode.php';
require_once VIDEOKR_DIR . 'includes/class-videokr-block.php';
require_once VIDEOKR_DIR . 'includes/class-videokr-rest.php';
require_once VIDEOKR_DIR . 'includes/class-videokr-admin.php';

/**
 * Boots the plugin once WordPress is ready.
 *
 * @return void
 */
function videokr_init() {
	Videokr_Shortcode::register();
	Videokr_Block::register();
	Videokr_Rest::register();
	if ( is_admin() ) {
		Videokr_Admin::register();
	}
}
add_action( 'init', 'videokr_init' );

/**
 * Clears cached library responses when the plugin is deactivated, so a
 * reconnect never shows a stale library.
 *
 * @return void
 */
function videokr_deactivate() {
	Videokr_Api::flush_cache();
}
register_deactivation_hook( __FILE__, 'videokr_deactivate' );
