# Live Order Counter

A social-proof badge for a landing page hero section, showing today's order count.

```
🔴 LIVE   আজকের আমসত্ত্বের মোট অর্ডার: ৪৮
```

No database tables, no cron jobs, no scheduled resets, and one small HTTP request per pageview.

## Installing

**Option A — upload a zip**

1. Build the archive:
   ```
   cd wordpress-plugin
   ./build-zip.sh
   ```
   This lints every PHP file before packing, so a syntax error can't reach your site as a white screen on activation. It produces `live-order-counter.zip` with the plugin folder at the archive root, which is the layout WordPress expects.
2. In WordPress go to **Plugins → Add New → Upload Plugin**, choose the zip, then **Install Now** and **Activate**.

Re-run the script after any edit to refresh the archive.

**Option B — copy over FTP or SSH**

Copy the `live-order-counter` folder into `wp-content/plugins/`, then activate it under **Plugins**.

## Using it

Put the shortcode wherever the badge belongs in your hero section:

```
[live_order_counter]
```

It works in the block editor (a Shortcode block), Elementor (a Shortcode widget), and any page builder's text field. In a PHP template use:

```php
<?php echo do_shortcode( '[live_order_counter]' ); ?>
```

Two optional attributes:

```
[live_order_counter label="আজকের অর্ডার:" class="my-hero-badge"]
```

`label` overrides the text for that one placement; `class` adds a CSS class so you can restyle a single instance.

## Settings

**Settings → Live Order Counter.** The screen shows what the curve reads right now and where it lands tonight, so you can check your numbers without waiting.

| Setting | What it does |
| --- | --- |
| Badge text | The words before the number |
| Live label | The text in the red pill, default `LIVE` |
| Numerals | Bengali digits (৪৮) or Latin (48) |
| Starting count | The count just after midnight, default 3–4 |
| End-of-day total | Where it lands at 11:59 PM, default 118–138 |
| Hourly shape | 24 numbers giving each hour its share of the day |

One value from each range is picked per day, so no two days look identical.

### Timezone

The counter follows **Settings → General → Timezone**. Set it to `Asia/Dhaka` (or `UTC+6`) or the day will roll over at the wrong hour.

### Hourly shape

Twenty-four comma-separated numbers, midnight first. They are relative shares, not order counts, so only their proportions matter — the end-of-day total controls the scale. The default leans overnight-quiet and evening-heavy:

```
1, 0.5, 0.3, 0.3, 0.5, 1, 1.5, 2, 3, 4.5, 6, 6.5,
6, 5, 4.5, 5, 6, 6.5, 7, 8, 9, 8.5, 6, 3
```

Once you have real order timestamps, reshape this to match them. Anything other than 24 valid numbers is rejected and the built-in shape is used instead.

## How it works

The count is a **pure function of the time of day**. There is nothing stored and nothing to reset: at 00:00:00 the input returns to zero and so does the output. Every visitor loading the page in the same second computes the same number, so this costs the same whether you get ten visitors a day or ten thousand at once.

A small deterministic generator seeded from the date picks the day's starting count, end total, and hour-by-hour jitter. Same date means the same numbers for everyone; tomorrow is shaped a little differently.

### Why it never goes backwards

Three rules combine:

```
display = clamp( max(curve_now, saved_peak),  curve_now,  curve_now + 3 )
```

The highest number this browser has shown today is kept in LocalStorage under the site's date, so a reload can't show less than last time. The **lead cap** is what makes that safe: the display may run at most 3 ahead of the honest curve, so the three in-visit increments preview the next few minutes rather than stacking on top. A visitor who reloads two hundred times sees the number sit still and then climb with the clock, not spiral to 130 by mid-morning. Since the saved peak is always written at or below `curve + 3`, and the curve only rises, the displayed value provably never decreases.

### Why there's a REST request

If you run LiteSpeed Cache, WP Rocket, or Cloudflare APO, your hero section's HTML is frozen at cache-write time — a purely server-rendered number would show every visitor whatever was current hours ago. The server-rendered value is the first paint and the no-JavaScript fallback; one `no-store` request to `/wp-json/live-order-counter/v1/count` reconciles it. REST responses aren't page-cached, so that reading is always current. From it the browser learns the day's curve and its position in the day, then ticks locally — **no polling**.

The device clock is only used to measure elapsed time, never to decide what time it is, so a visitor with a badly set phone still sees the right number.

### Edge cases handled

- **Midnight with the tab open** — the display holds its last value instead of collapsing from 130 to 4 on screen. The next page load starts the new day.
- **Cached HTML served after midnight** — the stale number is corrected to the new day's curve as soon as the REST response lands.
- **LocalStorage unavailable** (Safari Private Mode throws on write) — the counter still runs, it just forgets between page loads.
- **Clock adjusted backwards mid-visit** — elapsed time is floored at zero, so the counter can't rewind.
- **Several tabs open** — they sync upward via the `storage` event, and the lead cap bounds the total regardless.
- **Reduced motion** — the pulse and the digit transition are disabled under `prefers-reduced-motion`.
- **Screen readers** — no `aria-live` on the number; a count announced every few seconds is hostile to listen to.

## Using real order data

The numbers are simulated. To drive the badge from real WooCommerce orders instead, return your own figure from the `loc_count` filter — the display layer is unchanged:

```php
add_filter( 'loc_count', function ( $count ) {
	$orders = wc_get_orders( array(
		'date_created' => '>=' . strtotime( 'today midnight', current_time( 'timestamp' ) ),
		'limit'        => -1,
		'return'       => 'ids',
	) );

	return count( $orders );
} );
```

Cache that result for a minute or two if you have real traffic — it runs on every REST hit.

## Styling

Everything is scoped under `.loc-badge` and sized in `em`, so the badge inherits your hero's font size. To restyle, add CSS to your theme:

```css
.loc-badge { background: #fff7ed; border-color: rgba(234, 88, 12, 0.2); }
.loc-badge .loc-live { background: #ffedd5; color: #ea580c; }
.loc-badge .loc-dot { background: #f97316; }
.loc-badge .loc-count { color: #c2410c; }
```

## Note on simulated social proof

These are not real orders. That's a common landing-page pattern and it's your call to make, but fabricated social proof is treated as a deceptive practice under consumer-protection rules in several markets. The `loc_count` filter above is there so you can switch to real numbers without changing anything else.
