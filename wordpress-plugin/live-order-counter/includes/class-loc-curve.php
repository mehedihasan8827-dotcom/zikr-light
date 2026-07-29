<?php
/**
 * Deterministic order-count curve.
 *
 * The displayed count is a pure function of the current site-local time. Every
 * visitor loading the page in the same second computes the same number, so the
 * plugin needs no database table, no cron job and no midnight reset task: at
 * 00:00:00 the input to the curve returns to zero and so does the output.
 *
 * @package LiveOrderCounter
 */

defined( 'ABSPATH' ) || exit;

/**
 * Builds and evaluates the daily order curve.
 */
class LOC_Curve {

	/**
	 * Relative order volume per hour, index 0 = midnight.
	 *
	 * Shaped for a Bangladeshi food landing page: dead overnight, a mid-morning
	 * ramp, a lunch bump, and a heavy evening peak between 7pm and 10pm. These
	 * are relative shares, not counts, so the shape is independent of the daily
	 * total.
	 */
	const DEFAULT_WEIGHTS = array(
		1.0, 0.5, 0.3, 0.3, 0.5, 1.0, 1.5, 2.0,
		3.0, 4.5, 6.0, 6.5, 6.0, 5.0, 4.5, 5.0,
		6.0, 6.5, 7.0, 8.0, 9.0, 8.5, 6.0, 3.0,
	);

	/**
	 * Highest number of orders the display may run ahead of the global curve.
	 *
	 * This is what keeps repeat visits from compounding: a session may show at
	 * most this many simulated orders beyond what the clock alone justifies, so
	 * a visitor who reloads twenty times cannot inflate the counter past it.
	 */
	const LEAD_CAP = 3;

	/**
	 * Cached profile for the current request, keyed by date.
	 *
	 * @var array<string, array>
	 */
	protected static $profiles = array();

	/**
	 * Plugin settings merged over defaults.
	 *
	 * @return array
	 */
	public static function settings() {
		$defaults = array(
			'base_min'     => 3,
			'base_max'     => 4,
			'total_min'    => 118,
			'total_max'    => 138,
			'label'        => 'আজকের আমসত্ত্বের মোট অর্ডার:',
			'live_text'    => 'LIVE',
			'bn_digits'    => 1,
			'weights'      => self::DEFAULT_WEIGHTS,
		);

		$saved = get_option( LOC_Settings::OPTION, array() );

		return wp_parse_args( is_array( $saved ) ? $saved : array(), $defaults );
	}

	/**
	 * Current time in the site's configured timezone.
	 *
	 * @return DateTimeImmutable
	 */
	public static function now() {
		return new DateTimeImmutable( 'now', wp_timezone() );
	}

	/**
	 * Seconds elapsed since site-local midnight.
	 *
	 * @param DateTimeImmutable $now Reference time.
	 * @return int Seconds in the range 0..86399.
	 */
	public static function seconds_of_day( DateTimeImmutable $now ) {
		$midnight = $now->setTime( 0, 0, 0 );

		return max( 0, $now->getTimestamp() - $midnight->getTimestamp() );
	}

	/**
	 * Advance a 32-bit linear congruential generator.
	 *
	 * Deliberately simple and portable so the sequence is reproducible: the same
	 * date always yields the same day, for every visitor, on every server.
	 *
	 * @param int $state Generator state, passed by reference.
	 * @return float Value in the half-open range [0, 1).
	 */
	protected static function rand( &$state ) {
		$state = ( $state * 1664525 + 1013904223 ) & 0xFFFFFFFF;

		return $state / 4294967296;
	}

	/**
	 * Pick a deterministic integer in an inclusive range.
	 *
	 * @param int $state Generator state, passed by reference.
	 * @param int $min   Lower bound.
	 * @param int $max   Upper bound.
	 * @return int
	 */
	protected static function rand_int( &$state, $min, $max ) {
		if ( $max <= $min ) {
			return (int) $min;
		}

		return (int) $min + (int) floor( self::rand( $state ) * ( $max - $min + 1 ) );
	}

