<?php
if (!defined('ABSPATH')) exit;

class AICA_Field_Filler {

    /**
     * Apply mapped fields to WordPress form fields.
     * Returns array of results for each field.
     */
    public static function apply_fields(array $mapped_fields, string $apply_mode = 'preview'): array {
        $results = [];

        foreach ($mapped_fields as $field) {
            if (!$field['applied'] && $apply_mode !== 'preview' && $apply_mode !== 'replace') {
                $results[] = $field;
                continue;
            }

            $result = self::fill_field(
                $field['targetType'],
                $field['targetField'],
                $field['value']
            );

            $results[] = array_merge($field, [
                'fillResult' => $result,
            ]);
        }

        return $results;
    }

    /**
     * Returns JavaScript instructions for filling fields in the browser.
     */
    public static function get_js_fill_instructions(array $mapped_fields): array {
        $instructions = [];

        foreach ($mapped_fields as $field) {
            $instruction = [
                'aiOutputKey' => $field['aiOutputKey'],
                'targetType'  => $field['targetType'],
                'targetField' => $field['targetField'],
                'value'       => $field['value'],
                'selector'    => self::get_field_selector($field['targetType'], $field['targetField']),
            ];
            $instructions[] = $instruction;
        }

        return $instructions;
    }

    private static function fill_field(string $target_type, string $target_field, string $value): array {
        switch ($target_type) {
            case 'post_field':
                return ['method' => 'js', 'field' => $target_field, 'note' => 'Fill via JavaScript on save'];

            case 'acf':
                return ['method' => 'js', 'field' => $target_field, 'acf' => true];

            case 'meta':
                return ['method' => 'js', 'field' => $target_field, 'meta' => true];

            case 'html_input':
            case 'html_textarea':
                return [
                    'method'   => 'js',
                    'selector' => self::get_field_selector($target_type, $target_field),
                ];

            case 'wysiwyg':
                return [
                    'method'   => 'js',
                    'selector' => self::get_field_selector($target_type, $target_field),
                    'editor'   => 'tinymce',
                ];

            case 'gutenberg':
                return [
                    'method'   => 'js',
                    'editor'   => 'gutenberg',
                ];

            default:
                return ['method' => 'js', 'field' => $target_field];
        }
    }

    public static function get_field_selector(string $target_type, string $target_field): string {
        switch ($target_type) {
            case 'acf':
                return "[data-name=\"{$target_field}\"] textarea, [data-name=\"{$target_field}\"] input, [data-key*=\"{$target_field}\"] textarea, [data-key*=\"{$target_field}\"] input, #acf-{$target_field}";

            case 'post_field':
                $selectors = [
                    'post_title'   => '#title',
                    'post_content' => '#content',
                    'post_excerpt' => '#excerpt',
                ];
                return $selectors[$target_field] ?? "#{$target_field}";

            case 'html_input':
                return "input[name=\"{$target_field}\"], input[id=\"{$target_field}\"]";

            case 'html_textarea':
                return "textarea[name=\"{$target_field}\"], textarea[id=\"{$target_field}\"]";

            case 'wysiwyg':
                return "#wp-{$target_field}-wrap, .wp-editor-area[name=\"{$target_field}\"], [data-name=\"{$target_field}\"] .wp-editor-area";

            case 'meta':
                return "input[name=\"{$target_field}\"], textarea[name=\"{$target_field}\"], #{$target_field}";

            default:
                return "#{$target_field}, [name=\"{$target_field}\"]";
        }
    }
}
