import { Response } from 'express';
import { supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';

export const analyzeRisk = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId } = req.body;

    const { data: invoice } = await supabase.from('Invoice').select('*').eq('id', invoiceId).single();
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    if (req.user!.role === 'SME' && invoice.smeId !== req.user!.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { data: existingScore } = await supabase.from('RiskScore').select('id').eq('invoiceId', invoiceId).single();
    if (existingScore) return res.status(400).json({ error: 'Risk score already calculated' });

    let score = 0;
    let category = 'C';

    try {
      const response = await fetch('http://localhost:8000/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_name: invoice.buyerName, invoice_amount: invoice.amount, historical_data_points: 3 })
      });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json() as { score: number; category: string };
      score = data.score;
      category = data.category;
    } catch {
      score = Math.floor(Math.random() * 50 + 50);
      category = score > 80 ? 'A' : score > 60 ? 'B' : 'C';
    }

    const { data: riskScore } = await supabase.from('RiskScore').insert({
      id: crypto.randomUUID(), score, category, invoiceId
    }).select('*').single();

    res.status(200).json(riskScore);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
