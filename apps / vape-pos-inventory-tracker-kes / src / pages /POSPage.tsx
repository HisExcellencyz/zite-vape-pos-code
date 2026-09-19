import { useState, useEffect } from 'react';
import { getProducts, getCustomers, createSale, saveCustomer, getAddresses } from 'zitejs/api';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Badge } from '@project/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Search, Plus, Minus, ShoppingCart, Trash2, UserPlus, X, Receipt, DollarSign, MapPin, Route } from 'lucide-react';
import { toast } from 'sonner';
import DeliveryRouteMap from '../components/DeliveryRouteMap';

interface Product {
  id: string;
  productName?: string;
  sku?: string;
  sellingPrice?: number;
  costPrice?: number;
  stockQuantity?: number;
  taxRate?: number;
  status?: string;
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

interface AddressOption {
  id: string;
  addressName?: string;
  type?: string;
  fullAddress?: string;
  coordinates?: string;
}

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [addresses, setAddresses] = useState<AddressOption[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showOtherIncome, setShowOtherIncome] = useState(false);

  // Delivery fields
  const [showDeliveryMap, setShowDeliveryMap] = useState(false);
  const [routePoints, setRoutePoints] = useState<any[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);

  useEffect(() => {
    Promise.all([
      getProducts({ status: 'Active' }),
      getCustomers({}),
      getAddresses({}),
    ]).then(([prods, custs, addrs]) => {
      setProducts(prods.products as Product[]);
      setCustomers(custs.customers as Customer[]);
      setAddresses(addrs.addresses as AddressOption[]);
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

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(c => c.product.id !== productId));
  };

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
        items: cart.map(c => ({
          productId: c.product.id,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
        })),
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
      // Reload products to get updated stock
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
      const res = await saveCustomer({ customerName: newCustName, phoneNumber: newCustPhone });
      setCustomers(prev => [...prev, res.customer as Customer]);
      setSelectedCustomer(res.customer as Customer);
      setShowCustomerDialog(false);
      setNewCustName(''); setNewCustPhone('');
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
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-foreground">Point of Sale</h1>
          <Button variant="outline" size="sm" onClick={() => setShowOtherIncome(true)}>
            <DollarSign className="w-4 h-4 mr-1" /> Other Income
          </Button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search products by name or SKU..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map(p => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/50 hover:bg-muted/30 transition-all group"
              >
                <div className="w-full aspect-square bg-muted rounded-lg mb-3 flex items-center justify-center">
                  <ShoppingCart className="w-8 h-8 text-muted-foreground/30 group-hover:text-primary/40 transition-colors" />
                </div>
                <p className="text-sm font-medium text-foreground truncate">{p.productName}</p>
                <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm font-bold text-primary">{fmt(p.sellingPrice || 0)}</p>
                  <Badge variant="secondary" className="text-[10px]">{p.stockQuantity || 0} left</Badge>
                </div>
              </button>
            ))}
          </div>
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

          {/* Customer selector */}
          <div className="mt-3 flex items-center gap-2">
            {selectedCustomer ? (
              <div className="flex-1 flex items-center justify-between bg-muted rounded-lg px-3 py-2">
                <div>
                  <p className="text-xs font-medium text-foreground">{selectedCustomer.customerName}</p>
                  <p className="text-[10px] text-muted-foreground">{selectedCustomer.phoneNumber}</p>
                </div>
                <button onClick={() => setSelectedCustomer(null)}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
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

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Cart is empty</p>
            </div>
          ) : cart.map(item => (
            <div key={item.product.id} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{item.product.productName}</p>
                <p className="text-xs text-muted-foreground">{fmt(item.unitPrice)} each</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => updateQty(item.product.id, -1)} className="w-6 h-6 rounded bg-muted flex items-center justify-center hover:bg-border">
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-sm font-semibold w-6 text-center">{item.quantity}</span>
                <button onClick={() => updateQty(item.product.id, 1)} className="w-6 h-6 rounded bg-muted flex items-center justify-center hover:bg-border">
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <p className="text-sm font-semibold text-foreground w-20 text-right">{fmt(item.unitPrice * item.quantity)}</p>
              <button onClick={() => removeFromCart(item.product.id)} className="text-destructive hover:text-red-300">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Totals & Checkout */}
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

          {/* Delivery info */}
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Delivery (optional)</p>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowDeliveryMap(true)}>
                <Route className="w-3 h-3 mr-1" /> {routePoints.length > 0 ? `${routePoints.length} stops` : 'Plan Route'}
              </Button>
            </div>
            {routePoints.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-2 space-y-1">
                {routePoints.map((pt: any, i: number) => (
                  <div key={pt.id} className="text-[10px] text-muted-foreground flex gap-1">
                    <span className="font-bold text-foreground">{i + 1}.</span>
                    <span className="capitalize font-medium" style={{ color: pt.tag === 'start' ? '#22c55e' : pt.tag === 'pickup' ? '#3b82f6' : pt.tag === 'dropoff' ? '#ef4444' : pt.tag === 'end' ? '#a855f7' : '#6b7280' }}>{pt.tag || 'pin'}</span>
                    <span className="truncate">{pt.label}</span>
                  </div>
                ))}
                {distanceKm > 0 && (
                  <div className="text-xs font-semibold text-primary mt-1">Distance: {distanceKm.toFixed(2)} km</div>
                )}
              </div>
            )}
          </div>

          <Button className="w-full h-12 text-base bg-gradient-to-r from-primary to-secondary" onClick={handleCheckout} disabled={processing || cart.length === 0}>
            {processing ? 'Processing...' : `Checkout ${fmt(total)}`}
          </Button>
        </div>
      </div>

      {/* New Customer Dialog */}
      <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={newCustName} onChange={e => setNewCustName(e.target.value)} placeholder="Customer name" />
            </div>
            <div>
              <Label>Phone Number *</Label>
              <Input value={newCustPhone} onChange={e => setNewCustPhone(e.target.value)} placeholder="+254..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomerDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateCustomer}>Add Customer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery Route Map Dialog */}
      <Dialog open={showDeliveryMap} onOpenChange={setShowDeliveryMap}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Route className="w-5 h-5 text-primary" /> Plan Delivery Route
            </DialogTitle>
          </DialogHeader>
          <DeliveryRouteMap
            points={routePoints}
            onPointsChange={setRoutePoints}
            totalDistance={distanceKm}
            onDistanceChange={setDistanceKm}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRoutePoints([]); setDistanceKm(0); }}>Clear All</Button>
            <Button onClick={() => setShowDeliveryMap(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
