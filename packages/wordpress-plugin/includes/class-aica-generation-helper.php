<?php
if (!defined('ABSPATH')) exit;

class AICA_Generation_Helper {

    /**
     * Attach ACF Auto schema to a generation payload when fields exist.
     * Falls back to manual prompt mappings when no ACF fields are found.
     */
    public static function apply_acf_auto_to_payload(
        array $payload,
        bool $acf_auto,
        string $item_type,
        string $slug,
        array $source_data = []
    ): array {
        $meta = [
            'autoMode'       => false,
            'fallbackManual' => false,
            'fieldCount'     => 0,
            'fields'         => [],
        ];

        if (!$acf_auto || $slug === '') {
            return ['payload' => $payload, 'meta' => $meta];
        }

        $kind = $item_type === 'term' ? 'taxonomy' : 'post_type';
        $acf_schema = AICA_ACF_Schema_Builder::get_generatable_schema($kind, $slug, $source_data);

        if (!empty($acf_schema['outputFields'])) {
            $payload['acfAuto']   = true;
            $payload['acfSchema'] = $acf_schema;
            $meta['autoMode']     = true;
            $meta['fieldCount']   = (int) ($acf_schema['fieldCount'] ?? count($acf_schema['outputFields']));
            $meta['fields']       = array_column($acf_schema['outputFields'], 'key');
        } else {
            $meta['fallbackManual'] = true;
        }

        return ['payload' => $payload, 'meta' => $meta];
    }
}
