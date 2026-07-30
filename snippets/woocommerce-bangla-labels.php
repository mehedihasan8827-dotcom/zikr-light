<?php
/**
 * চেকআউট ফর্মের ইংরেজি লেখাগুলো বাংলা করা
 * ------------------------------------------------------------------
 * "Billing & Shipping", "Product", "Quantity", "Price", "Most popular"
 * — এগুলো WooCommerce ও ফানেল প্লাগিনের ডিফল্ট ইংরেজি স্ট্রিং, যা
 * অনুবাদ না হয়ে পেইজে দেখা যাচ্ছে।
 *
 * কোথায় বসাবেন (দুটোর যেকোনো একটি):
 *   ১) সহজ ও নিরাপদ পথ — "Code Snippets" প্লাগিন ইনস্টল করে
 *      নতুন স্নিপেট হিসেবে নিচের কোডটি (<?php লাইনটি বাদ দিয়ে) বসান।
 *   ২) চাইল্ড থিমের functions.php ফাইলের একদম শেষে যোগ করুন।
 *
 * ⚠️ মূল (parent) থিমের functions.php-তে বসাবেন না — থিম আপডেট হলে
 *    কোডটি মুছে যাবে।
 *
 * ⚠️ পণ্যের নামে থাকা "KATIMON-10KG" এই কোড দিয়ে ঠিক হবে না — ওটা
 *    SKU কোড, অনুবাদযোগ্য লেখা নয়। ওটা বদলাতে হবে এখান থেকে:
 *    WooCommerce → Products → পণ্যটি এডিট করে নামটি
 *    "সুইট কাটিমন আম — ১০ কেজি" করে দিন।
 * ------------------------------------------------------------------
 */

/**
 * কোন ইংরেজি লেখার বদলে কী বাংলা বসবে।
 * নতুন লেখা চোখে পড়লে এখানে এক লাইন যোগ করে দিলেই হবে।
 */
function pfm_bangla_label_map() {
	static $map = null;

	if ( $map === null ) {
		$map = array(
			// ফর্মের হেডিং
			'Billing & Shipping'     => 'বিলিং ও ডেলিভারি তথ্য',
			'Billing &amp; Shipping' => 'বিলিং ও ডেলিভারি তথ্য',
			'Billing details'        => 'বিলিং তথ্য',
			'Shipping details'       => 'ডেলিভারি তথ্য',

			// পণ্যের টেবিল
			'Product'                => 'পণ্য',
			'Quantity'               => 'পরিমাণ',
			'Price'                  => 'দাম',
			'Subtotal'               => 'সাবটোটাল',
			'Total'                  => 'সর্বমোট',
			'Shipping'               => 'ডেলিভারি',
			'Your order'             => 'আপনার অর্ডার',
			'Order summary'          => 'অর্ডারের সারসংক্ষেপ',

			// ব্যাজ ও বাটন
			'Most popular'           => 'সবচেয়ে জনপ্রিয়',
			'Place order'            => 'অর্ডার কনফার্ম করুন',

			// সাধারণ ফিল্ড লেবেল
			'First name'             => 'নাম',
			'Last name'              => 'পদবি',
			'Phone'                  => 'মোবাইল নাম্বার',
			'Email address'          => 'ইমেইল',
			'Town / City'            => 'শহর / এলাকা',
			'Street address'         => 'সম্পূর্ণ ঠিকানা',
			'Order notes'            => 'অতিরিক্ত কিছু বলার থাকলে',
		);
	}

	return $map;
}

/**
 * সাধারণ অনুবাদ (__() দিয়ে আসা লেখা)
 */
function pfm_bangla_gettext( $translated, $text, $domain ) {
	// অ্যাডমিন প্যানেলের লেখা অপরিবর্তিত থাকবে
	if ( is_admin() ) {
		return $translated;
	}

	$map = pfm_bangla_label_map();

	return isset( $map[ $text ] ) ? $map[ $text ] : $translated;
}
add_filter( 'gettext', 'pfm_bangla_gettext', 20, 3 );

/**
 * কনটেক্সটসহ অনুবাদ (_x() দিয়ে আসা লেখা)
 */
function pfm_bangla_gettext_with_context( $translated, $text, $context, $domain ) {
	if ( is_admin() ) {
		return $translated;
	}

	$map = pfm_bangla_label_map();

	return isset( $map[ $text ] ) ? $map[ $text ] : $translated;
}
add_filter( 'gettext_with_context', 'pfm_bangla_gettext_with_context', 20, 4 );