	/**
	 * Build the curve parameters for a given day.
	 *
	 * The result is stable for the whole calendar day and identical for every
	 * visitor, but differs from one day to the next so the counter does not
	 * repeat the exact same numbers at the exact same times forever.
	 *
	 * @param DateTimeImmutable $now Reference time.
	 * @return array {
	 *     @type string             $date    Site-local date, Y-m-d.
	 *     @type int                $base    Count at midnight.
	 *     @type int                $total   Count at end of day.
	 *     @type array<int, float>  $weights Per-hour weights after jitter.
	 *     @type array<int, float>  $prefix  Cumulative weights, 25 entries.
	 *     @type float              $sum     Total weight.
	 * }
	 */
	public static function profile( DateTimeImmutable $now ) {
		$date = $now->format( 'Y-m-d' );

		if ( isset( self::$profiles[ $date ] ) ) {
			return self::$profiles[ $date ];
		}

		$settings = self::settings();
		$state    = crc32( 'live-order-counter|' . $date ) & 0xFFFFFFFF;

		$base  = self::rand_int( $state, (int) $settings['base_min'], (int) $settings['base_max'] );
		$total = self::rand_int( $state, (int) $settings['total_min'], (int) $settings['total_max'] );

		if ( $total <= $base ) {
			$total = $base + 1;
		}

		// Jitter each hour's share by up to +/-20% so the daily shape shifts a
		// little. Weights stay non-negative, which is what guarantees the
		// cumulative curve is monotonically increasing.
		$weights = array();
		$source  = is_array( $settings['weights'] ) ? array_values( $settings['weights'] ) : self::DEFAULT_WEIGHTS;

		for ( $hour = 0; $hour < 24; $hour++ ) {
			$weight    = isset( $source[ $hour ] ) ? (float) $source[ $hour ] : 0.0;
			$weight    = max( 0.0, $weight );
			$factor    = 0.8 + ( self::rand( $state ) * 0.4 );
			$weights[] = round( $weight * $factor, 4 );
		}

		$prefix = array( 0.0 );
		$run    = 0.0;

		foreach ( $weights as $weight ) {
			$run     += $weight;
			$prefix[] = round( $run, 4 );
		}

		$profile = array(
			'date'    => $date,
			'base'    => $base,
			'total'   => $total,
			'weights' => $weights,
			'prefix'  => $prefix,
			'sum'     => $run > 0 ? $run : 1.0,
		);

		self::$profiles[ $date ] = $profile;

		return $profile;
	}

	/**
	 * Evaluate the curve at a point in the day.
	 *
	 * @param array $profile Day profile from profile().
	 * @param int   $seconds Seconds since site-local midnight.
	 * @return int Order count.
	 */
	public static function count_at( array $profile, $seconds ) {
		$seconds = min( 86399, max( 0, (int) $seconds ) );
		$hours   = $seconds / 3600;
		$hour    = (int) floor( $hours );
		$part    = $hours - $hour;

		$cumulative = $profile['prefix'][ $hour ] + ( $profile['weights'][ $hour ] * $part );
		$progress   = $cumulative / $profile['sum'];

		$count = $profile['base'] + (int) round( ( $profile['total'] - $profile['base'] ) * $progress );

		/**
		 * Filter the computed order count.
		 *
		 * Return a real figure here (a WooCommerce order count for today, for
		 * example) to drive the badge from live data instead of the simulated
		 * curve. The display layer is unchanged either way.
		 *
		 * @param int   $count   Simulated count.
		 * @param array $profile Day profile.
		 * @param int   $seconds Seconds since site-local midnight.
		 */
		return (int) apply_filters( 'loc_count', $count, $profile, $seconds );
	}

	/**
	 * Everything the front end needs to run the counter locally.
	 *
	 * The client receives the curve parameters and its position in the day, then
	 * ticks forward using elapsed time only. It never uses the device clock to
	 * establish the absolute time of day, so a visitor with a badly set clock
	 * still sees the correct number.
	 *
	 * @return array
	 */
	public static function payload() {
		$settings = self::settings();
		$now      = self::now();
		$profile  = self::profile( $now );
		$seconds  = self::seconds_of_day( $now );

		return array(
			'date'      => $profile['date'],
			'seconds'   => $seconds,
			'count'     => self::count_at( $profile, $seconds ),
			'base'      => $profile['base'],
			'total'     => $profile['total'],
			'weights'   => array_map( 'floatval', $profile['weights'] ),
			'lead'      => self::LEAD_CAP,
			'bn_digits' => (int) $settings['bn_digits'] ? 1 : 0,
		);
	}

	/**
	 * Render a number using Bengali digits.
	 *
	 * @param int  $number    Number to format.
	 * @param bool $bn_digits Whether to convert to Bengali numerals.
	 * @return string
	 */
	public static function format_number( $number, $bn_digits ) {
		$text = (string) (int) $number;

		if ( ! $bn_digits ) {
			return $text;
		}

		return str_replace(
			array( '0', '1', '2', '3', '4', '5', '6', '7', '8', '9' ),
			array( '০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯' ),
			$text
		);
	}
}
