<?php
if (!defined('ABSPATH')) exit;

class AICA_Bulk_Processor {

    public static function get_items_for_type(string $content_type, int $limit = 200): array {
        $parsed = AICA_Content_Registry::parse_content_type($content_type);
        if (!$parsed) {
            return [];
        }

        $items = AICA_Content_Registry::get_items($parsed['kind'], $parsed['slug'], $limit);

        return array_map(function ($item) use ($parsed) {
            return [
                'itemId'    => $item['id'],
                'itemType'  => $parsed['kind'] === 'taxonomy' ? 'term' : 'post',
                'itemLabel' => $item['label'],
                'taxonomy'  => $parsed['kind'] === 'taxonomy' ? $parsed['slug'] : '',
                'postType'  => $parsed['kind'] === 'post_type' ? $parsed['slug'] : '',
                'status'    => $item['status'] ?? '',
            ];
        }, $items);
    }

    public static function get_categories(int $limit = 100): array {
        return self::get_items_for_type('taxonomy:category', $limit);
    }

    public static function get_posts(string $post_type = 'post', int $limit = 100): array {
        return self::get_items_for_type("post_type:{$post_type}", $limit);
    }
}
