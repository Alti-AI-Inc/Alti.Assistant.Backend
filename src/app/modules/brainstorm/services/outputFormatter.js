import { logger } from '../../../../shared/logger.js';

/**
 * @typedef {object} BrainstormIdea
 * @property {string} title - The title of the main idea.
 * @property {string} description - A detailed description of the main idea.
 * @property {string} [reasoning] - The reasoning behind the idea.
 * @property {string} [category] - The category the idea belongs to.
 * @property {string} [perspective] - The perspective from which the idea was generated.
 * @property {string} [priority] - The priority level of the idea (e.g., 'high', 'medium', 'low').
 */

/**
 * @typedef {object} BrainstormSubIdea
 * @property {string} title - The title of the supporting idea.
 * @property {string} description - A description of the supporting idea.
 */

/**
 * @typedef {object} BrainstormOpportunity
 * @property {string} title - The title of the opportunity.
 * @property {string} description - A description of the opportunity.
 * @property {string} [impact='medium'] - The potential impact of the opportunity (e.g., 'high', 'medium', 'low').
 */

/**
 * @typedef {object} BrainstormRisk
 * @property {string} title - The title of the risk.
 * @property {string} description - A description of the risk.
 * @property {string} [severity='medium'] - The severity of the risk (e.g., 'high', 'medium', 'low').
 * @property {string} [mitigation] - Suggested mitigation for the risk.
 */

/**
 * @typedef {object} BrainstormData
 * @property {string} [summary=''] - An overall summary of the brainstorm session.
 * @property {BrainstormIdea[]} [mainIdeas=[]] - An array of main ideas generated.
 * @property {BrainstormSubIdea[]} [subIdeas=[]] - An array of supporting ideas.
 * @property {BrainstormOpportunity[]} [opportunities=[]] - An array of identified opportunities.
 * @property {BrainstormRisk[]} [risks=[]] - An array of identified risks.
 * @property {string[]} [nextSteps=[]] - An array of suggested next steps.
 */

/**
 * @typedef {object} SWOTItem
 * @property {string} title - The title of the SWOT item.
 * @property {string} description - A description of the SWOT item.
 * @property {string} [impact='medium'] - The impact level (for strengths/opportunities).
 * @property {string} [severity='medium'] - The severity level (for weaknesses/threats).
 * @property {string} [potential='medium'] - The potential level (for opportunities).
 * @property {string} [risk='medium'] - The risk level (for threats).
 */

/**
 * @typedef {object} SWOTData
 * @property {SWOTItem[]} [strengths=[]] - An array of strengths.
 * @property {SWOTItem[]} [weaknesses=[]] - An array of weaknesses.
 * @property {SWOTItem[]} [opportunities=[]] - An array of opportunities.
 * @property {SWOTItem[]} [threats=[]] - An array of threats.
 */

/**
 * @typedef {object} SCAMPERData
 * @property {string[]} [substitute=[]] - Ideas for substitution.
 * @property {string[]} [combine=[]] - Ideas for combination.
 * @property {string[]} [adapt=[]] - Ideas for adaptation.
 * @property {string[]} [modify=[]] - Ideas for modification.
 * @property {string[]} [putToOtherUses=[]] - Ideas for putting to other uses.
 * @property {string[]} [eliminate=[]] - Ideas for elimination.
 * @property {string[]} [reverse=[]] - Ideas for reversal.
 */

/**
 * @typedef {object} PerspectiveDetail
 * @property {string[]} [considerations=[]] - Key considerations from this perspective.
 * @property {string[]} [opportunities=[]] - Opportunities identified from this perspective.
 * @property {string[]} [challenges=[]] - Challenges identified from this perspective.
 * @property {string[]} [recommendations=[]] - Recommendations from this perspective.
 */

/**
 * @typedef {object.<string, PerspectiveDetail>} PerspectiveData
 * @description An object where keys are perspective names (e.g., 'business', 'technical') and values are objects containing details for that perspective.
 */

/**
 * @typedef {object} RefinedIdea
 * @property {string} title - The title of the refined idea.
 * @property {string} description - A description of the refined idea.
 * @property {string[]} [improvements=[]] - Specific improvements made to the idea.
 * @property {string} [reasoning] - The reasoning behind the refinement.
 */

