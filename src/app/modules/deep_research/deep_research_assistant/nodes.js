import { runGroqTask } from '../services/groqService.js';
import { TavilySearchTool } from '../utils/tavily-utils.js';
import { generatePDFReport, savePDFToFile } from '../services/pdfService.js';
import { saveResearchResult } from '../services/researchStorageService.js';
import path from 'path';
import fs from 'fs';

/**
 * Node: Initialize the deep research process
 */
export const initializeResearchNode = async (state) => {
  console.log('--- Node: initializeResearchNode ---');
  const { originalQuery } = state;

  const researchPlan = await generateResearchPlan(originalQuery);

  return {
    researchProgress: {
      phase: 'breadth_search',
      completedSteps: 1,
      totalSteps: researchPlan.estimatedSteps,
      currentTask: 'Starting breadth-first web scanning',
    },
    metadata: {
      researchPlan,
      timestamp: new Date(),
    },
  };
};

/**
 * Node: Step 1 - Perform breadth-first search across the web
 */
export const breadthFirstSearchNode = async (state) => {
  console.log('--- Node: breadthFirstSearchNode ---');
  const { originalQuery, currentDepth } = state;

  try {
    // Generate multiple search queries for comprehensive coverage
    const searchQueries = await generateBreadthSearchQueries(originalQuery);
    console.log(
      `Generated ${searchQueries.length} search queries for breadth-first search`
    );

    const searchTool = new TavilySearchTool({
      apiKey: process.env.TAVILY_API_KEY,
      maxResults: 15, // More results for breadth
    });

    const breadthResults = [];
    const allSources = [];

    // Perform parallel searches for breadth coverage
    for (const query of searchQueries) {
      console.log(`Searching: "${query}"`);

      const searchResult = await searchTool.invoke({
        query,
        searchDepth: 'advanced',
        includeAnswer: true,
        includeImages: false,
      });

      breadthResults.push({
        query,
        results: searchResult.results || [],
        answer: searchResult.answer,
        timestamp: new Date(),
      });

      // Collect all sources
      if (searchResult.results) {
        allSources.push(
          ...searchResult.results.map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.content || r.snippet,
            relevanceScore: calculateRelevanceScore(r, originalQuery),
            searchQuery: query,
          }))
        );
      }
    }

    console.log(`Breadth search completed: ${allSources.length} sources found`);

    return {
      breadthResults,
      allSources,
      researchProgress: {
        phase: 'lead_analysis',
        completedSteps: 2,
        totalSteps: state.researchProgress?.totalSteps || 6,
        currentTask: 'Analyzing search results for promising leads',
      },
      metadata: {
        totalSearches: searchQueries.length,
      },
    };
  } catch (error) {
    console.error('Error in breadthFirstSearchNode:', error);
    return {
      errors: [{ node: 'breadthFirstSearch', error: error.message }],
    };
  }
};

/**
 * Node: Step 2 - Analyze results and identify promising leads for deep diving
 */
export const identifyPromisingLeadsNode = async (state) => {
  console.log('--- Node: identifyPromisingLeadsNode ---');
  const { originalQuery, breadthResults, allSources } = state;

  try {
    // Analyze all collected information to identify key themes and promising directions
    const analysisPrompt = `You are an expert research analyst. Analyze the following search results and identify the most promising leads for deep research.

Original Query: "${originalQuery}"

Search Results Summary:
${breadthResults
  .map(
    (br) => `
Query: ${br.query}
Results Count: ${br.results.length}
Key Answer: ${br.answer || 'No direct answer'}
`
  )
  .join('\n')}

Top Sources (${Math.min(allSources.length, 20)}):
${allSources
  .slice(0, 20)
  .map(
    (source, i) => `
${i + 1}. ${source.title}
   URL: ${source.url}
   Snippet: ${source.snippet}
   Relevance: ${source.relevanceScore}
`
  )
  .join('\n')}

Identify 5-8 promising research leads that warrant deep investigation. For each lead, provide:
1. Lead title (concise)
2. Why it's promising
3. Specific research questions to investigate
4. Expected information depth
5. Related concepts to explore

Format your response as a JSON array of lead objects.`;

    const leadsAnalysis = await runGroqTask(
      analysisPrompt,
      [
        {
          role: 'user',
          content:
            'Please analyze these results and identify promising research leads.',
        },
      ],
      false
    );

    // Parse the promising leads
    let promisingLeads = [];
    try {
      const cleanAnalysis = leadsAnalysis
        .replace(/```json\s*|\s*```/g, '')
        .trim();
      promisingLeads = JSON.parse(cleanAnalysis);
    } catch (parseError) {
      console.log('Failed to parse leads as JSON, extracting manually...');
      promisingLeads = await extractLeadsFromText(leadsAnalysis, originalQuery);
    }

    // Build knowledge graph from discovered concepts
    const knowledgeGraph = await buildKnowledgeGraph(
      originalQuery,
      breadthResults,
      promisingLeads
    );

    console.log(
      `Identified ${promisingLeads.length} promising leads for deep research`
    );

    return {
      promisingLeads,
      knowledgeGraph,
      researchProgress: {
        phase: 'deep_dive',
        completedSteps: 3,
        totalSteps: state.researchProgress?.totalSteps || 6,
        currentTask: `Starting deep dive into ${promisingLeads.length} promising leads`,
      },
    };
  } catch (error) {
    console.error('Error in identifyPromisingLeadsNode:', error);
    return {
      errors: [{ node: 'identifyPromisingLeads', error: error.message }],
    };
  }
};

