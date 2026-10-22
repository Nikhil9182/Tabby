/**
 * The one place the app converts money. Components never compute rates or
 * formulas themselves; they call this service or the hooks built on it.
 * Policy: ARCHITECTURE.md §8.1.
 */
import { formatMoney as formatMinor } from '@/domain/money/money';
import {
  convertMinor,
  getDisplayAmount as resolveDisplayAmount,
  type DisplayAmount,
  type RateContext,
  type RateQuote,
} from '@/domain/money/conversion';
import { exchangeRateService } from '@/services/exchange-rates/exchange-rate-service';

export { ExchangeRateError } from '@/services/exchange-rates/exchange-rate-service';
export type { DisplayAmount, RateContext, RateQuote };

export interface ConvertedAmount {
  amountMinor: number;
  currency: string;
  quote: RateQuote;
}

export const currencyService = {
  /** Rate for from→to; `date` (YYYY-MM-DD) for that day's rate, else latest. Throws ExchangeRateError. */
  getExchangeRate(fromCurrency: string, toCurrency: string, date?: string): Promise<RateQuote> {
    return exchangeRateService.getRate(fromCurrency, toCurrency, date);
  },

  /** Converts integer minor units. Same currency returns the input without a network call. */
  async convertAmount(
    amountMinor: number,
    fromCurrency: string,
    toCurrency: string,
    date?: string
  ): Promise<ConvertedAmount> {
    const quote = await exchangeRateService.getRate(fromCurrency, toCurrency, date);
    return {
      amountMinor: convertMinor(amountMinor, quote.from, quote.to, quote.rate),
      currency: quote.to,
      quote,
    };
  },

  formatMoney(amountMinor: number, currencyCode: string, locale?: string): string {
    return formatMinor(amountMinor, currencyCode, locale);
  },

  getSupportedCurrencies(): Promise<Record<string, string>> {
    return exchangeRateService.getAvailableCurrencies();
  },

  /** Pure: uses rates already loaded into `rates`. Never relabels an unconverted amount. */
  getDisplayAmount(
    originalAmountMinor: number,
    originalCurrency: string,
    displayCurrency: string,
    rates: RateContext,
    date?: string
  ): DisplayAmount {
    return resolveDisplayAmount(originalAmountMinor, originalCurrency, displayCurrency, rates, date);
  },
};

export default currencyService;
