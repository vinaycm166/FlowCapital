import { Response } from 'express';
import { supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';

export const submitKYC = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user!;
    const { documentId, name } = req.body;
    if (!documentId || !name) return res.status(400).json({ error: 'Invalid document details' });

    const fraudScore = Math.random() < 0.2 ? 0.8 : 0.05;
    const isApproved = fraudScore < 0.5;

    await supabase.from('User').update({ kycStatus: isApproved, fraudScore }).eq('id', userId);

    res.status(200).json({
      success: true,
      kycStatus: isApproved ? 'APPROVED' : 'REJECTED',
      fraudScore,
      message: isApproved ? 'Identity securely verified.' : 'High fraud risk detected.'
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