/**
 * Node: Step 3 - Deep dive into each promising lead
 */
export const deepDiveResearchNode = async (state) => {
  console.log('--- Node: deepDiveResearchNode ---');
  const { originalQuery, promisingLeads, allSources } = state;

  try {
    const searchTool = new TavilySearchTool({
      apiKey: process.env.TAVILY_API_KEY,
      maxResults: 10,
    });

    const deepDiveResults = [];

    // Deep dive into each promising lead
    for (const [index, lead] of promisingLeads.entries()) {
      console.log(
        `Deep diving into lead ${index + 1}/${promisingLeads.length}: ${lead.title}`
      );

      // Generate specific deep-dive queries for this lead
      const deepQueries = await generateDeepDiveQueries(lead, originalQuery);

      const leadResults = {
        lead,
        deepSearches: [],
        analysis: null,
        relatedConcepts: [],
        sources: [],
      };

      // Perform targeted searches for this lead
      for (const query of deepQueries) {
        console.log(`  Deep search: "${query}"`);

        const searchResult = await searchTool.invoke({
          query,
          searchDepth: 'advanced',
          includeAnswer: true,
          includeImages: false,
        });

        leadResults.deepSearches.push({
          query,
          results: searchResult.results || [],
          answer: searchResult.answer,
          timestamp: new Date(),
        });

        // Collect sources specific to this lead
        if (searchResult.results) {
          leadResults.sources.push(
            ...searchResult.results.map((r) => ({
              title: r.title,
              url: r.url,
              snippet: r.content || r.snippet,
              leadTitle: lead.title,
              searchQuery: query,
            }))
          );
        }
      }

      // Synthesize deep dive findings for this lead
      leadResults.analysis = await synthesizeLeadFindings(
        lead,
        leadResults.deepSearches,
        originalQuery
      );

      deepDiveResults.push(leadResults);
    }

    console.log(
      `Deep dive research completed for all ${promisingLeads.length} leads`
    );

    return {
      deepDiveResults,
      researchProgress: {
        phase: 'synthesis',
        completedSteps: 5,
        totalSteps: state.researchProgress?.totalSteps || 6,
        currentTask: 'Synthesizing comprehensive final report',
      },
      metadata: {
        totalSearches:
          (state.metadata?.totalSearches || 0) +
          deepDiveResults.reduce(
            (acc, lead) => acc + lead.deepSearches.length,
            0
          ),
      },
    };
  } catch (error) {
    console.error('Error in deepDiveResearchNode:', error);
    return {
      errors: [{ node: 'deepDiveResearch', error: error.message }],
    };
  }
};

/**
 * Node: Step 4 - Synthesize all findings into comprehensive report
 */
