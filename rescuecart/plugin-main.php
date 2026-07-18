<?php
/**
 * Plugin Name:       RescueCart – Exit-Intent Checkout Rescue for WooCommerce
 * Plugin URI:        https://github.com/mehedihasan8827-dotcom/zikr-light
 * Description:       Behavioral exit-intent popup for WooCommerce + CartFlows one-page checkouts. Detects leave intent on mobile (Facebook in-app browser aware), offers a discount, mints a session-bound single-use coupon via AJAX, refreshes checkout fragments in place and scrolls the buyer to the form.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            RescueCart
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       rescuecart
 * Requires Plugins:  woocommerce
 */

defined( 'ABSPATH' ) || exit;

define( 'RESCUECART_VERSION', '1.0.0' );
define( 'RESCUECART_FILE', __FILE__ );
define( 'RESCUECART_DIR', plugin_dir_path( __FILE__ ) );
define( 'RESCUECART_URL', plugin_dir_url( __FILE__ ) );

/**
 * Default settings. Shared by the frontend runtime and the admin screen.
 *
 * @return array<string,mixed>
 */
function rescuecart_default_settings() {
	return array(
		'enabled'               => 'yes',
		'discount_type'         => 'fixed_cart', // fixed_cart | percent.
		'discount_amount'       => 40,
		'coupon_expiry_minutes' => 5,
		'cooldown_hours'        => 4,
		'allow_stacking'        => 'no',
		'min_dwell_seconds'     => 20,
		'extra_page_ids'        => '',
		'pixel_event'           => 'yes',
		// Store-facing copy ships in Bengali by default (fully editable in the dashboard).
		'popup_title'           => 'থামুন! এখনই চলে যাচ্ছেন? 🎁',
		'popup_message'         => 'একটু দাঁড়ান! এখনই অর্ডার করলে {discount} টাকা ছাড়!',
		'popup_button'          => 'ডিসকাউন্ট নিয়ে অর্ডার করুন →',
		'popup_dismiss'         => 'না ধন্যবাদ, আমি এখন কিনব না',
		'applied_message'       => 'অভিনন্দন! {discount} টাকা ডিসকাউন্ট যোগ হয়েছে – সময় শেষ হওয়ার আগেই অর্ডারটি কনফার্ম করুন',
		'countdown_label'       => 'অফারটির সময় বাকি আছে:',
	);
}

/**
 * Read settings merged over defaults.
 *
 * @return array<string,mixed>
 */
function rescuecart_get_settings() {
	$saved = get_option( 'rescuecart_settings', array() );
	return wp_parse_args( is_array( $saved ) ? $saved : array(), rescuecart_default_settings() );
}

/**
 * Fixed engine tuning consumed by the frontend intent engine. The single
 * admin-facing control is the minimum dwell time; once that gate opens,
 * fast up-scroll and the back button fire instantly, while softer signals
 * (idle, tab-return, field abandonment) still combine via the intent score.
 *
 * @param array $settings Plugin settings.
 * @return array<string,int|float>
 */
function rescuecart_engine_config( $settings ) {
	return array(
		'minDwellSeconds' => (int) $settings['min_dwell_seconds'],
		'fireThreshold'   => 60,
		'scrollDepth'     => 0.50,
		'upVelocity'      => 1.2,
		'idleSeconds'     => 20,
	);
}

/**
 * Human-readable discount label, e.g. "৳50" or "10%".
 *
 * @param array $settings Plugin settings.
 * @return string
 */
function rescuecart_discount_label( $settings ) {
	$amount = (float) $settings['discount_amount'];
	if ( 'percent' === $settings['discount_type'] ) {
		return rtrim( rtrim( number_format( $amount, 2 ), '0' ), '.' ) . '%';
	}
	if ( function_exists( 'wc_price' ) ) {
		return html_entity_decode( wp_strip_all_tags( wc_price( $amount ) ), ENT_QUOTES, 'UTF-8' );
	}
	return (string) $amount;
}

