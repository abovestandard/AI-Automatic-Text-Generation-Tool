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

        $taxonomies = get_taxonomies(['public' => true], 'names');
        foreach ($taxonomies as $taxonomy) {
            if ($taxonomy === 'category') {
                continue;
            }
            add_action("{$taxonomy}_edit_form_fields", [$this, 'add_term_generation_panel'], 10, 1);
        }
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
            __('Generate Content', 'ai-content-automation'),
            __('Generate Content', 'ai-content-automation'),
            'edit_posts',
            'ai-content-generate',
            [$this, 'render_generate_page']
        );

        add_submenu_page(
            'ai-content-automation',
            __('Prompts', 'ai-content-automation'),
            __('Prompts', 'ai-content-automation'),
            'edit_posts',
            'ai-content-prompts',
            [$this, 'render_prompts_page']
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

            <div class="aica-field aica-panel-acf-auto">
                <label class="checkbox-label">
                    <input type="checkbox" class="aica-panel-acf-auto-cb" checked />
                    <?php esc_html_e('ACF Auto Mode', 'ai-content-automation'); ?>
                </label>
            </div>

            <div class="aica-field">
                <select id="aica-prompt-select" class="aica-prompt-select aica-select">
                    <option value=""><?php esc_html_e('Loading prompts...', 'ai-content-automation'); ?></option>
                </select>
            </div>

            <div class="aica-field">
                <label for="aica-apply-mode"><?php esc_html_e('Apply Mode', 'ai-content-automation'); ?></label>
                <select id="aica-apply-mode" class="aica-apply-mode aica-select">
                    <option value="preview"><?php esc_html_e('Generate & Preview', 'ai-content-automation'); ?></option>
                    <option value="empty_only"><?php esc_html_e('Fill Empty Fields Only', 'ai-content-automation'); ?></option>
                    <option value="replace"><?php esc_html_e('Replace Existing Content', 'ai-content-automation'); ?></option>
                    <option value="generate_only"><?php esc_html_e('Generate Only', 'ai-content-automation'); ?></option>
                </select>
            </div>

            <div class="aica-field aica-panel-image-upload">
                <label><?php esc_html_e('Reference Image (optional)', 'ai-content-automation'); ?></label>
                <input type="file" class="aica-panel-upload-image aica-file-input" accept="image/*" />
                <div class="aica-panel-image-preview" style="display:none;">
                    <img src="" alt="" />
                    <button type="button" class="aica-image-remove aica-panel-image-remove" title="<?php esc_attr_e('Remove image', 'ai-content-automation'); ?>">×</button>
                </div>
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
                        <?php esc_html_e('Save to ACF Fields', 'ai-content-automation'); ?>
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
        <div class="wrap aica-page aica-dashboard">
            <div class="aica-page-header">
                <h1><?php esc_html_e('AI Content Automation', 'ai-content-automation'); ?></h1>
                <p class="aica-page-desc"><?php esc_html_e('Generate AI-powered content and automatically fill WordPress and ACF fields.', 'ai-content-automation'); ?></p>
            </div>

            <div class="aica-dashboard-cards">
                <div class="aica-card">
                    <h2><?php esc_html_e('Quick Start', 'ai-content-automation'); ?></h2>
                    <ol>
                        <li><?php esc_html_e('Configure the platform API URL and Project ID in Settings.', 'ai-content-automation'); ?></li>
                        <li><?php esc_html_e('Create prompts and field mappings in the platform dashboard.', 'ai-content-automation'); ?></li>
                        <li><?php esc_html_e('Use Generate Content to create text for a specific post or category.', 'ai-content-automation'); ?></li>
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

    public function render_generate_page(): void {
        $this->render_config_notice();
        $content_types = AICA_Content_Registry::get_content_types();
        $platform_url = rtrim(AICA_Settings::get('api_url', 'http://localhost:3001'), '/');
        ?>
        <div class="wrap aica-page aica-generate-page">
            <div class="aica-page-header">
                <h1><?php esc_html_e('Generate AI Content', 'ai-content-automation'); ?></h1>
                <p class="aica-page-desc"><?php esc_html_e('Follow the steps below to generate content and save it to your WordPress fields.', 'ai-content-automation'); ?></p>
            </div>

            <div class="aica-wizard">
                <!-- Step 1: Select Content -->
                <div class="aica-step card-like">
                    <div class="aica-step-header">
                        <span class="aica-step-num">1</span>
                        <h2><?php esc_html_e('Select Content', 'ai-content-automation'); ?></h2>
                    </div>
                    <div class="aica-step-body aica-form-grid">
                        <div class="aica-field">
                            <label for="aica-content-type"><?php esc_html_e('Content Type', 'ai-content-automation'); ?></label>
                            <select id="aica-content-type" class="aica-select">
                                <option value=""><?php esc_html_e('Select post type or taxonomy...', 'ai-content-automation'); ?></option>
                                <?php if (!empty($content_types['postTypes'])) : ?>
                                    <optgroup label="<?php esc_attr_e('Post Types', 'ai-content-automation'); ?>">
                                        <?php foreach ($content_types['postTypes'] as $pt) : ?>
                                            <option value="post_type:<?php echo esc_attr($pt['slug']); ?>"><?php echo esc_html($pt['name']); ?></option>
                                        <?php endforeach; ?>
                                    </optgroup>
                                <?php endif; ?>
                                <?php if (!empty($content_types['taxonomies'])) : ?>
                                    <optgroup label="<?php esc_attr_e('Taxonomies', 'ai-content-automation'); ?>">
                                        <?php foreach ($content_types['taxonomies'] as $tax) : ?>
                                            <option value="taxonomy:<?php echo esc_attr($tax['slug']); ?>"><?php echo esc_html($tax['name']); ?></option>
                                        <?php endforeach; ?>
                                    </optgroup>
                                <?php endif; ?>
                            </select>
                        </div>
                        <div class="aica-field">
                            <label for="aica-content-item"><?php esc_html_e('Select Item', 'ai-content-automation'); ?></label>
                            <select id="aica-content-item" class="aica-select" disabled>
                                <option value=""><?php esc_html_e('Select a content type first...', 'ai-content-automation'); ?></option>
                            </select>
                            <p class="aica-field-hint" id="aica-item-count"></p>
                        </div>
                    </div>
                </div>

                <!-- Step 2: Prompt & Options -->
                <div class="aica-step card-like">
                    <div class="aica-step-header">
                        <span class="aica-step-num">2</span>
                        <h2><?php esc_html_e('Prompt & Options', 'ai-content-automation'); ?></h2>
                    </div>
                    <div class="aica-step-body aica-form-grid">
                        <div class="aica-field aica-field-full">
                            <label class="checkbox-label aica-acf-auto-label">
                                <input type="checkbox" id="aica-acf-auto-mode" checked />
                                <?php esc_html_e('ACF Auto Mode — read field structure from WordPress and auto-map (no manual mappings needed)', 'ai-content-automation'); ?>
                            </label>
                            <p class="aica-field-hint" id="aica-acf-auto-hint"></p>
                        </div>
                        <div class="aica-field aica-field-full">
                            <label for="aica-generate-prompt"><?php esc_html_e('Select Prompt', 'ai-content-automation'); ?></label>
                            <select id="aica-generate-prompt" class="aica-select">
                                <option value=""><?php esc_html_e('Loading prompts...', 'ai-content-automation'); ?></option>
                            </select>
                            <p class="aica-field-hint">
                                <?php esc_html_e('Manage prompts in the platform dashboard.', 'ai-content-automation'); ?>
                                <a href="<?php echo esc_url($platform_url); ?>" target="_blank" rel="noopener"><?php esc_html_e('Open Prompt Manager', 'ai-content-automation'); ?> ↗</a>
                            </p>
                        </div>
                        <div class="aica-field">
                            <label for="aica-generate-apply-mode"><?php esc_html_e('Apply Mode', 'ai-content-automation'); ?></label>
                            <select id="aica-generate-apply-mode" class="aica-select">
                                <option value="preview"><?php esc_html_e('Generate & Preview', 'ai-content-automation'); ?></option>
                                <option value="empty_only"><?php esc_html_e('Fill Empty Fields Only', 'ai-content-automation'); ?></option>
                                <option value="replace"><?php esc_html_e('Replace Existing Content', 'ai-content-automation'); ?></option>
                            </select>
                        </div>
                        <div class="aica-field">
                            <label><?php esc_html_e('Reference Image (optional)', 'ai-content-automation'); ?></label>
                            <div class="aica-image-upload">
                                <input type="file" id="aica-upload-image" accept="image/*" class="aica-file-input" />
                                <div id="aica-image-preview" class="aica-image-preview" style="display:none;">
                                    <img id="aica-image-preview-img" src="" alt="" />
                                    <button type="button" class="aica-image-remove" id="aica-image-remove" title="<?php esc_attr_e('Remove image', 'ai-content-automation'); ?>">×</button>
                                </div>
                                <p class="aica-field-hint"><?php esc_html_e('Upload an image for the AI to analyze alongside your prompt.', 'ai-content-automation'); ?></p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Step 3: Generate -->
                <div class="aica-step card-like">
                    <div class="aica-step-header">
                        <span class="aica-step-num">3</span>
                        <h2><?php esc_html_e('Generate & Save', 'ai-content-automation'); ?></h2>
                    </div>
                    <div class="aica-step-body">
                        <div class="aica-actions-row">
                            <button type="button" class="button button-primary button-hero" id="aica-generate-start" disabled>
                                <?php esc_html_e('Generate Content', 'ai-content-automation'); ?>
                            </button>
                            <a href="#" class="button" id="aica-edit-item-link" style="display:none;" target="_blank">
                                <?php esc_html_e('Edit in WordPress', 'ai-content-automation'); ?>
                            </a>
                        </div>
                        <div id="aica-generate-status" class="aica-status" style="display:none;">
                            <div class="aica-spinner"></div>
                            <span class="aica-status-text"></span>
                        </div>
                    </div>
                </div>
            </div>

            <div id="aica-generate-preview" class="aica-preview-panel card-like" style="display:none;">
                <h2><?php esc_html_e('Generated Content Preview', 'ai-content-automation'); ?></h2>
                <div id="aica-generate-preview-content"></div>
                <div class="aica-preview-actions">
                    <button type="button" class="button button-primary button-hero" id="aica-generate-save">
                        <?php esc_html_e('Save to WordPress', 'ai-content-automation'); ?>
                    </button>
                    <button type="button" class="button" id="aica-generate-cancel">
                        <?php esc_html_e('Discard', 'ai-content-automation'); ?>
                    </button>
                </div>
            </div>
        </div>
        <?php
    }

    public function render_prompts_page(): void {
        $platform_url = rtrim(AICA_Settings::get('api_url', 'http://localhost:3001'), '/');
        $project_id   = AICA_Settings::get('project_id', '');
        ?>
        <div class="wrap aica-page aica-prompts-page">
            <div class="aica-page-header">
                <h1><?php esc_html_e('AI Prompts', 'ai-content-automation'); ?></h1>
                <p class="aica-page-desc"><?php esc_html_e('Prompts define what content the AI generates. Create and manage them in the platform dashboard.', 'ai-content-automation'); ?></p>
            </div>

            <?php $this->render_config_notice(); ?>

            <div class="aica-prompts-actions card-like">
                <a href="<?php echo esc_url($platform_url . ($project_id ? "/projects/{$project_id}/prompts" : '')); ?>" target="_blank" rel="noopener" class="button button-primary">
                    <?php esc_html_e('Create / Edit Prompts', 'ai-content-automation'); ?> ↗
                </a>
                <a href="<?php echo esc_url($platform_url . ($project_id ? "/projects/{$project_id}/mappings" : '')); ?>" target="_blank" rel="noopener" class="button">
                    <?php esc_html_e('Field Mappings', 'ai-content-automation'); ?> ↗
                </a>
            </div>

            <div id="aica-prompts-list" class="card-like">
                <h2><?php esc_html_e('Available Prompts', 'ai-content-automation'); ?></h2>
                <div id="aica-prompts-loading" class="aica-status"><?php esc_html_e('Loading prompts...', 'ai-content-automation'); ?></div>
                <div id="aica-prompts-container"></div>
            </div>

            <div class="aica-help-box card-like">
                <h3><?php esc_html_e('ACF Nested Field Mapping', 'ai-content-automation'); ?></h3>
                <p><?php esc_html_e('For nested ACF structures (Groups, Repeaters), use dot notation in field mappings:', 'ai-content-automation'); ?></p>
                <ul>
                    <li><code>indstillinger_for_produktvisning.afsnit_1.underoverskrift</code> → <?php esc_html_e('Group → sub-group → text field', 'ai-content-automation'); ?></li>
                    <li><code>indstillinger_for_produktvisning.afsnit_2</code> → <?php esc_html_e('Repeater (AI outputs JSON array)', 'ai-content-automation'); ?></li>
                </ul>
                <p class="aica-field-hint"><?php esc_html_e('Configure mappings in the platform dashboard under Field Mappings.', 'ai-content-automation'); ?></p>
            </div>
        </div>
        <?php
    }

    private function render_config_notice(): void {
        $api_url    = AICA_Settings::get('api_url', '');
        $project_id = AICA_Settings::get('project_id', '');

        if (empty($project_id)) : ?>
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
        <?php endif;
    }

    public function render_bulk_page(): void {
        $content_types = AICA_Content_Registry::get_content_types();
        ?>
        <div class="wrap aica-page aica-bulk-page">
            <div class="aica-page-header">
                <h1><?php esc_html_e('Bulk AI Content Generation', 'ai-content-automation'); ?></h1>
                <p class="aica-page-desc"><?php esc_html_e('Generate content for multiple posts or taxonomy terms at once.', 'ai-content-automation'); ?></p>
            </div>

            <?php $this->render_config_notice(); ?>

            <div class="aica-bulk-config">
                <div class="aica-field">
                    <label for="aica-bulk-content-type"><?php esc_html_e('Content Type', 'ai-content-automation'); ?></label>
                    <select id="aica-bulk-content-type">
                        <option value=""><?php esc_html_e('Select post type or taxonomy...', 'ai-content-automation'); ?></option>
                        <?php if (!empty($content_types['postTypes'])) : ?>
                            <optgroup label="<?php esc_attr_e('Post Types', 'ai-content-automation'); ?>">
                                <?php foreach ($content_types['postTypes'] as $pt) : ?>
                                    <option value="post_type:<?php echo esc_attr($pt['slug']); ?>">
                                        <?php echo esc_html($pt['name']); ?>
                                    </option>
                                <?php endforeach; ?>
                            </optgroup>
                        <?php endif; ?>
                        <?php if (!empty($content_types['taxonomies'])) : ?>
                            <optgroup label="<?php esc_attr_e('Taxonomies', 'ai-content-automation'); ?>">
                                <?php foreach ($content_types['taxonomies'] as $tax) : ?>
                                    <option value="taxonomy:<?php echo esc_attr($tax['slug']); ?>">
                                        <?php echo esc_html($tax['name']); ?>
                                    </option>
                                <?php endforeach; ?>
                            </optgroup>
                        <?php endif; ?>
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
