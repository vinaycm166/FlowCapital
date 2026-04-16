import Tesseract from 'tesseract.js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;


/**
 * Extract the largest monetary amount from invoice text.
 * Looks for patterns like: $1,234.56 | ₹12,345 | 1234.00 | Total: 50000
 */
export function extractAmountFromText(text: string): number | null {
  const normalised = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');

  // Priority 1: Look for labelled totals (Total / Grand Total / Amount Due / Invoice Total)
  const labelPatterns = [
    /(?:grand\s*total|invoice\s*total|amount\s*due|total\s*amount|net\s*payable|balance\s*due|total)[^\d$₹€£]*(?:[$₹€£]?\s*)([\d,]+(?:\.\d{1,2})?)/gi,
    /(?:total)[^\d$₹€£\n]*(?:[$₹€£]?\s*)([\d,]+(?:\.\d{1,2})?)/gi,
  ];

  for (const pattern of labelPatterns) {
    const matches = [...normalised.matchAll(pattern)];
    if (matches.length > 0) {
      // Take the last match (usually the grand total at the bottom)
      const raw = matches[matches.length - 1][1].replace(/,/g, '');
      const parsed = parseFloat(raw);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }

  // Priority 2: Extract ALL currency-formatted numbers and return the largest
  const allAmounts = normalised.matchAll(/(?:[$₹€£]\s*)?([\d]{1,3}(?:,[\d]{3})*(?:\.\d{1,2})?|\d{4,}(?:\.\d{1,2})?)/g);
  const numbers: number[] = [];

  for (const match of allAmounts) {
    const raw = match[1].replace(/,/g, '');
    const val = parseFloat(raw);
    // Skip obvious non-amounts: years, phone numbers, zip codes, etc.
    if (!isNaN(val) && val >= 100 && val <= 100_000_000) {
      numbers.push(val);
    }
  }

  if (numbers.length === 0) return null;
  return Math.max(...numbers); // Use the largest number as invoice total
}

/**
 * Extract a standard 15-character Indian GSTIN from text
 */
export function extractGSTINFromText(text: string): string | null {
  // Regex for GSTIN: 2 state digits, 10 PAN characters, 1 entity code, Z, 1 checksum
  const gstRegex = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Zz][0-9A-Z]{1})\b/g;
  const matches = [...text.matchAll(gstRegex)];
  if (matches.length > 0) {
    return matches[0][1].toUpperCase();
  }
  return null;
}

import sharp from 'sharp';

/**
 * Run OCR on an image buffer (WEBP / JPEG / PNG)
 */
export async function extractDataFromImage(buffer: Buffer): Promise<{ amount: number | null, gstNumber: string | null, buyer: string | null, date: string | null }> {
  try {
    // Convert WebP/JPEG to crisp grayscale PNG for Tesseract.js compatibility and better accuracy
    const processedBuffer = await sharp(buffer)
      .grayscale()
      .normalize()
      .png()
      .toBuffer();

    const { data: { text } } = await Tesseract.recognize(processedBuffer, 'eng', {
      logger: () => {} // suppress progress logs
    });
    console.log('[OCR] Extracted text from processed image:', text.substring(0, 300));
    return {
      amount: extractAmountFromText(text),
      gstNumber: extractGSTINFromText(text),
      buyer: extractBuyerFromText(text),
      date: extractDateFromText(text)
    };
  } catch (error) {
    console.error('[OCR] Image extraction or preprocessing failed:', error);
    return { amount: null, gstNumber: null, buyer: null, date: null };
  }
}

/**
 * Extract an assumed Counterparty / Buyer name from text.
 */
export function extractBuyerFromText(text: string): string | null {
  const normalised = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  const buyerMatch = normalised.match(/Buyer:\s*([\w\s]+?)(?:Amount|Date|GST|Invoice|$)/i) 
    || normalised.match(/To:\s*([\w\s]+?)(?:Amount|Date|GST|Invoice|$)/i) 
    || normalised.match(/Counterparty:\s*([\w\s]+?)(?:Amount|Date|GST|Invoice|$)/i);
  
  if (buyerMatch && buyerMatch[1]) {
     const clean = buyerMatch[1].trim();
     if (clean.length > 2 && clean.length < 50) return clean;
  }
  return null;
}

/**
 * Extract an assumed Due Date or Issue Date from text.
 */
export function extractDateFromText(text: string): string | null {
  const normalised = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  const dateMatch = normalised.match(/\d{4}-\d{2}-\d{2}/) || normalised.match(/\d{2}\/\d{2}\/\d{4}/);
  if (dateMatch) return new Date(dateMatch[0]).toISOString().split('T')[0];
  return null;
}

/**
 * Extract text from a PDF buffer and find the amount and GST
 */
export async function extractDataFromPDF(buffer: Buffer): Promise<{ amount: number | null, gstNumber: string | null, buyer: string | null, date: string | null }> {
  try {
    const data = await pdfParse(buffer);
    console.log('[PDF] Extracted text:', data.text.substring(0, 300));
    return {
      amount: extractAmountFromText(data.text),
      gstNumber: extractGSTINFromText(data.text),
      buyer: extractBuyerFromText(data.text),
      date: extractDateFromText(data.text)
    };
  } catch (error) {
    console.error('[PDF] Extraction failed:', error);
    return { amount: null, gstNumber: null, buyer: null, date: null };
  }
}

/**
 * Main entry: detect file type from mimetype or filename and extract amount, GSTIN, and structural mapping.
 */
export async function extractInvoiceData(buffer: Buffer, mimetype: string, filename: string = ''): Promise<{ amount: number | null, gstNumber: string | null, buyer: string | null, date: string | null }> {
  const isPDF = mimetype === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
  const isImage = mimetype.startsWith('image/') || filename.toLowerCase().match(/\.(jpe?g|png)$/);

  if (isPDF) {
    return extractDataFromPDF(buffer);
  } else if (isImage) {
    return extractDataFromImage(buffer);
  }
  return { amount: null, gstNumber: null, buyer: null, date: null };
}
