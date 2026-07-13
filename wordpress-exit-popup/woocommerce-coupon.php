<?php
/**
 * এক্সিট-ইনটেন্ট ডিসকাউন্ট — WooCommerce + CartFlows কুপন অটো-অ্যাপ্লাই
 * ------------------------------------------------------------
 * ইন্সটল: "WPCode" বা "Code Snippets" প্লাগইনে নতুন PHP স্নিপেট
 * হিসেবে যোগ করুন (অথবা চাইল্ড থিমের functions.php-তে)।
 *
 * আগে WooCommerce অ্যাডমিনে কুপন তৈরি করুন:
 *   Marketing → Coupons → Add coupon
 *   - কোড: EXIT100 (বা EXIT50)
 *   - Discount type: Fixed cart discount
 *   - Amount: 100 (বা 50)
 *   - Usage limit per user: 1
 *
 * কীভাবে কাজ করে:
 * ১) পপআপের CTA চাপলে JavaScript AJAX কল পাঠায় (zl_apply_exit_coupon)
 *    → নিচের হ্যান্ডলার কুপনটি WooCommerce কার্টে অ্যাপ্লাই করে।
 *    CartFlows-এর এমবেড করা চেকআউট ফর্ম একই কার্ট ব্যবহার করে, তাই
 *    অর্ডার সামারিতে ডিসকাউন্ট কাটা দাম সাথে সাথেই দেখা যায়।
 * ২) ফলব্যাক: AJAX ব্যর্থ হলে/পেজ রিলোড হলে কুকি (zl_exit_coupon)
 *    বা URL প্যারামিটার (?exit_coupon=) দেখে কুপন অ্যাপ্লাই হয়।
 * ৩) কার্ট খালি থাকলে কোডটি সেশনে জমা থাকে এবং প্রোডাক্ট কার্টে
 *    যোগ হওয়ামাত্র অ্যাপ্লাই হয়।
 * ৪) অর্ডার শেষে CartFlows-এর থ্যাংক ইউ স্টেপ / WooCommerce-এর
 *    order-received পেজ স্বাভাবিকভাবেই আসে; কুকি-সেশন মুছে যায়।
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * নিরাপত্তা: শুধু এই তালিকার কুপনগুলোই URL/কুকি/AJAX থেকে অ্যাপ্লাই হবে।
 * নতুন অফার চালু করলে এখানে কোড যোগ করুন।
 */
function zl_exit_allowed_coupons() {
	return array( 'EXIT50', 'EXIT100' );
}

/**
 * কুপন কোড যাচাই — whitelist-এর বাইরের কিছু হলে খালি স্ট্রিং।
 */
function zl_exit_sanitize_coupon( $raw ) {
	$code = strtoupper( trim( sanitize_text_field( wp_unslash( $raw ) ) ) );
	return in_array( $code, zl_exit_allowed_coupons(), true ) ? $code : '';
}

/**
 * AJAX হ্যান্ডলার: পপআপের CTA থেকে কল হয়, পেজ রিলোড ছাড়াই কুপন
 * কার্টে অ্যাপ্লাই করে। শুধু whitelist-করা পাবলিক কুপন অ্যাপ্লাই
 * করে বলে nonce ছাড়াও নিরাপদ (কুপনের usage limit অপব্যবহার ঠেকায়)।
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
 * ফলব্যাক: URL প্যারামিটার বা কুকি থেকে কুপন কোড বের করা।
 */
function zl_exit_get_requested_coupon() {
	if ( ! empty( $_GET['exit_coupon'] ) ) {
		return zl_exit_sanitize_coupon( $_GET['exit_coupon'] );
	}
	if ( ! empty( $_COOKIE['zl_exit_coupon'] ) ) {
		return zl_exit_sanitize_coupon( $_COOKIE['zl_exit_coupon'] );
	}
	return '';
}

/**
 * পেজলোডে কুপন অটো-অ্যাপ্লাই (ফলব্যাক পথ)।
 * priority 30: WooCommerce নিজের add-to-cart হ্যান্ডলিং wp_loaded
 * priority 20-এ করে, তাই ?add-to-cart=123&exit_coupon=EXIT100
 * লিংকে প্রোডাক্ট কার্টে যোগ হওয়ার পরেই কুপন বসবে।
 */
add_action( 'wp_loaded', 'zl_exit_maybe_apply_coupon', 30 );
function zl_exit_maybe_apply_coupon() {
	if ( is_admin() || wp_doing_ajax() || ! function_exists( 'WC' ) || null === WC()->cart ) {
		return;
	}

	$code = zl_exit_get_requested_coupon();
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
	if ( $code && in_array( $code, zl_exit_allowed_coupons(), true ) && ! WC()->cart->has_discount( $code ) ) {
		WC()->cart->apply_coupon( $code );
	}
}

/**
 * অর্ডার সম্পন্ন হলে কুকি ও সেশন পরিষ্কার — যেন একই ভিজিটর
 * বারবার ডিসকাউন্ট না পায় (কুপনের usage limit-ও এটি আটকায়)।
 * woocommerce_thankyou হুকটি CartFlows-এর থ্যাংক ইউ স্টেপেও চলে।
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
