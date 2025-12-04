import { Provider } from "#types/provider";
import { Model } from "#types/model";
import { PriceData } from "#server/components/PriceData";
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
import { createOpenRouter, OpenRouterProviderSettings } from '@openrouter/ai-sdk-provider';
import {createOpenAI, OpenAIProviderSettings} from '@ai-sdk/openai'
import {createAnthropic, AnthropicProviderSettings} from '@ai-sdk/anthropic'
import {createGoogleGenerativeAI, GoogleGenerativeAIProviderSettings} from '@ai-sdk/google'
import {createDeepInfra, DeepInfraProviderSettings} from '@ai-sdk/deepinfra'

/**
 * Unified executor that handles all AI SDK v5 providers.
 * Replaces the previous provider-specific executor classes.
 */
export class UnifiedExecutor {
  private static instance: UnifiedExecutor;
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
    ["openrouter", (config: OpenRouterProviderSettings) => createOpenRouter({
      apiKey: config.apiKey,
    })],
  ]);

  private constructor() {
  }

  public static initialize(): void {
    if (!UnifiedExecutor.instance) {
      UnifiedExecutor.instance = new UnifiedExecutor();
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
      return undefined;
    }

    // Get pricing using override logic: model.pricing first, then PriceData lookup
    try {
      const priceData = PriceData.getInstance();
      const pricing = priceData.getPriceWithOverride(provider.type, model);

      if (!pricing) {
        return undefined;
      }

      // Handle both v1 and v2 usage formats
      const inputTokens = usage.promptTokens ?? usage.inputTokens ?? 0;
      const outputTokens = usage.completionTokens ?? usage.outputTokens ?? 0;

      const inputCost = (inputTokens / 1_000_000) * (pricing.inputCostPerMillionTokens ?? 0);
      const outputCost = (outputTokens / 1_000_000) * (pricing.outputCostPerMillionTokens ?? 0);

      const totalCost = inputCost + outputCost;
      return totalCost;
    } catch (error) {
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

        })
        .catch((error: any) => {
        });

    } catch (error) {
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
  }
}
