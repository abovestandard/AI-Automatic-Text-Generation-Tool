<?php
if (!defined('ABSPATH')) exit;

class AICA_Bulk_Processor {

    private const OPTION_KEY = 'aica_bulk_jobs';
    private const MAX_JOBS   = 20;

    public static function get_items_for_type(string $content_type, int $limit = 0): array {
        $parsed = AICA_Content_Registry::parse_content_type($content_type);
        if (!$parsed) {
            return [];
        }

        // Taxonomies load all terms (parents + children); post types keep a sensible cap.
        $fetch_limit = $parsed['kind'] === 'taxonomy' ? 0 : ($limit > 0 ? $limit : 200);
        $items = AICA_Content_Registry::get_items($parsed['kind'], $parsed['slug'], $fetch_limit);

        return array_map(function ($item) use ($parsed) {
            $item_type = $parsed['kind'] === 'taxonomy' ? 'term' : 'post';
            $taxonomy  = $parsed['kind'] === 'taxonomy' ? $parsed['slug'] : '';

            return [
                'itemId'    => $item['id'],
                'itemType'  => $item_type,
                'itemLabel' => $item['label'],
                'taxonomy'  => $taxonomy,
                'postType'  => $parsed['kind'] === 'post_type' ? $parsed['slug'] : '',
                'status'    => $item['status'] ?? '',
                'parentId'  => $item['parentId'] ?? 0,
                'depth'     => $item['depth'] ?? 0,
                'editUrl'   => $item['editUrl'] ?? '',
            ];
        }, $items);
    }

    public static function create_job(array $params): array {
        $items = [];
        foreach ($params['items'] ?? [] as $item) {
            $items[] = [
                'id'          => wp_generate_uuid4(),
                'itemId'      => (int) ($item['itemId'] ?? 0),
                'itemType'    => sanitize_text_field($item['itemType'] ?? 'term'),
                'itemLabel'   => sanitize_text_field($item['itemLabel'] ?? ''),
                'taxonomy'    => sanitize_text_field($item['taxonomy'] ?? ''),
                'postType'    => sanitize_text_field($item['postType'] ?? ''),
                'editUrl'     => esc_url_raw($item['editUrl'] ?? ''),
                'status'      => 'pending',
                'retryCount'  => 0,
                'savedCount'  => 0,
                'applied'     => false,
            ];
        }

        $job = [
            'id'        => wp_generate_uuid4(),
            'promptId'  => sanitize_text_field($params['promptId'] ?? ''),
            'applyMode' => sanitize_text_field($params['applyMode'] ?? 'preview'),
            'acfAuto'   => !empty($params['acfAuto']),
            'name'      => sanitize_text_field($params['name'] ?? 'Bulk Generation'),
            'status'    => 'queued',
            'items'     => $items,
            'createdAt' => current_time('c'),
            'updatedAt' => current_time('c'),
        ];

        self::save_job($job);
        return $job;
    }

    public static function get_job(string $job_id): ?array {
        $jobs = self::get_all_jobs();
        return $jobs[$job_id] ?? null;
    }

    public static function get_job_with_stats(string $job_id): ?array {
        $job = self::get_job($job_id);
        if (!$job) {
            return null;
        }

        return [
            'job'   => $job,
            'stats' => self::get_job_stats($job),
        ];
    }

