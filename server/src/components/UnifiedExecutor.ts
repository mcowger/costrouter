import { Provider } from "#schemas/src/provider";
import { Model } from "#schemas/src/model";
import { UsageManager } from "./UsageManager.js";
import { PriceData } from "./PriceData.js";
import { logger } from "./Logger.js";
import { Request, Response } from "express";
import {
  GenerateTextResult,
  StreamTextResult,
  generateText,
  streamText
} from "ai";
import { getErrorMessage } from "./Utils.js";
// Import OpenAI types for proper response formatting
import type { ChatCompletion, ChatCompletionChunk } from "openai/resources";
// Import AI SDK providers
import { createOpenAI, OpenAIProviderSettings } from "@ai-sdk/openai";
import { AnthropicProviderSettings, createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI, GoogleGenerativeAIProviderSettings } from "@ai-sdk/google";
import { createVertex, GoogleVertexProviderSettings } from "@ai-sdk/google-vertex";
//import { createAzure } from "@ai-sdk/azure"; // Commented out until wI figure out the resourceName
//import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"; // Commented out until we verify API
import { createGroq, GroqProviderSettings } from "@ai-sdk/groq";
import { createMistral, MistralProviderSettings } from "@ai-sdk/mistral";
import { createDeepSeek, DeepSeekProviderSettings } from "@ai-sdk/deepseek";
import { createXai, XaiProviderSettings } from "@ai-sdk/xai";
import { createPerplexity, PerplexityProviderSettings } from "@ai-sdk/perplexity";
import { createTogetherAI, TogetherAIProviderSettings } from "@ai-sdk/togetherai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { CopilotTokenManager } from "./config/CopilotTokenManager.js";

// import { createOpenRouter } from '@openrouter/ai-sdk-provider'; Only supports v5,
// which nothing else does.  For now, treat it as openai-compatible
import { createOllama, OllamaProviderSettings } from "ollama-ai-provider";
import { createQwen, QwenProviderSettings } from "qwen-ai-provider";
import { createGeminiProvider } from "ai-sdk-provider-gemini-cli"
import { createClaudeCode } from "ai-sdk-provider-claude-code"

/**
 * Unified executor that handles all AI SDK v5 providers.
 * Replaces the previous provider-specific executor classes.
 */
export class UnifiedExecutor {
  private static instance: UnifiedExecutor;
  private usageManager: UsageManager;
  private providerInstances: Map<string, any> = new Map();

  // Map of provider types to their factory functions
  // Adding new providers is as simple as adding a new entry here!

  private static readonly PROVIDER_FACTORIES = new Map<string, (config: Provider) => any>([
    // Core AI SDK providers
    ["openai", (config: OpenAIProviderSettings) => createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL // Support custom OpenAI endpoints
    })],
    ["anthropic", (config: AnthropicProviderSettings) => createAnthropic({
      apiKey: config.apiKey
    })],
    ["google", (config: GoogleGenerativeAIProviderSettings) => createGoogleGenerativeAI({
      apiKey: config.apiKey,
    })],
    ["google-vertex", (config: GoogleVertexProviderSettings) => createVertex({
      googleAuthOptions: config.googleAuthOptions
    })],
    ["groq", (config: GroqProviderSettings) => createGroq({
      apiKey: config.apiKey
    })],
    ["mistral", (config: MistralProviderSettings) => createMistral({
      apiKey: config.apiKey
    })],
    ["deepseek", (config: DeepSeekProviderSettings) => createDeepSeek({
      apiKey: config.apiKey
    })],
    ["xai", (config: XaiProviderSettings) => createXai({
      apiKey: config.apiKey
    })],
    ["perplexity", (config: PerplexityProviderSettings) => createPerplexity({
      apiKey: config.apiKey
    })],
    ["togetherai", (config: TogetherAIProviderSettings) => createTogetherAI({
      apiKey: config.apiKey
    })],

