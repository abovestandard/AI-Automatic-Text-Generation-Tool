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

        foreach ($mapped_fields as $field) {
            $value = $field['value'] ?? '';
            if ($value === '') {
                $results[] = array_merge($field, ['saved' => false, 'reason' => 'Empty value']);
                continue;
            }

            if ($apply_mode === 'empty_only' && self::field_has_content($item_type, $item_id, $taxonomy, $field)) {
                $results[] = array_merge($field, ['saved' => false, 'reason' => 'Field already has content']);
                continue;
            }

            $saved = self::save_field($item_type, $item_id, $taxonomy, $field, $value);
            $results[] = array_merge($field, ['saved' => $saved]);
        }

        return $results;
    }

    private static function save_field(string $item_type, int $item_id, string $taxonomy, array $field, string $value): bool {
        $target_type  = $field['targetType'] ?? '';
        $target_field = $field['targetField'] ?? '';

        if ($item_type === 'term') {
            return self::save_term_field($item_id, $taxonomy, $target_type, $target_field, $value);
        }

        return self::save_post_field($item_id, $target_type, $target_field, $value);
    }

    private static function save_post_field(int $post_id, string $target_type, string $target_field, string $value): bool {
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
                if (function_exists('update_field')) {
                    return (bool) update_field($target_field, $value, $post_id);
                }
                return (bool) update_post_meta($post_id, $target_field, $value);

            case 'meta':
                return (bool) update_post_meta($post_id, $target_field, $value);

            default:
                return (bool) update_post_meta($post_id, $target_field, $value);
        }
    }

    private static function save_term_field(int $term_id, string $taxonomy, string $target_type, string $target_field, string $value): bool {
        switch ($target_type) {
            case 'term_field':
                if ($target_field === 'description' || $target_field === 'name') {
                    $result = wp_update_term($term_id, $taxonomy, [$target_field => $value]);
                    return !is_wp_error($result);
                }
                return false;

            case 'acf':
                if (function_exists('update_field')) {
                    return (bool) update_field($target_field, $value, "{$taxonomy}_{$term_id}");
                }
                return (bool) update_term_meta($term_id, $target_field, $value);

            case 'meta':
                return (bool) update_term_meta($term_id, $target_field, $value);

            default:
                return (bool) update_term_meta($term_id, $target_field, $value);
        }
    }

    private static function field_has_content(string $item_type, int $item_id, string $taxonomy, array $field): bool {
        $target_type  = $field['targetType'] ?? '';
        $target_field = $field['targetField'] ?? '';

        if ($item_type === 'term') {
            if ($target_type === 'term_field' && $target_field === 'description') {
                $term = get_term($item_id, $taxonomy);
                return $term && !is_wp_error($term) && trim($term->description) !== '';
            }
            if ($target_type === 'acf' && function_exists('get_field')) {
                return (bool) get_field($target_field, "{$taxonomy}_{$item_id}");
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
        if ($target_type === 'acf' && function_exists('get_field')) {
            return (bool) get_field($target_field, $item_id);
        }
        return (bool) get_post_meta($item_id, $target_field, true);
    }
}
