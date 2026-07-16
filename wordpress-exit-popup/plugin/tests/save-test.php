<?php
/**
 * সেটিংস সেভ-পাইপলাইনের যাচাই: প্লাগইনের আসল ফাইল লোড করে
 * WordPress-এর options.php যা করে ঠিক তা-ই করা হয় —
 * ফর্ম-ডেটা → sanitize কলব্যাক → অপশন সেভ → আবার পড়া।
 */

define( 'ABSPATH', '/tmp/' );

/* ---- WordPress ফাংশনের মিনি-সংস্করণ (আচরণ WP-র মতোই) ---- */
$GLOBALS['__options'] = array(); // ডাটাবেজের নকল
function get_option( $k, $d = false ) { return isset( $GLOBALS['__options'][ $k ] ) ? $GLOBALS['__options'][ $k ] : $d; }
function update_option( $k, $v ) {
	$old = get_option( $k );
	if ( $old === $v ) { return false; } // WP-র নিয়ম: একই মান হলে সেভ হয় না
	$GLOBALS['__options'][ $k ] = $v;
	return true;
}
function wp_parse_args( $args, $defaults ) { return array_merge( $defaults, (array) $args ); }
function sanitize_text_field( $s ) { return trim( preg_replace( '/[\r\n\t ]+/', ' ', strip_tags( (string) $s ) ) ); }
function sanitize_textarea_field( $s ) { return trim( strip_tags( (string) $s ) ); }
function absint( $n ) { return abs( (int) $n ); }
function wp_unslash( $v ) { return $v; }
function esc_html( $s ) { return $s; }
// প্লাগইন লোডের সময় ডাকা হুক-ফাংশনগুলো: নো-অপ
function add_action() {} function add_filter() {}
function register_activation_hook() {} function register_uninstall_hook() {}
function plugins_url() { return ''; }

require '/home/user/zikr-light/wordpress-exit-popup/plugin/zl-exit-popup/zl-exit-popup.php';

/* ---- দৃশ্য: অ্যাডমিন আগে ডিফল্ট সেটিংস সেভ করেছিলেন ---- */
update_option( ZL_EXIT_OPTION, zl_exit_sanitize_settings( zl_exit_default_settings() ) );
$before = zl_exit_get_settings();

/* ---- এখন ফর্মে ৪টা জিনিস বদলে Save Changes (options.php যা করে) ---- */
$form_post = array(
	// আপনি যেমন করেন: সময় ৪৫→১০, ডিসকাউন্ট ১০০→৫০, হেডলাইন বদল, স্ক্রল-ট্রিগার চালু
	'enabled'         => '1',
	'discount'        => '50',
	'coupon'          => 'EXIT100',
	'min_seconds'     => '10',
	'offer_minutes'   => '15',
	'frequency_hours' => '24',
	'page_ids'        => '',
	'form_selector'   => '#order-form, form.woocommerce-checkout, .cartflows-container',
	'txt_badge'       => '🎁 শুধু আপনার জন্য বিশেষ অফার',
	'txt_headline'    => 'যাবেন না! {discount} ছাড় নিন!',
	'txt_desc'        => 'ডিসকাউন্টটি মূল দাম থেকে সরাসরি কেটে যাবে — কোনো কুপন কোড টাইপ করতে হবে না।',
	'txt_timer'       => '⏳ অফার শেষ হতে বাকি:',
	'txt_cta'         => 'ডিসকাউন্ট নিয়ে অর্ডার করুন ➜',
	'txt_no'          => 'না ধন্যবাদ, আমি পুরো দাম দিতে চাই',
	'txt_applied'     => '🎉 অভিনন্দন! আপনার {discount} ডিসকাউন্ট যোগ হয়েছে — নিচের ফর্মটি পূরণ করে অর্ডার সম্পন্ন করুন।',
	'trigger_scroll'  => '1',
);
// options.php: sanitize কলব্যাক চালিয়ে update_option
$saved = update_option( ZL_EXIT_OPTION, zl_exit_sanitize_settings( $form_post ) );

