// Tool sanitization utilities for Gemini compatibility

/**
 * Sanitize Composio tools for Gemini API compatibility
 * Removes unsupported fields and formats the tool schema
 */
export function sanitizeToolForGemini(tool) {
  // Recursively clean properties to remove Gemini-unsupported fields
  function cleanProperties(props) {
    if (!props || typeof props !== 'object') return props;

    const cleaned = {};
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'object' && value !== null) {
        const cleanedValue = { ...value };
        // Remove unsupported fields
        delete cleanedValue.examples;
        delete cleanedValue.nullable;
        delete cleanedValue.file_uploadable;
        delete cleanedValue.title;
        delete cleanedValue.format;
        delete cleanedValue.human_parameter_description;
        delete cleanedValue.human_parameter_name;

        // Recursively clean nested properties and items
        if (cleanedValue.properties) {
          cleanedValue.properties = cleanProperties(cleanedValue.properties);
        }
        if (cleanedValue.items?.properties) {
          cleanedValue.items.properties = cleanProperties(cleanedValue.items.properties);
        }

        cleaned[key] = cleanedValue;
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  console.log('Sanitizing tool:', tool.name);
  const cleanedFunction = {
    name: tool.slug,
    description: tool.description,
    parameters: {
      ...tool.parameters,
      type: 'object',
      properties: cleanProperties(tool.input_parameters.properties)
    }
  };

  return cleanedFunction;
}

/**
 * Build embedding text from tool document
 */
export function buildEmbeddingText(doc) {
  const name = doc.name ?? '';
  const desc = doc.description ?? '';
  const tags = Array.isArray(doc.tags) ? doc.tags.join(', ') : '';
  const appName = doc.appName ?? '';
  const slug = doc.slug ?? '';
  return `${name}\n${desc}\nTags: ${tags}\nAppName: ${appName}\nSlug: ${slug}`.trim();
}