    /**
     * Process the next pending item in a bulk job (one item per request).
     */
    public static function process_next(string $job_id): ?array {
        $job = self::get_job($job_id);
        if (!$job || in_array($job['status'], ['completed', 'failed'], true)) {
            return $job;
        }

        $job['status']    = 'running';
        $job['updatedAt'] = current_time('c');

        $next_index = null;
        foreach ($job['items'] as $index => $item) {
            if (($item['status'] ?? '') === 'pending') {
                $next_index = $index;
                break;
            }
        }

        if ($next_index === null) {
            $job['status']      = 'completed';
            $job['completedAt'] = current_time('c');
            self::save_job($job);
            return $job;
        }

        $job['items'][$next_index]['status'] = 'processing';
        self::save_job($job);

        try {
            $result = self::process_item($job['items'][$next_index], $job);
            $job = self::get_job($job_id);
            if (!$job) {
                return null;
            }

            $job['items'][$next_index]['status']              = 'completed';
            $job['items'][$next_index]['generationResultId']  = $result['generationResultId'] ?? '';
            $job['items'][$next_index]['savedCount']          = $result['savedCount'] ?? 0;
            $job['items'][$next_index]['generatedContent']    = $result['generatedContent'] ?? [];
            $job['items'][$next_index]['mappedFields']        = $result['mappedFields'] ?? [];
            $job['items'][$next_index]['applied']             = $result['applied'] ?? false;
            $job['items'][$next_index]['acfMeta']             = $result['acfMeta'] ?? [];
            $job['items'][$next_index]['error']               = '';
        } catch (Exception $e) {
            $job = self::get_job($job_id);
            if (!$job) {
                return null;
            }

            $job['items'][$next_index]['status'] = 'failed';
            $job['items'][$next_index]['error']  = $e->getMessage();
        }

        $has_pending = false;
        $has_failed  = false;
        foreach ($job['items'] as $item) {
            if (($item['status'] ?? '') === 'pending') {
                $has_pending = true;
            }
            if (($item['status'] ?? '') === 'failed') {
                $has_failed = true;
            }
        }

        if ($has_pending) {
            $job['status'] = 'running';
        } else {
            $job['status']      = 'completed';
            $job['completedAt'] = current_time('c');
        }

        $job['updatedAt'] = current_time('c');
        self::save_job($job);

        return $job;
    }

    public static function apply_item(string $job_id, string $item_uuid, array $mapped_fields, string $save_mode = 'replace'): array {
        $job = self::get_job($job_id);
        if (!$job) {
            throw new Exception('Bulk job not found.');
        }

        $index = null;
        foreach ($job['items'] as $i => $item) {
            if (($item['id'] ?? '') === $item_uuid) {
                $index = $i;
                break;
            }
        }

        if ($index === null) {
            throw new Exception('Bulk item not found.');
        }

        $item = $job['items'][$index];
        $results = AICA_Content_Saver::save_mapped_fields(
            $item['itemType'] ?? 'term',
            (int) ($item['itemId'] ?? 0),
            $item['taxonomy'] ?? '',
            $mapped_fields,
            $save_mode
        );

        $saved_count = count(array_filter($results, static function ($row) {
            return !empty($row['saved']);
        }));

        $job['items'][$index]['mappedFields'] = $mapped_fields;
        $job['items'][$index]['savedCount']   = $saved_count;
        $job['items'][$index]['applied']       = $saved_count > 0;
        $job['updatedAt']                     = current_time('c');
        self::save_job($job);

        return [
            'saved'   => $saved_count,
            'total'   => count($results),
            'results' => $results,
            'item'    => $job['items'][$index],
        ];
    }

    public static function retry_failed(string $job_id): ?array {
        $job = self::get_job($job_id);
        if (!$job) {
            return null;
        }

        foreach ($job['items'] as $index => $item) {
            if (($item['status'] ?? '') === 'failed') {
                $job['items'][$index]['status']     = 'pending';
                $job['items'][$index]['error']      = '';
                $job['items'][$index]['retryCount'] = (int) ($item['retryCount'] ?? 0) + 1;
            }
        }

        $job['status']      = 'queued';
        $job['completedAt'] = null;
        $job['updatedAt']   = current_time('c');
        self::save_job($job);

        return $job;
    }

