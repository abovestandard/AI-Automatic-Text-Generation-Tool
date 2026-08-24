<?php
if (!defined('ABSPATH')) exit;

class AICA_Data_Collector {

    public static function collect_post_data(int $post_id): array {
        $post = get_post($post_id);
        if (!$post) {
            return [];
        }

        $data = [
            'product_name'         => $post->post_title,
            'post_title'           => $post->post_title,
            'post_content'         => $post->post_content,
            'post_excerpt'         => $post->post_excerpt,
            'existing_description' => $post->post_content,
            'existing_content'     => $post->post_content,
            'short_description'    => $post->post_excerpt,
            'language'             => get_locale(),
        ];

        if (function_exists('get_fields')) {
            $acf_fields = get_fields($post_id);
            if ($acf_fields) {
                $data['acf'] = $acf_fields;
                $flat = AICA_ACF_Helper::flatten_values($acf_fields);
                $data = array_merge($data, $flat);
                foreach ($acf_fields as $key => $value) {
                    if (is_string($value) || is_numeric($value)) {
                        $data[$key] = (string) $value;
                    }
                }
            }
        }

        $thumbnail_id = get_post_thumbnail_id($post_id);
        if ($thumbnail_id) {
            $data['featured_image_url'] = wp_get_attachment_url($thumbnail_id);
            $data['category_image'] = $data['featured_image_url'];
        }

        return $data;
    }

    public static function collect_term_data(int $term_id, string $taxonomy): array {
        $term = get_term($term_id, $taxonomy);
        if (!$term || is_wp_error($term)) {
            return [];
        }

        $data = [
            'category_name'        => $term->name,
            'term_name'            => $term->name,
            'existing_description' => $term->description,
            'description'          => $term->description,
            'language'             => get_locale(),
        ];

        if (function_exists('get_fields')) {
            $acf_fields = get_fields("{$taxonomy}_{$term_id}");
            if ($acf_fields) {
                $data['acf'] = $acf_fields;
                $flat = AICA_ACF_Helper::flatten_values($acf_fields);
                $data = array_merge($data, $flat);
                foreach ($acf_fields as $key => $value) {
                    if (is_string($value) || is_numeric($value)) {
                        $data[$key] = (string) $value;
                    }
                }
            }
        }

        $image_id = self::get_term_image_id($term_id, $taxonomy);
        if ($image_id) {
            $data['category_image'] = wp_get_attachment_url($image_id);
            $data['featured_image_url'] = $data['category_image'];
        }

        return $data;
    }

    public static function collect_images(array $data): array {
        $images = [];
        $image_keys = ['category_image', 'featured_image_url', 'product_image'];

        foreach ($image_keys as $key) {
            if (!empty($data[$key]) && filter_var($data[$key], FILTER_VALIDATE_URL)) {
                $images[] = [
                    'key' => $key,
                    'url' => $data[$key],
                ];
            }
        }

        return $images;
    }

    private static function get_term_image_id(int $term_id, string $taxonomy): ?int {
        $image_id = get_term_meta($term_id, 'thumbnail_id', true);
        if ($image_id) {
            return (int) $image_id;
        }

        if (function_exists('get_field')) {
            $acf_image = get_field('category_image', "{$taxonomy}_{$term_id}");
            if (is_array($acf_image) && isset($acf_image['ID'])) {
                return (int) $acf_image['ID'];
            }
            if (is_numeric($acf_image)) {
                return (int) $acf_image;
            }
        }

        return null;
    }
}
