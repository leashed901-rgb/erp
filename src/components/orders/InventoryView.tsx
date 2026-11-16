'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { DomainKey } from '@/data/shellData';
import { fetchJson } from '@/hooks/useCrmApi';
import type { StockRecord, StockMovement } from '@/lib/erpTypes';
import RowMenu, { RowMenuItem, BulkBar } from '@/components/ListPrimitives';
import styles from './OrdersPages.module.css';

interface OrdersScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
  onCreate?: (label: string) => void;
  onOpenCreateFlyout?: () => void;
  /** Module-3 inventory domain: land on the matching sub-tab (stock/transfers/counts/warehouses). */
  initialTab?: SubTab;
}

type SubTab = 'stock' | 'transfers' | 'counts' | 'warehouses' | 'replenishment' | 'items';
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'stock', label: 'Stock on hand' },
  { id: 'items', label: 'Finance items' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'counts', label: 'Cycle counts' },
  { id: 'warehouses', label: 'Warehouses' },
  { id: 'replenishment', label: 'Replenishment' },
];
const STATUS_TABS = ['All', 'In stock', 'Low stock', 'Out of stock', 'Overstock', 'Negative'] as const;

interface Warehouse {
  id: string; code: string; name: string; warehouse_type: string;
  city: string | null; state: string | null; is_active: boolean;
  on_hand: number;
  locations: { id: string; code: string; name: string | null; location_type: string; is_receiving: boolean; is_pickable: boolean; is_active: boolean }[];
}
interface Transfer {
  id: string; transfer_number: string; from_warehouse: string | null; to_warehouse: string | null;
  status: string; requested_at: string | null; received_at: string | null; notes: string | null;
  lines: { sku: string | null; quantity: number; shipped_quantity: number; received_quantity: number }[];
}
interface CountSession {
  id: string; count_number: string; warehouse: string | null; count_type: string; status: string;
  scheduled_for: string | null; lines: number; counted: number; variance: number;
}
interface CountDetail {
  id: string; count_number: string; warehouse: string | null; status: string;
  approved_at: string | null;
  lines: { id: string; sku: string | null; product: string | null; expected_quantity: number; counted_quantity: number | null; variance_quantity: number | null }[];
}
interface Rule {
  id: string; sku: string | null; product: string | null; warehouse: string | null;
  method: string; reorder_point: number; safety_stock: number; maximum_stock: number | null;
  economic_order_quantity: number | null; lead_time_days: number; preferred_vendor: string | null;
  is_active: boolean; on_hand: number; available: number; tripped: boolean;
}
interface Vendor { id: string; name: string }
interface FinanceItem {
  id: string; classificationId: string; classificationName: string | null; classificationCode: string | null;
  itemType: string; name: string; sku: string | null; skuId: string | null; skuLabel: string | null;
  unitOfMeasure: string; salesPrice: number | null; purchaseCost: number | null; lastUnitCost: number | null;
  reorderPoint: number | null; isActive: boolean; onHand: number; layerValue: number;
}
interface ItemClassification {
  id: string; level: string; code: string; name: string; itemCount: number; isActive: boolean;
}
interface ItemDetail extends FinanceItem {
  layers: { id: string; layerDate: string; qtyIn: number; qtyRemaining: number; unitCost: number }[];
  moves: { id: string; moveDate: string; moveType: string; quantity: number; unitCost: number; totalCost: number; reference: string | null; reason: string | null }[];
  draws: { id: string; moveId: string; layerId: string; layerDate: string | null; quantity: number; unitCost: number }[];
}
interface CoaRow { id: string; code: string; name: string; account_type: string }

