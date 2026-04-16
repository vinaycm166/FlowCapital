import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { supabase } from '../utils/supabase';
import { z } from 'zod';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['SME', 'INVESTOR', 'ENTERPRISE']).default('SME'),
  name: z.string().optional(),
  companyName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export const signup = async (req: Request, res: Response) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join(', ') });
    }
    const { email, password, role, name, companyName } = parsed.data;

    const { data: existing } = await supabase
      .from('User')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newId = crypto.randomUUID();

    const { data: user, error: userError } = await supabase
      .from('User')
      .insert({
        id: newId,
        email,
        password: hashedPassword,
        role,
        name: name || null,
        companyName: companyName || null,
        kycStatus: false,
        fraudScore: 0,
        emailNotifications: true,
        riskNotifications: true,
        twoFactorEnabled: false,
      })
      .select('id, email, role, name, companyName')
      .single();

    if (userError) {
      console.error('Signup insert error:', userError);
      return res.status(500).json({ error: 'Failed to create account' });
    }

    // Create wallet for new user
    await supabase.from('Wallet').insert({
      id: crypto.randomUUID(),
      userId: newId,
      balance: role === 'INVESTOR' ? 100000.0 : 0.0,
    });

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join(', ') });
    }
    const { email, password } = parsed.data;

    const { data: user, error } = await supabase
      .from('User')
      .select('id, email, password, role, name, companyName, kycStatus')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(200).json({
      token,
      user: { id: user.id, email: user.email, role: user.role, name: user.name, companyName: user.companyName }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getWallet = async (req: any, res: Response) => {
  try {
    const { data: wallet } = await supabase
      .from('Wallet')
      .select('*')
      .eq('userId', req.user.userId)
      .single();
    res.status(200).json(wallet || { balance: 0 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch wallet' });
  }
};