/**
 * Replace the {discount} token in admin-configured copy.
 *
 * @param string $text     Raw text.
 * @param array  $settings Plugin settings.
 * @return string
 */
function rescuecart_render_text( $text, $settings ) {
	return str_replace( '{discount}', rescuecart_discount_label( $settings ), $text );
}

/**
 * Increment a lifetime stats counter (impressions / claims / conversions).
 *
 * @param string $key Counter name.
 */
function rescuecart_bump_stat( $key ) {
	$stats = get_option( 'rescuecart_stats', array() );
	if ( ! is_array( $stats ) ) {
		$stats = array();
	}
	$stats[ $key ] = isset( $stats[ $key ] ) ? (int) $stats[ $key ] + 1 : 1;
	update_option( 'rescuecart_stats', $stats, false );
}

/**
 * Core plugin container.
 */
final class RescueCart_Plugin {

	const NONCE_ACTION   = 'rescuecart_claim';
	const SESSION_FLAG   = 'rescuecart_claimed_code';
	const COUPON_META    = '_rescuecart';
	const SESSION_META   = '_rescuecart_session';
	const ORDER_META     = '_rescuecart_rescued';
	const CRON_HOOK      = 'rescuecart_daily_cleanup';
	const RATE_LIMIT_MAX = 10; // Claim attempts per IP per hour.

	/** @var RescueCart_Plugin|null */
	private static $instance = null;

	/** @return RescueCart_Plugin */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		register_activation_hook( RESCUECART_FILE, array( __CLASS__, 'activate' ) );
		register_deactivation_hook( RESCUECART_FILE, array( __CLASS__, 'deactivate' ) );
		register_uninstall_hook( RESCUECART_FILE, array( __CLASS__, 'uninstall' ) );

