export type Role = 'owner' | 'manager' | 'cashier' | 'waiter' | 'kitchen';
export type PaymentMethod = 'cash' | 'card' | 'digital';
export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  passwordHash?: string;
}
export interface Settings {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  cutoff: string;
  footer: string;
  address: string;
  tables: { id: string; name: string; seats: number }[];
  registers: { id: string; name: string }[];
  lastBackup?: string;
  backupError?: string;
  logoVersion?: string;
}
export interface Stock {
  id: string;
  name: string;
  unit: string;
  active: boolean;
}
export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  available: boolean;
  kind: 'item' | 'deal';
  description: string;
  icon: string;
  imageVersion?: string;
  stockId?: string;
  variants: { id: string; name: string; price: number }[];
  addons: { id: string; name: string; price: number }[];
  components: { itemId: string; quantity: number }[];
}
export interface Component {
  itemId: string;
  name: string;
  quantity: number;
  stockId?: string;
  unitPrice?: number;
}
export interface Line {
  id: string;
  itemId: string;
  name: string;
  kind: 'item' | 'deal';
  quantity: number;
  price: number;
  note: string;
  addons: string[];
  components: Component[];
  stockId?: string;
  cancelled: boolean;
}
export interface Round {
  id: string;
  createdAt: string;
  status: 'queued' | 'preparing' | 'ready' | 'served';
  lines: Line[];
  cancellations: {
    lineId: string;
    name: string;
    reason: string;
    at: string;
    acknowledged: boolean;
  }[];
}
export interface Order {
  id: string;
  number: number;
  type: 'dine-in' | 'takeaway';
  tableId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  version: number;
  status: 'open' | 'completed' | 'void';
  paymentStatus: 'unpaid' | 'paid' | 'refunded';
  rounds: Round[];
  discount: number;
  discountReason?: string;
  payment?: {
    amount: number;
    method: PaymentMethod;
    tendered: number;
    change: number;
    at: string;
    userId: string;
    sessionId?: string;
    receipt: { name: string; address: string; footer: string; currency: string };
  };
  refund?: { at: string; reason: string; userId: string; sessionId?: string };
}
export interface StockMovement {
  id: string;
  stockId: string;
  quantity: number;
  source: string;
  reason: string;
  at: string;
  userId: string;
}
export interface CashSession {
  id: string;
  registerId: string;
  cashierId: string;
  openedAt: string;
  closedAt?: string;
  opening: number;
  counted?: number;
  expected?: number;
  variance?: number;
}
export interface CashMovement {
  id: string;
  sessionId: string;
  amount: number;
  source: string;
  reason: string;
  at: string;
  userId: string;
}
export interface Supplier {
  id: string;
  name: string;
  phone: string;
}
export interface Purchase {
  id: string;
  supplierId: string;
  at: string;
  date: string;
  reference: string;
  userId: string;
  lines: { stockId: string; name: string; quantity: number; cost: number }[];
  total: number;
  reversedAt?: string;
  reversalReason?: string;
}
export interface SupplierPayment {
  id: string;
  purchaseId: string;
  amount: number;
  method: PaymentMethod;
  at: string;
  userId: string;
  sessionId?: string;
  reversedAt?: string;
}
export interface Expense {
  id: string;
  category: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  note: string;
  at: string;
  userId: string;
  sessionId?: string;
  reversedAt?: string;
  reversalReason?: string;
}
export interface Audit {
  id: string;
  at: string;
  userId: string;
  action: string;
  targetId?: string;
  reason?: string;
  approverId?: string;
}
export interface State {
  settings: Settings[];
  users: User[];
  menu: MenuItem[];
  stock: Stock[];
  orders: Order[];
  stockMovements: StockMovement[];
  cashSessions: CashSession[];
  cashMovements: CashMovement[];
  suppliers: Supplier[];
  purchases: Purchase[];
  supplierPayments: SupplierPayment[];
  expenses: Expense[];
  audit: Audit[];
}
export const collections = [
  'settings',
  'users',
  'menu',
  'stock',
  'orders',
  'stockMovements',
  'cashSessions',
  'cashMovements',
  'suppliers',
  'purchases',
  'supplierPayments',
  'expenses',
  'audit',
] as const;
export const emptyState = (): State =>
  Object.fromEntries(collections.map((k) => [k, []])) as unknown as State;
export const subtotal = (o: Order) =>
  o.rounds
    .flatMap((r) => r.lines)
    .filter((l) => !l.cancelled)
    .reduce((s, l) => s + l.price * l.quantity, 0);
export const total = (o: Order) => Math.max(0, subtotal(o) - o.discount);
export const balance = (s: State, stockId: string) =>
  s.stockMovements.filter((m) => m.stockId === stockId).reduce((a, m) => a + m.quantity, 0);
export const expectedCash = (s: State, session: CashSession) =>
  session.opening +
  s.cashMovements.filter((m) => m.sessionId === session.id).reduce((a, m) => a + m.amount, 0);
export const managerRoles: Role[] = ['owner', 'manager'];
