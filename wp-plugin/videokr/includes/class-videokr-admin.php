<?php
/**
 * The Videokr admin screen: connect an account, browse the library, copy a
 * shortcode.
 *
 * @package Videokr
 */

defined( 'ABSPATH' ) || exit;

/**
 * One page with two tabs. Connecting, refreshing and disconnecting are all
 * nonce-checked POSTs handled before the page renders, so a redirect can carry
 * the result back as a notice.
 */
class Videokr_Admin {

	const SLUG  = 'videokr';
	const NONCE = 'videokr_admin';

	/**
	 * Hooks the menu, assets and form handler.
	 *
	 * @return void
	 */
	public static function register() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_post_videokr_connect', array( __CLASS__, 'handle_connect' ) );
		add_action( 'admin_post_videokr_disconnect', array( __CLASS__, 'handle_disconnect' ) );
		add_action( 'admin_post_videokr_refresh', array( __CLASS__, 'handle_refresh' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
	}

	/**
	 * Registers the top-level menu.
	 *
	 * @return void
	 */
	public static function menu() {
		add_menu_page(
			__( 'Videokr', 'videokr' ),
			__( 'Videokr', 'videokr' ),
			'manage_options',
			self::SLUG,
			array( __CLASS__, 'page' ),
			'dashicons-video-alt3',
			26
		);
	}

	/**
	 * Loads the admin styling only on our own screen.
	 *
	 * @param string $hook Current admin page hook.
	 * @return void
	 */
	public static function assets( $hook ) {
		if ( 'toplevel_page_' . self::SLUG !== $hook ) {
			return;
		}
		wp_enqueue_style(
			'videokr-fonts',
			'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap',
			array(),
			null // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion -- Google Fonts is versioned by its own URL.
		);
		wp_enqueue_style( 'videokr-admin', VIDEOKR_URL . 'assets/admin.css', array( 'videokr-fonts' ), VIDEOKR_VERSION );
		wp_enqueue_script( 'videokr-admin', VIDEOKR_URL . 'assets/admin.js', array(), VIDEOKR_VERSION, true );
		wp_localize_script(
			'videokr-admin',
			'videokrAdmin',
			array(
				'copied' => __( 'Copied', 'videokr' ),
				'copy'   => __( 'Copy shortcode', 'videokr' ),
			)
		);
	}

	/**
	 * Saves and verifies a key. A key that Videokr rejects is never stored.
	 *
	 * @return void
	 */
	public static function handle_connect() {
		self::guard();
		$key  = isset( $_POST['videokr_key'] ) ? sanitize_text_field( wp_unslash( $_POST['videokr_key'] ) ) : '';
		$host = isset( $_POST['videokr_host'] ) ? esc_url_raw( wp_unslash( $_POST['videokr_host'] ) ) : '';
		if ( '' === $host ) {
			$host = VIDEOKR_DEFAULT_HOST;
		}

		if ( '' === $key ) {
			self::redirect( 'error', __( 'Paste a key first.', 'videokr' ) );
		}

		$account = Videokr_Api::verify( $key, $host );
		if ( is_wp_error( $account ) ) {
			self::redirect( 'error', $account->get_error_message() );
		}

		Videokr_Api::flush_cache();
		Videokr_Settings::save_connection( $key, $host, self::summary( $account ) );
		self::redirect( 'ok', __( 'Connected to Videokr.', 'videokr' ) );
	}

	/**
	 * Forgets the stored key.
	 *
	 * @return void
	 */
	public static function handle_disconnect() {
		self::guard();
		Videokr_Api::flush_cache();
		Videokr_Settings::disconnect();
		self::redirect( 'ok', __( 'Disconnected. Existing embeds will stop rendering until you reconnect.', 'videokr' ) );
	}

	/**
	 * Re-reads the library and the account, bypassing the cache.
	 *
	 * @return void
	 */
	public static function handle_refresh() {
		self::guard();
		Videokr_Api::flush_cache();
		$account = Videokr_Api::account( true );
		if ( is_wp_error( $account ) ) {
			self::redirect( 'error', $account->get_error_message() );
		}
		Videokr_Settings::save_connection( Videokr_Settings::api_key(), Videokr_Settings::host(), self::summary( $account ) );
		self::redirect( 'ok', __( 'Library refreshed.', 'videokr' ) );
	}

	/**
	 * Renders the page.
	 *
	 * @return void
	 */
	public static function page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage Videokr.', 'videokr' ) );
		}
		$tab = isset( $_GET['tab'] ) ? sanitize_key( wp_unslash( $_GET['tab'] ) ) : 'library'; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only tab switch.
		if ( ! Videokr_Settings::is_connected() ) {
			$tab = 'settings';
		}