    ["qwen", (config: QwenProviderSettings) => createQwen({
      apiKey: config.apiKey!,
    })],
    ["ollama", (config: OllamaProviderSettings) => createOllama({
      baseURL: config.baseURL || "http://localhost:11434",
    })],
    ["gemini-cli", (_config: any) => createGeminiProvider({
      authType: "oauth-personal"
    })],
    ["claude-code", (_config: any) => createClaudeCode({
    })],
    // OpenRouter - use compatible for now because their provider only supports v5.
    ["openrouter", (config) => createOpenAICompatible({
      name: config.id,
      apiKey: config.apiKey!,
      baseURL: config.baseURL || "https://api.openrouter.ai/api/v1",
    })],

    // OpenAI-compatible providers
    ["openai-compatible", (config) => createOpenAICompatible({
      name: config.id,
      baseURL: config.baseURL!,
      apiKey: config.apiKey!,
    })],
    ["custom", (config) => createOpenAICompatible({ // Legacy support
      name: config.id,
      baseURL: config.baseURL!,
      apiKey: config.apiKey!,
    })],
    ["copilot", async (config) => createOpenAICompatible({
      name: config.id,
      apiKey: await CopilotTokenManager.getBearerToken(config),
      baseURL: config.baseURL || "https://api.githubcopilot.com/",
      headers: {
        accept: "application/json",
        "editor-version": "vscode/1.85.1",
        "Copilot-Integration-Id": "vscode-chat",
        "content-type": "application/json",
        "user-agent": "GithubCopilot/1.155.0",
        "accept-encoding": "gzip,deflate,br",
      },
    })],
  ]);

  private constructor(usageManager: UsageManager) {
    this.usageManager = usageManager;
  }

  public static initialize(usageManager: UsageManager): void {
    if (!UnifiedExecutor.instance) {
      UnifiedExecutor.instance = new UnifiedExecutor(usageManager);
    }
  }

  public static getInstance(): UnifiedExecutor {
    if (!UnifiedExecutor.instance) {
      throw new Error('UnifiedExecutor has not been initialized. Call initialize() first.');
    }
    return UnifiedExecutor.instance;
  }

  /**
   * Register a new provider factory function.
   * Useful for adding custom providers without modifying the core code.
   */
  public static registerProvider(type: string, factory: (config: Provider) => any): void {
    UnifiedExecutor.PROVIDER_FACTORIES.set(type, factory);
  }

  /**
   * Get all supported provider types.
   */
  public static getSupportedProviders(): string[] {
    return Array.from(UnifiedExecutor.PROVIDER_FACTORIES.keys());
  }

  /**
   * Creates an AI SDK provider instance based on the provider configuration.
   */
  private async createProviderInstance(config: Provider): Promise<any> {
    const factory = UnifiedExecutor.PROVIDER_FACTORIES.get(config.type);

    if (!factory) {
      const supportedTypes = UnifiedExecutor.getSupportedProviders().join(', ');
      throw new Error(
        `Unsupported provider type: ${config.type}. Supported types: ${supportedTypes}`
      );
    }

    // The factory can be async now (e.g., for Copilot)
    return await factory(config);
  }

  /**
   * Gets or creates a provider instance, with caching.
   */
  private async getOrCreateProvider(config: Provider): Promise<any> {
    const cacheKey = `${config.type}-${config.id}`;

    if (!this.providerInstances.has(cacheKey)) {
      logger.debug(`Creating new provider instance for ${config.type}:${config.id}`);
      const instance = await this.createProviderInstance(config);
      this.providerInstances.set(cacheKey, instance);
    }

    return this.providerInstances.get(cacheKey);
  }

  /**
   * Main execution method that handles requests for any provider type.
   */
  public async execute(req: Request, res: Response): Promise<void> {
    const chosenProvider = res.locals.chosenProvider as Provider;
    const chosenModel = res.locals.chosenModel as Model;

    logger.debug(
      { provider: chosenProvider, model: chosenModel },
      `Executing request with ${chosenProvider.type} provider`
    );

    try {
      // Get or create the AI SDK provider instance
      const providerInstance = await this.getOrCreateProvider(chosenProvider);

      // Create the model using the provider
      const model = providerInstance(chosenModel.canonical_slug);

      // Extract request data
      const { messages, stream = false, n = 1 } = req.body;

      // Execute the request using AI SDK
      if (stream) {
        // Note: Streaming doesn't support multiple choices (n > 1) in OpenAI API
        if (n > 1) {
          logger.warn(`Streaming requests don't support n > 1. Using n = 1 instead of ${n}`);
        }
        const result = streamText({ model: model as any, messages });
        this.handleStreamingResponse(res, chosenProvider, chosenModel, result);
      } else {
        // Handle multiple choices for non-streaming requests
        if (n > 1) {
          const results = await Promise.all(
            Array.from({ length: n }, () => generateText({ model: model as any, messages }))
          );
          this.handleMultipleChoicesResponse(res, chosenProvider, chosenModel, results);
        } else {
          const result = await generateText({ model: model as any, messages });
          this.handleNonStreamingResponse(res, chosenProvider, chosenModel, result);
        }
      }
    } catch (error) {
      logger.error(
        `AI request failed for provider ${chosenProvider.id}: ${getErrorMessage(error)}`
      );
      res.status(500).json({ error: "AI request failed" });
    }
  }

  /**
   * Calculates the cost of a request based on model pricing and usage.
   * Uses PriceData override logic: model.pricing if available, otherwise PriceData lookup.
   * Handles both old and new usage formats.
   * @returns The calculated cost in USD, or undefined if pricing data is not available
   */
  private calculateCost(provider: Provider, model: Model, usage: any): number | undefined {
    if (!usage) {
      logger.debug(`No usage data for model '${model.canonical_slug}'. Cannot calculate cost.`);
      return undefined;
    }

    // Get pricing using override logic: model.pricing first, then PriceData lookup
    try {
      const priceData = PriceData.getInstance();
      const pricing = priceData.getPriceWithOverride(provider.type, model);

      if (!pricing) {
        logger.debug(`No pricing data available for model '${model.canonical_slug}' in provider '${provider.type}'. Cannot calculate cost.`);
        return undefined;
      }

      // If a flat request cost is defined, it overrides token-based pricing.
      if (pricing.costPerRequest) {
        return pricing.costPerRequest;
      }

      // Handle both v1 and v2 usage formats
      const inputTokens = usage.promptTokens ?? usage.inputTokens ?? 0;
      const outputTokens = usage.completionTokens ?? usage.outputTokens ?? 0;

      const inputCost = (inputTokens / 1_000_000) * (pricing.inputCostPerMillionTokens ?? 0);
      const outputCost = (outputTokens / 1_000_000) * (pricing.outputCostPerMillionTokens ?? 0);

      const totalCost = inputCost + outputCost;
      logger.debug(`Calculated cost for model '${model.canonical_slug}': $${totalCost.toFixed(6)}`);
      return totalCost;
    } catch (error) {
      logger.debug(`Error calculating cost for model '${model.canonical_slug}': ${getErrorMessage(error)}. Using fallback.`);
      return undefined;
    }
  }

  /**
   * Handles streaming responses and usage tracking.
   * Converts AI SDK stream to OpenAI API format.
   */
  private async handleStreamingResponse(
    res: Response,
    provider: Provider,
    model: Model,
    result: StreamTextResult<any, any>,
  ): Promise<void> {
    // Set up Server-Sent Events headers
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const streamId = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    const modelName = model.exposed_slug || model.canonical_slug;

    // Send initial chunk with role
    const initialChunk: ChatCompletionChunk = {
      id: streamId,
      object: 'chat.completion.chunk',
      created,
      model: modelName,
      choices: [{
        index: 0,
        delta: { role: 'assistant' },
        finish_reason: null,
        logprobs: null
      }]
    };
    res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);

    try {
      // Stream the text content
      for await (const textDelta of result.textStream) {
        const chunk: ChatCompletionChunk = {
          id: streamId,
          object: 'chat.completion.chunk',
          created,
          model: modelName,
          choices: [{
            index: 0,
            delta: { content: textDelta },
            finish_reason: null,
            logprobs: null
          }]
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      // Wait for the stream to complete and get the finish reason
      const finishReason = await result.finishReason;

      // Send final chunk with finish_reason
      const finalChunk: ChatCompletionChunk = {
        id: streamId,
        object: 'chat.completion.chunk',
        created,
        model: modelName,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: finishReason as ChatCompletionChunk.Choice['finish_reason'],
          logprobs: null
        }]
      };
      res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();

      // Handle usage tracking
      result.usage
        .then((usage: any) => {
          const cost = this.calculateCost(provider, model, usage);
          // Convert usage format for UsageManager compatibility
          const usageForManager = {
            promptTokens: usage.promptTokens ?? usage.inputTokens ?? 0,
            completionTokens: usage.completionTokens ?? usage.outputTokens ?? 0,
          };
          // Use the real model name for usage tracking
          // Use 0 as fallback if cost is undefined (pricing data not available)
          this.usageManager.consume(provider.id, model.canonical_slug, usageForManager, cost ?? 0);
        })
        .catch((error: any) => {
          logger.error(`Failed to consume usage for streaming request: ${getErrorMessage(error)}`);
        });

    } catch (error) {
      logger.error(`Streaming error: ${getErrorMessage(error)}`);
      res.write(`data: {"error": "Streaming failed"}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }

  /**
   * Handles non-streaming responses and usage tracking.
   * Preserved from BaseExecutor.
   */
  private handleNonStreamingResponse(
    res: Response,
    provider: Provider,
    model: Model,
    result: GenerateTextResult<any, any>,
  ): void {
    const cost = this.calculateCost(provider, model, result.usage);
    // Convert usage format for UsageManager compatibility
    const usageForManager = {
      promptTokens: (result.usage as any).promptTokens ?? (result.usage as any).inputTokens ?? 0,
      completionTokens: (result.usage as any).completionTokens ?? (result.usage as any).outputTokens ?? 0,
    };
    // Use the real model name for usage tracking
    // Use 0 as fallback if cost is undefined (pricing data not available)
    this.usageManager.consume(provider.id, model.canonical_slug, usageForManager, cost ?? 0);

    // Format response to match OpenAI API format using official types
    const openAIResponse: ChatCompletion = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model.exposed_slug || model.canonical_slug, // Use the mapped name that the client requested
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: result.text,
          refusal: null
        },
        finish_reason: result.finishReason as ChatCompletion.Choice['finish_reason'],
        logprobs: null
      }],
      usage: {
        prompt_tokens: usageForManager.promptTokens,
        completion_tokens: usageForManager.completionTokens,
        total_tokens: usageForManager.promptTokens + usageForManager.completionTokens
      }
    };

    res.json(openAIResponse);
  }

  /**
   * Handles multiple choices responses for non-streaming requests when n > 1.
   * Combines multiple GenerateTextResult objects into a single OpenAI-compatible response.
   */
  private handleMultipleChoicesResponse(
    res: Response,
    provider: Provider,
    model: Model,
    results: GenerateTextResult<any, any>[],
  ): void {
    // Calculate total cost and usage across all results
    let totalCost = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    // Process each result for usage tracking
    results.forEach((result) => {
      const cost = this.calculateCost(provider, model, result.usage) ?? 0;
      totalCost += cost;

      const promptTokens = (result.usage as any).promptTokens ?? (result.usage as any).inputTokens ?? 0;
      const completionTokens = (result.usage as any).completionTokens ?? (result.usage as any).outputTokens ?? 0;

      totalPromptTokens += promptTokens;
      totalCompletionTokens += completionTokens;
    });

    // Track usage with combined totals
    const usageForManager = {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
    };
    this.usageManager.consume(provider.id, model.canonical_slug, usageForManager, totalCost);

    // Format response to match OpenAI API format with multiple choices
    const openAIResponse: ChatCompletion = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model.exposed_slug || model.canonical_slug,
      choices: results.map((result, index) => ({
        index,
        message: {
          role: "assistant",
          content: result.text,
          refusal: null
        },
        finish_reason: result.finishReason as ChatCompletion.Choice['finish_reason'],
        logprobs: null
      })),
      usage: {
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        total_tokens: totalPromptTokens + totalCompletionTokens
      }
    };

    res.json(openAIResponse);
  }

  /**
   * Clears the provider instance cache.
   * Useful for testing or when provider configurations change.
   */
  public clearCache(): void {
    this.providerInstances.clear();
    logger.debug("Provider instance cache cleared");
  }
}
