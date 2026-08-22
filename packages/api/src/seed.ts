import { getDb } from './db';
import { v4 as uuidv4 } from 'uuid';

/**
 * Seeds the database with an example project, prompt, and field mappings
 * for a WordPress + ACF category content generation use case.
 */
export function seedDatabase(): void {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number };
  if (existing.count > 0) {
    console.log('Database already seeded, skipping.');
    return;
  }

  const projectId = uuidv4();
  const promptId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO projects (id, name, description, default_model, default_language, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    'Example WordPress Site',
    'Example project for generating category content with ACF fields',
    'gpt-4o',
    'en',
    now,
    now
  );

  const outputFields = [
    { key: 'seo_title', label: 'SEO Title', type: 'text', description: 'SEO-optimized page title, max 60 chars' },
    { key: 'meta_description', label: 'Meta Description', type: 'text', description: 'Meta description, max 160 chars' },
    { key: 'short_description', label: 'Short Description', type: 'text', description: 'Brief category summary, 1-2 sentences' },
    { key: 'category_description', label: 'Category Description', type: 'html', description: 'Full category description with HTML formatting' },
    { key: 'faq_content', label: 'FAQ Content', type: 'html', description: '3-5 FAQ items in HTML format' },
  ];

  const systemPrompt = `You are an expert SEO content writer specializing in e-commerce category pages.
Generate high-quality, engaging, and SEO-optimized content.
Write in a professional but approachable tone.
Always respond in the language specified by the user.`;

  const userPromptTemplate = `Generate content for the following product category:

Category Name: {{category_name}}
Existing Description: {{existing_description}}
Language: {{language}}

Analyze the category image (if provided) to understand the products and create relevant content.
Generate SEO-optimized content that helps customers understand this category.`;

  db.prepare(`
    INSERT INTO prompts (id, project_id, name, description, system_prompt, user_prompt_template, output_fields, supports_vision, response_format, variables, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    promptId,
    projectId,
    'Category Content Generator',
    'Generates SEO title, descriptions, and FAQ for product categories',
    systemPrompt,
    userPromptTemplate,
    JSON.stringify(outputFields),
    1,
    'json',
    JSON.stringify(['category_name', 'existing_description', 'language']),
    now,
    now
  );

  const mappings = [
    { aiOutputKey: 'seo_title', targetType: 'acf', targetField: 'seo_title' },
    { aiOutputKey: 'meta_description', targetType: 'acf', targetField: 'seo_description' },
    { aiOutputKey: 'short_description', targetType: 'acf', targetField: 'short_description' },
    { aiOutputKey: 'category_description', targetType: 'acf', targetField: 'category_description' },
    { aiOutputKey: 'faq_content', targetType: 'acf', targetField: 'faq_content' },
    { aiOutputKey: 'seo_title', targetType: 'meta', targetField: '_yoast_wpseo_title' },
    { aiOutputKey: 'meta_description', targetType: 'meta', targetField: '_yoast_wpseo_metadesc' },
    { aiOutputKey: 'category_description', targetType: 'term_field', targetField: 'description' },
  ];

  const insertMapping = db.prepare(`
    INSERT INTO field_mappings (id, project_id, prompt_id, ai_output_key, target_type, target_field)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const m of mappings) {
    insertMapping.run(uuidv4(), projectId, promptId, m.aiOutputKey, m.targetType, m.targetField);
  }

  console.log('Database seeded successfully!');
  console.log(`  Project ID: ${projectId}`);
  console.log(`  Prompt ID:  ${promptId}`);
}

if (require.main === module) {
  seedDatabase();
}
