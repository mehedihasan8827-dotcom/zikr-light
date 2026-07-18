<?php
/**
 * RescueCart admin settings screen.
 *
 * Registered as a WooCommerce submenu. Uses the WordPress Settings API with
 * a single option array (`rescuecart_settings`) and a strict sanitizer.
 *
 * @package RescueCart
 */

defined( 'ABSPATH' ) || exit;

/**
 * Admin UI controller.
 */
final class RescueCart_Admin {

	const PAGE_SLUG = 'rescuecart';

	/** @var RescueCart_Admin|null */
	private static $instance = null;

	/** @return RescueCart_Admin */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
	}

	/** Add the settings page under WooCommerce (falls back to Settings if WC is absent). */
	public function register_menu() {
		$parent = class_exists( 'WooCommerce' ) ? 'woocommerce' : 'options-general.php';

		add_submenu_page(
			$parent,
			__( 'RescueCart', 'rescuecart' ),
			__( 'RescueCart', 'rescuecart' ),
			'manage_woocommerce',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	/** Register the option, sections and fields. */
	public function register_settings() {
		register_setting(
			'rescuecart',
			'rescuecart_settings',
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize' ),
				'default'           => rescuecart_default_settings(),
			)
		);

		// --- Section: General offer -------------------------------------
		add_settings_section(
			'rescuecart_offer',
			__( 'Offer', 'rescuecart' ),
			function () {
				echo '<p>' . esc_html__( 'What the popup offers and how long the claimed coupon stays valid.', 'rescuecart' ) . '</p>';
			},
			self::PAGE_SLUG
		);

		$this->add_field( 'enabled', __( 'Enable RescueCart', 'rescuecart' ), 'checkbox', 'rescuecart_offer', array(
			'help' => __( 'Master switch. When off, no assets load and no endpoints accept claims.', 'rescuecart' ),
		) );
		$this->add_field( 'discount_type', __( 'Discount type', 'rescuecart' ), 'select', 'rescuecart_offer', array(
			'options' => array(
				'fixed_cart' => __( 'Fixed amount (store currency)', 'rescuecart' ),
				'percent'    => __( 'Percentage (%)', 'rescuecart' ),
			),
		) );
		$this->add_field( 'discount_amount', __( 'Discount amount', 'rescuecart' ), 'number', 'rescuecart_offer', array(
			'min'  => 0.01,
			'step' => '0.01',
			'help' => __( 'Amount in store currency, or the percentage value when type is Percentage.', 'rescuecart' ),
		) );
		$this->add_field( 'coupon_expiry_minutes', __( 'Coupon expiry (minutes)', 'rescuecart' ), 'number', 'rescuecart_offer', array(
			'min'  => 1,
			'step' => '1',
			'help' => __( 'The claimed coupon (and the popup countdown) expires after this many minutes. Default: 15.', 'rescuecart' ),
		) );
		$this->add_field( 'cooldown_hours', __( 'Popup cooldown (hours)', 'rescuecart' ), 'number', 'rescuecart_offer', array(
			'min'  => 0,
			'step' => '1',
			'help' => __( 'After seeing or dismissing the popup, a visitor will not see it again for this many hours. 0 = once per browser session only. Default: 24.', 'rescuecart' ),
		) );
		$this->add_field( 'allow_stacking', __( 'Allow stacking with other coupons', 'rescuecart' ), 'checkbox', 'rescuecart_offer', array(
			'help' => __( 'When off (recommended), the RescueCart coupon is marked “individual use only”.', 'rescuecart' ),
		) );

		// --- Section: Popup content -------------------------------------
		add_settings_section(
			'rescuecart_content',
			__( 'Popup content', 'rescuecart' ),
			function () {
				echo '<p>' . esc_html__( 'Use the {discount} token anywhere — it is replaced with the formatted discount (e.g. ৳50 or 10%).', 'rescuecart' ) . '</p>';
			},
			self::PAGE_SLUG
		);

		$this->add_field( 'popup_title', __( 'Title', 'rescuecart' ), 'text', 'rescuecart_content' );
		$this->add_field( 'popup_message', __( 'Message', 'rescuecart' ), 'textarea', 'rescuecart_content' );
		$this->add_field( 'popup_button', __( 'Claim button label', 'rescuecart' ), 'text', 'rescuecart_content' );
		$this->add_field( 'popup_dismiss', __( 'Dismiss link label', 'rescuecart' ), 'text', 'rescuecart_content' );
		$this->add_field( 'applied_message', __( 'Applied confirmation bar', 'rescuecart' ), 'text', 'rescuecart_content' );

		// --- Section: Triggers & targeting ------------------------------
		add_settings_section(
			'rescuecart_triggers',
			__( 'Triggers & targeting', 'rescuecart' ),
			function () {
				echo '<p>' . esc_html__( 'RescueCart automatically runs on the WooCommerce checkout and every CartFlows step.', 'rescuecart' ) . '</p>';
			},
			self::PAGE_SLUG
		);

		$this->add_field( 'sensitivity', __( 'Trigger sensitivity', 'rescuecart' ), 'select', 'rescuecart_triggers', array(
			'options' => array(
				'low'        => __( 'Low — fire only on very strong exit intent', 'rescuecart' ),
				'balanced'   => __( 'Balanced (recommended)', 'rescuecart' ),
				'aggressive' => __( 'Aggressive — fire early, maximize impressions', 'rescuecart' ),
			),
			'help'    => __( 'Controls the intent-score threshold and all signal thresholds (dwell, scroll depth, up-scroll velocity, idle).', 'rescuecart' ),
		) );
		$this->add_field( 'extra_page_ids', __( 'Additional page IDs', 'rescuecart' ), 'text', 'rescuecart_triggers', array(
			'help' => __( 'Comma-separated page IDs to also run on (e.g. Elementor landing pages): 12, 34, 56', 'rescuecart' ),
		) );

		// --- Section: Tracking ------------------------------------------
		add_settings_section(
			'rescuecart_tracking',
			__( 'Tracking', 'rescuecart' ),
			'__return_null',
			self::PAGE_SLUG
		);

		$this->add_field( 'pixel_event', __( 'Facebook Pixel event on claim', 'rescuecart' ), 'checkbox', 'rescuecart_tracking', array(
			'help' => __( 'Fires the custom event “RescueCartOfferClaimed” via fbq() when the visitor claims the offer (only if a Pixel is already installed on the site).', 'rescuecart' ),
		) );
	}

	/**
	 * Register one field with a shared renderer.
	 *
	 * @param string $key     Settings array key.
	 * @param string $label   Field label.
	 * @param string $type    text|textarea|number|checkbox|select.
	 * @param string $section Section ID.
	 * @param array  $args    Extra renderer args (options, min, step, help).
	 */
	private function add_field( $key, $label, $type, $section, $args = array() ) {
		add_settings_field(
			'rescuecart_' . $key,
			$label,
			array( $this, 'render_field' ),
			self::PAGE_SLUG,
			$section,
			array_merge( $args, array(
				'key'       => $key,
				'type'      => $type,
				'label_for' => 'rescuecart_' . $key,
			) )
		);
	}

	/**
	 * Shared field renderer.
	 *
	 * @param array $args Field args from add_field().
	 */
	public function render_field( $args ) {
		$settings = rescuecart_get_settings();
		$key      = $args['key'];
		$id       = 'rescuecart_' . $key;
		$name     = 'rescuecart_settings[' . $key . ']';
		$value    = isset( $settings[ $key ] ) ? $settings[ $key ] : '';

		switch ( $args['type'] ) {
			case 'checkbox':
				printf(
					'<label><input type="checkbox" id="%1$s" name="%2$s" value="yes" %3$s> %4$s</label>',
					esc_attr( $id ),
					esc_attr( $name ),
					checked( 'yes', $value, false ),
					esc_html__( 'Enabled', 'rescuecart' )
				);
				break;

			case 'select':
				printf( '<select id="%1$s" name="%2$s">', esc_attr( $id ), esc_attr( $name ) );
				foreach ( $args['options'] as $opt_value => $opt_label ) {
					printf(
						'<option value="%1$s" %2$s>%3$s</option>',
						esc_attr( $opt_value ),
						selected( $opt_value, $value, false ),
						esc_html( $opt_label )
					);
				}
				echo '</select>';
				break;

			case 'number':
				printf(
					'<input type="number" class="small-text" id="%1$s" name="%2$s" value="%3$s" min="%4$s" step="%5$s">',
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( $value ),
					esc_attr( isset( $args['min'] ) ? $args['min'] : 0 ),
					esc_attr( isset( $args['step'] ) ? $args['step'] : '1' )
				);
				break;

			case 'textarea':
				printf(
					'<textarea class="large-text" rows="3" id="%1$s" name="%2$s">%3$s</textarea>',
					esc_attr( $id ),
					esc_attr( $name ),
					esc_textarea( $value )
				);
				break;

			default: // text.
				printf(
					'<input type="text" class="regular-text" id="%1$s" name="%2$s" value="%3$s">',
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( $value )
				);
		}

		if ( ! empty( $args['help'] ) ) {
			printf( '<p class="description">%s</p>', esc_html( $args['help'] ) );
		}
	}

	/**
	 * Sanitize the whole settings array. Unknown keys are dropped; every
	 * known key is coerced to a safe value or falls back to its default.
	 *
	 * @param mixed $input Raw POSTed option value.
	 * @return array Clean settings.
	 */
	public function sanitize( $input ) {
		$defaults = rescuecart_default_settings();
		$input    = is_array( $input ) ? $input : array();
		$clean    = array();

		foreach ( array( 'enabled', 'allow_stacking', 'pixel_event' ) as $bool_key ) {
			$clean[ $bool_key ] = ( isset( $input[ $bool_key ] ) && 'yes' === $input[ $bool_key ] ) ? 'yes' : 'no';
		}

		$clean['discount_type'] = ( isset( $input['discount_type'] ) && 'percent' === $input['discount_type'] ) ? 'percent' : 'fixed_cart';

		$amount = isset( $input['discount_amount'] ) ? (float) $input['discount_amount'] : $defaults['discount_amount'];
		if ( $amount <= 0 ) {
			$amount = $defaults['discount_amount'];
		}
		if ( 'percent' === $clean['discount_type'] ) {
			$amount = min( $amount, 100 );
		}
		$clean['discount_amount'] = $amount;

		$expiry                         = isset( $input['coupon_expiry_minutes'] ) ? absint( $input['coupon_expiry_minutes'] ) : $defaults['coupon_expiry_minutes'];
		$clean['coupon_expiry_minutes'] = max( 1, $expiry );

		$clean['cooldown_hours'] = isset( $input['cooldown_hours'] ) ? absint( $input['cooldown_hours'] ) : $defaults['cooldown_hours'];

		$sensitivities        = array( 'low', 'balanced', 'aggressive' );
		$clean['sensitivity'] = ( isset( $input['sensitivity'] ) && in_array( $input['sensitivity'], $sensitivities, true ) )
			? $input['sensitivity']
			: $defaults['sensitivity'];

		$page_ids                = isset( $input['extra_page_ids'] ) ? (string) $input['extra_page_ids'] : '';
		$page_ids                = array_filter( array_map( 'absint', explode( ',', $page_ids ) ) );
		$clean['extra_page_ids'] = implode( ',', $page_ids );

		foreach ( array( 'popup_title', 'popup_button', 'popup_dismiss', 'applied_message' ) as $text_key ) {
			$text               = isset( $input[ $text_key ] ) ? sanitize_text_field( $input[ $text_key ] ) : '';
			$clean[ $text_key ] = ( '' !== $text ) ? $text : $defaults[ $text_key ];
		}

		$message                = isset( $input['popup_message'] ) ? sanitize_textarea_field( $input['popup_message'] ) : '';
		$clean['popup_message'] = ( '' !== $message ) ? $message : $defaults['popup_message'];

		return $clean;
	}

	/** Render the full settings page: health checks, stats, form. */
	public function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'rescuecart' ) );
		}

		$stats       = get_option( 'rescuecart_stats', array() );
		$impressions = isset( $stats['impressions'] ) ? (int) $stats['impressions'] : 0;
		$claims      = isset( $stats['claims'] ) ? (int) $stats['claims'] : 0;
		$conversions = isset( $stats['conversions'] ) ? (int) $stats['conversions'] : 0;
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'RescueCart — Exit-Intent Checkout Rescue', 'rescuecart' ); ?></h1>

			<?php $this->render_health_notices(); ?>

			<h2><?php esc_html_e( 'Performance', 'rescuecart' ); ?></h2>
			<table class="widefat striped" style="max-width:640px">
				<thead>
					<tr>
						<th><?php esc_html_e( 'Popup impressions', 'rescuecart' ); ?></th>
						<th><?php esc_html_e( 'Offers claimed', 'rescuecart' ); ?></th>
						<th><?php esc_html_e( 'Rescued orders', 'rescuecart' ); ?></th>
						<th><?php esc_html_e( 'Claim rate', 'rescuecart' ); ?></th>
						<th><?php esc_html_e( 'Rescue rate', 'rescuecart' ); ?></th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td><?php echo esc_html( number_format_i18n( $impressions ) ); ?></td>
						<td><?php echo esc_html( number_format_i18n( $claims ) ); ?></td>
						<td><?php echo esc_html( number_format_i18n( $conversions ) ); ?></td>
						<td><?php echo esc_html( $impressions > 0 ? round( 100 * $claims / $impressions, 1 ) . '%' : '—' ); ?></td>
						<td><?php echo esc_html( $claims > 0 ? round( 100 * $conversions / $claims, 1 ) . '%' : '—' ); ?></td>
					</tr>
				</tbody>
			</table>

			<form method="post" action="options.php">
				<?php
				settings_fields( 'rescuecart' );
				do_settings_sections( self::PAGE_SLUG );
				submit_button();
				?>
			</form>
		</div>
		<?php
	}

	/** Environment checks surfaced to the store owner. */
	private function render_health_notices() {
		if ( ! class_exists( 'WooCommerce' ) ) {
			echo '<div class="notice notice-error inline"><p>' .
				esc_html__( 'WooCommerce is not active — RescueCart cannot run.', 'rescuecart' ) .
				'</p></div>';
			return;
		}

		if ( 'yes' !== get_option( 'woocommerce_enable_coupons' ) ) {
			echo '<div class="notice notice-error inline"><p>' .
				esc_html__( 'WooCommerce coupons are disabled (WooCommerce → Settings → General → “Enable the use of coupon codes”). RescueCart cannot apply discounts until they are enabled.', 'rescuecart' ) .
				'</p></div>';
		}

		if ( ! defined( 'CARTFLOWS_VER' ) ) {
			echo '<div class="notice notice-info inline"><p>' .
				esc_html__( 'CartFlows was not detected. RescueCart still works on the standard WooCommerce checkout.', 'rescuecart' ) .
				'</p></div>';
		}
	}
}
