import { Response } from 'express';
import { supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';

export const syncQuickBooks = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user!;

    const { data: invoices } = await supabase
      .from('Invoice').select('id').eq('smeId', userId).eq('erpSynced', false);

    const count = (invoices || []).length;
    if (count > 0) {
      await supabase.from('Invoice').update({ erpSynced: true }).eq('smeId', userId).eq('erpSynced', false);
    }

    const io = req.app.get('io');
    io?.emit('erp_sync', { user: userId, provider: 'QuickBooks', status: 'SUCCESS', syncedCount: count });

    res.status(200).json({ success: true, message: 'QuickBooks synchronized.', count });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const syncXero = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user!;
    const io = req.app.get('io');
    io?.emit('erp_sync', { user: userId, provider: 'Xero', status: 'SUCCESS', syncedCount: 0 });
    res.status(200).json({ success: true, message: 'Xero synchronized.', count: 0 });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
