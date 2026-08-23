-- =============================================================================
-- NovaMart — 0025 Trigger execution context
--
-- Trigger functions run as the invoking role by default. With RLS enabled, a
-- customer voting on someone else's review would fail when the trigger tries to
-- update that review's counters, and a review insert would fail when the trigger
-- maintains product_rating_summary (a table with no client write policy).
--
-- The fix is not to loosen the policies: it is to run these projection- and
-- history-maintaining functions as SECURITY DEFINER. Each already pins its
-- search_path, and each performs a narrow, well-defined write derived from data the
-- caller was already permitted to change.
-- =============================================================================

-- Derived projections whose target tables have no client write policy.
alter function commerce.refresh_product_rating_summary()  security definer;
alter function commerce.refresh_review_votes()            security definer;
alter function commerce.refresh_review_report_count()     security definer;
alter function commerce.refresh_question_answer_count()   security definer;
alter function commerce.refresh_qa_votes()                security definer;
alter function commerce.refresh_seller_rating()           security definer;
alter function commerce.refresh_order_fulfillment_summary() security definer;
alter function commerce.refresh_cart_totals()             security definer;
alter function commerce.refresh_wishlist_count()          security definer;
alter function commerce.trim_recently_viewed()            security definer;

-- Append-only history writers. These tables intentionally have no client INSERT
-- policy: history must be written by the database, not by the caller.
alter function commerce.record_order_item_status()        security definer;
alter function commerce.record_order_status()             security definer;
alter function catalog.record_listing_status_change()     security definer;
alter function seller.record_status_change()              security definer;
alter function returns.record_return_status()             security definer;
alter function support.record_ticket_status()             security definer;
alter function support.on_support_message()               security definer;
alter function pricing.record_price_change()              security definer;

-- Scope registry maintenance: writes identity.resource_scopes, which no client may
-- touch directly.
alter function inventory.register_warehouse_scope()       security definer;
alter function seller.register_seller_scope()             security definer;

-- Address default enforcement updates sibling rows of the same user.
alter function identity.enforce_single_default_address()  security definer;

-- Category tree maintenance writes closure rows and sibling categories.
alter function catalog.sync_category_closure()            security definer;
alter function catalog.rebuild_subtree_paths(uuid)        security definer;

-- SECURITY DEFINER functions must not be executable by clients directly; they are
-- only ever reached through the triggers that own them.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'commerce.refresh_product_rating_summary()',
    'commerce.refresh_review_votes()',
    'commerce.refresh_review_report_count()',
    'commerce.refresh_question_answer_count()',
    'commerce.refresh_qa_votes()',
    'commerce.refresh_seller_rating()',
    'commerce.refresh_order_fulfillment_summary()',
    'commerce.refresh_cart_totals()',
    'commerce.refresh_wishlist_count()',
    'commerce.trim_recently_viewed()',
    'commerce.record_order_item_status()',
    'commerce.record_order_status()',
    'catalog.record_listing_status_change()',
    'seller.record_status_change()',
    'returns.record_return_status()',
    'support.record_ticket_status()',
    'support.on_support_message()',
    'pricing.record_price_change()',
    'inventory.register_warehouse_scope()',
    'seller.register_seller_scope()',
    'identity.enforce_single_default_address()',
    'catalog.sync_category_closure()',
    'catalog.rebuild_subtree_paths(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;
