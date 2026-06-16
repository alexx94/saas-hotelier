export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
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
      arrival_rules: {
        Row: {
          created_at: string
          end_date: string
          id: string
          name: string
          no_arrival: boolean
          no_departure: boolean
          org_id: string
          property_id: string
          start_date: string
          unit_type_id: string | null
          updated_at: string
          weekdays: number[] | null
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          name: string
          no_arrival?: boolean
          no_departure?: boolean
          org_id: string
          property_id: string
          start_date: string
          unit_type_id?: string | null
          updated_at?: string
          weekdays?: number[] | null
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          no_arrival?: boolean
          no_departure?: boolean
          org_id?: string
          property_id?: string
          start_date?: string
          unit_type_id?: string | null
          updated_at?: string
          weekdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "arrival_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrival_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrival_rules_unit_type_id_fkey"
            columns: ["unit_type_id"]
            isOneToOne: false
            referencedRelation: "unit_types"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_events: {
        Row: {
          actor_id: string | null
          booking_id: string
          created_at: string
          event_type: string
          id: string
          new_data: Json | null
          old_data: Json | null
          org_id: string
        }
        Insert: {
          actor_id?: string | null
          booking_id: string
          created_at?: string
          event_type: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          org_id: string
        }
        Update: {
          actor_id?: string | null
          booking_id?: string
          created_at?: string
          event_type?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          adults: number
          amount_paid: number
          booked_email: string | null
          booked_full_name: string | null
          booked_phone: string | null
          check_in: string
          check_out: string
          children: number
          created_at: string
          currency: string
          guest_id: string | null
          guests_count: number | null
          id: string
          notes: string | null
          org_id: string
          payment_status: string
          price_breakdown: Json
          property_id: string
          source: string
          status: string
          stay: unknown
          total_amount: number
          unit_id: string
          unit_price: number
          unit_type_id: string
          updated_at: string
        }
        Insert: {
          adults?: number
          amount_paid?: number
          booked_email?: string | null
          booked_full_name?: string | null
          booked_phone?: string | null
          check_in: string
          check_out: string
          children?: number
          created_at?: string
          currency: string
          guest_id?: string | null
          guests_count?: number | null
          id?: string
          notes?: string | null
          org_id: string
          payment_status?: string
          price_breakdown?: Json
          property_id: string
          source?: string
          status?: string
          stay?: unknown
          total_amount?: number
          unit_id: string
          unit_price?: number
          unit_type_id: string
          updated_at?: string
        }
        Update: {
          adults?: number
          amount_paid?: number
          booked_email?: string | null
          booked_full_name?: string | null
          booked_phone?: string | null
          check_in?: string
          check_out?: string
          children?: number
          created_at?: string
          currency?: string
          guest_id?: string | null
          guests_count?: number | null
          id?: string
          notes?: string | null
          org_id?: string
          payment_status?: string
          price_breakdown?: Json
          property_id?: string
          source?: string
          status?: string
          stay?: unknown
          total_amount?: number
          unit_id?: string
          unit_price?: number
          unit_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_unit_type_id_fkey"
            columns: ["unit_type_id"]
            isOneToOne: false
            referencedRelation: "unit_types"
            referencedColumns: ["id"]
          },
        ]
      }
      closures: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          notes: string | null
          org_id: string
          period: unknown
          property_id: string
          reason: string
          start_date: string
          unit_type_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          notes?: string | null
          org_id: string
          period?: unknown
          property_id: string
          reason?: string
          start_date: string
          unit_type_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          notes?: string | null
          org_id?: string
          period?: unknown
          property_id?: string
          reason?: string
          start_date?: string
          unit_type_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "closures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closures_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closures_unit_type_id_fkey"
            columns: ["unit_type_id"]
            isOneToOne: false
            referencedRelation: "unit_types"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          org_id: string
          phone: string | null
          phone_search: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          org_id: string
          phone?: string | null
          phone_search?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          phone_search?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_property_access: {
        Row: {
          member_id: string
          property_id: string
        }
        Insert: {
          member_id: string
          property_id: string
        }
        Update: {
          member_id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_property_access_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_property_access_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          currency: string
          id: string
          kind: string
          method: string
          note: string | null
          org_id: string
          paid_at: string
          property_id: string
          provider: string
          provider_ref: string | null
          recorded_by: string | null
          recorded_by_email: string | null
          status: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          currency: string
          id?: string
          kind?: string
          method?: string
          note?: string | null
          org_id: string
          paid_at?: string
          property_id: string
          provider?: string
          provider_ref?: string | null
          recorded_by?: string | null
          recorded_by_email?: string | null
          status?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          method?: string
          note?: string | null
          org_id?: string
          paid_at?: string
          property_id?: string
          provider?: string
          provider_ref?: string | null
          recorded_by?: string | null
          recorded_by_email?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          city: string | null
          country: string
          created_at: string
          currency: string
          default_locale: string
          description: Json
          id: string
          is_published: boolean
          name: string
          org_id: string
          settings: Json
          slug: string
          timezone: string
          type: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          currency?: string
          default_locale?: string
          description?: Json
          id?: string
          is_published?: boolean
          name: string
          org_id: string
          settings?: Json
          slug: string
          timezone?: string
          type?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          currency?: string
          default_locale?: string
          description?: Json
          id?: string
          is_published?: boolean
          name?: string
          org_id?: string
          settings?: Json
          slug?: string
          timezone?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_rules: {
        Row: {
          created_at: string
          end_date: string
          id: string
          kind: string
          name: string
          org_id: string
          price: number
          property_id: string
          start_date: string
          unit_type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          kind: string
          name: string
          org_id: string
          price: number
          property_id: string
          start_date: string
          unit_type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          kind?: string
          name?: string
          org_id?: string
          price?: number
          property_id?: string
          start_date?: string
          unit_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_rules_unit_type_id_fkey"
            columns: ["unit_type_id"]
            isOneToOne: false
            referencedRelation: "unit_types"
            referencedColumns: ["id"]
          },
        ]
      }
      room_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          notes: string | null
          org_id: string
          period: unknown
          property_id: string
          reason: string
          start_date: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          notes?: string | null
          org_id: string
          period?: unknown
          property_id: string
          reason?: string
          start_date: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          notes?: string | null
          org_id?: string
          period?: unknown
          property_id?: string
          reason?: string
          start_date?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_blocks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_blocks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_blocks_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      stay_rules: {
        Row: {
          created_at: string
          end_date: string
          id: string
          max_stay: number | null
          min_stay: number | null
          name: string
          org_id: string
          property_id: string
          start_date: string
          unit_type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          max_stay?: number | null
          min_stay?: number | null
          name: string
          org_id: string
          property_id: string
          start_date: string
          unit_type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          max_stay?: number | null
          min_stay?: number | null
          name?: string
          org_id?: string
          property_id?: string
          start_date?: string
          unit_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stay_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stay_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stay_rules_unit_type_id_fkey"
            columns: ["unit_type_id"]
            isOneToOne: false
            referencedRelation: "unit_types"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_events: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          new_data: Json | null
          old_data: Json | null
          org_id: string
          unit_id: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          org_id: string
          unit_id: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          org_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_events_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_type_events: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          new_data: Json | null
          old_data: Json | null
          org_id: string
          unit_type_id: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          org_id: string
          unit_type_id: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          org_id?: string
          unit_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_type_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_type_events_unit_type_id_fkey"
            columns: ["unit_type_id"]
            isOneToOne: false
            referencedRelation: "unit_types"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_types: {
        Row: {
          base_price: number
          created_at: string
          description: Json
          id: string
          is_active: boolean
          max_adults: number
          max_children: number
          max_stay: number
          min_stay: number
          name: string
          org_id: string
          property_id: string
          sort_order: number
          turnover_days: number
          weekend_adjustment_type: string
          weekend_adjustment_value: number
          weekend_days: number[]
        }
        Insert: {
          base_price?: number
          created_at?: string
          description?: Json
          id?: string
          is_active?: boolean
          max_adults?: number
          max_children?: number
          max_stay?: number
          min_stay?: number
          name: string
          org_id: string
          property_id: string
          sort_order?: number
          turnover_days?: number
          weekend_adjustment_type?: string
          weekend_adjustment_value?: number
          weekend_days?: number[]
        }
        Update: {
          base_price?: number
          created_at?: string
          description?: Json
          id?: string
          is_active?: boolean
          max_adults?: number
          max_children?: number
          max_stay?: number
          min_stay?: number
          name?: string
          org_id?: string
          property_id?: string
          sort_order?: number
          turnover_days?: number
          weekend_adjustment_type?: string
          weekend_adjustment_value?: number
          weekend_days?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "unit_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_types_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          property_id: string
          status: string
          unit_type_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          property_id: string
          status?: string
          unit_type_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          property_id?: string
          status?: string
          unit_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_unit_type_id_fkey"
            columns: ["unit_type_id"]
            isOneToOne: false
            referencedRelation: "unit_types"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      block_unit: {
        Args: {
          p_end: string
          p_notes?: string
          p_reason?: string
          p_start: string
          p_unit_id: string
        }
        Returns: string
      }
      bulk_block_units: {
        Args: {
          p_end: string
          p_notes?: string
          p_reason?: string
          p_start: string
          p_unit_ids: string[]
        }
        Returns: Json
      }
      bulk_delete_units: { Args: { p_unit_ids: string[] }; Returns: Json }
      bulk_remove_blocks: {
        Args: { p_end: string; p_start: string; p_unit_ids: string[] }
        Returns: number
      }
      bulk_update_unit_status: {
        Args: { p_status: string; p_unit_ids: string[] }
        Returns: Json
      }
      create_booking: {
        Args: {
          p_adults?: number
          p_check_in: string
          p_check_out: string
          p_children?: number
          p_guest_id?: string
          p_notes?: string
          p_override?: boolean
          p_status?: string
          p_unit_id?: string
          p_unit_type_id: string
        }
        Returns: string
      }
      create_organization: {
        Args: { p_name: string; p_slug: string }
        Returns: string
      }
      find_or_create_guest: {
        Args: {
          p_email?: string
          p_full_name: string
          p_org_id: string
          p_phone?: string
        }
        Returns: Json
      }
      generate_units: {
        Args: {
          p_count: number
          p_prefix?: string
          p_start_number?: number
          p_unit_type_id: string
        }
        Returns: number
      }
      get_available_units: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_exclude_booking_id?: string
          p_unit_type_id: string
        }
        Returns: {
          is_free: boolean
          name: string
          status: string
          unit_id: string
        }[]
      }
      get_booking_restrictions: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_unit_type_id: string
        }
        Returns: Json
      }
      get_guest_stats: {
        Args: { p_guest_id: string }
        Returns: {
          cancelled: number
          total: number
          upcoming: number
        }[]
      }
      get_rate_calendar: {
        Args: { p_from: string; p_property_id: string; p_to: string }
        Returns: {
          day: string
          kind: string
          rate: number
          unit_type_id: string
        }[]
      }
      get_revenue_summary: {
        Args: { p_property_id: string }
        Returns: {
          currency: string
          revenue_month: number
          revenue_today: number
          revenue_year: number
        }[]
      }
      get_stay_constraints: {
        Args: { p_check_in: string; p_unit_type_id: string }
        Returns: Json
      }
      link_booking_guest: {
        Args: { p_booking_id: string; p_guest_id: string }
        Returns: undefined
      }
      public_create_booking: {
        Args: {
          p_adults?: number
          p_check_in: string
          p_check_out: string
          p_children?: number
          p_email: string
          p_full_name: string
          p_notes?: string
          p_phone?: string
          p_slug: string
          p_unit_type_id: string
        }
        Returns: Json
      }
      public_get_availability: {
        Args: {
          p_adults?: number
          p_check_in: string
          p_check_out: string
          p_children?: number
          p_slug: string
        }
        Returns: {
          available_units: number
          currency: string
          description: Json
          max_adults: number
          max_children: number
          max_stay: number
          min_stay: number
          name: string
          price_per_night: number
          total_price: number
          unit_type_id: string
        }[]
      }
      quote_price: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_unit_type_id: string
        }
        Returns: Json
      }
      reassign_booking: {
        Args: { p_booking_id: string; p_unit_id: string }
        Returns: undefined
      }
      record_payment: {
        Args: {
          p_amount: number
          p_booking_id: string
          p_kind?: string
          p_method?: string
          p_note?: string
          p_paid_at?: string
          p_provider_ref?: string
        }
        Returns: string
      }
      remove_block: { Args: { p_block_id: string }; Returns: undefined }
      update_booking_dates: {
        Args: {
          p_booking_id: string
          p_check_in: string
          p_check_out: string
          p_override?: boolean
        }
        Returns: undefined
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

