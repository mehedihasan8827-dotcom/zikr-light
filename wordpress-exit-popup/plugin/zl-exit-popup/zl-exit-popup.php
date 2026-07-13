<?php
/**
 * Plugin Name: ZL Exit Intent Discount Popup
 * Description: এক্সিট-ইনটেন্ট ডিসকাউন্ট পপআপ — WooCommerce/CartFlows ল্যান্ডিং পেজের জন্য। ভিজিটর নির্দিষ্ট সময় পেজে থাকার পর বেরিয়ে যেতে চাইলে ডিসকাউন্ট অফার দেখায় এবং কুপন AJAX-এ কার্টে অটো-অ্যাপ্লাই করে।
 * Version: 1.0.0
 * Author: Mehedi Hasan
 * Requires at least: 5.8
 * Requires PHP: 7.2
 * Text Domain: zl-exit-popup
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ZL_EXIT_VERSION', '1.0.0' );
define( 'ZL_EXIT_OPTION', 'zl_exit_popup_settings' );

/* ============================================================
 * সেটিংস
 * ============================================================ */

function zl_exit_default_settings() {
	return array(
		'enabled'         => 1,
		'discount'        => 100,
		'coupon'          => 'EXIT100',
		'min_seconds'     => 45,
		'offer_minutes'   => 15,
		'frequency_hours' => 24,
		// খালি রাখলে সব পেজে চলবে; নির্দিষ্ট ল্যান্ডিং পেজে চালাতে
		// কমা দিয়ে পেজ ID দিন (যেমন: 12,34)
		'page_ids'        => '',
		'form_selector'   => '#order-form, form.woocommerce-checkout, .cartflows-container',
	);
}

function zl_exit_get_settings() {
	$saved = get_option( ZL_EXIT_OPTION, array() );
	return wp_parse_args( is_array( $saved ) ? $saved : array(), zl_exit_default_settings() );
}

function zl_exit_sanitize_settings( $input ) {
	$d = zl_exit_default_settings();
	return array(
		'enabled'         => empty( $input['enabled'] ) ? 0 : 1,
		'discount'        => max( 1, absint( isset( $input['discount'] ) ? $input['discount'] : $d['discount'] ) ),
		'coupon'          => strtoupper( preg_replace( '/[^A-Za-z0-9_-]/', '', isset( $input['coupon'] ) ? $input['coupon'] : $d['coupon'] ) ),
		'min_seconds'     => max( 5, absint( isset( $input['min_seconds'] ) ? $input['min_seconds'] : $d['min_seconds'] ) ),
		'offer_minutes'   => max( 1, absint( isset( $input['offer_minutes'] ) ? $input['offer_minutes'] : $d['offer_minutes'] ) ),
		'frequency_hours' => max( 1, absint( isset( $input['frequency_hours'] ) ? $input['frequency_hours'] : $d['frequency_hours'] ) ),
		'page_ids'        => implode( ',', array_filter( array_map( 'absint', explode( ',', isset( $input['page_ids'] ) ? $input['page_ids'] : '' ) ) ) ),
		'form_selector'   => sanitize_text_field( isset( $input['form_selector'] ) ? $input['form_selector'] : $d['form_selector'] ),
	);
}

add_action( 'admin_init', function () {
	register_setting( 'zl_exit_popup', ZL_EXIT_OPTION, array( 'sanitize_callback' => 'zl_exit_sanitize_settings' ) );
} );

add_action( 'admin_menu', function () {
	add_options_page( 'Exit Popup', 'Exit Popup', 'manage_options', 'zl-exit-popup', 'zl_exit_render_settings_page' );
} );

