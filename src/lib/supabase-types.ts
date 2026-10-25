export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      friendships: {
        Row: {
          id: string;
          user_id_1: string;
          user_id_2: string;
          status: 'pending' | 'accepted' | 'blocked';
          action_user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id_1: string;
          user_id_2: string;
          status?: 'pending' | 'accepted' | 'blocked';
          action_user_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id_1?: string;
          user_id_2?: string;
          status?: 'pending' | 'accepted' | 'blocked';
          action_user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_url?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          avatar_url?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_by: string;
          default_currency: string;
          image_url: string | null;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          created_by: string;
          default_currency?: string;
          image_url?: string | null;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          created_by?: string;
          default_currency?: string;
          image_url?: string | null;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        };
        Relationships: [];
      };
      group_members: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'member';
          status: 'active' | 'invited' | 'removed';
          joined_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          role?: 'owner' | 'admin' | 'member';
          status?: 'active' | 'invited' | 'removed';
          joined_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          user_id?: string;
          role?: 'owner' | 'admin' | 'member';
          status?: 'active' | 'invited' | 'removed';
          joined_at?: string;
        };
        Relationships: [];
      };
      group_invitations: {
        Row: {
          id: string;
          group_id: string;
          invited_email: string;
          invited_by: string;
          role: 'admin' | 'member';
          status: 'pending' | 'accepted' | 'expired' | 'revoked';
          token: string;
          expires_at: string;
          accepted_by: string | null;
          created_at: string;
          accepted_at: string | null;
        };
        Insert: {
          id?: string;
          group_id: string;
          invited_email: string;
          invited_by: string;
          role?: 'admin' | 'member';
          status?: 'pending' | 'accepted' | 'expired' | 'revoked';
          token?: string;
          expires_at?: string;
          accepted_by?: string | null;
          created_at?: string;
          accepted_at?: string | null;
        };
        Update: {
          id?: string;
          group_id?: string;
          invited_email?: string;
          invited_by?: string;
          role?: 'admin' | 'member';
          status?: 'pending' | 'accepted' | 'expired' | 'revoked';
          token?: string;
          expires_at?: string;
          accepted_by?: string | null;
          created_at?: string;
          accepted_at?: string | null;
        };
        Relationships: [];
      };
      personal_expenses: {
        Row: {
          id: string;
          owner_id: string;
          description: string;
          notes: string | null;
          category_id: string | null;
          amount_minor: number;
          currency: string;
          expense_date: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          owner_id: string;
          description: string;
          notes?: string | null;
          category_id?: string | null;
          amount_minor: number;
          currency?: string;
          expense_date?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          owner_id?: string;
          description?: string;
          notes?: string | null;
          category_id?: string | null;
          amount_minor?: number;
          currency?: string;
          expense_date?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      group_expenses: {
        Row: {
          id: string;
          context_type: 'direct' | 'group';
          group_id: string | null;
          friendship_id: string | null;
          description: string;
          notes: string | null;
          category_id: string | null;
          paid_by: string;
          amount_minor: number;
          currency: string;
          reporting_currency: string;
          exchange_rate: number | null;
          exchange_rate_date: string | null;
          exchange_rate_source: string | null;
          reporting_amount_minor: number;
          split_type: 'equal' | 'exact' | 'percentage' | 'shares';
          expense_date: string;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          context_type?: 'direct' | 'group';
          group_id?: string | null;
          friendship_id?: string | null;
          description: string;
          notes?: string | null;
          category_id?: string | null;
          paid_by: string;
          amount_minor: number;
          currency?: string;
          reporting_currency?: string;
          exchange_rate?: number | null;
          exchange_rate_date?: string | null;
          exchange_rate_source?: string | null;
          reporting_amount_minor: number;
          split_type?: 'equal' | 'exact' | 'percentage' | 'shares';
          expense_date?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          context_type?: 'direct' | 'group';
          group_id?: string | null;
          friendship_id?: string | null;
          description?: string;
          notes?: string | null;
          category_id?: string | null;
          paid_by?: string;
          amount_minor?: number;
          currency?: string;
          reporting_currency?: string;
          exchange_rate?: number | null;
          exchange_rate_date?: string | null;
          exchange_rate_source?: string | null;
          reporting_amount_minor?: number;
          split_type?: 'equal' | 'exact' | 'percentage' | 'shares';
          expense_date?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      expense_splits: {
        Row: {
          id: string;
          group_expense_id: string;
          user_id: string;
          share_minor: number;
          weight: number | null;
          percentage_basis_points: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_expense_id: string;
          user_id: string;
          share_minor: number;
          weight?: number | null;
          percentage_basis_points?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          group_expense_id?: string;
          user_id?: string;
          share_minor?: number;
          weight?: number | null;
          percentage_basis_points?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      settlements: {
        Row: {
          id: string;
          context_type: 'direct' | 'group';
          group_id: string | null;
          friendship_id: string | null;
          from_user_id: string;
          to_user_id: string;
          amount_minor: number;
          currency: string;
          settlement_date: string;
          notes: string | null;
          exchange_rate: number | null;
          exchange_rate_date: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          context_type?: 'direct' | 'group';
          group_id?: string | null;
          friendship_id?: string | null;
          from_user_id: string;
          to_user_id: string;
          amount_minor: number;
          currency?: string;
          settlement_date?: string;
          notes?: string | null;
          exchange_rate?: number | null;
          exchange_rate_date?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          context_type?: 'direct' | 'group';
          group_id?: string | null;
          friendship_id?: string | null;
          from_user_id?: string;
          to_user_id?: string;
          amount_minor?: number;
          currency?: string;
          settlement_date?: string;
          notes?: string | null;
          exchange_rate?: number | null;
          exchange_rate_date?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          icon: string;
          color: string;
          owner_id: string | null;
          group_id: string | null;
          is_system: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          icon?: string;
          color?: string;
          owner_id?: string | null;
          group_id?: string | null;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          icon?: string;
          color?: string;
          owner_id?: string | null;
          group_id?: string | null;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      currency_rates_cache: {
        Row: {
          id: string;
          base_currency: string;
          quote_currency: string;
          rate: number;
          rate_date: string;
          fetched_at: string;
          source: string;
        };
        Insert: {
          id?: string;
          base_currency: string;
          quote_currency: string;
          rate: number;
          rate_date: string;
          fetched_at?: string;
          source?: string;
        };
        Update: {
          id?: string;
          base_currency?: string;
          quote_currency?: string;
          rate?: number;
          rate_date?: string;
          fetched_at?: string;
          source?: string;
        };
        Relationships: [];
      };
      expense_receipts: {
        Row: {
          id: string;
          expense_id: string;
          storage_path: string;
          uploaded_by: string;
          original_filename: string | null;
          content_type: string;
          file_size: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          expense_id: string;
          storage_path: string;
          uploaded_by: string;
          original_filename?: string | null;
          content_type?: string;
          file_size: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          expense_id?: string;
          storage_path?: string;
          uploaded_by?: string;
          original_filename?: string | null;
          content_type?: string;
          file_size?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_direct_expense_with_splits: {
        Args: {
          p_friend_id: string;
          p_description: string;
          p_notes: string | null;
          p_category_id: string | null;
          p_paid_by: string;
          p_amount_minor: number;
          p_currency: string;
          p_reporting_currency: string;
          p_exchange_rate: number | null;
          p_exchange_rate_date: string | null;
          p_exchange_rate_source: string | null;
          p_reporting_amount_minor: number;
          p_split_type: string;
          p_expense_date: string;
          p_splits: Json;
        };
        Returns: Json;
      };
      record_direct_settlement: {
        Args: {
          p_friend_id: string;
          p_amount_minor: number;
          p_currency: string;
          p_settlement_date: string;
          p_notes: string | null;
          p_payer_id: string;
          p_recipient_id: string;
        };
        Returns: Json;
      };
      get_or_create_friendship: {
        Args: {
          p_user_a: string;
          p_user_b: string;
        };
        Returns: string;
      };
      create_group_with_owner: {
        Args: {
          p_name: string;
          p_description?: string | null;
          p_currency?: string;
          p_image_url?: string | null;
        };
        Returns: Json;
      };
      create_group_expense_with_splits: {
        Args: {
          p_group_id: string;
          p_description: string;
          p_notes: string | null;
          p_category_id: string | null;
          p_paid_by: string;
          p_amount_minor: number;
          p_currency: string;
          p_reporting_currency: string;
          p_exchange_rate: number | null;
          p_exchange_rate_date: string | null;
          p_exchange_rate_source: string | null;
          p_reporting_amount_minor: number;
          p_split_type: string;
          p_expense_date: string;
          p_splits: Json;
        };
        Returns: Json;
      };
      accept_group_invitation: {
        Args: {
          p_token: string;
        };
        Returns: Json;
      };
      is_group_member: {
        Args: {
          p_group_id: string;
          p_user_id: string;
        };
        Returns: boolean;
      };
      can_admin_group: {
        Args: {
          p_group_id: string;
          p_user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
