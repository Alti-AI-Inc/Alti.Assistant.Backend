import { logger } from '../../../../shared/logger.js';

/**
 * Format brainstorm data for user-friendly display
 */
const formatBrainstormResponse = (brainstormData, metadata = {}) => {
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
 * Format SWOT analysis results
 */
const formatSWOT = (swotData) => {
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
 * Format SCAMPER results
 */
const formatSCAMPER = (scamperData) => {
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
 * Format perspective analysis
 */
const formatPerspectives = (perspectiveData) => {
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

    Object.entries(perspectiveData).forEach(([perspective, data]) => {
      const icon = perspectiveIcons[perspective] || '📊';
      response += `### ${icon} ${perspective.charAt(0).toUpperCase() + perspective.slice(1)} Perspective\n\n`;

      if (data.considerations && data.considerations.length > 0) {
        response += '**Key Considerations:**\n';
        data.considerations.forEach((item) => (response += `- ${item}\n`));
        response += '\n';
      }

      if (data.opportunities && data.opportunities.length > 0) {
        response += '**Opportunities:**\n';
        data.opportunities.forEach((item) => (response += `- ${item}\n`));
        response += '\n';
      }

      if (data.challenges && data.challenges.length > 0) {
        response += '**Challenges:**\n';
        data.challenges.forEach((item) => (response += `- ${item}\n`));
        response += '\n';
      }

      if (data.recommendations && data.recommendations.length > 0) {
        response += '**Recommendations:**\n';
        data.recommendations.forEach((item) => (response += `- ${item}\n`));
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
 * Format refinement suggestions
 */
const formatRefinements = (refinementData) => {
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
 * Create metadata summary
 */
const createMetadataSummary = (brainstormData, params = {}) => {
  try {
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
 * Export brainstorm session to markdown format
 */
const exportToMarkdown = (conversationData, brainstormData) => {
  try {
    let markdown = `# Brainstorm Session Export\n\n`;
    markdown += `**Date:** ${new Date().toLocaleString()}\n`;
    markdown += `**Session ID:** ${conversationData.conversationId || 'N/A'}\n\n`;

    if (conversationData.title) {
      markdown += `## ${conversationData.title}\n\n`;
    }

    markdown += `---\n\n`;
    markdown += formatBrainstormResponse(brainstormData);

    return markdown;
  } catch (error) {
    logger.error('Error exporting to markdown:', error);
    return '# Export Error\n\nUnable to export brainstorm session.';
  }
};

export const outputFormatter = {
  formatBrainstormResponse,
  formatSWOT,
  formatSCAMPER,
  formatPerspectives,
  formatRefinements,
  createMetadataSummary,
  exportToMarkdown,
};