		echo '<div class="wrap videokr-wrap">';
		self::header( $tab );
		self::notice();
		if ( 'settings' === $tab ) {
			self::settings_tab();
		} else {
			self::library_tab();
		}
		echo '</div>';
	}

	/* ------------------------------------------------------------- render --- */

	/**
	 * Brand bar plus tabs.
	 *
	 * @param string $tab Active tab.
	 * @return void
	 */
	private static function header( $tab ) {
		$account = Videokr_Settings::account();
		?>
		<div class="videokr-head">
			<div class="videokr-head__brand">
				<span class="videokr-logo">Videokr</span>
				<p><?php esc_html_e( 'Your hosted video, embedded anywhere on this site.', 'videokr' ); ?></p>
			</div>
			<?php if ( ! empty( $account ) ) : ?>
				<div class="videokr-chip-row">
					<span class="videokr-chip"><?php echo esc_html( isset( $account['email'] ) ? $account['email'] : '' ); ?></span>
					<span class="videokr-chip videokr-chip--accent"><?php echo esc_html( isset( $account['plan_name'] ) ? $account['plan_name'] : '' ); ?></span>
					<?php if ( isset( $account['allowance'] ) && $account['allowance'] > 0 ) : ?>
						<span class="videokr-chip">
							<?php
							printf(
								/* translators: 1: plays used, 2: monthly allowance. */
								esc_html__( '%1$s / %2$s plays this month', 'videokr' ),
								esc_html( number_format_i18n( (int) $account['plays'] ) ),
								esc_html( number_format_i18n( (int) $account['allowance'] ) )
							);
							?>
						</span>
					<?php endif; ?>
				</div>
			<?php endif; ?>
		</div>
		<nav class="videokr-tabs">
			<?php
			$tabs = array(
				'library'  => __( 'Library', 'videokr' ),
				'settings' => __( 'Settings', 'videokr' ),
			);
			foreach ( $tabs as $slug => $label ) {
				printf(
					'<a class="videokr-tab%1$s" href="%2$s">%3$s</a>',
					$slug === $tab ? ' is-active' : '',
					esc_url( admin_url( 'admin.php?page=' . self::SLUG . '&tab=' . $slug ) ),
					esc_html( $label )
				);
			}
			?>
		</nav>
		<?php
	}

	/**
	 * Shows the result of the last action.
	 *
	 * @return void
	 */
	private static function notice() {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- read-only notice carried by the redirect.
		$status  = isset( $_GET['videokr_status'] ) ? sanitize_key( wp_unslash( $_GET['videokr_status'] ) ) : '';
		$message = isset( $_GET['videokr_message'] ) ? sanitize_text_field( wp_unslash( $_GET['videokr_message'] ) ) : '';
		// phpcs:enable WordPress.Security.NonceVerification.Recommended
		if ( '' === $status || '' === $message ) {
			return;
		}
		printf(
			'<div class="videokr-notice videokr-notice--%1$s">%2$s</div>',
			'ok' === $status ? 'ok' : 'error',
			esc_html( $message )
		);
	}

	/**
	 * Connect / disconnect form.
	 *
	 * @return void
	 */
	private static function settings_tab() {
		$connected = Videokr_Settings::is_connected();
		?>
		<div class="videokr-grid">
			<section class="videokr-card">
				<h2><?php echo $connected ? esc_html__( 'Connection', 'videokr' ) : esc_html__( 'Connect your account', 'videokr' ); ?></h2>
				<p class="videokr-muted">
					<?php esc_html_e( 'In Videokr open Integrations, create an API key, and paste it here. The key stays on your server — visitors never see it.', 'videokr' ); ?>
				</p>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
					<?php wp_nonce_field( self::NONCE ); ?>
					<input type="hidden" name="action" value="videokr_connect">
					<label class="videokr-label" for="videokr-key"><?php esc_html_e( 'API key', 'videokr' ); ?></label>
					<input
						class="videokr-input"
						id="videokr-key"
						name="videokr_key"
						type="password"
						autocomplete="off"
						placeholder="vk_live_…"
						value=""
						<?php echo $connected ? '' : 'required'; ?>
					>
					<?php if ( $connected ) : ?>
						<p class="videokr-hint">
							<?php esc_html_e( 'A key is already saved. Paste a new one to replace it.', 'videokr' ); ?>
						</p>
					<?php endif; ?>
					<label class="videokr-label" for="videokr-host"><?php esc_html_e( 'Videokr host', 'videokr' ); ?></label>
					<input
						class="videokr-input"
						id="videokr-host"
						name="videokr_host"
						type="url"
						value="<?php echo esc_attr( Videokr_Settings::host() ); ?>"
					>
					<p class="videokr-hint"><?php esc_html_e( 'Leave as-is unless Videokr gave you a different address.', 'videokr' ); ?></p>
					<div class="videokr-actions">
						<button class="videokr-btn" type="submit">
							<?php echo $connected ? esc_html__( 'Save and verify', 'videokr' ) : esc_html__( 'Connect', 'videokr' ); ?>
						</button>
					</div>
				</form>
				<?php if ( $connected ) : ?>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="videokr-actions">
						<?php wp_nonce_field( self::NONCE ); ?>
						<input type="hidden" name="action" value="videokr_disconnect">
						<button class="videokr-btn videokr-btn--ghost" type="submit"><?php esc_html_e( 'Disconnect', 'videokr' ); ?></button>
					</form>
				<?php endif; ?>
			</section>
			<section class="videokr-card">
				<h2><?php esc_html_e( 'How to embed', 'videokr' ); ?></h2>
				<ol class="videokr-steps">
					<li><?php esc_html_e( 'Open Videokr → Library here and copy a shortcode.', 'videokr' ); ?></li>
					<li><?php esc_html_e( 'Paste it into any post, page or widget.', 'videokr' ); ?></li>
					<li><?php esc_html_e( 'Or add the “Videokr” block and pick a video visually.', 'videokr' ); ?></li>
				</ol>
				<pre class="videokr-code">[videokr id="vid_example"]
[videokr playlist="launch-week"]
[videokr id="vid_example" width="640" ratio="16/9" autoplay="true" muted="true" start="30"]</pre>
				<p class="videokr-muted">
					<?php esc_html_e( 'Playback, skins, chapters, captions, CTAs and analytics all stay in Videokr — nothing is duplicated in WordPress.', 'videokr' ); ?>
				</p>
			</section>
		</div>
		<?php
	}

	/**
	 * The account's videos and playlists with copyable shortcodes.
	 *
	 * @return void
	 */
	private static function library_tab() {
		$videos    = Videokr_Api::videos();
		$playlists = Videokr_Api::playlists();

		if ( is_wp_error( $videos ) ) {
			self::error_pane( $videos->get_error_message() );
			return;
		}
		?>
		<div class="videokr-toolbar">
			<input class="videokr-input videokr-search" id="videokr-filter" type="search" placeholder="<?php esc_attr_e( 'Filter your library…', 'videokr' ); ?>">
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<?php wp_nonce_field( self::NONCE ); ?>
				<input type="hidden" name="action" value="videokr_refresh">
				<button class="videokr-btn videokr-btn--ghost" type="submit"><?php esc_html_e( 'Refresh', 'videokr' ); ?></button>
			</form>
		</div>
		<?php
		self::cards( isset( $videos['videos'] ) ? $videos['videos'] : array(), 'id', __( 'Videos', 'videokr' ), __( 'No videos yet — upload one in Videokr, then hit Refresh.', 'videokr' ) );
		if ( ! is_wp_error( $playlists ) ) {
			self::cards( isset( $playlists['playlists'] ) ? $playlists['playlists'] : array(), 'playlist', __( 'Playlists', 'videokr' ), __( 'No playlists yet.', 'videokr' ) );
		}
	}

	/**
	 * Renders one library section.
	 *
	 * @param array  $items     Videos or playlists.
	 * @param string $attribute Shortcode attribute name (`id` or `playlist`).
	 * @param string $heading   Section heading.
	 * @param string $empty     Empty-state copy.
	 * @return void
	 */
	private static function cards( $items, $attribute, $heading, $empty ) {
		echo '<h2 class="videokr-heading">' . esc_html( $heading ) . '</h2>';
		if ( empty( $items ) ) {
			echo '<div class="videokr-empty">' . esc_html( $empty ) . '</div>';
			return;
		}
		echo '<ul class="videokr-cards">';
		foreach ( $items as $item ) {
			$key       = ! empty( $item['slug'] ) ? $item['slug'] : $item['id'];
			$shortcode = sprintf( '[videokr %s="%s"]', $attribute, $key );
			$title     = ! empty( $item['title'] ) ? $item['title'] : $key;
			$thumb     = ! empty( $item['thumbnail_url'] ) ? $item['thumbnail_url'] : '';
			$sub       = 'playlist' === $attribute
				? sprintf(
					/* translators: %d: number of videos in the playlist. */
					_n( '%d video', '%d videos', (int) ( isset( $item['item_count'] ) ? $item['item_count'] : 0 ), 'videokr' ),
					(int) ( isset( $item['item_count'] ) ? $item['item_count'] : 0 )
				)
				: implode( ' · ', array_filter( array( self::duration( isset( $item['duration'] ) ? $item['duration'] : 0 ), isset( $item['visibility'] ) ? $item['visibility'] : '' ) ) );
			?>
			<li class="videokr-card videokr-item" data-title="<?php echo esc_attr( strtolower( $title . ' ' . $key ) ); ?>">
				<?php if ( $thumb ) : ?>
					<img class="videokr-item__art" src="<?php echo esc_url( $thumb ); ?>" alt="">
				<?php else : ?>
					<span class="videokr-item__art videokr-item__art--empty" aria-hidden="true">&#9654;</span>
				<?php endif; ?>
				<div class="videokr-item__body">
					<strong><?php echo esc_html( $title ); ?></strong>
					<span class="videokr-muted videokr-tiny"><?php echo esc_html( $sub ); ?></span>
					<code class="videokr-code videokr-code--inline"><?php echo esc_html( $shortcode ); ?></code>
					<div class="videokr-actions">
						<button class="videokr-btn videokr-btn--sm videokr-copy" type="button" data-copy="<?php echo esc_attr( $shortcode ); ?>">
							<?php esc_html_e( 'Copy shortcode', 'videokr' ); ?>
						</button>
						<a class="videokr-btn videokr-btn--ghost videokr-btn--sm" href="<?php echo esc_url( Videokr_Settings::host() . ( 'playlist' === $attribute ? '/pl/' : '/v/' ) . $key ); ?>" target="_blank" rel="noreferrer noopener">
							<?php esc_html_e( 'Open in Videokr', 'videokr' ); ?>
						</a>
					</div>
				</div>
			</li>
			<?php
		}
		echo '</ul>';
	}

	/**
	 * Persistent failure state with a retry, rather than a disappearing toast.
	 *
	 * @param string $message Error message.
	 * @return void
	 */
	private static function error_pane( $message ) {
		?>
		<div class="videokr-empty videokr-empty--error">
			<p><?php echo esc_html( $message ); ?></p>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<?php wp_nonce_field( self::NONCE ); ?>
				<input type="hidden" name="action" value="videokr_refresh">
				<button class="videokr-btn" type="submit"><?php esc_html_e( 'Try again', 'videokr' ); ?></button>
			</form>
		</div>
		<?php
	}

	/* -------------------------------------------------------------- helpers --- */

	/**
	 * Seconds as `m:ss`.
	 *
	 * @param mixed $seconds Duration.
	 * @return string
	 */
	private static function duration( $seconds ) {
		$total = (int) round( (float) $seconds );
		if ( $total <= 0 ) {
			return '';
		}
		return sprintf( '%d:%02d', intdiv( $total, 60 ), $total % 60 );
	}

	/**
	 * Trims the account payload down to what the header shows.
	 *
	 * @param array $payload Response from /api/v1/account.
	 * @return array
	 */
	private static function summary( $payload ) {
		$account = isset( $payload['account'] ) && is_array( $payload['account'] ) ? $payload['account'] : array();
		$usage   = isset( $payload['usage'] ) && is_array( $payload['usage'] ) ? $payload['usage'] : array();
		return array(
			'email'     => isset( $account['email'] ) ? sanitize_email( $account['email'] ) : '',
			'plan'      => isset( $account['plan'] ) ? sanitize_text_field( $account['plan'] ) : '',
			'plan_name' => isset( $account['plan_name'] ) ? sanitize_text_field( $account['plan_name'] ) : '',
			'plays'     => isset( $usage['plays'] ) ? (int) $usage['plays'] : 0,
			'allowance' => isset( $usage['allowance'] ) ? (int) $usage['allowance'] : 0,
		);
	}

	/**
	 * Capability and nonce check shared by every POST handler.
	 *
	 * @return void
	 */
	private static function guard() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage Videokr.', 'videokr' ) );
		}
		check_admin_referer( self::NONCE );
	}

	/**
	 * Returns to the page with a notice.
	 *
	 * @param string $status  `ok` or `error`.
	 * @param string $message Notice text.
	 * @return void
	 */
	private static function redirect( $status, $message ) {
		wp_safe_redirect(
			add_query_arg(
				array(
					'page'            => self::SLUG,
					'tab'             => 'error' === $status ? 'settings' : 'library',
					'videokr_status'  => $status,
					'videokr_message' => $message,
				),
				admin_url( 'admin.php' )
			)
		);
		exit;
	}
}