/**
 * @typedef {object} Enhancement
 * @property {string} aspect - The aspect being enhanced.
 * @property {string} suggestion - The enhancement suggestion.
 * @property {string} [impact] - The potential impact of the enhancement.
 */

/**
 * @typedef {object} AlternativeApproach
 * @property {string} approach - The name of the alternative approach.
 * @property {string} description - A description of the alternative approach.
 * @property {string[]} [pros=[]] - Advantages of this approach.
 * @property {string[]} [cons=[]] - Disadvantages of this approach.
 */

/**
 * @typedef {object} RefinementData
 * @property {RefinedIdea[]} [refinedIdeas=[]] - An array of ideas that have been refined.
 * @property {Enhancement[]} [enhancements=[]] - An array of suggestions for enhancements.
 * @property {AlternativeApproach[]} [alternativeApproaches=[]] - An array of alternative approaches.
 */

/**
 * @typedef {object} MetadataSummary
 * @property {number} totalIdeasGenerated - The total number of main and sub ideas generated.
 * @property {number} mainIdeas - The count of main ideas.
 * @property {number} subIdeas - The count of sub ideas.
 * @property {number} opportunities - The count of opportunities.
 * @property {number} risks - The count of risks.
 * @property {number} nextSteps - The count of next steps.
 * @property {string} techniqueUsed - The brainstorming technique used (e.g., 'free_association', 'SWOT', 'SCAMPER').
 * @property {string[]} perspectivesAnalyzed - An array of perspectives considered.
 * @property {string} depthLevel - The depth level of the analysis (e.g., 'standard', 'detailed').
 * @property {string} brainstormType - The type of brainstorm session (e.g., 'general', 'product_development').
 */

/**
 * @typedef {object} ConversationData
 * @property {string} [conversationId] - The unique identifier for the conversation session.
 * @property {string} [title] - The title of the brainstorm session.
 */

/**
 * Formats raw brainstorm data into a user-friendly, human-readable markdown string.
 * This function structures various components of a brainstorm session, such as main ideas,
 * sub-ideas, opportunities, risks, and next steps, into a coherent output.
 *
 * @param {BrainstormData} [brainstormData={}] - The raw brainstorm data object. Defaults to an empty object.
 * @param {object} [metadata={}] - Additional metadata about the brainstorm session. Currently unused in formatting logic. Defaults to an empty object.
 * @returns {string} A markdown-formatted string representing the brainstorm response, or an error message if formatting fails.
 */
const formatBrainstormResponse = (brainstormData = {}, metadata = {}) => {
  try {
    const {
      mainIdeas = [],
      subIdeas = [],
      opportunities = [],
      risks = [],
      nextSteps = [],
      summary = '',
    } = brainstormData;

    let response = '';

    // Summary
    if (summary) {
      response += `${summary}\n\n`;
    }

    // Main Ideas
    if (mainIdeas.length > 0) {
      response += `## 💡 Main Ideas (${mainIdeas.length})\n\n`;
      mainIdeas.forEach((idea, index) => {
        response += `### ${index + 1}. ${idea.title}\n`;
        response += `${idea.description}\n\n`;
        if (idea.reasoning) {
          response += `**Why this works:** ${idea.reasoning}\n`;
        }
        if (idea.category) {
          response += `**Category:** ${idea.category}\n`;
        }
        if (idea.perspective) {
          response += `**Perspective:** ${idea.perspective}\n`;
        }
        if (idea.priority) {
          response += `**Priority:** ${idea.priority}\n`;
        }
        response += '\n';
      });
    }

    // Sub Ideas
    if (subIdeas.length > 0) {
      response += `## 🔸 Supporting Ideas (${subIdeas.length})\n\n`;
      subIdeas.forEach((idea, index) => {
        response += `${index + 1}. **${idea.title}**: ${idea.description}\n`;
      });
      response += '\n';
    }

    // Opportunities
    if (opportunities.length > 0) {
      response += `## 🚀 Opportunities\n\n`;
      opportunities.forEach((opp, index) => {
        response += `${index + 1}. **${opp.title}** (Impact: ${opp.impact || 'medium'})\n`;
        response += `   ${opp.description}\n\n`;
      });
    }

    // Risks
    if (risks.length > 0) {
      response += `## ⚠️ Potential Challenges\n\n`;
      risks.forEach((risk, index) => {
        response += `${index + 1}. **${risk.title}** (Severity: ${risk.severity || 'medium'})\n`;
        response += `   ${risk.description}\n`;
        if (risk.mitigation) {
          response += `   *Mitigation:* ${risk.mitigation}\n`;
        }
        response += '\n';
      });
    }

    // Next Steps
    if (nextSteps.length > 0) {
      response += `## 📋 Next Steps\n\n`;
      nextSteps.forEach((step, index) => {
        response += `${index + 1}. ${step}\n`;
      });
      response += '\n';
    }

    return response.trim();
  } catch (error) {
    logger.error('Error formatting brainstorm response:', error);
    return 'Unable to format brainstorm results. Please check the data.';
  }
};

