import { Response } from 'express';
import { supabase } from '../utils/supabase';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { RiskEngine } from '../services/RiskEngine';

const invoiceSchema = z.object({
  amount: z.number().positive(),
  buyerName: z.string().min(1),
  buyerId: z.string().optional(),
  dueDate: z.string()
});

export const createInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = invoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join(', ') });
    }
    const { amount, buyerName, buyerId, dueDate } = parsed.data;
    const date = new Date(dueDate);

    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Invalid due date format' });
    }

    // Reject past dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
      return res.status(400).json({ error: 'Due date cannot be in the past. Please enter a future date.' });
    }

    // Validate corporate if buyerId provided
    if (buyerId) {
      const { data: corporate } = await supabase
        .from('User').select('id, role').eq('id', buyerId).single();
      if (!corporate || corporate.role !== 'ENTERPRISE') {
        return res.status(400).json({ error: 'Selected corporate is not a registered Enterprise on FlowCapital.' });
      }
    }

    const smeId = req.user!.userId;

    const { data: invoice, error } = await supabase
      .from('Invoice')
      .insert({
        id: crypto.randomUUID(),
        amount,
        buyerName,
        buyerId: buyerId || null,
        dueDate: date.toISOString(),
        smeId,
        status: 'PENDING_VERIFICATION',
        totalTokens: 0,
        availableTokens: 0,
        tokenPrice: 100.0,
        erpSynced: false,
      })
      .select('*')
      .single();

    if (error) {
      console.error('Invoice create error:', error);
      return res.status(500).json({ error: 'Failed to create invoice' });
    }

    const io = req.app.get('io');
    if (io) io.emit('invoice_created', invoice);

    res.status(201).json(invoice);
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Per-role data isolation
export const getInvoices = async (req: AuthRequest, res: Response) => {
  try {
    const { role, userId } = req.user!;
    let query = supabase.from('Invoice').select('*, riskScore:RiskScore(*), sme:User!Invoice_smeId_fkey(id,email,name,companyName), corporateBuyer:User!Invoice_buyerId_fkey(id,name,companyName,email)');

    if (role === 'SME') {
      query = query.eq('smeId', userId);
    } else if (role === 'ENTERPRISE') {
      query = query.eq('buyerId', userId);
    } else if (role === 'INVESTOR') {
      query = query.in('status', ['ACCEPTED', 'TOKENIZED', 'FUNDED']);
    }
    // ADMIN sees all

    const { data: invoices, error } = await query.order('createdAt', { ascending: false });

    if (error) {
      console.error('Get invoices error:', error);
      return res.status(500).json({ error: 'Failed to fetch invoices' });
    }

    const formatted = (invoices || []).map(inv => ({
      ...inv,
      riskScore: Array.isArray(inv.riskScore) ? inv.riskScore[0] : inv.riskScore,
      blockchainRecord: Array.isArray(inv.blockchainRecord) ? inv.blockchainRecord[0] : inv.blockchainRecord
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getInvoiceById = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const { role, userId } = req.user!;

    const { data: invoice, error } = await supabase
      .from('Invoice')
      .select('*, riskScore:RiskScore(*), blockchainRecord:BlockchainRecord(*), sme:User!Invoice_smeId_fkey(email,name,companyName), corporateBuyer:User!Invoice_buyerId_fkey(name,companyName,email), investments:Investment(*)')
      .eq('id', id)
      .single();

    if (error || !invoice) return res.status(404).json({ error: 'Invoice not found' });

    if (role === 'SME' && invoice.smeId !== userId) return res.status(403).json({ error: 'Forbidden' });
    if (role === 'ENTERPRISE' && invoice.buyerId !== userId) return res.status(403).json({ error: 'Forbidden' });

    res.status(200).json(invoice);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSMEAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { data: invoices } = await supabase
      .from('Invoice')
      .select('*, riskScore:RiskScore(*)')
      .eq('smeId', userId);

    if (!invoices) return res.status(200).json({ trendData: [], totalVolume: 0, avgRisk: 0 });

    const monthlyMap: Record<string, { funded: number; pending: number }> = {};
    invoices.forEach(inv => {
      const month = new Date(inv.createdAt).toLocaleString('en-US', { month: 'short' });
      if (!monthlyMap[month]) monthlyMap[month] = { funded: 0, pending: 0 };
      if (['FUNDED', 'SETTLED', 'ACCEPTED'].includes(inv.status)) {
        monthlyMap[month].funded += inv.amount;
      } else {
        monthlyMap[month].pending += inv.amount;
      }
    });

    const trendData = Object.entries(monthlyMap).map(([month, data]) => ({ month, ...data }));
    
    // Normalize riskScore because postgrest defaults it to an array
    const normalizedInvoices = invoices.map(i => ({
      ...i,
      riskScore: Array.isArray(i.riskScore) ? i.riskScore[0] : i.riskScore
    }));
    
    const withRisk = normalizedInvoices.filter((i: any) => i.riskScore);

    res.status(200).json({
      trendData,
      totalVolume: normalizedInvoices.reduce((acc: number, inv: any) => acc + inv.amount, 0),
      avgRisk: withRisk.length > 0 ? withRisk.reduce((acc: number, i: any) => acc + i.riskScore.score, 0) / withRisk.length : 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

export const tokenizeInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const { userId } = req.user!;

    const { data: invoice } = await supabase.from('Invoice').select('*').eq('id', id).single();
    if (!invoice || invoice.buyerId !== userId) {
      return res.status(404).json({ error: 'Invoice not found or unauthorized' });
    }
    if (!invoice.buyerId) {
      return res.status(400).json({ error: 'Cannot tokenize: the corporate buyer must be an onboarded FlowCapital Enterprise.' });
    }
    if (invoice.status !== 'ACCEPTED') {
      return res.status(400).json({ error: 'Invoice must be ACCEPTED by the corporate before tokenization.' });
    }

    const tokenCount = invoice.amount / 1000;

    const { data: updated } = await supabase
      .from('Invoice')
      .update({ status: 'TOKENIZED', totalTokens: tokenCount, availableTokens: tokenCount })
      .eq('id', id)
      .select('*')
      .single();

    await supabase.from('BlockchainRecord').insert({
      id: crypto.randomUUID(),
      invoiceId: id,
      contractAddress: `0x${Math.random().toString(16).substring(2, 42)}`,
      tokenId: Math.floor(Math.random() * 1000000).toString()
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('tokens_created', { invoice: updated, totalTokens: tokenCount, tokenPrice: 100.0, availableTokens: tokenCount });
    }

    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const { userId, role } = req.user!;

    const { data: invoice } = await supabase.from('Invoice').select('smeId').eq('id', id).single();
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (role !== 'ADMIN' && invoice.smeId !== userId) return res.status(403).json({ error: 'Forbidden' });

    await supabase.from('RiskScore').delete().eq('invoiceId', id);
    await supabase.from('BlockchainRecord').delete().eq('invoiceId', id);
    await supabase.from('Investment').delete().eq('invoiceId', id);
    await supabase.from('Invoice').delete().eq('id', id);

    const io = req.app.get('io');
    if (io) io.emit('invoice_deleted', { id });

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const acceptInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const { userId } = req.user!;

    const { data: invoice } = await supabase.from('Invoice').select('*').eq('id', id).single();
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status !== 'PENDING_VERIFICATION') return res.status(400).json({ error: 'Invoice has already been processed.' });
    if (invoice.buyerId && invoice.buyerId !== userId) return res.status(403).json({ error: 'You are not the designated buyer for this invoice.' });

    const tokenCount = invoice.amount / 1000;

    const { data: updated } = await supabase
      .from('Invoice')
      .update({ status: 'ACCEPTED', acceptedById: userId, totalTokens: tokenCount, availableTokens: tokenCount, tokenPrice: 1000.0 })
      .eq('id', id)
      .select('*')
      .single();

    // --- Compute and persist Risk Score if not already present ---
    const { data: existingRisk } = await supabase.from('RiskScore').select('id').eq('invoiceId', id).single();
    if (!existingRisk) {
      // Fetch SME's GSTIN from their profile
      const { data: sme } = await supabase.from('User').select('gstNumber').eq('id', invoice.smeId).single();
      const gstin = sme?.gstNumber || '27AAPFU0939F1ZV'; // fallback for validation
      
      const riskAnalysis = await RiskEngine.evaluate(gstin, invoice.amount);
      
      // Map verbose category to A/B/C tier letter used by the marketplace UI
      const tierMap: Record<string, string> = {
        'Low Risk': 'A',
        'Medium Risk': 'B',
        'High Risk': 'C'
      };
      const tierCategory = tierMap[riskAnalysis.category] || 'C';

      await supabase.from('RiskScore').insert({
        id: crypto.randomUUID(),
        score: riskAnalysis.score,
        category: tierCategory,
        invoiceId: id
      });
      
      console.log(`[AcceptInvoice] Risk evaluated: ${gstin} → score=${riskAnalysis.score}, tier=${tierCategory}`);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('invoice_accepted', updated);
      io.emit('tokens_created', { invoice: updated, totalTokens: tokenCount, tokenPrice: 1000.0, availableTokens: tokenCount });
    }

    res.status(200).json(updated);
  } catch (error) {
    console.error('Accept error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const declineInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const { userId } = req.user!;

    const { data: invoice } = await supabase.from('Invoice').select('status').eq('id', id).single();
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status !== 'PENDING_VERIFICATION') return res.status(400).json({ error: 'Invoice is no longer pending.' });

    const io = req.app.get('io');
    if (io) io.emit('invoice_declined', { invoiceId: id, declinedBy: userId });

    res.status(200).json({ success: true, message: 'Invoice declined.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ── Admin: fetch all invoices pending GST / image verification ──────────────
export const getAdminPendingInvoices = async (req: AuthRequest, res: Response) => {
  try {
    const { data: invoices, error: fetchErr } = await supabase
      .from('Invoice')
      .select('*, owner:User!Invoice_smeId_fkey(id, email, name, companyName), riskScore:RiskScore(*)')
      .in('status', ['PENDING_VERIFICATION'])
      .order('createdAt', { ascending: false });

    if (fetchErr) {
      console.error("Supabase Error:", fetchErr);
      return res.status(500).json({ error: fetchErr.message });
    }

    res.status(200).json(invoices || []);
  } catch (error) {
    console.error("Fetch pending invoices error:", error);
    res.status(500).json({ error: 'Failed to fetch pending invoices' });
  }
};

// ── Admin: approve or reject an invoice after GST verification ──────────────
export const adminVerifyInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId, action, reason } = req.body; // action: 'APPROVE' | 'REJECT'
    if (!invoiceId || !action) return res.status(400).json({ error: 'invoiceId and action are required' });

    const { data: invoice } = await supabase
      .from('Invoice')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    if (action === 'REJECT') {
      await supabase.from('Invoice').update({ status: 'DECLINED' }).eq('id', invoiceId);
      
      const io = req.app.get('io');
      if (io) io.emit('invoice_rejected', { invoiceId, status: 'DECLINED' });

      return res.status(200).json({ success: true, message: 'Invoice rejected and SME notified.' });
    }

    // Approve → run risk engine and move to TOKENIZED so it appears on marketplace
    const risk = await RiskEngine.evaluate(invoice.gstNumber || 'MANUAL', invoice.amount);
    const category = risk.score >= 70 ? 'A' : risk.score >= 45 ? 'B' : 'C';

    const { data: existingRisk } = await supabase.from('RiskScore').select('id').eq('invoiceId', invoiceId).single();
    if (existingRisk) {
      await supabase.from('RiskScore').update({ score: risk.score, category }).eq('invoiceId', invoiceId);
    } else {
      await supabase.from('RiskScore').insert({ id: crypto.randomUUID(), invoiceId, score: risk.score, category });
    }

    // Admin merely approves it. The corporate handles tokenization later.
    await supabase.from('Invoice').update({
      status: 'ACCEPTED'
    }).eq('id', invoiceId);

    const io = req.app.get('io');
    if (io) io.emit('invoice_accepted', { invoiceId, status: 'ACCEPTED' });

    res.status(200).json({ success: true, message: `Invoice approved as ACCEPTED. Awaiting corporate tokenization.` });
  } catch (error) {
    console.error('Admin verify invoice error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

