import './load-env';
import { prisma } from './db';
import { v4 as uuidv4 } from 'uuid';

/**
 * Seeds the database with an example website, project, prompt, and field mappings.
 */
export async function seedDatabase(): Promise<void> {
  const existing = await prisma.project.count();
  if (existing > 0) {
    console.log('Database already seeded, skipping.');
    return;
  }

  const website = await prisma.website.create({
    data: {
      name: 'Example WordPress Site',
      slug: 'example-site',
      domain: 'https://example.com',
    },
  });

  const project = await prisma.project.create({
    data: {
      name: 'Example WordPress Site',
      description: 'Example project for generating category content with ACF fields',
      defaultModel: 'gpt-4o',
      defaultLanguage: 'en',
      websiteId: website.id,
    },
  });

  await prisma.website.update({
    where: { id: website.id },
    data: { defaultProjectId: project.id },
  });

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

  const prompt = await prisma.prompt.create({
    data: {
      projectId: project.id,
      name: 'Category Content Generator',
      description: 'Generates SEO title, descriptions, and FAQ for product categories',
      systemPrompt,
      userPromptTemplate,
      outputFields,
      supportsVision: true,
      responseFormat: 'json',
      variables: ['category_name', 'existing_description', 'language'],
    },
  });

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

  for (const m of mappings) {
    await prisma.fieldMapping.create({
      data: {
        projectId: project.id,
        promptId: prompt.id,
        aiOutputKey: m.aiOutputKey,
        targetType: m.targetType,
        targetField: m.targetField,
      },
    });
  }

  console.log('Database seeded successfully!');
  console.log(`  Website ID: ${website.id}`);
  console.log(`  Project ID: ${project.id}`);
  console.log(`  Prompt ID:  ${prompt.id}`);
}

if (require.main === module) {
  seedDatabase()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
