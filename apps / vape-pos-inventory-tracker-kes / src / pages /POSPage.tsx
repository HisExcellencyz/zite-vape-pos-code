import { useState, useEffect } from 'react';
import { getProducts, getCustomers, createSale, saveCustomer } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Search, Plus, Minus, ShoppingCart, Trash2, UserPlus, X, Receipt, DollarSign, MapPin, Route } from 'lucide-react';
import { toast } from 'sonner';
import DeliveryRouteMap from '../components/DeliveryRouteMap';
import LocationPickerDialog from '../components/LocationPickerDialog';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import OtherIncomeDialog from '../components/OtherIncomeDialog';
import ProductImage from '../components/ProductImage';

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

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [showCustLocationPicker, setShowCustLocationPicker] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showOtherIncome, setShowOtherIncome] = useState(false);
  const [catalogView, setCatalogView] = useViewMode('pos', 'grid');

  const [showDeliveryMap, setShowDeliveryMap] = useState(false);
  const [routePoints, setRoutePoints] = useState<any[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);

  useEffect(() => {
    Promise.all([getProducts({ status: 'Active' }), getCustomers({})]).then(([prods, custs]) => {
      setProducts(prods.products as Product[]);
      setCustomers(custs.customers as Customer[]);
    });
  }, []);

  const filtered = products.filter(p =>
    (p.productName || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.sku || '').toLowerCase().includes(search.toLowerCase())
  );

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
        pickupPoint: pickups.map((p: any) => p.label).join('; ') || undefined,
        deliveryAddress: dropoffs.map((p: any) => p.label).join('; ') || undefined,
        deliveryCoordinates: routePoints.length > 0 ? routePoints.map((p: any) => `${p.lat},${p.lng}`).join(' → ') : undefined,
        stops: [...otherStops, ...pickups, ...dropoffs].map((p: any) => p.label).join('; ') || undefined,
        deliveryDistanceKm: distanceKm || undefined,
      });
      toast.success('Sale completed!');
      setCart([]);
      setSelectedCustomer(null);
      setRoutePoints([]); setDistanceKm(0);
      const prods = await getProducts({ status: 'Active' });
      setProducts(prods.products as Product[]);
    } catch (e: any) {
      toast.error(e.message || 'Sale failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustName || !newCustPhone) return toast.error('Name and phone are required');
    try {
      const res = await saveCustomer({ customerName: newCustName, phoneNumber: newCustPhone, address: newCustAddress || undefined });
      setCustomers(prev => [...prev, res.customer as Customer]);
      setSelectedCustomer(res.customer as Customer);
      setShowCustomerDialog(false);
      setNewCustName(''); setNewCustPhone(''); setNewCustAddress('');
      toast.success('Customer created');
    } catch (e: any) {
      toast.error(e.message || 'Failed');
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
                  className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/50 hover:bg-muted/30 transition-all group flex flex-col min-w-0 h-full"
                >
                  <ProductImage src={p.images?.[0]?.url} alt={p.productName} className="w-full mb-3" />
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
                          <ProductImage src={p.images?.[0]?.url} alt={p.productName} className="w-10 h-10" />
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
                <Select onValueChange={id => {
                  const c = customers.find(c => c.id === id);
                  if (c) setSelectedCustomer(c);
                }}>
                  <SelectTrigger className="flex-1 h-9 text-xs"><SelectValue placeholder="Link customer..." /></SelectTrigger>
                  <SelectContent>
                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.customerName} ({c.phoneNumber})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => setShowCustomerDialog(true)} className="h-9"><UserPlus className="w-3.5 h-3.5" /></Button>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Cart is empty</p>
            </div>
          ) : cart.map(item => (
            <div key={item.product.id} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground break-words whitespace-normal [overflow-wrap:anywhere]">{item.product.productName}</p>
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

        <div className="border-t border-border p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-foreground">{fmt(subtotal)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold">
            <span className="text-foreground">Total</span>
            <span className="text-primary">{fmt(total)}</span>
          </div>

          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="mpesa">M-Pesa</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
            </SelectContent>
          </Select>

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
            {processing ? 'Processing...' : `Checkout ${fmt(total)}`}
          </Button>
        </div>
      </div>

      {/* Other Income (now a working dialog) */}
      <OtherIncomeDialog open={showOtherIncome} onOpenChange={setShowOtherIncome} />

      {/* New Customer Dialog */}
      <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={newCustName} onChange={e => setNewCustName(e.target.value)} placeholder="Customer name" /></div>
            <div><Label>Phone Number *</Label><Input value={newCustPhone} onChange={e => setNewCustPhone(e.target.value)} placeholder="+254..." /></div>
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
