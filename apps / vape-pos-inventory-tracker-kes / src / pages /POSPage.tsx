import { useState, useEffect } from 'react';
import { getProducts, getCustomers, createSale, saveCustomer, getSales } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Switch } from '@project/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Search, Plus, Minus, ShoppingCart, Trash2, UserPlus, X, Receipt, DollarSign, MapPin, Route, UserCheck, Truck, Bike } from 'lucide-react';
import { toast } from 'sonner';
import DeliveryRouteMap from '../components/DeliveryRouteMap';
import LocationPickerDialog from '../components/LocationPickerDialog';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import OtherIncomeDialog from '../components/OtherIncomeDialog';
import ProductImage from '../components/ProductImage';
import CustomerPicker, { PickableCustomer } from '../components/CustomerPicker';
import { useBranch, commissionAmount } from '../hooks/useBranch';
import SummaryTiles from '../components/SummaryTiles';
import DateRangeFilter, { Range, inRange } from '../components/DateRangeFilter';
import { isCashPayment } from '../lib/payments';
import { Riders, RiderType, RIDER_LABELS, DEFAULT_DELIVERY_FEE, loadRiders } from '../lib/delivery';

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

  // Names of the outlet deductions the cashier has ticked for the current order.
  const [selectedDeductions, setSelectedDeductions] = useState<string[]>([]);

  // Delivery fee: on by default, amount defaults to the outlet's fee, both adjustable per sale.
  const outletFee = currentBranch?.deliveryFee ?? DEFAULT_DELIVERY_FEE;
  const [feeOn, setFeeOn] = useState(true);
  const [feeAmount, setFeeAmount] = useState(String(outletFee));
  useEffect(() => { setFeeAmount(String(outletFee)); setFeeOn(true); }, [currentBranch?.id, outletFee]);
  const deliveryFee = feeOn ? Math.max(0, Number(feeAmount) || 0) : 0;

  // Riders (3PL / own) shared by all outlets
  const [riders, setRiders] = useState<Riders>({ threePl: [], own: [] });
  const [rider, setRider] = useState<SelectedRider | null>(null);
  const [riderDialog, setRiderDialog] = useState<RiderType | null>(null);
  const [riderChoice, setRiderChoice] = useState('none');
  useEffect(() => { loadRiders().then(setRiders).catch(() => {}); }, []);

  const openRiderDialog = (type: RiderType) => {
    setRiderChoice(rider?.type === type ? rider.id : 'none');
    setRiderDialog(type);
  };
  const confirmRider = () => {
    if (!riderDialog) return;
    if (riderChoice === 'none') {
      if (rider?.type === riderDialog) setRider(null);
    } else {
      const r = riders[riderDialog].find(x => x.id === riderChoice);
      if (r) setRider({ type: riderDialog, id: r.id, name: r.name });
    }
    setRiderDialog(null);
  };

  const [showDeliveryMap, setShowDeliveryMap] = useState(false);
  const [routePoints, setRoutePoints] = useState<any[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [range, setRange] = useState<Range>({});
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const loadSales = () => getSales({ branchId: currentBranch?.id }).then(r => setRecentSales(r.sales)).catch(() => {});
  useEffect(() => { loadSales(); }, [currentBranch?.id]);

  // Switching outlet changes the available deductions, so start fresh.
  useEffect(() => { setSelectedDeductions([]); }, [currentBranch?.id]);

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
  const total = subtotal;
  const payable = total + deliveryFee;

  // Deductions are defined per outlet in Settings; the cashier only chooses which apply.
  const outletDeductions = currentBranch?.commissions || [];
  const appliedDeductions = outletDeductions.filter(d => selectedDeductions.includes(d.name));
  const deductionsTotal = appliedDeductions.reduce((s, d) => s + commissionAmount(d, total), 0);
  const toggleDeduction = (name: string) =>
    setSelectedDeductions(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);

  const handleCheckout = async () => {
    if (cart.length === 0) return toast.error('Cart is empty');
    setProcessing(true);
    try {
      const pickups = routePoints.filter((p: any) => p.tag === 'pickup');
      const dropoffs = routePoints.filter((p: any) => p.tag === 'dropoff');
      const otherStops = routePoints.filter((p: any) => !p.tag || (p.tag !== 'start' && p.tag !== 'end' && p.tag !== 'pickup' && p.tag !== 'dropoff'));

      await createSale({
        items: cart.map(c => ({ productId: c.product.id, quantity: c.quantity, unitPrice: c.unitPrice })),
        customerId: selectedCustomer?.id,
        paymentMethod,
        branchId: currentBranch?.id,
        pickupPoint: pickups.map((p: any) => p.label).join('; ') || undefined,
        deliveryAddress: dropoffs.map((p: any) => p.label).join('; ') || undefined,
        deliveryCoordinates: routePoints.length > 0 ? routePoints.map((p: any) => `${p.lat},${p.lng}`).join(' → ') : undefined,
        stops: [...otherStops, ...pickups, ...dropoffs].map((p: any) => p.label).join('; ') || undefined,
        deliveryDistanceKm: distanceKm || undefined,
        deductions: appliedDeductions.map(d => ({ name: d.name, amount: commissionAmount(d, total) })),
        deliveryFee,
        riderType: rider?.type,
        riderName: rider?.name,
      });
      toast.success('Sale completed!');
      // Clearing the cart also clears the quantity badges on the product tiles.
      setCart([]);
      setSelectedCustomer(null);
      setSelectedDeductions([]);
      setRider(null);
      setFeeOn(true);
      setFeeAmount(String(outletFee));
      setRoutePoints([]); setDistanceKm(0); loadSales();
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
      <div className="w-96 shrink-0 flex flex-col bg-card border border-border rounded-xl">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" /> Cart
              <Badge variant="secondary" className="text-xs">{cart.length}</Badge>
            </h2>
          </div>

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
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
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

        <div className="border-t border-border p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-foreground">{fmt(subtotal)}</span>
          </div>
          {deliveryFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Delivery fee</span>
              <span className="text-foreground">{fmt(deliveryFee)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold">
            <span className="text-foreground">Total</span>
            <span className="text-primary">{fmt(payable)}</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {['Platform Pay', 'Cash/M-PESA'].map(m => (
              <button key={m} type="button" onClick={() => setPaymentMethod(m)}
                className={`h-9 rounded-md border text-xs font-medium transition-all ${paymentMethod === m ? 'border-sky-500 bg-sky-500 text-white' : 'border-border text-muted-foreground hover:border-sky-500/60'}`}>
                {m}
              </button>
            ))}
          </div>

          {/* Delivery fee: on by default, can be switched off or edited (even to 0) for this sale */}
          <div className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors ${feeOn ? 'border-amber-400/70' : 'border-border'}`}>
            <Switch id="delivery-fee" checked={feeOn} onCheckedChange={setFeeOn} className="data-[state=checked]:bg-amber-500" />
            <Label htmlFor="delivery-fee" className="text-xs font-medium flex-1 cursor-pointer">Delivery fee</Label>
            <span className="text-[11px] text-muted-foreground">KES</span>
            <Input
              type="number"
              min={0}
              value={feeOn ? feeAmount : '0'}
              disabled={!feeOn}
              onChange={e => setFeeAmount(e.target.value)}
              className="h-8 w-20 text-xs text-right"
            />
          </div>

          {/* Outlet deductions: set up in Settings > Outlets, picked per order here */}
          {outletDeductions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">Deductions (select all that apply)</p>
              <div className="flex flex-wrap gap-1.5">
                {outletDeductions.map(d => {
                  const on = selectedDeductions.includes(d.name);
                  return (
                    <button key={d.name} type="button" onClick={() => toggleDeduction(d.name)}
                      className={`h-7 px-2 rounded-md border text-[11px] font-medium transition-all ${on ? 'border-pink-500 bg-pink-500 text-white' : 'border-border text-muted-foreground hover:border-pink-500/60'}`}>
                      {d.name} · {d.type === 'percent' ? `${d.value}%` : `KES ${d.value.toLocaleString()}`}
                    </button>
                  );
                })}
              </div>
              {appliedDeductions.length > 0 && (
                <p className="text-[11px] text-pink-400">Deductions on this order: {fmt(deductionsTotal)}</p>
              )}
            </div>
          )}

          {/* Delivery riders: managed in Settings > Delivery */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Delivery rider (optional)</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(['threePl', 'own'] as RiderType[]).map(t => {
                const on = rider?.type === t;
                const Icon = t === 'threePl' ? Truck : Bike;
                return (
                  <button key={t} type="button" onClick={() => openRiderDialog(t)} title={RIDER_LABELS[t]}
                    className={`h-9 px-2 rounded-md border text-xs font-medium transition-all flex items-center justify-center gap-1.5 min-w-0 ${on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border text-muted-foreground hover:border-emerald-500/60'}`}>
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{on ? rider!.name : RIDER_LABELS[t]}</span>
                  </button>
                );
              })}
            </div>
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

          <Button className="w-full h-12 text-base bg-gradient-to-r from-primary to-secondary" onClick={handleCheckout} disabled={processing || cart.length === 0}>
            {processing ? 'Processing...' : `Checkout ${fmt(payable)}`}
          </Button>
        </div>
      </div>

      {/* Other Income (now a working dialog) */}
      <OtherIncomeDialog open={showOtherIncome} onOpenChange={setShowOtherIncome} />

      {/* Rider picker */}
      <Dialog open={!!riderDialog} onOpenChange={o => { if (!o) setRiderDialog(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>{riderDialog ? RIDER_LABELS[riderDialog] : ''}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Rider for this order</Label>
            <Select value={riderChoice} onValueChange={setRiderChoice}>
              <SelectTrigger><SelectValue placeholder="Choose a rider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No rider</SelectItem>
                {(riderDialog ? riders[riderDialog] : []).map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {riderDialog && riders[riderDialog].length === 0 && (
              <p className="text-xs text-muted-foreground">No riders yet. Add them under Settings → Delivery.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiderDialog(null)}>Cancel</Button>
            <Button onClick={confirmRider}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          <DeliveryRouteMap points={routePoints} onPointsChange={setRoutePoints} totalDistance={distanceKm} onDistanceChange={setDistanceKm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRoutePoints([]); setDistanceKm(0); }}>Clear All</Button>
            <Button onClick={() => setShowDeliveryMap(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
