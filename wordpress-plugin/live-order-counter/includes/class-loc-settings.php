<?php
/**
 * Admin settings screen.
 *
 * @package LiveOrderCounter
 */

defined( 'ABSPATH' ) || exit;

/**
 * Single options page under Settings.
 */
class LOC_Settings {

	const OPTION = 'loc_settings';
	const GROUP  = 'loc_settings_group';
	const PAGE   = 'live-order-counter';

	/**
	 * Hook into WordPress.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'add_page' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
	}

	/**
	 * Add the options page.
	 */
	public static function add_page() {
		add_options_page(
			__( 'Live Order Counter', 'live-order-counter' ),
			__( 'Live Order Counter', 'live-order-counter' ),
			'manage_options',
			self::PAGE,
			array( __CLASS__, 'render_page' )
		);
	}

	/**
	 * Register the settings field.
	 */
	public static function register() {
		register_setting(
			self::GROUP,
			self::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( __CLASS__, 'sanitize' ),
				'default'           => array(),
			)
		);
	}

	/**
	 * Sanitize submitted settings.
	 *
	 * @param mixed $input Raw input.
	 * @return array
	 */
	public static function sanitize( $input ) {
		$input = is_array( $input ) ? $input : array();
		$out   = array();

		$out['base_min']  = max( 0, min( 500, (int) ( $input['base_min'] ?? 3 ) ) );
		$out['base_max']  = max( $out['base_min'], min( 500, (int) ( $input['base_max'] ?? 4 ) ) );
		$out['total_min'] = max( $out['base_max'] + 1, min( 5000, (int) ( $input['total_min'] ?? 118 ) ) );
		$out['total_max'] = max( $out['total_min'], min( 5000, (int) ( $input['total_max'] ?? 138 ) ) );

		$out['label']     = sanitize_text_field( (string) ( $input['label'] ?? '' ) );
		$out['live_text'] = sanitize_text_field( (string) ( $input['live_text'] ?? 'LIVE' ) );
		$out['bn_digits'] = empty( $input['bn_digits'] ) ? 0 : 1;

		$weights = array();
		$raw     = (string) ( $input['weights'] ?? '' );
		$parts   = array_filter( array_map( 'trim', explode( ',', $raw ) ), 'strlen' );

		if ( 24 === count( $parts ) ) {
			foreach ( $parts as $part ) {
				$weights[] = max( 0.0, round( (float) $part, 4 ) );
			}
		}

		// Reject a partial or malformed list rather than silently distorting the
		// day's shape: fall back to the built-in profile instead.
		if ( array_sum( $weights ) <= 0 ) {
			$weights = LOC_Curve::DEFAULT_WEIGHTS;
		}

		$out['weights'] = $weights;

		return $out;
	}

	/**
	 * Render the options page.
	 */
	public static function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$settings = LOC_Curve::settings();
		$weights  = is_array( $settings['weights'] ) ? $settings['weights'] : LOC_Curve::DEFAULT_WEIGHTS;
		$now      = LOC_Curve::now();
		$profile  = LOC_Curve::profile( $now );
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Live Order Counter', 'live-order-counter' ); ?></h1>

			<p>
				<?php esc_html_e( 'Place the badge with this shortcode:', 'live-order-counter' ); ?>
				<code>[live_order_counter]</code>
			</p>

			<p>
				<?php
				printf(
					/* translators: 1: current count, 2: end-of-day total, 3: site timezone */
					esc_html__( 'Right now the curve reads %1$s, heading for %2$s by 11:59 PM (%3$s).', 'live-order-counter' ),
					'<strong>' . esc_html( (string) LOC_Curve::count_at( $profile, LOC_Curve::seconds_of_day( $now ) ) ) . '</strong>',
					'<strong>' . esc_html( (string) $profile['total'] ) . '</strong>',
					esc_html( wp_timezone_string() )
				);
				?>
			</p>

			<form method="post" action="options.php">
				<?php settings_fields( self::GROUP ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="loc-label"><?php esc_html_e( 'Badge text', 'live-order-counter' ); ?></label></th>
						<td>
							<input name="<?php echo esc_attr( self::OPTION ); ?>[label]" id="loc-label" type="text" class="regular-text" value="<?php echo esc_attr( $settings['label'] ); ?>" />
							<p class="description"><?php esc_html_e( 'Shown to the left of the number.', 'live-order-counter' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="loc-live-text"><?php esc_html_e( 'Live label', 'live-order-counter' ); ?></label></th>
						<td>
							<input name="<?php echo esc_attr( self::OPTION ); ?>[live_text]" id="loc-live-text" type="text" class="small-text" value="<?php echo esc_attr( $settings['live_text'] ); ?>" />
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Numerals', 'live-order-counter' ); ?></th>
						<td>
							<label>
								<input name="<?php echo esc_attr( self::OPTION ); ?>[bn_digits]" type="checkbox" value="1" <?php checked( (int) $settings['bn_digits'], 1 ); ?> />
								<?php esc_html_e( 'Show the count in Bengali digits (৪৮ instead of 48)', 'live-order-counter' ); ?>
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Starting count', 'live-order-counter' ); ?></th>
						<td>
							<input name="<?php echo esc_attr( self::OPTION ); ?>[base_min]" type="number" min="0" class="small-text" value="<?php echo esc_attr( (string) $settings['base_min'] ); ?>" />
							&ndash;
							<input name="<?php echo esc_attr( self::OPTION ); ?>[base_max]" type="number" min="0" class="small-text" value="<?php echo esc_attr( (string) $settings['base_max'] ); ?>" />
							<p class="description"><?php esc_html_e( 'The count just after midnight. One value from this range is picked per day.', 'live-order-counter' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'End-of-day total', 'live-order-counter' ); ?></th>
						<td>
							<input name="<?php echo esc_attr( self::OPTION ); ?>[total_min]" type="number" min="1" class="small-text" value="<?php echo esc_attr( (string) $settings['total_min'] ); ?>" />
							&ndash;
							<input name="<?php echo esc_attr( self::OPTION ); ?>[total_max]" type="number" min="1" class="small-text" value="<?php echo esc_attr( (string) $settings['total_max'] ); ?>" />
							<p class="description"><?php esc_html_e( 'Where the count lands at 11:59 PM. Varying the range keeps days from looking identical.', 'live-order-counter' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="loc-weights"><?php esc_html_e( 'Hourly shape', 'live-order-counter' ); ?></label></th>
						<td>
							<textarea name="<?php echo esc_attr( self::OPTION ); ?>[weights]" id="loc-weights" rows="3" class="large-text code"><?php echo esc_textarea( implode( ', ', array_map( 'floatval', $weights ) ) ); ?></textarea>
							<p class="description">
								<?php esc_html_e( 'Twenty-four comma-separated numbers, midnight first, giving each hour its relative share of the day. They are shares, not counts, so only their proportions matter. Anything other than 24 valid numbers falls back to the built-in shape.', 'live-order-counter' ); ?>
							</p>
						</td>
					</tr>
				</table>
				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}
}