/**
 * Formats SWOT (Strengths, Weaknesses, Opportunities, Threats) analysis results into a
 * human-readable markdown string. Each section is clearly delineated with headings and
 * lists of items.
 *
 * @param {SWOTData} [swotData={}] - The raw SWOT analysis data object. Defaults to an empty object.
 * @returns {string} A markdown-formatted string representing the SWOT analysis, or an error message if formatting fails.
 */
const formatSWOT = (swotData = {}) => {
  try {
    const {
      strengths = [],
      weaknesses = [],
      opportunities = [],
      threats = [],
    } = swotData;

    let response = '## SWOT Analysis\n\n';

    if (strengths.length > 0) {
      response += '### ✅ Strengths\n';
      strengths.forEach((item, index) => {
        response += `${index + 1}. **${item.title}** (${item.impact || 'medium'} impact)\n`;
        response += `   ${item.description}\n\n`;
      });
    }

    if (weaknesses.length > 0) {
      response += '### ⚠️ Weaknesses\n';
      weaknesses.forEach((item, index) => {
        response += `${index + 1}. **${item.title}** (${item.severity || 'medium'} severity)\n`;
        response += `   ${item.description}\n\n`;
      });
    }

    if (opportunities.length > 0) {
      response += '### 🚀 Opportunities\n';
      opportunities.forEach((item, index) => {
        response += `${index + 1}. **${item.title}** (${item.potential || 'medium'} potential)\n`;
        response += `   ${item.description}\n\n`;
      });
    }

    if (threats.length > 0) {
      response += '### 🛡️ Threats\n';
      threats.forEach((item, index) => {
        response += `${index + 1}. **${item.title}** (${item.risk || 'medium'} risk)\n`;
        response += `   ${item.description}\n\n`;
      });
    }

    return response.trim();
  } catch (error) {
    logger.error('Error formatting SWOT:', error);
    return 'Unable to format SWOT analysis.';
  }
};

/**
 * Formats SCAMPER (Substitute, Combine, Adapt, Modify, Put to Other Uses, Eliminate, Reverse)
 * analysis results into a human-readable markdown string. Each SCAMPER category is presented
 * with a title, description, and a list of generated ideas.
 *
 * @param {SCAMPERData} [scamperData={}] - The raw SCAMPER analysis data object. Defaults to an empty object.
 * @returns {string} A markdown-formatted string representing the SCAMPER analysis, or an error message if formatting fails.
 */
const formatSCAMPER = (scamperData = {}) => {
  try {
    let response = '## SCAMPER Analysis\n\n';

    const sections = [
      {
        key: 'substitute',
        title: '🔄 Substitute',
        description: 'What can be substituted?',
      },
      {
        key: 'combine',
        title: '🤝 Combine',
        description: 'What can be combined?',
      },
      { key: 'adapt', title: '🔧 Adapt', description: 'What can be adapted?' },
      {
        key: 'modify',
        title: '⚡ Modify',
        description: 'What can be modified?',
      },
      {
        key: 'putToOtherUses',
        title: '♻️ Put to Other Uses',
        description: 'What other uses?',
      },
      {
        key: 'eliminate',
        title: '✂️ Eliminate',
        description: 'What can be eliminated?',
      },
      {
        key: 'reverse',
        title: '🔀 Reverse',
        description: 'What can be reversed?',
      },
    ];

    sections.forEach((section) => {
      // Check if the section key exists and has a non-empty array
      if (scamperData[section.key] && scamperData[section.key].length > 0) {
        response += `### ${section.title}\n`;
        response += `*${section.description}*\n\n`;
        scamperData[section.key].forEach((idea, index) => {
          response += `${index + 1}. ${idea}\n`;
        });
        response += '\n';
      }
    });

    return response.trim();
  } catch (error) {
    logger.error('Error formatting SCAMPER:', error);
    return 'Unable to format SCAMPER analysis.';
  }
};

