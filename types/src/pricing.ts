/**
 * Type definition for defining the cost structure of a request.
 * All cost fields are optional.
 */
export type Pricing = {
  /** 
   * The cost in USD per 1 million input tokens.
   * Example: A value of 0.5 means $0.50 per 1M input tokens.
   */
  inputCostPerMillionTokens?: number;

  /** 
   * The cost in USD per 1 million output tokens.
   * Example: A value of 1.5 means $1.50 per 1M output tokens.
   */
  outputCostPerMillionTokens?: number;

};