function zl_exit_render_settings_page() {
	$s = zl_exit_get_settings();
	?>
	<div class="wrap">
		<h1>Exit Intent Discount Popup</h1>
		<p>প্রথমে WooCommerce → Marketing → Coupons-এ কুপনটি তৈরি করুন
			(Fixed cart discount, নিচের Amount-এর সমান, Usage limit per user: 1)।</p>
		<form method="post" action="options.php">
			<?php settings_fields( 'zl_exit_popup' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row">পপআপ চালু</th>
					<td><label><input type="checkbox" name="<?php echo esc_attr( ZL_EXIT_OPTION ); ?>[enabled]" value="1" <?php checked( $s['enabled'], 1 ); ?>> সক্রিয়</label></td>
				</tr>
				<tr>
					<th scope="row"><label for="zl-discount">ডিসকাউন্ট (টাকা)</label></th>
					<td><input id="zl-discount" type="number" min="1" name="<?php echo esc_attr( ZL_EXIT_OPTION ); ?>[discount]" value="<?php echo esc_attr( $s['discount'] ); ?>" class="small-text"></td>
				</tr>
				<tr>
					<th scope="row"><label for="zl-coupon">WooCommerce কুপন কোড</label></th>
					<td>
						<input id="zl-coupon" type="text" name="<?php echo esc_attr( ZL_EXIT_OPTION ); ?>[coupon]" value="<?php echo esc_attr( $s['coupon'] ); ?>" class="regular-text">
						<p class="description">এই কোডের কুপনটি WooCommerce-এ থাকতে হবে; শুধু এটিই অটো-অ্যাপ্লাই হবে।</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="zl-seconds">কত সেকেন্ড পরে সক্রিয় হবে</label></th>
					<td><input id="zl-seconds" type="number" min="5" name="<?php echo esc_attr( ZL_EXIT_OPTION ); ?>[min_seconds]" value="<?php echo esc_attr( $s['min_seconds'] ); ?>" class="small-text"> সেকেন্ড</td>
				</tr>
				<tr>
					<th scope="row"><label for="zl-offer">কাউন্টডাউন টাইমার</label></th>
					<td><input id="zl-offer" type="number" min="1" name="<?php echo esc_attr( ZL_EXIT_OPTION ); ?>[offer_minutes]" value="<?php echo esc_attr( $s['offer_minutes'] ); ?>" class="small-text"> মিনিট</td>
				</tr>
				<tr>
					<th scope="row"><label for="zl-freq">আবার দেখানোর ব্যবধান</label></th>
					<td><input id="zl-freq" type="number" min="1" name="<?php echo esc_attr( ZL_EXIT_OPTION ); ?>[frequency_hours]" value="<?php echo esc_attr( $s['frequency_hours'] ); ?>" class="small-text"> ঘণ্টা</td>
				</tr>
				<tr>
					<th scope="row"><label for="zl-pages">নির্দিষ্ট পেজ ID</label></th>
					<td>
						<input id="zl-pages" type="text" name="<?php echo esc_attr( ZL_EXIT_OPTION ); ?>[page_ids]" value="<?php echo esc_attr( $s['page_ids'] ); ?>" class="regular-text" placeholder="যেমন: 12,34">
						<p class="description">খালি রাখলে সব পেজে চলবে। শুধু ল্যান্ডিং পেজে চালাতে সেই পেজের ID দিন (কমা দিয়ে একাধিক)।</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="zl-selector">অর্ডার ফর্মের CSS সিলেক্টর</label></th>
					<td>
						<input id="zl-selector" type="text" name="<?php echo esc_attr( ZL_EXIT_OPTION ); ?>[form_selector]" value="<?php echo esc_attr( $s['form_selector'] ); ?>" class="large-text">
						<p class="description">ডিসকাউন্ট নেওয়ার পর পেজ এখানে স্ক্রল করবে। ডিফল্টেই CartFlows/WooCommerce চেকআউট ধরা পড়ে।</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
		<p><strong>টেস্ট করতে:</strong> ল্যান্ডিং পেজের URL-এর শেষে <code>?zl_exit_debug=1</code>
			যোগ করুন — আগের টেস্টের ব্লক মুছে যাবে এবং ব্রাউজার কনসোলে প্রতিটি ধাপের লগ দেখা যাবে।</p>
	</div>
	<?php
}

/* ============================================================
 * ফ্রন্টএন্ড: স্ক্রিপ্ট/স্টাইল লোড + পপআপ মার্কআপ
 * ============================================================ */

function zl_exit_should_load() {
	if ( is_admin() || ! function_exists( 'WC' ) ) {
		return false;
	}
	$s = zl_exit_get_settings();
	if ( empty( $s['enabled'] ) ) {
		return false;
	}
	$ids = array_filter( array_map( 'absint', explode( ',', $s['page_ids'] ) ) );
	if ( $ids && ! in_array( (int) get_the_ID(), $ids, true ) ) {
		return false;
	}
	return true;
}

add_action( 'wp_enqueue_scripts', function () {
	if ( ! zl_exit_should_load() ) {
		return;
	}
	$s = zl_exit_get_settings();

	wp_enqueue_style(
		'zl-exit-popup',
		plugins_url( 'assets/css/exit-popup.css', __FILE__ ),
		array(),
		ZL_EXIT_VERSION
	);
	wp_enqueue_script(
		'zl-exit-popup',
		plugins_url( 'assets/js/exit-popup.js', __FILE__ ),
		array(),
		ZL_EXIT_VERSION,
		true
	);
	wp_localize_script(
		'zl-exit-popup',
		'zlExitCfg',
		array(
			'ajaxUrl'          => admin_url( 'admin-ajax.php' ),
			'minSecondsOnPage' => (int) $s['min_seconds'],
			'discountAmount'   => (int) $s['discount'],
			'couponCode'       => $s['coupon'],
			'offerMinutes'     => (int) $s['offer_minutes'],
			'frequencyHours'   => (int) $s['frequency_hours'],
			'formSelector'     => $s['form_selector'],
		)
	);
} );

add_action( 'wp_footer', function () {
	if ( ! zl_exit_should_load() ) {
		return;
	}
	?>
	<div id="zl-exit-overlay" aria-hidden="true">
		<div class="zl-exit-popup" role="dialog" aria-modal="true" aria-labelledby="zl-exit-title">
			<button type="button" class="zl-exit-close" id="zl-exit-close" aria-label="বন্ধ করুন">&times;</button>
			<div class="zl-exit-badge">🎁 শুধু আপনার জন্য বিশেষ অফার</div>
			<h2 id="zl-exit-title">একটু দাঁড়ান! এখনই অর্ডার করলে <span class="zl-exit-amount"></span> ছাড়!</h2>
			<p>ডিসকাউন্টটি মূল দাম থেকে সরাসরি কেটে যাবে — কোনো কুপন কোড টাইপ করতে হবে না।</p>
			<div class="zl-exit-timer">⏳ অফার শেষ হতে বাকি: <span id="zl-exit-countdown">--:--</span></div>
			<button type="button" class="zl-exit-btn" id="zl-exit-cta">ডিসকাউন্ট নিয়ে অর্ডার করুন ➜</button>
			<button type="button" class="zl-exit-no" id="zl-exit-no">না ধন্যবাদ, আমি পুরো দাম দিতে চাই</button>
		</div>
	</div>
	<?php
} );

/* ============================================================
 * কুপন অ্যাপ্লাই
 * ============================================================ */

/**
 * নিরাপত্তা: সেটিংসে দেওয়া কুপনটিই একমাত্র বৈধ — AJAX/URL/কুকিতে
 * অন্য কিছু পাঠালে অ্যাপ্লাই হবে না।
 */
function zl_exit_sanitize_coupon( $raw ) {
	$code    = strtoupper( trim( sanitize_text_field( wp_unslash( $raw ) ) ) );
	$allowed = zl_exit_get_settings();
	return ( $code === $allowed['coupon'] ) ? $code : '';
}

/**
 * AJAX হ্যান্ডলার: পপআপের CTA থেকে কল হয়, পেজ রিলোড ছাড়াই কুপন
 * কার্টে অ্যাপ্লাই করে।
 *
 * ইচ্ছাকৃতভাবে nonce ব্যবহার করা হয়নি: ল্যান্ডিং পেজ সাধারণত অনেকক্ষণ
 * ক্যাশ থাকে, ফলে পেজে ছাপা nonce মেয়াদোত্তীর্ণ হয়ে বৈধ কাস্টমারের
 * কুপনই আটকে যেত। এখানে ঝুঁকি নেই — হ্যান্ডলারটি শুধু সেটিংসে দেওয়া
 * পাবলিক কুপনটিই অ্যাপ্লাই করতে পারে, আর কুপনের usage limit
 * অপব্যবহার ঠেকায়।
 */
add_action( 'wp_ajax_zl_apply_exit_coupon', 'zl_exit_ajax_apply_coupon' );
add_action( 'wp_ajax_nopriv_zl_apply_exit_coupon', 'zl_exit_ajax_apply_coupon' );
function zl_exit_ajax_apply_coupon() {
	if ( ! function_exists( 'WC' ) || null === WC()->cart ) {
		wp_send_json_error( array( 'status' => 'no_woocommerce' ) );
	}

	$code = isset( $_POST['coupon'] ) ? zl_exit_sanitize_coupon( $_POST['coupon'] ) : '';
	if ( '' === $code ) {
		wp_send_json_error( array( 'status' => 'invalid_coupon' ) );
	}

	// গেস্ট ভিজিটরের সেশন-কুকি নিশ্চিত করা, যেন কুপনটি টিকে থাকে
	if ( WC()->session && ! WC()->session->has_session() ) {
		WC()->session->set_customer_session_cookie( true );
	}
	if ( WC()->session ) {
		WC()->session->set( 'zl_exit_coupon', $code );
	}

	// কার্ট খালি: প্রোডাক্ট যোগ হওয়ামাত্র সেশন থেকে অ্যাপ্লাই হবে
	if ( WC()->cart->is_empty() ) {
		wp_send_json_success( array( 'status' => 'pending_empty_cart' ) );
	}

	if ( WC()->cart->has_discount( $code ) ) {
		wp_send_json_success( array( 'status' => 'already_applied' ) );
	}

	if ( WC()->cart->apply_coupon( $code ) ) {
		WC()->cart->calculate_totals();
		wp_send_json_success(
			array(
				'status'     => 'applied',
				'cart_total' => WC()->cart->get_total( 'edit' ),
			)
		);
	}

	wp_send_json_error( array( 'status' => 'apply_failed' ) );
}

/**
 * ফলব্যাক: AJAX ব্যর্থ হলে/পেজ রিলোড হলে URL প্যারামিটার (?exit_coupon=)
 * বা কুকি (zl_exit_coupon) দেখে কুপন অ্যাপ্লাই।
 * priority 30: WooCommerce নিজের add-to-cart হ্যান্ডলিং wp_loaded
 * priority 20-এ করে, তাই প্রোডাক্ট কার্টে যোগ হওয়ার পরেই কুপন বসে।
 */
add_action( 'wp_loaded', 'zl_exit_maybe_apply_coupon', 30 );
function zl_exit_maybe_apply_coupon() {
	if ( is_admin() || wp_doing_ajax() || ! function_exists( 'WC' ) || null === WC()->cart ) {
		return;
	}

	$code = '';
	if ( ! empty( $_GET['exit_coupon'] ) ) {
		$code = zl_exit_sanitize_coupon( $_GET['exit_coupon'] );
	} elseif ( ! empty( $_COOKIE['zl_exit_coupon'] ) ) {
		$code = zl_exit_sanitize_coupon( $_COOKIE['zl_exit_coupon'] );
	}
	if ( '' === $code ) {
		return;
	}

	// কার্ট এখনো খালি থাকলে সেশনে রেখে দিই — প্রোডাক্ট যোগ হলে অ্যাপ্লাই হবে
	if ( WC()->cart->is_empty() ) {
		if ( WC()->session ) {
			WC()->session->set( 'zl_exit_coupon', $code );
		}
		return;
	}

	if ( ! WC()->cart->has_discount( $code ) ) {
		WC()->cart->apply_coupon( $code );
		wc_add_notice(
			sprintf( 'অভিনন্দন! আপনার এক্সিট অফারের ডিসকাউন্ট (%s) যোগ হয়েছে।', esc_html( $code ) ),
			'success'
		);
	}
}

/**
 * সেশনে জমে থাকা কুপন: প্রোডাক্ট কার্টে যোগ হওয়ামাত্র অ্যাপ্লাই।
 * CartFlows চেকআউট স্টেপ পেজলোডে প্রোডাক্ট কার্টে যোগ করলে এই
 * হুকেই কুপনটি বসে যায়।
 */
add_action( 'woocommerce_add_to_cart', 'zl_exit_apply_pending_coupon', 20 );
function zl_exit_apply_pending_coupon() {
	if ( ! function_exists( 'WC' ) || null === WC()->session ) {
		return;
	}
	$code = WC()->session->get( 'zl_exit_coupon' );
	$s    = zl_exit_get_settings();
	if ( $code && $code === $s['coupon'] && ! WC()->cart->has_discount( $code ) ) {
		WC()->cart->apply_coupon( $code );
	}
}

/**
 * অর্ডার সম্পন্ন হলে কুকি ও সেশন পরিষ্কার — একই ভিজিটর যেন বারবার
 * ডিসকাউন্ট না পায়। woocommerce_thankyou হুকটি CartFlows-এর
 * থ্যাংক ইউ স্টেপেও চলে।
 */
add_action( 'woocommerce_thankyou', 'zl_exit_cleanup_after_order' );
function zl_exit_cleanup_after_order() {
	if ( function_exists( 'WC' ) && WC()->session ) {
		WC()->session->set( 'zl_exit_coupon', null );
	}
	if ( ! headers_sent() ) {
		setcookie( 'zl_exit_coupon', '', time() - 3600, '/' );
	}
}
