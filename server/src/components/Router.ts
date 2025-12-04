import type { Provider } from "#types/provider";
import type { Model } from "#types/model";
import { ConfigManager } from "#server/components/config/ConfigManager";
import { Request, Response, NextFunction } from "express";
import { PriceData } from "#server/components/PriceData";

export class Router {
  private static instance: Router;

  // Private constructor - no longer needs UsageManager
  private constructor() {
  }

  /**
   * Initializes the singleton Router.
   */
  public static initialize(): void {
    if (Router.instance) {
      return;
    }
    Router.instance = new Router();
  }

  /**
   * Returns the singleton instance of the Router.
   * Throws an error if it hasn't been initialized.
   */
  public static getInstance(): Router {
    if (!Router.instance) {
      throw new Error("Router must be initialized before use.");
    }
    return Router.instance;
  }


  private getProvidersForModel(modelname: string): { provider: Provider; model: Model }[] | undefined {
    const providers: Provider[] = ConfigManager.getInstance().getProviders();
    const matches: { provider: Provider; model: Model }[] = [];

    for (const provider of providers) {
      for (const model of provider.models) {
        // Check if the requested model name matches either the mappedName or the real name
        const modelIdentifier = model.exposed_slug || model.canonical_slug;
        if (modelIdentifier === modelname) {
          matches.push({ provider, model });
        }
      }
    }

    return matches.length > 0 ? matches : undefined;
  }

  /**
   * Determines if a provider/model combination has zero cost.
   * A model is considered zero-cost only if pricing data exists and all pricing fields are explicitly 0.
   * Unknown/undefined pricing is not considered zero cost.
   */
  private isZeroCost(provider: Provider, model: Model): boolean {
    try {
      const priceData = PriceData.getInstance();
      // The zero-cost test mock expects a provider ID string.
      const pricing = priceData.getPriceWithOverride(provider.id, model);

      if (!pricing) {
        // No pricing data available - not considered zero cost
        return false;
      }

      // For a model to be considered zero cost, we need at least one pricing field
      // to be explicitly defined (not undefined) and all defined fields must be 0
      const hasInputCost = pricing.inputCostPerMillionTokens !== undefined;
      const hasOutputCost = pricing.outputCostPerMillionTokens !== undefined;

      // Must have at least one pricing field defined
      if (!hasInputCost && !hasOutputCost) {
        return false;
      }

      // All defined pricing fields must be exactly 0
      const inputIsZero = !hasInputCost || pricing.inputCostPerMillionTokens === 0;
      const outputIsZero = !hasOutputCost || pricing.outputCostPerMillionTokens === 0;

      return inputIsZero && outputIsZero;
    } catch (error) {
      return false;
    }
  }

  /**
   * Selects the best paid provider from a list of candidates based on cost.
   * Sorts by input cost, then by output cost.
   */
  private selectBestPaidProvider(
    candidates: { provider: Provider; model: Model }[],
  ): { provider: Provider; model: Model } | undefined {
    if (candidates.length === 0) {
      return undefined;
    }

    const priceData = PriceData.getInstance();

    return candidates.sort((a, b) => {
      const pricingA = priceData.getPriceWithOverride(a.provider as any, a.model);
      const pricingB = priceData.getPriceWithOverride(b.provider as any, b.model);

      const inputCostA = pricingA?.inputCostPerMillionTokens ?? Infinity;
      const inputCostB = pricingB?.inputCostPerMillionTokens ?? Infinity;
      const outputCostA = pricingA?.outputCostPerMillionTokens ?? Infinity;
      const outputCostB = pricingB?.outputCostPerMillionTokens ?? Infinity;

      // Providers with undefined costs (Infinity) should be sorted last
      const aHasUndefined = inputCostA === Infinity || outputCostA === Infinity;
      const bHasUndefined = inputCostB === Infinity || outputCostB === Infinity;

      if (aHasUndefined && !bHasUndefined) return 1;
      if (!aHasUndefined && bHasUndefined) return -1;

      // Both have complete pricing or both have undefined - sort by cost
      if (inputCostA !== inputCostB) {
        return inputCostA - inputCostB;
      }
      return outputCostA - outputCostB;
    })[0];
  }

  /**
   * Filters candidates - now returns all candidates since rate limiting is removed.
   */
  private async filterAvailableCandidates(
    candidates: { provider: Provider; model: Model }[]
  ): Promise<{ provider: Provider; model: Model }[]> {
    // Rate limiting has been removed, so all candidates are available
    return candidates;
  }

  /**
   * Partitions candidates into zero-cost and paid providers.
   */
  private partitionCandidatesByCost(
    candidates: { provider: Provider; model: Model }[]
  ): { zeroCost: { provider: Provider; model: Model }[]; paid: { provider: Provider; model: Model }[] } {
    const zeroCost: { provider: Provider; model: Model }[] = [];
    const paid: { provider: Provider; model: Model }[] = [];

    for (const candidate of candidates) {
      if (this.isZeroCost(candidate.provider, candidate.model)) {
        zeroCost.push(candidate);
      } else {
        paid.push(candidate);
      }
    }

    return { zeroCost, paid };
  }

  /**
   * Selects the best candidate from partitioned providers.
   */
  private selectBestCandidate(
    zeroCostCandidates: { provider: Provider; model: Model }[],
    paidCandidates: { provider: Provider; model: Model }[]
  ): { provider: Provider; model: Model } | undefined {
    if (zeroCostCandidates.length > 0) {

      return this.randomSelect(zeroCostCandidates);
    }

    if (paidCandidates.length > 0) {

      return this.selectBestPaidProvider(paidCandidates);
    }

    return undefined;
  }

  /**
   * Randomly selects one item from an array.
   */
  private randomSelect<T>(items: T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot select from empty array");
    }
    const randomIndex = Math.floor(Math.random() * items.length);
    return items[randomIndex];
  }

  public async getBestProviderForModel(
    modelName: string,
  ): Promise<{ provider: Provider; model: Model } | { error: string; status: number }> {


    const candidates = this.getProvidersForModel(modelName);
    if (!candidates || candidates.length === 0) {
      return {
        error: `No configured provider found for model: ${modelName}`,
        status: 404,
      };
    }


    const availableCandidates = await this.filterAvailableCandidates(candidates);
    if (availableCandidates.length === 0) {

      return {
        error: `No available providers found for model '${modelName}'.`,
        status: 503,
      };
    }

    const { zeroCost, paid } = this.partitionCandidatesByCost(availableCandidates);
    const selectedCandidate = this.selectBestCandidate(zeroCost, paid);

    if (!selectedCandidate) {

      return { error: "Failed to select a suitable provider.", status: 500 };
    }

    const { provider, model } = selectedCandidate;

    return { provider, model };
  }

  public async chooseProvider(req: Request, res: Response, next: NextFunction) {
    const modelName = req.body.model;
    const result = await this.getBestProviderForModel(modelName);

    if ("error" in result) {
      return res.status(result.status).json({ error: result.error });
    }

    res.locals.chosenProvider = result.provider;
    res.locals.chosenModel = result.model;
    return next();
  }
}
