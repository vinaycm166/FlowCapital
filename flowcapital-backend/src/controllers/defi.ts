import { Response } from 'express';
import { supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';

export const depositLiquidity = async (req: AuthRequest, res: Response) => {
  try {
    const { amount, poolName } = req.body;
    if (!amount || !poolName) return res.status(400).json({ error: 'Missing pool or amount' });

    const userId = req.user!.userId;

    const { data: wallet } = await supabase.from('Wallet').select('*').eq('userId', userId).single();
    if (!wallet || wallet.balance < amount) return res.status(400).json({ error: 'Insufficient funds' });

    // Upsert pool
    const { data: existingPool } = await supabase.from('LiquidityPool').select('*').eq('poolName', poolName).single();
    let pool;
    if (existingPool) {
      const { data: updated } = await supabase
        .from('LiquidityPool')
        .update({ totalBalance: existingPool.totalBalance + amount })
        .eq('poolName', poolName)
        .select('*').single();
      pool = updated;
    } else {
      const { data: created } = await supabase
        .from('LiquidityPool')
        .insert({ id: crypto.randomUUID(), poolName, totalBalance: amount, apyTarget: 10.5 })
        .select('*').single();
      pool = created;
    }

    await supabase.from('Wallet').update({ balance: wallet.balance - amount }).eq('userId', userId);

    const io = req.app.get('io');
    io?.emit('liquidity_deposited', { poolName, amount, userId, totalBalance: pool?.totalBalance });

    res.status(200).json({ success: true, message: `Deposited ₹${amount} into ${poolName}`, pool });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPools = async (req: AuthRequest, res: Response) => {
  try {
    const { data: pools } = await supabase.from('LiquidityPool').select('*');
    res.status(200).json({ pools: pools || [] });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