export const synthesizeComprehensiveReportNode = async (state) => {
  console.log('--- Node: synthesizeComprehensiveReportNode ---');
  const {
    originalQuery,
    breadthResults,
    promisingLeads,
    deepDiveResults,
    knowledgeGraph,
    allSources,
  } = state;

  try {
    // Calculate quality metrics
    const qualityMetrics = calculateQualityMetrics(state);

    // Create comprehensive synthesis
    const synthesisPrompt = `You are an expert research analyst creating a comprehensive research report. You have conducted a thorough recursive deep research process with the following steps:

ORIGINAL QUERY: "${originalQuery}"

RESEARCH PROCESS SUMMARY:
1. Breadth-First Search: Conducted ${breadthResults.length} broad searches
2. Lead Analysis: Identified ${promisingLeads.length} promising research directions
3. Deep Dive: Performed detailed investigation into each lead
4. Total Sources: ${allSources.length} sources analyzed

PROMISING LEADS INVESTIGATED:
${promisingLeads
  .map(
    (lead, i) => `
${i + 1}. ${lead.title}
   Why promising: ${lead.whyPromising}
   Research questions: ${lead.researchQuestions?.join('; ') || 'N/A'}
`
  )
  .join('\n')}

DEEP DIVE FINDINGS:
${deepDiveResults
  .map(
    (result, i) => `
Lead ${i + 1}: ${result.lead.title}
Searches performed: ${result.deepSearches.length}
Key findings: ${result.analysis}
Sources found: ${result.sources.length}
`
  )
  .join('\n')}

QUALITY METRICS:
- Source Diversity: ${qualityMetrics.sourceDiversity}/10
- Information Depth: ${qualityMetrics.informationDepth}/10
- Topic Coverage: ${qualityMetrics.topicCoverage}/10
- Credibility Score: ${qualityMetrics.credibilityScore}/10

Create a comprehensive research report with the following structure:

# Executive Summary
(2-3 paragraphs summarizing key findings)

# Methodology
(Brief overview of the recursive research approach used)

# Key Findings
(Organized by major themes/topics discovered)

## [Theme 1]
### Main Insights
### Supporting Evidence
### Sources

## [Theme 2]
### Main Insights
### Supporting Evidence
### Sources

[Continue for all major themes...]

# Deep Analysis
(Detailed analysis of the most significant discoveries)

# Knowledge Connections
(How different findings connect and relate to each other)

# Implications and Applications
(What these findings mean and how they can be applied)

# Research Gaps and Future Directions
(Areas that need further investigation)

# Conclusion
(Synthesis of all findings in context of original query)

# Complete Source Bibliography
(All sources organized by relevance and credibility)

Use markdown formatting, include proper citations [1], [2], etc., and ensure the report is comprehensive yet readable.`;

    const finalReport = await runGroqTask(
      synthesisPrompt,
      [
        {
          role: 'user',
          content:
            'Please create the comprehensive research report based on all the collected information.',
        },
      ],
      false
    );

    // Clean up any thinking tags
    let cleanReport = finalReport;
    if (finalReport.includes('<think>')) {
      cleanReport = finalReport.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }

    console.log('Comprehensive research report synthesized successfully');

    return {
      finalReport: cleanReport,
      qualityMetrics,
      researchProgress: {
        phase: 'completed',
        completedSteps: 6,
        totalSteps: 6,
        currentTask: 'Research completed - comprehensive report ready',
      },
      metadata: {
        processingTime: new Date() - (state.metadata?.timestamp || new Date()),
        confidence: calculateOverallConfidence(qualityMetrics),
      },
    };
  } catch (error) {
    console.error('Error in synthesizeComprehensiveReportNode:', error);
    return {
      errors: [{ node: 'synthesizeComprehensiveReport', error: error.message }],
      finalReport:
        'Error: Failed to synthesize comprehensive report. Please try again.',
    };
  }
};

/**
 * Node: Save research results to MongoDB
 */
export const saveDeepResearchNode = async (state) => {
  console.log('--- Node: saveDeepResearchNode ---');
  const {
    originalQuery,
    finalReport,
    qualityMetrics,
    metadata,
    deepDiveResults,
    allSources,
  } = state;

  try {
    const researchResult = {
      query: originalQuery,
      answer: finalReport,
      sources: allSources,
      classification: 'deep_research',
      researchType: 'recursive_deep',
      qualityMetrics,
      deepDiveResults: deepDiveResults.map((result) => ({
        leadTitle: result.lead.title,
        searchCount: result.deepSearches.length,
        sourceCount: result.sources.length,
        analysis: result.analysis,
      })),
      metadata: {
        processingTime: new Date() - (metadata?.timestamp || new Date()),
        totalSteps: state.researchProgress?.completedSteps || 6,
      },
      timestamp: new Date(),
    };

    const savedResult = await saveResearchResult(researchResult);
    console.log('Deep research result saved to MongoDB:', savedResult._id);

    return {
      metadata: {
        savedId: savedResult._id,
        processingTime: new Date() - (metadata?.timestamp || new Date()),
      },
    };
  } catch (error) {
    console.error('Error saving deep research result:', error);
    return {
      metadata: {
        saveError: error.message,
      },
    };
  }
};

/**
 * Node: Generate PDF report if requested
 */
