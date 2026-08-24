<?php
if (!defined('ABSPATH')) exit;

/**
 * Builds AI output schema and auto-mappings from the live ACF field tree.
 */
class AICA_ACF_Schema_Builder {

    private const SKIP_TYPES = [
        'image', 'file', 'gallery', 'post_object', 'relationship', 'taxonomy',
        'link', 'page_link', 'oembed', 'google_map', 'icon_picker', 'color_picker',
        'true_false', 'button', 'message', 'tab', 'accordion', 'clone', 'separator',
    ];

    private const TEXT_TYPES = [
        'text', 'textarea', 'wysiwyg', 'email', 'url',
    ];

    public static function get_generatable_schema(string $kind, string $slug, array $source_data = []): array {
        $tree = AICA_ACF_Helper::get_field_tree($kind, $slug);

        $output_fields  = [];
        $mappings       = [];
        $schema_entries = [];

        foreach ($tree as $acf_group) {
            foreach ($acf_group['fields'] as $field) {
                self::collect_targets($field, $output_fields, $mappings, $schema_entries, $source_data, $field['path'] ?? ($field['name'] ?? ''));
            }
        }

        return [
            'outputFields'      => $output_fields,
            'mappings'          => $mappings,
            'schemaInstruction' => self::build_instruction($schema_entries, $source_data),
            'fieldCount'        => count($output_fields),
        ];
    }

    private static function collect_targets(
        array $field,
        array &$output_fields,
        array &$mappings,
        array &$schema_entries,
        array $source_data,
        string $path = ''
    ): void {
        $type = $field['type'] ?? 'text';
        $name = $field['name'] ?? '';
        $path = $path !== '' ? $path : ($field['path'] ?? $name);

        if ($name === '' || in_array($type, ['tab', 'accordion', 'message'], true)) {
            return;
        }

        if (self::is_excluded($path, $name)) {
            return;
        }

        // Parent group with multiple section children (groups and/or repeaters)
        if ($type === 'group' && !empty($field['children'])) {
            $child_sections = array_values(array_filter(
                $field['children'],
                fn($c) => in_array($c['type'] ?? '', ['group', 'repeater'], true)
                    && (
                        (($c['type'] ?? '') === 'group' && self::group_has_generatable($c))
                        || (($c['type'] ?? '') === 'repeater' && self::repeater_has_generatable($c))
                    )
            ));

            if (count($child_sections) > 1) {
                foreach ($child_sections as $child) {
                    $is_repeater = ($child['type'] ?? '') === 'repeater';
                    self::add_group_target($child, $output_fields, $mappings, $schema_entries, $source_data, $is_repeater);
                }
                return;
            }
        }

        // Standalone text fields at taxonomy/post level
        if (in_array($type, self::TEXT_TYPES, true)) {
            $output_fields[] = [
                'key'         => $name,
                'label'       => $field['label'] ?? $name,
                'type'        => $type === 'wysiwyg' ? 'html' : 'text',
                'description' => 'Text field',
            ];
            $mappings[] = [
                'aiOutputKey' => $name,
                'targetType'  => 'acf_nested',
                'targetField' => $field['path'],
            ];
            $schema_entries[] = [
                'key'    => $name,
                'path'   => $field['path'],
                'schema' => $type === 'wysiwyg' ? ['_type' => 'html'] : ['_type' => 'text'],
            ];
            return;
        }

        if ($type === 'group' && self::group_has_generatable($field)) {
            self::add_group_target($field, $output_fields, $mappings, $schema_entries, $source_data);
            return;
        }

        if ($type === 'repeater' && self::repeater_has_generatable($field)) {
            self::add_group_target($field, $output_fields, $mappings, $schema_entries, $source_data, true);
        }
    }

    private static function add_group_target(
        array $field,
        array &$output_fields,
        array &$mappings,
        array &$schema_entries,
        array $source_data,
        bool $is_repeater = false
    ): void {
        $name  = $field['name'];
        $path  = $field['path'];
        $label = $field['label'] ?? $name;

        if (self::is_excluded($path, $name)) {
            return;
        }

        $output_fields[] = [
            'key'         => $name,
            'label'       => $label,
            'type'        => 'text',
            'description' => $is_repeater ? 'JSON array (repeater)' : 'JSON object (ACF group)',
        ];

        $mappings[] = [
            'aiOutputKey' => $name,
            'targetType'  => 'acf_nested',
            'targetField' => $path,
        ];

        $schema_entries[] = [
            'key'    => $name,
            'path'   => $path,
            'schema' => self::build_json_schema($field, $source_data),
        ];
    }

