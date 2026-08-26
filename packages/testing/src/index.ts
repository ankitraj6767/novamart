export const testUser = { id: '00000000-0000-0000-0000-000000000001', email: 'test@example.novamart.in' } as const;
export const testMoney = (paise: number) => ({ paise, currency: 'INR' as const, display: `₹${(paise / 100).toFixed(2)}` });
