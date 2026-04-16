import { Response } from 'express';
import { supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';
import { z } from 'zod';

export const tokenizeInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId } = req.body;

    const { data: invoice } = await supabase.from('Invoice').select('*').eq('id', invoiceId).single();
    if (!invoice || invoice.status !== 'PENDING_VERIFICATION') {
      return res.status(400).json({ error: 'Invoice not eligible for tokenization' });
    }
    if (req.user!.role === 'SME' && invoice.smeId !== req.user!.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const contractAddress = '0x' + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const tokenId = Math.floor(Math.random() * 10000).toString();

    const { data: bcRecord } = await supabase.from('BlockchainRecord').insert({
      id: crypto.randomUUID(), invoiceId, contractAddress, tokenId
    }).select('*').single();

    await supabase.from('Invoice').update({ status: 'TOKENIZED' }).eq('id', invoiceId);

    res.status(200).json(bcRecord);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMarketplace = async (req: AuthRequest, res: Response) => {
  try {
    const { data: invoices } = await supabase
      .from('Invoice')
      .select('*, riskScore:RiskScore(*), investments:Investment(*), blockchainRecord:BlockchainRecord(*)')
      .in('status', ['TOKENIZED', 'FUNDED', 'ACCEPTED'])
      .order('createdAt', { ascending: false });

    const formattedInvoices = (invoices || []).map(inv => ({
      ...inv,
      riskScore: Array.isArray(inv.riskScore) ? inv.riskScore[0] : inv.riskScore
    }));

    res.status(200).json(formattedInvoices);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const investSchema = z.object({
  invoiceId: z.string(),
  amount: z.number().positive()
});

export const invest = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = investSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join(', ') });

    const { invoiceId, amount } = parsed.data;
    const investorId = req.user!.userId;

    const { data: invoice } = await supabase
      .from('Invoice')
      .select('*, investments:Investment(*)')
      .eq('id', invoiceId)
      .single();

    if (!invoice || invoice.status !== 'TOKENIZED') {
      return res.status(400).json({ error: 'Invoice not available for investment' });
    }

    const { data: wallet } = await supabase.from('Wallet').select('*').eq('userId', investorId).single();
    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    const totalInvested = (invoice.investments || []).reduce((acc: number, inv: any) => acc + inv.amount, 0);
    const remaining = invoice.amount - totalInvested;
    if (amount > remaining) {
      return res.status(400).json({ error: `Amount exceeds remaining ₹${remaining.toLocaleString()}` });
    }

    const share = amount / invoice.amount;

    await supabase.from('Investment').insert({ id: crypto.randomUUID(), amount, share, investorId, invoiceId });
    await supabase.from('Wallet').update({ balance: wallet.balance - amount }).eq('userId', investorId);
    await supabase.from('Transaction').insert({ id: crypto.randomUUID(), type: 'INVESTMENT', amount: -amount, status: 'COMPLETED', userId: investorId });

    const { data: smeWallet } = await supabase.from('Wallet').select('balance').eq('userId', invoice.smeId).single();
    if (smeWallet) {
      await supabase.from('Wallet').update({ balance: smeWallet.balance + amount }).eq('userId', invoice.smeId);
      await supabase.from('Transaction').insert({ id: crypto.randomUUID(), type: 'SETTLEMENT', amount: amount, status: 'COMPLETED', userId: invoice.smeId });
    }

    if (totalInvested + amount >= invoice.amount) {
      await supabase.from('Invoice').update({ status: 'FUNDED' }).eq('id', invoiceId);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('investment_action', { invoiceId, amount, investorId, timestamp: new Date().toISOString() });
      if (smeWallet) {
        io.emit('wallet_updated', { userId: invoice.smeId, balance: smeWallet.balance + amount });
      }
      if (totalInvested + amount >= invoice.amount) {
        io.emit('invoice_fully_funded', { invoiceId, timestamp: new Date().toISOString() });
      }
    }

    res.status(200).json({ success: true, message: 'Investment successful' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
