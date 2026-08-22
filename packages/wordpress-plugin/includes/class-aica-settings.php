<?php
if (!defined('ABSPATH')) exit;

class AICA_Settings {

    private static ?self $instance = null;
    private const OPTION_KEY = 'aica_settings';

    public static function instance(): self {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('admin_init', [$this, 'register_settings']);
    }

    public static function get(string $key, $default = '') {
        $settings = get_option(self::OPTION_KEY, []);
        return $settings[$key] ?? $default;
    }

    public static function set(string $key, $value): void {
        $settings = get_option(self::OPTION_KEY, []);
        $settings[$key] = $value;
        update_option(self::OPTION_KEY, $settings);
    }

    public function register_settings(): void {
        register_setting('aica_settings_group', self::OPTION_KEY, [
            'sanitize_callback' => [$this, 'sanitize_settings'],
        ]);
    }

    public function sanitize_settings(array $input): array {
        return [
            'api_url'            => esc_url_raw($input['api_url'] ?? ''),
            'project_id'         => sanitize_text_field($input['project_id'] ?? ''),
            'default_apply_mode' => sanitize_text_field($input['default_apply_mode'] ?? 'preview'),
            'default_prompt_id'  => sanitize_text_field($input['default_prompt_id'] ?? ''),
            'openai_api_key'     => sanitize_text_field($input['openai_api_key'] ?? ''),
        ];
    }

    public function render_settings_page(): void {
        $settings = get_option(self::OPTION_KEY, []);
        $apply_modes = [
            'generate_only' => __('Generate Only', 'ai-content-automation'),
            'preview'         => __('Generate & Preview', 'ai-content-automation'),
            'empty_only'      => __('Fill Empty Fields Only', 'ai-content-automation'),
            'replace'         => __('Replace Existing Content', 'ai-content-automation'),
            'save_draft'      => __('Save as Draft', 'ai-content-automation'),
        ];
        ?>
        <div class="wrap">
            <h1><?php esc_html_e('AI Content Automation – Settings', 'ai-content-automation'); ?></h1>
            <form method="post" action="options.php">
                <?php settings_fields('aica_settings_group'); ?>
                <table class="form-table">
                    <tr>
                        <th><label for="api_url"><?php esc_html_e('Platform API URL', 'ai-content-automation'); ?></label></th>
                        <td>
                            <input type="url" id="api_url" name="<?php echo esc_attr(self::OPTION_KEY); ?>[api_url]"
                                   value="<?php echo esc_attr($settings['api_url'] ?? ''); ?>" class="regular-text"
                                   placeholder="http://localhost:3001" />
                            <p class="description"><?php esc_html_e('URL of the AI Content Automation platform API.', 'ai-content-automation'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th><label for="project_id"><?php esc_html_e('Project ID', 'ai-content-automation'); ?></label></th>
                        <td>
                            <input type="text" id="project_id" name="<?php echo esc_attr(self::OPTION_KEY); ?>[project_id]"
                                   value="<?php echo esc_attr($settings['project_id'] ?? ''); ?>" class="regular-text" />
                            <p class="description"><?php esc_html_e('Project ID from the platform dashboard.', 'ai-content-automation'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th><label for="default_apply_mode"><?php esc_html_e('Default Apply Mode', 'ai-content-automation'); ?></label></th>
                        <td>
                            <select id="default_apply_mode" name="<?php echo esc_attr(self::OPTION_KEY); ?>[default_apply_mode]">
                                <?php foreach ($apply_modes as $value => $label) : ?>
                                    <option value="<?php echo esc_attr($value); ?>" <?php selected($settings['default_apply_mode'] ?? 'preview', $value); ?>>
                                        <?php echo esc_html($label); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th><label for="default_prompt_id"><?php esc_html_e('Default Prompt ID', 'ai-content-automation'); ?></label></th>
                        <td>
                            <input type="text" id="default_prompt_id" name="<?php echo esc_attr(self::OPTION_KEY); ?>[default_prompt_id]"
                                   value="<?php echo esc_attr($settings['default_prompt_id'] ?? ''); ?>" class="regular-text" />
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
            <div id="aica-connection-test" style="margin-top: 20px;">
                <button type="button" class="button" id="aica-test-connection">
                    <?php esc_html_e('Test Connection', 'ai-content-automation'); ?>
                </button>
                <span id="aica-connection-status"></span>
            </div>
        </div>
        <?php
    }
}