/**
 * Formats multi-perspective analysis results into a human-readable markdown string.
 * Each perspective (e.g., business, technical) is presented with its key considerations,
 * opportunities, challenges, and recommendations.
 *
 * @param {PerspectiveData} [perspectiveData={}] - The raw perspective analysis data object. Defaults to an empty object.
 * @returns {string} A markdown-formatted string representing the multi-perspective analysis, or an error message if formatting fails.
 */
const formatPerspectives = (perspectiveData = {}) => {
  try {
    let response = '## Multi-Perspective Analysis\n\n';

    const perspectiveIcons = {
      business: '💼',
      technical: '⚙️',
      creative: '🎨',
      user_centric: '👥',
      strategic: '🎯',
      operational: '🔧',
      financial: '💰',
      competitive: '🏆',
    };

    // Ensure perspectiveData is an object before iterating its entries
    Object.entries(perspectiveData).forEach(([perspective, data]) => {
      const icon = perspectiveIcons[perspective] || '📊';
      response += `### ${icon} ${perspective.charAt(0).toUpperCase() + perspective.slice(1)} Perspective\n\n`;

      // Ensure data for each perspective is an object before accessing its properties
      const currentData = data || {};

      if (currentData.considerations && currentData.considerations.length > 0) {
        response += '**Key Considerations:**\n';
        currentData.considerations.forEach((item) => (response += `- ${item}\n`));
        response += '\n';
      }

      if (currentData.opportunities && currentData.opportunities.length > 0) {
        response += '**Opportunities:**\n';
        currentData.opportunities.forEach((item) => (response += `- ${item}\n`));
        response += '\n';
      }

      if (currentData.challenges && currentData.challenges.length > 0) {
        response += '**Challenges:**\n';
        currentData.challenges.forEach((item) => (response += `- ${item}\n`));
        response += '\n';
      }

      if (currentData.recommendations && currentData.recommendations.length > 0) {
        response += '**Recommendations:**\n';
        currentData.recommendations.forEach((item) => (response += `- ${item}\n`));
        response += '\n';
      }
    });

    return response.trim();
  } catch (error) {
    logger.error('Error formatting perspectives:', error);
    return 'Unable to format perspective analysis.';
  }
};

/**
 * Formats refinement suggestions into a human-readable markdown string.
 * This includes refined ideas, general enhancements, and alternative approaches,
 * each with their descriptions and relevant details.
 *
 * @param {RefinementData} [refinementData={}] - The raw refinement data object. Defaults to an empty object.
 * @returns {string} A markdown-formatted string representing the refinement suggestions, or an error message if formatting fails.
 */
const formatRefinements = (refinementData = {}) => {
  try {
    const {
      refinedIdeas = [],
      enhancements = [],
      alternativeApproaches = [],
    } = refinementData;

    let response = '## Refinement Suggestions\n\n';

    if (refinedIdeas.length > 0) {
      response += '### ✨ Refined Ideas\n\n';
      refinedIdeas.forEach((idea, index) => {
        response += `**${index + 1}. ${idea.title}**\n`;
        response += `${idea.description}\n\n`;
        if (idea.improvements && idea.improvements.length > 0) {
          response += '*Improvements:*\n';
          idea.improvements.forEach((imp) => (response += `- ${imp}\n`));
        }
        if (idea.reasoning) {
          response += `\n*Why:* ${idea.reasoning}\n`;
        }
        response += '\n';
      });
    }

    if (enhancements.length > 0) {
      response += '### 🔧 Enhancements\n\n';
      enhancements.forEach((enh, index) => {
        response += `${index + 1}. **${enh.aspect}**: ${enh.suggestion}\n`;
        if (enh.impact) {
          response += `   *Impact:* ${enh.impact}\n`;
        }
        response += '\n';
      });
    }

    if (alternativeApproaches.length > 0) {
      response += '### 🔀 Alternative Approaches\n\n';
      alternativeApproaches.forEach((alt, index) => {
        response += `**${index + 1}. ${alt.approach}**\n`;
        response += `${alt.description}\n`;
        if (alt.pros && alt.pros.length > 0) {
          response += '\n*Pros:*\n';
          alt.pros.forEach((pro) => (response += `- ${pro}\n`));
        }
        if (alt.cons && alt.cons.length > 0) {
          response += '\n*Cons:*\n';
          alt.cons.forEach((con) => (response += `- ${con}\n`));
        }
        response += '\n';
      });
    }

    return response.trim();
  } catch (error) {
    logger.error('Error formatting refinements:', error);
    return 'Unable to format refinement suggestions.';
  }
};

