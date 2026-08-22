<?php
if (!defined('ABSPATH')) exit;

class AICA_Admin {

    private static ?self $instance = null;

    public static function instance(): self {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('admin_menu', [$this, 'add_admin_menu']);
        add_action('add_meta_boxes', [$this, 'add_generation_metabox']);
        add_action('category_edit_form_fields', [$this, 'add_term_generation_panel'], 10, 1);
        add_action('edited_category', [$this, 'save_term_meta']);
        add_filter('manage_edit-category_columns', [$this, 'add_bulk_column']);
        add_filter('manage_category_custom_column', [$this, 'render_bulk_column'], 10, 3);
    }

    public function add_admin_menu(): void {
        add_menu_page(
            __('AI Content', 'ai-content-automation'),
            __('AI Content', 'ai-content-automation'),
            'edit_posts',
            'ai-content-automation',
            [$this, 'render_dashboard'],
            'dashicons-superhero-alt',
            30
        );

        add_submenu_page(
            'ai-content-automation',
            __('Bulk Generation', 'ai-content-automation'),
            __('Bulk Generation', 'ai-content-automation'),
            'edit_posts',
            'ai-content-bulk',
            [$this, 'render_bulk_page']
        );

        add_submenu_page(
            'ai-content-automation',
            __('Settings', 'ai-content-automation'),
            __('Settings', 'ai-content-automation'),
            'manage_options',
            'ai-content-settings',
            [AICA_Settings::instance(), 'render_settings_page']
        );
    }

    public function add_generation_metabox(): void {
        $post_types = get_post_types(['public' => true], 'names');
        foreach ($post_types as $post_type) {
            add_meta_box(
                'aica-generation',
                __('AI Content Generation', 'ai-content-automation'),
                [$this, 'render_generation_metabox'],
                $post_type,
                'side',
                'high'
            );
        }
    }

    public function render_generation_metabox(\WP_Post $post): void {
        $this->render_generation_panel('post', $post->ID);
    }

    public function add_term_generation_panel(\WP_Term $term): void {
        echo '<tr class="form-field"><td colspan="2">';
        $this->render_generation_panel('term', $term->term_id, $term->taxonomy);
        echo '</td></tr>';
    }

    private function render_generation_panel(string $item_type, int $item_id, string $taxonomy = ''): void {
        ?>
        <div class="aica-generation-panel" data-item-type="<?php echo esc_attr($item_type); ?>"
             data-item-id="<?php echo esc_attr($item_id); ?>"
             data-taxonomy="<?php echo esc_attr($taxonomy); ?>">
            <h3><?php esc_html_e('AI Content Generation', 'ai-content-automation'); ?></h3>

            <div class="aica-field">
                <label for="aica-prompt-select"><?php esc_html_e('Select Prompt', 'ai-content-automation'); ?></label>
                <select id="aica-prompt-select" class="aica-prompt-select">
                    <option value=""><?php esc_html_e('Loading prompts...', 'ai-content-automation'); ?></option>
                </select>
            </div>

            <div class="aica-field">
                <label for="aica-apply-mode"><?php esc_html_e('Apply Mode', 'ai-content-automation'); ?></label>
                <select id="aica-apply-mode" class="aica-apply-mode">
                    <option value="preview"><?php esc_html_e('Generate & Preview', 'ai-content-automation'); ?></option>
                    <option value="empty_only"><?php esc_html_e('Fill Empty Fields Only', 'ai-content-automation'); ?></option>
                    <option value="replace"><?php esc_html_e('Replace Existing Content', 'ai-content-automation'); ?></option>
                    <option value="generate_only"><?php esc_html_e('Generate Only', 'ai-content-automation'); ?></option>
                </select>
            </div>

            <div class="aica-actions">
                <button type="button" class="button button-primary aica-generate-btn">
                    <?php esc_html_e('Generate Content', 'ai-content-automation'); ?>
                </button>
            </div>

            <div class="aica-status" style="display:none;">
                <div class="aica-spinner"></div>
                <span class="aica-status-text"></span>
            </div>

            <div class="aica-preview" style="display:none;">
                <h4><?php esc_html_e('Generated Content Preview', 'ai-content-automation'); ?></h4>
                <div class="aica-preview-content"></div>
                <div class="aica-preview-actions">
                    <button type="button" class="button button-primary aica-apply-btn">
                        <?php esc_html_e('Apply to Fields', 'ai-content-automation'); ?>
                    </button>
                    <button type="button" class="button aica-cancel-btn">
                        <?php esc_html_e('Cancel', 'ai-content-automation'); ?>
                    </button>
                </div>
            </div>
        </div>
        <?php
    }

