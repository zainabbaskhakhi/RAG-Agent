// src/services/agent.js
import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { MessagesAnnotation, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';
import { retrieveForRAG } from './retrieval.js';
import { llm } from '../config/openai.js';

/**
 * Define the retrieval tool for the agent
 */
const retrievalTool = new DynamicStructuredTool({
  name: 'retrieve_csv_data',
  description: 'Retrieves relevant information from the CSV dataset based on a search query. Use this tool to find information needed to answer the user\'s question. Always use this tool before attempting to answer any question.',
  schema: z.object({
    query: z.string().describe('The search query to find relevant information in the CSV dataset'),
  }),
  func: async ({ query }) => {
    console.log(`\n🔧 Tool called: retrieve_csv_data with query: "${query}"`);
    
    try {
      const result = await retrieveForRAG(query);
      
      if (!result.hasResults) {
        return JSON.stringify({
          found: false,
          message: 'No relevant information found in the dataset for this query.',
          context: '',
          sources: [],
        });
      }
      
      return JSON.stringify({
        found: true,
        context: result.context,
        sources: result.sources,
        documentCount: result.documents.length,
      });
      
    } catch (error) {
      console.error('Error in retrieval tool:', error);
      return JSON.stringify({
        found: false,
        error: 'Error retrieving data from the dataset.',
        message: error.message,
      });
    }
  },
});

const tools = [retrievalTool];

/**
 * Define the agent logic
 */
function shouldContinue(state) {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];
  
  // If there are no tool calls, we're done
  if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    return 'end';
  }
  
  // Otherwise continue to tool execution
  return 'tools';
}

async function callModel(state) {
  const messages = state.messages;
  
  // Bind tools to the LLM before invoking
  const modelWithTools = llm.bindTools(tools);
  const response = await modelWithTools.invoke(messages);
  
  return { messages: [response] };
}

/**
 * Create the LangGraph agent
 */
function createAgent() {
  const workflow = new StateGraph(MessagesAnnotation)
    .addNode('agent', callModel)
    .addNode('tools', new ToolNode(tools))
    .addEdge('__start__', 'agent')
    .addConditionalEdges('agent', shouldContinue, {
      tools: 'tools',
      end: '__end__',
    })
    .addEdge('tools', 'agent');
  
  return workflow.compile();
}

// Create the agent instance
const agent = createAgent();

/**
 * System prompt for the RAG agent with formatting instructions
 */
const SYSTEM_PROMPT = `You are a helpful AI assistant that answers questions based strictly on information from a CSV dataset. 

CRITICAL RULES:
1. ALWAYS use the retrieve_csv_data tool to search for information before answering any question.
2. Base your answers ONLY on the information retrieved from the dataset.
3. If the retrieved information does not contain an answer to the user's question, respond with: "I couldn't find relevant information in the dataset to answer this question."
4. Never make up information or use knowledge outside of the dataset.
5. When you find relevant information, provide a clear, well-formatted answer.
6. If the information is partial or uncertain, acknowledge this in your response.
7. Be helpful and conversational, but always stay grounded in the data.

FORMATTING GUIDELINES:
- Structure your answer clearly with proper paragraphs
- Use bullet points for lists when appropriate
- Highlight key information
- Keep the tone professional but friendly
- Be concise but comprehensive

Remember: Your primary goal is accuracy and faithfulness to the dataset. It's better to say you don't know than to provide incorrect information.`;

/**
 * Format the answer with citations and structure
 */
function formatAnswer(rawAnswer, sources, hasToolResults) {
  // If no tool results were found, return a formatted "no results" message
  if (!hasToolResults) {
    return {
      formattedAnswer: "I couldn't find relevant information in the dataset to answer this question. Please try rephrasing your query or asking about different aspects of the data.",
      citations: [],
    };
  }

  // Clean up the answer
  let formattedAnswer = rawAnswer.trim();
  
  // Add source citations if available
  let citations = [];
  if (sources && sources.length > 0) {
    citations = sources.map((source, index) => ({
      id: index + 1,
      ...source,
    }));
    
    // Add citations section to the answer if not already present
    if (!formattedAnswer.toLowerCase().includes('source') && 
        !formattedAnswer.toLowerCase().includes('reference')) {
      formattedAnswer += '\n\n**Sources:**\n';
      citations.forEach(citation => {
        formattedAnswer += `- Document ${citation.id}`;
        if (citation.metadata) {
          const metadata = citation.metadata;
          if (metadata.row) formattedAnswer += ` (Row ${metadata.row})`;
          if (metadata.filename) formattedAnswer += ` from ${metadata.filename}`;
        }
        formattedAnswer += '\n';
      });
    }
  }
  
  return {
    formattedAnswer,
    citations,
  };
}

/**
 * Run the agent with a user query
 */
