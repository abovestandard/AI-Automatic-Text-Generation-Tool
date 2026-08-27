<?php
if (!defined('ABSPATH')) exit;

class AICA_API_Client {

    private string $api_url;
    private string $site_api_key;
    private string $project_id;

    public function __construct() {
        $this->api_url      = rtrim(AICA_Settings::get('api_url', 'http://localhost:3001'), '/');
        $this->site_api_key = AICA_Settings::get('site_api_key', '');
        $this->project_id   = AICA_Settings::get('project_id', '');
    }

    public function test_connection(): array {
        // Use /api/auth/status — always public (no login required).
        $health_url = $this->api_url . '/api/auth/status';
        $response = wp_remote_get($health_url, ['timeout' => 15]);
        if (is_wp_error($response)) {
            $message = $response->get_error_message();
            if (strpos($message, 'cURL error 28') !== false) {
                return [
                    'success' => false,
                    'message' => sprintf(
                        'Connection timed out reaching %s. Use your Apache CRM URL (not :3001), e.g. http://your-server/AI-automatic-text-Generation-Tool — and ensure WordPress can reach that server.',
                        $health_url
                    ),
                ];
            }
            return ['success' => false, 'message' => $message];
        }
        $code = wp_remote_retrieve_response_code($response);
        if ($code !== 200) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            $detail = is_array($body) && !empty($body['error']) ? $body['error'] : "HTTP $code";
            return ['success' => false, 'message' => $detail];
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($body) || !array_key_exists('userCount', $body)) {
            return ['success' => false, 'message' => 'Unexpected API response. Check the Platform API URL.'];
        }

        if ($this->site_api_key === '') {
            return ['success' => true, 'message' => 'API reachable. Enter a Site API Key to connect this website.'];
        }

        $context = $this->get_site_context();
        if (isset($context['error'])) {
            return ['success' => false, 'message' => $context['error']];
        }

        if (!empty($context['projectId'])) {
            AICA_Settings::set('project_id', $context['projectId']);
            $this->project_id = $context['projectId'];
        }

        return [
            'success' => true,
            'message' => sprintf(
                'Connected to %s (project: %s)',
                $context['websiteName'] ?? 'website',
                $context['projectId'] ?? 'unknown'
            ),
        ];
    }

    public function get_site_context(): array {
        return $this->get('/api/site/context');
    }

    public function get_prompts(): array {
        $this->ensure_project_id();
        return $this->get("/api/projects/{$this->project_id}/prompts");
    }

    public function get_mappings(?string $prompt_id = null): array {
        $this->ensure_project_id();
        $url = "/api/projects/{$this->project_id}/mappings";
        if ($prompt_id) {
            $url .= "?promptId={$prompt_id}";
        }
        return $this->get($url);
    }

    public function generate(array $payload): array {
        $this->ensure_project_id();
        $payload['projectId'] = $this->project_id;
        return $this->post('/api/generate', $payload);
    }

    public function create_bulk_job(array $payload): array {
        $this->ensure_project_id();
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

    private function ensure_project_id(): void {
        if ($this->project_id !== '') {
            return;
        }
        $context = $this->get_site_context();
        if (!empty($context['projectId'])) {
            $this->project_id = $context['projectId'];
            AICA_Settings::set('project_id', $this->project_id);
        }
    }

    private function auth_headers(): array {
        $headers = ['Content-Type' => 'application/json'];
        if ($this->site_api_key !== '') {
            $headers['Authorization'] = 'Bearer ' . $this->site_api_key;
        }
        return $headers;
    }

    private function get(string $endpoint): array {
        $response = wp_remote_get($this->api_url . $endpoint, [
            'timeout' => 30,
            'headers' => $this->auth_headers(),
        ]);
        return $this->handle_response($response);
    }

    private function post(string $endpoint, array $body): array {
        $response = wp_remote_post($this->api_url . $endpoint, [
            'timeout' => 120,
            'headers' => $this->auth_headers(),
            'body'    => wp_json_encode($body),
        ]);
        return $this->handle_response($response);
    }

    private function handle_response($response): array {
        if (is_wp_error($response)) {
            $message = $response->get_error_message();
            if (strpos($message, 'Connection refused') !== false || strpos($message, 'cURL error 7') !== false) {
                return [
                    'error' => sprintf(
                        'Cannot connect to the platform API at %s. Make sure the API server is running (npm start).',
                        $this->api_url
                    ),
                ];
            }
            return ['error' => $message];
        }
        $body = json_decode(wp_remote_retrieve_body($response), true);
        $code = wp_remote_retrieve_response_code($response);
        if ($code === 401) {
            return ['error' => 'Invalid Site API Key. Generate a new key in the CRM dashboard for this website.'];
        }
        if ($code >= 400) {
            return ['error' => $body['error'] ?? "HTTP $code"];
        }
        return $body ?? [];
    }
}
