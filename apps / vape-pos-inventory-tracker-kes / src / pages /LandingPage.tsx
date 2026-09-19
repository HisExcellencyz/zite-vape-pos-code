import { loginWithRedirect } from 'zitejs/auth';
import { Button } from '@project/components/ui/button';
import { ShoppingCart, BarChart3, Package } from 'lucide-react';

const LOGO = 'https://images.fillout.com/orgid-811092/flowpublicid-6hepsbbapu/widgetid-default/xmArbfbmsBwLWSE2d2Et7u/pasted-image-1788367385543-n4ulma8b.png';
const COVER = 'https://images.fillout.com/orgid-811092/flowpublicid-6hepsbbapu/widgetid-default/bkTX9KzLg7aEnqi9UjFEps/pasted-image-1788367385641-4k68git5.png';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-3 flex items-center justify-between bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <img src={LOGO} alt="Uptown Vapes" className="w-10 h-10 rounded-xl object-cover" />
          <span className="text-xl font-bold text-foreground">Uptown Vapes</span>
        </div>
        <Button onClick={() => loginWithRedirect()} size="lg" className="bg-primary hover:bg-primary/90">
          Sign In
        </Button>
      </header>

      {/* Hero with cover photo */}
      <main className="flex-1 flex flex-col">
        <div className="relative w-full">
          <img src={COVER} alt="Uptown Vapes Products" className="w-full h-[340px] md:h-[420px] object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>

        <div className="flex-1 flex items-center justify-center px-6 -mt-20 relative z-10">
          <div className="max-w-2xl text-center">
            <img src={LOGO} alt="UV" className="w-20 h-20 rounded-2xl object-cover mx-auto mb-6 ring-4 ring-background shadow-2xl" />
            <h1 className="text-4xl md:text-5xl font-extrabold text-foreground mb-4 leading-tight">
              Your <span className="text-primary">Complete</span> Vape Business{' '}
              <span className="text-secondary">Hub</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-lg mx-auto">
              Point of Sale, Inventory Management, Customer Tracking, and Financial Reports — all in one place.
            </p>
            <Button
              onClick={() => loginWithRedirect()}
              size="lg"
              className="text-lg px-8 py-6 bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
            >
              Get Started
            </Button>

            {/* Feature pills */}
            <div className="flex flex-wrap justify-center gap-3 mt-10">
              {[
                { icon: ShoppingCart, label: 'Point of Sale' },
                { icon: Package, label: 'Inventory' },
                { icon: BarChart3, label: 'Reports' },
              ].map(f => (
                <div key={f.label} className="flex items-center gap-2 bg-muted px-4 py-2 rounded-full text-sm text-muted-foreground">
                  <f.icon className="w-4 h-4 text-primary" />
                  {f.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="text-center text-xs text-muted-foreground py-4 border-t border-border">
        Uptown Vapes © {new Date().getFullYear()} — Vape | Enjoy | Repeat
      </footer>
    </div>
  );
}
