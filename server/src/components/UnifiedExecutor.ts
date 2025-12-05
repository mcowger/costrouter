import { Provider } from '#types/provider';
import { Model } from '#types/model';
import { PriceData } from '#server/components/PriceData';
import { APICallError } from 'ai';
import { Request, Response } from 'express';
import { GenerateTextResult, StreamTextResult, generateText, streamText } from 'ai';
import { getErrorMessage } from './Utils.js';
// Import OpenAI types for proper response formatting
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources';
// Import AI SDK providers
import { createOpenRouter, OpenRouterProviderSettings } from '@openrouter/ai-sdk-provider';
import { createOpenAI, OpenAIProviderSettings } from '@ai-sdk/openai';
import { createAnthropic, AnthropicProviderSettings } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI, GoogleGenerativeAIProviderSettings } from '@ai-sdk/google';
import { createDeepInfra, DeepInfraProviderSettings } from '@ai-sdk/deepinfra';

/**
 * Unified executor that handles all AI SDK v5 providers.
 * Replaces the previous provider-specific executor classes.
 */
export class UnifiedExecutor {
  private static instance: UnifiedExecutor;
  private providerInstances: Map<string, any> = new Map();

  // Map of provider types to their factory functions
  // Adding new providers is as simple as adding a new entry here!

  private static readonly PROVIDER_FACTORIES = new Map<string, (config: any) => any>([
    // Core AI SDK providers
    [
      'openai',
      (config: OpenAIProviderSettings) =>
        createOpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseURL, // Support custom OpenAI endpoints
        }),
    ],
    [
      'anthropic',
      (config: AnthropicProviderSettings) =>
        createAnthropic({
          apiKey: config.apiKey,
        }),
    ],
    [
      'google',
      (config: GoogleGenerativeAIProviderSettings) =>
        createGoogleGenerativeAI({
          apiKey: config.apiKey,
        }),
    ],
    [
      'openrouter',
      (config: OpenRouterProviderSettings) =>
        createOpenRouter({
          apiKey: config.apiKey,
        }),
    ],
    [
      'deepinfra',
      (config: DeepInfraProviderSettings) =>
        createDeepInfra({
          apiKey: config.apiKey,
        }),
    ],
  ]);

  private constructor() {}

  public static initialize(): UnifiedExecutor {
    if (!UnifiedExecutor.instance) {
      UnifiedExecutor.instance = new UnifiedExecutor();
      return UnifiedExecutor.instance;
    } else {
      return UnifiedExecutor.instance;
    }
  }

  public static getInstance(): UnifiedExecutor {
    if (!UnifiedExecutor.instance) {
      UnifiedExecutor.initialize();
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
  private createProviderInstance(config: Provider): Promise<any> {
    const factory = UnifiedExecutor.PROVIDER_FACTORIES.get(config.type);

    if (!factory) {
      const supportedTypes = UnifiedExecutor.getSupportedProviders().join(', ');
      throw new Error(`Unsupported provider type: ${config.type}. Supported types: ${supportedTypes}`);
    }

    // The factory can be async now (e.g., for Copilot)
    return factory(config);
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

    // Get or create the AI SDK provider instance
    const providerInstance = await this.getOrCreateProvider(chosenProvider);

    // Create the model using the provider
    const model = providerInstance(chosenModel.exposed_slug);

    // Extract request data
    const { messages, stream = false, n = 1 } = req.body;

    // Execute the request using AI SDK
    if (stream) {
      // Note: Streaming doesn't support multiple choices (n > 1) in OpenAI API
      try {
        const result = streamText({ model: model as any, messages });
        await this.handleStreamingResponse(res, chosenProvider, chosenModel, result);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'AI generation failed due to a server or API error.',
            details: (error as Error).message,
          }),
        );
      }
    } else {
      try {
        const result = await generateText({ model: model as any, messages });
        this.handleNonStreamingResponse(res, chosenProvider, chosenModel, result);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'AI generation failed due to a server or API error.',
            details: (error as Error).message,
          }),
        );
      }
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
    result: StreamTextResult<any, any>, // This result must come from a successful 'streamText' call
  ): Promise<void> {
    try {
      // 1. Define metadata
      const streamId = `chatcmpl-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);
      const modelName = model.exposed_slug;

      // 2. Set up Server-Sent Events headers
      // We call writeHead here, ensuring it only happens if 'result' was obtained successfully.
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // 3. Send initial chunk with role
      const initialChunk = {
        id: streamId,
        object: 'chat.completion.chunk',
        created,
        model: modelName,
        choices: [
          {
            index: 0,
            delta: { role: 'assistant' },
            finish_reason: null,
            logprobs: null,
          },
        ],
      };
      res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);

      // 4. Stream the text content
      for await (const textDelta of result.textStream) {
        const chunk = {
          id: streamId,
          object: 'chat.completion.chunk',
          created,
          model: modelName,
          choices: [
            {
              index: 0,
              delta: { content: textDelta },
              finish_reason: null,
              logprobs: null,
            },
          ],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      // 5. Wait for the stream to complete and get the finish reason
      const finishReason = await result.finishReason;

      // 6. Send final chunk with finish_reason
      const finalChunk = {
        id: streamId,
        object: 'chat.completion.chunk',
        created,
        model: modelName,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: finishReason, // Assuming 'finishReason' matches the required type
            logprobs: null,
          },
        ],
      };
      res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      // 7. Handle error: Headers sent status determines response format.
      if (!res.headersSent) {
        // PRE-STREAM ERROR: Headers were NOT sent, so send a proper HTTP error status.
        console.error('Pre-stream AI API Error:', error);

        // Send a standard 500 error status
        res.writeHead(500, { 'Content-Type': 'application/json' });

        // Send a standard JSON error response (not SSE format)
        res.end(
          JSON.stringify({
            error: 'AI generation failed due to a server or API error.',
            details: (error as Error).message,
          }),
        );
      } else {
        // MID-STREAM ERROR: Headers were already sent, attempt to send an SSE error.
        if (!res.writableEnded) {
          try {
            res.write(`data: {"error": "Mid-stream connection failed."}\n\n`);
            res.write('data: [DONE]\n\n');
          } catch (writeError) {
            // Ignore write errors if client disconnected
          } finally {
            res.end();
          }
        }
      }
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
    // Use the real model name for usage tracking
    // Use 0 as fallback if cost is undefined (pricing data not available)

    // Format response to match OpenAI API format using official types
    const openAIResponse: ChatCompletion = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model.exposed_slug, // Use the mapped name that the client requested
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: result.text,
            refusal: null,
          },
          finish_reason: result.finishReason as ChatCompletion.Choice['finish_reason'],
          logprobs: null,
        },
      ],
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
    // Format response to match OpenAI API format with multiple choices
    const openAIResponse: ChatCompletion = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model.exposed_slug,
      choices: results.map((result, index) => ({
        index,
        message: {
          role: 'assistant',
          content: result.text,
          refusal: null,
        },
        finish_reason: result.finishReason as ChatCompletion.Choice['finish_reason'],
        logprobs: null,
      })),
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
