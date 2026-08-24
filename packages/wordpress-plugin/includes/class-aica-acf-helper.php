<?php
if (!defined('ABSPATH')) exit;

class AICA_ACF_Helper {

    public static function is_available(): bool {
        return function_exists('acf_get_field_groups') && function_exists('acf_get_fields');
    }

    /**
     * Get ACF field tree for a post type or taxonomy.
     */
    public static function get_field_tree(string $kind, string $slug): array {
        if (!self::is_available()) {
            return [];
        }

        $location = $kind === 'taxonomy'
            ? ['taxonomy' => $slug]
            : ['post_type' => $slug];

        $groups = acf_get_field_groups($location);
        $tree = [];

        foreach ($groups as $group) {
            $fields = acf_get_fields($group['key']);
            if ($fields) {
                $tree[] = [
                    'group'  => $group['title'],
                    'key'    => $group['key'],
                    'fields' => self::parse_fields($fields),
                ];
            }
        }

        return $tree;
    }

    /**
     * Flat list of all mappable fields with dot-notation paths.
     */
    public static function get_flat_fields(string $kind, string $slug): array {
        $tree = self::get_field_tree($kind, $slug);
        $flat = [];
        foreach ($tree as $group) {
            self::flatten_fields($group['fields'], $flat);
        }
        return $flat;
    }

    private static function parse_fields(array $fields, string $prefix = ''): array {
        $result = [];
        foreach ($fields as $field) {
            if (empty($field['name'])) {
                continue;
            }
            $path = $prefix ? "{$prefix}.{$field['name']}" : $field['name'];
            $entry = [
                'name'  => $field['name'],
                'label' => $field['label'] ?? $field['name'],
                'type'  => $field['type'] ?? 'text',
                'path'  => $path,
            ];

            if (in_array($field['type'], ['group', 'repeater', 'flexible_content'], true) && !empty($field['sub_fields'])) {
                $entry['children'] = self::parse_fields($field['sub_fields'], $path);
                if ($field['type'] === 'repeater') {
                    $entry['isRepeater'] = true;
                }
            }

            $result[] = $entry;
        }
        return $result;
    }

    private static function flatten_fields(array $fields, array &$flat, int $depth = 0): void {
        foreach ($fields as $field) {
            if (!in_array($field['type'], ['group', 'repeater', 'flexible_content', 'tab', 'accordion'], true)) {
                $flat[] = [
                    'path'  => $field['path'],
                    'label' => $field['label'],
                    'type'  => $field['type'],
                    'depth' => $depth,
                ];
            }
            if (!empty($field['children'])) {
                self::flatten_fields($field['children'], $flat, $depth + 1);
            }
            if (!empty($field['isRepeater'])) {
                $flat[] = [
                    'path'       => $field['path'],
                    'label'      => $field['label'] . ' (Repeater – use JSON array)',
                    'type'       => 'repeater',
                    'depth'      => $depth,
                    'isRepeater' => true,
                ];
            }
        }
    }

    /**
     * Flatten existing ACF values for prompt variables using dot notation.
     */
    public static function flatten_values(array $fields, string $prefix = ''): array {
        $flat = [];
        foreach ($fields as $key => $value) {
            $path = $prefix ? "{$prefix}.{$key}" : $key;
            if (is_array($value) && self::is_assoc_array($value)) {
                $flat = array_merge($flat, self::flatten_values($value, $path));
            } elseif (is_array($value) && !empty($value) && is_array($value[0] ?? null)) {
                $flat[$path] = wp_json_encode($value);
            } elseif (is_string($value) || is_numeric($value)) {
                $flat[$path] = (string) $value;
                $flat[str_replace('.', '_', $path)] = (string) $value;
            }
        }
        return $flat;
    }

    /**
     * Save a value to an ACF field using dot-notation path.
     * Supports nested groups, repeaters, text, and wysiwyg fields.
     */
    public static function save_field_path(string $path, $value, $object_id): bool {
        if (!function_exists('update_field')) {
            return false;
        }

        $parsed = self::parse_value($value);
        $parts  = explode('.', $path);

        if (count($parts) === 1) {
            return (bool) update_field($parts[0], $parsed, $object_id);
        }

        $root   = $parts[0];
        $nested = self::build_nested_value(array_slice($parts, 1), $parsed);

        $existing = get_field($root, $object_id);
        if (is_array($existing) && is_array($nested)) {
            $nested = self::deep_merge_nested($existing, $nested);
        }

        return (bool) update_field($root, $nested, $object_id);
    }

    /**
     * Merge nested ACF data: replace repeater rows entirely, merge group sub-fields.
     */
    private static function deep_merge_nested(array $base, array $overlay): array {
        foreach ($overlay as $key => $value) {
            if (is_array($value) && self::is_list_array($value)) {
                $base[$key] = self::normalize_repeater_rows($value);
            } elseif (is_array($value) && is_array($base[$key] ?? null) && self::is_assoc_array($value)) {
                $base[$key] = self::deep_merge_nested($base[$key], $value);
            } else {
                $base[$key] = $value;
            }
        }
        return $base;
    }

    /**
     * Normalize repeater row values (decode JSON strings, merge nested repeaters).
     */
    private static function normalize_repeater_rows(array $rows): array {
        $normalized = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $item = [];
            foreach ($row as $key => $val) {
                $val = self::parse_value($val);
                if (is_array($val) && self::is_list_array($val)) {
                    $item[$key] = self::normalize_repeater_rows($val);
                } else {
                    $item[$key] = $val;
                }
            }
            $normalized[] = $item;
        }
        return $normalized;
    }

    private static function is_list_array(array $arr): bool {
        if ($arr === []) {
            return true;
        }
        return array_keys($arr) === range(0, count($arr) - 1);
    }

    private static function build_nested_value(array $parts, $value): array {
        if (count($parts) === 1) {
            return [$parts[0] => $value];
        }
        return [$parts[0] => self::build_nested_value(array_slice($parts, 1), $value)];
    }

    public static function parse_value($value) {
        if (!is_string($value)) {
            return $value;
        }
        $trimmed = trim($value);
        if ($trimmed !== '' && ($trimmed[0] === '[' || $trimmed[0] === '{')) {
            $decoded = json_decode($trimmed, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                return $decoded;
            }
        }
        return $value;
    }

    private static function is_assoc_array(array $arr): bool {
        if ($arr === []) {
            return false;
        }
        return array_keys($arr) !== range(0, count($arr) - 1);
    }
}
