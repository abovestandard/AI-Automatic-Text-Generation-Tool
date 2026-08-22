<?php
if (!defined('ABSPATH')) exit;

class AICA_API_Client {

    private string $api_url;
    private string $project_id;

    public function __construct() {
        $this->api_url    = rtrim(AICA_Settings::get('api_url', 'http://localhost:3001'), '/');
        $this->project_id = AICA_Settings::get('project_id', '');
    }

    public function test_connection(): array {
        $response = wp_remote_get($this->api_url . '/health', ['timeout' => 10]);
        if (is_wp_error($response)) {
            return ['success' => false, 'message' => $response->get_error_message()];
        }
        $code = wp_remote_retrieve_response_code($response);
        return [
            'success' => $code === 200,
            'message' => $code === 200 ? 'Connected successfully' : "HTTP $code",
        ];
    }

    public function get_prompts(): array {
        return $this->get("/api/projects/{$this->project_id}/prompts");
    }

    public function get_mappings(?string $prompt_id = null): array {
        $url = "/api/projects/{$this->project_id}/mappings";
        if ($prompt_id) {
            $url .= "?promptId={$prompt_id}";
        }
        return $this->get($url);
    }

    public function generate(array $payload): array {
        $payload['projectId'] = $this->project_id;
        return $this->post('/api/generate', $payload);
    }

    public function create_bulk_job(array $payload): array {
        return $this->post("/api/projects/{$this->project_id}/bulk-jobs", $payload);
    }

    public function start_bulk_job(string $job_id, array $item_data = []): array {
        return $this->post("/api/bulk-jobs/{$job_id}/start", ['itemData' => $item_data]);
    }

    public function get_bulk_job(string $job_id): array {
        return $this->get("/api/bulk-jobs/{$job_id}");
    }

    public function retry_bulk_job(string $job_id): array {
        return $this->post("/api/bulk-jobs/{$job_id}/retry", []);
    }

    private function get(string $endpoint): array {
        $response = wp_remote_get($this->api_url . $endpoint, [
            'timeout' => 30,
            'headers' => ['Content-Type' => 'application/json'],
        ]);
        return $this->handle_response($response);
    }

    private function post(string $endpoint, array $body): array {
        $response = wp_remote_post($this->api_url . $endpoint, [
            'timeout' => 120,
            'headers' => ['Content-Type' => 'application/json'],
            'body'    => wp_json_encode($body),
        ]);
        return $this->handle_response($response);
    }

    private function handle_response($response): array {
        if (is_wp_error($response)) {
            return ['error' => $response->get_error_message()];
        }
        $body = json_decode(wp_remote_retrieve_body($response), true);
        $code = wp_remote_retrieve_response_code($response);
        if ($code >= 400) {
            return ['error' => $body['error'] ?? "HTTP $code"];
        }
        return $body ?? [];
    }
}
