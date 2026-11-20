'use client';
/**
 * orderStore — carries the order selection from the Orders list to the
 * Order detail screen. Zustand module store: both screens read/write
 * the same selectedOrderId without prop-drilling through the shell.
 * Row click in the list sets it, then onNavigate('orders', 'order-detail')
 * opens the tab that renders OrderDetailPage.
 *
 * Also carries an optional order summary (id, customer, total, status,
 * items, supplier, sla) so the detail screen can render instantly from
 * the cached list row before the full record is fetched.
 */
import { create } from 'zustand';

export interface OrderSummary {
  id: string;
  customer?: string;
  total?: string;
  status?: string;
  items?: string;
  supplier?: string;
  sla?: string;
  slaPast?: boolean;
}

interface OrderStoreState {
  selectedOrderId: string | null;
  selectedOrderSummary: OrderSummary | null;
  setSelectedOrder: (id: string, summary?: OrderSummary) => void;
  clearSelection: () => void;
}

export const useOrderStore = create<OrderStoreState>((set) => ({
  selectedOrderId: null,
  selectedOrderSummary: null,
  setSelectedOrder: (id, summary) =>
    set({ selectedOrderId: id, selectedOrderSummary: summary ?? null }),
  clearSelection: () =>
    set({ selectedOrderId: null, selectedOrderSummary: null }),
}));
