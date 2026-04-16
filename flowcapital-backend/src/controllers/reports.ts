import { Response } from 'express';
import { supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';

const toCSV = (headers: string[], rows: any[][]): string => {
  const escape = (val: any) => {
    const str = String(val ?? '');
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [headers.map(escape).join(','), ...rows.map(row => row.map(escape).join(','))].join('\n');
};

export const investorPortfolioReport = async (req: AuthRequest, res: Response) => {
  try {
    const { data: investments } = await supabase
      .from('Investment')
      .select('*, invoice:Invoice(*, riskScore:RiskScore(*))')
      .eq('investorId', req.user!.userId)
      .order('createdAt', { ascending: false });

    const headers = ['Invoice ID', 'Buyer', 'Invoice Amount', 'Amount Invested', 'Share %', 'Status', 'Risk', 'Due Date', 'Purchased At'];
    const rows = (investments || []).map((inv: any) => [
      inv.invoiceId,
      inv.invoice?.buyerName,
      inv.invoice?.amount,
      inv.amount,
      inv.share?.toFixed(2),
      inv.invoice?.status,
      inv.invoice?.riskScore?.category ?? 'N/A',
      inv.invoice?.dueDate ? new Date(inv.invoice.dueDate).toLocaleDateString() : '',
      new Date(inv.createdAt).toLocaleString()
    ]);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="portfolio_report.csv"');
    res.status(200).send(toCSV(headers, rows));
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate report' });
  }
};

export const enterpriseInvoiceReport = async (req: AuthRequest, res: Response) => {
  try {
    const { data: invoices } = await supabase
      .from('Invoice')
      .select('*, riskScore:RiskScore(*), investments:Investment(*)')
      .order('createdAt', { ascending: false });

    const headers = ['Invoice ID', 'Buyer', 'Amount', 'Status', 'Total Tokens', 'Available', 'Token Price', 'Total Invested', 'Risk', 'Due Date', 'Created'];
    const rows = (invoices || []).map((inv: any) => [
      inv.id, inv.buyerName, inv.amount, inv.status,
      inv.totalTokens, inv.availableTokens, inv.tokenPrice,
      (inv.investments || []).reduce((a: number, i: any) => a + i.amount, 0).toFixed(2),
      inv.riskScore?.score ?? 'N/A',
      new Date(inv.dueDate).toLocaleDateString(),
      new Date(inv.createdAt).toLocaleString()
    ]);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="invoices_report.csv"');
    res.status(200).send(toCSV(headers, rows));
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate report' });
  }
};