export async function runAgent(userQuery) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🤖 Agent processing query: "${userQuery}"`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userQuery },
    ];
    
    const result = await agent.invoke({
      messages,
    });
    
    // Extract the final answer
    const finalMessages = result.messages;
    const lastMessage = finalMessages[finalMessages.length - 1];
    const rawAnswer = lastMessage.content;
    
    // Extract sources and context from tool calls
    let sources = [];
    let retrievedContext = null;
    let hasToolResults = false;
    
    for (const msg of finalMessages) {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Find the corresponding tool message
        const toolMessages = finalMessages.filter(m => m.tool_call_id);
        for (const toolMsg of toolMessages) {
          try {
            const toolResult = JSON.parse(toolMsg.content);
            if (toolResult.found) {
              hasToolResults = true;
              if (toolResult.sources) {
                sources = toolResult.sources;
              }
              if (toolResult.context) {
                retrievedContext = toolResult.context;
              }
            }
          } catch (e) {
            console.log('Could not parse tool result:', e.message);
          }
        }
      }
    }
    
    // Format the answer with citations
    const { formattedAnswer, citations } = formatAnswer(rawAnswer, sources, hasToolResults);
    
    console.log(`\n✅ Agent completed successfully`);
    console.log(`   Answer length: ${formattedAnswer.length} characters`);
    console.log(`   Sources found: ${citations.length}`);
    
    return {
      answer: formattedAnswer,
      rawAnswer: rawAnswer,
      sources: citations,
      context: retrievedContext,
      hasAnswer: hasToolResults && !rawAnswer.toLowerCase().includes('no answer found') && 
                 !rawAnswer.toLowerCase().includes('couldn\'t find'),
      metadata: {
        query: userQuery,
        timestamp: new Date().toISOString(),
        sourceCount: citations.length,
      },
    };
    
  } catch (error) {
    console.error('\n❌ Agent error:', error.message);
    throw error;
  }
}

/**
 * Simple query function with formatted output
 */
export async function simpleQuery(userQuery, options = {}) {
  console.log(`\n📝 Processing simple query: "${userQuery}"`);
  
  try {
    // Retrieve relevant documents
    const retrievalResult = await retrieveForRAG(userQuery, options);
    
    if (!retrievalResult.hasResults) {
      return {
        answer: "I couldn't find relevant information in the dataset to answer this question. Please try rephrasing your query or asking about different aspects of the data.",
        rawAnswer: 'No answer found in the dataset.',
        sources: [],
        hasAnswer: false,
        metadata: {
          query: userQuery,
          timestamp: new Date().toISOString(),
          sourceCount: 0,
        },
      };
    }
    
    // Create prompt with context
    const prompt = `Based on the following information from the dataset, answer the user's question in a clear, well-formatted way.

Context from the dataset:
${retrievalResult.context}

User Question: ${userQuery}

Instructions:
- Provide a direct, clear answer based on the context
- Structure your response with proper formatting
- Use bullet points for lists if needed
- If the context doesn't fully answer the question, acknowledge what information is available
- Be concise but comprehensive
- Do not add information not present in the context

Answer:`;
    
    // Get LLM response
    const response = await llm.invoke(prompt);
    const rawAnswer = response.content;
    
    // Format the answer with citations
    const { formattedAnswer, citations } = formatAnswer(
      rawAnswer, 
      retrievalResult.sources, 
      true
    );
    
    console.log(`  ✓ Generated formatted answer: ${formattedAnswer.substring(0, 100)}...`);
    
    return {
      answer: formattedAnswer,
      rawAnswer: rawAnswer,
      sources: citations,
      context: retrievalResult.context,
      hasAnswer: !rawAnswer.toLowerCase().includes('no answer found') && 
                 !rawAnswer.toLowerCase().includes('couldn\'t find'),
      metadata: {
        query: userQuery,
        timestamp: new Date().toISOString(),
        sourceCount: citations.length,
        retrievalScore: retrievalResult.documents[0]?.score || null,
      },
    };
    
  } catch (error) {
    console.error('Error in simple query:', error.message);
    throw error;
  }
}

/**
 * Format response for API endpoint
 */
export function formatAPIResponse(queryResult) {
  return {
    success: true,
    data: {
      answer: queryResult.answer,
      hasAnswer: queryResult.hasAnswer,
      sources: queryResult.sources.map(source => ({
        id: source.id,
        content: source.pageContent || source.content,
        metadata: source.metadata,
      })),
      metadata: queryResult.metadata,
    },
  };
}

/**
 * Format response for streaming (if needed)
 */
export function* formatStreamingResponse(queryResult) {
  // Send answer in chunks
  const answer = queryResult.answer;
  const chunkSize = 50;
  
  for (let i = 0; i < answer.length; i += chunkSize) {
    yield {
      type: 'answer_chunk',
      content: answer.slice(i, i + chunkSize),
    };
  }
  
  // Send sources
  if (queryResult.sources && queryResult.sources.length > 0) {
    yield {
      type: 'sources',
      sources: queryResult.sources,
    };
  }
  
  // Send metadata
  yield {
    type: 'metadata',
    metadata: queryResult.metadata,
  };
  
  // Send completion signal
  yield {
    type: 'done',
  };
}