    private static function group_has_generatable(array $field): bool {
        foreach ($field['children'] ?? [] as $child) {
            if (self::field_is_generatable($child)) {
                return true;
            }
        }
        return false;
    }

    private static function repeater_has_generatable(array $field): bool {
        foreach ($field['children'] ?? [] as $child) {
            if (self::field_is_generatable($child)) {
                return true;
            }
        }
        return false;
    }

    private static function field_is_generatable(array $field): bool {
        $type = $field['type'] ?? '';
        $name = $field['name'] ?? '';
        $path = $field['path'] ?? $name;

        if ($name !== '' && self::is_excluded($path, $name)) {
            return false;
        }

        if (in_array($type, self::SKIP_TYPES, true)) {
            return false;
        }
        if (in_array($type, self::TEXT_TYPES, true)) {
            return true;
        }
        if ($type === 'group') {
            return self::group_has_generatable($field);
        }
        if ($type === 'repeater') {
            return self::repeater_has_generatable($field);
        }
        return false;
    }

    private static function build_json_schema(array $field, array $source_data): array {
        $type = $field['type'] ?? 'text';

        if ($type === 'repeater') {
            $count = self::get_repeater_count($field, $source_data);
            $row   = [];
            foreach ($field['children'] ?? [] as $sub) {
                $sub_name = $sub['name'] ?? '';
                $sub_path = $sub['path'] ?? $sub_name;
                if ($sub_name !== '' && self::is_excluded($sub_path, $sub_name)) {
                    continue;
                }
                if (!self::field_is_generatable($sub) && ($sub['type'] ?? '') !== 'group' && ($sub['type'] ?? '') !== 'repeater') {
                    continue;
                }
                $sub_schema = self::build_json_schema($sub, $source_data);
                if (!empty($sub_schema)) {
                    $row[$sub['name']] = $sub_schema;
                }
            }
            return [
                '_type' => 'repeater',
                'count' => $count,
                'row'   => $row,
            ];
        }

        if ($type === 'group') {
            $obj = [];
            foreach ($field['children'] ?? [] as $sub) {
                $sub_name = $sub['name'] ?? '';
                $sub_path = $sub['path'] ?? $sub_name;
                if ($sub_name !== '' && self::is_excluded($sub_path, $sub_name)) {
                    continue;
                }
                if (!self::field_is_generatable($sub)) {
                    continue;
                }
                $sub_schema = self::build_json_schema($sub, $source_data);
                if (!empty($sub_schema)) {
                    $obj[$sub['name']] = $sub_schema;
                }
            }
            return ['_type' => 'group', 'fields' => $obj];
        }

        if (in_array($type, self::TEXT_TYPES, true)) {
            return $type === 'wysiwyg' || $type === 'textarea'
                ? ['_type' => 'html']
                : ['_type' => 'text'];
        }

        return [];
    }

    private static function get_repeater_count(array $field, array $source_data): int {
        $name = $field['name'];
        $path = $field['path'] ?? $name;

        $candidates = [
            "{$name}_count",
            "{$name}_row_count",
            str_replace('.', '_', $path) . '_count',
            str_replace('.', '_', $path) . '_row_count',
            'repeater_row_count',
        ];

        foreach ($candidates as $key) {
            if (isset($source_data[$key]) && is_numeric($source_data[$key])) {
                return max(1, (int) $source_data[$key]);
            }
        }

        return 2;
    }

    private static function build_instruction(array $entries, array $source_data): string {
        if (empty($entries)) {
            return 'No generatable ACF text fields found for this content type.';
        }

        $lines = [
            'Respond with a valid JSON object. Each top-level key maps to an ACF section.',
            'Omit Image, File, Taxonomy, Post Object, and Link fields — they are set manually in WordPress.',
            'Use HTML in wysiwyg/textarea fields where appropriate.',
            'Text field values must be plain strings (e.g. "My title"). Never wrap values in {_type: ...} objects.',
        ];

        $excluded = self::get_exclude_patterns();
        if (!empty($excluded)) {
            $lines[] = 'Never include these excluded field keys anywhere in the JSON: ' . implode(', ', $excluded) . '.';
        }

        $lines[] = '';
        $lines[] = 'Required JSON structure:';
        $lines[] = '{';

        foreach ($entries as $i => $entry) {
            $comma = $i < count($entries) - 1 ? ',' : '';
            $lines[] = '  "' . $entry['key'] . '": ' . self::schema_to_string($entry['schema']) . $comma;
        }

        $lines[] = '}';
        $lines[] = '';
        $lines[] = 'Do not include any text outside the JSON object.';

        return implode("\n", $lines);
    }

