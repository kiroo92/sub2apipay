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
  payment_type?: string | null;
  refund_amount: number;
  created_at?: string | null;
  paid_at?: string | null;
}

export interface Sub2ApiSubscription {
  id: number;
  user_id: number;
  group_id: number;
  starts_at: string;
  expires_at: string;
  status: string;
}
