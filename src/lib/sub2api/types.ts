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
  payment_type?: string | null;
  created_at?: string | null;
  paid_at?: string | null;
}
