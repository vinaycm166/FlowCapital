import { Response } from 'express';
import { supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';

export const getAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const { role, userId } = req.user!;

    if (role === 'SME') {
      const { data: invoices } = await supabase
        .from('Invoice').select('id, amount, status').eq('smeId', userId);

      const total = (invoices || []).reduce((a: number, i: any) => a + i.amount, 0);
      const statusCounts = (invoices || []).reduce((acc: any, i: any) => {
        acc[i.status] = (acc[i.status] || 0) + 1; return acc;
      }, {});

      return res.status(200).json({
        stats: { _sum: { amount: total }, _count: { id: (invoices || []).length } },
        statusCounts: Object.entries(statusCounts).map(([status, count]) => ({ status, _count: { id: count } }))
      });
    }

    if (role === 'INVESTOR') {
      const { data: investments } = await supabase
        .from('Investment').select('amount').eq('investorId', userId);
      const totalInvested = (investments || []).reduce((a: number, i: any) => a + i.amount, 0);
      return res.status(200).json({ totalInvested, investmentsCount: (investments || []).length });
    }

    res.status(200).json({ message: 'Admin analytics' });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getBlockchainLogs = async (req: AuthRequest, res: Response) => {
  try {
    const { data: records } = await supabase
      .from('BlockchainRecord')
      .select('*, invoice:Invoice(amount, status)')
      .order('createdAt', { ascending: false })
      .limit(50);
    res.status(200).json(records || []);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
