<?php
if (!defined('ABSPATH')) exit;

class AICA_Content_Saver {

    public static function save_mapped_fields(
        string $item_type,
        int $item_id,
        string $taxonomy,
        array $mapped_fields,
        string $apply_mode = 'replace'
    ): array {
        $results = [];
        $object_id = $item_type === 'term' ? "{$taxonomy}_{$item_id}" : $item_id;

        foreach ($mapped_fields as $field) {
            $value = $field['value'] ?? '';
            if ($value === '' || $value === null) {
                $results[] = array_merge($field, ['saved' => false, 'reason' => 'Empty value']);
                continue;
            }

            if ($apply_mode === 'empty_only' && self::field_has_content($item_type, $item_id, $taxonomy, $field)) {
                $results[] = array_merge($field, ['saved' => false, 'reason' => 'Field already has content']);
                continue;
            }

            $value = AICA_ACF_Helper::normalize_ai_value(
                is_string($value) ? AICA_ACF_Helper::parse_value($value) : $value
            );
            $value = AICA_ACF_Schema_Builder::strip_excluded_keys($value);
            $saved = self::save_field($item_type, $item_id, $taxonomy, $object_id, $field, $value);
            $results[] = array_merge($field, ['saved' => $saved]);
        }

        return $results;
    }

    private static function save_field(string $item_type, int $item_id, string $taxonomy, $object_id, array $field, $value): bool {
        $target_type  = $field['targetType'] ?? '';
        $target_field = $field['targetField'] ?? '';

        if ($item_type === 'term') {
            return self::save_term_field($item_id, $taxonomy, $object_id, $target_type, $target_field, $value);
        }

        return self::save_post_field($item_id, $object_id, $target_type, $target_field, $value);
    }

    private static function save_post_field(int $post_id, $object_id, string $target_type, string $target_field, $value): bool {
        switch ($target_type) {
            case 'post_field':
                return self::update_post_core_field($post_id, $target_field, $value);

            case 'gutenberg':
                $field = $target_field !== '' ? $target_field : 'post_content';
                if ($field !== 'post_content') {
                    return (bool) update_post_meta($post_id, $field, $value);
                }
                return self::update_post_core_field($post_id, 'post_content', self::prepare_gutenberg_content($value));

            case 'acf':
            case 'acf_nested':
                if (strpos($target_field, '.') !== false) {
                    return AICA_ACF_Helper::save_field_path($target_field, $value, $object_id);
                }
                if (function_exists('update_field')) {
                    $parsed = is_string($value) ? AICA_ACF_Helper::parse_value($value) : $value;
                    update_field($target_field, $parsed, $object_id);
                    $saved = AICA_ACF_Helper::get_value_at_path($target_field, $object_id);
                    return AICA_ACF_Helper::verify_saved($saved, $parsed);
                }
                return (bool) update_post_meta($post_id, $target_field, $value);

            case 'meta':
                return (bool) update_post_meta($post_id, $target_field, $value);

            default:
                if (strpos($target_field, '.') !== false && function_exists('update_field')) {
                    return AICA_ACF_Helper::save_field_path($target_field, $value, $object_id);
                }
                return (bool) update_post_meta($post_id, $target_field, $value);
        }
    }

    private static function save_term_field(int $term_id, string $taxonomy, $object_id, string $target_type, string $target_field, $value): bool {
        switch ($target_type) {
            case 'term_field':
                if ($target_field === 'description' || $target_field === 'name') {
                    $result = wp_update_term($term_id, $taxonomy, [$target_field => $value]);
                    return !is_wp_error($result);
                }
                return false;

            case 'acf':
            case 'acf_nested':
                if (strpos($target_field, '.') !== false) {
                    return AICA_ACF_Helper::save_field_path($target_field, $value, $object_id);
                }
                if (function_exists('update_field')) {
                    $parsed = is_string($value) ? AICA_ACF_Helper::parse_value($value) : $value;
                    update_field($target_field, $parsed, $object_id);
                    $saved = AICA_ACF_Helper::get_value_at_path($target_field, $object_id);
                    return AICA_ACF_Helper::verify_saved($saved, $parsed);
                }
                return (bool) update_term_meta($term_id, $target_field, $value);

            case 'meta':
                return (bool) update_term_meta($term_id, $target_field, $value);

            default:
                if (strpos($target_field, '.') !== false && function_exists('update_field')) {
                    return AICA_ACF_Helper::save_field_path($target_field, $value, $object_id);
                }
                return (bool) update_term_meta($term_id, $target_field, $value);
        }
    }

