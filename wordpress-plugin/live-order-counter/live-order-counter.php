<?php
/**
 * Plugin Name:       Live Order Counter
 * Description:       Lightweight social-proof badge that shows today's order count in a hero section. Stateless: no database tables, no cron jobs, cache-safe.
 * Version:           1.0.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            Mehedi Hasan
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       live-order-counter
 *
 * @package LiveOrderCounter
 */

defined( 'ABSPATH' ) || exit;

define( 'LOC_VERSION', '1.0.0' );
define( 'LOC_FILE', __FILE__ );
define( 'LOC_DIR', plugin_dir_path( __FILE__ ) );
define( 'LOC_URL', plugin_dir_url( __FILE__ ) );

require_once LOC_DIR . 'includes/class-loc-curve.php';
require_once LOC_DIR . 'includes/class-loc-shortcode.php';
require_once LOC_DIR . 'includes/class-loc-rest.php';
require_once LOC_DIR . 'includes/class-loc-settings.php';

/**
 * Boot the plugin.
 */
function loc_bootstrap() {
	LOC_Shortcode::init();
	LOC_Rest::init();

	if ( is_admin() ) {
		LOC_Settings::init();
	}
}
add_action( 'plugins_loaded', 'loc_bootstrap' );

/**
 * Remove plugin settings on uninstall.
 */
function loc_uninstall() {
	delete_option( LOC_Settings::OPTION );
}
register_uninstall_hook( __FILE__, 'loc_uninstall' );
