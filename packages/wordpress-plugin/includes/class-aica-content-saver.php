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
                $update = ['ID' => $post_id];
                if ($target_field === 'post_title') {
                    $update['post_title'] = $value;
                } elseif ($target_field === 'post_content') {
                    $update['post_content'] = $value;
                } elseif ($target_field === 'post_excerpt') {
                    $update['post_excerpt'] = $value;
                } else {
                    return false;
                }
                $result = wp_update_post($update, true);
                return !is_wp_error($result);

            case 'acf':
            case 'acf_nested':
                if (strpos($target_field, '.') !== false) {
                    return AICA_ACF_Helper::save_field_path($target_field, $value, $object_id);
                }
                if (function_exists('update_field')) {
                    return (bool) update_field($target_field, $value, $object_id);
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
                    return (bool) update_field($target_field, $value, $object_id);
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

        if ($target_type === 'post_field') {
            $post = get_post($item_id);
            if (!$post) return false;
            $map = ['post_title' => 'post_title', 'post_content' => 'post_content', 'post_excerpt' => 'post_excerpt'];
            $prop = $map[$target_field] ?? '';
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
}