    public function render_dashboard(): void {
        ?>
        <div class="wrap aica-dashboard">
            <h1><?php esc_html_e('AI Content Automation', 'ai-content-automation'); ?></h1>
            <p><?php esc_html_e('Generate AI-powered content and automatically fill WordPress and ACF fields.', 'ai-content-automation'); ?></p>

            <div class="aica-dashboard-cards">
                <div class="aica-card">
                    <h2><?php esc_html_e('Quick Start', 'ai-content-automation'); ?></h2>
                    <ol>
                        <li><?php esc_html_e('Configure the platform API URL and Project ID in Settings.', 'ai-content-automation'); ?></li>
                        <li><?php esc_html_e('Create prompts and field mappings in the platform dashboard.', 'ai-content-automation'); ?></li>
                        <li><?php esc_html_e('Open any post or category to generate content.', 'ai-content-automation'); ?></li>
                        <li><?php esc_html_e('Use Bulk Generation for processing multiple items.', 'ai-content-automation'); ?></li>
                    </ol>
                </div>
                <div class="aica-card">
                    <h2><?php esc_html_e('Connection Status', 'ai-content-automation'); ?></h2>
                    <div id="aica-dashboard-status">
                        <button type="button" class="button" id="aica-dashboard-test">
                            <?php esc_html_e('Test Connection', 'ai-content-automation'); ?>
                        </button>
                        <span id="aica-dashboard-status-text"></span>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }

