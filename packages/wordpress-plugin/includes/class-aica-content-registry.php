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

    public static function get_terms(string $taxonomy, int $limit = 0, string $search = ''): array {
        if (!taxonomy_exists($taxonomy)) {
            return [];
        }

        $args = [
            'taxonomy'         => $taxonomy,
            'hide_empty'       => false,
            'orderby'          => 'name',
            'order'            => 'ASC',
            'child_of'         => 0,
            'suppress_filters' => true,
        ];

        if ($search !== '') {
            $args['search'] = $search;
        }

        if ($limit > 0) {
            $args['number'] = $limit;
        }

        $terms = get_terms($args);

        if (is_wp_error($terms)) {
            return [];
        }

        $terms = array_values(array_filter($terms, static function ($term) use ($taxonomy) {
            return $term->taxonomy === $taxonomy;
        }));

        $terms = self::sort_terms_hierarchically($terms, $taxonomy);

        return array_map(function ($term) use ($taxonomy) {
            $depth = (int) ($term->aica_depth ?? 0);
            $indent = $depth > 0 ? str_repeat('— ', $depth) : '';

            return [
                'id'       => $term->term_id,
                'label'    => $indent . $term->name,
                'name'     => $term->name,
                'status'   => $term->count > 0 ? 'has_posts' : 'empty',
                'kind'     => 'taxonomy',
                'slug'     => $taxonomy,
                'parentId' => (int) $term->parent,
                'depth'    => $depth,
                'editUrl'  => get_edit_term_link($term->term_id, $taxonomy, 'raw'),
            ];
        }, $terms);
    }

    /**
     * Order terms parent-first with children directly under their parent.
     *
     * @param WP_Term[] $terms
     * @return WP_Term[]
     */
    private static function sort_terms_hierarchically(array $terms, string $taxonomy): array {
        if (empty($terms)) {
            return [];
        }

        if (!is_taxonomy_hierarchical($taxonomy)) {
            foreach ($terms as $term) {
                $term->aica_depth = 0;
            }
            return $terms;
        }

        $by_parent = [];
        foreach ($terms as $term) {
            $parent_id = (int) $term->parent;
            if (!isset($by_parent[$parent_id])) {
                $by_parent[$parent_id] = [];
            }
            $by_parent[$parent_id][] = $term;
        }

        foreach ($by_parent as &$siblings) {
            usort($siblings, static function ($a, $b) {
                return strcasecmp($a->name, $b->name);
            });
        }
        unset($siblings);

        $sorted = [];
        $walk = static function (int $parent_id, int $depth) use (&$walk, &$sorted, $by_parent): void {
            foreach ($by_parent[$parent_id] ?? [] as $term) {
                $term->aica_depth = $depth;
                $sorted[] = $term;
                $walk((int) $term->term_id, $depth + 1);
            }
        };

        $walk(0, 0);

        $included = [];
        foreach ($sorted as $term) {
            $included[$term->term_id] = true;
        }

        foreach ($terms as $term) {
            if (!isset($included[$term->term_id])) {
                $term->aica_depth = 0;
                $sorted[] = $term;
            }
        }

        return $sorted;
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
