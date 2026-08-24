<?php
/**
 * Plugin Name: AI Content Automation
 * Plugin URI: https://github.com/ai-content-automation
 * Description: Reusable AI-powered content generation tool that automatically generates and fills WordPress/ACF form fields.
 * Version: 1.4.2
 * Author: AI Content Automation
 * License: GPL v2 or later
 * Text Domain: ai-content-automation
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) {
    exit;
}

define('AICA_VERSION', '1.4.2');
define('AICA_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('AICA_PLUGIN_URL', plugin_dir_url(__FILE__));
define('AICA_PLUGIN_BASENAME', plugin_basename(__FILE__));

require_once AICA_PLUGIN_DIR . 'includes/class-aica-settings.php';
require_once AICA_PLUGIN_DIR . 'includes/class-aica-api-client.php';
require_once AICA_PLUGIN_DIR . 'includes/class-aica-field-filler.php';
require_once AICA_PLUGIN_DIR . 'includes/class-aica-data-collector.php';
require_once AICA_PLUGIN_DIR . 'includes/class-aica-bulk-processor.php';
require_once AICA_PLUGIN_DIR . 'includes/class-aica-content-registry.php';
require_once AICA_PLUGIN_DIR . 'includes/class-aica-acf-helper.php';
require_once AICA_PLUGIN_DIR . 'includes/class-aica-acf-schema-builder.php';
require_once AICA_PLUGIN_DIR . 'includes/class-aica-content-saver.php';
require_once AICA_PLUGIN_DIR . 'includes/class-aica-rest-api.php';
require_once AICA_PLUGIN_DIR . 'includes/class-aica-admin.php';

final class AI_Content_Automation {

    private static ?self $instance = null;

    public static function instance(): self {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('init', [$this, 'init']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_admin_assets']);
        register_activation_hook(__FILE__, [$this, 'activate']);
    }

    public function init(): void {
        AICA_Admin::instance();
        AICA_Settings::instance();
        AICA_REST_API::instance();
    }

    public function enqueue_admin_assets(string $hook): void {
        $allowed_hooks = [
            'post.php', 'post-new.php', 'edit.php', 'term.php', 'edit-tags.php',
            'toplevel_page_ai-content-automation',
            'ai-content_page_ai-content-generate',
            'ai-content_page_ai-content-bulk',
            'ai-content_page_ai-content-prompts',
            'ai-content_page_ai-content-settings',
        ];

        if (!in_array($hook, $allowed_hooks, true) && strpos($hook, 'ai-content') === false) {
            return;
        }

        wp_enqueue_style(
            'aica-admin',
            AICA_PLUGIN_URL . 'assets/css/admin.css',
            [],
            AICA_VERSION
        );

        wp_enqueue_script(
            'aica-admin',
            AICA_PLUGIN_URL . 'assets/js/admin.js',
            ['jquery', 'wp-api-fetch'],
            AICA_VERSION,
            true
        );

        wp_localize_script('aica-admin', 'aicaConfig', [
            'apiUrl'         => AICA_Settings::get('api_url', 'http://localhost:3001'),
            'projectId'      => AICA_Settings::get('project_id', ''),
            'restUrl'        => rest_url('ai-content/v1/'),
            'nonce'          => wp_create_nonce('wp_rest'),
            'applyMode'      => AICA_Settings::get('default_apply_mode', 'preview'),
            'strings'        => [
                'generating'   => __('Generating content...', 'ai-content-automation'),
                'success'      => __('Content generated successfully!', 'ai-content-automation'),
                'error'        => __('Generation failed. Please try again.', 'ai-content-automation'),
                'confirmApply' => __('Apply generated content to fields?', 'ai-content-automation'),
                'preview'      => __('Preview Generated Content', 'ai-content-automation'),
                'apply'        => __('Apply to Fields', 'ai-content-automation'),
                'cancel'       => __('Cancel', 'ai-content-automation'),
            ],
        ]);
    }

    public function activate(): void {
        if (!get_option('aica_settings')) {
            update_option('aica_settings', [
                'api_url'           => 'http://localhost:3001',
                'project_id'        => '',
                'default_apply_mode' => 'preview',
                'default_prompt_id'  => '',
            ]);
        }
    }
}

AI_Content_Automation::instance();
