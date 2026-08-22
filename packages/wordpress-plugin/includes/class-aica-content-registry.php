<?php
if (!defined('ABSPATH')) exit;

class AICA_Content_Registry {

    public static function get_content_types(): array {
        $types = [
            'postTypes'  => [],
            'taxonomies' => [],
        ];

        $post_types = get_post_types(['public' => true], 'objects');
        foreach ($post_types as $pt) {
            if (in_array($pt->name, ['attachment'], true)) {
                continue;
            }
            $types['postTypes'][] = [
                'slug'  => $pt->name,
                'label' => $pt->labels->singular_name ?: $pt->label,
                'name'  => $pt->labels->name ?: $pt->label,
                'kind'  => 'post_type',
            ];
        }

        $taxonomies = get_taxonomies(['public' => true], 'objects');
        foreach ($taxonomies as $tax) {
            if (in_array($tax->name, ['post_format'], true)) {
                continue;
            }
            $types['taxonomies'][] = [
                'slug'  => $tax->name,
                'label' => $tax->labels->singular_name ?: $tax->label,
                'name'  => $tax->labels->name ?: $tax->label,
                'kind'  => 'taxonomy',
                'objectType' => !empty($tax->object_type) ? $tax->object_type[0] : '',
            ];
        }

        usort($types['postTypes'], fn($a, $b) => strcmp($a['label'], $b['label']));
        usort($types['taxonomies'], fn($a, $b) => strcmp($a['label'], $b['label']));

        return $types;
    }

    public static function get_items(string $kind, string $slug, int $limit = 200, string $search = ''): array {
        if ($kind === 'taxonomy') {
            return self::get_terms($slug, $limit, $search);
        }
        return self::get_posts($slug, $limit, $search);
    }

    public static function get_posts(string $post_type, int $limit = 200, string $search = ''): array {
        $args = [
            'post_type'      => $post_type,
            'posts_per_page' => $limit,
            'post_status'    => 'any',
            'orderby'        => 'title',
            'order'          => 'ASC',
        ];

        if ($search !== '') {
            $args['s'] = $search;
        }

        $posts = get_posts($args);

        return array_map(function ($post) {
            return [
                'id'     => $post->ID,
                'label'  => $post->post_title ?: sprintf(__('(no title) #%d', 'ai-content-automation'), $post->ID),
                'status' => $post->post_status,
                'kind'   => 'post_type',
                'slug'   => $post->post_type,
                'editUrl' => get_edit_post_link($post->ID, 'raw'),
            ];
        }, $posts);
    }

    public static function get_terms(string $taxonomy, int $limit = 200, string $search = ''): array {
        $args = [
            'taxonomy'   => $taxonomy,
            'hide_empty' => false,
            'number'     => $limit,
            'orderby'    => 'name',
            'order'      => 'ASC',
        ];

        if ($search !== '') {
            $args['search'] = $search;
        }

        $terms = get_terms($args);

        if (is_wp_error($terms)) {
            return [];
        }

        return array_map(function ($term) use ($taxonomy) {
            return [
                'id'     => $term->term_id,
                'label'  => $term->name,
                'status' => $term->count > 0 ? 'has_posts' : 'empty',
                'kind'   => 'taxonomy',
                'slug'   => $taxonomy,
                'editUrl' => get_edit_term_link($term->term_id, $taxonomy, 'raw'),
            ];
        }, $terms);
    }

    public static function parse_content_type(string $value): ?array {
        if (strpos($value, ':') === false) {
            return null;
        }
        [$kind, $slug] = explode(':', $value, 2);
        if (!in_array($kind, ['post_type', 'taxonomy'], true) || $slug === '') {
            return null;
        }
        return ['kind' => $kind, 'slug' => sanitize_key($slug)];
    }
}
