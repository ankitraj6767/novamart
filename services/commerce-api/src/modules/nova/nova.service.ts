import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { novaQuerySchema } from '@novamart/validation';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AppError } from '../../common/errors/app-error';

type NovaInput = z.infer<typeof novaQuerySchema>;

/**
 * Grounded Nova foundation. It intentionally answers from the catalog read model only;
 * introducing an LLM later can sit behind this boundary without allowing hallucinated
 * products, prices or stock into a customer response.
 */
@Injectable()
export class NovaService {
  constructor(private readonly db: DatabaseService) {}

  async ask(input: NovaInput): Promise<Record<string, unknown>> {
    const budget = this.extractBudget(input.message);
    const terms = input.message.replace(/under\s+₹?\s*[\d,]+/i, '').trim().split(/\s+/).filter((term) => term.length > 2).slice(0, 5);
    const query = terms.length ? `%${terms.join('%')}%` : '%';
    const rows = await this.db.sql<Array<Record<string, unknown>>>`
      select product_id, slug, title, brand_name, category_path, primary_image_url,
             selling_price_paise::text, mrp_paise::text, discount_percentage,
             average_rating, rating_count, available_quantity, seller_name
        from catalog.v_product_cards
       where listing_id is not null and available_quantity > 0
         and title ilike ${query}
         ${budget === null ? this.db.sql`` : this.db.sql`and selling_price_paise <= ${budget}`}
       order by rating_ranking_score desc, popularity_score desc, product_id
       limit 8
    `;
    return {
      assistant: 'Nova',
      grounded: true,
      answer: rows.length ? `I found ${rows.length} available NovaMart option${rows.length === 1 ? '' : 's'} matching your request.` : 'I could not find an available match in NovaMart yet. Try a broader request or a higher budget.',
      appliedBudgetPaise: budget,
      serviceability: input.pincode ? await this.serviceability(input.pincode) : null,
      products: rows,
      sources: rows.map((row) => ({ productId: row['product_id'], pricePaise: row['selling_price_paise'], availableQuantity: row['available_quantity'] })),
    };
  }

  async compare(productIds: string[]): Promise<Record<string, unknown>> {
    if (productIds.length < 2 || productIds.length > 4) throw AppError.validation([{ field: 'productIds', issue: 'Compare between two and four products' }]);
    const rows = await this.db.sql<Array<Record<string, unknown>>>`
      select c.product_id, c.slug, c.title, c.brand_name, p.description,
             c.average_rating, c.rating_count, c.selling_price_paise::text,
             c.mrp_paise::text, c.available_quantity
        from catalog.v_product_cards c join catalog.products p on p.id = c.product_id
       where c.product_id = any(${productIds}::uuid[]) and c.listing_id is not null
    `;
    return { assistant: 'Nova', grounded: true, products: rows, comparedCount: rows.length };
  }

  private async serviceability(pincode: string): Promise<Record<string, unknown> | null> {
    const [row] = await this.db.sql<Array<Record<string, unknown>>>`select pincode, city, state, is_serviceable, prepaid_available, cod_available, default_sla_days from api.pincode_serviceability where pincode = ${pincode}`;
    return row ?? null;
  }

  private extractBudget(message: string): number | null {
    const match = message.match(/(?:under|below|within|less than)\s+₹?\s*([\d,]+)/i);
    if (!match?.[1]) return null;
    const rupees = Number(match[1].replace(/,/g, ''));
    return Number.isFinite(rupees) ? rupees * 100 : null;
  }
}
