import { useState, useEffect } from 'react';
import { getProducts, getCustomers, createSale, saveCustomer, getSales, manageHeldOrders, manageSupplierBills } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Checkbox } from '@project/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Search, Plus, Minus, ShoppingCart, Trash2, UserPlus, X, Receipt, DollarSign, MapPin, Route, UserCheck, Pause, Play, Clock, Layers } from 'lucide-react';
import { toast } from 'sonner';
import DeliveryRouteMap, { PickupItem } from '../components/DeliveryRouteMap';
import LocationPickerDialog from '../components/LocationPickerDialog';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import OtherIncomeDialog from '../components/OtherIncomeDialog';
import ProductImage from '../components/ProductImage';
import CustomerPicker, { PickableCustomer } from '../components/CustomerPicker';
import { useBranch, commissionAmount, autoOn, Commission } from '../hooks/useBranch';
import SummaryTiles from '../components/SummaryTiles';
import DateRangeFilter, { Range, inRange } from '../components/DateRangeFilter';
import { isCashPayment } from '../lib/payments';
import { RiderType, DEFAULT_DELIVERY_FEE, DEFAULT_RIDER_FEE } from '../lib/delivery';

interface Product {
  id: string;
  productName?: string;
  sku?: string;
  sellingPrice?: number;
  costPrice?: number;
  stockQuantity?: number;
  taxRate?: number;
  status?: string;
  images?: { url: string }[];
}

interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
}

interface Customer {
  id: string;
  customerName?: string;
  phoneNumber?: string;
}

interface SelectedRider { type: RiderType; id: string; name: string; }

type DiscountType = 'KES' | '%';

/** An order put on hold. Stock is only deducted when it is finally checked out. */
interface HeldOrder {
  id: string;
  heldAt: string;
  heldBy?: string;
  branchId?: string | null;
  items: { productId: string; productName?: string; sku?: string; image?: string; quantity: number; unitPrice: number }[];
  customer: Customer | null;
  paymentMethod: string;
  selectedDeductions: string[];
  rider: SelectedRider | null;
  feeOn: boolean;
  feeAmount: string;
  /** Other incomes & revenues (besides the delivery fee) that were switched on for this order. */
  extraIncomes?: { name: string; amount: number }[];
  riderFeeOn?: boolean;
  riderFeeAmount?: string;
  discountValue: string;
  discountType: DiscountType;
  routePoints: any[];
  distanceKm: number;
  pickupSelections?: Record<string, string[]>;
}

/** Discount in KES for a given subtotal, never more than the subtotal. */
const calcDiscount = (subtotal: number, value: string | number, type: DiscountType) => {
  const v = Math.max(0, Number(value) || 0);
  const raw = type === '%' ? (subtotal * Math.min(v, 100)) / 100 : v;
  return Math.round(Math.min(subtotal, raw) * 100) / 100;
};

const heldTotals = (h: HeldOrder) => {
  const sub = h.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const discount = calcDiscount(sub, h.discountValue, h.discountType);
  const total = sub - discount;
  const fee = h.feeOn ? Math.max(0, Number(h.feeAmount) || 0) : 0;
  const extra = (h.extraIncomes || []).reduce((s, e) => s + (e.amount || 0), 0);
  return { sub, discount, total, fee, extra, payable: total + fee + extra };
};

/** The rider fee (KES) of a held order. Older held orders without one use the default. */
const heldRiderFee = (h: HeldOrder) =>
  h.riderFeeOn === false ? 0 : Math.max(0, Number(h.riderFeeAmount ?? DEFAULT_RIDER_FEE) || 0);

/** The rider fee is recorded as a deduction on the sale (so it counts as an expense). */
const withRiderFee = (list: { name: string; amount: number }[], fee: number) =>
  fee > 0 ? [...list, { name: 'Rider fee', amount: fee }] : list;

/** Splits a list of route points into the text fields stored on a sale. */
const routeFields = (pts: any[]) => {
  const pickups = pts.filter(p => p.tag === 'pickup');
  const dropoffs = pts.filter(p => p.tag === 'dropoff');
  const other = pts.filter(p => !p.tag || !['start', 'end', 'pickup', 'dropoff'].includes(p.tag));
  return {
    pickupPoint: pickups.map(p => p.label).join('; ') || undefined,
    deliveryAddress: dropoffs.map(p => p.label).join('; ') || undefined,
    // Each pin is tagged (e.g. "dropoff:-1.29,36.82") so the Addresses > Deliveries tab can tell drop-offs apart.
    deliveryCoordinates: pts.length > 0 ? pts.map(p => `${p.tag || 'stop'}:${p.lat},${p.lng}`).join(' → ') : undefined,
    stops: [...other, ...pickups, ...dropoffs].map(p => p.label).join('; ') || undefined,
  };
};

const isMergedPoint = (p: any) => String(p.id).startsWith('m_');

/** Long product names in the cart shrink (down to 80% of normal size) so more items stay in view. */
const cartNameSize = (name?: string) => {
  const n = (name || '').length;
  if (n > 45) return 'text-[11.2px]';
  if (n > 32) return 'text-[12px]';
  if (n > 22) return 'text-[13px]';
  return 'text-sm';
};

/** Quantity-in-cart badge shown at the bottom right of a product image. */
function QtyBadge({ qty, small }: { qty: number; small?: boolean }) {
  if (qty <= 0) return null;
  return (
    <span
      className={`absolute bottom-1 right-1 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center shadow-md pointer-events-none ${small ? 'min-w-[16px] h-4 px-1 text-[9px]' : 'min-w-[24px] h-6 px-1.5 text-xs'}`}
    >
      {qty}
    </span>
  );
}

