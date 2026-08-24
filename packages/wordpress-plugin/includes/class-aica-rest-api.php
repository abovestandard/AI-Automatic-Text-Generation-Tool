<?php
if (!defined('ABSPATH')) exit;

class AICA_REST_API {

    private static ?self $instance = null;

    public static function instance(): self {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('rest_api_init', [$this, 'register_routes']);
    }

    public function register_routes(): void {
        $namespace = 'ai-content/v1';

        register_rest_route($namespace, '/generate', [
            'methods'             => 'POST',
            'callback'            => [$this, 'generate_content'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($namespace, '/prompts', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_prompts'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($namespace, '/mappings', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_mappings'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($namespace, '/collect-data', [
            'methods'             => 'POST',
            'callback'            => [$this, 'collect_data'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($namespace, '/apply-fields', [
            'methods'             => 'POST',
            'callback'            => [$this, 'apply_fields'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($namespace, '/bulk/items', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_bulk_items'],
            'permission_callback' => [$this, 'check_permission'],
            'args'                => [
                'contentType' => ['required' => true, 'type' => 'string'],
            ],
        ]);

        register_rest_route($namespace, '/bulk/generate', [
            'methods'             => 'POST',
            'callback'            => [$this, 'bulk_generate'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($namespace, '/bulk/status/(?P<job_id>[a-zA-Z0-9-]+)', [
            'methods'             => 'GET',
            'callback'            => [$this, 'bulk_status'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($namespace, '/bulk/retry/(?P<job_id>[a-zA-Z0-9-]+)', [
            'methods'             => 'POST',
            'callback'            => [$this, 'bulk_retry'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($namespace, '/bulk/apply-item', [
            'methods'             => 'POST',
            'callback'            => [$this, 'bulk_apply_item'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($namespace, '/content-types', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_content_types'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($namespace, '/items', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_items'],
            'permission_callback' => [$this, 'check_permission'],
            'args'                => [
                'type' => ['required' => true, 'type' => 'string'],
                'slug' => ['required' => true, 'type' => 'string'],
                'search' => ['type' => 'string', 'default' => ''],
            ],
        ]);

        register_rest_route($namespace, '/save-content', [
            'methods'             => 'POST',
            'callback'            => [$this, 'save_content'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($namespace, '/acf-schema', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_acf_schema'],
            'permission_callback' => [$this, 'check_permission'],
            'args'                => [
                'type' => ['required' => true, 'type' => 'string'],
                'slug' => ['required' => true, 'type' => 'string'],
                'itemId' => ['type' => 'integer', 'default' => 0],
                'itemType' => ['type' => 'string', 'default' => 'term'],
                'taxonomy' => ['type' => 'string', 'default' => ''],
            ],
        ]);

        register_rest_route($namespace, '/acf-fields', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_acf_fields'],
            'permission_callback' => [$this, 'check_permission'],
            'args'                => [
                'type' => ['required' => true, 'type' => 'string'],
                'slug' => ['required' => true, 'type' => 'string'],
            ],
        ]);

        register_rest_route($namespace, '/test-connection', [
            'methods'             => 'GET',
            'callback'            => [$this, 'test_connection'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    public function check_permission(): bool {
        return current_user_can('edit_posts');
    }

    public function generate_content(WP_REST_Request $request): WP_REST_Response {
        $project_id = AICA_Settings::get('project_id', '');
        if ($project_id === '') {
            return new WP_REST_Response([
                'error' => 'Project ID is not configured. Go to AI Content → Settings and enter your Project ID from the platform dashboard.',
            ], 400);
        }

        $api_url = AICA_Settings::get('api_url', '');
        if ($api_url === '') {
            return new WP_REST_Response([
                'error' => 'Platform API URL is not configured. Go to AI Content → Settings.',
            ], 400);
        }

        $client = new AICA_API_Client();
        $params = $request->get_json_params();

        $item_type = sanitize_text_field($params['itemType'] ?? 'post');
        $item_id   = (int) ($params['itemId'] ?? 0);
        $taxonomy  = sanitize_text_field($params['taxonomy'] ?? '');

        if ($item_type === 'term') {
            $source_data = AICA_Data_Collector::collect_term_data($item_id, $taxonomy);
        } else {
            $source_data = AICA_Data_Collector::collect_post_data($item_id);
        }

        $images = AICA_Data_Collector::collect_images($source_data);

        // Include user-uploaded reference images
        $uploaded = $params['uploadedImages'] ?? [];
        if (is_array($uploaded)) {
            foreach ($uploaded as $img) {
                if (!empty($img['base64'])) {
                    $images[] = [
                        'key'      => sanitize_text_field($img['key'] ?? 'uploaded_image'),
                        'url'      => '',
                        'base64'   => $img['base64'],
                        'mimeType' => sanitize_text_field($img['mimeType'] ?? 'image/jpeg'),
                    ];
                }
            }
        }

        $payload = [
            'promptId'   => sanitize_text_field($params['promptId'] ?? ''),
            'itemId'     => $item_id,
            'itemType'   => $item_type,
            'taxonomy'   => $taxonomy,
            'sourceData' => $source_data,
            'images'     => $images,
            'applyMode'  => sanitize_text_field($params['applyMode'] ?? 'preview'),
        ];

        $acf_auto = !empty($params['acfAuto']);
        $acf_schema = null;
        $acf_meta   = ['autoMode' => false, 'fallbackManual' => false, 'fieldCount' => 0, 'fields' => []];

        if ($item_type === 'term') {
            $slug = $taxonomy;
        } else {
            $slug = sanitize_text_field($params['postType'] ?? '') ?: get_post_type($item_id);
            $payload['postType'] = $slug;
        }

        $resolved = AICA_Generation_Helper::apply_acf_auto_to_payload(
            $payload,
            $acf_auto,
            $item_type,
            $slug ?: '',
            $source_data
        );
        $payload  = $resolved['payload'];
        $acf_meta = $resolved['meta'];
        $acf_schema = $payload['acfSchema'] ?? null;

        $result = $client->generate($payload);

        if (isset($result['error'])) {
            return new WP_REST_Response(['error' => $result['error'], 'result' => null], 500);
        }

        if (($result['status'] ?? '') === 'error') {
            return new WP_REST_Response([
                'result' => $result,
                'error'  => $result['error'] ?? 'Generation failed',
            ], 200);
        }

        $fill_instructions = AICA_Field_Filler::get_js_fill_instructions($result['mappedFields'] ?? []);

        return new WP_REST_Response([
            'result'            => $result,
            'fillInstructions'  => $fill_instructions,
            'acfMeta'           => [
                'autoMode'       => $acf_meta['autoMode'],
                'fallbackManual' => $acf_meta['fallbackManual'],
                'fieldCount'     => $acf_meta['fieldCount'],
                'fields'         => $acf_meta['fields'],
            ],
        ]);
    }

    public function get_prompts(WP_REST_Request $request): WP_REST_Response {
        $project_id = AICA_Settings::get('project_id', '');
        if (empty($project_id)) {
            return new WP_REST_Response([
                'error' => 'Project ID is not configured. Go to AI Content → Settings and enter your Project ID.',
            ], 400);
        }

        $client = new AICA_API_Client();
        $prompts = $client->get_prompts();

        if (isset($prompts['error'])) {
            return new WP_REST_Response(['error' => $prompts['error']], 500);
        }

        return new WP_REST_Response($prompts);
    }

    public function get_mappings(WP_REST_Request $request): WP_REST_Response {
        $client = new AICA_API_Client();
        $prompt_id = $request->get_param('promptId');
        $mappings = $client->get_mappings($prompt_id);
        return new WP_REST_Response($mappings);
    }

    public function collect_data(WP_REST_Request $request): WP_REST_Response {
        $params = $request->get_json_params();
        $item_type = sanitize_text_field($params['itemType'] ?? 'post');
        $item_id   = (int) ($params['itemId'] ?? 0);
        $taxonomy  = sanitize_text_field($params['taxonomy'] ?? '');

        if ($item_type === 'term') {
            $data = AICA_Data_Collector::collect_term_data($item_id, $taxonomy);
        } else {
            $data = AICA_Data_Collector::collect_post_data($item_id);
        }

        return new WP_REST_Response([
            'sourceData' => $data,
            'images'     => AICA_Data_Collector::collect_images($data),
        ]);
    }

    public function apply_fields(WP_REST_Request $request): WP_REST_Response {
        $params = $request->get_json_params();
        $mapped_fields = $params['mappedFields'] ?? [];
        $apply_mode    = sanitize_text_field($params['applyMode'] ?? 'preview');

        $instructions = AICA_Field_Filler::get_js_fill_instructions($mapped_fields);

        return new WP_REST_Response([
            'instructions' => $instructions,
            'message'      => 'Field fill instructions generated. Apply via JavaScript.',
        ]);
    }

    public function get_bulk_items(WP_REST_Request $request): WP_REST_Response {
        $content_type = sanitize_text_field($request->get_param('contentType'));
        $items = AICA_Bulk_Processor::get_items_for_type($content_type);
        return new WP_REST_Response($items);
    }

    public function bulk_generate(WP_REST_Request $request): WP_REST_Response {
        $params = $request->get_json_params();
        $items  = $params['items'] ?? [];

        if (empty($items)) {
            return new WP_REST_Response(['error' => 'No items selected for bulk generation.'], 400);
        }

        if (empty($params['promptId'])) {
            return new WP_REST_Response(['error' => 'Prompt ID is required.'], 400);
        }

        $job = AICA_Bulk_Processor::create_job([
            'promptId'  => sanitize_text_field($params['promptId'] ?? ''),
            'name'      => sanitize_text_field($params['name'] ?? 'Bulk Generation'),
            'items'     => $items,
            'applyMode' => sanitize_text_field($params['applyMode'] ?? 'empty_only'),
            'acfAuto'   => !empty($params['acfAuto']),
        ]);

        return new WP_REST_Response(['job' => $job]);
    }

    public function bulk_status(WP_REST_Request $request): WP_REST_Response {
        $job_id = sanitize_text_field($request->get_param('job_id'));
        $job    = AICA_Bulk_Processor::get_job($job_id);

        if (!$job) {
            return new WP_REST_Response(['error' => 'Bulk job not found.'], 404);
        }

        if (in_array($job['status'], ['queued', 'running'], true)) {
            $job = AICA_Bulk_Processor::process_next($job_id);
        }

        if (!$job) {
            return new WP_REST_Response(['error' => 'Bulk job not found.'], 404);
        }

        return new WP_REST_Response([
            'id'          => $job['id'],
            'status'      => $job['status'],
            'applyMode'   => $job['applyMode'],
            'acfAuto'     => !empty($job['acfAuto']),
            'items'       => $job['items'],
            'createdAt'   => $job['createdAt'],
            'updatedAt'   => $job['updatedAt'],
            'completedAt' => $job['completedAt'] ?? null,
            'stats'       => AICA_Bulk_Processor::get_job_stats($job),
        ]);
    }

    public function bulk_apply_item(WP_REST_Request $request): WP_REST_Response {
        $params = $request->get_json_params();
        $job_id = sanitize_text_field($params['jobId'] ?? '');
        $item_id = sanitize_text_field($params['itemId'] ?? '');
        $mapped_fields = $params['mappedFields'] ?? [];
        $save_mode = sanitize_text_field($params['saveMode'] ?? 'replace');

        if ($job_id === '' || $item_id === '') {
            return new WP_REST_Response(['error' => 'Job ID and item ID are required.'], 400);
        }

        try {
            $result = AICA_Bulk_Processor::apply_item($job_id, $item_id, $mapped_fields, $save_mode);
            return new WP_REST_Response([
                'success' => true,
                'saved'   => $result['saved'],
                'total'   => $result['total'],
                'results' => $result['results'],
                'item'    => $result['item'],
            ]);
        } catch (Exception $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 400);
        }
    }

    public function bulk_retry(WP_REST_Request $request): WP_REST_Response {
        $job_id = sanitize_text_field($request->get_param('job_id'));
        $job    = AICA_Bulk_Processor::retry_failed($job_id);

        if (!$job) {
            return new WP_REST_Response(['error' => 'Bulk job not found.'], 404);
        }

        return new WP_REST_Response([
            'job'   => $job,
            'stats' => AICA_Bulk_Processor::get_job_stats($job),
        ]);
    }

    public function save_content(WP_REST_Request $request): WP_REST_Response {
        $params = $request->get_json_params();
        $item_type = sanitize_text_field($params['itemType'] ?? 'post');
        $item_id   = (int) ($params['itemId'] ?? 0);
        $taxonomy  = sanitize_text_field($params['taxonomy'] ?? '');
        $apply_mode = sanitize_text_field($params['applyMode'] ?? 'replace');
        $mapped_fields = $params['mappedFields'] ?? [];

        if (!$item_id) {
            return new WP_REST_Response(['error' => 'Item ID is required'], 400);
        }

        $results = AICA_Content_Saver::save_mapped_fields(
            $item_type,
            $item_id,
            $taxonomy,
            $mapped_fields,
            $apply_mode
        );

        $saved = count(array_filter($results, fn($r) => !empty($r['saved'])));

        return new WP_REST_Response([
            'success' => true,
            'saved'   => $saved,
            'total'   => count($results),
            'results' => $results,
        ]);
    }

    public function get_content_types(): WP_REST_Response {
        return new WP_REST_Response(AICA_Content_Registry::get_content_types());
    }

    public function get_items(WP_REST_Request $request): WP_REST_Response {
        $type   = sanitize_text_field($request->get_param('type'));
        $slug   = sanitize_key($request->get_param('slug'));
        $search = sanitize_text_field($request->get_param('search') ?? '');

        if (!in_array($type, ['post_type', 'taxonomy'], true)) {
            return new WP_REST_Response(['error' => 'Invalid type'], 400);
        }

        $items = AICA_Content_Registry::get_items($type, $slug, 200, $search);
        return new WP_REST_Response($items);
    }

    public function get_acf_schema(WP_REST_Request $request): WP_REST_Response {
        $type = sanitize_text_field($request->get_param('type'));
        $slug = sanitize_key($request->get_param('slug'));
        $item_id   = (int) $request->get_param('itemId');
        $item_type = sanitize_text_field($request->get_param('itemType') ?? 'term');
        $taxonomy  = sanitize_text_field($request->get_param('taxonomy') ?? '');

        if (!in_array($type, ['post_type', 'taxonomy'], true)) {
            return new WP_REST_Response(['error' => 'Invalid type'], 400);
        }

        $source_data = [];
        if ($item_id) {
            if ($item_type === 'term' && $taxonomy) {
                $source_data = AICA_Data_Collector::collect_term_data($item_id, $taxonomy);
            } else {
                $source_data = AICA_Data_Collector::collect_post_data($item_id);
            }
        }

        return new WP_REST_Response(
            AICA_ACF_Schema_Builder::get_generatable_schema($type, $slug, $source_data)
        );
    }

    public function get_acf_fields(WP_REST_Request $request): WP_REST_Response {
        $type = sanitize_text_field($request->get_param('type'));
        $slug = sanitize_key($request->get_param('slug'));

        if (!in_array($type, ['post_type', 'taxonomy'], true)) {
            return new WP_REST_Response(['error' => 'Invalid type'], 400);
        }

        return new WP_REST_Response([
            'available' => AICA_ACF_Helper::is_available(),
            'tree'      => AICA_ACF_Helper::get_field_tree($type, $slug),
            'flat'      => AICA_ACF_Helper::get_flat_fields($type, $slug),
        ]);
    }

    public function test_connection(): WP_REST_Response {
        $client = new AICA_API_Client();
        $result = $client->test_connection();
        return new WP_REST_Response($result);
    }
}
