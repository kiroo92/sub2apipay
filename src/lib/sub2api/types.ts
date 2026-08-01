export interface Sub2ApiUser {
  id: number;
  username: string;
  email: string;
  status: string;
  balance: number;
  notes?: string;
}

export interface Sub2ApiPaymentOrder {
  id: number | string;
  user_id: number;
  user_name?: string | null;
  user_email?: string | null;
  user_notes?: string | null;
  amount: number;
  status?: string | null;
  order_type?: string | null;
  plan_id?: number | null;
  subscription_group_id?: number | null;
  subscription_days?: number | null;
  payment_type?: string | null;
  refund_amount: number;
  created_at?: string | null;
  paid_at?: string | null;
}

export interface Sub2ApiSubscriptionPlan {
  id: number;
  group_id: number;
  name: string;
  product_name?: string | null;
  validity_days: number;
  validity_unit: string;
}

export interface Sub2ApiUsageStats {
  total_requests: number;
  total_cost: number;
  total_actual_cost: number;
}

export interface Sub2ApiSubscription {
  id: number;
  user_id: number;
  group_id: number;
  starts_at: string;
  expires_at: string;
  status: string;
}
