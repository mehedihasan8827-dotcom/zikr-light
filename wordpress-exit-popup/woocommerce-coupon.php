<?php
/**
 * এক্সিট-ইনটেন্ট ডিসকাউন্ট — WooCommerce কুপন অটো-অ্যাপ্লাই
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
 * পপআপের CTA বাটন চাপলে URL-এ ?exit_coupon=EXIT100 যুক্ত হয় এবং
 * একটি কুকি সেট হয়; নিচের কোড সেটি দেখে কুপনটি কার্টে
 * অটো-অ্যাপ্লাই করে। অর্ডার শেষে কাস্টমার WooCommerce-এর
 * ডিফল্ট থ্যাংক ইউ পেজে (order-received) চলে যায়।
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * নিরাপত্তা: শুধু এই তালিকার কুপনগুলোই URL/কুকি থেকে অ্যাপ্লাই হবে।
 * নতুন অফার চালু করলে এখানে কোড যোগ করুন।
 */
function zl_exit_allowed_coupons() {
	return array( 'EXIT50', 'EXIT100' );
}

/**
 * URL প্যারামিটার বা কুকি থেকে কুপন কোড বের করা।
 */
function zl_exit_get_requested_coupon() {
	$code = '';
	if ( ! empty( $_GET['exit_coupon'] ) ) {
		$code = sanitize_text_field( wp_unslash( $_GET['exit_coupon'] ) );
	} elseif ( ! empty( $_COOKIE['zl_exit_coupon'] ) ) {
		$code = sanitize_text_field( wp_unslash( $_COOKIE['zl_exit_coupon'] ) );
	}
	$code = strtoupper( trim( $code ) );

	return in_array( $code, zl_exit_allowed_coupons(), true ) ? $code : '';
}

/**
 * কুপন অটো-অ্যাপ্লাই।
 * priority 30: WooCommerce নিজের add-to-cart হ্যান্ডলিং wp_loaded
 * priority 20-এ করে, তাই /checkout/?add-to-cart=123&exit_coupon=EXIT100
 * লিংকে প্রোডাক্ট কার্টে যোগ হওয়ার পরেই কুপন বসবে।
 */
add_action( 'wp_loaded', 'zl_exit_maybe_apply_coupon', 30 );
function zl_exit_maybe_apply_coupon() {
	if ( is_admin() || ! function_exists( 'WC' ) || null === WC()->cart ) {
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
