// Tool sanitization utilities for Gemini compatibility

/**
 * Sanitizes a Composio tool object to make it compatible with the Gemini API's tool calling specifications.
 * This involves recursively removing fields from the parameter schema that are not supported by Gemini,
 * and reformatting the overall tool structure.
 *
 * @param {object} tool - The Composio tool object to sanitize.
 * @param {string} tool.name - The original name of the tool.
 * @param {string} tool.slug - The unique slug/identifier for the tool, which will be used as the Gemini function name.
 * @param {string} tool.description - A description of the tool's functionality.
 * @param {object} tool.parameters - The original tool parameters object (may contain additional fields).
 * @param {object} tool.input_parameters - Contains the schema for the tool's input parameters.
 * @param {object} tool.input_parameters.properties - The JSON schema properties defining the input parameters for the tool.
 * @returns {object|null} A new object formatted for the Gemini API, containing `name`, `description`, and `parameters`, or null if input is falsy.
 */
export function sanitizeToolForGemini(tool) {
  // A tool and its slug are required to generate a valid Gemini function.
  if (!tool || !tool.slug) return null;

  /**
   * Recursively cleans a properties object by removing fields not supported by the Gemini API.
   *
   * @param {object | undefined | null} props - The properties object to clean. Can be undefined or null.
   * @returns {object | undefined | null} The cleaned properties object, or the original value if not an object.
   */
  function cleanProperties(props) {
    // Return non-objects or arrays as-is. Arrays (e.g., for 'enum' or 'required' keywords) should not be destructured.
    if (!props || typeof props !== 'object' || Array.isArray(props)) {
      return props;
    }

    const cleaned = {};
    for (const [key, value] of Object.entries(props)) {
      // We only process values that are non-null objects and not arrays.
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const cleanedValue = { ...value };
        // Remove unsupported fields for Gemini API
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
          // Avoid mutating the original nested items object by shallow copying it first
          cleanedValue.items = {
            ...cleanedValue.items,
            properties: cleanProperties(cleanedValue.items.properties)
          };
        }

        cleaned[key] = cleanedValue;
      } else {
        // Primitives, null, and arrays are kept as-is.
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  /**
   * Sanitizes a string to be a valid Gemini function name.
   * Rules: Must start with a letter or underscore, contain only a-z, A-Z, 0-9, _, or -, and be max 64 chars.
   * @param {string} name - The proposed name.
   * @returns {string} A valid function name.
   */
  function sanitizeFunctionName(name) {
    // Replace any character that is not a letter, number, underscore, or dash with an underscore.
    let sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_');

    // Ensure the name starts with a letter or an underscore.
    if (!/^[a-zA-Z_]/.test(sanitized)) {
      sanitized = `fn_${sanitized}`;
    }

    // Truncate to the maximum length of 64 characters.
    return sanitized.slice(0, 64);
  }

  const cleanedFunction = {
    name: sanitizeFunctionName(tool.slug),
    description: tool.description,
    parameters: {
      ...tool.parameters, // Preserve any other top-level parameter fields if they exist and are supported
      type: 'object', // Gemini expects parameters to be an object
      properties: cleanProperties(tool.input_parameters?.properties),
    },
  };

  return cleanedFunction;
}

/**
 * Constructs a concise text string from a tool document, suitable for use in embedding models.
 * This text summarizes key information about the tool, including its name, description, tags,
 * application name, and slug.
 *
 * @param {object} doc - The tool document object from which to build the embedding text.
 * @param {string} [doc.name=''] - The name of the tool. Defaults to an empty string if not provided.
 * @param {string} [doc.description=''] - A description of the tool's functionality. Defaults to an empty string.
 * @param {string[]} [doc.tags=[]] - An array of tags associated with the tool. Defaults to an empty array.
 * @param {string} [doc.appName=''] - The name of the application or integration the tool belongs to. Defaults to an empty string.
 * @param {string} [doc.slug=''] - The unique slug/identifier of the tool. Defaults to an empty string.
 * @returns {string} A formatted string containing the tool's name, description, tags, app name, and slug,
 *                   with leading/trailing whitespace trimmed.
 */
export function buildEmbeddingText(doc) {
  const safeDoc = doc || {};
  const name = safeDoc.name ?? '';
  const desc = safeDoc.description ?? '';
  const tags = Array.isArray(safeDoc.tags) ? safeDoc.tags.join(', ') : '';
  const appName = safeDoc.appName ?? '';
  const slug = safeDoc.slug ?? '';
  return `${name}\n${desc}\nTags: ${tags}\nAppName: ${appName}\nSlug: ${slug}`.trim();
}