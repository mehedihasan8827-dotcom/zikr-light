<?php
/**
 * Plugin Name: ZL Exit Intent Discount Popup
 * Description: এক্সিট-ইনটেন্ট ডিসকাউন্ট পপআপ — WooCommerce/CartFlows ল্যান্ডিং পেজের জন্য। ভিজিটর নির্দিষ্ট সময় পেজে থাকার পর বেরিয়ে যেতে চাইলে ডিসকাউন্ট অফার দেখায় এবং কুপন AJAX-এ কার্টে অটো-অ্যাপ্লাই করে।
 * Version: 1.5.0
 * Author: Mehedi Hasan
 * Requires at least: 5.8
 * Requires PHP: 7.2
 * Text Domain: zl-exit-popup
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ZL_EXIT_VERSION', '1.5.0' );
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

		// পপআপের লেখাগুলো — ড্যাশবোর্ড থেকে বদলানো যায়।
		// {discount} লিখলে সেখানে ডিসকাউন্টের পরিমাণ (যেমন ৳১০০ টাকা) বসবে।
		'txt_badge'       => '🎁 শুধু আপনার জন্য বিশেষ অফার',
		'txt_headline'    => 'একটু দাঁড়ান! এখনই অর্ডার করলে {discount} ছাড়!',
		'txt_desc'        => 'ডিসকাউন্টটি মূল দাম থেকে সরাসরি কেটে যাবে — কোনো কুপন কোড টাইপ করতে হবে না।',
		'txt_timer'       => '⏳ অফার শেষ হতে বাকি:',
		'txt_cta'         => 'ডিসকাউন্ট নিয়ে অর্ডার করুন ➜',
		'txt_no'          => 'না ধন্যবাদ, আমি পুরো দাম দিতে চাই',
		'txt_applied'     => '🎉 অভিনন্দন! আপনার {discount} ডিসকাউন্ট যোগ হয়েছে — নিচের ফর্মটি পূরণ করে অর্ডার সম্পন্ন করুন।',
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
		'txt_badge'       => sanitize_text_field( isset( $input['txt_badge'] ) ? $input['txt_badge'] : $d['txt_badge'] ),
		'txt_headline'    => sanitize_text_field( isset( $input['txt_headline'] ) ? $input['txt_headline'] : $d['txt_headline'] ),
		'txt_desc'        => sanitize_textarea_field( isset( $input['txt_desc'] ) ? $input['txt_desc'] : $d['txt_desc'] ),
		'txt_timer'       => sanitize_text_field( isset( $input['txt_timer'] ) ? $input['txt_timer'] : $d['txt_timer'] ),
		'txt_cta'         => sanitize_text_field( isset( $input['txt_cta'] ) ? $input['txt_cta'] : $d['txt_cta'] ),
		'txt_no'          => sanitize_text_field( isset( $input['txt_no'] ) ? $input['txt_no'] : $d['txt_no'] ),
		'txt_applied'     => sanitize_textarea_field( isset( $input['txt_applied'] ) ? $input['txt_applied'] : $d['txt_applied'] ),
	);
}

add_action( 'admin_init', function () {
	register_setting( 'zl_exit_popup', ZL_EXIT_OPTION, array( 'sanitize_callback' => 'zl_exit_sanitize_settings' ) );
} );

/**
 * WooCommerce-এ কুপনটি না থাকলে নিজে থেকেই তৈরি করে দেয়; থাকলে
 * ডিসকাউন্টের ধরন ও পরিমাণ সেটিংসের সাথে মিলিয়ে আপডেট করে।
 * প্লাগইন অ্যাক্টিভেট করলে এবং সেটিংস সেভ করলে চলে — কুপন
 * ম্যানুয়ালি বানানোর দরকার নেই।
 */