export const generateDeepResearchPDFNode = async (state) => {
  console.log('--- Node: generateDeepResearchPDFNode ---');
  const {
    originalQuery,
    finalReport,
    allSources,
    generatePdf,
    metadata,
    qualityMetrics,
  } = state;

  if (!generatePdf) {
    return { pdfData: null };
  }

  try {
    // Validate required data
    if (!finalReport || finalReport.trim().length === 0) {
      throw new Error('No final report available for PDF generation');
    }

    // Ensure sources is an array
    const validSources = Array.isArray(allSources) ? allSources : [];

    const pdfData = await generatePDFReport({
      title: `Deep Research Report: ${originalQuery}`,
      query: originalQuery,
      answer: finalReport,
      sources: validSources.map((source, index) => ({
        id: index + 1,
        title: source.title || 'Untitled Source',
        url: source.url || '#',
        snippet: source.snippet || source.content || 'No description available',
      })),
      metadata: {
        generatedAt: new Date(),
        queryType: 'deep_research',
        processingTime: metadata?.processingTime || 0,
        qualityMetrics: qualityMetrics || {},
        totalSources: validSources.length,
        researchDepth: 'comprehensive_recursive',
      },
    });

    console.log('Deep research PDF report generated successfully');

    // Save PDF locally
    let savedFilePath = null;
    try {
      // Create output directory if it doesn't exist
      const outputDir = path.join(process.cwd(), 'output', 'pdfs');
      await fs.promises.mkdir(outputDir, { recursive: true });

      // Save the PDF file
      savedFilePath = await savePDFToFile(pdfData, outputDir);
      console.log(`PDF successfully saved locally: ${savedFilePath}`);
    } catch (saveError) {
      console.error('Warning: Failed to save PDF locally:', saveError.message);
      // Don't fail the entire operation if local save fails
    }

    return {
      pdfData: {
        ...pdfData,
        savedLocally: savedFilePath ? true : false,
        localPath: savedFilePath,
        saveError: savedFilePath ? null : 'Failed to save locally',
      },
    };
  } catch (error) {
    console.error('Error generating deep research PDF:', error);
    return {
      pdfData: {
        error: `Failed to generate PDF: ${error.message}`,
        fallbackAvailable: true,
      },
    };
  }
};

// Helper functions

const generateResearchPlan = async (query) => {
  const planPrompt = `Create a research plan for: "${query}"

Estimate the number of steps and complexity level (1-10) for comprehensive research.
Return a JSON object with: estimatedSteps, complexityLevel, suggestedDepth, timeEstimate`;

  try {
    const plan = await runGroqTask(planPrompt, [], false);
    return JSON.parse(plan);
  } catch (error) {
    return {
      estimatedSteps: 6,
      complexityLevel: 5,
      suggestedDepth: 3,
      timeEstimate: '10-15 minutes',
    };
  }
};

const generateBreadthSearchQueries = async (originalQuery) => {
  const queriesPrompt = `Generate 5-7 diverse search queries for comprehensive research on: "${originalQuery}"

Each query should explore different aspects, angles, or related concepts. Include:
- Direct queries about the topic
- Related concepts and subtopics  
- Current trends and developments
- Historical context
- Technical details
- Practical applications

Return as a JSON array of query strings.`;

  try {
    const queries = await runGroqTask(queriesPrompt, [], false);
    const cleanQueries = queries.replace(/```json\s*|\s*```/g, '').trim();
    return JSON.parse(cleanQueries);
  } catch (error) {
    // Fallback to basic query variations
    return [
      originalQuery,
      `${originalQuery} latest trends 2024`,
      `${originalQuery} research papers`,
      `${originalQuery} practical applications`,
      `${originalQuery} technical details`,
      `${originalQuery} expert analysis`,
    ];
  }
};

const generateDeepDiveQueries = async (lead, originalQuery) => {
  const deepQueriesPrompt = `Generate 3-5 specific, targeted search queries for deep research into this lead:

Lead: ${lead.title}
Original Query: ${originalQuery}
Research Questions: ${lead.researchQuestions?.join(', ') || 'General investigation'}

Create queries that will uncover detailed, specific information about this lead.
Return as a JSON array of query strings.`;

  try {
    const queries = await runGroqTask(deepQueriesPrompt, [], false);
    const cleanQueries = queries.replace(/```json\s*|\s*```/g, '').trim();
    return JSON.parse(cleanQueries);
  } catch (error) {
    // Fallback queries
    return [
      `${lead.title} detailed analysis`,
      `${lead.title} ${originalQuery}`,
      `${lead.title} research findings`,
      `${lead.title} expert opinions`,
    ];
  }
};

