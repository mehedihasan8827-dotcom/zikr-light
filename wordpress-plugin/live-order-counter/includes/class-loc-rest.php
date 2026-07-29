<?php
/**
 * REST endpoint used to defeat page caching.
 *
 * Full-page caches (LiteSpeed, WP Rocket, Cloudflare APO) freeze the HTML the
 * shortcode produced, so a purely server-rendered counter shows every visitor
 * whatever number happened to be current when the cache was written. REST
 * responses are not page-cached, so one small request per pageview keeps the
 * badge honest without polling.
 *
 * @package LiveOrderCounter
 */

defined( 'ABSPATH' ) || exit;

/**
 * Serves the current curve state.
 */
class LOC_Rest {

	const NAMESPACE_ = 'live-order-counter/v1';
	const ROUTE      = '/count';

	/**
	 * Hook into WordPress.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * Register the count route.
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_,
			self::ROUTE,
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_count' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	/**
	 * Return the current curve payload.
	 *
	 * @return WP_REST_Response
	 */
	public static function get_count() {
		$response = rest_ensure_response( LOC_Curve::payload() );

		$response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0' );
		$response->header( 'Pragma', 'no-cache' );

		return $response;
	}
}
