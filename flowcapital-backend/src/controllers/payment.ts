import { Response } from 'express';
import { supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';
import Razorpay from 'razorpay';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_123',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'secret'
});

export const createRazorpayOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const options = {
      amount: amount * 100, // Razorpay expects paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);
    res.status(200).json(order);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create razorpay order' });
  }
};

export const invest = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId, tokensToBuy } = req.body;
    const userId = req.user!.userId;

    if (!tokensToBuy || tokensToBuy <= 0) {
      return res.status(400).json({ error: 'Invalid token amount' });
    }

    // Pre-flight 24hr Pledge Engine Check
    const { data: user } = await supabase.from('User').select('paymentBlockedUntil').eq('id', userId).single();
    if (user?.paymentBlockedUntil && new Date(user.paymentBlockedUntil) > new Date()) {
      return res.status(403).json({ error: `Currently suspended from routing liquidity until ${new Date(user.paymentBlockedUntil).toLocaleString()} due to an unfulfilled offline pledge.` });
    }

    // Sweep for 24-hr violations dynamically
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: violations } = await supabase.from('Transaction')
      .select('id')
      .eq('userId', userId)
      .eq('status', 'PENDING_PROOF_UPLOAD')
      .lt('createdAt', yesterday);

    if (violations && violations.length > 0) {
      const blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('User').update({ paymentBlockedUntil: blockedUntil }).eq('id', userId);
      await supabase.from('Transaction').update({ status: 'FAILED_EXPIRED' }).in('id', violations.map(v => v.id));
      return res.status(403).json({ error: 'System suspended: 24-hour liquidity block active due to lapsed NEFT pledge obligations.' });
    }

    const { data: invoice } = await supabase.from('Invoice').select('*').eq('id', invoiceId).single();
    if (!invoice || !['ACCEPTED', 'TOKENIZED'].includes(invoice.status)) {
      return res.status(400).json({ error: 'Invoice not available for investment' });
    }

    const requiredAmount = tokensToBuy * invoice.tokenPrice;

    const { data: wallet } = await supabase.from('Wallet').select('*').eq('userId', userId).single();
    if (!wallet || wallet.balance < requiredAmount) {
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    if (invoice.availableTokens < tokensToBuy) {
      return res.status(400).json({ error: 'Not enough tokens remaining' });
    }

    // Create investment
    const { data: investment } = await supabase.from('Investment').insert({
      id: crypto.randomUUID(),
      amount: requiredAmount,
      share: (tokensToBuy / invoice.totalTokens) * 100,
      investorId: userId,
      invoiceId,
    }).select('*').single();

    // Deduct wallet
    await supabase.from('Wallet').update({ balance: wallet.balance - requiredAmount }).eq('userId', userId);

    // Log transaction
    await supabase.from('Transaction').insert({
      id: crypto.randomUUID(),
      type: 'INVESTMENT',
      amount: requiredAmount,
      status: 'COMPLETED',
      userId,
    });

    // Update token availability
    const newAvailable = invoice.availableTokens - tokensToBuy;
    const { data: updatedInvoice } = await supabase
      .from('Invoice')
      .update({ availableTokens: newAvailable, status: newAvailable === 0 ? 'FUNDED' : invoice.status })
      .eq('id', invoiceId)
      .select('*')
      .single();

    const io = req.app.get('io');
    if (io) {
      io.emit('tokens_purchased', { invoiceId, tokensBought: tokensToBuy, updatedInvoice, buyerId: userId });
      io.emit('payment_success', { investorId: userId, invoiceId, tokensBought: tokensToBuy, amountPaid: requiredAmount, investment });
      if (updatedInvoice?.status === 'FUNDED') {
        io.emit('invoice_fully_funded', { invoiceId, invoice: updatedInvoice });
      }
    }

    res.status(201).json({ success: true, investment, updatedInvoice });
  } catch (error) {
    console.error('Investment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const settleInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId } = req.body;

    const { data: invoice } = await supabase
      .from('Invoice')
      .select('*, investments:Investment(*)')
      .eq('id', invoiceId)
      .single();

    if (!invoice || invoice.status !== 'FUNDED') {
      return res.status(400).json({ error: 'Invoice not ready for settlement' });
    }

    await supabase.from('Invoice').update({ status: 'SETTLED' }).eq('id', invoiceId);

    const roiMultiplier = 1.10;
    for (const investment of (invoice.investments || [])) {
      const returnAmount = investment.amount * roiMultiplier;
      const { data: iWallet } = await supabase.from('Wallet').select('balance').eq('userId', investment.investorId).single();
      if (iWallet) {
        await supabase.from('Wallet').update({ balance: iWallet.balance + returnAmount }).eq('userId', investment.investorId);
      }
      await supabase.from('Transaction').insert({ id: crypto.randomUUID(), type: 'SETTLEMENT', amount: returnAmount, status: 'COMPLETED', userId: investment.investorId });
    }

    const io = req.app.get('io');
    if (io) io.emit('invoice_settled', { invoiceId });

    res.status(200).json({ success: true, message: 'Invoice settled successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getInvestments = async (req: AuthRequest, res: Response) => {
  try {
    const { data: investments } = await supabase
      .from('Investment')
      .select('*, invoice:Invoice(*, riskScore:RiskScore(*))')
      .eq('investorId', req.user!.userId)
      .order('createdAt', { ascending: false });
    res.status(200).json(investments || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch investments' });
  }
};

export const depositFunds = async (req: AuthRequest, res: Response) => {
  try {
    const { amount, utrNumber, proofUrl, method } = req.body;
    const userId = req.user!.userId;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    // Pre-flight 24hr Pledge Engine Check
    const { data: user } = await supabase.from('User').select('paymentBlockedUntil').eq('id', userId).single();
    if (user?.paymentBlockedUntil && new Date(user.paymentBlockedUntil) > new Date()) {
      return res.status(403).json({ error: `Currently suspended from routing liquidity until ${new Date(user.paymentBlockedUntil).toLocaleString()} due to an unfulfilled offline pledge.` });
    }

    // Sweep for 24-hr violations dynamically
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: violations } = await supabase.from('Transaction')
      .select('id')
      .eq('userId', userId)
      .eq('status', 'PENDING_PROOF_UPLOAD')
      .lt('createdAt', yesterday);

    if (violations && violations.length > 0) {
      const blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('User').update({ paymentBlockedUntil: blockedUntil }).eq('id', userId);
      await supabase.from('Transaction').update({ status: 'FAILED_EXPIRED' }).in('id', violations.map(v => v.id));
      return res.status(403).json({ error: 'System suspended: 24-hour liquidity block active due to lapsed NEFT pledge obligations.' });
    }

    // NEFT / Escrow Track: any NEFT pledge or high-value deposit
    const isNeftPledge = req.body.pendingProof === true || req.body.method === 'NEFT' || req.body.method === 'RTGS';
    if (isNeftPledge || amount > 100000) {
      const isPendingUpload = isNeftPledge || !utrNumber || !proofUrl;
      const status = isPendingUpload ? 'PENDING_PROOF_UPLOAD' : 'PENDING_VERIFICATION';

      const txId = crypto.randomUUID();
      await supabase.from('Transaction').insert({ 
        id: txId, 
        type: 'DEPOSIT', 
        amount, 
        status, 
        userId,
        utrNumber: utrNumber || null,
        proofUrl: proofUrl || null,
        method: method || 'NEFT'
      });

      return res.status(202).json({ 
        success: true, 
        transactionId: txId,
        message: isPendingUpload 
          ? 'NEFT pledge registered. Upload proof within 24 hours to avoid account suspension.' 
          : 'Wire transfer flagged for admin verification.',
        status
      });
    }

    // Fast Track: Simulated Razorpay UPI Checkout
    const { data: wallet } = await supabase.from('Wallet').select('balance').eq('userId', userId).single();
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

    const newBalance = wallet.balance + amount;
    const { data: updatedWallet } = await supabase.from('Wallet').update({ balance: newBalance }).eq('userId', userId).select('balance').single();

    await supabase.from('Transaction').insert({ 
      id: crypto.randomUUID(), 
      type: 'DEPOSIT', 
      amount, 
      status: 'COMPLETED', 
      userId,
      method: 'UPI'
    });

    const io = req.app.get('io');
    if (io) io.emit('wallet_updated', { userId, balance: updatedWallet?.balance });

    res.status(200).json({ success: true, balance: updatedWallet?.balance, status: 'COMPLETED' });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ error: 'Deposit failed', details: (error as any).message });
  }
};

export const getPendingDeposits = async (req: AuthRequest, res: Response) => {
  try {
    const { data: deposits } = await supabase
      .from('Transaction')
      .select('*, user:User(id, email, name)')
      .eq('type', 'DEPOSIT')
      .in('status', ['PENDING_VERIFICATION', 'PENDING_PROOF_UPLOAD'])
      .order('createdAt', { ascending: false });

    res.status(200).json(deposits || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending deposits' });
  }
};

export const adminVerifyDeposit = async (req: AuthRequest, res: Response) => {
  try {
    const { transactionId, action } = req.body;

    const { data: tx } = await supabase.from('Transaction').select('*').eq('id', transactionId).single();
    if (!tx || tx.type !== 'DEPOSIT' || !['PENDING_VERIFICATION', 'PENDING_PROOF_UPLOAD'].includes(tx.status)) {
      return res.status(400).json({ error: 'Transaction not awaiting verification' });
    }

    if (action === 'REJECT') {
      await supabase.from('Transaction').update({ status: 'REJECTED' }).eq('id', transactionId);
      return res.status(200).json({ success: true, message: 'Deposit rejected' });
    }

    // Approve: credit wallet
    const { data: wallet } = await supabase.from('Wallet').select('balance').eq('userId', tx.userId).single();
    if (wallet) {
      await supabase.from('Wallet').update({ balance: wallet.balance + tx.amount }).eq('userId', tx.userId);
    }
    await supabase.from('Transaction').update({ status: 'COMPLETED' }).eq('id', transactionId);
    // Clear any block that may have been applied
    await supabase.from('User').update({ paymentBlockedUntil: null }).eq('id', tx.userId);

    const io = req.app.get('io');
    if (io && wallet) io.emit('wallet_updated', { userId: tx.userId, balance: wallet.balance + tx.amount });

    res.status(200).json({ success: true, message: `Deposit of ₹${tx.amount} disbursed successfully.` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify deposit' });
  }
};

export const withdrawFunds = async (req: AuthRequest, res: Response) => {
  try {
    const { amount } = req.body;
    const userId = req.user!.userId;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const { data: wallet } = await supabase.from('Wallet').select('balance').eq('userId', userId).single();
    if (!wallet || wallet.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

    const { data: updatedWallet } = await supabase.from('Wallet').update({ balance: wallet.balance - amount }).eq('userId', userId).select('balance').single();

    await supabase.from('Transaction').insert({ id: crypto.randomUUID(), type: 'WITHDRAWAL', amount, status: 'COMPLETED', userId });

    res.status(200).json({ success: true, balance: updatedWallet?.balance });
  } catch (error) {
    res.status(500).json({ error: 'Withdrawal failed' });
  }
};

export const getTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { data: transactions } = await supabase
      .from('Transaction')
      .select('*')
      .eq('userId', userId)
      .order('createdAt', { ascending: false })
      .limit(20);
    res.status(200).json(transactions || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

export const uploadProof = async (req: AuthRequest, res: Response) => {
  try {
    const { transactionId, utrNumber, proofUrl } = req.body;
    const userId = req.user!.userId;
    
    if (!transactionId || !utrNumber || !proofUrl) {
      return res.status(400).json({ error: 'Transaction ID, UTR Number, and Proof URL are strictly required.' });
    }

    const { data: transaction } = await supabase.from('Transaction').select('*').eq('id', transactionId).eq('userId', userId).single();
    if (!transaction || transaction.status !== 'PENDING_PROOF_UPLOAD') {
      return res.status(404).json({ error: 'Valid unfulfilled pledge not found.' });
    }

    await supabase.from('Transaction').update({
      utrNumber,
      proofUrl,
      status: 'PENDING_VERIFICATION' // Hands it over to enterprise admin
    }).eq('id', transactionId);

    // Because this uploads proof, the user fulfilled their end, but what if they were blocked?
    // Let's clear their block IMMEDIATELY if they uploaded proof for all pending.
    await supabase.from('User').update({ paymentBlockedUntil: null }).eq('id', userId);

    res.status(200).json({ success: true, message: 'NEFT evidence appended. Verification en route via admin queue.' });
  } catch (error) {
    console.error('Upload proof error:', error);
    res.status(500).json({ error: 'Internal pipeline fault during proof attachment.', details: (error as any).message });
  }
};