    private static function field_has_content(string $item_type, int $item_id, string $taxonomy, array $field): bool {
        $target_type  = $field['targetType'] ?? '';
        $target_field = $field['targetField'] ?? '';
        $object_id    = $item_type === 'term' ? "{$taxonomy}_{$item_id}" : $item_id;

        if ($item_type === 'term') {
            if ($target_type === 'term_field' && $target_field === 'description') {
                $term = get_term($item_id, $taxonomy);
                return $term && !is_wp_error($term) && trim($term->description) !== '';
            }
            if (function_exists('get_field')) {
                $val = strpos($target_field, '.') !== false
                    ? self::get_nested_value(get_field(explode('.', $target_field)[0], $object_id), array_slice(explode('.', $target_field), 1))
                    : get_field($target_field, $object_id);
                return !empty($val);
            }
            return (bool) get_term_meta($item_id, $target_field, true);
        }

        if ($target_type === 'post_field' || $target_type === 'gutenberg') {
            $post = get_post($item_id);
            if (!$post) return false;
            $field = $target_type === 'gutenberg' ? 'post_content' : $target_field;
            $map = ['post_title' => 'post_title', 'post_content' => 'post_content', 'post_excerpt' => 'post_excerpt'];
            $prop = $map[$field] ?? '';
            return $prop && trim($post->$prop) !== '';
        }
        if (function_exists('get_field')) {
            $val = strpos($target_field, '.') !== false
                ? self::get_nested_value(get_field(explode('.', $target_field)[0], $object_id), array_slice(explode('.', $target_field), 1))
                : get_field($target_field, $object_id);
            return !empty($val);
        }
        return (bool) get_post_meta($item_id, $target_field, true);
    }

    private static function get_nested_value($data, array $parts) {
        foreach ($parts as $part) {
            if (!is_array($data) || !isset($data[$part])) {
                return null;
            }
            $data = $data[$part];
        }
        return $data;
    }

    private static function update_post_core_field(int $post_id, string $field, $value): bool {
        $allowed = ['post_title', 'post_content', 'post_excerpt'];
        if (!in_array($field, $allowed, true)) {
            return false;
        }

        $string_value = is_string($value) ? $value : wp_json_encode($value);
        $result = wp_update_post([
            'ID'   => $post_id,
            $field => $string_value,
        ], true);

        if (is_wp_error($result)) {
            return false;
        }

        $post = get_post($post_id);
        if (!$post) {
            return false;
        }

        return trim((string) $post->$field) !== '';
    }

    /**
     * Convert AI HTML/text into Gutenberg-compatible post_content markup.
     */
    public static function prepare_gutenberg_content($value): string {
        if (!is_string($value)) {
            $value = is_array($value) ? wp_json_encode($value) : (string) $value;
        }

        $value = trim($value);
        if ($value === '') {
            return '';
        }

        if (strpos($value, '<!-- wp:') !== false) {
            return $value;
        }

        if (function_exists('serialize_blocks') && function_exists('parse_blocks')) {
            $blocks = parse_blocks($value);
            $blocks = array_values(array_filter($blocks, static function ($block) {
                if (!empty($block['blockName'])) {
                    return true;
                }
                return trim(strip_tags($block['innerHTML'] ?? '')) !== '';
            }));

            if (!empty($blocks)) {
                return serialize_blocks($blocks);
            }

            $paragraphs = preg_split('/\R{2,}/', wp_strip_all_tags($value)) ?: [];
            $blocks = [];
            foreach ($paragraphs as $paragraph) {
                $paragraph = trim($paragraph);
                if ($paragraph === '') {
                    continue;
                }
                $blocks[] = [
                    'blockName'    => 'core/paragraph',
                    'attrs'        => [],
                    'innerBlocks'  => [],
                    'innerHTML'    => '<p>' . esc_html($paragraph) . '</p>',
                    'innerContent' => ['<p>' . esc_html($paragraph) . '</p>'],
                ];
            }

            if (!empty($blocks)) {
                return serialize_blocks($blocks);
            }
        }

        return wpautop(wp_kses_post($value));
    }
}