    private static function process_item(array $item, array $job): array {
        $client    = new AICA_API_Client();
        $item_id   = (int) ($item['itemId'] ?? 0);
        $item_type = $item['itemType'] ?? 'term';
        $taxonomy  = $item['taxonomy'] ?? '';

        if (!$item_id) {
            throw new Exception('Invalid item ID');
        }

        if ($item_type === 'term') {
            $source_data = AICA_Data_Collector::collect_term_data($item_id, $taxonomy);
        } else {
            $source_data = AICA_Data_Collector::collect_post_data($item_id);
        }

        $payload = [
            'promptId'   => $job['promptId'],
            'itemId'     => $item_id,
            'itemType'   => $item_type,
            'taxonomy'   => $taxonomy,
            'postType'   => $item['postType'] ?? get_post_type($item_id),
            'sourceData' => $source_data,
            'images'     => AICA_Data_Collector::collect_images($source_data),
            'applyMode'  => $job['applyMode'],
        ];

        $slug = $item_type === 'term'
            ? $taxonomy
            : ($item['postType'] ?: get_post_type($item_id));

        $resolved = AICA_Generation_Helper::apply_acf_auto_to_payload(
            $payload,
            !empty($job['acfAuto']),
            $item_type,
            $slug ?: '',
            $source_data
        );
        $payload = $resolved['payload'];
        $acf_meta = $resolved['meta'];

        $result = $client->generate($payload);
        if (!empty($result['error'])) {
            throw new Exception($result['error']);
        }
        if (($result['status'] ?? '') !== 'success') {
            throw new Exception($result['error'] ?? 'Generation failed');
        }

        if (!empty($result['generatedContent']) && is_array($result['generatedContent'])) {
            foreach ($result['generatedContent'] as $key => $content_value) {
                $parsed = is_string($content_value) ? AICA_ACF_Helper::parse_value($content_value) : $content_value;
                if (is_array($parsed)) {
                    $parsed = AICA_ACF_Schema_Builder::strip_excluded_keys($parsed);
                    $result['generatedContent'][$key] = wp_json_encode($parsed);
                }
            }
        }

        if (!empty($result['mappedFields']) && is_array($result['mappedFields'])) {
            foreach ($result['mappedFields'] as $index => $mapped_field) {
                $mapped_value = $mapped_field['value'] ?? '';
                $parsed = is_string($mapped_value) ? AICA_ACF_Helper::parse_value($mapped_value) : $mapped_value;
                if (is_array($parsed)) {
                    $parsed = AICA_ACF_Schema_Builder::strip_excluded_keys($parsed);
                    $result['mappedFields'][$index]['value'] = wp_json_encode($parsed);
                }
            }
        }

        $saved_count = 0;
        $apply_mode  = $job['applyMode'] ?? 'preview';
        $mapped_fields = $result['mappedFields'] ?? [];
        $applied = false;

        if (!in_array($apply_mode, ['preview', 'generate_only'], true)) {
            if (!empty($mapped_fields)) {
                $save_results = AICA_Content_Saver::save_mapped_fields(
                    $item_type,
                    $item_id,
                    $taxonomy,
                    $mapped_fields,
                    $apply_mode
                );
                $saved_count = count(array_filter($save_results, static function ($row) {
                    return !empty($row['saved']);
                }));
                $applied = $saved_count > 0;
            }
        }

        return [
            'generationResultId' => $result['id'] ?? '',
            'savedCount'         => $saved_count,
            'generatedContent'   => $result['generatedContent'] ?? [],
            'mappedFields'       => $mapped_fields,
            'applied'            => $applied,
            'acfMeta'            => $acf_meta,
        ];
    }

    public static function get_job_stats(array $job): array {
        $stats = [
            'total'      => count($job['items'] ?? []),
            'completed'  => 0,
            'processing' => 0,
            'pending'    => 0,
            'failed'     => 0,
            'skipped'    => 0,
            'saved'      => 0,
            'applied'    => 0,
            'awaiting'   => 0,
        ];

        foreach ($job['items'] ?? [] as $item) {
            $status = $item['status'] ?? 'pending';
            if (isset($stats[$status])) {
                $stats[$status]++;
            }
            $stats['saved'] += (int) ($item['savedCount'] ?? 0);
            if (!empty($item['applied'])) {
                $stats['applied']++;
            } elseif (($item['status'] ?? '') === 'completed' && !empty($item['mappedFields'])) {
                $stats['awaiting']++;
            }
        }

        return $stats;
    }

    private static function get_all_jobs(): array {
        $jobs = get_option(self::OPTION_KEY, []);
        return is_array($jobs) ? $jobs : [];
    }

    private static function save_job(array $job): void {
        $jobs = self::get_all_jobs();
        $jobs[$job['id']] = $job;

        if (count($jobs) > self::MAX_JOBS) {
            uasort($jobs, static function ($a, $b) {
                return strcmp($b['updatedAt'] ?? '', $a['updatedAt'] ?? '');
            });
            $jobs = array_slice($jobs, 0, self::MAX_JOBS, true);
        }

        update_option(self::OPTION_KEY, $jobs, false);
    }
}
