/** Older sales used cash / mpesa / card / bank values; anything not cash or M-Pesa counts as Platform Pay. */
export const isCashPayment = (m?: string) => /cash|m-?pesa/i.test(m || '');
export const paymentLabel = (m?: string) => (m ? (isCashPayment(m) ? 'Cash/M-PESA' : 'Platform Pay') : '-');