function zl_exit_ensure_coupon() {
	if ( ! class_exists( 'WC_Coupon' ) ) {
		return;
	}
	$s    = zl_exit_get_settings();
	$code = $s['coupon'];
	if ( '' === $code ) {
		return;
	}
	try {
		$coupon = new WC_Coupon( $code );
		// আগেই সঠিক অবস্থায় থাকলে অহেতুক সেভ নয়
		if ( $coupon->get_id()
			&& 'fixed_cart' === $coupon->get_discount_type()
			&& (float) $s['discount'] === (float) $coupon->get_amount() ) {
			return;
		}
		if ( ! $coupon->get_id() ) {
			$coupon->set_code( $code );
			$coupon->set_usage_limit_per_user( 1 );
		}
		$coupon->set_discount_type( 'fixed_cart' );
		$coupon->set_amount( (float) $s['discount'] );
		$coupon->save();
	} catch ( Exception $e ) {
		// কুপন তৈরি ব্যর্থ হলে সেটিংস পেজের স্ট্যাটাস বক্সে ধরা পড়বে
	}
}
register_activation_hook( __FILE__, 'zl_exit_ensure_coupon' );
add_action( 'add_option_' . ZL_EXIT_OPTION, 'zl_exit_ensure_coupon' );
add_action( 'update_option_' . ZL_EXIT_OPTION, 'zl_exit_ensure_coupon' );

/**
 * আনইন্সটল (Delete) করলে সেটিংস মুছে যায়। কুপনটি ইচ্ছাকৃতভাবে রাখা
 * হয় — পুরনো অর্ডারের হিসাবের সাথে জড়িত বলে সেটা মোছা নিরাপদ নয়;
 * দরকার হলে Marketing → Coupons থেকে ম্যানুয়ালি মুছবেন।
 */
function zl_exit_uninstall() {
	delete_option( ZL_EXIT_OPTION );
}
register_uninstall_hook( __FILE__, 'zl_exit_uninstall' );

add_action( 'admin_menu', function () {
	add_options_page( 'Exit Popup', 'Exit Popup', 'manage_options', 'zl-exit-popup', 'zl_exit_render_settings_page' );
} );

