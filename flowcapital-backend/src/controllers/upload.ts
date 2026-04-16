import multer from 'multer';
import { Request, Response } from 'express';
import { extractInvoiceData } from '../utils/ocr';
import { supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';
import { RiskEngine } from '../services/RiskEngine';

// ── Multer config: store in memory (no disk writes needed) ───────────────────
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});

/**
 * POST /api/invoices/scan
 * Accepts a file upload, runs OCR, and returns the extracted amount.
 * The frontend pre-fills the amount field; user can correct before submitting.
 */
export const scanInvoice = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { buffer, mimetype, originalname } = req.file;

    console.log(`[Scan] Processing: ${originalname} (${mimetype}, ${(buffer.length / 1024).toFixed(1)} KB)`);

    const { amount: detectedAmount, gstNumber, buyer, date } = await extractInvoiceData(buffer, mimetype, originalname);

    if (detectedAmount === null && buyer === null) {
      return res.status(200).json({
        success: false,
        message: 'Could not detect amount or buyer automatically — please enter it manually.',
        detectedAmount: null,
        buyer: null,
        date: null,
        gstNumber: gstNumber || null
      });
    }

    // Pre-calculate token count (amount / 1000)
    const tokenCount = detectedAmount ? detectedAmount / 1000 : 0;

    return res.status(200).json({
      success: true,
      detectedAmount,
      buyer: buyer || null,
      date: date || null,
      gstNumber: gstNumber || null,
      tokenCount,
      tokenPrice: 1000,
      message: `Detected amount ₹${detectedAmount?.toLocaleString()} → ${tokenCount} tokens at ₹1,000 each`
    });
  } catch (error) {
    console.error('[Scan] Error:', error);
    res.status(500).json({ error: 'Failed to process invoice file' });
  }
};

/**
 * POST /api/invoices/upload
 * Full upload: scans file + creates invoice + emits real-time events.
 * Combines file scanning AND invoice creation in one step.
 */
export const uploadAndCreateInvoice = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { buffer, mimetype, originalname } = req.file;
    const { buyerName, buyerId, dueDate, manualAmount, smeGstNumber } = req.body;

    if (!buyerName || !dueDate) {
      return res.status(400).json({ error: 'buyerName and dueDate are required' });
    }

    if (!smeGstNumber) {
      return res.status(400).json({ error: 'smeGstNumber is required to perform risk verification' });
    }

    const date = new Date(dueDate);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Invalid due date' });
    }

    // ━━━ STRICT DATE VALIDATION: reject past dates ━━━
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
      return res.status(400).json({ error: 'Due date cannot be in the past. Please enter a future date.' });
    }

    // Try OCR first; fall back to manually entered amount
    let amount: number;
    let amountSource: string;

    const { amount: detectedAmount } = await extractInvoiceData(buffer, mimetype, originalname);

    if (detectedAmount && detectedAmount > 0) {
      amount = detectedAmount;
      amountSource = 'ocr';
    } else if (manualAmount && parseFloat(manualAmount) > 0) {
      amount = parseFloat(manualAmount);
      amountSource = 'manual';
    } else {
      return res.status(400).json({ error: 'Could not detect invoice amount. Please enter it manually.' });
    }

    // token_count = amount / 1000
    const tokenCount = amount / 1000;

    if (tokenCount < 1) {
      return res.status(400).json({ error: `Invoice amount ₹${amount} is too small to generate tokens (minimum ₹1,000)` });
    }

    // --- RISK ENGINE EVALUATION ---
    const riskAnalysis = await RiskEngine.evaluate(smeGstNumber, amount);
    
    // Threshold Enforcement
    let finalStatus = 'PENDING_VERIFICATION';
    if (riskAnalysis.score < 50) {
      finalStatus = 'REJECTED'; 
      // Important: Supabase schema InvoiceStatus may not have 'REJECTED' or 'REJECTED_RISK'
      // Wait, is REJECTED in the enum?
      // Let's check prisma enum: PENDING_VERIFICATION, ACCEPTED, TOKENIZED, FUNDED, SETTLED
      // If we don't have REJECTED in status, we can't save it as such without migrating DB.
      // So we will abort saving and return a 400 error outright!
      return res.status(400).json({ 
        error: `Invoice Rejected. Your GST Risk Score is too low (${riskAnalysis.score}/100). Minimum required is 50.`,
        riskScore: riskAnalysis.score,
        reason: riskAnalysis.category 
      });
    }

    const smeId = req.user!.userId;

    // Convert buffer to data URI for simple storage without touching external buckets
    const b64 = buffer.toString('base64');
    const imageUrl = `data:${mimetype};base64,${b64}`;

    // Create invoice in DB — status PENDING_VERIFICATION, tokens pre-populated
    const { data: invoice, error: invoiceError } = await supabase.from('Invoice').insert({
      id: crypto.randomUUID(),
      amount,
      buyerName,
      buyerId: buyerId || null,
      dueDate: date.toISOString(),
      smeId,
      status: finalStatus,
      gstNumber: smeGstNumber || null,
      imageUrl: imageUrl,
      totalTokens: 0,
      availableTokens: 0,
      tokenPrice: 1000.0,
      erpSynced: false,
    }).select('*').single();

    if (invoiceError) {
      console.error('[Upload] DB error:', invoiceError);
      return res.status(500).json({ error: 'Failed to create invoice in database' });
    }

    // Save the structured RiskScore to DB
    const tierMap: Record<string, string> = { 'Low Risk': 'A', 'Medium Risk': 'B', 'High Risk': 'C' };
    const tierCategory = tierMap[riskAnalysis.category] || 'C';

    const { error: riskError } = await supabase.from('RiskScore').insert({
      id: crypto.randomUUID(),
      score: riskAnalysis.score,
      category: tierCategory,
      invoiceId: invoice.id
    });

    if (riskError) {
      console.error('[Upload] Failed to save Risk Score:', riskError);
      // Non-fatal, continue with invoice creation
    }

    // Broadcast to enterprise dashboards immediately
    const io = req.app.get('io');
    if (io) {
      io.emit('invoice_created', {
        id: invoice.id,
        amount: invoice.amount,
        buyerName: invoice.buyerName,
        status: invoice.status,
      });
    }

    return res.status(201).json({
      message: `Invoice created. ${tokenCount} tokens will be generated when corporate accepts.`,
      invoiceId: invoice.id,
      amount: invoice.amount,
      tokenCount,
      riskScore: riskAnalysis.score,
      riskCategory: riskAnalysis.category
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
