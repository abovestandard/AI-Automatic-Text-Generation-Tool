<?php
if (!defined('ABSPATH')) exit;

class AICA_Bulk_Processor {

    public static function get_categories(int $limit = 100): array {
        $terms = get_terms([
            'taxonomy'   => 'category',
            'hide_empty' => false,
            'number'     => $limit,
        ]);

        if (is_wp_error($terms)) {
            return [];
        }

        return array_map(function ($term) {
            return [
                'itemId'    => $term->term_id,
                'itemType'  => 'term',
                'itemLabel' => $term->name,
                'taxonomy'  => 'category',
            ];
        }, $terms);
    }

    public static function get_posts(string $post_type = 'post', int $limit = 100): array {
        $posts = get_posts([
            'post_type'      => $post_type,
            'posts_per_page' => $limit,
            'post_status'    => 'any',
        ]);

        return array_map(function ($post) {
            return [
                'itemId'    => $post->ID,
                'itemType'  => 'post',
                'itemLabel' => $post->post_title,
                'postType'  => $post->post_type,
            ];
        }, $posts);
    }
}