    public function render_bulk_page(): void {
        $api_url    = AICA_Settings::get('api_url', '');
        $project_id = AICA_Settings::get('project_id', '');
        ?>
        <div class="wrap aica-bulk-page">
            <h1><?php esc_html_e('Bulk AI Content Generation', 'ai-content-automation'); ?></h1>

            <?php if (empty($project_id)) : ?>
                <div class="notice notice-warning">
                    <p>
                        <?php esc_html_e('Platform is not configured yet.', 'ai-content-automation'); ?>
                        <a href="<?php echo esc_url(admin_url('admin.php?page=ai-content-settings')); ?>">
                            <?php esc_html_e('Go to Settings', 'ai-content-automation'); ?>
                        </a>
                        <?php esc_html_e('and enter your API URL and Project ID.', 'ai-content-automation'); ?>
                    </p>
                </div>
            <?php elseif (empty($api_url)) : ?>
                <div class="notice notice-warning">
                    <p>
                        <?php esc_html_e('API URL is not configured.', 'ai-content-automation'); ?>
                        <a href="<?php echo esc_url(admin_url('admin.php?page=ai-content-settings')); ?>">
                            <?php esc_html_e('Go to Settings', 'ai-content-automation'); ?>
                        </a>
                    </p>
                </div>
            <?php endif; ?>

            <div class="aica-bulk-config">
                <div class="aica-field">
                    <label><?php esc_html_e('Content Type', 'ai-content-automation'); ?></label>
                    <select id="aica-bulk-content-type">
                        <option value="category"><?php esc_html_e('Categories', 'ai-content-automation'); ?></option>
                        <option value="post"><?php esc_html_e('Posts', 'ai-content-automation'); ?></option>
                        <option value="product"><?php esc_html_e('Products (WooCommerce)', 'ai-content-automation'); ?></option>
                    </select>
                </div>

                <div class="aica-field">
                    <label><?php esc_html_e('Select Prompt', 'ai-content-automation'); ?></label>
                    <select id="aica-bulk-prompt">
                        <option value=""><?php esc_html_e('Loading...', 'ai-content-automation'); ?></option>
                    </select>
                </div>

                <div class="aica-field">
                    <label><?php esc_html_e('Apply Mode', 'ai-content-automation'); ?></label>
                    <select id="aica-bulk-apply-mode">
                        <option value="preview"><?php esc_html_e('Generate & Preview', 'ai-content-automation'); ?></option>
                        <option value="empty_only"><?php esc_html_e('Fill Empty Fields Only', 'ai-content-automation'); ?></option>
                        <option value="replace"><?php esc_html_e('Replace Existing Content', 'ai-content-automation'); ?></option>
                    </select>
                </div>

                <button type="button" class="button" id="aica-bulk-load-items">
                    <?php esc_html_e('Load Items', 'ai-content-automation'); ?>
                </button>
            </div>

            <div id="aica-bulk-items-list" style="display:none;">
                <h2><?php esc_html_e('Select Items', 'ai-content-automation'); ?></h2>
                <p>
                    <label><input type="checkbox" id="aica-bulk-select-all" /> <?php esc_html_e('Select All', 'ai-content-automation'); ?></label>
                </p>
                <table class="wp-list-table widefat fixed striped">
                    <thead>
                        <tr>
                            <th class="check-column"><input type="checkbox" /></th>
                            <th><?php esc_html_e('Name', 'ai-content-automation'); ?></th>
                            <th><?php esc_html_e('Status', 'ai-content-automation'); ?></th>
                        </tr>
                    </thead>
                    <tbody id="aica-bulk-items-tbody"></tbody>
                </table>

                <div class="aica-bulk-actions" style="margin-top: 20px;">
                    <button type="button" class="button button-primary" id="aica-bulk-start" disabled>
                        <?php esc_html_e('Start Bulk Generation', 'ai-content-automation'); ?>
                    </button>
                </div>
            </div>

            <div id="aica-bulk-progress" style="display:none;">
                <h2><?php esc_html_e('Processing Status', 'ai-content-automation'); ?></h2>
                <div class="aica-bulk-stats">
                    <span class="aica-stat completed">✓ <span id="aica-stat-completed">0</span> <?php esc_html_e('completed', 'ai-content-automation'); ?></span>
                    <span class="aica-stat processing">⏳ <span id="aica-stat-processing">0</span> <?php esc_html_e('processing', 'ai-content-automation'); ?></span>
                    <span class="aica-stat pending">○ <span id="aica-stat-pending">0</span> <?php esc_html_e('pending', 'ai-content-automation'); ?></span>
                    <span class="aica-stat failed">✕ <span id="aica-stat-failed">0</span> <?php esc_html_e('failed', 'ai-content-automation'); ?></span>
                </div>
                <div class="aica-progress-bar">
                    <div class="aica-progress-fill" style="width: 0%"></div>
                </div>
                <button type="button" class="button" id="aica-bulk-retry" style="display:none;">
                    <?php esc_html_e('Retry Failed Items', 'ai-content-automation'); ?>
                </button>
            </div>
        </div>
        <?php
    }

    public function add_bulk_column(array $columns): array {
        $columns['aica_generate'] = __('AI Generate', 'ai-content-automation');
        return $columns;
    }

    public function render_bulk_column(string $content, string $column, int $term_id): string {
        if ($column === 'aica_generate') {
            return '<button type="button" class="button button-small aica-quick-generate" data-term-id="' . esc_attr($term_id) . '">AI</button>';
        }
        return $content;
    }

    public function save_term_meta(int $term_id): void {
        // Reserved for future term meta saves from AI generation
    }
}
