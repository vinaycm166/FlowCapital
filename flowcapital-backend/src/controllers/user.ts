import { Response } from 'express';
import { supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { sendMail } from '../utils/mail';

const updateProfileSchema = z.object({
  name: z.string().optional(),
  companyName: z.string().optional(),
  emailNotifications: z.boolean().optional(),
  riskNotifications: z.boolean().optional(),
  twoFactorEnabled: z.boolean().optional(),
});

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { data: user, error } = await supabase
      .from('User')
      .select('id, email, name, companyName, role, emailNotifications, riskNotifications, twoFactorEnabled, kycStatus, createdAt')
      .eq('id', req.user!.userId)
      .single();

    if (error || !user) return res.status(404).json({ error: 'User not found' });
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join(', ') });

    const { data: user, error } = await supabase
      .from('User')
      .update(parsed.data)
      .eq('id', req.user!.userId)
      .select('id, email, name, companyName, role, emailNotifications, riskNotifications, twoFactorEnabled')
      .single();

    if (error) return res.status(500).json({ error: 'Update failed' });
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const changePasswordSchema = z.object({
  oldPassword: z.string(),
  newPassword: z.string().min(6),
});

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join(', ') });

    const { oldPassword, newPassword } = parsed.data;

    const { data: user } = await supabase
      .from('User')
      .select('id, password')
      .eq('id', req.user!.userId)
      .single();

    if (!user) return res.status(404).json({ error: 'User not found' });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid current password' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await supabase.from('User').update({ password: hashedPassword }).eq('id', req.user!.userId);

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/user/enterprises — list all onboarded Enterprise users
export const getEnterprises = async (req: AuthRequest, res: Response) => {
  try {
    const { data: enterprises, error } = await supabase
      .from('User')
      .select('id, name, companyName, email, kycStatus')
      .eq('role', 'ENTERPRISE')
      .order('companyName', { ascending: true });

    if (error) return res.status(500).json({ error: 'Failed to load enterprises' });
    res.status(200).json(enterprises || []);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/user/invite — invite an off-platform corporate
const inviteSchema = z.object({
  email: z.string().email(),
  invoiceNote: z.string().optional(),
});

export const inviteCorporate = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Please provide a valid email address.' });

    const { email, invoiceNote } = parsed.data;
    const invitedBy = req.user!.userId;

    // Check if already registered as ENTERPRISE
    const { data: existingUser } = await supabase
      .from('User')
      .select('id, companyName, role')
      .eq('email', email)
      .single();

    if (existingUser && existingUser.role === 'ENTERPRISE') {
      return res.status(400).json({
        error: 'This email is already registered as a Corporate. Select them from the dropdown instead.',
        existingUser: { id: existingUser.id, companyName: existingUser.companyName }
      });
    }

    const { data: invite, error } = await supabase.from('CorporateInvite').insert({
      id: crypto.randomUUID(),
      email,
      invitedBy,
      invoiceNote: invoiceNote || null,
      accepted: false,
    }).select('id').single();

    if (error) return res.status(500).json({ error: 'Failed to create invite' });

    // Fetch sender info for email template
    const { data: sender } = await supabase.from('User').select('name, companyName').eq('id', invitedBy).single();
    const senderName = sender?.companyName || sender?.name || 'A partner';

    const mailHtml = `
      <h2>You've been invited to FlowCapital!</h2>
      <p><strong>${senderName}</strong> has invited you to join FlowCapital as an Enterprise Buyer to streamline invoice verification and early payments.</p>
      ${invoiceNote ? `<p><strong>Note from ${senderName}:</strong> "${invoiceNote}"</p>` : ''}
      <br/>
      <a href="http://localhost:3000/auth/register?role=ENTERPRISE" style="background:#2563eb;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Join as Enterprise</a>
      <p>Thank you,<br/>The FlowCapital Team</p>
    `;

    await sendMail(email, `Invitation to join FlowCapital from ${senderName}`, mailHtml);

    res.status(201).json({
      success: true,
      message: `Invitation sent to ${email}. They'll receive an email to join FlowCapital as a Corporate partner.`,
      inviteId: invite.id
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