function zl_exit_render_settings_page() {
	$s = zl_exit_get_settings();

	// সেটিংস পেজ খোলা মাত্রই কুপন যাচাই-ও-তৈরি। শুধু হুকের ভরসায় থাকলে
	// দুটি ফাঁক থাকে: (ক) update_option অপরিবর্তিত মানে ফায়ার হয় না,
	// (খ) অ্যাক্টিভেশনের সময় WooCommerce নিষ্ক্রিয় থাকলে কুপন তৈরি হয় না।
	zl_exit_ensure_coupon();

	// স্ট্যাটাস যাচাই: কুপন আছে কি? WooCommerce-এ কুপন চালু আছে কি?
	$coupon_id       = function_exists( 'wc_get_coupon_id_by_code' ) ? wc_get_coupon_id_by_code( $s['coupon'] ) : 0;
	$coupon_amount   = 0;
	if ( $coupon_id && class_exists( 'WC_Coupon' ) ) {
		$c             = new WC_Coupon( $coupon_id );
		$coupon_amount = (float) $c->get_amount();
	}
	$coupons_enabled = 'yes' === get_option( 'woocommerce_enable_coupons' );
	?>
	<div class="wrap">
		<h1>Exit Intent Discount Popup</h1>

		<?php if ( ! $coupons_enabled ) : ?>
			<div class="notice notice-error"><p>
				<strong>সতর্কতা:</strong> WooCommerce-এ কুপন ব্যবহার বন্ধ করা আছে — ডিসকাউন্ট কাজ করবে না!
				চালু করতে যান: <strong>WooCommerce → Settings → General → "Enable the use of coupon codes"</strong> টিক দিয়ে সেভ করুন।
			</p></div>
		<?php endif; ?>

		<?php if ( $coupon_id ) : ?>
			<div class="notice notice-success"><p>
				✅ কুপন <strong><?php echo esc_html( $s['coupon'] ); ?></strong> WooCommerce-এ তৈরি আছে
				(ডিসকাউন্ট: ৳<?php echo esc_html( $coupon_amount ); ?>)। পপআপ থেকে এটিই অটো-অ্যাপ্লাই হবে।
			</p></div>
		<?php else : ?>
			<div class="notice notice-warning"><p>
				⚠️ কুপন <strong><?php echo esc_html( $s['coupon'] ); ?></strong> এখনো WooCommerce-এ নেই।
				নিচের <strong>Save Changes</strong> বাটনে একবার ক্লিক করুন — কুপনটি স্বয়ংক্রিয়ভাবে তৈরি হয়ে যাবে।
			</p></div>
		<?php endif; ?>

		<p>কুপন ম্যানুয়ালি বানাতে হবে না — সেটিংস সেভ করলেই প্লাগইন নিজে থেকে
			কুপনটি তৈরি/আপডেট করে দেয় (Fixed cart discount, Usage limit per user: 1)।</p>
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

			<h2 style="margin-top:2em">পপআপের লেখা</h2>
			<p class="description" style="font-size:14px">
				নিচের যেকোনো বক্সে নিজের ভাষায় লিখুন। <code>{discount}</code> লিখলে সেখানে
				ডিসকাউন্টের পরিমাণ (যেমন <strong>৳১০০ টাকা</strong>) নিজে থেকে বসে যাবে।
			</p>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="zl-txt-badge">উপরের ছোট ব্যাজ</label></th>
					<td><input id="zl-txt-badge" type="text" name="<?php echo esc_attr( ZL_EXIT_OPTION ); ?>[txt_badge]" value="<?php echo esc_attr( $s['txt_badge'] ); ?>" class="large-text"></td>
				</tr>
				<tr>
					<th scope="row"><label for="zl-txt-headline">বড় হেডলাইন</label></th>
					<td>
						<input id="zl-txt-headline" type="text" name="<?php echo esc_attr( ZL_EXIT_OPTION ); ?>[txt_headline]" value="<?php echo esc_attr( $s['txt_headline'] ); ?>" class="large-text">
						<p class="description"><code>{discount}</code> অংশটি লাল রঙে ডিসকাউন্টের পরিমাণ দেখাবে।</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="zl-txt-desc">বিবরণ (ছোট লেখা)</label></th>
					<td><textarea id="zl-txt-desc" name="<?php echo esc_attr( ZL_EXIT_OPTION ); ?>[txt_desc]" class="large-text" rows="2"><?php echo esc_textarea( $s['txt_desc'] ); ?></textarea></td>
				</tr>
				<tr>
					<th scope="row"><label for="zl-txt-timer">টাইমারের লেবেল</label></th>
					<td><input id="zl-txt-timer" type="text" name="<?php echo esc_attr( ZL_EXIT_OPTION ); ?>[txt_timer]" value="<?php echo esc_attr( $s['txt_timer'] ); ?>" class="large-text"></td>
				</tr>
				<tr>
					<th scope="row"><label for="zl-txt-cta">সবুজ বাটনের লেখা</label></th>
					<td><input id="zl-txt-cta" type="text" name="<?php echo esc_attr( ZL_EXIT_OPTION ); ?>[txt_cta]" value="<?php echo esc_attr( $s['txt_cta'] ); ?>" class="large-text"></td>
				</tr>
				<tr>
					<th scope="row"><label for="zl-txt-no">নিচের ছোট লিংক</label></th>
					<td><input id="zl-txt-no" type="text" name="<?php echo esc_attr( ZL_EXIT_OPTION ); ?>[txt_no]" value="<?php echo esc_attr( $s['txt_no'] ); ?>" class="large-text"></td>
				</tr>
				<tr>
					<th scope="row"><label for="zl-txt-applied">ডিসকাউন্ট নেওয়ার পর সবুজ বার্তা</label></th>
					<td>
						<textarea id="zl-txt-applied" name="<?php echo esc_attr( ZL_EXIT_OPTION ); ?>[txt_applied]" class="large-text" rows="2"><?php echo esc_textarea( $s['txt_applied'] ); ?></textarea>
						<p class="description">বাটন চাপার পর অর্ডার ফর্মের উপরে যে বার্তা দেখা যায়।</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
		<p><strong>টেস্ট করতে:</strong> ল্যান্ডিং পেজের URL-এর শেষে <code>?zl_exit_debug=1</code>
			যোগ করুন — আগের টেস্টের ব্লক মুছে যাবে এবং ব্রাউজার কনসোলে প্রতিটি ধাপের লগ দেখা যাবে।</p>
		<p><strong>⚠️ ক্যাশ প্লাগইন ব্যবহার করলে:</strong> সেটিংস (সময়, ডিসকাউন্ট, লেখা) বদলানোর
			পর ক্যাশ পরিষ্কার (Purge Cache) করুন — নইলে ভিজিটররা ক্যাশে জমে থাকা পুরনো
			সেটিংসের পপআপই দেখতে থাকবে।</p>
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
			'appliedText'      => $s['txt_applied'],
		)
	);
} );