    private static function schema_to_string(array $schema): string {
        if (($schema['_type'] ?? '') === 'repeater') {
            $count = $schema['count'] ?? 2;
            $row   = self::schema_object_to_json($schema['row'] ?? []);
            return '[ EXACTLY ' . $count . ' items like: ' . $row . ' ]';
        }

        if (($schema['_type'] ?? '') === 'group') {
            return self::schema_object_to_json($schema['fields'] ?? []);
        }

        if (($schema['_type'] ?? '') === 'html') {
            return '"<p>HTML content</p>"';
        }

        return '"Your text here"';
    }

    private static function schema_object_to_json(array $fields): string {
        if (empty($fields)) {
            return '{}';
        }

        $parts = [];
        foreach ($fields as $name => $sub) {
            if (is_array($sub) && ($sub['_type'] ?? '') === 'repeater') {
                $count = $sub['count'] ?? 2;
                $row   = self::schema_object_to_json($sub['row'] ?? []);
                $parts[] = '"' . $name . '": [ /* exactly ' . $count . ' items */ ' . $row . ' ]';
            } elseif (is_array($sub) && ($sub['_type'] ?? '') === 'group') {
                $parts[] = '"' . $name . '": ' . self::schema_object_to_json($sub['fields'] ?? []);
            } elseif (is_array($sub) && ($sub['_type'] ?? '') === 'html') {
                $parts[] = '"' . $name . '": "<p>HTML</p>"';
            } elseif (is_array($sub) && ($sub['_type'] ?? '') === 'text') {
                $parts[] = '"' . $name . '": "Your text here"';
            } else {
                $parts[] = '"' . $name . '": "Your text here"';
            }
        }

        return '{ ' . implode(', ', $parts) . ' }';
    }

    /**
     * Check whether a field path or name is listed in plugin settings exclusions.
     */
    public static function is_excluded(string $path, string $name): bool {
        foreach (self::get_exclude_patterns() as $pattern) {
            if (self::pattern_matches_field($pattern, $path, $name)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Remove excluded keys from nested AI arrays before preview/save.
     */
    public static function strip_excluded_keys($value) {
        if (!is_array($value)) {
            return $value;
        }

        if (self::is_list_array($value)) {
            $cleaned = [];
            foreach ($value as $item) {
                $cleaned[] = self::strip_excluded_keys($item);
            }
            return $cleaned;
        }

        $result = [];
        foreach ($value as $key => $item) {
            $key_name = (string) $key;
            if (self::is_excluded($key_name, $key_name)) {
                continue;
            }
            $result[$key] = self::strip_excluded_keys($item);
        }

        return $result;
    }

    public static function get_excluded_patterns(): array {
        return self::get_exclude_patterns();
    }

    private static function pattern_matches_field(string $pattern, string $path, string $name): bool {
        $pattern = self::normalize_field_key($pattern);
        $path    = self::normalize_field_key($path);
        $name    = self::normalize_field_key($name);

        if ($pattern === '' || ($path === '' && $name === '')) {
            return false;
        }

        if ($pattern === $path || $pattern === $name) {
            return true;
        }

        if ($path !== '' && (strpos($path, $pattern . '.') === 0 || strpos($path, $pattern . '_') === 0)) {
            return true;
        }

        foreach (explode('.', $path) as $segment) {
            if (self::normalize_field_key($segment) === $pattern) {
                return true;
            }
        }

        return false;
    }

    private static function normalize_field_key(string $value): string {
        $value = trim(strtolower($value));
        return str_replace('-', '_', $value);
    }

    private static function is_list_array(array $value): bool {
        if ($value === []) {
            return true;
        }
        return array_keys($value) === range(0, count($value) - 1);
    }

    private static function get_exclude_patterns(): array {
        $raw = AICA_Settings::get('acf_exclude_fields', '');
        $lines = preg_split('/\r\n|\r|\n/', (string) $raw);
        return array_values(array_filter(array_map('trim', $lines ?: [])));
    }
}