/** Half-width tile: tap the label to switch on/off, edit the KES amount on the right. */
function FeeTile({ label, on, onToggle, value, onValue, onCls, offCls, title }: {
  label: string; on: boolean; onToggle: () => void; value: string; onValue: (v: string) => void;
  onCls: string; offCls: string; title: string;
}) {
  return (
    <div className={`h-7 rounded-md border flex items-center overflow-hidden transition-all ${on ? onCls : offCls}`}>
      <button
        type="button"
        onClick={onToggle}
        title={`Tap to switch ${label} on or off`}
        className="flex-1 min-w-0 h-full pl-2 text-left text-[11px] font-medium truncate"
      >
        {label}
      </button>
      <input
        type="number"
        min={0}
        value={on ? value : '0'}
        disabled={!on}
        onChange={e => onValue(e.target.value)}
        title={title}
        className={`h-5 w-14 mr-1 rounded px-1 text-right text-[11px] outline-none ${on ? 'bg-white/25 text-white' : 'bg-transparent'}`}
      />
    </div>
  );
}

const AMBER_ON = 'border-amber-500 bg-amber-500 text-white';
const AMBER_OFF = 'border-border text-muted-foreground hover:border-amber-500/60';

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash/M-PESA');
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [duplicateMatch, setDuplicateMatch] = useState<Customer | null>(null);
  const [showCustLocationPicker, setShowCustLocationPicker] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showOtherIncome, setShowOtherIncome] = useState(false);
  const [catalogView, setCatalogView] = useViewMode('pos', 'grid');
  const { currentBranch } = useBranch();

  // Deductions and incomes are set up per outlet in Settings > Outlets. Items switched on there
  // are applied automatically; the cashier can switch any of them off (or on) for a single order.
  const outletDeductions: Commission[] = currentBranch?.commissions || [];
  const outletIncomes: Commission[] = currentBranch?.incomes ?? [
    { name: 'Delivery Fee', type: 'fixed', value: currentBranch?.deliveryFee ?? DEFAULT_DELIVERY_FEE, enabled: true },
  ];
  const feeInc: Commission | undefined = outletIncomes[0]; // the first income is the Delivery Fee

  // Per-order overrides of what Settings switched on/off.
  const [dedOverrides, setDedOverrides] = useState<Record<string, boolean>>({});
  const selectedDeductions = outletDeductions.filter(d => dedOverrides[d.name] ?? autoOn(d)).map(d => d.name);

  const [feeOnOverride, setFeeOnOverride] = useState<boolean | null>(null);
  const [feeOverride, setFeeOverride] = useState<string | null>(null);
  const [extraOn, setExtraOn] = useState<Record<string, boolean>>({});
  const [extraVal, setExtraVal] = useState<Record<string, string>>({});

  // Rider fee: default comes from DEFAULT_RIDER_FEE (lib/delivery.ts), adjustable per order.
  // It is recorded as a deduction on the sale.
  const [riderFeeOn, setRiderFeeOn] = useState(true);
  const [riderFeeAmount, setRiderFeeAmount] = useState(String(DEFAULT_RIDER_FEE));
  const riderFee = riderFeeOn ? Math.max(0, Number(riderFeeAmount) || 0) : 0;

  // Discount on the order, either a KES amount or a percentage of the subtotal.
  const [discountValue, setDiscountValue] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('KES');

  // Kept so held orders created earlier (which may carry a rider) still complete with it.
  const [rider, setRider] = useState<SelectedRider | null>(null);

  const [showDeliveryMap, setShowDeliveryMap] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [routePoints, setRoutePoints] = useState<any[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);
  // Items ticked as picked up, per route point id (supplier pick-up pins only).
  const [pickupSelections, setPickupSelections] = useState<Record<string, string[]>>({});
  const [range, setRange] = useState<Range>({});
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const loadSales = () => getSales({ branchId: currentBranch?.id }).then(r => setRecentSales(r.sales)).catch(() => {});
  useEffect(() => { loadSales(); }, [currentBranch?.id]);

  // ── On-hold (pending) orders ──
  const [cartTab, setCartTab] = useState<'cart' | 'pending'>('cart');
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const [holding, setHolding] = useState(false);
  const [mergedIds, setMergedIds] = useState<string[]>([]);
  const loadHeld = () =>
    manageHeldOrders({ action: 'list', branchId: currentBranch?.id })
      .then(r => setHeldOrders(r.orders as HeldOrder[]))
      .catch(() => {});
  useEffect(() => {
    loadHeld();
    const t = setInterval(loadHeld, 30000);
    return () => clearInterval(t);
  }, [currentBranch?.id]);

  // Orders merged into this checkout (ignores any that were resumed/deleted elsewhere in the meantime).
  const mergeList = heldOrders.filter(h => mergedIds.includes(h.id));

  // Items that can be picked up from a supplier: the active cart plus every merged pending order,
  // combined per product (with cost price, which is what the supplier bills).
  const pickupItems: PickupItem[] = (() => {
    const map = new Map<string, PickupItem>();
    const add = (productId: string, name: string, quantity: number, fallbackCost: number) => {
      const cur = map.get(productId);
      if (cur) { cur.quantity += quantity; return; }
      const cost = products.find(p => p.id === productId)?.costPrice ?? fallbackCost;
      map.set(productId, { productId, name, quantity, unitCost: cost || 0 });
    };
    cart.forEach(c => add(c.product.id, c.product.productName || 'Item', c.quantity, c.product.costPrice || 0));
    mergeList.forEach(h => h.items.forEach(i => add(i.productId, i.productName || 'Item', i.quantity, 0)));
    return Array.from(map.values());
  })();

  // Switching outlet changes the available incomes/deductions, so start fresh.
  useEffect(() => {
    setDedOverrides({});
    setFeeOnOverride(null); setFeeOverride(null);
    setExtraOn({}); setExtraVal({});
  }, [currentBranch?.id]);

  useEffect(() => {
    Promise.all([getProducts({ status: 'Active', branchId: currentBranch?.id }), getCustomers({})]).then(([prods, custs]) => {
      setProducts(prods.products as Product[]);
      setCustomers(custs.customers as Customer[]);
    });
  }, [currentBranch?.id]);

  const filtered = products.filter(p =>
    (p.productName || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.sku || '').toLowerCase().includes(search.toLowerCase())
  );

  const qtyInCart = (productId: string) => cart.find(c => c.product.id === productId)?.quantity || 0;

  const addToCart = (product: Product) => {
    const existing = cart.find(c => c.product.id === product.id);
    if (existing) {
      setCart(cart.map(c => c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { product, quantity: 1, unitPrice: product.sellingPrice || 0 }]);
    }
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(cart.map(c => {
      if (c.product.id !== productId) return c;
      const newQty = c.quantity + delta;
      return newQty <= 0 ? c : { ...c, quantity: newQty };
    }));
  };

  const removeFromCart = (productId: string) => setCart(cart.filter(c => c.product.id !== productId));

  const subtotal = cart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0);
  const discountAmount = calcDiscount(subtotal, discountValue, discountType);
  const total = subtotal - discountAmount;

  // Delivery fee (first income): % is taken on the order total after discount; the amount can be edited per order.
  const feeOn = feeInc ? (feeOnOverride ?? autoOn(feeInc)) : false;
  const feeAmount = feeOverride ?? String(feeInc ? commissionAmount(feeInc, total) : 0);
  const deliveryFee = feeOn ? Math.max(0, Number(feeAmount) || 0) : 0;

  // Any other incomes & revenues of the outlet.
  const extraIncomes = outletIncomes.slice(1).map(c => {
    const on = extraOn[c.name] ?? autoOn(c);
    const amount = extraVal[c.name] ?? String(commissionAmount(c, total));
    return { name: c.name, on, amount, value: on ? Math.max(0, Number(amount) || 0) : 0 };
  });
  const appliedExtras = extraIncomes.filter(e => e.value > 0).map(e => ({ name: e.name, amount: e.value }));
  const extraTotal = appliedExtras.reduce((s, e) => s + e.amount, 0);

  const payable = total + deliveryFee + extraTotal;

  const appliedDeductions = outletDeductions.filter(d => selectedDeductions.includes(d.name));
  const deductionsTotal = appliedDeductions.reduce((s, d) => s + commissionAmount(d, total), 0);
  const toggleDeduction = (d: Commission) =>
    setDedOverrides(prev => ({ ...prev, [d.name]: !(prev[d.name] ?? autoOn(d)) }));

  const resetOrder = () => {
    // Clearing the cart also clears the quantity badges on the product tiles.
    setCart([]);
    setSelectedCustomer(null);
    setDedOverrides({});
    setRider(null);
    setFeeOnOverride(null); setFeeOverride(null);
    setExtraOn({}); setExtraVal({});
    setRiderFeeOn(true);
    setRiderFeeAmount(String(DEFAULT_RIDER_FEE));
    setDiscountValue('');
    setDiscountType('KES');
    setRoutePoints([]);
    setDistanceKm(0);
    setPickupSelections({});
    setMergedIds([]);
  };

  // ── Hold / resume / delete ──
  const handleHold = async () => {
    if (cart.length === 0) return toast.error('Cart is empty');
    if (mergedIds.length > 0) return toast.error('Unmerge the pending orders before putting this order on hold');
    setHolding(true);
    try {
      const order = {
        items: cart.map(c => ({
          productId: c.product.id,
          productName: c.product.productName,
          sku: c.product.sku,
          image: c.product.images?.[0]?.url,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
        })),
        customer: selectedCustomer,
        paymentMethod,
        selectedDeductions,
        rider,
        feeOn,
        feeAmount,
        extraIncomes: appliedExtras,
        riderFeeOn,
        riderFeeAmount,
        discountValue,
        discountType,
        routePoints,
        distanceKm,
        pickupSelections,
      };
      const res = await manageHeldOrders({ action: 'hold', branchId: currentBranch?.id, order });
      setHeldOrders(res.orders as HeldOrder[]);
      resetOrder();
      toast.success('Order put on hold. Find it under Pending.');
    } catch (e: any) {
      toast.error(e.message || 'Could not hold the order');
    } finally {
      setHolding(false);
    }
  };

  const resumeHeld = async (h: HeldOrder) => {
    if (cart.length > 0) return toast.error('Hold or clear the current cart before resuming another order');
    try {
      const res = await manageHeldOrders({ action: 'remove', id: h.id, branchId: currentBranch?.id });
      setHeldOrders(res.orders as HeldOrder[]);
      setCart(h.items.map(i => {
        const live = products.find(p => p.id === i.productId);
        const product: Product = live || {
          id: i.productId, productName: i.productName, sku: i.sku, sellingPrice: i.unitPrice,
          images: i.image ? [{ url: i.image }] : undefined,
        };
        return { product, quantity: i.quantity, unitPrice: i.unitPrice };
      }));
      setSelectedCustomer(h.customer || null);
      setPaymentMethod(h.paymentMethod || 'Cash/M-PESA');
      // Restore exactly which deductions / incomes were on for this order.
      setDedOverrides(Object.fromEntries(outletDeductions.map(d => [d.name, (h.selectedDeductions || []).includes(d.name)])));
      setRider(h.rider || null);
      setFeeOnOverride(h.feeOn !== false);
      setFeeOverride(h.feeAmount ?? null);
      setExtraOn(Object.fromEntries(outletIncomes.slice(1).map(c => [c.name, (h.extraIncomes || []).some(e => e.name === c.name)])));
      setExtraVal(Object.fromEntries((h.extraIncomes || []).map(e => [e.name, String(e.amount)])));
      setRiderFeeOn(h.riderFeeOn !== false);
      setRiderFeeAmount(h.riderFeeAmount ?? String(DEFAULT_RIDER_FEE));
      setDiscountValue(h.discountValue || '');
      setDiscountType(h.discountType || 'KES');
      setRoutePoints(h.routePoints || []);
      setDistanceKm(h.distanceKm || 0);
      setPickupSelections(h.pickupSelections || {});
      setMergedIds(prev => prev.filter(id => id !== h.id));
      setCartTab('cart');
      toast.success('Order resumed');
    } catch (e: any) {
      toast.error(e.message || 'Could not resume the order');
    }
  };

  const deleteHeld = async (h: HeldOrder) => {
    if (!window.confirm('Delete this pending order? This cannot be undone.')) return;
    try {
      const res = await manageHeldOrders({ action: 'remove', id: h.id, branchId: currentBranch?.id });
      setHeldOrders(res.orders as HeldOrder[]);
      setMergedIds(prev => prev.filter(id => id !== h.id));
      setRoutePoints(pts => pts.filter(p => !String(p.id).startsWith(`m_${h.id}_`)));
      toast.success('Pending order deleted');
    } catch (e: any) {
      toast.error(e.message || 'Could not delete');
    }
  };

  // ── Merge pending orders into this delivery route ──
  const toggleMerge = (h: HeldOrder) => {
    if (mergedIds.includes(h.id)) {
      setMergedIds(ids => ids.filter(x => x !== h.id));
      setRoutePoints(pts => pts.filter(p => !String(p.id).startsWith(`m_${h.id}_`)));
      return;
    }
    setMergedIds(ids => [...ids, h.id]);
    // Bring over the drop-offs (and any extra stops). Pick-ups and start/end stay those of the active order.
    const add = (h.routePoints || [])
      .filter(p => p.tag !== 'start' && p.tag !== 'end' && p.tag !== 'pickup')
      .map(p => ({ ...p, id: `m_${h.id}_${p.id}` }));
    setRoutePoints(pts => {
      const fresh = add.filter(a => !pts.some(p => p.lat === a.lat && p.lng === a.lng));
      if (fresh.length === 0) return pts;
      const endIdx = pts.findIndex(p => p.tag === 'end');
      return endIdx >= 0 ? [...pts.slice(0, endIdx), ...fresh, ...pts.slice(endIdx)] : [...pts, ...fresh];
    });
  };

  // Unmerges every merged pending order straight from the cart (no need to reopen Plan Route).
  const unmergeAll = () => {
    setMergedIds([]);
    setRoutePoints(pts => pts.filter(p => !isMergedPoint(p)));
    toast.success('Pending orders unmerged');
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return toast.error('Cart is empty');
    setProcessing(true);
    try {
      // The merged orders' drop-offs belong to their own sales, so the active sale only records its own points.
      // The distance covers the whole merged trip and is stored once, on the active sale.
      const rf = routeFields(routePoints.filter(p => !isMergedPoint(p)));

      // Work out which supplier pick-ups have items ticked (before the cart is cleared).
      const pickupBills = routePoints
        .filter(p => p.tag === 'pickup' && p.supplierId && !isMergedPoint(p))
        .map(p => {
          const ids = pickupSelections[p.id] || [];
          const items = pickupItems.filter(i => ids.includes(i.productId));
          return {
            supplierId: p.supplierId as string,
            supplierName: (p.supplierName || p.label) as string,
            items,
            amount: items.reduce((s, i) => s + i.unitCost * i.quantity, 0),
          };
        })
        .filter(b => b.items.length > 0);

      const activeRes = await createSale({
        items: cart.map(c => ({ productId: c.product.id, quantity: c.quantity, unitPrice: c.unitPrice })),
        customerId: selectedCustomer?.id,
        paymentMethod,
        discount: discountAmount,
        branchId: currentBranch?.id,
        ...rf,
        deliveryDistanceKm: distanceKm || undefined,
        deductions: withRiderFee(appliedDeductions.map(d => ({ name: d.name, amount: commissionAmount(d, total) })), riderFee),
        deliveryFee,
        extraIncomes: appliedExtras,
        riderType: rider?.type,
        riderName: rider?.name,
      });
      const saleNo = (activeRes.sale as any)?.saleNumber;

      // Complete every merged pending order together with this one.
      let completed = 0;
      const failed: string[] = [];
      for (const h of mergeList) {
        try {
          const t = heldTotals(h);
          await createSale({
            items: h.items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
            customerId: h.customer?.id,
            paymentMethod: h.paymentMethod,
            discount: t.discount,
            branchId: currentBranch?.id,
            ...routeFields(h.routePoints || []),
            deductions: withRiderFee(
              outletDeductions
                .filter(d => (h.selectedDeductions || []).includes(d.name))
                .map(d => ({ name: d.name, amount: commissionAmount(d, t.total) })),
              heldRiderFee(h),
            ),
            deliveryFee: t.fee,
            extraIncomes: h.extraIncomes,
            riderType: rider?.type,
            riderName: rider?.name,
            notes: saleNo ? `Merged delivery with Sale #${saleNo}` : 'Merged delivery',
          });
          await manageHeldOrders({ action: 'remove', id: h.id, branchId: currentBranch?.id });
          completed++;
        } catch (e: any) {
          failed.push(h.customer?.customerName || 'Pending order');
        }
      }

      // Add a pending bill (at cost price) for each supplier that items were picked up from.
      let billsAdded = 0;
      const billIssues: string[] = [];
      for (const b of pickupBills) {
        if (!(b.amount > 0)) { billIssues.push(`${b.supplierName} (items have no cost price)`); continue; }
        try {
          await manageSupplierBills({
            action: 'add',
            supplierId: b.supplierId,
            amount: b.amount,
            notes: saleNo ? `POS pick-up, Sale #${saleNo}` : 'POS pick-up',
            date: new Date().toISOString(),
            source: 'pickup',
            items: b.items.map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitCost: i.unitCost })),
            saleNumber: saleNo || undefined,
            branchId: currentBranch?.id,
          });
          billsAdded++;
        } catch {
          billIssues.push(b.supplierName);
        }
      }

      toast.success(completed > 0 ? `Sale completed, plus ${completed} merged order${completed === 1 ? '' : 's'}!` : 'Sale completed!');
      if (billsAdded > 0) toast.success(`${billsAdded} supplier bill${billsAdded === 1 ? '' : 's'} added to Suppliers`);
      if (billIssues.length > 0) toast.error(`Could not add a bill for: ${billIssues.join(', ')}. Add it manually under Suppliers.`);
      if (failed.length > 0) toast.error(`Could not complete: ${failed.join(', ')}. They remain in Pending.`);

      resetOrder();
      loadSales();
      loadHeld();
      const prods = await getProducts({ status: 'Active', branchId: currentBranch?.id });
      setProducts(prods.products as Product[]);
    } catch (e: any) {
      toast.error(e.message || 'Sale failed');
    } finally {
      setProcessing(false);
    }
  };

  // As the phone number for a brand-new customer is typed, quietly check
  // whether it's already registered so we can offer that customer instead of
  // erroring out only after Save is pressed.
  const checkExistingByPhone = async (phoneRaw: string) => {
    const phone = phoneRaw.trim();
    if (!phone) { setDuplicateMatch(null); return; }
    const normalized = phone.startsWith('+') ? phone : '+' + phone;
    try {
      const res = await getCustomers({ search: normalized });
      const match = (res.customers as Customer[]).find(c => (c.phoneNumber || '') === normalized);
      setDuplicateMatch(match || null);
    } catch {
      setDuplicateMatch(null);
    }
  };

  const useDuplicateMatch = () => {
    if (!duplicateMatch) return;
    setSelectedCustomer(duplicateMatch);
    setShowCustomerDialog(false);
    setDuplicateMatch(null);
    setNewCustName(''); setNewCustPhone(''); setNewCustAddress('');
  };

  const handleCreateCustomer = async () => {
    if (!newCustName || !newCustPhone) return toast.error('Name and phone are required');
    try {
      const res = await saveCustomer({ customerName: newCustName, phoneNumber: newCustPhone, address: newCustAddress || undefined });
      setCustomers(prev => [...prev, res.customer as Customer]);
      setSelectedCustomer(res.customer as Customer);
      setShowCustomerDialog(false);
      setNewCustName(''); setNewCustPhone(''); setNewCustAddress('');
      setDuplicateMatch(null);
      toast.success('Customer created');
    } catch (e: any) {
      const msg = e.message || 'Failed';
      if (msg.toLowerCase().includes('already exists')) {
        await checkExistingByPhone(newCustPhone);
        toast.error('That number is already registered — use the existing customer below.');
      } else {
        toast.error(msg);
      }
    }
  };

  const fmt = (n: number) => `KES ${n.toLocaleString()}`;
  const mergedPayable = mergeList.reduce((s, h) => s + heldTotals(h).payable, 0);
  const timeOf = (iso: string) =>
    iso ? new Date(iso).toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Nairobi' }) : '';

  return (
    <div className="p-6 h-[calc(100vh-0px)] flex gap-6">
      {/* Left: Product Catalog */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">Point of Sale</h1>
          <div className="flex items-center gap-2">
            <ViewToggle value={catalogView} onChange={setCatalogView} />
            <Button variant="outline" size="sm" onClick={() => setShowOtherIncome(true)}>
              <DollarSign className="w-4 h-4 mr-1" /> Other Income
            </Button>
          </div>
        </div>

        <div className="mb-3 space-y-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <SummaryTiles small items={(() => {
            const f = recentSales.filter(x => x.status !== 'Voided' && inRange(range, x.saleDate));
            const sum = (xs: any[], k: string) => xs.reduce((a, x) => a + (x[k] || 0), 0);
            const cash = f.filter(x => isCashPayment(x.paymentMethod));
            return [
              { label: 'Sales Made', value: fmt(sum(f, 'total')) },
              { label: 'Deductions', value: fmt(sum(f, 'deductions')) },
              { label: 'Platform Pay', value: fmt(sum(f, 'total') - sum(cash, 'total')) },
              { label: 'Cash/M-PESA', value: fmt(sum(cash, 'total')) },
            ];
          })()} />
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search products by name or SKU..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        <div className="flex-1 overflow-y-auto">
          {catalogView === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 items-stretch">
              {filtered.map(p => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className={`bg-card border rounded-xl p-4 text-left hover:border-primary/50 hover:bg-muted/30 transition-all group flex flex-col min-w-0 h-full ${qtyInCart(p.id) > 0 ? 'border-primary/60' : 'border-border'}`}
                >
                  <div className="relative w-full mb-3">
                    <ProductImage src={p.images?.[0]?.url} alt={p.productName} className="w-full" />
                    <QtyBadge qty={qtyInCart(p.id)} />
                  </div>
                  <p className="text-sm font-medium text-foreground w-full break-words whitespace-normal leading-snug [overflow-wrap:anywhere]">{p.productName}</p>
                  <p className="text-xs text-muted-foreground font-mono w-full break-all whitespace-normal mt-0.5">{p.sku}</p>
                  <div className="flex items-center justify-between gap-2 mt-auto pt-2 flex-wrap">
                    <p className="text-sm font-bold text-primary whitespace-normal break-words">{fmt(p.sellingPrice || 0)}</p>
                    <Badge variant="secondary" className="text-[10px] whitespace-nowrap">{p.stockQuantity || 0} left</Badge>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  No products found
                </div>
              )}
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground bg-muted/30">
                    <th className="text-left p-3 font-medium">Product</th>
                    <th className="text-left p-3 font-medium">SKU</th>
                    <th className="text-right p-3 font-medium">Price</th>
                    <th className="text-right p-3 font-medium">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-12 text-muted-foreground">
                        <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        No products found
                      </td>
                    </tr>
                  ) : filtered.map(p => (
                    <tr key={p.id} onClick={() => addToCart(p)} className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors">
                      <td className="p-3 font-medium text-foreground max-w-xs">
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            <ProductImage src={p.images?.[0]?.url} alt={p.productName} className="w-10 h-10" />
                            <QtyBadge qty={qtyInCart(p.id)} small />
                          </div>
                          <span className="break-words whitespace-normal min-w-0 [overflow-wrap:anywhere]">{p.productName}</span>
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground font-mono text-xs break-all">{p.sku}</td>
                      <td className="p-3 text-right font-semibold text-primary whitespace-nowrap">{fmt(p.sellingPrice || 0)}</td>
                      <td className="p-3 text-right"><Badge variant="secondary" className="text-[10px] whitespace-nowrap">{p.stockQuantity || 0} left</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-96 shrink-0 flex flex-col min-h-0 bg-card border border-border rounded-xl">
        <div className="p-4 border-b border-border">
          {/* Cart / Pending Orders tabs */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setCartTab('cart')}
              aria-pressed={cartTab === 'cart'}
              className={`h-8 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${cartTab === 'cart' ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <ShoppingCart className="w-3.5 h-3.5" /> Cart
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{cart.length}</Badge>
            </button>
            <button
              type="button"
              onClick={() => setCartTab('pending')}
              aria-pressed={cartTab === 'pending'}
              className={`h-8 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${cartTab === 'pending' ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Clock className="w-3.5 h-3.5" /> Pending Orders
              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${heldOrders.length > 0 ? 'bg-amber-500/20 text-amber-400' : ''}`}>{heldOrders.length}</Badge>
            </button>
          </div>

          {cartTab === 'cart' && (
            <div className="mt-3 flex items-center gap-2">
              {selectedCustomer ? (
                <div className="flex-1 flex items-center justify-between bg-muted rounded-lg px-3 py-2 gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground break-words whitespace-normal">{selectedCustomer.customerName}</p>
                    <p className="text-[10px] text-muted-foreground break-all">{selectedCustomer.phoneNumber}</p>
                  </div>
                  <button onClick={() => setSelectedCustomer(null)} className="shrink-0"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
                </div>
              ) : (
                <>
                  <CustomerPicker
                    className="w-1/2 min-w-0 rounded-md ring-1 ring-pink-400/70"
                    placeholder="Link customer..."
                    onSelect={(c: PickableCustomer) => setSelectedCustomer(c as Customer)}
                  />
                  <Button size="sm" variant="outline" onClick={() => setShowCustomerDialog(true)} className="h-9 w-1/2 border-amber-400/80 hover:border-amber-400 hover:shadow-[0_0_12px_hsl(45_95%_55%/0.35)]"><UserPlus className="w-3.5 h-3.5 mr-1" /> Add Customer</Button>
                </>
              )}
            </div>
          )}
        </div>

        {cartTab === 'pending' ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
            {heldOrders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No pending orders</p>
                <p className="text-xs mt-1">Use "Hold" on the cart to park an order here.</p>
              </div>
            ) : heldOrders.map(h => {
              const t = heldTotals(h);
              const merged = mergedIds.includes(h.id);
              return (
                <div key={h.id} className={`rounded-lg border px-3 py-2 space-y-1.5 ${merged ? 'border-emerald-500/70 bg-emerald-500/5' : 'border-border bg-muted/30'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground break-words">{h.customer?.customerName || 'Walk-in customer'}</p>
                      {h.customer?.phoneNumber && <p className="text-[10px] text-muted-foreground">{h.customer.phoneNumber}</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">Held {timeOf(h.heldAt)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 break-words">
                    {h.items.map(i => `${i.quantity}× ${i.productName || 'Item'}`).join(', ')}
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Total{t.fee + t.extra > 0 ? ' (incl. fees)' : ''}</span>
                    <span className="font-bold text-primary">{fmt(t.payable)}</span>
                  </div>
                  {merged && <p className="text-[10px] text-emerald-400">Merged into the current delivery — completes on Checkout</p>}
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-7 flex-1 text-xs" onClick={() => resumeHeld(h)}><Play className="w-3 h-3 mr-1" /> Resume</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => deleteHeld(h)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
              {cart.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Cart is empty</p>
                </div>
              ) : cart.map(item => (
                <div key={item.product.id} className="flex items-center gap-2.5 bg-muted/50 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className={`${cartNameSize(item.product.productName)} font-medium text-foreground break-words whitespace-normal leading-tight [overflow-wrap:anywhere]`}>{item.product.productName}</p>
                    <p className="text-xs text-muted-foreground">{fmt(item.unitPrice)} each</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => updateQty(item.product.id, -1)} className="w-6 h-6 rounded bg-muted flex items-center justify-center hover:bg-border"><Minus className="w-3 h-3" /></button>
                    <span className="text-sm font-semibold w-6 text-center">{item.quantity}</span>
                    <button onClick={() => updateQty(item.product.id, 1)} className="w-6 h-6 rounded bg-muted flex items-center justify-center hover:bg-border"><Plus className="w-3 h-3" /></button>
                  </div>
                  <p className="text-sm font-semibold text-foreground w-20 text-right shrink-0 break-words">{fmt(item.unitPrice * item.quantity)}</p>
                  <button onClick={() => removeFromCart(item.product.id)} className="text-destructive hover:text-red-300 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>

            <div className="border-t border-border flex flex-col shrink-0">
              {/* Scrollable options */}
              <div className="p-4 pb-3 space-y-3 max-h-[45vh] overflow-y-auto">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground">{fmt(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Discount{discountType === '%' ? ` (${Math.min(Number(discountValue) || 0, 100)}%)` : ''}</span>
                    <span className="text-sky-400">-{fmt(discountAmount)}</span>
                  </div>
                )}
                {deliveryFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{feeInc?.name || 'Delivery fee'}</span>
                    <span className="text-foreground">{fmt(deliveryFee)}</span>
                  </div>
                )}
                {appliedExtras.map(e => (
                  <div key={e.name} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{e.name}</span>
                    <span className="text-foreground">{fmt(e.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-lg font-bold">
                  <span className="text-foreground">Total</span>
                  <span className="text-primary">{fmt(payable)}</span>
                </div>

                {/* Payment method */}
                <div className="grid grid-cols-2 gap-1.5">
                  {['Platform Pay', 'Cash/M-PESA'].map(m => (
                    <button key={m} type="button" onClick={() => setPaymentMethod(m)}
                      className={`h-7 rounded-md border text-[11px] font-medium transition-all ${paymentMethod === m ? 'border-sky-500 bg-sky-500 text-white' : 'border-border text-muted-foreground hover:border-sky-500/60'}`}>
                      {m}
                    </button>
                  ))}
                </div>

                {/* Delivery fee (first income of the outlet) and Discount, side by side */}
                <div className="grid grid-cols-2 gap-1.5">
                  {feeInc && (
                    <FeeTile
                      label={`${feeInc.name || 'Delivery Fee'} KES`}
                      on={feeOn}
                      onToggle={() => setFeeOnOverride(!feeOn)}
                      value={feeAmount}
                      onValue={setFeeOverride}
                      onCls={AMBER_ON}
                      offCls={AMBER_OFF}
                      title={`${feeInc.name} in KES`}
                    />
                  )}
                  {/* Discount: permanent label, amount in KES or % (same size as the Rider Fee tile) */}
                  <div className={`h-7 rounded-md border flex items-center overflow-hidden transition-all ${discountAmount > 0 ? 'border-sky-500 bg-sky-500 text-white' : 'border-border text-muted-foreground hover:border-sky-500/60'}`}>
                    <span className="flex-1 min-w-0 pl-2 text-[11px] font-medium truncate">Discount</span>
                    <input
                      type="number"
                      min={0}
                      value={discountValue}
                      placeholder="0"
                      onChange={e => setDiscountValue(e.target.value)}
                      title="Discount amount"
                      className={`h-5 w-11 mr-1 rounded px-1 text-right text-[11px] outline-none ${discountAmount > 0 ? 'bg-white/25 text-white placeholder:text-white/70' : 'bg-transparent text-foreground placeholder:text-muted-foreground'}`}
                    />
                    <button
                      type="button"
                      onClick={() => setDiscountType(t => (t === 'KES' ? '%' : 'KES'))}
                      title="Switch between KES and %"
                      className={`h-full px-1.5 border-l text-[11px] font-semibold ${discountAmount > 0 ? 'border-white/40 hover:bg-white/20' : 'border-border hover:bg-muted'}`}
                    >
                      {discountType}
                    </button>
                  </div>
                </div>

                {/* Other incomes & revenues of the outlet (Settings > Outlets > Incomes & Revenues) */}
                {extraIncomes.length > 0 && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {extraIncomes.map(e => (
                      <FeeTile
                        key={e.name}
                        label={`${e.name} KES`}
                        on={e.on}
                        onToggle={() => setExtraOn(p => ({ ...p, [e.name]: !e.on }))}
                        value={e.amount}
                        onValue={v => setExtraVal(p => ({ ...p, [e.name]: v }))}
                        onCls={AMBER_ON}
                        offCls={AMBER_OFF}
                        title={`${e.name} in KES`}
                      />
                    ))}
                  </div>
                )}

                {/* Outlet deductions: set up in Settings > Outlets. Switched-on ones apply automatically; tap to switch off/on for this order */}
                {outletDeductions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">Deductions (tap to switch on / off)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {outletDeductions.map(d => {
                        const on = selectedDeductions.includes(d.name);
                        return (
                          <button key={d.name} type="button" onClick={() => toggleDeduction(d)}
                            className={`h-7 px-2 rounded-md border text-[11px] font-medium transition-all ${on ? 'border-pink-500 bg-pink-500 text-white' : 'border-border text-muted-foreground hover:border-pink-500/60'}`}>
                            {d.name} · {d.type === 'percent' ? `${d.value}%` : `KES ${d.value.toLocaleString()}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {(appliedDeductions.length > 0 || riderFee > 0) && (
                  <p className="text-[11px] text-pink-400">
                    Deductions on this order: {fmt(deductionsTotal + riderFee)}{riderFee > 0 ? ` (incl. rider fee ${fmt(riderFee)})` : ''}
                  </p>
                )}

                {/* Rider fee: tap the label to switch on/off, edit the KES value. Recorded as a deduction on the sale. */}
                <div className="grid grid-cols-2 gap-1.5">
                  <FeeTile
                    label="Rider Fee KES"
                    on={riderFeeOn}
                    onToggle={() => setRiderFeeOn(!riderFeeOn)}
                    value={riderFeeAmount}
                    onValue={setRiderFeeAmount}
                    onCls="border-emerald-500 bg-emerald-500 text-white"
                    offCls="border-border text-muted-foreground hover:border-emerald-500/60"
                    title="Rider fee in KES (recorded as a deduction on this sale)"
                  />
                </div>

                <div className="space-y-2 border-t border-border pt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Delivery (optional)</p>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowDeliveryMap(true)}>
                      <Route className="w-3 h-3 mr-1" /> {routePoints.length > 0 ? `${routePoints.length} stops` : 'Plan Route'}
                    </Button>
                  </div>
                  {routePoints.length > 0 && (
                    <div className="bg-muted/50 rounded-lg p-2 space-y-1 max-h-40 overflow-y-auto">
                      {routePoints.map((pt: any, i: number) => (
                        <div key={pt.id} className="text-[10px] text-muted-foreground flex gap-1 items-start">
                          <span className="font-bold text-foreground shrink-0">{i + 1}.</span>
                          <span className="capitalize font-medium shrink-0" style={{ color: pt.tag === 'start' ? '#22c55e' : pt.tag === 'pickup' ? '#3b82f6' : pt.tag === 'dropoff' ? '#ef4444' : pt.tag === 'end' ? '#a855f7' : '#6b7280' }}>{pt.tag || 'pin'}</span>
                          <span className="min-w-0 break-words whitespace-normal">{pt.label}</span>
                        </div>
                      ))}
                      {distanceKm > 0 && <div className="text-xs font-semibold text-primary mt-1">Distance: {distanceKm.toFixed(2)} km</div>}
                    </div>
                  )}
                </div>
              </div>

              {/* Frozen footer: merged-orders tile and Hold / Checkout stay in view while the options above scroll */}
              <div className="shrink-0 border-t border-border bg-card rounded-b-xl p-4 pt-3 space-y-2">
                {mergeList.length > 0 && (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-500/60 bg-emerald-500/5 px-2 py-1">
                    <Layers className="w-3 h-3 text-emerald-400 shrink-0" />
                    <p className="flex-1 min-w-0 text-[11px] truncate" title="They are completed automatically with this checkout">
                      <span className="font-medium text-emerald-400">{mergeList.length} merged</span>
                      <span className="text-muted-foreground"> · +{fmt(mergedPayable)}</span>
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px] border-emerald-500/70 hover:border-emerald-500"
                      onClick={unmergeAll}
                      title="Remove the merged pending orders from this checkout"
                    >
                      Unmerge
                    </Button>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="h-12 px-3 border-amber-400/80 hover:border-amber-400"
                    onClick={handleHold}
                    disabled={holding || processing || cart.length === 0}
                    title="Put this order on hold"
                  >
                    <Pause className="w-4 h-4 mr-1" /> {holding ? '...' : 'Hold'}
                  </Button>
                  <Button className="flex-1 h-12 text-base bg-gradient-to-r from-primary to-secondary" onClick={handleCheckout} disabled={processing || cart.length === 0}>
                    {processing ? 'Processing...' : `Checkout ${fmt(payable)}`}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Other Income (now a working dialog) */}
      <OtherIncomeDialog open={showOtherIncome} onOpenChange={setShowOtherIncome} />

      {/* New Customer Dialog */}
      <Dialog open={showCustomerDialog} onOpenChange={(open) => { setShowCustomerDialog(open); if (!open) setDuplicateMatch(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={newCustName} onChange={e => setNewCustName(e.target.value)} placeholder="Customer name" /></div>
            <div>
              <Label>Phone Number *</Label>
              <Input
                value={newCustPhone}
                onChange={e => { setNewCustPhone(e.target.value); setDuplicateMatch(null); }}
                onBlur={e => checkExistingByPhone(e.target.value)}
                placeholder="+254..."
              />
            </div>
            {duplicateMatch && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5" /> A customer with this number already exists:</p>
                <p className="text-sm font-medium text-foreground">{duplicateMatch.customerName} · {duplicateMatch.phoneNumber}</p>
                <Button type="button" size="sm" onClick={useDuplicateMatch}>Use this customer</Button>
              </div>
            )}
            <div>
              <Label>Location</Label>
              <div className="flex gap-2">
                <Input value={newCustAddress} onChange={e => setNewCustAddress(e.target.value)} placeholder="Address (optional)" className="flex-1" />
                <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => setShowCustLocationPicker(true)}><MapPin className="w-4 h-4" /></Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomerDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateCustomer}>Add Customer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LocationPickerDialog
        open={showCustLocationPicker}
        onOpenChange={setShowCustLocationPicker}
        title="Customer Location"
        value={newCustAddress}
        onSelect={(address) => { setNewCustAddress(address); }}
      />

      <Dialog open={showDeliveryMap} onOpenChange={setShowDeliveryMap}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Route className="w-5 h-5 text-primary" /> Plan Delivery Route</DialogTitle>
          </DialogHeader>

          <DeliveryRouteMap
            points={routePoints}
            onPointsChange={setRoutePoints}
            totalDistance={distanceKm}
            onDistanceChange={setDistanceKm}
            pickupItems={pickupItems}
            pickupSelections={pickupSelections}
            onPickupSelectionsChange={setPickupSelections}
            extraActions={
              <Button
                type="button"
                variant="outline"
                className="h-9 text-xs border-emerald-500/70 hover:border-emerald-500"
                onClick={() => setShowMergeDialog(true)}
              >
                <Layers className="w-3.5 h-3.5 mr-1.5 shrink-0 text-emerald-400" />
                <span className="truncate">Merge Orders{mergeList.length > 0 ? ` (${mergeList.length})` : ''}</span>
              </Button>
            }
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRoutePoints([]); setDistanceKm(0); setMergedIds([]); setPickupSelections({}); }}>Clear All</Button>
            <Button onClick={() => setShowDeliveryMap(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge pending orders into the delivery route */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Layers className="w-5 h-5 text-emerald-400" /> Merge pending orders</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Tick pending orders to add their drop-offs to this route. They are completed automatically when you press Checkout.
            </p>
            {heldOrders.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No pending orders to merge.</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {heldOrders.map(h => {
                  const t = heldTotals(h);
                  const drops = (h.routePoints || []).filter((p: any) => p.tag === 'dropoff').length;
                  return (
                    <label key={h.id} className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5 cursor-pointer text-xs">
                      <Checkbox checked={mergedIds.includes(h.id)} onCheckedChange={() => toggleMerge(h)} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-foreground truncate">{h.customer?.customerName || 'Walk-in customer'}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {h.items.length} item{h.items.length === 1 ? '' : 's'} · {drops > 0 ? `${drops} drop-off pin${drops === 1 ? '' : 's'}` : 'no drop-off pin'}
                        </span>
                      </span>
                      <span className="font-semibold text-primary shrink-0">{fmt(t.payable)}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={unmergeAll} disabled={mergeList.length === 0}>Unmerge all</Button>
            <Button onClick={() => setShowMergeDialog(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