add_action( 'wp_footer', function () {
	if ( ! zl_exit_should_load() ) {
		return;
	}
	$s = zl_exit_get_settings();

	// হেডলাইনের {discount} টোকেনকে লাল-রঙা span-এ বদলে দিই; span-টি
	// JavaScript "৳X টাকা" দিয়ে পূরণ করে। বাকি অংশ নিরাপদে esc_html।
	$parts    = explode( '{discount}', $s['txt_headline'] );
	$headline = esc_html( $parts[0] );
	if ( count( $parts ) > 1 ) {
		$headline .= '<span class="zl-exit-amount"></span>' . esc_html( implode( '{discount}', array_slice( $parts, 1 ) ) );
	}
	?>
	<div id="zl-exit-overlay" aria-hidden="true">
		<div class="zl-exit-popup" role="dialog" aria-modal="true" aria-labelledby="zl-exit-title">
			<button type="button" class="zl-exit-close" id="zl-exit-close" aria-label="বন্ধ করুন">&times;</button>
			<div class="zl-exit-badge"><?php echo esc_html( $s['txt_badge'] ); ?></div>
			<h2 id="zl-exit-title"><?php echo $headline; // phpcs:ignore WordPress.Security.EscapeOutput — উপরে esc_html করা হয়েছে ?></h2>
			<p><?php echo esc_html( $s['txt_desc'] ); ?></p>
			<div class="zl-exit-timer"><?php echo esc_html( $s['txt_timer'] ); ?> <span id="zl-exit-countdown">--:--</span></div>
			<button type="button" class="zl-exit-btn" id="zl-exit-cta"><?php echo esc_html( $s['txt_cta'] ); ?></button>
			<button type="button" class="zl-exit-no" id="zl-exit-no"><?php echo esc_html( $s['txt_no'] ); ?></button>
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

	// ব্যর্থ কুপনের এরর নোটিস মুছে দিই — নইলে পরে চেকআউটে ইংরেজি
	// এরর মেসেজ দেখা যেত
	if ( function_exists( 'wc_clear_notices' ) ) {
		wc_clear_notices();
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
		// সফল হলেই কেবল বাংলা সাকসেস নোটিস; ব্যর্থ হলে (যেমন minimum
		// spend পূরণ হয়নি) WooCommerce-এর নিজের এরর বার্তাই দেখা যাবে
		if ( WC()->cart->apply_coupon( $code ) ) {
			wc_add_notice(
				sprintf( 'অভিনন্দন! আপনার এক্সিট অফারের ডিসকাউন্ট (%s) যোগ হয়েছে।', esc_html( $code ) ),
				'success'
			);
		}
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