/* ---- সেটিংস পেজ রিলোড: আবার পড়া ---- */
$after = zl_exit_get_settings();

function check( $name, $ok, $detail = '' ) {
	echo ( $ok ? 'PASS' : 'FAIL' ) . '  ' . $name . ( $detail ? "  [$detail]" : '' ) . "\n";
	if ( ! $ok ) { $GLOBALS['fail'] = true; }
}

check( 'update_option সেভ করেছে (true ফেরত)', true === $saved );
check( 'সময় ৪৫ → ১০ হয়েছে', 10 === $after['min_seconds'], $before['min_seconds'] . '→' . $after['min_seconds'] );
check( 'ডিসকাউন্ট ১০০ → ৫০ হয়েছে', 50 === $after['discount'], $before['discount'] . '→' . $after['discount'] );
check( 'হেডলাইন বদলেছে', 'যাবেন না! {discount} ছাড় নিন!' === $after['txt_headline'] );
check( 'স্ক্রল-ট্রিগার ০ → ১ হয়েছে', 1 === $after['trigger_scroll'], $before['trigger_scroll'] . '→' . $after['trigger_scroll'] );
check( 'saved_at টাইমস্ট্যাম্প বসেছে', $after['saved_at'] >= time() - 5 );

/* ---- আনচেক-করা চেকবক্স (enabled বন্ধ): ফর্মে ফিল্ডই আসে না ---- */
unset( $form_post['enabled'], $form_post['trigger_scroll'] );
update_option( ZL_EXIT_OPTION, zl_exit_sanitize_settings( $form_post ) );
$after2 = zl_exit_get_settings();
check( 'চেকবক্স আনচেক করলে ০ সেভ হয়', 0 === $after2['enabled'] && 0 === $after2['trigger_scroll'] );

/* ---- ডাবল-sanitize (WP-র পরিচিত আচরণ): মান নষ্ট হয় না ---- */
$twice = zl_exit_sanitize_settings( zl_exit_sanitize_settings( $form_post ) );
check( 'দুইবার sanitize হলেও মান একই থাকে', 10 === $twice['min_seconds'] && 50 === $twice['discount'] );

/* ---- v1.7.0: ফায়ারওয়াল কিছু ফিল্ড ফেলে দিলে আগের মান টেকে (ডিফল্ট নয়) ---- */
// আগে discount=50, headline বদলানো সেভ করি
update_option( ZL_EXIT_OPTION, zl_exit_sanitize_settings( $form_post ) );
// এখন এমন একটা POST যেখানে txt_headline ও discount ফিল্ড ফায়ারওয়াল ফেলে দিয়েছে
$stripped = $form_post;
unset( $stripped['txt_headline'], $stripped['discount'] );
update_option( ZL_EXIT_OPTION, zl_exit_sanitize_settings( $stripped ) );
$after3 = zl_exit_get_settings();
check( 'ফিল্ড স্ট্রিপড হলে discount আগের মান (৫০) টেকে, ডিফল্ট ১০০ নয়', 50 === $after3['discount'], (string) $after3['discount'] );
check( 'ফিল্ড স্ট্রিপড হলে হেডলাইন আগের মান টেকে, ডিফল্ট নয়', 'যাবেন না! {discount} ছাড় নিন!' === $after3['txt_headline'] );

/* ---- v1.9.0: আদর্শ Settings API পথে discount ঠিক ৫০ থাকে (৪৯ নয়) ---- */
$post50 = $form_post;
$post50['discount'] = '50';
update_option( ZL_EXIT_OPTION, zl_exit_sanitize_settings( $post50 ) );
$d50 = zl_exit_get_settings();
check( 'discount 50 দিলে ঠিক 50 থাকে (49 নয়)', 50 === $d50['discount'], (string) $d50['discount'] );
check( 'discount টাইপ integer', is_int( $d50['discount'] ) );

echo empty( $GLOBALS['fail'] ) ? "\n===== সব পাস: সেভ-পাইপলাইনে কোনো বাগ নেই =====\n" : "\n===== বাগ পাওয়া গেছে! =====\n";