		add_action( 'plugins_loaded', array( $this, 'boot' ) );
		add_action( 'before_woocommerce_init', array( $this, 'declare_hpos_compat' ) );
	}

	/** Wire hooks once all plugins are loaded (so WooCommerce presence is known). */
	public function boot() {
		load_plugin_textdomain( 'rescuecart', false, dirname( plugin_basename( RESCUECART_FILE ) ) . '/languages' );

		if ( is_admin() ) {
			require_once RESCUECART_DIR . 'admin-settings.php';
			RescueCart_Admin::instance();
		}

		if ( ! class_exists( 'WooCommerce' ) ) {
			add_action( 'admin_notices', array( $this, 'notice_wc_missing' ) );
			return;
		}

		// Frontend delivery.
		add_action( 'wp_enqueue_scripts', array( $this, 'maybe_enqueue_assets' ) );
		add_action( 'wp_footer', array( $this, 'render_popup_markup' ) );

		// Cache-proof endpoints (wc-ajax bypasses page caches and sends nocache headers).
		add_action( 'wc_ajax_rescuecart_token', array( $this, 'endpoint_token' ) );
		add_action( 'wc_ajax_rescuecart_claim', array( $this, 'endpoint_claim' ) );
		add_action( 'wc_ajax_rescuecart_impression', array( $this, 'endpoint_impression' ) );

		// Coupon session binding + attribution + cleanup.
		add_filter( 'woocommerce_coupon_is_valid', array( $this, 'validate_session_bound_coupon' ), 10, 2 );
		add_action( 'woocommerce_checkout_order_processed', array( $this, 'attribute_order' ), 10, 3 );
		add_action( self::CRON_HOOK, array( $this, 'cleanup_expired_coupons' ) );
	}

	/** Declare compatibility with WooCommerce High-Performance Order Storage. */
	public function declare_hpos_compat() {
		if ( class_exists( '\Automattic\WooCommerce\Utilities\FeaturesUtil' ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', RESCUECART_FILE, true );
		}
	}

	/** Admin notice shown when WooCommerce is not active. */
	public function notice_wc_missing() {
		if ( ! current_user_can( 'activate_plugins' ) ) {
			return;
		}
		echo '<div class="notice notice-error"><p>' .
			esc_html__( 'RescueCart requires WooCommerce to be installed and active.', 'rescuecart' ) .
			'</p></div>';
	}

	/* ---------------------------------------------------------------------
	 * Targeting
	 * ------------------------------------------------------------------- */

	/**
	 * Should the engine load on the current request?
	 *
	 * Auto-targets WooCommerce checkout and CartFlows steps, plus any extra
	 * page IDs configured by the admin. Never loads on order-received.
	 *
	 * @return bool
	 */
	private function should_load() {
		$settings = rescuecart_get_settings();

		if ( 'yes' !== $settings['enabled'] || is_admin() ) {
			return false;
		}
		if ( function_exists( 'is_wc_endpoint_url' ) && is_wc_endpoint_url( 'order-received' ) ) {
			return false;
		}
		if ( function_exists( 'is_checkout' ) && is_checkout() ) {
			return true;
		}
		if ( is_singular( 'cartflows_step' ) ) {
			return true;
		}

		$extra_ids = array_filter( array_map( 'absint', explode( ',', (string) $settings['extra_page_ids'] ) ) );
		if ( $extra_ids && is_page( $extra_ids ) ) {
			return true;
		}

		return false;
	}

	/* ---------------------------------------------------------------------
	 * Frontend delivery
	 * ------------------------------------------------------------------- */

	/** Enqueue the behavior engine and styles only where a campaign runs. */
	public function maybe_enqueue_assets() {
		if ( ! $this->should_load() ) {
			return;
		}

		$settings = rescuecart_get_settings();

		wp_enqueue_style(
			'rescuecart',
			RESCUECART_URL . 'assets/frontend-style.css',
			array(),
			RESCUECART_VERSION
		);

		wp_enqueue_script(
			'rescuecart',
			RESCUECART_URL . 'assets/frontend-script.js',
			array(), // Deliberately dependency-free; jQuery is feature-detected at runtime.
			RESCUECART_VERSION,
			array(
				'in_footer' => true,
				'strategy'  => 'defer',
			)
		);

		wp_localize_script(
			'rescuecart',
			'rescuecartData',
			array(
				'endpoints'     => array(
					'token'      => WC_AJAX::get_endpoint( 'rescuecart_token' ),
					'claim'      => WC_AJAX::get_endpoint( 'rescuecart_claim' ),
					'impression' => WC_AJAX::get_endpoint( 'rescuecart_impression' ),
				),
				'engine'        => rescuecart_engine_config( $settings ),
				'cooldownHours' => (int) $settings['cooldown_hours'],
				'expiryMinutes' => (int) $settings['coupon_expiry_minutes'],
				'pixelEvent'    => ( 'yes' === $settings['pixel_event'] ),
				'discountValue' => (float) $settings['discount_amount'],
				'discountType'  => (string) $settings['discount_type'],
				'currency'      => get_woocommerce_currency(),
				'appliedText'   => rescuecart_render_text( $settings['applied_message'], $settings ),
				'scrollTargets' => array(
					'.wcf-embed-checkout-form form.checkout',
					'form.checkout.woocommerce-checkout',
					'#customer_details',
					'#order_review',
				),
				'i18n'          => array(
					'claiming' => __( 'Applying your discount…', 'rescuecart' ),
					'error'    => __( 'Could not apply the discount. Please try again.', 'rescuecart' ),
					'retry'    => __( 'Try again', 'rescuecart' ),
				),
			)
		);
	}

	/** Print the popup shell (hidden) so display is instant at trigger time. */
	public function render_popup_markup() {
		if ( ! $this->should_load() || ! wp_script_is( 'rescuecart', 'enqueued' ) ) {
			return;
		}

		$settings = rescuecart_get_settings();
		$minutes  = (int) $settings['coupon_expiry_minutes'];
		?>
		<div id="rescuecart-root" hidden>
			<div class="rescuecart-backdrop" data-rescuecart-dismiss></div>
			<div class="rescuecart-sheet" role="dialog" aria-modal="true" aria-labelledby="rescuecart-title">
				<button type="button" class="rescuecart-close" data-rescuecart-dismiss aria-label="<?php esc_attr_e( 'Close', 'rescuecart' ); ?>">&times;</button>
				<h2 id="rescuecart-title"><?php echo esc_html( rescuecart_render_text( $settings['popup_title'], $settings ) ); ?></h2>
				<p class="rescuecart-message"><?php echo esc_html( rescuecart_render_text( $settings['popup_message'], $settings ) ); ?></p>
				<p class="rescuecart-timer" aria-live="polite">
					<span class="rescuecart-timer-label"><?php echo esc_html( rescuecart_render_text( $settings['countdown_label'], $settings ) ); ?></span>
					<span class="rescuecart-timer-value" data-rescuecart-countdown><?php echo esc_html( sprintf( '%02d:00', $minutes ) ); ?></span>
				</p>
				<button type="button" class="rescuecart-claim" data-rescuecart-claim>
					<?php echo esc_html( rescuecart_render_text( $settings['popup_button'], $settings ) ); ?>
				</button>
				<p class="rescuecart-error" data-rescuecart-error hidden></p>
				<button type="button" class="rescuecart-dismiss" data-rescuecart-dismiss>
					<?php echo esc_html( rescuecart_render_text( $settings['popup_dismiss'], $settings ) ); ?>
				</button>
			</div>
		</div>
		<div id="rescuecart-bar" hidden aria-live="polite">
			<span class="rescuecart-bar-text"></span>
			<span class="rescuecart-bar-timer" data-rescuecart-bar-countdown></span>
		</div>
		<?php
	}

	/* ---------------------------------------------------------------------
	 * Endpoints (wc-ajax: cache-bypassing, nocache headers)
	 * ------------------------------------------------------------------- */

	/**
	 * Issue a fresh nonce. Pages may be served from cache for hours, so the
	 * engine never trusts a nonce baked into HTML — it fetches one lazily
	 * right before first use.
	 */
	public function endpoint_token() {
		wp_send_json_success( array( 'nonce' => wp_create_nonce( self::NONCE_ACTION ) ) );
	}

	/** Count a popup impression (rate-limited, fire-and-forget). */
	public function endpoint_impression() {
		$key = 'rescuecart_imp_' . md5( $this->client_ip() );
		if ( false === get_transient( $key ) ) {
			set_transient( $key, 1, MINUTE_IN_SECONDS );
			rescuecart_bump_stat( 'impressions' );
		}
		wp_send_json_success();
	}

	/**
	 * The security-critical claim path: validate, mint a session-bound
	 * single-use coupon, apply it to the live cart.
	 */
	public function endpoint_claim() {
		$settings = rescuecart_get_settings();

		// 1. Campaign must be on and WooCommerce coupons enabled.
		if ( 'yes' !== $settings['enabled'] || 'yes' !== get_option( 'woocommerce_enable_coupons' ) ) {
			wp_send_json_error( array( 'message' => __( 'This offer is not available right now.', 'rescuecart' ) ), 403 );
		}

		// 2. Fresh nonce (fetched via the token endpoint, never from cached HTML).
		$nonce = isset( $_POST['security'] ) ? sanitize_text_field( wp_unslash( $_POST['security'] ) ) : '';
		if ( ! wp_verify_nonce( $nonce, self::NONCE_ACTION ) ) {
			wp_send_json_error( array( 'message' => __( 'Session expired. Please refresh and try again.', 'rescuecart' ) ), 403 );
		}

		// 3. Honeypot: the field must exist and be empty. Bots fill it.
		if ( ! isset( $_POST['rc_website'] ) || '' !== sanitize_text_field( wp_unslash( $_POST['rc_website'] ) ) ) {
			wp_send_json_error( array( 'message' => __( 'Request rejected.', 'rescuecart' ) ), 403 );
		}

		// 4. Per-IP rate limit.
		if ( ! $this->rate_limit_ok() ) {
			wp_send_json_error( array( 'message' => __( 'Too many attempts. Please try again later.', 'rescuecart' ) ), 429 );
		}

		// 5. A live cart session is required.
		if ( ! WC()->session || ! WC()->cart || WC()->cart->is_empty() ) {
			wp_send_json_error( array( 'message' => __( 'Your cart is empty — add a product first.', 'rescuecart' ) ), 400 );
		}

		// 6. One claim per session.
		$existing = WC()->session->get( self::SESSION_FLAG );
		if ( $existing && WC()->cart->has_discount( $existing ) ) {
			wp_send_json_error( array( 'message' => __( 'Your discount is already applied.', 'rescuecart' ) ), 409 );
		}

		// 7. Mint the coupon (server-authoritative: amount/type come from settings only).
		$code = $this->mint_coupon( $settings );
		if ( is_wp_error( $code ) ) {
			wp_send_json_error( array( 'message' => $code->get_error_message() ), 500 );
		}

		// 8. Apply to the live cart.
		if ( ! WC()->cart->apply_coupon( $code ) ) {
			wp_send_json_error( array( 'message' => __( 'Could not apply the discount. Please try again.', 'rescuecart' ) ), 500 );
		}
		WC()->cart->calculate_totals();
		WC()->session->set( self::SESSION_FLAG, $code );

		rescuecart_bump_stat( 'claims' );

		wp_send_json_success(
			array(
				'code'    => $code,
				'expires' => time() + ( (int) $settings['coupon_expiry_minutes'] * MINUTE_IN_SECONDS ),
				'message' => rescuecart_render_text( $settings['applied_message'], $settings ),
			)
		);
	}

	/**
	 * Create a real WooCommerce coupon: unguessable, single-use,
	 * session-bound, auto-expiring, flagged for attribution and cleanup.
	 *
	 * @param array $settings Plugin settings.
	 * @return string|WP_Error Coupon code on success.
	 */
	private function mint_coupon( $settings ) {
		$code = 'rc-' . strtolower( wp_generate_password( 10, false, false ) );

		try {
			$coupon = new WC_Coupon();
			$coupon->set_code( $code );
			$coupon->set_discount_type( 'percent' === $settings['discount_type'] ? 'percent' : 'fixed_cart' );
			$coupon->set_amount( (float) $settings['discount_amount'] );
			$coupon->set_usage_limit( 1 );
			$coupon->set_usage_limit_per_user( 1 );
			$coupon->set_individual_use( 'yes' !== $settings['allow_stacking'] );
			$coupon->set_date_expires( time() + ( (int) $settings['coupon_expiry_minutes'] * MINUTE_IN_SECONDS ) );
			$coupon->set_description( __( 'Auto-issued by RescueCart exit-intent offer.', 'rescuecart' ) );
			$coupon->update_meta_data( self::COUPON_META, 1 );
			$coupon->update_meta_data( self::SESSION_META, $this->session_key() );
			$coupon->save();
		} catch ( Exception $e ) {
			return new WP_Error( 'rescuecart_mint_failed', __( 'Could not create the discount. Please try again.', 'rescuecart' ) );
		}

		return $code;
	}

	/**
	 * Session-bound validation: a RescueCart coupon is only ever valid for
	 * the exact browser session it was minted for. Shared/leaked codes die.
	 *
	 * @param bool      $valid  Current validity.
	 * @param WC_Coupon $coupon Coupon being validated.
	 * @return bool
	 */
	public function validate_session_bound_coupon( $valid, $coupon ) {
		if ( ! $valid || ! $coupon->get_meta( self::COUPON_META ) ) {
			return $valid;
		}
		return hash_equals( (string) $coupon->get_meta( self::SESSION_META ), $this->session_key() );
	}

	/**
	 * Attribute completed orders that used a RescueCart coupon.
	 *
	 * @param int      $order_id Order ID.
	 * @param array    $data     Posted data (unused).
	 * @param WC_Order $order    Order object.
	 */
	public function attribute_order( $order_id, $data, $order ) {
		if ( ! $order instanceof WC_Order ) {
			return;
		}
		foreach ( $order->get_coupon_codes() as $code ) {
			$coupon_id = wc_get_coupon_id_by_code( $code );
			if ( $coupon_id && get_post_meta( $coupon_id, self::COUPON_META, true ) ) {
				$order->update_meta_data( self::ORDER_META, $code );
				$order->save();
				rescuecart_bump_stat( 'conversions' );
				break;
			}
		}
	}

	/* ---------------------------------------------------------------------
	 * Abuse guard helpers
	 * ------------------------------------------------------------------- */

	/** @return string Opaque per-session key used to bind coupons. */
	private function session_key() {
		$customer_id = ( WC()->session ) ? (string) WC()->session->get_customer_id() : '';
		return hash_hmac( 'sha256', $customer_id, wp_salt( 'auth' ) );
	}

	/** @return bool Whether this IP is under the hourly claim-attempt cap. */
	private function rate_limit_ok() {
		$key   = 'rescuecart_rl_' . md5( $this->client_ip() );
		$count = (int) get_transient( $key );
		if ( $count >= self::RATE_LIMIT_MAX ) {
			return false;
		}
		set_transient( $key, $count + 1, HOUR_IN_SECONDS );
		return true;
	}

	/** @return string Best-effort client IP (for rate limiting only). */
	private function client_ip() {
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
		return $ip ? $ip : 'unknown';
	}

	/* ---------------------------------------------------------------------
	 * Housekeeping
	 * ------------------------------------------------------------------- */

	/** Daily cron: trash expired, never-used RescueCart coupons. */
	public function cleanup_expired_coupons() {
		$ids = get_posts(
			array(
				'post_type'      => 'shop_coupon',
				'post_status'    => 'any',
				'posts_per_page' => 200,
				'fields'         => 'ids',
				'no_found_rows'  => true,
				'meta_key'       => self::COUPON_META, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			)
		);

		foreach ( $ids as $id ) {
			$coupon  = new WC_Coupon( $id );
			$expires = $coupon->get_date_expires();
			if ( $expires && $expires->getTimestamp() < ( time() - HOUR_IN_SECONDS ) && 0 === $coupon->get_usage_count() ) {
				wp_delete_post( $id, true );
			}
		}
	}

	/** Activation: schedule daily cleanup. */
	public static function activate() {
		if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::CRON_HOOK );
		}
	}

	/** Deactivation: unschedule cleanup. */
	public static function deactivate() {
		wp_clear_scheduled_hook( self::CRON_HOOK );
	}

	/** Uninstall: remove options and unused plugin coupons. */
	public static function uninstall() {
		delete_option( 'rescuecart_settings' );
		delete_option( 'rescuecart_stats' );
		wp_clear_scheduled_hook( self::CRON_HOOK );

		$ids = get_posts(
			array(
				'post_type'      => 'shop_coupon',
				'post_status'    => 'any',
				'posts_per_page' => -1,
				'fields'         => 'ids',
				'no_found_rows'  => true,
				'meta_key'       => self::COUPON_META, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			)
		);
		foreach ( $ids as $id ) {
			if ( 0 === (int) get_post_meta( $id, 'usage_count', true ) ) {
				wp_delete_post( $id, true );
			}
		}
	}
}

RescueCart_Plugin::instance();
