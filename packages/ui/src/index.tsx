import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, TableHTMLAttributes } from 'react';
import { forwardRef } from 'react';

export function cn(...values: Array<string | false | null | undefined>) { return values.filter(Boolean).join(' '); }

export function PageShell({ children, eyebrow, title, description, actions }: { children: ReactNode; eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <main className="nm-page"><header className="nm-page-header"><div><p className="nm-eyebrow">{eyebrow ?? 'NovaMart'}</p><h1>{title}</h1>{description && <p className="nm-muted nm-lead">{description}</p>}</div>{actions && <div className="nm-actions">{actions}</div>}</header>{children}</main>;
}

export function Card({ children, className, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) { return <section className={cn('nm-card', className)} {...props}>{children}</section>; }
export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) { return <div className="nm-card-header"><div><h2>{title}</h2>{description && <p className="nm-muted">{description}</p>}</div>{action}</div>; }
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent' }) { return <span className={`nm-badge nm-badge-${tone}`}>{children}</span>; }
export function Button({ children, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) { return <button className={`nm-button nm-button-${variant}`} {...props}>{children}</button>; }
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) { return <input ref={ref} className={cn('nm-input', className)} {...props} />; });
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="nm-empty"><div className="nm-empty-mark">N</div><h3>{title}</h3><p className="nm-muted">{description}</p>{action}</div>; }
export function MetricGrid({ children }: { children: ReactNode }) { return <div className="nm-metric-grid">{children}</div>; }
export function Metric({ label, value, detail, tone = 'accent' }: { label: string; value: string; detail?: string; tone?: 'accent' | 'success' | 'warning' }) { return <Card className={`nm-metric nm-metric-${tone}`}><p className="nm-muted">{label}</p><strong>{value}</strong>{detail && <span className="nm-muted">{detail}</span>}</Card>; }
export function DataTable({ children, ...props }: TableHTMLAttributes<HTMLTableElement>) { return <div className="nm-table-wrap"><table className="nm-table" {...props}>{children}</table></div>; }
export function LoadingRows({ count = 5 }: { count?: number }) { return <div className="nm-loading-list">{Array.from({ length: count }, (_, index) => <div className="nm-skeleton" key={index} />)}</div>; }
