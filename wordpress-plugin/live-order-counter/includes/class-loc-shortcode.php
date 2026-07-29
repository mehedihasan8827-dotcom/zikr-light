<?php
/**
 * Shortcode rendering and asset loading.
 *
 * @package LiveOrderCounter
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registers the [live_order_counter] shortcode.
 */
class LOC_Shortcode {

	/**
	 * Hook into WordPress.
	 */
	public static function init() {
		add_shortcode( 'live_order_counter', array( __CLASS__, 'render' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'register_assets' ) );
	}

	/**
	 * Register assets, and enqueue early when the shortcode is in the content.
	 *
	 * Enqueuing here keeps the stylesheet in the document head for pages that
	 * use the shortcode in post content. Anywhere else (widgets, page builders,
	 * template calls) the shortcode handler enqueues on demand instead.
	 */
	public static function register_assets() {
		wp_register_style( 'live-order-counter', LOC_URL . 'assets/loc.css', array(), LOC_VERSION );
		wp_register_script( 'live-order-counter', LOC_URL . 'assets/loc.js', array(), LOC_VERSION, true );

		wp_localize_script(
			'live-order-counter',
			'LOCConfig',
			array(
				'endpoint' => esc_url_raw( rest_url( 'live-order-counter/v1/count' ) ),
			)
		);

		$post = get_post();

		if ( $post instanceof WP_Post && has_shortcode( (string) $post->post_content, 'live_order_counter' ) ) {
			self::enqueue();
		}
	}

	/**
	 * Enqueue the badge assets.
	 */
	public static function enqueue() {
		wp_enqueue_style( 'live-order-counter' );
		wp_enqueue_script( 'live-order-counter' );
	}

	/**
	 * Render the badge.
	 *
	 * The server-rendered number is the first paint and the no-JavaScript
	 * fallback. It may be stale if a page cache is serving this HTML, so the
	 * script reconciles it against a fresh REST response on load.
	 *
	 * @param array|string $atts Shortcode attributes.
	 * @return string
	 */
	public static function render( $atts ) {
		self::enqueue();

		$settings = LOC_Curve::settings();

		$atts = shortcode_atts(
			array(
				'label' => $settings['label'],
				'class' => '',
			),
			is_array( $atts ) ? $atts : array(),
			'live_order_counter'
		);

		$payload   = LOC_Curve::payload();
		$bn_digits = (bool) $payload['bn_digits'];
		$formatted = LOC_Curve::format_number( $payload['count'], $bn_digits );

		$classes = trim( 'loc-badge ' . sanitize_html_class( $atts['class'] ) );

		ob_start();
		?>
		<span class="<?php echo esc_attr( $classes ); ?>" data-loc="<?php echo esc_attr( wp_json_encode( $payload ) ); ?>">
			<span class="loc-live">
				<span class="loc-dot" aria-hidden="true"></span><?php echo esc_html( $settings['live_text'] ); ?>
			</span>
			<span class="loc-text"><?php echo esc_html( $atts['label'] ); ?></span>
			<span class="loc-count">
				<span class="loc-num" data-v="<?php echo esc_attr( (string) $payload['count'] ); ?>"><?php echo esc_html( $formatted ); ?></span>
			</span>
		</span>
		<?php
		return trim( (string) ob_get_clean() );
	}
}
