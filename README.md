# AI Content Automation Platform

A reusable AI-powered content generation platform that automatically generates content based on predefined prompts and inserts it into WordPress, ACF, and other form fields.

## Overview

This platform eliminates the repetitive **copy → paste → generate → upload → paste into WordPress** workflow. Instead:

```
Select Content → Select Prompt → Generate → Review → Auto-Fill Fields → Save
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Admin Dashboard (React)                 │
│         Projects · Prompts · Field Mappings              │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              Platform API (Node.js/Express)              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │   Prompt     │  │  Generation  │  │  Bulk Queue    │ │
│  │   Engine     │  │   Engine     │  │  Processor     │ │
│  └─────────────┘  └──────────────┘  └────────────────┘ │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │   Field      │  │  WordPress   │  │  OpenAI API    │ │
│  │   Mapper     │  │  REST Client │  │  Integration   │ │
│  └─────────────┘  └──────────────┘  └────────────────┘ │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│            WordPress Plugin (PHP + JavaScript)            │
│  ACF Fields · WYSIWYG · Gutenberg · Bulk Generation      │
└─────────────────────────────────────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `packages/core` | Shared types, prompt engine, field mapper |
| `packages/api` | REST API server with SQLite storage |
| `packages/admin` | React admin dashboard |
| `packages/wordpress-plugin` | WordPress plugin for field integration |

## Quick Start

### Requirements

- **Node.js 22.5+** (uses built-in `node:sqlite` — no Visual Studio / C++ build tools needed on Windows)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Add your OpenAI API key to .env
```

### 3. Start the Platform

```bash
# Build all packages
npm run build

# Seed example data
npx tsx packages/api/src/seed.ts

# Start API server (includes admin dashboard)
npm start
```

The platform runs at `http://localhost:3001`. The admin dashboard is served at the same URL.

For development:

```bash
# Terminal 1: API server
npm run dev

# Terminal 2: Admin dashboard (with hot reload)
npm run admin:dev
```

### 4. Install WordPress Plugin

Copy `packages/wordpress-plugin/` to your WordPress `wp-content/plugins/ai-content-automation/` directory and activate it.

Configure in **AI Content → Settings**:
- **Platform API URL**: `http://your-server:3001`
- **Project ID**: Copy from the admin dashboard

## Configuration Guide

### Creating a Project

1. Open the admin dashboard
2. Click **New Project**
3. Enter project name and WordPress URL
4. Save your OpenAI API key in project settings
5. Copy the **Project ID** for the WordPress plugin

### Creating Prompts

Prompts define what the AI generates. Use `{{variables}}` for dynamic data:

```
Category Name: {{category_name}}
Existing Description: {{existing_description}}
Language: {{language}}
```

**Available variables:**
- `{{category_name}}` / `{{term_name}}`
- `{{product_name}}` / `{{post_title}}`
- `{{existing_description}}` / `{{existing_content}}`
- `{{short_description}}` / `{{post_excerpt}}`
- `{{language}}`
- Any ACF field key (e.g., `{{acf_field_name}}`)

Define **output fields** to get structured JSON responses:

| Key | Label | Type |
|-----|-------|------|
| `seo_title` | SEO Title | text |
| `meta_description` | Meta Description | text |
| `category_description` | Category Description | html |
| `faq_content` | FAQ Content | html |

### Field Mappings

Map AI output to WordPress fields without code changes:

| AI Output | Target Type | Target Field |
|-----------|-------------|--------------|
| `category_description` | ACF | `category_description` |
| `seo_title` | ACF | `seo_title` |
| `seo_title` | Meta | `_yoast_wpseo_title` |
| `description` | Term Field | `description` |
| `post_content` | Post Field | `post_content` |

**Supported target types:**
- `acf` — Advanced Custom Fields
- `post_field` — WordPress post fields (title, content, excerpt)
- `term_field` — Taxonomy term fields
- `meta` — Custom meta fields (Yoast SEO, etc.)
- `html_input` / `html_textarea` — Standard HTML form fields
- `wysiwyg` — TinyMCE / WordPress editor
- `gutenberg` — Gutenberg block editor
- `custom` — Custom CSS selector

### Apply Modes (Safety Controls)

| Mode | Behavior |
|------|----------|
| `preview` | Generate and show preview; user applies manually |
| `empty_only` | Only fill fields that are currently empty |
| `replace` | Replace existing content |
| `generate_only` | Generate without applying to fields |
| `save_draft` | Apply and save as draft |
| `publish` | Apply and publish |

## WordPress Usage

### Single Item Generation

1. Open any post or category edit screen
2. Find the **AI Content Generation** panel (sidebar or below form)
3. Select a prompt and apply mode
4. Click **Generate Content**
5. Review the preview
6. Click **Apply to Fields**
7. Save the post/category

### Bulk Generation

1. Go to **AI Content → Bulk Generation**
2. Select content type (Categories, Posts, Products)
3. Choose a prompt and apply mode
4. Click **Load Items** and select items
5. Click **Start Bulk Generation**
6. Monitor progress; retry failed items as needed

## Multi-Project Support

Each WordPress site connects to a separate **project** in the platform:

```
Project A (Site 1)          Project B (Site 2)
├── Prompt: Categories      ├── Prompt: Products
├── Mappings: ACF fields    ├── Mappings: WP fields
└── Model: gpt-4o           └── Model: gpt-4o-mini
```

Install the same plugin on multiple sites; configure each with its own Project ID.

## API Reference

### Projects
- `GET /api/projects` — List projects
- `POST /api/projects` — Create project
- `GET /api/projects/:id` — Get project
- `PUT /api/projects/:id` — Update project

### Prompts
- `GET /api/projects/:projectId/prompts` — List prompts
- `POST /api/projects/:projectId/prompts` — Create prompt
- `PUT /api/prompts/:id` — Update prompt

### Field Mappings
- `GET /api/projects/:projectId/mappings` — List mappings
- `POST /api/projects/:projectId/mappings` — Create mapping

### Generation
- `POST /api/generate` — Generate content for a single item
- `POST /api/projects/:projectId/bulk-jobs` — Create bulk job
- `POST /api/bulk-jobs/:id/start` — Start bulk processing
- `GET /api/bulk-jobs/:id` — Get job status with stats

## Image Support

Enable **Support image input (vision)** on prompts. The platform sends category/product images to OpenAI's vision-capable models. Images are collected from:

- Featured images
- ACF image fields (`category_image`)
- Term thumbnail meta

## Future Integrations

The modular architecture supports adding:

- Shopify
- WooCommerce (partial support via post types)
- Other CMS platforms
- Custom APIs
- External databases

Add new integration adapters in `packages/api/src/services/` and corresponding connectors.

## License

GPL v2 or later (WordPress plugin). MIT for platform packages.