const synthesizeLeadFindings = async (lead, deepSearches, originalQuery) => {
  const synthesisPrompt = `Synthesize the findings for this research lead:

Lead: ${lead.title}
Original Query: ${originalQuery}

Deep Search Results:
${deepSearches
  .map(
    (search) => `
Query: ${search.query}
Answer: ${search.answer || 'No direct answer'}
Results: ${search.results.length} sources found
`
  )
  .join('\n')}

Provide a comprehensive analysis of what was discovered about this lead. Include key insights, evidence, and how it relates to the original query.`;

  try {
    return await runGroqTask(synthesisPrompt, [], false);
  } catch (error) {
    return `Analysis failed for lead: ${lead.title}`;
  }
};

const buildKnowledgeGraph = async (
  originalQuery,
  breadthResults,
  promisingLeads
) => {
  // Extract key concepts and build relationships
  const concepts = new Set();
  const relationships = [];

  // Add main query as central node
  concepts.add(originalQuery);

  // Add promising leads as concept nodes
  promisingLeads.forEach((lead) => {
    concepts.add(lead.title);
    relationships.push({
      from: originalQuery,
      to: lead.title,
      type: 'related_to',
      strength: 0.8,
    });
  });

  return {
    nodes: Array.from(concepts).map((concept) => ({
      id: concept,
      label: concept,
      type: concept === originalQuery ? 'central' : 'lead',
    })),
    edges: relationships,
    clusters: [], // Can be enhanced with clustering algorithm
  };
};

const calculateRelevanceScore = (source, originalQuery) => {
  // Simple relevance scoring based on keyword overlap
  const queryWords = originalQuery.toLowerCase().split(/\s+/);
  const sourceText =
    `${source.title} ${source.snippet || source.content || ''}`.toLowerCase();

  let score = 0;
  queryWords.forEach((word) => {
    if (sourceText.includes(word)) {
      score += 1;
    }
  });

  return Math.min(score / queryWords.length, 1) * 10;
};

const calculateQualityMetrics = (state) => {
  const { allSources, deepDiveResults, breadthResults } = state;

  // Source diversity (unique domains)
  const domains = new Set(allSources.map((s) => new URL(s.url).hostname));
  const sourceDiversity = Math.min((domains.size / 10) * 10, 10);

  // Information depth (based on deep dive results)
  const informationDepth = Math.min((deepDiveResults.length / 5) * 10, 10);

  // Topic coverage (based on breadth results)
  const topicCoverage = Math.min((breadthResults.length / 6) * 10, 10);

  // Credibility score (based on source quality)
  const credibilityScore = calculateCredibilityScore(allSources);

  return {
    sourceDiversity: Math.round(sourceDiversity * 10) / 10,
    informationDepth: Math.round(informationDepth * 10) / 10,
    topicCoverage: Math.round(topicCoverage * 10) / 10,
    credibilityScore: Math.round(credibilityScore * 10) / 10,
  };
};

const calculateCredibilityScore = (sources) => {
  // Simple credibility scoring based on domain reputation
  const highCredibilityDomains = [
    'edu',
    'gov',
    'org',
    'nature.com',
    'science.org',
    'ieee.org',
    'acm.org',
    'pubmed.ncbi.nlm.nih.gov',
    'scholar.google.com',
  ];

  let credibleSources = 0;
  sources.forEach((source) => {
    const domain = new URL(source.url).hostname;
    if (highCredibilityDomains.some((cd) => domain.includes(cd))) {
      credibleSources++;
    }
  });

  return Math.min((credibleSources / sources.length) * 10, 10);
};

const calculateOverallConfidence = (qualityMetrics) => {
  const { sourceDiversity, informationDepth, topicCoverage, credibilityScore } =
    qualityMetrics;
  return (
    (sourceDiversity + informationDepth + topicCoverage + credibilityScore) / 4
  );
};

const extractLeadsFromText = async (text, originalQuery) => {
  // Fallback manual extraction if JSON parsing fails
  return [
    {
      title: `${originalQuery} - Core Analysis`,
      whyPromising: 'Direct investigation of the main topic',
      researchQuestions: [`What are the key aspects of ${originalQuery}?`],
    },
    {
      title: `${originalQuery} - Current Developments`,
      whyPromising: 'Latest trends and developments',
      researchQuestions: [
        `What are the recent developments in ${originalQuery}?`,
      ],
    },
    {
      title: `${originalQuery} - Technical Details`,
      whyPromising: 'Deep technical understanding',
      researchQuestions: [
        `What are the technical aspects of ${originalQuery}?`,
      ],
    },
  ];
};