const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function InventoryView({ onToast, onNavigate, onCreate, onOpenCreateFlyout, initialTab }: OrdersScreenProps) {
  const [subTab, setSubTab] = useState<SubTab>(initialTab ?? 'stock');
  const [rows, setRows] = useState<StockRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ total: 0, inStock: 0, lowStock: 0, outOfStock: 0, overstock: 0, negative: 0, warehouses: 0 });
  const [overview, setOverview] = useState<{ openPOs: number; onOrderValue: number; inventoryValue: number; belowReorder: number; receivings7d: number; countVariance: number | null } | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [warehouse, setWarehouse] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [countSessions, setCountSessions] = useState<CountSession[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // Drawers / modals
  const [adjustRow, setAdjustRow] = useState<StockRecord | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustWh, setAdjustWh] = useState('');
  const [adjustCost, setAdjustCost] = useState('');
  const [adjustBusy, setAdjustBusy] = useState(false);
  const [transferRow, setTransferRow] = useState<StockRecord | null>(null);
  const [transferQty, setTransferQty] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const [historyRow, setHistoryRow] = useState<StockRecord | null>(null);
  const [historyEvents, setHistoryEvents] = useState<StockMovement[]>([]);
  const [historyNote, setHistoryNote] = useState<string | null>(null);
  const [countWh, setCountWh] = useState('');
  const [countBusy, setCountBusy] = useState(false);
  const [countDetail, setCountDetail] = useState<CountDetail | null>(null);
  const [countedInputs, setCountedInputs] = useState<Record<string, string>>({});
  const [countBusy2, setCountBusy2] = useState(false);
  const [whName, setWhName] = useState('');
  const [whCode, setWhCode] = useState('');
  const [whType, setWhType] = useState('warehouse');
  const [whCity, setWhCity] = useState('');
  const [whState, setWhState] = useState('');
  const [whBusy, setWhBusy] = useState(false);
  const [locWh, setLocWh] = useState<string | null>(null);
  const [locCode, setLocCode] = useState('');
  const [locName, setLocName] = useState('');
  const [locBusy, setLocBusy] = useState(false);
  const [ruleRow, setRuleRow] = useState<StockRecord | null>(null);
  const [ruleReorder, setRuleReorder] = useState('');
  const [ruleSafety, setRuleSafety] = useState('');
  const [ruleMax, setRuleMax] = useState('');
  const [ruleEoq, setRuleEoq] = useState('');
  const [ruleLead, setRuleLead] = useState('');
  const [ruleVendor, setRuleVendor] = useState('');
  const [ruleWh, setRuleWh] = useState('');
  const [ruleBusy, setRuleBusy] = useState(false);

  // Finance items (Batch F — acct_items master + layers/moves/draws).
  const [items, setItems] = useState<FinanceItem[]>([]);
  const [classifications, setClassifications] = useState<ItemClassification[]>([]);
  const [accounts, setAccounts] = useState<CoaRow[]>([]);
  const [itemDetail, setItemDetail] = useState<ItemDetail | null>(null);
  const [itemBusy, setItemBusy] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemClass, setItemClass] = useState('');
  const [itemType, setItemType] = useState('inventory');
  const [itemSkuId, setItemSkuId] = useState('');
  const [itemUom, setItemUom] = useState('each');
  const [itemSalesPrice, setItemSalesPrice] = useState('');
  const [itemPurchaseCost, setItemPurchaseCost] = useState('');
  const [itemAssetAccount, setItemAssetAccount] = useState('');
  const [itemIncomeAccount, setItemIncomeAccount] = useState('');
  const [itemCogsAccount, setItemCogsAccount] = useState('');
  const [itemReorder, setItemReorder] = useState('');
  const [clsLevel, setClsLevel] = useState('department');
  const [clsCode, setClsCode] = useState('');
  const [clsName, setClsName] = useState('');
  const [clsParent, setClsParent] = useState('');
  const [clsBusy, setClsBusy] = useState(false);
  const [itemAdjQty, setItemAdjQty] = useState('');
  const [itemAdjReason, setItemAdjReason] = useState('');
  const [itemAdjCost, setItemAdjCost] = useState('');
  const [itemAdjBusy, setItemAdjBusy] = useState(false);

  const loadStock = useCallback(async () => {
    const res = await fetchJson<{ rows: StockRecord[]; total: number; counts: typeof counts; warehouses: { id: string; name: string; code: string }[] }>(
      `/api/v1/inventory?q=${encodeURIComponent(search)}&status=${activeTab === 'All' ? 'all' : encodeURIComponent(activeTab)}&warehouse=${warehouse}&limit=500`,
    );
    if (!res.ok) {
      setLoadError(res.error || 'Failed to load inventory');
    } else {
      setRows(res.data.rows);
      setTotal(res.data.total);
      setCounts(res.data.counts);
      setLoadError(null);
    }
    setLoaded(true);
  }, [search, activeTab, warehouse]);

  const loadOverview = useCallback(async () => {
    const res = await fetchJson<{ data: { kpis: { openPOs: number; onOrderValue: number; inventoryValue: number; belowReorder: number; receivings7d: number; countVariance: number | null } } }>('/api/v1/inventory/overview');
    if (res.ok && res.data) setOverview(res.data.data.kpis);
  }, []);

  const loadWarehouses = useCallback(async () => {
    const res = await fetchJson<{ data: Warehouse[] }>('/api/v1/inventory/warehouses');
    if (res.ok && res.data) setWarehouses(res.data.data);
  }, []);

  const loadTransfers = useCallback(async () => {
    const res = await fetchJson<{ data: Transfer[] }>('/api/v1/inventory/transfers');
    if (res.ok && res.data) setTransfers(res.data.data);
  }, []);

  const loadCounts = useCallback(async () => {
    const res = await fetchJson<{ data: CountSession[] }>('/api/v1/inventory/cycle-counts');
    if (res.ok && res.data) setCountSessions(res.data.data);
  }, []);

  const loadRules = useCallback(async () => {
    const res = await fetchJson<{ data: Rule[] }>('/api/v1/inventory/replenishment');
    if (res.ok && res.data) setRules(res.data.data);
  }, []);

  const loadVendors = useCallback(async () => {
    const res = await fetchJson<{ data: Vendor[] }>('/api/v1/inventory/vendors');
    if (res.ok && res.data) setVendors(res.data.data);
  }, []);

  // Batch F — finance item master.
  const loadItems = useCallback(async () => {
    const res = await fetchJson<{ data: FinanceItem[] }>('/api/inventory-items');
    if (res.ok && res.data) setItems(res.data.data);
  }, []);
  const loadClassifications = useCallback(async () => {
    const res = await fetchJson<{ data: ItemClassification[] }>('/api/item-classifications');
    if (res.ok && res.data) setClassifications(res.data.data);
  }, []);
  const loadAccounts = useCallback(async () => {
    const res = await fetchJson<{ data: CoaRow[] }>('/api/accounts?limit=500');
    if (res.ok && res.data) setAccounts(res.data.data);
  }, []);

  async function openItemDetail(id: string) {
    const res = await fetchJson<{ data: ItemDetail }>(`/api/inventory-items/${id}`);
    if (!res.ok) { onToast(`Could not open item: ${res.error}`); return; }
    setItemDetail(res.data.data);
    setItemAdjQty(''); setItemAdjReason(''); setItemAdjCost('');
  }

  async function submitClassification() {
    if (!clsCode.trim() || !clsName.trim()) { onToast('Classification code and name are required'); return; }
    setClsBusy(true);
    const res = await fetchJson<{ data: ItemClassification }>('/api/item-classifications', {
      method: 'POST',
      body: JSON.stringify({ level: clsLevel, code: clsCode.trim(), name: clsName.trim(), parentId: clsParent || null }),
    });
    setClsBusy(false);
    if (!res.ok) { onToast(`Classification failed: ${res.error}`); return; }
    onToast(`Classification ${res.data?.data.code} created`);
    setClsCode(''); setClsName(''); setClsParent('');
    loadClassifications();
  }

  async function submitItem() {
    if (!itemName.trim()) { onToast('Item name is required'); return; }
    if (!itemClass) { onToast('Pick a classification — create one below first if none exist'); return; }
    setItemBusy(true);
    const res = await fetchJson<{ data: FinanceItem }>('/api/inventory-items', {
      method: 'POST',
      body: JSON.stringify({
        name: itemName.trim(),
        classificationId: itemClass,
        itemType,
        unitOfMeasure: itemUom.trim() || 'each',
        skuId: itemSkuId || null,
        productVariantId: itemSkuId ? (rows.find(r => r.skuId === itemSkuId)?.variantId ?? null) : null,
        salesPrice: itemSalesPrice ? Number(itemSalesPrice) : null,
        purchaseCost: itemPurchaseCost ? Number(itemPurchaseCost) : null,
        inventoryAssetAccountId: itemAssetAccount || null,
        incomeAccountId: itemIncomeAccount || null,
        cogsAccountId: itemCogsAccount || null,
        reorderPoint: itemReorder ? Number(itemReorder) : null,
      }),
    });
    setItemBusy(false);
    if (!res.ok) { onToast(`Item failed: ${res.error}`); return; }
    onToast(`Finance item ${res.data?.data.name} created — adjust stock in to give it on-hand`);
    setItemName(''); setItemSkuId(''); setItemSalesPrice(''); setItemPurchaseCost(''); setItemReorder('');
    setItemAssetAccount(''); setItemIncomeAccount(''); setItemCogsAccount('');
    loadItems();
  }

  async function submitItemAdjust() {
    if (!itemDetail) return;
    const qty = Number(itemAdjQty);
    if (!Number.isFinite(qty) || qty === 0) { onToast('Enter a non-zero quantity change'); return; }
    if (!itemAdjReason.trim()) { onToast('A reason is required for inventory adjustments'); return; }
    setItemAdjBusy(true);
    const res = await fetchJson<{ data: { moveId: string; onHand: number } }>(`/api/inventory-items/${itemDetail.id}/adjust`, {
      method: 'POST',
      body: JSON.stringify({
        qtyChange: qty,
        reason: itemAdjReason.trim(),
        unitCost: itemAdjCost ? Number(itemAdjCost) : undefined,
      }),
    });
    setItemAdjBusy(false);
    if (!res.ok) { onToast(`Adjustment failed: ${res.error}`); return; }
    onToast(`Adjusted ${itemDetail.name}: on hand now ${res.data?.data.onHand}`);
    setItemAdjQty(''); setItemAdjReason(''); setItemAdjCost('');
    openItemDetail(itemDetail.id);
    loadItems();
  }

  useEffect(() => { loadStock(); }, [loadStock]);
  useEffect(() => { loadWarehouses(); loadVendors(); loadOverview(); }, [loadWarehouses, loadVendors, loadOverview]);
  useEffect(() => { if (subTab === 'transfers') loadTransfers(); }, [subTab, loadTransfers]);
  useEffect(() => { if (subTab === 'counts') loadCounts(); }, [subTab, loadCounts]);
  useEffect(() => { if (subTab === 'replenishment') loadRules(); }, [subTab, loadRules]);
  useEffect(() => { if (subTab === 'items') { loadItems(); loadClassifications(); loadAccounts(); } }, [subTab, loadItems, loadClassifications, loadAccounts]);

  const refreshAll = useCallback(() => {
    loadStock(); loadWarehouses(); loadTransfers(); loadCounts(); loadRules(); loadOverview();
  }, [loadStock, loadWarehouses, loadTransfers, loadCounts, loadRules, loadOverview]);

  const filtered = useMemo(() => rows, [rows]);

  const toggleSelect = (key: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const rowKey = (r: StockRecord) => `${r.variantId}:${r.warehouseId ?? ''}`;

  async function openHistory(row: StockRecord) {
    setHistoryRow(row);
    setHistoryEvents([]);
    setHistoryNote(null);
    const res = await fetchJson<{ data: StockMovement[]; note?: string }>(`/api/v1/inventory/${row.variantId}/history`);
    if (!res.ok) {
      setHistoryNote(res.error || 'Could not load history');
    } else {
      setHistoryEvents(res.data.data);
      setHistoryNote(res.data.note ?? null);
    }
  }

  async function submitAdjust() {
    if (!adjustRow) return;
    const qty = Number(adjustQty);
    if (!Number.isFinite(qty) || qty === 0) { onToast('Enter a non-zero quantity change'); return; }
    if (!adjustReason.trim()) { onToast('A reason is required for stock adjustments'); return; }
    setAdjustBusy(true);
    const res = await fetchJson<{ data: { on_hand: number } }>('/api/v1/inventory/adjust', {
      method: 'POST',
      body: JSON.stringify({
        variant_id: adjustRow.variantId,
        qty_change: qty,
        reason: adjustReason.trim(),
        warehouse_id: adjustWh || null,
        unit_cost: adjustCost ? Number(adjustCost) : undefined,
      }),
    });
    setAdjustBusy(false);
    if (!res.ok) { onToast(`Adjustment failed: ${res.error}`); return; }
    onToast(`Adjusted ${adjustRow.sku}: on hand now ${res.data?.data.on_hand}`);
    setAdjustRow(null); setAdjustQty(''); setAdjustReason(''); setAdjustCost('');
    refreshAll();
  }

  async function submitTransfer() {
    if (!transferRow) return;
    const qty = Number(transferQty);
    if (!Number.isFinite(qty) || qty <= 0) { onToast('Enter a quantity greater than 0'); return; }
    if (!transferTo) { onToast('Pick the destination warehouse'); return; }
    setTransferBusy(true);
    const res = await fetchJson<{ data: { transfer_number: string } }>('/api/v1/inventory/transfer', {
      method: 'POST',
      body: JSON.stringify({
        from_warehouse_id: transferRow.warehouseId,
        to_warehouse_id: transferTo,
        lines: [{ variant_id: transferRow.variantId, quantity: qty }],
        receive_now: true,
      }),
    });
    setTransferBusy(false);
    if (!res.ok) { onToast(`Transfer failed: ${res.error}`); return; }
    onToast(`Transferred ${qty} × ${transferRow.sku} — ${res.data?.data.transfer_number}`);
    setTransferRow(null); setTransferQty(''); setTransferTo('');
    refreshAll();
  }

  async function submitCount() {
    const wh = countWh || warehouses[0]?.id || '';
    if (!wh) { onToast('Add a warehouse first — cycle counts need one'); return; }
    const lines = (selected.size > 0 ? rows.filter(r => selected.has(rowKey(r))) : rows.filter(r => r.status === 'Low stock' || r.status === 'Out of stock'))
      .filter(r => r.skuId);
    if (lines.length === 0) { onToast('No countable rows — select rows with stock, or add a warehouse SKU first'); return; }
    setCountBusy(true);
    const res = await fetchJson<{ data: { count_number: string } }>('/api/v1/inventory/cycle-counts', {
      method: 'POST',
      body: JSON.stringify({ warehouse_id: wh, lines: lines.map(l => ({ variant_id: l.variantId })) }),
    });
    setCountBusy(false);
    if (!res.ok) { onToast(`Cycle count failed: ${res.error}`); return; }
    onToast(`Cycle count ${res.data?.data.count_number} started — ${lines.length} lines`);
    setSelected(new Set());
    setSubTab('counts');
    loadCounts();
  }

  async function openCount(id: string) {
    const res = await fetchJson<{ data: CountDetail }>(`/api/v1/inventory/cycle-counts/${id}`);
    if (!res.ok) {
      onToast(`Could not open count: ${res.error}`);
    } else {
      setCountDetail(res.data.data);
      setCountedInputs(Object.fromEntries(res.data.data.lines.map(l => [l.id, l.counted_quantity != null ? String(l.counted_quantity) : ''])));
    }
  }

  async function saveCounted() {
    if (!countDetail) return;
    const lines = Object.entries(countedInputs)
      .filter(([, v]) => v !== '')
      .map(([line_id, v]) => ({ line_id, counted_quantity: Number(v) }));
    if (lines.length === 0) { onToast('Enter a counted quantity on at least one line'); return; }
    setCountBusy2(true);
    const res = await fetchJson('/api/v1/inventory/cycle-counts/' + countDetail.id + '/lines', {
      method: 'POST',
      body: JSON.stringify({ lines }),
    });
    setCountBusy2(false);
    if (!res.ok) { onToast(`Count save failed: ${res.error}`); return; }
    onToast(`Counted ${lines.length} line(s)`);
    openCount(countDetail.id);
    loadCounts();
  }

  async function submitCountSession() {
    if (!countDetail) return;
    setCountBusy2(true);
    const res = await fetchJson('/api/v1/inventory/cycle-counts/' + countDetail.id + '/submit', { method: 'POST' });
    setCountBusy2(false);
    if (!res.ok) { onToast(`Submit failed: ${res.error}`); return; }
    onToast(`Count ${countDetail.count_number} submitted`);
    openCount(countDetail.id);
    loadCounts();
  }

  async function approveCountSession() {
    if (!countDetail) return;
    if (!confirm(`Approve count ${countDetail.count_number}? Approval lets large variances (over $10,000) post to the ledger.`)) return;
    setCountBusy2(true);
    const res = await fetchJson('/api/v1/inventory/cycle-counts/' + countDetail.id + '/approve', { method: 'POST' });
    setCountBusy2(false);
    if (!res.ok) { onToast(`Approve failed: ${res.error}`); return; }
    onToast(`Count ${countDetail.count_number} approved`);
    openCount(countDetail.id);
    loadCounts();
  }

  async function postCountSession() {
    if (!countDetail) return;
    if (!confirm(`Post count ${countDetail.count_number}? Variances become ledger adjustments.`)) return;
    setCountBusy2(true);
    const res = await fetchJson<{ data: unknown[] }>('/api/v1/inventory/cycle-counts/' + countDetail.id + '/post', { method: 'POST' });
    setCountBusy2(false);
    if (!res.ok) { onToast(`Post failed: ${res.error}`); return; }
    onToast(`Count ${countDetail.count_number} posted — ${(res.data?.data ?? []).length} item(s) adjusted`);
    setCountDetail(null);
    refreshAll();
  }

  async function submitWarehouse() {
    if (!whName.trim() || !whCode.trim()) { onToast('Warehouse name and code are required'); return; }
    setWhBusy(true);
    const res = await fetchJson<{ data: { name: string } }>('/api/v1/inventory/warehouses', {
      method: 'POST',
      body: JSON.stringify({ name: whName.trim(), code: whCode.trim(), warehouse_type: whType, city: whCity || null, state: whState || null }),
    });
    setWhBusy(false);
    if (!res.ok) { onToast(`Warehouse failed: ${res.error}`); return; }
    onToast(`Warehouse ${res.data?.data.name} created with a default location`);
    setWhName(''); setWhCode(''); setWhCity(''); setWhState('');
    loadWarehouses();
  }

  async function submitLocation() {
    if (!locWh || !locCode.trim()) { onToast('Location code is required'); return; }
    setLocBusy(true);
    const res = await fetchJson('/api/v1/inventory/warehouses/' + locWh + '/locations', {
      method: 'POST',
      body: JSON.stringify({ code: locCode.trim(), name: locName.trim() || locCode.trim() }),
    });
    setLocBusy(false);
    if (!res.ok) { onToast(`Location failed: ${res.error}`); return; }
    onToast(`Location ${locCode.trim().toUpperCase()} added`);
    setLocCode(''); setLocName(''); setLocWh(null);
    loadWarehouses();
  }

  async function deleteWarehouse(id: string, name: string) {
    if (!confirm(`Delete warehouse "${name}"? Its locations go with it; the movement ledger keeps the history.`)) return;
    const res = await fetchJson('/api/v1/inventory/warehouses/' + id, { method: 'DELETE' });
    if (!res.ok) { onToast(`Delete failed: ${res.error}`); return; }
    onToast(`Warehouse ${name} deleted`);
    loadWarehouses(); loadStock();
  }

  async function receiveTransfer(id: string, num: string) {
    const res = await fetchJson('/api/v1/inventory/transfers/' + id + '/receive', { method: 'POST' });
    if (!res.ok) { onToast(`Receive failed: ${res.error}`); return; }
    onToast(`Transfer ${num} received`);
    loadTransfers(); loadStock();
  }

  function openRuleForm(row: StockRecord) {
    setRuleRow(row);
    const existing = rules.find(r => r.sku === row.sku);
    setRuleReorder(existing ? String(existing.reorder_point) : (row.reorderPoint != null ? String(row.reorderPoint) : ''));
    setRuleSafety(existing ? String(existing.safety_stock) : '');
    setRuleMax(existing?.maximum_stock != null ? String(existing.maximum_stock) : '');
    setRuleEoq(existing?.economic_order_quantity != null ? String(existing.economic_order_quantity) : '');
    setRuleLead(existing ? String(existing.lead_time_days) : '');
    setRuleVendor('');
    setRuleWh(row.warehouseId ?? warehouses[0]?.id ?? '');
  }

  async function submitRule() {
    if (!ruleRow) return;
    const rp = Number(ruleReorder);
    if (!Number.isFinite(rp) || rp < 0) { onToast('Reorder point must be a number ≥ 0'); return; }
    if (!ruleWh) { onToast('Pick a warehouse for the rule'); return; }
    setRuleBusy(true);
    const res = await fetchJson('/api/v1/inventory/replenishment', {
      method: 'POST',
      body: JSON.stringify({
        variant_id: ruleRow.variantId,
        warehouse_id: ruleWh,
        reorder_point: rp,
        safety_stock: ruleSafety ? Number(ruleSafety) : 0,
        maximum_stock: ruleMax ? Number(ruleMax) : null,
        economic_order_quantity: ruleEoq ? Number(ruleEoq) : null,
        lead_time_days: ruleLead ? Number(ruleLead) : 0,
        preferred_vendor_id: ruleVendor || null,
      }),
    });
    setRuleBusy(false);
    if (!res.ok) { onToast(`Rule failed: ${res.error}`); return; }
    onToast(`Reorder rule saved for ${ruleRow.sku}`);
    setRuleRow(null);
    loadRules();
  }

  const rowMenuItems = (row: StockRecord): RowMenuItem[] => [
    { label: 'View in Catalog', icon: 'open_in_new', onClick: () => onNavigate('catalog', 'products') },
    { label: 'Adjust stock', icon: 'tune', onClick: () => { setAdjustRow(row); setAdjustWh(row.warehouseId ?? ''); } },
    { label: 'Transfer', icon: 'swap_horiz', onClick: () => { if (!row.warehouseId) { onToast('No stock in a warehouse to transfer — adjust stock into a warehouse first'); return; } setTransferRow(row); setTransferTo(''); } },
    { label: 'Reorder rule', icon: 'shopping_bag', onClick: () => openRuleForm(row) },
    { label: 'Stock history', icon: 'history', dividerBefore: true, onClick: () => openHistory(row) },
    { label: 'Start cycle count', icon: 'inventory_2', onClick: () => { setCountWh(row.warehouseId ?? warehouses[0]?.id ?? ''); setSelected(new Set([rowKey(row)])); setSubTab('stock'); } },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.contextHeader}>
        <div className={styles.contextLeft}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#5a6355' }}>local_shipping</span>
          <span className={styles.contextLabel}>Orders</span>
          <span className={styles.contextSep}>/</span>
          <span className={styles.contextActive}>Inventory</span>
        </div>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Inventory</h1>
            <p className={styles.pageSubtitle}>On-hand stock, bin locations, and reorder points across warehouses</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.btnSecondary} onClick={() => { refreshAll(); onToast('Inventory refreshed from the live ledger'); }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>sync</span>
              Refresh
            </button>
          </div>
        </div>

        {warehouses.length === 0 && (
          <div className="border border-surface-dim rounded-lg p-4 text-body-sm mb-4" style={{ background: '#fff8e1' }}>
            <strong>No warehouse set up yet.</strong> Every stock adjustment, transfer and receipt needs a warehouse first — add one on the Warehouses tab. POD products never carry stock.
          </div>
        )}
        {loadError && (
          <div className="border border-surface-dim rounded-lg p-4 text-body-sm mb-4" style={{ background: '#fdecea' }}>{loadError}</div>
        )}

        {/* Sub-tabs */}
        <div className={styles.viewTabsBar} style={{ marginBottom: 12 }}>
          {SUB_TABS.map(t => (
            <button key={t.id} className={`${styles.viewTab} ${subTab === t.id ? styles.viewTabActive : ''}`} onClick={() => setSubTab(t.id)}>
              {t.label}
              {t.id === 'warehouses' && ` (${warehouses.length})`}
              {t.id === 'transfers' && transfers.length > 0 && ` (${transfers.length})`}
              {t.id === 'counts' && countSessions.length > 0 && ` (${countSessions.length})`}
              {t.id === 'replenishment' && rules.filter(r => r.tripped).length > 0 && ` (${rules.filter(r => r.tripped).length} low)`}
            </button>
          ))}
        </div>

        {subTab === 'stock' && (
          <>
            <div className={styles.kpiGrid}>
              <button className={styles.kpiTile} onClick={() => setActiveTab('All')}>
                <div className={styles.kpiValue}>{counts.total}</div>
                <div className={styles.kpiLabel}>Tracked SKUs</div>
                <div className={styles.kpiDelta}>Stocked products only · POD carries no stock</div>
              </button>
              <button className={styles.kpiTile} onClick={() => setActiveTab('In stock')}>
                <div className={styles.kpiValue} style={{ color: '#1e5a38' }}>{counts.inStock}</div>
                <div className={styles.kpiLabel}>In stock</div>
                <div className={styles.kpiDelta}>{counts.warehouses} warehouse(s)</div>
              </button>
              <button className={styles.kpiTile} onClick={() => setActiveTab('Low stock')}>
                <div className={styles.kpiValue} style={{ color: '#6b1e28' }}>{counts.lowStock}</div>
                <div className={styles.kpiLabel}>Low stock</div>
                <div className={styles.kpiDelta}>At or below reorder point</div>
              </button>
              <button className={styles.kpiTile} onClick={() => setActiveTab('Out of stock')}>
                <div className={styles.kpiValue} style={{ color: '#ba1a1a' }}>{counts.outOfStock}</div>
                <div className={styles.kpiLabel}>Out of stock</div>
                <div className={styles.kpiDelta}>{counts.overstock} overstock · {counts.negative} negative</div>
              </button>
            </div>

            {/* Spec-3 overview stat bar — live values from /api/v1/inventory/overview. */}
            <div className={styles.kpiGrid}>
              <button className={styles.kpiTile} onClick={() => setSubTab('items')}>
                <div className={styles.kpiValue}>{overview == null ? '—' : money(overview.inventoryValue)}</div>
                <div className={styles.kpiLabel}>Inventory value</div>
                <div className={styles.kpiDelta}>Live cost layers · Finance items tab</div>
              </button>
              <button className={styles.kpiTile} onClick={() => onNavigate('orders', 'purchase-orders')}>
                <div className={styles.kpiValue}>{overview == null ? '—' : overview.openPOs}</div>
                <div className={styles.kpiLabel}>Open POs</div>
                <div className={styles.kpiDelta}>{overview == null ? '—' : `${money(overview.onOrderValue)} on order`}</div>
              </button>
              <button className={styles.kpiTile} onClick={() => onNavigate('orders', 'purchase-orders')}>
                <div className={styles.kpiValue}>{overview == null ? '—' : overview.receivings7d}</div>
                <div className={styles.kpiLabel}>Receivings (7d)</div>
                <div className={styles.kpiDelta}>Goods receipts this week</div>
              </button>
              <button className={styles.kpiTile} onClick={() => setSubTab('counts')}>
                <div className={styles.kpiValue} style={{ color: overview?.countVariance != null && overview.countVariance !== 0 ? '#ba1a1a' : undefined }}>
                  {overview == null ? '—' : overview.countVariance == null ? '—' : money(overview.countVariance)}
                </div>
                <div className={styles.kpiLabel}>Last count variance</div>
                <div className={styles.kpiDelta}>Latest posted cycle count</div>
              </button>
            </div>

            <div className={styles.createActionsRow}>
              <span className={styles.createActionsLabel}>Create actions:</span>
              <button className={styles.createChip} onClick={() => { if (warehouses.length === 0) { onToast('Add a warehouse first — adjustments need one'); return; } const first = rows[0]; if (!first) { onToast('No stocked variant yet — create a stocked product with a variant in Catalog first'); return; } setAdjustRow(first); setAdjustWh(first.warehouseId ?? warehouses[0].id); }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>tune</span>Adjustment
              </button>
              <button className={styles.createChip} onClick={() => { if (warehouses.length < 2) { onToast('Transfers need two warehouses'); return; } const first = rows.find(r => r.warehouseId); if (!first) { onToast('No stock in a warehouse to transfer yet'); return; } setTransferRow(first); }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>swap_horiz</span>Transfer
              </button>
              <button className={styles.createChip} onClick={() => submitCount()}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>inventory_2</span>Cycle count
              </button>
              <button className={styles.createChip} onClick={() => (onCreate ? onCreate('Purchase order') : onToast('Open a purchase order'))}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>shopping_bag</span>Reorder POs
              </button>
              <button className={styles.showAllChip} onClick={() => (onOpenCreateFlyout ? onOpenCreateFlyout() : onToast('Show all create options'))}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>apps</span>Show all</button>
            </div>

            <div className={styles.tableCard}>
              <div className={styles.viewTabsBar}>
                {STATUS_TABS.map(tab => (
                  <button key={tab} className={`${styles.viewTab} ${activeTab === tab ? styles.viewTabActive : ''}`} onClick={() => setActiveTab(tab)}>{tab}</button>
                ))}
              </div>

              <div className={styles.filterBar}>
                <div className={styles.filterInputWrap}>
                  <span className={`material-symbols-outlined ${styles.filterInputIcon}`}>search</span>
                  <input className={styles.filterInput} placeholder="Filter by SKU, product…" type="text" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <select className={styles.filterSelect} value={warehouse} onChange={e => setWarehouse(e.target.value)}>
                  <option value="all">All warehouses</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <span className={styles.filterCount}>{selected.size > 0 ? `${selected.size} selected` : `${total} tracked SKU${total === 1 ? '' : 's'}`}</span>
              </div>

              {selected.size > 0 && (
                <BulkBar
                  selectedIds={Array.from(selected)}
                  onClear={() => setSelected(new Set())}
                  actions={[
                    { label: 'Create PO', icon: 'shopping_bag', onClick: () => { onCreate ? onCreate('Purchase order') : onToast('Open a purchase order'); setSelected(new Set()); } },
                    { label: 'Cycle count', icon: 'inventory_2', onClick: () => { submitCount(); } },
                  ]}
                />
              )}

              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.checkCell}><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={() => setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(r => rowKey(r))))} /></th>
                    <th>SKU / Product</th>
                    <th>Warehouse</th>
                    <th>Bin</th>
                    <th style={{ textAlign: 'right' }}>On hand</th>
                    <th style={{ textAlign: 'right' }}>Reserved</th>
                    <th style={{ textAlign: 'right' }}>Available</th>
                    <th style={{ textAlign: 'right' }}>Reorder pt</th>
                    <th style={{ textAlign: 'right' }}>Value</th>
                    <th>Status</th>
                    <th className={styles.actionCell}></th>
                  </tr>
                </thead>
                <tbody>
                  {!loaded ? (
                    <tr><td colSpan={11} className={styles.emptyState}>Loading live inventory…</td></tr>
                  ) : filtered.map(row => (
                    <tr key={rowKey(row)} className={`${styles.tableRow} ${selected.has(rowKey(row)) ? styles.tableRowSelected : ''}`}>
                      <td className={styles.checkCell}><input type="checkbox" checked={selected.has(rowKey(row))} onChange={() => toggleSelect(rowKey(row))} /></td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{row.product}</div>
                        <div style={{ fontSize: 11, color: '#5a6355', fontFamily: 'monospace' }}>{row.sku}{row.size || row.color ? ` · ${[row.size, row.color].filter(Boolean).join(' / ')}` : ''}</div>
                        {row.incomingQty > 0 && <div style={{ fontSize: 11, color: '#1e5a38' }}>+{row.incomingQty} incoming on PO</div>}
                      </td>
                      <td>{row.warehouse ?? '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.bin ?? '—'}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.onHand}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.reserved}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: row.available < 0 ? '#ba1a1a' : '#1a1c1e', fontWeight: row.available < 0 ? 700 : 400 }}>{row.available}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.reorderPoint ?? '—'}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(row.value)}</td>
                      <td><span className={styles.statusPill} data-status={row.status}>{row.status}</span></td>
                      <td className={styles.actionCell}><RowMenu items={rowMenuItems(row)} /></td>
                    </tr>
                  ))}
                  {loaded && filtered.length === 0 && (
                    <tr><td colSpan={11} className={styles.emptyState}>
                      No tracked stock yet — the 4 stocked products have no variants and no warehouse exists. Create a stocked product with a variant in Catalog, add a warehouse below, then adjust stock in.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {subTab === 'items' && (
          <>
            <div className={styles.tableCard}>
              <div className={styles.filterBar}>
                <span className={styles.filterCount}>{items.length} finance item(s) · on-hand is the sum of ledger moves, never a typed number</span>
              </div>
              <table className={styles.table}>
                <thead><tr><th>Item</th><th>Type</th><th>Classification</th><th>ERP SKU</th><th style={{ textAlign: 'right' }}>On hand</th><th style={{ textAlign: 'right' }}>Layer value</th><th style={{ textAlign: 'right' }}>Reorder pt</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.id} className={styles.tableRow}>
                      <td><div style={{ fontWeight: 600 }}>{it.name}</div><div style={{ fontSize: 11, color: '#5a6355' }}>{it.unitOfMeasure}{it.salesPrice != null ? ` · sell ${money(it.salesPrice)}` : ''}{it.purchaseCost != null ? ` · cost ${money(it.purchaseCost)}` : ''}</div></td>
                      <td>{it.itemType}</td>
                      <td>{it.classificationCode ? `${it.classificationCode} — ${it.classificationName ?? ''}` : '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{it.skuLabel ?? it.sku ?? '—'}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: it.reorderPoint != null && it.onHand <= it.reorderPoint ? '#ba1a1a' : undefined, fontWeight: it.reorderPoint != null && it.onHand <= it.reorderPoint ? 700 : 400 }}>{it.onHand}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(it.layerValue)}</td>
                      <td style={{ textAlign: 'right' }}>{it.reorderPoint ?? '—'}</td>
                      <td><span className={styles.statusPill} data-status={it.isActive ? 'In stock' : 'Out of stock'}>{it.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td style={{ textAlign: 'right' }}><button className={styles.btnSecondary} onClick={() => openItemDetail(it.id)}>Open</button></td>
                    </tr>
                  ))}
                  {items.length === 0 && <tr><td colSpan={9} className={styles.emptyState}>No finance items yet — cycle-count posting is blocked until an inventory item is linked to a counted SKU. Create a classification below, then an item linked to a stocked ERP SKU.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className={styles.tableCard} style={{ marginTop: 12, padding: 16 }}>
              <h3 style={{ fontWeight: 600, marginBottom: 8 }}>New finance item</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className={styles.filterInput} placeholder="Name (e.g. TEST-TEE-S stock)" value={itemName} onChange={e => setItemName(e.target.value)} style={{ maxWidth: 260 }} />
                <select className={styles.filterSelect} value={itemClass} onChange={e => setItemClass(e.target.value)}>
                  <option value="">Classification (SKU line)…</option>
                  {classifications.filter(c => c.level === 'sku_line').map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
                <select className={styles.filterSelect} value={itemType} onChange={e => setItemType(e.target.value)}>
                  <option value="inventory">inventory</option>
                  <option value="non_inventory">non_inventory</option>
                  <option value="service">service</option>
                  <option value="bundle">bundle</option>
                  <option value="gift_card">gift_card</option>
                  <option value="discount">discount</option>
                  <option value="other_charge">other_charge</option>
                </select>
                <select className={styles.filterSelect} value={itemSkuId} onChange={e => setItemSkuId(e.target.value)}>
                  <option value="">ERP SKU (count link)…</option>
                  {rows.filter(r => r.skuId).map(r => <option key={r.skuId ?? r.sku} value={r.skuId ?? ''}>{r.sku} — {r.product}</option>)}
                </select>
                <input className={styles.filterInput} placeholder="Unit (each)" value={itemUom} onChange={e => setItemUom(e.target.value)} style={{ maxWidth: 100 }} />
                <input className={styles.filterInput} placeholder="Sales price" type="number" value={itemSalesPrice} onChange={e => setItemSalesPrice(e.target.value)} style={{ maxWidth: 120 }} />
                <input className={styles.filterInput} placeholder="Purchase cost" type="number" value={itemPurchaseCost} onChange={e => setItemPurchaseCost(e.target.value)} style={{ maxWidth: 130 }} />
                <select className={styles.filterSelect} value={itemAssetAccount} onChange={e => setItemAssetAccount(e.target.value)}>
                  <option value="">Asset account (default: Inventory Asset)…</option>
                  {accounts.filter(a => a.account_type === 'asset').map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
                <select className={styles.filterSelect} value={itemIncomeAccount} onChange={e => setItemIncomeAccount(e.target.value)}>
                  <option value="">Income account…</option>
                  {accounts.filter(a => a.account_type === 'revenue').map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
                <select className={styles.filterSelect} value={itemCogsAccount} onChange={e => setItemCogsAccount(e.target.value)}>
                  <option value="">COGS account…</option>
                  {accounts.filter(a => a.account_type === 'expense').map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
                <input className={styles.filterInput} placeholder="Reorder point" type="number" value={itemReorder} onChange={e => setItemReorder(e.target.value)} style={{ maxWidth: 130 }} />
                <button className={styles.btnSecondary} disabled={itemBusy} onClick={submitItem}>{itemBusy ? 'Creating…' : 'Create item'}</button>
              </div>
              <div style={{ fontSize: 12, color: '#5a6355', marginTop: 8 }}>Costing is FIFO by engine rule. On-hand starts at 0 — open the item and adjust stock in; the adjustment writes the move, the cost layer and the journal.</div>
            </div>

            <div className={styles.tableCard} style={{ marginTop: 12, padding: 16 }}>
              <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Classifications</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {classifications.map(c => (
                  <span key={c.id} className={styles.statusPill} data-status="In stock" title={`${c.level} · ${c.itemCount} item(s)`}>{c.code} — {c.name} ({c.itemCount})</span>
                ))}
                {classifications.length === 0 && <span style={{ fontSize: 12, color: '#5a6355' }}>None yet — an item needs a classification first.</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <select className={styles.filterSelect} value={clsLevel} onChange={e => setClsLevel(e.target.value)}>
                  <option value="department">department</option>
                  <option value="sub_department">sub_department</option>
                  <option value="service_type">service_type</option>
                  <option value="sku_line">sku_line</option>
                </select>
                <input className={styles.filterInput} placeholder="Code (1–8 A-Z/0-9, e.g. APPAREL)" value={clsCode} onChange={e => setClsCode(e.target.value.toUpperCase())} style={{ maxWidth: 220 }} />
                <input className={styles.filterInput} placeholder="Name (e.g. Apparel)" value={clsName} onChange={e => setClsName(e.target.value)} style={{ maxWidth: 220 }} />
                <select className={styles.filterSelect} value={clsParent} onChange={e => setClsParent(e.target.value)}>
                  <option value="">Parent (none — top level)…</option>
                  {classifications.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name} ({c.level})</option>)}
                </select>
                <button className={styles.btnSecondary} disabled={clsBusy} onClick={submitClassification}>{clsBusy ? 'Creating…' : 'Create classification'}</button>
              </div>
              <div style={{ fontSize: 12, color: '#5a6355', marginTop: 8 }}>Hierarchy is department → sub_department → service_type → sku_line. Items attach to a SKU line only — build the chain top-down, picking the parent at each level.</div>
            </div>
          </>
        )}

        {subTab === 'transfers' && (
          <div className={styles.tableCard}>
            <table className={styles.table}>
              <thead><tr><th>Transfer</th><th>From</th><th>To</th><th>Status</th><th>Lines</th><th>Requested</th><th></th></tr></thead>
              <tbody>
                {transfers.map(t => (
                  <tr key={t.id} className={styles.tableRow}>
                    <td><strong>{t.transfer_number}</strong></td>
                    <td>{t.from_warehouse ?? '—'}</td>
                    <td>{t.to_warehouse ?? '—'}</td>
                    <td><span className={styles.statusPill} data-status={t.status}>{t.status}</span></td>
                    <td>{t.lines.map(l => `${l.sku ?? '?'} × ${l.quantity}`).join(', ') || '—'}</td>
                    <td>{t.requested_at ? t.requested_at.slice(0, 10) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {t.status === 'in_transit' && (
                        <button className={styles.btnSecondary} onClick={() => receiveTransfer(t.id, t.transfer_number)}>Receive</button>
                      )}
                    </td>
                  </tr>
                ))}
                {transfers.length === 0 && <tr><td colSpan={7} className={styles.emptyState}>No transfers yet — move stock between two warehouses from a row menu.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {subTab === 'counts' && (
          <div className={styles.tableCard}>
            <div className={styles.filterBar}>
              <span className={styles.filterCount}>{countSessions.length} count session(s)</span>
              <button className={styles.btnSecondary} onClick={() => { setCountWh(warehouses[0]?.id ?? ''); submitCount(); }}>New cycle count</button>
            </div>
            <table className={styles.table}>
              <thead><tr><th>Count</th><th>Warehouse</th><th>Type</th><th>Status</th><th style={{ textAlign: 'right' }}>Lines</th><th style={{ textAlign: 'right' }}>Counted</th><th style={{ textAlign: 'right' }}>Variance</th><th></th></tr></thead>
              <tbody>
                {countSessions.map(s => (
                  <tr key={s.id} className={styles.tableRow}>
                    <td><strong>{s.count_number}</strong></td>
                    <td>{s.warehouse ?? '—'}</td>
                    <td>{s.count_type}</td>
                    <td><span className={styles.statusPill} data-status={s.status}>{s.status}</span></td>
                    <td style={{ textAlign: 'right' }}>{s.lines}</td>
                    <td style={{ textAlign: 'right' }}>{s.counted}</td>
                    <td style={{ textAlign: 'right', color: s.variance !== 0 ? '#ba1a1a' : undefined, fontWeight: s.variance !== 0 ? 700 : 400 }}>{s.variance}</td>
                    <td style={{ textAlign: 'right' }}><button className={styles.btnSecondary} onClick={() => openCount(s.id)}>Open</button></td>
                  </tr>
                ))}
                {countSessions.length === 0 && <tr><td colSpan={8} className={styles.emptyState}>No cycle counts yet — start one from the Stock tab (select rows first to count just those).</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {subTab === 'warehouses' && (
          <>
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead><tr><th>Code</th><th>Warehouse</th><th>Type</th><th>City</th><th style={{ textAlign: 'right' }}>On hand</th><th>Locations</th><th></th></tr></thead>
                <tbody>
                  {warehouses.map(w => (
                    <tr key={w.id} className={styles.tableRow}>
                      <td style={{ fontFamily: 'monospace' }}>{w.code}</td>
                      <td><strong>{w.name}</strong></td>
                      <td>{w.warehouse_type}</td>
                      <td>{[w.city, w.state].filter(Boolean).join(', ') || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{w.on_hand}</td>
                      <td>{w.locations.map(l => l.code).join(', ') || '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className={styles.btnSecondary} onClick={() => setLocWh(locWh === w.id ? null : w.id)}>Add location</button>
                        {' '}
                        <button className={styles.btnSecondary} onClick={() => deleteWarehouse(w.id, w.name)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                  {warehouses.length === 0 && <tr><td colSpan={7} className={styles.emptyState}>No warehouses — add the first one below. A default receiving location is created with it.</td></tr>}
                </tbody>
              </table>
              {locWh && (
                <div className={styles.filterBar}>
                  <input className={styles.filterInput} placeholder="Location code (e.g. A-01)" value={locCode} onChange={e => setLocCode(e.target.value)} style={{ maxWidth: 220 }} />
                  <input className={styles.filterInput} placeholder="Location name (optional)" value={locName} onChange={e => setLocName(e.target.value)} style={{ maxWidth: 220 }} />
                  <button className={styles.btnSecondary} disabled={locBusy} onClick={submitLocation}>{locBusy ? 'Adding…' : 'Add location'}</button>
                </div>
              )}
            </div>
            <div className={styles.tableCard} style={{ marginTop: 12, padding: 16 }}>
              <h3 style={{ fontWeight: 600, marginBottom: 8 }}>New warehouse</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className={styles.filterInput} placeholder="Name (e.g. Charlotte)" value={whName} onChange={e => setWhName(e.target.value)} style={{ maxWidth: 220 }} />
                <input className={styles.filterInput} placeholder="Code (e.g. CLT)" value={whCode} onChange={e => setWhCode(e.target.value)} style={{ maxWidth: 140 }} />
                <select className={styles.filterSelect} value={whType} onChange={e => setWhType(e.target.value)}>
                  <option value="warehouse">Warehouse</option>
                  <option value="store">Store</option>
                  <option value="3pl">3PL</option>
                </select>
                <input className={styles.filterInput} placeholder="City" value={whCity} onChange={e => setWhCity(e.target.value)} style={{ maxWidth: 160 }} />
                <input className={styles.filterInput} placeholder="State" value={whState} onChange={e => setWhState(e.target.value)} style={{ maxWidth: 100 }} />
                <button className={styles.btnSecondary} disabled={whBusy} onClick={submitWarehouse}>{whBusy ? 'Creating…' : 'Create warehouse'}</button>
              </div>
            </div>
          </>
        )}

        {subTab === 'replenishment' && (
          <div className={styles.tableCard}>
            <table className={styles.table}>
              <thead><tr><th>SKU / Product</th><th>Warehouse</th><th style={{ textAlign: 'right' }}>On hand</th><th style={{ textAlign: 'right' }}>Available</th><th style={{ textAlign: 'right' }}>Reorder pt</th><th style={{ textAlign: 'right' }}>Safety</th><th style={{ textAlign: 'right' }}>EOQ</th><th>Preferred vendor</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} className={styles.tableRow}>
                    <td><div style={{ fontWeight: 600 }}>{r.product ?? '—'}</div><div style={{ fontSize: 11, fontFamily: 'monospace', color: '#5a6355' }}>{r.sku ?? '—'}</div></td>
                    <td>{r.warehouse ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.on_hand}</td>
                    <td style={{ textAlign: 'right' }}>{r.available}</td>
                    <td style={{ textAlign: 'right' }}>{r.reorder_point}</td>
                    <td style={{ textAlign: 'right' }}>{r.safety_stock}</td>
                    <td style={{ textAlign: 'right' }}>{r.economic_order_quantity ?? '—'}</td>
                    <td>{r.preferred_vendor ?? '—'}</td>
                    <td>{r.tripped ? <span className={styles.statusPill} data-status="Low stock">Reorder</span> : <span className={styles.statusPill} data-status="In stock">OK</span>}</td>
                    <td style={{ textAlign: 'right' }}>
                      {r.tripped && <button className={styles.btnSecondary} onClick={() => (onCreate ? onCreate('Purchase order') : onToast('Open a purchase order'))}>Create PO</button>}
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && <tr><td colSpan={10} className={styles.emptyState}>No replenishment rules yet — open a row's menu on the Stock tab and pick "Reorder rule". Low stock then raises a reorder alert here.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Adjust stock drawer */}
      {adjustRow && (
        <div className="modal-scrim open" onClick={() => setAdjustRow(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm">Adjust stock</h3>
            <div className="text-[12px] text-on-surface-variant mb-3">{adjustRow.product} · <span className="font-mono">{adjustRow.sku}</span> · on hand {adjustRow.onHand}</div>
            <label className="text-label-sm">Quantity change (+ in / − out)</label>
            <input className="w-full h-9 px-3 border border-surface-dim rounded mt-1 mb-3" type="number" placeholder="e.g. 10 or -2" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} />
            <label className="text-label-sm">Reason (required — written to the ledger)</label>
            <input className="w-full h-9 px-3 border border-surface-dim rounded mt-1 mb-3" placeholder="e.g. Damaged in transit" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} />
            <label className="text-label-sm">Warehouse</label>
            <select className="w-full h-9 px-2 border border-surface-dim rounded mt-1 mb-3" value={adjustWh} onChange={e => setAdjustWh(e.target.value)}>
              <option value="">Default warehouse</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <label className="text-label-sm">Unit cost (optional)</label>
            <input className="w-full h-9 px-3 border border-surface-dim rounded mt-1 mb-4" type="number" step="0.01" placeholder="—" value={adjustCost} onChange={e => setAdjustCost(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded" onClick={() => setAdjustRow(null)}>Cancel</button>
              <button className="h-8 px-4 bg-primary text-white rounded font-semibold" disabled={adjustBusy} onClick={submitAdjust}>{adjustBusy ? 'Adjusting…' : 'Adjust stock'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer drawer */}
      {transferRow && (
        <div className="modal-scrim open" onClick={() => setTransferRow(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm">Transfer stock</h3>
            <div className="text-[12px] text-on-surface-variant mb-3">{transferRow.product} · <span className="font-mono">{transferRow.sku}</span> · {transferRow.warehouse} · on hand {transferRow.onHand}</div>
            <label className="text-label-sm">Quantity</label>
            <input className="w-full h-9 px-3 border border-surface-dim rounded mt-1 mb-3" type="number" placeholder="e.g. 5" value={transferQty} onChange={e => setTransferQty(e.target.value)} />
            <label className="text-label-sm">To warehouse</label>
            <select className="w-full h-9 px-2 border border-surface-dim rounded mt-1 mb-4" value={transferTo} onChange={e => setTransferTo(e.target.value)}>
              <option value="">Pick destination…</option>
              {warehouses.filter(w => w.id !== transferRow.warehouseId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded" onClick={() => setTransferRow(null)}>Cancel</button>
              <button className="h-8 px-4 bg-primary text-white rounded font-semibold" disabled={transferBusy} onClick={submitTransfer}>{transferBusy ? 'Transferring…' : 'Transfer & receive'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Stock history drawer */}
      {historyRow && (
        <div className="modal-scrim open" onClick={() => setHistoryRow(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="text-headline-sm">Stock history</h3>
                <div className="text-[12px] text-on-surface-variant">{historyRow.product} · <span className="font-mono">{historyRow.sku}</span></div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setHistoryRow(null)} aria-label="Close">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            {historyNote && <div className="border border-surface-dim rounded-lg p-4 text-body-sm text-on-surface-variant mt-3">{historyNote}</div>}
            {historyEvents.length > 0 && (
              <div className="max-h-80 overflow-y-auto border border-surface-dim rounded-lg divide-y divide-surface-dim mt-3">
                {historyEvents.map((m, i) => (
                  <div key={m.id + i} className="px-3 py-2 flex items-center gap-3 text-body-sm">
                    <span className={`pill status role ${m.quantity >= 0 ? 'customer' : 'vendor'}`}>{m.movementType}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{m.sourceType ?? '—'}{m.reference ? ` · ${m.reference}` : ''}</div>
                      <div className="text-[11px] text-on-surface-variant truncate">{m.occurredAt.slice(0, 19).replace('T', ' ')} · {m.warehouse ?? '—'}{m.reason ? ` · ${m.reason}` : ''}</div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className={m.quantity >= 0 ? 'text-secondary font-semibold' : 'font-semibold'}>{m.quantity >= 0 ? `+${m.quantity}` : m.quantity}</div>
                      <div className="text-[11px] text-on-surface-variant">on hand {m.runningOnHand}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {historyEvents.length === 0 && !historyNote && (
              <div className="border border-surface-dim rounded-lg p-4 text-body-sm text-on-surface-variant mt-3">No movements recorded for this SKU yet.</div>
            )}
          </div>
        </div>
      )}

      {/* Reorder rule drawer */}
      {ruleRow && (
        <div className="modal-scrim open" onClick={() => setRuleRow(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm">Reorder rule</h3>
            <div className="text-[12px] text-on-surface-variant mb-3">{ruleRow.product} · <span className="font-mono">{ruleRow.sku}</span></div>
            <label className="text-label-sm">Warehouse</label>
            <select className="w-full h-9 px-2 border border-surface-dim rounded mt-1 mb-3" value={ruleWh} onChange={e => setRuleWh(e.target.value)}>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="text-label-sm">Reorder point</label>
                <input className="w-full h-9 px-3 border border-surface-dim rounded mt-1" type="number" value={ruleReorder} onChange={e => setRuleReorder(e.target.value)} /></div>
              <div><label className="text-label-sm">Safety stock</label>
                <input className="w-full h-9 px-3 border border-surface-dim rounded mt-1" type="number" value={ruleSafety} onChange={e => setRuleSafety(e.target.value)} /></div>
              <div><label className="text-label-sm">Maximum stock</label>
                <input className="w-full h-9 px-3 border border-surface-dim rounded mt-1" type="number" value={ruleMax} onChange={e => setRuleMax(e.target.value)} /></div>
              <div><label className="text-label-sm">EOQ</label>
                <input className="w-full h-9 px-3 border border-surface-dim rounded mt-1" type="number" value={ruleEoq} onChange={e => setRuleEoq(e.target.value)} /></div>
            </div>
            <label className="text-label-sm">Lead time (days)</label>
            <input className="w-full h-9 px-3 border border-surface-dim rounded mt-1 mb-3" type="number" value={ruleLead} onChange={e => setRuleLead(e.target.value)} />
            <label className="text-label-sm">Preferred vendor</label>
            <select className="w-full h-9 px-2 border border-surface-dim rounded mt-1 mb-4" value={ruleVendor} onChange={e => setRuleVendor(e.target.value)}>
              <option value="">None</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded" onClick={() => setRuleRow(null)}>Cancel</button>
              <button className="h-8 px-4 bg-primary text-white rounded font-semibold" disabled={ruleBusy} onClick={submitRule}>{ruleBusy ? 'Saving…' : 'Save rule'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Cycle count detail drawer */}
      {countDetail && (
        <div className="modal-scrim open" onClick={() => setCountDetail(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="text-headline-sm">Cycle count {countDetail.count_number}</h3>
                <div className="text-[12px] text-on-surface-variant">{countDetail.warehouse ?? '—'} · {countDetail.status}</div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setCountDetail(null)} aria-label="Close">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto border border-surface-dim rounded-lg divide-y divide-surface-dim mt-3">
              {countDetail.lines.map(l => (
                <div key={l.id} className="px-3 py-2 flex items-center gap-3 text-body-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{l.product ?? '—'}</div>
                    <div className="text-[11px] text-on-surface-variant font-mono">{l.sku ?? '—'} · expected {l.expected_quantity}</div>
                  </div>
                  <input
                    className="w-20 h-8 px-2 border border-surface-dim rounded text-right tabular-nums"
                    type="number"
                    placeholder="Counted"
                    value={countedInputs[l.id] ?? ''}
                    disabled={countDetail.status === 'posted'}
                    onChange={e => setCountedInputs(prev => ({ ...prev, [l.id]: e.target.value }))}
                  />
                  <div className="w-14 text-right tabular-nums text-[12px]" style={{ color: (l.variance_quantity ?? 0) !== 0 ? '#ba1a1a' : undefined }}>
                    {l.variance_quantity != null ? (l.variance_quantity > 0 ? `+${l.variance_quantity}` : l.variance_quantity) : '—'}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              {countDetail.status !== 'posted' && (
                <>
                  <button className="h-8 px-3 border border-surface-dim rounded" disabled={countBusy2} onClick={saveCounted}>Save counts</button>
                  {countDetail.status !== 'submitted' && (
                    <button className="h-8 px-3 border border-surface-dim rounded" disabled={countBusy2} onClick={submitCountSession}>Submit</button>
                  )}
                  {countDetail.status === 'submitted' && (
                    <>
                      {!countDetail.approved_at && (
                        <button className="h-8 px-3 border border-surface-dim rounded" disabled={countBusy2} onClick={approveCountSession}>Approve</button>
                      )}
                      {countDetail.approved_at && (
                        <span className="text-[12px] text-on-surface-variant self-center">Approved</span>
                      )}
                      <button className="h-8 px-4 bg-primary text-white rounded font-semibold" disabled={countBusy2} onClick={postCountSession}>Post count</button>
                    </>
                  )}
                </>
              )}
              {countDetail.status === 'posted' && <span className="text-[12px] text-on-surface-variant self-center">Posted to the ledger.</span>}
            </div>
          </div>
        </div>
      )}

      {/* Finance item detail drawer (Batch F) */}
      {itemDetail && (
        <div className="modal-scrim open" onClick={() => setItemDetail(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="text-headline-sm">{itemDetail.name}</h3>
                <div className="text-[12px] text-on-surface-variant">{itemDetail.itemType} · {itemDetail.classificationCode ?? '—'} · {itemDetail.skuLabel ?? itemDetail.sku ?? 'no ERP SKU'} · on hand {itemDetail.onHand} · layer value {money(itemDetail.layerValue)}</div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setItemDetail(null)} aria-label="Close">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            {itemDetail.itemType === 'inventory' && (
              <div className="mt-3">
                <label className="text-label-sm">Adjust stock (writes the move, cost layer and journal)</label>
                <div className="flex gap-2 mt-1">
                  <input className="w-24 h-9 px-3 border border-surface-dim rounded" type="number" placeholder="+/− qty" value={itemAdjQty} onChange={e => setItemAdjQty(e.target.value)} />
                  <input className="flex-1 h-9 px-3 border border-surface-dim rounded" placeholder="Reason (required)" value={itemAdjReason} onChange={e => setItemAdjReason(e.target.value)} />
                  <input className="w-24 h-9 px-3 border border-surface-dim rounded" type="number" placeholder="Unit cost" value={itemAdjCost} onChange={e => setItemAdjCost(e.target.value)} />
                  <button className="h-9 px-3 bg-primary text-white rounded font-semibold" disabled={itemAdjBusy} onClick={submitItemAdjust}>{itemAdjBusy ? 'Posting…' : 'Adjust'}</button>
                </div>
              </div>
            )}
            <h4 className="font-semibold mt-4 mb-1 text-body-sm">Cost layers (FIFO)</h4>
            <div className="max-h-40 overflow-y-auto border border-surface-dim rounded-lg divide-y divide-surface-dim">
              {itemDetail.layers.map(l => (
                <div key={l.id} className="px-3 py-2 flex justify-between text-body-sm tabular-nums">
                  <span>{l.layerDate.slice(0, 10)} · {l.qtyRemaining}/{l.qtyIn} left</span>
                  <span>@ {money(l.unitCost)}</span>
                </div>
              ))}
              {itemDetail.layers.length === 0 && <div className="px-3 py-2 text-body-sm text-on-surface-variant">No cost layers — adjust stock in to create the first layer.</div>}
            </div>
            <h4 className="font-semibold mt-4 mb-1 text-body-sm">Movements</h4>
            <div className="max-h-48 overflow-y-auto border border-surface-dim rounded-lg divide-y divide-surface-dim">
              {itemDetail.moves.map(m => (
                <div key={m.id} className="px-3 py-2 text-body-sm">
                  <div className="flex justify-between tabular-nums">
                    <span><strong>{m.moveType}</strong> · {m.moveDate.slice(0, 10)}</span>
                    <span style={{ color: m.quantity < 0 ? '#ba1a1a' : undefined }}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity} · {money(m.totalCost)}</span>
                  </div>
                  <div className="text-[11px] text-on-surface-variant">{m.reason ?? m.reference ?? '—'}</div>
                </div>
              ))}
              {itemDetail.moves.length === 0 && <div className="px-3 py-2 text-body-sm text-on-surface-variant">No movements yet.</div>}
            </div>
            {itemDetail.draws.length > 0 && (
              <>
                <h4 className="font-semibold mt-4 mb-1 text-body-sm">Layer draws (FIFO issues)</h4>
                <div className="max-h-32 overflow-y-auto border border-surface-dim rounded-lg divide-y divide-surface-dim">
                  {itemDetail.draws.map(d => (
                    <div key={d.id} className="px-3 py-2 flex justify-between text-body-sm tabular-nums">
                      <span>Layer {d.layerDate ? d.layerDate.slice(0, 10) : d.layerId.slice(0, 8)}</span>
                      <span>−{d.quantity} @ {money(d.unitCost)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default InventoryView;