/**
 * Creates a summary of metadata from brainstorm data and session parameters.
 * This function aggregates counts of different brainstorm elements and includes
 * details about the techniques and parameters used during the session.
 *
 * @param {BrainstormData} brainstormData - The raw brainstorm data object.
 * @param {object} [params={}] - Parameters used during the brainstorm session. Defaults to an empty object.
 * @param {string} [params.technique='free_association'] - The brainstorming technique employed.
 * @param {string[]} [params.perspectives=[]] - An array of perspectives considered during the brainstorm.
 * @param {string} [params.depth='standard'] - The depth level of the brainstorm analysis.
 * @param {string} [params.brainstormType='general'] - The type of brainstorm session.
 * @returns {MetadataSummary} An object containing aggregated metadata, or an empty object if an error occurs.
 */
const createMetadataSummary = (brainstormData, params = {}) => {
  try {
    // Optional chaining handles cases where brainstormData itself is null or undefined,
    // so no default empty object is strictly needed for brainstormData here.
    const totalIdeas =
      (brainstormData.mainIdeas?.length || 0) +
      (brainstormData.subIdeas?.length || 0);

    return {
      totalIdeasGenerated: totalIdeas,
      mainIdeas: brainstormData.mainIdeas?.length || 0,
      subIdeas: brainstormData.subIdeas?.length || 0,
      opportunities: brainstormData.opportunities?.length || 0,
      risks: brainstormData.risks?.length || 0,
      nextSteps: brainstormData.nextSteps?.length || 0,
      techniqueUsed: params.technique || 'free_association',
      perspectivesAnalyzed: params.perspectives || [],
      depthLevel: params.depth || 'standard',
      brainstormType: params.brainstormType || 'general',
    };
  } catch (error) {
    logger.error('Error creating metadata summary:', error);
    return {};
  }
};

/**
 * Exports a complete brainstorm session, including conversation details and formatted brainstorm data,
 * into a single markdown string. This function combines session metadata with the detailed
 * brainstorm output generated by `formatBrainstormResponse`.
 *
 * @param {ConversationData} [conversationData={}] - Data related to the conversation session. Defaults to an empty object.
 * @param {BrainstormData} [brainstormData={}] - The raw brainstorm data to be formatted and included. Defaults to an empty object.
 * @returns {string} A comprehensive markdown string of the brainstorm session, or an error message if the export fails.
 */
const exportToMarkdown = (conversationData = {}, brainstormData = {}) => {
  try {
    let markdown = `# Brainstorm Session Export\n\n`;
    markdown += `**Date:** ${new Date().toLocaleString()}\n`;
    markdown += `**Session ID:** ${conversationData.conversationId || 'N/A'}\n\n`;

    if (conversationData.title) {
      markdown += `## ${conversationData.title}\n\n`;
    }

    markdown += `---\n\n`;
    // formatBrainstormResponse will now safely handle an empty brainstormData object
    markdown += formatBrainstormResponse(brainstormData);

    return markdown;
  } catch (error) {
    logger.error('Error exporting to markdown:', error);
    return '# Export Error\n\nUnable to export brainstorm session.';
  }
};

/**
 * @namespace outputFormatter
 * @description An object containing various utility functions for formatting different types of brainstorm and analysis outputs into human-readable strings, primarily markdown.
 * These functions are designed to take structured data and convert it into a presentable format for users or for export.
 */
export const outputFormatter = {
  formatBrainstormResponse,
  formatSWOT,
  formatSCAMPER,
  formatPerspectives,
  formatRefinements,
  createMetadataSummary,
  exportToMarkdown,
};