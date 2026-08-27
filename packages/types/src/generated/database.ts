export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  analytics: {
    Tables: {
      daily_metrics: {
        Row: {
          active_sellers: number
          average_delivery_days: number | null
          average_order_value_paise: number
          cancellation_rate: number | null
          cart_abandonment_rate: number | null
          carts_created: number
          checkouts_started: number
          cod_share: number | null
          commission_paise: number
          computed_at: string
          conversion_rate: number | null
          daily_active_users: number
          gmv_paise: number
          metric_date: string
          new_sellers: number
          new_users: number
          nmv_paise: number
          on_time_delivery_rate: number | null
          orders_placed: number
          payment_success_rate: number | null
          product_views: number
          refund_rate: number | null
          repeat_purchase_rate: number | null
          return_rate: number | null
          rto_rate: number | null
          search_no_results: number
          searches: number
          sessions: number
        }
        Insert: {
          active_sellers?: number
          average_delivery_days?: number | null
          average_order_value_paise?: number
          cancellation_rate?: number | null
          cart_abandonment_rate?: number | null
          carts_created?: number
          checkouts_started?: number
          cod_share?: number | null
          commission_paise?: number
          computed_at?: string
          conversion_rate?: number | null
          daily_active_users?: number
          gmv_paise?: number
          metric_date: string
          new_sellers?: number
          new_users?: number
          nmv_paise?: number
          on_time_delivery_rate?: number | null
          orders_placed?: number
          payment_success_rate?: number | null
          product_views?: number
          refund_rate?: number | null
          repeat_purchase_rate?: number | null
          return_rate?: number | null
          rto_rate?: number | null
          search_no_results?: number
          searches?: number
          sessions?: number
        }
        Update: {
          active_sellers?: number
          average_delivery_days?: number | null
          average_order_value_paise?: number
          cancellation_rate?: number | null
          cart_abandonment_rate?: number | null
          carts_created?: number
          checkouts_started?: number
          cod_share?: number | null
          commission_paise?: number
          computed_at?: string
          conversion_rate?: number | null
          daily_active_users?: number
          gmv_paise?: number
          metric_date?: string
          new_sellers?: number
          new_users?: number
          nmv_paise?: number
          on_time_delivery_rate?: number | null
          orders_placed?: number
          payment_success_rate?: number | null
          product_views?: number
          refund_rate?: number | null
          repeat_purchase_rate?: number | null
          return_rate?: number | null
          rto_rate?: number | null
          search_no_results?: number
          searches?: number
          sessions?: number
        }
        Relationships: []
      }
      events: {
        Row: {
          anonymous_id: string | null
          app_version: string | null
          category_id: string | null
          city: string | null
          event_type: string
          id: string
          is_sponsored: boolean
          listing_id: string | null
          occurred_at: string
          order_id: string | null
          pincode: string | null
          platform: string | null
          position: number | null
          product_id: string | null
          properties: Json
          quantity: number | null
          request_id: string | null
          search_query: string | null
          seller_id: string | null
          session_id: string | null
          sku_id: string | null
          state_code: string | null
          surface: string | null
          trace_id: string | null
          user_id: string | null
          value_paise: number | null
        }
        Insert: {
          anonymous_id?: string | null
          app_version?: string | null
          category_id?: string | null
          city?: string | null
          event_type: string
          id?: string
          is_sponsored?: boolean
          listing_id?: string | null
          occurred_at?: string
          order_id?: string | null
          pincode?: string | null
          platform?: string | null
          position?: number | null
          product_id?: string | null
          properties?: Json
          quantity?: number | null
          request_id?: string | null
          search_query?: string | null
          seller_id?: string | null
          session_id?: string | null
          sku_id?: string | null
          state_code?: string | null
          surface?: string | null
          trace_id?: string | null
          user_id?: string | null
          value_paise?: number | null
        }
        Update: {
          anonymous_id?: string | null
          app_version?: string | null
          category_id?: string | null
          city?: string | null
          event_type?: string
          id?: string
          is_sponsored?: boolean
          listing_id?: string | null
          occurred_at?: string
          order_id?: string | null
          pincode?: string | null
          platform?: string | null
          position?: number | null
          product_id?: string | null
          properties?: Json
          quantity?: number | null
          request_id?: string | null
          search_query?: string | null
          seller_id?: string | null
          session_id?: string | null
          sku_id?: string | null
          state_code?: string | null
          surface?: string | null
          trace_id?: string | null
          user_id?: string | null
          value_paise?: number | null
        }
        Relationships: []
      }
      events_2026_08: {
        Row: {
          anonymous_id: string | null
          app_version: string | null
          category_id: string | null
          city: string | null
          event_type: string
          id: string
          is_sponsored: boolean
          listing_id: string | null
          occurred_at: string
          order_id: string | null
          pincode: string | null
          platform: string | null
          position: number | null
          product_id: string | null
          properties: Json
          quantity: number | null
          request_id: string | null
          search_query: string | null
          seller_id: string | null
          session_id: string | null
          sku_id: string | null
          state_code: string | null
          surface: string | null
          trace_id: string | null
          user_id: string | null
          value_paise: number | null
        }
        Insert: {
          anonymous_id?: string | null
          app_version?: string | null
          category_id?: string | null
          city?: string | null
          event_type: string
          id?: string
          is_sponsored?: boolean
          listing_id?: string | null
          occurred_at?: string
          order_id?: string | null
          pincode?: string | null
          platform?: string | null
          position?: number | null
          product_id?: string | null
          properties?: Json
          quantity?: number | null
          request_id?: string | null
          search_query?: string | null
          seller_id?: string | null
          session_id?: string | null
          sku_id?: string | null
          state_code?: string | null
          surface?: string | null
          trace_id?: string | null
          user_id?: string | null
          value_paise?: number | null
        }
        Update: {
          anonymous_id?: string | null
          app_version?: string | null
          category_id?: string | null
          city?: string | null
          event_type?: string
          id?: string
          is_sponsored?: boolean
          listing_id?: string | null
          occurred_at?: string
          order_id?: string | null
          pincode?: string | null
          platform?: string | null
          position?: number | null
          product_id?: string | null
          properties?: Json
          quantity?: number | null
          request_id?: string | null
          search_query?: string | null
          seller_id?: string | null
          session_id?: string | null
          sku_id?: string | null
          state_code?: string | null
          surface?: string | null
          trace_id?: string | null
          user_id?: string | null
          value_paise?: number | null
        }
        Relationships: []
      }
      events_2026_09: {
        Row: {
          anonymous_id: string | null
          app_version: string | null
          category_id: string | null
          city: string | null
          event_type: string
          id: string
          is_sponsored: boolean
          listing_id: string | null
          occurred_at: string
          order_id: string | null
          pincode: string | null
          platform: string | null
          position: number | null
          product_id: string | null
          properties: Json
          quantity: number | null
          request_id: string | null
          search_query: string | null
          seller_id: string | null
          session_id: string | null
          sku_id: string | null
          state_code: string | null
          surface: string | null
          trace_id: string | null
          user_id: string | null
          value_paise: number | null
        }
        Insert: {
          anonymous_id?: string | null
          app_version?: string | null
          category_id?: string | null
          city?: string | null
          event_type: string
          id?: string
          is_sponsored?: boolean
          listing_id?: string | null
          occurred_at?: string
          order_id?: string | null
          pincode?: string | null
          platform?: string | null
          position?: number | null
          product_id?: string | null
          properties?: Json
          quantity?: number | null
          request_id?: string | null
          search_query?: string | null
          seller_id?: string | null
          session_id?: string | null
          sku_id?: string | null
          state_code?: string | null
          surface?: string | null
          trace_id?: string | null
          user_id?: string | null
          value_paise?: number | null
        }
        Update: {
          anonymous_id?: string | null
          app_version?: string | null
          category_id?: string | null
          city?: string | null
          event_type?: string
          id?: string
          is_sponsored?: boolean
          listing_id?: string | null
          occurred_at?: string
          order_id?: string | null
          pincode?: string | null
          platform?: string | null
          position?: number | null
          product_id?: string | null
          properties?: Json
          quantity?: number | null
          request_id?: string | null
          search_query?: string | null
          seller_id?: string | null
          session_id?: string | null
          sku_id?: string | null
          state_code?: string | null
          surface?: string | null
          trace_id?: string | null
          user_id?: string | null
          value_paise?: number | null
        }
        Relationships: []
      }
      events_2026_10: {
        Row: {
          anonymous_id: string | null
          app_version: string | null
          category_id: string | null
          city: string | null
          event_type: string
          id: string
          is_sponsored: boolean
          listing_id: string | null
          occurred_at: string
          order_id: string | null
          pincode: string | null
          platform: string | null
          position: number | null
          product_id: string | null
          properties: Json
          quantity: number | null
          request_id: string | null
          search_query: string | null
          seller_id: string | null
          session_id: string | null
          sku_id: string | null
          state_code: string | null
          surface: string | null
          trace_id: string | null
          user_id: string | null
          value_paise: number | null
        }
        Insert: {
          anonymous_id?: string | null
          app_version?: string | null
          category_id?: string | null
          city?: string | null
          event_type: string
          id?: string
          is_sponsored?: boolean
          listing_id?: string | null
          occurred_at?: string
          order_id?: string | null
          pincode?: string | null
          platform?: string | null
          position?: number | null
          product_id?: string | null
          properties?: Json
          quantity?: number | null
          request_id?: string | null
          search_query?: string | null
          seller_id?: string | null
          session_id?: string | null
          sku_id?: string | null
          state_code?: string | null
          surface?: string | null
          trace_id?: string | null
          user_id?: string | null
          value_paise?: number | null
        }
        Update: {
          anonymous_id?: string | null
          app_version?: string | null
          category_id?: string | null
          city?: string | null
          event_type?: string
          id?: string
          is_sponsored?: boolean
          listing_id?: string | null
          occurred_at?: string
          order_id?: string | null
          pincode?: string | null
          platform?: string | null
          position?: number | null
          product_id?: string | null
          properties?: Json
          quantity?: number | null
          request_id?: string | null
          search_query?: string | null
          seller_id?: string | null
          session_id?: string | null
          sku_id?: string | null
          state_code?: string | null
          surface?: string | null
          trace_id?: string | null
          user_id?: string | null
          value_paise?: number | null
        }
        Relationships: []
      }
      events_2026_11: {
        Row: {
          anonymous_id: string | null
          app_version: string | null
          category_id: string | null
          city: string | null
          event_type: string
          id: string
          is_sponsored: boolean
          listing_id: string | null
          occurred_at: string
          order_id: string | null
          pincode: string | null
          platform: string | null
          position: number | null
          product_id: string | null
          properties: Json
          quantity: number | null
          request_id: string | null
          search_query: string | null
          seller_id: string | null
          session_id: string | null
          sku_id: string | null
          state_code: string | null
          surface: string | null
          trace_id: string | null
          user_id: string | null
          value_paise: number | null
        }
        Insert: {
          anonymous_id?: string | null
          app_version?: string | null
          category_id?: string | null
          city?: string | null
          event_type: string
          id?: string
          is_sponsored?: boolean
          listing_id?: string | null
          occurred_at?: string
          order_id?: string | null
          pincode?: string | null
          platform?: string | null
          position?: number | null
          product_id?: string | null
          properties?: Json
          quantity?: number | null
          request_id?: string | null
          search_query?: string | null
          seller_id?: string | null
          session_id?: string | null
          sku_id?: string | null
          state_code?: string | null
          surface?: string | null
          trace_id?: string | null
          user_id?: string | null
          value_paise?: number | null
        }
        Update: {
          anonymous_id?: string | null
          app_version?: string | null
          category_id?: string | null
          city?: string | null
          event_type?: string
          id?: string
          is_sponsored?: boolean
          listing_id?: string | null
          occurred_at?: string
          order_id?: string | null
          pincode?: string | null
          platform?: string | null
          position?: number | null
          product_id?: string | null
          properties?: Json
          quantity?: number | null
          request_id?: string | null
          search_query?: string | null
          seller_id?: string | null
          session_id?: string | null
          sku_id?: string | null
          state_code?: string | null
          surface?: string | null
          trace_id?: string | null
          user_id?: string | null
          value_paise?: number | null
        }
        Relationships: []
      }
      events_2026_12: {
        Row: {
          anonymous_id: string | null
          app_version: string | null
          category_id: string | null
          city: string | null
          event_type: string
          id: string
          is_sponsored: boolean
          listing_id: string | null
          occurred_at: string
          order_id: string | null
          pincode: string | null
          platform: string | null
          position: number | null
          product_id: string | null
          properties: Json
          quantity: number | null
          request_id: string | null
          search_query: string | null
          seller_id: string | null
          session_id: string | null
          sku_id: string | null
          state_code: string | null
          surface: string | null
          trace_id: string | null
          user_id: string | null
          value_paise: number | null
        }
        Insert: {
          anonymous_id?: string | null
          app_version?: string | null
          category_id?: string | null
          city?: string | null
          event_type: string
          id?: string
          is_sponsored?: boolean
          listing_id?: string | null
          occurred_at?: string
          order_id?: string | null
          pincode?: string | null
          platform?: string | null
          position?: number | null
          product_id?: string | null
          properties?: Json
          quantity?: number | null
          request_id?: string | null
          search_query?: string | null
          seller_id?: string | null
          session_id?: string | null
          sku_id?: string | null
          state_code?: string | null
          surface?: string | null
          trace_id?: string | null
          user_id?: string | null
          value_paise?: number | null
        }
        Update: {
          anonymous_id?: string | null
          app_version?: string | null
          category_id?: string | null
          city?: string | null
          event_type?: string
          id?: string
          is_sponsored?: boolean
          listing_id?: string | null
          occurred_at?: string
          order_id?: string | null
          pincode?: string | null
          platform?: string | null
          position?: number | null
          product_id?: string | null
          properties?: Json
          quantity?: number | null
          request_id?: string | null
          search_query?: string | null
          seller_id?: string | null
          session_id?: string | null
          sku_id?: string | null
          state_code?: string | null
          surface?: string | null
          trace_id?: string | null
          user_id?: string | null
          value_paise?: number | null
        }
        Relationships: []
      }
      events_2027_01: {
        Row: {
          anonymous_id: string | null
          app_version: string | null
          category_id: string | null
          city: string | null
          event_type: string
          id: string
          is_sponsored: boolean
          listing_id: string | null
          occurred_at: string
          order_id: string | null
          pincode: string | null
          platform: string | null
          position: number | null
          product_id: string | null
          properties: Json
          quantity: number | null
          request_id: string | null
          search_query: string | null
          seller_id: string | null
          session_id: string | null
          sku_id: string | null
          state_code: string | null
          surface: string | null
          trace_id: string | null
          user_id: string | null
          value_paise: number | null
        }
        Insert: {
          anonymous_id?: string | null
          app_version?: string | null
          category_id?: string | null
          city?: string | null
          event_type: string
          id?: string
          is_sponsored?: boolean
          listing_id?: string | null
          occurred_at?: string
          order_id?: string | null
          pincode?: string | null
          platform?: string | null
          position?: number | null
          product_id?: string | null
          properties?: Json
          quantity?: number | null
          request_id?: string | null
          search_query?: string | null
          seller_id?: string | null
          session_id?: string | null
          sku_id?: string | null
          state_code?: string | null
          surface?: string | null
          trace_id?: string | null
          user_id?: string | null
          value_paise?: number | null
        }
        Update: {
          anonymous_id?: string | null
          app_version?: string | null
          category_id?: string | null
          city?: string | null
          event_type?: string
          id?: string
          is_sponsored?: boolean
          listing_id?: string | null
          occurred_at?: string
          order_id?: string | null
          pincode?: string | null
          platform?: string | null
          position?: number | null
          product_id?: string | null
          properties?: Json
          quantity?: number | null
          request_id?: string | null
          search_query?: string | null
          seller_id?: string | null
          session_id?: string | null
          sku_id?: string | null
          state_code?: string | null
          surface?: string | null
          trace_id?: string | null
          user_id?: string | null
          value_paise?: number | null
        }
        Relationships: []
      }
      events_default: {
        Row: {
          anonymous_id: string | null
          app_version: string | null
          category_id: string | null
          city: string | null
          event_type: string
          id: string
          is_sponsored: boolean
          listing_id: string | null
          occurred_at: string
          order_id: string | null
          pincode: string | null
          platform: string | null
          position: number | null
          product_id: string | null
          properties: Json
          quantity: number | null
          request_id: string | null
          search_query: string | null
          seller_id: string | null
          session_id: string | null
          sku_id: string | null
          state_code: string | null
          surface: string | null
          trace_id: string | null
          user_id: string | null
          value_paise: number | null
        }
        Insert: {
          anonymous_id?: string | null
          app_version?: string | null
          category_id?: string | null
          city?: string | null
          event_type: string
          id?: string
          is_sponsored?: boolean
          listing_id?: string | null
          occurred_at?: string
          order_id?: string | null
          pincode?: string | null
          platform?: string | null
          position?: number | null
          product_id?: string | null
          properties?: Json
          quantity?: number | null
          request_id?: string | null
          search_query?: string | null
          seller_id?: string | null
          session_id?: string | null
          sku_id?: string | null
          state_code?: string | null
          surface?: string | null
          trace_id?: string | null
          user_id?: string | null
          value_paise?: number | null
        }
        Update: {
          anonymous_id?: string | null
          app_version?: string | null
          category_id?: string | null
          city?: string | null
          event_type?: string
          id?: string
          is_sponsored?: boolean
          listing_id?: string | null
          occurred_at?: string
          order_id?: string | null
          pincode?: string | null
          platform?: string | null
          position?: number | null
          product_id?: string | null
          properties?: Json
          quantity?: number | null
          request_id?: string | null
          search_query?: string | null
          seller_id?: string | null
          session_id?: string | null
          sku_id?: string | null
          state_code?: string | null
          surface?: string | null
          trace_id?: string | null
          user_id?: string | null
          value_paise?: number | null
        }
        Relationships: []
      }
      fraud_cases: {
        Row: {
          actions_taken: Json
          assigned_to: string | null
          case_reference: string
          category: string
          estimated_loss_paise: number | null
          id: string
          investigation_notes: string | null
          opened_at: string
          opened_by: string | null
          outcome: string | null
          outcome_reason: string | null
          priority: string
          resolved_at: string | null
          resolved_by: string | null
          seller_id: string | null
          status: string
          subject_id: string | null
          subject_key: string | null
          subject_type: string
          summary: string
          total_score: number | null
          triggering_event_ids: string[]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          actions_taken?: Json
          assigned_to?: string | null
          case_reference: string
          category: string
          estimated_loss_paise?: number | null
          id?: string
          investigation_notes?: string | null
          opened_at?: string
          opened_by?: string | null
          outcome?: string | null
          outcome_reason?: string | null
          priority?: string
          resolved_at?: string | null
          resolved_by?: string | null
          seller_id?: string | null
          status?: string
          subject_id?: string | null
          subject_key?: string | null
          subject_type: string
          summary: string
          total_score?: number | null
          triggering_event_ids?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          actions_taken?: Json
          assigned_to?: string | null
          case_reference?: string
          category?: string
          estimated_loss_paise?: number | null
          id?: string
          investigation_notes?: string | null
          opened_at?: string
          opened_by?: string | null
          outcome?: string | null
          outcome_reason?: string | null
          priority?: string
          resolved_at?: string | null
          resolved_by?: string | null
          seller_id?: string | null
          status?: string
          subject_id?: string | null
          subject_key?: string | null
          subject_type?: string
          summary?: string
          total_score?: number | null
          triggering_event_ids?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      fraud_rules: {
        Row: {
          action: string
          category: string
          code: string
          conditions: Json
          created_at: string
          created_by: string | null
          description: string
          false_positive_count: number
          id: string
          is_active: boolean
          is_shadow_mode: boolean
          name: string
          score_weight: number
          severity: string
          subject_type: string
          trigger_count_24h: number
          updated_at: string
        }
        Insert: {
          action?: string
          category: string
          code: string
          conditions: Json
          created_at?: string
          created_by?: string | null
          description: string
          false_positive_count?: number
          id?: string
          is_active?: boolean
          is_shadow_mode?: boolean
          name: string
          score_weight: number
          severity?: string
          subject_type: string
          trigger_count_24h?: number
          updated_at?: string
        }
        Update: {
          action?: string
          category?: string
          code?: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string
          false_positive_count?: number
          id?: string
          is_active?: boolean
          is_shadow_mode?: boolean
          name?: string
          score_weight?: number
          severity?: string
          subject_type?: string
          trigger_count_24h?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_affinities: {
        Row: {
          affinity_type: string
          co_occurrence_count: number
          computed_at: string
          product_id: string
          related_product_id: string
          score: number
        }
        Insert: {
          affinity_type: string
          co_occurrence_count?: number
          computed_at?: string
          product_id: string
          related_product_id: string
          score?: number
        }
        Update: {
          affinity_type?: string
          co_occurrence_count?: number
          computed_at?: string
          product_id?: string
          related_product_id?: string
          score?: number
        }
        Relationships: []
      }
      product_metrics: {
        Row: {
          add_to_carts: number
          average_rating: number | null
          cancellations: number
          cart_to_order_rate: number | null
          computed_at: string
          gmv_paise: number
          impressions: number
          metric_date: string
          product_id: string
          purchases: number
          returns: number
          units_sold: number
          view_to_cart_rate: number | null
          views: number
        }
        Insert: {
          add_to_carts?: number
          average_rating?: number | null
          cancellations?: number
          cart_to_order_rate?: number | null
          computed_at?: string
          gmv_paise?: number
          impressions?: number
          metric_date: string
          product_id: string
          purchases?: number
          returns?: number
          units_sold?: number
          view_to_cart_rate?: number | null
          views?: number
        }
        Update: {
          add_to_carts?: number
          average_rating?: number | null
          cancellations?: number
          cart_to_order_rate?: number | null
          computed_at?: string
          gmv_paise?: number
          impressions?: number
          metric_date?: string
          product_id?: string
          purchases?: number
          returns?: number
          units_sold?: number
          view_to_cart_rate?: number | null
          views?: number
        }
        Relationships: []
      }
      risk_events: {
        Row: {
          action_taken: string
          category: string
          device_id: string | null
          evidence: Json
          id: string
          ip_address: unknown
          occurred_at: string
          order_id: string | null
          request_id: string | null
          rule_code: string
          rule_id: string | null
          score_contribution: number
          seller_id: string | null
          severity: string
          subject_id: string | null
          subject_key: string | null
          subject_type: string
          trace_id: string | null
          user_id: string | null
          was_shadow_mode: boolean
        }
        Insert: {
          action_taken?: string
          category: string
          device_id?: string | null
          evidence?: Json
          id?: string
          ip_address?: unknown
          occurred_at?: string
          order_id?: string | null
          request_id?: string | null
          rule_code: string
          rule_id?: string | null
          score_contribution?: number
          seller_id?: string | null
          severity: string
          subject_id?: string | null
          subject_key?: string | null
          subject_type: string
          trace_id?: string | null
          user_id?: string | null
          was_shadow_mode?: boolean
        }
        Update: {
          action_taken?: string
          category?: string
          device_id?: string | null
          evidence?: Json
          id?: string
          ip_address?: unknown
          occurred_at?: string
          order_id?: string | null
          request_id?: string | null
          rule_code?: string
          rule_id?: string | null
          score_contribution?: number
          seller_id?: string | null
          severity?: string
          subject_id?: string | null
          subject_key?: string | null
          subject_type?: string
          trace_id?: string | null
          user_id?: string | null
          was_shadow_mode?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "risk_events_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "fraud_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_scores: {
        Row: {
          cancellation_count_90d: number
          cod_orders_count: number
          cod_rto_count: number
          computed_at: string
          coupon_redemptions_90d: number
          distinct_addresses_90d: number
          distinct_devices_30d: number
          failed_payment_count_7d: number
          last_event_at: string | null
          refund_count_90d: number
          restrictions: string[]
          return_count_90d: number
          score: number
          subject_id: string | null
          subject_key: string
          subject_type: string
          tier: string
          updated_at: string
        }
        Insert: {
          cancellation_count_90d?: number
          cod_orders_count?: number
          cod_rto_count?: number
          computed_at?: string
          coupon_redemptions_90d?: number
          distinct_addresses_90d?: number
          distinct_devices_30d?: number
          failed_payment_count_7d?: number
          last_event_at?: string | null
          refund_count_90d?: number
          restrictions?: string[]
          return_count_90d?: number
          score?: number
          subject_id?: string | null
          subject_key: string
          subject_type: string
          tier?: string
          updated_at?: string
        }
        Update: {
          cancellation_count_90d?: number
          cod_orders_count?: number
          cod_rto_count?: number
          computed_at?: string
          coupon_redemptions_90d?: number
          distinct_addresses_90d?: number
          distinct_devices_30d?: number
          failed_payment_count_7d?: number
          last_event_at?: string | null
          refund_count_90d?: number
          restrictions?: string[]
          return_count_90d?: number
          score?: number
          subject_id?: string | null
          subject_key?: string
          subject_type?: string
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      search_queries: {
        Row: {
          click_count: number
          click_through_rate: number | null
          computed_at: string
          conversion_rate: number | null
          id: string
          metric_date: string
          normalised_query: string
          order_count: number
          search_count: number
          zero_result_count: number
        }
        Insert: {
          click_count?: number
          click_through_rate?: number | null
          computed_at?: string
          conversion_rate?: number | null
          id?: string
          metric_date: string
          normalised_query: string
          order_count?: number
          search_count?: number
          zero_result_count?: number
        }
        Update: {
          click_count?: number
          click_through_rate?: number | null
          computed_at?: string
          conversion_rate?: number | null
          id?: string
          metric_date?: string
          normalised_query?: string
          order_count?: number
          search_count?: number
          zero_result_count?: number
        }
        Relationships: []
      }
      seller_metrics: {
        Row: {
          average_dispatch_hours: number | null
          cancellations: number
          commission_paise: number
          computed_at: string
          gmv_paise: number
          metric_date: string
          on_time_dispatch_rate: number | null
          orders: number
          returns: number
          rto: number
          seller_id: string
          units: number
        }
        Insert: {
          average_dispatch_hours?: number | null
          cancellations?: number
          commission_paise?: number
          computed_at?: string
          gmv_paise?: number
          metric_date: string
          on_time_dispatch_rate?: number | null
          orders?: number
          returns?: number
          rto?: number
          seller_id: string
          units?: number
        }
        Update: {
          average_dispatch_hours?: number | null
          cancellations?: number
          commission_paise?: number
          computed_at?: string
          gmv_paise?: number
          metric_date?: string
          on_time_dispatch_rate?: number | null
          orders?: number
          returns?: number
          rto?: number
          seller_id?: string
          units?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_event_partition: { Args: { p_month?: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  audit: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_roles: string[]
          actor_type: string
          context: Json
          device_id: string | null
          id: string
          ip_address: unknown
          new_value: Json | null
          occurred_at: string
          old_value: Json | null
          outcome: string
          reason: string | null
          request_id: string | null
          resource_id: string | null
          resource_ref: string | null
          resource_type: string
          severity: string
          trace_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_roles?: string[]
          actor_type?: string
          context?: Json
          device_id?: string | null
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          occurred_at?: string
          old_value?: Json | null
          outcome?: string
          reason?: string | null
          request_id?: string | null
          resource_id?: string | null
          resource_ref?: string | null
          resource_type: string
          severity?: string
          trace_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_roles?: string[]
          actor_type?: string
          context?: Json
          device_id?: string | null
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          occurred_at?: string
          old_value?: Json | null
          outcome?: string
          reason?: string | null
          request_id?: string | null
          resource_id?: string | null
          resource_ref?: string | null
          resource_type?: string
          severity?: string
          trace_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      data_access_logs: {
        Row: {
          access_type: string
          actor_id: string
          actor_roles: string[]
          data_category: string
          id: string
          ip_address: unknown
          justification: string | null
          occurred_at: string
          record_count: number
          request_id: string | null
          subject_id: string | null
          subject_type: string
          ticket_id: string | null
          trace_id: string | null
        }
        Insert: {
          access_type: string
          actor_id: string
          actor_roles?: string[]
          data_category: string
          id?: string
          ip_address?: unknown
          justification?: string | null
          occurred_at?: string
          record_count?: number
          request_id?: string | null
          subject_id?: string | null
          subject_type: string
          ticket_id?: string | null
          trace_id?: string | null
        }
        Update: {
          access_type?: string
          actor_id?: string
          actor_roles?: string[]
          data_category?: string
          id?: string
          ip_address?: unknown
          justification?: string | null
          occurred_at?: string
          record_count?: number
          request_id?: string | null
          subject_id?: string | null
          subject_type?: string
          ticket_id?: string | null
          trace_id?: string | null
        }
        Relationships: []
      }
      security_events: {
        Row: {
          app: string | null
          app_version: string | null
          details: Json
          device_id: string | null
          event_type: string
          geo_city: string | null
          geo_state: string | null
          id: string
          identifier_hash: string | null
          ip_address: unknown
          occurred_at: string
          request_id: string | null
          severity: string
          trace_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          app?: string | null
          app_version?: string | null
          details?: Json
          device_id?: string | null
          event_type: string
          geo_city?: string | null
          geo_state?: string | null
          id?: string
          identifier_hash?: string | null
          ip_address?: unknown
          occurred_at?: string
          request_id?: string | null
          severity?: string
          trace_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          app?: string | null
          app_version?: string | null
          details?: Json
          device_id?: string | null
          event_type?: string
          geo_city?: string | null
          geo_state?: string | null
          id?: string
          identifier_hash?: string | null
          ip_address?: unknown
          occurred_at?: string
          request_id?: string | null
          severity?: string
          trace_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      record: {
        Args: {
          p_action: string
          p_actor_type?: string
          p_context?: Json
          p_new_value?: Json
          p_old_value?: Json
          p_reason?: string
          p_resource_id?: string
          p_resource_type: string
          p_severity?: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  catalog: {
    Tables: {
      attribute_definitions: {
        Row: {
          code: string
          created_at: string
          data_type: string
          description: string | null
          display_group: string | null
          display_order: number
          id: string
          input_type: string
          is_active: boolean
          is_comparable: boolean
          is_filterable: boolean
          is_searchable: boolean
          is_variant_defining: boolean
          name: string
          name_hi: string | null
          unit: string | null
          updated_at: string
          validation: Json
        }
        Insert: {
          code: string
          created_at?: string
          data_type: string
          description?: string | null
          display_group?: string | null
          display_order?: number
          id?: string
          input_type?: string
          is_active?: boolean
          is_comparable?: boolean
          is_filterable?: boolean
          is_searchable?: boolean
          is_variant_defining?: boolean
          name: string
          name_hi?: string | null
          unit?: string | null
          updated_at?: string
          validation?: Json
        }
        Update: {
          code?: string
          created_at?: string
          data_type?: string
          description?: string | null
          display_group?: string | null
          display_order?: number
          id?: string
          input_type?: string
          is_active?: boolean
          is_comparable?: boolean
          is_filterable?: boolean
          is_searchable?: boolean
          is_variant_defining?: boolean
          name?: string
          name_hi?: string | null
          unit?: string | null
          updated_at?: string
          validation?: Json
        }
        Relationships: []
      }
      attribute_options: {
        Row: {
          attribute_id: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          label: string
          label_hi: string | null
          numeric_value: number | null
          swatch_hex: string | null
          swatch_image_url: string | null
          value: string
        }
        Insert: {
          attribute_id: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label: string
          label_hi?: string | null
          numeric_value?: number | null
          swatch_hex?: string | null
          swatch_image_url?: string | null
          value: string
        }
        Update: {
          attribute_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label?: string
          label_hi?: string | null
          numeric_value?: number | null
          swatch_hex?: string | null
          swatch_image_url?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "attribute_options_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "attribute_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          brand_owner_seller_id: string | null
          country_of_origin: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          is_authorised_only: boolean
          is_featured: boolean
          logo_url: string | null
          name: string
          product_count: number
          seo_description: string | null
          seo_title: string | null
          slug: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          brand_owner_seller_id?: string | null
          country_of_origin?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_authorised_only?: boolean
          is_featured?: boolean
          logo_url?: string | null
          name: string
          product_count?: number
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          brand_owner_seller_id?: string | null
          country_of_origin?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_authorised_only?: boolean
          is_featured?: boolean
          logo_url?: string | null
          name?: string
          product_count?: number
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          banner_url: string | null
          canonical_url: string | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number
          icon_url: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_leaf: boolean
          level: number
          merged_at: string | null
          merged_into_id: string | null
          name: string
          name_hi: string | null
          parent_id: string | null
          path: string
          seo_description: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          show_in_home_grid: boolean
          show_in_navigation: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          canonical_url?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          icon_url?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_leaf?: boolean
          level?: number
          merged_at?: string | null
          merged_into_id?: string | null
          name: string
          name_hi?: string | null
          parent_id?: string | null
          path: string
          seo_description?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          show_in_home_grid?: boolean
          show_in_navigation?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          canonical_url?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          icon_url?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_leaf?: boolean
          level?: number
          merged_at?: string | null
          merged_into_id?: string | null
          name?: string
          name_hi?: string | null
          parent_id?: string | null
          path?: string
          seo_description?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          show_in_home_grid?: boolean
          show_in_navigation?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_attributes: {
        Row: {
          allowed_option_ids: string[] | null
          attribute_id: string
          category_id: string
          created_at: string
          default_value: string | null
          display_order: number
          help_text: string | null
          id: string
          is_filterable: boolean
          is_key_specification: boolean
          is_required: boolean
          is_variant_defining: boolean
        }
        Insert: {
          allowed_option_ids?: string[] | null
          attribute_id: string
          category_id: string
          created_at?: string
          default_value?: string | null
          display_order?: number
          help_text?: string | null
          id?: string
          is_filterable?: boolean
          is_key_specification?: boolean
          is_required?: boolean
          is_variant_defining?: boolean
        }
        Update: {
          allowed_option_ids?: string[] | null
          attribute_id?: string
          category_id?: string
          created_at?: string
          default_value?: string | null
          display_order?: number
          help_text?: string | null
          id?: string
          is_filterable?: boolean
          is_key_specification?: boolean
          is_required?: boolean
          is_variant_defining?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "category_attributes_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "attribute_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_attributes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_closure: {
        Row: {
          ancestor_id: string
          depth: number
          descendant_id: string
        }
        Insert: {
          ancestor_id: string
          depth: number
          descendant_id: string
        }
        Update: {
          ancestor_id?: string
          depth?: number
          descendant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_closure_ancestor_id_fkey"
            columns: ["ancestor_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_closure_descendant_id_fkey"
            columns: ["descendant_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_policies: {
        Row: {
          category_id: string
          cod_allowed: boolean
          cod_limit_paise: number | null
          created_at: string
          default_commission_percentage: number | null
          default_gst_rate: number | null
          default_hsn_code: string | null
          is_fragile: boolean
          is_hazmat: boolean
          is_restricted: boolean
          max_title_length: number
          min_images: number
          minimum_buyer_age: number | null
          replacement_window_days: number | null
          required_seller_documents: string[]
          requires_brand_authorisation: boolean
          requires_moderation: boolean
          requires_return_qc: boolean
          return_reasons_allowed: string[] | null
          return_type: string | null
          return_window_days: number | null
          updated_at: string
        }
        Insert: {
          category_id: string
          cod_allowed?: boolean
          cod_limit_paise?: number | null
          created_at?: string
          default_commission_percentage?: number | null
          default_gst_rate?: number | null
          default_hsn_code?: string | null
          is_fragile?: boolean
          is_hazmat?: boolean
          is_restricted?: boolean
          max_title_length?: number
          min_images?: number
          minimum_buyer_age?: number | null
          replacement_window_days?: number | null
          required_seller_documents?: string[]
          requires_brand_authorisation?: boolean
          requires_moderation?: boolean
          requires_return_qc?: boolean
          return_reasons_allowed?: string[] | null
          return_type?: string | null
          return_window_days?: number | null
          updated_at?: string
        }
        Update: {
          category_id?: string
          cod_allowed?: boolean
          cod_limit_paise?: number | null
          created_at?: string
          default_commission_percentage?: number | null
          default_gst_rate?: number | null
          default_hsn_code?: string | null
          is_fragile?: boolean
          is_hazmat?: boolean
          is_restricted?: boolean
          max_title_length?: number
          min_images?: number
          minimum_buyer_age?: number | null
          replacement_window_days?: number | null
          required_seller_documents?: string[]
          requires_brand_authorisation?: boolean
          requires_moderation?: boolean
          requires_return_qc?: boolean
          return_reasons_allowed?: string[] | null
          return_type?: string | null
          return_window_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_policies_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_status_history: {
        Row: {
          actor_type: string
          changed_by: string | null
          from_status: string | null
          id: string
          listing_id: string
          occurred_at: string
          reason: string | null
          to_status: string
        }
        Insert: {
          actor_type?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          listing_id: string
          occurred_at?: string
          reason?: string | null
          to_status: string
        }
        Update: {
          actor_type?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          listing_id?: string
          occurred_at?: string
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_status_history_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "seller_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_status_history_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "listing_status_history_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "v_sellable_listings"
            referencedColumns: ["listing_id"]
          },
        ]
      }
      product_attribute_values: {
        Row: {
          attribute_id: string
          created_at: string
          id: string
          option_id: string | null
          option_ids: string[] | null
          product_id: string
          unit: string | null
          updated_at: string
          value_boolean: boolean | null
          value_date: string | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          attribute_id: string
          created_at?: string
          id?: string
          option_id?: string | null
          option_ids?: string[] | null
          product_id: string
          unit?: string | null
          updated_at?: string
          value_boolean?: boolean | null
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          attribute_id?: string
          created_at?: string
          id?: string
          option_id?: string | null
          option_ids?: string[] | null
          product_id?: string
          unit?: string | null
          updated_at?: string
          value_boolean?: boolean | null
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_values_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "attribute_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_values_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "attribute_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_values_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_values_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_media: {
        Row: {
          alt_text: string | null
          blurhash: string | null
          created_at: string
          display_order: number
          duration_seconds: number | null
          file_size_bytes: number | null
          height_px: number | null
          id: string
          is_primary: boolean
          media_type: string
          mime_type: string
          moderation_status: string
          product_id: string
          public_url: string
          storage_bucket: string
          storage_path: string
          updated_at: string
          variant_id: string | null
          width_px: number | null
        }
        Insert: {
          alt_text?: string | null
          blurhash?: string | null
          created_at?: string
          display_order?: number
          duration_seconds?: number | null
          file_size_bytes?: number | null
          height_px?: number | null
          id?: string
          is_primary?: boolean
          media_type?: string
          mime_type: string
          moderation_status?: string
          product_id: string
          public_url: string
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          variant_id?: string | null
          width_px?: number | null
        }
        Update: {
          alt_text?: string | null
          blurhash?: string | null
          created_at?: string
          display_order?: number
          duration_seconds?: number | null
          file_size_bytes?: number | null
          height_px?: number | null
          id?: string
          is_primary?: boolean
          media_type?: string
          mime_type?: string
          moderation_status?: string
          product_id?: string
          public_url?: string
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          variant_id?: string | null
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_media_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_media_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_sellable_listings"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      product_moderation_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          field_feedback: Json
          id: string
          notes: string | null
          occurred_at: string
          product_id: string
          reason_codes: string[]
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          field_feedback?: Json
          id?: string
          notes?: string | null
          occurred_at?: string
          product_id: string
          reason_codes?: string[]
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          field_feedback?: Json
          id?: string
          notes?: string | null
          occurred_at?: string
          product_id?: string
          reason_codes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "product_moderation_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_moderation_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_specifications: {
        Row: {
          created_at: string
          display_order: number
          group_name: string
          id: string
          label: string
          product_id: string
          value: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          group_name?: string
          id?: string
          label: string
          product_id: string
          value: string
        }
        Update: {
          created_at?: string
          display_order?: number
          group_name?: string
          id?: string
          label?: string
          product_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_specifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_specifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_variants: {
        Row: {
          attribute_signature: string
          created_at: string
          display_order: number
          id: string
          is_default: boolean
          product_id: string
          status: string
          updated_at: string
          variant_label: string
        }
        Insert: {
          attribute_signature: string
          created_at?: string
          display_order?: number
          id?: string
          is_default?: boolean
          product_id: string
          status?: string
          updated_at?: string
          variant_label: string
        }
        Update: {
          attribute_signature?: string
          created_at?: string
          display_order?: number
          id?: string
          is_default?: boolean
          product_id?: string
          status?: string
          updated_at?: string
          variant_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["product_id"]
          },
        ]
      }
      products: {
        Row: {
          archived_at: string | null
          brand_id: string | null
          canonical_url: string | null
          category_id: string
          country_of_origin: string
          created_at: string
          created_by: string | null
          created_by_seller_id: string | null
          description: string | null
          generic_name: string | null
          gst_rate: number | null
          highlights: string[]
          hsn_code: string | null
          id: string
          importer_address: string | null
          importer_name: string | null
          manufacturer_address: string | null
          manufacturer_name: string | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_notes: string | null
          moderation_status: string
          net_quantity: string | null
          order_count_30d: number
          packer_address: string | null
          packer_name: string | null
          popularity_score: number
          public_id: string
          search_keywords: string[]
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: string
          status_reason: string | null
          subtitle: string | null
          title: string
          updated_at: string
          view_count_30d: number
          warranty_period_months: number | null
          warranty_summary: string | null
          warranty_type: string | null
        }
        Insert: {
          archived_at?: string | null
          brand_id?: string | null
          canonical_url?: string | null
          category_id: string
          country_of_origin?: string
          created_at?: string
          created_by?: string | null
          created_by_seller_id?: string | null
          description?: string | null
          generic_name?: string | null
          gst_rate?: number | null
          highlights?: string[]
          hsn_code?: string | null
          id?: string
          importer_address?: string | null
          importer_name?: string | null
          manufacturer_address?: string | null
          manufacturer_name?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
          moderation_status?: string
          net_quantity?: string | null
          order_count_30d?: number
          packer_address?: string | null
          packer_name?: string | null
          popularity_score?: number
          public_id: string
          search_keywords?: string[]
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: string
          status_reason?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
          view_count_30d?: number
          warranty_period_months?: number | null
          warranty_summary?: string | null
          warranty_type?: string | null
        }
        Update: {
          archived_at?: string | null
          brand_id?: string | null
          canonical_url?: string | null
          category_id?: string
          country_of_origin?: string
          created_at?: string
          created_by?: string | null
          created_by_seller_id?: string | null
          description?: string | null
          generic_name?: string | null
          gst_rate?: number | null
          highlights?: string[]
          hsn_code?: string | null
          id?: string
          importer_address?: string | null
          importer_name?: string | null
          manufacturer_address?: string | null
          manufacturer_name?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
          moderation_status?: string
          net_quantity?: string | null
          order_count_30d?: number
          packer_address?: string | null
          packer_name?: string | null
          popularity_score?: number
          public_id?: string
          search_keywords?: string[]
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: string
          status_reason?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
          view_count_30d?: number
          warranty_period_months?: number | null
          warranty_summary?: string | null
          warranty_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_listings: {
        Row: {
          archived_at: string | null
          buy_box_score: number | null
          cod_allowed: boolean | null
          condition: string
          created_at: string
          declared_mrp_paise: number
          default_warehouse_id: string | null
          first_activated_at: string | null
          fulfillment_model: string
          handling_time_days: number
          id: string
          is_buy_box_eligible: boolean
          is_buy_box_winner: boolean
          is_replacement_allowed: boolean | null
          max_order_quantity: number
          min_order_quantity: number
          product_id: string
          return_window_days: number | null
          seller_id: string
          seller_sku_code: string | null
          sku_id: string
          status: string
          status_reason: string | null
          suppressed_reason: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          buy_box_score?: number | null
          cod_allowed?: boolean | null
          condition?: string
          created_at?: string
          declared_mrp_paise: number
          default_warehouse_id?: string | null
          first_activated_at?: string | null
          fulfillment_model?: string
          handling_time_days?: number
          id?: string
          is_buy_box_eligible?: boolean
          is_buy_box_winner?: boolean
          is_replacement_allowed?: boolean | null
          max_order_quantity?: number
          min_order_quantity?: number
          product_id: string
          return_window_days?: number | null
          seller_id: string
          seller_sku_code?: string | null
          sku_id: string
          status?: string
          status_reason?: string | null
          suppressed_reason?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          buy_box_score?: number | null
          cod_allowed?: boolean | null
          condition?: string
          created_at?: string
          declared_mrp_paise?: number
          default_warehouse_id?: string | null
          first_activated_at?: string | null
          fulfillment_model?: string
          handling_time_days?: number
          id?: string
          is_buy_box_eligible?: boolean
          is_buy_box_winner?: boolean
          is_replacement_allowed?: boolean | null
          max_order_quantity?: number
          min_order_quantity?: number
          product_id?: string
          return_window_days?: number | null
          seller_id?: string
          seller_sku_code?: string | null
          sku_id?: string
          status?: string
          status_reason?: string | null
          suppressed_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "seller_listings_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      skus: {
        Row: {
          barcode: string | null
          barcode_type: string | null
          created_at: string
          height_mm: number | null
          id: string
          is_fragile: boolean
          is_hazmat: boolean
          is_liquid: boolean
          length_mm: number | null
          product_id: string
          reference_mrp_paise: number | null
          requires_serial_tracking: boolean
          shelf_life_days: number | null
          sku_code: string
          status: string
          updated_at: string
          variant_id: string
          volumetric_weight_grams: number | null
          weight_grams: number | null
          width_mm: number | null
        }
        Insert: {
          barcode?: string | null
          barcode_type?: string | null
          created_at?: string
          height_mm?: number | null
          id?: string
          is_fragile?: boolean
          is_hazmat?: boolean
          is_liquid?: boolean
          length_mm?: number | null
          product_id: string
          reference_mrp_paise?: number | null
          requires_serial_tracking?: boolean
          shelf_life_days?: number | null
          sku_code: string
          status?: string
          updated_at?: string
          variant_id: string
          volumetric_weight_grams?: number | null
          weight_grams?: number | null
          width_mm?: number | null
        }
        Update: {
          barcode?: string | null
          barcode_type?: string | null
          created_at?: string
          height_mm?: number | null
          id?: string
          is_fragile?: boolean
          is_hazmat?: boolean
          is_liquid?: boolean
          length_mm?: number | null
          product_id?: string
          reference_mrp_paise?: number | null
          requires_serial_tracking?: boolean
          shelf_life_days?: number | null
          sku_code?: string
          status?: string
          updated_at?: string
          variant_id?: string
          volumetric_weight_grams?: number | null
          weight_grams?: number | null
          width_mm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "skus_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skus_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "skus_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skus_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_sellable_listings"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      variant_attribute_values: {
        Row: {
          attribute_id: string
          created_at: string
          id: string
          option_id: string | null
          value_number: number | null
          value_text: string | null
          variant_id: string
        }
        Insert: {
          attribute_id: string
          created_at?: string
          id?: string
          option_id?: string | null
          value_number?: number | null
          value_text?: string | null
          variant_id: string
        }
        Update: {
          attribute_id?: string
          created_at?: string
          id?: string
          option_id?: string | null
          value_number?: number | null
          value_text?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_attribute_values_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "attribute_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_attribute_values_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "attribute_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_attribute_values_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_attribute_values_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_sellable_listings"
            referencedColumns: ["variant_id"]
          },
        ]
      }
    }
    Views: {
      v_product_cards: {
        Row: {
          available_quantity: number | null
          average_rating: number | null
          brand_id: string | null
          brand_name: string | null
          brand_slug: string | null
          category_id: string | null
          category_name: string | null
          category_path: string | null
          created_at: string | null
          discount_paise: number | null
          discount_percentage: number | null
          fulfillment_model: string | null
          handling_time_days: number | null
          listing_id: string | null
          mrp_paise: number | null
          popularity_score: number | null
          primary_image_blurhash: string | null
          primary_image_url: string | null
          product_id: string | null
          public_id: string | null
          rating_count: number | null
          rating_ranking_score: number | null
          seller_id: string | null
          seller_name: string | null
          selling_price_paise: number | null
          sku_id: string | null
          slug: string | null
          subtitle: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_listings_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      v_sellable_listings: {
        Row: {
          available_quantity: number | null
          brand_id: string | null
          buy_box_score: number | null
          category_id: string | null
          condition: string | null
          currency: string | null
          discount_paise: number | null
          discount_percentage: number | null
          fulfillment_model: string | null
          gst_rate: number | null
          handling_time_days: number | null
          hsn_code: string | null
          is_buy_box_eligible: boolean | null
          is_buy_box_winner: boolean | null
          listing_id: string | null
          max_order_quantity: number | null
          min_order_quantity: number | null
          mrp_paise: number | null
          on_time_dispatch_rate: number | null
          product_id: string | null
          product_public_id: string | null
          product_slug: string | null
          product_title: string | null
          seller_cancellation_rate: number | null
          seller_id: string | null
          seller_name: string | null
          seller_rating: number | null
          seller_rating_count: number | null
          seller_return_rate: number | null
          seller_score: number | null
          seller_slug: string | null
          seller_tier: string | null
          selling_price_paise: number | null
          sku_code: string | null
          sku_id: string | null
          variant_id: string | null
          variant_label: string | null
          volumetric_weight_grams: number | null
          warehouse_count: number | null
          weight_grams: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "seller_listings_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      rebuild_subtree_paths: { Args: { p_root_id: string }; Returns: undefined }
      resolve_category_policy: {
        Args: { p_category_id: string }
        Returns: {
          cod_allowed: boolean
          cod_limit_paise: unknown
          default_commission_percentage: unknown
          default_gst_rate: unknown
          default_hsn_code: unknown
          is_restricted: boolean
          minimum_buyer_age: number
          replacement_window_days: number
          requires_return_qc: boolean
          return_type: string
          return_window_days: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  commerce: {
    Tables: {
      cart_items: {
        Row: {
          added_at: string
          availability_status: string
          available_quantity: number | null
          cart_id: string
          displayed_mrp_paise: number
          displayed_price_paise: number
          flash_sale_item_id: string | null
          id: string
          listing_id: string
          price_captured_at: string
          quantity: number
          seller_id: string
          sku_id: string
          updated_at: string
        }
        Insert: {
          added_at?: string
          availability_status?: string
          available_quantity?: number | null
          cart_id: string
          displayed_mrp_paise: number
          displayed_price_paise: number
          flash_sale_item_id?: string | null
          id?: string
          listing_id: string
          price_captured_at?: string
          quantity: number
          seller_id: string
          sku_id: string
          updated_at?: string
        }
        Update: {
          added_at?: string
          availability_status?: string
          available_quantity?: number | null
          cart_id?: string
          displayed_mrp_paise?: number
          displayed_price_paise?: number
          flash_sale_item_id?: string | null
          id?: string
          listing_id?: string
          price_captured_at?: string
          quantity?: number
          seller_id?: string
          sku_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          abandoned_at: string | null
          applied_coupon_code: string | null
          computed_at: string | null
          converted_order_id: string | null
          created_at: string
          currency: string
          delivery_pincode: string | null
          guest_token: string | null
          id: string
          items_count: number
          last_activity_at: string
          merged_into_cart_id: string | null
          status: string
          subtotal_paise: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          abandoned_at?: string | null
          applied_coupon_code?: string | null
          computed_at?: string | null
          converted_order_id?: string | null
          created_at?: string
          currency?: string
          delivery_pincode?: string | null
          guest_token?: string | null
          id?: string
          items_count?: number
          last_activity_at?: string
          merged_into_cart_id?: string | null
          status?: string
          subtotal_paise?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          abandoned_at?: string | null
          applied_coupon_code?: string | null
          computed_at?: string | null
          converted_order_id?: string | null
          created_at?: string
          currency?: string
          delivery_pincode?: string | null
          guest_token?: string | null
          id?: string
          items_count?: number
          last_activity_at?: string
          merged_into_cart_id?: string | null
          status?: string
          subtotal_paise?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carts_converted_order_fk"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_merged_into_cart_id_fkey"
            columns: ["merged_into_cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_items: {
        Row: {
          checkout_session_id: string
          created_at: string
          id: string
          line_total_paise: number
          listing_id: string
          mrp_paise: number
          quantity: number
          reservation_id: string | null
          seller_id: string
          selling_price_paise: number
          sku_id: string
          validation_message: string | null
          validation_status: string
          warehouse_id: string | null
        }
        Insert: {
          checkout_session_id: string
          created_at?: string
          id?: string
          line_total_paise: number
          listing_id: string
          mrp_paise: number
          quantity: number
          reservation_id?: string | null
          seller_id: string
          selling_price_paise: number
          sku_id: string
          validation_message?: string | null
          validation_status?: string
          warehouse_id?: string | null
        }
        Update: {
          checkout_session_id?: string
          created_at?: string
          id?: string
          line_total_paise?: number
          listing_id?: string
          mrp_paise?: number
          quantity?: number
          reservation_id?: string | null
          seller_id?: string
          selling_price_paise?: number
          sku_id?: string
          validation_message?: string | null
          validation_status?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_items_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_price_snapshots: {
        Row: {
          breakdown: Json
          checkout_session_id: string
          computed_at: string
          id: string
          revision: number
          schema_version: number
          total_payable_paise: number
        }
        Insert: {
          breakdown: Json
          checkout_session_id: string
          computed_at?: string
          id?: string
          revision?: number
          schema_version?: number
          total_payable_paise: number
        }
        Update: {
          breakdown?: Json
          checkout_session_id?: string
          computed_at?: string
          id?: string
          revision?: number
          schema_version?: number
          total_payable_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "checkout_price_snapshots_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_sessions: {
        Row: {
          applied_bank_offer_id: string | null
          applied_coupon_id: string | null
          applied_rules: Json
          bank_offer_discount_paise: number
          billing_address_id: string | null
          cart_id: string | null
          client_platform: string | null
          client_version: string | null
          cod_decision: string | null
          cod_decision_reasons: string[]
          cod_fee_paise: number
          cod_prepay_paise: number | null
          completed_at: string | null
          coupon_discount_paise: number
          created_at: string
          currency: string
          delivery_pincode: string | null
          delivery_promise: Json
          expires_at: string
          failure_code: string | null
          failure_message: string | null
          gift_message: string | null
          gift_wrap_paise: number
          id: string
          idempotency_key: string | null
          ip_address: unknown
          is_gift: boolean
          items_subtotal_paise: number
          order_id: string | null
          payment_method: string | null
          platform_discount_paise: number
          promotion_discount_paise: number
          request_id: string | null
          seller_discount_paise: number
          shipping_address_id: string | null
          shipping_address_snapshot: Json | null
          shipping_paise: number
          status: string
          tax_paise: number
          total_payable_paise: number
          trace_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_bank_offer_id?: string | null
          applied_coupon_id?: string | null
          applied_rules?: Json
          bank_offer_discount_paise?: number
          billing_address_id?: string | null
          cart_id?: string | null
          client_platform?: string | null
          client_version?: string | null
          cod_decision?: string | null
          cod_decision_reasons?: string[]
          cod_fee_paise?: number
          cod_prepay_paise?: number | null
          completed_at?: string | null
          coupon_discount_paise?: number
          created_at?: string
          currency?: string
          delivery_pincode?: string | null
          delivery_promise?: Json
          expires_at?: string
          failure_code?: string | null
          failure_message?: string | null
          gift_message?: string | null
          gift_wrap_paise?: number
          id?: string
          idempotency_key?: string | null
          ip_address?: unknown
          is_gift?: boolean
          items_subtotal_paise?: number
          order_id?: string | null
          payment_method?: string | null
          platform_discount_paise?: number
          promotion_discount_paise?: number
          request_id?: string | null
          seller_discount_paise?: number
          shipping_address_id?: string | null
          shipping_address_snapshot?: Json | null
          shipping_paise?: number
          status?: string
          tax_paise?: number
          total_payable_paise?: number
          trace_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_bank_offer_id?: string | null
          applied_coupon_id?: string | null
          applied_rules?: Json
          bank_offer_discount_paise?: number
          billing_address_id?: string | null
          cart_id?: string | null
          client_platform?: string | null
          client_version?: string | null
          cod_decision?: string | null
          cod_decision_reasons?: string[]
          cod_fee_paise?: number
          cod_prepay_paise?: number | null
          completed_at?: string | null
          coupon_discount_paise?: number
          created_at?: string
          currency?: string
          delivery_pincode?: string | null
          delivery_promise?: Json
          expires_at?: string
          failure_code?: string | null
          failure_message?: string | null
          gift_message?: string | null
          gift_wrap_paise?: number
          id?: string
          idempotency_key?: string | null
          ip_address?: unknown
          is_gift?: boolean
          items_subtotal_paise?: number
          order_id?: string | null
          payment_method?: string | null
          platform_discount_paise?: number
          promotion_discount_paise?: number
          request_id?: string | null
          seller_discount_paise?: number
          shipping_address_id?: string | null
          shipping_address_snapshot?: Json | null
          shipping_paise?: number
          status?: string
          tax_paise?: number
          total_payable_paise?: number
          trace_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_sessions_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_order_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          address_type: string
          alternate_phone: string | null
          city: string
          country_code: string
          created_at: string
          delivery_instructions: string | null
          district: string | null
          id: string
          landmark: string | null
          latitude: number | null
          locality: string | null
          longitude: number | null
          order_id: string
          pincode: string
          recipient_name: string
          recipient_phone: string
          source_address_id: string | null
          state_code: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          address_type: string
          alternate_phone?: string | null
          city: string
          country_code?: string
          created_at?: string
          delivery_instructions?: string | null
          district?: string | null
          id?: string
          landmark?: string | null
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          order_id: string
          pincode: string
          recipient_name: string
          recipient_phone: string
          source_address_id?: string | null
          state_code: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          address_type?: string
          alternate_phone?: string | null
          city?: string
          country_code?: string
          created_at?: string
          delivery_instructions?: string | null
          district?: string | null
          id?: string
          landmark?: string | null
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          order_id?: string
          pincode?: string
          recipient_name?: string
          recipient_phone?: string
          source_address_id?: string | null
          state_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_addresses_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          description_key: string | null
          event_type: string
          icon: string | null
          id: string
          is_customer_visible: boolean
          occurred_at: string
          order_id: string
          order_item_id: string | null
          params: Json
          title_key: string
        }
        Insert: {
          description_key?: string | null
          event_type: string
          icon?: string | null
          id?: string
          is_customer_visible?: boolean
          occurred_at?: string
          order_id: string
          order_item_id?: string | null
          params?: Json
          title_key: string
        }
        Update: {
          description_key?: string | null
          event_type?: string
          icon?: string | null
          id?: string
          is_customer_visible?: boolean
          occurred_at?: string
          order_id?: string
          order_item_id?: string | null
          params?: Json
          title_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_price_breakdowns: {
        Row: {
          applied_rules: Json
          bank_offer_discount_paise: number
          cess_paise: number
          cgst_paise: number
          cod_fee_paise: number
          commission_gst_paise: number
          commission_paise: number
          commission_rate: number | null
          commission_rule_id: string | null
          computed_at: string
          coupon_discount_paise: number
          currency: string
          fulfillment_fee_paise: number
          gift_wrap_paise: number
          gross_paise: number
          gst_rate: number
          igst_paise: number
          is_intra_state: boolean
          order_id: string
          order_item_id: string
          payment_gateway_fee_paise: number
          place_of_supply_state_code: string
          platform_discount_paise: number
          platform_fee_paise: number
          promotion_discount_paise: number
          quantity: number
          schema_version: number
          seller_discount_paise: number
          seller_payable_paise: number
          sgst_paise: number
          shipping_paise: number
          taxable_value_paise: number
          total_discount_paise: number
          total_payable_paise: number
          total_tax_paise: number
          unit_mrp_paise: number
          unit_selling_price_paise: number
        }
        Insert: {
          applied_rules?: Json
          bank_offer_discount_paise?: number
          cess_paise?: number
          cgst_paise?: number
          cod_fee_paise?: number
          commission_gst_paise?: number
          commission_paise?: number
          commission_rate?: number | null
          commission_rule_id?: string | null
          computed_at?: string
          coupon_discount_paise?: number
          currency?: string
          fulfillment_fee_paise?: number
          gift_wrap_paise?: number
          gross_paise: number
          gst_rate: number
          igst_paise?: number
          is_intra_state: boolean
          order_id: string
          order_item_id: string
          payment_gateway_fee_paise?: number
          place_of_supply_state_code: string
          platform_discount_paise?: number
          platform_fee_paise?: number
          promotion_discount_paise?: number
          quantity: number
          schema_version?: number
          seller_discount_paise?: number
          seller_payable_paise: number
          sgst_paise?: number
          shipping_paise?: number
          taxable_value_paise: number
          total_discount_paise?: number
          total_payable_paise: number
          total_tax_paise?: number
          unit_mrp_paise: number
          unit_selling_price_paise: number
        }
        Update: {
          applied_rules?: Json
          bank_offer_discount_paise?: number
          cess_paise?: number
          cgst_paise?: number
          cod_fee_paise?: number
          commission_gst_paise?: number
          commission_paise?: number
          commission_rate?: number | null
          commission_rule_id?: string | null
          computed_at?: string
          coupon_discount_paise?: number
          currency?: string
          fulfillment_fee_paise?: number
          gift_wrap_paise?: number
          gross_paise?: number
          gst_rate?: number
          igst_paise?: number
          is_intra_state?: boolean
          order_id?: string
          order_item_id?: string
          payment_gateway_fee_paise?: number
          place_of_supply_state_code?: string
          platform_discount_paise?: number
          platform_fee_paise?: number
          promotion_discount_paise?: number
          quantity?: number
          schema_version?: number
          seller_discount_paise?: number
          seller_payable_paise?: number
          sgst_paise?: number
          shipping_paise?: number
          taxable_value_paise?: number
          total_discount_paise?: number
          total_payable_paise?: number
          total_tax_paise?: number
          unit_mrp_paise?: number
          unit_selling_price_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_price_breakdowns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_price_breakdowns_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_status_history: {
        Row: {
          actor_id: string | null
          actor_type: string
          context: Json
          from_status: string | null
          id: string
          occurred_at: string
          order_id: string
          order_item_id: string
          reason: string | null
          request_id: string | null
          to_status: string
          trace_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          context?: Json
          from_status?: string | null
          id?: string
          occurred_at?: string
          order_id: string
          order_item_id: string
          reason?: string | null
          request_id?: string | null
          to_status: string
          trace_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          context?: Json
          from_status?: string | null
          id?: string
          occurred_at?: string
          order_id?: string
          order_item_id?: string
          reason?: string | null
          request_id?: string | null
          to_status?: string
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_item_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_status_history_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          brand_name: string | null
          cancelled_at: string | null
          cancelled_quantity: number
          created_at: string
          delivered_at: string | null
          dispatched_at: string | null
          fulfillment_model: string
          hsn_code: string | null
          id: string
          is_replacement_allowed: boolean
          item_number: string
          line_number: number
          listing_id: string
          order_id: string
          primary_image_url: string | null
          product_id: string
          product_title: string
          promised_delivery_date: string | null
          promised_dispatch_by: string | null
          quantity: number
          refunded_paise: number
          reservation_id: string | null
          return_eligible_until: string | null
          return_type: string
          return_window_days: number
          returned_quantity: number
          seller_id: string
          sku_code: string
          sku_id: string
          status: string
          status_reason: string | null
          updated_at: string
          variant_label: string | null
          warehouse_id: string | null
        }
        Insert: {
          brand_name?: string | null
          cancelled_at?: string | null
          cancelled_quantity?: number
          created_at?: string
          delivered_at?: string | null
          dispatched_at?: string | null
          fulfillment_model?: string
          hsn_code?: string | null
          id?: string
          is_replacement_allowed?: boolean
          item_number: string
          line_number: number
          listing_id: string
          order_id: string
          primary_image_url?: string | null
          product_id: string
          product_title: string
          promised_delivery_date?: string | null
          promised_dispatch_by?: string | null
          quantity: number
          refunded_paise?: number
          reservation_id?: string | null
          return_eligible_until?: string | null
          return_type?: string
          return_window_days?: number
          returned_quantity?: number
          seller_id: string
          sku_code: string
          sku_id: string
          status?: string
          status_reason?: string | null
          updated_at?: string
          variant_label?: string | null
          warehouse_id?: string | null
        }
        Update: {
          brand_name?: string | null
          cancelled_at?: string | null
          cancelled_quantity?: number
          created_at?: string
          delivered_at?: string | null
          dispatched_at?: string | null
          fulfillment_model?: string
          hsn_code?: string | null
          id?: string
          is_replacement_allowed?: boolean
          item_number?: string
          line_number?: number
          listing_id?: string
          order_id?: string
          primary_image_url?: string | null
          product_id?: string
          product_title?: string
          promised_delivery_date?: string | null
          promised_dispatch_by?: string | null
          quantity?: number
          refunded_paise?: number
          reservation_id?: string | null
          return_eligible_until?: string | null
          return_type?: string
          return_window_days?: number
          returned_quantity?: number
          seller_id?: string
          sku_code?: string
          sku_id?: string
          status?: string
          status_reason?: string | null
          updated_at?: string
          variant_label?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "order_status_ranks"
            referencedColumns: ["status"]
          },
        ]
      }
      order_price_breakdowns: {
        Row: {
          applied_rules: Json
          bank_offer_discount_paise: number
          cess_paise: number
          cgst_paise: number
          cod_fee_paise: number
          computed_at: string
          coupon_discount_paise: number
          currency: string
          gift_wrap_paise: number
          igst_paise: number
          items_gross_paise: number
          order_id: string
          platform_discount_paise: number
          promotion_discount_paise: number
          rounding_adjustment_paise: number
          schema_version: number
          seller_discount_paise: number
          sgst_paise: number
          shipping_paise: number
          taxable_value_paise: number
          total_discount_paise: number
          total_payable_paise: number
          total_tax_paise: number
        }
        Insert: {
          applied_rules?: Json
          bank_offer_discount_paise?: number
          cess_paise?: number
          cgst_paise?: number
          cod_fee_paise?: number
          computed_at?: string
          coupon_discount_paise?: number
          currency?: string
          gift_wrap_paise?: number
          igst_paise?: number
          items_gross_paise: number
          order_id: string
          platform_discount_paise?: number
          promotion_discount_paise?: number
          rounding_adjustment_paise?: number
          schema_version?: number
          seller_discount_paise?: number
          sgst_paise?: number
          shipping_paise?: number
          taxable_value_paise?: number
          total_discount_paise?: number
          total_payable_paise: number
          total_tax_paise?: number
        }
        Update: {
          applied_rules?: Json
          bank_offer_discount_paise?: number
          cess_paise?: number
          cgst_paise?: number
          cod_fee_paise?: number
          computed_at?: string
          coupon_discount_paise?: number
          currency?: string
          gift_wrap_paise?: number
          igst_paise?: number
          items_gross_paise?: number
          order_id?: string
          platform_discount_paise?: number
          promotion_discount_paise?: number
          rounding_adjustment_paise?: number
          schema_version?: number
          seller_discount_paise?: number
          sgst_paise?: number
          shipping_paise?: number
          taxable_value_paise?: number
          total_discount_paise?: number
          total_payable_paise?: number
          total_tax_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_price_breakdowns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          actor_id: string | null
          actor_type: string
          from_status: string | null
          id: string
          occurred_at: string
          order_id: string
          reason: string | null
          request_id: string | null
          to_status: string
          trace_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          from_status?: string | null
          id?: string
          occurred_at?: string
          order_id: string
          reason?: string | null
          request_id?: string | null
          to_status: string
          trace_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          from_status?: string | null
          id?: string
          occurred_at?: string
          order_id?: string
          reason?: string | null
          request_id?: string | null
          to_status?: string
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_ranks: {
        Row: {
          customer_cancellable: boolean
          is_terminal: boolean
          rank: number
          status: string
        }
        Insert: {
          customer_cancellable?: boolean
          is_terminal?: boolean
          rank: number
          status: string
        }
        Update: {
          customer_cancellable?: boolean
          is_terminal?: boolean
          rank?: number
          status?: string
        }
        Relationships: []
      }
      order_status_transitions: {
        Row: {
          allowed_actor_types: string[]
          applies_to: string
          description: string | null
          from_status: string
          requires_reason: boolean
          to_status: string
        }
        Insert: {
          allowed_actor_types?: string[]
          applies_to?: string
          description?: string | null
          from_status: string
          requires_reason?: boolean
          to_status: string
        }
        Update: {
          allowed_actor_types?: string[]
          applies_to?: string
          description?: string | null
          from_status?: string
          requires_reason?: boolean
          to_status?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount_paid_paise: number
          amount_refunded_paise: number
          applied_coupon_code: string | null
          applied_coupon_id: string | null
          cancellation_actor: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          checkout_session_id: string | null
          client_platform: string | null
          client_version: string | null
          cod_fee_paise: number
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          delivery_pincode: string
          fulfillment_summary: string
          gift_message: string | null
          id: string
          is_cod: boolean
          is_gift: boolean
          items_count: number
          items_subtotal_paise: number
          order_number: string
          payment_method: string
          payment_status: string
          placed_at: string
          placed_from_ip: unknown
          promised_delivery_date: string | null
          request_id: string | null
          risk_flags: string[]
          risk_score: number | null
          sellers_count: number
          shipping_paise: number
          status: string
          tax_paise: number
          total_discount_paise: number
          total_payable_paise: number
          trace_id: string | null
          units_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paid_paise?: number
          amount_refunded_paise?: number
          applied_coupon_code?: string | null
          applied_coupon_id?: string | null
          cancellation_actor?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checkout_session_id?: string | null
          client_platform?: string | null
          client_version?: string | null
          cod_fee_paise?: number
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          delivery_pincode: string
          fulfillment_summary?: string
          gift_message?: string | null
          id?: string
          is_cod?: boolean
          is_gift?: boolean
          items_count?: number
          items_subtotal_paise: number
          order_number: string
          payment_method: string
          payment_status?: string
          placed_at?: string
          placed_from_ip?: unknown
          promised_delivery_date?: string | null
          request_id?: string | null
          risk_flags?: string[]
          risk_score?: number | null
          sellers_count?: number
          shipping_paise?: number
          status?: string
          tax_paise?: number
          total_discount_paise?: number
          total_payable_paise: number
          trace_id?: string | null
          units_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paid_paise?: number
          amount_refunded_paise?: number
          applied_coupon_code?: string | null
          applied_coupon_id?: string | null
          cancellation_actor?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checkout_session_id?: string | null
          client_platform?: string | null
          client_version?: string | null
          cod_fee_paise?: number
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          delivery_pincode?: string
          fulfillment_summary?: string
          gift_message?: string | null
          id?: string
          is_cod?: boolean
          is_gift?: boolean
          items_count?: number
          items_subtotal_paise?: number
          order_number?: string
          payment_method?: string
          payment_status?: string
          placed_at?: string
          placed_from_ip?: unknown
          promised_delivery_date?: string | null
          request_id?: string | null
          risk_flags?: string[]
          risk_score?: number | null
          sellers_count?: number
          shipping_paise?: number
          status?: string
          tax_paise?: number
          total_discount_paise?: number
          total_payable_paise?: number
          trace_id?: string | null
          units_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_status_known"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "order_status_ranks"
            referencedColumns: ["status"]
          },
        ]
      }
      product_answers: {
        Row: {
          answerer_type: string
          body: string
          created_at: string
          downvote_count: number
          id: string
          is_verified_buyer: boolean
          moderation_reason: string | null
          question_id: string
          seller_id: string | null
          status: string
          updated_at: string
          upvote_count: number
          user_id: string | null
        }
        Insert: {
          answerer_type?: string
          body: string
          created_at?: string
          downvote_count?: number
          id?: string
          is_verified_buyer?: boolean
          moderation_reason?: string | null
          question_id: string
          seller_id?: string | null
          status?: string
          updated_at?: string
          upvote_count?: number
          user_id?: string | null
        }
        Update: {
          answerer_type?: string
          body?: string
          created_at?: string
          downvote_count?: number
          id?: string
          is_verified_buyer?: boolean
          moderation_reason?: string | null
          question_id?: string
          seller_id?: string | null
          status?: string
          updated_at?: string
          upvote_count?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "product_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_questions: {
        Row: {
          answer_count: number
          body: string
          created_at: string
          id: string
          is_featured: boolean
          moderation_reason: string | null
          product_id: string
          status: string
          updated_at: string
          upvote_count: number
          user_id: string | null
        }
        Insert: {
          answer_count?: number
          body: string
          created_at?: string
          id?: string
          is_featured?: boolean
          moderation_reason?: string | null
          product_id: string
          status?: string
          updated_at?: string
          upvote_count?: number
          user_id?: string | null
        }
        Update: {
          answer_count?: number
          body?: string
          created_at?: string
          id?: string
          is_featured?: boolean
          moderation_reason?: string | null
          product_id?: string
          status?: string
          updated_at?: string
          upvote_count?: number
          user_id?: string | null
        }
        Relationships: []
      }
      product_rating_summary: {
        Row: {
          average_rating: number
          count_1_star: number
          count_2_star: number
          count_3_star: number
          count_4_star: number
          count_5_star: number
          media_count: number
          product_id: string
          ranking_score: number
          rating_count: number
          review_count: number
          updated_at: string
          verified_review_count: number
        }
        Insert: {
          average_rating?: number
          count_1_star?: number
          count_2_star?: number
          count_3_star?: number
          count_4_star?: number
          count_5_star?: number
          media_count?: number
          product_id: string
          ranking_score?: number
          rating_count?: number
          review_count?: number
          updated_at?: string
          verified_review_count?: number
        }
        Update: {
          average_rating?: number
          count_1_star?: number
          count_2_star?: number
          count_3_star?: number
          count_4_star?: number
          count_5_star?: number
          media_count?: number
          product_id?: string
          ranking_score?: number
          rating_count?: number
          review_count?: number
          updated_at?: string
          verified_review_count?: number
        }
        Relationships: []
      }
      question_votes: {
        Row: {
          answer_id: string | null
          created_at: string
          id: string
          is_upvote: boolean
          question_id: string | null
          user_id: string
        }
        Insert: {
          answer_id?: string | null
          created_at?: string
          id?: string
          is_upvote: boolean
          question_id?: string | null
          user_id: string
        }
        Update: {
          answer_id?: string | null
          created_at?: string
          id?: string
          is_upvote?: boolean
          question_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_votes_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "product_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_votes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "product_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      recently_viewed: {
        Row: {
          first_viewed_at: string
          id: string
          last_viewed_at: string
          product_id: string
          user_id: string
          variant_id: string | null
          view_count: number
        }
        Insert: {
          first_viewed_at?: string
          id?: string
          last_viewed_at?: string
          product_id: string
          user_id: string
          variant_id?: string | null
          view_count?: number
        }
        Update: {
          first_viewed_at?: string
          id?: string
          last_viewed_at?: string
          product_id?: string
          user_id?: string
          variant_id?: string | null
          view_count?: number
        }
        Relationships: []
      }
      review_media: {
        Row: {
          created_at: string
          display_order: number
          duration_seconds: number | null
          file_size_bytes: number
          height_px: number | null
          id: string
          media_type: string
          mime_type: string
          moderation_status: string
          public_url: string
          review_id: string
          storage_bucket: string
          storage_path: string
          width_px: number | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          duration_seconds?: number | null
          file_size_bytes: number
          height_px?: number | null
          id?: string
          media_type: string
          mime_type: string
          moderation_status?: string
          public_url: string
          review_id: string
          storage_bucket?: string
          storage_path: string
          width_px?: number | null
        }
        Update: {
          created_at?: string
          display_order?: number
          duration_seconds?: number | null
          file_size_bytes?: number
          height_px?: number | null
          id?: string
          media_type?: string
          mime_type?: string
          moderation_status?: string
          public_url?: string
          review_id?: string
          storage_bucket?: string
          storage_path?: string
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "review_media_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_by: string | null
          review_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reported_by?: string | null
          review_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_by?: string | null
          review_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_votes: {
        Row: {
          created_at: string
          is_helpful: boolean
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_helpful: boolean
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_helpful?: boolean
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_votes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          aspect_ratings: Json
          auto_moderation_labels: string[]
          auto_moderation_score: number | null
          body: string | null
          created_at: string
          device_id: string | null
          edited_at: string | null
          helpful_count: number
          id: string
          is_verified_purchase: boolean
          locale: string | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          not_helpful_count: number
          order_item_id: string | null
          product_id: string
          rating: number
          report_count: number
          seller_id: string | null
          seller_rating: number | null
          seller_responded_at: string | null
          seller_responded_by: string | null
          seller_response: string | null
          status: string
          submitted_from_ip: unknown
          title: string | null
          updated_at: string
          user_id: string
          variant_id: string | null
        }
        Insert: {
          aspect_ratings?: Json
          auto_moderation_labels?: string[]
          auto_moderation_score?: number | null
          body?: string | null
          created_at?: string
          device_id?: string | null
          edited_at?: string | null
          helpful_count?: number
          id?: string
          is_verified_purchase?: boolean
          locale?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          not_helpful_count?: number
          order_item_id?: string | null
          product_id: string
          rating: number
          report_count?: number
          seller_id?: string | null
          seller_rating?: number | null
          seller_responded_at?: string | null
          seller_responded_by?: string | null
          seller_response?: string | null
          status?: string
          submitted_from_ip?: unknown
          title?: string | null
          updated_at?: string
          user_id: string
          variant_id?: string | null
        }
        Update: {
          aspect_ratings?: Json
          auto_moderation_labels?: string[]
          auto_moderation_score?: number | null
          body?: string | null
          created_at?: string
          device_id?: string | null
          edited_at?: string | null
          helpful_count?: number
          id?: string
          is_verified_purchase?: boolean
          locale?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          not_helpful_count?: number
          order_item_id?: string | null
          product_id?: string
          rating?: number
          report_count?: number
          seller_id?: string | null
          seller_rating?: number | null
          seller_responded_at?: string | null
          seller_responded_by?: string | null
          seller_response?: string | null
          status?: string
          submitted_from_ip?: unknown
          title?: string | null
          updated_at?: string
          user_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_for_later: {
        Row: {
          id: string
          listing_id: string
          quantity: number
          saved_at: string
          sku_id: string
          user_id: string
        }
        Insert: {
          id?: string
          listing_id: string
          quantity?: number
          saved_at?: string
          sku_id: string
          user_id: string
        }
        Update: {
          id?: string
          listing_id?: string
          quantity?: number
          saved_at?: string
          sku_id?: string
          user_id?: string
        }
        Relationships: []
      }
      wishlist_items: {
        Row: {
          added_at: string
          id: string
          listing_id: string | null
          note: string | null
          notify_on_back_in_stock: boolean
          notify_on_price_drop: boolean
          price_when_added_paise: number | null
          product_id: string
          variant_id: string | null
          wishlist_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          listing_id?: string | null
          note?: string | null
          notify_on_back_in_stock?: boolean
          notify_on_price_drop?: boolean
          price_when_added_paise?: number | null
          product_id: string
          variant_id?: string | null
          wishlist_id: string
        }
        Update: {
          added_at?: string
          id?: string
          listing_id?: string | null
          note?: string | null
          notify_on_back_in_stock?: boolean
          notify_on_price_drop?: boolean
          price_when_added_paise?: number | null
          product_id?: string
          variant_id?: string | null
          wishlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_wishlist_id_fkey"
            columns: ["wishlist_id"]
            isOneToOne: false
            referencedRelation: "wishlists"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlists: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          is_public: boolean
          items_count: number
          name: string
          share_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          is_public?: boolean
          items_count?: number
          name?: string
          share_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          is_public?: boolean
          items_count?: number
          name?: string
          share_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  finance: {
    Tables: {
      commissions: {
        Row: {
          commission_paise: number
          commission_rate: number | null
          commission_rule_id: string | null
          gst_paise: number
          id: string
          ledger_entry_id: string | null
          order_id: string
          order_item_id: string
          posted_at: string
          reversed_paise: number
          seller_id: string
          taxable_base_paise: number
          total_paise: number
        }
        Insert: {
          commission_paise: number
          commission_rate?: number | null
          commission_rule_id?: string | null
          gst_paise?: number
          id?: string
          ledger_entry_id?: string | null
          order_id: string
          order_item_id: string
          posted_at?: string
          reversed_paise?: number
          seller_id: string
          taxable_base_paise: number
          total_paise: number
        }
        Update: {
          commission_paise?: number
          commission_rate?: number | null
          commission_rule_id?: string | null
          gst_paise?: number
          id?: string
          ledger_entry_id?: string | null
          order_id?: string
          order_item_id?: string
          posted_at?: string
          reversed_paise?: number
          seller_id?: string
          taxable_base_paise?: number
          total_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "commissions_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "seller_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_adjustments: {
        Row: {
          adjustment_type: string
          amount_paise: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          currency: string
          direction: string
          id: string
          ledger_entry_id: string | null
          order_id: string | null
          order_item_id: string | null
          posted_at: string | null
          reason: string
          rejection_reason: string | null
          requested_by: string
          seller_id: string
          status: string
          support_ticket_id: string | null
          supporting_documents: string[]
          updated_at: string
        }
        Insert: {
          adjustment_type: string
          amount_paise: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          currency?: string
          direction: string
          id?: string
          ledger_entry_id?: string | null
          order_id?: string | null
          order_item_id?: string | null
          posted_at?: string | null
          reason: string
          rejection_reason?: string | null
          requested_by: string
          seller_id: string
          status?: string
          support_ticket_id?: string | null
          supporting_documents?: string[]
          updated_at?: string
        }
        Update: {
          adjustment_type?: string
          amount_paise?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          currency?: string
          direction?: string
          id?: string
          ledger_entry_id?: string | null
          order_id?: string | null
          order_item_id?: string | null
          posted_at?: string | null
          reason?: string
          rejection_reason?: string | null
          requested_by?: string
          seller_id?: string
          status?: string
          support_ticket_id?: string | null
          supporting_documents?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_adjustments_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "seller_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_sequences: {
        Row: {
          financial_year: string
          invoice_type: string
          last_number: number
          prefix: string
          seller_id: string
        }
        Insert: {
          financial_year: string
          invoice_type: string
          last_number?: number
          prefix?: string
          seller_id: string
        }
        Update: {
          financial_year?: string
          invoice_type?: string
          last_number?: number
          prefix?: string
          seller_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_in_words: string | null
          buyer_details: Json
          cancellation_reason: string | null
          cess_paise: number
          cgst_paise: number
          created_at: string
          financial_year: string
          id: string
          igst_paise: number
          invoice_date: string
          invoice_number: string
          invoice_type: string
          irn: string | null
          irn_generated_at: string | null
          is_reverse_charge: boolean
          line_items: Json
          order_id: string | null
          order_item_ids: string[]
          original_invoice_id: string | null
          place_of_supply_state_code: string
          qr_code_data: string | null
          seller_details: Json
          seller_id: string
          sgst_paise: number
          shipment_id: string | null
          status: string
          storage_bucket: string
          storage_path: string | null
          taxable_value_paise: number
          total_amount_paise: number
          total_tax_paise: number
          user_id: string | null
        }
        Insert: {
          amount_in_words?: string | null
          buyer_details: Json
          cancellation_reason?: string | null
          cess_paise?: number
          cgst_paise?: number
          created_at?: string
          financial_year: string
          id?: string
          igst_paise?: number
          invoice_date?: string
          invoice_number: string
          invoice_type: string
          irn?: string | null
          irn_generated_at?: string | null
          is_reverse_charge?: boolean
          line_items: Json
          order_id?: string | null
          order_item_ids?: string[]
          original_invoice_id?: string | null
          place_of_supply_state_code: string
          qr_code_data?: string | null
          seller_details: Json
          seller_id: string
          sgst_paise?: number
          shipment_id?: string | null
          status?: string
          storage_bucket?: string
          storage_path?: string | null
          taxable_value_paise: number
          total_amount_paise: number
          total_tax_paise?: number
          user_id?: string | null
        }
        Update: {
          amount_in_words?: string | null
          buyer_details?: Json
          cancellation_reason?: string | null
          cess_paise?: number
          cgst_paise?: number
          created_at?: string
          financial_year?: string
          id?: string
          igst_paise?: number
          invoice_date?: string
          invoice_number?: string
          invoice_type?: string
          irn?: string | null
          irn_generated_at?: string | null
          is_reverse_charge?: boolean
          line_items?: Json
          order_id?: string | null
          order_item_ids?: string[]
          original_invoice_id?: string | null
          place_of_supply_state_code?: string
          qr_code_data?: string | null
          seller_details?: Json
          seller_id?: string
          sgst_paise?: number
          shipment_id?: string | null
          status?: string
          storage_bucket?: string
          storage_path?: string | null
          taxable_value_paise?: number
          total_amount_paise?: number
          total_tax_paise?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_original_invoice_id_fkey"
            columns: ["original_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_fees: {
        Row: {
          amount_paise: number
          description: string | null
          fee_type: string
          gst_paise: number
          id: string
          ledger_entry_id: string | null
          order_id: string | null
          order_item_id: string | null
          posted_at: string
          seller_id: string
          total_paise: number
        }
        Insert: {
          amount_paise: number
          description?: string | null
          fee_type: string
          gst_paise?: number
          id?: string
          ledger_entry_id?: string | null
          order_id?: string | null
          order_item_id?: string | null
          posted_at?: string
          seller_id: string
          total_paise: number
        }
        Update: {
          amount_paise?: number
          description?: string | null
          fee_type?: string
          gst_paise?: number
          id?: string
          ledger_entry_id?: string | null
          order_id?: string | null
          order_item_id?: string | null
          posted_at?: string
          seller_id?: string
          total_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_fees_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "seller_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_ledger: {
        Row: {
          adjustment_id: string | null
          amount_paise: number
          available_for_settlement_on: string
          created_at: string
          created_by: string | null
          currency: string
          description: string
          direction: string
          entry_type: string
          id: string
          idempotency_key: string | null
          order_id: string | null
          order_item_id: string | null
          payout_id: string | null
          posting_date: string
          refund_id: string | null
          return_request_id: string | null
          seller_id: string
          settlement_id: string | null
          settlement_status: string
          shipment_id: string | null
          source_event_id: string | null
          tax_paise: number
        }
        Insert: {
          adjustment_id?: string | null
          amount_paise: number
          available_for_settlement_on?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description: string
          direction: string
          entry_type: string
          id?: string
          idempotency_key?: string | null
          order_id?: string | null
          order_item_id?: string | null
          payout_id?: string | null
          posting_date?: string
          refund_id?: string | null
          return_request_id?: string | null
          seller_id: string
          settlement_id?: string | null
          settlement_status?: string
          shipment_id?: string | null
          source_event_id?: string | null
          tax_paise?: number
        }
        Update: {
          adjustment_id?: string | null
          amount_paise?: number
          available_for_settlement_on?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          direction?: string
          entry_type?: string
          id?: string
          idempotency_key?: string | null
          order_id?: string | null
          order_item_id?: string | null
          payout_id?: string | null
          posting_date?: string
          refund_id?: string | null
          return_request_id?: string | null
          seller_id?: string
          settlement_id?: string | null
          settlement_status?: string
          shipment_id?: string | null
          source_event_id?: string | null
          tax_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "seller_ledger_adjustment_fk"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "financial_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_ledger_payout_fk"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "seller_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_ledger_settlement_fk"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "seller_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_payouts: {
        Row: {
          amount_paise: number
          bank_account_id: string
          created_at: string
          currency: string
          failure_code: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          initiated_at: string | null
          initiated_by: string | null
          paid_at: string | null
          payout_mode: string | null
          payout_reference: string
          provider: string
          provider_payout_id: string | null
          retry_count: number
          seller_id: string
          settlement_id: string | null
          status: string
          updated_at: string
          utr_number: string | null
        }
        Insert: {
          amount_paise: number
          bank_account_id: string
          created_at?: string
          currency?: string
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          initiated_at?: string | null
          initiated_by?: string | null
          paid_at?: string | null
          payout_mode?: string | null
          payout_reference: string
          provider?: string
          provider_payout_id?: string | null
          retry_count?: number
          seller_id: string
          settlement_id?: string | null
          status?: string
          updated_at?: string
          utr_number?: string | null
        }
        Update: {
          amount_paise?: number
          bank_account_id?: string
          created_at?: string
          currency?: string
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          initiated_at?: string | null
          initiated_by?: string | null
          paid_at?: string | null
          payout_mode?: string | null
          payout_reference?: string
          provider?: string
          provider_payout_id?: string | null
          retry_count?: number
          seller_id?: string
          settlement_id?: string | null
          status?: string
          updated_at?: string
          utr_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_payouts_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "seller_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_settlements: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          currency: string
          entry_count: number
          generated_at: string
          gross_sales_paise: number
          hold_reason: string | null
          id: string
          net_payable_paise: number
          paid_at: string | null
          period_end: string
          period_start: string
          seller_id: string
          settlement_cycle: string
          settlement_reference: string
          statement_storage_path: string | null
          status: string
          tcs_paise: number
          tds_paise: number
          total_adjustments_paise: number
          total_commission_paise: number
          total_fees_paise: number
          total_penalties_paise: number
          total_refunds_paise: number
          total_tax_paise: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          currency?: string
          entry_count?: number
          generated_at?: string
          gross_sales_paise?: number
          hold_reason?: string | null
          id?: string
          net_payable_paise?: number
          paid_at?: string | null
          period_end: string
          period_start: string
          seller_id: string
          settlement_cycle: string
          settlement_reference: string
          statement_storage_path?: string | null
          status?: string
          tcs_paise?: number
          tds_paise?: number
          total_adjustments_paise?: number
          total_commission_paise?: number
          total_fees_paise?: number
          total_penalties_paise?: number
          total_refunds_paise?: number
          total_tax_paise?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          currency?: string
          entry_count?: number
          generated_at?: string
          gross_sales_paise?: number
          hold_reason?: string | null
          id?: string
          net_payable_paise?: number
          paid_at?: string | null
          period_end?: string
          period_start?: string
          seller_id?: string
          settlement_cycle?: string
          settlement_reference?: string
          statement_storage_path?: string | null
          status?: string
          tcs_paise?: number
          tds_paise?: number
          total_adjustments_paise?: number
          total_commission_paise?: number
          total_fees_paise?: number
          total_penalties_paise?: number
          total_refunds_paise?: number
          total_tax_paise?: number
          updated_at?: string
        }
        Relationships: []
      }
      settlement_items: {
        Row: {
          amount_paise: number
          created_at: string
          id: string
          ledger_entry_id: string
          settlement_id: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          id?: string
          ledger_entry_id: string
          settlement_id: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          id?: string
          ledger_entry_id?: string
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_items_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: true
            referencedRelation: "seller_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "seller_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      mark_ledger_settled: {
        Args: { p_entry_ids: string[]; p_settlement_id: string }
        Returns: number
      }
      next_invoice_number: {
        Args: {
          p_financial_year: string
          p_invoice_type?: string
          p_seller_id: string
        }
        Returns: string
      }
      post_order_item_earnings: {
        Args: { p_hold_days?: number; p_order_item_id: string }
        Returns: number
      }
      seller_balance: {
        Args: { p_seller_id: string }
        Returns: {
          net_balance_paise: unknown
          on_hold_paise: unknown
          settleable_now_paise: unknown
          total_credits_paise: unknown
          total_debits_paise: unknown
          unsettled_paise: unknown
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  fulfillment: {
    Tables: {
      carrier_rate_cards: {
        Row: {
          carrier_id: string
          cod_fee_paise: number
          cod_fee_percentage: number
          created_at: string
          direction: string
          effective_from: string
          effective_to: string | null
          fuel_surcharge_percentage: number
          gst_rate: number
          id: string
          insurance_percentage: number
          is_active: boolean
          name: string
          shipment_mode: string
          updated_at: string
        }
        Insert: {
          carrier_id: string
          cod_fee_paise?: number
          cod_fee_percentage?: number
          created_at?: string
          direction?: string
          effective_from?: string
          effective_to?: string | null
          fuel_surcharge_percentage?: number
          gst_rate?: number
          id?: string
          insurance_percentage?: number
          is_active?: boolean
          name: string
          shipment_mode?: string
          updated_at?: string
        }
        Update: {
          carrier_id?: string
          cod_fee_paise?: number
          cod_fee_percentage?: number
          created_at?: string
          direction?: string
          effective_from?: string
          effective_to?: string | null
          fuel_surcharge_percentage?: number
          gst_rate?: number
          id?: string
          insurance_percentage?: number
          is_active?: boolean
          name?: string
          shipment_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carrier_rate_cards_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_rate_slabs: {
        Row: {
          additional_charge_paise: number
          additional_step_grams: number
          base_charge_paise: number
          base_weight_grams: number
          id: string
          min_charge_paise: number
          rate_card_id: string
          zone_code: string
        }
        Insert: {
          additional_charge_paise: number
          additional_step_grams: number
          base_charge_paise: number
          base_weight_grams: number
          id?: string
          min_charge_paise?: number
          rate_card_id: string
          zone_code: string
        }
        Update: {
          additional_charge_paise?: number
          additional_step_grams?: number
          base_charge_paise?: number
          base_weight_grams?: number
          id?: string
          min_charge_paise?: number
          rate_card_id?: string
          zone_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "carrier_rate_slabs_rate_card_id_fkey"
            columns: ["rate_card_id"]
            isOneToOne: false
            referencedRelation: "carrier_rate_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_rate_slabs_zone_code_fkey"
            columns: ["zone_code"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["code"]
          },
        ]
      }
      carrier_serviceability: {
        Row: {
          carrier_id: string
          cod_available: boolean
          cod_limit_paise: number | null
          id: string
          is_oda: boolean
          oda_surcharge_paise: number
          pincode: string
          prepaid_available: boolean
          reverse_available: boolean
          sla_days: number
          synced_at: string
        }
        Insert: {
          carrier_id: string
          cod_available?: boolean
          cod_limit_paise?: number | null
          id?: string
          is_oda?: boolean
          oda_surcharge_paise?: number
          pincode: string
          prepaid_available?: boolean
          reverse_available?: boolean
          sla_days: number
          synced_at?: string
        }
        Update: {
          carrier_id?: string
          cod_available?: boolean
          cod_limit_paise?: number | null
          id?: string
          is_oda?: boolean
          oda_surcharge_paise?: number
          pincode?: string
          prepaid_available?: boolean
          reverse_available?: boolean
          sla_days?: number
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carrier_serviceability_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_serviceability_pincode_fkey"
            columns: ["pincode"]
            isOneToOne: false
            referencedRelation: "pincodes"
            referencedColumns: ["pincode"]
          },
        ]
      }
      carriers: {
        Row: {
          average_delivery_days: number | null
          code: string
          created_at: string
          id: string
          integration_type: string
          is_active: boolean
          logo_url: string | null
          max_declared_value_paise: number | null
          max_weight_grams: number | null
          name: string
          ndr_rate: number | null
          on_time_rate: number | null
          parent_carrier_id: string | null
          rto_rate: number | null
          selection_priority: number
          supports_cod: boolean
          supports_hazmat: boolean
          supports_multi_piece: boolean
          supports_prepaid: boolean
          supports_qc_at_pickup: boolean
          supports_reverse: boolean
          tracking_url_template: string | null
          updated_at: string
          volumetric_divisor: number
        }
        Insert: {
          average_delivery_days?: number | null
          code: string
          created_at?: string
          id?: string
          integration_type?: string
          is_active?: boolean
          logo_url?: string | null
          max_declared_value_paise?: number | null
          max_weight_grams?: number | null
          name: string
          ndr_rate?: number | null
          on_time_rate?: number | null
          parent_carrier_id?: string | null
          rto_rate?: number | null
          selection_priority?: number
          supports_cod?: boolean
          supports_hazmat?: boolean
          supports_multi_piece?: boolean
          supports_prepaid?: boolean
          supports_qc_at_pickup?: boolean
          supports_reverse?: boolean
          tracking_url_template?: string | null
          updated_at?: string
          volumetric_divisor?: number
        }
        Update: {
          average_delivery_days?: number | null
          code?: string
          created_at?: string
          id?: string
          integration_type?: string
          is_active?: boolean
          logo_url?: string | null
          max_declared_value_paise?: number | null
          max_weight_grams?: number | null
          name?: string
          ndr_rate?: number | null
          on_time_rate?: number | null
          parent_carrier_id?: string | null
          rto_rate?: number | null
          selection_priority?: number
          supports_cod?: boolean
          supports_hazmat?: boolean
          supports_multi_piece?: boolean
          supports_prepaid?: boolean
          supports_qc_at_pickup?: boolean
          supports_reverse?: boolean
          tracking_url_template?: string | null
          updated_at?: string
          volumetric_divisor?: number
        }
        Relationships: [
          {
            foreignKeyName: "carriers_parent_carrier_id_fkey"
            columns: ["parent_carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          created_at: string
          district_id: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          name_hi: string | null
          state_code: string
          tier: string
        }
        Insert: {
          created_at?: string
          district_id: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          name_hi?: string | null
          state_code: string
          tier?: string
        }
        Update: {
          created_at?: string
          district_id?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          name_hi?: string | null
          state_code?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "cities_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cities_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["code"]
          },
        ]
      }
      cod_remittance_items: {
        Row: {
          created_at: string
          expected_paise: number
          id: string
          match_status: string
          notes: string | null
          order_id: string
          received_paise: number
          remittance_id: string
          shipment_id: string
        }
        Insert: {
          created_at?: string
          expected_paise: number
          id?: string
          match_status?: string
          notes?: string | null
          order_id: string
          received_paise?: number
          remittance_id: string
          shipment_id: string
        }
        Update: {
          created_at?: string
          expected_paise?: number
          id?: string
          match_status?: string
          notes?: string | null
          order_id?: string
          received_paise?: number
          remittance_id?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cod_remittance_items_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "cod_remittances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cod_remittance_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      cod_remittances: {
        Row: {
          bank_reference: string | null
          carrier_id: string | null
          collection_date: string
          created_at: string
          delivery_agent_id: string | null
          expected_amount_paise: number
          id: string
          notes: string | null
          received_amount_paise: number
          received_at: string | null
          reconciled_at: string | null
          reconciled_by: string | null
          remittance_reference: string
          shipment_count: number
          source_type: string
          status: string
          updated_at: string
          variance_paise: number | null
        }
        Insert: {
          bank_reference?: string | null
          carrier_id?: string | null
          collection_date: string
          created_at?: string
          delivery_agent_id?: string | null
          expected_amount_paise: number
          id?: string
          notes?: string | null
          received_amount_paise?: number
          received_at?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          remittance_reference: string
          shipment_count?: number
          source_type: string
          status?: string
          updated_at?: string
          variance_paise?: number | null
        }
        Update: {
          bank_reference?: string | null
          carrier_id?: string | null
          collection_date?: string
          created_at?: string
          delivery_agent_id?: string | null
          expected_amount_paise?: number
          id?: string
          notes?: string | null
          received_amount_paise?: number
          received_at?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          remittance_reference?: string
          shipment_count?: number
          source_type?: string
          status?: string
          updated_at?: string
          variance_paise?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cod_remittances_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_agent_shifts: {
        Row: {
          cod_collected_paise: number
          cod_deposited_paise: number
          created_at: string
          delivery_agent_id: string
          distance_km: number | null
          earnings_paise: number
          ended_at: string | null
          id: string
          shift_date: string
          shipments_assigned: number
          shipments_delivered: number
          shipments_failed: number
          started_at: string | null
          status: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          cod_collected_paise?: number
          cod_deposited_paise?: number
          created_at?: string
          delivery_agent_id: string
          distance_km?: number | null
          earnings_paise?: number
          ended_at?: string | null
          id?: string
          shift_date: string
          shipments_assigned?: number
          shipments_delivered?: number
          shipments_failed?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          cod_collected_paise?: number
          cod_deposited_paise?: number
          created_at?: string
          delivery_agent_id?: string
          distance_km?: number | null
          earnings_paise?: number
          ended_at?: string | null
          id?: string
          shift_date?: string
          shipments_assigned?: number
          shipments_delivered?: number
          shipments_failed?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: []
      }
      delivery_attempts: {
        Row: {
          agent_name: string | null
          agent_phone_masked: string | null
          attempt_number: number
          attempted_at: string
          delivery_agent_id: string | null
          failure_reason: string | null
          id: string
          location_latitude: number | null
          location_longitude: number | null
          next_attempt_date: string | null
          outcome: string
          shipment_id: string
        }
        Insert: {
          agent_name?: string | null
          agent_phone_masked?: string | null
          attempt_number: number
          attempted_at?: string
          delivery_agent_id?: string | null
          failure_reason?: string | null
          id?: string
          location_latitude?: number | null
          location_longitude?: number | null
          next_attempt_date?: string | null
          outcome: string
          shipment_id: string
        }
        Update: {
          agent_name?: string | null
          agent_phone_masked?: string | null
          attempt_number?: number
          attempted_at?: string
          delivery_agent_id?: string | null
          failure_reason?: string | null
          id?: string
          location_latitude?: number | null
          location_longitude?: number | null
          next_attempt_date?: string | null
          outcome?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_attempts_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_otp_challenges: {
        Row: {
          attempt_count: number
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          otp_hash: string
          requested_by: string
          shipment_id: string
        }
        Insert: {
          attempt_count?: number
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          otp_hash: string
          requested_by: string
          shipment_id: string
        }
        Update: {
          attempt_count?: number
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          otp_hash?: string
          requested_by?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_otp_challenges_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_proofs: {
        Row: {
          captured_at: string
          delivered_by: string | null
          distance_from_address_metres: number | null
          id: string
          latitude: number | null
          longitude: number | null
          otp_hash: string | null
          otp_verified_at: string | null
          photo_storage_path: string | null
          proof_type: string
          recipient_name: string | null
          relationship: string | null
          shipment_id: string
          signature_storage_path: string | null
          storage_bucket: string | null
        }
        Insert: {
          captured_at?: string
          delivered_by?: string | null
          distance_from_address_metres?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          otp_hash?: string | null
          otp_verified_at?: string | null
          photo_storage_path?: string | null
          proof_type: string
          recipient_name?: string | null
          relationship?: string | null
          shipment_id: string
          signature_storage_path?: string | null
          storage_bucket?: string | null
        }
        Update: {
          captured_at?: string
          delivered_by?: string | null
          distance_from_address_metres?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          otp_hash?: string | null
          otp_verified_at?: string | null
          photo_storage_path?: string | null
          proof_type?: string
          recipient_name?: string | null
          relationship?: string | null
          shipment_id?: string
          signature_storage_path?: string | null
          storage_bucket?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_proofs_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: true
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          code: string
          default_sla_days: number
          description: string
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          default_sla_days: number
          description: string
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          default_sla_days?: number
          description?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      districts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          name_hi: string | null
          state_code: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          name_hi?: string | null
          state_code: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          name_hi?: string | null
          state_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "districts_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["code"]
          },
        ]
      }
      ndr_actions: {
        Row: {
          action: string
          carrier_ack_status: string | null
          carrier_response: Json | null
          created_at: string
          delivery_attempt_id: string | null
          id: string
          new_address: Json | null
          new_phone_masked: string | null
          notes: string | null
          requested_by: string | null
          requested_by_type: string
          reschedule_date: string | null
          shipment_id: string
        }
        Insert: {
          action: string
          carrier_ack_status?: string | null
          carrier_response?: Json | null
          created_at?: string
          delivery_attempt_id?: string | null
          id?: string
          new_address?: Json | null
          new_phone_masked?: string | null
          notes?: string | null
          requested_by?: string | null
          requested_by_type?: string
          reschedule_date?: string | null
          shipment_id: string
        }
        Update: {
          action?: string
          carrier_ack_status?: string | null
          carrier_response?: Json | null
          created_at?: string
          delivery_attempt_id?: string | null
          id?: string
          new_address?: Json | null
          new_phone_masked?: string | null
          notes?: string | null
          requested_by?: string | null
          requested_by_type?: string
          reschedule_date?: string | null
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ndr_actions_delivery_attempt_id_fkey"
            columns: ["delivery_attempt_id"]
            isOneToOne: false
            referencedRelation: "delivery_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ndr_actions_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      pincodes: {
        Row: {
          city_id: string
          cod_available: boolean
          cod_limit_paise: number | null
          created_at: string
          default_sla_days: number
          district_id: string
          is_oda: boolean
          is_serviceable: boolean
          latitude: number | null
          locality: string | null
          longitude: number | null
          pincode: string
          prepaid_available: boolean
          remarks: string | null
          reverse_pickup_available: boolean
          state_code: string
          suspended_until: string | null
          updated_at: string
          zone_code: string
        }
        Insert: {
          city_id: string
          cod_available?: boolean
          cod_limit_paise?: number | null
          created_at?: string
          default_sla_days?: number
          district_id: string
          is_oda?: boolean
          is_serviceable?: boolean
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          pincode: string
          prepaid_available?: boolean
          remarks?: string | null
          reverse_pickup_available?: boolean
          state_code: string
          suspended_until?: string | null
          updated_at?: string
          zone_code: string
        }
        Update: {
          city_id?: string
          cod_available?: boolean
          cod_limit_paise?: number | null
          created_at?: string
          default_sla_days?: number
          district_id?: string
          is_oda?: boolean
          is_serviceable?: boolean
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          pincode?: string
          prepaid_available?: boolean
          remarks?: string | null
          reverse_pickup_available?: boolean
          state_code?: string
          suspended_until?: string | null
          updated_at?: string
          zone_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "pincodes_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pincodes_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pincodes_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "pincodes_zone_code_fkey"
            columns: ["zone_code"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["code"]
          },
        ]
      }
      shipment_items: {
        Row: {
          created_at: string
          id: string
          order_item_id: string
          quantity: number
          serial_numbers: string[]
          shipment_id: string
          sku_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_item_id: string
          quantity: number
          serial_numbers?: string[]
          shipment_id: string
          sku_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_item_id?: string
          quantity?: number
          serial_numbers?: string[]
          shipment_id?: string
          sku_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_packages: {
        Row: {
          created_at: string
          height_mm: number | null
          id: string
          length_mm: number | null
          package_barcode: string | null
          package_number: number
          packaging_type: string | null
          packed_at: string | null
          packed_by: string | null
          shipment_id: string
          weight_grams: number | null
          width_mm: number | null
        }
        Insert: {
          created_at?: string
          height_mm?: number | null
          id?: string
          length_mm?: number | null
          package_barcode?: string | null
          package_number: number
          packaging_type?: string | null
          packed_at?: string | null
          packed_by?: string | null
          shipment_id: string
          weight_grams?: number | null
          width_mm?: number | null
        }
        Update: {
          created_at?: string
          height_mm?: number | null
          id?: string
          length_mm?: number | null
          package_barcode?: string | null
          package_number?: number
          packaging_type?: string | null
          packed_at?: string | null
          packed_by?: string | null
          shipment_id?: string
          weight_grams?: number | null
          width_mm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_packages_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          actual_freight_paise: number | null
          actual_weight_grams: number | null
          awb_number: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          carrier_id: string | null
          chargeable_weight_grams: number | null
          cod_amount_paise: number
          created_at: string
          declared_value_paise: number
          delivered_at: string | null
          delivery_address: Json
          delivery_agent_id: string | null
          delivery_attempt_count: number
          delivery_pincode: string
          direction: string
          estimated_delivery_date: string | null
          estimated_freight_paise: number | null
          freight_variance_paise: number | null
          id: string
          idempotency_key: string | null
          is_cod: boolean
          order_id: string
          picked_up_at: string | null
          pickup_address: Json
          pickup_pincode: string
          pickup_scheduled_at: string | null
          promised_delivery_date: string | null
          provider_order_id: string | null
          provider_shipment_id: string | null
          seller_id: string
          shipment_mode: string
          shipment_reference: string
          status: string
          updated_at: string
          volumetric_weight_grams: number | null
          warehouse_id: string
          zone_code: string | null
        }
        Insert: {
          actual_freight_paise?: number | null
          actual_weight_grams?: number | null
          awb_number?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          carrier_id?: string | null
          chargeable_weight_grams?: number | null
          cod_amount_paise?: number
          created_at?: string
          declared_value_paise?: number
          delivered_at?: string | null
          delivery_address: Json
          delivery_agent_id?: string | null
          delivery_attempt_count?: number
          delivery_pincode: string
          direction?: string
          estimated_delivery_date?: string | null
          estimated_freight_paise?: number | null
          freight_variance_paise?: number | null
          id?: string
          idempotency_key?: string | null
          is_cod?: boolean
          order_id: string
          picked_up_at?: string | null
          pickup_address: Json
          pickup_pincode: string
          pickup_scheduled_at?: string | null
          promised_delivery_date?: string | null
          provider_order_id?: string | null
          provider_shipment_id?: string | null
          seller_id: string
          shipment_mode?: string
          shipment_reference: string
          status?: string
          updated_at?: string
          volumetric_weight_grams?: number | null
          warehouse_id: string
          zone_code?: string | null
        }
        Update: {
          actual_freight_paise?: number | null
          actual_weight_grams?: number | null
          awb_number?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          carrier_id?: string | null
          chargeable_weight_grams?: number | null
          cod_amount_paise?: number
          created_at?: string
          declared_value_paise?: number
          delivered_at?: string | null
          delivery_address?: Json
          delivery_agent_id?: string | null
          delivery_attempt_count?: number
          delivery_pincode?: string
          direction?: string
          estimated_delivery_date?: string | null
          estimated_freight_paise?: number | null
          freight_variance_paise?: number | null
          id?: string
          idempotency_key?: string | null
          is_cod?: boolean
          order_id?: string
          picked_up_at?: string | null
          pickup_address?: Json
          pickup_pincode?: string
          pickup_scheduled_at?: string | null
          promised_delivery_date?: string | null
          provider_order_id?: string | null
          provider_shipment_id?: string | null
          seller_id?: string
          shipment_mode?: string
          shipment_reference?: string
          status?: string
          updated_at?: string
          volumetric_weight_grams?: number | null
          warehouse_id?: string
          zone_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_delivery_pincode_fkey"
            columns: ["delivery_pincode"]
            isOneToOne: false
            referencedRelation: "pincodes"
            referencedColumns: ["pincode"]
          },
          {
            foreignKeyName: "shipments_pickup_pincode_fkey"
            columns: ["pickup_pincode"]
            isOneToOne: false
            referencedRelation: "pincodes"
            referencedColumns: ["pincode"]
          },
          {
            foreignKeyName: "shipments_zone_code_fkey"
            columns: ["zone_code"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["code"]
          },
        ]
      }
      shipping_labels: {
        Row: {
          awb_number: string | null
          generated_at: string
          id: string
          is_current: boolean
          label_format: string
          shipment_id: string
          storage_bucket: string
          storage_path: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          awb_number?: string | null
          generated_at?: string
          id?: string
          is_current?: boolean
          label_format?: string
          shipment_id: string
          storage_bucket?: string
          storage_path: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          awb_number?: string | null
          generated_at?: string
          id?: string
          is_current?: boolean
          label_format?: string
          shipment_id?: string
          storage_bucket?: string
          storage_path?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipping_labels_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      states: {
        Row: {
          code: string
          created_at: string
          gst_state_code: string
          is_active: boolean
          is_union_territory: boolean
          name: string
          name_hi: string | null
          region: string
        }
        Insert: {
          code: string
          created_at?: string
          gst_state_code: string
          is_active?: boolean
          is_union_territory?: boolean
          name: string
          name_hi?: string | null
          region: string
        }
        Update: {
          code?: string
          created_at?: string
          gst_state_code?: string
          is_active?: boolean
          is_union_territory?: boolean
          name?: string
          name_hi?: string | null
          region?: string
        }
        Relationships: []
      }
      tracking_events: {
        Row: {
          carrier_status_code: string | null
          description: string
          id: string
          location: string | null
          location_pincode: string | null
          normalised_status: string
          occurred_at: string
          provider_event_id: string | null
          raw_payload: Json
          received_at: string
          shipment_id: string
          was_applied: boolean
        }
        Insert: {
          carrier_status_code?: string | null
          description: string
          id?: string
          location?: string | null
          location_pincode?: string | null
          normalised_status: string
          occurred_at: string
          provider_event_id?: string | null
          raw_payload?: Json
          received_at?: string
          shipment_id: string
          was_applied?: boolean
        }
        Update: {
          carrier_status_code?: string | null
          description?: string
          id?: string
          location?: string | null
          location_pincode?: string | null
          normalised_status?: string
          occurred_at?: string
          provider_event_id?: string | null
          raw_payload?: Json
          received_at?: string
          shipment_id?: string
          was_applied?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_delivery_promise: {
        Args: {
          p_as_of?: string
          p_handling_days?: number
          p_is_cod?: boolean
          p_pincode: unknown
          p_warehouse_id: string
        }
        Returns: {
          block_reason: string
          carrier_id: string
          cutoff_missed: boolean
          is_serviceable: boolean
          promised_date: string
          transit_days: number
          zone_code: string
        }[]
      }
      calculate_shipping_charge: {
        Args: {
          p_chargeable_weight_grams: number
          p_declared_value_paise?: unknown
          p_is_cod?: boolean
          p_rate_card_id: string
          p_zone_code: string
        }
        Returns: {
          base_paise: unknown
          cod_fee_paise: unknown
          fuel_paise: unknown
          gst_paise: unknown
          insurance_paise: unknown
          total_paise: unknown
          weight_paise: unknown
        }[]
      }
      is_intra_state_supply: {
        Args: { p_customer_state_code: string; p_seller_state_code: string }
        Returns: boolean
      }
      resolve_zone: {
        Args: { p_destination_pincode: unknown; p_origin_pincode: unknown }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  identity: {
    Tables: {
      addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          alternate_phone: string | null
          city: string
          country_code: string
          created_at: string
          deleted_at: string | null
          delivery_failure_count: number
          delivery_instructions: string | null
          delivery_success_count: number
          district: string | null
          id: string
          is_default: boolean
          is_verified: boolean
          label: string
          landmark: string | null
          latitude: number | null
          locality: string | null
          longitude: number | null
          pincode: string
          recipient_name: string
          recipient_phone: string
          state_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          alternate_phone?: string | null
          city: string
          country_code?: string
          created_at?: string
          deleted_at?: string | null
          delivery_failure_count?: number
          delivery_instructions?: string | null
          delivery_success_count?: number
          district?: string | null
          id?: string
          is_default?: boolean
          is_verified?: boolean
          label?: string
          landmark?: string | null
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          pincode: string
          recipient_name: string
          recipient_phone: string
          state_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          alternate_phone?: string | null
          city?: string
          country_code?: string
          created_at?: string
          deleted_at?: string | null
          delivery_failure_count?: number
          delivery_instructions?: string | null
          delivery_success_count?: number
          district?: string | null
          id?: string
          is_default?: boolean
          is_verified?: boolean
          label?: string
          landmark?: string | null
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          pincode?: string
          recipient_name?: string
          recipient_phone?: string
          state_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          code: string
          created_at: string
          description: string
          id: string
          is_sensitive: boolean
          requires_mfa: boolean
          requires_reason: boolean
          resource: string
        }
        Insert: {
          action: string
          code: string
          created_at?: string
          description: string
          id?: string
          is_sensitive?: boolean
          requires_mfa?: boolean
          requires_reason?: boolean
          resource: string
        }
        Update: {
          action?: string
          code?: string
          created_at?: string
          description?: string
          id?: string
          is_sensitive?: boolean
          requires_mfa?: boolean
          requires_reason?: boolean
          resource?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string
          anonymised_at: string | null
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          deletion_requested_at: string | null
          display_name: string | null
          email: string | null
          email_verified_at: string | null
          first_order_at: string | null
          full_name: string | null
          gender: string | null
          id: string
          last_order_at: string | null
          lifetime_gmv_paise: number
          lifetime_order_count: number
          phone: string | null
          phone_verified_at: string | null
          preferred_locale: string
          referral_code: string | null
          referred_by: string | null
          risk_tier: string
          status_changed_at: string | null
          status_changed_by: string | null
          status_reason: string | null
          updated_at: string
        }
        Insert: {
          account_status?: string
          anonymised_at?: string | null
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          deletion_requested_at?: string | null
          display_name?: string | null
          email?: string | null
          email_verified_at?: string | null
          first_order_at?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          last_order_at?: string | null
          lifetime_gmv_paise?: number
          lifetime_order_count?: number
          phone?: string | null
          phone_verified_at?: string | null
          preferred_locale?: string
          referral_code?: string | null
          referred_by?: string | null
          risk_tier?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: string
          anonymised_at?: string | null
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          deletion_requested_at?: string | null
          display_name?: string | null
          email?: string | null
          email_verified_at?: string | null
          first_order_at?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          last_order_at?: string | null
          lifetime_gmv_paise?: number
          lifetime_order_count?: number
          phone?: string | null
          phone_verified_at?: string | null
          preferred_locale?: string
          referral_code?: string | null
          referred_by?: string | null
          risk_tier?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_scopes: {
        Row: {
          created_at: string
          display_name: string
          is_active: boolean
          scope_id: string
          scope_type: string
        }
        Insert: {
          created_at?: string
          display_name: string
          is_active?: boolean
          scope_id: string
          scope_type: string
        }
        Update: {
          created_at?: string
          display_name?: string
          is_active?: boolean
          scope_id?: string
          scope_type?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          granted_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          granted_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          granted_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
          is_privileged: boolean
          is_system: boolean
          kind: string
          name: string
          rank: number
          required_scope_type: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          id?: string
          is_privileged?: boolean
          is_system?: boolean
          kind: string
          name: string
          rank?: number
          required_scope_type?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
          is_privileged?: boolean
          is_system?: boolean
          kind?: string
          name?: string
          rank?: number
          required_scope_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_devices: {
        Row: {
          app: string
          app_version: string | null
          biometric_enabled: boolean
          created_at: string
          device_identifier: string
          device_model: string | null
          device_name: string | null
          id: string
          is_emulator: boolean
          is_rooted: boolean
          is_trusted: boolean
          last_ip: unknown
          last_seen_at: string
          os_version: string | null
          platform: string
          push_enabled: boolean
          push_provider: string | null
          push_token: string | null
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          app: string
          app_version?: string | null
          biometric_enabled?: boolean
          created_at?: string
          device_identifier: string
          device_model?: string | null
          device_name?: string | null
          id?: string
          is_emulator?: boolean
          is_rooted?: boolean
          is_trusted?: boolean
          last_ip?: unknown
          last_seen_at?: string
          os_version?: string | null
          platform: string
          push_enabled?: boolean
          push_provider?: string | null
          push_token?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          app?: string
          app_version?: string | null
          biometric_enabled?: boolean
          created_at?: string
          device_identifier?: string
          device_model?: string | null
          device_name?: string | null
          id?: string
          is_emulator?: boolean
          is_rooted?: boolean
          is_trusted?: boolean
          last_ip?: unknown
          last_seen_at?: string
          os_version?: string | null
          platform?: string
          push_enabled?: boolean
          push_provider?: string | null
          push_token?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          currency: string
          default_pincode: string | null
          email_marketing: boolean
          email_transactional: boolean
          notification_topics: Json
          personalised_ads: boolean
          personalised_recommendations: boolean
          preferred_language: string
          push_marketing: boolean
          push_transactional: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          save_search_history: boolean
          sms_marketing: boolean
          sms_transactional: boolean
          updated_at: string
          user_id: string
          whatsapp_marketing: boolean
          whatsapp_transactional: boolean
        }
        Insert: {
          created_at?: string
          currency?: string
          default_pincode?: string | null
          email_marketing?: boolean
          email_transactional?: boolean
          notification_topics?: Json
          personalised_ads?: boolean
          personalised_recommendations?: boolean
          preferred_language?: string
          push_marketing?: boolean
          push_transactional?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          save_search_history?: boolean
          sms_marketing?: boolean
          sms_transactional?: boolean
          updated_at?: string
          user_id: string
          whatsapp_marketing?: boolean
          whatsapp_transactional?: boolean
        }
        Update: {
          created_at?: string
          currency?: string
          default_pincode?: string | null
          email_marketing?: boolean
          email_transactional?: boolean
          notification_topics?: Json
          personalised_ads?: boolean
          personalised_recommendations?: boolean
          preferred_language?: string
          push_marketing?: boolean
          push_transactional?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          save_search_history?: boolean
          sms_marketing?: boolean
          sms_transactional?: boolean
          updated_at?: string
          user_id?: string
          whatsapp_marketing?: boolean
          whatsapp_transactional?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          expires_at: string | null
          grant_reason: string | null
          granted_by: string | null
          id: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          role_id: string
          scope_id: string | null
          scope_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          grant_reason?: string | null
          granted_by?: string | null
          id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role_id: string
          scope_id?: string | null
          scope_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          grant_reason?: string | null
          granted_by?: string | null
          id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role_id?: string
          scope_id?: string | null
          scope_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_id: { Args: never; Returns: string }
      effective_permissions: { Args: { p_user_id: string }; Returns: string[] }
      has_permission: { Args: { p_permission: string }; Returns: boolean }
      has_role: { Args: { p_role_code: string }; Returns: boolean }
      has_scoped_permission: {
        Args: { p_permission: string; p_scope_id: string; p_scope_type: string }
        Returns: boolean
      }
      has_seller_scope: { Args: { p_seller_id: string }; Returns: boolean }
      has_warehouse_scope: {
        Args: { p_warehouse_id: string }
        Returns: boolean
      }
      is_account_active: { Args: { p_user_id?: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      max_role_rank: { Args: { p_user_id: string }; Returns: number }
      my_seller_ids: { Args: never; Returns: string[] }
      my_warehouse_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  inventory: {
    Tables: {
      inventory_adjustments: {
        Row: {
          adjustment_type: string
          applied_at: string | null
          approved_at: string | null
          approved_by: string | null
          cost_impact_paise: number | null
          created_at: string
          evidence_urls: string[]
          id: string
          idempotency_key: string | null
          quantity_after: number | null
          quantity_before: number
          quantity_delta: number
          reason: string
          rejection_reason: string | null
          requested_by: string
          seller_id: string
          sku_id: string
          status: string
          target_bucket: string
          updated_at: string
          warehouse_id: string
          warehouse_inventory_id: string
        }
        Insert: {
          adjustment_type: string
          applied_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          cost_impact_paise?: number | null
          created_at?: string
          evidence_urls?: string[]
          id?: string
          idempotency_key?: string | null
          quantity_after?: number | null
          quantity_before: number
          quantity_delta: number
          reason: string
          rejection_reason?: string | null
          requested_by: string
          seller_id: string
          sku_id: string
          status?: string
          target_bucket?: string
          updated_at?: string
          warehouse_id: string
          warehouse_inventory_id: string
        }
        Update: {
          adjustment_type?: string
          applied_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          cost_impact_paise?: number | null
          created_at?: string
          evidence_urls?: string[]
          id?: string
          idempotency_key?: string | null
          quantity_after?: number | null
          quantity_before?: number
          quantity_delta?: number
          reason?: string
          rejection_reason?: string | null
          requested_by?: string
          seller_id?: string
          sku_id?: string
          status?: string
          target_bucket?: string
          updated_at?: string
          warehouse_id?: string
          warehouse_inventory_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_warehouse_inventory_id_fkey"
            columns: ["warehouse_inventory_id"]
            isOneToOne: false
            referencedRelation: "warehouse_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_ledger: {
        Row: {
          actor_id: string | null
          actor_type: string
          adjustment_id: string | null
          available_after: number
          available_delta: number
          blocked_delta: number
          damaged_after: number
          damaged_delta: number
          id: string
          in_transit_after: number
          in_transit_delta: number
          movement_type: string
          occurred_at: string
          order_id: string | null
          order_item_id: string | null
          reason: string | null
          reference: string | null
          request_id: string | null
          reservation_id: string | null
          reserved_after: number
          reserved_delta: number
          return_request_id: string | null
          seller_id: string
          shipment_id: string | null
          sku_id: string
          trace_id: string | null
          transfer_id: string | null
          warehouse_id: string
          warehouse_inventory_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          adjustment_id?: string | null
          available_after: number
          available_delta?: number
          blocked_delta?: number
          damaged_after: number
          damaged_delta?: number
          id?: string
          in_transit_after: number
          in_transit_delta?: number
          movement_type: string
          occurred_at?: string
          order_id?: string | null
          order_item_id?: string | null
          reason?: string | null
          reference?: string | null
          request_id?: string | null
          reservation_id?: string | null
          reserved_after: number
          reserved_delta?: number
          return_request_id?: string | null
          seller_id: string
          shipment_id?: string | null
          sku_id: string
          trace_id?: string | null
          transfer_id?: string | null
          warehouse_id: string
          warehouse_inventory_id: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          adjustment_id?: string | null
          available_after?: number
          available_delta?: number
          blocked_delta?: number
          damaged_after?: number
          damaged_delta?: number
          id?: string
          in_transit_after?: number
          in_transit_delta?: number
          movement_type?: string
          occurred_at?: string
          order_id?: string | null
          order_item_id?: string | null
          reason?: string | null
          reference?: string | null
          request_id?: string | null
          reservation_id?: string | null
          reserved_after?: number
          reserved_delta?: number
          return_request_id?: string | null
          seller_id?: string
          shipment_id?: string | null
          sku_id?: string
          trace_id?: string | null
          transfer_id?: string | null
          warehouse_id?: string
          warehouse_inventory_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_ledger_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_warehouse_inventory_id_fkey"
            columns: ["warehouse_inventory_id"]
            isOneToOne: false
            referencedRelation: "warehouse_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          checkout_session_id: string | null
          confirmed_at: string | null
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string | null
          listing_id: string | null
          order_id: string | null
          order_item_id: string | null
          quantity: number
          release_reason: string | null
          released_at: string | null
          seller_id: string
          sku_id: string
          status: string
          updated_at: string
          user_id: string | null
          warehouse_id: string
          warehouse_inventory_id: string
        }
        Insert: {
          checkout_session_id?: string | null
          confirmed_at?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          idempotency_key?: string | null
          listing_id?: string | null
          order_id?: string | null
          order_item_id?: string | null
          quantity: number
          release_reason?: string | null
          released_at?: string | null
          seller_id: string
          sku_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
          warehouse_id: string
          warehouse_inventory_id: string
        }
        Update: {
          checkout_session_id?: string | null
          confirmed_at?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          listing_id?: string | null
          order_id?: string | null
          order_item_id?: string | null
          quantity?: number
          release_reason?: string | null
          released_at?: string | null
          seller_id?: string
          sku_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          warehouse_id?: string
          warehouse_inventory_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_warehouse_inventory_id_fkey"
            columns: ["warehouse_inventory_id"]
            isOneToOne: false
            referencedRelation: "warehouse_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfer_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          quantity_damaged: number
          quantity_dispatched: number
          quantity_received: number
          quantity_requested: number
          sku_id: string
          transfer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          quantity_damaged?: number
          quantity_dispatched?: number
          quantity_received?: number
          quantity_requested: number
          sku_id: string
          transfer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          quantity_damaged?: number
          quantity_dispatched?: number
          quantity_received?: number
          quantity_requested?: number
          sku_id?: string
          transfer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "inventory_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfers: {
        Row: {
          approved_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          carrier_name: string | null
          created_at: string
          created_by: string | null
          dispatched_at: string | null
          expected_arrival_at: string | null
          id: string
          reason: string | null
          received_at: string | null
          seller_id: string
          source_warehouse_id: string
          status: string
          target_warehouse_id: string
          tracking_reference: string | null
          transfer_reference: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          carrier_name?: string | null
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          expected_arrival_at?: string | null
          id?: string
          reason?: string | null
          received_at?: string | null
          seller_id: string
          source_warehouse_id: string
          status?: string
          target_warehouse_id: string
          tracking_reference?: string | null
          transfer_reference: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          carrier_name?: string | null
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          expected_arrival_at?: string | null
          id?: string
          reason?: string | null
          received_at?: string | null
          seller_id?: string
          source_warehouse_id?: string
          status?: string
          target_warehouse_id?: string
          tracking_reference?: string | null
          transfer_reference?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfers_source_warehouse_id_fkey"
            columns: ["source_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_target_warehouse_id_fkey"
            columns: ["target_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_lines: {
        Row: {
          adjustment_id: string | null
          bin_location: string | null
          counted_at: string
          counted_quantity: number
          expected_quantity: number
          id: string
          notes: string | null
          scanned_barcode: string | null
          sku_id: string
          stock_count_id: string
          variance: number | null
          warehouse_inventory_id: string
        }
        Insert: {
          adjustment_id?: string | null
          bin_location?: string | null
          counted_at?: string
          counted_quantity: number
          expected_quantity: number
          id?: string
          notes?: string | null
          scanned_barcode?: string | null
          sku_id: string
          stock_count_id: string
          variance?: number | null
          warehouse_inventory_id: string
        }
        Update: {
          adjustment_id?: string | null
          bin_location?: string | null
          counted_at?: string
          counted_quantity?: number
          expected_quantity?: number
          id?: string
          notes?: string | null
          scanned_barcode?: string | null
          sku_id?: string
          stock_count_id?: string
          variance?: number | null
          warehouse_inventory_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_lines_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "inventory_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_lines_stock_count_id_fkey"
            columns: ["stock_count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_lines_warehouse_inventory_id_fkey"
            columns: ["warehouse_inventory_id"]
            isOneToOne: false
            referencedRelation: "warehouse_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_counts: {
        Row: {
          bin_filter: string | null
          completed_at: string | null
          count_type: string
          counted_by: string | null
          created_at: string
          id: string
          lines_counted: number
          lines_with_variance: number
          notes: string | null
          reconciled_at: string | null
          reviewed_by: string | null
          started_at: string
          status: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          bin_filter?: string | null
          completed_at?: string | null
          count_type?: string
          counted_by?: string | null
          created_at?: string
          id?: string
          lines_counted?: number
          lines_with_variance?: number
          notes?: string | null
          reconciled_at?: string | null
          reviewed_by?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          bin_filter?: string | null
          completed_at?: string | null
          count_type?: string
          counted_by?: string | null
          created_at?: string
          id?: string
          lines_counted?: number
          lines_with_variance?: number
          notes?: string | null
          reconciled_at?: string | null
          reviewed_by?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_counts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_inventory: {
        Row: {
          available_quantity: number
          bin_location: string | null
          blocked_quantity: number
          created_at: string
          damaged_quantity: number
          id: string
          in_transit_quantity: number
          last_counted_at: string | null
          last_received_at: string | null
          last_sold_at: string | null
          listing_id: string | null
          physical_quantity: number | null
          reorder_point: number | null
          reorder_quantity: number | null
          reserved_quantity: number
          seller_id: string
          sku_id: string
          updated_at: string
          version: number
          warehouse_id: string
        }
        Insert: {
          available_quantity?: number
          bin_location?: string | null
          blocked_quantity?: number
          created_at?: string
          damaged_quantity?: number
          id?: string
          in_transit_quantity?: number
          last_counted_at?: string | null
          last_received_at?: string | null
          last_sold_at?: string | null
          listing_id?: string | null
          physical_quantity?: number | null
          reorder_point?: number | null
          reorder_quantity?: number | null
          reserved_quantity?: number
          seller_id: string
          sku_id: string
          updated_at?: string
          version?: number
          warehouse_id: string
        }
        Update: {
          available_quantity?: number
          bin_location?: string | null
          blocked_quantity?: number
          created_at?: string
          damaged_quantity?: number
          id?: string
          in_transit_quantity?: number
          last_counted_at?: string | null
          last_received_at?: string | null
          last_sold_at?: string | null
          listing_id?: string | null
          physical_quantity?: number | null
          reorder_point?: number | null
          reorder_quantity?: number | null
          reserved_quantity?: number
          seller_id?: string
          sku_id?: string
          updated_at?: string
          version?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_inventory_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          accepts_new_orders: boolean
          address_line1: string
          address_line2: string | null
          allocation_priority: number
          city: string
          code: string
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          daily_order_capacity: number | null
          gstin: string | null
          id: string
          is_active: boolean
          landmark: string | null
          latitude: number | null
          longitude: number | null
          name: string
          operating_days: number[]
          pickup_cutoff_time: string
          pincode: string
          processing_time_hours: number
          seller_id: string | null
          state_code: string
          supports_returns: boolean
          updated_at: string
          warehouse_type: string
        }
        Insert: {
          accepts_new_orders?: boolean
          address_line1: string
          address_line2?: string | null
          allocation_priority?: number
          city: string
          code: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          daily_order_capacity?: number | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          operating_days?: number[]
          pickup_cutoff_time?: string
          pincode: string
          processing_time_hours?: number
          seller_id?: string | null
          state_code: string
          supports_returns?: boolean
          updated_at?: string
          warehouse_type: string
        }
        Update: {
          accepts_new_orders?: boolean
          address_line1?: string
          address_line2?: string | null
          allocation_priority?: number
          city?: string
          code?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          daily_order_capacity?: number | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          operating_days?: number[]
          pickup_cutoff_time?: string
          pincode?: string
          processing_time_hours?: number
          seller_id?: string | null
          state_code?: string
          supports_returns?: boolean
          updated_at?: string
          warehouse_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_adjustment: {
        Args: { p_adjustment_id: string }
        Returns: {
          available_quantity: number
          bin_location: string | null
          blocked_quantity: number
          created_at: string
          damaged_quantity: number
          id: string
          in_transit_quantity: number
          last_counted_at: string | null
          last_received_at: string | null
          last_sold_at: string | null
          listing_id: string | null
          physical_quantity: number | null
          reorder_point: number | null
          reorder_quantity: number | null
          reserved_quantity: number
          seller_id: string
          sku_id: string
          updated_at: string
          version: number
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "warehouse_inventory"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      available_for_sku: {
        Args: { p_seller_id?: string; p_sku_id: string }
        Returns: number
      }
      confirm_reservations: {
        Args: { p_order_id: string; p_reservation_ids: string[] }
        Returns: number
      }
      consume_reservation: {
        Args: { p_reservation_id: string; p_shipment_id?: string }
        Returns: boolean
      }
      dispatch_transfer: { Args: { p_transfer_id: string }; Returns: number }
      receive_stock: {
        Args: {
          p_movement_type?: string
          p_quantity: number
          p_reason?: string
          p_reference?: string
          p_seller_id: string
          p_sku_id: string
          p_transfer_id?: string
          p_warehouse_id: string
        }
        Returns: {
          available_quantity: number
          bin_location: string | null
          blocked_quantity: number
          created_at: string
          damaged_quantity: number
          id: string
          in_transit_quantity: number
          last_counted_at: string | null
          last_received_at: string | null
          last_sold_at: string | null
          listing_id: string | null
          physical_quantity: number | null
          reorder_point: number | null
          reorder_quantity: number | null
          reserved_quantity: number
          seller_id: string
          sku_id: string
          updated_at: string
          version: number
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "warehouse_inventory"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      receive_transfer: { Args: { p_transfer_id: string }; Returns: number }
      reconcile_balances: {
        Args: { p_seller_id?: string }
        Returns: {
          available_drift: number
          balance_available: number
          balance_reserved: number
          ledger_available: number
          ledger_reserved: number
          reserved_drift: number
          seller_id: string
          sku_id: string
          warehouse_id: string
          warehouse_inventory_id: string
        }[]
      }
      release_expired_reservations: {
        Args: { p_batch_size?: number }
        Returns: number
      }
      release_reservation: {
        Args: { p_reason?: string; p_reservation_id: string }
        Returns: boolean
      }
      reserve_stock: {
        Args: {
          p_checkout_session_id?: string
          p_idempotency_key?: string
          p_items: Json
          p_order_id?: string
          p_ttl?: string
          p_user_id?: string
        }
        Returns: {
          checkout_session_id: string | null
          confirmed_at: string | null
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string | null
          listing_id: string | null
          order_id: string | null
          order_item_id: string | null
          quantity: number
          release_reason: string | null
          released_at: string | null
          seller_id: string
          sku_id: string
          status: string
          updated_at: string
          user_id: string | null
          warehouse_id: string
          warehouse_inventory_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "inventory_reservations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  marketing: {
    Tables: {
      banners: {
        Row: {
          alt_text: string
          background_color: string | null
          campaign_id: string | null
          clicks: number
          created_at: string
          cta_label: string | null
          ends_at: string | null
          home_section_id: string | null
          id: string
          image_url_desktop: string | null
          image_url_mobile: string
          image_url_tablet: string | null
          impressions: number
          link_target: string | null
          link_type: string
          position: number
          starts_at: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          alt_text: string
          background_color?: string | null
          campaign_id?: string | null
          clicks?: number
          created_at?: string
          cta_label?: string | null
          ends_at?: string | null
          home_section_id?: string | null
          id?: string
          image_url_desktop?: string | null
          image_url_mobile: string
          image_url_tablet?: string | null
          impressions?: number
          link_target?: string | null
          link_type?: string
          position?: number
          starts_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          alt_text?: string
          background_color?: string | null
          campaign_id?: string | null
          clicks?: number
          created_at?: string
          cta_label?: string | null
          ends_at?: string | null
          home_section_id?: string | null
          id?: string
          image_url_desktop?: string | null
          image_url_mobile?: string
          image_url_tablet?: string | null
          impressions?: number
          link_target?: string | null
          link_type?: string
          position?: number
          starts_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "banners_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banners_home_section_id_fkey"
            columns: ["home_section_id"]
            isOneToOne: false
            referencedRelation: "home_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          budget_paise: number | null
          campaign_type: string
          code: string
          created_at: string
          description: string | null
          ends_at: string
          id: string
          landing_slug: string | null
          name: string
          owner_id: string | null
          spent_paise: number
          starts_at: string
          status: string
          theme: Json
          updated_at: string
        }
        Insert: {
          budget_paise?: number | null
          campaign_type: string
          code: string
          created_at?: string
          description?: string | null
          ends_at: string
          id?: string
          landing_slug?: string | null
          name: string
          owner_id?: string | null
          spent_paise?: number
          starts_at: string
          status?: string
          theme?: Json
          updated_at?: string
        }
        Update: {
          budget_paise?: number | null
          campaign_type?: string
          code?: string
          created_at?: string
          description?: string | null
          ends_at?: string
          id?: string
          landing_slug?: string | null
          name?: string
          owner_id?: string | null
          spent_paise?: number
          starts_at?: string
          status?: string
          theme?: Json
          updated_at?: string
        }
        Relationships: []
      }
      collection_items: {
        Row: {
          added_at: string
          collection_id: string
          id: string
          is_pinned: boolean
          position: number
          product_id: string
        }
        Insert: {
          added_at?: string
          collection_id: string
          id?: string
          is_pinned?: boolean
          position?: number
          product_id: string
        }
        Update: {
          added_at?: string
          collection_id?: string
          id?: string
          is_pinned?: boolean
          position?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          banner_url: string | null
          collection_type: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          max_items: number
          name: string
          rules: Json
          seo_description: string | null
          seo_title: string | null
          slug: string
          sort_strategy: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          collection_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_items?: number
          name: string
          rules?: Json
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sort_strategy?: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          collection_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_items?: number
          name?: string
          rules?: Json
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sort_strategy?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_segment_members: {
        Row: {
          added_at: string
          expires_at: string | null
          segment_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          expires_at?: string | null
          segment_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          expires_at?: string | null
          segment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_segment_members_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "customer_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_segments: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          last_computed_at: string | null
          member_count: number
          name: string
          rules: Json
          segment_type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_computed_at?: string | null
          member_count?: number
          name: string
          rules?: Json
          segment_type?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_computed_at?: string | null
          member_count?: number
          name?: string
          rules?: Json
          segment_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      home_sections: {
        Row: {
          audience_city_tiers: string[]
          audience_segments: string[]
          audience_states: string[]
          campaign_id: string | null
          clicks_24h: number
          code: string
          configuration: Json
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          impressions_24h: number
          min_app_version: string | null
          position: number
          section_type: string
          starts_at: string | null
          status: string
          subtitle: string | null
          surfaces: string[]
          title: string | null
          title_hi: string | null
          updated_at: string
        }
        Insert: {
          audience_city_tiers?: string[]
          audience_segments?: string[]
          audience_states?: string[]
          campaign_id?: string | null
          clicks_24h?: number
          code: string
          configuration?: Json
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          impressions_24h?: number
          min_app_version?: string | null
          position?: number
          section_type: string
          starts_at?: string | null
          status?: string
          subtitle?: string | null
          surfaces?: string[]
          title?: string | null
          title_hi?: string | null
          updated_at?: string
        }
        Update: {
          audience_city_tiers?: string[]
          audience_segments?: string[]
          audience_states?: string[]
          campaign_id?: string | null
          clicks_24h?: number
          code?: string
          configuration?: Json
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          impressions_24h?: number
          min_app_version?: string | null
          position?: number
          section_type?: string
          starts_at?: string | null
          status?: string
          subtitle?: string | null
          surfaces?: string[]
          title?: string | null
          title_hi?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_sections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body: string
          category: string
          channel: string
          code: string
          created_at: string
          deep_link_template: string | null
          dlt_entity_id: string | null
          dlt_template_id: string | null
          id: string
          image_url: string | null
          is_active: boolean
          locale: string
          max_per_user_per_day: number | null
          priority: string
          required_params: string[]
          respects_preferences: boolean
          respects_quiet_hours: boolean
          sender_id: string | null
          subject: string | null
          title: string | null
          trigger_event: string
          updated_at: string
          whatsapp_template_name: string | null
        }
        Insert: {
          body: string
          category: string
          channel: string
          code: string
          created_at?: string
          deep_link_template?: string | null
          dlt_entity_id?: string | null
          dlt_template_id?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          locale?: string
          max_per_user_per_day?: number | null
          priority?: string
          required_params?: string[]
          respects_preferences?: boolean
          respects_quiet_hours?: boolean
          sender_id?: string | null
          subject?: string | null
          title?: string | null
          trigger_event: string
          updated_at?: string
          whatsapp_template_name?: string | null
        }
        Update: {
          body?: string
          category?: string
          channel?: string
          code?: string
          created_at?: string
          deep_link_template?: string | null
          dlt_entity_id?: string | null
          dlt_template_id?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          locale?: string
          max_per_user_per_day?: number | null
          priority?: string
          required_params?: string[]
          respects_preferences?: boolean
          respects_quiet_hours?: boolean
          sender_id?: string | null
          subject?: string | null
          title?: string | null
          trigger_event?: string
          updated_at?: string
          whatsapp_template_name?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          attempts: number
          body: string
          category: string
          channel: string
          clicked_at: string | null
          created_at: string
          deep_link: string | null
          delivered_at: string | null
          failure_code: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          image_url: string | null
          locale: string
          params: Json
          provider: string | null
          provider_message_id: string | null
          provider_response: Json | null
          read_at: string | null
          related_id: string | null
          related_type: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          subject: string | null
          suppression_reason: string | null
          template_code: string
          template_id: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          body: string
          category?: string
          channel: string
          clicked_at?: string | null
          created_at?: string
          deep_link?: string | null
          delivered_at?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          image_url?: string | null
          locale?: string
          params?: Json
          provider?: string | null
          provider_message_id?: string | null
          provider_response?: Json | null
          read_at?: string | null
          related_id?: string | null
          related_type?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          suppression_reason?: string | null
          template_code: string
          template_id?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          body?: string
          category?: string
          channel?: string
          clicked_at?: string | null
          created_at?: string
          deep_link?: string | null
          delivered_at?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          image_url?: string | null
          locale?: string
          params?: Json
          provider?: string | null
          provider_message_id?: string | null
          provider_response?: Json | null
          read_at?: string | null
          related_id?: string | null
          related_type?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          suppression_reason?: string | null
          template_code?: string
          template_id?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      search_curations: {
        Row: {
          created_at: string
          hidden_product_ids: string[]
          id: string
          is_active: boolean
          locale: string
          pinned_product_ids: string[]
          query: string
          redirect_url: string | null
        }
        Insert: {
          created_at?: string
          hidden_product_ids?: string[]
          id?: string
          is_active?: boolean
          locale?: string
          pinned_product_ids?: string[]
          query: string
          redirect_url?: string | null
        }
        Update: {
          created_at?: string
          hidden_product_ids?: string[]
          id?: string
          is_active?: boolean
          locale?: string
          pinned_product_ids?: string[]
          query?: string
          redirect_url?: string | null
        }
        Relationships: []
      }
      search_synonyms: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          locale: string
          root_term: string
          synced_at: string | null
          synonym_type: string
          synonyms: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          locale?: string
          root_term: string
          synced_at?: string | null
          synonym_type?: string
          synonyms: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          locale?: string
          root_term?: string
          synced_at?: string | null
          synonym_type?: string
          synonyms?: string[]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  payments: {
    Tables: {
      cod_eligibility_decisions: {
        Row: {
          cart_value_paise: number
          checkout_session_id: string | null
          decided_at: string
          decision: string
          id: string
          order_id: string | null
          pincode: string
          prepay_amount_paise: number | null
          reason_codes: string[]
          risk_score: number | null
          signals: Json
          user_id: string
        }
        Insert: {
          cart_value_paise: number
          checkout_session_id?: string | null
          decided_at?: string
          decision: string
          id?: string
          order_id?: string | null
          pincode: string
          prepay_amount_paise?: number | null
          reason_codes?: string[]
          risk_score?: number | null
          signals?: Json
          user_id: string
        }
        Update: {
          cart_value_paise?: number
          checkout_session_id?: string | null
          decided_at?: string
          decision?: string
          id?: string
          order_id?: string | null
          pincode?: string
          prepay_amount_paise?: number | null
          reason_codes?: string[]
          risk_score?: number | null
          signals?: Json
          user_id?: string
        }
        Relationships: []
      }
      payment_attempts: {
        Row: {
          amount_paise: number
          attempt_number: number
          bank_code: string | null
          card_issuer: string | null
          card_last4: string | null
          card_network: string | null
          completed_at: string | null
          emi_tenure_months: number | null
          id: string
          initiated_at: string
          instrument_token: string | null
          instrument_type: string | null
          ip_address: unknown
          is_retryable: boolean | null
          order_id: string
          outcome_source: string | null
          payment_intent_id: string
          payment_method: string
          provider: string
          provider_error_code: string | null
          provider_error_description: string | null
          provider_payment_id: string | null
          provider_reference: string | null
          request_id: string | null
          status: string
          trace_id: string | null
          upi_vpa_masked: string | null
          user_agent: string | null
          verified_at: string | null
          wallet_provider: string | null
        }
        Insert: {
          amount_paise: number
          attempt_number: number
          bank_code?: string | null
          card_issuer?: string | null
          card_last4?: string | null
          card_network?: string | null
          completed_at?: string | null
          emi_tenure_months?: number | null
          id?: string
          initiated_at?: string
          instrument_token?: string | null
          instrument_type?: string | null
          ip_address?: unknown
          is_retryable?: boolean | null
          order_id: string
          outcome_source?: string | null
          payment_intent_id: string
          payment_method: string
          provider: string
          provider_error_code?: string | null
          provider_error_description?: string | null
          provider_payment_id?: string | null
          provider_reference?: string | null
          request_id?: string | null
          status?: string
          trace_id?: string | null
          upi_vpa_masked?: string | null
          user_agent?: string | null
          verified_at?: string | null
          wallet_provider?: string | null
        }
        Update: {
          amount_paise?: number
          attempt_number?: number
          bank_code?: string | null
          card_issuer?: string | null
          card_last4?: string | null
          card_network?: string | null
          completed_at?: string | null
          emi_tenure_months?: number | null
          id?: string
          initiated_at?: string
          instrument_token?: string | null
          instrument_type?: string | null
          ip_address?: unknown
          is_retryable?: boolean | null
          order_id?: string
          outcome_source?: string | null
          payment_intent_id?: string
          payment_method?: string
          provider?: string
          provider_error_code?: string | null
          provider_error_description?: string | null
          provider_payment_id?: string | null
          provider_reference?: string | null
          request_id?: string | null
          status?: string
          trace_id?: string | null
          upi_vpa_masked?: string | null
          user_agent?: string | null
          verified_at?: string | null
          wallet_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          amount_paise: number
          authorised_at: string | null
          bank_offer_discount_paise: number
          bank_offer_id: string | null
          captured_at: string | null
          captured_paise: number
          checkout_session_id: string | null
          client_session: Json
          created_at: string
          currency: string
          expires_at: string | null
          failed_at: string | null
          failure_code: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          order_id: string
          payment_method: string
          provider: string
          provider_intent_id: string | null
          refunded_paise: number
          request_id: string | null
          status: string
          trace_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paise: number
          authorised_at?: string | null
          bank_offer_discount_paise?: number
          bank_offer_id?: string | null
          captured_at?: string | null
          captured_paise?: number
          checkout_session_id?: string | null
          client_session?: Json
          created_at?: string
          currency?: string
          expires_at?: string | null
          failed_at?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          order_id: string
          payment_method: string
          provider: string
          provider_intent_id?: string | null
          refunded_paise?: number
          request_id?: string | null
          status?: string
          trace_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paise?: number
          authorised_at?: string | null
          bank_offer_discount_paise?: number
          bank_offer_id?: string | null
          captured_at?: string | null
          captured_paise?: number
          checkout_session_id?: string | null
          client_session?: Json
          created_at?: string
          currency?: string
          expires_at?: string | null
          failed_at?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          order_id?: string
          payment_method?: string
          provider?: string
          provider_intent_id?: string | null
          refunded_paise?: number
          request_id?: string | null
          status?: string
          trace_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_reconciliation: {
        Row: {
          amount_variance_paise: number
          completed_at: string | null
          id: string
          matched_count: number
          notes: string | null
          novamart_gross_paise: number
          novamart_transaction_count: number
          provider: string
          provider_fee_paise: number
          provider_gross_paise: number
          provider_net_paise: number
          provider_settlement_id: string | null
          provider_transaction_count: number
          reconciliation_date: string
          resolved_at: string | null
          resolved_by: string | null
          source_file_path: string | null
          started_at: string
          status: string
          unmatched_novamart_count: number
          unmatched_provider_count: number
        }
        Insert: {
          amount_variance_paise?: number
          completed_at?: string | null
          id?: string
          matched_count?: number
          notes?: string | null
          novamart_gross_paise?: number
          novamart_transaction_count?: number
          provider: string
          provider_fee_paise?: number
          provider_gross_paise?: number
          provider_net_paise?: number
          provider_settlement_id?: string | null
          provider_transaction_count?: number
          reconciliation_date: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_file_path?: string | null
          started_at?: string
          status?: string
          unmatched_novamart_count?: number
          unmatched_provider_count?: number
        }
        Update: {
          amount_variance_paise?: number
          completed_at?: string | null
          id?: string
          matched_count?: number
          notes?: string | null
          novamart_gross_paise?: number
          novamart_transaction_count?: number
          provider?: string
          provider_fee_paise?: number
          provider_gross_paise?: number
          provider_net_paise?: number
          provider_settlement_id?: string | null
          provider_transaction_count?: number
          reconciliation_date?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_file_path?: string | null
          started_at?: string
          status?: string
          unmatched_novamart_count?: number
          unmatched_provider_count?: number
        }
        Relationships: []
      }
      payment_reconciliation_items: {
        Row: {
          created_at: string
          id: string
          match_status: string
          novamart_amount_paise: number | null
          novamart_status: string | null
          order_id: string | null
          payment_intent_id: string | null
          provider_amount_paise: number | null
          provider_fee_paise: number | null
          provider_payment_id: string | null
          provider_status: string | null
          reconciliation_id: string
          resolution: string | null
          resolved_at: string | null
          variance_paise: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          match_status: string
          novamart_amount_paise?: number | null
          novamart_status?: string | null
          order_id?: string | null
          payment_intent_id?: string | null
          provider_amount_paise?: number | null
          provider_fee_paise?: number | null
          provider_payment_id?: string | null
          provider_status?: string | null
          reconciliation_id: string
          resolution?: string | null
          resolved_at?: string | null
          variance_paise?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          match_status?: string
          novamart_amount_paise?: number | null
          novamart_status?: string | null
          order_id?: string | null
          payment_intent_id?: string | null
          provider_amount_paise?: number | null
          provider_fee_paise?: number | null
          provider_payment_id?: string | null
          provider_status?: string | null
          reconciliation_id?: string
          resolution?: string | null
          resolved_at?: string | null
          variance_paise?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_reconciliation_items_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reconciliation_items_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "payment_reconciliation"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount_paise: number
          currency: string
          id: string
          net_amount_paise: number | null
          occurred_at: string
          order_id: string
          payment_attempt_id: string | null
          payment_intent_id: string
          provider: string
          provider_fee_paise: number
          provider_payload: Json
          provider_tax_paise: number
          provider_transaction_id: string | null
          recorded_at: string
          source_event_id: string | null
          status: string
          transaction_type: string
        }
        Insert: {
          amount_paise: number
          currency?: string
          id?: string
          net_amount_paise?: number | null
          occurred_at?: string
          order_id: string
          payment_attempt_id?: string | null
          payment_intent_id: string
          provider: string
          provider_fee_paise?: number
          provider_payload?: Json
          provider_tax_paise?: number
          provider_transaction_id?: string | null
          recorded_at?: string
          source_event_id?: string | null
          status: string
          transaction_type: string
        }
        Update: {
          amount_paise?: number
          currency?: string
          id?: string
          net_amount_paise?: number | null
          occurred_at?: string
          order_id?: string
          payment_attempt_id?: string | null
          payment_intent_id?: string
          provider?: string
          provider_fee_paise?: number
          provider_payload?: Json
          provider_tax_paise?: number
          provider_transaction_id?: string | null
          recorded_at?: string
          source_event_id?: string | null
          status?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_events: {
        Row: {
          amount_matched: boolean | null
          event_type: string
          id: string
          order_id: string | null
          payment_intent_id: string | null
          processed_at: string | null
          processing_attempts: number
          processing_error: string | null
          processing_status: string
          provider: string
          provider_event_id: string
          provider_order_id: string | null
          provider_payment_id: string | null
          provider_refund_id: string | null
          provider_timestamp: string | null
          raw_payload: Json
          received_at: string
          reported_amount_paise: number | null
          signature_header: string | null
          signature_verified: boolean
        }
        Insert: {
          amount_matched?: boolean | null
          event_type: string
          id?: string
          order_id?: string | null
          payment_intent_id?: string | null
          processed_at?: string | null
          processing_attempts?: number
          processing_error?: string | null
          processing_status?: string
          provider: string
          provider_event_id: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          provider_refund_id?: string | null
          provider_timestamp?: string | null
          raw_payload: Json
          received_at?: string
          reported_amount_paise?: number | null
          signature_header?: string | null
          signature_verified?: boolean
        }
        Update: {
          amount_matched?: boolean | null
          event_type?: string
          id?: string
          order_id?: string | null
          payment_intent_id?: string | null
          processed_at?: string | null
          processing_attempts?: number
          processing_error?: string | null
          processing_status?: string
          provider?: string
          provider_event_id?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          provider_refund_id?: string | null
          provider_timestamp?: string | null
          raw_payload?: Json
          received_at?: string
          reported_amount_paise?: number | null
          signature_header?: string | null
          signature_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payment_webhook_events_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_attempts: {
        Row: {
          amount_paise: number
          attempt_number: number
          completed_at: string | null
          id: string
          initiated_at: string
          outcome_source: string | null
          provider: string
          provider_error_code: string | null
          provider_error_description: string | null
          provider_payload: Json
          provider_refund_id: string | null
          refund_id: string
          status: string
        }
        Insert: {
          amount_paise: number
          attempt_number: number
          completed_at?: string | null
          id?: string
          initiated_at?: string
          outcome_source?: string | null
          provider: string
          provider_error_code?: string | null
          provider_error_description?: string | null
          provider_payload?: Json
          provider_refund_id?: string | null
          refund_id: string
          status?: string
        }
        Update: {
          amount_paise?: number
          attempt_number?: number
          completed_at?: string | null
          id?: string
          initiated_at?: string
          outcome_source?: string | null
          provider?: string
          provider_error_code?: string | null
          provider_error_description?: string | null
          provider_payload?: Json
          provider_refund_id?: string | null
          refund_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_attempts_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount_paise: number
          approved_at: string | null
          approved_by: string | null
          beneficiary_details: Json | null
          borne_by: string
          completed_at: string | null
          created_at: string
          currency: string
          expected_completion_date: string | null
          failed_at: string | null
          failure_code: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          initiated_by: string | null
          initiated_by_type: string
          item_amount_paise: number
          order_id: string
          order_item_id: string | null
          payment_intent_id: string
          reason_code: string
          reason_notes: string | null
          refund_mode: string
          refund_reference: string
          refund_type: string
          rejection_reason: string | null
          request_id: string | null
          requires_approval: boolean
          return_request_id: string | null
          shipping_amount_paise: number
          status: string
          tax_amount_paise: number
          trace_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paise: number
          approved_at?: string | null
          approved_by?: string | null
          beneficiary_details?: Json | null
          borne_by?: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          expected_completion_date?: string | null
          failed_at?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          initiated_by?: string | null
          initiated_by_type?: string
          item_amount_paise?: number
          order_id: string
          order_item_id?: string | null
          payment_intent_id: string
          reason_code: string
          reason_notes?: string | null
          refund_mode?: string
          refund_reference: string
          refund_type: string
          rejection_reason?: string | null
          request_id?: string | null
          requires_approval?: boolean
          return_request_id?: string | null
          shipping_amount_paise?: number
          status?: string
          tax_amount_paise?: number
          trace_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paise?: number
          approved_at?: string | null
          approved_by?: string | null
          beneficiary_details?: Json | null
          borne_by?: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          expected_completion_date?: string | null
          failed_at?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          initiated_by?: string | null
          initiated_by_type?: string
          item_amount_paise?: number
          order_id?: string
          order_item_id?: string | null
          payment_intent_id?: string
          reason_code?: string
          reason_notes?: string | null
          refund_mode?: string
          refund_reference?: string
          refund_type?: string
          rejection_reason?: string | null
          request_id?: string | null
          requires_approval?: boolean
          return_request_id?: string | null
          shipping_amount_paise?: number
          status?: string
          tax_amount_paise?: number
          trace_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_payment_instruments: {
        Row: {
          card_expiry_month: number | null
          card_expiry_year: number | null
          card_issuer: string | null
          card_last4: string | null
          card_network: string | null
          consent_given_at: string
          created_at: string
          deleted_at: string | null
          display_name: string | null
          id: string
          instrument_type: string
          is_default: boolean
          last_used_at: string | null
          provider: string
          provider_token: string
          upi_vpa_masked: string | null
          user_id: string
        }
        Insert: {
          card_expiry_month?: number | null
          card_expiry_year?: number | null
          card_issuer?: string | null
          card_last4?: string | null
          card_network?: string | null
          consent_given_at?: string
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          id?: string
          instrument_type: string
          is_default?: boolean
          last_used_at?: string | null
          provider: string
          provider_token: string
          upi_vpa_masked?: string | null
          user_id: string
        }
        Update: {
          card_expiry_month?: number | null
          card_expiry_year?: number | null
          card_issuer?: string | null
          card_last4?: string | null
          card_network?: string | null
          consent_given_at?: string
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          id?: string
          instrument_type?: string
          is_default?: boolean
          last_used_at?: string | null
          provider?: string
          provider_token?: string
          upi_vpa_masked?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  platform: {
    Tables: {
      app_version_policies: {
        Row: {
          app: string
          created_at: string
          force_update_message: string
          id: string
          latest_version: string
          maintenance_message: string | null
          maintenance_mode: boolean
          maintenance_until: string | null
          minimum_version: string
          platform: string
          soft_update_message: string
          store_url: string
          updated_at: string
        }
        Insert: {
          app: string
          created_at?: string
          force_update_message?: string
          id?: string
          latest_version: string
          maintenance_message?: string | null
          maintenance_mode?: boolean
          maintenance_until?: string | null
          minimum_version: string
          platform: string
          soft_update_message?: string
          store_url: string
          updated_at?: string
        }
        Update: {
          app?: string
          created_at?: string
          force_update_message?: string
          id?: string
          latest_version?: string
          maintenance_message?: string | null
          maintenance_mode?: boolean
          maintenance_until?: string | null
          minimum_version?: string
          platform?: string
          soft_update_message?: string
          store_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      consumer_offsets: {
        Row: {
          consumer_name: string
          duration_ms: number | null
          error_message: string | null
          event_id: string
          outcome: string
          processed_at: string
        }
        Insert: {
          consumer_name: string
          duration_ms?: number | null
          error_message?: string | null
          event_id: string
          outcome?: string
          processed_at?: string
        }
        Update: {
          consumer_name?: string
          duration_ms?: number | null
          error_message?: string | null
          event_id?: string
          outcome?: string
          processed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumer_offsets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "outbox_events"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flag_rules: {
        Row: {
          attribute: string
          comparand: Json
          created_at: string
          description: string | null
          flag_key: string
          id: string
          operator: string
          outcome: boolean
          priority: number
        }
        Insert: {
          attribute: string
          comparand: Json
          created_at?: string
          description?: string | null
          flag_key: string
          id?: string
          operator: string
          outcome: boolean
          priority?: number
        }
        Update: {
          attribute?: string
          comparand?: Json
          created_at?: string
          description?: string | null
          flag_key?: string
          id?: string
          operator?: string
          outcome?: boolean
          priority?: number
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_rules_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          default_value: boolean
          description: string
          expected_removal_at: string | null
          is_enabled: boolean
          key: string
          name: string
          owner_team: string | null
          rollout_percentage: number
          rollout_salt: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          default_value?: boolean
          description: string
          expected_removal_at?: string | null
          is_enabled?: boolean
          key: string
          name: string
          owner_team?: string | null
          rollout_percentage?: number
          rollout_salt?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          default_value?: boolean
          description?: string
          expected_removal_at?: string | null
          is_enabled?: boolean
          key?: string
          name?: string
          owner_team?: string | null
          rollout_percentage?: number
          rollout_salt?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          actor_id: string | null
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string
          locked_at: string
          request_fingerprint: string
          resource_id: string | null
          resource_type: string | null
          response_body: Json | null
          response_status: number | null
          scope: string
          status: string
        }
        Insert: {
          actor_id?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key: string
          locked_at?: string
          request_fingerprint: string
          resource_id?: string | null
          resource_type?: string | null
          response_body?: Json | null
          response_status?: number | null
          scope: string
          status?: string
        }
        Update: {
          actor_id?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          locked_at?: string
          request_fingerprint?: string
          resource_id?: string | null
          resource_type?: string | null
          response_body?: Json | null
          response_status?: number | null
          scope?: string
          status?: string
        }
        Relationships: []
      }
      integration_settings: {
        Row: {
          configuration: Json
          created_at: string
          display_name: string
          environment: string
          health_checked_at: string | null
          health_status: string
          id: string
          integration_type: string
          is_enabled: boolean
          priority: number
          provider_code: string
          secret_references: Json
          updated_at: string
          webhook_path: string | null
        }
        Insert: {
          configuration?: Json
          created_at?: string
          display_name: string
          environment: string
          health_checked_at?: string | null
          health_status?: string
          id?: string
          integration_type: string
          is_enabled?: boolean
          priority?: number
          provider_code: string
          secret_references?: Json
          updated_at?: string
          webhook_path?: string | null
        }
        Update: {
          configuration?: Json
          created_at?: string
          display_name?: string
          environment?: string
          health_checked_at?: string | null
          health_status?: string
          id?: string
          integration_type?: string
          is_enabled?: boolean
          priority?: number
          provider_code?: string
          secret_references?: Json
          updated_at?: string
          webhook_path?: string | null
        }
        Relationships: []
      }
      outbox_events: {
        Row: {
          actor_id: string | null
          aggregate_id: string
          aggregate_type: string
          attempts: number
          available_at: string
          created_at: string
          event_type: string
          event_version: number
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          metadata: Json
          occurred_at: string
          partition_key: string
          payload: Json
          published_at: string | null
          request_id: string | null
          status: string
          trace_id: string | null
        }
        Insert: {
          actor_id?: string | null
          aggregate_id: string
          aggregate_type: string
          attempts?: number
          available_at?: string
          created_at?: string
          event_type: string
          event_version?: number
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          metadata?: Json
          occurred_at?: string
          partition_key: string
          payload: Json
          published_at?: string | null
          request_id?: string | null
          status?: string
          trace_id?: string | null
        }
        Update: {
          actor_id?: string | null
          aggregate_id?: string
          aggregate_type?: string
          attempts?: number
          available_at?: string
          created_at?: string
          event_type?: string
          event_version?: number
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          metadata?: Json
          occurred_at?: string
          partition_key?: string
          payload?: Json
          published_at?: string | null
          request_id?: string | null
          status?: string
          trace_id?: string | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          category: string
          created_at: string
          default_value: Json
          description: string
          is_public: boolean
          is_sensitive: boolean
          key: string
          label: string
          updated_at: string
          updated_by: string | null
          validation_schema: Json | null
          value: Json
          value_type: string
        }
        Insert: {
          category: string
          created_at?: string
          default_value: Json
          description: string
          is_public?: boolean
          is_sensitive?: boolean
          key: string
          label: string
          updated_at?: string
          updated_by?: string | null
          validation_schema?: Json | null
          value: Json
          value_type: string
        }
        Update: {
          category?: string
          created_at?: string
          default_value?: Json
          description?: string
          is_public?: boolean
          is_sensitive?: boolean
          key?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
          validation_schema?: Json | null
          value?: Json
          value_type?: string
        }
        Relationships: []
      }
      scheduled_job_runs: {
        Row: {
          details: Json
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          items_affected: number
          items_scanned: number
          job_name: string
          started_at: string
          status: string
          trace_id: string | null
        }
        Insert: {
          details?: Json
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_affected?: number
          items_scanned?: number
          job_name: string
          started_at?: string
          status?: string
          trace_id?: string | null
        }
        Update: {
          details?: Json
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_affected?: number
          items_scanned?: number
          job_name?: string
          started_at?: string
          status?: string
          trace_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_outbox_batch: {
        Args: { p_batch_size?: number; p_worker_id: string }
        Returns: {
          actor_id: string | null
          aggregate_id: string
          aggregate_type: string
          attempts: number
          available_at: string
          created_at: string
          event_type: string
          event_version: number
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          metadata: Json
          occurred_at: string
          partition_key: string
          payload: Json
          published_at: string | null
          request_id: string | null
          status: string
          trace_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "outbox_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_outbox_event: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      fail_outbox_event: {
        Args: { p_error: string; p_event_id: string }
        Returns: undefined
      }
      requeue_stuck_outbox_events: {
        Args: { p_visibility_timeout?: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  pricing: {
    Tables: {
      bank_offers: {
        Row: {
          bank_name: string
          card_bin_prefixes: string[]
          card_networks: string[]
          card_types: string[]
          code: string
          created_at: string
          discount_paise: number | null
          discount_percentage: number | null
          discount_type: string
          emi_tenure_months: number[] | null
          ends_at: string
          id: string
          is_active: boolean
          is_emi_only: boolean
          max_discount_paise: number | null
          min_transaction_paise: number
          offer_description: string
          offer_title: string
          payment_methods: string[]
          per_card_limit: number | null
          starts_at: string
          terms_url: string | null
          total_usage_limit: number | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          bank_name: string
          card_bin_prefixes?: string[]
          card_networks?: string[]
          card_types?: string[]
          code: string
          created_at?: string
          discount_paise?: number | null
          discount_percentage?: number | null
          discount_type: string
          emi_tenure_months?: number[] | null
          ends_at: string
          id?: string
          is_active?: boolean
          is_emi_only?: boolean
          max_discount_paise?: number | null
          min_transaction_paise?: number
          offer_description: string
          offer_title: string
          payment_methods: string[]
          per_card_limit?: number | null
          starts_at: string
          terms_url?: string | null
          total_usage_limit?: number | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          bank_name?: string
          card_bin_prefixes?: string[]
          card_networks?: string[]
          card_types?: string[]
          code?: string
          created_at?: string
          discount_paise?: number | null
          discount_percentage?: number | null
          discount_type?: string
          emi_tenure_months?: number[] | null
          ends_at?: string
          id?: string
          is_active?: boolean
          is_emi_only?: boolean
          max_discount_paise?: number | null
          min_transaction_paise?: number
          offer_description?: string
          offer_title?: string
          payment_methods?: string[]
          per_card_limit?: number | null
          starts_at?: string
          terms_url?: string | null
          total_usage_limit?: number | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      buy_box_weights: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          is_active: boolean
          max_cancellation_rate: number
          max_return_rate: number
          min_seller_score: number
          name: string
          require_in_stock: boolean
          updated_at: string
          weight_cancellation_rate: number
          weight_delivery_speed: number
          weight_fulfillment_model: number
          weight_price: number
          weight_return_rate: number
          weight_seller_rating: number
          weight_seller_score: number
          weight_stock_depth: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_cancellation_rate?: number
          max_return_rate?: number
          min_seller_score?: number
          name: string
          require_in_stock?: boolean
          updated_at?: string
          weight_cancellation_rate?: number
          weight_delivery_speed?: number
          weight_fulfillment_model?: number
          weight_price?: number
          weight_return_rate?: number
          weight_seller_rating?: number
          weight_seller_score?: number
          weight_stock_depth?: number
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_cancellation_rate?: number
          max_return_rate?: number
          min_seller_score?: number
          name?: string
          require_in_stock?: boolean
          updated_at?: string
          weight_cancellation_rate?: number
          weight_delivery_speed?: number
          weight_fulfillment_model?: number
          weight_price?: number
          weight_return_rate?: number
          weight_seller_rating?: number
          weight_seller_score?: number
          weight_stock_depth?: number
        }
        Relationships: []
      }
      commission_rules: {
        Row: {
          brand_id: string | null
          campaign_id: string | null
          category_id: string | null
          closing_fee_paise: number
          commission_gst_rate: number
          commission_type: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          fixed_paise: number | null
          fulfillment_fee_paise: number
          fulfillment_model: string | null
          id: string
          is_active: boolean
          max_commission_paise: number | null
          max_price_paise: number | null
          min_commission_paise: number | null
          min_price_paise: number | null
          name: string
          payment_gateway_fee_percentage: number
          percentage: number | null
          priority: number
          product_id: string | null
          scope_type: string
          seller_id: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          campaign_id?: string | null
          category_id?: string | null
          closing_fee_paise?: number
          commission_gst_rate?: number
          commission_type: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          fixed_paise?: number | null
          fulfillment_fee_paise?: number
          fulfillment_model?: string | null
          id?: string
          is_active?: boolean
          max_commission_paise?: number | null
          max_price_paise?: number | null
          min_commission_paise?: number | null
          min_price_paise?: number | null
          name: string
          payment_gateway_fee_percentage?: number
          percentage?: number | null
          priority?: number
          product_id?: string | null
          scope_type: string
          seller_id?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          campaign_id?: string | null
          category_id?: string | null
          closing_fee_paise?: number
          commission_gst_rate?: number
          commission_type?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          fixed_paise?: number | null
          fulfillment_fee_paise?: number
          fulfillment_model?: string | null
          id?: string
          is_active?: boolean
          max_commission_paise?: number | null
          max_price_paise?: number | null
          min_commission_paise?: number | null
          min_price_paise?: number | null
          name?: string
          payment_gateway_fee_percentage?: number
          percentage?: number | null
          priority?: number
          product_id?: string | null
          scope_type?: string
          seller_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          discount_paise: number
          id: string
          order_id: string
          redeemed_at: string
          reversal_reason: string | null
          reversed_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          coupon_id: string
          discount_paise: number
          id?: string
          order_id: string
          redeemed_at?: string
          reversal_reason?: string | null
          reversed_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          coupon_id?: string
          discount_paise?: number
          id?: string
          order_id?: string
          redeemed_at?: string
          reversal_reason?: string | null
          reversed_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_rules: {
        Row: {
          attribute: string
          coupon_id: string
          created_at: string
          id: string
          operator: string
          rule_group: number
          value_array: string[] | null
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          attribute: string
          coupon_id: string
          created_at?: string
          id?: string
          operator: string
          rule_group?: number
          value_array?: string[] | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          attribute?: string
          coupon_id?: string
          created_at?: string
          id?: string
          operator?: string
          rule_group?: number
          value_array?: string[] | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_rules_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          applicable_payment_methods: string[]
          code: string
          created_at: string
          created_by: string | null
          customer_segments: string[]
          description: string | null
          discount_paise: number | null
          discount_percentage: number | null
          discount_type: string
          distribution: string
          ends_at: string
          first_order_only: boolean
          funded_by: string
          id: string
          is_active: boolean
          is_stackable: boolean
          issued_to_user_id: string | null
          max_discount_paise: number | null
          min_cart_value_paise: number
          name: string
          per_user_limit: number
          seller_id: string | null
          starts_at: string
          total_usage_limit: number | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          applicable_payment_methods?: string[]
          code: string
          created_at?: string
          created_by?: string | null
          customer_segments?: string[]
          description?: string | null
          discount_paise?: number | null
          discount_percentage?: number | null
          discount_type: string
          distribution?: string
          ends_at: string
          first_order_only?: boolean
          funded_by?: string
          id?: string
          is_active?: boolean
          is_stackable?: boolean
          issued_to_user_id?: string | null
          max_discount_paise?: number | null
          min_cart_value_paise?: number
          name: string
          per_user_limit?: number
          seller_id?: string | null
          starts_at: string
          total_usage_limit?: number | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          applicable_payment_methods?: string[]
          code?: string
          created_at?: string
          created_by?: string | null
          customer_segments?: string[]
          description?: string | null
          discount_paise?: number | null
          discount_percentage?: number | null
          discount_type?: string
          distribution?: string
          ends_at?: string
          first_order_only?: boolean
          funded_by?: string
          id?: string
          is_active?: boolean
          is_stackable?: boolean
          issued_to_user_id?: string | null
          max_discount_paise?: number | null
          min_cart_value_paise?: number
          name?: string
          per_user_limit?: number
          seller_id?: string | null
          starts_at?: string
          total_usage_limit?: number | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      flash_sale_items: {
        Row: {
          allocated_quantity: number
          created_at: string
          display_order: number
          flash_sale_id: string
          id: string
          listing_id: string
          max_quantity_per_user: number
          sale_price_paise: number
          sku_id: string
          sold_quantity: number
          updated_at: string
        }
        Insert: {
          allocated_quantity: number
          created_at?: string
          display_order?: number
          flash_sale_id: string
          id?: string
          listing_id: string
          max_quantity_per_user?: number
          sale_price_paise: number
          sku_id: string
          sold_quantity?: number
          updated_at?: string
        }
        Update: {
          allocated_quantity?: number
          created_at?: string
          display_order?: number
          flash_sale_id?: string
          id?: string
          listing_id?: string
          max_quantity_per_user?: number
          sale_price_paise?: number
          sku_id?: string
          sold_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flash_sale_items_flash_sale_id_fkey"
            columns: ["flash_sale_id"]
            isOneToOne: false
            referencedRelation: "flash_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      flash_sales: {
        Row: {
          banner_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number
          ends_at: string
          id: string
          name: string
          slug: string
          starts_at: string
          status: string
          teaser_from: string | null
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          ends_at: string
          id?: string
          name: string
          slug: string
          starts_at: string
          status?: string
          teaser_from?: string | null
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          ends_at?: string
          id?: string
          name?: string
          slug?: string
          starts_at?: string
          status?: string
          teaser_from?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      listing_price_history: {
        Row: {
          change_reason: string | null
          changed_by: string | null
          id: string
          listing_id: string
          new_mrp_paise: number
          new_selling_price_paise: number
          occurred_at: string
          old_mrp_paise: number | null
          old_selling_price_paise: number | null
          seller_id: string
          sku_id: string
          update_source: string
        }
        Insert: {
          change_reason?: string | null
          changed_by?: string | null
          id?: string
          listing_id: string
          new_mrp_paise: number
          new_selling_price_paise: number
          occurred_at?: string
          old_mrp_paise?: number | null
          old_selling_price_paise?: number | null
          seller_id: string
          sku_id: string
          update_source: string
        }
        Update: {
          change_reason?: string | null
          changed_by?: string | null
          id?: string
          listing_id?: string
          new_mrp_paise?: number
          new_selling_price_paise?: number
          occurred_at?: string
          old_mrp_paise?: number | null
          old_selling_price_paise?: number | null
          seller_id?: string
          sku_id?: string
          update_source?: string
        }
        Relationships: []
      }
      listing_prices: {
        Row: {
          allows_platform_discount: boolean
          created_at: string
          currency: string
          discount_paise: number | null
          discount_percentage: number | null
          effective_from: string
          floor_price_paise: number | null
          listing_id: string
          mrp_paise: number
          seller_id: string
          selling_price_paise: number
          sku_id: string
          update_source: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allows_platform_discount?: boolean
          created_at?: string
          currency?: string
          discount_paise?: number | null
          discount_percentage?: number | null
          effective_from?: string
          floor_price_paise?: number | null
          listing_id: string
          mrp_paise: number
          seller_id: string
          selling_price_paise: number
          sku_id: string
          update_source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allows_platform_discount?: boolean
          created_at?: string
          currency?: string
          discount_paise?: number | null
          discount_percentage?: number | null
          effective_from?: string
          floor_price_paise?: number | null
          listing_id?: string
          mrp_paise?: number
          seller_id?: string
          selling_price_paise?: number
          sku_id?: string
          update_source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      promotion_rules: {
        Row: {
          attribute: string
          created_at: string
          id: string
          operator: string
          promotion_id: string
          rule_group: number
          value_array: string[] | null
          value_numeric: number | null
          value_numeric_max: number | null
          value_text: string | null
        }
        Insert: {
          attribute: string
          created_at?: string
          id?: string
          operator: string
          promotion_id: string
          rule_group?: number
          value_array?: string[] | null
          value_numeric?: number | null
          value_numeric_max?: number | null
          value_text?: string | null
        }
        Update: {
          attribute?: string
          created_at?: string
          id?: string
          operator?: string
          promotion_id?: string
          rule_group?: number
          value_array?: string[] | null
          value_numeric?: number | null
          value_numeric_max?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotion_rules_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_targets: {
        Row: {
          brand_id: string | null
          category_id: string | null
          created_at: string
          id: string
          is_exclusion: boolean
          listing_id: string | null
          product_id: string | null
          promotion_id: string
          seller_id: string | null
          sku_id: string | null
          target_type: string
        }
        Insert: {
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          is_exclusion?: boolean
          listing_id?: string | null
          product_id?: string | null
          promotion_id: string
          seller_id?: string | null
          sku_id?: string | null
          target_type: string
        }
        Update: {
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          is_exclusion?: boolean
          listing_id?: string | null
          product_id?: string | null
          promotion_id?: string
          seller_id?: string | null
          sku_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_targets_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          approved_by: string | null
          badge_color: string | null
          badge_text: string | null
          buy_quantity: number | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_paise: number | null
          discount_percentage: number | null
          ends_at: string
          funded_by: string
          get_quantity: number | null
          id: string
          is_exclusive: boolean
          max_discount_paise: number | null
          min_cart_value_paise: number | null
          name: string
          per_user_limit: number | null
          promotion_type: string
          seller_funded_percentage: number | null
          stack_priority: number
          starts_at: string
          status: string
          terms_url: string | null
          total_usage_limit: number | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          approved_by?: string | null
          badge_color?: string | null
          badge_text?: string | null
          buy_quantity?: number | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_paise?: number | null
          discount_percentage?: number | null
          ends_at: string
          funded_by: string
          get_quantity?: number | null
          id?: string
          is_exclusive?: boolean
          max_discount_paise?: number | null
          min_cart_value_paise?: number | null
          name: string
          per_user_limit?: number | null
          promotion_type: string
          seller_funded_percentage?: number | null
          stack_priority?: number
          starts_at: string
          status?: string
          terms_url?: string | null
          total_usage_limit?: number | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          approved_by?: string | null
          badge_color?: string | null
          badge_text?: string | null
          buy_quantity?: number | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_paise?: number | null
          discount_percentage?: number | null
          ends_at?: string
          funded_by?: string
          get_quantity?: number | null
          id?: string
          is_exclusive?: boolean
          max_discount_paise?: number | null
          min_cart_value_paise?: number | null
          name?: string
          per_user_limit?: number | null
          promotion_type?: string
          seller_funded_percentage?: number | null
          stack_priority?: number
          starts_at?: string
          status?: string
          terms_url?: string | null
          total_usage_limit?: number | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      tax_rules: {
        Row: {
          cess_rate: number
          created_at: string
          description: string
          effective_from: string
          effective_to: string | null
          gst_rate: number
          hsn_code: string
          id: string
          is_exempt: boolean
          is_nil_rated: boolean
          notification_reference: string | null
          price_threshold_paise: number | null
          rate_above_threshold: number | null
          updated_at: string
        }
        Insert: {
          cess_rate?: number
          created_at?: string
          description: string
          effective_from: string
          effective_to?: string | null
          gst_rate: number
          hsn_code: string
          id?: string
          is_exempt?: boolean
          is_nil_rated?: boolean
          notification_reference?: string | null
          price_threshold_paise?: number | null
          rate_above_threshold?: number | null
          updated_at?: string
        }
        Update: {
          cess_rate?: number
          created_at?: string
          description?: string
          effective_from?: string
          effective_to?: string | null
          gst_rate?: number
          hsn_code?: string
          id?: string
          is_exempt?: boolean
          is_nil_rated?: boolean
          notification_reference?: string | null
          price_threshold_paise?: number | null
          rate_above_threshold?: number | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_buy_box_score: { Args: { p_listing_id: string }; Returns: number }
      recompute_buy_box: { Args: { p_sku_id: string }; Returns: string }
      resolve_commission: {
        Args: {
          p_as_of?: string
          p_brand_id: string
          p_category_id: string
          p_fulfillment_model?: string
          p_item_price_paise: unknown
          p_product_id: string
          p_seller_id: string
        }
        Returns: {
          closing_fee_paise: unknown
          commission_gst_rate: unknown
          commission_paise: unknown
          commission_percentage: unknown
          fulfillment_fee_paise: unknown
          payment_gateway_fee_percentage: unknown
          rule_id: string
        }[]
      }
      resolve_gst_rate: {
        Args: {
          p_amount_paise?: unknown
          p_as_of?: string
          p_hsn_code: unknown
        }
        Returns: {
          cess_rate: unknown
          gst_rate: unknown
          is_exempt: boolean
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  returns: {
    Tables: {
      replacement_orders: {
        Row: {
          created_at: string
          difference_settlement: string | null
          id: string
          original_order_id: string
          original_order_item_id: string
          price_difference_paise: number
          replacement_order_id: string
          replacement_order_item_id: string | null
          return_request_id: string
        }
        Insert: {
          created_at?: string
          difference_settlement?: string | null
          id?: string
          original_order_id: string
          original_order_item_id: string
          price_difference_paise?: number
          replacement_order_id: string
          replacement_order_item_id?: string | null
          return_request_id: string
        }
        Update: {
          created_at?: string
          difference_settlement?: string | null
          id?: string
          original_order_id?: string
          original_order_item_id?: string
          price_difference_paise?: number
          replacement_order_id?: string
          replacement_order_item_id?: string | null
          return_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replacement_orders_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: true
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      return_evidence: {
        Row: {
          caption: string | null
          content_hash: string | null
          created_at: string
          evidence_type: string
          file_size_bytes: number
          id: string
          mime_type: string
          return_item_id: string | null
          return_request_id: string
          storage_bucket: string
          storage_path: string
          uploaded_by: string | null
          uploaded_by_type: string
        }
        Insert: {
          caption?: string | null
          content_hash?: string | null
          created_at?: string
          evidence_type: string
          file_size_bytes: number
          id?: string
          mime_type: string
          return_item_id?: string | null
          return_request_id: string
          storage_bucket?: string
          storage_path: string
          uploaded_by?: string | null
          uploaded_by_type?: string
        }
        Update: {
          caption?: string | null
          content_hash?: string | null
          created_at?: string
          evidence_type?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string
          return_item_id?: string | null
          return_request_id?: string
          storage_bucket?: string
          storage_path?: string
          uploaded_by?: string | null
          uploaded_by_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_evidence_return_item_id_fkey"
            columns: ["return_item_id"]
            isOneToOne: false
            referencedRelation: "return_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_evidence_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      return_inspections: {
        Row: {
          all_accessories_present: boolean
          checklist: Json
          counterfeit_suspected: boolean
          deduction_paise: number
          deduction_reason: string | null
          grade: string | null
          id: string
          inspected_at: string
          inspected_by: string | null
          item_matches_order: boolean
          notes: string | null
          original_packaging_present: boolean
          outcome: string
          physical_damage_found: boolean
          return_request_id: string
          serial_number_matches: boolean | null
          usage_signs_found: boolean
          warehouse_id: string | null
        }
        Insert: {
          all_accessories_present: boolean
          checklist?: Json
          counterfeit_suspected?: boolean
          deduction_paise?: number
          deduction_reason?: string | null
          grade?: string | null
          id?: string
          inspected_at?: string
          inspected_by?: string | null
          item_matches_order: boolean
          notes?: string | null
          original_packaging_present: boolean
          outcome: string
          physical_damage_found?: boolean
          return_request_id: string
          serial_number_matches?: boolean | null
          usage_signs_found?: boolean
          warehouse_id?: string | null
        }
        Update: {
          all_accessories_present?: boolean
          checklist?: Json
          counterfeit_suspected?: boolean
          deduction_paise?: number
          deduction_reason?: string | null
          grade?: string | null
          id?: string
          inspected_at?: string
          inspected_by?: string | null
          item_matches_order?: boolean
          notes?: string | null
          original_packaging_present?: boolean
          outcome?: string
          physical_damage_found?: boolean
          return_request_id?: string
          serial_number_matches?: boolean | null
          usage_signs_found?: boolean
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_inspections_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: true
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      return_items: {
        Row: {
          approved_refund_paise: number | null
          created_at: string
          id: string
          order_item_id: string
          qc_grade: string | null
          qc_outcome: string | null
          quantity: number
          reason_code: string
          reason_details: string | null
          refundable_paise: number
          restocked_quantity: number
          return_request_id: string
          scrapped_quantity: number
          sku_id: string
        }
        Insert: {
          approved_refund_paise?: number | null
          created_at?: string
          id?: string
          order_item_id: string
          qc_grade?: string | null
          qc_outcome?: string | null
          quantity: number
          reason_code: string
          reason_details?: string | null
          refundable_paise: number
          restocked_quantity?: number
          return_request_id: string
          scrapped_quantity?: number
          sku_id: string
        }
        Update: {
          approved_refund_paise?: number | null
          created_at?: string
          id?: string
          order_item_id?: string
          qc_grade?: string | null
          qc_outcome?: string | null
          quantity?: number
          reason_code?: string
          reason_details?: string | null
          refundable_paise?: number
          restocked_quantity?: number
          return_request_id?: string
          scrapped_quantity?: number
          sku_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_items_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      return_policies: {
        Row: {
          allowed_reason_codes: string[]
          category_id: string | null
          created_at: string
          customer_bears_reverse_freight: boolean
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          name: string
          priority: number
          product_id: string | null
          replacement_window_days: number | null
          requires_all_accessories: boolean
          requires_invoice: boolean
          requires_original_packaging: boolean
          requires_qc: boolean
          restock_on_pass: boolean
          restocking_fee_percentage: number
          return_type: string
          return_window_days: number
          reverse_freight_paise: number
          scope_type: string
          seller_id: string | null
          updated_at: string
        }
        Insert: {
          allowed_reason_codes?: string[]
          category_id?: string | null
          created_at?: string
          customer_bears_reverse_freight?: boolean
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          name: string
          priority?: number
          product_id?: string | null
          replacement_window_days?: number | null
          requires_all_accessories?: boolean
          requires_invoice?: boolean
          requires_original_packaging?: boolean
          requires_qc?: boolean
          restock_on_pass?: boolean
          restocking_fee_percentage?: number
          return_type: string
          return_window_days: number
          reverse_freight_paise?: number
          scope_type: string
          seller_id?: string | null
          updated_at?: string
        }
        Update: {
          allowed_reason_codes?: string[]
          category_id?: string | null
          created_at?: string
          customer_bears_reverse_freight?: boolean
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          product_id?: string | null
          replacement_window_days?: number | null
          requires_all_accessories?: boolean
          requires_invoice?: boolean
          requires_original_packaging?: boolean
          requires_qc?: boolean
          restock_on_pass?: boolean
          restocking_fee_percentage?: number
          return_type?: string
          return_window_days?: number
          reverse_freight_paise?: number
          scope_type?: string
          seller_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      return_reasons: {
        Row: {
          allowed_resolutions: string[]
          auto_approve: boolean
          category: string
          code: string
          created_at: string
          display_order: number
          fault_attribution: string
          id: string
          is_active: boolean
          label: string
          label_hi: string | null
          min_evidence_count: number
          requires_evidence: boolean
          requires_qc: boolean
        }
        Insert: {
          allowed_resolutions?: string[]
          auto_approve?: boolean
          category: string
          code: string
          created_at?: string
          display_order?: number
          fault_attribution: string
          id?: string
          is_active?: boolean
          label: string
          label_hi?: string | null
          min_evidence_count?: number
          requires_evidence?: boolean
          requires_qc?: boolean
        }
        Update: {
          allowed_resolutions?: string[]
          auto_approve?: boolean
          category?: string
          code?: string
          created_at?: string
          display_order?: number
          fault_attribution?: string
          id?: string
          is_active?: boolean
          label?: string
          label_hi?: string | null
          min_evidence_count?: number
          requires_evidence?: boolean
          requires_qc?: boolean
        }
        Relationships: []
      }
      return_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cancelled_at: string | null
          completed_at: string | null
          cost_borne_by: string | null
          created_at: string
          customer_comments: string | null
          customer_return_count_90d: number | null
          eligibility_snapshot: Json
          id: string
          idempotency_key: string | null
          order_id: string
          picked_up_at: string | null
          pickup_address: Json | null
          pickup_scheduled_date: string | null
          reason_code: string
          reason_details: string | null
          received_at: string | null
          refund_amount_paise: number | null
          refund_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          replacement_order_id: string | null
          request_type: string
          resolution_granted: string | null
          resolution_requested: string
          restocking_fee_paise: number
          return_reference: string
          reverse_freight_paise: number
          reverse_shipment_id: string | null
          risk_flags: string[]
          seller_id: string
          status: string
          status_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          cost_borne_by?: string | null
          created_at?: string
          customer_comments?: string | null
          customer_return_count_90d?: number | null
          eligibility_snapshot?: Json
          id?: string
          idempotency_key?: string | null
          order_id: string
          picked_up_at?: string | null
          pickup_address?: Json | null
          pickup_scheduled_date?: string | null
          reason_code: string
          reason_details?: string | null
          received_at?: string | null
          refund_amount_paise?: number | null
          refund_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          replacement_order_id?: string | null
          request_type: string
          resolution_granted?: string | null
          resolution_requested: string
          restocking_fee_paise?: number
          return_reference: string
          reverse_freight_paise?: number
          reverse_shipment_id?: string | null
          risk_flags?: string[]
          seller_id: string
          status?: string
          status_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          cost_borne_by?: string | null
          created_at?: string
          customer_comments?: string | null
          customer_return_count_90d?: number | null
          eligibility_snapshot?: Json
          id?: string
          idempotency_key?: string | null
          order_id?: string
          picked_up_at?: string | null
          pickup_address?: Json | null
          pickup_scheduled_date?: string | null
          reason_code?: string
          reason_details?: string | null
          received_at?: string | null
          refund_amount_paise?: number | null
          refund_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          replacement_order_id?: string | null
          request_type?: string
          resolution_granted?: string | null
          resolution_requested?: string
          restocking_fee_paise?: number
          return_reference?: string
          reverse_freight_paise?: number
          reverse_shipment_id?: string | null
          risk_flags?: string[]
          seller_id?: string
          status?: string
          status_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_requests_reverse_shipment_fk"
            columns: ["reverse_shipment_id"]
            isOneToOne: false
            referencedRelation: "reverse_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      return_status_history: {
        Row: {
          actor_id: string | null
          actor_type: string
          from_status: string | null
          id: string
          occurred_at: string
          reason: string | null
          return_request_id: string
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          from_status?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          return_request_id: string
          to_status: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          from_status?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          return_request_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_status_history_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      reverse_shipments: {
        Row: {
          awb_number: string | null
          carrier_id: string | null
          created_at: string
          delivered_at: string | null
          doorstep_qc_notes: string | null
          doorstep_qc_passed: boolean | null
          doorstep_qc_performed: boolean
          freight_paise: number | null
          id: string
          picked_up_at: string | null
          pickup_attempts: number
          pickup_scheduled_date: string | null
          return_request_id: string
          shipment_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          awb_number?: string | null
          carrier_id?: string | null
          created_at?: string
          delivered_at?: string | null
          doorstep_qc_notes?: string | null
          doorstep_qc_passed?: boolean | null
          doorstep_qc_performed?: boolean
          freight_paise?: number | null
          id?: string
          picked_up_at?: string | null
          pickup_attempts?: number
          pickup_scheduled_date?: string | null
          return_request_id: string
          shipment_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          awb_number?: string | null
          carrier_id?: string | null
          created_at?: string
          delivered_at?: string | null
          doorstep_qc_notes?: string | null
          doorstep_qc_passed?: boolean | null
          doorstep_qc_performed?: boolean
          freight_paise?: number | null
          id?: string
          picked_up_at?: string | null
          pickup_attempts?: number
          pickup_scheduled_date?: string | null
          return_request_id?: string
          shipment_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reverse_shipments_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_eligibility: {
        Args: { p_order_item_id: string; p_reason_code?: string }
        Returns: {
          block_reason: string
          days_remaining: number
          is_eligible: boolean
          requires_evidence: boolean
          return_type: string
          window_closes_on: string
        }[]
      }
      resolve_policy: {
        Args: {
          p_as_of?: string
          p_category_id: string
          p_product_id: string
          p_seller_id: string
        }
        Returns: {
          allowed_reason_codes: string[]
          category_id: string | null
          created_at: string
          customer_bears_reverse_freight: boolean
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          name: string
          priority: number
          product_id: string | null
          replacement_window_days: number | null
          requires_all_accessories: boolean
          requires_invoice: boolean
          requires_original_packaging: boolean
          requires_qc: boolean
          restock_on_pass: boolean
          restocking_fee_percentage: number
          return_type: string
          return_window_days: number
          reverse_freight_paise: number
          scope_type: string
          seller_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "return_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  seller: {
    Tables: {
      seller_bank_accounts: {
        Row: {
          account_holder_name: string
          account_number_encrypted: string
          account_number_hash: string
          account_number_last4: string
          account_type: string
          bank_name: string
          branch_name: string | null
          created_at: string
          deleted_at: string | null
          failure_reason: string | null
          id: string
          ifsc: string
          is_primary: boolean
          name_match_score: number | null
          seller_id: string
          updated_at: string
          upi_vpa: string | null
          verification_method: string | null
          verification_reference: string | null
          verification_response: Json
          verification_status: string
          verified_at: string | null
          verified_holder_name: string | null
        }
        Insert: {
          account_holder_name: string
          account_number_encrypted: string
          account_number_hash: string
          account_number_last4: string
          account_type?: string
          bank_name: string
          branch_name?: string | null
          created_at?: string
          deleted_at?: string | null
          failure_reason?: string | null
          id?: string
          ifsc: string
          is_primary?: boolean
          name_match_score?: number | null
          seller_id: string
          updated_at?: string
          upi_vpa?: string | null
          verification_method?: string | null
          verification_reference?: string | null
          verification_response?: Json
          verification_status?: string
          verified_at?: string | null
          verified_holder_name?: string | null
        }
        Update: {
          account_holder_name?: string
          account_number_encrypted?: string
          account_number_hash?: string
          account_number_last4?: string
          account_type?: string
          bank_name?: string
          branch_name?: string | null
          created_at?: string
          deleted_at?: string | null
          failure_reason?: string | null
          id?: string
          ifsc?: string
          is_primary?: boolean
          name_match_score?: number | null
          seller_id?: string
          updated_at?: string
          upi_vpa?: string | null
          verification_method?: string | null
          verification_reference?: string | null
          verification_response?: Json
          verification_status?: string
          verified_at?: string | null
          verified_holder_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_bank_accounts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_documents: {
        Row: {
          content_hash: string
          created_at: string
          document_number_encrypted: string | null
          document_number_masked: string | null
          document_type: string
          expires_at: string | null
          external_verification: Json
          file_size_bytes: number
          id: string
          mime_type: string
          original_filename: string | null
          rejection_reason: string | null
          seller_id: string
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          content_hash: string
          created_at?: string
          document_number_encrypted?: string | null
          document_number_masked?: string | null
          document_type: string
          expires_at?: string | null
          external_verification?: Json
          file_size_bytes: number
          id?: string
          mime_type: string
          original_filename?: string | null
          rejection_reason?: string | null
          seller_id: string
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          content_hash?: string
          created_at?: string
          document_number_encrypted?: string | null
          document_number_masked?: string | null
          document_type?: string
          expires_at?: string | null
          external_verification?: Json
          file_size_bytes?: number
          id?: string
          mime_type?: string
          original_filename?: string | null
          rejection_reason?: string | null
          seller_id?: string
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_documents_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_performance: {
        Row: {
          average_dispatch_hours: number | null
          average_rating: number | null
          computed_at: string
          created_at: string
          defect_rate: number | null
          gmv_paise: number
          negative_feedback_rate: number | null
          on_time_delivery_rate: number | null
          on_time_dispatch_rate: number | null
          orders_count: number
          return_rate: number | null
          rto_rate: number | null
          score: number | null
          seller_cancellation_rate: number | null
          seller_id: string
          support_escalation_rate: number | null
          tier: string
          units_sold: number
          updated_at: string
          window_days: number
        }
        Insert: {
          average_dispatch_hours?: number | null
          average_rating?: number | null
          computed_at?: string
          created_at?: string
          defect_rate?: number | null
          gmv_paise?: number
          negative_feedback_rate?: number | null
          on_time_delivery_rate?: number | null
          on_time_dispatch_rate?: number | null
          orders_count?: number
          return_rate?: number | null
          rto_rate?: number | null
          score?: number | null
          seller_cancellation_rate?: number | null
          seller_id: string
          support_escalation_rate?: number | null
          tier?: string
          units_sold?: number
          updated_at?: string
          window_days?: number
        }
        Update: {
          average_dispatch_hours?: number | null
          average_rating?: number | null
          computed_at?: string
          created_at?: string
          defect_rate?: number | null
          gmv_paise?: number
          negative_feedback_rate?: number | null
          on_time_delivery_rate?: number | null
          on_time_dispatch_rate?: number | null
          orders_count?: number
          return_rate?: number | null
          rto_rate?: number | null
          score?: number | null
          seller_cancellation_rate?: number | null
          seller_id?: string
          support_escalation_rate?: number | null
          tier?: string
          units_sold?: number
          updated_at?: string
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "seller_performance_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_status_history: {
        Row: {
          changed_by: string | null
          from_status: string | null
          id: string
          occurred_at: string
          reason: string | null
          review_notes: Json
          seller_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          from_status?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          review_notes?: Json
          seller_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          from_status?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          review_notes?: Json
          seller_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_status_history_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_tax_profiles: {
        Row: {
          additional_gstins: Json
          created_at: string
          gst_registration_type: string
          gst_state_code: string
          gstin: string | null
          gstin_verified_at: string | null
          legal_name_as_per_pan: string
          pan: string
          pan_verified_at: string | null
          seller_id: string
          tan: string | null
          tcs_applicable: boolean
          trade_name_as_per_gst: string | null
          updated_at: string
          verification_source: Json
        }
        Insert: {
          additional_gstins?: Json
          created_at?: string
          gst_registration_type?: string
          gst_state_code: string
          gstin?: string | null
          gstin_verified_at?: string | null
          legal_name_as_per_pan: string
          pan: string
          pan_verified_at?: string | null
          seller_id: string
          tan?: string | null
          tcs_applicable?: boolean
          trade_name_as_per_gst?: string | null
          updated_at?: string
          verification_source?: Json
        }
        Update: {
          additional_gstins?: Json
          created_at?: string
          gst_registration_type?: string
          gst_state_code?: string
          gstin?: string | null
          gstin_verified_at?: string | null
          legal_name_as_per_pan?: string
          pan?: string
          pan_verified_at?: string | null
          seller_id?: string
          tan?: string | null
          tcs_applicable?: boolean
          trade_name_as_per_gst?: string | null
          updated_at?: string
          verification_source?: Json
        }
        Relationships: [
          {
            foreignKeyName: "seller_tax_profiles_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_users: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invite_expires_at: string | null
          invite_token_hash: string | null
          invited_by: string | null
          invited_email: string | null
          invited_phone: string | null
          removed_at: string | null
          role_code: string
          seller_id: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          invited_by?: string | null
          invited_email?: string | null
          invited_phone?: string | null
          removed_at?: string | null
          role_code: string
          seller_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          invited_by?: string | null
          invited_email?: string | null
          invited_phone?: string | null
          removed_at?: string | null
          role_code?: string
          seller_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_users_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          about: string | null
          agreement_accepted_at: string | null
          agreement_version: string | null
          approved_at: string | null
          approved_by: string | null
          business_type: string
          created_at: string
          created_by: string | null
          default_commission_percentage: number | null
          dispatch_sla_hours: number
          display_name: string
          fulfillment_models: string[]
          id: string
          legal_name: string
          logo_url: string | null
          onboarding_step: string
          primary_contact_email: string
          primary_contact_name: string
          primary_contact_phone: string
          rating: number | null
          rating_count: number
          registered_address_line1: string | null
          registered_address_line2: string | null
          registered_city: string | null
          registered_pincode: string | null
          registered_state_code: string | null
          seller_code: string
          seller_score: number | null
          settlement_cycle: string
          settlement_hold_days: number
          slug: string
          status: string
          status_changed_at: string | null
          status_changed_by: string | null
          status_reason: string | null
          support_email: string | null
          support_phone: string | null
          updated_at: string
          vacation_from: string | null
          vacation_to: string | null
        }
        Insert: {
          about?: string | null
          agreement_accepted_at?: string | null
          agreement_version?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_type: string
          created_at?: string
          created_by?: string | null
          default_commission_percentage?: number | null
          dispatch_sla_hours?: number
          display_name: string
          fulfillment_models?: string[]
          id?: string
          legal_name: string
          logo_url?: string | null
          onboarding_step?: string
          primary_contact_email: string
          primary_contact_name: string
          primary_contact_phone: string
          rating?: number | null
          rating_count?: number
          registered_address_line1?: string | null
          registered_address_line2?: string | null
          registered_city?: string | null
          registered_pincode?: string | null
          registered_state_code?: string | null
          seller_code: string
          seller_score?: number | null
          settlement_cycle?: string
          settlement_hold_days?: number
          slug: string
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          vacation_from?: string | null
          vacation_to?: string | null
        }
        Update: {
          about?: string | null
          agreement_accepted_at?: string | null
          agreement_version?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_type?: string
          created_at?: string
          created_by?: string | null
          default_commission_percentage?: number | null
          dispatch_sla_hours?: number
          display_name?: string
          fulfillment_models?: string[]
          id?: string
          legal_name?: string
          logo_url?: string | null
          onboarding_step?: string
          primary_contact_email?: string
          primary_contact_name?: string
          primary_contact_phone?: string
          rating?: number | null
          rating_count?: number
          registered_address_line1?: string | null
          registered_address_line2?: string | null
          registered_city?: string | null
          registered_pincode?: string | null
          registered_state_code?: string | null
          seller_code?: string
          seller_score?: number | null
          settlement_cycle?: string
          settlement_hold_days?: number
          slug?: string
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          vacation_from?: string | null
          vacation_to?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_transactable: { Args: { p_seller_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  support: {
    Tables: {
      help_articles: {
        Row: {
          audience: string
          body_html: string
          category_id: string | null
          created_at: string
          display_order: number
          helpful_count: number
          id: string
          locale: string
          not_helpful_count: number
          published_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: string
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          audience?: string
          body_html: string
          category_id?: string | null
          created_at?: string
          display_order?: number
          helpful_count?: number
          id?: string
          locale?: string
          not_helpful_count?: number
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: string
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          audience?: string
          body_html?: string
          category_id?: string | null
          created_at?: string
          display_order?: number
          helpful_count?: number
          id?: string
          locale?: string
          not_helpful_count?: number
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: string
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "help_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      macros: {
        Row: {
          actions: Json
          body: string
          category_id: string | null
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          locale: string
          name: string
          required_params: string[]
          updated_at: string
          usage_count: number
        }
        Insert: {
          actions?: Json
          body: string
          category_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          locale?: string
          name: string
          required_params?: string[]
          updated_at?: string
          usage_count?: number
        }
        Update: {
          actions?: Json
          body?: string
          category_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          locale?: string
          name?: string
          required_params?: string[]
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "macros_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policies: {
        Row: {
          code: string
          created_at: string
          escalate_at_percentage: number
          first_response_minutes: number
          id: string
          is_active: boolean
          name: string
          operating_hours: Json
          priority: string
          resolution_minutes: number
        }
        Insert: {
          code: string
          created_at?: string
          escalate_at_percentage?: number
          first_response_minutes: number
          id?: string
          is_active?: boolean
          name: string
          operating_hours?: Json
          priority: string
          resolution_minutes: number
        }
        Update: {
          code?: string
          created_at?: string
          escalate_at_percentage?: number
          first_response_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          operating_hours?: Json
          priority?: string
          resolution_minutes?: number
        }
        Relationships: []
      }
      support_attachments: {
        Row: {
          content_hash: string | null
          created_at: string
          file_size_bytes: number
          id: string
          message_id: string | null
          mime_type: string
          original_filename: string | null
          scan_status: string
          storage_bucket: string
          storage_path: string
          ticket_id: string
          uploaded_by: string | null
          uploaded_by_type: string
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          file_size_bytes: number
          id?: string
          message_id?: string | null
          mime_type: string
          original_filename?: string | null
          scan_status?: string
          storage_bucket?: string
          storage_path: string
          ticket_id: string
          uploaded_by?: string | null
          uploaded_by_type?: string
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          file_size_bytes?: number
          id?: string
          message_id?: string | null
          mime_type?: string
          original_filename?: string | null
          scan_status?: string
          storage_bucket?: string
          storage_path?: string
          ticket_id?: string
          uploaded_by?: string | null
          uploaded_by_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          email_message_id: string | null
          id: string
          in_reply_to: string | null
          is_internal: boolean
          macro_id: string | null
          read_by_requester_at: string | null
          sender_id: string | null
          sender_name: string | null
          sender_type: string
          ticket_id: string
        }
        Insert: {
          body: string
          created_at?: string
          email_message_id?: string | null
          id?: string
          in_reply_to?: string | null
          is_internal?: boolean
          macro_id?: string | null
          read_by_requester_at?: string | null
          sender_id?: string | null
          sender_name?: string | null
          sender_type: string
          ticket_id: string
        }
        Update: {
          body?: string
          created_at?: string
          email_message_id?: string | null
          id?: string
          in_reply_to?: string | null
          is_internal?: boolean
          macro_id?: string | null
          read_by_requester_at?: string | null
          sender_id?: string | null
          sender_name?: string | null
          sender_type?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_in_reply_to_fkey"
            columns: ["in_reply_to"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_macro_fk"
            columns: ["macro_id"]
            isOneToOne: false
            referencedRelation: "macros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_at: string | null
          assigned_team: string | null
          assigned_to: string | null
          category_id: string | null
          channel: string
          closed_at: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          csat_comment: string | null
          csat_score: number | null
          csat_submitted_at: string | null
          description: string
          escalated_at: string | null
          escalated_to: string | null
          escalation_level: number
          escalation_reason: string | null
          first_responded_at: string | null
          first_response_breached: boolean
          first_response_due_at: string | null
          id: string
          message_count: number
          order_id: string | null
          order_item_id: string | null
          payment_intent_id: string | null
          priority: string
          queue: string
          refund_id: string | null
          reopen_count: number
          requester_id: string | null
          requester_type: string
          resolution_breached: boolean
          resolution_code: string | null
          resolution_due_at: string | null
          resolution_notes: string | null
          resolved_at: string | null
          return_request_id: string | null
          seller_id: string | null
          sentiment: string | null
          shipment_id: string | null
          sla_policy_id: string | null
          status: string
          subject: string
          tags: string[]
          ticket_reference: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_team?: string | null
          assigned_to?: string | null
          category_id?: string | null
          channel?: string
          closed_at?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          csat_comment?: string | null
          csat_score?: number | null
          csat_submitted_at?: string | null
          description: string
          escalated_at?: string | null
          escalated_to?: string | null
          escalation_level?: number
          escalation_reason?: string | null
          first_responded_at?: string | null
          first_response_breached?: boolean
          first_response_due_at?: string | null
          id?: string
          message_count?: number
          order_id?: string | null
          order_item_id?: string | null
          payment_intent_id?: string | null
          priority?: string
          queue?: string
          refund_id?: string | null
          reopen_count?: number
          requester_id?: string | null
          requester_type: string
          resolution_breached?: boolean
          resolution_code?: string | null
          resolution_due_at?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          return_request_id?: string | null
          seller_id?: string | null
          sentiment?: string | null
          shipment_id?: string | null
          sla_policy_id?: string | null
          status?: string
          subject: string
          tags?: string[]
          ticket_reference: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_team?: string | null
          assigned_to?: string | null
          category_id?: string | null
          channel?: string
          closed_at?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          csat_comment?: string | null
          csat_score?: number | null
          csat_submitted_at?: string | null
          description?: string
          escalated_at?: string | null
          escalated_to?: string | null
          escalation_level?: number
          escalation_reason?: string | null
          first_responded_at?: string | null
          first_response_breached?: boolean
          first_response_due_at?: string | null
          id?: string
          message_count?: number
          order_id?: string | null
          order_item_id?: string | null
          payment_intent_id?: string | null
          priority?: string
          queue?: string
          refund_id?: string | null
          reopen_count?: number
          requester_id?: string | null
          requester_type?: string
          resolution_breached?: boolean
          resolution_code?: string | null
          resolution_due_at?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          return_request_id?: string | null
          seller_id?: string | null
          sentiment?: string | null
          shipment_id?: string | null
          sla_policy_id?: string | null
          status?: string
          subject?: string
          tags?: string[]
          ticket_reference?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_sla_policy_id_fkey"
            columns: ["sla_policy_id"]
            isOneToOne: false
            referencedRelation: "sla_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_categories: {
        Row: {
          audience: string
          code: string
          created_at: string
          default_queue: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          requires_order: boolean
          sla_policy_id: string | null
        }
        Insert: {
          audience: string
          code: string
          created_at?: string
          default_queue?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          requires_order?: boolean
          sla_policy_id?: string | null
        }
        Update: {
          audience?: string
          code?: string
          created_at?: string
          default_queue?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          requires_order?: boolean
          sla_policy_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_categories_sla_policy_id_fkey"
            columns: ["sla_policy_id"]
            isOneToOne: false
            referencedRelation: "sla_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_status_history: {
        Row: {
          actor_id: string | null
          from_assignee: string | null
          from_status: string | null
          id: string
          occurred_at: string
          reason: string | null
          ticket_id: string
          to_assignee: string | null
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          from_assignee?: string | null
          from_status?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          ticket_id: string
          to_assignee?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string | null
          from_assignee?: string | null
          from_status?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          ticket_id?: string
          to_assignee?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_status_history_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  analytics: {
    Enums: {},
  },
  audit: {
    Enums: {},
  },
  catalog: {
    Enums: {},
  },
  commerce: {
    Enums: {},
  },
  finance: {
    Enums: {},
  },
  fulfillment: {
    Enums: {},
  },
  identity: {
    Enums: {},
  },
  inventory: {
    Enums: {},
  },
  marketing: {
    Enums: {},
  },
  payments: {
    Enums: {},
  },
  platform: {
    Enums: {},
  },
  pricing: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  returns: {
    Enums: {},
  },
  seller: {
    Enums: {},
  },
  support: {
    Enums: {},
  },
} as const
